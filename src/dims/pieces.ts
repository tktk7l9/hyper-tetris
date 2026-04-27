import { padCoord, type CellCoord, type DimMode } from "./coords.js";

export interface PiecePrototype {
  kindId: number;
  label: string;
  colorHex: number;
  /** Block coords relative to a local origin, padded to the active dim. */
  blocks: CellCoord[];
}

/**
 * Base 3D tetromino shapes. Coordinates are (x, y, z); pieces are flat in the
 * x-z plane (y=0) so that they fall along +y → -y under gravity. Higher-dim
 * variants are derived by extending into w/v/u below.
 */
const BASE_3D: Omit<PiecePrototype, "kindId">[] = [
  {
    label: "I",
    colorHex: 0x5cf2ff,
    blocks: [
      [0, 0, 0],
      [1, 0, 0],
      [2, 0, 0],
      [3, 0, 0],
    ],
  },
  {
    label: "O",
    colorHex: 0xffd166,
    blocks: [
      [0, 0, 0],
      [1, 0, 0],
      [0, 0, 1],
      [1, 0, 1],
    ],
  },
  {
    label: "T",
    colorHex: 0xc77dff,
    blocks: [
      [0, 0, 0],
      [1, 0, 0],
      [2, 0, 0],
      [1, 0, 1],
    ],
  },
  {
    label: "L",
    colorHex: 0xff9f40,
    blocks: [
      [0, 0, 0],
      [1, 0, 0],
      [2, 0, 0],
      [2, 0, 1],
    ],
  },
  {
    label: "J",
    colorHex: 0x4d96ff,
    blocks: [
      [0, 0, 0],
      [1, 0, 0],
      [2, 0, 0],
      [0, 0, 1],
    ],
  },
  {
    label: "S",
    colorHex: 0x70e000,
    blocks: [
      [1, 0, 0],
      [2, 0, 0],
      [0, 0, 1],
      [1, 0, 1],
    ],
  },
  {
    label: "Z",
    colorHex: 0xef476f,
    blocks: [
      [0, 0, 0],
      [1, 0, 0],
      [1, 0, 1],
      [2, 0, 1],
    ],
  },
];

/** Hyper-I: 4 cells along a chosen high axis (3 = w, 4 = v, 5 = u). */
function hyperILine(axis: number, dim: number): CellCoord[] {
  const blocks: CellCoord[] = [];
  for (let i = 0; i < 4; i++) {
    const c = new Array(dim).fill(0);
    c[axis] = i;
    blocks.push(c);
  }
  return blocks;
}

/** Hyper-O: a 2x2 in (x, axis) plane. */
function hyperOSquare(axis: number, dim: number): CellCoord[] {
  const mk = (x: number, h: number) => {
    const c = new Array(dim).fill(0);
    c[0] = x;
    c[axis] = h;
    return c;
  };
  return [mk(0, 0), mk(1, 0), mk(0, 1), mk(1, 1)];
}

/** L-piece bent into the high axis instead of z. */
function hyperLBend(axis: number, dim: number): CellCoord[] {
  const mk = (x: number, h: number) => {
    const c = new Array(dim).fill(0);
    c[0] = x;
    c[axis] = h;
    return c;
  };
  return [mk(0, 0), mk(1, 0), mk(2, 0), mk(2, 1)];
}

let nextKindId = 1;
function nextId(): number {
  return nextKindId++;
}

function withId(p: Omit<PiecePrototype, "kindId">): PiecePrototype {
  return { ...p, kindId: nextId() };
}

const PIECES_3D: PiecePrototype[] = BASE_3D.map(withId);

function extendBaseTo(dim: number): PiecePrototype[] {
  return PIECES_3D.map((p) => ({
    ...p,
    blocks: p.blocks.map((b) => padCoord(b, dim)),
  }));
}

const HYPER_AXES: Array<{ axis: number; tag: string; minDim: DimMode }> = [
  { axis: 3, tag: "W", minDim: 4 },
  { axis: 4, tag: "V", minDim: 5 },
  { axis: 5, tag: "U", minDim: 6 },
];

const HYPER_PIECES: Record<DimMode, PiecePrototype[]> = { 3: [], 4: [], 5: [], 6: [] };

for (const { axis, tag, minDim } of HYPER_AXES) {
  for (const dim of [4, 5, 6] as DimMode[]) {
    if (dim < minDim) continue;
    HYPER_PIECES[dim].push(
      withId({
        label: `I-${tag}`,
        colorHex: tag === "W" ? 0x9d4edd : tag === "V" ? 0x06d6a0 : 0xf72585,
        blocks: hyperILine(axis, dim),
      }),
      withId({
        label: `O-${tag}`,
        colorHex: tag === "W" ? 0xb392ac : tag === "V" ? 0x80ed99 : 0xff70a6,
        blocks: hyperOSquare(axis, dim),
      }),
      withId({
        label: `L-${tag}`,
        colorHex: tag === "W" ? 0xffba08 : tag === "V" ? 0x90e0ef : 0xffafcc,
        blocks: hyperLBend(axis, dim),
      }),
    );
  }
}

export function piecesFor(dim: DimMode): PiecePrototype[] {
  if (dim === 3) return PIECES_3D;
  return [...extendBaseTo(dim), ...HYPER_PIECES[dim]];
}

export function randomPiece(dim: DimMode): PiecePrototype {
  const pool = piecesFor(dim);
  return pool[(Math.random() * pool.length) | 0];
}
