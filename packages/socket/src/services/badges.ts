/**
 * Badges — Phase 4.
 *
 * 30-badge catalog with pure-SQL unlock checks. Badges are awarded
 * post-game (from sessionRecorder) and backfilled once at startup against
 * all historical sessions.
 *
 * `player_badges` has UNIQUE(player_id, badge_id), so re-running the
 * checker is safe: INSERT OR IGNORE + an in-set guard keep it idempotent.
 */

import { db } from "@rahoot/socket/services/db"
import { levelFromXp } from "@rahoot/socket/services/progression"

export type BadgeCategory = "participation" | "skill" | "streak" | "tier" | "variety" | "rank"

export interface BadgeDef {
  id: string
  label: string
  description: string
  emoji: string
  category: BadgeCategory
  check: (playerId: string) => boolean
}

// ─── Reusable query helpers (lazy, use db() not captured at import time) ───

function progress(playerId: string) {
  return db()
    .prepare(
      `SELECT xp, level, tier, longest_streak AS longestStreak,
              games_played AS gamesPlayed, perfect_games AS perfectGames,
              total_correct AS totalCorrect, total_answered AS totalAnswered
         FROM player_progress WHERE player_id = ?`
    )
    .get(playerId) as {
      xp: number; level: number; tier: string
      longestStreak: number; gamesPlayed: number; perfectGames: number
      totalCorrect: number; totalAnswered: number
    } | undefined
}

function winsFor(playerId: string): number {
  const r = db()
    .prepare(`SELECT COUNT(*) AS n FROM session_players WHERE player_id = ? AND rank = 1`)
    .get(playerId) as { n: number }
  return r.n
}

function podiumsFor(playerId: string): number {
  const r = db()
    .prepare(`SELECT COUNT(*) AS n FROM session_players WHERE player_id = ? AND rank BETWEEN 1 AND 3`)
    .get(playerId) as { n: number }
  return r.n
}

function distinctQuizCount(playerId: string): number {
  const r = db()
    .prepare(
      `SELECT COUNT(DISTINCT s.quiz_id) AS n
         FROM session_players sp JOIN sessions s ON s.id = sp.session_id
        WHERE sp.player_id = ?`
    )
    .get(playerId) as { n: number }
  return r.n
}

function maxGamesInSingleDay(playerId: string): number {
  const r = db()
    .prepare(
      `SELECT COUNT(*) AS n
         FROM session_players sp JOIN sessions s ON s.id = sp.session_id
        WHERE sp.player_id = ?
        GROUP BY substr(s.started_at, 1, 10)
        ORDER BY n DESC LIMIT 1`
    )
    .get(playerId) as { n: number } | undefined
  return r?.n ?? 0
}

// Best rank (smallest) across any period — `column` is week_iso or month_iso.
// Returns { bestRank: number | null }. We treat any closed period the same
// as the current one; easier to grok than "only past months".
function bestRankInAnyPeriod(playerId: string, column: "week_iso" | "month_iso"): number {
  const periodsRaw = db()
    .prepare(`SELECT DISTINCT ${column} AS p FROM sessions`)
    .all() as Array<{ p: string }>
  let best = Infinity
  for (const { p } of periodsRaw) {
    const rows = db()
      .prepare(
        `SELECT sp.player_id AS pid, SUM(sp.points) AS pts
           FROM session_players sp JOIN sessions s ON s.id = sp.session_id
          WHERE s.${column} = ?
          GROUP BY sp.player_id
          ORDER BY pts DESC`
      )
      .all(p) as Array<{ pid: string; pts: number }>
    const idx = rows.findIndex(r => r.pid === playerId)
    if (idx >= 0 && idx + 1 < best) best = idx + 1
  }
  return best === Infinity ? 0 : best
}

function hasLevel(playerId: string, minLevel: number): boolean {
  const p = progress(playerId)
  if (!p) return false
  const level = p.xp > 0 ? levelFromXp(p.xp) : p.level
  return level >= minLevel
}

// ─── Catalog (30) ───────────────────────────────────────────────────────────

export const BADGES: BadgeDef[] = [
  // Participation (6)
  { id: "welcome",       label: "First game",      description: "Played your first quiz", emoji: "🎉", category: "participation",
    check: id => (progress(id)?.gamesPlayed ?? 0) >= 1 },
  { id: "first_steps",   label: "First steps",   description: "Played 5 quizzes",             emoji: "👣", category: "participation",
    check: id => (progress(id)?.gamesPlayed ?? 0) >= 5 },
  { id: "dedicated",     label: "Dedicated",           description: "Played 10 quizzes",            emoji: "📚", category: "participation",
    check: id => (progress(id)?.gamesPlayed ?? 0) >= 10 },
  { id: "veteran",       label: "Veteran",           description: "Played 25 quizzes",            emoji: "🎖️", category: "participation",
    check: id => (progress(id)?.gamesPlayed ?? 0) >= 25 },
  { id: "legend",        label: "Legend",              description: "Played 50 quizzes",            emoji: "🏅", category: "participation",
    check: id => (progress(id)?.gamesPlayed ?? 0) >= 50 },
  { id: "myth_maker",    label: "Myth",               description: "Played 100 quizzes",           emoji: "🌟", category: "participation",
    check: id => (progress(id)?.gamesPlayed ?? 0) >= 100 },

  // Skill — perfect games (3)
  { id: "first_perfect", label: "Perfect round",           description: "First flawless game",     emoji: "✨", category: "skill",
    check: id => (progress(id)?.perfectGames ?? 0) >= 1 },
  { id: "flawless_five", label: "Five perfects",    description: "5 flawless games",           emoji: "💫", category: "skill",
    check: id => (progress(id)?.perfectGames ?? 0) >= 5 },
  { id: "perfection",    label: "Perfection",          description: "15 flawless games",          emoji: "🌠", category: "skill",
    check: id => (progress(id)?.perfectGames ?? 0) >= 15 },

  // Streaks (4)
  { id: "streak_3",      label: "On fire",          description: "3 correct in a row",          emoji: "🔥", category: "streak",
    check: id => (progress(id)?.longestStreak ?? 0) >= 3 },
  { id: "streak_5",      label: "Explosion",           description: "5 correct in a row",          emoji: "💥", category: "streak",
    check: id => (progress(id)?.longestStreak ?? 0) >= 5 },
  { id: "streak_8",      label: "Inferno",           description: "8 correct in a row",          emoji: "🎇", category: "streak",
    check: id => (progress(id)?.longestStreak ?? 0) >= 8 },
  { id: "streak_10",     label: "Unstoppable",          description: "10 correct in a row",         emoji: "⚡", category: "streak",
    check: id => (progress(id)?.longestStreak ?? 0) >= 10 },

  // Skill — accuracy & volume (4)
  { id: "sharpshooter",  label: "Sharpshooter",           description: "80% accuracy (5+ games)",    emoji: "🎯", category: "skill",
    check: id => { const p = progress(id); if (!p || p.gamesPlayed < 5 || p.totalAnswered < 20) return false; return (p.totalCorrect / p.totalAnswered) >= 0.8 } },
  { id: "sniper",        label: "Sniper",             description: "90% accuracy (10+ games)",   emoji: "🏹", category: "skill",
    check: id => { const p = progress(id); if (!p || p.gamesPlayed < 10 || p.totalAnswered < 50) return false; return (p.totalCorrect / p.totalAnswered) >= 0.9 } },
  { id: "hundred_club",  label: "Century",            description: "100 total correct answers",          emoji: "💯", category: "skill",
    check: id => (progress(id)?.totalCorrect ?? 0) >= 100 },
  { id: "five_hundred",  label: "Five hundred",        description: "500 total correct answers",          emoji: "🎓", category: "skill",
    check: id => (progress(id)?.totalCorrect ?? 0) >= 500 },

  // Rank — podiums & wins (4)
  { id: "first_podium",  label: "First podium",     description: "Top 3 in a game",            emoji: "🥉", category: "rank",
    check: id => podiumsFor(id) >= 1 },
  { id: "winner",        label: "Winner",           description: "First 1st place",           emoji: "🥇", category: "rank",
    check: id => winsFor(id) >= 1 },
  { id: "triple_crown",  label: "Triple crown",     description: "3 wins",                  emoji: "👑", category: "rank",
    check: id => winsFor(id) >= 3 },
  { id: "champion",      label: "Champion",            description: "10 wins",                 emoji: "🏆", category: "rank",
    check: id => winsFor(id) >= 10 },

  // Tier (4)
  { id: "silver_tier",   label: "Silver",              description: "Reached Silver tier",      emoji: "🥈", category: "tier",
    check: id => hasLevel(id, 11) },
  { id: "gold_tier",     label: "Gold",               description: "Reached Gold tier",        emoji: "🏆", category: "tier",
    check: id => hasLevel(id, 26) },
  { id: "platinum_tier", label: "Platinum",            description: "Reached Platinum tier",    emoji: "💎", category: "tier",
    check: id => hasLevel(id, 51) },
  { id: "mythic_tier",   label: "Mythic",             description: "Reached Mythic tier",      emoji: "👑", category: "tier",
    check: id => hasLevel(id, 100) },

  // Variety (2)
  { id: "variety_5",     label: "Explorer",         description: "Played 5 different quizzes",  emoji: "🗺️", category: "variety",
    check: id => distinctQuizCount(id) >= 5 },
  { id: "variety_10",    label: "Encyclopedia",       description: "Played 10 different quizzes", emoji: "📖", category: "variety",
    check: id => distinctQuizCount(id) >= 10 },

  // Participation — intensity (1)
  { id: "marathoner",    label: "Marathoner",        description: "3 games in the same day",        emoji: "🏃", category: "participation",
    check: id => maxGamesInSingleDay(id) >= 3 },

  // Rank — leaderboards (2)
  { id: "top10_monthly", label: "Top 10 of the month",      description: "Top 10 in any month",            emoji: "📊", category: "rank",
    check: id => { const r = bestRankInAnyPeriod(id, "month_iso"); return r > 0 && r <= 10 } },
  { id: "monthly_crown", label: "King of the month",         description: "Number 1 in a closed month",      emoji: "👑", category: "rank",
    check: id => { const r = bestRankInAnyPeriod(id, "month_iso"); return r === 1 } },
]

// ─── Award / backfill ───────────────────────────────────────────────────────

export interface BadgeUnlock {
  id: string
  label: string
  emoji: string
  description: string
  category: BadgeCategory
}

export function checkAndAwardBadges(playerId: string): BadgeUnlock[] {
  const existing = db()
    .prepare("SELECT badge_id FROM player_badges WHERE player_id = ?")
    .all(playerId) as Array<{ badge_id: string }>
  const unlocked = new Set(existing.map(r => r.badge_id))
  const now = new Date().toISOString()
  const awarded: BadgeUnlock[] = []
  const ins = db().prepare(
    "INSERT OR IGNORE INTO player_badges (player_id, badge_id, unlocked_at) VALUES (?, ?, ?)"
  )

  for (const b of BADGES) {
    if (unlocked.has(b.id)) continue
    try {
      if (b.check(playerId)) {
        ins.run(playerId, b.id, now)
        awarded.push({
          id: b.id, label: b.label, emoji: b.emoji,
          description: b.description, category: b.category,
        })
      }
    } catch (e) {
      console.error(`[badges] check failed for ${b.id}:`, e)
    }
  }
  return awarded
}

export function backfillBadgesForAll(): { playersTouched: number; badgesAwarded: number } {
  const metaRow = db()
    .prepare("SELECT value FROM meta WHERE key = 'badges_backfilled'")
    .get() as { value: string } | undefined
  if (metaRow?.value === "1") return { playersTouched: 0, badgesAwarded: 0 }

  const players = db().prepare("SELECT id FROM players").all() as Array<{ id: string }>
  let total = 0
  db().exec("BEGIN")
  try {
    for (const p of players) {
      const awarded = checkAndAwardBadges(p.id)
      total += awarded.length
    }
    db()
      .prepare("INSERT OR REPLACE INTO meta (key, value) VALUES ('badges_backfilled', '1')")
      .run()
    db().exec("COMMIT")
  } catch (e) {
    db().exec("ROLLBACK")
    throw e
  }
  return { playersTouched: players.length, badgesAwarded: total }
}

export function getPlayerBadges(playerId: string): Array<{
  id: string; label: string; description: string; emoji: string
  category: BadgeCategory; unlockedAt: string
}> {
  const rows = db()
    .prepare(
      `SELECT badge_id AS id, unlocked_at AS unlockedAt
         FROM player_badges WHERE player_id = ?
         ORDER BY unlocked_at DESC`
    )
    .all(playerId) as Array<{ id: string; unlockedAt: string }>
  const byId = new Map(BADGES.map(b => [b.id, b]))
  return rows
    .map(r => {
      const def = byId.get(r.id)
      if (!def) return null
      return {
        id: def.id, label: def.label, description: def.description,
        emoji: def.emoji, category: def.category, unlockedAt: r.unlockedAt,
      }
    })
    .filter(Boolean) as any
}

export const BADGE_CATALOG_PUBLIC = BADGES.map(b => ({
  id: b.id, label: b.label, description: b.description,
  emoji: b.emoji, category: b.category,
}))
