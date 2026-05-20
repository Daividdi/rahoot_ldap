"use client"

import { CommonStatusDataMap } from "@rahoot/common/types/game/status"
import useScreenSize from "@rahoot/web/hooks/useScreenSize"
import { useSocket } from "@rahoot/web/contexts/socketProvider"
import { usePlayerStore } from "@rahoot/web/stores/player"
import clsx from "clsx"
import { useEffect, useState, useRef } from "react"
import ReactConfetti from "react-confetti"
import { motion, AnimatePresence } from "motion/react"
// Inline icon components — no lucide-react dependency needed
const IconTrophy = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M8 21h8m-4-4v4M5 3h14l-1 6a5 5 0 01-10 0L5 3zM5 3H3m16 0h2" />
  </svg>
)
const IconX = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
  </svg>
)
const IconCheck = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
)
const IconXCircle = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
)
const IconMinus = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
)

type Props = { data: CommonStatusDataMap["FINISHED"] }

const REACTIONS = [
  { id: "heart", url: "/emojis/heart.png", label: "Love",     bg: "bg-red-500/80",    activeBg: "bg-red-500"    },
  { id: "clap",  url: "/emojis/clap.png",  label: "Applause", bg: "bg-amber-500/80",  activeBg: "bg-amber-500"  },
  { id: "laugh", url: "/emojis/laugh.png", label: "Laugh",    bg: "bg-yellow-400/80", activeBg: "bg-yellow-400" },
  { id: "wow",   url: "/emojis/wow.png",   label: "Wow",      bg: "bg-blue-500/80",   activeBg: "bg-blue-500"   },
  { id: "br",    url: "🇧🇷",               label: "Brazil",   bg: "bg-green-700/80",  activeBg: "bg-green-700"  },
  { id: "my",    url: "🇲🇾",               label: "Malaysia",  bg: "bg-red-700/80",    activeBg: "bg-red-700"    },
  { id: "cn",    url: "🇨🇳",               label: "China",    bg: "bg-red-800/80",    activeBg: "bg-red-800"    },
]

type Particle = { id: number; url: string; x: number; size: number; drift: number }
type FullResults = { quizId: string; quizTitle: string; players: any[] }

// Apparition timing mirrors Podium.tsx (manager side) so both screens are in sync.
// delays[apparition] = ms to wait before advancing to next stage.
// Stage meanings:
//   0 → 1  : 3 s  — 3rd place rises
//   1 → 2  : 4 s  — 2nd place rises
//   2 → 3  : 2.5s — spotlight flares, drum roll starts
//   3 → 4  : 4 s  — 1st place rises + fanfare
//   4 → 5  : 3 s  — confetti + bounce
//   5+     : done
const APPARITION_DELAYS = [3000, 4000, 2500, 4000, 3000, 99999]

const PodiumAvatar = ({ player, size, delay = 0 }: { player: any; size: number; delay?: number }) => (
  <motion.div
    animate={{ y: [0, -6, 0, -3, 0], rotate: [0, -3, 0, 3, 0], scale: [1, 1.05, 1, 1.03, 1] }}
    transition={{ duration: 3.5, repeat: Infinity, ease: "easeInOut", delay }}
  >
    <div className="overflow-hidden rounded-2xl border-4 border-white bg-white shadow-xl" style={{ width: size, height: size }}>
      {player.avatarUrl ? (
        <div className="relative h-full w-full">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={player.avatarUrl} alt="" className="h-full w-full object-contain p-1"
            onError={(e) => { e.currentTarget.style.display = "none"; e.currentTarget.nextElementSibling?.classList.remove("hidden") }} />
          <div className="hidden absolute inset-0 flex items-center justify-center bg-primary/10 font-bold text-primary" style={{ fontSize: size * 0.4 }}>
            {(player.username || "?").charAt(0).toUpperCase()}
          </div>
        </div>
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-primary/10 font-bold text-primary" style={{ fontSize: size * 0.4 }}>
          {(player.username || "?").charAt(0).toUpperCase()}
        </div>
      )}
    </div>
  </motion.div>
)

type SortBy = "total" | "average" | "balanced"
type LeaderboardEntry = { realName: string; points: number; avgPoints: number; sessions: number; correct: number }

function ResultsPanel({
  results, currentUsername, onClose, socket, gameId,
}: {
  results: FullResults; currentUsername: string; onClose: () => void
  socket: any; gameId: string | null
}) {
  const [tab, setTab] = useState<"ranking" | "answers" | "monthly">("ranking")
  const [minSessions, setMinSessions] = useState(1)
  const [sortBy, setSortBy] = useState<SortBy>("total")
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([])
  const [lbLoading, setLbLoading] = useState(false)

  const me = results.players.find(p => (p.username || "").toLowerCase() === currentUsername.toLowerCase())
  const myRank      = me ? results.players.indexOf(me) + 1 : null
  const myAnswers   = (me?.answers as any[]) || []
  const myCorrect   = myAnswers.filter(a => a.isCorrect === true).length
  const myIncorrect = myAnswers.filter(a => !a.isCorrect && a.selectedAnswer !== "Não respondeu" && a.selectedAnswer !== "Not answered" && a.selectedAnswer !== -1).length
  const myUnanswered = myAnswers.filter(a => a.selectedAnswer === "Não respondeu" || a.selectedAnswer === "Not answered" || a.selectedAnswer === -1).length

  // Fetch monthly leaderboard whenever tab is active or filters change
  useEffect(() => {
    if (tab !== "monthly" || !socket) return
    setLbLoading(true)
    const handler = ({ leaderboard: lb }: { history: any[]; leaderboard: LeaderboardEntry[] }) => {
      setLeaderboard(lb)
      setLbLoading(false)
    }
    ;(socket as any).once("player:history", handler)
    ;(socket as any).emit("player:getHistory", { realName: currentUsername, minSessions, sortBy })
    return () => { (socket as any).off("player:history", handler) }
  }, [tab, minSessions, sortBy, socket, currentUsername])

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[200] flex flex-col justify-end bg-black/60 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <motion.div
        initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
        className="flex flex-col rounded-t-3xl bg-gray-900 text-white"
        style={{ maxHeight: "88vh" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 shrink-0">
          <div>
            <p className="text-xs text-gray-400 font-semibold uppercase tracking-widest">Results</p>
            <h2 className="text-lg font-bold leading-tight">{results.quizTitle}</h2>
          </div>
          <button onClick={onClose} className="rounded-full bg-white/10 p-2 hover:bg-white/20 transition-colors">
            <IconX className="h-5 w-5" />
          </button>
        </div>

        {/* My stats summary */}
        {me && (
          <div className="mx-4 mt-4 mb-2 rounded-2xl bg-primary/20 border border-primary/30 px-4 py-3 grid grid-cols-4 gap-2 text-center shrink-0">
            <div><p className="text-2xl font-bold text-primary">{myRank}º</p><p className="text-[10px] text-gray-400 font-semibold">Rank</p></div>
            <div><p className="text-2xl font-bold text-white">{me.points}</p><p className="text-[10px] text-gray-400 font-semibold">pts</p></div>
            <div><p className="text-2xl font-bold text-green-400">{myCorrect}</p><p className="text-[10px] text-gray-400 font-semibold">Certas</p></div>
            <div><p className="text-2xl font-bold text-red-400">{myIncorrect}</p><p className="text-[10px] text-gray-400 font-semibold">Erradas</p></div>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 px-4 py-2 shrink-0">
          {([
            { id: "ranking",  label: `Ranking (${results.players.length})` },
            { id: "answers",  label: "Minhas Respostas" },
            { id: "monthly",  label: "Top Mensal" },
          ] as const).map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={clsx("flex-1 rounded-lg py-2 text-xs font-semibold transition-colors",
                tab === t.id ? "bg-primary text-white" : "bg-white/10 text-gray-400 hover:bg-white/15"
              )}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Monthly leaderboard filters */}
        {tab === "monthly" && (
          <div className="flex items-center gap-2 px-4 pb-2 shrink-0 flex-wrap">
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider">Min games</span>
              {[1, 2, 3, 5].map(n => (
                <button key={n} onClick={() => setMinSessions(n)}
                  className={clsx("rounded-lg px-2.5 py-1 text-xs font-bold transition-colors",
                    minSessions === n ? "bg-primary text-white" : "bg-white/10 text-gray-400 hover:bg-white/20"
                  )}>
                  {n}+
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1.5 ml-auto">
              <span className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider">Ordenar</span>
              {([
                { id: "total",    label: "Total" },
                { id: "average",  label: "Média" },
                { id: "balanced", label: "Balanceado" },
              ] as const).map(s => (
                <button key={s.id} onClick={() => setSortBy(s.id)}
                  className={clsx("rounded-lg px-2.5 py-1 text-xs font-bold transition-colors",
                    sortBy === s.id ? "bg-primary text-white" : "bg-white/10 text-gray-400 hover:bg-white/20"
                  )}>
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Scrollable content */}
        <div className="overflow-y-auto flex-1 px-4 pb-6">
          {tab === "ranking" && (
            <div className="flex flex-col gap-1 pt-1">
              {results.players.map((p, i) => {
                const isMe = (p.username || "").toLowerCase() === currentUsername.toLowerCase()
                return (
                  <div key={i} className={clsx("flex items-center gap-3 rounded-xl px-3 py-2.5",
                    isMe ? "bg-primary/25 border border-primary/40" : "bg-white/5"
                  )}>
                    <span className={clsx("w-7 text-center font-bold shrink-0",
                      i === 0 ? "text-amber-400 text-lg" : i === 1 ? "text-gray-300 text-base" : i === 2 ? "text-amber-700 text-base" : "text-gray-500 text-sm"
                    )}>{i + 1}</span>
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-primary/20 font-bold text-primary text-sm">
                      {(p.username || "?").charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={clsx("font-semibold text-sm truncate", isMe ? "text-white" : "text-gray-200")}>
                        {p.username}{isMe && <span className="ml-2 text-[10px] text-primary font-bold">You</span>}
                      </p>
                      {p.answers?.length > 0 && (
                        <p className="text-[10px] text-gray-500">
                          {p.answers.filter((a: any) => a.isCorrect).length}/{p.answers.length} certas
                        </p>
                      )}
                    </div>
                    <span className="font-bold text-white shrink-0">{p.points} <span className="text-[10px] text-gray-400">pts</span></span>
                  </div>
                )
              })}
            </div>
          )}
          {tab === "answers" && (
            <div className="flex flex-col gap-2 pt-1">
              {myAnswers.length === 0 ? (
                <p className="text-center text-gray-500 py-8 text-sm">Nenhuma resposta registrada.</p>
              ) : myAnswers.map((a, i) => (
                <div key={i} className={clsx("rounded-xl p-3 border",
                  a.isCorrect ? "bg-green-900/30 border-green-700/40" :
                  (a.selectedAnswer === "Não respondeu" || a.selectedAnswer === "Not answered" || a.selectedAnswer === -1) ? "bg-gray-800/60 border-gray-700/40" :
                  "bg-red-900/30 border-red-700/40"
                )}>
                  <div className="flex items-start gap-2">
                    {a.isCorrect
                      ? <IconCheck className="h-4 w-4 text-green-400 shrink-0 mt-0.5" />
                      : (a.selectedAnswer === "Não respondeu" || a.selectedAnswer === "Not answered" || a.selectedAnswer === -1)
                        ? <IconMinus className="h-4 w-4 text-gray-400 shrink-0 mt-0.5" />
                        : <IconXCircle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
                    }
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-200 font-medium leading-snug">{a.questionTitle}</p>
                      <p className={clsx("text-xs mt-0.5",
                        a.isCorrect ? "text-green-400" :
                        (a.selectedAnswer === "Não respondeu" || a.selectedAnswer === "Not answered" || a.selectedAnswer === -1) ? "text-gray-500" : "text-red-400"
                      )}>{a.selectedAnswer}</p>
                    </div>
                  </div>
                </div>
              ))}
              {myAnswers.length > 0 && (
                <div className="flex justify-center gap-6 pt-3 pb-1 border-t border-white/10 mt-1">
                  <div className="text-center"><p className="text-2xl font-bold text-green-400">{myCorrect}</p><p className="text-xs text-gray-500">Certas</p></div>
                  <div className="text-center"><p className="text-2xl font-bold text-red-400">{myIncorrect}</p><p className="text-xs text-gray-500">Erradas</p></div>
                  {myUnanswered > 0 && <div className="text-center"><p className="text-2xl font-bold text-gray-400">{myUnanswered}</p><p className="text-xs text-gray-500">Sem resp.</p></div>}
                </div>
              )}
            </div>
          )}
          {tab === "monthly" && (
            <div className="flex flex-col gap-1 pt-1">
              {lbLoading ? (
                <div className="flex flex-col items-center gap-3 py-10">
                  <div className="h-8 w-8 rounded-full border-4 border-primary border-t-transparent animate-spin" />
                  <p className="text-xs text-gray-500">Loading monthly ranking…</p>
                </div>
              ) : leaderboard.length === 0 ? (
                <p className="text-center text-gray-500 py-8 text-sm">Nenhum jogador encontrado com os filtros selecionados.</p>
              ) : (
                <>
                  <p className="text-[10px] text-gray-500 text-center pb-1">
                    {sortBy === "total" ? "Ordenado por pontos totais" :
                     sortBy === "average" ? "Ordenado por média por jogo" :
                     "Sorted by average × participation"}
                  </p>
                  {leaderboard.map((e, i) => {
                    const isMe = norm(e.realName) === norm(currentUsername)
                    return (
                      <div key={i} className={clsx("flex items-center gap-3 rounded-xl px-3 py-2.5",
                        isMe ? "bg-primary/25 border border-primary/40" : "bg-white/5"
                      )}>
                        <span className={clsx("w-7 text-center font-bold shrink-0",
                          i === 0 ? "text-amber-400 text-lg" : i === 1 ? "text-gray-300 text-base" : i === 2 ? "text-amber-700 text-base" : "text-gray-500 text-sm"
                        )}>{i + 1}</span>
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-primary/20 font-bold text-primary text-sm">
                          {(e.realName || "?").charAt(0).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className={clsx("font-semibold text-sm truncate", isMe ? "text-white" : "text-gray-200")}>
                            {e.realName}{isMe && <span className="ml-2 text-[10px] text-primary font-bold">You</span>}
                          </p>
                          <p className="text-[10px] text-gray-500">
                            {e.sessions} {e.sessions === 1 ? "jogo" : "jogos"} · média {e.avgPoints} pts
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="font-bold text-white text-sm">{e.points} <span className="text-[10px] text-gray-400">pts</span></p>
                          {sortBy !== "total" && <p className="text-[10px] text-gray-400">~{e.avgPoints}/jogo</p>}
                        </div>
                      </div>
                    )
                  })}
                </>
              )}
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  )
}

// normalise helper used in ResultsPanel leaderboard
const norm = (s: string) => (s || "").toLowerCase().trim().replace(/\s+/g, ' ')

const PlayerPodium = ({ data: { subject, top } }: Props) => {
  const { width, height }                       = useScreenSize()
  const { socket }                              = useSocket()
  const { gameId, player }                       = usePlayerStore()
  const username                                 = player?.username ?? ""
  const [apparition, setApparition]             = useState(0)
  const [particles, setParticles]               = useState<Particle[]>([])
  const [fullResults, setFullResults]           = useState<FullResults | null>(null)
  const [resultsLoading, setResultsLoading]     = useState(false)
  const [showResultsBtn, setShowResultsBtn]     = useState(false)
  const [showResultsPanel, setShowResultsPanel] = useState(false)
  const [feedbackRating, setFeedbackRating]     = useState(0)
  const [hoverRating, setHoverRating]           = useState(0)
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false)
  const [showFeedback, setShowFeedback]         = useState(false)
  const particleCounter = useRef(0)
  const lastReactionAt  = useRef(0)
  const animationDone   = useRef(false)
  const MAX_PARTICLES   = 14
  const THROTTLE_MS     = 280

  // ── Apparition sequence (same logic as manager's Podium.tsx) ─────────────────
  useEffect(() => {
    if (animationDone.current) return
    if (top.length < 3) {
      setApparition(5)
      animationDone.current = true
      return
    }
    const delay = APPARITION_DELAYS[apparition] ?? 4000
    const t = setTimeout(() => {
      setApparition(v => {
        const next = v + 1
        if (next >= 5) animationDone.current = true
        return next
      })
    }, delay)
    return () => clearTimeout(t)
  }, [apparition, top.length])

  // Show "Ver Resultados" button once 3rd place has risen (apparition >= 1 + some buffer)
  useEffect(() => {
    const t = setTimeout(() => setShowResultsBtn(true), 5000)
    return () => clearTimeout(t)
  }, [])

  // Show feedback form after podium animation completes (~14 s total)
  useEffect(() => {
    const t = setTimeout(() => setShowFeedback(true), 14000)
    return () => clearTimeout(t)
  }, [])

  const handleFeedbackSubmit = () => {
    const rating = feedbackRating || 5
    if (gameId) (socket as any)?.emit("player:submitFeedback", { gameId, rating })
    setFeedbackSubmitted(true)
  }

  const handleFeedbackSkip = () => {
    setShowFeedback(false)
  }

  // ── Socket: receive full results ─────────────────────────────────────────────
  useEffect(() => {
    if (!socket) return
    const handler = (data: FullResults) => {
      setFullResults(data)
      setResultsLoading(false)
    }
    ;(socket as any).on("game:fullResults", handler)
    // Request on mount in case broadcast was already sent before component mounted
    if (gameId) {
      (socket as any).emit("player:requestResults", { gameId })
    }
    return () => { (socket as any).off("game:fullResults", handler) }
  }, [socket, gameId])

  // ── Socket: floating reaction particles ──────────────────────────────────────
  useEffect(() => {
    if (!socket) return
    const handler = ({ reactionUrl }: { reactionUrl: string }) => {
      const now = Date.now()
      if (now - lastReactionAt.current < THROTTLE_MS) return
      lastReactionAt.current = now
      const p: Particle = { id: ++particleCounter.current, url: reactionUrl, x: 10 + Math.random() * 80, size: 56 + Math.random() * 32, drift: (Math.random() - 0.5) * 120 }
      setParticles(prev => { const next = [...prev, p]; return next.length > MAX_PARTICLES ? next.slice(next.length - MAX_PARTICLES) : next })
      setTimeout(() => setParticles(prev => prev.filter(pt => pt.id !== p.id)), 4200)
    }
    ;(socket as any).on("game:reaction", handler)
    return () => { (socket as any).off("game:reaction", handler) }
  }, [socket])

  const fireReaction = (r: typeof REACTIONS[0]) => {
    if (socket && gameId) (socket as any).emit("player:fireReaction", { gameId, reactionUrl: r.url })
  }

  const handleResultsClick = () => {
    if (fullResults) {
      setShowResultsPanel(true)
      return
    }
    // Results not yet received — request from server
    setResultsLoading(true)
    if (socket && gameId) {
      (socket as any).emit("player:requestResults", { gameId })
      // Show panel anyway (will display loading state inside)
      setShowResultsPanel(true)
    }
  }

  const podiumHeights = ["h-[55%]", "h-[45%]", "h-[35%]"]
  const podiumColors  = ["from-amber-400 via-yellow-400 to-amber-500","from-gray-400 via-gray-300 to-gray-400","from-amber-700 via-amber-600 to-amber-800"]
  const badgeColors   = ["border-amber-300 bg-amber-200 text-amber-800","border-gray-300 bg-gray-200 text-gray-600","border-amber-600 bg-amber-500 text-amber-100"]
  const avatarSizes   = [100, 80, 72]
  // Render order: 2nd (left), 1st (center), 3rd (right) — same as manager
  const order         = top.length >= 3 ? [1, 0, 2] : top.length === 2 ? [1, 0] : [0]
  // Which apparition stage each position requires to become visible
  const showAt        = { 2: 1, 1: 2, 0: 4 } as Record<number, number>

  return (
    <>
      {/* Floating reaction particles */}
      <div className="pointer-events-none fixed inset-0 z-[160] overflow-hidden">
        <AnimatePresence>
          {particles.map(p => (
            <motion.div key={p.id} style={{ position: "absolute", bottom: 88, left: `${p.x}%`, willChange: "transform, opacity" }}
              initial={{ y: 0, opacity: 1, scale: 0.6, x: 0, rotate: -12 }}
              animate={{ y: -720, opacity: [1, 1, 0.9, 0.5, 0], scale: [0.6, 1.2, 1.0, 0.85, 0.7], x: p.drift, rotate: 12 }}
              exit={{}} transition={{ duration: 3.6, ease: [0.2, 0.8, 0.3, 1] }}
            >
              {p.url.startsWith("/") ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.url} alt="" style={{ width: p.size, height: p.size }} className="drop-shadow-2xl" />
              ) : (
                <span style={{ fontSize: p.size * 0.75 }} className="leading-none select-none drop-shadow-2xl">{p.url}</span>
              )}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Confetti — appears with 1st place */}
      {apparition >= 5 && (
        <ReactConfetti width={width} height={height} numberOfPieces={220} recycle={true}
          colors={["#ffd60a", "#009edf", "#e21b3c", "#26890c", "#ffffff"]} />
      )}

      {/* Spotlight effect — flares when drum roll starts (apparition >= 3) */}
      {apparition >= 3 && top.length >= 3 && (
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="spotlight" />
        </div>
      )}

      {/* Podium */}
      <section className="relative mx-auto flex w-full max-w-5xl flex-1 flex-col items-center justify-between pt-10" style={{ paddingBottom: "5.5rem" }}>
        <motion.h2 initial={{ opacity: 0, y: -30 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
          className="text-center text-3xl font-bold text-white drop-shadow-lg md:text-4xl">{subject}</motion.h2>

        <div style={{ gridTemplateColumns: `repeat(${Math.min(top.length, 3)}, 1fr)` }}
          className="grid w-full max-w-xl flex-1 items-end justify-center overflow-x-visible overflow-y-hidden gap-3 px-4">
          {order.map((playerIdx) => {
            if (!top[playerIdx]) return null
            const player = top[playerIdx]
            const isFirst = playerIdx === 0
            const stageNeeded = showAt[playerIdx] ?? 1
            const visible = apparition >= stageNeeded

            return (
              <motion.div
                key={playerIdx}
                initial={{ y: "100%", opacity: 0 }}
                animate={visible ? { y: 0, opacity: 1 } : { y: "100%", opacity: 0 }}
                transition={{ duration: isFirst ? 1.5 : 1, ease: isFirst ? [0.34, 1.56, 0.64, 1] : "easeOut" }}
                className={clsx("z-20 flex flex-col items-center gap-3", podiumHeights[playerIdx])}
                style={{ zIndex: isFirst ? 30 : 20 - playerIdx }}
              >
                <motion.div
                  animate={apparition >= 5 ? { y: [0, -8, 0, -4, 0], scale: [1, 1.08, 1, 1.04, 1] } : {}}
                  transition={{ duration: 3 + playerIdx * 0.5, repeat: Infinity, ease: "easeInOut", delay: playerIdx * 0.3 }}
                >
                  <PodiumAvatar player={player} size={avatarSizes[playerIdx]} delay={playerIdx * 0.5} />
                </motion.div>

                <motion.p
                  initial={{ opacity: 0 }}
                  animate={apparition >= (isFirst ? 5 : stageNeeded) ? { opacity: 1 } : { opacity: 0 }}
                  className={clsx("overflow-visible text-center font-bold whitespace-nowrap text-white drop-shadow-lg",
                    isFirst ? "text-2xl md:text-3xl" : "text-xl md:text-2xl"
                  )}
                >
                  {player.username}
                </motion.p>

                <div className={clsx("flex h-full w-full flex-col items-center gap-3 rounded-t-xl pt-4 text-center shadow-2xl bg-gradient-to-b", podiumColors[playerIdx])}>
                  <div className={clsx("flex items-center justify-center rounded-full border-4 font-bold drop-shadow-md", badgeColors[playerIdx],
                    isFirst ? "h-16 w-16 text-3xl" : "h-12 w-12 text-2xl")}>
                    {playerIdx + 1}
                  </div>
                  <motion.p
                    animate={apparition >= 5 && isFirst ? { scale: [1, 1.1, 1] } : {}}
                    transition={{ duration: 2, repeat: Infinity, ease: "easeInOut", delay: 2.5 }}
                    className={clsx("font-bold text-white drop-shadow-lg", isFirst ? "text-2xl" : "text-xl")}
                  >
                    {player.points}<span className="ml-1 text-sm opacity-60">pts</span>
                  </motion.p>
                </div>
              </motion.div>
            )
          })}
        </div>
      </section>

      {/* Reaction buttons — bottom center */}
      <div className="fixed bottom-0 left-0 right-0 z-[150] flex justify-center pb-4 pt-2 bg-gradient-to-t from-black/40 to-transparent pointer-events-none">
        <motion.div initial={{ opacity: 0, y: 30, scale: 0.85 }} animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ delay: 2, type: "spring", stiffness: 260, damping: 22 }}
          className="pointer-events-auto flex flex-wrap justify-center gap-2 rounded-2xl bg-black/60 backdrop-blur-md px-4 py-3 shadow-2xl border border-white/10 max-w-xs sm:max-w-none">
          {REACTIONS.map(r => (
            <motion.button key={r.id} whileHover={{ scale: 1.18 }} whileTap={{ scale: 0.84 }}
              onClick={() => fireReaction(r)}
              className={clsx("flex flex-col items-center gap-1 rounded-xl px-3 py-2 shadow-lg active:brightness-125", r.bg)}>
              {r.url.startsWith("/") ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={r.url} alt={r.label} className="h-11 w-11 drop-shadow-lg" />
              ) : (
                <span className="text-4xl leading-none select-none drop-shadow-lg">{r.url}</span>
              )}
              <span className="text-[9px] font-bold text-white/90 tracking-wide">{r.label}</span>
            </motion.button>
          ))}
        </motion.div>
      </div>

      {/* Ver Resultados button */}
      <AnimatePresence>
        {showResultsBtn && (
          <motion.button
            initial={{ opacity: 0, x: 60, scale: 0.8 }} animate={{ opacity: 1, x: 0, scale: 1 }} exit={{ opacity: 0, x: 60 }}
            transition={{ type: "spring", stiffness: 280, damping: 22 }}
            onClick={handleResultsClick}
            className="fixed bottom-5 right-4 z-[155] flex items-center gap-2 rounded-2xl bg-primary px-4 py-2.5 text-sm font-bold text-white shadow-2xl hover:brightness-110 active:scale-[0.96] transition-[filter,transform] border border-white/20">
            <IconTrophy className="h-4 w-4" />
            {resultsLoading && !fullResults ? "Loading..." : "View Results"}
          </motion.button>
        )}
      </AnimatePresence>

      {/* Feedback overlay */}
      <AnimatePresence>
        {showFeedback && !feedbackSubmitted && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[210] flex items-end justify-center bg-black/70 backdrop-blur-sm"
          >
            <motion.div
              initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              className="w-full max-w-md rounded-t-3xl bg-gray-900 border border-white/10 px-6 py-8 flex flex-col items-center gap-5 shadow-2xl"
              onClick={e => e.stopPropagation()}
            >
              <p className="text-xs font-bold uppercase tracking-widest text-white/40">Rate this Quiz</p>
              <h3 className="text-xl font-bold text-white text-center">{subject}</h3>
              <div className="flex gap-3">
                {[1,2,3,4,5].map(star => (
                  <button
                    key={star}
                    onMouseEnter={() => setHoverRating(star)}
                    onMouseLeave={() => setHoverRating(0)}
                    onClick={() => setFeedbackRating(star)}
                    className="transition-transform hover:scale-125 active:scale-110"
                  >
                    <svg viewBox="0 0 24 24" className="h-10 w-10 transition-colors" fill={(hoverRating || feedbackRating) >= star ? "#fbbf24" : "none"} stroke={(hoverRating || feedbackRating) >= star ? "#fbbf24" : "#4b5563"} strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.562.562 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
                    </svg>
                  </button>
                ))}
              </div>
              <p className="text-sm text-white/50 h-5">
                {(hoverRating || feedbackRating) === 1 && "Poor"}
                {(hoverRating || feedbackRating) === 2 && "Fair"}
                {(hoverRating || feedbackRating) === 3 && "Good"}
                {(hoverRating || feedbackRating) === 4 && "Great"}
                {(hoverRating || feedbackRating) === 5 && "Excellent!"}
              </p>
              <div className="flex w-full gap-3 pt-1">
                <button onClick={handleFeedbackSkip} className="flex-1 rounded-xl border border-white/10 py-2.5 text-sm font-semibold text-white/50 hover:bg-white/5 transition-colors">
                  Skip
                </button>
                <button
                  onClick={handleFeedbackSubmit}
                  disabled={feedbackRating === 0}
                  className="flex-1 rounded-xl bg-primary py-2.5 text-sm font-bold text-white hover:brightness-110 disabled:opacity-40 transition-all"
                >
                  Submit
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
        {showFeedback && feedbackSubmitted && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 22 }}
            className="fixed inset-0 z-[210] flex items-center justify-center pointer-events-none"
          >
            <div className="rounded-2xl bg-gray-900/95 border border-white/10 px-8 py-6 text-center shadow-2xl">
              <div className="text-5xl mb-2">🎉</div>
              <p className="text-xl font-black text-white">Thank You!</p>
              <p className="text-lg font-bold text-white">Thank you for your feedback!</p>
              <p className="text-sm text-white/50 mt-1">Your rating has been saved.</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Full results panel */}
      <AnimatePresence>
        {showResultsPanel && (
          fullResults
            ? <ResultsPanel results={fullResults} currentUsername={username || ""} onClose={() => setShowResultsPanel(false)} socket={socket} gameId={gameId} />
            : (
              /* Loading / not-yet-available state */
              <motion.div
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="fixed inset-0 z-[200] flex items-end justify-center bg-black/60 backdrop-blur-sm"
                onClick={() => setShowResultsPanel(false)}
              >
                <motion.div
                  initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
                  transition={{ type: "spring", stiffness: 300, damping: 30 }}
                  className="w-full rounded-t-3xl bg-gray-900 text-white px-6 py-10 flex flex-col items-center gap-4"
                  onClick={e => e.stopPropagation()}
                >
                  <div className="h-10 w-10 rounded-full border-4 border-primary border-t-transparent animate-spin" />
                  <p className="text-white/70 text-sm font-medium">Waiting for results from server…</p>
                  <button onClick={() => setShowResultsPanel(false)} className="mt-2 rounded-lg bg-white/10 px-5 py-2 text-sm font-semibold hover:bg-white/20">Fechar</button>
                </motion.div>
              </motion.div>
            )
        )}
      </AnimatePresence>
    </>
  )
}

export default PlayerPodium
