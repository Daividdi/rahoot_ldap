"use client"

import Button from "@rahoot/web/components/Button"
import Input from "@rahoot/web/components/Input"
import TierBadge from "@rahoot/web/components/profile/TierBadge"
import { useSocket } from "@rahoot/web/contexts/socketProvider"
import { useParams, useSearchParams } from "next/navigation"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import clsx from "clsx"

const REAL_NAME_KEY = "rahoot_real_name"

type SoloQuestion = {
  question: string
  answers: string[]
  solution: number
  time: number
  cooldown: number
  image?: string
}

type SoloQuiz = {
  id: string
  subject: string
  questions: SoloQuestion[]
}

type SoloQuizResp =
  | { ok: true; quiz: SoloQuiz; attemptsUsed: number; maxAttempts: number }
  | { ok: false; reason: "not_found" | "no_attempts_left" | "solo_disabled" | "server_error" }

type SoloResultResp =
  | {
      ok: true
      attemptNumber: number
      maxAttempts: number
      xpGained: number
      newXp: number
      newLevel: number
      newTier: "bronze" | "silver" | "gold" | "platinum" | "mythic"
      newBadges: Array<{ id: string; label: string; emoji: string; description: string }>
      correct: number
      incorrect: number
      unanswered: number
      longestStreak: number
      isPerfect: boolean
    }
  | { ok: false; reason: string }

// Simple, kahoot-ish point award: faster = more points, decays linearly over the question duration
function scoreFor(correct: boolean, msToAnswer: number, questionDurationMs: number): number {
  if (!correct) return 0
  const factor = Math.max(0, 1 - msToAnswer / Math.max(1000, questionDurationMs))
  return Math.round(500 + 500 * factor)
}

export default function SoloGamePage() {
  const { socket, isConnected, connect } = useSocket()
  const params = useParams<{ quizId: string }>()
  const searchParams = useSearchParams()
  const quizId = params?.quizId ? decodeURIComponent(params.quizId) : ""

  const [realName, setRealName] = useState<string>("")
  const [needName, setNeedName] = useState(false)
  const [registerInput, setRegisterInput] = useState("")

  const [resp, setResp] = useState<SoloQuizResp | null>(null)
  const [stage, setStage] = useState<"loading" | "ready" | "playing" | "done" | "error">("loading")
  const [error, setError] = useState<string>("")

  // Game state
  const [qIndex, setQIndex] = useState(0)
  const [selected, setSelected] = useState<number | null>(null)
  const [remaining, setRemaining] = useState(0)
  const [showingAnswer, setShowingAnswer] = useState(false)
  const [answers, setAnswers] = useState<
    Array<{ questionTitle: string; selectedAnswer: string; isCorrect: boolean }>
  >([])
  const [points, setPoints] = useState(0)

  const questionStartRef = useRef<number>(0)
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const [result, setResult] = useState<SoloResultResp | null>(null)

  const quiz = resp?.ok ? resp.quiz : null
  const question = quiz?.questions[qIndex]
  const totalQuestions = quiz?.questions.length ?? 0

  // ── Connect + load name ────────────────────────────────────
  useEffect(() => { if (!isConnected) connect() }, [isConnected, connect])

  useEffect(() => {
    try {
      const urlName = searchParams.get("u") || searchParams.get("name") || ""
      const stored = localStorage.getItem(REAL_NAME_KEY) || ""
      const effective = (urlName || stored).trim()
      if (effective) {
        setRealName(effective)
        if (urlName && urlName !== stored) {
          localStorage.setItem(REAL_NAME_KEY, effective)
        }
      } else {
        setNeedName(true)
      }
    } catch {
      setNeedName(true)
    }
  }, [searchParams])

  // ── Fetch quiz when we have name + socket ──────────────────
  useEffect(() => {
    if (!socket || !isConnected || !quizId || !realName || needName) return
    setStage("loading")
    ;(socket as any).emit("solo:getQuiz", { quizId, realName })
    const handler = (data: SoloQuizResp) => {
      setResp(data)
      if (!data.ok) {
        setStage("error")
        setError(
          data.reason === "not_found" ? "Quiz não encontrado."
            : data.reason === "no_attempts_left" ? "You've already used all attempts for this quiz."
            : data.reason === "solo_disabled" ? "Este quiz não permite modo solo."
            : "Erro ao carregar quiz."
        )
      } else {
        setStage("ready")
      }
    }
    ;(socket as any).on("solo:quiz", handler)
    return () => { (socket as any).off("solo:quiz", handler) }
  }, [socket, isConnected, quizId, realName, needName])

  // ── Result listener ────────────────────────────────────────
  useEffect(() => {
    if (!socket) return
    const handler = (data: SoloResultResp) => {
      setResult(data)
      setStage("done")
    }
    ;(socket as any).on("solo:result", handler)
    return () => { (socket as any).off("solo:result", handler) }
  }, [socket])

  // ── Per-question countdown ─────────────────────────────────
  useEffect(() => {
    if (stage !== "playing" || !question || showingAnswer) return
    questionStartRef.current = Date.now()
    setRemaining(question.time)
    tickRef.current = setInterval(() => {
      setRemaining(r => {
        if (r <= 1) {
          if (tickRef.current) clearInterval(tickRef.current)
          handleAnswer(null)
          return 0
        }
        return r - 1
      })
    }, 1000)
    return () => { if (tickRef.current) clearInterval(tickRef.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, qIndex, showingAnswer])

  const handleAnswer = useCallback((chosen: number | null) => {
    if (!question || !quiz) return
    if (tickRef.current) { clearInterval(tickRef.current); tickRef.current = null }
    const ms = Date.now() - questionStartRef.current
    const isCorrect = chosen !== null && chosen === question.solution
    const selectedText = chosen === null ? "Not answered" : question.answers[chosen] ?? "Not answered"
    const gained = scoreFor(isCorrect, ms, question.time * 1000)

    setSelected(chosen)
    setShowingAnswer(true)
    setAnswers(prev => [...prev, { questionTitle: question.question, selectedAnswer: selectedText, isCorrect }])
    setPoints(p => p + gained)

    // show correct answer + feedback for 2s, then next or submit
    setTimeout(() => {
      const next = qIndex + 1
      if (next >= totalQuestions) {
        // submit
        const payload = {
          quizId: quiz.id,
          realName,
          username: realName,
          startedAt: new Date().toISOString(),
          answers: [...answers, { questionTitle: question.question, selectedAnswer: selectedText, isCorrect }],
          points: points + gained,
        }
        ;(socket as any)?.emit("solo:submit", payload)
        setStage("loading")  // wait for solo:result
      } else {
        setQIndex(next)
        setSelected(null)
        setShowingAnswer(false)
      }
    }, 2000)
  }, [question, quiz, qIndex, totalQuestions, answers, points, realName, socket])

  const handleStart = () => {
    setQIndex(0)
    setSelected(null)
    setAnswers([])
    setPoints(0)
    setShowingAnswer(false)
    setStage("playing")
  }

  const handleRegisterName = () => {
    const n = registerInput.trim()
    if (!n) return
    try { localStorage.setItem(REAL_NAME_KEY, n) } catch {}
    setRealName(n)
    setNeedName(false)
  }

  // ── Rendering ─────────────────────────────────────────────
  if (needName) {
    return (
      <Shell>
        <div className="flex flex-col gap-3">
          <h2 className="text-lg font-bold text-gray-800">Identifique-se</h2>
          <p className="text-sm text-gray-500">To save your progress and limit attempts.</p>
          <Input
            value={registerInput}
            onChange={e => setRegisterInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleRegisterName()}
            placeholder="Your full name"
            maxLength={40}
            autoFocus
          />
          <Button onClick={handleRegisterName}>Start</Button>
        </div>
      </Shell>
    )
  }

  if (stage === "loading" || !isConnected) {
    return <Shell><div className="py-8 text-center text-sm text-gray-400">Loading…</div></Shell>
  }

  if (stage === "error") {
    return <Shell><div className="py-8 text-center text-sm text-red-500">{error}</div></Shell>
  }

  if (stage === "ready" && resp?.ok) {
    const remaining = resp.maxAttempts - resp.attemptsUsed
    return (
      <Shell>
        <div className="flex flex-col gap-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-primary">Modo Solo</p>
            <h2 className="text-lg font-bold text-gray-800">{resp.quiz.subject}</h2>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <Stat label="Questions" value={resp.quiz.questions.length} />
            <Stat label="Tempo" value={`${resp.quiz.questions.reduce((s, q) => s + q.time, 0)}s`} />
            <Stat label="Tentativas" value={`${remaining}/${resp.maxAttempts}`} highlight={remaining > 0} />
          </div>
          <p className="text-[11px] text-gray-500">
            You have <span className="font-bold">{remaining}</span> {remaining === 1 ? "attempt" : "attempts"} remaining for this quiz.
            Results count toward XP and achievements, but not the weekly ranking.
          </p>
          <Button onClick={handleStart}>Start</Button>
        </div>
      </Shell>
    )
  }

  if (stage === "playing" && quiz && question) {
    return (
      <Shell wide>
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-widest text-gray-400">
              Questão {qIndex + 1} / {totalQuestions}
            </span>
            <span className={clsx("tabular-nums text-sm font-bold",
              remaining <= 5 ? "text-red-500 animate-pulse" : "text-gray-600")}>
              {remaining}s
            </span>
          </div>

          {question.image && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={question.image} alt="" className="mx-auto max-h-44 rounded-lg object-contain" />
          )}

          <p className="text-base font-bold text-gray-800">{question.question}</p>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {question.answers.map((a, i) => {
              const isSelected = selected === i
              const isCorrect = showingAnswer && i === question.solution
              const isWrong = showingAnswer && isSelected && i !== question.solution
              return (
                <button
                  key={i}
                  onClick={() => !showingAnswer && handleAnswer(i)}
                  disabled={showingAnswer}
                  className={clsx(
                    "rounded-xl px-4 py-4 text-left text-sm font-semibold transition-all shadow ring-1",
                    !showingAnswer && "hover:brightness-105 active:scale-[0.98]",
                    !isSelected && !showingAnswer && "bg-white text-gray-800 ring-gray-200",
                    isSelected && !showingAnswer && "bg-primary text-white ring-primary-dark",
                    isCorrect && "bg-green-500 text-white ring-green-600",
                    isWrong && "bg-red-500 text-white ring-red-600",
                    showingAnswer && !isCorrect && !isWrong && "bg-gray-100 text-gray-400 ring-gray-200 opacity-70",
                  )}
                >
                  {a}
                </button>
              )
            })}
          </div>

          <div className="flex items-center justify-between text-[11px] font-semibold text-gray-400">
            <span>Points: <span className="tabular-nums text-gray-800">{points}</span></span>
            {showingAnswer && (
              <span className={selected === question.solution ? "text-green-600" : "text-red-500"}>
                {selected === question.solution ? "✓ Correct" : selected === null ? "Time up" : "✗ Wrong"}
              </span>
            )}
          </div>
        </div>
      </Shell>
    )
  }

  if (stage === "done" && result && "ok" in result && result.ok) {
    return (
      <Shell wide>
        <div className="flex flex-col items-center gap-4 text-center">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-widest text-primary">
              Tentativa {result.attemptNumber} de {result.maxAttempts}
            </p>
            <h2 className="text-xl font-bold text-gray-800">
              {result.isPerfect ? "🎯 Gabarito perfeito!" : "Jogo finalizado"}
            </h2>
          </div>

          <div className="grid w-full grid-cols-4 gap-2">
            <Stat label="Correct" value={result.correct} />
            <Stat label="Erros" value={result.incorrect} />
            <Stat label="Streak" value={result.longestStreak} />
            <Stat label="+XP" value={result.xpGained} highlight />
          </div>

          <div className="w-full">
            <TierBadge tier={result.newTier} level={result.newLevel} size="md" />
          </div>

          {result.newBadges.length > 0 && (
            <div className="w-full rounded-xl bg-gradient-to-br from-amber-50 to-amber-100 p-3 ring-1 ring-amber-200">
              <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-amber-700">
                New achievements
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                {result.newBadges.map(b => (
                  <div key={b.id} className="flex items-center gap-1.5 rounded-lg bg-white px-2 py-1 text-xs font-semibold shadow ring-1 ring-amber-200">
                    <span>{b.emoji}</span>
                    <span className="text-gray-700">{b.label}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex w-full gap-2">
            {result.attemptNumber < result.maxAttempts ? (
              <Button onClick={() => { setResult(null); setStage("ready") }} className="flex-1">
                Tentar novamente
              </Button>
            ) : (
              <div className="flex-1 rounded-lg bg-gray-100 px-4 py-3 text-center text-xs font-semibold text-gray-500">
                Tentativas esgotadas
              </div>
            )}
            <a
              href="/"
              className="rounded-lg bg-white px-4 py-3 text-xs font-semibold text-gray-500 ring-1 ring-gray-200 hover:text-primary"
            >
              Back
            </a>
          </div>
        </div>
      </Shell>
    )
  }

  if (stage === "done" && result && !result.ok) {
    return <Shell><div className="py-8 text-center text-sm text-red-500">Erro ao salvar: {result.reason}</div></Shell>
  }

  return <Shell><div className="py-8 text-center text-sm text-gray-400">…</div></Shell>
}

function Shell({ children, wide }: { children: React.ReactNode; wide?: boolean }) {
  return (
    <section className="bg-gradient-angel relative flex min-h-dvh flex-col items-center justify-center px-4 py-6">
      <div className={clsx(
        "card-3d z-10 flex w-full flex-col gap-4 rounded-2xl bg-white p-5",
        wide ? "max-w-lg" : "max-w-sm"
      )}>
        {children}
      </div>
    </section>
  )
}

function Stat({ label, value, highlight }: { label: string; value: number | string; highlight?: boolean }) {
  return (
    <div className={clsx(
      "flex flex-col items-center rounded-xl px-2 py-2 ring-1",
      highlight ? "bg-primary/5 ring-primary/20" : "bg-gray-50 ring-gray-100"
    )}>
      <span className="text-base font-bold tabular-nums text-gray-800">{value}</span>
      <span className="text-[9px] font-semibold uppercase tracking-wider text-gray-400">{label}</span>
    </div>
  )
}
