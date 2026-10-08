import { Plugin } from "@opencode/plugin/tui"
import { createEffect } from "solid-js"
import { createEngine, type Mode } from "./src/engine"
import { WALLPAPERS } from "./wallpapers"

export default Plugin.define({
  id: "wallpapers",
  setup(context) {
    const [stored, update] = context.storage.store<{ wallpaper: string; mode: Mode }>("wallpapers", { initial: { wallpaper: "", mode: "panels" } })
    const engine = createEngine(context, { dump: process.env.WALLPAPER_DUMP })
    // Environment overrides for development; they win over the stored choice.
    const pinned = process.env.WALLPAPER
    const pinnedMode = process.env.WALLPAPER_MODE

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
    // Every choice in the picker is a /wallpaper argument, so picking one runs it.
    const pick = async () => {
      const current = (mode: Mode) => (stored.mode === mode ? "current" : undefined)
      const arg = await context.ui.dialog.select({
        title: "Wallpaper",
        current: stored.wallpaper || "off",
        options: [
          ...WALLPAPERS.map((w) => ({ title: w.name, value: w.id, description: w.description, category: "Wallpapers" })),
          { title: "Off", value: "off", category: "Wallpapers" },
          { title: "In panels", value: "panels", description: "Sidebar, prompt, notices", footer: current("panels"), category: "Show it" },
          { title: "Behind everything", value: "behind", description: "Whole background", footer: current("behind"), category: "Show it" },
        ],
      })
      if (arg) run(arg)
    }
    const run = (input?: string) => {
      const arg = input?.trim().toLowerCase()
      if (!arg) return pick()
      if (arg === "off") return off()
      if (arg === "panels" || arg === "behind") return setMode(arg)
      choose(arg)
    }

    const unslot = context.ui.slot({
      append: "app",
      render() {
        createEffect(() => {
          engine.mode = pinnedMode === "behind" || pinnedMode === "panels" ? pinnedMode : stored.mode
          const wallpaper = WALLPAPERS.find((w) => w.id === (pinned ?? stored.wallpaper))
          if (wallpaper) engine.start(wallpaper)
          else engine.stop()
        })
        context.keymap.layer(() => ({
          mode: "global",
          commands: [
            {
              id: "wallpapers.choose",
              title: "Choose wallpaper",
              description: "Animated scene behind the UI. Args: wallpaper id, off, panels, behind",
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
          ],
        }))
        return null
      },
    })

    return () => {
      engine.stop()
      unslot()
    }
  },
})
