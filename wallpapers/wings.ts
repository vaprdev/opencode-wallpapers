import { Canvas, cap, type Lighting, type Part } from "../src/canvas"
import { eggWait } from "../src/egg"
import { lightPool } from "../src/light"
import { TAU, clamp, hash, hash2, lerp, rand, smoothstep, type RGB } from "../src/math"
import { makeStars, makeStorm, paintSky, paintStars, paintStorm, driftClouds, type Orb, type Star } from "../src/sky"
import type { Activity, Settings, Time, Wallpaper } from "../src/wallpaper"
import { WeatherLayer } from "../src/weather"

// An homage to Wings, Anomaly Arcade's flight game: a carrier on a low-poly sea below a volcano island, with jets
// launching off its deck.

// The scene runs slower than real time, which keeps it calm behind text.
const TIME_SCALE = 0.35
const HORIZON = 0.47
// The sea's camera: its height over the water and focal length, in screen heights.
const CAMERA = 1
const FOCAL = 1
// The carrier's deck in its own perspective: the stern's screen row and half-width, the bow's distance relative to the
// stern's, and the row everything on it vanishes toward.
const STERN = 0.87
const BEAM = 0.115
const BOW = 0.45
const VANISH = 0.02
// How long a jet launch, a landing, the A-10 and B-2 passes and the flyover last, in scene seconds.
const LAUNCH = 7
const LANDING = 8
const SPARKLE = 2.2
// The two bow catapults, across the deck.
const CATAPULTS = [-0.1, 0.08]
// How many of the sea's rows slide toward the viewer per scene second.
const ROW_RATE = 0.16
// The hull's waterline below the deck, in deck heights.
const WATERLINE = -0.42

type Point = readonly [number, number]

// What changes with the time of day. The sea gets its own colors; aircraft and the carrier one daytime color each,
// darkened by tint.
interface Look {
  sky: [number, RGB][]
  orb: Orb
  // The sun or moon's x, in screen heights from the middle.
  orbX: number
  stars: number
  cloud: [lit: RGB, shade: RGB]
  sea: [deep: RGB, lit: RGB]
  glitter: number
  // How far from the sun or moon, across and up and down in screen heights, a facet's reflection still glitters.
  spread: readonly [number, number]
  spec: RGB
  tint: RGB
  // Faces of the islands and the carrier turned toward the light, and away from it.
  key: RGB
  lamp: number
  trail: RGB
  // The wake's churned water: pale by day, tinted teal at night.
  foam: RGB
  storm: RGB
  night: boolean
}

const LOOKS: Record<Time, Look> = {
  day: {
    sky: [
      [0, [0.07, 0.27, 0.72]],
      [0.25, [0.2, 0.47, 0.88]],
      [HORIZON, [0.62, 0.82, 0.96]],
    ],
    orb: { x: 0, y: 0.13, r: 0.035, core: [5, 4.6, 3.8], glow: [1, 0.95, 0.8], near: 0.45, wide: 0.12 },
    orbX: -0.55,
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
    night: false,
  },
  sunset: {
    sky: [
      [0, [0.12, 0.2, 0.55]],
      [0.2, [0.3, 0.32, 0.72]],
      [0.34, [0.75, 0.42, 0.62]],
      [0.42, [1.1, 0.55, 0.5]],
      [HORIZON, [1.25, 0.72, 0.45]],
    ],
    orb: { x: 0, y: 0.45, r: 0.04, core: [3, 1.7, 1], glow: [1.1, 0.5, 0.35], near: 0.5, wide: 0.25 },
    orbX: -0.32,
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
    night: false,
  },
  night: {
    sky: [
      [0, [0.004, 0.01, 0.04]],
      [0.25, [0.015, 0.035, 0.11]],
      [HORIZON, [0.05, 0.11, 0.3]],
    ],
    orb: { x: 0, y: 0.13, r: 0.034, core: [1.25, 0.95, 0.42], glow: [0.5, 0.38, 0.15], near: 0.3, wide: 0.1, moon: true },
    orbX: -0.3,
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
    night: true,
  },
}

// Daytime colors.
const HULL: RGB = [0.36, 0.38, 0.42]
const DECK: RGB = [0.2, 0.21, 0.23]
const STRIPE: RGB = [0.85, 0.85, 0.8]
const YELLOW: RGB = [0.85, 0.66, 0.12]
const JET: RGB = [0.5, 0.53, 0.58]
const WARTHOG: RGB = [0.24, 0.28, 0.26]
const SPIRIT: RGB = [0.13, 0.14, 0.17]
const FOREST: RGB = [0.1, 0.3, 0.1]
const ROCK: RGB = [0.3, 0.27, 0.22]
const AMBER: RGB = [2, 1.05, 0.3]
const BURNER: RGB = [2.6, 1.15, 0.35]

// A cloud: lumps heaped along a flat base, in units of its size.
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

// A premultiplied RGBA sprite cropped to a box at (x, y) on screen.
interface Hull {
  x: number
  y: number
  w: number
  h: number
  rgba: Float32Array
}

// A launch or landing: its age in scene seconds, which way it banks away, and the catapult it launches from (u).
interface Jet {
  kind: "launch" | "landing"
  t: number
  side: number
  cat: number
}

// Air traffic crossing the screen: progress from 0 to 1 over span scene seconds, its row, which way it flies, its size
// in screen heights, and how many fly together.
interface Traffic {
  kind: "formation" | "break" | "cargo" | "tanker" | "helo" | "flock"
  t: number
  span: number
  y: number
  dir: number
  size: number
  n: number
  seed: number
}

// A boat at rest on the water, which the sea carries toward the viewer as the carrier sails on: its distance below
// the horizon (d, screen heights) and its offset across the water.
interface Boat {
  d: number
  x: number
  seed: number
}

// A crossing: progress from 0 to 1 (negative while waiting), how many scene seconds it takes, and its row.
interface Flier {
  t: number
  wait: number
  span: number
  y: number
  dir: number
}

class Wings extends Canvas {
  private time = 0
  private readonly activity: Activity
  private readonly look: Look
  private readonly weather: WeatherLayer
  private orb: Orb
  private stars: Star[]
  private clouds: Cloud[]
  private storm = makeStorm()
  // The sea: a mesh of rows of jittered vertices between the horizon and the bottom, stitched into triangles; each
  // vertex's ground position, wave amplitude and rate; and, per pixel of the sea's rows, the two triangles under its
  // corners, how much of the second, and how much sea shows past the islands and the carrier.
  private mesh = { X: new Float32Array(0), Z: new Float32Array(0), height: new Float32Array(0), tris: new Int32Array(0), colors: new Float32Array(0) }
  private sea: { y0: number; rows: Float64Array; ids: Int32Array; idA: Int32Array; idB: Int32Array; mix: Float32Array; open: Float32Array; glow: Float32Array; sky: Float32Array } = { y0: 0, rows: new Float64Array(0), ids: new Int32Array(0), idA: new Int32Array(0), idB: new Int32Array(0), mix: new Float32Array(0), open: new Float32Array(0), glow: new Float32Array(0), sky: new Float32Array(0) }
  private jets: Jet[] = []
  private nextLaunch: number
  private nextLanding = 12
  private warthog: Flier = { t: -1, wait: 11, span: 13, y: 0.57, dir: 1 }
  private spirit: Flier = { t: -1, wait: 3, span: 40, y: 0.11, dir: -1 }
  private flyover = { t: -1, dir: 1, y: 0.16 }
  private egg = { wait: eggWait() * TIME_SCALE, t: -1 }
  private sparkles: { x: number; y: number; age: number; seed: number }[] = []
  private drops = new Float32Array(160 * 3)
  // Deck and island lights: positions in pixels, colors, and which blink.
  private lamps: { x: number; y: number; color: RGB; blink: number; size: number }[] = []
  // The carrier, painted once per size into a sprite that each frame bobs, rolls and pitches about its middle and
  // drifts slowly side to side as it steers. hull is from the supersampled pass, waiting for the real one.
  private hull: Hull | undefined
  private hullFine: Hull | undefined
  private ship = { x: 0, y: 0, dx: 0, dy: 0, roll: 0, pitch: 0 }
  private traffic: Traffic[] = []
  private nextTraffic = 2
  private boats: Boat[] = []
  // A dolphin leaping beside the carrier (t from 0 to 1 over a leap) and a whale's spout far off, each waiting between.
  private dolphin = { t: -1, wait: 4, x: 0, d: 0, dir: 1 }
  private spout = { t: -1, wait: 10, x: 0, d: 0 }
  // A jet taxiing from where they park to a catapult, which then launches it.
  private taxi = { t: 0, wait: 0 }

  constructor(settings: Settings) {
    super()
    this.activity = settings.activity
    this.weather = new WeatherLayer(settings.weather ?? "clear", settings.time, HORIZON)
    const look = LOOKS[settings.time]
    this.look = this.weather.covered ? { ...look, glitter: look.glitter * 0.12 } : look
    this.orb = look.orb
    if (settings.time === "day") this.frame = 0.3
    this.stars = makeStars(look.stars, HORIZON - 0.04)
    this.clouds = makeLowPolyClouds(settings.time === "day" ? 8 : 7)
    this.nextLaunch = settings.activity === "teeming" ? 1 : 5
    // The scene starts with its traffic already about, rather than an empty sky filling up.
    const crossing = { calm: 0, lively: 5, teeming: 12 }[settings.activity]
    for (let i = 0; i < crossing; i++) this.traffic.push(this.makeTraffic(rand(0.1, 0.8)))
    const boats = { calm: 0, lively: 2, teeming: 4 }[settings.activity]
    for (let i = 0; i < boats; i++) this.boats.push(makeBoat(rand(0.02, 0.25)))
    for (let i = 0; i < this.drops.length; i += 3) {
      this.drops[i] = Math.random()
      this.drops[i + 1] = Math.random()
      this.drops[i + 2] = Math.random()
    }
  }

  step(dt: number) {
    dt = clamp(dt, 0, 0.1) * TIME_SCALE
    this.time += dt
    for (const c of this.clouds) {
      c.x += c.speed * dt
      if (c.x > this.A + c.size) c.x = -c.size
    }
    if (this.gloom > 0) driftClouds(this.storm, this.A, dt)
    this.stepGloom(dt)
    this.weather.step(dt)
    this.stepShip()
    this.stepJets(dt)
    const teeming = this.activity === "teeming"
    this.stepFlier(this.warthog, dt, this.activity !== "calm", teeming ? 18 : 45, teeming ? 30 : 70, () => this.openRow(0.53, 0.6))
    this.stepFlier(this.spirit, dt, teeming, 30, 50, () => rand(0.07, 0.14))
    this.stepTraffic(dt)
    this.stepSea(dt)
    this.stepTaxi(dt)
    if (this.flyover.t >= 0) this.flyover.t = this.flyover.t + dt > 14 ? -1 : this.flyover.t + dt
    const e = this.egg
    if (e.t >= 0) e.t = e.t + dt > 12 ? -1 : e.t + dt
    if (e.t < 0) {
      e.wait -= dt
      if (e.wait <= 0) {
        e.t = 0
        e.wait = eggWait(true) * TIME_SCALE
      }
    }
    for (const s of this.sparkles) s.age += dt
    this.sparkles = this.sparkles.filter((s) => s.age < SPARKLE)
    if (this.gloom > 0)
      for (let i = 0; i < this.drops.length; i += 3) {
        this.drops[i + 1] += (1.3 + this.drops[i + 2]) * dt
        this.drops[i] += 0.1 * dt
        if (this.drops[i + 1] > 1.05) {
          this.drops[i + 1] -= 1.1
          this.drops[i] = Math.random()
        }
      }
  }

  // A click in the sky sends a jet off the deck; on the water it sets off a burst of sparkles.
  poke(x: number, y: number) {
    if (y > HORIZON + 0.02) {
      this.sparkles.push({ x, y, age: 0, seed: Math.random() * 100 })
      return
    }
    this.launch()
  }

  protected override visit() {
    if (this.flyover.t < 0) this.flyover = { t: 0, dir: Math.random() < 0.5 ? 1 : -1, y: rand(0.1, 0.17) }
  }

  render() {
    this.restore()
    const { W, H, look } = this
    if (!this.weather.covered && look.stars) paintStars(this.hdr, W, H, this.stars, this.time, HORIZON - 0.04, look.night ? 0.55 : 0.25, this.points)
    this.drawClouds()
    paintStorm(this.hdr, W, H, this.storm, look.cloud[0], look.cloud[1], this.gloom)
    if (this.spirit.t >= 0) this.drawSpirit(this.spirit)
    if (this.flyover.t >= 0) this.drawFlyover()
    this.drawSea()
    this.drawWake()
    if (this.activity !== "calm") this.drawSeaTraffic()
    this.drawSparkles()
    if (this.warthog.t >= 0) this.drawWarthog(this.warthog)
    this.drawHull()
    this.drawLamps()
    if (this.activity !== "calm") this.drawDeck()
    if (this.activity !== "calm") this.drawHelicopters()
    if (this.activity !== "calm") this.drawGulls()
    for (const j of this.jets) this.drawJet(j)
    if (this.activity !== "calm") this.drawCircling()
    for (const c of this.traffic) this.drawTraffic(c)
    if (this.egg.t >= 0) this.drawEgg()
    if (this.gloom > 0) this.drawRain()
    this.weather.draw(this.hdr, W, H)
    this.finish()
  }

  // The sky and islands never move, so they're painted once per size; the sea is drawn over them each frame wherever it
  // shows, and the carrier, painted once into a sprite, over the sea.
  protected override layout() {
    const { W, H, A, look } = this
    this.orb = { ...look.orb, x: (A / 2 + look.orbX) / A }
    paintSky(this.hdr, W, H, look.sky, this.orb, this.px)
    this.weather.cover(this.hdr, W, H)
    // What the sea mirrors: the sky's average color on each row above the horizon.
    const sky = new Float32Array(H * 3)
    for (let y = 0; y < Math.ceil(HORIZON * H); y++)
      for (let x = 0; x < W; x += 2) for (let c = 0; c < 3; c++) sky[y * 3 + c] += this.hdr[(y * W + x) * 3 + c] / Math.ceil(W / 2)
    this.buildSea(sky)
    // The sea at rest under everything that stands in it, so their edges blend into water.
    this.shadeSea()
    fillSea(this.hdr, W, this.sea.y0, this.sea.idA, this.sea.idB, this.sea.mix, undefined, this.mesh.colors, undefined)
    this.drawIslands()
    if (this.activity === "teeming") this.drawEscorts()
    this.paintHull()
    this.placeLamps()
    // How much sea shows in each pixel: everything above drawn again, flat, into a blank buffer.
    const hdr = this.hdr
    this.hdr = new Float32Array(W * H * 3)
    this.drawIslands(true)
    if (this.activity === "teeming") this.drawEscorts(true)
    const open = new Float32Array(this.sea.idA.length)
    for (let i = 0; i < open.length; i++) open[i] = 1 - clamp(this.hdr[(this.sea.y0 * W + i) * 3], 0, 1)
    this.hdr = hdr
    this.sea.open = open
    // At night the deck lights spill a warm pool onto the water around the hull.
    const glow = new Float32Array(open.length * 3)
    if (look.lamp > 0.5) {
      const cx = (A / 2) * H
      for (let i = 0; i < open.length; i++) {
        const x = i % W
        const y = this.sea.y0 + Math.floor(i / W)
        const d = ((x - cx) / (0.3 * H)) ** 2 + ((y - (STERN - 0.1) * H) / (0.17 * H)) ** 2
        const k = Math.max(0, 1 - d) ** 2 * 0.05 * look.lamp
        glow[i * 3] = AMBER[0] * k
        glow[i * 3 + 1] = AMBER[1] * k
        glow[i * 3 + 2] = AMBER[2] * k
      }
    }
    this.sea.glow = glow
    this.sea.sky = sky
    for (const c of this.clouds) c.sprite = cloudSprite(c, H, this.weather.scud ?? look.cloud, this.orb.x * A - c.x)
  }

  private paint(c: RGB): RGB {
    const t = this.look.tint
    return [c[0] * t[0], c[1] * t[1], c[2] * t[2]]
  }

  // The sea's rows: from the horizon down, each row a little taller than the last, as a table of row heights below the
  // horizon (d) and the pixel buffers the facets are drawn through.
  private buildSea(sky: Float32Array) {
    const { W, H } = this
    const rows = [0]
    while (rows[rows.length - 1] < 1.1 - HORIZON) rows.push(rows[rows.length - 1] + rowHeight(rows[rows.length - 1]))
    const y0 = Math.floor(HORIZON * H)
    const n = W * (H - y0)
    this.sea = { ...this.sea, y0, rows: Float64Array.from(rows), ids: new Int32Array(n * 4), idA: new Int32Array(n), idB: new Int32Array(n), mix: new Float32Array(n), sky }
  }

  // The mesh this frame. Rows of jittered vertices slide down the table of rows toward the viewer, a row at a time, as
  // the carrier sails on: each vertex keeps its identity (column, and row counted from when it rose at the horizon), so
  // its jitter and swell travel with it, and its columns spread apart as it nears, as on water seen in perspective.
  // Neighboring rows are zipped into triangles and rasterized at two samples a pixel each way; each pixel keeps its two
  // commonest triangles.
  private meshSea() {
    const { W, H, A } = this
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
      const w = Math.max(0.018, h * 2.3)
      const row: number[] = []
      const i0 = Math.floor((-0.25 - A / 2) / w)
      const i1 = Math.ceil((A / 2 + 0.25) / w)
      for (let i = i0; i <= i1; i++) {
        row.push(xs.length)
        xs.push(A / 2 + (i + (hash2(i, q) - 0.5) * 0.7) * w)
        ys.push(HORIZON + d + (hash2(i + 71, q) - 0.5) * 0.3 * h)
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
      const z = (FOCAL * CAMERA) / Math.max(0.002, ys[i] - HORIZON)
      m.Z[i] = z
      m.X[i] = ((xs[i] - A / 2) * z) / FOCAL
      // Calmer toward the horizon, where the facets get smaller than a cell.
      const amp = Math.max(0.018, rowHeight(ds[i]) * 2.3) * 0.45 * smoothstep(0.004, 0.08, ds[i])
      const id = ids[i]
      m.height[i] = amp * ((hash(id) - 0.5) * 1.6 + 0.3 * Math.sin(t * (0.5 + hash(id + 0.5) * 0.6) + hash(id + 0.3) * TAU))
    }
    m.tris = Int32Array.from(tris)
    if (m.colors.length < tris.length) m.colors = new Float32Array(tris.length * 2)
    const y0 = sea.y0
    const SW = W * 2
    const SH = (H - y0) * 2
    sea.ids.fill(-1)
    for (let k = 0; k < tris.length; k += 3) {
      const a = tris[k]
      const b = tris[k + 1]
      const c = tris[k + 2]
      rasterTri(sea.ids, SW, SH, xs[a] * H * 2, (ys[a] * H - y0) * 2, xs[b] * H * 2, (ys[b] * H - y0) * 2, xs[c] * H * 2, (ys[c] * H - y0) * 2, k / 3)
    }
    resolveSamples(sea.ids, W, H - y0, sea.idA, sea.idB, sea.mix)
  }

  // Each facet's color this frame: the sea's own color lit from above, the sky it mirrors (more at grazing angles), the
  // sun or moon glittering in facets tilted just right, and the storm's dark green-gray after an error.
  private shadeSea() {
    const { H, A, look } = this
    const m = this.mesh
    this.meshSea()
    shadeFacets(m.X, m.Z, m.height, m.tris, m.colors, this.sea.sky, H, this.orb.x * A - A / 2, this.orb.y, look.sea[0], look.sea[1], look.spec, look.glitter * (1 - 0.8 * this.gloom), look.spread, look.storm, smoothstep(0, 1, this.gloom) * 0.7)
  }

  private drawSea() {
    this.shadeSea()
    const s = this.sea
    fillSea(this.hdr, this.W, s.y0, s.idA, s.idB, s.mix, s.open, this.mesh.colors, s.glow)
    this.touch(0, s.y0, this.W - 1, this.H - 1)
  }

  // A volcano on its forested island behind the carrier, forested islets to the left and sea stacks to the right.
  private drawIslands(mask = false) {
    const { A, H } = this
    const color = (c: RGB, lit: number): RGB => (mask ? [1, 1, 1] : this.facet(c, lit))
    const P = (x: number, y: number): Point => [x * H, y * H]
    const vx = volcanoX(A)
    const base = HORIZON + 0.004
    // The island under the volcano, a long low hill.
    const hill: Point[] = [P(vx - 0.27, base), P(vx - 0.2, base - 0.02), P(vx - 0.1, base - 0.035), P(vx + 0.12, base - 0.035), P(vx + 0.22, base - 0.018), P(vx + 0.29, base)]
    this.polygon(hill, color(FOREST, 0.4))
    // The cone in faceted slices, lit on the side facing the light.
    const peak = P(vx - 0.01, HORIZON - 0.17)
    const feet = [-0.17, -0.1, -0.03, 0.05, 0.12, 0.18].map((dx) => P(vx + dx, base - 0.025))
    const lightSide = this.orb.x * A < vx ? -1 : 1
    // Faces drawn over a silhouette in their middle tone, so no sky shows through the seams between them.
    this.polygon([peak, ...feet], color(ROCK, 0.5))
    for (let i = 0; i + 1 < feet.length; i++) {
      const face = (i + 0.5) / (feet.length - 1) - 0.5
      this.polygon([peak, feet[i], feet[i + 1]], color(ROCK, 0.5 + face * lightSide * 0.9))
    }
    // Forest climbing the lower slopes, ragged with treetops.
    const slope = (dx: number) => base - 0.025 - (1 - Math.abs(dx + 0.01) / 0.175) * 0.17
    const forest: Point[] = [P(vx - 0.2, base)]
    for (let i = 0; i <= 24; i++) {
      const dx = -0.19 + (i / 24) * 0.39
      const top = Math.max(slope(dx) + 0.045, base - 0.075) - (i % 2 ? 0.006 : 0) - hash(i * 2.1) * 0.006
      forest.push(P(vx + dx, Math.min(top, base - 0.02)))
    }
    forest.push(P(vx + 0.21, base))
    this.polygon(forest, color(FOREST, 0.5 - lightSide * 0.1))
    for (let i = 0; i < 18; i++) {
      const dx = -0.22 + (i / 17) * 0.47
      const top = Math.max(slope(dx) + 0.05, base - 0.06) + hash(i * 5.3) * 0.02
      if (top > base - 0.012) continue
      const s = 0.012 + hash(i * 1.9) * 0.008
      this.polygon([P(vx + dx, top), P(vx + dx - s * 0.7, top + s * 1.4), P(vx + dx + s * 0.7, top + s * 1.4)], color(FOREST, hash(i) > 0.5 ? 0.75 : 0.3))
    }
    // A crater notch and a wisp of steam.
    this.polygon([P(vx - 0.022, HORIZON - 0.155), P(vx - 0.01, HORIZON - 0.17), P(vx + 0.004, HORIZON - 0.157), P(vx - 0.01, HORIZON - 0.15)], color(ROCK, 0.15))
    // Two forested islets on the left.
    for (const [x, w, h] of [[0.14, 0.09, 0.05], [0.27, 0.08, 0.045]] as const) {
      const pts = [P(x - w, base), P(x - w * 0.55, base - h * 0.55), P(x - w * 0.15, base - h), P(x + w * 0.2, base - h * 0.85), P(x + w * 0.6, base - h * 0.4), P(x + w, base)]
      this.polygon(pts, color(FOREST, 0.5))
      for (let i = 0; i + 1 < pts.length; i++) this.polygon([P(x, base), pts[i], pts[i + 1]], color(FOREST, 0.55 - ((i - 2) / 3) * lightSide * 0.5))
      for (let i = 0; i < 7; i++) {
        const dx = (i / 6 - 0.5) * w * 1.4
        const top = base - h * (1 - Math.abs(dx) / w) * 0.95
        this.polygon([P(x + dx, top - 0.01), P(x + dx - 0.009, top + 0.008), P(x + dx + 0.009, top + 0.008)], color(FOREST, hash(i + x) > 0.5 ? 0.7 : 0.35))
      }
    }
    // Sea stacks and a low reef on the right.
    const rx = A - 0.18
    for (const [dx, w, h] of [[-0.03, 0.012, 0.035], [-0.012, 0.009, 0.05], [0.004, 0.011, 0.042], [0.03, 0.008, 0.028]] as const) {
      this.polygon([P(rx + dx - w, base), P(rx + dx - w * 0.6, base - h), P(rx + dx + w * 0.3, base - h * 1.05), P(rx + dx + w, base)], color(ROCK, 0.45 + lightSide * dx * 8))
    }
    this.polygon([P(rx - 0.07, base), P(rx - 0.05, base - 0.008), P(rx + 0.06, base - 0.008), P(rx + 0.09, base)], color(FOREST, 0.4))
    // Far specks of islands near the volcano.
    for (const [x, w] of [[vx + 0.33, 0.025], [vx + 0.4, 0.015], [vx - 0.36, 0.02]] as const) this.polygon([P(x - w, base), P(x, base - 0.012), P(x + w, base)], color(ROCK, 0.3))
  }

  // A flat face lit by how squarely it faces the light (0 away, 1 toward), through the island's own key light.
  private facet(c: RGB, lit: number): RGB {
    const { look } = this
    const k = clamp(lit, 0, 1)
    if (!look.night && look.tint[0] === 1) return [c[0] * (0.45 + 0.75 * k), c[1] * (0.45 + 0.75 * k), c[2] * (0.45 + 0.75 * k)]
    const t = look.tint
    return [c[0] * t[0] * 2.4 + look.key[0] * 0.08 * k, c[1] * t[1] * 2.4 + look.key[1] * 0.08 * k, c[2] * t[2] * 2.4 + look.key[2] * 0.08 * k]
  }

  // Escort ships on the horizon, to either side.
  private drawEscorts(mask = false) {
    const { A, H } = this
    for (const [x, s] of [[A / 2 - 0.36, 0.05], [A / 2 - 0.2, 0.035], [A - 0.05, 0.04]] as const) {
      const y = HORIZON + 0.006
      const hull = mask ? ([1, 1, 1] as RGB) : this.paint(HULL)
      this.polygon([[(x - s) * H, (y - s * 0.12) * H], [(x + s) * H, (y - s * 0.12) * H], [(x + s * 0.85) * H, y * H], [(x - s * 0.8) * H, y * H]], hull)
      this.polygon([[(x - s * 0.25) * H, (y - s * 0.12) * H], [(x - s * 0.2) * H, (y - s * 0.4) * H], [(x + s * 0.15) * H, (y - s * 0.4) * H], [(x + s * 0.25) * H, (y - s * 0.12) * H]], hull)
      this.polygon([[(x - s * 0.02) * H, (y - s * 0.4) * H], [(x - s * 0.01) * H, (y - s * 0.7) * H], [(x + s * 0.01) * H, (y - s * 0.7) * H], [(x + s * 0.02) * H, (y - s * 0.4) * H]], hull)
    }
  }

  // Deck space to screen pixels: u across the deck (-1 to 1), v from stern (0) to bow (1), h up off the deck.
  private deck(u: number, v: number, h = 0): Point {
    const H = this.H
    const z = 1 + BOW * v
    return [(this.A / 2 + (u * BEAM) / z) * H, (VANISH + (STERN - VANISH) / z - (h * BEAM) / z) * H]
  }

  // The carrier from behind: its stern under the deck, the flight deck with its runway markings, and the island on the
  // starboard side with its mast. Its lights are drawn each frame.
  private drawCarrier(mask = false) {
    const D = (u: number, v: number, h = 0) => this.deck(u, v, h)
    const c = (color: RGB, k = 1): RGB => (mask ? [1, 1, 1] : this.paint([color[0] * k, color[1] * k, color[2] * k]))
    // The stern and the hull's starboard flank below the deck edge.
    this.polygon([D(-0.92, 0, 0), D(0.92, 0, 0), D(0.82, 0, -0.42), D(-0.82, 0, -0.42)], c(HULL, 0.8))
    this.polygon([D(0.92, 0, 0), D(0.95, 0.9, 0), D(0.8, 0.9, -0.42), D(0.82, 0, -0.42)], c(HULL, 0.55))
    this.polygon([D(-0.92, 0, 0), D(-0.95, 0.9, 0), D(-0.8, 0.9, -0.42), D(-0.82, 0, -0.42)], c(HULL, 0.45))
    // The flight deck, tapering a little at the bow, with a darker deck-edge rim.
    const outline = [D(-1, 0), D(1, 0), D(1, 0.88), D(0.8, 1.02), D(-0.8, 1.02), D(-1, 0.88)]
    this.polygon(outline, c(HULL, 0.6))
    this.polygon([D(-0.96, 0.01), D(0.96, 0.01), D(0.96, 0.87), D(0.77, 1.0), D(-0.77, 1.0), D(-0.96, 0.87)], c(DECK))
    if (mask) {
      this.drawIsland(true)
      return
    }
    // Runway: side lines, a dashed centerline, a yellow lineup line, and the stern's landing stripes.
    const line = (u0: number, v0: number, u1: number, v1: number, w: number, color: RGB, k = 1) => {
      this.polygon([D(u0 - w, v0), D(u0 + w, v0), D(u1 + w, v1), D(u1 - w, v1)], c(color, k))
    }
    line(-0.62, 0.05, -0.62, 0.97, 0.02, STRIPE, 0.8)
    line(0.42, 0.05, 0.42, 0.97, 0.02, STRIPE, 0.8)
    for (let v = 0.2; v < 0.95; v += 0.11) line(-0.1, v, -0.1, v + 0.06, 0.022, STRIPE, 0.9)
    line(0.2, 0.18, 0.2, 0.96, 0.012, YELLOW)
    line(-0.35, 0.3, -0.12, 0.96, 0.012, YELLOW, 0.9)
    for (let i = 0; i < 8; i++) {
      const u = -0.55 + i * 0.12
      this.polygon([D(u, 0.06), D(u + 0.07, 0.06), D(u + 0.07, 0.12), D(u, 0.12)], c(STRIPE, 0.85))
    }
    // The catapult tracks at the bow, and an elevator outline on the port side.
    line(-0.1, 0.62, -0.1, 0.98, 0.006, [0.1, 0.1, 0.1])
    line(0.08, 0.66, 0.08, 0.98, 0.006, [0.1, 0.1, 0.1])
    this.polygon([D(-0.98, 0.3), D(-0.8, 0.3), D(-0.8, 0.42), D(-0.98, 0.42)], c(DECK, 0.75))
    // The stern's hangar opening.
    this.polygon([D(-0.25, 0, -0.08), D(0.25, 0, -0.08), D(0.25, 0, -0.2), D(-0.25, 0, -0.2)], this.look.night ? [0.25, 0.12, 0.03] : c([0.05, 0.05, 0.06]))
    this.drawIsland(false)
    // At night the deck lights wash the deck.
    if (this.look.lamp > 0.5) {
      const [cx, cy] = D(0, 0.45)
      lightPool(this.hdr, this.W, this.H, cx, cy, 0.18 * this.H, 0.12 * this.H, [1, 0.6, 0.25], 1.2, 0.01)
    }
  }

  // Lights: amber edge lights down both sides, centerline lights, stern lights, the island's windows and mast beacons,
  // in real pixels on the carrier at rest.
  private placeLamps() {
    const D = (u: number, v: number, h = 0) => this.deck(u, v, h)
    this.lamps = []
    const lamp = (p: Point, color: RGB, blink = 0, size = 1) => this.lamps.push({ x: p[0] / this.px, y: p[1] / this.px, color, blink, size })
    for (let v = 0.04; v < 0.99; v += 0.075) {
      lamp(D(-0.97, v), AMBER, 0, 1)
      lamp(D(0.97, v), AMBER, 0, 1)
    }
    for (let v = 0.16; v < 0.98; v += 0.1) lamp(D(-0.1, v + 0.03), [1.6, 1.2, 0.5], 0, 1)
    for (const u of [-0.7, -0.45, 0.45, 0.7]) lamp(D(u, 0, -0.05), AMBER, 0, 2)
    lamp(D(-0.97, 1.0), [0.3, 1.6, 0.5], 0.7, 2)
    lamp(D(0.97, 1.0), [1.8, 0.25, 0.15], 0.9, 2)
    lamp(D(0.82, 0.57, 2.1), [2, 0.3, 0.15], 1, 2)
    lamp(D(0.74, 0.44, 0.6), AMBER, 0, 1)
    lamp(D(0.88, 0.44, 0.6), AMBER, 0, 1)
    if (this.activity !== "calm") lamp(D(-0.4, 0.26), [0.3, 1.8, 0.6], 1.5, 2)
  }

  // Paints the carrier, and the jets parked on it, into the hull sprite: colors over black, so they come out
  // premultiplied, and the silhouette in white for coverage. The supersampled pass keeps its sprite, shrunk, for the
  // real pass to use.
  private paintHull() {
    const { W, H } = this
    if (this.px === 1 && this.hullFine) {
      this.hull = this.hullFine
      this.hullFine = undefined
      return
    }
    const hdr = this.hdr
    this.hdr = new Float32Array(W * H * 3)
    this.drawCarrier()
    if (this.activity !== "calm") this.drawParked()
    let color = this.hdr
    this.hdr = new Float32Array(W * H * 3)
    this.drawCarrier(true)
    let cover = this.hdr
    this.hdr = hdr
    if (this.px > 1) {
      color = this.shrink(color)
      cover = this.shrink(cover)
    }
    const w = W / this.px
    const h = H / this.px
    let [x0, y0, x1, y1] = [w, h, -1, -1]
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const o = (y * w + x) * 3
        if (cover[o] <= 0 && color[o] + color[o + 1] + color[o + 2] <= 0) continue
        x0 = Math.min(x0, x)
        y0 = Math.min(y0, y)
        x1 = Math.max(x1, x)
        y1 = Math.max(y1, y)
      }
    const sw = x1 - x0 + 1
    const sh = y1 - y0 + 1
    const rgba = new Float32Array(Math.max(0, sw * sh * 4))
    for (let y = 0; y < sh; y++)
      for (let x = 0; x < sw; x++) {
        const o = ((y + y0) * w + x + x0) * 3
        const d = (y * sw + x) * 4
        rgba[d] = color[o]
        rgba[d + 1] = color[o + 1]
        rgba[d + 2] = color[o + 2]
        rgba[d + 3] = clamp(cover[o], 0, 1)
      }
    const hull = { x: x0, y: y0, w: Math.max(0, sw), h: Math.max(0, sh), rgba }
    if (this.px > 1) this.hullFine = hull
    else this.hull = hull
  }

  // The carrier underway: a slow bob, roll and pitch on the swells, and a long, slow weave as it steers.
  private stepShip() {
    const t = this.time
    const H = this.H
    const [x, y] = this.deck(0, 0.45)
    this.ship = {
      x: x,
      y: y,
      dx: 0.008 * Math.sin(t * 0.04) * H,
      dy: (0.0015 * Math.sin(t * 0.6) + 0.0008 * Math.sin(t * 1.03 + 2)) * H,
      roll: 0.007 * Math.sin(t * 0.5 + 0.5),
      pitch: 0.006 * Math.sin(t * 0.55 + 1.7),
    }
  }

  // Where a point on the carrier at rest is now, as it rolls, pitches, bobs and weaves.
  private onShip(p: Point): Point {
    const s = this.ship
    const qx = p[0] - s.x
    const qy = (p[1] - s.y) * (1 + s.pitch)
    const c = Math.cos(s.roll)
    const n = Math.sin(s.roll)
    return [s.x + qx * c - qy * n + s.dx, s.y + qx * n + qy * c + s.dy]
  }

  private drawHull() {
    const h = this.hull
    if (!h || !h.w) return
    const s = this.ship
    const box = blitHull(this.hdr, this.W, this.H, h, s.x, s.y, s.dx, s.dy, s.roll, 1 + s.pitch)
    this.touch(box[0], box[1], box[2], box[3])
  }

  // The wake: water churned white (teal at night) along the hull, flaring off the bow, and trailing back from the
  // stern toward the viewer, streaming past at the sea's pace.
  private drawWake() {
    const { W, H, A, look } = this
    const s = this.ship
    const [, bowY] = this.deck(0, 1.2, WATERLINE)
    const x0 = Math.floor((A / 2) * H - 0.4 * H + s.dx)
    const x1 = Math.ceil((A / 2) * H + 0.4 * H + s.dx)
    const y0 = Math.floor(bowY + s.dy - 2)
    const box = wake(this.hdr, W, H, A, x0, x1, y0, (A / 2) * H + s.dx, s.dy, this.time * ROW_RATE * 0.17, look.foam, look.night ? 0.6 : 0.55)
    this.touch(box[0], box[1], box[2], box[3])
  }

  // The island superstructure: a block with its stern face and inboard side showing, a bridge window band, and a mast
  // with a radar bar.
  private drawIsland(mask: boolean) {
    const D = (u: number, v: number, h = 0) => this.deck(u, v, h)
    const c = (k: number): RGB => (mask ? [1, 1, 1] : this.paint([HULL[0] * k, HULL[1] * k, HULL[2] * k]))
    const [u0, u1, v0, v1, top] = [0.66, 0.96, 0.44, 0.68, 1]
    this.polygon([D(u0, v0, top), D(u1, v0, top), D(u1, v1, top), D(u0, v1, top)], c(1.15))
    this.polygon([D(u0, v0), D(u0, v1), D(u0, v1, top), D(u0, v0, top)], c(0.7))
    this.polygon([D(u0, v0), D(u1, v0), D(u1, v0, top), D(u0, v0, top)], c(0.9))
    // A second, narrower tier.
    // A narrower bridge tier with its window band.
    this.polygon([D(0.72, 0.5, top), D(0.92, 0.5, top), D(0.92, 0.5, top + 0.4), D(0.72, 0.5, top + 0.4)], c(0.85))
    this.polygon([D(0.72, 0.5, top), D(0.72, 0.64, top), D(0.72, 0.64, top + 0.4), D(0.72, 0.5, top + 0.4)], c(0.62))
    this.polygon([D(0.72, 0.5, top + 0.4), D(0.92, 0.5, top + 0.4), D(0.92, 0.64, top + 0.4), D(0.72, 0.64, top + 0.4)], c(1.1))
    if (!mask) this.polygon([D(0.73, 0.5, top + 0.3), D(0.91, 0.5, top + 0.3), D(0.91, 0.5, top + 0.2), D(0.73, 0.5, top + 0.2)], this.look.night ? [0.6, 0.3, 0.06] : c(0.3))
    // The mast and its radar crossbar.
    const w = 0.018
    this.polygon([D(0.82 - w, 0.57, top + 0.4), D(0.82 + w, 0.57, top + 0.4), D(0.82 + w * 0.5, 0.57, 2.1), D(0.82 - w * 0.5, 0.57, 2.1)], c(0.75))
    this.polygon([D(0.74, 0.57, 1.82), D(0.9, 0.57, 1.82), D(0.9, 0.57, 1.76), D(0.74, 0.57, 1.76)], c(0.75))
  }

  // Jets parked by the island.
  private drawParked() {
    for (const [u, v] of [[0.55, 0.36], [0.6, 0.72], [0.55, 0.82]] as const) {
      const [x, y] = this.deck(u, v, 0.08)
      const s = (0.13 * BEAM * this.H) / (1 + BOW * v)
      this.planform(x, y, s, -Math.PI / 2, 0.8, JETFORM, this.paint(JET))
    }
  }

  private drawLamps() {
    const look = this.look
    const flicker = this.gloom > 0.2 ? 1 - 0.6 * this.gloom * (hash(Math.floor(this.time * 6)) > 0.75 ? 1 : 0) : 1
    for (const [i, l] of this.lamps.entries()) {
      // By day only the beacons show.
      if (look.lamp < 0.5 && !l.blink) continue
      const pulse = l.blink ? 0.25 + 0.75 * Math.max(0, Math.sin(this.time * l.blink * 2 + i)) ** 4 : 0.85 + 0.15 * Math.sin(this.time * 0.6 + i * 1.3)
      const k = look.lamp * pulse * flicker * 0.55
      const [x, y] = this.onShip([l.x, l.y])
      // Lights glide with the carrier, so on cells they fade from cell to cell rather than hopping.
      if (this.cells) this.point(x, y, l.color[0] * k, l.color[1] * k, l.color[2] * k, l.size, true)
      else this.disc(x, y, (0.0018 + l.size * 0.0007) * this.H, l.color[0] * k, l.color[1] * k, l.color[2] * k, 1)
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

  // Jets launch off the bow now and then and climb away, and others come in over the stern to land. At teeming the
  // two catapults take turns every few seconds.
  private stepJets(dt: number) {
    for (const j of this.jets) j.t += dt
    this.jets = this.jets.filter((j) => j.t < (j.kind === "launch" ? LAUNCH : LANDING))
    if (this.activity === "calm") return
    const teeming = this.activity === "teeming"
    this.nextLaunch -= dt
    if (this.nextLaunch <= 0 && this.launch()) this.nextLaunch = teeming ? rand(1.5, 3) : rand(4, 7)
    this.nextLanding -= dt
    if (this.nextLanding <= 0 && !this.jets.some((j) => j.kind === "landing")) {
      this.jets.push({ kind: "landing", t: 0, side: 0, cat: 0 })
      this.nextLanding = teeming ? rand(6, 10) : rand(14, 22)
    }
  }

  // Sends a jet off whichever catapult is clear, if either is.
  private launch() {
    const cat = CATAPULTS.find((c) => !this.jets.some((j) => j.kind === "launch" && j.cat === c && j.t < 4))
    if (cat === undefined) return false
    this.jets.push({ kind: "launch", t: 0, side: Math.random() < 0.5 ? -1 : 1, cat })
    return true
  }

  // Where a jet is in deck space, how much it banks, and how hard its afterburners glow.
  private jetPath(j: Jet): { u: number; v: number; h: number; roll: number; burn: number; alpha: number } {
    const t = j.t
    if (j.kind === "launch") {
      // Spooling up on the catapult, shot down the deck, then climbing steeply away and banking off to one side.
      const spool = smoothstep(0, 1.5, t)
      const run = smoothstep(1.5, 3.5, t) ** 2
      const c = Math.max(0, t - 3.5)
      const v = lerp(0.22, 1.05, run) + c * 0.35 + c * c * 0.03
      const h = 0.08 + c * 0.8 + c * c * 0.9
      const u = j.cat + j.side * c * c * 0.3
      return { u, v, h, roll: j.side * smoothstep(0.3, 2, c) * 0.6, burn: spool, alpha: 1 - smoothstep(LAUNCH - 1, LAUNCH, t) }
    }
    // Gliding in from overhead behind the stern, touching down and rolling out, then taxiing away.
    const glide = smoothstep(0, 5, t)
    const roll = smoothstep(5, 7, t)
    const v = lerp(-0.9, 0.2, glide) + roll * 0.3
    const h = 0.08 + (1 - glide) ** 1.5 * 6.4
    return { u: lerp(0.6, -0.1, glide), v, h, roll: (1 - glide) * -0.3, burn: 0.15, alpha: smoothstep(0, 1, t) * (1 - smoothstep(LANDING - 1, LANDING, t)) }
  }

  // An aircraft's color: its daytime color darkened for the time of day, kept a little lighter than the sky at night so
  // it reads as a silhouette.
  private craft(c: RGB): RGB {
    // By day a little darker than life, so aircraft read as shapes against the bright sky.
    const k = this.look.night ? 3.2 : this.look.tint[0] === 1 ? 0.6 : 1
    const p = this.paint(c)
    return [p[0] * k, p[1] * k, p[2] * k]
  }

  // A jet seen from behind: twin canted tails, swept wings, wingtip lights, and two afterburners glowing amber.
  private drawJet(j: Jet) {
    const p = this.jetPath(j)
    const z = 1 + BOW * p.v
    const [x, y] = this.onShip(this.deck(p.u, p.v, p.h))
    const s = (BEAM * this.H) / z
    if (p.alpha <= 0 || y < -s || y > this.H + s) return
    const H = this.H
    const k = (0.35 + p.burn * 1.4) * p.alpha
    // The afterburners light the deck while the jet is on it, and glow around it in the air at night.
    if (p.h < 0.3 && p.burn > 0.3) lightPool(this.hdr, this.W, H, x, y + s * 0.1, s * 1.2, s * 0.45, [1, 0.5, 0.15], 2.2 * p.burn, 0.03 * p.burn)
    else if (this.look.lamp > 0.5) lightPool(this.hdr, this.W, H, x, y, s * 0.35, s * 0.3, [1, 0.5, 0.15], 0, 0.06 * k)
    if (s < 3) {
      this.splat(x, y, BURNER[0] * k * 0.5, BURNER[1] * k * 0.5, BURNER[2] * k * 0.5)
      return
    }
    // Climbing, it leaves a short glowing exhaust streak behind it.
    if (j.kind === "launch" && j.t > 3) {
      const q = this.jetPath({ ...j, t: j.t - 0.35 })
      const [tx, ty] = this.onShip(this.deck(q.u, q.v, q.h))
      const sq = lerp(0.55, 0.3, clamp(p.h / 4, 0, 1))
      trail(this.hdr, this.W, H, x, y + 0.5 * sq * s, tx, ty + 0.5 * sq * s, Math.max(0.8, 0.05 * s), this.look.lamp > 0.5 ? BURNER : this.look.trail, 0.5 * p.alpha)
      this.touch(Math.min(x, tx) - s * 0.1 - 2, Math.min(y, ty) - 2, Math.max(x, tx) + s * 0.1 + 2, Math.max(y, ty) + s * 0.3 + 2)
    }
    // Seen from above and behind, flatter the farther it climbs; its tails stand up off the airframe.
    const squash = lerp(0.55, 0.3, clamp(p.h / 4, 0, 1))
    this.planform(x, y, s, -Math.PI / 2, squash, JETFORM, this.craft(JET), p.alpha, p.roll)
    const ca = Math.cos(p.roll)
    const sa = Math.sin(p.roll)
    const Q = (a: number, b: number): Point => [x + (a * ca - b * sa) * s, y + (a * sa + b * ca) * s]
    const fin = this.craft([JET[0] * 0.7, JET[1] * 0.7, JET[2] * 0.75])
    const tail = 0.45 * squash
    for (const side of [-1, 1]) this.polygon([Q(side * 0.05, tail), Q(side * 0.06, tail - 0.08 * squash), Q(side * 0.12, tail - 0.24), Q(side * 0.1, tail - 0.25)], fin, p.alpha)
    for (const side of [-1, 1]) {
      const [bx, by] = Q(side * 0.035, 0.5 * squash)
      this.disc(bx, by, Math.max(1.2, 0.09 * s), BURNER[0] * 0.3 * k, BURNER[1] * 0.3 * k, BURNER[2] * 0.3 * k, 0.6)
      this.disc(bx, by, Math.max(0.8, 0.035 * s), BURNER[0] * k, BURNER[1] * k, BURNER[2] * k, 1)
      // Red to port, green to starboard.
      const [wx, wy] = Q(side * 0.42, 0.19 * squash)
      const nav = this.look.lamp * p.alpha * 0.7
      this.disc(wx, wy, Math.max(0.6, 0.014 * s), side < 0 ? 1.8 * nav : 0.2 * nav, side < 0 ? 0.25 * nav : 1.6 * nav, side < 0 ? 0.15 * nav : 0.5 * nav, 1)
    }
  }

  // An aircraft's outline seen from above or below, nose along heading, flattened by the view.
  private planform(x: number, y: number, s: number, heading: number, squash: number, form: readonly (readonly Point[])[], color: RGB, alpha = 1, roll = 0) {
    const cr = Math.cos(roll)
    const sr = Math.sin(roll)
    const fx = Math.cos(heading)
    const fy = Math.sin(heading) * squash
    const sx = -Math.sin(heading)
    const sy = Math.cos(heading) * squash
    for (const poly of form)
      this.polygon(
        poly.map(([a, b]) => {
          const px = (a * fx + b * sx) * s
          const py = (a * fy + b * sy) * s
          return [x + px * cr - py * sr, y + px * sr + py * cr] as const
        }),
        color,
        alpha,
      )
  }

  // Jets holding in wide, slow loops at several heights, clear of the text in the middle: farther ones higher and
  // smaller, the highest trailing contrails. At teeming an E-2 circles high with its radar dome turning.
  private drawCircling() {
    const { A, H, look } = this
    const loops = this.activity === "teeming" ? LOOPS : LOOPS.slice(0, 6)
    for (const [i, l] of loops.entries()) {
      const cx = l.cx < 0 ? A + l.cx : l.cx === 0 ? volcanoX(A) : l.cx
      const a = this.time * l.rate + l.phase
      const x = (cx + Math.cos(a) * l.rx) * H
      const y = (l.cy + Math.sin(a) * l.ry) * H
      const heading = Math.atan2(Math.cos(a) * l.ry * l.rate, -Math.sin(a) * l.rx * l.rate)
      const s = l.size * (1 + 0.25 * Math.sin(a)) * H
      if (l.cy < 0.1) {
        const b = a - Math.sign(l.rate) * 0.35
        const tx = (cx + Math.cos(b) * l.rx) * H
        const ty = (l.cy + Math.sin(b) * l.ry) * H
        trail(this.hdr, this.W, H, x, y, tx, ty, Math.max(0.7, 0.003 * H), look.trail, 0.3)
        this.touch(Math.min(x, tx) - 3, Math.min(y, ty) - 3, Math.max(x, tx) + 3, Math.max(y, ty) + 3)
      }
      this.planform(x, y, s, heading, 0.45, JETFORM, this.craft(JET), 1, -Math.sign(l.rate) * 0.25)
      this.navLights(x, y, s, heading, i)
    }
    if (this.activity !== "teeming") return
    // The E-2 Hawkeye: a slow, wide loop high over the left.
    const a = this.time * 0.04 + 2
    const x = (0.4 + Math.cos(a) * 0.3) * H
    const y = (0.085 + Math.sin(a) * 0.02) * H
    const heading = Math.atan2(Math.cos(a) * 0.02, -Math.sin(a) * 0.3)
    const s = 0.065 * H
    this.planform(x, y, s, heading, 0.4, CARGOFORM, this.craft(HAWKEYE))
    const dome = this.craft([HAWKEYE[0] * 0.8, HAWKEYE[1] * 0.8, HAWKEYE[2] * 0.85])
    this.ellipse(x - Math.cos(heading) * s * 0.05, y - 0.06 * s, 0.18 * s, 0.045 * s, dome[0], dome[1], dome[2], 1)
    this.navLights(x, y, s, heading, 11)
  }

  // Amber and red blinking lights on an aircraft at night, and a faint glow from its engines.
  private navLights(x: number, y: number, s: number, heading: number, seed: number) {
    const k = this.look.lamp
    if (k < 0.5) return
    const blink = Math.sin(this.time * 4 + seed * 1.7) > 0.6 ? 0.8 : 0.15
    const bx = x - Math.cos(heading) * s * 0.5
    const by = y - Math.sin(heading) * s * 0.2
    this.splat(bx, by, BURNER[0] * 0.25, BURNER[1] * 0.25, BURNER[2] * 0.25)
    this.splat(x, y, 1.6 * blink, 0.3 * blink, 0.12 * blink)
  }

  // A crossing, picked by how busy the scene is, starting t of the way across.
  private makeTraffic(t: number): Traffic {
    const kinds: Traffic["kind"][] = this.activity === "teeming" ? ["formation", "formation", "formation", "break", "break", "cargo", "tanker", "helo", "flock", "flock"] : ["formation", "formation", "break", "cargo", "flock", "helo"]
    const kind = kinds[Math.floor(Math.random() * kinds.length)]
    const dir = Math.random() < 0.5 ? 1 : -1
    const seed = Math.random() * 100
    if (kind === "formation") {
      const y = rand(0.05, 0.22)
      return { kind, t, span: rand(12, 18), y, dir, size: lerp(0.026, 0.06, (y - 0.05) / 0.17), n: 2 + Math.floor(Math.random() * 3), seed }
    }
    if (kind === "break") return { kind, t, span: rand(11, 15), y: rand(0.16, 0.26), dir, size: 0.065, n: 1, seed }
    if (kind === "cargo") return { kind, t, span: rand(34, 44), y: rand(0.12, 0.22), dir, size: 0.075, n: 1, seed }
    if (kind === "tanker") return { kind, t, span: rand(50, 60), y: rand(0.06, 0.1), dir, size: 0.06, n: 1, seed }
    if (kind === "helo") return { kind, t, span: rand(30, 40), y: this.openRow(0.5, 0.58), dir, size: 0.06, n: 1, seed }
    return { kind, t, span: rand(26, 34), y: rand(0.12, 0.3), dir, size: 0.016, n: 7 + Math.floor(Math.random() * 5), seed }
  }

  private stepTraffic(dt: number) {
    for (const c of this.traffic) c.t += dt / c.span
    this.traffic = this.traffic.filter((c) => c.t < 1)
    if (this.activity === "calm") return
    const teeming = this.activity === "teeming"
    this.nextTraffic -= dt
    if (this.nextTraffic > 0 || this.traffic.length >= (teeming ? 14 : 6)) return
    this.traffic.push(this.makeTraffic(0))
    this.nextTraffic = teeming ? rand(0.6, 1.5) : rand(2, 4)
  }

  private drawTraffic(c: Traffic) {
    const { A, H, look } = this
    const u = c.dir > 0 ? c.t : 1 - c.t
    const x = lerp(-0.3, A + 0.3, u) * H
    const y = c.y * H
    const heading = c.dir > 0 ? 0 : Math.PI
    const s = c.size * H
    if (c.kind === "formation") {
      // An echelon of two to four, each a step behind and to the side of the one ahead; high ones leave contrails.
      for (let i = 0; i < c.n; i++) {
        const jx = x - c.dir * i * s * 1.3
        const jy = y + (i % 2 ? 1 : -1) * Math.ceil(i / 2) * s * 0.5 + Math.sin(this.time * 0.7 + i + c.seed) * s * 0.04
        if (c.y < 0.12) {
          trail(this.hdr, this.W, H, jx - c.dir * s * 0.5, jy, jx - c.dir * s * 7, jy, Math.max(0.7, 0.0028 * H), look.trail, 0.3)
          this.touch(Math.min(jx, jx - c.dir * s * 7) - 3, jy - 3, Math.max(jx, jx - c.dir * s * 7) + 3, jy + 3)
        }
        this.planform(jx, jy, s, heading, 0.4, JETFORM, this.craft(JET))
        this.navLights(jx, jy, s, heading, i + c.seed)
      }
      return
    }
    if (c.kind === "break") {
      // A jet breaking off: it dives toward the sea, rolls, and climbs back out with its afterburner lit.
      const dip = Math.sin(Math.PI * c.t) * 0.08
      const by = y + dip * H
      const climb = Math.cos(Math.PI * c.t) * c.dir
      const h = heading - climb * 0.25 * c.dir
      this.planform(x, by, s, h, 0.45, JETFORM, this.craft(JET), 1, Math.sin(TAU * c.t) * 0.5)
      const k = smoothstep(0.5, 0.7, c.t) * 1.2 + 0.2
      this.splat(x - Math.cos(h) * s * 0.55, by - Math.sin(h) * s * 0.25, BURNER[0] * 0.4 * k, BURNER[1] * 0.4 * k, BURNER[2] * 0.4 * k)
      this.navLights(x, by, s, h, c.seed)
      return
    }
    if (c.kind === "cargo") {
      this.planform(x, y, s, heading, 0.4, CARGOFORM, this.craft(CARGO))
      this.navLights(x, y, s, heading, c.seed)
      return
    }
    if (c.kind === "tanker") {
      // A tanker far off with two jets on its hoses, one to each side behind it.
      this.planform(x, y, s, heading, 0.4, TANKERFORM, this.craft(CARGO))
      this.navLights(x, y, s, heading, c.seed)
      for (const side of [-1, 1]) {
        const hx = x - c.dir * s * 0.45
        const hy = y + side * s * 0.12
        const jx = x - c.dir * s * 0.95
        const jy = y + side * s * 0.22 + s * 0.08
        trail(this.hdr, this.W, H, hx, hy, jx + c.dir * s * 0.2, jy, 0.5, this.craft([0.5, 0.5, 0.5]), 0.6)
        this.touch(Math.min(hx, jx) - 2, Math.min(hy, jy) - 2, Math.max(hx, jx) + 2, Math.max(hy, jy) + 2)
        this.planform(jx, jy, s * 0.42, heading, 0.4, JETFORM, this.craft(JET))
        this.navLights(jx, jy, s * 0.42, heading, side + c.seed)
      }
      return
    }
    if (c.kind === "helo") {
      this.drawHelo(x, y, s, 0.12 * -c.dir, c.dir > 0 ? -1 : 1, c.seed)
      return
    }
    // A flock of seabirds in a loose vee, flapping out of step.
    for (let i = 0; i < c.n; i++) {
      const rank = Math.ceil(i / 2)
      const side = i % 2 ? 1 : -1
      const bx = x - c.dir * rank * s * 2.2 + Math.sin(this.time * 0.6 + i * 2.1) * s * 0.4
      const by = y + side * rank * s * 1.1 + Math.sin(this.time * 0.8 + i) * s * 0.3
      this.bird(bx, by, s, Math.sin(this.time * 5 + i * 1.7 + c.seed))
    }
  }

  // A bird with its wings beating: flap runs from -1 (down) to 1 (up).
  private bird(x: number, y: number, s: number, flap: number) {
    const color = this.craft(this.look.night ? [0.3, 0.32, 0.36] : [0.8, 0.82, 0.86])
    const w = this.thick(0.001, 0.6)
    const up = flap * s * 0.45
    const parts: Part[] = []
    for (const side of [-1, 1]) {
      parts.push(cap(x, y, x + side * s * 0.5, y - up, w, w * 0.8, color), cap(x + side * s * 0.5, y - up, x + side * s, y - up * 0.3 + s * 0.15, w * 0.8, w * 0.5, color))
    }
    this.shape(parts, FLAT, 0)
  }

  // Gulls wheeling around the carrier's island.
  private drawGulls() {
    const H = this.H
    const [ix, iy] = this.onShip(this.deck(0.8, 0.55, 2))
    const n = this.activity === "teeming" ? 12 : 7
    for (let i = 0; i < n; i++) {
      const a = this.time * (0.12 + hash(i) * 0.08) * (i % 2 ? 1 : -1) + i * 1.9
      const rx = (0.06 + hash(i + 3) * 0.1) * H
      const x = ix + Math.cos(a) * rx
      const y = iy - (0.01 + hash(i + 7) * 0.05) * H + Math.sin(a) * rx * 0.25
      this.bird(x, y, 0.015 * H, Math.sin(this.time * 4 + i * 2.3))
    }
  }

  // The sea's traffic: boats at rest drifting toward the viewer, a dolphin leaping and a whale spouting.
  private stepSea(dt: number) {
    if (this.activity === "calm") return
    const teeming = this.activity === "teeming"
    for (const b of this.boats) b.d += ROW_RATE * rowHeight(b.d) * dt
    this.boats = this.boats.filter((b) => b.d < 0.4 && Math.abs(b.x * b.d) < this.A / 2 + 0.1)
    if (this.boats.length < (teeming ? 4 : 2)) this.boats.push(makeBoat(0.015))
    const d = this.dolphin
    if (d.t >= 0) d.t = d.t + dt / 2.2 > 1 ? -1 : d.t + dt / 2.2
    else if (teeming && (d.wait -= dt) <= 0) {
      d.t = 0
      d.wait = rand(4, 9)
      d.dir = Math.random() < 0.5 ? 1 : -1
      d.d = rand(0.22, 0.32)
      d.x = (Math.random() < 0.5 ? -1 : 1) * rand(1.6, 2.6)
    }
    const w = this.spout
    if (w.t >= 0) w.t = w.t + dt / 4 > 1 ? -1 : w.t + dt / 4
    else if (teeming && (w.wait -= dt) <= 0) {
      w.t = 0
      w.wait = rand(20, 35)
      w.d = rand(0.03, 0.06)
      w.x = (Math.random() < 0.5 ? -1 : 1) * rand(6, 10)
    }
  }

  private drawSeaTraffic() {
    const { A, H, look } = this
    const teeming = this.activity === "teeming"
    const at = (x: number, d: number): Point => [(A / 2 + x * d) * H, (HORIZON + d) * H]
    // Escorts keeping station with the carrier, their wakes streaming back; at teeming a supply ship alongside too.
    const escorts: [number, number, number][] = teeming ? [[-7, 0.05, 0.8], [6.5, 0.07, 0.9], [-4.2, 0.075, 0.9], [4.2, 0.035, 0.7]] : [[6.5, 0.07, 0.9]]
    for (const [i, [x, d, beam]] of escorts.entries()) this.drawEscort(...at(x, d), beam * d * H, i === 2 ? "supply" : i % 2 ? "destroyer" : "frigate", i)
    for (const b of this.boats) {
      const [x, y] = at(b.x, b.d)
      const s = 0.22 * b.d * H
      const bob = Math.sin(this.time * 1.1 + b.seed) * s * 0.06
      const hull = this.paint([0.55, 0.32, 0.22])
      this.polygon([[x - s, y - s * 0.25 + bob], [x + s, y - s * 0.25 + bob], [x + s * 0.7, y + bob], [x - s * 0.7, y + bob]], hull)
      this.polygon([[x - s * 0.3, y - s * 0.25 + bob], [x - s * 0.3, y - s * 0.7 + bob], [x + s * 0.2, y - s * 0.7 + bob], [x + s * 0.2, y - s * 0.25 + bob]], this.paint([0.75, 0.75, 0.7]))
      if (look.lamp > 0.5) this.splat(x, y - s * 0.8 + bob, AMBER[0] * 0.4, AMBER[1] * 0.4, AMBER[2] * 0.4)
    }
    const d = this.dolphin
    if (d.t >= 0) {
      const [x0, y0] = at(d.x, d.d)
      const s = 0.5 * d.d * H
      const x = x0 + d.dir * (d.t - 0.5) * s * 1.6
      const y = y0 - Math.sin(Math.PI * d.t) * s * 0.5
      const ang = Math.atan2(-Math.cos(Math.PI * d.t) * 0.5, d.dir * 1.6)
      const ca = Math.cos(ang)
      const sa = Math.sin(ang)
      const P = (u: number, v: number): Point => [x + (u * ca - v * sa) * s * d.dir, y + (u * sa * d.dir + v * ca) * s]
      const body = this.craft([0.4, 0.48, 0.56])
      this.shape([cap(...P(-0.25, 0), ...P(0.25, 0), 0.05 * s, 0.07 * s, body), cap(...P(0, -0.05), ...P(-0.06, -0.13), 0.03 * s, 0.01 * s, body)], FLAT, 0)
      for (const e of [0, 1]) {
        const k = Math.max(0, 1 - Math.abs(d.t - e) * 5)
        if (k > 0) for (let i = 0; i < 5; i++) this.splat(x0 + d.dir * (e - 0.5) * s * 1.6 + (i - 2) * s * 0.06, y0 - k * s * 0.1 * (1 + hash(i)), look.foam[0] * k, look.foam[1] * k, look.foam[2] * k)
      }
    }
    const w = this.spout
    if (w.t >= 0) {
      const [x, y] = at(w.x, w.d)
      const s = 0.6 * w.d * H
      const hump = this.craft([0.2, 0.24, 0.28])
      this.ellipse(x, y, s * 0.5, s * 0.1, hump[0], hump[1], hump[2], smoothstep(0, 0.2, w.t) * (1 - smoothstep(0.8, 1, w.t)))
      const k = Math.sin(Math.PI * w.t) * 0.6
      for (let i = 0; i < 9; i++) {
        const f = ((w.t * 3 + i / 9) % 1)
        this.splat(x + (hash(i) - 0.5) * s * 0.4 * f, y - s * 0.9 * Math.sin(Math.PI * f * 0.8), look.foam[0] * k * (1 - f), look.foam[1] * k * (1 - f), look.foam[2] * k * (1 - f))
      }
    }
  }

  // A warship from astern, keeping station: hull, superstructure and mast, with foam streaming back from its stern.
  private drawEscort(x: number, y: number, beam: number, kind: "frigate" | "destroyer" | "supply", seed: number) {
    const { look } = this
    const bob = Math.sin(this.time * 0.8 + seed * 2) * beam * 0.04
    const roll = Math.sin(this.time * 0.6 + seed) * 0.03
    const ca = Math.cos(roll)
    const sa = Math.sin(roll)
    const Q = (a: number, b: number): Point => [x + (a * ca - b * sa) * beam, y + bob + (a * sa + b * ca) * beam]
    // Foam streaming back from the stern in two arms.
    for (let i = 0; i < 10; i++) {
      const f = (this.time * 0.3 + i / 10 + seed * 0.13) % 1
      const side = i % 2 ? 1 : -1
      const k = (1 - f) * 0.6
      this.splat(x + side * beam * (0.4 + f * 0.5), y + beam * (0.05 + f * 1.6), look.foam[0] * k, look.foam[1] * k, look.foam[2] * k)
    }
    const hull = this.paint(HULL)
    const top = this.paint([HULL[0] * 1.15, HULL[1] * 1.15, HULL[2] * 1.15])
    this.polygon([Q(-0.55, -0.35), Q(0.55, -0.35), Q(0.42, 0), Q(-0.42, 0)], hull)
    if (kind === "supply") {
      this.polygon([Q(-0.4, -0.35), Q(0.4, -0.35), Q(0.4, -0.75), Q(-0.4, -0.75)], top)
      for (const k of [-0.3, 0, 0.3]) this.polygon([Q(k - 0.02, -0.75), Q(k + 0.02, -0.75), Q(k + 0.02, -1.25), Q(k - 0.02, -1.25)], hull)
      this.polygon([Q(-0.35, -1.15), Q(0.35, -1.15), Q(0.35, -1.2), Q(-0.35, -1.2)], hull)
    }
    if (kind !== "supply") {
      this.polygon([Q(-0.3, -0.35), Q(0.3, -0.35), Q(0.24, -0.85), Q(-0.24, -0.85)], top)
      this.polygon([Q(-0.03, -0.85), Q(0.03, -0.85), Q(0.015, kind === "destroyer" ? -1.45 : -1.25), Q(-0.015, kind === "destroyer" ? -1.45 : -1.25)], hull)
    }
    if (look.lamp > 0.5) {
      const blink = Math.sin(this.time * 3 + seed * 1.3) > 0.5 ? 0.6 : 0.15
      this.splat(...Q(0, kind === "supply" ? -1.25 : kind === "destroyer" ? -1.45 : -1.25), 1.6 * blink, 0.3 * blink, 0.12 * blink)
      this.splat(...Q(-0.5, -0.33), 0.3 * 0.5, 1.6 * 0.5, 0.5 * 0.5)
      this.splat(...Q(0.5, -0.33), 1.8 * 0.5, 0.25 * 0.5, 0.15 * 0.5)
    }
  }

  // A jet taxiing from the parking area to the waist catapult, which then launches it.
  private stepTaxi(dt: number) {
    if (this.activity === "calm") return
    const t = this.taxi
    if (t.wait > 0) {
      t.wait -= dt
      return
    }
    t.t += dt / 9
    if (t.t < 1) return
    t.t = 0
    t.wait = this.activity === "teeming" ? rand(3, 6) : rand(10, 16)
    this.launch()
  }

  // Life on deck: crew in colored jerseys crossing to and fro, a tow tractor, and a jet taxiing to a catapult.
  private drawDeck() {
    const { H, look } = this
    const t = this.time
    const crew = this.activity === "teeming" ? CREW : CREW.slice(0, 6)
    for (const [i, [u0, v0, u1, v1, color]] of crew.entries()) {
      const f = 0.5 - 0.5 * Math.cos(t * (0.15 + hash(i) * 0.1) + i * 2.1)
      const [x, y] = this.onShip(this.deck(lerp(u0, u1, f), lerp(v0, v1, f)))
      const [, top] = this.onShip(this.deck(lerp(u0, u1, f), lerp(v0, v1, f), 0.1))
      const c = this.craft(color)
      this.shape([cap(x, y, x, top, this.thick(0.0012, 0.6), this.thick(0.0012, 0.6), look.night ? [c[0] * 1.2, c[1] * 1.2, c[2] * 1.2] : c)], FLAT, 0)
      // At night the marshals' wands glow.
      if (look.lamp > 0.5 && i % 3 === 0) this.splat(x + Math.sin(t * 2 + i) * 1.5, top, AMBER[0] * 0.35, AMBER[1] * 0.35, AMBER[2] * 0.35)
    }
    // The tow tractor, trundling up and down beside the island.
    const f = 0.5 - 0.5 * Math.cos(t * 0.06)
    const [tx, ty] = this.onShip(this.deck(0.5, lerp(0.15, 0.4, f), 0.02))
    const ts = (0.05 * BEAM * H) / (1 + BOW * lerp(0.15, 0.4, f))
    const tug = this.craft(YELLOW)
    this.polygon([[tx - ts, ty - ts * 0.6], [tx + ts, ty - ts * 0.6], [tx + ts, ty + ts * 0.3], [tx - ts, ty + ts * 0.3]], tug)
    if (look.lamp > 0.5) this.splat(tx, ty - ts * 0.6, AMBER[0] * 0.4 * (Math.sin(t * 5) > 0 ? 1 : 0.2), AMBER[1] * 0.4 * (Math.sin(t * 5) > 0 ? 1 : 0.2), AMBER[2] * 0.2)
    // The taxiing jet, along a curve from the parking area to the catapult.
    const tx2 = this.taxi
    if (tx2.wait > 0) return
    const q = smoothstep(0, 1, tx2.t)
    const u = lerp(0.55, CATAPULTS[0], q) + Math.sin(Math.PI * q) * -0.2
    const v = lerp(0.85, 0.24, q)
    const [jx, jy] = this.onShip(this.deck(u, v, 0.08))
    const s = (0.5 * BEAM * H) / (1 + BOW * v)
    // Nosing toward the bow, turning in as it swings across the deck.
    this.planform(jx, jy, s, -Math.PI / 2 - Math.cos(Math.PI * q) * 0.5, 0.55, JETFORM, this.craft(JET))
    if (look.lamp > 0.5) this.splat(jx, jy, BURNER[0] * 0.25, BURNER[1] * 0.25, BURNER[2] * 0.25)
  }

  // Helicopters: one hovering off the island, and at teeming a rescue helicopter holding off the port quarter, its
  // downwash ruffling the water below it.
  private drawHelicopters() {
    const { H, look } = this
    const t = this.time
    const [x, y] = this.onShip(this.deck(1.6 + 0.08 * Math.sin(t * 0.21), 0.35, 1.7 + 0.12 * Math.sin(t * 0.33)))
    this.drawHelo(x, y, 0.065 * H, 0.06 * Math.sin(t * 0.21 + 1.2), 1, 3)
    if (this.activity !== "teeming") return
    const [rx, ry] = this.onShip(this.deck(-1.9 + 0.1 * Math.sin(t * 0.17), 0.05, 1.9 + 0.15 * Math.sin(t * 0.29)))
    const [, wy] = this.onShip(this.deck(-1.9, 0.05, WATERLINE))
    for (let i = 0; i < 3; i++) {
      const f = (t * 0.6 + i / 3) % 1
      const k = (1 - f) * 0.35
      this.ellipse(rx, wy, (0.02 + f * 0.05) * H, (0.004 + f * 0.01) * H, look.foam[0], look.foam[1], look.foam[2], k * 0.5)
    }
    this.drawHelo(rx, ry, 0.075 * H, 0.05 * Math.sin(t * 0.19), -1, 5)
  }

  // A helicopter side on, nose toward face (1 left, -1 right): a rounded cabin, a tail boom with its fin, skids, and its
  // rotor a faint blur rather than blades, so it doesn't flicker.
  private drawHelo(x: number, y: number, s: number, tilt: number, face: number, seed: number) {
    const look = this.look
    const body = this.craft([0.3, 0.34, 0.3])
    const ca = Math.cos(tilt)
    const sa = Math.sin(tilt)
    const Q = (a: number, b: number): Point => [x + (a * face * ca - b * sa) * s, y + (a * face * sa + b * ca) * s]
    this.ellipse(...Q(-0.05, 0), 0.22 * s, 0.12 * s, body[0], body[1], body[2], 1)
    this.polygon([Q(0.1, -0.04), Q(0.55, -0.03), Q(0.55, 0.0), Q(0.1, 0.05)], body)
    this.polygon([Q(0.5, -0.03), Q(0.58, -0.17), Q(0.62, -0.17), Q(0.58, 0.0)], body)
    this.polygon([Q(-0.22, 0.17), Q(0.14, 0.17), Q(0.14, 0.19), Q(-0.22, 0.19)], body)
    this.polygon([Q(-0.24, -0.15), Q(0.16, -0.15), Q(0.16, -0.13), Q(-0.24, -0.13)], body)
    const blur = look.night ? look.key : look.sky[look.sky.length - 1][1]
    this.ellipse(...Q(-0.04, -0.15), 0.5 * s, 0.035 * s, blur[0] * 0.5 + body[0] * 0.5, blur[1] * 0.5 + body[1] * 0.5, blur[2] * 0.5 + body[2] * 0.5, 0.45)
    this.navLights(...Q(0.6, -0.1), s, Math.PI, seed)
  }

  private stepFlier(f: Flier, dt: number, on: boolean, min: number, max: number, row: () => number) {
    if (f.t >= 0) {
      f.t += dt / f.span
      if (f.t > 1) {
        f.t = -1
        f.wait = rand(min, max)
      }
      return
    }
    if (!on) return
    f.wait -= dt
    if (f.wait > 0) return
    f.t = 0
    f.dir = Math.random() < 0.5 ? 1 : -1
    f.y = row()
  }

  // An A-10 Warthog skimming the water across the screen, straight-winged, its twin engines high on the tail.
  private drawWarthog(f: Flier) {
    f.t = Math.min(f.t, 1)
    const { A, H } = this
    const u = f.dir > 0 ? f.t : 1 - f.t
    const x = lerp(-0.2, A + 0.2, u) * H
    const y = f.y * H
    const s = 0.08 * H
    // Its shadow racing along the sea below it.
    this.ellipse(x, y + 0.025 * H, s * 0.4, s * 0.06, 0, 0, 0, this.look.night ? 0.15 : 0.25)
    this.planform(x, y, s, f.dir > 0 ? 0 : Math.PI, 0.38, WARTHOGFORM, this.craft(WARTHOG))
  }

  // A B-2 Spirit gliding high across the sky: a dark flying wing with a sawtooth trailing edge.
  private drawSpirit(f: Flier) {
    f.t = Math.min(f.t, 1)
    const { A, H } = this
    const u = f.dir > 0 ? f.t : 1 - f.t
    this.planform(lerp(-0.2, A + 0.2, u) * H, f.y * H, 0.09 * H, f.dir > 0 ? 0 : Math.PI, 0.32, SPIRITFORM, this.craft(SPIRIT))
  }

  // When the agent finishes: a vee of five jets sweeps across the sky trailing contrails.
  private drawFlyover() {
    const { A, H, look } = this
    const f = this.flyover
    const u = f.t / 14
    const lead = lerp(-0.4, A + 0.9, f.dir > 0 ? u : 1 - u)
    const heading = f.dir > 0 ? 0 : Math.PI
    for (let i = 0; i < 5; i++) {
      const rank = Math.ceil(i / 2)
      const side = i % 2 ? -1 : 1
      const x = (lead - f.dir * rank * 0.09) * H
      const y = (f.y + side * rank * 0.035) * H
      const len = Math.min(0.5, f.t * 0.12) * H
      const fade = 1 - smoothstep(10, 14, f.t)
      trail(this.hdr, this.W, H, x - f.dir * 0.02 * H, y, x - f.dir * len, y, Math.max(1, 0.004 * H), look.trail, 0.35 * fade)
      this.touch(Math.min(x, x - f.dir * len) - 3, y - 3, Math.max(x, x - f.dir * len) + 3, y + 3)
      this.planform(x, y, 0.05 * H, heading, 0.4, JETFORM, this.craft(JET))
      const k = look.lamp
      this.splat(x - f.dir * 0.018 * H, y, BURNER[0] * 0.3 * k, BURNER[1] * 0.3 * k, BURNER[2] * 0.3 * k)
    }
  }

  // The easter egg: a B-2 passes low overhead, from behind the viewer out toward the volcano, its shadow sweeping
  // across the sea and the deck below it.
  private drawEgg() {
    const { A, H } = this
    const t = this.egg.t / 12
    const z = lerp(0.3, 6, t ** 1.4)
    const x = (A / 2 + 0.05 / z) * H
    const s = (0.5 / z) * H
    const fade = 1 - smoothstep(0.85, 1, t)
    const shadow = (HORIZON + 0.5 / z) * H
    if (shadow - s * 0.3 < H) this.planform(x + 0.08 * H, shadow, s, Math.PI / 2, 0.3, SPIRITFORM, [0, 0, 0], 0.3 * fade)
    const y = (HORIZON - 0.12 - 0.45 / z) * H
    if (y + s * 0.3 < 0) return
    // At night the moon catches its edges, so it reads against the dark sky.
    if (this.look.night) this.planform(x, y - 0.004 * H, s * 1.03, Math.PI / 2, 0.3, SPIRITFORM, [this.look.key[0] * 0.1, this.look.key[1] * 0.1, this.look.key[2] * 0.1], fade)
    this.planform(x, y, s, Math.PI / 2, 0.3, SPIRITFORM, this.craft(SPIRIT), fade)
  }

  // Sparkles bursting from a click on the water, spreading and twinkling out, each a little four-pointed glint.
  private drawSparkles() {
    const { H, look } = this
    const c = look.night ? look.spec : [1.2, 1.2, 1.1]
    const arm = Math.max(1, 0.004 * H)
    for (const s of this.sparkles) {
      const f = s.age / SPARKLE
      for (let i = 0; i < 28; i++) {
        const a = hash(s.seed + i) * TAU
        const r = (0.02 + hash(s.seed + i * 3.1) * 0.09) * Math.sqrt(f)
        const tw = Math.max(0, Math.sin(s.age * 7 + i * 2.3))
        const k = (1 - f) * tw * 1.6
        if (k <= 0.02) continue
        const x = (s.x + Math.cos(a) * r) * H
        const y = (s.y + Math.sin(a) * r * 0.35 - f * 0.01) * H
        this.splat(x, y, c[0] * k, c[1] * k, c[2] * k)
        for (const [dx, dy] of [[arm, 0], [-arm, 0], [0, arm], [0, -arm]]) this.splat(x + dx, y + dy, c[0] * k * 0.3, c[1] * k * 0.3, c[2] * k * 0.3)
      }
    }
  }

  // Rain slanting down in the storm after an error.
  private drawRain() {
    const { W, H, look } = this
    const k = smoothstep(0.2, 1, this.gloom)
    const color: RGB = look.night ? [0.08, 0.2, 0.5] : [0.35, 0.42, 0.45]
    const d = this.drops
    for (let i = 0; i < d.length; i += 3) {
      const z = d[i + 2]
      const x = d[i] * W
      const y = d[i + 1] * H
      const len = (0.03 + z * 0.04) * H
      trail(this.hdr, W, H, x, y, x - len * 0.15, y - len, 0.6, color, k * (0.25 + z * 0.4))
    }
    this.touch(0, 0, W - 1, H - 1)
  }
}

// The volcano stands right of the middle, clear of the logo, but not so far right that it crowds the sea stacks.
function volcanoX(A: number) {
  return Math.min(A / 2 + 0.32, A - 0.45)
}

// Flat color, for small and thin things.
const FLAT: Lighting = { style: "front", dir: [0, 0, 1] }

// Loops jets hold in, in screen heights: the middle (cx 0 for over the volcano, negative from the right edge), radii,
// size, turn rate in radians per scene second and starting angle. Lively flies the first four.
const LOOPS = [
  { cx: 0, cy: 0.2, rx: 0.36, ry: 0.04, size: 0.05, rate: 0.13, phase: 0 },
  { cx: 0, cy: 0.22, rx: 0.36, ry: 0.04, size: 0.05, rate: 0.13, phase: Math.PI },
  { cx: 0.32, cy: 0.15, rx: 0.24, ry: 0.05, size: 0.07, rate: -0.14, phase: 1 },
  { cx: 0.5, cy: 0.07, rx: 0.4, ry: 0.015, size: 0.028, rate: 0.1, phase: 2.5 },
  { cx: -0.3, cy: 0.31, rx: 0.2, ry: 0.03, size: 0.065, rate: 0.16, phase: 4 },
  { cx: 0.32, cy: 0.14, rx: 0.24, ry: 0.05, size: 0.07, rate: -0.14, phase: 1.5 },
  { cx: -0.35, cy: 0.06, rx: 0.3, ry: 0.012, size: 0.026, rate: -0.11, phase: 0.4 },
  { cx: 0, cy: 0.12, rx: 0.5, ry: 0.025, size: 0.036, rate: -0.09, phase: 3.3 },
  { cx: 0.25, cy: 0.3, rx: 0.18, ry: 0.03, size: 0.06, rate: -0.15, phase: 5.2 },
  { cx: -0.45, cy: 0.18, rx: 0.3, ry: 0.04, size: 0.05, rate: 0.12, phase: 2 },
  { cx: 0, cy: 0.05, rx: 0.6, ry: 0.01, size: 0.02, rate: 0.07, phase: 1.1 },
]

// Deck crew walking between two spots (u0, v0, u1, v1) in the color of their jobs.
const CREW: [number, number, number, number, RGB][] = [
  [-0.5, 0.3, -0.3, 0.5, [0.9, 0.75, 0.1]],
  [0.3, 0.7, 0.45, 0.9, [0.2, 0.6, 0.2]],
  [-0.2, 0.15, 0.1, 0.25, [0.8, 0.15, 0.1]],
  [0.5, 0.2, 0.55, 0.45, [0.5, 0.25, 0.6]],
  [-0.6, 0.75, -0.3, 0.85, [0.85, 0.85, 0.8]],
  [0.2, 0.4, 0.35, 0.3, [0.9, 0.75, 0.1]],
  [-0.4, 0.55, -0.15, 0.6, [0.2, 0.6, 0.2]],
  [0.35, 0.55, 0.5, 0.65, [0.5, 0.35, 0.2]],
  [-0.75, 0.2, -0.75, 0.6, [0.15, 0.35, 0.8]],
]

const HAWKEYE: RGB = [0.55, 0.57, 0.6]
const CARGO: RGB = [0.48, 0.5, 0.52]

function makeBoat(d: number): Boat {
  return { d, x: (Math.random() < 0.5 ? -1 : 1) * rand(2.2, 9), seed: Math.random() * 100 }
}

// Both halves of an outline drawn on one side of the centerline.
function sym(...polys: Point[][]): Point[][] {
  return polys.flatMap((p) => [p, p.map(([a, b]) => [a, -b] as const)])
}

// Top-down outlines, nose toward +a, span along b, for planform().
const JETFORM: Point[][] = [
  [[0.5, 0], [0.3, 0.05], [-0.5, 0.06], [-0.5, -0.06], [0.3, -0.05]],
  [[0.12, 0.05], [-0.14, 0.42], [-0.24, 0.42], [-0.2, 0.05]],
  [[0.12, -0.05], [-0.14, -0.42], [-0.24, -0.42], [-0.2, -0.05]],
  [[-0.34, 0.05], [-0.48, 0.22], [-0.53, 0.22], [-0.5, 0.05]],
  [[-0.34, -0.05], [-0.48, -0.22], [-0.53, -0.22], [-0.5, -0.05]],
]
const WARTHOGFORM: Point[][] = [
  [[0.5, 0], [0.42, 0.05], [-0.4, 0.04], [-0.4, -0.04], [0.42, -0.05]],
  [[0.08, 0.04], [0.06, 0.52], [-0.06, 0.5], [-0.08, 0.04]],
  [[0.08, -0.04], [0.06, -0.52], [-0.06, -0.5], [-0.08, -0.04]],
  [[-0.14, 0.04], [-0.14, 0.15], [-0.32, 0.15], [-0.32, 0.04]],
  [[-0.14, -0.04], [-0.14, -0.15], [-0.32, -0.15], [-0.32, -0.04]],
  [[-0.38, 0.2], [-0.38, -0.2], [-0.47, -0.2], [-0.47, 0.2]],
]
// A twin-turboprop with a straight high wing and a broad twin-finned tail, for the C-2 and the E-2.
const CARGOFORM: Point[][] = [
  [[0.5, 0], [0.4, 0.06], [-0.45, 0.05], [-0.45, -0.05], [0.4, -0.06]],
  ...sym([[0.12, 0.05], [0.1, 0.55], [0.0, 0.55], [0.0, 0.05]], [[-0.36, 0.04], [-0.38, 0.2], [-0.46, 0.2], [-0.45, 0.04]], [[0.24, 0.2], [0.24, 0.26], [0.0, 0.26], [0.0, 0.2]]),
]
// A tanker: a long fuselage with swept wings.
const TANKERFORM: Point[][] = [[[0.5, 0], [0.42, 0.05], [-0.45, 0.04], [-0.45, -0.04], [0.42, -0.05]], ...sym([[0.15, 0.05], [-0.15, 0.5], [-0.22, 0.5], [-0.08, 0.05]], [[-0.34, 0.04], [-0.46, 0.18], [-0.5, 0.18], [-0.46, 0.04]])]
const SPIRITFORM: Point[][] = [
  [[0.3, 0], [-0.08, 0.55], [-0.2, 0.36], [-0.1, 0.22], [-0.22, 0.1], [-0.12, 0], [-0.22, -0.1], [-0.1, -0.22], [-0.2, -0.36], [-0.08, -0.55]],
]

function makeLowPolyClouds(count: number): Cloud[] {
  return Array.from({ length: count }, (_, i) => {
    const size = rand(0.06, 0.12)
    const n = 3 + Math.floor(Math.random() * 3)
    const lumps = Array.from({ length: n }, (_, k) => {
      const f = n === 1 ? 0 : k / (n - 1) - 0.5
      return { x: f * 1.6 + rand(-0.1, 0.1), y: 0, r: (0.55 - Math.abs(f) * 0.5) * rand(0.8, 1.2), seed: Math.random() * 100 }
    })
    for (const l of lumps) l.y = -l.r * 0.6
    // The clouds keep to the top of the sky and the band just over the horizon, clear of the middle.
    const y = i % 3 === 2 ? rand(0.36, 0.42) : rand(0.06, 0.24)
    return { x: ((i + Math.random() * 0.8) / count) * 2.2, y, size: i % 3 === 2 ? size * 0.7 : size, speed: rand(0.004, 0.008), lumps }
  })
}

// Renders a cloud's lumps as faceted polygons into a premultiplied RGBA sprite: each lump a fan of triangles around a
// hub, every facet lit by how squarely it faces the light (toward the sun's side), with a flat shadowed base.
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

// Composites a premultiplied sprite at a fractional position, bilinearly, so it glides as it drifts.
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

// Composites the hull sprite turned by roll, stretched by pitch and moved by (dx, dy) about the pivot (px, py),
// sampling it bilinearly so the carrier glides; returns the box it drew in.
function blitHull(hdr: Float32Array, W: number, H: number, h: Hull, px: number, py: number, dx: number, dy: number, roll: number, sy: number) {
  const c = Math.cos(roll)
  const n = Math.sin(roll)
  let x0 = Infinity
  let y0 = Infinity
  let x1 = -Infinity
  let y1 = -Infinity
  for (const [cx, cy] of [[h.x, h.y], [h.x + h.w, h.y], [h.x, h.y + h.h], [h.x + h.w, h.y + h.h]]) {
    const qx = cx - px
    const qy = (cy - py) * sy
    const X = px + qx * c - qy * n + dx
    const Y = py + qx * n + qy * c + dy
    x0 = Math.min(x0, X)
    y0 = Math.min(y0, Y)
    x1 = Math.max(x1, X)
    y1 = Math.max(y1, Y)
  }
  const bx0 = Math.max(0, Math.floor(x0) - 1)
  const by0 = Math.max(0, Math.floor(y0) - 1)
  const bx1 = Math.min(W - 1, Math.ceil(x1) + 1)
  const by1 = Math.min(H - 1, Math.ceil(y1) + 1)
  const d = h.rgba
  for (let y = by0; y <= by1; y++)
    for (let x = bx0; x <= bx1; x++) {
      // Back from the screen to the sprite at rest.
      const qx = x + 0.5 - px - dx
      const qy = y + 0.5 - py - dy
      const sx = px + qx * c + qy * n - h.x - 0.5
      const sY = py + (-qx * n + qy * c) / sy - h.y - 0.5
      const ix = Math.floor(sx)
      const iy = Math.floor(sY)
      if (ix < -1 || iy < -1 || ix >= h.w || iy >= h.h) continue
      const fx = sx - ix
      const fy = sY - iy
      let r = 0
      let g = 0
      let b = 0
      let a = 0
      for (let q = 0; q < 4; q++) {
        const u = ix + (q & 1)
        const v = iy + (q >> 1)
        if (u < 0 || v < 0 || u >= h.w || v >= h.h) continue
        const k = (q & 1 ? fx : 1 - fx) * (q >> 1 ? fy : 1 - fy)
        const o = (v * h.w + u) * 4
        r += d[o] * k
        g += d[o + 1] * k
        b += d[o + 2] * k
        a += d[o + 3] * k
      }
      if (a <= 0 && r + g + b <= 0) continue
      const o = (y * W + x) * 3
      hdr[o] = hdr[o] * (1 - a) + r
      hdr[o + 1] = hdr[o + 1] * (1 - a) + g
      hdr[o + 2] = hdr[o + 2] * (1 - a) + b
    }
  return [bx0, by0, bx1, by1]
}

// Churned water around the carrier, from row y0 down to the bottom between x0 and x1. Its shape comes from mapping each
// pixel onto the water around the hull (u across, in half-beams from its middle at cx; v along, 0 at the stern and 1 at
// the bow): foam runs out from under the deck edges, flares off the bow and spreads back from the stern in a churned
// trail and two arms. Its texture is pinned to the sea's own ground (see buildSea), so it streams back past the ship at
// the sea's pace. Returns the box it drew in.
function wake(hdr: Float32Array, W: number, H: number, A: number, x0: number, x1: number, y0: number, cx: number, dy: number, flow: number, foam: RGB, strength: number) {
  const bx0 = Math.max(0, x0)
  const bx1 = Math.min(W - 1, x1)
  const by0 = Math.max(0, y0)
  const depth = STERN - VANISH - WATERLINE * BEAM
  for (let y = by0; y < H; y++) {
    const z = depth / Math.max(0.01, (y + 0.5 - dy) / H - VANISH)
    const v = (z - 1) / BOW
    if (v > 1.2) continue
    // The sea's rows slide toward the viewer at a pace proportional to their distance, so the foam is pinned to the
    // log of the distance, slid along by flow.
    const ground = (CAMERA * FOCAL) / Math.max(0.01, (y + 0.5) / H - HORIZON)
    const tv = (Math.log(ground) + flow) * 66
    for (let x = bx0; x <= bx1; x++) {
      const u = (((x + 0.5 - cx) / H) * z) / BEAM
      const au = Math.abs(u)
      // Along the sides, out past the deck's overhang, widening toward the stern.
      const outer = 1.15 + 0.3 * clamp(1 - v, 0, 1.3)
      const side = v < 1.02 ? smoothstep(0.84, 0.95, au) * smoothstep(outer, outer - 0.2, au) * (0.55 + 0.45 * smoothstep(0.6, 0, v)) : 0
      // The bow wave curling out from the stem.
      const bow = Math.exp(-(((v - 1.04) / 0.07) ** 2)) * smoothstep(0.3, 0.75, au) * smoothstep(1.55, 1.1, au)
      // Behind the stern: churned water across the beam, and two arms spreading outward.
      const churn = smoothstep(0.02, -0.04, v) * smoothstep(1 - v * 0.8, 0.5, au)
      const arms = v < 0.1 ? Math.exp(-(((au - (1 - v * 1.8)) / 0.14) ** 2)) : 0
      const f = Math.max(side, bow, churn, arms)
      if (f <= 0.01) continue
      const tex = foamAt(((x + 0.5) / H - A / 2) * ground * 90, tv)
      const a = clamp(f * (0.15 + 1.4 * smoothstep(0.35, 0.6, tex)), 0, 1) * strength
      const o = (y * W + x) * 3
      hdr[o] += (foam[0] - hdr[o]) * a
      hdr[o + 1] += (foam[1] - hdr[o + 1]) * a
      hdr[o + 2] += (foam[2] - hdr[o + 2]) * a
    }
  }
  return [bx0, by0, bx1, H - 1]
}

// A wrapping tile of foam blobs, sampled bilinearly.
const FOAM_N = 64
const FOAM = (() => {
  const tex = new Float32Array(FOAM_N * FOAM_N)
  // Soft blobs of many sizes, measured with wrapped distances so the tile repeats seamlessly.
  for (let k = 0; k < 70; k++) {
    const cx = hash(k * 3.7) * FOAM_N
    const cy = hash(k * 5.3 + 1) * FOAM_N
    const r = 2 + hash(k * 7.1 + 2) * 6
    for (let y = 0; y < FOAM_N; y++)
      for (let x = 0; x < FOAM_N; x++) {
        const dx = Math.min(Math.abs(x - cx), FOAM_N - Math.abs(x - cx))
        const dy = Math.min(Math.abs(y - cy), FOAM_N - Math.abs(y - cy))
        tex[y * FOAM_N + x] += Math.exp(-(dx * dx + dy * dy) / (r * r))
      }
  }
  let lo = Infinity
  let hi = -Infinity
  for (const v of tex) {
    lo = Math.min(lo, v)
    hi = Math.max(hi, v)
  }
  return tex.map((v) => (v - lo) / (hi - lo))
})()

function foamAt(x: number, y: number) {
  const ix = Math.floor(x)
  const iy = Math.floor(y)
  const fx = x - ix
  const fy = y - iy
  const x0 = ix & (FOAM_N - 1)
  const y0 = iy & (FOAM_N - 1)
  const x1 = (x0 + 1) & (FOAM_N - 1)
  const y1 = (y0 + 1) & (FOAM_N - 1)
  const top = FOAM[y0 * FOAM_N + x0] + (FOAM[y0 * FOAM_N + x1] - FOAM[y0 * FOAM_N + x0]) * fx
  const bottom = FOAM[y1 * FOAM_N + x0] + (FOAM[y1 * FOAM_N + x1] - FOAM[y1 * FOAM_N + x0]) * fx
  return top + (bottom - top) * fy
}

// The height of the sea's row d below the horizon: rows grow toward the viewer, though never thinner than a sliver.
function rowHeight(d: number) {
  return Math.max(0.0035, d * 0.17 + 0.003)
}

// For each pixel of a W x H grid sampled two by two, its commonest triangle, the next, and how much of the next.
function resolveSamples(ids: Int32Array, W: number, H: number, idA: Int32Array, idB: Int32Array, mix: Float32Array) {
  const SW = W * 2
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const o = y * 2 * SW + x * 2
      const s0 = Math.max(0, ids[o])
      const s1 = Math.max(0, ids[o + 1])
      const s2 = Math.max(0, ids[o + SW])
      const s3 = Math.max(0, ids[o + SW + 1])
      const second = s1 !== s0 ? s1 : s2 !== s0 ? s2 : s3
      const n0 = 1 + (s1 === s0 ? 1 : 0) + (s2 === s0 ? 1 : 0) + (s3 === s0 ? 1 : 0)
      const n1 = second === s0 ? 0 : (s1 === second ? 1 : 0) + (s2 === second ? 1 : 0) + (s3 === second ? 1 : 0)
      const i = y * W + x
      idA[i] = n0 >= n1 ? s0 : second
      idB[i] = n0 >= n1 ? second : s0
      mix[i] = Math.min(n0, n1) / 4
    }
}

// Zips two rows of vertex indices, each sorted by x, into a strip of triangles.
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

// Writes id into every sample of a W x H grid whose center lies inside the triangle.
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

// Shades every facet from its tilted normal (see shadeSea), into colors.
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
    // Slivers where rows of different spacing meet can come out nearly vertical; no facet tilts more than a wave would.
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
    // The sky the facet mirrors, looked up by the row the reflected ray meets.
    const row = ry <= 0 || rz <= 0 ? top : clamp(Math.round((HORIZON - (FOCAL * ry) / rz) * H), 0, top)
    const fres = 0.12 + 0.88 * (1 - ndv) ** 3
    // Glitter where the reflected ray meets the sky near the sun or moon: a narrow lobe across and a long one up and
    // down, so the facets catching it line up into a path down the water.
    const gx = rz > 0.01 ? (FOCAL * rx) / rz - ox : 9
    const gy = rz > 0.01 ? HORIZON - (FOCAL * ry) / rz - oy : 9
    // Big facets near the viewer flash less, so they don't flicker whole cells.
    const s = Math.exp(-((gx / spread[0]) ** 2) - (gy / spread[1]) ** 2) * glitter * (0.3 + 0.7 * smoothstep(2, 6, pz))
    const diffuse = clamp(0.5 + nx * 1.6 - nz * 0.8, 0, 1)
    for (let k = 0; k < 3; k++) {
      const body = deep[k] + (lit[k] - deep[k]) * diffuse
      // Glitter replaces the water's own color rather than adding to it, so the path keeps the sun or moon's hue.
      const v = (body * (1 - fres) + sky[row * 3 + k] * fres * 0.7) * (1 - Math.min(1, s) * 0.75) + spec[k] * s
      colors[f + k] = v + (storm[k] - v) * gloom
    }
  }
}

// Paints the sea's rows from the facet colors: each pixel mixes its two triangles, shows only as much as isn't covered
// by what stands in the sea, and adds any still glow.
function fillSea(hdr: Float32Array, W: number, y0: number, idA: Int32Array, idB: Int32Array, mix: Float32Array, open: Float32Array | undefined, colors: Float32Array, glow: Float32Array | undefined) {
  const base = y0 * W * 3
  for (let i = 0; i < idA.length; i++) {
    const w = open ? open[i] : 1
    if (w <= 0) continue
    const a = idA[i] * 3
    const b = idB[i] * 3
    const k = mix[i]
    const o = base + i * 3
    for (let c = 0; c < 3; c++) {
      const v = colors[a + c] + (colors[b + c] - colors[a + c]) * k + (glow ? glow[i * 3 + c] : 0)
      hdr[o + c] += (v - hdr[o + c]) * w
    }
  }
}

// A soft line from head to tail, fading toward the tail, mixed over the scene; for contrails and rain.
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

export const wings: Wallpaper = {
  id: "wings",
  name: "Wings",
  description: "An aircraft carrier sailing a low-poly sea below a volcano island, from Anomaly Arcade's Wings",
  collection: "Arcade",
  activity: {
    calm: "The carrier underway on faceted swells, its wake, glittering water, deck lights and drifting clouds",
    lively: "Adds launches and landings, jets circling and crossing in formation, a helicopter, deck crew, gulls, boats and an escort",
    teeming: "A busy sky and sea: launches every few seconds, formations, an E-2, a tanker, cargo planes, helicopters, the A-10 and B-2, birds, escorts, dolphins and a whale",
  },
  scrim: {
    day: [
      [16, 40, 84],
      [22, 52, 86],
      [8, 36, 66],
    ],
    sunset: [
      [26, 28, 70],
      [66, 36, 60],
      [18, 22, 56],
    ],
    night: [
      [3, 6, 18],
      [4, 9, 24],
      [3, 6, 18],
    ],
  },
  create: (settings) => new Wings(settings),
}
