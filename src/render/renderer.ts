import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";

export interface RenderContext {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  composer: EffectComposer;
  bloom: UnrealBloomPass;
  background: BackgroundLayer;
  resize(): void;
  render(): void;
}

export interface BackgroundLayer {
  group: THREE.Group;
  update(dt: number): void;
}

export function createRenderContext(parent: HTMLElement): RenderContext {
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setClearColor(0x05060c, 0);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  parent.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x05060c, 0.012);

  const camera = new THREE.PerspectiveCamera(
    55,
    window.innerWidth / window.innerHeight,
    0.1,
    1200,
  );
  camera.position.set(18, 22, 28);
  camera.lookAt(0, 6, 0);

  // lights
  const ambient = new THREE.AmbientLight(0x6e7bb0, 0.55);
  scene.add(ambient);

  const key = new THREE.DirectionalLight(0xffffff, 1.0);
  key.position.set(20, 30, 18);
  scene.add(key);

  const rim = new THREE.PointLight(0x5cf2ff, 1.4, 80, 1.4);
  rim.position.set(-12, 14, -10);
  scene.add(rim);

  const accent = new THREE.PointLight(0xff70a6, 0.9, 60, 1.6);
  accent.position.set(14, 6, 14);
  scene.add(accent);

  const background = createBackground();
  scene.add(background.group);

  // post processing
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    0.85, // strength
    0.95, // radius
    0.16, // threshold
  );
  composer.addPass(bloom);

  function resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    renderer.setSize(w, h);
    composer.setSize(w, h);
    bloom.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  window.addEventListener("resize", resize);

  return {
    renderer,
    scene,
    camera,
    composer,
    bloom,
    background,
    resize,
    render: () => composer.render(),
  };
}

/**
 * Build a layered backdrop:
 *  - inside-out gradient sky sphere (deep navy → magenta horizon)
 *  - far star-field (~1200 points, slow drift)
 *  - near sparkle layer (fewer, brighter, twinkling)
 *  - subtle ground grid that fades into fog
 */
function createBackground(): BackgroundLayer {
  const group = new THREE.Group();

  // --- sky sphere with vertex-color gradient ---
  const skyGeom = new THREE.SphereGeometry(500, 32, 24);
  const colors = new Float32Array(skyGeom.attributes.position.count * 3);
  const top = new THREE.Color(0x05060c);
  const mid = new THREE.Color(0x141a3a);
  const horizon = new THREE.Color(0x3a1454);
  const tmp = new THREE.Color();
  const pos = skyGeom.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i) / 500; // -1..1
    if (y > 0) {
      tmp.copy(mid).lerp(top, Math.min(1, y * 1.2));
    } else {
      tmp.copy(mid).lerp(horizon, Math.min(1, -y * 1.4));
    }
    colors[i * 3] = tmp.r;
    colors[i * 3 + 1] = tmp.g;
    colors[i * 3 + 2] = tmp.b;
  }
  skyGeom.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  const sky = new THREE.Mesh(
    skyGeom,
    new THREE.MeshBasicMaterial({
      vertexColors: true,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    }),
  );
  group.add(sky);

  // --- far star-field ---
  const starCount = 1200;
  const starGeom = new THREE.BufferGeometry();
  const starPos = new Float32Array(starCount * 3);
  const starCol = new Float32Array(starCount * 3);
  for (let i = 0; i < starCount; i++) {
    // uniform points on a sphere shell
    const u = Math.random();
    const v = Math.random();
    const theta = 2 * Math.PI * u;
    const phi = Math.acos(2 * v - 1);
    const r = 280 + Math.random() * 120;
    starPos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    starPos[i * 3 + 1] = r * Math.cos(phi);
    starPos[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
    // tint between white, cyan, magenta
    const t = Math.random();
    const c = new THREE.Color();
    if (t < 0.7) c.setHSL(0, 0, 0.7 + Math.random() * 0.3);
    else if (t < 0.88) c.setHSL(0.52, 0.7, 0.7);
    else c.setHSL(0.88, 0.6, 0.7);
    starCol[i * 3] = c.r;
    starCol[i * 3 + 1] = c.g;
    starCol[i * 3 + 2] = c.b;
  }
  starGeom.setAttribute("position", new THREE.BufferAttribute(starPos, 3));
  starGeom.setAttribute("color", new THREE.BufferAttribute(starCol, 3));
  const stars = new THREE.Points(
    starGeom,
    new THREE.PointsMaterial({
      size: 1.4,
      vertexColors: true,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
      sizeAttenuation: true,
      fog: false,
    }),
  );
  group.add(stars);

  // --- near sparkle layer (twinkles via material opacity oscillation) ---
  const sparkCount = 90;
  const sparkGeom = new THREE.BufferGeometry();
  const sparkPos = new Float32Array(sparkCount * 3);
  for (let i = 0; i < sparkCount; i++) {
    const u = Math.random();
    const v = Math.random();
    const theta = 2 * Math.PI * u;
    const phi = Math.acos(2 * v - 1);
    const r = 90 + Math.random() * 60;
    sparkPos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    sparkPos[i * 3 + 1] = Math.abs(r * Math.cos(phi)) * 0.4 + 4; // bias above
    sparkPos[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
  }
  sparkGeom.setAttribute("position", new THREE.BufferAttribute(sparkPos, 3));
  const sparkMat = new THREE.PointsMaterial({
    size: 3.2,
    color: 0x9be7ff,
    transparent: true,
    opacity: 0.7,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: false,
  });
  const sparks = new THREE.Points(sparkGeom, sparkMat);
  group.add(sparks);

  // --- ground grid that fades into fog ---
  const grid = new THREE.GridHelper(180, 60, 0x5cf2ff, 0x1a2148);
  const gridMat = grid.material as THREE.Material | THREE.Material[];
  if (Array.isArray(gridMat)) {
    for (const m of gridMat) {
      m.transparent = true;
      (m as THREE.LineBasicMaterial).opacity = 0.18;
      m.depthWrite = false;
    }
  } else {
    gridMat.transparent = true;
    (gridMat as THREE.LineBasicMaterial).opacity = 0.18;
    gridMat.depthWrite = false;
  }
  grid.position.y = -0.05;
  group.add(grid);

  // --- soft horizon glow (a flat ring) ---
  const glowGeom = new THREE.RingGeometry(40, 90, 64);
  const glowMat = new THREE.MeshBasicMaterial({
    color: 0x5cf2ff,
    transparent: true,
    opacity: 0.05,
    side: THREE.DoubleSide,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: false,
  });
  const glow = new THREE.Mesh(glowGeom, glowMat);
  glow.rotation.x = -Math.PI / 2;
  glow.position.y = -0.04;
  group.add(glow);

  let time = 0;
  return {
    group,
    update(dt: number) {
      time += dt;
      // very slow star rotation
      stars.rotation.y += dt * 0.00002;
      sparks.rotation.y -= dt * 0.00006;
      // twinkle: oscillate opacity
      sparkMat.opacity = 0.55 + Math.sin(time * 0.0025) * 0.2;
    },
  };
}
