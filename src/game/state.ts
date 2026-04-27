import { BOARD_SIZES, type DimMode } from "../dims/coords.js";
import { piecesFor, randomPiece, type PiecePrototype } from "../dims/pieces.js";
import { Board } from "./board.js";
import {
  collides,
  hardDrop,
  lockIn,
  spawnPiece,
  tryMove,
  tryRotate,
  type ActivePiece,
} from "./piece.js";
import { GRAVITY_AXIS } from "../dims/coords.js";

export interface SliceCursor {
  /** w, v, u (length = dim - 3, 0 if dim===3). */
  values: number[];
}

export interface GameStats {
  score: number;
  level: number;
  lines: number;
  combo: number;
}

export class GameState {
  public mode: DimMode;
  public board: Board;
  public current: ActivePiece | null = null;
  public next: PiecePrototype;
  public hold: PiecePrototype | null = null;
  /** prevents repeated hold-swaps within the same piece. */
  public holdLocked = false;
  public stats: GameStats = { score: 0, level: 1, lines: 0, combo: 0 };
  public slice: SliceCursor;
  public paused = false;
  public gameOver = false;
  /** ms since last gravity step, accumulator. */
  public dropTimer = 0;
  public lockTimer = 0;
  /** lines just cleared (for FX); consumed each tick. */
  public lastClears: number[] = [];

  constructor(mode: DimMode = 3) {
    this.mode = mode;
    this.board = new Board(mode, BOARD_SIZES[mode]);
    this.next = randomPiece(mode);
    this.slice = { values: new Array(Math.max(0, mode - 3)).fill(0) };
    this.spawnNext();
  }

  reset(mode: DimMode = this.mode): void {
    this.mode = mode;
    this.board = new Board(mode, BOARD_SIZES[mode]);
    this.stats = { score: 0, level: 1, lines: 0, combo: 0 };
    this.slice = { values: new Array(Math.max(0, mode - 3)).fill(0) };
    this.paused = false;
    this.gameOver = false;
    this.dropTimer = 0;
    this.lockTimer = 0;
    this.next = randomPiece(mode);
    this.lastClears = [];
    this.current = null;
    this.hold = null;
    this.holdLocked = false;
    this.spawnNext();
  }

  spawnNext(): void {
    const proto = this.next;
    this.next = randomPiece(this.mode);
    const piece = spawnPiece(proto, this.board, this.mode);
    if (collides(piece, this.board)) {
      // spawn blocked → try to fit by lifting; if still blocked, game over
      this.current = null;
      this.gameOver = true;
      return;
    }
    this.current = piece;
    this.lockTimer = 0;
    this.holdLocked = false;
  }

  /**
   * Swap current piece with hold. If hold is empty, stash current and pull next.
   * Allowed once per piece — a second invocation before the new piece locks
   * is silently ignored.
   */
  swapHold(): boolean {
    if (!this.current || this.paused || this.gameOver) return false;
    if (this.holdLocked) return false;
    const stashed = piecesFor(this.mode).find((p) => p.kindId === this.current!.kindId);
    if (!stashed) return false;
    if (this.hold) {
      const incoming = this.hold;
      this.hold = stashed;
      const piece = spawnPiece(incoming, this.board, this.mode);
      if (collides(piece, this.board)) {
        // restore — swap blocked at spawn
        this.hold = incoming;
        return false;
      }
      this.current = piece;
    } else {
      this.hold = stashed;
      this.spawnNext();
    }
    this.lockTimer = 0;
    this.holdLocked = true;
    return true;
  }

  /** Time before each gravity step (ms). Slows down in higher dims. */
  dropInterval(): number {
    const baseLevel = Math.max(1, this.stats.level);
    const base = 1000 * Math.pow(0.85, baseLevel - 1);
    const dimSlow = this.mode === 3 ? 1.0 : this.mode === 4 ? 1.3 : this.mode === 5 ? 1.5 : 1.8;
    return Math.max(80, base * dimSlow);
  }

  /** Advance physics by dt milliseconds. */
  tick(dt: number): void {
    if (this.paused || this.gameOver || !this.current) return;
    this.dropTimer += dt;
    const interval = this.dropInterval();
    while (this.dropTimer >= interval) {
      this.dropTimer -= interval;
      this.gravityStep();
      if (!this.current) return;
    }
  }

  private gravityStep(): void {
    if (!this.current) return;
    const down = new Array(this.mode).fill(0);
    down[GRAVITY_AXIS] = -1;
    const moved = tryMove(this.current, down, this.board);
    if (moved) {
      this.current = moved;
      this.lockTimer = 0;
    } else {
      // accumulate lock delay; lock when soft-drop or natural delay passes
      this.lockTimer += this.dropInterval();
      if (this.lockTimer >= 500) {
        this.lockCurrent();
      }
    }
  }

  private lockCurrent(): void {
    if (!this.current) return;
    lockIn(this.current, this.board);
    const cleared = this.board.clearFullHyperplanes();
    this.lastClears = cleared;
    if (cleared.length > 0) {
      this.stats.lines += cleared.length;
      const base = [0, 100, 300, 500, 800, 1200, 1800, 2500, 3500];
      const idx = Math.min(cleared.length, base.length - 1);
      const dimBonus = 1 + (this.mode - 3) * 0.5;
      this.stats.combo++;
      this.stats.score +=
        Math.floor(base[idx] * this.stats.level * dimBonus) +
        this.stats.combo * 50;
      const newLevel = 1 + Math.floor(this.stats.lines / 10);
      this.stats.level = newLevel;
    } else {
      this.stats.combo = 0;
    }
    this.spawnNext();
  }

  // --- input actions ---

  moveBy(delta: number[]): void {
    if (!this.current || this.paused || this.gameOver) return;
    const padded = new Array(this.mode).fill(0);
    for (let i = 0; i < Math.min(delta.length, this.mode); i++) padded[i] = delta[i];
    const m = tryMove(this.current, padded, this.board);
    if (m) {
      this.current = m;
      this.lockTimer = 0;
    }
  }

  rotate(axisA: number, axisB: number, dir: 1 | -1): void {
    if (!this.current || this.paused || this.gameOver) return;
    if (axisA >= this.mode || axisB >= this.mode) return;
    const r = tryRotate(this.current, axisA, axisB, dir, this.board);
    if (r) {
      this.current = r;
      this.lockTimer = 0;
    }
  }

  softDrop(): void {
    if (!this.current || this.paused || this.gameOver) return;
    const down = new Array(this.mode).fill(0);
    down[GRAVITY_AXIS] = -1;
    const m = tryMove(this.current, down, this.board);
    if (m) {
      this.current = m;
      this.stats.score += 1;
    }
  }

  hardDrop(): void {
    if (!this.current || this.paused || this.gameOver) return;
    const { piece, distance } = hardDrop(this.current, this.board);
    this.current = piece;
    this.stats.score += distance * 2;
    this.lockCurrent();
  }

  changeMode(mode: DimMode): void {
    this.reset(mode);
  }

  setSlice(highIdx: number, value: number): void {
    if (highIdx < 0 || highIdx >= this.slice.values.length) return;
    const dimAxis = 3 + highIdx; // w=3, v=4, u=5
    const sz = this.board.size[dimAxis];
    this.slice.values[highIdx] = ((value % sz) + sz) % sz;
  }

  shiftSlice(highIdx: number, dir: 1 | -1): void {
    if (highIdx < 0 || highIdx >= this.slice.values.length) return;
    this.setSlice(highIdx, this.slice.values[highIdx] + dir);
  }

  pieceCount(): number {
    return piecesFor(this.mode).length;
  }
}
