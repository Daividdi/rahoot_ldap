"use client"

import PlayerHomeCard from "@rahoot/web/components/profile/PlayerHomeCard"
import Username from "@rahoot/web/components/game/join/Username"
import { useEvent, useSocket } from "@rahoot/web/contexts/socketProvider"
import { usePlayerStore } from "@rahoot/web/stores/player"
import { useEffect } from "react"
import toast from "react-hot-toast"

const Home = () => {
  const { isConnected, connect } = useSocket()
  const { player } = usePlayerStore()

  useEffect(() => {
    if (!isConnected) {
      connect()
    }
  }, [connect, isConnected])

  useEvent("game:errorMessage", (message) => {
    toast.error(message)
  })

  // Once a PIN has been accepted, `player` is set and we switch to the
  // in-game identity screen (avatar picker + "let's go"). Until then, show
  // the new Home/Profile card with inline PIN entry.
  if (player) {
    return <Username />
  }

  return <PlayerHomeCard />
}

export default Home
