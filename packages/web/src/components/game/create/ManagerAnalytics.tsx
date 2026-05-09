"use client"

import clsx from "clsx"
import { useCallback, useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { useSocket } from "@rahoot/web/contexts/socketProvider"
import SelectQuizz from "@rahoot/web/components/game/create/SelectQuizz"
import ManagerPlayers from "@rahoot/web/components/game/create/ManagerPlayers"
import Image from "next/image"
import logo from "@rahoot/web/assets/logo.svg"

type Props = { quizzList: any[]; initialRegion?: "all" | "BR" | "MY" | "CN"; onSelect?: (_id: string) => void; onListChange?: (newList: any[]) => void }
type RFilter = "all" | "BR" | "MY" | "CN"
type PFilter = "all" | "month" | "week"
type NavView = "overview" | "players" | "leaderboard" | "participation" | "activity" | "quizzes" | "team"

const EXCLUDED_PLAYERS = ["test user"]
const isExcluded = (name: string) => {
  const lower = name.toLowerCase().trim()
  return EXCLUDED_PLAYERS.some(ex => lower === ex || lower.includes(ex))
}

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

function safeRegion(quiz: any): "BR" | "MY" | "CN" {
  try {
    const r = (quiz?.region || "").toLowerCase()
    if (r.includes("my") || r.includes("malaysia")) return "MY"
    if (r.includes("cn") || r.includes("china")) return "CN"
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

// ── UI helpers ────────────────────────────────────────────────────────────────

const Tag = ({ region }: { region: string }) => (
  <span className={clsx("inline-flex rounded-md px-2 py-0.5 text-xs font-semibold",
    region === "BR" ? "bg-green-100 text-green-800" : region === "CN" ? "bg-red-100 text-red-800" : "bg-blue-100 text-blue-800")}>{region}</span>
)

const GroupTag = ({ group }: { group: string }) => {
  const c = GROUP_COLORS[group] || GROUP_COLORS.Others
  return (
    <span className={clsx("inline-flex rounded-md px-2.5 py-0.5 text-xs font-semibold", c.bg, c.text)}>{group}</span>
  )
}

const AccBadge = ({ v }: { v: number }) => (
  <span className={clsx("inline-flex rounded-md px-2 py-0.5 text-xs font-bold",
    v >= 70 ? "bg-green-100 text-green-800" : v >= 50 ? "bg-blue-100 text-blue-800" :
    v >= 35 ? "bg-amber-100 text-amber-800" : "bg-red-100 text-red-800")}>{v}%</span>
)

const AccRing = ({ v, size = 56 }: { v: number; size?: number }) => {
  const sw = size <= 36 ? 3 : size <= 48 ? 4 : 5
  const r = (size - sw * 2) / 2
  const circ = 2 * Math.PI * r
  const filled = (v / 100) * circ
  const color = v >= 65 ? "#22c55e" : v >= 50 ? "#009edf" : v >= 35 ? "#f59e0b" : "#ef4444"
  const fontSize = size <= 36 ? "8px" : size <= 44 ? "9px" : size <= 54 ? "10px" : "11px"
  return (
    <div className="relative shrink-0 flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)", position: "absolute" }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#f1f5f9" strokeWidth={sw} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={sw}
          strokeDasharray={`${filled} ${circ - filled}`} strokeLinecap="butt" />
      </svg>
      <span className="font-bold leading-none" style={{ color, fontSize, letterSpacing: "-0.02em" }}>{v}%</span>
    </div>
  )
}

const AccBar = ({ v }: { v: number }) => {
  const color = v >= 65 ? "#22c55e" : v >= 50 ? "#009edf" : v >= 35 ? "#f59e0b" : "#ef4444"
  return (
    <div className="flex items-center gap-2">
      <div className="w-20 h-2 rounded-full bg-gray-100 overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${v}%`, background: color }} />
      </div>
      <AccBadge v={v} />
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────

export default function ManagerAnalytics({ quizzList, initialRegion = "all", onSelect, onListChange }: Props) {
  const router = useRouter()
  const { socket } = useSocket()
  const [localList, setLocalList] = useState<any[]>(quizzList)
  useEffect(() => { setLocalList(quizzList) }, [quizzList])
  const handleListChange = useCallback((newList: any[]) => { setLocalList(newList); onListChange?.(newList) }, [onListChange])
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

  const [activeView, setActiveView] = useState<NavView>("overview")
  const [rFilter, setRFilter] = useState<RFilter>(initialRegion as RFilter)
  const [pFilter, setPFilter] = useState<PFilter>("all")
  const [aFilter, setAFilter] = useState("all")

  useEffect(() => { setRFilter(initialRegion as RFilter) }, [initialRegion])

  const data = useMemo(() => {
    try {
      return (localList || []).map(q => {
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
  }, [localList])

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
      const s = { BR: { q: 0, p: 0, c: 0, t: 0, time: 0 }, MY: { q: 0, p: 0, c: 0, t: 0, time: 0 }, CN: { q: 0, p: 0, c: 0, t: 0, time: 0 } }
      data.forEach(q => {
        const r = q.region === "MY" ? "MY" : q.region === "CN" ? "CN" : "BR"
        s[r].q++
        s[r].time += q.questions.reduce((a: number, x: any) => a + (x?.time || 15) + (x?.cooldown || 5), 0)
        q.stats.forEach((p: any) => {
          s[r].p++
          ;(p?.answers || []).forEach((a: any) => { s[r].t++; if (a?.isCorrect) s[r].c++ })
        })
      })
      return s
    } catch { return { BR: { q: 0, p: 0, c: 0, t: 0, time: 0 }, MY: { q: 0, p: 0, c: 0, t: 0, time: 0 }, CN: { q: 0, p: 0, c: 0, t: 0, time: 0 } } }
  }, [data])

  const groupStats = useMemo(() => {
    try {
      const gs: Record<string, { q: number; p: number; c: number; t: number }> = {
        ATP: { q: 0, p: 0, c: 0, t: 0 }, ATD: { q: 0, p: 0, c: 0, t: 0 }, Others: { q: 0, p: 0, c: 0, t: 0 },
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
      // Find earliest date across all quizzes (not just played)
      const allDates = filtered.map(q => q.playedDate || q.date).filter(Boolean) as Date[]
      if (allDates.length === 0) return []
      const minDate = allDates.reduce((a, b) => a < b ? a : b)
      const now = new Date()
      const mn = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]
      const result = []
      let cur = new Date(minDate.getFullYear(), minDate.getMonth(), 1)
      const end = new Date(now.getFullYear(), now.getMonth(), 1)
      while (cur <= end) {
        const k = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, "0")}`
        const v = m[k] || { q: 0, p: 0, c: 0, t: 0 }
        result.push({ key: k, label: `${mn[cur.getMonth()]} ${String(cur.getFullYear()).slice(2)}`, players: v.p, quizzes: v.q, acc: v.t > 0 ? Math.round(v.c / v.t * 100) : 0 })
        cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1)
      }
      return result
    } catch { return [] }
  }, [filtered])

  const weeklyDays = useMemo(() => {
    if (pFilter !== "week") return []
    try {
      const DAY = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"]
      const d: Record<number, { p: number; q: number; c: number; t: number }> = {}
      filtered.forEach(q => {
        const date = q.playedDate || q.date; if (!date || q.playerCount === 0) return
        const dow = date.getDay()
        if (!d[dow]) d[dow] = { p: 0, q: 0, c: 0, t: 0 }
        d[dow].q++; d[dow].p += q.playerCount
        q.stats.forEach((s: any) => (s?.answers || []).forEach((a: any) => { d[dow].t++; if (a?.isCorrect) d[dow].c++ }))
      })
      return [1,2,3,4,5,6,0].map(i => ({ day: DAY[i], players: d[i]?.p || 0, quizzes: d[i]?.q || 0, acc: (d[i]?.t ?? 0) > 0 ? Math.round(d[i].c / d[i].t * 100) : 0 }))
    } catch { return [] }
  }, [filtered, pFilter])

  const [minGames, setMinGames] = useState(2)
  const [topPlayersRegion, setTopPlayersRegion] = useState<"all" | "BR" | "MY" | "CN">("all")
  const [topMetric, setTopMetric] = useState<"avgPts" | "avgCorrect" | "games">("avgPts")

  const topPlayers = useMemo(() => {
    try {
      const source = topPlayersRegion === "all" ? filtered : filtered.filter(q => q.region === topPlayersRegion)
      const p: Record<string, { name: string; q: number; pts: number; c: number; t: number }> = {}
      source.forEach(q => q.stats.forEach((s: any) => {
        const key = s?.clientId || s?.realName || s?.username || s?.name || ""; if (!key) return
        const _tpName = applyName(key, s?.realName || s?.username || s?.name || key); if (isExcluded(_tpName)) return
        if (!p[key]) p[key] = { name: _tpName, q: 0, pts: 0, c: 0, t: 0 }
        p[key].name = applyName(key, s?.realName || s?.username || s?.name || key)
        p[key].q++; p[key].pts += s?.points || 0
        ;(s?.answers || []).forEach((a: any) => { p[key].t++; if (a?.isCorrect) p[key].c++ })
      }))
      const nameMap: Record<string, string> = {}; const merged: typeof p = {}
      Object.entries(p).forEach(([key, val]) => {
        const norm = val.name.toLowerCase().trim()
        if (nameMap[norm]) { const ek = nameMap[norm]; merged[ek].q += val.q; merged[ek].pts += val.pts; merged[ek].c += val.c; merged[ek].t += val.t }
        else { nameMap[norm] = key; merged[key] = { ...val } }
      })
      return Object.entries(merged).filter(([, v]) => v.q >= minGames)
        .map(([, v]) => ({ name: v.name, games: v.q, totalPts: v.pts, avgPts: v.q > 0 ? Math.round(v.pts / v.q) : 0, avgCorrect: v.q > 0 ? Math.round(v.c / v.q * 10) / 10 : 0, acc: v.t > 0 ? Math.round(v.c / v.t * 100) : 0 }))
        .sort((a, b) => topMetric === "avgPts" ? b.avgPts - a.avgPts || b.acc - a.acc : topMetric === "avgCorrect" ? b.avgCorrect - a.avgCorrect || b.acc - a.acc : b.games - a.games || b.avgPts - a.avgPts)
        .slice(0, 10)
    } catch { return [] }
  }, [filtered, topPlayersRegion, nameCorrections, applyName, minGames, topMetric])

  const topCreators = useMemo(() => {
    try {
      const c: Record<string, { q: number; r: string; display: string }> = {}
      filtered.forEach(q => { const n = q.createdBy; const norm = n.toLowerCase().trim(); if (!c[norm]) c[norm] = { q: 0, r: q.region, display: n }; c[norm].q++ })
      return Object.entries(c).map(([, v]) => ({ name: v.display, quizzes: v.q, region: v.r })).sort((a, b) => b.quizzes - a.quizzes).slice(0, 5)
    } catch { return [] }
  }, [filtered])

  const categories = useMemo(() => {
    try {
      const c: Record<string, { total: number; played: number }> = {}
      filtered.forEach(q => { if (!c[q.category]) c[q.category] = { total: 0, played: 0 }; c[q.category].total++; if (q.playerCount > 0) c[q.category].played++ })
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
        .slice(0, 20).map(q => {
          let c = 0, t = 0
          q.stats.forEach((p: any) => (p?.answers || []).forEach((a: any) => { t++; if (a?.isCorrect) c++ }))
          const dur = q.questions.reduce((a: number, x: any) => a + (x?.time || 15) + (x?.cooldown || 5), 0)
          return { ...q, acc: t > 0 ? Math.round(c / t * 100) : 0, dur: Math.round(dur / 60 * 10) / 10 }
        })
    } catch { return [] }
  }, [filtered])

  const authors = useMemo(() => { try { return [...new Set(data.map(q => q.createdBy))].sort() } catch { return [] } }, [data])
  const allCategories = useMemo(() => { try { return [...new Set(data.map(q => q.category))].sort() } catch { return [] } }, [data])

  const [rankingCats, setRankingCats] = useState<string[]>([])
  const [rankingGroups, setRankingGroups] = useState<string[]>([])
  const [weeklyTab, setWeeklyTab] = useState<"region" | "group">("region")
  const [lbPeriod, setLbPeriod] = useState<"week" | "month">("week")

  const lbStartDate = useMemo(() => {
    const now = new Date()
    if (lbPeriod === "week") {
      const d = new Date(now); const day = d.getDay(); d.setDate(d.getDate() - (day === 0 ? 6 : day - 1)); d.setHours(0, 0, 0, 0); return d
    }
    return new Date(now.getFullYear(), now.getMonth(), 1)
  }, [lbPeriod])

  const lbPeriodLabel = useMemo(() => {
    const now = new Date(); const mo = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]
    if (lbPeriod === "week") {
      const s = new Date(now); const day = s.getDay(); s.setDate(s.getDate() - (day === 0 ? 6 : day - 1))
      return mo[s.getMonth()] + " " + s.getDate() + " – " + mo[now.getMonth()] + " " + now.getDate()
    }
    return mo[now.getMonth()] + " 1 – " + now.getDate()
  }, [lbPeriod])

  const toggleRankingCat = (cat: string) => setRankingCats(prev => prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat])
  const toggleRankingGroup = (g: string) => setRankingGroups(prev => prev.includes(g) ? prev.filter(x => x !== g) : [...prev, g])

  const weeklyTop = useMemo(() => {
    try {
      let wq = data.filter(q => q.playedDate && q.playedDate >= lbStartDate && q.playerCount > 0)
      if (rankingCats.length > 0) wq = wq.filter(q => rankingCats.includes(q.category))
      const byR: Record<string, Record<string, { realName: string; games: number; pts: number; c: number; t: number; nicknames: Set<string> }>> = { BR: {}, MY: {}, CN: {} }
      wq.forEach(q => {
        const r = q.region === "MY" ? "MY" : q.region === "CN" ? "CN" : "BR"
        q.stats.forEach((s: any) => {
          const key = s?.clientId || s?.realName || s?.username || s?.name || ""; if (!key) return
          const display = applyName(key, s?.realName || s?.username || s?.name || "")
          if (isExcluded(display)) return
          const nick = s?.username || s?.name || ""
          if (!byR[r][key]) byR[r][key] = { realName: display, games: 0, pts: 0, c: 0, t: 0, nicknames: new Set() }
          byR[r][key].realName = applyName(key, s?.realName || s?.username || s?.name || byR[r][key].realName)
          if (nick && nick !== display) byR[r][key].nicknames.add(nick)
          byR[r][key].games++; byR[r][key].pts += s?.points || 0
          ;(s?.answers || []).forEach((a: any) => { byR[r][key].t++; if (a?.isCorrect) byR[r][key].c++ })
        })
      })
      const result: Record<string, any[]> = {}
      for (const region of ["BR", "MY", "CN"]) {
        const nm: Record<string, string> = {}; const mg: typeof byR["BR"] = {}
        Object.entries(byR[region]).forEach(([key, val]) => {
          const norm = val.realName.toLowerCase().trim()
          if (nm[norm]) { const ek = nm[norm]; mg[ek].games += val.games; mg[ek].pts += val.pts; mg[ek].c += val.c; mg[ek].t += val.t; val.nicknames.forEach(n => mg[ek].nicknames.add(n)) }
          else { nm[norm] = key; mg[key] = { ...val, nicknames: new Set(val.nicknames) } }
        })
        result[region] = Object.entries(mg)
          .map(([, v]) => ({ name: v.realName, nicknames: Array.from(v.nicknames).slice(0, 2), games: v.games, totalPts: v.pts, avgPts: v.games > 0 ? Math.round(v.pts / v.games) : 0, acc: v.t > 0 ? Math.round(v.c / v.t * 100) : 0 }))
          .filter(p => p.games >= minGames).sort((a, b) => b.totalPts - a.totalPts || b.avgPts - a.avgPts).slice(0, 10)
      }
      return result
    } catch { return { BR: [], MY: [], CN: [] } }
  }, [data, rankingCats, nameCorrections, applyName, minGames, lbStartDate])

  const weeklyTopByGroup = useMemo(() => {
    try {
      let wq = data.filter(q => q.playedDate && q.playedDate >= lbStartDate && q.playerCount > 0)
      if (rankingGroups.length > 0) wq = wq.filter(q => rankingGroups.includes(q.group))
      const byG: Record<string, Record<string, { realName: string; games: number; pts: number; c: number; t: number; nicknames: Set<string> }>> = { ATP: {}, ATD: {}, Others: {} }
      wq.forEach(q => {
        const g = q.group; if (!byG[g]) byG[g] = {}
        q.stats.forEach((s: any) => {
          const key = s?.clientId || s?.realName || s?.username || s?.name || ""; if (!key) return
          const display = applyName(key, s?.realName || s?.username || s?.name || "")
          if (isExcluded(display)) return
          const nick = s?.username || s?.name || ""
          if (!byG[g][key]) byG[g][key] = { realName: display, games: 0, pts: 0, c: 0, t: 0, nicknames: new Set() }
          byG[g][key].realName = applyName(key, s?.realName || s?.username || s?.name || byG[g][key].realName)
          if (nick && nick !== display) byG[g][key].nicknames.add(nick)
          byG[g][key].games++; byG[g][key].pts += s?.points || 0
          ;(s?.answers || []).forEach((a: any) => { byG[g][key].t++; if (a?.isCorrect) byG[g][key].c++ })
        })
      })
      const result: Record<string, any[]> = {}
      for (const g of ["ATP", "ATD", "Others"]) {
        const nm: Record<string, string> = {}; const mg: typeof byG["ATP"] = {}
        Object.entries(byG[g] || {}).forEach(([key, val]) => {
          const norm = val.realName.toLowerCase().trim()
          if (nm[norm]) { const ek = nm[norm]; mg[ek].games += val.games; mg[ek].pts += val.pts; mg[ek].c += val.c; mg[ek].t += val.t; val.nicknames.forEach(n => mg[ek].nicknames.add(n)) }
          else { nm[norm] = key; mg[key] = { ...val, nicknames: new Set(val.nicknames) } }
        })
        result[g] = Object.entries(mg)
          .map(([, v]) => ({ name: v.realName, nicknames: Array.from(v.nicknames).slice(0, 2), games: v.games, totalPts: v.pts, avgPts: v.games > 0 ? Math.round(v.pts / v.games) : 0, acc: v.t > 0 ? Math.round(v.c / v.t * 100) : 0 }))
          .filter(p => p.games >= minGames).sort((a, b) => b.totalPts - a.totalPts || b.avgPts - a.avgPts).slice(0, 10)
      }
      return result
    } catch { return { ATP: [], ATD: [], Others: [] } }
  }, [data, rankingGroups, nameCorrections, applyName, minGames, lbStartDate])

  const maxMP = Math.max(...monthly.map(m => m.players), 1)
  const maxCC = Math.max(...categories.map(c => c.count), 1)
  const maxGQ = Math.max(...Object.values(groupStats).map(g => g.q), 1)
  const rc = ["bg-amber-400", "bg-gray-400", "bg-amber-700", "bg-gray-300", "bg-gray-300"]

  const [participationDate, setParticipationDate] = useState<string>("")
  const [participationSort, setParticipationSort] = useState<"count" | "pts" | "name">("count")
  const [participationRegion, setParticipationRegion] = useState<"all" | "BR" | "MY" | "CN">("all")
  useEffect(() => { if (activeView === "participation") setParticipationRegion(rFilter as "all" | "BR" | "MY" | "CN") }, [rFilter, activeView])

  const dayParticipation = useMemo(() => {
    if (!participationDate) return []
    const [yr, mo, dy] = participationDate.split("-").map(Number)
    const dayQuizzes = data.filter(q => {
      const d = q.playedDate || q.date
      return d && d.getFullYear() === yr && d.getMonth() === mo - 1 && d.getDate() === dy
        && (participationRegion === "all" || q.region === participationRegion)
    })
    const players: Record<string, { name: string; count: number; pts: number; c: number; t: number; quizzes: string[] }> = {}
    dayQuizzes.forEach(q => q.stats.forEach((s: any) => {
      const key = s?.clientId || s?.realName || s?.username || s?.name || ""; if (!key) return
      const display = applyName(key, s?.realName || s?.username || s?.name || key)
      if (!players[key]) players[key] = { name: display, count: 0, pts: 0, c: 0, t: 0, quizzes: [] }
      players[key].count++; players[key].pts += s?.points || 0
      ;(s?.answers || []).forEach((a: any) => { players[key].t++; if (a?.isCorrect) players[key].c++ })
      if (!players[key].quizzes.includes(q.subject)) players[key].quizzes.push(q.subject)
    }))
    const nameMap: Record<string, string> = {}; const merged: typeof players = {}
    Object.entries(players).forEach(([key, val]) => {
      const norm = val.name.toLowerCase().trim()
      if (nameMap[norm]) {
        const ek = nameMap[norm]; merged[ek].count += val.count; merged[ek].pts += val.pts; merged[ek].c += val.c; merged[ek].t += val.t
        val.quizzes.forEach(q => { if (!merged[ek].quizzes.includes(q)) merged[ek].quizzes.push(q) })
      } else { nameMap[norm] = key; merged[key] = { ...val, quizzes: [...val.quizzes] } }
    })
    const result = Object.values(merged).map(p => ({ ...p, avgPts: p.count > 0 ? Math.round(p.pts / p.count) : 0, acc: p.t > 0 ? Math.round(p.c / p.t * 100) : 0 }))
    if (participationSort === "count") result.sort((a, b) => b.count - a.count)
    else if (participationSort === "pts") result.sort((a, b) => b.pts - a.pts)
    else result.sort((a, b) => a.name.localeCompare(b.name))
    return result
  }, [data, participationDate, participationSort, participationRegion, nameCorrections, applyName])

  // ── RENDER ─────────────────────────────────────────────────────────────────

  const TH = ({ cls, children }: { cls: string; children: React.ReactNode }) => (
    <div className={clsx("shrink-0 text-xs font-semibold text-gray-400 uppercase tracking-wide select-none", cls)}>{children}</div>
  )

  const analyticsNav: { id: NavView; label: string; icon: React.ReactNode }[] = [
    { id: "overview",      label: "Overview",      icon: <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/></svg> },
    { id: "players",       label: "Top Players",   icon: <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24"><rect x="2" y="13" width="5" height="9" rx="1"/><rect x="9.5" y="8" width="5" height="14" rx="1"/><rect x="17" y="11" width="5" height="11" rx="1"/></svg> },
    { id: "leaderboard",   label: "Leaderboard",   icon: <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/></svg> },
    { id: "participation", label: "Participation", icon: <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg> },
    { id: "activity",      label: "Activity",      icon: <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg> },
  ]
  const manageNav: { id: NavView; label: string; icon: React.ReactNode }[] = [
    { id: "quizzes", label: "My Quizzes",  icon: <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/><line x1="9" y1="12" x2="15" y2="12"/><line x1="9" y1="16" x2="13" y2="16"/></svg> },
    { id: "team",    label: "All Players", icon: <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg> },
  ]

  return (
    <div className="flex" style={{ height: "100vh", overflow: "hidden", background: "#f8fafc", width: "100%" }}>

      {/* ═══ LEFT SIDEBAR — logo + labels ═══════════════════════════════════ */}
      <aside className="w-52 shrink-0 bg-white border-r border-gray-100 flex flex-col"
        style={{ height: "100vh", overflowY: "auto" }}>

        {/* Logo */}
        <div className="px-4 py-4 border-b border-gray-100 shrink-0 flex flex-col items-center gap-1.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/angeltreat-logo.png" alt="Angel TREAT" style={{ height: 22, width: "auto", maxWidth: "100%" }} />
          <Image src={logo} alt="Rahoot!" style={{ height: 30, width: "auto" }} className="drop-shadow-[0_2px_4px_rgba(0,0,0,0.15)]" />
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-3 px-2.5">
          <div className="mb-1 mt-0.5 px-2 pb-1">
            <span className="text-[9px] font-bold uppercase tracking-widest text-gray-400">Analytics</span>
          </div>
          {analyticsNav.map(item => (
            <button key={item.id} onClick={() => setActiveView(item.id)}
              className={clsx(
                "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-all mb-0.5",
                activeView === item.id
                  ? "bg-primary/10 text-primary font-semibold"
                  : "font-medium text-gray-500 hover:bg-gray-50 hover:text-gray-800"
              )}>
              {item.icon}
              <span className="truncate">{item.label}</span>
            </button>
          ))}

          <div className="mb-1 mt-4 px-2 pb-1">
            <span className="text-[9px] font-bold uppercase tracking-widest text-gray-400">Manage</span>
          </div>
          {manageNav.map(item => (
            <button key={item.id} onClick={() => setActiveView(item.id)}
              className={clsx(
                "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-all mb-0.5",
                activeView === item.id
                  ? "bg-primary/10 text-primary font-semibold"
                  : "font-medium text-gray-500 hover:bg-gray-50 hover:text-gray-800"
              )}>
              {item.icon}
              <span className="truncate">{item.label}</span>
            </button>
          ))}
        </nav>

        {/* Exit to player screen */}
        <div className="shrink-0 border-t border-gray-100 px-2.5 py-3">
          <Link
            href="/"
            className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium text-gray-400 transition-colors hover:bg-red-50 hover:text-red-500"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
              <polyline points="16 17 21 12 16 7"/>
              <line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
            <span className="truncate">Exit to player</span>
          </Link>
        </div>

      </aside>

      {/* ═══ MAIN CONTENT ═══════════════════════════════════════════════════ */}
      <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
        {/* ── Inline filter bar ────────────────────────────────────────────── */}
        {activeView !== "team" && activeView !== "leaderboard" && (
          <div className="shrink-0 flex items-center gap-2 px-4 py-2 border-b border-gray-100 bg-white flex-wrap">
            <span className="text-[9px] font-bold uppercase tracking-widest text-gray-400 mr-1">Region</span>
            {(["all","BR","MY","CN"] as RFilter[]).map(r => (
              <button key={r} onClick={() => setRFilter(r)} className={clsx("rounded-full px-2.5 py-1 text-[10px] font-semibold transition-colors", rFilter === r ? "bg-primary text-white" : "bg-gray-100 text-gray-500 hover:bg-gray-200")}>
                {r === "all" ? "All regions" : r === "BR" ? `BR (${regionStats.BR.q})` : r === "MY" ? `MY (${regionStats.MY.q})` : `CN (${regionStats.CN.q})`}
              </button>
            ))}
            {activeView !== "quizzes" && (<>
              <div className="w-px h-4 bg-gray-200 mx-0.5"/>
              {(["all","month","week"] as PFilter[]).map(p => (
                <button key={p} onClick={() => setPFilter(p)} className={clsx("rounded-full px-2.5 py-1 text-[10px] font-semibold transition-colors", pFilter === p ? "bg-primary text-white" : "bg-gray-100 text-gray-500 hover:bg-gray-200")}>
                  {p === "all" ? "All time" : p === "month" ? "This month" : "This week"}
                </button>
              ))}
              <div className="w-px h-4 bg-gray-200 mx-0.5"/>
              <select value={aFilter} onChange={e => setAFilter(e.target.value)} className="rounded-lg bg-gray-50 border border-gray-200 px-2 py-1 text-[10px] font-semibold text-gray-600 outline-none cursor-pointer">
                <option value="all">All authors</option>
                {authors.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            </>)}
          </div>
        )}
        {activeView === "quizzes" ? (
          <div className="flex-1 overflow-hidden">
            <SelectQuizz quizzList={localList} onSelect={onSelect || (() => {})} onListChange={handleListChange} regionFilter={rFilter} />
          </div>
        ) : activeView === "team" ? (
          <div className="flex-1 overflow-auto p-5">
            <ManagerPlayers quizzList={localList} regionFilter={rFilter} />
          </div>
        ) : null}
        <div className={clsx("flex-1 min-h-0 overflow-auto p-5 flex flex-col gap-5", (activeView === "quizzes" || activeView === "team") && "hidden")}>

          {/* ── OVERVIEW ──────────────────────────────────────────────────── */}
          {activeView === "overview" && (<>

            {/* KPI cards */}
            <div className="grid grid-cols-4 gap-4">
              {[
                { label: "Total Quizzes", val: metrics.total, sub1: `${metrics.questions} questions`, sub2: `${metrics.sessions} sessions played`, color: "bg-primary", iconColor: "#009edf", icon: <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2M9 12h6M9 16h4"/> },
                { label: "Participations", val: metrics.players.toLocaleString(), sub1: `${metrics.unique} unique players`, sub2: `${metrics.creators} content creators`, color: "bg-green-500", iconColor: "#22c55e", icon: <><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></> },
                { label: "Avg / Session", val: metrics.avgP, sub1: "players per session", sub2: `${metrics.avgD} min avg duration`, color: "bg-amber-400", iconColor: "#f59e0b", icon: <path d="M18 20V10M12 20V4M6 20v-6"/> },
              ].map((c, ci) => (
                <div key={ci} className="rounded-2xl bg-white p-6 shadow-sm border border-gray-100 overflow-hidden relative">
                  <div className={clsx("absolute inset-y-0 left-0 w-1 rounded-l-2xl", c.color)} />
                  <div className="pl-2">
                    <div className="mb-5 flex items-center gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" style={{ background: c.iconColor + "18" }}>
                        <svg width="20" height="20" fill="none" stroke={c.iconColor} strokeWidth="2" viewBox="0 0 24 24">{c.icon}</svg>
                      </div>
                      <span className="text-xs font-semibold uppercase tracking-wide text-gray-400 leading-tight">{c.label}</span>
                    </div>
                    <div className="text-3xl font-bold text-gray-900 leading-none tabular-nums">{c.val}</div>
                    <div className="mt-3 flex flex-col gap-1.5">
                      <div className="text-sm text-gray-400">{c.sub1}</div>
                      <div className="text-sm text-gray-400">{c.sub2}</div>
                    </div>
                  </div>
                </div>
              ))}
              {/* Accuracy card */}
              <div className="rounded-2xl bg-white p-6 shadow-sm border border-gray-100 overflow-hidden relative">
                <div className="absolute inset-y-0 left-0 w-1 bg-red-400 rounded-l-2xl" />
                <div className="pl-2">
                  <div className="mb-5 flex items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-400/10">
                      <svg width="20" height="20" fill="none" stroke="#f87171" strokeWidth="2" viewBox="0 0 24 24"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><path d="M22 4L12 14.01l-3-3"/></svg>
                    </div>
                    <span className="text-xs font-semibold uppercase tracking-wide text-gray-400 leading-tight">Overall Accuracy</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <AccRing v={metrics.acc} size={60} />
                    <div>
                      <div className="text-base font-semibold text-gray-700 leading-tight">{metrics.acc >= 65 ? "Good" : metrics.acc >= 50 ? "Getting there" : "Needs work"}</div>
                      <div className="text-sm text-gray-400 mt-1">across all sessions</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Monthly trend */}
            <div className="rounded-2xl bg-white p-6 shadow-sm border border-gray-100">
              <div className="mb-5 flex items-center justify-between">
                <div>
                  <h3 className="text-base font-semibold text-gray-800">Participation over time</h3>
                  <p className="text-sm text-gray-400 mt-1">{pFilter === "week" ? "Players by day this week" : "Monthly players across all sessions"}</p>
                </div>
                {pFilter !== "week" && monthly.length > 0 && <span className="text-sm font-semibold text-primary bg-primary/8 rounded-full px-3 py-1">{monthly.length} month{monthly.length !== 1 ? "s" : ""}</span>}
              </div>
              {pFilter === "week" ? (() => {
                const maxP = Math.max(...weeklyDays.map(d => d.players), 1)
                const VW = 560, VH = 200, PX = 24, PYT = 28, PYB = 32, BAR_GAP = 8
                const slotW = (VW - 2 * PX) / 7
                const barW = slotW - BAR_GAP
                return weeklyDays.some(d => d.players > 0) ? (
                  <svg viewBox={`0 0 ${VW} ${VH}`} className="w-full" style={{ height: VH }}>
                    {weeklyDays.map((d, i) => {
                      const bh = Math.max((d.players / maxP) * (VH - PYT - PYB), d.players > 0 ? 4 : 0)
                      const bx = PX + i * slotW + BAR_GAP / 2
                      const by = VH - PYB - bh
                      const hasData = d.players > 0
                      return (
                        <g key={d.day}>
                          <rect x={bx.toFixed(1)} y={by.toFixed(1)} width={barW.toFixed(1)} height={bh.toFixed(1)} rx="5" fill={hasData ? "#009edf" : "#f1f5f9"}/>
                          {hasData && <rect x={bx.toFixed(1)} y={by.toFixed(1)} width={barW.toFixed(1)} height={Math.min(bh, 10).toFixed(1)} rx="5" fill="rgba(255,255,255,0.25)"/>}
                          {hasData && <text x={(bx + barW/2).toFixed(1)} y={(by - 8).toFixed(1)} textAnchor="middle" fontSize="12" fill="#009edf" fontWeight="700" fontFamily="inherit">{d.players}</text>}
                          <text x={(bx + barW/2).toFixed(1)} y={(VH - 10).toFixed(1)} textAnchor="middle" fontSize="11" fill={hasData ? "#374151" : "#9ca3af"} fontWeight={hasData ? "600" : "400"} fontFamily="inherit">{d.day}</text>
                          {hasData && d.quizzes > 0 && <text x={(bx + barW/2).toFixed(1)} y={(VH - 20).toFixed(1)} textAnchor="middle" fontSize="9" fill="#9ca3af" fontFamily="inherit">{d.quizzes}q</text>}
                          <title>{`${d.day}: ${d.players} players · ${d.quizzes} sessions · ${d.acc}% acc`}</title>
                        </g>
                      )
                    })}
                  </svg>
                ) : <div className="flex items-center justify-center h-36 text-sm text-gray-400">No sessions this week</div>
              })() : monthly.length > 1 ? (() => {
                const VW = 560, VH = 220, PX = 12, PYT = 28, PYB = 38
                const pts = monthly.map((m, i) => ({ x: PX + (i / (monthly.length - 1)) * (VW - 2 * PX), y: PYT + (1 - m.players / maxMP) * (VH - PYT - PYB), ...m }))
                const lineStr = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ")
                const areaStr = `${lineStr} L${pts[pts.length-1].x.toFixed(1)},${(VH-PYB).toFixed(1)} L${pts[0].x.toFixed(1)},${(VH-PYB).toFixed(1)} Z`
                return (
                  <svg viewBox={`0 0 ${VW} ${VH}`} className="w-full" style={{ height: VH }}>
                    <defs><linearGradient id="ag" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#009edf" stopOpacity="0.2"/><stop offset="100%" stopColor="#009edf" stopOpacity="0.01"/></linearGradient></defs>
                    {[0.25, 0.5, 0.75].map(f => { const gy = PYT + (1-f)*(VH-PYT-PYB); return <line key={f} x1={PX} y1={gy.toFixed(1)} x2={VW-PX} y2={gy.toFixed(1)} stroke="#f1f5f9" strokeWidth="1"/> })}
                    <path d={areaStr} fill="url(#ag)"/>
                    <path d={lineStr} fill="none" stroke="#009edf" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                    {pts.map((p, i) => (
                      <g key={i}>
                        <circle cx={p.x.toFixed(1)} cy={p.y.toFixed(1)} r="5" fill="white" stroke="#009edf" strokeWidth="2.5"/>
                        <text x={p.x.toFixed(1)} y={(p.y-13).toFixed(1)} textAnchor="middle" fontSize="11" fill="#009edf" fontWeight="700" fontFamily="inherit">{p.players}</text>
                        <text x={p.x.toFixed(1)} y={(VH-10).toFixed(1)} textAnchor="middle" fontSize="11" fill="#9ca3af" fontFamily="inherit">{p.label}</text>
                        <title>{`${p.label}: ${p.players} players · ${p.quizzes} quizzes · ${p.acc}% acc`}</title>
                      </g>
                    ))}
                  </svg>
                )
              })() : <div className="flex items-center justify-center h-36 text-sm text-gray-400">{monthly.length === 1 ? `${monthly[0].label}: ${monthly[0].players} players` : "No data yet"}</div>}
            </div>

            {/* 3-col */}
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-2xl bg-white p-6 shadow-sm border border-gray-100">
                <h3 className="mb-5 text-base font-semibold text-gray-800">Accuracy by month</h3>
                <div className="flex flex-col gap-4">
                  {monthly.map(m => (
                    <div key={m.key}>
                      <div className="mb-2 flex items-center justify-between">
                        <span className="text-sm text-gray-600">{m.label}</span>
                        <span className={clsx("text-sm font-bold", m.acc >= 65 ? "text-green-600" : m.acc >= 50 ? "text-primary" : "text-amber-600")}>{m.acc}%</span>
                      </div>
                      <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                        <div className={clsx("h-full rounded-full", m.acc >= 65 ? "bg-green-500" : m.acc >= 50 ? "bg-primary" : "bg-amber-500")} style={{ width: `${Math.max(m.acc, 2)}%` }}/>
                      </div>
                    </div>
                  ))}
                  {monthly.length === 0 && <p className="text-sm text-gray-400 text-center py-4">No data</p>}
                </div>
              </div>
              <div className="rounded-2xl bg-white p-6 shadow-sm border border-gray-100">
                <h3 className="mb-5 text-base font-semibold text-gray-800">Top creators</h3>
                <div className="flex flex-col gap-4">
                  {topCreators.map((c, i) => (
                    <div key={c.name} className="flex items-start gap-3">
                      <div className={clsx("flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white mt-0.5", rc[i] || "bg-gray-300")}>{i + 1}</div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-gray-700 leading-tight">{c.name}</div>
                        <div className="flex items-center gap-1.5 mt-1">
                          <Tag region={c.region}/>
                          <span className="text-xs text-gray-400">{c.quizzes} quiz{c.quizzes !== 1 ? "zes" : ""}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                  {topCreators.length === 0 && <p className="text-sm text-gray-400 text-center py-4">No data</p>}
                </div>
              </div>
              <div className="rounded-2xl bg-white p-6 shadow-sm border border-gray-100">
                <h3 className="mb-5 text-base font-semibold text-gray-800">Categories</h3>
                <div className="flex flex-col gap-4">
                  {categories.slice(0, 6).map(c => (
                    <div key={c.name}>
                      <div className="mb-2 flex items-start justify-between gap-2">
                        <span className="text-sm text-gray-600 leading-tight">{c.name}</span>
                        <span className="text-xs text-gray-400 shrink-0 mt-0.5">{c.played}/{c.count}</span>
                      </div>
                      <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                        <div className="h-full rounded-full bg-primary" style={{ width: `${c.count / maxCC * 100}%` }}/>
                      </div>
                    </div>
                  ))}
                  {categories.length === 0 && <p className="text-sm text-gray-400 text-center py-4">No data</p>}
                </div>
              </div>
            </div>

            {/* By Region */}
            <div className="grid grid-cols-1 gap-4">
              <div className="rounded-2xl bg-white p-6 shadow-sm border border-gray-100">
                <p className="mb-4 text-[10px] font-bold uppercase tracking-widest text-gray-400">By Region</p>
                <div className="flex gap-4">
                  {(["BR","MY","CN"] as const).map(reg => {
                    const rs = regionStats[reg]
                    const acc = rs.t > 0 ? Math.round(rs.c / rs.t * 100) : 0
                    return (
                      <div key={reg} className="flex items-center gap-4 rounded-xl border border-gray-100 py-4 px-5 flex-1">
                        <AccRing v={acc} size={64}/>
                        <div>
                          <Tag region={reg}/>
                          <div className="text-2xl font-bold text-gray-900 mt-1.5">{acc}%</div>
                          <div className="text-xs text-gray-400 mt-1">{rs.q} quizzes · {rs.p} players</div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>

            {/* Groups + Hardest */}
            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-2xl bg-white p-6 shadow-sm border border-gray-100">
                <p className="mb-4 text-[10px] font-bold uppercase tracking-widest text-gray-400">Groups</p>
                <div className="grid grid-cols-3 gap-3">
                  {(["ATP","ATD","Others"] as const).map(g => {
                    const gs = groupStats[g] || { q: 0, p: 0, c: 0, t: 0 }
                    const acc = gs.t > 0 ? Math.round(gs.c / gs.t * 100) : 0
                    const col = GROUP_COLORS[g]
                    return (
                      <div key={g} className="flex flex-col items-center gap-2 rounded-xl border border-gray-100 py-4 px-2">
                        <AccRing v={acc} size={52}/>
                        <span className={clsx("text-[10px] font-bold rounded px-1.5 py-0.5", col.bg, col.text)}>{g}</span>
                        <div className="w-full px-1"><div className="h-1.5 rounded-full bg-gray-100 overflow-hidden"><div className={clsx("h-full rounded-full", col.bar)} style={{ width: `${maxGQ > 0 ? (gs.q / maxGQ) * 100 : 0}%` }}/></div></div>
                        <div className="text-[10px] text-gray-400">{gs.q} quizzes</div>
                      </div>
                    )
                  })}
                </div>
              </div>
              <div className="rounded-2xl bg-white p-6 shadow-sm border border-gray-100">
                <p className="mb-4 text-[10px] font-bold uppercase tracking-widest text-gray-400">Hardest Quizzes</p>
                <div className="flex flex-col gap-3">
                  {hardest.map((q, i) => (
                    <div key={i} className="rounded-lg border border-gray-100 px-3 py-2.5">
                      <div className="flex items-start gap-3 mb-2">
                        <AccRing v={q.acc} size={44}/>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-gray-700 leading-tight">{q.subject}</div>
                          <div className="flex items-center gap-1.5 mt-1"><Tag region={q.region}/><span className="text-xs text-gray-400">{q.players} players</span></div>
                        </div>
                      </div>
                      <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden"><div className="h-full rounded-full bg-red-400" style={{ width: `${q.acc}%` }}/></div>
                    </div>
                  ))}
                  {hardest.length === 0 && <p className="text-sm text-gray-400 text-center py-4">No data yet</p>}
                </div>
              </div>
            </div>
          </>)}

          {/* ── TOP PLAYERS ───────────────────────────────────────────────── */}
          {activeView === "players" && (
            <div className="rounded-2xl bg-white p-6 shadow-sm border border-gray-100">
              <div className="mb-2 flex items-center justify-between flex-wrap gap-3">
                <h3 className="text-base font-semibold text-gray-800">Top players</h3>
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="flex rounded-lg overflow-hidden border border-gray-200">
                    {(["avgPts", "avgCorrect", "games"] as const).map((m, mi) => (
                      <button key={m} onClick={() => setTopMetric(m)}
                        className={clsx("px-3 py-1.5 text-xs font-semibold transition-colors", mi > 0 ? "border-l border-gray-200" : "",
                          topMetric === m ? "bg-primary text-white" : "bg-white text-gray-500 hover:bg-gray-50")}>
                        {m === "avgPts" ? "Avg pts" : m === "avgCorrect" ? "Avg correct" : "Total games"}
                      </button>
                    ))}
                  </div>
                  {(["all", "BR", "MY", "CN"] as const).map(r => (
                    <button key={r} onClick={() => setTopPlayersRegion(r)}
                      className={clsx("rounded-full px-3 py-1.5 text-xs font-semibold transition-colors",
                        topPlayersRegion === r ? "bg-primary text-white" : "bg-gray-100 text-gray-400 hover:bg-gray-200")}>
                      {r === "all" ? "All" : r === "BR" ? "🇧🇷 BR" : r === "MY" ? "🇲🇾 MY" : "🇨🇳 CN"}
                    </button>
                  ))}
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-gray-400">Min games:</span>
                    {[1, 2, 3, 5].map(n => (
                      <button key={n} onClick={() => setMinGames(n)}
                        className={clsx("rounded-full px-2.5 py-1 text-xs font-semibold transition-colors",
                          minGames === n ? "bg-primary text-white" : "bg-gray-100 text-gray-400 hover:bg-gray-200")}>{n}+</button>
                    ))}
                  </div>
                </div>
              </div>
              <p className="mb-5 text-sm text-gray-400">
                Sorted by {topMetric === "avgPts" ? "avg points" : topMetric === "avgCorrect" ? "avg correct answers" : "total games played"} · Min {minGames} {minGames === 1 ? "game" : "games"}
              </p>
              <div className="flex items-center gap-3 border-b border-gray-100 pb-3 mb-1 px-2">
                <TH cls="w-8 text-center">#</TH>
                <TH cls="flex-1">Player</TH>
                <TH cls="w-16 text-center">Games</TH>
                <TH cls="w-20 text-center">{topMetric === "avgPts" ? "Avg pts" : topMetric === "avgCorrect" ? "Avg cor" : "Total pts"}</TH>
                <TH cls="w-36 text-right">Accuracy</TH>
              </div>
              {topPlayers.map((p, i) => (
                <div key={p.name + i} className={clsx("flex items-center gap-3 py-3 border-b border-gray-50 last:border-0 rounded-xl px-2", i < 3 ? "bg-amber-50/40" : "hover:bg-gray-50")}>
                  <div className="w-8 shrink-0 text-center">
                    {i < 3 ? <span className="text-base">{["🥇","🥈","🥉"][i]}</span> : <span className={clsx("inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold text-white", rc[i] || "bg-gray-300")}>{i+1}</span>}
                  </div>
                  <span className="flex-1 min-w-0 text-sm font-medium text-gray-700 truncate">{p.name}</span>
                  <span className="w-16 shrink-0 text-center text-sm text-gray-500">{p.games}</span>
                  <span className="w-20 shrink-0 text-center text-sm font-bold text-gray-700">{topMetric === "avgPts" ? p.avgPts : topMetric === "avgCorrect" ? p.avgCorrect : p.totalPts}</span>
                  <div className="w-36 shrink-0 flex justify-end"><AccBar v={p.acc}/></div>
                </div>
              ))}
              {topPlayers.length === 0 && <p className="text-sm text-gray-400 text-center py-8">No players with {minGames}+ games yet</p>}
            </div>
          )}

          {/* ── LEADERBOARD ───────────────────────────────────────────────── */}
          {activeView === "leaderboard" && (
            <div className="rounded-2xl bg-white shadow-sm border border-gray-100 overflow-hidden">
              <div className="px-6 pt-4 pb-3 border-b border-gray-100">
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <div>
                    <h3 className="text-base font-semibold text-gray-800">Leaderboard — Top 10</h3>
                    <p className="text-sm text-gray-400 mt-1">{lbPeriodLabel}</p>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="flex rounded-lg overflow-hidden border border-gray-200">
                      <button onClick={() => setLbPeriod("week")} className={clsx("px-3 py-1.5 text-xs font-semibold transition-colors", lbPeriod === "week" ? "bg-primary text-white" : "bg-white text-gray-500 hover:bg-gray-50")}>Weekly</button>
                      <button onClick={() => setLbPeriod("month")} className={clsx("px-3 py-1.5 text-xs font-semibold transition-colors border-l border-gray-200", lbPeriod === "month" ? "bg-primary text-white" : "bg-white text-gray-500 hover:bg-gray-50")}>Monthly</button>
                    </div>
                    <div className="flex rounded-lg overflow-hidden border border-gray-200">
                      <button onClick={() => setWeeklyTab("region")} className={clsx("px-3 py-1.5 text-xs font-semibold transition-colors", weeklyTab === "region" ? "bg-primary text-white" : "bg-white text-gray-500 hover:bg-gray-50")}>By Region</button>
                      <button onClick={() => setWeeklyTab("group")} className={clsx("px-3 py-1.5 text-xs font-semibold transition-colors border-l border-gray-200", weeklyTab === "group" ? "bg-primary text-white" : "bg-white text-gray-500 hover:bg-gray-50")}>By Group</button>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs text-gray-400">Min:</span>
                      {[1,2,3,5].map(n => <button key={n} onClick={() => setMinGames(n)} className={clsx("rounded-full px-2.5 py-1 text-xs font-semibold transition-colors", minGames === n ? "bg-primary text-white" : "bg-gray-100 text-gray-400 hover:bg-gray-200")}>{n}+</button>)}
                    </div>
                  </div>
                </div>
              </div>

              {weeklyTab === "region" && (
                <div className="p-4 flex flex-col gap-3">
                  <div className="flex flex-wrap gap-2">
                    <button onClick={() => setRankingCats([])} className={clsx("rounded-full px-3 py-1.5 text-xs font-semibold transition-colors", rankingCats.length === 0 ? "bg-primary text-white" : "bg-gray-100 text-gray-500 hover:bg-gray-200")}>All categories</button>
                    {allCategories.map(cat => <button key={cat} onClick={() => toggleRankingCat(cat)} className={clsx("rounded-full px-3 py-1.5 text-xs font-semibold transition-colors", rankingCats.includes(cat) ? "bg-primary text-white" : "bg-gray-100 text-gray-500 hover:bg-gray-200")}>{cat}</button>)}
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    {(["BR", "MY", "CN"] as const).map(region => (
                      <div key={region} className="rounded-xl border border-gray-100 overflow-hidden" style={{ borderTop: `3px solid ${region === "BR" ? "#16a34a" : region === "MY" ? "#2563eb" : "#dc2626"}` }}>
                        <div className="px-4 py-2 flex items-center gap-2 bg-gray-50/60 border-b border-gray-100">
                          <Tag region={region}/><span className="text-sm font-semibold text-gray-700">Top 10</span><span className="ml-auto text-xs text-gray-400">Score · Avg</span>
                        </div>
                        {(weeklyTop[region] || []).length === 0 ? <div className="py-10 text-sm text-gray-400 text-center">No games in this period</div> : (
                          <div className="px-3 py-2">
                            <div className="flex items-center gap-2 pb-2 border-b border-gray-100 mb-1">
                              <TH cls="w-8 text-center">#</TH><TH cls="flex-1">Player</TH><TH cls="w-10 text-center">G</TH><TH cls="w-20 text-right">Score</TH><TH cls="w-14 text-right">Acc</TH>
                            </div>
                            {(weeklyTop[region] || []).map((p: any, i: number) => (
                              <div key={i} className={clsx("flex items-center gap-2 py-1.5 border-b border-gray-50 last:border-0 rounded-lg", i < 3 ? "bg-amber-50/50 px-1" : "px-1 hover:bg-gray-50")}>
                                <div className="w-8 shrink-0 text-center text-sm leading-none">{i < 3 ? ["🥇","🥈","🥉"][i] : <span className="text-xs text-gray-400 font-semibold">{i+1}</span>}</div>
                                <div className="flex-1 min-w-0">
                                  <div className="text-[13px] font-medium text-gray-700 truncate">{p.name}</div>
                                  {p.nicknames.length > 0 && <div className="text-xs text-gray-400 truncate">aka {p.nicknames[0]}</div>}
                                </div>
                                <div className="w-10 shrink-0 text-center text-sm text-gray-500">{p.games}</div>
                                <div className="w-20 shrink-0 text-right"><span className="text-[13px] font-bold text-gray-800 tabular-nums">{p.totalPts}</span><span className="block text-[10px] text-gray-400 tabular-nums">{p.avgPts}/game</span></div>
                                <div className="w-16 shrink-0 flex justify-end"><AccBadge v={p.acc}/></div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {weeklyTab === "group" && (
                <div className="p-4 flex flex-col gap-3">
                  <div className="flex flex-wrap gap-2">
                    <button onClick={() => setRankingGroups([])} className={clsx("rounded-full px-3 py-1.5 text-xs font-semibold transition-colors", rankingGroups.length === 0 ? "bg-primary text-white" : "bg-gray-100 text-gray-500 hover:bg-gray-200")}>All groups</button>
                    {(["ATP","ATD","Others"] as const).map(g => <button key={g} onClick={() => toggleRankingGroup(g)} className={clsx("rounded-full px-3 py-1.5 text-xs font-semibold transition-colors", rankingGroups.includes(g) ? "bg-primary text-white" : "bg-gray-100 text-gray-500 hover:bg-gray-200")}>{g}</button>)}
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    {(["ATP","ATD","Others"] as const).map(g => {
                      const col = GROUP_COLORS[g]
                      return (
                        <div key={g} className="rounded-xl border border-gray-100 overflow-hidden" style={{ borderTop: `3px solid ${col.border}` }}>
                          <div className="px-4 py-2 flex items-center gap-2 bg-gray-50/60 border-b border-gray-100">
                            <GroupTag group={g}/><span className="text-sm font-semibold text-gray-700">Top 10</span><span className="ml-auto text-xs text-gray-400">Pts</span>
                          </div>
                          {(weeklyTopByGroup[g] || []).length === 0 ? <div className="py-10 text-sm text-gray-400 text-center">No games in this period</div> : (
                            <div className="px-3 py-2">
                              <div className="flex items-center gap-2 pb-2 border-b border-gray-100 mb-1">
                                <TH cls="w-7 text-center">#</TH><TH cls="flex-1">Player</TH><TH cls="w-10 text-center">G</TH><TH cls="w-20 text-right">Score</TH><TH cls="w-14 text-right">Acc</TH>
                              </div>
                              {(weeklyTopByGroup[g] || []).map((p: any, i: number) => (
                                <div key={i} className={clsx("flex items-center gap-2 py-1.5 border-b border-gray-50 last:border-0 rounded-lg", i < 3 ? "bg-amber-50/50 px-1" : "px-1 hover:bg-gray-50")}>
                                  <div className="w-7 shrink-0 text-center text-sm leading-none">{i < 3 ? ["🥇","🥈","🥉"][i] : <span className="text-xs text-gray-400 font-semibold">{i+1}</span>}</div>
                                  <div className="flex-1 min-w-0">
                                    <div className="text-[13px] font-medium text-gray-700 truncate">{p.name}</div>
                                    {p.nicknames.length > 0 && <div className="text-xs text-gray-400 truncate">{p.nicknames[0]}</div>}
                                  </div>
                                  <div className="w-10 shrink-0 text-center text-sm text-gray-500">{p.games}</div><div className="w-20 shrink-0 text-right"><span className="text-[13px] font-bold text-gray-800 tabular-nums">{p.totalPts}</span><span className="block text-[10px] text-gray-400 tabular-nums">{p.avgPts}/game</span></div>
                                  <div className="w-14 shrink-0 flex justify-end"><AccBadge v={p.acc}/></div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── PARTICIPATION BY DAY ──────────────────────────────────────── */}
          {activeView === "participation" && (
            <div className="rounded-2xl bg-white shadow-sm border border-gray-100 overflow-hidden">
              <div className="px-6 pt-4 pb-3 border-b border-gray-100">
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <div>
                    <h3 className="text-base font-semibold text-gray-800">Participation by day</h3>
                    <p className="text-sm text-gray-400 mt-1">Who participated on a specific date and how many times</p>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <input type="date" value={participationDate} onChange={e => setParticipationDate(e.target.value)}
                      className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-600 outline-none focus:border-primary bg-white"/>

                    <div className="flex rounded-lg overflow-hidden border border-gray-200">
                      {(["count","pts","name"] as const).map((s, si) => (
                        <button key={s} onClick={() => setParticipationSort(s)}
                          className={clsx("px-3 py-1.5 text-xs font-semibold transition-colors", si > 0 ? "border-l border-gray-200" : "",
                            participationSort === s ? "bg-primary text-white" : "bg-white text-gray-500 hover:bg-gray-50")}>
                          {s === "count" ? "Sessions" : s === "pts" ? "Points" : "Name"}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
              {!participationDate ? (
                <div className="flex flex-col items-center justify-center py-20 gap-3">
                  <svg width="40" height="40" fill="none" stroke="#d1d5db" strokeWidth="1.5" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                  <span className="text-sm font-medium text-gray-500">Pick a date to view participation</span>
                  <span className="text-sm text-gray-400">See each player's session count and performance for that day</span>
                </div>
              ) : dayParticipation.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 gap-2">
                  <span className="text-sm font-medium text-gray-500">No sessions on this date</span>
                  <span className="text-sm text-gray-400">Try another date or change the region filter</span>
                </div>
              ) : (
                <div className="p-6">
                  <div className="mb-4 flex items-center gap-3">
                    <span className="text-sm font-semibold text-primary bg-primary/8 rounded-full px-3 py-1">{dayParticipation.length} player{dayParticipation.length !== 1 ? "s" : ""}</span>
                    <span className="text-sm text-gray-400">· {dayParticipation.reduce((a, p) => a + p.count, 0)} total session entries</span>
                    {participationRegion !== "all" && <Tag region={participationRegion}/>}
                  </div>
                  <div className="flex items-center gap-3 border-b border-gray-100 pb-3 mb-1 px-2">
                    <TH cls="w-8 text-center">#</TH><TH cls="flex-1">Player</TH><TH cls="w-24 text-center">Sessions</TH><TH cls="w-20 text-center">Avg pts</TH><TH cls="w-36 text-right">Accuracy</TH>
                  </div>
                  <div style={{ maxHeight: "520px", overflowY: "auto" }}>
                    {dayParticipation.map((p, i) => (
                      <div key={i} className="flex items-center gap-3 py-3 border-b border-gray-50 last:border-0 rounded-xl px-2 hover:bg-gray-50">
                        <div className="w-8 shrink-0 text-center">
                          {i < 3 ? <span className="text-base">{["🥇","🥈","🥉"][i]}</span> : <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-gray-100 text-xs font-bold text-gray-500">{i+1}</span>}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-[13px] font-medium text-gray-700 truncate">{p.name}</div>
                          {p.quizzes.length > 0 && <div className="text-xs text-gray-400 truncate mt-0.5">{p.quizzes.slice(0,2).join(" · ")}{p.quizzes.length > 2 ? ` +${p.quizzes.length-2}` : ""}</div>}
                        </div>
                        <div className="w-24 shrink-0 flex justify-center">
                          <span className={clsx("inline-flex items-center justify-center rounded-full px-3 py-0.5 text-sm font-bold",
                            p.count >= 3 ? "bg-green-100 text-green-700" : p.count >= 2 ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-600")}>
                            {p.count}×
                          </span>
                        </div>
                        <div className="w-20 shrink-0 text-center text-sm font-bold text-gray-700">{p.avgPts}</div>
                        <div className="w-36 shrink-0 flex justify-end"><AccBar v={p.acc}/></div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── RECENT ACTIVITY ───────────────────────────────────────────── */}
          {activeView === "activity" && (
            <div className="rounded-2xl bg-white p-6 shadow-sm border border-gray-100">
              <h3 className="mb-5 text-base font-semibold text-gray-800">Recent activity</h3>
              <div className="flex flex-col gap-2.5">
                {recent.map((s, i) => {
                  const cancelled = localCancelled[s.id] || []
                  const isExpanded = expandedSession === s.id
                  return (
                    <div key={i} className="rounded-xl overflow-hidden border border-transparent hover:border-gray-200 transition-all bg-gray-50">
                      <div className="flex items-center gap-3 px-4 py-4">
                        <div className="flex flex-1 min-w-0 items-center gap-3 cursor-pointer" onClick={() => router.push(`/reports/${(s.id || "").replace(".json", "")}`)}>
                          <AccRing v={s.acc} size={48}/>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-semibold text-gray-700">{s.subject}</span>
                              <GroupTag group={s.group}/>
                              {cancelled.length > 0 && <span className="shrink-0 rounded bg-red-100 px-1.5 py-0.5 text-xs font-bold text-red-600">{cancelled.length} cancelled</span>}
                            </div>
                            <div className="text-sm text-gray-400 mt-1">{s.lastPlayedAt?.split(",")[0]?.trim() || "--"} · {s.createdBy} · {s.playerCount} players</div>
                          </div>
                          <Tag region={s.region}/>
                          <svg width="14" height="14" fill="none" stroke="#cbd5e1" strokeWidth="2.5" viewBox="0 0 24 24" className="shrink-0"><path d="M9 18l6-6-6-6"/></svg>
                        </div>
                        <button onClick={() => setExpandedSession(isExpanded ? null : s.id)}
                          className={clsx("shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors",
                            cancelled.length > 0 ? "bg-red-100 text-red-700 hover:bg-red-200" : isExpanded ? "bg-primary/10 text-primary" : "bg-gray-200 text-gray-500 hover:bg-gray-300")}>
                          {isExpanded ? "▲ Close" : `Questions${cancelled.length > 0 ? ` (${cancelled.length}✕)` : ""}`}
                        </button>
                      </div>
                      {isExpanded && (
                        <div className="border-t border-gray-100 bg-white px-5 py-4">
                          <p className="mb-3 text-sm text-gray-400">Flag questions as cancelled — data is kept but marked as invalid for scoring.</p>
                          {(s.questions || []).map((q: any, qi: number) => {
                            const isCancelled = cancelled.includes(qi)
                            return (
                              <div key={qi} className={clsx("flex items-center justify-between rounded-lg px-3 py-2.5 mb-1.5 last:mb-0", isCancelled ? "bg-red-50" : "hover:bg-gray-50")}>
                                <span className={clsx("flex-1 text-sm", isCancelled ? "line-through text-gray-400" : "text-gray-700")}>
                                  <span className="mr-2 font-bold text-gray-400">{qi+1}.</span>
                                  {q.question}
                                  {isCancelled && <span className="ml-2 rounded bg-red-200 px-1.5 py-0.5 text-xs font-bold text-red-700">CANCELLED</span>}
                                </span>
                                <button onClick={() => toggleCancelQuestion(s.id, qi)}
                                  className={clsx("ml-4 shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors",
                                    isCancelled ? "bg-red-100 text-red-600 hover:bg-red-200" : "bg-gray-100 text-gray-500 hover:bg-red-50 hover:text-red-600")}>
                                  {isCancelled ? "Restore" : "Cancel Q"}
                                </button>
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )
                })}
                {recent.length === 0 && <p className="text-sm text-gray-400 text-center py-12">No sessions played yet</p>}
              </div>
            </div>
          )}

        </div>
      </div>


    </div>
  )
}
