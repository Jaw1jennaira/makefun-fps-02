// player.js — first-person movement with acceleration, friction, crouch,
// jump and AABB collision. Speed and spread are linked: firing on the move
// is punished by weapons.js, and stopping to aim is rewarded.
import * as THREE from 'three';
import { clamp, moveBody } from './util.js';

const EYE_STAND = 1.62;
const EYE_CROUCH = 1.08;
const RADIUS = 0.34;
const HEIGHT = 1.7;
const WALK_SPEED = 5.4;
const CROUCH_SPEED = 2.7;
const ACCEL = 46;
const FRICTION = 11;
const JUMP_SPEED = 6.4;
const GRAVITY = 19;

export function createPlayer(colliders) {
  const state = {
    position: new THREE.Vector3(0, 0, 15),
    velocity: new THREE.Vector3(),
    yaw: 0,
    pitch: 0,
    eye: EYE_STAND,
    crouch: false,
    onGround: true,
    health: 100,
    armor: false,
    alive: true,
  };

  function look(dx, dy) {
    state.yaw -= dx * 0.0021;
    state.pitch = clamp(state.pitch - dy * 0.0021, -1.5, 1.5);
  }

  function groundSpeed() {
    return Math.hypot(state.velocity.x, state.velocity.z);
  }

  function step(dt, keys) {
    const crouch = keys.has('ControlLeft') || keys.has('KeyC');
    state.crouch = crouch;
    const targetEye = crouch ? EYE_CROUCH : EYE_STAND;
    state.eye += (targetEye - state.eye) * Math.min(1, dt * 12);

    const fwd = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);
    const strafe = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
    const sin = Math.sin(state.yaw);
    const cos = Math.cos(state.yaw);
    let mx = -sin * fwd + cos * strafe;
    let mz = -cos * fwd - sin * strafe;
    const len = Math.hypot(mx, mz);
    if (len > 0) { mx /= len; mz /= len; }
    const maxSpeed = crouch ? CROUCH_SPEED : WALK_SPEED;
    state.velocity.x += mx * ACCEL * dt;
    state.velocity.z += mz * ACCEL * dt;
    // Friction when no input, and clamp to max speed.
    const hSpeed = Math.hypot(state.velocity.x, state.velocity.z);
    if (len === 0 && hSpeed > 0) {
      const drop = Math.max(0, hSpeed - FRICTION * dt * hSpeed * 0.12);
      state.velocity.x *= drop / hSpeed;
      state.velocity.z *= drop / hSpeed;
    }
    if (hSpeed > maxSpeed) {
      state.velocity.x *= maxSpeed / hSpeed;
      state.velocity.z *= maxSpeed / hSpeed;
    }
    if (keys.has('Space') && state.onGround) {
      state.velocity.y = JUMP_SPEED;
      state.onGround = false;
    }
    state.velocity.y -= GRAVITY * dt;
    const height = crouch ? 1.15 : HEIGHT;
    const before = state.position.y;
    moveBody(state.position, state.velocity.x * dt, state.velocity.y * dt, state.velocity.z * dt, RADIUS, RADIUS, height, colliders);
    if (state.position.y <= 0) {
      state.position.y = 0;
      state.velocity.y = 0;
      state.onGround = true;
    } else if (state.position.y === before && state.velocity.y < 0) {
      state.onGround = true;
      state.velocity.y = 0;
    } else if (state.velocity.y !== 0) {
      state.onGround = false;
    }
    // Keep inside the yard.
    state.position.x = clamp(state.position.x, -21, 21);
    state.position.z = clamp(state.position.z, -17, 17);
  }

  function reset(x, z) {
    state.position.set(x, 0, z);
    state.velocity.set(0, 0, 0);
    state.yaw = 0;
    state.pitch = 0;
    state.eye = EYE_STAND;
    state.health = 100;
    state.alive = true;
  }

  return { state, look, groundSpeed, step, reset };
}
