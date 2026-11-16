// One shared body: acceleration, friction, gravity, crouch and jump, resolved as a box
// against the world's colliders one axis at a time, so a wall never swallows a body.
// The player and every bot move through this module; no collision code is duplicated.
import * as THREE from 'three';

const GRAVITY = 22;

export function createBody(colliders, opts) {
  const radius = opts.radius ?? 0.34;
  const standHeight = opts.standHeight ?? 1.74;
  const crouchHeight = opts.crouchHeight ?? 1.14;
  const walkSpeed = opts.walkSpeed ?? 5.4;
  const crouchSpeed = opts.crouchSpeed ?? 2.5;
  const groundAccel = opts.groundAccel ?? 46;
  const airAccel = opts.airAccel ?? 10;
  const friction = opts.friction ?? 10;
  const jumpSpeed = opts.jumpSpeed ?? 6.6;

  const body = {
    position: new THREE.Vector3(opts.x ?? 0, 0, opts.z ?? 0),
    velocity: new THREE.Vector3(),
    yaw: opts.yaw ?? 0,
    onGround: true,
    crouching: false,
    height: standHeight,
  };
  const probe = new THREE.Box3();

  // lift keeps the feet and the crown out of the horizontal tests, so standing on the
  // floor is not read as walking into a wall.
  function overlaps(x, y, z, height, lift) {
    probe.min.set(x - radius, y + lift, z - radius);
    probe.max.set(x + radius, y + height - lift, z + radius);
    for (const collider of colliders) if (probe.intersectsBox(collider)) return collider;
    return null;
  }

  // wish is a unit XZ direction in world space (or zero). Returns horizontal speed.
  function step(dt, wish, crouch, jump) {
    if (crouch && !body.crouching) {
      body.crouching = true;
      body.height = crouchHeight;
    } else if (!crouch && body.crouching && !overlaps(body.position.x, body.position.y, body.position.z, standHeight, 0.02)) {
      body.crouching = false;
      body.height = standHeight;
    }
    const speed = body.crouching ? crouchSpeed : walkSpeed;
    const blend = Math.min(1, (body.onGround ? groundAccel : airAccel) * dt / speed);
    body.velocity.x += (wish.x * speed - body.velocity.x) * blend;
    body.velocity.z += (wish.z * speed - body.velocity.z) * blend;
    if (body.onGround && wish.lengthSq() === 0) {
      const damp = Math.max(0, 1 - friction * dt);
      body.velocity.x *= damp;
      body.velocity.z *= damp;
    }
    if (jump && body.onGround) {
      body.velocity.y = jumpSpeed;
      body.onGround = false;
    }
    body.velocity.y -= GRAVITY * dt;

    const nextX = body.position.x + body.velocity.x * dt;
    if (!overlaps(nextX, body.position.y, body.position.z, body.height, 0.04)) body.position.x = nextX;
    else body.velocity.x = 0;
    const nextZ = body.position.z + body.velocity.z * dt;
    if (!overlaps(body.position.x, body.position.y, nextZ, body.height, 0.04)) body.position.z = nextZ;
    else body.velocity.z = 0;

    body.position.y += body.velocity.y * dt;
    body.onGround = false;
    const hit = overlaps(body.position.x, body.position.y, body.position.z, body.height, 0);
    if (hit && body.velocity.y <= 0) {
      body.position.y = hit.max.y;
      body.velocity.y = 0;
      body.onGround = true;
    } else if (hit) {
      body.position.y = hit.min.y - body.height;
      body.velocity.y = 0;
    }
    if (body.position.y < 0) {
      body.position.y = 0;
      body.velocity.y = 0;
      body.onGround = true;
    }
    body.velocity.y = Math.max(-30, body.velocity.y);
    return Math.hypot(body.velocity.x, body.velocity.z);
  }

  return { state: body, step, overlaps };
}
