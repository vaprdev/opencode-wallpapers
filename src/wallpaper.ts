import type { RGB } from "./math"

// A wallpaper's animation. Each frame the engine resizes the scene to the sub-pixel grid it needs, steps it by the
// elapsed seconds, renders it, and reads `pixels` (RGBA, W x H; only resize may replace the array). Extending Canvas
// provides everything but step and render.
export interface Scene {
  readonly W: number
  readonly H: number
  readonly pixels: Uint8Array
  resize(W: number, H: number): void
  step(dt: number): void
  render(): void
}

export interface Wallpaper {
  // Used by /wallpaper <id>; lowercase, no spaces.
  readonly id: string
  readonly name: string
  readonly description: string
  // For each time of day, colors (0-255) that text scrims fade the scene toward at the top, middle and bottom of the
  // screen. Darker, more saturated versions of the scene's own colors at those depths read better than black.
  readonly scrim: Readonly<Record<Time, Scrim>>
  // What each activity level shows, for the picker.
  readonly activity: Readonly<Record<Activity, string>>
  create(settings: Settings): Scene
}

export type Scrim = readonly [RGB, RGB, RGB]

export interface Settings {
  readonly activity: Activity
  readonly time: Time
}

// How much is going on in the scene. calm is scenery with rare events; teeming is the full cast.
export const ACTIVITIES = ["calm", "lively", "teeming"] as const
export type Activity = (typeof ACTIVITIES)[number]

export const TIMES = ["day", "sunset", "night"] as const
export type Time = (typeof TIMES)[number]
