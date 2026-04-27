import * as THREE from "three";

interface Burst {
  group: THREE.Group;
  velocities: THREE.Vector3[];
  age: number;
  ttl: number;
}

export class EffectsLayer {
  public group: THREE.Group;
  private bursts: Burst[] = [];

  constructor() {
    this.group = new THREE.Group();
  }

  /** Spawn a sparkle burst centered at world `pos`. */
  spawnBurst(pos: THREE.Vector3, color: number, count = 24) {
    const burst = new THREE.Group();
    const velocities: THREE.Vector3[] = [];
    const geom = new THREE.SphereGeometry(0.08, 6, 6);
    const mat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 1,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    for (let i = 0; i < count; i++) {
      const m = new THREE.Mesh(geom, mat);
      m.position.copy(pos);
      burst.add(m);
      const dir = new THREE.Vector3(
        Math.random() - 0.5,
        Math.random() * 0.7 + 0.2,
        Math.random() - 0.5,
      ).normalize().multiplyScalar(4 + Math.random() * 6);
      velocities.push(dir);
    }
    this.group.add(burst);
    this.bursts.push({ group: burst, velocities, age: 0, ttl: 0.8 });
  }

  update(dt: number) {
    const dtSec = dt / 1000;
    for (let i = this.bursts.length - 1; i >= 0; i--) {
      const b = this.bursts[i];
      b.age += dtSec;
      const t = b.age / b.ttl;
      const children = b.group.children as THREE.Mesh[];
      for (let j = 0; j < children.length; j++) {
        const m = children[j];
        const v = b.velocities[j];
        m.position.x += v.x * dtSec;
        m.position.y += v.y * dtSec;
        m.position.z += v.z * dtSec;
        v.y -= 9 * dtSec; // gravity
        const mat = m.material as THREE.MeshBasicMaterial;
        mat.opacity = Math.max(0, 1 - t);
      }
      if (b.age >= b.ttl) {
        this.group.remove(b.group);
        b.group.traverse((o) => {
          const mesh = o as THREE.Mesh;
          if (mesh.geometry) mesh.geometry.dispose?.();
        });
        this.bursts.splice(i, 1);
      }
    }
  }
}
