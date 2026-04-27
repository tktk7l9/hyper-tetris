import {
  GRAVITY_AXIS,
  flatten,
  inBounds,
  totalCells,
  type CellCoord,
  type DimMode,
} from "../dims/coords.js";

/** A non-zero cell value stores the piece's colorId (kindId, 1-based). */
export class Board {
  public readonly cells: Uint8Array;

  constructor(
    public readonly dim: DimMode,
    public readonly size: number[],
  ) {
    this.cells = new Uint8Array(totalCells(size));
  }

  index(coord: CellCoord): number {
    return flatten(coord, this.size);
  }

  isEmpty(coord: CellCoord): boolean {
    return this.cells[this.index(coord)] === 0;
  }

  get(coord: CellCoord): number {
    return this.cells[this.index(coord)];
  }

  set(coord: CellCoord, value: number): void {
    this.cells[this.index(coord)] = value;
  }

  inside(coord: CellCoord): boolean {
    return inBounds(coord, this.size);
  }

  /** Iterate every coord in the board, calling fn(coord, idx, value). */
  forEachCell(
    fn: (coord: CellCoord, idx: number, value: number) => void,
  ): void {
    const dim = this.size.length;
    const coord = new Array(dim).fill(0);
    const total = this.cells.length;
    for (let i = 0; i < total; i++) {
      fn(coord, i, this.cells[i]);
      // increment coord (little-endian over size)
      for (let a = 0; a < dim; a++) {
        coord[a]++;
        if (coord[a] < this.size[a]) break;
        coord[a] = 0;
      }
    }
  }

  /**
   * Returns true when the (N-1)-dim hyperplane at gravity-axis level y is
   * completely filled. y is along GRAVITY_AXIS.
   */
  fillsHyperplane(y: number): boolean {
    const dim = this.size.length;
    const coord = new Array(dim).fill(0);
    coord[GRAVITY_AXIS] = y;
    const dims = [];
    for (let i = 0; i < dim; i++) if (i !== GRAVITY_AXIS) dims.push(i);
    return iterPlane(this, coord, dims, (c) => this.cells[this.index(c)] !== 0);
  }

  /**
   * Remove the y-th hyperplane and shift everything above it down by 1
   * along the gravity axis. Returns nothing.
   */
  clearHyperplane(y: number): void {
    const dim = this.size.length;
    const ySize = this.size[GRAVITY_AXIS];
    // shift down: for yi from y up to ySize-2, copy yi+1 → yi
    for (let yi = y; yi < ySize - 1; yi++) {
      const fromCoord = new Array(dim).fill(0);
      fromCoord[GRAVITY_AXIS] = yi + 1;
      const dims = [];
      for (let i = 0; i < dim; i++) if (i !== GRAVITY_AXIS) dims.push(i);
      iterPlane(this, fromCoord, dims, (c) => {
        const fromIdx = this.index(c);
        const toCoord = c.slice();
        toCoord[GRAVITY_AXIS] = yi;
        this.cells[this.index(toCoord)] = this.cells[fromIdx];
        return true;
      });
    }
    // top plane → empty
    const top = new Array(dim).fill(0);
    top[GRAVITY_AXIS] = ySize - 1;
    const dims = [];
    for (let i = 0; i < dim; i++) if (i !== GRAVITY_AXIS) dims.push(i);
    iterPlane(this, top, dims, (c) => {
      this.cells[this.index(c)] = 0;
      return true;
    });
  }

  /**
   * Detect all full hyperplanes, clear them, and return the y-levels cleared
   * (highest first so subsequent shifts stay correct).
   */
  clearFullHyperplanes(): number[] {
    const cleared: number[] = [];
    for (let y = 0; y < this.size[GRAVITY_AXIS]; y++) {
      if (this.fillsHyperplane(y)) cleared.push(y);
    }
    // clear from highest to lowest to keep indices valid
    for (let i = cleared.length - 1; i >= 0; i--) {
      this.clearHyperplane(cleared[i]);
    }
    return cleared;
  }
}

/**
 * Iterate over an (N-1)-dim hyperplane defined by `coord` (with the
 * gravity-axis component already set). `dims` is the list of axes to vary.
 * Returns true if `fn` returned truthy for every cell visited.
 */
function iterPlane(
  board: Board,
  coord: CellCoord,
  dims: number[],
  fn: (c: CellCoord) => boolean,
): boolean {
  // depth-first over dims using coord buffer
  for (const a of dims) coord[a] = 0;
  while (true) {
    const ok = fn(coord);
    if (!ok) return false;
    let carried = true;
    for (const a of dims) {
      coord[a]++;
      if (coord[a] < board.size[a]) {
        carried = false;
        break;
      }
      coord[a] = 0;
    }
    if (carried) break;
  }
  return true;
}
