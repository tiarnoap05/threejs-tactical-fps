// Foundry Yard: an original three-lane map with two bomb sites. Attackers spawn south,
// defenders north; west and east lanes run to sites A and B, mid is split by a furnace
// block, and two connectors join the lanes. Every wall and crate is a collider and a
// surface a bullet stops on. Plain geometry only, no models and no textures, except
// the site letters, which are drawn on a canvas at runtime.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export const SITE_A = { minX: -21, maxX: -11, minZ: -15, maxZ: -7, cx: -16, cz: -11 };
export const SITE_B = { minX: 11, maxX: 21, minZ: -15, maxZ: -7, cx: 16, cz: -11 };
export const SPAWNS_A = [[-4.5, 13.5], [-1.5, 14], [1.5, 14], [4.5, 13.5]];
export const SPAWNS_B = [[-4.5, -13.5], [-1.5, -14], [1.5, -14], [4.5, -13.5]];

function letterDecal(letter, color) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 192;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, 256, 192);
  ctx.strokeStyle = color;
  ctx.lineWidth = 10;
  ctx.strokeRect(14, 14, 228, 164);
  ctx.fillStyle = color;
  ctx.font = '700 120px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(letter, 128, 100);
  const tex = new THREE.CanvasTexture(canvas);
  tex.anisotropy = 4;
  return tex;
}

export function createWorld(scene) {
  const group = new THREE.Group();
  scene.add(group);

  const materials = {};
  for (const name of ['ground', 'surface', 'hairline', 'ink']) {
    materials[name] = new THREE.MeshStandardMaterial({
      color: new THREE.Color(PALETTE[name]),
      roughness: name === 'ink' ? 0.6 : 0.94,
      metalness: 0.02,
    });
  }
  const metal = new THREE.MeshStandardMaterial({ color: new THREE.Color('#33302b'), roughness: 0.55, metalness: 0.4 });
  const ember = new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent) });

  const colliders = [];
  const shootables = [];

  function box(width, height, depth, x, y, z, material, collide = true) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    if (collide) {
      colliders.push(new THREE.Box3().setFromObject(mesh));
      shootables.push(mesh);
    }
    return mesh;
  }

  function cylinder(radius, height, x, z, material) {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, height, 14), material);
    mesh.position.set(x, height / 2, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    colliders.push(new THREE.Box3().setFromObject(mesh));
    shootables.push(mesh);
    return mesh;
  }

  // Floor and outer walls: 44 x 32 m, 4.6 m walls, open to the dusk sky.
  box(44.6, 0.4, 32.6, 0, -0.2, 0, materials.ground);
  box(0.6, 4.6, 32.6, -22.3, 2.3, 0, materials.surface);
  box(0.6, 4.6, 32.6, 22.3, 2.3, 0, materials.surface);
  box(44.6, 4.6, 0.6, 0, 2.3, -16.3, materials.surface);
  box(44.6, 4.6, 0.6, 0, 2.3, 16.3, materials.surface);

  // Lane walls at x = -8 and x = +8, each with two connector gaps (z = +4, z = -6).
  for (const x of [-8, 8]) {
    box(0.6, 4.2, 2.5, x, 2.1, -8.75, materials.surface);
    box(0.6, 4.2, 7, x, 2.1, -1, materials.surface);
    box(0.6, 4.2, 4.5, x, 2.1, 7.75, materials.surface);
  }
  // Mid doors: the wall at z = -10 with a 4 m gap at the centre.
  box(6, 4.2, 0.6, -5, 2.1, -10, materials.surface);
  box(6, 4.2, 0.6, 5, 2.1, -10, materials.surface);

  // The furnace: mid's sightline block, with a glowing slit and a chimney stack.
  box(4, 3.5, 4, 0, 1.75, 0, materials.surface);
  box(1.6, 0.5, 0.2, 0, 1.4, 2.05, ember, false);
  cylinder(0.6, 2.2, 0, -0.8, metal);
  box(4.6, 0.3, 4.6, 0, 3.6, 0, metal);

  // Crates: crouch-height cover, jumpable, scattered down every lane and both sites.
  const crates = [
    [-16, 4], [-13, -2], [-19, -2], [16, 4], [13, -2], [19, -2], [-4, 6], [4, 6],
    [-4, -8], [4, -8], [-16, -8], [16, -8], [-12, -12], [12, -12], [-19, 6], [19, 6],
    [-6, 12], [6, 12], [-2, -13], [2, -13],
  ];
  for (const [x, z] of crates) box(1.2, 1.1, 1.2, x, 0.55, z, materials.hairline);
  box(1.2, 1.1, 1.2, -19, 1.65, 6, materials.hairline);
  box(1.2, 1.1, 1.2, 19, 1.65, 6, materials.hairline);

  // Low site walls, pillars and barrels.
  box(6, 1.1, 0.6, -16, 0.55, -6.5, materials.surface);
  box(6, 1.1, 0.6, 16, 0.55, -6.5, materials.surface);
  for (const [x, z] of [[-12, 10], [12, 10], [-4, -12], [4, -12], [-3, -14], [3, -14]]) {
    box(1.2, 3.4, 1.2, x, 1.7, z, materials.surface);
  }
  for (const [x, z] of [[-20, -13], [-11, -14], [20, -13], [11, -14], [-6, -2], [6, -2], [-20, 12], [20, 12]]) {
    cylinder(0.45, 1.1, x, z, metal);
  }

  // Site decals: painted floor letters, visual only (never colliders).
  for (const [site, letter, color] of [[SITE_A, 'A', PALETTE.accent], [SITE_B, 'B', PALETTE.teal]]) {
    const decal = new THREE.Mesh(
      new THREE.PlaneGeometry(10, 7),
      new THREE.MeshBasicMaterial({ map: letterDecal(letter, color), transparent: true, depthWrite: false }),
    );
    decal.rotation.x = -Math.PI / 2;
    decal.position.set(site.cx, 0.03, site.cz);
    group.add(decal);
  }

  // Light: a low warm sun, a cool fill, and a sky/ground gradient.
  const sky = new THREE.HemisphereLight(new THREE.Color(PALETTE.ink), new THREE.Color(PALETTE.ground), 0.9);
  scene.add(sky);
  const key = new THREE.DirectionalLight(new THREE.Color('#ffd9a0'), 2.2);
  key.position.set(14, 18, 10);
  key.target.position.set(0, 0, -2);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -28;
  key.shadow.camera.right = 28;
  key.shadow.camera.top = 28;
  key.shadow.camera.bottom = -28;
  key.shadow.camera.far = 60;
  key.shadow.bias = -0.0006;
  scene.add(key, key.target);
  const fill = new THREE.DirectionalLight(new THREE.Color('#7a8ba8'), 0.5);
  fill.position.set(-12, 10, -8);
  scene.add(fill);

  return { colliders, shootables, group };
}
