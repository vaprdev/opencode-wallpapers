import { Canvas } from "../src/canvas"
import type { Wallpaper } from "../src/engine"
import { clamp, fbm1, hash, hash2, lerp, noise1, rand, smoothstep, type RGB } from "../src/math"

// Depth of the water surface as a fraction of the height.
const SURFACE = 0.065
// The scene runs slower than real time, which keeps it calm behind text.
const TIME_SCALE = 0.35
const CAUS_N = 128
const RAY_N = 1024

const CAUSTICS = buildCaustics()
const RAYS_A = buildRays(1)
const RAYS_B = buildRays(9)

class Aquarium extends Canvas {
  private time = 0
  private rowCol = new Float32Array(0)
  private rayFade = new Float32Array(0)
  private farPx = new Float32Array(0)
  private midPx = new Float32Array(0)
  private pad = 0
  private snow = Array.from({ length: 70 }, () => ({ x: Math.random() * 4, y: Math.random(), z: Math.random(), s: Math.random() }))
  private whale = { x: -9, dir: 1, next: 14, y: 0.4 }

  step(dt: number) {
    dt = clamp(dt, 0, 0.1) * TIME_SCALE
    this.time += dt
    for (const s of this.snow) {
      s.x += (0.006 + s.z * 0.012) * dt
      s.y += (0.004 + s.s * 0.008) * dt + Math.sin(this.time * 0.7 + s.s * 20) * 0.002 * dt
      if (s.x > this.A) s.x -= this.A
      if (s.y > 1) s.y -= 0.95
    }
    // The whale waits offscreen (x < -5), then crosses in a random direction.
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

  render() {
    this.drawWater()
    this.drawWhale()
    this.drawSnow(true)
    this.drawSnow(false)
    this.finish()
  }

  protected override layout() {
    const { W, H } = this
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
    const fy = clamp(py | 0, 0, H - 1) * 3
    const fog: RGB = [this.rowCol[fy], this.rowCol[fy + 1], this.rowCol[fy + 2]]
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
  scrim: [
    [16, 40, 60],
    [10, 28, 48],
    [6, 16, 34],
  ],
  create: () => new Aquarium(),
}
