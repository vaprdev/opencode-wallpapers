// Renders what a wallpaper looks like in the terminal (octant cells behind some text) on a mock screen, to a PNG. home
// and session lay the text out like OpenCode's home screen or a session; a size such as 240x60 replaces 160x45:
// bun dev/preview.ts <wallpaper> [calm|lively|teeming] [day|sunset|night] [home|session] [WxH] [seconds]
import "./seed"
import { mkdirSync } from "node:fs"
import { ACTIVITIES, TIMES } from "../src/engine"
import { cellsToPng } from "./cells"
import { FPS, H, W, home, mockScreen, session, text } from "./mock"
import { wallpapers } from "./wallpapers"

const [id, ...rest] = process.argv.slice(2)
const activity = ACTIVITIES.find((a) => rest.includes(a)) ?? "calm"
const layout = (["home", "session"] as const).find((l) => rest.includes(l))
const size = rest.find((arg) => /^\d+x\d+$/.test(arg))
const [w, h] = size ? size.split("x").map(Number) : [W, H]
const seconds = rest.find((arg) => /^[\d.]+$/.test(arg)) ?? "20"
const wallpaper = wallpapers.find((w) => w.id === id)
if (!wallpaper) throw new Error(`usage: bun dev/preview.ts <${wallpapers.map((w) => w.id).join("|")}> [seconds]`)
const time = wallpaper.fixedTime ?? TIMES.find((t) => rest.includes(t)) ?? "day"
process.env.WALLPAPER_OCTANTS ??= "1"
mkdirSync("dev/out", { recursive: true })
const screen = mockScreen({ W: w, H: h })
const paint = layout === "home" ? home(w, h) : layout === "session" ? session(w, h) : text
screen.engine.start(wallpaper, { activity, time })
for (let f = 0; f < Number(seconds) * FPS; f++) screen.frame(paint)
screen.engine.stop()
const path = `dev/out/${[wallpaper.id, activity, time, layout, size, "preview", `${seconds}s`].filter(Boolean).join("-")}.png`
await Bun.write(path, cellsToPng({ W: w, H: h, ...screen.buffers }))
console.log(path)
