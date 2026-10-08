import { clamp } from "./math"

// Bloom is computed at 1/BLOOM resolution, then again at half that for the wide halo.
const BLOOM = 4
const BLOOM_THRESHOLD = 0.82
const BLUR = [1, 6, 15, 20, 15, 6, 1]

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

  abstract step(dt: number): void
  abstract render(): void

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
        this.vignette[y * W + x] = 1 - 0.62 * Math.pow(dx * dx + dy * dy, 1.25)
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
    const x0 = Math.max(0, Math.floor(cx - rad - 1))
    const x1 = Math.min(this.W - 1, Math.ceil(cx + rad + 1))
    const y0 = Math.max(0, Math.floor(cy - rad - 1))
    const y1 = Math.min(this.H - 1, Math.ceil(cy + rad + 1))
    for (let y = y0; y <= y1; y++) {
      const dy = y + 0.5 - cy
      for (let x = x0; x <= x1; x++) {
        const dx = x + 0.5 - cx
        const cov = clamp(rad - Math.sqrt(dx * dx + dy * dy) + 0.5, 0, 1) * a
        if (cov > 0) this.blend((y * this.W + x) * 3, r, g, b, cov)
      }
    }
  }

  // An anti-aliased filled ellipse, mixed over the scene; handy for parts that narrow as a creature turns edge-on.
  protected ellipse(cx: number, cy: number, rx: number, ry: number, r: number, g: number, b: number, a: number) {
    const { W, H, hdr } = this
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

  // Bloom, vignette and ACES tone mapping from hdr into pixels.
  protected finish(exposure = 1.25) {
    this.bloom()
    const { W, H, hdr, pixels, bloomUp, vignette, rowA, rowB, rowF, colA, colB, colF } = this
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

  private bloom() {
    const { W, H, hdr, bw, bh, bloomA, bloomB, bw2, bh2, bloom2A, bloom2B, bloomUp } = this
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
