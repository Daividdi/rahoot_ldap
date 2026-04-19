import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import { resolve, dirname } from 'path'
import { randomUUID } from 'crypto'

const inContainerPath = process.env.CONFIG_PATH
const getPath = (p = '') =>
  inContainerPath ? resolve(inContainerPath, p) : resolve(process.cwd(), '../../config', p)

const HISTORY_FILE = () => getPath('history.json')

// ─── Types ───────────────────────────────────────────────────────────────────

export interface SessionPlayer {
  realName: string
  username: string
  rank: number
  points: number
  correct: number
  incorrect: number
  unanswered: number
  answers: Array<{ questionTitle: string; isCorrect: boolean; selectedAnswer: string }>
}

export interface Session {
  id: string
  quizId: string
  quizTitle: string
  date: string   // ISO 8601
  month: string  // "2026-04"
  players: SessionPlayer[]
}

export interface HistoryFile {
  sessions: Session[]
}

export interface LeaderboardEntry {
  realName: string
  points: number      // total points this month
  avgPoints: number   // average per session (rounded)
  sessions: number    // games played this month
  correct: number     // total correct answers
}

// ─── I/O ─────────────────────────────────────────────────────────────────────

function readHistory(): HistoryFile {
  try {
    const f = HISTORY_FILE()
    if (existsSync(f)) return JSON.parse(readFileSync(f, 'utf-8'))
  } catch (_) {}
  return { sessions: [] }
}

function writeHistory(data: HistoryFile): void {
  const f = HISTORY_FILE()
  try { mkdirSync(dirname(f), { recursive: true }) } catch (_) {}
  writeFileSync(f, JSON.stringify(data, null, 2))
}

// ─── Public API ──────────────────────────────────────────────────────────────

/** Called after every game ends (from manager:saveSessionStats handler). */
export function appendSession(quizId: string, quizTitle: string, stats: any[]): void {
  const history = readHistory()
  const now = new Date().toISOString()
  const month = now.slice(0, 7)

  const players: SessionPlayer[] = stats.map((p, i) => {
    const answers: any[] = Array.isArray(p.answers) ? p.answers : []
    const correct    = answers.filter(a => a.isCorrect === true).length
    const incorrect  = answers.filter(a => !a.isCorrect && a.selectedAnswer !== 'Não respondeu').length
    const unanswered = answers.filter(a => a.selectedAnswer === 'Não respondeu').length
    return {
      realName:  String(p.realName  || p.username || '').trim(),
      username:  String(p.username  || '').trim(),
      rank:      i + 1,
      points:    Math.round(p.points || 0),
      correct,
      incorrect,
      unanswered,
      answers,
    }
  })

  history.sessions.push({ id: randomUUID(), quizId, quizTitle, date: now, month, players })

  if (history.sessions.length > 1000) history.sessions = history.sessions.slice(-1000)

  writeHistory(history)
}

const norm = (s: string) => s.toLowerCase().trim().replace(/\s+/g, ' ')

/** Return the last 20 sessions a player participated in (most recent first). */
export function getPlayerHistory(realName: string) {
  if (!realName.trim()) return []
  const key = norm(realName)
  const history = readHistory()
  const result: Array<Omit<Session, 'players'> & { player: SessionPlayer }> = []

  for (const session of history.sessions) {
    const player = session.players.find(
      p => norm(p.realName) === key || norm(p.username) === key
    )
    if (player) {
      const { players: _p, ...meta } = session
      result.push({ ...meta, player })
    }
  }

  return result.slice(-20).reverse()
}

/**
 * Return top-10 players for the current calendar month.
 *
 * @param minSessions  Only include players who played at least this many games (default 1)
 * @param sortBy       "total"   → rank by sum of points  (default)
 *                     "average" → rank by avg points per session
 *                     "balanced"→ avg × log2(sessions + 1)  (rewards both skill & participation)
 */
export function getMonthlyLeaderboard(
  minSessions = 1,
  sortBy: 'total' | 'average' | 'balanced' = 'total'
): LeaderboardEntry[] {
  const history = readHistory()
  const month = new Date().toISOString().slice(0, 7)
  const agg: Record<string, { realName: string; points: number; sessions: number; correct: number }> = {}

  history.sessions
    .filter(s => s.month === month)
    .forEach(s => {
      s.players.forEach(p => {
        const key = norm(p.realName || p.username)
        if (!key) return
        if (!agg[key]) agg[key] = { realName: p.realName || p.username, points: 0, sessions: 0, correct: 0 }
        agg[key].points   += p.points
        agg[key].sessions += 1
        agg[key].correct  += p.correct
      })
    })

  const score = (e: typeof agg[string]): number => {
    const avg = e.sessions > 0 ? e.points / e.sessions : 0
    if (sortBy === 'average')  return avg
    if (sortBy === 'balanced') return avg * Math.log2(e.sessions + 1)
    return e.points  // 'total'
  }

  return Object.values(agg)
    .filter(e => e.sessions >= minSessions)
    .map(e => ({
      realName:  e.realName,
      points:    e.points,
      avgPoints: Math.round(e.sessions > 0 ? e.points / e.sessions : 0),
      sessions:  e.sessions,
      correct:   e.correct,
    }))
    .sort((a, b) => score(
      { realName: b.realName, points: b.points, sessions: b.sessions, correct: b.correct }
    ) - score(
      { realName: a.realName, points: a.points, sessions: a.sessions, correct: a.correct }
    ))
    .slice(0, 10)
}
