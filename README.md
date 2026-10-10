# OpenCode Wallpapers

Animated wallpapers for the OpenCode terminal UI. A slow, quiet scene fills the background behind everything, drawn
with Unicode block characters and kept readable behind text.

![Beach, tundra, jungle, desert and space wallpapers in motion](screenshots/hero.gif)

> This project is not affiliated with, endorsed by, or sponsored by OpenCode or its maintainers.

## Install

Requires OpenCode 2. Clone the repository into OpenCode's plugin directory and restart OpenCode:

```sh
git clone https://github.com/vaprdev/opencode-wallpapers.git ~/.config/opencode/plugins/wallpapers
```

To keep the clone elsewhere, add its absolute path to `plugins` in `~/.config/opencode/cli.json` instead. Update with
`git pull` in the clone.

## Use

Type `/wallpaper` to open the wallpaper menu:

![The wallpaper menu](screenshots/menu.png)

Use ↑/↓ to pick a setting, and Enter or ←/→ to change it. The wallpaper crossfades to each choice as you go, and
Escape closes the menu. Your choices are kept across restarts.

- **Brightness** is subtle, normal or vivid. Brighter scenes get a firmer scrim behind text, so it stays readable.
- **Shuffle** switches to a different wallpaper every hour, or each time OpenCode starts.
- **Per project** remembers a wallpaper for each project directory. A project starts from the global choice until you
  pick one there.

With a light OpenCode theme the scene is washed out toward white and text gets a pale scrim instead of a dark one.

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
| `city` | A skyline over a river, traffic on an elevated highway, and a blimp drifting over now and then. |
| `zen` | A koi pond under a red bridge, raked gravel, stone lanterns and falling cherry petals, with a heron now and then. |
| `prehistoric` | A smoking volcano over ferns and cycads, with a T. rex stomping by now and then. |

### Activity

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
| `city` | Skyline, river and light traffic on the highway | Adds a train crossing the bridge and more traffic | Adds neon signs, boats on the river, people on the street, and rain at night |
| `zen` | Garden, pond ripples, petals and a bamboo fountain | Adds koi circling under the lily pads | Adds more koi, a frog on a lily pad and dragonflies |
| `prehistoric` | Volcano, smoke, ferns and cycads | Adds a browsing sauropod and circling pterosaurs | Adds a triceratops herd, dragonflies and a lake with something in it |

### Time of day

Every wallpaper has a day, sunset and night look. By default the time of day follows your clock: day from 7am,
sunset from 6pm (and at dawn, 6 to 7am), night from 8pm, fading from one to the next over 45 seconds. Pick one in the
menu to keep it fixed.

- **Ocean:** sunlit water by day, golden light at sunset, and at night dark moonlit water with glowing plankton
  and, in teeming, a diver's torch.
- **Desert:** a high sun with sunlit rock and shadows by day, silhouettes in a hot ochre dust haze at sunset, and a
  moonlit night with stars and the Milky Way, where an owl and bats take over the sky.
- **Jungle:** sunlit greens by day, warm backlit mist at sunset, and a moonlit night lit by fireflies, where the
  jaguar's eyes glow.
- **Space:** the planet's sunlit side by day, an orbital sunrise with the star flaring at its edge at sunset, and its
  night side with city lights and aurora under a bright Milky Way.
- **Farm:** sunny fields by day, golden-hour light over warm grass at sunset, and a moonlit night with glowing
  windows and fireflies.
- **Tundra:** crisp blue-white snow by day, pink alpenglow at sunset, and deep blue snow under a green and violet
  aurora at night, with warm light from the igloos.
- **Beach:** turquoise water by day, a pastel pink and teal sunset over a pink-lit sea, and a moon path at night with
  glowing bioluminescent waves.
- **City:** glass towers in the sun by day, a smoggy amber and magenta sunset dropping between the towers, and at
  night windows, lamps and neon in saturated colors mirrored in the river, with rain and a wet street in teeming.
- **Zen garden:** a sunlit pond mirroring the sky by day, a soft peach and lavender sunset glittering in it, and at
  night amber lanterns, fireflies and the gold moon reflected in dark blue water.
- **Prehistoric:** a hazy blue sky over glowing lava by day, dinosaurs under an ashy red sky with the sun dimmed by
  smoke at sunset, and a moonlit night where red and orange lava runs down the volcano, lights its smoke and shimmers
  on the lake.

## Seasons and weather

By default the season follows the calendar: spring from March, summer from June, autumn from September, winter from
December, flipped in the southern hemisphere once a location (below) puts you there. Pick a season in the menu to keep
it fixed.

- **Farm:** blossom, wildflowers and young corn in spring; ripe corn and fireflies in summer; gold fields, dry corn,
  pumpkins and falling leaves in autumn; snow on the fields, roofs and bare trees in winter, with a light flurry.
- **Desert:** a wildflower bloom and flowering saguaros in spring, and a dusting of snow on the mesas in winter.
- **Jungle:** the rainy season (summer and autumn) brings thicker mist, a fuller waterfall and a light shower.
- **Beach:** a crowd of umbrellas, sunbathers and swimmers in summer, and an empty beach with cooler water in autumn and
  winter.
- **Zen garden:** cherry blossom in spring, green leaves in summer, red and gold leaves falling in autumn, and bare
  branches under a light snowfall in winter.
- **Ocean, space, tundra, city and prehistoric** look the same all year.

| Spring | Summer | Autumn | Winter |
| --- | --- | --- | --- |
| ![Farm in spring](screenshots/farm-spring.png) | ![Farm in summer](screenshots/farm-summer.png) | ![Farm in autumn](screenshots/farm-autumn.png) | ![Farm in winter](screenshots/farm-winter.png) |

Every wallpaper except ocean and space can show rain with splashes, snow, fog or an overcast sky, tinted blue rather
than white at night. The menu's weather setting:

- **Off** (the default): each wallpaper's own weather, such as the tundra's snowfall and the seasonal showers above.
- **Local**: the real weather where you are, from [Open-Meteo](https://open-meteo.com) (free, no API key), checked at
  most every 30 minutes. It needs a place: `/wallpaper location Berlin` or `/wallpaper location 52.52,13.41`, or the
  `WALLPAPER_LOCATION` variable. Nothing is fetched unless you pick Local, your location is never guessed, and if the
  lookup fails the sky stays clear.
- **Clear, Rain, Snow, Fog**: always that weather. `/wallpaper weather overcast` is also available.

![Farm in the rain](screenshots/farm-rain.png)

## Agent reactions

Wallpapers quietly follow what the agent is doing:

- **Working:** the scene moves a little faster while any session runs, barely at all when calm.
- **Done:** when the last running session finishes, the wallpaper's visitor shows up: the whale, a tumbleweed, a
  toucan (fireflies flashing together at night), a comet, the tractor, a snowy owl, a sailboat, the blimp, the heron or
  the T. rex.
- **Error:** after a failed run, dark clouds roll in (in the ocean and jungle the light shafts fade, in space the star
  dims) and the scene darkens slightly. It clears when the agent works again, or after a couple of minutes.

## Clicks and surprises

With mouse support on, clicking an empty patch of background, away from text, nudges the scene. OpenCode still gets
every click; dialogs, popups and text are never pokes.

| Wallpaper | Click | Very rarely |
| --- | --- | --- |
| `ocean` | Bubbles rise, and the fish, shark and octopus dart away | A little yellow submarine putters past |
| `desert` | Birds burst up out of the scrub | A roadrunner sprints through and stops to look around |
| `jungle` | The spider monkey swings harder | A sloth lowers itself down a vine to smile at you |
| `space` | A shooting star | A starship cruises across the sky |
| `farm` | The nearest cow looks up and turns toward you | A flying saucer beams up a cow |
| `tundra` | The penguins hop | A yeti looms out of the snow and waves |
| `beach` | Gulls take off | A message in a bottle washes up for a while |
| `city` | Pigeons burst up off the street | A caped superhero flies over the towers |
| `zen` | A ripple on the pond, or sparrows up out of the garden | A tanuki with a leaf on its head sits by the pond |
| `prehistoric` | Little feathered dinosaurs flap up out of the ferns | A time machine arrives in a flash and leaves trails of fire |

Click reactions that involve animals need the lively or teeming level. The rare events come along about once every
hour or two of watching, never sooner than half an hour apart, and changing settings doesn't reset the wait.

## Power

Wallpapers animate at 15 frames per second. On **Saver**, the default, they slow to 5 frames per second after 30
seconds without typing, mouse or agent activity, and pause while the terminal window is in the background (in
terminals that report focus, such as Ghostty, kitty, iTerm2 and tmux). Any input brings back full speed at once.
**Smooth** always runs at 15.

## Terminals

Any truecolor terminal works. Ghostty and kitty get octant characters (2x4 sub-pixels per cell); other terminals get
quadrant blocks (2x2). These environment variables tune rendering:

| Variable | Effect |
| --- | --- |
| `WALLPAPER_PIXELS=1` | In Ghostty or kitty, draw the scene as a real image behind the text instead of characters |
| `WALLPAPER_SUPERSAMPLE=2` | Smoother edges in character mode, at about 2.5x the CPU |
| `WALLPAPER_OCTANTS=0` or `1` | Force quadrant or octant characters |
| `WALLPAPER_LOCATION` | A place or `latitude,longitude` for local weather, if none is set with `/wallpaper location` |

## How it works

The plugin post-processes each frame OpenCode draws. Cells painted with OpenCode's neutral surface colors are replaced
by the scene, while colored backgrounds such as diffs and selections are left alone. Text keeps a soft scrim that fades
the scene toward a dark tint around it. Scenes render in HDR with bloom and tone mapping, then are fitted to two colors
per character cell. While one look fades into another, both scenes render and blend, scrim included, so only
transitions cost extra.

## Make a wallpaper

[CONTRIBUTING.md](CONTRIBUTING.md) explains how wallpapers work, the dev tools for making them, and how to load
wallpapers from a package of your own with the plugin's `wallpapers` option.

## Gallery

At teeming, played back at 3x speed:

| | |
| --- | --- |
| ![Ocean in motion](screenshots/ocean.gif) | ![Desert in motion](screenshots/desert.gif) |
| ![Jungle in motion](screenshots/jungle.gif) | ![Space in motion](screenshots/space.gif) |
| ![Farm in motion](screenshots/farm.gif) | ![Tundra in motion](screenshots/tundra.gif) |
| ![Beach in motion](screenshots/beach.gif) | ![City in motion](screenshots/city.gif) |
| ![Zen garden in motion](screenshots/zen.gif) | ![Prehistoric in motion](screenshots/prehistoric.gif) |

| | Day | Sunset | Night |
| --- | --- | --- | --- |
| Ocean | ![Ocean by day](screenshots/ocean.png) | ![Ocean at sunset](screenshots/ocean-sunset.png) | ![Ocean at night](screenshots/ocean-night.png) |
| Desert | ![Desert by day](screenshots/desert.png) | ![Desert at sunset](screenshots/desert-sunset.png) | ![Desert at night](screenshots/desert-night.png) |
| Jungle | ![Jungle by day](screenshots/jungle.png) | ![Jungle at sunset](screenshots/jungle-sunset.png) | ![Jungle at night](screenshots/jungle-night.png) |
| Space | ![Space by day](screenshots/space.png) | ![Space at sunset](screenshots/space-sunset.png) | ![Space at night](screenshots/space-night.png) |
| Farm | ![Farm by day](screenshots/farm.png) | ![Farm at sunset](screenshots/farm-sunset.png) | ![Farm at night](screenshots/farm-night.png) |
| Tundra | ![Tundra by day](screenshots/tundra.png) | ![Tundra at sunset](screenshots/tundra-sunset.png) | ![Tundra at night](screenshots/tundra-night.png) |
| Beach | ![Beach by day](screenshots/beach.png) | ![Beach at sunset](screenshots/beach-sunset.png) | ![Beach at night](screenshots/beach-night.png) |
| City | ![City by day](screenshots/city.png) | ![City at sunset](screenshots/city-sunset.png) | ![City at night](screenshots/city-night.png) |
| Zen garden | ![Zen garden by day](screenshots/zen.png) | ![Zen garden at sunset](screenshots/zen-sunset.png) | ![Zen garden at night](screenshots/zen-night.png) |
| Prehistoric | ![Prehistoric by day](screenshots/prehistoric.png) | ![Prehistoric at sunset](screenshots/prehistoric-sunset.png) | ![Prehistoric at night](screenshots/prehistoric-night.png) |

## License

[MIT](LICENSE)
