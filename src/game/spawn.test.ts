import { afterEach, describe, expect, it, vi } from "vitest";
import { BOARD_SIZES, GRAVITY_AXIS, type DimMode } from "../dims/coords.js";
import { piecesFor } from "../dims/pieces.js";
import { Board } from "./board.js";
import { absoluteCells, collides, spawnPiece, tryRotate } from "./piece.js";
import { rotationPlanesFor } from "../dims/rotations.js";
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
        // extra axes (w, v, u): the piece starts in slice 0, where the view cursor
        // starts, so at least one cell is visible in the main well
        for (let axis = 3; axis < dim; axis++) {
          expect(min[axis], `axis ${axis}`).toBe(0);
        }
        expect(cells.some((c) => c.slice(3).every((v) => v === 0))).toBe(true);

        // right after spawn the piece is not wedged against a wall: it can turn
        // in at least one plane
        const turns = rotationPlanesFor(dim).filter((p) =>
          tryRotate(piece, p.axisA, p.axisB, 1, board),
        );
        expect(turns.length).toBeGreaterThan(0);
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

  it("keeps the 4D spawn position unchanged", () => {
    const board = new Board(4, BOARD_SIZES[4]);
    for (const proto of piecesFor(4)) {
      const piece = spawnPiece(proto, board, 4);
      expect(piece.origin, proto.label).toEqual([2, 13, 2, 0]);
      expect(piece.blocks, proto.label).toEqual(proto.blocks);
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
