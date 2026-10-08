export type RGB = [number, number, number]

export function clamp(value: number, min: number, max: number) {
  return value < min ? min : value > max ? max : value
}

export function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t
}

export function smoothstep(edge0: number, edge1: number, x: number) {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1)
  return t * t * (3 - 2 * t)
}

export function rand(min: number, max: number) {
  return min + Math.random() * (max - min)
}

export function hash(n: number) {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453123
  return s - Math.floor(s)
}

export function hash2(x: number, y: number) {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123
  return s - Math.floor(s)
}

export function noise1(x: number, seed = 0) {
  const i = Math.floor(x)
  const f = x - i
  const u = f * f * (3 - 2 * f)
  return lerp(hash(i + seed * 57.3), hash(i + 1 + seed * 57.3), u)
}

export function fbm1(x: number, seed = 0, octaves = 4) {
  let sum = 0
  let amp = 0.5
  let freq = 1
  for (let i = 0; i < octaves; i++) {
    sum += noise1(x * freq, seed + i * 13) * amp
    freq *= 2
    amp *= 0.5
  }
  return sum
}
