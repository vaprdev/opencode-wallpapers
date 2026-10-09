// The built-in wallpapers plus any listed in WALLPAPER_MODULES (comma-separated absolute paths or package names), so the
// dev tools work on wallpapers that live outside this repository.
import { loadWallpapers } from "../src/load"
import { WALLPAPERS } from "../wallpapers"

const external = await loadWallpapers(process.env.WALLPAPER_MODULES?.split(","), WALLPAPERS)
for (const reason of external.skipped) console.error(`skipped ${reason}`)

export const wallpapers = [...WALLPAPERS, ...external.wallpapers]
