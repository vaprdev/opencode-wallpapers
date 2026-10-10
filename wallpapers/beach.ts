import { Canvas, cap, ell, type Lighting, type Part } from "../src/canvas"
import { eggWait } from "../src/egg"
import { bird, flyAway, startle, type Flier } from "../src/flock"
import { campfire, lightPool } from "../src/light"
import { TAU, clamp, fbm1, hash, hash2, lerp, rand, smoothstep, type RGB } from "../src/math"
import { driftClouds, makeClouds, makeStars, makeStorm, paintClouds, paintSky, paintStars, paintStorm, type Cloud, type Orb, type Star } from "../src/sky"
import type { Activity, Season, Settings, Time, Wallpaper } from "../src/wallpaper"
import { WeatherLayer } from "../src/weather"

// The scene runs slower than real time, which keeps it calm behind text.
const TIME_SCALE = 0.35
// Animals and people move at a quarter of scene speed.
const CREATURE_SPEED = 0.25
const HORIZON = 0.5
// How long the message in a bottle stays, in scene seconds.
const BOTTLE = 95

// What changes with the time of day. Sea, sand and foam get their own colors; at night the foam glows with
// bioluminescence instead of turning white. Objects and animals have one daytime color each, darkened by tint.
interface Look {
  style: "rim" | "front"
  light: RGB
  sky: [number, RGB][]
  orb: Orb
  stars: number
  clouds: { puffy: boolean; top: RGB; bottom: RGB; alpha: number }
  sea: [far: RGB, near: RGB]
  sand: [dry: RGB, wet: RGB]
  foam: RGB
  glitter: number
  tint: RGB
  night: boolean
}

const LOOKS: Record<Time, Look> = {
  day: {
    style: "front",
    light: [1, 0.97, 0.88],
    sky: [
      [0, [0.1, 0.35, 0.75]],
      [0.3, [0.3, 0.6, 0.88]],
      [HORIZON, [0.7, 0.85, 0.92]],
    ],
    orb: { x: 0.18, y: 0.14, r: 0.035, core: [5, 4.6, 3.8], glow: [1, 0.95, 0.8], near: 0.45, wide: 0.12 },
    stars: 0,
    clouds: { puffy: true, top: [1.1, 1.1, 1.1], bottom: [0.6, 0.68, 0.8], alpha: 0.9 },
    sea: [
      [0.12, 0.42, 0.62],
      [0.08, 0.6, 0.62],
    ],
    sand: [
      [0.86, 0.76, 0.55],
      [0.62, 0.52, 0.36],
    ],
    foam: [0.92, 0.96, 1],
    glitter: 0.15,
    tint: [1, 1, 1],
    night: false,
  },
  sunset: {
    style: "rim",
    light: [1, 0.5, 0.2],
    sky: [
      [0, [0.03, 0.02, 0.08]],
      [0.22, [0.12, 0.04, 0.12]],
      [0.38, [0.45, 0.14, 0.14]],
      [HORIZON, [1, 0.5, 0.18]],
    ],
    orb: { x: 0.55, y: 0.475, r: 0.055, core: [3.2, 1.7, 0.6], glow: [1, 0.42, 0.14], near: 0.5, wide: 0.25 },
    stars: 25,
    clouds: { puffy: false, top: [0.1, 0.035, 0.09], bottom: [0.8, 0.3, 0.2], alpha: 0.55 },
    sea: [
      [0.55, 0.25, 0.18],
      [0.12, 0.07, 0.12],
    ],
    sand: [
      [0.4, 0.22, 0.15],
      [0.25, 0.13, 0.1],
    ],
    foam: [1, 0.62, 0.42],
    glitter: 1,
    tint: [0.22, 0.13, 0.1],
    night: false,
  },
  night: {
    style: "rim",
    light: [0.3, 0.62, 1.5],
    sky: [
      [0, [0.004, 0.008, 0.03]],
      [0.25, [0.014, 0.024, 0.07]],
      [0.4, [0.035, 0.055, 0.14]],
      [HORIZON, [0.07, 0.1, 0.24]],
    ],
    orb: { x: 0.7, y: 0.16, r: 0.03, core: [1, 0.72, 0.3], glow: [0.45, 0.3, 0.12], near: 0.2, wide: 0.08, moon: true },
    stars: 140,
    clouds: { puffy: false, top: [0.015, 0.02, 0.05], bottom: [0.06, 0.1, 0.3], alpha: 0.4 },
    sea: [
      [0.045, 0.085, 0.2],
      [0.01, 0.03, 0.07],
    ],
    sand: [
      [0.06, 0.08, 0.17],
      [0.03, 0.05, 0.11],
    ],
    foam: [0.1, 0.85, 1.1],
    glitter: 0.7,
    tint: [0.02, 0.032, 0.075],
    night: true,
  },
}

// Daylight comes from the upper left, where the sun is.
const DAYLIGHT = (() => {
  const l = Math.hypot(0.5, 0.6, 0.6)
  return [-0.5 / l, -0.6 / l, 0.6 / l] as const
})()

// Out of season (autumn and winter) the day is cooler: grayer water and paler sand.
const OFF_SEASON: Partial<Look> = {
  sea: [
    [0.14, 0.3, 0.42],
    [0.13, 0.38, 0.42],
  ],
  sand: [
    [0.74, 0.69, 0.56],
    [0.52, 0.47, 0.38],
  ],
}
// Summer umbrellas, busiest first: x as a fraction of the width, y in screen heights, and stripe color.
const UMBRELLAS: [number, number, RGB][] = [
  [0.64, 0.86, [0.85, 0.15, 0.12]],
  [0.32, 0.84, [0.95, 0.72, 0.1]],
  [0.78, 0.82, [0.15, 0.58, 0.35]],
  [0.48, 0.9, [0.2, 0.45, 0.88]],
  [0.22, 0.93, [0.95, 0.45, 0.12]],
  [0.42, 0.8, [0.8, 0.2, 0.55]],
]
const SKIN: RGB[] = [
  [0.85, 0.62, 0.48],
  [0.55, 0.36, 0.24],
  [0.95, 0.75, 0.6],
]

// Daytime colors.
const TRUNK: RGB = [0.5, 0.36, 0.22]
const FROND: RGB = [0.18, 0.45, 0.14]

interface Palm {
  base: [number, number]
  crown: [number, number]
  lean: number
}

interface Dolphin {
  t: number
  x: number
  y: number
  dir: number
  wait: number
}

class Beach extends Canvas {
  private time = 0
  private creatureTime = 0
  private readonly activity: Activity
  private readonly look: Look
  private lighting: Lighting = { style: "front", dir: DAYLIGHT }
  private background = new Float32Array(0)
  private stars: Star[]
  private clouds: Cloud[]
  private storm = makeStorm()
  private palms: Palm[] = []
  private boat = { x: -9, dir: 1, next: 14 }
  private dolphins: Dolphin[] = []
  private splashes: { x: number; y: number; vx: number; vy: number; age: number }[] = []
  private crab = { x: 0.5, dir: 1, rest: 0, phase: 0 }
  private surfer = { x: -0.2, phase: 0 }
  private startled: Flier[] = []
  // The easter egg: a message in a bottle drifts in, washes up on the wet sand for a while, and floats away again.
  // t counts scene seconds.
  private bottle = { wait: eggWait() * TIME_SCALE, t: -1 }
  private readonly season: Season
  private readonly weather: WeatherLayer
  private swimmers: { x: number; y: number; phase: number }[] = []

  constructor(settings: Settings) {
    super()
    this.activity = settings.activity
    this.season = settings.season ?? "spring"
    const offSeason = this.season === "autumn" || this.season === "winter"
    this.weather = new WeatherLayer(settings.weather ?? "clear", settings.time, HORIZON)
    const look = offSeason && settings.time === "day" ? { ...LOOKS.day, ...OFF_SEASON } : LOOKS[settings.time]
    // With the sun or moon behind cloud, only a trace of the glitter path is left.
    this.look = this.weather.covered ? { ...look, glitter: look.glitter * 0.15 } : look
    if (this.season === "summer" && !this.look.night) this.swimmers = Array.from({ length: { calm: 1, lively: 3, teeming: 5 }[settings.activity] }, (_, i) => ({ x: 0.25 + i * 0.13 + hash(i) * 0.05, y: 0.69 + hash(i * 3.3) * 0.03, phase: i * 1.9 }))
    this.stars = makeStars(this.look.stars, 0.45)
    this.clouds = makeClouds(this.look.clouds.puffy ? 4 : 5, this.look.clouds.puffy, 0.08, 0.3)
    if (settings.activity !== "calm") this.dolphins = [0, 1].map((i) => ({ t: -1, x: 0, y: 0, dir: 1, wait: 4 + i * 9 }))
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
    this.stepBoat(dt)
    for (const d of this.dolphins) this.stepDolphin(d, dt, cdt)
    for (const s of this.splashes) {
      s.age += dt
      s.vy += 0.15 * dt
      s.x += s.vx * dt
      s.y += s.vy * dt
    }
    this.splashes = this.splashes.filter((s) => s.age < 1.2)
    this.startled = flyAway(this.startled, dt, this.A)
    const b = this.bottle
    if (b.t >= 0) b.t += dt
    if (b.t > BOTTLE) {
      b.t = -1
      b.wait = eggWait(true) * TIME_SCALE
    }
    if (b.t < 0) {
      b.wait -= dt
      if (b.wait <= 0) b.t = 0
    }
    if (this.activity === "teeming") {
      const c = this.crab
      c.phase += cdt * 10
      if (c.rest > 0) c.rest -= cdt
      else {
        c.x += c.dir * 0.04 * cdt
        if (Math.random() < cdt * 0.3) c.rest = rand(2, 5)
        if (c.x > 0.75 * this.A) c.dir = -1
        if (c.x < 0.3 * this.A) c.dir = 1
      }
      this.surfer.phase += dt
      this.surfer.x += 0.025 * dt
      if (this.surfer.x > this.A + 0.2) this.surfer.x = -0.2
    }
  }

  // A few gulls take off from the sand or water below the click.
  poke(x: number, y: number) {
    startle(this.startled, x, Math.max(y, HORIZON + 0.08), 4)
  }

  render() {
    this.hdr.set(this.background)
    if (!this.weather.covered) paintStars(this.hdr, this.W, this.H, this.stars, this.time, 0.45, this.look.stars > 50 ? 0.5 : 0.3)
    const [top, bottom] = this.weather.scud ?? [this.look.clouds.top, this.look.clouds.bottom]
    paintClouds(this.hdr, this.W, this.H, this.clouds, top, bottom, this.look.clouds.alpha, this.look.clouds.puffy)
    paintStorm(this.hdr, this.W, this.H, this.storm, this.look.clouds.top, this.look.clouds.bottom, this.gloom)
    this.drawSea()
    for (const s of this.swimmers) this.drawSwimmer(s)
    this.drawBoat()
    for (const d of this.dolphins) this.drawDolphin(d)
    if (this.activity === "teeming") this.drawSurfer()
    this.drawSplashes()
    if (this.bottle.t >= 0) this.drawBottle()
    if (this.activity !== "calm" && !this.look.night) this.drawGulls()
    if (this.activity === "teeming") this.drawCrab()
    for (const b of this.startled) this.shape(bird(b, this.H, 0.03 * this.H, this.paint([0.75, 0.78, 0.82])), this.lighting, 0.5)
    if (this.look.night) this.drawBonfire()
    // Trunks are drawn each frame, over the sea, since they cross the water.
    for (const p of this.palms) {
      this.drawTrunk(p)
      this.drawFronds(p)
    }
    this.weather.draw(this.hdr, this.W, this.H)
    this.finish()
  }

  protected override visit() {
    if (this.boat.x < -5) this.boat.next = 0
  }

  // The sky, island and sand never move, so they are painted once per size; the sea is drawn over the sand each frame
  // so the waterline can come and go.
  protected override layout() {
    const { W, H, A, look } = this
    this.lighting = look.style === "front" ? { style: "front", dir: DAYLIGHT } : { style: "rim", color: look.light, x: look.orb.x * W, y: look.orb.y * H }
    paintSky(this.hdr, W, H, look.sky, look.orb)
    this.weather.cover(this.hdr, W, H)
    // A small island on the horizon.
    const ix = 0.16 * A
    this.polygon(Array.from({ length: 21 }, (_, i) => [(ix + Math.cos((i / 20) * Math.PI) * 0.08) * H, (HORIZON - Math.sin((i / 20) * Math.PI) * 0.025) * H] as const), this.paint([0.2, 0.35, 0.22]))
    this.shape([cap(ix * H, (HORIZON - 0.02) * H, (ix + 0.01) * H, (HORIZON - 0.06) * H, 0.003 * H, 0.002 * H, this.paint(TRUNK))], this.lighting, 0.4)
    for (let i = 0; i < 5; i++) {
      const a = Math.PI + (i / 4) * Math.PI
      this.shape([cap((ix + 0.01) * H, (HORIZON - 0.06) * H, (ix + 0.01 + Math.cos(a) * 0.025) * H, (HORIZON - 0.06 + Math.sin(a) * 0.012 + 0.01) * H, 0.004 * H, 0.001 * H, this.paint(FROND))], this.lighting, 0.3)
    }
    // Dry sand everywhere below the horizon; the sea covers it down to the waterline each frame.
    const [dry] = look.sand
    for (let y = Math.floor(HORIZON * H); y < H; y++)
      for (let x = 0; x < W; x++) {
        const ripple = 0.92 + 0.08 * Math.sin(x * 0.4 + y * 1.1 + fbm1(x * 0.05 + y * 0.02, 3) * 5) + (hash2(x, y) - 0.5) * 0.06
        const o = (y * W + x) * 3
        this.hdr[o] = dry[0] * ripple
        this.hdr[o + 1] = dry[1] * ripple
        this.hdr[o + 2] = dry[2] * ripple
      }
    // Summer brings a crowd of umbrellas and sunbathers; out of season the beach is empty but for driftwood.
    const season = this.season
    if (season === "summer") for (const [i, [x, y, stripe]] of UMBRELLAS.slice(0, { calm: 2, lively: 4, teeming: 6 }[this.activity]).entries()) this.drawUmbrella(x * A, y, stripe, i % 3 === 2 ? undefined : SKIN[i % SKIN.length])
    if (season === "autumn" || season === "winter") this.drawDriftwood(0.56 * A, 0.9)
    if (this.activity === "teeming" && season !== "autumn" && season !== "winter") this.drawBeachThings()
    this.palms = [
      { base: [0.07 * A, 1.03], crown: [0.2 * A, 0.36], lean: 1 },
      { base: [0.94 * A, 1.0], crown: [0.85 * A, 0.44], lean: -1 },
    ]
    this.background = this.hdr.slice()
  }

  private paint(c: RGB): RGB {
    const t = this.look.tint
    return [c[0] * t[0], c[1] * t[1], c[2] * t[2]]
  }

  // Where the water meets the sand, in screen heights; the swash runs up and back.
  private shore(u: number) {
    return 0.74 + 0.01 * Math.sin(u * 2.3 + 1) + 0.012 * Math.sin(this.time * 0.5)
  }

  // The sea: deepening toward the shore, with drifting wave streaks, a glittering path under the sun or moon, a wave
  // rolling in now and then, wet sand above the waterline, and foam along its edge.
  private drawSea() {
    const { W, H, hdr, look } = this
    const t = this.time
    const [far, near] = look.sea
    const [, wet] = look.sand
    const ox = look.orb.x * W
    const roll = (t * 0.08) % 1
    for (let x = 0; x < W; x++) {
      const u = x / H
      const edge = this.shore(u) * H
      const reach = (0.74 + 0.01 * Math.sin(u * 2.3 + 1) + 0.014) * H
      const wave = lerp(0.62, edge / H - 0.005, roll) * H
      for (let y = Math.floor(HORIZON * H); y < Math.min(H, reach + 2); y++) {
        const o = (y * W + x) * 3
        if (y > edge) {
          // Wet sand the swash has just left.
          const k = clamp((reach - y) / (reach - edge + 1), 0, 1) * 0.8
          hdr[o] += (wet[0] - hdr[o]) * k
          hdr[o + 1] += (wet[1] - hdr[o + 1]) * k
          hdr[o + 2] += (wet[2] - hdr[o + 2]) * k
          continue
        }
        const depth = clamp((y / H - HORIZON) / (edge / H - HORIZON), 0, 1)
        let r = lerp(far[0], near[0], depth)
        let g = lerp(far[1], near[1], depth)
        let b = lerp(far[2], near[2], depth)
        const streak = Math.sin(u * (30 - depth * 18) + y * 0.9 + t * 0.6 + Math.sin(y * 0.37) * 3)
        const shine = streak > 0.9 ? (streak - 0.9) * 2 * (0.4 + depth) : 0
        r += look.light[0] * shine * 0.25
        g += look.light[1] * shine * 0.25
        b += look.light[2] * shine * 0.25
        // The glitter path widens toward the shore.
        const spread = (0.02 + depth * 0.12) * H
        const along = Math.abs(x - ox) / spread
        if (along < 1 && hash2(x, Math.floor(y * 0.5) + Math.floor(t * 3) * 131) > 0.86 + along * 0.1) {
          const k = (1 - along) * look.glitter * 1.2
          r += look.light[0] * k
          g += look.light[1] * k
          b += look.light[2] * k
        }
        // Foam: the incoming wave's crest and the edge of the water.
        const broken = smoothstep(0.42, 0.6, fbm1(u * 6 + t * 0.1, 4))
        const crest = Math.max(0, 1 - Math.abs(y - wave) / 1.2) * (0.5 + 0.5 * Math.sin(u * 40 + t)) * (1 - roll) * broken
        const lap = Math.max(0, 1 - (edge - y) / 2.2) * (0.7 + 0.3 * Math.sin(u * 30 - t * 2))
        const foam = Math.max(crest, lap)
        r += (look.foam[0] - r) * foam
        g += (look.foam[1] - g) * foam
        b += (look.foam[2] - b) * foam
        hdr[o] = r
        hdr[o + 1] = g
        hdr[o + 2] = b
      }
      // At night the glowing foam lights the wet sand just beyond it.
      if (look.night)
        for (let y = Math.floor(edge); y < Math.min(H, edge + 0.05 * H); y++) {
          const k = Math.exp(-(y - edge) / (0.012 * H)) * 0.2
          const o = (y * W + x) * 3
          hdr[o] += look.foam[0] * k
          hdr[o + 1] += look.foam[1] * k
          hdr[o + 2] += look.foam[2] * k
        }
    }
  }

  // A bonfire on the sand at night, lighting the beach, the crab and the palm beside it.
  private drawBonfire() {
    const H = this.H
    const x = 0.17 * this.A * H
    const gy = 0.92 * H
    const fire = campfire(x, gy, H * 1.2, this.time)
    lightPool(this.hdr, this.W, H, x, gy - 0.03 * H, 0.36 * H, 0.13 * H, [1, 0.4, 0.07], 2.6 * fire.flicker, 0.04 * fire.flicker)
    this.shape(fire.logs, { style: "rim", color: [1.4, 0.5, 0.1], x, y: gy - 0.03 * H })
    for (const flame of fire.flames) this.shape(flame, { style: "front", dir: [0, 0, 1] }, 0)
  }

  // A palm trunk curving from its base to the crown, ringed with old leaf scars, with coconuts at the top.
  private drawTrunk(p: Palm) {
    const H = this.H
    const mid: [number, number] = [p.base[0] - p.lean * 0.02, (p.base[1] + p.crown[1]) / 2 + 0.03]
    const at = (t: number): [number, number] => [(1 - t) ** 2 * p.base[0] + 2 * (1 - t) * t * mid[0] + t * t * p.crown[0], (1 - t) ** 2 * p.base[1] + 2 * (1 - t) * t * mid[1] + t * t * p.crown[1]]
    const trunk = this.paint(TRUNK)
    const parts: Part[] = []
    for (let i = 0; i < 14; i++) {
      const [ax, ay] = at(i / 14)
      const [bx, by] = at((i + 1) / 14)
      parts.push(cap(ax * H, ay * H, bx * H, by * H, lerp(0.022, 0.013, i / 14) * H, lerp(0.022, 0.013, (i + 1) / 14) * H, trunk))
    }
    this.shape(parts, this.lighting)
    const scar = this.paint([0.32, 0.22, 0.13])
    for (let i = 1; i < 20; i++) {
      const [x, y] = at(i / 20)
      const r = lerp(0.022, 0.013, i / 20) * H
      this.shape([cap(x * H - r, y * H + 0.002 * H, x * H + r, y * H - 0.002 * H, 0.0015 * H, 0.0015 * H, scar)], this.lighting, 0)
    }
    const nut = this.paint([0.35, 0.22, 0.1])
    this.shape([ell((p.crown[0] - 0.01) * H, (p.crown[1] + 0.012) * H, 0.009 * H, 0.009 * H, 0, nut), ell((p.crown[0] + 0.008) * H, (p.crown[1] + 0.014) * H, 0.009 * H, 0.009 * H, 0, nut), ell(p.crown[0] * H, (p.crown[1] + 0.022) * H, 0.009 * H, 0.009 * H, 0, nut)], this.lighting)
  }

  // Eight fronds arching out from the crown and drooping at the tips, each with leaflets, swaying in the breeze.
  private drawFronds(p: Palm) {
    const H = this.H
    const frond = this.paint(FROND)
    const [cx, cy] = [p.crown[0] * H, p.crown[1] * H]
    for (let i = 0; i < 8; i++) {
      const base = -Math.PI / 2 + ((i / 7) * 2 - 1) * 1.6 + p.lean * 0.15
      const sway = Math.sin(this.time * 0.8 + i * 1.3 + p.lean) * 0.06
      const length = (0.17 + hash(i * 3.1 + p.lean) * 0.05) * H
      const parts: Part[] = []
      let [x, y] = [cx, cy]
      let angle = base + sway
      for (let s = 0; s < 8; s++) {
        const q = s / 8
        // Fronds pointing sideways droop more.
        angle += (Math.cos(base) > 0 ? 1 : -1) * 0.06 * (0.3 + Math.abs(Math.cos(base))) + 0.02
        const nx = x + Math.cos(angle) * (length / 8)
        const ny = y + Math.sin(angle) * (length / 8) + q * q * 0.006 * H
        parts.push(cap(x, y, nx, ny, lerp(0.005, 0.0015, q) * H, lerp(0.005, 0.0015, q + 0.125) * H, frond))
        const leaf = (1 - q * 0.6) * 0.03 * H
        for (const side of [-1, 1]) {
          const la = angle + side * 1.1 + 0.4
          parts.push(cap(nx, ny, nx + Math.cos(la) * leaf, ny + Math.sin(la) * leaf, 0.0028 * H, 0.0008 * H, frond))
        }
        ;[x, y] = [nx, ny]
      }
      this.shape(parts, this.lighting, this.look.style === "rim" ? 0.3 : 0.7)
    }
  }

  // A striped umbrella over a towel, with someone sunbathing on it if skin is given. Farther up the beach is smaller.
  private drawUmbrella(ux: number, uy: number, stripe: RGB, skin?: RGB) {
    const H = this.H
    const s = 0.75 + (uy - 0.84) * 3
    const P = (dx: number, dy: number) => [(ux + dx * s) * H, (uy + dy * s) * H] as const
    this.polygon([P(-0.06, 0.04), P(0.07, 0.035), P(0.09, 0.075), P(-0.04, 0.08)], this.paint([0.2, 0.45, 0.85]))
    this.polygon([P(-0.03, 0.042), P(0, 0.04), P(0.025, 0.078), P(-0.008, 0.079)], this.paint([0.92, 0.92, 0.88]))
    if (skin) {
      const c = this.paint(skin)
      this.shape([cap(...P(-0.035, 0.06), ...P(0.045, 0.056), 0.009 * s * H, 0.006 * s * H, c), ell(...P(-0.048, 0.059), 0.01 * s * H, 0.009 * s * H, 0, c)], this.lighting, 0.6)
      this.shape([cap(...P(-0.012, 0.06), ...P(0.012, 0.059), 0.0095 * s * H, 0.0095 * s * H, this.paint(stripe))], this.lighting, 0.4)
    }
    this.shape([cap(...P(0, 0.05), ...P(0, -0.12), 0.003 * s * H, 0.003 * s * H, this.paint([0.85, 0.85, 0.82]))], this.lighting, 0.4)
    for (let k = 0; k < 6; k++) {
      const a0 = Math.PI + (k / 6) * Math.PI
      const a1 = Math.PI + ((k + 1) / 6) * Math.PI
      const color = this.paint(k % 2 ? [0.92, 0.92, 0.88] : stripe)
      this.polygon([P(0, -0.15), P(Math.cos(a0) * 0.09, -0.12 + Math.sin(a0) * -0.02 + 0.02), P(Math.cos(a1) * 0.09, -0.12 + Math.sin(a1) * -0.02 + 0.02)], color)
    }
  }

  // A bleached log washed up on the sand.
  private drawDriftwood(x: number, y: number) {
    const H = this.H
    const wood = this.paint([0.62, 0.55, 0.45])
    this.shape([cap((x - 0.07) * H, y * H, (x + 0.06) * H, (y - 0.008) * H, 0.009 * H, 0.006 * H, wood, 2), cap((x + 0.02) * H, (y - 0.005) * H, (x + 0.05) * H, (y - 0.03) * H, 0.004 * H, 0.002 * H, wood)], this.lighting, 0.7)
  }

  // A swimmer's head bobbing in the surf, ringed by a little foam.
  private drawSwimmer(s: { x: number; y: number; phase: number }) {
    const H = this.H
    const x = s.x * this.A * H
    const y = (s.y + Math.sin(this.time * 1.4 + s.phase) * 0.003) * H
    const foam = this.look.foam
    this.ellipse(x, y + 0.006 * H, 0.014 * H, 0.004 * H, foam[0], foam[1], foam[2], 0.35)
    this.shape([ell(x, y, 0.007 * H, 0.008 * H, 0, this.paint(SKIN[Math.floor(s.phase) % SKIN.length])), ell(x, y - 0.004 * H, 0.0072 * H, 0.0045 * H, 0, this.paint([0.15, 0.1, 0.06]))], this.lighting, 0.6)
  }

  // An umbrella, a towel, a sandcastle and a beach ball, for the busiest level.
  private drawBeachThings() {
    const { A, H } = this
    if (this.season !== "summer") this.drawUmbrella(0.64 * A, 0.86, [0.85, 0.15, 0.12])
    const [sx, sy] = [0.42 * A, 0.92]
    const sand = this.paint([0.78, 0.66, 0.42])
    const box = (x0: number, y0: number, x1: number, y1: number) => [[x0 * H, y0 * H], [x1 * H, y0 * H], [x1 * H, y1 * H], [x0 * H, y1 * H]] as const
    this.polygon(box(sx - 0.05, sy - 0.03, sx + 0.05, sy), sand)
    for (const [dx, h] of [[-0.04, 0.06], [0, 0.08], [0.04, 0.06]] as const) {
      this.polygon(box(sx + dx - 0.012, sy - h, sx + dx + 0.012, sy - 0.02), sand)
      for (const k of [-1, 0, 1]) this.polygon(box(sx + dx + k * 0.009 - 0.003, sy - h - 0.006, sx + dx + k * 0.009 + 0.003, sy - h), sand)
    }
    this.shape([cap(sx * H, (sy - 0.086) * H, sx * H, (sy - 0.11) * H, 0.0012 * H, 0.0012 * H, this.paint([0.4, 0.3, 0.2]))], this.lighting, 0)
    this.polygon([[sx * H, (sy - 0.11) * H], [(sx + 0.016) * H, (sy - 0.104) * H], [sx * H, (sy - 0.098) * H]], this.paint([0.85, 0.15, 0.12]))
    const [bx, by] = [0.53 * A, 0.95]
    for (const [k, color] of [[0, [0.9, 0.2, 0.15]], [1, [0.95, 0.85, 0.2]], [2, [0.2, 0.45, 0.9]]] as const)
      this.shape([ell((bx + (k - 1) * 0.008) * H, (by - 0.016) * H, 0.009 * H, 0.016 * H, 0, this.paint([...color] as RGB))], this.lighting, 0.6)
  }

  // Now and then a sailboat drifts along the horizon.
  private stepBoat(dt: number) {
    const b = this.boat
    if (b.x < -5) {
      b.next -= dt
      if (b.next > 0) return
      b.dir = Math.random() < 0.5 ? 1 : -1
      b.x = b.dir > 0 ? -0.1 : this.A + 0.1
      return
    }
    b.x += b.dir * 0.03 * dt
    if (b.x < -0.2 || b.x > this.A + 0.2) {
      b.x = -9
      b.next = rand(40, 75)
    }
  }

  private drawBoat() {
    const b = this.boat
    if (b.x < -5) return
    const H = this.H
    const x = b.x * H
    const y = (HORIZON + 0.004 + Math.sin(this.time * 1.2) * 0.001) * H
    const s = 0.05 * H
    this.polygon([[x - s * 0.6, y - s * 0.12], [x + s * 0.6, y - s * 0.12], [x + s * 0.42, y + s * 0.05], [x - s * 0.42, y + s * 0.05]], this.paint([0.3, 0.2, 0.15]))
    this.polygon([[x - s * 0.05, y - s * 0.15], [x - s * 0.05, y - s * 1.1], [x + s * 0.55 * b.dir, y - s * 0.15]], this.paint([0.92, 0.9, 0.84]))
    this.polygon([[x - s * 0.12, y - s * 0.15], [x - s * 0.12, y - s * 0.85], [x - s * 0.5 * b.dir, y - s * 0.15]], this.paint([0.85, 0.82, 0.76]))
    // At night a lantern hangs at the stern, lighting the sails and the water around the boat.
    if (!this.look.night) return
    const lx = x - s * 0.45 * b.dir
    lightPool(this.hdr, this.W, H, lx, y, s * 1.4, s * 0.9, [1, 0.55, 0.15], 2.5, 0.03)
    this.disc(lx, y - s * 0.25, Math.max(1, s * 0.07), 1.6, 0.85, 0.2, 1)
  }

  // Each dolphin waits underwater, then arcs out of the sea and splashes back in.
  private stepDolphin(d: Dolphin, dt: number, cdt: number) {
    if (d.t < 0) {
      d.wait -= cdt
      if (d.wait > 0) return
      d.t = 0
      d.dir = Math.random() < 0.5 ? 1 : -1
      d.x = rand(0.3 * this.A, 0.7 * this.A)
      d.y = rand(0.56, 0.66)
      this.splash(d.x, d.y)
      return
    }
    d.t += dt / 2.5
    if (d.t >= 1) {
      this.splash(d.x + d.dir * 0.16, d.y)
      d.t = -1
      d.wait = rand(10, 25)
    }
  }

  private splash(x: number, y: number) {
    for (let i = 0; i < 10; i++) this.splashes.push({ x, y, vx: (Math.random() - 0.5) * 0.06, vy: -(0.03 + Math.random() * 0.05), age: 0 })
  }

  private drawSplashes() {
    const { H, look } = this
    for (const s of this.splashes) {
      const k = (1 - s.age / 1.2) * 0.8
      this.disc(s.x * H, s.y * H, 0.9, look.foam[0], look.foam[1], look.foam[2], k)
    }
  }

  private drawDolphin(d: Dolphin) {
    if (d.t < 0) return
    const H = this.H
    const S = 0.15 * H * (0.7 + (d.y - 0.56) * 3)
    const x = (d.x + d.dir * 0.16 * d.t) * H
    const y = (d.y - Math.sin(Math.PI * d.t) * 0.08) * H
    const angle = Math.atan2(-Math.cos(Math.PI * d.t) * 0.08 * Math.PI, d.dir * 0.16)
    const ca = Math.cos(angle)
    const sa = Math.sin(angle)
    const P = (u: number, v: number): [number, number] => [x + (u * ca - v * sa) * S, y + (u * sa + v * ca) * S]
    const back = this.paint([0.42, 0.52, 0.62])
    this.shape(
      [
        cap(...P(-0.4, 0), ...P(0.35, 0), 0.08 * S, 0.11 * S, back),
        cap(...P(0.35, 0.02), ...P(0.52, 0.04), 0.05 * S, 0.025 * S, back),
        cap(...P(0, -0.1), ...P(-0.1 * Math.sign(ca || 1), -0.24), 0.05 * S, 0.01 * S, back),
        cap(...P(-0.4, 0), ...P(-0.55, -0.1), 0.04 * S, 0.02 * S, back),
        cap(...P(-0.4, 0), ...P(-0.55, 0.1), 0.04 * S, 0.02 * S, back),
        cap(...P(0.1, 0.06), ...P(-0.02, 0.18), 0.035 * S, 0.01 * S, back),
      ],
      this.lighting,
      0.7,
    )
    this.shape([cap(...P(-0.25, 0.04), ...P(0.3, 0.05), 0.04 * S, 0.06 * S, this.paint([0.75, 0.78, 0.8]))], this.lighting, 0.5)
  }

  // Gulls wheeling over the water, wings flexing.
  private drawGulls() {
    const H = this.H
    const count = this.activity === "teeming" ? 4 : 2
    for (let i = 0; i < count; i++) {
      const a = this.creatureTime * (0.4 + i * 0.08) + i * 1.7
      const x = (0.5 * this.A + Math.cos(a) * (0.25 + i * 0.06)) * H
      const y = (0.22 + Math.sin(a) * 0.04 + i * 0.03) * H
      const flap = Math.sin(this.time * 3 + i) * 0.4
      const s = 0.035 * H
      const wing = this.paint([0.75, 0.78, 0.82])
      const tip = this.paint([0.1, 0.1, 0.12])
      this.shape(
        [
          cap(x, y, x - s * 0.55, y - s * (0.25 + flap * 0.3), 0.1 * s, 0.07 * s, wing),
          cap(x - s * 0.55, y - s * (0.25 + flap * 0.3), x - s, y - s * (0.05 + flap * 0.5), 0.07 * s, 0.03 * s, tip),
          cap(x, y, x + s * 0.55, y - s * (0.25 + flap * 0.3), 0.1 * s, 0.07 * s, wing),
          cap(x + s * 0.55, y - s * (0.25 + flap * 0.3), x + s, y - s * (0.05 + flap * 0.5), 0.07 * s, 0.03 * s, tip),
          ell(x, y, 0.25 * s, 0.12 * s, 0, this.paint([0.95, 0.95, 0.95])),
        ],
        this.lighting,
        0.5,
      )
    }
  }

  // A green glass bottle with a cork and a rolled note inside, bobbing in on the waves, lying on the wet sand, then
  // carried back out and away along the shore.
  private drawBottle() {
    const { A, H } = this
    const t = this.bottle.t
    const land = 0.38 * A
    // On the wet sand, just where the highest swash reaches.
    const beached = 0.75 + 0.01 * Math.sin(land * 2.3 + 1)
    const come = smoothstep(0, 22, t)
    const go = smoothstep(52, BOTTLE, t)
    const x = lerp(lerp(-0.08, land, come), A + 0.1, go)
    const afloat = 1 - smoothstep(18, 22, t) + smoothstep(52, 56, t)
    const y = lerp(lerp(0.62, beached, come), 0.66, smoothstep(52, 62, t)) + Math.sin(this.time * 1.4) * 0.004 * clamp(afloat, 0, 1)
    const tilt = 0.35 + Math.sin(this.time * 1.1) * 0.25 * clamp(afloat, 0, 1)
    const S = 0.09 * H
    const ca = Math.cos(tilt)
    const sa = Math.sin(tilt)
    const P = (u: number, v: number): [number, number] => [x * H + (u * ca - v * sa) * S, y * H + (u * sa + v * ca) * S]
    this.shape(
      [
        cap(...P(-0.35, 0), ...P(0.15, 0), 0.14 * S, 0.14 * S, this.paint([0.2, 0.5, 0.3])),
        cap(...P(0.15, 0), ...P(0.38, 0), 0.07 * S, 0.05 * S, this.paint([0.2, 0.5, 0.3])),
        cap(...P(0.38, 0), ...P(0.46, 0), 0.055 * S, 0.055 * S, this.paint([0.5, 0.32, 0.18])),
      ],
      this.lighting,
      0.6,
    )
    this.shape([cap(...P(-0.28, 0.01), ...P(0.08, 0.01), 0.07 * S, 0.07 * S, this.paint([0.88, 0.82, 0.62]))], this.lighting, 0.3)
    this.add(...P(-0.1, -0.1), this.look.light[0] * 0.5, this.look.light[1] * 0.5, this.look.light[2] * 0.5)
  }

  // A red crab scuttling sideways across the sand, claws up, pausing now and then.
  private drawCrab() {
    const H = this.H
    const c = this.crab
    const S = 0.05 * H
    const x = c.x * H
    const y = 0.97 * H
    const red = this.paint([0.85, 0.25, 0.12])
    const step = c.rest > 0 ? 0 : Math.sin(c.phase) * 0.06
    const parts: Part[] = [ell(x, y - 0.25 * S, 0.4 * S, 0.22 * S, 0, red)]
    for (const side of [-1, 1])
      for (let k = 0; k < 3; k++) {
        const kx = x + side * (0.25 + k * 0.1) * S
        parts.push(cap(kx, y - 0.2 * S, kx + side * 0.25 * S, y + (k % 2 ? step : -step) * S, 0.035 * S, 0.025 * S, red))
      }
    for (const side of [-1, 1]) {
      parts.push(cap(x + side * 0.3 * S, y - 0.35 * S, x + side * 0.45 * S, y - 0.6 * S, 0.04 * S, 0.035 * S, red))
      parts.push(ell(x + side * 0.48 * S, y - 0.68 * S, 0.12 * S, 0.09 * S, side * 0.5, red))
    }
    this.shape(parts, this.lighting, 0.6)
    for (const side of [-1, 1]) this.add(x + side * 0.1 * S, y - 0.45 * S, 0.02, 0.02, 0.02)
  }

  // A surfer standing on a board, riding the swell along the shore and bobbing.
  private drawSurfer() {
    const H = this.H
    const s = this.surfer
    const S = 0.12 * H
    const x = s.x * H
    const y = (0.645 + Math.sin(s.phase * 1.5) * 0.004) * H
    const tilt = Math.sin(s.phase * 1.2) * 0.08
    const P = (u: number, v: number): [number, number] => [x + (u * Math.cos(tilt) - v * Math.sin(tilt)) * S, y + (u * Math.sin(tilt) + v * Math.cos(tilt)) * S]
    const suit = this.paint([0.08, 0.08, 0.1])
    this.shape([ell(...P(0, 0), 0.38 * S, 0.05 * S, tilt, this.paint([0.95, 0.75, 0.15]))], this.lighting, 0.6)
    this.shape(
      [
        cap(...P(-0.12, -0.02), ...P(-0.05, -0.38), 0.045 * S, 0.04 * S, suit),
        cap(...P(0.12, -0.02), ...P(0.05, -0.38), 0.045 * S, 0.04 * S, suit),
        cap(...P(0, -0.38), ...P(0.02, -0.68), 0.07 * S, 0.06 * S, suit),
        cap(...P(0.02, -0.62), ...P(-0.3, -0.55), 0.035 * S, 0.03 * S, suit),
        cap(...P(0.02, -0.62), ...P(0.32, -0.6), 0.035 * S, 0.03 * S, suit),
        ell(...P(0.03, -0.78), 0.065 * S, 0.07 * S, 0, this.paint([0.8, 0.6, 0.45])),
      ],
      this.lighting,
      0.6,
    )
  }
}

export const beach: Wallpaper = {
  id: "beach",
  name: "Beach",
  description: "Waves washing up a sandy beach between swaying palms, with a sailboat on the horizon now and then",
  activity: {
    calm: "Sea, waves, sand and palm trees",
    lively: "Adds leaping dolphins and seagulls",
    teeming: "Adds a crab, a surfer, an umbrella and a sandcastle",
  },
  scrim: {
    day: [
      [20, 40, 70],
      [20, 46, 58],
      [44, 38, 26],
    ],
    sunset: [
      [30, 14, 26],
      [36, 16, 22],
      [14, 8, 8],
    ],
    night: [
      [3, 6, 16],
      [2, 6, 14],
      [2, 4, 10],
    ],
  },
  create: (settings) => new Beach(settings),
}
