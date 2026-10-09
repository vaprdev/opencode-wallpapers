import type { Context } from "@opencode/plugin/tui/context"
import { NativeImagePool, Renderable, type KittyImageTransport, type OptimizedBuffer, type RenderContext } from "@opentui/core"
import { appendFileSync } from "node:fs"
import type { RGB } from "./math"
import { OCTANTS } from "./octants"

// A wallpaper's animation. Each frame the engine resizes the scene to the sub-pixel grid it needs, steps it by the
// elapsed seconds, renders it, and reads `pixels` (RGBA, W x H; only resize may replace the array). Extending Canvas
// provides everything but step and render.
export interface Scene {
  readonly W: number
  readonly H: number
  readonly pixels: Uint8Array
  resize(W: number, H: number): void
  step(dt: number): void
  render(): void
}

export interface Wallpaper {
  // Used by /wallpaper <id>; lowercase, no spaces.
  readonly id: string
  readonly name: string
  readonly description: string
  // For each time of day, colors (0-255) that text scrims fade the scene toward at the top, middle and bottom of the
  // screen. Darker, more saturated versions of the scene's own colors at those depths read better than black.
  readonly scrim: Readonly<Record<Time, Scrim>>
  // What each activity level shows, for the picker.
  readonly activity: Readonly<Record<Activity, string>>
  create(settings: Settings): Scene
}

export type Scrim = readonly [RGB, RGB, RGB]

export interface Settings {
  readonly activity: Activity
  readonly time: Time
  // Without a season a wallpaper shows its classic look; without weather it picks its own (see src/weather.ts).
  readonly season?: Season
  readonly weather?: Weather
}

// How much is going on in the scene. calm is scenery with rare events; teeming is the full cast.
export const ACTIVITIES = ["calm", "lively", "teeming"] as const
export type Activity = (typeof ACTIVITIES)[number]

export const TIMES = ["day", "sunset", "night"] as const
export type Time = (typeof TIMES)[number]

export const SEASONS = ["spring", "summer", "autumn", "winter"] as const
export type Season = (typeof SEASONS)[number]

export const WEATHERS = ["clear", "overcast", "rain", "snow", "fog"] as const
export type Weather = (typeof WEATHERS)[number]


const UPPER_HALF = 0x2580
const LOWER_HALF = 0x2584
const BLOCKS_START = 0x2580
const BLOCKS_END = 0x259f
const SPACE = 32
// Scrim reach in cells horizontally and half-cells vertically, how dark it gets, and how fast sparse text saturates it.
const SCRIM_X = 4
const SCRIM_Y = 4
const SCRIM = 0.93
const SCRIM_GAIN = 3.5

// Compress the scene into a range that keeps text readable on top of it.
const EMPTY = new Uint8Array(256)
for (let v = 0; v < 256; v++) {
  const x = v / 255
  const soft = (x * 1.0) / (1 + x * 0.9)
  EMPTY[v] = Math.round(soft * 255)
}
// Night scenes keep their color: it is what separates them from light text.
const DESATURATE = { day: 0.22, sunset: 0.22, night: 0.04 }

function blurRows(src: Float32Array, dst: Float32Array, w: number, h: number, r: number) {
  const inv = 1 / (r * 2 + 1)
  for (let y = 0; y < h; y++) {
    const row = y * w
    let sum = 0
    for (let x = -r; x <= r; x++) sum += src[row + Math.min(w - 1, Math.max(0, x))]
    for (let x = 0; x < w; x++) {
      dst[row + x] = sum * inv
      sum += src[row + Math.min(w - 1, x + r + 1)] - src[row + Math.max(0, x - r)]
    }
  }
}

function blurColumns(src: Float32Array, dst: Float32Array, w: number, h: number, r: number) {
  const inv = 1 / (r * 2 + 1)
  for (let x = 0; x < w; x++) {
    let sum = 0
    for (let y = -r; y <= r; y++) sum += src[Math.min(h - 1, Math.max(0, y)) * w + x]
    for (let y = 0; y < h; y++) {
      dst[y * w + x] = sum * inv
      sum += src[Math.min(h - 1, y + r + 1) * w + x] - src[Math.max(0, y - r) * w + x]
    }
  }
}

// Terminals that draw octant glyphs themselves; elsewhere fall back to quadrants, which every font has.
const OCTANT_TERMINALS = /ghostty|kitty/i
const quad4 = new Float32Array(12)

function mean8(q: Float32Array, c: number) {
  return (q[c] + q[3 + c] + q[6 + c] + q[9 + c] + q[12 + c] + q[15 + c] + q[18 + c] + q[21 + c]) / 8
}

// Means and squared error of splitting a cell's eight sub-pixels by mask (set bits are foreground).
const split = { fr: 0, fg: 0, fb: 0, br: 0, bg: 0, bb: 0, err: 0 }
function evalMask(q: Float32Array, mask: number) {
  let fr = 0
  let fg = 0
  let fb = 0
  let fn = 0
  let br = 0
  let bg = 0
  let bb = 0
  let bn = 0
  for (let s = 0; s < 8; s++) {
    if (mask & (1 << s)) {
      fr += q[s * 3]
      fg += q[s * 3 + 1]
      fb += q[s * 3 + 2]
      fn++
    } else {
      br += q[s * 3]
      bg += q[s * 3 + 1]
      bb += q[s * 3 + 2]
      bn++
    }
  }
  if (fn) ((fr /= fn), (fg /= fn), (fb /= fn))
  if (bn) ((br /= bn), (bg /= bn), (bb /= bn))
  let err = 0
  for (let s = 0; s < 8; s++) {
    const on = mask & (1 << s)
    const dr = q[s * 3] - (on ? fr : br)
    const dg = q[s * 3 + 1] - (on ? fg : bg)
    const db = q[s * 3 + 2] - (on ? fb : bb)
    err += dr * dr + dg * dg + db * db
  }
  split.fr = fr
  split.fg = fg
  split.fb = fb
  split.br = br
  split.bg = bg
  split.bb = bb
  split.err = err
}

// Splits a cell's eight sub-pixels into two colours by brightness threshold, choosing the split with the least
// squared error. A cell keeps last frame's split unless the new one is clearly better, so slow motion doesn't
// make the glyph pattern flicker between near-equal choices. Returns the mask used.
function writeOctant(q: Float32Array, order: Uint8Array, previous: number, char: Uint32Array, fg: Uint16Array, bg: Uint16Array, i: number, o: number) {
  for (let s = 0; s < 8; s++) {
    const l = q[s * 3] * 0.2126 + q[s * 3 + 1] * 0.7152 + q[s * 3 + 2] * 0.0722
    let j = s
    while (j > 0 && luma8[order[j - 1]] > l) {
      order[j] = order[j - 1]
      j--
    }
    order[j] = s
    luma8[s] = l
  }
  let bestMask = 0
  let bestErr = Infinity
  let mask = 255
  for (let k = 0; k < 8; k++) {
    if (k > 0) mask &= ~(1 << order[k - 1])
    evalMask(q, k === 0 ? 0 : mask)
    if (split.err < bestErr - 0.5) {
      bestErr = split.err
      bestMask = k === 0 ? 0 : mask
    }
  }
  // One refinement pass: reassign each sub-pixel to the nearer of the two colors. This beats a pure brightness
  // split wherever hue matters more than lightness, such as a warm highlight against cool water.
  if (bestMask !== 0) {
    evalMask(q, bestMask)
    const { fr, fg: fgg, fb, br, bg: bgg, bb } = split
    let refined = 0
    for (let s = 0; s < 8; s++) {
      const r = q[s * 3]
      const g = q[s * 3 + 1]
      const b = q[s * 3 + 2]
      const df = (r - fr) ** 2 + (g - fgg) ** 2 + (b - fb) ** 2
      const db = (r - br) ** 2 + (g - bgg) ** 2 + (b - bb) ** 2
      if (df < db) refined |= 1 << s
    }
    if (refined !== bestMask && refined !== 0 && refined !== 255) {
      evalMask(q, refined)
      if (split.err < bestErr) {
        bestErr = split.err
        bestMask = refined
      }
    }
  }
  let chosen = bestMask
  if (previous >= 0 && previous !== bestMask) {
    evalMask(q, previous)
    if (split.err <= bestErr * 1.35 + HYSTERESIS) chosen = previous
  }
  evalMask(q, chosen)
  if (chosen === 0 || chosen === 255) {
    char[i] = 0x20
    const n = chosen === 0 ? split : { br: split.fr, bg: split.fg, bb: split.fb }
    bg[o] = n.br
    bg[o + 1] = n.bg
    bg[o + 2] = n.bb
    bg[o + 3] = 255
    return chosen
  }
  char[i] = OCTANTS[chosen]
  bg[o] = split.br
  bg[o + 1] = split.bg
  bg[o + 2] = split.bb
  bg[o + 3] = 255
  fg[o] = split.fr
  fg[o + 1] = split.fg
  fg[o + 2] = split.fb
  fg[o + 3] = 255
  return chosen
}
const luma8 = new Float32Array(8)
// Extra squared error (in 0-255 channel units) a cell tolerates before abandoning last frame's split.
const HYSTERESIS = 150
// Share of the previous frame blended into each new one, which smooths sub-pixel motion.
const PERSISTENCE = 0.45
// How often the scene advances and redraws; wallpapers move slowly, so this stays low to save CPU and output.
const FPS = 15
// Real-pixel mode: scene pixels per character cell. Cells are about twice as tall as wide, so 3x6 keeps pixels square.
const PX_W = 3
const PX_H = 6
// Character-cell mode can render the scene at SUPERSAMPLE x the octant grid and box-filter it down, so thin features
// anti-alias instead of snapping on and off. It costs about 2.5x the CPU, so it's opt-in (WALLPAPER_SUPERSAMPLE=2).
// SHARPEN restores small-scale contrast (eyes, stripes, fin edges) that the octant grid otherwise flattens.
const SUPERSAMPLE = process.env.WALLPAPER_SUPERSAMPLE === "2" ? 2 : 1
const SHARPEN = 0.55

// Quadrant block for each 4-bit mask of foreground sub-pixels: bit 0 TL, 1 TR, 2 BL, 3 BR.
const QUADRANTS = [
  0x20, 0x2598, 0x259d, 0x2580, 0x2596, 0x258c, 0x259e, 0x259b, 0x2597, 0x259a, 0x2590, 0x259c, 0x2584, 0x2599, 0x259f, 0x2588,
]

// Picks the two-colour split of a cell's four sub-pixels with the least error and writes it as a quadrant block.
function writeQuadrant(q8: Float32Array, char: Uint32Array, fg: Uint16Array, bg: Uint16Array, i: number, o: number) {
  const q = quad4
  for (let s = 0; s < 4; s++) {
    const top = ((s >> 1) * 4 + (s & 1)) * 3
    for (let c = 0; c < 3; c++) q[s * 3 + c] = (q8[top + c] + q8[top + 6 + c]) / 2
  }
  let bestMask = 0
  let bestErr = Infinity
  let fr = 0
  let fgr = 0
  let fb = 0
  let br = 0
  let bgg = 0
  let bb = 0
  for (let m = 0; m < 8; m++) {
    let ar = 0
    let ag = 0
    let ab = 0
    let an = 0
    let cr = 0
    let cg = 0
    let cb = 0
    let cn = 0
    for (let s = 0; s < 4; s++) {
      if (m & (1 << s)) {
        ar += q[s * 3]
        ag += q[s * 3 + 1]
        ab += q[s * 3 + 2]
        an++
      } else {
        cr += q[s * 3]
        cg += q[s * 3 + 1]
        cb += q[s * 3 + 2]
        cn++
      }
    }
    if (an) ((ar /= an), (ag /= an), (ab /= an))
    if (cn) ((cr /= cn), (cg /= cn), (cb /= cn))
    let err = 0
    for (let s = 0; s < 4; s++) {
      const on = m & (1 << s)
      const dr = q[s * 3] - (on ? ar : cr)
      const dg = q[s * 3 + 1] - (on ? ag : cg)
      const db = q[s * 3 + 2] - (on ? ab : cb)
      err += dr * dr + dg * dg + db * db
    }
    if (err < bestErr - 0.5) {
      bestErr = err
      bestMask = m
      fr = ar
      fgr = ag
      fb = ab
      br = cr
      bgg = cg
      bb = cb
    }
  }
  bg[o] = br
  bg[o + 1] = bgg
  bg[o + 2] = bb
  bg[o + 3] = 255
  if (bestMask === 0) {
    char[i] = 0x20
    return
  }
  char[i] = QUADRANTS[bestMask]
  fg[o] = fr
  fg[o + 1] = fgr
  fg[o + 2] = fb
  fg[o + 3] = 255
}

function isBlock(char: number) {
  return char >= BLOCKS_START && char <= BLOCKS_END
}

function clamp01(value: number, max: number) {
  return value < 0 ? 0 : value > max ? max : value
}

function applyTint(colors: Uint16Array | Uint8Array, o: number, tint: number) {
  if (tint === NO_TINT || tint === TINT_ZERO) return
  const dr = ((tint >> 20) & 1023) - 256
  const dg = ((tint >> 10) & 1023) - 256
  const db = (tint & 1023) - 256
  colors[o] = Math.max(0, Math.min(255, (colors[o] & 255) + dr))
  colors[o + 1] = Math.max(0, Math.min(255, (colors[o + 1] & 255) + dg))
  colors[o + 2] = Math.max(0, Math.min(255, (colors[o + 2] & 255) + db))
}

function fgKey(fg: Uint16Array, o: number) {
  return ((fg[o] & 255) << 16) | ((fg[o + 1] & 255) << 8) | (fg[o + 2] & 255)
}

const NO_TINT = 0x7fffffff
// Colors this close to a surface (summed channel difference) are drawn as the scene plus the difference, so animated
// highlights such as the tab loading sweep glow over the scene instead of leaving solid patches.
const TINT_RANGE = 110
const TINT_ZERO = ((256 << 20) | (256 << 10) | 256)

function packTint(dr: number, dg: number, db: number) {
  return ((dr + 256) << 20) | ((dg + 256) << 10) | (db + 256)
}

function key(bg: Uint16Array, o: number) {
  if (((bg[o + 1] >> 8) & 3) === 2) return -1
  return ((bg[o] & 255) << 16) | ((bg[o + 1] & 255) << 8) | (bg[o + 2] & 255)
}

// OpenCode theme surfaces are dark, near-neutral grays; colored backgrounds (diffs, selections, badges) are left alone.
function isSurface(k: number) {
  if (k < 0) return true
  const r = (k >> 16) & 255
  const g = (k >> 8) & 255
  const b = k & 255
  const luma = r * 0.2126 + g * 0.7152 + b * 0.0722
  return luma < 70 && Math.max(r, g, b) - Math.min(r, g, b) < 24
}

// A full-screen renderable at the very back of the tree, so its image placement is drawn before any UI.
class SceneLayer extends Renderable {
  constructor(
    ctx: RenderContext,
    private readonly draw: (buffer: OptimizedBuffer) => void,
  ) {
    super(ctx, { id: "wallpaper-layer", position: "absolute", left: 0, top: 0, width: "100%", height: "100%", zIndex: -100000 })
  }

  protected override renderSelf(buffer: OptimizedBuffer) {
    this.draw(buffer)
  }
}

function createLayer(renderer: Context["renderer"], draw: (buffer: OptimizedBuffer) => void) {
  const layer = new SceneLayer(renderer, draw)
  renderer.root.add(layer)
  return {
    dispose() {
      renderer.root.remove(layer)
      layer.destroy()
    },
  }
}

export interface Engine {
  readonly wallpaper: Wallpaper | undefined
  start(wallpaper: Wallpaper, settings: Settings): void
  stop(): void
}

// Post-processes OpenCode's final frame: cells painted with neutral OpenCode theme surfaces are replaced by the scene, drawn
// as octant or quadrant blocks (or, opt-in, a real kitty image behind the text), with a soft scrim around text.
export function createEngine(
  context: Context,
  options: {
    // Writes one frame's cells as JSON to this path, for dev/cells.ts.
    dump?: string
    layer?: (renderer: Context["renderer"], draw: (buffer: OptimizedBuffer) => void) => { dispose(): void }
  } = {},
): Engine {
  const renderer = context.renderer
  const counts = new Map<number, number>()
  const surfaces = new Set<number>()
  const tints = new Map<number, number>()
  let wallpaper: Wallpaper | undefined
  let settings: Settings | undefined
  let scene: Scene | undefined
  let frames = 0
  let dumped = false
  let base = -2
  let mask = new Float32Array(0)
  const quad = new Float32Array(24)
  const order = new Uint8Array(8)
  const octants = process.env.WALLPAPER_OCTANTS !== "0" && (process.env.WALLPAPER_OCTANTS === "1" || OCTANT_TERMINALS.test(`${process.env.TERM_PROGRAM ?? ""} ${process.env.TERM ?? ""}`))
  let scratch = new Float32Array(0)
  let surface = new Uint8Array(0)
  let cellTint = new Int32Array(0)
  let previousMask = new Int16Array(0)
  let history = new Float32Array(0)
  let lastStep = 0
  let lastTarget = ""
  let imageCell = new Uint8Array(0)
  let grid = new Float32Array(0)
  let gridBlur = new Float32Array(0)

  // Box-filters the scene down to the 2x4-per-cell octant grid, then applies an unsharp mask.
  const buildGrid = (px: Uint8Array, PW: number, PH: number, GW: number, GH: number) => {
    if (grid.length !== GW * GH * 3) {
      grid = new Float32Array(GW * GH * 3)
      gridBlur = new Float32Array(GW * GH * 3)
    }
    for (let gy = 0; gy < GH; gy++) {
      const y0 = Math.floor((gy * PH) / GH)
      const y1 = Math.max(y0 + 1, Math.floor(((gy + 1) * PH) / GH))
      for (let gx = 0; gx < GW; gx++) {
        const x0 = Math.floor((gx * PW) / GW)
        const x1 = Math.max(x0 + 1, Math.floor(((gx + 1) * PW) / GW))
        let r = 0
        let g = 0
        let b = 0
        for (let yy = y0; yy < y1; yy++)
          for (let xx = x0; xx < x1; xx++) {
            const p = (yy * PW + xx) * 4
            r += px[p]
            g += px[p + 1]
            b += px[p + 2]
          }
        const n = (y1 - y0) * (x1 - x0)
        const o = (gy * GW + gx) * 3
        grid[o] = r / n
        grid[o + 1] = g / n
        grid[o + 2] = b / n
      }
    }
    // Four-neighbor unsharp mask in one pass, written to gridBlur and swapped in.
    const row = GW * 3
    for (let gy = 0; gy < GH; gy++) {
      const up = gy > 0 ? -row : 0
      const down = gy < GH - 1 ? row : 0
      for (let gx = 0; gx < GW; gx++) {
        const left = gx > 0 ? -3 : 0
        const right = gx < GW - 1 ? 3 : 0
        const o = (gy * GW + gx) * 3
        for (let c = o; c < o + 3; c++) {
          const v = grid[c]
          const out = v + (v * 4 - grid[c + up] - grid[c + down] - grid[c + left] - grid[c + right]) * (SHARPEN / 4)
          gridBlur[c] = out < 0 ? 0 : out > 255 ? 255 : out
        }
      }
    }
    const swap = grid
    grid = gridBlur
    gridBlur = swap
  }
  let imagePixels = new Uint8Array(0)
  let pool: NativeImagePool | undefined
  let savedTransport: KittyImageTransport | undefined
  let nextImage: ReturnType<NativeImagePool["publishRgba"]> | undefined
  let layerPlaced = false
  let reservation = 0
  let layer: { dispose(): void } | undefined

  // Called while OpenCode renders, before anything else draws: one full-screen placement of the latest image.
  const layerStats = { calls: 0, placed: 0, noImage: 0 }
  const drawLayer = (buffer: OptimizedBuffer) => {
    layerStats.calls++
    if (!nextImage) layerStats.noImage++
    if (!scene || !nextImage || !pixelMode()) return
    const resolution = renderer.resolution!
    const placed = buffer.drawImage(
      nextImage,
      0,
      0,
      buffer.width,
      buffer.height,
      Math.round(resolution.width),
      Math.round(resolution.height),
      0,
      0,
      nextImage.width,
      nextImage.height,
      "kitty",
    )
    if (!placed) {
      return
    }
    layerStats.placed++
    layerPlaced = true
    reservation = buffer.buffers.char[0]
  }

  const pixelMode = () => {
    const setting = process.env.WALLPAPER_PIXELS
    if (setting === "0") return false
    const resolution = renderer.resolution
    if (!resolution || resolution.width <= 0 || resolution.height <= 0) return false
    // Opt-in: the character-cell renderer is the default look.
    return setting === "1" && renderer.capabilities?.kitty_graphics === true
  }

  // Builds the scene image with the text scrim and tints baked in, for the cells marked in imageCell.
  const publishImage = (px: Uint8Array, PW: number, PH: number, W: number, H: number, MH: number) => {
    if (imagePixels.length !== PW * PH * 4) imagePixels = new Uint8Array(PW * PH * 4)
    const img = imagePixels
    const cw = PW / W
    const chh = PH / H
    for (let iy = 0; iy < PH; iy++) {
      const row = Math.min(H - 1, Math.floor(iy / chh))
      const depth = row / Math.max(1, H - 1)
      const [deepR, deepG, deepB] = scrimAt(wallpaper!.scrim[settings!.time], depth)
      const my = clamp01((iy + 0.5) / (chh / 2) - 0.5, MH - 1)
      const my0 = Math.floor(my)
      const my1 = Math.min(MH - 1, my0 + 1)
      const fy = my - my0
      for (let ix = 0; ix < PW; ix++) {
        const col = Math.min(W - 1, Math.floor(ix / cw))
        const ci = row * W + col
        const mx = clamp01((ix + 0.5) / cw - 0.5, W - 1)
        const mx0 = Math.floor(mx)
        const mx1 = Math.min(W - 1, mx0 + 1)
        const fx = mx - mx0
        const m =
          (mask[my0 * W + mx0] * (1 - fx) + mask[my0 * W + mx1] * fx) * (1 - fy) +
          (mask[my1 * W + mx0] * (1 - fx) + mask[my1 * W + mx1] * fx) * fy
        const k = SCRIM * Math.min(1, m * SCRIM_GAIN)
        const p = (iy * PW + ix) * 4
        img[p] = EMPTY[px[p]] * (1 - k) + deepR * k
        img[p + 1] = EMPTY[px[p + 1]] * (1 - k) + deepG * k
        img[p + 2] = EMPTY[px[p + 2]] * (1 - k) + deepB * k
        img[p + 3] = 255
        applyTint(img, p, cellTint[ci])
      }
    }
    if (!pool || pool.width !== PW || pool.height !== PH) {
      pool?.dispose()
      pool = new NativeImagePool({ width: PW, height: PH, capacity: 3 })
    }
    if (savedTransport === undefined) {
      savedTransport = renderer.kittyImageTransport
      renderer.kittyImageTransport = (process.env.WALLPAPER_TRANSPORT as KittyImageTransport | undefined) ?? "file"
    }
    return pool.publishRgba(img) ?? undefined
  }

  let timer: ReturnType<typeof setInterval> | undefined

  const tintOf = (k: number) => {
    const cached = tints.get(k)
    if (cached !== undefined) return cached
    let result = NO_TINT
    if (surfaces.has(k)) result = packTint(0, 0, 0)
    else if (k >= 0) {
      const r = (k >> 16) & 255
      const g = (k >> 8) & 255
      const b = k & 255
      let nearest = NO_TINT
      let best = TINT_RANGE + 1
      for (const c of surfaces.has(base) ? surfaces : [...surfaces, base]) {
        if (c < 0) continue
        const d = Math.abs(r - ((c >> 16) & 255)) + Math.abs(g - ((c >> 8) & 255)) + Math.abs(b - (c & 255))
        if (d < best) ((best = d), (nearest = c))
      }
      if (nearest !== NO_TINT && surfaces.has(nearest))
        result = packTint(r - ((nearest >> 16) & 255), g - ((nearest >> 8) & 255), b - (nearest & 255))
    }
    tints.set(k, result)
    return result
  }

  const debug = process.env.WALLPAPER_DEBUG
  const log = (line: string) => {
    if (debug) appendFileSync(debug, `${line}\n`)
  }
  log(`host renderable: ${renderer.root instanceof Renderable}`)
  const postProcess = (buf: OptimizedBuffer) => {
    try {
      render(buf)
    } catch (error) {
      log(`error: ${error instanceof Error ? error.stack : String(error)}`)
    }
  }
  const render = (buf: OptimizedBuffer) => {
    if (!scene) return
    const W = buf.width
    const H = buf.height
    if (W < 4 || H < 2) return
    const pixels = pixelMode()
    const targetW = pixels ? W * PX_W : W * 2 * SUPERSAMPLE
    const targetH = pixels ? H * PX_H : H * 4 * SUPERSAMPLE
    const target = `${targetW}x${targetH}`
    const resized = target !== lastTarget
    lastTarget = target
    scene.resize(targetW, targetH)
    // The scene advances at most FPS times a second; redraws in between (typing, UI updates) reuse the last frame.
    const now = performance.now()
    const px = scene.pixels
    const advanced = resized || now - lastStep >= 1000 / FPS - 2
    if (advanced) {
      const dt = lastStep ? Math.min(0.2, (now - lastStep) / 1000) : 1 / FPS
      lastStep = now
      scene.step(dt)
      scene.render()
    }
    paint(buf, px, scene.W, scene.H, advanced, pixels, DESATURATE[settings!.time])
  }

  // Everything after the scene has drawn its frame. It never touches the scene object: each wallpaper's scene is a
  // different class, and the optimizer would otherwise fall back to slow code for this whole function after a switch.
  const paint = (buf: OptimizedBuffer, px: Uint8Array, PW: number, PH: number, advanced: boolean, pixels: boolean, desaturate: number) => {
    const W = buf.width
    const H = buf.height
    if (advanced) {
      const fresh = history.length !== px.length
      if (fresh) history = new Float32Array(px.length)
      for (let p = 0; p < px.length; p += 4) {
        const l = px[p] * 0.2126 + px[p + 1] * 0.7152 + px[p + 2] * 0.0722
        for (let c = 0; c < 3; c++) {
          const v = px[p + c] + (l - px[p + c]) * desaturate
          const h = fresh ? v : history[p + c] * PERSISTENCE + v * (1 - PERSISTENCE)
          history[p + c] = h
          px[p + c] = h
        }
      }
    }
    const GW = W * 2
    const GH = H * 4
    if (advanced || grid.length !== GW * GH * 3) buildGrid(px, PW, PH, GW, GH)
    const { char, fg, bg } = buf.buffers
    const cells = W * H

    if (frames++ % 10 === 0) {
      counts.clear()
      for (let i = 0; i < cells; i++) {
        const k = key(bg, i * 4)
        counts.set(k, (counts.get(k) ?? 0) + 1)
      }
      base = -2
      let best = 0
      for (const [k, n] of counts) if (n > best) ((best = n), (base = k))
      surfaces.clear()
      tints.clear()
      surfaces.add(base)
      for (const [k, n] of counts) if (k !== base && n > cells * 0.002 && isSurface(k)) surfaces.add(k)
    }

    // Soft scrim: a blurred mask of where text is, at half-cell vertical resolution. The scene fades to
    // near-black under and around text with no hard edge, so letters and the spaces between them match.
    const MH = H * 2
    if (mask.length < W * MH) {
      mask = new Float32Array(W * MH)
      scratch = new Float32Array(W * MH)
      surface = new Uint8Array(W * H)
      cellTint = new Int32Array(W * H)
    }
    if (previousMask.length !== cells) previousMask = new Int16Array(cells).fill(-1)
    mask.fill(0, 0, W * MH)
    for (let i = 0; i < cells; i++) {
      const tint = tintOf(key(bg, i * 4))
      const on = tint !== NO_TINT
      surface[i] = on ? 1 : 0
      cellTint[i] = tint
      if (!on || char[i] === SPACE || (isBlock(char[i]) && tintOf(fgKey(fg, i * 4)) !== NO_TINT)) continue
      const x = i % W
      const y = (i / W) | 0
      mask[y * 2 * W + x] = 1
      mask[(y * 2 + 1) * W + x] = 1
    }
    for (let pass = 0; pass < 2; pass++) {
      blurRows(mask, scratch, W, MH, SCRIM_X)
      blurColumns(scratch, mask, W, MH, SCRIM_Y)
    }

    const cursor = renderer.getCursorState()
    const cursorX = cursor.visible ? cursor.x - 1 : -1
    const cursorY = cursor.visible ? cursor.y - 1 : -1
    const atCursor = (x: number, y: number) => cursor.visible && (x === cursorX || x === cursorX + 1) && (y === cursorY || y === cursorY + 1)

    // Real-pixel mode: empty surface cells show an actual image of the scene; everything else stays character cells.
    if (imageCell.length !== cells) imageCell = new Uint8Array(cells)
    imageCell.fill(0)
    if (pixels && layerPlaced && reservation !== 0) {
      // Only plain space cells are re-reserved: writing a marker over a space never touches shared glyph state.
      for (let i = 0; i < cells; i++) {
        if (!surface[i] || char[i] !== SPACE || atCursor(i % W, (i / W) | 0)) continue
        imageCell[i] = 1
        char[i] = reservation
      }
    }
    layerPlaced = false

    const q = quad
    for (let y = 0; y < H; y++) {
      const mTop = y * 2 * W
      const mBottom = (y * 2 + 1) * W
      const [deepR, deepG, deepB] = scrimAt(wallpaper!.scrim[settings!.time], y / Math.max(1, H - 1))
      for (let x = 0; x < W; x++) {
        const i = y * W + x
        if (imageCell[i]) continue
        const o = i * 4
        const ch = char[i]
        const edgeTint = isBlock(ch) ? tintOf(fgKey(fg, o)) : NO_TINT
        const edge = edgeTint !== NO_TINT
        if (!surface[i] && !edge) continue
        const st = SCRIM * Math.min(1, mask[mTop + x] * SCRIM_GAIN)
        const sb = SCRIM * Math.min(1, mask[mBottom + x] * SCRIM_GAIN)
        // Eight square sub-pixels per cell, 2 wide by 4 tall, in row-major order.
        for (let s = 0; s < 8; s++) {
          const a = ((y * 4 + (s >> 1)) * GW + x * 2 + (s & 1)) * 3
          const k = s < 4 ? st : sb
          q[s * 3] = EMPTY[grid[a] | 0] * (1 - k) + deepR * k
          q[s * 3 + 1] = EMPTY[grid[a + 1] | 0] * (1 - k) + deepG * k
          q[s * 3 + 2] = EMPTY[grid[a + 2] | 0] * (1 - k) + deepB * k
        }
        if (edge && (ch === UPPER_HALF || ch === LOWER_HALF)) {
          const f = ch === UPPER_HALF ? 0 : 12
          const g = ch === UPPER_HALF ? 12 : 0
          for (let c = 0; c < 3; c++) fg[o + c] = (q[f + c] + q[f + 3 + c] + q[f + 6 + c] + q[f + 9 + c]) / 4
          fg[o + 3] = 255
          applyTint(fg, o, edgeTint)
          if (surface[i]) {
            for (let c = 0; c < 3; c++) bg[o + c] = (q[g + c] + q[g + 3 + c] + q[g + 6 + c] + q[g + 9 + c]) / 4
            bg[o + 3] = 255
            applyTint(bg, o, cellTint[i])
          }
          continue
        }
        if (edge) {
          for (let c = 0; c < 3; c++) fg[o + c] = mean8(q, c)
          fg[o + 3] = 255
          applyTint(fg, o, edgeTint)
          if (!surface[i]) continue
        }
        if (ch === SPACE && !atCursor(x, y)) {
          if (octants) previousMask[i] = writeOctant(q, order, previousMask[i], char, fg, bg, i, o)
          else writeQuadrant(q, char, fg, bg, i, o)
          applyTint(bg, o, cellTint[i])
          if (char[i] !== SPACE) applyTint(fg, o, cellTint[i])
          continue
        }
        for (let c = 0; c < 3; c++) bg[o + c] = mean8(q, c)
        bg[o + 3] = 255
        applyTint(bg, o, cellTint[i])
      }
    }

    // Build next frame's image now; the back layer places it before OpenCode draws, so text lands on top.
    if (pixels && (advanced || !nextImage)) {
      const image = publishImage(px, PW, PH, W, H, MH)
      if (image) {
        nextImage?.dispose()
        nextImage = image
      }
    }
    if (debug && frames % 30 === 0)
      log(`frame ${frames} pixels=${pixels} imageCells=${imageCell.reduce((n, v) => n + v, 0)} layer=${JSON.stringify(layerStats)} reservation=${reservation.toString(16)} resolution=${JSON.stringify(renderer.resolution)} kitty=${renderer.capabilities?.kitty_graphics}`)

    if (options.dump && !dumped && frames > 120) {
      dumped = true
      void Bun.write(
        options.dump,
        // Characters beyond ASCII live in a grapheme pool, so the frame's text comes along to recover them.
        JSON.stringify({ W, H, char: Array.from(char), text: new TextDecoder().decode(buf.getRealCharBytes(true)), fg: Array.from(fg, (v) => v & 255), bg: Array.from(bg, (v) => v & 255) }),
      )
    }
  }

  const engine: Engine = {
    get wallpaper() {
      return wallpaper
    },
    start(next, chosen) {
      if (wallpaper === next && settings?.activity === chosen.activity && settings.time === chosen.time && settings.season === chosen.season && settings.weather === chosen.weather) return
      engine.stop()
      wallpaper = next
      settings = chosen
      scene = next.create(chosen)
      renderer.addPostProcessFn(postProcess)
      lastStep = 0
      lastTarget = ""
      history = new Float32Array(0)
      previousMask = new Int16Array(0)
      timer = setInterval(() => renderer.requestRender(), 1000 / FPS)
      layer = (options.layer ?? createLayer)(renderer, drawLayer)
    },
    stop() {
      if (!scene) return
      wallpaper = undefined
      settings = undefined
      scene = undefined
      renderer.removePostProcessFn(postProcess)
      clearInterval(timer)
      timer = undefined
      layer?.dispose()
      layer = undefined
      nextImage?.dispose()
      nextImage = undefined
      pool?.dispose()
      pool = undefined
      if (savedTransport !== undefined) renderer.kittyImageTransport = savedTransport
      savedTransport = undefined
      renderer.requestRender()
    },
  }
  return engine
}

// The scrim color at a depth (0 top, 1 bottom), blending top to middle to bottom.
function scrimAt(scrim: Scrim, depth: number): RGB {
  const upper = depth < 0.5
  const from = upper ? scrim[0] : scrim[1]
  const to = upper ? scrim[1] : scrim[2]
  const t = upper ? depth * 2 : depth * 2 - 1
  return [from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t, from[2] + (to[2] - from[2]) * t]
}
