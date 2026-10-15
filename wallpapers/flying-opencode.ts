import { Canvas } from "../src/canvas"
import { eggWait } from "../src/egg"
import { TAU, clamp, lerp, rand, smoothstep, type RGB } from "../src/math"
import type { Activity, Settings, Time, Wallpaper } from "../src/wallpaper"

// The scene runs slower than real time, which keeps it calm behind text.
const TIME_SCALE = 0.35
// The OpenCode mark on its grid of blocks: 4 across and 5 down, a ring one block thick around a 2x3 counter whose top
// row is open and whose lower two rows hold the fill. BLOCK is a block's size in world units, where a unit at depth 1
// spans the screen's height.
const BLOCK = 0.03
// Marks are born this deep and fade in over the far part of the trip; ones nearer than NEAR have left the screen.
const FAR = 7
const NEAR = 0.3
// The egg's mark is this many times the size of the others.
const GIANT = 3.2
// A finished task's warp surge lasts this many scene seconds.
const SURGE = 3.5
// Clicked marks are at most this many at once.
const EXTRAS = 40

// Everything that changes with the time of day. Each mark's ring takes one of the colors; its counter fill is a darker
// shade of it. Night has no white or gray marks: the text on top is white.
interface Look {
  sky: [number, RGB][]
  colors: RGB[]
  // The fill's share of the ring color.
  fill: number
}

const LOOKS: Record<Time, Look> = {
  // The classic: black, with bright red, green, cyan, magenta, gold and blue marks and a pale ice one for white.
  day: {
    sky: [
      [0, [0.002, 0.002, 0.003]],
      [1, [0.001, 0.001, 0.002]],
    ],
    colors: [
      [1, 0.08, 0.06],
      [0.1, 0.85, 0.12],
      [0.06, 0.78, 1],
      [0.95, 0.12, 0.85],
      [1, 0.78, 0.08],
      [0.2, 0.36, 1],
      [0.72, 0.84, 0.95],
    ],
    fill: 0.32,
  },
  // A deep plum fading to black, the marks amber, coral, rose, gold, violet, magenta and peach.
  sunset: {
    sky: [
      [0, [0.045, 0.008, 0.04]],
      [0.6, [0.02, 0.004, 0.018]],
      [1, [0.006, 0.001, 0.006]],
    ],
    colors: [
      [1, 0.45, 0.04],
      [1, 0.18, 0.12],
      [1, 0.16, 0.45],
      [1, 0.72, 0.12],
      [0.68, 0.18, 0.95],
      [0.95, 0.12, 0.75],
      [1, 0.56, 0.32],
    ],
    fill: 0.3,
  },
  // Navy-black, the marks cobalt, teal, violet, aqua, magenta, green and a sky blue where day has white.
  night: {
    sky: [
      [0, [0.003, 0.005, 0.022]],
      [1, [0.0008, 0.0012, 0.006]],
    ],
    colors: [
      [0.16, 0.3, 1],
      [0.04, 0.72, 0.66],
      [0.5, 0.22, 1],
      [0.05, 0.75, 1],
      [0.82, 0.12, 0.78],
      [0.12, 0.8, 0.36],
      [0.32, 0.52, 1],
    ],
    fill: 0.3,
  },
}

// How many marks fly at once on a 16:9 screen, how fast they come, in world units per scene second, and how fast they
// turn, in radians per scene second.
const STREAM: Record<Activity, { count: number; speed: number; spin: number }> = {
  calm: { count: 7, speed: 0.22, spin: 0.4 },
  lively: { count: 20, speed: 0.6, spin: 0.65 },
  teeming: { count: 30, speed: 0.85, spin: 0.65 },
}

// A flying mark: its middle in world units (x right, y down, z away from the camera), a sideways push from a click,
// its turn about its vertical axis and how fast that turns, its color, its size relative to the others, and whether it
// is an extra (a click's or the egg's) that goes away instead of coming back from the far end.
interface Mark {
  x: number
  y: number
  z: number
  vx: number
  vy: number
  turn: number
  spin: number
  color: RGB
  size: number
  extra: boolean
}

class FlyingOpenCode extends Canvas {
  private readonly activity: Activity
  private readonly look: Look
  private marks: Mark[] = []
  private surge = 0
  private egg = eggWait() * TIME_SCALE
  private readonly shade = new Float32Array(6)

  constructor(settings: Settings) {
    super()
    this.supersample = 1
    this.activity = settings.activity
    this.look = LOOKS[settings.time]
  }

  // A new mark at depth z, somewhere on screen that it leaves past an edge before it reaches NEAR, rather than flying
  // into the camera.
  private spawn(z: number): Mark {
    const A = this.A
    const margin = BLOCK * 3
    let x = 0
    let y = 0
    for (let i = 0; i < 20; i++) {
      x = rand(-A / 2, A / 2) * z
      y = rand(-0.5, 0.5) * z
      if (Math.abs(x) > (A / 2) * NEAR + margin || Math.abs(y) > 0.5 * NEAR + margin) break
    }
    const colors = this.look.colors
    return {
      x,
      y,
      z,
      vx: 0,
      vy: 0,
      turn: rand(0, TAU),
      spin: STREAM[this.activity].spin * rand(0.7, 1.3) * (Math.random() < 0.5 ? -1 : 1),
      color: colors[Math.floor(Math.random() * colors.length)],
      size: 1,
      extra: false,
    }
  }

  step(dt: number) {
    dt = clamp(dt, 0, 0.1) * TIME_SCALE
    this.stepGloom(dt)
    this.surge = Math.max(0, this.surge - dt)
    // After an error the stream slows; a finished task sends it into a warp-speed surge for a moment.
    const speed = STREAM[this.activity].speed * (1 - 0.65 * this.gloom) * (1 + 5 * this.warp())
    const A = this.A
    const decay = Math.exp(-dt / 1.5)
    for (const [i, m] of this.marks.entries()) {
      m.z -= speed * dt
      m.x += m.vx * dt
      m.y += m.vy * dt
      m.vx *= decay
      m.vy *= decay
      m.turn += m.spin * dt * (1 + this.warp())
      const reach = (BLOCK * 3 * m.size) / Math.max(m.z, 0.01)
      const gone = m.z < (m.size > 1 ? 0.12 : NEAR * 0.5) || Math.abs(m.x / m.z) > A / 2 + reach || Math.abs(m.y / m.z) > 0.5 + reach
      if (!gone) continue
      if (!m.extra) this.marks[i] = this.spawn(FAR)
      if (m.extra) m.size = 0
    }
    this.marks = this.marks.filter((m) => m.size > 0)
    this.egg -= dt
    if (this.egg > 0) return
    // The egg: one giant mark flies straight out of the middle at the camera.
    this.egg = eggWait(true) * TIME_SCALE
    this.marks.push({ ...this.spawn(FAR), x: 0, y: 0, spin: 0.35, size: GIANT, extra: true })
  }

  // How far into the surge's rush the stream is, 0 to 1.
  private warp() {
    return smoothstep(0, 0.8, this.surge) * smoothstep(SURGE, SURGE - 0.6, this.surge)
  }

  render() {
    this.restore()
    const { W, H, look, shade } = this
    const order = [...this.marks].sort((a, b) => b.z - a.z)
    const dim = 1 - 0.55 * this.gloom
    const warp = this.warp()
    const streak = Math.max(this.activity === "teeming" ? 0.35 : 0, warp)
    const reach = lerp(1.4, 5, warp)
    const speed = STREAM[this.activity].speed * (1 - 0.65 * this.gloom) * (1 + 5 * warp)
    for (const m of order) {
      // Far marks fade in out of the dark; the egg's fades away just before it reaches the camera.
      const fade = smoothstep(FAR, FAR * 0.55, m.z) * (m.size > 1 ? smoothstep(0.12, 0.4, m.z) : 1) * dim
      if (fade <= 0.002) continue
      const c = m.color
      const f = look.fill
      // Facing the camera it catches the light; edge-on it dims a little, as the old flying logos did.
      const facing = Math.abs(Math.cos(m.turn))
      const lit = fade * (0.7 + 0.35 * facing + 0.3 * facing ** 24)
      shade.set([c[0] * lit, c[1] * lit, c[2] * lit, c[0] * f * lit, c[1] * f * lit, c[2] * f * lit])
      const b = BLOCK * m.size
      const tall = (b * 5 * H) / m.z
      // In a rush, and gently in teeming, the nearest marks leave a short streak back toward the middle.
      if (streak > 0 && m.z < reach) this.streak(m, streak * smoothstep(reach, reach * 0.4, m.z) * fade, speed)
      if (tall < 2) {
        // Under two pixels tall the shape can't show: spread its light over the pixels it covers instead.
        const area = (b * H) / m.z
        const k = area * area * (0.25 + 0.75 * facing) / 20
        this.splat(W / 2 + (m.x / m.z) * H, H / 2 + (m.y / m.z) * H, shade[0] * 14 * k + shade[3] * 4 * k, shade[1] * 14 * k + shade[4] * 4 * k, shade[2] * 14 * k + shade[5] * 4 * k)
        continue
      }
      const box = drawMark(this.hdr, W, H, m.x, m.y, m.z, Math.cos(m.turn), Math.sin(m.turn), b, shade, tall < 16 ? 4 : 3)
      if (box) this.touch(box[0], box[1], box[2], box[3])
    }
    this.finish()
  }

  // A soft streak from the mark back to where it was a moment ago, in its ring color.
  private streak(m: Mark, k: number, speed: number) {
    const { W, H } = this
    const back = m.z + speed * 0.25
    const x0 = W / 2 + (m.x / m.z) * H
    const y0 = H / 2 + (m.y / m.z) * H
    const x1 = W / 2 + (m.x / back) * H
    const y1 = H / 2 + (m.y / back) * H
    const n = Math.min(80, Math.ceil(Math.hypot(x1 - x0, y1 - y0)))
    const c = m.color
    for (let i = 1; i <= n; i++) {
      const t = i / (n + 1)
      const w = k * 0.5 * (1 - t)
      this.splat(lerp(x0, x1, t), lerp(y0, y1, t), c[0] * w, c[1] * w, c[2] * w)
    }
  }

  // A finished task: the stream rushes past at warp speed for a moment.
  protected override visit() {
    this.surge = SURGE
  }

  // A click: a burst of marks flies out from under the pointer.
  poke(x: number, y: number) {
    const room = EXTRAS - this.marks.filter((m) => m.extra).length
    for (let i = 0; i < Math.min(10, room); i++) {
      const z = rand(2.2, 2.8)
      const a = rand(0, TAU)
      const push = rand(0.25, 0.55)
      this.marks.push({ ...this.spawn(z), x: (x - this.A / 2) * z, y: (y - 0.5) * z, vx: Math.cos(a) * push, vy: Math.sin(a) * push, extra: true })
    }
  }

  protected override layout() {
    const { W, H, hdr } = this
    // Fill the stream once the screen's shape is known, as densely on a wide screen as on a 16:9 one.
    const count = Math.round(STREAM[this.activity].count * clamp(this.A / (16 / 9), 0.6, 1.6))
    const stream = this.marks.filter((m) => !m.extra)
    this.marks = [...stream.slice(0, count), ...Array.from({ length: Math.max(0, count - stream.length) }, () => this.spawn(rand(NEAR * 2, FAR))), ...this.marks.filter((m) => m.extra)]
    const stops = this.look.sky
    for (let y = 0; y < H; y++) {
      const v = (y + 0.5) / H
      const i = stops.findIndex(([at]) => at >= v)
      const [a, from] = stops[Math.max(0, i - 1)]
      const [b, to] = stops[i < 0 ? stops.length - 1 : i]
      const k = b > a ? smoothstep(a, b, v) : 1
      for (let x = 0; x < W; x++) {
        const o = (y * W + x) * 3
        hdr[o] = lerp(from[0], to[0], k)
        hdr[o + 1] = lerp(from[1], to[1], k)
        hdr[o + 2] = lerp(from[2], to[2], k)
      }
    }
  }
}

// Draws a mark centered at (mx, my, mz) in world units, turned about its vertical axis by the angle with cosine c and
// sine s, its blocks b units across, in true perspective: each of the ss x ss subsamples per pixel casts a ray onto the
// mark's plane and looks up which part of the mark it lands on. shade holds the ring's color and the fill's. Returns
// the pixel box drawn, or undefined when it's off screen.
function drawMark(hdr: Float32Array, W: number, H: number, mx: number, my: number, mz: number, c: number, s: number, b: number, shade: Float32Array, ss: number) {
  let x0 = Infinity
  let y0 = Infinity
  let x1 = -Infinity
  let y1 = -Infinity
  for (const u of [-2 * b, 2 * b])
    for (const v of [-2.5 * b, 2.5 * b]) {
      const z = mz + u * s
      if (z <= 0.01) return
      const px = W / 2 + ((mx + u * c) / z) * H
      const py = H / 2 + ((my + v) / z) * H
      x0 = Math.min(x0, px)
      y0 = Math.min(y0, py)
      x1 = Math.max(x1, px)
      y1 = Math.max(y1, py)
    }
  const bx0 = Math.max(0, Math.floor(x0))
  const by0 = Math.max(0, Math.floor(y0))
  const bx1 = Math.min(W - 1, Math.floor(x1))
  const by1 = Math.min(H - 1, Math.floor(y1))
  if (bx1 < bx0 || by1 < by0) return
  // The plane's normal is (-s, 0, c); a ray (dx, dy, 1) meets it at t = (n . m) / (n . d).
  const nm = -s * mx + c * mz
  const inv = 1 / b
  const step = 1 / ss
  const share = 1 / (ss * ss)
  for (let y = by0; y <= by1; y++)
    for (let x = bx0; x <= bx1; x++) {
      let r = 0
      let g = 0
      let bl = 0
      let n = 0
      for (let j = 0; j < ss; j++) {
        const dy = (y + (j + 0.5) * step - H / 2) / H
        for (let i = 0; i < ss; i++) {
          const dx = (x + (i + 0.5) * step - W / 2) / H
          const nd = c - s * dx
          if (Math.abs(nd) < 1e-6) continue
          const t = nm / nd
          const U = (c * (t * dx - mx) + s * (t - mz)) * inv
          const V = (t * dy - my) * inv
          if (U < -2 || U > 2 || V < -2.5 || V > 2.5) continue
          const counter = U > -1 && U < 1 && V > -1.5 && V < 1.5
          if (counter && V < -0.5) continue
          const k = counter ? 3 : 0
          r += shade[k]
          g += shade[k + 1]
          bl += shade[k + 2]
          n++
        }
      }
      if (!n) continue
      const cov = n * share
      const o = (y * W + x) * 3
      hdr[o] += (r / n - hdr[o]) * cov
      hdr[o + 1] += (g / n - hdr[o + 1]) * cov
      hdr[o + 2] += (bl / n - hdr[o + 2]) * cov
    }
  return [bx0, by0, bx1, by1]
}

export const flyingOpenCode: Wallpaper = {
  id: "flying-opencode",
  name: "Flying OpenCode",
  description: "The old flying-logos screensaver with OpenCode marks: colored marks stream out of the dark toward you, flapping as they fly",
  fixedTime: "night",
  activity: {
    calm: "A few marks drifting slowly out of the middle",
    lively: "The classic stream of colored marks flying past",
    teeming: "A denser, quicker stream, the nearest marks trailing faint warp streaks",
  },
  scrim: {
    day: [
      [4, 4, 6],
      [3, 3, 5],
      [2, 2, 3],
    ],
    sunset: [
      [30, 7, 26],
      [18, 4, 16],
      [6, 1, 6],
    ],
    night: [
      [2, 4, 16],
      [1, 3, 11],
      [0, 1, 5],
    ],
  },
  create: (settings) => new FlyingOpenCode(settings),
}
