/**
 * Profile service — Phase 3.
 *
 * Reads aggregated player data for the Home/Profile screen:
 *   - Identity (realName, username, avatar)
 *   - Progression (xp, level, tier, % to next level, counters)
 *   - Recent sessions (last 10)
 *   - Current month & week ranks
 */

import { db, normName, getISOWeek } from "@rahoot/socket/services/db"
import { progressInLevel } from "@rahoot/socket/services/progression"

export interface ProfilePayload {
  player: {
    id: string
    realName: string
    username: string
    avatarJson: string | null
    createdAt: string
    lastSeenAt: string
  } | null
  progression: {
    xp: number
    level: number
    tier: string
    xpIntoLevel: number
    xpNeededForNext: number
    pct: number
    longestStreak: number
    gamesPlayed: number
    perfectGames: number
    totalCorrect: number
    totalAnswered: number
    lastGameAt: string | null
  } | null
  recentSessions: Array<{
    sessionId: string
    quizId: string
    quizTitle: string
    mode: string
    startedAt: string
    rank: number
    points: number
    correct: number
    incorrect: number
    unanswered: number
    xpGained: number
  }>
  monthly: { rank: number | null; points: number; games: number } | null
  weekly: { rank: number | null; points: number; games: number } | null
}

function findPlayerId(realName: string): string | null {
  const key = normName(realName)
  if (!key) return null
  const row = db()
    .prepare("SELECT id FROM players WHERE LOWER(real_name) = ? LIMIT 1")
    .get(key) as { id: string } | undefined
  return row?.id ?? null
}

function getPlayerRecord(id: string) {
  return db()
    .prepare(
      `SELECT id, real_name AS realName, username, avatar_json AS avatarJson,
              created_at AS createdAt, last_seen_at AS lastSeenAt
         FROM players WHERE id = ?`
    )
    .get(id) as ProfilePayload["player"]
}

function getProgression(id: string) {
  const row = db()
    .prepare(
      `SELECT xp, level, tier,
              longest_streak AS longestStreak,
              games_played AS gamesPlayed,
              perfect_games AS perfectGames,
              total_correct AS totalCorrect,
              total_answered AS totalAnswered,
              last_game_at AS lastGameAt
         FROM player_progress WHERE player_id = ?`
    )
    .get(id) as any
  if (!row) return null
  const p = progressInLevel(row.xp)
  return {
    xp: row.xp,
    level: p.level,
    tier: p.tier,
    xpIntoLevel: p.xpIntoLevel,
    xpNeededForNext: p.xpNeededForNext,
    pct: p.pct,
    longestStreak: row.longestStreak,
    gamesPlayed: row.gamesPlayed,
    perfectGames: row.perfectGames,
    totalCorrect: row.totalCorrect,
    totalAnswered: row.totalAnswered,
    lastGameAt: row.lastGameAt,
  }
}

function getRecentSessions(playerId: string, limit = 10) {
  return db()
    .prepare(
      `SELECT s.id         AS sessionId,
              s.quiz_id    AS quizId,
              s.quiz_title AS quizTitle,
              s.mode       AS mode,
              s.started_at AS startedAt,
              sp.rank      AS rank,
              sp.points    AS points,
              sp.correct   AS correct,
              sp.incorrect AS incorrect,
              sp.unanswered AS unanswered,
              sp.xp_gained AS xpGained
         FROM session_players sp
         JOIN sessions s ON s.id = sp.session_id
        WHERE sp.player_id = ?
        ORDER BY s.started_at DESC
        LIMIT ?`
    )
    .all(playerId, limit) as ProfilePayload["recentSessions"]
}

function getPeriodStanding(playerId: string, column: "week_iso" | "month_iso", value: string) {
  const rows = db()
    .prepare(
      `SELECT sp.player_id AS playerId,
              SUM(sp.points) AS points,
              COUNT(*) AS games
         FROM session_players sp
         JOIN sessions s ON s.id = sp.session_id
        WHERE s.${column} = ?
        GROUP BY sp.player_id
        ORDER BY points DESC`
    )
    .all(value) as Array<{ playerId: string; points: number; games: number }>

  const idx = rows.findIndex(r => r.playerId === playerId)
  if (idx < 0) return { rank: null, points: 0, games: 0 }
  return { rank: idx + 1, points: rows[idx].points, games: rows[idx].games }
}

export function getProfile(realName: string): ProfilePayload {
  const id = findPlayerId(realName)
  if (!id) {
    return { player: null, progression: null, recentSessions: [], monthly: null, weekly: null }
  }
  const now = new Date()
  const weekIso = getISOWeek(now)
  const monthIso = now.toISOString().slice(0, 7)

  return {
    player: getPlayerRecord(id),
    progression: getProgression(id),
    recentSessions: getRecentSessions(id, 10),
    monthly: getPeriodStanding(id, "month_iso", monthIso),
    weekly: getPeriodStanding(id, "week_iso", weekIso),
  }
}
