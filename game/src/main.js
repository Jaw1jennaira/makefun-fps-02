// main.js — boot and the one loop: a fixed 60 Hz simulation feeding a
// render at the display's rate. game.js owns the match; this file only
// wires input -> player -> game -> render, and the deterministic ?shot=
// captures used for the screenshots (start | play | end, &seed=N).
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { mulberry32, losBlocked } from './util.js';
import { createMap } from './map.js';
import { createPlayer } from './player.js';
import { createInput } from './input.js';
import { createHud } from './hud.js';
import { createSfx } from './audio.js';
import { createTracers } from './weapons.js';
import { createGame } from './game.js';

const FIXED_STEP = 1 / 60;
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seed = Number.parseInt(params.get('seed') ?? '1', 10) || 1;
const random = mulberry32(seed);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(PALETTE.canvas);
scene.fog = new THREE.Fog(new THREE.Color(PALETTE.fog), 22, 60);
const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.05, 160);
scene.add(camera);

const world = createMap(scene);
const player = createPlayer(world.colliders);
const hud = createHud();
const sfx = createSfx();
const tracers = createTracers(scene);
// Input is created before the game so the game can own it; the lock callback
// only runs after the game exists, so the closure over `game` is safe.
let game = null;
const input = createInput(renderer.domElement, onLockChange);
game = createGame({ scene, camera, world, player, input, hud, sfx, tracers, random });

let started = false;
let frozen = false;
let accumulator = 0;
let lastTime = performance.now();

hud.onPlay(() => {
  if (shot) return;
  sfx.unlock();
  if (game.state.phase === 'menu' || game.state.phase === 'matchEnd') {
    game.startMatch();
    input.requestLock();
  } else if (game.state.phase === 'buy') {
    input.requestLock();
  } else {
    input.requestLock();
  }
});

function onLockChange(locked) {
  if (shot) return;
  if (locked) {
    started = true;
    hud.hideOverlay();
  } else if (game.state.phase === 'round') {
    hud.showOverlay('paused');
  }
}

function step(dt) {
  const look = input.takeLook();
  player.look(look.x, look.y);
  if (game.state.phase === 'round') {
    player.step(dt, input.state.keys);
  }
  game.step(dt);
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;
  if (!frozen) {
    accumulator += dt;
    let steps = 0;
    while (accumulator >= FIXED_STEP && steps < 5) {
      step(FIXED_STEP);
      accumulator -= FIXED_STEP;
      steps += 1;
    }
    if (accumulator > FIXED_STEP * 5) accumulator = 0;
    game.syncCamera(camera);
  }
  renderer.render(scene, camera);
}

function settle(steps) {
  for (let i = 0; i < steps; i += 1) step(FIXED_STEP);
  game.syncCamera(camera);
}

function aimAt(x, y, z) {
  const p = player.state;
  const dx = x - p.position.x;
  const dy = y - (p.position.y + p.eye);
  const dz = z - p.position.z;
  const len = Math.hypot(dx, dy, dz) || 1;
  p.yaw = Math.atan2(-dx, -dz);
  p.pitch = Math.asin(Math.max(-1, Math.min(1, dy / len)));
  game.syncCamera(camera);
}

function paintTwiceThenReady() {
  let painted = 0;
  function paint() {
    requestAnimationFrame(paint);
    game.syncCamera(camera);
    renderer.render(scene, camera);
    painted += 1;
    if (painted === 2) {
      window.__shotReady = true;
      frozen = true;
    }
  }
  requestAnimationFrame(paint);
}

// Deterministic captures for the screenshots. Each one plays the real game
// code (no staged scene): the menu, a live firefight, and a won round.
// First alive defender with a clear line of sight from the player's eye.
function pickVisibleFoe() {
  const eye = player.state;
  const ey = eye.position.y + eye.eye;
  for (const b of game.bots()) {
    if (b.bot.team !== 'crimson' || !b.bot.alive) continue;
    const tx = b.bot.position.x;
    const ty = b.bot.position.y + 1.3;
    const tz = b.bot.position.z;
    if (!losBlocked(eye.position.x, ey, eye.position.z, tx, ty, tz, world.colliders)) return b;
  }
  return null;
}

// A firing spot near a bot with a clear line of sight to its head: try
// several distances toward the yard's centre, then sidesteps around it.
// (Defenders patrol behind the containers, so the naive 8 m spot is often
// blocked.) Returns [x, z].
function findFiringSpot(bot) {
  const bx = bot.position.x;
  const bz = bot.position.z;
  const dx = 0 - bx;
  const dz = 0 - bz;
  const len = Math.hypot(dx, dz) || 1;
  const ux = dx / len;
  const uz = dz / len;
  const px = -uz;
  const pz = ux;
  const candidates = [];
  for (const d of [8, 6, 4, 3]) candidates.push([bx + ux * d, bz + uz * d]);
  for (const d of [8, 6]) {
    candidates.push([bx + ux * d + px * 3, bz + uz * d + pz * 3]);
    candidates.push([bx + ux * d - px * 3, bz + uz * d - pz * 3]);
  }
  // Close ring around the bot: a defender holding behind a container can
  // only be shot from its own side of the cover, so try spots next to it.
  for (const r of [2.5, 4]) {
    for (let k = 0; k < 8; k += 1) {
      const a = (k / 8) * Math.PI * 2;
      candidates.push([bx + Math.cos(a) * r, bz + Math.sin(a) * r]);
    }
  }
  for (const [x, z] of candidates) {
    const cx = Math.max(-21, Math.min(21, x));
    const cz = Math.max(-17, Math.min(17, z));
    const inside = world.colliders.some((b) => cx > b.x0 - 0.4 && cx < b.x1 + 0.4 && cz > b.z0 - 0.4 && cz < b.z1 + 0.4 && 0.9 > b.y0 && 0.9 < b.y1);
    if (inside) continue;
    if (!losBlocked(cx, 1.62, cz, bx, 1.72, bz, world.colliders)) return [cx, cz];
  }
  return candidates[0];
}

function runShot(name) {
  hud.hideOverlay();
  if (name === 'start') {
    // Title screen over the yard: hide the buy panel so the two panels
    // never stack.
    game.startMatch();
    hud.hideBuy();
    player.state.position.set(0, 0, 14);
    player.state.yaw = 0.15;
    settle(10);
    hud.showOverlay('start');
    paintTwiceThenReady();
    return;
  }
  if (name === 'play') {
    game.startMatch();
    game.startRound();
    // Vantage point in a lane with a clear sightline: try the west lane,
    // then the east lane, and take the first defender actually visible.
    let foe = null;
    for (const vx of [-10, 10]) {
      player.state.position.set(vx, 0, -4);
      settle(5);
      foe = pickVisibleFoe();
      if (foe) break;
    }
    if (!foe) foe = game.bots().find((b) => b.bot.team === 'crimson' && b.bot.alive);
    if (foe) {
      // Re-aim before every shot: bots keep patrolling, a stale aim misses.
      for (let i = 0; i < 3; i += 1) {
        aimAt(foe.bot.position.x, foe.bot.position.y + 1.3, foe.bot.position.z);
        game.shoot();
        settle(16);
      }
      aimAt(foe.bot.position.x, foe.bot.position.y + 1.3, foe.bot.position.z);
      settle(2);
    }
    settle(10);
    paintTwiceThenReady();
    return;
  }
  // end: win round 1 by eliminating the defenders with aimed headshots,
  // then let the victory banner show. Shot mode only: the player is given
  // a rifle and extra health so the capture is deterministic; health is
  // restored before the frame is taken.
  game.startMatch();
  game.state.owned.add('rifle');
  game.switchWeapon('rifle');
  game.startRound();
  player.state.health = 1000;
  for (const b of game.bots()) {
    if (b.bot.team !== 'crimson' || !b.bot.alive) continue;
    // Step to a firing spot with a clear line of sight to this bot's head.
    const [sx, sz] = findFiringSpot(b.bot);
    player.state.position.set(sx, 0, sz);
    settle(5);
    for (let i = 0; i < 8 && b.bot.alive; i += 1) {
      // Re-aim before every shot: the bot strafes and patrols between shots.
      aimAt(b.bot.position.x, b.bot.position.y + 1.72, b.bot.position.z);
      game.shoot();
      settle(16);
    }
    settle(4);
  }
  player.state.health = 100;
  player.state.pitch = 0; // level the view: recoil kicked it up during the fight
  game.syncHud();
  settle(30);
  paintTwiceThenReady();
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

game.syncCamera(camera);
// Debug handle: lets a test driver (or the fps-01 twin) drive the game
// from the console. Not used by the game itself.
window.__sn = { game, player, world, input, settle, aimAt, findFiringSpot, pickVisibleFoe };
if (shot) runShot(shot);
else {
  hud.showOverlay('start');
  game.syncHud();
  requestAnimationFrame(frame);
}
