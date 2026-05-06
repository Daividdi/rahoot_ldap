"use client"
import { useMemo } from "react"
import dynamic from "next/dynamic"

const VRMViewer = dynamic(() => import("@rahoot/web/components/avatar/VRMViewer"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center">
      <div className="h-16 w-16 animate-pulse rounded-full bg-gray-100" />
    </div>
  ),
})

const ANIMS = [
  "/api/avatar3d/animations/Bored.fbx",
  "/api/avatar3d/animations/FightIdle.fbx",
  "/api/avatar3d/animations/OffensiveIdle.fbx",
  "/api/avatar3d/animations/Looking.fbx",
  "/api/avatar3d/animations/LookingAround.fbx",
  "/api/avatar3d/animations/TextingWhileStanding.fbx",
  "/api/avatar3d/animations/SearchingFilesHigh.fbx",
  "/api/avatar3d/animations/CrossJumps.fbx",
  "/api/avatar3d/animations/MagicSpellCasting.fbx",
]

type Props = {
  is3d: boolean
  vrmPath?: string | null
  avatarUrl?: string
  name: string
}

export default function AvatarDisplay({ is3d, vrmPath, avatarUrl, name }: Props) {
  const randomAnim = useMemo(
    () => ANIMS[Math.floor(Math.random() * ANIMS.length)],
    []
  )

  if (is3d && vrmPath) {
    return (
      <VRMViewer
        vrmUrl={`/api/avatar3d/${vrmPath}`}
        animationUrl={randomAnim}
        interactive={false}
        className="h-full w-full"
        background="transparent"
      />
    )
  }

  if (avatarUrl) {
    return (
      <div className="flex h-full items-end justify-center pb-5">
        <img
          src={avatarUrl}
          alt={name}
          className="avatar-home-float"
          style={{
            height: 195,
            width: 195,
            borderRadius: 28,
            objectFit: "cover",
            boxShadow: "0 16px 40px rgba(0,0,0,0.12), 0 4px 8px rgba(0,0,0,0.06)",
          }}
        />
      </div>
    )
  }

  return (
    <div className="flex h-full items-center justify-center">
      <div
        className="avatar-home-float flex items-center justify-center font-bold"
        style={{
          width: 150,
          height: 150,
          borderRadius: 30,
          background: "linear-gradient(135deg, rgba(0,158,223,0.12), rgba(0,158,223,0.04))",
          fontSize: 68,
          color: "rgba(0,158,223,0.35)",
          boxShadow: "0 16px 40px rgba(0,0,0,0.06)",
        }}
      >
        {name.charAt(0).toUpperCase()}
      </div>
    </div>
  )
}
