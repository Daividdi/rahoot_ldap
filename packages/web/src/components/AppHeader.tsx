"use client"

import logo from "@rahoot/web/assets/logo.svg"
import Image from "next/image"

type Props = {
  /** Visual size preset. "sm" is default for in-app screens; "lg" is for splash/auth. */
  size?: "sm" | "lg"
  /** Optional extra top/bottom spacing. */
  className?: string
}

/**
 * Aditek + Rahoot logos stacked and centered.
 * Reusable across /avatar, /ranking, manager, solo, game-join.
 */
export default function AppHeader({ size = "sm", className }: Props) {
  const isLg = size === "lg"
  const aditekH = isLg ? 24 : 20
  const rahootH = isLg ? 72 : 44
  const aditekOpacity = isLg ? 0.5 : 0.5
  return (
    <div className={"flex flex-col items-center shrink-0 " + (className || "")}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/angeltreat-logo.png"
        alt="Aditek"
        style={{ height: aditekH, width: "auto", marginBottom: 4, filter: "brightness(0) invert(1)" }}
      />
      <Image
        src={logo}
        className="drop-shadow-[0_5px_5px_rgba(0,0,0,0.3)]"
        alt="Rahoot!"
        style={{ height: rahootH, width: "auto" }}
        priority
      />
    </div>
  )
}
