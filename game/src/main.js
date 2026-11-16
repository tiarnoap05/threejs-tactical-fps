// Boot and the one loop: a fixed 60 Hz simulation feeding a render at the display's
// rate. main.js wires the systems together and owns combat resolution: the player's
// rays, the bots' shots, grenades, noise, the plant/defuse channels and the round
// flow. ?shot=start|play|buy|end with &seed=N sets up a deterministic frame for a
// capture, renders it twice, then freezes it and sets window.__shotReady.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { createWorld, SITE_A, SITE_B, SPAWNS_A, SPAWNS_B } from './world.js';
import { createInput } from './input.js';
import { createPlayer } from './player.js';
import { createLoadout, createGrenade, BUY_ITEMS } from './weapons.js';
import { createBots } from './bots.js';
import { createObjective } from './objective.js';
import { createEconomy } from './economy.js';
import { createMatch } from './match.js';
import { createHud } from './hud.js';
import { createAudio } from './audio.js';
import { createEffects } from './effects.js';
import { losClear } from './nav.js';

const FIXED_STEP = 1 / 60;
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seed = Number.parseInt(params.get('seed') ?? '1', 10) || 1;

function mulberry32(initial) {
  let a = initial;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const random = shot ? mulberry32(seed) : Math.random;

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(PALETTE.canvas);
scene.fog = new THREE.Fog(new THREE.Color(PALETTE.canvas), 34, 78);
const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.05, 160);
scene.add(camera);

const world = createWorld(scene);
const objective = createObjective(scene);
const economy = createEconomy();
const match = createMatch();
const audio = createAudio();
const effects = createEffects(scene);
const loadout = createLoadout(camera);
const player = createPlayer(world.colliders);
const bots = createBots(scene, world.colliders, world.shootables);
const hud = createHud(world.colliders, [SITE_A, SITE_B], onPlay);
const input = createInput(renderer.domElement, onLockChange);
const raycaster = new THREE.Raycaster();
raycaster.far = 90;

const playerActor = { kind: 'player', pos: player.state.position, alive: true, team: 'A' };
const body = player.state;
const shootables = world.shootables.concat(bots.hitMeshes);
const hitMeshesA = bots.hitMeshes.filter((m) => m.userData.bot.team === 'A');
const hitMeshesB = bots.hitMeshes.filter((m) => m.userData.bot.team === 'B');
const direction = new THREE.Vector3();
const tmpVec = new THREE.Vector3();
const tmpBox = new THREE.Box3();
const endVec = new THREE.Vector3();

let playerHealth = 100;
let playerAlive = true;
let playerSurvived = true;
let started = false;
let locked = false;
let frozen = false;
let elapsed = 0;
let accumulator = 0;
let lastTime = performance.now();
let prevFiring = false;
let prevObjectiveStatus = 'carried';
let noises = [];
let grenades = [];
let spottedUntil = new Map();
let spotTimer = 0;
let walkCycle = 0;
let buyMenuOpen = false;
let beepTimer = 0;

const markerHoldMs = shot ? 4000 : 90;

function onPlay() {
  audio.unlock();
  if (match.state.phase === 'matchEnd') {
    match.startMatch();
    economy.reset();
    playerSurvived = true;
    setupRound();
  }
  if (!shot) input.requestLock();
}

function onLockChange(isLocked) {
  locked = isLocked;
  if (shot) return;
  if (isLocked) {
    started = true;
    hud.hideOverlay();
  } else if (started && match.state.phase !== 'matchEnd') {
    hud.showOverlay('paused');
  }
}

function teamAliveCount(team) {
  let n = bots.aliveCount(team);
  if (playerAlive && playerActor.team === team) n += 1;
  return n;
}

function setupRound() {
  const m = match.state;
  const playerTeam = m.playerTeam;
  playerActor.team = playerTeam;
  playerActor.alive = true;
  const spawns = playerTeam === 'A' ? SPAWNS_A : SPAWNS_B;
  player.reset(spawns[0][0], spawns[0][1], playerTeam === 'A' ? 0 : Math.PI);
  playerHealth = 100;
  playerAlive = true;
  loadout.resetForRound(playerSurvived);
  playerSurvived = true;

  const assignments = [];
  for (const bot of bots.bots) {
    if (bot.team === playerTeam && bot.idx === 3) continue;
    const list = bot.team === 'A' ? SPAWNS_A : SPAWNS_B;
    const spawn = list[bot.idx];
    let role;
    let site = null;
    if (bot.team === 'A') {
      role = bot.idx <= 1 ? 'pushA' : 'pushB';
      site = role === 'pushA' ? SITE_A : SITE_B;
    } else if (bot.idx === 0) role = 'holdA';
    else if (bot.idx === 1) role = 'holdB';
    else if (bot.idx === 2) role = 'holdMid';
    else role = 'roam';
    assignments.push({ bot, spawn, role, site });
  }
  bots.resetForRound(assignments);
  const carrier = playerTeam === 'A' ? playerActor : bots.bots.find((b) => b.team === 'A' && b.idx === 0);
  objective.reset(carrier);
  prevObjectiveStatus = 'carried';
  grenades = [];
  spottedUntil.clear();
  hud.setFeed(match.feed());
  hud.banner(
    `ROUND ${m.round} — ${playerTeam === 'A' ? 'ATTACK' : 'DEFEND'}`,
    playerTeam === 'A' ? 'Plant the core at A or B, or eliminate the Wardens.' : 'Hold the sites. Defuse the core if it is planted.',
  );
  openBuyMenu();
  syncHud();
}

function openBuyMenu() {
  if (!match.isBuyPhase()) return;
  buyMenuOpen = true;
  hud.showBuy(BUY_ITEMS, economy.money);
}

function endRound(winner, reason) {
  const m = match.state;
  if (m.phase !== 'live') return;
  match.endRound(winner, reason);
  const playerWon = winner === m.playerTeam;
  if (playerWon) economy.addWin();
  else economy.addLoss();
  playerSurvived = playerAlive;
  const reasonText = {
    elimination: 'enemy team eliminated',
    detonation: 'the core detonated',
    defuse: 'the core was defused',
    time: 'time ran out',
  }[reason];
  hud.banner(playerWon ? 'ROUND WON' : 'ROUND LOST', reasonText);
  if (playerWon) audio.roundWin();
  else audio.roundLose();
  hud.hideBuy();
  buyMenuOpen = false;
}

function onMatchEnd() {
  const m = match.state;
  hud.showOverlay('matchEnd', {
    winner: m.matchWinner,
    playerTeam: m.playerTeam,
    scoreA: m.scoreA,
    scoreB: m.scoreB,
    kills: economy.kills,
    deaths: economy.deaths,
    rounds: m.round,
  });
  if (document.pointerLockElement) document.exitPointerLock();
}

function syncCamera() {
  const bob = playerAlive && body.onGround ? Math.sin(walkCycle * 2) * 0.014 * Math.min(1, player.groundSpeed() / 5) : 0;
  camera.position.set(body.position.x, body.position.y + body.eye + bob, body.position.z);
  camera.rotation.set(body.pitch, body.yaw, 0, 'YXZ');
}

function aimAt(point) {
  const dx = point.x - body.position.x;
  const dy = point.y - (body.position.y + body.eye);
  const dz = point.z - body.position.z;
  const length = Math.hypot(dx, dy, dz) || 1;
  body.yaw = Math.atan2(-dx, -dz);
  body.pitch = Math.asin(Math.max(-1, Math.min(1, dy / length)));
  syncCamera();
}

function damageFalloff(shotDesc, dist) {
  if (dist <= shotDesc.near) return 1;
  if (dist >= shotDesc.far) return shotDesc.minMult;
  return 1 - (1 - shotDesc.minMult) * ((dist - shotDesc.near) / (shotDesc.far - shotDesc.near));
}

function killBot(bot, killerName, weaponName, headshot, killerTeam) {
  match.addKill(killerName, bot.name, weaponName, headshot, killerTeam);
  if (objective.carrier?.ref === bot) objective.dropAt(bot.pos);
}

function damagePlayer(amount, attackerName, headshot) {
  const taken = loadout.damageTaken(amount);
  playerHealth -= taken;
  hud.damageFlash();
  if (playerHealth <= 0 && playerAlive) {
    playerAlive = false;
    playerActor.alive = false;
    economy.addDeath();
    match.addKill(attackerName, 'You', 'Service rifle', headshot, attackerName === 'You' ? playerActor.team : playerActor.team === 'A' ? 'B' : 'A');
    if (objective.carrier?.ref === playerActor) objective.dropAt(body.position);
    hud.banner('YOU ARE DOWN', 'Spectating until the round ends.');
  }
}

function shoot() {
  const spec = loadout.currentSpec();
  if (!spec) return;
  const speed = player.groundSpeed();
  const aiming = input.state.aiming;
  const result = loadout.fire(speed, aiming, body.crouching);
  if (!result) return;
  if (result.dry) {
    audio.dryFire();
    return;
  }
  audio.shot(result.weaponId);
  noises.push({ pos: body.position.clone(), radius: 30, team: playerActor.team });
  camera.getWorldDirection(direction);
  const jitter = shot ? 0 : result.spread;
  direction.x += (random() * 2 - 1) * jitter;
  direction.y += (random() * 2 - 1) * jitter;
  direction.z += (random() * 2 - 1) * jitter;
  direction.normalize();
  scene.updateMatrixWorld(true);
  raycaster.set(camera.position, direction);
  raycaster.far = 90;
  const hit = raycaster.intersectObjects(shootables, false)[0];
  if (hit) endVec.copy(hit.point);
  else endVec.copy(camera.position).addScaledVector(direction, 80);
  tmpVec.copy(camera.position).addScaledVector(direction, 0.6);
  effects.tracer(tmpVec, endVec);
  if (hit) {
    const bot = hit.object.userData.bot;
    if (bot) {
      if (bot.team === playerActor.team) {
        effects.puff(hit.point, 0xa89880, 3);
      } else {
        const dist = hit.distance;
        const dmg = Math.round(result.damage * damageFalloff(result, dist));
        const part = hit.object.userData.part;
        const killed = bots.damage(bot, dmg, part);
        effects.puff(hit.point, 0xc03028, 5);
        hud.hitMarker(killed, markerHoldMs);
        audio.hit(killed);
        if (killed) {
          economy.addKill();
          killBot(bot, 'You', spec.name, part === 'head', playerActor.team);
        }
      }
    } else {
      effects.puff(hit.point, 0x8a7a5e, 3);
    }
  }
  player.recoil(result.recoil * (0.8 + random() * 0.4), (random() * 2 - 1) * result.recoil * 0.4);
}

function resolveBotShot(s) {
  const targets = s.bot.team === 'A' ? hitMeshesB : hitMeshesA;
  noises.push({ pos: s.bot.pos.clone(), radius: 30, team: s.bot.team });
  audio.enemyShot(s.origin.distanceTo(camera.position));
  raycaster.set(s.origin, s.dir);
  raycaster.far = 90;
  const hit = raycaster.intersectObjects(world.shootables.concat(targets), false)[0];
  // The player is tested analytically against their body box.
  let playerDist = Infinity;
  if (playerAlive && s.bot.team !== playerActor.team) {
    tmpBox.min.set(body.position.x - 0.34, body.position.y, body.position.z - 0.34);
    tmpBox.max.set(body.position.x + 0.34, body.position.y + body.height, body.position.z + 0.34);
    const p = raycaster.ray.intersectBox(tmpBox, tmpVec);
    if (p) playerDist = p.distanceTo(s.origin);
  }
  const meshDist = hit ? hit.distance : Infinity;
  const end = playerDist < meshDist ? tmpVec.clone() : hit ? hit.point : tmpVec.copy(s.origin).addScaledVector(s.dir, 60);
  effects.tracer(s.origin, end);
  if (playerDist < meshDist) {
    damagePlayer(s.damage, s.bot.name, false);
    effects.puff(end, 0xc03028, 4);
  } else if (hit) {
    const bot = hit.object.userData.bot;
    if (bot) {
      const killed = bots.damage(bot, s.damage, hit.object.userData.part);
      effects.puff(hit.point, 0xc03028, 5);
      if (killed) killBot(bot, s.bot.name, 'Service rifle', hit.object.userData.part === 'head', s.bot.team);
    } else {
      effects.puff(hit.point, 0x8a7a5e, 3);
    }
  }
}

function throwGrenade() {
  if (!loadout.throwGrenade()) return;
  camera.getWorldDirection(direction);
  const pos = camera.position.clone().addScaledVector(direction, 0.5);
  pos.y -= 0.1;
  const vel = direction.clone().multiplyScalar(14);
  vel.y += 3.5;
  grenades.push({ g: createGrenade(scene, world.colliders, pos, vel), team: playerActor.team, thrower: 'You' });
  loadout.switchTo('primary');
}

function explodeGrenade(entry) {
  const pos = entry.g.position;
  effects.explosion(pos);
  audio.explosion();
  noises.push({ pos: pos.clone(), radius: 60, team: entry.team });
  const victims = [];
  if (playerAlive) victims.push({ kind: 'player', pos: body.position, team: playerActor.team });
  for (const b of bots.living('A')) victims.push({ kind: 'bot', ref: b, pos: b.pos, team: 'A' });
  for (const b of bots.living('B')) victims.push({ kind: 'bot', ref: b, pos: b.pos, team: 'B' });
  for (const v of victims) {
    if (v.team === entry.team) continue;
    tmpVec.copy(v.pos);
    tmpVec.y += 1.2;
    const dist = tmpVec.distanceTo(pos);
    if (dist > 6) continue;
    if (!losClear(raycaster, world.shootables, pos, tmpVec)) continue;
    const dmg = Math.round(90 - (80 * dist) / 6);
    if (v.kind === 'player') {
      damagePlayer(dmg, entry.thrower, false);
    } else {
      const killed = bots.damage(v.ref, dmg, 'torso');
      if (killed) {
        if (entry.thrower === 'You') economy.addKill();
        killBot(v.ref, entry.thrower, 'Frag grenade', false, entry.team);
      }
    }
  }
}

function step(dt) {
  elapsed += dt;
  const ev = match.step(dt);
  if (ev === 'go') {
    hud.hideBuy();
    buyMenuOpen = false;
    hud.banner('GO', match.state.playerTeam === 'A' ? 'Plant the core or eliminate the Wardens.' : 'Defend the sites.', 1800);
  } else if (ev === 'time' && objective.status !== 'planted') {
    endRound('B', 'time');
  } else if (ev === 'round') {
    if (match.state.phase === 'matchEnd') onMatchEnd();
    else setupRound();
    return;
  }

  const m = match.state;
  const aiming = input.state.aiming;
  loadout.step(dt, aiming);

  // Player movement and channels. The dead can look but not move or channel.
  if (playerAlive && m.phase !== 'matchEnd') {
    const speed = player.step(dt, input.state.keys, loadout.moveMult());
    walkCycle += dt * speed;
    const noise = player.noiseSince();
    if (noise > 0) {
      noises.push({ pos: body.position.clone(), radius: 8 * noise, team: playerActor.team });
      audio.footstep();
    }
    const holding = input.state.keys.has('KeyE');
    if (m.phase === 'live' && holding) {
      if (objective.carrier?.ref === playerActor && playerActor.team === 'A') {
        const r = objective.plantTick(playerActor, dt, true);
        if (r === 'planted') {
          economy.addPlant();
          hud.banner('CORE PLANTED', 'Defend it until it detonates.', 2200);
          audio.beep();
        }
      } else if (objective.status === 'planted' && playerActor.team === 'B') {
        const r = objective.defuseTick(playerActor, dt, true);
        if (r === 'defused') {
          economy.addDefuse();
          endRound('B', 'defuse');
        }
      }
    }
  }

  // The fuse and the dropped-core pickup.
  if (objective.step(dt) === 'boom') {
    effects.explosion(objective.position);
    audio.explosion();
    endRound('A', 'detonation');
  }
  if (objective.status === 'dropped') {
    const actors = [{ kind: 'player', ref: playerActor, pos: body.position, alive: playerAlive, team: playerActor.team }];
    for (const b of bots.bots) {
      if (!b.benched) actors.push({ kind: 'bot', ref: b, pos: b.pos, alive: b.alive, team: b.team });
    }
    objective.pickupCheck(actors);
  }
  if (prevObjectiveStatus !== 'planted' && objective.status === 'planted') {
    hud.banner('CORE PLANTED', 'Wardens: retake and defuse. Vanguard: defend it.', 2200);
  }
  prevObjectiveStatus = objective.status;
  if (objective.status === 'planted') {
    beepTimer -= dt;
    if (beepTimer <= 0) {
      audio.beep();
      beepTimer = objective.fuseLeft < 8 ? 0.35 : 0.8;
    }
  }

  // Bots: perception, routing, combat. Their shots resolve here.
  const enemies = [{ kind: 'player', ref: playerActor, pos: body.position, alive: playerAlive, team: playerActor.team }];
  for (const b of bots.bots) {
    if (!b.benched) enemies.push({ kind: 'bot', ref: b, pos: b.pos, alive: b.alive, team: b.team });
  }
  const shots = bots.step(dt, { enemies, noises, objective, time: elapsed, phase: m.phase });
  for (const s of shots) resolveBotShot(s);

  // Grenades.
  for (let i = grenades.length - 1; i >= 0; i -= 1) {
    if (grenades[i].g.step(dt) === 'boom') {
      explodeGrenade(grenades[i]);
      grenades.splice(i, 1);
    }
  }

  // Elimination wins. A planted core keeps the round alive for the attackers.
  if (m.phase === 'live') {
    const aliveA = teamAliveCount('A');
    const aliveB = teamAliveCount('B');
    if (objective.status === 'planted') {
      if (aliveB === 0) endRound('A', 'elimination');
    } else {
      if (aliveA === 0) endRound('B', 'elimination');
      else if (aliveB === 0) endRound('A', 'elimination');
    }
  }

  effects.step(dt);
  noises = [];
}

function syncHud() {
  const m = match.state;
  hud.setHealth(playerHealth, loadout.hasArmor());
  const ammo = loadout.ammo();
  const spec = loadout.currentSpec();
  hud.setAmmo(loadout.slot() === 'grenade' ? 1 : ammo.mag, loadout.slot() === 'grenade' ? 0 : ammo.reserve, loadout.slot() === 'grenade' ? 'Frag grenade' : spec ? spec.name : '—', loadout.reloading(), loadout.hasGrenade() ? 1 : 0);
  hud.setMoney(economy.money);
  if (m.phase === 'buy') hud.setTimer(`BUY 0:${String(Math.max(0, Math.ceil(m.buyLeft))).padStart(2, '0')}`);
  else if (m.phase === 'live') {
    const t = Math.max(0, Math.ceil(m.roundLeft));
    hud.setTimer(`${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`);
  } else hud.setTimer('—');
  hud.setScore(m.scoreA, m.scoreB, m.round, m.playerTeam);
  hud.setAlive(teamAliveCount('A'), teamAliveCount('B'));
  const obj = objective;
  let bombText = '—';
  let fuseFrac = 0;
  if (obj.status === 'planted') {
    bombText = `CORE PLANTED AT ${obj.plantedSite === SITE_A ? 'A' : 'B'} — ${Math.ceil(obj.fuseLeft)}s`;
    fuseFrac = obj.fuseLeft / 35;
  } else if (obj.status === 'dropped') bombText = 'CORE DROPPED — RECOVER IT';
  else if (obj.carrier?.ref === playerActor) bombText = 'YOU CARRY THE CORE — PLANT AT A OR B';
  else if (obj.carrier) bombText = obj.carrier.ref.team === playerActor.team ? 'ALLY CARRIES THE CORE' : 'ENEMY CARRIES THE CORE';
  hud.setBomb(bombText, fuseFrac, obj.carrier?.ref === playerActor);
  if (obj.plantProgress > 0) hud.setProgress('PLANTING THE CORE…', obj.plantProgress);
  else if (obj.defuseProgress > 0) hud.setProgress('DEFUSING…', obj.defuseProgress);
  else hud.setProgress(null, 0);
  hud.setFeed(match.feed());
  const gap = 5 + player.groundSpeed() * 1.4 + (loadout.reloading() ? 3 : 0);
  hud.setCrosshairGap(gap);
  hud.setScoped(loadout.isScoped(input.state.aiming));
  // Minimap: allies always, enemies only while spotted.
  const allies = [];
  const foes = [];
  for (const b of bots.bots) {
    if (b.benched || !b.alive) continue;
    const entry = { x: b.pos.x, z: b.pos.z, team: b.team };
    if (b.team === playerActor.team) allies.push(entry);
    else if ((spottedUntil.get(b) ?? 0) > elapsed) foes.push(entry);
  }
  const bombPos = obj.status === 'dropped' || obj.status === 'planted' ? { x: obj.position.x, z: obj.position.z } : null;
  hud.setMinimap(
    { x: body.position.x, z: body.position.z, dx: -Math.sin(body.yaw), dz: -Math.cos(body.yaw) },
    allies,
    foes,
    bombPos,
  );
}

function handleEdges(codes) {
  const m = match.state;
  for (const code of codes) {
    if (code === 'KeyR') {
      loadout.reload();
      if (loadout.reloading()) audio.reload();
    } else if (code === 'KeyQ') {
      loadout.quickSwitch();
    } else if (code === 'KeyG') {
      loadout.switchTo('grenade');
    } else if (code === 'KeyB') {
      if (m.phase === 'buy') {
        buyMenuOpen = !buyMenuOpen;
        if (buyMenuOpen) hud.showBuy(BUY_ITEMS, economy.money);
        else hud.hideBuy();
      }
    } else if (code.startsWith('Digit')) {
      const n = code.slice(5);
      if (m.phase === 'buy') {
        const item = BUY_ITEMS.find((x) => x.key === n);
        if (item) {
          const res = loadout.buy(item.id, economy.money);
          if (res.ok && economy.spend(res.cost)) {
            audio.buy();
            hud.buyResult(n, true);
            hud.showBuy(BUY_ITEMS, economy.money);
          } else {
            audio.denied();
            hud.buyResult(n, false);
          }
        }
      } else if (n === '1') loadout.switchTo('primary');
      else if (n === '2') loadout.switchTo('secondary');
      else if (n === '3') loadout.switchTo('grenade');
    }
  }
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;
  if (!frozen && ((started && locked) || shot)) {
    const scoped = loadout.isScoped(input.state.aiming);
    const look = input.takeLook();
    player.look(look.x, look.y, scoped ? 0.0009 : 0.0022);
    handleEdges(input.takeEdges());
    const firing = input.state.firing;
    const spec = loadout.currentSpec();
    const trigger = firing && (spec?.auto || !prevFiring);
    prevFiring = firing;
    if (trigger && playerAlive && match.state.phase === 'live') {
      if (loadout.slot() === 'grenade') throwGrenade();
      else shoot();
    }
    accumulator += dt;
    let steps = 0;
    while (accumulator >= FIXED_STEP && steps < 5) {
      step(FIXED_STEP);
      accumulator -= FIXED_STEP;
      steps += 1;
    }
    if (accumulator > FIXED_STEP * 5) accumulator = 0;
    // FOV: scope zooms deepest, aiming zooms a little, hip fire stays wide.
    const targetFov = scoped ? 28 : input.state.aiming ? 62 : 74;
    if (Math.abs(camera.fov - targetFov) > 0.05) {
      camera.fov += (targetFov - camera.fov) * Math.min(1, dt * 12);
      camera.updateProjectionMatrix();
    }
    // Spotted checks, four raycasts a few times a second.
    spotTimer -= dt;
    if (spotTimer <= 0 && playerAlive) {
      spotTimer = 0.25;
      camera.getWorldDirection(direction);
      for (const b of bots.bots) {
        if (b.benched || !b.alive || b.team === playerActor.team) continue;
        tmpVec.copy(b.pos);
        tmpVec.y += 1.2;
        tmpVec.sub(camera.position);
        const dist = tmpVec.length();
        if (dist > 45) continue;
        tmpVec.divideScalar(dist);
        if (tmpVec.dot(direction) < 0.5) continue;
        tmpVec.copy(b.pos);
        tmpVec.y += 1.2;
        if (losClear(raycaster, world.shootables, camera.position, tmpVec)) spottedUntil.set(b, elapsed + 3);
      }
    }
    syncCamera();
    syncHud();
  }
  renderer.render(scene, camera);
}

function settle(steps) {
  for (let i = 0; i < steps; i += 1) step(FIXED_STEP);
}

function runShot(name) {
  match.startMatch();
  economy.reset();
  playerSurvived = true;
  setupRound();
  hud.hideOverlay();
  if (name === 'play') {
    match.state.phase = 'live';
    match.state.roundLeft = 78;
    hud.hideBuy();
    buyMenuOpen = false;
    loadout.buy('rifle', 99999);
    body.position.set(-4, 0, 6);
    body.yaw = 0;
    body.pitch = 0;
    // Two enemies in the open ahead: one by the furnace, one past it.
    const foes = bots.bots.filter((b) => b.team === 'B');
    const spots = [[-2, -2], [4, -6]];
    foes.slice(0, 2).forEach((bot, i) => {
      bot.body.state.position.set(spots[i][0], 0, spots[i][1]);
      bot.body.state.yaw = Math.PI;
      bot.group.position.copy(bot.body.state.position);
      bot.group.rotation.y = Math.PI;
      bot.state = 'hold';
      bot.path = [];
    });
    settle(6);
    const target = foes[0];
    tmpVec.copy(target.pos);
    tmpVec.y += 1.2;
    aimAt(tmpVec);
    shoot();
    settle(2);
    hud.setScore(0, 0, 1, 'A');
  } else if (name === 'buy') {
    match.state.buyLeft = 8;
    body.position.set(0, 0, 13.5);
    body.yaw = 0;
    body.pitch = -0.04;
    hud.showBuy(BUY_ITEMS, economy.money);
    settle(8);
  } else if (name === 'end') {
    match.state.phase = 'live';
    match.state.scoreA = 3;
    match.state.scoreB = 2;
    const foe = bots.bots.find((b) => b.team === 'B');
    foe.alive = false;
    foe.fall = 1;
    foe.body.state.position.set(-1.5, 0, 4);
    foe.group.position.copy(foe.body.state.position);
    foe.group.rotation.x = -1.45;
    endRound('A', 'elimination');
    body.position.set(-1.5, 0, 8);
    body.yaw = 0;
    body.pitch = -0.1;
    settle(4);
  } else {
    body.position.set(0.6, 0, 8.6);
    body.yaw = 0;
    body.pitch = -0.02;
    settle(12);
    aimAt(new THREE.Vector3(0, 1.5, -6));
    hud.showOverlay('start');
  }
  syncCamera();
  syncHud();
  paintTwiceThenReady();
}

function paintTwiceThenReady() {
  let painted = 0;
  function paint() {
    requestAnimationFrame(paint);
    syncCamera();
    renderer.render(scene, camera);
    painted += 1;
    if (painted === 2) {
      window.__shotReady = true;
      frozen = true;
    }
  }
  requestAnimationFrame(paint);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

if (shot) {
  runShot(shot);
} else {
  match.startMatch();
  setupRound();
  hud.showOverlay('start');
  syncCamera();
  requestAnimationFrame(frame);
}
