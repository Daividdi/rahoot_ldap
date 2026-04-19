"use client"

import { QuizzWithId } from "@rahoot/common/types/game"
import { useCallback, useEffect, useRef, useState, Component, PropsWithChildren } from "react"
import clsx from "clsx"

import SelectQuizz from "@rahoot/web/components/game/create/SelectQuizz"
import ManagerAnalytics from "@rahoot/web/components/game/create/ManagerAnalytics"
import ManagerPlayers from "@rahoot/web/components/game/create/ManagerPlayers"

type Props = {
  quizzList: QuizzWithId[]
  onSelect: (_id: string) => void
}

type Tab = "dashboard" | "quizzes" | "players"

// Simple error boundary
class ErrorBoundary extends Component<PropsWithChildren<{ fallback: string }>, { hasError: boolean; error: string }> {
  constructor(props: any) {
    super(props)
    this.state = { hasError: false, error: "" }
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error: error.message }
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="rounded-xl bg-red-50 p-6 text-center">
          <p className="text-sm font-semibold text-red-600">Something went wrong loading {this.props.fallback}</p>
          <p className="mt-1 text-xs text-red-400">{this.state.error}</p>
          <button
            onClick={() => this.setState({ hasError: false, error: "" })}
            className="mt-3 rounded-lg bg-red-100 px-4 py-2 text-xs font-semibold text-red-600 hover:bg-red-200"
          >
            Try again
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

const ManagerDashboard = ({ quizzList, onSelect }: Props) => {
  const [activeTab, setActiveTab] = useState<Tab>("dashboard")
  const [localList, setLocalList] = useState<any[]>(quizzList)
  const [regionFilter, setRegionFilter] = useState<"all" | "BR" | "MY">("all")
  const initializedRef = useRef(false)

  useEffect(() => {
    setLocalList(quizzList)
  }, [quizzList])

  if (!initializedRef.current && quizzList.length > 0) {
    initializedRef.current = true
  }

  const handleListChange = useCallback((newList: any[]) => {
    setLocalList(newList)
  }, [])

  const switchTab = useCallback((tab: Tab) => {
    setActiveTab(tab)
  }, [])

  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: "dashboard", label: "Dashboard" },
    { id: "quizzes", label: "Quizzes", count: localList.length },
    { id: "players", label: "Players" },
  ]

  // Dynamically import heavy components only when needed
  const renderTabContent = () => {
    if (activeTab === "quizzes") {
      return (
        <ErrorBoundary fallback="Quizzes">
          <SelectQuizz
            quizzList={localList}
            onSelect={onSelect}
            onListChange={handleListChange}
            regionFilter={regionFilter}
          />
        </ErrorBoundary>
      )
    }

    if (activeTab === "dashboard") {
      return (
        <ErrorBoundary fallback="Dashboard">
          <ManagerAnalytics quizzList={localList} initialRegion={regionFilter} />
        </ErrorBoundary>
      )
    }

    if (activeTab === "players") {
      return (
        <ErrorBoundary fallback="Players">
          <ManagerPlayers quizzList={localList} regionFilter={regionFilter} />
        </ErrorBoundary>
      )
    }

    return null
  }

  return (
    <div className="z-10 flex w-full max-w-5xl flex-col rounded-2xl overflow-hidden">
      {/* Header */}
      <div className="bg-primary px-5 pt-4 shrink-0">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-white tracking-tight">
              Rahoot<span className="text-accent">!</span>{" "}
              <span className="text-white/70 text-lg font-normal">
                {activeTab === "dashboard" ? "Analytics" : activeTab === "quizzes" ? "Quizzes" : "Players"}
              </span>
            </h1>
            <div className="mt-1 flex gap-1">
              {(["all", "BR", "MY"] as const).map(r => (
                <button key={r} onClick={() => setRegionFilter(r)}
                  className={clsx("rounded-full px-2.5 py-0.5 text-[10px] font-semibold transition-colors",
                    regionFilter === r ? "bg-white text-primary" : "bg-white/15 text-white/60 hover:bg-white/25")}>
                  {r === "all" ? "All" : r}
                </button>
              ))}
            </div>
          </div>
          <div className="flex gap-2">
            {activeTab !== "quizzes" && (
              <button
                onClick={() => switchTab("quizzes")}
                className="rounded-lg bg-white/12 px-4 py-2 text-xs font-semibold text-white hover:bg-white/20 transition-colors"
              >
                My quizzes
              </button>
            )}
          </div>
        </div>

        <div className="flex gap-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => switchTab(tab.id)}
              className={clsx(
                "rounded-t-lg px-4 py-2 text-sm font-semibold transition-colors",
                activeTab === tab.id
                  ? "bg-[#f5f6f8] text-gray-800"
                  : "bg-white/10 text-white/70 hover:bg-white/15 hover:text-white"
              )}
            >
              {tab.label}
              {tab.count !== undefined && (
                <span className="ml-1.5 text-xs opacity-60">({tab.count})</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Body */}
      <div className="bg-[#f5f6f8] p-5 min-h-[400px]">
        {renderTabContent()}
      </div>
    </div>
  )
}

export default ManagerDashboard
