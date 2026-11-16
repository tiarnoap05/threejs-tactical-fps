// The arsenal: four hitscan weapons, one grenade and armour. It owns every number
// (damage, spread, recoil, price) and the view models; main.js owns the rays and the
// damage. Spread grows with movement and with every shot fired, so stopping to aim
// pays; armour halves damage; the sniper only earns its accuracy while scoped.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export const WEAPONS = {
  pistol: { name: 'P9 Sidearm', price: 0, damage: 26, headMult: 3.0, mag: 12, reserve: 48, gap: 0.16, reload: 1.4, spreadStill: 0.004, spreadMove: 0.03, bloom: 0.004, recoil: 0.011, auto: false, near: 12, far: 35, minMult: 0.6, moveMult: 1.02, scope: false },
  smg: { name: 'K7 Ripper', price: 1500, damage: 21, headMult: 2.5, mag: 30, reserve: 120, gap: 0.075, reload: 2.0, spreadStill: 0.008, spreadMove: 0.035, bloom: 0.003, recoil: 0.007, auto: true, near: 10, far: 30, minMult: 0.55, moveMult: 1.0, scope: false },
  rifle: { name: 'AR-4 Vanguard', price: 2700, damage: 30, headMult: 2.5, mag: 30, reserve: 90, gap: 0.096, reload: 1.9, spreadStill: 0.003, spreadMove: 0.028, bloom: 0.0035, recoil: 0.009, auto: true, near: 15, far: 40, minMult: 0.6, moveMult: 0.96, scope: false },
  sniper: { name: 'LR-90 Longshot', price: 4750, damage: 95, headMult: 2.0, mag: 5, reserve: 15, gap: 1.25, reload: 2.8, spreadStill: 0.0005, spreadMove: 0.05, bloom: 0.01, recoil: 0.03, auto: false, near: 30, far: 80, minMult: 0.85, moveMult: 0.92, scope: true },
};
export const GRENADE_PRICE = 300;
export const ARMOR_PRICE = 650;
export const BUY_ITEMS = [
  { key: '1', id: 'rifle', name: 'AR-4 Vanguard', price: 2700, blurb: 'Rifle: accurate, hard-hitting, the round winner.' },
  { key: '2', id: 'smg', name: 'K7 Ripper', price: 1500, blurb: 'SMG: fast, cheap, deadly up close.' },
  { key: '3', id: 'sniper', name: 'LR-90 Longshot', price: 4750, blurb: 'Sniper: one shot, scoped, at any range.' },
  { key: '4', id: 'grenade', name: 'Frag grenade', price: 300, blurb: 'Bounces, fuses 2.5 s, clears a corner.' },
  { key: '5', id: 'armor', name: 'Kevlar armour', price: 650, blurb: 'Halves all damage until the round ends.' },
];

function gunState(spec) {
  return { mag: spec.mag, reserve: spec.reserve, cooldown: 0, reloadLeft: 0, bloom: 0, kick: 0, flash: 0 };
}

export function createLoadout(camera) {
  const metal = new THREE.MeshStandardMaterial({ color: new THREE.Color('#26221e'), roughness: 0.45, metalness: 0.4 });
  const gripMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.hairline), roughness: 0.75, metalness: 0.1 });
  const scopeMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#1a1a1e'), roughness: 0.3, metalness: 0.6 });

  function buildGun(id) {
    const group = new THREE.Group();
    const dims = {
      pistol: [0.07, 0.09, 0.24, 0.16],
      smg: [0.08, 0.1, 0.34, 0.26],
      rifle: [0.09, 0.1, 0.42, 0.4],
      sniper: [0.09, 0.11, 0.5, 0.55],
    }[id];
    const receiver = new THREE.Mesh(new THREE.BoxGeometry(dims[0], dims[1], dims[2]), metal);
    const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, dims[3]), gripMat);
    barrel.position.set(0, 0.025, -(dims[2] / 2 + dims[3] / 2 - 0.04));
    const mag = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.14, 0.09), gripMat);
    mag.position.set(0, -0.1, 0.02);
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.08, 0.2), gripMat);
    stock.position.set(0, -0.02, dims[2] / 2 + 0.08);
    group.add(receiver, barrel, mag, stock);
    if (id === 'sniper') {
      const scope = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.18, 12), scopeMat);
      scope.rotation.x = Math.PI / 2;
      scope.position.set(0, 0.09, -0.05);
      group.add(scope);
    }
    const flash = new THREE.Mesh(
      new THREE.PlaneGeometry(0.26, 0.26),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }),
    );
    flash.position.set(0, 0.025, -(dims[2] / 2 + dims[3] - 0.02));
    flash.visible = false;
    group.add(flash);
    group.position.set(0.24, -0.2, -0.42);
    group.visible = false;
    camera.add(group);
    return { group, flash, muzzleZ: -(dims[2] / 2 + dims[3]) };
  }

  const guns = {};
  for (const id of Object.keys(WEAPONS)) guns[id] = buildGun(id);
  const flashLight = new THREE.PointLight(new THREE.Color(PALETTE.accent), 0, 5);
  flashLight.position.set(0.24, -0.16, -0.7);
  camera.add(flashLight);

  const grenadeMesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.07, 12, 10),
    new THREE.MeshStandardMaterial({ color: new THREE.Color('#2f3a2a'), roughness: 0.6, metalness: 0.3 }),
  );
  grenadeMesh.position.set(0.24, -0.2, -0.42);
  grenadeMesh.visible = false;
  camera.add(grenadeMesh);

  const states = {};
  for (const id of Object.keys(WEAPONS)) states[id] = gunState(WEAPONS[id]);
  let primaryId = null;
  let slot = 'secondary';
  let prevSlot = 'secondary';
  let grenades = 0;
  let armor = false;
  let switchLeft = 0;
  let throwLeft = 0;

  function currentId() {
    return slot === 'primary' ? primaryId : slot === 'secondary' ? 'pistol' : null;
  }

  function refreshVisible(aiming) {
    for (const id of Object.keys(guns)) guns[id].group.visible = false;
    grenadeMesh.visible = false;
    const id = currentId();
    if (slot === 'grenade') grenadeMesh.visible = true;
    else if (id && !(WEAPONS[id].scope && aiming)) guns[id].group.visible = true;
  }

  function step(dt, aiming) {
    switchLeft = Math.max(0, switchLeft - dt);
    throwLeft = Math.max(0, throwLeft - dt);
    if (throwLeft === 0 && slot === 'grenade' && grenades === 0) slot = prevSlot;
    let anyFlash = false;
    for (const id of Object.keys(states)) {
      const s = states[id];
      s.cooldown = Math.max(0, s.cooldown - dt);
      s.flash = Math.max(0, s.flash - dt);
      s.bloom = Math.max(0, s.bloom - dt * 0.02);
      s.kick += (0 - s.kick) * Math.min(1, dt * 14);
      if (s.flash > 0) anyFlash = true;
      const gun = guns[id];
      gun.flash.visible = s.flash > 0;
      gun.flash.rotation.z = s.flash * 30;
      gun.group.position.z = -0.42 + s.kick;
      gun.group.rotation.x = s.kick * 2.2;
      if (s.reloadLeft > 0) {
        s.reloadLeft = Math.max(0, s.reloadLeft - dt);
        gun.group.rotation.x = -0.55 * Math.min(1, (WEAPONS[id].reload - s.reloadLeft) * 2);
        if (s.reloadLeft === 0) {
          const need = WEAPONS[id].mag - s.mag;
          const take = Math.min(need, s.reserve);
          s.mag += take;
          s.reserve -= take;
        }
      }
    }
    flashLight.intensity = anyFlash ? 18 : 0;
    if (switchLeft > 0) {
      const id = currentId();
      if (id) guns[id].group.position.y = -0.2 - 0.12 * (switchLeft / 0.35);
    }
    refreshVisible(aiming);
  }

  // Returns a shot descriptor, { dry: true } on an empty chamber, or null when the
  // weapon cannot fire yet. spread is the cone half-angle in radians.
  function fire(speed, aiming, crouching) {
    if (slot === 'grenade' || switchLeft > 0) return null;
    const id = currentId();
    if (!id) return null;
    const spec = WEAPONS[id];
    const s = states[id];
    if (s.reloadLeft > 0 || s.cooldown > 0) return null;
    if (s.mag <= 0) return { dry: true };
    s.mag -= 1;
    s.cooldown = spec.gap;
    s.flash = 0.06;
    s.kick = 0.055;
    s.bloom = Math.min(0.03, s.bloom + spec.bloom);
    let spread = spec.spreadStill + Math.min(1, speed / 5.4) * spec.spreadMove + s.bloom;
    if (spec.scope && !aiming) spread = 0.03 + s.bloom;
    if (aiming) spread *= spec.scope ? 0.5 : 0.6;
    if (crouching) spread *= 0.7;
    return { weaponId: id, damage: spec.damage, headMult: spec.headMult, spread, near: spec.near, far: spec.far, minMult: spec.minMult, recoil: spec.recoil, auto: spec.auto };
  }

  function buy(id, money) {
    if (id === 'grenade') {
      if (grenades >= 1) return { ok: false, reason: 'already carrying one' };
      if (money < GRENADE_PRICE) return { ok: false, reason: 'not enough money' };
      grenades = 1;
      return { ok: true, cost: GRENADE_PRICE };
    }
    if (id === 'armor') {
      if (armor) return { ok: false, reason: 'already wearing armour' };
      if (money < ARMOR_PRICE) return { ok: false, reason: 'not enough money' };
      armor = true;
      return { ok: true, cost: ARMOR_PRICE };
    }
    const spec = WEAPONS[id];
    if (!spec || money < spec.price) return { ok: false, reason: 'not enough money' };
    primaryId = id;
    states[id] = gunState(spec);
    slot = 'primary';
    switchLeft = 0.35;
    return { ok: true, cost: spec.price };
  }

  return {
    step,
    fire,
    buy,
    currentId,
    currentSpec() {
      const id = currentId();
      return id ? WEAPONS[id] : null;
    },
    ammo() {
      const id = currentId();
      if (!id) return { mag: 0, reserve: 0 };
      return { mag: states[id].mag, reserve: states[id].reserve };
    },
    moveMult() {
      const spec = this.currentSpec();
      return spec ? spec.moveMult : 1;
    },
    isScoped(aiming) {
      const id = currentId();
      return !!(id && WEAPONS[id].scope && aiming);
    },
    reloading() {
      const id = currentId();
      return !!(id && states[id].reloadLeft > 0);
    },
    reload() {
      const id = currentId();
      if (!id) return;
      const s = states[id];
      if (s.reloadLeft > 0 || s.mag === WEAPONS[id].mag || s.reserve === 0) return;
      s.reloadLeft = WEAPONS[id].reload;
    },
    switchTo(next) {
      if (next === 'primary' && !primaryId) return;
      if (next === 'grenade' && grenades === 0) return;
      if (next === slot || switchLeft > 0) return;
      prevSlot = slot === 'grenade' ? prevSlot : slot;
      slot = next;
      switchLeft = 0.35;
    },
    quickSwitch() {
      this.switchTo(slot === 'primary' ? 'secondary' : 'primary');
    },
    slot() {
      return slot;
    },
    hasGrenade() {
      return grenades > 0;
    },
    throwGrenade() {
      if (grenades === 0) return false;
      grenades = 0;
      throwLeft = 0.5;
      return true;
    },
    hasArmor() {
      return armor;
    },
    damageTaken(amount) {
      return armor ? Math.round(amount * 0.5) : amount;
    },
    // Survivors keep their loadout; the dead respawn with the sidearm only.
    resetForRound(survived) {
      if (!survived) {
        primaryId = null;
        grenades = 0;
        armor = false;
        slot = 'secondary';
        for (const id of Object.keys(states)) states[id] = gunState(WEAPONS[id]);
      } else {
        for (const id of Object.keys(states)) {
          states[id].cooldown = 0;
          states[id].reloadLeft = 0;
          states[id].bloom = 0;
        }
      }
      switchLeft = 0;
      throwLeft = 0;
    },
  };
}

// A thrown grenade: gravity, bounces off colliders with damping, a 2.5 s fuse, and
// a blink that quickens as it runs out. step() returns 'boom' on the detonation tick.
export function createGrenade(scene, colliders, position, velocity) {
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.09, 12, 10),
    new THREE.MeshStandardMaterial({ color: new THREE.Color('#2f3a2a'), roughness: 0.6, metalness: 0.3 }),
  );
  const lamp = new THREE.Mesh(
    new THREE.SphereGeometry(0.03, 8, 6),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent) }),
  );
  lamp.position.y = 0.08;
  mesh.add(lamp);
  mesh.position.copy(position);
  scene.add(mesh);
  const vel = velocity.clone();
  const probe = new THREE.Box3();
  const R = 0.12;
  let fuse = 2.5;
  let blink = 0;

  function hits(x, y, z) {
    probe.min.set(x - R, y - R, z - R);
    probe.max.set(x + R, y + R, z + R);
    for (const c of colliders) if (probe.intersectsBox(c)) return true;
    return false;
  }

  return {
    mesh,
    position: mesh.position,
    step(dt) {
      fuse -= dt;
      blink += dt * (fuse < 0.8 ? 18 : 6);
      lamp.visible = Math.sin(blink) > 0;
      vel.y -= 20 * dt;
      const p = mesh.position;
      const nx = p.x + vel.x * dt;
      if (!hits(nx, p.y, p.z)) p.x = nx;
      else vel.x *= -0.45;
      const nz = p.z + vel.z * dt;
      if (!hits(p.x, p.y, nz)) p.z = nz;
      else vel.z *= -0.45;
      const ny = p.y + vel.y * dt;
      if (!hits(p.x, ny, p.z) && ny > R) p.y = ny;
      else {
        vel.y *= -0.45;
        vel.x *= 0.8;
        vel.z *= 0.8;
        p.y = Math.max(R, p.y);
      }
      if (fuse <= 0) {
        scene.remove(mesh);
        return 'boom';
      }
      return null;
    },
  };
}
