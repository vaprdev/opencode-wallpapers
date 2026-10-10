import { Canvas, cap, ell, type Lighting, type Part } from "../src/canvas"
import { eggWait } from "../src/egg"
import { haze, mottle } from "../src/grade"
import { bird, flyAway, startle, type Flier } from "../src/flock"
import { TAU, clamp, fbm1, hash, hash2, lerp, rand, smoothstep, type RGB } from "../src/math"
import { driftClouds, makeClouds, makeStars, makeStorm, paintClouds, paintSky, paintStars, paintStorm, type Cloud, type Orb, type Star } from "../src/sky"
import type { Activity, Settings, Time, Wallpaper } from "../src/wallpaper"
import { WeatherLayer } from "../src/weather"

// The scene runs slower than real time, which keeps it calm behind text.
const TIME_SCALE = 0.35
// Animals move at a quarter of scene speed, so even the T. rex plods.
const CREATURE_SPEED = 0.25
const HORIZON = 0.6
// The volcano's crater, in screen heights; its x is a fraction of the width.
const VENT_X = 0.7
const CRATER = 0.205
// Smoke puffs leave the crater on a loop: each one is the same plume at a different age.
const SMOKE_LIFE = 14
const SMOKE_PUFFS = 32
// The time machine's visit, in scene seconds: it flashes in, drives across leaving twin trails of fire, and flashes out.
const DELOREAN = 14
const FLASH = 1.2

// What changes with the time of day. Rock, plants and animals have one daytime color each, darkened by tint; lava is
// its own light and keeps its color, glowing hardest at night.
interface Look {
  style: "rim" | "front"
  light: RGB
  sky: [number, RGB][]
  orb: Orb
  stars: number
  clouds: { puffy: boolean; top: RGB; bottom: RGB; alpha: number }
  ridge: RGB
  forest: RGB
  ground: [far: RGB, near: RGB]
  rock: RGB
  lava: [red: RGB, orange: RGB]
  glow: number
  smoke: [hot: RGB, cool: RGB, alpha: number]
  water: RGB
  ripple: RGB
  tint: RGB
}

const LOOKS: Record<Time, Look> = {
  day: {
    style: "front",
    light: [1, 0.95, 0.8],
    sky: [
      [0, [0.14, 0.34, 0.66]],
      [0.3, [0.3, 0.52, 0.78]],
      [HORIZON, [0.74, 0.78, 0.74]],
    ],
    orb: { x: 0.16, y: 0.13, r: 0.035, core: [5, 4.6, 3.8], glow: [1, 0.95, 0.8], near: 0.45, wide: 0.12 },
    stars: 0,
    clouds: { puffy: true, top: [1.1, 1.1, 1.05], bottom: [0.62, 0.66, 0.74], alpha: 0.85 },
    ridge: [0.42, 0.52, 0.6],
    forest: [0.14, 0.3, 0.13],
    ground: [
      [0.36, 0.5, 0.2],
      [0.2, 0.38, 0.1],
    ],
    rock: [0.32, 0.25, 0.22],
    lava: [
      [0.9, 0.1, 0.02],
      [1.6, 0.45, 0.04],
    ],
    glow: 0.05,
    smoke: [[0.3, 0.25, 0.22], [0.66, 0.64, 0.64], 0.5],
    water: [0.22, 0.44, 0.52],
    ripple: [0.55, 0.7, 0.75],
    tint: [1, 1, 1],
  },
  sunset: {
    style: "rim",
    light: [1, 0.5, 0.2],
    sky: [
      [0, [0.03, 0.02, 0.08]],
      [0.25, [0.12, 0.04, 0.12]],
      [0.45, [0.45, 0.14, 0.14]],
      [HORIZON, [1, 0.5, 0.18]],
    ],
    orb: { x: 0.2, y: 0.48, r: 0.06, core: [3.2, 1.7, 0.6], glow: [1, 0.42, 0.14], near: 0.5, wide: 0.25 },
    stars: 25,
    clouds: { puffy: false, top: [0.1, 0.035, 0.09], bottom: [0.8, 0.3, 0.2], alpha: 0.55 },
    ridge: [0.32, 0.12, 0.14],
    forest: [0.07, 0.03, 0.04],
    ground: [
      [0.24, 0.1, 0.08],
      [0.08, 0.04, 0.03],
    ],
    rock: [0.12, 0.05, 0.07],
    lava: [
      [1.1, 0.12, 0.02],
      [2, 0.55, 0.04],
    ],
    glow: 0.25,
    smoke: [[0.9, 0.28, 0.07], [0.16, 0.07, 0.1], 0.55],
    water: [0.5, 0.2, 0.12],
    ripple: [1, 0.45, 0.15],
    tint: [0.22, 0.13, 0.1],
  },
  night: {
    style: "rim",
    light: [0.2, 0.45, 1],
    sky: [
      [0, [0.004, 0.008, 0.03]],
      [0.3, [0.012, 0.02, 0.06]],
      [HORIZON, [0.04, 0.06, 0.15]],
    ],
    orb: { x: 0.18, y: 0.15, r: 0.03, core: [1, 0.72, 0.3], glow: [0.45, 0.3, 0.12], near: 0.2, wide: 0.08, moon: true },
    stars: 140,
    clouds: { puffy: false, top: [0.015, 0.02, 0.05], bottom: [0.06, 0.1, 0.3], alpha: 0.4 },
    ridge: [0.02, 0.03, 0.08],
    forest: [0.006, 0.012, 0.028],
    ground: [
      [0.02, 0.035, 0.07],
      [0.008, 0.016, 0.03],
    ],
    rock: [0.02, 0.018, 0.045],
    lava: [
      [1.3, 0.1, 0.02],
      [2.2, 0.55, 0.03],
    ],
    glow: 0.5,
    smoke: [[0.8, 0.12, 0.03], [0.1, 0.025, 0.07], 0.6],
    water: [0.02, 0.04, 0.1],
    ripple: [0.1, 0.35, 0.9],
    tint: [0.025, 0.04, 0.09],
  },
}

// Daylight comes from the upper left, where the sun is.
const DAYLIGHT = (() => {
  const l = Math.hypot(0.5, 0.6, 0.6)
  return [-0.5 / l, -0.6 / l, 0.6 / l] as const
})()

// Daytime colors.
const FERN: RGB = [0.2, 0.48, 0.14]
const FROND: RGB = [0.16, 0.38, 0.12]
const BARK: RGB = [0.35, 0.25, 0.16]
const NEEDLES: RGB = [0.1, 0.3, 0.14]
const SAUROPOD: RGB = [0.42, 0.44, 0.34]
const REX: RGB = [0.42, 0.34, 0.18]
const TRIKE: RGB = [0.52, 0.43, 0.28]
const BONE: RGB = [0.88, 0.82, 0.66]

interface Walker {
  x: number
  y: number
  wx: number
  wy: number
  wanderT: number
  face: number
  phase: number
  // 0 standing, 1 head down grazing.
  graze: number
  rest: number
  moving: boolean
  size: number
}

class Prehistoric extends Canvas {
  private time = 0
  private creatureTime = 0
  private readonly activity: Activity
  private readonly look: Look
  private lighting: Lighting = { style: "front", dir: DAYLIGHT }
  private background = new Float32Array(0)
  private allStars: Star[]
  private stars: Star[] = []
  private clouds: Cloud[]
  private smoke = Array.from({ length: SMOKE_PUFFS }, (_, i) => ({ age: (i / SMOKE_PUFFS) * SMOKE_LIFE, seed: Math.random() * 100 }))
  // Lava pixels (hdr index, strength, height down the flow) that pulse each frame.
  private lava = { index: new Int32Array(0), k: new Float32Array(0), along: new Float32Array(0) }
  private trees: [number, number] = [0, 0]
  private rex = { x: -9, dir: 1, next: 2, phase: 0 }
  private dust: { x: number; y: number; vx: number; age: number }[] = []
  // p runs from browsing the left tree (0) to browsing the right one (1).
  private sauropod = { p: 0, face: -1, target: -1, mode: "browse" as "browse" | "turn" | "walk", timer: rand(4.5, 6), phase: 0, pose: 1 }
  private herd: Walker[] = []
  private dragonflies: { x: number; y: number; tx: number; ty: number; rest: number; face: number; phase: number }[] = []
  private nessie = { t: -1, x: 0, y: 0, dir: 1, wait: 1 }
  private readonly weather: WeatherLayer
  private storm = makeStorm()
  private birds: Flier[] = []
  // The easter egg: a time-travelling car. t counts scene seconds since it appeared at x0.
  private delorean = { wait: eggWait() * TIME_SCALE, t: -1, x0: 0 }

  constructor(settings: Settings) {
    super()
    this.activity = settings.activity
    this.look = LOOKS[settings.time]
    if (settings.time === "day") this.frame = 0.4
    this.weather = new WeatherLayer(settings.weather ?? "clear", settings.time, HORIZON)
    this.allStars = makeStars(this.look.stars, 0.5)
    this.clouds = makeClouds(this.look.clouds.puffy ? 4 : 5, this.look.clouds.puffy, 0.06, 0.3)
    if (settings.activity !== "teeming") return
    const walker = (x: number, y: number, size: number): Walker => ({ x, y, wx: x, wy: y, wanderT: 0, face: 1, phase: Math.random() * TAU, graze: 0, rest: 0, moving: false, size })
    this.herd = [walker(0.3, 0.8, 1), walker(0.55, 0.84, 1.1), walker(0.42, 0.82, 0.65)]
    this.dragonflies = Array.from({ length: 4 }, () => ({ x: Math.random() * 1.5, y: rand(0.75, 0.95), tx: 0, ty: 0, rest: rand(0, 3), face: 1, phase: Math.random() * TAU }))
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
    this.birds = flyAway(this.birds, dt, this.A)
    this.stepDelorean(dt)
    for (const s of this.smoke) {
      s.age += dt
      if (s.age < SMOKE_LIFE) continue
      s.age -= SMOKE_LIFE
      s.seed = Math.random() * 100
    }
    for (const d of this.dust) {
      d.age += dt
      d.x += d.vx * dt
      d.y -= 0.006 * dt
    }
    this.dust = this.dust.filter((d) => d.age < 3)
    this.stepRex(dt, cdt)
    if (this.activity !== "calm") this.stepSauropod(cdt)
    if (this.activity !== "teeming") return
    const A = this.A
    for (const w of this.herd) this.wander(w, cdt, [0.08 * A, 0.45 * A, 0.78, 0.87], 0.03, [6, 14])
    for (const d of this.dragonflies) this.stepDragonfly(d, cdt)
    this.stepNessie(cdt)
  }

  render() {
    this.hdr.set(this.background)
    if (!this.weather.covered) paintStars(this.hdr, this.W, this.H, this.stars, this.time, 0.5, this.look.stars > 50 ? 0.5 : 0.3)
    const orange = this.look.lava[1]
    flowLava(this.hdr, this.lava.index, this.lava.k, this.lava.along, this.time, orange[0], orange[1], orange[2])
    const [top, bottom] = this.weather.scud ?? [this.look.clouds.top, this.look.clouds.bottom]
    paintClouds(this.hdr, this.W, this.H, this.clouds, top, bottom, this.look.clouds.alpha, this.look.clouds.puffy)
    paintStorm(this.hdr, this.W, this.H, this.storm, this.look.clouds.top, this.look.clouds.bottom, this.gloom)
    this.drawSmoke()
    if (this.activity !== "calm") {
      this.drawPterosaurs()
      this.drawSauropod()
    }
    if (this.activity === "teeming") {
      this.drawNessie()
      for (const w of [...this.herd].sort((a, b) => a.y - b.y)) this.drawTriceratops(w)
    }
    this.drawDust()
    this.drawRex()
    const A = this.A
    for (const [i, x] of [0.01, 0.2, 0.76, 0.99].entries()) this.drawFern(x * A, 1.03, 0.17 + hash(i) * 0.04, i, true)
    if (this.activity === "teeming") for (const d of this.dragonflies) this.drawDragonfly(d)
    if (this.delorean.t >= 0) this.drawDelorean()
    for (const b of this.birds) this.shape(bird(b, this.H, 0.024 * this.H, this.paint([0.5, 0.3, 0.2])), this.lighting, 0.4)
    this.weather.draw(this.hdr, this.W, this.H)
    this.finish()
  }

  protected override visit() {
    if (this.rex.x < -5) this.rex.next = 0
  }

  // Little feathered dinosaurs flap up out of the ferns below the click.
  poke(x: number, y: number) {
    startle(this.birds, x, Math.max(y, 0.66), 4)
  }

  // The sky, ridge, volcano, forest, ground, lake, trees, cycads and far ferns never move, so they are painted once
  // per size into `background`.
  protected override layout() {
    const { W, H, A, look } = this
    this.lighting = look.style === "front" ? { style: "front", dir: DAYLIGHT } : { style: "rim", color: look.light, x: look.orb.x * W, y: look.orb.y * H }
    paintSky(this.hdr, W, H, look.sky, look.orb)
    this.weather.cover(this.hdr, W, H)
    const sky = this.hdr.slice()
    const day = look === LOOKS.day
    const vx = VENT_X * A
    const ridgeTop = new Float32Array(W)
    const volcanoTop = new Float32Array(W)
    const forestTop = new Float32Array(W)
    const groundTop = new Float32Array(W)
    for (let x = 0; x < W; x++) {
      const u = x / H
      ridgeTop[x] = (0.53 - 0.05 * fbm1(u * 2, 21) - 0.02 * Math.abs(Math.sin(u * 3.3))) * H
      const d = Math.abs(u - vx)
      const s = clamp((d - 0.045) / (u < vx ? 0.5 : 0.56), 0, 1)
      volcanoTop[x] = d < 0.045 ? (CRATER + 0.01 * (1 - (d / 0.045) ** 2)) * H : (CRATER + 0.43 * (1 - (1 - s) ** 2.2) + 0.012 * (fbm1(u * 9, 11) - 0.5) * s) * H
      forestTop[x] = (0.6 - 0.018 * fbm1(u * 5, 31) - 0.012 * Math.abs(Math.sin(u * 23 + fbm1(u * 3, 7) * 4))) * H
      groundTop[x] = (0.618 + 0.005 * Math.sin(u * 2.4)) * H
    }
    this.stars = this.allStars.filter((s) => s.y * H < Math.min(volcanoTop[clamp(Math.floor(s.x * W), 0, W - 1)], ridgeTop[clamp(Math.floor(s.x * W), 0, W - 1)]) - 2)
    this.fillBelow(ridgeTop, (x, y, d) => {
      const haze = clamp((y / H - 0.47) * 4, 0, 0.4)
      return this.rim([lerp(look.ridge[0], look.sky[look.sky.length - 1][1][0], haze), lerp(look.ridge[1], look.sky[look.sky.length - 1][1][1], haze), lerp(look.ridge[2], look.sky[look.sky.length - 1][1][2], haze)], x, d, 1.5)
    })
    // The volcano: dark rock scored by gullies running down from the crater, greening toward its foot.
    this.fillBelow(volcanoTop, (x, y, d) => {
      const u = x / H
      const v = y / H
      const g = (u - vx) / Math.max(0.02, v - CRATER + 0.02)
      const gully = 0.82 + 0.18 * Math.sin(g * 22 + fbm1(g * 5, 3) * 5) + (hash2(x, y) - 0.5) * 0.06
      const side = look.style === "front" ? 1 + 0.2 * clamp(-g, -1, 1) : 1
      const ash = smoothstep(0.32, 0.22, v) * 0.25
      const green = smoothstep(0.5, 0.6, v) * (0.5 + 0.5 * fbm1(u * 12, 5))
      const k = gully * side
      const r = lerp(look.rock[0] * (1 + ash), look.forest[0], green) * k
      const gg = lerp(look.rock[1] * (1 + ash), look.forest[1], green) * k
      const b = lerp(look.rock[2] * (1 + ash), look.forest[2], green) * k
      return this.rim([r, gg, b], x, d, 2)
    })
    // By day the ridge and volcano fade into the sky, then the forest and far plain, while the foreground stays crisp.
    if (day) haze(this.hdr, sky, W, H, 0.62, 0.63, 0.1)
    this.paintLava(vx)
    this.fillBelow(forestTop, (x, y, d) => {
      const k = 0.8 + 0.2 * fbm1(x * 0.3, 41) + (hash2(x, y) - 0.5) * 0.1
      return this.rim([look.forest[0] * k, look.forest[1] * k, look.forest[2] * k], x, d, 1.5)
    })
    const [far, near] = look.ground
    this.fillBelow(groundTop, (x, y, d) => {
      const depth = clamp((y / H - 0.62) / 0.38, 0, 1)
      const blades = 0.9 + 0.1 * Math.sin(x * 1.7 + y * 0.6 + fbm1(x * 0.1, 2) * 6) + (hash2(x, y) - 0.5) * 0.05
      return this.rim([lerp(far[0], near[0], depth) * blades, lerp(far[1], near[1], depth) * blades, lerp(far[2], near[2], depth) * blades], x, d, 2)
    })
    if (day) {
      mottle(this.hdr, W, H, 0.62, 1, 0.55, [1.16, 1.04, 0.66], [0.68, 0.84, 0.72])
      haze(this.hdr, sky, W, H, 0.62, 0.8, 0.14, 0, 0.56)
    }
    if (this.activity === "teeming") this.paintLake()
    this.trees = [0.08 * A, Math.max(0.4 * A, 0.08 * A + 0.45)]
    this.drawTree(this.trees[0], 0.665, 0.29)
    this.drawTree(this.trees[1], 0.662, 0.31)
    this.drawTree(0.93 * A, 0.64, 0.45)
    for (const [i, [x, y, s]] of [
      [0.32, 0.78, 0.07],
      [0.88, 0.74, 0.08],
      [0.48, 0.9, 0.08],
    ].entries())
      this.drawFern(x * A, y, s, i + 7, false)
    this.drawCycad(0.04 * A, 0.86, 0.09)
    this.drawCycad(0.47 * A, 0.835, 0.07)
    this.drawCycad(0.9 * A, 0.84, 0.1)
    this.background = this.hdr.slice()
  }

  private paint(c: RGB): RGB {
    const t = this.look.tint
    return [c[0] * t[0], c[1] * t[1], c[2] * t[2]]
  }

  // At sunset and night, the top edge of a slope catches the light.
  private rim(base: RGB, x: number, depth: number, width: number): RGB {
    if (this.look.style === "front") return base
    const glow = 0.35 + 0.65 * Math.exp(-Math.abs(x - this.look.orb.x * this.W) / (0.45 * this.H))
    const k = Math.exp(-depth / width) * glow * 0.35
    return [base[0] + this.look.light[0] * k, base[1] + this.look.light[1] * k, base[2] + this.look.light[2] * k]
  }

  private fillBelow(top: Float32Array, color: (x: number, y: number, depth: number) => RGB) {
    const { W, H } = this
    for (let x = 0; x < W; x++)
      for (let y = Math.max(0, Math.floor(top[x])); y < H; y++) {
        const c = color(x, y, y + 0.5 - top[x])
        this.blend((y * W + x) * 3, c[0], c[1], c[2], clamp(y + 1 - top[x], 0, 1))
      }
  }

  // Lava runs from the crater rim down the flanks, orange where it is hottest and red as it cools, with a glow around
  // it. The streams are painted here; render() sends slow pulses of heat down them.
  private paintLava(vx: number) {
    const { W, H, look } = this
    const core = new Float32Array(W * H)
    const heat = new Float32Array(W * H)
    const halo = new Float32Array(W * H)
    const along = new Float32Array(W * H)
    for (const [off, spread, end, seed] of [
      [-0.035, -0.32, 0.47, 1],
      [-0.015, -0.12, 0.38, 2],
      [0.02, 0.2, 0.43, 3],
      [0.038, 0.42, 0.54, 4],
    ]) {
      for (let py = (CRATER + 0.004) * H; py < end * H; py += 0.5) {
        const v = py / H
        const t = (v - CRATER) / (end - CRATER)
        const px = (vx + off + spread * (v - CRATER) + 0.03 * (fbm1(v * 10 + seed * 7, 3) - 0.5) * t) * H
        const w = Math.max(0.7, lerp(0.006, 0.0028, t) * H)
        const R = w * 4
        for (let y = Math.max(0, Math.floor(py - R)); y <= Math.min(H - 1, Math.ceil(py + R)); y++)
          for (let x = Math.max(0, Math.floor(px - R)); x <= Math.min(W - 1, Math.ceil(px + R)); x++) {
            const d = Math.hypot(x + 0.5 - px, y + 0.5 - py)
            const i = y * W + x
            const c = clamp(w - d + 0.5, 0, 1)
            if (c > core[i]) {
              core[i] = c
              along[i] = v
            }
            heat[i] = Math.max(heat[i], clamp(1 - d / w, 0, 1) * (1 - 0.7 * t))
            halo[i] = Math.max(halo[i], Math.exp(-d / (w * 1.3)) * (1 - 0.5 * t))
          }
      }
    }
    // The crater itself glows from within.
    const cx = vx * H
    const cy = (CRATER + 0.006) * H
    for (let y = Math.max(0, Math.floor(cy - 0.06 * H)); y < Math.min(H, cy + 0.03 * H); y++)
      for (let x = Math.max(0, Math.floor(cx - 0.08 * H)); x < Math.min(W, cx + 0.08 * H); x++) {
        const i = y * W + x
        halo[i] = Math.max(halo[i], Math.exp(-Math.hypot((x - cx) / 2.2, y - cy) / (0.012 * H)) * 1.5)
      }
    const [red, orange] = look.lava
    const index: number[] = []
    for (let i = 0; i < W * H; i++) {
      if (halo[i] > 0.01) {
        const k = halo[i] * look.glow
        this.hdr[i * 3] += red[0] * k
        this.hdr[i * 3 + 1] += red[1] * k
        this.hdr[i * 3 + 2] += red[2] * k
      }
      if (core[i] <= 0) continue
      const h = heat[i]
      this.blend(i * 3, lerp(red[0], orange[0], h), lerp(red[1], orange[1], h), lerp(red[2], orange[2], h), core[i])
      index.push(i)
    }
    this.lava = { index: Int32Array.from(index), k: Float32Array.from(index, (i) => core[i] * (0.4 + heat[i])), along: Float32Array.from(index, (i) => along[i]) }
  }

  // A still lake in front of the volcano, mirroring it and the sky, with a muddy shore.
  private paintLake() {
    const { W, H, A, look } = this
    const [lx, ly, lrx, lry] = this.lake()
    const [cx, cy, rx, ry] = [lx * H, ly * H, lrx * H, lry * H]
    const mirror = HORIZON * H
    const red = look.lava[0]
    const mud = this.paint([0.3, 0.24, 0.15])
    for (let y = Math.max(0, Math.floor(cy - ry - 2)); y < Math.min(H, cy + ry + 3); y++)
      for (let x = Math.max(0, Math.floor(cx - rx - 3)); x < Math.min(W, cx + rx + 3); x++) {
        const q = Math.hypot((x + 0.5 - cx) / rx, (y + 0.5 - cy) / ry)
        const shore = clamp((1.12 - q) * 6, 0, 1)
        if (shore <= 0) continue
        const o = (y * W + x) * 3
        this.blend(o, mud[0], mud[1], mud[2], shore * 0.8)
        const wet = clamp((1 - q) * Math.min(rx, ry) * 0.5 + 0.5, 0, 1)
        if (wet <= 0) continue
        const my = clamp(Math.round(2 * mirror - y), 0, H - 1)
        const mx = clamp(Math.round(x + Math.sin(y * 1.3) * 0.8), 0, W - 1)
        const m = (my * W + mx) * 3
        const k = 0.55 + 0.1 * Math.sin(y * 2.1 + x * 0.05)
        this.blend(o, lerp(look.water[0], this.hdr[m], k), lerp(look.water[1], this.hdr[m + 1], k), lerp(look.water[2], this.hdr[m + 2], k), wet)
        // The volcano's glow shimmers on the water below it.
        const sheen = look.glow * 0.25 * Math.exp(-Math.abs(x / H - VENT_X * A) / 0.1) * wet * (0.7 + 0.3 * Math.sin(y * 2.7))
        this.hdr[o] += red[0] * sheen
        this.hdr[o + 1] += red[1] * sheen
        this.hdr[o + 2] += red[2] * sheen
      }
  }

  // The lake's center and radii, in screen heights.
  private lake() {
    return [0.66 * this.A, 0.735, Math.min(0.3, 0.22 * this.A), 0.042] as const
  }

  // A monkey-puzzle conifer: a bare trunk with tiers of drooping branches toward its rounded top.
  private drawTree(x: number, base: number, top: number) {
    const H = this.H
    const h = base - top
    this.shape([cap(x * H, base * H, x * H, (top + 0.02) * H, 0.008 * H, 0.004 * H, this.paint(BARK))], this.lighting, 0.6)
    const needles = this.paint(NEEDLES)
    const parts: Part[] = [ell(x * H, (top + 0.015) * H, 0.035 * H, 0.02 * H, 0, needles)]
    for (let k = 0; k < 5; k++) {
      const y = top + 0.02 + k * h * 0.07
      const w = 0.035 + k * 0.008 + hash(x * 9 + k) * 0.01
      for (const s of [-1, 1]) {
        parts.push(cap(x * H, y * H, (x + s * w) * H, (y + 0.012) * H, 0.006 * H, 0.004 * H, needles))
        parts.push(ell((x + s * w * 0.7) * H, (y + 0.012) * H, w * 0.45 * H, 0.011 * H, s * 0.15, needles))
      }
    }
    this.shape(parts, this.lighting, this.look.style === "rim" ? 0.4 : 0.7)
  }

  // A cycad: a stout scaly trunk crowned with stiff feathery fronds and a cone in the middle.
  private drawCycad(x: number, base: number, size: number) {
    const H = this.H
    const top = base - size * 0.6
    this.shape([cap(x * H, base * H, x * H, top * H, size * 0.14 * H, size * 0.12 * H, this.paint([0.42, 0.32, 0.18]), 4)], this.lighting, 0.7)
    const frond = this.paint(FROND)
    for (let i = 0; i < 11; i++) {
      const a = -Math.PI - 0.35 + (i / 10) * (Math.PI + 0.7) + (hash(i + x) - 0.5) * 0.15
      const len = size * (1.4 + hash(i * 3 + x) * 0.5) * H
      const parts: Part[] = []
      let [px, py] = [x * H, top * H]
      let angle = a
      for (let s = 0; s < 6; s++) {
        angle += Math.cos(a) > 0 ? 0.05 : -0.05
        const nx = px + Math.cos(angle) * (len / 6)
        const ny = py + Math.sin(angle) * (len / 6) + s * 0.0015 * H
        parts.push(cap(px, py, nx, ny, 0.004 * H, 0.003 * H, frond))
        const leaf = (1 - s / 8) * size * 0.4 * H
        for (const side of [-1, 1]) parts.push(cap(nx, ny, nx + Math.cos(angle + side * 0.8) * leaf, ny + Math.sin(angle + side * 0.8) * leaf, 0.004 * H, 0.0012 * H, frond))
        ;[px, py] = [nx, ny]
      }
      this.shape(parts, this.lighting, this.look.style === "rim" ? 0.3 : 0.6)
    }
    this.shape([ell(x * H, (top - 0.008) * H, size * 0.12 * H, size * 0.16 * H, 0, this.paint([0.7, 0.5, 0.2]), 3)], this.lighting, 0.6)
  }

  // A clump of fern fronds arching out and drooping at the tips; the front clumps sway in the breeze.
  private drawFern(x: number, y: number, size: number, seed: number, sway: boolean) {
    const H = this.H
    const fern = this.paint(FERN)
    for (let i = 0; i < 7; i++) {
      const base = -Math.PI / 2 + ((i / 6) * 2 - 1) * 1.15 + (hash(seed * 5 + i) - 0.5) * 0.2
      const bend = sway ? Math.sin(this.time * 0.7 + i * 1.3 + seed * 2) * 0.05 : 0
      const len = size * (0.75 + hash(seed * 7 + i) * 0.35) * H
      const parts: Part[] = []
      let [px, py] = [x * H, y * H]
      let angle = base + bend
      for (let s = 0; s < 7; s++) {
        const q = s / 7
        angle += (Math.cos(base) >= 0 ? 1 : -1) * 0.1 * (0.4 + Math.abs(Math.cos(base))) + bend * 0.3
        const nx = px + Math.cos(angle) * (len / 7)
        const ny = py + Math.sin(angle) * (len / 7)
        parts.push(cap(px, py, nx, ny, lerp(0.004, 0.0012, q) * H, lerp(0.004, 0.0012, q + 1 / 7) * H, fern))
        const leaf = Math.sin(Math.PI * (0.25 + q * 0.75)) * size * 0.22 * H
        for (const side of [-1, 1]) parts.push(cap(nx, ny, nx + Math.cos(angle + side * 1.15) * leaf, ny + Math.sin(angle + side * 1.15) * leaf, 0.0045 * H, 0.001 * H, fern))
        ;[px, py] = [nx, ny]
      }
      this.shape(parts, this.lighting, this.look.style === "rim" ? 0.3 : 0.6)
    }
  }

  // Smoke billows up from the crater and leans downwind, lit from below by the lava when it is fresh.
  private drawSmoke() {
    const { A, H, look } = this
    const [hot, cool, alpha] = look.smoke
    for (const s of this.smoke) {
      const t = s.age
      const x = (VENT_X * A + (hash(s.seed) - 0.5) * 0.02 + 0.002 * t + 0.0009 * t * t + 0.006 * Math.sin(t * 0.7 + s.seed)) * H
      const y = (CRATER - 0.004 - 0.018 * t + 0.0004 * t * t) * H
      const r = (0.012 + 0.006 * t) * (0.8 + hash(s.seed + 1) * 0.4) * H
      const a = alpha * smoothstep(0, 1.5, t) * (1 - smoothstep(8, SMOKE_LIFE, t))
      const k = smoothstep(0, 5, t)
      const c: RGB = [lerp(hot[0], cool[0], k), lerp(hot[1], cool[1], k), lerp(hot[2], cool[2], k)]
      this.disc(x, y, r, c[0], c[1], c[2], a * 0.5)
      this.disc(x - r * 0.15, y - r * 0.15, r * 0.65, c[0] * 1.08, c[1] * 1.08, c[2] * 1.08, a * 0.5)
    }
  }

  // Pterosaurs circling on long wings over the volcano.
  private drawPterosaurs() {
    const { A, H } = this
    const count = this.activity === "teeming" ? 4 : 2
    const skin = this.paint([0.55, 0.32, 0.2])
    const wing = this.paint([0.42, 0.24, 0.16])
    const crest = this.paint([0.75, 0.3, 0.12])
    for (let i = 0; i < count; i++) {
      const a = this.creatureTime * (0.55 + i * 0.09) + i * 1.9
      const x = (0.42 * A + i * 0.07 + Math.cos(a) * (0.16 + i * 0.05)) * H
      const y = (0.15 + i * 0.045 + Math.sin(a) * 0.035) * H
      const f = Math.sin(a) > 0 ? -1 : 1
      const flap = Math.sin(this.time * 1.6 + i * 2) * Math.max(0, Math.sin(this.time * 0.3 + i))
      const s = (0.055 - i * 0.005) * H
      for (const side of [-1, 1]) {
        const wrist: [number, number] = [x + side * 0.45 * s, y - (0.18 + flap * 0.35) * s]
        const tip: [number, number] = [x + side * 1.05 * s, y + (0.05 - flap * 0.6) * s]
        this.polygon([[x, y - 0.06 * s], wrist, tip, [x + side * 0.4 * s, y + 0.06 * s], [x, y + 0.1 * s]], wing)
        this.shape([cap(x, y - 0.04 * s, ...wrist, 0.05 * s, 0.035 * s, skin), cap(...wrist, ...tip, 0.035 * s, 0.01 * s, skin)], this.lighting, 0.4)
      }
      this.shape(
        [
          ell(x, y, 0.2 * s, 0.08 * s, 0, skin),
          cap(x + f * 0.12 * s, y - 0.03 * s, x + f * 0.3 * s, y - 0.1 * s, 0.05 * s, 0.045 * s, skin),
          cap(x + f * 0.3 * s, y - 0.1 * s, x + f * 0.68 * s, y - 0.04 * s, 0.035 * s, 0.006 * s, skin),
          cap(x + f * 0.3 * s, y - 0.12 * s, x + f * 0.02 * s, y - 0.26 * s, 0.035 * s, 0.006 * s, crest),
        ],
        this.lighting,
        0.5,
      )
    }
  }

  // The sauropod browses one tree's crown, turns, plods over to the other tree and browses there.
  private stepSauropod(dt: number) {
    const s = this.sauropod
    s.pose = clamp(s.pose + (s.mode === "browse" ? 0.5 : -0.5) * dt, 0, 1)
    if (s.mode === "browse") {
      s.timer -= dt
      if (s.timer > 0) return
      s.mode = "turn"
      s.target = -s.face
      return
    }
    if (s.mode === "turn") {
      // It lowers its head out of the tree before turning around.
      if (s.pose > 0) return
      s.face = s.target > 0 ? Math.min(1, s.face + dt * 0.8) : Math.max(-1, s.face - dt * 0.8)
      if (s.face === s.target) s.mode = "walk"
      return
    }
    const [from, to] = this.sauropodSpots()
    const speed = 0.05 / Math.max(0.05, Math.abs(to - from))
    s.p = clamp(s.p + s.face * speed * dt, 0, 1)
    s.phase += dt * 0.05 / 0.06
    if ((s.face > 0 && s.p < 1) || (s.face < 0 && s.p > 0)) return
    s.mode = "browse"
    s.timer = rand(3, 6)
  }

  // Where the sauropod's body stands to reach into the left crown (facing left) and the right one (facing right).
  private sauropodSpots() {
    return [this.trees[0] + 0.175, this.trees[1] - 0.175]
  }

  private drawSauropod() {
    const H = this.H
    const s = this.sauropod
    const [from, to] = this.sauropodSpots()
    const bx = lerp(from, to, s.p)
    const F = 0.668
    const f = s.face
    const side = f < 0 ? -1 : 1
    const skin = this.paint(SAUROPOD)
    const dark = this.paint([SAUROPOD[0] * 0.75, SAUROPOD[1] * 0.75, SAUROPOD[2] * 0.75])
    const walking = s.mode === "walk" ? 1 : 0
    const P = (u: number, v: number): [number, number] => [(bx + u * f) * H, (F + v) * H]
    const leg = (u: number, offset: number, color: RGB) => {
      const p = (s.phase + offset) % 1
      const q = p < 0.5 ? p / 0.5 : (p - 0.5) / 0.5
      const du = walking * (p < 0.5 ? lerp(0.025, -0.025, q) : lerp(-0.025, 0.025, smoothstep(0, 1, q)))
      const lift = walking * (p < 0.5 ? 0 : Math.sin(Math.PI * q) * 0.01)
      return cap(...P(u, -0.075), ...P(u + du, -lift), 0.014 * H, 0.012 * H, color)
    }
    this.shape([leg(0.055, 0.5, dark), leg(-0.075, 0, dark)], this.lighting, 0.5)
    const browsing: [number, number] = [this.trees[side > 0 ? 1 : 0] - side * 0.035 + Math.sin(this.time * 0.4) * 0.006, (side > 0 ? 0.35 : 0.33) + Math.sin(this.time * 0.9) * 0.004]
    const shoulder = P(0.07, -0.108)
    const walkHead: [number, number] = [shoulder[0] / H + f * 0.11, shoulder[1] / H - 0.14]
    const pose = smoothstep(0, 1, s.pose)
    const head: [number, number] = [lerp(walkHead[0], browsing[0], pose) * H, lerp(walkHead[1], browsing[1], pose) * H]
    const ctrl: [number, number] = [shoulder[0] + (head[0] - shoulder[0]) * 0.1, head[1] + (shoulder[1] - head[1]) * 0.6]
    const parts: Part[] = [leg(0.075, 0, skin), leg(-0.055, 0.5, skin)]
    parts.push(ell(...P(0, -0.09), Math.max(0.035, 0.115 * Math.abs(f)) * H, 0.05 * H, -0.12 * side * Math.abs(f), skin))
    const tail = (t: number): [number, number] => {
      const sway = Math.sin(this.time * 0.5 + t * 2) * 0.01 * t
      return P(lerp(-0.08, -0.29, t), lerp(-0.095, -0.03 + sway, t) + 0.03 * Math.sin(Math.PI * t))
    }
    for (let i = 0; i < 6; i++) parts.push(cap(...tail(i / 6), ...tail((i + 1) / 6), lerp(0.03, 0.003, i / 6) * H, lerp(0.03, 0.003, (i + 1) / 6) * H, skin))
    const neck = (t: number): [number, number] => [(1 - t) ** 2 * shoulder[0] + 2 * (1 - t) * t * ctrl[0] + t * t * head[0], (1 - t) ** 2 * shoulder[1] + 2 * (1 - t) * t * ctrl[1] + t * t * head[1]]
    for (let i = 0; i < 8; i++) parts.push(cap(...neck(i / 8), ...neck((i + 1) / 8), lerp(0.028, 0.009, i / 8) * H, lerp(0.028, 0.009, (i + 1) / 8) * H, skin))
    parts.push(ell(head[0] + side * 0.008 * H, head[1], 0.017 * H, 0.0105 * H, side * 0.2, skin))
    this.shape(parts, this.lighting, 0.6)
  }

  // Now and then a T. rex stomps across the foreground, tail swaying, kicking up dust at each footfall.
  private stepRex(dt: number, cdt: number) {
    const r = this.rex
    if (r.x < -5) {
      r.next -= dt
      if (r.next > 0) return
      r.dir = Math.random() < 0.5 ? 1 : -1
      r.x = r.dir > 0 ? -0.45 : this.A + 0.45
      return
    }
    const before = r.phase
    r.x += r.dir * 0.3 * cdt
    r.phase += cdt * 1.45
    // A foot lands each time a leg starts its stance, every half cycle.
    if (Math.floor(r.phase * 2) !== Math.floor(before * 2)) {
      const foot = r.x + r.dir * 0.05
      for (let i = 0; i < 5; i++) this.dust.push({ x: foot + (Math.random() - 0.5) * 0.04, y: 0.93 - Math.random() * 0.01, vx: (Math.random() - 0.5) * 0.02, age: 0 })
    }
    if (r.x < -0.5 || r.x > this.A + 0.5) {
      r.x = -9
      r.next = rand(60, 110)
    }
  }

  private drawDust() {
    const H = this.H
    const c = this.paint([0.55, 0.45, 0.3])
    for (const d of this.dust) this.disc(d.x * H, d.y * H, (0.008 + d.age * 0.008) * H, c[0], c[1], c[2], (1 - d.age / 3) * 0.3)
  }

  private drawRex() {
    const r = this.rex
    if (r.x < -5) return
    const H = this.H
    const S = 0.3 * H
    const x = r.x * H
    const y = 0.935 * H
    const bob = Math.abs(Math.cos(r.phase * TAU)) * 0.015
    const P = (u: number, v: number): [number, number] => [x + u * r.dir * S, y + v * S]
    const skin = this.paint(REX)
    const dark = this.paint([REX[0] * 0.7, REX[1] * 0.7, REX[2] * 0.7])
    const leg = (offset: number, color: RGB): Part[] => {
      const p = (r.phase + offset) % 1
      const q = p < 0.5 ? p / 0.5 : (p - 0.5) / 0.5
      const fu = p < 0.5 ? lerp(0.17, -0.17, q) : lerp(-0.17, 0.17, smoothstep(0, 1, q))
      const lift = p < 0.5 ? 0 : Math.sin(Math.PI * q) * 0.07
      const hip: [number, number] = [0, -0.56 + bob]
      const ankle: [number, number] = [fu - 0.06, -0.13 - lift]
      const knee: [number, number] = [(hip[0] + ankle[0]) / 2 + 0.1, (hip[1] + ankle[1]) / 2]
      return [
        cap(...P(...hip), ...P(...knee), 0.11 * S, 0.06 * S, color),
        cap(...P(...knee), ...P(...ankle), 0.055 * S, 0.035 * S, color),
        cap(...P(...ankle), ...P(fu, -lift), 0.035 * S, 0.03 * S, color),
        cap(...P(fu, -lift), ...P(fu + 0.1, -lift), 0.03 * S, 0.015 * S, color),
      ]
    }
    this.shape(leg(0.5, dark), this.lighting, 0.5)
    const parts = leg(0, skin)
    const tail = (t: number): [number, number] => P(lerp(-0.18, -0.9, t), lerp(-0.62 + bob, -0.5, t) + Math.sin(r.phase * TAU + t * 2) * 0.03 * t)
    for (let i = 0; i < 6; i++) parts.push(cap(...tail(i / 6), ...tail((i + 1) / 6), lerp(0.13, 0.012, i / 6) * S, lerp(0.13, 0.012, (i + 1) / 6) * S, skin))
    const nod = Math.sin(r.phase * TAU * 2) * 0.012
    parts.push(
      ell(...P(0.04, -0.62 + bob), 0.3 * S, 0.15 * S, -0.12 * r.dir, skin),
      cap(...P(0.24, -0.68 + bob), ...P(0.38, -0.78 + bob + nod), 0.1 * S, 0.075 * S, skin),
      ell(...P(0.5, -0.8 + bob + nod), 0.15 * S, 0.075 * S, 0.06 * r.dir, skin),
      cap(...P(0.42, -0.74 + bob + nod), ...P(0.62, -0.75 + bob + nod), 0.045 * S, 0.03 * S, skin),
      cap(...P(0.27, -0.58 + bob), ...P(0.33, -0.5 + bob), 0.026 * S, 0.02 * S, skin),
      cap(...P(0.33, -0.5 + bob), ...P(0.37, -0.53 + bob), 0.018 * S, 0.008 * S, skin),
    )
    this.shape(parts, this.lighting, 0.7)
    this.shape(
      [0, 1, 2, 3].map((k) => cap(...P(-0.16 + k * 0.1, -0.76 + bob), ...P(-0.13 + k * 0.1, -0.63 + bob), 0.02 * S, 0.01 * S, dark)),
      this.lighting,
      0.2,
    )
    const eye = this.paint([0.95, 0.7, 0.1])
    this.disc(...P(0.52, -0.84 + bob + nod), 0.016 * S, eye[0], eye[1], eye[2], 1)
  }

  private stepDelorean(dt: number) {
    const d = this.delorean
    if (d.t < 0) {
      d.wait -= dt
      if (d.wait > 0) return
      d.t = 0
      d.x0 = rand(0.12, 0.3) * this.A
      return
    }
    d.t += dt
    // The trails burn on for a few seconds after it has gone.
    if (d.t < DELOREAN + 6) return
    d.t = -1
    d.wait = eggWait(true) * TIME_SCALE
  }

  // A stainless gull-wing car from the future arrives in a blue flash, drives across leaving two trails of fire, and
  // vanishes in another flash.
  private drawDelorean() {
    const H = this.H
    const d = this.delorean
    const speed = 0.05
    const x = d.x0 + speed * Math.min(d.t, DELOREAN)
    const y = 0.958
    // The trails start at the rear wheel.
    const along = Math.ceil(Math.max(0, x - 0.054 - d.x0) * H)
    for (let i = 0; i < along; i++) {
      const u = d.x0 + i / H
      const age = d.t - (u - d.x0) / speed
      const k = Math.exp(-age / 1.8) * (0.7 + 0.3 * Math.sin(i * 1.7 + this.time * 20)) * 0.9
      if (k < 0.02) continue
      for (const v of [-0.003, -0.001, 0.005, 0.007]) this.add(u * H, (y + v) * H, 1.2 * k, 0.42 * k, 0.06 * k)
    }
    for (const [at, cx] of [[0, d.x0], [DELOREAN, x]]) {
      const f = (d.t - at) / FLASH
      if (f < 0 || f > 1) continue
      const k = Math.sin(f * Math.PI)
      this.disc(cx * H, (y - 0.03) * H, (0.02 + f * 0.08) * H, 0.25 * k, 0.6 * k, 1.5 * k, 0.5 * k)
      for (let i = 0; i < 64; i++) {
        const a = (i / 64) * TAU
        const r = (0.03 + f * 0.12) * H
        this.add(cx * H + Math.cos(a) * r, (y - 0.03) * H + Math.sin(a) * r * 0.5, 0.2 * k, 0.55 * k, 1.4 * k)
      }
    }
    const appear = clamp(d.t / (FLASH * 0.5), 0, 1)
    if (d.t > DELOREAN || appear <= 0) return
    const S = 0.18 * H
    const P = (u: number, v: number) => [x * H + u * S, y * H + v * S] as const
    // Stainless steel catches the moonlight as cobalt at night rather than going gray.
    const body: RGB = this.look.stars > 50 ? [0.07, 0.11, 0.26] : this.paint([0.62, 0.64, 0.68])
    const dark = this.paint([0.1, 0.1, 0.12])
    this.polygon([P(-0.5, -0.05), P(-0.5, -0.2), P(-0.25, -0.24), P(-0.05, -0.36), P(0.15, -0.36), P(0.5, -0.17), P(0.5, -0.08), P(0.45, -0.05)], body, appear)
    this.polygon([P(-0.12, -0.23), P(-0.02, -0.33), P(0.13, -0.33), P(0.3, -0.22)], dark, appear)
    this.polygon([P(-0.5, -0.12), P(0.5, -0.12), P(0.5, -0.1), P(-0.5, -0.1)], this.paint([0.3, 0.3, 0.34]), appear)
    for (const u of [-0.3, 0.3]) this.disc(...P(u, -0.06), 0.075 * S, dark[0], dark[1], dark[2], appear)
    // The time circuits glow blue at the back, and the tail lights red.
    this.disc(...P(-0.47, -0.17), 0.03 * S, 0.25, 0.6, 1.6, appear)
    this.disc(...P(-0.49, -0.1), 0.02 * S, 1.3, 0.08, 0.05, appear * 0.8)
  }

  // Walks between random points in a zone, pausing at each to graze.
  private wander(w: Walker, dt: number, zone: [number, number, number, number], speed: number, pause: [number, number]) {
    w.phase += dt * (w.moving ? 6 : 1.5)
    if (w.rest > 0) {
      w.rest -= dt
      w.graze = Math.min(1, w.graze + dt * 0.8)
      w.moving = false
      return
    }
    w.graze = Math.max(0, w.graze - dt * 1.2)
    w.wanderT -= dt
    if (w.wanderT <= 0) {
      w.wanderT = rand(6, 14)
      w.wx = rand(zone[0], zone[1])
      w.wy = rand(zone[2], zone[3])
    }
    const dx = w.wx - w.x
    const dy = w.wy - w.y
    const d = Math.hypot(dx, dy)
    if (d < 0.01) {
      w.rest = rand(pause[0], pause[1])
      w.wanderT = 0
      return
    }
    w.moving = true
    if (Math.abs(dx) > 0.005) w.face = Math.sign(dx)
    w.x += (dx / d) * speed * dt
    w.y += (dy / d) * speed * dt
  }

  // A triceratops with its bony frill and three horns, lowering its head to crop the ferns.
  private drawTriceratops(w: Walker) {
    const H = this.H
    const S = 0.2 * H * (0.6 + (w.y - 0.7) * 2.5) * w.size
    const x = w.x * H
    const y = w.y * H
    const P = (u: number, v: number): [number, number] => [x + u * w.face * S, y + v * S]
    const swing = w.moving ? Math.sin(w.phase) * 0.06 : 0
    const skin = this.paint(TRIKE)
    const g = w.graze
    const [hu, hv] = [lerp(0.5, 0.58, g), lerp(-0.5, -0.24, g)]
    const parts: Part[] = []
    for (const [u, s] of [[0.24, 1], [0.3, -1], [-0.22, -1], [-0.28, 1]] as const) parts.push(cap(...P(u, -0.3), ...P(u + swing * s, 0), 0.07 * S, 0.06 * S, skin))
    parts.push(
      cap(...P(-0.36, -0.44), ...P(-0.68, -0.3), 0.09 * S, 0.015 * S, skin),
      ell(...P(0, -0.44), 0.42 * S, 0.24 * S, 0, skin),
      ell(...P(hu - 0.08, hv - 0.1), 0.12 * S, 0.19 * S, lerp(-0.45, -0.1, g) * w.face, this.paint([0.62, 0.34, 0.18])),
      ell(...P(hu + 0.06, hv + 0.02), 0.14 * S, 0.085 * S, lerp(0.25, 0.8, g) * w.face, skin),
      cap(...P(hu + 0.17, hv + 0.06), ...P(hu + 0.23, hv + 0.11), 0.04 * S, 0.012 * S, skin),
    )
    this.shape(parts, this.lighting, 0.7)
    const bone = this.paint(BONE)
    this.shape(
      [
        cap(...P(hu + 0.02, hv - 0.04), ...P(hu + 0.28, hv - 0.2 + g * 0.14), 0.025 * S, 0.004 * S, bone),
        cap(...P(hu + 0.06, hv - 0.03), ...P(hu + 0.31, hv - 0.15 + g * 0.14), 0.022 * S, 0.004 * S, bone),
        cap(...P(hu + 0.16, hv + 0.01), ...P(hu + 0.2, hv - 0.06), 0.02 * S, 0.004 * S, bone),
      ],
      this.lighting,
      0.5,
    )
  }

  // Dragonflies hover, then dart to a new spot over the ferns.
  private stepDragonfly(d: { x: number; y: number; tx: number; ty: number; rest: number; face: number; phase: number }, dt: number) {
    d.phase += dt
    if (d.rest > 0) {
      d.rest -= dt
      if (d.rest > 0) return
      d.tx = clamp(d.x + rand(-0.3, 0.3), 0.02, this.A - 0.02)
      d.ty = rand(0.72, 0.95)
      d.face = Math.sign(d.tx - d.x) || 1
    }
    const dx = d.tx - d.x
    const dy = d.ty - d.y
    const dist = Math.hypot(dx, dy)
    if (dist < 0.005) {
      d.rest = rand(1, 4)
      return
    }
    const step = Math.min(dist, 0.3 * dt)
    d.x += (dx / dist) * step
    d.y += (dy / dist) * step
  }

  private drawDragonfly(d: { x: number; y: number; rest: number; face: number; phase: number }) {
    const H = this.H
    const s = 0.045 * H
    const x = d.x * H
    const y = (d.y + Math.sin(d.phase * 3 + d.x * 10) * 0.004) * H
    const f = d.face
    const wing = this.paint([0.6, 0.85, 0.9])
    const shimmer = 0.3 + 0.15 * Math.sin(this.time * 8 + d.x * 30)
    this.ellipse(x + f * 0.1 * s, y - 0.12 * s, 0.32 * s, 0.07 * s, wing[0], wing[1], wing[2], shimmer)
    this.ellipse(x - f * 0.08 * s, y - 0.08 * s, 0.28 * s, 0.06 * s, wing[0], wing[1], wing[2], shimmer)
    this.shape([cap(x - f * 0.55 * s, y + 0.02 * s, x + f * 0.3 * s, y, 0.025 * s, 0.05 * s, this.paint([0.1, 0.55, 0.6])), ell(x + f * 0.36 * s, y, 0.07 * s, 0.07 * s, 0, this.paint([0.15, 0.4, 0.75]))], this.lighting, 0.5)
  }

  // Something long-necked lives in the lake: now and then it surfaces, looks around and slips back under.
  private stepNessie(dt: number) {
    const n = this.nessie
    if (n.t < 0) {
      n.wait -= dt
      if (n.wait > 0) return
      const [cx, cy, rx, ry] = this.lake()
      n.t = 0
      n.x = cx + rand(-0.6, 0.6) * rx
      n.y = cy + rand(-0.2, 0.4) * ry
      n.dir = Math.random() < 0.5 ? 1 : -1
      return
    }
    n.t += dt / 3
    if (n.t < 1) return
    n.t = -1
    n.wait = rand(2, 5)
  }

  private drawNessie() {
    const n = this.nessie
    if (n.t < 0) return
    const { H, look } = this
    const e = smoothstep(0, 0.15, n.t) * (1 - smoothstep(0.85, 1, n.t))
    // Ripples spread from where the neck meets the water.
    for (let k = 0; k < 3; k++) {
      const r = (this.time * 0.25 + k / 3) % 1
      const rx = (0.012 + r * 0.05) * H
      const a = (1 - r) * e * 0.35
      for (let i = 0; i < 48; i++) {
        const t = (i / 48) * TAU
        this.add(n.x * H + Math.cos(t) * rx, n.y * H + Math.sin(t) * rx * 0.2, look.ripple[0] * a, look.ripple[1] * a, look.ripple[2] * a)
      }
    }
    const skin = this.paint([0.3, 0.4, 0.36])
    const base: [number, number] = [n.x * H, n.y * H]
    const look2 = Math.sin(n.t * TAU * 1.5) * 0.02
    const head: [number, number] = [(n.x + n.dir * 0.045 + look2) * H, (n.y - 0.11 * e) * H]
    const ctrl: [number, number] = [base[0] - n.dir * 0.01 * H, (n.y - 0.09 * e) * H]
    const neck = (t: number): [number, number] => [(1 - t) ** 2 * base[0] + 2 * (1 - t) * t * ctrl[0] + t * t * head[0], (1 - t) ** 2 * base[1] + 2 * (1 - t) * t * ctrl[1] + t * t * head[1]]
    const parts: Part[] = [ell(base[0] - n.dir * 0.035 * H, base[1], 0.03 * H, 0.007 * H * e + 0.5, 0, skin)]
    for (let i = 0; i < 6; i++) parts.push(cap(...neck(i / 6), ...neck((i + 1) / 6), lerp(0.011, 0.006, i / 6) * H * e, lerp(0.011, 0.006, (i + 1) / 6) * H * e, skin))
    parts.push(ell(head[0] + n.dir * 0.008 * H, head[1], 0.014 * H * e, 0.008 * H * e, n.dir * 0.15, skin))
    this.shape(parts, this.lighting, 0.6)
  }
}

// Sends slow pulses of heat down the lava streams: each pixel brightens as a pulse passes its height on the flow.
function flowLava(hdr: Float32Array, index: Int32Array, k: Float32Array, along: Float32Array, time: number, r: number, g: number, b: number) {
  for (let j = 0; j < index.length; j++) {
    const p = 0.5 + 0.5 * Math.sin(along[j] * 90 - time * 2)
    const a = p * p * p * k[j] * 0.45
    const o = index[j] * 3
    hdr[o] += r * a
    hdr[o + 1] += g * a
    hdr[o + 2] += b * a
  }
}

export const prehistoric: Wallpaper = {
  id: "prehistoric",
  name: "Prehistoric",
  description: "A smoking volcano over ferns and cycads, with a T. rex stomping by now and then",
  activity: {
    calm: "Volcano, smoke, ferns and cycads",
    lively: "Adds a browsing sauropod and circling pterosaurs",
    teeming: "Adds a triceratops herd, dragonflies and a lake with something in it",
  },
  scrim: {
    day: [
      [20, 40, 70],
      [26, 40, 22],
      [14, 28, 10],
    ],
    sunset: [
      [30, 14, 26],
      [36, 16, 16],
      [10, 6, 6],
    ],
    night: [
      [4, 6, 16],
      [8, 4, 12],
      [2, 4, 6],
    ],
  },
  create: (settings) => new Prehistoric(settings),
}
