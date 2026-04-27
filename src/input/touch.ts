import type { DimMode } from "../dims/coords.js";
import { rotationPlanesFor } from "../dims/rotations.js";
import type { GameState } from "../game/state.js";
import type { ControlsHooks } from "./controls.js";

const REPEATABLE = new Set([
  "left", "right", "up", "down", "soft",
  "w+", "w-", "v+", "v-", "u+", "u-",
]);

/** Wire up the on-screen touch buttons. Idempotent; safe to call once at boot. */
export function attachTouchControls(state: GameState, hooks: ControlsHooks = {}) {
  const root = document.getElementById("touch-controls");
  if (!root) return;

  const trigger = (act: string) => {
    hooks.onAnyKey?.();
    if (state.gameOver && act !== "restart") return;
    switch (act) {
      case "left":  state.moveBy([-1, 0, 0]); hooks.onMove?.(); break;
      case "right": state.moveBy([+1, 0, 0]); hooks.onMove?.(); break;
      case "up":    state.moveBy([0, 0, -1]); hooks.onMove?.(); break;
      case "down":  state.moveBy([0, 0, +1]); hooks.onMove?.(); break;
      case "soft":  state.softDrop(); break;
      case "hard":  state.hardDrop(); hooks.onHardDrop?.(); break;
      case "hold":  hooks.onHold?.(state.swapHold()); break;
      case "pause":
        state.paused = !state.paused;
        hooks.onPause?.(state.paused);
        break;
      case "rotate":
      case "rotateAlt": {
        const planes = rotationPlanesFor(state.mode);
        // Primary plane: ZX (key E) — feels like classic Tetris yaw rotation
        const primary = planes.find((p) => p.key === "KeyE") ?? planes[0];
        if (primary) {
          state.rotate(primary.axisA, primary.axisB, act === "rotate" ? 1 : -1);
          hooks.onRotate?.();
        }
        break;
      }
      case "w-": state.shiftSlice(0, -1); break;
      case "w+": state.shiftSlice(0, +1); break;
      case "v-": state.shiftSlice(1, -1); break;
      case "v+": state.shiftSlice(1, +1); break;
      case "u-": state.shiftSlice(2, -1); break;
      case "u+": state.shiftSlice(2, +1); break;
      case "m3":
      case "m4":
      case "m5":
      case "m6": {
        const m = parseInt(act.slice(1), 10) as DimMode;
        if (state.mode !== m) {
          state.changeMode(m);
          hooks.onModeChange?.(m);
        }
        break;
      }
    }
  };

  // Hold-to-repeat for movement / slice nav
  for (const btn of root.querySelectorAll<HTMLButtonElement>("button[data-act]")) {
    const act = btn.dataset.act ?? "";
    let repeatTimer: number | null = null;
    let pressed = false;

    const stop = () => {
      pressed = false;
      if (repeatTimer != null) {
        clearTimeout(repeatTimer);
        repeatTimer = null;
      }
    };

    const start = (e: Event) => {
      e.preventDefault();
      if (pressed) return;
      pressed = true;
      trigger(act);
      if (REPEATABLE.has(act)) {
        const initialDelay = 220;
        const repeatDelay = 70;
        const tick = () => {
          if (!pressed) return;
          trigger(act);
          repeatTimer = window.setTimeout(tick, repeatDelay);
        };
        repeatTimer = window.setTimeout(tick, initialDelay);
      }
    };

    btn.addEventListener("touchstart", start, { passive: false });
    btn.addEventListener("touchend", stop);
    btn.addEventListener("touchcancel", stop);
    btn.addEventListener("pointerdown", start);
    btn.addEventListener("pointerup", stop);
    btn.addEventListener("pointercancel", stop);
    btn.addEventListener("pointerleave", stop);
  }

  /** Refresh button availability based on current dim/mode. */
  const refresh = () => {
    const dim = state.mode;
    for (const btn of root.querySelectorAll<HTMLButtonElement>("#touch-slice .touch-btn")) {
      const axisStr = btn.dataset.axis;
      const axis = axisStr ? parseInt(axisStr, 10) : -1;
      // axis 0 → w (needs dim ≥ 4), 1 → v (≥5), 2 → u (≥6)
      const needed = 4 + axis;
      btn.toggleAttribute("disabled", dim < needed);
    }
    for (const btn of root.querySelectorAll<HTMLButtonElement>("#touch-mode .touch-btn")) {
      const m = parseInt((btn.dataset.act ?? "m3").slice(1), 10);
      btn.classList.toggle("active", state.mode === m);
    }
  };
  refresh();

  return { refresh };
}
