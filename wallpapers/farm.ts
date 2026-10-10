import { Canvas, cap, ell, type Lighting, type Part } from "../src/canvas"
import { bob, body, chain, gait, limb, quadruped, stepGait, stride, type Gait } from "../src/creature"
import { eggWait } from "../src/egg"
import { haze, mottle } from "../src/grade"
import { fireflyLight, lightPool } from "../src/light"
import { TAU, clamp, fbm1, hash, hash2, lerp, rand, smoothstep, type RGB } from "../src/math"
import { groundShadow, sunShade, type Shade } from "../src/shadow"
import { driftClouds, makeClouds, makeShadows, makeStars, makeStorm, paintClouds, paintShadows, paintSky, paintStars, paintStorm, type Cloud, type Orb, type Star } from "../src/sky"
import type { Activity, Season, Settings, Time, Wallpaper } from "../src/wallpaper"
import { WeatherLayer } from "../src/weather"
import { SwayLayer, gust, sway } from "../src/wind"

// The scene runs slower than real time, which keeps it calm behind text.
const TIME_SCALE = 0.35
// Animals and people move at a quarter of scene speed, so they amble rather than hurry.
const CREATURE_SPEED = 0.25
const HORIZON = 0.55

// What changes with the time of day. Buildings, crops and animals have one daytime color each; tint warms them in the
// golden-hour sunset and darkens them into silhouettes at night, while the sky, hills and window light get their own
// values.
interface Look {
  style: "rim" | "front"
  light: RGB
  sky: [number, RGB][]
  orb: Orb
  stars: number
  clouds: { top: RGB; bottom: RGB; alpha: number }
  hills: [far: RGB, near: RGB]
  tint: RGB
  windows: number
  fireflies: boolean
}

const LOOKS: Record<Time, Look> = {
  day: {
    style: "front",
    light: [1, 0.95, 0.8],
    sky: [
      [0, [0.12, 0.32, 0.7]],
      [0.3, [0.25, 0.5, 0.82]],
      [HORIZON, [0.6, 0.75, 0.88]],
    ],
    orb: { x: 0.82, y: 0.13, r: 0.035, core: [5, 4.6, 3.8], glow: [1, 0.95, 0.8], near: 0.45, wide: 0.12 },
    stars: 0,
    clouds: { top: [1.1, 1.1, 1.1], bottom: [0.6, 0.66, 0.78], alpha: 0.9 },
    hills: [
      [0.42, 0.6, 0.38],
      [0.25, 0.5, 0.12],
    ],
    tint: [1, 1, 1],
    windows: 0,
    fireflies: false,
  },
  sunset: {
    style: "rim",
    // Golden hour: the sun still clear of the hills, a honeyed sky and warm grass in long light.
    light: [1, 0.66, 0.25],
    sky: [
      [0, [0.1, 0.08, 0.18]],
      [0.18, [0.4, 0.2, 0.18]],
      [0.36, [1, 0.52, 0.16]],
      [HORIZON, [1, 0.74, 0.3]],
    ],
    orb: { x: 0.2, y: 0.37, r: 0.042, core: [3.2, 2, 0.7], glow: [1, 0.6, 0.2], near: 0.55, wide: 0.35 },
    stars: 0,
    clouds: { top: [1.3, 0.8, 0.35], bottom: [0.6, 0.3, 0.22], alpha: 0.8 },
    hills: [
      [0.68, 0.42, 0.1],
      [0.34, 0.24, 0.04],
    ],
    tint: [0.46, 0.29, 0.13],
    windows: 0.25,
    fireflies: false,
  },
  night: {
    style: "rim",
    light: [0.3, 0.62, 1.5],
    sky: [
      [0, [0.004, 0.008, 0.03]],
      [0.3, [0.014, 0.024, 0.07]],
      [0.45, [0.035, 0.055, 0.14]],
      [HORIZON, [0.07, 0.1, 0.24]],
    ],
    orb: { x: 0.74, y: 0.15, r: 0.032, core: [1, 0.72, 0.3], glow: [0.45, 0.3, 0.12], near: 0.2, wide: 0.08, moon: true },
    stars: 140,
    clouds: { top: [0.015, 0.02, 0.05], bottom: [0.06, 0.1, 0.3], alpha: 0.7 },
    hills: [
      [0.035, 0.06, 0.13],
      [0.016, 0.03, 0.065],
    ],
    tint: [0.02, 0.032, 0.065],
    windows: 1,
    fireflies: true,
  },
}

// Daylight comes from the upper right, slightly in front of the scene.
const DAYLIGHT = (() => {
  const l = Math.hypot(0.5, 0.6, 0.6)
  return [0.5 / l, -0.6 / l, 0.6 / l] as const
})()

// Ground colors by season and time of day, where they differ from the summer look's hills.
const GROUND: Partial<Record<Season, Partial<Record<Time, [far: RGB, near: RGB]>>>> = {
  spring: {
    day: [
      [0.46, 0.68, 0.36],
      [0.34, 0.64, 0.18],
    ],
  },
  autumn: {
    day: [
      [0.6, 0.52, 0.28],
      [0.56, 0.44, 0.17],
    ],
    sunset: [
      [0.62, 0.34, 0.1],
      [0.42, 0.22, 0.05],
    ],
  },
  // Snow by day, gold at sunset, and deep blue at night, never white.
  winter: {
    day: [
      [0.74, 0.79, 0.88],
      [0.82, 0.86, 0.93],
    ],
    sunset: [
      [0.6, 0.4, 0.26],
      [0.5, 0.34, 0.24],
    ],
    night: [
      [0.035, 0.07, 0.18],
      [0.045, 0.1, 0.24],
    ],
  },
}

// Daytime colors. The corn sprouts in spring, ripens in summer, dries to gold in autumn and is stubble in winter.
const CORN: Record<Season, { height: number; stalk: RGB; ear?: RGB; tassel?: RGB }> = {
  spring: { height: 0.4, stalk: [0.3, 0.62, 0.14] },
  summer: { height: 1, stalk: [0.25, 0.5, 0.12], ear: [0.95, 0.8, 0.25], tassel: [0.75, 0.6, 0.3] },
  autumn: { height: 1, stalk: [0.62, 0.48, 0.2], ear: [0.72, 0.55, 0.26], tassel: [0.5, 0.36, 0.18] },
  winter: { height: 0.18, stalk: [0.48, 0.38, 0.24] },
}
// Tree crowns and the specks in them: blossom in spring, leaves in summer and autumn; bare in winter.
const CROWN: Record<Season, [crown: RGB, specks: RGB[]]> = {
  spring: [[0.92, 0.6, 0.72], [[1, 0.88, 0.92], [0.85, 0.42, 0.6], [0.4, 0.62, 0.2]]],
  summer: [[0.18, 0.4, 0.12], [[0.12, 0.3, 0.08], [0.28, 0.52, 0.16]]],
  autumn: [[0.85, 0.42, 0.1], [[0.95, 0.68, 0.15], [0.7, 0.16, 0.06], [0.55, 0.3, 0.08]]],
  winter: [[0, 0, 0], []],
}
// Where the two trees stand, as fractions of the width.
const TREES = [0.42, 0.95]
// Daytime crops on the far fields, as multipliers of the far hill color.
const CROPS: RGB[] = [
  [1, 1, 1],
  [0.66, 0.82, 0.62],
  [1.1, 1.08, 0.8],
  [1.45, 1.12, 0.45],
  [1.2, 0.86, 0.55],
]
const WOOD: RGB = [0.45, 0.3, 0.16]
const BLACK: RGB = [0.05, 0.05, 0.05]

interface Walker {
  x: number
  y: number
  wx: number
  wy: number
  wanderT: number
  face: number
  phase: number
  // 0 standing, 1 head down grazing or pecking.
  graze: number
  rest: number
  // Time left standing with the head up, looking toward a click.
  look: number
  moving: boolean
  g: Gait
}

class Farm extends Canvas {
  private time = 0
  private creatureTime = 0
  private readonly activity: Activity
  private readonly look: Look
  private lighting: Lighting = { style: "front", dir: DAYLIGHT }
  private readonly shade: Shade
  private background = new Float32Array(0)
  private stars: Star[]
  private clouds: Cloud[]
  private shadows = makeShadows(3, HORIZON + 0.08, 0.95)
  private storm = makeStorm()
  private nearTop = new Float32Array(0)
  private cows: Walker[] = []
  private chickens: Walker[] = []
  private pigs: Walker[] = []
  private farmer = { x: 0.5, dir: 1, wave: -1, next: 20, g: gait() }
  private tractor = { x: -9, dir: 1, next: 14, wheel: 0 }
  private smoke: { x: number; y: number; age: number }[] = []
  private fireflies: { x: number; y: number; vx: number; vy: number; phase: number }[] = []
  // The easter egg: a cow ambles in from the right, then a flying saucer beams it up. t counts scene seconds from
  // the cow settling down to graze.
  private egg: { wait: number; t: number; cow: Walker | undefined } = { wait: eggWait() * TIME_SCALE, t: -1, cow: undefined }
  private readonly season: Season
  private readonly weather: WeatherLayer
  private hills: [far: RGB, near: RGB]
  private treeTops: [number, number][] = []
  // Blossom petals in spring and leaves in autumn, drifting down on the breeze.
  private leaves: { x: number; y: number; phase: number; color: RGB }[] = []
  // The back corn rows are painted once but still bend as gusts pass, and the open pasture lightens under them.
  private corn = new SwayLayer()
  private pasture = new Int32Array(0)
  private gusts = new Float32Array(0)
  private fan = 0

  constructor(settings: Settings) {
    super()
    this.activity = settings.activity
    this.look = LOOKS[settings.time]
    if (settings.time === "day") this.frame = 0.4
    this.season = settings.season ?? "summer"
    this.hills = GROUND[this.season]?.[settings.time] ?? this.look.hills
    // Without a weather setting, winter brings a light flurry.
    this.weather = new WeatherLayer(settings.weather ?? (this.season === "winter" ? "snow" : "clear"), settings.time, HORIZON, !settings.weather)
    this.shade = sunShade(settings.time, this.look.orb, this.weather.covered)
    const drifting = { spring: 10, autumn: 22, summer: 0, winter: 0 }[this.season] * { calm: 1, lively: 1.3, teeming: 1.6 }[settings.activity]
    const colors: RGB[] = this.season === "spring" ? [[1, 0.78, 0.86], [0.95, 0.6, 0.72]] : [[0.9, 0.45, 0.1], [0.75, 0.2, 0.07], [0.95, 0.7, 0.18]]
    this.leaves = Array.from({ length: Math.round(drifting) }, (_, i) => ({ x: Math.random() * 2, y: 0.4 + Math.random() * 0.55, phase: Math.random() * TAU, color: colors[i % colors.length] }))
    this.stars = makeStars(this.look.stars, 0.45)
    this.clouds = makeClouds(5, "cumulus", 0.08, 0.3)
    const walker = (x: number, y: number): Walker => ({ x, y, wx: x, wy: y, wanderT: 0, face: 1, phase: Math.random() * TAU, graze: 0, rest: 0, look: 0, moving: false, g: gait(1, hash(x * 7 + y)) })
    if (settings.activity !== "calm") {
      this.cows = [walker(0.9, 0.8), walker(1.3, 0.84), ...(settings.activity === "teeming" ? [walker(1.1, 0.78)] : [])]
      this.chickens = [walker(1.2, 0.69), walker(1.3, 0.7), walker(1.4, 0.685)]
    }
    if (settings.activity === "teeming") this.pigs = [walker(0.9, 0.9), walker(1.0, 0.92)]
    const flies = this.look.fireflies && this.season === "summer" ? { calm: 12, lively: 20, teeming: 30 }[settings.activity] : 0
    this.fireflies = Array.from({ length: flies }, () => ({ x: Math.random() * 2, y: 0.6 + Math.random() * 0.35, vx: 0, vy: 0, phase: Math.random() * TAU }))
  }

  step(dt: number) {
    dt = clamp(dt, 0, 0.1) * TIME_SCALE
    this.time += dt
    const cdt = dt * CREATURE_SPEED
    this.creatureTime += cdt
    driftClouds(this.clouds, this.A, dt)
    driftClouds(this.shadows, this.A, dt)
    driftClouds(this.storm, this.A, dt)
    this.stepGloom(dt)
    this.weather.step(dt)
    this.fan += dt * (0.8 + 1.6 * gust(0.3 * this.A, this.time))
    for (const l of this.leaves) {
      l.y += (0.02 + Math.sin(this.time * 1.3 + l.phase) * 0.012) * dt
      l.x += (0.025 + Math.sin(this.time * 0.7 + l.phase * 3) * 0.02 + gust(l.x, this.time) * 0.09) * dt
      if (l.y < 0.99 && l.x < this.A + 0.05) continue
      // Most come loose from one of the trees; some blow in from off to the left.
      const tree = this.treeTops[Math.floor(Math.random() * this.treeTops.length)]
      const fromTree = tree && Math.random() < 0.6
      l.x = fromTree ? tree[0] + rand(-0.04, 0.04) : -0.03
      l.y = fromTree ? tree[1] + rand(-0.02, 0.03) : rand(0.35, 0.75)
    }
    for (const f of this.fireflies) {
      f.vx += (Math.random() - 0.5) * 0.02 * dt
      f.vy += (Math.random() - 0.5) * 0.02 * dt
      f.vx *= Math.exp(-dt * 0.5)
      f.vy *= Math.exp(-dt * 0.5)
      f.x = (f.x + f.vx * dt + this.A) % this.A
      f.y = clamp(f.y + f.vy * dt, 0.58, 0.97)
    }
    this.stepTractor(dt)
    const A = this.A
    for (const c of this.cows) this.wander(c, cdt, [0.4 * A, 0.95 * A, 0.76, 0.87], 0.03, [6, 14], 0.055)
    for (const c of this.chickens) this.wander(c, cdt, [0.62 * A, 0.84 * A, 0.672, 0.712], 0.025, [2, 5], 0.025)
    for (const p of this.pigs) this.wander(p, cdt, [0.44 * A, 0.6 * A, 0.88, 0.94], 0.02, [5, 10], 0.035)
    if (this.activity === "teeming") this.stepFarmer(cdt)
    this.stepEgg(dt, cdt)
  }

  // The nearest cow stops, lifts its head and turns toward the click.
  poke(x: number, y: number) {
    const cow = this.cows.reduce<Walker | undefined>((best, c) => (!best || Math.hypot(c.x - x, c.y - y) < Math.hypot(best.x - x, best.y - y) ? c : best), undefined)
    if (!cow) return
    cow.face = x < cow.x ? -1 : 1
    cow.look = 2
    cow.rest = 0
  }

  render() {
    this.hdr.set(this.background)
    for (let x = 0; x < this.W; x++) this.gusts[x] = gust(x / this.H, this.time)
    lightenGrass(this.hdr, this.W, this.H, this.pasture, this.gusts)
    this.corn.draw(this.hdr, this.W, this.H, this.time)
    if (!this.weather.covered) paintStars(this.hdr, this.W, this.H, this.stars, this.time, 0.5, this.look.stars > 50 ? 0.5 : 0.3)
    const [top, bottom] = this.weather.scud ?? [this.look.clouds.top, this.look.clouds.bottom]
    const orb = this.weather.covered ? undefined : this.look.orb
    paintClouds(this.hdr, this.W, this.H, this.clouds, top, bottom, this.look.clouds.alpha, orb)
    paintShadows(this.hdr, this.W, this.H, this.shadows, HORIZON + 0.01, orb)
    paintStorm(this.hdr, this.W, this.H, this.storm, this.look.clouds.top, this.look.clouds.bottom, this.gloom)
    this.drawShadows()
    this.drawFan()
    this.drawTractor()
    for (const c of this.chickens) this.drawChicken(c)
    if (this.activity === "teeming") this.drawCrows()
    const herd = [...this.cows.map((w) => ({ w, kind: "cow" as const })), ...this.pigs.map((w) => ({ w, kind: "pig" as const }))].sort((a, b) => a.w.y - b.w.y)
    for (const { w, kind } of herd) kind === "cow" ? this.drawCow(w) : this.drawPig(w)
    this.drawEgg()
    if (this.activity === "teeming") this.drawFarmer()
    // At night the open barn door spills warm light across the yard and whatever is in it.
    if (this.look.windows === 1) lightPool(this.hdr, this.W, this.H, 0.74 * this.A * this.H, 0.67 * this.H, 0.24 * this.H, 0.07 * this.H, [1, 0.55, 0.15], 3, 0.02)
    this.drawCornRow(3)
    this.drawFireflies()
    this.drawLeaves()
    this.weather.draw(this.hdr, this.W, this.H)
    this.finish()
  }

  protected override visit() {
    if (this.tractor.x < -5) this.tractor.next = 0
  }

  // Everything that never moves is painted once per size into `background`, then copied in each frame.
  protected override layout() {
    const { W, H, A, look } = this
    this.lighting = look.style === "front" ? { style: "front", dir: DAYLIGHT } : { style: "rim", color: look.light, x: look.orb.x * W, y: look.orb.y * H }
    paintSky(this.hdr, W, H, look.sky, look.orb)
    this.weather.cover(this.hdr, W, H)
    // Far hills with a patchwork of fields, then the nearer pasture hill. Autumn turns most fields gold; snow evens
    // them out.
    const [far, near] = this.hills
    const season = this.season
    const golden = season === "autumn" ? 0.45 : 0.85
    const patchwork = season === "winter" ? 0.3 : 1
    // Blades are a pixel-fine texture, which terminal cells would turn into diagonal hatching.
    const grass = this.cells ? 0 : season === "winter" ? 0.03 : 0.1
    const farTop = new Float32Array(W)
    this.nearTop = new Float32Array(W)
    for (let x = 0; x < W; x++) {
      const u = x / H
      farTop[x] = (0.52 - 0.03 * fbm1(u * 1.5, 3) - 0.015 * Math.sin(u * 3)) * H
      this.nearTop[x] = (0.6 - 0.025 * Math.sin(u * 2.2 + 1) - 0.02 * fbm1(u * 2, 5)) * H
    }
    const day = look === LOOKS.day
    const sky = this.hdr.slice()
    this.fillBelow(farTop, (x, y, d) => {
      const fu = (x / H) * 5 + (y / H) * 9
      const fv = (y / H) * 22
      const field = hash2(Math.floor(fu), Math.floor(fv))
      const k = 1 + (field < 0.33 ? -0.15 : field < 0.66 ? 0 : 0.12) * patchwork
      const gold = field > golden && season !== "winter" ? 0.3 : 0
      const c: RGB = [far[0] * k + gold * far[0], far[1] * k + gold * 0.2 * far[1], far[2] * k * (1 - gold)]
      if (!day || season === "winter") return this.rim(c, x, d, 1.5)
      // By day each field takes its own crop, from deep green to ploughed ochre, edged by dark hedgerows.
      const crop = CROPS[Math.floor(hash2(Math.floor(fu) + 7.1, Math.floor(fv) + 3.3) * CROPS.length)]
      const hedge = Math.min(fu - Math.floor(fu), (fv - Math.floor(fv)) * 0.4) < 0.05 ? 0.5 : 1
      return [c[0] * crop[0] * hedge, c[1] * crop[1] * hedge, c[2] * crop[2] * hedge]
    })
    // The far fields fade into the sky, then the pasture in front of them stays crisp.
    if (day) haze(this.hdr, sky, W, H, 0.5, 0.62, 0.24, 0.08)
    this.fillBelow(this.nearTop, (x, y, d) => {
      const blades = 1 - grass + grass * Math.sin(x * 1.7 + y * 0.6 + fbm1(x * 0.1, 2) * 6)
      const depth = 1 - clamp((y / H - 0.6) * 0.6, 0, 0.25)
      return this.rim([near[0] * blades * depth, near[1] * blades * depth, near[2] * blades * depth], x, d, 2)
    })
    if (day) mottle(this.hdr, W, H, 0.58, 1, 0.55, season === "winter" ? [1.03, 1, 0.92] : [1.14, 1.06, 0.7], season === "winter" ? [0.62, 0.74, 1] : [0.66, 0.84, 0.66])
    const field = this.hdr.slice()
    // A dirt road winding across the middle distance.
    for (let x = 0; x < W; x++) {
      const cy = this.roadY(x / H) * H
      for (let y = Math.floor(cy - 0.009 * H); y <= Math.ceil(cy + 0.009 * H); y++) {
        if (y < 0 || y >= H) continue
        const edge = clamp(0.009 * H - Math.abs(y + 0.5 - cy) + 0.5, 0, 1)
        const c = season === "winter" ? lerpRGB(this.paint([0.5, 0.4, 0.26]), near, 0.6) : this.paint([0.5, 0.4, 0.26])
        this.blend((y * W + x) * 3, c[0], c[1], c[2], edge)
      }
    }
    if (season === "spring") this.drawWildflowers()
    const ground = (x: number, y: number, w: number, h: number, tip?: number) => groundShadow(this.hdr, W, H, this.shade, x * H, y * H, w * H, h * H, tip)
    for (const t of TREES) ground(t * A, this.nearTop[clamp(Math.round(t * W), 0, W - 1)] / H + 0.012, 0.09, 0.17, 1.4)
    ground(0.5 * A, this.nearTop[clamp(Math.round(0.5 * W), 0, W - 1)] / H + 0.006, 0.08, 0.066, 0.6)
    ground(0.3 * A, 0.65, 0.07, 0.27, 0.4)
    ground(0.74 * A, 0.655, 0.24, 0.19, 0.6)
    for (const [bx, by] of [[0.58, 0.705], [0.625, 0.712]]) ground(bx * A, by + 0.02, 0.045, 0.04)
    for (let x = 0.38 * A; x < A + 0.05; x += 0.07) ground(x, 0.725, 0.012, 0.045, 0.6)
    this.treeTops = TREES.map((t) => {
      const base = this.nearTop[clamp(Math.round(t * W), 0, W - 1)] / H + 0.012
      this.drawTree(t * A, base)
      return [t * A, base - 0.12]
    })
    this.drawFarmhouse(0.5 * A, this.nearTop[clamp(Math.round(0.5 * W), 0, W - 1)] / H + 0.006)
    this.drawWindmillTower(0.3 * A, 0.65)
    this.drawBarn(0.74 * A, 0.655)
    for (const [bx, by] of [[0.58, 0.705], [0.625, 0.712]]) this.shape([ell(bx * A * H, by * H, 0.022 * H, 0.02 * H, 0, this.paint([0.78, 0.62, 0.3]), 3)], this.lighting, 0.8)
    // Pumpkins in front of the barn in autumn.
    if (season === "autumn")
      for (const [dx, r] of [[-0.062, 0.011], [-0.046, 0.008], [0.056, 0.01]]) {
        const [px, py] = [(0.74 * A + dx) * H, 0.664 * H]
        this.shape([ell(px, py - r * H, r * 1.25 * H, r * H, 0, this.paint([0.92, 0.45, 0.06]), 3), cap(px, py - r * 1.9 * H, px + 0.003 * H, py - r * 2.4 * H, 0.0018 * H, 0.0012 * H, this.paint([0.3, 0.35, 0.1]))], this.lighting, 0.7)
      }
    // A fence along the front of the pasture.
    const fy = 0.725 * H
    const posts: Part[] = []
    for (let x = 0.38 * A; x < A + 0.05; x += 0.07) posts.push(cap(x * H, fy, x * H, fy - 0.045 * H, 0.004 * H, 0.0035 * H, this.paint(WOOD)))
    posts.push(cap(0.38 * A * H, fy - 0.03 * H, W + 5, fy - 0.03 * H, 0.0025 * H, 0.0025 * H, this.paint(WOOD)))
    posts.push(cap(0.38 * A * H, fy - 0.014 * H, W + 5, fy - 0.014 * H, 0.0025 * H, 0.0025 * H, this.paint(WOOD)))
    this.shape(posts, this.lighting, 0.6)
    if (this.activity === "teeming") this.shape([ell(0.52 * A * H, 0.91 * H, 0.08 * H, 0.025 * H, 0, this.paint([0.32, 0.22, 0.12]))], this.lighting, 0.3)
    this.corn.begin(this.hdr)
    for (let row = 0; row < 3; row++) this.drawCornRow(row)
    // Weighted by height on screen: the farther rows' tops sit higher, so each stalk bends from near its foot.
    this.corn.end(this.hdr, W, H, 0.012 * H, (_x, y) => clamp((0.96 * H - y) / (0.26 * H), 0, 1))
    this.background = this.hdr.slice()
    // Open grass on the pasture hill: the pixels nothing was painted over.
    const pasture: number[] = []
    for (let x = 0; x < W; x++)
      for (let y = Math.ceil(this.nearTop[x]) + 1; y < H; y++) {
        const o = (y * W + x) * 3
        if (this.hdr[o] === field[o] && this.hdr[o + 1] === field[o + 1] && this.hdr[o + 2] === field[o + 2]) pasture.push(y * W + x)
      }
    this.pasture = Int32Array.from(pasture)
    this.gusts = new Float32Array(W)
  }

  // Shadows under everything that walks or drives, drawn before any of it so none falls across another animal.
  private drawShadows() {
    const H = this.H
    const ground = (x: number, y: number, w: number, h: number, tip?: number, lift?: number) => groundShadow(this.hdr, this.W, H, this.shade, x * H, y * H, w * H, h * H, tip, lift)
    const t = this.tractor
    if (t.x > -5) ground(t.x + t.dir * 0.04, this.roadY(t.x) + 0.004, 0.11, 0.094)
    for (const c of this.chickens) {
      const S = 0.05 * this.depthScale(c.y)
      ground(c.x, c.y, 0.7 * S, 0.9 * S)
    }
    for (const p of this.pigs) {
      const S = 0.08 * this.depthScale(p.y)
      ground(p.x, p.y, 0.9 * S, 0.6 * S)
    }
    for (const c of this.cows) {
      const S = 0.11 * this.depthScale(c.y)
      ground(c.x + c.face * 0.1 * S, c.y, 1.1 * S, 0.7 * S, 0.8)
    }
    const e = this.egg
    if (e.cow && e.t < 24) {
      const rise = e.t < 0 ? 0 : smoothstep(13, 24, e.t)
      const size = lerp(1, 0.35, rise)
      const uy = lerp(0.1, e.cow.y - 0.4, smoothstep(0, 10, e.t))
      const S = 0.11 * this.depthScale(e.cow.y) * size
      ground(e.cow.x + e.cow.face * 0.1 * S, e.cow.y, 1.1 * S, 0.7 * S, 0.8, rise * (e.cow.y - uy - 0.025) * H)
    }
    if (this.activity === "teeming") ground(this.farmer.x, 0.738, 0.03, 0.105, 0.6)
  }

  private paint(c: RGB): RGB {
    const t = this.look.tint
    return [c[0] * t[0], c[1] * t[1], c[2] * t[2]]
  }

  private roadY(u: number) {
    return 0.665 + 0.008 * Math.sin(u * 1.7)
  }

  // At sunset and night, the top edge of a hill catches the light.
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

  // A rectangle of window light: warm and glowing at night, dark glass by day.
  private window(x0: number, y0: number, x1: number, y1: number) {
    const H = this.H
    const k = this.look.windows
    const glass = this.paint([0.15, 0.2, 0.3])
    const c: RGB = [lerp(glass[0], 1.3, k), lerp(glass[1], 0.75, k), lerp(glass[2], 0.25, k)]
    this.polygon([[x0 * H, y0 * H], [x1 * H, y0 * H], [x1 * H, y1 * H], [x0 * H, y1 * H]], c)
    if (k <= 0) return
    const cx = ((x0 + x1) / 2) * H
    const cy = ((y0 + y1) / 2) * H
    const R = 0.05 * H
    for (let y = Math.max(0, Math.floor(cy - R)); y < Math.min(H, cy + R); y++)
      for (let x = Math.max(0, Math.floor(cx - R)); x < Math.min(this.W, cx + R); x++) {
        const d = Math.hypot(x - cx, y - cy) / R
        if (d >= 1) continue
        const a = (1 - d) ** 2 * 0.25 * k
        this.add(x, y, 1 * a, 0.55 * a, 0.18 * a)
      }
  }

  // A red gambrel-roofed barn with white trim and a silo, seen slightly from the left so its side recedes.
  private drawBarn(c: number, b: number) {
    const H = this.H
    const P = (points: [number, number][]) => points.map(([x, y]) => [x * H, y * H] as const)
    this.shape([cap((c - 0.13) * H, b * H, (c - 0.13) * H, (b - 0.17) * H, 0.022 * H, 0.022 * H, this.paint([0.6, 0.6, 0.62]), 3), ell((c - 0.13) * H, (b - 0.17) * H, 0.022 * H, 0.016 * H, 0, this.paint([0.45, 0.47, 0.5]))], this.lighting)
    this.polygon(P([[c + 0.08, b - 0.1], [c + 0.14, b - 0.115], [c + 0.14, b - 0.012], [c + 0.08, b]]), this.paint([0.45, 0.08, 0.05]))
    this.polygon(P([[c, b - 0.185], [c + 0.06, b - 0.198], [c + 0.135, b - 0.168], [c + 0.15, b - 0.115], [c + 0.09, b - 0.1], [c + 0.075, b - 0.155]]), this.paint([0.22, 0.07, 0.06]))
    this.polygon(P([[c - 0.08, b - 0.1], [c + 0.08, b - 0.1], [c + 0.08, b], [c - 0.08, b]]), this.paint([0.62, 0.12, 0.08]))
    this.polygon(P([[c - 0.09, b - 0.1], [c - 0.075, b - 0.155], [c, b - 0.185], [c + 0.075, b - 0.155], [c + 0.09, b - 0.1]]), this.paint([0.32, 0.1, 0.08]))
    if (this.season === "winter") {
      const snow = this.hills[1]
      this.polygon(P([[c, b - 0.187], [c + 0.06, b - 0.2], [c + 0.135, b - 0.17], [c + 0.148, b - 0.12], [c + 0.09, b - 0.104], [c + 0.075, b - 0.157]]), snow)
      this.polygon(P([[c - 0.077, b - 0.157], [c, b - 0.188], [c + 0.077, b - 0.157], [c + 0.072, b - 0.148], [c, b - 0.176], [c - 0.072, b - 0.148]]), snow)
      this.shape([ell((c - 0.13) * H, (b - 0.175) * H, 0.023 * H, 0.013 * H, 0, snow)], this.lighting, 0.4)
    }
    this.polygon(P([[c - 0.035, b - 0.065], [c + 0.035, b - 0.065], [c + 0.035, b], [c - 0.035, b]]), this.look.windows === 1 ? [1.1, 0.6, 0.18] : this.paint([0.42, 0.07, 0.05]))
    const trim = this.paint([0.88, 0.86, 0.8])
    const t = 0.0025 * H
    this.shape(
      [
        cap((c - 0.035) * H, (b - 0.065) * H, (c + 0.035) * H, b * H, t, t, trim),
        cap((c + 0.035) * H, (b - 0.065) * H, (c - 0.035) * H, b * H, t, t, trim),
        cap((c - 0.035) * H, (b - 0.065) * H, (c + 0.035) * H, (b - 0.065) * H, t, t, trim),
        cap((c - 0.035) * H, (b - 0.065) * H, (c - 0.035) * H, b * H, t, t, trim),
        cap((c + 0.035) * H, (b - 0.065) * H, (c + 0.035) * H, b * H, t, t, trim),
        cap((c - 0.08) * H, (b - 0.1) * H, (c + 0.08) * H, (b - 0.1) * H, t, t, trim),
      ],
      this.lighting,
      0,
    )
    this.window(c - 0.018, b - 0.148, c + 0.018, b - 0.118)
  }

  private drawFarmhouse(h: number, hb: number) {
    const H = this.H
    const P = (points: [number, number][]) => points.map(([x, y]) => [x * H, y * H] as const)
    this.polygon(P([[h + 0.028, hb - 0.062], [h + 0.036, hb - 0.062], [h + 0.036, hb - 0.045], [h + 0.028, hb - 0.045]]), this.paint([0.4, 0.2, 0.15]))
    this.polygon(P([[h - 0.035, hb - 0.035], [h + 0.035, hb - 0.035], [h + 0.035, hb], [h - 0.035, hb]]), this.paint([0.85, 0.82, 0.72]))
    this.polygon(P([[h - 0.043, hb - 0.034], [h, hb - 0.066], [h + 0.043, hb - 0.034]]), this.paint([0.35, 0.15, 0.12]))
    if (this.season === "winter") this.polygon(P([[h - 0.04, hb - 0.037], [h, hb - 0.067], [h + 0.04, hb - 0.037], [h + 0.03, hb - 0.04], [h, hb - 0.058], [h - 0.03, hb - 0.04]]), this.hills[1])
    this.window(h - 0.024, hb - 0.026, h - 0.012, hb - 0.014)
    this.window(h + 0.012, hb - 0.026, h + 0.024, hb - 0.014)
  }

  // A water-pumping windmill: a lattice tower; the fan on top is drawn each frame so it can turn.
  private drawWindmillTower(x: number, base: number) {
    const H = this.H
    const c = this.paint([0.5, 0.48, 0.45])
    const parts: Part[] = []
    for (const s of [-1, 1]) parts.push(cap((x + s * 0.035) * H, base * H, (x + s * 0.007) * H, (base - 0.2) * H, this.thick(0.0028, 1.1), this.thick(0.0022, 1), c))
    // Fewer, sturdier braces where the terminal's cells would turn a fine lattice into a scribble.
    const levels = this.cells ? 2 : 4
    for (let i = 0; i < levels; i++) {
      const y0 = base - (i * 0.2) / levels
      const y1 = base - ((i + 1) * 0.2) / levels
      const w0 = 0.035 - (i * 0.028) / levels
      const w1 = 0.035 - ((i + 1) * 0.028) / levels
      parts.push(cap((x - w0) * H, y0 * H, (x + w1) * H, y1 * H, this.thick(0.0015, 0.7), this.thick(0.0015, 0.7), c), cap((x + w0) * H, y0 * H, (x - w1) * H, y1 * H, this.thick(0.0015, 0.7), this.thick(0.0015, 0.7), c))
    }
    this.shape(parts, this.lighting, 0.5)
  }

  private drawFan() {
    const H = this.H
    const x = 0.3 * this.A * H
    const y = (0.65 - 0.21) * H
    const metal = this.paint([0.75, 0.75, 0.72])
    const turn = this.fan
    this.polygon([[x - 0.01 * H, y], [x - 0.075 * H, y - 0.018 * H], [x - 0.075 * H, y + 0.012 * H]], this.paint([0.6, 0.15, 0.1]))
    const parts: Part[] = [ell(x, y, 0.009 * H, 0.009 * H, 0, this.paint([0.35, 0.33, 0.3]))]
    // Blade tips stay several pixels apart, so the turning wheel doesn't shimmer in the terminal's cells.
    const blades = this.cells ? 8 : 14
    for (let i = 0; i < blades; i++) {
      const a = turn + (i / blades) * TAU
      parts.push(cap(x + Math.cos(a) * 0.012 * H, y + Math.sin(a) * 0.012 * H, x + Math.cos(a) * 0.06 * H, y + Math.sin(a) * 0.06 * H, this.thick(0.004, 1), this.thick(0.008, 2), metal))
    }
    this.shape(parts, this.lighting, 0.6)
  }

  // A row of corn stalks: rows 0 to 2 are painted once; the front row (3) sways and is drawn every frame.
  private drawCornRow(row: number) {
    const { A, H } = this
    const corn = CORN[this.season]
    const base = [0.79, 0.87, 0.96, 1.05][row] * H
    const height = (0.12 + row * 0.045) * H * corn.height
    // Stalks stand at least a few cells apart, so in the terminal the field reads as plants rather than stripes.
    const spacing = this.cells ? Math.max(0.026 + row * 0.006, 9 / H) : 0.026 + row * 0.006
    const stalk = this.paint(corn.stalk)
    // The row's shaded mass of leaves, so the field reads as rows rather than a tangle of thin strokes.
    const end = (0.36 * A + 0.03) * H
    const mass: [number, number][] = [[-2, base + 2]]
    for (let x = -2; x < end; x += 6) mass.push([x, base - height * (0.42 + 0.08 * Math.sin((x / H) * 37 + row * 2))])
    mass.push([end + 0.02 * H, base + 2])
    this.polygon(mass, [stalk[0] * 0.6, stalk[1] * 0.6, stalk[2] * 0.6])
    for (let i = 0; i * spacing < 0.36 * A; i++) {
      const x = (i * spacing + (row % 2) * spacing * 0.5 + hash(i * 3.1 + row) * 0.008) * H
      const h = height * (0.85 + hash(i * 7.3 + row) * 0.3)
      const bend = row === 3 ? sway(x / H, this.time, i * 0.9) * 0.05 : (hash(i + row * 5) - 0.5) * 0.06
      const top: [number, number] = [x + Math.sin(bend) * h, base - Math.cos(bend) * h]
      const at = (t: number): [number, number] => [lerp(x, top[0], t), lerp(base, top[1], t)]
      const parts: Part[] = [cap(x, base, ...top, this.thick(0.006 * (1 + row * 0.3), 1.2), this.thick(0.003, 0.8), stalk)]
      for (let l = 0; l < 4; l++) {
        const [lx, ly] = at(0.3 + l * 0.15)
        const side = l % 2 ? 1 : -1
        const reach = h * 0.28
        const mid: [number, number] = [lx + side * reach * 0.6, ly - reach * 0.25]
        // Leaves stream downwind as the stalk bends.
        parts.push(cap(lx, ly, ...mid, this.thick(0.006, 1.3), this.thick(0.004, 1.1), stalk), cap(...mid, lx + side * reach + bend * reach * 1.5, ly + reach * 0.15 + bend * reach, this.thick(0.004, 1.1), this.thick(0.0015, 0.6), stalk))
      }
      const [ex, ey] = at(0.55)
      if (corn.ear) parts.push(ell(ex + 0.008 * H, ey, this.thick(0.007, 1.6), this.thick(0.016, 3), 0.25 + bend, this.paint(corn.ear)))
      if (corn.tassel && !this.cells) parts.push(cap(...top, top[0] + 0.012 * H, top[1] - 0.012 * H, 0.002 * H, 0.001 * H, this.paint(corn.tassel)), cap(...top, top[0] - 0.01 * H, top[1] - 0.014 * H, 0.002 * H, 0.001 * H, this.paint(corn.tassel)))
      // Rim light on every thin leaf would turn the field into a wireframe, so the corn only catches a little of it, and
      // on terminal cells less still.
      this.shape(parts, this.lighting, this.look.style === "rim" ? (this.cells ? 0.08 : 0.2) : 0.6)
    }
  }

  // A round orchard tree on the pasture hill: in blossom, in leaf, turning, or bare with snow along its branches.
  private drawTree(x: number, base: number) {
    const H = this.H
    const bark = this.paint([0.3, 0.2, 0.12])
    const fork = base - 0.06
    const limbs = [[-0.04, -0.13], [0.035, -0.135], [-0.005, -0.155], [0.05, -0.1], [-0.055, -0.095]]
    this.shape([cap(x * H, base * H, x * H, fork * H, 0.006 * H, 0.0045 * H, bark), ...limbs.map(([dx, dy]) => cap(x * H, fork * H, (x + dx) * H, (base + dy) * H, 0.0035 * H, 0.0012 * H, bark))], this.lighting, 0.6)
    if (this.season === "winter") {
      const snow = this.hills[1]
      this.shape(limbs.map(([dx, dy]) => cap((x + dx * 0.3) * H, (fork + (base + dy - fork) * 0.3) * H - 0.003 * H, (x + dx * 0.85) * H, (fork + (base + dy - fork) * 0.85) * H - 0.003 * H, 0.0016 * H, 0.0008 * H, snow)), this.lighting, 0.3)
      return
    }
    const [crown, specks] = CROWN[this.season]
    const blobs = [[0, -0.12, 0.05, 0.04], [-0.038, -0.1, 0.034, 0.03], [0.038, -0.104, 0.034, 0.03], [-0.016, -0.148, 0.034, 0.027], [0.022, -0.142, 0.03, 0.025]]
    this.shape(blobs.map(([dx, dy, rx, ry]) => ell((x + dx) * H, (base + dy) * H, rx * H, ry * H, 0, this.paint(crown))), this.lighting, 0.8)
    for (let i = 0; i < 46; i++) {
      const a = hash(i * 1.7 + x) * TAU
      const r = Math.sqrt(hash(i * 2.9 + x))
      const c = this.paint(specks[i % specks.length])
      this.disc((x + Math.cos(a) * r * 0.06) * H, (base - 0.122 + Math.sin(a) * r * 0.045) * H, 0.004 * H, c[0], c[1], c[2], 0.9)
    }
  }

  // Spring wildflowers dotted over the pasture.
  private drawWildflowers() {
    const { W, H } = this
    const colors: RGB[] = [[0.95, 0.85, 0.2], [0.95, 0.92, 0.85], [0.6, 0.35, 0.85], [0.95, 0.45, 0.55]]
    for (let i = 0; i < Math.round(this.A * 160); i++) {
      const x = hash(i * 3.3) * W
      const top = this.nearTop[clamp(Math.round(x), 0, W - 1)] / H
      const y = (top + 0.01 + hash(i * 5.1) * (0.95 - top)) * H
      const c = this.paint(colors[i % colors.length])
      this.disc(x, y, 0.0025 * H, c[0], c[1], c[2], 0.85)
    }
  }

  // Petals or leaves tumbling as they fall.
  private drawLeaves() {
    const H = this.H
    const size = this.season === "spring" ? 0.0045 : 0.0065
    for (const l of this.leaves) {
      const spin = Math.sin(this.time * 2 + l.phase) * 1.3
      const flat = 0.35 + 0.65 * Math.abs(Math.cos(this.time * 1.6 + l.phase))
      this.shape([ell(l.x * H, l.y * H, size * H, size * 0.55 * flat * H, spin, this.paint(l.color))], this.lighting, 0.5)
    }
  }

  // Walks between random points in a zone, pausing at each to graze or peck. stride is the distance a full step cycle
  // covers near the front of the field, so the legs keep pace with the ground.
  private wander(w: Walker, dt: number, zone: [number, number, number, number], speed: number, pause: [number, number], stride: number) {
    const [x0, y0] = [w.x, w.y]
    this.roam(w, dt, zone, speed, pause)
    stepGait(w.g, Math.hypot(w.x - x0, w.y - y0) / (stride * this.depthScale(w.y)), dt, w.face)
  }

  private roam(w: Walker, dt: number, zone: [number, number, number, number], speed: number, pause: [number, number]) {
    w.phase += dt * (w.moving ? 6 : 1.5)
    if (w.look > 0) {
      w.look -= dt
      w.graze = Math.max(0, w.graze - dt * 8)
      w.moving = false
      return
    }
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

  // Animals farther up the field are smaller.
  private depthScale(y: number) {
    return 0.6 + (y - 0.7) * 2.5
  }

  // A black-and-white dairy cow on jointed legs, walking in diagonal pairs with its head nodding and its tail swinging
  // behind, and lowering its head to graze. lift raises it off the ground and size shrinks it, for the saucer's beam.
  private drawCow(c: Walker, lift = 0, size = 1) {
    const H = this.H
    const g = c.g
    const P = body(c.x * H, (c.y - lift) * H, 0.11 * H * this.depthScale(c.y) * size, g.turn)
    const S = P.S
    const hide = this.paint([0.92, 0.9, 0.86])
    const black = this.paint(BLACK)
    const rise = bob(g.phase) * g.go * 0.015
    const legs = { fore: 0.25, hind: 0.27, top: 0.42 - rise, w: 0.08, a: 0.21, b: 0.21, reach: 0.15, lift: 0.08, r: [0.07, 0.036, 0.03] as [number, number, number], paw: [0.03, this.paint([0.25, 0.2, 0.17])] as [number, RGB] }
    this.shape(quadruped(P, g, true, { ...legs, color: this.paint([0.66, 0.64, 0.6]) }), this.lighting, 0.7)
    const gz = smoothstep(0, 1, c.graze)
    const nod = Math.cos(TAU * 2 * g.phase - 1) * 0.02 * g.go
    const poll: [number, number] = [lerp(0.47, 0.54, gz), lerp(-0.6, -0.26, gz) + nod - rise]
    const muzzle: [number, number] = [poll[0] + lerp(0.15, 0.05, gz), poll[1] + lerp(0.11, 0.2, gz)]
    const swish = Math.sin(this.creatureTime * 2.3 + c.x * 17) * 0.05 - g.lag * 0.06
    const tail = (t: number) => P(-0.43 - t * 0.03 + swish * t * t, -0.6 - rise + t * 0.36)
    this.shape(
      [
        ...quadruped(P, g, false, { ...legs, color: hide }),
        ell(...P(0.01, -0.47 - rise), P.len(0.34, 0.15), 0.17 * S, 0, hide),
        ell(...P(-0.25, -0.5 - rise), P.len(0.16, 0.14), 0.15 * S, 0, hide),
        ell(...P(0.24, -0.47 - rise), P.len(0.15, 0.14), 0.16 * S, 0, hide),
        ell(...P(-0.12, -0.31 - rise), P.len(0.07, 0.05), 0.045 * S, 0, this.paint([0.9, 0.6, 0.6])),
        cap(...P(0.28, -0.5 - rise), ...P(...poll), 0.13 * S, 0.085 * S, hide),
        cap(...P(...poll), ...P(...muzzle), 0.085 * S, 0.068 * S, hide),
        ell(...P(...muzzle), 0.06 * S, 0.055 * S, 0, this.paint([0.88, 0.62, 0.58])),
        ...[-1, 1].map((s) => ell(...P(poll[0] - 0.04, poll[1] - 0.01, s * 0.1), 0.075 * S, 0.026 * S, (-0.2 - g.lag * 0.15) * P.along, hide)),
        ...chain(tail, 3, 0.02 * S, 0.012 * S, hide),
        ell(...tail(1.1), 0.025 * S, 0.045 * S, 0, black),
      ],
      this.lighting,
      0.7,
    )
    this.shape(
      [
        ell(...P(-0.15, -0.5 - rise), P.len(0.12, 0.06), 0.08 * S, 0.3 * P.along, black),
        ell(...P(0.13, -0.4 - rise), P.len(0.1, 0.05), 0.07 * S, -0.4 * P.along, black),
        ell(...P(-0.3, -0.38 - rise), P.len(0.06, 0.03), 0.05 * S, 0, black),
        ell(...P(poll[0] + 0.02, poll[1] + 0.02), 0.05 * S, 0.045 * S, 0, black),
      ],
      this.lighting,
      0.4,
    )
  }

  // A hen high-stepping on jointed legs, her head holding still in the air and darting forward at each step, and
  // pecking at the ground when she stops.
  private drawChicken(h: Walker) {
    const H = this.H
    const g = h.g
    const P = body(h.x * H, h.y * H, 0.05 * H * this.depthScale(h.y), g.turn)
    const S = P.S
    const peck = Math.max(h.graze, Math.pow(Math.max(0, Math.sin(h.phase * 2)), 6) * (1 - g.go))
    const feather = this.paint(h.x % 0.3 > 0.15 ? [0.6, 0.35, 0.15] : [0.92, 0.9, 0.82])
    const leg = this.paint([0.95, 0.6, 0.15])
    const red = this.paint([0.85, 0.08, 0.06])
    const rise = bob(g.phase) * g.go * 0.03
    const f = (g.phase * 2) % 1
    const thrust = g.go * 0.09 * (f < 0.75 ? 1 - (2 * f) / 0.75 : -1 + 2 * smoothstep(0.75, 1, f))
    const [hu, hv] = [lerp(0.3, 0.48, peck) + thrust, lerp(-0.84, -0.3, peck) - rise]
    const legs = [-1, 1].flatMap((w) => {
      const [reach, raise] = stride(g.phase, w > 0 ? 0 : 0.5)
      const fu = reach * 0.15 * g.go
      const fv = -raise * 0.12 * g.go - 0.02
      const Q = (u: number, v: number) => P(u, v, w * 0.06)
      return [...limb(Q, 0, -0.4 - rise, fu, fv, 0.2, 0.22, 1, 0.07 * S, 0.03 * S, 0.025 * S, leg), cap(...Q(fu - 0.06, fv), ...Q(fu + 0.1, fv + 0.01), 0.025 * S, 0.015 * S, leg)]
    })
    this.shape(
      [
        ...legs,
        cap(...P(-0.2, -0.55 - rise), ...P(-0.36 - g.lag * 0.03, -0.88 - rise), 0.13 * S, 0.05 * S, feather),
        cap(...P(-0.2, -0.52 - rise), ...P(-0.42 - g.lag * 0.04, -0.72 - rise), 0.1 * S, 0.04 * S, feather),
        ell(...P(0, -0.52 - rise), P.len(0.3, 0.18), 0.21 * S, 0.25 * P.along, feather),
        ell(...P(0.14, -0.55 - rise), P.len(0.17, 0.16), 0.18 * S, 0, feather),
        cap(...P(0.16, -0.62 - rise), ...P(hu, hv), 0.1 * S, 0.075 * S, feather),
        ell(...P(hu, hv), 0.1 * S, 0.1 * S, 0, feather),
        ell(...P(hu - 0.01, hv - 0.1), P.len(0.07, 0.02), 0.045 * S, 0, red),
        ell(...P(hu + 0.05, hv + 0.09), 0.03 * S, 0.045 * S, 0, red),
        cap(...P(hu + 0.07, hv), ...P(hu + 0.18, hv + 0.03), 0.035 * S, 0.008 * S, leg),
      ],
      this.lighting,
      0.6,
    )
  }

  // A round pink pig trotting on short legs, floppy ears bouncing and curly tail up, rooting in the mud.
  private drawPig(p: Walker) {
    const H = this.H
    const g = p.g
    const P = body(p.x * H, p.y * H, 0.08 * H * this.depthScale(p.y), g.turn)
    const S = P.S
    const pink = this.paint([0.95, 0.66, 0.66])
    const snout = this.paint([0.88, 0.5, 0.52])
    const rise = bob(g.phase) * g.go * 0.015
    const legs = { fore: 0.2, hind: 0.21, top: 0.22 - rise, w: 0.1, a: 0.1, b: 0.1, reach: 0.13, lift: 0.06, r: [0.07, 0.045, 0.04] as [number, number, number], paw: [0.025, this.paint([0.5, 0.32, 0.3])] as [number, RGB] }
    this.shape(quadruped(P, g, true, { ...legs, color: this.paint([0.75, 0.5, 0.5]) }), this.lighting, 0.7)
    const dip = p.graze * 0.14 + Math.cos(TAU * 2 * g.phase - 1) * 0.015 * g.go - rise
    const flop = g.lag * 0.03 + Math.sin(TAU * 2 * g.phase - 2) * 0.015 * g.go
    const curl = (t: number) => P(-0.4 - 0.05 * Math.sin(t * 5), -0.44 - rise + 0.05 * Math.cos(t * 5) - 0.03 * t)
    this.shape(
      [
        ...quadruped(P, g, false, { ...legs, color: pink }),
        ell(...P(-0.04, -0.34 - rise), P.len(0.38, 0.2), 0.21 * S, -0.06 * P.along, pink),
        ell(...P(0.34, -0.37 + dip), 0.15 * S, 0.15 * S, 0, pink),
        cap(...P(0.4, -0.35 + dip), ...P(0.52, -0.31 + dip), 0.1 * S, 0.075 * S, pink),
        ell(...P(0.54, -0.31 + dip), P.len(0.025, 0.065), 0.065 * S, 0, snout),
        ...[-1, 1].map((s) => cap(...P(0.3, -0.46 + dip, s * 0.08), ...P(0.42, -0.4 + dip + flop, s * 0.11), 0.055 * S, 0.02 * S, pink)),
        ...chain(curl, 3, 0.02 * S, 0.015 * S, pink),
      ],
      this.lighting,
      0.7,
    )
  }

  // The farmer strolls along the fence in a straw hat, turning round at each end and now and then stopping to wave.
  private stepFarmer(dt: number) {
    const f = this.farmer
    if (f.wave >= 0) {
      f.wave += dt
      if (f.wave > 3) f.wave = -1
      stepGait(f.g, 0, dt, f.dir)
      return
    }
    f.next -= dt
    if (f.next <= 0) {
      f.wave = 0
      f.next = rand(20, 35)
      return
    }
    f.x += f.dir * 0.03 * dt
    stepGait(f.g, (0.03 * dt) / 0.079, dt, f.dir)
    if (f.x > 0.95 * this.A) f.dir = -1
    if (f.x < 0.42 * this.A) f.dir = 1
  }

  private drawFarmer() {
    const H = this.H
    const f = this.farmer
    const g = f.g
    const rise = bob(g.phase) * g.go * 0.015
    const P = body(f.x * H, 0.738 * H, 0.105 * H, g.turn)
    const S = P.S
    const denim = this.paint([0.2, 0.3, 0.6])
    const shirt = this.paint([0.75, 0.15, 0.12])
    const skin = this.paint([0.85, 0.65, 0.5])
    const straw = this.paint([0.9, 0.78, 0.4])
    const boot = this.paint([0.3, 0.2, 0.12])
    // Each side's leg and the opposite arm swing together; the near arm waves.
    const side = (w: number, far: boolean): Part[] => {
      const [reach, raise] = stride(g.phase, w > 0 ? 0 : 0.5)
      const fu = reach * 0.24 * g.go
      const fv = -raise * 0.07 * g.go - 0.03
      const Q = (u: number, v: number) => P(u, v, w * 0.05)
      const A = (u: number, v: number) => P(u, v, w * 0.1)
      const waving = f.wave >= 0 && !far
      const hand: [number, number] = waving ? [0.12 + Math.sin(f.wave * 8) * 0.04, -1.1] : [-reach * 0.14 * g.go + 0.02, -0.42 - rise]
      const pants = far ? this.paint([0.13, 0.2, 0.42]) : denim
      return [
        ...limb(Q, 0, -0.48 - rise, fu, fv, 0.25, 0.25, -1, 0.055 * S, 0.045 * S, 0.04 * S, pants),
        cap(...Q(fu - 0.02, fv), ...Q(fu + 0.06, fv + 0.005), 0.035 * S, 0.03 * S, boot),
        ...limb(A, 0.01, -0.78 - rise, ...hand, 0.19, 0.19, waving ? -1 : 1, 0.04 * S, 0.033 * S, 0.03 * S, far ? this.paint([0.5, 0.1, 0.08]) : shirt),
        ell(...A(...hand), 0.03 * S, 0.03 * S, 0, skin),
      ]
    }
    const near = P.along >= 0 ? 1 : -1
    this.shape(side(-near, true), this.lighting, 0.7)
    this.shape(
      [
        ...side(near, false),
        cap(...P(0, -0.45 - rise), ...P(0.02, -0.78 - rise), 0.1 * S, 0.085 * S, denim),
        cap(...P(0.02, -0.8 - rise, -0.06), ...P(0.02, -0.8 - rise, 0.06), 0.06 * S, 0.06 * S, shirt),
        ell(...P(0.04, -0.89 - rise), 0.065 * S, 0.07 * S, 0, skin),
        cap(...P(0.08, -0.89 - rise), ...P(0.115, -0.87 - rise), 0.02 * S, 0.015 * S, skin),
        ell(...P(0.04, -0.95 - rise), 0.15 * S, 0.028 * S, 0, straw),
        ell(...P(0.03, -0.99 - rise), 0.075 * S, 0.05 * S, 0, straw),
      ],
      this.lighting,
      0.7,
    )
  }

  // A few crows wheeling over the corn, flapping lazily.
  private drawCrows() {
    const H = this.H
    for (let i = 0; i < 3; i++) {
      const a = this.creatureTime * (0.5 + i * 0.1) + i * 2.1
      const x = (0.17 * this.A + Math.cos(a) * (0.08 + i * 0.03)) * H
      const y = (0.42 + Math.sin(a) * 0.03) * H
      const flap = Math.sin(this.time * 6 + i * 2)
      const s = 0.03 * H
      const c = this.paint(BLACK)
      this.shape(
        [ell(x, y, 0.35 * s, 0.15 * s, 0, c), cap(x, y, x - s, y - s * (0.2 + flap * 0.5), 0.12 * s, 0.04 * s, c), cap(x, y, x + s, y - s * (0.2 + flap * 0.5), 0.12 * s, 0.04 * s, c)],
        this.lighting,
        0.4,
      )
    }
  }

  // Now and then a red tractor chugs along the road, wheels turning and puffing smoke.
  private stepTractor(dt: number) {
    const t = this.tractor
    for (const p of this.smoke) {
      p.age += dt
      p.y -= 0.02 * dt
      p.x -= t.dir * 0.01 * dt
    }
    this.smoke = this.smoke.filter((p) => p.age < 4)
    if (t.x < -5) {
      t.next -= dt
      if (t.next > 0) return
      t.dir = Math.random() < 0.5 ? 1 : -1
      t.x = t.dir > 0 ? -0.15 : this.A + 0.15
      return
    }
    t.x += t.dir * 0.05 * dt
    t.wheel += (t.dir * 0.05 * dt) / 0.026
    if (Math.floor(this.time * 2) !== Math.floor((this.time - dt) * 2)) this.smoke.push({ x: t.x + t.dir * 0.03, y: this.roadY(t.x) - 0.075, age: 0 })
    if (t.x < -0.3 || t.x > this.A + 0.3) {
      t.x = -9
      t.next = rand(40, 75)
    }
  }

  private drawTractor() {
    const H = this.H
    for (const p of this.smoke) {
      const k = (1 - p.age / 4) * 0.35
      const c = this.paint([0.6, 0.6, 0.62])
      this.disc(p.x * H, p.y * H, (0.006 + p.age * 0.005) * H, c[0], c[1], c[2], k)
    }
    const t = this.tractor
    if (t.x < -5) return
    const S = 0.12 * H
    const x = t.x * H
    const y = (this.roadY(t.x) + 0.004) * H
    const P = (u: number, v: number): [number, number] => [x + u * t.dir * S, y + v * S]
    const red = this.paint([0.75, 0.1, 0.08])
    this.polygon([P(-0.1, -0.45), P(0.42, -0.4), P(0.48, -0.2), P(-0.1, -0.2)], red)
    this.polygon([P(-0.4, -0.78), P(-0.08, -0.78), P(-0.08, -0.4), P(-0.4, -0.4)], this.paint([0.15, 0.12, 0.12]))
    this.polygon([P(-0.36, -0.74), P(-0.12, -0.74), P(-0.12, -0.46), P(-0.36, -0.46)], this.paint([0.4, 0.6, 0.7]))
    this.shape([cap(...P(0.25, -0.42), ...P(0.25, -0.62), 0.02 * S, 0.02 * S, this.paint([0.15, 0.15, 0.15]))], this.lighting, 0.4)
    for (const [u, R] of [[-0.25, 0.22], [0.33, 0.12]] as const) {
      const [cx, cy] = P(u, -R)
      const parts: Part[] = [ell(cx, cy, R * S, R * S, 0, this.paint([0.08, 0.08, 0.08])), ell(cx, cy, R * 0.55 * S, R * 0.55 * S, 0, this.paint([0.9, 0.75, 0.1]))]
      this.shape(parts, this.lighting, 0.5)
      for (let k = 0; k < 4; k++) {
        const a = t.wheel * (0.22 / R) + (k / 4) * Math.PI
        this.shape([cap(cx - Math.cos(a) * R * 0.5 * S, cy - Math.sin(a) * R * 0.5 * S, cx + Math.cos(a) * R * 0.5 * S, cy + Math.sin(a) * R * 0.5 * S, 0.012 * S, 0.012 * S, this.paint([0.6, 0.5, 0.08]))], this.lighting, 0)
      }
    }
  }

  private stepEgg(dt: number, cdt: number) {
    const e = this.egg
    const c = e.cow
    if (!c) {
      e.wait -= dt
      if (e.wait > 0) return
      e.cow = { x: this.A + 0.15, y: 0.83, wx: 0, wy: 0, wanderT: 0, face: -1, phase: 0, graze: 0, rest: 0, look: 0, moving: true, g: gait(-1) }
      e.t = -1
      return
    }
    if (e.t < 0) {
      c.x -= 0.03 * cdt
      stepGait(c.g, (0.03 * cdt) / (0.055 * this.depthScale(c.y)), cdt, -1)
      if (c.x > 0.9 * this.A) return
      c.moving = false
      e.t = 0
      return
    }
    e.t += dt
    c.phase += cdt * 1.5
    stepGait(c.g, 0, cdt, -1)
    // Grazing until the beam comes on, then head up in surprise.
    c.graze = e.t < 11 ? Math.min(1, c.graze + cdt * 0.8) : Math.max(0, c.graze - dt * 2)
    if (e.t < 36) return
    e.cow = undefined
    e.wait = eggWait(true) * TIME_SCALE
  }

  // The saucer glides in from the upper right, hovers over the cow, lifts it up a beam of green light, and leaves.
  private drawEgg() {
    const { A, H, W } = this
    const e = this.egg
    const c = e.cow
    if (!c) return
    if (e.t < 0) {
      this.drawCow(c)
      return
    }
    const t = e.t
    const arrive = smoothstep(0, 10, t)
    const leave = smoothstep(26, 36, t) ** 2
    const ux = lerp(lerp(A + 0.3, c.x, arrive), -0.4, leave)
    const uy = lerp(lerp(0.1, c.y - 0.4, arrive), -0.2, leave) + Math.sin(this.time * 1.5) * 0.005
    const beam = smoothstep(10, 12, t) * (1 - smoothstep(23, 25, t))
    if (beam > 0) {
      const top = (uy + 0.02) * H
      const bottom = (c.y + 0.01) * H
      for (let y = Math.max(0, Math.floor(top)); y < Math.min(H, bottom); y++) {
        const f = (y - top) / (bottom - top)
        const half = lerp(0.025, 0.075, f) * H
        const k = beam * 0.32 * (0.85 + 0.15 * Math.sin(y * 0.4 - this.time * 6)) * (1 - 0.4 * f)
        for (let x = Math.max(0, Math.floor(ux * H - half)); x < Math.min(W, ux * H + half); x++) {
          const a = k * smoothstep(1, 0.7, Math.abs(x + 0.5 - ux * H) / half)
          this.add(x, y, 0.3 * a, 1 * a, 0.6 * a)
        }
      }
    }
    const rise = smoothstep(13, 24, t)
    if (t < 24) this.drawCow(c, rise * (c.y - uy - 0.025), lerp(1, 0.35, rise))
    const x = ux * H
    const y = uy * H
    this.shape([ell(x, y - 0.016 * H, 0.04 * H, 0.03 * H, 0, this.paint([0.45, 0.75, 0.85])), ell(x, y, 0.09 * H, 0.022 * H, 0, this.paint([0.6, 0.62, 0.66]))], this.lighting, 0.8)
    for (let i = 0; i < 6; i++) {
      const on = Math.floor(this.time * 4) % 6 === i ? 2 : 0.4
      const color = [[1, 0.2, 0.2], [0.2, 1, 0.3], [0.3, 0.5, 1]][i % 3]
      this.add(x + Math.cos((i / 5) * Math.PI) * 0.075 * H, y + 0.008 * H, color[0] * on, color[1] * on, color[2] * on)
    }
  }

  // Fireflies blinking over the fields at night.
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

function lerpRGB(a: RGB, b: RGB, t: number): RGB {
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)]
}

// A gust flattens the grass as it passes, turning up the paler side of the blades in soft streaks.
function lightenGrass(hdr: Float32Array, W: number, H: number, pasture: Int32Array, gusts: Float32Array) {
  for (let k = 0; k < pasture.length; k++) {
    const p = pasture[k]
    const x = p % W
    const g = gusts[x]
    if (g < 0.01) continue
    const y = (p - x) / W
    const m = 1 + 0.1 * g * (0.4 + 0.6 * Math.sin(((x - y * 1.4) / H) * 55) ** 2)
    hdr[p * 3] *= m
    hdr[p * 3 + 1] *= m
    hdr[p * 3 + 2] *= m
  }
}

export const farm: Wallpaper = {
  id: "farm",
  name: "Farm",
  description: "Rolling fields with a red barn, a turning windmill and swaying corn, and a tractor now and then",
  activity: {
    calm: "Barn, windmill, fields and corn",
    lively: "Adds grazing cows and pecking chickens",
    teeming: "Adds a farmer, pigs in the mud and crows over the corn",
  },
  scrim: {
    day: [
      [20, 40, 70],
      [24, 40, 20],
      [14, 28, 10],
    ],
    sunset: [
      [16, 18, 34],
      [40, 28, 14],
      [14, 12, 6],
    ],
    night: [
      [4, 6, 16],
      [4, 6, 14],
      [2, 4, 6],
    ],
  },
  create: (settings) => new Farm(settings),
}
