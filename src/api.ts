// The public API for wallpapers, imported as "opencode-wallpapers/api". Nothing here depends on OpenCode or OpenTUI.
export { Canvas, cap, ell, type Lighting, type Part } from "./canvas"
export { eggWait } from "./egg"
export { bird, flyAway, startle, type Flier } from "./flock"
export { haze, mottle } from "./grade"
export { campfire, fireflyLight, lightPool } from "./light"
export { TAU, clamp, fbm1, fbm2, hash, hash2, hashString, hsv, lerp, noise1, noise2, rand, smoothstep, type RGB } from "./math"
export { STAR_TINTS, driftClouds, makeClouds, makeShadows, makeStars, makeStorm, paintClouds, paintHaze, paintShadows, paintSky, paintStars, paintStorm, type Cloud, type CloudKind, type Orb, type Star } from "./sky"
export {
  ACTIVITIES,
  AGENT_EVENTS,
  SEASONS,
  TIMES,
  WEATHERS,
  type Activity,
  type AgentEvent,
  type Brightness,
  type Scene,
  type Scrim,
  type Season,
  type Settings,
  type Time,
  type Wallpaper,
  type Weather,
} from "./wallpaper"
export { WeatherLayer } from "./weather"
