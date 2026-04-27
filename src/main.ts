import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { piecesFor } from "./dims/pieces.js";
import { GameState } from "./game/state.js";
import { BoardView } from "./render/board-view.js";
import { EffectsLayer } from "./render/effects.js";
import { Hud } from "./render/hud.js";
import { createRenderContext } from "./render/renderer.js";
import { attachControls } from "./input/controls.js";
import { GRAVITY_AXIS, type DimMode } from "./dims/coords.js";
import { AudioEngine } from "./audio/audio.js";
import { AutoPilot } from "./ai/autopilot.js";

const app = document.getElementById("app");
if (!app) throw new Error("#app missing");

const ctx = createRenderContext(app);
const orbit = new OrbitControls(ctx.camera, ctx.renderer.domElement);
orbit.target.set(0, 5, 0);
orbit.enableDamping = true;
orbit.dampingFactor = 0.08;
orbit.minDistance = 12;
orbit.maxDistance = 160;
orbit.maxPolarAngle = Math.PI * 0.62;

const state = new GameState(3);
const view = new BoardView();
ctx.scene.add(view.group);
const fx = new EffectsLayer();
ctx.scene.add(fx.group);

const hud = new Hud();
const audio = new AudioEngine();
const autopilot = new AutoPilot();

function refreshStatus() {
  hud.setStatus({
    audio: audio.bgmEnabled || audio.sfxEnabled,
    bgm: audio.bgmEnabled,
    auto: autopilot.enabled,
  });
}
refreshStatus();

hud.onRestart(() => {
  state.reset(state.mode);
  hud.setGameOver(false);
  audio.playSfx("mode");
});

function syncBoardForMode() {
  view.resizeForBoard(state.board.size);
  orbit.target.set(0, state.board.size[GRAVITY_AXIS] / 2, 0);
  // satellite wells extend the visible footprint outward, so we pull the
  // camera back further as dimensions grow.
  const dist = state.mode === 3 ? 28
    : state.mode === 4 ? 52
    : state.mode === 5 ? 68
    : 88;
  const yLift = state.mode >= 6
    ? state.board.size[GRAVITY_AXIS] * 1.6
    : state.board.size[GRAVITY_AXIS] * 1.3;
  ctx.camera.position.set(dist * 0.7, yLift, dist);
}
syncBoardForMode();

const kindColorMap = new Map<number, number>();
function rebuildKindColors() {
  kindColorMap.clear();
  for (const p of piecesFor(state.mode)) kindColorMap.set(p.kindId, p.colorHex);
}
rebuildKindColors();

const modeNames: Record<DimMode, string> = { 3: "3D", 4: "4D", 5: "5D", 6: "6D" };

attachControls(state, {
  onAnyKey: () => {
    audio.init();
    audio.resume();
  },
  onModeChange: (mode) => {
    syncBoardForMode();
    rebuildKindColors();
    hud.showToast(`MODE ${modeNames[mode]}`, 1300);
    hud.setGameOver(false);
    audio.playSfx("mode");
  },
  onPause: (paused) => {
    if (!paused) hud.showToast("GO", 700);
    audio.playSfx("hold");
  },
  onHardDrop: () => {
    audio.playSfx("drop");
  },
  onMove: () => audio.playSfx("move"),
  onRotate: () => audio.playSfx("rotate"),
  onHold: (ok) => {
    hud.showToast(ok ? "HOLD" : "HOLD ×", ok ? 600 : 500);
    if (ok) audio.playSfx("hold");
  },
  onHelpToggle: () => hud.toggleHelp(),
  onRestart: () => {
    state.reset(state.mode);
    hud.setGameOver(false);
    hud.showToast("RESTART", 700);
    audio.playSfx("mode");
  },
  onAudioToggle: () => {
    audio.init();
    audio.resume();
    const on = !(audio.bgmEnabled && audio.sfxEnabled);
    audio.setBgmEnabled(on);
    audio.setSfxEnabled(on);
    refreshStatus();
    hud.showToast(on ? "AUDIO ON" : "AUDIO OFF", 700);
  },
  onAutoToggle: () => {
    const on = autopilot.toggle();
    refreshStatus();
    hud.showToast(on ? "AUTO ON" : "AUTO OFF", 700);
    audio.playSfx("hold");
  },
});

// game loop with fixed-step accumulator
let last = performance.now();
let prevClears = 0;
let prevMode = state.mode;
let prevGameOver = false;
let prevPieceRef: typeof state.current = null;
let prevLines = 0;

function frame(t: number) {
  const dt = Math.min(64, t - last);
  last = t;

  autopilot.step(state, t);
  state.tick(dt);

  // SFX: piece locked (current changed and lines didn't change → just lock)
  if (state.current !== prevPieceRef) {
    if (prevPieceRef && state.stats.lines === prevLines && !state.gameOver) {
      audio.playSfx("lock");
    }
    prevPieceRef = state.current;
  }

  // detect newly cleared lines for FX
  if (state.lastClears.length > prevClears && state.lastClears.length > 0) {
    const sx = state.board.size[0];
    const sz = state.board.size[2];
    for (const y of state.lastClears) {
      const wpos = new THREE.Vector3(0, (y + 0.5), 0);
      for (let i = 0; i < 4; i++) {
        const off = new THREE.Vector3(
          (Math.random() - 0.5) * sx,
          0,
          (Math.random() - 0.5) * sz,
        );
        fx.spawnBurst(wpos.clone().add(off), 0x5cf2ff, 12);
      }
    }
    const isHyper = state.lastClears.length >= 4;
    hud.showToast(
      isHyper ? `${state.lastClears.length} × HYPER!` : `${state.lastClears.length} CLEAR`,
      900,
    );
    audio.playSfx(isHyper ? "hyperclear" : "clear");
    state.lastClears = [];
    prevClears = 0;
  }
  prevLines = state.stats.lines;

  if (state.mode !== prevMode) {
    prevMode = state.mode;
  }

  view.update(state, (k) => kindColorMap.get(k) ?? 0xffffff);
  fx.update(dt);
  ctx.background.update(dt);
  hud.update(state);

  if (state.gameOver) {
    hud.setGameOver(true, state.stats.score);
    if (!prevGameOver) {
      audio.playSfx("gameover");
      autopilot.setEnabled(false);
      refreshStatus();
    }
  }
  prevGameOver = state.gameOver;

  if (state.paused) {
    orbit.target.y = state.board.size[GRAVITY_AXIS] / 2;
  }
  orbit.update();
  ctx.render();

  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);

// resume audio context on first pointer/click as well (browser policy)
const kickAudio = () => {
  audio.init();
  audio.resume();
};
window.addEventListener("pointerdown", kickAudio, { once: true });

// expose for debug
(window as unknown as { __hyperTetris?: unknown }).__hyperTetris = {
  state, ctx, view, fx, audio, autopilot,
};
