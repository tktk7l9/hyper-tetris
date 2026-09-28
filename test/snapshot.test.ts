import { describe, expect, it } from "vitest";
import { GameState } from "../src/game/state.js";

describe("GameState snapshot / restore", () => {
  it("reports no progress on a fresh game", () => {
    const s = new GameState(3);
    expect(s.hasProgress()).toBe(false);
  });

  it("reports progress once a piece has been dropped", () => {
    const s = new GameState(3);
    s.hardDrop();
    expect(s.hasProgress()).toBe(true);
  });

  it("restores board, stats, pieces and mode after a mode switch", () => {
    const s = new GameState(3);
    s.hardDrop();
    s.hardDrop();
    s.swapHold();
    const before = {
      cells: Array.from(s.board.cells),
      stats: { ...s.stats },
      current: structuredClone(s.current),
      next: s.next,
      hold: s.hold,
      holdLocked: s.holdLocked,
    };
    const snap = s.snapshot();

    s.changeMode(5);
    expect(s.mode).toBe(5);

    s.restore(snap);
    expect(s.mode).toBe(3);
    expect(s.board.size).toEqual([10, 20, 10]);
    expect(Array.from(s.board.cells)).toEqual(before.cells);
    expect(s.stats).toEqual(before.stats);
    expect(s.current).toEqual(before.current);
    expect(s.next).toBe(before.next);
    expect(s.hold).toBe(before.hold);
    expect(s.holdLocked).toBe(before.holdLocked);
    expect(s.gameOver).toBe(false);
    expect(s.paused).toBe(false);
  });

  it("is isolated from later mutation of the live state", () => {
    const s = new GameState(4);
    s.hardDrop();
    s.shiftSlice(0, 1);
    const snap = s.snapshot();
    const cells = Array.from(snap.cells);

    s.hardDrop();
    s.shiftSlice(0, 1);
    s.stats.score = 999_999;

    expect(Array.from(snap.cells)).toEqual(cells);
    expect(snap.stats.score).not.toBe(999_999);
    expect(snap.slice).toEqual([1]);

    s.restore(snap);
    expect(s.slice.values).toEqual([1]);
    // restoring must not alias the snapshot either
    s.hardDrop();
    expect(Array.from(snap.cells)).toEqual(cells);
  });
});
