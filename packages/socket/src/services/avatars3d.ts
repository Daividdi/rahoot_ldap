/**
 * 3D avatar catalog + player-selection persistence.
 *
 * Catalog lives on disk under AVATARS_3D_ROOT (bind-mounted at /app/config/avatars-3d),
 * produced at setup-time by scripts/fetch-r3.mjs. We read it once and serve via socket.
 *
 * Player's selected 3D avatar is stored on players.avatar_3d_id and is authoritative
 * over avatar_json (DiceBear) when players.avatar_kind = '3d'.
 */

import fs from "node:fs"
import path from "node:path"
import { db, normName } from "@rahoot/socket/services/db"

const ROOT = process.env.AVATARS_3D_ROOT || "/app/config/avatars-3d"

export interface AvatarCatalogEntry {
  id: string
  number: string
  name: string
  displayName: string
  series: string
  vrm: string
  icon: string
  requiredLevel: number
}

export interface AnimationEntry {
  id: string
  label: string
  file: string
}

export interface AvatarCatalog {
  series: string
  avatars: AvatarCatalogEntry[]
  animations: AnimationEntry[]
}

let _cache: AvatarCatalog | null = null

function loadCatalog(): AvatarCatalog | null {
  if (_cache) return _cache
  const p = path.join(ROOT, "catalog.json")
  if (!fs.existsSync(p)) return null
  try {
    const raw = fs.readFileSync(p, "utf8")
    _cache = JSON.parse(raw) as AvatarCatalog
    return _cache
  } catch {
    return null
  }
}

export function listAvatars(): { avatars: AvatarCatalogEntry[]; animations: AnimationEntry[] } {
  const c = loadCatalog()
  return { avatars: c?.avatars ?? [], animations: c?.animations ?? [] }
}

export function getAvatarById(id: string): AvatarCatalogEntry | null {
  const c = loadCatalog()
  return c?.avatars.find(a => a.id === id) ?? null
}

export function saveAvatarSelection(input: {
  realName: string
  kind: "dicebear" | "3d"
  avatar3dId?: string | null
  avatarJson?: string | null
}): { ok: true } | { ok: false; reason: "player_not_found" | "invalid_kind" | "unknown_avatar" } {
  const key = normName(input.realName || "")
  if (!key) return { ok: false, reason: "player_not_found" }
  const row = db()
    .prepare("SELECT id FROM players WHERE LOWER(real_name) = ? LIMIT 1")
    .get(key) as { id: string } | undefined
  if (!row) return { ok: false, reason: "player_not_found" }

  if (input.kind === "3d") {
    if (!input.avatar3dId) return { ok: false, reason: "unknown_avatar" }
    if (!getAvatarById(input.avatar3dId)) return { ok: false, reason: "unknown_avatar" }
    db()
      .prepare(
        "UPDATE players SET avatar_kind = '3d', avatar_3d_id = ? WHERE id = ?"
      )
      .run(input.avatar3dId, row.id)
  } else if (input.kind === "dicebear") {
    db()
      .prepare(
        "UPDATE players SET avatar_kind = 'dicebear', avatar_json = COALESCE(?, avatar_json) WHERE id = ?"
      )
      .run(input.avatarJson ?? null, row.id)
  } else {
    return { ok: false, reason: "invalid_kind" }
  }
  return { ok: true }
}

export function getAvatarForPlayer(realName: string): {
  kind: "dicebear" | "3d"
  avatar3d?: AvatarCatalogEntry | null
  avatarJson?: string | null
} | null {
  const key = normName(realName || "")
  if (!key) return null
  const row = db()
    .prepare(
      "SELECT avatar_kind AS kind, avatar_json AS json, avatar_3d_id AS id3d FROM players WHERE LOWER(real_name) = ? LIMIT 1"
    )
    .get(key) as { kind: string; json: string | null; id3d: string | null } | undefined
  if (!row) return null
  if (row.kind === "3d" && row.id3d) {
    return { kind: "3d", avatar3d: getAvatarById(row.id3d) }
  }
  return { kind: "dicebear", avatarJson: row.json }
}
