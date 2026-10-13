import { Canvas } from "../src/canvas"
import { eggWait } from "../src/egg"
import { TAU, clamp, hash, hash2, lerp, rand, smoothstep, type RGB } from "../src/math"
import { makeStars, makeStorm, paintSky, paintStars, paintStorm, driftClouds, type Orb, type Star } from "../src/sky"
import type { Activity, Settings, Time, Wallpaper } from "../src/wallpaper"
import { WeatherLayer } from "../src/weather"

// A carrier's bridge in Anomaly Arcade's Wings: overhead gear, a band of windows on the flight deck, the low-poly sea
// and a volcano island, and a console of instruments below, with a jet launching now and then. The ship, its deck and
// the bridge are one rigid frame; only the sea and the islands pitch, very slightly, against it.

const TIME_SCALE = 0.35
const CREATURE_SPEED = 0.25
// The horizon through the windows, and how much smaller than in Wings the world outside appears.
const HORIZON = 0.37
const WS = 0.6
// The horizon the looks' sky stops were drawn for, as in Wings.
const H0 = 0.44
// The sea's shading camera, as in Wings: its height over the water and focal length, in screen heights.
const CAMERA = 1
const FOCAL = 1
const ROW_RATE = 0.2
// The deck in perspective from the bridge: the focal length, the camera's place across the deck (in units of its
// height over the deck, plus to starboard), and how far right of the middle the deck's lines vanish.
const F = 1.2 * WS
const CAMX = 0.9
const VANISH = 0.18
// The windows: a band between the overhead gear and the console, in screen heights over the middle pane.
const TOP = 0.2
const SILL = 0.6
// How far the sea and islands pitch against the window frames, in screen heights, in calm water and in the storm.
const PITCH = 0.0022
const STORM_PITCH = 0.006
// The wiper's length, from its pivot on the middle pane's sill.
const WIPER = 0.36
const LAUNCH = 24
const LANDING = 28
const FLYOVER = 16
const EGG = 10

type Point = readonly [number, number]

interface Look {
  sky: [number, RGB][]
  orb: Orb
  stars: number
  cloud: [lit: RGB, shade: RGB]
  sea: [deep: RGB, lit: RGB]
  glitter: number
  spread: readonly [number, number]
  spec: RGB
  tint: RGB
  key: RGB
  lamp: number
  trail: RGB
  foam: RGB
  storm: RGB
  // The bridge: its frames and console as dark silhouettes, the faint rim the window light puts on them, the
  // instruments' backlight, and rain on the glass.
  frame: RGB
  rim: RGB
  drop: RGB
  // Inside: matte gray panels, lighter bezels, display backgrounds, the displays' main and accent glow (blue-green,
  // red and amber in night mode), and the bridge lighting (red at night).
  panel: RGB
  bezel: RGB
  screen: RGB
  glow: RGB
  glow2: RGB
  lamplight: RGB
  night: boolean
}

const LOOKS: Record<Time, Look> = {
  day: {
    sky: [
      [0, [0.07, 0.27, 0.72]],
      [0.24, [0.2, 0.47, 0.88]],
      [H0, [0.62, 0.82, 0.96]],
    ],
    orb: { x: 0, y: 0.14, r: 0.033, core: [5, 4.6, 3.8], glow: [1, 0.95, 0.8], near: 0.45, wide: 0.12 },
    stars: 0,
    cloud: [
      [1.05, 1.07, 1.1],
      [0.6, 0.7, 0.86],
    ],
    sea: [
      [0.02, 0.2, 0.42],
      [0.06, 0.52, 0.62],
    ],
    glitter: 0.7,
    spread: [0.04, 0.16],
    spec: [1.2, 1.15, 1],
    tint: [1, 1, 1],
    key: [1, 0.97, 0.88],
    lamp: 0.25,
    trail: [0.95, 0.97, 1],
    foam: [0.85, 0.95, 1],
    storm: [0.1, 0.16, 0.15],
    frame: [0.022, 0.027, 0.036],
    rim: [0.1, 0.13, 0.18],
    drop: [0.7, 0.82, 0.95],
    panel: [0.045, 0.05, 0.058],
    bezel: [0.1, 0.11, 0.122],
    screen: [0.006, 0.03, 0.04],
    glow: [0.12, 0.62, 0.6],
    glow2: [0.25, 0.85, 0.35],
    lamplight: [0.6, 0.8, 1],
    night: false,
  },
  sunset: {
    sky: [
      [0, [0.12, 0.2, 0.55]],
      [0.18, [0.3, 0.32, 0.72]],
      [0.31, [0.75, 0.42, 0.62]],
      [0.39, [1.1, 0.55, 0.5]],
      [H0, [1.25, 0.72, 0.45]],
    ],
    orb: { x: 0, y: 0.415, r: 0.038, core: [3, 1.7, 1], glow: [1.1, 0.5, 0.35], near: 0.5, wide: 0.25 },
    stars: 10,
    cloud: [
      [1.05, 0.58, 0.55],
      [0.36, 0.27, 0.52],
    ],
    sea: [
      [0.06, 0.1, 0.32],
      [0.2, 0.26, 0.62],
    ],
    glitter: 0.9,
    spread: [0.04, 0.3],
    spec: [1.3, 0.62, 0.42],
    tint: [0.32, 0.24, 0.34],
    key: [1, 0.55, 0.45],
    lamp: 0.6,
    trail: [1.1, 0.62, 0.6],
    foam: [1, 0.78, 0.82],
    storm: [0.12, 0.1, 0.14],
    frame: [0.03, 0.018, 0.04],
    rim: [0.22, 0.1, 0.12],
    drop: [1, 0.6, 0.55],
    panel: [0.05, 0.04, 0.054],
    bezel: [0.11, 0.09, 0.11],
    screen: [0.006, 0.028, 0.038],
    glow: [0.12, 0.55, 0.55],
    glow2: [0.25, 0.8, 0.35],
    lamplight: [1, 0.6, 0.4],
    night: false,
  },
  night: {
    sky: [
      [0, [0.004, 0.01, 0.04]],
      [0.24, [0.015, 0.035, 0.11]],
      [H0, [0.05, 0.11, 0.3]],
    ],
    orb: { x: 0, y: 0.15, r: 0.032, core: [1.25, 0.95, 0.42], glow: [0.5, 0.38, 0.15], near: 0.3, wide: 0.1, moon: true },
    stars: 150,
    cloud: [
      [0.12, 0.18, 0.4],
      [0.03, 0.05, 0.14],
    ],
    sea: [
      [0.012, 0.04, 0.13],
      [0.06, 0.15, 0.45],
    ],
    glitter: 0.6,
    spread: [0.035, 0.3],
    spec: [1.1, 0.68, 0.1],
    tint: [0.06, 0.08, 0.17],
    key: [0.35, 0.5, 1.1],
    lamp: 1,
    trail: [0.2, 0.42, 0.8],
    foam: [0.1, 0.5, 0.75],
    storm: [0.02, 0.055, 0.05],
    frame: [0.008, 0.005, 0.014],
    rim: [0.07, 0.012, 0.01],
    drop: [0.08, 0.22, 0.5],
    panel: [0.02, 0.005, 0.006],
    bezel: [0.045, 0.01, 0.01],
    screen: [0.03, 0.006, 0.002],
    glow: [0.6, 0.24, 0.02],
    glow2: [0.75, 0.08, 0.02],
    lamplight: [0.9, 0.06, 0.015],
    night: true,
  },
}

// Daytime colors, darkened for the time of day by tint.
const HULL: RGB = [0.36, 0.38, 0.42]
const DECK: RGB = [0.2, 0.21, 0.23]
const STRIPE: RGB = [0.85, 0.85, 0.8]
const YELLOW: RGB = [0.85, 0.66, 0.12]
const JET: RGB = [0.5, 0.53, 0.58]
const ROTOR: RGB = [0.3, 0.33, 0.36]
const FOREST: RGB = [0.1, 0.3, 0.1]
const ROCK: RGB = [0.3, 0.27, 0.22]
const WHALE: RGB = [0.16, 0.19, 0.24]
const AMBER: RGB = [2, 1.05, 0.3]
const BURNER: RGB = [2.6, 1.15, 0.35]
const VESTS: RGB[] = [
  [0.9, 0.75, 0.1],
  [0.2, 0.62, 0.25],
  [0.75, 0.15, 0.1],
  [0.15, 0.3, 0.8],
  [0.5, 0.2, 0.62],
]

// The flight deck's outline in deck space: x across (plus to starboard) and z ahead, in units of the bridge's height
// over the deck; the angled landing deck's centerline, and the two bow catapults' tracks.
const OUTLINE: Point[] = [[0.5, 2], [0.5, 7.6], [0.3, 8.5], [-0.4, 9], [-2.8, 9], [-3.5, 8.3], [-3.8, 7], [-3.8, 5.8], [-4.8, 4.8], [-4.8, 2]]
const ANGLED: readonly [Point, Point] = [[-1.3, 2], [-3.75, 7]]
const CATS = [
  { x: -1.1, z0: 6.1 },
  { x: -2.4, z0: 6.4 },
]
const PARKED: Point[] = [[-0.12, 5], [-0.12, 5.85], [-0.12, 6.7], [-0.05, 7.45]]

interface Cloud {
  x: number
  y: number
  size: number
  speed: number
  lumps: { x: number; y: number; r: number; seed: number }[]
  sprite?: Sprite
}

interface Sprite {
  w: number
  h: number
  ox: number
  oy: number
  rgba: Float32Array
}

// A layer painted once per size: premultiplied color and coverage per pixel, and the pixels it touches.
interface Layer {
  rgba: Float32Array
  idx: Int32Array
}

interface Crew {
  x: number
  z: number
  tx: number
  tz: number
  wait: number
  vest: RGB
  walks: boolean
}

interface Drop {
  x: number
  y: number
  r: number
  age: number
  slide: number
}

class WingsBridge extends Canvas {
  private time = 0
  private creatureTime = 0
  private readonly activity: Activity
  private readonly look: Look
  private readonly weather: WeatherLayer
  private readonly raining: boolean
  private orb: Orb
  private stars: Star[]
  private visibleStars: Star[] = []
  private clouds: Cloud[]
  private storm = makeStorm()
  private mesh = { X: new Float32Array(0), Z: new Float32Array(0), height: new Float32Array(0), tris: new Int32Array(0), colors: new Float32Array(0) }
  private sea = { y0: 0, y1: 0, rows: new Float64Array(0), ids: new Int32Array(0), idA: new Int32Array(0), idB: new Int32Array(0), mix: new Float32Array(0), cov: new Float32Array(0), open: new Float32Array(0), sky: new Float32Array(0) }
  private skyBuf = new Float32Array(0)
  private deckLayer: Layer = { rgba: new Float32Array(0), idx: new Int32Array(0) }
  private frameLayer: Layer = { rgba: new Float32Array(0), idx: new Int32Array(0) }
  private lamps: { x: number; y: number; color: RGB; blink: number }[] = []
  private leds: { x: number; y: number; color: RGB; rate: number; phase: number }[] = []
  private inside: Spots | undefined
  private crew: Crew[] = []
  private launch = -1
  private nextLaunch: number
  private launchCat = 0
  private landing = -1
  private nextLanding = 45
  private flyover = -1
  private flash = 0
  private egg = { wait: eggWait() * TIME_SCALE, t: -1 }
  private drops: Drop[] = []
  private wipe = { t: -1, wait: 6 }
  private pitch = 0

  constructor(settings: Settings) {
    super()
    this.supersample = 1
    this.activity = settings.activity
    this.weather = new WeatherLayer(settings.weather ?? "clear", settings.time, HORIZON)
    this.raining = settings.weather === "rain"
    const look = LOOKS[settings.time]
    this.look = this.weather.covered ? { ...look, glitter: look.glitter * 0.12 } : look
    this.orb = look.orb
    // Stars only show through the windows, so they're all put there.
    this.stars = makeStars(look.stars * 0.6, 1).map((star) => ({ ...star, y: TOP - 0.01 + star.y * (HORIZON - 0.03 - TOP) }))
    this.clouds = makeLowPolyClouds(7)
    this.nextLaunch = settings.activity === "teeming" ? 4 : 20
    const crew = settings.activity === "calm" ? 1 : settings.activity === "lively" ? 2 : 3
    for (let i = 0; i < crew; i++) {
      const [x, z] = crewSpot()
      this.crew.push({ x, z, tx: x, tz: z, wait: rand(5, 30), vest: VESTS[i % VESTS.length], walks: settings.activity !== "calm" && i < 2 })
    }
    for (let i = 0; i < 200; i++) this.drops.push({ x: Math.random(), y: rand(TOP, SILL), r: rand(0.0028, 0.006), age: rand(0, 20), slide: 0 })
  }

  step(dt: number) {
    dt = clamp(dt, 0, 0.1) * TIME_SCALE
    this.time += dt
    this.creatureTime += dt * CREATURE_SPEED
    for (const c of this.clouds) {
      c.x += c.speed * dt
      if (c.x > this.A + c.size) c.x = -c.size
    }
    if (this.gloom > 0) driftClouds(this.storm, this.A, dt)
    this.stepGloom(dt)
    this.weather.step(dt)
    const t = this.time
    this.pitch = (PITCH + STORM_PITCH * this.gloom) * (0.75 * Math.sin(t * 0.2) + 0.25 * Math.sin(t * 0.33 + 1))
    this.flash = Math.max(0, this.flash - dt * 0.6)
    this.stepCrew(dt * CREATURE_SPEED)
    this.stepFlights(dt)
    this.stepRain(dt)
    const e = this.egg
    if (e.t >= 0) e.t = e.t + dt > EGG ? -1 : e.t + dt
    if (e.t < 0) {
      e.wait -= dt
      if (e.wait <= 0) {
        e.t = 0
        e.wait = eggWait(true) * TIME_SCALE
      }
    }
  }

  // A click on the sky through the windows sends a jet down the catapult if none is launching; anywhere else it
  // flashes the deck lights.
  poke(_x: number, y: number) {
    if (y > TOP && y < HORIZON && this.launch < 0) {
      this.startLaunch()
      return
    }
    this.flash = 1
  }

  protected override visit() {
    if (this.flyover < 0) this.flyover = 0
  }

  render() {
    this.restore(this.skyBuf)
    this.drawOutside()
    composite(this.hdr, this.deckLayer)
    this.drawLamps()
    this.drawCrew()
    if (this.launch >= 0) this.drawLaunch()
    if (this.landing >= 0) this.drawLanding()
    this.weather.draw(this.hdr, this.W, this.H)
    this.drawRain()
    composite(this.hdr, this.frameLayer)
    this.drawConsole()
    this.finish()
  }

  // The bridge, the deck and the sky are painted once per size into layers; render() lays them over the moving sea in
  // the same order every frame, so the frame left after layout() matches an undisturbed render pixel for pixel.
  protected override layout() {
    const { A, look } = this
    const ox = look.night ? Math.min(A / 2 + 0.38, A - 0.2) : look.orb.y > 0.3 ? Math.min(A / 2 + 0.3, A - 0.22) : Math.max(0.15, A / 2 - 0.36)
    // The looks' skies squeezed into the window band.
    const squeeze = (v: number) => TOP - 0.03 + (v * (HORIZON - TOP + 0.03)) / H0
    this.orb = { ...look.orb, x: ox / A, y: squeeze(look.orb.y), r: look.orb.r * 0.7 }
    const sky = look.sky.map(([v, c]): [number, RGB] => [squeeze(v), c])
    this.skyBuf = this.fine(() => {
      paintSky(this.hdr, this.W, this.H, sky, this.orb, this.px)
      this.weather.cover(this.hdr, this.W, this.H)
    })
    this.orbs.length = 0
    this.orbs.push(this.orb.x * this.W, this.orb.y * this.H, this.orb.r * this.H)
    const deckColor = this.fine(() => this.drawDeck(false))
    const deckCover = this.fine(() => this.drawDeck(true))
    this.deckLayer = layer(deckColor, deckCover)
    const frameColor = this.fine(() => this.drawFrame(false))
    const frameCover = this.fine(() => this.drawFrame(true))
    this.frameLayer = layer(frameColor, frameCover)
    this.placeLamps()
    this.placeConsole()
    this.buildSea()
    const { W, H } = this
    this.visibleStars = this.stars.filter((s) => {
      const i = Math.floor(s.y * H) * W + Math.floor(s.x * W)
      return frameCover[i * 3] <= 0 && deckCover[i * 3] <= 0
    })
    for (const c of this.clouds) c.sprite = cloudSprite(c, H, this.weather.scud ?? look.cloud, this.orb.x * A - c.x)
    // The still frame, drawn as render() draws it with nothing moving.
    this.hdr.set(this.skyBuf)
    this.drawOutside(true)
    composite(this.hdr, this.deckLayer)
    composite(this.hdr, this.frameLayer)
  }

  // Paints with draw() at twice the size and returns it box-filtered to the real size, for anti-aliased layers.
  private fine(draw: () => void) {
    const { W, H, hdr } = this
    const S = W * H * 4 <= 600_000 ? 2 : 1
    this.W = W * S
    this.H = H * S
    this.px = S
    this.hdr = new Float32Array(this.W * this.H * 3)
    draw()
    const big = this.hdr
    this.W = W
    this.H = H
    this.px = 1
    this.hdr = hdr
    return S > 1 ? shrink2(big, W, H) : big
  }

  private paint(c: RGB, k = 1): RGB {
    const t = this.look.tint
    return [c[0] * t[0] * k, c[1] * t[1] * k, c[2] * t[2] * k]
  }

  // Deck space to screen pixels: x across, z ahead, h up off the deck.
  private P(x: number, z: number, h = 0): Point {
    const H = this.H
    return [(this.A / 2 + VANISH + (F * (x - CAMX)) / z) * H, (HORIZON + (F * (1 - h)) / z) * H]
  }

  // Everything beyond the glass that moves: stars, clouds and the storm, the sea and islands pitching on the swell,
  // the flyover and the whale. still draws the sea and islands at rest, for layout().
  private drawOutside(still = false) {
    const { W, H, look } = this
    const dy = still ? 0 : this.pitch
    if (!still) {
      if (!this.weather.covered && look.stars) paintStars(this.hdr, W, H, this.visibleStars, this.time, 1, look.night ? 0.6 : 0.25, this.points)
      this.drawClouds()
      paintStorm(this.hdr, W, H, this.storm, look.cloud[0], look.cloud[1], this.gloom)
    }
    this.drawSea(dy)
    this.drawIslands(dy)
    if (this.activity === "teeming") this.drawEscorts(dy)
    if (still) return
    if (this.flyover >= 0) this.drawFlyover()
    if (this.egg.t >= 0) this.drawWhale(dy)
  }

  // ---- The sea, as in Wings: rows of jittered vertices sliding toward the viewer, stitched into facets.

  private buildSea() {
    const { W, H } = this
    const rows = [0]
    while (rows[rows.length - 1] < (SILL + 0.05 - HORIZON) / WS) rows.push(rows[rows.length - 1] + rowHeight(rows[rows.length - 1]))
    const y0 = Math.floor((HORIZON - PITCH - STORM_PITCH) * H) - 1
    const y1 = Math.min(H, Math.ceil((SILL + 0.01) * H))
    const n = W * (y1 - y0)
    // What the sea mirrors: the sky's average color on each row above the horizon.
    const sky = new Float32Array(H * 3)
    for (let y = 0; y < Math.ceil(HORIZON * H); y++)
      for (let x = 0; x < W; x += 2) for (let c = 0; c < 3; c++) sky[y * 3 + c] += this.skyBuf[(y * W + x) * 3 + c] / Math.ceil(W / 2)
    // The sea shows wherever neither the deck nor the bridge covers it completely.
    const open = new Float32Array(n)
    const d = this.deckLayer.rgba
    const f = this.frameLayer.rgba
    for (let i = 0; i < n; i++) {
      const p = (y0 * W + i) * 4
      open[i] = d[p + 3] >= 0.999 || f[p + 3] >= 0.999 ? 0 : 1
    }
    this.sea = { y0, y1, rows: Float64Array.from(rows), ids: new Int32Array(n * 4), idA: new Int32Array(n), idB: new Int32Array(n), mix: new Float32Array(n), cov: new Float32Array(n), open, sky }
  }

  private drawSea(dy: number) {
    const { W, H, A, look } = this
    const sea = this.sea
    const m = this.mesh
    const phase = this.time * ROW_RATE
    const base = Math.floor(phase)
    const f = phase - base
    const table = sea.rows
    const xs: number[] = []
    const ys: number[] = []
    const ds: number[] = []
    const ids: number[] = []
    const rows: number[][] = []
    for (let r = 0; r + 1 < table.length; r++) {
      const d = table[r] + (table[r + 1] - table[r]) * f
      const q = r - base
      const h = rowHeight(d)
      const w = Math.max(0.03, h * 2.3)
      const row: number[] = []
      const i0 = Math.floor((-0.25 - A / 2 / WS) / w)
      const i1 = Math.ceil((A / 2 / WS + 0.25) / w)
      for (let i = i0; i <= i1; i++) {
        row.push(xs.length)
        xs.push((i + (hash2(i, q) - 0.5) * 0.7) * w)
        ys.push(d + (hash2(i + 71, q) - 0.5) * 0.3 * h)
        ds.push(d)
        ids.push(i * 7919 + q * 104729)
      }
      rows.push(row)
    }
    const tris: number[] = []
    for (let k = 0; k + 1 < rows.length; k++) stitch(rows[k], rows[k + 1], xs, tris)
    const n = xs.length
    if (m.X.length < n) {
      m.X = new Float32Array(n * 2)
      m.Z = new Float32Array(n * 2)
      m.height = new Float32Array(n * 2)
    }
    const t = this.time
    for (let i = 0; i < n; i++) {
      const z = (FOCAL * CAMERA) / Math.max(0.002, ys[i])
      m.Z[i] = z
      m.X[i] = (xs[i] * z) / FOCAL
      const amp = Math.max(0.03, rowHeight(ds[i]) * 2.3) * 0.45 * smoothstep(0.004, 0.08, ds[i])
      const id = ids[i]
      m.height[i] = amp * ((hash(id) - 0.5) * 1.6 + 0.25 * Math.sin(t * (0.4 + hash(id + 0.5) * 0.5) + hash(id + 0.3) * TAU))
    }
    m.tris = Int32Array.from(tris)
    if (m.colors.length < tris.length) m.colors = new Float32Array(tris.length * 2)
    const SW = W * 2
    const SH = (sea.y1 - sea.y0) * 2
    const top = (HORIZON + dy) * H - sea.y0
    const mid = (A / 2) * H
    const k2 = WS * H * 2
    sea.ids.fill(-1)
    for (let k = 0; k < tris.length; k += 3) {
      const a = tris[k]
      const b = tris[k + 1]
      const c = tris[k + 2]
      rasterTri(sea.ids, SW, SH, mid * 2 + xs[a] * k2, top * 2 + ys[a] * k2, mid * 2 + xs[b] * k2, top * 2 + ys[b] * k2, mid * 2 + xs[c] * k2, top * 2 + ys[c] * k2, k / 3)
    }
    resolveSamples(sea.ids, W, sea.y1 - sea.y0, sea.idA, sea.idB, sea.mix, sea.cov)
    shadeFacets(m.X, m.Z, m.height, m.tris, m.colors, sea.sky, H, (this.orb.x * A - A / 2) / WS, (this.orb.y - HORIZON) / WS, look.sea[0], look.sea[1], look.spec, look.glitter * (1 - 0.8 * this.gloom), look.spread, look.storm, smoothstep(0, 1, this.gloom) * 0.7)
    fillSea(this.hdr, W, sea.y0, sea.idA, sea.idB, sea.mix, sea.cov, sea.open, m.colors)
    this.touch(0, sea.y0, W - 1, sea.y1 - 1)
  }

  // ---- The horizon: a volcano on its forested island to port, forested islets and sea stacks, escorts at teeming.

  private drawIslands(dy: number) {
    const { A, H } = this
    // Drawn in Wings' units about each island's own middle, then scaled down by WS.
    let anchor = 0
    const P = (x: number, y: number): Point => [(anchor + (x - anchor) * WS) * H, (HORIZON + (y - H0) * WS + dy) * H]
    const vx = volcanoX(A)
    anchor = vx
    const base = H0 + 0.004
    const lightSide = this.orb.x * A < vx ? -1 : 1
    const hill: Point[] = [P(vx - 0.27, base), P(vx - 0.2, base - 0.02), P(vx - 0.1, base - 0.035), P(vx + 0.12, base - 0.035), P(vx + 0.22, base - 0.018), P(vx + 0.29, base)]
    this.polygon(hill, this.facet(FOREST, 0.4))
    const peak = P(vx - 0.01, H0 - 0.17)
    const feet = [-0.17, -0.1, -0.03, 0.05, 0.12, 0.18].map((dx) => P(vx + dx, base - 0.025))
    this.polygon([peak, ...feet], this.facet(ROCK, 0.5))
    for (let i = 0; i + 1 < feet.length; i++) {
      const face = (i + 0.5) / (feet.length - 1) - 0.5
      this.polygon([peak, feet[i], feet[i + 1]], this.facet(ROCK, 0.5 + face * lightSide * 0.9))
    }
    const slope = (dx: number) => base - 0.025 - (1 - Math.abs(dx + 0.01) / 0.175) * 0.17
    const forest: Point[] = [P(vx - 0.2, base)]
    for (let i = 0; i <= 24; i++) {
      const dx = -0.19 + (i / 24) * 0.39
      const top = Math.max(slope(dx) + 0.045, base - 0.075) - (i % 2 ? 0.006 : 0) - hash(i * 2.1) * 0.006
      forest.push(P(vx + dx, Math.min(top, base - 0.02)))
    }
    forest.push(P(vx + 0.21, base))
    this.polygon(forest, this.facet(FOREST, 0.5 - lightSide * 0.1))
    for (let i = 0; i < 18; i++) {
      const dx = -0.22 + (i / 17) * 0.47
      const top = Math.max(slope(dx) + 0.05, base - 0.06) + hash(i * 5.3) * 0.02
      if (top > base - 0.012) continue
      const s = 0.012 + hash(i * 1.9) * 0.008
      this.polygon([P(vx + dx, top), P(vx + dx - s * 0.7, top + s * 1.4), P(vx + dx + s * 0.7, top + s * 1.4)], this.facet(FOREST, hash(i) > 0.5 ? 0.75 : 0.3))
    }
    this.polygon([P(vx - 0.022, H0 - 0.155), P(vx - 0.01, H0 - 0.17), P(vx + 0.004, H0 - 0.157), P(vx - 0.01, H0 - 0.15)], this.facet(ROCK, 0.15))
    // Two forested islets on the starboard bow.
    const right = Math.min(A / 2 + 0.62, A - 0.2)
    for (const [x, w, h] of [[right, 0.08, 0.045], [right + 0.1, 0.09, 0.05]] as const) {
      anchor = x
      const pts = [P(x - w, base), P(x - w * 0.55, base - h * 0.55), P(x - w * 0.15, base - h), P(x + w * 0.2, base - h * 0.85), P(x + w * 0.6, base - h * 0.4), P(x + w, base)]
      this.polygon(pts, this.facet(FOREST, 0.5))
      for (let i = 0; i + 1 < pts.length; i++) this.polygon([P(x, base), pts[i], pts[i + 1]], this.facet(FOREST, 0.55 - ((i - 2) / 3) * lightSide * 0.5))
      for (let i = 0; i < 7; i++) {
        const dx = (i / 6 - 0.5) * w * 1.4
        const top = base - h * (1 - Math.abs(dx) / w) * 0.95
        this.polygon([P(x + dx, top - 0.01), P(x + dx - 0.009, top + 0.008), P(x + dx + 0.009, top + 0.008)], this.facet(FOREST, hash(i + x) > 0.5 ? 0.7 : 0.35))
      }
    }
    // Sea stacks beyond the volcano, where there's room.
    const rx = vx - 0.3
    anchor = rx
    if (rx > 0.06)
      for (const [dx, w, h] of [[-0.03, 0.012, 0.035], [-0.012, 0.009, 0.05], [0.004, 0.011, 0.042], [0.03, 0.008, 0.028]] as const)
        this.polygon([P(rx + dx - w, base), P(rx + dx - w * 0.6, base - h), P(rx + dx + w * 0.3, base - h * 1.05), P(rx + dx + w, base)], this.facet(ROCK, 0.45 + lightSide * dx * 8))
    for (const [x, w] of [[vx + 0.22, 0.022], [vx + 0.27, 0.014]] as const) (anchor = x), this.polygon([P(x - w, base), P(x, base - 0.011), P(x + w, base)], this.facet(ROCK, 0.3))
  }

  private facet(c: RGB, lit: number): RGB {
    const { look } = this
    const k = clamp(lit, 0, 1)
    if (!look.night && look.tint[0] === 1) return [c[0] * (0.45 + 0.75 * k), c[1] * (0.45 + 0.75 * k), c[2] * (0.45 + 0.75 * k)]
    const t = look.tint
    return [c[0] * t[0] * 2.4 + look.key[0] * 0.08 * k, c[1] * t[1] * 2.4 + look.key[1] * 0.08 * k, c[2] * t[2] * 2.4 + look.key[2] * 0.08 * k]
  }

  private drawEscorts(dy: number) {
    const { A, H } = this
    const hull = this.paint(HULL)
    for (const [x, s] of [[A / 2 + 0.1, 0.018], [A / 2 + 0.42, 0.024]] as const) {
      const y = HORIZON + 0.003 + dy
      this.polygon([[(x - s) * H, (y - s * 0.12) * H], [(x + s) * H, (y - s * 0.12) * H], [(x + s * 0.85) * H, y * H], [(x - s * 0.8) * H, y * H]], hull)
      this.polygon([[(x - s * 0.25) * H, (y - s * 0.12) * H], [(x - s * 0.2) * H, (y - s * 0.4) * H], [(x + s * 0.15) * H, (y - s * 0.4) * H], [(x + s * 0.25) * H, (y - s * 0.12) * H]], hull)
      this.polygon([[(x - s * 0.02) * H, (y - s * 0.4) * H], [(x - s * 0.01) * H, (y - s * 0.7) * H], [(x + s * 0.01) * H, (y - s * 0.7) * H], [(x + s * 0.02) * H, (y - s * 0.4) * H]], hull)
    }
  }

  private drawClouds() {
    const { W, H, hdr } = this
    for (const c of this.clouds) {
      const s = c.sprite
      if (!s) continue
      const x = c.x * H - s.ox
      const y = c.y * H - s.oy
      blitSprite(hdr, W, H, s, x, y)
      this.touch(x - 1, y - 1, x + s.w + 1, y + s.h + 1)
    }
  }

  // ---- The ship: the flight deck, the hull's starboard flank below it, markings, parked aircraft.

  private drawDeck(mask: boolean) {
    const P = (x: number, z: number, h = 0) => this.P(x, z, h)
    const c = (color: RGB, k = 1): RGB => (mask ? [1, 1, 1] : this.paint(color, k))
    // The hull's flank below the starboard deck edge, down to the waterline, with a band of foam along it.
    const flank: Point[] = [P(0.5, 2), P(0.5, 7.6), P(0.3, 8.5), P(0.18, 8.4, -1), P(0.42, 7.4, -1), P(0.42, 2, -1)]
    this.polygon(flank, c(HULL, 0.55))
    if (!mask) {
      const foam = this.look.night ? ([this.look.foam[0] * 0.3, this.look.foam[1] * 0.3, this.look.foam[2] * 0.3] as RGB) : this.look.foam
      this.polygon([P(0.18, 8.4, -1), P(0.42, 7.4, -1), P(0.42, 2, -1), P(0.62, 2, -1.02), P(0.62, 7.4, -1.02), P(0.36, 8.5, -1.02)], foam, 0.35)
    }
    this.polygon(OUTLINE.map(([x, z]) => P(x, z)), c(HULL, 0.6))
    this.polygon(OUTLINE.map(([x, z]) => P(x * 0.985 - 0.03, z - 0.04, 0.001)), c(DECK))
    if (mask) {
      this.drawParked(true)
      return
    }
    const line = (x0: number, z0: number, x1: number, z1: number, w: number, color: RGB, k = 1) => {
      const len = Math.hypot(x1 - x0, z1 - z0)
      const nx = ((z1 - z0) / len) * w
      const nz = (-(x1 - x0) / len) * w
      this.polygon([P(x0 - nx, z0 - nz), P(x0 + nx, z0 + nz), P(x1 + nx, z1 + nz), P(x1 - nx, z1 - nz)], c(color, k))
    }
    // Panel seams across the deck, faint.
    for (let z = 3; z < 9; z += 0.9) line(-3.7, z, 0.4, z, 0.008, DECK, 0.75)
    // The angled landing deck: a dashed centerline, edge lines, a foul line and the arresting wires.
    const [[ax, az], [bx, bz]] = ANGLED
    const len = Math.hypot(bx - ax, bz - az)
    const ux = (bx - ax) / len
    const uz = (bz - az) / len
    for (let s = 0.2; s < len - 0.2; s += 0.45) line(ax + ux * s, az + uz * s, ax + ux * (s + 0.25), az + uz * (s + 0.25), 0.03, STRIPE, 0.8)
    for (const side of [-1, 1]) {
      const ox = uz * 0.75 * side
      const oz = -ux * 0.75 * side
      line(ax + ox, az + oz, ax + ux * (len - 0.4) + ox, az + uz * (len - 0.4) + oz, 0.02, STRIPE, 0.7)
    }
    for (let s = 0.9; s < 2.1; s += 0.4) line(ax + ux * s - uz * 0.7, az + uz * s + ux * 0.7, ax + ux * s + uz * 0.7, az + uz * s - ux * 0.7, 0.008, [0.08, 0.08, 0.08])
    // The bow catapults: tracks, yellow lineup lines and the lowered blast deflectors.
    for (const cat of CATS) {
      line(cat.x, cat.z0 - 0.1, cat.x, 8.95, 0.018, [0.06, 0.06, 0.07])
      line(cat.x + 0.12, cat.z0 + 0.3, cat.x + 0.12, 8.6, 0.01, YELLOW, 0.8)
      this.polygon([P(cat.x - 0.5, cat.z0 - 0.75), P(cat.x + 0.5, cat.z0 - 0.75), P(cat.x + 0.5, cat.z0 - 0.5), P(cat.x - 0.5, cat.z0 - 0.5)], c(HULL, 0.5))
    }
    // Taxi lines curving from the landing deck to the catapults, and an elevator outline by the edge.
    for (let i = 0; i < 12; i++) {
      const t0 = i / 12
      const t1 = (i + 1) / 12
      const [x0, z0] = taxiPath(t0, CATS[0])
      const [x1, z1] = taxiPath(t1, CATS[0])
      line(x0, z0, x1, z1, 0.012, YELLOW, 0.85)
    }
    for (const [x0, z0, x1, z1] of [[-0.6, 3.9, 0.45, 3.9], [-0.6, 4.75, 0.45, 4.75], [-0.6, 3.9, -0.6, 4.75]] as const) line(x0, z0, x1, z1, 0.012, STRIPE, 0.45)
    // A white bow line and edge lines down both sides.
    line(-2.7, 8.9, -0.5, 8.9, 0.015, STRIPE, 0.6)
    line(0.4, 4, 0.4, 7.5, 0.012, STRIPE, 0.55)
    this.drawParked(false)
    // At night the deck's floodlights leave soft amber pools.
    if (this.look.night)
      for (const [x, z] of [[-1.2, 4.6], [-2.2, 6.6], [-0.6, 7.6], [-1.6, 8.4]] as const) {
        const [px, py] = P(x, z)
        poolOn(this.hdr, this.W, this.H, px, py, (2.2 / z) * this.H * 0.35 * WS, (0.9 / z) * this.H * 0.35 * WS, [1, 0.55, 0.2], 2.6)
      }
  }

  // Jets parked along the starboard edge with their wings folded, a deck tractor, and a helicopter by the island.
  private drawParked(mask: boolean) {
    const tone = (c: RGB, k = 1): RGB => (mask ? [1, 1, 1] : this.paint(c, k))
    for (const [x, z] of PARKED) {
      if (!mask) {
        const [sx, sy] = this.P(x - 0.15, z + 0.05)
        const w = (F * 0.55 * this.H) / z
        this.ellipse(sx, sy, w * 0.6, w * 0.08, 0, 0, 0, 0.35)
      }
      this.aircraft(x, z, 0.06, -Math.PI / 2 + 0.4, 0.85, FOLDED, tone(JET), tone(JET, 0.7), mask, true)
    }
    this.box(-1.75, 5.3, 0.2, 0.12, 0.07, 0.5, tone(YELLOW, 0.8), mask)
    this.box(-1.78, 5.29, 0.07, 0.1, 0.12, 0.5, tone(YELLOW, 0.6), mask)
    this.helicopter(-0.1, 4.4, mask)
  }

  // A deck box (a tractor's body) of size w x d x h, turned by angle, its top and the faces toward the bridge drawn.
  private box(x: number, z: number, w: number, d: number, h: number, angle: number, color: RGB, mask: boolean) {
    const ca = Math.cos(angle)
    const sa = Math.sin(angle)
    const corner = (u: number, v: number, k: number) => this.P(x + u * ca + v * sa, z - u * sa + v * ca, k)
    const pts = [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]] as const
    const shade = (k: number): RGB => (mask ? [1, 1, 1] : [color[0] * k, color[1] * k, color[2] * k])
    for (let i = 0; i < 4; i++) {
      const [u0, v0] = pts[i]
      const [u1, v1] = pts[(i + 1) % 4]
      this.polygon([corner(u0, v0, 0), corner(u1, v1, 0), corner(u1, v1, h), corner(u0, v0, h)], shade(i % 2 ? 0.55 : 0.75))
    }
    this.polygon(pts.map(([u, v]) => corner(u, v, h)), shade(1))
  }

  private helicopter(x: number, z: number, mask: boolean) {
    const tone = (c: RGB, k = 1): RGB => (mask ? [1, 1, 1] : this.paint(c, k))
    const at = (a: number, b: number, h: number) => this.P(x + b, z + a, h)
    // Nose ahead: a cabin, a tail boom with its fin, and four drooping blades at rest.
    if (!mask) this.ellipse(...this.P(x, z), (F * 0.32 * this.H) / z, (F * 0.04 * this.H) / z, 0, 0, 0, 0.35)
    this.polygon([at(0.35, -0.12, 0), at(0.35, 0.12, 0), at(-0.25, 0.12, 0), at(-0.25, -0.12, 0), at(-0.25, -0.12, 0.2), at(0.3, -0.12, 0.2)], tone(ROTOR, 0.7))
    this.polygon([at(0.38, -0.1, 0.17), at(0.38, 0.1, 0.17), at(0.25, 0.12, 0.24), at(-0.25, 0.12, 0.24), at(-0.25, -0.12, 0.24), at(0.25, -0.12, 0.24)], tone(ROTOR))
    this.polygon([at(-0.25, -0.04, 0.12), at(-0.25, 0.04, 0.12), at(-0.85, 0.02, 0.17), at(-0.85, -0.02, 0.17)], tone(ROTOR, 0.85))
    this.polygon([at(-0.8, -0.01, 0.15), at(-0.9, -0.01, 0.15), at(-0.95, -0.01, 0.38), at(-0.88, -0.01, 0.38)], tone(ROTOR, 0.6))
    for (let i = 0; i < 4; i++) {
      const a = 0.4 + (i * TAU) / 4
      const ca = Math.cos(a)
      const sa = Math.sin(a)
      this.polygon([at(0, 0, 0.28), at(ca * 0.7 - sa * 0.03, sa * 0.7 + ca * 0.03, 0.25), at(ca * 0.7 + sa * 0.03, sa * 0.7 - ca * 0.03, 0.25)], tone(ROTOR, 0.5))
    }
  }

  // An aircraft in deck space at (x, z), h up, nose along heading (0 ahead, plus toward starboard), length L, from a
  // top-down form, with its twin tails standing up; folded adds the wing panels folded up at the hinges.
  private aircraft(x: number, z: number, h: number, heading: number, L: number, form: readonly (readonly Point[])[], color: RGB, fin: RGB, mask = false, folded = false, alpha = 1) {
    const fx = Math.sin(heading)
    const fz = Math.cos(heading)
    const at = (a: number, b: number, up = 0) => this.P(x + L * (a * fx + b * fz), z + L * (a * fz - b * fx), h + L * up)
    for (const poly of form) this.polygon(poly.map(([a, b]) => at(a, b)), color, alpha)
    if (!mask) this.polygon([at(0.32, -0.025, 0.04), at(0.32, 0.025, 0.04), at(0.12, 0.04, 0.06), at(0.12, -0.04, 0.06)], [fin[0] * 0.5, fin[1] * 0.55, fin[2] * 0.7], alpha)
    for (const side of [-1, 1]) {
      this.polygon([at(-0.5, side * 0.07, 0.02), at(-0.28, side * 0.07, 0.02), at(-0.42, side * 0.12, 0.3), at(-0.5, side * 0.13, 0.3)], fin, alpha)
      if (folded) this.polygon([at(0.02, side * 0.24), at(-0.16, side * 0.24), at(-0.14, side * 0.23, 0.18), at(0.0, side * 0.23, 0.18)], fin, alpha)
    }
  }

  // ---- Lights.

  private placeLamps() {
    this.lamps = []
    const lamp = (x: number, z: number, color: RGB, blink = 0) => {
      const [px, py] = this.P(x, z)
      if (py < SILL * this.H - 1) this.lamps.push({ x: px, y: py, color, blink })
    }
    // Along the deck edges from the island to the bow, then the angled deck's centerline.
    for (let i = 0; i + 1 < OUTLINE.length; i++) {
      const [x0, z0] = OUTLINE[i]
      const [x1, z1] = OUTLINE[i + 1]
      const n = Math.max(1, Math.round(Math.hypot(x1 - x0, z1 - z0) / 0.7))
      for (let k = 0; k < n; k++) {
        const z = lerp(z0, z1, k / n)
        if (z > 3.4) lamp(lerp(x0, x1, k / n) * 0.985 - 0.03, z - 0.04, AMBER)
      }
    }
    const [[ax, az], [bx, bz]] = ANGLED
    for (let s = 0.1; s < 0.95; s += 0.09) lamp(lerp(ax, bx, s), lerp(az, bz, s), [1.6, 1.2, 0.5])
    lamp(-2.8, 9, AMBER, 0.5)
    lamp(-0.4, 9, AMBER, 0.6)
    lamp(CATS[0].x, 8.95, [0.3, 1.6, 0.5], 0.35)
  }

  private drawLamps() {
    const { look } = this
    const t = this.time
    const flicker = this.gloom > 0.3 && hash(Math.floor(t * 2)) > 0.85 ? 0.5 : 1
    for (const [i, l] of this.lamps.entries()) {
      // By day only the blinking ones show, unless a click flashes the lot.
      const base = l.blink ? 0.3 + 0.7 * smoothstep(0.3, 0.9, Math.sin(t * l.blink + i)) : look.lamp < 0.5 ? 0 : 1
      const k = (look.lamp * base * flicker + this.flash * 0.8) * (look.night ? 0.7 : 0.5)
      if (k <= 0.01) continue
      this.point(l.x, l.y, l.color[0] * k, l.color[1] * k, l.color[2] * k, l.blink ? 2 : 1)
    }
  }

  // ---- The crew: tiny figures in colored vests, walking slowly between spots now and then.

  private stepCrew(dt: number) {
    for (const c of this.crew) {
      if (!c.walks) continue
      const dx = c.tx - c.x
      const dz = c.tz - c.z
      const d = Math.hypot(dx, dz)
      if (d > 0.01) {
        const s = Math.min(d, 0.35 * dt)
        c.x += (dx / d) * s
        c.z += (dz / d) * s
        continue
      }
      c.wait -= dt
      if (c.wait > 0) continue
      ;[c.tx, c.tz] = crewSpot()
      c.wait = rand(6, 18)
    }
  }

  private drawCrew() {
    const { H, look } = this
    for (const [i, c] of this.crew.entries()) {
      const [x, y] = this.P(c.x, c.z)
      const s = (F * H) / c.z
      const w = Math.max(this.cells ? 1.6 : 0.8, s * 0.05)
      const legs = this.paint([0.12, 0.12, 0.14], look.night ? 2.5 : 1)
      const vest = this.paint(c.vest, look.night ? 3 : 1)
      this.polygon([[x - w * 0.4, y], [x + w * 0.4, y], [x + w * 0.4, y - s * 0.05], [x - w * 0.4, y - s * 0.05]], legs)
      this.polygon([[x - w * 0.5, y - s * 0.05], [x + w * 0.5, y - s * 0.05], [x + w * 0.45, y - s * 0.095], [x - w * 0.45, y - s * 0.095]], vest)
      this.disc(x, y - s * 0.11, w * 0.4, vest[0], vest[1], vest[2], 1)
      // At night each carries a lit wand.
      if (look.night) this.splat(x + w * 0.7, y - s * 0.08, 0.9, 0.45 + 0.2 * (i % 2), 0.1)
    }
  }

  // ---- Launches and recoveries.

  private stepFlights(dt: number) {
    if (this.launch >= 0) this.launch = this.launch + dt > LAUNCH ? -1 : this.launch + dt
    if (this.landing >= 0) this.landing = this.landing + dt > LANDING ? -1 : this.landing + dt
    if (this.flyover >= 0) this.flyover = this.flyover + dt > FLYOVER ? -1 : this.flyover + dt
    if (this.activity === "calm") return
    this.nextLaunch -= dt
    if (this.nextLaunch <= 0 && this.launch < 0) {
      this.startLaunch()
      this.nextLaunch = this.activity === "teeming" ? rand(30, 45) : rand(55, 85)
    }
    if (this.activity !== "teeming") return
    this.nextLanding -= dt
    if (this.nextLanding <= 0 && this.landing < 0 && (this.launch < 0 || this.launch > 15)) {
      this.landing = 0
      this.nextLanding = rand(70, 110)
    }
  }

  private startLaunch() {
    this.launch = 0
    this.launchCat = 0
  }

  // A launch: the jet taxis from the landing deck to the catapult, the blast deflector rises behind it, it spools up
  // with steam drifting off the track, then the catapult flings it off the bow and it climbs away, banking.
  private drawLaunch() {
    const t = this.launch
    const cat = CATS[this.launchCat]
    const deflector = smoothstep(6.5, 8.5, t) * (1 - smoothstep(15, 17, t))
    if (deflector > 0) {
      const a = deflector * 1.05
      const hz = cat.z0 - 0.5
      const P = (x: number, z: number, h: number) => this.P(x, z, h)
      const back = hz - 0.25 * Math.cos(a)
      const up = 0.25 * Math.sin(a)
      this.polygon([P(cat.x - 0.5, hz, 0), P(cat.x + 0.5, hz, 0), P(cat.x + 0.5, back, up), P(cat.x - 0.5, back, up)], this.paint(HULL, 0.85))
    }
    let x: number
    let z: number
    let h = 0.06
    let heading = 0
    let burn = 0.15
    let alpha = 1
    if (t < 7) {
      const u = smoothstep(0, 7, t)
      ;[x, z] = taxiPath(u, cat)
      const [nx, nz] = taxiPath(Math.min(1, u + 0.02), cat)
      heading = u < 0.98 ? Math.atan2(nx - x, nz - z) : 0
    } else if (t < 12.5) {
      x = cat.x
      z = cat.z0
      burn = 0.15 + 0.85 * smoothstep(8, 11, t)
    } else if (t < 14) {
      x = cat.x
      z = cat.z0 + (9.1 - cat.z0) * ((t - 12.5) / 1.5) ** 2
      burn = 1
    } else {
      const c = t - 14
      x = cat.x - c * c * 0.12
      z = 9.1 + 4 * c + 0.6 * c * c
      h = 0.06 + 0.12 * c * c
      heading = -Math.min(0.5, c * c * 0.02)
      burn = 1
      alpha = 1 - smoothstep(8, 10, c)
    }
    this.drawSteam(cat)
    if (alpha <= 0) return
    this.jet(x, z, h, heading, burn, alpha)
  }

  // Steam: wisps off the catapult track while the jet waits, a cloud along it after the shot, drifting and thinning.
  private drawSteam(cat: { x: number; z0: number }) {
    const t = this.launch
    const { look } = this
    const color: RGB = look.night ? [0.08, 0.16, 0.32] : look.tint[0] < 1 ? [0.75, 0.5, 0.55] : [0.82, 0.85, 0.88]
    for (let i = 0; i < 7; i++) {
      const z = cat.z0 + 0.3 + i * 0.4
      const born = i < 2 ? 9 + i : 12.6 + i * 0.2
      const age = t - born
      if (age < 0 || age > 6) continue
      const k = smoothstep(0, 0.6, age) * (1 - smoothstep(2, 6, age)) * (i < 2 ? 0.25 : 0.4)
      const [px, py] = this.P(cat.x + age * 0.06, z, 0.05 + age * 0.06)
      const r = ((0.12 + age * 0.06) * F * this.H) / z
      this.ellipse(px, py, r, r * 0.6, color[0], color[1], color[2], k)
    }
  }

  // A recovery: a jet comes in head-on over the bow down the angled deck, its landing light on, catches a wire and
  // stops short, waits, then taxis off toward the island and out of view under the console.
  private drawLanding() {
    const t = this.landing
    const [[ax, az], [bx, bz]] = ANGLED
    const along = (z: number) => ax + ((bx - ax) * (z - az)) / (bz - az)
    const toward = Math.atan2(ax - bx, az - bz)
    let x: number
    let z: number
    let h = 0.06
    let heading = toward
    let burn = 0.35
    let light = 1
    if (t < 12) {
      z = lerp(70, 6.6, smoothstep(0, 12, t) * 0.3 + (t / 12) * 0.7)
      x = along(z)
      h = 0.06 + (z - 6.6) * 0.085
    } else if (t < 13.5) {
      const u = (t - 12) / 1.5
      z = 6.6 - 1.7 * (1 - (1 - u) ** 3)
      x = along(z)
    } else if (t < 19) {
      z = 4.9
      x = along(z)
      burn = 0.15
      light = 0.6
    } else {
      const u = smoothstep(19, LANDING, t)
      const p0: Point = [along(4.9), 4.9]
      const p1: Point = [-1.6, 3.9]
      const p2: Point = [-0.8, 2.4]
      ;[x, z] = bezier(p0, p1, p2, u)
      const [nx, nz] = bezier(p0, p1, p2, Math.min(1, u + 0.02))
      heading = Math.atan2(nx - x, nz - z)
      burn = 0.15
      light = 0.6 * (1 - u)
    }
    const alpha = smoothstep(0, 1.5, t)
    this.jet(x, z, h, heading, burn, alpha, light)
  }

  // A jet in deck space with its afterburners glowing by burn and, coming in, a landing light.
  private jet(x: number, z: number, h: number, heading: number, burn: number, alpha: number, light = 0) {
    const { look, H } = this
    if (z < 2.2) return
    const L = 0.85
    const s = (F * L * H) / z
    const body = this.craft(JET)
    const fin = this.craft([JET[0] * 0.7, JET[1] * 0.7, JET[2] * 0.75])
    if (s < 2) {
      const [px, py] = this.P(x, z, h)
      this.splat(px, py, body[0] * alpha, body[1] * alpha, body[2] * alpha)
      if (burn > 0.5) this.splat(px, py, BURNER[0] * 0.3 * alpha, BURNER[1] * 0.3 * alpha, BURNER[2] * 0.3 * alpha)
      return
    }
    // Its shadow on the deck while it's low over it.
    if (h < 0.5 && z < 9.2) {
      const [sx, sy] = this.P(x, z)
      this.ellipse(sx, sy, s * 0.45, s * 0.07, 0, 0, 0, 0.3 * alpha * (1 - h * 2))
    }
    this.aircraft(x, z, h, heading, L, JETFORM, body, fin, false, false, alpha)
    const fx = Math.sin(heading)
    const fz = Math.cos(heading)
    const k = (0.3 + burn * 1.3) * alpha
    for (const side of [-1, 1]) {
      const [bx, by] = this.P(x + L * (-0.52 * fx + side * 0.04 * fz), z + L * (-0.52 * fz - side * 0.04 * fx), h + L * 0.03)
      if (fz > -0.3) this.disc(bx, by, Math.max(1, 0.06 * s), BURNER[0] * 0.3 * k, BURNER[1] * 0.3 * k, BURNER[2] * 0.3 * k, 0.6)
      if (fz > -0.3) this.disc(bx, by, Math.max(0.7, 0.025 * s), BURNER[0] * k, BURNER[1] * k, BURNER[2] * k, 1)
    }
    if (light > 0) {
      const [lx, ly] = this.P(x + L * 0.35 * fx, z + L * 0.35 * fz, h - 0.02)
      const b = light * alpha * (look.night ? 1 : 0.5)
      this.disc(lx, ly, Math.max(1, 0.03 * s), AMBER[0] * b, AMBER[1] * b, AMBER[2] * b, 1)
    }
  }

  private craft(c: RGB): RGB {
    return this.paint(c, this.look.night ? 3.2 : 1)
  }

  // When the agent finishes: a vee of five jets crosses ahead of the bow, trailing contrails.
  private drawFlyover() {
    const { look, H } = this
    const t = this.flyover
    const lead = lerp(-26, 30, t / FLYOVER)
    const fade = 1 - smoothstep(FLYOVER - 2, FLYOVER, t)
    for (let i = 0; i < 5; i++) {
      const rank = Math.ceil(i / 2)
      const side = i % 2 ? -1 : 1
      const x = lead - rank * 1.6
      const z = 16 + side * rank * 1.1
      const [hx, hy] = this.P(x - 0.5, z, 3)
      const [tx, ty] = this.P(x - 0.5 - Math.min(10, t * 2), z, 3)
      trail(this.hdr, this.W, H, hx, hy, tx, ty, Math.max(1, 0.003 * H), look.trail, 0.35 * fade)
      this.touch(Math.min(hx, tx) - 3, hy - 3, Math.max(hx, tx) + 3, hy + 3)
      this.aircraft(x, z, 3, Math.PI / 2, 0.85, JETFORM, this.craft(JET), this.craft(JET), false, false, fade)
    }
  }

  // The easter egg: a humpback breaching off the starboard bow, rising nearly upright, twisting over and crashing back
  // in a burst of spray.
  private drawWhale(dy: number) {
    const { A, H, look } = this
    const p = this.egg.t / EGG
    const wx = Math.min(A / 2 + VANISH + 0.25, A - 0.12) * H
    const wy = (HORIZON + 0.035 + dy) * H
    const s = 0.03 * H
    const foam: RGB = look.night ? [look.foam[0] * 0.6, look.foam[1] * 0.6, look.foam[2] * 0.6] : look.foam
    const breach = clamp((p - 0.08) / 0.6, 0, 1)
    if (breach > 0 && breach < 1) {
      const angle = lerp(1.35, 0.15, breach)
      const rise = Math.sin(breach * Math.PI) * 1.3
      const cx = wx + breach * 0.5 * s
      const cy = wy - rise * s
      const ca = Math.cos(angle)
      const sa = Math.sin(angle)
      const Q = (u: number, v: number): Point => [cx + (u * ca + v * sa * 0.3) * s, Math.min(wy, cy - (u * sa - v * ca) * s)]
      this.polygon(WHALE_BODY.map(([u, v]) => Q(u, v)), this.craft(WHALE))
      this.polygon(WHALE_BELLY.map(([u, v]) => Q(u, v)), this.paint(WHALE, look.night ? 5 : 2.2))
      this.polygon(WHALE_FIN.map(([u, v]) => Q(u, v)), this.paint(WHALE, look.night ? 4 : 1.8))
    }
    // Spray as it breaks the surface and as it falls back.
    for (const [start, k] of [[0.06, 0.6], [0.66, 1]] as const) {
      const age = p - start
      if (age < 0 || age > 0.3) continue
      const f = age / 0.3
      for (let i = 0; i < 14; i++) {
        const a = Math.PI * (0.1 + 0.8 * hash(i * 3.1 + start))
        const r = s * (0.4 + 1.4 * hash(i * 1.7 + start)) * Math.sqrt(f)
        const up = Math.sin(f * Math.PI) * s * (0.6 + hash(i) * 0.8) * k
        this.disc(wx + start * s + Math.cos(a) * r, wy - up * Math.sin(a), s * 0.12 * (1 - f * 0.5), foam[0], foam[1], foam[2], (1 - f) * 0.7)
      }
      this.ellipse(wx + start * s, wy, s * (0.6 + f * 1.4), s * 0.12, foam[0], foam[1], foam[2], (1 - f) * 0.45)
    }
  }

  // ---- The glass: rain beading and running down it, and the wiper sweeping the middle pane now and then.

  private stepRain(dt: number) {
    const rain = this.rainAmount()
    if (rain <= 0) return
    const w = this.wipe
    if (w.t >= 0) {
      w.t += dt
      if (w.t > 3) {
        w.t = -1
        w.wait = rand(14, 22)
      }
    } else {
      w.wait -= dt
      if (w.wait <= 0 && rain > 0.3) w.t = 0
    }
    const angle = this.wiperAngle()
    const { A } = this
    for (const d of this.drops) {
      d.age += dt
      if (d.slide > 0) {
        d.y += d.slide * dt
        if (d.y > SILL) Object.assign(d, { x: Math.random(), y: rand(TOP, SILL), age: 0, slide: 0 })
        continue
      }
      if (d.age > 6 && Math.random() < dt * 0.02 * rain) d.slide = rand(0.02, 0.05)
      // The wiper clears what it sweeps over.
      if (angle !== undefined) {
        const dx = d.x * A - A / 2
        const dy = SILL + 0.005 - d.y
        if (Math.hypot(dx, dy) < WIPER && Math.abs(Math.atan2(dx, dy) - angle) < 0.08) d.age = 0
      }
    }
  }

  private rainAmount() {
    return Math.max(this.raining ? 1 : 0, smoothstep(0.2, 1, this.gloom))
  }

  // The wiper's angle from upright while it sweeps out and back, or undefined while it rests.
  private wiperAngle() {
    const t = this.wipe.t
    if (t < 0) return undefined
    return -1.25 + 2.5 * Math.sin((t / 3) * Math.PI)
  }

  private drawRain() {
    const rain = this.rainAmount()
    if (rain <= 0) return
    const { A, H, look } = this
    const c = look.drop
    const count = Math.min(this.drops.length, Math.round(35 * A * rain))
    for (let i = 0; i < count; i++) {
      const d = this.drops[i]
      const k = smoothstep(0, 4, d.age) * rain
      if (k <= 0.02) continue
      const x = d.x * A * H
      const y = d.y * H
      const r = Math.max(this.cells ? 1.2 : 0.6, d.r * H)
      if (d.slide > 0) trail(this.hdr, this.W, H, x, y, x, y - 0.04 * H, r * 0.5, c, 0.25 * k)
      this.disc(x, y + r * 0.25, r, c[0] * 0.15, c[1] * 0.15, c[2] * 0.15, 0.3 * k)
      this.disc(x, y - r * 0.2, r * 0.7, c[0], c[1], c[2], 0.35 * k)
      if (d.slide > 0) this.touch(x - r - 2, y - 0.04 * H - 2, x + r + 2, y + r + 2)
    }
    const angle = this.wiperAngle()
    if (angle === undefined) return
    const px = (A / 2) * H
    const py = (SILL + 0.005) * H
    const ux = Math.sin(angle)
    const uy = -Math.cos(angle)
    const len = WIPER * H
    const w = this.thick(0.004, 1)
    const arm = this.look.frame
    this.polygon([[px - uy * w, py + ux * w], [px + uy * w, py - ux * w], [px + ux * len + uy * w, py + uy * len - ux * w], [px + ux * len - uy * w, py + uy * len + ux * w]], arm)
    this.polygon([[px + ux * len * 0.3 - uy * w * 1.6, py + uy * len * 0.3 + ux * w * 1.6], [px + ux * len * 0.3 + uy * w * 1.6, py + uy * len * 0.3 - ux * w * 1.6], [px + ux * len + uy * w * 1.6, py + uy * len - ux * w * 1.6], [px + ux * len - uy * w * 1.6, py + uy * len + ux * w * 1.6]], arm)
  }

  // ---- The bridge: the overhead with its gear, the window frames, and the console with its instruments.

  // The windows' top and bottom at x (screen heights): the side panes turn away, so their edges close in.
  private paneEdges(x: number): [number, number] {
    const side = Math.max(0, Math.abs(x - this.A / 2) - 0.5)
    return [TOP + side * 0.035, SILL - side * 0.03]
  }

  private mullions() {
    const { A } = this
    return [0.5, 1.15, 1.8, 2.45, 3.1].flatMap((d) => [-d, d]).filter((d) => Math.abs(d) < A / 2 + 0.1)
  }

  private spots() {
    return spotsFor(this.A)
  }

  private drawFrame(mask: boolean) {
    const { A, H, look } = this
    const s = this.spots()
    const col = (c: RGB, k = 1): RGB => (mask ? [1, 1, 1] : [c[0] * k, c[1] * k, c[2] * k])
    const P = (x: number, y: number): Point => [x * H, y * H]
    const rect = (x0: number, y0: number, x1: number, y1: number, c: RGB) => this.polygon([P(x0, y0), P(x1, y0), P(x1, y1), P(x0, y1)], c)
    const xs = [0, ...this.mullions().map((d) => A / 2 + d), A / 2, A].sort((a, b) => a - b)
    const top = (x: number) => this.paneEdges(x)[0]
    const sill = (x: number) => this.paneEdges(x)[1]
    const band = (y0: (x: number) => number, y1: (x: number) => number, c: RGB) => this.polygon([...xs.map((x) => P(x, y0(x))), ...xs.slice().reverse().map((x) => P(x, y1(x)))], c)
    // The bulkhead above the windows, and the ceiling with its seams, an air-conditioning vent, LED light strips and
    // cable trays.
    this.polygon([P(0, 0), P(A, 0), ...xs.slice().reverse().map((x) => P(x, top(x)))], col(look.panel))
    rect(0, 0, A, 0.04, col(look.frame, 1.3))
    if (!mask) {
      for (let x = -0.3; x < A + 0.3; x += 0.24) this.polygon([P(x - 0.002, 0), P(x + 0.002, 0), P(A / 2 + (x - A / 2) * 0.88 + 0.002, 0.04), P(A / 2 + (x - A / 2) * 0.88 - 0.002, 0.04)], col(look.frame, 0.55))
      rect(0, 0.019, A, 0.022, col(look.frame, 0.6))
      rect(A / 2 - 0.09, 0.006, A / 2 + 0.09, 0.032, col(look.frame, 2.2))
      for (let i = 0; i < 6; i++) rect(A / 2 - 0.08, 0.01 + i * 0.0035, A / 2 + 0.08, 0.0115 + i * 0.0035, col(look.frame, 0.7))
      for (const x of [A / 2 - 0.6, A / 2 + 0.6]) {
        rect(x - 0.08, 0.026, x + 0.08, 0.033, col(look.bezel, 1.2))
        rect(x - 0.075, 0.028, x + 0.075, 0.031, col(look.lamplight, look.night ? 0.5 : 0.9))
        poolOn(this.hdr, this.W, H, x * H, 0.06 * H, 0.32 * H, 0.1 * H, look.lamplight, look.night ? 0.8 : 0.5)
      }
    }
    for (const y of [0.045, 0.062]) {
      rect(0, y, A, y + 0.011, col(look.frame, 1.8))
      if (!mask) for (let k = 0; k < 3; k++) rect(0, y + 0.002 + k * 0.003, A, y + 0.0035 + k * 0.003, col(k === 1 ? look.bezel : look.frame, k === 1 ? 0.9 : 3))
    }
    if (!mask) for (let x = 0.12; x < A; x += 0.33) rect(x, 0.04, x + 0.008, 0.078, col(look.bezel, 0.8))
    // The window header with its status light strip, the sill, and mullions leaning in as the glass slants out.
    band((x) => top(x) - 0.022, top, col(look.frame, 1))
    band((x) => top(x) - 0.006, (x) => top(x) + 0.004, mask ? col(look.frame) : this.rimmed(1.6, 0.3))
    rect(A / 2 - 0.2, 0.176, A / 2 + 0.2, 0.19, col(look.bezel, 0.7))
    for (const d of this.mullions()) {
      const x = A / 2 + d
      const lean = Math.abs(d) > 0.6 ? 0.92 : 0.95
      const [t, b] = this.paneEdges(x)
      const tx = A / 2 + d * lean
      const inner = -Math.sign(d)
      this.polygon([P(x - 0.026, b + 0.01), P(x + 0.026, b + 0.01), P(tx + 0.02, t - 0.02), P(tx - 0.02, t - 0.02)], col(look.frame))
      if (!mask) this.polygon([P(x + inner * 0.026, b), P(x + inner * 0.019, b), P(tx + inner * 0.014, t), P(tx + inner * 0.02, t)], this.rimmed(1.2, 0.35))
    }
    this.drawOverhead(s, mask)
    this.drawConsoleBody(s, mask, band, sill)
  }

  // The overhead console: a comms rack of lit keys with a headset on its hook, three slim repeater screens (heading,
  // speed and wind), a digital clock, and a row of switches under guards.
  private drawOverhead(s: Spots, mask: boolean) {
    const { H, look } = this
    const col = (c: RGB, k = 1): RGB => (mask ? [1, 1, 1] : [c[0] * k, c[1] * k, c[2] * k])
    const P = (x: number, y: number): Point => [x * H, y * H]
    const rect = (x0: number, y0: number, x1: number, y1: number, c: RGB) => this.polygon([P(x0, y0), P(x1, y0), P(x1, y1), P(x0, y1)], c)
    const disc = (x: number, y: number, r: number, c: RGB, ry = r) => this.ellipse(x * H, y * H, r * H, ry * H, c[0], c[1], c[2], 1)
    const g = look.glow
    // The overhead console's slanted face runs the width of the bulkhead.
    rect(0, 0.08, this.A, 0.172, col(look.panel, 1.25))
    rect(0, 0.08, this.A, 0.084, mask ? col(look.frame) : this.rimmed(1.6, 0.2))
    for (const r of [s.rack, s.rack2]) {
      if (!r) continue
      plate(r.x0, 0.088, r.x1, 0.166)
      rect(r.x0 + 0.008, 0.093, r.x1 - 0.008, 0.103, col(look.screen, 1.4))
      if (!mask) rect(r.x0 + 0.012, 0.096, r.x0 + 0.012 + (r.x1 - r.x0) * 0.4, 0.1, col(g, 0.6))
      if (!mask) for (const [x, y] of keyGrid(r)) rect(x - 0.008, y - 0.006, x + 0.008, y + 0.006, col(look.bezel, 1.3))
    }
    // The headset on its hook at the rack's side; its cord is drawn each frame.
    const hx = s.rack.x1 - 0.022
    rect(hx - 0.003, 0.166, hx + 0.003, 0.178, col(look.bezel, 1.4))
    if (!mask) {
      for (let i = 0; i < 7; i++) {
        const a0 = Math.PI * (i / 7)
        const a1 = Math.PI * ((i + 1) / 7)
        const arc = (a: number, r: number): Point => P(hx - Math.cos(a) * r, 0.2 - Math.sin(a) * r * 0.9)
        this.polygon([arc(a0, 0.026), arc(a1, 0.026), arc(a1, 0.021), arc(a0, 0.021)], col(look.frame, 3))
      }
    }
    for (const side of [-1, 1]) disc(hx + side * 0.024, 0.205, 0.009, col(look.frame, 3.4), 0.013)
    if (!mask) this.polygon([P(hx - 0.03, 0.208), P(hx - 0.027, 0.206), P(hx - 0.005, 0.226), P(hx - 0.008, 0.229)], col(look.frame, 3.4))
    // The slim repeaters: a heading tape, a speed bar and a wind dial.
    for (const [i, cx] of s.screens.entries()) {
      const hw = s.sw / 2
      plate(cx - hw, 0.092, cx + hw, 0.158)
      rect(cx - hw + 0.007, 0.099, cx + hw - 0.007, 0.151, col(look.screen))
      if (mask) continue
      if (i === 0) {
        for (let k = -4; k <= 4; k++) rect(cx + k * hw * 0.2 - 0.0012, k % 2 ? 0.118 : 0.112, cx + k * hw * 0.2 + 0.0012, 0.126, col(g, 0.6))
        rect(cx - hw + 0.012, 0.128, cx + hw - 0.012, 0.13, col(g, 0.5))
        this.polygon([P(cx - 0.006, 0.142), P(cx + 0.006, 0.142), P(cx, 0.132)], col(look.glow2))
        continue
      }
      if (i === 1) {
        rect(cx - hw + 0.014, 0.115, cx + hw - 0.014, 0.133, col(g, 0.35))
        rect(cx - hw + 0.016, 0.117, cx - hw + 0.016 + (s.sw - 0.032) * 0.62, 0.131, col(g, 0.85))
        for (let k = 0; k <= 5; k++) rect(cx - hw + 0.014 + (k / 5) * (s.sw - 0.028) - 0.001, 0.136, cx - hw + 0.014 + (k / 5) * (s.sw - 0.028) + 0.001, 0.142, col(g, 0.5))
        continue
      }
      disc(cx, 0.125, 0.021, col(g, 0.5))
      disc(cx, 0.125, 0.018, col(look.screen))
      this.polygon([P(cx - 0.012, 0.132), P(cx + 0.011, 0.117), P(cx + 0.006, 0.124), P(cx + 0.015, 0.113), P(cx + 0.002, 0.12), P(cx + 0.008, 0.115)], col(look.glow2))
    }
    // The clock: glowing seven-segment digits in a dark window; the colon blinks each frame.
    const c = s.clock
    plate(c.x0, 0.095, c.x1, 0.155)
    rect(c.x0 + 0.008, 0.102, c.x1 - 0.008, 0.148, col(look.screen, 0.6))
    if (!mask) {
      const dw = (c.x1 - c.x0 - 0.04) / 4
      for (let d = 0; d < 4; d++) {
        const x = c.x0 + 0.014 + d * dw + (d > 1 ? 0.012 : 0)
        sevenSegment((pts, color) => this.polygon(pts, color), x, 0.108, dw * 0.7, 0.034, DIGITS[d], col(g, 0.95), col(g, 0.12), H)
      }
    }
    // The guarded switches: toggles behind hinged red covers.
    const gd = s.guards
    plate(gd.x0, 0.09, gd.x1, 0.166)
    if (!mask)
      for (const y of [0.104, 0.138])
        for (let x = gd.x0 + 0.018; x < gd.x1 - 0.012; x += 0.03) {
          rect(x - 0.009, y - 0.004, x + 0.009, y + 0.018, col(look.night ? [0.2, 0.02, 0.01] : [0.32, 0.05, 0.04]))
          rect(x - 0.006, y - 0.001, x + 0.006, y + 0.015, col(look.panel, 0.9))
          rect(x - 0.0015, y + 0.002, x + 0.0015, y + 0.012, col(look.bezel, 1.6))
        }

    function plate(x0: number, y0: number, x1: number, y1: number) {
      rect(x0, y0, x1, y1, col(look.bezel, 0.75))
      rect(x0 + 0.003, y0 + 0.003, x1 - 0.003, y1 - 0.003, col(look.panel, 1.6))
    }
  }

  // The console: its rounded top with key panels, a row of multifunction displays in touch bezels (radar, an
  // electronic chart, the ship's status and the engines), and the desk in front with a keyboard and trackball, the
  // helm joystick and the throttle quadrant; an officer's chair in the corner.
  private drawConsoleBody(s: Spots, mask: boolean, band: (y0: (x: number) => number, y1: (x: number) => number, c: RGB) => void, sill: (x: number) => number) {
    const { A, H, look } = this
    const col = (c: RGB, k = 1): RGB => (mask ? [1, 1, 1] : [c[0] * k, c[1] * k, c[2] * k])
    const P = (x: number, y: number): Point => [x * H, y * H]
    const rect = (x0: number, y0: number, x1: number, y1: number, c: RGB) => this.polygon([P(x0, y0), P(x1, y0), P(x1, y1), P(x0, y1)], c)
    const rounded = (x0: number, y0: number, x1: number, y1: number, r: number, c: RGB) => this.polygon([P(x0 + r, y0), P(x1 - r, y0), P(x1, y0 + r), P(x1, y1 - r), P(x1 - r, y1), P(x0 + r, y1), P(x0, y1 - r), P(x0, y0 + r)], c)
    const disc = (x: number, y: number, r: number, c: RGB, ry = r) => this.ellipse(x * H, y * H, r * H, ry * H, c[0], c[1], c[2], 1)
    const g = look.glow
    const g2 = look.glow2
    // The console's gray top with a rounded front edge, its face, and the desk below.
    band((x) => sill(x) - 0.006, () => 0.7, col(look.panel, 1.6))
    rect(0, 0.7, A, 0.714, mask ? col(look.frame) : this.rimmed(2.6, 0.45))
    rect(0, 0.714, A, 0.9, col(look.panel, 0.9))
    rect(0, 0.9, A, 1, col(look.panel, 1.35))
    rect(0, 0.9, A, 0.908, mask ? col(look.frame) : this.rimmed(2.4, 0.4))
    // Key panels along the top; their lamps are lit each frame.
    for (const [x0, x1] of s.keyPanels) {
      rounded(x0, 0.618, x1, 0.69, 0.006, col(look.screen, 1.6))
      if (!mask)
        for (let x = x0 + 0.015; x < x1 - 0.01; x += 0.03) {
          rect(x - 0.009, 0.628, x + 0.009, 0.642, col(look.bezel, 1.1))
          rect(x - 0.009, 0.67, x + 0.009, 0.682, col(look.bezel, 0.9))
        }
    }
    // The displays.
    const [y0, y1] = [DISPLAY_TOP, DISPLAY_BOTTOM]
    for (const [i, dx] of s.displays.entries()) {
      const x1 = dx + s.dw
      rounded(dx - 0.01, y0 - 0.012, x1 + 0.01, y1 + 0.03, 0.012, col(look.bezel))
      rect(dx, y0, x1, y1, col(look.screen))
      // Soft keys along the bezel's foot.
      if (!mask) for (let k = 0; k < 6; k++) rect(dx + 0.01 + (k * (s.dw - 0.02)) / 6, y1 + 0.009, dx + 0.01 + ((k + 0.7) * (s.dw - 0.02)) / 6, y1 + 0.019, col(look.bezel, 1.8))
      if (mask) continue
      const cx = dx + s.dw / 2
      const cy = (y0 + y1) / 2
      if (i === 0) {
        // Radar: range rings around the scope (the sweep is drawn each frame) and track tables beside it.
        const r = s.scope.r
        disc(cx, cy, r + 0.004, col(g, 0.35))
        disc(cx, cy, r, col(look.screen, 0.6))
        for (const side of [-1, 1])
          if (s.dw > 0.26) for (let k = 0; k < 5; k++) rect(cx + side * (r + 0.015), y0 + 0.02 + k * 0.022, cx + side * (r + 0.015) + side * (s.dw / 2 - r - 0.03), y0 + 0.027 + k * 0.022, col(g, 0.25 + 0.15 * (k % 2)))
        continue
      }
      if (i === 1) {
        // The electronic chart: land with its coastline, depth contours, the planned track and waypoints; own ship moves
        // along the track each frame.
        const land: Point[] = [P(dx, y0), P(x1, y0), P(x1, y0 + 0.02)]
        for (let k = 8; k >= 0; k--) land.push(P(dx + (k / 8) * s.dw, y0 + 0.035 + Math.sin(k * 1.1) * 0.012 + hash(k * 2.9) * 0.015 - (k / 8) * 0.02))
        this.polygon(land, col(g, 0.22))
        for (let k = 0; k < 8; k++) {
          const xa = dx + (k / 8) * s.dw
          const xb = dx + ((k + 1) / 8) * s.dw
          const ya = y0 + 0.035 + Math.sin(k * 1.1) * 0.012 + hash(k * 2.9) * 0.015 - (k / 8) * 0.02
          const yb = y0 + 0.035 + Math.sin((k + 1) * 1.1) * 0.012 + hash((k + 1) * 2.9) * 0.015 - ((k + 1) / 8) * 0.02
          this.polygon([P(xa, ya), P(xb, yb), P(xb, yb + 0.003), P(xa, ya + 0.003)], col(g, 0.7))
          for (const off of [0.03, 0.06]) if (k % 2 === 0) this.polygon([P(xa, ya + off), P(xb, yb + off), P(xb, yb + off + 0.0015), P(xa, ya + off + 0.0015)], col(g, 0.25))
        }
        disc(dx + s.dw * 0.72, y0 + 0.07, 0.014, col(g, 0.22), 0.009)
        const [ax, ay, bx, by] = s.track
        for (let k = 0; k < 10; k += 2) {
          const f0 = k / 10
          const f1 = (k + 1) / 10
          this.polygon([P(lerp(ax, bx, f0), lerp(ay, by, f0) - 0.001), P(lerp(ax, bx, f1), lerp(ay, by, f1) - 0.001), P(lerp(ax, bx, f1), lerp(ay, by, f1) + 0.001), P(lerp(ax, bx, f0), lerp(ay, by, f0) + 0.001)], col(g2, 0.8))
        }
        for (const f of [0, 0.5, 1]) disc(lerp(ax, bx, f), lerp(ay, by, f), 0.004, col(g2, 0.6))
        continue
      }
      if (i === 2) {
        // Ship status: the carrier's deck outline seen from above, with its deck spots marked.
        const L = s.dw * 0.4
        const Q = (u: number, v: number): Point => P(cx + u * L, cy + v * L)
        const deck: Point[] = [Q(-1, -0.12), Q(0.75, -0.16), Q(1, -0.08), Q(1, 0.12), Q(0.6, 0.2), Q(-0.3, 0.2), Q(-1, 0.32), Q(-1.02, 0.18)]
        this.polygon(deck, col(g, 0.55))
        this.polygon(deck.map(([x, y]) => [cx * H + (x - cx * H) * 0.94, cy * H + (y - cy * H) * 0.85] as const), col(look.screen, 1.2))
        this.polygon([Q(-0.95, 0.24), Q(0.4, -0.02), Q(0.42, 0.01), Q(-0.92, 0.27)], col(g, 0.4))
        this.polygon([Q(0.05, -0.2), Q(0.25, -0.2), Q(0.25, -0.13), Q(0.05, -0.13)], col(g, 0.7))
        for (let k = 0; k < 4; k++) rect(cx + (0.3 + k * 0.32 - 0.8) * L - 0.003, y1 - 0.025, cx + (0.3 + k * 0.32 - 0.8) * L + 0.003, y1 - 0.019, col(g, 0.5))
        continue
      }
      // Engines and power: four bars with their levels, and a trend line above.
      for (let k = 0; k < 4; k++) {
        const bx = dx + 0.02 + (k * (s.dw - 0.04)) / 4
        const bw = (s.dw - 0.04) / 4 - 0.012
        const level = [0.72, 0.68, 0.8, 0.45][k]
        rect(bx, y0 + 0.05, bx + bw, y1 - 0.012, col(g, 0.22))
        rect(bx + 0.002, y1 - 0.014 - (y1 - y0 - 0.064) * level, bx + bw - 0.002, y1 - 0.014, col(k === 3 ? g2 : g, 0.75))
      }
      for (let k = 0; k < 10; k++) {
        const xa = dx + 0.02 + (k / 10) * (s.dw - 0.04)
        const xb = dx + 0.02 + ((k + 1) / 10) * (s.dw - 0.04)
        const ya = y0 + 0.03 - Math.sin(k * 0.9) * 0.008
        const yb = y0 + 0.03 - Math.sin((k + 1) * 0.9) * 0.008
        this.polygon([P(xa, ya), P(xb, yb), P(xb, yb + 0.002), P(xa, ya + 0.002)], col(g, 0.6))
      }
    }
    // The keyboard tray and trackball.
    const kb = s.keyboard
    rounded(kb.x - kb.w / 2, 0.922, kb.x + kb.w / 2, 0.978, 0.008, col(look.panel, 2.2))
    if (!mask)
      for (let row = 0; row < 3; row++)
        for (let x = kb.x - kb.w / 2 + 0.012; x < kb.x + kb.w / 2 - 0.012; x += 0.016) rect(x, 0.93 + row * 0.015, x + 0.011, 0.94 + row * 0.015, col(look.panel, 3.4))
    disc(s.trackball, 0.95, 0.03, col(look.panel, 2.4), 0.02)
    disc(s.trackball, 0.946, 0.014, col(look.screen, 4), 0.011)
    // The helm: a compact steering joystick on its base.
    const j = s.joystick
    disc(j, 0.958, 0.04, col(look.panel, 2.6), 0.016)
    this.polygon([P(j - 0.006, 0.958), P(j + 0.006, 0.958), P(j + 0.004, 0.9), P(j - 0.004, 0.9)], col(look.frame, 3.5))
    rounded(j - 0.013, 0.86, j + 0.013, 0.905, 0.008, col(look.panel, 3))
    disc(j, 0.868, 0.004, col(g2, 0.8))
    // The throttle quadrant: two sleek levers in their slots.
    const t = s.throttle
    rounded(t - 0.045, 0.925, t + 0.045, 0.975, 0.01, col(look.panel, 2.4))
    for (const dx of [-0.016, 0.016]) {
      rect(t + dx - 0.003, 0.93, t + dx + 0.003, 0.97, col(look.frame, 2))
      this.polygon([P(t + dx - 0.004, 0.95), P(t + dx + 0.004, 0.95), P(t + dx + 0.002, 0.9), P(t + dx - 0.006, 0.9)], col(look.bezel, 1.4))
      rounded(t + dx - 0.012, 0.888, t + dx + 0.008, 0.904, 0.004, col(look.panel, 3.4))
    }
    // An officer's chair in the corner: headrest, a contoured back and an armrest.
    rounded(0.012, 0.74, 0.1, 0.795, 0.015, col(look.frame, 2.4))
    for (const x of [0.04, 0.072]) rect(x - 0.003, 0.795, x + 0.003, 0.812, col(look.bezel, 1))
    this.polygon([P(0, 0.81), P(0.11, 0.812), P(0.128, 0.84), P(0.13, 1), P(0, 1)], col(look.frame, 2))
    if (!mask) this.polygon([P(0.11, 0.812), P(0.128, 0.84), P(0.13, 1), P(0.124, 1), P(0.122, 0.842), P(0.106, 0.818)], this.rimmed(2.4, 0.35))
    rounded(0.06, 0.9, 0.2, 0.93, 0.012, col(look.frame, 2.8))
    // At night the bridge's red lighting pools on the console.
    if (!mask && look.night)
      for (const [x, y, rx] of [[A / 2, 0.66, 0.5], [s.joystick, 0.95, 0.15], [s.throttle, 0.95, 0.15], [A / 2, 0.95, 0.3]] as const)
        poolOn(this.hdr, this.W, H, x * H, y * H, rx * H, Math.min(0.1, rx * 0.5) * H, look.lamplight, 0.8)
  }

  // The faint light from the windows on a frame edge, mixed into the frame color.
  private rimmed(k: number, rim: number): RGB {
    const { frame, rim: r } = this.look
    return [frame[0] * k + r[0] * rim, frame[1] * k + r[1] * rim, frame[2] * k + r[2] * rim]
  }

  private placeConsole() {
    const s = this.spots()
    this.inside = s
    const night = this.look.night
    const colors: RGB[] = night
      ? [
          [1.4, 0.12, 0.04],
          [1.3, 0.55, 0.08],
          [0.25, 0.8, 0.3],
        ]
      : [
          [0.3, 1.3, 0.5],
          [1.4, 0.8, 0.15],
          [0.3, 0.9, 1.4],
        ]
    this.leds = []
    let k = 0
    const led = (x: number, y: number) => {
      const h = hash(k * 7.7)
      this.leds.push({ x: x * this.H, y: y * this.H, color: colors[Math.floor(hash(k * 3.1) * 3)], rate: h > 0.8 ? 0.5 + hash(k) : 0, phase: hash(k * 1.3) * TAU })
      k++
    }
    for (const [x0, x1] of s.keyPanels) for (let x = x0 + 0.015; x < x1 - 0.01; x += 0.03) led(x, 0.656)
    for (const r of [s.rack, s.rack2]) if (r) for (const [x, y] of keyGrid(r)) if (hash(x * 13 + y * 7) > 0.45) led(x, y)
    for (const dx of s.displays) led(dx + s.dw - 0.012, DISPLAY_BOTTOM + 0.014)
  }

  // What moves inside: lit keys, the radar's sweep, own ship stepping along the chart, a deck spot blinking on the
  // status display, the clock's colon, the status strip pulsing, and the headset's cord swaying with the swell.
  private drawConsole() {
    const { H, look } = this
    const s = this.inside
    if (!s) return
    const t = this.time
    const k = look.night ? 0.35 : 0.6
    for (const l of this.leds) {
      const on = l.rate ? smoothstep(-0.3, 0.3, Math.sin(t * l.rate + l.phase)) : 1
      const b = (0.25 + 0.75 * on) * k
      this.point(l.x, l.y, l.color[0] * b, l.color[1] * b, l.color[2] * b, 1)
    }
    const sc = s.scope
    const box = radarScope(this.hdr, this.W, H, sc.x * H, sc.y * H, sc.r * H, sc.r * H, (t * TAU) / 3, look.night ? [1.1, 0.45, 0.05] : [0.2, 1, 0.9])
    this.touch(box[0], box[1], box[2], box[3])
    // Own ship advances along the chart's track in small steps, as the chart refreshes.
    const [ax, ay, bx, by] = s.track
    const f = 0.15 + ((Math.floor(t / 6) * 0.02) % 0.7)
    const ox = lerp(ax, bx, f)
    const oy = lerp(ay, by, f)
    const g2 = look.glow2
    const ang = Math.atan2(by - ay, bx - ax)
    const ca = Math.cos(ang)
    const sa = Math.sin(ang)
    const Q = (u: number, v: number): Point => [(ox + u * ca - v * sa) * H, (oy + u * sa + v * ca) * H]
    this.polygon([Q(0.012, 0), Q(-0.007, -0.006), Q(-0.007, 0.006)], [g2[0] * 1.3, g2[1] * 1.3, g2[2] * 1.3])
    // A deck spot on the status display blinks slowly.
    const st = s.displays[2] + s.dw / 2
    const on = smoothstep(-0.2, 0.2, Math.sin(t * 0.8))
    for (let i = 0; i < 5; i++) {
      const L = s.dw * 0.4
      const x = st + (-0.7 + i * 0.32) * L
      const y = (DISPLAY_TOP + DISPLAY_BOTTOM) / 2 + (i % 2 ? 0.02 : 0.05) * L * 4
      const c = i === 2 ? AMBER : g2
      const b = i === 2 ? 0.25 + 0.35 * on : 0.6
      this.ellipse(x * H, y * H, 0.004 * H, 0.004 * H, c[0] * b, c[1] * b, c[2] * b, 1)
    }
    // The clock's colon.
    const c = s.clock
    const cxm = (c.x0 + c.x1) / 2 + 0.003
    const colon = Math.floor(t) % 2 ? 0.95 : 0.2
    for (const y of [0.117, 0.133]) this.ellipse(cxm * H, y * H, 0.0025 * H, 0.0025 * H, look.glow[0] * colon, look.glow[1] * colon, look.glow[2] * colon, 1)
    // The status strip: green, amber and red lights breathing gently; in a storm the red ones pulse harder.
    for (let i = 0; i < STRIP.length; i++) {
      const x = this.A / 2 - 0.18 + (i * 0.36) / (STRIP.length - 1)
      const kind = STRIP[i]
      const col: RGB = kind === 2 ? [1.6, 0.12, 0.05] : kind === 1 ? [1.4, 0.75, 0.1] : look.night ? [0.25, 0.7, 0.25] : [0.3, 1.2, 0.45]
      const pulse = 0.85 + 0.15 * Math.sin(t * 0.6 + i) + (kind === 2 ? this.gloom * (0.6 + 0.6 * Math.sin(t * 2.5)) : 0)
      const b = pulse * (look.night ? 0.3 : 0.45)
      this.ellipse(x * H, 0.183 * H, 0.0045 * H, 0.0035 * H, col[0] * b, col[1] * b, col[2] * b, 1)
    }
    this.drawHeadsetCord(s.rack.x1 - 0.022 - 0.024, 0.218)
  }

  // The headset's coiled cord hanging from its ear cup, swinging a little as the ship pitches.
  private drawHeadsetCord(ax: number, ay: number) {
    const { H, look } = this
    const a = clamp((this.pitch / PITCH) * 0.08, -0.35, 0.35)
    const ux = Math.sin(a)
    const uy = Math.cos(a)
    const cord: RGB = [look.frame[0] * 3.2, look.frame[1] * 3.2, look.frame[2] * 3.2]
    const w = this.thick(0.0016, 0.7)
    const len = 0.07
    let px = ax * H
    let py = ay * H
    for (let i = 1; i <= 11; i++) {
      const f = i / 11
      const side = i === 11 ? 0 : (i % 2 ? 1 : -1) * 0.005
      const qx = (ax + ux * len * f + uy * side) * H
      const qy = (ay + uy * len * f - ux * side) * H
      this.polygon([[px - w, py], [px + w, py], [qx + w, qy], [qx - w, qy]], cord)
      px = qx
      py = qy
    }
    this.polygon([[px - w * 2, py], [px + w * 2, py], [px + w * 2, py + 0.012 * H], [px - w * 2, py + 0.012 * H]], cord)
  }

}

// Where everything inside sits, measured from the edges and the middle so it fits narrow and wide screens alike.
function spotsFor(A: number) {
  const sw = clamp((A - 0.68) / 3.3, 0.1, 0.17)
  const left = A / 2 - 1.5 * sw - 0.025
  const right = A / 2 + 1.5 * sw + 0.025
  const rack = { x0: 0.035, x1: Math.min(0.3, left - 0.04) }
  const clock = { x0: right + 0.035, x1: right + 0.035 + Math.min(0.13, A - right - 0.2) }
  const guards = { x0: Math.max(clock.x1 + 0.03, A - 0.27), x1: A - 0.035 }
  const rack2 = guards.x0 - clock.x1 - 0.08 > 0.12 ? { x0: clock.x1 + 0.04, x1: guards.x0 - 0.04 } : undefined
  const dw = clamp((A - 0.31) / 4, 0.2, 0.36)
  const dx0 = A / 2 - (4 * dw + 0.09) / 2
  const displays = [0, 1, 2, 3].map((i) => dx0 + i * (dw + 0.03))
  const narrow = A < 1.3
  const panels = Math.max(1, Math.round((Math.min(A - 0.05, A / 2 + 0.42) - Math.max(0.05, A / 2 - 0.42)) / 0.3))
  const p0 = Math.max(0.05, A / 2 - 0.42)
  const pw = (Math.min(A - 0.05, A / 2 + 0.42) - p0) / panels
  return {
    screens: [-1, 0, 1].map((i) => A / 2 + i * (sw + 0.025)),
    sw,
    rack,
    rack2,
    clock,
    guards,
    keyPanels: Array.from({ length: panels }, (_, i) => [p0 + i * pw + 0.01, p0 + (i + 1) * pw - 0.01] as const),
    displays,
    dw,
    scope: { x: displays[0] + dw / 2, y: (DISPLAY_TOP + DISPLAY_BOTTOM) / 2, r: Math.min(dw * 0.42, (DISPLAY_BOTTOM - DISPLAY_TOP) * 0.42) },
    // The chart's planned track, corner to corner below its coast.
    track: [displays[1] + dw * 0.15, DISPLAY_BOTTOM - 0.02, displays[1] + dw * 0.88, DISPLAY_TOP + 0.075] as const,
    keyboard: { x: A / 2, w: narrow ? 0.2 : 0.3 },
    trackball: A / 2 - (narrow ? 0.15 : 0.21),
    joystick: A / 2 - (narrow ? 0.29 : 0.34),
    throttle: A / 2 + (narrow ? 0.23 : 0.3),
  }
}

// Key positions across a comms rack: three rows under its little display.
function keyGrid(r: { x0: number; x1: number }) {
  const keys: [number, number][] = []
  for (let row = 0; row < 3; row++) for (let x = r.x0 + 0.02; x < r.x1 - 0.012; x += 0.026) keys.push([x, 0.115 + row * 0.018])
  return keys
}

// Draws a seven-segment digit from a mask of its segments (top, upper right, lower right, bottom, lower left, upper
// left, middle), lit segments in on and the rest faintly in off.
function sevenSegment(draw: (points: readonly (readonly [number, number])[], color: RGB) => void, x: number, y: number, w: number, h: number, mask: number, on: RGB, off: RGB, H: number) {
  const t = Math.min(w, h) * 0.16
  const half = h / 2
  const bars: [number, number, number, number][] = [
    [x + t, y, x + w - t, y + t],
    [x + w - t, y + t, x + w, y + half - t / 2],
    [x + w - t, y + half + t / 2, x + w, y + h - t],
    [x + t, y + h - t, x + w - t, y + h],
    [x, y + half + t / 2, x + t, y + h - t],
    [x, y + t, x + t, y + half - t / 2],
    [x + t, y + half - t / 2, x + w - t, y + half + t / 2],
  ]
  for (const [i, [x0, y0, x1, y1]] of bars.entries())
    draw(
      [
        [x0 * H, y0 * H],
        [x1 * H, y0 * H],
        [x1 * H, y1 * H],
        [x0 * H, y1 * H],
      ],
      mask & (1 << i) ? on : off,
    )
}

// Segment masks for the clock's four digits.
const DIGITS = [0b0000110, 0b1100110, 0b1001111, 0b0111111]
// The status strip's lights: 0 green, 1 amber, 2 red.
const STRIP = [0, 0, 0, 1, 0, 0, 2, 0, 0]
// The console displays' screens, top and bottom.
const DISPLAY_TOP = 0.728
const DISPLAY_BOTTOM = 0.86

type Spots = ReturnType<typeof spotsFor>

function crewSpot(): [number, number] {
  return [rand(-2.4, -0.5), rand(4.6, 8.3)]
}

// The taxi route from the landing deck onto a catapult, at u from 0 to 1.
function taxiPath(u: number, cat: { x: number; z0: number }): [number, number] {
  return bezier([-2.3, 4.1], [cat.x, 4.8], [cat.x, cat.z0], u)
}

function bezier(a: Point, b: Point, c: Point, u: number): [number, number] {
  const v = 1 - u
  return [v * v * a[0] + 2 * u * v * b[0] + u * u * c[0], v * v * a[1] + 2 * u * v * b[1] + u * u * c[1]]
}

// The volcano stands to port of the bow in the middle pane, clear of the sun's and moon's paths to starboard.
function volcanoX(A: number) {
  return Math.max(0.24, A / 2 - 0.25)
}

// Top-down outlines, nose toward +a, span along b.
const JETFORM: Point[][] = [
  [[0.5, 0], [0.3, 0.05], [-0.5, 0.06], [-0.5, -0.06], [0.3, -0.05]],
  [[0.12, 0.05], [-0.14, 0.42], [-0.24, 0.42], [-0.2, 0.05]],
  [[0.12, -0.05], [-0.14, -0.42], [-0.24, -0.42], [-0.2, -0.05]],
  [[-0.34, 0.05], [-0.48, 0.22], [-0.53, 0.22], [-0.5, 0.05]],
  [[-0.34, -0.05], [-0.48, -0.22], [-0.53, -0.22], [-0.5, -0.05]],
]
const FOLDED: Point[][] = [
  [[0.5, 0], [0.3, 0.05], [-0.5, 0.06], [-0.5, -0.06], [0.3, -0.05]],
  [[0.08, 0.05], [0.02, 0.24], [-0.16, 0.24], [-0.2, 0.05]],
  [[0.08, -0.05], [0.02, -0.24], [-0.16, -0.24], [-0.2, -0.05]],
  [[-0.34, 0.05], [-0.48, 0.22], [-0.53, 0.22], [-0.5, 0.05]],
  [[-0.34, -0.05], [-0.48, -0.22], [-0.53, -0.22], [-0.5, -0.05]],
]
// A humpback side on, head toward +u: its body, the pale grooved belly and a long pectoral fin.
const WHALE_BODY: Point[] = [[1, 0], [0.7, 0.16], [0.1, 0.24], [-0.5, 0.16], [-0.85, 0.06], [-1.05, 0.22], [-1.2, 0.24], [-1.02, 0], [-1.2, -0.18], [-1.05, -0.16], [-0.85, -0.05], [-0.4, -0.18], [0.4, -0.2], [0.85, -0.1]]
const WHALE_BELLY: Point[] = [[0.95, -0.04], [0.85, -0.1], [0.4, -0.2], [-0.2, -0.17], [0.3, -0.1]]
const WHALE_FIN: Point[] = [[0.45, -0.08], [0.3, -0.12], [-0.05, -0.62], [0.05, -0.64]]

function makeLowPolyClouds(count: number): Cloud[] {
  return Array.from({ length: count }, (_, i) => {
    const size = rand(0.06, 0.11) * WS
    const n = 3 + Math.floor(Math.random() * 3)
    const lumps = Array.from({ length: n }, (_, k) => {
      const f = n === 1 ? 0 : k / (n - 1) - 0.5
      return { x: f * 1.6 + rand(-0.1, 0.1), y: 0, r: (0.55 - Math.abs(f) * 0.5) * rand(0.8, 1.2), seed: Math.random() * 100 }
    })
    for (const l of lumps) l.y = -l.r * 0.6
    const y = i % 3 === 2 ? rand(0.32, 0.345) : rand(0.235, 0.29)
    return { x: ((i + Math.random() * 0.8) / count) * 2.2, y, size: i % 3 === 2 ? size * 0.7 : size, speed: rand(0.003, 0.006), lumps }
  })
}

function cloudSprite(c: Cloud, H: number, colors: [RGB, RGB], toLight: number): Sprite {
  const S = 4
  const size = c.size * H
  const w = Math.ceil(size * 2.4) + 4
  const h = Math.ceil(size * 1.3) + 4
  const ox = w / 2
  const oy = h - 2
  const fine = new Int32Array(w * S * h * S).fill(-1)
  const tones: number[] = []
  const lx = clamp(toLight * 2, -0.8, 0.8)
  const ly = -0.75
  const [lit, shade] = colors
  for (const l of c.lumps) {
    const cx = ox + l.x * size
    const cy = oy + l.y * size
    const r = l.r * size
    const n = 7
    const pts = Array.from({ length: n }, (_, k) => {
      const a = (k / n) * TAU + hash(l.seed + k) * 0.5
      const rr = r * (0.82 + hash(l.seed + k * 2.7) * 0.3)
      return [cx + Math.cos(a) * rr, Math.min(oy, cy + Math.sin(a) * rr * 0.85)] as const
    })
    const hub = [cx - lx * r * 0.25, cy - r * 0.2] as const
    for (let k = 0; k < n; k++) {
      const a = pts[k]
      const b = pts[(k + 1) % n]
      const mx = (a[0] + b[0]) / 2 - hub[0]
      const my = (a[1] + b[1]) / 2 - hub[1]
      const ml = Math.hypot(mx, my) || 1
      const tone = clamp(0.5 + 0.6 * ((mx / ml) * lx + (my / ml) * ly) + (hash(l.seed + k * 5.1) - 0.5) * 0.2, 0, 1)
      tones.push(tone)
      rasterTri(fine, w * S, h * S, hub[0] * S, hub[1] * S, a[0] * S, a[1] * S, b[0] * S, b[1] * S, tones.length - 1)
    }
  }
  const rgba = new Float32Array(w * h * 4)
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let r = 0
      let g = 0
      let b = 0
      let a = 0
      for (let j = 0; j < S; j++)
        for (let i = 0; i < S; i++) {
          const id = fine[(y * S + j) * w * S + x * S + i]
          if (id < 0) continue
          const t = tones[id]
          r += lerp(shade[0], lit[0], t)
          g += lerp(shade[1], lit[1], t)
          b += lerp(shade[2], lit[2], t)
          a++
        }
      const o = (y * w + x) * 4
      rgba[o] = r / (S * S)
      rgba[o + 1] = g / (S * S)
      rgba[o + 2] = b / (S * S)
      rgba[o + 3] = a / (S * S)
    }
  return { w, h, ox, oy, rgba }
}

function blitSprite(hdr: Float32Array, W: number, H: number, s: Sprite, x: number, y: number) {
  const x0 = Math.floor(x)
  const y0 = Math.floor(y)
  const fx = x - x0
  const fy = y - y0
  const d = s.rgba
  for (let j = 0; j <= s.h; j++) {
    const py = y0 + j
    if (py < 0 || py >= H) continue
    for (let i = 0; i <= s.w; i++) {
      const px = x0 + i
      if (px < 0 || px >= W) continue
      let r = 0
      let g = 0
      let b = 0
      let a = 0
      for (let q = 0; q < 4; q++) {
        const sx = i - (q & 1)
        const sy = j - (q >> 1)
        if (sx < 0 || sy < 0 || sx >= s.w || sy >= s.h) continue
        const k = (q & 1 ? fx : 1 - fx) * (q >> 1 ? fy : 1 - fy)
        const o = (sy * s.w + sx) * 4
        r += d[o] * k
        g += d[o + 1] * k
        b += d[o + 2] * k
        a += d[o + 3] * k
      }
      if (a <= 0) continue
      const o = (py * W + px) * 3
      hdr[o] = hdr[o] * (1 - a) + r
      hdr[o + 1] = hdr[o + 1] * (1 - a) + g
      hdr[o + 2] = hdr[o + 2] * (1 - a) + b
    }
  }
}

// Box-filters a buffer twice the size down to W x H.
function shrink2(big: Float32Array, W: number, H: number) {
  const out = new Float32Array(W * H * 3)
  const BW = W * 2
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const a = (y * 2 * BW + x * 2) * 3
      const b = a + BW * 3
      const o = (y * W + x) * 3
      for (let c = 0; c < 3; c++) out[o + c] = (big[a + c] + big[a + 3 + c] + big[b + c] + big[b + 3 + c]) * 0.25
    }
  return out
}

// A layer from its color painted over black (so premultiplied) and its coverage painted in white.
function layer(color: Float32Array, cover: Float32Array): Layer {
  const n = color.length / 3
  const rgba = new Float32Array(n * 4)
  const idx: number[] = []
  for (let i = 0; i < n; i++) {
    const a = clamp(cover[i * 3], 0, 1)
    rgba[i * 4] = color[i * 3]
    rgba[i * 4 + 1] = color[i * 3 + 1]
    rgba[i * 4 + 2] = color[i * 3 + 2]
    rgba[i * 4 + 3] = a
    if (a > 0 || color[i * 3] + color[i * 3 + 1] + color[i * 3 + 2] > 0) idx.push(i)
  }
  return { rgba, idx: Int32Array.from(idx) }
}

function composite(hdr: Float32Array, l: Layer) {
  const d = l.rgba
  const idx = l.idx
  for (let k = 0; k < idx.length; k++) {
    const i = idx[k]
    const o = i * 3
    const q = i * 4
    const a = 1 - d[q + 3]
    hdr[o] = hdr[o] * a + d[q]
    hdr[o + 1] = hdr[o + 1] * a + d[q + 1]
    hdr[o + 2] = hdr[o + 2] * a + d[q + 2]
  }
}

// A soft pool of light lifting what's painted (and only that, below row from) in its color.
function poolOn(hdr: Float32Array, W: number, H: number, cx: number, cy: number, rx: number, ry: number, color: RGB, k: number, from = 0) {
  const x0 = Math.max(0, Math.floor(cx - rx))
  const x1 = Math.min(W - 1, Math.ceil(cx + rx))
  const y0 = Math.max(0, Math.floor(Math.max(from, cy - ry)))
  const y1 = Math.min(H - 1, Math.ceil(cy + ry))
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      const d = 1 - ((x + 0.5 - cx) / rx) ** 2 - ((y + 0.5 - cy) / ry) ** 2
      if (d <= 0) continue
      const o = (y * W + x) * 3
      if (hdr[o] + hdr[o + 1] + hdr[o + 2] <= 0) continue
      const f = d * d * k
      hdr[o] += color[0] * f * 0.1
      hdr[o + 1] += color[1] * f * 0.1
      hdr[o + 2] += color[2] * f * 0.1
    }
}

// The radar scope's face: faint range rings and crosshairs, a sweep with a fading afterglow, and a few blips that
// light as it passes. Returns the box it drew in.
function radarScope(hdr: Float32Array, W: number, H: number, cx: number, cy: number, rx: number, ry: number, sweep: number, color: RGB) {
  const x0 = Math.max(0, Math.floor(cx - rx))
  const x1 = Math.min(W - 1, Math.ceil(cx + rx))
  const y0 = Math.max(0, Math.floor(cy - ry))
  const y1 = Math.min(H - 1, Math.ceil(cy + ry))
  const s = sweep % TAU
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      const u = (x + 0.5 - cx) / rx
      const v = (y + 0.5 - cy) / ry
      const r = Math.hypot(u, v)
      if (r >= 1) continue
      const edge = smoothstep(1, 0.9, r)
      const a = Math.atan2(u, -v)
      let behind = (s - a) % TAU
      if (behind < 0) behind += TAU
      // A soft leading edge and a long fading tail.
      const glow = Math.exp(-behind / 0.9) * smoothstep(TAU, TAU - 0.15, behind) * 0.22
      const ring = Math.max(Math.exp(-(((r - 0.5) / 0.04) ** 2)), Math.exp(-(((r - 0.85) / 0.04) ** 2))) * 0.05
      let blip = 0
      for (let b = 0; b < BLIPS.length; b += 2) {
        const d = Math.hypot(u - BLIPS[b], v - BLIPS[b + 1])
        if (d > 0.12) continue
        let since = (s - Math.atan2(BLIPS[b], -BLIPS[b + 1])) % TAU
        if (since < 0) since += TAU
        blip = Math.max(blip, Math.exp(-((d / 0.07) ** 2)) * Math.exp(-since / 2.5) * 0.9)
      }
      const k = (glow + ring + blip) * edge
      const o = (y * W + x) * 3
      hdr[o] += color[0] * k
      hdr[o + 1] += color[1] * k
      hdr[o + 2] += color[2] * k
    }
  return [x0, y0, x1, y1]
}

const BLIPS = [0.4, -0.3, -0.55, 0.2, 0.15, 0.6, -0.2, -0.65]

function rowHeight(d: number) {
  return Math.max(0.005, d * 0.17 + 0.003)
}

// For each pixel of a grid sampled two by two: its commonest triangle, the next, how much of the next among those
// that hit, and how much of the pixel any triangle covers (none above the horizon).
function resolveSamples(ids: Int32Array, W: number, H: number, idA: Int32Array, idB: Int32Array, mix: Float32Array, cov: Float32Array) {
  const SW = W * 2
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const o = y * 2 * SW + x * 2
      const s0 = ids[o]
      const s1 = ids[o + 1]
      const s2 = ids[o + SW]
      const s3 = ids[o + SW + 1]
      const i = y * W + x
      const hit = (s0 >= 0 ? 1 : 0) + (s1 >= 0 ? 1 : 0) + (s2 >= 0 ? 1 : 0) + (s3 >= 0 ? 1 : 0)
      cov[i] = hit / 4
      if (!hit) continue
      const first = s0 >= 0 ? s0 : s1 >= 0 ? s1 : s2 >= 0 ? s2 : s3
      const second = s1 >= 0 && s1 !== first ? s1 : s2 >= 0 && s2 !== first ? s2 : s3 >= 0 && s3 !== first ? s3 : first
      const n0 = (s0 === first ? 1 : 0) + (s1 === first ? 1 : 0) + (s2 === first ? 1 : 0) + (s3 === first ? 1 : 0)
      const n1 = hit - n0
      idA[i] = n0 >= n1 ? first : second
      idB[i] = n0 >= n1 ? second : first
      mix[i] = Math.min(n0, n1) / hit
    }
}

function stitch(a: number[], b: number[], xs: number[], tris: number[]) {
  let i = 0
  let j = 0
  while (i < a.length - 1 || j < b.length - 1) {
    if (j >= b.length - 1 || (i < a.length - 1 && xs[a[i + 1]] < xs[b[j + 1]])) {
      tris.push(a[i], a[i + 1], b[j])
      i++
      continue
    }
    tris.push(a[i], b[j + 1], b[j])
    j++
  }
}

function rasterTri(ids: Int32Array, W: number, H: number, ax: number, ay: number, bx: number, by: number, cx: number, cy: number, id: number) {
  const x0 = Math.max(0, Math.floor(Math.min(ax, bx, cx)))
  const x1 = Math.min(W - 1, Math.ceil(Math.max(ax, bx, cx)))
  const y0 = Math.max(0, Math.floor(Math.min(ay, by, cy)))
  const y1 = Math.min(H - 1, Math.ceil(Math.max(ay, by, cy)))
  const area = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax)
  if (area === 0) return
  const sign = area > 0 ? 1 : -1
  for (let y = y0; y <= y1; y++) {
    const py = y + 0.5
    for (let x = x0; x <= x1; x++) {
      const px = x + 0.5
      const w0 = ((bx - ax) * (py - ay) - (by - ay) * (px - ax)) * sign
      const w1 = ((cx - bx) * (py - by) - (cy - by) * (px - bx)) * sign
      const w2 = ((ax - cx) * (py - cy) - (ay - cy) * (px - cx)) * sign
      if (w0 >= 0 && w1 >= 0 && w2 >= 0) ids[y * W + x] = id
    }
  }
}

// Shades every facet from its tilted normal: the water's own color, the sky it mirrors, glitter toward the sun or
// moon, and the storm's dark green-gray.
// The facets live in Wings' own units; the sky they mirror and the sun or moon they glitter toward are scaled by WS.
function shadeFacets(X: Float32Array, Z: Float32Array, Y: Float32Array, tris: Int32Array, colors: Float32Array, sky: Float32Array, H: number, ox: number, oy: number, deep: RGB, lit: RGB, spec: RGB, glitter: number, spread: readonly [number, number], storm: RGB, gloom: number) {
  const top = Math.ceil(HORIZON * H) - 1
  for (let t = 0, f = 0; t < tris.length; t += 3, f += 3) {
    const a = tris[t]
    const b = tris[t + 1]
    const c = tris[t + 2]
    const e1x = X[b] - X[a]
    const e1y = Y[b] - Y[a]
    const e1z = Z[b] - Z[a]
    const e2x = X[c] - X[a]
    const e2y = Y[c] - Y[a]
    const e2z = Z[c] - Z[a]
    let nx = e1y * e2z - e1z * e2y
    let ny = e1z * e2x - e1x * e2z
    let nz = e1x * e2y - e1y * e2x
    if (ny < 0) {
      nx = -nx
      ny = -ny
      nz = -nz
    }
    const tilt = Math.hypot(nx, nz) / Math.max(1e-9, ny)
    if (tilt > 0.7) {
      nx *= 0.7 / tilt
      nz *= 0.7 / tilt
    }
    const nl = Math.hypot(nx, ny, nz) || 1
    nx /= nl
    ny /= nl
    nz /= nl
    const px = (X[a] + X[b] + X[c]) / 3
    const pz = (Z[a] + Z[b] + Z[c]) / 3
    let vx = -px
    let vy = CAMERA
    let vz = -pz
    const vl = Math.hypot(vx, vy, vz)
    vx /= vl
    vy /= vl
    vz /= vl
    const ndv = Math.max(0, nx * vx + ny * vy + nz * vz)
    const rx = 2 * ndv * nx - vx
    const ry = 2 * ndv * ny - vy
    const rz = 2 * ndv * nz - vz
    const row = ry <= 0 || rz <= 0 ? top : clamp(Math.round((HORIZON - (WS * FOCAL * ry) / rz) * H), 0, top)
    const fres = 0.12 + 0.88 * (1 - ndv) ** 3
    const gx = rz > 0.01 ? (FOCAL * rx) / rz - ox : 9
    const gy = rz > 0.01 ? -(FOCAL * ry) / rz - oy : 9
    const s = Math.exp(-((gx / spread[0]) ** 2) - (gy / spread[1]) ** 2) * glitter * (0.3 + 0.7 * smoothstep(2, 6, pz))
    const diffuse = clamp(0.5 + nx * 1.6 - nz * 0.8, 0, 1)
    for (let k = 0; k < 3; k++) {
      const body = deep[k] + (lit[k] - deep[k]) * diffuse
      const v = (body * (1 - fres) + sky[row * 3 + k] * fres * 0.7) * (1 - Math.min(1, s) * 0.75) + spec[k] * s
      colors[f + k] = v + (storm[k] - v) * gloom
    }
  }
}

// Paints the sea's rows from the facet colors, as much of each pixel as the facets cover and the ship leaves open.
function fillSea(hdr: Float32Array, W: number, y0: number, idA: Int32Array, idB: Int32Array, mix: Float32Array, cov: Float32Array, open: Float32Array, colors: Float32Array) {
  const base = y0 * W * 3
  for (let i = 0; i < idA.length; i++) {
    const w = open[i] * cov[i]
    if (w <= 0) continue
    const a = idA[i] * 3
    const b = idB[i] * 3
    const k = mix[i]
    const o = base + i * 3
    for (let c = 0; c < 3; c++) {
      const v = colors[a + c] + (colors[b + c] - colors[a + c]) * k
      hdr[o + c] += (v - hdr[o + c]) * w
    }
  }
}

function trail(hdr: Float32Array, W: number, H: number, hx: number, hy: number, tx: number, ty: number, width: number, color: RGB, k: number) {
  const dx = tx - hx
  const dy = ty - hy
  const len2 = dx * dx + dy * dy || 1
  const x0 = Math.max(0, Math.floor(Math.min(hx, tx) - width - 1))
  const x1 = Math.min(W - 1, Math.ceil(Math.max(hx, tx) + width + 1))
  const y0 = Math.max(0, Math.floor(Math.min(hy, ty) - width - 1))
  const y1 = Math.min(H - 1, Math.ceil(Math.max(hy, ty) + width + 1))
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      const px = x + 0.5 - hx
      const py = y + 0.5 - hy
      const t = clamp((px * dx + py * dy) / len2, 0, 1)
      const d = Math.hypot(px - dx * t, py - dy * t)
      const a = Math.max(0, 1 - d / (width * (1 + t))) * (1 - t) * k
      if (a <= 0) continue
      const o = (y * W + x) * 3
      hdr[o] += (color[0] - hdr[o]) * a
      hdr[o + 1] += (color[1] - hdr[o + 1]) * a
      hdr[o + 2] += (color[2] - hdr[o + 2]) * a
    }
}

export const wingsBridge: Wallpaper = {
  id: "wings-bridge",
  name: "Wings: Bridge",
  description: "A modern carrier's bridge, its displays, comms and helm around windows on the flight deck and a low-poly sea, from Anomaly Arcade's Wings",
  collection: "Arcade",
  activity: {
    calm: "The bridge's displays and lit keys, the radar sweep, a headset cord swaying, and the sea on a slow swell beyond the deck",
    lively: "Adds deck crew walking and a jet launching off the bow now and then",
    teeming: "Adds launches more often, a jet landing now and then and escort ships on the horizon",
  },
  scrim: {
    day: [
      [14, 26, 46],
      [20, 44, 78],
      [10, 12, 18],
    ],
    sunset: [
      [20, 16, 38],
      [60, 34, 58],
      [14, 10, 20],
    ],
    night: [
      [3, 4, 12],
      [4, 8, 22],
      [8, 3, 6],
    ],
  },
  create: (settings) => new WingsBridge(settings),
}
