// map.js — "Sector Nine": an original dusk industrial yard, built from boxes.
// Three lanes: west lane to Site A, east lane to Site B, and a mid lane with a
// broken wall gap. Crates and containers make corners and sightlines. All
// collision is analytic AABBs (colliders), so bots and the player share one
// collision model and line of sight is one function call.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

const WALL_H = 3.4;

function box(scene, colliders, shootables, mat, x, y, z, w, h, d, collide = true) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  mesh.position.set(x, y + h / 2, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);
  if (collide) {
    colliders.push({ x0: x - w / 2, x1: x + w / 2, y0: y, y1: y + h, z0: z - d / 2, z1: z + d / 2 });
    shootables.push(mesh);
  }
  return mesh;
}

function siteLetterTexture(letter, color) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const g = c.getContext('2d');
  g.clearRect(0, 0, 256, 256);
  g.strokeStyle = color;
  g.lineWidth = 10;
  g.strokeRect(14, 14, 228, 228);
  g.fillStyle = color;
  g.font = 'bold 150px system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(letter, 128, 136);
  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 4;
  return tex;
}

export function createMap(scene) {
  const colliders = [];
  const shootables = [];
  const mat = (color, opts = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.92, metalness: 0.06, ...opts });

  const groundMat = mat(PALETTE.ground);
  const wallMat = mat(PALETTE.wall);
  const wallDarkMat = mat(PALETTE.wallDark);
  const crateMat = mat(PALETTE.crate);
  const crateAltMat = mat(PALETTE.crateAlt);
  const contAMat = mat(PALETTE.containerA);
  const contBMat = mat(PALETTE.containerB);

  // Lights: low dusk sun + cool hemisphere, warm site lamps.
  scene.add(new THREE.HemisphereLight(0x8fa3b8, 0x1a1611, 1.05));
  const sun = new THREE.DirectionalLight(0xffb36b, 1.9);
  sun.position.set(-18, 26, 14);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -30;
  sun.shadow.camera.right = 30;
  sun.shadow.camera.top = 30;
  sun.shadow.camera.bottom = -30;
  sun.shadow.camera.far = 80;
  scene.add(sun);
  const lampA = new THREE.PointLight(PALETTE.siteA, 24, 18, 1.8);
  lampA.position.set(-15, 4.4, -13);
  scene.add(lampA);
  const lampB = new THREE.PointLight(PALETTE.siteB, 24, 18, 1.8);
  lampB.position.set(15, 4.4, -13);
  scene.add(lampB);

  // Ground: one slab plus a grid of darker seams (visual only).
  const ground = new THREE.Mesh(new THREE.BoxGeometry(46, 0.2, 38), groundMat);
  ground.position.set(0, -0.1, 0);
  ground.receiveShadow = true;
  scene.add(ground);
  shootables.push(ground);
  const seamMat = new THREE.MeshBasicMaterial({ color: PALETTE.groundLine });
  for (let x = -20; x <= 20; x += 10) {
    const seam = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.02, 38), seamMat);
    seam.position.set(x, 0.01, 0);
    scene.add(seam);
  }
  for (let z = -15; z <= 15; z += 10) {
    const seam = new THREE.Mesh(new THREE.BoxGeometry(46, 0.02, 0.08), seamMat);
    seam.position.set(0, 0.01, z);
    scene.add(seam);
  }

  // Perimeter walls (map is 44 x 36, centred on origin).
  box(scene, colliders, shootables, wallMat, 0, 0, -18, 46, WALL_H, 1);
  box(scene, colliders, shootables, wallMat, 0, 0, 18, 46, WALL_H, 1);
  box(scene, colliders, shootables, wallMat, -22.5, 0, 0, 1, WALL_H, 38);
  box(scene, colliders, shootables, wallMat, 22.5, 0, 0, 1, WALL_H, 38);

  // Mid wall with a gap at x in [-2, 2] and a side gap at x in [12, 16].
  box(scene, colliders, shootables, wallDarkMat, -12, 0, -2, 20, WALL_H, 1);
  box(scene, colliders, shootables, wallDarkMat, 9, 0, -2, 6, WALL_H, 1);
  box(scene, colliders, shootables, wallDarkMat, 19, 0, -2, 6, WALL_H, 1);

  // West lane cover (to Site A) and east lane cover (to Site B).
  box(scene, colliders, shootables, crateMat, -14, 0, 6, 3, 1.2, 3);
  box(scene, colliders, shootables, crateAltMat, -14, 1.2, 6, 2, 1.1, 2);
  box(scene, colliders, shootables, crateMat, -8, 0, 12, 4, 1.2, 2);
  box(scene, colliders, shootables, crateAltMat, 14, 0, 6, 3, 1.2, 3);
  box(scene, colliders, shootables, crateMat, 8, 0, 12, 4, 1.2, 2);
  box(scene, colliders, shootables, crateAltMat, 0, 0, 8, 2, 1.2, 2);

  // Containers: long sightline blockers near mid.
  box(scene, colliders, shootables, contAMat, -6, 0, -8, 6, 2.6, 2.4);
  box(scene, colliders, shootables, contBMat, 7, 0, -8, 6, 2.6, 2.4);
  box(scene, colliders, shootables, contAMat, -18, 0, -8, 2.4, 2.6, 6);
  box(scene, colliders, shootables, contBMat, 18, 0, -8, 2.4, 2.6, 6);

  // Site A crates (west) and Site B crates (east).
  box(scene, colliders, shootables, crateAltMat, -17, 0, -14, 3, 1.2, 3);
  box(scene, colliders, shootables, crateMat, -12, 0, -15, 2, 1.2, 2);
  box(scene, colliders, shootables, crateAltMat, 17, 0, -14, 3, 1.2, 3);
  box(scene, colliders, shootables, crateMat, 12, 0, -15, 2, 1.2, 2);
  box(scene, colliders, shootables, crateAltMat, -19, 0, 2, 2, 2.2, 2);
  box(scene, colliders, shootables, crateAltMat, 19, 0, 2, 2, 2.2, 2);

  // Site markers: painted ground plates with A / B letters.
  function sitePlate(letter, color, x, z) {
    const tex = siteLetterTexture(letter, color);
    const plate = new THREE.Mesh(
      new THREE.PlaneGeometry(5, 5),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.85, depthWrite: false }),
    );
    plate.rotation.x = -Math.PI / 2;
    plate.position.set(x, 0.02, z);
    scene.add(plate);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(2.4, 2.6, 40),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.6, side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(x, 0.03, z);
    scene.add(ring);
  }
  sitePlate('A', '#f0a830', -15, -13);
  sitePlate('B', '#35c4d8', 15, -13);

  // Skyline silhouettes outside the walls (visual only, no collision).
  const skyMat = new THREE.MeshBasicMaterial({ color: PALETTE.sky });
  const skyline = [[-30, -28, 8, 14], [-12, -30, 10, 18], [8, -30, 7, 12], [26, -28, 9, 16], [-34, 0, 6, 20], [34, 4, 6, 18]];
  for (const [x, z, w, h] of skyline) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, 2), skyMat);
    b.position.set(x, h / 2, z);
    scene.add(b);
  }

  const sites = {
    A: { letter: 'A', x: -15, z: -13, r: 3.4, color: PALETTE.siteA },
    B: { letter: 'B', x: 15, z: -13, r: 3.4, color: PALETTE.siteB },
  };

  const spawns = {
    player: { x: 0, z: 15 },
    friendlies: [{ x: -4, z: 15 }, { x: 4, z: 15 }],
    // Spawn points sit clear of the site containers: (-17,-10) and (17,-10)
    // used to be inside them, so defenders spawned embedded in a box.
    defendersA: [{ x: -19, z: -13 }, { x: -12, z: -15 }],
    defendersB: [{ x: 19, z: -13 }, { x: 12, z: -15 }],
  };

  // Patrol waypoints: defenders hold near their site, friendlies push a lane.
  // Every waypoint is clear of solid boxes: (-17,-10) / (17,-10) used to sit
  // inside the site containers and trapped patrolling bots against them.
  const waypoints = {
    A: [
      { x: -19, z: -13 }, { x: -13, z: -8 }, { x: -18, z: -14 }, { x: -11, z: -13 },
      { x: -16, z: -6 }, { x: -14, z: -11 },
    ],
    B: [
      { x: 19, z: -13 }, { x: 13, z: -8 }, { x: 18, z: -14 }, { x: 11, z: -13 },
      { x: 16, z: -6 }, { x: 14, z: -11 },
    ],
    midA: [{ x: -4, z: 12 }, { x: -8, z: 4 }, { x: -12, z: -4 }, { x: -14, z: -9 }],
    midB: [{ x: 4, z: 12 }, { x: 8, z: 4 }, { x: 12, z: -4 }, { x: 14, z: -9 }],
    mid: [{ x: 0, z: 10 }, { x: 0, z: 2 }, { x: 0, z: -6 }, { x: -4, z: 2 }],
  };

  return { colliders, shootables, sites, spawns, waypoints, bounds: { x: 21.5, z: 17.5 } };
}
