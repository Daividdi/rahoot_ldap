import Button from "@rahoot/web/components/Button"
import Form from "@rahoot/web/components/Form"
import Input from "@rahoot/web/components/Input"
import { useEvent, useSocket } from "@rahoot/web/contexts/socketProvider"
import { usePlayerStore } from "@rahoot/web/stores/player"
import { useSearchParams } from "next/navigation"
import { KeyboardEvent, useEffect, useRef, useState } from "react"

const Room = () => {
  const { socket, isConnected } = useSocket()
  const { join } = usePlayerStore()
  const [invitation, setInvitation] = useState("")
  const searchParams = useSearchParams()
  const hasJoinedRef = useRef(false)

  const handleJoin = () => {
    socket?.emit("player:join", invitation)
  }

  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Enter") {
      handleJoin()
    }
  }

  useEvent("game:successRoom", (gameId) => {
    join(gameId)
  })

  useEffect(() => {
    const pinCode = searchParams.get("pin")

    if (!isConnected || !pinCode || hasJoinedRef.current) {
      return
    }

    socket?.emit("player:join", pinCode)
    hasJoinedRef.current = true
  }, [searchParams, isConnected, socket])

  return (
    <Form>
      <div>
        <h2 className="text-lg font-bold text-gray-800">Join Game</h2>
        <p className="text-sm text-gray-400">Enter the PIN code to play</p>
      </div>
      <Input
        onChange={(e) => setInvitation(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Game PIN"
      />
      <Button onClick={handleJoin}>Join</Button>
    </Form>
  )
}

export default Room
