/**
 * Session recorder — Phase 2.
 *
 * Runtime path: after a game ends, persists one row in `sessions`, one row
 * per player in `session_players`, and updates `player_progress` (xp, level,
 * tier, counters).
 *
 * Called in PARALLEL with the existing `appendSession(...)` (history.json).
 * Either can fail without affecting the other — we keep history.json as the
 * authoritative source until Phase 6 ranking swap.
 */

import { randomUUID } from "node:crypto"
import { db, getISOWeek, normName } from "@rahoot/socket/services/db"
import { checkAndAwardBadges, BadgeUnlock } from "@rahoot/socket/services/badges"
import {
  xpForSession,
  longestStreak,
  levelFromXp,
  tierFromLevel,
} from "@rahoot/socket/services/progression"

export interface RecorderStatInput {
  realName?: string
  username?: string
  points?: number
  rank?: number
  answers?: Array<{ questionTitle?: string; isCorrect?: boolean; selectedAnswer?: string }>
}

// Resolve-or-create a player by name for session-end bookkeeping.
// Unlike identity.resolvePlayer, this has no clientId to link — it's meant
// for stats rows where we only know the display name.
function ensurePlayerByName(realName: string, username: string, now: string): string | null {
  const key = normName(realName || username || "")
  if (!key) return null

  const existing = db()
    .prepare("SELECT id FROM players WHERE LOWER(real_name) = ? LIMIT 1")
    .get(key) as { id: string } | undefined
  if (existing) return existing.id

  const id = randomUUID()
  db()
    .prepare(
      `INSERT INTO players (id, client_id, real_name, username, created_at, last_seen_at)
       VALUES (?, NULL, ?, ?, ?, ?)`
    )
    .run(id, realName.trim() || username.trim(), username.trim() || realName.trim(), now, now)
  db().prepare(`INSERT OR IGNORE INTO player_progress (player_id) VALUES (?)`).run(id)
  return id
}

export function recordSession(
  quizId: string,
  quizTitle: string,
  mode: "classic" | "solo" | "team",
  stats: RecorderStatInput[]
): { sessionId: string; awarded: Array<{ playerId: string; xpGained: number; newLevel: number; newTier: string; newBadges: BadgeUnlock[] }> } {
  const now = new Date().toISOString()
  const weekIso = getISOWeek(new Date(now))
  const monthIso = now.slice(0, 7)
  const sessionId = randomUUID()
  const awarded: Array<{ playerId: string; xpGained: number; newLevel: number; newTier: string; newBadges: BadgeUnlock[] }> = []

  const insSession = db().prepare(
    `INSERT INTO sessions (id, quiz_id, quiz_title, mode, started_at, ended_at, week_iso, month_iso)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  )
  const insSP = db().prepare(
    `INSERT INTO session_players
       (session_id, player_id, rank, points, correct, incorrect, unanswered, xp_gained, answers_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
  const getProg = db().prepare(`SELECT xp FROM player_progress WHERE player_id = ?`)
  const updProg = db().prepare(
    `UPDATE player_progress
        SET xp = ?, level = ?, tier = ?,
            longest_streak = MAX(longest_streak, ?),
            games_played   = games_played + 1,
            perfect_games  = perfect_games + ?,
            total_correct  = total_correct + ?,
            total_answered = total_answered + ?,
            last_game_at   = ?
      WHERE player_id = ?`
  )

  db().exec("BEGIN")
  try {
    insSession.run(sessionId, quizId, quizTitle, mode, now, now, weekIso, monthIso)

    for (let i = 0; i < stats.length; i++) {
      const p = stats[i] || {}
      const realName = String(p.realName || p.username || "").trim()
      const username = String(p.username || p.realName || "").trim()
      if (!realName && !username) continue

      const playerId = ensurePlayerByName(realName, username, now)
      if (!playerId) continue

      const answers = Array.isArray(p.answers) ? p.answers : []
      const correct = answers.filter(a => a?.isCorrect === true).length
      const incorrect = answers.filter(
        a => a && a.isCorrect !== true && a.selectedAnswer !== "Não respondeu"
      ).length
      const unanswered = answers.filter(a => a?.selectedAnswer === "Não respondeu").length
      const totalQ = correct + incorrect + unanswered
      const isPerfect = totalQ >= 3 && correct === totalQ
      const rank = typeof p.rank === "number" && p.rank > 0 ? p.rank : i + 1
      const pts = Math.round(Number(p.points) || 0)
      const lg = longestStreak(answers)

      const xpGained = xpForSession({
        rank,
        totalPlayers: stats.length,
        correct,
        incorrect,
        unanswered,
        points: pts,
        longestStreakInGame: lg,
      })

      insSP.run(
        sessionId,
        playerId,
        rank,
        pts,
        correct,
        incorrect,
        unanswered,
        xpGained,
        JSON.stringify(answers)
      )

      const prev = getProg.get(playerId) as { xp: number } | undefined
      const newXp = (prev?.xp ?? 0) + xpGained
      const newLevel = levelFromXp(newXp)
      const newTier = tierFromLevel(newLevel)

      updProg.run(
        newXp,
        newLevel,
        newTier,
        lg,
        isPerfect ? 1 : 0,
        correct,
        totalQ,
        now,
        playerId
      )

      const newBadges = checkAndAwardBadges(playerId)
      awarded.push({ playerId, xpGained, newLevel, newTier, newBadges })
    }
    db().exec("COMMIT")
  } catch (e) {
    db().exec("ROLLBACK")
    throw e
  }

  return { sessionId, awarded }
}

// ─── One-off backfill ──────────────────────────────────────────────────────

/**
 * Walk every `session_players` row in chronological order and award XP
 * retroactively so existing users don't land on Phase-2 release at level 1.
 *
 * Idempotent: guarded by `meta.xp_backfilled`. Only touches rows written by
 * the history migration (xp_gained = 0). After backfill, xp_gained is filled
 * in and progress totals match the full session history.
 */
export function backfillXpFromExistingSessions(): {
  updated: number
  playersTouched: number
} {
  const metaRow = db()
    .prepare("SELECT value FROM meta WHERE key = 'xp_backfilled'")
    .get() as { value: string } | undefined
  if (metaRow?.value === "1") return { updated: 0, playersTouched: 0 }

  const rows = db()
    .prepare(
      `SELECT sp.id         AS spId,
              sp.session_id  AS sessionId,
              sp.player_id   AS playerId,
              sp.rank        AS rank,
              sp.points      AS points,
              sp.correct     AS correct,
              sp.incorrect   AS incorrect,
              sp.unanswered  AS unanswered,
              sp.answers_json AS answersJson,
              s.started_at   AS startedAt
         FROM session_players sp
         JOIN sessions s ON s.id = sp.session_id
        ORDER BY s.started_at ASC, sp.id ASC`
    )
    .all() as Array<{
      spId: number
      sessionId: string
      playerId: string
      rank: number
      points: number
      correct: number
      incorrect: number
      unanswered: number
      answersJson: string | null
      startedAt: string
    }>

  if (rows.length === 0) {
    db()
      .prepare("INSERT OR REPLACE INTO meta (key, value) VALUES ('xp_backfilled', '1')")
      .run()
    return { updated: 0, playersTouched: 0 }
  }

  const sessionSize = new Map<string, number>()
  for (const r of rows) sessionSize.set(r.sessionId, (sessionSize.get(r.sessionId) || 0) + 1)

  const playerXp = new Map<string, number>()
  const playerPerfect = new Map<string, number>()
  const playerCorrect = new Map<string, number>()
  const playerAnswered = new Map<string, number>()
  const playerStreak = new Map<string, number>()
  const playerGames = new Map<string, number>()
  const playerLastGame = new Map<string, string>()

  const updSp = db().prepare(`UPDATE session_players SET xp_gained = ? WHERE id = ?`)
  const resetProg = db().prepare(
    `UPDATE player_progress
        SET xp = ?, level = ?, tier = ?,
            longest_streak = ?, games_played = ?, perfect_games = ?,
            total_correct = ?, total_answered = ?, last_game_at = ?
      WHERE player_id = ?`
  )

  db().exec("BEGIN")
  try {
    for (const r of rows) {
      let answers: Array<{ isCorrect?: boolean; selectedAnswer?: string }> = []
      if (r.answersJson) {
        try { answers = JSON.parse(r.answersJson) } catch {}
      }
      const lg = longestStreak(answers)
      const totalQ = r.correct + r.incorrect + r.unanswered
      const isPerfect = totalQ >= 3 && r.correct === totalQ

      const xpGained = xpForSession({
        rank: r.rank,
        totalPlayers: sessionSize.get(r.sessionId) || 1,
        correct: r.correct,
        incorrect: r.incorrect,
        unanswered: r.unanswered,
        points: r.points,
        longestStreakInGame: lg,
      })

      updSp.run(xpGained, r.spId)

      playerXp.set(r.playerId, (playerXp.get(r.playerId) || 0) + xpGained)
      playerPerfect.set(r.playerId, (playerPerfect.get(r.playerId) || 0) + (isPerfect ? 1 : 0))
      playerCorrect.set(r.playerId, (playerCorrect.get(r.playerId) || 0) + r.correct)
      playerAnswered.set(r.playerId, (playerAnswered.get(r.playerId) || 0) + totalQ)
      playerStreak.set(r.playerId, Math.max(playerStreak.get(r.playerId) || 0, lg))
      playerGames.set(r.playerId, (playerGames.get(r.playerId) || 0) + 1)
      playerLastGame.set(r.playerId, r.startedAt)
    }

    for (const [playerId, xp] of playerXp.entries()) {
      const level = levelFromXp(xp)
      const tier = tierFromLevel(level)
      resetProg.run(
        xp,
        level,
        tier,
        playerStreak.get(playerId) || 0,
        playerGames.get(playerId) || 0,
        playerPerfect.get(playerId) || 0,
        playerCorrect.get(playerId) || 0,
        playerAnswered.get(playerId) || 0,
        playerLastGame.get(playerId) || null,
        playerId
      )
    }

    db()
      .prepare("INSERT OR REPLACE INTO meta (key, value) VALUES ('xp_backfilled', '1')")
      .run()
    db().exec("COMMIT")
  } catch (e) {
    db().exec("ROLLBACK")
    throw e
  }

  return { updated: rows.length, playersTouched: playerXp.size }
}
