"use client"

import clsx from "clsx"
import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { useSocket } from "@rahoot/web/contexts/socketProvider"

type Props = { quizzList: any[]; initialRegion?: "all" | "BR" | "MY" }
type RFilter = "all" | "BR" | "MY"
type PFilter = "all" | "month" | "week"

const GROUP_COLORS: Record<string, { bg: string; text: string; bar: string; border: string }> = {
  ATP:    { bg: "bg-purple-50",  text: "text-purple-700", bar: "bg-purple-500",  border: "#7c3aed" },
  ATD:    { bg: "bg-orange-50",  text: "text-orange-700", bar: "bg-orange-500",  border: "#ea580c" },
  Others: { bg: "bg-gray-50",    text: "text-gray-600",   bar: "bg-gray-400",    border: "#6b7280" },
}

function safeGroup(quiz: any): string {
  const g = (quiz?.group || "").trim()
  if (g === "ATP" || g === "ATD") return g
  return "Others"
}

function safeRegion(quiz: any): "BR" | "MY" {
  try {
    const r = (quiz?.region || "").toLowerCase()
    if (r.includes("my") || r.includes("malaysia")) return "MY"
    if (r.includes("br") || r.includes("brazil")) return "BR"
    const s = (quiz?.subject || "").toLowerCase()
    const c = (quiz?.createdBy || "").toLowerCase()
    if (["rule refresh", "my ", "malaysia"].some(k => s.includes(k)) ||
        ["grace", "elvina", "kt"].some(k => c.includes(k)) || s.includes("usa")) return "MY"
  } catch {}
  return "BR"
}

function safeCategory(quiz: any): string {
  try {
    if (quiz?.category) return quiz.category
    const s = (quiz?.subject || "").toLowerCase()
    if (s.includes("rule refresh")) return "Rule Refresh"
    if (s.includes("quality check") || s.includes("qc ") || s.includes("qc-")) return "Quality Check"
    if (s.includes("tooth") || s.includes("anatomy")) return "Tooth Anatomy"
    if (s.includes("ortodon")) return "Orthodontics"
    if (s.includes("weekly") || s.includes("review")) return "Weekly Review"
    if (s.includes("reinforce")) return "Reinforcement"
  } catch {}
  return "General"
}

function safeParseDate(d: string): Date | null {
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

const Tag = ({ region }: { region: string }) => (
  <span className={clsx("inline-flex rounded px-2 py-0.5 text-[11px] font-semibold",
    region === "BR" ? "bg-green-100 text-green-800" : "bg-blue-100 text-blue-800")}>{region}</span>
)

const GroupTag = ({ group }: { group: string }) => {
  const c = GROUP_COLORS[group] || GROUP_COLORS.Others
  return (
    <span className={clsx("inline-flex rounded px-2 py-0.5 text-[10px] font-semibold", c.bg, c.text)}>{group}</span>
  )
}

const AccBadge = ({ v }: { v: number }) => (
  <span className={clsx("inline-flex rounded px-2 py-0.5 text-[11px] font-semibold",
    v >= 70 ? "bg-green-100 text-green-800" : v >= 50 ? "bg-blue-100 text-blue-800" :
    v >= 35 ? "bg-amber-100 text-amber-800" : "bg-red-100 text-red-800")}>{v}%</span>
)

const Metric = ({ value, label, sub }: { value: string | number; label: string; sub: string }) => (
  <div className="rounded-xl bg-white p-3">
    <div className="text-2xl font-semibold text-gray-800">{value}</div>
    <div className="mt-0.5 text-[11px] text-gray-400">{label}</div>
    <div className="mt-0.5 text-[11px] text-gray-400">{sub}</div>
  </div>
)

export default function ManagerAnalytics({ quizzList, initialRegion = "all" }: Props) {
  const router = useRouter()
  const { socket } = useSocket()
  const [expandedSession, setExpandedSession] = useState<string | null>(null)
  const [localCancelled, setLocalCancelled] = useState<Record<string, number[]>>({})
  const [nameCorrections, setNameCorrections] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!socket) return
    ;(socket as any).emit("manager:getPlayerNames", (data: Record<string, string>) => {
      setNameCorrections(data || {})
    })
  }, [socket])

  const applyName = (key: string, fallback: string) =>
    nameCorrections[key] || fallback

  useEffect(() => {
    setLocalCancelled(prev => {
      const next = { ...prev }
      ;(quizzList || []).forEach((q: any) => {
        next[q.id || ""] = Array.isArray(q.cancelledQuestions) ? q.cancelledQuestions : []
      })
      return next
    })
  }, [quizzList])

  const toggleCancelQuestion = (quizId: string, questionIndex: number) => {
    if (!socket) return
    setLocalCancelled(prev => {
      const curr = prev[quizId] || []
      const isCancelled = curr.includes(questionIndex)
      return { ...prev, [quizId]: isCancelled ? curr.filter(i => i !== questionIndex) : [...curr, questionIndex] }
    })
    ;(socket as any).emit("manager:toggleCancelledQuestion", { quizId, questionIndex })
  }

  const [rFilter, setRFilter] = useState<RFilter>(initialRegion as RFilter)
  const [pFilter, setPFilter] = useState<PFilter>("all")
  const [aFilter, setAFilter] = useState("all")

  useEffect(() => { setRFilter(initialRegion as RFilter) }, [initialRegion])

  const data = useMemo(() => {
    try {
      return (quizzList || []).map(q => {
        const stats = Array.isArray(q?.lastSessionStats) ? q.lastSessionStats : []
        return {
          id: q?.id || "",
          subject: q?.subject || "Untitled",
          createdBy: q?.createdBy || "System",
          createdAt: q?.createdAt || "",
          lastPlayedAt: q?.lastPlayedAt || "",
          questions: Array.isArray(q?.questions) ? q.questions : [],
          region: safeRegion(q),
          category: safeCategory(q),
          group: safeGroup(q),
          date: safeParseDate(q?.createdAt),
          playedDate: safeParseDate(q?.lastPlayedAt),
          stats,
          playerCount: stats.length,
        }
      })
    } catch { return [] }
  }, [quizzList])

  const filtered = useMemo(() => {
    try {
      let list = data
      if (rFilter !== "all") list = list.filter(q => q.region === rFilter)
      if (aFilter !== "all") list = list.filter(q => q.createdBy === aFilter)
      if (pFilter === "month") {
        const now = new Date()
        list = list.filter(q => q.date && q.date.getMonth() === now.getMonth() && q.date.getFullYear() === now.getFullYear())
      } else if (pFilter === "week") {
        const wa = new Date(); wa.setDate(wa.getDate() - 7)
        list = list.filter(q => q.date && q.date >= wa)
      }
      return list
    } catch { return data }
  }, [data, rFilter, pFilter, aFilter])

  const metrics = useMemo(() => {
    try {
      let tp = 0, tc = 0, ta = 0, tt = 0
      const up = new Set<string>(), cr = new Set<string>()
      const played = filtered.filter(q => q.playerCount > 0)
      filtered.forEach(q => {
        cr.add(q.createdBy)
        tt += q.questions.reduce((a: number, x: any) => a + (x?.time || 15) + (x?.cooldown || 5), 0)
        q.stats.forEach((p: any) => {
          tp++; up.add(p?.username || p?.name || "")
          ;(p?.answers || []).forEach((a: any) => { ta++; if (a?.isCorrect) tc++ })
        })
      })
      return {
        total: filtered.length, questions: filtered.reduce((a, q) => a + q.questions.length, 0),
        sessions: played.length, players: tp, unique: up.size, creators: cr.size,
        acc: ta > 0 ? Math.round(tc / ta * 100) : 0,
        avgP: played.length > 0 ? Math.round(tp / played.length * 10) / 10 : 0,
        avgD: played.length > 0 ? Math.round(tt / played.length / 60 * 10) / 10 : 0,
      }
    } catch { return { total: 0, questions: 0, sessions: 0, players: 0, unique: 0, creators: 0, acc: 0, avgP: 0, avgD: 0 } }
  }, [filtered])

  const regionStats = useMemo(() => {
    try {
      const s = { BR: { q: 0, p: 0, c: 0, t: 0, time: 0 }, MY: { q: 0, p: 0, c: 0, t: 0, time: 0 } }
      data.forEach(q => {
        const r = q.region === "MY" ? "MY" : "BR"
        s[r].q++
        s[r].time += q.questions.reduce((a: number, x: any) => a + (x?.time || 15) + (x?.cooldown || 5), 0)
        q.stats.forEach((p: any) => {
          s[r].p++
          ;(p?.answers || []).forEach((a: any) => { s[r].t++; if (a?.isCorrect) s[r].c++ })
        })
      })
      return s
    } catch { return { BR: { q: 0, p: 0, c: 0, t: 0, time: 0 }, MY: { q: 0, p: 0, c: 0, t: 0, time: 0 } } }
  }, [data])

  // Group stats
  const groupStats = useMemo(() => {
    try {
      const gs: Record<string, { q: number; p: number; c: number; t: number }> = {
        ATP: { q: 0, p: 0, c: 0, t: 0 },
        ATD: { q: 0, p: 0, c: 0, t: 0 },
        Others: { q: 0, p: 0, c: 0, t: 0 },
      }
      filtered.forEach(q => {
        const g = q.group
        if (!gs[g]) gs[g] = { q: 0, p: 0, c: 0, t: 0 }
        gs[g].q++
        q.stats.forEach((p: any) => {
          gs[g].p++
          ;(p?.answers || []).forEach((a: any) => { gs[g].t++; if (a?.isCorrect) gs[g].c++ })
        })
      })
      return gs
    } catch { return { ATP: { q: 0, p: 0, c: 0, t: 0 }, ATD: { q: 0, p: 0, c: 0, t: 0 }, Others: { q: 0, p: 0, c: 0, t: 0 } } }
  }, [filtered])

  const monthly = useMemo(() => {
    try {
      const m: Record<string, { q: number; p: number; c: number; t: number }> = {}
      filtered.forEach(q => {
        const d = q.playedDate || q.date
        if (!d || q.playerCount === 0) return
        const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
        if (!m[k]) m[k] = { q: 0, p: 0, c: 0, t: 0 }
        m[k].q++; m[k].p += q.playerCount
        q.stats.forEach((p: any) => (p?.answers || []).forEach((a: any) => { m[k].t++; if (a?.isCorrect) m[k].c++ }))
      })
      const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
      return Object.entries(m).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => {
        const [yr, mo] = k.split("-")
        return {
          key: k, label: `${monthNames[Number(mo) - 1]} ${yr.slice(2)}`,
          players: v.p, quizzes: v.q, acc: v.t > 0 ? Math.round(v.c / v.t * 100) : 0,
        }
      })
    } catch { return [] }
  }, [filtered])

  const [minGames, setMinGames] = useState(1)
  const [topPlayersRegion, setTopPlayersRegion] = useState<"all" | "BR" | "MY">("all")
  const [topMetric, setTopMetric] = useState<"avgPts" | "avgCorrect">("avgPts")

  const topPlayers = useMemo(() => {
    try {
      const source = topPlayersRegion === "all" ? filtered : filtered.filter(q => q.region === topPlayersRegion)
      const p: Record<string, { name: string; q: number; pts: number; c: number; t: number }> = {}
      source.forEach(q => q.stats.forEach((s: any) => {
        const key = s?.clientId || s?.realName || s?.username || s?.name || ""; if (!key) return
        const displayName = applyName(key, s?.realName || s?.username || s?.name || key)
        if (!p[key]) p[key] = { name: displayName, q: 0, pts: 0, c: 0, t: 0 }
        p[key].name = applyName(key, s?.realName || s?.username || s?.name || key)
        p[key].q++; p[key].pts += s?.points || 0
        ;(s?.answers || []).forEach((a: any) => { p[key].t++; if (a?.isCorrect) p[key].c++ })
      }))
      return Object.entries(p).filter(([, v]) => v.q >= minGames)
        .map(([, v]) => ({
          name: v.name, games: v.q, totalPts: v.pts,
          avgPts: v.q > 0 ? Math.round(v.pts / v.q) : 0,
          avgCorrect: v.q > 0 ? Math.round(v.c / v.q * 10) / 10 : 0,
          acc: v.t > 0 ? Math.round(v.c / v.t * 100) : 0,
        }))
        .sort((a, b) => topMetric === "avgPts"
          ? b.avgPts - a.avgPts || b.acc - a.acc
          : b.avgCorrect - a.avgCorrect || b.acc - a.acc)
        .slice(0, 8)
    } catch { return [] }
  }, [filtered, topPlayersRegion, nameCorrections, applyName, minGames, topMetric])

  const topCreators = useMemo(() => {
    try {
      const c: Record<string, { q: number; r: string }> = {}
      filtered.forEach(q => { const n = q.createdBy; if (!c[n]) c[n] = { q: 0, r: q.region }; c[n].q++ })
      return Object.entries(c).map(([n, v]) => ({ name: n, quizzes: v.q, region: v.r })).sort((a, b) => b.quizzes - a.quizzes).slice(0, 5)
    } catch { return [] }
  }, [filtered])

  const categories = useMemo(() => {
    try {
      const c: Record<string, { total: number; played: number }> = {}
      filtered.forEach(q => {
        if (!c[q.category]) c[q.category] = { total: 0, played: 0 }
        c[q.category].total++
        if (q.playerCount > 0) c[q.category].played++
      })
      return Object.entries(c).map(([n, v]) => ({ name: n, count: v.total, played: v.played })).sort((a, b) => b.count - a.count)
    } catch { return [] }
  }, [filtered])

  const hardest = useMemo(() => {
    try {
      return filtered.filter(q => q.playerCount > 2).map(q => {
        let c = 0, t = 0
        q.stats.forEach((p: any) => (p?.answers || []).forEach((a: any) => { t++; if (a?.isCorrect) c++ }))
        return { subject: q.subject, region: q.region, players: q.playerCount, acc: t > 0 ? Math.round(c / t * 100) : 0 }
      }).sort((a, b) => a.acc - b.acc).slice(0, 4)
    } catch { return [] }
  }, [filtered])

  const recent = useMemo(() => {
    try {
      return filtered.filter(q => q.playerCount > 0)
        .sort((a, b) => (b.playedDate?.getTime() || 0) - (a.playedDate?.getTime() || 0))
        .slice(0, 5).map(q => {
          let c = 0, t = 0
          q.stats.forEach((p: any) => (p?.answers || []).forEach((a: any) => { t++; if (a?.isCorrect) c++ }))
          const dur = q.questions.reduce((a: number, x: any) => a + (x?.time || 15) + (x?.cooldown || 5), 0)
          return { ...q, acc: t > 0 ? Math.round(c / t * 100) : 0, dur: Math.round(dur / 60 * 10) / 10 }
        })
    } catch { return [] }
  }, [filtered])

  const authors = useMemo(() => {
    try { return [...new Set(data.map(q => q.createdBy))].sort() } catch { return [] }
  }, [data])

  const allCategories = useMemo(() => {
    try { return [...new Set(data.map(q => q.category))].sort() } catch { return [] }
  }, [data])

  const [rankingCats, setRankingCats] = useState<string[]>([])
  const [rankingGroups, setRankingGroups] = useState<string[]>([])
  // weekly tab: "region" | "group"
  const [weeklyTab, setWeeklyTab] = useState<"region" | "group">("region")
  const [lbPeriod, setLbPeriod] = useState<"week" | "month">("week")

  const lbStartDate = useMemo(() => {
    const now = new Date()
    if (lbPeriod === "week") {
      const d = new Date(now)
      const day = d.getDay()
      d.setDate(d.getDate() - (day === 0 ? 6 : day - 1))
      d.setHours(0, 0, 0, 0)
      return d
    }
    return new Date(now.getFullYear(), now.getMonth(), 1)
  }, [lbPeriod])

  const lbPeriodLabel = useMemo(() => {
    const now = new Date()
    const mo = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]
    if (lbPeriod === "week") {
      const s = new Date(now)
      const day = s.getDay()
      s.setDate(s.getDate() - (day === 0 ? 6 : day - 1))
      return mo[s.getMonth()] + " " + s.getDate() + " - " + mo[now.getMonth()] + " " + now.getDate()
    }
    return mo[now.getMonth()] + " 1 - " + now.getDate()
  }, [lbPeriod])

  const toggleRankingCat = (cat: string) => {
    setRankingCats(prev => prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat])
  }
  const toggleRankingGroup = (g: string) => {
    setRankingGroups(prev => prev.includes(g) ? prev.filter(x => x !== g) : [...prev, g])
  }

  // Weekly Top 10 by region
  const weeklyTop = useMemo(() => {
    try {
      let weekQuizzes = data.filter(q => q.playedDate && q.playedDate >= lbStartDate && q.playerCount > 0)
      if (rankingCats.length > 0) weekQuizzes = weekQuizzes.filter(q => rankingCats.includes(q.category))

      const byRegion: Record<string, Record<string, { realName: string; games: number; pts: number; c: number; t: number; nicknames: Set<string> }>> = { BR: {}, MY: {} }

      weekQuizzes.forEach(q => {
        const r = q.region === "MY" ? "MY" : "BR"
        q.stats.forEach((s: any) => {
          const key = s?.clientId || s?.realName || s?.username || s?.name || ""
          if (!key) return
          const display = applyName(key, s?.realName || s?.username || s?.name || "")
          const nick = s?.username || s?.name || ""
          if (!byRegion[r][key]) byRegion[r][key] = { realName: display, games: 0, pts: 0, c: 0, t: 0, nicknames: new Set() }
          byRegion[r][key].realName = applyName(key, s?.realName || s?.username || s?.name || byRegion[r][key].realName)
          if (nick && nick !== display) byRegion[r][key].nicknames.add(nick)
          byRegion[r][key].games++
          byRegion[r][key].pts += s?.points || 0
          ;(s?.answers || []).forEach((a: any) => { byRegion[r][key].t++; if (a?.isCorrect) byRegion[r][key].c++ })
        })
      })

      const result: Record<string, any[]> = {}
      for (const region of ["BR", "MY"]) {
        result[region] = Object.entries(byRegion[region])
          .map(([, v]) => ({
            name: v.realName, nicknames: Array.from(v.nicknames).slice(0, 2),
            games: v.games, pts: v.pts,
            avgPts: v.games > 0 ? Math.round(v.pts / v.games) : 0,
            acc: v.t > 0 ? Math.round(v.c / v.t * 100) : 0,
          }))
          .filter(p => p.games >= minGames)
          .sort((a, b) => b.avgPts - a.avgPts)
          .slice(0, 10)
      }
      return result
    } catch { return { BR: [], MY: [] } }
  }, [data, rankingCats, nameCorrections, applyName, minGames, lbStartDate])

  // Weekly Top 10 by group
  const weeklyTopByGroup = useMemo(() => {
    try {
      let weekQuizzes = data.filter(q => q.playedDate && q.playedDate >= lbStartDate && q.playerCount > 0)
      if (rankingGroups.length > 0) weekQuizzes = weekQuizzes.filter(q => rankingGroups.includes(q.group))

      const byGroup: Record<string, Record<string, { realName: string; games: number; pts: number; c: number; t: number; nicknames: Set<string> }>> = {
        ATP: {}, ATD: {}, Others: {}
      }

      weekQuizzes.forEach(q => {
        const g = q.group
        if (!byGroup[g]) byGroup[g] = {}
        q.stats.forEach((s: any) => {
          const key = s?.clientId || s?.realName || s?.username || s?.name || ""
          if (!key) return
          const display = applyName(key, s?.realName || s?.username || s?.name || "")
          const nick = s?.username || s?.name || ""
          if (!byGroup[g][key]) byGroup[g][key] = { realName: display, games: 0, pts: 0, c: 0, t: 0, nicknames: new Set() }
          byGroup[g][key].realName = applyName(key, s?.realName || s?.username || s?.name || byGroup[g][key].realName)
          if (nick && nick !== display) byGroup[g][key].nicknames.add(nick)
          byGroup[g][key].games++
          byGroup[g][key].pts += s?.points || 0
          ;(s?.answers || []).forEach((a: any) => { byGroup[g][key].t++; if (a?.isCorrect) byGroup[g][key].c++ })
        })
      })

      const result: Record<string, any[]> = {}
      for (const g of ["ATP", "ATD", "Others"]) {
        result[g] = Object.entries(byGroup[g] || {})
          .map(([, v]) => ({
            name: v.realName, nicknames: Array.from(v.nicknames).slice(0, 2),
            games: v.games, pts: v.pts,
            avgPts: v.games > 0 ? Math.round(v.pts / v.games) : 0,
            acc: v.t > 0 ? Math.round(v.c / v.t * 100) : 0,
          }))
          .filter(p => p.games >= minGames)
          .sort((a, b) => b.avgPts - a.avgPts)
          .slice(0, 10)
      }
      return result
    } catch { return { ATP: [], ATD: [], Others: [] } }
  }, [data, rankingGroups, nameCorrections, applyName, minGames, lbStartDate])

  const maxMP = Math.max(...monthly.map(m => m.players), 1)
  const maxCC = Math.max(...categories.map(c => c.count), 1)
  const maxGQ = Math.max(...Object.values(groupStats).map(g => g.q), 1)
  const rc = ["bg-amber-400", "bg-gray-400", "bg-amber-700", "bg-gray-300", "bg-gray-300"]

  return (
    <div>
      {/* Filters */}
      <div className="mb-4 flex flex-wrap gap-2">
        {(["all", "BR", "MY"] as RFilter[]).map(r => (
          <button key={r} onClick={() => setRFilter(r)}
            className={clsx("rounded-full px-3 py-1 text-xs font-semibold", rFilter === r ? "bg-primary text-white" : "bg-white text-gray-500 hover:bg-gray-100")}>
            {r === "all" ? "All regions" : r === "BR" ? `Brazil (${regionStats.BR.q})` : `Malaysia (${regionStats.MY.q})`}
          </button>
        ))}
        <div className="mx-1 w-px bg-gray-200" />
        {(["all", "month", "week"] as PFilter[]).map(p => (
          <button key={p} onClick={() => setPFilter(p)}
            className={clsx("rounded-full px-3 py-1 text-xs font-semibold", pFilter === p ? "bg-primary text-white" : "bg-white text-gray-500 hover:bg-gray-100")}>
            {p === "all" ? "All time" : p === "month" ? "This month" : "This week"}
          </button>
        ))}
        <div className="mx-1 w-px bg-gray-200" />
        <select value={aFilter} onChange={e => setAFilter(e.target.value)}
          className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-gray-500 outline-none">
          <option value="all">All authors</option>
          {authors.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
      </div>

      {/* Metric cards */}
      <div className="mb-3 grid grid-cols-4 gap-2.5">
        <Metric value={metrics.total} label="Total quizzes" sub={`${metrics.questions} questions`} />
        <Metric value={metrics.players.toLocaleString()} label="Participations" sub={`${metrics.unique} unique`} />
        <Metric value={metrics.avgP} label="Avg players/session" sub={`${metrics.sessions} sessions`} />
        <Metric value={`${metrics.acc}%`} label="Overall accuracy" sub={metrics.acc >= 65 ? "Good" : "Needs work"} />
      </div>

      {/* Monthly trend + Region comparison */}
      <div className="mb-4 grid grid-cols-2 gap-3">
        <div className="rounded-xl bg-white p-4">
          <h3 className="mb-1 text-sm font-semibold text-gray-800">Monthly participation trend</h3>
          <p className="mb-3 text-[11px] text-gray-400">Players per month (updates as sessions are played)</p>
          <div className="flex items-end gap-1" style={{ height: 110 }}>
            {monthly.map(m => (
              <div key={m.key} className="flex flex-1 flex-col items-center gap-1">
                <span className="text-[10px] font-medium text-gray-500">{m.players}</span>
                <div className="w-full rounded-t bg-primary transition-all hover:bg-primary/80" style={{ height: `${Math.max(m.players / maxMP * 85, 4)}px` }} title={`${m.quizzes} quizzes, ${m.players} players, ${m.acc}% accuracy`} />
                <span className="text-[10px] text-gray-400">{m.label}</span>
              </div>
            ))}
            {monthly.length === 0 && <p className="flex-1 text-xs text-gray-400 text-center self-center">No data yet</p>}
          </div>
        </div>

        <div className="rounded-xl bg-white p-4">
          <h3 className="mb-3 text-sm font-semibold text-gray-800">Region comparison</h3>
          <div className="grid grid-cols-[1fr_30px_1fr] items-start gap-2">
            <div className="rounded-lg bg-gray-50 p-3 text-center">
              <Tag region="BR" />
              <div className="mt-2 text-xl font-semibold text-gray-800">{regionStats.BR.q}</div>
              <div className="text-[11px] text-gray-400">quizzes</div>
              <div className="mt-2 text-base font-semibold text-green-600">{regionStats.BR.t > 0 ? Math.round(regionStats.BR.c / regionStats.BR.t * 100) : 0}%</div>
              <div className="mt-1 h-1.5 rounded-full bg-gray-200 overflow-hidden"><div className="h-full rounded-full bg-green-500" style={{ width: `${regionStats.BR.t > 0 ? regionStats.BR.c / regionStats.BR.t * 100 : 0}%` }} /></div>
              <div className="mt-2 text-[11px] text-gray-400">{regionStats.BR.p} players</div>
            </div>
            <div className="flex h-full items-center justify-center text-xs text-gray-300">vs</div>
            <div className="rounded-lg bg-gray-50 p-3 text-center">
              <Tag region="MY" />
              <div className="mt-2 text-xl font-semibold text-gray-800">{regionStats.MY.q}</div>
              <div className="text-[11px] text-gray-400">quizzes</div>
              <div className="mt-2 text-base font-semibold text-blue-600">{regionStats.MY.t > 0 ? Math.round(regionStats.MY.c / regionStats.MY.t * 100) : 0}%</div>
              <div className="mt-1 h-1.5 rounded-full bg-gray-200 overflow-hidden"><div className="h-full rounded-full bg-blue-500" style={{ width: `${regionStats.MY.t > 0 ? regionStats.MY.c / regionStats.MY.t * 100 : 0}%` }} /></div>
              <div className="mt-2 text-[11px] text-gray-400">{regionStats.MY.p} players</div>
            </div>
          </div>
        </div>
      </div>

      {/* Accuracy by month + Top Creators + Categories + Groups */}
      <div className="mb-4 grid grid-cols-4 gap-3">
        <div className="rounded-xl bg-white p-4">
          <h3 className="mb-3 text-sm font-semibold text-gray-800">Accuracy by month</h3>
          {monthly.map(m => (
            <div key={m.key} className="mb-1.5 flex items-center gap-2">
              <span className="w-8 text-right text-[11px] text-gray-400">{m.label}</span>
              <div className="flex-1 h-5 rounded bg-gray-100 overflow-hidden">
                <div className={clsx("h-full rounded flex items-center pl-1.5 text-[10px] font-medium text-white",
                  m.acc >= 65 ? "bg-green-500" : m.acc >= 50 ? "bg-primary" : "bg-amber-500")} style={{ width: `${m.acc}%` }}>{m.acc}%</div>
              </div>
            </div>
          ))}
          {monthly.length === 0 && <p className="text-xs text-gray-400 text-center py-4">No data</p>}
        </div>

        <div className="rounded-xl bg-white p-4">
          <h3 className="mb-3 text-sm font-semibold text-gray-800">Top creators</h3>
          {topCreators.map((c, i) => (
            <div key={c.name} className="mb-2 flex items-center gap-2">
              <div className={clsx("flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-medium text-white", rc[i] || "bg-gray-300")}>{i + 1}</div>
              <span className="flex-1 text-[13px] font-medium text-gray-700">{c.name}</span>
              <span className="text-[11px] text-gray-400">{c.quizzes}</span>
              <Tag region={c.region} />
            </div>
          ))}
          {topCreators.length === 0 && <p className="text-xs text-gray-400 text-center py-4">No data</p>}
        </div>

        <div className="rounded-xl bg-white p-4">
          <h3 className="mb-3 text-sm font-semibold text-gray-800">Categories</h3>
          {categories.slice(0, 6).map(c => (
            <div key={c.name} className="mb-1.5 flex items-center gap-2">
              <span className="w-20 truncate text-[11px] text-gray-500">{c.name}</span>
              <div className="flex-1 h-4 rounded bg-gray-100 overflow-hidden"><div className="h-full rounded bg-primary" style={{ width: `${c.count / maxCC * 100}%` }} /></div>
              <span className="w-12 text-right text-[11px] text-gray-400">{c.played}/{c.count}</span>
            </div>
          ))}
          {categories.length === 0 && <p className="text-xs text-gray-400 text-center py-4">No data</p>}
        </div>

        {/* ── GROUPS panel ── */}
        <div className="rounded-xl bg-white p-4">
          <h3 className="mb-3 text-sm font-semibold text-gray-800">Groups</h3>
          {(["ATP", "ATD", "Others"] as const).map(g => {
            const gs = groupStats[g] || { q: 0, p: 0, c: 0, t: 0 }
            const acc = gs.t > 0 ? Math.round(gs.c / gs.t * 100) : 0
            const col = GROUP_COLORS[g]
            return (
              <div key={g} className="mb-3">
                <div className="mb-1 flex items-center justify-between">
                  <GroupTag group={g} />
                  <span className="text-[11px] text-gray-400">{gs.q} quizzes · {gs.p} players</span>
                </div>
                <div className="h-4 rounded-full bg-gray-100 overflow-hidden">
                  <div className={clsx("h-full rounded-full transition-all", col.bar)}
                    style={{ width: `${maxGQ > 0 ? (gs.q / maxGQ) * 100 : 0}%` }} />
                </div>
                {gs.t > 0 && (
                  <div className="mt-0.5 text-right text-[10px] text-gray-400">{acc}% accuracy</div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Top players + Hardest quizzes */}
      <div className="mb-4 grid grid-cols-2 gap-3">
        <div className="rounded-xl bg-white p-4">
          <div className="mb-1 flex items-center justify-between flex-wrap gap-1">
            <h3 className="text-sm font-semibold text-gray-800">Top players</h3>
            <div className="flex items-center gap-1 flex-wrap">
              <div className="flex rounded-lg overflow-hidden border border-gray-200">
                <button onClick={() => setTopMetric("avgPts")}
                  className={clsx("px-2.5 py-0.5 text-[10px] font-semibold transition-colors",
                    topMetric === "avgPts" ? "bg-primary text-white" : "bg-white text-gray-500 hover:bg-gray-50")}>
                  Avg pts
                </button>
                <button onClick={() => setTopMetric("avgCorrect")}
                  className={clsx("px-2.5 py-0.5 text-[10px] font-semibold transition-colors border-l border-gray-200",
                    topMetric === "avgCorrect" ? "bg-primary text-white" : "bg-white text-gray-500 hover:bg-gray-50")}>
                  Avg correct
                </button>
              </div>
              {(["all", "BR", "MY"] as const).map(r => (
                <button key={r} onClick={() => setTopPlayersRegion(r)}
                  className={clsx("rounded-full px-2 py-0.5 text-[10px] font-semibold transition-colors",
                    topPlayersRegion === r ? "bg-primary text-white" : "bg-gray-100 text-gray-400 hover:bg-gray-200")}>
                  {r === "all" ? "All" : r}
                </button>
              ))}
            </div>
          </div>
          <p className="mb-3 text-[10px] text-gray-400">
            {topMetric === "avgPts" ? "By avg points" : "By avg correct answers"} · Min {minGames} {minGames === 1 ? "game" : "games"}
          </p>
          <div className="flex items-center gap-2 text-[10px] text-gray-400 border-b border-gray-100 pb-1.5 mb-1">
            <div className="w-5"></div>
            <div className="flex-1">Player</div>
            <div className="w-10 text-center">Games</div>
            <div className="w-14 text-center">{topMetric === "avgPts" ? "Avg pts" : "Avg cor"}</div>
            <div className="w-12 text-center">Acc</div>
          </div>
          {topPlayers.map((p, i) => (
            <div key={p.name + "-" + i} className={clsx("flex items-center gap-2 py-1.5 border-b border-gray-50 last:border-0", i < 3 && "bg-amber-50/30")}>
              <div className={clsx("flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-medium text-white shrink-0", rc[i] || "bg-gray-300")}>{i + 1}</div>
              <span className="flex-1 text-[13px] font-medium text-gray-700 truncate">{p.name}</span>
              <span className="w-10 text-center text-[11px] text-gray-500">{p.games}</span>
              <span className="w-14 text-center text-[12px] font-semibold text-gray-700">{topMetric === "avgPts" ? p.avgPts : p.avgCorrect}</span>
              <div className="w-12 text-center"><AccBadge v={p.acc} /></div>
            </div>
          ))}
          {topPlayers.length === 0 && <p className="text-xs text-gray-400 text-center py-4">No players with 2+ games yet</p>}
        </div>

        <div className="rounded-xl bg-white p-4">
          <h3 className="mb-3 text-sm font-semibold text-gray-800">Hardest quizzes</h3>
          {hardest.map((q, i) => (
            <div key={i} className="mb-2 flex items-center gap-2">
              <div className="flex-1 min-w-0"><div className="truncate text-[13px] font-medium text-gray-700">{q.subject}</div><div className="text-[11px] text-gray-400">{q.players}p</div></div>
              <Tag region={q.region} /><AccBadge v={q.acc} />
            </div>
          ))}
          {hardest.length === 0 && <p className="text-xs text-gray-400 text-center py-4">No data yet</p>}
        </div>
      </div>

      {/* Weekly Ranking — tabbed: By Region / By Group */}
      <div className="mb-4">
        <div className="mb-3 flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-gray-800">Leaderboard — Top 10</h3>
            <span className="text-[11px] text-gray-400">{lbPeriodLabel}</span>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex rounded-lg overflow-hidden border border-gray-200">
              <button onClick={() => setLbPeriod("week")}
                className={clsx("px-3 py-1 text-xs font-semibold transition-colors",
                  lbPeriod === "week" ? "bg-primary text-white" : "bg-white text-gray-500 hover:bg-gray-50")}>
                Weekly
              </button>
              <button onClick={() => setLbPeriod("month")}
                className={clsx("px-3 py-1 text-xs font-semibold transition-colors border-l border-gray-200",
                  lbPeriod === "month" ? "bg-primary text-white" : "bg-white text-gray-500 hover:bg-gray-50")}>
                Monthly
              </button>
            </div>
            <div className="flex rounded-lg overflow-hidden border border-gray-200">
              <button onClick={() => setWeeklyTab("region")}
                className={clsx("px-3 py-1 text-xs font-semibold transition-colors",
                  weeklyTab === "region" ? "bg-primary text-white" : "bg-white text-gray-500 hover:bg-gray-50")}>
                By Region
              </button>
              <button onClick={() => setWeeklyTab("group")}
                className={clsx("px-3 py-1 text-xs font-semibold transition-colors border-l border-gray-200",
                  weeklyTab === "group" ? "bg-primary text-white" : "bg-white text-gray-500 hover:bg-gray-50")}>
                By Group
              </button>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-[10px] text-gray-400 mr-1">Min games:</span>
              {[1, 2, 3, 5].map(n => (
                <button key={n} onClick={() => setMinGames(n)}
                  className={clsx("rounded-full px-2.5 py-0.5 text-[10px] font-semibold transition-colors",
                    minGames === n ? "bg-primary text-white" : "bg-white text-gray-400 hover:bg-gray-100")}>
                  {n}+
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* BY REGION */}
        {weeklyTab === "region" && (
          <>
            <div className="mb-3 flex flex-wrap gap-1.5">
              <button onClick={() => setRankingCats([])}
                className={clsx("rounded-full px-3 py-1 text-[11px] font-semibold transition-colors",
                  rankingCats.length === 0 ? "bg-primary text-white" : "bg-white text-gray-500 hover:bg-gray-100")}>
                All categories
              </button>
              {allCategories.map(cat => (
                <button key={cat} onClick={() => toggleRankingCat(cat)}
                  className={clsx("rounded-full px-3 py-1 text-[11px] font-semibold transition-colors",
                    rankingCats.includes(cat) ? "bg-primary text-white" : "bg-white text-gray-500 hover:bg-gray-100")}>
                  {cat}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-3">
              {(["BR", "MY"] as const).map(region => (
                <div key={region} className="rounded-xl bg-white overflow-hidden" style={{ borderTop: `3px solid ${region === "BR" ? "#26890c" : "#1368ce"}` }}>
                  <div className="p-4 pb-2 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-semibold text-gray-800">Weekly Top 10</h3>
                      <Tag region={region} />
                    </div>
                    <span className="text-[11px] text-gray-400">Avg points</span>
                  </div>
                  {(weeklyTop[region] || []).length === 0 ? (
                    <div className="p-4 pt-2 text-xs text-gray-400 text-center">No games in this period</div>
                  ) : (
                    <div className="px-4 pb-3">
                      <div className="flex items-center gap-2 text-[10px] text-gray-400 border-b border-gray-100 pb-1.5 mb-1">
                        <div className="w-6 text-center">#</div>
                        <div className="flex-1">Player</div>
                        <div className="w-12 text-center">Games</div>
                        <div className="w-14 text-center">Avg pts</div>
                        <div className="w-14 text-center">Accuracy</div>
                      </div>
                      {(weeklyTop[region] || []).map((p: any, i: number) => (
                        <div key={i} className={clsx("flex items-center gap-2 py-1.5 border-b border-gray-50 last:border-0", i < 3 && "bg-amber-50/50")}>
                          <div className={clsx("w-6 text-center text-xs font-semibold", i === 0 ? "text-amber-500" : i === 1 ? "text-gray-400" : i === 2 ? "text-amber-700" : "text-gray-400")}>
                            {i < 3 ? ["🥇", "🥈", "🥉"][i] : i + 1}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-[13px] font-medium text-gray-700 truncate">{p.name}</div>
                            {p.nicknames.length > 0 && <div className="text-[10px] text-gray-400 truncate">aka: {p.nicknames.join(", ")}</div>}
                          </div>
                          <div className="w-12 text-center text-[12px] text-gray-500">{p.games}</div>
                          <div className="w-14 text-center text-[12px] font-semibold text-gray-700">{p.avgPts}</div>
                          <div className="w-14 text-center"><AccBadge v={p.acc} /></div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </>
        )}

        {/* BY GROUP */}
        {weeklyTab === "group" && (
          <>
            <div className="mb-3 flex flex-wrap gap-1.5">
              <button onClick={() => setRankingGroups([])}
                className={clsx("rounded-full px-3 py-1 text-[11px] font-semibold transition-colors",
                  rankingGroups.length === 0 ? "bg-primary text-white" : "bg-white text-gray-500 hover:bg-gray-100")}>
                All groups
              </button>
              {(["ATP", "ATD", "Others"] as const).map(g => (
                <button key={g} onClick={() => toggleRankingGroup(g)}
                  className={clsx("rounded-full px-3 py-1 text-[11px] font-semibold transition-colors",
                    rankingGroups.includes(g) ? "bg-primary text-white" : "bg-white text-gray-500 hover:bg-gray-100")}>
                  {g}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-3 gap-3">
              {(["ATP", "ATD", "Others"] as const).map(g => {
                const col = GROUP_COLORS[g]
                return (
                  <div key={g} className="rounded-xl bg-white overflow-hidden" style={{ borderTop: `3px solid ${col.border}` }}>
                    <div className="p-4 pb-2 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-semibold text-gray-800">Top 10</h3>
                        <GroupTag group={g} />
                      </div>
                      <span className="text-[11px] text-gray-400">Avg pts</span>
                    </div>
                    {(weeklyTopByGroup[g] || []).length === 0 ? (
                      <div className="p-4 pt-2 text-xs text-gray-400 text-center">No games in this period</div>
                    ) : (
                      <div className="px-4 pb-3">
                        <div className="flex items-center gap-2 text-[10px] text-gray-400 border-b border-gray-100 pb-1.5 mb-1">
                          <div className="w-6 text-center">#</div>
                          <div className="flex-1">Player</div>
                          <div className="w-10 text-center">Games</div>
                          <div className="w-12 text-center">Avg pts</div>
                          <div className="w-12 text-center">Acc</div>
                        </div>
                        {(weeklyTopByGroup[g] || []).map((p: any, i: number) => (
                          <div key={i} className={clsx("flex items-center gap-2 py-1.5 border-b border-gray-50 last:border-0", i < 3 && "bg-amber-50/50")}>
                            <div className={clsx("w-6 text-center text-xs font-semibold", i === 0 ? "text-amber-500" : i === 1 ? "text-gray-400" : i === 2 ? "text-amber-700" : "text-gray-400")}>
                              {i < 3 ? ["🥇", "🥈", "🥉"][i] : i + 1}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="text-[13px] font-medium text-gray-700 truncate">{p.name}</div>
                              {p.nicknames.length > 0 && <div className="text-[10px] text-gray-400 truncate">aka: {p.nicknames.join(", ")}</div>}
                            </div>
                            <div className="w-10 text-center text-[11px] text-gray-500">{p.games}</div>
                            <div className="w-12 text-center text-[12px] font-semibold text-gray-700">{p.avgPts}</div>
                            <div className="w-12 text-center"><AccBadge v={p.acc} /></div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>

      {/* Recent activity */}
      <div className="rounded-xl bg-white p-4">
        <h3 className="mb-3 text-sm font-semibold text-gray-800">Recent activity</h3>
        <div className="flex flex-col gap-2">
          {recent.map((s, i) => {
            const cancelled = localCancelled[s.id] || []
            const isExpanded = expandedSession === s.id
            return (
              <div key={i} className="rounded-lg overflow-hidden border border-transparent hover:border-gray-200 transition-all bg-gray-50">
                <div className="flex items-center gap-3 px-3 py-2.5">
                  <div className="flex flex-1 min-w-0 items-center gap-3 cursor-pointer"
                    onClick={() => router.push(`/reports/${(s.id || "").replace(".json", "")}`)}>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <div className="text-[13px] font-medium text-gray-700 truncate">{s.subject}</div>
                        <GroupTag group={s.group} />
                        {cancelled.length > 0 && (
                          <span className="shrink-0 rounded bg-red-100 px-1.5 py-0.5 text-[9px] font-bold text-red-600">
                            {cancelled.length} cancelled
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-gray-400">
                        {s.lastPlayedAt?.split(",")[0]?.trim() || "--"} &middot; {s.createdBy} &middot; {s.playerCount} players
                      </div>
                    </div>
                    <Tag region={s.region} />
                    <AccBadge v={s.acc} />
                    <span className="text-gray-300 text-xs">&rsaquo;</span>
                  </div>
                  <button
                    onClick={() => setExpandedSession(isExpanded ? null : s.id)}
                    className={clsx(
                      "shrink-0 rounded px-2.5 py-1 text-[11px] font-semibold transition-colors",
                      cancelled.length > 0 ? "bg-red-100 text-red-700 hover:bg-red-200"
                        : isExpanded ? "bg-primary/10 text-primary"
                        : "bg-gray-200 text-gray-500 hover:bg-gray-300"
                    )}
                  >
                    {isExpanded ? "▲ Close" : `Questions${cancelled.length > 0 ? ` (${cancelled.length})` : ""}`}
                  </button>
                </div>
                {isExpanded && (
                  <div className="border-t border-gray-100 bg-white px-3 py-2">
                    <p className="mb-2 text-[11px] text-gray-400">
                      Flag questions as cancelled — data is kept but marked as invalid for scoring.
                    </p>
                    {(s.questions || []).map((q: any, qi: number) => {
                      const isCancelled = cancelled.includes(qi)
                      return (
                        <div key={qi} className={clsx(
                          "flex items-center justify-between rounded px-2 py-1.5 mb-1 last:mb-0",
                          isCancelled ? "bg-red-50" : "hover:bg-gray-50"
                        )}>
                          <span className={clsx("flex-1 text-[13px]", isCancelled ? "line-through text-gray-400" : "text-gray-700")}>
                            <span className="mr-2 font-semibold text-gray-400">{qi + 1}.</span>
                            {q.question}
                            {isCancelled && (
                              <span className="ml-2 rounded bg-red-200 px-1.5 py-0.5 text-[10px] font-bold text-red-700 no-underline">CANCELLED</span>
                            )}
                          </span>
                          <button
                            onClick={() => toggleCancelQuestion(s.id, qi)}
                            className={clsx(
                              "ml-3 shrink-0 rounded px-2.5 py-1 text-[11px] font-semibold transition-colors",
                              isCancelled ? "bg-green-600 hover:bg-green-500 text-white" : "bg-red-600 hover:bg-red-500 text-white"
                            )}
                          >
                            {isCancelled ? "Restore" : "Cancel"}
                          </button>
                        </div>
                      )
                    })}
                    {(!s.questions || s.questions.length === 0) && (
                      <p className="text-xs text-gray-400 py-2 text-center">No questions data available</p>
                    )}
                  </div>
                )}
              </div>
            )
          })}
          {recent.length === 0 && <p className="text-xs text-gray-400 text-center py-4">No sessions played yet</p>}
        </div>
      </div>
    </div>
  )
}
