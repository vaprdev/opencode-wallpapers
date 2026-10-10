import { Canvas, cap, ell, type Lighting, type Part } from "../src/canvas"
import { eggWait } from "../src/egg"
import { haze, mottle } from "../src/grade"
import { bird, flyAway, startle, type Flier } from "../src/flock"
import { fireflyLight, lightPool } from "../src/light"
import { TAU, clamp, fbm1, hash, hash2, lerp, rand, smoothstep, type RGB } from "../src/math"
import { driftClouds, makeClouds, makeStars, makeStorm, paintClouds, paintSky, paintStars, paintStorm, type Cloud, type Orb, type Star } from "../src/sky"
import type { Activity, Season, Settings, Time, Wallpaper } from "../src/wallpaper"
import { WeatherLayer } from "../src/weather"

// The scene runs slower than real time, which keeps it calm behind text.
const TIME_SCALE = 0.35
// Animals move at a quarter of scene speed.
const CREATURE_SPEED = 0.25
// The hills meet the garden here, and the pond mirrors the sky about this line.
const HORIZON = 0.52
const GROUND = 0.565
// The tanuki's visit, in scene seconds: it walks in, sits a while by the pond, then wanders off.
const TANUKI = { arrive: 15, leave: 38, gone: 62 }

// What changes with the time of day. Stone, wood, plants and animals have one daytime color each, darkened by tint;
// the sky, hills, gravel, moss, water and petals get their own values.
interface Look {
  style: "rim" | "front"
  light: RGB
  sky: [number, RGB][]
  orb: Orb
  stars: number
  clouds: { puffy: boolean; top: RGB; bottom: RGB; alpha: number }
  hills: [far: RGB, near: RGB]
  snow: RGB
  mist: RGB
  moss: RGB
  gravel: RGB
  water: RGB
  mirror: number
  glitter: number
  ripple: RGB
  petal: RGB
  lamps: number
  tint: RGB
  night: boolean
}

const LOOKS: Record<Time, Look> = {
  day: {
    style: "front",
    light: [1, 0.95, 0.85],
    sky: [
      [0, [0.12, 0.32, 0.7]],
      [0.3, [0.28, 0.52, 0.84]],
      [HORIZON, [0.66, 0.8, 0.9]],
    ],
    orb: { x: 0.4, y: 0.12, r: 0.035, core: [5, 4.6, 3.8], glow: [1, 0.95, 0.8], near: 0.45, wide: 0.12 },
    stars: 0,
    clouds: { puffy: true, top: [1.1, 1.1, 1.1], bottom: [0.6, 0.66, 0.78], alpha: 0.85 },
    hills: [
      [0.42, 0.55, 0.72],
      [0.18, 0.36, 0.22],
    ],
    snow: [1, 1.02, 1.08],
    mist: [0.72, 0.82, 0.9],
    moss: [0.2, 0.4, 0.12],
    gravel: [0.72, 0.66, 0.55],
    water: [0.03, 0.14, 0.13],
    mirror: 0.55,
    glitter: 0.15,
    ripple: [0.45, 0.6, 0.6],
    petal: [1.05, 0.68, 0.8],
    lamps: 0,
    tint: [1, 1, 1],
    night: false,
  },
  sunset: {
    style: "rim",
    // Soft peach low down fading into lavender, with a mild sun and little contrast.
    light: [1, 0.68, 0.5],
    sky: [
      [0, [0.05, 0.055, 0.15]],
      [0.16, [0.2, 0.18, 0.36]],
      [0.3, [0.85, 0.48, 0.36]],
      [HORIZON, [1, 0.62, 0.36]],
    ],
    orb: { x: 0.52, y: 0.39, r: 0.045, core: [2.2, 1.35, 0.75], glow: [1, 0.58, 0.36], near: 0.38, wide: 0.22 },
    stars: 10,
    clouds: { puffy: false, top: [0.26, 0.18, 0.32], bottom: [1, 0.6, 0.45], alpha: 0.5 },
    hills: [
      [0.56, 0.33, 0.36],
      [0.17, 0.11, 0.16],
    ],
    snow: [1, 0.7, 0.55],
    mist: [1, 0.58, 0.4],
    moss: [0.1, 0.08, 0.1],
    gravel: [0.32, 0.22, 0.22],
    water: [0.06, 0.045, 0.08],
    mirror: 0.7,
    glitter: 0.6,
    ripple: [1, 0.66, 0.5],
    petal: [0.95, 0.52, 0.6],
    lamps: 0.45,
    tint: [0.26, 0.17, 0.2],
    night: false,
  },
  night: {
    style: "rim",
    light: [0.3, 0.62, 1.5],
    sky: [
      [0, [0.004, 0.008, 0.03]],
      [0.3, [0.014, 0.024, 0.07]],
      [0.42, [0.035, 0.055, 0.14]],
      [HORIZON, [0.07, 0.1, 0.24]],
    ],
    orb: { x: 0.6, y: 0.16, r: 0.032, core: [1, 0.72, 0.3], glow: [0.45, 0.3, 0.12], near: 0.2, wide: 0.08, moon: true },
    stars: 130,
    clouds: { puffy: false, top: [0.015, 0.02, 0.05], bottom: [0.06, 0.1, 0.3], alpha: 0.4 },
    hills: [
      [0.025, 0.04, 0.1],
      [0.008, 0.016, 0.035],
    ],
    snow: [0.07, 0.12, 0.3],
    mist: [0.05, 0.09, 0.22],
    moss: [0.01, 0.024, 0.035],
    gravel: [0.045, 0.07, 0.15],
    water: [0.014, 0.045, 0.12],
    mirror: 0.5,
    glitter: 0.6,
    ripple: [0.06, 0.25, 0.55],
    petal: [0.45, 0.12, 0.35],
    lamps: 1,
    tint: [0.02, 0.032, 0.075],
    night: true,
  },
}

// Daylight comes from the upper left, where the sun is.
const DAYLIGHT = (() => {
  const l = Math.hypot(0.4, 0.6, 0.6)
  return [-0.4 / l, -0.6 / l, 0.6 / l] as const
})()

// Daytime colors.
const STONE: RGB = [0.62, 0.6, 0.55]
const ROCK: RGB = [0.46, 0.44, 0.4]
const VERMILION: RGB = [0.85, 0.2, 0.07]
const BAMBOO: RGB = [0.55, 0.6, 0.22]
const PAD: RGB = [0.18, 0.45, 0.14]
const AMBER: RGB = [1.6, 0.8, 0.25]
const KOI: [body: RGB, spots: RGB | null][] = [
  [[0.95, 0.92, 0.86], [0.9, 0.18, 0.06]],
  [[1, 0.45, 0.1], null],
  [[1, 0.72, 0.2], null],
  [[0.12, 0.1, 0.1], [0.95, 0.38, 0.08]],
  [[0.95, 0.92, 0.86], [0.12, 0.1, 0.1]],
  [[1, 0.55, 0.15], [0.95, 0.92, 0.86]],
]

interface Koi {
  a: number
  r: number
  dir: number
  phase: number
  size: number
  colors: [RGB, RGB | null]
}

interface Ring {
  x: number
  y: number
  age: number
  life: number
  strength: number
}

interface Petal {
  x: number
  y: number
  vx: number
  vy: number
  spin: number
  land: number
  // 0 falling, 1 floating on the pond, 2 lying on the ground.
  state: number
  age: number
}

interface Dragonfly {
  x: number
  y: number
  tx: number
  ty: number
  face: number
  rest: number
  phase: number
  color: RGB
}

class Zen extends Canvas {
  private time = 0
  private creatureTime = 0
  private readonly activity: Activity
  private readonly look: Look
  private lighting: Lighting = { style: "front", dir: DAYLIGHT }
  private background = new Float32Array(0)
  private stars: Star[]
  private clouds: Cloud[]
  private pond = { x: 1, y: 0.8, rx: 0.45, ry: 0.14 }
  private cherry = { x: 1.6, y: 0.27 }
  // Water pixels: their hdr index, how much of each is water, the bank under its edge, and the garden in front of it
  // (bridge, lanterns, stones, lily pads) as a premultiplied color plus how much water shows through.
  private pool = new Int32Array(0)
  private wet = new Float32Array(0)
  private under = new Float32Array(0)
  private front = new Float32Array(0)
  private keep = new Float32Array(0)
  // The still water's color, reflections included, which the ripples shift sideways.
  private mirror = new Float32Array(0)
  private wave = new Float32Array(0)
  private pads: { x: number; y: number; r: number }[] = []
  private koi: Koi[] = []
  private rings: Ring[] = []
  private petals: Petal[] = []
  private fountain = { fill: 0.55, tip: -1 }
  private heron = { phase: "away" as "away" | "in" | "stand" | "out", t: 0, next: 6, stay: 0 }
  private frog = { croak: -1, next: 5 }
  private dragonflies: Dragonfly[] = []
  private fireflies: { x: number; y: number; vx: number; vy: number; phase: number }[] = []
  private drip = 2
  // Cherry blossom in spring (and without a season), green leaves in summer, red and gold in autumn, bare branches
  // under a light snowfall in winter.
  private readonly season: Season
  private readonly weather: WeatherLayer
  private storm = makeStorm()
  private sparrows: Flier[] = []
  // The easter egg: a tanuki with a leaf on its head. t counts scene seconds since it appeared.
  private tanuki = { wait: eggWait() * TIME_SCALE, t: -1 }

  constructor(settings: Settings) {
    super()
    this.activity = settings.activity
    this.look = LOOKS[settings.time]
    if (settings.time === "day") this.frame = 0.4
    this.season = settings.season ?? "spring"
    this.weather = new WeatherLayer(settings.weather ?? (this.season === "winter" ? "snow" : "clear"), settings.time, HORIZON, !settings.weather)
    this.stars = makeStars(this.look.stars, 0.45)
    this.clouds = makeClouds(this.look.clouds.puffy ? 3 : 5, this.look.clouds.puffy, 0.06, 0.26)
    const count = { calm: 0, lively: 3, teeming: 6 }[settings.activity]
    this.koi = Array.from({ length: count }, (_, i) => ({ a: rand(0, TAU), r: 0.32 + (i % 3) * 0.16, dir: i === 4 ? -1 : 1, phase: rand(0, TAU), size: rand(0.85, 1.1), colors: KOI[i] }))
    const falling = this.season === "spring" || this.season === "autumn"
    this.petals = Array.from({ length: falling ? { calm: 16, lively: 22, teeming: 30 }[settings.activity] : 0 }, () => this.newPetal(true))
    if (settings.activity === "teeming" && !this.look.night)
      this.dragonflies = [[0.85, 0.18, 0.08], [0.15, 0.4, 0.9]].map((color) => ({ x: rand(0.8, 1.4), y: rand(0.6, 0.75), tx: 1, ty: 0.7, face: 1, rest: rand(0, 2), phase: rand(0, TAU), color: color as RGB }))
    const flies = this.look.night ? { calm: 10, lively: 16, teeming: 26 }[settings.activity] : 0
    this.fireflies = Array.from({ length: flies }, () => ({ x: Math.random() * 2, y: 0.58 + Math.random() * 0.36, vx: 0, vy: 0, phase: Math.random() * TAU }))
  }

  step(dt: number) {
    dt = clamp(dt, 0, 0.1) * TIME_SCALE
    this.time += dt
    const cdt = dt * CREATURE_SPEED
    this.creatureTime += cdt
    driftClouds(this.clouds, this.A, dt)
    driftClouds(this.storm, this.A, dt)
    this.stepGloom(dt)
    this.weather.step(dt)
    this.sparrows = flyAway(this.sparrows, dt, this.A)
    this.stepTanuki(dt)
    for (const r of this.rings) r.age += dt
    this.rings = this.rings.filter((r) => r.age < r.life)
    // Now and then a drop or a water strider rings the surface somewhere.
    this.drip -= dt
    if (this.drip <= 0) {
      this.drip = rand(3, 7)
      const a = rand(0, TAU)
      const r = Math.sqrt(Math.random()) * 0.8
      this.rings.push({ x: this.pond.x + Math.cos(a) * r * this.pond.rx, y: this.pond.y + Math.sin(a) * r * this.pond.ry, age: 0, life: 4, strength: 0.5 })
    }
    for (const p of this.petals) this.stepPetal(p, dt)
    this.stepFountain(dt)
    this.stepHeron(dt)
    for (const k of this.koi) {
      k.phase += cdt
      k.a += (k.dir * 0.3 * cdt) / k.r
      // Now and then a koi comes up to the surface.
      if (Math.random() < cdt * 0.15) {
        const [u, v] = this.koiAt(k, 0)
        this.rings.push({ x: this.pond.x + u * this.pond.rx, y: this.pond.y + v * this.pond.ry, age: 0, life: 4, strength: 0.8 })
      }
    }
    if (this.activity === "teeming") this.stepFrog(dt)
    for (const d of this.dragonflies) this.stepDragonfly(d, dt)
    for (const f of this.fireflies) {
      f.vx += (Math.random() - 0.5) * 0.02 * dt
      f.vy += (Math.random() - 0.5) * 0.02 * dt
      f.vx *= Math.exp(-dt * 0.5)
      f.vy *= Math.exp(-dt * 0.5)
      f.x = (f.x + f.vx * dt + this.A) % this.A
      f.y = clamp(f.y + f.vy * dt, 0.56, 0.96)
    }
  }

  render() {
    this.hdr.set(this.background)
    if (!this.weather.covered) paintStars(this.hdr, this.W, this.H, this.stars, this.time, 0.45, this.look.stars > 50 ? 0.5 : 0.3)
    const [top, bottom] = this.weather.scud ?? [this.look.clouds.top, this.look.clouds.bottom]
    paintClouds(this.hdr, this.W, this.H, this.clouds, top, bottom, this.look.clouds.alpha, this.look.clouds.puffy)
    paintStorm(this.hdr, this.W, this.H, this.storm, this.look.clouds.top, this.look.clouds.bottom, this.gloom)
    this.drawWater()
    for (const r of this.rings) this.drawRing(r)
    for (const p of this.petals) if (p.state === 1) this.drawPetal(p)
    for (const k of this.koi) this.drawKoi(k)
    // The bridge, lanterns, stones and lily pads in front of the water.
    const { hdr, pool, front, keep } = this
    for (let k = 0; k < pool.length; k++) {
      const o = pool[k] * 3
      hdr[o] = front[k * 3] + keep[k] * hdr[o]
      hdr[o + 1] = front[k * 3 + 1] + keep[k] * hdr[o + 1]
      hdr[o + 2] = front[k * 3 + 2] + keep[k] * hdr[o + 2]
    }
    this.drawRocker()
    if (this.activity === "teeming") this.drawFrog()
    this.drawHeron()
    for (const d of this.dragonflies) this.drawDragonfly(d)
    if (this.tanuki.t >= 0) this.drawTanuki()
    for (const p of this.petals) if (p.state !== 1) this.drawPetal(p)
    for (const b of this.sparrows) this.shape(bird(b, this.H, 0.02 * this.H, this.paint([0.45, 0.33, 0.22])), this.lighting, 0.4)
    // At night the lanterns light the gravel, the bank and whatever stands near them.
    if (this.look.night) for (const l of this.lanterns()) lightPool(this.hdr, this.W, this.H, l.x * this.H, l.base * this.H, l.scale * 1.6 * this.H, l.scale * 0.6 * this.H, [1, 0.5, 0.15], 2, 0.01)
    this.drawFireflies()
    this.weather.draw(this.hdr, this.W, this.H)
    this.finish()
  }

  protected override visit() {
    if (this.heron.phase === "away") this.heron.next = 0
  }

  // A click on the pond rings the water; anywhere else, sparrows flit up out of the garden.
  poke(x: number, y: number) {
    if (this.wetAt(x, y) > 0.5) return void this.rings.push({ x, y, age: 0, life: 4, strength: 1.2 })
    startle(this.sparrows, x, Math.max(y, GROUND + 0.03), 4)
  }

  // Everything that never moves is painted once per size into `background`, then copied in each frame. The water
  // is redrawn each frame, then the garden in front of it is laid back over it from `front` and `keep`.
  protected override layout() {
    const { W, H, A, look } = this
    this.lighting = look.style === "front" ? { style: "front", dir: DAYLIGHT } : { style: "rim", color: look.light, x: look.orb.x * W, y: look.orb.y * H }
    const rx = Math.min(0.25 * A, 0.56)
    this.pond = { x: Math.max(0.64 * A, 0.36 * A + rx + 0.06), y: 0.8, rx, ry: 0.14 }
    this.cherry = { x: A - 0.2, y: 0.27 }
    paintSky(this.hdr, W, H, look.sky, look.orb)
    this.weather.cover(this.hdr, W, H)
    const clear = this.hdr.slice()
    this.drawHills()
    if (look === LOOKS.day) haze(this.hdr, clear, W, H, HORIZON, GROUND, 0.15)
    const sky = this.hdr.slice()
    this.drawGround()
    // By day, broad warm and cool patches of sun and shade lie over the raked gravel.
    if (look === LOOKS.day) mottle(this.hdr, W, H, GROUND, 1, 0.5, [1.08, 1, 0.84], [0.76, 0.84, 0.96])
    this.drawBackGarden()
    // Find the water, note what lies under its edges, and work out its still color with the sky mirrored in it.
    const p = this.pond
    const pool: number[] = []
    this.wet = new Float32Array(W * H)
    for (let y = Math.floor(0.56 * H); y < H; y++)
      for (let x = 0; x < W; x++) {
        const c = this.wetness(x, y)
        if (c <= 0) continue
        this.wet[y * W + x] = c
        pool.push(y * W + x)
      }
    this.pool = Int32Array.from(pool)
    this.under = new Float32Array(pool.length * 3)
    for (let k = 0; k < pool.length; k++) for (let c = 0; c < 3; c++) this.under[k * 3 + c] = this.hdr[pool[k] * 3 + c]
    this.mirror = new Float32Array(W * H * 3)
    this.wave = new Float32Array(W)
    const lamps = this.lanterns()
    const y0 = pool.length ? Math.floor(pool[0] / W) : H
    for (let y = y0; y < H; y++) {
      const sy = clamp(Math.round(2 * HORIZON * H - y), 0, H - 1)
      const m = look.mirror * (1 - 0.4 * clamp((y / H - 0.62) / 0.32, 0, 1))
      for (let x = 0; x < W; x++) {
        const o = (y * W + x) * 3
        const s = (sy * W + x) * 3
        let r = look.water[0] * (1 - m) + sky[s] * m
        let g = look.water[1] * (1 - m) + sky[s + 1] * m
        let b = look.water[2] * (1 - m) + sky[s + 2] * m
        // Lantern light streaks down the water below each lantern.
        for (const l of lamps) {
          const k = Math.exp(-(((x - l.x * H) / (0.012 * H)) ** 2) - ((y - (2 * l.base - l.light) * H) / (0.035 * H)) ** 2) * look.lamps * 0.7
          r += AMBER[0] * k
          g += AMBER[1] * k
          b += AMBER[2] * k
        }
        this.mirror[o] = r
        this.mirror[o + 1] = g
        this.mirror[o + 2] = b
      }
    }
    // Lily pads, placed in pond coordinates (-1..1 across and down).
    this.pads = [
      [-0.15, -0.5, 0.045],
      [0.3, -0.6, 0.035],
      [0.55, 0.35, 0.05],
      [0.08, 0.5, 0.05],
      [-0.62, -0.15, 0.04],
      [0.35, 0.02, 0.03],
      [-0.3, 0.2, 0.028],
    ].map(([u, v, r]) => ({ x: p.x + u * p.rx, y: p.y + v * p.ry, r }))
    // Paint the garden in front of the water on black and on white to find its color and coverage, then for real.
    const real = this.hdr
    this.hdr = new Float32Array(real.length)
    this.drawFrontGarden()
    const black = this.hdr
    this.hdr = new Float32Array(real.length).fill(1)
    this.drawFrontGarden()
    const white = this.hdr
    this.hdr = real
    this.drawFrontGarden()
    this.front = new Float32Array(pool.length * 3)
    this.keep = new Float32Array(pool.length)
    for (let k = 0; k < pool.length; k++) {
      const i = pool[k] * 3
      this.front.set([black[i], black[i + 1], black[i + 2]], k * 3)
      this.keep[k] = white[i] - black[i]
    }
    this.background = this.hdr.slice()
  }

  private paint(c: RGB): RGB {
    const t = this.look.tint
    return [c[0] * t[0], c[1] * t[1], c[2] * t[2]]
  }

  // How much of pixel (x, y) is water: the pond, or the stream that runs into it from under the bridge.
  private wetness(x: number, y: number) {
    const p = this.pond
    const H = this.H
    const u = ((x + 0.5) / H - p.x) / p.rx
    const v = ((y + 0.5) / H - p.y) / p.ry
    const n = Math.hypot(u, v)
    const a = Math.atan2(v, u)
    const edge = 1 + 0.05 * Math.sin(3 * a + 1) + 0.03 * Math.sin(5 * a + 2)
    const d = n / edge
    // Distance to the edge in pixels, from how fast d grows here.
    const pond = d < 0.8 ? 1 : clamp(((1 - d) * H * n * edge) / Math.hypot(u / p.rx, v / p.ry) + 0.5, 0, 1)
    const t = ((y + 0.5) / H - 0.57) / (p.y - 0.57)
    if (t < 0 || t > 1) return pond
    const w = lerp(0.022, 0.06, t)
    const stream = clamp((w - Math.abs((x + 0.5) / H - this.streamX(t))) * H + 0.5, 0, 1) * smoothstep(0.575, 0.61, (y + 0.5) / H)
    return Math.max(pond, stream)
  }

  private streamX(t: number) {
    return this.pond.x - 0.12 + 0.08 * t
  }

  // Lantern positions: x, the base, and the height of the light, in screen heights.
  private lanterns() {
    const p = this.pond
    return [
      { x: p.x + 0.16, base: p.y - p.ry - 0.012, light: p.y - p.ry - 0.012 - 0.098, scale: 0.15 },
      { x: p.x - p.rx * 0.97, base: p.y + 0.06, light: p.y + 0.06 - 0.043, scale: 0.1 },
    ]
  }

  // Distant hills with a snow-capped peak, a nearer wooded ridge with a pagoda, and mist where they meet the garden.
  private drawHills() {
    const { W, H, A, look } = this
    const [far, near] = look.hills
    const peak = 0.42 * A
    const fuji = (u: number) => 0.255 + 0.24 * (1 - Math.exp(-Math.max(0, Math.abs(u - peak) - 0.012) / 0.17))
    for (let x = 0; x < W; x++) {
      const u = x / H
      const range = 0.41 - 0.035 * fbm1(u * 1.3, 3) - 0.015 * Math.sin(u * 2.5 + 1)
      const top = Math.min(range, fuji(u)) * H
      const snowline = (0.3 + 0.012 * Math.sin(u * 140) * Math.sin(u * 37) - 0.01 * Math.abs(Math.sin(u * 61))) * H
      for (let y = Math.max(0, Math.floor(top)); y < H; y++) {
        const c = this.rim(fuji(u) <= range && y < snowline ? look.snow : far, x, y + 0.5 - top, 1.5)
        this.blend((y * W + x) * 3, c[0], c[1], c[2], clamp(y + 1 - top, 0, 1))
      }
    }
    for (let y = Math.floor(0.36 * H); y < Math.min(H, GROUND * H); y++) {
      const k = smoothstep(0.36, HORIZON, y / H) * 0.55
      for (let x = 0; x < W; x++) this.blend((y * W + x) * 3, look.mist[0], look.mist[1], look.mist[2], k * (0.8 + 0.2 * Math.sin((x / H) * 6 + y * 0.1)))
    }
    for (let x = 0; x < W; x++) {
      const u = x / H
      const top = (0.485 - 0.012 * fbm1(u * 7, 5) - 0.01 * Math.sin(u * 2 + 2)) * H
      for (let y = Math.max(0, Math.floor(top)); y < H; y++) {
        const c = this.rim(near, x, y + 0.5 - top, 2)
        this.blend((y * W + x) * 3, c[0], c[1], c[2], clamp(y + 1 - top, 0, 1))
      }
    }
    this.drawPagoda(0.71 * A, 0.482)
  }

  // A three-tiered pagoda on the far ridge, hazed by distance.
  private drawPagoda(x: number, base: number) {
    const H = this.H
    const near = this.look.hills[1]
    const c = this.paint([0.42, 0.2, 0.14])
    const wall: RGB = [lerp(c[0], near[0], 0.4), lerp(c[1], near[1], 0.4), lerp(c[2], near[2], 0.4)]
    const roof: RGB = [wall[0] * 0.6, wall[1] * 0.6, wall[2] * 0.6]
    const P = (u: number, v: number) => [(x + u) * H, (base + v) * H] as const
    for (let i = 0; i < 3; i++) {
      const y = -i * 0.03
      const w = 0.018 - i * 0.003
      this.polygon([P(-w * 0.6, y), P(w * 0.6, y), P(w * 0.6, y - 0.02), P(-w * 0.6, y - 0.02)], wall)
      this.polygon([P(-w * 1.5, y - 0.016), P(-w * 1.2, y - 0.022), P(0, y - 0.03), P(w * 1.2, y - 0.022), P(w * 1.5, y - 0.016), P(0, y - 0.022)], roof)
    }
    this.polygon([P(-0.001, -0.09), P(0.001, -0.09), P(0.001, -0.115), P(-0.001, -0.115)], roof)
  }

  // At sunset and night, the top edge of a hill catches the light.
  private rim(base: RGB, x: number, depth: number, width: number): RGB {
    if (this.look.style === "front") return base
    const glow = 0.35 + 0.65 * Math.exp(-Math.abs(x - this.look.orb.x * this.W) / (0.45 * this.H))
    const k = Math.exp(-depth / width) * glow * 0.35
    return [base[0] + this.look.light[0] * k, base[1] + this.look.light[1] * k, base[2] + this.look.light[2] * k]
  }

  // Moss along the back, around the pond and under the rocks; raked gravel everywhere else, in straight lines that
  // widen toward the viewer and in rings around each rock.
  private drawGround() {
    const { W, H, look, pond: p } = this
    const rocks = this.rocks()
    const s0 = 0.011
    const k = (0.03 - s0) / (1 - GROUND)
    for (let y = Math.floor(GROUND * H); y < H; y++) {
      const v = (y + 0.5) / H
      const spacing = s0 + k * (v - GROUND)
      const lines = Math.log(spacing / s0) / k / s0
      for (let x = 0; x < W; x++) {
        const u = (x + 0.5) / H
        const top = GROUND + 0.004 * Math.sin(u * 9)
        if (v < top) continue
        const pd = Math.hypot((u - p.x) / p.rx, (v - p.y) / p.ry)
        const t = (v - 0.57) / (p.y - 0.57)
        const sd = t >= 0 && t <= 1 ? Math.abs(u - this.streamX(t)) - lerp(0.022, 0.06, t) : 1
        let groove = Math.sin(lines * TAU)
        let moss = smoothstep(0.62, 0.6, v + 0.008 * Math.sin(u * 13)) + smoothstep(1.22, 1.15, pd + 0.04 * Math.sin(u * 23)) + smoothstep(0.04, 0.03, sd)
        for (const r of rocks) {
          const d = Math.hypot(u - r.x, (v - r.y) / 0.42)
          if (d < r.r + 4.4 * spacing) groove = Math.sin(((d - r.r) / spacing) * TAU)
          moss += smoothstep(r.r * 1.12, r.r * 0.95, d)
        }
        const grain = (hash2(x, y) - 0.5) * 0.08
        const g = 0.93 + 0.1 * groove + grain
        const m = clamp(moss, 0, 1)
        const mt = 0.85 + 0.25 * hash2(x >> 1, y >> 1) + 0.1 * Math.sin(u * 40 + v * 30)
        const o = (y * W + x) * 3
        const cov = clamp((v - top) * H + 0.5, 0, 1)
        this.blend(o, lerp(look.gravel[0] * g, look.moss[0] * mt, m), lerp(look.gravel[1] * g, look.moss[1] * mt, m), lerp(look.gravel[2] * g, look.moss[2] * mt, m), cov)
      }
    }
  }

  // Rocks set in the gravel, in screen heights.
  private rocks() {
    const A = this.A
    return [
      { x: 0.15 * A, y: 0.84, r: 0.05 },
      { x: 0.28 * A, y: 0.68, r: 0.032 },
    ]
  }

  // Clipped shrubs along the back, the rocks, a red maple on the left and a cherry in blossom on the right.
  private drawBackGarden() {
    const { A, H } = this
    for (let i = 0, x = -0.03; x < A + 0.06; i++, x += 0.07) {
      const g = this.paint([0.1 + hash(i) * 0.06, 0.26 + hash(i + 9) * 0.08, 0.1])
      this.shape([ell(x * H, (0.57 + hash(i + 3) * 0.008) * H, (0.045 + hash(i + 5) * 0.015) * H, (0.022 + hash(i + 7) * 0.008) * H, 0, g)], this.lighting, 0.8)
    }
    for (const [x, y, r] of [[0.33 * A, 0.6, 0.045], [this.pond.x + this.pond.rx * 0.62, 0.635, 0.05]]) {
      this.shape([ell(x * H, y * H, r * H, r * 0.6 * H, 0, this.paint([0.16, 0.36, 0.12]))], this.lighting, 0.9)
      for (let k = 0; k < (this.season === "spring" || this.season === "summer" ? 40 : 0); k++) {
        const a = hash(k * 3.7 + x) * TAU
        const d = Math.sqrt(hash(k * 5.1 + y))
        const c = this.paint([0.95, 0.3, 0.5])
        this.disc((x + Math.cos(a) * d * r * 0.9) * H, (y + Math.sin(a) * d * r * 0.5 - 0.004) * H, 0.004 * H, c[0], c[1], c[2], 0.8)
      }
    }
    for (const r of this.rocks()) {
      const c = this.paint(ROCK)
      this.shape([ell(r.x * H, (r.y - r.r * 0.55) * H, r.r * H, r.r * 0.75 * H, -0.15, c), ell((r.x + r.r * 0.75) * H, (r.y - r.r * 0.25) * H, r.r * 0.55 * H, r.r * 0.45 * H, 0.2, this.paint([0.4, 0.38, 0.35]))], this.lighting, 0.8)
    }
    this.drawMaple()
    this.drawCherry()
  }

  // A Japanese maple with red leaves in layered tiers, leaning in from the left.
  private drawMaple() {
    const { A, H } = this
    const x = 0.07 * A
    const bark = this.paint([0.28, 0.18, 0.13])
    this.shape(
      [
        cap(x * H, 0.66 * H, (x + 0.02) * H, 0.5 * H, 0.016 * H, 0.012 * H, bark),
        cap((x + 0.02) * H, 0.5 * H, (x + 0.06) * H, 0.38 * H, 0.012 * H, 0.008 * H, bark),
        cap((x + 0.02) * H, 0.5 * H, (x - 0.04) * H, 0.36 * H, 0.01 * H, 0.006 * H, bark),
        cap((x + 0.06) * H, 0.38 * H, (x + 0.16) * H, 0.3 * H, 0.008 * H, 0.004 * H, bark),
        cap((x + 0.04) * H, 0.42 * H, (x + 0.08) * H, 0.24 * H, 0.007 * H, 0.004 * H, bark),
      ],
      this.lighting,
      0.6,
    )
    if (this.season === "winter") return
    const reds: RGB[] = [[0.62, 0.09, 0.05], [0.82, 0.16, 0.07], [0.95, 0.3, 0.1]]
    // Each tier is a flat spray of leaf clusters, darker underneath and brighter on top.
    for (const [cx, cy, w] of [[x + 0.05, 0.2, 0.09], [x + 0.13, 0.28, 0.08], [x - 0.03, 0.3, 0.08], [x + 0.07, 0.36, 0.1], [x - 0.02, 0.41, 0.06]])
      for (let shade = 0; shade < 3; shade++) {
        const parts: Part[] = []
        for (let i = 0; i < 12; i++) {
          const h = hash(cx * 31 + cy * 17 + i * 3.3 + shade * 7)
          const across = (h - 0.5) * 2
          parts.push(ell((cx + across * w) * H, (cy + (hash(h * 13) - 0.5) * 0.022 + across * across * 0.012 - shade * 0.007) * H, (0.02 - shade * 0.003) * H, (0.011 - shade * 0.002) * H, (hash(h * 7) - 0.5) * 0.6, this.paint(reds[shade])))
        }
        this.shape(parts, this.lighting, 0.7)
      }
  }

  // A cherry tree in full blossom: a dark trunk and puffs of pink, with lighter flowers dotted over them.
  private drawCherry() {
    const H = this.H
    const c = this.cherry
    const bark = this.paint([0.25, 0.16, 0.14])
    this.shape(
      [
        cap((c.x + 0.08) * H, 0.66 * H, (c.x + 0.05) * H, 0.48 * H, 0.016 * H, 0.012 * H, bark),
        cap((c.x + 0.05) * H, 0.48 * H, c.x * H, (c.y + 0.06) * H, 0.012 * H, 0.008 * H, bark),
        cap((c.x + 0.05) * H, 0.48 * H, (c.x + 0.14) * H, (c.y + 0.04) * H, 0.01 * H, 0.006 * H, bark),
        cap(c.x * H, (c.y + 0.06) * H, (c.x - 0.14) * H, (c.y + 0.08) * H, 0.007 * H, 0.004 * H, bark),
      ],
      this.lighting,
      0.6,
    )
    if (this.season === "winter") return
    const foliage: Record<Season, RGB[]> = {
      spring: [[0.8, 0.42, 0.55], [0.95, 0.6, 0.72], [1.05, 0.76, 0.84]],
      summer: [[0.14, 0.32, 0.1], [0.2, 0.42, 0.13], [0.28, 0.52, 0.17]],
      autumn: [[0.66, 0.16, 0.06], [0.88, 0.36, 0.08], [0.98, 0.58, 0.14]],
      winter: [],
    }
    const pinks = foliage[this.season]
    for (let shade = 0; shade < 3; shade++) {
      const parts: Part[] = []
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * TAU + shade
        const d = 0.5 + 0.5 * hash(i * 7.7 + shade)
        parts.push(ell((c.x + Math.cos(a) * d * 0.15) * H, (c.y + Math.sin(a) * d * 0.08 - shade * 0.012) * H, (0.06 - shade * 0.01) * H, (0.04 - shade * 0.007) * H, 0, this.paint(pinks[shade])))
      }
      this.shape(parts, this.lighting, 0.7)
    }
    if (this.season !== "spring") return
    const bloom = this.paint([1.15, 0.85, 0.92])
    for (let k = 0; k < 90; k++) {
      const a = hash(k * 1.9) * TAU
      const d = Math.sqrt(hash(k * 4.3))
      this.disc((c.x + Math.cos(a) * d * 0.19) * H, (c.y + Math.sin(a) * d * 0.11) * H, 0.0035 * H, bloom[0], bloom[1], bloom[2], 0.7)
    }
  }

  // The red arched bridge, the lanterns, stones along the bank, lily pads, irises and the bamboo fountain's frame.
  private drawFrontGarden() {
    const { H, pond: p } = this
    this.drawBridge()
    for (const [i, l] of this.lanterns().entries()) i === 0 ? this.drawKasuga(l.x, l.base, l.scale) : this.drawYukimi(l.x, l.base, l.scale)
    // Stones along the near bank, leaving gaps.
    const stones: Part[] = []
    for (let i = 0; i < 14; i++) {
      const a = 0.12 * Math.PI + (i / 13) * 0.82 * Math.PI
      if (hash(i * 2.3) < 0.2) continue
      const edge = 1 + 0.05 * Math.sin(3 * a + 1) + 0.03 * Math.sin(5 * a + 2)
      const r = (0.016 + hash(i * 5.3) * 0.014) * H
      stones.push(ell((p.x + Math.cos(a) * edge * p.rx * 1.01) * H, (p.y + Math.sin(a) * edge * p.ry * 1.03) * H, r * 1.4, r * 0.75, (hash(i) - 0.5) * 0.4, this.paint(i % 3 ? ROCK : STONE)))
    }
    this.shape(stones, this.lighting, 0.8)
    for (const [i, pad] of this.pads.entries()) {
      const notch = hash(i * 3.1) * TAU
      const points = Array.from({ length: 20 }, (_, k) => {
        const a = notch + 0.35 + (k / 19) * (TAU - 0.7)
        return [(pad.x + Math.cos(a) * pad.r) * H, (pad.y + Math.sin(a) * pad.r * 0.38) * H] as const
      })
      this.polygon([...points, [pad.x * H, pad.y * H]], this.paint(i % 2 ? PAD : [0.24, 0.52, 0.18]))
      if (i !== 0 && i !== 5) continue
      const flower = this.paint([1, 0.62, 0.78])
      const [fx, fy] = [(pad.x + pad.r * 0.3) * H, (pad.y - pad.r * 0.1) * H]
      const petals: Part[] = []
      for (let k = -2; k <= 2; k++) petals.push(cap(fx, fy, fx + k * 0.006 * H, fy - (0.016 - Math.abs(k) * 0.003) * H, 0.004 * H, 0.002 * H, flower))
      this.shape(petals, this.lighting, 0.5)
    }
    // Irises at the near left of the pond.
    const [ix, iy] = [p.x - p.rx * 0.62, p.y + p.ry * 0.98]
    const leaf = this.paint([0.2, 0.45, 0.15])
    const leaves: Part[] = []
    for (let k = 0; k < 9; k++) {
      const x = (ix + (k - 4) * 0.006) * H
      leaves.push(cap(x, iy * H, x + (k - 4) * 0.004 * H, (iy - 0.05 - hash(k) * 0.03) * H, 0.0025 * H, 0.0008 * H, leaf))
    }
    this.shape(leaves, this.lighting, 0.4)
    for (let k = 0; k < 4; k++) {
      const x = (ix + (k - 1.5) * 0.012) * H
      const y = (iy - 0.06 - hash(k + 4) * 0.02) * H
      this.shape([ell(x - 0.003 * H, y, 0.004 * H, 0.006 * H, -0.5, this.paint([0.45, 0.2, 0.8])), ell(x + 0.003 * H, y, 0.004 * H, 0.006 * H, 0.5, this.paint([0.45, 0.2, 0.8])), ell(x, y - 0.004 * H, 0.003 * H, 0.006 * H, 0, this.paint([0.55, 0.3, 0.9]))], this.lighting, 0.5)
    }
    // The fountain: a spout pouring into a bamboo rocker on two posts, set on a stone.
    const f = this.pivot()
    const bamboo = this.paint(BAMBOO)
    this.shape([ell((f.x + 0.015) * H, (f.y + 0.04) * H, 0.04 * H, 0.016 * H, 0, this.paint(ROCK))], this.lighting, 0.7)
    this.shape(
      [
        cap((f.x - 0.004) * H, (f.y + 0.035) * H, (f.x - 0.004) * H, (f.y - 0.004) * H, 0.003 * H, 0.003 * H, bamboo),
        cap((f.x + 0.07) * H, (f.y + 0.04) * H, (f.x + 0.07) * H, (f.y - 0.08) * H, 0.006 * H, 0.006 * H, bamboo),
        cap((f.x + 0.07) * H, (f.y - 0.072) * H, (f.x - 0.06) * H, (f.y - 0.066) * H, 0.0035 * H, 0.003 * H, bamboo),
      ],
      this.lighting,
      0.6,
    )
  }

  // The fountain's pivot, at the right edge of the pond.
  private pivot() {
    return { x: this.pond.x + this.pond.rx * 0.98, y: this.pond.y - this.pond.ry * 0.05 }
  }

  // A vermilion drum bridge arching over the stream, with a railing and dark piers.
  private drawBridge() {
    const H = this.H
    const t = (0.625 - 0.57) / (this.pond.y - 0.57)
    const bx = this.streamX(t)
    const by = 0.625
    const span = 0.1
    const deck = (s: number) => by - 0.06 * Math.pow(Math.max(0, 1 - s * s), 0.6)
    const red = this.paint(VERMILION)
    const shadow = this.paint([0.4, 0.08, 0.04])
    const posts: Part[] = []
    for (const s of [-0.45, 0.45]) posts.push(cap((bx + s * span) * H, deck(s) * H, (bx + s * span) * H, (by + 0.03) * H, 0.004 * H, 0.004 * H, this.paint([0.2, 0.1, 0.08])))
    this.shape(posts, this.lighting, 0.4)
    const S = Array.from({ length: 25 }, (_, i) => -1.05 + (i / 24) * 2.1)
    this.polygon([...S.map((s) => [(bx + s * span) * H, (deck(s) - 0.004) * H] as const), ...S.toReversed().map((s) => [(bx + s * span) * H, deck(s) * H] as const)], this.paint([0.42, 0.3, 0.2]))
    this.polygon([...S.map((s) => [(bx + s * span) * H, deck(s) * H] as const), ...S.toReversed().map((s) => [(bx + s * span) * H, (deck(s) + 0.012) * H] as const)], red)
    this.polygon([...S.map((s) => [(bx + s * span) * H, (deck(s) + 0.012) * H] as const), ...S.toReversed().map((s) => [(bx + s * span) * H, (deck(s) + 0.016) * H] as const)], shadow)
    const rail: Part[] = []
    const r = 0.0022 * H
    for (let i = 0; i < 9; i++) {
      const s = -0.95 + (i / 8) * 1.9
      rail.push(cap((bx + s * span) * H, deck(s) * H, (bx + s * span) * H, (deck(s) - 0.026) * H, r, r, red))
    }
    for (let i = 0; i < 16; i++) {
      const [s0, s1] = [-0.95 + (i / 16) * 1.9, -0.95 + ((i + 1) / 16) * 1.9]
      rail.push(cap((bx + s0 * span) * H, (deck(s0) - 0.026) * H, (bx + s1 * span) * H, (deck(s1) - 0.026) * H, r, r, red))
      rail.push(cap((bx + s0 * span) * H, (deck(s0) - 0.013) * H, (bx + s1 * span) * H, (deck(s1) - 0.013) * H, r * 0.7, r * 0.7, red))
    }
    this.shape(rail, this.lighting, 0.5)
    const brass = this.paint([0.75, 0.55, 0.2])
    this.shape([ell((bx - 0.95 * span) * H, (deck(-0.95) - 0.029) * H, 0.004 * H, 0.005 * H, 0, brass), ell((bx + 0.95 * span) * H, (deck(0.95) - 0.029) * H, 0.004 * H, 0.005 * H, 0, brass)], this.lighting, 0.6)
  }

  // A tall kasuga stone lantern: plinth, post, platform, a lit firebox, a curved roof and a finial.
  private drawKasuga(x: number, y: number, scale: number) {
    const H = this.H
    const S = scale * H
    const P = (u: number, v: number) => [x * H + u * S, y * H + v * S] as const
    const stone = this.paint(STONE)
    const dark = this.paint([0.48, 0.46, 0.42])
    this.polygon([P(-0.2, 0), P(0.2, 0), P(0.15, -0.08), P(-0.15, -0.08)], dark)
    this.shape([cap(...P(0, -0.08), ...P(0, -0.48), 0.065 * S, 0.055 * S, stone)], this.lighting, 0.6)
    this.polygon([P(-0.17, -0.48), P(0.17, -0.48), P(0.12, -0.56), P(-0.12, -0.56)], dark)
    this.polygon([P(-0.11, -0.56), P(0.11, -0.56), P(0.11, -0.76), P(-0.11, -0.76)], stone)
    this.lamp(P(-0.06, -0.59), P(0.06, -0.73))
    this.polygon([P(-0.3, -0.72), P(-0.2, -0.79), P(-0.06, -0.9), P(0.06, -0.9), P(0.2, -0.79), P(0.3, -0.72), P(0.2, -0.76), P(-0.2, -0.76)], dark)
    this.shape([cap(...P(0, -0.88), ...P(0, -0.99), 0.035 * S, 0.015 * S, stone), ell(...P(0, -0.95), 0.045 * S, 0.045 * S, 0, stone)], this.lighting, 0.6)
  }

  // A low yukimi lantern on three legs under a wide roof, made for viewing snow.
  private drawYukimi(x: number, y: number, scale: number) {
    const H = this.H
    const S = scale * H
    const P = (u: number, v: number) => [x * H + u * S, y * H + v * S] as const
    const stone = this.paint(STONE)
    const dark = this.paint([0.48, 0.46, 0.42])
    this.shape([cap(...P(-0.3, 0), ...P(-0.14, -0.3), 0.04 * S, 0.035 * S, stone), cap(...P(0.3, 0), ...P(0.14, -0.3), 0.04 * S, 0.035 * S, stone), cap(...P(0.04, 0.05), ...P(0.02, -0.3), 0.04 * S, 0.035 * S, dark)], this.lighting, 0.6)
    this.polygon([P(-0.15, -0.28), P(0.15, -0.28), P(0.15, -0.55), P(-0.15, -0.55)], stone)
    this.lamp(P(-0.08, -0.32), P(0.08, -0.51))
    this.polygon([P(-0.55, -0.52), P(-0.38, -0.6), P(-0.12, -0.72), P(0.12, -0.72), P(0.38, -0.6), P(0.55, -0.52), P(0.38, -0.565), P(-0.38, -0.565)], dark)
    this.shape([ell(...P(0, -0.78), 0.07 * S, 0.07 * S, 0, stone)], this.lighting, 0.6)
  }

  // A lantern window: amber and glowing at night, dark by day.
  private lamp(a: readonly [number, number], b: readonly [number, number]) {
    const k = this.look.lamps
    const dark = this.paint([0.12, 0.1, 0.08])
    this.polygon([a, [b[0], a[1]], b, [a[0], b[1]]], [lerp(dark[0], AMBER[0], k), lerp(dark[1], AMBER[1], k), lerp(dark[2], AMBER[2], k)])
    if (k <= 0) return
    const cx = (a[0] + b[0]) / 2
    const cy = (a[1] + b[1]) / 2
    const R = 0.06 * this.H
    for (let y = Math.max(0, Math.floor(cy - R)); y < Math.min(this.H, cy + R); y++)
      for (let x = Math.max(0, Math.floor(cx - R)); x < Math.min(this.W, cx + R); x++) {
        const d = Math.hypot(x - cx, y - cy) / R
        if (d >= 1) continue
        const g = (1 - d) ** 2 * 0.3 * k
        this.add(x, y, 1 * g, 0.5 * g, 0.15 * g)
      }
  }

  // The pond: the still reflection shifted sideways by slow ripples, with a glittering path under the sun or moon.
  private drawWater() {
    const { W, H, hdr, look, mirror, under, wave, pool, wet } = this
    const t = this.time
    for (let x = 0; x < W; x++) wave[x] = 2 * Math.sin((x / H) * 9 + t * 0.35)
    const amp = 0.004 * H
    const ox = look.orb.x * W
    const tick = Math.floor(t * 3) * 131
    for (let k = 0; k < pool.length; k++) {
      const i = pool[k]
      const y = (i / W) | 0
      const x = i - y * W
      const sx = clamp(x + amp * Math.sin((y / H) * 160 + t * 1.2 + wave[x]), 0, W - 1.001)
      const x0 = sx | 0
      const f = sx - x0
      const a = (y * W + x0) * 3
      let r = mirror[a] + (mirror[a + 3] - mirror[a]) * f
      let g = mirror[a + 1] + (mirror[a + 4] - mirror[a + 1]) * f
      let b = mirror[a + 2] + (mirror[a + 5] - mirror[a + 2]) * f
      const spread = (0.015 + (y / H - 0.6) * 0.25) * H
      const along = Math.abs(x - ox) / spread
      if (along < 1 && hash2(x, (y >> 1) + tick) > 0.88 + along * 0.1) {
        const s = (1 - along) * look.glitter * 1.5
        r += look.orb.glow[0] * s
        g += look.orb.glow[1] * s
        b += look.orb.glow[2] * s
      }
      const c = wet[i]
      const o = i * 3
      hdr[o] = under[k * 3] + (r - under[k * 3]) * c
      hdr[o + 1] = under[k * 3 + 1] + (g - under[k * 3 + 1]) * c
      hdr[o + 2] = under[k * 3 + 2] + (b - under[k * 3 + 2]) * c
    }
  }

  // A ripple: a widening ring (and a fainter inner one) that fades as it spreads, only on the water.
  private drawRing(ring: Ring) {
    const { W, H, hdr, wet, look } = this
    const R = (0.004 + ring.age * 0.012) * H
    const fade = (1 - ring.age / ring.life) ** 1.5 * ring.strength
    const cx = ring.x * H
    const cy = ring.y * H
    for (let y = Math.max(0, Math.floor(cy - R * 0.32 - 2)); y <= Math.min(H - 1, Math.ceil(cy + R * 0.32 + 2)); y++)
      for (let x = Math.max(0, Math.floor(cx - R - 2)); x <= Math.min(W - 1, Math.ceil(cx + R + 2)); x++) {
        const i = y * W + x
        if (!wet[i]) continue
        const dx = x + 0.5 - cx
        const dy = (y + 0.5 - cy) / 0.32
        const d = Math.hypot(dx, dy)
        const k = (Math.max(0, 1 - Math.abs(d - R) / 1.3) + 0.5 * Math.max(0, 1 - Math.abs(d - R * 0.6) / 1.1)) * fade * wet[i]
        if (k <= 0) continue
        hdr[i * 3] += look.ripple[0] * k
        hdr[i * 3 + 1] += look.ripple[1] * k
        hdr[i * 3 + 2] += look.ripple[2] * k
      }
  }

  private newPetal(anywhere: boolean): Petal {
    const c = this.cherry
    const fromTree = Math.random() < 0.75
    return {
      x: fromTree ? c.x + rand(-0.17, 0.17) : this.A + 0.03,
      y: fromTree ? c.y + rand(-0.04, 0.1) : rand(0.1, 0.5),
      vx: rand(-0.035, -0.015),
      vy: rand(0.018, 0.032),
      spin: rand(0, TAU),
      land: rand(0.6, 0.98),
      state: 0,
      age: anywhere ? rand(-30, 0) : 0,
    }
  }

  // Petals flutter down and drift left on the breeze, then float on the pond or lie on the ground, and fade.
  private stepPetal(p: Petal, dt: number) {
    p.age += dt
    if (p.age < 0) return
    if (p.state === 0) {
      p.spin += dt * 2
      p.x += (p.vx + 0.012 * Math.sin(this.time * 0.8 + p.spin * 0.3)) * dt
      p.y += p.vy * dt
      if (p.x < -0.05) Object.assign(p, this.newPetal(false))
      if (p.y < p.land) return
      p.age = 0
      p.state = this.wetAt(p.x, p.y) > 0.5 ? 1 : 2
      if (p.state === 1) this.rings.push({ x: p.x, y: p.y, age: 0, life: 2.5, strength: 0.35 })
      return
    }
    if (p.state === 1) {
      p.x -= 0.003 * dt
      if (p.age > 25 || this.wetAt(p.x, p.y) < 0.5) Object.assign(p, this.newPetal(false))
      return
    }
    if (p.age > 6) Object.assign(p, this.newPetal(false))
  }

  private wetAt(x: number, y: number) {
    const xi = Math.floor(x * this.H)
    const yi = Math.floor(y * this.H)
    if (xi < 0 || yi < 0 || xi >= this.W || yi >= this.H) return 0
    return this.wet[yi * this.W + xi]
  }

  private drawPetal(p: Petal) {
    if (p.age < 0) return
    const H = this.H
    const pink = this.look.petal
    // Autumn leaves: the petal color shifted to red and gold, keeping its brightness for the time of day.
    const c: RGB = this.season === "autumn" ? [pink[0], pink[1] * 0.7, pink[2] * 0.25] : pink
    const s = 0.006 * H
    if (p.state === 0) return this.ellipse(p.x * H, p.y * H, s * (0.3 + 0.7 * Math.abs(Math.cos(p.spin))), s * 0.55, c[0], c[1], c[2], 0.9)
    const fade = p.state === 1 ? clamp((25 - p.age) / 5, 0, 1) : clamp(1 - p.age / 6, 0, 1)
    this.ellipse(p.x * H, p.y * H, s, s * 0.4, c[0], c[1], c[2], 0.85 * fade)
  }

  // The bamboo fountain fills slowly until its weight tips it, spills into the pond, and swings back with a clack.
  private stepFountain(dt: number) {
    const f = this.fountain
    if (f.tip < 0) {
      f.fill += dt / 22
      if (f.fill < 1) return
      f.tip = 0
      return
    }
    const before = f.tip
    f.tip += dt / 1.6
    if (before < 0.2 && f.tip >= 0.2) {
      const [x, y] = this.rockerEnd(0.5)
      this.rings.push({ x, y: y + 0.01, age: 0, life: 4, strength: 1 })
    }
    if (f.tip < 1) return
    f.tip = -1
    f.fill = 0
  }

  // The rocker's tilt: open end raised while it fills, then down to spill and back with a bounce.
  private rockerAngle() {
    const f = this.fountain
    if (f.tip < 0) return -0.35 + 0.12 * f.fill
    if (f.tip < 0.15) return lerp(-0.23, 0.5, smoothstep(0, 0.15, f.tip))
    if (f.tip < 0.45) return 0.5
    if (f.tip < 0.65) return lerp(0.5, -0.42, smoothstep(0.45, 0.65, f.tip))
    return lerp(-0.42, -0.35, smoothstep(0.65, 1, f.tip))
  }

  private rockerEnd(angle: number): [number, number] {
    const f = this.pivot()
    return [f.x - Math.cos(angle) * 0.075, f.y + Math.sin(angle) * 0.075]
  }

  private drawRocker() {
    const H = this.H
    const f = this.pivot()
    const a = this.rockerAngle()
    const [ex, ey] = this.rockerEnd(a)
    const bamboo = this.paint(BAMBOO)
    // The trickle from the spout, which the rocker catches while it is raised.
    const water = this.look.night ? [0.1, 0.3, 0.75] : this.look.ripple
    const sx = (f.x - 0.06) * H
    this.shape([cap(sx, (f.y - 0.064) * H, sx, Math.min(ey - 0.004, f.y + 0.02) * H, 0.0012 * H, 0.0012 * H, [water[0], water[1], water[2]])], this.lighting, 0)
    this.shape([cap(ex * H, ey * H, (f.x + Math.cos(a) * 0.035) * H, (f.y - Math.sin(a) * 0.035) * H, 0.0075 * H, 0.0065 * H, bamboo)], this.lighting, 0.7)
    this.shape([ell(ex * H, ey * H, 0.0035 * H, 0.0065 * H, -a, this.paint([0.25, 0.25, 0.08]))], this.lighting, 0)
  }

  // A heron glides in now and then, lands in the shallows to fish for a while, and flies off again.
  private stepHeron(dt: number) {
    const h = this.heron
    if (h.phase === "away") {
      h.next -= dt
      if (h.next > 0) return
      h.phase = "in"
      h.t = 0
      return
    }
    h.t += dt
    if (h.phase === "in" && h.t >= 8) {
      const [x, y] = this.heronSpot()
      h.phase = "stand"
      h.t = 0
      h.stay = rand(30, 45)
      this.rings.push({ x, y, age: 0, life: 4, strength: 0.9 })
    }
    if (h.phase === "stand" && h.t >= h.stay) {
      h.phase = "out"
      h.t = 0
    }
    if (h.phase === "out" && h.t >= 8) {
      h.phase = "away"
      h.next = rand(60, 110)
    }
  }

  private heronSpot(): [number, number] {
    return [this.pond.x - this.pond.rx * 0.5, this.pond.y + this.pond.ry * 0.35]
  }

  private drawHeron() {
    const h = this.heron
    if (h.phase === "away") return
    const H = this.H
    const [sx, sy] = this.heronSpot()
    const p = h.t / 8
    const [x, y, fly] =
      h.phase === "stand"
        ? [sx, sy, 0]
        : h.phase === "in"
          ? [lerp(-0.25, sx, 1 - (1 - p) ** 2), lerp(0.22, sy, 1 - (1 - p) ** 2), clamp((1 - p) / 0.25, 0, 1)]
          : [lerp(sx, this.A + 0.3, p * p), lerp(sy, 0.18, p * p), clamp(p / 0.12, 0, 1)]
    const S = 0.2 * H
    const P = (u: number, v: number): [number, number] => [x * H + u * S, y * H + v * S]
    const L = (a: [number, number], b: [number, number]): [number, number] => [lerp(a[0], b[0], fly), lerp(a[1], b[1], fly)]
    const hunt = h.phase === "stand" ? smoothstep(0.2, 0.9, 0.5 - 0.5 * Math.cos(h.t * 0.45)) : 0
    const flap = Math.sin(this.time * 2.6)
    const body = this.paint([0.62, 0.66, 0.72])
    const neck = this.paint([0.82, 0.82, 0.84])
    const wing = this.paint([0.38, 0.42, 0.5])
    const legs = this.paint([0.55, 0.48, 0.32])
    const shoulder = L([0.11, -0.47], [0.13, -0.42])
    const n1 = L([lerp(0.15, 0.22, hunt), lerp(-0.6, -0.53, hunt)], [0.17, -0.46])
    const n2 = L([lerp(0.09, 0.3, hunt), lerp(-0.7, -0.56, hunt)], [0.16, -0.49])
    const head = L([lerp(0.14, 0.38, hunt), lerp(-0.8, -0.52, hunt)], [0.22, -0.47])
    const beak = L([lerp(0.15, 0.1, hunt), lerp(0.01, 0.11, hunt)], [0.15, 0.015])
    const wingTip: [number, number] = [-0.08, -0.45 - 0.42 * flap]
    const wingMid: [number, number] = [-0.03, -0.45 - 0.22 * flap]
    if (fly > 0.3) this.shape([cap(...P(0.03, -0.45), ...P(wingMid[0] + 0.04, wingMid[1] + 0.02), 0.07 * S, 0.05 * S, this.paint([0.28, 0.31, 0.38])), cap(...P(wingMid[0] + 0.04, wingMid[1] + 0.02), ...P(wingTip[0] + 0.05, wingTip[1] + 0.03), 0.05 * S, 0.02 * S, this.paint([0.28, 0.31, 0.38]))], this.lighting, 0.4)
    this.shape(
      [
        cap(...P(...L([-0.02, 0], [-0.4, -0.37])), ...P(...L([-0.01, -0.32], [-0.1, -0.4])), 0.011 * S, 0.012 * S, legs),
        cap(...P(...L([0.03, 0], [-0.42, -0.4])), ...P(...L([0.01, -0.32], [-0.1, -0.41])), 0.011 * S, 0.012 * S, legs),
        ell(...P(0, L([0, -0.41], [0, -0.42])[1]), 0.17 * S, 0.075 * S, -0.4 * (1 - fly), body),
        cap(...P(-0.12, L([-0.34, -0.33], [-0.42, -0.42])[1]), ...P(-0.2, L([-0.3, -0.3], [-0.42, -0.42])[1]), 0.04 * S, 0.02 * S, wing),
        cap(...P(...shoulder), ...P(...n1), 0.042 * S, 0.032 * S, neck),
        cap(...P(...n1), ...P(...n2), 0.032 * S, 0.026 * S, neck),
        cap(...P(...n2), ...P(...head), 0.026 * S, 0.03 * S, neck),
        ell(...P(...head), 0.042 * S, 0.032 * S, 0, neck),
        cap(...P(...head), ...P(head[0] + beak[0], head[1] + beak[1]), 0.016 * S, 0.003 * S, this.paint([0.9, 0.72, 0.2])),
        cap(...P(head[0] - 0.01, head[1] - 0.02), ...P(head[0] - 0.12, head[1] - 0.01), 0.009 * S, 0.003 * S, this.paint([0.08, 0.08, 0.1])),
      ],
      this.lighting,
      0.6,
    )
    if (fly > 0.3) this.shape([cap(...P(0.03, -0.44), ...P(...wingMid), 0.08 * S, 0.06 * S, wing), cap(...P(...wingMid), ...P(...wingTip), 0.06 * S, 0.025 * S, wing), cap(...P(...wingTip), ...P(wingTip[0] - 0.08, wingTip[1] + 0.02), 0.03 * S, 0.012 * S, this.paint([0.15, 0.16, 0.2]))], this.lighting, 0.6)
    if (fly === 0) this.add(...P(head[0] + 0.02, head[1] - 0.005), 0.25, 0.2, 0.02)
  }

  private stepTanuki(dt: number) {
    const k = this.tanuki
    if (k.t < 0) {
      k.wait -= dt
      if (k.wait <= 0) k.t = 0
      return
    }
    k.t += dt
    if (k.t < TANUKI.gone) return
    k.t = -1
    k.wait = eggWait(true) * TIME_SCALE
  }

  // A tanuki with a leaf on its head waddles along the near bank, sits to gaze at the pond, then wanders off. Its eyes
  // catch the lantern light at night.
  private drawTanuki() {
    const { A, H } = this
    const t = this.tanuki.t
    const seat = 0.42 * A
    const sitting = t >= TANUKI.arrive && t < TANUKI.leave
    const u0 = t < TANUKI.arrive ? lerp(-0.12, seat, t / TANUKI.arrive) : sitting ? seat : lerp(seat, A + 0.12, (t - TANUKI.leave) / (TANUKI.gone - TANUKI.leave))
    const S = 0.12 * H
    const P = (u: number, v: number): [number, number] => [u0 * H + u * S, 0.965 * H + v * S]
    const fur = this.paint([0.5, 0.4, 0.28])
    const dark = this.paint([0.14, 0.11, 0.09])
    const pale = this.paint([0.78, 0.7, 0.55])
    const swing = sitting ? 0 : Math.sin(this.time * 4) * 0.07
    const sway = Math.sin(this.time * 0.8) * 0.03
    // Body, tail and head positions for walking on all fours or sitting up.
    const head: [number, number] = sitting ? [0.08, -0.52 + Math.sin(this.time * 0.5) * 0.01] : [0.3, -0.3]
    const tail: [[number, number], [number, number]] = sitting ? [[-0.1, -0.05], [-0.42, -0.03 + sway]] : [[-0.26, -0.22], [-0.5, -0.12 + sway]]
    const parts: Part[] = sitting
      ? [cap(...P(0.08, -0.22), ...P(0.12, 0), 0.04 * S, 0.035 * S, dark), ell(...P(-0.02, -0.06), 0.15 * S, 0.07 * S, 0, dark), ell(...P(0, -0.26), 0.17 * S, 0.24 * S, 0.15, fur)]
      : [
          ...[0.18, -0.16].flatMap((u) => [cap(...P(u, -0.14), ...P(u + swing, 0), 0.045 * S, 0.035 * S, dark), cap(...P(u + 0.03, -0.14), ...P(u + 0.03 - swing, 0), 0.045 * S, 0.035 * S, dark)]),
          ell(...P(0, -0.2), 0.3 * S, 0.14 * S, 0, fur),
        ]
    parts.push(cap(...P(...tail[0]), ...P(...tail[1]), 0.08 * S, 0.07 * S, fur), ell(...P(...head), 0.13 * S, 0.11 * S, 0, fur), ell(...P(head[0] + 0.12, head[1] + 0.03), 0.065 * S, 0.045 * S, 0, pale), ell(...P(head[0] - 0.06, head[1] - 0.1), 0.045 * S, 0.05 * S, -0.3, dark))
    this.shape(parts, this.lighting, 0.6)
    const stripe = (k: number): [number, number] => [lerp(tail[0][0], tail[1][0], k), lerp(tail[0][1], tail[1][1], k)]
    this.shape(
      [
        ell(...P(head[0] + 0.04, head[1] - 0.01), 0.075 * S, 0.035 * S, 0, dark),
        ell(...P(head[0] + 0.18, head[1] + 0.02), 0.022 * S, 0.02 * S, 0, dark),
        ...[0.45, 0.7, 0.92].map((k) => ell(...P(...stripe(k)), 0.025 * S, 0.075 * S, 0, dark)),
        ...(sitting ? [ell(...P(0.08, -0.24), 0.09 * S, 0.15 * S, 0.15, pale)] : []),
      ],
      this.lighting,
      0.4,
    )
    this.shape([ell(...P(head[0] - 0.01, head[1] - 0.14), 0.075 * S, 0.026 * S, -0.35, this.paint([0.3, 0.58, 0.16])), cap(...P(head[0] + 0.05, head[1] - 0.16), ...P(head[0] + 0.09, head[1] - 0.19), 0.006 * S, 0.004 * S, this.paint([0.3, 0.58, 0.16]))], this.lighting, 0.5)
    if (this.look.lamps > 0) this.add(...P(head[0] + 0.06, head[1] - 0.02), 0.7 * this.look.lamps, 0.4 * this.look.lamps, 0.05 * this.look.lamps)
  }

  // A koi's point along its circling path, in pond coordinates; back runs from the head (0) toward the tail.
  private koiAt(k: Koi, back: number): [number, number] {
    const a = k.a - (k.dir * back * 0.2 * k.size) / k.r
    const r = k.r + 0.06 * Math.sin(k.phase * 0.3 + k.r * 9)
    const wiggle = Math.sin(k.phase * 7 - back * 4) * 0.025 * back
    return [Math.cos(a) * (r + wiggle), Math.sin(a) * (r + wiggle)]
  }

  // A koi seen from above, its body following the curve it swims and its tail swishing; deeper koi fade into the water.
  private drawKoi(k: Koi) {
    const { H, pond: p, look } = this
    const depth = 0.25 + 0.2 * Math.sin(k.phase * 0.4 + k.a)
    const mix = (c: RGB): RGB => {
      const t = this.paint(c)
      return [lerp(t[0], look.water[0], depth), lerp(t[1], look.water[1], depth), lerp(t[2], look.water[2], depth)]
    }
    const S = (u: number, v: number): [number, number] => [(p.x + u * p.rx) * H, (p.y + v * p.ry) * H]
    const points = [0, 0.25, 0.5, 0.75, 1].map((b) => S(...this.koiAt(k, b)))
    // Bodies look wider heading toward or away from the viewer, and thinner crossing the pond.
    const heading = k.a + (k.dir * Math.PI) / 2
    const width = 0.012 * k.size * H * (0.65 + 0.35 * Math.abs(Math.sin(heading)))
    const body = mix(k.colors[0])
    const radii = [0.8, 1, 0.85, 0.55, 0.3]
    const parts: Part[] = []
    for (let i = 0; i < 4; i++) parts.push(cap(...points[i], ...points[i + 1], width * radii[i], width * radii[i + 1], body))
    const [tx, ty] = points[4]
    const [px, py] = points[3]
    const dx = tx - px
    const dy = ty - py
    const l = Math.hypot(dx, dy) || 1
    const swish = Math.sin(k.phase * 7 - 4) * 0.5
    for (const side of [-1, 1]) {
      const a = Math.atan2(dy, dx) + side * 0.5 + swish
      parts.push(cap(tx, ty, tx + Math.cos(a) * width * 1.6, ty + Math.sin(a) * width * 1.6, width * 0.3, width * 0.45, body))
    }
    for (const side of [-1, 1]) {
      const [ax, ay] = points[1]
      parts.push(cap(ax, ay, ax - (dy / l) * side * width * 1.3 - (dx / l) * width * 0.4, ay + (dx / l) * side * width * 1.3 - (dy / l) * width * 0.4, width * 0.35, width * 0.2, body))
    }
    this.shape(parts, this.lighting, 0.5)
    const spots = k.colors[1]
    if (!spots) return
    const c = mix(spots)
    this.shape([ell(...points[0], width * 0.6, width * 0.55, 0, c), ell(...points[2], width * 0.55, width * 0.5, 0, c)], this.lighting, 0.3)
  }

  // A frog on a lily pad, its throat swelling as it croaks now and then.
  private stepFrog(dt: number) {
    const f = this.frog
    if (f.croak >= 0) {
      f.croak += dt
      if (f.croak > 2) f.croak = -1
      return
    }
    f.next -= dt
    if (f.next > 0) return
    f.croak = 0
    f.next = rand(8, 16)
    const pad = this.pads[3]
    this.rings.push({ x: pad.x, y: pad.y, age: 0, life: 3, strength: 0.5 })
  }

  private drawFrog() {
    const H = this.H
    const pad = this.pads[3]
    const S = 0.04 * H
    const x = pad.x * H
    const y = (pad.y + 0.003) * H
    const P = (u: number, v: number): [number, number] => [x + u * S, y + v * S]
    const green = this.paint([0.3, 0.58, 0.15])
    const sac = this.frog.croak >= 0 ? Math.max(0, Math.sin(this.frog.croak * Math.PI * 2)) : 0
    this.shape(
      [
        cap(...P(-0.35, -0.05), ...P(-0.1, 0), 0.12 * S, 0.08 * S, green),
        ell(...P(-0.1, -0.3), 0.38 * S, 0.27 * S, -0.3, green),
        ell(...P(0.25, -0.45), 0.24 * S, 0.18 * S, 0, green),
        cap(...P(0.2, -0.3), ...P(0.3, 0), 0.06 * S, 0.05 * S, green),
        ell(...P(0.18, -0.62), 0.09 * S, 0.09 * S, 0, green),
        ell(...P(0.36, -0.6), 0.09 * S, 0.09 * S, 0, green),
      ],
      this.lighting,
      0.6,
    )
    const belly = this.paint([0.85, 0.85, 0.5])
    this.shape([ell(...P(0.36, -0.32), (0.08 + 0.12 * sac) * S, (0.06 + 0.1 * sac) * S, 0, belly)], this.lighting, 0.4)
    for (const ex of [0.2, 0.38]) this.disc(...P(ex, -0.64), 0.04 * S, 0.02, 0.02, 0.02, 1)
  }

  // Dragonflies hover over the pond, then dart to a new spot.
  private stepDragonfly(d: Dragonfly, dt: number) {
    d.phase += dt
    if (d.rest > 0) {
      d.rest -= dt
      return
    }
    const dx = d.tx - d.x
    const dy = d.ty - d.y
    const l = Math.hypot(dx, dy)
    if (l < 0.004) {
      d.rest = rand(2, 5)
      d.tx = this.pond.x + rand(-0.9, 0.9) * this.pond.rx
      d.ty = rand(0.6, 0.82)
      return
    }
    if (Math.abs(dx) > 0.002) d.face = Math.sign(dx)
    const v = Math.min(l, 0.12 * dt)
    d.x += (dx / l) * v
    d.y += (dy / l) * v
  }

  private drawDragonfly(d: Dragonfly) {
    const H = this.H
    const x = d.x * H
    const y = (d.y + Math.sin(d.phase * 2) * 0.003) * H
    const L = 0.04 * H
    const wing = this.paint([0.7, 0.82, 0.92])
    const lift = Math.sin(d.phase * 30) * 0.08
    for (const [u, a] of [[0.12, 0.4], [-0.02, 0.35]]) this.ellipse(x + u * L * d.face, y - (0.1 + lift) * L, a * L, 0.07 * L, wing[0], wing[1], wing[2], 0.35)
    this.shape([cap(x - 0.5 * L * d.face, y + 0.05 * L, x + 0.15 * L * d.face, y, 0.025 * L, 0.05 * L, this.paint(d.color)), ell(x + 0.22 * L * d.face, y, 0.07 * L, 0.06 * L, 0, this.paint(d.color))], this.lighting, 0.6)
  }

  // Fireflies blinking over the garden and the pond at night.
  private drawFireflies() {
    const H = this.H
    for (const f of this.fireflies) {
      const k = Math.pow(Math.max(0, Math.sin(this.time * 1.3 + f.phase * 7)), 6)
      if (k < 0.02) continue
      fireflyLight(this.hdr, this.W, H, f.x * H, f.y * H, k)
      this.disc(f.x * H, f.y * H, 1.3, 1.8 * k, 2.4 * k, 0.6 * k, 0.6)
      this.add(f.x * H, f.y * H, 0.9 * k, 1.2 * k, 0.3 * k)
    }
  }
}

export const zen: Wallpaper = {
  id: "zen",
  name: "Zen garden",
  description: "A koi pond under a red bridge, raked gravel, stone lanterns and falling cherry petals, with a heron now and then",
  activity: {
    calm: "Garden, pond ripples, petals and a bamboo fountain",
    lively: "Adds koi circling under the lily pads",
    teeming: "Adds more koi, a frog on a lily pad and dragonflies",
  },
  scrim: {
    day: [
      [20, 40, 70],
      [24, 40, 22],
      [30, 34, 26],
    ],
    sunset: [
      [20, 14, 32],
      [38, 24, 26],
      [16, 11, 13],
    ],
    night: [
      [4, 6, 16],
      [4, 6, 14],
      [2, 5, 10],
    ],
  },
  create: (settings) => new Zen(settings),
}
