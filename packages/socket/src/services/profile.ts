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
import { getPlayerBadges, BADGE_CATALOG_PUBLIC } from "@rahoot/socket/services/badges"

export interface ProfilePayload {
  player: {
    id: string
    realName: string
    username: string
    avatarJson: string | null
    avatarKind: "dicebear" | "3d"
    avatar3dId: string | null
    avatar3d: { id: string; icon: string; vrm: string; displayName: string } | null
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
  modeStats: {
    classic: { games: number; points: number; correct: number; answered: number }
    solo:    { games: number; points: number; correct: number; answered: number }
    team:    { games: number; points: number; correct: number; answered: number }
  }
  badges: Array<{ id: string; label: string; description: string; emoji: string; category: string; unlockedAt: string }>
  catalog: typeof BADGE_CATALOG_PUBLIC
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
  const row = db()
    .prepare(
      `SELECT id, real_name AS realName, username, avatar_json AS avatarJson,
              avatar_kind AS avatarKind, avatar_3d_id AS avatar3dId,
              created_at AS createdAt, last_seen_at AS lastSeenAt
         FROM players WHERE id = ?`
    )
    .get(id) as any
  if (!row) return null
  let avatar3d: { id: string; icon: string; vrm: string; displayName: string } | null = null
  if (row.avatarKind === "3d" && row.avatar3dId) {
    try {
      const mod = require("@rahoot/socket/services/avatars3d")
      const entry = mod.getAvatarById(row.avatar3dId)
      if (entry) {
        avatar3d = { id: entry.id, icon: entry.icon, vrm: entry.vrm, displayName: entry.displayName }
      }
    } catch {}
  }
  return {
    id: row.id,
    realName: row.realName,
    username: row.username,
    avatarJson: row.avatarJson,
    avatarKind: row.avatarKind === "3d" ? "3d" : "dicebear",
    avatar3dId: row.avatar3dId,
    avatar3d,
    createdAt: row.createdAt,
    lastSeenAt: row.lastSeenAt,
  }
}

function getModeStats(playerId: string) {
  const rows = db()
    .prepare(
      `SELECT s.mode AS mode,
              COUNT(*)          AS games,
              SUM(sp.points)    AS points,
              SUM(sp.correct)   AS correct,
              SUM(sp.correct + sp.incorrect) AS answered
         FROM session_players sp
         JOIN sessions s ON s.id = sp.session_id
        WHERE sp.player_id = ?
        GROUP BY s.mode`
    )
    .all(playerId) as Array<{ mode: string; games: number; points: number; correct: number; answered: number }>
  const empty = { games: 0, points: 0, correct: 0, answered: 0 }
  const out = { classic: { ...empty }, solo: { ...empty }, team: { ...empty } }
  for (const r of rows) {
    const bucket = (r.mode === "solo" || r.mode === "team") ? r.mode : "classic"
    out[bucket] = {
      games: r.games | 0,
      points: r.points | 0,
      correct: r.correct | 0,
      answered: r.answered | 0,
    }
  }
  return out
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
        WHERE s.${column} = ? AND s.mode = 'classic'
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
    const empty = { games: 0, points: 0, correct: 0, answered: 0 }
    return { player: null, progression: null, recentSessions: [], monthly: null, weekly: null, modeStats: { classic: empty, solo: empty, team: empty }, badges: [], catalog: BADGE_CATALOG_PUBLIC }
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
    modeStats: getModeStats(id),
    badges: getPlayerBadges(id),
    catalog: BADGE_CATALOG_PUBLIC,
  }
}
