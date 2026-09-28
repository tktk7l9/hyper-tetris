import {
  AXIS_X,
  AXIS_Y,
  AXIS_Z,
  GRAVITY_AXIS,
  type CellCoord,
  type DimMode,
} from "../dims/coords.js";
import {
  normalizeOrigin,
  rotateAll,
  type RotationDir,
} from "../dims/rotations.js";
import type { PiecePrototype } from "../dims/pieces.js";
import type { Board } from "./board.js";

export interface ActivePiece {
  kindId: number;
  colorHex: number;
  blocks: CellCoord[]; // local, around the piece pivot (origin-relative)
  origin: CellCoord;   // absolute board coord
  dim: DimMode;
  label: string;
}

export function spawnPiece(
  proto: PiecePrototype,
  board: Board,
  dim: DimMode,
): ActivePiece {
  const blocks = orientToFit(proto.blocks, board.size, dim);
  const { min, max } = blockBounds(blocks, dim);
  const origin: CellCoord = new Array(dim).fill(0);
  for (let axis = 0; axis < dim; axis++) {
    const size = board.size[axis];
    const lo = 0 - min[axis]; // "0 -" avoids -0 in origins
    const hi = size - 1 - max[axis];
    let want: number;
    if (axis === AXIS_Y) {
      // topmost block sits on the top row
      want = hi;
    } else if (axis === AXIS_X || axis === AXIS_Z) {
      // historical spawn column; clamped so wide pieces stay inside narrow boards
      want = Math.floor(size / 2) - 1;
    } else {
      // w / v / u: slice 0, where the view cursor starts and never follows the
      // piece on its own. Centring here would spawn pieces out of sight.
      want = 0 - min[axis];
    }
    origin[axis] = Math.min(hi, Math.max(lo, want));
  }
  return {
    kindId: proto.kindId,
    colorHex: proto.colorHex,
    label: proto.label,
    blocks,
    origin,
    dim,
  };
}

function blockBounds(
  blocks: CellCoord[],
  dim: number,
): { min: number[]; max: number[] } {
  const min = new Array(dim).fill(Infinity);
  const max = new Array(dim).fill(-Infinity);
  for (const b of blocks) {
    for (let i = 0; i < dim; i++) {
      if (b[i] < min[i]) min[i] = b[i];
      if (b[i] > max[i]) max[i] = b[i];
    }
  }
  return { min, max };
}

function fitsExtents(blocks: CellCoord[], size: number[], dim: number): boolean {
  const { min, max } = blockBounds(blocks, dim);
  for (let i = 0; i < dim; i++) {
    if (max[i] - min[i] + 1 > size[i]) return false;
  }
  return true;
}

/**
 * Return a copy of `blocks` whose extent fits the board on every axis. A shape
 * longer than an axis (e.g. the 4-long hyper-I on a 3-wide w/v/u axis) is
 * turned a quarter into the first axis that can hold it: x, then z, then the
 * other extra axes, and y (vertical) as a last resort.
 */
function orientToFit(
  blocks: CellCoord[],
  size: number[],
  dim: number,
): CellCoord[] {
  if (fitsExtents(blocks, size, dim)) return blocks.map((b) => b.slice());
  const { min, max } = blockBounds(blocks, dim);
  const targets = [AXIS_X, AXIS_Z];
  for (let i = 3; i < dim; i++) targets.push(i);
  targets.push(AXIS_Y);
  for (let axis = 0; axis < dim; axis++) {
    if (max[axis] - min[axis] + 1 <= size[axis]) continue;
    for (const target of targets) {
      if (target === axis) continue;
      const turned = normalizeOrigin(rotateAll(blocks, target, axis, 1)).blocks;
      if (fitsExtents(turned, size, dim)) return turned;
    }
  }
  // No quarter turn fits; unreachable for the shipped pieces and board sizes.
  return blocks.map((b) => b.slice());
}

export function absoluteCells(piece: ActivePiece): CellCoord[] {
  return piece.blocks.map((b) => {
    const out = new Array(piece.dim);
    for (let i = 0; i < piece.dim; i++) out[i] = b[i] + piece.origin[i];
    return out;
  });
}

export function collides(piece: ActivePiece, board: Board): boolean {
  for (const b of piece.blocks) {
    const c = new Array(piece.dim);
    for (let i = 0; i < piece.dim; i++) c[i] = b[i] + piece.origin[i];
    if (!board.inside(c)) return true;
    if (!board.isEmpty(c)) return true;
  }
  return false;
}

/** Translate the piece by `delta`. Returns a new piece if it fits, else null. */
export function tryMove(
  piece: ActivePiece,
  delta: CellCoord,
  board: Board,
): ActivePiece | null {
  const next: ActivePiece = {
    ...piece,
    origin: piece.origin.map((v, i) => v + (delta[i] ?? 0)),
    blocks: piece.blocks,
  };
  if (collides(next, board)) return null;
  return next;
}

/** Rotate in (axisA, axisB) plane. Falls back to wall-kick by translating. */
export function tryRotate(
  piece: ActivePiece,
  axisA: number,
  axisB: number,
  dir: RotationDir,
  board: Board,
): ActivePiece | null {
  const rotated = rotateAll(piece.blocks, axisA, axisB, dir);
  // basic kick: try (0,0,...), then ±1 along axisA, axisB, plus -1 along y
  const kicks: CellCoord[] = [
    new Array(piece.dim).fill(0),
  ];
  for (const ax of [axisA, axisB]) {
    const k1 = new Array(piece.dim).fill(0);
    const k2 = new Array(piece.dim).fill(0);
    k1[ax] = 1;
    k2[ax] = -1;
    kicks.push(k1, k2);
  }
  // pull-down kick (helps near floor)
  const kdown = new Array(piece.dim).fill(0);
  kdown[GRAVITY_AXIS] = -1;
  kicks.push(kdown);

  for (const kick of kicks) {
    const candidate: ActivePiece = {
      ...piece,
      blocks: rotated,
      origin: piece.origin.map((v, i) => v + kick[i]),
    };
    if (!collides(candidate, board)) return candidate;
  }
  return null;
}

/** Drop the piece down along gravity until it lands. Returns final piece + cells fallen. */
export function hardDrop(
  piece: ActivePiece,
  board: Board,
): { piece: ActivePiece; distance: number } {
  let cur = piece;
  let dist = 0;
  const down = new Array(piece.dim).fill(0);
  down[GRAVITY_AXIS] = -1;
  while (true) {
    const next = tryMove(cur, down, board);
    if (!next) break;
    cur = next;
    dist++;
  }
  return { piece: cur, distance: dist };
}

/** Lock the piece into the board's cells. */
export function lockIn(piece: ActivePiece, board: Board): void {
  for (const c of absoluteCells(piece)) {
    board.set(c, piece.kindId);
  }
}
