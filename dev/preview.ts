// Renders what a wallpaper looks like in the terminal (octant cells behind some text) on a mock 160x45 screen, to a PNG:
// bun dev/preview.ts <wallpaper> [calm|lively|teeming] [day|sunset|night] [seconds]
import { mkdirSync } from "node:fs"
import { ACTIVITIES, TIMES } from "../src/engine"
import { cellsToPng } from "./cells"
import { FPS, H, W, mockScreen, text } from "./mock"
import { wallpapers } from "./wallpapers"

const [id, ...rest] = process.argv.slice(2)
const activity = ACTIVITIES.find((a) => rest.includes(a)) ?? "calm"
const time = TIMES.find((t) => rest.includes(t)) ?? "day"
const seconds = rest.find((arg) => /^[\d.]+$/.test(arg)) ?? "20"
const wallpaper = wallpapers.find((w) => w.id === id)
if (!wallpaper) throw new Error(`usage: bun dev/preview.ts <${wallpapers.map((w) => w.id).join("|")}> [seconds]`)
process.env.WALLPAPER_OCTANTS = "1"
mkdirSync("dev/out", { recursive: true })
const screen = mockScreen()
screen.engine.start(wallpaper, { activity, time })
for (let f = 0; f < Number(seconds) * FPS; f++) screen.frame(text)
screen.engine.stop()
const path = `dev/out/${wallpaper.id}-${activity}-${time}-preview-${seconds}s.png`
await Bun.write(path, cellsToPng({ W, H, ...screen.buffers }))
console.log(path)
