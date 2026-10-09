// Renders a wallpaper's scene directly (no terminal conversion) to a looping animated GIF:
// bun dev/gif.ts <wallpaper> [calm|lively|teeming] [day|sunset|night] [WxH] [seconds] → dev/out/<id>-<activity>-<time>.gif
// bun dev/gif.ts all → screenshots/<id>.gif for every wallpaper, and screenshots/hero.gif
// Scenes are recorded from START seconds in, played back SPEED times faster than in the terminal, and loop by
// crossfading the last FADE seconds into the first frames.
import { mkdirSync } from "node:fs"
import { ACTIVITIES, TIMES, type Settings, type Time, type Wallpaper } from "../src/engine"
import { WALLPAPERS } from "../wallpapers"
import { wallpapers } from "./wallpapers"

const SPEED = 3
const FPS = 12.5
const START = 45
const FADE = 1.5
// The time of day each wallpaper looks best at in the README; others use day.
const BEST: Record<string, Time> = { ocean: "day", desert: "sunset", jungle: "day", space: "sunset", farm: "sunset", tundra: "night", beach: "sunset", city: "night", zen: "sunset", prehistoric: "sunset" }
// Wallpapers in the hero GIF at the top of the README, each shown for HERO_SECONDS.
const HERO = ["beach", "tundra", "jungle", "desert", "space"]
const HERO_SECONDS = 2
// Dithering amplitude in 0-255 units, and how far a pixel may drift from the previous frame before it is redrawn.
const DITHER = 10
const KEEP = 3
const BAYER = [0, 32, 8, 40, 2, 34, 10, 42, 48, 16, 56, 24, 50, 18, 58, 26, 12, 44, 4, 36, 14, 46, 6, 38, 60, 28, 52, 20, 62, 30, 54, 22, 3, 35, 11, 43, 1, 33, 9, 41, 51, 19, 59, 27, 49, 17, 57, 25, 15, 47, 7, 39, 13, 45, 5, 37, 63, 31, 55, 23, 61, 29, 53, 21].map((v) => ((v + 0.5) / 64 - 0.5) * DITHER)

type Shot = { wallpaper: Wallpaper; settings: Settings; seconds: number }

const args = process.argv.slice(2)
mkdirSync("dev/out", { recursive: true })
if (args[0] === "all") {
  for (const wallpaper of WALLPAPERS) {
    const settings = { activity: "teeming" as const, time: BEST[wallpaper.id] ?? "day" }
    await write(`screenshots/${wallpaper.id}.gif`, [{ wallpaper, settings, seconds: 8 }], 480, 268, FADE)
  }
  const hero = HERO.flatMap((id) => WALLPAPERS.filter((w) => w.id === id))
  await write("screenshots/hero.gif", hero.map((wallpaper) => ({ wallpaper, settings: { activity: "teeming", time: BEST[wallpaper.id] ?? "day" }, seconds: HERO_SECONDS })), 720, 400, 0)
}
if (args[0] !== "all") {
  const wallpaper = wallpapers.find((w) => w.id === args[0])
  if (!wallpaper) throw new Error(`usage: bun dev/gif.ts <all|${wallpapers.map((w) => w.id).join("|")}> [activity] [time] [WxH] [seconds]`)
  const activity = ACTIVITIES.find((a) => args.includes(a)) ?? "teeming"
  const time = TIMES.find((t) => args.includes(t)) ?? BEST[wallpaper.id] ?? "day"
  const size = (args.find((arg) => /^\d+x\d+$/.test(arg)) ?? "480x268").split("x").map(Number)
  const seconds = Number(args.find((arg) => /^[\d.]+$/.test(arg)) ?? 8)
  await write(`dev/out/${wallpaper.id}-${activity}-${time}.gif`, [{ wallpaper, settings: { activity, time }, seconds }], size[0], size[1], FADE)
}

async function write(path: string, shots: Shot[], W: number, H: number, fadeSeconds: number) {
  const start = Bun.nanoseconds()
  const fade = Math.round(fadeSeconds * FPS)
  const clips = shots.map((shot) => record(shot, W, H, Math.round(shot.seconds * FPS) + fade))
  // Each clip starts by crossfading from the end of the one before it, so the last clip leads back into the first.
  const frames = clips.flatMap((clip, c) => {
    const before = clips[(c + clips.length - 1) % clips.length]
    const blended = clip.slice(0, clip.length - fade).map((pixels, i) => (i < fade ? mix(before[before.length - fade + i], pixels, (i + 1) / (fade + 1)) : pixels))
    const palette = medianCut(blended, 255)
    return blended.map((pixels) => ({ pixels, palette }))
  })
  const gif = encodeGif(frames, W, H, Math.round(100 / FPS))
  await Bun.write(path, gif)
  console.log(`${path}  ${frames.length} frames  ${(gif.length / 1024 / 1024).toFixed(2)} MB  ${((Bun.nanoseconds() - start) / 1e9).toFixed(1)} s`)
}

function record(shot: Shot, W: number, H: number, count: number) {
  // Scenes place things with Math.random; seeding it makes regenerated GIFs match unless the scene changed.
  let seed = 12345
  Math.random = () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  const scene = shot.wallpaper.create(shot.settings)
  scene.resize(W, H)
  for (let t = 0; t < START; t += 1 / 15) scene.step(1 / 15)
  // The engine steps at 15 fps and scenes clamp long steps, so each GIF frame takes several engine-sized steps.
  const steps = Math.ceil((SPEED / FPS) * 15)
  return Array.from({ length: count }, () => {
    scene.render()
    const pixels = scene.pixels.slice()
    for (let s = 0; s < steps; s++) scene.step(SPEED / FPS / steps)
    return pixels
  })
}

function mix(a: Uint8Array, b: Uint8Array, k: number) {
  return a.map((v, i) => v + (b[i] - v) * k)
}

// Median cut over a 6-bit-per-channel histogram of every frame: repeatedly splits the box with the most squared error
// at the weighted median of its widest channel.
function medianCut(frames: Uint8Array[], colors: number) {
  const counts = new Uint32Array(1 << 18)
  const sums = new Float64Array(3 << 18)
  for (const pixels of frames)
    for (let i = 0; i < pixels.length; i += 8) {
      const bin = ((pixels[i] >> 2) << 12) | ((pixels[i + 1] >> 2) << 6) | (pixels[i + 2] >> 2)
      counts[bin]++
      sums[bin * 3] += pixels[i]
      sums[bin * 3 + 1] += pixels[i + 1]
      sums[bin * 3 + 2] += pixels[i + 2]
    }
  const box = (bins: number[]) => {
    const n = bins.reduce((s, b) => s + counts[b], 0)
    const mean = [0, 1, 2].map((c) => bins.reduce((s, b) => s + sums[b * 3 + c], 0) / n)
    const error = [0, 1, 2].map((c) => bins.reduce((s, b) => s + counts[b] * (sums[b * 3 + c] / counts[b] - mean[c]) ** 2, 0))
    const channel = error.indexOf(Math.max(...error))
    return { bins, mean, channel, error: bins.length > 1 ? error[channel] : -1 }
  }
  const boxes = [box(counts.reduce<number[]>((bins, n, b) => (n ? (bins.push(b), bins) : bins), []))]
  while (boxes.length < colors) {
    const worst = boxes.reduce((a, b) => (b.error > a.error ? b : a))
    if (worst.error <= 0) break
    const c = worst.channel
    const sorted = worst.bins.toSorted((a, b) => sums[a * 3 + c] / counts[a] - sums[b * 3 + c] / counts[b])
    const half = sorted.reduce((s, b) => s + counts[b], 0) / 2
    let cut = 1
    for (let seen = counts[sorted[0]]; cut < sorted.length - 1 && seen + counts[sorted[cut]] <= half; cut++) seen += counts[sorted[cut]]
    boxes.splice(boxes.indexOf(worst), 1, box(sorted.slice(0, cut)), box(sorted.slice(cut)))
  }
  return boxes.map((b) => b.mean.map(Math.round))
}

// GIF89a with up to 255 colors per frame and index 255 as transparent. A frame redraws only the rectangle around pixels
// that moved away from what is on screen; frames whose palette differs from the first carry their own color table.
function encodeGif(frames: { pixels: Uint8Array; palette: number[][] }[], W: number, H: number, delay: number) {
  const out: number[] = []
  const u16 = (v: number) => out.push(v & 255, v >> 8)
  const table = (palette: number[][]) => {
    for (let i = 0; i < 256; i++) out.push(...(palette[i] ?? [0, 0, 0]))
  }
  out.push(...new TextEncoder().encode("GIF89a"))
  u16(W)
  u16(H)
  out.push(0xf7, 0, 0)
  table(frames[0].palette)
  out.push(0x21, 0xff, 11, ...new TextEncoder().encode("NETSCAPE2.0"), 3, 1, 0, 0, 0)
  const shown = new Int16Array(W * H * 3).fill(-1000)
  const indices = new Uint8Array(W * H)
  const queued: { x: number; y: number; w: number; h: number; data: Uint8Array; palette: number[][]; delay: number }[] = []
  let palette: number[][] = []
  let nearest = new Int16Array(0)
  for (const frame of frames) {
    if (frame.palette !== palette) {
      palette = frame.palette
      nearest = new Int16Array(1 << 18).fill(-1)
    }
    let x0 = W
    let y0 = H
    let x1 = -1
    let y1 = -1
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const p = y * W + x
        const d = BAYER[(y & 7) * 8 + (x & 7)]
        const r = frame.pixels[p * 4]
        const g = frame.pixels[p * 4 + 1]
        const b = frame.pixels[p * 4 + 2]
        const key = (clampByte(r + d) >> 2 << 12) | (clampByte(g + d) >> 2 << 6) | (clampByte(b + d) >> 2)
        if (nearest[key] < 0) nearest[key] = closest(palette, ((key >> 12) << 2) + 2, (((key >> 6) & 63) << 2) + 2, ((key & 63) << 2) + 2)
        const q = palette[nearest[key]]
        const same = q[0] === shown[p * 3] && q[1] === shown[p * 3 + 1] && q[2] === shown[p * 3 + 2]
        if (same || Math.abs(r - shown[p * 3]) + Math.abs(g - shown[p * 3 + 1]) + Math.abs(b - shown[p * 3 + 2]) <= KEEP) {
          indices[p] = 255
          continue
        }
        indices[p] = nearest[key]
        shown.set(q, p * 3)
        x0 = Math.min(x0, x)
        x1 = Math.max(x1, x)
        y0 = Math.min(y0, y)
        y1 = Math.max(y1, y)
      }
    if (x1 < 0) {
      queued[queued.length - 1].delay += delay
      continue
    }
    const w = x1 - x0 + 1
    const data = new Uint8Array(w * (y1 - y0 + 1))
    for (let y = y0; y <= y1; y++) data.set(indices.subarray(y * W + x0, y * W + x1 + 1), (y - y0) * w)
    queued.push({ x: x0, y: y0, w, h: y1 - y0 + 1, data, palette, delay })
  }
  for (const f of queued) {
    out.push(0x21, 0xf9, 4, 0x05)
    u16(f.delay)
    out.push(255, 0, 0x2c)
    u16(f.x)
    u16(f.y)
    u16(f.w)
    u16(f.h)
    const local = f.palette !== frames[0].palette
    out.push(local ? 0x87 : 0)
    if (local) table(f.palette)
    out.push(8)
    const lzw = encodeLzw(f.data)
    for (let i = 0; i < lzw.length; i += 255) out.push(Math.min(255, lzw.length - i), ...lzw.subarray(i, i + 255))
    out.push(0)
  }
  out.push(0x3b)
  return new Uint8Array(out)
}

function clampByte(v: number) {
  return v < 0 ? 0 : v > 255 ? 255 : v
}

function closest(palette: number[][], r: number, g: number, b: number) {
  let best = 0
  let bestD = Infinity
  for (let i = 0; i < palette.length; i++) {
    const d = 2 * (palette[i][0] - r) ** 2 + 4 * (palette[i][1] - g) ** 2 + 3 * (palette[i][2] - b) ** 2
    if (d < bestD) ((best = i), (bestD = d))
  }
  return best
}

// Variable-width LZW with 8-bit symbols, as GIF image data uses; the table resets when it reaches 4096 codes.
function encodeLzw(data: Uint8Array) {
  const out: number[] = []
  const clear = 256
  let size = 9
  let next = 258
  let bits = 0
  let count = 0
  const emit = (code: number) => {
    bits |= code << count
    count += size
    for (; count >= 8; count -= 8) {
      out.push(bits & 255)
      bits >>>= 8
    }
  }
  const codes = new Map<number, number>()
  emit(clear)
  let prefix = data[0]
  for (let i = 1; i < data.length; i++) {
    const key = (prefix << 8) | data[i]
    const code = codes.get(key)
    if (code !== undefined) {
      prefix = code
      continue
    }
    emit(prefix)
    prefix = data[i]
    if (next === 4096) {
      emit(clear)
      codes.clear()
      size = 9
      next = 258
      continue
    }
    if (next >= 1 << size) size++
    codes.set(key, next++)
  }
  emit(prefix)
  emit(257)
  if (count) out.push(bits & 255)
  return new Uint8Array(out)
}
