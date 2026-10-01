// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getByLabelText, getByRole, getByText } from "@testing-library/dom";
import { attachTouchControls } from "../../src/input/touch.js";
import { GameState } from "../../src/game/state.js";
import type { ControlsHooks } from "../../src/input/controls.js";
import { byId, mountApp } from "./dom.js";

function hooks(): Required<
  Pick<
    ControlsHooks,
    | "onAnyKey" | "onMove" | "onHardDrop" | "onHold" | "onPauseToggle"
    | "onRotate" | "onBeforeReset" | "onModeChange"
  >
> {
  return {
    onAnyKey: vi.fn(),
    onMove: vi.fn(),
    onHardDrop: vi.fn(),
    onHold: vi.fn(),
    onPauseToggle: vi.fn(),
    onRotate: vi.fn(),
    onBeforeReset: vi.fn(),
    onModeChange: vi.fn(),
  };
}

function tap(btn: HTMLElement) {
  btn.dispatchEvent(new Event("pointerdown", { bubbles: true, cancelable: true }));
  btn.dispatchEvent(new Event("pointerup", { bubbles: true }));
}

function holdDown(btn: HTMLElement) {
  btn.dispatchEvent(new Event("pointerdown", { bubbles: true, cancelable: true }));
}

describe("touch controls", () => {
  let state: GameState;
  let h: ReturnType<typeof hooks>;
  let root: HTMLElement;

  beforeEach(() => {
    vi.useFakeTimers();
    mountApp();
    state = new GameState(3);
    h = hooks();
    root = byId("touch-controls");
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("returns nothing when the touch markup is absent", () => {
    root.remove();
    expect(attachTouchControls(state, h)).toBeUndefined();
  });

  it("moves the piece with the d-pad and reports the move", () => {
    attachTouchControls(state, h);
    const x0 = state.current!.origin[0];
    tap(getByLabelText(root, "Move left"));
    expect(state.current!.origin[0]).toBe(x0 - 1);
    tap(getByLabelText(root, "Move right"));
    expect(state.current!.origin[0]).toBe(x0);
    const z0 = state.current!.origin[2];
    tap(getByLabelText(root, "Move back"));
    expect(state.current!.origin[2]).toBe(z0 - 1);
    tap(getByLabelText(root, "Move forward"));
    expect(state.current!.origin[2]).toBe(z0);
    expect(h.onMove).toHaveBeenCalledTimes(4);
    expect(h.onAnyKey).toHaveBeenCalledTimes(4);
  });

  it("soft-drops one row and awards a point", () => {
    attachTouchControls(state, h);
    const y0 = state.current!.origin[1];
    tap(getByLabelText(root, "Soft drop"));
    expect(state.current!.origin[1]).toBe(y0 - 1);
    expect(state.stats.score).toBe(1);
  });

  it("hard-drops, locks the piece and reports it", () => {
    attachTouchControls(state, h);
    tap(getByText(root, "HARD DROP"));
    expect(h.onHardDrop).toHaveBeenCalledOnce();
    expect(state.board.cells.some((c) => c !== 0)).toBe(true);
  });

  it("holds once per piece and reports whether it worked", () => {
    attachTouchControls(state, h);
    const hold = getByText(root, "HOLD");
    tap(hold);
    expect(h.onHold).toHaveBeenLastCalledWith(true);
    tap(hold);
    expect(h.onHold).toHaveBeenLastCalledWith(false);
  });

  it("asks the app to toggle pause instead of flipping state itself", () => {
    attachTouchControls(state, h);
    tap(getByLabelText(root, "Pause"));
    expect(h.onPauseToggle).toHaveBeenCalledOnce();
    expect(state.paused).toBe(false);
  });

  it("rotates in the ZX plane both ways", () => {
    attachTouchControls(state, h);
    const rotate = vi.spyOn(state, "rotate");
    tap(getByLabelText(root, "Rotate clockwise"));
    expect(rotate).toHaveBeenLastCalledWith(2, 0, 1);
    tap(getByLabelText(root, "Rotate counter-clockwise"));
    expect(rotate).toHaveBeenLastCalledWith(2, 0, -1);
    expect(h.onRotate).toHaveBeenCalledTimes(2);
  });

  it("walks slices with the w/v/u buttons in 6D", () => {
    state = new GameState(6);
    attachTouchControls(state, h);
    tap(getByText(root, "w+"));
    tap(getByText(root, "v+"));
    tap(getByText(root, "v+"));
    tap(getByText(root, "u−"));
    expect(state.slice.values).toEqual([1, 2, 2]);
    tap(getByText(root, "w−"));
    tap(getByText(root, "v−"));
    tap(getByText(root, "u+"));
    expect(state.slice.values).toEqual([0, 1, 0]);
  });

  it("switches dimension, offering undo first, and ignores the current mode", () => {
    const touch = attachTouchControls(state, h)!;
    tap(getByText(root, "3D"));
    expect(h.onBeforeReset).not.toHaveBeenCalled();
    tap(getByText(root, "5D"));
    expect(h.onBeforeReset).toHaveBeenCalledOnce();
    expect(h.onModeChange).toHaveBeenCalledWith(5);
    expect(state.mode).toBe(5);

    touch.refresh();
    const group = getByRole(root, "group", { name: /Dimension/ });
    expect(getByText(group, "5D").getAttribute("aria-pressed")).toBe("true");
    expect(getByText(group, "3D").getAttribute("aria-pressed")).toBe("false");
    expect(getByText(group, "5D").classList.contains("active")).toBe(true);
  });

  it("shows only the slice buttons the current dimension can use", () => {
    const touch = attachTouchControls(state, h)!;
    const visible = () =>
      Array.from(root.querySelectorAll<HTMLButtonElement>("#touch-slice .touch-btn"))
        .filter((b) => !b.hidden)
        .map((b) => b.textContent);
    expect(visible()).toEqual([]);
    state.changeMode(4);
    touch.refresh();
    expect(visible()).toEqual(["w+", "w−"]);
    state.changeMode(6);
    touch.refresh();
    expect(visible()).toEqual(["w+", "w−", "v+", "v−", "u+", "u−"]);
  });

  it("repeats movement while the button is held and stops on release", () => {
    attachTouchControls(state, h);
    const left = getByLabelText(root, "Move left");
    const x0 = state.current!.origin[0];
    holdDown(left);
    expect(state.current!.origin[0]).toBe(x0 - 1);
    vi.advanceTimersByTime(219);
    expect(state.current!.origin[0]).toBe(x0 - 1);
    vi.advanceTimersByTime(1);
    expect(state.current!.origin[0]).toBe(x0 - 2);
    vi.advanceTimersByTime(70);
    expect(state.current!.origin[0]).toBe(x0 - 3);
    // a second pointerdown while held is ignored
    holdDown(left);
    expect(state.current!.origin[0]).toBe(x0 - 3);
    left.dispatchEvent(new Event("pointerleave"));
    vi.advanceTimersByTime(1000);
    expect(state.current!.origin[0]).toBe(x0 - 3);
  });

  it("does not repeat one-shot actions like hard drop", () => {
    attachTouchControls(state, h);
    holdDown(getByText(root, "HARD DROP"));
    vi.advanceTimersByTime(2000);
    expect(h.onHardDrop).toHaveBeenCalledOnce();
  });

  it("supports raw touch events and prevents the synthetic click", () => {
    attachTouchControls(state, h);
    const left = getByLabelText(root, "Move left");
    const x0 = state.current!.origin[0];
    const ev = new Event("touchstart", { bubbles: true, cancelable: true });
    left.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
    expect(state.current!.origin[0]).toBe(x0 - 1);
    left.dispatchEvent(new Event("touchcancel"));
    vi.advanceTimersByTime(1000);
    expect(state.current!.origin[0]).toBe(x0 - 1);
  });

  it("ignores every button after game over", () => {
    attachTouchControls(state, h);
    state.gameOver = true;
    tap(getByLabelText(root, "Move left"));
    tap(getByLabelText(root, "Pause"));
    tap(getByText(root, "4D"));
    expect(h.onMove).not.toHaveBeenCalled();
    expect(h.onPauseToggle).not.toHaveBeenCalled();
    expect(state.mode).toBe(3);
    expect(h.onAnyKey).toHaveBeenCalledTimes(3);
  });
});
