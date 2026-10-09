import { homedir } from "node:os"
import { ACTIVITIES, TIMES, type Wallpaper } from "./wallpaper"

// Imports wallpapers from other packages. Each module is an absolute path (~/ allowed) or a package name resolvable from
// this plugin, and its default export is a Wallpaper or an array of them. Anything else is skipped, with the reason
// in `skipped`, so one broken package doesn't take the others down.
export async function loadWallpapers(modules: unknown, builtin: readonly Wallpaper[]) {
  const wallpapers: Wallpaper[] = []
  const skipped: string[] = []
  if (modules === undefined) return { wallpapers, skipped }
  if (!Array.isArray(modules)) return { wallpapers, skipped: ["the wallpapers option must be a list of module paths or package names"] }
  const taken = new Set(builtin.map((w) => w.id))
  for (const spec of modules) {
    if (typeof spec !== "string" || spec.startsWith(".")) {
      skipped.push(`${JSON.stringify(spec)}: use an absolute path or a package name`)
      continue
    }
    const loaded = await import(spec.startsWith("~/") ? homedir() + spec.slice(1) : spec).then(
      (module: { default?: unknown }) => module.default,
      // Bun's resolve errors aren't Error instances, but they have a message.
      (error: { message?: unknown } | undefined) => new Error(String(error?.message ?? error)),
    )
    if (loaded instanceof Error) {
      skipped.push(`${spec}: ${loaded.message}`)
      continue
    }
    if (loaded === undefined) {
      skipped.push(`${spec}: no default export (a Wallpaper or an array of them)`)
      continue
    }
    for (const value of Array.isArray(loaded) ? loaded : [loaded]) {
      const reason = problem(value, taken)
      if (reason) {
        skipped.push(`${spec}: ${reason}`)
        continue
      }
      const wallpaper = value as Wallpaper
      taken.add(wallpaper.id)
      wallpapers.push(wallpaper)
    }
  }
  return { wallpapers, skipped }
}

// Why a value can't be used as a wallpaper, if it can't.
function problem(value: unknown, taken: Set<string>) {
  if (typeof value !== "object" || value === null) return "not a wallpaper object"
  const w = value as Record<string, unknown>
  if (typeof w.id !== "string" || !/^[a-z0-9-]+$/.test(w.id)) return `id ${JSON.stringify(w.id)} must be lowercase letters, digits and dashes`
  if (taken.has(w.id)) return `id "${w.id}" is already taken`
  if (typeof w.name !== "string" || typeof w.description !== "string") return `${w.id}: name and description must be strings`
  if (typeof w.create !== "function") return `${w.id}: create must be a function`
  const activity = w.activity as Record<string, unknown> | undefined
  if (!ACTIVITIES.every((a) => typeof activity?.[a] === "string")) return `${w.id}: activity needs a description for each of ${ACTIVITIES.join(", ")}`
  const scrim = w.scrim as Record<string, unknown> | undefined
  const isScrim = (s: unknown) => Array.isArray(s) && s.length === 3 && s.every((c) => Array.isArray(c) && c.length === 3 && c.every((v) => typeof v === "number"))
  if (!TIMES.every((t) => isScrim(scrim?.[t]))) return `${w.id}: scrim needs three RGB colors for each of ${TIMES.join(", ")}`
}
