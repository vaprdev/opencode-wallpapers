import { Canvas, cap, ell, type Lighting, type Part } from "../src/canvas"
import { eggWait } from "../src/egg"
import { bird, flyAway, startle, type Flier } from "../src/flock"
import { TAU, clamp, fbm1, fbm2, hash, lerp, rand, smoothstep, type RGB } from "../src/math"
import { driftClouds, makeStorm, paintStorm } from "../src/sky"
import type { Activity, Season, Settings, Time, Wallpaper } from "../src/wallpaper"
import { WeatherLayer } from "../src/weather"

// The scene runs slower than real time, which keeps it calm behind text.
const TIME_SCALE = 0.35
// Creatures move and animate at a quarter of scene speed, so they drift rather than dart.
const CREATURE_SPEED = 0.25
// Height of the horizon as a fraction of the screen.
const HORIZON = 0.6

// Everything that changes with the time of day. "rim" lighting backlights silhouettes from a low sun or moon;
// "front" lighting shades rounded forms and casts shadows, for a high daytime sun.
interface Look {
  style: "rim" | "front"
  light: RGB
  sky: [number, RGB][]
  // The sun or moon: x as a fraction of the width, y and r as fractions of the height.
  orb: { x: number; y: number; r: number; core: RGB; glow: RGB; near: number; wide: number; moon: boolean }
  stars: number
  milkyWay: boolean
  clouds: { puffy: boolean; top: RGB; bottom: RGB; alpha: number }
  farMesa: RGB
  nearMesa: RGB
  floor: [RGB, RGB]
  backDune: RGB
  frontDune: RGB
  cactus: RGB
  bone: RGB
  horn: RGB
  hornTip: RGB
  socket: RGB
  pear: RGB
  fruit: RGB
  barrel: RGB
  flower: RGB
  coyote: RGB
  snake: [body: RGB, band: RGB, rattle: RGB]
  twig: RGB
  // The big bird and the flock: an eagle and vultures by day, an owl and bats at night.
  night: boolean
  plumage: RGB
  plumageLight: RGB
  flock: RGB
  dust: RGB
}

const LOOKS: Record<Time, Look> = {
  day: {
    style: "front",
    light: [1, 0.95, 0.85],
    sky: [
      [0, [0.05, 0.17, 0.45]],
      [0.3, [0.13, 0.33, 0.65]],
      [0.5, [0.32, 0.5, 0.7]],
      [HORIZON, [0.55, 0.62, 0.68]],
    ],
    orb: { x: 0.78, y: 0.13, r: 0.035, core: [5, 4.6, 3.8], glow: [1, 0.95, 0.8], near: 0.45, wide: 0.15, moon: false },
    stars: 0,
    milkyWay: false,
    clouds: { puffy: true, top: [1.1, 1.1, 1.1], bottom: [0.55, 0.62, 0.75], alpha: 0.9 },
    farMesa: [0.62, 0.36, 0.26],
    nearMesa: [0.62, 0.27, 0.13],
    floor: [
      [0.66, 0.52, 0.38],
      [0.6, 0.42, 0.26],
    ],
    backDune: [0.7, 0.5, 0.3],
    frontDune: [0.76, 0.54, 0.3],
    cactus: [0.16, 0.32, 0.12],
    bone: [0.86, 0.8, 0.68],
    horn: [0.72, 0.62, 0.45],
    hornTip: [0.25, 0.18, 0.1],
    socket: [0.1, 0.07, 0.05],
    pear: [0.2, 0.38, 0.14],
    fruit: [0.65, 0.1, 0.3],
    barrel: [0.18, 0.34, 0.13],
    flower: [0.95, 0.75, 0.15],
    coyote: [0.5, 0.4, 0.28],
    snake: [
      [0.6, 0.46, 0.28],
      [0.3, 0.2, 0.1],
      [0.75, 0.68, 0.55],
    ],
    twig: [0.6, 0.45, 0.28],
    night: false,
    plumage: [0.22, 0.13, 0.07],
    plumageLight: [0.9, 0.88, 0.82],
    flock: [0.08, 0.06, 0.06],
    dust: [0.12, 0.1, 0.07],
  },
  sunset: {
    style: "rim",
    light: [1, 0.42, 0.14],
    sky: [
      [0, [0.012, 0.01, 0.04]],
      [0.25, [0.05, 0.02, 0.085]],
      [0.42, [0.2, 0.055, 0.12]],
      [0.52, [0.55, 0.16, 0.12]],
      [HORIZON, [0.95, 0.4, 0.14]],
    ],
    orb: { x: 0.6, y: 0.53, r: 0.065, core: [3.2, 1.7, 0.6], glow: [1, 0.42, 0.14], near: 0.5, wide: 0.25, moon: false },
    stars: 45,
    milkyWay: false,
    clouds: { puffy: false, top: [0.1, 0.035, 0.09], bottom: [0.75, 0.24, 0.2], alpha: 0.55 },
    farMesa: [0.07, 0.03, 0.06],
    nearMesa: [0.07, 0.025, 0.04],
    floor: [
      [0.4, 0.14, 0.07],
      [0.1, 0.04, 0.03],
    ],
    backDune: [0.075, 0.03, 0.025],
    frontDune: [0.04, 0.017, 0.014],
    cactus: [0.02, 0.05, 0.025],
    bone: [0.62, 0.5, 0.4],
    horn: [0.48, 0.38, 0.26],
    hornTip: [0.12, 0.08, 0.05],
    socket: [0.03, 0.015, 0.01],
    pear: [0.03, 0.055, 0.025],
    fruit: [0.5, 0.06, 0.08],
    barrel: [0.03, 0.06, 0.03],
    flower: [0.8, 0.6, 0.1],
    coyote: [0.02, 0.01, 0.012],
    snake: [
      [0.3, 0.19, 0.1],
      [0.12, 0.07, 0.04],
      [0.55, 0.45, 0.32],
    ],
    twig: [0.3, 0.17, 0.08],
    night: false,
    plumage: [0.06, 0.035, 0.022],
    plumageLight: [0.62, 0.57, 0.5],
    flock: [0.03, 0.02, 0.02],
    dust: [0.12, 0.07, 0.035],
  },
  night: {
    style: "rim",
    light: [0.18, 0.42, 1],
    sky: [
      [0, [0.004, 0.006, 0.02]],
      [0.3, [0.01, 0.018, 0.05]],
      [0.5, [0.025, 0.04, 0.09]],
      [HORIZON, [0.05, 0.07, 0.13]],
    ],
    orb: { x: 0.3, y: 0.16, r: 0.035, core: [1, 0.72, 0.3], glow: [0.45, 0.3, 0.12], near: 0.2, wide: 0.08, moon: true },
    stars: 160,
    milkyWay: true,
    clouds: { puffy: false, top: [0.015, 0.02, 0.05], bottom: [0.06, 0.1, 0.3], alpha: 0.5 },
    farMesa: [0.03, 0.04, 0.08],
    nearMesa: [0.012, 0.016, 0.035],
    floor: [
      [0.05, 0.06, 0.1],
      [0.015, 0.018, 0.035],
    ],
    backDune: [0.025, 0.03, 0.055],
    frontDune: [0.012, 0.014, 0.028],
    cactus: [0.01, 0.02, 0.02],
    bone: [0.1, 0.2, 0.42],
    horn: [0.08, 0.13, 0.28],
    hornTip: [0.02, 0.03, 0.06],
    socket: [0.01, 0.01, 0.015],
    pear: [0.012, 0.022, 0.02],
    fruit: [0.15, 0.03, 0.06],
    barrel: [0.012, 0.024, 0.02],
    flower: [0.3, 0.28, 0.12],
    coyote: [0.012, 0.012, 0.02],
    snake: [
      [0.05, 0.08, 0.16],
      [0.02, 0.03, 0.07],
      [0.1, 0.14, 0.3],
    ],
    twig: [0.06, 0.09, 0.2],
    night: true,
    plumage: [0.08, 0.075, 0.08],
    plumageLight: [0.08, 0.1, 0.22],
    flock: [0.02, 0.02, 0.03],
    dust: [0, 0, 0],
  },
}

// Spring wildflowers: poppy, lupine, brittlebush and verbena, scaled by FLOWER_LIGHT for the time of day.
const FLOWERS: RGB[] = [
  [1, 0.5, 0.08],
  [0.5, 0.3, 0.95],
  [1, 0.85, 0.15],
  [0.92, 0.35, 0.68],
]
const FLOWER_LIGHT: Record<Time, RGB> = { day: [1, 1, 1], sunset: [0.3, 0.15, 0.13], night: [0.08, 0.1, 0.2] }
// A winter dusting of snow on the mesa tops: white by day, rosy at sunset, blue at night.
const DUSTING: Record<Time, RGB> = { day: [0.92, 0.93, 0.97], sunset: [0.55, 0.28, 0.3], night: [0.06, 0.12, 0.3] }

// Stars come in a few colors rather than plain white, so they read apart from light text.
const STAR_TINTS: RGB[] = [
  [0.55, 0.75, 1.2],
  [1.15, 0.85, 0.45],
  [1.1, 0.6, 0.85],
  [0.7, 0.6, 1.2],
]

// Daylight comes from the upper right, slightly in front of the scene.
const DAYLIGHT = (() => {
  const l = Math.hypot(0.45, 0.6, 0.65)
  return [0.45 / l, -0.6 / l, 0.65 / l] as const
})()

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

interface Coyote {
  howl: number
  t: number
  next: number
}

class Desert extends Canvas {
  private time = 0
  private readonly activity: Activity
  private readonly look: Look
  private frontTop = new Float32Array(0)
  private nearTop = new Float32Array(0)
  private orbX = 0
  private orbY = 0
  private coyoteX = 0
  private stars: { x: number; y: number; b: number; phase: number; tint: RGB }[]
  private dust = Array.from({ length: 60 }, () => ({ x: Math.random() * 4, y: 0.3 + Math.random() * 0.7, s: Math.random() }))
  private clouds: Cloud[]
  private storm = makeStorm()
  private tumbleweed = { x: -9, dir: 1, next: 14, spin: 0, hop: 0 }
  private twigs = buildTwigs()
  private bigBird: Bird | undefined
  private flock: Bird[] = []
  private snake: Snake | undefined
  private coyote: Coyote | undefined
  private startled: Flier[] = []
  // The easter egg: a roadrunner sprints in from the left, stops mid-screen, then dashes off kicking up dust. t is
  // creature time; halt is when it stopped, or -1 before then.
  private roadrunner = { wait: eggWait() * TIME_SCALE, t: -1, x: 0, halt: -1, stride: 0 }
  private puffs: { x: number; y: number; age: number }[] = []
  private readonly season: Season
  private readonly flowerLight: RGB
  private readonly dusting: RGB
  private readonly weather: WeatherLayer

  constructor(settings: Settings) {
    super()
    this.activity = settings.activity
    this.look = LOOKS[settings.time]
    this.season = settings.season ?? "summer"
    this.flowerLight = FLOWER_LIGHT[settings.time]
    this.dusting = DUSTING[settings.time]
    this.weather = new WeatherLayer(settings.weather ?? "clear", settings.time, HORIZON)
    const look = this.look
    const top = look.milkyWay ? 0.5 : 0.3
    this.stars = Array.from({ length: look.stars }, () => ({ x: Math.random(), y: Math.random() * top, b: 0.4 + Math.random() * 0.6, phase: Math.random() * TAU, tint: STAR_TINTS[Math.floor(Math.random() * STAR_TINTS.length)] }))
    this.clouds = Array.from({ length: look.clouds.puffy ? 4 : 5 }, () => ({
      x: Math.random() * 2,
      y: look.clouds.puffy ? 0.1 + Math.random() * 0.2 : 0.12 + Math.random() * 0.24,
      speed: 0.003 + Math.random() * 0.004,
      puffs: look.clouds.puffy
        ? Array.from({ length: 6 }, (_, i) => ({ dx: (i / 5 - 0.5) * 0.16 + (Math.random() - 0.5) * 0.03, dy: -Math.sin((i / 5) * Math.PI) * 0.02 + (Math.random() - 0.5) * 0.01, rx: 0.03 + Math.random() * 0.025, ry: 0.022 + Math.random() * 0.014 }))
        : Array.from({ length: 5 }, () => ({ dx: (Math.random() - 0.5) * 0.22, dy: (Math.random() - 0.5) * 0.015, rx: 0.06 + Math.random() * 0.08, ry: 0.008 + Math.random() * 0.01 })),
    }))
    if (settings.activity !== "calm") {
      this.bigBird = { angle: 0, speed: 0.5, cx: 0.55, cy: 0.2, rx: 0.3, ry: 0.05, phase: 0 }
      this.snake = { x: 0.5, y: 0.9, vx: 0, vy: 0, wx: 0.5, wy: 0.9, wanderT: 0, phase: 0, trail: [] }
    }
    if (settings.activity === "teeming") {
      this.flock = look.night
        ? [0, 1.6, 3.1, 4.7].map((angle, i) => ({ angle, speed: 0.9 + i * 0.12, cx: 0.72, cy: 0.3, rx: 0.06 + i * 0.03, ry: 0.04, phase: i * 1.7 }))
        : [0, 2.1, 4.2].map((angle, i) => ({ angle, speed: 0.4 + i * 0.05, cx: 0.25, cy: 0.16, rx: 0.08 + i * 0.035, ry: 0.025, phase: i }))
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
    driftClouds(this.storm, this.A, dt)
    this.stepGloom(dt)
    this.stepTumbleweed(dt)
    this.weather.step(dt)
    this.stepCreatures(dt * CREATURE_SPEED)
    this.startled = flyAway(this.startled, dt, this.A)
    this.stepRoadrunner(dt, dt * CREATURE_SPEED)
  }

  // A few birds burst up out of the scrub below the click.
  poke(x: number, y: number) {
    const ground = this.frontTop[clamp(Math.round(x * this.H), 0, this.W - 1)] / this.H
    startle(this.startled, x, y > HORIZON ? y : ground, 5)
  }

  render() {
    this.hdr.set(this.background)
    if (!this.weather.covered) this.drawStars()
    this.drawClouds()
    paintStorm(this.hdr, this.W, this.H, this.storm, this.look.clouds.top, this.look.clouds.bottom, this.gloom)
    for (const b of this.flock) this.look.night ? this.drawBat(b) : this.drawBird(b, 0.3, "vulture")
    if (this.bigBird) this.drawBird(this.bigBird, 0.8, this.look.night ? "owl" : "eagle")
    if (this.coyote) this.drawCoyote(this.coyote)
    if (this.snake) this.drawSnake(this.snake)
    if (this.roadrunner.t >= 0) this.drawRoadrunner()
    for (const b of this.startled) this.silhouette(bird(b, this.H, 0.022 * this.H, this.look.flock), 0.4)
    this.drawTumbleweed()
    this.drawDust()
    this.weather.draw(this.hdr, this.W, this.H)
    this.finish()
  }

  protected override visit() {
    if (this.tumbleweed.x < -5) this.tumbleweed.next = 0
  }

  // Everything that never moves is painted once per size into `background`, then copied in each frame.
  protected override layout() {
    const { W, H, A, look, px } = this
    this.orbX = look.orb.x * W
    this.orbY = look.orb.y * H
    this.drawSky()
    this.weather.cover(this.hdr, W, H)
    const far = mesas(A, 3, 7, [0.06, 0.16], [0.04, 0.09])
    const near = mesas(A, 2, 19, [0.05, 0.12], [0.06, 0.13])
    this.nearTop = new Float32Array(W)
    const farTop = new Float32Array(W)
    for (let x = 0; x < W; x++) {
      const u = x / H
      farTop[x] = (HORIZON - profile(far, u)) * H
      this.nearTop[x] = (HORIZON + 0.01 - profile(near, u)) * H
    }
    const horizon = look.sky[look.sky.length - 1][1]
    this.fillBelow(farTop, (x, y, d) => {
      if (y > HORIZON * H + px) return undefined
      const haze = (0.35 + 0.4 * (1 - d / (40 * px))) * (look.style === "front" ? 0.45 : 0.4)
      return this.surface(mix(look.farMesa, horizon, haze), farTop, x, d, 1.5, 0.6, true)
    })
    this.drawFloor()
    this.fillBelow(this.nearTop, (x, y, d) => (y > (HORIZON + 0.02) * H ? undefined : this.surface(look.nearMesa, this.nearTop, x, d, 1.6, 0.8, true)))
    const backTop = new Float32Array(W)
    this.frontTop = new Float32Array(W)
    for (let x = 0; x < W; x++) {
      const u = x / H
      backTop[x] = (0.7 + 0.035 * Math.sin(u * 3.1 + 1) + 0.02 * Math.sin(u * 7.3)) * H
      this.frontTop[x] = (0.83 + 0.045 * Math.sin(u * 2.2 + 2.5) + 0.015 * Math.sin(u * 5.7 + 1)) * H
    }
    this.fillBelow(backTop, (x, _y, d) => this.surface(scale(look.backDune, 1 - (d / px) * 0.005), backTop, x, d, 2.2, 0.55, false))
    this.fillBelow(this.frontTop, (x, _y, d) => {
      const ripple = 0.9 + 0.1 * Math.sin((x / px) * 0.5 + (d / px) * 0.9 + fbm1((x / px) * 0.05, 3) * 4)
      return this.surface(scale(look.frontDune, ripple), this.frontTop, x, d, 2.5, 0.5, false)
    })
    if (this.season === "spring") this.drawBloom()
    if (this.activity === "teeming") {
      for (const fx of [0.47, 0.92]) {
        const gy = backTop[Math.min(W - 1, Math.round(fx * W))] + 2 * px
        this.shadow(fx * A * H, gy, 0.05 * H)
        this.drawSaguaro(fx * A * H, gy, (fx < 0.5 ? 0.14 : 0.11) * H, 0.5)
      }
    }
    this.shadow(0.13 * A * H, this.ground(0.13), 0.12 * H)
    this.drawSaguaro(0.13 * A * H, this.ground(0.13) + 3 * px, 0.34 * H, 0)
    this.shadow(0.8 * A * H, this.ground(0.8), 0.08 * H)
    this.drawSkull(0.8 * A * H, this.ground(0.8), 0.07 * H)
    if (this.activity === "teeming") {
      this.shadow(0.33 * A * H, this.ground(0.33), 0.05 * H)
      this.drawPricklyPear(0.33 * A * H, this.ground(0.33) + 2 * px, H)
      this.shadow(0.62 * A * H, this.ground(0.62), 0.035 * H)
      this.drawBarrel(0.62 * A * H, this.ground(0.62) + px, H)
    }
    // The coyote sits on the tallest near mesa.
    let best = 0
    for (let x = 1; x < W; x++) if (this.nearTop[x] < this.nearTop[best]) best = x
    this.coyoteX = best
  }

  // Ground height in pixels at a fraction of the width.
  private ground(fx: number) {
    return this.frontTop[clamp(Math.round(fx * this.W), 0, this.W - 1)]
  }

  // How strongly a column catches a low sun or moon, highest beneath it.
  private glowAt(x: number) {
    return 0.35 + 0.65 * Math.exp(-Math.abs(x - this.orbX) / (0.45 * this.H))
  }

  // Shades a mesa or dune pixel `depth` below its top edge. At sunset and night the edge glows with backlight; by day,
  // slopes facing the sun are brighter, and cliffs show their rock layers. rimWidth is in real pixels.
  private surface(base: RGB, top: Float32Array, x: number, depth: number, rimWidth: number, rimStrength: number, strata: boolean): RGB {
    if (strata && this.season === "winter") {
      const snow = smoothstep(this.px, 0, depth - (0.006 + 0.03 * fbm1((x / this.px) * 0.06, 4) ** 2) * this.H)
      if (snow > 0) return mix(this.lit(base, top, x, depth, rimWidth, rimStrength, strata), this.dusting, snow * 0.85)
    }
    return this.lit(base, top, x, depth, rimWidth, rimStrength, strata)
  }

  private lit(base: RGB, top: Float32Array, x: number, depth: number, rimWidth: number, rimStrength: number, strata: boolean): RGB {
    const { light } = this.look
    const px = this.px
    if (this.look.style === "rim") {
      const k = Math.exp(-depth / (rimWidth * px)) * rimStrength * this.glowAt(x) * 0.6
      return [base[0] + light[0] * k, base[1] + light[1] * k, base[2] + light[2] * k]
    }
    const slope = (top[Math.min(this.W - 1, x + 1)] - top[Math.max(0, x - 1)]) / 2
    const face = strata ? (slope < -0.6 ? 0.6 : slope > 0.6 ? 1.1 : 0.85) : 0.85 + clamp(slope * 1.5, -0.3, 0.3)
    const layers = strata ? 0.9 + 0.1 * Math.sin((depth / px) * 0.7 + fbm1((x / px) * 0.08, 2) * 3) : 1
    const edge = 1 + 0.35 * Math.exp(-depth / (1.2 * px))
    const k = face * layers * edge
    return [base[0] * k, base[1] * k, base[2] * k]
  }

  // Depth-graded sky, a glow around the sun or moon, the orb itself, and at night the Milky Way.
  private drawSky() {
    const { W, H, hdr, look } = this
    const { orb } = look
    const R = orb.r * H
    for (let y = 0; y < H; y++) {
      const v = y / H
      const i = look.sky.findIndex(([at]) => at >= v)
      const [a, from] = look.sky[Math.max(0, i - 1)]
      const [b, to] = look.sky[i < 0 ? look.sky.length - 1 : i]
      const k = b > a ? smoothstep(a, b, v) : 1
      for (let x = 0; x < W; x++) {
        const d = Math.hypot(x - this.orbX, y - this.orbY) / H
        const glow = orb.near * Math.exp(-d / (orb.r * 1.8)) + orb.wide * Math.exp(-d / 0.35)
        const o = (y * W + x) * 3
        hdr[o] = lerp(from[0], to[0], k) + glow * orb.glow[0]
        hdr[o + 1] = lerp(from[1], to[1], k) + glow * orb.glow[1]
        hdr[o + 2] = lerp(from[2], to[2], k) + glow * orb.glow[2]
        const band = Math.abs(v - (0.45 - (x / W) * 0.35)) / 0.07
        if (look.milkyWay && band < 4) {
          // A faint, mottled band rising from lower left to upper right.
          const m = Math.exp(-band * band) * (0.5 + 0.5 * fbm1((x / this.px) * 0.05 + v * 9, 4)) * 0.05
          hdr[o] += m * 0.55
          hdr[o + 1] += m * 0.4
          hdr[o + 2] += m
        }
        const r = d * H
        const cov = clamp(R - r + 0.5, 0, 1)
        if (cov <= 0) continue
        const limb = 0.85 + 0.15 * Math.sqrt(Math.max(0, 1 - (r / R) ** 2))
        // The moon gets a few darker maria.
        const maria = orb.moon ? 1 - 0.18 * smoothstep(0.55, 0.75, fbm1(((x - this.orbX) / this.px) * 0.25 + 3, 7) + fbm1(((y - this.orbY) / this.px) * 0.25 + 1, 9) * 0.6) : 1
        this.blend(o, orb.core[0] * limb * maria, orb.core[1] * limb * maria, orb.core[2] * limb * maria, cov)
      }
    }
  }

  // A spring superbloom: green-washed patches of wildflowers over the floor and dunes, each patch mostly one kind,
  // smaller with distance.
  private drawBloom() {
    const { W, H, A, hdr } = this
    const patch = (u: number, v: number) => fbm2(u * 5, v * 11, 3)
    const green = this.flowerLight
    for (let y = Math.ceil((HORIZON + 0.01) * H); y < H; y++)
      for (let x = 0; x < W; x++) {
        const k = smoothstep(0.44, 0.6, patch(x / H, y / H)) * 0.35
        if (k <= 0) continue
        this.blend((y * W + x) * 3, hdr[(y * W + x) * 3] * 0.6 + 0.2 * green[0], hdr[(y * W + x) * 3 + 1] * 0.6 + 0.3 * green[1], hdr[(y * W + x) * 3 + 2] * 0.5 + 0.06 * green[2], k)
      }
    for (let i = 0; i < Math.round(A * 3200); i++) {
      const u = hash(i * 1.31) * A
      const v = HORIZON + 0.015 + hash(i * 2.77) * (0.99 - HORIZON)
      if (patch(u, v) < 0.5) continue
      const kind = FLOWERS[Math.floor(fbm2(u * 1.6 + 7, v * 3 + 2, 2) * 9 + hash(i * 4.1) * 1.4) % FLOWERS.length]
      const near = (v - HORIZON) / (1 - HORIZON)
      const light = this.flowerLight
      this.disc(u * H, v * H, lerp(0.0016, 0.0055, near) * H, kind[0] * light[0], kind[1] * light[1], kind[2] * light[2], 0.9)
    }
  }

  // Distant desert floor between the horizon and the dunes, catching a low sun beneath it.
  private drawFloor() {
    const { W, H, hdr, look } = this
    const [near, far] = look.floor
    for (let y = Math.floor(HORIZON * H); y < H; y++) {
      const k = smoothstep(HORIZON, 0.72, y / H)
      const shine = look.style === "rim" ? Math.exp(-(y / H - HORIZON) / 0.05) * 0.3 : 0
      for (let x = 0; x < W; x++) {
        const o = (y * W + x) * 3
        const sun = Math.exp(-Math.abs(x - this.orbX) / (0.3 * H)) * shine
        hdr[o] = lerp(near[0], far[0], k) + sun * look.light[0]
        hdr[o + 1] = lerp(near[1], far[1], k) + sun * look.light[1]
        hdr[o + 2] = lerp(near[2], far[2], k) + sun * look.light[2]
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

  // By day, a soft shadow on the ground falling to the lower left of something standing at (x, gy).
  private shadow(x: number, gy: number, length: number) {
    if (this.look.style !== "front") return
    const { W, H, hdr } = this
    const cx = x - length * 0.55
    const rx = length * 0.7
    const ry = Math.max(1.5 * this.px, length * 0.12)
    for (let y = Math.max(0, Math.floor(gy - ry)); y <= Math.min(H - 1, Math.ceil(gy + ry)); y++)
      for (let px = Math.max(0, Math.floor(cx - rx)); px <= Math.min(W - 1, Math.ceil(cx + rx)); px++) {
        const q = ((px + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - gy) / ry) ** 2
        if (q >= 1) continue
        const k = 1 - 0.45 * (1 - q) ** 0.7
        const o = (y * W + px) * 3
        hdr[o] *= k
        hdr[o + 1] *= k
        hdr[o + 2] *= k
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

  private stepRoadrunner(dt: number, cdt: number) {
    for (const p of this.puffs) p.age += dt
    this.puffs = this.puffs.filter((p) => p.age < 4)
    const r = this.roadrunner
    if (r.t < 0) {
      r.wait -= dt
      if (r.wait > 0) return
      Object.assign(r, { t: 0, x: -0.1, halt: -1, stride: 0 })
      return
    }
    r.t += cdt
    if (r.halt < 0 && r.x >= 0.55 * this.A) r.halt = r.t
    if (r.halt >= 0 && r.t < r.halt + 2) return
    const speed = r.halt < 0 ? 0.25 : 0.5
    r.x += speed * cdt
    r.stride += cdt * 40
    if (Math.floor(r.stride / Math.PI) !== Math.floor((r.stride - cdt * 40) / Math.PI)) this.puffs.push({ x: r.x - 0.01, y: this.ground(r.x / this.A) / this.H, age: 0 })
    if (r.x < this.A + 0.15) return
    r.t = -1
    r.wait = eggWait(true) * TIME_SCALE
  }

  private stepCreatures(dt: number) {
    for (const b of [this.bigBird, ...this.flock]) {
      if (!b) continue
      b.angle += b.speed * dt
      b.phase += dt
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

  private silhouette(parts: Part[], light = 1) {
    const lighting: Lighting = this.look.style === "rim" ? { style: "rim", color: this.look.light, x: this.orbX, y: this.orbY } : { style: "front", dir: DAYLIGHT }
    this.shape(parts, lighting, light)
  }

  // A saguaro: a ribbed trunk with two upturned arms. haze fades distant ones toward the dunes behind them.
  private drawSaguaro(x: number, gy: number, h: number, haze: number) {
    const c = mix(this.look.cactus, this.look.backDune, haze * 0.6)
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
    // In spring, a crown of cream blossoms on the trunk and each arm.
    if (this.season !== "spring") return
    const light = this.flowerLight
    for (const [tx, ty, tr] of [[x, gy - h, r * 0.85], [x - h * 0.24, gy - h * 0.72, r * 0.62], [x + h * 0.21, gy - h * 0.82, r * 0.58]])
      for (const a of [-0.9, -0.3, 0.3, 0.9]) this.disc(tx + Math.sin(a) * tr * 0.8, ty - Math.cos(a) * tr * 0.5, tr * 0.38, 0.98 * light[0], 0.94 * light[1], 0.82 * light[2], 0.95)
  }

  // A bleached cow skull seen from the front, resting on its snout, with long horns sweeping out and up.
  private drawSkull(x: number, gy: number, s: number) {
    const { bone, horn, hornTip, socket } = this.look
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
          return cap(ax, ay, bx, by, s * lerp(0.09, 0.015, i / 12), s * lerp(0.09, 0.015, (i + 1) / 12), i > 9 ? hornTip : horn)
        }),
        0.6,
      )
    }
    this.silhouette([ell(x, cy - s * 0.15, s * 0.42, s * 0.3, 0, bone), cap(x, cy, x, cy + s * 0.75, s * 0.3, s * 0.16, bone), ell(x, cy + s * 0.8, s * 0.18, s * 0.1, 0, bone)], 0.6)
    for (const side of [-1, 1]) {
      this.silhouette([ell(x + side * s * 0.2, cy - s * 0.05, s * 0.11, s * 0.13, side * 0.3, socket)], 0)
      this.silhouette([ell(x + side * s * 0.06, cy + s * 0.62, s * 0.045, s * 0.09, 0, socket)], 0)
    }
    this.silhouette([cap(x, cy - s * 0.42, x, cy - s * 0.22, s * 0.015, s * 0.01, socket)], 0)
  }

  // A clump of paddle-shaped pads, each with its own outline, a few with fruit on top.
  private drawPricklyPear(x: number, gy: number, H: number) {
    const pads: [number, number, number, number, number][] = [
      [0, -0.035, 0.025, 0.04, 0],
      [-0.032, -0.08, 0.02, 0.032, -0.5],
      [0.03, -0.085, 0.022, 0.034, 0.4],
      [0.002, -0.125, 0.018, 0.028, 0.1],
    ]
    for (const [dx, dy, rx, ry, a] of pads) this.silhouette([ell(x + dx * H, gy + dy * H, rx * H, ry * H, a, this.look.pear)])
    for (const [dx, dy] of [[-0.04, -0.11], [0.042, -0.118], [0.005, -0.153]]) this.silhouette([ell(x + dx * H, gy + dy * H, 0.006 * H, 0.008 * H, 0, this.look.fruit)], 0.5)
  }

  // A squat, ribbed barrel cactus with a crown of flowers.
  private drawBarrel(x: number, gy: number, H: number) {
    this.silhouette([ell(x, gy - 0.032 * H, 0.03 * H, 0.035 * H, 0, this.look.barrel, 3)])
    for (const dx of [-0.012, 0, 0.012]) this.silhouette([ell(x + dx * H, gy - 0.066 * H, 0.005 * H, 0.004 * H, 0, this.look.flower)], 0.3)
  }

  // Stars twinkling slowly and fading toward the horizon glow.
  private drawStars() {
    const top = this.look.milkyWay ? 0.55 : 0.32
    const bright = this.look.milkyWay ? 0.6 : 0.35
    for (const s of this.stars) {
      const k = s.b * (1 - s.y / top) * (0.7 + 0.3 * Math.sin(this.time * 0.8 + s.phase)) * bright
      this.add(s.x * this.W, s.y * this.H, k * s.tint[0], k * s.tint[1], k * s.tint[2])
    }
  }

  // Clouds drifting slowly across: puffy and sunlit from above by day, thin streaks lit from below otherwise.
  private drawClouds() {
    const { H, W, hdr, look } = this
    const { alpha, puffy } = look.clouds
    const [top, bottom] = this.weather.scud ?? [look.clouds.top, look.clouds.bottom]
    for (const c of this.clouds)
      for (const p of c.puffs) {
        const cx = (c.x + p.dx) * H
        const cy = (c.y + p.dy) * H
        const rx = p.rx * H
        const ry = p.ry * H
        const warm = puffy ? 1 : 0.6 + 0.6 * Math.exp(-Math.abs(cx - this.orbX) / (0.5 * H))
        for (let y = Math.max(0, Math.floor(cy - ry)); y <= Math.min(H - 1, Math.ceil(cy + ry)); y++)
          for (let x = Math.max(0, Math.floor(cx - rx)); x <= Math.min(W - 1, Math.ceil(cx + rx)); x++) {
            const dx = (x + 0.5 - cx) / rx
            const dy = (y + 0.5 - cy) / ry
            const q = dx * dx + dy * dy
            if (q >= 1) continue
            const under = smoothstep(-1, 1, dy)
            const o = (y * W + x) * 3
            const a = (puffy ? Math.min(1, (1 - q) * 3) : (1 - q) ** 1.5) * alpha
            hdr[o] += (lerp(top[0], bottom[0], under) * warm - hdr[o]) * a
            hdr[o + 1] += (lerp(top[1], bottom[1], under) * warm - hdr[o + 1]) * a
            hdr[o + 2] += (lerp(top[2], bottom[2], under) * warm - hdr[o + 2]) * a
          }
      }
  }

  // A soaring bird seen from the front, wings spread and banking as it circles. A bald eagle has a white head and
  // tail and fingered wingtips; a vulture is small and dark with lifted wingtips; an owl has broad rounded wings, a
  // round face with ear tufts, and glowing eyes.
  private drawBird(b: Bird, scale: number, kind: "eagle" | "vulture" | "owl") {
    const { A, H, look } = this
    const ex = (b.cx * A + b.rx * Math.cos(b.angle)) * H
    const ey = (b.cy + b.ry * Math.sin(b.angle)) * H
    const roll = 0.18 * Math.sin(b.angle)
    const cr = Math.cos(roll)
    const sr = Math.sin(roll)
    const S = H * scale
    const T = (u: number, v: number): [number, number] => [ex + (u * cr - v * sr) * S, ey + (u * sr + v * cr) * S]
    const main = kind === "vulture" ? look.flock : look.plumage
    const pale = kind === "vulture" ? look.flock : look.plumageLight
    const dihedral = kind === "vulture" ? 0.06 : 0.018
    const chord = kind === "owl" ? 0.024 : 0.02
    const flex = 0.006 * Math.sin(b.phase * 1.3)
    const parts: Part[] = []
    for (const side of [-1, 1]) {
      const spine = (t: number): [number, number] => [side * (0.028 + 0.125 * t), -dihedral * t * t + flex * t * t]
      for (let i = 0; i < 6; i++) parts.push(cap(...T(...spine(i / 6)), ...T(...spine((i + 1) / 6)), chord * (1 - 0.3 * (i / 6)) * S, chord * (1 - 0.3 * ((i + 1) / 6)) * S, main))
      const [tu, tv] = spine(0.92)
      if (kind === "owl") {
        parts.push(ell(...T(tu, tv), 0.022 * S, 0.016 * S, roll, main))
        continue
      }
      // Fingered primary feathers splaying from the wingtip.
      const [pu, pv] = spine(0.8)
      const base = Math.atan2(tv - pv, tu - pu)
      for (const spread of [-0.5, -0.25, 0, 0.22, 0.42]) {
        const a = base + spread * side
        parts.push(cap(...T(tu, tv), ...T(tu + Math.cos(a) * 0.03, tv + Math.sin(a) * 0.03), 0.005 * S, 0.0015 * S, main))
      }
    }
    parts.push(cap(...T(0, -0.006), ...T(0, 0.04), 0.014 * S, 0.01 * S, main))
    if (kind === "owl") {
      parts.push(cap(...T(0, 0.035), ...T(0, 0.05), 0.01 * S, 0.012 * S, main))
      parts.push(ell(...T(0, -0.02), 0.018 * S, 0.016 * S, roll, pale))
      for (const side of [-1, 1]) parts.push(cap(...T(side * 0.009, -0.031), ...T(side * 0.014, -0.045), 0.004 * S, 0.001 * S, main))
      this.silhouette(parts, 0.7)
      for (const side of [-1, 1]) this.add(...T(side * 0.006, -0.022), 1.2, 0.8, 0.15)
      return
    }
    parts.push(cap(...T(0, 0.035), ...T(0, 0.058), 0.008 * S, 0.014 * S, pale))
    parts.push(cap(...T(0, -0.016), ...T(0, -0.006), 0.011 * S, 0.011 * S, pale))
    if (kind === "eagle") parts.push(cap(...T(0, -0.009), ...T(0, -0.004), 0.004 * S, 0.002 * S, [0.85, 0.55, 0.08]))
    this.silhouette(parts, 0.7)
  }

  // A small bat fluttering in loose circles, membrane wings beating quickly.
  private drawBat(b: Bird) {
    const { A, H, look } = this
    const bx = (b.cx * A + b.rx * Math.cos(b.angle)) * H
    const by = (b.cy + b.ry * Math.sin(b.angle) + Math.sin(b.phase * 7) * 0.008) * H
    const S = H * 0.1
    const flap = Math.sin(this.time * 9 + b.phase * 3)
    const c = look.flock
    const parts: Part[] = [ell(bx, by, 0.07 * S, 0.12 * S, 0, c), ell(bx, by - 0.12 * S, 0.055 * S, 0.05 * S, 0, c)]
    for (const side of [-1, 1]) {
      // Each wing bends at the elbow; two membranes hang below the arm bones, leaving a scalloped trailing edge and a
      // pointed tip. The tip sweeps up and down with the beat.
      const sh: [number, number] = [bx + side * 0.04 * S, by - 0.05 * S]
      const tip: [number, number] = [bx + side * 0.55 * S, by + (-0.02 + flap * 0.3) * S]
      const el: [number, number] = [lerp(sh[0], tip[0], 0.42), lerp(sh[1], tip[1], 0.42) - (0.1 - flap * 0.04) * S]
      for (const [p, q, depth] of [[sh, el, 0.11], [el, tip, 0.085]] as const) {
        const angle = Math.atan2(q[1] - p[1], q[0] - p[0])
        const half = Math.hypot(q[0] - p[0], q[1] - p[1]) / 2
        parts.push(ell((p[0] + q[0]) / 2 - Math.sin(angle) * depth * S * 0.6, (p[1] + q[1]) / 2 + Math.abs(Math.cos(angle)) * depth * S * 0.6, half, depth * S, angle, c))
      }
      parts.push(cap(...sh, ...el, 0.025 * S, 0.018 * S, c))
      parts.push(cap(...el, ...tip, 0.018 * S, 0.004 * S, c))
      parts.push(cap(bx + side * 0.03 * S, by - 0.14 * S, bx + side * 0.05 * S, by - 0.22 * S, 0.025 * S, 0.004 * S, c))
    }
    this.silhouette(parts, 0.35)
  }

  // A coyote sitting on top of a mesa, facing the sun or moon, that now and then lifts its head to howl.
  private drawCoyote(c: Coyote) {
    const x = this.coyoteX + 0.5
    const gy = this.nearTop[this.coyoteX] + 0.5
    const S = 0.1 * this.H
    const face = this.orbX > x ? 1 : -1
    const P = (u: number, v: number): [number, number] => [x + u * face * S, gy + v * S]
    const k = this.look.coyote
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
    if (points.length < 2) return
    const [body, band, rattle] = this.look.snake
    const at = (i: number): [number, number] => {
      const [x, y] = points[i]
      const [px, py] = points[Math.min(points.length - 1, i + 1)]
      const [qx, qy] = points[Math.max(0, i - 1)]
      const tl = Math.hypot(px - qx, py - qy) || 1
      const s0 = i * step
      const wave = 0.006 * smoothstep(0, 0.03, s0) * Math.sin(s0 * 60 - s.phase)
      return [(x + (-(py - qy) / tl) * wave) * H, (y + ((px - qx) / tl) * wave) * H]
    }
    const r = (j: number) => 0.0075 * (1 - ((j * step) / length) ** 1.5 * 0.7) * H
    const parts = points.slice(1).map((_, i) => cap(...at(i + 1), ...at(i), r(i + 1), r(i), i > points.length - 5 ? rattle : Math.floor((i * step) / 0.02) % 2 ? band : body))
    const [hx, hy] = at(0)
    const [nx, ny] = at(1)
    const heading = Math.atan2(hy - ny, hx - nx)
    parts.push(ell(hx, hy, 0.013 * H, 0.009 * H, heading, body))
    this.silhouette(parts, 0.7)
    this.add(hx + Math.cos(heading) * 0.005 * H, hy - 0.002 * H, 0.02, 0.02, 0.02)
  }

  // A roadrunner: legs a blur while it runs, tail low; standing, it raises its tail and crest and bobs its head.
  private drawRoadrunner() {
    const { H, look } = this
    const r = this.roadrunner
    for (const p of this.puffs) {
      const c = scale(look.frontDune, 1.35)
      this.disc(p.x * H, p.y * H - p.age * 0.006 * H, (0.006 + p.age * 0.005) * H, c[0], c[1], c[2], (1 - p.age / 4) * 0.4)
    }
    const running = r.halt < 0 || r.t > r.halt + 2
    const x = r.x * H
    const gy = this.ground(r.x / this.A) + 1
    const S = 0.14 * H
    const P = (u: number, v: number): [number, number] => [x + u * S, gy + v * S]
    const bob = running ? 0 : Math.max(0, Math.sin((r.t - r.halt) * 12)) * 0.05
    const tail = running ? -0.47 : -0.78
    const body = scale(look.coyote, 0.7)
    const dark = look.hornTip
    const legs = running ? [Math.sin(r.stride) * 0.16, -Math.sin(r.stride) * 0.16] : [0.03, -0.03]
    this.silhouette(
      [
        ...legs.map((dx, i) => cap(...P(0, -0.32), ...P(dx, i === 0 && running ? -0.04 * Math.max(0, Math.cos(r.stride)) : 0), 0.02 * S, 0.012 * S, dark)),
        ell(...P(0, -0.4), 0.2 * S, 0.075 * S, -0.15, body),
        cap(...P(-0.14, -0.42), ...P(-0.5, tail), 0.05 * S, 0.03 * S, body),
        cap(...P(0.12, -0.43), ...P(0.22, -0.58 + bob), 0.045 * S, 0.035 * S, body),
        ell(...P(0.25, -0.62 + bob), 0.07 * S, 0.055 * S, 0, body),
        cap(...P(0.22, -0.67 + bob), ...P(0.15, running ? -0.71 : -0.79 + bob), 0.035 * S, 0.01 * S, dark),
        cap(...P(0.3, -0.62 + bob), ...P(0.45, -0.6 + bob), 0.02 * S, 0.006 * S, dark),
      ],
      0.7,
    )
    this.add(...P(0.27, -0.635 + bob), 0.02, 0.02, 0.02)
  }

  // A ball of tangled twigs rolling and hopping across the front dune, its side toward the light brighter.
  private drawTumbleweed() {
    const t = this.tumbleweed
    if (t.x < -5) return
    const H = this.H
    const R = 0.035 * H
    const cx = t.x * H
    const hop = Math.abs(Math.sin(t.hop)) * 0.012 * H
    const gy = this.ground(t.x / this.A)
    this.shadow(cx + R * 0.8, gy, R * (2 - hop / (0.012 * H)))
    const cy = gy - R + 1 - hop
    const cs = Math.cos(t.spin)
    const sn = Math.sin(t.spin)
    const sl = Math.hypot(this.orbX - cx, this.orbY - cy) || 1
    const c = this.look.twig
    for (const [u, v] of this.twigs) {
      const ru = u * cs - v * sn
      const rv = u * sn + v * cs
      const lit = Math.max(0, (ru * (this.orbX - cx) + rv * (this.orbY - cy)) / sl)
      const k = 0.75 + lit * 0.7
      this.disc(cx + ru * R, cy + rv * R, 0.6, c[0] * k, c[1] * k, c[2] * k, 0.9)
    }
  }

  // Dust motes drifting on the breeze, glinting near a low sun.
  private drawDust() {
    const { H, look } = this
    const glint = look.style === "rim" ? 3 : 0
    for (const d of this.dust) {
      const x = d.x * H
      const y = d.y * H
      const k = (0.4 + d.s * 0.6) * (1 + glint * Math.exp(-Math.hypot(x - this.orbX, y - this.orbY) / (0.15 * H)))
      this.add(x, y, look.dust[0] * k, look.dust[1] * k, look.dust[2] * k)
    }
  }
}

function mix(a: RGB, b: RGB, t: number): RGB {
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)]
}

function scale(c: RGB, k: number): RGB {
  return [c[0] * k, c[1] * k, c[2] * k]
}

// Mesa outlines for one layer: flat tops with steep sides, spread across the width. Sizes are in screen heights.
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
  description: "Mesas and dunes with a saguaro, a cow skull, and a tumbleweed now and then",
  activity: {
    calm: "Mesas, a saguaro and a skull",
    lively: "Adds a soaring eagle (an owl at night) and a rattlesnake",
    teeming: "Adds vultures (bats at night), a howling coyote and more cacti",
  },
  scrim: {
    day: [
      [20, 38, 64],
      [52, 40, 32],
      [44, 28, 16],
    ],
    sunset: [
      [14, 10, 30],
      [40, 16, 24],
      [16, 8, 8],
    ],
    night: [
      [4, 6, 16],
      [6, 8, 20],
      [4, 4, 10],
    ],
  },
  create: (settings) => new Desert(settings),
}
