// Tracers, impact puffs and the explosion: everything pooled up front, nothing
// allocated per frame, so the hot loop stays clean. A tracer is a stretched box
// that lives 60 ms; a puff is a small sphere with velocity and a short life.
import * as THREE from 'three';

const TRACERS = 24;
const PUFFS = 40;

export function createEffects(scene) {
  const tracerMat = new THREE.MeshBasicMaterial({ color: 0xffd9a0, transparent: true, opacity: 0.9 });
  const tracers = [];
  for (let i = 0; i < TRACERS; i += 1) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.02, 1), tracerMat);
    mesh.visible = false;
    scene.add(mesh);
    tracers.push({ mesh, life: 0 });
  }
  let tracerNext = 0;

  const puffGeo = new THREE.SphereGeometry(0.05, 6, 5);
  const puffs = [];
  for (let i = 0; i < PUFFS; i += 1) {
    const mesh = new THREE.Mesh(puffGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true }));
    mesh.visible = false;
    scene.add(mesh);
    puffs.push({ mesh, life: 0, vel: new THREE.Vector3() });
  }
  let puffNext = 0;

  const blast = new THREE.Mesh(
    new THREE.SphereGeometry(1, 20, 14),
    new THREE.MeshBasicMaterial({ color: 0xff8c1a, transparent: true, opacity: 0, depthWrite: false }),
  );
  blast.visible = false;
  scene.add(blast);
  const blastLight = new THREE.PointLight(0xff8c1a, 0, 24);
  scene.add(blastLight);
  let blastLife = 0;

  const mid = new THREE.Vector3();
  const dir = new THREE.Vector3();

  return {
    tracer(from, to) {
      const t = tracers[tracerNext];
      tracerNext = (tracerNext + 1) % TRACERS;
      mid.addVectors(from, to).multiplyScalar(0.5);
      dir.subVectors(to, from);
      const len = dir.length();
      t.mesh.position.copy(mid);
      t.mesh.scale.set(1, 1, len);
      t.mesh.lookAt(to);
      t.mesh.visible = true;
      t.life = 0.06;
    },
    puff(pos, color, count, speed = 2.2) {
      for (let i = 0; i < count; i += 1) {
        const p = puffs[puffNext];
        puffNext = (puffNext + 1) % PUFFS;
        p.mesh.position.copy(pos);
        p.mesh.material.color.setHex(color);
        p.mesh.material.opacity = 0.9;
        p.mesh.scale.setScalar(1);
        p.vel.set((Math.random() - 0.5) * speed, Math.random() * speed * 0.8, (Math.random() - 0.5) * speed);
        p.mesh.visible = true;
        p.life = 0.35 + Math.random() * 0.15;
      }
    },
    explosion(pos) {
      blast.position.copy(pos);
      blast.position.y += 0.5;
      blast.visible = true;
      blastLife = 0.55;
      blastLight.position.copy(blast.position);
      blastLight.intensity = 60;
      this.puff(pos, 0xff8c1a, 14, 6);
      this.puff(pos, 0x3a2f22, 10, 4);
    },
    step(dt) {
      for (const t of tracers) {
        if (t.life <= 0) continue;
        t.life -= dt;
        if (t.life <= 0) t.mesh.visible = false;
      }
      for (const p of puffs) {
        if (p.life <= 0) continue;
        p.life -= dt;
        if (p.life <= 0) {
          p.mesh.visible = false;
          continue;
        }
        p.vel.y -= 6 * dt;
        p.mesh.position.addScaledVector(p.vel, dt);
        p.mesh.material.opacity = Math.min(0.9, p.life * 2.5);
        p.mesh.scale.setScalar(0.6 + p.life);
      }
      if (blastLife > 0) {
        blastLife -= dt;
        const k = 1 - Math.max(0, blastLife) / 0.55;
        blast.scale.setScalar(1 + k * 7);
        blast.material.opacity = Math.max(0, 0.75 * (1 - k));
        blastLight.intensity = Math.max(0, 60 * (1 - k));
        if (blastLife <= 0) blast.visible = false;
      }
    },
  };
}
