import {
  AXIS_X,
  AXIS_Y,
  AXIS_Z,
  GRAVITY_AXIS,
  type CellCoord,
  type DimMode,
} from "../dims/coords.js";
import {
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
  // spawn near top of y axis, centered on x and z, w/v/u = 0
  const origin: CellCoord = new Array(dim).fill(0);
  origin[AXIS_X] = Math.floor(board.size[AXIS_X] / 2) - 1;
  origin[AXIS_Z] = Math.floor(board.size[AXIS_Z] / 2) - 1;
  origin[AXIS_Y] = board.size[AXIS_Y] - 1;
  return {
    kindId: proto.kindId,
    colorHex: proto.colorHex,
    label: proto.label,
    blocks: proto.blocks.map((b) => b.slice()),
    origin,
    dim,
  };
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
