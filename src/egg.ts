// Easter eggs: one very rare event per wallpaper. The wait is at least half an hour of viewing plus a random,
// memoryless stretch, about an hour and a half on average. Every scene in the process shares one wait, so a scene
// restart (a settings change, a new time of day, a crossfade) doesn't start it over; only restarting OpenCode does.
// WALLPAPER_EGG=1 brings each one on within seconds.
// Returns real seconds; scenes count it down in their own slowed time, so they multiply by TIME_SCALE. Pass next once
// the egg is over, to start the following wait.
let viewed = 0
let due = -1

export function eggWait(next = false) {
  if (process.env.WALLPAPER_EGG === "1") return 3
  // Drawn on every call, used or not, so seeded dev renders don't depend on what ran before.
  const wait = 1800 - Math.log(1 - Math.random()) * 3600
  if (next || due < 0) due = viewed + wait
  return Math.max(0, due - viewed)
}

// The engine adds the real seconds it animates; paused time doesn't count toward the wait.
export function watchEgg(seconds: number) {
  viewed += seconds
}
