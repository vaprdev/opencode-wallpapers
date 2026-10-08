// Drives a real OpenCode TUI in a PTY: bun dev/pty.ts [seconds] [keys...]
const seconds = Number(process.argv[2] ?? 12)
const keys = process.argv.slice(3)
let bytes = 0
let kitty = 0
let tail = ""
const proc = Bun.spawn(["opencode", "--standalone", ...(process.env.OC_ARGS ? process.env.OC_ARGS.split(" ") : [])], {
  cwd: process.env.HOME,
  env: { ...process.env, TERM: "xterm-kitty", TERM_PROGRAM: "ghostty", COLORTERM: "truecolor" },
  terminal: {
    cols: 160,
    rows: 45,
    data(_term, data: Uint8Array) {
      bytes += data.length
      const text = new TextDecoder().decode(data)
      kitty += text.split("\x1b_G").length - 1
      tail = (tail + text).slice(-20000)
    },
  },
})
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
await sleep(4000)
for (const k of keys) {
  proc.terminal!.write(k.replace(/\\r/g, "\r").replace(/\\e/g, "\x1b"))
  await sleep(1500)
}
const before = bytes
await sleep(seconds * 1000)
console.log(`bytes total=${bytes} during=${bytes - before} kittyCommands=${kitty}`)
const plain = tail.replace(/\x1b_G[^\x1b]*\x1b\\/g, "").replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, "").replace(/\x1b[^[]/g, "")
console.log(plain.slice(-1500))
proc.kill()
await proc.exited

export {}
