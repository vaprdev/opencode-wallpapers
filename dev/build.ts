// Compiles the plugin to dist/tui.js and the wallpaper API to dist/api.js with its type declarations, for the npm
// package: bun dev/build.ts
// OpenTUI's Solid JSX transform skips files under node_modules, so an installed package must ship compiled JSX.
// A git clone loads tui.tsx directly and never needs this.
import { rmSync } from "node:fs"
import solidPlugin from "@opentui/solid/bun-plugin"

rmSync("dist", { recursive: true, force: true })
const result = await Bun.build({
  entrypoints: ["tui.tsx", "src/api.ts"],
  outdir: "dist",
  naming: "[name].[ext]",
  target: "bun",
  // OpenCode provides @opencode/plugin, @opentui/* and solid-js at runtime.
  packages: "external",
  plugins: [solidPlugin],
})
if (!result.success) throw new AggregateError(result.logs, "Build failed")
for (const output of result.outputs) console.log(`${output.path} ${(output.size / 1024).toFixed(1)} kB`)
// Declarations for "./api", so wallpaper packages typecheck against the published package.
const tsc = Bun.spawnSync(
  [process.execPath, "x", "tsc", "src/api.ts", "--declaration", "--emitDeclarationOnly", "--rootDir", "src", "--outDir", "dist", "--target", "ESNext", "--module", "ESNext", "--moduleResolution", "bundler", "--skipLibCheck", "--types", "bun"],
  { stdout: "inherit", stderr: "inherit" },
)
if (tsc.exitCode) throw new Error("tsc failed to emit dist/api.d.ts")
// Relative imports get a .js extension, which Node16 and NodeNext module resolution require.
for (const file of new Bun.Glob("dist/*.d.ts").scanSync()) await Bun.write(file, (await Bun.file(file).text()).replace(/(from "\.\/[\w-]+)"/g, '$1.js"'))
console.log("dist/api.d.ts")
