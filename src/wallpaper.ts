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
  // Optional: what the OpenCode agent is doing. Scenes bring on a rare visitor when a task is done and turn overcast
  // after an error until the next event (the engine sends idle a couple of minutes later); the engine itself speeds up
  // while busy and dims after an error.
  react?(event: AgentEvent): void
  // Optional reaction to a click on open background, in screen heights: x runs 0..W/H across and y 0..1 down.
  poke?(x: number, y: number): void
}

export const AGENT_EVENTS = ["busy", "idle", "done", "error"] as const
export type AgentEvent = (typeof AGENT_EVENTS)[number]

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
  // Defaults to normal. The engine applies it, and changing only this restyles the running scene instead of
  // restarting it.
  readonly brightness?: Brightness
  // Without a season a wallpaper shows its classic look; without weather it picks its own (see src/weather.ts).
  readonly season?: Season
  readonly weather?: Weather
}

// How much is going on in the scene. calm is scenery with rare events; teeming is the full cast.
export const ACTIVITIES = ["calm", "lively", "teeming"] as const
export type Activity = (typeof ACTIVITIES)[number]

export const TIMES = ["day", "sunset", "night"] as const
export type Time = (typeof TIMES)[number]

export const SEASONS = ["spring", "summer", "autumn", "winter"] as const
export type Season = (typeof SEASONS)[number]

export const WEATHERS = ["clear", "overcast", "rain", "snow", "fog"] as const
export type Weather = (typeof WEATHERS)[number]

export const BRIGHTNESSES = ["subtle", "normal", "vivid"] as const
export type Brightness = (typeof BRIGHTNESSES)[number]

// saver slows down when nobody is using OpenCode and stops while the terminal is in the background; smooth never does.
export const POWERS = ["saver", "smooth"] as const
export type Power = (typeof POWERS)[number]
