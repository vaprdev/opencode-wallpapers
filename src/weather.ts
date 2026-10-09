// Weather shared by outdoor wallpapers: an overcast cloud deck, rain streaks with splashes, snow and fog. A scene makes
// one WeatherLayer, calls cover() in layout right after painting its sky, step() with its scaled dt, and draw() at the
// end of render, just before finish().
import type { Time, Weather } from "./engine"
import { clamp, fbm2, hash, smoothstep, type RGB } from "./math"

interface Palette {
  deck: [top: RGB, bottom: RGB]
  // Scene clouds under the deck become ragged scud: lit tops and dark undersides.
  scud: [top: RGB, bottom: RGB]
  rain: RGB
  snow: RGB
  fog: RGB
  desaturate: number
}

const PALETTES: Record<Time, Palette> = {
  day: {
    deck: [
      [0.3, 0.34, 0.41],
      [0.58, 0.62, 0.67],
    ],
    scud: [
      [0.5, 0.53, 0.58],
      [0.24, 0.26, 0.3],
    ],
    rain: [0.6, 0.68, 0.8],
    snow: [0.95, 0.97, 1],
    fog: [0.58, 0.62, 0.67],
    desaturate: 0.35,
  },
  sunset: {
    deck: [
      [0.06, 0.035, 0.07],
      [0.42, 0.18, 0.14],
    ],
    scud: [
      [0.3, 0.12, 0.12],
      [0.05, 0.025, 0.05],
    ],
    rain: [0.9, 0.45, 0.25],
    snow: [1, 0.66, 0.6],
    fog: [0.34, 0.16, 0.14],
    desaturate: 0.2,
  },
  // Night weather is tinted, never white or gray, so it reads apart from light text.
  night: {
    deck: [
      [0.005, 0.009, 0.028],
      [0.022, 0.04, 0.1],
    ],
    scud: [
      [0.03, 0.05, 0.12],
      [0.004, 0.007, 0.02],
    ],
    rain: [0.12, 0.32, 0.95],
    snow: [0.25, 0.45, 0.9],
    fog: [0.02, 0.055, 0.13],
    desaturate: 0,
  },
}

// How much of the sky each kind hides, how much it dims and grays the scene (gray is scaled by the palette's
// desaturate), how thick the fog is, and how dense rain and snow are.
const KINDS: Record<Weather, { cover: number; dim: number; gray: number; fog: number; rain: number; snow: number }> = {
  clear: { cover: 0, dim: 1, gray: 0, fog: 0, rain: 0, snow: 0 },
  overcast: { cover: 0.88, dim: 0.82, gray: 0.5, fog: 0.06, rain: 0, snow: 0 },
  rain: { cover: 0.985, dim: 0.7, gray: 0.7, fog: 0.14, rain: 1, snow: 0 },
  snow: { cover: 0.85, dim: 0.9, gray: 0.5, fog: 0.12, rain: 0, snow: 1 },
  fog: { cover: 0.55, dim: 0.92, gray: 0.4, fog: 0.62, rain: 0, snow: 0 },
}

// Particles per screen height of width at full strength; the arrays hold enough for very wide terminals.
const RAIN = 110
const SNOW = 80
const MAX_ASPECT = 5
const SPLASHES = 128
const SPLASH_LIFE = 0.3
const WISP_N = 1024
const WISP_A = buildWisps(5)
const WISP_B = buildWisps(17)

export class WeatherLayer {
  // Whether a cloud deck hides the sky; scenes skip their stars when it does and color their clouds as scud.
  readonly covered: boolean
  readonly scud: [top: RGB, bottom: RGB] | undefined
  private readonly palette: Palette
  private readonly kind: (typeof KINDS)[Weather]
  private time = 0
  private aspect = 1
  // Rain drops as x (fraction of the width), y (screen heights) and depth; flakes add a sway seed.
  private readonly drops: Float32Array
  private readonly flakes: Float32Array
  // A ring of splashes: x (fraction of the width), y (screen heights), age (negative when unused) and depth.
  private readonly splashes = new Float32Array(SPLASHES * 4).fill(-1)
  private nextSplash = 0
  private fogRows = new Float32Array(0)
  private rainCount = 0
  private snowCount = 0

  // light: a seasonal shower or flurry, with no cloud deck, grading or fog.
  constructor(
    weather: Weather,
    time: Time,
    private readonly horizon: number,
    light = false,
  ) {
    const kind = KINDS[weather]
    this.kind = light ? { cover: 0, dim: 1, gray: 0, fog: 0, rain: kind.rain * 0.5, snow: kind.snow * 0.55 } : kind
    this.covered = this.kind.cover > 0
    this.palette = PALETTES[time]
    this.scud = this.covered ? this.palette.scud : undefined
    this.drops = new Float32Array(this.kind.rain ? RAIN * MAX_ASPECT * 3 : 0)
    for (let i = 0; i < this.drops.length; i += 3) {
      this.drops[i] = Math.random()
      this.drops[i + 1] = Math.random() * 1.2 - 0.2
      this.drops[i + 2] = Math.random()
    }
    this.flakes = new Float32Array(this.kind.snow ? SNOW * MAX_ASPECT * 4 : 0)
    for (let i = 0; i < this.flakes.length; i += 4) {
      this.flakes[i] = Math.random()
      this.flakes[i + 1] = Math.random()
      this.flakes[i + 2] = Math.random()
      this.flakes[i + 3] = Math.random()
    }
  }

  step(dt: number) {
    this.time += dt
    const d = this.drops
    for (let i = 0; i < this.rainCount * 3; i += 3) {
      const z = d[i + 2]
      const fall = (1.4 + z * 1.2) * dt
      d[i + 1] += fall
      d[i] += (fall * 0.12) / this.aspect
      const ground = this.horizon + 0.03 + (1.02 - this.horizon) * z
      if (d[i + 1] < ground) continue
      // Nearer drops splash where they land; the rest just vanish into the scene.
      if (z > 0.3 && Math.random() < 0.4) {
        const s = this.nextSplash * 4
        this.splashes[s] = d[i]
        this.splashes[s + 1] = ground
        this.splashes[s + 2] = 0
        this.splashes[s + 3] = z
        this.nextSplash = (this.nextSplash + 1) % SPLASHES
      }
      d[i] = Math.random()
      d[i + 1] = -0.05 - Math.random() * 0.15
    }
    for (let s = 0; s < this.splashes.length; s += 4) if (this.splashes[s + 2] >= 0) this.splashes[s + 2] += dt
    const f = this.flakes
    for (let i = 0; i < this.snowCount * 4; i += 4) {
      f[i + 1] += (0.04 + f[i + 2] * 0.06) * dt
      f[i] += ((Math.sin(this.time * 0.6 + f[i + 3] * 20) * 0.008 + 0.005) * dt) / this.aspect
      if (f[i + 1] > 1.02) {
        f[i + 1] -= 1.04
        f[i] = Math.random()
      }
      if (f[i] > 1) f[i] -= 1
    }
  }

  // A cloud deck over the sky down to the horizon, lumpy and lighter toward the horizon; call it after the sky.
  cover(hdr: Float32Array, W: number, H: number) {
    if (this.covered) paintDeck(hdr, W, H, this.horizon, this.kind.cover, this.palette.deck[0], this.palette.deck[1])
  }

  // Grading and fog over the whole frame, then snow, rain and splashes.
  draw(hdr: Float32Array, W: number, H: number) {
    if (this.fogRows.length !== H) {
      this.aspect = W / H
      this.rainCount = Math.min(MAX_ASPECT * RAIN, Math.round(RAIN * this.kind.rain * this.aspect))
      this.snowCount = Math.min(MAX_ASPECT * SNOW, Math.round(SNOW * this.kind.snow * this.aspect))
      // Fog is thickest in a band at the horizon and thins toward the foreground.
      this.fogRows = new Float32Array(H)
      for (let y = 0; y < H; y++) {
        const v = y / H
        const band = Math.exp(-(((v - this.horizon) / 0.16) ** 2))
        this.fogRows[y] = this.kind.fog * (0.45 + 0.55 * band) * (v > this.horizon ? 1 - 0.5 * smoothstep(this.horizon, 1, v) : 1)
      }
    }
    const p = this.palette
    const k = this.kind
    if (k.dim < 1 || k.fog > 0) grade(hdr, W, H, k.dim, p.desaturate * k.gray, p.fog, this.fogRows, this.time)
    const f = this.flakes
    for (let i = 0; i < this.snowCount * 4; i += 4) {
      const z = f[i + 2]
      const b = (0.25 + z * 0.45) * (0.6 + 0.4 * f[i + 3])
      flake(hdr, W, H, f[i] * W, f[i + 1] * H, p.snow[0], p.snow[1], p.snow[2], b)
    }
    const d = this.drops
    for (let i = 0; i < this.rainCount * 3; i += 3) {
      const z = d[i + 2]
      const len = (0.025 + z * 0.035) * H
      const b = 0.05 + z * 0.12
      streak(hdr, W, H, d[i] * W, d[i + 1] * H, len * 0.12, len, p.rain[0] * b, p.rain[1] * b, p.rain[2] * b)
    }
    const s = this.splashes
    for (let i = 0; i < s.length; i += 4) {
      const age = s[i + 2]
      if (age < 0) continue
      if (age > SPLASH_LIFE) {
        s[i + 2] = -1
        continue
      }
      const t = age / SPLASH_LIFE
      const b = (1 - t) * (0.12 + s[i + 3] * 0.2)
      splash(hdr, W, H, s[i] * W, s[i + 1] * H, (0.003 + s[i + 3] * 0.006) * H * (0.6 + t * 1.6), t, p.rain[0] * b, p.rain[1] * b, p.rain[2] * b)
    }
  }
}

function paintDeck(hdr: Float32Array, W: number, H: number, horizon: number, cover: number, top: RGB, bottom: RGB) {
  for (let y = 0; y < Math.min(H, Math.ceil(horizon * H)); y++) {
    const v = y / H
    const g = smoothstep(0, horizon, v)
    const k = cover * (1 - 0.3 * smoothstep(horizon - 0.1, horizon, v))
    for (let x = 0; x < W; x++) {
      // Rounded cloud bases, stretched wide and growing toward the horizon.
      const lump = 0.8 + 0.4 * fbm2((x / H) * 3.5, v * 12 + (x / H) * 0.6, 4)
      const o = (y * W + x) * 3
      hdr[o] += ((top[0] + (bottom[0] - top[0]) * g) * lump - hdr[o]) * k
      hdr[o + 1] += ((top[1] + (bottom[1] - top[1]) * g) * lump - hdr[o + 1]) * k
      hdr[o + 2] += ((top[2] + (bottom[2] - top[2]) * g) * lump - hdr[o + 2]) * k
    }
  }
}

// Dims and desaturates the frame, then mixes in fog by row, thickened by two slowly drifting wisp patterns.
function grade(hdr: Float32Array, W: number, H: number, dim: number, desaturate: number, fog: RGB, rows: Float32Array, time: number) {
  const drift = time * 5
  for (let y = 0; y < H; y++) {
    const base = rows[y]
    for (let x = 0; x < W; x++) {
      const o = (y * W + x) * 3
      const r = hdr[o]
      const g = hdr[o + 1]
      const b = hdr[o + 2]
      const l = r * 0.2126 + g * 0.7152 + b * 0.0722
      const wisp = WISP_A[((x * 0.7 + y * 0.25 + drift) | 0) & (WISP_N - 1)] * WISP_B[((x * 0.45 - y * 0.15 - drift * 0.6 + 400) | 0) & (WISP_N - 1)]
      const f = clamp(base * (0.7 + 0.9 * wisp), 0, 0.95)
      hdr[o] = ((r + (l - r) * desaturate) * dim) * (1 - f) + fog[0] * f
      hdr[o + 1] = ((g + (l - g) * desaturate) * dim) * (1 - f) + fog[1] * f
      hdr[o + 2] = ((b + (l - b) * desaturate) * dim) * (1 - f) + fog[2] * f
    }
  }
}

// A rain streak from its head at (x, y) back up along (dx, dy), fading toward the tail, split across two columns.
function streak(hdr: Float32Array, W: number, H: number, x: number, y: number, dx: number, dy: number, r: number, g: number, b: number) {
  const n = Math.ceil(dy)
  for (let i = 0; i < n; i++) {
    const t = i / n
    const py = (y - dy * t) | 0
    if (py < 0 || py >= H) continue
    const px = x - dx * t - 0.5
    const x0 = Math.floor(px)
    const fx = px - x0
    const k = 1 - t
    if (x0 >= 0 && x0 < W) {
      const o = (py * W + x0) * 3
      hdr[o] += r * k * (1 - fx)
      hdr[o + 1] += g * k * (1 - fx)
      hdr[o + 2] += b * k * (1 - fx)
    }
    if (x0 + 1 >= 0 && x0 + 1 < W) {
      const o = (py * W + x0 + 1) * 3
      hdr[o] += r * k * fx
      hdr[o + 1] += g * k * fx
      hdr[o + 2] += b * k * fx
    }
  }
}

// A splash: a flattened ring spreading out from where a drop landed, and two droplets thrown up and out.
function splash(hdr: Float32Array, W: number, H: number, x: number, y: number, rx: number, t: number, r: number, g: number, b: number) {
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2
    const px = (x + Math.cos(a) * rx) | 0
    const py = (y + Math.sin(a) * rx * 0.3) | 0
    if (px < 0 || py < 0 || px >= W || py >= H) continue
    const o = (py * W + px) * 3
    hdr[o] += r
    hdr[o + 1] += g
    hdr[o + 2] += b
  }
  const up = Math.sin(t * Math.PI) * rx * 0.9
  for (const side of [-1, 1]) {
    const px = (x + side * rx * 0.7) | 0
    const py = (y - up) | 0
    if (px < 0 || py < 0 || px >= W || py >= H) continue
    const o = (py * W + px) * 3
    hdr[o] += r * 2
    hdr[o + 1] += g * 2
    hdr[o + 2] += b * 2
  }
}

// A soft snowflake mixed over the four pixels around (x, y).
function flake(hdr: Float32Array, W: number, H: number, x: number, y: number, r: number, g: number, b: number, a: number) {
  const px = x - 0.5
  const py = y - 0.5
  const x0 = Math.floor(px)
  const y0 = Math.floor(py)
  const fx = px - x0
  const fy = py - y0
  for (let j = 0; j < 2; j++)
    for (let i = 0; i < 2; i++) {
      const xi = x0 + i
      const yi = y0 + j
      if (xi < 0 || yi < 0 || xi >= W || yi >= H) continue
      const k = (i ? fx : 1 - fx) * (j ? fy : 1 - fy) * a
      const o = (yi * W + xi) * 3
      hdr[o] += (r - hdr[o]) * k
      hdr[o + 1] += (g - hdr[o + 1]) * k
      hdr[o + 2] += (b - hdr[o + 2]) * k
    }
}

// A wrapping strip of soft bumps around 0.5; two sliding past each other make drifting fog wisps.
function buildWisps(seed: number) {
  const tex = new Float32Array(WISP_N)
  for (let k = 0; k < 10; k++) {
    const c = hash(seed + k * 3.1) * WISP_N
    const w = 30 + hash(seed + k * 7.7) * 90
    const amp = 0.4 + hash(seed + k * 1.3) * 0.6
    for (let i = 0; i < WISP_N; i++) {
      const d = Math.min(Math.abs(i - c), WISP_N - Math.abs(i - c))
      tex[i] += amp * Math.exp(-(d * d) / (w * w))
    }
  }
  const max = tex.reduce((m, v) => Math.max(m, v), 0)
  return tex.map((v) => v / max)
}
