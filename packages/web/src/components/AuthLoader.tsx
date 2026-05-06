"use client"
import { useEffect, useState } from "react"
import Image from "next/image"
import logo from "@rahoot/web/assets/logo.svg"

type Props = { label?: string }

export default function AuthLoader({ label = "Loading" }: Props) {
  const [dots, setDots] = useState("")

  useEffect(() => {
    const id = setInterval(() => setDots(d => (d.length >= 3 ? "" : d + ".")), 480)
    return () => clearInterval(id)
  }, [])

  // circumferences: outer r=34 → ~213.6, inner r=23 → ~144.5
  const outerC = 2 * Math.PI * 34
  const innerC = 2 * Math.PI * 23

  return (
    <div className="anim-fade-in-up flex flex-col items-center" style={{ gap: 0 }}>
      {/* Brand logo */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/angeltreat-logo.png"
        alt="Angel TREAT"
        style={{ height: 22, width: "auto", marginBottom: 10, filter: "brightness(0) invert(1)", opacity: 0.8 }}
      />

      {/* Logo + glow stack */}
      <div style={{ position: "relative", display: "flex", flexDirection: "column", alignItems: "center", marginBottom: 30 }}>
        {/* Glow halo behind logo */}
        <div
          className="auth-glow-breathe"
          style={{
            position: "absolute",
            bottom: -10,
            width: 200,
            height: 36,
            borderRadius: "50%",
            background: "radial-gradient(ellipse at center, rgba(255,255,255,0.55) 0%, transparent 72%)",
            pointerEvents: "none",
          }}
        />
        <Image
          src={logo}
          alt="Rahoot!"
          className="auth-logo-float"
          style={{ height: 72, width: "auto" }}
        />
      </div>

      {/* Dual-ring SVG spinner */}
      <div style={{ marginBottom: 22 }}>
        <svg width="72" height="72" viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg">
          {/* Outer track */}
          <circle cx="40" cy="40" r="34" fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="5" />
          {/* Outer arc — CW */}
          <g className="auth-spin-cw">
            <circle
              cx="40" cy="40" r="34"
              fill="none"
              stroke="rgba(255,255,255,0.95)"
              strokeWidth="5"
              strokeLinecap="round"
              strokeDasharray={`${outerC * 0.28} ${outerC * 0.72}`}
            />
          </g>

          {/* Inner track */}
          <circle cx="40" cy="40" r="23" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="3.5" />
          {/* Inner arc — CCW */}
          <g className="auth-spin-ccw">
            <circle
              cx="40" cy="40" r="23"
              fill="none"
              stroke="rgba(255,255,255,0.55)"
              strokeWidth="3.5"
              strokeLinecap="round"
              strokeDasharray={`${innerC * 0.35} ${innerC * 0.65}`}
            />
          </g>
        </svg>
      </div>

      {/* Label */}
      <p
        className="auth-label-pulse"
        style={{
          fontSize: 15,
          fontWeight: 600,
          color: "rgba(255,255,255,0.85)",
          letterSpacing: "0.04em",
          fontFamily: "inherit",
        }}
      >
        {label}
        <span style={{ display: "inline-block", width: "1.6ch", textAlign: "left" }}>{dots}</span>
      </p>
    </div>
  )
}
