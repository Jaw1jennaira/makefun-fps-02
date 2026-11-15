// util.js — small shared helpers. No per-frame allocation in the hot paths:
// callers pass scratch objects in, and the segment test works on plain numbers.
export function mulberry32(initial) {
  let a = initial | 0;
  return function random() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

// Slab test: does the segment p -> p+d hit the AABB [min, max]? t in [0,1].
export function segmentHitsBox(px, py, pz, dx, dy, dz, b) {
  let tmin = 0;
  let tmax = 1;
  // X
  if (dx === 0) {
    if (px < b.x0 || px > b.x1) return false;
  } else {
    let t1 = (b.x0 - px) / dx;
    let t2 = (b.x1 - px) / dx;
    if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
    if (t1 > tmin) tmin = t1;
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return false;
  }
  // Y
  if (dy === 0) {
    if (py < b.y0 || py > b.y1) return false;
  } else {
    let t1 = (b.y0 - py) / dy;
    let t2 = (b.y1 - py) / dy;
    if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
    if (t1 > tmin) tmin = t1;
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return false;
  }
  // Z
  if (dz === 0) {
    if (pz < b.z0 || pz > b.z1) return false;
  } else {
    let t1 = (b.z0 - pz) / dz;
    let t2 = (b.z1 - pz) / dz;
    if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
    if (t1 > tmin) tmin = t1;
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return false;
  }
  return true;
}

// Any solid box between the two points? Used for line of sight.
export function losBlocked(ax, ay, az, bx, by, bz, boxes) {
  const dx = bx - ax;
  const dy = by - ay;
  const dz = bz - az;
  for (let i = 0; i < boxes.length; i += 1) {
    if (segmentHitsBox(ax, ay, az, dx, dy, dz, boxes[i])) return true;
  }
  return false;
}

// Move an AABB body (half extents hx, hz; height h) with axis separation.
// pos is mutated in place; returns true if any axis collided.
export function moveBody(pos, dx, dy, dz, hx, hz, h, boxes) {
  let hit = false;
  pos.x += dx;
  for (let i = 0; i < boxes.length; i += 1) {
    const b = boxes[i];
    if (pos.x + hx > b.x0 && pos.x - hx < b.x1 && pos.y + h > b.y0 && pos.y < b.y1 && pos.z + hz > b.z0 && pos.z - hz < b.z1) {
      pos.x = dx > 0 ? b.x0 - hx : b.x1 + hx;
      hit = true;
    }
  }
  pos.z += dz;
  for (let i = 0; i < boxes.length; i += 1) {
    const b = boxes[i];
    if (pos.x + hx > b.x0 && pos.x - hx < b.x1 && pos.y + h > b.y0 && pos.y < b.y1 && pos.z + hz > b.z0 && pos.z - hz < b.z1) {
      pos.z = dz > 0 ? b.z0 - hz : b.z1 + hz;
      hit = true;
    }
  }
  pos.y += dy;
  for (let i = 0; i < boxes.length; i += 1) {
    const b = boxes[i];
    if (pos.x + hx > b.x0 && pos.x - hx < b.x1 && pos.y + h > b.y0 && pos.y < b.y1 && pos.z + hz > b.z0 && pos.z - hz < b.z1) {
      pos.y = dy > 0 ? b.y0 - h : b.y1;
      hit = true;
    }
  }
  return hit;
}

export function formatMoney(n) {
  return '$' + Math.round(n).toLocaleString('en-US');
}

export function formatTime(seconds) {
  const s = Math.max(0, Math.ceil(seconds));
  return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
}
