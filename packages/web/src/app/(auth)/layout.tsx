"use client"

import logo from "@rahoot/web/assets/logo.svg"
import Loader from "@rahoot/web/components/Loader"
import AuthLoader from "@rahoot/web/components/AuthLoader"
import { useSocket } from "@rahoot/web/contexts/socketProvider"
import Image from "next/image"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { PropsWithChildren, useEffect, useState } from "react"

const BackgroundElements = () => (
  <div className="fixed inset-0 pointer-events-none" style={{ zIndex: 0 }}>
    <div
      className="absolute -top-[15vmin] -left-[15vmin] min-h-[75vmin] min-w-[75vmin] rounded-full animate-float-circle"
      style={{ background: 'rgba(255,255,255,0.1)' }}
    />
    <div className="absolute -top-[20vmin] -right-[25vmin] animate-float-triangle">
      <div
        className="w-0 h-0"
        style={{
          borderLeft: '55vmin solid transparent',
          borderRight: '55vmin solid transparent',
          borderBottom: '110vmin solid rgba(255,255,255,0.08)'
        }}
      />
    </div>
    <div
      className="absolute -bottom-[15vmin] -left-[15vmin] min-h-[75vmin] min-w-[75vmin] animate-float-square"
      style={{ background: 'rgba(255,255,255,0.08)' }}
    />
    <div
      className="absolute -bottom-[15vmin] -right-[15vmin] min-h-[75vmin] min-w-[75vmin] rotate-45 animate-float-diamond"
      style={{ background: 'rgba(255,255,255,0.07)' }}
    />
    <div
      className="absolute top-[30%] right-[5%] min-h-[20vmin] min-w-[20vmin] rounded-full animate-float-circle"
      style={{ background: 'rgba(255,255,255,0.06)', animationDelay: '2s' }}
    />
    <div
      className="absolute top-[60%] left-[8%] min-h-[12vmin] min-w-[12vmin] rotate-45 animate-float-diamond"
      style={{ background: 'rgba(255,255,255,0.05)', animationDelay: '3s' }}
    />
  </div>
)

const AuthLayout = ({ children }: PropsWithChildren) => {
  const { isConnected, connect } = useSocket()
  const pathname = usePathname()
  const isManager = pathname === "/manager"

  useEffect(() => {
    if (!isConnected) {
      connect()
    }
  }, [connect, isConnected])

  const [splashDone, setSplashDone] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setSplashDone(true), 2000)
    return () => clearTimeout(t)
  }, [])

  if (isManager) {
    if (!isConnected) {
      return (
        <section className="bg-gradient-angel min-h-dvh flex flex-col items-center justify-center">
          <AuthLoader label="Connecting" />
        </section>
      )
    }
    return <>{children}</>
  }

  return (
    <section className="bg-gradient-angel relative min-h-dvh flex flex-col">
      <BackgroundElements />

      {(!splashDone || !isConnected) ? (
        <div className="flex flex-1 flex-col items-center justify-center" style={{ zIndex: 1 }}>
          <AuthLoader label={!isConnected ? "Connecting" : "Loading"} />
        </div>
      ) : (
        <div key="content" className="anim-fade-in-up flex flex-1 flex-col items-center justify-center py-5 px-4" style={{ zIndex: 1 }}>
          <div className="mb-3 flex flex-col items-center shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/angeltreat-logo.png"
              alt="Angel TREAT"
              style={{ height: 24, width: 'auto', marginBottom: 6, filter: 'brightness(0) invert(1)' }}
            />
            <Image
              src={logo}
              className="drop-shadow-[0_5px_5px_rgba(0,0,0,0.3)]"
              alt="Rahoot!"
              style={{ height: 56, width: 'auto', marginBottom: 16 }}
            />
          </div>
          {children}
        </div>
      )}

      {/* Discreet admin access — bottom-right corner */}
      <Link
        href="/manager"
        title="Acesso administrador"
        aria-label="Acesso administrador"
        className="fixed bottom-3 right-3 flex h-9 w-9 items-center justify-center rounded-full text-white/35 transition-all duration-200 hover:bg-white/15 hover:text-white focus-visible:bg-white/15 focus-visible:text-white"
        style={{ zIndex: 5 }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 10.99h7c-.53 4.12-3.28 7.79-7 8.94V12H5V6.3l7-3.11v8.8z"/>
        </svg>
      </Link>
    </section>
  )
}

export default AuthLayout
