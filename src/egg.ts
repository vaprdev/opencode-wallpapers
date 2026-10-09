// Easter eggs: one very rare event per wallpaper. The wait is at least half an hour of viewing plus a random,
// memoryless stretch, about an hour and a half on average. WALLPAPER_EGG=1 brings each one on within seconds.
// Returns real seconds; scenes count it down in their own slowed time, so they multiply by TIME_SCALE.
export function eggWait() {
  if (process.env.WALLPAPER_EGG === "1") return 3
  return 1800 - Math.log(1 - Math.random()) * 3600
}
