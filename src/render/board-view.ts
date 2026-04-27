import * as THREE from "three";
import { GRAVITY_AXIS } from "../dims/coords.js";
import type { Board } from "../game/board.js";
import { absoluteCells, hardDrop } from "../game/piece.js";
import type { GameState } from "../game/state.js";

const CELL = 1.0;
/** Gap (in cells) between the main well and each satellite slice well. */
const SAT_GAP = 2;

const dummy = new THREE.Object3D();
const tmpColor = new THREE.Color();

interface SatelliteOutline {
  line: THREE.LineSegments;
  /** axis index in coord space: 3=w, 4=v, 5=u */
  axis: number;
  /** -1 (slice−1) or +1 (slice+1) */
  dir: number;
}

export class BoardView {
  public group: THREE.Group;
  private solidMesh: THREE.InstancedMesh;
  private ghostMesh: THREE.InstancedMesh;
  private activeMesh: THREE.InstancedMesh;
  private outline: THREE.LineSegments;
  private satelliteOutlines: SatelliteOutline[] = [];
  private floor: THREE.Mesh;
  private capacity: number;
  private currentBoardSize: number[];

  constructor(initialBoardCapacity = 6000) {
    this.group = new THREE.Group();
    this.capacity = initialBoardCapacity;
    this.currentBoardSize = [10, 20, 10];

    const geom = new THREE.BoxGeometry(CELL * 0.94, CELL * 0.94, CELL * 0.94);

    const solidMat = new THREE.MeshStandardMaterial({
      vertexColors: false,
      metalness: 0.35,
      roughness: 0.45,
      emissiveIntensity: 0.5,
    });
    this.solidMesh = new THREE.InstancedMesh(geom, solidMat, this.capacity);
    this.solidMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.solidMesh.count = 0;
    this.solidMesh.frustumCulled = false;
    if (!this.solidMesh.instanceColor) {
      this.solidMesh.instanceColor = new THREE.InstancedBufferAttribute(
        new Float32Array(this.capacity * 3),
        3,
      );
    }
    this.group.add(this.solidMesh);

    const ghostMat = new THREE.MeshStandardMaterial({
      metalness: 0.2,
      roughness: 0.6,
      transparent: true,
      opacity: 0.78,
      emissiveIntensity: 0.3,
    });
    this.ghostMesh = new THREE.InstancedMesh(geom, ghostMat, this.capacity);
    this.ghostMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.ghostMesh.count = 0;
    this.ghostMesh.frustumCulled = false;
    if (!this.ghostMesh.instanceColor) {
      this.ghostMesh.instanceColor = new THREE.InstancedBufferAttribute(
        new Float32Array(this.capacity * 3),
        3,
      );
    }
    this.group.add(this.ghostMesh);

    const activeMat = new THREE.MeshStandardMaterial({
      metalness: 0.6,
      roughness: 0.2,
      emissiveIntensity: 1.4,
    });
    this.activeMesh = new THREE.InstancedMesh(geom, activeMat, 64);
    this.activeMesh.count = 0;
    this.activeMesh.frustumCulled = false;
    if (!this.activeMesh.instanceColor) {
      this.activeMesh.instanceColor = new THREE.InstancedBufferAttribute(
        new Float32Array(64 * 3),
        3,
      );
    }
    this.group.add(this.activeMesh);

    // outline (well boundary)
    this.outline = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)),
      new THREE.LineBasicMaterial({ color: 0x5cf2ff, transparent: true, opacity: 0.45 }),
    );
    this.group.add(this.outline);

    // soft floor disk
    this.floor = new THREE.Mesh(
      new THREE.CircleGeometry(20, 64),
      new THREE.MeshBasicMaterial({
        color: 0x121634,
        transparent: true,
        opacity: 0.35,
        side: THREE.DoubleSide,
      }),
    );
    this.floor.rotation.x = -Math.PI / 2;
    this.floor.position.y = -0.02;
    this.group.add(this.floor);
  }

  resizeForBoard(size: number[]) {
    this.currentBoardSize = size;
    const sx = size[0] * CELL;
    const sy = size[1] * CELL;
    const sz = size[2] * CELL;
    this.outline.geometry.dispose();
    this.outline.geometry = new THREE.EdgesGeometry(
      new THREE.BoxGeometry(sx, sy, sz),
    );
    this.outline.position.set(0, sy / 2, 0);

    const floorR = Math.max(sx, sz) * 1.1;
    this.floor.geometry.dispose();
    this.floor.geometry = new THREE.CircleGeometry(floorR, 64);

    this.rebuildSatelliteOutlines(size);
  }

  /**
   * Build a faint outlined frame for each adjacent hyper-slice (±w, ±v, ±u),
   * placed beside / above / below the main well so the player can see the
   * 4D+ structure laid out in space rather than overlapping the main well.
   */
  private rebuildSatelliteOutlines(size: number[]) {
    for (const s of this.satelliteOutlines) {
      s.line.geometry.dispose();
      this.group.remove(s.line);
    }
    this.satelliteOutlines = [];

    const sx = size[0] * CELL;
    const sy = size[1] * CELL;
    const sz = size[2] * CELL;
    const off = new THREE.Vector3();

    for (let axis = 3; axis < size.length; axis++) {
      for (const dir of [-1, 1] as const) {
        this.satelliteOffset(axis, dir, size, off);
        // axis-coded color hint (w=violet, v=peach, u=lime)
        const col = axis === 3 ? 0xc77dff : axis === 4 ? 0xff9c6b : 0x9bff7d;
        const line = new THREE.LineSegments(
          new THREE.EdgesGeometry(new THREE.BoxGeometry(sx, sy, sz)),
          new THREE.LineBasicMaterial({
            color: col,
            transparent: true,
            opacity: 0.22,
          }),
        );
        line.position.set(off.x, sy / 2 + off.y, off.z);
        this.group.add(line);
        this.satelliteOutlines.push({ line, axis, dir });
      }
    }
  }

  /**
   * Spatial offset to apply when rendering cells whose hyper-axis differs
   * from the current slice. Each axis is laid out on its own world direction:
   *   axis 3 (w) → ±X    axis 4 (v) → ±Z    axis 5 (u) → ±Y
   */
  private satelliteOffset(axis: number, dir: number, size: number[], outV: THREE.Vector3) {
    outV.set(0, 0, 0);
    if (axis === 3) outV.x = dir * (size[0] + SAT_GAP) * CELL;
    else if (axis === 4) outV.z = dir * (size[2] + SAT_GAP) * CELL;
    else if (axis === 5) outV.y = dir * (size[1] + SAT_GAP) * CELL;
  }

  /** Convert a board-local cell coord to world position. Cells in adjacent
   * hyper-slices are offset to their satellite well location. */
  private cellWorld(coord: number[], sliceVals: number[], outV: THREE.Vector3) {
    const size = this.currentBoardSize;
    outV.set(
      (coord[0] - size[0] / 2 + 0.5) * CELL,
      (coord[GRAVITY_AXIS] + 0.5) * CELL,
      (coord[2] - size[2] / 2 + 0.5) * CELL,
    );
    for (let i = 3; i < coord.length; i++) {
      const d = coord[i] - (sliceVals[i - 3] ?? 0);
      if (d === 0) continue;
      if (i === 3) outV.x += d * (size[0] + SAT_GAP) * CELL;
      else if (i === 4) outV.z += d * (size[2] + SAT_GAP) * CELL;
      else if (i === 5) outV.y += d * (size[1] + SAT_GAP) * CELL;
    }
  }

  /** Color shift derived from high-axis offsets (w,v,u). */
  private highDimTint(
    base: THREE.Color,
    coord: number[],
    sliceVals: number[],
    boardSize: number[],
    out: THREE.Color,
  ) {
    const hsl = { h: 0, s: 0, l: 0 };
    base.getHSL(hsl);
    let hShift = 0;
    let lShift = 0;
    let sShift = 0;
    for (let i = 3; i < coord.length; i++) {
      const sz = boardSize[i] || 1;
      const offset = coord[i] - (sliceVals[i - 3] ?? 0);
      hShift += offset * (i === 3 ? 0.09 : i === 4 ? 0.07 : 0.05);
      lShift += (coord[i] / sz - 0.5) * 0.18;
      sShift += (coord[i] / sz - 0.5) * 0.1;
    }
    out.setHSL(
      ((hsl.h + hShift) % 1 + 1) % 1,
      THREE.MathUtils.clamp(hsl.s + sShift, 0.1, 1),
      THREE.MathUtils.clamp(hsl.l + lShift, 0.18, 0.85),
    );
  }

  /**
   * Sync rendered instances with the current state. Re-iterates every cell;
   * cheap because boards are small (≤ ~5k cells in 6D).
   */
  update(state: GameState, kindColor: (kindId: number) => number) {
    const board: Board = state.board;
    const dim = board.size.length;
    const sliceVals = state.slice.values;

    // Toggle satellite frame visibility based on whether slice±1 is in bounds
    for (const s of this.satelliteOutlines) {
      const axisIdx = s.axis - 3;
      const target = (sliceVals[axisIdx] ?? 0) + s.dir;
      s.line.visible = target >= 0 && target < board.size[s.axis];
    }

    let solidCount = 0;
    let ghostCount = 0;
    const v = new THREE.Vector3();
    const baseColor = new THREE.Color();
    const finalColor = new THREE.Color();

    board.forEachCell((coord, _idx, value) => {
      if (value === 0) return;
      // determine layer: 0 = current slice, 1 = adjacent (±1 in any high axis)
      let layer = 0;
      for (let i = 3; i < dim; i++) {
        const d = Math.abs(coord[i] - sliceVals[i - 3]);
        if (d === 0) continue;
        if (d === 1 && layer < 1) layer = 1;
        else { layer = 99; break; }
      }
      if (layer >= 99) return;

      this.cellWorld(coord, sliceVals, v);
      dummy.position.copy(v);
      dummy.rotation.set(0, 0, 0);
      // satellite cells are full-size now (they live in their own well),
      // just slightly trimmed so the seam between wells reads cleanly.
      dummy.scale.setScalar(layer === 0 ? 1.0 : 0.92);
      dummy.updateMatrix();

      baseColor.setHex(kindColor(value));
      this.highDimTint(baseColor, coord, sliceVals, board.size, finalColor);

      if (layer === 0) {
        if (solidCount < this.capacity) {
          this.solidMesh.setMatrixAt(solidCount, dummy.matrix);
          this.solidMesh.setColorAt(solidCount, finalColor);
          solidCount++;
        }
      } else {
        if (ghostCount < this.capacity) {
          this.ghostMesh.setMatrixAt(ghostCount, dummy.matrix);
          this.ghostMesh.setColorAt(ghostCount, finalColor);
          ghostCount++;
        }
      }
    });

    this.solidMesh.count = solidCount;
    this.ghostMesh.count = ghostCount;
    this.solidMesh.instanceMatrix.needsUpdate = true;
    this.ghostMesh.instanceMatrix.needsUpdate = true;
    if (this.solidMesh.instanceColor) this.solidMesh.instanceColor.needsUpdate = true;
    if (this.ghostMesh.instanceColor) this.ghostMesh.instanceColor.needsUpdate = true;

    // active piece + landing ghost
    let activeCount = 0;
    if (state.current && !state.gameOver) {
      const piece = state.current;
      // landing preview
      const preview = hardDrop(piece, board);
      const previewCells = absoluteCells(preview.piece);
      for (const c of previewCells) {
        // landing preview is only meaningful inside the current/adjacent
        // slice (one axis off by ≤1, others matching).
        let layer = 0;
        for (let i = 3; i < dim; i++) {
          const d = Math.abs(c[i] - sliceVals[i - 3]);
          if (d === 0) continue;
          if (d === 1 && layer < 1) layer = 1;
          else { layer = 99; break; }
        }
        if (layer >= 99) continue;
        this.cellWorld(c, sliceVals, v);
        dummy.position.copy(v);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.setScalar(layer === 0 ? 0.55 : 0.5);
        dummy.updateMatrix();
        baseColor.setHex(piece.colorHex);
        finalColor.copy(baseColor).multiplyScalar(0.5);
        if (activeCount < 64) {
          this.activeMesh.setMatrixAt(activeCount, dummy.matrix);
          this.activeMesh.setColorAt(activeCount, finalColor);
          activeCount++;
        }
      }
      // current piece
      const cells = absoluteCells(piece);
      for (const c of cells) {
        let layer = 0;
        for (let i = 3; i < dim; i++) {
          const d = Math.abs(c[i] - sliceVals[i - 3]);
          if (d === 0) continue;
          if (d === 1 && layer < 1) layer = 1;
          else { layer = 99; break; }
        }
        if (layer >= 99) continue;
        this.cellWorld(c, sliceVals, v);
        dummy.position.copy(v);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.setScalar(layer === 0 ? 1.05 : 0.95);
        dummy.updateMatrix();
        baseColor.setHex(piece.colorHex);
        this.highDimTint(baseColor, c, sliceVals, board.size, finalColor);
        if (activeCount < 64) {
          this.activeMesh.setMatrixAt(activeCount, dummy.matrix);
          this.activeMesh.setColorAt(activeCount, finalColor);
          activeCount++;
        }
      }
    }
    this.activeMesh.count = activeCount;
    this.activeMesh.instanceMatrix.needsUpdate = true;
    if (this.activeMesh.instanceColor) this.activeMesh.instanceColor.needsUpdate = true;

    // emissive material trick: copy color into emissive via per-instance color (basic shader uses .color)
    // For MeshStandardMaterial, instanceColor multiplies .color; emissive stays constant. We piggyback by
    // boosting solidMat.emissive faintly — left as default (cyan-ish accent via lights).
    void tmpColor;
  }
}
