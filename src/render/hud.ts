import type { DimMode } from "../dims/coords.js";
import type { PiecePrototype } from "../dims/pieces.js";
import { absoluteCells } from "../game/piece.js";
import type { GameState } from "../game/state.js";

export class Hud {
  private elScore: HTMLElement;
  private elLevel: HTMLElement;
  private elLines: HTMLElement;
  private elCombo: HTMLElement;
  private elMode: HTMLElement;
  private elSlice: HTMLElement;
  private elToast: HTMLElement;
  private elGameOver: HTMLElement;
  private elFinal: HTMLElement;
  private elPause: HTMLElement;
  private elHelp: HTMLElement;
  private btnRestart: HTMLButtonElement;
  private btnHelpClose: HTMLButtonElement;
  private btnHelpFab: HTMLButtonElement;
  private elStatus: HTMLElement;
  private elHoldLabel: HTMLElement;
  private elNextLabel: HTMLElement;
  private mini: HTMLCanvasElement;
  private miniCtx: CanvasRenderingContext2D;
  private holdCanvas: HTMLCanvasElement;
  private holdCtx: CanvasRenderingContext2D;
  private nextCanvas: HTMLCanvasElement;
  private nextCtx: CanvasRenderingContext2D;
  private toastTimeout: number | null = null;

  constructor() {
    this.elScore = byId("stat-score");
    this.elLevel = byId("stat-level");
    this.elLines = byId("stat-lines");
    this.elCombo = byId("stat-combo");
    this.elMode = byId("stat-mode");
    this.elSlice = byId("stat-slice");
    this.elToast = byId("toast");
    this.elGameOver = byId("gameover");
    this.elFinal = byId("final-score");
    this.elPause = byId("pause-overlay");
    this.elHelp = byId("help-overlay");
    this.btnRestart = byId("restart-btn") as HTMLButtonElement;
    this.btnHelpClose = byId("help-close") as HTMLButtonElement;
    this.btnHelpFab = byId("help-fab") as HTMLButtonElement;
    this.elStatus = byId("status-bar");
    this.elHoldLabel = byId("hold-label");
    this.elNextLabel = byId("next-label");
    this.mini = byId("minimap") as HTMLCanvasElement;
    this.holdCanvas = byId("hold-canvas") as HTMLCanvasElement;
    this.nextCanvas = byId("next-canvas") as HTMLCanvasElement;
    this.miniCtx = required2d(this.mini);
    this.holdCtx = required2d(this.holdCanvas);
    this.nextCtx = required2d(this.nextCanvas);

    this.btnHelpClose.addEventListener("click", () => this.toggleHelp(false));
    this.btnHelpFab.addEventListener("click", () => this.toggleHelp());
  }

  onRestart(fn: () => void) {
    this.btnRestart.addEventListener("click", fn);
  }

  showToast(text: string, ms = 1100) {
    this.elToast.textContent = text;
    this.elToast.classList.add("show");
    if (this.toastTimeout != null) clearTimeout(this.toastTimeout);
    this.toastTimeout = window.setTimeout(() => {
      this.elToast.classList.remove("show");
    }, ms);
  }

  setGameOver(visible: boolean, score = 0) {
    if (visible) {
      this.elGameOver.classList.add("show");
      this.elFinal.textContent = `final score: ${score}`;
    } else {
      this.elGameOver.classList.remove("show");
    }
  }

  setPaused(visible: boolean) {
    this.elPause.classList.toggle("show", visible);
  }

  toggleHelp(force?: boolean) {
    const willShow = force ?? !this.elHelp.classList.contains("show");
    this.elHelp.classList.toggle("show", willShow);
  }

  isHelpOpen(): boolean {
    return this.elHelp.classList.contains("show");
  }

  setStatus(flags: { audio: boolean; bgm: boolean; auto: boolean }) {
    const parts: string[] = [];
    parts.push(`<span class="status-pill ${flags.audio ? "on" : "off"}">♪ AUDIO ${flags.audio ? "ON" : "OFF"}</span>`);
    parts.push(`<span class="status-pill ${flags.auto ? "on" : "off"}">⚙ AUTO ${flags.auto ? "ON" : "OFF"}</span>`);
    this.elStatus.innerHTML = parts.join("");
  }

  update(state: GameState) {
    this.elScore.textContent = state.stats.score.toString();
    this.elLevel.textContent = state.stats.level.toString();
    this.elLines.textContent = state.stats.lines.toString();
    this.elCombo.textContent = state.stats.combo.toString();
    this.elMode.textContent = `${state.mode}D`;
    if (state.mode === 3) {
      this.elSlice.textContent = "single space";
    } else {
      const labels = ["w", "v", "u"];
      const parts = state.slice.values.map(
        (v, i) => `${labels[i]}=${v}/${state.board.size[3 + i] - 1}`,
      );
      this.elSlice.textContent = parts.join("  ");
    }
    this.drawMinimap(state);
    this.drawNext(state);
    this.drawHold(state);
    this.setPaused(state.paused && !state.gameOver);
  }

  // --- next / hold preview ---

  private drawPiece(
    ctx: CanvasRenderingContext2D,
    canvas: HTMLCanvasElement,
    proto: PiecePrototype | null,
  ) {
    const W = canvas.width;
    const H = canvas.height;
    ctx.clearRect(0, 0, W, H);
    if (!proto) return;

    // project blocks onto an iso 2D grid: x → +i, z → +j, w → tint, v → x-shift, u → y-shift
    const cells = proto.blocks;
    const dim = cells[0]?.length ?? 3;
    // bounds in (x, z)
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const b of cells) {
      const x = b[0];
      const z = b[2] ?? 0;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (z < minZ) minZ = z;
      if (z > maxZ) maxZ = z;
    }
    if (!isFinite(minX)) return;
    // also account for the y axis spread visualised vertically
    let minY = Infinity, maxY = -Infinity;
    for (const b of cells) {
      const y = b[1] ?? 0;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    const spanX = (maxX - minX) + 1;
    const spanZ = (maxZ - minZ) + 1;
    const spanY = (maxY - minY) + 1;

    // iso-ish: u = (x - z) * cell, v = -(x + z) * 0.5 * cell - y * cell
    const cell = Math.min(W / (spanX + spanZ + 1), H / (spanY + (spanX + spanZ) * 0.5 + 1)) * 0.85;
    const cx = W / 2;
    const cy = H / 2 + spanY * cell * 0.25;

    // sort by z asc then x asc then y asc so back cells draw first
    const ordered = cells
      .map((b) => ({ x: b[0] - minX, y: (b[1] ?? 0) - minY, z: (b[2] ?? 0) - minZ, raw: b }))
      .sort((a, b) => (b.z - a.z) || (a.x - b.x) || (a.y - b.y));

    const baseColor = `#${proto.colorHex.toString(16).padStart(6, "0")}`;
    const top = lighten(baseColor, 0.25);
    const right = darken(baseColor, 0.2);

    for (const c of ordered) {
      const ox = (c.x - (spanX - 1) / 2) - (c.z - (spanZ - 1) / 2);
      const oy = (c.x - (spanX - 1) / 2) + (c.z - (spanZ - 1) / 2);
      const px = cx + ox * cell * 0.7;
      const py = cy + oy * cell * 0.35 - c.y * cell * 0.7;

      // diamond top + two parallelograms (front/right) for a quick iso cube
      drawIsoCube(ctx, px, py, cell, baseColor, top, right);
    }

    // tag for hyper axes
    if (dim > 3) {
      ctx.fillStyle = "rgba(199,125,255,0.85)";
      ctx.font = "10px ui-monospace, monospace";
      ctx.textAlign = "right";
      ctx.fillText(proto.label, W - 6, H - 6);
    }
  }

  private drawNext(state: GameState) {
    this.drawPiece(this.nextCtx, this.nextCanvas, state.next);
    this.elNextLabel.textContent = state.next.label;
  }

  private drawHold(state: GameState) {
    this.drawPiece(this.holdCtx, this.holdCanvas, state.hold);
    if (state.hold) {
      this.elHoldLabel.textContent = state.holdLocked
        ? `${state.hold.label} · LOCKED`
        : state.hold.label;
      this.elHoldLabel.style.opacity = state.holdLocked ? "0.4" : "0.85";
    } else {
      this.elHoldLabel.textContent = "— empty —";
      this.elHoldLabel.style.opacity = "0.5";
    }
  }

  // --- minimap ---

  private drawMinimap(state: GameState) {
    const ctx = this.miniCtx;
    const W = this.mini.width;
    const H = this.mini.height;
    ctx.clearRect(0, 0, W, H);

    if (state.mode === 3) {
      ctx.fillStyle = "rgba(255,255,255,0.06)";
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = "#5cf2ff";
      ctx.font = "11px ui-monospace, monospace";
      ctx.textAlign = "center";
      ctx.fillText("3D — no extra slices", W / 2, H / 2);
      return;
    }

    const dim = state.mode as DimMode;
    const wSize = state.board.size[3];
    const vSize = dim >= 5 ? state.board.size[4] : 1;
    const uSize = dim >= 6 ? state.board.size[5] : 1;

    const counts: number[][] = [];
    for (let wi = 0; wi < wSize; wi++) counts.push(new Array(vSize).fill(0));
    state.board.forEachCell((coord, _i, val) => {
      if (val === 0) return;
      const wi = coord[3];
      const vi = dim >= 5 ? coord[4] : 0;
      counts[wi][vi]++;
    });
    let max = 1;
    for (let wi = 0; wi < wSize; wi++) {
      for (let vi = 0; vi < vSize; vi++) {
        if (counts[wi][vi] > max) max = counts[wi][vi];
      }
    }

    const cellW = W / wSize;
    const cellH = H / vSize;
    for (let wi = 0; wi < wSize; wi++) {
      for (let vi = 0; vi < vSize; vi++) {
        const t = Math.min(1, counts[wi][vi] / Math.max(1, max));
        const a = 0.08 + t * 0.85;
        ctx.fillStyle = `rgba(92,242,255,${a.toFixed(3)})`;
        ctx.fillRect(wi * cellW, (vSize - 1 - vi) * cellH, cellW - 1, cellH - 1);
      }
    }
    // mark every hyper-cell occupied by the active piece (so the player can
    // see across which slices the piece extends)
    if (state.current) {
      const seen = new Set<string>();
      for (const c of absoluteCells(state.current)) {
        const cw = c[3] ?? 0;
        const cv = dim >= 5 ? (c[4] ?? 0) : 0;
        const cu = dim >= 6 ? (c[5] ?? 0) : 0;
        const key = `${cw},${cv},${cu}`;
        if (seen.has(key)) continue;
        seen.add(key);
        // dim cells outside the current u slice
        const isOnU = dim < 6 || cu === (state.slice.values[2] ?? 0);
        ctx.fillStyle = isOnU ? "rgba(255,107,107,0.92)" : "rgba(255,107,107,0.35)";
        const px = cw * cellW + cellW / 2;
        const py = (vSize - 1 - cv) * cellH + cellH / 2;
        const r = Math.min(cellW, cellH) * 0.18 + 1.5;
        ctx.beginPath();
        ctx.arc(px, py, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    const sliceW = state.slice.values[0] ?? 0;
    const sliceV = state.slice.values[1] ?? 0;
    ctx.strokeStyle = "#ffd166";
    ctx.lineWidth = 2;
    ctx.strokeRect(
      sliceW * cellW + 1,
      (vSize - 1 - sliceV) * cellH + 1,
      cellW - 3,
      cellH - 3,
    );

    // axis labels
    ctx.fillStyle = "rgba(199,125,255,0.85)";
    ctx.font = "9px ui-monospace, monospace";
    ctx.textAlign = "left";
    ctx.fillText("w →", 4, H - 4);
    if (dim >= 5) {
      ctx.save();
      ctx.translate(4, H - 12);
      ctx.rotate(-Math.PI / 2);
      ctx.fillText("v →", 0, 0);
      ctx.restore();
    }

    if (dim >= 6) {
      const dotR = 4;
      for (let ui = 0; ui < uSize; ui++) {
        ctx.beginPath();
        ctx.arc(W - 8 - ui * (dotR * 2 + 2), 8, dotR, 0, Math.PI * 2);
        ctx.fillStyle = ui === (state.slice.values[2] ?? 0) ? "#ffd166" : "rgba(255,255,255,0.25)";
        ctx.fill();
      }
      ctx.fillStyle = "rgba(255,255,255,0.5)";
      ctx.font = "8px ui-monospace, monospace";
      ctx.textAlign = "right";
      ctx.fillText("u", W - 4, 22);
    }
  }
}

function byId(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`#${id} not found`);
  return el;
}

function required2d(c: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("2d context unavailable");
  return ctx;
}

function drawIsoCube(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  cell: number,
  front: string,
  top: string,
  right: string,
) {
  const w = cell * 0.7;
  const h = cell * 0.35;
  // top diamond
  ctx.beginPath();
  ctx.moveTo(px, py - h);
  ctx.lineTo(px + w, py);
  ctx.lineTo(px, py + h);
  ctx.lineTo(px - w, py);
  ctx.closePath();
  ctx.fillStyle = top;
  ctx.fill();
  // left face
  ctx.beginPath();
  ctx.moveTo(px - w, py);
  ctx.lineTo(px, py + h);
  ctx.lineTo(px, py + h + cell * 0.7);
  ctx.lineTo(px - w, py + cell * 0.7);
  ctx.closePath();
  ctx.fillStyle = front;
  ctx.fill();
  // right face
  ctx.beginPath();
  ctx.moveTo(px + w, py);
  ctx.lineTo(px, py + h);
  ctx.lineTo(px, py + h + cell * 0.7);
  ctx.lineTo(px + w, py + cell * 0.7);
  ctx.closePath();
  ctx.fillStyle = right;
  ctx.fill();
  // outline
  ctx.strokeStyle = "rgba(0,0,0,0.5)";
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.moveTo(px, py - h);
  ctx.lineTo(px + w, py);
  ctx.lineTo(px, py + h);
  ctx.lineTo(px - w, py);
  ctx.closePath();
  ctx.stroke();
}

function lighten(hex: string, amt: number): string {
  return mix(hex, "#ffffff", amt);
}
function darken(hex: string, amt: number): string {
  return mix(hex, "#000000", amt);
}
function mix(a: string, b: string, t: number): string {
  const ar = parseInt(a.slice(1, 3), 16);
  const ag = parseInt(a.slice(3, 5), 16);
  const ab = parseInt(a.slice(5, 7), 16);
  const br = parseInt(b.slice(1, 3), 16);
  const bg = parseInt(b.slice(3, 5), 16);
  const bb = parseInt(b.slice(5, 7), 16);
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return `#${[(r << 16) | (g << 8) | bl].map((n) => n.toString(16).padStart(6, "0"))[0]}`;
}
