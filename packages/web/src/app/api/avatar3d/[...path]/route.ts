import { NextRequest, NextResponse } from "next/server"
import { createReadStream, statSync, existsSync } from "node:fs"
import { resolve, extname, join } from "node:path"
import { Readable } from "node:stream"

const ROOT = process.env.AVATARS_3D_ROOT || "/app/config/avatars-3d"

const MIME: Record<string, string> = {
  ".vrm": "model/gltf-binary",
  ".glb": "model/gltf-binary",
  ".fbx": "application/octet-stream",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".json": "application/json",
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params
  if (!path?.length) return new NextResponse("not found", { status: 404 })

  const rel = path.join("/")
  const abs = resolve(ROOT, rel)
  if (!abs.startsWith(resolve(ROOT) + "/") && abs !== resolve(ROOT)) {
    return new NextResponse("forbidden", { status: 403 })
  }
  if (!existsSync(abs)) return new NextResponse("not found", { status: 404 })

  const stat = statSync(abs)
  const mime = MIME[extname(abs).toLowerCase()] || "application/octet-stream"
  const stream = createReadStream(abs)

  return new NextResponse(Readable.toWeb(stream) as any, {
    headers: {
      "Content-Type": mime,
      "Content-Length": String(stat.size),
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  })
}
