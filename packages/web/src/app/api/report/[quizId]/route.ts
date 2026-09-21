import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { DatabaseSync } from 'node:sqlite';

export async function GET(request: Request, { params }: { params: Promise<{ quizId: string }> }) {
  try {
    // The report contains every player's answers. Keep the endpoint behind
    // the same manager password used by the Rahoot admin area.
    const managerPassword = request.headers.get("x-manager-password") || ""
    const configRoot = process.env.CONFIG_PATH || path.join(process.cwd(), "../../config")
    const gameConfigPath = path.join(configRoot, "game.json")
    let configuredPassword = ""

    try {
      configuredPassword = JSON.parse(fs.readFileSync(gameConfigPath, "utf-8")).managerPassword || ""
    } catch {
      return NextResponse.json({ error: "Manager authentication is unavailable" }, { status: 503 })
    }

    if (!managerPassword || !configuredPassword || managerPassword !== configuredPassword) {
      return NextResponse.json({ error: "Manager authentication required" }, { status: 401 })
    }

    const resolvedParams = await params
    const quizId = resolvedParams.quizId.endsWith('.json') ? resolvedParams.quizId : resolvedParams.quizId + '.json';
    
    // O Next.js roda dentro do container na pasta /app/packages/web
    // Então voltamos duas pastas para achar o config/quizz
    const filePath = path.join(process.cwd(), '../../config/quizz', quizId);
    
    if (!fs.existsSync(filePath)) {
      return NextResponse.json({ error: `Quiz file not found inside container at: ${filePath}` }, { status: 404 });
    }
    
    const rawData = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

    // Apply player name corrections
    const namesPath = path.join(process.cwd(), '../../config/player-names.json');
    let nameCorrections: Record<string, string> = {};
    try {
      if (fs.existsSync(namesPath)) {
        nameCorrections = JSON.parse(fs.readFileSync(namesPath, 'utf-8'));
      }
    } catch {}

    if (rawData.lastSessionStats && Object.keys(nameCorrections).length > 0) {
      rawData.lastSessionStats = rawData.lastSessionStats.map((player: any) => {
        const key = player.clientId || player.realName || player.username || '';
        if (key && nameCorrections[key]) {
          return { ...player, realName: nameCorrections[key] };
        }
        return player;
      });
    }

    // ── Turmas anteriores ────────────────────────────────────────────────
    //
    // `lastSessionStats` guarda UMA sessao: a proxima turma sobrescreve a
    // anterior no arquivo do quiz. Foi o que a Malasia relatou — reaproveitar o
    // quiz para um novo grupo apagava o resultado do grupo passado.
    //
    // Os dados nunca se perderam: cada sessao continua inteira no banco, em
    // `sessions` + `session_players`. O que faltava era o relatorio saber
    // procurar la. Entao esta rota devolve a LISTA de sessoes, e quando o
    // pedido nomeia uma delas ela e reconstruida no MESMO formato de
    // `lastSessionStats` — assim as 742 linhas da pagina do relatorio seguem
    // funcionando sem alteracao, para qualquer turma.
    const url = new URL(request.url);
    const sessaoPedida = url.searchParams.get('session');
    const idSemJson = quizId.replace(/\.json$/, '');

    try {
      const dbPath = path.join(process.cwd(), '../../config/rahoot.db');
      if (fs.existsSync(dbPath)) {
        // Somente leitura: este processo nunca escreve no banco do jogo.
        const db = new DatabaseSync(dbPath, { readOnly: true });

        rawData.sessions = db.prepare(
          `SELECT s.id, s.started_at AS startedAt, s.ended_at AS endedAt,
                  COUNT(sp.id) AS players
             FROM sessions s
             LEFT JOIN session_players sp ON sp.session_id = s.id
            WHERE s.mode = 'classic' AND (s.quiz_id = ? OR s.quiz_id = ?)
            GROUP BY s.id
            ORDER BY s.started_at DESC`
        ).all(quizId, idSemJson);

        // ── Solo, como mais uma "turma" ──────────────────────────────────
        //
        // Uma tentativa solo ja e uma sessao (`mode='solo'`) com as respostas
        // por pergunta em `session_players.answers_json` — o mesmo material das
        // sessoes ao vivo. Faltava so o relatorio oferece-las.
        //
        // Entram como UMA opcao agregada, nao uma por tentativa: um quiz com
        // cinquenta pessoas praticando encheria o seletor e ninguem acharia as
        // turmas ao vivo no meio.
        const resumoSolo = db.prepare(
          `SELECT COUNT(*) AS attempts, COUNT(DISTINCT sp.player_id) AS people,
                  MIN(s.started_at) AS first, MAX(s.started_at) AS last
             FROM sessions s
             JOIN session_players sp ON sp.session_id = s.id
            WHERE s.mode = 'solo' AND (s.quiz_id = ? OR s.quiz_id = ?)`
        ).get(quizId, idSemJson) as any;

        if (resumoSolo && Number(resumoSolo.attempts) > 0) {
          // Duas visoes do solo, nesta ordem — a media entra PRIMEIRO e por
          // isso vira o padrao quando o quiz so foi jogado em solo:
          //   solo:avg  -> uma linha por PESSOA = media das tentativas dela
          //   solo:all  -> uma linha por TENTATIVA (evolucao, detalhe por pergunta)
          // A Malasia pediu "average score": com o limite de tentativas, a nota
          // do aluno e a media do que ele fez.
          rawData.sessions = [
            { id: 'solo:avg', kind: 'solo_avg', startedAt: resumoSolo.last,
              endedAt: resumoSolo.last, players: Number(resumoSolo.people) },
            { id: 'solo:all', kind: 'solo', startedAt: resumoSolo.last,
              endedAt: resumoSolo.last, players: Number(resumoSolo.attempts) },
            ...(rawData.sessions || []),
          ];
        }

        // No explicit session and the quiz file has no lastSessionStats
        // (quiz only ever played in solo): fall back to the most recent
        // session in the DB so the report is never blank when data exists.
        let sessaoEfetiva = sessaoPedida;
        if (!sessaoEfetiva && (!rawData.lastSessionStats || rawData.lastSessionStats.length === 0) && rawData.sessions && rawData.sessions.length > 0) {
          sessaoEfetiva = rawData.sessions[0].id;
        }
        if (sessaoEfetiva === 'solo:avg') {
          // Uma linha por PESSOA = media das tentativas dela.
          //
          // `accuracy` e a media das acuracias POR TENTATIVA (correct sobre
          // respondidas), com cada tentativa pesando igual — que e o que
          // "media" quer dizer. Como toda tentativa do mesmo quiz tem o mesmo
          // numero de perguntas, isso coincide com o total agregado na pratica.
          //
          // Sem detalhe por pergunta (`answers: []`): uma media nao mapeia
          // questao a questao. Quem quiser isso troca para "All attempts".
          const linhas = db.prepare(
            `SELECT p.client_id AS clientId, p.real_name AS realName, p.username AS username,
                    p.avatar_3d_id AS avatar3dId,
                    COUNT(*)        AS attempts,
                    AVG(sp.points)  AS avgPoints,
                    AVG(sp.correct) AS avgCorrect,
                    AVG(sp.unanswered) AS avgUnanswered,
                    AVG(100.0 * sp.correct / MAX(1, sp.correct + sp.incorrect + sp.unanswered)) AS avgAccuracy
               FROM sessions s
               JOIN session_players sp ON sp.session_id = s.id
               JOIN players p ON p.id = sp.player_id
              WHERE s.mode = 'solo' AND (s.quiz_id = ? OR s.quiz_id = ?)
              GROUP BY sp.player_id
              ORDER BY avgPoints DESC`
          ).all(quizId, idSemJson) as any[];

          rawData.lastSessionStats = linhas.map((l) => {
            const nome = nameCorrections[l.clientId || l.realName || ''] || l.realName;
            const tentativas = Number(l.attempts) || 0;
            // O sufixo so aparece para quem tentou mais de uma vez — deixa
            // explicito que a linha e uma media, nao uma tentativa unica.
            const rotulo = tentativas > 1 ? `${nome} (avg of ${tentativas})` : nome;
            return {
              clientId: l.clientId,
              username: rotulo,
              realName: rotulo,
              avatarUrl: l.avatar3dId ? `/api/avatar3d/r3/icons/${l.avatar3dId}` : null,
              points: Math.round(Number(l.avgPoints) || 0),
              // Agregados EXPLICITOS: a pagina os usa direto quando existem, em
              // vez de recomputar a partir de `answers` (aqui vazio).
              accuracy: Math.round(Number(l.avgAccuracy) || 0),
              correctCount: Math.round(Number(l.avgCorrect) || 0),
              unanswered: Math.round(Number(l.avgUnanswered) || 0),
              attemptsCount: tentativas,
              answers: [],
              connected: false,
            };
          });
          rawData.selectedSession = 'solo:avg';
        } else if (sessaoEfetiva === 'solo:all') {
          // Uma linha por TENTATIVA, nao por pessoa. Quem praticou tres vezes
          // aparece tres vezes, com o numero da tentativa ao lado do nome —
          // assim da para ver a evolucao, e nada e escondido. O preco, que vale
          // dizer em voz alta: quem tentou mais pesa mais nas estatisticas por
          // pergunta.
          const linhas = db.prepare(
            `SELECT p.client_id AS clientId, p.real_name AS realName, p.username AS username,
                    p.avatar_3d_id AS avatar3dId, sp.points AS points, sp.answers_json AS answersJson,
                    ROW_NUMBER() OVER (PARTITION BY sp.player_id ORDER BY s.started_at) AS tentativa,
                    COUNT(*)     OVER (PARTITION BY sp.player_id)                       AS total
               FROM sessions s
               JOIN session_players sp ON sp.session_id = s.id
               JOIN players p ON p.id = sp.player_id
              WHERE s.mode = 'solo' AND (s.quiz_id = ? OR s.quiz_id = ?)
              ORDER BY sp.points DESC`
          ).all(quizId, idSemJson) as any[];

          rawData.lastSessionStats = linhas.map((l) => {
            let answers: any[] = [];
            try { answers = JSON.parse(l.answersJson || '[]'); } catch { answers = []; }
            const nome = nameCorrections[l.clientId || l.realName || ''] || l.realName;
            return {
              clientId: l.clientId,
              // Os DOIS campos recebem a mesma string, e isso e proposital.
              //
              // A tela imprime `username` em destaque e so mostra `realName`
              // embaixo QUANDO os dois diferem. Iguais, sai uma linha limpa com
              // nome e tentativa; diferentes, o nome aparecia duas vezes. E o
              // `username` e o que vai para o Excel e o PDF, entao o numero da
              // tentativa precisa estar nele de qualquer forma.
              //
              // O sufixo so existe para quem tentou mais de uma vez.
              username: Number(l.total) > 1 ? `${nome} (${l.tentativa}/${l.total})` : nome,
              realName: Number(l.total) > 1 ? `${nome} (${l.tentativa}/${l.total})` : nome,
              avatarUrl: l.avatar3dId ? `/api/avatar3d/r3/icons/${l.avatar3dId}` : null,
              points: l.points,
              answers,
              connected: false,
            };
          });
          rawData.selectedSession = 'solo:all';
        } else if (sessaoEfetiva) {
          const linhas = db.prepare(
            `SELECT p.client_id AS clientId, p.real_name AS realName, p.username AS username,
                    p.avatar_3d_id AS avatar3dId, sp.points AS points, sp.rank AS rank,
                    sp.answers_json AS answersJson
               FROM session_players sp
               JOIN players p ON p.id = sp.player_id
              WHERE sp.session_id = ?
              ORDER BY sp.rank ASC`
          ).all(sessaoEfetiva) as any[];

          rawData.lastSessionStats = linhas.map((l) => {
            let answers: any[] = [];
            try { answers = JSON.parse(l.answersJson || '[]'); } catch { answers = []; }
            return {
              clientId: l.clientId,
              username: l.username,
              realName: nameCorrections[l.clientId || l.realName || ''] || l.realName,
              avatarUrl: l.avatar3dId ? `/api/avatar3d/r3/icons/${l.avatar3dId}` : null,
              points: l.points,
              answers,
              connected: false,
            };
          });
          rawData.selectedSession = sessaoPedida;
        }
        db.close();
      }
    } catch (e) {
      // O historico e um extra: se o banco nao abrir, o relatorio da ultima
      // sessao (que vem do arquivo) tem de continuar funcionando.
      rawData.sessionsError = String((e as any)?.message || e).slice(0, 120);
    }

    return NextResponse.json(rawData);
  } catch (error: any) {
    return NextResponse.json({ error: 'Server error: ' + error.message }, { status: 500 });
  }
}
