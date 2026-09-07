import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { DatabaseSync } from 'node:sqlite';

export const dynamic = 'force-dynamic';

const DEFAULT_MAX_ATTEMPTS = 3;

type Attempt = {
  attempt: number;
  points: number;
  correct: number;
  incorrect: number;
  unanswered: number;
  total: number;
  /** 0-100, rounded to two decimals. The grade a training record should carry. */
  percent: number;
  endedAt: string;
};

/**
 * Solo results for one quiz, keyed by AD account.
 *
 * Exists so Moodle can put a Rahoot score in the gradebook without guessing who
 * played: both systems authenticate against the same directory, so the account
 * here and `user.username` there are the same string.
 *
 * Grouped by account rather than by player row on purpose — an AD rename can
 * leave one person with two player rows, and the training record has to survive
 * that. Attempts whose player was never linked to an account are not silently
 * dropped: they come back under `unattributed` so the trainer can see the gap.
 */
function toAttempt(r: any): Attempt {
  const total = (r.correct || 0) + (r.incorrect || 0) + (r.unanswered || 0);
  return {
    attempt: r.attempt_number,
    points: r.points,
    correct: r.correct,
    incorrect: r.incorrect,
    unanswered: r.unanswered,
    total,
    percent: total > 0 ? Math.round((r.correct / total) * 10000) / 100 : 0,
    endedAt: r.ended_at,
  };
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);

    // Optional shared secret. Unset means open, which is how every other route
    // here behaves; set it and this one alone starts demanding the header, so
    // per-person scores can be closed off without touching the rest.
    const expected = (process.env.SOLO_RESULTS_TOKEN || '').trim();
    if (expected) {
      const got = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
      if (got !== expected) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
    }

    const rawQuiz = (url.searchParams.get('quiz') || '').trim();
    if (!rawQuiz || !/^[A-Za-z0-9._-]+$/.test(rawQuiz)) {
      return NextResponse.json({ error: 'quiz parameter required' }, { status: 400 });
    }
    const quizId = rawQuiz.endsWith('.json') ? rawQuiz : `${rawQuiz}.json`;
    const contaFiltro = (url.searchParams.get('account') || '').trim().toLowerCase();

    // Attempts were written with the id as stored in the quiz file, which has
    // varied between bare and .json over the life of the app. Match both.
    const semJson = quizId.replace(/\.json$/, '');

    const dbPath = path.join(process.cwd(), '../../config/rahoot.db');
    if (!fs.existsSync(dbPath)) {
      return NextResponse.json({ error: 'Database not found' }, { status: 404 });
    }

    let maxAttempts = DEFAULT_MAX_ATTEMPTS;
    let subject = semJson;
    try {
      const arq = path.join(process.cwd(), '../../config/quizz', quizId);
      if (fs.existsSync(arq)) {
        const j = JSON.parse(fs.readFileSync(arq, 'utf-8'));
        subject = j.subject || subject;
        if (Number(j?.solo?.maxAttempts) > 0) maxAttempts = Number(j.solo.maxAttempts);
      }
    } catch {}

    const db = new DatabaseSync(dbPath, { readOnly: true });
    let rows: any[] = [];
    try {
      rows = db
        .prepare(
          `SELECT p.account AS account, p.real_name AS name,
                  a.attempt_number, a.points, a.correct, a.incorrect, a.unanswered, a.ended_at
             FROM solo_attempts a
             JOIN players p ON p.id = a.player_id
            WHERE (a.quiz_id = ? OR a.quiz_id = ?)
            ORDER BY a.ended_at ASC`
        )
        .all(quizId, semJson) as any[];
    } finally {
      db.close();
    }

    type Agrupado = { account: string; name: string; attempts: Attempt[] };
    const porConta = new Map<string, Agrupado>();
    const semConta = new Map<string, number>();

    for (const r of rows) {
      const conta = (r.account || '').trim().toLowerCase();
      if (!conta) {
        semConta.set(r.name, (semConta.get(r.name) || 0) + 1);
        continue;
      }
      if (contaFiltro && conta !== contaFiltro) continue;
      const atual: Agrupado = porConta.get(conta) ?? { account: conta, name: r.name, attempts: [] };
      atual.name = r.name; // the most recent row wins, so a rename shows the new name
      atual.attempts.push(toAttempt(r));
      porConta.set(conta, atual);
    }

    const results = [...porConta.values()].map((p) => {
      // Best by percentage, with points breaking a tie: two runs that got the
      // same answers right differ only in how fast they were.
      const best = [...p.attempts].sort(
        (a, b) => b.percent - a.percent || b.points - a.points
      )[0];
      const last = p.attempts[p.attempts.length - 1];
      return {
        account: p.account,
        name: p.name,
        attempts: p.attempts.length,
        best,
        last,
      };
    });
    results.sort((a, b) => b.best.percent - a.best.percent);

    return NextResponse.json({
      quiz: quizId,
      subject,
      maxAttempts,
      count: results.length,
      results,
      unattributed: [...semConta.entries()].map(([name, attempts]) => ({ name, attempts })),
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Internal error' }, { status: 500 });
  }
}
