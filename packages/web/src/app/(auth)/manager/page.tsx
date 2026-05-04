"use client"

import { QuizzWithId } from "@rahoot/common/types/game"
import { STATUS } from "@rahoot/common/types/game/status"
import ManagerPassword from "@rahoot/web/components/game/create/ManagerPassword"
import ManagerDashboard from "@rahoot/web/components/game/create/ManagerDashboard"
import Loader from "@rahoot/web/components/Loader"
import { useEvent, useSocket } from "@rahoot/web/contexts/socketProvider"
import { useManagerStore } from "@rahoot/web/stores/manager"
import { useRouter } from "next/navigation"
import { useState, useEffect } from "react"

const Manager = () => {
  const { setGameId, setStatus } = useManagerStore()
  const router = useRouter()
  const { socket } = useSocket()

  const [isAuth, setIsAuth] = useState(false)
  const [isCheckingAuth, setIsCheckingAuth] = useState(false)
  const [quizzList, setQuizzList] = useState<QuizzWithId[]>([])

  useEffect(() => {
    const savedPassword = sessionStorage.getItem("manager_auth_token")
    if (savedPassword && socket) {
      setIsCheckingAuth(true)
      socket.emit("manager:auth", savedPassword)
    }
  }, [socket])

  useEvent("manager:quizzList", (quizzList) => {
    setIsAuth(true)
    setIsCheckingAuth(false)
    setQuizzList(quizzList)
  })

  useEvent("manager:errorMessage", () => {
    setIsCheckingAuth(false)
    sessionStorage.removeItem("manager_auth_token")
  })

  useEvent("manager:gameCreated", ({ gameId, inviteCode }) => {
    setGameId(gameId)
    setStatus(STATUS.SHOW_ROOM, { text: "Waiting for the players", inviteCode })
    router.push(`/game/manager/${gameId}`)
  })

  const handleAuth = (password: string) => {
    sessionStorage.setItem("manager_auth_token", password)
    socket?.emit("manager:auth", password)
  }

  const handleCreate = (quizzId: string, mode: "classic" | "team" = "classic") => {
    socket?.emit("game:create", { quizzId, mode })
  }

  if (isCheckingAuth) {
    return (
      <div className="flex flex-col items-center gap-4">
        <Loader className="h-16" />
        <p className="text-white/70 text-sm font-medium">Authenticating...</p>
      </div>
    )
  }

  if (!isAuth) {
    return <ManagerPassword onSubmit={handleAuth} />
  }

  return <ManagerDashboard quizzList={quizzList} onSelect={handleCreate} />
}

export default Manager
