import { Canvas } from "../src/canvas"
import { eggWait } from "../src/egg"
import { TAU, clamp, lerp, rand, smoothstep, type RGB } from "../src/math"
import { touch } from "../src/touched"
import type { Activity, Settings, Time, Wallpaper } from "../src/wallpaper"

// The scene runs slower than real time, which keeps it calm behind text.
const TIME_SCALE = 0.35
// Cells along each side of the maze. Walls are thin, on the cell edges, WALL cells high, and the eye is halfway up.
const MAZE = 12
const WALL = 0.8
const EYE = WALL / 2
// Bricks: four courses per wall, their length, and the mortar between them, all in cells.
const COURSE = WALL / 4
const BRICK = 0.4
const MORTAR = 0.035
// Ceiling tiles per cell and the width of the seams between them, as a fraction of a tile.
const TILES = 3
const SEAM = 0.07
// Headings in the maze's grid: east, south, west, north (y runs south).
const DX = [1, 0, -1, 0]
const DY = [0, 1, 0, -1]
// Per screen column, what its ray hit (see castColumns).
const COL = 12
// The flip lasts this many scene seconds before the view rights itself.
const FLIPPED = 25

// Everything that changes with the time of day.
interface Look {
  brick: RGB
  mortar: RGB
  ceiling: RGB
  seam: RGB
  floor: RGB
  // What far corridors fade into, and how quickly (per cell; 0 never).
  fog: RGB
  haze: number
  // The camera's lamp: how quickly its light falls off with distance (0 lights everything evenly) and the light left
  // where it doesn't reach.
  lamp: number
  ambient: number
  // How much darker walls running east-west are than those running north-south, for the old flat shading.
  side: number
  // The floating polyhedra, the flip one, the smiley's face and its features.
  solid: RGB
  flip: RGB
  face: RGB
  ink: RGB
}

const LOOKS: Record<Time, Look> = {
  // The classic: deep red bricks in white mortar, a pale stippled ceiling and a mustard floor, evenly lit.
  day: {
    brick: [0.3, 0.012, 0.01],
    mortar: [0.62, 0.6, 0.58],
    ceiling: [0.5, 0.5, 0.52],
    seam: [0.3, 0.3, 0.33],
    floor: [0.46, 0.25, 0.014],
    fog: [0.3, 0.27, 0.25],
    haze: 0.03,
    lamp: 0,
    ambient: 1,
    side: 0.78,
    solid: [0.11, 0.11, 0.12],
    flip: [0.5, 0.03, 0.3],
    face: [0.62, 0.48, 0.02],
    ink: [0.03, 0.02, 0.01],
  },
  // Low amber light, the corridors fading into a warm haze.
  sunset: {
    brick: [0.3, 0.025, 0.006],
    mortar: [0.6, 0.38, 0.2],
    ceiling: [0.5, 0.34, 0.2],
    seam: [0.3, 0.17, 0.08],
    floor: [0.5, 0.2, 0.01],
    fog: [0.3, 0.1, 0.025],
    haze: 0.42,
    lamp: 0.12,
    ambient: 0.4,
    side: 0.74,
    solid: [0.06, 0.035, 0.03],
    flip: [0.5, 0.04, 0.24],
    face: [0.66, 0.42, 0.02],
    ink: [0.04, 0.012, 0.005],
  },
  // Dark corridors in the camera's lamp, fading into deep blue-black: pale cobalt ceiling and mortar, no white.
  night: {
    brick: [0.26, 0.01, 0.026],
    mortar: [0.16, 0.21, 0.54],
    ceiling: [0.17, 0.23, 0.58],
    seam: [0.06, 0.08, 0.28],
    floor: [0.36, 0.17, 0.012],
    fog: [0.002, 0.004, 0.02],
    haze: 0.2,
    lamp: 1.4,
    ambient: 0.04,
    side: 0.72,
    solid: [0.03, 0.06, 0.24],
    flip: [0.4, 0.02, 0.32],
    face: [0.6, 0.4, 0.02],
    ink: [0.02, 0.006, 0.04],
  },
}

// How the camera walks, in scene seconds: top speed in cells per second, how long a quarter turn takes, the rest after
// a run and the pause looking down the new corridor after a turn.
const PACE: Record<Activity, { speed: number; turn: number; rest: number; look: number }> = {
  calm: { speed: 0.3, turn: 2.4, rest: 0.4, look: 18 },
  lively: { speed: 0.9, turn: 1, rest: 0.3, look: 5.5 },
  teeming: { speed: 1.2, turn: 0.8, rest: 0.25, look: 4.5 },
}

// A spinning polyhedron floating in a corridor: its cell, spin angles and rates, how grown it is, and whether it is
// the one that flips the view.
interface Solid {
  cx: number
  cy: number
  a: number
  b: number
  ra: number
  rb: number
  grow: number
  dying: boolean
  flip: boolean
}

// Unit polyhedra: vertices and outward triangles, found as the triples every other vertex lies behind.
const PHI = (1 + Math.sqrt(5)) / 2
const ICOSAHEDRON = hull([-1, 1].flatMap((s) => [-1, 1].flatMap((t) => [[0, s, t * PHI], [s, t * PHI, 0], [t * PHI, 0, s]])))
const OCTAHEDRON = hull([[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]])

class Maze extends Canvas {
  private time = 0
  private readonly activity: Activity
  private readonly look: Look
  private readonly calmPace: { speed: number; turn: number; rest: number; look: number }
  // Heading for the exit after a finished task, at a brisker pace.
  private seeking = false
  // Walls on the cell edges: vertical ones at x = i between cells i - 1 and i, horizontal ones at y = j.
  private readonly vwall = new Uint8Array((MAZE + 1) * MAZE)
  private readonly hwall = new Uint8Array(MAZE * (MAZE + 1))
  // The exit, a dead end, and the wall with the smiley on it (vertical edges first, then horizontal ones).
  private exit = 0
  private smile = -1
  // The way to the exit once the agent is done: the heading to take from each cell, or -1.
  private readonly route = new Int8Array(MAZE * MAZE).fill(-1)
  // The wandering choice made for each cell and heading of arrival, or -1 (see choose).
  private readonly picks = new Int8Array(MAZE * MAZE * 4).fill(-1)
  // The camera: its cell, heading, position and view angle, and what it is doing.
  private cx = 0
  private cy = 0
  private heading = 0
  private x = 0.5
  private y = 0.5
  private angle = 0
  private mode: "pause" | "turn" | "run" | "cheer" = "pause"
  // Whether the camera has just turned where it stands, so it walks on rather than choosing again.
  private turned = true
  private t = 0
  private dur = 1
  private from = 0
  private to = 0
  private goal = 0
  private s = 0
  private v = 0
  // A side a click asked to turn toward, -1 or +1.
  private nudge = 0
  // Fades out and back in around a new maze.
  private fade = 1
  private solids: Solid[] = []
  // The flip: where the view is between upright (0) and upside down (1), where it is heading, and how long it stays.
  private flip = 0
  private flipTo = 0
  private flipLeft = 0
  private egg = eggWait() * TIME_SCALE
  // Per column, what its ray hit; per row, how far the floor or ceiling it shows is.
  private cols = new Float32Array(0)
  private rows = new Float32Array(0)
  private readonly params = new Float32Array(32)
  // The view last cast: position, angle, flip and light. Whether it has been kept as the still background.
  private readonly last = new Float64Array(5).fill(NaN)
  private kept = false

  constructor(settings: Settings) {
    super()
    this.supersample = 1
    this.activity = settings.activity
    this.look = LOOKS[settings.time]
    this.calmPace = PACE[settings.activity]
    this.build()
    this.dur = rand(0.5, 2)
    if (this.activity !== "teeming") return
    this.spawn(false)
    this.spawn(false)
    for (const o of this.solids) o.grow = 1
  }

  // A new perfect maze, grown from a random cell: mostly carving on from the newest cell, which gives long corridors,
  // and now and then from an older one, which gives side branches. The camera starts there, facing an opening, and the
  // exit is the dead end farthest from it.
  private build() {
    this.vwall.fill(1)
    this.hwall.fill(1)
    const seen = new Uint8Array(MAZE * MAZE)
    const start = Math.floor(Math.random() * MAZE * MAZE)
    const stack = [start]
    seen[start] = 1
    while (stack.length) {
      const k = Math.random() < 0.7 ? stack.length - 1 : Math.floor(Math.random() * stack.length)
      const c = stack[k]
      const x = c % MAZE
      const y = Math.floor(c / MAZE)
      const ways = [0, 1, 2, 3].filter((h) => {
        const nx = x + DX[h]
        const ny = y + DY[h]
        return nx >= 0 && ny >= 0 && nx < MAZE && ny < MAZE && !seen[ny * MAZE + nx]
      })
      if (!ways.length) {
        stack.splice(k, 1)
        continue
      }
      const h = ways[Math.floor(Math.random() * ways.length)]
      this.setWall(x, y, h, 0)
      const n = (y + DY[h]) * MAZE + x + DX[h]
      seen[n] = 1
      stack.push(n)
    }
    const far = this.distances(start)
    this.placeExit(far.reduce((best, d, i) => (d > far[best] ? i : best), 0))
    this.cx = start % MAZE
    this.cy = Math.floor(start / MAZE)
    this.heading = [0, 1, 2, 3].find((h) => this.open(this.cx, this.cy, h)) ?? 0
    this.angle = (this.heading * TAU) / 4
    this.x = this.cx + 0.5
    this.y = this.cy + 0.5
    this.route.fill(-1)
    this.picks.fill(-1)
    this.solids = []
    this.turned = true
    this.mode = "pause"
    this.t = 0
    this.dur = this.pace.look
    this.seeking = false
  }

  // Makes the dead end c the exit, with the smiley on the wall facing its opening.
  private placeExit(c: number) {
    const x = c % MAZE
    const y = Math.floor(c / MAZE)
    this.exit = c
    this.smile = this.edge(x, y, (([0, 1, 2, 3].find((h) => this.open(x, y, h)) ?? 0) + 2) % 4)
  }

  // Steps from cell `from` to every cell.
  private distances(from: number) {
    const d = new Int32Array(MAZE * MAZE).fill(-1)
    d[from] = 0
    const queue = [from]
    for (let i = 0; i < queue.length; i++) {
      const c = queue[i]
      for (let h = 0; h < 4; h++) {
        if (!this.open(c % MAZE, Math.floor(c / MAZE), h)) continue
        const n = c + DX[h] + DY[h] * MAZE
        if (d[n] >= 0) continue
        d[n] = d[c] + 1
        queue.push(n)
      }
    }
    return d
  }

  // The index of the wall on the side h of cell (x, y): vertical edges first, then horizontal ones.
  private edge(x: number, y: number, h: number) {
    if (h === 0) return y * (MAZE + 1) + x + 1
    if (h === 2) return y * (MAZE + 1) + x
    return (MAZE + 1) * MAZE + (h === 1 ? y + 1 : y) * MAZE + x
  }

  private setWall(x: number, y: number, h: number, on: number) {
    const e = this.edge(x, y, h)
    if (e < (MAZE + 1) * MAZE) this.vwall[e] = on
    else this.hwall[e - (MAZE + 1) * MAZE] = on
  }

  private open(x: number, y: number, h: number) {
    const e = this.edge(x, y, h)
    return e < (MAZE + 1) * MAZE ? !this.vwall[e] : !this.hwall[e - (MAZE + 1) * MAZE]
  }

  // The heading to take on from cell (x, y) arriving with heading h: the way to the exit once the agent is done, a
  // side a click asked for, or else a wander (see pick). Picks are kept until the camera has walked through the cell,
  // so looking ahead and walking agree.
  private choose(x: number, y: number, h: number) {
    const c = y * MAZE + x
    if (c === this.exit) return (h + 2) % 4
    if (this.route[c] >= 0) return this.route[c]
    if (this.nudge && this.open(x, y, (h + this.nudge + 4) % 4)) return (h + this.nudge + 4) % 4
    if (this.picks[c * 4 + h] < 0) this.picks[c * 4 + h] = this.pick(x, y, h)
    return this.picks[c * 4 + h]
  }

  // A wandering choice that never turns back before a dead end: mostly toward the bigger part of the maze, so short
  // dead ends are seldom entered, and more often straight on than around a corner.
  private pick(x: number, y: number, h: number) {
    const ways = [h, (h + 1) % 4, (h + 3) % 4].filter((k) => this.open(x, y, k))
    if (!ways.length) return (h + 2) % 4
    const weights = ways.map((k) => this.reach(x + DX[k], y + DY[k], y * MAZE + x) * (k === h ? 2.5 : 1))
    let r = Math.random() * weights.reduce((a, b) => a + b, 0)
    return ways.find((_, i) => (r -= weights[i]) < 0) ?? ways[0]
  }

  // How many cells lie beyond cell (x, y) when coming from cell `from`.
  private reach(x: number, y: number, from: number) {
    const seen = new Uint8Array(MAZE * MAZE)
    seen[from] = 1
    seen[y * MAZE + x] = 1
    const queue = [y * MAZE + x]
    for (let i = 0; i < queue.length; i++)
      for (let h = 0; h < 4; h++) {
        const c = queue[i]
        if (!this.open(c % MAZE, Math.floor(c / MAZE), h) || seen[c + DX[h] + DY[h] * MAZE]) continue
        seen[c + DX[h] + DY[h] * MAZE] = 1
        queue.push(c + DX[h] + DY[h] * MAZE)
      }
    return queue.length
  }

  step(dt: number) {
    dt = clamp(dt, 0, 0.1) * TIME_SCALE
    this.time += dt
    this.stepGloom(dt)
    this.walk(dt)
    this.stepSolids(dt)
    this.stepFlip(dt)
  }

  private get pace() {
    const p = this.calmPace
    return this.seeking ? { speed: p.speed * 1.8, turn: p.turn * 0.6, rest: p.rest, look: Math.min(p.look, 1) } : p
  }

  private walk(dt: number) {
    const pace = this.pace
    this.t += dt
    if (this.mode === "cheer") {
      // At the exit: smile back for a while, then fade out into a new maze and back in.
      this.fade = smoothstep(this.dur, this.dur - 1.2, this.t)
      if (this.t < this.dur) return
      this.build()
      this.t = -1.2
      return
    }
    this.fade = Math.min(1, this.fade + dt / 1.2)
    if (this.mode === "turn") {
      this.angle = lerp(this.from, this.to, smoothstep(0, 1, this.t / this.dur))
      if (this.t < this.dur) return
      this.angle = (this.heading * TAU) / 4
      this.turned = true
      this.rest(pace.look)
      return
    }
    if (this.mode === "run") {
      const accel = pace.speed * 0.8
      const left = this.goal - this.s
      this.v = Math.min(this.v + accel * dt, pace.speed, Math.sqrt(2 * accel * Math.max(0, left)) + 0.02)
      this.s = Math.min(this.goal, this.s + this.v * dt)
      this.x = this.cx + 0.5 + DX[this.heading] * this.s
      this.y = this.cy + 0.5 + DY[this.heading] * this.s
      if (this.s < this.goal) return
      for (let k = 1; k < this.goal; k++) {
        const c = (this.cy + DY[this.heading] * k) * MAZE + this.cx + DX[this.heading] * k
        this.picks.fill(-1, c * 4, c * 4 + 4)
      }
      this.cx += DX[this.heading] * this.goal
      this.cy += DY[this.heading] * this.goal
      this.s = 0
      this.v = 0
      this.turned = false
      this.rest(pace.rest)
      return
    }
    if (this.t < this.dur) return
    this.decide()
  }

  private rest(seconds: number) {
    this.mode = "pause"
    this.t = 0
    this.dur = seconds
  }

  private decide() {
    const pace = this.pace
    if (this.cy * MAZE + this.cx === this.exit) {
      this.mode = "cheer"
      this.t = 0
      this.dur = 6
      this.route.fill(-1)
      this.seeking = false
      return
    }
    const c = this.cy * MAZE + this.cx
    const straight = this.turned && this.route[c] < 0 && !(this.nudge && this.open(this.cx, this.cy, (this.heading + this.nudge + 4) % 4))
    const h = straight ? this.heading : this.choose(this.cx, this.cy, this.heading)
    const turn = (h - this.heading + 4) % 4
    this.picks.fill(-1, c * 4, c * 4 + 4)
    if (turn) {
      if (turn === 1 || turn === 3) this.nudge = 0
      this.mode = "turn"
      this.t = 0
      this.from = this.angle
      this.to = this.angle + (turn === 3 ? -1 : turn) * (TAU / 4)
      this.dur = pace.turn * (turn === 2 ? 1.6 : 1)
      this.heading = h
      return
    }
    // Run on until the next cell where the way bends.
    let n = 1
    while (n < MAZE && this.choose(this.cx + DX[h] * n, this.cy + DY[h] * n, h) === h && (this.cy + DY[h] * n) * MAZE + this.cx + DX[h] * n !== this.exit) n++
    this.mode = "run"
    this.goal = n
    this.s = 0
    this.v = 0
  }

  // Teeming keeps a few polyhedra floating along the way ahead; the camera passes through them and they vanish.
  private stepSolids(dt: number) {
    for (const o of this.solids) {
      o.a += o.ra * dt
      o.b += o.rb * dt
      o.grow = o.dying ? o.grow - dt * 3 : Math.min(1, o.grow + dt * 1.2)
      if (o.dying || Math.hypot(this.x - o.cx - 0.5, this.y - o.cy - 0.5) > 0.3) continue
      o.dying = true
      if (o.flip) this.flipTo = 1 - this.flipTo
      if (o.flip) this.flipLeft = FLIPPED
    }
    this.solids = this.solids.filter((o) => o.grow > 0)
    this.egg -= dt
    if (this.egg <= 0 && this.flipLeft <= 0 && this.flipTo === 0 && !this.solids.some((o) => o.flip)) {
      this.egg = Infinity
      this.spawn(true)
    }
    if (this.activity !== "teeming" || this.mode === "cheer") return
    if (this.solids.filter((o) => !o.dying).length < 3 && Math.random() < dt * 0.6) this.spawn(false)
  }

  // A polyhedron where the camera will see it: down the corridor it faces, or a few cells along its way. A click's
  // comes in at the nearest free cell in view.
  private spawn(flip: boolean, near = false) {
    const h = this.heading
    const sight: [number, number][] = []
    for (let x = Math.floor(this.x), y = Math.floor(this.y); sight.length < MAZE && this.open(x, y, h); x += DX[h], y += DY[h]) sight.push([x + DX[h], y + DY[h]])
    const free = (cells: [number, number][]) => cells.filter(([x, y]) => !this.solids.some((o) => o.cx === x && o.cy === y))
    const view = free(sight.filter(([x, y]) => Math.hypot(x + 0.5 - this.x, y + 0.5 - this.y) > 0.9))
    const pool = view.length && (near || Math.random() < 0.7) ? view : free(this.ahead(12).slice(2))
    const cell = pool[near ? 0 : Math.floor(Math.random() * Math.min(pool.length, 6))]
    if (!cell) return
    this.solids.push({ cx: cell[0], cy: cell[1], a: rand(0, TAU), b: rand(0, TAU), ra: rand(0.5, 0.8), rb: rand(0.3, 0.5), grow: 0, dying: false, flip })
  }

  // The next n cells the camera will walk through.
  private ahead(n: number) {
    let x = this.cx
    let y = this.cy
    let h = this.heading
    const cells: [number, number][] = []
    for (let i = 0; i < n; i++) {
      if (i || !(this.turned || this.mode !== "pause")) h = this.choose(x, y, h)
      x += DX[h]
      y += DY[h]
      if (x < 0 || y < 0 || x >= MAZE || y >= MAZE) break
      cells.push([x, y])
      if (y * MAZE + x === this.exit) break
    }
    return cells
  }

  private stepFlip(dt: number) {
    this.flip = this.flipTo > this.flip ? Math.min(this.flipTo, this.flip + dt / 1.5) : Math.max(this.flipTo, this.flip - dt / 1.5)
    if (this.flipLeft <= 0) return
    this.flipLeft -= dt
    // It rights itself while the camera stands looking down a corridor.
    if (this.flipLeft > 0 || this.mode !== "pause") return
    this.flipTo = 0
    this.egg = eggWait(true) * TIME_SCALE
  }

  // A finished task: the camera heads briskly for the exit, which turns out to be a dead end a few turns away.
  protected override visit() {
    if (this.mode === "cheer") return
    const here = this.distances(this.cy * MAZE + this.cx)
    const ends = here.map((d, c) => (d >= 4 && [0, 1, 2, 3].filter((h) => this.open(c % MAZE, Math.floor(c / MAZE), h)).length === 1 ? c : -1)).filter((c) => c >= 0)
    if (ends.length) this.placeExit(ends.reduce((best, c) => (Math.abs(here[c] - 8) < Math.abs(here[best] - 8) ? c : best)))
    this.seeking = true
    const to = this.distances(this.exit)
    for (let c = 0; c < MAZE * MAZE; c++) {
      if (c === this.exit) continue
      const x = c % MAZE
      const y = Math.floor(c / MAZE)
      this.route[c] = [0, 1, 2, 3].find((h) => this.open(x, y, h) && to[c + DX[h] + DY[h] * MAZE] === to[c] - 1) ?? -1
    }
    if (this.mode === "pause") this.t = this.dur
    if (this.mode === "run") this.replan()
  }

  // A click on the left or right of the screen turns the camera that way where it can; elsewhere, or where there's no
  // turning, a polyhedron appears down the corridor.
  poke(x: number) {
    const side = x < this.A / 3 ? -1 : x > (this.A * 2) / 3 ? 1 : 0
    const h = this.heading
    const turn = (h + side + 4) % 4
    let can = false
    for (let k = 0; side && k < MAZE && !can; k++) {
      const cx = this.cx + DX[h] * k
      const cy = this.cy + DY[h] * k
      can = this.open(cx, cy, turn)
      if (!this.open(cx, cy, h)) break
    }
    if (!can || this.mode === "turn" || this.mode === "cheer") {
      if (this.solids.length < 6) this.spawn(false, true)
      return
    }
    this.nudge = side
    if (this.mode === "pause" && this.open(this.cx, this.cy, turn)) this.t = this.dur
    if (this.mode === "run") this.replan()
  }

  // Cuts the current run short where the way now bends.
  private replan() {
    const h = this.heading
    for (let k = Math.ceil(this.s + 0.05); k < this.goal; k++) {
      if (this.choose(this.cx + DX[h] * k, this.cy + DY[h] * k, h) === h) continue
      this.goal = k
      return
    }
  }

  protected override layout() {
    this.cols = new Float32Array(this.W * COL)
    this.rows = new Float32Array(this.H)
    this.last.fill(NaN)
    this.kept = false
  }

  render() {
    const { W, H, look } = this
    // A flicker and dimming after an error, in coarse steps so the view isn't cast again every frame.
    const dip = this.gloom > 0.2 && hashStep(Math.floor(this.time / 0.12)) < 0.1 * this.gloom ? 0.55 : 1
    const light = Math.round((1 - 0.45 * this.gloom) * dip * this.fade * 32) / 32
    const roll = Math.cos(this.flip * Math.PI)
    const view = [this.x, this.y, this.angle, roll, light]
    const moved = view.some((v, i) => v !== this.last[i])
    const f = Math.max(0.62 * H, 0.36 * W)
    const fy = f * (Math.abs(roll) < 0.02 ? 0.02 * Math.sign(roll || 1) : roll)
    const dirX = Math.cos(this.angle)
    const dirY = Math.sin(this.angle)
    if (moved || !this.kept) {
      this.restore(undefined)
      this.last.set(view)
      const p = this.params
      p.set([...look.brick, ...look.mortar, ...look.ceiling, ...look.seam, ...look.floor, ...look.fog, look.haze, look.lamp, look.ambient, light, ...look.face, ...look.ink, look.side, this.cells ? 9 : 2])
      castColumns(this.vwall, this.hwall, this.smile, this.x, this.y, dirX, dirY, -dirY * (W / 2 / f), dirX * (W / 2 / f), W, this.cols)
      shadeView(this.hdr, W, H, this.cols, this.rows, f, fy, this.x, this.y, p)
      touch(this.hdr, 0, 0, W - 1, H - 1)
      // Once the camera holds still, its view becomes the background and only the polyhedra are drawn over it.
      if (!moved) this.hold()
      this.kept = !moved
    }
    if (this.kept) this.restore()
    for (const o of this.solids) this.drawSolid(o, f, fy, dirX, dirY, light)
    this.finish(2)
  }

  private drawSolid(o: Solid, f: number, fy: number, dirX: number, dirY: number, light: number) {
    const { W, H, look } = this
    const ox = o.cx + 0.5
    const oy = o.cy + 0.5
    const depth = (ox - this.x) * dirX + (oy - this.y) * dirY
    if (depth < 0.25 || o.grow <= 0) return
    const lat = (ox - this.x) * -dirY + (oy - this.y) * dirX
    if (Math.abs(lat / depth) * f > W / 2 + f * 0.3 / depth) return
    const shape = o.flip ? OCTAHEDRON : ICOSAHEDRON
    const r = 0.16 * smoothstep(0, 1, o.grow) * (o.flip ? 1.2 : 1)
    const ca = Math.cos(o.a)
    const sa = Math.sin(o.a)
    const cb = Math.cos(o.b)
    const sb = Math.sin(o.b)
    // Spun about the vertical, then tipped about x; then into world space and onto the screen.
    const pts = shape.verts.map(([vx, vy, vz]) => {
      const x1 = vx * ca - vy * sa
      const y1 = vx * sa + vy * ca
      const y2 = y1 * cb - vz * sb
      const z2 = y1 * sb + vz * cb
      const wx = ox + x1 * r
      const wy = oy + y2 * r
      const wz = EYE + z2 * r
      const d = (wx - this.x) * dirX + (wy - this.y) * dirY
      const l = (wx - this.x) * -dirY + (wy - this.y) * dirX
      return [wx, wy, wz, W / 2 + (f * l) / d, H / 2 - (fy * (wz - EYE)) / d, d]
    })
    // Lit from behind the camera's left shoulder, then dimmed and fogged with distance like the walls.
    const lx = -dirX * 0.6 + dirY * 0.4
    const ly = -dirY * 0.6 - dirX * 0.4
    const lz = 0.7
    const ll = Math.hypot(lx, ly, lz)
    const dist = Math.hypot(ox - this.x, oy - this.y)
    const reach = (look.lamp ? look.ambient + (1 - look.ambient) / (1 + dist * dist * look.lamp) : 1) * light
    const fogk = veil(dist, look.haze)
    const base = o.flip ? look.flip : look.solid
    const faces = shape.faces
      .map(([a, b, c]) => {
        const [ax, ay, az] = pts[a]
        const [bx, by, bz] = pts[b]
        const [qx, qy, qz] = pts[c]
        const ux = bx - ax
        const uy = by - ay
        const uz = bz - az
        const vx = qx - ax
        const vy = qy - ay
        const vz = qz - az
        const nx = uy * vz - uz * vy
        const ny = uz * vx - ux * vz
        const nz = ux * vy - uy * vx
        const toward = (this.x - ax) * nx + (this.y - ay) * ny + (EYE - az) * nz
        return { a, b, c, nx, ny, nz, toward, d: pts[a][5] + pts[b][5] + pts[c][5] }
      })
      .filter((t) => t.toward > 0)
      .sort((p, q) => q.d - p.d)
    let x0 = Infinity
    let y0 = Infinity
    let x1 = -Infinity
    let y1 = -Infinity
    for (const t of faces) {
      const n = Math.hypot(t.nx, t.ny, t.nz) || 1
      const k = (0.3 + 1.1 * Math.max(0, (t.nx * lx + t.ny * ly + t.nz * lz) / (n * ll))) * reach * (1 - fogk)
      const fog = look.fog
      const pa = pts[t.a]
      const pb = pts[t.b]
      const pc = pts[t.c]
      fillTriangle(this.hdr, W, H, this.cols, depth, pa[3], pa[4], pb[3], pb[4], pc[3], pc[4], base[0] * k + fog[0] * fogk * light, base[1] * k + fog[1] * fogk * light, base[2] * k + fog[2] * fogk * light)
      x0 = Math.min(x0, pa[3], pb[3], pc[3])
      y0 = Math.min(y0, pa[4], pb[4], pc[4])
      x1 = Math.max(x1, pa[3], pb[3], pc[3])
      y1 = Math.max(y1, pa[4], pb[4], pc[4])
    }
    if (faces.length) this.touch(Math.floor(x0) - 2, Math.floor(y0) - 2, Math.ceil(x1) + 2, Math.ceil(y1) + 2)
  }
}

// A stable 0..1 value per step index.
function hashStep(n: number) {
  const s = Math.sin(n * 91.7 + 17.3) * 43758.5453
  return s - Math.floor(s)
}

// The convex hull of a few points as outward triangles.
function hull(verts: number[][]) {
  const faces: [number, number, number][] = []
  const n = verts.length
  for (let a = 0; a < n; a++)
    for (let b = a + 1; b < n; b++)
      for (let c = b + 1; c < n; c++) {
        const [ax, ay, az] = verts[a]
        const u = [verts[b][0] - ax, verts[b][1] - ay, verts[b][2] - az]
        const v = [verts[c][0] - ax, verts[c][1] - ay, verts[c][2] - az]
        const nx = u[1] * v[2] - u[2] * v[1]
        const ny = u[2] * v[0] - u[0] * v[2]
        const nz = u[0] * v[1] - u[1] * v[0]
        const sides = verts.filter((_, i) => i !== a && i !== b && i !== c).map((p) => (p[0] - ax) * nx + (p[1] - ay) * ny + (p[2] - az) * nz)
        if (sides.every((s) => s < -1e-6)) faces.push([a, b, c])
        if (sides.every((s) => s > 1e-6)) faces.push([a, c, b])
      }
  const scale = Math.hypot(verts[0][0], verts[0][1], verts[0][2])
  return { verts: verts.map((p) => p.map((k) => k / scale)), faces }
}

// The share of [a, b] where the repeating pattern of period 1 is "on" for its first m: a box-filtered line, so mortar
// and seams thin into an even tint with distance instead of shimmering.
function lines(a: number, b: number, m: number) {
  const fa = Math.floor(a)
  const fb = Math.floor(b)
  return (fb * m + Math.min(b - fb, m) - fa * m - Math.min(a - fa, m)) / (b - a)
}

// Casts one ray per screen column through the maze's thin walls, a grid walk from cell edge to cell edge. Per column
// into cols: the perpendicular distance, the wall's top and bottom are filled in by shadeView; its position along the
// wall in cells, whether it runs east-west, whether it is the smiley wall, how squarely the ray meets it, and the ray.
function castColumns(vwall: Uint8Array, hwall: Uint8Array, smile: number, px: number, py: number, dirX: number, dirY: number, planeX: number, planeY: number, W: number, cols: Float32Array) {
  for (let x = 0; x < W; x++) {
    const cam = (2 * (x + 0.5)) / W - 1
    const rx = dirX + planeX * cam
    const ry = dirY + planeY * cam
    let mx = Math.floor(px)
    let my = Math.floor(py)
    const ddx = Math.abs(1 / rx)
    const ddy = Math.abs(1 / ry)
    const sx = rx < 0 ? -1 : 1
    const sy = ry < 0 ? -1 : 1
    let tx = (rx < 0 ? px - mx : mx + 1 - px) * ddx
    let ty = (ry < 0 ? py - my : my + 1 - py) * ddy
    let dist = 0
    let side = 0
    let edge = -1
    for (let i = 0; i < 4 * MAZE; i++) {
      if (tx < ty) {
        const e = my * (MAZE + 1) + mx + (sx > 0 ? 1 : 0)
        if (my < 0 || my >= MAZE || vwall[e]) {
          dist = tx
          side = 0
          edge = e
          break
        }
        mx += sx
        tx += ddx
        continue
      }
      const e = (my + (sy > 0 ? 1 : 0)) * MAZE + mx
      if (mx < 0 || mx >= MAZE || hwall[e]) {
        dist = ty
        side = 1
        edge = (MAZE + 1) * MAZE + e
        break
      }
      my += sy
      ty += ddy
    }
    const len = Math.hypot(rx, ry)
    const o = x * COL
    cols[o] = Math.max(dist, 1e-3)
    cols[o + 3] = side ? px + rx * dist : py + ry * dist
    cols[o + 4] = side
    cols[o + 5] = edge === smile ? 1 : 0
    cols[o + 6] = Math.max(0.12, Math.abs(side ? ry : rx) / len)
    cols[o + 7] = len
    cols[o + 8] = rx
    cols[o + 9] = ry
  }
}

// Shades every pixel: brick walls with mortar, the tiled ceiling and the plain floor, lit and fogged by distance.
// fy is the vertical focal length, negative when the view is flipped; p holds the look (see Maze.render).
function shadeView(hdr: Float32Array, W: number, H: number, cols: Float32Array, rows: Float32Array, f: number, fy: number, px: number, py: number, p: Float32Array) {
  const horizon = H / 2
  const haze = p[18]
  const lamp = p[19]
  const ambient = p[20]
  const light = p[21]
  const side = p[28]
  for (let x = 0; x < W; x++) {
    const o = x * COL
    const d = cols[o]
    const a = horizon + (fy * (EYE - WALL)) / d
    const b = horizon + (fy * EYE) / d
    cols[o + 1] = Math.min(a, b)
    cols[o + 2] = Math.max(a, b)
    cols[o + 10] = lit(d * cols[o + 7], lamp, ambient) * light
    cols[o + 11] = veil(d * cols[o + 7], haze)
  }
  for (let y = 0; y < H; y++) {
    const t = (y + 0.5 - horizon) / fy
    rows[y] = t > 1e-4 ? EYE / t : t < -1e-4 ? (WALL - EYE) / -t : 1e9
  }
  const mh = MORTAR / COURSE
  const ml = MORTAR / BRICK
  for (let y = 0; y < H; y++) {
    const rd = rows[y]
    const floor = (y + 0.5 - horizon) / fy > 0
    // How much ceiling one pixel covers, in tiles, across and along the view.
    const step = (rd * rd) / (Math.abs(fy) * (WALL - EYE))
    for (let x = 0; x < W; x++) {
      const o = x * COL
      const d = cols[o]
      const cover = Math.min(y + 1, cols[o + 2]) - Math.max(y, cols[o + 1])
      const cov = cover < 0 ? 0 : cover > 1 ? 1 : cover
      let r = 0
      let g = 0
      let bl = 0
      if (cov > 0) {
        const z = clamp(EYE - ((y + 0.5 - horizon) * d) / fy, 0, WALL)
        const wz = d / Math.abs(fy) / COURSE
        const wu = d / f / cols[o + 6] / BRICK
        const sv = z / COURSE + mh / 2
        const course = Math.floor(z / COURSE)
        const su = cols[o + 3] / BRICK + (course & 1) * 0.5 + ml / 2
        const ch = lines(sv - wz / 2, sv + wz / 2, mh)
        const cv = lines(su - wu / 2, su + wu / 2, ml)
        // Where courses get small the mortar softens into an even tint: crisp bricks up close, calm far walls.
        const crisp = clamp((1 / wz - p[29]) / p[29], 0, 1)
        const mortar = lerp(1 - (1 - mh) * (1 - ml), 1 - (1 - ch) * (1 - cv), crisp)
        // Each brick a little lighter or darker, and shaded toward its bottom, both fading out where bricks get small.
        const detail = clamp(1.5 - 2 * Math.max(wz, wu), 0, 1)
        const tone = 1 + detail * (0.24 * cellNoise(Math.floor(su), course) - 0.12 + 0.16 * (z / COURSE - course) - 0.08)
        const k = (1 - mortar) * tone
        const s = cols[o + 4] ? side : 1
        r = (p[0] * k + p[3] * mortar) * s
        g = (p[1] * k + p[4] * mortar) * s
        bl = (p[2] * k + p[5] * mortar) * s
        if (cols[o + 5]) {
          // The smiley at the exit: a gold face with dark eyes and grin, centered on the wall's cell.
          const u = cols[o + 3]
          const lu = u - Math.floor(u) - 0.5
          const lz = z - WALL / 2
          const aa = Math.max(wz * COURSE, wu * BRICK, 0.004)
          const rr = Math.hypot(lu, lz)
          const face = clamp((0.27 - rr) / aa + 0.5, 0, 1)
          const eye = Math.max(clamp((0.045 - Math.hypot(Math.abs(lu) - 0.09, lz - 0.07)) / aa + 0.5, 0, 1), 0)
          const grin = clamp((0.035 - Math.abs(rr - 0.16)) / aa + 0.5, 0, 1) * clamp(-(lz + 0.04) / aa + 0.5, 0, 1)
          const rim = clamp((0.018 - Math.abs(rr - 0.27)) / aa + 0.5, 0, 1)
          const ink = Math.max(eye, grin, rim)
          r = lerp(lerp(r, p[22], face), p[25], ink)
          g = lerp(lerp(g, p[23], face), p[26], ink)
          bl = lerp(lerp(bl, p[24], face), p[27], ink)
        }
        const k2 = cols[o + 10]
        const fog = cols[o + 11]
        r = (r * k2 * (1 - fog) + p[15] * fog * light) * cov
        g = (g * k2 * (1 - fog) + p[16] * fog * light) * cov
        bl = (bl * k2 * (1 - fog) + p[17] * fog * light) * cov
      }
      if (cov < 1) {
        let fr = p[12]
        let fg = p[13]
        let fb = p[14]
        if (!floor) {
          // Ceiling tiles: thin darker seams in a square grid, box-filtered by how much ceiling the pixel spans.
          const wx = (px + rd * cols[o + 8]) * TILES
          const wy = (py + rd * cols[o + 9]) * TILES
          const w = Math.max((rd * cols[o + 7]) / f, step) * TILES
          const seam = 1 - (1 - lines(wx - w / 2 + SEAM / 2, wx + w / 2 + SEAM / 2, SEAM)) * (1 - lines(wy - w / 2 + SEAM / 2, wy + w / 2 + SEAM / 2, SEAM))
          // A faint stipple per tile, fading out where tiles get small.
          const tone = 1 + clamp(1 - w * 1.5, 0, 1) * 0.1 * (cellNoise(Math.floor(wx), Math.floor(wy)) - 0.5)
          fr = lerp(p[6] * tone, p[9], seam)
          fg = lerp(p[7] * tone, p[10], seam)
          fb = lerp(p[8] * tone, p[11], seam)
        }
        const dd = rd * cols[o + 7]
        const k2 = lit(dd, lamp, ambient) * light
        const fog = veil(dd, haze)
        const c = 1 - cov
        r += (fr * k2 * (1 - fog) + p[15] * fog * light) * c
        g += (fg * k2 * (1 - fog) + p[16] * fog * light) * c
        bl += (fb * k2 * (1 - fog) + p[17] * fog * light) * c
      }
      const i = (y * W + x) * 3
      hdr[i] = r
      hdr[i + 1] = g
      hdr[i + 2] = bl
    }
  }
}

// How much of the fog shows at a distance: none up close, approaching all of it far away.
function veil(dist: number, haze: number) {
  return (dist * haze) / (1 + dist * haze)
}

// A stable 0..1 value per pair of integers, for brick and tile tones.
function cellNoise(a: number, b: number) {
  let h = Math.imul(a, 374761393) + Math.imul(b, 668265263)
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

// The camera lamp's light at a distance: falling off from full, down to the ambient light; even when there's no lamp.
function lit(dist: number, lamp: number, ambient: number) {
  return lamp ? ambient + (1 - ambient) / (1 + dist * dist * lamp) : 1
}

// A flat, anti-aliased triangle, drawn only in columns whose wall is farther than depth.
function fillTriangle(hdr: Float32Array, W: number, H: number, cols: Float32Array, depth: number, ax: number, ay: number, bx: number, by: number, cx: number, cy: number, r: number, g: number, b: number) {
  const area = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax)
  if (Math.abs(area) < 1e-6) return
  const s = area > 0 ? 1 : -1
  const lab = Math.hypot(bx - ax, by - ay) || 1
  const lbc = Math.hypot(cx - bx, cy - by) || 1
  const lca = Math.hypot(ax - cx, ay - cy) || 1
  const x0 = Math.max(0, Math.floor(Math.min(ax, bx, cx) - 1))
  const x1 = Math.min(W - 1, Math.ceil(Math.max(ax, bx, cx) + 1))
  const y0 = Math.max(0, Math.floor(Math.min(ay, by, cy) - 1))
  const y1 = Math.min(H - 1, Math.ceil(Math.max(ay, by, cy) + 1))
  for (let x = x0; x <= x1; x++) {
    if (cols[x * COL] < depth) continue
    const qx = x + 0.5
    for (let y = y0; y <= y1; y++) {
      const qy = y + 0.5
      const e0 = (s * ((bx - ax) * (qy - ay) - (by - ay) * (qx - ax))) / lab
      const e1 = (s * ((cx - bx) * (qy - by) - (cy - by) * (qx - bx))) / lbc
      const e2 = (s * ((ax - cx) * (qy - cy) - (ay - cy) * (qx - cx))) / lca
      // Half a pixel wider than the edge, so neighboring faces meet without a seam.
      const cov = clamp(Math.min(e0, e1, e2) + 0.75, 0, 1)
      if (cov <= 0) continue
      const i = (y * W + x) * 3
      hdr[i] += (r - hdr[i]) * cov
      hdr[i + 1] += (g - hdr[i + 1]) * cov
      hdr[i + 2] += (b - hdr[i + 2]) * cov
    }
  }
}

export const maze: Wallpaper = {
  id: "maze",
  name: "3D Maze",
  description: "The old 3D maze screensaver: gliding through red brick corridors under a tiled ceiling, turning at every junction",
  fixedTime: "day",
  activity: {
    calm: "Long looks down each corridor between slow walks and turns",
    lively: "Gliding down the corridors, pausing to look along each new one",
    teeming: "A little quicker, with spinning polyhedra floating in the corridors",
  },
  scrim: {
    day: [
      [44, 42, 46],
      [52, 12, 10],
      [52, 34, 6],
    ],
    sunset: [
      [46, 28, 16],
      [50, 14, 6],
      [44, 22, 4],
    ],
    night: [
      [6, 8, 26],
      [10, 4, 16],
      [8, 6, 8],
    ],
  },
  create: (settings) => new Maze(settings),
}
