"use client"
import { abbreviateName } from "@rahoot/web/utils/abbreviateName"
import React, { useEffect, useState } from "react"
import { motion, AnimatePresence } from "motion/react"
import clsx from "clsx"

const Avatar = ({ player, size = 48 }: { player: any; size?: number }) => {
  const p = player as any
  if (p.avatarUrl) {
    return (
      <div className="relative" style={{ width: size, height: size }}>
        <img src={p.avatarUrl} alt="" className="rounded-xl object-contain" style={{ width: size, height: size }}
          onError={(e) => { e.currentTarget.style.display="none"; const fb = e.currentTarget.parentElement?.querySelector(".av-fb") as HTMLElement; if(fb) fb.style.display="flex" }} />
        <div className="av-fb items-center justify-center rounded-xl bg-white/20 font-bold text-white" style={{ display:"none", width: size, height: size, fontSize: size * 0.4 }}>
          {(player.username || "?").charAt(0).toUpperCase()}
        </div>
      </div>
    )
  }
  return (
    <div className="flex items-center justify-center rounded-xl bg-white/20 font-bold text-white" style={{ width: size, height: size, fontSize: size * 0.4 }}>
      {(player.username || "?").charAt(0).toUpperCase()}
    </div>
  )
}

const Leaderboard = ({ data, isFinal = false }: any) => {
  const { oldLeaderboard, leaderboard } = data || {}
  const [phase, setPhase] = useState<"old" | "new">("old")
  const [displayList, setDisplayList] = useState<any[]>([])

  useEffect(() => {
    if (!leaderboard) return

    if (oldLeaderboard && !isFinal) {
      // Phase 1: Show old positions
      setDisplayList(oldLeaderboard)
      setPhase("old")

      // Phase 2: Animate to new positions after delay
      const timer = setTimeout(() => {
        setDisplayList(leaderboard)
        setPhase("new")
      }, 1500)

      return () => clearTimeout(timer)
    } else {
      setDisplayList(leaderboard)
      setPhase("new")
    }
  }, [leaderboard, oldLeaderboard, isFinal])

  const rankColors = [
    "from-amber-400 to-amber-600 border-amber-300",
    "from-gray-400 to-gray-500 border-gray-300",
    "from-amber-700 to-amber-800 border-amber-600",
  ]

  return (
    <section className="relative mx-auto flex w-full max-w-4xl flex-1 flex-col items-center justify-center px-4">
      <h2 className="mb-8 text-4xl font-bold text-white drop-shadow-lg text-center uppercase tracking-wider">
        Leaderboard
      </h2>

      {data?.teamMode && data?.teamScores && (
        <div className="mb-4 flex w-full max-w-4xl gap-3">
          <div className={clsx(
            "flex flex-1 flex-col items-center rounded-2xl px-4 py-3 font-black",
            data.teamScores.A >= data.teamScores.B
              ? "bg-blue-500 shadow-lg shadow-blue-500/30 ring-2 ring-blue-300"
              : "bg-blue-500/50"
          )}>
            <span className="text-xs font-bold uppercase tracking-widest text-blue-100/80">Team A</span>
            <span className="text-3xl text-white tabular-nums">{data.teamScores.A}</span>
            <span className="text-[10px] text-white/50">avg pts</span>
          </div>
          <div className="flex items-center font-black text-white/40 text-xl">VS</div>
          <div className={clsx(
            "flex flex-1 flex-col items-center rounded-2xl px-4 py-3 font-black",
            data.teamScores.B > data.teamScores.A
              ? "bg-red-500 shadow-lg shadow-red-500/30 ring-2 ring-red-300"
              : "bg-red-500/50"
          )}>
            <span className="text-xs font-bold uppercase tracking-widest text-red-100/80">Team B</span>
            <span className="text-3xl text-white tabular-nums">{data.teamScores.B}</span>
            <span className="text-[10px] text-white/50">avg pts</span>
          </div>
        </div>
      )}

      <div className="flex w-full flex-col gap-3 relative">
        <AnimatePresence mode="popLayout">
          {displayList.map((player: any, displayIdx: number) => {
            const safeKey = player.clientId || player.id || player.username
            const rank = displayIdx
            const isTop5 = rank < 5

            return (
              <motion.div
                key={safeKey}
                layout
                initial={{ opacity: 0, x: -40, scale: 0.95 }}
                animate={{
                  opacity: 1,
                  x: 0,
                  scale: rank === 0 ? 1.02 : 1,
                  y: isTop5 ? [0, -3, 0, 2, 0] : 0,
                }}
                exit={{ opacity: 0, x: 40, scale: 0.9 }}
                transition={{
                  layout: { type: "spring", stiffness: 80, damping: 16, mass: 1.2 },
                  opacity: { duration: 0.4 },
                  y: isTop5 ? {
                    duration: 3 + rank * 0.5,
                    repeat: Infinity,
                    ease: "easeInOut",
                    delay: rank * 0.3,
                  } : undefined,
                }}
                className={clsx(
                  "flex w-full items-center gap-4 rounded-2xl px-5 py-3 font-bold text-white shadow-lg",
                  rank < 3
                    ? `bg-gradient-to-r ${rankColors[rank]} border-2`
                    : "bg-white/10 backdrop-blur-sm border border-white/15"
                )}
              >
                {/* Rank */}
                <div className={clsx("flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-lg font-bold",
                  rank === 0 ? "bg-amber-300/30 text-amber-100" :
                  rank === 1 ? "bg-gray-300/30 text-gray-100" :
                  rank === 2 ? "bg-amber-600/30 text-amber-200" :
                  "bg-white/10 text-white/50"
                )}>
                  {rank + 1}
                </div>

                {/* Avatar */}
                <motion.div
                  animate={isTop5 ? {
                    rotate: [0, -2, 0, 2, 0],
                    scale: [1, 1.03, 1, 0.98, 1],
                  } : {}}
                  transition={isTop5 ? {
                    duration: 4 + rank * 0.7,
                    repeat: Infinity,
                    ease: "easeInOut",
                    delay: rank * 0.4,
                  } : {}}
                >
                  <Avatar player={player} size={rank < 3 ? 52 : 40} />
                </motion.div>

                {/* Name */}
                <div className="flex-1 min-w-0">
                  <div className={clsx("flex items-center gap-2", rank === 0 ? "text-2xl" : rank < 3 ? "text-xl" : "text-lg")}>
                    <span className="break-words leading-tight">{abbreviateName(player.username || player.name || "")}</span>
                    {(player as any).team && (
                      <span className={clsx("shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-black",
                        (player as any).team === "A" ? "bg-blue-400/30 text-blue-200" : "bg-red-400/30 text-red-200"
                      )}>{(player as any).team}</span>
                    )}
                  </div>
                </div>

                {/* Points */}
                <motion.div
                  className={clsx("font-bold tabular-nums shrink-0",
                    rank === 0 ? "text-3xl" : rank < 3 ? "text-2xl" : "text-xl text-amber-300"
                  )}
                  animate={phase === "new" && rank < 3 ? { scale: [1, 1.15, 1] } : {}}
                  transition={{ duration: 0.5, delay: 0.3 }}
                >
                  {player.points || 0}
                  <span className="ml-1 text-sm opacity-50">pts</span>
                </motion.div>
              </motion.div>
            )
          })}
        </AnimatePresence>
      </div>
    </section>
  )
}

export default Leaderboard
