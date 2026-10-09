// Crossfades between two wallpapers on a mock 160x45 screen, snapshots a frame partway through to a PNG, and reports
// frame cost before and during the fade: bun dev/fade.ts <id[:activity][:time]> <id[:activity][:time]> [percent] [seconds]
import { mkdirSync, rmSync } from "node:fs"
import { ACTIVITIES, FADE, TIMES } from "../src/engine"
import { WALLPAPERS } from "../wallpapers"
import { cellsToPng } from "./cells"
import { FPS, H, W, mockScreen, text } from "./mock"

const [a, b, percent = "50", seconds = String(FADE)] = process.argv.slice(2)
const parse = (arg = "") => {
  const [id, ...rest] = arg.split(":")
  const wallpaper = WALLPAPERS.find((w) => w.id === id)
  if (!wallpaper) throw new Error(`usage: bun dev/fade.ts <id[:activity][:time]> <id[:activity][:time]> [percent] [seconds]; ids: ${WALLPAPERS.map((w) => w.id).join(", ")}`)
  return { wallpaper, settings: { activity: ACTIVITIES.find((v) => rest.includes(v)) ?? "calm", time: TIMES.find((v) => rest.includes(v)) ?? "day" } }
}
const from = parse(a)
const to = parse(b)
mkdirSync("dev/out", { recursive: true })
const debug = `${process.cwd()}/dev/out/fade.log`
rmSync(debug, { force: true })
process.env.WALLPAPER_DEBUG = debug
process.env.WALLPAPER_OCTANTS = "1"
const screen = mockScreen()
const run = (frames: number) => {
  const start = Bun.nanoseconds()
  for (let f = 0; f < frames; f++) screen.frame(text)
  return (Bun.nanoseconds() - start) / 1e6 / Math.max(1, frames)
}
screen.engine.start(from.wallpaper, from.settings)
run(10 * FPS)
const steady = run(2 * FPS)
screen.engine.start(to.wallpaper, to.settings, Number(seconds))
const fading = run(Math.round((Number(percent) / 100) * Number(seconds) * FPS))
screen.engine.stop()
const errors = (await Bun.file(debug).exists()) ? (await Bun.file(debug).text()).split("\n").filter((l) => l.startsWith("error:")) : []
const path = `dev/out/fade-${a.replaceAll(":", "-")}-to-${b.replaceAll(":", "-")}-${percent}.png`
await Bun.write(path, cellsToPng({ W, H, ...screen.buffers }))
console.log(`${path}\n${steady.toFixed(1)} ms/frame before, ${fading.toFixed(1)} ms/frame fading${errors.length ? `\n${errors.slice(0, 3).join("\n")}` : ""}`)
if (errors.length) process.exit(1)
