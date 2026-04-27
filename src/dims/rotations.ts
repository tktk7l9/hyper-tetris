import type { CellCoord, DimMode } from "./coords.js";

export type RotationDir = 1 | -1;

export function rotate(
  coord: CellCoord,
  axisA: number,
  axisB: number,
  dir: RotationDir,
): CellCoord {
  const out = coord.slice();
  const a = coord[axisA];
  const b = coord[axisB];
  if (dir === 1) {
    out[axisA] = -b;
    out[axisB] = a;
  } else {
    out[axisA] = b;
    out[axisB] = -a;
  }
  return out;
}

export function rotateAll(
  blocks: CellCoord[],
  axisA: number,
  axisB: number,
  dir: RotationDir,
): CellCoord[] {
  return blocks.map((b) => rotate(b, axisA, axisB, dir));
}

/** Re-anchor rotated blocks so that all coords are >= 0 on every axis. */
export function normalizeOrigin(blocks: CellCoord[]): {
  blocks: CellCoord[];
  shift: CellCoord;
} {
  if (blocks.length === 0) return { blocks: [], shift: [] };
  const dim = blocks[0].length;
  const min = new Array(dim).fill(Infinity);
  for (const b of blocks) {
    for (let i = 0; i < dim; i++) {
      if (b[i] < min[i]) min[i] = b[i];
    }
  }
  const shift = min.map((v) => -v);
  const out = blocks.map((b) => b.map((v, i) => v + shift[i]));
  return { blocks: out, shift };
}

export interface RotationPlane {
  axisA: number;
  axisB: number;
  label: string;
  key: string; // KeyboardEvent.code
}

/** Active rotation planes per mode (matches HUD/keymap in the plan). */
export function rotationPlanesFor(dim: DimMode): RotationPlane[] {
  const planes: RotationPlane[] = [
    { axisA: 0, axisB: 1, label: "XY", key: "KeyQ" },
    { axisA: 1, axisB: 2, label: "YZ", key: "KeyW" },
    { axisA: 2, axisB: 0, label: "ZX", key: "KeyE" },
  ];
  if (dim >= 4) {
    planes.push({ axisA: 0, axisB: 3, label: "XW", key: "KeyA" });
    planes.push({ axisA: 1, axisB: 3, label: "YW", key: "KeyS" });
    planes.push({ axisA: 2, axisB: 3, label: "ZW", key: "KeyD" });
  }
  if (dim >= 5) {
    planes.push({ axisA: 0, axisB: 4, label: "XV", key: "KeyZ" });
    planes.push({ axisA: 1, axisB: 4, label: "YV", key: "KeyX" });
  }
  if (dim >= 6) {
    planes.push({ axisA: 0, axisB: 5, label: "XU", key: "KeyC" });
    planes.push({ axisA: 2, axisB: 5, label: "ZU", key: "KeyV" });
  }
  return planes;
}
