import { Canvas } from "../src/canvas"
import type { Activity, Wallpaper } from "../src/engine"
import { TAU, clamp, fbm1, hash, lerp, rand, smoothstep, type RGB } from "../src/math"

// The scene runs slower than real time, which keeps it calm behind text.
const TIME_SCALE = 0.35
// Creatures move and animate at a quarter of scene speed, so they drift rather than dart.
const CREATURE_SPEED = 0.25
// Height of the horizon as a fraction of the screen.
const HORIZON = 0.6
// The setting sun: x as a fraction of the width, y and radius as fractions of the height.
const SUN = { x: 0.6, y: 0.53, r: 0.065 }
// Warm light from the low sun that edges every silhouette.
const RIM: RGB = [1, 0.42, 0.14]

const SKY: [number, RGB][] = [
  [0, [0.012, 0.01, 0.04]],
  [0.25, [0.05, 0.02, 0.085]],
  [0.42, [0.2, 0.055, 0.12]],
  [0.52, [0.55, 0.16, 0.12]],
  [HORIZON, [0.95, 0.4, 0.14]],
]

interface Mesa {
  c: number
  w: number
  h: number
  slope: number
}

interface Cloud {
  x: number
  y: number
  speed: number
  puffs: { dx: number; dy: number; rx: number; ry: number }[]
}

interface Bird {
  angle: number
  speed: number
  cx: number
  cy: number
  rx: number
  ry: number
  phase: number
}

interface Snake {
  x: number
  y: number
  vx: number
  vy: number
  wx: number
  wy: number
  wanderT: number
  phase: number
  trail: { x: number; y: number }[]
}

type Part =
  | { kind: "capsule"; ax: number; ay: number; bx: number; by: number; r0: number; r1: number; color: RGB; ribs: number }
  | { kind: "ellipse"; cx: number; cy: number; rx: number; ry: number; angle: number; color: RGB; ribs: number }

// A tapered capsule from (ax, ay) radius r0 to (bx, by) radius r1; ribs adds lengthwise ridges, as on a cactus.
function cap(ax: number, ay: number, bx: number, by: number, r0: number, r1: number, color: RGB, ribs = 0): Part {
  return { kind: "capsule", ax, ay, bx, by, r0, r1, color, ribs }
}

// An ellipse rotated by angle; ribs runs ridges across its width.
function ell(cx: number, cy: number, rx: number, ry: number, angle: number, color: RGB, ribs = 0): Part {
  return { kind: "ellipse", cx, cy, rx, ry, angle, color, ribs }
}

interface Coyote {
  howl: number
  t: number
  next: number
}

class Desert extends Canvas {
  private time = 0
  private background = new Float32Array(0)
  private frontTop = new Float32Array(0)
  private nearTop = new Float32Array(0)
  private sunX = 0
  private sunY = 0
  private coyoteX = 0
  private stars = Array.from({ length: 45 }, () => ({ x: Math.random(), y: Math.random() * 0.3, b: 0.4 + Math.random() * 0.6, phase: Math.random() * TAU }))
  private dust = Array.from({ length: 60 }, () => ({ x: Math.random() * 4, y: 0.3 + Math.random() * 0.7, s: Math.random() }))
  private clouds: Cloud[] = Array.from({ length: 5 }, () => ({
    x: Math.random() * 2,
    y: 0.12 + Math.random() * 0.24,
    speed: 0.003 + Math.random() * 0.004,
    puffs: Array.from({ length: 5 }, () => ({ dx: (Math.random() - 0.5) * 0.22, dy: (Math.random() - 0.5) * 0.015, rx: 0.06 + Math.random() * 0.08, ry: 0.008 + Math.random() * 0.01 })),
  }))
  private tumbleweed = { x: -9, dir: 1, next: 14, spin: 0, hop: 0 }
  private twigs = buildTwigs()
  private eagle: Bird | undefined
  private vultures: Bird[] = []
  private snake: Snake | undefined
  private coyote: Coyote | undefined

  constructor(private readonly activity: Activity) {
    super()
    if (activity !== "calm") {
      this.eagle = { angle: 0, speed: 0.5, cx: 0.55, cy: 0.2, rx: 0.3, ry: 0.05, phase: 0 }
      this.snake = { x: 0.5, y: 0.9, vx: 0, vy: 0, wx: 0.5, wy: 0.9, wanderT: 0, phase: 0, trail: [] }
    }
    if (activity === "teeming") {
      this.vultures = [0, 2.1, 4.2].map((angle, i) => ({ angle, speed: 0.4 + i * 0.05, cx: 0.25, cy: 0.16, rx: 0.08 + i * 0.035, ry: 0.025, phase: i }))
      this.coyote = { howl: 0, t: -1, next: 8 }
    }
  }

  step(dt: number) {
    dt = clamp(dt, 0, 0.1) * TIME_SCALE
    this.time += dt
    for (const d of this.dust) {
      d.x += (0.01 + d.s * 0.012) * dt
      d.y += Math.sin(this.time * 0.5 + d.s * 30) * 0.002 * dt
      if (d.x > this.A) d.x -= this.A
    }
    for (const c of this.clouds) {
      c.x += c.speed * dt
      if (c.x > this.A + 0.4) c.x = -0.4
    }
    this.stepTumbleweed(dt)
    this.stepCreatures(dt * CREATURE_SPEED)
  }

  render() {
    this.hdr.set(this.background)
    this.drawStars()
    this.drawClouds()
    for (const v of this.vultures) this.drawBird(v, 0.3, false, 0.06)
    if (this.eagle) this.drawBird(this.eagle, 0.8, true, 0.018)
    if (this.coyote) this.drawCoyote(this.coyote)
    if (this.snake) this.drawSnake(this.snake)
    this.drawTumbleweed()
    this.drawDust()
    this.finish()
  }

  // Everything that never moves is painted once per size into `background`, then copied in each frame.
  protected override layout() {
    const { W, H, A } = this
    this.sunX = SUN.x * W
    this.sunY = SUN.y * H
    this.drawSky()
    const far = mesas(A, 3, 7, [0.06, 0.16], [0.04, 0.09])
    const near = mesas(A, 2, 19, [0.05, 0.12], [0.06, 0.13])
    this.nearTop = new Float32Array(W)
    const farTop = new Float32Array(W)
    for (let x = 0; x < W; x++) {
      const u = x / H
      farTop[x] = (HORIZON - profile(far, u)) * H
      this.nearTop[x] = (HORIZON + 0.01 - profile(near, u)) * H
    }
    this.fillBelow(farTop, (x, y, d) => {
      if (y > HORIZON * this.H + 1) return undefined
      const haze = 0.35 + 0.4 * (1 - d / 40)
      return mixRim([lerp(0.07, 0.6, haze * 0.4), lerp(0.03, 0.22, haze * 0.4), lerp(0.06, 0.12, haze * 0.4)], d, 1.5, this.sunGlow(x) * 0.6)
    })
    this.drawFloor()
    this.fillBelow(this.nearTop, (x, y, d) => (y > (HORIZON + 0.02) * this.H ? undefined : mixRim([0.07, 0.025, 0.04], d, 1.6, this.sunGlow(x) * 0.8)))
    const backTop = new Float32Array(W)
    this.frontTop = new Float32Array(W)
    for (let x = 0; x < W; x++) {
      const u = x / H
      backTop[x] = (0.7 + 0.035 * Math.sin(u * 3.1 + 1) + 0.02 * Math.sin(u * 7.3)) * H
      this.frontTop[x] = (0.83 + 0.045 * Math.sin(u * 2.2 + 2.5) + 0.015 * Math.sin(u * 5.7 + 1)) * H
    }
    this.fillBelow(backTop, (x, _y, d) => mixRim([0.075 - d * 0.0004, 0.03 - d * 0.0002, 0.025], d, 2.2, this.sunGlow(x) * 0.55))
    this.fillBelow(this.frontTop, (x, y, d) => {
      const ripple = 0.9 + 0.1 * Math.sin(x * 0.5 + d * 0.9 + fbm1(x * 0.05, 3) * 4)
      return mixRim([0.04 * ripple, 0.017 * ripple, 0.014 * ripple], d, 2.5, this.sunGlow(x) * 0.5)
    })
    if (this.activity === "teeming") {
      this.drawSaguaro(0.47 * A * H, backTop[Math.round(0.47 * W)] + 2, 0.14 * H, 0.5)
      this.drawSaguaro(0.92 * A * H, backTop[Math.min(W - 1, Math.round(0.92 * W))] + 2, 0.11 * H, 0.5)
    }
    this.drawSaguaro(0.13 * A * H, this.ground(0.13) + 3, 0.34 * H, 0)
    this.drawSkull(0.8 * A * H, this.ground(0.8), 0.07 * H)
    if (this.activity === "teeming") {
      this.drawPricklyPear(0.33 * A * H, this.ground(0.33) + 2, H)
      this.drawBarrel(0.62 * A * H, this.ground(0.62) + 1, H)
    }
    // The coyote sits on the tallest near mesa.
    let best = 0
    for (let x = 1; x < W; x++) if (this.nearTop[x] < this.nearTop[best]) best = x
    this.coyoteX = best
    this.background = this.hdr.slice()
  }

  // Ground height in pixels at a fraction of the width.
  private ground(fx: number) {
    return this.frontTop[clamp(Math.round(fx * this.W), 0, this.W - 1)]
  }

  // How strongly a column catches the sun's light, highest beneath the sun.
  private sunGlow(x: number) {
    return 0.35 + 0.65 * Math.exp(-Math.abs(x - this.sunX) / (0.45 * this.H))
  }

  // Depth-graded dusk sky, a wide glow around the sun, and the sun itself.
  private drawSky() {
    const { W, H, hdr } = this
    const R = SUN.r * H
    for (let y = 0; y < H; y++) {
      const v = y / H
      const i = SKY.findIndex(([at]) => at >= v)
      const [a, from] = SKY[Math.max(0, i - 1)]
      const [b, to] = SKY[i < 0 ? SKY.length - 1 : i]
      const k = b > a ? smoothstep(a, b, v) : 1
      for (let x = 0; x < W; x++) {
        const d = Math.hypot(x - this.sunX, y - this.sunY) / H
        const glow = 0.5 * Math.exp(-d / 0.12) + 0.25 * Math.exp(-d / 0.35)
        const o = (y * W + x) * 3
        hdr[o] = lerp(from[0], to[0], k) + glow * 1.0
        hdr[o + 1] = lerp(from[1], to[1], k) + glow * 0.42
        hdr[o + 2] = lerp(from[2], to[2], k) + glow * 0.14
        const r = d * H
        const cov = clamp(R - r + 0.5, 0, 1)
        if (cov <= 0) continue
        const limb = 0.85 + 0.15 * Math.sqrt(Math.max(0, 1 - (r / R) ** 2))
        this.blend(o, 3.2 * limb, 1.7 * limb, 0.6 * limb, cov)
      }
    }
  }

  // Distant desert floor between the horizon and the dunes, brightest under the sun.
  private drawFloor() {
    const { W, H, hdr } = this
    for (let y = Math.floor(HORIZON * H); y < H; y++) {
      const k = smoothstep(HORIZON, 0.72, y / H)
      const shine = Math.exp(-(y / H - HORIZON) / 0.05)
      for (let x = 0; x < W; x++) {
        const o = (y * W + x) * 3
        const sun = Math.exp(-Math.abs(x - this.sunX) / (0.3 * H)) * shine
        hdr[o] = lerp(0.4, 0.1, k) + sun * 0.3
        hdr[o + 1] = lerp(0.14, 0.04, k) + sun * 0.12
        hdr[o + 2] = lerp(0.07, 0.03, k) + sun * 0.04
      }
    }
  }

  // Fills each column from its top edge down; color gets the pixel's depth below that edge, or undefined to stop.
  private fillBelow(top: Float32Array, color: (x: number, y: number, depth: number) => RGB | undefined) {
    const { W, H } = this
    for (let x = 0; x < W; x++) {
      const t = top[x]
      for (let y = Math.max(0, Math.floor(t)); y < H; y++) {
        const c = color(x, y, y + 0.5 - t)
        if (!c) break
        this.blend((y * W + x) * 3, c[0], c[1], c[2], clamp(y + 1 - t, 0, 1))
      }
    }
  }

  private stepTumbleweed(dt: number) {
    const t = this.tumbleweed
    if (t.x < -5) {
      t.next -= dt
      if (t.next > 0) return
      t.dir = Math.random() < 0.5 ? 1 : -1
      t.x = t.dir > 0 ? -0.1 : this.A + 0.1
      return
    }
    const move = 0.06 * dt
    t.x += t.dir * move
    t.spin += (t.dir * move) / 0.035
    t.hop += move / 0.05
    if (t.x < -0.2 || t.x > this.A + 0.2) {
      t.x = -9
      t.next = rand(40, 75)
    }
  }

  private stepCreatures(dt: number) {
    const e = this.eagle
    if (e) {
      e.angle += e.speed * dt
      e.phase += dt
    }
    for (const v of this.vultures) {
      v.angle += v.speed * dt
      v.phase += dt
    }
    const s = this.snake
    if (s) this.stepSnake(s, dt)
    const c = this.coyote
    if (c) {
      if (c.t < 0) {
        c.next -= dt
        if (c.next <= 0) c.t = 0
      } else {
        c.t += dt
        if (c.t > 6) {
          c.t = -1
          c.next = rand(20, 45)
        }
      }
      c.howl = c.t < 0 ? 0 : smoothstep(0, 1.5, c.t) * (1 - smoothstep(4.5, 6, c.t))
    }
  }

  // Wanders between points on the face of the front dune; the body follows the head's trail.
  private stepSnake(s: Snake, dt: number) {
    const { A, H } = this
    const crest = (x: number) => this.frontTop[clamp(Math.round(x * H), 0, this.W - 1)] / H
    s.wanderT -= dt
    if (s.wanderT <= 0 || Math.hypot(s.wx - s.x, s.wy - s.y) < 0.02) {
      s.wanderT = rand(6, 14)
      s.wx = rand(0.3 * A, 0.7 * A)
      s.wy = crest(s.wx) + rand(0.015, 0.06)
    }
    const dx = s.wx - s.x
    const dy = s.wy - s.y
    const d = Math.hypot(dx, dy) || 1
    const speed = 0.05 * Math.min(1, d / 0.05)
    s.vx += ((dx / d) * speed - s.vx) * Math.min(1, dt * 1.2)
    s.vy += ((dy / d) * speed - s.vy) * Math.min(1, dt * 1.2)
    s.x += s.vx * dt
    s.y = clamp(s.y + s.vy * dt, crest(s.x) + 0.01, 0.99)
    s.phase += dt * (1.5 + Math.hypot(s.vx, s.vy) * 60)
    const last = s.trail.at(-1)
    if (!last) for (let i = 30; i >= 0; i--) s.trail.push({ x: s.x - i * 0.008, y: s.y })
    if (last && Math.hypot(s.x - last.x, s.y - last.y) > 0.002) s.trail.push({ x: s.x, y: s.y })
    if (s.trail.length > 200) s.trail.splice(0, s.trail.length - 200)
  }

  // Draws parts as one silhouette: each pixel takes the nearest part's color, and only the outline facing the sun
  // catches its light, so joints between parts stay seamless.
  private silhouette(parts: Part[], rim = 1) {
    if (!parts.length) return
    let x0 = Infinity
    let y0 = Infinity
    let x1 = -Infinity
    let y1 = -Infinity
    for (const p of parts) {
      const pad = (p.kind === "capsule" ? Math.max(p.r0, p.r1) : Math.max(p.rx, p.ry)) + 1
      const [ax, ay, bx, by] = p.kind === "capsule" ? [p.ax, p.ay, p.bx, p.by] : [p.cx, p.cy, p.cx, p.cy]
      x0 = Math.min(x0, ax - pad, bx - pad)
      y0 = Math.min(y0, ay - pad, by - pad)
      x1 = Math.max(x1, ax + pad, bx + pad)
      y1 = Math.max(y1, ay + pad, by + pad)
    }
    const sl = Math.hypot(this.sunX - (x0 + x1) / 2, this.sunY - (y0 + y1) / 2) || 1
    const sx = (this.sunX - (x0 + x1) / 2) / sl
    const sy = (this.sunY - (y0 + y1) / 2) / sl
    for (let y = Math.max(0, Math.floor(y0)); y <= Math.min(this.H - 1, Math.ceil(y1)); y++)
      for (let x = Math.max(0, Math.floor(x0)); x <= Math.min(this.W - 1, Math.ceil(x1)); x++) {
        const px = x + 0.5
        const py = y + 0.5
        let best = Infinity
        let part = parts[0]
        let nx = 0
        let ny = 0
        let across = 0
        for (const p of parts) {
          if (p.kind === "capsule") {
            const dx = p.bx - p.ax
            const dy = p.by - p.ay
            const len2 = dx * dx + dy * dy || 1e-6
            const t = clamp(((px - p.ax) * dx + (py - p.ay) * dy) / len2, 0, 1)
            const ox = px - (p.ax + dx * t)
            const oy = py - (p.ay + dy * t)
            const r = p.r0 + (p.r1 - p.r0) * t
            const dist = Math.hypot(ox, oy) || 1e-6
            const d = dist - r
            if (d >= best) continue
            best = d
            part = p
            nx = ox / dist
            ny = oy / dist
            across = (ox * dy - oy * dx) / Math.sqrt(len2) / Math.max(r, 0.5)
            continue
          }
          const ca = Math.cos(p.angle)
          const sa = Math.sin(p.angle)
          const ox = px - p.cx
          const oy = py - p.cy
          const lx = ox * ca + oy * sa
          const ly = -ox * sa + oy * ca
          const d = (Math.sqrt((lx / p.rx) ** 2 + (ly / p.ry) ** 2) - 1) * Math.min(p.rx, p.ry)
          if (d >= best) continue
          const gx = lx / (p.rx * p.rx)
          const gy = ly / (p.ry * p.ry)
          const gl = Math.hypot(gx, gy) || 1e-6
          best = d
          part = p
          nx = (gx * ca - gy * sa) / gl
          ny = (gx * sa + gy * ca) / gl
          across = lx / p.rx
        }
        const cov = clamp(0.5 - best, 0, 1)
        if (cov <= 0) continue
        const k = part.ribs ? 0.8 + 0.2 * Math.cos(across * Math.PI * part.ribs) : 1
        const lit = rim * clamp((best + 2.2) / 2.2, 0, 1) * Math.max(0, nx * sx + ny * sy) * 0.8
        const c = part.color
        this.blend((y * this.W + x) * 3, c[0] * k + RIM[0] * lit, c[1] * k + RIM[1] * lit, c[2] * k + RIM[2] * lit, cov)
      }
  }

  // A saguaro: a ribbed trunk with two upturned arms. haze fades distant ones into the dunes behind them.
  private drawSaguaro(x: number, gy: number, h: number, haze: number) {
    const c: RGB = [lerp(0.02, 0.07, haze), lerp(0.05, 0.03, haze), 0.025]
    const r = h * 0.085
    this.silhouette(
      [
        cap(x, gy, x, gy - h, r, r * 0.85, c, 2),
        cap(x, gy - h * 0.36, x - h * 0.24, gy - h * 0.42, r * 0.7, r * 0.7, c, 1.5),
        cap(x - h * 0.24, gy - h * 0.42, x - h * 0.24, gy - h * 0.72, r * 0.7, r * 0.62, c, 1.5),
        cap(x, gy - h * 0.5, x + h * 0.21, gy - h * 0.55, r * 0.65, r * 0.65, c, 1.5),
        cap(x + h * 0.21, gy - h * 0.55, x + h * 0.21, gy - h * 0.82, r * 0.65, r * 0.58, c, 1.5),
      ],
      1 - haze * 0.5,
    )
  }

  // A bleached cow skull seen from the front, resting on its snout, with long horns sweeping out and up.
  private drawSkull(x: number, gy: number, s: number) {
    const bone: RGB = [0.62, 0.5, 0.4]
    const dark: RGB = [0.03, 0.015, 0.01]
    const cy = gy - s * 0.85
    for (const side of [-1, 1]) {
      const p0 = [x + side * s * 0.38, cy - s * 0.3]
      const p1 = [x + side * s * 0.95, cy - s * 0.32]
      const p2 = [x + side * s * 1.15, cy - s * 0.75]
      const at = (t: number) => [(1 - t) ** 2 * p0[0] + 2 * (1 - t) * t * p1[0] + t * t * p2[0], (1 - t) ** 2 * p0[1] + 2 * (1 - t) * t * p1[1] + t * t * p2[1]]
      this.silhouette(
        Array.from({ length: 12 }, (_, i) => {
          const [ax, ay] = at(i / 12)
          const [bx, by] = at((i + 1) / 12)
          return cap(ax, ay, bx, by, s * lerp(0.09, 0.015, i / 12), s * lerp(0.09, 0.015, (i + 1) / 12), i > 9 ? [0.12, 0.08, 0.05] : [0.48, 0.38, 0.26])
        }),
        0.6,
      )
    }
    this.silhouette([ell(x, cy - s * 0.15, s * 0.42, s * 0.3, 0, bone), cap(x, cy, x, cy + s * 0.75, s * 0.3, s * 0.16, bone), ell(x, cy + s * 0.8, s * 0.18, s * 0.1, 0, bone)], 0.6)
    for (const side of [-1, 1]) {
      this.silhouette([ell(x + side * s * 0.2, cy - s * 0.05, s * 0.11, s * 0.13, side * 0.3, dark)], 0)
      this.silhouette([ell(x + side * s * 0.06, cy + s * 0.62, s * 0.045, s * 0.09, 0, dark)], 0)
    }
    this.silhouette([cap(x, cy - s * 0.42, x, cy - s * 0.22, s * 0.015, s * 0.01, dark)], 0)
  }

  // A clump of paddle-shaped pads, each with its own outline, a few with red fruit on top.
  private drawPricklyPear(x: number, gy: number, H: number) {
    const c: RGB = [0.03, 0.055, 0.025]
    const pads: [number, number, number, number, number][] = [
      [0, -0.035, 0.025, 0.04, 0],
      [-0.032, -0.08, 0.02, 0.032, -0.5],
      [0.03, -0.085, 0.022, 0.034, 0.4],
      [0.002, -0.125, 0.018, 0.028, 0.1],
    ]
    for (const [dx, dy, rx, ry, a] of pads) this.silhouette([ell(x + dx * H, gy + dy * H, rx * H, ry * H, a, c)])
    for (const [dx, dy] of [[-0.04, -0.11], [0.042, -0.118], [0.005, -0.153]]) this.silhouette([ell(x + dx * H, gy + dy * H, 0.006 * H, 0.008 * H, 0, [0.5, 0.06, 0.08])], 0.5)
  }

  // A squat, ribbed barrel cactus with a crown of yellow flowers.
  private drawBarrel(x: number, gy: number, H: number) {
    this.silhouette([ell(x, gy - 0.032 * H, 0.03 * H, 0.035 * H, 0, [0.03, 0.06, 0.03], 3)])
    for (const dx of [-0.012, 0, 0.012]) this.silhouette([ell(x + dx * H, gy - 0.066 * H, 0.005 * H, 0.004 * H, 0, [0.8, 0.6, 0.1])], 0.3)
  }

  // Faint stars high in the sky, twinkling slowly and fading toward the glow.
  private drawStars() {
    for (const s of this.stars) {
      const k = s.b * (1 - s.y / 0.32) * (0.7 + 0.3 * Math.sin(this.time * 0.8 + s.phase)) * 0.35
      this.add(s.x * this.W, s.y * this.H, k, k * 0.95, k * 1.15)
    }
  }

  // Thin clouds lit from below by the sun, drifting slowly across.
  private drawClouds() {
    const { H, W, hdr } = this
    for (const c of this.clouds)
      for (const p of c.puffs) {
        const cx = (c.x + p.dx) * H
        const cy = (c.y + p.dy) * H
        const rx = p.rx * H
        const ry = p.ry * H
        const warm = 0.6 + 0.6 * Math.exp(-Math.abs(cx - this.sunX) / (0.5 * H))
        for (let y = Math.max(0, Math.floor(cy - ry)); y <= Math.min(H - 1, Math.ceil(cy + ry)); y++)
          for (let x = Math.max(0, Math.floor(cx - rx)); x <= Math.min(W - 1, Math.ceil(cx + rx)); x++) {
            const dx = (x + 0.5 - cx) / rx
            const dy = (y + 0.5 - cy) / ry
            const q = dx * dx + dy * dy
            if (q >= 1) continue
            const under = smoothstep(-1, 1, dy)
            const o = (y * W + x) * 3
            const a = (1 - q) ** 1.5 * 0.55
            hdr[o] += (lerp(0.1, 0.75, under) * warm - hdr[o]) * a
            hdr[o + 1] += (lerp(0.035, 0.24, under) * warm - hdr[o + 1]) * a
            hdr[o + 2] += (lerp(0.09, 0.2, under) * warm - hdr[o + 2]) * a
          }
      }
  }

  // A soaring bird seen from the front, wings spread and banking as it circles. scale is relative to an eagle;
  // a bald eagle gets its white head and tail; dihedral is how far the wingtips lift.
  private drawBird(b: Bird, scale: number, bald: boolean, dihedral: number) {
    const { A, H } = this
    const ex = (b.cx * A + b.rx * Math.cos(b.angle)) * H
    const ey = (b.cy + b.ry * Math.sin(b.angle)) * H
    const roll = 0.18 * Math.sin(b.angle)
    const cr = Math.cos(roll)
    const sr = Math.sin(roll)
    const S = H * scale
    const T = (u: number, v: number): [number, number] => [ex + (u * cr - v * sr) * S, ey + (u * sr + v * cr) * S]
    const brown: RGB = bald ? [0.06, 0.035, 0.022] : [0.03, 0.02, 0.02]
    const white: RGB = bald ? [0.62, 0.57, 0.5] : brown
    const flex = 0.006 * Math.sin(b.phase * 1.3)
    const parts: Part[] = []
    for (const side of [-1, 1]) {
      const spine = (t: number): [number, number] => [side * (0.028 + 0.125 * t), -dihedral * t * t + flex * t * t]
      for (let i = 0; i < 6; i++) parts.push(cap(...T(...spine(i / 6)), ...T(...spine((i + 1) / 6)), 0.02 * (1 - 0.3 * (i / 6)) * S, 0.02 * (1 - 0.3 * ((i + 1) / 6)) * S, brown))
      // Fingered primary feathers splaying from the wingtip.
      const [tu, tv] = spine(0.92)
      const [pu, pv] = spine(0.8)
      const base = Math.atan2(tv - pv, tu - pu)
      for (const spread of [-0.5, -0.25, 0, 0.22, 0.42]) {
        const a = base + spread * side
        parts.push(cap(...T(tu, tv), ...T(tu + Math.cos(a) * 0.03, tv + Math.sin(a) * 0.03), 0.005 * S, 0.0015 * S, brown))
      }
    }
    parts.push(cap(...T(0, -0.006), ...T(0, 0.04), 0.014 * S, 0.01 * S, brown))
    parts.push(cap(...T(0, 0.035), ...T(0, 0.058), 0.008 * S, 0.014 * S, white))
    parts.push(cap(...T(0, -0.016), ...T(0, -0.006), 0.011 * S, 0.011 * S, white))
    if (bald) parts.push(cap(...T(0, -0.009), ...T(0, -0.004), 0.004 * S, 0.002 * S, [0.85, 0.55, 0.08]))
    this.silhouette(parts, 0.7)
  }

  // A coyote sitting on top of a mesa, facing the sun, that now and then lifts its head to howl.
  private drawCoyote(c: Coyote) {
    const x = this.coyoteX + 0.5
    const gy = this.nearTop[this.coyoteX] + 0.5
    const S = 0.1 * this.H
    const face = this.sunX > x ? 1 : -1
    const P = (u: number, v: number): [number, number] => [x + u * face * S, gy + v * S]
    const k: RGB = [0.02, 0.01, 0.012]
    // The head turns from looking ahead to pointing at the sky; R places points in the head's frame.
    const a = lerp(-0.2, -1.2, c.howl)
    const head = [0.21, -0.66]
    const R = (u: number, v: number): [number, number] => P(head[0] + u * Math.cos(a) - v * Math.sin(a), head[1] + u * Math.sin(a) + v * Math.cos(a))
    this.silhouette(
      [
        cap(...P(-0.17, -0.06), ...P(-0.3, -0.02), 0.06 * S, 0.055 * S, k),
        cap(...P(-0.3, -0.02), ...P(-0.42, -0.01), 0.055 * S, 0.03 * S, k),
        ell(...P(-0.05, -0.17), 0.17 * S, 0.17 * S, 0, k),
        cap(...P(-0.02, -0.22), ...P(0.12, -0.48), 0.13 * S, 0.11 * S, k),
        cap(...P(0.12, -0.45), ...P(0.16, -0.12), 0.08 * S, 0.055 * S, k),
        cap(...P(0.15, -0.15), ...P(0.17, 0), 0.035 * S, 0.03 * S, k),
        cap(...P(0.11, -0.15), ...P(0.12, 0), 0.03 * S, 0.028 * S, k),
        ell(...P(0.04, -0.025), 0.1 * S, 0.03 * S, 0, k),
        cap(...P(0.12, -0.5), ...P(head[0], head[1]), 0.07 * S, 0.06 * S, k),
        ell(...R(0, 0), 0.08 * S, 0.062 * S, a * face, k),
        cap(...R(0, 0), ...R(0.15, 0.01), 0.045 * S, 0.02 * S, k),
        cap(...R(-0.025, -0.045), ...R(-0.055, -0.135), 0.026 * S, 0.004 * S, k),
        cap(...R(0.005, -0.05), ...R(-0.015, -0.14), 0.024 * S, 0.004 * S, k),
      ],
      1.3,
    )
  }

  // A banded rattlesnake: its body follows the head's trail with a gentle side-to-side wave, ending in a rattle.
  private drawSnake(s: Snake) {
    const H = this.H
    const length = 0.2
    const step = 0.006
    const points: [number, number][] = []
    let walked = 0
    let next = 0
    for (let i = s.trail.length - 1; i > 0 && next <= length; i--) {
      const a = s.trail[i]
      const b = s.trail[i - 1]
      const seg = Math.hypot(a.x - b.x, a.y - b.y)
      while (next <= walked + seg && next <= length) {
        const t = seg ? (next - walked) / seg : 0
        points.push([lerp(a.x, b.x, t), lerp(a.y, b.y, t)])
        next += step
      }
      walked += seg
    }
    const body: RGB = [0.3, 0.19, 0.1]
    const band: RGB = [0.12, 0.07, 0.04]
    const at = (i: number): [number, number] => {
      const [x, y] = points[i]
      const [px, py] = points[Math.min(points.length - 1, i + 1)]
      const [qx, qy] = points[Math.max(0, i - 1)]
      const tl = Math.hypot(px - qx, py - qy) || 1
      const s0 = i * step
      const wave = 0.006 * smoothstep(0, 0.03, s0) * Math.sin(s0 * 60 - s.phase)
      return [(x + (-(py - qy) / tl) * wave) * H, (y + ((px - qx) / tl) * wave) * H]
    }
    if (points.length < 2) return
    const r = (j: number) => 0.0075 * (1 - ((j * step) / length) ** 1.5 * 0.7) * H
    const parts = points.slice(1).map((_, i) => {
      const tail = i > points.length - 5
      return cap(...at(i + 1), ...at(i), r(i + 1), r(i), tail ? [0.55, 0.45, 0.32] : Math.floor((i * step) / 0.02) % 2 ? band : body)
    })
    const [hx, hy] = at(0)
    const [nx, ny] = at(1)
    const heading = Math.atan2(hy - ny, hx - nx)
    parts.push(ell(hx, hy, 0.013 * H, 0.009 * H, heading, body))
    this.silhouette(parts, 0.7)
    this.add(hx + Math.cos(heading) * 0.005 * H, hy - 0.002 * H, 0.02, 0.02, 0.02)
  }

  // A ball of tangled twigs rolling and hopping across the front dune.
  private drawTumbleweed() {
    const t = this.tumbleweed
    if (t.x < -5) return
    const H = this.H
    const R = 0.035 * H
    const cx = t.x * H
    const cy = this.ground(t.x / this.A) - R + 1 - Math.abs(Math.sin(t.hop)) * 0.012 * H
    const cs = Math.cos(t.spin)
    const sn = Math.sin(t.spin)
    const sl = Math.hypot(this.sunX - cx, this.sunY - cy) || 1
    for (const [u, v] of this.twigs) {
      const ru = u * cs - v * sn
      const rv = u * sn + v * cs
      const lit = Math.max(0, (ru * (this.sunX - cx) + rv * (this.sunY - cy)) / sl)
      this.disc(cx + ru * R, cy + rv * R, 0.6, 0.3 + lit * 0.5, 0.17 + lit * 0.2, 0.08 + lit * 0.05, 0.9)
    }
  }

  // Dust motes drifting on the breeze, glinting near the sun.
  private drawDust() {
    const H = this.H
    for (const d of this.dust) {
      const x = d.x * H
      const y = d.y * H
      const k = (0.05 + d.s * 0.07) * (1 + 3 * Math.exp(-Math.hypot(x - this.sunX, y - this.sunY) / (0.15 * H)))
      this.add(x, y, k, k * 0.6, k * 0.3)
    }
  }
}

// Mesa silhouettes for one layer: flat tops with steep sides, spread across the width. Sizes are in screen heights.
function mesas(A: number, perWidth: number, seed: number, width: [number, number], height: [number, number]): Mesa[] {
  const count = Math.max(2, Math.round(A * perWidth))
  return Array.from({ length: count }, (_, i) => ({
    c: (i + 0.5 + (hash(seed + i * 3.7) - 0.5) * 0.6) * (A / count),
    w: lerp(width[0], width[1], hash(seed + i * 5.3)),
    h: lerp(height[0], height[1], hash(seed + i * 7.1)),
    slope: lerp(0.02, 0.04, hash(seed + i * 9.9)),
  }))
}

// Height of a mesa layer at u, with a little roughness along the cliffs.
function profile(list: Mesa[], u: number) {
  const top = list.reduce((max, m) => Math.max(max, m.h * (1 - smoothstep(m.w, m.w + m.slope, Math.abs(u - m.c)))), 0)
  return top + (fbm1(u * 40, 5) - 0.5) * 0.004 * (top > 0 ? 1 : 0.5)
}

// A rim of sun-colored light along a silhouette's top edge, fading over `width` pixels below it.
function mixRim(base: RGB, depth: number, width: number, strength: number): RGB {
  const k = Math.exp(-depth / width) * strength * 0.6
  return [base[0] + RIM[0] * k, base[1] + RIM[1] * k, base[2] + RIM[2] * k]
}

// Points along tangled curves inside a unit circle: the tumbleweed's twigs.
function buildTwigs() {
  const points: [number, number][] = []
  for (let j = 0; j < 22; j++) {
    const a0 = hash(j * 1.7) * TAU
    const span = 1.2 + hash(j * 2.3) * 2
    const k = 1 + hash(j * 3.1) * 3
    const p = hash(j * 4.7) * TAU
    for (let i = 0; i < 12; i++) {
      const t = i / 11
      const a = a0 + t * span
      const r = 0.55 + 0.45 * Math.sin(t * Math.PI * k + p)
      points.push([Math.cos(a) * r, Math.sin(a) * r])
    }
  }
  return points
}

export const desert: Wallpaper = {
  id: "desert",
  name: "Desert",
  description: "A sunset over mesas and dunes, with a saguaro, a cow skull, and a tumbleweed now and then",
  activity: {
    calm: "Sunset, mesas, a saguaro and a skull",
    lively: "Adds a soaring eagle and a rattlesnake",
    teeming: "Adds vultures, a howling coyote and more cacti",
  },
  scrim: [
    [14, 10, 30],
    [40, 16, 24],
    [16, 8, 8],
  ],
  create: (activity) => new Desert(activity),
}
