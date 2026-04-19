"use client"

import { PlayerStatusDataMap } from "@rahoot/common/types/game/status"
import { useSocket } from "@rahoot/web/contexts/socketProvider"
import { usePlayerStore } from "@rahoot/web/stores/player"
import { useEffect, useState, useRef } from "react"
import { motion, AnimatePresence } from "motion/react"

type Props = {
  data: PlayerStatusDataMap["WAIT"]
}

type RoomPlayer = { id: string; username: string; avatarUrl: string | null }
type ReactionBubble = {
  id: number
  username: string
  avatarUrl: string | null
  emoji: string
  label: string
  x: number  // % from left
}

// Funny waiting-room reactions — different from podium reactions
const WAIT_REACTIONS = [
  { emoji: "😴", label: "Sleeping…"  },
  { emoji: "🎮", label: "Ready!"      },
  { emoji: "🐔", label: "Cluck!"      },
  { emoji: "🤪", label: "Hyped!"      },
  { emoji: "👻", label: "Boo!"        },
  { emoji: "🦆", label: "Quack!"      },
  { emoji: "🎉", label: "Let's go!"   },
  { emoji: "🤡", label: "Clown!"      },
  { emoji: "🍌", label: "Banana!"     },
  { emoji: "🔥", label: "On fire!"    },
]

const PlayerAvatar = ({ player, size = 48 }: { player: RoomPlayer; size?: number }) => (
  <div
    className="overflow-hidden rounded-xl border-2 border-white/30 bg-white/20 shadow-md"
    style={{ width: size, height: size, flexShrink: 0 }}
  >
    {player.avatarUrl ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={player.avatarUrl}
        alt={player.username}
        className="h-full w-full object-contain p-0.5"
        onError={(e) => {
          e.currentTarget.style.display = "none"
          const fb = e.currentTarget.nextElementSibling as HTMLElement | null
          if (fb) fb.style.display = "flex"
        }}
      />
    ) : null}
    <div
      style={{ display: player.avatarUrl ? "none" : "flex", fontSize: size * 0.4, width: size, height: size }}
      className="items-center justify-center font-bold text-white/70"
    >
      {(player.username || "?").charAt(0).toUpperCase()}
    </div>
  </div>
)

const Wait = ({ data: { text } }: Props) => {
  const { socket } = useSocket()
  const { gameId, player } = usePlayerStore()
  const [players, setPlayers] = useState<RoomPlayer[]>([])
  const [bubbles, setBubbles] = useState<ReactionBubble[]>([])
  const bubbleCounter = useRef(0)
  const THROTTLE_MS = 1200
  const lastReactAt = useRef(0)

  // On mount, request current player list
  useEffect(() => {
    if (!socket || !gameId) return
    ;(socket as any).emit("player:getRoomPlayers", { gameId })
  }, [socket, gameId])

  // Listen for room player list + waiting reactions via direct socket.on (custom events)
  useEffect(() => {
    if (!socket) return
    const onPlayers = (list: RoomPlayer[]) => setPlayers(list)
    const onReaction = ({ username, avatarUrl, emoji, label }: any) => {
      const bubble: ReactionBubble = {
        id: ++bubbleCounter.current,
        username,
        avatarUrl,
        emoji,
        label,
        x: 10 + Math.random() * 75,
      }
      setBubbles(prev => [...prev.slice(-12), bubble])
      setTimeout(() => setBubbles(prev => prev.filter(b => b.id !== bubble.id)), 3500)
    }
    ;(socket as any).on("game:roomPlayers", onPlayers)
    ;(socket as any).on("game:waitingReaction", onReaction)
    return () => {
      ;(socket as any).off("game:roomPlayers", onPlayers)
      ;(socket as any).off("game:waitingReaction", onReaction)
    }
  }, [socket])

  const fireReaction = (r: typeof WAIT_REACTIONS[0]) => {
    const now = Date.now()
    if (now - lastReactAt.current < THROTTLE_MS) return
    lastReactAt.current = now
    if (!socket || !gameId) return
    ;(socket as any).emit("player:waitingReaction", { gameId, emoji: r.emoji, label: r.label })
  }

  const meUsername = player?.username?.toLowerCase() ?? ""

  return (
    <section className="relative mx-auto flex w-full max-w-4xl flex-1 flex-col items-center px-4 pt-8 pb-32 overflow-hidden">

      {/* Floating reaction bubbles */}
      <div className="pointer-events-none fixed inset-0 z-[100] overflow-hidden">
        <AnimatePresence>
          {bubbles.map(b => (
            <motion.div
              key={b.id}
              style={{ position: "absolute", bottom: 100, left: `${b.x}%` }}
              initial={{ y: 0, opacity: 1, scale: 0.7 }}
              animate={{ y: -380, opacity: [1, 1, 0.8, 0], scale: [0.7, 1.1, 1, 0.9] }}
              exit={{}}
              transition={{ duration: 3.2, ease: [0.25, 0.8, 0.3, 1] }}
              className="flex flex-col items-center gap-1"
            >
              {/* Player chip */}
              <div className="flex items-center gap-1.5 rounded-full bg-black/70 backdrop-blur-sm px-3 py-1.5 shadow-xl border border-white/10">
                <PlayerAvatar player={{ id: "", username: b.username, avatarUrl: b.avatarUrl }} size={22} />
                <span className="text-[11px] font-bold text-white/90 max-w-[90px] truncate">{b.username}</span>
                <span className="text-xl">{b.emoji}</span>
              </div>
              <span className="text-[10px] font-semibold text-white/60 bg-black/40 rounded-full px-2 py-0.5">{b.label}</span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Title */}
      <motion.h2
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-2 text-center text-3xl font-bold text-white drop-shadow-lg md:text-4xl"
      >
        {text}
      </motion.h2>

      {/* Player count pill */}
      <motion.div
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.2 }}
        className="mb-6 rounded-full bg-black/40 px-5 py-2"
      >
        <span className="text-lg font-bold text-white/80">
          {players.length} {players.length === 1 ? "player" : "players"} joined
        </span>
      </motion.div>

      {/* Player grid */}
      {players.length > 0 && (
        <div className="mb-6 flex flex-wrap justify-center gap-3 w-full max-w-2xl">
          {players.map((p, i) => {
            const isMe = p.username.toLowerCase() === meUsername
            return (
              <motion.div
                key={p.id}
                initial={{ opacity: 0, scale: 0.6, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                transition={{ delay: i * 0.04, type: "spring", stiffness: 300, damping: 20 }}
                className={`flex flex-col items-center gap-1 ${isMe ? "scale-110" : ""}`}
              >
                <div className={`rounded-2xl p-0.5 ${isMe ? "bg-gradient-to-br from-accent to-primary shadow-lg shadow-primary/30" : "bg-white/10"}`}>
                  <PlayerAvatar player={p} size={52} />
                </div>
                <div className={`rounded-lg px-2 py-0.5 text-xs font-bold shadow ${isMe ? "bg-accent text-gray-900" : "bg-primary/80 text-white"}`}>
                  {p.username}
                  {isMe && <span className="ml-1 opacity-60">(you)</span>}
                </div>
              </motion.div>
            )
          })}
        </div>
      )}

      {players.length === 0 && (
        <div className="mb-6 flex flex-col items-center gap-3">
          <div className="flex gap-1">
            {[0,1,2].map(i => (
              <motion.div key={i} className="h-3 w-3 rounded-full bg-white/40"
                animate={{ y: [0, -8, 0] }}
                transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.2 }} />
            ))}
          </div>
          <p className="text-sm text-white/50">Waiting for players to join…</p>
        </div>
      )}

      {/* Reaction buttons — fixed bottom */}
      <div className="fixed bottom-0 left-0 right-0 z-[90] flex flex-col items-center pb-4 pt-2 bg-gradient-to-t from-black/50 to-transparent">
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-white/40">Express yourself</p>
        <div className="flex flex-wrap justify-center gap-2 px-4 max-w-md">
          {WAIT_REACTIONS.map(r => (
            <motion.button
              key={r.emoji}
              whileHover={{ scale: 1.15 }}
              whileTap={{ scale: 0.82 }}
              onClick={() => fireReaction(r)}
              className="flex items-center gap-1.5 rounded-2xl bg-black/60 backdrop-blur-md border border-white/10 px-3 py-2 shadow-lg hover:bg-white/10 transition-colors"
            >
              <span className="text-2xl">{r.emoji}</span>
              <span className="text-[11px] font-semibold text-white/80">{r.label}</span>
            </motion.button>
          ))}
        </div>
      </div>
    </section>
  )
}

export default Wait
