import { Canvas } from "../src/canvas"
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
const STERN = 0.95
const BEAM = 0.12
const BOW = 0.45
const VANISH = 0.02
// How long a jet launch, a landing, the A-10 and B-2 passes and the flyover last, in scene seconds.
const LAUNCH = 7
const LANDING = 8
const SPARKLE = 2.2

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

interface Jet {
  kind: "launch" | "landing"
  t: number
  side: number
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
  private mesh = { X: new Float32Array(0), Z: new Float32Array(0), amp: new Float32Array(0), rate: new Float32Array(0), phase: new Float32Array(0), height: new Float32Array(0), tris: new Int32Array(0), colors: new Float32Array(0) }
  private sea: { y0: number; idA: Int32Array; idB: Int32Array; mix: Float32Array; open: Float32Array; glow: Float32Array; sky: Float32Array } = { y0: 0, idA: new Int32Array(0), idB: new Int32Array(0), mix: new Float32Array(0), open: new Float32Array(0), glow: new Float32Array(0), sky: new Float32Array(0) }
  private jets: Jet[] = []
  private nextLaunch: number
  private nextLanding = 20
  private warthog: Flier = { t: -1, wait: 11, span: 13, y: 0.57, dir: 1 }
  private spirit: Flier = { t: -1, wait: 3, span: 40, y: 0.11, dir: -1 }
  private flyover = { t: -1, dir: 1, y: 0.16 }
  private egg = { wait: eggWait() * TIME_SCALE, t: -1 }
  private sparkles: { x: number; y: number; age: number; seed: number }[] = []
  private drops = new Float32Array(160 * 3)
  // Deck and island lights: positions in pixels, colors, and which blink.
  private lamps: { x: number; y: number; color: RGB; blink: number; size: number }[] = []

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
    this.nextLaunch = settings.activity === "teeming" ? 6 : 14
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
    this.stepJets(dt)
    this.stepFlier(this.warthog, dt, this.activity === "teeming", 40, 70, () => this.openRow(0.53, 0.6))
    this.stepFlier(this.spirit, dt, this.activity === "teeming", 70, 110, () => rand(0.07, 0.14))
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
    if (!this.jets.some((j) => j.kind === "launch")) this.jets.push({ kind: "launch", t: 0, side: Math.random() < 0.5 ? -1 : 1 })
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
    if (this.activity === "teeming") this.drawCircling()
    if (this.spirit.t >= 0) this.drawSpirit(this.spirit)
    if (this.flyover.t >= 0) this.drawFlyover()
    this.drawSea()
    this.drawSparkles()
    if (this.warthog.t >= 0) this.drawWarthog(this.warthog)
    this.drawLamps()
    for (const j of this.jets) this.drawJet(j)
    if (this.egg.t >= 0) this.drawEgg()
    if (this.gloom > 0) this.drawRain()
    this.weather.draw(this.hdr, W, H)
    this.finish()
  }

  // The sky, islands and carrier never move, so they're painted once per size; the sea is drawn over them each frame
  // wherever it shows.
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
    this.drawCarrier()
    if (this.activity !== "calm") this.drawParked()
    // How much sea shows in each pixel: everything above drawn again, flat, into a blank buffer.
    const hdr = this.hdr
    this.hdr = new Float32Array(W * H * 3)
    this.drawIslands(true)
    if (this.activity === "teeming") this.drawEscorts(true)
    this.drawCarrier(true)
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
        const d = ((x - cx) / (0.3 * H)) ** 2 + ((y - 0.83 * H) / (0.17 * H)) ** 2
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

  // Rows of vertices from the horizon down, growing toward the viewer, each row's vertices spaced wider than the row is
  // tall and jittered so the facets read as hand-cut. Neighboring rows are zipped into triangles.
  private buildSea(sky: Float32Array) {
    const { H, A } = this
    const xs: number[] = []
    const ys: number[] = []
    const rows: number[][] = []
    const amp: number[] = []
    let d = 0
    for (let k = 0; HORIZON + d < 1.08; k++) {
      const h = Math.max(0.0035, d * 0.17 + 0.003)
      const w = Math.max(0.018, h * 2.3)
      const row: number[] = []
      const n = Math.ceil((A + 0.4) / w)
      for (let i = 0; i <= n; i++) {
        const jx = k ? (hash2(i, k) - 0.5) * 0.7 : 0
        const jy = k ? (hash2(i + 71, k) - 0.5) * 0.3 * h : 0
        row.push(xs.length)
        xs.push(-0.2 + (i + jx) * w)
        ys.push(HORIZON + d + jy)
        // Calmer toward the horizon, where the facets get smaller than a cell.
        amp.push(w * 0.45 * smoothstep(0.004, 0.08, d))
      }
      rows.push(row)
      d += h
    }
    const tris: number[] = []
    for (let k = 0; k + 1 < rows.length; k++) stitch(rows[k], rows[k + 1], xs, tris)
    const n = xs.length
    const m = this.mesh
    m.X = new Float32Array(n)
    m.Z = new Float32Array(n)
    m.amp = Float32Array.from(amp)
    m.rate = new Float32Array(n)
    m.phase = new Float32Array(n)
    m.height = new Float32Array(n)
    for (let i = 0; i < n; i++) {
      const z = (FOCAL * CAMERA) / Math.max(0.002, ys[i] - HORIZON)
      m.Z[i] = z
      m.X[i] = ((xs[i] - A / 2) * z) / FOCAL
      m.rate[i] = 0.5 + hash(i * 1.7) * 0.6
      m.phase[i] = hash(i * 3.3) * TAU
    }
    m.tris = Int32Array.from(tris)
    m.colors = new Float32Array((tris.length / 3) * 3)
    // Two samples a pixel each way; each pixel keeps its two commonest triangles.
    const y0 = Math.floor(HORIZON * H)
    const W = this.W
    const rowsPx = H - y0
    const SW = W * 2
    const ids = new Int32Array(SW * rowsPx * 2).fill(-1)
    for (let t = 0; t < tris.length; t += 3) {
      const a = tris[t]
      const b = tris[t + 1]
      const c = tris[t + 2]
      rasterTri(ids, SW, rowsPx * 2, xs[a] * H * 2, (ys[a] * H - y0) * 2, xs[b] * H * 2, (ys[b] * H - y0) * 2, xs[c] * H * 2, (ys[c] * H - y0) * 2, t / 3)
    }
    const idA = new Int32Array(W * rowsPx)
    const idB = new Int32Array(W * rowsPx)
    const mix = new Float32Array(W * rowsPx)
    for (let y = 0; y < rowsPx; y++)
      for (let x = 0; x < W; x++) {
        const s = [ids[y * 2 * SW + x * 2], ids[y * 2 * SW + x * 2 + 1], ids[(y * 2 + 1) * SW + x * 2], ids[(y * 2 + 1) * SW + x * 2 + 1]].map((v) => (v < 0 ? 0 : v))
        const first = s[0]
        const others = s.filter((v) => v !== first)
        const second = others.length ? others[0] : first
        const nFirst = s.filter((v) => v === first).length
        const nSecond = s.filter((v) => v === second).length
        const i = y * W + x
        idA[i] = nFirst >= nSecond ? first : second
        idB[i] = nFirst >= nSecond ? second : first
        mix[i] = (first === second ? 0 : Math.min(nFirst, nSecond)) / 4
      }
    this.sea = { ...this.sea, y0, idA, idB, mix, sky }
  }

  // Each facet's color this frame: the sea's own color lit from above, the sky it mirrors (more at grazing angles), the
  // sun or moon glittering in facets tilted just right, and the storm's dark green-gray after an error.
  private shadeSea() {
    const { H, A, look } = this
    const m = this.mesh
    const t = this.time
    for (let i = 0; i < m.height.length; i++) m.height[i] = m.amp[i] * (0.6 * Math.sin(t * m.rate[i] + m.phase[i]) + 0.4 * Math.sin(Math.log(m.Z[i]) * 9 - t * 0.9 + m.X[i] * 0.15))
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
    // Lights: amber edge lights down both sides, centerline lights, stern lights, the island's windows and mast beacons.
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
    // At night the deck lights wash the deck.
    if (this.look.lamp > 0.5) {
      const [cx, cy] = D(0, 0.45)
      lightPool(this.hdr, this.W, this.H, cx, cy, 0.18 * this.H, 0.12 * this.H, [1, 0.6, 0.25], 1.2, 0.01)
    }
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
      if (this.cells) this.point(l.x, l.y, l.color[0] * k, l.color[1] * k, l.color[2] * k, l.size)
      else this.disc(l.x, l.y, (0.0018 + l.size * 0.0007) * this.H, l.color[0] * k, l.color[1] * k, l.color[2] * k, 1)
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

  // Jets launch off the bow now and then and climb away, and at teeming others come in over the stern to land.
  private stepJets(dt: number) {
    for (const j of this.jets) j.t += dt
    this.jets = this.jets.filter((j) => j.t < (j.kind === "launch" ? LAUNCH : LANDING))
    if (this.activity === "calm") return
    this.nextLaunch -= dt
    if (this.nextLaunch <= 0 && !this.jets.some((j) => j.kind === "launch")) {
      this.jets.push({ kind: "launch", t: 0, side: Math.random() < 0.5 ? -1 : 1 })
      this.nextLaunch = this.activity === "teeming" ? rand(14, 26) : rand(28, 50)
    }
    if (this.activity !== "teeming") return
    this.nextLanding -= dt
    if (this.nextLanding <= 0 && !this.jets.some((j) => j.kind === "landing")) {
      this.jets.push({ kind: "landing", t: 0, side: 0 })
      this.nextLanding = rand(22, 40)
    }
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
      const u = -0.1 + j.side * c * c * 0.3
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
    const k = this.look.night ? 3.2 : 1
    const p = this.paint(c)
    return [p[0] * k, p[1] * k, p[2] * k]
  }

  // A jet seen from behind: twin canted tails, swept wings, wingtip lights, and two afterburners glowing amber.
  private drawJet(j: Jet) {
    const p = this.jetPath(j)
    const z = 1 + BOW * p.v
    const [x, y] = this.deck(p.u, p.v, p.h)
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
      const [tx, ty] = this.deck(q.u, q.v, q.h)
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

  // At teeming, two jets circle high over the volcano.
  private drawCircling() {
    const { A, H, look } = this
    for (let i = 0; i < 2; i++) {
      const a = this.time * 0.09 + i * Math.PI
      const x = (volcanoX(A) + Math.cos(a) * 0.42) * H
      const y = (0.23 + Math.sin(a) * 0.05 + i * 0.02) * H
      const heading = Math.atan2(Math.cos(a) * 0.05, -Math.sin(a) * 0.42)
      const s = (0.04 + 0.008 * Math.sin(a)) * H
      this.planform(x, y, s, heading, 0.45, JETFORM, this.craft(JET))
      if (look.lamp > 0.5) {
        const blink = Math.sin(this.time * 4 + i) > 0.6 ? 1 : 0.2
        this.splat(x, y, 1.6 * blink * 0.5, 0.25 * blink * 0.5, 0.15 * blink * 0.5)
      }
    }
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
  description: "An aircraft carrier on a low-poly sea below a volcano island, from Anomaly Arcade's Wings",
  collection: "Arcade",
  activity: {
    calm: "The carrier on rolling faceted swells, glittering water, deck lights and drifting clouds",
    lively: "Adds jets launching off the deck now and then, and a deck crew light",
    teeming: "Adds jets circling and landing, an A-10 skimming the water, a B-2 high overhead and escort ships",
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
