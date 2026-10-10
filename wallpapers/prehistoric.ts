import { Canvas, blade, cap, ell, type Lighting, type Part } from "../src/canvas"
import { bob, body, chain, gait, limb, quadruped, stepGait, stride, type Gait } from "../src/creature"
import { eggWait } from "../src/egg"
import { haze, mottle } from "../src/grade"
import { bird, flyAway, startle, type Flier } from "../src/flock"
import { lightPool } from "../src/light"
import { TAU, clamp, fbm1, hash, hash2, lerp, rand, smoothstep, type RGB } from "../src/math"
import { groundShadow, sunShade, type Shade } from "../src/shadow"
import { driftClouds, makeClouds, makeShadows, makeStars, makeStorm, paintClouds, paintShadows, paintSky, paintStars, paintStorm, type Cloud, type Orb, type Star } from "../src/sky"
import type { Activity, Settings, Time, Wallpaper } from "../src/wallpaper"
import { reflect } from "../src/water"
import { WeatherLayer } from "../src/weather"
import { SwayLayer, gust, sway } from "../src/wind"

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
  clouds: { top: RGB; bottom: RGB; alpha: number }
  ridge: RGB
  forest: RGB
  ground: [far: RGB, near: RGB]
  rock: RGB
  lava: [red: RGB, orange: RGB]
  glow: number
  smoke: [hot: RGB, cool: RGB, alpha: number]
  water: RGB
  // The tint of what the lake mirrors.
  mirror: RGB
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
    clouds: { top: [1.1, 1.1, 1.05], bottom: [0.62, 0.66, 0.74], alpha: 0.85 },
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
    mirror: [0.78, 0.88, 0.92],
    ripple: [0.55, 0.7, 0.75],
    tint: [1, 1, 1],
  },
  sunset: {
    style: "rim",
    // Ash: a smoky gray-brown sky over a deep red haze, and a sun dimmed to a dull red disc.
    light: [1, 0.3, 0.12],
    sky: [
      [0, [0.045, 0.04, 0.04]],
      [0.25, [0.11, 0.075, 0.065]],
      [0.45, [0.26, 0.06, 0.045]],
      [HORIZON, [0.58, 0.1, 0.05]],
    ],
    orb: { x: 0.2, y: 0.36, r: 0.07, core: [1.25, 0.32, 0.12], glow: [0.9, 0.22, 0.08], near: 0.3, wide: 0.3 },
    stars: 0,
    clouds: { top: [0.08, 0.06, 0.06], bottom: [0.36, 0.13, 0.08], alpha: 0.7 },
    ridge: [0.2, 0.07, 0.05],
    forest: [0.05, 0.025, 0.02],
    ground: [
      [0.22, 0.07, 0.04],
      [0.07, 0.03, 0.02],
    ],
    rock: [0.1, 0.05, 0.045],
    lava: [
      [1.1, 0.12, 0.02],
      [2, 0.55, 0.04],
    ],
    glow: 0.35,
    smoke: [[0.8, 0.2, 0.06], [0.1, 0.07, 0.07], 0.65],
    water: [0.42, 0.12, 0.06],
    mirror: [0.9, 0.78, 0.72],
    ripple: [1, 0.3, 0.1],
    tint: [0.2, 0.1, 0.08],
  },
  night: {
    style: "rim",
    light: [0.3, 0.62, 1.5],
    sky: [
      [0, [0.004, 0.008, 0.03]],
      [0.3, [0.014, 0.024, 0.07]],
      [0.5, [0.035, 0.055, 0.14]],
      [HORIZON, [0.07, 0.1, 0.24]],
    ],
    orb: { x: 0.18, y: 0.15, r: 0.03, core: [1, 0.72, 0.3], glow: [0.45, 0.3, 0.12], near: 0.2, wide: 0.08, moon: true },
    stars: 140,
    clouds: { top: [0.015, 0.02, 0.05], bottom: [0.06, 0.1, 0.3], alpha: 0.7 },
    ridge: [0.02, 0.03, 0.08],
    forest: [0.006, 0.012, 0.028],
    ground: [
      [0.035, 0.06, 0.13],
      [0.012, 0.022, 0.05],
    ],
    rock: [0.02, 0.018, 0.045],
    lava: [
      [1.3, 0.1, 0.02],
      [2.2, 0.55, 0.03],
    ],
    glow: 0.5,
    smoke: [[0.8, 0.12, 0.03], [0.1, 0.025, 0.07], 0.6],
    water: [0.02, 0.04, 0.1],
    mirror: [0.8, 0.88, 1],
    ripple: [0.1, 0.35, 0.9],
    tint: [0.02, 0.032, 0.075],
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
  g: Gait
}

class Prehistoric extends Canvas {
  private time = 0
  private creatureTime = 0
  private readonly activity: Activity
  private readonly look: Look
  private readonly night: boolean
  private lighting: Lighting = { style: "front", dir: DAYLIGHT }
  private readonly shade: Shade
  private background = new Float32Array(0)
  private allStars: Star[]
  private stars: Star[] = []
  private clouds: Cloud[]
  // Ash clouds drift off downwind from the top of the plume.
  private ash = makeClouds(3, "ash", 0.04, 0.11)
  private shadows = makeShadows(3, HORIZON + 0.06, 0.95)
  private smoke = Array.from({ length: SMOKE_PUFFS }, (_, i) => ({ age: (i / SMOKE_PUFFS) * SMOKE_LIFE, seed: Math.random() * 100 }))
  // Lava pixels (hdr index, strength, height down the flow) that pulse each frame.
  private lava = { index: new Int32Array(0), k: new Float32Array(0), along: new Float32Array(0) }
  private trees: [number, number] = [0, 0]
  // The far ferns and cycads, painted once, bend as the gusts pass.
  private plants = new SwayLayer()
  private rex = { x: -9, dir: 1, next: 2, phase: 0 }
  private dust: { x: number; y: number; vx: number; age: number }[] = []
  // p runs from browsing the left tree (0) to browsing the right one (1).
  private sauropod = { p: 0, face: -1, target: -1, mode: "browse" as "browse" | "turn" | "walk", timer: rand(4.5, 6), g: gait(-1), pose: 1 }
  private herd: Walker[] = []
  private dragonflies: { x: number; y: number; tx: number; ty: number; rest: number; face: number; phase: number }[] = []
  private nessie = { t: -1, x: 0, y: 0, dir: 1, wait: 1 }
  // The lake's rows: which row each mirrors, how far its ripples wobble the reflection, and how much of it each pixel
  // shows (none outside the water or under the plants in front of it).
  private pool = { y0: 0, y1: 0, rows: new Float32Array(0), amp: new Float32Array(0), gloss: new Float32Array(0) }
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
    this.night = settings.time === "night"
    this.weather = new WeatherLayer(settings.weather ?? "clear", settings.time, HORIZON)
    this.shade = sunShade(settings.time, this.look.orb, this.weather.covered)
    this.allStars = makeStars(this.look.stars, 0.5)
    this.clouds = makeClouds(3, "cumulus", 0.06, 0.28)
    if (settings.activity !== "teeming") return
    const walker = (x: number, y: number, size: number): Walker => ({ x, y, wx: x, wy: y, wanderT: 0, face: 1, phase: Math.random() * TAU, graze: 0, rest: 0, moving: false, size, g: gait(1, hash(x * 7 + y)) })
    this.herd = [walker(0.3, 0.8, 1), walker(0.55, 0.84, 1.1), walker(0.42, 0.82, 0.65)]
    this.dragonflies = Array.from({ length: 4 }, () => ({ x: Math.random() * 1.5, y: rand(0.75, 0.95), tx: 0, ty: 0, rest: rand(0, 3), face: 1, phase: Math.random() * TAU }))
  }

  step(dt: number) {
    dt = clamp(dt, 0, 0.1) * TIME_SCALE
    this.time += dt
    const cdt = dt * CREATURE_SPEED
    this.creatureTime += cdt
    driftClouds(this.clouds, this.A, dt)
    driftClouds(this.shadows, this.A, dt)
    driftClouds(this.storm, this.A, dt)
    for (const c of this.ash) {
      c.x += c.speed * dt
      if (c.x > this.A + c.w) c.x = this.plumeTop()
    }
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
    for (const w of this.herd) {
      const [x0, y0] = [w.x, w.y]
      this.wander(w, cdt, [0.08 * A, 0.45 * A, 0.78, 0.87], 0.03, [6, 14])
      stepGait(w.g, Math.hypot(w.x - x0, w.y - y0) / (0.13 * (0.6 + (w.y - 0.7) * 2.5) * w.size), cdt, w.face)
    }
    for (const d of this.dragonflies) this.stepDragonfly(d, cdt)
    this.stepNessie(cdt)
  }

  render() {
    this.hdr.set(this.background)
    this.plants.draw(this.hdr, this.W, this.H, this.time)
    if (!this.weather.covered) paintStars(this.hdr, this.W, this.H, this.stars, this.time, 0.5, this.look.stars > 50 ? 0.5 : 0.3)
    const orange = this.look.lava[1]
    flowLava(this.hdr, this.lava.index, this.lava.k, this.lava.along, this.time, orange[0], orange[1], orange[2])
    const [top, bottom] = this.weather.scud ?? [this.look.clouds.top, this.look.clouds.bottom]
    const orb = this.weather.covered ? undefined : this.look.orb
    paintClouds(this.hdr, this.W, this.H, this.clouds, top, bottom, this.look.clouds.alpha, orb)
    paintShadows(this.hdr, this.W, this.H, this.shadows, HORIZON + 0.02, orb)
    paintStorm(this.hdr, this.W, this.H, this.storm, this.look.clouds.top, this.look.clouds.bottom, this.gloom)
    // Ash takes the plume's cooled color, warmed underneath by the lava, and fades in as it leaves the plume.
    const [hot, cool, alpha] = this.look.smoke
    const start = this.plumeTop()
    for (const c of this.ash) paintClouds(this.hdr, this.W, this.H, [c], [cool[0] * 1.15, cool[1] * 1.15, cool[2] * 1.15], [lerp(cool[0], hot[0], 0.3) * 0.7, lerp(cool[1], hot[1], 0.3) * 0.7, lerp(cool[2], hot[2], 0.3) * 0.7], alpha * 1.3 * smoothstep(start, start + 0.25, c.x), orb)
    this.drawShadows()
    this.drawSmoke()
    const p = this.pool
    if (p.y1 > p.y0) reflect(this.hdr, this.W, this.H, p.y0, p.y1, p.rows, p.amp, p.gloss, this.look.mirror, this.time)
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
    // At night the lava lights the ground, the lake and anything walking near the volcano's foot.
    if (this.night) lightPool(this.hdr, this.W, this.H, (VENT_X * A + 0.08) * this.H, 0.63 * this.H, 0.45 * this.H, 0.13 * this.H, [1, 0.36, 0.06], 2.4 + 0.4 * Math.sin(this.time * 0.6), 0.03)
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
    for (const [i, c] of this.ash.entries()) c.x = lerp(this.plumeTop(), A + c.w, (i + 0.3) / this.ash.length)
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
      // Blades are a pixel-fine texture, which terminal cells would turn into diagonal hatching.
      const blades = this.cells ? 0.95 : 0.9 + 0.1 * Math.sin(x * 1.7 + y * 0.6 + fbm1(x * 0.1, 2) * 6) + (hash2(x, y) - 0.5) * 0.05
      return this.rim([lerp(far[0], near[0], depth) * blades, lerp(far[1], near[1], depth) * blades, lerp(far[2], near[2], depth) * blades], x, d, 2)
    })
    if (day) {
      mottle(this.hdr, W, H, 0.62, 1, 0.55, [1.16, 1.04, 0.66], [0.68, 0.84, 0.72])
      haze(this.hdr, sky, W, H, 0.62, 0.8, 0.14, 0, 0.56)
    }
    this.pool = { y0: 0, y1: 0, rows: new Float32Array(0), amp: new Float32Array(0), gloss: new Float32Array(0) }
    if (this.activity === "teeming") this.paintLake()
    const water = this.hdr.slice(this.pool.y0 * W * 3, this.pool.y1 * W * 3)
    this.trees = [0.08 * A, Math.max(0.4 * A, 0.08 * A + 0.45)]
    const ground = (x: number, y: number, w: number, h: number, tip?: number) => groundShadow(this.hdr, W, H, this.shade, x * H, y * H, w * H, h * H, tip)
    for (const [x, base, top] of [[this.trees[0], 0.665, 0.29], [this.trees[1], 0.662, 0.31], [0.93 * A, 0.64, 0.45]]) ground(x, base, 0.08, base - top, 1.5)
    for (const [x, y, s] of [[0.32, 0.78, 0.07], [0.88, 0.74, 0.08], [0.48, 0.9, 0.08]]) ground(x * A, y, s * 1.4, s * 0.8, 1.2)
    for (const [x, y, s] of [[0.04, 0.86, 0.09], [0.47, 0.835, 0.07], [0.9, 0.84, 0.1]]) ground(x * A, y, s * 1.4, s * 1.1, 1.5)
    this.drawTree(this.trees[0], 0.665, 0.29)
    this.drawTree(this.trees[1], 0.662, 0.31)
    this.drawTree(0.93 * A, 0.64, 0.45)
    this.plants.begin(this.hdr)
    const ferns = [
      [0.32, 0.78, 0.07],
      [0.88, 0.74, 0.08],
      [0.48, 0.9, 0.08],
    ]
    for (const [i, [x, y, s]] of ferns.entries()) this.drawFern(x * A, y, s, i + 7, false)
    const cycads = [
      [0.04, 0.86, 0.09],
      [0.47, 0.835, 0.07],
      [0.9, 0.84, 0.1],
    ]
    for (const [x, base, size] of cycads) this.drawCycad(x * A, base, size)
    // Each plant bends from its base, the cycads' wide crowns over a wider reach.
    const reach = [...ferns.map(([x, y, s]) => [x * A, y, s, s * 1.2]), ...cycads.map(([x, y, s]) => [x * A, y, s, s * 2.2])]
    this.plants.end(this.hdr, W, H, 0.01 * H, (px, py) => reach.reduce((w, [x, y, s, r]) => (Math.abs(px / H - x) < r ? Math.max(w, clamp((y - py / H) / (s * 1.2), 0, 1)) : w), 0))
    // Plants painted over the water stay in front of its reflection.
    const p = this.pool
    const o = p.y0 * W * 3
    for (let i = 0; i < p.gloss.length; i++) if (this.hdr[o + i * 3] !== water[i * 3] || this.hdr[o + i * 3 + 1] !== water[i * 3 + 1] || this.hdr[o + i * 3 + 2] !== water[i * 3 + 2]) p.gloss[i] = 0
    this.background = this.hdr.slice()
  }

  // Shadows under everything that walks or drives, drawn before any of it so none falls across another animal.
  private drawShadows() {
    const H = this.H
    const ground = (x: number, y: number, w: number, h: number, tip?: number) => groundShadow(this.hdr, this.W, H, this.shade, x * H, y * H, w * H, h * H, tip)
    if (this.activity !== "calm") {
      const s = this.sauropod
      const [from, to] = this.sauropodSpots()
      ground(lerp(from, to, s.p) - s.face * 0.06, 0.668, 0.28, 0.13, 0.8)
    }
    for (const w of this.herd) {
      const S = 0.2 * (0.6 + (w.y - 0.7) * 2.5) * w.size
      ground(w.x + w.face * 0.04 * S, w.y, 1.0 * S, 0.55 * S, 0.8)
    }
    const r = this.rex
    if (r.x > -5) ground(r.x - r.dir * 0.03, 0.935, 0.24, 0.24, 0.8)
    const d = this.delorean
    if (d.t >= 0 && d.t <= DELOREAN) ground(d.x0 + 0.05 * Math.min(d.t, DELOREAN), 0.958, 0.18, 0.065, 0.9)
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

  // A lake in front of the volcano with a muddy shore. Its water mirrors the forest, the volcano and the sky above it,
  // squeezed into the lake's depth, and render() puts the reflection in each frame so the lava and smoke move in it.
  private paintLake() {
    const { W, H, A, look } = this
    const [lx, ly, lrx, lry] = this.lake()
    const [cx, cy, rx, ry] = [lx * H, ly * H, lrx * H, lry * H]
    const red = look.lava[0]
    const mud = this.paint([0.3, 0.24, 0.15])
    const y0 = Math.max(0, Math.floor(cy - ry - 2))
    const y1 = Math.min(H, Math.ceil(cy + ry + 3))
    const gloss = new Float32Array((y1 - y0) * W)
    for (let y = y0; y < y1; y++)
      for (let x = Math.max(0, Math.floor(cx - rx - 3)); x < Math.min(W, cx + rx + 3); x++) {
        const q = Math.hypot((x + 0.5 - cx) / rx, (y + 0.5 - cy) / ry)
        const shore = clamp((1.12 - q) * 6, 0, 1)
        if (shore <= 0) continue
        const o = (y * W + x) * 3
        this.blend(o, mud[0], mud[1], mud[2], shore * 0.8)
        const wet = clamp((1 - q) * Math.min(rx, ry) * 0.5 + 0.5, 0, 1)
        if (wet <= 0) continue
        this.blend(o, look.water[0], look.water[1], look.water[2], wet)
        gloss[(y - y0) * W + x] = wet * (0.72 + 0.06 * Math.sin(y * 2.1 + x * 0.05))
        // The volcano's glow shimmers on the water below it.
        const sheen = look.glow * 0.25 * Math.exp(-Math.abs(x / H - VENT_X * A) / 0.1) * wet * (0.7 + 0.3 * Math.sin(y * 2.7))
        this.hdr[o] += red[0] * sheen
        this.hdr[o + 1] += red[1] * sheen
        this.hdr[o + 2] += red[2] * sheen
      }
    // The far shore mirrors the forest's edge, and the near one the volcano's crater, squeezed more toward it.
    const far = cy - ry
    const n = y1 - y0
    const below = (r: number) => Math.max(0, y0 + r - far)
    this.pool = {
      y0,
      y1,
      rows: Float32Array.from({ length: n }, (_, r) => (HORIZON - 0.004) * H - below(r) * (1.5 + (3.2 * below(r)) / (2 * ry))),
      amp: new Float32Array(n).fill(0.8 * (H / 180)),
      gloss,
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
      const spine: [number, number][] = [[px, py]]
      const widths = [1]
      let angle = a
      for (let s = 0; s < 6; s++) {
        angle += Math.cos(a) > 0 ? 0.05 : -0.05
        const nx = px + Math.cos(angle) * (len / 6)
        const ny = py + Math.sin(angle) * (len / 6) + s * 0.0015 * H
        parts.push(cap(px, py, nx, ny, this.thick(0.004), this.thick(0.003), frond))
        const leaf = (1 - s / 8) * size * 0.4 * H
        spine.push([nx, ny])
        widths.push(leaf * 0.45)
        if (!this.cells) for (const side of [-1, 1]) parts.push(cap(nx, ny, nx + Math.cos(angle + side * 0.8) * leaf, ny + Math.sin(angle + side * 0.8) * leaf, 0.004 * H, 0.0012 * H, frond))
        ;[px, py] = [nx, ny]
      }
      if (this.cells) parts.push(...blade(spine, widths, frond))
      // On terminal cells rim light would outline every frond in scribbles; they stay near-silhouettes there.
      this.shape(parts, this.lighting, this.look.style === "rim" ? (this.cells ? 0.18 : 0.3) : 0.6)
    }
    this.shape([ell(x * H, (top - 0.008) * H, size * 0.12 * H, size * 0.16 * H, 0, this.paint([0.7, 0.5, 0.2]), 3)], this.lighting, 0.6)
  }

  // A clump of fern fronds arching out and drooping at the tips; the front clumps sway in the breeze.
  private drawFern(x: number, y: number, size: number, seed: number, swaying: boolean) {
    const H = this.H
    const fern = this.paint(FERN)
    for (let i = 0; i < 7; i++) {
      const base = -Math.PI / 2 + ((i / 6) * 2 - 1) * 1.15 + (hash(seed * 5 + i) - 0.5) * 0.2
      // Turned whichever way carries the tip downwind.
      const bend = swaying ? sway(x, this.time, i * 1.3 + seed * 2) * 0.05 * (Math.sin(base) > 0 ? -1 : 1) : 0
      const len = size * (0.75 + hash(seed * 7 + i) * 0.35) * H
      const parts: Part[] = []
      let [px, py] = [x * H, y * H]
      const spine: [number, number][] = [[px, py]]
      const widths = [1]
      let angle = base + bend
      for (let s = 0; s < 7; s++) {
        const q = s / 7
        angle += (Math.cos(base) >= 0 ? 1 : -1) * 0.1 * (0.4 + Math.abs(Math.cos(base))) + bend * 0.3
        const nx = px + Math.cos(angle) * (len / 7)
        const ny = py + Math.sin(angle) * (len / 7)
        parts.push(cap(px, py, nx, ny, this.thick(lerp(0.004, 0.0012, q)), this.thick(lerp(0.004, 0.0012, q + 1 / 7), 0.7), fern))
        const leaf = Math.sin(Math.PI * (0.25 + q * 0.75)) * size * 0.22 * H
        spine.push([nx, ny])
        widths.push(leaf * 0.55)
        if (!this.cells) for (const side of [-1, 1]) parts.push(cap(nx, ny, nx + Math.cos(angle + side * 1.15) * leaf, ny + Math.sin(angle + side * 1.15) * leaf, 0.0045 * H, 0.001 * H, fern))
        ;[px, py] = [nx, ny]
      }
      if (this.cells) parts.push(...blade(spine, widths, fern))
      // On terminal cells rim light would outline every frond in scribbles; they stay near-silhouettes there.
      this.shape(parts, this.lighting, this.look.style === "rim" ? (this.cells ? 0.18 : 0.3) : 0.6)
    }
  }

  // Where the plume levels off and its smoke starts to drift away as ash, in screen heights.
  private plumeTop() {
    return VENT_X * this.A + 0.08
  }

  // Smoke billows up from the crater and leans downwind, lit from below by the lava when it is fresh.
  private drawSmoke() {
    const { A, H, look } = this
    const [hot, cool, alpha] = look.smoke
    // A passing gust bends the plume further over.
    const blown = 0.0025 * gust(VENT_X * A, this.time)
    for (const s of this.smoke) {
      const t = s.age
      const x = (VENT_X * A + (hash(s.seed) - 0.5) * 0.02 + 0.002 * t + 0.0009 * t * t + 0.006 * Math.sin(t * 0.7 + s.seed) + blown * t) * H
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
    stepGait(s.g, s.mode === "walk" ? (0.05 * dt) / 0.06 : 0, dt, s.face)
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
    const g = s.g
    const [from, to] = this.sauropodSpots()
    const side = s.face < 0 ? -1 : 1
    const rise = bob(g.phase) * g.go * 0.004
    const P = body(lerp(from, to, s.p) * H, 0.668 * H, H, s.face)
    const skin = this.paint(SAUROPOD)
    const legs = { fore: 0.07, hind: 0.06, top: 0.085 - rise, w: 0.022, a: 0.038, b: 0.037, reach: 0.018, lift: 0.012, r: [0.02, 0.016, 0.015] as [number, number, number] }
    this.shape(quadruped(P, g, true, { ...legs, color: this.paint([SAUROPOD[0] * 0.75, SAUROPOD[1] * 0.75, SAUROPOD[2] * 0.75]) }), this.lighting, 0.5)
    const browsing: [number, number] = [this.trees[side > 0 ? 1 : 0] - side * 0.035 + Math.sin(this.time * 0.4) * 0.006, (side > 0 ? 0.35 : 0.33) + Math.sin(this.time * 0.9) * 0.004]
    const shoulder = P(0.07, -0.11 - rise)
    // Walking, the head rides ahead of the shoulders, nodding a beat behind each step.
    const walkHead = P(0.18, -0.25 - rise + Math.cos(TAU * 2 * g.phase - 1.5) * 0.004 * g.go)
    const pose = smoothstep(0, 1, s.pose)
    const head: [number, number] = [lerp(walkHead[0], browsing[0] * H, pose), lerp(walkHead[1], browsing[1] * H, pose)]
    const ctrl: [number, number] = [shoulder[0] + (head[0] - shoulder[0]) * 0.1, head[1] + (shoulder[1] - head[1]) * 0.6]
    const neck = (t: number): [number, number] => [(1 - t) ** 2 * shoulder[0] + 2 * (1 - t) * t * ctrl[0] + t * t * head[0], (1 - t) ** 2 * shoulder[1] + 2 * (1 - t) * t * ctrl[1] + t * t * head[1]]
    // The tail trails a turn and sways a beat behind the steps.
    const tail = (t: number) => P(lerp(-0.08, -0.29, t), lerp(-0.097 - rise, -0.03, t) + 0.03 * Math.sin(Math.PI * t) + (Math.sin(this.time * 0.5 + t * 2) * 0.01 + Math.sin(TAU * 2 * g.phase - t * 2) * 0.006 * g.go) * t, -g.lag * 0.06 * t * t)
    this.shape(
      [
        ...quadruped(P, g, false, { ...legs, color: skin }),
        ell(...P(0, -0.092 - rise), P.len(0.115, 0.04), 0.05 * H, -0.12 * P.along, skin),
        ...chain(tail, 6, 0.03 * H, 0.003 * H, skin),
        ...chain(neck, 8, 0.028 * H, 0.009 * H, skin),
        ell(head[0] + side * 0.008 * H, head[1], 0.017 * H, 0.0105 * H, side * 0.2, skin),
      ],
      this.lighting,
      0.6,
    )
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
    const P = body(r.x * H, 0.935 * H, 0.3 * H, r.dir)
    const S = P.S
    const rise = bob(r.phase, 0.55) * 0.02
    const skin = this.paint(REX)
    const dark = this.paint([REX[0] * 0.7, REX[1] * 0.7, REX[2] * 0.7])
    // A bird-like leg: a heavy thigh, the knee forward, a long shin back to the ankle, then the foot to splayed toes.
    const leg = (offset: number, color: RGB): Part[] => {
      const [reach, lift] = stride(r.phase, offset, 0.55)
      const fu = reach * 0.19
      const fv = -lift * 0.08
      const ankle: [number, number] = [fu - 0.08, fv - 0.13]
      return [
        ...limb(P, 0, -0.57 - rise, ...ankle, 0.25, 0.27, -1, 0.14 * S, 0.065 * S, 0.04 * S, color),
        cap(...P(...ankle), ...P(fu + 0.01, fv - 0.025), 0.04 * S, 0.03 * S, color),
        cap(...P(fu - 0.01, fv - 0.022), ...P(fu + 0.12, fv - 0.012 - lift * 0.03), 0.032 * S, 0.012 * S, color),
      ]
    }
    this.shape(leg(0.5, dark), this.lighting, 0.5)
    const nod = Math.cos(TAU * 2 * r.phase - 1.2) * 0.015
    const jaw = Math.max(0, Math.sin(this.creatureTime * 0.9 + 1)) ** 8 * 0.05
    // The tail counterbalances the head and swings a beat behind each step.
    const tail = (t: number) => P(lerp(-0.16, -0.95, t), lerp(-0.66 - rise, -0.57, t) - 0.04 * Math.sin(Math.PI * t) + Math.sin(TAU * 2 * r.phase - 1 - t * 2.5) * 0.03 * t)
    const [hu, hv] = [0.47, -0.84 - rise + nod]
    this.shape(
      [
        ...leg(0, skin),
        ...chain(tail, 7, 0.14 * S, 0.012 * S, skin),
        ell(...P(0.04, -0.64 - rise), 0.29 * S, 0.15 * S, 0.12 * r.dir, skin),
        ell(...P(0.2, -0.62 - rise), 0.13 * S, 0.14 * S, 0, skin),
        cap(...P(0.24, -0.7 - rise), ...P(hu - 0.07, hv + 0.02), 0.11 * S, 0.075 * S, skin),
        ell(...P(hu, hv), 0.12 * S, 0.075 * S, 0.1 * r.dir, skin),
        cap(...P(hu + 0.04, hv - 0.01), ...P(hu + 0.19, hv + 0.025), 0.065 * S, 0.042 * S, skin),
        cap(...P(hu - 0.02, hv + 0.05), ...P(hu + 0.16, hv + 0.06 + jaw), 0.05 * S, 0.026 * S, skin),
        ...limb(P, 0.27, -0.6 - rise, 0.35, -0.53 - rise + nod * 0.5, 0.07, 0.07, 1, 0.026 * S, 0.02 * S, 0.014 * S, skin),
      ],
      this.lighting,
      0.7,
    )
    this.shape(
      [0, 1, 2, 3].map((k) => cap(...P(-0.16 + k * 0.1, -0.77 - rise), ...P(-0.13 + k * 0.1, -0.64 - rise), 0.02 * S, 0.01 * S, dark)),
      this.lighting,
      0.2,
    )
    const eye = this.paint([0.95, 0.7, 0.1])
    this.disc(...P(hu + 0.05, hv - 0.035), 0.016 * S, eye[0], eye[1], eye[2], 1)
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

  // A triceratops with its bony frill and three horns, plodding on stout legs and lowering its head to crop the ferns.
  private drawTriceratops(w: Walker) {
    const H = this.H
    const g = w.g
    const P = body(w.x * H, w.y * H, 0.27 * H * (0.6 + (w.y - 0.7) * 2.5) * w.size, g.turn)
    const S = P.S
    const skin = this.paint(TRIKE)
    const rise = bob(g.phase) * g.go * 0.012
    const legs = { fore: 0.24, hind: 0.24, top: 0.32 - rise, w: 0.11, a: 0.17, b: 0.16, reach: 0.15, lift: 0.07, r: [0.1, 0.065, 0.055] as [number, number, number], paw: [0.03, this.paint([0.4, 0.33, 0.21])] as [number, RGB] }
    this.shape(quadruped(P, g, true, { ...legs, color: this.paint([TRIKE[0] * 0.75, TRIKE[1] * 0.75, TRIKE[2] * 0.75]) }), this.lighting, 0.7)
    const gz = smoothstep(0, 1, w.graze)
    const nod = Math.cos(TAU * 2 * g.phase - 1) * 0.02 * g.go
    const [hu, hv] = [lerp(0.48, 0.56, gz), lerp(-0.44, -0.22, gz) + nod - rise]
    const tail = (t: number) => P(lerp(-0.26, -0.74, t), lerp(-0.48 - rise, -0.3, t) + Math.sin(TAU * 2 * g.phase - t * 2) * 0.025 * t * g.go, -g.lag * 0.08 * t * t)
    this.shape(
      [
        ...quadruped(P, g, false, { ...legs, color: skin }),
        ...chain(tail, 5, 0.15 * S, 0.015 * S, skin),
        ell(...P(-0.02, -0.46 - rise), P.len(0.4, 0.2), 0.23 * S, 0.08 * P.along, skin),
        ell(...P(hu - 0.08, hv - 0.1), P.len(0.11, 0.18), 0.19 * S, lerp(-0.45, -0.1, gz) * P.along, this.paint([0.62, 0.34, 0.18])),
        cap(...P(hu - 0.02, hv - 0.02), ...P(hu + 0.19, hv + 0.07), 0.1 * S, 0.045 * S, skin),
        cap(...P(hu + 0.17, hv + 0.06), ...P(hu + 0.23, hv + 0.12), 0.04 * S, 0.012 * S, this.paint([0.3, 0.25, 0.17])),
      ],
      this.lighting,
      0.7,
    )
    const bone = this.paint(BONE)
    this.shape(
      [
        cap(...P(hu + 0.02, hv - 0.06), ...P(hu + 0.28, hv - 0.22 + gz * 0.14), 0.026 * S, 0.004 * S, bone),
        cap(...P(hu + 0.05, hv - 0.05, 0.05), ...P(hu + 0.31, hv - 0.17 + gz * 0.14, 0.08), 0.022 * S, 0.004 * S, bone),
        cap(...P(hu + 0.15, hv + 0.01), ...P(hu + 0.19, hv - 0.07), 0.022 * S, 0.004 * S, bone),
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
      [18, 14, 14],
      [34, 12, 8],
      [12, 6, 5],
    ],
    night: [
      [4, 6, 16],
      [8, 4, 12],
      [2, 4, 6],
    ],
  },
  create: (settings) => new Prehistoric(settings),
}
