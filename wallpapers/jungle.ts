import { Canvas, cap, ell, type Lighting, type Part } from "../src/canvas"
import { eggWait } from "../src/egg"
import { TAU, clamp, fbm1, hash, lerp, rand, smoothstep, type RGB } from "../src/math"
import type { Activity, Settings, Time, Wallpaper } from "../src/wallpaper"
import { WeatherLayer } from "../src/weather"

// The scene runs slower than real time, which keeps it calm behind text.
const TIME_SCALE = 0.35
// Creatures move and animate at a quarter of scene speed, so they drift rather than dart.
const CREATURE_SPEED = 0.25
// When a task finishes at night, the fireflies flash together once a scene second for this long.
const CHORUS = 3
const RAY_N = 1024
// How long the sloth's visit lasts, in creature time.
const SLOTH = 24
// Where the monkey hangs from the high branch, in screen heights from the right edge.
const MONKEY = 0.38

// What changes with the time of day. Plants and animals have one daytime color each; tint darkens them into
// silhouettes at sunset and night, while the mist, distant trees, water and light shafts get their own colors.
interface Look {
  style: "rim" | "front"
  light: RGB
  mist: [top: RGB, middle: RGB, bottom: RGB]
  far: RGB
  water: RGB
  shafts: number
  tint: RGB
  night: boolean
}

const LOOKS: Record<Time, Look> = {
  day: {
    style: "front",
    light: [1, 0.95, 0.75],
    mist: [
      [0.7, 0.85, 0.72],
      [0.32, 0.52, 0.36],
      [0.06, 0.12, 0.06],
    ],
    far: [0.33, 0.52, 0.38],
    water: [0.8, 0.92, 1],
    shafts: 0.35,
    tint: [1, 1, 1],
    night: false,
  },
  sunset: {
    style: "rim",
    light: [1, 0.5, 0.22],
    mist: [
      [1, 0.62, 0.38],
      [0.5, 0.24, 0.18],
      [0.04, 0.025, 0.02],
    ],
    far: [0.45, 0.2, 0.16],
    water: [1, 0.72, 0.55],
    shafts: 0.5,
    tint: [0.2, 0.13, 0.1],
    night: false,
  },
  night: {
    style: "rim",
    light: [0.1, 0.7, 0.62],
    mist: [
      [0.02, 0.08, 0.12],
      [0.008, 0.035, 0.05],
      [0.002, 0.008, 0.01],
    ],
    far: [0.015, 0.05, 0.06],
    water: [0.04, 0.38, 0.5],
    shafts: 0.12,
    tint: [0.02, 0.05, 0.06],
    night: true,
  },
}

// The rainy season (summer and autumn) thickens the mist toward these colors, dims the light shafts and swells the
// waterfall.
const RAINY_MIST: Record<Time, RGB> = { day: [0.36, 0.46, 0.42], sunset: [0.3, 0.16, 0.16], night: [0.01, 0.04, 0.07] }

// Daytime colors.
const TRUNK: RGB = [0.24, 0.17, 0.1]
const CANOPY: RGB = [0.1, 0.28, 0.09]
const LEAF: RGB = [0.12, 0.42, 0.08]
const VINE: RGB = [0.14, 0.3, 0.08]
const ROCK: RGB = [0.25, 0.27, 0.24]
const FLOOR: RGB = [0.08, 0.12, 0.05]
const BLACK: RGB = [0.03, 0.03, 0.03]

// Daylight comes from the upper right, slightly in front of the scene.
const DAYLIGHT = (() => {
  const l = Math.hypot(0.5, 0.6, 0.6)
  return [0.5 / l, -0.6 / l, 0.6 / l] as const
})()

const RAYS_A = buildRays(3)
const RAYS_B = buildRays(11)

// A big foreground leaf rooted at (x, y), pointing along angle (radians, 0 = right, negative = up).
interface Leaf {
  x: number
  y: number
  angle: number
  length: number
  phase: number
}

interface Flyer {
  x: number
  y: number
  dir: number
  next: number
  phase: number
}

interface Butterfly {
  x: number
  y: number
  wx: number
  wy: number
  wanderT: number
  phase: number
}

class Jungle extends Canvas {
  private time = 0
  private creatureTime = 0
  private readonly activity: Activity
  private readonly look: Look
  private readonly weather: WeatherLayer
  private readonly rainy: boolean
  private lighting: Lighting = { style: "front", dir: DAYLIGHT }
  private background = new Float32Array(0)
  private leaves: Leaf[] = []
  private groundPx = new Float32Array(0)
  private falls = { x: 0, top: 0, bottom: 0, half: 0 }
  private toucan: Flyer = { x: -9, y: 0.25, dir: 1, next: 14, phase: 0 }
  private butterflies: Butterfly[] = []
  private glowers: { x: number; y: number; vx: number; vy: number; phase: number }[] = []
  // Scene seconds left of the fireflies flashing in unison.
  private chorus = 0
  private pollen = Array.from({ length: 40 }, () => ({ x: Math.random() * 4, y: 0.1 + Math.random() * 0.7, s: Math.random() }))
  // A click sets the monkey swinging harder: kick is how hard, fading away, and swing is the phase of that swing.
  private monkey = { kick: 0, swing: 0 }
  // The vine in the left corner, in screen heights, which the sloth climbs down.
  private liana = { x: 0, length: 0, phase: 0 }
  // The easter egg: a sloth lowers itself down the vine, smiles at you, and climbs back up. t is creature time.
  private sloth = { wait: eggWait() * TIME_SCALE, t: -1 }

  constructor(settings: Settings) {
    super()
    this.activity = settings.activity
    const rainy = settings.season === "summer" || settings.season === "autumn"
    this.rainy = rainy
    const look = LOOKS[settings.time]
    const wet = RAINY_MIST[settings.time]
    this.look = rainy ? { ...look, mist: [mixRGB(look.mist[0], wet, 0.55), mixRGB(look.mist[1], wet, 0.4), look.mist[2]], far: mixRGB(look.far, wet, 0.4), shafts: look.shafts * 0.25 } : look
    // Without a weather setting, the rainy season brings a light shower.
    this.weather = new WeatherLayer(settings.weather ?? (rainy ? "rain" : "clear"), settings.time, 0.66, !settings.weather)
    const count = this.look.night ? 0 : { calm: 0, lively: 2, teeming: 4 }[settings.activity]
    this.butterflies = Array.from({ length: count }, (_, i) => ({ x: 0.3 + i * 0.3, y: 0.5, wx: 0.3 + i * 0.3, wy: 0.5, wanderT: 0, phase: i * 2.3 }))
    const flies = this.look.night ? { calm: 16, lively: 30, teeming: 48 }[settings.activity] : 0
    this.glowers = Array.from({ length: flies }, () => ({ x: Math.random() * 2, y: 0.3 + Math.random() * 0.62, vx: 0, vy: 0, phase: Math.random() * TAU }))
  }

  step(dt: number) {
    dt = clamp(dt, 0, 0.1) * TIME_SCALE
    this.time += dt
    const cdt = dt * CREATURE_SPEED
    this.creatureTime += cdt
    for (const p of this.pollen) {
      p.x += (0.004 + p.s * 0.006) * dt
      p.y += Math.sin(this.time * 0.4 + p.s * 20) * 0.003 * dt
      if (p.x > this.A) p.x -= this.A
    }
    for (const f of this.glowers) {
      f.vx += (Math.random() - 0.5) * 0.02 * dt
      f.vy += (Math.random() - 0.5) * 0.02 * dt
      f.vx *= Math.exp(-dt * 0.5)
      f.vy *= Math.exp(-dt * 0.5)
      f.x = (f.x + f.vx * dt + this.A) % this.A
      f.y = clamp(f.y + f.vy * dt, 0.25, 0.95)
    }
    this.stepToucan(dt)
    this.weather.step(dt)
    for (const b of this.butterflies) this.stepButterfly(b, cdt)
    this.stepGloom(dt)
    this.chorus = Math.max(0, this.chorus - dt)
    const m = this.monkey
    m.kick *= Math.exp(-cdt * 0.5)
    m.swing += cdt * 6
    const sl = this.sloth
    if (sl.t < 0) {
      sl.wait -= dt
      if (sl.wait <= 0) sl.t = 0
      return
    }
    sl.t += cdt
    if (sl.t < SLOTH) return
    sl.t = -1
    sl.wait = eggWait(true) * TIME_SCALE
  }

  // The toucan doesn't fly at night, so the fireflies flash together instead.
  protected override visit() {
    if (this.look.night) this.chorus = CHORUS
    else if (this.toucan.x < -5) this.toucan.next = 0
  }

  // The monkey gets a push and swings harder for a while.
  poke(x: number) {
    if (this.activity === "calm") return
    const m = this.monkey
    // Start the extra swing from rest so the push never makes it jump, swinging away from the click.
    if (m.kick < 0.05) m.swing = x < this.A - MONKEY ? Math.PI : 0
    m.kick = 1
  }

  render() {
    this.hdr.set(this.background)
    this.drawShafts()
    this.drawFalls()
    if (this.toucan.x > -5) this.drawToucan(this.toucan)
    if (this.sloth.t >= 0) this.drawSloth()
    if (this.activity !== "calm") this.drawMonkey()
    if (this.activity === "teeming") {
      this.drawMacaw(this.A - 0.19, -1, 0)
      this.drawMacaw(this.A - 0.24, 1, 1.7)
      this.drawJaguar()
      this.drawFrog()
    }
    for (const b of this.butterflies) this.drawButterfly(b)
    this.drawMotes()
    for (const l of this.leaves) this.drawLeaf(l)
    this.weather.draw(this.hdr, this.W, this.H)
    this.finish()
  }

  // Everything that never moves is painted once per size into `background`, then copied in each frame.
  protected override layout() {
    const { W, H, A, look } = this
    this.lighting = look.style === "front" ? { style: "front", dir: DAYLIGHT } : { style: "rim", color: look.light, x: 0.85 * W, y: -0.15 * H }
    this.drawMist()
    // Distant trees fade into the mist: thin trunks and a hazy band of canopy.
    for (let i = 0; i < Math.round(A * 7); i++) {
      const x = (i + 0.2 + hash(i * 3.1) * 0.6) * (A / Math.round(A * 7)) * H
      const r = (0.007 + hash(i * 5.7) * 0.008) * H
      this.shape([cap(x, H * 0.9, x + (hash(i) - 0.5) * 0.04 * H, 0, r * 1.3, r, look.far)], this.lighting, 0.15)
    }
    this.shape(
      Array.from({ length: Math.round(A * 14) }, (_, i) => ell((hash(i * 1.3) * A + 0.02) * H, (0.06 + hash(i * 2.9) * 0.16) * H, (0.06 + hash(i * 4.1) * 0.06) * H, (0.04 + hash(i * 6.3) * 0.03) * H, 0, look.far)),
      this.lighting,
      0.15,
    )
    // A rocky cliff with the waterfall pouring over it, on the left; the animals' tree stands on the right.
    const fx = 0.32
    this.falls = { x: fx * H, top: 0.27 * H, bottom: 0.66 * H, half: (this.rainy ? 0.026 : 0.018) * H }
    const rock = mixRGB(this.paint(ROCK), look.far, 0.35)
    const boulders: [number, number, number, number][] = [
      [0, 0.47, 0.085, 0.2],
      [-0.075, 0.58, 0.07, 0.1],
      [0.08, 0.56, 0.065, 0.12],
      [-0.045, 0.37, 0.06, 0.09],
      [0.05, 0.35, 0.05, 0.08],
      [-0.1, 0.66, 0.06, 0.05],
      [0.11, 0.65, 0.06, 0.05],
    ]
    for (const [dx, dy, rx, ry] of boulders) this.shape([ell((fx + dx) * H, dy * H, rx * H, ry * H, dx * 2, rock, 2.5)], this.lighting, 0.8)
    this.shape([ell(fx * H, 0.675 * H, 0.1 * H, 0.018 * H, 0, mixRGB(look.water, look.far, 0.6))], this.lighting, 0)
    this.shape(
      [-0.07, -0.03, 0.02, 0.06, 0.09].map((dx, i) => ell((fx + dx) * H, (0.27 + hash(i * 2.7) * 0.03) * H, 0.04 * H, 0.03 * H, 0, mixRGB(this.paint(CANOPY), look.far, 0.2))),
      this.lighting,
      0.8,
    )
    // The canopy ceiling.
    this.shape(
      Array.from({ length: Math.round(A * 10) }, (_, i) => ell((hash(i * 7.7) * A) * H, (-0.03 + hash(i * 8.3) * 0.13) * H, (0.07 + hash(i * 9.1) * 0.07) * H, (0.05 + hash(i * 3.3) * 0.04) * H, hash(i) - 0.5, this.paint(CANOPY))),
      this.lighting,
    )
    // Vines hanging from the canopy, clear of the waterfall.
    for (let i = 0; i < 7; i++) {
      const vine = { x: (0.06 + (i / 6) * 0.88) * A, length: 0.25 + hash(i * 2.2) * 0.35, phase: hash(i * 4.4) * TAU }
      if (Math.abs(vine.x - fx) < 0.06) continue
      if (i === 0) this.liana = vine
      this.drawVine(vine.x * H, vine.length * H, vine.phase)
    }
    // Two big trunks with buttress roots, and the branches the animals use.
    this.drawTrunk(0.04 * H, 0.045 * H)
    this.drawTrunk((A - 0.12) * H, 0.038 * H)
    this.shape([cap(...this.lowBranch(A - 0.15), ...this.lowBranch(A - 0.5), 0.022 * H, 0.012 * H, this.paint(TRUNK))], this.lighting)
    this.shape([cap(...this.highBranch(A - 0.15), ...this.highBranch(A - 0.46), 0.018 * H, 0.01 * H, this.paint(TRUNK))], this.lighting)
    // The forest floor and its ferns.
    this.groundPx = new Float32Array(W)
    for (let x = 0; x < W; x++) this.groundPx[x] = (0.86 + 0.02 * Math.sin((x / H) * 3.3) + (fbm1(x * 0.02, 4) - 0.5) * 0.03) * H
    for (let x = 0; x < W; x++)
      for (let y = Math.floor(this.groundPx[x]); y < H; y++) {
        const k = 0.8 + 0.25 * fbm1(x * 0.3 + y * 0.7, 6)
        const c = this.paint(FLOOR)
        this.blend((y * W + x) * 3, c[0] * k, c[1] * k, c[2] * k, clamp(y + 1 - this.groundPx[x], 0, 1))
      }
    for (let i = 0; i < Math.round(A * 6); i++) {
      const x = (hash(i * 3.9) * A) * H
      this.drawFern(x, this.groundPx[clamp(Math.round(x), 0, W - 1)] + 2, (0.08 + hash(i * 1.1) * 0.06) * H, hash(i * 5.5) > 0.5 ? 1 : -1)
    }
    // Big leaves framing the corners, drawn each frame so they can sway.
    this.leaves = [
      ...[-0.9, -0.55, -1.25].map((angle, i) => ({ x: -0.03, y: 1.06, angle, length: [0.42, 0.36, 0.3][i], phase: i * 1.9 })),
      ...[-2.25, -2.6, -1.9].map((angle, i) => ({ x: A + 0.03, y: 1.06, angle, length: [0.4, 0.34, 0.3][i], phase: i * 2.3 + 1 })),
      ...[0.6, 0.95].map((angle, i) => ({ x: -0.02, y: -0.04, angle, length: [0.3, 0.26][i], phase: i * 1.3 + 2 })),
      ...[2.5, 2.2].map((angle, i) => ({ x: A + 0.02, y: -0.04, angle, length: [0.3, 0.25][i], phase: i * 1.7 + 3 })),
    ]
    this.background = this.hdr.slice()
  }

  private paint(c: RGB): RGB {
    const t = this.look.tint
    return [c[0] * t[0], c[1] * t[1], c[2] * t[2]]
  }

  // Points along the two animal branches of the right-hand tree, in pixels, at x in screen heights. They rise a little
  // toward their tips.
  private lowBranch(x: number): [number, number] {
    return [x * this.H, lerp(0.69, 0.65, (this.A - 0.15 - x) / 0.35) * this.H]
  }

  private highBranch(x: number): [number, number] {
    return [x * this.H, lerp(0.31, 0.29, (this.A - 0.15 - x) / 0.31) * this.H]
  }

  // Misty depth: bright and hazy above, dark at the forest floor.
  private drawMist() {
    const { W, H, hdr } = this
    const [top, middle, bottom] = this.look.mist
    for (let y = 0; y < H; y++) {
      const v = y / H
      const c = v < 0.45 ? mixRGB(top, middle, smoothstep(0, 0.45, v)) : mixRGB(middle, bottom, smoothstep(0.45, 1, v))
      for (let x = 0; x < W; x++) {
        const o = (y * W + x) * 3
        hdr[o] = c[0]
        hdr[o + 1] = c[1]
        hdr[o + 2] = c[2]
      }
    }
  }

  // A vine hanging from the canopy in a gentle curve, with small leaves along it.
  private drawVine(x: number, length: number, phase: number) {
    const H = this.H
    const at = (t: number): [number, number] => [x + Math.sin(t * Math.PI * 0.8 + phase) * 0.02 * H * t, t * length]
    const parts: Part[] = []
    for (let i = 0; i < 12; i++) parts.push(cap(...at(i / 12), ...at((i + 1) / 12), 0.004 * H, 0.0035 * H, this.paint(VINE)))
    for (let i = 1; i < 10; i++) {
      const [lx, ly] = at(i / 10)
      const side = i % 2 ? 1 : -1
      parts.push(ell(lx + side * 0.01 * H, ly, 0.011 * H, 0.005 * H, side * 0.5, this.paint(LEAF)))
    }
    this.shape(parts, this.lighting, 0.7)
  }

  // A rainforest trunk with flaring buttress roots and ridged bark.
  private drawTrunk(x: number, r: number) {
    const H = this.H
    const c = this.paint(TRUNK)
    this.shape(
      [
        cap(x, H * 1.02, x + r * 0.2, -0.05 * H, r, r * 0.8, c, 3),
        cap(x, H * 0.75, x - r * 2.6, H * 0.92, r * 0.7, r * 0.25, c),
        cap(x, H * 0.75, x + r * 2.4, H * 0.93, r * 0.7, r * 0.25, c),
        cap(x, H * 0.78, x - r * 1.2, H * 0.95, r * 0.6, r * 0.3, c),
      ],
      this.lighting,
    )
  }

  // A fern frond arching from the ground, with leaflets along its curve.
  private drawFern(x: number, gy: number, size: number, side: number) {
    const at = (t: number): [number, number] => [x + side * Math.sin(t * 1.4) * size * 0.8, gy - Math.sin(t * Math.PI * 0.6) * size]
    const parts: Part[] = []
    for (let i = 0; i < 10; i++) {
      const [ax, ay] = at(i / 10)
      const [bx, by] = at((i + 1) / 10)
      parts.push(cap(ax, ay, bx, by, size * 0.025, size * 0.02, this.paint(LEAF)))
      const leaflet = size * 0.14 * (1 - i / 12)
      for (const s of [-1, 1]) parts.push(ell(ax + s * leaflet * 0.4, ay - leaflet * 0.5, leaflet * 0.6, leaflet * 0.18, s * 0.9 - 0.5 * side, this.paint(LEAF)))
    }
    this.shape(parts, this.lighting, 0.6)
  }

  // Shafts of light slanting down through the canopy from the upper right, shimmering slowly.
  private drawShafts() {
    const { W, H, hdr, look } = this
    const t = this.time
    const [lr, lg, lb] = look.light
    // After an error the shafts fade, as if clouds had covered the sun.
    const overcast = 1 - smoothstep(0, 1, this.gloom) * 0.75
    for (let y = 0; y < H * 0.85; y++) {
      const fade = Math.pow(1 - y / (H * 0.85), 1.4) * look.shafts * overcast
      for (let x = 0; x < W; x++) {
        const s = x + y * 0.55
        const ray = RAYS_A[((s * 0.9 + t * 3) | 0) & 1023] * (0.4 + 0.6 * RAYS_B[((s * 0.6 - t * 2) | 0) & 1023]) * fade
        const o = (y * W + x) * 3
        hdr[o] += ray * lr
        hdr[o + 1] += ray * lg
        hdr[o + 2] += ray * lb
      }
    }
  }

  // The waterfall: streaks of falling water over the cliff, and foaming mist where it lands.
  private drawFalls() {
    const { W, H, hdr, look } = this
    const f = this.falls
    const t = this.time
    const [wr, wg, wb] = look.water
    for (let y = Math.floor(f.top); y < Math.min(H, f.bottom); y++)
      for (let x = Math.floor(f.x - f.half); x <= Math.ceil(f.x + f.half); x++) {
        if (x < 0 || x >= W) continue
        const across = Math.abs(x + 0.5 - f.x) / f.half
        if (across >= 1) continue
        const edge = smoothstep(1, 0.55, across) * smoothstep(f.top, f.top + 3, y)
        const n = 0.5 * Math.sin(y * 0.35 - t * 14 + hash(x) * 6) + 0.5 * Math.sin(y * 0.13 - t * 9 + hash(x + 50) * 4)
        const k = 0.7 + 0.3 * n
        this.blend((y * W + x) * 3, wr * k, wg * k, wb * k, 0.85 * edge)
      }
    const rx = f.half * 3
    const ry = 0.03 * H
    for (let y = Math.max(0, Math.floor(f.bottom - ry)); y < Math.min(H, f.bottom + ry); y++)
      for (let x = Math.max(0, Math.floor(f.x - rx)); x < Math.min(W, f.x + rx); x++) {
        const q = ((x + 0.5 - f.x) / rx) ** 2 + ((y + 0.5 - f.bottom) / ry) ** 2
        if (q >= 1) continue
        const a = (1 - q) * 0.45 * (0.8 + 0.2 * Math.sin(t * 3 + x * 0.3))
        const o = (y * W + x) * 3
        hdr[o] += wr * a
        hdr[o + 1] += wg * a
        hdr[o + 2] += wb * a
      }
  }

  // Now and then a toucan flies across the canopy, except at night.
  private stepToucan(dt: number) {
    const b = this.toucan
    b.phase += dt * 8
    if (this.look.night) return
    if (b.x < -5) {
      b.next -= dt
      if (b.next > 0) return
      b.dir = Math.random() < 0.5 ? 1 : -1
      b.x = b.dir > 0 ? -0.15 : this.A + 0.15
      b.y = this.openRow(0.16, 0.32)
      return
    }
    b.x += b.dir * 0.08 * dt
    if (b.x < -0.3 || b.x > this.A + 0.3) {
      b.x = -9
      b.next = rand(40, 75)
    }
  }

  private drawToucan(b: Flyer) {
    const H = this.H
    const S = 0.13 * H
    const face = b.dir
    const x = b.x * H
    const y = (b.y + Math.sin(b.phase * 0.3) * 0.01) * H
    const P = (u: number, v: number): [number, number] => [x + u * face * S, y + v * S]
    const flap = Math.sin(b.phase)
    this.shape(
      [
        cap(...P(-0.25, 0), ...P(-0.55, 0.06), 0.07 * S, 0.05 * S, this.paint(BLACK)),
        ell(...P(0, 0), 0.28 * S, 0.14 * S, -0.1 * face, this.paint(BLACK)),
        ell(...P(-0.22, 0.07), 0.05 * S, 0.03 * S, 0, this.paint([0.8, 0.08, 0.06])),
        ell(...P(0.18, 0.05), 0.12 * S, 0.09 * S, 0, this.paint([0.95, 0.85, 0.3])),
        ell(...P(0.3, -0.04), 0.1 * S, 0.09 * S, 0, this.paint(BLACK)),
        cap(...P(0.38, -0.04), ...P(0.72, 0.01), 0.07 * S, 0.025 * S, this.paint([1, 0.55, 0.08])),
        cap(...P(0.7, 0.01), ...P(0.8, 0.03), 0.026 * S, 0.012 * S, this.paint(BLACK)),
        ell(...P(0.33, -0.06), 0.03 * S, 0.03 * S, 0, this.paint([0.2, 0.55, 0.9])),
        cap(...P(-0.02, -0.05), ...P(-0.12, -0.05 - 0.45 * flap), 0.1 * S, 0.04 * S, this.paint(BLACK)),
      ],
      this.lighting,
      0.6,
    )
  }

  // A spider monkey hanging by its tail from the high branch, swinging slowly; at night it barely stirs.
  private drawMonkey() {
    const H = this.H
    const [ax, ay] = this.highBranch(this.A - MONKEY)
    const m = this.monkey
    const swing = (this.look.night ? 0.05 : 0.35) * Math.sin(this.creatureTime * 1.2) + (this.look.night ? 0.2 : 0.4) * m.kick * Math.sin(m.swing)
    const cs = Math.cos(swing)
    const sn = Math.sin(swing)
    const P = (u: number, v: number): [number, number] => [ax + (u * cs - v * sn) * H, ay + (u * sn + v * cs) * H]
    const fur = this.paint([0.3, 0.2, 0.12])
    const parts: Part[] = [cap(ax - 0.008 * H, ay - 0.01 * H, ax + 0.008 * H, ay - 0.01 * H, 0.004 * H, 0.004 * H, fur)]
    for (let i = 0; i < 4; i++) parts.push(cap(...P(Math.sin(i * 0.8) * 0.006, (i / 4) * 0.07), ...P(Math.sin((i + 1) * 0.8) * 0.006, ((i + 1) / 4) * 0.07), 0.004 * H, 0.004 * H, fur))
    parts.push(
      cap(...P(0, 0.07), ...P(0, 0.14), 0.018 * H, 0.016 * H, fur),
      cap(...P(0, 0.075), ...P(-0.025, 0.045), 0.006 * H, 0.005 * H, fur),
      cap(...P(0, 0.075), ...P(0.025, 0.05), 0.006 * H, 0.005 * H, fur),
      cap(...P(-0.006, 0.135), ...P(-0.03, 0.2), 0.006 * H, 0.005 * H, fur),
      cap(...P(0.006, 0.135), ...P(0.04, 0.19), 0.006 * H, 0.005 * H, fur),
      ell(...P(0, 0.165), 0.02 * H, 0.019 * H, swing, fur),
      ell(...P(0, 0.17), 0.012 * H, 0.011 * H, swing, this.paint([0.65, 0.5, 0.38])),
    )
    this.shape(parts, this.lighting, 0.7)
    for (const s of [-1, 1]) this.add(...P(s * 0.005, 0.167), 0.01, 0.01, 0.01)
  }

  // A three-toed sloth hanging from the corner vine by its long arms, lowering itself hand over hand out of the
  // leaves, stopping to turn its smiling face toward you, then climbing back up.
  private drawSloth() {
    const H = this.H
    const t = this.sloth.t
    const v = this.liana
    const s = lerp(0.2, 0.75, smoothstep(0, 10, t) * (1 - smoothstep(14, 24, t)))
    const at = (q: number): [number, number] => [(v.x + Math.sin(q * Math.PI * 0.8 + v.phase) * 0.02 * q) * H, q * v.length * H]
    const [gx, gy] = at(s)
    const S = 0.17 * H
    const climbing = (t < 10 || t > 14) && t < 24
    const reach = climbing ? Math.sin(t * 4) * 0.05 : 0
    const tilt = Math.sin(smoothstep(10, 11, t) * (1 - smoothstep(13, 14, t)) * Math.PI * 0.5) * 0.25
    const P = (u: number, w: number): [number, number] => [gx + u * S, gy + w * S]
    const fur = this.paint([0.42, 0.36, 0.27])
    const claw = this.paint([0.2, 0.16, 0.12])
    this.shape(
      [
        cap(...P(-0.11, 0.24), ...P(-0.02, -0.02 + reach), 0.045 * S, 0.035 * S, fur),
        cap(...P(0.11, 0.24), ...P(0.02, 0.02 - reach), 0.045 * S, 0.035 * S, fur),
        cap(...P(-0.09, 0.6), ...P(-0.04, 0.82), 0.05 * S, 0.035 * S, fur),
        cap(...P(0.09, 0.6), ...P(0.04, 0.82), 0.05 * S, 0.035 * S, fur),
        ell(...P(0, 0.44), 0.17 * S, 0.24 * S, 0, fur),
        ell(...P(0, 0.22), 0.1 * S, 0.09 * S, tilt, fur),
        ell(...P(-0.02, -0.02 + reach), 0.025 * S, 0.02 * S, 0, claw),
        ell(...P(0.02, 0.02 - reach), 0.025 * S, 0.02 * S, 0, claw),
      ],
      this.lighting,
      0.6,
    )
    const ct = Math.cos(tilt)
    const st = Math.sin(tilt)
    const F = (u: number, w: number): [number, number] => P(u * ct - (w - 0.22) * st, 0.22 + u * st + (w - 0.22) * ct)
    this.shape([ell(...F(0, 0.225), 0.075 * S, 0.06 * S, tilt, this.paint([0.82, 0.74, 0.56]))], this.lighting, 0.4)
    const dark = this.paint(BLACK)
    this.shape([ell(...F(-0.035, 0.215), 0.028 * S, 0.012 * S, tilt - 0.35, dark), ell(...F(0.035, 0.215), 0.028 * S, 0.012 * S, tilt + 0.35, dark), ell(...F(0, 0.245), 0.014 * S, 0.008 * S, tilt, dark)], this.lighting, 0)
  }

  // A scarlet macaw perched upright on the high branch, bobbing its head now and then.
  private drawMacaw(at: number, face: number, phase: number) {
    const H = this.H
    const [x, y] = this.highBranch(at)
    const S = 0.11 * H
    const bob = this.look.night ? 0 : Math.sin(this.creatureTime * 2 + phase) * 0.012
    const P = (u: number, v: number): [number, number] => [x + u * face * S, y - 0.012 * H + v * S]
    const red = this.paint([0.85, 0.08, 0.06])
    this.shape(
      [
        cap(...P(-0.02, -0.12), ...P(-0.08, 0.55), 0.07 * S, 0.02 * S, red),
        cap(...P(-0.07, 0.4), ...P(-0.08, 0.55), 0.03 * S, 0.02 * S, this.paint([0.1, 0.3, 0.85])),
        ell(...P(0, -0.33), 0.17 * S, 0.3 * S, 0, red),
        ell(...P(0.04, -0.26), 0.11 * S, 0.2 * S, 0.15 * face, this.paint([0.1, 0.3, 0.85])),
        ell(...P(0.03, -0.42), 0.1 * S, 0.09 * S, 0, this.paint([0.95, 0.8, 0.15])),
        ell(...P(0.02, -0.68 + bob), 0.12 * S, 0.11 * S, 0, red),
        ell(...P(0.08, -0.68 + bob), 0.06 * S, 0.055 * S, 0, this.paint([0.9, 0.88, 0.85])),
        cap(...P(0.12, -0.7 + bob), ...P(0.2, -0.6 + bob), 0.06 * S, 0.015 * S, this.paint([0.85, 0.8, 0.7])),
      ],
      this.lighting,
      0.7,
    )
    this.add(...P(0.07, -0.7 + bob), 0.01, 0.01, 0.01)
  }

  // A jaguar draped along the low branch facing the trunk, legs dangling, breathing slowly as its tail sways.
  private drawJaguar() {
    const H = this.H
    // x runs along its back from the tail end, in screen heights.
    const top = (x: number): [number, number] => {
      const [px, py] = this.lowBranch(this.A - 0.46 + x)
      return [px, py - 0.035 * H]
    }
    const breathe = 1 + 0.03 * Math.sin(this.creatureTime * 1.5)
    const coat = this.paint([0.85, 0.58, 0.22])
    const [hx, hy] = top(0.235)
    const [rx, ry] = top(0)
    const [fx, fy] = top(0.19)
    const parts: Part[] = [
      cap(...top(0), ...top(0.18), 0.03 * H * breathe, 0.028 * H * breathe, coat),
      cap(fx, fy + 0.015 * H, fx + 0.004 * H, fy + 0.085 * H, 0.011 * H, 0.009 * H, coat),
      cap(fx - 0.02 * H, fy + 0.015 * H, fx - 0.018 * H, fy + 0.07 * H, 0.01 * H, 0.008 * H, coat),
      cap(rx + 0.01 * H, ry + 0.015 * H, rx + 0.012 * H, ry + 0.08 * H, 0.012 * H, 0.009 * H, coat),
      ell(hx, hy - 0.005 * H, 0.026 * H, 0.023 * H, 0, coat),
      ell(hx + 0.016 * H, hy + 0.004 * H, 0.012 * H, 0.009 * H, 0, this.paint([0.92, 0.82, 0.62])),
      cap(hx - 0.014 * H, hy - 0.02 * H, hx - 0.016 * H, hy - 0.034 * H, 0.007 * H, 0.004 * H, coat),
      cap(hx + 0.006 * H, hy - 0.024 * H, hx + 0.008 * H, hy - 0.038 * H, 0.007 * H, 0.004 * H, coat),
    ]
    // The tail hangs from the hips and sways, more at the tip.
    let [tx, ty] = [rx - 0.02 * H, ry]
    let angle = Math.PI / 2 + 0.25 * Math.sin(this.creatureTime * 0.8)
    for (let i = 0; i < 6; i++) {
      const nx = tx + Math.cos(angle) * 0.022 * H
      const ny = ty + Math.sin(angle) * 0.022 * H
      parts.push(cap(tx, ty, nx, ny, 0.007 * H, 0.006 * H, i === 5 ? this.paint(BLACK) : coat))
      angle += 0.12 * Math.sin(this.creatureTime * 0.8 + i * 0.5)
      ;[tx, ty] = [nx, ny]
    }
    this.shape(parts, this.lighting, 0.7)
    // Rosettes along the body.
    for (let i = 0; i < 14; i++) {
      const [sx, sy] = top(lerp(0.008, 0.174, hash(i * 3.3)))
      this.shape([ell(sx, sy + (hash(i * 7.1) - 0.5) * 0.035 * H, 0.0045 * H, 0.0035 * H, 0, this.paint([0.12, 0.07, 0.03]))], this.lighting, 0)
    }
    const glow = this.look.night ? 1.5 : 0
    this.add(hx + 0.012 * H, hy - 0.008 * H, 0.8 * glow + 0.01, 1 * glow + 0.01, 0.3 * glow + 0.01)
  }

  // A red-eyed tree frog on the high branch between the macaws and the monkey, blinking now and then.
  private drawFrog() {
    const H = this.H
    const [x, y] = this.highBranch(this.A - 0.3)
    const cy = y - 0.026 * H
    const green = this.paint([0.25, 0.7, 0.15])
    const blink = this.time % 7 < 0.15
    this.shape(
      [
        ell(x, cy, 0.016 * H, 0.01 * H, 0, green),
        ell(x + 0.012 * H, cy - 0.004 * H, 0.009 * H, 0.008 * H, 0, green),
        ell(x - 0.012 * H, cy + 0.008 * H, 0.006 * H, 0.003 * H, 0, this.paint([1, 0.5, 0.1])),
        ell(x + 0.01 * H, cy + 0.009 * H, 0.006 * H, 0.003 * H, 0, this.paint([1, 0.5, 0.1])),
      ],
      this.lighting,
      0.7,
    )
    if (!blink) for (const s of [-1, 1]) this.shape([ell(x + 0.012 * H + s * 0.005 * H, cy - 0.01 * H, 0.004 * H, 0.004 * H, 0, this.paint([0.95, 0.1, 0.05]))], this.lighting, 0.3)
  }

  // A blue morpho fluttering between random points, its wings flashing open and shut.
  private stepButterfly(b: Butterfly, dt: number) {
    const { A } = this
    b.wanderT -= dt
    if (b.wanderT <= 0 || Math.hypot(b.wx - b.x, b.wy - b.y) < 0.03) {
      b.wanderT = rand(4, 9)
      ;[b.wx, b.wy] = this.openSpot(0.1 * A, 0.9 * A, 0.3, 0.75)
    }
    const dx = b.wx - b.x
    const dy = b.wy - b.y
    const d = Math.hypot(dx, dy) || 1
    b.x += (dx / d) * 0.12 * Math.min(1, d / 0.05) * dt
    b.y += (dy / d) * 0.12 * Math.min(1, d / 0.05) * dt
  }

  private drawButterfly(b: Butterfly) {
    const H = this.H
    const S = 0.045 * H
    const x = b.x * H
    const y = (b.y + Math.sin(this.time * 5 + b.phase) * 0.01) * H
    const open = 0.25 + 0.75 * Math.abs(Math.sin(this.time * 7 + b.phase))
    const P = (u: number, v: number): [number, number] => [x + u * S, y + v * S]
    for (const [scale, color] of [[1.15, this.paint([0.03, 0.04, 0.08])], [1, this.paint([0.15, 0.45, 1.2])]] as const) {
      const parts: Part[] = []
      for (const side of [-1, 1]) {
        parts.push(ell(...P(side * 0.32 * open, -0.12), 0.32 * open * scale * S, 0.22 * scale * S, side * 0.3, color))
        parts.push(ell(...P(side * 0.24 * open, 0.14), 0.22 * open * scale * S, 0.18 * scale * S, -side * 0.3, color))
      }
      this.shape(parts, this.lighting, 0.4)
    }
    this.shape([cap(...P(0, -0.2), ...P(0, 0.25), 0.05 * S, 0.04 * S, this.paint(BLACK))], this.lighting, 0)
  }

  // Fireflies blinking at night; by day and at sunset, pollen drifting in the light.
  private drawMotes() {
    const H = this.H
    if (this.look.night) {
      const together = this.chorus > 0 ? Math.pow(Math.max(0, Math.sin((CHORUS - this.chorus) * TAU)), 3) : 0
      for (const f of this.glowers) {
        const k = Math.max(together, Math.pow(Math.max(0, Math.sin(this.time * 1.3 + f.phase * 7)), 6))
        if (k < 0.02) continue
        this.disc(f.x * H, f.y * H, 1.3, 0.9 * k * 2, 1.2 * k * 2, 0.3 * k * 2, 0.6)
        this.add(f.x * H, f.y * H, 0.9 * k, 1.2 * k, 0.3 * k)
      }
      return
    }
    const [lr, lg, lb] = this.look.light
    for (const p of this.pollen) {
      const k = (0.05 + p.s * 0.08) * (1 - p.y)
      this.add(p.x * H, p.y * H, lr * k, lg * k, lb * k * 0.8)
    }
  }

  // A big glossy leaf on a short stalk, swaying gently, with a pale midrib.
  private drawLeaf(l: Leaf) {
    const H = this.H
    const angle = l.angle + Math.sin(this.time * 0.5 + l.phase) * 0.035
    const dx = Math.cos(angle)
    const dy = Math.sin(angle)
    const x = l.x * H
    const y = l.y * H
    const len = l.length * H
    const leaf = this.paint(LEAF)
    this.shape([cap(x, y, x + dx * len * 0.2, y + dy * len * 0.2, 0.012 * H, 0.009 * H, leaf), ell(x + dx * len * 0.58, y + dy * len * 0.58, len * 0.42, len * 0.13, angle, leaf)], this.lighting)
    this.shape([cap(x + dx * len * 0.18, y + dy * len * 0.18, x + dx * len * 0.97, y + dy * len * 0.97, 0.004 * H, 0.0015 * H, this.paint([0.3, 0.55, 0.2]))], this.lighting, 0)
  }
}

function mixRGB(a: RGB, b: RGB, t: number): RGB {
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)]
}

// A wrapping strip of soft bands; two sliding past each other make the light shafts.
function buildRays(seed: number) {
  const tex = new Float32Array(RAY_N)
  for (let k = 0; k < 12; k++) {
    const c = hash(seed + k * 3.1) * RAY_N
    const w = 8 + hash(seed + k * 7.7) * 40
    const amp = 0.35 + hash(seed + k * 1.3) * 0.65
    for (let i = 0; i < RAY_N; i++) {
      let d = Math.abs(i - c)
      if (d > RAY_N / 2) d = RAY_N - d
      tex[i] += amp * Math.exp(-(d * d) / (w * w))
    }
  }
  const max = tex.reduce((m, v) => Math.max(m, v), 0)
  return tex.map((v) => Math.min(1, v / max))
}

export const jungle: Wallpaper = {
  id: "jungle",
  name: "Jungle",
  description: "A misty rainforest with a waterfall, light through the canopy, and a toucan flying by now and then",
  activity: {
    calm: "Trees, vines, a waterfall and swaying leaves",
    lively: "Adds a swinging spider monkey and blue morpho butterflies",
    teeming: "Adds a jaguar, scarlet macaws, a tree frog and more butterflies",
  },
  scrim: {
    day: [
      [18, 40, 30],
      [14, 32, 22],
      [8, 18, 10],
    ],
    sunset: [
      [40, 22, 22],
      [24, 14, 16],
      [8, 6, 6],
    ],
    night: [
      [4, 8, 10],
      [3, 6, 8],
      [2, 4, 4],
    ],
  },
  create: (settings) => new Jungle(settings),
}
