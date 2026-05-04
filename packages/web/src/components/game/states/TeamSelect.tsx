"use client"

import { useEvent, useSocket } from "@rahoot/web/contexts/socketProvider"
import { usePlayerStore } from "@rahoot/web/stores/player"
import { useState } from "react"
import clsx from "clsx"

type Props = {
  data: { teamA: number; teamB: number }
}

const TeamSelect = ({ data }: Props) => {
  const { socket } = useSocket()
  const { gameId } = usePlayerStore()
  const [counts, setCounts] = useState({ teamA: data.teamA, teamB: data.teamB })
  const [selected, setSelected] = useState<"A" | "B" | null>(null)

  useEvent("game:teamUpdate" as any, (update: { teamA: number; teamB: number }) => {
    setCounts(update)
  })

  const handleJoin = (team: "A" | "B") => {
    if (selected) return
    setSelected(team)
    socket?.emit("player:joinTeam", { gameId, data: { team } } as any)
  }

  return (
    <section className="flex min-h-dvh w-full flex-col items-center justify-center gap-8 px-4">
      <div className="text-center">
        <h1 className="text-3xl font-black text-white drop-shadow-lg">Choose your team</h1>
        <p className="mt-2 text-sm text-white/60">Pick a side — scores are balanced by team size</p>
      </div>

      <div className="flex w-full max-w-md gap-4">
        {/* Team A */}
        <button
          onClick={() => handleJoin("A")}
          disabled={!!selected}
          className={clsx(
            "flex flex-1 flex-col items-center gap-3 rounded-3xl border-4 px-6 py-8 font-black text-white transition-all duration-150 active:scale-[0.96]",
            selected === "A"
              ? "border-blue-300 bg-blue-500 shadow-xl shadow-blue-500/40 scale-105"
              : selected
              ? "border-blue-300/30 bg-blue-500/30 opacity-40 cursor-not-allowed"
              : "border-blue-300/60 bg-blue-500/70 hover:bg-blue-500 hover:border-blue-300 hover:scale-[1.02] cursor-pointer"
          )}
        >
          <span className="text-5xl">🔵</span>
          <span className="text-3xl tracking-widest">TEAM A</span>
          <span className="mt-1 rounded-full bg-white/20 px-4 py-1 text-base tabular-nums">
            {counts.teamA} {counts.teamA === 1 ? "player" : "players"}
          </span>
          {selected === "A" && (
            <span className="text-sm font-bold text-blue-100">You&apos;re in!</span>
          )}
        </button>

        {/* Team B */}
        <button
          onClick={() => handleJoin("B")}
          disabled={!!selected}
          className={clsx(
            "flex flex-1 flex-col items-center gap-3 rounded-3xl border-4 px-6 py-8 font-black text-white transition-all duration-150 active:scale-[0.96]",
            selected === "B"
              ? "border-red-300 bg-red-500 shadow-xl shadow-red-500/40 scale-105"
              : selected
              ? "border-red-300/30 bg-red-500/30 opacity-40 cursor-not-allowed"
              : "border-red-300/60 bg-red-500/70 hover:bg-red-500 hover:border-red-300 hover:scale-[1.02] cursor-pointer"
          )}
        >
          <span className="text-5xl">🔴</span>
          <span className="text-3xl tracking-widest">TEAM B</span>
          <span className="mt-1 rounded-full bg-white/20 px-4 py-1 text-base tabular-nums">
            {counts.teamB} {counts.teamB === 1 ? "player" : "players"}
          </span>
          {selected === "B" && (
            <span className="text-sm font-bold text-red-100">You&apos;re in!</span>
          )}
        </button>
      </div>

      {!selected && (
        <p className="text-xs text-white/40">
          Tip: join the smaller team to keep things fair
        </p>
      )}
    </section>
  )
}

export default TeamSelect
