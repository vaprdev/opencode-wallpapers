// Runs a scene for 10 seconds, clicks it at (fx, fy) as fractions of the width and height, then renders PNGs at the
// given seconds after the click: bun dev/poke.ts <wallpaper> [calm|lively|teeming] [day|sunset|night] <fx> <fy> [seconds...]
import { mkdirSync } from "node:fs"
import { ACTIVITIES, TIMES } from "../src/engine"
import { WALLPAPERS } from "../wallpapers"
import { encodePng } from "./png"

const [id, ...rest] = process.argv.slice(2)
const activity = ACTIVITIES.find((a) => rest.includes(a)) ?? "calm"
const time = TIMES.find((t) => rest.includes(t)) ?? "day"
const [fx, fy, ...after] = rest.filter((arg) => /^[\d.]+$/.test(arg)).map(Number)
const wallpaper = WALLPAPERS.find((w) => w.id === id)
if (!wallpaper || fy === undefined) throw new Error(`usage: bun dev/poke.ts <${WALLPAPERS.map((w) => w.id).join("|")}> [activity] [time] <fx> <fy> [seconds...]`)
mkdirSync("dev/out", { recursive: true })
const scene = wallpaper.create({ activity, time })
scene.resize(720, 400)
for (let s = 0; s < 10; s += 1 / 15) scene.step(1 / 15)
scene.poke?.(fx * (scene.W / scene.H), fy)
let elapsed = 0
for (const seconds of after.length ? after : [1, 3, 6]) {
  for (; elapsed < seconds; elapsed += 1 / 15) scene.step(1 / 15)
  scene.render()
  const path = `dev/out/${wallpaper.id}-poke-${activity}-${time}-${seconds}s.png`
  await Bun.write(path, encodePng(scene.pixels, scene.W, scene.H))
  console.log(path)
}
