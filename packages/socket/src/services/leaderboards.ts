/**
 * Leaderboards — Phase 6.
 *
 * All queries filter `sessions.mode = 'classic'` — solo-mode attempts are
 * practice and explicitly excluded from competitive ranking.
 *
 * Closed weeks / months are snapshotted into `weekly_snapshots` on startup
 * so the Hall of Fame stays stable even after live session data changes.
 */

import { db, getISOWeek } from "@rahoot/socket/services/db"

export interface LeaderRow {
  rank: number
  playerId: string
  realName: string
  username: string
  avatarJson: string | null
  avatarKind: "dicebear" | "3d"
  avatar3dId: string | null
  points: number
  weightedPoints: number
  multiplier: number
  games: number
  tier: string
  level: number
}

function currentWeekIso(): string {
  return getISOWeek(new Date())
}

function currentMonthIso(): string {
  return new Date().toISOString().slice(0, 7)
}

/**
 * ISO week of (now - 7 days). Used for the weekly ranking, which intentionally
 * shows the most recently CLOSED week — teachers announce weekly winners on
 * Monday morning, so the display locks to the finished week until the next Monday.
 */
function lastWeekIso(): string {
  const d = new Date()
  d.setDate(d.getDate() - 7)
  return getISOWeek(d)
}

type PeriodOrder = "points" | "games"

function periodLeaderboard(
  column: "week_iso" | "month_iso",
  value: string,
  limit = 10,
  orderBy: PeriodOrder = "points"
): LeaderRow[] {
  // Participation multiplier: players who show up consistently get more
  // credit per game than one-off high scorers. Keeps leaderboards from
  // being dominated by a single lucky run.
  const multiplierCase = `CASE
    WHEN COUNT(*) >= 20 THEN 1.30
    WHEN COUNT(*) >= 10 THEN 1.20
    WHEN COUNT(*) >= 5  THEN 1.10
    WHEN COUNT(*) >= 3  THEN 1.05
    ELSE 1.00
  END`
  // Both weekly and monthly prioritise raw participation (games) — players
  // who show up consistently outrank one-off high scorers.
  const orderClause = orderBy === "games"
    ? "ORDER BY games DESC, weightedPoints DESC"
    : "ORDER BY weightedPoints DESC, games DESC"
  return db()
    .prepare(
      `SELECT sp.player_id  AS playerId,
              p.real_name   AS realName,
              p.username    AS username,
              p.avatar_json AS avatarJson,
              p.avatar_kind AS avatarKind,
              p.avatar_3d_id AS avatar3dId,
              pp.tier       AS tier,
              pp.level      AS level,
              SUM(sp.points) AS points,
              ROUND(SUM(sp.points) * ${multiplierCase}) AS weightedPoints,
              ${multiplierCase} AS multiplier,
              COUNT(*)       AS games
         FROM session_players sp
         JOIN sessions s ON s.id = sp.session_id
         JOIN players  p ON p.id = sp.player_id
    LEFT JOIN player_progress pp ON pp.player_id = sp.player_id
        WHERE s.${column} = ? AND s.mode = 'classic'
          AND LOWER(p.real_name) NOT LIKE '%daividdi%'
          AND LOWER(p.real_name) NOT LIKE '%test user%'
          AND p.real_name NOT GLOB '[0-9][0-9][0-9][0-9]*'
        GROUP BY sp.player_id
        ${orderClause}
        LIMIT ?`
    )
    .all(value, limit)
    .map((r: any, i: number) => ({
      rank: i + 1,
      playerId: r.playerId,
      realName: r.realName,
      username: r.username,
      avatarJson: r.avatarJson,
      avatarKind: r.avatarKind === "3d" ? "3d" : "dicebear",
      avatar3dId: r.avatar3dId ?? null,
      points: r.points,
      weightedPoints: r.weightedPoints ?? r.points,
      multiplier: r.multiplier ?? 1,
      games: r.games,
      tier: r.tier ?? "bronze",
      level: r.level ?? 1,
    }))
}

export function getCurrentWeekLeaderboard(limit = 10): LeaderRow[] {
  return periodLeaderboard("week_iso", currentWeekIso(), limit, "games")
}

export function getCurrentMonthLeaderboard(limit = 10): LeaderRow[] {
  return periodLeaderboard("month_iso", currentMonthIso(), limit, "games")
}

// ─── Closed-period snapshotting ─────────────────────────────────────────────

/**
 * For every distinct ISO week in `sessions` that is strictly earlier than
 * the current week, compute top-10 and insert into `weekly_snapshots`.
 * Idempotent via meta flag + de-dup check.
 */
export function snapshotClosedWeeks(): { weeksSnapshotted: number; rowsInserted: number } {
  const now = new Date().toISOString()
  const thisWeek = currentWeekIso()

  const distinctWeeks = db()
    .prepare(
      `SELECT DISTINCT week_iso AS w FROM sessions
        WHERE mode = 'classic' AND week_iso < ?
        ORDER BY week_iso ASC`
    )
    .all(thisWeek) as Array<{ w: string }>

  if (distinctWeeks.length === 0) return { weeksSnapshotted: 0, rowsInserted: 0 }

  const alreadyRow = db()
    .prepare(
      `SELECT week_iso AS w, COUNT(*) AS n FROM weekly_snapshots GROUP BY week_iso`
    )
    .all() as Array<{ w: string; n: number }>
  const already = new Set(alreadyRow.map(r => r.w))

  const ins = db().prepare(
    `INSERT INTO weekly_snapshots (week_iso, player_id, rank, points, games, snapshot_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  )

  let weeksDone = 0
  let rowsDone = 0
  db().exec("BEGIN")
  try {
    for (const { w } of distinctWeeks) {
      if (already.has(w)) continue
      const top = periodLeaderboard("week_iso", w, 10, "games")
      for (const r of top) {
        ins.run(w, r.playerId, r.rank, r.points, r.games, now)
        rowsDone++
      }
      weeksDone++
    }
    db().exec("COMMIT")
  } catch (e) {
    db().exec("ROLLBACK")
    throw e
  }
  return { weeksSnapshotted: weeksDone, rowsInserted: rowsDone }
}

export interface HallOfFameEntry {
  period: string       // e.g. "2026-W15" or "2026-03"
  displayLabel: string // human-readable
  top: Array<{
    rank: number
    playerId: string
    realName: string
    points: number
    games: number
  }>
}

export function getWeeklyHallOfFame(limitPeriods = 10): HallOfFameEntry[] {
  const weeks = db()
    .prepare(
      `SELECT DISTINCT week_iso AS w FROM weekly_snapshots
        ORDER BY week_iso DESC LIMIT ?`
    )
    .all(limitPeriods) as Array<{ w: string }>

  const out: HallOfFameEntry[] = []
  const fetchTop = db().prepare(
    `SELECT ws.rank, ws.points, ws.games, ws.player_id AS playerId,
            p.real_name AS realName
       FROM weekly_snapshots ws
       JOIN players p ON p.id = ws.player_id
      WHERE ws.week_iso = ? AND ws.rank <= 3
        AND LOWER(p.real_name) NOT LIKE '%daividdi%'
        AND LOWER(p.real_name) NOT LIKE '%test user%'
        AND p.real_name NOT GLOB '[0-9][0-9][0-9][0-9]*'
      ORDER BY ws.rank ASC`
  )
  for (const { w } of weeks) {
    const rows = fetchTop.all(w) as Array<{
      rank: number; points: number; games: number; playerId: string; realName: string
    }>
    out.push({
      period: w,
      displayLabel: w.replace(/^(\d{4})-W(\d+)$/, "Week $2 / $1"),
      top: rows,
    })
  }
  return out
}

export function getMonthlyHallOfFame(limitPeriods = 12): HallOfFameEntry[] {
  const thisMonth = currentMonthIso()
  const months = db()
    .prepare(
      `SELECT DISTINCT month_iso AS m FROM sessions
        WHERE mode = 'classic' AND month_iso < ?
        ORDER BY month_iso DESC LIMIT ?`
    )
    .all(thisMonth, limitPeriods) as Array<{ m: string }>

  const out: HallOfFameEntry[] = []
  for (const { m } of months) {
    const top = periodLeaderboard("month_iso", m, 3, "games")
    out.push({
      period: m,
      displayLabel: formatMonth(m),
      top: top.map(r => ({
        rank: r.rank, points: r.points, games: r.games,
        playerId: r.playerId, realName: r.realName,
      })),
    })
  }
  return out
}

function formatMonth(iso: string): string {
  const [y, m] = iso.split("-")
  const months = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"]
  const mi = Number(m) - 1
  return `${months[mi] ?? m}/${y}`
}

export interface LeaderboardsBundle {
  week: { iso: string; label: string; top: LeaderRow[] }
  month: { iso: string; label: string; top: LeaderRow[] }
  weeklyHof: HallOfFameEntry[]
  monthlyHof: HallOfFameEntry[]
}

export function getAllLeaderboards(): LeaderboardsBundle {
  const wk = currentWeekIso()
  const mo = currentMonthIso()
  return {
    week: {
      iso: wk,
      label: wk.replace(/^(\d{4})-W(\d+)$/, "Week $2 / $1"),
      top: periodLeaderboard("week_iso", wk, 10, "games"),
    },
    month: {
      iso: mo,
      label: formatMonth(mo),
      top: getCurrentMonthLeaderboard(10),
    },
    weeklyHof: getWeeklyHallOfFame(8),
    monthlyHof: getMonthlyHallOfFame(12),
  }
}
