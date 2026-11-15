// weapons.js — the arsenal. Each weapon is data: price, damage, fire rate,
// magazine, spread and recoil. Spread grows while moving and firing, so
// stopping to aim pays; headshots deal 2.5x. Tracers and the muzzle flash
// are pooled and reused — nothing is allocated per shot in the hot loop.
import * as THREE from 'three';

export const WEAPONS = {
  pistol: {
    id: 'pistol', name: 'P9 Sidearm', price: 0, damage: 26, headMult: 2.5,
    mag: 12, reserve: 48, auto: false, interval: 0.24, reloadTime: 1.1,
    spread: 0.011, moveSpread: 0.02, recoil: 0.011, range: 60, zoom: 1,
  },
  smg: {
    id: 'smg', name: 'VK-9 SMG', price: 900, damage: 22, headMult: 2.5,
    mag: 30, reserve: 120, auto: true, interval: 0.09, reloadTime: 1.5,
    spread: 0.016, moveSpread: 0.03, recoil: 0.008, range: 50, zoom: 1,
  },
  rifle: {
    id: 'rifle', name: 'AR-77 Rifle', price: 2700, damage: 33, headMult: 2.5,
    mag: 30, reserve: 90, auto: true, interval: 0.11, reloadTime: 1.9,
    spread: 0.009, moveSpread: 0.024, recoil: 0.013, range: 80, zoom: 1.25,
  },
  sniper: {
    id: 'sniper', name: 'LW-50 Longshot', price: 4750, damage: 95, headMult: 2.5,
    mag: 5, reserve: 15, auto: false, interval: 1.15, reloadTime: 2.6,
    spread: 0.001, moveSpread: 0.05, recoil: 0.05, range: 100, zoom: 3,
  },
};

export const GRENADE_PRICE = 300;
export const ARMOR_PRICE = 650;

const GUN_COLORS = {
  pistol: 0x2b3138, smg: 0x2f4a3a, rifle: 0x3a3230, sniper: 0x24303a,
};

// A low-poly view-model gun built from boxes, attached to the camera.
export function createViewModel(camera, weaponId) {
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color: GUN_COLORS[weaponId] ?? 0x2b3138, roughness: 0.5, metalness: 0.6 });
  const accentMat = new THREE.MeshStandardMaterial({ color: 0xf0a830, roughness: 0.4, metalness: 0.5 });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x14181c, roughness: 0.6, metalness: 0.4 });
  const sizes = {
    pistol: { len: 0.26, h: 0.09, grip: 0.11 },
    smg: { len: 0.42, h: 0.09, grip: 0.13 },
    rifle: { len: 0.55, h: 0.1, grip: 0.14 },
    sniper: { len: 0.72, h: 0.09, grip: 0.14 },
  };
  const s = sizes[weaponId] ?? sizes.rifle;
  const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.07, s.h, s.len), bodyMat);
  receiver.position.set(0, 0, -s.len / 2);
  group.add(receiver);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.16, 8), darkMat);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, 0.01, -s.len - 0.06);
  group.add(barrel);
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.06, s.grip, 0.07), darkMat);
  grip.position.set(0, -s.h / 2 - s.grip / 2 + 0.02, -s.len * 0.25);
  grip.rotation.x = 0.25;
  group.add(grip);
  const sight = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.05, 0.03), accentMat);
  sight.position.set(0, s.h / 2 + 0.02, -s.len * 0.55);
  group.add(sight);
  if (weaponId === 'sniper') {
    const scope = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.2, 10), darkMat);
    scope.rotation.x = Math.PI / 2;
    scope.position.set(0, s.h / 2 + 0.03, -s.len * 0.5);
    group.add(scope);
  }
  if (weaponId === 'smg' || weaponId === 'rifle') {
    const mag = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.14, 0.06), darkMat);
    mag.position.set(0, -s.h / 2 - 0.05, -s.len * 0.5);
    mag.rotation.x = 0.12;
    group.add(mag);
  }
  group.position.set(0.22, -0.2, -0.35);
  group.rotation.y = 0.04;
  camera.add(group);
  return group;
}

// Pooled tracers: 16 lines, reused round-robin, fading out over 70 ms.
export function createTracers(scene) {
  const pool = [];
  for (let i = 0; i < 16; i += 1) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0 }));
    line.frustumCulled = false;
    scene.add(line);
    pool.push({ line, life: 0 });
  }
  let next = 0;
  const flash = new THREE.PointLight(0xffc46b, 0, 9, 2);
  scene.add(flash);
  return {
    fire(from, to, muzzle = null) {
      const t = pool[next];
      next = (next + 1) % pool.length;
      const p = t.line.geometry.attributes.position.array;
      p[0] = from.x; p[1] = from.y; p[2] = from.z;
      p[3] = to.x; p[4] = to.y; p[5] = to.z;
      t.line.geometry.attributes.position.needsUpdate = true;
      t.line.material.opacity = 0.9;
      t.life = 0.07;
      if (muzzle) {
        flash.position.copy(muzzle);
        flash.intensity = 14;
      }
    },
    step(dt) {
      for (const t of pool) {
        if (t.life > 0) {
          t.life -= dt;
          t.line.material.opacity = Math.max(0, t.life / 0.07) * 0.9;
        }
      }
      if (flash.intensity > 0) flash.intensity = Math.max(0, flash.intensity - dt * 220);
    },
  };
}
