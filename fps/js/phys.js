'use strict';
// Física simples: colisores AABB num hash espacial, corpos cilíndricos (aprox. caixa),
// degraus, escadas de mão e raycast contra terreno, água e colisores.

const Phys = {
  CELL: 8,
  cells: new Map(),
  stamp: 1,
  ladders: [],

  key(ix, iz) { return (ix + 2048) * 4096 + (iz + 2048); },

  // c = {x0,y0,z0,x1,y1,z1, mat, ...}. bx = caixa usada para registrar (padrão: a própria).
  add(c, reg = c) {
    c._cells = [];
    const ix0 = Math.floor(reg.x0 / this.CELL), ix1 = Math.floor(reg.x1 / this.CELL);
    const iz0 = Math.floor(reg.z0 / this.CELL), iz1 = Math.floor(reg.z1 / this.CELL);
    for (let ix = ix0; ix <= ix1; ix++) for (let iz = iz0; iz <= iz1; iz++) {
      const k = this.key(ix, iz);
      let a = this.cells.get(k);
      if (!a) { a = []; this.cells.set(k, a); }
      a.push(c); c._cells.push(a);
    }
    return c;
  },
  remove(c) {
    if (!c._cells) return;
    for (const a of c._cells) { const i = a.indexOf(c); if (i >= 0) a.splice(i, 1); }
    c._cells = null;
  },

  // Colisores cujo retângulo XZ toca [x0,x1]×[z0,z1].
  query(x0, z0, x1, z1, out) {
    out.length = 0;
    const s = ++this.stamp;
    const ix0 = Math.floor(x0 / this.CELL), ix1 = Math.floor(x1 / this.CELL);
    const iz0 = Math.floor(z0 / this.CELL), iz1 = Math.floor(z1 / this.CELL);
    for (let ix = ix0; ix <= ix1; ix++) for (let iz = iz0; iz <= iz1; iz++) {
      const a = this.cells.get(this.key(ix, iz));
      if (!a) continue;
      for (let i = 0; i < a.length; i++) {
        const c = a[i];
        if (c._s === s || c.off) continue;
        c._s = s;
        if (c.x1 < x0 || c.x0 > x1 || c.z1 < z0 || c.z0 > z1) continue;
        out.push(c);
      }
    }
    return out;
  },

  _tmp: [],
  _tmp2: [],

  // Há algum colisor ocupando a caixa?
  blocked(x0, y0, z0, x1, y1, z1, ignore) {
    const list = this.query(x0, z0, x1, z1, this._tmp2);
    for (const c of list) {
      if (c === ignore || c.ghost) continue;
      if (c.y1 > y0 && c.y0 < y1) return c;
    }
    return null;
  },

  // Superfície mais alta sob o corpo (colisores ou terreno) até yMax.
  support(x, z, r, yMax) {
    let best = World.height(x, z);
    const list = this.query(x - r, z - r, x + r, z + r, this._tmp2);
    for (const c of list) {
      if (c.ghost || c.y1 > yMax + 0.02) continue;
      if (c.y1 > best) best = c.y1;
    }
    return best;
  },

  // Chão no nível do terreno (ignora telhados e lajes altas).
  ground(x, z, r = 0.3) { return this.support(x, z, r, World.height(x, z) + 1.2); },

  // Move um corpo b = {p: Vector3 (pés), v: Vector3, r, h, step, onGround}.
  move(b, dx, dy, dz) {
    const r = b.r;
    b.hitWall = null; b.hitDoor = null;
    const ax = (d, axis) => {
      if (axis === 0) b.p.x += d; else b.p.z += d;
      const list = this.query(b.p.x - r, b.p.z - r, b.p.x + r, b.p.z + r, this._tmp);
      for (const c of list) {
        if (c.ghost || c === b.ignore) continue;
        if (b.p.x + r <= c.x0 || b.p.x - r >= c.x1 || b.p.z + r <= c.z0 || b.p.z - r >= c.z1) continue;
        if (b.p.y + b.h <= c.y0 || b.p.y >= c.y1 - 0.001) continue;
        // Subir degrau baixo.
        const rise = c.y1 - b.p.y;
        if (b.onGround && rise <= b.step && !c.door && !this.blocked(b.p.x - r, c.y1 + 0.01, b.p.z - r, b.p.x + r, c.y1 + b.h, b.p.z + r, null)) {
          b.p.y = c.y1; b.stepped = true;
          continue;
        }
        b.hitWall = c;
        if (c.door) b.hitDoor = c.door;
        // Resolve pelo eixo de menor penetração (evita "teleporte" ao longo de paredes compridas).
        const pxL = b.p.x + r - c.x0, pxR = c.x1 - (b.p.x - r), pzL = b.p.z + r - c.z0, pzR = c.z1 - (b.p.z - r);
        const penX = Math.min(pxL, pxR), penZ = Math.min(pzL, pzR);
        if (axis === 0) {
          if (penX > penZ + 0.02) continue;
          if (penZ < 0.12 && penX > 0.02) { b.p.z = pzL < pzR ? c.z0 - r - 0.001 : c.z1 + r + 0.001; continue; } // contorna quinas
          if (d > 0 && pxL < pxR + 0.25) b.p.x = c.x0 - r - 0.001;
          else if (d < 0 && pxR < pxL + 0.25) b.p.x = c.x1 + r + 0.001;
          else b.p.x = pxL < pxR ? c.x0 - r - 0.001 : c.x1 + r + 0.001;
        } else {
          if (penZ > penX + 0.02 || (penX < 0.12 && penZ > 0.02)) { b.p.x = pxL < pxR ? c.x0 - r - 0.001 : c.x1 + r + 0.001; continue; }
          if (d > 0 && pzL < pzR + 0.25) b.p.z = c.z0 - r - 0.001;
          else if (d < 0 && pzR < pzL + 0.25) b.p.z = c.z1 + r + 0.001;
          else b.p.z = pzL < pzR ? c.z0 - r - 0.001 : c.z1 + r + 0.001;
        }
      }
    };
    // Passos menores evitam atravessar paredes finas em alta velocidade.
    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dz)) / (r * 0.9)));
    for (let i = 0; i < steps; i++) { ax(dx / steps, 0); ax(dz / steps, 1); }

    // Vertical.
    const prevY = b.p.y;
    b.p.y += dy;
    b.onGround = false;
    const list = this.query(b.p.x - r, b.p.z - r, b.p.x + r, b.p.z + r, this._tmp);
    for (const c of list) {
      if (c.ghost || c === b.ignore) continue;
      if (b.p.x + r <= c.x0 || b.p.x - r >= c.x1 || b.p.z + r <= c.z0 || b.p.z - r >= c.z1) continue;
      if (b.p.y + b.h <= c.y0 || b.p.y >= c.y1) continue;
      if (dy <= 0 && prevY >= c.y1 - 0.05) { b.p.y = c.y1; b.v.y = Math.max(0, b.v.y); b.onGround = true; b.ground = c; }
      else if (dy > 0 && prevY + b.h <= c.y0 + 0.05) { b.p.y = c.y0 - b.h; b.v.y = Math.min(0, b.v.y); }
      else if (c.y1 - b.p.y < 0.6) { b.p.y = c.y1; b.onGround = true; b.ground = c; }
    }
    const g = World.height(b.p.x, b.p.z);
    if (b.p.y <= g) { b.p.y = g; b.v.y = Math.max(0, b.v.y); b.onGround = true; b.ground = null; }
    // Limites do mapa.
    const L = World.HALF - 2;
    b.p.x = U.clamp(b.p.x, -L, L); b.p.z = U.clamp(b.p.z, -L, L);
  },

  // Gruda no chão ao descer escadas/rampas.
  snapDown(b, maxDrop = 0.45) {
    const s = this.support(b.p.x, b.p.z, b.r * 0.9, b.p.y + 0.01);
    if (b.p.y - s <= maxDrop && b.p.y - s > 0.001) { b.p.y = s; b.onGround = true; return true; }
    return false;
  },

  ladderAt(p, r, h) {
    for (const l of this.ladders) {
      if (p.x + r > l.x0 && p.x - r < l.x1 && p.z + r > l.z0 && p.z - r < l.z1 && p.y < l.y1 && p.y + h > l.y0) return l;
    }
    return null;
  },

  // Raio contra caixa (método das placas). Retorna t de entrada e normal.
  rayBox(ox, oy, oz, dx, dy, dz, c, maxT) {
    let tmin = 0, tmax = maxT, nAxis = -1, nSign = 0;
    const o = [ox, oy, oz], d = [dx, dy, dz], mn = [c.x0, c.y0, c.z0], mx = [c.x1, c.y1, c.z1];
    for (let a = 0; a < 3; a++) {
      if (Math.abs(d[a]) < 1e-9) { if (o[a] < mn[a] || o[a] > mx[a]) return null; continue; }
      let t1 = (mn[a] - o[a]) / d[a], t2 = (mx[a] - o[a]) / d[a], s = -1;
      if (t1 > t2) { const tt = t1; t1 = t2; t2 = tt; s = 1; }
      if (t1 > tmin) { tmin = t1; nAxis = a; nSign = s; }
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) return null;
    }
    if (nAxis < 0) return { t: 0, axis: 1, sign: 1 }; // começou dentro
    return { t: tmin, axis: nAxis, sign: nSign };
  },

  // Raycast de segmento: a -> a + dir*len. opts: {water, terrain, ignore}
  ray(o, dir, len, opts = {}) {
    let best = null;
    const ex = o.x + dir.x * len, ez = o.z + dir.z * len;
    const list = this.query(Math.min(o.x, ex), Math.min(o.z, ez), Math.max(o.x, ex), Math.max(o.z, ez), this._tmp);
    for (const c of list) {
      if (c === opts.ignore || (c.ghost && !opts.ghosts) || (opts.noVehicles && c.vehicle)) continue;
      const h = this.rayBox(o.x, o.y, o.z, dir.x, dir.y, dir.z, c, best ? best.t : len);
      if (h && (!best || h.t < best.t)) best = { t: h.t, axis: h.axis, sign: h.sign, c, kind: 'col' };
    }
    if (opts.terrain !== false) {
      const maxT = best ? best.t : len;
      const step = 1.0;
      let prevT = 0, prevAbove = o.y - World.height(o.x, o.z);
      if (prevAbove < 0) return { t: 0, kind: 'terrain', point: o.clone(), normal: new THREE.Vector3(0, 1, 0) };
      for (let t = Math.min(step, maxT); ; t = Math.min(t + step, maxT)) {
        const x = o.x + dir.x * t, y = o.y + dir.y * t, z = o.z + dir.z * t;
        const above = y - World.height(x, z);
        if (above < 0) {
          let lo = prevT, hi = t;
          for (let i = 0; i < 8; i++) {
            const m = (lo + hi) / 2;
            if (o.y + dir.y * m - World.height(o.x + dir.x * m, o.z + dir.z * m) < 0) hi = m; else lo = m;
          }
          best = { t: hi, kind: 'terrain' };
          break;
        }
        prevT = t; prevAbove = above;
        if (t >= maxT) break;
      }
    }
    if (opts.water !== false && dir.y < 0 && o.y > World.WATER) {
      const tw = (World.WATER - o.y) / dir.y;
      if (tw >= 0 && tw <= (best ? best.t : len)) best = { t: tw, kind: 'water' };
    }
    if (!best) return null;
    best.point = new THREE.Vector3(o.x + dir.x * best.t, o.y + dir.y * best.t, o.z + dir.z * best.t);
    if (best.kind === 'col') {
      best.normal = new THREE.Vector3();
      best.normal.setComponent(best.axis, best.sign);
    } else if (best.kind === 'terrain') best.normal = World.normal(best.point.x, best.point.z);
    else best.normal = new THREE.Vector3(0, 1, 0);
    return best;
  },

  // Linha de visão livre entre dois pontos (apenas colisores e terreno).
  los(a, b, ignore) {
    const d = new THREE.Vector3().subVectors(b, a);
    const len = d.length();
    if (len < 0.01) return true;
    d.divideScalar(len);
    const h = this.ray(a, d, len, { water: false, ignore, noVehicles: true });
    return !h;
  },
};
