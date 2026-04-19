"use client"

import clsx from "clsx"

type TierId = "bronze" | "silver" | "gold" | "platinum" | "mythic"

const TIER_GRADIENTS: Record<TierId, string> = {
  bronze:   "from-[#a05a2c] via-[#cd7f32] to-[#e3a06a]",
  silver:   "from-[#7e8489] via-[#c0c0c0] to-[#e6e6e6]",
  gold:     "from-[#b8860b] via-[#ffd700] to-[#ffef8a]",
  platinum: "from-[#4ec2e0] via-[#b9f2ff] to-[#e9fbff]",
  mythic:   "from-[#a11dc6] via-[#ff4fd8] to-[#ff9aeb]",
}

type Props = {
  level: number
  tier: TierId
  xp: number
  xpIntoLevel: number
  xpNeededForNext: number
  pct: number  // 0..1
  compact?: boolean
}

export default function XpBar({ level, tier, xp, xpIntoLevel, xpNeededForNext, pct, compact }: Props) {
  const pctClamped = Math.max(0, Math.min(1, pct))
  const gradient = TIER_GRADIENTS[tier] ?? TIER_GRADIENTS.bronze

  return (
    <div className={clsx("w-full", compact ? "gap-1" : "gap-2", "flex flex-col")}>
      <div className={clsx("flex items-center justify-between", compact ? "text-[10px]" : "text-xs")}>
        <span className="font-bold text-gray-600">Nível {level}</span>
        <span className="tabular-nums text-gray-400">
          {xpIntoLevel.toLocaleString("pt-BR")} / {(xpIntoLevel + xpNeededForNext).toLocaleString("pt-BR")} XP
        </span>
      </div>
      <div className={clsx(
        "relative overflow-hidden rounded-full bg-gray-200 ring-1 ring-inset ring-black/5",
        compact ? "h-2" : "h-3"
      )}>
        <div
          className={clsx("absolute inset-y-0 left-0 bg-gradient-to-r shadow-inner transition-[width] duration-700", gradient)}
          style={{ width: `${pctClamped * 100}%` }}
        />
        <div
          className="absolute inset-y-0 left-0 bg-white/25 transition-[width] duration-700"
          style={{ width: `${pctClamped * 100}%`, mixBlendMode: "overlay" }}
        />
      </div>
      {!compact && (
        <p className="text-[10px] text-gray-400">
          Faltam <span className="font-bold text-gray-600 tabular-nums">{xpNeededForNext.toLocaleString("pt-BR")}</span> XP para o nível {level + 1}
        </p>
      )}
    </div>
  )
}
