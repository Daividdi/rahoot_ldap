"use client"
import { CommonStatusDataMap } from "@rahoot/common/types/game/status"
import { ANSWERS_COLORS, ANSWERS_ICONS } from "@rahoot/web/utils/constants"
import { useSocket } from "@rahoot/web/contexts/socketProvider"
import { useManagerStore } from "@rahoot/web/stores/manager"
import CricleCheck from "@rahoot/web/components/icons/CricleCheck"
import clsx from "clsx"
import { calculatePercentages } from "@rahoot/web/utils/score"

type Props = {
  data: CommonStatusDataMap["REVIEW_QUESTIONS"]
  isManager?: boolean
}

const ReviewQuestions = ({ data, isManager = false }: Props) => {
  const { socket } = useSocket()
  const { gameId } = useManagerStore()

  const { currentIndex, total, question, answers, answerImages, correct, image, responses } = data
  const correctSet = new Set(Array.isArray(correct) ? correct : [correct])
  const percentages = calculatePercentages(responses)

  const totalResponses = Object.values(responses).reduce((s, v) => s + v, 0)

  const handlePrev = () => { if (gameId) (socket as any)?.emit("manager:prevReviewQuestion", { gameId }) }
  const handleNext = () => { if (gameId) (socket as any)?.emit("manager:nextReviewQuestion", { gameId }) }
  const handlePodium = () => { if (gameId) (socket as any)?.emit("manager:endReview", { gameId }) }

  return (
    <div className="flex flex-1 flex-col items-center justify-between px-4 pb-6 pt-2 gap-4 w-full max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex w-full items-center justify-between">
        <h1 className="text-xl font-bold text-white/80 uppercase tracking-widest">Revisão</h1>
        <span className="rounded-full bg-white/10 px-4 py-1.5 text-sm font-bold text-white">
          {currentIndex + 1} / {total}
        </span>
      </div>

      {/* Question */}
      <div className="flex flex-col items-center gap-3 w-full">
        <h2 className="text-center text-2xl font-bold text-white drop-shadow-lg md:text-3xl">
          {question}
        </h2>
        {image && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={image} alt="" className="max-h-40 rounded-xl object-contain shadow-xl" />
        )}
      </div>

      {/* Answers */}
      <div className="grid w-full max-w-3xl gap-3" style={{ gridTemplateColumns: `repeat(${Math.min(answers.length, 2)}, 1fr)` }}>
        {answers.map((answer, key) => {
          const Icon = ANSWERS_ICONS[key]
          const isCorrect = correctSet.has(key)
          const count = responses[key] || 0
          const pct = totalResponses > 0 ? Math.round((count / totalResponses) * 100) : 0
          return (
            <div key={key} className={clsx("relative flex flex-col gap-1.5 rounded-xl p-3 transition-all", ANSWERS_COLORS[key], isCorrect ? "ring-4 ring-green-400 shadow-lg shadow-green-400/30" : "opacity-50")}>
              <div className="flex items-center gap-2">
                {Icon && <Icon className="h-5 w-5 shrink-0 text-white" />}
                <span className="flex-1 text-sm font-bold text-white leading-tight">
                  {answerImages?.[key] && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={answerImages[key]!} alt="" className="mb-1 max-h-16 rounded-lg object-contain" />
                  )}
                  {answer}
                </span>
                {isCorrect && <CricleCheck className="h-5 w-5 shrink-0" />}
              </div>
              {/* Response bar */}
              <div className="flex items-center gap-2">
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-black/20">
                  <div className="h-full rounded-full bg-white/70 transition-all duration-700" style={{ width: `${pct}%` }} />
                </div>
                <span className="min-w-[3rem] text-right text-xs font-bold text-white/80">{count} ({pct}%)</span>
              </div>
            </div>
          )
        })}
      </div>

      {/* Footer */}
      {isManager ? (
        <div className="flex w-full items-center justify-between gap-3 pt-2">
          <button
            disabled={currentIndex === 0}
            onClick={handlePrev}
            className="rounded-xl bg-white/10 px-5 py-2.5 text-sm font-bold text-white hover:bg-white/20 disabled:opacity-30 transition-all"
          >
            ← Anterior
          </button>
          <button
            onClick={handlePodium}
            className="rounded-xl bg-blue-600 px-8 py-2.5 text-sm font-bold text-white hover:bg-blue-500 shadow-lg shadow-blue-600/30 transition-all"
          >
            🏆 Ir para o Pódio
          </button>
          <button
            disabled={currentIndex === total - 1}
            onClick={handleNext}
            className="rounded-xl bg-white/10 px-5 py-2.5 text-sm font-bold text-white hover:bg-white/20 disabled:opacity-30 transition-all"
          >
            Próxima →
          </button>
        </div>
      ) : (
        <p className="text-sm text-white/40 italic">Aguardando o trainer...</p>
      )}
    </div>
  )
}

export default ReviewQuestions
