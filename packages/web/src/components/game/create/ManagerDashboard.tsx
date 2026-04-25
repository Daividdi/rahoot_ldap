"use client"

import { QuizzWithId } from "@rahoot/common/types/game"
import { useCallback, useEffect, useState, Component, PropsWithChildren } from "react"

import ManagerAnalytics from "@rahoot/web/components/game/create/ManagerAnalytics"

type Props = {
  quizzList: QuizzWithId[]
  onSelect: (_id: string) => void
}

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
  const [localList, setLocalList] = useState<any[]>(quizzList)

  useEffect(() => { setLocalList(quizzList) }, [quizzList])

  const handleListChange = useCallback((newList: any[]) => {
    setLocalList(newList)
  }, [])

  return (
    <div className="z-10 flex w-full flex-col">
      <ErrorBoundary fallback="Dashboard">
        <ManagerAnalytics
          quizzList={localList}
          onSelect={onSelect}
          onListChange={handleListChange}
        />
      </ErrorBoundary>
    </div>
  )
}

export default ManagerDashboard
