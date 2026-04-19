"use client"

import Button from "@rahoot/web/components/Button"
import Input from "@rahoot/web/components/Input"
import TierBadge from "@rahoot/web/components/profile/TierBadge"
import XpBar from "@rahoot/web/components/profile/XpBar"
import { useEvent, useSocket } from "@rahoot/web/contexts/socketProvider"
import { usePlayerStore } from "@rahoot/web/stores/player"
import { useSearchParams } from "next/navigation"
import Link from "next/link"
import { KeyboardEvent, useCallback, useEffect, useRef, useState } from "react"

const STORAGE_KEY = "rahoot_real_name"
const AVATAR_KEY = "rahoot_avatar_cfg"

type TierId = "bronze" | "silver" | "gold" | "platinum" | "mythic"

type ProfilePayload = {
  player: {
    realName: string
    username: string
    avatarKind?: "dicebear" | "3d"
    avatar3dId?: string | null
    avatar3d?: { id: string; icon: string; vrm: string; displayName: string } | null
  } | null
  progression: {
    xp: number
    level: number
    tier: TierId
    xpIntoLevel: number
    xpNeededForNext: number
    pct: number
    longestStreak: number
    gamesPlayed: number
    perfectGames: number
    totalCorrect: number
    totalAnswered: number
  } | null
  recentSessions: Array<{
    sessionId: string
    quizTitle: string
    startedAt: string
    rank: number
    points: number
    correct: number
    xpGained: number
  }>
  monthly: { rank: number | null; points: number; games: number } | null
  weekly: { rank: number | null; points: number; games: number } | null
  badges: Array<{ id: string; label: string; description: string; emoji: string; category: string; unlockedAt: string }>
  catalog: Array<{ id: string; label: string; description: string; emoji: string; category: string }>
}

const getStoredName = (): string => { try { return localStorage.getItem(STORAGE_KEY) || "" } catch { return "" } }
const saveStoredName = (n: string) => { try { localStorage.setItem(STORAGE_KEY, n) } catch {} }

type AvatarCfg = {
  seed?: string; skin?: string; hair?: string; hairColor?: string
  accessory?: string; hijabColor?: string; hijabExpr?: string; bsExpr?: string
  useAvatar?: boolean
}

const buildAvatarUrlFromCfg = (c: AvatarCfg): string => {
  if (c.useAvatar === false) return ""
  const seed = c.seed || "guest"
  const skin = c.skin || "f2d3b1"
  const hair = c.hair || "shortHair"
  const hairColor = c.hairColor || "2c1b18"
  const accessory = c.accessory || "none"
  if (accessory === "hijab") {
    const hijabColor = c.hijabColor || "1a3c5e"
    const expr = (c.hijabExpr || "smile")
    const map: Record<string, { eyes: string; mouth: string }> = {
      smile: { eyes: "happy", mouth: "smile" },
      default: { eyes: "default", mouth: "default" },
      serious: { eyes: "default", mouth: "serious" },
      wink: { eyes: "wink", mouth: "twinkle" },
      surprised: { eyes: "surprised", mouth: "disbelief" },
      shy: { eyes: "squint", mouth: "smile" },
      sad: { eyes: "cry", mouth: "sad" },
      cool: { eyes: "hearts", mouth: "twinkle" },
    }
    const e = map[expr] || map.smile
    return `/api/avatar?style=avataaars&seed=${encodeURIComponent(seed)}&skin=${skin}&hijabColor=${hijabColor}&mouth=${e.mouth}&eyes=${e.eyes}`
  }
  const bsExpr = c.bsExpr || "cheery"
  let url = `/api/avatar?style=bigSmile&seed=${encodeURIComponent(seed)}&skin=${skin}&hair=${hair}&hairColor=${hairColor}&eyes=${bsExpr}`
  if (accessory !== "none") url += `&acc=${accessory}`
  return url
}

const getStoredAvatarUrl = (): string => {
  try {
    const raw = localStorage.getItem(AVATAR_KEY)
    if (!raw) return ""
    const cfg = JSON.parse(raw) as AvatarCfg
    return buildAvatarUrlFromCfg(cfg)
  } catch { return "" }
}

const PlayerHomeCard = () => {
  const { socket, isConnected } = useSocket()
  const { join } = usePlayerStore()
  const searchParams = useSearchParams()
  const hasAutoJoinedRef = useRef(false)

  const [storedName, setStoredName] = useState<string | null>(null)  // null = loading
  const [registerName, setRegisterName] = useState("")
  const [profile, setProfile] = useState<ProfilePayload | null>(null)
  const [profileLoading, setProfileLoading] = useState(false)

  const [pinMode, setPinMode] = useState(false)
  const [pin, setPin] = useState("")
  const [expanded, setExpanded] = useState(false)  // show recent games

  const [avatarUrl, setAvatarUrl] = useState("")

  // Load from localStorage on mount
  useEffect(() => {
    const n = getStoredName()
    setStoredName(n)
    setAvatarUrl(getStoredAvatarUrl())
  }, [])

  // Auto-join if ?pin=XXXXXX in URL (Moodle embed, direct link)
  useEffect(() => {
    const pinCode = searchParams.get("pin")
    if (!isConnected || !pinCode || hasAutoJoinedRef.current) return
    socket?.emit("player:join", pinCode)
    hasAutoJoinedRef.current = true
  }, [searchParams, isConnected, socket])

  // Fetch profile when socket is connected and we have a stored name
  useEffect(() => {
    if (!socket || !isConnected || !storedName) return
    setProfileLoading(true)
    ;(socket as any).emit("player:getProfile", { realName: storedName })
  }, [socket, isConnected, storedName])

  useEvent("game:successRoom" as any, (gameId: string) => {
    join(gameId)
  })

  // Custom profile handler (not in typed events yet)
  useEffect(() => {
    if (!socket) return
    const handler = (data: ProfilePayload) => {
      setProfile(data)
      setProfileLoading(false)
    }
    ;(socket as any).on("player:profile", handler)
    return () => { (socket as any).off("player:profile", handler) }
  }, [socket])

  const handleRegister = useCallback(() => {
    const n = registerName.trim()
    if (!n) return
    saveStoredName(n)
    setStoredName(n)
  }, [registerName])

  const handleJoin = useCallback(() => {
    const code = pin.trim()
    if (!code) return
    socket?.emit("player:join", code)
  }, [pin, socket])

  const onEnter = (fn: () => void) => (e: KeyboardEvent) => {
    if (e.key === "Enter") fn()
  }

  // ── Loading shell ─────────────────────────────────────────
  if (storedName === null) {
    return <div className="card-3d z-10 h-40 w-full max-w-sm rounded-2xl bg-white/60 animate-pulse" />
  }

  // ── First-time user: register name ────────────────────────
  if (!storedName) {
    return (
      <div className="card-3d z-10 flex w-full max-w-sm flex-col gap-4 rounded-2xl bg-white p-6">
        <div>
          <h2 className="text-lg font-bold text-gray-800">Bem-vindo!</h2>
          <p className="text-sm text-gray-400">Nos diga seu nome para salvar seu progresso.</p>
        </div>
        <Input
          value={registerName}
          onChange={(e) => setRegisterName(e.target.value)}
          onKeyDown={onEnter(handleRegister)}
          placeholder="Seu nome completo"
          maxLength={40}
          autoFocus
        />
        <Button onClick={handleRegister}>Continuar</Button>
      </div>
    )
  }

  // ── Returning user: full profile card ─────────────────────
  const prog = profile?.progression
  const tier: TierId = (prog?.tier as TierId) || "bronze"
  const level = prog?.level ?? 1
  const xpIntoLevel = prog?.xpIntoLevel ?? 0
  const xpNeededForNext = prog?.xpNeededForNext ?? 100
  const pct = prog?.pct ?? 0
  const gamesPlayed = prog?.gamesPlayed ?? 0
  const perfectGames = prog?.perfectGames ?? 0
  const longestStreak = prog?.longestStreak ?? 0
  const totalCorrect = prog?.totalCorrect ?? 0
  const accuracy = prog && prog.totalAnswered > 0
    ? Math.round((prog.totalCorrect / prog.totalAnswered) * 100)
    : 0

  const is3d = profile?.player?.avatarKind === "3d" && profile?.player?.avatar3d
  const effectiveAvatarUrl = is3d ? `/api/avatar3d/${profile!.player!.avatar3d!.icon}` : avatarUrl

  const monthlyRank = profile?.monthly?.rank ?? null
  const weeklyRank = profile?.weekly?.rank ?? null

  return (
    <div className="card-3d z-10 flex w-full max-w-md flex-col gap-4 rounded-2xl bg-white p-5">
      {/* Header: avatar + name + tier */}
      <div className="flex items-center gap-3">
        <div className="relative shrink-0">
          <Link
            href="/avatar"
            title="Trocar avatar"
            className="block h-16 w-16 overflow-hidden rounded-2xl border-4 border-white bg-gradient-to-br from-primary/15 to-primary/5 shadow transition hover:scale-105"
          >
            {effectiveAvatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={effectiveAvatarUrl} alt="avatar" className="h-full w-full object-cover" />
            ) : (
              <span className="flex h-full w-full items-center justify-center text-2xl font-bold text-primary/40">
                {storedName.charAt(0).toUpperCase()}
              </span>
            )}
          </Link>
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-bold text-gray-800">{storedName}</p>
          <div className="mt-1">
            <TierBadge tier={tier} level={level} size="sm" />
          </div>
        </div>
        <button
          onClick={() => { saveStoredName(""); setStoredName(""); setProfile(null) }}
          className="shrink-0 text-[10px] text-gray-400 hover:text-primary hover:underline"
          title="Trocar de usuário"
        >
          Não é você?
        </button>
      </div>

      {/* XP bar */}
      <div className="rounded-xl bg-gradient-to-b from-gray-50 to-white p-3 ring-1 ring-gray-100">
        {profileLoading && !profile ? (
          <div className="h-6 w-full animate-pulse rounded bg-gray-100" />
        ) : (
          <XpBar
            level={level}
            tier={tier}
            xp={prog?.xp ?? 0}
            xpIntoLevel={xpIntoLevel}
            xpNeededForNext={xpNeededForNext}
            pct={pct}
          />
        )}
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-4 gap-2">
        <Stat label="Jogos"    value={gamesPlayed} />
        <Stat label="Perfeito" value={perfectGames} highlight={perfectGames > 0} />
        <Stat label="Streak"   value={longestStreak} />
        <Stat label="Acerto"   value={`${accuracy}%`} />
      </div>

      {/* Rank strip — clicks through to /ranking */}
      <Link
        href="/ranking"
        className="flex items-center justify-between rounded-xl bg-primary/5 px-3 py-2 ring-1 ring-primary/10 transition hover:bg-primary/10 hover:ring-primary/30"
      >
        <div className="text-[11px] font-semibold text-primary/80">
          {weeklyRank ? <>Semana: <span className="font-bold">#{weeklyRank}</span></> : <>Sem ranking semanal</>}
        </div>
        <div className="text-[11px] font-semibold text-primary/80">
          {monthlyRank ? <>Mês: <span className="font-bold">#{monthlyRank}</span></> : <>Sem ranking mensal</>}
        </div>
        <div className="text-[11px] font-bold text-primary/70">Ver ranking →</div>
      </Link>

      {/* Badges shelf */}
      {profile && profile.catalog && profile.catalog.length > 0 && (
        <BadgeShelf earned={profile.badges} catalog={profile.catalog} />
      )}

      {/* Action: Enter PIN */}
      {!pinMode ? (
        <div className="flex flex-col gap-2">
          <Button onClick={() => setPinMode(true)}>Entrar em um jogo</Button>
          <div className="flex items-center justify-between gap-2">
            <button
              onClick={() => setExpanded(e => !e)}
              className="text-[11px] font-semibold text-gray-400 hover:text-primary"
            >
              {expanded ? "Esconder histórico" : "Ver jogos recentes"}
            </button>
            <Link
              href="/avatar"
              className="text-[11px] font-semibold text-gray-400 hover:text-primary"
            >
              Trocar avatar →
            </Link>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <Input
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            onKeyDown={onEnter(handleJoin)}
            placeholder="Código do jogo"
            autoFocus
          />
          <div className="flex gap-2">
            <Button onClick={handleJoin} className="flex-1">Entrar</Button>
            <button
              onClick={() => { setPinMode(false); setPin("") }}
              className="rounded-lg px-3 py-2 text-xs font-semibold text-gray-400 hover:text-primary"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Expanded recent games */}
      {expanded && profile && profile.recentSessions.length > 0 && (
        <div className="flex flex-col gap-1.5 border-t border-gray-100 pt-3">
          <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Jogos recentes</p>
          {profile.recentSessions.slice(0, 5).map(s => (
            <div key={s.sessionId} className="flex items-center gap-2 rounded-lg bg-gray-50 px-2.5 py-1.5">
              <span className="shrink-0 text-[10px] text-gray-400">#{s.rank}</span>
              <span className="flex-1 truncate text-xs font-semibold text-gray-700">{s.quizTitle}</span>
              <span className="shrink-0 text-[10px] font-bold text-primary">+{s.xpGained} XP</span>
              <span className="shrink-0 text-[10px] text-gray-400">{new Date(s.startedAt).toLocaleDateString("pt-BR")}</span>
            </div>
          ))}
        </div>
      )}
      {expanded && profile && profile.recentSessions.length === 0 && (
        <p className="text-center text-xs text-gray-400">Nenhum jogo ainda.</p>
      )}
    </div>
  )
}

function Stat({ label, value, highlight }: { label: string; value: number | string; highlight?: boolean }) {
  return (
    <div className={`flex flex-col items-center rounded-xl bg-gray-50 px-2 py-2 ring-1 ring-gray-100 ${highlight ? "bg-amber-50 ring-amber-200" : ""}`}>
      <span className="text-base font-bold tabular-nums text-gray-800">{value}</span>
      <span className="text-[9px] font-semibold uppercase tracking-wider text-gray-400">{label}</span>
    </div>
  )
}

type BadgeEarned = { id: string; label: string; description: string; emoji: string; category: string; unlockedAt: string }
type BadgeCatalogItem = { id: string; label: string; description: string; emoji: string; category: string }

function BadgeShelf({ earned, catalog }: { earned: BadgeEarned[]; catalog: BadgeCatalogItem[] }) {
  const [showAll, setShowAll] = useState(false)
  const earnedIds = new Set(earned.map(b => b.id))
  // Show earned first (newest unlock first), then locked in catalog order.
  const ordered = [
    ...earned,
    ...catalog.filter(c => !earnedIds.has(c.id)).map(c => ({ ...c, unlockedAt: "" })),
  ]
  const visible = showAll ? ordered : ordered.slice(0, 8)

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-gray-100 bg-gray-50/60 p-3">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Conquistas</span>
        <span className="text-[10px] font-bold tabular-nums text-primary">
          {earned.length} <span className="text-gray-400">/ {catalog.length}</span>
        </span>
      </div>
      <div className="grid grid-cols-8 gap-1.5">
        {visible.map(b => {
          const unlocked = earnedIds.has(b.id)
          return (
            <div
              key={b.id}
              title={`${b.label} — ${b.description}${unlocked ? "" : " (bloqueado)"}`}
              className={`flex aspect-square items-center justify-center rounded-lg text-lg transition-all ${
                unlocked
                  ? "bg-gradient-to-br from-amber-50 to-amber-100 shadow ring-1 ring-amber-200 hover:scale-110"
                  : "bg-gray-100 text-gray-300 grayscale opacity-50"
              }`}
            >
              <span aria-hidden>{b.emoji}</span>
            </div>
          )
        })}
      </div>
      {ordered.length > 8 && (
        <button
          onClick={() => setShowAll(s => !s)}
          className="self-center text-[10px] font-semibold text-gray-400 hover:text-primary"
        >
          {showAll ? "Mostrar menos" : `Ver todas (${ordered.length})`}
        </button>
      )}
    </div>
  )
}

export default PlayerHomeCard
