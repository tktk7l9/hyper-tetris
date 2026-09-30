// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getByRole, getByText, queryByText } from "@testing-library/dom";
import userEvent from "@testing-library/user-event";
import { Hud } from "../../src/render/hud.js";
import { GameState } from "../../src/game/state.js";
import { piecesFor } from "../../src/dims/pieces.js";
import { byId, isShown, mountApp, type CanvasStub } from "./dom.js";

describe("Hud", () => {
  let hud: Hud;
  let canvases: Map<string, CanvasStub>;

  beforeEach(() => {
    vi.useFakeTimers();
    ({ canvases } = mountApp());
    hud = new Hud();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("throws a readable error when the markup is missing an element", () => {
    byId("stat-score").remove();
    expect(() => new Hud()).toThrow("#stat-score not found");
  });

  it("throws when a canvas cannot provide a 2D context", () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    expect(() => new Hud()).toThrow("2d context unavailable");
  });

  describe("stats and labels", () => {
    it("shows score, level, lines, combo and mode from the state", () => {
      const state = new GameState(3);
      state.stats = { score: 1234, level: 3, lines: 21, combo: 2 };
      hud.update(state);
      expect(byId("stat-score").textContent).toBe("1234");
      expect(byId("stat-level").textContent).toBe("3");
      expect(byId("stat-lines").textContent).toBe("21");
      expect(byId("stat-combo").textContent).toBe("2");
      expect(byId("stat-mode").textContent).toBe("3D");
      expect(byId("stat-slice").textContent).toBe("single space");
    });

    it("hides the hyper map in 3D and explains why on the canvas", () => {
      hud.update(new GameState(3));
      expect(byId("panel-mini").hidden).toBe(true);
      expect(canvases.get("minimap")?.texts()).toContain("3D — no extra slices");
    });

    it("lists every slice axis with its range in higher dimensions", () => {
      const state = new GameState(5);
      state.setSlice(0, 2);
      state.setSlice(1, 1);
      hud.update(state);
      expect(byId("stat-mode").textContent).toBe("5D");
      expect(byId("stat-slice").textContent).toBe("w=2/2  v=1/2");
      expect(byId("panel-mini").hidden).toBe(false);
    });

    it("draws the w/v/u axis labels on the hyper map only when the axis exists", () => {
      hud.update(new GameState(4));
      expect(canvases.get("minimap")?.texts()).toEqual(["w →"]);
      canvases.get("minimap")?.fillText.mockClear();
      hud.update(new GameState(6));
      expect(canvases.get("minimap")?.texts()).toEqual(["w →", "v →", "u"]);
    });

    it("marks the hyper cells of the active piece and the locked blocks on the map", () => {
      const state = new GameState(4);
      state.hardDrop();
      const mini = canvases.get("minimap")!;
      mini.arc.mockClear();
      hud.update(state);
      // one dot per (w, v) cell the falling piece occupies, plus a yellow frame
      expect(mini.arc).toHaveBeenCalled();
      expect(mini.strokeRect).toHaveBeenCalledTimes(1);
    });

    it("shows the next piece label and tags hyper pieces on the preview", () => {
      const state = new GameState(4);
      hud.update(state);
      expect(byId("next-label").textContent).toBe(state.next.label);
      expect(canvases.get("next-canvas")?.texts()).toContain(state.next.label);
    });

    it("keeps the hold panel empty until a piece is stashed, then shows it as locked", () => {
      const state = new GameState(3);
      hud.update(state);
      expect(byId("hold-label").textContent).toBe("— empty —");
      expect(byId("hold-label").style.opacity).toBe("0.5");

      state.swapHold();
      hud.update(state);
      expect(byId("hold-label").textContent).toBe(`${state.hold!.label} · LOCKED`);
      expect(byId("hold-label").style.opacity).toBe("0.4");

      state.holdLocked = false;
      hud.update(state);
      expect(byId("hold-label").textContent).toBe(state.hold!.label);
      expect(byId("hold-label").style.opacity).toBe("0.85");
    });

    it("draws nothing for a preview with no blocks", () => {
      const state = new GameState(3);
      const empty = { ...piecesFor(3)[0], blocks: [] };
      state.next = empty;
      hud.update(state);
      expect(canvases.get("next-canvas")?.clearRect).toHaveBeenCalled();
      expect(canvases.get("next-canvas")?.fill).not.toHaveBeenCalled();
    });
  });

  describe("toast", () => {
    it("shows the text and fades it after the given time", () => {
      hud.showToast("HOLD", 600);
      const toast = byId("toast");
      expect(toast.textContent).toBe("HOLD");
      expect(isShown(toast)).toBe(true);
      vi.advanceTimersByTime(599);
      expect(isShown(toast)).toBe(true);
      vi.advanceTimersByTime(1);
      expect(isShown(toast)).toBe(false);
    });

    it("restarts the timer when a new toast replaces the old one", () => {
      hud.showToast("A", 1000);
      vi.advanceTimersByTime(800);
      hud.showToast("B");
      vi.advanceTimersByTime(300);
      expect(byId("toast").textContent).toBe("B");
      expect(isShown(byId("toast"))).toBe(true);
      vi.advanceTimersByTime(800);
      expect(isShown(byId("toast"))).toBe(false);
    });
  });

  describe("undo bar", () => {
    it("offers undo with the given text and expires it", () => {
      const onExpire = vi.fn();
      hud.showUndo("Game restarted", 6000, onExpire);
      const bar = byId("undo-bar");
      expect(isShown(bar)).toBe(true);
      expect(getByText(bar, "Game restarted")).toBeTruthy();
      vi.advanceTimersByTime(6000);
      expect(isShown(bar)).toBe(false);
      expect(onExpire).toHaveBeenCalledOnce();
    });

    it("does not fire the old expiry when hidden early or replaced", () => {
      const first = vi.fn();
      const second = vi.fn();
      hud.showUndo("first", 1000, first);
      hud.hideUndo();
      vi.advanceTimersByTime(1000);
      expect(first).not.toHaveBeenCalled();

      hud.showUndo("again", 1000, first);
      hud.showUndo("replaced", 1000, second);
      expect(byId("undo-text").textContent).toBe("replaced");
      vi.advanceTimersByTime(1000);
      expect(first).not.toHaveBeenCalled();
      expect(second).toHaveBeenCalledOnce();
    });
  });

  describe("overlays", () => {
    it("shows game over once with the final score and focuses PLAY AGAIN", () => {
      hud.setGameOver(true, 4200);
      const dialog = byId("gameover");
      expect(isShown(dialog)).toBe(true);
      expect(byId("final-score").textContent).toBe("final score: 4200");
      expect(document.activeElement).toBe(byId("restart-btn"));

      // Re-rendering every frame must not steal focus back from another button.
      byId("help-fab").focus();
      hud.setGameOver(true, 4300);
      expect(byId("final-score").textContent).toBe("final score: 4300");
      expect(document.activeElement).toBe(byId("help-fab"));

      hud.setGameOver(false);
      expect(isShown(dialog)).toBe(false);
    });

    it("shows the pause dialog when paused but not during game over or help", () => {
      const state = new GameState(3);
      state.paused = true;
      hud.update(state);
      expect(isShown(byId("pause-overlay"))).toBe(true);
      expect(document.activeElement).toBe(byId("pause-resume"));

      hud.update(state, true);
      expect(isShown(byId("pause-overlay"))).toBe(false);

      state.gameOver = true;
      hud.update(state);
      expect(isShown(byId("pause-overlay"))).toBe(false);
    });

    it("focuses CLOSE when help opens and releases it when help closes", () => {
      hud.setHelp(true);
      expect(isShown(byId("help-overlay"))).toBe(true);
      expect(document.activeElement).toBe(byId("help-close"));
      hud.setHelp(true);
      hud.setHelp(false);
      expect(isShown(byId("help-overlay"))).toBe(false);
      expect(document.activeElement).not.toBe(byId("help-close"));
      hud.setHelp(false);
    });
  });

  describe("status pills", () => {
    it("reflects audio / auto flags in text, class and aria-pressed", () => {
      hud.setStatus({ audio: false, auto: true });
      const audioBtn = byId("status-audio");
      const autoBtn = byId("status-auto");
      expect(audioBtn.textContent).toBe("♪ AUDIO OFF");
      expect(audioBtn.classList.contains("off")).toBe(true);
      expect(audioBtn.getAttribute("aria-pressed")).toBe("false");
      expect(autoBtn.textContent).toBe("⚙ AUTO ON");
      expect(autoBtn.classList.contains("on")).toBe(true);
      expect(autoBtn.getAttribute("aria-pressed")).toBe("true");
    });
  });

  describe("bind", () => {
    it("routes every HUD button to its handler", async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      const handlers = {
        onHelpToggle: vi.fn(),
        onHelpClose: vi.fn(),
        onResume: vi.fn(),
        onRestart: vi.fn(),
        onUndo: vi.fn(),
        onAudioToggle: vi.fn(),
        onAutoToggle: vi.fn(),
      };
      hud.bind(handlers);
      const hudRoot = byId("hud");
      await user.click(getByRole(hudRoot, "button", { name: "? HELP" }));
      await user.click(byId("pause-help"));
      expect(handlers.onHelpToggle).toHaveBeenCalledTimes(2);
      await user.click(byId("help-close"));
      expect(handlers.onHelpClose).toHaveBeenCalledOnce();
      await user.click(getByText(hudRoot, "RESUME"));
      expect(handlers.onResume).toHaveBeenCalledOnce();
      await user.click(byId("restart-btn"));
      await user.click(byId("pause-restart"));
      expect(handlers.onRestart).toHaveBeenCalledTimes(2);
      await user.click(byId("undo-btn"));
      expect(handlers.onUndo).toHaveBeenCalledOnce();
      await user.click(byId("status-audio"));
      expect(handlers.onAudioToggle).toHaveBeenCalledOnce();
      await user.click(byId("status-auto"));
      expect(handlers.onAutoToggle).toHaveBeenCalledOnce();
      expect(queryByText(hudRoot, "nonexistent")).toBeNull();
    });

    it("drops focus after a pointer click so Space cannot re-press the button", async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      const btn = byId("help-fab");
      await user.click(btn);
      expect(document.activeElement).not.toBe(btn);
    });

    it("keeps focus after a keyboard activation (detail = 0)", () => {
      const btn = byId("help-fab");
      btn.focus();
      btn.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 0 }));
      expect(document.activeElement).toBe(btn);
    });
  });
});
