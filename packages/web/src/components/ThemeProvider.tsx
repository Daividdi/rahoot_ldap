"use client"

import { useEffect } from "react"

const THEME_KEY = "rahoot_theme"

/**
 * Reads selected theme from localStorage and applies it as `data-theme` on
 * <html>. globals.css contains per-theme overrides for .bg-gradient-angel.
 *
 * Mount once near the root. Does NOT render UI.
 */
export default function ThemeProvider() {
  useEffect(() => {
    const apply = (theme: string | null) => {
      const el = document.documentElement
      if (theme && theme !== "default") {
        el.setAttribute("data-theme", theme)
      } else {
        el.removeAttribute("data-theme")
      }
    }
    try { apply(localStorage.getItem(THEME_KEY)) } catch {}

    const onStorage = (e: StorageEvent) => {
      if (e.key === THEME_KEY) apply(e.newValue)
    }
    const onCustom = (e: Event) => {
      const ce = e as CustomEvent<string | null>
      apply(ce.detail ?? null)
    }
    window.addEventListener("storage", onStorage)
    window.addEventListener("rahoot:theme", onCustom as EventListener)
    return () => {
      window.removeEventListener("storage", onStorage)
      window.removeEventListener("rahoot:theme", onCustom as EventListener)
    }
  }, [])

  return null
}

export function setTheme(theme: string) {
  try { localStorage.setItem(THEME_KEY, theme) } catch {}
  window.dispatchEvent(new CustomEvent("rahoot:theme", { detail: theme }))
}

export function getTheme(): string {
  try { return localStorage.getItem(THEME_KEY) || "default" } catch { return "default" }
}

export const THEMES: { id: string; label: string; swatch: string }[] = [
  { id: "default", label: "Rahoot (Blue)", swatch: "linear-gradient(135deg,#0b2540,#009edf 60%,#f0b05a)" },
  { id: "studio",  label: "Studio",        swatch: "linear-gradient(180deg,#2b2746,#4c3f79 60%,#1a1731)" },
  { id: "sky",     label: "Sky",           swatch: "linear-gradient(180deg,#7ec8ff,#bae1ff 55%,#fff7d6)" },
  { id: "sunset",  label: "Sunset",        swatch: "linear-gradient(180deg,#ff9a6b,#ff5f8f 55%,#6f3d9e)" },
  { id: "forest",  label: "Forest",        swatch: "linear-gradient(180deg,#2e5d4b,#68a683 55%,#c6ebc5)" },
  { id: "night",   label: "Night",         swatch: "radial-gradient(ellipse at 50% 10%,#3b2f75,#110a2b 60%,#000)" },
]
