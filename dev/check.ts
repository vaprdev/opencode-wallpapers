// Runs every wallpaper (or the named ones) at every activity level and time of day through the engine on a mock screen and reports errors, frame cost and
// flicker (cells whose glyph changes per frame; lower is calmer): bun dev/check.ts [wallpaper...]
import { mkdirSync, rmSync } from "node:fs"
import { ACTIVITIES, TIMES } from "../src/engine"
import { H, W, mockScreen, text } from "./mock"
import { wallpapers } from "./wallpapers"

mkdirSync("dev/out", { recursive: true })
const debug = `${process.cwd()}/dev/out/check.log`
rmSync(debug, { force: true })
process.env.WALLPAPER_DEBUG = debug
process.env.WALLPAPER_OCTANTS = "1"

const ids = process.argv.slice(2)
const unknown = ids.filter((id) => !wallpapers.some((w) => w.id === id))
if (unknown.length) throw new Error(`unknown wallpaper ${unknown.join(", ")}; available: ${wallpapers.map((w) => w.id).join(", ")}`)
const screen = mockScreen()
let failed = false
const runs = (ids.length ? wallpapers.filter((w) => ids.includes(w.id)) : wallpapers).flatMap((w) => ACTIVITIES.flatMap((activity) => TIMES.map((time) => ({ wallpaper: w, activity, time }))))
for (const { wallpaper, activity, time } of runs) {
  screen.engine.start(wallpaper, { activity, time })
  let previous = new Uint32Array(W * H)
  let changes = 0
  let ms = 0
  const frames = 240
  for (let f = 0; f < frames; f++) {
    const start = Bun.nanoseconds()
    screen.frame(text)
    if (f >= 60) {
      ms += (Bun.nanoseconds() - start) / 1e6
      for (let i = 0; i < W * H; i++) if (screen.buffers.char[i] !== previous[i]) changes++
    }
    previous = screen.buffers.char.slice()
  }
  screen.engine.stop()
  const errors = (await Bun.file(debug).exists()) ? (await Bun.file(debug).text()).split("\n").filter((l) => l.startsWith("error:")) : []
  rmSync(debug, { force: true })
  if (errors.length) failed = true
  console.log(`${`${wallpaper.id} ${activity} ${time}`.padEnd(26)} ${errors.length ? "FAIL" : "ok  "} ${(ms / (frames - 60)).toFixed(1)} ms/frame  ${(changes / (frames - 60)).toFixed(0)} of ${W * H} cells change per frame`)
  for (const e of errors.slice(0, 3)) console.log(`  ${e}`)
}
if (failed) process.exit(1)
