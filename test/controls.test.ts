import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { attachControls, type ControlsHooks } from "../src/input/controls.js";
import { GameState } from "../src/game/state.js";

function press(code: string) {
  const ev = Object.assign(new Event("keydown", { cancelable: true }), {
    code,
    repeat: false,
    shiftKey: false,
  });
  window.dispatchEvent(ev);
  return ev;
}

describe("keyboard controls", () => {
  let detach: () => void;
  let hooks: Required<Pick<ControlsHooks, "onEscape" | "onUndo" | "onPauseToggle">>;
  let state: GameState;

  beforeEach(() => {
    (globalThis as { window?: EventTarget }).window = new EventTarget();
    state = new GameState(3);
    hooks = { onEscape: vi.fn(), onUndo: vi.fn(), onPauseToggle: vi.fn() };
    detach = attachControls(state, hooks);
  });

  afterEach(() => {
    detach();
  });

  it("routes Escape to onEscape", () => {
    const ev = press("Escape");
    expect(hooks.onEscape).toHaveBeenCalledOnce();
    expect(ev.defaultPrevented).toBe(true);
  });

  it("routes U to onUndo", () => {
    press("KeyU");
    expect(hooks.onUndo).toHaveBeenCalledOnce();
  });

  it("routes P to onPauseToggle instead of flipping state directly", () => {
    press("KeyP");
    expect(hooks.onPauseToggle).toHaveBeenCalledOnce();
    expect(state.paused).toBe(false);
  });

  it("still honours Escape and U after game over", () => {
    state.gameOver = true;
    press("Escape");
    press("KeyU");
    press("KeyP");
    expect(hooks.onEscape).toHaveBeenCalledOnce();
    expect(hooks.onUndo).toHaveBeenCalledOnce();
    expect(hooks.onPauseToggle).not.toHaveBeenCalled();
  });

  it("swallows Space after game over so it cannot press the focused PLAY AGAIN button", () => {
    state.gameOver = true;
    const cells = Array.from(state.board.cells);
    const ev = press("Space");
    expect(ev.defaultPrevented).toBe(true);
    expect(Array.from(state.board.cells)).toEqual(cells);
  });

  it("leaves other keys alone after game over (Enter still activates the focused button)", () => {
    state.gameOver = true;
    expect(press("Enter").defaultPrevented).toBe(false);
    expect(press("ArrowLeft").defaultPrevented).toBe(false);
  });
});
