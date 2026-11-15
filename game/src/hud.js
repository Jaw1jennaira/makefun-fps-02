// hud.js — every DOM element the game shows. The 3D scene never touches the
// DOM directly; game.js calls these setters and hud.js owns the markup.
// Includes the buy menu, the round banners, the killfeed and a live minimap.
import { formatMoney, formatTime } from './util.js';
import { WEAPONS, GRENADE_PRICE, ARMOR_PRICE } from './weapons.js';

export function createHud() {
  const $ = (id) => document.getElementById(id);
  const el = {
    healthBar: $('health-fill'), healthNum: $('health-num'), armorTag: $('armor-tag'),
    ammoMag: $('ammo-mag'), ammoReserve: $('ammo-reserve'), ammoBox: $('ammo'),
    money: $('money'), timer: $('timer'), roundLabel: $('round-label'),
    scoreV: $('score-v'), scoreC: $('score-c'),
    crosshair: $('crosshair'), hitmarker: $('hitmarker'),
    killfeed: $('killfeed'), banner: $('banner'), bannerTitle: $('banner-title'), bannerSub: $('banner-sub'),
    overlay: $('overlay'), overlayTitle: $('overlay-title'), overlayCopy: $('overlay-copy'),
    playBtn: $('play'), buyPanel: $('buy-panel'), buyList: $('buy-list'), buyMoney: $('buy-money'),
    buyTimer: $('buy-timer'), buyClose: $('buy-close'),
    spikeBar: $('spike-bar'), spikeFill: $('spike-fill'), spikeLabel: $('spike-label'),
    plantBar: $('plant-bar'), plantFill: $('plant-fill'), plantLabel: $('plant-label'),
    damage: $('damage'), minimap: $('minimap'),
    weaponName: $('weapon-name'), grenades: $('grenades'),
    dmgdir: $('dmgdir'), radio: $('radio'),
  };
  const mapCtx = el.minimap.getContext('2d');
  let hitTimer = 0;
  let bannerTimer = 0;
  let dmgTimer = 0;
  let radioTimer = 0;

  function setHealth(hp, armor) {
    el.healthNum.textContent = Math.max(0, Math.ceil(hp));
    el.healthBar.style.width = Math.max(0, hp) + '%';
    el.healthBar.style.background = hp > 50 ? '#35c4a8' : hp > 25 ? '#f0a830' : '#e4572e';
    el.armorTag.style.display = armor ? 'inline' : 'none';
  }

  function setAmmo(mag, reserve) {
    el.ammoMag.textContent = mag;
    el.ammoReserve.textContent = '/ ' + reserve;
    el.ammoBox.classList.toggle('empty', mag === 0);
  }

  function setWeapon(name, grenades) {
    el.weaponName.textContent = name;
    el.grenades.textContent = grenades > 0 ? '◉ ' + grenades + ' FRAG' : '';
  }

  function setMoney(m) { el.money.textContent = formatMoney(m); }
  function setTimer(s) {
    el.timer.textContent = formatTime(s);
    el.timer.style.color = s <= 10 ? '#e4572e' : '';
  }
  function setScore(v, c, round, maxRounds) {
    el.scoreV.textContent = v;
    el.scoreC.textContent = c;
    el.roundLabel.textContent = 'ROUND ' + round + ' / ' + maxRounds;
  }

  function hitMarker(kill) {
    el.hitmarker.classList.add('on');
    el.hitmarker.classList.toggle('kill', kill);
    hitTimer = kill ? 220 : 90;
  }

  function damageFlash() {
    el.damage.style.opacity = '0.55';
    setTimeout(() => { el.damage.style.opacity = '0'; }, 120);
  }

  // Points the red wedge at the shooter: deg is the angle from the player's
  // facing, positive to the right (0 = straight ahead).
  function damageDirection(deg) {
    el.dmgdir.style.transform = 'rotate(' + deg.toFixed(1) + 'deg)';
    el.dmgdir.style.opacity = '1';
    dmgTimer = 700;
  }

  // One radio line at a time; a new callout replaces the old one.
  function radio(text) {
    el.radio.textContent = text;
    el.radio.style.opacity = '1';
    radioTimer = 3200;
  }

  function killfeed(text, friendly) {
    const div = document.createElement('div');
    div.className = 'feed-line' + (friendly ? ' friendly' : '');
    div.textContent = text;
    el.killfeed.prepend(div);
    while (el.killfeed.children.length > 5) el.killfeed.removeChild(el.killfeed.lastChild);
    setTimeout(() => { if (div.parentNode) div.parentNode.removeChild(div); }, 6000);
  }

  function banner(title, sub, ms = 2600) {
    el.bannerTitle.textContent = title;
    el.bannerSub.textContent = sub || '';
    el.banner.hidden = false;
    bannerTimer = ms;
  }

  function showOverlay(kind, data = {}) {
    el.overlay.hidden = false;
    el.playBtn.style.display = '';
    if (kind === 'start') {
      el.overlayTitle.textContent = 'SECTOR NINE';
      el.overlayCopy.textContent = 'Tactical FPS — Vanguard vs Crimson. Plant the spike at Site A or B, or eliminate the Crimson squad. First to 4 rounds takes the match.';
      el.playBtn.textContent = 'Click to play';
    } else if (kind === 'paused') {
      el.overlayTitle.textContent = 'PAUSED';
      el.overlayCopy.textContent = 'Click to resume the round.';
      el.playBtn.textContent = 'Resume';
    } else if (kind === 'match') {
      el.overlayTitle.textContent = data.won ? 'VICTORY — SECTOR NINE SECURED' : 'DEFEAT — CRIMSON HOLDS THE YARD';
      el.overlayCopy.textContent = 'Final score Vanguard ' + data.v + ' — ' + data.c + ' Crimson. ' + (data.won ? 'The yard is yours.' : 'Regroup and run it back.');
      el.playBtn.textContent = 'Play again';
    }
  }

  function hideOverlay() { el.overlay.hidden = true; }
  function hideBanner() { el.banner.hidden = true; }

  function showBuy(money, owned, onBuy, onClose) {
    el.buyPanel.hidden = false;
    el.buyMoney.textContent = formatMoney(money);
    el.buyList.innerHTML = '';
    const rows = [];
    for (const w of Object.values(WEAPONS)) {
      rows.push({ key: w.id, name: w.name, price: w.price, desc: w.damage + ' dmg · ' + w.mag + ' rnd mag' + (w.auto ? ' · auto' : ' · semi'), owned: owned.has(w.id) });
    }
    rows.push({ key: 'grenade', name: 'Frag Grenade', price: GRENADE_PRICE, desc: 'Throw with G · 120 dmg blast', owned: false });
    rows.push({ key: 'armor', name: 'Combat Armor', price: ARMOR_PRICE, desc: 'Halves damage taken this round', owned: owned.has('armor') });
    for (const r of rows) {
      const div = document.createElement('div');
      div.className = 'buy-row' + (r.owned ? ' owned' : '');
      div.innerHTML = '<b>' + r.name + '</b><span>' + r.desc + '</span><em>' + (r.owned ? 'OWNED' : formatMoney(r.price)) + '</em>';
      if (!r.owned) div.addEventListener('click', () => onBuy(r.key));
      el.buyList.appendChild(div);
    }
    el.buyClose.onclick = onClose;
  }
  function hideBuy() { el.buyPanel.hidden = true; }
  function setBuyTimer(s) { el.buyTimer.textContent = 'Round starts in ' + Math.ceil(s) + 's — press ENTER to start now'; }

  function setSpike(state, seconds, defusing) {
    if (state === 'none') {
      el.spikeBar.hidden = true;
      return;
    }
    el.spikeBar.hidden = false;
    if (state === 'planted') {
      el.spikeLabel.textContent = defusing ? '⚠ SPIKE BEING DEFUSED' : 'SPIKE ARMED — detonation in ' + Math.ceil(seconds) + 's';
      el.spikeFill.style.width = Math.max(0, (seconds / 35) * 100) + '%';
      el.spikeFill.style.background = defusing ? '#e4572e' : '#f0a830';
    }
  }

  function setPlant(progress, visible, label) {
    el.plantBar.hidden = !visible;
    if (visible) {
      el.plantFill.style.width = Math.round(progress * 100) + '%';
      el.plantLabel.textContent = label;
    }
  }

  function setCrosshairSpread(px) {
    el.crosshair.style.setProperty('--gap', px + 'px');
  }

  // Minimap: walls as blocks, sites as letters, dots for the player (white),
  // friendlies (teal) and enemies spotted in the last 2 s (red).
  function drawMinimap(map, player, bots, time) {
    const W = 150;
    const H = 124;
    mapCtx.clearRect(0, 0, W, H);
    mapCtx.fillStyle = 'rgba(13,17,23,0.72)';
    mapCtx.fillRect(0, 0, W, H);
    const sx = (x) => (x + 23) / 46 * W;
    const sz = (z) => (z + 19) / 38 * H;
    mapCtx.fillStyle = '#3a4149';
    for (const b of map.colliders) {
      mapCtx.fillRect(sx(b.x0), sz(b.z0), Math.max(1, sx(b.x1) - sx(b.x0)), Math.max(1, sz(b.z1) - sz(b.z0)));
    }
    mapCtx.font = 'bold 11px system-ui';
    mapCtx.textAlign = 'center';
    mapCtx.fillStyle = '#f0a830';
    mapCtx.fillText('A', sx(-15), sz(-13) + 4);
    mapCtx.fillStyle = '#35c4d8';
    mapCtx.fillText('B', sx(15), sz(-13) + 4);
    const dot = (x, z, color, r = 3) => {
      mapCtx.fillStyle = color;
      mapCtx.beginPath();
      mapCtx.arc(sx(x), sz(z), r, 0, Math.PI * 2);
      mapCtx.fill();
    };
    for (const b of bots) {
      if (!b.bot.alive) continue;
      if (b.bot.team === 'vanguard') dot(b.bot.position.x, b.bot.position.z, '#35c4a8', 2.5);
      else if (b.bot.lastSeen && time - b.bot.lastSeen.time < 2) dot(b.bot.position.x, b.bot.position.z, '#e4572e', 2.5);
    }
    dot(player.state.position.x, player.state.position.z, '#ffffff', 3.5);
  }

  function tick(dt) {
    if (hitTimer > 0) {
      hitTimer -= dt * 1000;
      if (hitTimer <= 0) el.hitmarker.classList.remove('on', 'kill');
    }
    if (bannerTimer > 0) {
      bannerTimer -= dt * 1000;
      if (bannerTimer <= 0) hideBanner();
    }
    if (dmgTimer > 0) {
      dmgTimer -= dt * 1000;
      if (dmgTimer <= 0) el.dmgdir.style.opacity = '0';
    }
    if (radioTimer > 0) {
      radioTimer -= dt * 1000;
      if (radioTimer <= 0) el.radio.style.opacity = '0';
    }
  }

  return {
    setHealth, setAmmo, setWeapon, setMoney, setTimer, setScore,
    hitMarker, damageFlash, damageDirection, radio, killfeed, banner, showOverlay, hideOverlay,
    showBuy, hideBuy, setBuyTimer, setSpike, setPlant, setCrosshairSpread,
    drawMinimap, tick,
    onPlay(fn) { el.playBtn.addEventListener('click', fn); },
  };
}
