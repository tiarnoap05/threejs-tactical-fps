// The core: the objective beyond killing. One attacker carries it; holding Use
// inside a site plants it on a 3 s channel; the 35 s fuse then runs, beeping
// faster as it nears zero; a defender holding Use beside it defuses on a 5 s
// channel. If the carrier dies the core drops, and any attacker picks it up by
// walking over it. Plant, defuse and explosion each end the round.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { SITE_A, SITE_B } from './world.js';

export const PLANT_TIME = 3.0;
export const DEFUSE_TIME = 5.0;
export const FUSE_TIME = 35;

export function siteAt(pos) {
  for (const site of [SITE_A, SITE_B]) {
    if (pos.x >= site.minX && pos.x <= site.maxX && pos.z >= site.minZ && pos.z <= site.maxZ) return site;
  }
  return null;
}

export function createObjective(scene) {
  const group = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.42, 0.3, 0.3),
    new THREE.MeshStandardMaterial({ color: new THREE.Color('#26221e'), roughness: 0.5, metalness: 0.4 }),
  );
  body.position.y = 0.15;
  const lamp = new THREE.Mesh(
    new THREE.SphereGeometry(0.05, 8, 6),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent) }),
  );
  lamp.position.set(0.14, 0.34, 0);
  group.add(body, lamp);
  group.visible = false;
  scene.add(group);

  let status = 'carried'; // carried | dropped | planted | exploded | defused
  let carrier = null; // { kind: 'player' | 'bot', ref }
  let plantProgress = 0;
  let defuseProgress = 0;
  let fuseLeft = FUSE_TIME;
  let plantedSite = null;
  let blink = 0;

  function setCarrier(actor) {
    carrier = { ref: actor };
    status = 'carried';
    group.visible = false;
  }

  return {
    get status() {
      return status;
    },
    get carrier() {
      return carrier;
    },
    get plantProgress() {
      return plantProgress;
    },
    get defuseProgress() {
      return defuseProgress;
    },
    get fuseLeft() {
      return fuseLeft;
    },
    get plantedSite() {
      return plantedSite;
    },
    get position() {
      return group.position;
    },
    reset(nextCarrier) {
      setCarrier(nextCarrier);
      plantProgress = 0;
      defuseProgress = 0;
      fuseLeft = FUSE_TIME;
      plantedSite = null;
    },
    dropAt(pos) {
      if (status !== 'carried') return;
      status = 'dropped';
      carrier = null;
      group.position.set(pos.x, 0, pos.z);
      group.visible = true;
      plantProgress = 0;
    },
    // Attackers walking over a dropped core pick it up. actors: [{kind, ref, pos, alive, team}].
    pickupCheck(actors) {
      if (status !== 'dropped') return null;
      for (const a of actors) {
        if (!a.alive || a.team !== 'A') continue;
        const dx = a.pos.x - group.position.x;
        const dz = a.pos.z - group.position.z;
        if (dx * dx + dz * dz < 1.44) {
          setCarrier(a.ref);
          return carrier;
        }
      }
      return null;
    },
    // Call every tick while an attacker channels the plant. Returns 'planted'
    // on the completing tick, else the progress 0..1. Any interruption resets it.
    plantTick(actor, dt, holding) {
      if (status !== 'carried' || carrier?.ref !== actor || !holding) {
        plantProgress = 0;
        return 0;
      }
      if (!siteAt(actor.pos)) {
        plantProgress = 0;
        return 0;
      }
      plantProgress += dt / PLANT_TIME;
      if (plantProgress >= 1) {
        status = 'planted';
        plantedSite = siteAt(actor.pos);
        group.position.set(actor.pos.x, 0, actor.pos.z);
        group.visible = true;
        fuseLeft = FUSE_TIME;
        plantProgress = 0;
        return 'planted';
      }
      return plantProgress;
    },
    // Same shape for defenders defusing a planted core.
    defuseTick(actor, dt, holding) {
      if (status !== 'planted' || !holding) {
        defuseProgress = 0;
        return 0;
      }
      const dx = actor.pos.x - group.position.x;
      const dz = actor.pos.z - group.position.z;
      if (dx * dx + dz * dz > 2.56) {
        defuseProgress = 0;
        return 0;
      }
      defuseProgress += dt / DEFUSE_TIME;
      if (defuseProgress >= 1) {
        status = 'defused';
        defuseProgress = 0;
        return 'defused';
      }
      return defuseProgress;
    },
    // Runs the fuse; returns 'boom' on the detonation tick.
    step(dt) {
      if (status === 'planted') {
        fuseLeft -= dt;
        blink += dt * (fuseLeft < 8 ? 14 : 5);
        lamp.visible = Math.sin(blink) > -0.2;
        if (fuseLeft <= 0) {
          status = 'exploded';
          group.visible = false;
          return 'boom';
        }
      } else if (status === 'dropped') {
        blink += dt * 3;
        lamp.visible = Math.sin(blink) > 0;
      }
      return null;
    },
  };
}
