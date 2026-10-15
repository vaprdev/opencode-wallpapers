// Renders a wallpaper's scene directly (no terminal conversion) to PNGs at the given scene times in seconds:
// bun dev/snap.ts <wallpaper> [calm|lively|teeming] [day|sunset|night] [seconds...]
// WALLPAPER_EVENTS="done@2,error@20" sends agent events to the scene at those seconds; names gain an "-events" suffix.
import "./seed"
import { mkdirSync } from "node:fs"
import { ACTIVITIES, TIMES, parseEvents } from "../src/engine"
import { encodePng } from "./png"
import { wallpapers } from "./wallpapers"

const [id, ...rest] = process.argv.slice(2)
const activity = ACTIVITIES.find((a) => rest.includes(a)) ?? "calm"
const times = rest.filter((arg) => /^[\d.]+$/.test(arg))
const wallpaper = wallpapers.find((w) => w.id === id)
if (!wallpaper) throw new Error(`usage: bun dev/snap.ts <${wallpapers.map((w) => w.id).join("|")}> [seconds...]`)
// A wallpaper with a fixed time renders only that.
const time = wallpaper.fixedTime ?? TIMES.find((t) => rest.includes(t)) ?? "day"
mkdirSync("dev/out", { recursive: true })
const scene = wallpaper.create({ activity, time })
scene.resize(720, 400)
let elapsed = 0
let ms = 0
let renders = 0
const events = parseEvents(process.env.WALLPAPER_EVENTS).sort((a, b) => a.at - b.at)
const pending = [...events]
for (const seconds of (times.length ? times : ["5", "30", "60"]).map(Number)) {
  for (; elapsed < seconds; elapsed += 1 / 15) {
    while (pending.length && pending[0].at <= elapsed) scene.react?.(pending.shift()!.event)
    scene.step(1 / 15)
    const start = Bun.nanoseconds()
    scene.render()
    ms += (Bun.nanoseconds() - start) / 1e6
    renders++
  }
  scene.render()
  const path = `dev/out/${[wallpaper.id, activity, time, `${seconds}s`].filter(Boolean).join("-")}${events.length ? "-events" : ""}.png`
  await Bun.write(path, encodePng(scene.pixels, scene.W, scene.H))
  console.log(path)
}
console.log(`${(ms / Math.max(1, renders)).toFixed(1)} ms per render at ${scene.W}x${scene.H}`)
