// Re-renders the README gallery (teeming at 45 s via dev/snap.ts) and fails if any screenshot differs from the
// committed one beyond a tiny tolerance; --update writes the fresh renders instead: bun dev/screenshots.ts [--update]
import { availableParallelism } from "node:os"
import { TIMES } from "../src/engine"
import { WALLPAPERS } from "../wallpapers"
import { decodePng } from "./png"

const update = process.argv.includes("--update")
const shots = WALLPAPERS.flatMap((w) => TIMES.map((time) => ({ id: w.id, time, file: `screenshots/${w.id}${time === "day" ? "" : `-${time}`}.png` })))
const queue = [...shots]
const stale: string[] = []
await Promise.all(
  Array.from({ length: availableParallelism() }, async () => {
    for (let shot = queue.shift(); shot; shot = queue.shift()) {
      const snap = Bun.spawn(["bun", "dev/snap.ts", shot.id, "teeming", shot.time, "45"], { stdout: "ignore" })
      if (await snap.exited) throw new Error(`dev/snap.ts ${shot.id} teeming ${shot.time} 45 failed`)
      const fresh = await Bun.file(`dev/out/${shot.id}-teeming-${shot.time}-45s.png`).bytes()
      if (update) {
        await Bun.write(shot.file, fresh)
        continue
      }
      const committed = Bun.file(shot.file)
      if (!(await committed.exists())) {
        stale.push(`${shot.file}: missing`)
        continue
      }
      const a = decodePng(fresh)
      const b = decodePng(await committed.bytes())
      if (a.width !== b.width || a.height !== b.height) {
        stale.push(`${shot.file}: ${b.width}x${b.height}, expected ${a.width}x${a.height}`)
        continue
      }
      // Math functions round slightly differently across CPUs, which can flip a threshold here and there: city at night
      // drew 92 pixels differently on GitHub's Linux x64 than on macOS arm64. Real scene changes touch far more.
      let differ = 0
      for (let p = 0; p < a.rgba.length; p += 4) {
        if (Math.max(Math.abs(a.rgba[p] - b.rgba[p]), Math.abs(a.rgba[p + 1] - b.rgba[p + 1]), Math.abs(a.rgba[p + 2] - b.rgba[p + 2])) > 2) differ++
      }
      if (differ > a.width * a.height * 0.0005) stale.push(`${shot.file}: ${differ} pixels differ`)
    }
  }),
)
if (update) {
  console.log(`wrote ${shots.length} screenshots`)
  process.exit(0)
}
if (!stale.length) {
  console.log(`${shots.length} screenshots up to date`)
  process.exit(0)
}
console.log(`${stale.sort().join("\n")}\nstale screenshots: run bun dev/screenshots.ts --update and commit the result (fresh renders are in dev/out)`)
process.exit(1)
