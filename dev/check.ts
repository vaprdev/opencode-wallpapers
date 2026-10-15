// Runs every wallpaper (or the named ones) at every activity level and time of day through the engine on a mock screen and reports errors, frame cost and
// flicker (cells whose glyph changes per frame; lower is calmer). Exits non-zero on errors, on flicker above --max-flicker (default 150 of 7200 cells)
// and, only when given, on frame cost above --max-ms: bun dev/check.ts [--quiet] [--max-ms=N] [--max-flicker=N] [--verify-dirty] [wallpaper...]
// --verify-dirty plays each combination twice, refitting every cell every frame (WALLPAPER_DIRTY=0) and then only the
// cells that changed, with text edits, redraws between frames and agent events mixed in, and fails on any cell that
// differs between the two, and on any pixel a scene draws outside its touched boxes.
import { mkdirSync, rmSync } from "node:fs"
import { parseArgs } from "node:util"
import { ACTIVITIES, TIMES, type Activity, type Engine, type Time, type Wallpaper } from "../src/engine"
import { H, W, mockScreen, text } from "./mock"
import { seed } from "./seed"
import { wallpapers } from "./wallpapers"

mkdirSync("dev/out", { recursive: true })
const debug = `${process.cwd()}/dev/out/check.log`
rmSync(debug, { force: true })
process.env.WALLPAPER_DEBUG = debug
process.env.WALLPAPER_OCTANTS ??= "1"

const args = parseArgs({ allowPositionals: true, options: { quiet: { type: "boolean" }, "max-ms": { type: "string" }, "max-flicker": { type: "string", default: "150" }, "verify-dirty": { type: "boolean" } } })
const maxMs = Number(args.values["max-ms"] ?? Infinity)
const maxFlicker = Number(args.values["max-flicker"])
const verify = args.values["verify-dirty"]
const ids = args.positionals
const unknown = ids.filter((id) => !wallpapers.some((w) => w.id === id))
if (unknown.length) throw new Error(`unknown wallpaper ${unknown.join(", ")}; available: ${wallpapers.map((w) => w.id).join(", ")}`)
// Holding the clock makes the next frame a redraw that doesn't advance the scene, as when OpenCode repaints for typing.
let hold = false
const cursor = { x: 10, y: 40, visible: true }
let failed = 0
let slowest = { ms: -1, name: "" }
let busiest = { flicker: -1, name: "" }
// Wallpapers whose whole view moves now and then, such as the maze's walking camera, change hundreds of cells a frame
// while moving and almost none while still, so 16 seconds say more about where the run lands than about the scene.
// They play for two minutes instead, held to the same flicker limit; --verify-dirty, which keeps every frame of its
// shorter scripted run, checks only their cells.
const LONG = ["maze"]
const runs = (ids.length ? wallpapers.filter((w) => ids.includes(w.id)) : wallpapers).flatMap((w) => ACTIVITIES.flatMap((activity) => (w.fixedTime ? [w.fixedTime] : TIMES).map((time) => ({ wallpaper: w, activity, time }))))
for (const { wallpaper, activity, time } of runs) {
  const long = LONG.includes(wallpaper.id)
  const frames = long && !verify ? 1800 : 240
  const reference = verify ? play(wallpaper, activity, time, "0", frames).recording : undefined
  const result = play(wallpaper, activity, time, "1", frames, reference)
  const errors = (await Bun.file(debug).exists()) ? (await Bun.file(debug).text()).split("\n").filter((l) => l.startsWith("error:")) : []
  rmSync(debug, { force: true })
  const name = `${wallpaper.id} ${activity} ${time}`
  if (result.ms > slowest.ms) slowest = { ms: result.ms, name }
  if (result.flicker > busiest.flicker) busiest = { flicker: result.flicker, name }
  const problems = [
    errors.length && `${errors.length} errors`,
    result.flicker > maxFlicker && !(long && verify) && `flicker over ${maxFlicker}`,
    result.ms > maxMs && `slower than ${maxMs} ms`,
    result.mismatches && `${result.mismatches} cells differ from a full refit, first ${result.first}`,
    result.uncovered && `${result.uncovered} pixels drawn outside the touched boxes, first ${result.where}`,
  ].filter(Boolean)
  if (problems.length) failed++
  if (args.values.quiet && !problems.length) continue
  console.log(`${name.padEnd(26)} ${problems.length ? "FAIL" : "ok  "} ${result.ms.toFixed(1)} ms/frame  ${result.flicker.toFixed(0)} of ${W * H} cells change per frame${problems.length ? `  (${problems.join(", ")})` : ""}`)
  for (const e of errors.slice(0, 3)) console.log(`  ${e}`)
}
console.log(`${runs.length} runs, ${failed} failed; slowest ${slowest.ms.toFixed(1)} ms/frame (${slowest.name}), most flicker ${busiest.flicker.toFixed(0)} cells (${busiest.name})`)
if (failed) process.exit(1)

// Plays one combination, with WALLPAPER_DIRTY set to dirty. Under --verify-dirty it records every frame, and compares
// each against the reference recording when given.
function play(wallpaper: Wallpaper, activity: Activity, time: Time, dirty: string, frames: number, reference?: Uint16Array[]) {
  process.env.WALLPAPER_DIRTY = dirty
  // A fresh engine and the same random stream per combination, so a run doesn't depend on which others ran before it.
  const screen = mockScreen()
  const tick = performance.now
  let held = 0
  performance.now = () => (hold ? held : (held = tick()))
  screen.renderer.getCursorState = () => cursor
  seed(1)
  let uncovered = 0
  let where = ""
  const watched = verify && dirty === "1" ? watch(wallpaper, (n, at) => ((uncovered += n), (where ||= at))) : wallpaper
  screen.engine.start(watched, { activity, time })
  let previous = new Uint32Array(W * H)
  let changes = 0
  let total = 0
  let mismatches = 0
  let first = ""
  const recording: Uint16Array[] = []
  for (let f = 0; f < frames; f++) {
    if (verify) script(f, screen.engine, watched, activity, time)
    const start = Bun.nanoseconds()
    screen.frame(verify && f >= 100 && f < 160 ? (x, y) => text(x + 3, y) : text)
    hold = false
    if (f >= 60) {
      total += (Bun.nanoseconds() - start) / 1e6
      for (let i = 0; i < W * H; i++) if (screen.buffers.char[i] !== previous[i]) changes++
    }
    previous = screen.buffers.char.slice()
    if (!verify) continue
    const cells = new Uint16Array(W * H * 8)
    for (let i = 0; i < W * H; i++) {
      cells[i * 8] = screen.buffers.char[i] & 0xffff
      cells[i * 8 + 1] = screen.buffers.char[i] >>> 16
      for (let c = 0; c < 3; c++) {
        cells[i * 8 + 2 + c] = screen.buffers.fg[i * 4 + c]
        cells[i * 8 + 5 + c] = screen.buffers.bg[i * 4 + c]
      }
    }
    recording.push(cells)
    const expected = reference?.[f]
    if (!expected) continue
    for (let i = 0; i < W * H; i++) {
      let same = true
      for (let k = 0; k < 8; k++) if (cells[i * 8 + k] !== expected[i * 8 + k]) same = false
      if (same) continue
      mismatches++
      first ||= `frame ${f} cell ${i % W},${(i / W) | 0}`
    }
  }
  screen.engine.stop()
  return { ms: total / (frames - 60), flicker: changes / (frames - 60), mismatches, first, recording, uncovered, where }
}

// Text edits, redraws between frames, a moving cursor, agent events, a brightness change and a crossfade, to exercise every reason
// a cell's fit can go stale.
function script(f: number, engine: Engine, wallpaper: Wallpaper, activity: Activity, time: Time) {
  hold = f % 9 === 4
  cursor.x = 10 + (f >> 4)
  if (f === 70) engine.react("busy")
  if (f === 130) engine.react("done")
  if (f === 150) engine.react("error")
  if (f === 200) engine.react("idle")
  if (f === 180) engine.start(wallpaper, { activity, time, brightness: "vivid" })
  if (f === 205 && !wallpaper.fixedTime) engine.start(wallpaper, { activity, time: time === "night" ? "day" : "night", brightness: "vivid" })
  // A wallpaper with a fixed time ignores a new time, so it crossfades to another activity instead.
  if (f === 205 && wallpaper.fixedTime) engine.start(wallpaper, { activity: activity === "calm" ? "teeming" : "calm", time, brightness: "vivid" })
}

// A wallpaper whose scenes check, after every render, that each pixel that differs from the cached background lies in
// a touched box: finish() only works out what's under them, so anything drawn elsewhere would never show.
function watch(wallpaper: Wallpaper, report: (pixels: number, at: string) => void): Wallpaper {
  return {
    ...wallpaper,
    create(settings) {
      const scene = wallpaper.create(settings)
      const canvas = scene as unknown as { hdr: Float32Array; background?: Float32Array; touched?: number[] }
      const render = scene.render.bind(scene)
      scene.render = () => {
        render()
        const bg = canvas.background
        const t = canvas.touched
        if (!bg || !t || bg.length !== canvas.hdr.length) return
        const inside = new Uint8Array(scene.W * scene.H)
        for (let b = 0; b < t.length; b += 4)
          for (let y = Math.max(0, Math.floor(t[b + 1])); y <= Math.min(scene.H - 1, Math.floor(t[b + 3])); y++)
            for (let x = Math.max(0, Math.floor(t[b])); x <= Math.min(scene.W - 1, Math.floor(t[b + 2])); x++) inside[y * scene.W + x] = 1
        let n = 0
        let at = ""
        for (let i = 0; i < inside.length; i++) {
          if (inside[i] || (canvas.hdr[i * 3] === bg[i * 3] && canvas.hdr[i * 3 + 1] === bg[i * 3 + 1] && canvas.hdr[i * 3 + 2] === bg[i * 3 + 2])) continue
          n++
          at ||= `${i % scene.W},${(i / scene.W) | 0}`
        }
        if (n) report(n, `${settings.time} at ${at}`)
      }
      return scene
    },
  }
}
