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

type BgPreset = {
  id: string
  label: string
  css: string
  swatch: string
}

const BACKGROUNDS: BgPreset[] = [
  {
    id: "studio",
    label: "Studio",
    css: "linear-gradient(180deg, #2b2746 0%, #4c3f79 60%, #1a1731 100%)",
    swatch: "linear-gradient(180deg, #4c3f79, #1a1731)",
  },
  {
    id: "sky",
    label: "Céu",
    css: "linear-gradient(180deg, #7ec8ff 0%, #bae1ff 55%, #fff7d6 100%)",
    swatch: "linear-gradient(180deg, #7ec8ff, #fff7d6)",
  },
  {
    id: "sunset",
    label: "Pôr-do-sol",
    css: "linear-gradient(180deg, #ff9a6b 0%, #ff5f8f 55%, #6f3d9e 100%)",
    swatch: "linear-gradient(180deg, #ff9a6b, #6f3d9e)",
  },
  {
    id: "forest",
    label: "Floresta",
    css: "linear-gradient(180deg, #2e5d4b 0%, #68a683 55%, #c6ebc5 100%)",
    swatch: "linear-gradient(180deg, #2e5d4b, #c6ebc5)",
  },
  {
    id: "night",
    label: "Noite",
    css: "radial-gradient(ellipse at 50% 10%, #3b2f75 0%, #110a2b 60%, #000000 100%)",
    swatch: "radial-gradient(circle at 50% 30%, #3b2f75, #000)",
  },
]

const VRMViewer = dynamic(() => import("@rahoot/web/components/avatar/VRMViewer"), { ssr: false })

const asset = (rel: string) => `/api/avatar3d/${rel}`

const getStoredName = (): string => { try { return localStorage.getItem(STORAGE_KEY) || "" } catch { return "" } }
const getStoredFav = (): string => { try { return localStorage.getItem(FAV_3D_KEY) || "" } catch { return "" } }
const saveStoredFav = (id: string) => { try { localStorage.setItem(FAV_3D_KEY, id) } catch {} }

// DiceBear options (mirrored from join/Username.tsx)
const SKIN_COLORS = [
  "f8d9c0", "f2d3b1", "e8b98a", "c68642",
  "9e5622", "8d5524", "613d26", "4a2912",
]
const HAIR_STYLES = [
  { id: "shortHair", label: "Short" },
  { id: "mohawk", label: "Mohawk" },
  { id: "curlyShortHair", label: "Curly" },
  { id: "shavedHead", label: "Shaved" },
  { id: "bunHair", label: "Bun" },
  { id: "straightHair", label: "Straight" },
  { id: "bangs", label: "Bangs" },
  { id: "wavyBob", label: "Wavy" },
  { id: "bowlCutHair", label: "Bowl" },
  { id: "curlyBob", label: "Bob" },
  { id: "froBun", label: "Fro" },
  { id: "braids", label: "Braids" },
]
const HAIR_COLORS = [
  "000000", "2c1b18", "8b4513", "c94e28",
  "d2691e", "e8c41a", "daa520", "c0c0c0",
]
const ACCESSORIES = [
  { id: "none", label: "Nenhum" },
  { id: "glasses", label: "Óculos" },
  { id: "sunglasses", label: "Shades" },
  { id: "catEars", label: "Orelhas" },
  { id: "sailormoonCrown", label: "Coroa" },
  { id: "mustache", label: "Bigode" },
  { id: "faceMask", label: "Máscara" },
  { id: "clownNose", label: "Palhaço" },
  { id: "sleepMask", label: "Sleep" },
  { id: "hijab", label: "Hijab" },
]
const HIJAB_COLORS = [
  "000000", "1a3c5e", "2f4f4f", "3c3c3c",
  "800020", "5c2d91", "8b4513", "704214",
  "c4a882", "e8d5b7", "f5e6d3", "ffffff",
  "87ceeb", "e6a8d7", "cc7a6f", "b5651d",
]
const HIJAB_EXPRESSIONS = [
  { id: "smile", eyes: "happy", mouth: "smile", label: "Feliz" },
  { id: "default", eyes: "default", mouth: "default", label: "Neutro" },
  { id: "serious", eyes: "default", mouth: "serious", label: "Sério" },
  { id: "wink", eyes: "wink", mouth: "twinkle", label: "Piscada" },
  { id: "surprised", eyes: "surprised", mouth: "disbelief", label: "Surpreso" },
  { id: "shy", eyes: "squint", mouth: "smile", label: "Tímido" },
  { id: "sad", eyes: "cry", mouth: "sad", label: "Triste" },
  { id: "cool", eyes: "hearts", mouth: "twinkle", label: "Apaixonado" },
]
const BS_EXPRESSIONS = [
  { id: "cheery", label: "Feliz" },
  { id: "normal", label: "Normal" },
  { id: "starstruck", label: "Estrela" },
  { id: "winking", label: "Piscada" },
  { id: "confused", label: "Confuso" },
  { id: "sleepy", label: "Sonolento" },
  { id: "sad", label: "Triste" },
  { id: "angry", label: "Bravo" },
]

const randomItem = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)]
const randomSeed = () => Math.random().toString(36).substring(2, 10)

const buildClassicUrl = (seed: string, skin: string, hair: string, hairColor: string, accessory: string, hijabColor: string, hijabExpr: string, bsExpr: string) => {
  if (accessory === "hijab") {
    const expr = HIJAB_EXPRESSIONS.find(e => e.id === hijabExpr) || HIJAB_EXPRESSIONS[0]
    return `/api/avatar?style=avataaars&seed=${encodeURIComponent(seed)}&skin=${skin}&hijabColor=${hijabColor}&mouth=${expr.mouth}&eyes=${expr.eyes}`
  }
  let url = `/api/avatar?style=bigSmile&seed=${encodeURIComponent(seed)}&skin=${skin}&hair=${hair}&hairColor=${hairColor}&eyes=${bsExpr}`
  if (accessory !== "none") url += `&acc=${accessory}`
  return url
}

export default function AvatarPickerPage() {
  const router = useRouter()
  const { socket, isConnected, connect } = useSocket()

  const [realName, setRealName] = useState<string>("")
  const [tab, setTab] = useState<"classic" | "3d">("3d")
  const [catalog, setCatalog] = useState<CatalogResp | null>(null)
  const [profile, setProfile] = useState<ProfileResp | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [favoriteId, setFavoriteId] = useState<string | null>(null)
  const [activeAnim, setActiveAnim] = useState<string>("idle-offensive")
  const [autoRotate, setAutoRotate] = useState(false)
  const [query, setQuery] = useState("")
  const [savedFlash, setSavedFlash] = useState(false)
  const [bg, setBg] = useState<BgPreset>(BACKGROUNDS[0])

  useEffect(() => {
    setRealName(getStoredName())
    const fav = getStoredFav()
    if (fav) { setFavoriteId(fav); setSelectedId(fav) }
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
    const onProfile = (resp: ProfileResp) => {
      setProfile(resp)
      const id = resp.player?.avatar3dId
      if (id && !favoriteId) setFavoriteId(id)
    }
    const onSaved = (resp: { ok: boolean; reason?: string }) => {
      if (resp.ok) {
        setSavedFlash(true)
        setTimeout(() => setSavedFlash(false), 1800)
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
  }, [socket, isConnected, realName, selectedId, favoriteId])

  const avatars = useMemo<CatalogAvatar[]>(() => (catalog?.ok ? catalog.avatars : []), [catalog])
  const animations = useMemo<CatalogAnim[]>(
    () => (catalog?.ok ? catalog.animations.filter(a => a.id !== "idle") : []),
    [catalog]
  )
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

  const isFavorite = selected !== null && favoriteId === selected.id

  const handleFav = useCallback(() => {
    if (!selected || !realName) return
    saveStoredFav(selected.id)
    setFavoriteId(selected.id)
    ;(socket as any)?.emit("avatar3d:save", {
      realName,
      kind: "3d",
      avatar3dId: selected.id,
    })
  }, [selected, realName, socket])

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
        <header className="flex flex-col gap-3">
          <div className="flex items-center justify-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/atreat-logo.png"
              alt="Angel TREAT"
              style={{ height: 22, width: "auto", opacity: 0.55 }}
            />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
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
          </div>
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
          <ClassicPane
            realName={realName}
            currentKind={profile?.player?.avatarKind}
            onSaved={() => { setSavedFlash(true); setTimeout(() => setSavedFlash(false), 1800) }}
            socket={socket}
          />
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
                {filtered.map(a => {
                  const isSel = selectedId === a.id
                  const isFav = favoriteId === a.id
                  return (
                    <button
                      key={a.id}
                      onClick={() => setSelectedId(a.id)}
                      className={clsx(
                        "group relative aspect-square overflow-hidden rounded-xl bg-white/5 ring-1 ring-white/10 transition hover:ring-white/40",
                        isSel && "ring-2 ring-amber-300 ring-offset-2 ring-offset-black/30"
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
                      {isFav && (
                        <span
                          aria-label="Favorito"
                          className="absolute right-1 top-1 rounded-full bg-amber-300 px-1 text-[10px] font-black text-indigo-900 shadow"
                        >
                          ★
                        </span>
                      )}
                      <span className="absolute bottom-0 left-0 right-0 truncate bg-black/60 px-1 py-0.5 text-center text-[10px] font-semibold text-white">
                        {a.displayName}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Right: selected state */}
            <div className="rounded-2xl bg-black/30 p-4 ring-1 ring-white/10 backdrop-blur">
              {selected ? (
                <div className="flex h-full flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-xs uppercase tracking-wider text-white/50">Selecionado</div>
                      <div className="flex items-center gap-2">
                        <div className="text-lg font-bold text-white">{selected.displayName}</div>
                        {isFavorite && (
                          <span className="rounded-full bg-amber-300 px-2 py-0.5 text-[10px] font-black text-indigo-900 shadow">
                            ★ Favorito
                          </span>
                        )}
                      </div>
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
                      <div className="mt-2 text-center">
                        <div className="text-[11px] font-bold text-white">{realName}</div>
                        <div className="text-[10px] text-white/50">#{selected.number} · {selected.series}</div>
                      </div>
                    </div>
                    <div
                      className="relative h-[420px] w-full overflow-hidden rounded-xl ring-1 ring-white/10"
                      style={{ background: bg.css }}
                    >
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

                  {/* Backgrounds */}
                  <div>
                    <div className="mb-2 text-xs font-bold uppercase tracking-wider text-white/60">Cenário</div>
                    <div className="flex flex-wrap gap-2">
                      {BACKGROUNDS.map(p => (
                        <button
                          key={p.id}
                          onClick={() => setBg(p)}
                          className={clsx(
                            "flex items-center gap-2 rounded-full px-2 py-1 text-xs font-semibold ring-1 transition",
                            bg.id === p.id ? "ring-amber-300/70 bg-white/10 text-white" : "ring-white/20 bg-white/5 text-white/80 hover:bg-white/15"
                          )}
                        >
                          <span
                            aria-hidden
                            className="inline-block h-4 w-4 rounded-full ring-1 ring-black/30"
                            style={{ background: p.swatch }}
                          />
                          {p.label}
                        </button>
                      ))}
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
                    <button
                      onClick={handleFav}
                      className={clsx(
                        "flex-1 rounded-xl px-4 py-2 text-sm font-bold transition shadow",
                        isFavorite
                          ? "bg-amber-300 text-indigo-900 ring-2 ring-amber-200"
                          : "bg-white text-indigo-900 hover:brightness-110"
                      )}
                    >
                      {isFavorite ? "★ Favorito (salvo)" : "★ Favoritar este avatar"}
                    </button>
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

// Classic pane — full DiceBear customizer
function ClassicPane({
  realName,
  currentKind,
  onSaved,
  socket,
}: {
  realName: string
  currentKind?: "dicebear" | "3d"
  onSaved: () => void
  socket: any
}) {
  const [seed, setSeed] = useState(randomSeed())
  const [skin, setSkin] = useState(randomItem(SKIN_COLORS))
  const [hair, setHair] = useState("shortHair")
  const [hairColor, setHairColor] = useState(randomItem(HAIR_COLORS))
  const [accessory, setAccessory] = useState("none")
  const [hijabColor, setHijabColor] = useState("1a3c5e")
  const [hijabExpr, setHijabExpr] = useState("smile")
  const [bsExpr, setBsExpr] = useState("cheery")

  useEffect(() => {
    try {
      const raw = localStorage.getItem(AVATAR_KEY)
      if (!raw) return
      const c = JSON.parse(raw)
      if (c.seed) setSeed(c.seed)
      if (c.skin) setSkin(c.skin)
      if (c.hair) setHair(c.hair)
      if (c.hairColor) setHairColor(c.hairColor)
      if (c.accessory) setAccessory(c.accessory)
      if (c.hijabColor) setHijabColor(c.hijabColor)
      if (c.hijabExpr) setHijabExpr(c.hijabExpr)
      if (c.bsExpr) setBsExpr(c.bsExpr)
    } catch {}
  }, [])

  const avatarUrl = buildClassicUrl(seed, skin, hair, hairColor, accessory, hijabColor, hijabExpr, bsExpr)
  const avatarConfig = JSON.stringify({ seed, skin, hair, hairColor, accessory, hijabColor, hijabExpr, bsExpr, useAvatar: true })

  const handleShuffle = useCallback(() => {
    setSeed(randomSeed())
    setSkin(randomItem(SKIN_COLORS))
    setHair(randomItem(HAIR_STYLES).id)
    setHairColor(randomItem(HAIR_COLORS))
    setAccessory(randomItem(["none", "none", "none", "glasses", "sunglasses", "catEars", "sailormoonCrown", "mustache"]))
  }, [])

  const handleSave = useCallback(() => {
    if (!realName) return
    try { localStorage.setItem(AVATAR_KEY, avatarConfig) } catch {}
    ;(socket as any)?.emit("avatar3d:save", {
      realName,
      kind: "dicebear",
      avatarJson: avatarConfig,
    })
    onSaved()
  }, [realName, avatarConfig, socket, onSaved])

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_1.4fr]">
      {/* Preview */}
      <div className="rounded-2xl bg-black/30 p-4 ring-1 ring-white/10 backdrop-blur">
        <div className="flex flex-col items-center gap-3">
          <div className="h-48 w-48 overflow-hidden rounded-3xl border-4 border-white bg-white shadow-lg">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={avatarUrl}
              alt="Avatar"
              className="h-full w-full object-contain p-2"
              onError={(e) => { (e.target as HTMLImageElement).style.display = "none" }}
            />
          </div>
          <button
            onClick={handleShuffle}
            className="rounded-full bg-white/90 px-4 py-1.5 text-xs font-bold text-indigo-900 shadow hover:brightness-110 active:scale-95 transition"
          >
            🎲 Shuffle
          </button>
          <div className="text-center">
            <div className="text-[11px] font-bold text-white">{realName}</div>
            <div className="text-[10px] text-white/50">Avatar Clássico (DiceBear)</div>
          </div>
        </div>

        <div className="mt-4 flex items-center gap-2">
          <button
            onClick={handleSave}
            className="flex-1 rounded-xl bg-white px-4 py-2 text-sm font-bold text-indigo-900 shadow hover:brightness-110 transition"
          >
            Salvar avatar clássico
          </button>
          {currentKind === "dicebear" && (
            <span className="rounded-full bg-emerald-400/25 px-3 py-1 text-xs font-semibold text-emerald-100 ring-1 ring-emerald-300/50">
              Em uso
            </span>
          )}
        </div>
      </div>

      {/* Controls */}
      <div className="rounded-2xl bg-black/30 p-4 ring-1 ring-white/10 backdrop-blur">
        <div className="flex flex-col gap-4">
          <div>
            <div className="mb-2 text-xs font-bold uppercase tracking-wider text-white/60">Pele</div>
            <div className="flex flex-wrap gap-2">
              {SKIN_COLORS.map(c => (
                <button
                  key={c}
                  onClick={() => setSkin(c)}
                  className={clsx(
                    "h-8 w-8 rounded-full border-[3px] transition-all",
                    skin === c ? "border-amber-300 scale-110 shadow-md" : "border-white/20 hover:scale-105"
                  )}
                  style={{ backgroundColor: `#${c}` }}
                  title={`#${c}`}
                />
              ))}
            </div>
          </div>

          <div>
            <div className="mb-2 text-xs font-bold uppercase tracking-wider text-white/60">Acessório</div>
            <div className="flex flex-wrap gap-1.5">
              {ACCESSORIES.map(a => (
                <button
                  key={a.id}
                  onClick={() => setAccessory(a.id)}
                  className={clsx(
                    "rounded-full px-3 py-1 text-xs font-semibold ring-1 transition",
                    accessory === a.id ? "bg-amber-300 text-indigo-900 ring-amber-300" : "bg-white/10 text-white ring-white/20 hover:bg-white/20"
                  )}
                >
                  {a.label}
                </button>
              ))}
            </div>
          </div>

          {accessory !== "hijab" ? (
            <>
              <div>
                <div className="mb-2 text-xs font-bold uppercase tracking-wider text-white/60">Cor do cabelo</div>
                <div className="flex flex-wrap gap-2">
                  {HAIR_COLORS.map(c => (
                    <button
                      key={c}
                      onClick={() => setHairColor(c)}
                      className={clsx(
                        "h-8 w-8 rounded-full border-[3px] transition-all",
                        hairColor === c ? "border-amber-300 scale-110 shadow-md" : "border-white/20 hover:scale-105"
                      )}
                      style={{ backgroundColor: `#${c}` }}
                      title={`#${c}`}
                    />
                  ))}
                </div>
              </div>

              <div>
                <div className="mb-2 text-xs font-bold uppercase tracking-wider text-white/60">Estilo</div>
                <div className="flex flex-wrap gap-1.5">
                  {HAIR_STYLES.map(h => (
                    <button
                      key={h.id}
                      onClick={() => setHair(h.id)}
                      className={clsx(
                        "rounded-full px-3 py-1 text-xs font-semibold ring-1 transition",
                        hair === h.id ? "bg-amber-300 text-indigo-900 ring-amber-300" : "bg-white/10 text-white ring-white/20 hover:bg-white/20"
                      )}
                    >
                      {h.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="mb-2 text-xs font-bold uppercase tracking-wider text-white/60">Expressão</div>
                <div className="flex flex-wrap gap-1.5">
                  {BS_EXPRESSIONS.map(e => (
                    <button
                      key={e.id}
                      onClick={() => setBsExpr(e.id)}
                      className={clsx(
                        "rounded-full px-3 py-1 text-xs font-semibold ring-1 transition",
                        bsExpr === e.id ? "bg-amber-300 text-indigo-900 ring-amber-300" : "bg-white/10 text-white ring-white/20 hover:bg-white/20"
                      )}
                    >
                      {e.label}
                    </button>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <>
              <div>
                <div className="mb-2 text-xs font-bold uppercase tracking-wider text-white/60">Cor do hijab</div>
                <div className="flex flex-wrap gap-2">
                  {HIJAB_COLORS.map(c => (
                    <button
                      key={c}
                      onClick={() => setHijabColor(c)}
                      className={clsx(
                        "h-8 w-8 rounded-full border-[3px] transition-all",
                        hijabColor === c ? "border-amber-300 scale-110 shadow-md" : "border-white/20 hover:scale-105"
                      )}
                      style={{ backgroundColor: `#${c}` }}
                      title={`#${c}`}
                    />
                  ))}
                </div>
              </div>

              <div>
                <div className="mb-2 text-xs font-bold uppercase tracking-wider text-white/60">Expressão</div>
                <div className="flex flex-wrap gap-1.5">
                  {HIJAB_EXPRESSIONS.map(e => (
                    <button
                      key={e.id}
                      onClick={() => setHijabExpr(e.id)}
                      className={clsx(
                        "rounded-full px-3 py-1 text-xs font-semibold ring-1 transition",
                        hijabExpr === e.id ? "bg-amber-300 text-indigo-900 ring-amber-300" : "bg-white/10 text-white ring-white/20 hover:bg-white/20"
                      )}
                    >
                      {e.label}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
