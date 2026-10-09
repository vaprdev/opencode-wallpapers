import { Plugin } from "@opencode/plugin/tui"
import { RGBA, TextAttributes } from "@opentui/core"
import { For, createEffect, createSignal } from "solid-js"
import { ACTIVITIES, BRIGHTNESSES, POWERS, TIMES, createEngine, parseEvents, type Activity, type AgentEvent, type Brightness, type Power, type Time } from "./src/engine"
import { WALLPAPERS } from "./wallpapers"

export default Plugin.define({
  id: "wallpapers",
  setup(context) {
    const [stored, update] = context.storage.store<Stored>("wallpapers", {
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
    const brightness = () => stored.brightness ?? "normal"
    const shuffleSetting = () => stored.shuffle ?? "off"
    const directory = () => context.location?.directory ?? context.data.location.default().directory
    // Where the wallpaper choice lives: the project's directory when per-project is on, otherwise "" for everywhere.
    const scope = (state: Stored) => (state.perProject ? directory() : "")
    const current = (state: Stored) => (state.perProject ? state.projects?.[directory()] : undefined) ?? state.wallpaper
    const choose = (draft: Stored, id: string) => {
      if (draft.perProject) draft.projects = { ...draft.projects, [directory()]: id }
      else draft.wallpaper = id
      draft.changed = { ...draft.changed, [scope(draft)]: Date.now() }
    }
    // A project without its own change time yet counts from the global one.
    const due = (state: Stored) => Date.now() - (state.changed?.[scope(state)] ?? state.changed?.[""] ?? 0) >= HOUR
    const other = (id: string) => {
      const others = WALLPAPERS.filter((w) => w.id !== id)
      return others[Math.floor(Math.random() * others.length)].id
    }
    // Switches to a different wallpaper once an hour has passed. The check repeats under the storage lock, so several
    // running OpenCodes shuffle once between them.
    const shuffle = () =>
      update((draft) => {
        const id = current(draft)
        if (id && due(draft)) choose(draft, other(id))
      })
    // Every-session shuffle runs once per OpenCode start; memory storage outlives plugin hot reloads. It picks before
    // the first frame and shows the pick while it saves, so the previous wallpaper never appears.
    const [session, mark] = context.storage.memory("session", { initial: { shuffled: false } })
    const [picked, setPicked] = createSignal<string>()
    if (!session.shuffled && shuffleSetting() === "session" && current(stored)) {
      const id = other(current(stored))
      setPicked(id)
      void update((draft) => choose(draft, id)).finally(() => setPicked(undefined))
    }
    mark((draft) => {
      draft.shuffled = true
    })
    const shown = () => picked() ?? current(stored)
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
        await update((draft) => choose(draft, ""))
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
      const b = BRIGHTNESSES.find((value) => value === arg)
      if (b) {
        await update((draft) => {
          draft.brightness = b
        })
        return { message: `Wallpaper brightness: ${b}` }
      }
      const wallpaper = WALLPAPERS.find((w) => w.id === arg)
      if (!wallpaper) return { message: `No wallpaper "${arg}". Available: ${WALLPAPERS.map((w) => w.id).join(", ")}`, error: true }
      await update((draft) => choose(draft, arg))
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
        value: () => shown() || "off",
        label: (v) => WALLPAPERS.find((w) => w.id === v)?.name ?? "Off",
        describe: (v) => WALLPAPERS.find((w) => w.id === v)?.description ?? "No wallpaper",
        set: apply,
      },
      {
        title: "Shuffle",
        values: () => SHUFFLES,
        value: shuffleSetting,
        label: (v) => ({ off: "Off", hourly: "Every hour", session: "Every session" })[v as Shuffle],
        describe: (v) =>
          ({
            off: "Keep the wallpaper you chose",
            hourly: "Switch to a different wallpaper every hour",
            session: "Switch to a different wallpaper each time OpenCode starts",
          })[v as Shuffle],
        set: (v) =>
          update((draft) => {
            draft.shuffle = v as Shuffle
            draft.changed = { ...draft.changed, [scope(draft)]: Date.now() }
          }),
      },
      {
        title: "Per project",
        values: () => ["off", "on"],
        value: () => (stored.perProject ? "on" : "off"),
        label: capitalize,
        describe: (v) =>
          v === "on"
            ? `Each project remembers its own wallpaper, starting from the global one. This project: ${context.ui.format.path(directory())}`
            : "The same wallpaper in every project",
        set: (v) =>
          update((draft) => {
            draft.perProject = v === "on"
          }),
      },
      {
        title: "Activity",
        values: () => ACTIVITIES,
        value: activity,
        label: capitalize,
        describe: (v) => (WALLPAPERS.find((w) => w.id === shown()) ?? WALLPAPERS[0]).activity[v as Activity],
        set: apply,
      },
      {
        title: "Time of day",
        values: () => ["auto", ...TIMES],
        value: timeSetting,
        label: (v) => (v === "auto" ? `Auto (${timeAt(now())})` : capitalize(v)),
        describe: (v) => (v === "auto" ? "Follows your clock: day from 7am, sunset from 6pm, night from 8pm" : `Always ${v}`),
        set: apply,
      },
      {
        title: "Brightness",
        values: () => BRIGHTNESSES,
        value: brightness,
        label: capitalize,
        describe: (v) =>
          ({ subtle: "A dim scene that stays out of the way", normal: "The standard look", vivid: "A brighter scene, with firmer shade behind text" })[
            v as Brightness
          ] + (context.themeMode === "light" ? ", washed out for your light theme" : ""),
        set: apply,
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
        set: apply,
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
        await row.set(next).finally(() => {
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
          const wallpaper = WALLPAPERS.find((w) => w.id === (pinned ?? shown()))
          const level = ACTIVITIES.find((a) => a === pinnedActivity) ?? activity()
          const choice = timeChoice()
          // With the same choices as last time, only the clock can have moved auto on to a new time of day: that fades slowly.
          const key = `${wallpaper?.id} ${level} ${choice}`
          const slow = key === chosen
          chosen = key
          if (!wallpaper) return engine.stop()
          engine.start(wallpaper, { activity: level, time: choice === "auto" ? timeAt(now()) : choice, brightness: brightness() }, slow ? CLOCK_FADE : undefined)
        })
        createEffect(() => engine.power(power()))
        createEffect(() => {
          now()
          if (shuffleSetting() === "hourly" && current(stored) && due(stored)) void shuffle()
        })
        context.keymap.layer(() => ({
          mode: "global",
          commands: [
            {
              id: "wallpapers.choose",
              title: "Choose wallpaper",
              description: "Animated scene behind the UI. Args: wallpaper id, off, calm, lively, teeming, day, sunset, night, auto, subtle, normal, vivid, saver, smooth",
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

const SHUFFLES = ["off", "hourly", "session"] as const
type Shuffle = (typeof SHUFFLES)[number]
const HOUR = 3_600_000

interface Stored {
  wallpaper: string
  activity?: Activity
  time?: Time | "auto"
  brightness?: Brightness
  power?: Power
  shuffle?: Shuffle
  // Wallpapers by project directory, shown instead of the global one while perProject is on.
  perProject?: boolean
  projects?: Record<string, string>
  // When the wallpaper last changed, by scope, for hourly shuffle.
  changed?: Record<string, number>
}

// A setting in the picker: its values in order, how to show each, a line explaining the current one, and how to save one.
interface Row {
  title: string
  values: () => readonly string[]
  value: () => string
  label: (value: string) => string
  describe: (value: string) => string
  set: (value: string) => Promise<unknown>
}
