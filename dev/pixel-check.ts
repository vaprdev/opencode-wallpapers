// Exercises real-pixel mode (WALLPAPER_PIXELS=1) against a mock kitty-capable renderer and saves the image it would
// send: bun dev/pixel-check.ts [wallpaper] [calm|lively|teeming]
import { mkdirSync } from "node:fs"
import { ACTIVITIES } from "../src/engine"
import { WALLPAPERS } from "../wallpapers"
import { H, W, mockScreen, text } from "./mock"
import { encodePng } from "./png"

const wallpaper = WALLPAPERS.find((w) => w.id === (process.argv[2] ?? WALLPAPERS[0].id))
if (!wallpaper) throw new Error(`usage: bun dev/pixel-check.ts [${WALLPAPERS.map((w) => w.id).join("|")}]`)
process.env.WALLPAPER_PIXELS = "1"
mkdirSync("dev/out", { recursive: true })
const RESERVED = 0x40000010
const screen = mockScreen({ kitty: true })
let placements = 0
let image: { width: number; height: number; pixels: Uint8Array } | undefined
const drawImage = (source: { width: number; height: number; copyTo(out: Uint8Array): void }) => {
  placements++
  screen.buffers.char.fill(RESERVED)
  image = { width: source.width, height: source.height, pixels: new Uint8Array(source.width * source.height * 4) }
  source.copyTo(image.pixels)
  return true
}
screen.engine.mode = "behind"
screen.engine.start(wallpaper, ACTIVITIES.find((a) => a === process.argv[3]) ?? "calm")
let ms = 0
const frames = 90
for (let f = 0; f < frames; f++) {
  const start = Bun.nanoseconds()
  screen.frame(text, { drawImage })
  if (f >= 30) ms += (Bun.nanoseconds() - start) / 1e6
}
let reserved = 0
let reservedText = 0
for (let i = 0; i < W * H; i++) {
  if (screen.buffers.char[i] !== RESERVED) continue
  reserved++
  if (text(i % W, (i / W) | 0) !== 32) reservedText++
}
console.log({ placementsPerFrame: placements / frames, image: image && `${image.width}x${image.height}`, reserved, reservedText, msPerFrame: (ms / (frames - 30)).toFixed(2) })
screen.engine.stop()
console.log("transport restored:", screen.renderer.kittyImageTransport)
if (image) await Bun.write(`dev/out/${wallpaper.id}-pixels.png`, encodePng(image.pixels, image.width, image.height))
