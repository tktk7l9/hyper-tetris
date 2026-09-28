import { describe, expect, it } from "vitest";
import { PauseController } from "../src/game/pause.js";

function make(paused = false, gameOver = false) {
  const state = { paused, gameOver };
  return { state, pc: new PauseController(state) };
}

describe("PauseController", () => {
  it("pauses the game while help is open and resumes on close", () => {
    const { state, pc } = make();
    pc.openHelp();
    expect(pc.helpOpen).toBe(true);
    expect(state.paused).toBe(true);
    pc.closeHelp();
    expect(pc.helpOpen).toBe(false);
    expect(state.paused).toBe(false);
  });

  it("keeps the game paused after help closes if it was paused before", () => {
    const { state, pc } = make(true);
    pc.openHelp();
    pc.closeHelp();
    expect(state.paused).toBe(true);
  });

  it("toggleHelp returns the new open state", () => {
    const { pc } = make();
    expect(pc.toggleHelp()).toBe(true);
    expect(pc.toggleHelp()).toBe(false);
  });

  it("ignores the pause toggle while help is open", () => {
    const { state, pc } = make();
    pc.openHelp();
    expect(pc.togglePause()).toBe(true);
    expect(state.paused).toBe(true);
    pc.closeHelp();
    expect(state.paused).toBe(false);
  });

  it("toggles pause normally", () => {
    const { state, pc } = make();
    expect(pc.togglePause()).toBe(true);
    expect(state.paused).toBe(true);
    expect(pc.togglePause()).toBe(false);
    expect(state.paused).toBe(false);
  });

  it("does not pause a finished game", () => {
    const { state, pc } = make(false, true);
    expect(pc.togglePause()).toBe(false);
    expect(pc.suspend()).toBe(false);
    expect(state.paused).toBe(false);
  });

  it("suspend pauses once and reports whether anything changed", () => {
    const { state, pc } = make();
    expect(pc.suspend()).toBe(true);
    expect(state.paused).toBe(true);
    expect(pc.suspend()).toBe(false);
  });

  it("suspend while help is open keeps the game paused after help closes", () => {
    const { state, pc } = make();
    pc.openHelp();
    pc.suspend();
    pc.closeHelp();
    expect(state.paused).toBe(true);
  });

  it("escape closes help first, then toggles pause", () => {
    const { state, pc } = make();
    pc.openHelp();
    expect(pc.escape()).toBe("help-closed");
    expect(state.paused).toBe(false);
    expect(pc.escape()).toBe("paused");
    expect(pc.escape()).toBe("resumed");
  });

  it("escape does nothing on a finished game without help", () => {
    const { pc } = make(false, true);
    expect(pc.escape()).toBe("none");
  });

  it("afterReset keeps the new game paused while help stays open", () => {
    const { state, pc } = make();
    pc.openHelp();
    state.paused = false; // GameState.reset clears the flag
    pc.afterReset();
    expect(state.paused).toBe(true);
    pc.closeHelp();
    expect(state.paused).toBe(false);
  });

  it("open / close are idempotent", () => {
    const { state, pc } = make();
    pc.closeHelp();
    expect(state.paused).toBe(false);
    pc.openHelp();
    pc.openHelp();
    pc.closeHelp();
    expect(state.paused).toBe(false);
  });

  it("afterReset is a no-op without help", () => {
    const { state, pc } = make();
    pc.afterReset();
    expect(state.paused).toBe(false);
  });

  it("suspend with help open twice reports the second as unchanged", () => {
    const { pc } = make();
    pc.openHelp();
    expect(pc.suspend()).toBe(true);
    expect(pc.suspend()).toBe(false);
  });
});
