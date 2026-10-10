// Runs every wallpaper (or the named ones) at every activity level and time of day through the engine on a mock screen and reports errors, frame cost and
// flicker (cells whose glyph changes per frame; lower is calmer). Exits non-zero on errors, on flicker above --max-flicker (default 150 of 7200 cells)
// and, only when given, on frame cost above --max-ms: bun dev/check.ts [--quiet] [--max-ms=N] [--max-flicker=N] [wallpaper...] [season] [weather]
import { mkdirSync, rmSync } from "node:fs"
import { parseArgs } from "node:util"
import { ACTIVITIES, SEASONS, TIMES, WEATHERS } from "../src/engine"
import { H, W, mockScreen, text } from "./mock"
import { seed } from "./seed"
import { wallpapers } from "./wallpapers"

mkdirSync("dev/out", { recursive: true })
const debug = `${process.cwd()}/dev/out/check.log`
rmSync(debug, { force: true })
process.env.WALLPAPER_DEBUG = debug
process.env.WALLPAPER_OCTANTS ??= "1"

const args = parseArgs({ allowPositionals: true, options: { quiet: { type: "boolean" }, "max-ms": { type: "string" }, "max-flicker": { type: "string", default: "150" } } })
const maxMs = Number(args.values["max-ms"] ?? Infinity)
const maxFlicker = Number(args.values["max-flicker"])
const season = SEASONS.find((s) => args.positionals.includes(s))
const weather = WEATHERS.find((w) => args.positionals.includes(w))
const ids = args.positionals.filter((arg) => arg !== season && arg !== weather)
const unknown = ids.filter((id) => !wallpapers.some((w) => w.id === id))
if (unknown.length) throw new Error(`unknown wallpaper ${unknown.join(", ")}; available: ${wallpapers.map((w) => w.id).join(", ")}`)
const screen = mockScreen()
let failed = 0
let slowest = { ms: -1, name: "" }
let busiest = { flicker: -1, name: "" }
const runs = (ids.length ? wallpapers.filter((w) => ids.includes(w.id)) : wallpapers).flatMap((w) => ACTIVITIES.flatMap((activity) => TIMES.map((time) => ({ wallpaper: w, activity, time }))))
for (const { wallpaper, activity, time } of runs) {
  // Same random stream per combination, so a run's numbers don't depend on which others ran before it.
  seed(1)
  screen.engine.start(wallpaper, { activity, time, season, weather })
  let previous = new Uint32Array(W * H)
  let changes = 0
  let total = 0
  const frames = 240
  for (let f = 0; f < frames; f++) {
    const start = Bun.nanoseconds()
    screen.frame(text)
    if (f >= 60) {
      total += (Bun.nanoseconds() - start) / 1e6
      for (let i = 0; i < W * H; i++) if (screen.buffers.char[i] !== previous[i]) changes++
    }
    previous = screen.buffers.char.slice()
  }
  screen.engine.stop()
  const errors = (await Bun.file(debug).exists()) ? (await Bun.file(debug).text()).split("\n").filter((l) => l.startsWith("error:")) : []
  rmSync(debug, { force: true })
  const name = `${wallpaper.id} ${activity} ${time}`
  const ms = total / (frames - 60)
  const flicker = changes / (frames - 60)
  if (ms > slowest.ms) slowest = { ms, name }
  if (flicker > busiest.flicker) busiest = { flicker, name }
  const problems = [errors.length && `${errors.length} errors`, flicker > maxFlicker && `flicker over ${maxFlicker}`, ms > maxMs && `slower than ${maxMs} ms`].filter(Boolean)
  if (problems.length) failed++
  if (args.values.quiet && !problems.length) continue
  console.log(`${name.padEnd(26)} ${problems.length ? "FAIL" : "ok  "} ${ms.toFixed(1)} ms/frame  ${flicker.toFixed(0)} of ${W * H} cells change per frame${problems.length ? `  (${problems.join(", ")})` : ""}`)
  for (const e of errors.slice(0, 3)) console.log(`  ${e}`)
}
console.log(`${runs.length} runs, ${failed} failed; slowest ${slowest.ms.toFixed(1)} ms/frame (${slowest.name}), most flicker ${busiest.flicker.toFixed(0)} cells (${busiest.name})`)
if (failed) process.exit(1)
