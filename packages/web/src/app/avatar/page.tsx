"use client"

import Button from "@rahoot/web/components/Button"
import TierBadge from "@rahoot/web/components/profile/TierBadge"
import { useSocket } from "@rahoot/web/contexts/socketProvider"
import { useRouter } from "next/navigation"
import { useCallback, useEffect, useMemo, useState } from "react"
import dynamic from "next/dynamic"
import clsx from "clsx"

const STORAGE_KEY = "rahoot_real_name"
const AVATAR_KEY = "rahoot_avatar_cfg"
const FAV_3D_KEY = "rahoot_avatar_3d_id"

type TierId = "bronze" | "silver" | "gold" | "platinum" | "mythic"

type CatalogAvatar = {
  id: string
  number: string
  name: string
  displayName: string
  series: string
  vrm: string
  icon: string
  requiredLevel: number
}
type CatalogAnim = { id: string; label: string; file: string }
type CatalogResp =
  | { ok: true; avatars: CatalogAvatar[]; animations: CatalogAnim[] }
  | { ok: false; reason: string }

type ProfileResp = {
  player: {
    realName: string
    username: string
    avatarKind: "dicebear" | "3d"
    avatar3dId: string | null
    avatar3d: { id: string; icon: string; vrm: string; displayName: string } | null
  } | null
  progression: { level: number; tier: TierId } | null
}

const ANIM_LABEL: Record<string, { label: string; emoji: string }> = {
  idle: { label: "Parado", emoji: "🧍" },
  "idle-offensive": { label: "Pronto", emoji: "🥊" },
  "idle-fight": { label: "Luta", emoji: "🥋" },
  jump: { label: "Pulo", emoji: "🦘" },
  "jump-rope": { label: "Pular corda", emoji: "🪢" },
  look: { label: "Olhar", emoji: "👀" },
  "look-around": { label: "Observar", emoji: "🔎" },
  "magic-spell": { label: "Magia", emoji: "🪄" },
  "magic-attack": { label: "Ataque", emoji: "⚡" },
  search: { label: "Procurar", emoji: "📂" },
  texting: { label: "Texting", emoji: "📱" },
}

const VRMViewer = dynamic(() => import("@rahoot/web/components/avatar/VRMViewer"), { ssr: false })

const asset = (rel: string) => `/api/avatar3d/${rel}`

const getStoredName = (): string => { try { return localStorage.getItem(STORAGE_KEY) || "" } catch { return "" } }
const getStoredFav = (): string => { try { return localStorage.getItem(FAV_3D_KEY) || "" } catch { return "" } }
const saveStoredFav = (id: string) => { try { localStorage.setItem(FAV_3D_KEY, id) } catch {} }

export default function AvatarPickerPage() {
  const router = useRouter()
  const { socket, isConnected, connect } = useSocket()

  const [realName, setRealName] = useState<string>("")
  const [tab, setTab] = useState<"classic" | "3d">("3d")
  const [catalog, setCatalog] = useState<CatalogResp | null>(null)
  const [profile, setProfile] = useState<ProfileResp | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [activeAnim, setActiveAnim] = useState<string>("idle")
  const [autoRotate, setAutoRotate] = useState(false)
  const [query, setQuery] = useState("")
  const [savedFlash, setSavedFlash] = useState(false)

  useEffect(() => {
    setRealName(getStoredName())
    const fav = getStoredFav()
    if (fav) setSelectedId(fav)
  }, [])

  useEffect(() => { if (!isConnected) connect() }, [isConnected, connect])

  useEffect(() => {
    if (!socket) return
    const onCat = (resp: CatalogResp) => {
      setCatalog(resp)
      if (resp.ok && !selectedId && resp.avatars.length > 0) {
        setSelectedId(resp.avatars[0].id)
      }
    }
    const onProfile = (resp: ProfileResp) => setProfile(resp)
    const onSaved = (resp: { ok: boolean; reason?: string }) => {
      if (resp.ok) {
        setSavedFlash(true)
        setTimeout(() => setSavedFlash(false), 1500)
      }
    }
    ;(socket as any).on("avatar3d:catalog", onCat)
    ;(socket as any).on("player:profile", onProfile)
    ;(socket as any).on("avatar3d:saved", onSaved)
    if (isConnected) {
      ;(socket as any).emit("avatar3d:list")
      if (realName) (socket as any).emit("player:getProfile", { realName })
    }
    return () => {
      ;(socket as any).off("avatar3d:catalog", onCat)
      ;(socket as any).off("player:profile", onProfile)
      ;(socket as any).off("avatar3d:saved", onSaved)
    }
  }, [socket, isConnected, realName, selectedId])

  const avatars = useMemo<CatalogAvatar[]>(() => (catalog?.ok ? catalog.avatars : []), [catalog])
  const animations = useMemo<CatalogAnim[]>(() => (catalog?.ok ? catalog.animations : []), [catalog])
  const filtered = useMemo(() => {
    if (!query.trim()) return avatars
    const q = query.toLowerCase()
    return avatars.filter(a => a.displayName.toLowerCase().includes(q) || a.number.includes(q))
  }, [avatars, query])

  const selected = useMemo(() => avatars.find(a => a.id === selectedId) ?? null, [avatars, selectedId])
  const activeAnimFile = useMemo(() => {
    const a = animations.find(x => x.id === activeAnim)
    return a ? asset(a.file) : null
  }, [animations, activeAnim])

  const tier = profile?.progression?.tier ?? "bronze"
  const level = profile?.progression?.level ?? 1

  const handleFav = useCallback(() => {
    if (!selected || !realName) return
    saveStoredFav(selected.id)
    ;(socket as any)?.emit("avatar3d:save", {
      realName,
      kind: "3d",
      avatar3dId: selected.id,
    })
  }, [selected, realName, socket])

  const handleUseClassic = useCallback(() => {
    if (!realName) return
    let cfg: string | null = null
    try { cfg = localStorage.getItem(AVATAR_KEY) } catch {}
    ;(socket as any)?.emit("avatar3d:save", {
      realName,
      kind: "dicebear",
      avatarJson: cfg,
    })
    setSavedFlash(true)
    setTimeout(() => setSavedFlash(false), 1500)
  }, [realName, socket])

  if (!realName) {
    return (
      <section className="min-h-screen w-full bg-gradient-angel px-4 py-10 text-white">
        <div className="mx-auto max-w-xl rounded-2xl bg-white/10 p-6 ring-1 ring-white/20 backdrop-blur">
          <h1 className="text-2xl font-bold">Avatar</h1>
          <p className="mt-2 text-white/80">Registre seu nome na tela inicial antes de escolher um avatar.</p>
          <div className="mt-4"><Button onClick={() => router.push("/")}>Voltar</Button></div>
        </div>
      </section>
    )
  }

  return (
    <section className="min-h-screen w-full bg-gradient-angel px-4 py-6">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 text-white">
        {/* Header */}
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Button onClick={() => router.push("/")}>← Voltar</Button>
            <div>
              <h1 className="text-2xl font-extrabold">Escolher avatar</h1>
              <div className="mt-1 flex items-center gap-2 text-sm text-white/80">
                <span className="truncate">{realName}</span>
                <TierBadge tier={tier as TierId} level={level} size="sm" />
              </div>
            </div>
          </div>
          {savedFlash && (
            <div className="rounded-full bg-emerald-400/25 px-3 py-1 text-xs font-bold text-emerald-100 ring-1 ring-emerald-300/60">
              ✓ Avatar salvo
            </div>
          )}
        </header>

        {/* Tabs */}
        <div className="flex gap-2">
          <button
            onClick={() => setTab("classic")}
            className={clsx(
              "flex-1 rounded-2xl px-4 py-3 text-sm font-bold transition",
              tab === "classic" ? "bg-white text-indigo-900 shadow-lg" : "bg-white/10 text-white/80 hover:bg-white/20"
            )}
          >
            Clássico
          </button>
          <button
            onClick={() => setTab("3d")}
            className={clsx(
              "flex-1 rounded-2xl px-4 py-3 text-sm font-bold transition",
              tab === "3d" ? "bg-white text-indigo-900 shadow-lg" : "bg-white/10 text-white/80 hover:bg-white/20"
            )}
          >
            3D
          </button>
        </div>

        {tab === "classic" ? (
          <ClassicPane onUse={handleUseClassic} currentKind={profile?.player?.avatarKind} />
        ) : (
          <div className="grid gap-4 lg:grid-cols-[1fr_1.4fr]">
            {/* Left: grid */}
            <div className="rounded-2xl bg-black/30 p-3 ring-1 ring-white/10 backdrop-blur">
              <input
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Buscar avatar…"
                className="mb-3 w-full rounded-xl bg-white/10 px-3 py-2 text-sm text-white placeholder:text-white/50 ring-1 ring-white/20 focus:outline-none focus:ring-white/50"
              />
              {!catalog && <div className="py-10 text-center text-sm text-white/60">Carregando…</div>}
              {catalog && catalog.ok === false && (
                <div className="py-10 text-center text-sm text-red-200">Catálogo indisponível.</div>
              )}
              <div className="grid max-h-[60vh] grid-cols-4 gap-2 overflow-y-auto pr-1 sm:grid-cols-5">
                {filtered.map(a => (
                  <button
                    key={a.id}
                    onClick={() => setSelectedId(a.id)}
                    className={clsx(
                      "group relative aspect-square overflow-hidden rounded-xl bg-white/5 ring-1 ring-white/10 transition hover:ring-white/40",
                      selectedId === a.id && "ring-2 ring-amber-300 ring-offset-2 ring-offset-black/30"
                    )}
                    title={a.displayName}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={asset(a.icon)}
                      alt={a.displayName}
                      className="absolute inset-0 h-full w-full object-cover"
                      loading="lazy"
                    />
                    <span className="absolute bottom-0 left-0 right-0 truncate bg-black/60 px-1 py-0.5 text-center text-[10px] font-semibold text-white">
                      {a.displayName}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Right: selected state */}
            <div className="rounded-2xl bg-black/30 p-4 ring-1 ring-white/10 backdrop-blur">
              {selected ? (
                <div className="flex h-full flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-xs uppercase tracking-wider text-white/50">Selecionado</div>
                      <div className="text-lg font-bold text-white">{selected.displayName}</div>
                    </div>
                    <button
                      onClick={() => setAutoRotate(r => !r)}
                      className={clsx(
                        "rounded-full px-3 py-1 text-xs font-semibold ring-1 transition",
                        autoRotate ? "bg-amber-300/20 text-amber-100 ring-amber-300/60" : "bg-white/10 text-white/80 ring-white/20 hover:bg-white/20"
                      )}
                    >
                      {autoRotate ? "⏸ Pausar rotação" : "↻ Auto-rotação"}
                    </button>
                  </div>

                  {/* Photo | Viewer */}
                  <div className="grid gap-3 md:grid-cols-[160px_1fr]">
                    <div className="rounded-xl bg-white/5 p-2 ring-1 ring-white/10">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={asset(selected.icon)}
                        alt={selected.displayName}
                        className="aspect-square w-full rounded-lg object-cover"
                      />
                      <div className="mt-2 text-center text-[11px] font-semibold text-white/70">Foto</div>
                    </div>
                    <div className="relative h-[360px] w-full overflow-hidden rounded-xl bg-gradient-to-b from-indigo-900/40 via-indigo-900/20 to-transparent ring-1 ring-white/10">
                      <VRMViewer
                        vrmUrl={asset(selected.vrm)}
                        animationUrl={activeAnimFile}
                        autoRotate={autoRotate}
                        className="absolute inset-0"
                      />
                      <div className="pointer-events-none absolute bottom-2 left-2 rounded-full bg-black/50 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-white/80">
                        arraste para girar · rolagem para zoom
                      </div>
                    </div>
                  </div>

                  {/* Animations */}
                  <div>
                    <div className="mb-2 text-xs font-bold uppercase tracking-wider text-white/60">Animações</div>
                    <div className="flex flex-wrap gap-2">
                      {animations.map(a => {
                        const meta = ANIM_LABEL[a.id] ?? { label: a.label, emoji: "🎬" }
                        return (
                          <button
                            key={a.id}
                            onClick={() => setActiveAnim(a.id)}
                            className={clsx(
                              "rounded-full px-3 py-1.5 text-xs font-semibold ring-1 transition",
                              activeAnim === a.id
                                ? "bg-amber-300 text-indigo-900 ring-amber-300"
                                : "bg-white/10 text-white ring-white/20 hover:bg-white/20"
                            )}
                          >
                            <span className="mr-1">{meta.emoji}</span>
                            {meta.label}
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  <div className="mt-auto flex gap-2 pt-2">
                    <Button onClick={handleFav} className="flex-1">
                      ★ Favoritar este avatar
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="py-24 text-center text-white/60">Nenhum avatar selecionado</div>
              )}
            </div>
          </div>
        )}
      </div>
    </section>
  )
}

function ClassicPane({ onUse, currentKind }: { onUse: () => void; currentKind?: "dicebear" | "3d" }) {
  return (
    <div className="rounded-2xl bg-black/30 p-6 text-white ring-1 ring-white/10 backdrop-blur">
      <h2 className="text-xl font-bold">Avatar Clássico (DiceBear)</h2>
      <p className="mt-2 max-w-prose text-white/80">
        O avatar clássico é o que você personaliza ao entrar em um jogo (cor de pele, cabelo, expressões, hijab, acessórios).
        Aqui você apenas volta a usar a versão clássica; a customização continua disponível ao entrar em uma partida.
      </p>
      <div className="mt-6 flex items-center gap-3">
        <Button onClick={onUse}>
          {currentKind === "dicebear" ? "Já é o atual" : "Usar avatar clássico"}
        </Button>
        {currentKind === "dicebear" && (
          <span className="rounded-full bg-emerald-400/20 px-3 py-1 text-xs font-semibold text-emerald-100 ring-1 ring-emerald-300/50">
            Em uso
          </span>
        )}
      </div>
    </div>
  )
}
