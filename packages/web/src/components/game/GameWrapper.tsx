"use client"

import { Status } from "@rahoot/common/types/game/status"
import background from "@rahoot/web/assets/background_screen.png"
import Button from "@rahoot/web/components/Button"
import Loader from "@rahoot/web/components/Loader"
import { useEvent, useSocket } from "@rahoot/web/contexts/socketProvider"
import { usePlayerStore } from "@rahoot/web/stores/player"
import { useQuestionStore } from "@rahoot/web/stores/question"
import { MANAGER_SKIP_BTN } from "@rahoot/web/utils/constants"
import clsx from "clsx"
import Image from "next/image"
import { PropsWithChildren, useEffect, useState } from "react"

type Props = PropsWithChildren & {
  statusName: Status | undefined
  onNext?: () => void
  manager?: boolean
  autoPlay?: boolean
  countdown?: { remaining: number; action: string | null } | null
  onToggleAutoPlay?: () => void
}

const GameWrapper = ({ children, statusName, onNext, manager, autoPlay, countdown, onToggleAutoPlay }: Props) => {
  const { isConnected } = useSocket()
  const { player } = usePlayerStore()
  const { questionStates, setQuestionStates } = useQuestionStore()
  const [isDisabled, setIsDisabled] = useState(false)
  const next = statusName ? MANAGER_SKIP_BTN[statusName] : null

  useEvent("game:updateQuestion", ({ current, total }) => {
    setQuestionStates({ current, total })
  })

  useEffect(() => {
    setIsDisabled(false)
  }, [statusName])

  const handleNext = () => {
    setIsDisabled(true)
    onNext?.()
  }

  return (
    <section className="relative flex min-h-dvh w-full flex-col justify-between">
      <div className="fixed top-0 left-0 -z-10 h-full w-full bg-white opacity-30">
        <Image
          className="pointer-events-none h-full w-full object-cover opacity-30"
          src={background}
          alt="background"
        />
      </div>

      {!isConnected && !statusName ? (
        <div className="flex h-full w-full flex-1 flex-col items-center justify-center gap-4">
          <Loader />
          <h1 className="text-4xl font-bold text-white drop-shadow-lg">Connecting...</h1>
        </div>
      ) : (
        <>
          <div className="flex w-full items-center justify-between p-4">
            {questionStates ? (
              <div className="flex items-center gap-1.5 rounded-full bg-black/40 backdrop-blur-sm px-4 py-2 text-sm font-bold text-white shadow-md">
                <span className="text-white/60">Q</span>
                <span>{questionStates.current}</span>
                <span className="text-white/40">/</span>
                <span className="text-white/60">{questionStates.total}</span>
              </div>
            ) : (
              <div />
            )}

            {manager && (
              <div className="flex items-center gap-2">
                {countdown && countdown.remaining > 0 && (
                  <div className="flex items-center gap-1 rounded-full bg-black/50 backdrop-blur-sm px-3 py-1.5 text-sm font-bold text-white shadow-md tabular-nums">
                    <span className="text-yellow-300">{countdown.remaining}s</span>
                  </div>
                )}
                {onToggleAutoPlay && (
                  <button
                    onClick={onToggleAutoPlay}
                    className={clsx(
                      "rounded-full px-4 py-2 text-sm font-bold border transition-colors",
                      autoPlay
                        ? "bg-yellow-400/90 border-yellow-300 text-gray-900"
                        : "bg-white/15 backdrop-blur-sm border-white/20 text-white hover:bg-white/25",
                    )}
                  >
                    {autoPlay ? "⏸ Auto" : "▶ Auto"}
                  </button>
                )}
                {next && (
                  <Button
                    className={clsx("self-end bg-white/15 backdrop-blur-sm px-5 text-white border border-white/20 hover:bg-white/25!", {
                      "pointer-events-none opacity-60": isDisabled,
                    })}
                    onClick={handleNext}
                  >
                    {next}
                  </Button>
                )}
              </div>
            )}
          </div>

          {children}

          {!manager && (
            <div className="z-50 flex items-center justify-between bg-black/60 backdrop-blur-sm px-5 py-3 border-t border-white/10">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/30 text-sm font-bold text-white">
                  {(player?.username || "?").charAt(0).toUpperCase()}
                </div>
                <p className="text-sm font-bold text-white/90">{player?.username}</p>
              </div>
              <div className="flex items-center gap-2 rounded-full bg-accent px-4 py-1.5">
                <span className="text-sm font-black text-gray-900 tabular-nums">{player?.points ?? 0}</span>
                <span className="text-xs font-semibold text-gray-700">pts</span>
              </div>
            </div>
          )}
        </>
      )}
    </section>
  )
}

export default GameWrapper
