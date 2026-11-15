// game.js — the state machine. One place holds the match state:
// phase, round, score, money, weapons, the spike, the grenades.
// Fixed-step simulation lives here (step is called at 60 Hz); rendering
// only reads state. Phases: menu -> buy -> round -> roundEnd -> buy ...
// First to 4 round wins takes the match, at most 7 rounds.
import * as THREE from 'three';
import { WEAPONS, GRENADE_PRICE, ARMOR_PRICE, createViewModel } from './weapons.js';
import { createBot } from './bots.js';
import { clamp, formatMoney } from './util.js';

const ROUND_TIME = 100;
const PLANT_TIME = 3.5;
const SPIKE_TIME = 35;
const BUY_TIME = 15;
const WIN_ROUNDS = 4;
const MAX_ROUNDS = 7;
const KILL_REWARD = 300;
const WIN_REWARD = 325;
const LOSS_REWARD = 250;
const LOSS_STREAK_BONUS = 50; // +$50 per consecutive loss, capped at +$150
const LOSS_STREAK_CAP = 150;
const PLANT_REWARD = 300;

export function createGame(deps) {
  const { scene, camera, world, player, input, hud, sfx, tracers, random } = deps;
  const raycaster = new THREE.Raycaster();
  raycaster.far = 120;
  const direction = new THREE.Vector3();
  const muzzle = new THREE.Vector3();
  const tmpV = new THREE.Vector3();

  const state = {
    phase: 'menu', // menu | buy | round | roundEnd | matchEnd
    round: 1,
    scoreV: 0,
    scoreC: 0,
    money: 800,
    time: 0, // round clock (counts down) or buy countdown
    timeLeft: ROUND_TIME,
    spike: { state: 'none', site: null, timer: 0, progress: 0 },
    grenades: 0,
    owned: new Set(['pistol']),
    weaponId: 'pistol',
    ammo: {}, // weaponId -> {mag, reserve}
    bloom: 0,
    lastShotAt: -10,
    reloadUntil: 0,
    reloadPending: false,
    defuser: null,
    elapsed: 0,
    lossStreak: 0,
  };
  for (const id of Object.keys(WEAPONS)) {
    state.ammo[id] = { mag: WEAPONS[id].mag, reserve: WEAPONS[id].reserve };
  }

  let viewModel = createViewModel(camera, 'pistol');
  let bots = [];
  let grenades = [];
  let grenadeMesh = null;
  let explosionMesh = null;
  let explosionLife = 0;
  let stepAcc = 0; // distance walked since the last footstep sound

  function shootables() {
    const list = world.shootables.slice();
    for (const b of bots) if (b.bot.alive) list.push(b.bot.bodyMesh, b.bot.headMesh);
    return list;
  }

  function currentWeapon() { return WEAPONS[state.weaponId]; }

  function syncHud() {
    const w = currentWeapon();
    const a = state.ammo[state.weaponId];
    hud.setAmmo(a.mag, a.reserve);
    hud.setWeapon(w.name, state.grenades);
    hud.setMoney(state.money);
    hud.setScore(state.scoreV, state.scoreC, state.round, MAX_ROUNDS);
    hud.setHealth(player.state.health, player.state.armor);
    hud.setTimer(state.phase === 'round' ? state.timeLeft : state.time);
  }

  function switchWeapon(id) {
    if (!state.owned.has(id) || state.weaponId === id) return;
    camera.remove(viewModel);
    state.weaponId = id;
    viewModel = createViewModel(camera, id);
    const w = currentWeapon();
    sfx.click();
    syncHud();
  }

  function reload() {
    const w = currentWeapon();
    const a = state.ammo[state.weaponId];
    if (a.mag === w.mag || a.reserve === 0 || state.reloadPending) return;
    state.reloadUntil = state.elapsed + w.reloadTime;
    state.reloadPending = true;
    sfx.reload();
  }

  // Reloads complete on simulation time, never on wall-clock timers, so a
  // capture or a slow frame cannot desync them.
  function completeReload() {
    if (!state.reloadPending || state.elapsed < state.reloadUntil) return;
    state.reloadPending = false;
    const w = currentWeapon();
    const a = state.ammo[state.weaponId];
    const take = Math.min(w.mag - a.mag, a.reserve);
    a.mag += take;
    a.reserve -= take;
    syncHud();
  }

  // Returns what the shot did, for captures and debugging.
  function shoot() {
    const w = currentWeapon();
    const a = state.ammo[state.weaponId];
    if (state.reloadPending) return { fired: false };
    if (a.mag <= 0) {
      sfx.dry();
      reload();
      return { fired: false };
    }
    const interval = w.interval;
    if (state.elapsed - state.lastShotAt < interval) return { fired: false };
    state.lastShotAt = state.elapsed;
    a.mag -= 1;
    const speed = player.groundSpeed();
    const spread = w.spread + w.moveSpread * Math.min(1, speed / 5) + state.bloom;
    state.bloom = Math.min(0.05, state.bloom + w.recoil * 0.6);
    camera.getWorldDirection(direction);
    direction.x += (random() * 2 - 1) * spread;
    direction.y += (random() * 2 - 1) * spread;
    direction.z += (random() * 2 - 1) * spread;
    direction.normalize();
    muzzle.copy(camera.position).addScaledVector(direction, 0.6);
    muzzle.y -= 0.08;
    scene.updateMatrixWorld(true);
    raycaster.set(camera.position, direction);
    raycaster.far = w.range;
    const hits = raycaster.intersectObjects(shootables(), false);
    const end = tmpV.copy(direction).multiplyScalar(w.range).add(camera.position);
    let result = { fired: true, hit: null, killed: false };
    if (hits.length > 0) {
      const hit = hits[0];
      end.copy(hit.point);
      const bot = hit.object.userData.bot;
      if (bot && bot.alive) {
        const isHead = hit.object.userData.part === 'head';
        const dmg = Math.round(w.damage * (isHead ? w.headMult : 1));
        const killed = damageBot(bot, dmg, isHead);
        result = { fired: true, hit: bot.name + ':' + (isHead ? 'head' : 'body'), killed };
        hud.hitMarker(killed);
        if (killed) sfx.kill(); else sfx.hit();
        for (const b of bots) b.hearShot(camera.position.x, camera.position.z);
      }
    }
    tracers.fire(muzzle, end, muzzle);
    sfx.shot(w.id);
    // Recoil is one kick applied once here — never a per-frame offset, or
    // the view climbs with every shot.
    player.state.pitch = clamp(player.state.pitch + w.recoil + random() * 0.004, -1.5, 1.5);
    player.state.yaw += (random() * 2 - 1) * 0.004;
    syncHud();
    return result;
  }

  function damageBot(bot, dmg, isHead) {
    // Find the controller for this bot to call its damage fn.
    for (const c of bots) {
      if (c.bot === bot) {
        const killed = c.damage(dmg, isHead ? 'head' : 'body');
        if (killed) {
          state.money += KILL_REWARD;
          hud.killfeed('YOU ▸ ' + bot.name + (isHead ? ' (headshot)' : ''), true);
          checkRoundEnd();
        }
        return killed;
      }
    }
    return false;
  }

  function throwGrenade() {
    if (state.grenades <= 0 || state.phase !== 'round') return;
    state.grenades -= 1;
    sfx.grenadePin();
    camera.getWorldDirection(direction);
    const pos = camera.position.clone().addScaledVector(direction, 0.5);
    const vel = direction.clone().multiplyScalar(16);
    vel.y += 3.5;
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.09, 10, 8),
      new THREE.MeshStandardMaterial({ color: 0x2f4a3a, roughness: 0.5, metalness: 0.6 }),
    );
    mesh.position.copy(pos);
    scene.add(mesh);
    grenades.push({ pos, vel, fuse: 2.1, mesh });
    syncHud();
  }

  function explodeGrenade(g) {
    scene.remove(g.mesh);
    sfx.explosion();
    if (!explosionMesh) {
      explosionMesh = new THREE.Mesh(
        new THREE.SphereGeometry(1, 16, 12),
        new THREE.MeshBasicMaterial({ color: 0xffa030, transparent: true, opacity: 0.7 }),
      );
      scene.add(explosionMesh);
    }
    explosionMesh.position.copy(g.pos);
    explosionLife = 0.35;
    for (const c of bots) {
      if (!c.bot.alive) continue;
      const d = Math.hypot(c.bot.position.x - g.pos.x, c.bot.position.z - g.pos.z);
      if (d < 6) {
        const dmg = Math.round(120 * (1 - d / 7));
        const killed = c.damage(dmg, 'body');
        if (killed) {
          state.money += KILL_REWARD;
          hud.killfeed('YOU ▸ ' + c.bot.name + ' (frag)', true);
        }
      }
    }
    const pd = Math.hypot(player.state.position.x - g.pos.x, player.state.position.z - g.pos.z);
    if (pd < 5 && player.state.alive) hurtPlayer(Math.round(70 * (1 - pd / 6)), null);
    checkRoundEnd();
  }

  function hurtPlayer(dmg, fromBot) {
    if (!player.state.alive || state.phase !== 'round') return;
    if (player.state.armor) dmg = Math.round(dmg * 0.5);
    player.state.health -= dmg;
    hud.damageFlash();
    if (fromBot) {
      // Damage direction: angle of the shooter from the player's facing,
      // positive to the right (0 = straight ahead).
      const dx = fromBot.position.x - player.state.position.x;
      const dz = fromBot.position.z - player.state.position.z;
      const yaw = player.state.yaw;
      const dotRight = dx * Math.cos(yaw) - dz * Math.sin(yaw);
      const dotFwd = -dx * Math.sin(yaw) - dz * Math.cos(yaw);
      hud.damageDirection(Math.atan2(dotRight, dotFwd) * 180 / Math.PI);
    }
    sfx.hurt();
    hud.setHealth(player.state.health, player.state.armor);
    if (player.state.health <= 0) {
      player.state.health = 0;
      player.state.alive = false;
      hud.setHealth(0, player.state.armor);
      hud.killfeed((fromBot ? fromBot.name : 'FRAG') + ' ▸ YOU', false);
      endRound(false, 'You were eliminated');
    }
  }

  function onDamageBot(botCtrl, dmg) {
    const killed = botCtrl.damage(dmg, 'body');
    if (killed) {
      hud.killfeed(botCtrl.bot.name + ' was eliminated', botCtrl.bot.team === 'crimson');
      checkRoundEnd();
    }
    return killed;
  }

  function onDefused(bot) {
    if (state.spike.state !== 'planted') return;
    state.spike.state = 'none';
    hud.setSpike('none', 0, false);
    endRound(false, 'The spike was defused');
  }

  function plantSiteAtPlayer() {
    for (const key of ['A', 'B']) {
      const s = world.sites[key];
      const d = Math.hypot(player.state.position.x - s.x, player.state.position.z - s.z);
      if (d <= s.r) return { ...s, letter: key };
    }
    return null;
  }

  function checkRoundEnd() {
    if (state.phase !== 'round') return;
    const defendersAlive = bots.some((b) => b.bot.team === 'crimson' && b.bot.alive);
    if (!defendersAlive && state.spike.state !== 'planted') {
      endRound(true, 'Crimson squad eliminated');
    }
  }

  function assignDefuser() {
    let best = null;
    let bestD = Infinity;
    for (const b of bots) {
      if (b.bot.team !== 'crimson' || !b.bot.alive) continue;
      const d = Math.hypot(b.bot.position.x - state.spike.site.x, b.bot.position.z - state.spike.site.z);
      if (d < bestD) { bestD = d; best = b; }
    }
    state.defuser = best ? best.bot : null;
  }

  function endRound(won, reason) {
    if (state.phase !== 'round') return;
    state.phase = 'roundEnd';
    state.spike.state = 'none';
    hud.setSpike('none', 0, false);
    hud.setPlant(0, false, '');
    if (won) {
      state.scoreV += 1;
      state.lossStreak = 0;
      state.money += WIN_REWARD;
      sfx.roundWin();
      hud.banner('ROUND WON', reason + '  ·  +' + formatMoney(WIN_REWARD));
    } else {
      state.scoreC += 1;
      state.lossStreak += 1;
      // Losing streaks pay a little more each round, so an eco round after
      // two losses can still buy an SMG — the buy decision stays live.
      const lossPay = LOSS_REWARD + Math.min(LOSS_STREAK_CAP, (state.lossStreak - 1) * LOSS_STREAK_BONUS);
      state.money += lossPay;
      sfx.roundLose();
      hud.banner('ROUND LOST', reason + '  ·  +' + formatMoney(lossPay));
    }
    input.exitLock();
    state.time = 3.2;
    syncHud();
  }

  function spawnBots() {
    for (const b of bots) scene.remove(b.group);
    bots = [];
    const mk = (team, role, name, x, z, wps) => {
      const c = createBot(scene, { team, role, name, x, z, waypoints: wps, random });
      bots.push(c);
      return c;
    };
    mk('crimson', 'defender', 'CRIMSON-1', world.spawns.defendersA[0].x, world.spawns.defendersA[0].z, world.waypoints.A);
    mk('crimson', 'defender', 'CRIMSON-2', world.spawns.defendersA[1].x, world.spawns.defendersA[1].z, world.waypoints.A);
    mk('crimson', 'defender', 'CRIMSON-3', world.spawns.defendersB[0].x, world.spawns.defendersB[0].z, world.waypoints.B);
    mk('crimson', 'defender', 'CRIMSON-4', world.spawns.defendersB[1].x, world.spawns.defendersB[1].z, world.waypoints.B);
    const lanes = random() < 0.5 ? [world.waypoints.midA, world.waypoints.midB] : [world.waypoints.midB, world.waypoints.midA];
    mk('vanguard', 'attacker', 'VANGUARD-1', world.spawns.friendlies[0].x, world.spawns.friendlies[0].z, lanes[0]);
    mk('vanguard', 'attacker', 'VANGUARD-2', world.spawns.friendlies[1].x, world.spawns.friendlies[1].z, lanes[1]);
  }

  function startMatch() {
    state.round = 1;
    state.scoreV = 0;
    state.scoreC = 0;
    state.lossStreak = 0;
    state.money = 800;
    state.owned = new Set(['pistol']);
    state.weaponId = 'pistol';
    state.grenades = 0;
    player.state.armor = false;
    for (const id of Object.keys(WEAPONS)) {
      state.ammo[id] = { mag: WEAPONS[id].mag, reserve: WEAPONS[id].reserve };
    }
    camera.remove(viewModel);
    viewModel = createViewModel(camera, 'pistol');
    startBuyPhase();
  }

  function startBuyPhase() {
    state.phase = 'buy';
    state.time = BUY_TIME;
    state.spike = { state: 'none', site: null, timer: 0, progress: 0 };
    player.reset(world.spawns.player.x, world.spawns.player.z);
    // Yaw 0 faces -Z: straight up the yard toward Sites A and B.
    spawnBots();
    hud.hideOverlay();
    hud.showBuy(state.money, new Set([...state.owned, ...(player.state.armor ? ['armor'] : [])]), buy, startRound);
    hud.setBuyTimer(state.time);
    syncHud();
  }

  function buy(key) {
    if (state.phase !== 'buy') return;
    if (key === 'grenade') {
      if (state.money >= GRENADE_PRICE) {
        state.money -= GRENADE_PRICE;
        state.grenades += 1;
        sfx.buy();
      }
      hud.showBuy(state.money, new Set([...state.owned, ...(player.state.armor ? ['armor'] : [])]), buy, startRound);
      syncHud();
      return;
    }
    if (key === 'armor') {
      if (!player.state.armor && state.money >= ARMOR_PRICE) {
        state.money -= ARMOR_PRICE;
        player.state.armor = true;
        sfx.buy();
      }
      hud.showBuy(state.money, new Set([...state.owned, 'armor']), buy, startRound);
      syncHud();
      return;
    }
    const w = WEAPONS[key];
    if (!w || state.owned.has(key) || state.money < w.price) return;
    state.money -= w.price;
    state.owned.add(key);
    state.ammo[key] = { mag: w.mag, reserve: w.reserve };
    switchWeapon(key);
    sfx.buy();
    hud.showBuy(state.money, new Set([...state.owned, ...(player.state.armor ? ['armor'] : [])]), buy, startRound);
    syncHud();
  }

  function startRound() {
    if (state.phase !== 'buy') return;
    hud.hideBuy();
    state.phase = 'round';
    state.timeLeft = ROUND_TIME;
    state.time = ROUND_TIME;
    // Top the magazine up from reserve at round start.
    const w = currentWeapon();
    const a = state.ammo[state.weaponId];
    const take = Math.min(w.mag - a.mag, a.reserve);
    a.mag += take;
    a.reserve -= take;
    hud.banner('ROUND ' + state.round, 'Plant the spike at Site A or B — or eliminate Crimson', 2200);
    input.requestLock();
    syncHud();
  }

  function step(dt) {
    state.elapsed += dt;
    state.bloom = Math.max(0, state.bloom - dt * 0.09);
    hud.tick(dt);
    tracers.step(dt);
    if (explosionLife > 0) {
      explosionLife -= dt;
      const s = 1 + (0.35 - Math.max(0, explosionLife)) * 22;
      explosionMesh.scale.setScalar(Math.max(0.1, s));
      explosionMesh.material.opacity = Math.max(0, explosionLife / 0.35) * 0.7;
      if (explosionLife <= 0) explosionMesh.visible = false;
    }

    if (state.phase === 'buy') {
      state.time -= dt;
      hud.setBuyTimer(Math.max(0, state.time));
      if (input.wasPressed('Enter')) startRound();
      if (state.time <= 0) startRound();
      return;
    }
    if (state.phase === 'roundEnd') {
      state.time -= dt;
      if (state.time <= 0) {
        if (state.scoreV >= WIN_ROUNDS || state.scoreC >= WIN_ROUNDS || state.round >= MAX_ROUNDS) {
          state.phase = 'matchEnd';
          const won = state.scoreV > state.scoreC;
          hud.showOverlay('match', { won, v: state.scoreV, c: state.scoreC });
        } else {
          state.round += 1;
          startBuyPhase();
        }
      }
      return;
    }
    if (state.phase !== 'round') return;

    // Round timer (pauses once the spike is planted — the spike timer rules).
    if (state.spike.state !== 'planted') {
      state.timeLeft -= dt;
      if (state.timeLeft <= 0) {
        state.timeLeft = 0;
        endRound(false, 'Time expired — the spike was never planted');
        return;
      }
    }
    hud.setTimer(state.spike.state === 'planted' ? state.spike.timer : state.timeLeft);

    // Shooting / reload / weapon switch / grenade.
    completeReload();
    if (input.state.firing) shoot();
    if (input.wasPressed('KeyR')) reload();
    if (input.wasPressed('KeyG')) throwGrenade();
    if (input.wasPressed('Digit1')) switchWeapon('pistol');
    if (input.wasPressed('Digit2')) switchWeapon('smg');
    if (input.wasPressed('Digit3')) switchWeapon('rifle');
    if (input.wasPressed('Digit4')) switchWeapon('sniper');

    // Footsteps: one soft tick per ~2.6 m walked on the ground.
    if (player.state.alive && player.state.onGround) {
      const spd = player.groundSpeed();
      if (spd > 2) {
        stepAcc += spd * dt;
        if (stepAcc > 2.6) { stepAcc = 0; sfx.step(); }
      } else {
        stepAcc = 0;
      }
    }

    // Aim (right mouse): sniper scope zooms the most.
    const targetFov = input.state.aiming ? 74 / currentWeapon().zoom : 74;
    if (Math.abs(camera.fov - targetFov) > 0.1) {
      camera.fov += (targetFov - camera.fov) * Math.min(1, dt * 10);
      camera.updateProjectionMatrix();
    }

    // Planting: hold E inside a site.
    const site = plantSiteAtPlayer();
    if (site && state.spike.state === 'none' && input.state.keys.has('KeyE')) {
      state.spike.progress += dt / PLANT_TIME;
      hud.setPlant(clamp(state.spike.progress, 0, 1), true, 'PLANTING SPIKE — hold E');
      if (Math.floor(state.spike.progress * 8) !== Math.floor((state.spike.progress - dt / PLANT_TIME) * 8)) sfx.plantBeep();
      if (state.spike.progress >= 1) {
        state.spike.state = 'planted';
        state.spike.site = site;
        state.spike.timer = SPIKE_TIME;
        state.money += PLANT_REWARD;
        hud.setPlant(0, false, '');
        hud.banner('SPIKE PLANTED AT SITE ' + site.letter, 'Defend it for ' + SPIKE_TIME + 's  ·  +' + formatMoney(PLANT_REWARD));
        hud.radio('VANGUARD-1: Spike down at Site ' + site.letter + ' — hold the site!');
        sfx.radio();
        sfx.spikeBeep();
        assignDefuser();
        for (const b of bots) b.hearShot(site.x, site.z);
        syncHud();
      }
    } else {
      state.spike.progress = Math.max(0, state.spike.progress - dt * 2);
      hud.setPlant(state.spike.progress, state.spike.progress > 0, 'PLANTING SPIKE — hold E');
    }

    // Spike countdown.
    if (state.spike.state === 'planted') {
      state.spike.timer -= dt;
      const defusing = bots.some((b) => b.bot.defusing && b.bot.alive);
      hud.setSpike('planted', Math.max(0, state.spike.timer), defusing);
      if (Math.ceil(state.spike.timer) !== Math.ceil(state.spike.timer + dt)) sfx.spikeBeep();
      if (state.spike.timer <= 0) {
        // Detonation: wipe defenders near the site, round won.
        const g = { pos: new THREE.Vector3(state.spike.site.x, 0.5, state.spike.site.z), mesh: null };
        explodeGrenade({ ...g, mesh: new THREE.Mesh() });
        state.spike.state = 'none';
        endRound(true, 'Spike detonated at Site ' + state.spike.site.letter);
        return;
      }
    }

    // Grenades.
    for (let i = grenades.length - 1; i >= 0; i -= 1) {
      const g = grenades[i];
      g.fuse -= dt;
      g.vel.y -= 14 * dt;
      g.pos.addScaledVector(g.vel, dt);
      if (g.pos.y < 0.09) {
        g.pos.y = 0.09;
        g.vel.y = Math.abs(g.vel.y) * 0.35;
        g.vel.x *= 0.7;
        g.vel.z *= 0.7;
      }
      g.mesh.position.copy(g.pos);
      if (g.fuse <= 0) {
        grenades.splice(i, 1);
        explodeGrenade(g);
        if (state.phase !== 'round') return;
      }
    }

    // Bots.
    const ctx = {
      time: state.elapsed,
      colliders: world.colliders,
      player,
      bots,
      spike: state.spike,
      tracers,
      sfx,
      random,
      onDamagePlayer: (dmg, fromBot) => hurtPlayer(dmg, fromBot),
      onDamageBot: (botCtrl, dmg) => onDamageBot(botCtrl, dmg),
      onDefused,
      onCallout: (text) => { hud.radio(text); sfx.radio(); },
      isDefuser: false,
    };
    for (const b of bots) {
      ctx.isDefuser = state.defuser === b.bot;
      b.step(dt, ctx);
      if (state.phase !== 'round') return;
    }
    if (state.defuser && !state.defuser.alive) assignDefuser();

    // Crosshair spread follows movement + bloom.
    const spreadPx = 4 + player.groundSpeed() * 1.6 + state.bloom * 220;
    hud.setCrosshairSpread(spreadPx);

    // Minimap.
    hud.drawMinimap(world, player, bots, state.elapsed);
  }

  function syncCamera(camera) {
    camera.position.set(player.state.position.x, player.state.position.y + player.state.eye, player.state.position.z);
    camera.rotation.set(player.state.pitch, player.state.yaw, 0, 'YXZ');
  }

  return {
    state, bots: () => bots, syncHud, syncCamera, startMatch, startRound, step,
    shoot, throwGrenade, switchWeapon, buy, hurtPlayer,
  };
}
