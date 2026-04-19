"use client"

import { Player } from "@rahoot/common/types/game"
import { ManagerStatusDataMap } from "@rahoot/common/types/game/status"
import { useEvent, useSocket } from "@rahoot/web/contexts/socketProvider"
import { useManagerStore } from "@rahoot/web/stores/manager"
import { useState } from "react"
import QRCode from "react-qr-code"

type Props = {
  data: ManagerStatusDataMap["SHOW_ROOM"]
}

const Room = ({ data: { text, inviteCode } }: Props) => {
  const { gameId } = useManagerStore()
  const { socket, webUrl } = useSocket()
  const { players } = useManagerStore()
  const [playerList, setPlayerList] = useState<Player[]>(players)
  const [totalPlayers, setTotalPlayers] = useState(0)

  useEvent("manager:newPlayer", (player) => {
    setPlayerList([...playerList, player])
  })

  useEvent("manager:removePlayer", (playerId) => {
    setPlayerList(playerList.filter((p) => p.id !== playerId))
  })

  useEvent("manager:playerKicked", (playerId) => {
    setPlayerList(playerList.filter((p) => p.id !== playerId))
  })

  useEvent("game:totalPlayers", (total) => {
    setTotalPlayers(total)
  })

  const handleKick = (playerId: string) => () => {
    if (!gameId) {
      return
    }

    socket?.emit("manager:kickPlayer", {
      gameId,
      playerId,
    })
  }

  return (
    <section className="relative mx-auto flex w-full max-w-7xl flex-1 flex-col items-center justify-center px-2">
      <div className="mb-10 flex flex-col-reverse items-center gap-3 md:flex-row md:items-stretch">
        <div className="flex flex-col gap-3 md:flex-row">
          <div className="game-pin-out flex flex-col justify-center rounded-md bg-white px-6 py-4">
            <p className="text-2xl font-bold">Join the game at</p>
            <p className="w-60 text-lg font-extrabold break-all">{webUrl}</p>
          </div>

          <div className="game-pin-in flex flex-col justify-center rounded-md bg-white px-6 py-4 text-center md:rounded-l-none md:text-left">
            <p className="text-2xl font-bold">Game PIN:</p>
            <p className="text-6xl font-extrabold">{inviteCode}</p>
          </div>
        </div>

        <div className="flex h-40 shrink-0 rounded-md bg-white p-2">
          <QRCode
            className="h-auto w-auto"
            value={`${webUrl}?pin=${inviteCode}`}
          />
        </div>
      </div>

      <h2 className="mb-4 text-4xl font-bold text-white drop-shadow-lg">
        {text}
      </h2>

      <div className="mb-6 flex items-center justify-center rounded-full bg-black/40 px-6 py-3">
        <span className="text-2xl font-bold text-white drop-shadow-md">
          Players Joined: {totalPlayers}
        </span>
      </div>

      <div className="flex flex-wrap justify-center gap-3">
        {playerList.map((player) => {
          const p = player as any
          return (
            <div
              key={player.id}
              className="flex flex-col items-center cursor-pointer group"
              onClick={handleKick(player.id)}
            >
              {/* Avatar */}
              <div className="mb-1 h-14 w-14 overflow-hidden rounded-xl border-3 border-white/30 bg-white/20 shadow-md transition-transform group-hover:scale-110">
                {p.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={p.avatarUrl}
                    alt={player.username}
                    className="h-full w-full object-contain p-0.5"
                    onError={(e) => { const t = e.currentTarget; t.style.display="none"; if(t.parentElement) t.parentElement.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;width:100%;font-size:1.2rem;font-weight:bold;color:rgba(255,255,255,0.6)">' + (player.username||"?").charAt(0).toUpperCase() + '</div>' }}
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-xl font-bold text-white/60">
                    {(player.username || "?").charAt(0).toUpperCase()}
                  </div>
                )}
              </div>

              {/* Name card */}
              <div className="rounded-lg bg-primary px-3 py-1.5 shadow-md">
                <span className="text-sm font-bold text-white drop-shadow-md group-hover:line-through">
                  {player.username}
                </span>
                {p.realName && p.realName !== player.username && (
                  <span className="block text-center text-[10px] font-medium text-white/50">
                    {p.realName}
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}

export default Room
