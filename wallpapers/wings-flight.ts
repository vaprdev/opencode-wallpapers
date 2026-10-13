import { Canvas } from "../src/canvas"
import { eggWait } from "../src/egg"
import { lightPool } from "../src/light"
import { TAU, clamp, hash, hash2, lerp, noise1, rand, smoothstep, type RGB } from "../src/math"
import { driftClouds, makeStars, makeStorm, paintSky, paintStars, paintStorm, type Orb, type Star } from "../src/sky"
import type { Activity, Settings, Time, Wallpaper } from "../src/wallpaper"
import { WeatherLayer } from "../src/weather"

// An homage to Wings, Anomaly Arcade's flight game: a chase camera behind a fighter jet gliding low over the faceted
// sea, past volcano islands and now and then over the carrier.

// The scene runs slower than real time, and the jets slower still, which keeps it calm behind text.
const TIME_SCALE = 0.35
const CREATURE_SPEED = 0.25
const HORIZON = 0.44
// The sea's camera: its height over the water and focal length, in screen heights.
const CAMERA = 1
const FOCAL = 1
// How many of the sea's rows slide toward the camera per scene second, and how far the jet banks, at each activity.
const SPEED: Record<Activity, number> = { calm: 0.13, lively: 0.16, teeming: 0.19 }
const BANK: Record<Activity, number> = { calm: 0.04, lively: 0.09, teeming: 0.11 }
// How much of the jet's bank the horizon tilts the other way.
const TILT = 0.15
// Islands' size per unit of their distance below the horizon.
const ISLAND = 16
// The carrier in the sea camera's world units: half its beam, its length, its deck's height and how much its
// superstructure is squashed so the mast stays under the camera.
const BEAMW = 0.4
const LENGTH = 3.2
const DECK = 0.12
const RISE = 0.28
// The jet: its wingspan in screen heights, its screen position, and how steeply the camera looks down on it.
const SPAN = 0.42
const JET_Y = 0.75
const ELEVATION = 0.26
// How long a click's roll, the victory barrel roll and the easter egg's B-2 pass last, in scene seconds.
const ROLL = 3
const BARREL = 4
const EGG = 12
// Cloud sprites are drawn at this nearness and scaled down from it.
const CLOUD_E = 0.7

type Point = readonly [number, number]
type V3 = readonly [number, number, number]

// What changes with the time of day. The sea gets its own colors; islands and the carrier one daytime color each,
// darkened by tint; the jets are lit by their own ambient and key lights.
interface Look {
  sky: [number, RGB][]
  orb: Orb
  // The sun or moon's x, in screen heights from the middle.
  orbX: number
  stars: number
  cloud: [lit: RGB, shade: RGB]
  sea: [deep: RGB, lit: RGB]
  // How much of the sky the sea mirrors at grazing angles.
  mirror: number
  glitter: number
  spread: readonly [number, number]
  spec: RGB
  tint: RGB
  key: RGB
  lamp: number
  foam: RGB
  storm: RGB
  ambient: RGB
  light: RGB
  toward: V3
  night: boolean
}

const LOOKS: Record<Time, Look> = {
  day: {
    sky: [
      [0, [0.07, 0.27, 0.72]],
      [0.25, [0.2, 0.47, 0.88]],
      [HORIZON, [0.62, 0.82, 0.96]],
    ],
    orb: { x: 0, y: 0.12, r: 0.035, core: [5, 4.6, 3.8], glow: [1, 0.95, 0.8], near: 0.45, wide: 0.12 },
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
    mirror: 0.7,
    glitter: 0.7,
    spread: [0.04, 0.16],
    spec: [1.2, 1.15, 1],
    tint: [1, 1, 1],
    key: [1, 0.97, 0.88],
    lamp: 0.25,
    foam: [0.85, 0.95, 1],
    storm: [0.1, 0.16, 0.15],
    ambient: [0.42, 0.46, 0.55],
    light: [0.8, 0.77, 0.7],
    toward: norm([-0.5, 0.75, 0.35]),
    night: false,
  },
  sunset: {
    sky: [
      [0, [0.12, 0.2, 0.55]],
      [0.18, [0.3, 0.32, 0.72]],
      [0.3, [0.75, 0.42, 0.62]],
      [0.38, [1.1, 0.55, 0.5]],
      [HORIZON, [1.25, 0.72, 0.45]],
    ],
    orb: { x: 0, y: 0.42, r: 0.04, core: [3, 1.7, 1], glow: [1.1, 0.5, 0.35], near: 0.5, wide: 0.25 },
    orbX: -0.18,
    stars: 10,
    cloud: [
      [1.05, 0.58, 0.55],
      [0.36, 0.27, 0.52],
    ],
    sea: [
      [0.06, 0.1, 0.32],
      [0.2, 0.26, 0.62],
    ],
    mirror: 0.4,
    glitter: 1.1,
    spread: [0.05, 0.3],
    spec: [1.3, 0.62, 0.42],
    tint: [0.32, 0.24, 0.34],
    key: [1, 0.55, 0.45],
    lamp: 0.6,
    foam: [1, 0.78, 0.82],
    storm: [0.12, 0.1, 0.14],
    ambient: [0.2, 0.16, 0.3],
    light: [1.1, 0.55, 0.38],
    toward: norm([-0.3, 0.25, 0.9]),
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
    mirror: 0.7,
    glitter: 0.6,
    spread: [0.035, 0.3],
    spec: [1.1, 0.68, 0.1],
    tint: [0.06, 0.08, 0.17],
    key: [0.35, 0.5, 1.1],
    lamp: 1,
    foam: [0.1, 0.5, 0.75],
    storm: [0.02, 0.055, 0.05],
    ambient: [0.05, 0.08, 0.22],
    light: [0.16, 0.24, 0.6],
    toward: norm([-0.3, 0.55, 0.75]),
    night: true,
  },
}

// Daytime colors.
const HULL: RGB = [0.36, 0.38, 0.42]
const DECK_C: RGB = [0.2, 0.21, 0.23]
const STRIPE: RGB = [0.85, 0.85, 0.8]
const YELLOW: RGB = [0.85, 0.66, 0.12]
const JET: RGB = [0.5, 0.53, 0.58]
const SPIRIT: RGB = [0.13, 0.14, 0.17]
const FOREST: RGB = [0.1, 0.3, 0.1]
const ROCK: RGB = [0.3, 0.27, 0.22]
const AMBER: RGB = [2, 1.05, 0.3]
const BURNER: RGB = [2.6, 1.15, 0.35]

// A face of the jet in its own frame (x right, y up, z forward, in wingspans): its corners, its daytime color, and
// whether both sides show.
interface Face {
  pts: V3[]
  color: RGB
  both: boolean
}

interface Island {
  kind: "volcano" | "islets" | "stacks"
  // Its distance below the horizon, and how far to the side per unit of it.
  d: number
  x: number
}

interface Cloud {
  e: number
  x: number
  y: number
  size: number
  lumps: { x: number; y: number; r: number; seed: number }[]
  mips: Sprite[]
}

interface Sprite {
  w: number
  h: number
  ox: number
  oy: number
  rgba: Float32Array
}

interface Flare {
  x: number
  y: number
  vx: number
  vy: number
  age: number
}

class WingsFlight extends Canvas {
  private time = 0
  private creatureTime = 0
  // How many sea rows have slid by.
  private flow = 0
  private readonly activity: Activity
  private readonly look: Look
  private readonly weather: WeatherLayer
  private readonly speed: number
  private readonly bank: number
  private orb: Orb
  private stars: Star[]
  private clouds: Cloud[]
  private storm = makeStorm()
  private islands: Island[]
  private nextIsland: number
  // The carrier's stern distance in the sea camera's units, or negative while it's away.
  private carrier = { z: 60, wait: 0 }
  private crosser = { t: -1, wait: 20, y: 0.33, dir: 1 }
  private egg = { wait: eggWait() * TIME_SCALE, t: -1 }
  private maneuver = { kind: "none" as "none" | "roll" | "barrel", t: 0, dir: 1 }
  private flares: Flare[] = []
  private drops = new Float32Array(120 * 3)
  // This frame's camera: its sideways drift in world units, the jet's bank, and the horizon's tilt.
  private lateral = 0
  private roll = 0
  private tilt = 0
  // The sea: rows of jittered vertices between the horizon and the bottom, stitched into triangles each frame, and per
  // pixel of the sea's rows the two triangles under it, how much of the second and how much sea covers it.
  private mesh = { X: new Float32Array(0), Z: new Float32Array(0), height: new Float32Array(0), tris: new Int32Array(0), colors: new Float32Array(0) }
  private sea = { y0: 0, rows: new Float64Array(0), ids: new Int32Array(0), idA: new Int32Array(0), idB: new Int32Array(0), mix: new Float32Array(0), cover: new Float32Array(0), sky: new Float32Array(0) }

  constructor(settings: Settings) {
    super()
    this.activity = settings.activity
    this.speed = SPEED[settings.activity]
    this.bank = BANK[settings.activity]
    this.weather = new WeatherLayer(settings.weather ?? "clear", settings.time, HORIZON)
    const look = LOOKS[settings.time]
    this.look = this.weather.covered ? { ...look, glitter: look.glitter * 0.12 } : look
    this.orb = look.orb
    if (settings.time === "day") this.frame = 0.3
    this.stars = makeStars(look.stars, HORIZON - 0.08)
    this.clouds = Array.from({ length: 7 }, (_, i) => makeCloud(lerp(0.03, 0.42, (i + Math.random() * 0.6) / 7)))
    this.islands = [
      { kind: "volcano", d: 0.022, x: 6 },
      { kind: "islets", d: 0.034, x: -8 },
      { kind: "stacks", d: 0.012, x: 22 },
    ]
    this.nextIsland = rand(30, 50)
    for (let i = 0; i < this.drops.length; i += 3) {
      this.drops[i] = Math.random() * TAU
      this.drops[i + 1] = rand(0.02, 1.2)
      this.drops[i + 2] = Math.random()
    }
  }

  step(dt: number) {
    dt = clamp(dt, 0, 0.1) * TIME_SCALE
    this.time += dt
    this.creatureTime += dt * CREATURE_SPEED
    const rows = dt * this.speed
    this.flow += rows
    for (const i of this.islands) i.d += rows * rowHeight(i.d)
    this.islands = this.islands.filter((i) => i.d < 0.6 && Math.abs(i.x * i.d) < 2.5 + ISLAND * 0.3 * i.d)
    this.nextIsland -= dt
    if (this.nextIsland <= 0 && this.islands.length < 3) {
      const kind = (["volcano", "islets", "stacks"] as const)[Math.floor(Math.random() * 3)]
      const side = Math.random() < 0.5 ? -1 : 1
      this.islands.push({ kind, d: 0.006, x: side * (kind === "stacks" ? rand(12, 22) : rand(5, 9)) })
      this.nextIsland = this.activity === "calm" ? rand(70, 110) : rand(45, 80)
    }
    for (const c of this.clouds) {
      c.e += rows * rowHeight(c.e)
      const x = Math.abs(c.x * c.e)
      if (HORIZON - c.y * c.e < -c.size * c.e * 1.4 || x > 3) Object.assign(c, makeCloud(rand(0.02, 0.03)), { mips: [] })
    }
    this.clouds.sort((a, b) => a.e - b.e)
    const ship = this.carrier
    if (ship.z > 0) {
      ship.z -= dt * this.speed * 0.24 * Math.max(ship.z, 4) * 0.8
      if (ship.z + LENGTH < 0.3) Object.assign(ship, { z: -1, wait: rand(150, 300) })
    } else if ((ship.wait -= dt) <= 0) ship.z = 120
    const c = this.crosser
    if (c.t >= 0) c.t = c.t + dt / 28 > 1 ? -1 : c.t + dt / 28
    else if (this.activity === "teeming" && (c.wait -= dt) <= 0) Object.assign(c, { t: 0, wait: rand(40, 80), y: rand(0.3, 0.37), dir: Math.random() < 0.5 ? 1 : -1 })
    const m = this.maneuver
    if (m.kind !== "none" && (m.t += dt) > (m.kind === "roll" ? ROLL : BARREL)) m.kind = "none"
    const e = this.egg
    if (e.t >= 0) e.t = e.t + dt > EGG ? -1 : e.t + dt
    else if ((e.wait -= dt) <= 0) {
      e.t = 0
      e.wait = eggWait(true) * TIME_SCALE
    }
    for (const f of this.flares) {
      f.age += dt
      f.x += f.vx * dt
      f.y += f.vy * dt
      f.vy += 0.03 * dt
    }
    this.flares = this.flares.filter((f) => f.age < 2.5)
    if (this.gloom > 0) {
      driftClouds(this.storm, this.A, dt)
      for (let i = 0; i < this.drops.length; i += 3) {
        this.drops[i + 1] *= Math.exp(dt * (2 + this.drops[i + 2] * 2))
        if (this.drops[i + 1] > 1.3) {
          this.drops[i] = Math.random() * TAU
          this.drops[i + 1] = rand(0.03, 0.12)
        }
      }
    }
    this.stepGloom(dt)
    this.weather.step(dt)
  }

  // A click rolls the jet toward its side and pops a pair of flares.
  poke(x: number) {
    const dir = x < this.A / 2 ? -1 : 1
    if (this.maneuver.kind === "none") this.maneuver = { kind: "roll", t: 0, dir }
    for (let i = 0; i < 6; i++) {
      const side = i % 2 ? -1 : 1
      this.flares.push({ x: this.A / 2 + side * 0.03, y: JET_Y + 0.02, vx: side * rand(0.03, 0.08), vy: rand(-0.005, 0.02), age: -Math.floor(i / 2) * 0.25 })
    }
  }

  // When the agent finishes: an afterburner surge and a victory barrel roll.
  protected override visit() {
    if (this.maneuver.kind !== "barrel") this.maneuver = { kind: "barrel", t: 0, dir: Math.random() < 0.5 ? -1 : 1 }
  }

  render() {
    this.restore()
    const { W, H, look } = this
    this.camera()
    if (!this.weather.covered && look.stars) paintStars(this.hdr, W, H, this.stars, this.time, HORIZON - 0.08, look.night ? 0.55 : 0.25, this.points)
    paintStorm(this.hdr, W, H, this.storm, look.cloud[0], look.cloud[1], this.gloom)
    this.drawSea()
    // Islands, clouds and the carrier from farthest to nearest.
    const far: { depth: number; draw: () => void }[] = [
      ...this.islands.map((i) => ({ depth: i.d, draw: () => this.drawIsland(i) })),
      ...this.clouds.map((c) => ({ depth: c.e, draw: () => this.drawCloud(c) })),
    ]
    if (this.carrier.z > 0) far.push({ depth: 1 / Math.max(0.1, this.carrier.z), draw: () => this.drawCarrier() })
    for (const f of far.sort((a, b) => a.depth - b.depth)) f.draw()
    if (this.crosser.t >= 0) this.drawCrosser()
    if (this.egg.t >= 0) this.drawEgg()
    this.drawJets()
    this.drawFlares()
    if (this.gloom > 0) this.drawRain()
    this.weather.draw(this.hdr, W, H)
    this.finish()
  }

  // The sky never moves, so it's painted once per size; everything else moves with the camera.
  protected override layout() {
    const { W, H, A, look } = this
    this.orb = { ...look.orb, x: (A / 2 + look.orbX) / A }
    paintSky(this.hdr, W, H, look.sky, this.orb, this.px)
    this.weather.cover(this.hdr, W, H)
    // What the sea mirrors: the sky's average color on each row above the horizon.
    const sky = new Float32Array(H * 3)
    for (let y = 0; y < Math.ceil(HORIZON * H); y++)
      for (let x = 0; x < W; x += 2) for (let c = 0; c < 3; c++) sky[y * 3 + c] += this.hdr[(y * W + x) * 3 + c] / Math.ceil(W / 2)
    const rows = [0]
    while (rows[rows.length - 1] < 1.15 - HORIZON) rows.push(rows[rows.length - 1] + rowHeight(rows[rows.length - 1]))
    // The sea's buffers start high enough for the horizon at its steepest tilt.
    const y0 = Math.max(0, Math.floor((HORIZON - (A / 2) * 0.06 - 0.01) * H))
    const n = W * (H - y0)
    this.sea = { y0, rows: Float64Array.from(rows), ids: new Int32Array(n * 4), idA: new Int32Array(n), idB: new Int32Array(n), mix: new Float32Array(n), cover: new Float32Array(n), sky }
    for (const c of this.clouds) c.mips = []
  }

  private paint(c: RGB): RGB {
    const t = this.look.tint
    return [c[0] * t[0], c[1] * t[1], c[2] * t[2]]
  }

  // The jet's bank and drift this frame, and the horizon tilting a little against the bank.
  private camera() {
    const t = this.creatureTime
    const weave = 0.7 * Math.sin(t * 2.4) + 0.3 * Math.sin(t * 1.3 + 1)
    this.lateral = -0.6 * this.bank * weave
    const m = this.maneuver
    const nudge = m.kind === "roll" ? m.dir * 0.45 * Math.sin((Math.PI * m.t) / ROLL) : 0
    this.roll = this.bank * weave + nudge
    this.tilt = -TILT * this.roll
  }

  // A point in the unrotated view, in pixels, turned by the horizon's tilt about the middle of the horizon.
  private turn(x: number, y: number): Point {
    const cx = (this.A / 2) * this.H
    const cy = HORIZON * this.H
    const c = Math.cos(this.tilt)
    const s = Math.sin(this.tilt)
    return [cx + (x - cx) * c - (y - cy) * s, cy + (x - cx) * s + (y - cy) * c]
  }

  // The sea this frame. Rows of jittered vertices slide down the table of rows toward the camera as the jet flies on;
  // each vertex keeps its identity (column, and row counted from when it rose at the horizon), so its jitter and swell
  // travel with it, and its columns spread apart as it nears. The columns slide sideways as the jet drifts, more the
  // nearer they are. Rows are zipped into triangles, tilted with the horizon and rasterized at two samples a pixel each
  // way; each pixel keeps its two commonest triangles and how much of it they cover.
  private drawSea() {
    const { W, H, A, look } = this
    const sea = this.sea
    const m = this.mesh
    const base = Math.floor(this.flow)
    const f = this.flow - base
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
      const shift = (this.lateral * d) / w
      const row: number[] = []
      const i0 = Math.floor(shift + (-0.35 - A / 2) / w)
      const i1 = Math.ceil(shift + (A / 2 + 0.35) / w)
      for (let i = i0; i <= i1; i++) {
        row.push(xs.length)
        xs.push(A / 2 + (i + (hash2(i, q) - 0.5) * 0.7 - shift) * w)
        ys.push(HORIZON + d + (hash2(i + 71, q) - 0.5) * 0.3 * h * smoothstep(0, 0.01, d))
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
    shadeFacets(m.X, m.Z, m.height, m.tris, m.colors, sea.sky, H, this.orb.x * A - A / 2, this.orb.y, look.sea[0], look.sea[1], look.mirror, look.spec, look.glitter * (1 - 0.8 * this.gloom), look.spread, look.storm, smoothstep(0, 1, this.gloom) * 0.7)
    // Screen positions, tilted, in the sea buffer's doubled samples.
    const y0 = sea.y0
    const sx = new Float32Array(n)
    const sy = new Float32Array(n)
    for (let i = 0; i < n; i++) {
      const p = this.turn(xs[i] * H, ys[i] * H)
      sx[i] = p[0] * 2
      sy[i] = (p[1] - y0) * 2
    }
    const SW = W * 2
    const SH = (H - y0) * 2
    sea.ids.fill(-1)
    for (let k = 0; k < tris.length; k += 3) rasterTri(sea.ids, SW, SH, sx[tris[k]], sy[tris[k]], sx[tris[k + 1]], sy[tris[k + 1]], sx[tris[k + 2]], sy[tris[k + 2]], k / 3)
    const top = Math.max(y0, Math.floor(HORIZON * H - (A / 2) * H * Math.abs(Math.sin(this.tilt))) - 2)
    resolveSamples(sea.ids, W, H - y0, top - y0, sea.idA, sea.idB, sea.mix, sea.cover)
    fillSea(this.hdr, W, y0, (top - y0) * W, sea.idA, sea.idB, sea.mix, sea.cover, m.colors)
    this.touch(0, top, W - 1, H - 1)
  }

  // A flat face lit by how squarely it faces the light (0 away, 1 toward), through the island's own key light.
  private facet(c: RGB, lit: number): RGB {
    const { look } = this
    const k = clamp(lit, 0, 1)
    if (!look.night && look.tint[0] === 1) return [c[0] * (0.45 + 0.75 * k), c[1] * (0.45 + 0.75 * k), c[2] * (0.45 + 0.75 * k)]
    const t = look.tint
    return [c[0] * t[0] * 2.4 + look.key[0] * 0.08 * k, c[1] * t[1] * 2.4 + look.key[1] * 0.08 * k, c[2] * t[2] * 2.4 + look.key[2] * 0.08 * k]
  }

  // An island on the sea at its distance, sliding out to its side as it nears: the volcano on its forested island,
  // a pair of forested islets, or sea stacks on a reef. Shapes are in island units across and up from its middle.
  private drawIsland(island: Island) {
    const { A, H } = this
    const bx = A / 2 + (island.x - this.lateral) * island.d
    const by = HORIZON + island.d
    const g = ISLAND * island.d
    if (bx + 0.32 * g < -0.05 || bx - 0.32 * g > A + 0.05) return
    const P = (dx: number, up: number) => this.turn((bx + dx * g) * H, (by - up * g) * H)
    const lightSide = this.orb.x * A < bx ? -1 : 1
    const color = (c: RGB, lit: number) => this.facet(c, lit)
    if (island.kind === "volcano") {
      this.polygon([P(-0.27, 0), P(-0.2, 0.02), P(-0.1, 0.035), P(0.12, 0.035), P(0.22, 0.018), P(0.29, 0)], color(FOREST, 0.4))
      const peak = P(-0.01, 0.174)
      const feet = [-0.17, -0.1, -0.03, 0.05, 0.12, 0.18].map((dx) => P(dx, 0.029))
      this.polygon([peak, ...feet], color(ROCK, 0.5))
      for (let i = 0; i + 1 < feet.length; i++) {
        const face = (i + 0.5) / (feet.length - 1) - 0.5
        this.polygon([peak, feet[i], feet[i + 1]], color(ROCK, 0.5 + face * lightSide * 0.9))
      }
      // Forest climbing the lower slopes, ragged with treetops.
      const slope = (dx: number) => 0.029 + (1 - Math.abs(dx + 0.01) / 0.175) * 0.17
      const forest: Point[] = [P(-0.2, 0)]
      for (let i = 0; i <= 24; i++) {
        const dx = -0.19 + (i / 24) * 0.39
        const up = Math.min(slope(dx) - 0.045, 0.075) + (i % 2 ? 0.006 : 0) + hash(i * 2.1) * 0.006
        forest.push(P(dx, Math.max(up, 0.02)))
      }
      forest.push(P(0.21, 0))
      this.polygon(forest, color(FOREST, 0.5 - lightSide * 0.1))
      if (g * H > 20)
        for (let i = 0; i < 18; i++) {
          const dx = -0.22 + (i / 17) * 0.47
          const up = Math.min(slope(dx) - 0.05, 0.06) - hash(i * 5.3) * 0.02
          if (up < 0.012) continue
          const s = 0.012 + hash(i * 1.9) * 0.008
          this.polygon([P(dx, up), P(dx - s * 0.7, up - s * 1.4), P(dx + s * 0.7, up - s * 1.4)], color(FOREST, hash(i) > 0.5 ? 0.75 : 0.3))
        }
      this.polygon([P(-0.022, 0.159), P(-0.01, 0.174), P(0.004, 0.161), P(-0.01, 0.154)], color(ROCK, 0.15))
      return
    }
    if (island.kind === "islets") {
      for (const [x, w, h] of [[-0.07, 0.09, 0.05], [0.07, 0.08, 0.045]] as const) {
        const pts = [P(x - w, 0), P(x - w * 0.55, h * 0.55), P(x - w * 0.15, h), P(x + w * 0.2, h * 0.85), P(x + w * 0.6, h * 0.4), P(x + w, 0)]
        this.polygon(pts, color(FOREST, 0.5))
        for (let i = 0; i + 1 < pts.length; i++) this.polygon([P(x, 0), pts[i], pts[i + 1]], color(FOREST, 0.55 - ((i - 2) / 3) * lightSide * 0.5))
        if (g * H > 20)
          for (let i = 0; i < 7; i++) {
            const dx = (i / 6 - 0.5) * w * 1.4
            const up = h * (1 - Math.abs(dx) / w) * 0.95
            this.polygon([P(x + dx, up + 0.01), P(x + dx - 0.009, up - 0.008), P(x + dx + 0.009, up - 0.008)], color(FOREST, hash(i + x) > 0.5 ? 0.7 : 0.35))
          }
      }
      return
    }
    for (const [dx, w, h] of [[-0.03, 0.012, 0.035], [-0.012, 0.009, 0.05], [0.004, 0.011, 0.042], [0.03, 0.008, 0.028]] as const)
      this.polygon([P(dx - w, 0), P(dx - w * 0.6, h), P(dx + w * 0.3, h * 1.05), P(dx + w, 0)], color(ROCK, 0.45 + lightSide * dx * 8))
    this.polygon([P(-0.07, 0), P(-0.05, 0.008), P(0.06, 0.008), P(0.09, 0)], color(FOREST, 0.4))
  }

  // A low-poly cloud sailing toward the camera overhead, growing as it nears and slipping out over the top.
  private drawCloud(c: Cloud) {
    const { A, H } = this
    if (!c.mips.length) c.mips = cloudMips(c, H, this.weather.scud ?? this.look.cloud, this.orb.x * A - A / 2 - c.x * 0.15)
    const [x, y] = this.turn((A / 2 + (c.x - this.lateral * 0.5) * c.e) * H, (HORIZON - c.y * c.e) * H)
    const box = blitScaled(this.hdr, this.W, H, c.mips, x, y, c.e / CLOUD_E, smoothstep(0.02, 0.05, c.e))
    if (box) this.touch(box[0], box[1], box[2], box[3])
  }

  // The carrier sailing on ahead in the camera's world: u across its deck (-1 to 1), v from stern (0) to bow (1), h up
  // off the deck, in half-beams. Each face is clipped against the camera's near plane, so it can pass under the jet.
  private drawCarrier() {
    const { A, H, look } = this
    const zs = this.carrier.z
    const world = (u: number, v: number, h: number): V3 => [u * BEAMW - this.lateral, zs + v * LENGTH, DECK + h * BEAMW * RISE]
    const face = (pts: (readonly [number, number, number])[], color: RGB, alpha = 1) => {
      const clipped = clipNear(pts.map((p) => world(p[0], p[1], p[2])), 0.35)
      if (clipped.length < 3) return
      this.polygon(clipped.map((p) => this.turn((A / 2 + p[0] / p[1]) * H, (HORIZON + (CAMERA - p[2]) / p[1]) * H)), color, alpha)
    }
    const c = (color: RGB, k = 1): RGB => this.craft([color[0] * k, color[1] * k, color[2] * k])
    // Its wake trailing back toward the camera, and the hull's stern and flanks under the deck edge.
    const foam = look.night ? 0.06 : 0.12
    face([[-0.9, 0, -0.42], [0.9, 0, -0.42], [1.8, -1.2, -0.42], [-1.8, -1.2, -0.42]], look.foam, foam)
    face([[-0.45, 0, -0.42], [0.45, 0, -0.42], [0.7, -0.7, -0.42], [-0.7, -0.7, -0.42]], look.foam, foam * 1.5)
    face([[-0.92, 0, 0], [0.92, 0, 0], [0.82, 0, -0.42], [-0.82, 0, -0.42]], c(HULL, 0.8))
    face([[0.92, 0, 0], [0.95, 0.9, 0], [0.8, 0.9, -0.42], [0.82, 0, -0.42]], c(HULL, 0.55))
    face([[-0.92, 0, 0], [-0.95, 0.9, 0], [-0.8, 0.9, -0.42], [-0.82, 0, -0.42]], c(HULL, 0.45))
    face([[-1, 0, 0], [1, 0, 0], [1, 0.88, 0], [0.8, 1.02, 0], [-0.8, 1.02, 0], [-1, 0.88, 0]], c(HULL, 0.6))
    face([[-0.96, 0.01, 0], [0.96, 0.01, 0], [0.96, 0.87, 0], [0.77, 1, 0], [-0.77, 1, 0], [-0.96, 0.87, 0]], c(DECK_C))
    const near = zs < 60
    if (near) {
      const line = (u0: number, v0: number, u1: number, v1: number, w: number, color: RGB, k = 1) => face([[u0 - w, v0, 0], [u0 + w, v0, 0], [u1 + w, v1, 0], [u1 - w, v1, 0]], c(color, k))
      line(-0.62, 0.05, -0.62, 0.97, 0.02, STRIPE, 0.8)
      line(0.42, 0.05, 0.42, 0.97, 0.02, STRIPE, 0.8)
      for (let v = 0.2; v < 0.95; v += 0.11) line(-0.1, v, -0.1, v + 0.06, 0.022, STRIPE, 0.9)
      line(0.2, 0.18, 0.2, 0.96, 0.012, YELLOW)
      line(-0.35, 0.3, -0.12, 0.96, 0.012, YELLOW, 0.9)
      for (let i = 0; i < 8; i++) {
        const u = -0.55 + i * 0.12
        face([[u, 0.06, 0], [u + 0.07, 0.06, 0], [u + 0.07, 0.12, 0], [u, 0.12, 0]], c(STRIPE, 0.85))
      }
    }
    // The island superstructure on the starboard side, its bridge windows and mast.
    const k = (v: number) => c(HULL, v)
    const [u0, u1, v0, v1, top] = [0.66, 0.96, 0.44, 0.68, 1]
    face([[u0, v0, 0], [u0, v1, 0], [u0, v1, top], [u0, v0, top]], k(0.7))
    face([[u0, v0, 0], [u1, v0, 0], [u1, v0, top], [u0, v0, top]], k(0.9))
    face([[u0, v0, top], [u1, v0, top], [u1, v1, top], [u0, v1, top]], k(1.15))
    face([[0.72, 0.5, top], [0.72, 0.64, top], [0.72, 0.64, top + 0.4], [0.72, 0.5, top + 0.4]], k(0.62))
    face([[0.72, 0.5, top], [0.92, 0.5, top], [0.92, 0.5, top + 0.4], [0.72, 0.5, top + 0.4]], k(0.85))
    face([[0.72, 0.5, top + 0.4], [0.92, 0.5, top + 0.4], [0.92, 0.64, top + 0.4], [0.72, 0.64, top + 0.4]], k(1.1))
    face([[0.73, 0.5, top + 0.3], [0.91, 0.5, top + 0.3], [0.91, 0.5, top + 0.2], [0.73, 0.5, top + 0.2]], look.night ? [0.6, 0.3, 0.06] : k(0.3))
    face([[0.8, 0.57, top + 0.4], [0.84, 0.57, top + 0.4], [0.83, 0.57, 2.1], [0.81, 0.57, 2.1]], k(0.75))
    face([[0.74, 0.57, 1.82], [0.9, 0.57, 1.82], [0.9, 0.57, 1.76], [0.74, 0.57, 1.76]], k(0.75))
    // Deck lights at night, and its beacons always.
    const lamp = (u: number, v: number, h: number, color: RGB, k: number, size: number) => {
      const p = world(u, v, h)
      if (p[1] < 0.6) return
      const [x, y] = this.turn((A / 2 + p[0] / p[1]) * H, (HORIZON + (CAMERA - p[2]) / p[1]) * H)
      if (this.cells) this.point(x, y, color[0] * k, color[1] * k, color[2] * k, size, true)
      else this.disc(x, y, Math.max(0.6, (0.004 * H) / p[1]), color[0] * k, color[1] * k, color[2] * k, 1)
    }
    const glow = look.lamp * 0.5
    if (look.lamp > 0.5)
      for (let v = 0.04; v < 0.99; v += near ? 0.075 : 0.3) {
        lamp(-0.97, v, 0, AMBER, glow, 1)
        lamp(0.97, v, 0, AMBER, glow, 1)
      }
    const blink = 0.3 + 0.7 * Math.max(0, Math.sin(this.time * 2)) ** 4
    lamp(0.82, 0.57, 2.1, [2, 0.3, 0.15], blink * Math.max(0.4, glow), 2)
    if (look.lamp > 0.5 && zs < 12) {
      const [cx, cy] = this.turn((A / 2 - this.lateral / (zs + 1.5)) * H, (HORIZON + (CAMERA - DECK) / (zs + 1.5)) * H)
      lightPool(this.hdr, this.W, H, cx, cy, (0.6 * H) / (zs + 1.5), (0.3 * H) / (zs + 1.5), [1, 0.6, 0.25], 1, 0.01)
    }
  }

  // The jets: the lead seen from behind near the bottom, and its wingmen holding formation off to the sides.
  private drawJets() {
    const { A, H } = this
    const t = this.creatureTime
    const m = this.maneuver
    const barrel = m.kind === "barrel" ? m.dir * TAU * smoothstep(0.3, BARREL - 0.3, m.t) : 0
    const surge = m.kind === "barrel" ? Math.sin((Math.PI * m.t) / BARREL) : 0
    const shake = this.gloom * 0.008
    const dx = (-this.lateral * 0.05 + shake * (noise1(this.time * 4) - 0.5)) * H
    const dy = (0.004 * Math.sin(t * 5.3) + shake * (noise1(this.time * 4, 3) - 0.5)) * H
    const wing = this.activity === "teeming" ? [-1, 1] : this.activity === "lively" ? [1] : []
    for (const side of wing) {
      const off = Math.min(0.6, A / 2 - 0.2)
      const x = (A / 2 + side * off + 0.01 * Math.sin(t * 2.3 + side)) * H
      const y = (JET_Y - 0.07 + 0.006 * Math.sin(t * 3.7 + side * 2)) * H
      this.drawJet(x, y, 0.42 * SPAN * H, this.roll + 0.03 * Math.sin(t * 2.9 + side), 0.8)
    }
    this.drawJet((A / 2) * H + dx, JET_Y * H + dy, SPAN * H, this.roll + barrel, 1 + 0.9 * surge)
  }

  // A jet from behind and a little above, banked by roll: faceted fuselage, swept wings, twin canted tails, and two
  // nozzles glowing amber with a slow afterburner flicker. s is its wingspan in pixels.
  private drawJet(cx: number, cy: number, s: number, roll: number, burn: number) {
    const { look } = this
    const cr = Math.cos(roll)
    const sr = Math.sin(roll)
    const ce = Math.cos(ELEVATION)
    const se = Math.sin(ELEVATION)
    const rot = (p: V3): V3 => [p[0] * cr + p[1] * sr, p[1] * cr - p[0] * sr, p[2]]
    const project = (p: V3): Point => {
      const depth = -p[1] * se + p[2] * ce
      const k = s / (1 + 0.35 * depth)
      return [cx + p[0] * k, cy - (p[1] * ce + p[2] * se) * k]
    }
    const drawn = FACES.flatMap((f) => {
      const pts = f.pts.map(rot)
      const [a, b, c] = pts
      let n = norm(cross([b[0] - a[0], b[1] - a[1], b[2] - a[2]], [c[0] - a[0], c[1] - a[1], c[2] - a[2]]))
      const facing = n[1] * se - n[2] * ce
      if (facing <= 0 && !f.both) return []
      if (facing <= 0) n = [-n[0], -n[1], -n[2]]
      const L = look.toward
      const lit = Math.max(0, n[0] * L[0] + n[1] * L[1] + n[2] * L[2])
      const up = Math.max(0, n[1]) * 0.25
      const color: RGB = [0, 1, 2].map((i) => f.color[i] * (look.ambient[i] * (0.8 + up) + look.light[i] * lit)) as RGB
      const depth = pts.reduce((sum, p) => sum + (-p[1] * se + p[2] * ce), 0) / pts.length
      return [{ pts: pts.map(project), color, depth }]
    })
    for (const f of drawn.sort((a, b) => b.depth - a.depth)) this.polygon(f.pts, f.color)
    // The nozzles, a slow shimmer in their glow, and at night a warm pool around them.
    const flick = 1 + 0.12 * (noise1(this.time * 5 + cx) - 0.5)
    const k = burn * flick * (look.night ? 1 : 0.8)
    for (const side of [-1, 1]) {
      const [x, y] = project(rot([side * 0.045, 0.005, -0.5]))
      const [tx, ty] = project(rot([side * 0.045, 0.005, -0.62 - 0.1 * burn]))
      trail(this.hdr, this.W, this.H, x, y, tx, ty, 0.03 * s, BURNER, 0.35 * Math.min(1, k))
      this.disc(x, y, 0.045 * s, BURNER[0] * 0.25 * k, BURNER[1] * 0.25 * k, BURNER[2] * 0.25 * k, 0.6)
      this.disc(x, y, 0.024 * s, BURNER[0] * 0.8 * k, BURNER[1] * 0.8 * k, BURNER[2] * 0.8 * k, 1)
      this.touch(Math.min(x, tx) - 0.06 * s, Math.min(y, ty) - 0.06 * s, Math.max(x, tx) + 0.06 * s, Math.max(y, ty) + 0.06 * s)
      // Red to port, green to starboard.
      const [wx, wy] = project(rot([side * 0.5, -0.005, -0.27]))
      const nav = look.night ? 0.8 : 0.35
      this.disc(wx, wy, Math.max(0.8, 0.011 * s), side < 0 ? 1.8 * nav : 0.2 * nav, side < 0 ? 0.25 * nav : 1.6 * nav, side < 0 ? 0.15 * nav : 0.5 * nav, 1)
    }
    if (look.night) {
      const [x, y] = project(rot([0, 0, -0.5]))
      lightPool(this.hdr, this.W, this.H, x, y, 0.22 * s, 0.14 * s, [1, 0.5, 0.15], 0, 0.05 * k)
    }
  }

  // An aircraft's color: its daytime color darkened for the time of day, kept a little lighter than the sky at night so
  // it reads as a silhouette.
  private craft(c: RGB): RGB {
    const k = this.look.night ? 3.2 : 1
    const p = this.paint(c)
    return [p[0] * k, p[1] * k, p[2] * k]
  }

  // At teeming a jet now and then crosses far ahead, small against the sky above the horizon.
  private drawCrosser() {
    const { A, H } = this
    const f = this.crosser
    const u = f.dir > 0 ? f.t : 1 - f.t
    const [x, y] = this.turn(lerp(-0.1, A + 0.1, u) * H, f.y * H)
    const heading = f.dir > 0 ? 0.03 : Math.PI - 0.03
    this.planform(x, y, 0.026 * H, heading, 0.4, JETFORM, this.craft(JET))
    if (this.look.lamp > 0.5) this.splat(x - Math.cos(heading) * 0.013 * H, y, BURNER[0] * 0.3, BURNER[1] * 0.3, BURNER[2] * 0.3)
  }

  // An aircraft's outline seen from above or below, nose along heading, flattened by the view.
  private planform(x: number, y: number, s: number, heading: number, squash: number, form: readonly (readonly Point[])[], color: RGB, alpha = 1) {
    const fx = Math.cos(heading)
    const fy = Math.sin(heading) * squash
    const sx = -Math.sin(heading)
    const sy = Math.cos(heading) * squash
    for (const poly of form) this.polygon(poly.map(([a, b]) => [x + (a * fx + b * sx) * s, y + (a * fy + b * sy) * s] as const), color, alpha)
  }

  // The easter egg: a B-2 overtakes from behind the camera, high overhead, and glides on out toward the horizon.
  private drawEgg() {
    const { A, H } = this
    const t = this.egg.t / EGG
    const z = lerp(0.3, 6, t ** 1.4)
    const x = (A / 2 + 0.05 / z) * H
    const s = (0.5 / z) * H
    const fade = 1 - smoothstep(0.85, 1, t)
    const y = (HORIZON - 0.1 - 0.45 / z) * H
    if (y + s * 0.3 < 0) return
    if (this.look.night) this.planform(x, y - 0.004 * H, s * 1.04, Math.PI / 2, 0.3, SPIRITFORM, [this.look.key[0] * 0.25, this.look.key[1] * 0.25, this.look.key[2] * 0.25], fade)
    this.planform(x, y, s, Math.PI / 2, 0.3, SPIRITFORM, this.craft(SPIRIT), fade)
  }

  // Flares popped by a click, arcing out and down and burning out.
  private drawFlares() {
    const H = this.H
    for (const f of this.flares) {
      if (f.age < 0) continue
      const k = (1 - f.age / 2.5) ** 1.5
      this.disc(f.x * H, f.y * H, 0.012 * H, AMBER[0] * 0.5, AMBER[1] * 0.5, AMBER[2] * 0.5, 0.5 * k)
      this.splat(f.x * H, f.y * H, BURNER[0] * k, BURNER[1] * k, BURNER[2] * k)
    }
  }

  // Rain in the storm after an error, streaking past the camera out from the middle of the horizon.
  private drawRain() {
    const { W, H, A, look } = this
    const k = smoothstep(0.2, 1, this.gloom)
    const color: RGB = look.night ? [0.08, 0.2, 0.5] : [0.35, 0.42, 0.45]
    const d = this.drops
    const cx = (A / 2) * H
    const cy = HORIZON * H
    for (let i = 0; i < d.length; i += 3) {
      const r = d[i + 1] * H
      const ax = Math.cos(d[i]) * 1.3
      const ay = Math.sin(d[i]) * 0.8
      trail(this.hdr, W, H, cx + ax * r, cy + ay * r, cx + ax * r * 0.82, cy + ay * r * 0.82, 0.6, color, k * (0.25 + d[i + 2] * 0.4) * smoothstep(0.05, 0.25, d[i + 1]))
    }
    this.touch(0, 0, W - 1, H - 1)
  }
}

function norm(v: V3): V3 {
  const l = Math.hypot(v[0], v[1], v[2]) || 1
  return [v[0] / l, v[1] / l, v[2] / l]
}

function cross(a: V3, b: V3): V3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
}

// The jet's faces, wound so their normals point outward.
const FACES: Face[] = (() => {
  const faces: Face[] = []
  const body = JET
  const dark: RGB = [JET[0] * 0.6, JET[1] * 0.6, JET[2] * 0.65]
  // Fuselage rings from the exhaust to the cockpit, closing to the nose.
  const ring = (z: number, w: number, top: number, bottom: number): V3[] => [
    [-w, 0, z],
    [-w * 0.7, top, z],
    [w * 0.7, top, z],
    [w, 0, z],
    [w * 0.7, -bottom, z],
    [-w * 0.7, -bottom, z],
  ]
  const rings = [ring(-0.5, 0.1, 0.05, 0.04), ring(-0.05, 0.09, 0.065, 0.045), ring(0.3, 0.05, 0.05, 0.04)]
  const nose: V3 = [0, 0, 0.62]
  for (let r = 0; r + 1 < rings.length; r++)
    for (let i = 0; i < 6; i++) {
      const j = (i + 1) % 6
      faces.push({ pts: [rings[r][i], rings[r + 1][i], rings[r + 1][j], rings[r][j]], color: body, both: false })
    }
  for (let i = 0; i < 6; i++) faces.push({ pts: [rings[2][i], nose, rings[2][(i + 1) % 6]], color: body, both: false })
  faces.push({ pts: [...rings[0]].reverse(), color: dark, both: false })
  // Swept wings, tailplanes and canted fins, mirrored.
  for (const m of [1, -1]) {
    const M = (pts: V3[]): V3[] => (m > 0 ? pts : pts.map((p) => [-p[0], p[1], p[2]] as V3).reverse())
    faces.push({ pts: M([[0.08, 0, 0.14], [0.09, 0, -0.32], [0.5, -0.012, -0.3], [0.5, -0.012, -0.22]]), color: body, both: true })
    faces.push({ pts: M([[0.07, 0, -0.34], [0.07, 0, -0.55], [0.24, -0.01, -0.53], [0.24, -0.01, -0.46]]), color: body, both: true })
    faces.push({ pts: M([[0.06, 0.05, -0.2], [0.11, 0.22, -0.4], [0.11, 0.22, -0.52], [0.06, 0.05, -0.46]]), color: [JET[0] * 0.8, JET[1] * 0.8, JET[2] * 0.85], both: true })
  }
  // The canopy, a dark glass wedge on the spine.
  const glass: RGB = [0.08, 0.12, 0.2]
  faces.push({ pts: [[-0.028, 0.06, 0.1], [0.028, 0.06, 0.1], [0, 0.095, 0.17]], color: glass, both: false })
  faces.push({ pts: [[0.028, 0.06, 0.1], [0.022, 0.055, 0.36], [0, 0.095, 0.17]], color: glass, both: false })
  faces.push({ pts: [[-0.028, 0.06, 0.1], [0, 0.095, 0.17], [-0.022, 0.055, 0.36]], color: glass, both: false })
  return faces
})()

// Top-down outlines, nose toward +a, span along b, for planform().
const JETFORM: Point[][] = [
  [[0.5, 0], [0.3, 0.05], [-0.5, 0.06], [-0.5, -0.06], [0.3, -0.05]],
  [[0.12, 0.05], [-0.14, 0.42], [-0.24, 0.42], [-0.2, 0.05]],
  [[0.12, -0.05], [-0.14, -0.42], [-0.24, -0.42], [-0.2, -0.05]],
  [[-0.34, 0.05], [-0.48, 0.22], [-0.53, 0.22], [-0.5, 0.05]],
  [[-0.34, -0.05], [-0.48, -0.22], [-0.53, -0.22], [-0.5, -0.05]],
]
const SPIRITFORM: Point[][] = [
  [[0.3, 0], [-0.08, 0.55], [-0.2, 0.36], [-0.1, 0.22], [-0.22, 0.1], [-0.12, 0], [-0.22, -0.1], [-0.1, -0.22], [-0.2, -0.36], [-0.08, -0.55]],
]

// A cloud at nearness e: lumps heaped along a flat base, its height over the camera and its side in world units.
function makeCloud(e: number): Cloud {
  const n = 3 + Math.floor(Math.random() * 3)
  const lumps = Array.from({ length: n }, (_, k) => {
    const f = k / (n - 1) - 0.5
    return { x: f * 1.6 + rand(-0.1, 0.1), y: 0, r: (0.55 - Math.abs(f) * 0.5) * rand(0.8, 1.2), seed: Math.random() * 100 }
  })
  for (const l of lumps) l.y = -l.r * 0.6
  const side = Math.random() < 0.5 ? -1 : 1
  return { e, x: side * rand(0.5, 5), y: rand(0.6, 1.1), size: rand(0.18, 0.32), lumps, mips: [] }
}

// Renders a cloud's lumps as faceted polygons into a premultiplied RGBA sprite at its size when CLOUD_E near, and
// halves it a few times for when it's farther: each lump a fan of triangles around a hub, every facet lit by how
// squarely it faces the light.
function cloudMips(c: Cloud, H: number, colors: [RGB, RGB], toLight: number): Sprite[] {
  const S = 4
  const size = c.size * CLOUD_E * H
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
      tones.push(clamp(0.5 + 0.6 * ((mx / ml) * lx + (my / ml) * ly) + (hash(l.seed + k * 5.1) - 0.5) * 0.2, 0, 1))
      rasterTri(fine, w * S, h * S, hub[0] * S, hub[1] * S, a[0] * S, a[1] * S, b[0] * S, b[1] * S, tones.length - 1)
    }
  }
  const rgba = new Float32Array(w * h * 4)
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let a = 0
      const o = (y * w + x) * 4
      for (let j = 0; j < S; j++)
        for (let i = 0; i < S; i++) {
          const id = fine[(y * S + j) * w * S + x * S + i]
          if (id < 0) continue
          const t = tones[id]
          for (let k = 0; k < 3; k++) rgba[o + k] += lerp(shade[k], lit[k], t) / (S * S)
          a++
        }
      rgba[o + 3] = a / (S * S)
    }
  const mips: Sprite[] = [{ w, h, ox, oy, rgba }]
  while (mips.length < 6) {
    const p = mips[mips.length - 1]
    const mw = Math.ceil(p.w / 2)
    const mh = Math.ceil(p.h / 2)
    if (mw < 2 || mh < 2) break
    const m = new Float32Array(mw * mh * 4)
    for (let y = 0; y < mh; y++)
      for (let x = 0; x < mw; x++)
        for (let k = 0; k < 4; k++) {
          let sum = 0
          for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) sum += 2 * x + i < p.w && 2 * y + j < p.h ? p.rgba[((2 * y + j) * p.w + 2 * x + i) * 4 + k] : 0
          m[(y * mw + x) * 4 + k] = sum / 4
        }
    mips.push({ w: mw, h: mh, ox: p.ox / 2, oy: p.oy / 2, rgba: m })
  }
  return mips
}

// Composites a cloud scaled by scale (at most 1) with its anchor at (cx, cy), from the mip level nearest above that
// size, sampled bilinearly so it glides as it grows; returns the box it drew in.
function blitScaled(hdr: Float32Array, W: number, H: number, mips: Sprite[], cx: number, cy: number, scale: number, alpha: number) {
  if (alpha <= 0 || scale <= 0) return undefined
  const level = clamp(Math.floor(Math.log2(1 / Math.min(1, scale))), 0, mips.length - 1)
  const s = mips[level]
  const k = Math.min(1, scale) * 2 ** level
  const x0 = Math.max(0, Math.floor(cx - s.ox * k) - 1)
  const x1 = Math.min(W - 1, Math.ceil(cx + (s.w - s.ox) * k) + 1)
  const y0 = Math.max(0, Math.floor(cy - s.oy * k) - 1)
  const y1 = Math.min(H - 1, Math.ceil(cy + (s.h - s.oy) * k) + 1)
  if (x0 > x1 || y0 > y1) return undefined
  const d = s.rgba
  for (let y = y0; y <= y1; y++) {
    const sy = (y + 0.5 - cy) / k + s.oy - 0.5
    const iy = Math.floor(sy)
    const fy = sy - iy
    if (iy < -1 || iy >= s.h) continue
    for (let x = x0; x <= x1; x++) {
      const sx = (x + 0.5 - cx) / k + s.ox - 0.5
      const ix = Math.floor(sx)
      if (ix < -1 || ix >= s.w) continue
      const fx = sx - ix
      let r = 0
      let g = 0
      let b = 0
      let a = 0
      for (let q = 0; q < 4; q++) {
        const u = ix + (q & 1)
        const v = iy + (q >> 1)
        if (u < 0 || v < 0 || u >= s.w || v >= s.h) continue
        const wgt = (q & 1 ? fx : 1 - fx) * (q >> 1 ? fy : 1 - fy) * alpha
        const o = (v * s.w + u) * 4
        r += d[o] * wgt
        g += d[o + 1] * wgt
        b += d[o + 2] * wgt
        a += d[o + 3] * wgt
      }
      if (a <= 0) continue
      const o = (y * W + x) * 3
      hdr[o] = hdr[o] * (1 - a) + r
      hdr[o + 1] = hdr[o + 1] * (1 - a) + g
      hdr[o + 2] = hdr[o + 2] * (1 - a) + b
    }
  }
  return [x0, y0, x1, y1] as const
}

// Clips a polygon in the camera's world (x, distance, height) to distances of at least near.
function clipNear(pts: V3[], near: number): V3[] {
  const out: V3[] = []
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]
    const b = pts[(i + 1) % pts.length]
    if (a[1] >= near) out.push(a)
    if (a[1] >= near !== b[1] >= near) {
      const t = (near - a[1]) / (b[1] - a[1])
      out.push([a[0] + (b[0] - a[0]) * t, near, a[2] + (b[2] - a[2]) * t])
    }
  }
  return out
}

// The height of the sea's row d below the horizon: rows grow toward the viewer, though never thinner than a sliver.
function rowHeight(d: number) {
  return Math.max(0.0035, d * 0.24 + 0.003)
}

// For each pixel of a W x H grid sampled two by two, from row y0 down: its commonest triangle, the next, how much of
// the next, and how many of its samples any triangle covers.
function resolveSamples(ids: Int32Array, W: number, H: number, y0: number, idA: Int32Array, idB: Int32Array, mix: Float32Array, cover: Float32Array) {
  const SW = W * 2
  for (let y = Math.max(0, y0); y < H; y++)
    for (let x = 0; x < W; x++) {
      const o = y * 2 * SW + x * 2
      const r0 = ids[o]
      const r1 = ids[o + 1]
      const r2 = ids[o + SW]
      const r3 = ids[o + SW + 1]
      const i = y * W + x
      const n = (r0 >= 0 ? 1 : 0) + (r1 >= 0 ? 1 : 0) + (r2 >= 0 ? 1 : 0) + (r3 >= 0 ? 1 : 0)
      cover[i] = n / 4
      if (!n) continue
      const s0 = r0 >= 0 ? r0 : r1 >= 0 ? r1 : r2 >= 0 ? r2 : r3
      const s1 = r1 >= 0 ? r1 : s0
      const s2 = r2 >= 0 ? r2 : s0
      const s3 = r3 >= 0 ? r3 : s0
      const second = s1 !== s0 ? s1 : s2 !== s0 ? s2 : s3
      const n0 = 1 + (s1 === s0 ? 1 : 0) + (s2 === s0 ? 1 : 0) + (s3 === s0 ? 1 : 0)
      const n1 = second === s0 ? 0 : (s1 === second ? 1 : 0) + (s2 === second ? 1 : 0) + (s3 === second ? 1 : 0)
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

// Shades every facet from its tilted normal: the sea's own color lit from above, the sky it mirrors (more at grazing
// angles), the sun or moon glittering in facets tilted just right, and the storm's dark green-gray after an error.
function shadeFacets(X: Float32Array, Z: Float32Array, Y: Float32Array, tris: Int32Array, colors: Float32Array, sky: Float32Array, H: number, ox: number, oy: number, deep: RGB, lit: RGB, mirror: number, spec: RGB, glitter: number, spread: readonly [number, number], storm: RGB, gloom: number) {
  const top = Math.ceil(HORIZON * H) - 1
  for (let t = 0; t < tris.length; t += 3) {
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
    const row = ry <= 0 || rz <= 0 ? top : clamp(Math.round((HORIZON - (FOCAL * ry) / rz) * H), 0, top)
    const fres = 0.12 + 0.88 * (1 - ndv) ** 3
    // Glitter where the reflected ray meets the sky near the sun or moon, lined up into a path down the water.
    const gx = rz > 0.01 ? (FOCAL * rx) / rz - ox : 9
    const gy = rz > 0.01 ? HORIZON - (FOCAL * ry) / rz - oy : 9
    // Big facets near the viewer flash less, so they don't flicker whole cells.
    const s = Math.exp(-((gx / spread[0]) ** 2) - (gy / spread[1]) ** 2) * glitter * (0.3 + 0.7 * smoothstep(2, 6, pz))
    const diffuse = clamp(0.5 + nx * 1.6 - nz * 0.8, 0, 1)
    for (let k = 0; k < 3; k++) {
      const body = deep[k] + (lit[k] - deep[k]) * diffuse
      const v = (body * (1 - fres) + sky[row * 3 + k] * fres * mirror) * (1 - Math.min(1, s) * 0.75) + spec[k] * s
      colors[t + k] = v + (storm[k] - v) * gloom
    }
  }
}

// Paints the sea's rows from the facet colors, from index start of the sea buffer on: each pixel mixes its two
// triangles over whatever is behind it by how much of it they cover.
function fillSea(hdr: Float32Array, W: number, y0: number, start: number, idA: Int32Array, idB: Int32Array, mix: Float32Array, cover: Float32Array, colors: Float32Array) {
  const base = y0 * W * 3
  for (let i = Math.max(0, start); i < idA.length; i++) {
    const w = cover[i]
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

// A soft line from head to tail, fading toward the tail, mixed over the scene; for exhaust and rain.
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

export const wingsFlight: Wallpaper = {
  id: "wings-flight",
  name: "Wings: Flight",
  description: "A chase camera behind a fighter jet gliding over a low-poly sea, from Anomaly Arcade's Wings",
  collection: "Arcade",
  activity: {
    calm: "The jet cruising low over faceted swells, past volcano islands and now and then over the carrier",
    lively: "A little faster, with gentle banking turns and a wingman in formation",
    teeming: "Two wingmen, and now and then another jet crossing far ahead",
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
  create: (settings) => new WingsFlight(settings),
}
