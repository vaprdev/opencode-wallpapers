import { Canvas } from "../src/canvas"
import { eggWait } from "../src/egg"
import { lightPool } from "../src/light"
import { TAU, clamp, lerp, rand, smoothstep, type RGB } from "../src/math"
import { STAR_TINTS } from "../src/sky"
import { touch } from "../src/touched"
import type { Activity, Settings, Time, Wallpaper } from "../src/wallpaper"

// The scene runs slower than real time, which keeps it calm behind text.
const TIME_SCALE = 0.35
// Quads along each edge of the six cube faces the surface is built from. The grid around each face has one more row
// of vertices on every side, so normals can be worked out from neighbors across the face's edge.
const N = 14
const G = N + 3
// The camera's distance in object radii, for a touch of perspective.
const CAMERA = 5
// Subsamples per pixel along each axis, for anti-aliased edges.
const SS = 2
// The forms the surface morphs through, in order. Calm skips the spiky star.
const CUBE = 0
const BALLS = 1
const STAR = 2
const PILLOW = 3
const CYCLE = [CUBE, BALLS, STAR, PILLOW]
const CALM_CYCLE = [CUBE, BALLS, PILLOW]
// The fraction of each form's turn spent morphing into the next.
const MORPH = 0.45
// The egg, a starfield warp, lasts this many scene seconds.
const WARP = 6
const WARP_STARS = 220
// Teeming's phosphor trail: how many glows it leaves behind each object.
const TRAIL = 8
// One saturated color per cube face (+x, -x, +y, -y, +z, -z), and the star's spikes.
const PATCHES: RGB[] = [
  [0.85, 0.05, 0.62],
  [0.8, 0.64, 0.04],
  [0.04, 0.6, 0.85],
  [0.1, 0.72, 0.1],
  [0.14, 0.24, 1],
  [0.85, 0.3, 0.03],
]
const SPIKE: RGB = [0.85, 0.035, 0.6]

// Everything that changes with the time of day. Night's highlights take the patch's own color with a cobalt glint,
// never white: the text on top is white.
interface Look {
  sky: [number, RGB][]
  // The key light from the upper left: its color, the ambient share, and the specular glint's color and how much of
  // the patch color it takes.
  key: RGB
  ambient: number
  glint: RGB
  glintTint: number
  // A soft fill catching the rim from below.
  fill: RGB
  // The phosphor trail's strength in teeming.
  trail: number
}

const LOOKS: Record<Time, Look> = {
  // The classic dark teal desktop and a strong, slightly warm key light.
  day: {
    sky: [
      [0, [0.004, 0.04, 0.046]],
      [0.5, [0.006, 0.07, 0.075]],
      [1, [0.003, 0.035, 0.04]],
    ],
    key: [1.05, 1, 0.95],
    ambient: 0.16,
    glint: [1, 0.96, 0.88],
    glintTint: 0.25,
    fill: [0.05, 0.25, 0.28],
    trail: 0.05,
  },
  // A deep plum fading to black under a warm, low light.
  sunset: {
    sky: [
      [0, [0.05, 0.01, 0.042]],
      [0.55, [0.022, 0.005, 0.02]],
      [1, [0.004, 0.001, 0.004]],
    ],
    key: [1, 0.72, 0.5],
    ambient: 0.12,
    glint: [1, 0.62, 0.32],
    glintTint: 0.4,
    fill: [0.3, 0.05, 0.25],
    trail: 0.06,
  },
  // Deep navy to black, the glint the patch's own color edged with cobalt.
  night: {
    sky: [
      [0, [0.003, 0.005, 0.02]],
      [1, [0.0005, 0.001, 0.004]],
    ],
    key: [0.8, 0.85, 1],
    ambient: 0.1,
    glint: [0.2, 0.4, 1.1],
    glintTint: 0.6,
    fill: [0.02, 0.15, 0.3],
    trail: 0.07,
  },
}

// A morphing, spinning object: its center in screen heights, its drift and the extra push of a click, its radius in
// screen heights and depth (nearer draws over farther), spin angles and rates, and its place in the morph cycle.
// Visitors (from a click or a finished task) have a life and fade in and out.
interface Blob {
  x: number
  y: number
  vx: number
  vy: number
  kx: number
  ky: number
  r: number
  z: number
  a: number
  b: number
  ra: number
  rb: number
  phase: number
  rate: number
  life: number
  age: number
  trail: { x: number; y: number }[]
  trailWait: number
  color: RGB
}

// The cube-sphere's unit directions per padded vertex, which face each one is on, and the triangles' vertex indices
// (three per triangle, each wound outward).
const DIRS = new Float32Array(6 * G * G * 3)
const TRIS: number[] = []
for (let f = 0; f < 6; f++) {
  const axis = f >> 1
  const s = f & 1 ? -1 : 1
  const e1 = s > 0 ? (axis + 1) % 3 : (axis + 2) % 3
  const e2 = s > 0 ? (axis + 2) % 3 : (axis + 1) % 3
  for (let j = 0; j < G; j++)
    for (let i = 0; i < G; i++) {
      const u = Math.tan((-1 + (2 * (i - 1)) / N) * (Math.PI / 4))
      const v = Math.tan((-1 + (2 * (j - 1)) / N) * (Math.PI / 4))
      const q = [0, 0, 0]
      q[axis] = s
      q[e1] = u
      q[e2] = v
      const l = Math.hypot(q[0], q[1], q[2])
      const o = ((f * G + j) * G + i) * 3
      DIRS[o] = q[0] / l
      DIRS[o + 1] = q[1] / l
      DIRS[o + 2] = q[2] / l
    }
  for (let j = 1; j <= N; j++)
    for (let i = 1; i <= N; i++) {
      const p = (f * G + j) * G + i
      TRIS.push(p, p + 1, p + G + 1, p, p + G + 1, p + G)
    }
}
const TRI = Int32Array.from(TRIS)
const VERTS = 6 * G * G

class FlowerBox extends Canvas {
  private time = 0
  private readonly activity: Activity
  private readonly look: Look
  private blobs: Blob[] = []
  private burst = 0
  private placed = false
  private warp = { wait: eggWait() * TIME_SCALE, t: -1, stars: [] as { a: number; z: number; tint: RGB }[] }
  // Per vertex: model position, view position, normal, color and occlusion; and the screen position.
  private readonly model = new Float32Array(VERTS * 3)
  private readonly view = new Float32Array(VERTS * 3)
  private readonly normals = new Float32Array(VERTS * 3)
  private readonly colors = new Float32Array(VERTS * 3)
  private readonly occlusion = new Float32Array(VERTS)
  private readonly screen = new Float32Array(VERTS * 3)
  // The subsample buffers an object is drawn into before it is mixed over the scene.
  private samples = new Float32Array(0)
  private depth = new Float32Array(0)
  private readonly shade = new Float32Array(16)

  constructor(settings: Settings) {
    super()
    this.supersample = 1
    this.activity = settings.activity
    this.look = LOOKS[settings.time]
    const sizes = settings.activity === "teeming" ? [0.17, 0.12, 0.085] : [0.175]
    this.blobs = sizes.map((r, i) => this.blob(r, i))
  }

  private blob(r: number, i: number, life = Infinity): Blob {
    const speed = { calm: 0.03, lively: 0.04, teeming: 0.035 }[this.activity] * (1 + 0.2 * i)
    const heading = rand(0, TAU)
    const spin = { calm: 0.2, lively: 0.27, teeming: 0.2 }[this.activity]
    return {
      x: 0,
      y: 0,
      vx: Math.cos(heading) * speed,
      vy: Math.sin(heading) * speed,
      kx: 0,
      ky: 0,
      r,
      z: -i,
      a: rand(0, TAU),
      b: rand(0, TAU),
      ra: spin * rand(0.8, 1.2),
      rb: spin * rand(0.45, 0.7),
      phase: i + rand(0, 0.5),
      rate: 1 / ({ calm: 30, lively: 20, teeming: 18 }[this.activity] * rand(0.9, 1.1)),
      life,
      age: 0,
      trail: [],
      trailWait: 0,
      color: [0, 0, 0],
    }
  }

  step(dt: number) {
    dt = clamp(dt, 0, 0.1) * TIME_SCALE
    this.time += dt
    this.stepGloom(dt)
    // After an error everything slows; after a finished task the morph races through its forms for a moment.
    const slow = 1 - 0.55 * this.gloom
    const burst = 1 + 7 * smoothstep(0, 0.5, this.burst)
    this.burst = Math.max(0, this.burst - dt)
    const A = this.A
    for (const b of this.blobs) {
      const k = dt * slow
      b.age += dt
      b.x += (b.vx + b.kx) * k
      b.y += (b.vy + b.ky) * k
      const decay = Math.exp(-dt / 2.5)
      b.kx *= decay
      b.ky *= decay
      const m = b.r * 1.15
      if (b.x < m || b.x > A - m) {
        const side = b.x < m ? 1 : -1
        b.vx = side * Math.abs(b.vx)
        b.kx = side * Math.abs(b.kx)
        b.x = clamp(b.x, m, Math.max(m, A - m))
      }
      if (b.y < m || b.y > 1 - m) {
        const side = b.y < m ? 1 : -1
        b.vy = side * Math.abs(b.vy)
        b.ky = side * Math.abs(b.ky)
        b.y = clamp(b.y, m, 1 - m)
      }
      // A knock from a click sets it spinning faster until the push dies away.
      b.a += b.ra * k * (lerp(1, 2.5, (burst - 1) / 7) + 6 * Math.hypot(b.kx, b.ky))
      b.b += b.rb * k
      b.phase += b.rate * k * burst
      if (this.activity !== "teeming") continue
      b.trailWait -= dt
      if (b.trailWait > 0) continue
      b.trailWait = 0.4
      b.trail.unshift({ x: b.x, y: b.y })
      b.trail.length = Math.min(b.trail.length, TRAIL)
    }
    this.blobs = this.blobs.filter((b) => b.age < b.life)
    this.stepWarp(dt)
  }

  render() {
    this.restore()
    if (this.warp.t >= 0) this.drawWarp()
    const order = [...this.blobs].sort((p, q) => p.z - q.z)
    if (this.activity === "teeming") for (const b of order) this.drawTrail(b)
    for (const b of order) this.drawBlob(b)
    this.finish()
  }

  // A finished task: the morph races through its forms and two small copies split off for a while.
  protected override visit() {
    this.burst = 2.5
    const main = this.blobs[0]
    if (!main || this.blobs.length > 4) return
    for (const side of [-1, 1]) {
      const b = this.blob(main.r * 0.45, 1, 9)
      b.x = main.x + side * main.r * 0.5
      b.y = main.y
      b.kx = side * 0.12
      b.ky = rand(-0.06, 0.06)
      // They come out from behind it.
      b.z = main.z - 0.5
      this.blobs.push(b)
    }
  }

  // A click near an object knocks it away; on open background a small one pops in for a while.
  poke(x: number, y: number) {
    let pushed = false
    for (const b of this.blobs) {
      const d = Math.hypot(b.x - x, b.y - y)
      if (d > b.r * 2.2) continue
      const k = 0.14 / Math.max(d, 0.02)
      b.kx += (b.x - x) * k
      b.ky += (b.y - y) * k
      pushed = true
    }
    if (pushed || this.blobs.length > 5) return
    const b = this.blob(0.06, 1, 10)
    b.x = clamp(x, 0.08, this.A - 0.08)
    b.y = clamp(y, 0.08, 0.92)
    b.z = 1
    this.blobs.push(b)
  }

  protected override layout() {
    const { W, H, A, hdr, look } = this
    // Spread the objects over the screen once its shape is known, and keep them on it after a resize.
    for (const b of this.blobs) {
      const m = b.r * 1.15
      if (!this.placed) [b.x, b.y] = this.openSpot(m, Math.max(m, A - m), m, 1 - m)
      b.x = clamp(b.x, m, Math.max(m, A - m))
      b.y = clamp(b.y, m, 1 - m)
    }
    this.placed = true
    const stops = look.sky
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

  private drawBlob(b: Blob) {
    const H = this.H
    const grow = b.life === Infinity ? 1 : smoothstep(0, 1, b.age) * smoothstep(b.life, b.life - 1.5, b.age)
    if (grow <= 0.01) return
    const cycle = this.activity === "calm" ? CALM_CYCLE : CYCLE
    const turn = ((b.phase % cycle.length) + cycle.length) % cycle.length
    const from = cycle[Math.floor(turn)]
    const to = cycle[(Math.floor(turn) + 1) % cycle.length]
    const blend = smoothstep(1 - MORPH, 1, turn - Math.floor(turn))
    surface(this.model, this.colors, this.occlusion, from, to, blend)
    // Two axes of spin plus a slow wobble of the second.
    const ca = Math.cos(b.a)
    const sa = Math.sin(b.a)
    const tilt = b.b + 0.4 * Math.sin(b.a * 0.37)
    const cb = Math.cos(tilt)
    const sb = Math.sin(tilt)
    const R = b.r * grow * H
    const gloom = 1 - 0.55 * this.gloom
    const look = this.look
    const s = this.shade
    s.set([look.key[0] * gloom, look.key[1] * gloom, look.key[2] * gloom, look.ambient, look.glint[0] * gloom, look.glint[1] * gloom, look.glint[2] * gloom, look.glintTint, look.fill[0] * gloom, look.fill[1] * gloom, look.fill[2] * gloom])
    const box = project(this.model, this.view, this.normals, this.screen, ca, sa, cb, sb, b.x * H, b.y * H, R)
    const x0 = Math.max(0, Math.floor(box[0]))
    const y0 = Math.max(0, Math.floor(box[1]))
    const x1 = Math.min(this.W - 1, Math.ceil(box[2]))
    const y1 = Math.min(H - 1, Math.ceil(box[3]))
    if (x1 < x0 || y1 < y0) return
    const n = (x1 - x0 + 1) * (y1 - y0 + 1) * SS * SS
    if (this.depth.length < n) {
      this.depth = new Float32Array(n * 2)
      this.samples = new Float32Array(n * 6)
    }
    raster(this.hdr, this.W, this.screen, this.normals, this.colors, this.occlusion, this.samples, this.depth, s, x0, y0, x1, y1, b.color)
    touch(this.hdr, x0, y0, x1, y1)
  }

  // A faint phosphor smear behind a teeming object: soft glows at where it was, fading with age.
  private drawTrail(b: Blob) {
    const H = this.H
    const c = b.color
    for (const [i, p] of b.trail.entries()) {
      const k = this.look.trail * (1 - i / TRAIL) * (1 - 0.55 * this.gloom)
      lightPool(this.hdr, this.W, H, p.x * H, p.y * H, b.r * H * 1.1, b.r * H * 1.1, c, 0, k)
    }
  }

  private stepWarp(dt: number) {
    const w = this.warp
    if (w.t < 0) {
      w.wait -= dt
      if (w.wait > 0) return
      w.t = 0
      w.stars = Array.from({ length: WARP_STARS }, () => ({ a: rand(0, TAU), z: rand(0.05, 1), tint: STAR_TINTS[Math.floor(Math.random() * STAR_TINTS.length)] }))
      return
    }
    w.t += dt
    const speed = 0.25 + 1.2 * smoothstep(0, 2, w.t) * smoothstep(WARP, WARP - 1.5, w.t)
    for (const s of w.stars) {
      s.z -= speed * dt * 0.6
      if (s.z > 0.03) continue
      s.z += 1
      s.a = rand(0, TAU)
    }
    if (w.t < WARP) return
    w.t = -1
    w.stars = []
    w.wait = eggWait(true) * TIME_SCALE
  }

  // The egg: the old starfield screensaver, stars streaming out from the middle in short streaks.
  private drawWarp() {
    const w = this.warp
    const { W, H } = this
    const fade = smoothstep(0, 1, w.t) * smoothstep(WARP, WARP - 1, w.t)
    const cx = W / 2
    const cy = H / 2
    const reach = Math.hypot(W, H) * 0.08
    for (const s of w.stars) {
      const d = reach / s.z
      const k = fade * smoothstep(1, 0.6, s.z) * 1.6
      for (let i = 0; i < 4; i++) {
        const di = d * (1 - i * 0.08 * (1 - s.z))
        const x = cx + Math.cos(s.a) * di
        const y = cy + Math.sin(s.a) * di * 0.9
        if (x < 0 || y < 0 || x >= W - 1 || y >= H - 1) continue
        const t = s.tint
        this.splat(x, y, t[0] * k * (1 - i * 0.22), t[1] * k * (1 - i * 0.22), t[2] * k * (1 - i * 0.22))
      }
    }
  }
}

// The surface's model positions, colors and crease occlusion per vertex, morphing from one form toward another.
function surface(model: Float32Array, colors: Float32Array, occlusion: Float32Array, from: number, to: number, blend: number) {
  const out = [0, 0, 0, 0, 0]
  for (let p = 0; p < VERTS; p++) {
    const o = p * 3
    const dx = DIRS[o]
    const dy = DIRS[o + 1]
    const dz = DIRS[o + 2]
    form(from, dx, dy, dz, out)
    let x = out[0]
    let y = out[1]
    let z = out[2]
    let spike = out[3]
    let occ = out[4]
    if (blend > 0) {
      form(to, dx, dy, dz, out)
      x = lerp(x, out[0], blend)
      y = lerp(y, out[1], blend)
      z = lerp(z, out[2], blend)
      spike = lerp(spike, out[3], blend)
      occ = lerp(occ, out[4], blend)
    }
    model[o] = x
    model[o + 1] = y
    model[o + 2] = z
    occlusion[p] = occ
    const ax = Math.abs(dx)
    const ay = Math.abs(dy)
    const az = Math.abs(dz)
    const c = PATCHES[ax >= ay && ax >= az ? (dx > 0 ? 0 : 1) : ay >= az ? (dy > 0 ? 2 : 3) : dz > 0 ? 4 : 5]
    colors[o] = lerp(c[0], SPIKE[0], spike)
    colors[o + 1] = lerp(c[1], SPIKE[1], spike)
    colors[o + 2] = lerp(c[2], SPIKE[2], spike)
  }
}

// One form's position for the unit direction (dx, dy, dz), into out with how much of it is a spike and its crease
// occlusion (1 open).
function form(kind: number, dx: number, dy: number, dz: number, out: number[]) {
  const ax = Math.abs(dx)
  const ay = Math.abs(dy)
  const az = Math.abs(dz)
  out[3] = 0
  out[4] = 1
  if (kind === CUBE) {
    // A cube with slightly softened edges.
    const r = 0.72 / Math.pow(ax ** 10 + ay ** 10 + az ** 10, 0.1)
    out[0] = dx * r
    out[1] = dy * r
    out[2] = dz * r
    return
  }
  if (kind === BALLS) {
    // Six balls on the axes, overlapping at the middle: where a ray from the center leaves the furthest of them.
    const r = Math.max(ball(ax, 0.45, 0.52), ball(ay, 0.45, 0.52), ball(az, 0.45, 0.52))
    out[0] = dx * r
    out[1] = dy * r
    out[2] = dz * r
    out[4] = 0.35 + 0.65 * smoothstep(0.62, 0.97, r)
    return
  }
  if (kind === STAR) {
    // Small colored lobes on the axes, and long pointed spikes toward the eight corners.
    const lobe = Math.max(ball(ax, 0.3, 0.36), ball(ay, 0.3, 0.36), ball(az, 0.3, 0.36))
    const angle = Math.acos(Math.min(1, (ax + ay + az) / Math.sqrt(3)))
    const spike = 0.3 + 0.98 * Math.max(0, 1 - angle / 0.42) ** 1.6
    const r = Math.max(lobe, spike)
    out[0] = dx * r
    out[1] = dy * r
    out[2] = dz * r
    out[3] = smoothstep(lobe - 0.02, lobe + 0.12, spike)
    out[4] = 0.45 + 0.55 * smoothstep(0.32, 0.6, r)
    return
  }
  // A pillow: a puffy square, pinched at the middle of each side, thin at its rim.
  const m = Math.max(ax, ay, az)
  const cx = dx / m
  const cy = dy / m
  const cz = dz / m
  const puff = (1 - cx * cx) * (1 - cy * cy)
  out[0] = cx * 0.88 * (1 - 0.14 * (1 - cy * cy))
  out[1] = cy * 0.88 * (1 - 0.14 * (1 - cx * cx))
  out[2] = cz * (0.04 + 0.36 * puff)
  out[4] = 0.75 + 0.25 * Math.sqrt(puff)
}

// How far from the middle a ray at cosine a to an axis leaves a ball of radius r centered c along it.
function ball(a: number, c: number, r: number) {
  return c * a + Math.sqrt(r * r - c * c * (1 - a * a))
}

// Spins the model into view space, works out each vertex's normal from its grid neighbors, and projects it to the
// screen around (cx, cy) with R pixels per model unit. Returns the screen box of the face vertices.
function project(model: Float32Array, view: Float32Array, normals: Float32Array, screen: Float32Array, ca: number, sa: number, cb: number, sb: number, cx: number, cy: number, R: number) {
  // Rotation about y by a, then about x by b.
  const m00 = ca
  const m01 = 0
  const m02 = sa
  const m10 = sb * sa
  const m11 = cb
  const m12 = -sb * ca
  const m20 = -cb * sa
  const m21 = sb
  const m22 = cb * ca
  let x0 = Infinity
  let y0 = Infinity
  let x1 = -Infinity
  let y1 = -Infinity
  for (let p = 0; p < VERTS; p++) {
    const o = p * 3
    const x = model[o]
    const y = model[o + 1]
    const z = model[o + 2]
    const vx = m00 * x + m01 * y + m02 * z
    const vy = m10 * x + m11 * y + m12 * z
    const vz = m20 * x + m21 * y + m22 * z
    view[o] = vx
    view[o + 1] = vy
    view[o + 2] = vz
    const k = (CAMERA / (CAMERA - vz)) * R
    const sx = cx + vx * k
    const sy = cy + vy * k
    screen[o] = sx
    screen[o + 1] = sy
    screen[o + 2] = vz
    const i = p % G
    const j = Math.floor(p / G) % G
    if (i === 0 || j === 0 || i === G - 1 || j === G - 1) continue
    x0 = Math.min(x0, sx)
    y0 = Math.min(y0, sy)
    x1 = Math.max(x1, sx)
    y1 = Math.max(y1, sy)
  }
  for (let p = 0; p < VERTS; p++) {
    const i = p % G
    const j = Math.floor(p / G) % G
    if (i === 0 || j === 0 || i === G - 1 || j === G - 1) continue
    const a = (p + 1) * 3
    const b = (p - 1) * 3
    const c = (p + G) * 3
    const d = (p - G) * 3
    const ux = view[a] - view[b]
    const uy = view[a + 1] - view[b + 1]
    const uz = view[a + 2] - view[b + 2]
    const wx = view[c] - view[d]
    const wy = view[c + 1] - view[d + 1]
    const wz = view[c + 2] - view[d + 2]
    const nx = uy * wz - uz * wy
    const ny = uz * wx - ux * wz
    const nz = ux * wy - uy * wx
    const l = Math.hypot(nx, ny, nz) || 1
    const o = p * 3
    normals[o] = nx / l
    normals[o + 1] = ny / l
    normals[o + 2] = nz / l
  }
  return [x0 - 1, y0 - 1, x1 + 1, y1 + 1]
}

// Draws the front-facing triangles into subsample buffers over the box x0..x1, y0..y1 with a depth test and Phong
// shading, then mixes each pixel's covered subsamples over the scene. shade holds the key light, ambient, glint, glint
// tint and fill (see Look). Leaves the object's average color in mean.
function raster(hdr: Float32Array, W: number, screen: Float32Array, normals: Float32Array, colors: Float32Array, occlusion: Float32Array, samples: Float32Array, depth: Float32Array, shade: Float32Array, x0: number, y0: number, x1: number, y1: number, mean: RGB) {
  const sw = (x1 - x0 + 1) * SS
  const sh = (y1 - y0 + 1) * SS
  depth.fill(-Infinity, 0, sw * sh)
  // The key light from the upper left and front, and the half vector toward a viewer straight ahead.
  const lx = -0.45
  const ly = -0.6
  const lz = 0.66
  const hl = Math.hypot(lx, ly, lz + 1)
  const hx = lx / hl
  const hy = ly / hl
  const hz = (lz + 1) / hl
  for (let t = 0; t < TRI.length; t += 3) {
    const a = TRI[t] * 3
    const b = TRI[t + 1] * 3
    const c = TRI[t + 2] * 3
    // Subsample coordinates, sample centers at integer + 0.5.
    const ax = (screen[a] - x0) * SS
    const ay = (screen[a + 1] - y0) * SS
    const bx = (screen[b] - x0) * SS
    const by = (screen[b + 1] - y0) * SS
    const cx = (screen[c] - x0) * SS
    const cy = (screen[c + 1] - y0) * SS
    const area = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax)
    if (area <= 1e-6) continue
    const sx0 = Math.max(0, Math.floor(Math.min(ax, bx, cx)))
    const sy0 = Math.max(0, Math.floor(Math.min(ay, by, cy)))
    const sx1 = Math.min(sw - 1, Math.ceil(Math.max(ax, bx, cx)))
    const sy1 = Math.min(sh - 1, Math.ceil(Math.max(ay, by, cy)))
    const inv = 1 / area
    for (let y = sy0; y <= sy1; y++) {
      const py = y + 0.5
      for (let x = sx0; x <= sx1; x++) {
        const px = x + 0.5
        const wa = ((bx - px) * (cy - py) - (by - py) * (cx - px)) * inv
        const wb = ((cx - px) * (ay - py) - (cy - py) * (ax - px)) * inv
        const wc = 1 - wa - wb
        if (wa < 0 || wb < 0 || wc < 0) continue
        const z = wa * screen[a + 2] + wb * screen[b + 2] + wc * screen[c + 2]
        const s = y * sw + x
        if (z <= depth[s]) continue
        depth[s] = z
        let nx = wa * normals[a] + wb * normals[b] + wc * normals[c]
        let ny = wa * normals[a + 1] + wb * normals[b + 1] + wc * normals[c + 1]
        let nz = wa * normals[a + 2] + wb * normals[b + 2] + wc * normals[c + 2]
        const nl = 1 / (Math.hypot(nx, ny, nz) || 1)
        nx *= nl
        ny *= nl
        nz *= nl
        const occ = wa * occlusion[a / 3] + wb * occlusion[b / 3] + wc * occlusion[c / 3]
        const diffuse = Math.max(0, (nx * lx + ny * ly + nz * lz + 0.3) / 1.3)
        const sp0 = Math.max(0, nx * hx + ny * hy + nz * hz)
        const sp2 = sp0 * sp0
        const sp8 = sp2 * sp2 * sp2 * sp2
        const spec = sp8 * sp8 * sp8 * sp8 * 0.9 + sp8 * 0.12
        // A soft fill on the rim facing down and away from the key.
        const rim = Math.max(0, 1 - Math.abs(nz)) ** 2 * Math.max(0, 0.3 + ny)
        const o = s * 3
        for (let k = 0; k < 3; k++) {
          const col = wa * colors[a + k] + wb * colors[b + k] + wc * colors[c + k]
          const glint = lerp(shade[4 + k], shade[4 + k] * col * 1.6, shade[7])
          samples[o + k] = col * (shade[3] + shade[k] * diffuse) * occ + glint * spec * occ + shade[8 + k] * rim * occ
        }
      }
    }
  }
  let sr = 0
  let sg = 0
  let sb = 0
  let count = 0
  const area = 1 / (SS * SS)
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      let r = 0
      let g = 0
      let b = 0
      let n = 0
      for (let j = 0; j < SS; j++)
        for (let i = 0; i < SS; i++) {
          const s = ((y - y0) * SS + j) * sw + (x - x0) * SS + i
          if (depth[s] === -Infinity) continue
          r += samples[s * 3]
          g += samples[s * 3 + 1]
          b += samples[s * 3 + 2]
          n++
        }
      if (!n) continue
      const cov = n * area
      const o = (y * W + x) * 3
      hdr[o] += (r / n - hdr[o]) * cov
      hdr[o + 1] += (g / n - hdr[o + 1]) * cov
      hdr[o + 2] += (b / n - hdr[o + 2]) * cov
      sr += r
      sg += g
      sb += b
      count += n
    }
  const k = count ? 1 / count : 0
  mean[0] = sr * k
  mean[1] = sg * k
  mean[2] = sb * k
}

export const flowerbox: Wallpaper = {
  id: "flowerbox",
  name: "Flower Box",
  description: "The old 3D screensaver: a glossy box of colored patches spinning and bouncing, morphing into balls, a star and a pillow",
  fixedTime: "night",
  activity: {
    calm: "One object drifting and turning slowly, morphing between a cube, a cluster of balls and a pillow",
    lively: "A little quicker, through the full morph cycle with the spiky star",
    teeming: "Three objects of different sizes bouncing independently, with faint phosphor trails",
  },
  scrim: {
    day: [
      [0, 34, 38],
      [0, 42, 46],
      [0, 30, 34],
    ],
    sunset: [
      [34, 8, 28],
      [22, 6, 18],
      [8, 2, 7],
    ],
    night: [
      [2, 4, 14],
      [1, 3, 10],
      [0, 1, 4],
    ],
  },
  create: (settings) => new FlowerBox(settings),
}
