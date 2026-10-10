// A starter wallpaper: rolling hills with a tree, a hot-air balloon and birds. It is not registered in index.ts; try it
// with `WALLPAPER_MODULES=$PWD/wallpapers/template.ts bun dev/snap.ts template teeming day 30`. In a package of your
// own, import from "opencode-wallpapers/api" instead of "../src/api". See CONTRIBUTING.md.
import { Canvas, TAU, cap, clamp, driftClouds, ell, fbm1, makeClouds, makeStars, paintClouds, paintSky, paintStars, type Activity, type Cloud, type Lighting, type Orb, type RGB, type Settings, type Star, type Time, type Wallpaper } from "../src/api"

// Every wallpaper runs slower than real time, and its creatures slower still, so nothing is busy behind text.
const TIME_SCALE = 0.35
const CREATURE_SPEED = 0.25

// Everything that changes with the time of day. Objects keep one daytime color each and are darkened by `tint`
// (see paint), so a new object needs no per-time colors. Night uses saturated blues and amber, never white or gray:
// text on top is white.
interface Look {
  style: Lighting["style"]
  light: RGB
  sky: [number, RGB][]
  orb: Orb
  stars: number
  clouds: { top: RGB; bottom: RGB; alpha: number }
  hills: [far: RGB, near: RGB]
  tint: RGB
  night: boolean
}

const LOOKS: Record<Time, Look> = {
  day: {
    style: "front",
    light: [1, 0.97, 0.88],
    sky: [
      [0, [0.1, 0.35, 0.75]],
      [0.6, [0.65, 0.82, 0.92]],
    ],
    orb: { x: 0.2, y: 0.15, r: 0.035, core: [5, 4.6, 3.8], glow: [1, 0.95, 0.8], near: 0.45, wide: 0.12 },
    stars: 0,
    clouds: { top: [1.1, 1.1, 1.1], bottom: [0.6, 0.68, 0.8], alpha: 0.9 },
    hills: [
      [0.3, 0.5, 0.35],
      [0.22, 0.48, 0.16],
    ],
    tint: [1, 1, 1],
    night: false,
  },
  sunset: {
    style: "rim",
    light: [1, 0.5, 0.2],
    sky: [
      [0, [0.05, 0.03, 0.1]],
      [0.35, [0.45, 0.14, 0.14]],
      [0.62, [1, 0.5, 0.18]],
    ],
    orb: { x: 0.6, y: 0.58, r: 0.055, core: [3.2, 1.7, 0.6], glow: [1, 0.42, 0.14], near: 0.5, wide: 0.25 },
    stars: 25,
    clouds: { top: [0.1, 0.035, 0.09], bottom: [0.8, 0.3, 0.2], alpha: 0.6 },
    hills: [
      [0.2, 0.08, 0.1],
      [0.07, 0.04, 0.05],
    ],
    tint: [0.22, 0.13, 0.1],
    night: false,
  },
  night: {
    style: "rim",
    light: [0.2, 0.45, 1],
    sky: [
      [0, [0.004, 0.008, 0.03]],
      [0.6, [0.04, 0.06, 0.15]],
    ],
    // A gold moon rather than a white one.
    orb: { x: 0.75, y: 0.16, r: 0.03, core: [1, 0.72, 0.3], glow: [0.45, 0.3, 0.12], near: 0.2, wide: 0.08, moon: true },
    stars: 140,
    clouds: { top: [0.015, 0.02, 0.05], bottom: [0.06, 0.1, 0.3], alpha: 0.4 },
    hills: [
      [0.03, 0.05, 0.13],
      [0.015, 0.03, 0.08],
    ],
    tint: [0.025, 0.04, 0.09],
    night: true,
  },
}

// Daylight from the upper left, where the sun is: x right, y down, z toward the viewer.
const DAYLIGHT = (() => {
  const l = Math.hypot(0.5, 0.6, 0.6)
  return [-0.5 / l, -0.6 / l, 0.6 / l] as const
})()

class Template extends Canvas {
  private time = 0
  private creatureTime = 0
  private readonly activity: Activity
  private readonly look: Look
  private lighting: Lighting = { style: "front", dir: DAYLIGHT }
  private stars: Star[]
  private clouds: Cloud[]
  private balloon = { x: 0.3, phase: 0 }

  constructor(settings: Settings) {
    super()
    this.activity = settings.activity
    this.look = LOOKS[settings.time]
    this.stars = makeStars(this.look.stars, 0.55)
    this.clouds = makeClouds(4, true, 0.08, 0.3)
  }

  // Advances the scene by dt seconds. Clamp dt so a stalled frame doesn't make things jump.
  step(dt: number) {
    dt = clamp(dt, 0, 0.1) * TIME_SCALE
    this.time += dt
    this.creatureTime += dt * CREATURE_SPEED
    driftClouds(this.clouds, this.A, dt)
    this.balloon.x += 0.02 * dt
    if (this.balloon.x > this.A + 0.2) this.balloon.x = -0.2
  }

  // Draws one frame into hdr (linear light; values above about 0.8 bloom), then finish() tone-maps it into pixels.
  render() {
    this.hdr.set(this.background)
    paintStars(this.hdr, this.W, this.H, this.stars, this.time, 0.55, 0.5)
    paintClouds(this.hdr, this.W, this.H, this.clouds, this.look.clouds.top, this.look.clouds.bottom, this.look.clouds.alpha, true)
    if (this.activity !== "calm") this.drawBalloon()
    if (this.activity === "teeming" && this.look.night) this.drawFireflies()
    if (this.activity === "teeming" && !this.look.night) this.drawBirds()
    this.finish()
  }

  // Runs after every resize. Whatever never moves is painted here once, kept as `background` and copied in at the start
  // of each frame.
  protected override layout() {
    const { W, H, A, look, hdr } = this
    // Rim light comes from the sun or moon's position in pixels; front light from a direction.
    this.lighting = look.style === "front" ? { style: "front", dir: DAYLIGHT } : { style: "rim", color: look.light, x: look.orb.x * W, y: look.orb.y * H }
    paintSky(hdr, W, H, look.sky, look.orb, this.px)
    // Two ridges of hills, the near one darker and lower. Scene units are fractions of the height: x runs 0..A.
    for (const [layer, color] of look.hills.entries())
      for (let x = 0; x < W; x++) {
        const u = x / H
        const ridge = (0.6 + layer * 0.12 + (fbm1(u * 1.5 + layer * 7, layer) - 0.5) * 0.15) * H
        for (let y = Math.max(0, Math.floor(ridge)); y < H; y++) {
          const shade = 0.85 + 0.15 * Math.min(1, (y - ridge) / (0.2 * H))
          const o = (y * W + x) * 3
          hdr[o] = color[0] * shade
          hdr[o + 1] = color[1] * shade
          hdr[o + 2] = color[2] * shade
        }
      }
    // A tree on the near hill: shape() joins the parts into one lit form.
    const [tx, ty] = [0.8 * A * H, 0.86 * H]
    this.shape([cap(tx, ty, tx, ty - 0.12 * H, 0.012 * H, 0.008 * H, this.paint([0.4, 0.28, 0.18]))], this.lighting)
    const leaves = this.paint([0.2, 0.42, 0.14])
    this.shape([ell(tx, ty - 0.18 * H, 0.07 * H, 0.06 * H, 0, leaves), ell(tx - 0.05 * H, ty - 0.14 * H, 0.045 * H, 0.04 * H, 0, leaves), ell(tx + 0.05 * H, ty - 0.14 * H, 0.045 * H, 0.04 * H, 0, leaves)], this.lighting)
  }

  // A daytime color as it looks at this time of day.
  private paint(c: RGB): RGB {
    const t = this.look.tint
    return [c[0] * t[0], c[1] * t[1], c[2] * t[2]]
  }

  // A striped balloon bobbing as it drifts; at night its burner glows amber.
  private drawBalloon() {
    const H = this.H
    const x = this.balloon.x * H
    const y = (0.3 + Math.sin(this.time * 0.6) * 0.01) * H
    const s = 0.08 * H
    const rope = this.paint([0.3, 0.22, 0.15])
    this.shape([ell(x, y, s * 0.8, s, 0, this.paint([0.85, 0.2, 0.15])), cap(x, y + s * 0.5, x, y + s * 1.05, s * 0.55, s * 0.18, this.paint([0.85, 0.2, 0.15]))], this.lighting)
    // A second shape() call draws on top; within one call the deepest part wins, so the stripe would vanish.
    this.shape([ell(x, y, s * 0.25, s * 0.98, 0, this.paint([0.95, 0.75, 0.2]))], this.lighting, 0.6)
    this.shape([cap(x - s * 0.15, y + s * 1.05, x - s * 0.12, y + s * 1.35, s * 0.02, s * 0.02, rope), cap(x + s * 0.15, y + s * 1.05, x + s * 0.12, y + s * 1.35, s * 0.02, s * 0.02, rope)], this.lighting, 0)
    this.polygon([[x - s * 0.15, y + s * 1.35], [x + s * 0.15, y + s * 1.35], [x + s * 0.12, y + s * 1.55], [x - s * 0.12, y + s * 1.55]], this.paint([0.45, 0.3, 0.15]))
    if (this.look.night) this.disc(x, y + s * 1.1, s * 0.12, 1.6, 0.7, 0.2, 0.9)
  }

  // A few birds circling, wings beating; they move on creature time.
  private drawBirds() {
    const H = this.H
    const color = this.paint([0.12, 0.1, 0.1])
    for (let i = 0; i < 3; i++) {
      const a = this.creatureTime * (0.5 + i * 0.1) + i * 2.1
      const x = (0.45 * this.A + Math.cos(a) * (0.2 + i * 0.05)) * H
      const y = (0.2 + Math.sin(a) * 0.04 + i * 0.03) * H
      const flap = Math.sin(this.time * 4 + i) * 0.5
      const s = 0.02 * H
      this.shape([cap(x, y, x - s, y - s * flap, 0.12 * s, 0.05 * s, color), cap(x, y, x + s, y - s * flap, 0.12 * s, 0.05 * s, color)], this.lighting, 0)
    }
  }

  // Amber fireflies over the hills, pulsing slowly: a night counterpart to the birds.
  private drawFireflies() {
    const H = this.H
    for (let i = 0; i < 14; i++) {
      const x = ((i * 0.37) % 1) * this.A * H + Math.sin(this.creatureTime * 2 + i) * 0.03 * H
      const y = (0.75 + ((i * 0.53) % 1) * 0.2 + Math.cos(this.creatureTime * 1.7 + i * 2) * 0.02) * H
      const glow = Math.max(0, Math.sin(this.time * 1.5 + i * TAU * 0.37))
      if (glow > 0) this.disc(x, y, 0.004 * H, 1.4, 0.9, 0.25, glow)
    }
  }
}

const template: Wallpaper = {
  // Lowercase letters, digits and dashes: it is what `/wallpaper <id>` takes.
  id: "template",
  name: "Template",
  description: "Rolling hills with a tree under drifting clouds, and a hot-air balloon now and then",
  // What each activity level adds, shown in the /wallpaper menu.
  activity: {
    calm: "Hills, a tree and clouds",
    lively: "Adds a hot-air balloon",
    teeming: "Adds birds (fireflies at night)",
  },
  // Colors (0-255) the scene fades toward behind text at the top, middle and bottom of the screen: dark, saturated
  // versions of the scene's own colors at those depths.
  scrim: {
    day: [
      [18, 38, 70],
      [26, 46, 52],
      [14, 34, 14],
    ],
    sunset: [
      [26, 12, 26],
      [40, 16, 18],
      [12, 6, 8],
    ],
    night: [
      [3, 6, 16],
      [3, 7, 16],
      [2, 4, 10],
    ],
  },
  create: (settings) => new Template(settings),
}

// A package's wallpapers are its module's default export: one wallpaper or an array. Built-in wallpapers use a named
// export instead and are listed in wallpapers/index.ts.
export default template
