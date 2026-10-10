# Making wallpapers

A wallpaper is a TypeScript module that draws a slow scene into a float buffer. The plugin turns that buffer into
terminal cells behind OpenCode's text. You can add a wallpaper to this repository, or publish it as a package of your
own and load it with a plugin option (see [Your own package](#your-own-package)).

## Quick start

```sh
git clone https://github.com/vaprdev/opencode-wallpapers.git && cd opencode-wallpapers
bun install
cp wallpapers/template.ts wallpapers/meadow.ts   # then change its id to "meadow"
WALLPAPER_MODULES=$PWD/wallpapers/meadow.ts bun dev/snap.ts meadow teeming night 30
```

`wallpapers/template.ts` is a short, commented wallpaper with hills, a tree, a balloon and birds. It covers the
basics below. `wallpapers/farm.ts` is a complete outdoor wallpaper with seasons, weather, agent reactions, clicks and
an easter egg. `WALLPAPER_MODULES` (comma-separated absolute paths) adds
wallpapers that aren't registered in `wallpapers/index.ts` to the dev tools.

## How a wallpaper works

A `Wallpaper` (from `src/wallpaper.ts`) describes the wallpaper for the menu and creates its scene:

```ts
export const meadow: Wallpaper = {
  id: "meadow", // what /wallpaper takes: lowercase letters, digits and dashes
  name: "Meadow",
  description: "Rolling hills with a tree under drifting clouds",
  activity: { calm: "…", lively: "…", teeming: "…" }, // what each level shows, for the menu
  scrim: { day: [top, middle, bottom], sunset: […], night: […] }, // see Scrim
  create: (settings) => new Meadow(settings), // activity and time, and optionally season and weather
}
```

A new scene is created whenever the wallpaper, activity, time of day, season or weather changes, so a scene never has
to switch looks on its own; while the old scene crossfades into the new one, both run. Up to 15 times a second the
engine calls `resize(W, H)` with the grid it needs, then `step(dt)` with the elapsed seconds (several times per frame
when idle at 5 fps, never more than 0.1 s at a time), then `render()`, and reads `pixels`. Extend `Canvas` (from
`src/canvas.ts`) and you only write `step` and `render`. Brightness is applied by the engine, so scenes ignore it.

The grid is small: a 160x45 terminal is 320x180 sub-pixels in character mode (2x4 per cell), and 480x270 in pixel mode.
`bun dev/snap.ts` renders at 720x400. Size things as fractions of the height `H`. Most scenes use x from 0 to `A` (the
aspect ratio, `W / H`) and y from 0 to 1, and multiply by `H` to get pixels.

In character mode each cell shows only two colors, so anything thinner than about 2 sub-pixels, and any texture finer
than a cell, turns into speckle and shimmers as it moves. `Canvas` sets `this.cells` then (not in snaps or pixel mode),
so a scene can draw bolder there: `thick(radius, min)` gives a stroke radius in pixels that never drops below `min` on
cells, `blade(spine, widths, color)` draws a frond's leaflets as one scalloped blade, and textures can coarsen or drop
out. Judge it with `bun dev/preview.ts`, and with `WALLPAPER_OCTANTS=0` for quadrant terminals.

### step and render

`step(dt)` moves things. Clamp `dt` so a stalled frame doesn't make things jump, then scale it:

```ts
const TIME_SCALE = 0.35 // the scene runs at about a third of real time
const CREATURE_SPEED = 0.25 // animals and people at a quarter of scene speed

step(dt: number) {
  dt = clamp(dt, 0, 0.1) * TIME_SCALE
  this.time += dt
  this.creatureTime += dt * CREATURE_SPEED
}
```

`render()` draws linear light into `this.hdr` (3 floats per pixel, row-major) and ends with `this.finish()`, which
adds bloom (values above about 0.8 glow), a vignette and tone mapping into `pixels`. `finish(exposure)` takes an
exposure, 1.25 by default.

### layout() for static backgrounds

`layout()` runs after every resize, once the buffers match the new size. Paint whatever never moves there (sky,
mountains, buildings, a tree); `Canvas` keeps the result in `this.background`, and each frame starts from it:

```ts
protected override layout() {
  paintSky(this.hdr, this.W, this.H, this.look.sky, this.look.orb, this.px)
  // …hills, a tree…
}

render() {
  this.hdr.set(this.background)
  // …moving things…
  this.finish()
}
```

This is the biggest single saving: a full-screen gradient with noise costs more than every creature together. It
also makes `finish()` cheaper: it blooms and tone-maps whatever `layout()` leaves in `hdr` once, then each frame only
redoes the 4x4 blocks that differ from it and the bloom they change. So leave `hdr` holding the background at the end
of `layout()`, and avoid full-screen per-frame passes where a static one will do.

The background is supersampled, so every static edge is anti-aliased: `layout()` first runs with `W`, `H` and `hdr`
twice the size, and that painting is box-filtered down into `background`; then it runs again at the real size, for
whatever `render()` reads (positions, ground heights, masks), and that pass's painting is dropped. (Big canvases, such
as snaps, skip the first pass.) Each run must start from scratch, as it already must for resizes. Everything in screen
heights just works. Anything in pixels takes `this.px`, the size of a real pixel in the current pass's pixels: rim
widths (`Math.exp(-depth / (1.5 * this.px))`), offsets (`+ 2 * this.px`), and per-pixel textures, which should stay
on real pixels (`hash2(Math.floor(x / px), Math.floor(y / px))`, `fbm1((x / px) * 0.3)`). `thick()` minimums are
already in real pixels. A per-pixel layer that `render()` draws over the scene (zen's front garden, space's near rings,
city's river) can be made in the first pass, box-filtered with `this.shrink(buffer, channels)`, and kept in a field for
the second pass to use. Scenes whose `layout()` paints nothing set `supersample = 1`. Smooth fills that cost a lot per
pixel (space's nebula) can be worked out once per real pixel.

### Drawing

`Canvas` methods, all in pixels, mixing over what's already there:

| Method | Draws |
| --- | --- |
| `add(x, y, r, g, b)` | Adds light to one pixel, for stars, sparks and glints |
| `blend(i, r, g, b, a)` | Mixes a color into the pixel at `hdr` index `i` by `a`, inside your own loops |
| `disc(cx, cy, radius, r, g, b, a)` | An anti-aliased circle |
| `ellipse(cx, cy, rx, ry, r, g, b, a)` | An anti-aliased axis-aligned ellipse |
| `polygon(points, color, alpha?)` | An anti-aliased polygon in a flat color, for straight-edged things like buildings and boats |
| `shape(parts, lighting, light?)` | Rounded parts joined into one lit form, for creatures, people and plants |

For per-pixel effects such as water, sand or fog, loop over `hdr` directly. `reflect()` in `src/water.ts` mirrors
other rows of the scene into water rows with drifting ripples, a tint and a per-pixel weight; call it each frame over
only the water's rows (as the beach and the prehistoric lake do), or once in `layout()` for still water such as ice.

### Shapes

`shape()` takes a list of `Part`s:

- `cap(ax, ay, bx, by, r0, r1, color, ribs?)` is a capsule from (ax, ay) with radius r0 to (bx, by) with radius r1:
  limbs, trunks, necks, tails, wings.
- `ell(cx, cy, rx, ry, angle, color, ribs?)` is an ellipse rotated by `angle`: bodies, heads, leaves.
- `ribs` adds ridges, along a capsule (a saguaro) or across an ellipse (a pumpkin).

Each pixel takes the color of the part it's deepest inside, so joints are seamless and one part can't sit on top of
another. To draw a stripe, eye or spot over a body, call `shape()` again: later calls draw over earlier ones.

### Lighting

The second argument to `shape()` says how the shape is lit:

- `{ style: "front", dir: [x, y, z] }` lights from a direction (x right, y down, z toward the viewer) and shades each
  part as a rounded form. Use it by day.
- `{ style: "rim", color, x, y }` backlights from a point in pixels, usually the sun or moon, so only the edge facing
  it catches the light and the rest stays a silhouette. Use it at sunset and at night.

The optional third argument scales the effect: 1 is full lighting, 0 is flat color (good for thin lines and tiny
details), and values in between soften it.

### Sky helpers

`src/sky.ts` has the pieces every outdoor wallpaper shares:

- `paintSky(hdr, W, H, stops, orb)` fills the canvas with a vertical gradient through `[fraction of height, color]`
  stops, a glow around the sun or moon, and the orb itself. An `Orb` has x (fraction of width), y and r (fractions
  of height), `core` and `glow` colors, `near` and `wide` glow strengths, and `moon: true` for a cratered moon.
- `makeStars(count, top)` and `paintStars(hdr, W, H, stars, time, top, brightness)` draw slowly twinkling stars that
  fade toward `top`. Stars are tinted from `STAR_TINTS`, never white.
- `makeClouds(count, kind, y0, y1)`, `driftClouds(clouds, A, dt)` and `paintClouds(hdr, W, H, clouds, top, bottom,
  alpha, orb)` give clouds of one kind: `cumulus`, `towering` (standing on y, for a horizon), `cirrus`, `wisp`,
  `stratus` or `ash`. They are lit from the orb: the brighter of `top` and `bottom` faces it, and clouds near it are
  backlit with glowing edges. Pass no orb under an overcast deck to light them evenly from above. Each cloud's shape
  is built once per screen size, so drawing them each frame is cheap. Heaped kinds read best by day and at night;
  thin streaks (`cirrus`, `stratus`) catch a low sunset sun better.
- `makeShadows(count, y0, y1)` and `paintShadows(hdr, W, H, shadows, ground, orb)` drift soft cloud shadows across
  the ground below `ground` under a high sun; `paintHaze(hdr, W, H, y0, y1, color, alpha)` paints a static haze band.

`src/grade.ts` gives daytime depth in `layout()`: `haze(hdr, sky, W, H, y0, y1, far, near?, top?)` fades what was
painted toward a copy of the sky taken right after `paintSky` (call it after each layer so farther ones fade more), and
`mottle(hdr, W, H, horizon, bottom, size, warm, cool)` lays broad warm and cool patches over the ground in perspective.
Setting `this.frame` (0 to 1) in the constructor darkens the bottom corners to frame a bright foreground.

`src/math.ts` has `TAU`, `lerp`, `clamp`, `smoothstep`, `rand`, stable hashes (`hash`, `hash2`, `hashString`), smooth
noise (`noise1`, `noise2`, `fbm1`, `fbm2`), `hsv` and the `RGB` type.

### Shadows

`src/shadow.ts` grounds things standing on the ground. Make one `Shade` with `sunShade(time, look.orb,
weather.covered)`, then call `groundShadow(hdr, W, H, shade, x, y, w, h, tip?, lift?)` with the ground point under a
thing, its width and height in pixels, before drawing it: static things in `layout()`, moving ones each frame. It draws a
soft contact shadow and a cast shadow away from the light: short by day, long and spreading from the low sun at sunset,
faint at night, contact only under cloud. `lift` (pixels off the ground) fades the contact shadow and slides the cast one
away, for hops and lifts. Shadows multiply the ground toward a sky-tinted color, so they never gray it, and where
they overlap the ground darkens only as much as the deepest of them, not stacking into dark patches.

### Creatures

`src/creature.ts` animates walkers. Pose a creature in body coordinates with `body(x, y, S, turn)` (u forward, v
down, w across), and keep a `Gait` per walker: `stepGait(g, distance / stride, dt, face)` advances the step cycle with
the distance walked, so planted feet don't slide, eases between standing and walking, turns through a three-quarter
view instead of flipping, and rings a springy `lag` for tails and ears to trail. `quadruped()` draws four jointed
legs in diagonal pairs, `limb()` any two-segment limb with a bending joint, `stride()` and `bob()` one foot's step and
the body's rise, and `chain()` a tapered tail or neck along a curve.

## Time of day

Each wallpaper keeps everything that changes with the time of day in one `LOOKS: Record<Time, Look>`: sky stops, the
orb, light color and style, star count, cloud colors, ground colors, and a `tint`. Objects and animals get one daytime
color each, and a `paint()` method darkens it for the time of day, so adding an object needs no per-time colors:

```ts
private paint(c: RGB): RGB {
  const t = this.look.tint // [1, 1, 1] by day, a dark warm or blue tint at sunset and night
  return [c[0] * t[0], c[1] * t[1], c[2] * t[2]]
}
```

Day is usually `front`-lit and sunset and night `rim`-lit, so things read as silhouettes against the sky. Give big
surfaces such as water, sand or snow their own colors per look rather than a tint. The engine desaturates day and
sunset scenes by about a fifth and night scenes barely, so night keeps its color.

Night must not use white or gray highlights, because OpenCode's text is white. Use saturated, tinted colors instead:
cobalt and teal moonlight, a gold moon, amber lamps and windows, tinted stars, glowing plankton or fireflies.

Give night clear light structure so things stay readable: a lighter band at the horizon (or, underwater, toward the
surface) for silhouettes to stand against, a strong rim `light` from the moon's side, and a few local pools of warm or
glowing light. `lightPool()` in `src/light.ts` lights an ellipse in the light's own color, so ground and creatures
passing through it pick it up; draw it each frame after the creatures it should light. `campfire()` and
`fireflyLight()` there are ready-made pools. Keep the area behind text no brighter or busier than before.

## Seasons and weather

`settings.season` is spring, summer, autumn or winter, or missing for the classic look. Change what the season would
really change (blossom, leaves, snow, crowds) and nothing for indoor or timeless scenes.

`settings.weather` is clear, overcast, rain, snow or fog, or missing for the wallpaper's own weather. Outdoor scenes
make one `WeatherLayer` (from `src/weather.ts`) with the weather, time of day and horizon, and call its `cover()` in
`layout()` right after painting the sky, `step(dt)` in `step`, and `draw()` at the end of `render()` before `finish()`.
Skip stars when `covered` is set, and color clouds with `scud` when it is. Passing `light` as the last argument gives a
seasonal shower or flurry without the cloud deck, as the farm does in winter. `wallpapers/farm.ts` shows all of it.

## Wind

Every outdoor scene shares one wind from `src/wind.ts`, so a gust rolls across the whole screen from left to right
every minute or so and then dies away. `gust(x, t)` is how hard it blows at x (screen heights) and scene time t, from 0
to 1: add it to anything that drifts, such as petals, snow or dust. `sway(x, t, phase, rate)` replaces a plant's own
`Math.sin(t * rate + phase)`: the same rocking in calm air, plus a lean downwind as a gust passes. For plants painted
once in `layout()`, a `SwayLayer` bends them without redrawing: call `begin()` before painting them, `end()` after
with how far their tips move and a weight from roots to tips, and `draw()` right after copying the background.

## Scrim

Text gets a soft scrim that fades the scene toward a dark color around it. `scrim` gives that color (0 to 255) for
each time of day at the top, middle and bottom of the screen. Darker, more saturated versions of the scene's own colors
at those depths read better than black: dark sky blue at the top and dark green over grass by day, deep navy at night.
Check that text stays readable with `bun dev/preview.ts` at every time of day.

## Composition

OpenCode's text sits in the middle of the screen: the home screen has a centered logo and a 76-column prompt across
the middle third of the height, and a session has a column of messages, a prompt at the bottom and, from 120 columns,
a sidebar on the right. Put the things people should see (a barn, a volcano, a waterfall) toward the left and right
edges, in the top band or along the bottom, measured in screen heights from the nearest edge (`A - 0.3`, not `0.8 * A`)
so they stay clear on wide and narrow terminals alike. Keep the middle band to calm scenery such as sky, water or open
field. `bun dev/preview.ts <id> home 100x30` shows a real layout at any size.

The engine also tells scenes where text actually is, about once a second. `this.openSpot(x0, x1, y0, y1)` picks a
random point in a box, the least covered of a few tries, for a creature's next stop or a visitor's spot, and
`this.openRow(y0, y1)` picks a height for something crossing the whole screen. Both are plain random picks until the
engine has sent its map, and in `dev/snap.ts`.

## Activity

- **calm** is scenery with something rare now and then: water, wind, clouds, one creature passing every minute or so.
- **lively** adds a few animals.
- **teeming** is the full cast.

Check `this.activity` in the constructor (what exists) and in `step` and `render` (what moves and draws). Things can
change with the time of day too: an owl instead of an eagle at night, fireflies instead of birds.

## Agent reactions, clicks and easter eggs

All optional, and all on `Scene`:

- `react(event)` hears the agent: `busy`, `done`, `error` or `idle`. `Canvas` implements it: override `visit()` to
  bring on your rare visitor when a task is done, call `stepGloom(dt)` in `step`, and darken your light or paint
  storm clouds by `this.gloom` (0 to 1), which rises after an error and falls with the next event. `makeStorm()` and
  `paintStorm()` in `src/sky.ts` give dark clouds that drift like the others. The engine also speeds the scene up a
  little while the agent works and dims it after an error, so a scene that does nothing still reacts.
- `poke(x, y)` is a click on open background, in screen heights (x from 0 to `A`, y from 0 to 1). Keep the reaction
  small: `startle()`, `flyAway()` and `bird()` in `src/flock.ts` send a few birds up from the click.
- For a very rare surprise, count down `eggWait() * TIME_SCALE` scene seconds (from `src/egg.ts`), and call
  `eggWait(true)` once it is over to start the next wait. The wait is shared by every scene, so a settings change
  doesn't restart it.

## Rules

- Keep it calm: `TIME_SCALE` 0.35 for the scene and `CREATURE_SPEED` 0.25 of that for creatures. Nothing should be
  busy behind text.
- No white or gray at night.
- Text must stay readable: dark scrim colors for every time of day.
- Fill the whole background, at any aspect ratio. Place things relative to `A` so wide and narrow terminals both work.
- Keep a frame cheap (see below).

## Performance

A typical wallpaper costs 8 to 12 ms per frame at 15 fps through the whole pipeline (`bun dev/check.ts`). Timings vary
a lot with machine load, so compare against an existing wallpaper measured back to back.

- Paint static things once in `layout()`.
- Keep hot loops (anything that runs per pixel, every frame) as module-level functions that take the buffer and sizes
  as arguments, like `fillShape` and `bloom` in `src/canvas.ts`, rather than methods that read `this.hdr` and `this.W`.
  Bun's JavaScript engine optimizes field reads for the object shape it has seen, and every wallpaper class has a
  different shape, so after switching wallpapers a shared method keeps falling out of its optimized code ("BadCache"
  exits) and runs slower.
- Bound per-pixel loops to the area you're drawing, not the whole screen. The `Canvas` helpers already do.
- Precompute noise and textures into typed arrays in the constructor or `layout()` instead of calling `fbm` per pixel
  per frame.
- Every cell that changes is sent to the terminal. The engine holds back a cell's color change until it reaches 3
  levels of 255 in some channel (a new glyph always sends), so slow light such as an aurora or twinkling stars costs
  little output; flickering glyphs still cost a lot.
- `shape()` costs about the area of the shape's bounding box times its parts. Draw a sprawling thing (a tree, a
  palm's fronds) as several smaller calls, and skip things that are off screen.

## Dev tools

```sh
bun run typecheck
bun dev/check.ts [id...] [season] [weather]       # every activity and time: errors, ms/frame, flicker
bun dev/snap.ts <id> [activity] [time] [season] [weather] [seconds...] # scene PNGs in dev/out/, and ms per render
bun dev/preview.ts <id> [activity] [time] [season] [weather] [home|session] [WxH] [seconds] # terminal cells behind text, as a PNG
bun dev/pixel-check.ts [id] [activity] [time]     # real-pixel mode against a mock kitty terminal
bun dev/poke.ts <id> [activity] [time] <fx> <fy> [seconds...] # click at a point (fractions of the screen)
bun dev/fade.ts <id>:day <id>:night 50            # a frame halfway through a crossfade, and its cost
bun dev/gif.ts <id> [activity] [time]             # a looping GIF at 3x speed in dev/out
bun run screenshots                               # fails if the README gallery is out of date
bun run screenshots:update                        # re-renders it (teeming at 45 s)
bun dev/gif.ts all                                # re-renders the README's GIFs
```

- `check.ts` runs the real engine on a mock 160x45 screen. "cells change per frame" is flicker: lower is calmer.
  `--quiet` prints only failures, and it fails on flicker above `--max-flicker` (150) and, if given, on frames slower
  than `--max-ms`; CI runs `--quiet --max-ms=60`. Dev renders seed `Math.random`, so they are reproducible.
  Errors thrown in `step` or `render` show up here; inside OpenCode they are only logged to `WALLPAPER_DEBUG`.
- `snap.ts` renders the scene directly, before terminal conversion, for judging the art.
- `preview.ts` shows what the terminal will show, scrim included. `home` and `session` lay the text out like OpenCode's
  home screen or a busy session, and a size such as `240x60` or `100x30` replaces 160x45.
- `dev/pty.ts [seconds] [keys...]` runs a real OpenCode in a pseudo-terminal and types each key argument, pausing
  1.5 s after each; `\r` is Enter and `\e` is Escape. `dev/pty-kitty.ts [id] [seconds]` does the same as a kitty
  terminal in pixel mode. Run them with a throwaway profile (fresh `XDG_DATA_HOME`, `XDG_CONFIG_HOME`,
  `XDG_STATE_HOME` and `XDG_CACHE_HOME`) and `OPENCODE_CLI_CONFIG_CONTENT='{"plugins":["/path/to/this/repo"]}'`.
- `WALLPAPER_DUMP=<file>` makes the plugin write one frame of terminal cells after about 8 seconds, and
  `bun dev/cells.ts <file> <png>` renders it.
- `WALLPAPER_EVENTS="busy@2,done@12,error@30"` plays agent events at those seconds, in OpenCode or `dev/snap.ts`.
  `WALLPAPER_EGG=1` brings every easter egg on a few seconds in. `WALLPAPER_CLOCK=17:59` starts auto's clock there,
  to watch a time-of-day fade, and `WALLPAPER_DUMP_FADE=<file>` dumps the first frame past the middle of a crossfade.
- `WALLPAPER=<id>`, `WALLPAPER_ACTIVITY`, `WALLPAPER_TIME`, `WALLPAPER_SEASON` and `WALLPAPER_WEATHER` pin a
  wallpaper inside OpenCode without changing the
  saved choice, and `WALLPAPER_DEBUG=<file>` logs engine errors and stats.

## Adding a wallpaper to this repository

1. Put it in `wallpapers/<id>.ts` as a named export, and add it to `wallpapers/index.ts`.
2. Run `bun run typecheck` and `bun dev/check.ts <id>`, and look at `dev/snap.ts` and `dev/preview.ts` output at every
   time of day.
3. Add it to the README's wallpaper, activity, time-of-day, agent reaction and click sections, and to the gallery and
   GIF grid. Add its best-looking time of day to `BEST` in `dev/gif.ts`, then run `bun run screenshots:update` and
   `bun dev/gif.ts all`.

## Your own package

A wallpaper package imports the API from `opencode-wallpapers/api`, which has `Canvas`, `cap`, `ell`, `blade`, the
sky, grade, shadow, light, water, creature, wind, weather, flock, egg and math helpers, and the `Wallpaper` types,
with no OpenCode or OpenTUI dependency. It isn't on npm yet, so build a clone of this repository and depend on it by
path:

```sh
(cd ~/code/opencode-wallpapers && bun install && bun run build)
bun add -d ~/code/opencode-wallpapers
```

```ts
import { Canvas, type Settings, type Wallpaper } from "opencode-wallpapers/api"

class Meadow extends Canvas {
  // …
}

const meadow: Wallpaper = { id: "meadow", /* … */ create: (settings) => new Meadow(settings) }

export default meadow // or an array of wallpapers
```

The module's default export is a wallpaper or an array of them. Copying `wallpapers/template.ts` and changing its
import to `"opencode-wallpapers/api"` is a working start. Test it with this repository's dev tools:
`WALLPAPER_MODULES=/path/to/meadow bun dev/check.ts meadow`.

To use it, give the plugin a `wallpapers` option in `~/.config/opencode/cli.json`, listing absolute paths (`~/` works)
to modules or package directories:

```json
{
  "plugins": [{ "package": "opencode-wallpapers", "options": { "wallpapers": ["~/code/meadow"] } }]
}
```

`package` is the absolute path to your clone of this plugin. Package names work in
`wallpapers` too, if the package is installed in this plugin's own `node_modules`.

Loaded wallpapers appear in the `/wallpaper` menu after the built-in ones. A module that fails to load, or a wallpaper
that doesn't look like a `Wallpaper` or reuses a taken id, is skipped with an error toast naming it, and a wallpaper
whose `create` throws shows an error instead of starting. OpenCode doesn't watch these modules, so restart it after
editing one.
