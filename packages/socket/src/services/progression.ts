/**
 * Progression engine — Phase 2.
 *
 * Pure math: XP curve, level-from-xp, tier-from-level, per-session XP.
 * No I/O. Used by sessionRecorder for live games AND by the one-off
 * backfill that runs against migrated history.
 */

export type TierId = "bronze" | "silver" | "gold" | "platinum" | "mythic"

export const TIERS: Array<{ id: TierId; minLevel: number; label: string; color: string }> = [
  { id: "bronze",   minLevel: 1,   label: "Bronze",   color: "#CD7F32" },
  { id: "silver",   minLevel: 11,  label: "Silver",   color: "#C0C0C0" },
  { id: "gold",     minLevel: 26,  label: "Gold",     color: "#FFD700" },
  { id: "platinum", minLevel: 51,  label: "Platinum", color: "#B9F2FF" },
  { id: "mythic",   minLevel: 100, label: "Mythic",   color: "#FF4FD8" },
]

// XP required to advance FROM level n-1 TO level n.
// Beyond level 20 we add a quadratic extra so daily players don't coast.
export function xpForLevel(level: number): number {
  if (level <= 1) return 0
  const base = Math.floor(100 * Math.pow(level, 1.7))
  const hardExtra = level > 20 ? Math.pow(level - 20, 2) * 150 : 0
  return Math.floor(base + hardExtra)
}

const cumCache = new Map<number, number>()
export function cumulativeXpForLevel(level: number): number {
  if (level <= 1) return 0
  const hit = cumCache.get(level)
  if (hit !== undefined) return hit
  let sum = 0
  for (let i = 2; i <= level; i++) sum += xpForLevel(i)
  cumCache.set(level, sum)
  return sum
}

export function levelFromXp(xp: number): number {
  if (xp <= 0) return 1
  let level = 1
  while (cumulativeXpForLevel(level + 1) <= xp) {
    level++
    if (level > 500) break
  }
  return level
}

export function tierFromLevel(level: number): TierId {
  for (let i = TIERS.length - 1; i >= 0; i--) {
    if (level >= TIERS[i].minLevel) return TIERS[i].id
  }
  return "bronze"
}

export function progressInLevel(xp: number): {
  level: number
  tier: TierId
  xpIntoLevel: number
  xpNeededForNext: number
  pct: number
} {
  const level = levelFromXp(xp)
  const base = cumulativeXpForLevel(level)
  const next = cumulativeXpForLevel(level + 1)
  const span = Math.max(1, next - base)
  const into = Math.max(0, xp - base)
  return {
    level,
    tier: tierFromLevel(level),
    xpIntoLevel: into,
    xpNeededForNext: next - xp,
    pct: Math.min(1, into / span),
  }
}

// ─── Per-session XP ─────────────────────────────────────────────────────────

export interface SessionXpInput {
  rank: number
  totalPlayers: number
  correct: number
  incorrect: number
  unanswered: number
  points: number
  longestStreakInGame: number
}

export function xpForSession(s: SessionXpInput): number {
  const totalQ = s.correct + s.incorrect + s.unanswered
  if (totalQ === 0) return 0

  let xp = 0
  xp += 20                                  // participation
  xp += s.correct * 15                      // per correct answer
  xp += Math.floor((s.points || 0) / 100)   // small bonus tied to raw quiz points

  if (s.longestStreakInGame >= 3) xp += 10
  if (s.longestStreakInGame >= 5) xp += 20
  if (s.longestStreakInGame >= 8) xp += 40

  if (s.totalPlayers >= 2) {
    if (s.rank === 1) xp += 100
    else if (s.rank === 2) xp += 60
    else if (s.rank === 3) xp += 35
  }

  if (s.correct === totalQ && totalQ >= 3) xp += 75  // perfect game

  return xp
}

export function longestStreak(answers: Array<{ isCorrect?: boolean }>): number {
  let max = 0, cur = 0
  for (const a of answers || []) {
    if (a?.isCorrect) { cur++; if (cur > max) max = cur }
    else cur = 0
  }
  return max
}
