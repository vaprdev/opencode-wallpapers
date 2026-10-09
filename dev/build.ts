// Compiles the plugin to dist/tui.js for the npm package: bun dev/build.ts
// OpenTUI's Solid JSX transform skips files under node_modules, so an installed package must ship compiled JSX.
// A git clone loads tui.tsx directly and never needs this.
import solidPlugin from "@opentui/solid/bun-plugin"

const result = await Bun.build({
  entrypoints: ["tui.tsx"],
  outdir: "dist",
  target: "bun",
  // OpenCode provides @opencode/plugin, @opentui/* and solid-js at runtime.
  packages: "external",
  plugins: [solidPlugin],
})
if (!result.success) throw new AggregateError(result.logs, "Build failed")
for (const output of result.outputs) console.log(`${output.path} ${(output.size / 1024).toFixed(1)} kB`)
