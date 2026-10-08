// Renders what a wallpaper looks like in the terminal (octant cells behind some text) on a mock 160x45 screen, to a PNG:
// bun dev/preview.ts <wallpaper> [seconds]
import { mkdirSync } from "node:fs"
import { WALLPAPERS } from "../wallpapers"
import { cellsToPng } from "./cells"
import { FPS, H, W, mockScreen, text } from "./mock"

const [id, seconds = "20"] = process.argv.slice(2)
const wallpaper = WALLPAPERS.find((w) => w.id === id)
if (!wallpaper) throw new Error(`usage: bun dev/preview.ts <${WALLPAPERS.map((w) => w.id).join("|")}> [seconds]`)
process.env.WALLPAPER_OCTANTS = "1"
mkdirSync("dev/out", { recursive: true })
const screen = mockScreen()
screen.engine.mode = "behind"
screen.engine.start(wallpaper)
for (let f = 0; f < Number(seconds) * FPS; f++) screen.frame(text)
screen.engine.stop()
const path = `dev/out/${wallpaper.id}-preview-${seconds}s.png`
await Bun.write(path, cellsToPng({ W, H, ...screen.buffers }))
console.log(path)
