"use client"

import { CommonStatusDataMap } from "@rahoot/common/types/game/status"
import AnswerButton from "@rahoot/web/components/AnswerButton"
import { useEvent, useSocket } from "@rahoot/web/contexts/socketProvider"
import { usePlayerStore } from "@rahoot/web/stores/player"
import {
  ANSWERS_COLORS,
  ANSWERS_ICONS,
  SFX_ANSWERS_MUSIC,
  SFX_ANSWERS_SOUND,
} from "@rahoot/web/utils/constants"
import clsx from "clsx"
import { useParams } from "next/navigation"
import { useEffect, useState } from "react"
import useSound from "use-sound"

type Props = {
  data: CommonStatusDataMap["SELECT_ANSWER"]
}

const Answers = ({
  data: { question, answers, answerImages, image, audio, video, time, totalPlayer },
}: Props) => {
  const { gameId }: { gameId?: string } = useParams()
  const { socket } = useSocket()
  const { player } = usePlayerStore()

  const [cooldown, setCooldown] = useState(time)
  const [totalAnswer, setTotalAnswer] = useState(0)
  const [answered, setAnswered] = useState(false)

  const [sfxPop] = useSound(SFX_ANSWERS_SOUND, { volume: 0.1 })
  const [playMusic, { stop: stopMusic }] = useSound(SFX_ANSWERS_MUSIC, {
    volume: 0.2,
    interrupt: true,
    loop: true,
  })

  const handleAnswer = (answerKey: number) => () => {
    if (!player || answered) return
    socket?.emit("player:selectedAnswer", { gameId, data: { answerKey } })
    sfxPop()
    setAnswered(true)
  }

  useEffect(() => {
    if (video || audio) return
    playMusic()
    return () => { stopMusic() }
  }, [playMusic])

  useEvent("game:cooldown", (sec) => { setCooldown(sec) })
  useEvent("game:playerAnswer", (count) => { setTotalAnswer(count); sfxPop() })

  const timePercent = Math.round((cooldown / time) * 100)
  const timeColor = timePercent > 50 ? "bg-green-400" : timePercent > 25 ? "bg-amber-400" : "bg-red-400"
  const hasAnyAnswerImage = answerImages && answerImages.some(Boolean)

  return (
    <div className="flex h-full flex-1 flex-col justify-between">
      <div className="mx-auto inline-flex h-full w-full max-w-7xl flex-1 flex-col items-center justify-center gap-4 px-4">
        <h2 className="text-center text-2xl font-bold text-white drop-shadow-lg md:text-4xl lg:text-5xl [text-wrap:balance]">
          {question}
        </h2>

        {Boolean(audio) && !player && (
          <audio className="m-4 mb-2 w-auto rounded-md" src={audio} autoPlay controls />
        )}
        {Boolean(video) && !player && (
          <video className="m-4 mb-2 aspect-video max-h-60 w-auto rounded-md px-4 sm:max-h-100" src={video} autoPlay controls />
        )}
        {Boolean(image) && (
          <img alt={question} src={image} className={clsx("mb-2 w-auto rounded-xl shadow-xl px-4", hasAnyAnswerImage ? "max-h-32" : "max-h-52 sm:max-h-80")} style={{ outline: "1px solid rgba(255,255,255,0.12)" }} />
        )}
      </div>

      <div className="pb-2">
        {/* Stats bar */}
        <div className="mx-auto mb-3 flex w-full max-w-7xl items-center justify-between gap-3 px-4">
          <div className="flex items-center gap-2 rounded-2xl bg-black/50 backdrop-blur-sm px-5 py-2.5 shadow-md">
            <div className="relative flex h-8 w-8 items-center justify-center">
              <svg className="absolute inset-0 -rotate-90" viewBox="0 0 32 32" fill="none">
                <circle cx="16" cy="16" r="14" stroke="rgba(255,255,255,0.15)" strokeWidth="3" />
                <circle
                  cx="16" cy="16" r="14"
                  stroke={timePercent > 50 ? "#4ade80" : timePercent > 25 ? "#fbbf24" : "#f87171"}
                  strokeWidth="3"
                  strokeDasharray={`${2 * Math.PI * 14}`}
                  strokeDashoffset={`${2 * Math.PI * 14 * (1 - timePercent / 100)}`}
                  strokeLinecap="round"
                  style={{ transition: "stroke-dashoffset 1s linear, stroke 0.5s" }}
                />
              </svg>
              <span className="relative text-xs font-black text-white tabular-nums">{cooldown}</span>
            </div>
            <span className="text-xs font-semibold text-white/60 uppercase tracking-wide">Time</span>
          </div>

          <div className="flex items-center gap-2 rounded-2xl bg-black/50 backdrop-blur-sm px-5 py-2.5 shadow-md">
            <span className="text-xs font-semibold text-white/60 uppercase tracking-wide">Answers</span>
            <span className="text-lg font-black text-white tabular-nums">{totalAnswer}</span>
            <span className="text-xs text-white/40">/{totalPlayer}</span>
          </div>
        </div>

        <div className="mx-auto mb-3 h-1.5 w-full max-w-7xl overflow-hidden rounded-full bg-white/10 px-4">
          <div
            className={clsx("h-full rounded-full transition-all duration-1000", timeColor)}
            style={{ width: `${timePercent}%` }}
          />
        </div>

        {/* Answer buttons */}
        <div className={clsx("mx-auto mb-3 grid w-full max-w-7xl gap-3 px-3", "grid-cols-2")}>
          {answers.map((answer, key) => {
            const img = answerImages?.[key]
            return (
              <AnswerButton
                key={key}
                className={clsx(ANSWERS_COLORS[key], answered && "opacity-60 pointer-events-none", img && "!py-3 !items-start")}
                icon={ANSWERS_ICONS[key]}
                onClick={handleAnswer(key)}
              >
                <span className="flex flex-col items-start gap-1.5 w-full">
                  {img && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={img}
                      alt=""
                      className="w-full rounded-xl object-contain shadow-lg border-2 border-white/30"
                      style={{ maxHeight: "120px" }}
                    />
                  )}
                  {answer && <span>{answer}</span>}
                </span>
              </AnswerButton>
            )
          })}
        </div>
      </div>
    </div>
  )
}

export default Answers
