#!/usr/bin/env node
// Downloads the 100Avatars R3 collection + 11 Mixamo FBX animations into
// /opt/rahoot2/config/avatars-3d/. Resumable: skips files already present
// with non-zero size. Writes a catalog.json the app reads at runtime.

import fs from "node:fs"
import path from "node:path"
import https from "node:https"

const ROOT = process.env.AVATARS_ROOT || "/opt/rahoot2/config/avatars-3d"
const METADATA_URL =
  "https://raw.githubusercontent.com/ToxSam/open-source-avatars/main/data/avatars/100avatars-r3.json"

const ANIMATIONS = [
  ["Bored", "idle"],
  ["OffensiveIdle", "idle-offensive"],
  ["FightIdle", "idle-fight"],
  ["CrossJumps", "jump"],
  ["JumpingRope", "jump-rope"],
  ["Looking", "look"],
  ["LookingAround", "look-around"],
  ["MagicSpellCasting", "magic-spell"],
  ["StandingMagicAttack", "magic-attack"],
  ["SearchingFilesHigh", "search"],
  ["TextingWhileStanding", "texting"],
]

const ANIM_BASE = "https://raw.githubusercontent.com/ToxSam/osa-gallery/main/public/animations"

function mkdirp(dir) {
  fs.mkdirSync(dir, { recursive: true })
}

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    get(url, res => {
      let data = ""
      res.on("data", c => (data += c))
      res.on("end", () => {
        try { resolve(JSON.parse(data)) } catch (e) { reject(e) }
      })
    }).on("error", reject)
  })
}

function get(url, cb) {
  return https.get(url, { headers: { "User-Agent": "rahoot2-fetch" } }, res => {
    if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
      get(res.headers.location, cb)
      return
    }
    cb(res)
  })
}

function download(url, dest) {
  return new Promise((resolve, reject) => {
    if (fs.existsSync(dest) && fs.statSync(dest).size > 0) return resolve({ skipped: true })
    const tmp = dest + ".part"
    const file = fs.createWriteStream(tmp)
    get(url, res => {
      if (res.statusCode !== 200) {
        file.close()
        fs.unlinkSync(tmp)
        return reject(new Error(`HTTP ${res.statusCode} for ${url}`))
      }
      res.pipe(file)
      file.on("finish", () => {
        file.close(() => {
          fs.renameSync(tmp, dest)
          resolve({ bytes: fs.statSync(dest).size })
        })
      })
    }).on("error", err => {
      try { file.close(); fs.unlinkSync(tmp) } catch {}
      reject(err)
    })
  })
}

async function main() {
  mkdirp(path.join(ROOT, "r3", "models"))
  mkdirp(path.join(ROOT, "r3", "icons"))
  mkdirp(path.join(ROOT, "animations"))

  console.log(`[fetch] root=${ROOT}`)
  console.log(`[fetch] loading metadata…`)
  const meta = await fetchJson(METADATA_URL)
  console.log(`[fetch] ${meta.length} avatars in R3`)

  const catalog = []
  let okVrm = 0, okIcon = 0, failed = []

  for (let i = 0; i < meta.length; i++) {
    const a = meta[i]
    const num = a.metadata?.number
    const name = a.name
    const id = `${num}_${name}`
    const vrmRel = `r3/models/${id}.vrm`
    const iconRel = `r3/icons/${id}.png`
    const vrmAbs = path.join(ROOT, vrmRel)
    const iconAbs = path.join(ROOT, iconRel)

    try {
      const v = await download(a.model_file_url, vrmAbs)
      if (v.skipped) process.stdout.write("·")
      else { okVrm++; process.stdout.write("v") }
    } catch (e) {
      failed.push({ id, kind: "vrm", err: e.message })
      process.stdout.write("X")
    }
    try {
      const t = await download(a.thumbnail_url, iconAbs)
      if (t.skipped) process.stdout.write(".")
      else { okIcon++; process.stdout.write("i") }
    } catch (e) {
      failed.push({ id, kind: "icon", err: e.message })
      process.stdout.write("x")
    }
    if ((i + 1) % 10 === 0) process.stdout.write(` ${i + 1}\n`)
    catalog.push({
      id,
      number: num,
      name,
      displayName: name.replace(/([a-z])([A-Z])/g, "$1 $2"),
      series: "R3",
      vrm: vrmRel,
      icon: iconRel,
      requiredLevel: 1,
    })
  }

  console.log(`\n[fetch] animations…`)
  const animsOut = []
  for (const [fname, aid] of ANIMATIONS) {
    const url = `${ANIM_BASE}/${fname}.fbx`
    const rel = `animations/${fname}.fbx`
    const abs = path.join(ROOT, rel)
    try {
      const r = await download(url, abs)
      console.log(`  ${r.skipped ? "·" : "✓"} ${fname}`)
      animsOut.push({ id: aid, label: aid, file: rel })
    } catch (e) {
      console.log(`  X ${fname}: ${e.message}`)
      failed.push({ id: fname, kind: "anim", err: e.message })
    }
  }

  const catalogPath = path.join(ROOT, "catalog.json")
  fs.writeFileSync(
    catalogPath,
    JSON.stringify({ series: "R3", avatars: catalog, animations: animsOut }, null, 2)
  )
  console.log(`[fetch] catalog → ${catalogPath}`)
  console.log(`[fetch] new downloads: ${okVrm} vrms, ${okIcon} icons`)
  if (failed.length) {
    console.log(`[fetch] failed: ${failed.length}`)
    for (const f of failed.slice(0, 10)) console.log(`  - ${f.kind} ${f.id}: ${f.err}`)
    process.exit(1)
  }
}

main().catch(e => { console.error(e); process.exit(1) })
