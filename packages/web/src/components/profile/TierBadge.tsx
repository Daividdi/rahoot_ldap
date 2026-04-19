"use client"

import clsx from "clsx"

type TierId = "bronze" | "silver" | "gold" | "platinum" | "mythic"

const TIER_META: Record<TierId, { label: string; gradient: string; glow: string; emoji: string }> = {
  bronze:   { label: "Bronze",   emoji: "🥉", gradient: "from-[#a05a2c] to-[#e3a06a]", glow: "shadow-[0_0_0_3px_rgba(205,127,50,0.15)]" },
  silver:   { label: "Silver",   emoji: "🥈", gradient: "from-[#7e8489] to-[#e6e6e6]", glow: "shadow-[0_0_0_3px_rgba(192,192,192,0.20)]" },
  gold:     { label: "Gold",     emoji: "🏆", gradient: "from-[#b8860b] to-[#ffef8a]", glow: "shadow-[0_0_0_3px_rgba(255,215,0,0.25)]" },
  platinum: { label: "Platinum", emoji: "💎", gradient: "from-[#4ec2e0] to-[#e9fbff]", glow: "shadow-[0_0_0_3px_rgba(185,242,255,0.35)]" },
  mythic:   { label: "Mythic",   emoji: "👑", gradient: "from-[#a11dc6] to-[#ff9aeb]", glow: "shadow-[0_0_0_3px_rgba(255,79,216,0.30)]" },
}

type Props = {
  tier: TierId
  level: number
  size?: "sm" | "md" | "lg"
}

export default function TierBadge({ tier, level, size = "md" }: Props) {
  const meta = TIER_META[tier] ?? TIER_META.bronze
  const dims = size === "lg" ? "px-4 py-1.5 text-sm" : size === "sm" ? "px-2 py-0.5 text-[10px]" : "px-3 py-1 text-xs"
  return (
    <div
      className={clsx(
        "inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r font-bold text-white ring-2 ring-white/60",
        meta.gradient, meta.glow, dims
      )}
      title={`${meta.label} — Nível ${level}`}
    >
      <span aria-hidden>{meta.emoji}</span>
      <span>{meta.label}</span>
      <span className="opacity-80">·</span>
      <span className="tabular-nums">Lv {level}</span>
    </div>
  )
}
