// Renders what a wallpaper looks like in the terminal (octant cells behind some text) on a mock 160x45 screen, to a PNG:
// bun dev/preview.ts <wallpaper> [calm|lively|teeming] [seconds]
import { mkdirSync } from "node:fs"
import { ACTIVITIES } from "../src/engine"
import { WALLPAPERS } from "../wallpapers"
import { cellsToPng } from "./cells"
import { FPS, H, W, mockScreen, text } from "./mock"

const [id, ...rest] = process.argv.slice(2)
const activity = ACTIVITIES.find((a) => a === rest[0]) ?? "calm"
const seconds = rest.find((arg) => arg !== activity) ?? "20"
const wallpaper = WALLPAPERS.find((w) => w.id === id)
if (!wallpaper) throw new Error(`usage: bun dev/preview.ts <${WALLPAPERS.map((w) => w.id).join("|")}> [seconds]`)
process.env.WALLPAPER_OCTANTS = "1"
mkdirSync("dev/out", { recursive: true })
const screen = mockScreen()
screen.engine.mode = "behind"
screen.engine.start(wallpaper, activity)
for (let f = 0; f < Number(seconds) * FPS; f++) screen.frame(text)
screen.engine.stop()
const path = `dev/out/${wallpaper.id}-${activity}-preview-${seconds}s.png`
await Bun.write(path, cellsToPng({ W, H, ...screen.buffers }))
console.log(path)
