import { Canvas } from "../src/canvas"
import type { Activity, Settings, Time, Wallpaper } from "../src/engine"
import { TAU, clamp, fbm1, hash, hash2, hashString, hsv, lerp, noise1, rand, smoothstep, type RGB } from "../src/math"

// Depth of the water surface as a fraction of the height.
const SURFACE = 0.065
// The scene runs slower than real time, which keeps it calm behind text.
const TIME_SCALE = 0.35
// Creatures are drawn smaller than in a full-screen tank so they stay out of the way of text.
const CREATURE_SCALE = 0.7
// Creatures swim and animate at a quarter of scene speed, so they drift rather than dart.
const CREATURE_SPEED = 0.25
const CAUS_N = 128
const RAY_N = 1024

const CAUSTICS = buildCaustics()
const RAYS_A = buildRays(1)
const RAYS_B = buildRays(9)

interface Fish {
  species: "fish" | "shark"
  x: number
  y: number
  z: number
  vx: number
  vy: number
  face: number
  turn: number
  heading: number
  pitch: number
  len: number
  hue: number
  sat: number
  phase: number
  wx: number
  wy: number
  wanderT: number
  zone: Zone
}

// A home area: x as fractions of the tank width, y in tank-height units.
type Zone = readonly [x0: number, x1: number, y0: number, y1: number]

interface Turtle {
  x: number
  y: number
  z: number
  vx: number
  vy: number
  face: number
  turn: number
  heading: number
  phase: number
  wx: number
  wy: number
  wanderT: number
  zone: Zone
}

interface Diver {
  x: number
  y: number
  z: number
  vx: number
  vy: number
  face: number
  turn: number
  heading: number
  phase: number
  breath: number
  wx: number
  wy: number
  wanderT: number
  zone: Zone
}

interface Octopus {
  x: number
  y: number
  z: number
  vx: number
  vy: number
  size: number
  hue: number
  phase: number
  pulse: number
  next: number
  dir: number
  wx: number
  wy: number
  zone: Zone
}

interface Kelp {
  x: number
  height: number
  phase: number
}

interface Particle {
  kind: "bubble" | "spark"
  x: number
  y: number
  vx: number
  vy: number
  life: number
  max: number
  size: number
  seed: number
}

class Aquarium extends Canvas {
  private time = 0
  private rowCol = new Float32Array(0)
  private rayFade = new Float32Array(0)
  private floorPx = new Float32Array(0)
  private farPx = new Float32Array(0)
  private midPx = new Float32Array(0)
  private pad = 0
  private lastA = 1
  private fish: Fish[] = []
  private turtle: Turtle | undefined
  private diver: Diver | undefined
  private octopus: Octopus | undefined
  private kelp: Kelp[] = []
  private particles: Particle[] = []
  private snow: { x: number; y: number; z: number; s: number }[] = []
  private whale = { x: -9, dir: 1, next: 14, y: 0.4 }

  // Each creature keeps to its own home area so they never pile up: shark along the top, fish lower left, octopus
  // lower right, diver upper left, turtle along the bottom. Areas are laid out before the first resize, at A = 1.
  private readonly activity: Activity
  private readonly timeOfDay: Time

  constructor(settings: Settings) {
    super()
    const activity = settings.activity
    this.activity = activity
    this.timeOfDay = settings.time
    if (activity === "teeming") this.fish.push(this.makeFish("ambient:shark", "shark", [0.3, 1, 0.17, 0.33], { len: 0.64, z: 0.55 }))
    if (activity !== "calm") {
      this.fish.push(this.makeFish("ambient:fish", "fish", [0, 0.44, 0.48, 0.72], { len: 0.26, z: 0.35, hue: 0.07, sat: 0.85 }))
      const zone: Zone = [0.58, 1, 0.46, 0.7]
      const ox = ((zone[0] + zone[1]) / 2) * this.A
      this.octopus = { x: ox, y: 0.58, z: 0.4, vx: 0, vy: 0, size: 0.1, hue: 0.02, phase: 0, pulse: 0, next: 2, dir: -Math.PI / 2, wx: ox, wy: 0.58, zone }
    }
    if (activity === "teeming") {
      this.turtle = { x: 0.5 * this.A, y: 0.84, z: 0.4, vx: 0, vy: 0, face: -1, turn: -1, heading: -1, phase: 0, wx: 0.5 * this.A, wy: 0.84, wanderT: 0, zone: [0.22, 0.8, 0.78, 0.9] }
      this.diver = { x: 0.16 * this.A, y: 0.3, z: 0.45, vx: 0, vy: 0, face: 1, turn: 1, heading: 1, phase: 0, breath: 1.5, wx: 0.16 * this.A, wy: 0.3, wanderT: 0, zone: [0.02, 0.3, 0.2, 0.42] }
    }
    for (let i = 0; i < 70; i++) this.snow.push({ x: Math.random() * 4, y: Math.random(), z: Math.random(), s: Math.random() })
  }

  step(dt: number) {
    dt = clamp(dt, 0, 0.1) * TIME_SCALE
    this.time += dt
    for (const s of this.snow) {
      s.x += (0.006 + s.z * 0.012) * dt
      s.y += (0.004 + s.s * 0.008) * dt + Math.sin(this.time * 0.7 + s.s * 20) * 0.002 * dt
      if (s.x > this.A) s.x -= this.A
      if (s.y > 1) s.y -= 0.95
    }
    this.stepCreatures(dt * CREATURE_SPEED)
    this.stepWhale(dt)
    this.stepParticles(dt)
  }

  // Moves the fish, shark, turtle, diver and octopus; dt is creature time, so this also sets their animation speed.
  private stepCreatures(dt: number) {
    for (const f of this.fish) this.stepFish(f, dt)
    const tu = this.turtle
    if (tu) {
      const zx0 = tu.zone[0] * this.A + 0.15
      const zx1 = Math.max(zx0, tu.zone[1] * this.A - 0.15)
      tu.wanderT -= dt
      if (tu.wanderT <= 0 || Math.hypot(tu.wx - tu.x, tu.wy - tu.y) < 0.04) {
        tu.wanderT = rand(8, 14)
        tu.wx = rand(zx0, zx1)
        tu.wy = rand(tu.zone[2], tu.zone[3])
      }
      tu.phase += dt * 1.5
      const dx = tu.wx - tu.x
      const dy = tu.wy - tu.y
      const d = Math.hypot(dx, dy) || 1
      // Glides, with a push on each flipper downstroke.
      const speed = 0.03 * (0.5 + 0.9 * Math.max(0, Math.sin(tu.phase))) * Math.min(1, d / 0.1)
      tu.vx += ((dx / d) * speed - tu.vx) * Math.min(1, dt * 1.5)
      tu.vy += ((dy / d) * speed * 0.5 - tu.vy) * Math.min(1, dt * 1.5)
      tu.x = clamp(tu.x + tu.vx * dt, zx0, zx1)
      tu.y = clamp(tu.y + tu.vy * dt, tu.zone[2], tu.zone[3])
      steerTurn(tu, dx, 0.03, 1.2, dt)
    }
    const dv = this.diver
    if (dv) {
      const zx0 = dv.zone[0] * this.A + 0.12
      const zx1 = Math.max(zx0, dv.zone[1] * this.A - 0.12)
      dv.wanderT -= dt
      if (dv.wanderT <= 0 || Math.hypot(dv.wx - dv.x, dv.wy - dv.y) < 0.03) {
        dv.wanderT = rand(5, 10)
        dv.wx = rand(zx0, zx1)
        dv.wy = rand(dv.zone[2], dv.zone[3])
      }
      const dx = dv.wx - dv.x
      const dy = dv.wy - dv.y
      const d = Math.hypot(dx, dy) || 1
      const speed = 0.045 * Math.min(1, d / 0.1)
      dv.vx += ((dx / d) * speed - dv.vx) * Math.min(1, dt * 1.2)
      dv.vy += ((dy / d) * speed * 0.6 - dv.vy) * Math.min(1, dt * 1.2)
      dv.x = clamp(dv.x + dv.vx * dt, zx0, zx1)
      dv.y = clamp(dv.y + dv.vy * dt, dv.zone[2], dv.zone[3])
      steerTurn(dv, dx, 0.03, 1.6, dt)
      dv.phase += dt * (2.2 + Math.hypot(dv.vx, dv.vy) * 40)
      dv.breath -= dt
      if (dv.breath <= 0) {
        dv.breath = rand(2.4, 3.6)
        const [mx, my] = this.diverPoint(dv, 0.25, 0.02)
        for (let i = 0; i < 7; i++)
          this.spawn("bubble", mx / this.H + rand(-0.004, 0.004), my / this.H, rand(-0.01, 0.01), rand(-0.09, -0.04), 6, rand(0.003, 0.008), true)
      }
    }
    const o = this.octopus
    if (o) {
      o.phase += dt
      o.next -= dt
      if (o.next <= 0) {
        if (Math.hypot(o.wx - o.x, o.wy - o.y) < 0.12 || Math.random() < 0.3) {
          o.wx = rand(o.zone[0] * this.A + 0.12, o.zone[1] * this.A - 0.12)
          o.wy = rand(o.zone[2] + 0.04, o.zone[3] - 0.04)
        }
        const dx = o.wx - o.x
        const dy = o.wy - o.y
        const d = Math.hypot(dx, dy) || 1
        o.vx += (dx / d) * 0.11
        o.vy += (dy / d) * 0.11 - 0.02
        o.pulse = 1
        o.next = rand(2.5, 4.5)
      }
      o.pulse *= Math.exp(-dt * 2.2)
      o.vx *= Math.exp(-dt * 0.9)
      o.vy *= Math.exp(-dt * 0.9)
      o.vy += 0.006 * dt
      o.x = clamp(o.x + o.vx * dt, o.zone[0] * this.A + 0.1, o.zone[1] * this.A - 0.1)
      o.y = clamp(o.y + o.vy * dt, o.zone[2], Math.min(o.zone[3], this.floorAt(o.x) - 0.12))
      const speed = Math.hypot(o.vx, o.vy)
      const want = speed > 0.02 ? Math.atan2(o.vy, o.vx) : -Math.PI / 2
      let delta = want - o.dir
      while (delta > Math.PI) delta -= TAU
      while (delta < -Math.PI) delta += TAU
      o.dir += delta * Math.min(1, dt * (speed > 0.02 ? 2.5 : 0.6))
    }
  }

  render() {
    this.drawWater()
    this.drawWhale()
    this.drawSnow(true)
    // Nearer creatures (lower z) draw later, over farther ones.
    const fish = this.fish.toSorted((a, b) => b.z - a.z)
    for (const f of fish) if (f.z >= 0.5) this.drawCreature(f)
    for (const k of this.kelp) this.drawKelp(k)
    if (this.octopus) this.drawOctopus(this.octopus)
    if (this.diver) this.drawDiver(this.diver)
    if (this.turtle) this.drawTurtle(this.turtle)
    for (const f of fish) if (f.z < 0.5) this.drawCreature(f)
    this.drawParticles()
    this.drawSnow(false)
    if (this.timeOfDay === "sunset") this.gradeSunset()
    if (this.timeOfDay === "night") this.gradeNight()
    this.finish()
  }

  // Golden hour: everything warms, and the shallows glow with low orange light.
  private gradeSunset() {
    const { W, H, hdr } = this
    for (let y = 0; y < H; y++) {
      const glow = Math.exp(-y / (0.22 * H))
      for (let x = 0; x < W; x++) {
        const o = (y * W + x) * 3
        hdr[o] = hdr[o] * 1.3 + glow * 0.45
        hdr[o + 1] = hdr[o + 1] * 0.78 + glow * 0.16
        hdr[o + 2] = hdr[o + 2] * 0.5 + glow * 0.04
      }
    }
  }

  // Moonlit water: the scene dims to deep blue, then light sources draw on top. The moon glows through the surface,
  // marine snow becomes glowing plankton, and the diver's torch cuts through the dark.
  private gradeNight() {
    const { W, H, hdr } = this
    const mx = 0.3 * this.A * H
    const my = SURFACE * H
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const o = (y * W + x) * 3
        const moon = Math.exp(-Math.hypot(x - mx, (y - my) * 1.6) / (0.16 * H))
        hdr[o] = hdr[o] * 0.12 + moon * 0.3
        hdr[o + 1] = hdr[o + 1] * 0.2 + moon * 0.4
        hdr[o + 2] = hdr[o + 2] * 0.34 + moon * 0.55
      }
    for (const p of this.snow) {
      const pulse = Math.pow(0.5 + 0.5 * Math.sin(this.time * 1.5 + p.s * 50), 3)
      const k = (0.12 + p.s * 0.45) * pulse
      const green = p.s > 0.5
      if (p.s > 0.75) this.disc(p.x * H, p.y * H, 1.2, 0.1 * k * 4, (green ? 0.9 : 0.6) * k * 4, (green ? 0.6 : 1) * k * 4, 0.5)
      this.add(p.x * H, p.y * H, 0.1 * k, (green ? 0.9 : 0.6) * k, (green ? 0.6 : 1) * k)
    }
    if (this.diver) this.drawTorch(this.diver, 6)
  }

  protected override layout() {
    const { W, H, A } = this
    this.rowCol = new Float32Array(H * 3)
    this.rayFade = new Float32Array(H)
    const top: RGB = [0.1, 0.5, 0.58]
    const mid: RGB = [0.018, 0.17, 0.27]
    const deep: RGB = [0.004, 0.028, 0.07]
    for (let y = 0; y < H; y++) {
      const v = y / H
      const upper = v < 0.42
      const k = upper ? Math.pow(smoothstep(0, 0.42, v), 0.7) : smoothstep(0.42, 1, v)
      const from = upper ? top : mid
      const to = upper ? mid : deep
      for (let c = 0; c < 3; c++) this.rowCol[y * 3 + c] = lerp(from[c], to[c], k)
      this.rayFade[y] = Math.pow(1 - smoothstep(0.02, 0.92, v), 1.6) * 0.42
    }
    // An invisible seabed that keeps creatures off the bottom edge.
    this.floorPx = new Float32Array(W)
    for (let x = 0; x < W; x++) {
      const u = x / H
      this.floorPx[x] = (0.86 + (fbm1(u * 2.1, 3) - 0.5) * 0.08 + Math.sin(u * 6.3) * 0.006) * H
    }
    // Two ridgelines in the distance, padded so the slow camera sway never runs off their ends.
    this.pad = Math.ceil(H * 0.2)
    this.farPx = new Float32Array(W + this.pad * 2)
    this.midPx = new Float32Array(W + this.pad * 2)
    for (let x = 0; x < W + this.pad * 2; x++) {
      const u = (x - this.pad) / H
      const spires = Math.pow(noise1(u * 4.2, 9), 5) * 0.32
      this.farPx[x] = (0.56 - (fbm1(u * 1.4, 7) - 0.5) * 0.3 - spires) * H
      const arches = Math.pow(noise1(u * 6.5, 12), 7) * 0.25
      this.midPx[x] = (0.72 - (fbm1(u * 2.3, 11) - 0.5) * 0.2 - arches) * H
    }
    // Three kelp strands in the gaps between the creatures' areas.
    this.kelp = this.activity === "teeming" ? [[0.05, 0.28], [0.5, 0.21], [0.96, 0.3]].map(([x, height]) => ({ x: x * A, height, phase: x * 9 })) : []
    for (const f of this.fish) f.x = clamp(f.x * (A / this.lastA), 0.1, A - 0.1)
    this.lastA = A
  }

  private makeFish(id: string, species: Fish["species"], zone: Zone, look: { len: number; z: number; hue?: number; sat?: number }): Fish {
    const h = hashString(id)
    const side = h > 0.5 ? 1 : -1
    const x = ((zone[0] + zone[1]) / 2) * this.A
    const y = (zone[2] + zone[3]) / 2
    return { species, x, y, vx: 0, vy: 0, face: side, turn: side, heading: side, pitch: 0, hue: 0, sat: 0, ...look, phase: h * 10, wx: x, wy: y, wanderT: 0, zone }
  }

  private zScale(f: { z: number }) {
    return (1.12 - 0.45 * f.z) * CREATURE_SCALE
  }

  private fogAt(py: number): RGB {
    const y = clamp(py | 0, 0, this.H - 1) * 3
    return [this.rowCol[y], this.rowCol[y + 1], this.rowCol[y + 2]]
  }

  private floorAt(xu: number) {
    const px = clamp(Math.round(xu * this.H), 0, this.W - 1)
    return this.floorPx[px] / this.H
  }

  // Wanders between random points in its home area, steering away from other fish and the edges.
  private stepFish(f: Fish, dt: number) {
    const L = f.len * this.zScale(f)
    const tx = f.wx
    const ty = f.wy
    const speed = 0.07
    f.wanderT -= dt
    if (f.wanderT <= 0 || Math.hypot(f.wx - f.x, f.wy - f.y) < 0.05) {
      f.wanderT = rand(3, 8)
      const m = f.len * this.zScale(f) * 0.5
      f.wx = rand(f.zone[0] * this.A + m, Math.max(f.zone[0] * this.A + m, f.zone[1] * this.A - m))
      f.wy = rand(f.zone[2], f.zone[3])
    }
    const dx = tx - f.x
    const dy = ty - f.y
    const d = Math.hypot(dx, dy) || 1
    const arrive = Math.min(1, d / 0.15)
    let dvx = (dx / d) * speed * arrive
    let dvy = (dy / d) * speed * arrive * 0.7
    for (const o of this.fish) {
      if (o === f) continue
      const ox = f.x - o.x
      const oy = f.y - o.y
      const od = Math.hypot(ox, oy)
      const min = (L + o.len * this.zScale(o)) * 0.55
      if (od < min && od > 1e-4) {
        dvx += (ox / od) * (min - od) * 2.5
        dvy += (oy / od) * (min - od) * 2.5
      }
    }
    const top = SURFACE + 0.08
    const bottom = this.floorAt(f.x) - 0.07
    if (f.y < top) dvy += (top - f.y) * 4
    if (f.y > bottom) dvy -= (f.y - bottom) * 4
    if (f.x < 0.08) dvx += (0.08 - f.x) * 4
    if (f.x > this.A - 0.08) dvx -= (f.x - this.A + 0.08) * 4
    const m = L * 0.5
    const zx0 = f.zone[0] * this.A + m
    const zx1 = f.zone[1] * this.A - m
    if (f.x < zx0) dvx += (zx0 - f.x) * 3
    if (f.x > zx1) dvx -= (f.x - zx1) * 3
    if (f.y < f.zone[2]) dvy += (f.zone[2] - f.y) * 3
    if (f.y > f.zone[3]) dvy -= (f.y - f.zone[3]) * 3
    f.vx += (dvx - f.vx) * Math.min(1, dt * 1.6)
    f.vy += (dvy - f.vy) * Math.min(1, dt * 1.6)
    f.x += f.vx * dt
    f.y += f.vy * dt
    steerTurn(f, dvx, 0.015, f.species === "shark" ? 1.9 : 2.2, dt)
    const pitch = clamp(Math.atan2(f.vy, Math.abs(f.vx) + 0.02), -0.5, 0.5)
    f.pitch = lerp(f.pitch, pitch, 1 - Math.exp(-dt * 4))
    f.phase += dt * (3 + (Math.hypot(f.vx, f.vy) / L) * 4.5) * 0.6
  }

  // The whale waits offscreen (x < -5), then crosses in a random direction.
  private stepWhale(dt: number) {
    const w = this.whale
    if (w.x < -5) {
      w.next -= dt
      if (w.next > 0) return
      w.dir = Math.random() < 0.5 ? 1 : -1
      w.x = w.dir > 0 ? -0.9 : this.A + 0.9
      w.y = rand(0.3, 0.48)
      return
    }
    w.x += w.dir * 0.055 * dt
    if (w.x < -1 || w.x > this.A + 1) {
      w.x = -9
      w.next = rand(40, 75)
    }
  }

  // Most bubbles and sparks are skipped to keep the scene quiet; the diver's breath is always kept.
  private spawn(kind: Particle["kind"], x: number, y: number, vx: number, vy: number, life: number, size = 0.005, keep = false) {
    if (this.particles.length > 4000) return
    if (!keep && Math.random() < 0.65) return
    this.particles.push({ kind, x, y, vx, vy, life, max: life, size, seed: Math.random() * 100 })
  }

  // Bubbles rise and wobble, popping into a few sparks at the surface.
  private stepParticles(dt: number) {
    const ps = this.particles
    let w = 0
    for (let i = 0; i < ps.length; i++) {
      const p = ps[i]
      p.life -= dt
      if (p.kind === "bubble") {
        const rise = 0.06 + p.size * 9
        p.vy += (-rise - p.vy) * Math.min(1, dt * 2)
        p.vx *= Math.exp(-dt * 1.5)
        p.x += (p.vx + Math.sin(this.time * 4 + p.seed) * 0.01) * dt
        p.y += p.vy * dt
        if (p.y < SURFACE + 0.005) {
          p.life = 0
          if (p.size > 0.006) for (let j = 0; j < 3; j++) this.spawn("spark", p.x, SURFACE, rand(-0.05, 0.05), rand(-0.03, 0.02), 0.4)
        }
      }
      if (p.kind === "spark") {
        p.vx *= Math.exp(-dt * 2.2)
        p.vy *= Math.exp(-dt * 2.2)
        p.vy += 0.03 * dt
        p.x += p.vx * dt
        p.y += p.vy * dt
      }
      if (p.life > 0 && p.x > -0.5 && p.x < this.A + 0.5) ps[w++] = p
    }
    ps.length = w
  }

  private drawParticles() {
    const H = this.H
    for (const p of this.particles) {
      const x = p.x * H
      const y = p.y * H
      if (p.kind === "spark") {
        const k = p.life / p.max
        const i = k * k * 2.2
        this.add(x, y, 0.8 * i, i, i)
        continue
      }
      const R = Math.max(0.8, p.size * H)
      const fade = Math.min(1, (p.max - p.life) * 4)
      if (R < 1.3) {
        this.add(x, y, 0.25 * fade, 0.4 * fade, 0.45 * fade)
        continue
      }
      for (let yy = Math.floor(y - R - 1); yy <= y + R + 1; yy++)
        for (let xx = Math.floor(x - R - 1); xx <= x + R + 1; xx++) {
          if (xx < 0 || yy < 0 || xx >= this.W || yy >= this.H) continue
          const d = Math.hypot(xx + 0.5 - x, yy + 0.5 - y)
          if (d > R + 0.7) continue
          const ring = clamp(1 - Math.abs(d - R + 0.4) * 1.1, 0, 1)
          const i = (yy * this.W + xx) * 3
          const a = (0.07 + ring * 0.55) * fade
          this.hdr[i] += (0.55 - this.hdr[i]) * a * 0.6 + ring * 0.05
          this.hdr[i + 1] += (0.9 - this.hdr[i + 1]) * a * 0.6 + ring * 0.08
          this.hdr[i + 2] += (1 - this.hdr[i + 2]) * a * 0.6 + ring * 0.1
        }
      this.add(x - R * 0.35, y - R * 0.35, 1.3 * fade, 1.4 * fade, 1.4 * fade)
    }
  }

  // Depth-graded water with god rays, distant ridges, and a bright rippling surface with caustics.
  private drawWater() {
    const { W, H, hdr, rowCol, rayFade, farPx, midPx } = this
    const t = this.time
    const surf = SURFACE * H
    const camFar = Math.round(Math.sin(t * 0.09) * H * 0.04) + this.pad
    const camMid = Math.round(Math.sin(t * 0.09) * H * 0.08) + this.pad
    const cs = 128 / (H * 0.55)
    for (let y = 0; y < H; y++) {
      const rf = rayFade[y]
      const ry1 = y * 0.42 + t * 7
      const ry2 = y * 0.6 - t * 4.3
      const flick = 0.75 + 0.25 * Math.sin(t * 0.8 + y * 0.01)
      for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 3
        const sl = surf + Math.sin(x * 0.045 + t * 1.3) * 1.4 + Math.sin(x * 0.13 - t * 2.1) * 0.7
        if (y < sl) {
          const cu = ((x * 0.6 * cs + t * 9) | 0) & 127
          const cv = ((y * 4 * cs + x * 0.2 * cs - t * 6) | 0) & 127
          const c = CAUSTICS[cv * CAUS_N + cu]
          const win = Math.exp(-Math.pow((x / W - 0.5) * 2.2, 2)) * 0.6
          const edge = smoothstep(sl - 3, sl, y)
          hdr[i] = 0.2 + c * 0.45 + win * 0.5 + edge * 0.4
          hdr[i + 1] = 0.55 + c * 0.6 + win * 0.7 + edge * 0.6
          hdr[i + 2] = 0.62 + c * 0.6 + win * 0.6 + edge * 0.6
          continue
        }
        let r = rowCol[y * 3]
        let g = rowCol[y * 3 + 1]
        let b = rowCol[y * 3 + 2]
        const far = farPx[x + camFar]
        if (y > far) {
          const k = smoothstep(far, far + 3, y)
          r = lerp(r, r * 0.55 + 0.004, k)
          g = lerp(g, g * 0.62 + 0.016, k)
          b = lerp(b, b * 0.7 + 0.03, k)
        }
        const near = midPx[x + camMid]
        if (y > near) {
          const k = smoothstep(near, near + 2, y)
          r = lerp(r, r * 0.35, k)
          g = lerp(g, g * 0.42, k)
          b = lerp(b, b * 0.5, k)
        }
        const ray = RAYS_A[((x + ry1) | 0) & 1023] * (0.45 + 0.55 * RAYS_B[((x * 0.7 + ry2) | 0) & 1023]) * rf * flick
        hdr[i] = r + ray * 0.5
        hdr[i + 1] = g + ray * 0.85
        hdr[i + 2] = b + ray * 0.85
      }
    }
  }

  // A huge, faint silhouette tinted by the water at its depth, with a slow tail beat.
  private drawWhale() {
    const w = this.whale
    if (w.x < -5) return
    const { W, H, hdr } = this
    const t = this.time
    const L = 1.15 * H
    const px = w.x * H
    const py = w.y * H + Math.sin(t * 0.3) * H * 0.01
    const face = w.dir
    const fog = this.fogAt(py)
    const x0 = Math.max(0, Math.floor(px - L * 0.65))
    const x1 = Math.min(W - 1, Math.ceil(px + L * 0.65))
    const y0 = Math.max(0, Math.floor(py - L * 0.2))
    const y1 = Math.min(H - 1, Math.ceil(py + L * 0.3))
    const phase = t * 0.9
    for (let y = y0; y <= y1; y++) {
      const dy = y + 0.5 - py
      for (let x = x0; x <= x1; x++) {
        const along = (x + 0.5 - px) * face
        const u = 0.45 - along / L
        if (u < -0.02 || u > 1.02) continue
        const bend = Math.sin(phase - u * 3) * 0.035 * u * u
        const v = dy / L - bend
        const bu = clamp((u + 0.02) / 0.86, 0, 1)
        const hb = 0.105 * Math.pow(Math.sin(Math.PI * bu), 0.5) * (1 - u * 0.35)
        let cov = 0
        let shade = 0
        if (u < 0.86) {
          const d = (Math.abs(v - hb * 0.15) - hb) * L
          cov = clamp(0.5 - d, 0, 1)
          const n = clamp((v - hb * 0.15) / hb, -1, 1)
          shade = 0.55 + 0.45 * (n > 0.3 ? 1 : 0) * 0.5 + (n > 0.35 && Math.sin(u * 140) > 0.4 ? -0.08 : 0)
        }
        // tail flukes
        if (u > 0.8) {
          const tt = (u - 0.8) / 0.2
          const half = 0.012 + 0.09 * Math.pow(tt, 1.6)
          const center = Math.sin(phase - 2.4) * 0.03
          const d = (Math.abs(v - center) - half) * L
          const c2 = clamp(0.5 - d, 0, 1) * (u < 1 ? 1 : 0)
          if (c2 > cov) {
            cov = c2
            shade = 0.6
          }
        }
        // pectoral fin
        const fu = (u - 0.33) / 0.22
        const fv = v - 0.07 - fu * 0.12 - Math.sin(phase * 0.8) * 0.01
        if (fu > 0 && fu < 1 && Math.abs(fv) < 0.025 * Math.sin(Math.PI * Math.pow(fu, 0.6))) {
          cov = Math.max(cov, 0.95)
          shade = 0.5
        }
        if (cov <= 0) continue
        const i = (y * W + x) * 3
        const a = cov * 0.62
        hdr[i] += (fog[0] * 0.42 * shade - hdr[i]) * a
        hdr[i + 1] += (fog[1] * 0.5 * shade - hdr[i + 1]) * a
        hdr[i + 2] += (fog[2] * 0.6 * shade - hdr[i + 2]) * a
      }
    }
  }

  // Marine snow: faint specks behind the whale's depth, a few brighter flakes in front.
  private drawSnow(back: boolean) {
    const H = this.H
    for (const s of this.snow) {
      if (back !== s.z > 0.35) continue
      const tw = 0.6 + 0.4 * Math.sin(this.time * 2 + s.s * 40)
      const k = (back ? 0.08 + (1 - s.z) * 0.1 : 0.25) * tw
      if (!back && s.s > 0.7) this.disc(s.x * H, s.y * H, 1.1, 0.6 + k, 0.75 + k, 0.8 + k, 0.35)
      else this.add(s.x * H, s.y * H, k * 0.8, k, k)
    }
  }
  // Swaying kelp: a stem of overlapping discs with leaf blades on alternating sides, rooted below the screen.
  private drawKelp(k: Kelp) {
    const H = this.H
    const t = this.time
    const segs = 16
    const width = 0.006
    const baseY = H * 1.04
    const fog = this.fogAt(baseY - k.height * H * 0.5)
    let px = k.x * H
    let py = baseY
    for (let s = 1; s <= segs; s++) {
      const tt = s / segs
      const sway =
        (Math.sin(t * 0.9 + k.phase + tt * 2.4) * 0.04 + Math.sin(t * 0.37 + k.phase * 2 + tt) * 0.025 + Math.sin(t * 1.7 + tt * 6) * 0.006) *
        Math.pow(tt, 1.3)
      const nx = (k.x + sway) * H
      const ny = baseY - tt * k.height * H
      const w = width * H * (1 - tt * 0.55)
      let [r, g, b] = hsv(0.24, 0.62, 0.1 + tt * 0.26)
      r = lerp(r, fog[0], 0.3)
      g = lerp(g, fog[1], 0.3)
      b = lerp(b, fog[2], 0.3)
      const stem = Math.max(0.6, w * 0.55)
      const steps = Math.max(1, Math.ceil(Math.hypot(nx - px, ny - py) / Math.max(0.5, stem * 0.6)))
      for (let j = 0; j < steps; j++) {
        const u = j / steps
        this.disc(lerp(px, nx, u), lerp(py, ny, u), stem, r, g, b, 1)
      }
      if (s % 2 === 0 && s < segs) {
        const side = s % 4 === 0 ? 1 : -1
        const dirA = side * (0.75 - tt * 0.3) + Math.sin(t * 1.1 + k.phase + s * 0.7) * 0.25
        const bladeL = w * 7 * (1 - tt * 0.3)
        const n = Math.max(3, Math.ceil(bladeL / Math.max(0.6, w * 0.35)))
        const lr = r * 1.25 + 0.02
        const lg = g * 1.3 + 0.03
        const lb = b * 1.1
        for (let j = 0; j <= n; j++) {
          const q = j / n
          const bend = dirA * (1 + q * 0.6)
          const lx = nx + Math.sin(bend) * bladeL * q
          const ly = ny - Math.cos(bend) * bladeL * q
          const rad = Math.max(0.5, w * 0.95 * Math.sin(Math.PI * Math.min(0.98, q * 0.9 + 0.08)))
          this.disc(lx, ly, rad, lr * (0.85 + q * 0.3), lg * (0.85 + q * 0.3), lb * (0.85 + q * 0.3), 0.88)
        }
      }
      px = nx
      py = ny
    }
  }

  private drawCreature(f: Fish) {
    if (f.species === "shark") this.drawShark(f)
    else this.drawFish(f)
  }

  // A side-on reef fish with banded body, fins, eye and glowing fin edges. Surfaces stay flat because finer detail
  // aliases into crawling pixels at terminal-cell resolution.
  private drawFish(f: Fish) {
    const { W, H, hdr } = this
    const Lp = f.len * this.zScale(f) * H
    if (Lp < 3) return
    const px = f.x * H
    const py = f.y * H
    const sgn = f.face < 0 ? -1 : 1
    const face = Math.abs(f.face) < 0.14 ? 0.14 * sgn : f.face
    const ang = f.pitch * sgn * Math.min(1, Math.abs(f.face) * 1.5)
    const ca = Math.cos(ang)
    const sa = Math.sin(ang)
    const fog = this.fogAt(py)
    const fogK = 0.08 + f.z * 0.42
    const bodyH = 0.21
    const bendAmp = 0.05 * 0.5
    const tailEnd = 1.22
    const tailBase = 0.74
    const back = hsv(f.hue - 0.02, Math.min(1, f.sat * 1.1), 0.5)
    const belly = hsv(f.hue + 0.07, f.sat * 0.55, 0.95)
    const fin = hsv(f.hue + 0.05, Math.min(1, f.sat * 1.05), 0.85)
    const neon = hsv(f.hue, 0.7, 1)
    const x0 = Math.max(0, Math.floor(px - Lp))
    const x1 = Math.min(W - 1, Math.ceil(px + Lp))
    const y0 = Math.max(0, Math.floor(py - Lp * 0.75))
    const y1 = Math.min(H - 1, Math.ceil(py + Lp * 0.75))
    const invL = 1 / Lp
    const invLF = 1 / (Lp * face)
    const flap = Math.sin(f.phase * 1.7) * 0.02
    for (let y = y0; y <= y1; y++) {
      const dy = y + 0.5 - py
      for (let x = x0; x <= x1; x++) {
        const dx = x + 0.5 - px
        const along = dx * ca + dy * sa
        const perp = -dx * sa + dy * ca
        const u = 0.42 - along * invLF
        if (u < -0.06 || u > tailEnd + 0.02) continue
        const vb = perp * invL - bendAmp * Math.sin(f.phase - u * 5) * u * u
        const avb = Math.abs(vb)
        let pr = 0
        let pg = 0
        let pb = 0
        let pa = 0
        let er = 0
        let eg = 0
        let eb = 0

        // tail fin
        if (u > tailBase) {
          const tt = (u - tailBase) / (tailEnd - tailBase)
          const maxHalf = 0.28
          let half = 0.035 + maxHalf * Math.pow(tt, 0.85)
          half += Math.sin(tt * 7 - f.phase * 1.3) * 0.018 * tt
          let d = (avb - half) * Lp
          const notch = 0.2 * (1 - Math.min(1, avb / maxHalf) ** 2)
          d = Math.max(d, (u - (tailEnd - notch)) * Lp * Math.abs(face))
          const cov = clamp(0.5 - d, 0, 1)
          if (cov > 0) {
            const fa = cov * (0.62 + 0.3 * (1 - tt))
            pr = fin[0] * 0.85 * fa
            pg = fin[1] * 0.85 * fa
            pb = fin[2] * 0.85 * fa
            pa = fa
            const edge = clamp(1 - Math.abs(d + 1.2) / 1.3, 0, 1) * cov
            er += neon[0] * edge * 0.9
            eg += neon[1] * edge * 0.9
            eb += neon[2] * edge * 0.9
          }
        }

        const bu = clamp((u + 0.03) / 0.83, 0, 1)
        const hb = bodyH * Math.pow(Math.sin(Math.PI * bu), 0.62)

        // dorsal fin
        if (u > 0.2 && u < 0.64 && vb < 0) {
          const fk = (u - 0.2) / 0.44
          const fh = 0.17 * Math.pow(Math.sin(Math.PI * fk), 0.8) * (1 - fk * 0.3)
          const d = (-vb - hb - fh) * Lp
          const cov = clamp(0.5 - d, 0, 1)
          if (cov > 0 && -vb > hb - 0.02) {
            const fa = cov * 0.7
            pr = fin[0] * 0.85 * fa + pr * (1 - fa)
            pg = fin[1] * 0.85 * fa + pg * (1 - fa)
            pb = fin[2] * 0.85 * fa + pb * (1 - fa)
            pa = fa + pa * (1 - fa)
            const edge = clamp(1 - Math.abs(d + 1) / 1.2, 0, 1) * cov
            er += neon[0] * edge * 0.7
            eg += neon[1] * edge * 0.7
            eb += neon[2] * edge * 0.7
          }
        }
        // anal fin
        if (u > 0.5 && u < 0.72 && vb > 0) {
          const fk = (u - 0.5) / 0.22
          const d = (vb - hb - 0.065 * Math.sin(Math.PI * fk)) * Lp
          const cov = clamp(0.5 - d, 0, 1)
          if (cov > 0 && vb > hb - 0.02) {
            const fa = cov * 0.65
            pr = fin[0] * fa + pr * (1 - fa)
            pg = fin[1] * fa + pg * (1 - fa)
            pb = fin[2] * fa + pb * (1 - fa)
            pa = fa + pa * (1 - fa)
          }
        }

        // body, with white bands
        if (u < 0.82) {
          const d = (avb - hb) * Lp
          const cov = clamp(0.5 - d, 0, 1)
          if (cov > 0) {
            const n = hb > 0 ? clamp(vb / hb, -1, 1) : 0
            const k = smoothstep(-0.55, 0.65, n)
            let r = back[0] + (belly[0] - back[0]) * k
            let g = back[1] + (belly[1] - back[1]) * k
            let b = back[2] + (belly[2] - back[2]) * k
            const band = Math.abs(Math.sin(u * Math.PI * 3.2 + 0.4))
            const m = smoothstep(0.82, 0.9, band)
            const bandEdge = smoothstep(0.75, 0.82, band) - m
            r = r * (1 - m) + m - bandEdge * 0.5 * r
            g = g * (1 - m) + m - bandEdge * 0.5 * g
            b = b * (1 - m) + m - bandEdge * 0.5 * b
            const cyl = Math.sqrt(1 - n * n)
            const light = 0.42 + 0.78 * cyl * (0.75 + 0.25 * (1 - n) * 0.5)
            r *= light
            g *= light
            b *= light
            const spec = Math.pow(Math.max(0, 1 - Math.abs(n + 0.5) * 2.8), 4) * 0.4
            r += spec
            g += spec
            b += spec
            const rim = Math.pow(Math.abs(n), 8) * 0.4
            r += rim * 0.3
            g += rim * 0.75
            b += rim * 0.85
            // gill line and mouth
            if (Math.abs(u - 0.22 - 0.05 * n * n) < 0.011 && Math.abs(n) < 0.8) {
              r *= 0.55
              g *= 0.55
              b *= 0.55
            }
            if (u < 0.035 && Math.abs(vb - 0.035) < 0.008) {
              r *= 0.3
              g *= 0.3
              b *= 0.3
            }
            // eye
            const eu = (u - 0.1) * Math.abs(face)
            const ev = vb + 0.035
            const ed = Math.sqrt(eu * eu + ev * ev)
            const er0 = 0.034
            if (ed < er0) {
              if (ed < er0 * 0.55) {
                r = 0.02
                g = 0.02
                b = 0.04
                const gx = eu + 0.006 * Math.sign(face)
                const gy = ev + 0.008
                if (gx * gx + gy * gy < 0.00006) {
                  er += 2.5
                  eg += 2.5
                  eb += 2.5
                }
              } else if (ed < er0 * 0.78) {
                r = neon[0] * 0.9
                g = neon[1] * 0.9
                b = neon[2] * 0.9
              } else {
                r = 0.92
                g = 0.94
                b = 0.9
              }
            }
            const outline = 1 - clamp(1.6 + d, 0, 1) * 0.55
            r *= outline
            g *= outline
            b *= outline
            pr = r * cov + pr * (1 - cov)
            pg = g * cov + pg * (1 - cov)
            pb = b * cov + pb * (1 - cov)
            pa = cov + pa * (1 - cov)
          }
        }

        // pectoral fin
        {
          const cu = (u - 0.3) * Math.abs(face)
          const cv = vb - 0.05 - flap
          const ru = cu * 0.92 + cv * 0.4
          const rv = -cu * 0.4 + cv * 0.92
          const e = (ru * ru) / 0.0049 + (rv * rv) / 0.0005
          if (e < 1) {
            const fa = clamp((1 - e) * 4, 0, 1) * 0.55
            pr = fin[0] * 1.1 * fa + pr * (1 - fa)
            pg = fin[1] * 1.1 * fa + pg * (1 - fa)
            pb = fin[2] * 1.1 * fa + pb * (1 - fa)
            pa = fa + pa * (1 - fa)
          }
        }

        if (pa <= 0.001 && er + eg + eb <= 0) continue
        pr += (fog[0] * pa - pr) * fogK
        pg += (fog[1] * pa - pg) * fogK
        pb += (fog[2] * pa - pb) * fogK
        const i = (y * W + x) * 3
        hdr[i] = hdr[i] * (1 - pa) + pr + er
        hdr[i + 1] = hdr[i + 1] * (1 - pa) + pg + eg
        hdr[i + 2] = hdr[i + 2] * (1 - pa) + pb + eb
      }
    }
  }

  private drawShark(f: Fish) {
    const { W, H, hdr } = this
    const Lp = f.len * this.zScale(f) * H
    if (Lp < 2) return
    const px = f.x * H
    const py = f.y * H
    const sgn = f.face < 0 ? -1 : 1
    const face = Math.abs(f.face) < 0.14 ? 0.14 * sgn : f.face
    const ang = f.pitch * sgn * Math.min(1, Math.abs(f.face) * 1.5)
    const ca = Math.cos(ang)
    const sa = Math.sin(ang)
    const fog = this.fogAt(py)
    const fogK = 0.08 + f.z * 0.42
    const back: RGB = [0.27, 0.35, 0.43]
    const belly: RGB = [0.86, 0.88, 0.87]
    const x0 = Math.max(0, Math.floor(px - Lp * 0.8))
    const x1 = Math.min(W - 1, Math.ceil(px + Lp * 0.8))
    const y0 = Math.max(0, Math.floor(py - Lp * 0.5))
    const y1 = Math.min(H - 1, Math.ceil(py + Lp * 0.5))
    const invL = 1 / Lp
    const invLF = 1 / (Lp * face)
    const af = Math.abs(face)
    for (let y = y0; y <= y1; y++) {
      const dy = y + 0.5 - py
      for (let x = x0; x <= x1; x++) {
        const dx = x + 0.5 - px
        const along = dx * ca + dy * sa
        const perp = -dx * sa + dy * ca
        const u = 0.4 - along * invLF
        if (u < -0.04 || u > 1.12) continue
        const vb = perp * invL - 0.045 * Math.sin(f.phase - u * 4.5) * u * u
        const bu = clamp((u + 0.02) / 0.84, 0, 1)
        const hb = 0.105 * Math.pow(Math.sin(Math.PI * bu), 0.85)
        let cov = 0
        let r = 0
        let g = 0
        let b = 0
        const fin = (c: number, tone: number) => {
          if (c <= cov) return
          cov = c
          r = back[0] * tone
          g = back[1] * tone
          b = back[2] * tone
        }
        // tail: tall upper lobe, short lower lobe, crescent trailing edge
        if (u > 0.78) {
          const tt = (u - 0.78) / 0.32
          const c0 = -0.07 * tt
          const v = vb - c0
          const upper = 0.02 + 0.21 * Math.pow(tt, 1.1)
          const lower = 0.02 + 0.11 * Math.pow(tt, 1.3)
          let d = (v < 0 ? -v - upper : v - lower) * Lp
          const reach = v < 0 ? upper : lower
          d = Math.max(d, (u - (1.1 - 0.13 * (1 - Math.min(1, Math.abs(v) / reach) ** 2))) * Lp * af)
          fin(clamp(0.5 - d, 0, 1), 0.92)
        }
        // first dorsal, swept back
        if (u > 0.3 && u < 0.56 && vb < 0) {
          const k = (u - 0.3) / 0.26
          const fh = 0.2 * (k < 0.4 ? k / 0.4 : Math.pow(1 - (k - 0.4) / 0.6, 1.7))
          if (-vb > hb - 0.02) fin(clamp(0.5 - (-vb - hb - fh) * Lp, 0, 1), 0.9)
        }
        // second dorsal and anal fins
        if (u > 0.7 && u < 0.79 && vb < 0 && -vb > hb - 0.01) fin(clamp(0.5 - (-vb - hb - 0.045 * Math.sin(((u - 0.7) / 0.09) * Math.PI)) * Lp, 0, 1), 0.9)
        if (u > 0.68 && u < 0.77 && vb > 0 && vb > hb - 0.01) fin(clamp(0.5 - (vb - hb - 0.035 * Math.sin(((u - 0.68) / 0.09) * Math.PI)) * Lp, 0, 1), 0.8)
        // long pectoral fin, swept down and back
        {
          const cu = (u - 0.36) * af
          const cv = vb - 0.1
          const ru = cu * 0.7 - cv * 0.71
          const rv = cu * 0.71 + cv * 0.7
          const e = (ru * ru) / 0.012 + (rv * rv) / 0.0011
          if (e < 1.2) fin(clamp((1.2 - e) * 4, 0, 1), 0.78)
        }
        // body
        const d = (Math.abs(vb) - hb) * Lp
        const bc = clamp(0.5 - d, 0, 1)
        if (bc > 0) {
          const n = hb > 0 ? clamp(vb / hb, -1, 1) : 0
          const k = smoothstep(0.08, 0.32, n)
          let br = back[0] + (belly[0] - back[0]) * k
          let bg = back[1] + (belly[1] - back[1]) * k
          let bb = back[2] + (belly[2] - back[2]) * k
          const light = 0.5 + 0.7 * Math.sqrt(1 - n * n) * (0.8 + 0.2 * (1 - n) * 0.5)
          br *= light
          bg *= light
          bb *= light
          const spec = Math.pow(Math.max(0, 1 - Math.abs(n + 0.55) * 3), 4) * 0.35
          br += spec
          bg += spec
          bb += spec
          for (let j = 0; j < 5; j++)
            if (Math.abs(u - 0.21 - j * 0.019 - n * 0.01) < 0.0035 && n > -0.55 && n < 0.4) {
              br *= 0.55
              bg *= 0.55
              bb *= 0.55
            }
          const eu = (u - 0.1) * af
          const ev = vb + 0.025
          if (eu * eu + ev * ev < 0.00022) {
            br = 0.03
            bg = 0.03
            bb = 0.04
            if ((eu + 0.004 * sgn) ** 2 + (ev + 0.005) ** 2 < 0.00002) br = bg = bb = 1.4
          }
          if (u > 0.03 && u < 0.13 && Math.abs(n - 0.62 - (u - 0.08) * 1.5) < 0.07) {
            br *= 0.5
            bg *= 0.5
            bb *= 0.5
          }
          const outline = 1 - clamp(1.6 + d, 0, 1) * 0.5
          if (bc >= cov || bc > 0.5) {
            r = br * outline
            g = bg * outline
            b = bb * outline
            cov = Math.max(cov, bc)
          }
        }
        if (cov <= 0) continue
        r += (fog[0] - r) * fogK
        g += (fog[1] - g) * fogK
        b += (fog[2] - b) * fogK
        const i = (y * W + x) * 3
        hdr[i] += (r - hdr[i]) * cov
        hdr[i + 1] += (g - hdr[i + 1]) * cov
        hdr[i + 2] += (b - hdr[i + 2]) * cov
      }
    }
  }

  private turtleLength() {
    return 0.36 * this.H * CREATURE_SCALE * (1.12 - 0.45 * (this.turtle?.z ?? 0.4))
  }

  // Turtle-local point (u toward the head, v down, in body lengths) to screen pixels.
  private turtlePoint(tu: Turtle, u: number, v: number): [number, number] {
    const L = this.turtleLength()
    const face = Math.abs(tu.face) < 0.15 ? 0.15 * (tu.face < 0 ? -1 : 1) : tu.face
    const tilt = clamp(tu.vy * 5, -0.2, 0.2) * Math.sign(face) * Math.min(1, Math.abs(face) * 1.5)
    const ax = u * L * face
    const ay = v * L
    return [tu.x * this.H + ax * Math.cos(tilt) - ay * Math.sin(tilt), tu.y * this.H + ax * Math.sin(tilt) + ay * Math.cos(tilt)]
  }

  private drawTurtle(tu: Turtle) {
    const L = this.turtleLength()
    if (L < 3) return
    const squash = Math.max(0.3, Math.abs(tu.face))
    const blob = (x: number, y: number, rad: number, r: number, g: number, b: number) => this.ellipse(x, y, rad * squash, rad, r, g, b, 1)
    const H = this.H
    const fog = this.fogAt(tu.y * H)
    const fogK = 0.08 + tu.z * 0.42
    const tint = (c: RGB): RGB => [c[0] + (fog[0] - c[0]) * fogK, c[1] + (fog[1] - c[1]) * fogK, c[2] + (fog[2] - c[2]) * fogK]
    const skin: RGB = [0.42, 0.48, 0.32]
    const skinFar: RGB = [0.26, 0.3, 0.2]
    const stroke = Math.sin(tu.phase)

    // A flipper: a curved paddle from its root, swept back and rotated by the stroke.
    const flipper = (u0: number, v0: number, length: number, angle: number, width: number, color: RGB) => {
      const [r, g, b] = tint(color)
      let u = u0
      let v = v0
      let a = angle
      const n = 14
      for (let s = 0; s <= n; s++) {
        const q = s / n
        const w = width * Math.sin(Math.PI * Math.min(0.97, 0.12 + q * 0.88)) * (1 - q * 0.35)
        const [x, y] = this.turtlePoint(tu, u, v)
        blob(x, y, Math.max(0.6, w * L), r, g, b)
        u += Math.cos(a) * (length / n)
        v += Math.sin(a) * (length / n)
        a += 0.04
      }
    }
    const front = Math.PI - 0.55 - stroke * 0.6
    const back = Math.PI - 0.25 - stroke * 0.25

    flipper(0.14, 0.03, 0.4, front - 0.25, 0.055, skinFar)
    flipper(-0.2, 0.03, 0.17, back - 0.2, 0.04, skinFar)

    // Shell: domed carapace with plate seams over a flatter, pale plastron.
    {
      const a = 0.33 * L
      const top = 0.17 * L
      const bottom = 0.07 * L
      const [cx, cy] = this.turtlePoint(tu, 0, 0)
      const R = Math.ceil(a + 2)
      const face = Math.abs(tu.face) < 0.15 ? 0.15 * (tu.face < 0 ? -1 : 1) : tu.face
      const tilt = clamp(tu.vy * 5, -0.2, 0.2) * Math.sign(face) * Math.min(1, Math.abs(face) * 1.5)
      const ct = Math.cos(tilt)
      const st = Math.sin(tilt)
      for (let y = Math.max(0, Math.floor(cy - R)); y <= Math.min(H - 1, cy + R); y++)
        for (let x = Math.max(0, Math.floor(cx - R)); x <= Math.min(this.W - 1, cx + R); x++) {
          const dx = x + 0.5 - cx
          const dy = y + 0.5 - cy
          const su = (dx * ct + dy * st) / (a * face)
          const vv = -dx * st + dy * ct
          const sv = vv < 0 ? vv / top : vv / bottom
          const e = su * su + sv * sv
          if (e > 1.1) continue
          const cov = clamp((1 - e) * a * 0.35 + 0.5, 0, 1)
          let c: RGB
          if (vv < 0) {
            const plate = Math.floor(su * 2.5 + 3) + (sv < -0.55 + 0.1 * su * su ? 10 : 0)
            const seam =
              Math.abs(Math.sin(su * Math.PI * 1.25 + sv * 0.6)) < 0.16 || Math.abs(sv + 0.55 - 0.1 * su * su) < 0.08 || (e > 0.8 && Math.abs(Math.sin(Math.atan2(sv, su) * 9)) < 0.25)
            const lightness = (0.75 + hash(plate * 3.7) * 0.35) * (0.7 + 0.45 * -sv)
            c = seam ? [0.16, 0.12, 0.06] : [0.44 * lightness, 0.36 * lightness, 0.17 * lightness]
          } else c = Math.abs(Math.sin(su * Math.PI * 1.5)) < 0.12 ? [0.5, 0.44, 0.28] : [0.78, 0.7, 0.45]
          const [r, g, b] = tint(c)
          this.blend((y * this.W + x) * 3, r, g, b, cov)
        }
    }

    flipper(-0.2, 0.05, 0.18, back, 0.045, skin)
    // neck and head
    {
      const [r, g, b] = tint(skin)
      for (let s = 0; s <= 8; s++) {
        const k = s / 8
        const [x, y] = this.turtlePoint(tu, 0.28 + k * 0.12, -0.01 - k * 0.01)
        blob(x, y, Math.max(0.6, (0.05 - k * 0.008) * L), r, g, b)
      }
      const [hx, hy] = this.turtlePoint(tu, 0.44, -0.025)
      blob(hx, hy, Math.max(1, 0.062 * L), r, g, b)
      const [bx, by] = this.turtlePoint(tu, 0.5, -0.01)
      const [br, bg2, bb] = tint([0.3, 0.32, 0.22])
      blob(bx, by, Math.max(0.7, 0.03 * L), br, bg2, bb)
      const [ex, ey] = this.turtlePoint(tu, 0.465, -0.045)
      blob(ex, ey, Math.max(0.7, 0.014 * L), 0.03, 0.03, 0.03)
    }
    flipper(0.14, 0.05, 0.42, front, 0.06, skin)
  }

  // Diver-local point (u along the body toward the head, v down) to screen pixels; the facing squash turns him around.
  private diverPoint(dv: Diver, u: number, v: number): [number, number] {
    const L = this.diverLength(dv)
    const face = Math.abs(dv.face) < 0.15 ? 0.15 * (dv.face < 0 ? -1 : 1) : dv.face
    const tilt = clamp(dv.vy * 4, -0.25, 0.25) * Math.sign(face) * Math.min(1, Math.abs(face) * 1.5)
    const ax = u * L * face
    const ay = v * L
    return [dv.x * this.H + ax * Math.cos(tilt) - ay * Math.sin(tilt), dv.y * this.H + ax * Math.sin(tilt) + ay * Math.cos(tilt)]
  }

  private diverLength(dv: Diver) {
    return 0.46 * this.H * CREATURE_SCALE * (1.12 - 0.45 * dv.z)
  }

  // The torch beam, faint and warm, from the hand forward; it dims as the diver turns edge-on.
  private drawTorch(dv: Diver, strength: number) {
    const beam = Math.pow(Math.abs(dv.face), 2)
    if (beam <= 0.02) return
    const [hx, hy] = this.diverPoint(dv, 0.3, 0.07)
    const [tx, ty] = this.diverPoint(dv, 1.3, 0.2)
    const len = Math.hypot(tx - hx, ty - hy)
    const ux = (tx - hx) / len
    const uy = (ty - hy) / len
    const x0 = Math.max(0, Math.floor(Math.min(hx, tx) - len * 0.35))
    const x1 = Math.min(this.W - 1, Math.ceil(Math.max(hx, tx) + len * 0.35))
    const y0 = Math.max(0, Math.floor(Math.min(hy, ty) - len * 0.35))
    const y1 = Math.min(this.H - 1, Math.ceil(Math.max(hy, ty) + len * 0.35))
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) {
        const dx = x + 0.5 - hx
        const dy = y + 0.5 - hy
        const along = dx * ux + dy * uy
        if (along <= 0 || along > len) continue
        const across = Math.abs(-dx * uy + dy * ux)
        const width = along * 0.3 + 1
        if (across > width) continue
        const k = (1 - along / len) * Math.pow(1 - across / width, 2) * 0.14 * beam * strength
        this.add(x, y, k * 1, k * 0.95, k * 0.75)
      }
  }

  private drawDiver(dv: Diver) {
    const L = this.diverLength(dv)
    if (L < 3) return
    // Body parts narrow with the turn and the torch dims edge-on, so turning around stays one smooth motion.
    const squash = Math.max(0.3, Math.abs(dv.face))
    const fog = this.fogAt(dv.y * this.H)
    const fogK = 0.08 + dv.z * 0.42
    const tint = (c: RGB): RGB => [c[0] + (fog[0] - c[0]) * fogK, c[1] + (fog[1] - c[1]) * fogK, c[2] + (fog[2] - c[2]) * fogK]
    const limb = (u0: number, v0: number, u1: number, v1: number, r0: number, r1: number, color: RGB) => {
      const [x0, y0] = this.diverPoint(dv, u0, v0)
      const [x1, y1] = this.diverPoint(dv, u1, v1)
      const steps = Math.max(2, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 0.6))
      const [r, g, b] = tint(color)
      for (let j = 0; j <= steps; j++) {
        const k = j / steps
        const rad = Math.max(0.6, lerp(r0, r1, k) * L)
        this.ellipse(lerp(x0, x1, k), lerp(y0, y1, k), rad * squash, rad, r, g, b, 1)
      }
    }
    const suit: RGB = [0.07, 0.08, 0.11]
    const suitFar: RGB = [0.04, 0.05, 0.07]
    const accent: RGB = [0.95, 0.45, 0.12]
    const finColor: RGB = [0.1, 0.75, 0.85]
    const kick = Math.sin(dv.phase) * 0.05

    this.drawTorch(dv, 1)

    // far leg and fin
    limb(-0.12, 0.02, -0.33, 0.04 - kick, 0.045, 0.035, suitFar)
    limb(-0.33, 0.04 - kick, -0.52, 0.05 - kick * 1.6, 0.035, 0.028, suitFar)
    limb(-0.52, 0.05 - kick * 1.6, -0.72, 0.06 - kick * 2.6, 0.03, 0.05, [finColor[0] * 0.6, finColor[1] * 0.6, finColor[2] * 0.6])
    // tank on the back
    limb(-0.08, -0.075, 0.13, -0.08, 0.045, 0.045, [0.95, 0.72, 0.12])
    limb(0.13, -0.08, 0.16, -0.085, 0.02, 0.015, [0.35, 0.35, 0.38])
    // torso with accent stripe
    limb(-0.14, 0, 0.13, -0.01, 0.06, 0.065, suit)
    limb(-0.12, 0.01, 0.11, 0, 0.012, 0.012, accent)
    // near leg and fin
    limb(-0.12, 0.02, -0.33, 0.03 + kick, 0.05, 0.04, suit)
    limb(-0.33, 0.03 + kick, -0.52, 0.04 + kick * 1.6, 0.04, 0.03, suit)
    limb(-0.52, 0.04 + kick * 1.6, -0.74, 0.05 + kick * 2.6, 0.03, 0.055, finColor)
    // head, hood, mask and regulator
    limb(0.2, -0.015, 0.2, -0.015, 0.05, 0.05, suit)
    limb(0.235, -0.025, 0.235, -0.025, 0.024, 0.024, [0.35, 0.65, 0.8])
    {
      const [gx, gy] = this.diverPoint(dv, 0.24, -0.032)
      this.add(gx, gy, 0.5, 0.6, 0.6)
    }
    limb(0.245, 0.02, 0.245, 0.02, 0.016, 0.016, [0.15, 0.15, 0.17])
    // arm reaching forward with the torch
    limb(0.1, 0.03, 0.2, 0.08, 0.025, 0.022, suit)
    limb(0.2, 0.08, 0.29, 0.07, 0.022, 0.02, suit)
    limb(0.28, 0.07, 0.33, 0.065, 0.018, 0.022, [0.75, 0.75, 0.78])
  }

  private drawOctopus(o: Octopus) {
    const H = this.H
    const S = o.size * H * CREATURE_SCALE * (1.12 - 0.45 * o.z)
    if (S < 1.5) return
    const cx = o.x * H
    const cy = o.y * H
    const hx = Math.cos(o.dir)
    const hy = Math.sin(o.dir)
    const nx = -hy
    const ny = hx
    const fog = this.fogAt(cy)
    const fogK = 0.08 + o.z * 0.42
    const tint = (c: RGB): RGB => [c[0] + (fog[0] - c[0]) * fogK, c[1] + (fog[1] - c[1]) * fogK, c[2] + (fog[2] - c[2]) * fogK]
    const baseX = cx - hx * S * 0.6
    const baseY = cy - hy * S * 0.6
    const spread = 0.95 * (1 - o.pulse * 0.6) + 0.12 * Math.sin(o.phase * 1.3)
    const trail = o.dir + Math.PI
    for (let i = 0; i < 8; i++) {
      const side = (i - 3.5) / 3.5
      let a = trail + side * spread
      let x = baseX + nx * side * S * 0.38
      let y = baseY + ny * side * S * 0.38
      const len = S * 2.5 * (0.85 + 0.15 * hash(i * 7.3))
      const n = 26
      const curl = (i % 2 ? 1 : -1) * 0.16
      for (let s = 0; s <= n; s++) {
        const q = s / n
        const w = S * 0.14 * (1 - q * 0.85) + 0.35
        const shade = 0.55 + 0.3 * (1 - q)
        const [r, g, b] = tint(hsv(o.hue + q * 0.03, 0.72, shade * 0.62))
        this.disc(x, y, w, r, g, b, 1)
        if (s % 2 === 0 && w > 0.9) {
          const [sr, sg, sb] = tint([0.95, 0.78, 0.72])
          this.disc(x + Math.cos(a + Math.PI / 2) * w * 0.55, y + Math.sin(a + Math.PI / 2) * w * 0.55, w * 0.32, sr, sg, sb, 0.9)
        }
        a += Math.sin(o.phase * 1.4 + i * 0.9 + q * 3.5) * 0.07 + (q > 0.6 ? curl : 0)
        x += Math.cos(a) * (len / n)
        y += Math.sin(a) * (len / n)
      }
    }
    // mantle, bulbous and pointing along the direction of travel
    const ra = S * 0.85
    const rb = S * 0.6
    const mcx = cx + hx * S * 0.15
    const mcy = cy + hy * S * 0.15
    const R = Math.ceil(ra + 2)
    const body = hsv(o.hue, 0.72, 0.68)
    for (let y = Math.max(0, Math.floor(mcy - R)); y <= Math.min(H - 1, mcy + R); y++)
      for (let x = Math.max(0, Math.floor(mcx - R)); x <= Math.min(this.W - 1, mcx + R); x++) {
        const dx = x + 0.5 - mcx
        const dy = y + 0.5 - mcy
        const a = (dx * hx + dy * hy) / ra
        const b = (dx * nx + dy * ny) / (rb * (1 + 0.2 * a))
        const e = a * a + b * b
        if (e > 1.15) continue
        const cov = clamp((1 - e) * ra * 0.5 + 0.5, 0, 1)
        const light = 0.55 + 0.5 * Math.sqrt(Math.max(0, 1 - e)) - dy / (ra * 4)
        const spot = hash2(Math.floor(a * 6 + 20), Math.floor(b * 5 + 20)) > 0.72 && e < 0.8 ? 0.7 : 1
        const pulse = 1 + o.pulse * 0.15
        const [r, g, bl] = tint([body[0] * light * spot * pulse, body[1] * light * spot * pulse, body[2] * light * spot * pulse])
        this.blend((y * this.W + x) * 3, r, g, bl, cov)
      }
    for (const side of [-1, 1]) {
      const ex = mcx - hx * ra * 0.45 + nx * rb * 0.55 * side
      const ey = mcy - hy * ra * 0.45 + ny * rb * 0.55 * side
      const er = Math.max(1, S * 0.11)
      const [r, g, b] = tint([0.95, 0.82, 0.4])
      this.disc(ex, ey, er, r, g, b, 1)
      this.disc(ex, ey, er * 0.45, 0.02, 0.02, 0.03, 1)
    }
  }
}

// Turning is a constant-rate sweep toward the side the creature wants to go, decided by intent rather than current
// speed so it never stalls mid-turn. The drawn width follows a sine, so the edge-on moment is brief and smooth.
function steerTurn(c: { turn: number; heading: number; face: number }, want: number, deadzone: number, rate: number, dt: number) {
  if (Math.abs(want) > deadzone) c.heading = Math.sign(want)
  const step = rate * dt
  c.turn = c.turn < c.heading ? Math.min(c.heading, c.turn + step) : Math.max(c.heading, c.turn - step)
  c.face = Math.sin((c.turn * Math.PI) / 2)
}

// A tileable Voronoi-edge texture for the light network on the water surface.
function buildCaustics() {
  const tex = new Float32Array(CAUS_N * CAUS_N)
  const cells = 7
  const pts: number[] = []
  for (let j = 0; j < cells; j++)
    for (let i = 0; i < cells; i++) pts.push((i + 0.15 + hash2(i, j) * 0.7) / cells, (j + 0.15 + hash2(i + 31, j + 17) * 0.7) / cells)
  for (let y = 0; y < CAUS_N; y++) {
    for (let x = 0; x < CAUS_N; x++) {
      const u = x / CAUS_N
      const v = y / CAUS_N
      let f1 = 9
      let f2 = 9
      for (let p = 0; p < pts.length; p += 2) {
        let dx = Math.abs(u - pts[p])
        let dy = Math.abs(v - pts[p + 1])
        if (dx > 0.5) dx = 1 - dx
        if (dy > 0.5) dy = 1 - dy
        const d = Math.sqrt(dx * dx + dy * dy)
        if (d < f1) {
          f2 = f1
          f1 = d
        } else if (d < f2) f2 = d
      }
      tex[y * CAUS_N + x] = Math.pow(1 - smoothstep(0, 0.32, (f2 - f1) * cells), 2.4)
    }
  }
  return tex
}

// A wrapping 1D strip of soft Gaussian bands; two of them sliding past each other make the god rays.
function buildRays(seed: number) {
  const tex = new Float32Array(RAY_N)
  for (let k = 0; k < 16; k++) {
    const c = hash(seed + k * 3.1) * RAY_N
    const w = 6 + hash(seed + k * 7.7) * 38
    const amp = 0.35 + hash(seed + k * 1.3) * 0.65
    for (let i = 0; i < RAY_N; i++) {
      let d = Math.abs(i - c)
      if (d > RAY_N / 2) d = RAY_N - d
      tex[i] += amp * Math.exp(-(d * d) / (w * w))
    }
  }
  let max = 0
  for (let i = 0; i < RAY_N; i++) max = Math.max(max, tex[i])
  for (let i = 0; i < RAY_N; i++) tex[i] = Math.min(1, tex[i] / max)
  return tex
}

export const aquarium: Wallpaper = {
  id: "aquarium",
  name: "Aquarium",
  description: "Deep water, god rays, marine snow, and a whale that drifts past now and then",
  activity: {
    calm: "Water, light and the whale",
    lively: "Adds a fish and an octopus",
    teeming: "Adds a shark, diver, turtle and kelp",
  },
  scrim: {
    day: [
      [16, 40, 60],
      [10, 28, 48],
      [6, 16, 34],
    ],
    sunset: [
      [44, 30, 36],
      [22, 20, 36],
      [8, 10, 24],
    ],
    night: [
      [4, 10, 22],
      [3, 7, 16],
      [2, 4, 10],
    ],
  },
  create: (settings) => new Aquarium(settings),
}
