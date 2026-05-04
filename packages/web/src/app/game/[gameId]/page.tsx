"use client"

import { STATUS } from "@rahoot/common/types/game/status"
import GameWrapper from "@rahoot/web/components/game/GameWrapper"
import Answers from "@rahoot/web/components/game/states/Answers"
import Prepared from "@rahoot/web/components/game/states/Prepared"
import Question from "@rahoot/web/components/game/states/Question"
import Result from "@rahoot/web/components/game/states/Result"
import Start from "@rahoot/web/components/game/states/Start"
import Wait from "@rahoot/web/components/game/states/Wait"
import TeamSelect from "@rahoot/web/components/game/states/TeamSelect"
import PlayerPodium from "@rahoot/web/components/game/states/PlayerPodium"
import { useEvent, useSocket } from "@rahoot/web/contexts/socketProvider"
import { usePlayerStore } from "@rahoot/web/stores/player"
import { useQuestionStore } from "@rahoot/web/stores/question"
import { useParams, useRouter } from "next/navigation"
import toast from "react-hot-toast"

const PLAYER_STATES = new Set([
  STATUS.SELECT_ANSWER,
  STATUS.SELECT_TEAM,
  STATUS.SHOW_QUESTION,
  STATUS.WAIT,
  STATUS.SHOW_START,
  STATUS.SHOW_RESULT,
  STATUS.SHOW_PREPARED,
  STATUS.FINISHED,
])

const Game = () => {
  const router = useRouter()
  const { socket } = useSocket()
  const { gameId: gameIdParam }: { gameId?: string } = useParams()
  const { status, setPlayer, setGameId, setStatus, reset } = usePlayerStore()
  const { setQuestionStates } = useQuestionStore()

  useEvent("connect", () => {
    if (gameIdParam) {
      socket?.emit("player:reconnect", { gameId: gameIdParam })
    }
  })

  useEvent(
    "player:successReconnect",
    ({ gameId, status, player, currentQuestion }) => {
      setGameId(gameId)
      setStatus(status.name, status.data)
      setPlayer(player)
      setQuestionStates(currentQuestion)
    },
  )

  useEvent("game:status", ({ name, data }) => {
    if (PLAYER_STATES.has(name as any)) {
      setStatus(name, data)
    }
  })

  useEvent("game:reset", (message) => {
    router.replace("/")
    reset()
    setQuestionStates(null)
    toast.error(message)
  })

  if (!gameIdParam) {
    return null
  }

  // Full-screen podium — no GameWrapper chrome
  if (status?.name === STATUS.FINISHED) {
    return (
      <section className="relative flex min-h-dvh w-full flex-col justify-between" style={{ background: "linear-gradient(135deg, #005f8a 0%, #009edf 50%, #0078b0 100%)" }}>
        <PlayerPodium data={status.data} />
      </section>
    )
  }

  let component = null

  switch (status?.name) {
    case STATUS.WAIT:
      component = <Wait data={status.data} />
      break
    case STATUS.SHOW_START:
      component = <Start data={status.data} />
      break
    case STATUS.SHOW_PREPARED:
      component = <Prepared data={status.data} />
      break
    case STATUS.SHOW_QUESTION:
      component = <Question data={status.data} />
      break
    case STATUS.SHOW_RESULT:
      component = <Result data={status.data} />
      break
    case STATUS.SELECT_ANSWER:
      component = <Answers data={status.data} />
      break
    case STATUS.SELECT_TEAM:
      component = <TeamSelect data={status.data} />
      break
  }

  return <GameWrapper statusName={status?.name}>{component}</GameWrapper>
}

export default Game
