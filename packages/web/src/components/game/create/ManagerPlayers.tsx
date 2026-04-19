"use client"

import clsx from "clsx"
import { useEffect, useMemo, useState } from "react"
import { useSocket } from "@rahoot/web/contexts/socketProvider"
import { useRouter } from "next/navigation"

type Props = {
  quizzList: any[]
  regionFilter?: "all" | "BR" | "MY"
}

const safeRegion = (q: any): "BR" | "MY" => {
  const r = (q?.region || "").toLowerCase()
  if (r.includes("my") || r.includes("malaysia")) return "MY"
  const s = (q?.subject || "").toLowerCase()
  const c = (q?.createdBy || "").toLowerCase()
  if (["rule refresh", "my ", "malaysia"].some(k => s.includes(k)) ||
      ["grace", "elvina", "kt"].some(k => c.includes(k))) return "MY"
  return "BR"
}

const safeParseDate = (d: string): Date | null => {
  if (!d) return null
  try {
    const [datePart, timePart] = d.split(",").map(s => s.trim())
    const p = datePart.split("/")
    if (p.length !== 3) return null
    let day: number, month: number, year: number
    if (Number(p[2]) > 100) { day = Number(p[0]); month = Number(p[1]) - 1; year = Number(p[2]) }
    else { month = Number(p[0]) - 1; day = Number(p[1]); year = Number(p[2]) }
    const h = timePart ? Number(timePart.split(":")[0]) || 0 : 0
    const m = timePart ? Number(timePart.split(":")[1]) || 0 : 0
    return new Date(year, month, day, h, m)
  } catch { return null }
}

const PencilIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>
  </svg>
)

const AccBadge = ({ v }: { v: number }) => (
  <span className={clsx("inline-flex rounded px-2 py-0.5 text-[11px] font-semibold",
    v >= 70 ? "bg-green-100 text-green-800" : v >= 50 ? "bg-blue-100 text-blue-800"
    : v >= 35 ? "bg-amber-100 text-amber-800" : "bg-red-100 text-red-800")}>
    {v}%
  </span>
)

const RankBadge = ({ rank, total }: { rank: number; total: number }) => (
  <span className={clsx("inline-flex rounded px-2 py-0.5 text-[11px] font-semibold",
    rank === 1 ? "bg-amber-100 text-amber-700"
    : rank === 2 ? "bg-gray-100 text-gray-600"
    : rank === 3 ? "bg-orange-100 text-orange-700"
    : "bg-gray-50 text-gray-500")}>
    #{rank}/{total}
  </span>
)

const ManagerPlayers = ({ quizzList, regionFilter = "all" }: Props) => {
  const router = useRouter()
  const [search, setSearch] = useState("")
  const [sortBy, setSortBy] = useState<"accuracy" | "points" | "quizzes">("accuracy")
  const { socket } = useSocket()
  const [nameCorrections, setNameCorrections] = useState<Record<string, string>>({})
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState("")
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null)
  const [page, setPage] = useState(0)
  const PAGE_SIZE = 25

  useEffect(() => {
    if (!socket) return
    ;(socket as any).emit("manager:getPlayerNames", (data: Record<string, string>) => {
      setNameCorrections(data || {})
    })
  }, [socket])

  const players = useMemo(() => {
    const source = regionFilter === "all" ? quizzList : quizzList.filter(q => safeRegion(q) === regionFilter)
    const map: Record<string, { realName: string; nicknames: Set<string>; quizzes: number; points: number; correct: number; total: number }> = {}
    source.forEach((q) => {
      const stats = q.lastSessionStats || []
      stats.forEach((p: any) => {
        const key = p.clientId || p.realName || p.username || p.name || ""
        if (!key) return
        const corrected = nameCorrections[key]
        const displayName = corrected || p.realName || p.username || p.name || ""
        const nickname = p.username || p.name || ""
        if (!map[key]) map[key] = { realName: displayName, nicknames: new Set(), quizzes: 0, points: 0, correct: 0, total: 0 }
        if (corrected) map[key].realName = corrected
        else if (p.realName) map[key].realName = p.realName
        if (nickname && nickname !== map[key].realName) map[key].nicknames.add(nickname)
        map[key].quizzes++
        map[key].points += p.points || 0
        ;(p.answers || []).forEach((a: any) => {
          map[key].total++
          if (a.isCorrect) map[key].correct++
        })
      })
    })
    const list = Object.entries(map).map(([key, v]) => ({
      id: key,
      name: v.realName,
      nicknames: Array.from(v.nicknames).slice(0, 3),
      quizzes: v.quizzes,
      points: v.points,
      correct: v.correct,
      total: v.total,
      accuracy: v.total > 0 ? Math.round((v.correct / v.total) * 100) : 0,
      hasCorrectedName: !!nameCorrections[key],
    }))
    // Deduplicate by id in case of legacy data collisions (players without clientId keyed by name)
    return [...new Map(list.map(p => [p.id, p])).values()]
  }, [quizzList, regionFilter, nameCorrections])

  const filtered = useMemo(() => {
    let list = players
    if (search) list = list.filter(p => p.name.toLowerCase().includes(search.toLowerCase()))
    return [...list].sort((a, b) => {
      if (sortBy === "accuracy") return b.accuracy - a.accuracy
      if (sortBy === "points") return b.points - a.points
      return b.quizzes - a.quizzes
    })
  }, [players, search, sortBy])

  useEffect(() => { setPage(0) }, [filtered])

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)
  const pageSlice = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  // Selected player detail
  const selectedPlayer = useMemo(() => players.find(p => p.id === selectedPlayerId) || null, [players, selectedPlayerId])

  const playerHistory = useMemo(() => {
    if (!selectedPlayerId) return []
    return quizzList
      .filter(q => (q.lastSessionStats || []).some((s: any) =>
        (s.clientId || s.realName || s.username || s.name) === selectedPlayerId
      ))
      .map(q => {
        const pStats = (q.lastSessionStats || []).find((s: any) =>
          (s.clientId || s.realName || s.username || s.name) === selectedPlayerId
        )
        const sorted = [...(q.lastSessionStats || [])].sort((a: any, b: any) => (b.points || 0) - (a.points || 0))
        const rank = sorted.findIndex((s: any) =>
          (s.clientId || s.realName || s.username || s.name) === selectedPlayerId
        ) + 1
        const correct = (pStats?.answers || []).filter((a: any) => a.isCorrect).length
        const total = (pStats?.answers || []).length
        return {
          id: q.id,
          subject: q.subject,
          date: q.lastPlayedAt || q.createdAt || "",
          parsedDate: safeParseDate(q.lastPlayedAt || q.createdAt || ""),
          points: pStats?.points || 0,
          correct,
          total,
          accuracy: total > 0 ? Math.round(correct / total * 100) : 0,
          rank,
          totalPlayers: sorted.length,
          nickname: pStats?.username || pStats?.name || "",
        }
      })
      .sort((a, b) => (b.parsedDate?.getTime() || 0) - (a.parsedDate?.getTime() || 0))
  }, [selectedPlayerId, quizzList])

  const startEdit = (id: string, currentName: string) => {
    setEditingId(id)
    setEditName(nameCorrections[id] || currentName)
  }

  const saveEdit = (id: string) => {
    if (!socket) return
    const trimmed = editName.trim()
    ;(socket as any).emit("manager:updatePlayerName", { clientId: id, correctedName: trimmed })
    setNameCorrections(prev => {
      const next = { ...prev }
      if (trimmed) next[id] = trimmed
      else delete next[id]
      return next
    })
    setEditingId(null)
  }

  const removeCorrection = (id: string) => {
    if (!socket) return
    ;(socket as any).emit("manager:updatePlayerName", { clientId: id, correctedName: "" })
    setNameCorrections(prev => { const next = { ...prev }; delete next[id]; return next })
  }

  const rankColors = ["text-amber-500", "text-blue-500", "text-green-600", "text-red-500", "text-gray-400"]

  return (
    <div className="relative">
      {/* Main list */}
      <div className={clsx("transition-all", selectedPlayer ? "mr-[380px]" : "")}>
        <div className="mb-4 flex items-center gap-3">
          <input
            type="text"
            className="flex-1 rounded-lg border-2 border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-800 outline-none placeholder:text-gray-400 focus:border-primary"
            placeholder="Search players..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <select
            value={sortBy}
            onChange={e => setSortBy(e.target.value as any)}
            className="rounded-lg border-2 border-gray-200 bg-white px-3 py-2.5 text-sm font-medium text-gray-600 outline-none"
          >
            <option value="accuracy">Sort: Best accuracy</option>
            <option value="points">Sort: Most points</option>
            <option value="quizzes">Sort: Most quizzes</option>
          </select>
        </div>

        <div className="rounded-xl bg-white overflow-hidden">
          <div className="flex items-center gap-3 border-b border-gray-100 px-4 py-3 text-[11px] font-semibold text-gray-400">
            <div className="w-10 text-center">#</div>
            <div className="flex-1">Player</div>
            <div className="w-16 text-center">Quizzes</div>
            <div className="w-20 text-center">Points</div>
            <div className="w-16 text-center">Correct</div>
            <div className="w-16 text-center">Accuracy</div>
          </div>

          {pageSlice.map((p, i) => {
            const globalIndex = page * PAGE_SIZE + i
            return (
            <div
              key={`${p.id}-${globalIndex}`}
              className={clsx(
                "flex items-center gap-3 border-b border-gray-50 px-4 py-2.5 last:border-0 transition-colors cursor-pointer",
                selectedPlayerId === p.id ? "bg-primary/5 border-l-2 border-l-primary" : "hover:bg-gray-50"
              )}
              onClick={() => {
                if (editingId === p.id) return
                setSelectedPlayerId(selectedPlayerId === p.id ? null : p.id)
              }}
            >
              <div className={clsx("w-10 shrink-0 text-center text-sm font-semibold", rankColors[globalIndex] || "text-gray-400")}>
                {globalIndex + 1}
              </div>

              <div className="flex-1 min-w-0">
                {editingId === p.id ? (
                  <div className="flex items-center gap-2">
                    <input
                      autoFocus
                      type="text"
                      value={editName}
                      onChange={e => setEditName(e.target.value)}
                      onKeyDown={e => { if (e.key === "Enter") saveEdit(p.id); if (e.key === "Escape") setEditingId(null) }}
                      className="flex-1 rounded border-2 border-primary px-2 py-1 text-sm outline-none"
                      placeholder="Correct real name..."
                    />
                    <button onClick={() => saveEdit(p.id)}
                      className="rounded bg-primary px-2.5 py-1 text-xs font-semibold text-white hover:bg-primary/80">
                      Save
                    </button>
                    <button onClick={() => setEditingId(null)}
                      className="rounded bg-gray-200 px-2.5 py-1 text-xs font-semibold text-gray-600 hover:bg-gray-300">
                      Cancel
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 min-w-0">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-medium text-gray-700 truncate">{p.name}</span>
                        {p.hasCorrectedName && (
                          <span className="shrink-0 rounded bg-blue-100 px-1.5 py-0.5 text-[9px] font-bold text-blue-600">renamed</span>
                        )}
                      </div>
                      {p.nicknames.length > 0 && (
                        <div className="text-[10px] text-gray-400 truncate">aka: {p.nicknames.join(", ")}</div>
                      )}
                    </div>
                    <button onClick={e => { e.stopPropagation(); startEdit(p.id, p.name) }}
                      title="Edit real name"
                      className="shrink-0 rounded p-1 text-gray-300 hover:bg-gray-100 hover:text-primary transition-colors">
                      <PencilIcon />
                    </button>
                    {p.hasCorrectedName && (
                      <button onClick={e => { e.stopPropagation(); removeCorrection(p.id) }}
                        title="Remove name correction"
                        className="shrink-0 text-[10px] text-red-300 hover:text-red-500 transition-colors px-1">
                        ✕
                      </button>
                    )}
                  </div>
                )}
              </div>

              <div className="w-16 text-center text-sm text-gray-500">{p.quizzes}</div>
              <div className="w-20 text-center text-sm font-medium text-gray-700">{p.points.toLocaleString()}</div>
              <div className="w-16 text-center text-sm text-gray-500">{p.correct}/{p.total}</div>
              <div className="w-16 text-center">
                <AccBadge v={p.accuracy} />
              </div>
            </div>
            )
          })}

          {filtered.length === 0 && <div className="p-8 text-center text-sm text-gray-400">No players found</div>}

          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-gray-100 px-4 py-3">
              <button
                onClick={() => setPage(p => Math.max(0, p - 1))}
                disabled={page === 0}
                className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                ← Prev
              </button>
              <span className="text-xs text-gray-400">
                Page {page + 1} of {totalPages} · {filtered.length} players
              </span>
              <button
                onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
                className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                Next →
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Player detail panel */}
      {selectedPlayer && (
        <div className="fixed right-0 top-0 h-full w-[375px] bg-white shadow-2xl border-l border-gray-200 flex flex-col z-40 overflow-hidden">
          {/* Header */}
          <div className="bg-gradient-to-br from-primary to-primary/80 px-5 py-4 text-white">
            <div className="flex items-start justify-between">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/20 text-base font-bold">
                    {selectedPlayer.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="font-bold text-base leading-tight truncate">{selectedPlayer.name}</p>
                    {selectedPlayer.nicknames.length > 0 && (
                      <p className="text-[11px] text-white/70 truncate">aka: {selectedPlayer.nicknames.join(", ")}</p>
                    )}
                  </div>
                </div>
              </div>
              <button onClick={() => setSelectedPlayerId(null)}
                className="ml-2 shrink-0 rounded-full p-1.5 text-white/70 hover:bg-white/20 hover:text-white transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 6 6 18M6 6l12 12"/>
                </svg>
              </button>
            </div>

            {/* Stats bar */}
            <div className="mt-3 grid grid-cols-3 gap-2">
              {[
                { label: "Quizzes", value: selectedPlayer.quizzes },
                { label: "Total pts", value: selectedPlayer.points.toLocaleString() },
                { label: "Accuracy", value: `${selectedPlayer.accuracy}%` },
              ].map(s => (
                <div key={s.label} className="rounded-lg bg-white/15 px-2 py-1.5 text-center">
                  <div className="text-base font-bold">{s.value}</div>
                  <div className="text-[10px] text-white/70">{s.label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Quiz history list */}
          <div className="flex-1 overflow-y-auto">
            <div className="sticky top-0 bg-gray-50 border-b border-gray-100 px-5 py-2.5 flex items-center justify-between">
              <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
                Quiz history ({playerHistory.length})
              </p>
              <p className="text-[10px] text-gray-400">Most recent first</p>
            </div>

            {playerHistory.length === 0 && (
              <div className="p-8 text-center text-sm text-gray-400">No quiz history found</div>
            )}

            {playerHistory.map((q, i) => (
              <div key={i}
                className="flex items-start gap-3 border-b border-gray-50 px-5 py-3 last:border-0 hover:bg-gray-50 transition-colors cursor-pointer group"
                onClick={() => router.push(`/reports/${q.id.replace(".json", "")}`)}
              >
                <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gray-100 text-[11px] font-bold text-gray-500 group-hover:bg-primary/10 group-hover:text-primary transition-colors">
                  {i + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-medium text-gray-800 truncate leading-tight">{q.subject}</p>
                  <div className="mt-0.5 flex items-center gap-1.5 flex-wrap">
                    <span className="text-[10px] text-gray-400">
                      {q.date?.split(",")[0]?.trim() || "—"}
                    </span>
                    {q.nickname && q.nickname !== selectedPlayer.name && (
                      <span className="text-[10px] text-gray-400">· as "{q.nickname}"</span>
                    )}
                  </div>
                  <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
                    <RankBadge rank={q.rank} total={q.totalPlayers} />
                    <AccBadge v={q.accuracy} />
                    <span className="text-[11px] font-semibold text-gray-600">
                      {q.points.toLocaleString()} pts
                    </span>
                    <span className="text-[10px] text-gray-400">
                      {q.correct}/{q.total} correct
                    </span>
                  </div>
                </div>
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                  className="mt-1 shrink-0 text-gray-300 group-hover:text-primary transition-colors">
                  <path d="m9 18 6-6-6-6"/>
                </svg>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default ManagerPlayers
