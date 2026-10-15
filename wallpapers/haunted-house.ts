import { Canvas, cap, ell, type Lighting, type Part } from "../src/canvas"
import { body, chain, gait, joint, quadruped, stepGait, stride, type Gait } from "../src/creature"
import { eggWait } from "../src/egg"
import { flyAway, startle, type Flier } from "../src/flock"
import { lightPool } from "../src/light"
import { LightMap, firelight } from "../src/lightmap"
import { TAU, clamp, fbm1, fbm2, hash, lerp, rand, smoothstep, type RGB } from "../src/math"
import { driftClouds, makeClouds, makeStars, makeStorm, paintClouds, paintSky, paintStars, paintStorm, type Cloud, type Orb, type Star } from "../src/sky"
import { touch } from "../src/touched"
import type { Activity, Settings, Time, Wallpaper } from "../src/wallpaper"
import { gust } from "../src/wind"

// The scene runs slower than real time, which keeps it calm behind text.
const TIME_SCALE = 0.35
// The zombie, ghoul, ghosts, bats and witch move at a quarter of scene speed.
const CREATURE_SPEED = 0.25
// The far ridge meets the sky at HORIZON; the graveyard's fence stands on FENCE, in front of the house, and the zombie shuffles between
// WALK0 and WALK1, in screen heights from the top.
const HORIZON = 0.62
const FENCE = 0.8
const WALK0 = 0.88
const WALK1 = 0.94
// The zombie's height and stride, in screen heights.
const ZOMBIE = 0.16
const ZOMBIE_STRIDE = 0.05
// Teeming: scene seconds between the witch's crossings, and how long the light takes to pass from room to room.
const WITCH_GAP: [number, number] = [70, 140]
const ROOM = 5
// The egg: zombies climb out of their graves and dance for this many scene seconds.
const DANCE = 45

// Everything that changes with the time of day. Objects keep one daytime color and paint() darkens it; the lights
// (windows, candle, pumpkins, lantern) and the big surfaces have their own colors per look. Night keeps every
// highlight amber, orange, violet or teal: the text on top is white.
interface Look {
  style: "front" | "rim"
  light: RGB
  sky: [number, RGB][]
  // The sun or moon, its x from the house's middle in house units (see HauntedHouse.S).
  orb: Orb
  stars: number
  clouds: [top: RGB, bottom: RGB]
  cloudKind: "stratus" | "wisp"
  ridge: [far: RGB, near: RGB]
  grass: RGB
  dirt: RGB
  walls: RGB
  trim: RGB
  roof: RGB
  stone: RGB
  glass: RGB
  window: RGB
  // How bright windows, pumpkins, the candle and the lantern glow.
  glow: number
  fog: RGB
  fogAlpha: number
  ghost: RGB
  zombie: RGB
  // Bones: warm amber by day, a pale moonlit green-teal at night, never white.
  bone: RGB
  skin: RGB
  tint: RGB
  night: boolean
}

const LOOKS: Record<Time, Look> = {
  // A grim afternoon under a storm-dark sky with a sickly band of light along the horizon: black trees, a dark
  // peeling house, and warm lamplight in its windows even by day.
  day: {
    style: "front",
    light: [0.85, 0.9, 0.75],
    sky: [
      [0, [0.09, 0.105, 0.11]],
      [0.3, [0.18, 0.2, 0.19]],
      [0.5, [0.34, 0.36, 0.28]],
      [HORIZON, [0.64, 0.6, 0.38]],
    ],
    orb: { x: -0.32, y: 0.15, r: 0.055, core: [0.95, 0.95, 0.72], glow: [0.32, 0.34, 0.24], near: 0.18, wide: 0.08 },
    stars: 0,
    clouds: [
      [0.3, 0.32, 0.29],
      [0.07, 0.08, 0.08],
    ],
    cloudKind: "stratus",
    ridge: [
      [0.3, 0.31, 0.23],
      [0.13, 0.14, 0.1],
    ],
    grass: [0.11, 0.13, 0.075],
    dirt: [0.14, 0.11, 0.075],
    walls: [0.15, 0.145, 0.14],
    trim: [0.06, 0.06, 0.06],
    roof: [0.045, 0.045, 0.055],
    stone: [0.14, 0.15, 0.13],
    glass: [0.035, 0.035, 0.04],
    window: [1.3, 0.68, 0.18],
    glow: 1.3,
    fog: [0.26, 0.29, 0.23],
    fogAlpha: 0.16,
    ghost: [0.6, 0.95, 0.78],
    zombie: [0.42, 0.56, 0.32],
    bone: [0.72, 0.58, 0.34],
    skin: [0.85, 0.38, 0.06],
    tint: [0.55, 0.58, 0.52],
    night: false,
  },
  // A blood-orange sun sinking beside the house, the sky going purple overhead and everything in black silhouette.
  sunset: {
    style: "rim",
    light: [1.6, 0.45, 0.12],
    sky: [
      [0, [0.05, 0.012, 0.1]],
      [0.25, [0.25, 0.04, 0.18]],
      [0.45, [0.85, 0.16, 0.08]],
      [HORIZON, [1.35, 0.42, 0.08]],
    ],
    orb: { x: -0.42, y: 0.5, r: 0.11, core: [3.2, 0.62, 0.12], glow: [1, 0.26, 0.06], near: 0.6, wide: 0.38 },
    stars: 10,
    clouds: [
      [0.06, 0.015, 0.06],
      [0.95, 0.25, 0.1],
    ],
    cloudKind: "stratus",
    ridge: [
      [0.26, 0.055, 0.12],
      [0.1, 0.022, 0.06],
    ],
    grass: [0.045, 0.014, 0.033],
    dirt: [0.06, 0.018, 0.035],
    walls: [0.045, 0.015, 0.04],
    trim: [0.028, 0.009, 0.026],
    roof: [0.018, 0.005, 0.018],
    stone: [0.11, 0.035, 0.08],
    glass: [0.02, 0.006, 0.02],
    window: [1.9, 0.72, 0.15],
    glow: 1.45,
    fog: [0.42, 0.11, 0.18],
    fogAlpha: 0.3,
    ghost: [0.4, 1, 0.72],
    zombie: [0.45, 0.58, 0.36],
    bone: [0.5, 0.24, 0.12],
    skin: [0.5, 0.14, 0.03],
    tint: [0.2, 0.065, 0.13],
    night: false,
  },
  // Deep violet and indigo under a huge gold-orange moon behind the turret, black silhouettes rimmed in its light, the
  // windows and pumpkins glowing hot.
  night: {
    style: "rim",
    light: [1.2, 0.68, 0.22],
    sky: [
      [0, [0.01, 0.005, 0.04]],
      [0.3, [0.06, 0.025, 0.17]],
      [HORIZON, [0.18, 0.07, 0.34]],
    ],
    orb: { x: -0.2, y: 0.2, r: 0.14, core: [2.4, 0.95, 0.18], glow: [0.9, 0.32, 0.06], near: 0.5, wide: 0.32, moon: true },
    stars: 90,
    clouds: [
      [0.015, 0.008, 0.05],
      [0.1, 0.045, 0.2],
    ],
    cloudKind: "wisp",
    ridge: [
      [0.06, 0.028, 0.13],
      [0.022, 0.01, 0.055],
    ],
    grass: [0.016, 0.012, 0.04],
    dirt: [0.025, 0.014, 0.04],
    walls: [0.03, 0.02, 0.07],
    trim: [0.018, 0.012, 0.045],
    roof: [0.008, 0.005, 0.02],
    stone: [0.08, 0.06, 0.17],
    glass: [0.014, 0.008, 0.03],
    window: [2, 0.88, 0.2],
    glow: 1.9,
    fog: [0.13, 0.07, 0.28],
    fogAlpha: 0.4,
    ghost: [0.22, 1.1, 0.78],
    zombie: [0.25, 0.55, 0.3],
    bone: [0.15, 0.56, 0.44],
    skin: [0.32, 0.1, 0.02],
    tint: [0.07, 0.045, 0.14],
    night: true,
  },
}

const DAYLIGHT = (() => {
  const l = Math.hypot(0.4, 0.7, 0.6)
  return [-0.4 / l, -0.7 / l, 0.6 / l] as const
})()

// Candlelight, the lightning's color, and the dead leaves.
const CANDLE: RGB = [2.3, 1.05, 0.22]
const BOLT: RGB = [0.5, 0.42, 1.5]
const LEAVES: RGB[] = [
  [0.6, 0.32, 0.08],
  [0.5, 0.2, 0.08],
  [0.55, 0.45, 0.15],
  [0.35, 0.2, 0.1],
]

type Point = [number, number]

// A skeleton's joints in pixels, which way it faces, its skull's tilt and jaw, and whether its sockets glow.
interface Bones {
  head: Point
  chest: Point
  hip: Point
  elL: Point
  haL: Point
  elR: Point
  haR: Point
  knL: Point
  ftL: Point
  knR: Point
  ftR: Point
  tilt: number
  jaw: number
  dir: number
  glow: boolean
}

// A pumpkin standing at (x, y) in pixels, radius r; carved ones glow from inside and flicker.
interface Pumpkin {
  x: number
  y: number
  r: number
  seed: number
  flare: number
}

// A window of the house: its glass corners in pixels, its middle and size, what state it is in, and its place in the
// order the wandering light passes through the rooms (-1 for boarded windows it skips).
interface Window {
  pts: Point[]
  x: number
  y: number
  w: number
  h: number
  kind: "glow" | "dark" | "boarded" | "candle"
  room: number
  seed: number
  flash: number
}

// A gravestone: where it stands in screen heights, its size, lean and shape.
interface Stone {
  x: number
  y: number
  s: number
  tilt: number
  kind: number
}

interface Bat {
  ax: number
  ay: number
  rx: number
  ry: number
  w: number
  phase: number
  size: number
}

interface Ghost {
  x: number
  y: number
  x0: number
  x1: number
  dir: number
  phase: number
}

interface Leaf {
  x: number
  y: number
  fall: number
  spin: number
  rate: number
  color: RGB
}

class HauntedHouse extends Canvas {
  private time = 0
  private creatureTime = 0
  private readonly activity: Activity
  private readonly look: Look
  private lighting: Lighting = { style: "front", dir: DAYLIGHT }
  private readonly lights = new LightMap()
  private stars: Star[]
  private shown: Star[] = []
  private clouds: Cloud[]
  private storm = makeStorm()
  // Scale for narrow screens, the house's size (screen heights per house unit), its middle and the ground it stands
  // on, and the orb, in screen heights.
  private k = 1
  private S = 1.48
  private hx = 1.4
  private hy = 0.6
  private orb: Orb
  // Pixels the house, tree and graveyard cover, which clouds and stars stay behind.
  private fore = new Uint8Array(0)
  private fog = new Float32Array(0)
  private fogY0 = 0
  private fogRows = 0
  private pumpkins: Pumpkin[] = []
  private windows: Window[] = []
  private rooms = 0
  private stones: Stone[] = []
  private lanterns: { x: number; y: number; len: number; seed: number }[] = []
  private raven = { x: 0, y: 0 }
  private spider = { x: 0, y: 0 }
  private eyes: { x: number; y: number; phase: number; green: boolean }[] = []
  private wisps: { x: number; y: number; phase: number }[] = []
  // A dark figure crossing one lit window: which window, how far across, and the wait for the next.
  private passer = { win: -1, t: 0, wait: rand(8, 20) }
  private swing = { x: 0, y: 0, len: 0.12 }
  // Where the rocking chair stands on the porch, in pixels.
  private rocker: Point = [0, 0]
  private grave = { x: 0.3, y: 0.92 }
  private bats: Bat[] = []
  // Bats streaming out of the turret's top window, and those a click sends up.
  private stream: Flier[] = []
  private streamWait = 0
  private burst: Flier[] = []
  private ghosts: Ghost[] = []
  private leaves: Leaf[] = []
  private ghoul = { stone: -1, t: -1, wait: rand(6, 16), dur: 9 }
  private hand = { t: -1, wait: rand(10, 25) }
  private zombie = { x: 0.5, y: 0.87, dir: 1, phase: 0 }
  private flash = { t: -1, wait: 0, x: 0.5 }
  private witch = { t: -1, wait: rand(20, 50), dir: 1, y: 0.2 }
  private dance = { wait: eggWait() * TIME_SCALE, t: -1 }
  // Skeletons: the one on the tree's limb, the open grave, the teeming walkers (mode 0 rising, 1 walking, 2 sinking,
  // 3 underground), the dog, and skulls clicks pop up.
  private perch: Point = [0, 0]
  private open = { x: 0, y: 0 }
  private walkers: { x: number; y: number; dir: number; phase: number; t: number; mode: number }[] = []
  private dog = { x: 0.4, dir: 1, target: 0.6, wait: 1, gait: gait() as Gait }
  private pops: { x: number; y: number; t: number }[] = []

  constructor(settings: Settings) {
    super()
    this.activity = settings.activity
    this.look = LOOKS[settings.time]
    this.orb = this.look.orb
    this.stars = makeStars(this.look.stars, 0.5)
    this.clouds = makeClouds(settings.time === "day" ? 7 : 4, this.look.cloudKind, 0.05, 0.32)
    const n = { calm: 6, lively: 9, teeming: 12 }[settings.activity]
    this.leaves = Array.from({ length: n }, () => this.leaf(Math.random() * 2, rand(0.05, 0.95)))
    const bats = { calm: 2, lively: 4, teeming: 6 }[settings.activity]
    this.bats = Array.from({ length: bats }, (_, i) => ({ ax: 0, ay: 0, rx: rand(0.05, 0.1), ry: rand(0.02, 0.05), w: rand(0.9, 1.4), phase: rand(0, TAU), size: rand(0.024, 0.034) + (i === 0 ? 0.008 : 0) }))
    this.flash.wait = rand(2, 6)
    if (settings.activity === "teeming") this.walkers = [0, 1].map((i) => ({ x: 0, y: 0, dir: 1, phase: 0, t: 2 + i * 9, mode: 3 }))
    if (settings.activity === "calm") return
    const ghosts = settings.activity === "teeming" ? 2 : 1
    this.ghosts = Array.from({ length: ghosts }, (_, i) => ({ x: 0, y: 0, x0: 0, x1: 0, dir: i ? -1 : 1, phase: rand(0, TAU) }))
  }

  step(dt: number) {
    dt = clamp(dt, 0, 0.1) * TIME_SCALE
    this.time += dt
    const cdt = dt * CREATURE_SPEED
    this.creatureTime += cdt
    this.stepGloom(dt)
    driftClouds(this.clouds, this.A, dt * 0.4)
    if (this.gloom > 0) driftClouds(this.storm, this.A, dt)
    for (const p of this.pumpkins) p.flare = Math.max(0, p.flare - dt * 0.35)
    for (const w of this.windows) w.flash = Math.max(0, w.flash - dt * 0.2)
    this.burst = flyAway(this.burst, dt, this.A)
    this.stepStream(dt)
    this.stepLeaves(dt)
    this.stepGhosts(cdt)
    this.stepGhoul(dt)
    this.stepHand(dt)
    this.stepZombie(cdt)
    this.stepLightning(dt)
    this.stepWitch(dt, cdt)
    this.stepDance(dt)
    this.stepPasser(dt)
    this.stepWalkers(dt, cdt)
    this.stepDog(cdt)
    for (const p of this.pops) p.t += dt
    this.pops = this.pops.filter((p) => p.t < 4.6)
  }

  // Lively and teeming: now and then a figure glides past behind one of the lit windows.
  private stepPasser(dt: number) {
    const p = this.passer
    if (p.win >= 0) {
      p.t += dt * 0.12
      if (p.t > 1) p.win = -1
      return
    }
    if (this.activity === "calm") return
    p.wait -= dt
    if (p.wait > 0) return
    p.wait = rand(15, 35)
    const lit = this.windows.map((w, i) => [w, i] as const).filter(([w]) => w.kind === "glow" || w.kind === "candle")
    if (!lit.length) return
    p.win = lit[Math.floor(Math.random() * lit.length)][1]
    p.t = 0
  }

  render() {
    this.restore()
    const { W, H, look, hdr } = this
    paintStars(hdr, W, H, this.shown, this.time, 0.5, look.night ? 0.8 : 0.4, this.points)
    paintClouds(hdr, W, H, this.clouds, ...look.clouds, look.night ? 0.75 : 0.6, this.orb)
    if (this.gloom > 0) paintStorm(hdr, W, H, this.storm, [0.16, 0.1, 0.22], [0.04, 0.02, 0.06], this.gloom)
    if (this.flash.t >= 0) this.drawLightning()
    this.unsky(0, 0, W - 1, Math.ceil(HORIZON * H))
    if (this.witch.t >= 0) this.drawWitch()
    for (const b of this.bats) this.drawBatAt(b)
    for (const b of this.stream) this.drawBat(b.x, b.y, 0.022, b.phase, Math.sign(b.vx))
    this.lights.clear(W, H)
    this.drawWindows()
    this.drawRocker()
    for (const g of this.ghosts) this.drawGhost(g)
    this.drawSwing()
    if (this.activity !== "calm") this.drawSpider()
    if (this.activity !== "calm") this.drawSkeleton(this.sitPose(this.perch[0], this.perch[1], 0.11 * H, 1), 0.11 * H)
    if (this.ghoul.t >= 0) this.drawGhoul()
    if (this.hand.t >= 0) this.drawHand(this.grave.x, this.grave.y, this.hand.t)
    creep(hdr, W, H, this.fog, this.fogY0, this.fogRows, this.time * 1.6, this.time * 1.1, look.fog, look.fogAlpha)
    touch(hdr, 0, this.fogY0, W - 1, this.fogY0 + this.fogRows - 1)
    this.drawPumpkins()
    this.drawEyes()
    this.drawRaven()
    this.drawWisps()
    if (this.activity !== "calm") this.drawPeeker()
    if (this.activity === "teeming") this.drawZombie(this.zombie.x, this.zombie.y, this.zombie.dir, this.zombie.phase, 0, 1)
    this.drawWalkers()
    if (this.activity !== "calm") this.drawDog()
    this.drawPops()
    if (this.dance.t >= 0) this.drawDance()
    this.lights.apply(hdr)
    this.drawLeaves()
    for (const b of this.burst) this.drawBat(b.x, b.y, 0.026, b.phase, Math.sign(b.vx))
    this.finish()
  }

  // The witch flies past across the moon, and every window and pumpkin flares.
  protected override visit() {
    for (const w of this.windows) if (w.kind !== "boarded") w.flash = Math.max(w.flash, 0.6)
    for (const p of this.pumpkins) p.flare = Math.max(p.flare, 0.8)
    if (this.witch.t < 0) this.startWitch()
  }

  // A click on a window flashes it with a silhouette standing inside; by a gravestone, a ghoul pops up behind it;
  // anywhere else, bats burst out.
  poke(x: number, y: number) {
    const H = this.H
    const win = this.windows.find((w) => w.kind !== "boarded" && Math.abs(w.x / H - x) < w.w / H + 0.02 && Math.abs(w.y / H - y) < w.h / H + 0.02)
    if (win) {
      win.flash = 1.4
      return
    }
    const stone = this.stones.findIndex((s) => Math.abs(s.x - x) < s.s * 0.8 + 0.02 && y > s.y - s.s * 2.4 && y < s.y + 0.02)
    if (stone >= 0 && this.ghoul.t < 0 && Math.random() < 0.5) {
      Object.assign(this.ghoul, { stone, t: 0, dur: 6 })
      return
    }
    // Anywhere in the graveyard, a skull pops up out of the earth.
    if (y > FENCE + 0.02 && this.pops.length < 4) {
      this.pops.push({ x, y: Math.min(y + 0.02, 0.99), t: 0 })
      return
    }
    if (this.burst.length < 24) startle(this.burst, x, y, 6)
  }

  protected override layout() {
    const { W, H, A, look, hdr } = this
    const k = (this.k = clamp(A / 1.7, 0.58, 1))
    this.S = Math.min(1.48, A / 0.64)
    this.hx = A / 2 + 0.01
    this.hy = this.riseY(this.hx)
    this.orb = { ...look.orb, x: Math.max(0.12, this.hx + look.orb.x * this.S) / A }
    this.lighting = look.style === "front" ? { style: "front", dir: DAYLIGHT } : { style: "rim", color: look.light, x: this.orb.x * W, y: this.orb.y * H }
    this.pumpkins = []
    this.windows = []
    // The moon's own texture is drawn as a few soft dark seas; the shared one streaks at this size.
    paintSky(hdr, W, H, look.sky, { ...this.orb, moon: false }, this.px)
    if (this.orb.moon) {
      const R = this.orb.r * H
      const mx = this.orb.x * W
      const my = this.orb.y * H
      const c = this.orb.core
      for (const [u, v, r] of [
        [-0.3, -0.25, 0.32],
        [0.15, -0.35, 0.22],
        [0.25, 0.1, 0.28],
        [-0.2, 0.3, 0.2],
        [0.45, 0.45, 0.14],
      ]) this.ellipse(mx + u * R, my + v * R, r * R, r * R * 0.85, c[0] * 0.72, c[1] * 0.62, c[2] * 0.6, 0.55)
    }
    const sky = hdr.slice()
    this.paintLand()
    this.paintForest()
    this.paintHouse()
    this.paintFences()
    this.paintCrypt()
    this.paintGraves()
    this.paintTrees()
    this.paintUndergrowth()
    for (const p of this.pumpkins) this.drawPumpkin(p, 1, true)
    if (this.px !== 1) return
    // Real-size pass: what render() needs.
    this.fore = new Uint8Array(W * H)
    for (let i = 0; i < W * H; i++) if (hdr[i * 3] !== sky[i * 3] || hdr[i * 3 + 1] !== sky[i * 3 + 1] || hdr[i * 3 + 2] !== sky[i * 3 + 2]) this.fore[i] = 1
    this.shown = this.stars.filter((s) => {
      const i = Math.floor(s.y * H) * W + Math.floor(s.x * W)
      return !this.fore[i] && Math.hypot(s.x * W - this.orb.x * W, s.y * H - this.orb.y * H) > this.orb.r * H * 1.6
    })
    this.fogY0 = Math.floor(0.58 * H)
    this.fogRows = Math.ceil(0.4 * H)
    this.fog = makeFog(W, H, this.fogY0, this.fogRows)
    this.placeCreatures()
  }

  private paint(c: RGB, k = 1): RGB {
    const t = this.look.tint
    return [c[0] * t[0] * k, c[1] * t[1] * k, c[2] * t[2] * k]
  }

  // The ground the house's knoll and the graveyard spread over, its top at x, in screen heights.
  private riseY(x: number) {
    return 0.725 - 0.03 * Math.exp(-(((x - this.hx) / (0.45 * this.S)) ** 2)) + (fbm1(x * 3, 7) - 0.5) * 0.012
  }

  // The far ridge with a few dead trees, the rise under the house, and the graveyard's rough grass.
  private paintLand() {
    const { W, H, look, hdr, px } = this
    const [far, near] = look.ridge
    for (let x = 0; x < W; x++) {
      const u = (x + 0.5) / H
      const r1 = HORIZON - 0.03 - (fbm1(u * 2.2, 11) - 0.5) * 0.06
      const rise = this.riseY(u)
      for (let y = Math.max(0, Math.floor(Math.min(r1, rise) * H) - 1); y < H; y++) {
        const v = (y + 0.5) / H
        const o = (y * W + x) * 3
        const a1 = clamp(((v - r1) * H) / px + 0.5, 0, 1)
        const a2 = clamp(((v - rise) * H) / px + 0.5, 0, 1)
        const fade = smoothstep(r1, rise, v)
        if (a1 > 0) for (let c = 0; c < 3; c++) hdr[o + c] += (lerp(far[c], near[c], fade) - hdr[o + c]) * a1
        if (a2 <= 0) continue
        // Grass darkening toward the viewer, with bare patches of dirt and a lit edge along the rise's crest.
        const depth = smoothstep(rise, 1, v)
        const patch = smoothstep(0.55, 0.75, fbm2(u * 7, v * 22, 3))
        const tuft = 0.88 + 0.24 * fbm2(u * 14, v * 50, 2)
        const rim = look.style === "rim" ? Math.exp(-((v - rise) * H) / (2 * px)) * (look.night ? 0.1 : 0.18) : 0
        for (let c = 0; c < 3; c++) {
          const ground = lerp(near[c], lerp(look.grass[c], look.dirt[c], patch * 0.6), smoothstep(0, 0.08, v - rise)) * tuft * (1 - 0.25 * depth)
          hdr[o + c] += (ground + look.light[c] * rim - hdr[o + c]) * a2
        }
      }
    }
    // Bare trees on the far ridge, away from the middle.
    const k = this.k
    for (const [i, x] of [0.36 * k, this.A - 0.34 * k, this.A - 0.16 * k].entries()) {
      const y = HORIZON - 0.03 - (fbm1(x * 2.2, 11) - 0.5) * 0.06 + 0.004
      const h = 0.04 + 0.015 * hash(i * 3.1)
      const c: RGB = [far[0] * 0.75, far[1] * 0.75, far[2] * 0.8]
      const r = this.thick(0.0018, 0.6)
      const parts: Part[] = [cap(x * H, y * H, x * H, (y - h) * H, r * 1.4, r, c)]
      for (let j = 0; j < 4; j++) {
        const a = -Math.PI / 2 + (j - 1.5) * 0.55
        const by = y - h * (0.45 + 0.15 * j)
        parts.push(cap(x * H, by * H, (x + Math.cos(a) * h * 0.4) * H, (by + Math.sin(a) * h * 0.4) * H, r, r * 0.7, c))
      }
      this.shape(parts, this.lighting, 0)
    }
  }

  // The haunted house, the scene's centerpiece: a crooked Victorian pile on the knoll, its turret on the left under
  // a tall cone, a front gable over a bay, a sagging shingled roof with a hole in it and a leaning brick chimney,
  // clapboard siding split by cracks, a creaky porch on bracketed posts with a broken railing and jack-o'-lanterns,
  // and windows boarded, broken, shuttered, dark or glowing.
  private paintHouse() {
    const { H, look } = this
    const S = this.S
    const hx = this.hx
    const gy = this.hy + 0.006
    const X = (u: number) => (hx + u * S) * H
    const Y = (v: number) => (gy - v * S) * H
    // Everything leans a little to the right the higher it goes.
    const L = (u: number, v: number): Point => [X(u) + v * 0.035 * S * H, Y(v)]
    const T = (u: number, v: number): Point => [X(-0.15 + u) + v * 0.02 * S * H, Y(v)]
    const walls = look.walls
    const side: RGB = [walls[0] * 0.62, walls[1] * 0.62, walls[2] * 0.66]
    const seam: RGB = [walls[0] * 0.78, walls[1] * 0.78, walls[2] * 0.8]
    const crack: RGB = [walls[0] * 0.4, walls[1] * 0.38, walls[2] * 0.42]
    const roof = look.roof
    const tile: RGB = [roof[0] * 1.7 + 0.01, roof[1] * 1.7 + 0.01, roof[2] * 1.6 + 0.01]
    const trim = look.trim
    const line = (pts: Point[], r: number, color: RGB) => {
      const w = this.thick(r * S, 0.5)
      this.shape(pts.slice(1).map((p, i) => cap(...pts[i], ...p, w, w, color)), this.lighting, 0)
    }
    // The main block's receding side wall and roof.
    this.polygon([L(0.16, 0), L(0.22, 0.02), L(0.22, 0.2), L(0.16, 0.19)], side)
    for (let v = 0.016; v < 0.19; v += 0.016) line([L(0.16, v), L(0.22, v + 0.02 * (1 - v / 0.2))], 0.0005, [side[0] * 0.8, side[1] * 0.8, side[2] * 0.8])
    this.polygon([L(0.1, 0.3), L(0.17, 0.32), L(0.235, 0.2), L(0.17, 0.185)], roof)
    // A leaning brick chimney with a broken cap.
    const brick: RGB = [walls[0] * 0.55, walls[1] * 0.42, walls[2] * 0.4]
    this.polygon([L(0.115, 0.25), L(0.145, 0.25), L(0.16, 0.38), L(0.13, 0.385)], brick)
    for (let v = 0.27; v < 0.37; v += 0.018) line([L(0.117 + (v - 0.25) * 0.11, v), L(0.147 + (v - 0.25) * 0.11, v)], 0.0005, [brick[0] * 0.7, brick[1] * 0.7, brick[2] * 0.7])
    this.polygon([L(0.122, 0.378), L(0.168, 0.373), L(0.168, 0.393), L(0.14, 0.397), L(0.135, 0.388), L(0.125, 0.398)], roof)
    // The front wall, two storeys of clapboard.
    this.polygon([L(-0.12, 0), L(0.16, 0), L(0.16, 0.19), L(-0.12, 0.19)], walls)
    for (let v = 0.016; v < 0.185; v += 0.016) line([L(-0.12, v), L(0.16, v)], 0.0005, seam)
    // Clapboards peeled away to the dark sheathing, and one hanging loose by a nail.
    const bare: RGB = [walls[0] * 0.38, walls[1] * 0.36, walls[2] * 0.4]
    for (const [u0, v0, u1, v1] of [
      [0.136, 0.104, 0.156, 0.118],
      [-0.118, 0.128, -0.104, 0.146],
      [0.17, 0.12, 0.2, 0.134],
    ])
      this.polygon([L(u0, v0), L(u1, v0 + (u0 > 0.16 ? 0.004 : 0)), L(u1, v1 + (u0 > 0.16 ? 0.004 : 0)), L(u0, v1)], bare)
    this.polygon([L(0.137, 0.174), L(0.158, 0.164), L(0.159, 0.158), L(0.138, 0.168)], [walls[0] * 1.15, walls[1] * 1.12, walls[2] * 1.1])
    // The main roof, sagging in the middle, in rows of shingles, with a hole broken through to the rafters.
    const ridgeV = (t: number) => 0.3 - 0.025 * Math.sin(t * Math.PI)
    const ridge: Point[] = []
    for (let i = 0; i <= 8; i++) ridge.push(L(lerp(-0.1, 0.12, i / 8), ridgeV(i / 8)))
    this.polygon([L(-0.14, 0.18), ...ridge, L(0.185, 0.18)], roof)
    for (let t = 0.12; t < 0.95; t += 0.13) {
      const row: Point[] = []
      for (let i = 0; i <= 8; i++) {
        const s = i / 8
        row.push(L(lerp(lerp(-0.14, -0.1, t), lerp(0.185, 0.12, t), s), lerp(0.18, ridgeV(s), t)))
      }
      line(row, 0.0006, tile)
    }
    this.polygon([L(0.088, 0.215), L(0.118, 0.22), L(0.124, 0.252), L(0.1, 0.262), L(0.084, 0.24)], [roof[0] * 0.3, roof[1] * 0.3, roof[2] * 0.3])
    for (const u of [0.094, 0.108]) line([L(u, 0.214), L(u + 0.006, 0.26)], 0.001, tile)
    // Iron cresting along the ridge: a rail on little spear-tipped posts (the gable hides its middle).
    const iron = this.paint([0.05, 0.04, 0.06])
    const crest: Point[] = ridge.map(([x, y]) => [x, y - 0.012 * S * H])
    line(crest, 0.0012, iron)
    for (const [x, y] of ridge) this.polygon([[x - 0.0025 * S * H, y], [x + 0.0025 * S * H, y], [x + 0.0012 * S * H, y - 0.012 * S * H], [x, y - 0.02 * S * H], [x - 0.0012 * S * H, y - 0.012 * S * H]], iron)
    // The front gable over the bay, steep and crooked, sided too, with a carved bargeboard and an attic window.
    this.polygon([L(-0.06, 0.18), L(0.08, 0.18), L(0.012, 0.34)], walls)
    for (let v = 0.196; v < 0.33; v += 0.016) {
      const t = (v - 0.18) / 0.16
      line([L(lerp(-0.06, 0.012, t), v), L(lerp(0.08, 0.012, t), v)], 0.0005, seam)
    }
    this.edge(L(-0.075, 0.172), L(0.012, 0.345), 0.006 * S, roof)
    this.edge(L(0.012, 0.345), L(0.095, 0.172), 0.006 * S, roof)
    line([L(-0.055, 0.19), L(0.012, 0.318), L(0.077, 0.19)], 0.0012, trim)
    // Gingerbread: a fringe of scallops hanging under the bargeboards, a pendant at the peak and a ball finial.
    const lace: RGB = [trim[0] * 2.2, trim[1] * 2.1, trim[2] * 2]
    for (const [a, b] of [
      [L(-0.068, 0.178), L(0.012, 0.336)],
      [L(0.088, 0.178), L(0.012, 0.336)],
    ])
      for (let t = 0.08; t < 0.92; t += 0.14) this.disc(lerp(a[0], b[0], t), lerp(a[1], b[1], t) + 0.004 * S * H, 0.0042 * S * H, lace[0], lace[1], lace[2], 1)
    this.polygon([L(0.004, 0.33), L(0.02, 0.33), L(0.012, 0.3)], lace)
    this.edge(L(0.012, 0.345), L(0.012, 0.37), 0.0015 * S, roof)
    this.disc(...L(0.012, 0.374), 0.005 * S * H, roof[0], roof[1], roof[2], 1)
    // A round attic window high in the gable, dimly lit from within.
    const [ox, oy] = L(0.012, 0.293)
    const dim = look.glow * 0.3
    this.disc(ox, oy, 0.013 * S * H, trim[0], trim[1], trim[2], 1)
    this.disc(ox, oy, 0.0095 * S * H, look.window[0] * dim, look.window[1] * dim, look.window[2] * dim, 1)
    if (!this.cells) for (const [dx, dy] of [[1, 0], [0, 1]]) this.edge([ox - dx * 0.0095 * S * H, oy - dy * 0.0095 * S * H], [ox + dx * 0.0095 * S * H, oy + dy * 0.0095 * S * H], 0.0007, trim)
    // A dormer on the left of the roof, with its own little peak and window.
    this.polygon([L(-0.1, 0.198), L(-0.07, 0.198), L(-0.07, 0.232), L(-0.1, 0.232)], walls)
    this.polygon([L(-0.107, 0.228), L(-0.063, 0.228), L(-0.085, 0.258)], roof)
    line([L(-0.107, 0.228), L(-0.085, 0.258), L(-0.063, 0.228)], 0.002, trim)
    this.edge(L(-0.085, 0.258), L(-0.085, 0.27), 0.0012 * S, roof)
    // The turret: a round tower on the left corner, banded and sided, under a tall crooked shingled cone.
    const tw = 0.042
    this.polygon([T(-tw, 0), T(tw, 0), T(tw, 0.27), T(-tw, 0.27)], walls)
    this.polygon([T(tw * 0.35, 0), T(tw, 0), T(tw, 0.27), T(tw * 0.35, 0.27)], [walls[0] * 0.75, walls[1] * 0.75, walls[2] * 0.78])
    for (let v = 0.016; v < 0.265; v += 0.016) line([T(-tw, v), T(-tw * 0.3, v + 0.002), T(tw * 0.3, v + 0.002), T(tw, v)], 0.0005, seam)
    for (const v of [0.095, 0.185]) this.polygon([T(-tw - 0.004, v), T(tw + 0.004, v), T(tw + 0.004, v + 0.008), T(-tw - 0.004, v + 0.008)], trim)
    this.polygon([T(-tw - 0.012, 0.265), T(tw + 0.012, 0.265), T(tw + 0.008, 0.285), T(-tw - 0.008, 0.285)], trim)
    const tip: Point = [T(0, 0.43)[0] + 0.022 * S * H, Y(0.43)]
    const shoulderL: Point = [T(-tw * 0.3, 0.36)[0] + 0.004 * S * H, Y(0.36)]
    const shoulderR: Point = [T(tw * 0.4, 0.36)[0] + 0.01 * S * H, Y(0.36)]
    this.polygon([T(-tw - 0.01, 0.282), T(tw + 0.01, 0.282), shoulderR, tip, shoulderL], roof)
    for (let t = 0.15; t < 0.8; t += 0.16) {
      const a = t < 0.55 ? lerp(T(-tw - 0.01, 0.282)[0], shoulderL[0], t / 0.55) : lerp(shoulderL[0], tip[0], (t - 0.55) / 0.45)
      const b = t < 0.55 ? lerp(T(tw + 0.01, 0.282)[0], shoulderR[0], t / 0.55) : lerp(shoulderR[0], tip[0], (t - 0.55) / 0.45)
      const y = lerp(Y(0.282), tip[1], t)
      line([[a, y], [(a + b) / 2, y + 0.002 * S * H], [b, y]], 0.0006, tile)
    }
    // A weathervane on the spike: an arrow, bent.
    this.edge(tip, [tip[0] + 0.004 * S * H, tip[1] - 0.04 * S * H], 0.0018 * S, roof)
    const vy = tip[1] - 0.032 * S * H
    line([[tip[0] - 0.014 * S * H, vy + 0.004 * S * H], [tip[0] + 0.02 * S * H, vy - 0.002 * S * H]], 0.0012, roof)
    this.polygon([[tip[0] + 0.02 * S * H, vy - 0.007 * S * H], [tip[0] + 0.03 * S * H, vy - 0.003 * S * H], [tip[0] + 0.02 * S * H, vy + 0.003 * S * H]], roof)
    // Trim: a band between the storeys and the eaves boards.
    this.edge(L(-0.12, 0.1), L(0.16, 0.1), 0.004 * S, trim)
    this.edge(L(-0.14, 0.182), L(0.185, 0.182), 0.005 * S, trim)
    // A rough stone foundation showing under the turret and the side wall.
    const stone = look.stone
    const blocks = (pts: (t: number, b: number) => Point[], n: number) => {
      for (let i = 0; i < n; i++) {
        const k = 0.8 + 0.35 * hash(i * 3.7 + n)
        this.polygon(pts(i / n, (i + 1) / n), [stone[0] * k, stone[1] * k, stone[2] * k])
      }
    }
    blocks((a, b) => [T(lerp(-tw - 0.004, tw + 0.004, a), -0.004), T(lerp(-tw - 0.004, tw + 0.004, b), -0.004), T(lerp(-tw - 0.004, tw + 0.004, b), 0.016), T(lerp(-tw - 0.004, tw + 0.004, a), 0.016)], 4)
    blocks((a, b) => [L(lerp(0.16, 0.22, a), -0.004 + 0.02 * a), L(lerp(0.16, 0.22, b), -0.004 + 0.02 * b), L(lerp(0.16, 0.22, b), 0.014 + 0.02 * b), L(lerp(0.16, 0.22, a), 0.014 + 0.02 * a)], 3)
    // Stains streaking down from the eaves and the turret's band.
    const stain: RGB = [walls[0] * 0.5, walls[1] * 0.5, walls[2] * 0.48]
    for (const [i, u] of [-0.105, -0.045, 0.02, 0.085, 0.142].entries()) {
      const len = 0.03 + 0.03 * hash(i * 5.3)
      this.polygon([L(u - 0.004, 0.176), L(u + 0.004, 0.176), L(u + 0.0015, 0.176 - len), L(u - 0.0015, 0.176 - len)], stain, 0.45)
    }
    for (const u of [-0.025, 0.02]) this.polygon([T(u - 0.004, 0.262), T(u + 0.004, 0.262), T(u + 0.001, 0.215), T(u - 0.001, 0.215)], stain, 0.45)
    // Cracks running through the siding.
    line([L(0.03, 0.19), L(0.036, 0.168), L(0.028, 0.15), L(0.04, 0.128), L(0.034, 0.112)], 0.001, crack)
    line([L(-0.11, 0.098), L(-0.1, 0.082), L(-0.106, 0.064)], 0.001, crack)
    line([T(-0.02, 0.26), T(-0.01, 0.24), T(-0.024, 0.22)], 0.001, crack)
    // Dead vines creeping up the turret's left side.
    const vine = this.paint([0.13, 0.12, 0.07])
    const leafC = this.paint([0.2, 0.24, 0.08])
    const vw = this.thick(0.0012 * S, 0.55)
    const vines: Part[] = []
    const leaves: Part[] = []
    for (let j = 0; j < 3; j++) {
      let p = T(-tw + 0.006 + j * 0.012, 0)
      for (let i = 1; i <= 9; i++) {
        const q = T(-tw + 0.006 + j * 0.012 + Math.sin(i * 1.3 + j * 2) * 0.008, i * (0.022 - j * 0.004))
        vines.push(cap(...p, ...q, vw, vw, vine))
        if (hash(i * 3.1 + j) < 0.6) leaves.push(ell(q[0] + (i % 2 ? 1 : -1) * 0.004 * S * H, q[1], 0.0035 * S * H, 0.0025 * S * H, i, leafC))
        if (i % 3 === 0) vines.push(cap(...q, q[0] + (j % 2 ? 1 : -1) * 0.012 * S * H, q[1] - 0.008 * S * H, vw * 0.8, vw * 0.6, vine))
        p = q
      }
    }
    this.shape(vines, this.lighting, 0)
    this.shape(leaves, this.lighting, 0.3)
    if (look.style === "rim") this.rimEdges([T(-tw, 0), T(-tw, 0.27), T(-tw - 0.01, 0.282), shoulderL, tip, ...ridge, L(0.185, 0.18)])
    // Windows: the ground floor behind the porch, the upper floor, the attic and the turret.
    const plan: [number, number, number, number, Window["kind"]][] = [
      [-0.09, 0.024, 0.016, 0.032, "glow"],
      [-0.05, 0.024, 0.012, 0.032, "dark"],
      [0.08, 0.024, 0.016, 0.032, "dark"],
      [0.128, 0.024, 0.013, 0.032, "boarded"],
      [-0.08, 0.12, 0.019, 0.046, "glow"],
      [-0.02, 0.12, 0.019, 0.046, "candle"],
      [0.05, 0.12, 0.018, 0.046, "boarded"],
      [0.115, 0.12, 0.018, 0.046, "glow"],
      [0.012, 0.225, 0.014, 0.034, "dark"],
    ]
    const turret: [number, number][] = [
      [0.04, 0.032],
      [0.13, 0.036],
      [0.21, 0.034],
    ]
    // An oriel bay window bulging out on the upper floor's right, on a corbel under a little hipped roof.
    const sideW: RGB = [walls[0] * 0.7, walls[1] * 0.7, walls[2] * 0.74]
    this.polygon([L(0.084, 0.112), L(0.146, 0.112), L(0.146, 0.176), L(0.084, 0.176)], walls)
    this.polygon([L(0.076, 0.116), L(0.084, 0.112), L(0.084, 0.176), L(0.076, 0.172)], sideW)
    this.polygon([L(0.146, 0.112), L(0.154, 0.116), L(0.154, 0.172), L(0.146, 0.176)], sideW)
    this.polygon([L(0.078, 0.112), L(0.152, 0.112), L(0.115, 0.094)], trim)
    this.polygon([L(0.072, 0.174), L(0.158, 0.174), L(0.146, 0.188), L(0.084, 0.188)], roof)
    this.edge(L(0.115, 0.188), L(0.115, 0.198), 0.0012 * S, roof)
    this.disc(...L(0.115, 0.2), 0.003 * S * H, roof[0], roof[1], roof[2], 1)
    for (const [i, [u, v, w, h, kind]] of plan.entries()) this.paintWindow(L(u, v), L(u, v + h), w * S * H, h * S * H, kind, i)
    for (const [i, [v, h]] of turret.entries()) this.paintWindow(T(0, v), T(0, v + h), 0.012 * S * H, h * S * H, i === 2 ? "glow" : "dark", 20 + i)
    this.paintWindow(L(-0.085, 0.204), L(-0.085, 0.224), 0.008 * S * H, 0.02 * S * H, "dark", 30)
    // The rooms the wandering light passes through: windows on the same floor in order, then up the turret.
    const order = this.windows.filter((w) => w.kind !== "boarded").sort((a, b) => b.y - a.y || a.x - b.x)
    for (const [i, w] of order.entries()) w.room = i
    this.rooms = order.length
    // The porch: a panelled door under a lit fanlight, a sagging roof on bracketed posts, the floor and steps.
    const door = this.paint([0.18, 0.11, 0.08])
    this.polygon([L(-0.002, 0), L(0.032, 0), L(0.032, 0.058), L(-0.002, 0.058)], door)
    for (const v of [0.008, 0.032]) for (const u of [0.003, 0.018]) this.polygon([L(u, v), L(u + 0.01, v), L(u + 0.01, v + 0.02), L(u, v + 0.02)], [door[0] * 0.7, door[1] * 0.7, door[2] * 0.7])
    // Cracked, with a plank nailed across and an iron knocker.
    line([L(0.024, 0.056), L(0.02, 0.04), L(0.026, 0.028), L(0.021, 0.012)], 0.0009, [door[0] * 0.35, door[1] * 0.35, door[2] * 0.35])
    this.shape([cap(...L(-0.004, 0.022), ...L(0.034, 0.04), this.thick(0.0028 * S, 0.8), this.thick(0.0028 * S, 0.8), this.paint([0.4, 0.31, 0.2]))], this.lighting, 0.5)
    const brass = this.paint([0.55, 0.42, 0.16], look.night ? 2 : 1)
    this.disc(...L(0.015, 0.033), 0.0045 * S * H, brass[0], brass[1], brass[2], 1)
    this.disc(...L(0.015, 0.033), 0.0024 * S * H, door[0], door[1], door[2], 1)
    const fan = look.glow * 0.45
    this.disc(...L(0.015, 0.06), 0.013 * S * H, trim[0], trim[1], trim[2], 1)
    this.disc(...L(0.015, 0.06), 0.01 * S * H, look.window[0] * fan, look.window[1] * fan, look.window[2] * fan, 1)
    this.polygon([L(-0.004, 0.058), L(0.034, 0.058), L(0.034, 0.05), L(-0.004, 0.05)], trim)
    const pr = this.thick(0.0024 * S, 0.7)
    const posts: Part[] = []
    for (const u of [-0.12, -0.045, 0.072, 0.158]) {
      posts.push(cap(...L(u, 0), ...L(u, 0.068), pr, pr, trim))
      for (const s of [-1, 1]) posts.push(cap(...L(u + s * 0.014, 0.068), ...L(u, 0.054), pr * 0.6, pr * 0.6, trim))
      // Turned: swellings along the post.
      for (const v of [0.012, 0.036]) posts.push(ell(...L(u, v), pr * 1.8, pr * 2.6, 0, trim))
    }
    this.shape(posts, this.lighting, 0.4)
    // A frieze of spindles under the porch roof, broken over the door.
    const sp: Part[] = []
    const sr = this.thick(0.001 * S, 0.45)
    for (const [u0, u1] of [
      [-0.135, -0.012],
      [0.046, 0.17],
    ]) {
      sp.push(cap(...L(u0, 0.048), ...L(u1, 0.048), sr * 1.4, sr * 1.4, trim))
      for (let u = u0 + 0.006; u < u1; u += this.cells ? 0.014 : 0.008) sp.push(cap(...L(u, 0.048), ...L(u, 0.06), sr, sr, trim))
    }
    this.shape(sp, this.lighting, 0)
    const porch: Point[] = []
    for (let i = 0; i <= 6; i++) porch.push(L(lerp(-0.135, 0.17, i / 6), 0.074 - 0.009 * Math.sin((i / 6) * Math.PI) - (i === 6 ? 0.007 : 0)))
    this.polygon([...porch, L(0.175, 0.059), L(-0.14, 0.062)], roof)
    line(porch.map(([x, y]) => [x, y + 0.012 * S * H] as Point), 0.0015, trim)
    this.polygon([L(-0.135, 0.008), L(0.175, 0.008), L(0.175, -0.004), L(-0.135, -0.004)], trim)
    // Stone steps, each lit along its tread and dark in its riser.
    for (let s = 0; s < 3; s++) {
      const u0 = -0.014 - s * 0.006
      const u1 = 0.044 + s * 0.006
      const v = -0.004 - s * 0.009
      this.polygon([L(u0, v), L(u1, v), L(u1, v - 0.009), L(u0, v - 0.009)], [stone[0] * 0.75, stone[1] * 0.75, stone[2] * 0.78])
      this.polygon([L(u0, v), L(u1, v), L(u1, v - 0.003), L(u0, v - 0.003)], [stone[0] * 1.15, stone[1] * 1.15, stone[2] * 1.15])
      if (s === 1) line([L(0.01, v - 0.001), L(0.016, v - 0.005), L(0.013, v - 0.009)], 0.0008, [stone[0] * 0.4, stone[1] * 0.4, stone[2] * 0.4])
    }
    this.rocker = L(-0.052, 0.008)
    // Finials at the porch roof's ends.
    for (const u of [-0.135, 0.17]) {
      const [fx, fy] = L(u, u > 0 ? 0.067 : 0.074)
      this.edge([fx, fy], [fx, fy - 0.014 * S * H], 0.0014 * S, roof)
      this.disc(fx, fy - 0.015 * S * H, 0.0035 * S * H, roof[0], roof[1], roof[2], 1)
    }
    // A sagging gutter along the eaves, torn loose at the right end, and a broken downspout with its fallen elbow.
    const metal = this.paint([0.16, 0.16, 0.17])
    const gw = this.thick(0.0022 * S, 0.7)
    const gutter: Point[] = []
    for (let i = 0; i <= 8; i++) gutter.push(L(lerp(-0.138, 0.17, i / 8), 0.177 - 0.007 * Math.sin((i / 8) * Math.PI)))
    gutter.push(L(0.188, 0.158))
    this.shape(gutter.slice(1).map((q, i) => cap(...gutter[i], ...q, gw, gw, metal)), this.lighting, 0)
    this.shape([cap(...L(0.152, 0.172), ...L(0.152, 0.088), gw, gw, metal), cap(...L(0.152, 0.088), ...L(0.162, 0.08), gw, gw, metal), cap(...L(0.19, -0.002), ...L(0.214, 0.002), gw, gw, metal)], this.lighting, 0)
    // Railings: balusters along the top rail, a gap where some have fallen, and a broken rail hanging down.
    const rr = this.thick(0.0012 * S, 0.5)
    const rail: Part[] = [cap(...L(-0.12, 0.032), ...L(-0.06, 0.032), rr, rr, trim), cap(...L(-0.06, 0.032), ...L(-0.035, 0.012), rr, rr, trim), cap(...L(0.072, 0.032), ...L(0.158, 0.028), rr, rr, trim)]
    for (let u = -0.11; u < 0.158; u += this.cells ? 0.02 : 0.012) if ((u < -0.065 || u > 0.08) && Math.abs(u - 0.115) > 0.008) rail.push(cap(...L(u, 0.008), ...L(u, 0.03), rr, rr, trim))
    rail.push(cap(...L(0.112, 0.008), ...L(0.124, 0.022), rr, rr, trim))
    this.shape(rail, this.lighting, 0)
    // Webs in the porch's top corners; a spider hangs from the right one.
    this.paintWeb(...L(-0.12, 0.068), 0.03 * S * H, -0.1, Math.PI / 2 + 0.1)
    this.paintWeb(...L(0.158, 0.064), 0.026 * S * H, Math.PI / 2 - 0.1, Math.PI + 0.1)
    this.spider = { x: L(0.15, 0.064)[0] / H, y: L(0.15, 0.064)[1] / H }
    // Jack-o'-lanterns on the steps and the porch rail.
    const p = (u: number, v: number, r: number, seed: number) => this.pumpkins.push({ x: L(u, v)[0], y: Y(v), r: r * S * H, seed, flare: 0 })
    p(-0.03, -0.01, 0.011, 1)
    p(0.06, -0.022, 0.013, 2)
    p(-0.1, 0.032, 0.008, 3)
    p(-0.045, -0.028, 0.009, 4)
  }

  // A window from its bottom middle a to top middle b (pixels), half-width w: a frame with a sill and a lintel, glass
  // with muntins, and planks nailed across if boarded or a shutter hanging askew on some.
  private paintWindow(a: Point, b: Point, w: number, h: number, kind: Window["kind"], seed: number) {
    const look = this.look
    const frame = look.trim
    const dx = b[0] - a[0]
    const f = Math.max(0.0045 * this.S * this.H, this.cells ? 1 : 0.5)
    this.polygon([[a[0] - w - f, a[1] + f], [a[0] + w + f, a[1] + f], [b[0] + w + f, b[1] - f], [b[0] - w - f, b[1] - f]], frame)
    this.polygon([[a[0] - w - f * 2, a[1] + f * 2], [a[0] + w + f * 2, a[1] + f * 2], [a[0] + w + f * 2, a[1] + f * 0.6], [a[0] - w - f * 2, a[1] + f * 0.6]], [frame[0] * 1.3, frame[1] * 1.3, frame[2] * 1.3])
    this.polygon([[b[0] - w - f * 1.6, b[1] - f * 0.6], [b[0] + w + f * 1.6, b[1] - f * 0.6], [b[0] + w + f, b[1] - f * 2.2], [b[0] - w - f, b[1] - f * 2.2]], frame)
    const pts: Point[] = [
      [a[0] - w, a[1]],
      [a[0] + w, a[1]],
      [b[0] + w, b[1]],
      [b[0] - w, b[1]],
    ]
    const lit = kind === "glow" || kind === "candle"
    const g = lit ? look.window : look.glass
    const k = lit ? look.glow * (kind === "candle" ? 0.5 : 0.7) : 1
    this.polygon(pts, [g[0] * k, g[1] * k, g[2] * k])
    // A broken pane: a jagged hole of darkness in the dark glass.
    if (kind === "dark" && hash(seed * 3.3) < 0.6) this.polygon([[a[0] - w * 0.2, a[1] - h * 0.55], [a[0] + w * 0.7, a[1] - h * 0.9], [a[0] + w * 0.3, a[1] - h * 0.6], [a[0] + w * 0.8, a[1] - h * 0.3]], [g[0] * 0.3, g[1] * 0.3, g[2] * 0.3])
    this.windows.push({ pts, x: (a[0] + b[0]) / 2, y: (a[1] + b[1]) / 2, w, h, kind, room: -1, seed, flash: 0 })
    if (kind === "dark") this.drawCurtains(this.windows[this.windows.length - 1], [g[0] * 2.5 + 0.03, g[1] * 1.6, g[2] * 2], 0)
    if (seed === 0 || seed === 4 || seed === 7 || seed === 21) {
      const sx = a[0] + w + f * 1.5
      const sw = w * 0.85
      const c: RGB = [frame[0] * 1.25, frame[1] * 1.2, frame[2] * 1.15]
      const sh: Point[] = [[sx, b[1] - f], [sx + sw, b[1] - f + sw * 0.25], [sx + sw * 0.5, a[1] + f + sw * 0.7], [sx - sw * 0.45, a[1] + f + sw * 0.35]]
      this.polygon(sh, c)
      if (w > 3 * this.px) for (const t of [0.33, 0.66]) this.edge([lerp(sh[0][0], sh[3][0], t), lerp(sh[0][1], sh[3][1], t)], [lerp(sh[1][0], sh[2][0], t), lerp(sh[1][1], sh[2][1], t)], 0.0005, [c[0] * 0.7, c[1] * 0.7, c[2] * 0.7])
    }
    if (kind === "boarded") {
      const wood = this.paint([0.42, 0.34, 0.24])
      const r = this.thick(0.003 * this.S, 0.8)
      this.shape([cap(a[0] - w * 1.3, a[1] - h * 0.2, b[0] + w * 1.3, b[1] + h * 0.25, r, r, wood), cap(a[0] - w * 1.2, b[1] + h * 0.3, a[0] + w * 1.3 + dx, a[1] - h * 0.35, r, r, wood), cap(a[0] - w * 1.25 + dx * 0.5, a[1] - h * 0.55, a[0] + w * 1.25 + dx * 0.5, a[1] - h * 0.5, r, r, wood)], this.lighting, 0.5)
      return
    }
    this.drawMuntins(this.windows[this.windows.length - 1])
  }

  // The cross of glazing bars over a window's glass, on windows big enough to show them.
  private drawMuntins(w: Window) {
    if (w.w < 3 * this.px) return
    const [a, b, c, d] = w.pts
    const frame = this.look.trim
    this.edge([(a[0] + b[0]) / 2, a[1]], [(c[0] + d[0]) / 2, c[1]], 0.0008, frame)
    this.edge([(a[0] + d[0]) / 2, (a[1] + d[1]) / 2], [(b[0] + c[0]) / 2, (b[1] + c[1]) / 2], 0.0008, frame)
  }

  // A dead, twisted tree standing at (x, y) in screen heights, z times the size of the near ones' parts below (screen
  // heights at z = 1): twisted roots, a gnarled trunk, and the given limbs ([u, v, angle, length, radius, depth, seed]
  // from the trunk) splitting into clawing branches. extra adds limbs of the caller's own, in the tree's units.
  // Returns the tips of its smallest branches, for moss, in screen heights.
  private paintDeadTree(x: number, y: number, z: number, color: RGB, limbs: number[][], light: number, extra: (P: (u: number, v: number) => Point) => Part[] = () => []) {
    const { H } = this
    const min = (this.cells ? 0.7 : 0.3) * this.px * Math.min(1, z * 1.2)
    const groups: Part[][] = [[]]
    const tips: Point[] = []
    const grow = (px: number, py: number, angle: number, len: number, r: number, depth: number, seed: number, parts: Part[]) => {
      let ax = px
      let ay = py
      let a = angle
      for (let s = 0; s < 3; s++) {
        a += (hash(seed * 3.1 + s) - 0.5) * 0.9
        const bx = ax + Math.cos(a) * (len / 3)
        const by = ay + Math.sin(a) * (len / 3)
        parts.push(cap(ax * H, ay * H, bx * H, by * H, Math.max(r * (1 - 0.18 * s) * H, min), Math.max(r * (1 - 0.18 * (s + 1)) * H, min), color))
        ax = bx
        ay = by
      }
      if (depth === 0) {
        tips.push([ax, ay])
        return
      }
      const kids = depth > 2 ? 3 : 2
      for (let i = 0; i < kids; i++) {
        const spread = (i - (kids - 1) / 2) * (0.55 + 0.25 * hash(seed + i * 7.7)) + (hash(seed * 1.9 + i) - 0.5) * 0.4
        const droop = depth <= 2 ? Math.sign(Math.cos(a + spread)) * 0.35 : 0
        grow(ax, ay, a + spread + droop, len * (0.62 + 0.12 * hash(seed * 4.3 + i)), r * 0.62, depth - 1, seed * 3 + i + 1, depth >= 2 ? (groups[groups.push([]) - 1] as Part[]) : parts)
      }
    }
    const P = (u: number, v: number): Point => [(x + u * z) * H, (y + v * z) * H]
    const trunk = groups[0]
    // Roots twisting out over the ground, then the trunk.
    for (const [u, v, s] of [
      [-0.05, 0.006, -1],
      [0.05, 0.008, 1],
      [-0.02, 0.012, -1],
    ]) trunk.push(cap(...P(0, -0.018), ...P(u * 0.5, v * 0.3 - 0.004), 0.012 * z * H, 0.008 * z * H, color), cap(...P(u * 0.5, v * 0.3 - 0.004), ...P(u, v), 0.008 * z * H, Math.max(0.003 * z * H, min), color), cap(...P(u, v), ...P(u + s * 0.02, v + 0.002), Math.max(0.003 * z * H, min), min, color))
    trunk.push(cap(...P(0, 0), ...P(-0.01, -0.1), 0.02 * z * H, 0.016 * z * H, color), cap(...P(-0.01, -0.1), ...P(0.004, -0.17), 0.016 * z * H, 0.012 * z * H, color), ...extra(P))
    for (const [u, v, angle, len, r, depth, seed] of limbs) grow(x + u * z, y + v * z, angle, len * z, r * z, depth, seed, trunk)
    for (const g of groups) if (g.length) this.shape(g, this.lighting, light)
    return tips
  }

  // Grey moss hanging in ragged strands from some of the tips.
  private paintMoss(tips: Point[], z: number, share: number) {
    const H = this.H
    const moss = this.paint([0.36, 0.4, 0.28], this.look.night ? 1.6 : 1)
    const w = this.thick(0.0012 * z, 0.5)
    const parts: Part[] = []
    for (const [i, [x, y]] of tips.entries()) {
      if (hash(i * 7.3 + x * 3) > share) continue
      const len = (0.025 + 0.04 * hash(i * 2.1)) * z
      let px = x
      let py = y
      for (let s = 1; s <= 4; s++) {
        const nx = x + Math.sin(s * 1.7 + i) * 0.004 * z
        const ny = y + (len * s) / 4
        parts.push(cap(px * H, py * H, nx * H, ny * H, w, w * 0.8, moss))
        px = nx
        py = ny
      }
    }
    if (parts.length) this.shape(parts, this.lighting, 0)
  }

  // A spider web strung across a corner at (x, y) in pixels: spokes fanning from angle a0 to a1 and sagging rings.
  private paintWeb(x: number, y: number, r: number, a0: number, a1: number) {
    const look = this.look
    const c = look.night ? this.paint([0.6, 0.62, 0.7], 3) : this.paint([0.62, 0.64, 0.6], 1.3)
    const w = this.thick(0.0005, 0.4)
    const parts: Part[] = []
    const n = 5
    const at = (i: number, f: number): Point => {
      const a = lerp(a0, a1, i / (n - 1))
      return [x + Math.cos(a) * r * f, y + Math.sin(a) * r * f]
    }
    for (let i = 0; i < n; i++) parts.push(cap(x, y, ...at(i, 1), w, w, c))
    for (const f of [0.35, 0.65, 0.95]) for (let i = 0; i + 1 < n; i++) parts.push(cap(...at(i, f), ...at(i + 1, f * 0.92), w, w, c))
    this.shape(parts, this.lighting, 0)
  }

  // The dead forest around the house: a far row of small dark trees along the ridge and a nearer row on the rise,
  // thinning where the house stands, a few draped in moss.
  private paintForest() {
    const { A, look } = this
    const S = this.S
    const [far, near] = look.ridge
    const ridgeY = (x: number) => HORIZON - 0.03 - (fbm1(x * 2.2, 11) - 0.5) * 0.06 + 0.008
    const farC: RGB = [far[0] * 0.62, far[1] * 0.62, far[2] * 0.66]
    for (let x = -0.04, i = 0; x < A + 0.05; x += 0.05 + 0.06 * hash(i * 3.7), i++) {
      const z = 0.2 + 0.12 * hash(i * 1.9)
      const a = (hash(i * 5.1) - 0.5) * 0.5
      this.paintDeadTree(x, ridgeY(x), z, farC, [[0.004, -0.17, -Math.PI / 2 - 0.5 + a, 0.15, 0.01, 2, i * 3 + 1], [0.004, -0.17, -Math.PI / 2 + 0.5 + a, 0.15, 0.01, 2, i * 3 + 2]], 0)
    }
    const nearC: RGB = [near[0] * 0.55, near[1] * 0.55, near[2] * 0.6]
    for (let x = 0.02, i = 0; x < A; x += 0.13 + 0.1 * hash(i * 2.3), i++) {
      if (x > this.hx - 0.24 * S && x < this.hx + 0.26 * S) continue
      const z = 0.5 + 0.25 * hash(i * 4.1)
      const tips = this.paintDeadTree(x, this.riseY(x) + 0.006, z, nearC, [[0.004, -0.17, -Math.PI / 2 - 0.6, 0.15, 0.01, 3, i * 7 + 40], [0.004, -0.17, -Math.PI / 2 + 0.5, 0.16, 0.01, 3, i * 7 + 41]], 0.2)
      if (hash(i * 9.7) < 0.4) this.paintMoss(tips, z, 0.35)
    }
  }

  // The near trees framing the house: the big one on the left with a swing on its long low limb and a lantern on
  // another, and a clawing one at the right edge with moss and a lantern of its own; webs in their forks.
  private paintTrees() {
    const { A, H } = this
    const k = this.k
    const bark = this.paint([0.15, 0.12, 0.1])
    // Narrow screens get smaller trees, so they frame the house rather than hide it.
    const z = 1.35 * (0.5 + 0.5 * k)
    const x = 0.13 * k
    const y = 0.86
    this.lanterns = []
    const tips = this.paintDeadTree(
      x,
      y,
      z,
      bark,
      [
        [0.004, -0.17, -Math.PI / 2 - 0.6, 0.15, 0.01, 4, 3],
        [0.004, -0.17, -Math.PI / 2 + 0.45, 0.16, 0.01, 4, 11],
        [-0.008, -0.13, -Math.PI / 2 - 1.2, 0.1, 0.007, 3, 23],
      ],
      0.6,
      (P) => [cap(...P(-0.008, -0.15), ...P(0.08, -0.172), 0.009 * z * H, 0.007 * z * H, bark), cap(...P(0.08, -0.172), ...P(0.17, -0.16), 0.007 * z * H, 0.004 * z * H, bark), cap(...P(-0.006, -0.12), ...P(-0.09, -0.17), 0.007 * z * H, 0.004 * z * H, bark)],
    )
    this.swing = { x: x + 0.11 * z, y: y - 0.172 * z, len: 0.13 * z }
    this.perch = [(x + 0.045 * z) * H, (y - 0.168 * z) * H]
    this.lanterns.push({ x: x - 0.075 * z, y: y - 0.162 * z, len: 0.035 * z, seed: 77 })
    this.paintMoss(tips, z, 0.22)
    this.paintWeb((x + 0.002 * z) * H, (y - 0.17 * z) * H, 0.03 * z * H, -Math.PI * 0.9, -Math.PI * 0.15)
    // The right one leans in over the graves from beyond the edge.
    const rz = 1.5 * (0.4 + 0.6 * k)
    const rx = A + 0.02
    const ry = 0.95
    const right = this.paintDeadTree(
      rx,
      ry,
      rz,
      bark,
      [
        [0.004, -0.17, -Math.PI / 2 - 0.85, 0.16, 0.011, 4, 61],
        [0.004, -0.17, -Math.PI / 2 - 0.2, 0.14, 0.01, 4, 67],
        [-0.008, -0.11, -Math.PI + 0.25, 0.13, 0.008, 3, 71],
      ],
      0.6,
    )
    this.paintMoss(right, rz, 0.3)
    this.lanterns.push({ x: rx - 0.14 * rz, y: ry - 0.13 * rz, len: 0.03 * rz, seed: 78 })
    this.paintWeb((rx - 0.004 * rz) * H, (ry - 0.15 * rz) * H, 0.028 * rz * H, -Math.PI * 0.85, -Math.PI * 0.2)
  }

  // Dead bushes of bare twigs about the knoll and the graves, and thorny brambles creeping in from the bottom corners.
  private paintUndergrowth() {
    const { A, H } = this
    const S = this.S
    const twig = this.paint([0.14, 0.11, 0.09])
    const w = this.thick(0.0012, 0.55)
    const bush = (x: number, y: number, size: number, seed: number) => {
      const parts: Part[] = []
      for (let i = 0; i < 7; i++) {
        const a = -Math.PI / 2 + (i / 6 - 0.5) * 2.2 + (hash(seed + i) - 0.5) * 0.3
        const len = size * (0.6 + 0.4 * hash(seed * 2 + i))
        const mx = x + Math.cos(a) * len * 0.55
        const my = y + Math.sin(a) * len * 0.55
        parts.push(cap(x * H, y * H, mx * H, my * H, w * 1.4, w, twig), cap(mx * H, my * H, (x + Math.cos(a) * len) * H, (y + Math.sin(a) * len) * H, w, w * 0.7, twig))
        const b = a + (hash(seed * 3 + i) < 0.5 ? -0.6 : 0.6)
        parts.push(cap(mx * H, my * H, (mx + Math.cos(b) * len * 0.35) * H, (my + Math.sin(b) * len * 0.35) * H, w * 0.8, w * 0.6, twig))
      }
      this.shape(parts, this.lighting, 0.2)
    }
    const spots: [number, number, number][] = [
      [this.hx - 0.27 * S, this.hy + 0.01, 0.05],
      [this.hx + 0.3 * S, this.hy + 0.012, 0.045],
      [this.hx - 0.36 * S, this.riseY(this.hx - 0.36 * S) + 0.01, 0.035],
      [this.hx + 0.42 * S, this.riseY(this.hx + 0.42 * S) + 0.01, 0.04],
      [0.3 * this.k, 0.83, 0.04],
      [A - 0.36 * this.k, 0.84, 0.04],
    ]
    for (const [i, [x, y, s]] of spots.entries()) bush(x, y, s, i * 11 + 5)
    // Brambles: thorny stems arching up out of the bottom corners.
    const thorn = this.paint([0.12, 0.09, 0.08])
    const stem = this.thick(0.0016, 0.6)
    for (const side of [-1, 1]) {
      const x0 = side < 0 ? 0 : A
      const parts: Part[] = []
      for (let j = 0; j < 4; j++) {
        const reach = 0.09 + 0.05 * hash(j * 3.3 + side)
        const lift = 0.05 + 0.05 * hash(j * 1.7 + side)
        let px = x0
        let py = 1.01
        for (let i = 1; i <= 8; i++) {
          const t = i / 8
          const nx = x0 - side * reach * t
          const ny = 1.01 - lift * Math.sin(t * Math.PI * 0.85) - j * 0.012
          parts.push(cap(px * H, py * H, nx * H, ny * H, stem, stem, thorn))
          if (i % 2 === 0 && !this.cells) parts.push(cap(nx * H, ny * H, (nx - side * 0.004) * H, (ny - 0.006) * H, stem, 0.3 * this.px, thorn))
          px = nx
          py = ny
        }
      }
      this.shape(parts, this.lighting, 0)
    }
  }

  // A skull grinning from a post top at (x, y), radius r, in screen heights.
  private paintSkull(x: number, y: number, r: number) {
    const H = this.H
    const bone = this.paint([0.78, 0.74, 0.6], this.look.night ? 2.4 : 1)
    const hole = this.paint([0.03, 0.02, 0.03])
    this.shape([ell(x * H, (y - r * 1.1) * H, r * H, r * 0.95 * H, 0, bone), ell(x * H, (y - r * 0.3) * H, r * 0.6 * H, r * 0.4 * H, 0, bone)], this.lighting, 0.5)
    for (const s of [-1, 1]) this.ellipse((x + s * r * 0.38) * H, (y - r * 1.0) * H, Math.max(r * 0.26 * H, 0.6), Math.max(r * 0.3 * H, 0.6), hole[0], hole[1], hole[2], 1)
    this.ellipse(x * H, (y - r * 0.58) * H, Math.max(r * 0.1 * H, 0.4), Math.max(r * 0.14 * H, 0.4), hole[0], hole[1], hole[2], 0.9)
  }

  // A crooked warning sign by the gate: a board on a post, painted with a skull and crossed bones.
  private paintSign(x: number) {
    const H = this.H
    const wood = this.paint([0.34, 0.24, 0.14])
    const post = this.paint([0.22, 0.15, 0.09])
    const y = FENCE + 0.02
    this.shape([cap(x * H, y * H, (x + 0.004) * H, (y - 0.1) * H, this.thick(0.003, 0.8), this.thick(0.0025, 0.7), post)], this.lighting, 0.4)
    const a = -0.18
    const cx = x + 0.004
    const cy = y - 0.085
    const R = (u: number, v: number): Point => [(cx + u * Math.cos(a) - v * Math.sin(a)) * H, (cy + u * Math.sin(a) + v * Math.cos(a)) * H]
    this.polygon([R(-0.04, -0.022), R(0.038, -0.024), R(0.042, 0.02), R(-0.036, 0.024)], wood)
    this.polygon([R(0.02, -0.024), R(0.038, -0.024), R(0.042, 0.02), R(0.03, 0.021)], [wood[0] * 0.7, wood[1] * 0.7, wood[2] * 0.7])
    const mark = this.paint([0.06, 0.03, 0.03])
    const w = this.thick(0.0018, 0.6)
    this.shape([cap(...R(-0.018, 0.016), ...R(0.016, -0.0), w, w, mark), cap(...R(-0.018, -0.0), ...R(0.016, 0.016), w, w, mark)], this.lighting, 0)
    const [sx, sy] = R(-0.001, -0.004)
    this.ellipse(sx, sy, 0.009 * H, 0.008 * H, mark[0], mark[1], mark[2], 1)
    this.ellipse(sx, sy + 0.007 * H, 0.005 * H, 0.004 * H, mark[0], mark[1], mark[2], 1)
    this.raven = { x: R(0.03, -0.024)[0] / H, y: R(0.03, -0.024)[1] / H }
  }

  // A coffin leaning against the crypt's side, its lid ajar.
  private paintCoffin(x: number, y: number) {
    const H = this.H
    const wood = this.paint([0.24, 0.15, 0.1])
    const a = 0.22
    const R = (u: number, v: number): Point => [(x + u * Math.cos(a) + v * Math.sin(a)) * H, (y - v * Math.cos(a) + u * Math.sin(a)) * H]
    const shapeOf = (s: number, du: number): Point[] => [R(-0.014 * s + du, 0), R(0.014 * s + du, 0), R(0.022 * s + du, 0.075), R(0.016 * s + du, 0.11), R(-0.016 * s + du, 0.11), R(-0.022 * s + du, 0.075)]
    this.polygon(shapeOf(1, 0), [wood[0] * 0.5, wood[1] * 0.5, wood[2] * 0.5])
    this.polygon(shapeOf(0.92, 0.008), wood)
    this.edge(R(0.008, 0.08), R(0.008, 0.03), 0.0008, [wood[0] * 0.6, wood[1] * 0.6, wood[2] * 0.6])
    this.edge(R(-0.006, 0.065), R(0.022, 0.065), 0.0008, [wood[0] * 0.6, wood[1] * 0.6, wood[2] * 0.6])
  }

  // The reaper: a tall hooded figure in a ragged cloak standing among the graves, a scythe in hand and only darkness
  // under its hood.
  private paintReaper(x: number, y: number) {
    const H = this.H
    const s = 0.2
    const cloak = this.paint([0.05, 0.045, 0.06])
    const P = (u: number, v: number): Point => [(x + u * s) * H, (y - v * s) * H]
    const hem: Point[] = []
    for (let i = 0; i <= 6; i++) hem.push(P(0.2 - (i / 6) * 0.42, (i % 2) * 0.03))
    this.polygon([...hem, P(-0.16, 0.5), P(-0.11, 0.78), P(-0.02, 0.9), P(0.09, 0.82), P(0.14, 0.55)], cloak)
    this.polygon([P(-0.02, 0.9), P(0.11, 0.86), P(0.13, 0.72), P(0.06, 0.66), P(-0.06, 0.7)], [cloak[0] * 1.3, cloak[1] * 1.3, cloak[2] * 1.4])
    this.ellipse(...P(0.055, 0.76), 0.038 * s * H * 1.2, 0.055 * s * H, 0.008, 0.005, 0.01, 1)
    const eye: RGB = this.look.style === "front" ? [0.6, 0.12, 0.05] : [1.6, 0.25, 0.08]
    for (const e of [-1, 1]) this.disc(...P(0.055 + e * 0.022, 0.765), Math.max(0.006 * s * H, 0.6 * this.px), eye[0], eye[1], eye[2], 1)
    // The scythe: a long crooked snath and a curved blade.
    const wood = this.paint([0.2, 0.15, 0.1])
    const w = this.thick(0.0022, 0.7)
    this.shape([cap(...P(0.18, -0.02), ...P(0.26, 1.08), w, w, wood), cap(...P(0.14, 0.52), ...P(0.22, 0.54), w * 1.8, w * 1.6, cloak)], this.lighting, 0.3)
    const blade = this.paint([0.55, 0.56, 0.6], this.look.night ? 1.8 : 1)
    const arc: Point[] = []
    for (let i = 0; i <= 8; i++) {
      const t = i / 8
      arc.push(P(0.26 - t * 0.34, 1.08 + Math.sin(t * Math.PI) * 0.06 - t * 0.1))
    }
    for (let i = 8; i >= 0; i--) {
      const t = i / 8
      arc.push(P(0.26 - t * 0.3, 1.06 + Math.sin(t * Math.PI) * 0.025 - t * 0.09))
    }
    this.polygon(arc, blade)
    if (this.look.style === "rim") this.rimEdges([P(-0.16, 0.5), P(-0.11, 0.78), P(-0.02, 0.9), P(0.09, 0.82)])
  }

  // The graveyard's iron fence across the front of the knoll, with a gate ajar where the path comes down from the
  // porch steps.
  private paintFences() {
    const { A, H, look } = this
    const S = this.S
    const gate = this.hx + 0.015 * S
    const half = 0.045
    this.paintFence(-0.02, gate - half, 0.05)
    this.paintFence(gate + half, A + 0.02, 0.05)
    // Skulls on the gate posts and on every other post along the fence.
    const post = this.paint([0.08, 0.07, 0.09])
    for (const side of [-1, 1])
      for (let x = gate + side * half, i = 0; x > 0.02 && x < A - 0.02; x += side * 0.28, i++) {
        if (i > 0) this.polygon([[(x - 0.005) * H, FENCE * H], [(x + 0.005) * H, FENCE * H], [(x + 0.005) * H, (FENCE - 0.062) * H], [(x - 0.005) * H, (FENCE - 0.062) * H]], post)
        if (i % 2 === 0) this.paintSkull(x, FENCE - 0.062, 0.011)
      }
    this.paintSign(gate - half - 0.1)
    const path = this.paint(look.dirt, look.night ? 2 : 1.3)
    this.polygon([[(gate - half) * H, (FENCE + 0.004) * H], [(gate + half) * H, (FENCE + 0.004) * H], [(this.hx + 0.05 * S) * H, (this.hy + 0.03 * S) * H], [(this.hx - 0.02 * S) * H, (this.hy + 0.03 * S) * H]], path, 0.45)
    // The gate's two leaves, one swung half open.
    const iron = this.paint([0.06, 0.05, 0.07])
    const r = this.thick(0.0016, 0.55)
    const parts: Part[] = []
    const top = FENCE - 0.065
    for (const [x0, x1, y1] of [
      [gate - half, gate - 0.003, 0],
      [gate + half, gate + 0.016, 0.016],
    ]) {
      parts.push(cap(x0 * H, FENCE * H, x1 * H, (FENCE + y1) * H, r, r, iron), cap(x0 * H, (top + 0.012) * H, x1 * H, (top + 0.012 + y1 * 1.2) * H, r, r, iron))
      for (let i = 0; i <= 5; i++) {
        const xx = lerp(x0, x1, i / 5)
        const yy = lerp(0, y1, i / 5)
        parts.push(cap(xx * H, (FENCE + yy) * H, xx * H, (top + yy * 1.1 - Math.sin((i / 5) * Math.PI) * 0.008) * H, r, r, iron))
      }
    }
    this.shape(parts, this.lighting, 0.4)
  }

  private paintFence(x0: number, x1: number, h: number) {
    const { H } = this
    const iron = this.paint([0.06, 0.05, 0.07])
    const bar = this.thick(0.0016, 0.55)
    const parts: Part[] = []
    const top = FENCE - h
    parts.push(cap(x0 * H, (top + 0.008) * H, x1 * H, (top + 0.008) * H, bar, bar, iron), cap(x0 * H, (FENCE - 0.008) * H, x1 * H, (FENCE - 0.008) * H, bar, bar, iron))
    const step = this.cells ? 0.026 : 0.018
    for (let x = x0 + step / 2; x < x1; x += step) parts.push(cap(x * H, FENCE * H, x * H, top * H, bar, bar, iron))
    this.shape(parts, this.lighting, 0.4)
    for (let x = x0 + step / 2; x < x1; x += step) this.polygon([[x * H - bar * 1.8, top * H], [x * H + bar * 1.8, top * H], [x * H, (top - 0.009) * H]], iron)
    const post = this.paint([0.08, 0.07, 0.09])
    for (const x of [x0, x1]) if (x > 0 && x < this.A) this.polygon([[(x - 0.005) * H, FENCE * H], [(x + 0.005) * H, FENCE * H], [(x + 0.005) * H, (top - 0.012) * H], [(x - 0.005) * H, (top - 0.012) * H]], post)
  }

  // Where the crypt stands: near the right edge, but no further from the house than wide screens need.
  private cryptX() {
    return Math.min(this.A - 0.2 * this.k, this.hx + 0.6 * this.S)
  }

  // A stone crypt framing the house on the right: steps, two columns, a pediment and a heavy iron door.
  private paintCrypt() {
    const { A, H, look } = this
    const x = this.cryptX()
    const y = 0.88
    const z = 1.35
    const Q = (u: number, v: number): Point => [(x + u * z) * H, (y - v * z) * H]
    const w = 0.055
    const stone = look.stone
    const dark: RGB = [stone[0] * 0.6, stone[1] * 0.6, stone[2] * 0.65]
    this.polygon([Q(w, 0), Q(w + 0.025, 0.01), Q(w + 0.025, 0.095), Q(w, 0.085)], dark)
    this.polygon([Q(-w, 0), Q(w, 0), Q(w, 0.085), Q(-w, 0.085)], stone)
    for (let v = 0.02; v < 0.08; v += 0.02) this.edge(Q(-w, v), Q(w, v), 0.0006, dark)
    this.polygon([Q(-w - 0.008, 0.083), Q(w + 0.008, 0.083), Q(0, 0.125)], [stone[0] * 0.85, stone[1] * 0.85, stone[2] * 0.88])
    this.polygon([Q(-w * 0.55, 0.096), Q(w * 0.55, 0.096), Q(0, 0.116)], dark)
    for (const s of [-1, 1]) this.polygon([Q(s * w * 0.7 - 0.006, 0), Q(s * w * 0.7 + 0.006, 0), Q(s * w * 0.7 + 0.006, 0.08), Q(s * w * 0.7 - 0.006, 0.08)], [stone[0] * 1.15, stone[1] * 1.15, stone[2] * 1.15])
    this.polygon([Q(-0.022, 0), Q(0.022, 0), Q(0.022, 0.058), Q(0, 0.066), Q(-0.022, 0.058)], this.paint([0.08, 0.08, 0.09]))
    this.edge(Q(0, 0), Q(0, 0.064), 0.0008, this.paint([0.03, 0.03, 0.04]))
    this.polygon([Q(-w - 0.01, -0.008), Q(w + 0.01, -0.008), Q(w + 0.01, 0), Q(-w - 0.01, 0)], dark)
    this.edge(Q(-0.035, 0.07), Q(-0.02, 0.04), 0.0008, dark)
    if (look.style === "rim") this.rimEdges([Q(-w - 0.008, 0.083), Q(0, 0.125), Q(w + 0.008, 0.083)])
    this.paintCoffin(x - (w + 0.02) * z - 0.02, y)
  }

  // Tilted gravestones spreading through the graveyard in front of the house, with mounds; an open grave with a spade
  // in its heap; and the grave the hand claws out of.
  private paintGraves() {
    const { A, H, look } = this
    const k = this.k
    const S = this.S
    const gate = this.hx + 0.015 * S
    const crypt = this.cryptX()
    const open = { x: this.hx - 0.3 * S, y: 0.955 }
    this.open = open
    this.grave = { x: this.hx + 0.28 * S, y: 0.955 }
    const stones: Stone[] = []
    for (let i = 0; stones.length < 26 && i < 500; i++) {
      const y = lerp(FENCE + 0.03, 0.985, hash(i * 1.93) ** 0.8)
      const x = hash(i * 2.71) * A
      if (Math.abs(x - crypt) < 0.12 && y < 0.9) continue
      if (Math.abs(x - 0.13 * k) < 0.07 && y < 0.9) continue
      if (Math.abs(x - gate) < 0.06 && y < 0.86) continue
      if ((Math.abs(x - open.x) < 0.09 || Math.abs(x - this.grave.x) < 0.07) && Math.abs(y - 0.955) < 0.05) continue
      if (Math.abs(x - this.hx) < 0.25 && hash(i * 5.7) < 0.5) continue
      const s = 0.02 + 0.03 * smoothstep(FENCE, 1, y)
      if (stones.some((o) => Math.abs(o.x - x) < (o.s + s) * 1.1 && Math.abs(o.y - y) < 0.04)) continue
      stones.push({ x, y, s, tilt: (hash(i * 7.9) - 0.5) * 0.5, kind: Math.floor(hash(i * 3.3) * 4) })
    }
    // Lively and teeming: the reaper stands among the stones, in front of those behind it and behind those in front.
    const reaper = this.activity === "calm" ? undefined : { x: Math.max(0.24, this.hx - 0.42 * S), y: 0.905 }
    this.stones = stones.filter((s) => !reaper || Math.abs(s.x - reaper.x) > 0.06 || s.y < reaper.y - 0.07 || s.y > reaper.y + 0.01).sort((a, b) => a.y - b.y)
    const mound = this.paint(look.dirt, 0.8)
    const slumped = this.stones.filter((s) => s.x > this.hx + 0.3 * S && s.x < A - 0.12 && s.y > 0.88 && s.s > 0.035).sort((a, b) => a.x - b.x)[0]
    let stood = !reaper
    for (const s of this.stones) {
      if (!stood && reaper && s.y > reaper.y) {
        this.paintReaper(reaper.x, reaper.y)
        stood = true
      }
      if (hash(s.x * 13.1) < 0.6) this.ellipse(s.x * H, (s.y + s.s * 0.5) * H, s.s * 1.6 * H, s.s * 0.45 * H, mound[0], mound[1], mound[2], 0.6)
      this.drawStone(s)
      // A skeleton slumped against one big stone at the front right.
      if (s === slumped) this.drawSkeleton(this.slumpPose((s.x + 0.012) * H, (s.y + 0.012) * H, 0.12 * H, 1), 0.12 * H)
    }
    if (!stood && reaper) this.paintReaper(reaper.x, reaper.y)
    // Mist pooling low between the stones.
    const mist = look.fog
    for (let i = 0; i < 12; i++) {
      const x = hash(i * 4.3 + 0.7) * A
      const y = lerp(FENCE + 0.03, 0.97, hash(i * 2.9))
      this.ellipse(x * H, y * H, (0.06 + 0.05 * hash(i * 1.3)) * H, (0.008 + 0.006 * hash(i * 6.1)) * H, mist[0], mist[1], mist[2], 0.22)
    }
    // The open grave: a dark pit, a heap of earth and a spade.
    const ox = open.x
    const oy = open.y
    const pit = this.paint([0.03, 0.02, 0.02])
    this.ellipse((ox + 0.075) * H, (oy - 0.006) * H, 0.045 * H, 0.02 * H, mound[0] * 1.2, mound[1] * 1.2, mound[2] * 1.2, 1)
    this.polygon([[(ox - 0.058) * H, (oy - 0.015) * H], [(ox + 0.052) * H, (oy - 0.015) * H], [(ox + 0.064) * H, (oy + 0.018) * H], [(ox - 0.07) * H, (oy + 0.018) * H]], pit)
    this.edge([(ox - 0.07) * H, (oy + 0.018) * H], [(ox + 0.064) * H, (oy + 0.018) * H], 0.0025, mound)
    this.shape([cap((ox + 0.09) * H, (oy - 0.015) * H, (ox + 0.105) * H, (oy - 0.078) * H, this.thick(0.0022, 0.6), this.thick(0.0022, 0.6), this.paint([0.32, 0.22, 0.14])), ell((ox + 0.088) * H, (oy - 0.01) * H, 0.008 * H, 0.012 * H, 0.2, this.paint([0.4, 0.4, 0.42]))], this.lighting, 0.5)
    // The restless grave, freshly heaped under a leaning stone.
    this.ellipse(this.grave.x * H, this.grave.y * H, 0.06 * H, 0.016 * H, mound[0] * 1.1, mound[1] * 1.1, mound[2] * 1.1, 1)
    this.drawStone({ x: this.grave.x - 0.06, y: this.grave.y, s: 0.04, tilt: -0.2, kind: 1 })
  }

  // A gravestone standing at (x, y) in screen heights: a rounded or pointed slab, an obelisk or a cross-topped
  // marker, mossy at the foot.
  private drawStone(s: Stone) {
    const { H, look } = this
    const x = s.x * H
    const y = s.y * H
    const w = s.s * 0.6 * H
    const h = s.s * 1.9 * H
    const t = s.tilt
    const R = (u: number, v: number): Point => [x + u * w + v * h * t * 0.3, y - v * h]
    const c = look.stone
    const shade: RGB = [c[0] * 0.65, c[1] * 0.65, c[2] * 0.7]
    if (s.kind === 2) {
      this.polygon([R(-0.6, 0), R(0.6, 0), R(0.6, 0.12), R(-0.6, 0.12)], shade)
      this.polygon([R(-0.38, 0.1), R(0.38, 0.1), R(0.26, 1.05), R(0, 1.25), R(-0.26, 1.05)], c)
    }
    if (s.kind !== 2) {
      const top = s.kind === 1 ? [R(1, 0.78), R(0, 1.05), R(-1, 0.78)] : [R(1, 0.75), R(0.7, 0.95), R(0, 1.03), R(-0.7, 0.95), R(-1, 0.75)]
      this.polygon([R(-1.05, 0), R(1.05, 0), R(1.05, 0.06), R(1, 0.07), ...top, R(-1, 0.07), R(-1.05, 0.06)], c)
      this.polygon([R(0.55, 0), R(1.05, 0), R(1, 0.7), R(0.6, 0.7)], [c[0] * 0.85, c[1] * 0.85, c[2] * 0.88])
      if (s.kind === 3 && w > 2.5 * this.px) this.polygon([R(-0.4, 0.5), R(0.4, 0.5), R(0.4, 0.58), R(-0.4, 0.58)], shade)
    }
    if (look.style === "rim") {
      const r = this.thick(0.0011, 0.45)
      const k = look.night ? 0.12 : 0.2
      const l: RGB = [look.light[0] * k, look.light[1] * k, look.light[2] * k]
      this.shape([cap(...R(-1, 0.1), ...R(-1, 0.8), r, r, l), cap(...R(-1, 0.8), ...R(0, 1.04), r, r, l)], this.lighting, 0)
    }
  }

  // A pumpkin: a ribbed body with a stem (unless only its candlelight is redrawn), its face glowing scaled by light.
  private drawPumpkin(p: Pumpkin, light: number, body: boolean) {
    const look = this.look
    const x = p.x
    const r = p.r
    const cy = p.y - r * 0.85
    const rx = r * 1.22
    const ry = r * 0.86
    if (body) {
      this.shape([ell(x, cy, rx, ry, 0, look.style === "rim" ? look.skin : this.paint(look.skin), 4)], this.lighting, 0.7)
      this.shape([cap(x, cy - r * 0.75, x + r * 0.18, cy - r * 1.15, Math.max(r * 0.16, 0.5 * this.px), Math.max(r * 0.11, 0.4 * this.px), this.paint([0.3, 0.32, 0.1]))], this.lighting, 0.4)
    }
    const g = look.glow * light
    const c: RGB = [CANDLE[0] * g, CANDLE[1] * g, CANDLE[2] * g]
    if (rx < 3.2 * this.px) {
      this.ellipse(x, cy + ry * 0.05, rx * 0.62, Math.max(ry * 0.32, 0.55 * this.px), c[0], c[1], c[2], 0.9)
      return
    }
    for (const s of [-1, 1]) this.polygon([[x + s * rx * 0.52, cy - ry * 0.02], [x + s * rx * 0.14, cy - ry * 0.02], [x + s * rx * 0.34, cy - ry * 0.48]], c)
    this.polygon([[x - rx * 0.08, cy + ry * 0.16], [x + rx * 0.08, cy + ry * 0.16], [x, cy + ry * 0.02]], c)
    const mouth: Point[] = []
    for (let i = 0; i <= 8; i++) {
      const u = -0.62 + (1.24 * i) / 8
      mouth.push([x + u * rx, cy + (0.26 + 0.36 * (1 - (u * u) / 0.4)) * ry * 0.85])
    }
    for (let i = 8; i >= 0; i--) {
      const u = -0.62 + (1.24 * i) / 8
      mouth.push([x + u * rx, cy + (0.24 + 0.12 * (1 - (u * u) / 0.4) + (i % 4 === 2 ? 0.14 : 0)) * ry])
    }
    this.polygon(mouth, c)
  }

  // Bats loop around the turret, the moon and the tree; ghosts haunt the house's front and the graves on the left.
  private placeCreatures() {
    const { A } = this
    const k = this.k
    const S = this.S
    const anchors: Point[] = [
      [this.hx - 0.13 * S, this.hy - 0.5 * S],
      [this.orb.x * A + 0.15, 0.1],
      [0.2 * k, 0.42],
      [this.hx + 0.16 * S, this.hy - 0.45 * S],
      [this.orb.x * A - 0.2, 0.22],
      [this.hx + 0.3 * S, 0.12],
    ]
    for (const [i, b] of this.bats.entries()) [b.ax, b.ay] = anchors[i % anchors.length]
    for (const [i, g] of this.ghosts.entries()) {
      const [x0, x1] = i === 0 ? [this.hx - 0.12 * S, this.hx + 0.14 * S] : [0.05 * k, this.hx - 0.3 * S]
      g.x0 = x0
      g.x1 = x1
      if (g.x === 0) g.x = lerp(x0, x1, hash(i * 3.7 + 1))
      g.y = i === 0 ? this.hy - 0.13 * S : 0.86
    }
    // Eyes glinting in the woods either side of the house, and will-o'-wisps over the graves.
    const eyes = { calm: 1, lively: 3, teeming: 5 }[this.activity]
    this.eyes = Array.from({ length: eyes }, (_, i) => {
      const left = i % 2 === 0
      const x = left ? lerp(0.04, Math.max(0.08, this.hx - 0.3 * S), hash(i * 3.9)) : lerp(Math.min(A - 0.08, this.hx + 0.34 * S), A - 0.04, hash(i * 3.9))
      return { x, y: this.riseY(x) - 0.012 - 0.04 * hash(i * 7.1), phase: hash(i * 5.3) * 40, green: i % 3 === 1 }
    })
    const wisps = { calm: 1, lively: 3, teeming: 5 }[this.activity]
    this.wisps = Array.from({ length: wisps }, (_, i) => ({ x: lerp(0.08, A - 0.08, hash(i * 2.3 + 0.4)), y: lerp(0.84, 0.95, hash(i * 6.7)), phase: hash(i * 1.7) * TAU }))
    const z = this.zombie
    if (z.x === 0.5) Object.assign(z, { x: A * 0.3, y: lerp(WALK0, WALK1, 0.5) })
  }

  // Lights in the windows: steady glows, the flickering candle, and in teeming a light carried from room to room;
  // clicked windows flash with a figure standing in them. Lit windows spill a little light below them.
  private drawWindows() {
    const { H, look } = this
    const dim = 1 - 0.6 * this.gloom * (0.6 + 0.4 * Math.sin(this.time * 9))
    const wander = this.activity === "teeming" ? (this.time / ROOM) % (this.rooms + 2) : -10
    for (const w of this.windows) {
      if (w.kind === "boarded") continue
      const pass = Math.exp(-(((wander - w.room) / 0.6) ** 2))
      const base = w.kind === "glow" ? 0.7 * firelight(this.time * 0.8, w.seed) : w.kind === "candle" ? 0.5 * firelight(this.time * 2, w.seed) : 0
      const k = (base + 0.85 * pass + w.flash) * dim * look.glow
      if (k <= 0.01 && w.kind === "dark") continue
      const g = look.window
      this.polygon(w.pts, [lerp(look.glass[0], g[0] * k, Math.min(1, k * 2)), lerp(look.glass[1], g[1] * k, Math.min(1, k * 2)), lerp(look.glass[2], g[2] * k, Math.min(1, k * 2))])
      if (w.seed === 7) this.drawPortrait(w, k)
      if (w.seed === 4) this.drawCandelabra(w, dim)
      if (w.flash > 0.7) this.drawFigure(w)
      if (this.windows[this.passer.win] === w) this.drawPasser(w, this.passer.t)
      if (w.kind === "candle") this.drawCandle(w, dim)
      // Torn curtains, backlit by the room's light, stirring in a draft.
      const stir = Math.sin(this.time * 0.9 + w.seed * 1.7) * (0.6 + gust(w.x / H, this.time))
      this.drawCurtains(w, [0.05 + g[0] * k * 0.16, 0.008 + g[1] * k * 0.04, 0.012 + g[2] * k * 0.03], stir)
      this.drawMuntins(w)
      if (look.style === "rim" || k > 0.4) this.lights.pool(w.x, w.y + w.h, w.w * 4, w.h * 1.5, [1, 0.55, 0.15], 1.2 * k, 0.006 * k)
    }
    // The lanterns hanging from the trees, swaying a little.
    for (const l of this.lanterns) {
      const sway = Math.sin(this.time * 0.7 + l.seed) * 0.15 + gust(l.x, this.time) * 0.25
      const lx = (l.x + Math.sin(sway) * l.len) * H
      const ly = (l.y + Math.cos(sway) * l.len) * H
      this.shape([cap(l.x * H, l.y * H, lx, ly - 0.008 * H, this.thick(0.0008, 0.45), this.thick(0.0008, 0.45), this.paint([0.1, 0.08, 0.06]))], this.lighting, 0)
      const f = firelight(this.time * 2.4, l.seed) * dim
      this.polygon([[lx - 0.008 * H, ly - 0.013 * H], [lx + 0.008 * H, ly - 0.013 * H], [lx + 0.007 * H, ly + 0.011 * H], [lx - 0.007 * H, ly + 0.011 * H]], this.paint([0.12, 0.1, 0.08]))
      const lg = look.glow * f * 1.2
      this.ellipse(lx, ly, 0.005 * H, 0.009 * H, CANDLE[0] * lg, CANDLE[1] * lg, CANDLE[2] * lg, 1)
      this.lights.pool(lx, ly, 0.09 * H, 0.08 * H, [1, 0.5, 0.12], 2 * f * (look.style === "front" ? 0.5 : 1), 0.014 * f)
    }
  }

  // Two torn curtains drawn back to the window's sides, their ragged hems swinging out by stir (about -1 to 1).
  private drawCurtains(w: Window, color: RGB, stir: number) {
    const [a, b, c, d] = w.pts
    const min = this.cells ? 1.2 : 0.6
    for (const side of [-1, 1]) {
      const top = side < 0 ? d : c
      const bottom = side < 0 ? a : b
      const width = Math.max(w.w * 0.42, min)
      const sway = stir * w.w * 0.12 * (side < 0 ? 1 : 0.7)
      const inner = (t: number) => -side * width * (1 - 0.45 * t)
      const hem: Point[] = []
      const n = 4
      for (let i = 0; i <= n; i++) {
        const f = i / n
        const len = 0.72 + 0.22 * hash(w.seed * 3.1 + side + i)
        hem.push([lerp(bottom[0], top[0], 1 - len) + inner(len) * f + sway * len, lerp(bottom[1], top[1], 1 - len)])
      }
      this.polygon([top, [top[0] + inner(0), top[1]], ...hem.reverse(), [lerp(bottom[0], top[0], 0.2) + sway, lerp(bottom[1], top[1], 0.2)]], color)
    }
  }

  // A portrait hanging in the bay's room: a gilt frame round a dark figure whose eyes catch the light now and then.
  private drawPortrait(w: Window, k: number) {
    const x = w.x
    const y = w.y - w.h * 0.1
    const fw = w.w * 0.5
    const fh = w.h * 0.34
    const gilt: RGB = [0.5 * k + 0.05, 0.32 * k + 0.03, 0.08 * k + 0.01]
    this.polygon([[x - fw, y - fh], [x + fw, y - fh], [x + fw, y + fh], [x - fw, y + fh]], gilt)
    const inside: RGB = [0.06 * k + 0.01, 0.03 * k + 0.005, 0.03 * k + 0.01]
    this.polygon([[x - fw * 0.7, y - fh * 0.75], [x + fw * 0.7, y - fh * 0.75], [x + fw * 0.7, y + fh * 0.75], [x - fw * 0.7, y + fh * 0.75]], inside)
    const sitter = this.paint([0.02, 0.015, 0.02])
    this.ellipse(x, y - fh * 0.15, fw * 0.32, fh * 0.32, sitter[0], sitter[1], sitter[2], 1)
    this.polygon([[x - fw * 0.6, y + fh * 0.75], [x + fw * 0.6, y + fh * 0.75], [x + fw * 0.3, y + fh * 0.2], [x - fw * 0.3, y + fh * 0.2]], sitter)
    if (Math.sin(this.time * 0.6 + 1.3) < 0.85) return
    for (const e of [-1, 1]) this.disc(x + e * fw * 0.13, y - fh * 0.18, Math.max(fw * 0.07, 0.5), 1.8, 0.25, 0.08, 1)
  }

  // A tall candelabra standing in a room: a stem on a foot, two curving arms and three flickering flames.
  private drawCandelabra(w: Window, dim: number) {
    const H = this.H
    const x = w.x
    const base = w.y + w.h * 0.45
    const top = w.y - w.h * 0.05
    const metal = this.paint([0.06, 0.04, 0.03])
    const r = Math.max(0.0012 * this.S * H, this.cells ? 0.5 : 0.35)
    const arm = w.w * 0.55
    this.shape([cap(x - arm * 0.4, base, x + arm * 0.4, base, r, r, metal), cap(x, base, x, top, r, r, metal), cap(x, top + w.h * 0.08, x - arm, top, r, r, metal), cap(x, top + w.h * 0.08, x + arm, top, r, r, metal)], this.lighting, 0)
    for (const [i, dx] of [-arm, 0, arm].entries()) {
      const f = firelight(this.time * 3, w.seed * 5 + i) * dim
      const fy = top - (i === 1 ? w.h * 0.06 : 0)
      this.ellipse(x + dx, fy - w.h * 0.06, Math.max(w.w * 0.08, 0.6), Math.max(w.h * 0.06 * f, 0.6), CANDLE[0] * 1.3 * f, CANDLE[1] * 1.3 * f, CANDLE[2] * f, 1)
    }
  }

  // The rocking chair on the porch, rocking on its own from lively up.
  private drawRocker() {
    const H = this.H
    const [x, y] = this.rocker
    const sz = 0.045 * this.S * H
    const a = this.activity === "calm" ? 0 : Math.sin(this.time * 1.3) * 0.17 * (0.75 + 0.25 * Math.sin(this.time * 0.23))
    const ca = Math.cos(a)
    const sa = Math.sin(a)
    const R = (u: number, v: number): Point => [x + (u * ca - v * sa) * sz, y + (u * sa + v * ca) * sz]
    const wood = this.paint([0.28, 0.18, 0.1])
    const w = this.thick(0.0016 * this.S, 0.6)
    const parts: Part[] = []
    const rock: Point[] = []
    for (let i = 0; i <= 6; i++) {
      const u = -0.55 + (1.1 * i) / 6
      rock.push(R(u, -0.35 * u * u))
    }
    for (let i = 0; i < 6; i++) parts.push(cap(...rock[i], ...rock[i + 1], w, w, wood))
    parts.push(cap(...R(0.28, -0.03), ...R(0.28, -0.45), w, w, wood), cap(...R(-0.26, -0.03), ...R(-0.28, -0.45), w, w, wood))
    parts.push(cap(...R(-0.3, -0.45), ...R(0.32, -0.45), w * 1.3, w * 1.3, wood))
    parts.push(cap(...R(-0.28, -0.45), ...R(-0.42, -1.1), w, w, wood), cap(...R(-0.14, -0.45), ...R(-0.26, -1.08), w, w, wood), cap(...R(-0.45, -1.12), ...R(-0.22, -1.1), w * 1.2, w * 1.2, wood))
    parts.push(cap(...R(-0.34, -0.74), ...R(0.3, -0.7), w, w, wood), cap(...R(0.28, -0.45), ...R(0.3, -0.7), w, w, wood))
    this.shape(parts, this.lighting, 0.3)
  }

  // A candle on the sill: a little flame bending in drafts.
  private drawCandle(w: Window, dim: number) {
    const H = this.H
    const x = w.x
    const y = w.y + w.h * 0.45
    const f = firelight(this.time * 3, w.seed + 5) * dim
    this.polygon([[x - 0.003 * H, y], [x + 0.003 * H, y], [x + 0.003 * H, y - 0.01 * H], [x - 0.003 * H, y - 0.01 * H]], this.paint([0.9, 0.85, 0.7], this.look.night ? 2 : 1))
    const lean = Math.sin(this.time * 1.7 + w.seed) * 0.002 * H
    this.ellipse(x + lean, y - 0.016 * H, 0.0028 * H, 0.0065 * H * f, CANDLE[0] * 1.3 * f, CANDLE[1] * 1.3 * f, CANDLE[2] * f, 1)
    this.lights.pool(x, y - 0.015 * H, 0.05 * H, 0.04 * H, [1, 0.5, 0.12], 1.5 * f, 0.01 * f)
  }

  // A dark figure gliding past behind a lit window, t from 0 to 1 across it, kept within the glass.
  private drawPasser(w: Window, t: number) {
    const c = this.paint([0.02, 0.015, 0.03])
    const x = w.x + (t * 2.6 - 1.3) * w.w
    const y = w.y + w.h * 0.5
    const x0 = w.x - w.w
    const x1 = w.x + w.w
    const X = (u: number) => clamp(x + u * w.w, x0, x1)
    if (X(-0.7) >= X(0.7)) return
    this.polygon([[X(-0.7), y], [X(0.7), y], [X(0.45), y - w.h * 0.5], [X(-0.45), y - w.h * 0.5]], c)
    const hx = x
    if (hx - w.w * 0.3 > x0 && hx + w.w * 0.3 < x1) this.ellipse(hx, y - w.h * 0.66, w.w * 0.3, w.h * 0.19, c[0], c[1], c[2], 1)
  }

  // A dark figure standing in a flashing window, head and shoulders against the light.
  private drawFigure(w: Window) {
    const k = smoothstep(0.7, 0.95, w.flash)
    const c = this.paint([0.02, 0.015, 0.03])
    const x = w.x
    const y = w.y + w.h * 0.5
    this.polygon([[x - w.w * 0.75, y], [x + w.w * 0.75, y], [x + w.w * 0.5, y - w.h * 0.45], [x - w.w * 0.5, y - w.h * 0.45]], c, k)
    this.ellipse(x, y - w.h * 0.62, w.w * 0.34, w.h * 0.2, c[0], c[1], c[2], k)
  }

  // The swing hanging from the tree: two ropes and a plank, swaying slowly and harder in the gusts.
  private drawSwing() {
    const H = this.H
    const s = this.swing
    const a = Math.sin(this.time * 0.75) * (0.16 + 0.2 * gust(s.x, this.time)) + 0.03
    const rope = this.paint([0.36, 0.3, 0.22])
    const r = this.thick(0.0008, 0.45)
    const parts: Part[] = []
    const ends: Point[] = []
    for (const o of [-0.016, 0.016]) {
      const ex = s.x + o + Math.sin(a) * s.len
      const ey = s.y + Math.cos(a) * s.len
      parts.push(cap((s.x + o) * H, s.y * H, ex * H, ey * H, r, r, rope))
      ends.push([ex * H, ey * H])
    }
    this.shape(parts, this.lighting, 0)
    this.shape([cap(ends[0][0] - 0.004 * H, ends[0][1], ends[1][0] + 0.004 * H, ends[1][1], this.thick(0.0025, 0.7), this.thick(0.0025, 0.7), this.paint([0.36, 0.26, 0.16]))], this.lighting, 0.5)
  }

  // Every jack-o'-lantern flickers, dimmed and guttering after an error; their light pools on the porch and steps.
  private drawPumpkins() {
    const look = this.look
    const dim = 1 - 0.6 * this.gloom * (0.6 + 0.4 * Math.sin(this.time * 7))
    const night = look.night ? 1 : look.style === "rim" ? 0.7 : 0.25
    for (const p of this.pumpkins) {
      const f = (firelight(this.time * 2.2, p.seed) + p.flare) * dim
      this.drawPumpkin(p, f, false)
      const r = p.r * (5 + 3 * p.flare)
      this.lights.pool(p.x, p.y - p.r, r, r * 0.7, [1, 0.45, 0.1], (1.6 + 2 * p.flare) * night * f, 0.012 * (night + p.flare) * f)
    }
  }

  private leaf(x: number, y: number): Leaf {
    return { x, y, fall: rand(0.008, 0.02), spin: rand(0, TAU), rate: rand(1, 2.5), color: LEAVES[Math.floor(Math.random() * LEAVES.length)] }
  }

  // Dead leaves tumble down and drift across on the gusts; spent ones come back from the tree or the left edge.
  private stepLeaves(dt: number) {
    for (const [i, l] of this.leaves.entries()) {
      const g = gust(l.x, this.time)
      l.x += (0.012 + 0.16 * g) * dt
      l.y += (l.fall + Math.sin(this.time * 0.9 + l.spin) * 0.01 - g * 0.01) * dt
      l.spin += l.rate * (1 + 2 * g) * dt
      if (l.x < this.A + 0.05 && l.y < 1.02) continue
      Object.assign(l, i % 2 ? this.leaf(0.13 * this.k + rand(-0.15, 0.2), rand(0.4, 0.62)) : this.leaf(-0.04, rand(0.05, 0.9)))
    }
  }

  private drawLeaves() {
    const H = this.H
    const r = this.thick(0.006, 1.1)
    const k = this.look.night ? 2.4 : this.look.style === "rim" ? 1.8 : 1
    for (const l of this.leaves) {
      const c = this.paint(l.color, k)
      this.shape([ell(l.x * H, l.y * H, r, Math.max(r * 0.55 * Math.abs(Math.cos(l.spin)) + 0.3, this.cells ? 0.7 : 0.4), l.spin * 0.6, c)], this.lighting, 0.3)
    }
  }

  // The raven perched on the warning sign: still for long spells, then turning its head to look the other way, its
  // eye glinting after dark.
  private drawRaven() {
    const { H, look } = this
    const x = this.raven.x * H
    const y = this.raven.y * H
    const s = 0.03 * H
    const turn = Math.sin(this.time * 0.25) > 0.3 ? -1 : 1
    const black = this.paint([0.04, 0.035, 0.05])
    this.shape([ell(x, y - s * 0.38, s * 0.3, s * 0.22, -0.4 * turn, black), cap(x - turn * s * 0.2, y - s * 0.3, x - turn * s * 0.55, y - s * 0.05, s * 0.1, s * 0.04, black), ell(x + turn * s * 0.2, y - s * 0.62, s * 0.14, s * 0.13, 0, black), cap(x - s * 0.04, y - s * 0.18, x - s * 0.05, y, s * 0.03, s * 0.025, black), cap(x + s * 0.06, y - s * 0.18, x + s * 0.07, y, s * 0.03, s * 0.025, black)], this.lighting, 0.4)
    this.polygon([[x + turn * s * 0.3, y - s * 0.66], [x + turn * s * 0.52, y - s * 0.6], [x + turn * s * 0.3, y - s * 0.57]], this.paint([0.12, 0.1, 0.08]))
    const eye: RGB = look.style === "front" ? [0.5, 0.35, 0.08] : [1.6, 0.9, 0.12]
    this.disc(x + turn * s * 0.25, y - s * 0.65, Math.max(s * 0.04, 0.5), eye[0], eye[1], eye[2], 1)
  }

  // Pairs of eyes in the dark woods: one opens now and then, blinks, stares a while and closes again.
  private drawEyes() {
    const H = this.H
    const look = this.look
    const k = look.style === "front" ? 0.45 : 1
    for (const e of this.eyes) {
      const t = (this.time + e.phase) % 40
      if (t > 14) continue
      const open = smoothstep(0, 1.5, t) * (1 - smoothstep(12.5, 14, t)) * (Math.abs(t - 6) < 0.15 ? 0.1 : 1)
      if (open < 0.05) continue
      const c: RGB = e.green ? [0.5, 1.5, 0.3] : [1.6, 1.0, 0.12]
      for (const sx of [-1, 1]) this.ellipse((e.x + sx * 0.006) * H, e.y * H, Math.max(0.003 * H, 0.7), Math.max(0.0022 * H * open, 0.4), c[0] * k, c[1] * k, c[2] * k, open)
    }
  }

  // Will-o'-wisps: pale glowing orbs bobbing and wandering low over the graves, swelling and fading.
  private drawWisps() {
    const H = this.H
    const c = this.look.ghost
    const k = this.look.style === "front" ? 0.6 : 1
    for (const w of this.wisps) {
      const t = this.creatureTime * 0.6 + w.phase
      const x = (w.x + Math.sin(t * 1.3) * 0.05 + Math.sin(t * 0.37) * 0.04) * H
      const y = (w.y + Math.sin(t * 2.1) * 0.012) * H
      const pulse = (0.55 + 0.45 * Math.sin(this.time * 1.4 + w.phase * 3)) * k
      lightPool(this.hdr, this.W, H, x, y, 0.045 * H, 0.03 * H, c, 0.8 * pulse, 0.05 * pulse)
      this.disc(x, y, Math.max(0.005 * H, 0.9), c[0] * 1.2 * pulse, c[1] * 1.2 * pulse, c[2] * 1.2 * pulse, 1)
    }
  }

  // A spider letting itself down on a thread from the porch's web and climbing back up.
  private drawSpider() {
    const H = this.H
    const x = this.spider.x * H
    const top = this.spider.y * H
    const drop = (0.5 - 0.5 * Math.cos(this.creatureTime * 1.5)) * 0.045 * this.S * H
    const silk = this.look.night ? this.paint([0.6, 0.62, 0.7], 3) : this.paint([0.62, 0.64, 0.6], 1.3)
    const w = this.thick(0.0005, 0.4)
    const y = top + drop
    this.shape([cap(x, top, x, y, w, w, silk)], this.lighting, 0)
    const body = this.paint([0.05, 0.04, 0.05])
    const s = 0.006 * this.S * H
    const legs: Part[] = []
    for (const side of [-1, 1]) for (let i = 0; i < 4; i++) legs.push(cap(x, y + s * 0.5, x + side * s * 1.6, y + s * (i * 0.6 - 0.3), Math.max(s * 0.12, 0.4), Math.max(s * 0.08, 0.3), body))
    this.shape([...legs, ell(x, y + s * 0.6, s * 0.7, s * 0.8, 0, body), ell(x, y, s * 0.45, s * 0.45, 0, body)], this.lighting, 0.3)
  }

  // Lively and teeming: now and then bats pour out of the turret's top window and scatter over the sky.
  private stepStream(dt: number) {
    this.stream = flyAway(this.stream, dt, this.A)
    if (this.activity === "calm") return
    this.streamWait -= dt
    if (this.streamWait > 0) return
    const n = this.activity === "teeming" ? 7 : 4
    this.streamWait = rand(25, 50)
    const w = this.windows.find((o) => o.seed === 22)
    if (!w) return
    for (let i = 0; i < n; i++) this.stream.push({ x: w.x / this.H + rand(-0.01, 0.01), y: w.y / this.H - i * 0.012, vx: rand(-0.16, 0.02) - i * 0.01, vy: -rand(0.06, 0.14), phase: rand(0, TAU) })
  }

  private stepGhosts(cdt: number) {
    for (const g of this.ghosts) {
      g.phase += cdt
      g.x += g.dir * 0.05 * cdt
      if (g.x > g.x1) g.dir = -1
      if (g.x < g.x0) g.dir = 1
    }
  }

  // A sheet of ghostly light: a round head, a body trailing into a wavy hem, hollow eyes and an O of a mouth; it fades
  // in and out as it haunts.
  private drawGhost(g: Ghost) {
    const { H, look } = this
    const fade = smoothstep(-0.2, 0.6, Math.sin(g.phase * 0.35))
    if (fade <= 0.01) return
    const x = g.x * H
    const y = (g.y + Math.sin(g.phase * 1.3) * 0.012) * H
    const s = 0.06 * H
    const c = look.ghost
    const lean = -g.dir * 0.25
    const pts: Point[] = []
    for (let i = 0; i <= 10; i++) {
      const ang = Math.PI + (i / 10) * Math.PI
      pts.push([x + Math.cos(ang) * s * 0.5, y - s * 0.5 + Math.sin(ang) * s * 0.5])
    }
    for (let i = 0; i <= 8; i++) {
      const t = i / 8
      pts.push([x + s * 0.5 - t * s + lean * s, y + s * (0.55 + 0.1 * Math.sin(t * TAU * 1.5 + g.phase * 6))])
    }
    if (look.night) lightPool(this.hdr, this.W, H, x, y, s * 1.6, s * 1.6, c, 0, 0.05 * fade)
    this.polygon(pts, c, (look.night ? 0.55 : 0.45) * fade)
    const e: RGB = look.night ? [0.01, 0.06, 0.06] : this.paint([0.05, 0.03, 0.08])
    for (const sx of [-1, 1]) this.ellipse(x + sx * s * 0.17, y - s * 0.5, Math.max(s * 0.07, 0.7), Math.max(s * 0.11, 0.9), e[0], e[1], e[2], fade * 0.9)
    this.ellipse(x, y - s * 0.22, Math.max(s * 0.07, 0.6), Math.max(s * 0.09, 0.7), e[0], e[1], e[2], fade * 0.8)
  }

  private drawBatAt(b: Bat) {
    const t = this.creatureTime * b.w * 2.4 + b.phase
    this.drawBat(b.ax + b.rx * Math.sin(t), b.ay + b.ry * Math.sin(2 * t + b.phase), b.size, this.time * 22 + b.phase * 5, Math.cos(t) >= 0 ? 1 : -1)
  }

  // A bat: a small furry body with ears and two scalloped wings beating.
  private drawBat(bx: number, by: number, size: number, phase: number, dir: number) {
    const H = this.H
    const x = bx * H
    const y = by * H
    const s = size * H
    const flap = Math.sin(phase)
    const color = this.paint([0.08, 0.05, 0.09])
    for (const side of [-1, 1]) {
      const w = (u: number, v: number): Point => [x + side * u * s, y + (v - flap * u * 0.7) * s]
      this.polygon([w(0.08, -0.1), w(0.5, -0.32), w(1, -0.22), w(0.82, 0.06), w(0.62, -0.02), w(0.42, 0.12), w(0.22, 0.04), w(0.08, 0.14)], color)
    }
    this.shape([ell(x, y, Math.max(s * 0.14, 0.8), Math.max(s * 0.2, 1), 0, color), ell(x + dir * s * 0.04, y - s * 0.2, Math.max(s * 0.1, 0.7), Math.max(s * 0.09, 0.7), 0, color)], this.lighting, 0.3)
    for (const side of [-1, 1]) this.polygon([[x + side * s * 0.02 + dir * s * 0.04, y - s * 0.24], [x + side * s * 0.1 + dir * s * 0.04, y - s * 0.24], [x + side * s * 0.08 + dir * s * 0.04, y - s * 0.38]], color)
  }

  // Lively and teeming: now and then a ghoul peeks out from behind a gravestone toward the sides, then sinks back.
  private stepGhoul(dt: number) {
    const g = this.ghoul
    if (g.t >= 0) {
      g.t += dt
      if (g.t > g.dur) g.t = -1
      return
    }
    if (this.activity === "calm" || !this.stones.length) return
    g.wait -= dt
    if (g.wait > 0) return
    g.wait = rand(14, 30)
    const sides = this.stones.map((s, i) => [s, i] as const).filter(([s]) => Math.abs(s.x - this.hx) > 0.2 * this.S && s.s > 0.03)
    if (!sides.length) return
    Object.assign(g, { stone: sides[Math.floor(Math.random() * sides.length)][1], t: 0, dur: 9 })
  }

  // The ghoul: a gaunt head with glowing eyes rising behind its stone, bony fingers curled over the top. The stone is
  // drawn again over it.
  private drawGhoul() {
    const g = this.ghoul
    const s = this.stones[g.stone]
    if (!s) return
    const { H, look } = this
    const up = smoothstep(0, 1.2, g.t) * (1 - smoothstep(g.dur - 1.2, g.dur, g.t))
    const x = (s.x + s.s * 0.3) * H
    const top = (s.y - s.s * 1.95) * H
    const size = s.s * H
    const y = top + size * (0.9 - 1.3 * up)
    const skin = look.night ? ([0.12, 0.3, 0.2] as RGB) : this.paint([0.55, 0.62, 0.5])
    const turn = Math.sin(g.t * 1.3) * 0.25
    this.shape([ell(x + turn * size * 0.3, y, size * 0.48, size * 0.56, 0, skin), ell(x + turn * size * 0.3, y + size * 0.42, size * 0.26, size * 0.22, 0, skin)], this.lighting, 0.6)
    const eye: RGB = look.style === "front" ? [0.6, 0.75, 0.1] : [1.3, 1.1, 0.15]
    for (const e of [-1, 1]) this.disc(x + turn * size * 0.45 + e * size * 0.18, y - size * 0.04, Math.max(size * 0.09, 0.6), eye[0] * up, eye[1] * up, eye[2] * up, 1)
    this.drawStone(s)
    // Fingers over the stone's top, once it has risen.
    if (up < 0.5) return
    const fx = s.x * H + s.tilt * 0.3 * s.s * 1.9 * H
    const fingers: Part[] = []
    for (let i = 0; i < 3; i++) fingers.push(cap(fx - size * 0.2 + i * size * 0.16, top - size * 0.02, fx - size * 0.18 + i * size * 0.16, top + size * 0.18, Math.max(size * 0.05, 0.5), Math.max(size * 0.04, 0.45), skin))
    this.shape(fingers, this.lighting, 0.4)
  }

  // Teeming: now and then a hand claws its way up out of the restless grave, grasps at the air, and sinks back.
  private stepHand(dt: number) {
    const h = this.hand
    if (h.t >= 0) {
      h.t += dt
      if (h.t > 12) h.t = -1
      return
    }
    if (this.activity !== "teeming") return
    h.wait -= dt
    if (h.wait > 0) return
    h.wait = rand(20, 40)
    h.t = 0
  }

  // A rotting hand and forearm up out of the earth at (x, y), its fingers clawing, over time t.
  private drawHand(gx: number, gy: number, t: number) {
    const { H, look } = this
    const up = smoothstep(0, 2.5, t) * (1 - smoothstep(10, 12, t))
    if (up <= 0.01) return
    const skin = look.night ? ([0.14, 0.32, 0.18] as RGB) : this.paint(look.zombie)
    const x = gx * H
    const y = gy * H
    const reach = 0.07 * up * H
    const wave = Math.sin(t * 2.2) * 0.2
    const wx = x + Math.sin(wave) * reach * 0.3
    const wy = y - reach
    const claw = 0.5 + 0.5 * Math.sin(t * 3.1)
    const s = 0.017 * H
    const parts: Part[] = [cap(x, y, wx, wy, s * 0.55, s * 0.5, skin), ell(wx, wy - s * 0.4, s * 0.5, s * 0.55, wave, skin)]
    for (let i = 0; i < 4; i++) {
      const a = -Math.PI / 2 + (i - 1.5) * 0.4 + wave
      const bend = claw * 0.9 * (i - 1.5 > 0 ? 1 : -1) * 0.5
      const mx = wx + Math.cos(a) * s * 0.9
      const my = wy - s * 0.5 + Math.sin(a) * s * 0.9
      parts.push(cap(wx + Math.cos(a) * s * 0.3, wy - s * 0.6 + Math.sin(a) * s * 0.3, mx, my, s * 0.16, s * 0.13, skin), cap(mx, my, mx + Math.cos(a + bend) * s * 0.6, my + Math.sin(a + bend) * s * 0.6, s * 0.13, s * 0.1, skin))
    }
    parts.push(cap(wx - s * 0.4, wy - s * 0.2, wx - s * 1, wy - s * 0.6 + claw * s * 0.3, s * 0.16, s * 0.1, skin))
    this.shape(parts, this.lighting, 0.5)
    const mound = this.paint(look.dirt, 0.9)
    this.ellipse(x, y + 0.003 * H, 0.022 * H, 0.007 * H, mound[0] * 1.1, mound[1] * 1.1, mound[2] * 1.1, 1)
  }

  // Teeming: the zombie shuffles back and forth across the graveyard, turning round at the edges.
  private stepZombie(cdt: number) {
    if (this.activity !== "teeming") return
    const z = this.zombie
    // A lurch: it steps, drags, and steps again.
    const lurch = 0.4 + 0.9 * Math.max(0, Math.sin(z.phase * TAU))
    const d = 0.1 * lurch * cdt
    z.x += z.dir * d
    z.phase += d / ZOMBIE_STRIDE
    if (z.x > this.A - 0.15 * this.k) z.dir = -1
    if (z.x < 0.12 * this.k) z.dir = 1
  }

  // A zombie standing at (x, y) in screen heights, facing dir: stiff legs, one dragging, a hunched torso in rags, both
  // arms held straight out and the head lolling. dance, 0 to 1, swaps the shuffle for arms waving overhead and a sway.
  private drawZombie(zx: number, zy: number, dir: number, phase: number, dance: number, rise: number) {
    const { H, look } = this
    const S = ZOMBIE * H * (0.85 + 0.3 * smoothstep(WALK0, 0.98, zy))
    const x = zx * H
    const y = zy * H
    const d = dir
    const [rl, ll] = stride(phase, 0, 0.7)
    const [rr] = stride(phase, 0.5, 0.7)
    const skin = look.night ? ([0.14, 0.34, 0.2] as RGB) : this.paint(look.zombie)
    const rags = this.paint([0.24, 0.2, 0.26])
    const pants = this.paint([0.2, 0.22, 0.3])
    const sway = Math.sin(this.time * 4) * dance
    const sink = (1 - rise) * S
    const bob = Math.abs(Math.sin(phase * Math.PI)) * 0.025 * S * (1 - dance)
    const hip: Point = [x + sway * 0.08 * S, y - S * 0.42 - bob + sink]
    // One leg steps, the other drags its foot along.
    const footA: Point = [x + d * rl * 0.12 * S, y - ll * 0.04 * S + sink]
    const footB: Point = [x + d * rr * 0.06 * S - d * 0.03 * S, y + sink]
    if (dance > 0) {
      footA[0] = x - 0.06 * S + sway * 0.05 * S
      footB[0] = x + 0.06 * S + sway * 0.05 * S
    }
    this.shape([cap(...hip, ...footA, 0.055 * S, 0.045 * S, pants), cap(...hip, ...footB, 0.055 * S, 0.045 * S, pants)], this.lighting, 0.6)
    const neck: Point = [hip[0] + d * 0.08 * S * (1 - dance), hip[1] - S * 0.34]
    this.shape([cap(...hip, ...neck, 0.11 * S, 0.12 * S, rags), ell(hip[0], hip[1] - 0.02 * S, 0.11 * S, 0.06 * S, 0, rags)], this.lighting, 0.7)
    // Ragged hem.
    for (let i = 0; i < 3; i++) this.polygon([[hip[0] - 0.1 * S + i * 0.07 * S, hip[1]], [hip[0] - 0.04 * S + i * 0.07 * S, hip[1]], [hip[0] - 0.07 * S + i * 0.07 * S, hip[1] + 0.06 * S]], rags)
    // Arms straight out in front, lurching; dancing, they wave overhead.
    const shoulder: Point = [neck[0], neck[1] + 0.05 * S]
    const arms: Part[] = []
    for (const [i, o] of [-0.02, 0.03].entries()) {
      const lurch = Math.sin(phase * TAU + i) * 0.03 * S
      const out: Point = [shoulder[0] + d * 0.3 * S, shoulder[1] + o * S + lurch]
      const wave = Math.sin(this.time * 4 + i * Math.PI)
      const upArm: Point = [shoulder[0] + (i ? 1 : -1) * 0.15 * S + wave * 0.06 * S, shoulder[1] - 0.28 * S]
      const hand: Point = [lerp(out[0], upArm[0], dance), lerp(out[1], upArm[1], dance)]
      arms.push(cap(...shoulder, ...hand, 0.04 * S, 0.034 * S, i ? skin : rags), ell(...hand, 0.04 * S, 0.035 * S, 0, skin))
    }
    this.shape(arms, this.lighting, 0.6)
    const tilt = d * 0.25 + Math.sin(this.time * 1.3) * 0.1
    const head: Point = [neck[0] + d * 0.05 * S + Math.sin(tilt) * 0.05 * S, neck[1] - 0.1 * S]
    this.shape([ell(...head, 0.09 * S, 0.1 * S, tilt, skin)], this.lighting, 0.7)
    this.shape([ell(head[0] - d * 0.02 * S, head[1] - 0.06 * S, 0.08 * S, 0.04 * S, tilt, this.paint([0.12, 0.1, 0.1]))], this.lighting, 0.3)
    const eye: RGB = look.style === "front" ? [0.15, 0.12, 0.1] : [1.2, 0.9, 0.15]
    this.disc(head[0] + d * 0.04 * S, head[1] - 0.005 * S, Math.max(0.018 * S, 0.5), eye[0], eye[1], eye[2], 1)
  }

  // A skeleton's pose in pixels. Shoulders sit at the chest and hips at the pelvis; jaw is how far it hangs open.
  private drawSkeleton(p: Bones, S: number, ground = Infinity) {
    const look = this.look
    const bone = look.bone
    const dark: RGB = look.night ? [0.01, 0.03, 0.03] : this.paint([0.04, 0.03, 0.03])
    const r = Math.max(0.026 * S, this.cells ? 0.6 * this.px : 0.35 * this.px)
    const knob = r * 1.5
    const parts: Part[] = []
    // Buried below ground, only what is above shows: legs are left out and the spine starts at the surface.
    const buried = ground < Infinity
    const hip: Point = [p.hip[0], Math.min(p.hip[1], ground)]
    const above = (q: Point) => q[1] < ground
    if (!buried) {
      for (const [h, k, f] of [
        [p.hip, p.knL, p.ftL],
        [p.hip, p.knR, p.ftR],
      ] as const)
        parts.push(cap(...h, ...k, r * 1.1, r, bone), cap(...k, ...f, r, r * 0.9, bone), ell(...k, knob, knob, 0, bone), ell(f[0] + (f[0] - k[0]) * 0.15, f[1], r * 2.4, r * 1.1, 0, bone))
      parts.push(ell(...p.hip, 0.07 * S, 0.04 * S, 0, bone))
    }
    if (above(p.chest)) {
      const mid: Point = [lerp(hip[0], p.chest[0], 0.62), lerp(hip[1], p.chest[1], 0.62)]
      parts.push(cap(...hip, ...p.chest, r * 1.2, r * 1.2, bone))
      if (above(mid)) parts.push(ell(...mid, 0.075 * S, 0.1 * S, Math.atan2(p.chest[0] - hip[0], hip[1] - p.chest[1]), bone))
    }
    for (const [e, h] of [
      [p.elL, p.haL],
      [p.elR, p.haR],
    ] as const) {
      if (!above(p.chest) && !above(h)) continue
      parts.push(cap(...p.chest, ...e, r, r, bone), cap(...e, ...h, r, r * 0.9, bone), ell(...e, knob, knob, 0, bone), ell(...h, r * 1.8, r * 1.8, 0, bone))
    }
    if (parts.length) this.shape(parts, this.lighting, 0.35)
    // Gaps between the ribs, where the skeleton is big enough to show them.
    if (above(p.chest) && S > (this.cells ? 30 : 16) * this.px) {
      const mid: Point = [lerp(hip[0], p.chest[0], 0.62), lerp(hip[1], p.chest[1], 0.62)]
      for (const dy of [-0.035, 0.02]) if (mid[1] + dy * S < ground) this.ellipse(mid[0], mid[1] + dy * S, 0.055 * S, Math.max(0.008 * S, 0.4), dark[0], dark[1], dark[2], 0.8)
    }
    if (!above([p.head[0], p.head[1] - 0.05 * S])) return
    // The skull: a round cranium, a jaw that drops open, dark sockets and a nose hole.
    const [hx, hy] = p.head
    const d = p.dir
    this.shape([ell(hx, hy, 0.072 * S, 0.075 * S, p.tilt, bone), ell(hx + d * 0.03 * S, hy + (0.06 + p.jaw * 0.04) * S, 0.042 * S, 0.026 * S, p.tilt, bone)], this.lighting, 0.4)
    const so = Math.max(0.018 * S, 0.5 * this.px)
    for (const e of [-1, 1]) this.disc(hx + d * 0.025 * S + e * 0.028 * S, hy - 0.005 * S, so, dark[0], dark[1], dark[2], 1)
    this.disc(hx + d * 0.04 * S, hy + 0.03 * S, so * 0.6, dark[0], dark[1], dark[2], 1)
    if (!p.glow) return
    const g = look.ghost
    for (const e of [-1, 1]) this.disc(hx + d * 0.025 * S + e * 0.028 * S, hy - 0.005 * S, so * 0.5, g[0] * 1.2, g[1] * 1.2, g[2] * 1.2, 1)
  }

  // A skeleton walking with a loose, bouncy rattle at (x, y), facing dir, step phase; dance swaps it for a jig with
  // arms waving overhead.
  private walkPose(x: number, y: number, S: number, dir: number, phase: number, dance: number, glow: boolean): Bones {
    const [ra, la] = stride(phase, 0, 0.5)
    const [rb, lb] = stride(phase, 0.5, 0.5)
    const bounce = Math.abs(Math.sin(phase * TAU)) * 0.06 * S
    const jig = Math.sin(this.time * 4) * dance
    const hip: Point = [x + jig * 0.05 * S, y - 0.5 * S - bounce * (1 - dance) + Math.abs(jig) * 0.04 * S]
    const chest: Point = [hip[0] + dir * 0.035 * S * (1 - dance), hip[1] - 0.27 * S]
    const head: Point = [chest[0] + dir * 0.03 * S + jig * 0.03 * S, chest[1] - 0.15 * S + Math.sin(phase * TAU * 2) * 0.01 * S]
    const leg = (reach: number, lift: number, kick: number): [Point, Point] => {
      const foot: Point = [x + lerp(dir * reach * 0.14 * S, kick * 0.12 * S, dance), y - lerp(lift * 0.08 * S, Math.max(0, kick) * 0.1 * S, dance)]
      return [joint(hip[0], hip[1], foot[0], foot[1], 0.27 * S, 0.27 * S, -dir), foot]
    }
    const [knL, ftL] = leg(ra, la, -0.6 - jig * 0.4)
    const [knR, ftR] = leg(rb, lb, 0.6 + jig * 0.4)
    const arm = (swing: number, side: number): [Point, Point] => {
      const down: Point = [chest[0] + Math.sin(swing) * 0.26 * S, chest[1] + Math.cos(swing) * 0.26 * S]
      const up: Point = [chest[0] + side * (0.16 + 0.05 * jig) * S, chest[1] - 0.24 * S]
      const hand: Point = [lerp(down[0], up[0], dance), lerp(down[1], up[1], dance)]
      return [joint(chest[0], chest[1], hand[0], hand[1], 0.14 * S, 0.14 * S, dir * (dance > 0.5 ? -side : 1)), hand]
    }
    const [elL, haL] = arm(dir * (rb - 0.2) * 0.5, -1)
    const [elR, haR] = arm(dir * (ra - 0.2) * 0.5, 1)
    return { head, chest, hip, elL, haL, elR, haR, knL, ftL, knR, ftR, tilt: dir * 0.1 + jig * 0.15, jaw: 0.5 + 0.5 * Math.sin(this.time * 9), dir, glow }
  }

  // Slumped on the ground against a gravestone, legs out, head lolling forward.
  private slumpPose(x: number, y: number, S: number, dir: number): Bones {
    const hip: Point = [x, y - 0.04 * S]
    const chest: Point = [x - dir * 0.1 * S, y - 0.31 * S]
    const knL: Point = [x + dir * 0.2 * S, y - 0.14 * S]
    const knR: Point = [x + dir * 0.25 * S, y - 0.06 * S]
    return { head: [chest[0] + dir * 0.07 * S, chest[1] - 0.1 * S], chest, hip, elL: [x + dir * 0.02 * S, y - 0.2 * S], haL: knL, elR: [chest[0] + dir * 0.03 * S, y - 0.13 * S], haR: [x + dir * 0.12 * S, y], knL, ftL: [x + dir * 0.38 * S, y], knR, ftR: [x + dir * 0.5 * S, y], tilt: dir * 0.5, jaw: 1, dir, glow: false }
  }

  // Sitting on a branch at (x, y), legs dangling and swinging, hands gripping the bark beside it.
  private sitPose(x: number, y: number, S: number, dir: number): Bones {
    const hip: Point = [x, y - 0.03 * S]
    const chest: Point = [x + dir * 0.02 * S, hip[1] - 0.27 * S]
    const swing = (o: number) => Math.sin(this.time * 1.4 + o) * 0.35
    const knL: Point = [x + dir * 0.16 * S, y]
    const knR: Point = [x + dir * 0.13 * S, y + 0.02 * S]
    const foot = (k: Point, o: number): Point => [k[0] + Math.sin(swing(o)) * 0.25 * S, k[1] + Math.cos(swing(o)) * 0.25 * S]
    const tilt = Math.sin(this.time * 0.5) * 0.25
    return { head: [chest[0] + Math.sin(tilt) * 0.12 * S, chest[1] - 0.14 * S], chest, hip, elL: [x - 0.08 * S, y - 0.15 * S], haL: [x - 0.1 * S, y], elR: [x + dir * 0.1 * S, y - 0.15 * S], haR: [x + dir * 0.06 * S, y], knL, ftL: foot(knL, 0), knR, ftR: foot(knR, 1.9), tilt, jaw: 0.3 + 0.3 * Math.sin(this.time * 0.7), dir, glow: this.look.night }
  }

  // Lively and up: a skeleton standing in the open grave, rising to peer over its lip with its hands on the rim, then
  // sinking back; the earth at the front of the grave covers what is below.
  private drawPeeker() {
    const { H, look } = this
    const { x, y } = this.open
    const t = this.time % 30
    const up = smoothstep(2, 5, t) * (1 - smoothstep(20, 23, t))
    if (up <= 0.01) return
    const S = 0.13 * H
    const lip = (y + 0.018) * H
    const gx = x * H
    const look2 = Math.sin(this.time * 0.6) * 0.04 * S
    const head: Point = [gx + look2, lip - (0.03 + 0.12 * up) * S]
    const chest: Point = [gx, head[1] + 0.15 * S]
    const p: Bones = { head, chest, hip: [gx, chest[1] + 0.27 * S], elL: [gx - 0.16 * S, lip - 0.02 * S], haL: [gx - 0.22 * S, lip - 0.01 * S], elR: [gx + 0.16 * S, lip - 0.02 * S], haR: [gx + 0.2 * S, lip - 0.005 * S], knL: [gx, lip], ftL: [gx, lip], knR: [gx, lip], ftR: [gx, lip], tilt: Math.sin(this.time * 0.6) * 0.2, jaw: 0.5 + 0.5 * Math.sin(this.time * 7), dir: 1, glow: look.night }
    this.drawSkeleton(p, S, lip)
    const mound = this.paint(look.dirt, 0.8)
    this.polygon([[(x - 0.075) * H, lip - 0.002 * H], [(x + 0.07) * H, lip - 0.002 * H], [(x + 0.07) * H, lip + 0.006 * H], [(x - 0.075) * H, lip + 0.006 * H]], [mound[0] * 1.2, mound[1] * 1.2, mound[2] * 1.2])
  }

  // A skeleton rising out of the ground at (x, y), sink from 1 (buried) to 0, reaching up as it climbs, with a heap
  // of earth breaking around it.
  private drawRising(x: number, y: number, S: number, dir: number, phase: number, sink: number, dance: number) {
    const H = this.H
    const p = this.walkPose(x * H, y * H, S, dir, phase, dance, this.look.night)
    if (sink <= 0.01) return this.drawSkeleton(p, S)
    const dy = sink * 0.75 * S
    const move = (q: Point): Point => [q[0], q[1] + dy]
    const reach = smoothstep(0.1, 0.6, sink)
    const raised = { ...p, head: move(p.head), chest: move(p.chest), hip: move(p.hip), elL: move(p.elL), elR: move(p.elR) }
    raised.haL = [lerp(move(p.haL)[0], raised.chest[0] - 0.12 * S, reach), lerp(move(p.haL)[1], raised.chest[1] - 0.3 * S, reach)]
    raised.haR = [lerp(move(p.haR)[0], raised.chest[0] + 0.14 * S, reach), lerp(move(p.haR)[1], raised.chest[1] - 0.26 * S, reach)]
    this.drawSkeleton(raised, S, y * H - 0.002 * H)
    const mound = this.paint(this.look.dirt, 1.1)
    this.ellipse(x * H, y * H, 0.2 * S, 0.035 * S, mound[0], mound[1], mound[2], 1)
  }

  // Teeming: skeletons climb out of the graves, rattle about the graveyard for a while, and sink back into the earth.
  private stepWalkers(dt: number, cdt: number) {
    for (const w of this.walkers) {
      w.t -= dt
      if (w.mode === 1) {
        const d = 0.11 * cdt
        w.x += w.dir * d
        w.phase += d / 0.045
        if (w.x > this.A - 0.1 * this.k) w.dir = -1
        if (w.x < 0.1 * this.k) w.dir = 1
      }
      if (w.t > 0) continue
      w.mode = (w.mode + 1) % 4
      w.t = [3, rand(25, 45), 3, rand(8, 20)][w.mode]
      if (w.mode !== 0) continue
      ;[w.x, w.y] = this.openSpot(0.12 * this.k, this.A - 0.12 * this.k, WALK0, WALK1 + 0.02)
      w.dir = w.x < this.A / 2 ? 1 : -1
    }
  }

  private drawWalkers() {
    const H = this.H
    for (const w of this.walkers) {
      if (w.mode === 3) continue
      const sink = w.mode === 0 ? clamp(w.t / 3, 0, 1) : w.mode === 2 ? 1 - clamp(w.t / 3, 0, 1) : 0
      this.drawRising(w.x, w.y, 0.13 * H * (0.85 + 0.3 * smoothstep(WALK0, 0.98, w.y)), w.dir, w.phase, sink, 0)
    }
  }

  // The skeleton dog: trotting from spot to spot along the front of the graveyard, then sitting a while wagging its
  // bony tail.
  private stepDog(cdt: number) {
    const g = this.dog
    if (this.activity === "calm") return
    const d = g.target - g.x
    if (g.wait > 0 || Math.abs(d) < 0.005) {
      g.wait -= cdt
      stepGait(g.gait, 0, cdt, g.dir)
      if (g.wait > 0) return
      g.target = clamp(g.x + rand(0.25, 0.6) * (Math.random() < 0.5 ? -1 : 1), 0.1 * this.k, this.A - 0.1 * this.k)
      g.wait = 0
      return
    }
    g.dir = Math.sign(d)
    const step = Math.min(Math.abs(d), 0.13 * cdt)
    g.x += g.dir * step
    stepGait(g.gait, step / 0.04, cdt, g.dir)
    if (Math.abs(g.target - g.x) < 0.005) g.wait = rand(1.2, 3)
  }

  private drawDog() {
    const { H, look } = this
    const g = this.dog
    const S = 0.085 * H
    const P = body(g.x * H, 0.985 * H, S, g.gait.turn)
    const bone = look.bone
    const r = Math.max(0.035, (this.cells ? 0.6 : 0.35) / S)
    const sit = 1 - g.gait.go
    const legs = { fore: 0.24, hind: 0.24, top: 0.42, w: 0.06, a: 0.21, b: 0.21, reach: 0.14, lift: 0.08, r: [r * 1.2, r, r] as [number, number, number], color: bone }
    const wag = Math.sin(this.time * (8 + 6 * sit)) * 0.25
    const spine = (t: number): Point => P(lerp(-0.26, 0.26, t), -0.46 + 0.04 * Math.sin(t * Math.PI) + sit * 0.12 * (1 - t))
    const parts: Part[] = [...quadruped(P, g.gait, true, legs), ...quadruped(P, g.gait, false, legs), ...chain(spine, 4, r * S * 1.3, r * S * 1.2, bone)]
    for (let i = 0; i < 4; i++) {
      const [x, y] = spine(0.45 + i * 0.13)
      parts.push(cap(x, y, x - P.along * 0.01 * S, y + (0.15 - i * 0.02) * S, r * S, r * S * 0.8, bone))
    }
    parts.push(ell(...P(-0.26, -0.42 + sit * 0.1), 0.06 * S, 0.05 * S, 0, bone))
    const neck: Point = P(0.4, -0.66)
    parts.push(cap(...spine(1), ...neck, r * S * 1.2, r * S, bone), ell(...P(0.48, -0.64), Math.max(P.len(0.1, 0.05), 0.05 * S), 0.055 * S, 0, bone), cap(...P(0.5, -0.62), ...P(0.62, -0.6), 0.03 * S, 0.025 * S, bone))
    parts.push(...chain((t) => P(-0.28 - 0.18 * t, -0.48 - 0.2 * t + wag * t * t), 4, r * S, r * S * 0.7, bone))
    this.shape(parts, this.lighting, 0.35)
    const dark: RGB = look.night ? [0.01, 0.03, 0.03] : this.paint([0.04, 0.03, 0.03])
    this.disc(...P(0.5, -0.66), Math.max(0.018 * S, 0.5 * this.px), dark[0], dark[1], dark[2], 1)
  }

  // A skull a click pops up out of the earth: it rises, chatters and sinks back.
  private drawPops() {
    const { H, look } = this
    for (const p of this.pops) {
      const up = smoothstep(0, 0.8, p.t) * (1 - smoothstep(3.5, 4.5, p.t))
      if (up <= 0.01) continue
      const S = 0.16 * H
      const ground = p.y * H
      const head: Point = [p.x * H, ground - (0.02 + 0.09 * up) * S]
      const q: Bones = { head, chest: [head[0], ground + S], hip: [head[0], ground + S], elL: head, haL: [head[0], ground + S], elR: head, haR: [head[0], ground + S], knL: head, ftL: head, knR: head, ftR: head, tilt: Math.sin(p.t * 5) * 0.2, jaw: 0.5 + 0.5 * Math.sin(p.t * 14), dir: p.x < this.A / 2 ? 1 : -1, glow: look.night }
      this.drawSkeleton(q, S, ground)
      const mound = this.paint(look.dirt, 1.1)
      this.ellipse(p.x * H, ground, 0.06 * S * 1.6, 0.02 * S * 1.6, mound[0], mound[1], mound[2], 1)
    }
  }

  private stepLightning(dt: number) {
    const f = this.flash
    if (f.t >= 0) {
      f.t += dt
      if (f.t > 0.8) f.t = -1
      return
    }
    if (this.gloom < 0.5) return
    f.wait -= dt
    if (f.wait > 0) return
    f.wait = rand(5, 12)
    f.t = 0
    f.x = Math.random() < 0.5 ? rand(0.05, 0.35) * this.A : rand(0.65, 0.95) * this.A
  }

  // Lightning in the storm: the sky flickers twice and a forked bolt cracks down toward the ridge.
  private drawLightning() {
    const { H, A } = this
    const f = this.flash
    const k = Math.exp(-(((f.t - 0.08) / 0.05) ** 2)) + 0.7 * Math.exp(-(((f.t - 0.35) / 0.08) ** 2))
    if (k < 0.03) return
    lightPool(this.hdr, this.W, H, f.x * H, 0.15 * H, 0.6 * H, 0.35 * H, BOLT, 1.5 * k, 0.05 * k)
    const pts: Point[] = [[f.x * H, 0]]
    for (let i = 1; i <= 7; i++) pts.push([(f.x + (hash(i * 3.7 + f.wait) - 0.5) * 0.05 * i * 0.4) * H, ((HORIZON - 0.04) * i / 7) * H])
    const r = this.thick(0.0015, 0.6)
    const parts: Part[] = []
    for (let i = 0; i + 1 < pts.length; i++) parts.push(cap(...pts[i], ...pts[i + 1], r, r, [BOLT[0] * 1.5 * k, BOLT[1] * 1.5 * k, BOLT[2] * 1.5 * k]))
    const fork = pts[3]
    parts.push(cap(...fork, fork[0] + (f.x < A / 2 ? 0.04 : -0.04) * H, fork[1] + 0.08 * H, r * 0.8, r * 0.6, [BOLT[0] * 1.5 * k, BOLT[1] * 1.5 * k, BOLT[2] * 1.5 * k]))
    this.shape(parts, this.lighting, 0)
  }

  private startWitch() {
    const w = this.witch
    w.t = 0
    w.dir = Math.random() < 0.5 ? 1 : -1
    w.y = this.orb.y
  }

  private stepWitch(dt: number, cdt: number) {
    const w = this.witch
    if (w.t < 0) {
      if (this.activity !== "teeming") return
      w.wait -= dt
      if (w.wait > 0) return
      w.wait = rand(...WITCH_GAP)
      this.startWitch()
      return
    }
    w.t += cdt * 0.32
    if (w.t > 1) w.t = -1
  }

  // The witch's place on her crossing: from one edge to the other, swooping through the moon's disc.
  private witchAt(t: number): Point {
    const w = this.witch
    const A = this.A
    const mx = this.orb.x * A
    const x = w.dir > 0 ? lerp(-0.15, A + 0.15, t) : lerp(A + 0.15, -0.15, t)
    const reach = Math.max(mx + 0.15, A - mx + 0.15)
    return [x, w.y + 0.06 * ((x - mx) / reach) * w.dir - 0.05 * Math.exp(-(((x - mx) / 0.25) ** 2)) + 0.05 + Math.sin(t * 9) * 0.006]
  }

  // A witch riding side-on: a broomstick with its bristles, a cape billowing behind, a pointed hat, her chin up in a
  // cackle.
  private drawWitch() {
    const H = this.H
    const [wx, wy] = this.witchAt(this.witch.t)
    const x = wx * H
    const y = wy * H
    const s = 0.075 * H
    const d = this.witch.dir
    const dark = this.paint([0.09, 0.06, 0.1])
    const flap = Math.sin(this.time * 7) * 0.12
    this.polygon([[x - d * s * 0.95, y + s * 0.1], [x - d * s * 1.55, y - s * 0.12], [x - d * s * 1.7, y + s * 0.2], [x - d * s * 1.5, y + s * 0.42]], this.paint([0.55, 0.4, 0.18]))
    this.shape([cap(x - d * s * 1.05, y + s * 0.12, x + d * s * 1.05, y - s * 0.06, Math.max(s * 0.05, 0.6), Math.max(s * 0.04, 0.6), this.paint([0.3, 0.2, 0.1]))], this.lighting, 0.5)
    this.polygon([[x - d * s * 0.05, y - s * 0.55], [x - d * s * 1.05, y - s * (0.2 + flap)], [x - d * s * 0.85, y + s * (0.05 - flap)], [x - d * s * 0.2, y + s * 0.02]], dark)
    const cackle = Math.max(0, Math.sin(this.time * 10)) * 0.25
    this.shape([ell(x, y - s * 0.22, s * 0.2, s * 0.3, d * 0.3, dark), ell(x + d * s * 0.14, y - s * 0.62, s * 0.12, s * 0.12, 0, dark), cap(x + d * s * 0.2, y - s * 0.6, x + d * s * (0.36 + cackle * 0.2), y - s * (0.6 + cackle), s * 0.04, s * 0.02, dark), cap(x + d * s * 0.08, y - s * 0.42, x + d * s * 0.55, y - s * 0.02, s * 0.06, s * 0.05, dark), cap(x + d * s * 0.05, y - s * 0.05, x + d * s * 0.35, y + s * 0.32, s * 0.07, s * 0.05, dark)], this.lighting, 0.5)
    this.ellipse(x + d * s * 0.14, y - s * 0.7, s * 0.3, Math.max(s * 0.05, 0.7), dark[0], dark[1], dark[2], 1)
    this.polygon([[x, y - s * 0.72], [x + d * s * 0.3, y - s * 0.72], [x - d * s * 0.3, y - s * 1.25]], dark)
  }

  private stepDance(dt: number) {
    const e = this.dance
    if (e.t < 0) {
      e.wait -= dt
      if (e.wait > 0) return
      e.t = 0
      return
    }
    e.t += dt
    if (e.t < DANCE) return
    e.t = -1
    e.wait = eggWait(true) * TIME_SCALE
  }

  // The egg: three zombies claw up out of the ground in the graveyard's front, dance in step, and sink back down.
  private drawDance() {
    const t = this.dance.t
    const rise = smoothstep(0, 4, t) * (1 - smoothstep(DANCE - 4, DANCE, t))
    const dance = smoothstep(4, 6, t) * (1 - smoothstep(DANCE - 6, DANCE - 4, t))
    const S = this.S
    for (const [i, x] of [this.hx - 0.2 * S, this.hx, this.hx + 0.2 * S].entries()) {
      const step = Math.sin(this.time * 2 + i * 0.3) * 0.02 * dance
      this.drawZombie(x + step, 0.97, i === 1 ? -1 : 1, this.time * 2, dance, rise)
    }
    for (const [i, x] of [this.hx - 0.38 * S, this.hx + 0.38 * S].entries()) this.drawRising(x, 0.975, 0.14 * this.H, i ? -1 : 1, this.time * 2, 1 - rise, dance)
  }

  // Restores the house, tree and graveyard over clouds and storm drawn in front of them, within the box.
  private unsky(x0: number, y0: number, x1: number, y1: number) {
    restoreFore(this.hdr, this.background, this.fore, this.W, x0, y0, x1, Math.min(this.H - 1, y1))
  }

  // A thick straight line from a to b (pixels), radius in screen heights.
  private edge(a: Point, b: Point, radius: number, color: RGB) {
    const r = this.thick(radius, 0.5)
    this.shape([cap(a[0], a[1], b[0], b[1], r, r, color)], this.lighting, 0)
  }

  // A thin line of rim light along an outline (pixels), on the edges facing the sun or moon.
  private rimEdges(pts: Point[]) {
    const r = this.thick(0.0022, 0.75)
    const lx = this.orb.x * this.W
    const k = this.look.night ? 0.35 : 0.4
    const c: RGB = [this.look.light[0] * k, this.look.light[1] * k, this.look.light[2] * k]
    const parts: Part[] = []
    for (let i = 0; i + 1 < pts.length; i++) {
      const [ax, ay] = pts[i]
      const [bx, by] = pts[i + 1]
      const facing = clamp((((lx - (ax + bx) / 2) / this.H) * 2), -1, 1)
      if (facing <= 0.05 && Math.abs(ay - by) > Math.abs(ax - bx)) continue
      parts.push(cap(ax, ay, bx, by, r, r, c))
    }
    if (parts.length) this.shape(parts, this.lighting, 0)
  }
}

// A band of ground fog, rows high from y0, tiled seamlessly across the width: thickest low over the graveyard.
function makeFog(W: number, H: number, y0: number, rows: number) {
  const tex = new Float32Array(W * rows)
  for (let j = 0; j < rows; j++) {
    const v = (y0 + j + 0.5) / H
    const band = smoothstep(0.6, 0.74, v) * (1 - smoothstep(0.9, 0.99, v))
    for (let x = 0; x < W; x++) {
      const n = (sx: number) => fbm2((sx / H) * 2.2, v * 16, 3)
      // Blending with the same noise one width over makes the pattern repeat without a seam.
      const t = x / W
      tex[j * W + x] = band * (n(x) * (1 - t) + n(x - W) * t)
    }
  }
  return tex
}

// Mixes the fog band toward color, its two layers sliding past each other at off1 and off2 pixels.
function creep(hdr: Float32Array, W: number, H: number, tex: Float32Array, y0: number, rows: number, off1: number, off2: number, color: RGB, alpha: number) {
  const i1 = Math.floor(off1)
  const f1 = off1 - i1
  const i2 = Math.floor(off2)
  const f2 = off2 - i2
  for (let j = 0; j < rows; j++) {
    const y = y0 + j
    if (y >= H) break
    const row = j * W
    for (let x = 0; x < W; x++) {
      const a0 = (((x + i1) % W) + W) % W
      const a = tex[row + a0] * (1 - f1) + tex[row + ((a0 + 1) % W)] * f1
      const b0 = (((x - i2) % W) + W) % W
      const b = tex[row + b0] * (1 - f2) + tex[row + ((b0 + W - 1) % W)] * f2
      const d = Math.min(0.9, alpha * smoothstep(0.25, 0.75, (a + b) * 0.5) * 2.2)
      if (d <= 0.003) continue
      const o = (y * W + x) * 3
      hdr[o] += (color[0] - hdr[o]) * d
      hdr[o + 1] += (color[1] - hdr[o + 1]) * d
      hdr[o + 2] += (color[2] - hdr[o + 2]) * d
    }
  }
}

// Copies the background back over the pixels marked in fore, inside the box.
function restoreFore(hdr: Float32Array, background: Float32Array, fore: Uint8Array, W: number, x0: number, y0: number, x1: number, y1: number) {
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      const i = y * W + x
      if (!fore[i]) continue
      hdr[i * 3] = background[i * 3]
      hdr[i * 3 + 1] = background[i * 3 + 1]
      hdr[i * 3 + 2] = background[i * 3 + 2]
    }
}

export const hauntedHouse: Wallpaper = {
  id: "haunted-house",
  name: "Haunted House",
  description: "A crooked Victorian haunted house on a rise above a foggy graveyard under a huge moon, with a witch flying by now and then",
  activity: {
    calm: "The candle and jack-o'-lanterns flicker, fog creeps, a bat or two flits and the swing sways",
    lively: "Adds bats pouring from the turret, ghosts drifting by and a ghoul peeking out from behind a gravestone",
    teeming: "Adds a zombie shuffling through the graveyard, a hand clawing out of a grave, a witch crossing the moon and a light moving room to room",
  },
  scrim: {
    day: [
      [34, 40, 38],
      [40, 44, 36],
      [26, 30, 22],
    ],
    sunset: [
      [22, 6, 26],
      [44, 12, 18],
      [12, 4, 10],
    ],
    night: [
      [4, 2, 14],
      [8, 4, 22],
      [4, 3, 12],
    ],
  },
  create: (settings) => new HauntedHouse(settings),
}
