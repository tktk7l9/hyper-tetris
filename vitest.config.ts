import { defineConfig } from "vitest/config";

// UI layer: app wiring, keyboard / touch input and the DOM HUD. Tested with
// jsdom (test/ui). Three.js rendering (src/render/renderer.ts, board-view.ts,
// effects.ts) needs WebGL and stays out of scope; main.ts is tested with those
// modules replaced by inert stand-ins.
const UI_GLOBS = [
  "src/boot.ts",
  "src/main.ts",
  "src/input/**/*.ts",
  "src/render/hud.ts",
];

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    environment: "node",
    coverage: {
      provider: "v8",
      include: ["src/game/pause.ts", "src/render/dialog-focus.ts", ...UI_GLOBS],
      reporter: ["text", "json-summary"],
      thresholds: {
        "src/game/pause.ts": { lines: 100, functions: 100, statements: 100, branches: 100 },
        "src/render/dialog-focus.ts": { lines: 100, functions: 100, statements: 100, branches: 100 },
        // Gate two points under the measured value so small refactors do not
        // flip CI; raise it when coverage grows.
        [`{${UI_GLOBS.join(",")}}`]: { lines: 98, functions: 98, statements: 97, branches: 91 },
      },
    },
  },
});
