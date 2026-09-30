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
  let hooks: Required<Pick<ControlsHooks, "onEscape" | "onUndo" | "onPauseToggle" | "onHold">>;
  let state: GameState;

  beforeEach(() => {
    (globalThis as { window?: EventTarget }).window = new EventTarget();
    state = new GameState(3);
    hooks = { onEscape: vi.fn(), onUndo: vi.fn(), onPauseToggle: vi.fn(), onHold: vi.fn() };
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

  it("leaves Tab to the browser while paused so focus can move between dialog buttons", () => {
    state.paused = true;
    const ev = press("Tab");
    expect(ev.defaultPrevented).toBe(false);
    expect(hooks.onHold).not.toHaveBeenCalled();
  });

  it("consumes Tab as hold while playing", () => {
    const ev = press("Tab");
    expect(ev.defaultPrevented).toBe(true);
    expect(hooks.onHold).toHaveBeenCalledOnce();
  });

  it("leaves other keys alone after game over (Enter still activates the focused button)", () => {
    state.gameOver = true;
    expect(press("Enter").defaultPrevented).toBe(false);
    expect(press("ArrowLeft").defaultPrevented).toBe(false);
  });
});

describe("keyboard controls — gameplay keys", () => {
  let detach: () => void;
  let hooks: Required<
    Pick<
      ControlsHooks,
      | "onAnyKey" | "onMove" | "onRotate" | "onHardDrop" | "onHold" | "onHelpToggle"
      | "onRestart" | "onAudioToggle" | "onAutoToggle" | "onBeforeReset" | "onModeChange"
    >
  >;
  let state: GameState;

  function pressWith(code: string, init: { shiftKey?: boolean; repeat?: boolean } = {}) {
    const ev = Object.assign(new Event("keydown", { cancelable: true }), {
      code,
      repeat: init.repeat ?? false,
      shiftKey: init.shiftKey ?? false,
    });
    window.dispatchEvent(ev);
    return ev;
  }

  beforeEach(() => {
    (globalThis as { window?: EventTarget }).window = new EventTarget();
    state = new GameState(3);
    hooks = {
      onAnyKey: vi.fn(),
      onMove: vi.fn(),
      onRotate: vi.fn(),
      onHardDrop: vi.fn(),
      onHold: vi.fn(),
      onHelpToggle: vi.fn(),
      onRestart: vi.fn(),
      onAudioToggle: vi.fn(),
      onAutoToggle: vi.fn(),
      onBeforeReset: vi.fn(),
      onModeChange: vi.fn(),
    };
    detach = attachControls(state, hooks);
  });

  afterEach(() => {
    detach();
  });

  it("moves along x with the left/right arrows and z with up/down", () => {
    const [x0, , z0] = state.current!.origin;
    pressWith("ArrowLeft");
    expect(state.current!.origin[0]).toBe(x0 - 1);
    pressWith("ArrowRight");
    expect(state.current!.origin[0]).toBe(x0);
    pressWith("ArrowUp");
    expect(state.current!.origin[2]).toBe(z0 - 1);
    pressWith("ArrowDown");
    expect(state.current!.origin[2]).toBe(z0);
    expect(hooks.onMove).toHaveBeenCalledTimes(4);
    expect(hooks.onAnyKey).toHaveBeenCalledTimes(4);
  });

  it("soft-drops with either Shift key", () => {
    const y0 = state.current!.origin[1];
    pressWith("ShiftLeft");
    pressWith("ShiftRight");
    expect(state.current!.origin[1]).toBe(y0 - 2);
    expect(state.stats.score).toBe(2);
  });

  it("hard-drops with Space and ignores key repeat for Space and Tab", () => {
    expect(pressWith("Space", { repeat: true }).defaultPrevented).toBe(false);
    expect(pressWith("Tab", { repeat: true }).defaultPrevented).toBe(false);
    expect(hooks.onHardDrop).not.toHaveBeenCalled();
    const ev = pressWith("Space");
    expect(ev.defaultPrevented).toBe(true);
    expect(hooks.onHardDrop).toHaveBeenCalledOnce();
    expect(state.board.cells.some((c) => c !== 0)).toBe(true);
  });

  it("holds with Tab and reports a second attempt as refused", () => {
    pressWith("Tab");
    expect(hooks.onHold).toHaveBeenLastCalledWith(true);
    pressWith("Tab");
    expect(hooks.onHold).toHaveBeenLastCalledWith(false);
  });

  it("rotates with Q/W/E and reverses with Shift", () => {
    const rotate = vi.spyOn(state, "rotate");
    pressWith("KeyQ");
    expect(rotate).toHaveBeenLastCalledWith(0, 1, 1);
    pressWith("KeyW", { shiftKey: true });
    expect(rotate).toHaveBeenLastCalledWith(1, 2, -1);
    pressWith("KeyE");
    expect(rotate).toHaveBeenLastCalledWith(2, 0, 1);
    expect(hooks.onRotate).toHaveBeenCalledTimes(3);
  });

  it("ignores hyper rotation keys in 3D but accepts them in 4D", () => {
    const rotate = vi.spyOn(state, "rotate");
    expect(pressWith("KeyA").defaultPrevented).toBe(false);
    expect(rotate).not.toHaveBeenCalled();
    pressWith("Digit4");
    expect(pressWith("KeyA").defaultPrevented).toBe(true);
    expect(rotate).toHaveBeenLastCalledWith(0, 3, 1);
  });

  it("leaves unrelated keys to the browser", () => {
    expect(pressWith("KeyF").defaultPrevented).toBe(false);
    expect(pressWith("F5").defaultPrevented).toBe(false);
    expect(hooks.onAnyKey).toHaveBeenCalledTimes(2);
  });

  it("switches dimension with 3-6, offering undo first, and ignores the current one", () => {
    pressWith("Digit3");
    expect(hooks.onBeforeReset).not.toHaveBeenCalled();
    pressWith("Digit5");
    expect(hooks.onBeforeReset).toHaveBeenCalledOnce();
    expect(hooks.onModeChange).toHaveBeenCalledWith(5);
    expect(state.mode).toBe(5);
    pressWith("Digit6");
    expect(state.mode).toBe(6);
    pressWith("Digit4");
    expect(state.mode).toBe(4);
    expect(hooks.onModeChange).toHaveBeenCalledTimes(3);
  });

  it("walks the w/v/u slices with brackets, comma/period and minus/equal", () => {
    pressWith("Digit6");
    pressWith("BracketRight");
    pressWith("Period");
    pressWith("Period");
    pressWith("Minus");
    expect(state.slice.values).toEqual([1, 2, 2]);
    pressWith("BracketLeft");
    pressWith("Comma");
    pressWith("Equal");
    expect(state.slice.values).toEqual([0, 1, 0]);
  });

  it("routes system keys to their hooks", () => {
    pressWith("KeyH");
    pressWith("Slash");
    expect(hooks.onHelpToggle).toHaveBeenCalledTimes(2);
    pressWith("KeyR");
    expect(hooks.onRestart).toHaveBeenCalledOnce();
    pressWith("KeyM");
    expect(hooks.onAudioToggle).toHaveBeenCalledOnce();
    pressWith("KeyO");
    expect(hooks.onAutoToggle).toHaveBeenCalledOnce();
  });

  it("works without any hooks attached", () => {
    detach();
    detach = attachControls(state);
    expect(() => {
      pressWith("ArrowLeft");
      pressWith("Space");
      pressWith("Tab");
      pressWith("KeyQ");
      pressWith("KeyP");
      pressWith("Digit4");
    }).not.toThrow();
    expect(state.mode).toBe(4);
  });

  it("stops listening after detach", () => {
    detach();
    pressWith("KeyR");
    expect(hooks.onRestart).not.toHaveBeenCalled();
    detach = attachControls(state, hooks);
  });
});
