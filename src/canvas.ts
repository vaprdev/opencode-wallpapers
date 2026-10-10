import type { AgentEvent } from "./wallpaper"
import { clamp, smoothstep, type RGB } from "./math"

// Bloom is computed at 1/BLOOM resolution, then again at half that for the wide halo.
const BLOOM = 4
const BLOOM_THRESHOLD = 0.82
const BLUR = [1, 6, 15, 20, 15, 6, 1]

export type Part =
  | { kind: "capsule"; ax: number; ay: number; bx: number; by: number; r0: number; r1: number; color: RGB; ribs: number }
  | { kind: "ellipse"; cx: number; cy: number; rx: number; ry: number; angle: number; color: RGB; ribs: number }

// A tapered capsule from (ax, ay) radius r0 to (bx, by) radius r1; ribs adds lengthwise ridges, as on a cactus.
export function cap(ax: number, ay: number, bx: number, by: number, r0: number, r1: number, color: RGB, ribs = 0): Part {
  return { kind: "capsule", ax, ay, bx, by, r0, r1, color, ribs }
}

// An ellipse rotated by angle; ribs runs ridges across its width.
export function ell(cx: number, cy: number, rx: number, ry: number, angle: number, color: RGB, ribs = 0): Part {
  return { kind: "ellipse", cx, cy, rx, ry, angle, color, ribs }
}

// How shape() lights a shape. rim: backlit from a point (pixels), so only the outline facing it glows. front: lit from
// a direction (x right, y down, z toward the viewer), shading each part as a rounded form.
export type Lighting = { style: "rim"; color: RGB; x: number; y: number } | { style: "front"; dir: readonly [number, number, number] }

// Base for wallpaper scenes. Scenes draw linear light into `hdr` (3 floats per pixel) in `render`, then call `finish`,
// which adds bloom and a vignette and tone-maps into the RGBA `pixels` the engine reads. Scene coordinates usually
// run 0..A across and 0..1 down, so multiplying by H gives pixels.
export abstract class Canvas {
  W = 0
  H = 0
  A = 1
  hdr = new Float32Array(0)
  pixels = new Uint8Array(0)

  private bw = 0
  private bh = 0
  private bloomA = new Float32Array(0)
  private bloomB = new Float32Array(0)
  private bw2 = 0
  private bh2 = 0
  private bloom2A = new Float32Array(0)
  private bloom2B = new Float32Array(0)
  private bloomUp = new Float32Array(0)
  private vignette = new Float32Array(0)
  private rowA = new Int32Array(0)
  private rowB = new Int32Array(0)
  private rowF = new Float32Array(0)
  private colA = new Int32Array(0)
  private colB = new Int32Array(0)
  private colF = new Float32Array(0)

  // How overcast the scene is: eases to 1 after the agent fails and back to 0 with any other event (the engine sends
  // idle once an error is a couple of minutes old). Scenes call stepGloom from step and darken their light or bring in
  // clouds by it.
  protected gloom = 0
  private gloomy = false
  // Extra darkening toward the bottom corners (0 to 1), folded into the vignette: set it in the constructor to frame
  // a bright daytime foreground.
  protected frame = 0

  abstract step(dt: number): void
  abstract render(): void

  react(event: AgentEvent) {
    this.gloomy = event === "error"
    if (event === "done") this.visit()
  }

  // The agent finished a task: scenes bring on their rare visitor now.
  protected visit() {}

  protected stepGloom(dt: number) {
    this.gloom = clamp(this.gloom + (this.gloomy ? dt : -dt) * 0.3, 0, 1)
  }

  // Called after every size change, once the buffers match the new size.
  protected layout() {}

  resize(W: number, H: number) {
    W = Math.max(64, Math.round(W))
    H = Math.max(36, Math.round(H))
    if (W === this.W && H === this.H) return
    this.W = W
    this.H = H
    this.A = W / H
    this.hdr = new Float32Array(W * H * 3)
    this.pixels = new Uint8Array(W * H * 4)
    this.bw = Math.ceil(W / BLOOM)
    this.bh = Math.ceil(H / BLOOM)
    this.bloomA = new Float32Array(this.bw * this.bh * 3)
    this.bloomB = new Float32Array(this.bw * this.bh * 3)
    this.bloomUp = new Float32Array(this.bw * this.bh * 3)
    this.bw2 = Math.ceil(this.bw / 2)
    this.bh2 = Math.ceil(this.bh / 2)
    this.bloom2A = new Float32Array(this.bw2 * this.bh2 * 3)
    this.bloom2B = new Float32Array(this.bw2 * this.bh2 * 3)
    const invR = 1 / Math.hypot(W / 2, H / 2)
    this.vignette = new Float32Array(W * H)
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const dx = (x - W / 2) * invR
        const dy = (y - H / 2) * invR
        const corner = this.frame * smoothstep(0.45, 1, y / H) * (0.35 + 0.65 * (2 * Math.abs(x / W - 0.5)) ** 2)
        this.vignette[y * W + x] = (1 - 0.62 * Math.pow(dx * dx + dy * dy, 1.25)) * (1 - corner)
      }
    // Bilinear lookup from full-resolution rows and columns into the bloom grid.
    this.rowA = new Int32Array(H)
    this.rowB = new Int32Array(H)
    this.rowF = new Float32Array(H)
    for (let y = 0; y < H; y++) {
      const by = (y + 0.5) * (this.bh / H) - 0.5
      const i = clamp(Math.floor(by), 0, this.bh - 1)
      this.rowA[y] = i * this.bw * 3
      this.rowB[y] = Math.min(this.bh - 1, i + 1) * this.bw * 3
      this.rowF[y] = clamp(by - i, 0, 1)
    }
    this.colA = new Int32Array(W)
    this.colB = new Int32Array(W)
    this.colF = new Float32Array(W)
    for (let x = 0; x < W; x++) {
      const bx = (x + 0.5) * (this.bw / W) - 0.5
      const i = clamp(Math.floor(bx), 0, this.bw - 1)
      this.colA[x] = i * 3
      this.colB[x] = Math.min(this.bw - 1, i + 1) * 3
      this.colF[x] = clamp(bx - i, 0, 1)
    }
    this.layout()
  }

  // Adds light to one pixel.
  protected add(x: number, y: number, r: number, g: number, b: number) {
    const xi = x | 0
    const yi = y | 0
    if (xi < 0 || yi < 0 || xi >= this.W || yi >= this.H) return
    const i = (yi * this.W + xi) * 3
    this.hdr[i] += r
    this.hdr[i + 1] += g
    this.hdr[i + 2] += b
  }

  // Mixes a color over the pixel at hdr index i by coverage a.
  protected blend(i: number, r: number, g: number, b: number, a: number) {
    const h = this.hdr
    h[i] += (r - h[i]) * a
    h[i + 1] += (g - h[i + 1]) * a
    h[i + 2] += (b - h[i + 2]) * a
  }

  // An anti-aliased filled circle, mixed over the scene.
  protected disc(cx: number, cy: number, rad: number, r: number, g: number, b: number, a: number) {
    fillDisc(this.hdr, this.W, this.H, cx, cy, rad, r, g, b, a)
  }

  // An anti-aliased filled ellipse, mixed over the scene; handy for parts that narrow as a creature turns edge-on.
  protected ellipse(cx: number, cy: number, rx: number, ry: number, r: number, g: number, b: number, a: number) {
    fillEllipse(this.hdr, this.W, this.H, cx, cy, rx, ry, r, g, b, a)
  }

  // An anti-aliased filled polygon in a flat color, for straight-edged things like buildings and machines.
  protected polygon(points: readonly (readonly [number, number])[], color: RGB, alpha = 1) {
    fillPolygon(this.hdr, this.W, this.H, points, color[0], color[1], color[2], alpha)
  }

  // Draws parts as one shape: each pixel takes the nearest part's color, so joints stay seamless. With rim lighting
  // only the outline facing the light catches it; with front lighting each part is shaded as a rounded form.
  // light scales the effect (0 draws flat color).
  protected shape(parts: Part[], lighting: Lighting, light = 1) {
    fillShape(this.hdr, this.W, this.H, parts, lighting, light)
  }

  // Bloom, vignette and ACES tone mapping from hdr into pixels.
  protected finish(exposure = 1.25) {
    bloom(this.hdr, this.W, this.H, this.bw, this.bh, this.bloomA, this.bloomB, this.bw2, this.bh2, this.bloom2A, this.bloom2B, this.bloomUp)
    toneMap(this.hdr, this.pixels, this.W, this.H, this.bloomUp, this.vignette, this.rowA, this.rowB, this.rowF, this.colA, this.colB, this.colF, exposure)
  }
}

// Separable 7-tap binomial blur of a 3-channel buffer, in place, using tmp as scratch.
function blur(a: Float32Array, tmp: Float32Array, w: number, h: number) {
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let r = 0
      let g = 0
      let b = 0
      for (let j = -3; j <= 3; j++) {
        const i = (y * w + clamp(x + j, 0, w - 1)) * 3
        r += a[i] * BLUR[j + 3]
        g += a[i + 1] * BLUR[j + 3]
        b += a[i + 2] * BLUR[j + 3]
      }
      const o = (y * w + x) * 3
      tmp[o] = r / 64
      tmp[o + 1] = g / 64
      tmp[o + 2] = b / 64
    }
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let r = 0
      let g = 0
      let b = 0
      for (let j = -3; j <= 3; j++) {
        const i = (clamp(y + j, 0, h - 1) * w + x) * 3
        r += tmp[i] * BLUR[j + 3]
        g += tmp[i + 1] * BLUR[j + 3]
        b += tmp[i + 2] * BLUR[j + 3]
      }
      const o = (y * w + x) * 3
      a[o] = r / 64
      a[o + 1] = g / 64
      a[o + 2] = b / 64
    }
}

function fillDisc(hdr: Float32Array, W: number, H: number, cx: number, cy: number, rad: number, r: number, g: number, b: number, a: number) {
  const x0 = Math.max(0, Math.floor(cx - rad - 1))
  const x1 = Math.min(W - 1, Math.ceil(cx + rad + 1))
  const y0 = Math.max(0, Math.floor(cy - rad - 1))
  const y1 = Math.min(H - 1, Math.ceil(cy + rad + 1))
  for (let y = y0; y <= y1; y++) {
    const dy = y + 0.5 - cy
    for (let x = x0; x <= x1; x++) {
      const dx = x + 0.5 - cx
      const cov = clamp(rad - Math.sqrt(dx * dx + dy * dy) + 0.5, 0, 1) * a
      if (cov <= 0) continue
      const i = (y * W + x) * 3
      hdr[i] += (r - hdr[i]) * cov
      hdr[i + 1] += (g - hdr[i + 1]) * cov
      hdr[i + 2] += (b - hdr[i + 2]) * cov
    }
  }
}

function fillEllipse(hdr: Float32Array, W: number, H: number, cx: number, cy: number, rx: number, ry: number, r: number, g: number, b: number, a: number) {
  const x0 = Math.max(0, Math.floor(cx - rx - 1))
  const x1 = Math.min(W - 1, Math.ceil(cx + rx + 1))
  const y0 = Math.max(0, Math.floor(cy - ry - 1))
  const y1 = Math.min(H - 1, Math.ceil(cy + ry + 1))
  const m = Math.min(rx, ry)
  for (let y = y0; y <= y1; y++) {
    const dy = (y + 0.5 - cy) / ry
    for (let x = x0; x <= x1; x++) {
      const dx = (x + 0.5 - cx) / rx
      const cov = clamp((1 - Math.sqrt(dx * dx + dy * dy)) * m + 0.5, 0, 1) * a
      if (cov <= 0) continue
      const i = (y * W + x) * 3
      hdr[i] += (r - hdr[i]) * cov
      hdr[i + 1] += (g - hdr[i + 1]) * cov
      hdr[i + 2] += (b - hdr[i + 2]) * cov
    }
  }
}

function fillShape(hdr: Float32Array, W: number, H: number, parts: Part[], lighting: Lighting, light: number) {
  if (!parts.length) return
  // The shape's overall extent: the pixels it can cover, and the direction its rim light comes from.
  let cx0 = Infinity
  let cy0 = Infinity
  let cx1 = -Infinity
  let cy1 = -Infinity
  // Each part's own bounds: a pixel outside them is too far from that part for it to be the one that colors it.
  // The ellipse distance is approximate and runs short past the tips of long ellipses, so they get a wider margin.
  const boxes = new Float32Array(parts.length * 4)
  for (let j = 0; j < parts.length; j++) {
    const p = parts[j]
    const radius = p.kind === "capsule" ? Math.max(p.r0, p.r1) : Math.max(p.rx, p.ry)
    const pad = p.kind === "capsule" ? radius + 1 : radius * (1 + 0.5 / Math.max(0.01, Math.min(p.rx, p.ry))) + 1
    const [ax, ay, bx, by] = p.kind === "capsule" ? [p.ax, p.ay, p.bx, p.by] : [p.cx, p.cy, p.cx, p.cy]
    cx0 = Math.min(cx0, ax - radius - 1, bx - radius - 1)
    cy0 = Math.min(cy0, ay - radius - 1, by - radius - 1)
    cx1 = Math.max(cx1, ax + radius + 1, bx + radius + 1)
    cy1 = Math.max(cy1, ay + radius + 1, by + radius + 1)
    boxes[j * 4] = Math.min(ax, bx) - pad
    boxes[j * 4 + 1] = Math.min(ay, by) - pad
    boxes[j * 4 + 2] = Math.max(ax, bx) + pad
    boxes[j * 4 + 3] = Math.max(ay, by) + pad
  }
  const lx0 = lighting.style === "rim" ? lighting.x : 0
  const ly0 = lighting.style === "rim" ? lighting.y : 0
  const sl = Math.hypot(lx0 - (cx0 + cx1) / 2, ly0 - (cy0 + cy1) / 2) || 1
  const sx = (lx0 - (cx0 + cx1) / 2) / sl
  const sy = (ly0 - (cy0 + cy1) / 2) / sl
  for (let y = Math.max(0, Math.floor(cy0)); y <= Math.min(H - 1, Math.ceil(cy1)); y++)
    for (let x = Math.max(0, Math.floor(cx0)); x <= Math.min(W - 1, Math.ceil(cx1)); x++) {
      const px = x + 0.5
      const py = y + 0.5
      let best = Infinity
      let part = parts[0]
      let nx = 0
      let ny = 0
      let e = 0
      let across = 0
      for (let j = 0; j < parts.length; j++) {
        if (px < boxes[j * 4] || py < boxes[j * 4 + 1] || px > boxes[j * 4 + 2] || py > boxes[j * 4 + 3]) continue
        const p = parts[j]
        if (p.kind === "capsule") {
          const dx = p.bx - p.ax
          const dy = p.by - p.ay
          const len2 = dx * dx + dy * dy || 1e-6
          const t = clamp(((px - p.ax) * dx + (py - p.ay) * dy) / len2, 0, 1)
          const ox = px - (p.ax + dx * t)
          const oy = py - (p.ay + dy * t)
          const r = p.r0 + (p.r1 - p.r0) * t
          const dist = Math.hypot(ox, oy) || 1e-6
          const d = dist - r
          if (d >= best) continue
          best = d
          part = p
          nx = ox / dist
          ny = oy / dist
          e = dist / Math.max(r, 0.5)
          across = (ox * dy - oy * dx) / Math.sqrt(len2) / Math.max(r, 0.5)
          continue
        }
        const ca = Math.cos(p.angle)
        const sa = Math.sin(p.angle)
        const ox = px - p.cx
        const oy = py - p.cy
        const lx = ox * ca + oy * sa
        const ly = -ox * sa + oy * ca
        const radial = Math.sqrt((lx / p.rx) ** 2 + (ly / p.ry) ** 2)
        const d = (radial - 1) * Math.min(p.rx, p.ry)
        if (d >= best) continue
        const gx = lx / (p.rx * p.rx)
        const gy = ly / (p.ry * p.ry)
        const gl = Math.hypot(gx, gy) || 1e-6
        best = d
        part = p
        nx = (gx * ca - gy * sa) / gl
        ny = (gx * sa + gy * ca) / gl
        e = radial
        across = lx / p.rx
      }
      const cov = clamp(0.5 - best, 0, 1)
      if (cov <= 0) continue
      const k = part.ribs ? 0.8 + 0.2 * Math.cos(across * Math.PI * part.ribs) : 1
      const c = part.color
      const o = (y * W + x) * 3
      if (lighting.style === "front") {
        // Treat the shape as rounded: the normal tilts from facing the viewer at the center to sideways at the edge.
        const r = Math.min(1, e)
        const lit = Math.max(0, nx * r * lighting.dir[0] + ny * r * lighting.dir[1] + Math.sqrt(1 - r * r) * lighting.dir[2])
        const shade = k * (1 - light + light * (0.45 + 0.75 * lit))
        hdr[o] += (c[0] * shade - hdr[o]) * cov
        hdr[o + 1] += (c[1] * shade - hdr[o + 1]) * cov
        hdr[o + 2] += (c[2] * shade - hdr[o + 2]) * cov
        continue
      }
      const lit = light * clamp((best + 2.2) / 2.2, 0, 1) * Math.max(0, nx * sx + ny * sy) * 0.8
      hdr[o] += (c[0] * k + lighting.color[0] * lit - hdr[o]) * cov
      hdr[o + 1] += (c[1] * k + lighting.color[1] * lit - hdr[o + 1]) * cov
      hdr[o + 2] += (c[2] * k + lighting.color[2] * lit - hdr[o + 2]) * cov
    }
}

function toneMap(hdr: Float32Array, pixels: Uint8Array, W: number, H: number, bloomUp: Float32Array, vignette: Float32Array, rowA: Int32Array, rowB: Int32Array, rowF: Float32Array, colA: Int32Array, colB: Int32Array, colF: Float32Array, exposure: number) {
  for (let y = 0; y < H; y++) {
    const rA = rowA[y]
    const rB = rowB[y]
    const fy = rowF[y]
    for (let x = 0; x < W; x++) {
      const i = y * W + x
      const fx = colF[x]
      const w00 = (1 - fx) * (1 - fy)
      const w10 = fx * (1 - fy)
      const w01 = (1 - fx) * fy
      const w11 = fx * fy
      const i00 = rA + colA[x]
      const i10 = rA + colB[x]
      const i01 = rB + colA[x]
      const i11 = rB + colB[x]
      const k = vignette[i] * exposure
      const o = i * 4
      for (let c = 0; c < 3; c++) {
        const v = (hdr[i * 3 + c] + bloomUp[i00 + c] * w00 + bloomUp[i10 + c] * w10 + bloomUp[i01 + c] * w01 + bloomUp[i11 + c] * w11) * k
        const mapped = ((v * (2.51 * v + 0.03)) / (v * (2.43 * v + 0.59) + 0.14)) * 255
        pixels[o + c] = mapped < 0 ? 0 : mapped > 255 ? 255 : mapped
      }
      pixels[o + 3] = 255
    }
  }
}

function bloom(hdr: Float32Array, W: number, H: number, bw: number, bh: number, bloomA: Float32Array, bloomB: Float32Array, bw2: number, bh2: number, bloom2A: Float32Array, bloom2B: Float32Array, bloomUp: Float32Array) {
  for (let by = 0; by < bh; by++)
    for (let bx = 0; bx < bw; bx++) {
      let r = 0
      let g = 0
      let b = 0
      let n = 0
      for (let yy = by * BLOOM; yy < Math.min(H, by * BLOOM + BLOOM); yy++)
        for (let xx = bx * BLOOM; xx < Math.min(W, bx * BLOOM + BLOOM); xx++) {
          const i = (yy * W + xx) * 3
          r += hdr[i]
          g += hdr[i + 1]
          b += hdr[i + 2]
          n++
        }
      r /= n
      g /= n
      b /= n
      const l = r * 0.2126 + g * 0.7152 + b * 0.0722
      const k = l > 1e-4 ? Math.max(0, l - BLOOM_THRESHOLD) / l : 0
      const o = (by * bw + bx) * 3
      bloomA[o] = r * k
      bloomA[o + 1] = g * k
      bloomA[o + 2] = b * k
    }
  blur(bloomA, bloomB, bw, bh)
  blur(bloomA, bloomB, bw, bh)
  for (let y = 0; y < bh2; y++)
    for (let x = 0; x < bw2; x++) {
      let r = 0
      let g = 0
      let b = 0
      let n = 0
      for (let yy = y * 2; yy < Math.min(bh, y * 2 + 2); yy++)
        for (let xx = x * 2; xx < Math.min(bw, x * 2 + 2); xx++) {
          const i = (yy * bw + xx) * 3
          r += bloomA[i]
          g += bloomA[i + 1]
          b += bloomA[i + 2]
          n++
        }
      const o = (y * bw2 + x) * 3
      bloom2A[o] = r / n
      bloom2A[o + 1] = g / n
      bloom2A[o + 2] = b / n
    }
  blur(bloom2A, bloom2B, bw2, bh2)
  blur(bloom2A, bloom2B, bw2, bh2)
  // Fold the wide level into the narrow one so finish does a single bilinear fetch.
  for (let y = 0; y < bh; y++) {
    const sy = clamp((y + 0.5) * (bh2 / bh) - 0.5, 0, bh2 - 1)
    const y0 = Math.floor(sy)
    const y1 = Math.min(bh2 - 1, y0 + 1)
    const fy = sy - y0
    for (let x = 0; x < bw; x++) {
      const sx = clamp((x + 0.5) * (bw2 / bw) - 0.5, 0, bw2 - 1)
      const x0 = Math.floor(sx)
      const x1 = Math.min(bw2 - 1, x0 + 1)
      const fx = sx - x0
      const o = (y * bw + x) * 3
      for (let c = 0; c < 3; c++) {
        const a = bloom2A[(y0 * bw2 + x0) * 3 + c] * (1 - fx) + bloom2A[(y0 * bw2 + x1) * 3 + c] * fx
        const b = bloom2A[(y1 * bw2 + x0) * 3 + c] * (1 - fx) + bloom2A[(y1 * bw2 + x1) * 3 + c] * fx
        bloomUp[o + c] = bloomA[o + c] * 1.1 + (a * (1 - fy) + b * fy) * 1.4
      }
    }
  }
}

function fillPolygon(hdr: Float32Array, W: number, H: number, pts: readonly (readonly [number, number])[], r: number, g: number, b: number, a: number) {
  let x0 = Infinity
  let y0 = Infinity
  let x1 = -Infinity
  let y1 = -Infinity
  for (const [x, y] of pts) {
    x0 = Math.min(x0, x)
    y0 = Math.min(y0, y)
    x1 = Math.max(x1, x)
    y1 = Math.max(y1, y)
  }
  const n = pts.length
  for (let y = Math.max(0, Math.floor(y0 - 1)); y <= Math.min(H - 1, Math.ceil(y1 + 1)); y++)
    for (let x = Math.max(0, Math.floor(x0 - 1)); x <= Math.min(W - 1, Math.ceil(x1 + 1)); x++) {
      const px = x + 0.5
      const py = y + 0.5
      let inside = false
      let dmin = Infinity
      for (let i = 0, j = n - 1; i < n; j = i++) {
        const [ax, ay] = pts[j]
        const [bx, by] = pts[i]
        if (ay > py !== by > py && px < ((bx - ax) * (py - ay)) / (by - ay) + ax) inside = !inside
        const dx = bx - ax
        const dy = by - ay
        const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1e-6)))
        dmin = Math.min(dmin, Math.hypot(px - ax - dx * t, py - ay - dy * t))
      }
      const cov = Math.max(0, Math.min(1, (inside ? dmin : -dmin) + 0.5)) * a
      if (cov <= 0) continue
      const o = (y * W + x) * 3
      hdr[o] += (r - hdr[o]) * cov
      hdr[o + 1] += (g - hdr[o + 1]) * cov
      hdr[o + 2] += (b - hdr[o + 2]) * cov
    }
}
