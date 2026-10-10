// A mock OpenCode screen (160x45 unless sized) driving the real engine, for headless checks.
import { createEngine } from "../src/engine"

export const W = 160
export const H = 45
export const FPS = 15

export function mockScreen(options: { kitty?: boolean; W?: number; H?: number } = {}) {
  const w = options.W ?? W
  const h = options.H ?? H
  // The engine advances on wall-clock time; each performance.now() call moves one engine frame forward.
  let clock = 0
  performance.now = () => (clock += 1000 / FPS)
  const buffers = { char: new Uint32Array(w * h), fg: new Uint16Array(w * h * 4), bg: new Uint16Array(w * h * 4), attributes: new Uint32Array(w * h) }
  let post: ((buffer: unknown) => void) | undefined
  let layer: ((buffer: unknown) => void) | undefined
  const renderer = {
    addPostProcessFn: (fn: typeof post) => (post = fn),
    removePostProcessFn: () => (post = undefined),
    requestRender() {},
    getCursorState: () => ({ x: 10, y: h - 5, visible: true }),
    on() {},
    off() {},
    stdin: { on() {}, off() {} },
    kittyImageTransport: "raw",
    root: {} as { onMouse?: unknown },
    ...(options.kitty ? { resolution: { width: w * 8, height: h * 16 }, capabilities: { kitty_graphics: true } } : {}),
  }
  const engine = createEngine({ renderer, data: { listen: () => () => {} } } as never, { layer: (_renderer, draw) => ((layer = draw as typeof layer), { dispose() {} }) })
  return {
    engine,
    buffers,
    renderer,
    // OpenCode's render pass: the back layer places its image first, then the UI paints every cell, then post-processing.
    frame(paint: (x: number, y: number) => number = () => 32, buffer: Record<string, unknown> = {}) {
      const buf = { width: w, height: h, buffers, ...buffer }
      layer?.(buf)
      for (let i = 0; i < w * h; i++) {
        buffers.char[i] = paint(i % w, (i / w) | 0)
        buffers.bg.set([10, 10, 12, 255], i * 4)
        buffers.fg.set([200, 200, 200, 255], i * 4)
      }
      post?.(buf)
    },
  }
}

// Some text-like cells so the scrim and text handling get exercised.
export const text = (x: number, y: number) => (y % 4 === 1 && x > 40 && x < 120 && x % 9 !== 0 ? 65 : 32)

// Where text sits on OpenCode's home screen, measured in a real one: a centered logo, a 76-column prompt below it and
// the version in the bottom-right corner.
export function home(w: number, h: number) {
  const c = Math.floor(h / 2)
  const left = Math.floor(w / 2) - 37
  const spans: [number, number, number][] = [
    ...[0, 1, 2, 3].map((r): [number, number, number] => [c - 6 + r, left + 18, left + 58]),
    [c - 1, left + 20, left + 56],
    [c + 2, left + 3, left + 58],
    [c + 4, left + 3, left + 32],
    [c + 6, left + 42, left + 75],
    ...[1, 2, 3, 4, 5].map((r): [number, number, number] => [c + r, left, left + 1]),
    [h - 2, w - 17, w - 2],
  ]
  return (x: number, y: number) => (spans.some((s) => s[0] === y && x >= s[1] && x < s[2]) ? 65 : 32)
}

// A session: a column of messages above the prompt, a status line, and from 120 columns a sidebar on the right.
export function session(w: number, h: number) {
  const right = w >= 120 ? w - 42 : w - 2
  return (x: number, y: number) => {
    if (y === h - 2) return x >= 2 && x < w - 2 && x % 23 < 15 ? 65 : 32
    if (x >= right + 2 && x < w - 2) return (y >= 2 && y < 4) || (y >= 6 && y < 15 && y % 3 === 0 && x < w - 16 - ((y * 7) % 12)) ? 65 : 32
    if (x < 2 || x >= right) return 32
    if (y >= h - 7 && y < h - 3) return y === h - 6 || (y === h - 4 && x < 30) ? 65 : 32
    if (y < 1 || y >= h - 8 || y % 6 === 5) return 32
    // Paragraphs of prose: every line fills the column except each paragraph's last.
    return y % 6 !== 4 || x < 2 + (right - 2) * (0.3 + ((y * 37) % 50) / 100) ? 65 : 32
  }
}
