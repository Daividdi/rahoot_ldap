"use client"

import { useEffect, useRef } from "react"
import * as THREE from "three"
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js"
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js"
import { VRMLoaderPlugin, VRMUtils, type VRM } from "@pixiv/three-vrm"
import { loadMixamoAnimation } from "@rahoot/web/lib/vrm/animationLoader"

type Props = {
  vrmUrl: string
  animationUrl?: string | null
  autoRotate?: boolean
  className?: string
  background?: string
}

export default function VRMViewer({
  vrmUrl,
  animationUrl = null,
  autoRotate = false,
  className,
  background = "transparent",
}: Props) {
  const hostRef = useRef<HTMLDivElement>(null)
  const stateRef = useRef<{
    renderer?: THREE.WebGLRenderer
    scene?: THREE.Scene
    camera?: THREE.PerspectiveCamera
    controls?: OrbitControls
    mixer?: THREE.AnimationMixer
    vrm?: VRM
    raf?: number
    clock: THREE.Clock
    disposed: boolean
  }>({ clock: new THREE.Clock(), disposed: false })

  // One-time setup per mount
  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const st = stateRef.current
    st.disposed = false

    const w = host.clientWidth || 320
    const h = host.clientHeight || 360
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setSize(w, h)
    renderer.outputColorSpace = THREE.SRGBColorSpace
    host.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    if (background !== "transparent") scene.background = new THREE.Color(background)
    const camera = new THREE.PerspectiveCamera(30, w / h, 0.1, 20)
    camera.position.set(0, 1.4, 3)
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.target.set(0, 1.3, 0)
    controls.enableDamping = true
    controls.minDistance = 1.5
    controls.maxDistance = 5
    controls.minPolarAngle = Math.PI / 3
    controls.maxPolarAngle = Math.PI / 1.8
    controls.autoRotate = autoRotate
    controls.autoRotateSpeed = 1.2
    controls.update()

    const key = new THREE.DirectionalLight(0xffffff, 2.2)
    key.position.set(1, 2, 1.5)
    const fill = new THREE.DirectionalLight(0xffffff, 0.7)
    fill.position.set(-1.5, 1, -1)
    const ambient = new THREE.AmbientLight(0xffffff, 0.6)
    scene.add(key, fill, ambient)

    st.renderer = renderer
    st.scene = scene
    st.camera = camera
    st.controls = controls

    const onResize = () => {
      if (!st.renderer || !st.camera) return
      const W = host.clientWidth || 320
      const H = host.clientHeight || 360
      st.renderer.setSize(W, H)
      st.camera.aspect = W / H
      st.camera.updateProjectionMatrix()
    }
    window.addEventListener("resize", onResize)
    const ro = new ResizeObserver(onResize)
    ro.observe(host)

    const tick = () => {
      if (st.disposed) return
      const dt = st.clock.getDelta()
      if (st.mixer) st.mixer.update(dt)
      if (st.vrm) st.vrm.update(dt)
      if (st.controls) st.controls.update()
      if (st.renderer && st.scene && st.camera) st.renderer.render(st.scene, st.camera)
      st.raf = requestAnimationFrame(tick)
    }
    st.raf = requestAnimationFrame(tick)

    return () => {
      st.disposed = true
      window.removeEventListener("resize", onResize)
      ro.disconnect()
      if (st.raf) cancelAnimationFrame(st.raf)
      if (st.controls) st.controls.dispose()
      if (st.vrm) {
        VRMUtils.deepDispose(st.vrm.scene)
        st.scene?.remove(st.vrm.scene)
      }
      st.mixer = undefined
      st.vrm = undefined
      renderer.dispose()
      if (renderer.domElement.parentNode === host) host.removeChild(renderer.domElement)
    }
  }, [])

  // Load VRM whenever vrmUrl changes
  useEffect(() => {
    const st = stateRef.current
    if (!st.scene) return
    let cancelled = false

    if (st.vrm) {
      VRMUtils.deepDispose(st.vrm.scene)
      st.scene.remove(st.vrm.scene)
      st.vrm = undefined
      st.mixer = undefined
    }

    const loader = new GLTFLoader()
    loader.register(parser => new VRMLoaderPlugin(parser))
    loader.load(
      vrmUrl,
      gltf => {
        if (cancelled) return
        const vrm = gltf.userData.vrm as VRM
        VRMUtils.combineSkeletons(vrm.scene)
        VRMUtils.rotateVRM0(vrm)
        vrm.scene.traverse(o => ((o as any).frustumCulled = false))
        st.scene!.add(vrm.scene)
        st.vrm = vrm
        st.mixer = new THREE.AnimationMixer(vrm.scene)
      },
      undefined,
      err => console.error("[VRMViewer] load error", err)
    )

    return () => {
      cancelled = true
    }
  }, [vrmUrl])

  // Load animation
  useEffect(() => {
    const st = stateRef.current
    let cancelled = false
    const tryLoad = async () => {
      if (!animationUrl) {
        st.mixer?.stopAllAction()
        return
      }
      // Wait until vrm + mixer ready (polled)
      const waitFor = async () => {
        for (let i = 0; i < 50; i++) {
          if (cancelled) return false
          if (st.vrm && st.mixer) return true
          await new Promise(r => setTimeout(r, 80))
        }
        return false
      }
      const ok = await waitFor()
      if (!ok) return
      try {
        const clip = await loadMixamoAnimation(animationUrl, st.vrm!)
        if (cancelled) return
        st.mixer!.stopAllAction()
        const action = st.mixer!.clipAction(clip)
        action.reset().play()
      } catch (e) {
        console.error("[VRMViewer] animation error", e)
      }
    }
    tryLoad()
    return () => {
      cancelled = true
    }
  }, [animationUrl])

  // Sync autoRotate flag
  useEffect(() => {
    const st = stateRef.current
    if (st.controls) st.controls.autoRotate = autoRotate
  }, [autoRotate])

  return <div ref={hostRef} className={className} />
}
