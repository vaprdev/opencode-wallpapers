import { Canvas } from "../src/canvas"
import { TAU, clamp, lerp, rand, smoothstep, type RGB } from "../src/math"
import { touch } from "../src/touched"
import type { Activity, Settings, Wallpaper } from "../src/wallpaper"

// The scene runs slower than real time, which keeps it calm behind text.
const TIME_SCALE = 0.35
// The disk's middle, in screen heights from the top, and its plane: circles there show as ellipses this flat, their
// long axis turned this far (radians, negative rises to the right).
const MIDDLE = 0.53
const FLAT = 0.36
const TILT = -0.11
// Angular speed, in radians per scene second, of an orbit half a screen height out; nearer ones turn faster.
const SPIN = 0.26
// The OpenCode app icon in the middle, its side in screen heights.
const LOGO = 0.15
// An orbiting app icon's side in screen heights.
const TILE = 0.032
// A finished task speeds the swirl up for this many scene seconds.
const SURGE = 4
// Clicked icons at most this many at once.
const EXTRAS = 8

// Streaks are pale and cool, warming to gold as they pass through the ember glow at the bottom right.
const COOL: RGB = [0.78, 0.8, 0.86]
const WARM: RGB = [1, 0.64, 0.34]
// The ember glow, in screen heights from the right edge and from the top, its radius, and its color.
const EMBER = { right: 0.2, y: 0.78, r: 0.6, color: [0.05, 0.02, 0.008] as RGB }

// Per activity: streaks, app icons and little OpenCode marks on a 16:9 screen.
const CAST: Record<Activity, { streaks: number; icons: number; marks: number }> = {
  calm: { streaks: 220, icons: 5, marks: 4 },
  lively: { streaks: 380, icons: 10, marks: 8 },
  teeming: { streaks: 460, icons: 14, marks: 12 },
}

type Glyph = "key" | "lock" | "shield" | "person" | "globe" | "doc" | "terminal" | "image" | "anthropic" | "meta" | "mistral" | "azure" | "dot" | "opencode"

// The little OpenCode marks' colors, each on a black tile like the big icon's.
const MARKS: RGB[] = [
  [1, 0.22, 0.16],
  [0.2, 0.85, 0.3],
  [0.12, 0.72, 1],
  [0.95, 0.25, 0.85],
  [1, 0.75, 0.12],
  [0.3, 0.42, 1],
  [1, 0.48, 0.1],
  [0.62, 0.32, 1],
]

// The app icons that drift through the disk: tools on dark tiles, and providers in their colors.
const ICONS: { tile: RGB; glyph: RGB; kind: Glyph }[] = [
  { tile: [0.085, 0.085, 0.095], glyph: [0.48, 0.48, 0.52], kind: "key" },
  { tile: [0.085, 0.085, 0.095], glyph: [0.48, 0.48, 0.52], kind: "lock" },
  { tile: [0.085, 0.085, 0.095], glyph: [0.48, 0.48, 0.52], kind: "shield" },
  { tile: [0.085, 0.085, 0.095], glyph: [0.48, 0.48, 0.52], kind: "person" },
  { tile: [0.085, 0.085, 0.095], glyph: [0.48, 0.48, 0.52], kind: "globe" },
  { tile: [0.085, 0.085, 0.095], glyph: [0.48, 0.48, 0.52], kind: "doc" },
  { tile: [0.085, 0.085, 0.095], glyph: [0.48, 0.48, 0.52], kind: "terminal" },
  { tile: [0.085, 0.085, 0.095], glyph: [0.48, 0.48, 0.52], kind: "image" },
  { tile: [0.085, 0.085, 0.095], glyph: [0.66, 0.66, 0.7], kind: "dot" },
  { tile: [0.55, 0.36, 0.25], glyph: [0.95, 0.85, 0.75], kind: "anthropic" },
  { tile: [0.06, 0.24, 0.7], glyph: [0.65, 0.8, 1], kind: "meta" },
  { tile: [0.8, 0.28, 0.07], glyph: [1, 0.78, 0.55], kind: "mistral" },
  { tile: [0.08, 0.38, 0.75], glyph: [0.85, 0.95, 1], kind: "azure" },
  { tile: [0.82, 0.52, 0.06], glyph: [0.3, 0.16, 0.02], kind: "doc" },
  { tile: [0.28, 0.28, 0.85], glyph: [0.85, 0.88, 1], kind: "globe" },
]

// A streak of light on its orbit: radius in screen heights (the ellipse's long half-axis), the angle of its head, how
// far back its tail reaches (radians), its brightness and how warm it starts.
interface Streak {
  r: number
  a: number
  span: number
  bright: number
  warm: number
}

// An orbiting icon: its orbit, which icon, how bright at most, and its age and life in scene seconds (it fades in and
// out over its life, then comes back somewhere else).
interface Icon {
  r: number
  a: number
  icon: { tile: RGB; glyph: RGB; kind: Glyph }
  bright: number
  age: number
  life: number
  extra: boolean
}

class Universe extends Canvas {
  private readonly cast: (typeof CAST)[Activity]
  private streaks: Streak[] = []
  private icons: Icon[] = []
  private stars: { x: number; y: number; b: number; tint: RGB }[] = []
  private surge = 0
  private time = 0
  // The middle icon, premultiplied color and coverage over its box, from layout().
  private logo = { x: 0, y: 0, w: 0, h: 0, rgba: new Float32Array(0) }

  constructor(settings: Settings) {
    super()
    this.supersample = 1
    this.cast = CAST[settings.activity]
  }

  // The farthest orbit that still reaches a corner of the screen.
  private reach() {
    return Math.hypot(this.A / 2 + 0.1, (0.5 + 0.08) / FLAT)
  }

  private streak(): Streak {
    const r = lerp(0.11, this.reach(), Math.random() ** 1.1)
    const length = 0.04 + 0.32 * Math.random() ** 2
    return { r, a: rand(0, TAU), span: Math.min(1.5, length / r), bright: 0.07 + 0.38 * Math.random() ** 2.2, warm: Math.random() < 0.16 ? rand(0.4, 1) : rand(0, 0.12) }
  }

  private icon(extra = false, mark = false): Icon {
    return {
      r: lerp(0.24, this.reach() * 0.85, Math.random() ** 1.2),
      a: rand(0, TAU),
      icon: mark ? { tile: [0.03, 0.03, 0.034], glyph: MARKS[Math.floor(Math.random() * MARKS.length)], kind: "opencode" } : ICONS[Math.floor(Math.random() * ICONS.length)],
      bright: mark ? rand(0.6, 1) : rand(0.35, 1),
      age: 0,
      life: rand(30, 60),
      extra,
    }
  }

  step(dt: number) {
    dt = clamp(dt, 0, 0.1) * TIME_SCALE
    this.time += dt
    this.stepGloom(dt)
    this.surge = Math.max(0, this.surge - dt)
    // After an error the swirl slows; a finished task whips it round for a moment.
    const pace = dt * SPIN * (1 - 0.6 * this.gloom) * (1 + 1.5 * this.rush())
    for (const s of this.streaks) s.a += pace * spin(s.r)
    for (const [i, c] of this.icons.entries()) {
      c.a += pace * 0.85 * spin(c.r)
      c.age += dt
      if (c.age < c.life) continue
      if (c.extra) c.life = 0
      if (!c.extra) this.icons[i] = this.icon(false, c.icon.kind === "opencode")
    }
    this.icons = this.icons.filter((c) => c.life > 0)
  }

  private rush() {
    return smoothstep(0, 1, this.surge) * smoothstep(SURGE, SURGE - 1, this.surge)
  }

  render() {
    this.restore()
    const { W, H, hdr } = this
    for (const s of this.stars) this.point(s.x * W, s.y * H, s.b * s.tint[0], s.b * s.tint[1], s.b * s.tint[2], s.b > 0.05 ? 2 : 1)
    const dim = (1 - 0.5 * this.gloom) * (1 + 0.2 * this.rush()) * (this.cells ? 1.15 : 1)
    const cx = (this.A / 2) * H
    const cy = MIDDLE * H
    const ex = (this.A - EMBER.right) * H
    const ey = EMBER.y * H
    const er = EMBER.r * H
    for (const s of this.streaks) {
      // On terminal cells the faintest streaks only add speckle that shimmers as it moves.
      if (this.cells && s.bright < 0.12) continue
      // Warmer where the head passes through the ember glow.
      const hx = cx + orbitX(s.r, s.a) * H
      const hy = cy + orbitY(s.r, s.a) * H
      const glow = Math.exp(-((hx - ex) ** 2 + (hy - ey) ** 2) / (er * er))
      const w = clamp(s.warm + 0.85 * glow, 0, 1)
      const k = s.bright * dim
      arc(hdr, W, H, cx, cy, s.r * H, s.a, s.span, lerp(COOL[0], WARM[0], w) * k, lerp(COOL[1], WARM[1], w) * k, lerp(COOL[2], WARM[2], w) * k)
    }
    const side = Math.max(TILE * H, this.cells ? 5 : 0)
    for (const c of this.icons) {
      const fade = smoothstep(0, 4, c.age) * smoothstep(c.life, c.life - 4, c.age) * c.bright * (1 - 0.5 * this.gloom)
      if (fade <= 0.01) continue
      const x = cx + orbitX(c.r, c.a) * H
      const y = cy + orbitY(c.r, c.a) * H
      // The marks are a little larger, so their ring and counter still read.
      const s = c.icon.kind === "opencode" ? side * 1.25 : side
      if (x < -s || y < -s || x > W + s || y > H + s) continue
      tile(hdr, W, H, x, y, s, c.icon.tile, c.icon.glyph, c.icon.kind, fade, this.cells ? 2 : 3)
      this.touch(x - s, y - s, x + s, y + s)
    }
    const logo = this.logo
    composite(hdr, W, H, logo.x, logo.y, logo.w, logo.h, logo.rgba)
    this.touch(logo.x, logo.y, logo.x + logo.w - 1, logo.y + logo.h - 1)
    this.finish()
  }

  // A finished task: the whole disk whips round for a moment.
  protected override visit() {
    this.surge = SURGE
  }

  // A click: a new icon appears under the pointer and joins the orbit there.
  poke(x: number, y: number) {
    if (this.icons.filter((c) => c.extra).length >= EXTRAS) return
    // Back from the screen into the disk's plane.
    const dx = x - this.A / 2
    const dy = y - MIDDLE
    const u = dx * Math.cos(TILT) + dy * Math.sin(TILT)
    const v = (-dx * Math.sin(TILT) + dy * Math.cos(TILT)) / FLAT
    this.icons.push({ ...this.icon(true), r: Math.max(0.15, Math.hypot(u, v)), a: Math.atan2(v, u), bright: 1, life: 24 })
  }

  protected override layout() {
    const { W, H, hdr, A } = this
    const count = (n: number) => Math.round(n * clamp(A / (16 / 9), 0.6, 1.6))
    const streaks = count(this.cast.streaks)
    this.streaks = [...this.streaks.slice(0, streaks), ...Array.from({ length: Math.max(0, streaks - this.streaks.length) }, () => this.streak())]
    const fill = (n: number, mark: boolean) => {
      const own = this.icons.filter((c) => !c.extra && (c.icon.kind === "opencode") === mark)
      return [...own.slice(0, n), ...Array.from({ length: Math.max(0, n - own.length) }, () => ({ ...this.icon(false, mark), age: rand(0, 30) }))]
    }
    this.icons = [...fill(count(this.cast.icons), false), ...fill(count(this.cast.marks), true), ...this.icons.filter((c) => c.extra)]
    if (!this.stars.length)
      this.stars = Array.from({ length: count(140) }, () => ({
        x: rand(0, 1),
        y: rand(0, 1),
        b: rand(0.015, 0.07),
        tint: [[0.9, 0.85, 0.8], [0.8, 0.85, 1], [1, 0.8, 0.6]][Math.floor(Math.random() * 3)] as RGB,
      }))
    // Near-black space, a faint haze over the disk, and the ember glow at the bottom right.
    for (let y = 0; y < H; y++) {
      const v = (y + 0.5) / H
      for (let x = 0; x < W; x++) {
        const u = (x + 0.5) / H
        const dx = u - A / 2
        const dy = v - MIDDLE
        const pu = dx * Math.cos(TILT) + dy * Math.sin(TILT)
        const pv = (-dx * Math.sin(TILT) + dy * Math.cos(TILT)) / FLAT
        const disk = Math.exp(-(pu * pu + pv * pv) / 0.35)
        const ember = Math.exp(-((u - (A - EMBER.right)) ** 2 + (v - EMBER.y) ** 2) / (EMBER.r * EMBER.r))
        const o = (y * W + x) * 3
        hdr[o] = 0.026 + 0.012 * disk + EMBER.color[0] * ember
        hdr[o + 1] = 0.04 + 0.012 * disk + EMBER.color[1] * ember
        hdr[o + 2] = 0.042 + 0.016 * disk + EMBER.color[2] * ember
      }
    }
    this.logo = paintLogo(W, H, (A / 2) * H, MIDDLE * H, LOGO * H)
  }
}

// How fast an orbit r screen heights out turns, relative to SPIN.
function spin(r: number) {
  return (0.5 / Math.max(r, 0.11)) ** 1.1
}

// Where the point at angle a on the orbit of radius r falls, relative to the disk's middle, in screen heights.
function orbitX(r: number, a: number) {
  return r * (Math.cos(a) * Math.cos(TILT) - Math.sin(a) * FLAT * Math.sin(TILT))
}

function orbitY(r: number, a: number) {
  return r * (Math.cos(a) * Math.sin(TILT) + Math.sin(a) * FLAT * Math.cos(TILT))
}

// A streak along the orbit of radius r pixels around (cx, cy), its head at angle a and its tail span radians behind,
// brightest just behind the head and fading to nothing at the tail. Shares each sample's light between the four pixels
// around it, so it glides, and marks what it draws in runs.
function arc(hdr: Float32Array, W: number, H: number, cx: number, cy: number, r: number, a: number, span: number, cr: number, cg: number, cb: number) {
  const n = Math.max(2, Math.min(500, Math.ceil((span * r) / 0.7)))
  const step = span / n
  const cs = Math.cos(step)
  const sn = Math.sin(step)
  const ct = Math.cos(TILT)
  const st = Math.sin(TILT)
  // Walk from the tail to the head by rotating the unit vector a step at a time.
  let c = Math.cos(a - span)
  let s = Math.sin(a - span)
  let x0 = Infinity
  let y0 = Infinity
  let x1 = -Infinity
  let y1 = -Infinity
  for (let i = 0; i <= n; i++) {
    const t = i / n
    const k = t ** 1.4 * smoothstep(1, 0.93, t)
    const x = cx + r * (c * ct - s * FLAT * st) - 0.5
    const y = cy + r * (c * st + s * FLAT * ct) - 0.5
    const nc = c * cs - s * sn
    s = s * cs + c * sn
    c = nc
    if (k <= 0 || x < -1 || y < -1 || x >= W || y >= H) continue
    const xi = Math.floor(x)
    const yi = Math.floor(y)
    const fx = x - xi
    const fy = y - yi
    for (let j = 0; j < 2; j++) {
      const yy = yi + j
      if (yy < 0 || yy >= H) continue
      for (let q = 0; q < 2; q++) {
        const xx = xi + q
        if (xx < 0 || xx >= W) continue
        const w = (q ? fx : 1 - fx) * (j ? fy : 1 - fy) * k
        const o = (yy * W + xx) * 3
        hdr[o] += cr * w
        hdr[o + 1] += cg * w
        hdr[o + 2] += cb * w
      }
    }
    x0 = Math.min(x0, xi)
    y0 = Math.min(y0, yi)
    x1 = Math.max(x1, xi + 1)
    y1 = Math.max(y1, yi + 1)
    if (i % 16 && i < n) continue
    if (x1 >= x0) touch(hdr, x0, y0, x1, y1)
    x0 = Infinity
    y0 = Infinity
    x1 = -Infinity
    y1 = -Infinity
  }
  if (x1 >= x0) touch(hdr, x0, y0, x1, y1)
}

// A rounded app icon side pixels across centered at (cx, cy), its glyph drawn over it, mixed over the scene by alpha.
function tile(hdr: Float32Array, W: number, H: number, cx: number, cy: number, side: number, color: RGB, ink: RGB, kind: Glyph, alpha: number, ss: number) {
  const half = side / 2 + 1
  const bx0 = Math.max(0, Math.floor(cx - half))
  const by0 = Math.max(0, Math.floor(cy - half))
  const bx1 = Math.min(W - 1, Math.ceil(cx + half))
  const by1 = Math.min(H - 1, Math.ceil(cy + half))
  const share = 1 / (ss * ss)
  for (let y = by0; y <= by1; y++)
    for (let x = bx0; x <= bx1; x++) {
      let r = 0
      let g = 0
      let b = 0
      let n = 0
      for (let j = 0; j < ss; j++)
        for (let i = 0; i < ss; i++) {
          const u = (x + (i + 0.5) / ss - cx) / side
          const v = (y + (j + 0.5) / ss - cy) / side
          if (roundBox(u, v, 0.5, 0.5, 0.15) > 0) continue
          // A faint lighter rim along the top edge.
          const lit = 1 + 0.6 * smoothstep(-0.38, -0.5, v)
          const on = kind === "opencode" ? mark(u, v) : glyph(kind, u, v) < 0 ? 1 : 0
          r += on ? ink[0] * on : color[0] * lit
          g += on ? ink[1] * on : color[1] * lit
          b += on ? ink[2] * on : color[2] * lit
          n++
        }
      if (!n) continue
      const cov = n * share * alpha
      const o = (y * W + x) * 3
      hdr[o] += (r / n - hdr[o]) * cov
      hdr[o + 1] += (g / n - hdr[o + 1]) * cov
      hdr[o + 2] += (b / n - hdr[o + 2]) * cov
    }
}

// How much of the ink color the OpenCode mark shows at (u, v) in tile units: its ring in full, its filled lower counter
// a darker shade, and nothing in its open top or off the mark.
function mark(u: number, v: number) {
  const U = u / 0.13
  const V = v / 0.13
  if (Math.abs(U) >= 2 || Math.abs(V) >= 2.5) return 0
  if (Math.abs(U) >= 1 || Math.abs(V) >= 1.5) return 1
  return V < -0.5 ? 0 : 0.35
}

// Signed distance (negative inside) to a glyph's strokes, in tile units with the tile from -0.5 to 0.5.
function glyph(kind: Glyph, u: number, v: number) {
  const w = 0.055
  if (kind === "key") return Math.min(Math.abs(Math.hypot(u + 0.1, v - 0.1) - 0.1), seg(u, v, -0.03, 0.03, 0.2, -0.2), seg(u, v, 0.11, -0.11, 0.18, -0.04)) - w
  if (kind === "lock") return Math.min(roundBox(u, v - 0.08, 0.16, 0.12, 0.03), v < 0 ? Math.abs(Math.hypot(u, v + 0.02) - 0.1) - w : Infinity)
  if (kind === "shield") return Math.max(Math.abs(u) - 0.16 + Math.max(0, v) * 0.6, v - 0.2, -v - 0.2)
  if (kind === "person") return Math.min(Math.hypot(u, v + 0.09) - 0.09, Math.max(Math.hypot(u, v - 0.24) - 0.17, v - 0.19))
  if (kind === "globe") return Math.min(Math.abs(Math.hypot(u, v) - 0.19), Math.abs(Math.hypot(u * 2.2, v) - 0.19), Math.abs(v) + (Math.abs(u) > 0.19 ? 1 : 0)) - w * 0.8
  if (kind === "doc") return Math.min(Math.abs(roundBox(u, v, 0.14, 0.19, 0.03)) - w * 0.8, seg(u, v, -0.06, -0.04, 0.06, -0.04) - w * 0.7, seg(u, v, -0.06, 0.06, 0.06, 0.06) - w * 0.7)
  if (kind === "terminal") return Math.min(seg(u, v, -0.16, -0.11, -0.04, 0), seg(u, v, -0.04, 0, -0.16, 0.11), seg(u, v, 0.02, 0.12, 0.17, 0.12)) - w
  if (kind === "image") return Math.min(Math.abs(roundBox(u, v, 0.19, 0.16, 0.03)) - w * 0.8, Math.hypot(u - 0.07, v + 0.05) - 0.04, seg(u, v, -0.14, 0.12, -0.02, 0.0) - w, seg(u, v, -0.02, 0.0, 0.12, 0.12) - w)
  if (kind === "anthropic") return Math.min(seg(u, v, -0.19, 0.18, -0.06, -0.18), seg(u, v, -0.06, -0.18, 0.05, 0.18), seg(u, v, -0.14, 0.06, 0.01, 0.06), seg(u, v, 0.06, -0.18, 0.19, 0.18)) - w
  if (kind === "meta") return Math.min(Math.abs(Math.hypot((u + 0.1) * 0.85, v) - 0.1), Math.abs(Math.hypot((u - 0.1) * 0.85, v) - 0.1)) - w
  if (kind === "mistral") return Math.min(seg(u, v, -0.18, 0.16, -0.18, -0.16), seg(u, v, -0.18, -0.16, 0, 0.04), seg(u, v, 0, 0.04, 0.18, -0.16), seg(u, v, 0.18, -0.16, 0.18, 0.16)) - w
  if (kind === "azure") return Math.max(Math.abs(u) * 1.1 - (v + 0.2) * 0.5, v - 0.17)
  return Math.hypot(u, v) - 0.2
}

// Distance from (u, v) to the segment from (ax, ay) to (bx, by).
function seg(u: number, v: number, ax: number, ay: number, bx: number, by: number) {
  const dx = bx - ax
  const dy = by - ay
  const t = clamp(((u - ax) * dx + (v - ay) * dy) / (dx * dx + dy * dy || 1), 0, 1)
  return Math.hypot(u - ax - dx * t, v - ay - dy * t)
}

// Signed distance to a box hx by hy from its middle, its corners rounded by rad.
function roundBox(u: number, v: number, hx: number, hy: number, rad: number) {
  const qx = Math.abs(u) - hx + rad
  const qy = Math.abs(v) - hy + rad
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - rad
}

// The OpenCode app icon, size pixels across, centered at (cx, cy): a glossy black rounded square with a little depth
// and the mark on it (its ring, its open top and its filled lower counter on a 4 by 5 grid of blocks), and a dark halo
// that the swirl fades into around it. Returns its box and premultiplied color and coverage per pixel.
function paintLogo(W: number, H: number, cx: number, cy: number, size: number) {
  const pad = size * 0.45
  const x = Math.max(0, Math.floor(cx - size / 2 - pad))
  const y = Math.max(0, Math.floor(cy - size / 2 - pad))
  const w = Math.min(W, Math.ceil(cx + size / 2 + pad)) - x
  const h = Math.min(H, Math.ceil(cy + size / 2 + pad)) - y
  const rgba = new Float32Array(Math.max(0, w * h * 4))
  const ss = 4
  // A block of the mark, in icon sides.
  const block = 0.46 / 4
  for (let py = 0; py < h; py++)
    for (let px = 0; px < w; px++) {
      let r = 0
      let g = 0
      let b = 0
      let a = 0
      for (let j = 0; j < ss; j++)
        for (let i = 0; i < ss; i++) {
          const u = (x + px + (i + 0.5) / ss - cx) / size
          const v = (y + py + (j + 0.5) / ss - cy) / size
          const body = roundBox(u, v, 0.5, 0.5, 0.22)
          if (body < 0) {
            const U = u / block
            const V = v / block
            const ring = Math.abs(U) < 2 && Math.abs(V) < 2.5
            const counter = Math.abs(U) < 1 && Math.abs(V) < 1.5
            // Glossy black, lit a little from above, with a bright rim along the top edge.
            const shade = 0.035 + 0.035 * smoothstep(0.5, -0.5, v) + 0.25 * smoothstep(-0.03, 0, body) * smoothstep(0.1, -0.5, v)
            const c = !ring ? [shade, shade, shade * 1.08] : counter && V < -0.5 ? [0.01, 0.01, 0.012] : counter ? [0.3, 0.3, 0.32] : [0.82 - 0.08 * (V / 2.5), 0.82 - 0.08 * (V / 2.5), 0.86 - 0.08 * (V / 2.5)]
            r += c[0]
            g += c[1]
            b += c[2]
            a += 1
            continue
          }
          // The icon's thickness shows as a darker lip below it.
          if (roundBox(u, v - 0.04, 0.5, 0.5, 0.22) < 0) {
            r += 0.006
            g += 0.006
            b += 0.007
            a += 1
            continue
          }
          a += 0.9 * Math.exp(-((body / 0.22) ** 2))
        }
      const o = (py * w + px) * 4
      const k = 1 / (ss * ss)
      rgba[o] = r * k
      rgba[o + 1] = g * k
      rgba[o + 2] = b * k
      rgba[o + 3] = a * k
    }
  return { x, y, w, h, rgba }
}

// Lays premultiplied color and coverage over hdr at (x, y).
function composite(hdr: Float32Array, W: number, H: number, x: number, y: number, w: number, h: number, rgba: Float32Array) {
  for (let py = 0; py < h; py++) {
    if (y + py < 0 || y + py >= H) continue
    for (let px = 0; px < w; px++) {
      if (x + px < 0 || x + px >= W) continue
      const s = (py * w + px) * 4
      const o = ((y + py) * W + x + px) * 3
      const keep = 1 - rgba[s + 3]
      hdr[o] = hdr[o] * keep + rgba[s]
      hdr[o + 1] = hdr[o + 1] * keep + rgba[s + 1]
      hdr[o + 2] = hdr[o + 2] * keep + rgba[s + 2]
    }
  }
}

export const universe: Wallpaper = {
  id: "universe",
  name: "Universe",
  description: "A galaxy of light streaks swirling around the OpenCode icon, with app icons and little colored OpenCode marks drifting on its orbits",
  fixedTime: "day",
  activity: {
    calm: "A thin swirl of streaks and a few icons",
    lively: "A fuller swirl with more icons drifting through it",
    teeming: "The whole galaxy, dense with streaks and icons",
  },
  scrim: {
    day: [
      [4, 4, 6],
      [3, 3, 5],
      [4, 2, 2],
    ],
    sunset: [
      [4, 4, 6],
      [3, 3, 5],
      [4, 2, 2],
    ],
    night: [
      [4, 4, 6],
      [3, 3, 5],
      [4, 2, 2],
    ],
  },
  create: (settings) => new Universe(settings),
}
