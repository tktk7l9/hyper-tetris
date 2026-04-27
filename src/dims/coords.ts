export type DimMode = 3 | 4 | 5 | 6;
export type CellCoord = number[];

export const AXIS_X = 0;
export const AXIS_Y = 1;
export const AXIS_Z = 2;
export const AXIS_W = 3;
export const AXIS_V = 4;
export const AXIS_U = 5;

export const GRAVITY_AXIS = AXIS_Y;

export const AXIS_LABELS = ["x", "y", "z", "w", "v", "u"] as const;

export const BOARD_SIZES: Record<DimMode, number[]> = {
  3: [10, 20, 10],
  4: [6, 14, 6, 4],
  5: [5, 12, 5, 3, 3],
  6: [4, 10, 4, 3, 3, 3],
};

export function flatten(coord: CellCoord, size: number[]): number {
  let idx = 0;
  let stride = 1;
  for (let i = 0; i < size.length; i++) {
    idx += coord[i] * stride;
    stride *= size[i];
  }
  return idx;
}

export function totalCells(size: number[]): number {
  let n = 1;
  for (const s of size) n *= s;
  return n;
}

export function inBounds(coord: CellCoord, size: number[]): boolean {
  for (let i = 0; i < size.length; i++) {
    if (coord[i] < 0 || coord[i] >= size[i]) return false;
  }
  return true;
}

export function cloneCoord(c: CellCoord): CellCoord {
  return c.slice();
}

export function addCoord(a: CellCoord, b: CellCoord): CellCoord {
  const out = new Array(a.length);
  for (let i = 0; i < a.length; i++) out[i] = a[i] + b[i];
  return out;
}

export function zeros(dim: number): CellCoord {
  return new Array(dim).fill(0);
}

export function padCoord(c: CellCoord, dim: number): CellCoord {
  if (c.length === dim) return c.slice();
  const out = zeros(dim);
  for (let i = 0; i < Math.min(c.length, dim); i++) out[i] = c[i];
  return out;
}
