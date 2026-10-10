import { Canvas, cap, ell, type Lighting, type Part } from "../src/canvas"
import { eggWait } from "../src/egg"
import { lightPool } from "../src/light"
import { TAU, clamp, fbm1, hash, lerp, rand, smoothstep, type RGB } from "../src/math"
import { driftClouds, makeClouds, makeStars, makeStorm, paintClouds, paintSky, paintStars, paintStorm, type Cloud, type Orb, type Star } from "../src/sky"
import type { Activity, Settings, Time, Wallpaper } from "../src/wallpaper"
import { WeatherLayer } from "../src/weather"

// The scene runs slower than real time, which keeps it calm behind text.
const TIME_SCALE = 0.35
// Animals and people move at a quarter of scene speed.
const CREATURE_SPEED = 0.25
const HORIZON = 0.55
// How long the yeti's visit and a penguin's two hops last, in creature time.
const YETI = 12
const HOP = 0.2

// What changes with the time of day. Snow, ice and mountains get their own colors (never plain white at night);
// animals and objects have one daytime color each, darkened by tint at sunset and night.
interface Look {
  style: "rim" | "front"
  light: RGB
  sky: [number, RGB][]
  orb: Orb
  stars: number
  clouds: { puffy: boolean; top: RGB; bottom: RGB; alpha: number }
  snow: RGB
  shade: RGB
  rock: RGB
  peaks: RGB
  ice: RGB
  flakes: RGB
  tint: RGB
  aurora: number
  glow: number
}

const LOOKS: Record<Time, Look> = {
  day: {
    style: "front",
    light: [1, 0.97, 0.9],
    sky: [
      [0, [0.2, 0.42, 0.75]],
      [0.3, [0.4, 0.62, 0.85]],
      [HORIZON, [0.75, 0.85, 0.92]],
    ],
    orb: { x: 0.78, y: 0.22, r: 0.032, core: [4.5, 4.3, 3.8], glow: [1, 0.95, 0.85], near: 0.4, wide: 0.12 },
    stars: 0,
    clouds: { puffy: true, top: [1.05, 1.08, 1.12], bottom: [0.62, 0.7, 0.82], alpha: 0.85 },
    snow: [0.8, 0.87, 0.95],
    shade: [0.55, 0.66, 0.85],
    rock: [0.35, 0.4, 0.5],
    peaks: [0.85, 0.9, 0.97],
    ice: [0.55, 0.75, 0.88],
    flakes: [0.9, 0.94, 1],
    tint: [1, 1, 1],
    aurora: 0,
    glow: 0,
  },
  sunset: {
    style: "rim",
    light: [1, 0.55, 0.35],
    sky: [
      [0, [0.08, 0.05, 0.18]],
      [0.3, [0.3, 0.12, 0.3]],
      [0.45, [0.8, 0.35, 0.35]],
      [HORIZON, [1, 0.6, 0.35]],
    ],
    orb: { x: 0.62, y: 0.53, r: 0.055, core: [3, 1.6, 0.9], glow: [1, 0.45, 0.3], near: 0.5, wide: 0.22 },
    stars: 25,
    clouds: { puffy: false, top: [0.12, 0.05, 0.12], bottom: [0.85, 0.35, 0.3], alpha: 0.55 },
    snow: [0.72, 0.42, 0.48],
    shade: [0.3, 0.18, 0.38],
    rock: [0.25, 0.12, 0.2],
    peaks: [1, 0.55, 0.55],
    ice: [0.6, 0.35, 0.45],
    flakes: [1, 0.7, 0.75],
    tint: [0.3, 0.17, 0.2],
    aurora: 0.15,
    glow: 0.6,
  },
  night: {
    style: "rim",
    light: [0.3, 0.65, 1.5],
    sky: [
      [0, [0.004, 0.01, 0.035]],
      [0.3, [0.012, 0.03, 0.08]],
      [0.45, [0.025, 0.055, 0.14]],
      [HORIZON, [0.05, 0.1, 0.24]],
    ],
    orb: { x: 0.2, y: 0.14, r: 0.03, core: [1, 0.72, 0.3], glow: [0.45, 0.3, 0.12], near: 0.2, wide: 0.08, moon: true },
    stars: 120,
    clouds: { puffy: false, top: [0.015, 0.02, 0.05], bottom: [0.06, 0.1, 0.3], alpha: 0.35 },
    snow: [0.05, 0.12, 0.3],
    shade: [0.02, 0.05, 0.14],
    rock: [0.02, 0.04, 0.09],
    peaks: [0.08, 0.16, 0.36],
    ice: [0.04, 0.12, 0.25],
    flakes: [0.25, 0.45, 0.9],
    tint: [0.03, 0.06, 0.14],
    aurora: 1,
    glow: 1,
  },
}

// Daylight comes from the upper right, slightly in front of the scene.
const DAYLIGHT = (() => {
  const l = Math.hypot(0.5, 0.55, 0.65)
  return [0.5 / l, -0.55 / l, 0.65 / l] as const
})()

// Igloos: x as a fraction of the width, base and radius in screen heights.
const IGLOOS = [
  [0.86, 0.7, 0.055],
  [0.2, 0.75, 0.075],
] as const

// Daytime colors.
const PINE: RGB = [0.1, 0.25, 0.18]
const FUR: RGB = [0.93, 0.91, 0.86]
const DARK: RGB = [0.05, 0.05, 0.08]
const ORANGE: RGB = [0.95, 0.5, 0.1]

interface Walker {
  x: number
  y: number
  wx: number
  wy: number
  wanderT: number
  face: number
  phase: number
  rest: number
  moving: boolean
  // Creature time into a hop after a click; negative while waiting its turn, Infinity when not hopping.
  hop: number
}

class Tundra extends Canvas {
  private time = 0
  private creatureTime = 0
  private readonly activity: Activity
  private readonly look: Look
  private lighting: Lighting = { style: "front", dir: DAYLIGHT }
  private background = new Float32Array(0)
  private stars: Star[]
  private clouds: Cloud[]
  private storm = makeStorm()
  private flakes: { x: number; y: number; z: number; s: number }[]
  private owl = { x: -9, y: 0.25, dir: 1, next: 14, phase: 0 }
  private penguins: Walker[] = []
  private fox: Walker | undefined
  private bear: Walker | undefined
  private fisher = { tug: 0, next: 8 }
  // The easter egg: a yeti looms out of the snow on the far field, looks about, waves and fades away. t is creature
  // time since it began.
  private yeti = { wait: eggWait() * TIME_SCALE, t: -1, x: 0 }
  private readonly weather: WeatherLayer

  constructor(settings: Settings) {
    super()
    this.activity = settings.activity
    this.look = LOOKS[settings.time]
    this.stars = makeStars(this.look.stars, 0.45)
    this.clouds = makeClouds(this.look.clouds.puffy ? 3 : 4, this.look.clouds.puffy, 0.06, 0.28)
    // Its own gentle snowfall under a clear sky, unless weather is chosen.
    this.weather = new WeatherLayer(settings.weather ?? "clear", settings.time, HORIZON)
    this.flakes = Array.from({ length: settings.weather ? 0 : { calm: 70, lively: 100, teeming: 130 }[settings.activity] }, () => ({ x: Math.random() * 4, y: Math.random(), z: Math.random(), s: Math.random() }))
    const walker = (x: number, y: number): Walker => ({ x, y, wx: x, wy: y, wanderT: 0, face: 1, phase: Math.random() * TAU, rest: 0, moving: false, hop: Infinity })
    if (settings.activity !== "calm") {
      this.penguins = Array.from({ length: settings.activity === "teeming" ? 5 : 3 }, (_, i) => walker(0.6 + i * 0.12, 0.78 + (i % 2) * 0.015))
      this.fox = walker(0.9, 0.88)
    }
    if (settings.activity === "teeming") this.bear = walker(0.7, 0.655)
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
    for (const f of this.flakes) {
      f.y += (0.02 + f.z * 0.035) * dt
      f.x += (Math.sin(this.time * 0.6 + f.s * 20) * 0.006 + 0.004) * dt
      if (f.y > 1) {
        f.y -= 1
        f.x = Math.random() * this.A
      }
      if (f.x > this.A) f.x -= this.A
    }
    this.stepOwl(dt)
    const A = this.A
    for (const p of this.penguins) this.wander(p, cdt, [0.34 * A, 0.58 * A, 0.77, 0.81], 0.025)
    if (this.fox) this.wander(this.fox, cdt, [0.3 * A, 0.95 * A, 0.84, 0.92], 0.04)
    if (this.bear) this.wander(this.bear, cdt, [0.25 * A, 0.85 * A, 0.648, 0.662], 0.025)
    const f = this.fisher
    f.next -= cdt
    if (f.next <= 0) {
      f.tug = 1
      f.next = rand(6, 14)
    }
    f.tug = Math.max(0, f.tug - cdt * 1.5)
    for (const p of this.penguins) p.hop += cdt
    const y = this.yeti
    if (y.t < 0) {
      y.wait -= dt
      if (y.wait > 0) return
      y.t = 0
      y.x = rand(0.56, 0.6) * this.A
      return
    }
    y.t += cdt
    if (y.t < YETI) return
    y.t = -1
    y.wait = eggWait(true) * TIME_SCALE
  }

  // The penguins hop, one after another, nearest the click first.
  poke(x: number, y: number) {
    const order = [...this.penguins].sort((a, b) => Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y))
    order.forEach((p, i) => {
      if (p.hop < HOP) return
      p.hop = -i * 0.03
    })
  }

  render() {
    this.hdr.set(this.background)
    if (!this.weather.covered) paintStars(this.hdr, this.W, this.H, this.stars, this.time, 0.5, this.look.stars > 50 ? 0.5 : 0.3)
    if (this.look.aurora > 0 && !this.weather.covered) this.drawAurora()
    const [top, bottom] = this.weather.scud ?? [this.look.clouds.top, this.look.clouds.bottom]
    paintClouds(this.hdr, this.W, this.H, this.clouds, top, bottom, this.look.clouds.alpha, this.look.clouds.puffy)
    paintStorm(this.hdr, this.W, this.H, this.storm, this.look.clouds.top, this.look.clouds.bottom, this.gloom)
    if (this.owl.x > -5) this.drawOwl()
    if (this.yeti.t >= 0) this.drawYeti()
    if (this.bear) this.drawBear(this.bear)
    if (this.activity === "teeming") this.drawFisher()
    for (const p of [...this.penguins].sort((a, b) => a.y - b.y)) this.drawPenguin(p)
    if (this.fox) this.drawFox(this.fox)
    // At night the igloo doors' warm light falls across the snow and anything passing them.
    if (this.look.glow === 1)
      for (const [fx, base, R] of IGLOOS) lightPool(this.hdr, this.W, this.H, (fx * this.A - R * 0.35) * this.H, (base + 0.01) * this.H, R * 3.2 * this.H, R * 1.1 * this.H, [1, 0.42, 0.08], 1, 0.03)
    this.drawFlakes()
    this.weather.draw(this.hdr, this.W, this.H)
    this.finish()
  }

  protected override visit() {
    if (this.owl.x < -5) this.owl.next = 0
  }

  // Everything that never moves is painted once per size into `background`, then copied in each frame.
  protected override layout() {
    const { W, H, A, look } = this
    this.lighting = look.style === "front" ? { style: "front", dir: DAYLIGHT } : { style: "rim", color: look.light, x: look.orb.x * W, y: look.orb.y * H }
    paintSky(this.hdr, W, H, look.sky, look.orb)
    this.weather.cover(this.hdr, W, H)
    this.drawMountains()
    // Gentle drifts near the horizon, then the snowfield sweeping to the bottom of the screen.
    const drift = new Float32Array(W)
    for (let x = 0; x < W; x++) drift[x] = (0.6 + 0.012 * Math.sin((x / H) * 2.4 + 1) + 0.01 * fbm1((x / H) * 3, 4)) * H
    for (let x = 0; x < W; x++)
      for (let y = Math.max(0, Math.floor(drift[x])); y < H; y++) {
        const v = y / H
        const waves = 0.5 + 0.5 * Math.sin((x / H) * 6 + v * 40 + fbm1(x * 0.02, 3) * 4)
        const k = smoothstep(0.3, 1, waves) * 0.35 * (1 - (v - 0.6) * 0.8)
        const c = lerpRGB(look.snow, look.shade, k)
        const edge = look.style === "rim" ? Math.exp(-(y + 0.5 - drift[x]) / 2) * 0.3 : 0
        this.blend((y * W + x) * 3, c[0] + look.light[0] * edge, c[1] + look.light[1] * edge, c[2] + look.light[2] * edge, clamp(y + 1 - drift[x], 0, 1))
      }
    this.drawLake(0.5 * A, 0.72, 0.3, 0.045)
    for (const [fx, h] of [[0.3, 0.1], [0.36, 0.08], [0.7, 0.09], [0.76, 0.11]] as const) this.drawPine(fx * A, 0.625, h, 0.5)
    for (const [fx, base, R] of IGLOOS) this.drawIgloo(fx * A, base, R)
    if (this.activity === "teeming") this.drawSnowman(0.3 * A, 0.85, 0.75, [0.2, 0.35, 0.8], false)
    this.drawSnowman(0.62 * A, 0.87, 1, [0.8, 0.12, 0.1], true)
    for (const [fx, h] of [[0.04, 0.46], [0.11, 0.34], [0.955, 0.42], [0.995, 0.3]] as const) this.drawPine(fx * A, 1.02, h, 0)
    this.background = this.hdr.slice()
  }

  private paint(c: RGB): RGB {
    const t = this.look.tint
    return [c[0] * t[0], c[1] * t[1], c[2] * t[2]]
  }

  // Jagged peaks with snowcaps above a ragged snow line; faces turned toward the light are brighter.
  private drawMountains() {
    const { W, H, A, look } = this
    const count = Math.max(4, Math.round(A * 5))
    const peaks = Array.from({ length: count }, (_, i) => ({ c: (i + 0.5 + (hash(i * 3.3) - 0.5) * 0.6) * (A / count), h: 0.08 + hash(i * 5.1) * 0.13, w: 0.12 + hash(i * 7.9) * 0.1 }))
    const top = new Float32Array(W)
    for (let x = 0; x < W; x++) {
      const u = x / H
      const height = peaks.reduce((m, p) => Math.max(m, p.h * (1 - Math.abs(u - p.c) / p.w)), 0)
      top[x] = (HORIZON + 0.02 - height - (fbm1(u * 25, 2) - 0.5) * 0.008) * H
    }
    for (let x = 0; x < W; x++) {
      const slope = (top[Math.min(W - 1, x + 1)] - top[Math.max(0, x - 1)]) / 2
      const snowLine = (HORIZON - 0.06 + (fbm1((x / H) * 8, 6) - 0.5) * 0.04) * H
      for (let y = Math.max(0, Math.floor(top[x])); y < (HORIZON + 0.06) * H; y++) {
        const haze = clamp((y / H - 0.35) * 1.2, 0, 0.4)
        let c = y < snowLine ? look.peaks : look.rock
        if (look.style === "front") c = scaleRGB(c, slope > 0.3 ? 1.05 : slope < -0.3 ? 0.72 : 0.9)
        const edge = look.style === "rim" ? Math.exp(-(y + 0.5 - top[x]) / 1.8) * 0.5 : 0
        c = lerpRGB(c, look.sky[look.sky.length - 1][1], haze * 0.5)
        this.blend((y * W + x) * 3, c[0] + look.light[0] * edge, c[1] + look.light[1] * edge, c[2] + look.light[2] * edge, clamp(y + 1 - top[x], 0, 1))
      }
    }
  }

  // A frozen lake with a few cracks in the ice.
  private drawLake(cx: number, cy: number, rx: number, ry: number) {
    const H = this.H
    const ice = this.look.ice
    this.shape([ell(cx * H, cy * H, rx * H, ry * H, 0, ice)], this.lighting, 0.3)
    const crack = scaleRGB(ice, 0.7)
    for (let i = 0; i < 5; i++) {
      const x0 = cx + (hash(i * 3.7) - 0.5) * rx * 1.4
      const y0 = cy + (hash(i * 5.3) - 0.5) * ry
      const parts: Part[] = []
      let [x, y] = [x0, y0]
      for (let s = 0; s < 4; s++) {
        const nx = x + (hash(i * 9 + s) - 0.4) * 0.04
        const ny = y + (hash(i * 11 + s) - 0.5) * 0.012
        parts.push(cap(x * H, y * H, nx * H, ny * H, 0.0015 * H, 0.001 * H, crack))
        ;[x, y] = [nx, ny]
      }
      this.shape(parts, this.lighting, 0)
    }
  }

  // A snow-laden pine: stacked tiers of dark green, each with a cap of snow. haze fades distant ones.
  private drawPine(x: number, base: number, h: number, haze: number) {
    const H = this.H
    const sky = this.look.sky[this.look.sky.length - 1][1]
    const green = lerpRGB(this.paint(PINE), sky, haze * 0.5)
    const snow = lerpRGB(this.look.peaks, sky, haze * 0.4)
    this.polygon(
      [
        [(x - h * 0.03) * H, base * H],
        [(x + h * 0.03) * H, base * H],
        [(x + h * 0.03) * H, (base - h * 0.15) * H],
        [(x - h * 0.03) * H, (base - h * 0.15) * H],
      ],
      this.paint([0.3, 0.2, 0.12]),
    )
    for (let t = 0; t < 4; t++) {
      const y0 = base - h * (0.12 + t * 0.21)
      const w = h * (0.32 - t * 0.065)
      const peak = y0 - h * 0.32
      this.polygon([[(x - w) * H, y0 * H], [x * H, peak * H], [(x + w) * H, y0 * H]], green)
      this.polygon([[(x - w * 0.55) * H, (peak + (y0 - peak) * 0.55) * H], [x * H, peak * H], [(x + w * 0.55) * H, (peak + (y0 - peak) * 0.55) * H], [x * H, (peak + (y0 - peak) * 0.4) * H]], snow)
    }
  }

  // An igloo: a dome of snow blocks with an entrance tunnel; at sunset and night warm light spills from the door.
  private drawIgloo(cx: number, base: number, R: number) {
    const H = this.H
    const dome = (x: number, r: number, h: number) => Array.from({ length: 25 }, (_, i) => [(x + Math.cos((i / 24) * Math.PI) * r) * H, (base - Math.sin((i / 24) * Math.PI) * h) * H] as const)
    // Snow on snow needs contrast: a cooler dome, a lit upper-left face and darker seams.
    const block = lerpRGB(this.look.snow, this.look.shade, 0.5)
    const seam = this.look.shade
    this.polygon(dome(cx, R, R * 0.85), block)
    this.polygon(
      dome(cx - R * 0.15, R * 0.75, R * 0.72).map(([x, y]) => [x, y - R * 0.04 * H] as const),
      lerpRGB(this.look.snow, this.look.peaks, 0.7),
      0.55,
    )
    const lines: Part[] = []
    for (let row = 1; row < 4; row++) {
      const yy = base - (row / 4) * R * 0.85
      const half = R * Math.sqrt(1 - (row / 4) ** 2)
      lines.push(cap((cx - half) * H, yy * H, (cx + half) * H, yy * H, 0.0018 * H, 0.0018 * H, seam))
      for (let k = 0; k < 4; k++) {
        const sx = cx + (((k + (row % 2) * 0.5) / 4) * 2 - 1) * half * 0.85
        lines.push(cap(sx * H, yy * H, sx * H, (yy + R * 0.21) * H, 0.001 * H, 0.001 * H, seam))
      }
    }
    this.shape(lines, this.lighting, 0)
    const door = cx - R * 0.35
    this.polygon(dome(door, R * 0.38, R * 0.42), block)
    const k = this.look.glow
    const dark = this.paint(DARK)
    this.polygon(dome(door, R * 0.2, R * 0.27), [lerp(dark[0], 1.4, k), lerp(dark[1], 0.75, k), lerp(dark[2], 0.25, k)])
    if (k <= 0) return
    const gx = door * H
    const gy = (base + 0.01) * H
    const r = R * 1.6 * H
    for (let y = Math.max(0, Math.floor(gy - r * 0.5)); y < Math.min(H, gy + r * 0.4); y++)
      for (let x = Math.max(0, Math.floor(gx - r)); x < Math.min(this.W, gx + r); x++) {
        const d = Math.hypot((x - gx) / r, (y - gy) / (r * 0.4))
        if (d >= 1) continue
        const a = (1 - d) ** 2 * 0.3 * k
        this.add(x, y, a, 0.55 * a, 0.18 * a)
      }
  }

  // A three-ball snowman with coal eyes and buttons, a carrot nose, stick arms and a scarf; the front one wears a
  // top hat.
  private drawSnowman(cx: number, base: number, scale: number, scarf: RGB, hat: boolean) {
    const H = this.H
    const S = 0.1 * H * scale
    const x = cx * H
    const y = base * H
    const P = (u: number, v: number): [number, number] => [x + u * S, y + v * S]
    const body = lerpRGB(this.look.snow, this.look.peaks, 0.6)
    const stick = this.paint([0.35, 0.22, 0.12])
    this.shape([cap(...P(-0.25, -0.95), ...P(-0.6, -1.15), 0.025 * S, 0.015 * S, stick), cap(...P(-0.5, -1.08), ...P(-0.58, -1.25), 0.015 * S, 0.01 * S, stick), cap(...P(0.25, -0.95), ...P(0.62, -1.12), 0.025 * S, 0.015 * S, stick)], this.lighting, 0.5)
    this.shape([ell(...P(0, -0.42), 0.45 * S, 0.42 * S, 0, body), ell(...P(0, -1.0), 0.33 * S, 0.31 * S, 0, body), ell(...P(0, -1.48), 0.24 * S, 0.23 * S, 0, body)], this.lighting, 0.8)
    const coal = this.paint(DARK)
    this.shape([ell(...P(-0.08, -1.53), 0.035 * S, 0.035 * S, 0, coal), ell(...P(0.08, -1.53), 0.035 * S, 0.035 * S, 0, coal), ...[-0.85, -1.0, -1.15].map((v) => ell(...P(0, v), 0.035 * S, 0.035 * S, 0, coal))], this.lighting, 0)
    this.shape([cap(...P(0.02, -1.46), ...P(0.3, -1.42), 0.045 * S, 0.008 * S, this.paint(ORANGE))], this.lighting, 0.5)
    this.shape([cap(...P(-0.24, -1.27), ...P(0.24, -1.27), 0.05 * S, 0.05 * S, this.paint(scarf)), cap(...P(0.14, -1.27), ...P(0.2, -1.02), 0.045 * S, 0.04 * S, this.paint(scarf))], this.lighting, 0.6)
    if (!hat) return
    const black = this.paint([0.06, 0.06, 0.08])
    this.polygon([P(-0.3, -1.66), P(0.3, -1.66), P(0.3, -1.62), P(-0.3, -1.62)], black)
    this.polygon([P(-0.18, -1.95), P(0.18, -1.95), P(0.18, -1.65), P(-0.18, -1.65)], black)
  }

  // The aurora: curtains with a bright green lower edge fading up into violet, folding and drifting slowly.
  private drawAurora() {
    const { W, H, hdr, look } = this
    const t = this.time
    for (let x = 0; x < W; x++) {
      const u = x / H
      const band = (0.17 + 0.05 * Math.sin(u * 1.7 + t * 0.07) + 0.03 * Math.sin(u * 4.1 - t * 0.05)) * H
      const fold = 0.35 + 0.65 * Math.pow(0.5 + 0.5 * Math.sin(u * 14 + Math.sin(u * 3 + t * 0.1) * 3 + t * 0.15), 2)
      for (let y = 0; y < Math.min(H, band + 0.05 * H); y++) {
        const above = band - y
        const k = (above > 0 ? Math.exp(-above / (0.12 * H)) : Math.exp(-((above / (0.015 * H)) ** 2))) * fold * 0.35 * look.aurora
        if (k < 0.003) continue
        const violet = clamp(above / (0.15 * H), 0, 1)
        const o = (y * W + x) * 3
        hdr[o] += k * lerp(0.1, 0.6, violet)
        hdr[o + 1] += k * lerp(1, 0.2, violet)
        hdr[o + 2] += k * lerp(0.5, 0.9, violet)
      }
    }
  }

  private drawFlakes() {
    const { H, look } = this
    for (const f of this.flakes) {
      const k = (0.12 + f.z * 0.25) * (0.6 + 0.4 * f.s)
      const [x, y] = [f.x * H, f.y * H]
      if (f.z > 0.75) this.disc(x, y, 1.1, look.flakes[0] * k * 2, look.flakes[1] * k * 2, look.flakes[2] * k * 2, 0.5)
      else this.add(x, y, look.flakes[0] * k, look.flakes[1] * k, look.flakes[2] * k)
    }
  }

  private wander(w: Walker, dt: number, zone: [number, number, number, number], speed: number) {
    w.phase += dt * (w.moving ? 6 : 1)
    if (w.rest > 0) {
      w.rest -= dt
      w.moving = false
      return
    }
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
      w.rest = rand(3, 8)
      w.wanderT = 0
      return
    }
    w.moving = true
    if (Math.abs(dx) > 0.005) w.face = Math.sign(dx)
    w.x += (dx / d) * speed * dt
    w.y += (dy / d) * speed * dt
  }

  private depthScale(y: number) {
    return 0.55 + (y - 0.65) * 2.5
  }

  // A penguin waddling side to side, flippers out.
  private drawPenguin(p: Walker) {
    const H = this.H
    const S = 0.07 * H * this.depthScale(p.y)
    const rock = p.moving ? Math.sin(p.phase) * 0.14 : Math.sin(p.phase) * 0.03
    const x = p.x * H
    const y = (p.y - (p.hop >= 0 && p.hop < HOP ? Math.abs(Math.sin((p.hop / HOP) * TAU)) * 0.025 * this.depthScale(p.y) : 0)) * H
    const cr = Math.cos(rock)
    const sr = Math.sin(rock)
    const P = (u: number, v: number): [number, number] => [x + (u * p.face * cr - v * sr) * S, y + (u * p.face * sr + v * cr) * S]
    const black = this.paint(DARK)
    const belly = this.paint([0.92, 0.92, 0.95])
    const orange = this.paint(ORANGE)
    this.shape(
      [
        ell(...P(0.06, -0.02), 0.1 * S, 0.035 * S, 0, orange),
        ell(...P(-0.08, -0.02), 0.1 * S, 0.035 * S, 0, orange),
        ell(...P(0, -0.42), 0.22 * S, 0.4 * S, rock, black),
        cap(...P(-0.05, -0.62), ...P(-0.2, -0.32), 0.06 * S, 0.03 * S, black),
        ell(...P(0.03, -0.82), 0.15 * S, 0.14 * S, 0, black),
      ],
      this.lighting,
      0.6,
    )
    this.shape([ell(...P(0.07, -0.38), 0.13 * S, 0.3 * S, rock, belly)], this.lighting, 0.6)
    this.shape([cap(...P(0.13, -0.84), ...P(0.26, -0.81), 0.035 * S, 0.012 * S, orange)], this.lighting, 0.5)
    this.add(...P(0.09, -0.86), 0.5, 0.5, 0.5)
  }

  // A shaggy silhouette on the far snowfield, fading in and out of the falling snow. It stands, looks around, shuffles
  // a few steps and raises an arm before it fades. Fading blends toward the snow behind it rather than using alpha,
  // so overlapping parts don't show through each other.
  private drawYeti() {
    const { H, look } = this
    const t = this.yeti.t
    const fade = smoothstep(0, 1.5, t) * (1 - smoothstep(10, 12, t))
    const walk = smoothstep(4, 8, t)
    const x = (this.yeti.x + walk * 0.06) * H
    const y = 0.645 * H
    const S = 0.1 * H
    const P = (u: number, v: number): [number, number] => [x + u * S, y + v * S]
    const step = t > 4 && t < 8 ? Math.sin(t * 6) * 0.06 : 0
    const turn = Math.sin(clamp((t - 1.5) / 2.5, 0, 1) * TAU) * 0.04
    const wave = smoothstep(8, 8.6, t) * (1 - smoothstep(9.6, 10, t))
    const c = lerpRGB(look.snow, scaleRGB(look.shade, 0.45), fade)
    this.shape(
      [
        cap(...P(-0.1, -0.4), ...P(-0.1 + step, 0), 0.075 * S, 0.06 * S, c),
        cap(...P(0.1, -0.4), ...P(0.1 - step, 0), 0.075 * S, 0.06 * S, c),
        ell(...P(0, -0.6), 0.22 * S, 0.3 * S, 0, c),
        ell(...P(0, -0.8), 0.26 * S, 0.14 * S, 0, c),
        ell(...P(turn, -0.98), 0.1 * S, 0.11 * S, 0, c),
        cap(...P(turn, -1.0), ...P(turn * 0.5, -1.1), 0.08 * S, 0.02 * S, c),
        cap(...P(-0.24, -0.8), ...P(-0.3, -0.36), 0.065 * S, 0.055 * S, c),
        cap(...P(0.24, -0.8), ...P(lerp(0.3, 0.42, wave), lerp(-0.36, -1.18, wave) + Math.sin(t * 9) * 0.04 * wave), 0.065 * S, 0.055 * S, c),
      ],
      this.lighting,
      0,
    )
    if (look.style === "rim") for (const s of [-1, 1]) this.add(...P(turn + s * 0.035, -0.99), 0.5 * fade, 0.3 * fade, 0.04 * fade)
  }

  // An arctic fox trotting across the snow, bushy tail out behind.
  private drawFox(f: Walker) {
    const H = this.H
    const S = 0.08 * H * this.depthScale(f.y)
    const x = f.x * H
    const y = f.y * H
    const P = (u: number, v: number): [number, number] => [x + u * f.face * S, y + v * S]
    const fur = this.paint(FUR)
    const swing = f.moving ? Math.sin(f.phase) * 0.08 : 0
    this.shape(
      [
        ...[[0.22, 1], [0.27, -1], [-0.2, -1], [-0.25, 1]].map(([u, s]) => cap(...P(u, -0.28), ...P(u + swing * s, 0), 0.035 * S, 0.028 * S, fur)),
        cap(...P(-0.32, -0.4), ...P(-0.7, -0.3), 0.1 * S, 0.06 * S, fur),
        ell(...P(0, -0.38), 0.34 * S, 0.14 * S, 0, fur),
        cap(...P(0.28, -0.42), ...P(0.4, -0.52), 0.09 * S, 0.08 * S, fur),
        ell(...P(0.44, -0.55), 0.11 * S, 0.09 * S, 0, fur),
        cap(...P(0.5, -0.53), ...P(0.62, -0.5), 0.05 * S, 0.02 * S, fur),
        cap(...P(0.4, -0.62), ...P(0.36, -0.74), 0.035 * S, 0.006 * S, fur),
        cap(...P(0.47, -0.62), ...P(0.46, -0.75), 0.035 * S, 0.006 * S, fur),
      ],
      this.lighting,
      0.7,
    )
    this.add(...P(0.62, -0.5), 0.02, 0.02, 0.02)
  }

  // A polar bear plodding along the far shore of the lake, head low.
  private drawBear(b: Walker) {
    const H = this.H
    const S = 0.13 * H * this.depthScale(b.y)
    const x = b.x * H
    const y = b.y * H
    const P = (u: number, v: number): [number, number] => [x + u * b.face * S, y + v * S]
    const fur = this.paint([0.95, 0.9, 0.74])
    const swing = b.moving ? Math.sin(b.phase * 0.8) * 0.06 : 0
    this.shape(
      [
        ...[[0.25, 1], [0.3, -1], [-0.22, -1], [-0.27, 1]].map(([u, s]) => cap(...P(u, -0.3), ...P(u + swing * s, 0), 0.07 * S, 0.06 * S, fur)),
        ell(...P(0, -0.38), 0.38 * S, 0.2 * S, 0, fur),
        ell(...P(-0.22, -0.42), 0.18 * S, 0.17 * S, 0, fur),
        cap(...P(0.3, -0.42), ...P(0.46, -0.34), 0.12 * S, 0.09 * S, fur),
        ell(...P(0.5, -0.32), 0.1 * S, 0.08 * S, 0.2 * b.face, fur),
        ell(...P(0.43, -0.42), 0.035 * S, 0.035 * S, 0, fur),
      ],
      this.lighting,
      0.7,
    )
    this.add(...P(0.6, -0.31), 0.02, 0.02, 0.02)
  }

  // Someone in a red parka ice fishing on the lake, rod tugging now and then.
  private drawFisher() {
    const H = this.H
    const S = 0.12 * H
    const hx = 0.68 * this.A * H
    const hy = 0.718 * H
    const x = hx + 0.06 * H
    const y = hy
    const P = (u: number, v: number): [number, number] => [x + u * S, y + v * S]
    this.shape([ell(hx, hy, 0.02 * H, 0.006 * H, 0, this.paint([0.05, 0.1, 0.18]))], this.lighting, 0)
    this.polygon([P(-0.12, 0), P(0.12, 0), P(0.1, -0.28), P(-0.1, -0.28)], this.paint([0.4, 0.45, 0.55]))
    const parka = this.paint([0.8, 0.15, 0.1])
    const lift = this.fisher.tug * 0.25
    const tip: [number, number] = [hx + 0.01 * H, hy - (0.09 + lift * 0.12) * H]
    this.shape(
      [
        cap(...P(-0.02, -0.3), ...P(-0.28, -0.32), 0.07 * S, 0.06 * S, this.paint([0.15, 0.15, 0.2])),
        cap(...P(-0.28, -0.32), ...P(-0.3, -0.05), 0.06 * S, 0.05 * S, this.paint([0.15, 0.15, 0.2])),
        cap(...P(0, -0.32), ...P(-0.02, -0.68), 0.15 * S, 0.12 * S, parka),
        cap(...P(-0.04, -0.58), ...P(-0.24, -0.45), 0.05 * S, 0.045 * S, parka),
        ell(...P(-0.03, -0.8), 0.13 * S, 0.13 * S, 0, parka),
        ell(...P(-0.06, -0.79), 0.08 * S, 0.09 * S, 0, this.paint([0.85, 0.65, 0.5])),
      ],
      this.lighting,
      0.6,
    )
    this.shape([cap(...P(-0.24, -0.45), ...tip, 0.012 * S, 0.006 * S, this.paint([0.3, 0.2, 0.12])), cap(...tip, hx, hy, 0.002 * H, 0.002 * H, this.paint([0.6, 0.6, 0.6]))], this.lighting, 0)
  }

  // Now and then a snowy owl glides across, wings spread.
  private stepOwl(dt: number) {
    const o = this.owl
    o.phase += dt
    if (o.x < -5) {
      o.next -= dt
      if (o.next > 0) return
      o.dir = Math.random() < 0.5 ? 1 : -1
      o.x = o.dir > 0 ? -0.15 : this.A + 0.15
      o.y = rand(0.2, 0.35)
      return
    }
    o.x += o.dir * 0.07 * dt
    if (o.x < -0.3 || o.x > this.A + 0.3) {
      o.x = -9
      o.next = rand(40, 75)
    }
  }

  private drawOwl() {
    const H = this.H
    const o = this.owl
    const S = 0.6 * H
    const x = o.x * H
    const y = (o.y + Math.sin(o.phase * 0.8) * 0.01) * H
    const P = (u: number, v: number): [number, number] => [x + u * S, y + v * S]
    const white = this.paint([0.92, 0.94, 0.97])
    const flex = Math.sin(o.phase * 1.5) * 0.008
    const parts: Part[] = [cap(...P(0, -0.006), ...P(0, 0.04), 0.016 * S, 0.012 * S, white), ell(...P(0, -0.02), 0.019 * S, 0.017 * S, 0, white)]
    for (const side of [-1, 1]) {
      const spine = (t: number): [number, number] => [side * (0.02 + 0.11 * t), -0.015 * t * t + flex * t * t]
      for (let i = 0; i < 5; i++) parts.push(cap(...P(...spine(i / 5)), ...P(...spine((i + 1) / 5)), 0.024 * (1 - 0.3 * (i / 5)) * S, 0.024 * (1 - 0.3 * ((i + 1) / 5)) * S, white))
      parts.push(ell(...P(...spine(0.95)), 0.02 * S, 0.015 * S, 0, white))
    }
    this.shape(parts, this.lighting, 0.6)
    for (const s of [-1, 1]) this.add(...P(s * 0.007, -0.022), 1, 0.75, 0.1)
  }
}

function lerpRGB(a: RGB, b: RGB, t: number): RGB {
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)]
}

function scaleRGB(c: RGB, k: number): RGB {
  return [c[0] * k, c[1] * k, c[2] * k]
}

export const tundra: Wallpaper = {
  id: "tundra",
  name: "Tundra",
  description: "Snowy peaks, a frozen lake, igloos and a snowman under falling snow, with a snowy owl now and then",
  activity: {
    calm: "Peaks, igloos, a snowman and falling snow",
    lively: "Adds waddling penguins and an arctic fox",
    teeming: "Adds a polar bear, an ice fisher and another snowman",
  },
  scrim: {
    day: [
      [24, 40, 64],
      [30, 44, 60],
      [24, 34, 50],
    ],
    sunset: [
      [30, 16, 34],
      [40, 18, 30],
      [20, 10, 20],
    ],
    night: [
      [3, 6, 16],
      [2, 6, 14],
      [2, 4, 10],
    ],
  },
  create: (settings) => new Tundra(settings),
}
