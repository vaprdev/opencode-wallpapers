// Measures a real OpenCode's CPU in a PTY: bun dev/cpu.ts <seconds> [keys...]
// Writes the keys (1.5 s apart), then reports the CPU time OpenCode and its children used over <seconds>.
// CPU_TYPE=<ms> types and erases a character every <ms> while sampling, like someone typing; CPU_WAIT=<seconds> waits
// after the keys before sampling, to measure the idle frame rate.
const seconds = Number(process.argv[2] ?? 60)
const keys = process.argv.slice(3)
const typing = Number(process.env.CPU_TYPE ?? 0)
const wait = Number(process.env.CPU_WAIT ?? 2)
const proc = Bun.spawn(["opencode", "--standalone"], {
  cwd: process.env.HOME,
  env: { ...process.env, TERM: "xterm-kitty", TERM_PROGRAM: "ghostty", COLORTERM: "truecolor" },
  terminal: { cols: 160, rows: 45, data() {} },
})
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const write = (k: string) => proc.terminal!.write(k.replace(/\\r/g, "\r").replace(/\\e/g, "\x1b"))

// Total CPU seconds of the process tree, from ps's cumulative TIME column (m:ss.cc or h:mm:ss.cc).
const cpu = async () => {
  const rows = (await new Response(Bun.spawn(["ps", "-A", "-o", "pid=,ppid=,time="]).stdout).text())
    .trim()
    .split("\n")
    .map((line) => line.trim().split(/\s+/))
  const tree = new Set([proc.pid])
  for (let grew = true; grew; ) {
    grew = false
    for (const [pid, ppid] of rows)
      if (tree.has(Number(ppid)) && !tree.has(Number(pid))) ((grew = true), tree.add(Number(pid)))
  }
  return rows
    .filter(([pid]) => tree.has(Number(pid)))
    .reduce((sum, row) => sum + row[2].split(":").reduce((total, part) => total * 60 + Number(part), 0), 0)
}

await sleep(6000)
for (const k of keys) {
  write(k)
  await sleep(1500)
}
await sleep(wait * 1000)
const typer = typing ? setInterval(() => (write("a"), setTimeout(() => write("\x7f"), typing / 2)), typing) : undefined
const start = await cpu()
const began = performance.now()
const samples: number[] = []
let last = start
for (let s = 0; s < seconds / 5; s++) {
  await sleep(5000)
  const now = await cpu()
  samples.push(((now - last) / 5) * 100)
  last = now
}
clearInterval(typer)
const total = ((last - start) / ((performance.now() - began) / 1000)) * 100
console.log(`cpu ${total.toFixed(1)}% over ${seconds}s; per 5s: ${samples.map((v) => v.toFixed(0)).join(" ")}`)
proc.kill()
await proc.exited

export {}
