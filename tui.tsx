import { Plugin } from "@opencode/plugin/tui"
import { RGBA, TextAttributes } from "@opentui/core"
import { For, createEffect, createSignal, onCleanup } from "solid-js"
import { ACTIVITIES, SEASONS, TIMES, WEATHERS, createEngine, type Activity, type Season, type Time, type Weather } from "./src/engine"
import { REFRESH, coordinatesOf, forecast, type Forecast } from "./src/forecast"
import { WALLPAPERS } from "./wallpapers"

export default Plugin.define({
  id: "wallpapers",
  setup(context) {
    const [stored, update] = context.storage.store<{ wallpaper: string; activity?: Activity; time?: Time | "auto"; season?: Season | "auto"; weather?: WeatherSetting; location?: string }>("wallpapers", {
      initial: { wallpaper: "", activity: "calm", time: "auto" },
    })
    const engine = createEngine(context, { dump: process.env.WALLPAPER_DUMP })
    // Environment overrides for development; they win over the stored choice.
    const pinned = process.env.WALLPAPER
    const pinnedActivity = process.env.WALLPAPER_ACTIVITY
    const pinnedTime = process.env.WALLPAPER_TIME
    const pinnedSeason = SEASONS.find((s) => s === process.env.WALLPAPER_SEASON)
    const pinnedWeather = WEATHER_SETTINGS.find((w) => w === process.env.WALLPAPER_WEATHER)
    // Settings saved before these options existed have none.
    const activity = () => stored.activity ?? "calm"
    const timeSetting = () => stored.time ?? "auto"
    // Auto follows the local clock, checked once a minute.
    const [now, setNow] = createSignal(new Date())
    const clock = setInterval(() => setNow(new Date()), 60_000)
    const time = () => {
      const setting = TIMES.find((t) => t === pinnedTime) ?? timeSetting()
      return setting === "auto" ? timeAt(now()) : setting
    }
    const seasonSetting = () => stored.season ?? "auto"
    const weatherSetting = () => stored.weather ?? "off"
    // A place for local weather: "/wallpaper location <place>", else WALLPAPER_LOCATION.
    const location = () => stored.location || process.env.WALLPAPER_LOCATION || ""
    const [local, setLocal] = createSignal<Forecast>()
    // Seasons flip in the southern hemisphere, once the location's latitude is known.
    const south = () => (coordinatesOf(location())?.latitude ?? local()?.latitude ?? 0) < 0
    const season = () => {
      const setting = pinnedSeason ?? seasonSetting()
      return setting === "auto" ? seasonAt(now(), south()) : setting
    }
    const weather = (): Weather | undefined => {
      const setting = pinnedWeather ?? weatherSetting()
      if (setting === "off") return undefined
      if (setting === "local") return local()?.weather ?? "clear"
      return setting
    }

    const notify = (message: string, variant: "info" | "error" = "info") => context.ui.toast.show({ message, variant })
    // Applies one /wallpaper argument and says what changed.
    const apply = async (arg: string): Promise<{ message: string; error?: true }> => {
      if (arg === "off") {
        await update((draft) => {
          draft.wallpaper = ""
        })
        return { message: "Wallpaper off" }
      }
      const level = ACTIVITIES.find((a) => a === arg)
      if (level) {
        await update((draft) => {
          draft.activity = level
        })
        return { message: `Wallpaper activity: ${level}` }
      }
      if (arg === "location" || arg.startsWith("location ")) {
        const place = arg.slice("location".length).trim()
        await update((draft) => {
          draft.location = place
        })
        return { message: place ? `Wallpaper location: ${place}` : "Wallpaper location cleared" }
      }
      const s = SEASONS.find((value) => value === arg || `season ${value}` === arg)
      if (s || arg === "season auto") {
        await update((draft) => {
          draft.season = s ?? "auto"
        })
        return { message: s ? `Wallpaper season: ${s}` : `Wallpaper season follows the calendar (${seasonAt(new Date(), south())} now)` }
      }
      const w = WEATHER_SETTINGS.find((value) => (value === arg && value !== "off") || `weather ${value}` === arg)
      if (w) {
        await update((draft) => {
          draft.weather = w
        })
        if (w === "local" && !location()) return { message: "Local weather needs a place: /wallpaper location <city or lat,lon>. Showing clear until then", error: true }
        return { message: w === "off" ? "Wallpaper weather: the wallpaper's own" : `Wallpaper weather: ${w}` }
      }
      const t = TIMES.find((value) => value === arg)
      if (t || arg === "auto") {
        await update((draft) => {
          draft.time = t ?? "auto"
        })
        return { message: t ? `Wallpaper time: ${t}` : `Wallpaper time follows your clock (${timeAt(new Date())} now)` }
      }
      const wallpaper = WALLPAPERS.find((w) => w.id === arg)
      if (!wallpaper) return { message: `No wallpaper "${arg}". Available: ${WALLPAPERS.map((w) => w.id).join(", ")}`, error: true }
      await update((draft) => {
        draft.wallpaper = arg
      })
      return { message: `${wallpaper.name} wallpaper on` }
    }
    const run = async (input?: string) => {
      const arg = input?.trim().toLowerCase()
      if (!arg) return pick()
      const result = await apply(arg)
      notify(result.message, result.error ? "error" : "info")
    }
    // The picker works like OpenCode's settings: a row per setting with its value on the right. Enter or the arrow
    // keys change the highlighted row in place, and the dialog stays open until Escape.
    const rows: Row[] = [
      {
        title: "Wallpaper",
        values: () => ["off", ...WALLPAPERS.map((w) => w.id)],
        value: () => stored.wallpaper || "off",
        label: (v) => WALLPAPERS.find((w) => w.id === v)?.name ?? "Off",
        describe: (v) => WALLPAPERS.find((w) => w.id === v)?.description ?? "No wallpaper",
      },
      {
        title: "Activity",
        values: () => ACTIVITIES,
        value: activity,
        label: capitalize,
        describe: (v) => (WALLPAPERS.find((w) => w.id === stored.wallpaper) ?? WALLPAPERS[0]).activity[v as Activity],
      },
      {
        title: "Time of day",
        values: () => ["auto", ...TIMES],
        value: timeSetting,
        label: (v) => (v === "auto" ? `Auto (${timeAt(now())})` : capitalize(v)),
        describe: (v) => (v === "auto" ? "Follows your clock: day from 7am, sunset from 6pm, night from 8pm" : `Always ${v}`),
      },
      {
        title: "Season",
        values: () => ["season auto", ...SEASONS.map((s) => `season ${s}`)],
        value: () => `season ${seasonSetting()}`,
        label: (v) => (v === "season auto" ? `Auto (${seasonAt(now(), south())})` : capitalize(v.slice(7))),
        describe: (v) =>
          v === "season auto"
            ? `Follows the calendar in the ${south() ? "southern" : "northern"} hemisphere: spring from ${south() ? "September" : "March"}, summer from ${south() ? "December" : "June"}, autumn from ${south() ? "March" : "September"}, winter from ${south() ? "June" : "December"}`
            : `Always ${v.slice(7)}. Farm, desert, jungle and beach change with the seasons`,
      },
      {
        title: "Weather",
        values: () => ["off", "local", "clear", "rain", "snow", "fog"].map((w) => `weather ${w}`),
        value: () => `weather ${weatherSetting()}`,
        label: (v) => (v === "weather local" ? `Local (${location() ? (local()?.weather ?? "checking") : "no location"})` : capitalize(v.slice(8))),
        describe: (v) => {
          if (v === "weather off") return "Each wallpaper's own: snow on the tundra, a winter flurry on the farm, showers in the jungle's rainy season"
          if (v !== "weather local") return `Always ${v.slice(8)} on outdoor wallpapers`
          if (!location()) return "Set a place first: /wallpaper location <city or lat,lon>, or WALLPAPER_LOCATION"
          return `Real weather for ${location()} from Open-Meteo, checked every 30 minutes`
        },
      },
    ]
    const Picker = () => {
      const theme = context.theme.surface("dialog")
      const [selected, setSelected] = createSignal(0)
      let saving = false
      const change = async (index: number, direction: number) => {
        if (saving) return
        const row = rows[index]
        const values = row.values()
        const next = values[(values.indexOf(row.value()) + direction + values.length) % values.length]
        saving = true
        await apply(next).finally(() => {
          saving = false
        })
      }
      const move = (direction: number) => {
        setSelected((i) => (i + direction + rows.length) % rows.length)
      }
      context.keymap.layer(() => ({
        mode: "modal",
        commands: [
          { bind: "up", title: "Previous setting", group: "Wallpaper", run: () => move(-1) },
          { bind: "ctrl+p", title: "Previous setting", group: "Wallpaper", run: () => move(-1) },
          { bind: "down", title: "Next setting", group: "Wallpaper", run: () => move(1) },
          { bind: "ctrl+n", title: "Next setting", group: "Wallpaper", run: () => move(1) },
          { bind: "right", title: "Next value", group: "Wallpaper", run: () => void change(selected(), 1) },
          { bind: "return", title: "Next value", group: "Wallpaper", run: () => void change(selected(), 1) },
          { bind: "left", title: "Previous value", group: "Wallpaper", run: () => void change(selected(), -1) },
        ],
      }))
      return (
        <box gap={1} paddingBottom={1}>
          <box paddingLeft={4} paddingRight={4} flexDirection="row" justifyContent="space-between">
            <text fg={theme.text.base} attributes={TextAttributes.BOLD}>
              Wallpaper settings
            </text>
            <text fg={theme.text.muted} onMouseUp={() => context.ui.dialog.clear()}>
              esc
            </text>
          </box>
          <box>
            <For each={rows}>
              {(row, index) => {
                const active = () => selected() === index()
                const fg = () => (active() ? theme.text.action.primary.focused : theme.text.base)
                return (
                  <box
                    flexDirection="row"
                    paddingLeft={4}
                    paddingRight={4}
                    backgroundColor={active() ? theme.background.action.primary.focused : RGBA.fromInts(0, 0, 0, 0)}
                    onMouseUp={() => {
                      setSelected(index())
                      void change(index(), 1)
                    }}
                  >
                    <text flexGrow={1} fg={fg()} attributes={active() ? TextAttributes.BOLD : undefined}>
                      {row.title}
                    </text>
                    <text fg={active() ? fg() : theme.text.muted}>{active() ? `‹ ${row.label(row.value())} ›` : row.label(row.value())}</text>
                  </box>
                )
              }}
            </For>
          </box>
          <box paddingLeft={4} paddingRight={4}>
            <text fg={theme.text.muted} wrapMode="word">
              {rows[selected()].describe(rows[selected()].value())}
            </text>
          </box>
          <box paddingLeft={4} flexDirection="row" gap={2}>
            <text>
              <span style={{ fg: theme.text.base }}>
                <b>↑/↓</b>{" "}
              </span>
              <span style={{ fg: theme.text.muted }}>setting</span>
            </text>
            <text>
              <span style={{ fg: theme.text.base }}>
                <b>enter ←/→</b>{" "}
              </span>
              <span style={{ fg: theme.text.muted }}>change</span>
            </text>
          </box>
        </box>
      )
    }
    const pick = () => context.ui.dialog.show(() => <Picker />)
    const cycle = <T extends string>(options: readonly T[], value: T) => run(options[(options.indexOf(value) + 1) % options.length])

    const unslot = context.ui.slot({
      append: "app",
      render() {
        createEffect(() => {
          const wallpaper = WALLPAPERS.find((w) => w.id === (pinned ?? stored.wallpaper))
          const level = ACTIVITIES.find((a) => a === pinnedActivity) ?? activity()
          if (wallpaper) engine.start(wallpaper, { activity: level, time: time(), season: season(), weather: weather() })
          else engine.stop()
        })
        // Local weather is fetched only while it is the chosen setting.
        createEffect(() => {
          const place = location()
          if ((pinnedWeather ?? weatherSetting()) !== "local" || !place) return
          const refresh = () => void forecast(place).then(setLocal)
          refresh()
          const timer = setInterval(refresh, REFRESH)
          onCleanup(() => clearInterval(timer))
        })
        context.keymap.layer(() => ({
          mode: "global",
          commands: [
            {
              id: "wallpapers.choose",
              title: "Choose wallpaper",
              description: "Animated scene behind the UI. Args: wallpaper id, off, calm, lively, teeming, day, sunset, night, auto, a season, a weather, location <place>",
              group: "Wallpapers",
              palette: true,
              slash: { name: "wallpaper", arguments: true },
              run,
            },
            {
              id: "wallpapers.off",
              title: "Turn off wallpaper",
              group: "Wallpapers",
              palette: true,
              run: () => run("off"),
            },
            {
              id: "wallpapers.activity",
              title: "Cycle wallpaper activity",
              description: "Calm, lively, teeming",
              group: "Wallpapers",
              palette: true,
              run: () => cycle(ACTIVITIES, activity()),
            },
            {
              id: "wallpapers.time",
              title: "Cycle wallpaper time of day",
              description: "Auto, day, sunset, night",
              group: "Wallpapers",
              palette: true,
              run: () => cycle(["auto", ...TIMES] as const, timeSetting()),
            },
          ],
        }))
        return null
      },
    })

    return () => {
      clearInterval(clock)
      engine.stop()
      unslot()
    }
  },
})

function capitalize(text: string) {
  return text[0].toUpperCase() + text.slice(1)
}

const WEATHER_SETTINGS = ["off", "local", ...WEATHERS] as const
type WeatherSetting = (typeof WEATHER_SETTINGS)[number]

// Meteorological seasons: spring from March in the north, from September in the south.
function seasonAt(date: Date, south: boolean): Season {
  return SEASONS[(Math.floor(((date.getMonth() + 10) % 12) / 3) + (south ? 2 : 0)) % 4]
}

// Day from 7am, sunset around dawn and dusk, night from 8pm.
function timeAt(date: Date): Time {
  const hour = date.getHours() + date.getMinutes() / 60
  if (hour >= 20 || hour < 6) return "night"
  if (hour < 7 || hour >= 18) return "sunset"
  return "day"
}

// A setting in the picker: its values in order, how to show each, and a line explaining the current one.
interface Row {
  title: string
  values: () => readonly string[]
  value: () => string
  label: (value: string) => string
  describe: (value: string) => string
}
