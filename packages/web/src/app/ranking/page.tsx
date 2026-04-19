"use client"

import Button from "@rahoot/web/components/Button"
import TierBadge from "@rahoot/web/components/profile/TierBadge"
import { useSocket } from "@rahoot/web/contexts/socketProvider"
import { useRouter } from "next/navigation"
import { useEffect, useMemo, useState } from "react"
import clsx from "clsx"

type TierId = "bronze" | "silver" | "gold" | "platinum" | "mythic"

interface LeaderRow {
  rank: number
  playerId: string
  realName: string
  username: string
  avatarJson: string | null
  points: number
  games: number
  tier: TierId
  level: number
}

interface HallOfFameEntry {
  period: string
  displayLabel: string
  top: Array<{
    rank: number
    playerId: string
    realName: string
    points: number
    games: number
  }>
}

interface LeaderboardsBundle {
  week: { iso: string; label: string; top: LeaderRow[] }
  month: { iso: string; label: string; top: LeaderRow[] }
  weeklyHof: HallOfFameEntry[]
  monthlyHof: HallOfFameEntry[]
}

type LeaderboardsResp =
  | { ok: true; data: LeaderboardsBundle }
  | { ok: false; reason: string }

function avatarUrlFrom(row: LeaderRow): string {
  const seed = encodeURIComponent(row.realName || row.playerId)
  if (!row.avatarJson) {
    return `/api/avatar?style=bigSmile&seed=${seed}`
  }
  try {
    const cfg = JSON.parse(row.avatarJson) as any
    const skin = cfg.skin || "F2D3B1"
    if (cfg.style === "avataaars") {
      const hijab = cfg.hijabColor || "262E33"
      return `/api/avatar?style=avataaars&seed=${seed}&skin=${skin}&hijabColor=${hijab}&mouth=${cfg.mouth || "default"}&eyes=${cfg.eyes || "default"}`
    }
    return `/api/avatar?style=bigSmile&seed=${seed}&skin=${skin}&hair=${cfg.hair || "short01"}&hairColor=${cfg.hairColor || "3a1a00"}&eyes=${cfg.eyes || "cheery"}`
  } catch {
    return `/api/avatar?style=bigSmile&seed=${seed}`
  }
}

function medalFor(rank: number): string {
  if (rank === 1) return "🥇"
  if (rank === 2) return "🥈"
  if (rank === 3) return "🥉"
  return ""
}

function LeaderTable({ rows, period }: { rows: LeaderRow[]; period: string }) {
  if (!rows.length) {
    return (
      <div className="rounded-2xl bg-white/5 px-6 py-8 text-center text-white/60">
        Ainda sem pontuação em {period}. Seja o primeiro!
      </div>
    )
  }
  return (
    <ol className="flex flex-col gap-2">
      {rows.map(row => {
        const podium = row.rank <= 3
        return (
          <li
            key={row.playerId}
            className={clsx(
              "flex items-center gap-3 rounded-2xl px-3 py-2 transition",
              podium
                ? "bg-gradient-to-r from-amber-400/25 via-amber-300/10 to-transparent ring-1 ring-amber-300/40"
                : "bg-white/5 hover:bg-white/10"
            )}
          >
            <div className="flex w-10 shrink-0 items-center justify-center text-lg font-bold tabular-nums">
              {medalFor(row.rank) || <span className="text-white/70">{row.rank}</span>}
            </div>
            <img
              src={avatarUrlFrom(row)}
              alt=""
              className="h-10 w-10 shrink-0 rounded-full bg-white/10 object-contain p-1"
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="truncate font-semibold text-white">{row.realName}</span>
                <TierBadge tier={row.tier} level={row.level} size="sm" />
              </div>
              <div className="text-xs text-white/50">
                {row.games} {row.games === 1 ? "partida" : "partidas"}
              </div>
            </div>
            <div className="shrink-0 text-right">
              <div className="text-lg font-bold tabular-nums text-white">
                {row.points.toLocaleString("pt-BR")}
              </div>
              <div className="text-[11px] uppercase tracking-wider text-white/40">pts</div>
            </div>
          </li>
        )
      })}
    </ol>
  )
}

function HallOfFameList({ entries, emptyMsg }: { entries: HallOfFameEntry[]; emptyMsg: string }) {
  if (!entries.length) {
    return (
      <div className="rounded-2xl bg-white/5 px-6 py-6 text-center text-sm text-white/60">
        {emptyMsg}
      </div>
    )
  }
  return (
    <div className="flex flex-col gap-3">
      {entries.map(entry => (
        <div
          key={entry.period}
          className="rounded-2xl bg-white/5 p-3 ring-1 ring-white/10"
        >
          <div className="mb-2 text-sm font-semibold text-white/90">{entry.displayLabel}</div>
          {entry.top.length === 0 ? (
            <div className="text-xs text-white/40">Sem dados</div>
          ) : (
            <ol className="flex flex-col gap-1">
              {entry.top.map(t => (
                <li
                  key={t.playerId}
                  className="flex items-center gap-2 text-sm"
                >
                  <span className="w-6 text-center">{medalFor(t.rank)}</span>
                  <span className="flex-1 truncate text-white">{t.realName}</span>
                  <span className="tabular-nums font-semibold text-amber-200">
                    {t.points.toLocaleString("pt-BR")}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </div>
      ))}
    </div>
  )
}

export default function RankingPage() {
  const router = useRouter()
  const { socket, isConnected, connect } = useSocket()
  const [data, setData] = useState<LeaderboardsBundle | null>(null)
  const [error, setError] = useState<string>("")
  const [tab, setTab] = useState<"week" | "month">("week")

  useEffect(() => {
    if (!isConnected) connect()
  }, [isConnected, connect])

  useEffect(() => {
    if (!socket) return
    const onData = (resp: LeaderboardsResp) => {
      if (resp.ok) {
        setData(resp.data)
        setError("")
      } else {
        setError("Não foi possível carregar o ranking.")
      }
    }
    (socket as any).on("leaderboards:data", onData)
    if (isConnected) (socket as any).emit("leaderboards:get")
    return () => {
      (socket as any).off("leaderboards:data", onData)
    }
  }, [socket, isConnected])

  const active = useMemo(() => {
    if (!data) return null
    return tab === "week" ? data.week : data.month
  }, [data, tab])

  return (
    <section className="relative min-h-screen w-full bg-gradient-angel px-4 py-8">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 text-white">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight">Ranking</h1>
            <p className="text-sm text-white/60">
              Somente partidas em modo clássico contam. Modo solo conta para XP mas não para ranking.
            </p>
          </div>
          <Button onClick={() => router.push("/")}>Voltar</Button>
        </header>

        {error && (
          <div className="rounded-2xl bg-red-500/20 px-4 py-3 text-sm text-red-100 ring-1 ring-red-400/40">
            {error}
          </div>
        )}

        {!data && !error && (
          <div className="rounded-2xl bg-white/5 px-6 py-10 text-center text-white/60">
            Carregando…
          </div>
        )}

        {data && (
          <>
            <div className="flex gap-2">
              <button
                onClick={() => setTab("week")}
                className={clsx(
                  "flex-1 rounded-2xl px-4 py-3 text-sm font-semibold transition",
                  tab === "week"
                    ? "bg-white text-indigo-900 shadow-lg"
                    : "bg-white/10 text-white/80 hover:bg-white/20"
                )}
              >
                Semana · {data.week.label}
              </button>
              <button
                onClick={() => setTab("month")}
                className={clsx(
                  "flex-1 rounded-2xl px-4 py-3 text-sm font-semibold transition",
                  tab === "month"
                    ? "bg-white text-indigo-900 shadow-lg"
                    : "bg-white/10 text-white/80 hover:bg-white/20"
                )}
              >
                Mês · {data.month.label}
              </button>
            </div>

            <div className="rounded-3xl bg-black/30 p-4 ring-1 ring-white/10 backdrop-blur-sm">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-lg font-bold">
                  Top {active?.top.length ?? 0} · {active?.label}
                </h2>
              </div>
              <LeaderTable
                rows={active?.top ?? []}
                period={tab === "week" ? "esta semana" : "este mês"}
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <h3 className="mb-2 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-amber-200">
                  🏆 Hall da Fama semanal
                </h3>
                <HallOfFameList
                  entries={data.weeklyHof}
                  emptyMsg="Ainda sem semanas encerradas."
                />
              </div>
              <div>
                <h3 className="mb-2 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-amber-200">
                  🏆 Hall da Fama mensal
                </h3>
                <HallOfFameList
                  entries={data.monthlyHof}
                  emptyMsg="Ainda sem meses encerrados."
                />
              </div>
            </div>
          </>
        )}
      </div>
    </section>
  )
}
