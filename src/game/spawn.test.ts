import { afterEach, describe, expect, it, vi } from "vitest";
import { BOARD_SIZES, GRAVITY_AXIS, type DimMode } from "../dims/coords.js";
import { piecesFor } from "../dims/pieces.js";
import { Board } from "./board.js";
import { absoluteCells, collides, spawnPiece } from "./piece.js";
import { GameState } from "./state.js";

const DIMS: DimMode[] = [3, 4, 5, 6];

function extents(cells: number[][], dim: number) {
  const min = new Array(dim).fill(Infinity);
  const max = new Array(dim).fill(-Infinity);
  for (const c of cells) {
    for (let i = 0; i < dim; i++) {
      min[i] = Math.min(min[i], c[i]);
      max[i] = Math.max(max[i], c[i]);
    }
  }
  return { min, max };
}

describe("spawnPiece", () => {
  for (const dim of DIMS) {
    for (const proto of piecesFor(dim)) {
      it(`${dim}D ${proto.label} spawns fully inside an empty board`, () => {
        const board = new Board(dim, BOARD_SIZES[dim]);
        const piece = spawnPiece(proto, board, dim);
        const cells = absoluteCells(piece);
        expect(cells).toHaveLength(proto.blocks.length);
        for (const c of cells) expect(board.inside(c), JSON.stringify(c)).toBe(true);
        expect(collides(piece, board)).toBe(false);

        const { min, max } = extents(cells, dim);
        // the piece touches the top row, as before
        expect(max[GRAVITY_AXIS]).toBe(board.size[GRAVITY_AXIS] - 1);
        // extra axes (w, v, u): centred, i.e. free space on each side differs by at most 1
        for (let axis = 3; axis < dim; axis++) {
          const below = min[axis];
          const above = board.size[axis] - 1 - max[axis];
          expect(Math.abs(below - above), `axis ${axis}`).toBeLessThanOrEqual(1);
        }
      });
    }
  }

  it("keeps the 3D spawn position unchanged", () => {
    const board = new Board(3, BOARD_SIZES[3]);
    for (const proto of piecesFor(3)) {
      const piece = spawnPiece(proto, board, 3);
      expect(piece.origin).toEqual([4, 19, 4]);
      expect(piece.blocks).toEqual(proto.blocks);
    }
  });

  it("does not mutate the prototype", () => {
    for (const dim of DIMS) {
      for (const proto of piecesFor(dim)) {
        const before = JSON.stringify(proto.blocks);
        spawnPiece(proto, new Board(dim, BOARD_SIZES[dim]), dim);
        expect(JSON.stringify(proto.blocks)).toBe(before);
      }
    }
  });
});

describe("GameState invariant", () => {
  afterEach(() => vi.restoreAllMocks());

  for (const dim of DIMS) {
    it(`a fresh ${dim}D game is never over at spawn, for every current/next piece`, () => {
      const n = piecesFor(dim).length;
      // Drive Math.random so that every piece is drawn first and second.
      for (let a = 0; a < n; a++) {
        for (let b = 0; b < n; b++) {
          const seq = [a, b, 0];
          let k = 0;
          vi.spyOn(Math, "random").mockImplementation(() => (seq[k++ % seq.length] + 0.5) / n);
          const game = new GameState(dim);
          expect(game.gameOver, `pieces ${a},${b}`).toBe(false);
          expect(game.current).not.toBeNull();
          game.reset(dim);
          expect(game.gameOver, `reset pieces ${a},${b}`).toBe(false);
          vi.restoreAllMocks();
        }
      }
    });

    it(`swapping hold on a fresh ${dim}D game always succeeds`, () => {
      const n = piecesFor(dim).length;
      for (let a = 0; a < n; a++) {
        const seq = [a, (a + 1) % n, (a + 2) % n];
        let k = 0;
        vi.spyOn(Math, "random").mockImplementation(() => (seq[k++ % seq.length] + 0.5) / n);
        const game = new GameState(dim);
        expect(game.swapHold()).toBe(true);
        expect(game.gameOver).toBe(false);
        vi.restoreAllMocks();
      }
    });
  }
});
