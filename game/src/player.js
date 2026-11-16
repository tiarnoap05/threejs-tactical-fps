// The player: a shared physics body plus look, recoil, eye height and the noise
// footsteps make. Bots hear that noise; crouching and standing still stay quiet.
import { createBody } from './physics.js';

const STAND_EYE = 1.62;
const CROUCH_EYE = 1.05;

export function createPlayer(colliders) {
  const body = createBody(colliders, { x: 0, z: 13.5, yaw: 0 });
  const player = body.state;
  player.pitch = 0;
  player.eye = STAND_EYE;
  let stepTimer = 0;
  let noise = 0;

  function look(dx, dy, sensitivity = 0.0022) {
    player.yaw -= dx * sensitivity;
    player.pitch = Math.max(-1.45, Math.min(1.45, player.pitch - dy * sensitivity));
  }

  function recoil(pitchKick, yawKick) {
    player.pitch = Math.min(1.45, player.pitch + pitchKick);
    player.yaw += yawKick;
  }

  // keys is the held-key set; moveMult scales speed for the held weapon's weight.
  // Returns the horizontal speed; noiseSince() reports the last footstep's loudness.
  function step(dt, keys, moveMult) {
    const crouch = keys.has('ControlLeft') || keys.has('ControlRight') || keys.has('KeyC');
    const forward = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);
    const strafe = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
    const sin = Math.sin(player.yaw);
    const cos = Math.cos(player.yaw);
    const len = Math.hypot(forward, strafe) || 1;
    const wx = ((-sin * forward + cos * strafe) / len) * moveMult;
    const wz = ((-cos * forward - sin * strafe) / len) * moveMult;
    const speed = body.step(dt, { x: wx, z: wz, lengthSq: () => wx * wx + wz * wz }, crouch, keys.has('Space'));
    const eyeTarget = player.crouching ? CROUCH_EYE : STAND_EYE;
    player.eye += (eyeTarget - player.eye) * Math.min(1, dt * 12);
    // Footsteps: a noise pulse each stride while moving on the ground. Louder
    // running, silent crouch-walking, nothing while airborne.
    noise = 0;
    if (player.onGround && speed > 0.5 && !player.crouching) {
      stepTimer -= dt * speed;
      if (stepTimer <= 0) {
        stepTimer = 2.2;
        noise = speed > 4 ? 1 : 0.55;
      }
    }
    return speed;
  }

  return {
    state: player,
    step,
    look,
    recoil,
    noiseSince() {
      const n = noise;
      noise = 0;
      return n;
    },
    groundSpeed() {
      return Math.hypot(player.velocity.x, player.velocity.z);
    },
    reset(x, z, yaw) {
      player.position.set(x, 0, z);
      player.velocity.set(0, 0, 0);
      player.yaw = yaw;
      player.pitch = 0;
      player.eye = STAND_EYE;
      player.crouching = false;
      player.height = 1.74;
      player.onGround = true;
    },
  };
}
