// The bots: two teams of styled-geometry soldiers that follow routes through the
// map, hold positions, see and hear, and shoot back. Each bot runs a small state
// machine (route, hold, engage, investigate, plant, defuse) over the waypoint graph,
// with a reaction delay and an aim error per bot, so stopping to aim beats them and
// rushing them head-on does not. One bot of the player's team sits each round out,
// so every round is 4 against 4.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { createBody } from './physics.js';
import { nearestNode, nodePoint, findPath, losClear } from './nav.js';

const NAMES_A = ['Rook', 'Vex', 'Sable', 'Jolt'];
const NAMES_B = ['Onyx', 'Mira', 'Kestrel', 'Bram'];
const EYE = 1.55;
const BOT_DAMAGE = 24;
const BOT_HEAD_MULT = 2.0;

function buildMesh(team) {
  const group = new THREE.Group();
  const suit = new THREE.MeshStandardMaterial({ color: new THREE.Color(team === 'A' ? PALETTE.teamA : PALETTE.teamB), roughness: 0.65, metalness: 0.05 });
  const dark = new THREE.MeshStandardMaterial({ color: new THREE.Color('#26221e'), roughness: 0.6, metalness: 0.2 });
  const legGeo = new THREE.BoxGeometry(0.16, 0.8, 0.16);
  const legL = new THREE.Mesh(legGeo, dark);
  legL.position.set(-0.11, 0.4, 0);
  const legR = new THREE.Mesh(legGeo, dark);
  legR.position.set(0.11, 0.4, 0);
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.7, 0.28), suit);
  torso.position.y = 1.15;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 14, 10), dark);
  head.position.y = 1.68;
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.05, 0.05), suit);
  visor.position.set(0, 1.7, -0.14);
  const armGeo = new THREE.BoxGeometry(0.12, 0.6, 0.12);
  const armL = new THREE.Mesh(armGeo, suit);
  armL.position.set(-0.32, 1.2, -0.1);
  armL.rotation.x = -0.9;
  const armR = new THREE.Mesh(armGeo, suit);
  armR.position.set(0.32, 1.2, -0.1);
  armR.rotation.x = -0.9;
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.1, 0.5), dark);
  gun.position.set(0.28, 1.25, -0.32);
  group.add(legL, legR, torso, head, visor, armL, armR, gun);
  group.traverse((m) => {
    if (m.isMesh) {
      m.castShadow = true;
      m.receiveShadow = true;
    }
  });
  return { group, torso, head, legL, legR };
}

export function createBots(scene, colliders, shootables) {
  const bots = [];
  const hitMeshes = [];
  const raycaster = new THREE.Raycaster();
  const tmpEye = new THREE.Vector3();
  const tmpChest = new THREE.Vector3();
  const tmpDir = new THREE.Vector3();

  for (const team of ['A', 'B']) {
    const names = team === 'A' ? NAMES_A : NAMES_B;
    for (let i = 0; i < 4; i += 1) {
      const parts = buildMesh(team);
      scene.add(parts.group);
      const body = createBody(colliders, { walkSpeed: 4.4, standHeight: 1.74, crouchHeight: 1.74 });
      const bot = {
        name: names[i],
        team,
        idx: i,
        body,
        parts,
        group: parts.group,
        health: 100,
        alive: true,
        benched: false,
        skill: { aimError: 0.02 + Math.random() * 0.025, reaction: 0.35 + Math.random() * 0.3, speed: 0.92 + Math.random() * 0.16 },
        state: 'route',
        path: [],
        pathIdx: 0,
        role: 'pushA',
        site: null,
        target: null,
        reactLeft: 0,
        burstLeft: 0,
        pauseLeft: 0,
        cooldown: 0,
        strafeDir: 1,
        strafeLeft: 0,
        perceiveLeft: Math.random() * 0.15,
        investigate: null,
        holdUntil: 0,
        scanPhase: Math.random() * 6,
        walkPhase: 0,
        fall: 0,
        channeling: false,
      };
      bot.pos = body.state.position;
      parts.torso.userData.bot = bot;
      parts.torso.userData.part = 'torso';
      parts.head.userData.bot = bot;
      parts.head.userData.part = 'head';
      hitMeshes.push(parts.torso, parts.head);
      bots.push(bot);
    }
  }

  function resetForRound(assignments) {
    // assignments: [{bot, spawn:[x,z], role, site}] for the 7 active bots; the
    // eighth is benched. Roles: pushA, pushB, holdA, holdB, holdMid, roam.
    const active = new Set(assignments.map((a) => a.bot));
    for (const bot of bots) {
      bot.benched = !active.has(bot);
      bot.group.visible = !bot.benched;
      if (bot.benched) continue;
      const a = assignments.find((x) => x.bot === bot);
      bot.body.state.position.set(a.spawn[0], 0, a.spawn[1]);
      bot.body.state.velocity.set(0, 0, 0);
      bot.body.state.yaw = a.spawn[1] > 0 ? 0 : Math.PI;
      bot.health = 100;
      bot.alive = true;
      bot.role = a.role;
      bot.site = a.site ?? null;
      bot.state = 'route';
      bot.target = null;
      bot.investigate = null;
      bot.channeling = false;
      bot.fall = 0;
      bot.group.rotation.set(0, bot.body.state.yaw, 0);
      bot.group.position.copy(bot.body.state.position);
      const dest = roleDestination(bot);
      bot.path = findPath(nearestNode(a.spawn[0], a.spawn[1]), dest);
      bot.pathIdx = 0;
    }
  }

  function roleDestination(bot) {
    // Node ids from nav.js: site A 18, site B 19, holds 20-23, mid doors 14.
    if (bot.role === 'pushA' || bot.role === 'holdA') return 18;
    if (bot.role === 'pushB' || bot.role === 'holdB') return 19;
    if (bot.role === 'holdMid') return 14;
    return 12;
  }

  function seeEnemy(bot, enemies, time) {
    let best = null;
    let bestD = 45 * 45;
    tmpEye.copy(bot.pos);
    tmpEye.y += EYE;
    for (const e of enemies) {
      if (!e.alive || e.team === bot.team) continue;
      const dx = e.pos.x - bot.pos.x;
      const dz = e.pos.z - bot.pos.z;
      const d2 = dx * dx + dz * dz;
      if (d2 > bestD) continue;
      // Field of view: within ~100 degrees of the facing yaw.
      const ang = Math.atan2(-dx, -dz);
      let diff = ang - bot.body.state.yaw;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      if (Math.abs(diff) > 0.9 && d2 > 9) continue;
      tmpChest.copy(e.pos);
      tmpChest.y += 1.2;
      if (!losClear(raycaster, shootables, tmpEye, tmpChest)) continue;
      best = e;
      bestD = d2;
    }
    return best;
  }

  // One fixed step. ctx: {enemies, noises, objective, time, phase}. Returns shot
  // events for main.js to resolve: [{bot, origin, dir, damage}].
  function step(dt, ctx) {
    const shots = [];
    for (const bot of bots) {
      if (bot.benched) continue;
      if (!bot.alive) {
        bot.fall = Math.min(1, bot.fall + dt / 0.4);
        bot.group.rotation.x = -bot.fall * 1.45;
        bot.group.position.y = bot.pos.y - bot.fall * 0.08;
        continue;
      }
      const st = bot.body.state;
      bot.cooldown = Math.max(0, bot.cooldown - dt);
      bot.perceiveLeft -= dt;
      bot.channeling = false;

      if (bot.perceiveLeft <= 0) {
        bot.perceiveLeft = 0.15;
        const seen = ctx.phase === 'live' ? seeEnemy(bot, ctx.enemies, ctx.time) : null;
        if (seen) {
          if (bot.target !== seen.ref) {
            bot.target = seen.ref;
            bot.reactLeft = bot.skill.reaction;
            bot.burstLeft = 0;
          }
          bot.lastKnown = seen.pos.clone();
        } else if (bot.target && (!bot.target.alive || ctx.time - (bot.lastSeen ?? 0) > 2)) {
          bot.target = null;
        }
        if (seen) bot.lastSeen = ctx.time;
        // Hearing: enemy noises pull a bot without a target to investigate.
        if (!bot.target) {
          for (const n of ctx.noises) {
            if (n.team === bot.team) continue;
            const dx = n.pos.x - bot.pos.x;
            const dz = n.pos.z - bot.pos.z;
            if (dx * dx + dz * dz < n.radius * n.radius) {
              bot.investigate = n.pos.clone();
              bot.path = findPath(nearestNode(bot.pos.x, bot.pos.z), nearestNode(n.pos.x, n.pos.z));
              bot.pathIdx = 0;
              bot.state = 'investigate';
              break;
            }
          }
        }
      }

      // Objective duties override routing: the carrier plants, defenders retake.
      const obj = ctx.objective;
      if (ctx.phase === 'live' && obj) {
        if (obj.status === 'carried' && obj.carrier?.ref === bot) {
          const site = bot.site;
          if (site && Math.abs(bot.pos.x - site.cx) < 5 && Math.abs(bot.pos.z - site.cz) < 4) {
            bot.channeling = true;
            obj.plantTick(bot, dt, true);
          }
        } else if (obj.status === 'planted' && bot.team === 'B') {
          const dx = obj.position.x - bot.pos.x;
          const dz = obj.position.z - bot.pos.z;
          if (dx * dx + dz * dz < 2.56) {
            bot.channeling = true;
            obj.defuseTick(bot, dt, true);
          } else if (bot.state !== 'engage') {
            bot.path = findPath(nearestNode(bot.pos.x, bot.pos.z), nearestNode(obj.position.x, obj.position.z));
            bot.pathIdx = 0;
            bot.state = 'route';
          }
        }
      }

      let wishX = 0;
      let wishZ = 0;
      let moving = false;

      if (bot.target && bot.target.alive && ctx.phase === 'live') {
        // Engage: face the target, strafe, fire in bursts after the reaction delay.
        const tp = bot.target.pos;
        const dx = tp.x - bot.pos.x;
        const dz = tp.z - bot.pos.z;
        const wantYaw = Math.atan2(-dx, -dz);
        let diff = wantYaw - st.yaw;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        st.yaw += diff * Math.min(1, dt * 10);
        bot.state = 'engage';
        bot.reactLeft -= dt;
        bot.strafeLeft -= dt;
        if (bot.strafeLeft <= 0) {
          bot.strafeDir *= -1;
          bot.strafeLeft = 0.7 + Math.random() * 0.7;
        }
        const dist = Math.hypot(dx, dz);
        if (dist > 14) {
          wishX = dx / dist;
          wishZ = dz / dist;
        } else {
          wishX = (-dz / (dist || 1)) * bot.strafeDir * 0.7;
          wishZ = (dx / (dist || 1)) * bot.strafeDir * 0.7;
        }
        moving = true;
        if (bot.reactLeft <= 0) {
          if (bot.burstLeft <= 0) {
            bot.pauseLeft -= dt;
            if (bot.pauseLeft <= 0) {
              bot.burstLeft = 3 + Math.floor(Math.random() * 3);
              bot.pauseLeft = 0.4 + Math.random() * 0.3;
            }
          } else if (bot.cooldown <= 0) {
            bot.cooldown = 0.12;
            bot.burstLeft -= 1;
            tmpEye.copy(bot.pos);
            tmpEye.y += EYE;
            tmpChest.copy(tp);
            tmpChest.y += 1.15 + (Math.random() - 0.5) * 0.5;
            tmpDir.subVectors(tmpChest, tmpEye).normalize();
            const err = bot.skill.aimError + 0.02;
            tmpDir.x += (Math.random() * 2 - 1) * err;
            tmpDir.y += (Math.random() * 2 - 1) * err;
            tmpDir.z += (Math.random() * 2 - 1) * err;
            tmpDir.normalize();
            shots.push({ bot, origin: tmpEye.clone(), dir: tmpDir.clone(), damage: BOT_DAMAGE });
          }
        }
      } else if (bot.channeling) {
        // Planting or defusing: stand still.
      } else if (bot.state === 'route' || bot.state === 'investigate') {
        const node = nodePoint(bot.path[Math.min(bot.pathIdx, bot.path.length - 1)]);
        if (node) {
          const dx = node.x - bot.pos.x;
          const dz = node.z - bot.pos.z;
          const dist = Math.hypot(dx, dz);
          if (dist < 1.3) {
            bot.pathIdx += 1;
            if (bot.pathIdx >= bot.path.length) {
              const was = bot.state;
              bot.state = 'hold';
              bot.holdUntil = ctx.time + (was === 'investigate' ? 3 : bot.role === 'roam' ? 6 : 1e9);
            }
          } else {
            wishX = dx / dist;
            wishZ = dz / dist;
            moving = true;
            st.yaw = Math.atan2(-dx, -dz);
          }
        } else {
          bot.state = 'hold';
        }
      } else if (bot.state === 'hold') {
        // Hold: scan the lane with a slow yaw sweep; roamers rotate on a timer.
        bot.scanPhase += dt * 0.5;
        st.yaw += Math.sin(bot.scanPhase) * dt * 0.6;
        if (bot.role === 'roam' && ctx.time > bot.holdUntil) {
          const dest = [12, 14, 10, 11][Math.floor(Math.random() * 4)];
          bot.path = findPath(nearestNode(bot.pos.x, bot.pos.z), dest);
          bot.pathIdx = 0;
          bot.state = 'route';
          bot.holdUntil = ctx.time + 6;
        }
      }

      if (bot.channeling) {
        wishX = 0;
        wishZ = 0;
        moving = false;
      }
      const speed = bot.body.step(dt, { x: wishX * bot.skill.speed, z: wishZ * bot.skill.speed, lengthSq: () => wishX * wishX + wishZ * wishZ }, false, false);
      bot.group.position.copy(bot.pos);
      bot.group.rotation.y = st.yaw;
      if (moving && speed > 0.5) {
        bot.walkPhase += dt * speed * 1.6;
        bot.parts.legL.rotation.x = Math.sin(bot.walkPhase) * 0.55;
        bot.parts.legR.rotation.x = -Math.sin(bot.walkPhase) * 0.55;
      } else {
        bot.parts.legL.rotation.x *= 0.8;
        bot.parts.legR.rotation.x *= 0.8;
      }
    }
    return shots;
  }

  function damage(bot, amount, part) {
    if (!bot.alive) return false;
    bot.health -= part === 'head' ? Math.round(amount * BOT_HEAD_MULT) : amount;
    if (bot.health > 0) return false;
    bot.alive = false;
    bot.fall = 0;
    bot.target = null;
    return true;
  }

  return {
    bots,
    hitMeshes,
    resetForRound,
    step,
    damage,
    aliveCount(team) {
      return bots.filter((b) => !b.benched && b.team === team && b.alive).length;
    },
    living(team) {
      return bots.filter((b) => !b.benched && b.team === team && b.alive);
    },
  };
}
