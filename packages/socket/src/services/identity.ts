/**
 * Identity service — Phase 1.
 *
 * Player CRUD operations keyed by clientId (from socket handshake) with
 * fallback matching by real_name for returning users from history.json.
 *
 * NOT YET CALLED from the game flow — this module is stand-alone and safe
 * to ship in Phase 1. Phase 2+ will wire these into game:create / player:join.
 */

import { randomUUID } from "node:crypto"
import { db, normName } from "@rahoot/socket/services/db"

export type PlayerRecord = {
  id: string
  clientId: string | null
  realName: string
  username: string
  avatarJson: string | null
  createdAt: string
  lastSeenAt: string
}

export type PlayerProgressRecord = {
  playerId: string
  xp: number
  level: number
  tier: string
  longestStreak: number
  gamesPlayed: number
  perfectGames: number
  totalCorrect: number
  totalAnswered: number
  lastGameAt: string | null
}

// ─── Lookups ────────────────────────────────────────────────────────────────

export function findByClientId(clientId: string): PlayerRecord | null {
  const row = db()
    .prepare(
      `SELECT id, client_id AS clientId, real_name AS realName, username,
              avatar_json AS avatarJson, created_at AS createdAt, last_seen_at AS lastSeenAt
       FROM players WHERE client_id = ?`
    )
    .get(clientId) as PlayerRecord | undefined
  return row ?? null
}

export function findByRealName(realName: string): PlayerRecord | null {
  const row = db()
    .prepare(
      `SELECT id, client_id AS clientId, real_name AS realName, username,
              avatar_json AS avatarJson, created_at AS createdAt, last_seen_at AS lastSeenAt
       FROM players WHERE LOWER(real_name) = ? LIMIT 1`
    )
    .get(normName(realName)) as PlayerRecord | undefined
  return row ?? null
}

export function getProgress(playerId: string): PlayerProgressRecord | null {
  const row = db()
    .prepare(
      `SELECT player_id AS playerId, xp, level, tier, longest_streak AS longestStreak,
              games_played AS gamesPlayed, perfect_games AS perfectGames,
              total_correct AS totalCorrect, total_answered AS totalAnswered,
              last_game_at AS lastGameAt
       FROM player_progress WHERE player_id = ?`
    )
    .get(playerId) as PlayerProgressRecord | undefined
  return row ?? null
}

// ─── Upsert ─────────────────────────────────────────────────────────────────

/**
 * Resolve a player identity. Priority:
 *   1. Existing player by clientId → update last_seen_at
 *   2. Existing player by real_name (from history.json migration) → link clientId
 *   3. New player → create with new UUID
 */
export function resolvePlayer(input: {
  clientId: string
  realName: string
  username?: string
}): PlayerRecord {
  const now = new Date().toISOString()
  const realName = (input.realName || "").trim() || "Anon"
  const username = (input.username || realName).trim()

  // 1. by clientId
  const byClient = findByClientId(input.clientId)
  if (byClient) {
    db()
      .prepare("UPDATE players SET last_seen_at = ?, username = ? WHERE id = ?")
      .run(now, username, byClient.id)
    return { ...byClient, lastSeenAt: now, username }
  }

  // 2. by realName (returning user from history)
  const byName = findByRealName(realName)
  if (byName && !byName.clientId) {
    db()
      .prepare(
        "UPDATE players SET client_id = ?, last_seen_at = ?, username = ? WHERE id = ?"
      )
      .run(input.clientId, now, username, byName.id)
    return { ...byName, clientId: input.clientId, lastSeenAt: now, username }
  }

  // 3. create
  const id = randomUUID()
  db()
    .prepare(
      `INSERT INTO players (id, client_id, real_name, username, created_at, last_seen_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(id, input.clientId, realName, username, now, now)
  db().prepare(`INSERT INTO player_progress (player_id) VALUES (?)`).run(id)

  return {
    id,
    clientId: input.clientId,
    realName,
    username,
    avatarJson: null,
    createdAt: now,
    lastSeenAt: now,
  }
}

// ─── Convenience / ops ─────────────────────────────────────────────────────

export function listPlayers(limit = 50): PlayerRecord[] {
  return db()
    .prepare(
      `SELECT id, client_id AS clientId, real_name AS realName, username,
              avatar_json AS avatarJson, created_at AS createdAt, last_seen_at AS lastSeenAt
       FROM players ORDER BY last_seen_at DESC LIMIT ?`
    )
    .all(limit) as PlayerRecord[]
}
