// Runs OpenCode in a PTY that answers like a kitty-graphics terminal, with a wallpaper in real-pixel mode, then decodes
// the last image it was sent. Needs this plugin installed: bun dev/pty-kitty.ts [wallpaper] [seconds]
import { encodePng } from "./png"

const wallpaper = process.argv[2] ?? "aquarium"
const seconds = Number(process.argv[3] ?? 20)
const COLS = 160
const ROWS = 45
const PX_W = COLS * 8
const PX_H = ROWS * 16
let pending = ""
const images = new Map<number, { w: number; h: number; chunks: string[] }>()
let lastImage: { w: number; h: number; data: string } | undefined
let transmissions = 0
let placements = 0
let bytes = 0

const proc = Bun.spawn(["opencode", "--standalone", "-c"], {
  cwd: process.env.HOME,
  env: { ...process.env, TERM: "xterm-kitty", TERM_PROGRAM: "ghostty", COLORTERM: "truecolor", WALLPAPER: wallpaper, WALLPAPER_PIXELS: "1", WALLPAPER_TRANSPORT: "raw", WALLPAPER_DEBUG: `${process.cwd()}/dev/out/debug.log` },
  terminal: {
    cols: COLS,
    rows: ROWS,
    data(term, data: Uint8Array) {
      bytes += data.length
      const text = new TextDecoder().decode(data)
      pending += text
      // Answer the capability handshake the way Ghostty would.
      const replies: [string, string][] = [
        ["\x1b[c", "\x1b[?62;22c"],
        ["\x1b[>0q", "\x1bP>|ghostty 1.3.1\x1b\\"],
        ["\x1b[6n", "\x1b[1;1R"],
        ["\x1b[?u", "\x1b[?0u"],
        ["\x1b[14t", `\x1b[4;${PX_H};${PX_W}t`],
        ["\x1b[16t", "\x1b[6;16;8t"],
      ]
      for (const [query, reply] of replies) if (text.includes(query)) term.write(reply)
      for (const m of pending.matchAll(/\x1b_G([^;\x1b]*)(?:;([^\x1b]*))?\x1b\\/g)) {
        const keys = Object.fromEntries(m[1].split(",").map((kv) => kv.split("=")))
        if (keys.a === "q") term.write(`\x1b_Gi=${keys.i};OK\x1b\\`)
        if (keys.a === "p") placements++
        if (keys.a === "t" || keys.a === "T" || (!keys.a && keys.m !== undefined)) {
          if (keys.s) images.set(0, { w: Number(keys.s), h: Number(keys.v), chunks: [] })
          const img = images.get(0)
          if (img && m[2]) img.chunks.push(m[2])
          if (img && keys.m === "0") {
            lastImage = { w: img.w, h: img.h, data: img.chunks.join("") }
            transmissions++
          }
        }
      }
      const cut = pending.lastIndexOf("\x1b")
      pending = cut >= 0 ? pending.slice(cut) : ""
    },
  },
})
await Bun.sleep(seconds * 1000)
proc.kill()
await proc.exited
console.log({ bytesPerSecond: Math.round(bytes / seconds), transmissions, placements })
if (lastImage) {
  const raw = Buffer.from(lastImage.data, "base64")
  console.log(`last image ${lastImage.w}x${lastImage.h}, ${raw.length} bytes`)
  const channels = raw.length / (lastImage.w * lastImage.h)
  const rgba = new Uint8Array(lastImage.w * lastImage.h * 4)
  for (let i = 0; i < lastImage.w * lastImage.h; i++) {
    rgba[i * 4] = raw[i * channels]
    rgba[i * 4 + 1] = raw[i * channels + 1]
    rgba[i * 4 + 2] = raw[i * channels + 2]
    rgba[i * 4 + 3] = 255
  }
  if (channels === 3 || channels === 4) await Bun.write(`dev/out/${wallpaper}-kitty.png`, encodePng(rgba, lastImage.w, lastImage.h))
}
