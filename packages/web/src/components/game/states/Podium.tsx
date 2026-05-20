"use client"
import { abbreviateName } from "@rahoot/web/utils/abbreviateName"

import { ManagerStatusDataMap } from "@rahoot/common/types/game/status"
import useScreenSize from "@rahoot/web/hooks/useScreenSize"
import {
  SFX_PODIUM_FIRST,
  SFX_PODIUM_SECOND,
  SFX_PODIUM_THREE,
  SFX_SNEAR_ROOL,
} from "@rahoot/web/utils/constants"
import clsx from "clsx"
import { useEffect, useState, useRef } from "react"
import ReactConfetti from "react-confetti"
import useSound from "use-sound"
import { motion, AnimatePresence } from "motion/react"

import { useRouter } from "next/navigation"
import { useSocket } from "@rahoot/web/contexts/socketProvider"
import { useManagerStore } from "@rahoot/web/stores/manager"

type Props = {
  data: ManagerStatusDataMap["FINISHED"]
}

// No REACTIONS constant needed on manager side — buttons live on player side only

type Particle = {
  id: number
  url: string
  x: number
  delay: number
  size: number
  drift: number
}

const PodiumAvatar = ({ player, size, delay = 0 }: { player: any; size: number; delay?: number }) => {
  const p = player as any
  return (
    <motion.div
      animate={{
        y: [0, -6, 0, -3, 0],
        rotate: [0, -3, 0, 3, 0],
        scale: [1, 1.05, 1, 1.03, 1],
      }}
      transition={{ duration: 3.5, repeat: Infinity, ease: "easeInOut", delay }}
    >
      <div
        className="overflow-hidden rounded-2xl border-4 border-white bg-white shadow-xl"
        style={{ width: size, height: size }}
      >
        {p.avatarUrl ? (
          <div className="relative h-full w-full">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={p.avatarUrl} alt="" className="h-full w-full object-contain p-1"
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
}

const Podium = ({ data: { subject, top, questions } }: Props) => {
  const [apparition, setApparition] = useState(0)
  const { width, height } = useScreenSize()

  const router = useRouter()
  const { socket } = useSocket()
  const { gameId } = useManagerStore()
  const [fullReport, setFullReport] = useState<any[]>([])
  const hasSaved = useRef(false)
  const [showQuestionPanel, setShowQuestionPanel] = useState(false)
  const animationDone = useRef(false)

  // Reactions state
  const [particles, setParticles] = useState<Particle[]>([])
  const particleCounter = useRef(0)
  const lastReactionAt = useRef(0)
  const MAX_PARTICLES = 14
  const REACTION_THROTTLE_MS = 280

  useEffect(() => {
    if (socket) {
      const handler = (playersData: any) => setFullReport(playersData);
      (socket as any).on("manager:fullReport", handler);
      return () => { (socket as any).off("manager:fullReport", handler); };
    }
  }, [socket]);

  const [sfxtThree] = useSound(SFX_PODIUM_THREE, { volume: 0.2 })
  const [sfxSecond] = useSound(SFX_PODIUM_SECOND, { volume: 0.2 })
  const [sfxRool, { stop: sfxRoolStop }] = useSound(SFX_SNEAR_ROOL, { volume: 0.2 })
  const [sfxFirst] = useSound(SFX_PODIUM_FIRST, { volume: 0.2 })

  useEffect(() => {
    switch (apparition) {
      case 4: sfxRoolStop(); sfxFirst(); break;
      case 3: sfxRool(); break;
      case 2: sfxSecond(); break;
      case 1: sfxtThree(); break;
    }
  }, [apparition, sfxFirst, sfxSecond, sfxtThree, sfxRool, sfxRoolStop])

  useEffect(() => {
    if (animationDone.current) return
    if (top.length < 3) {
      setApparition(5)
      animationDone.current = true
      return
    }
    const delays = [3000, 4000, 3000, 7000, 4000, 99999]
    const delay = delays[apparition] || 4000
    const timer = setTimeout(() => {
      if (apparition <= 6) {
        setApparition(v => {
          const next = v + 1
          if (next >= 5) animationDone.current = true
          return next
        })
      }
    }, delay)
    return () => clearTimeout(timer)
  }, [apparition, top.length])

  useEffect(() => {
    if (hasSaved.current || !socket) return;
    const processSessionData = () => {
      let exportData = fullReport?.length > 0 ? fullReport : (typeof window !== "undefined" ? (window as any).__rahootReport : null);
      if (!exportData || exportData.length === 0) exportData = (useManagerStore.getState() as any).players || top || [];
      if (!exportData || exportData.length === 0) return;
      const sortedData = [...exportData].sort((a: any, b: any) => (b.points || b.score || 0) - (a.points || a.score || 0));
      const currentQuiz = (useManagerStore.getState() as any).quizz || (useManagerStore.getState() as any).quiz;
      const activeQuizId = currentQuiz?.id || localStorage.getItem("active_quiz_id") || subject;
      if (activeQuizId) {
        (socket as any).emit("manager:saveSessionStats", { quizId: activeQuizId, stats: sortedData });
        hasSaved.current = true;
      }
    };
    const timeout = setTimeout(processSessionData, 2000);
    return () => clearTimeout(timeout);
  }, [fullReport, top, socket, subject]);

  // Listen for reaction broadcast (server echoes back to manager too)
  useEffect(() => {
    if (!socket) return
    const handler = ({ reactionUrl }: { reactionUrl: string }) => {
      // Throttle: ignore bursts faster than REACTION_THROTTLE_MS
      const now = Date.now()
      if (now - lastReactionAt.current < REACTION_THROTTLE_MS) return
      lastReactionAt.current = now

      const p: Particle = {
        id: ++particleCounter.current,
        url: reactionUrl,
        x: 15 + Math.random() * 70,
        delay: 0,
        size: 56 + Math.random() * 28,
        drift: (Math.random() - 0.5) * 100,
      }
      // Cap: never more than MAX_PARTICLES at once
      setParticles(prev => {
        const next = [...prev, p]
        return next.length > MAX_PARTICLES ? next.slice(next.length - MAX_PARTICLES) : next
      })
      setTimeout(() => setParticles(prev => prev.filter(pt => pt.id !== p.id)), 4200)
    }
    ;(socket as any).on("game:reaction", handler)
    return () => { (socket as any).off("game:reaction", handler) }
  }, [socket])

  // Manager has no reaction buttons — reactions come from players via socket broadcast

  const handleExit = () => {
    if (confirm("End session and return to manager?")) {
      router.push("/manager")
    }
  }

  const handleCancelQuestion = (questionIndex: number) => {
    if (!gameId || !socket) return
    ;(socket as any).emit("manager:cancelQuestion", { gameId, questionIndex })
  }

  const podiumHeights = ["h-[55%]", "h-[45%]", "h-[35%]"]
  const podiumColors = [
    "from-amber-400 via-yellow-400 to-amber-500",
    "from-gray-400 via-gray-300 to-gray-400",
    "from-amber-700 via-amber-600 to-amber-800",
  ]
  const badgeColors = [
    "border-amber-300 bg-amber-200 text-amber-800",
    "border-gray-300 bg-gray-200 text-gray-600",
    "border-amber-600 bg-amber-500 text-amber-100",
  ]
  const avatarSizes = [100, 80, 72]
  const order = top.length >= 3 ? [1, 0, 2] : top.length === 2 ? [1, 0] : [0]
  const cancelledCount = questions?.filter((q) => q.cancelled).length ?? 0
  const hasQuestionsPanel = questions && questions.length > 0

  return (
    <>
      {/* Floating reaction particles — fixed overlay, above confetti */}
      <div className="pointer-events-none fixed inset-0 z-[160] overflow-hidden">
        <AnimatePresence>
          {particles.map(p => (
            <motion.div
              key={p.id}
              style={{ position: "absolute", bottom: 100, left: `${p.x}%`, willChange: "transform, opacity" }}
              initial={{ y: 0, opacity: 1, scale: 0.5, x: 0, rotate: -15 }}
              animate={{
                y: -740,
                opacity: [1, 1, 1, 0.7, 0],
                scale: [0.5, 1.3, 1.1, 0.9, 0.7],
                x: p.drift,
                rotate: 15,
              }}
              exit={{}}
              transition={{ duration: 3.8, delay: p.delay, ease: [0.2, 0.8, 0.3, 1] }}
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

      {/* Back to Manager */}
      <div className="absolute top-4 right-8 z-50">
        <button onClick={handleExit} className="flex items-center gap-2 rounded-lg bg-white/10 px-4 py-2 text-sm font-semibold text-white hover:bg-white/20 transition-colors">
          Back to Manager
        </button>
      </div>

      {apparition >= 5 && (
        <ReactConfetti width={width} height={height} className="h-full w-full" numberOfPieces={300} recycle={true} colors={["#ffd60a", "#009edf", "#e21b3c", "#26890c", "#ffffff"]} />
      )}

      {apparition >= 3 && top.length >= 3 && (
        <div className="pointer-events-none absolute min-h-dvh w-full overflow-hidden">
          <div className="spotlight"></div>
        </div>
      )}

      <section
        className="relative mx-auto flex w-full max-w-5xl flex-1 flex-col items-center justify-between pt-12"
        style={{ paddingBottom: hasQuestionsPanel ? "4rem" : "1.5rem" }}
      >
        <motion.h2
          initial={{ opacity: 0, y: -30 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center text-3xl font-bold text-white drop-shadow-lg md:text-4xl"
        >
          {subject}
        </motion.h2>

        <div
          style={{ gridTemplateColumns: `repeat(${Math.min(top.length, 3)}, 1fr)` }}
          className="grid w-full max-w-200 flex-1 items-end justify-center justify-self-end overflow-x-visible overflow-y-hidden gap-3 px-4"
        >
          {order.map((playerIdx) => {
            if (!top[playerIdx]) return null
            const player = top[playerIdx]
            const isFirst = playerIdx === 0
            const showAt = playerIdx === 2 ? 1 : playerIdx === 1 ? 2 : 4

            return (
              <motion.div
                key={playerIdx}
                initial={{ y: "100%", opacity: 0 }}
                animate={apparition >= showAt ? { y: 0, opacity: 1 } : { y: "100%", opacity: 0 }}
                transition={{
                  duration: isFirst ? 1.5 : 1,
                  ease: isFirst ? [0.34, 1.56, 0.64, 1] : "easeOut",
                }}
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
                  animate={apparition >= (isFirst ? 5 : showAt) ? { opacity: 1 } : { opacity: 0 }}
                  className={clsx("text-center font-bold text-white drop-shadow-lg leading-tight", isFirst ? "text-2xl md:text-3xl" : "text-xl md:text-2xl")}
                >
                  {abbreviateName(player.username || "")}
                </motion.p>

                <div className={clsx("flex h-full w-full flex-col items-center gap-3 rounded-t-xl pt-4 text-center shadow-2xl bg-gradient-to-b", podiumColors[playerIdx])}>
                  <div className={clsx("flex items-center justify-center rounded-full border-4 font-bold text-2xl drop-shadow-md", badgeColors[playerIdx], isFirst ? "h-16 w-16 text-3xl" : "h-12 w-12")}>
                    {playerIdx + 1}
                  </div>
                  <motion.p
                    animate={apparition >= 5 && isFirst ? { scale: [1, 1.1, 1] } : {}}
                    transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                    className={clsx("font-bold text-white drop-shadow-lg", isFirst ? "text-2xl" : "text-xl")}
                  >
                    {player.points}
                    <span className="ml-1 text-sm opacity-60">pts</span>
                  </motion.p>
                </div>
              </motion.div>
            )
          })}
        </div>
      </section>

      {/* Question Management Panel */}
      {hasQuestionsPanel && (
        <div className="fixed bottom-0 left-0 right-0 z-50">
          <button
            onClick={() => setShowQuestionPanel((v) => !v)}
            className={clsx(
              "flex w-full items-center justify-between px-5 py-2.5 text-sm font-semibold text-white transition-colors",
              cancelledCount > 0 ? "bg-red-700/90 hover:bg-red-700" : "bg-black/70 hover:bg-black/80",
            )}
          >
            <span>{showQuestionPanel ? "▼" : "▲"}&nbsp; Manage Questions</span>
            {cancelledCount > 0 && (
              <span className="rounded-full bg-red-500 px-2 py-0.5 text-xs">{cancelledCount} cancelled</span>
            )}
          </button>

          {showQuestionPanel && (
            <div className="max-h-64 overflow-y-auto bg-black/85 backdrop-blur-sm">
              {questions.map((q, idx) => (
                <div
                  key={idx}
                  className={clsx("flex items-center justify-between border-b border-white/10 px-5 py-3 transition-opacity", q.cancelled && "opacity-60")}
                >
                  <span className={clsx("text-sm text-white", q.cancelled && "line-through")}>
                    <span className="mr-2 font-bold text-white/50">{idx + 1}.</span>
                    {q.title}
                    {q.cancelled && (
                      <span className="ml-2 rounded bg-red-600 px-1.5 py-0.5 text-xs font-bold not-italic">CANCELLED</span>
                    )}
                  </span>
                  <button
                    onClick={() => handleCancelQuestion(idx)}
                    className={clsx(
                      "ml-4 shrink-0 rounded px-3 py-1.5 text-xs font-bold transition-colors",
                      q.cancelled ? "bg-green-600 hover:bg-green-500 text-white" : "bg-red-600 hover:bg-red-500 text-white",
                    )}
                  >
                    {q.cancelled ? "Restore" : "Cancel"}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </>
  )
}

export default Podium
