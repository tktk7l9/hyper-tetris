// @vitest-environment jsdom
/**
 * Integration tests for the app wiring in src/main.ts: keyboard / HUD button
 * input flows through to visible HUD text, overlays and status pills. The
 * WebGL scene (renderer, board view, effects, orbit camera) is replaced with
 * inert stand-ins since jsdom cannot render it; the Web Audio engine is
 * replaced with a spy so sound cues can be asserted.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getByRole, getByText } from "@testing-library/dom";
import userEvent from "@testing-library/user-event";
import type { GameState } from "../../src/game/state.js";
import type { AutoPilot } from "../../src/ai/autopilot.js";
import { byId, isShown, mountApp, pressKey } from "./dom.js";

const audioSpies = {
  init: vi.fn(),
  resume: vi.fn(),
  playSfx: vi.fn(),
  setBgmEnabled: vi.fn(),
  setSfxEnabled: vi.fn(),
};
const fxSpies = { spawnBurst: vi.fn(), update: vi.fn() };
const viewSpies = { resizeForBoard: vi.fn(), update: vi.fn() };
const ctxSpies = { render: vi.fn(), cameraSet: vi.fn() };

vi.mock("../../src/audio/audio.js", () => ({
  AudioEngine: class {
    bgmEnabled = true;
    sfxEnabled = true;
    init = audioSpies.init;
    resume = audioSpies.resume;
    playSfx = audioSpies.playSfx;
    setBgmEnabled = (on: boolean) => {
      this.bgmEnabled = on;
      audioSpies.setBgmEnabled(on);
    };
    setSfxEnabled = (on: boolean) => {
      this.sfxEnabled = on;
      audioSpies.setSfxEnabled(on);
    };
  },
}));

vi.mock("../../src/render/renderer.js", () => ({
  createRenderContext: () => ({
    camera: { position: { set: ctxSpies.cameraSet } },
    renderer: { domElement: document.createElement("canvas") },
    scene: { add: vi.fn() },
    background: { update: vi.fn() },
    render: ctxSpies.render,
  }),
}));

vi.mock("../../src/render/board-view.js", () => ({
  BoardView: class {
    group = {};
    resizeForBoard = viewSpies.resizeForBoard;
    update = viewSpies.update;
  },
}));

vi.mock("../../src/render/effects.js", () => ({
  EffectsLayer: class {
    group = {};
    spawnBurst = fxSpies.spawnBurst;
    update = fxSpies.update;
  },
}));

vi.mock("three/examples/jsm/controls/OrbitControls.js", () => ({
  OrbitControls: class {
    target = { set: vi.fn(), y: 0 };
    enableDamping = false;
    dampingFactor = 0;
    minDistance = 0;
    maxDistance = 0;
    maxPolarAngle = 0;
    update = vi.fn();
  },
}));

interface Debug {
  state: GameState;
  autopilot: AutoPilot;
}

let frameCb: ((t: number) => void) | null = null;
let now = 0;

// main.ts has no teardown, so every window / document listener it attaches is
// recorded here and removed after each test to keep instances from stacking.
type Attached = { target: EventTarget; type: string; fn: EventListenerOrEventListenerObject | null };
const attached: Attached[] = [];

function trackListeners(target: EventTarget) {
  const original = target.addEventListener.bind(target);
  vi.spyOn(target, "addEventListener").mockImplementation((type, fn, options) => {
    attached.push({ target, type, fn });
    original(type, fn, options);
  });
}

function detachAll() {
  for (const { target, type, fn } of attached.splice(0)) target.removeEventListener(type, fn);
}

function frame(dt = 16) {
  now += dt;
  const cb = frameCb;
  frameCb = null;
  cb?.(now);
}

async function launch(): Promise<Debug> {
  mountApp();
  frameCb = null;
  trackListeners(window);
  trackListeners(document);
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
    frameCb = cb;
    return 1;
  });
  vi.resetModules();
  await import("../../src/main.js");
  return (window as unknown as { __hyperTetris: Debug }).__hyperTetris;
}

function toast() {
  return byId("toast").textContent;
}

describe("main wiring", () => {
  let user: ReturnType<typeof userEvent.setup>;

  beforeEach(() => {
    vi.useFakeTimers();
    now = 0;
    for (const s of Object.values(audioSpies)) s.mockClear();
    for (const s of Object.values(fxSpies)) s.mockClear();
    for (const s of Object.values(viewSpies)) s.mockClear();
    for (const s of Object.values(ctxSpies)) s.mockClear();
    user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
  });

  afterEach(() => {
    detachAll();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("refuses to start without the #app mount point", async () => {
    mountApp();
    byId("app").remove();
    vi.resetModules();
    await expect(import("../../src/main.js")).rejects.toThrow("#app missing");
  });

  it("boots in 3D with audio on, auto off and renders the first frame", async () => {
    const { state } = await launch();
    expect(byId("status-audio").textContent).toBe("♪ AUDIO ON");
    expect(byId("status-auto").textContent).toBe("⚙ AUTO OFF");
    expect(state.mode).toBe(3);
    frame();
    expect(byId("stat-mode").textContent).toBe("3D");
    expect(byId("stat-score").textContent).toBe("0");
    expect(ctxSpies.render).toHaveBeenCalledOnce();
    expect(viewSpies.update).toHaveBeenCalledOnce();
    expect(frameCb).not.toBeNull();
    // the board view colours cells by piece kind, unknown kinds fall back to white
    const colorOf = viewSpies.update.mock.calls[0][1] as (kind: number) => number;
    expect(colorOf(state.next.kindId)).toBe(state.next.colorHex);
    expect(colorOf(999)).toBe(0xffffff);
  });

  describe("dimension switch and undo", () => {
    it("switches mode, updates the HUD and offers no undo on an untouched board", async () => {
      const { state } = await launch();
      pressKey("Digit4");
      expect(toast()).toBe("MODE 4D");
      expect(state.mode).toBe(4);
      expect(isShown(byId("undo-bar"))).toBe(false);
      expect(audioSpies.playSfx).toHaveBeenCalledWith("mode");
      frame();
      expect(byId("stat-mode").textContent).toBe("4D");
      expect(byId("stat-slice").textContent).toBe("w=0/3");
      expect(getByText(byId("touch-mode"), "4D").getAttribute("aria-pressed")).toBe("true");
      // camera pulls back further for every extra dimension
      pressKey("Digit5");
      pressKey("Digit6");
      const dists = ctxSpies.cameraSet.mock.calls.map((c) => c[2] as number);
      expect(dists).toEqual([28, 52, 68, 88]);
    });

    it("offers undo after a mode switch that would lose progress, and U brings the game back", async () => {
      const { state } = await launch();
      pressKey("Space");
      const cells = Array.from(state.board.cells);
      const score = state.stats.score;
      pressKey("Digit4");
      const bar = byId("undo-bar");
      expect(isShown(bar)).toBe(true);
      expect(byId("undo-text").textContent).toBe("Switched to 4D — new game");
      expect(state.mode).toBe(4);

      pressKey("KeyU");
      expect(toast()).toBe("UNDONE");
      expect(isShown(bar)).toBe(false);
      expect(state.mode).toBe(3);
      expect(Array.from(state.board.cells)).toEqual(cells);
      expect(state.stats.score).toBe(score);
      frame();
      expect(byId("stat-mode").textContent).toBe("3D");
      expect(getByText(byId("touch-mode"), "3D").getAttribute("aria-pressed")).toBe("true");
    });

    it("forgets the undo snapshot once the offer expires", async () => {
      const { state } = await launch();
      pressKey("Space");
      pressKey("KeyR");
      expect(byId("undo-text").textContent).toBe("Game restarted");
      vi.advanceTimersByTime(6000);
      expect(isShown(byId("undo-bar"))).toBe(false);
      pressKey("KeyU");
      expect(toast()).toBe("RESTART");
      expect(state.stats.score).toBe(0);
    });

    it("undoes a restart from the UNDO button", async () => {
      const { state } = await launch();
      pressKey("Space");
      pressKey("Space");
      const score = state.stats.score;
      await user.click(byId("pause-restart"));
      expect(toast()).toBe("RESTART");
      expect(state.stats.score).toBe(0);
      await user.click(getByRole(byId("undo-bar"), "button", { name: /UNDO/ }));
      expect(state.stats.score).toBe(score);
      expect(toast()).toBe("UNDONE");
    });
  });

  describe("pause, help and escape", () => {
    it("pauses with P, shows the dialog and resumes with GO", async () => {
      const { state } = await launch();
      pressKey("KeyP");
      expect(state.paused).toBe(true);
      frame();
      expect(isShown(byId("pause-overlay"))).toBe(true);
      expect(document.activeElement).toBe(byId("pause-resume"));
      pressKey("KeyP");
      expect(state.paused).toBe(false);
      expect(toast()).toBe("GO");
      frame();
      expect(isShown(byId("pause-overlay"))).toBe(false);
    });

    it("resumes from the RESUME button and from the touch pause button", async () => {
      const { state } = await launch();
      await user.click(getByRole(byId("touch-actions"), "button", { name: "Pause" }));
      expect(state.paused).toBe(true);
      await user.click(byId("pause-resume"));
      expect(state.paused).toBe(false);
      expect(toast()).toBe("GO");
    });

    it("pauses while help is open and restores the previous state on close", async () => {
      const { state } = await launch();
      await user.click(byId("help-fab"));
      expect(isShown(byId("help-overlay"))).toBe(true);
      expect(state.paused).toBe(true);
      frame();
      expect(isShown(byId("pause-overlay"))).toBe(false);
      pressKey("KeyP");
      expect(state.paused).toBe(true);
      await user.click(byId("help-close"));
      expect(isShown(byId("help-overlay"))).toBe(false);
      expect(state.paused).toBe(false);
    });

    it("keeps the game paused after closing help that was opened from the pause dialog", async () => {
      const { state } = await launch();
      pressKey("KeyP");
      await user.click(byId("pause-help"));
      expect(isShown(byId("help-overlay"))).toBe(true);
      pressKey("KeyH");
      expect(isShown(byId("help-overlay"))).toBe(false);
      expect(state.paused).toBe(true);
      frame();
      expect(isShown(byId("pause-overlay"))).toBe(true);
    });

    it("Escape closes help first, then toggles pause", async () => {
      const { state } = await launch();
      pressKey("Slash");
      expect(isShown(byId("help-overlay"))).toBe(true);
      pressKey("Escape");
      expect(isShown(byId("help-overlay"))).toBe(false);
      expect(state.paused).toBe(false);
      pressKey("Escape");
      expect(state.paused).toBe(true);
      expect(toast()).not.toBe("GO");
      pressKey("Escape");
      expect(state.paused).toBe(false);
      expect(toast()).toBe("GO");
    });

    it("pauses when the tab is hidden or the window loses focus", async () => {
      const { state } = await launch();
      Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
      document.dispatchEvent(new Event("visibilitychange"));
      expect(state.paused).toBe(true);
      pressKey("KeyP");
      expect(state.paused).toBe(false);
      window.dispatchEvent(new Event("blur"));
      expect(state.paused).toBe(true);
      Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
      document.dispatchEvent(new Event("visibilitychange"));
      expect(state.paused).toBe(true);
    });
  });

  describe("status toggles", () => {
    it("M mutes and unmutes, updating the pill and toast", async () => {
      await launch();
      pressKey("KeyM");
      expect(byId("status-audio").textContent).toBe("♪ AUDIO OFF");
      expect(toast()).toBe("AUDIO OFF");
      expect(audioSpies.setBgmEnabled).toHaveBeenLastCalledWith(false);
      expect(audioSpies.setSfxEnabled).toHaveBeenLastCalledWith(false);
      await user.click(byId("status-audio"));
      expect(byId("status-audio").textContent).toBe("♪ AUDIO ON");
      expect(toast()).toBe("AUDIO ON");
      expect(byId("status-audio").getAttribute("aria-pressed")).toBe("true");
    });

    it("O toggles the autopilot and the pill follows", async () => {
      const { autopilot } = await launch();
      pressKey("KeyO");
      expect(autopilot.enabled).toBe(true);
      expect(byId("status-auto").textContent).toBe("⚙ AUTO ON");
      expect(toast()).toBe("AUTO ON");
      await user.click(byId("status-auto"));
      expect(autopilot.enabled).toBe(false);
      expect(byId("status-auto").textContent).toBe("⚙ AUTO OFF");
      expect(toast()).toBe("AUTO OFF");
    });

    it("wakes the audio engine on the first pointer press", async () => {
      await launch();
      window.dispatchEvent(new Event("pointerdown"));
      window.dispatchEvent(new Event("pointerdown"));
      expect(audioSpies.init).toHaveBeenCalledTimes(1);
      expect(audioSpies.resume).toHaveBeenCalledTimes(1);
    });
  });

  describe("gameplay feedback", () => {
    it("announces hold and refuses a second hold", async () => {
      await launch();
      pressKey("Tab");
      expect(toast()).toBe("HOLD");
      expect(audioSpies.playSfx).toHaveBeenLastCalledWith("hold");
      audioSpies.playSfx.mockClear();
      pressKey("Tab");
      expect(toast()).toBe("HOLD USED");
      expect(audioSpies.playSfx).not.toHaveBeenCalled();
    });

    it("plays move / rotate / drop / lock cues", async () => {
      await launch();
      frame();
      pressKey("ArrowLeft");
      expect(audioSpies.playSfx).toHaveBeenLastCalledWith("move");
      pressKey("KeyQ");
      expect(audioSpies.playSfx).toHaveBeenLastCalledWith("rotate");
      pressKey("Space");
      expect(audioSpies.playSfx).toHaveBeenLastCalledWith("drop");
      frame();
      expect(audioSpies.playSfx).toHaveBeenLastCalledWith("lock");
    });

    it("does not play the lock thud when the piece merely changed hands", async () => {
      const { state } = await launch();
      frame();
      pressKey("Tab");
      frame();
      expect(audioSpies.playSfx).not.toHaveBeenCalledWith("lock");

      pressKey("Space");
      frame();
      expect(audioSpies.playSfx).toHaveBeenLastCalledWith("lock");
      audioSpies.playSfx.mockClear();

      pressKey("KeyR");
      frame();
      expect(audioSpies.playSfx).not.toHaveBeenCalledWith("lock");
      pressKey("KeyU");
      frame();
      expect(audioSpies.playSfx).not.toHaveBeenCalledWith("lock");
      expect(state.stats.score).toBeGreaterThan(0);
    });

    it("shows a CLEAR toast with particle bursts and a HYPER toast for four planes", async () => {
      const { state } = await launch();
      frame();
      state.lastClears = [0];
      frame();
      expect(toast()).toBe("1 CLEAR");
      expect(fxSpies.spawnBurst).toHaveBeenCalledTimes(4);
      expect(audioSpies.playSfx).toHaveBeenLastCalledWith("clear");
      expect(state.lastClears).toEqual([]);

      state.lastClears = [0, 1, 2, 3];
      frame();
      expect(toast()).toBe("4 × HYPER!");
      expect(fxSpies.spawnBurst).toHaveBeenCalledTimes(20);
      expect(audioSpies.playSfx).toHaveBeenLastCalledWith("hyperclear");
    });

    it("shows the final score on game over, stops the autopilot and lets R start over", async () => {
      const { state, autopilot } = await launch();
      pressKey("KeyO");
      state.stats.score = 777;
      state.gameOver = true;
      frame();
      expect(isShown(byId("gameover"))).toBe(true);
      expect(byId("final-score").textContent).toBe("final score: 777");
      expect(audioSpies.playSfx).toHaveBeenCalledWith("gameover");
      expect(autopilot.enabled).toBe(false);
      expect(byId("status-auto").textContent).toBe("⚙ AUTO OFF");
      expect(document.activeElement).toBe(byId("restart-btn"));

      audioSpies.playSfx.mockClear();
      frame();
      expect(audioSpies.playSfx).not.toHaveBeenCalledWith("gameover");

      // Space must not restart from the focused PLAY AGAIN button.
      pressKey("Space");
      expect(state.gameOver).toBe(true);

      pressKey("KeyR");
      expect(state.gameOver).toBe(false);
      expect(isShown(byId("gameover"))).toBe(false);
      expect(isShown(byId("undo-bar"))).toBe(false);
      expect(state.stats.score).toBe(0);
    });

    it("restarts from PLAY AGAIN and keeps the pause dialog closed after game over", async () => {
      const { state } = await launch();
      state.gameOver = true;
      state.paused = true;
      frame();
      expect(isShown(byId("pause-overlay"))).toBe(false);
      // a stray RESUME click during game over must not unpause into a dead game
      await user.click(byId("pause-resume"));
      expect(state.paused).toBe(true);
      await user.click(byId("restart-btn"));
      expect(state.gameOver).toBe(false);
      expect(state.paused).toBe(false);
    });

    it("clamps a long frame gap so a background tab does not drop the piece to the floor", async () => {
      const { state } = await launch();
      const y0 = state.current!.origin[1];
      frame(10_000);
      expect(state.current!.origin[1]).toBe(y0);
      expect(state.dropTimer).toBe(64);
    });
  });
});
