import { rotationPlanesFor } from "../dims/rotations.js";
import type { GameState } from "../game/state.js";
import type { DimMode } from "../dims/coords.js";

export interface ControlsHooks {
  onModeChange?: (mode: DimMode) => void;
  onPause?: (paused: boolean) => void;
  onHardDrop?: () => void;
  onLineClear?: () => void;
  onHold?: (success: boolean) => void;
  onHelpToggle?: () => void;
  onRestart?: () => void;
  onMove?: () => void;
  onRotate?: () => void;
  onAudioToggle?: () => void;
  onAutoToggle?: () => void;
  onAnyKey?: () => void;
}

export function attachControls(state: GameState, hooks: ControlsHooks = {}) {
  const handler = (ev: KeyboardEvent) => {
    if (ev.repeat && (ev.code === "Space" || ev.code === "Tab")) return;
    // R restarts even when game-over; H toggles help anytime
    if (state.gameOver && ev.code !== "KeyR" && ev.code !== "KeyH" && ev.code !== "Slash") return;

    hooks.onAnyKey?.();
    let consumed = true;
    switch (ev.code) {
      case "ArrowLeft":  state.moveBy([-1, 0, 0]); hooks.onMove?.(); break;
      case "ArrowRight": state.moveBy([+1, 0, 0]); hooks.onMove?.(); break;
      case "ArrowUp":    state.moveBy([0, 0, -1]); hooks.onMove?.(); break;
      case "ArrowDown":  state.moveBy([0, 0, +1]); hooks.onMove?.(); break;
      case "ShiftLeft":
      case "ShiftRight":
        state.softDrop();
        break;
      case "Space":
        state.hardDrop();
        hooks.onHardDrop?.();
        break;
      case "Tab":
        hooks.onHold?.(state.swapHold());
        break;
      case "KeyP":
        state.paused = !state.paused;
        hooks.onPause?.(state.paused);
        break;
      case "KeyH":
      case "Slash":
        hooks.onHelpToggle?.();
        break;
      case "KeyR":
        hooks.onRestart?.();
        break;
      case "KeyM":
        hooks.onAudioToggle?.();
        break;
      case "KeyO":
        hooks.onAutoToggle?.();
        break;
      case "Digit3": switchMode(state, hooks, 3); break;
      case "Digit4": switchMode(state, hooks, 4); break;
      case "Digit5": switchMode(state, hooks, 5); break;
      case "Digit6": switchMode(state, hooks, 6); break;
      case "BracketLeft":  state.shiftSlice(0, -1); break;
      case "BracketRight": state.shiftSlice(0, +1); break;
      case "Comma":  state.shiftSlice(1, -1); break;
      case "Period": state.shiftSlice(1, +1); break;
      case "Minus":  state.shiftSlice(2, -1); break;
      case "Equal":  state.shiftSlice(2, +1); break;
      default: {
        // rotation keys depend on mode
        const planes = rotationPlanesFor(state.mode);
        const dir = ev.shiftKey ? -1 : 1;
        const found = planes.find((p) => p.key === ev.code);
        if (found) {
          state.rotate(found.axisA, found.axisB, dir);
          hooks.onRotate?.();
        } else {
          consumed = false;
        }
      }
    }
    if (consumed) ev.preventDefault();
  };
  window.addEventListener("keydown", handler);
  return () => window.removeEventListener("keydown", handler);
}

function switchMode(state: GameState, hooks: ControlsHooks, mode: DimMode) {
  if (state.mode === mode) return;
  state.changeMode(mode);
  hooks.onModeChange?.(mode);
}
