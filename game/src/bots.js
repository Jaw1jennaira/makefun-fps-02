// bots.js — bot AI. One class serves both teams:
//   defenders hold a site, patrol its lanes, and rush to defuse a planted spike;
//   attackers push a lane toward a site and clear it.
// States: patrol -> engage (sees or hears a target) -> push (after the spike
// is planted) / defuse (the nearest defender channels the defuse).
// Bots shoot in bursts with a reaction delay; hit chance falls with distance,
// target speed and their own movement, so a still, aiming player wins duels.
import * as THREE from 'three';
import { clamp, losBlocked, moveBody } from './util.js';

const EYE = 1.55;
const RADIUS = 0.34;
const HEIGHT = 1.7;
const WALK = 3.1;
const COMBAT = 2.2;
const REACT_MIN = 0.28;
const REACT_MAX = 0.55;

let botIdCounter = 0;

function bodyMaterial(teamColor) {
  return new THREE.MeshStandardMaterial({ color: 0x23282e, roughness: 0.85, metalness: 0.1 });
}

export function createBot(scene, opts) {
  const id = botIdCounter += 1;
  const team = opts.team; // 'vanguard' | 'crimson'
  const teamColor = team === 'vanguard' ? 0x35c4a8 : 0xe4572e;
  const random = opts.random;

  const group = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.34, 0.85, 3, 10), bodyMaterial(teamColor));
  body.position.y = 0.95;
  body.castShadow = true;
  group.add(body);
  const vest = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.5, 0.34), new THREE.MeshStandardMaterial({ color: teamColor, roughness: 0.7, metalness: 0.2 }));
  vest.position.y = 1.15;
  vest.castShadow = true;
  group.add(vest);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.32, 0.34), new THREE.MeshStandardMaterial({ color: 0x3a332a, roughness: 0.8 }));
  head.position.y = 1.72;
  head.castShadow = true;
  group.add(head);
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.09, 0.05), new THREE.MeshBasicMaterial({ color: teamColor }));
  visor.position.set(0, 1.74, 0.18);
  group.add(visor);
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.1, 0.62), new THREE.MeshStandardMaterial({ color: 0x14181c, roughness: 0.5, metalness: 0.5 }));
  gun.position.set(0.28, 1.25, 0.3);
  group.add(gun);
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.07, 0.05), new THREE.MeshBasicMaterial({ color: teamColor }));
  stripe.position.set(0, 1.32, 0.19);
  group.add(stripe);
  scene.add(group);

  body.userData.bot = null; // filled below (circular ref to this bot)
  head.userData.bot = null;

  const bot = {
    id,
    team,
    role: opts.role, // 'defender' | 'attacker'
    name: opts.name,
    group,
    bodyMesh: body,
    headMesh: head,
    position: new THREE.Vector3(opts.x, 0, opts.z),
    yaw: opts.yaw ?? 0,
    health: 100,
    alive: true,
    state: 'patrol',
    waypoints: opts.waypoints,
    homeWaypoints: opts.waypoints,
    waypointIndex: Math.floor(random() * (opts.waypoints?.length || 1)),
    target: null, // {x, y, z, kind: 'player'|'bot', ref}
    lastSeen: null, // {x, y, z, time}
    reactAt: 0,
    burstLeft: 0,
    nextShotAt: 0,
    strafeDir: 1,
    strafeUntil: 0,
    defuseProgress: 0,
    defusing: false,
    hearPos: null,
    speed: 0,
    deathAt: 0,
    hitMeshes: [body, head],
  };
  body.userData.bot = bot;
  body.userData.part = 'body';
  head.userData.bot = bot;
  head.userData.part = 'head';
  group.position.copy(bot.position);

  function eyePos(out) {
    out.set(bot.position.x, bot.position.y + EYE, bot.position.z);
    return out;
  }

  function canSee(tx, ty, tz, colliders) {
    const e = eyePos(new THREE.Vector3());
    return !losBlocked(e.x, e.y, e.z, tx, ty, tz, colliders);
  }

  function moveToward(tx, tz, speed, dt, colliders, random) {
    const dx = tx - bot.position.x;
    const dz = tz - bot.position.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.05) return true;
    const vx = (dx / dist) * speed;
    const vz = (dz / dist) * speed;
    const before = bot.position.clone();
    moveBody(bot.position, vx * dt, 0, vz * dt, RADIUS, RADIUS, HEIGHT, colliders);
    bot.speed = Math.hypot(bot.position.x - before.x, bot.position.z - before.z) / Math.max(dt, 0.001);
    bot.position.x = clamp(bot.position.x, -21, 21);
    bot.position.z = clamp(bot.position.z, -17, 17);
    bot.yaw = Math.atan2(dx, dz);
    return dist < 0.4;
  }

  function pickWaypoint() {
    if (!bot.waypoints || bot.waypoints.length === 0) return null;
    bot.waypointIndex = (bot.waypointIndex + 1 + Math.floor(random() * 2)) % bot.waypoints.length;
    return bot.waypoints[bot.waypointIndex];
  }

  function damage(amount, part) {
    if (!bot.alive) return false;
    bot.health -= amount;
    if (bot.health <= 0) {
      bot.alive = false;
      bot.state = 'dead';
      bot.deathAt = performance.now() / 1000;
      bot.group.rotation.x = -Math.PI / 2;
      bot.group.position.y = 0.25;
      return true;
    }
    return false;
  }

  function reset(x, z, yaw) {
    bot.health = 100;
    bot.alive = true;
    bot.state = 'patrol';
    bot.position.set(x, 0, z);
    bot.yaw = yaw ?? 0;
    bot.group.rotation.set(0, 0, 0);
    bot.group.position.copy(bot.position);
    bot.target = null;
    bot.lastSeen = null;
    bot.defuseProgress = 0;
    bot.defusing = false;
    bot.hearPos = null;
    bot.burstLeft = 0;
    bot.waypoints = bot.homeWaypoints;
    bot.waypointIndex = Math.floor(random() * (bot.waypoints?.length || 1));
  }

  // ctx: { time, colliders, player, bots, spike, tracers, sfx, onDamagePlayer,
  //        onDamageBot, random, isDefuser (bool, assigned by game) }
  function step(dt, ctx) {
    if (!bot.alive) return;
    group.position.copy(bot.position);
    group.rotation.y = bot.yaw;

    const isDefender = bot.role === 'defender';
    const spike = ctx.spike;

    // --- pick a target: nearest visible enemy ---
    let visible = null;
    let visibleDist = Infinity;
    const enemies = [];
    if (bot.team === 'crimson') {
      if (ctx.player.alive) enemies.push({ kind: 'player', ref: ctx.player, x: ctx.player.state.position.x, y: ctx.player.state.position.y + ctx.player.state.eye, z: ctx.player.state.position.z });
      for (const b of ctx.bots) if (b.team === 'vanguard' && b.alive) enemies.push({ kind: 'bot', ref: b, x: b.position.x, y: b.position.y + 1.3, z: b.position.z });
    } else {
      for (const b of ctx.bots) if (b.team === 'crimson' && b.alive) enemies.push({ kind: 'bot', ref: b, x: b.position.x, y: b.position.y + 1.3, z: b.position.z });
    }
    for (const e of enemies) {
      const d = Math.hypot(e.x - bot.position.x, e.z - bot.position.z);
      if (d < 46 && d < visibleDist && canSee(e.x, e.y, e.z, ctx.colliders)) {
        visible = e;
        visibleDist = d;
      }
    }
    if (visible) {
      bot.lastSeen = { x: visible.x, y: visible.y, z: visible.z, time: ctx.time };
      if (bot.state !== 'engage') {
        bot.state = 'engage';
        bot.reactAt = ctx.time + REACT_MIN + random() * (REACT_MAX - REACT_MIN);
        bot.burstLeft = 0;
      }
      bot.target = visible;
    } else if (bot.state === 'engage' && bot.lastSeen && ctx.time - bot.lastSeen.time > 2.5) {
      bot.state = 'patrol';
      bot.target = null;
    }

    // --- spike overrides for defenders ---
    if (isDefender && spike.state === 'planted') {
      if (ctx.isDefuser) {
        bot.state = 'defuse';
      } else if (bot.state !== 'engage') {
        bot.state = 'push';
      }
    }

    // --- movement by state ---
    if (bot.state === 'engage' && bot.target) {
      const t = bot.target;
      const dx = t.x - bot.position.x;
      const dz = t.z - bot.position.z;
      const dist = Math.hypot(dx, dz) || 1;
      bot.yaw = Math.atan2(dx, dz);
      // Strafe sideways while fighting, keep 6-14 m distance.
      if (ctx.time > bot.strafeUntil) {
        bot.strafeDir = random() < 0.5 ? -1 : 1;
        bot.strafeUntil = ctx.time + 0.7 + random() * 0.9;
      }
      let mx = 0;
      let mz = 0;
      if (dist > 14) { mx = dx / dist; mz = dz / dist; }
      else if (dist < 6) { mx = -dx / dist; mz = -dz / dist; }
      const sx = (-dz / dist) * bot.strafeDir;
      const sz = (dx / dist) * bot.strafeDir;
      const vx = (mx + sx) * COMBAT;
      const vz = (mz + sz) * COMBAT;
      const before = bot.position.clone();
      moveBody(bot.position, vx * dt, 0, vz * dt, RADIUS, RADIUS, HEIGHT, ctx.colliders);
      bot.speed = Math.hypot(bot.position.x - before.x, bot.position.z - before.z) / Math.max(dt, 0.001);
      bot.position.x = clamp(bot.position.x, -21, 21);
      bot.position.z = clamp(bot.position.z, -17, 17);
    } else if (bot.state === 'defuse') {
      const site = spike.site;
      const arrived = moveToward(site.x, site.z, WALK * 1.15, dt, ctx.colliders, random);
      bot.defusing = arrived;
      if (arrived) {
        bot.defuseProgress += dt;
        bot.yaw += dt * 0.4;
        if (bot.defuseProgress >= 5) ctx.onDefused(bot);
      } else {
        bot.defuseProgress = Math.max(0, bot.defuseProgress - dt * 0.5);
      }
    } else if (bot.state === 'push') {
      // Push: toward the planted spike, or toward a heard shot, then resume patrol.
      const dest = spike.state === 'planted' ? spike.site : bot.hearPos;
      if (dest) {
        const arrived = moveToward(dest.x + (spike.state === 'planted' ? (random() * 2 - 1) : 0), dest.z, WALK * 1.1, dt, ctx.colliders, random);
        if (arrived && spike.state !== 'planted') {
          bot.waypoints = bot.homeWaypoints;
          bot.waypointIndex = 0;
          bot.hearPos = null;
          bot.state = 'patrol';
        }
      } else {
        bot.state = 'patrol';
      }
    } else {
      // patrol / hold: walk waypoints, pause at each.
      const wp = bot.waypoints?.[bot.waypointIndex];
      if (wp) {
        const arrived = moveToward(wp.x, wp.z, WALK, dt, ctx.colliders, random);
        if (arrived) {
          bot.waypointIndex = (bot.waypointIndex + 1) % bot.waypoints.length;
        }
      }
      bot.speed = bot.speed * 0.9;
    }

    // --- shooting ---
    if (bot.state === 'engage' && bot.target && ctx.time >= bot.reactAt) {
      const t = bot.target;
      const d = Math.hypot(t.x - bot.position.x, t.z - bot.position.z);
      if (canSee(t.x, t.y, t.z, ctx.colliders) && d < 46) {
        if (bot.burstLeft <= 0) {
          if (ctx.time >= bot.nextShotAt) {
            bot.burstLeft = 3 + Math.floor(random() * 3);
            bot.nextShotAt = ctx.time + 0.55 + random() * 0.6;
          }
        } else if (ctx.time >= bot.nextShotAt) {
          bot.nextShotAt = ctx.time + 0.12;
          bot.burstLeft -= 1;
          fireAt(t, d, ctx);
        }
      }
    }
  }

  function fireAt(t, dist, ctx) {
    const muzzle = eyePos(new THREE.Vector3());
    muzzle.y -= 0.25;
    muzzle.x += Math.sin(bot.yaw) * 0.3;
    muzzle.z += Math.cos(bot.yaw) * 0.3;
    // Hit chance: close and still = deadly, far and moving = poor.
    const targetSpeed = t.kind === 'player' ? Math.hypot(ctx.player.state.velocity.x, ctx.player.state.velocity.z) : (t.ref.speed || 0);
    let chance = 0.62 - dist * 0.011 - targetSpeed * 0.035 - bot.speed * 0.02;
    chance = clamp(chance, 0.06, 0.7);
    const hit = ctx.random() < chance;
    const end = new THREE.Vector3();
    if (hit) {
      end.set(t.x, t.y, t.z);
      const dmg = 9 + ctx.random() * 10;
      if (t.kind === 'player') ctx.onDamagePlayer(dmg, bot);
      else ctx.onDamageBot(t.ref, dmg, bot);
    } else {
      // Miss wide of the target, for a visible tracer.
      end.set(
        t.x + (ctx.random() * 2 - 1) * 1.6,
        t.y + (ctx.random() * 2 - 1) * 1.2,
        t.z + (ctx.random() * 2 - 1) * 1.6,
      );
    }
    ctx.tracers.fire(muzzle, end);
    ctx.sfx.enemyShot(dist);
  }

  function hearShot(x, z) {
    const d = Math.hypot(x - bot.position.x, z - bot.position.z);
    if (d < 26 && bot.state === 'patrol') {
      bot.hearPos = { x, z };
      bot.state = 'push';
    }
  }

  return { bot, step, damage, reset, hearShot, eyePos, canSee };
}
