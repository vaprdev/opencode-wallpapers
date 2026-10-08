// A mock 160x45 OpenCode screen driving the real engine, for headless checks.
import { createEngine } from "../src/engine"

export const W = 160
export const H = 45
export const FPS = 15

export function mockScreen(options: { kitty?: boolean } = {}) {
  // The engine advances on wall-clock time; each performance.now() call moves one engine frame forward.
  let clock = 0
  performance.now = () => (clock += 1000 / FPS)
  const buffers = { char: new Uint32Array(W * H), fg: new Uint16Array(W * H * 4), bg: new Uint16Array(W * H * 4), attributes: new Uint32Array(W * H) }
  let post: ((buffer: unknown) => void) | undefined
  let layer: ((buffer: unknown) => void) | undefined
  const renderer = {
    addPostProcessFn: (fn: typeof post) => (post = fn),
    removePostProcessFn: () => (post = undefined),
    requestRender() {},
    getCursorState: () => ({ x: 10, y: 40, visible: true }),
    kittyImageTransport: "raw",
    ...(options.kitty ? { resolution: { width: W * 8, height: H * 16 }, capabilities: { kitty_graphics: true } } : {}),
  }
  const engine = createEngine({ renderer } as never, { layer: (_renderer, draw) => ((layer = draw as typeof layer), { dispose() {} }) })
  return {
    engine,
    buffers,
    renderer,
    // OpenCode's render pass: the back layer places its image first, then the UI paints every cell, then post-processing.
    frame(paint: (x: number, y: number) => number = () => 32, buffer: Record<string, unknown> = {}) {
      const buf = { width: W, height: H, buffers, ...buffer }
      layer?.(buf)
      for (let i = 0; i < W * H; i++) {
        buffers.char[i] = paint(i % W, (i / W) | 0)
        buffers.bg.set([10, 10, 12, 255], i * 4)
        buffers.fg.set([200, 200, 200, 255], i * 4)
      }
      post?.(buf)
    },
  }
}

// Some text-like cells so the scrim and text handling get exercised.
export const text = (x: number, y: number) => (y % 4 === 1 && x > 40 && x < 120 && x % 9 !== 0 ? 65 : 32)
