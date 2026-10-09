// Replaces Math.random with a seeded generator (mulberry32) so dev renders are reproducible. Import it before anything
// that draws random numbers.
let state = 1
Math.random = () => {
  state = (state + 0x6d2b79f5) | 0
  let t = Math.imul(state ^ (state >>> 15), 1 | state)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

export function seed(n: number) {
  state = n | 0
}
