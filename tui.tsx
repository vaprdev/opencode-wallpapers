import { Plugin } from "@opencode/plugin/tui"
import { RGBA, TextAttributes } from "@opentui/core"
import { For, createEffect, createSignal } from "solid-js"
import { ACTIVITIES, POWERS, TIMES, createEngine, parseEvents, type Activity, type AgentEvent, type Power, type Time } from "./src/engine"
import { WALLPAPERS } from "./wallpapers"

export default Plugin.define({
  id: "wallpapers",
  setup(context) {
    const [stored, update] = context.storage.store<{ wallpaper: string; activity?: Activity; time?: Time | "auto"; power?: Power }>("wallpapers", {
      initial: { wallpaper: "", activity: "calm", time: "auto", power: "saver" },
    })
    const engine = createEngine(context, { dump: process.env.WALLPAPER_DUMP, dumpFade: process.env.WALLPAPER_DUMP_FADE })
    // Environment overrides for development; they win over the stored choice.
    const pinned = process.env.WALLPAPER
    const pinnedActivity = process.env.WALLPAPER_ACTIVITY
    const pinnedTime = process.env.WALLPAPER_TIME
    // Settings saved before these options existed have none.
    const activity = () => stored.activity ?? "calm"
    const timeSetting = () => stored.time ?? "auto"
    const power = () => stored.power ?? "saver"
    // Auto follows the local clock, checked once a minute. WALLPAPER_CLOCK=HH:MM starts the clock there, for trying
    // auto's transitions.
    const [hour, minute] = (process.env.WALLPAPER_CLOCK ?? "").split(":").map(Number)
    const skew = process.env.WALLPAPER_CLOCK ? new Date().setHours(hour, minute, 0, 0) - Date.now() : 0
    const [now, setNow] = createSignal(new Date(Date.now() + skew))
    const clock = setInterval(() => setNow(new Date(Date.now() + skew)), 60_000)
    const timeChoice = () => TIMES.find((t) => t === pinnedTime) ?? timeSetting()

    // The scene follows the agent: busy while any session runs, then done, error or idle once the last one stops. A
    // subagent's failure is left to its parent; repeated end events for a session count once.
    const running = new Map<string, boolean>()
    let outcome: AgentEvent = "idle"
    const started = (sessionID: string) => {
      if (![...running.values()].some(Boolean)) engine.react("busy")
      running.set(sessionID, true)
    }
    const ended = (sessionID: string, result: AgentEvent) => {
      if (running.get(sessionID) === false) return
      running.set(sessionID, false)
      if (outcome !== "error" && !(result === "error" && context.data.session.get(sessionID)?.parentID)) outcome = result
      if ([...running.values()].some(Boolean)) return
      engine.react(outcome)
      outcome = "idle"
    }
    const unlisten = [
      context.data.on("session.execution.started", (event) => started(event.data.sessionID)),
      context.data.on("session.execution.succeeded", (event) => ended(event.data.sessionID, "done")),
      context.data.on("session.execution.failed", (event) => ended(event.data.sessionID, "error")),
      context.data.on("session.execution.interrupted", (event) => ended(event.data.sessionID, "idle")),
    ]
    const simulated = parseEvents(process.env.WALLPAPER_EVENTS).map((e) => setTimeout(() => engine.react(e.event), e.at * 1000))

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
      const t = TIMES.find((value) => value === arg)
      if (t || arg === "auto") {
        await update((draft) => {
          draft.time = t ?? "auto"
        })
        return { message: t ? `Wallpaper time: ${t}` : `Wallpaper time follows your clock (${timeAt(new Date())} now)` }
      }
      const mode = POWERS.find((p) => p === arg)
      if (mode) {
        await update((draft) => {
          draft.power = mode
        })
        return { message: `Wallpaper power: ${mode}` }
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
        title: "Power",
        values: () => POWERS,
        value: power,
        label: capitalize,
        describe: (v) =>
          v === "saver"
            ? "Slows to 5 fps after 30 seconds without typing, mouse or agent activity, and pauses while the terminal is in the background"
            : "Always 15 fps",
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
        let chosen = ""
        createEffect(() => {
          const wallpaper = WALLPAPERS.find((w) => w.id === (pinned ?? stored.wallpaper))
          const level = ACTIVITIES.find((a) => a === pinnedActivity) ?? activity()
          const choice = timeChoice()
          // With the same choices as last time, only the clock can have moved auto on to a new time of day: that fades slowly.
          const key = `${wallpaper?.id} ${level} ${choice}`
          const slow = key === chosen
          chosen = key
          if (!wallpaper) return engine.stop()
          engine.start(wallpaper, { activity: level, time: choice === "auto" ? timeAt(now()) : choice }, slow ? CLOCK_FADE : undefined)
        })
        createEffect(() => engine.power(power()))
        context.keymap.layer(() => ({
          mode: "global",
          commands: [
            {
              id: "wallpapers.choose",
              title: "Choose wallpaper",
              description: "Animated scene behind the UI. Args: wallpaper id, off, calm, lively, teeming, day, sunset, night, auto, saver, smooth",
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
      for (const stop of unlisten) stop()
      for (const timer of simulated) clearTimeout(timer)
      engine.stop()
      unslot()
    }
  },
})

function capitalize(text: string) {
  return text[0].toUpperCase() + text.slice(1)
}

// Seconds auto takes to fade into the next time of day when the clock crosses into it.
const CLOCK_FADE = 90

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
