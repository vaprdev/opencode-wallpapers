# OpenCode Wallpapers

Animated wallpapers for the OpenCode terminal UI: slow, quiet scenes behind everything, kept readable behind text.

![Beach, tundra, jungle, desert and space wallpapers in motion](https://raw.githubusercontent.com/vaprdev/opencode-wallpapers/assets/hero.gif)

> This project is not affiliated with, endorsed by, or sponsored by OpenCode or its maintainers.

## Install

Requires OpenCode 2:

```sh
opencode plugin add vaprdev/opencode-wallpapers#release
```

Update with `opencode plugin update`. Restart OpenCode after either. If you installed it with `git clone` before, delete
`~/.config/opencode/plugins/wallpapers`.

## Use

Type `/wallpaper` to open the menu and pick a wallpaper; none shows until you do. ↑/↓ picks a setting, Enter or ←/→ changes it, Escape closes it.

![The wallpaper menu](https://raw.githubusercontent.com/vaprdev/opencode-wallpapers/assets/menu.png)

- **Collection:** Landscapes, Akira, Classics, Arcade or all: which wallpapers the menu and shuffle pick from.
- **Activity:** calm, lively or teeming: how much moves behind your work.
- **Time, season and weather:** for Landscapes and Arcade. Time follows your clock or stays fixed, seasons follow the
  calendar, and weather can be the real weather where you are (`/wallpaper location Berlin`). Akira and Classics keep
  one look.
- **Brightness, shuffle, per project and power:** subtle to vivid, a new wallpaper every hour, one per project, and
  slowing down when idle.

Scenes react to your agent: they speed up while it works, a visitor shows up when it finishes, and clouds roll in after
an error. With mouse support, clicking empty background nudges the scene, and each wallpaper hides a rare surprise.

## Wallpapers

- **Landscapes:** `ocean` · `desert` · `jungle` · `space` · `farm` · `tundra` · `beach` · `city` · `zen` · `prehistoric` · `haunted-house`
- **Akira:** `rider` · `megacity` · `dome`
- **Classics:** `flowerbox` · `maze` · `pipes` · `mystify` · `flying-opencode` · `matrix`
- **Arcade:** `wings` · `wings-flight` · `wings-bridge`

| Spring | Summer | Autumn | Winter |
| --- | --- | --- | --- |
| ![Farm in spring](https://raw.githubusercontent.com/vaprdev/opencode-wallpapers/assets/farm-spring.png) | ![Farm in summer](https://raw.githubusercontent.com/vaprdev/opencode-wallpapers/assets/farm-summer.png) | ![Farm in autumn](https://raw.githubusercontent.com/vaprdev/opencode-wallpapers/assets/farm-autumn.png) | ![Farm in winter](https://raw.githubusercontent.com/vaprdev/opencode-wallpapers/assets/farm-winter.png) |

![Farm in the rain](https://raw.githubusercontent.com/vaprdev/opencode-wallpapers/assets/farm-rain.png)

## Terminals

Any truecolor terminal works. Ghostty and kitty get finer octant characters; others get quadrant blocks.

| Variable | Effect |
| --- | --- |
| `WALLPAPER_PIXELS=1` | In Ghostty or kitty, draw the scene as a real image |
| `WALLPAPER_SUPERSAMPLE=2` | Smoother edges, at about 2.5x the CPU |
| `WALLPAPER_OCTANTS=0` or `1` | Force quadrant or octant characters |
| `WALLPAPER_SMOOTH=0` | Octants without wedges and eighth blocks |
| `WALLPAPER_LOCATION` | A place or `latitude,longitude` for local weather |

## Make a wallpaper

See [CONTRIBUTING.md](CONTRIBUTING.md).

## Gallery

At teeming; the GIFs play at 3x speed.

### Landscapes

| | |
| --- | --- |
| ![Ocean in motion](https://raw.githubusercontent.com/vaprdev/opencode-wallpapers/assets/ocean.gif) | ![Desert in motion](https://raw.githubusercontent.com/vaprdev/opencode-wallpapers/assets/desert.gif) |
| ![Jungle in motion](https://raw.githubusercontent.com/vaprdev/opencode-wallpapers/assets/jungle.gif) | ![Space in motion](https://raw.githubusercontent.com/vaprdev/opencode-wallpapers/assets/space.gif) |
| ![Farm in motion](https://raw.githubusercontent.com/vaprdev/opencode-wallpapers/assets/farm.gif) | ![Tundra in motion](https://raw.githubusercontent.com/vaprdev/opencode-wallpapers/assets/tundra.gif) |
| ![Beach in motion](https://raw.githubusercontent.com/vaprdev/opencode-wallpapers/assets/beach.gif) | ![City in motion](https://raw.githubusercontent.com/vaprdev/opencode-wallpapers/assets/city.gif) |
| ![Zen garden in motion](https://raw.githubusercontent.com/vaprdev/opencode-wallpapers/assets/zen.gif) | ![Prehistoric in motion](https://raw.githubusercontent.com/vaprdev/opencode-wallpapers/assets/prehistoric.gif) |
| ![Haunted house in motion](https://raw.githubusercontent.com/vaprdev/opencode-wallpapers/assets/haunted-house.gif) | |

| | Day | Sunset | Night |
| --- | --- | --- | --- |
| Ocean | ![Ocean by day](https://raw.githubusercontent.com/vaprdev/opencode-wallpapers/assets/ocean.png) | ![Ocean at sunset](https://raw.githubusercontent.com/vaprdev/opencode-wallpapers/assets/ocean-sunset.png) | ![Ocean at night](https://raw.githubusercontent.com/vaprdev/opencode-wallpapers/assets/ocean-night.png) |
| Desert | ![Desert by day](https://raw.githubusercontent.com/vaprdev/opencode-wallpapers/assets/desert.png) | ![Desert at sunset](https://raw.githubusercontent.com/vaprdev/opencode-wallpapers/assets/desert-sunset.png) | ![Desert at night](https://raw.githubusercontent.com/vaprdev/opencode-wallpapers/assets/desert-night.png) |
| Jungle | ![Jungle by day](https://raw.githubusercontent.com/vaprdev/opencode-wallpapers/assets/jungle.png) | ![Jungle at sunset](https://raw.githubusercontent.com/vaprdev/opencode-wallpapers/assets/jungle-sunset.png) | ![Jungle at night](https://raw.githubusercontent.com/vaprdev/opencode-wallpapers/assets/jungle-night.png) |
| Space | ![Space by day](https://raw.githubusercontent.com/vaprdev/opencode-wallpapers/assets/space.png) | ![Space at sunset](https://raw.githubusercontent.com/vaprdev/opencode-wallpapers/assets/space-sunset.png) | ![Space at night](https://raw.githubusercontent.com/vaprdev/opencode-wallpapers/assets/space-night.png) |
| Farm | ![Farm by day](https://raw.githubusercontent.com/vaprdev/opencode-wallpapers/assets/farm.png) | ![Farm at sunset](https://raw.githubusercontent.com/vaprdev/opencode-wallpapers/assets/farm-sunset.png) | ![Farm at night](https://raw.githubusercontent.com/vaprdev/opencode-wallpapers/assets/farm-night.png) |
| Tundra | ![Tundra by day](https://raw.githubusercontent.com/vaprdev/opencode-wallpapers/assets/tundra.png) | ![Tundra at sunset](https://raw.githubusercontent.com/vaprdev/opencode-wallpapers/assets/tundra-sunset.png) | ![Tundra at night](https://raw.githubusercontent.com/vaprdev/opencode-wallpapers/assets/tundra-night.png) |
| Beach | ![Beach by day](https://raw.githubusercontent.com/vaprdev/opencode-wallpapers/assets/beach.png) | ![Beach at sunset](https://raw.githubusercontent.com/vaprdev/opencode-wallpapers/assets/beach-sunset.png) | ![Beach at night](https://raw.githubusercontent.com/vaprdev/opencode-wallpapers/assets/beach-night.png) |
| City | ![City by day](https://raw.githubusercontent.com/vaprdev/opencode-wallpapers/assets/city.png) | ![City at sunset](https://raw.githubusercontent.com/vaprdev/opencode-wallpapers/assets/city-sunset.png) | ![City at night](https://raw.githubusercontent.com/vaprdev/opencode-wallpapers/assets/city-night.png) |
| Zen garden | ![Zen garden by day](https://raw.githubusercontent.com/vaprdev/opencode-wallpapers/assets/zen.png) | ![Zen garden at sunset](https://raw.githubusercontent.com/vaprdev/opencode-wallpapers/assets/zen-sunset.png) | ![Zen garden at night](https://raw.githubusercontent.com/vaprdev/opencode-wallpapers/assets/zen-night.png) |
| Prehistoric | ![Prehistoric by day](https://raw.githubusercontent.com/vaprdev/opencode-wallpapers/assets/prehistoric.png) | ![Prehistoric at sunset](https://raw.githubusercontent.com/vaprdev/opencode-wallpapers/assets/prehistoric-sunset.png) | ![Prehistoric at night](https://raw.githubusercontent.com/vaprdev/opencode-wallpapers/assets/prehistoric-night.png) |
| Haunted house | ![Haunted house by day](https://raw.githubusercontent.com/vaprdev/opencode-wallpapers/assets/haunted-house.png) | ![Haunted house at sunset](https://raw.githubusercontent.com/vaprdev/opencode-wallpapers/assets/haunted-house-sunset.png) | ![Haunted house at night](https://raw.githubusercontent.com/vaprdev/opencode-wallpapers/assets/haunted-house-night.png) |

### Akira

| | Still | In motion |
| --- | --- | --- |
| Rider | ![Rider](https://raw.githubusercontent.com/vaprdev/opencode-wallpapers/assets/rider.png) | ![Rider in motion](https://raw.githubusercontent.com/vaprdev/opencode-wallpapers/assets/rider.gif) |
| Megacity | ![Megacity](https://raw.githubusercontent.com/vaprdev/opencode-wallpapers/assets/megacity.png) | ![Megacity in motion](https://raw.githubusercontent.com/vaprdev/opencode-wallpapers/assets/megacity.gif) |
| Dome | ![Dome](https://raw.githubusercontent.com/vaprdev/opencode-wallpapers/assets/dome.png) | ![Dome in motion](https://raw.githubusercontent.com/vaprdev/opencode-wallpapers/assets/dome.gif) |

### Classics

| | Still | In motion |
| --- | --- | --- |
| Flower Box | ![Flower Box](https://raw.githubusercontent.com/vaprdev/opencode-wallpapers/assets/flowerbox.png) | ![Flower Box in motion](https://raw.githubusercontent.com/vaprdev/opencode-wallpapers/assets/flowerbox.gif) |
| 3D Maze | ![3D Maze](https://raw.githubusercontent.com/vaprdev/opencode-wallpapers/assets/maze.png) | ![3D Maze in motion](https://raw.githubusercontent.com/vaprdev/opencode-wallpapers/assets/maze.gif) |
| 3D Pipes | ![3D Pipes](https://raw.githubusercontent.com/vaprdev/opencode-wallpapers/assets/pipes.png) | ![3D Pipes in motion](https://raw.githubusercontent.com/vaprdev/opencode-wallpapers/assets/pipes.gif) |
| Mystify | ![Mystify](https://raw.githubusercontent.com/vaprdev/opencode-wallpapers/assets/mystify.png) | ![Mystify in motion](https://raw.githubusercontent.com/vaprdev/opencode-wallpapers/assets/mystify.gif) |
| Flying OpenCode | ![Flying OpenCode](https://raw.githubusercontent.com/vaprdev/opencode-wallpapers/assets/flying-opencode.png) | ![Flying OpenCode in motion](https://raw.githubusercontent.com/vaprdev/opencode-wallpapers/assets/flying-opencode.gif) |
| Matrix | ![Matrix](https://raw.githubusercontent.com/vaprdev/opencode-wallpapers/assets/matrix.png) | ![Matrix in motion](https://raw.githubusercontent.com/vaprdev/opencode-wallpapers/assets/matrix.gif) |

### Arcade

| | Day | Sunset | Night |
| --- | --- | --- | --- |
| Wings | ![Wings by day](https://raw.githubusercontent.com/vaprdev/opencode-wallpapers/assets/wings.png) | ![Wings at sunset](https://raw.githubusercontent.com/vaprdev/opencode-wallpapers/assets/wings-sunset.png) | ![Wings at night](https://raw.githubusercontent.com/vaprdev/opencode-wallpapers/assets/wings-night.png) |
| Wings: Flight | ![Wings: Flight by day](https://raw.githubusercontent.com/vaprdev/opencode-wallpapers/assets/wings-flight.png) | ![Wings: Flight at sunset](https://raw.githubusercontent.com/vaprdev/opencode-wallpapers/assets/wings-flight-sunset.png) | ![Wings: Flight at night](https://raw.githubusercontent.com/vaprdev/opencode-wallpapers/assets/wings-flight-night.png) |
| Wings: Bridge | ![Wings: Bridge by day](https://raw.githubusercontent.com/vaprdev/opencode-wallpapers/assets/wings-bridge.png) | ![Wings: Bridge at sunset](https://raw.githubusercontent.com/vaprdev/opencode-wallpapers/assets/wings-bridge-sunset.png) | ![Wings: Bridge at night](https://raw.githubusercontent.com/vaprdev/opencode-wallpapers/assets/wings-bridge-night.png) |

![Wings in motion](https://raw.githubusercontent.com/vaprdev/opencode-wallpapers/assets/wings.gif)

![Wings: Flight in motion](https://raw.githubusercontent.com/vaprdev/opencode-wallpapers/assets/wings-flight.gif)

![Wings: Bridge in motion](https://raw.githubusercontent.com/vaprdev/opencode-wallpapers/assets/wings-bridge.gif)

## License

[MIT](LICENSE)
