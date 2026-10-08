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
    // Applies one /wallpaper argument and says what changed.
    const apply = async (arg: string): Promise<{ message: string; error?: true }> => {
      if (arg === "off") {
        await update((draft) => {
          draft.wallpaper = ""
        })
        return { message: "Wallpaper off" }
      }
      if (arg === "panels" || arg === "behind") {
        await update((draft) => {
          draft.mode = arg
        })
        return { message: arg === "panels" ? "Wallpaper in panels only" : "Wallpaper behind everything" }
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
    // Every choice in the picker is a /wallpaper argument. Enter applies it and the picker reopens on the same item,
    // so several settings can be changed in one go; Escape closes it.
    const pick = async () => {
      let focus = stored.wallpaper || "off"
      while (true) {
        const current = (on: boolean) => (on ? "current" : undefined)
        const levels = (WALLPAPERS.find((w) => w.id === stored.wallpaper) ?? WALLPAPERS[0]).activity
        const arg = await context.ui.dialog.select({
          title: "Wallpaper · Enter applies, Esc closes",
          current: focus,
          options: [
            ...WALLPAPERS.map((w) => ({ title: w.name, value: w.id, description: w.description, footer: current(stored.wallpaper === w.id), category: "Wallpapers" })),
            { title: "Off", value: "off", footer: current(!stored.wallpaper), category: "Wallpapers" },
            ...ACTIVITIES.map((level) => ({ title: capitalize(level), value: level, description: levels[level], footer: current(activity() === level), category: "Activity" })),
            { title: "Auto", value: "auto", description: `Follows your clock · ${timeAt(new Date())} now`, footer: current(timeSetting() === "auto"), category: "Time of day" },
            ...TIMES.map((t) => ({ title: capitalize(t), value: t, footer: current(timeSetting() === t), category: "Time of day" })),
            { title: "In panels", value: "panels", description: "Sidebar, prompt, notices", footer: current(stored.mode === "panels"), category: "Show it" },
            { title: "Behind everything", value: "behind", description: "Whole background", footer: current(stored.mode === "behind"), category: "Show it" },
          ],
        })
        if (!arg) return
        await apply(arg)
        focus = arg
      }
    }
    const cycle = <T extends string>(options: readonly T[], value: T) => run(options[(options.indexOf(value) + 1) % options.length])

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
              run: () => run("off"),
            },
            {
              id: "wallpapers.mode",
              title: "Switch wallpaper mode",
              description: "Panels only, or behind everything",
              group: "Wallpapers",
              palette: true,
              run: () => cycle(["panels", "behind"] as const, stored.mode),
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

// Day from 7am, sunset around dawn and dusk, night from 8pm.
function timeAt(date: Date): Time {
  const hour = date.getHours() + date.getMinutes() / 60
  if (hour >= 20 || hour < 6) return "night"
  if (hour < 7 || hour >= 18) return "sunset"
  return "day"
}
