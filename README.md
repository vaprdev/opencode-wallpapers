# OpenCode Wallpapers

Animated wallpapers for the OpenCode terminal UI. A slow, quiet scene fills the background behind everything, drawn
with Unicode block characters and kept readable behind text.

> This project is not affiliated with, endorsed by, or sponsored by OpenCode or its maintainers.

| | Day | Sunset | Night |
| --- | --- | --- | --- |
| Ocean | ![Ocean by day](screenshots/ocean.png) | ![Ocean at sunset](screenshots/ocean-sunset.png) | ![Ocean at night](screenshots/ocean-night.png) |
| Desert | ![Desert by day](screenshots/desert.png) | ![Desert at sunset](screenshots/desert-sunset.png) | ![Desert at night](screenshots/desert-night.png) |
| Jungle | ![Jungle by day](screenshots/jungle.png) | ![Jungle at sunset](screenshots/jungle-sunset.png) | ![Jungle at night](screenshots/jungle-night.png) |
| Space | ![Space by day](screenshots/space.png) | ![Space at sunset](screenshots/space-sunset.png) | ![Space at night](screenshots/space-night.png) |
| Farm | ![Farm by day](screenshots/farm.png) | ![Farm at sunset](screenshots/farm-sunset.png) | ![Farm at night](screenshots/farm-night.png) |
| Tundra | ![Tundra by day](screenshots/tundra.png) | ![Tundra at sunset](screenshots/tundra-sunset.png) | ![Tundra at night](screenshots/tundra-night.png) |
| Beach | ![Beach by day](screenshots/beach.png) | ![Beach at sunset](screenshots/beach-sunset.png) | ![Beach at night](screenshots/beach-night.png) |

## Wallpapers

| Wallpaper | Description |
| --- | --- |
| `ocean` | Deep water, god rays, marine snow, and a whale that drifts past now and then. |
| `desert` | Mesas and dunes with a saguaro, a cow skull, and a tumbleweed now and then. |
| `jungle` | A misty rainforest with a waterfall, light through the canopy, and a toucan flying by now and then. |
| `space` | A ringed planet turning slowly below a nebula and drifting stars, with a comet now and then. |
| `farm` | Rolling fields with a red barn, a turning windmill and swaying corn, and a tractor now and then. |
| `tundra` | Snowy peaks, a frozen lake, igloos and a snowman under falling snow, with a snowy owl now and then. |
| `beach` | Waves washing up a sandy beach between swaying palms, with a sailboat on the horizon now and then. |

## Install

Requires OpenCode 2. Clone the repository into OpenCode's plugin directory and restart OpenCode:

```sh
git clone https://github.com/vaprdev/opencode-wallpapers.git ~/.config/opencode/plugins/wallpapers
```

To keep the clone elsewhere, add its absolute path to `plugins` in `~/.config/opencode/cli.json` instead:

```json
{
  "plugins": ["/path/to/opencode-wallpapers"]
}
```

Update with `git pull` in the clone.

## Use

Type `/wallpaper` to open the wallpaper menu:

![The wallpaper menu](screenshots/menu.png)

Use ↑/↓ to pick a setting, and Enter or ←/→ to change it. The wallpaper changes as you go, and Escape closes the
menu. Your choice is kept across restarts.

- **Shuffle** switches to a different wallpaper every hour, or each time OpenCode starts.
- **Per project** remembers a wallpaper for each project directory. A project starts from the global choice until you
  pick one there.
- **Brightness** is subtle, normal or vivid. Brighter scenes get a firmer scrim behind text, so it stays readable.

With a light OpenCode theme the scene is washed out toward white and text gets a pale scrim instead of a dark one.

## Activity

Every wallpaper has three activity levels, which set how much is going on behind your work:

| Wallpaper | Calm | Lively | Teeming |
| --- | --- | --- | --- |
| `ocean` | Water, light and the whale | Adds a fish and an octopus | Adds a shark, diver, turtle and kelp |
| `desert` | Mesas, a saguaro and a skull | Adds a soaring eagle (an owl at night) and a rattlesnake | Adds vultures (bats at night), a howling coyote and more cacti |
| `jungle` | Trees, vines, a waterfall and swaying leaves | Adds a swinging spider monkey and blue morpho butterflies | Adds a jaguar, scarlet macaws, a tree frog and more butterflies |
| `space` | The planet, its rings, a moon and the stars | Adds an orbiting space station and a satellite | Adds asteroids, a floating astronaut and a flying saucer |
| `farm` | Barn, windmill, fields and corn | Adds grazing cows and pecking chickens | Adds a farmer, pigs in the mud and crows over the corn |
| `tundra` | Peaks, igloos, a snowman and falling snow | Adds waddling penguins and an arctic fox | Adds a polar bear, an ice fisher and another snowman |
| `beach` | Sea, waves, sand and palm trees | Adds leaping dolphins and seagulls | Adds a crab, a surfer, an umbrella and a sandcastle |

## Time of day

Every wallpaper has a day, sunset and night look. By default the time of day follows your clock: day from 7am,
sunset from 6pm (and at dawn, 6 to 7am), night from 8pm. Pick one in the menu to keep it fixed.

- **Ocean:** sunlit water by day, golden light at sunset, and at night dark moonlit water with glowing plankton
  and, in teeming, a diver's torch.
- **Desert:** a high sun with sunlit rock and shadows by day, backlit silhouettes at sunset, and a moonlit night with
  stars and the Milky Way, where an owl and bats take over the sky.
- **Jungle:** sunlit greens by day, warm backlit mist at sunset, and a moonlit night lit by fireflies, where the
  jaguar's eyes glow.
- **Space:** the planet's sunlit side by day, an orbital sunrise with the star flaring at its edge at sunset, and its
  night side with city lights and aurora under a bright Milky Way.
- **Farm:** sunny fields by day, a backlit barn at sunset, and a moonlit night with glowing windows and fireflies.
- **Tundra:** crisp blue-white snow by day, pink alpenglow at sunset, and deep blue snow under a green and violet
  aurora at night, with warm light from the igloos.
- **Beach:** turquoise water by day, a glittering path under the setting sun, and a moon path at night with glowing
  bioluminescent waves.

## Terminals

Any truecolor terminal works. Ghostty and kitty get octant characters (2x4 sub-pixels per cell); other terminals get
quadrant blocks (2x2). These environment variables tune rendering:

| Variable | Effect |
| --- | --- |
| `WALLPAPER_PIXELS=1` | In Ghostty or kitty, draw the scene as a real image behind the text instead of characters |
| `WALLPAPER_SUPERSAMPLE=2` | Smoother edges in character mode, at about 2.5x the CPU |
| `WALLPAPER_OCTANTS=0` or `1` | Force quadrant or octant characters |

## How it works

The plugin post-processes each frame OpenCode draws. Cells painted with OpenCode's neutral surface colors are replaced
by the scene, while colored backgrounds such as diffs and selections are left alone. Text keeps a soft scrim that fades
the scene toward a dark tint around it. Scenes render in HDR with bloom and tone mapping, then are fitted to two colors
per character cell. Wallpapers update at 15 frames per second.

## Add a wallpaper

1. Create `wallpapers/<id>.ts`. Extend `Canvas` from `src/canvas.ts`, implement `step(dt)` and `render()`, and export
   a `Wallpaper` with an id, name, description, scrim colors for each time of day, what each activity level shows, and
   `create({ activity, time })`.
   `wallpapers/ocean.ts` is the example.
2. Add it to `wallpapers/index.ts`.
3. Check it:

```sh
bun install
bun run typecheck
bun dev/check.ts <id>            # errors, frame cost, and flicker at every activity level and time of day
bun dev/snap.ts <id> teeming night 30  # scene PNGs at an activity level, time of day, and times
bun dev/preview.ts <id> 20       # terminal-cell rendering behind text, as a PNG
bun dev/pixel-check.ts <id>      # real-pixel mode against a mock kitty renderer
```

`dev/pty.ts` and `dev/pty-kitty.ts` drive a real OpenCode in a pseudo-terminal, and `WALLPAPER_DUMP=<file>` saves one
frame of terminal cells that `dev/cells.ts` turns into a PNG.

## License

[MIT](LICENSE)
