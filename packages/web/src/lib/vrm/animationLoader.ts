// Mixamo-to-VRM animation retargeter. Ported from ToxSam/osa-gallery (MIT)
// with the localhost proxy layer removed — we always serve locally.

import * as THREE from "three"
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js"
import type { VRM } from "@pixiv/three-vrm"
import { mixamoVRMRigMap } from "./mixamoRigMap"

export async function loadMixamoAnimation(url: string, vrm: VRM): Promise<THREE.AnimationClip> {
  const loader = new FBXLoader()
  const asset = await new Promise<THREE.Group>((resolve, reject) => {
    loader.load(url, resolve, undefined, reject)
  })

  const clip = THREE.AnimationClip.findByName(asset.animations, "mixamo.com")
  if (!clip) throw new Error("No Mixamo animation found in FBX")

  const tracks: THREE.KeyframeTrack[] = []
  const restRotationInverse = new THREE.Quaternion()
  const parentRestWorldRotation = new THREE.Quaternion()
  const _quatA = new THREE.Quaternion()
  const _vec3 = new THREE.Vector3()

  const hipsNode = asset.getObjectByName("mixamorigHips")
  if (!hipsNode) throw new Error("No hips bone in animation")
  const motionHipsHeight = hipsNode.position.y
  const hipsBone = vrm.humanoid?.getNormalizedBoneNode("hips") ?? null
  const vrmHipsY = hipsBone ? hipsBone.getWorldPosition(_vec3).y : null
  const vrmRootY = vrm.scene.getWorldPosition(_vec3).y
  if (vrmHipsY == null || !isFinite(vrmRootY)) throw new Error("VRM hips position unknown")
  const vrmHipsHeight = Math.abs(vrmHipsY - vrmRootY)
  const hipsPositionScale = vrmHipsHeight / motionHipsHeight

  const metaV = (vrm.meta as any)?.metaVersion ?? null

  clip.tracks.forEach(track => {
    const parts = track.name.split(".")
    const mixamoName = parts[0]
    const prop = parts[1]
    const vrmBoneName = mixamoVRMRigMap[mixamoName]
    if (!vrmBoneName) return
    const vrmNode = vrm.humanoid?.getNormalizedBoneNode(vrmBoneName as any)
    const vrmNodeName = vrmNode?.name
    const mixamoNode = asset.getObjectByName(mixamoName)
    if (!vrmNodeName || !mixamoNode || !mixamoNode.parent) return

    mixamoNode.getWorldQuaternion(restRotationInverse).invert()
    mixamoNode.parent.getWorldQuaternion(parentRestWorldRotation)

    if (track instanceof THREE.QuaternionKeyframeTrack) {
      const values = track.values.slice() as Float32Array
      for (let i = 0; i < values.length; i += 4) {
        const flat = Array.from(values.slice(i, i + 4))
        _quatA.fromArray(flat)
        _quatA.premultiply(parentRestWorldRotation).multiply(restRotationInverse)
        const arr: number[] = []
        _quatA.toArray(arr)
        for (let j = 0; j < 4; j++) values[i + j] = arr[j]
      }
      const final = new Float32Array(values.length)
      for (let i = 0; i < values.length; i++) {
        final[i] = metaV === "0" && i % 2 === 0 ? -values[i] : values[i]
      }
      tracks.push(new THREE.QuaternionKeyframeTrack(`${vrmNodeName}.${prop}`, track.times as any, final as any))
    } else if (track instanceof THREE.VectorKeyframeTrack) {
      const final = new Float32Array(track.values.length)
      for (let i = 0; i < track.values.length; i++) {
        const v = metaV === "0" && i % 3 !== 1 ? -track.values[i] : track.values[i]
        final[i] = v * hipsPositionScale
      }
      tracks.push(new THREE.VectorKeyframeTrack(`${vrmNodeName}.${prop}`, track.times as any, final as any))
    }
  })

  return new THREE.AnimationClip("vrmAnimation", clip.duration, tracks)
}
