"use client"

import logo from "@rahoot/web/assets/logo.svg"
import Loader from "@rahoot/web/components/Loader"
import { useSocket } from "@rahoot/web/contexts/socketProvider"
import Image from "next/image"
import { usePathname } from "next/navigation"
import { PropsWithChildren, useEffect } from "react"

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

  if (isManager) {
    if (!isConnected) {
      return (
        <section className="bg-gradient-angel min-h-dvh flex flex-col items-center justify-center">
          <div className="anim-fade-in-up flex flex-col items-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/angeltreat-logo.png"
              alt="Angel TREAT"
              style={{ height: 28, width: 'auto', marginBottom: 8, filter: 'brightness(0) invert(1)' }}
            />
            <Image
              src={logo}
              className="drop-shadow-[0_5px_5px_rgba(0,0,0,0.3)]"
              alt="Rahoot!"
              style={{ height: 80, width: 'auto', marginBottom: 24 }}
            />
            <Loader className="h-16 anim-pulse-soft" />
            <h2 className="mt-3 text-center text-xl font-bold text-white/80 md:text-2xl">
              Connecting...
            </h2>
          </div>
        </section>
      )
    }
    return <>{children}</>
  }

  return (
    <section className="bg-gradient-angel relative min-h-dvh flex flex-col">
      <BackgroundElements />

      {!isConnected ? (
        <div className="flex flex-1 flex-col items-center justify-center" style={{ zIndex: 1 }}>
          <div className="anim-fade-in-up flex flex-col items-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/angeltreat-logo.png"
              alt="Angel TREAT"
              style={{ height: 28, width: 'auto', marginBottom: 8, filter: 'brightness(0) invert(1)' }}
            />
            <Image
              src={logo}
              className="drop-shadow-[0_5px_5px_rgba(0,0,0,0.3)]"
              alt="Rahoot!"
              style={{ height: 80, width: 'auto', marginBottom: 24 }}
            />
            <Loader className="h-16 anim-pulse-soft" />
            <h2 className="mt-3 text-center text-xl font-bold text-white/80 md:text-2xl">
              Connecting...
            </h2>
          </div>
        </div>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center py-5 px-4" style={{ zIndex: 1 }}>
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
    </section>
  )
}

export default AuthLayout
