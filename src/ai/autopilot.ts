/**
 * Heuristic auto-player. Each time a fresh piece spawns we search reachable
 * (rotation, target-origin) placements, score the resulting board, and execute
 * the best plan one input per tick. Works for any DimMode within a soft
 * evaluation budget (so 6D doesn't melt the CPU).
 */

import { GRAVITY_AXIS } from "../dims/coords.js";
import { rotationPlanesFor, type RotationPlane } from "../dims/rotations.js";
import { Board } from "../game/board.js";
import {
  absoluteCells,
  collides,
  hardDrop,
  tryRotate,
  type ActivePiece,
} from "../game/piece.js";
import type { GameState } from "../game/state.js";

type RotateAction = { type: "rotate"; axisA: number; axisB: number; dir: 1 | -1 };
type MoveAction = { type: "move"; axis: number; dir: 1 | -1 };
type DropAction = { type: "drop" };
type Action = RotateAction | MoveAction | DropAction;

export class AutoPilot {
  enabled = false;
  private plan: Action[] = [];
  private trackedPiece: ActivePiece | null = null;
  private lastActionT = 0;
  /** ms between successive automated inputs (lower = faster). */
  private actionInterval = 65;

  toggle(): boolean {
    this.enabled = !this.enabled;
    this.plan = [];
    this.trackedPiece = null;
    return this.enabled;
  }

  setEnabled(v: boolean) {
    if (v === this.enabled) return;
    this.enabled = v;
    this.plan = [];
    this.trackedPiece = null;
  }

  step(state: GameState, t: number) {
    if (!this.enabled) return;
    if (state.gameOver || state.paused || !state.current) return;
    if (state.current !== this.trackedPiece) {
      this.trackedPiece = state.current;
      this.plan = computePlan(state);
    }
    if (this.plan.length === 0) return;
    if (t - this.lastActionT < this.actionInterval) return;
    this.lastActionT = t;
    const action = this.plan.shift()!;
    execute(action, state);
  }
}

function execute(a: Action, state: GameState): void {
  switch (a.type) {
    case "rotate":
      state.rotate(a.axisA, a.axisB, a.dir);
      return;
    case "move": {
      const delta = new Array(state.mode).fill(0);
      delta[a.axis] = a.dir;
      state.moveBy(delta);
      return;
    }
    case "drop":
      state.hardDrop();
      return;
  }
}

function computePlan(state: GameState): Action[] {
  if (!state.current) return [];
  const piece = state.current;
  const board = state.board;
  const planes = rotationPlanesFor(state.mode);
  const candidates = expandRotations(piece, planes, board, 24);

  let best: { score: number; cand: Candidate; targetOrigin: number[] } | null = null;
  let evals = 0;
  const budget = 1800;

  outer: for (const cand of candidates) {
    const cp = cand.piece;
    const ranges: { axis: number; min: number; max: number }[] = [];
    for (let a = 0; a < state.mode; a++) {
      if (a === GRAVITY_AXIS) continue;
      let mn = Infinity, mx = -Infinity;
      for (const b of cp.blocks) {
        if (b[a] < mn) mn = b[a];
        if (b[a] > mx) mx = b[a];
      }
      ranges.push({ axis: a, min: -mn, max: board.size[a] - 1 - mx });
    }
    const it = iterateOrigins(cp.origin.slice(), ranges);
    for (const origin of it) {
      if (++evals > budget) break outer;
      const trial: ActivePiece = { ...cp, origin: origin.slice() };
      if (collides(trial, board)) continue;
      const landed = hardDrop(trial, board).piece;
      const score = scorePlacement(board, landed);
      if (!best || score > best.score) {
        best = { score, cand, targetOrigin: origin.slice() };
      }
    }
  }

  if (!best) return [];

  const actions: Action[] = [];
  for (const r of best.cand.path) actions.push({ type: "rotate", ...r });
  const fromOrigin = best.cand.piece.origin;
  for (let a = 0; a < state.mode; a++) {
    if (a === GRAVITY_AXIS) continue;
    let d = best.targetOrigin[a] - fromOrigin[a];
    while (d !== 0) {
      actions.push({ type: "move", axis: a, dir: d > 0 ? 1 : -1 });
      d += d > 0 ? -1 : 1;
    }
  }
  actions.push({ type: "drop" });
  return actions;
}

interface Candidate {
  piece: ActivePiece;
  path: { axisA: number; axisB: number; dir: 1 | -1 }[];
}

function expandRotations(
  piece: ActivePiece,
  planes: RotationPlane[],
  board: Board,
  maxStates: number,
): Candidate[] {
  const out: Candidate[] = [];
  const seen = new Set<string>();
  const queue: Candidate[] = [{ piece, path: [] }];
  while (queue.length && out.length < maxStates) {
    const cur = queue.shift()!;
    const key = blocksKey(cur.piece.blocks);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(cur);
    if (cur.path.length >= 4) continue;
    for (const plane of planes) {
      for (const dir of [1, -1] as const) {
        const next = tryRotate(cur.piece, plane.axisA, plane.axisB, dir, board);
        if (!next) continue;
        const k = blocksKey(next.blocks);
        if (seen.has(k)) continue;
        queue.push({
          piece: next,
          path: [...cur.path, { axisA: plane.axisA, axisB: plane.axisB, dir }],
        });
      }
    }
  }
  return out;
}

function blocksKey(blocks: number[][]): string {
  // shape-only key: shift to non-negative origin then sort
  const dim = blocks[0].length;
  const min = new Array(dim).fill(Infinity);
  for (const b of blocks) for (let i = 0; i < dim; i++) if (b[i] < min[i]) min[i] = b[i];
  const norm = blocks
    .map((b) => b.map((v, i) => v - min[i]).join(","))
    .sort();
  return norm.join("|");
}

/** Yield every cartesian-product origin within the supplied per-axis ranges. */
function* iterateOrigins(
  baseOrigin: number[],
  ranges: { axis: number; min: number; max: number }[],
): Generator<number[]> {
  if (ranges.length === 0) { yield baseOrigin.slice(); return; }
  // build counter
  const sizes = ranges.map((r) => Math.max(0, r.max - r.min + 1));
  for (const s of sizes) if (s === 0) return;
  const idx = new Array(ranges.length).fill(0);
  while (true) {
    const o = baseOrigin.slice();
    for (let i = 0; i < ranges.length; i++) o[ranges[i].axis] = ranges[i].min + idx[i];
    yield o;
    let carry = true;
    for (let i = 0; i < ranges.length; i++) {
      idx[i]++;
      if (idx[i] < sizes[i]) { carry = false; break; }
      idx[i] = 0;
    }
    if (carry) break;
  }
}

// ---------------- scoring ----------------

/**
 * Lock the piece into a cloned cell buffer, clear full hyperplanes, and
 * compute heuristic features. Restores the board afterwards.
 */
function scorePlacement(board: Board, piece: ActivePiece): number {
  const backup = board.cells.slice();
  for (const c of absoluteCells(piece)) board.set(c, piece.kindId);
  const cleared = board.clearFullHyperplanes();
  const m = computeMetrics(board);
  board.cells.set(backup);

  const lines = cleared.length;
  // tweaked weights — balanced for N-D where heights climb fast
  return (
    lines * 1.4 +
    -m.aggHeight * 0.51 +
    -m.holes * 1.7 +
    -m.bumpiness * 0.18 +
    -m.maxHeight * 0.25
  );
}

interface Metrics {
  aggHeight: number;
  holes: number;
  bumpiness: number;
  maxHeight: number;
}

function computeMetrics(board: Board): Metrics {
  const ySize = board.size[GRAVITY_AXIS];
  const dim = board.size.length;
  // map column-key → height (max y+1 with block) and count holes per column
  const heights = new Map<string, number>();
  const holes = new Map<string, number>();

  // Iterate cells from top to bottom to detect "first filled" easily.
  // We'll just scan everything.
  board.forEachCell((coord, _i, val) => {
    if (val === 0) return;
    const k = colKey(coord);
    const y = coord[GRAVITY_AXIS];
    const cur = heights.get(k) ?? 0;
    if (y + 1 > cur) heights.set(k, y + 1);
  });
  // count holes per column: for each column, walk y from 0..height-1 and count empties
  // We need to read each cell — re-iterate is fine.
  const columns = new Set(heights.keys());
  // Build a quick index lookup by column→bitmap (yes/no per y). Use Uint8Array.
  const colCells = new Map<string, Uint8Array>();
  board.forEachCell((coord, _i, val) => {
    const k = colKey(coord);
    if (!columns.has(k)) return;
    let arr = colCells.get(k);
    if (!arr) { arr = new Uint8Array(ySize); colCells.set(k, arr); }
    if (val !== 0) arr[coord[GRAVITY_AXIS]] = 1;
  });
  let totalHoles = 0;
  for (const [k, arr] of colCells) {
    const h = heights.get(k) ?? 0;
    let count = 0;
    for (let y = 0; y < h; y++) if (arr[y] === 0) count++;
    holes.set(k, count);
    totalHoles += count;
  }

  // sums
  let agg = 0;
  let maxH = 0;
  for (const h of heights.values()) {
    agg += h;
    if (h > maxH) maxH = h;
  }

  // bumpiness: difference between adjacent x-columns and z-columns within each
  // (w, v, u) slab. We'll walk cartesian over non-(x,y,z) axes.
  let bumpiness = 0;
  const otherAxes: number[] = [];
  for (let a = 3; a < dim; a++) otherAxes.push(a);
  const slabIdx = new Array(otherAxes.length).fill(0);
  const slabSizes = otherAxes.map((a) => board.size[a]);
  while (true) {
    // x-direction
    for (let z = 0; z < board.size[2]; z++) {
      let prevH: number | null = null;
      for (let x = 0; x < board.size[0]; x++) {
        const coord = [x, 0, z, ...slabIdx];
        const k = colKey(coord);
        const h = heights.get(k) ?? 0;
        if (prevH !== null) bumpiness += Math.abs(h - prevH);
        prevH = h;
      }
    }
    // z-direction
    for (let x = 0; x < board.size[0]; x++) {
      let prevH: number | null = null;
      for (let z = 0; z < board.size[2]; z++) {
        const coord = [x, 0, z, ...slabIdx];
        const k = colKey(coord);
        const h = heights.get(k) ?? 0;
        if (prevH !== null) bumpiness += Math.abs(h - prevH);
        prevH = h;
      }
    }
    // increment slab counter
    let carry = true;
    for (let i = 0; i < slabIdx.length; i++) {
      slabIdx[i]++;
      if (slabIdx[i] < slabSizes[i]) { carry = false; break; }
      slabIdx[i] = 0;
    }
    if (carry) break;
    if (slabIdx.length === 0) break;
  }

  return { aggHeight: agg, holes: totalHoles, bumpiness, maxHeight: maxH };
}

function colKey(coord: number[]): string {
  // Skip the gravity axis (y) to define a column.
  // Avoid join allocations: build string once.
  let s = "";
  for (let i = 0; i < coord.length; i++) {
    if (i === GRAVITY_AXIS) continue;
    s += coord[i] + ",";
  }
  return s;
}
