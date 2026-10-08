import { Plugin } from "@opencode/plugin/tui"
import { createEffect, createSignal } from "solid-js"
import { ACTIVITIES, TIMES, createEngine, type Activity, type Mode, type Time } from "./src/engine"
import { WALLPAPERS } from "./wallpapers"

export default Plugin.define({
  id: "wallpapers",
  setup(context) {
    const [stored, update] = context.storage.store<{ wallpaper: string; mode: Mode; activity?: Activity; time?: Time | "auto" }>("wallpapers", {
      initial: { wallpaper: "", mode: "panels", activity: "calm", time: "auto" },
    })
    const engine = createEngine(context, { dump: process.env.WALLPAPER_DUMP })
    // Environment overrides for development; they win over the stored choice.
    const pinned = process.env.WALLPAPER
    const pinnedMode = process.env.WALLPAPER_MODE
    const pinnedActivity = process.env.WALLPAPER_ACTIVITY
    const pinnedTime = process.env.WALLPAPER_TIME
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

    const notify = (message: string, variant: "info" | "error" = "info") => context.ui.toast.show({ message, variant })
    const choose = (id: string) => {
      const wallpaper = WALLPAPERS.find((w) => w.id === id)
      if (!wallpaper) return notify(`No wallpaper "${id}". Available: ${WALLPAPERS.map((w) => w.id).join(", ")}`, "error")
      void update((draft) => {
        draft.wallpaper = id
      })
      notify(`${wallpaper.name} wallpaper on`)
    }
    const off = () => {
      void update((draft) => {
        draft.wallpaper = ""
      })
      notify("Wallpaper off")
    }
    const setMode = (mode: Mode) => {
      void update((draft) => {
        draft.mode = mode
      })
      notify(mode === "panels" ? "Wallpaper in panels only" : "Wallpaper behind everything")
    }
    const setActivity = (level: Activity) => {
      void update((draft) => {
        draft.activity = level
      })
      notify(`Wallpaper activity: ${level}`)
    }
    const setTime = (value: Time | "auto") => {
      void update((draft) => {
        draft.time = value
      })
      notify(value === "auto" ? `Wallpaper time follows your clock (${timeAt(new Date())} now)` : `Wallpaper time: ${value}`)
    }
    // Every choice in the picker is a /wallpaper argument, so picking one runs it.
    const pick = async () => {
      const current = (on: boolean) => (on ? "current" : undefined)
      const levels = (WALLPAPERS.find((w) => w.id === stored.wallpaper) ?? WALLPAPERS[0]).activity
      const arg = await context.ui.dialog.select({
        title: "Wallpaper",
        current: stored.wallpaper || "off",
        options: [
          ...WALLPAPERS.map((w) => ({ title: w.name, value: w.id, description: w.description, category: "Wallpapers" })),
          { title: "Off", value: "off", category: "Wallpapers" },
          ...ACTIVITIES.map((level) => ({ title: capitalize(level), value: level, description: levels[level], footer: current(activity() === level), category: "Activity" })),
          { title: "Auto", value: "auto", description: `Follows your clock · ${timeAt(new Date())} now`, footer: current(timeSetting() === "auto"), category: "Time of day" },
          ...TIMES.map((t) => ({ title: capitalize(t), value: t, footer: current(timeSetting() === t), category: "Time of day" })),
          { title: "In panels", value: "panels", description: "Sidebar, prompt, notices", footer: current(stored.mode === "panels"), category: "Show it" },
          { title: "Behind everything", value: "behind", description: "Whole background", footer: current(stored.mode === "behind"), category: "Show it" },
        ],
      })
      if (arg) run(arg)
    }
    const run = (input?: string) => {
      const arg = input?.trim().toLowerCase()
      if (!arg) return pick()
      if (arg === "off") return off()
      if (arg === "panels" || arg === "behind") return setMode(arg)
      const level = ACTIVITIES.find((a) => a === arg)
      if (level) return setActivity(level)
      const t = TIMES.find((value) => value === arg)
      if (t || arg === "auto") return setTime(t ?? "auto")
      choose(arg)
    }

    const unslot = context.ui.slot({
      append: "app",
      render() {
        createEffect(() => {
          engine.mode = pinnedMode === "behind" || pinnedMode === "panels" ? pinnedMode : stored.mode
          const wallpaper = WALLPAPERS.find((w) => w.id === (pinned ?? stored.wallpaper))
          const level = ACTIVITIES.find((a) => a === pinnedActivity) ?? activity()
          if (wallpaper) engine.start(wallpaper, { activity: level, time: time() })
          else engine.stop()
        })
        context.keymap.layer(() => ({
          mode: "global",
          commands: [
            {
              id: "wallpapers.choose",
              title: "Choose wallpaper",
              description: "Animated scene behind the UI. Args: wallpaper id, off, calm, lively, teeming, day, sunset, night, auto, panels, behind",
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
              run: off,
            },
            {
              id: "wallpapers.mode",
              title: "Switch wallpaper mode",
              description: "Panels only, or behind everything",
              group: "Wallpapers",
              palette: true,
              run: () => setMode(stored.mode === "panels" ? "behind" : "panels"),
            },
            {
              id: "wallpapers.activity",
              title: "Cycle wallpaper activity",
              description: "Calm, lively, teeming",
              group: "Wallpapers",
              palette: true,
              run: () => setActivity(ACTIVITIES[(ACTIVITIES.indexOf(activity()) + 1) % ACTIVITIES.length]),
            },
            {
              id: "wallpapers.time",
              title: "Cycle wallpaper time of day",
              description: "Auto, day, sunset, night",
              group: "Wallpapers",
              palette: true,
              run: () => {
                const options = ["auto", ...TIMES] as const
                setTime(options[(options.indexOf(timeSetting()) + 1) % options.length])
              },
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

// Day from 7am, sunset around dawn and dusk, night from 8pm.
function timeAt(date: Date): Time {
  const hour = date.getHours() + date.getMinutes() / 60
  if (hour >= 20 || hour < 6) return "night"
  if (hour < 7 || hour >= 18) return "sunset"
  return "day"
}
