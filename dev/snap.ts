// Renders a wallpaper's scene directly (no terminal conversion) to PNGs at the given scene times in seconds:
// bun dev/snap.ts <wallpaper> [calm|lively|teeming] [day|sunset|night] [seconds...]
import { mkdirSync } from "node:fs"
import { ACTIVITIES, TIMES } from "../src/engine"
import { WALLPAPERS } from "../wallpapers"
import { encodePng } from "./png"

const [id, ...rest] = process.argv.slice(2)
const activity = ACTIVITIES.find((a) => rest.includes(a)) ?? "calm"
const time = TIMES.find((t) => rest.includes(t)) ?? "day"
const times = rest.filter((arg) => /^[\d.]+$/.test(arg))
const wallpaper = WALLPAPERS.find((w) => w.id === id)
if (!wallpaper) throw new Error(`usage: bun dev/snap.ts <${WALLPAPERS.map((w) => w.id).join("|")}> [seconds...]`)
mkdirSync("dev/out", { recursive: true })
const scene = wallpaper.create({ activity, time })
scene.resize(720, 400)
let elapsed = 0
let ms = 0
let renders = 0
for (const seconds of (times.length ? times : ["5", "30", "60"]).map(Number)) {
  for (; elapsed < seconds; elapsed += 1 / 15) {
    scene.step(1 / 15)
    const start = Bun.nanoseconds()
    scene.render()
    ms += (Bun.nanoseconds() - start) / 1e6
    renders++
  }
  scene.render()
  const path = `dev/out/${wallpaper.id}-${activity}-${time}-${seconds}s.png`
  await Bun.write(path, encodePng(scene.pixels, scene.W, scene.H))
  console.log(path)
}
console.log(`${(ms / Math.max(1, renders)).toFixed(1)} ms per render at ${scene.W}x${scene.H}`)
