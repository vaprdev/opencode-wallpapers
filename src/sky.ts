// Sky pieces shared by outdoor wallpapers: a depth-graded sky with a sun or moon, stars and drifting clouds.
import { TAU, fbm1, lerp, smoothstep, type RGB } from "./math"

// The sun or moon: x as a fraction of the width, y and r as fractions of the height.
export interface Orb {
  x: number
  y: number
  r: number
  core: RGB
  glow: RGB
  near: number
  wide: number
  moon?: boolean
}

// Stars come in a few colors rather than plain white, so they read apart from light text.
export const STAR_TINTS: RGB[] = [
  [0.55, 0.75, 1.2],
  [1.15, 0.85, 0.45],
  [1.1, 0.6, 0.85],
  [0.7, 0.6, 1.2],
]

export interface Star {
  x: number
  y: number
  b: number
  phase: number
  tint: RGB
}

export interface Cloud {
  x: number
  y: number
  speed: number
  puffs: { dx: number; dy: number; rx: number; ry: number }[]
}

// Fills the whole canvas with a vertical gradient through stops ([height fraction, color]), adds a glow around the orb
// and draws the orb itself.
export function paintSky(hdr: Float32Array, W: number, H: number, stops: [number, RGB][], orb: Orb) {
  const ox = orb.x * W
  const oy = orb.y * H
  const R = orb.r * H
  for (let y = 0; y < H; y++) {
    const v = y / H
    const i = stops.findIndex(([at]) => at >= v)
    const [a, from] = stops[Math.max(0, i - 1)]
    const [b, to] = stops[i < 0 ? stops.length - 1 : i]
    const k = b > a ? smoothstep(a, b, v) : 1
    for (let x = 0; x < W; x++) {
      const d = Math.hypot(x - ox, y - oy) / H
      const glow = orb.near * Math.exp(-d / (orb.r * 1.8)) + orb.wide * Math.exp(-d / 0.35)
      const o = (y * W + x) * 3
      hdr[o] = lerp(from[0], to[0], k) + glow * orb.glow[0]
      hdr[o + 1] = lerp(from[1], to[1], k) + glow * orb.glow[1]
      hdr[o + 2] = lerp(from[2], to[2], k) + glow * orb.glow[2]
      const r = d * H
      const cov = Math.min(1, Math.max(0, R - r + 0.5))
      if (cov <= 0) continue
      const limb = 0.85 + 0.15 * Math.sqrt(Math.max(0, 1 - (r / R) ** 2))
      const maria = orb.moon ? 1 - 0.18 * smoothstep(0.55, 0.75, fbm1((x - ox) * 0.25 + 3, 7) + fbm1((y - oy) * 0.25 + 1, 9) * 0.6) : 1
      const m = limb * maria
      hdr[o] += (orb.core[0] * m - hdr[o]) * cov
      hdr[o + 1] += (orb.core[1] * m - hdr[o + 1]) * cov
      hdr[o + 2] += (orb.core[2] * m - hdr[o + 2]) * cov
    }
  }
}

export function makeStars(count: number, top: number): Star[] {
  return Array.from({ length: count }, () => ({ x: Math.random(), y: Math.random() * top, b: 0.4 + Math.random() * 0.6, phase: Math.random() * TAU, tint: STAR_TINTS[Math.floor(Math.random() * STAR_TINTS.length)] }))
}

// Stars twinkling slowly, fading toward the horizon at `top`.
export function paintStars(hdr: Float32Array, W: number, H: number, stars: Star[], time: number, top: number, brightness: number) {
  for (const s of stars) {
    const x = (s.x * W) | 0
    const y = (s.y * H) | 0
    if (x < 0 || y < 0 || x >= W || y >= H) continue
    const k = s.b * Math.max(0, 1 - s.y / top) * (0.7 + 0.3 * Math.sin(time * 0.8 + s.phase)) * brightness
    const o = (y * W + x) * 3
    hdr[o] += k * s.tint[0]
    hdr[o + 1] += k * s.tint[1]
    hdr[o + 2] += k * s.tint[2]
  }
}

// Puffy cumulus (rounded, lit from above) or thin streaks, scattered between y0 and y1.
export function makeClouds(count: number, puffy: boolean, y0: number, y1: number): Cloud[] {
  return Array.from({ length: count }, () => ({
    x: Math.random() * 2,
    y: y0 + Math.random() * (y1 - y0),
    speed: 0.003 + Math.random() * 0.004,
    puffs: puffy
      ? Array.from({ length: 6 }, (_, i) => ({ dx: (i / 5 - 0.5) * 0.16 + (Math.random() - 0.5) * 0.03, dy: -Math.sin((i / 5) * Math.PI) * 0.02 + (Math.random() - 0.5) * 0.01, rx: 0.03 + Math.random() * 0.025, ry: 0.022 + Math.random() * 0.014 }))
      : Array.from({ length: 5 }, () => ({ dx: (Math.random() - 0.5) * 0.22, dy: (Math.random() - 0.5) * 0.015, rx: 0.06 + Math.random() * 0.08, ry: 0.008 + Math.random() * 0.01 })),
  }))
}

export function driftClouds(clouds: Cloud[], A: number, dt: number) {
  for (const c of clouds) {
    c.x += c.speed * dt
    if (c.x > A + 0.4) c.x = -0.4
  }
}

// Clouds shaded from top to bottom; puffy ones are nearly opaque, streaks are thin and soft.
export function paintClouds(hdr: Float32Array, W: number, H: number, clouds: Cloud[], top: RGB, bottom: RGB, alpha: number, puffy: boolean) {
  for (const c of clouds)
    for (const p of c.puffs) {
      const cx = (c.x + p.dx) * H
      const cy = (c.y + p.dy) * H
      const rx = p.rx * H
      const ry = p.ry * H
      for (let y = Math.max(0, Math.floor(cy - ry)); y <= Math.min(H - 1, Math.ceil(cy + ry)); y++)
        for (let x = Math.max(0, Math.floor(cx - rx)); x <= Math.min(W - 1, Math.ceil(cx + rx)); x++) {
          const dx = (x + 0.5 - cx) / rx
          const dy = (y + 0.5 - cy) / ry
          const q = dx * dx + dy * dy
          if (q >= 1) continue
          const under = smoothstep(-1, 1, dy)
          const o = (y * W + x) * 3
          const a = (puffy ? Math.min(1, (1 - q) * 3) : (1 - q) ** 1.5) * alpha
          hdr[o] += (lerp(top[0], bottom[0], under) - hdr[o]) * a
          hdr[o + 1] += (lerp(top[1], bottom[1], under) - hdr[o + 1]) * a
          hdr[o + 2] += (lerp(top[2], bottom[2], under) - hdr[o + 2]) * a
        }
    }
}
