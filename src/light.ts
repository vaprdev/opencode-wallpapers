import type { RGB } from "./math"

// A pool of light from a lantern, lava, a window or glowing plankton, falling off over an ellipse (pixels) around
// (cx, cy). lift brightens what is already there by the light's color, so lit ground and creatures keep their shapes;
// glow adds a little haze of the color itself.
export function lightPool(hdr: Float32Array, W: number, H: number, cx: number, cy: number, rx: number, ry: number, color: RGB, lift: number, glow: number) {
  const x0 = Math.max(0, Math.floor(cx - rx))
  const x1 = Math.min(W - 1, Math.ceil(cx + rx))
  const y0 = Math.max(0, Math.floor(cy - ry))
  const y1 = Math.min(H - 1, Math.ceil(cy + ry))
  const lr = color[0] * lift
  const lg = color[1] * lift
  const lb = color[2] * lift
  const gr = color[0] * glow
  const gg = color[1] * glow
  const gb = color[2] * glow
  for (let y = y0; y <= y1; y++) {
    const dy = (y + 0.5 - cy) / ry
    for (let x = x0; x <= x1; x++) {
      const dx = (x + 0.5 - cx) / rx
      const d = 1 - dx * dx - dy * dy
      if (d <= 0) continue
      const f = d * d
      const o = (y * W + x) * 3
      hdr[o] += (hdr[o] * lr + gr) * f
      hdr[o + 1] += (hdr[o + 1] * lg + gg) * f
      hdr[o + 2] += (hdr[o + 2] * lb + gb) * f
    }
  }
}
