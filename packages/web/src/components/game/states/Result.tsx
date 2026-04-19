"use client"

import { CommonStatusDataMap } from "@rahoot/common/types/game/status"
import { usePlayerStore } from "@rahoot/web/stores/player"
import { useSocket } from "@rahoot/web/contexts/socketProvider"
import { SFX_RESULTS_SOUND } from "@rahoot/web/utils/constants"
import { useEffect, useState, useRef } from "react"
import useSound from "use-sound"
import { motion, AnimatePresence } from "motion/react"
import clsx from "clsx"

type Props = {
  data: CommonStatusDataMap["SHOW_RESULT"]
}

type CorrectAnswerData = {
  question: string
  answers: string[]
  correct: number
}

// ── Streak helpers ──────────────────────────────────────────────────────────
const getStreak = (): number => {
  try { return parseInt(sessionStorage.getItem("rahoot_streak") || "0") } catch { return 0 }
}
const saveStreak = (n: number) => {
  try { sessionStorage.setItem("rahoot_streak", String(n)) } catch {}
}

// ── Streak sub-messages ──────────────────────────────────────────────────────
const STREAK_MSGS: Record<number, string> = {
  2: "2 in a row! On fire!",
  3: "3 in a row! Hat-trick!",
  4: "4 streak! Unstoppable!",
  5: "LEGENDARY 5-streak!",
}
const getStreakMsg = (streak: number): string | null =>
  streak >= 5 ? STREAK_MSGS[5] : STREAK_MSGS[streak] ?? null

// ── Streak badge ─────────────────────────────────────────────────────────────
const StreakBadge = ({ streak }: { streak: number }) => {
  if (streak < 2) return null
  const icon = streak >= 5 ? "🏆" : streak >= 4 ? "💥" : streak >= 3 ? "🎯" : "🔥"
  const color =
    streak >= 5 ? "bg-purple-500" :
    streak >= 4 ? "bg-orange-500" :
    streak >= 3 ? "bg-red-500" :
    "bg-orange-400"
  return (
    <motion.div
      initial={{ scale: 0, rotate: -20 }}
      animate={{ scale: 1, rotate: 0 }}
      transition={{ type: "spring", stiffness: 500, damping: 18, delay: 0.55 }}
      className={clsx("flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-black text-white shadow-lg", color)}
    >
      <span className="text-base">{icon}</span>
      <span>{streak} streak!</span>
    </motion.div>
  )
}

const Result = ({ data: { correct, message, points, myPoints, rank, aheadOfMe } }: Props) => {
  const player = usePlayerStore()
  const { socket } = useSocket()
  const [correctAnswer, setCorrectAnswer] = useState<CorrectAnswerData | null>(null)
  const [streak, setStreak] = useState(0)
  const [displayPoints, setDisplayPoints] = useState(0)
  const [sfxResults] = useSound(SFX_RESULTS_SOUND, { volume: 0.2 })
  const initialized = useRef(false)

  useEffect(() => {
    if (initialized.current) return
    initialized.current = true
    player.updatePoints(myPoints)
    sfxResults()
    const prev = getStreak()
    const next = correct ? prev + 1 : 0
    saveStreak(next)
    setStreak(next)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Count-up for points
  useEffect(() => {
    if (!correct || !points) return
    let current = 0
    const step = Math.max(1, Math.ceil(points / 24))
    const timer = setInterval(() => {
      current = Math.min(current + step, points)
      setDisplayPoints(current)
      if (current >= points) clearInterval(timer)
    }, 35)
    return () => clearInterval(timer)
  }, [correct, points])

  useEffect(() => {
    if (!socket) return
    const handler = (data: CorrectAnswerData) => setCorrectAnswer(data)
    socket.on("game:correctAnswer" as any, handler)
    return () => { socket.off("game:correctAnswer" as any, handler) }
  }, [socket])

  const headline = correct ? "Correct!" : "Wrong!"
  const streakMsg = correct ? getStreakMsg(streak) : null

  const rankLabel = rank === 1 ? "1st 🥇" : rank === 2 ? "2nd 🥈" : rank === 3 ? "3rd 🥉" : `${rank}th`

  return (
    <section className="relative mx-auto flex w-full max-w-lg flex-1 flex-col items-center justify-center gap-5 px-6">

      {/* Result icon */}
      <motion.div
        initial={{ scale: 0, rotate: -25 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ type: "spring", stiffness: 350, damping: 18 }}
        className={clsx(
          "flex h-28 w-28 items-center justify-center rounded-full shadow-2xl ring-4",
          correct ? "bg-green-500/20 ring-green-400/40" : "bg-red-500/20 ring-red-400/40"
        )}
      >
        {correct ? (
          <svg viewBox="0 0 56 56" className="h-16 w-16 fill-green-400 drop-shadow-lg">
            <path d="M28 52C41.255 52 52 41.255 52 28C52 14.745 41.255 4 28 4C14.745 4 4 14.745 4 28C4 41.255 14.745 52 28 52ZM24.766 40.023C23.969 40.023 23.359 39.672 22.68 38.875L15.93 30.531C15.578 30.086 15.367 29.523 15.367 29.008C15.367 27.906 16.234 27.063 17.266 27.063C17.945 27.063 18.508 27.32 19.07 28.047L24.672 35.289L35.570 17.828C36.016 17.102 36.625 16.75 37.234 16.75C38.266 16.75 39.273 17.43 39.273 18.555C39.273 19.07 38.969 19.633 38.664 20.102L26.758 38.875C26.242 39.648 25.586 40.023 24.766 40.023Z" />
          </svg>
        ) : (
          <svg viewBox="0 0 56 56" className="h-16 w-16 fill-red-400 drop-shadow-lg">
            <path d="M28 52C41.255 52 52 41.255 52 28C52 14.745 41.255 4 28 4C14.745 4 4 14.745 4 28C4 41.255 14.745 52 28 52ZM19.586 38.406C18.484 38.406 17.594 37.516 17.594 36.414C17.594 35.875 17.828 35.406 18.203 35.055L25.188 28.023L18.203 20.992C17.828 20.664 17.594 20.172 17.594 19.633C17.594 18.555 18.484 17.688 19.586 17.688C20.125 17.688 20.594 17.898 20.945 18.273L27.977 25.281L35.055 18.25C35.453 17.828 35.875 17.641 36.391 17.641C37.492 17.641 38.383 18.531 38.383 19.609C38.383 20.148 38.195 20.594 37.797 20.969L30.766 28.023L37.773 35.008C38.125 35.383 38.359 35.852 38.359 36.414C38.359 37.516 37.469 38.406 36.367 38.406C35.805 38.406 35.336 38.172 34.984 37.820L27.977 30.789L20.992 37.820C20.641 38.195 20.125 38.406 19.586 38.406Z" />
          </svg>
        )}
      </motion.div>

      {/* Headline + server subtitle + streak */}
      <div className="flex flex-col items-center gap-2">
        <motion.h2
          key={headline}
          initial={{ opacity: 0, y: 18, scale: 0.88 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ type: "spring", stiffness: 300, damping: 20, delay: 0.15 }}
          className={clsx(
            "text-center text-4xl font-black drop-shadow-lg",
            correct ? "text-white" : "text-white/80"
          )}
        >
          {headline}
        </motion.h2>
        {(streakMsg || message) && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.28 }}
            className="text-base font-semibold text-white/60"
          >
            {streakMsg ?? message}
          </motion.p>
        )}
        <StreakBadge streak={streak} />
      </div>

      {/* Points badge */}
      <AnimatePresence>
        {correct && (
          <motion.div
            initial={{ scale: 0, y: 12 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0 }}
            transition={{ type: "spring", stiffness: 420, damping: 16, delay: 0.38 }}
            className="flex items-baseline gap-1.5 rounded-2xl bg-accent px-8 py-3 shadow-xl"
          >
            <span className="text-4xl font-black text-gray-900 tabular-nums">+{displayPoints}</span>
            <span className="text-base font-bold text-gray-700">pts</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Rank */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        className="flex items-center gap-2 rounded-xl bg-white/10 px-5 py-2.5"
      >
        <span className="text-lg font-black text-white">{rankLabel}</span>
        {aheadOfMe && (
          <>
            <span className="text-white/30">·</span>
            <span className="text-sm font-medium text-white/60">
              behind <span className="font-bold text-white/80">{aheadOfMe}</span>
            </span>
          </>
        )}
      </motion.div>

      {/* Correct answer reveal (wrong only) */}
      <AnimatePresence>
        {correctAnswer && !correct && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ delay: 0.55 }}
            className="w-full"
          >
            <p className="mb-2 text-center text-xs font-semibold uppercase tracking-widest text-white/40">
              Correct answer
            </p>
            <div className="rounded-xl border border-green-400/30 bg-green-500/15 px-6 py-4 text-center backdrop-blur-sm">
              <p className="text-lg font-bold text-green-300">
                {correctAnswer.answers[correctAnswer.correct]}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  )
}

export default Result
