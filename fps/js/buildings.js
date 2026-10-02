'use strict';
// Construção de prédios e locais. Cada prédio é montado em coordenadas locais (frente = -Z)
// e girado em múltiplos de 90°, então todos os colisores continuam alinhados aos eixos.

const PAL = {
  walls: [0xe8d9b5, 0xd98f6b, 0x9ec5c9, 0xe6c26a, 0xb5d19c, 0xe0a0a8, 0xf0efe8, 0xc9b8e0, 0xf2b880],
  roofs: [0xa8452c, 0x8a3a26, 0x4a4d52, 0x6b5a4a, 0x3e5a6b],
  floor: [0x9c6b42, 0xcfcabb, 0xa88a6a, 0xb7b2a6],
  doors: [0x6b4226, 0x5a3b22, 0x8a5a2b, 0x3e5a6b, 0xb03a2f],
  conc: 0xa9a59c, dark: 0x3a3c40, wood: 0x8a5a2b, woodD: 0x5a3b22, white: 0xeeeeea, metal: 0x7d8288,
  mil: 0x7d7a5a, milD: 0x5a5c45, canvas: 0x6b6e4a, red: 0xa83a2a, hay: 0xd9c26a, int: 0xe9e4d6,
};
const Dop = (c, w = 1.0) => ({ a: c - w / 2, b: c + w / 2, y0: 0, y1: 2.15 });
const Wop = (c, w = 1.3, y0 = 0.9, y1 = 2.0) => ({ a: c - w / 2, b: c + w / 2, y0, y1 });

class Kit {
  constructor(loc, x, y, z, rot) {
    this.loc = loc; this.x = x; this.y = y; this.z = z;
    this.rot = ((rot % 4) + 4) % 4;
    this.th = (this.rot * Math.PI) / 2;
    this.c = Math.round(Math.cos(this.th)); this.s = Math.round(Math.sin(this.th));
    this.gb = new GB();
  }
  tp(lx, lz) { return [this.x + lx * this.c + lz * this.s, this.z - lx * this.s + lz * this.c]; }
  tbox(x0, y0, z0, x1, y1, z1) {
    const a = this.tp(x0, z0), b = this.tp(x1, z1);
    return { x0: Math.min(a[0], b[0]), x1: Math.max(a[0], b[0]), z0: Math.min(a[1], b[1]), z1: Math.max(a[1], b[1]), y0: this.y + Math.min(y0, y1), y1: this.y + Math.max(y0, y1) };
  }
  col(x0, y0, z0, x1, y1, z1, mat = 'concrete', extra) {
    const b = this.tbox(x0, y0, z0, x1, y1, z1);
    b.mat = mat;
    if (extra) Object.assign(b, extra);
    return Phys.add(b);
  }
  box(x0, y0, z0, x1, y1, z1, color, mat) { this.gb.aabb(x0, y0, z0, x1, y1, z1, color); return this.col(x0, y0, z0, x1, y1, z1, mat); }
  vis(x0, y0, z0, x1, y1, z1, color) { this.gb.aabb(x0, y0, z0, x1, y1, z1, color); }

  // Parede ao longo de X (em z), com aberturas {a,b,y0,y1} em x.
  wallX(z, x0, x1, h, color, opens = [], t = 0.2, y0 = 0, mat) {
    const os = opens.slice().sort((p, q) => p.a - q.a);
    let cur = x0;
    for (const o of os) {
      if (o.a > cur) this.box(cur, y0, z - t / 2, o.a, y0 + h, z + t / 2, color, mat);
      if (o.y0 > 0) { this.box(o.a, y0, z - t / 2, o.b, y0 + o.y0, z + t / 2, color, mat); this.vis(o.a - 0.05, y0 + o.y0 - 0.05, z - t / 2 - 0.06, o.b + 0.05, y0 + o.y0, z + t / 2 + 0.06, PAL.white); }
      if (o.y1 < h) this.box(o.a, y0 + o.y1, z - t / 2, o.b, y0 + h, z + t / 2, color, mat);
      cur = o.b;
    }
    if (cur < x1) this.box(cur, y0, z - t / 2, x1, y0 + h, z + t / 2, color, mat);
  }
  wallZ(x, z0, z1, h, color, opens = [], t = 0.2, y0 = 0, mat) {
    const os = opens.slice().sort((p, q) => p.a - q.a);
    let cur = z0;
    for (const o of os) {
      if (o.a > cur) this.box(x - t / 2, y0, cur, x + t / 2, y0 + h, o.a, color, mat);
      if (o.y0 > 0) { this.box(x - t / 2, y0, o.a, x + t / 2, y0 + o.y0, o.b, color, mat); this.vis(x - t / 2 - 0.06, y0 + o.y0 - 0.05, o.a - 0.05, x + t / 2 + 0.06, y0 + o.y0, o.b + 0.05, PAL.white); }
      if (o.y1 < h) this.box(x - t / 2, y0 + o.y1, o.a, x + t / 2, y0 + h, o.b, color, mat);
      cur = o.b;
    }
    if (cur < z1) this.box(x - t / 2, y0, cur, x + t / 2, y0 + h, z1, color, mat);
  }
  // Quatro paredes externas de um retângulo.
  shell(W, D, h, color, o = {}, y0 = 0, t = 0.2) {
    this.wallX(-D / 2, -W / 2, W / 2, h, color, o.f || [], t, y0);
    this.wallX(D / 2, -W / 2, W / 2, h, color, o.b || [], t, y0);
    this.wallZ(-W / 2, -D / 2 + t / 2, D / 2 - t / 2, h, color, o.l || [], t, y0);
    this.wallZ(W / 2, -D / 2 + t / 2, D / 2 - t / 2, h, color, o.r || [], t, y0);
  }
  base(W, D, F = 0.12, color = PAL.conc, floor = null) {
    this.box(-W / 2 - 0.2, -2.5, -D / 2 - 0.2, W / 2 + 0.2, F, D / 2 + 0.2, color);
    if (floor !== null) this.vis(-W / 2 + 0.1, F, -D / 2 + 0.1, W / 2 - 0.1, F + 0.015, D / 2 - 0.1, floor);
  }
  // Porta articulada. axis 'x': porta ao longo de X na parede z=hz, dobradiça em hx; inward = sentido Z para dentro.
  door(hx, hz, axis, w, inward, y0, color) {
    const t = 0.05;
    let cb, ob, d, o;
    if (axis === 'x') { cb = [hx, hz - t, hx + w, hz + t]; ob = [hx - t, Math.min(hz, hz + inward * w), hx + t, Math.max(hz, hz + inward * w)]; d = [1, 0]; o = [0, inward]; }
    else { cb = [hx - t, hz, hx + t, hz + w]; ob = [Math.min(hx, hx + inward * w), hz - t, Math.max(hx, hx + inward * w), hz + t]; d = [0, 1]; o = [inward, 0]; }
    const h = 2.1;
    const CB = this.tbox(cb[0], y0, cb[1], cb[2], y0 + h, cb[3]);
    const OB = this.tbox(ob[0], y0, ob[1], ob[2], y0 + h, ob[3]);
    const reg = { x0: Math.min(CB.x0, OB.x0), x1: Math.max(CB.x1, OB.x1), z0: Math.min(CB.z0, OB.z0), z1: Math.max(CB.z1, OB.z1) };
    const col = Object.assign({ mat: 'wood' }, CB);
    const pivot = new THREE.Group();
    const hp = this.tp(hx, hz);
    pivot.position.set(hp[0], this.y + y0, hp[1]);
    const dg = new GB();
    dg.box(w - 0.04, h - 0.03, 0.06, w / 2, h / 2, 0, color);
    dg.box(0.06, 0.06, 0.14, w - 0.12, 1.0, 0, 0xc9a43a);
    if (!Kit.doorGeo) Kit.doorGeo = {};
    const gk = w + ':' + color;
    const mesh = new THREE.Mesh(Kit.doorGeo[gk] || (Kit.doorGeo[gk] = dg.build()), MAT.vcFlat);
    pivot.add(mesh);
    const cy = this.th + Math.atan2(-d[1], d[0]), oy = this.th + Math.atan2(-o[1], o[0]);
    pivot.rotation.y = cy;
    World.scene.add(pivot);
    const cx = (CB.x0 + CB.x1) / 2, cz = (CB.z0 + CB.z1) / 2;
    const door = { pivot, col, cb: CB, ob: OB, cy, oy, open: false, x: cx, y: this.y + y0 + 1.0, z: cz, bash: 0 };
    col.door = door;
    Phys.add(col, reg);
    World.doors.push(door);
    return door;
  }
  // Escada de degraus ao longo de Z (dir = +1 sobe para +Z).
  stairs(x0, x1, z0, dir, y0, y1, color = PAL.conc, run = 0.3) {
    const n = Math.ceil((y1 - y0) / 0.25), rise = (y1 - y0) / n;
    for (let i = 0; i < n; i++) {
      const za = z0 + dir * i * run, zb = za + dir * run;
      this.box(x0, y0, Math.min(za, zb), x1, y0 + (i + 1) * rise, Math.max(za, zb), color);
    }
    return { z1: z0 + dir * n * run };
  }
  // Escada de mão (volume de escalada).
  ladder(x0, z0, x1, z1, y0, y1, faceAxis = 'z') {
    const b = this.tbox(x0, y0, z0, x1, y1, z1);
    Phys.ladders.push(b);
    const w = faceAxis === 'z' ? x1 - x0 : z1 - z0;
    const cxl = x0 + 0.04, czl = z0 + 0.04;
    if (faceAxis === 'z') {
      this.vis(x0, y0, czl - 0.04, x0 + 0.06, y1, czl + 0.04, PAL.woodD); this.vis(x1 - 0.06, y0, czl - 0.04, x1, y1, czl + 0.04, PAL.woodD);
      for (let y = y0 + 0.3; y < y1; y += 0.35) this.vis(x0, y, czl - 0.03, x1, y + 0.05, czl + 0.03, PAL.wood);
    } else {
      this.vis(cxl - 0.04, y0, z0, cxl + 0.04, y1, z0 + 0.06, PAL.woodD); this.vis(cxl - 0.04, y0, z1 - 0.06, cxl + 0.04, y1, z1, PAL.woodD);
      for (let y = y0 + 0.3; y < y1; y += 0.35) this.vis(cxl - 0.03, y, z0, cxl + 0.03, y + 0.05, z1, PAL.wood);
    }
    return w;
  }
  loot(lx, ly, lz, table) {
    const p = this.tp(lx, lz);
    World.lootPoints.push({ x: p[0], y: this.y + ly, z: p[1], table, loc: this.loc.id });
  }
  veh(lx, lz, yawLocal, type) {
    const p = this.tp(lx, lz);
    World.vehicleSpawns.push({ x: p[0], z: p[1], yaw: this.th + yawLocal, type });
  }
  sign(text, lx, ly, lz, yawLocal, w, h, bg, fg) {
    const m = World.makeSign(text, w, h, bg, fg);
    const p = this.tp(lx, lz);
    m.position.set(p[0], this.y + ly, p[1]);
    m.rotation.y = this.th + yawLocal;
    World.scene.add(m);
  }
  roofGable(W, D, y0, rise, color, gable, axis = 'x', over = 0.5) {
    this.gb.prism(-W / 2 - over, W / 2 + over, -D / 2 - over, D / 2 + over, y0, y0 + rise, color, axis, gable);
  }
  finish() {
    if (this.gb.empty) return;
    const geo = this.gb.build();
    geo.applyMatrix4(new THREE.Matrix4().makeRotationY(this.th).setPosition(this.x, this.y, this.z));
    World.addLocGeo(this.loc.id, geo);
  }
}

const Buildings = {
  r: null,
  buildAll(W) {
    this.r = U.rng(W.SEED + 7);
    this.city(W.loc('santacruz'));
    this.village(W.loc('esperanca'));
    this.port(W.loc('porto'));
    this.base(W.loc('base'));
    this.farm(W.loc('fazenda'));
    this.gas(W.loc('posto'));
    this.camp(W.loc('acampamento'));
    this.radio(W.loc('torre'));
    this.range(W.loc('estande'));
    this.scatter();
    this.wrecks();
  },
  pick(a) { return a[Math.floor(this.r() * a.length)]; },

  // Cria um kit na altura máxima do terreno sob a área.
  kit(loc, x, z, rot, hw = 5, hd = 5, yFix = null) {
    let y = -1e9;
    if (yFix !== null) y = yFix;
    else for (const fx of [-1, 0, 1]) for (const fz of [-1, 0, 1]) y = Math.max(y, World.height(x + fx * hw, z + fz * hd));
    return new Kit(loc, x, y, z, rot);
  },
  // Rua plana em retângulo (cidade e vilas).
  street(loc, x0, z0, x1, z1, color = 0x3d3e42, y = null) {
    const gb = new GB();
    const yy = (y ?? loc.h) + 0.06;
    gb.quad([x0, yy, z0], [x0, yy, z1], [x1, yy, z1], [x1, yy, z0], color);
    World.addLocGeo(loc.id, gb.build());
  },

  // ---------------------------------------------------------------- Modelos de prédios
  casa(k, table = 'casa') {
    const W = 10, D = 8, H = 2.8, F = 0.12, r = this.r;
    const wc = this.pick(PAL.walls), rc = this.pick(PAL.roofs);
    k.base(W, D, F, PAL.conc, this.pick(PAL.floor));
    k.shell(W, D, H, wc, { f: [Dop(-2.5), Wop(2, 1.6)], b: [Wop(-3), Wop(2.5)], l: [Wop(0)], r: [Wop(-1.5)] }, F);
    k.door(-3, -D / 2, 'x', 1.0, 1, F, this.pick(PAL.doors));
    k.wallZ(0.5, -D / 2 + 0.1, D / 2 - 0.1, H, PAL.int, [Dop(-1.5)], 0.12, F);
    k.box(-W / 2 - 0.1, F + H, -D / 2 - 0.1, W / 2 + 0.1, F + H + 0.15, D / 2 + 0.1, 0xdedad0);
    k.roofGable(W, D, F + H + 0.15, 1.9, rc, wc);
    k.box(-2.7, F, 1.05, -1.3, F + 0.75, 1.95, PAL.wood, 'wood');
    k.box(-4.85, F, -2.6, -4.15, F + 0.8, 0.4, this.pick([0x7a3a2a, 0x3a5a7a, 0x5a6a3a]), 'wood');
    k.box(1.2, F, 1.6, 3.2, F + 0.55, 3.8, 0xd8d0c0, 'wood');
    k.vis(1.3, F + 0.55, 3.2, 3.1, F + 0.68, 3.7, 0xffffff);
    k.box(4.25, F, -3.85, 4.85, F + 2.0, -2.4, PAL.woodD, 'wood');
    const pts = [[-2, F + 0.75, 1.5], [2.2, F + 0.56, 2.4], [-4, F, -3.2], [3.6, F, -3.1], [1.5, F, -2.6], [-1, F, 3]];
    const n = 2 + Math.floor(r() * 3);
    for (let i = 0; i < n; i++) { const p = pts.splice(Math.floor(r() * pts.length), 1)[0]; k.loot(p[0], p[1], p[2], table); }
    k.finish();
  },

  sobrado(k, table = 'casa') {
    const W = 10, D = 9, H = 3.0, F = 0.12, L1 = F + 3.15, r = this.r;
    const wc = this.pick(PAL.walls), rc = this.pick(PAL.roofs);
    k.base(W, D, F, PAL.conc, this.pick(PAL.floor));
    k.shell(W, D, H + 0.15, wc, { f: [Dop(-2.5), Wop(2)], b: [Wop(-2.5), Wop(2.5)], l: [Wop(0)], r: [] }, F);
    k.door(-3, -D / 2, 'x', 1.0, 1, F, this.pick(PAL.doors));
    const st = k.stairs(3.7, 4.85, -3.4, 1, F, L1);
    // laje superior com vão da escada
    k.box(-4.9, L1 - 0.15, -4.4, 3.6, L1, 4.4, 0xdedad0);
    k.box(3.6, L1 - 0.15, st.z1, 4.9, L1, 4.4, 0xdedad0);
    k.box(3.6, L1 - 0.15, -4.4, 4.9, L1, -3.4, 0xdedad0);
    k.box(3.52, L1, -3.4, 3.6, L1 + 1.0, st.z1 - 0.7, PAL.wood, 'wood'); // guarda-corpo
    k.vis(-4.9, L1, -4.4, 4.9, L1 + 0.015, 4.4, this.pick(PAL.floor));
    k.shell(W, D, H, wc, { f: [Wop(-2.5), Wop(2)], b: [Wop(-2), Wop(2.5)], l: [Wop(0)], r: [Wop(2.8)] }, L1);
    k.wallZ(0, -D / 2 + 0.1, D / 2 - 0.1, H, PAL.int, [Dop(2.5)], 0.12, L1);
    k.box(-W / 2 - 0.1, L1 + H, -D / 2 - 0.1, W / 2 + 0.1, L1 + H + 0.15, D / 2 + 0.1, 0xdedad0);
    k.roofGable(W, D, L1 + H + 0.15, 2.0, rc, wc);
    k.box(-2.7, F, 0.9, -1.3, F + 0.75, 1.9, PAL.wood, 'wood');
    k.box(-4.85, F, -2.6, -4.15, F + 0.8, 0.4, 0x5a6a3a, 'wood');
    k.box(-4.6, L1, 1.8, -2.6, L1 + 0.55, 4.2, 0xd8d0c0, 'wood');
    k.box(1.0, L1, 2.0, 3.0, L1 + 0.55, 4.2, 0xd8d0c0, 'wood');
    k.box(-0.8, L1, -4.3, -0.2, L1 + 2.0, -2.8, PAL.woodD, 'wood');
    k.loot(-2, F + 0.75, 1.4, table); k.loot(1.5, F, -3, table);
    k.loot(-3.6, L1 + 0.56, 3, table); k.loot(2, L1 + 0.56, 3, table); k.loot(-3, L1, -3, table);
    if (r() < 0.5) k.loot(2, L1, -2.5, table);
    k.finish();
  },

  predio(k, table = 'casa') {
    const W = 12, D = 12, H = 3.0, F = 0.12, FL = 3.15, r = this.r;
    const wc = this.pick([0xd9d2c0, 0xc0b8a8, 0xb5c0c8, 0xe0c8a8, 0xc8a890]);
    k.base(W, D, F, PAL.conc, 0xb7b2a6);
    const L = [F, F + FL, F + FL * 2, F + FL * 3];
    const sA = { x0: 4.6, x1: 5.85, z0: -4.5, dir: 1 }, sB = { x0: 3.3, x1: 4.5, z0: -0.6, dir: -1 };
    for (let f = 0; f < 3; f++) {
      const y = L[f];
      const front = f === 0 ? [Dop(-3, 1.0), Wop(0, 1.6), Wop(3.5, 1.6)] : [Wop(-3.5, 1.6), Wop(0, 1.6), Wop(3.5, 1.6)];
      k.shell(W, D, H + 0.15, wc, { f: front, b: [Wop(-3.5, 1.6), Wop(0, 1.6), Wop(3.5, 1.6)], l: [Wop(-3, 1.6), Wop(2, 1.6)], r: [Wop(3, 1.6)] }, y);
      k.vis(-W / 2 - 0.05, y + H + 0.02, -D / 2 - 0.05, W / 2 + 0.05, y + H + 0.15, D / 2 + 0.05, 0xa09a8c);
      const s = f === 1 ? sB : sA;
      const st = k.stairs(s.x0, s.x1, s.z0, s.dir, y, L[f + 1]);
      // laje acima com vão
      const yt = L[f + 1];
      const hz0 = Math.min(s.z0, st.z1), hz1 = Math.max(s.z0, st.z1);
      k.box(-W / 2 + 0.1, yt - 0.15, -D / 2 + 0.1, s.x0 - 0.05, yt, D / 2 - 0.1, 0xd0ccc0);
      k.box(s.x1 + 0.05, yt - 0.15, -D / 2 + 0.1, W / 2 - 0.1, yt, D / 2 - 0.1, 0xd0ccc0);
      k.box(s.x0 - 0.05, yt - 0.15, -D / 2 + 0.1, s.x1 + 0.05, yt, hz0, 0xd0ccc0);
      k.box(s.x0 - 0.05, yt - 0.15, hz1, s.x1 + 0.05, yt, D / 2 - 0.1, 0xd0ccc0);
      // mobília
      k.box(-4.5, y, 2, -2.5, y + 0.55, 4.5, 0xd8d0c0, 'wood');
      k.box(-1.5, y, -1, 0.3, y + 0.75, 0.2, PAL.wood, 'wood');
      k.box(-5.6, y, -5.6, -4.8, y + 1.9, -3.8, PAL.woodD, 'wood');
      k.loot(-3.5, y + 0.56, 3.2, table); k.loot(-0.6, y + 0.75, -0.4, table);
      if (r() < 0.6) k.loot(1.5, y, 4.5, table);
    }
    // cobertura com parapeito
    const R = L[3];
    k.box(-W / 2 - 0.1, R - 0.05, -D / 2 - 0.1, W / 2 + 0.1, R, -D / 2 + 0.6, 0x8a8a84);
    k.vis(-W / 2, R, -D / 2, W / 2, R + 0.02, D / 2, 0x6a6a66);
    k.wallX(-D / 2, -W / 2, W / 2, 1.0, wc, [], 0.25, R);
    k.wallX(D / 2, -W / 2, W / 2, 1.0, wc, [], 0.25, R);
    k.wallZ(-W / 2, -D / 2, D / 2, 1.0, wc, [], 0.25, R);
    k.wallZ(W / 2, -D / 2, D / 2, 1.0, wc, [], 0.25, R);
    k.box(-3, R, 1, -1, R + 1.6, 3, 0x9a9a94); // caixa d'água
    k.loot(2, R, 3, U.chance(0.5) ? 'militar' : table);
    k.finish();
  },

  mercado(k, table = 'mercado', name = 'MERCADO') {
    const W = 16, D = 12, H = 3.6, F = 0.12;
    const wc = this.pick([0xe8e2d0, 0xd9c9a0, 0xc9d9e0]);
    k.base(W, D, F, PAL.conc, 0xcfcabb);
    k.shell(W, D, H, wc, { f: [Dop(0, 3.0), Wop(-5, 3.2, 0.6, 2.6), Wop(5, 3.2, 0.6, 2.6)], b: [Dop(5)] }, F);
    k.door(4.5, D / 2, 'x', 1.0, -1, F, PAL.dark);
    k.box(-W / 2 - 0.1, F + H, -D / 2 - 0.1, W / 2 + 0.1, F + H + 0.25, D / 2 + 0.1, 0xb0aca0);
    k.vis(-W / 2 - 0.3, F + H - 0.6, -D / 2 - 0.5, W / 2 + 0.3, F + H + 0.3, -D / 2 - 0.1, 0xc0392b);
    for (const z of [-1.2, 2.2]) {
      k.box(-5.5, F, z - 0.4, 5.5, F + 0.9, z + 0.4, 0x8a8d92, 'metal');
      k.box(-5.5, F + 0.9, z - 0.15, 5.5, F + 1.8, z + 0.15, 0x8a8d92, 'metal');
      for (const x of [-4.5, -1.5, 1.5, 4.5]) k.loot(x, F + 0.9, z + (x > 0 ? 0.28 : -0.28), table);
    }
    k.box(-7.4, F, -4.8, -4.2, F + 1.0, -4.0, 0x5a5c60, 'metal');
    k.loot(-6, F + 1.0, -4.4, table);
    k.sign(name, 0, F + H - 0.15, -D / 2 - 0.52, Math.PI, 6, 0.8, '#c0392b', '#fff');
    k.finish();
  },

  delegacia(k) {
    const W = 14, D = 10, H = 3.2, F = 0.12;
    k.base(W, D, F, PAL.conc, 0xb7b2a6);
    k.shell(W, D, H, 0xe0e4e8, { f: [Dop(0, 1.2), Wop(-4), Wop(4)], b: [Wop(-4)], l: [Wop(-2)], r: [] }, F);
    k.door(-0.6, -D / 2, 'x', 1.2, 1, F, 0x2f4a6b);
    k.wallX(1, -W / 2 + 0.1, W / 2 - 0.1, H, PAL.int, [Dop(-3), Dop(3)], 0.15, F);
    k.door(-3.5, 1, 'x', 1.0, 1, F, 0x5a5c60);
    k.door(2.5, 1, 'x', 1.0, 1, F, 0x5a5c60);
    k.wallZ(0, 1.1, D / 2 - 0.1, H, PAL.int, [], 0.15, F);
    k.box(-2.2, F, -2.6, 2.2, F + 1.1, -2.0, PAL.woodD, 'wood');
    k.box(-6, F, -4, -4.6, F + 0.75, -2.8, PAL.wood, 'wood');
    k.box(4.6, F, -4, 6, F + 0.75, -2.8, PAL.wood, 'wood');
    // celas (grades)
    for (let x = -6.6; x < -0.3; x += 0.3) k.vis(x, F, 3, x + 0.05, F + H, 3.05, 0x555a60);
    k.col(-6.8, F, 2.95, -0.2, F + H, 3.1, 'metal');
    // arsenal
    k.box(1.5, F, 4.1, 6.6, F + 0.9, 4.8, 0x3a3c40, 'metal');
    k.box(1.5, F + 0.9, 4.5, 6.6, F + 1.9, 4.8, 0x3a3c40, 'metal');
    k.loot(2.5, F + 0.9, 4.25, 'policia'); k.loot(4, F + 0.9, 4.25, 'policia'); k.loot(5.6, F + 0.9, 4.25, 'policia');
    k.loot(4, F, 2, 'policia'); k.loot(0, F + 1.1, -2.3, 'policia'); k.loot(-5.3, F + 0.75, -3.4, 'policia');
    k.loot(-3.5, F, 4, 'casa');
    k.box(-W / 2 - 0.1, F + H, -D / 2 - 0.1, W / 2 + 0.1, F + H + 0.3, D / 2 + 0.1, 0x9aa0a8);
    k.sign('POLÍCIA', 0, F + H - 0.4, -D / 2 - 0.12, Math.PI, 4.5, 0.7, '#1d3f73', '#fff');
    k.finish();
  },

  hospital(k) {
    const W = 20, D = 12, H = 3.2, F = 0.12;
    k.base(W, D, F, PAL.conc, 0xe0e0dc);
    k.shell(W, D, H, 0xf2f2ee, { f: [Dop(0, 2.4), Wop(-7), Wop(-4), Wop(4), Wop(7)], b: [Wop(-7.5), Wop(-2.5), Wop(2.5), Wop(7.5)], l: [Wop(-3)], r: [Wop(-3)] }, F);
    k.wallX(1, -W / 2 + 0.1, W / 2 - 0.1, H, 0xe6eef0, [Dop(-7.5), Dop(-2.5), Dop(2.5), Dop(7.5)], 0.15, F);
    for (const x of [-5, 0, 5]) k.wallZ(x, 1.08, D / 2 - 0.1, H, 0xe6eef0, [], 0.15, F);
    for (const x of [-7.5, -2.5, 2.5, 7.5]) {
      k.box(x - 0.6, F, 3.4, x + 0.6, F + 0.6, 5.6, 0xffffff, 'metal');
      k.loot(x, F + 0.6, 4.3, 'hospital');
      if (this.r() < 0.6) k.loot(x + 1.4, F, 2, 'hospital');
    }
    k.box(-3, F, -3.2, 3, F + 1.1, -2.6, 0xd0d4d8, 'wood');
    k.loot(0, F + 1.1, -2.9, 'hospital');
    k.box(-W / 2 - 0.1, F + H, -D / 2 - 0.1, W / 2 + 0.1, F + H + 0.3, D / 2 + 0.1, 0xc0c4c8);
    k.sign('HOSPITAL', -2, F + H - 0.4, -D / 2 - 0.12, Math.PI, 5, 0.8, '#ffffff', '#c0392b');
    k.sign('+', 2.2, F + H - 0.4, -D / 2 - 0.12, Math.PI, 0.9, 0.9, '#c0392b', '#ffffff');
    k.finish();
  },

  museu(k) {
    const W = 14, D = 12, H = 4, F = 0.3;
    k.base(W, D, F, 0xd0c8b8, 0xb59a6a);
    k.box(-W / 2 - 0.2, -1, -D / 2 - 3, W / 2 + 0.2, F, -D / 2 - 0.2, 0xd0c8b8);
    k.shell(W, D, H, 0xe8e0cc, { f: [Dop(0, 1.6)], b: [], l: [Wop(0, 2)], r: [Wop(0, 2)] }, F);
    for (const x of [-5.5, -2.5, 2.5, 5.5]) k.box(x - 0.3, F, -D / 2 - 2.6, x + 0.3, F + H, -D / 2 - 2.0, 0xf0ece0);
    k.box(-W / 2 - 0.3, F + H, -D / 2 - 3, W / 2 + 0.3, F + H + 0.4, D / 2 + 0.2, 0xd8d0bc);
    k.gb.prism(-W / 2 - 0.3, W / 2 + 0.3, -D / 2 - 3, D / 2 + 0.2, F + H + 0.4, F + H + 1.6, 0x8a8478, 'x', 0xe8e0cc);
    for (const [x, z] of [[-4, -2], [0, -2], [4, -2], [-4, 2.5], [0, 2.5], [4, 2.5]]) {
      k.box(x - 0.7, F, z - 0.45, x + 0.7, F + 0.9, z + 0.45, 0x5a3b22, 'wood');
      k.loot(x, F + 0.9, z, 'museu');
    }
    // canhão decorativo na frente
    k.gb.cyl(0.16, 2.2, -3.5, F + 0.75, -D / 2 - 5.5, 0x3a3d42, 'z', 8);
    k.gb.cyl(0.55, 0.1, -3.85, F + 0.55, -D / 2 - 5.0, PAL.woodD, 'x', 10);
    k.gb.cyl(0.55, 0.1, -3.15, F + 0.55, -D / 2 - 5.0, PAL.woodD, 'x', 10);
    k.col(-4, F, -D / 2 - 6.6, -3, F + 1.1, -D / 2 - 4.4, 'metal');
    k.sign('MUSEU MILITAR', 0, F + H + 0.2, -D / 2 - 3.02, Math.PI, 5, 0.6, '#3a2f22', '#e8d9a0');
    k.finish();
  },

  galpao(k, table = 'industrial') {
    const W = 20, D = 14, H = 6, F = 0.12;
    const wc = this.pick([0x8a9097, 0x7d8a7a, 0x9a8a7a, 0x6b7a8a]);
    k.base(W, D, F, PAL.conc, 0x9a968c);
    k.shell(W, D, H, wc, { f: [{ a: -3, b: 3, y0: 0, y1: 4.6 }], r: [Dop(2)] }, F);
    k.door(W / 2, 1.5, 'z', 1.0, -1, F, PAL.dark);
    k.box(-W / 2 - 0.1, F + H, -D / 2 - 0.1, W / 2 + 0.1, F + H + 0.2, D / 2 + 0.1, 0x6a6e74, 'metal');
    k.roofGable(W, D, F + H + 0.2, 1.2, 0x5a5e64, wc, 'x', 0.3);
    for (const [x, z, h] of [[-7, -3, 1.2], [-7, -1.7, 1.2], [-5.7, -3, 2.4], [6, 4, 1.2], [7.3, 4, 0.8], [-6, 4.5, 1.2]]) {
      k.box(x - 0.6, F, z - 0.6, x + 0.6, F + h, z + 0.6, 0x9a7a4a, 'wood');
    }
    k.box(-4, F, 5.8, 4, F + 2.2, 6.6, 0x4a6a8a, 'metal');
    k.box(-4, F, 5.0, 4, F + 0.6, 5.8, 0x4a6a8a, 'metal');
    k.loot(-2.5, F + 0.6, 5.4, table); k.loot(2.5, F + 0.6, 5.4, table);
    k.loot(-7, F + 1.2, -1.7, table); k.loot(6, F + 1.2, 4, table); k.loot(3, F, -3, table);
    k.finish();
  },

  quartel(k) {
    const W = 16, D = 8, H = 3, F = 0.12;
    k.base(W, D, F, PAL.conc, 0x8a8478);
    k.shell(W, D, H, PAL.mil, { f: [Dop(-4), Dop(4), Wop(-6.5), Wop(0), Wop(6.5)], b: [Wop(-6), Wop(-2), Wop(2), Wop(6)] }, F);
    k.door(-4.5, -D / 2, 'x', 1.0, 1, F, PAL.milD);
    k.door(3.5, -D / 2, 'x', 1.0, 1, F, PAL.milD);
    k.box(-W / 2 - 0.1, F + H, -D / 2 - 0.1, W / 2 + 0.1, F + H + 0.15, D / 2 + 0.1, 0x9a9680);
    k.roofGable(W, D, F + H + 0.15, 1.4, PAL.milD, PAL.mil);
    for (const x of [-6.5, -2, 2, 6.5]) {
      k.box(x - 0.5, F, 1.6, x + 0.5, F + 0.5, 3.8, 0x5a6142, 'metal');
      k.vis(x - 0.5, F + 1.3, 1.6, x + 0.5, F + 1.4, 3.8, 0x5a6142);
    }
    for (const x of [-6.8, -5.9]) k.box(x - 0.4, F, -3.7, x + 0.4, F + 1.9, -3.2, 0x6b6e5a, 'metal');
    k.loot(-6.5, F + 0.5, 2.7, 'militar'); k.loot(2, F + 0.5, 2.7, 'militar');
    k.loot(-2, F, 0.5, 'militar'); k.loot(6, F, -2.5, 'militar');
    k.finish();
  },

  hangar(k) {
    const W = 26, D = 20, H = 8, F = 0.12;
    k.base(W, D, F, PAL.conc, 0x8a8a84);
    k.shell(W, D, H, 0x6b6e5a, { f: [{ a: -8, b: 8, y0: 0, y1: 6.5 }], l: [Dop(4)] }, F);
    k.door(-W / 2, 3.5, 'z', 1.0, 1, F, PAL.milD);
    k.box(-W / 2 - 0.1, F + H, -D / 2 - 0.1, W / 2 + 0.1, F + H + 0.3, D / 2 + 0.1, 0x55584a, 'metal');
    k.roofGable(W, D, F + H + 0.3, 3, 0x4d5040, 0x6b6e5a, 'z', 0.3);
    k.veh(0, 1, 0, 'humvee');
    for (const [x, z] of [[-10, 7], [-8.7, 7], [10, 7], [10, -6]]) k.box(x - 0.6, F, z - 0.6, x + 0.6, F + 1.2, z + 0.6, 0x5a6142, 'wood');
    k.box(-6, F, 8.6, 6, F + 2.4, 9.6, 0x3a3c40, 'metal');
    k.loot(-10, F + 1.2, 7, 'elite'); k.loot(10, F + 1.2, -6, 'elite'); k.loot(-3, F, 8.2, 'militar'); k.loot(3, F, 8.2, 'elite'); k.loot(8.7, F, 7, 'militar');
    k.finish();
  },

  torre(k, table = 'elite') {
    const P = 6, F = 0.0;
    for (const [x, z] of [[-1.5, -1.5], [1.5, -1.5], [-1.5, 1.5], [1.5, 1.5]]) k.box(x - 0.13, F, z - 0.13, x + 0.13, P + 3, z + 0.13, PAL.woodD, 'wood');
    k.box(-1.7, P, -1.7, -0.7, P + 0.2, 1.7, PAL.wood, 'wood');
    k.box(0.7, P, -1.7, 1.7, P + 0.2, 1.7, PAL.wood, 'wood');
    k.box(-0.7, P, -0.5, 0.7, P + 0.2, 1.7, PAL.wood, 'wood');
    k.wallX(-1.65, -1.7, 1.7, 1.1, PAL.wood, [], 0.1, P + 0.2, 'wood');
    k.wallX(1.65, -1.7, 1.7, 1.1, PAL.wood, [], 0.1, P + 0.2, 'wood');
    k.wallZ(-1.65, -1.6, 1.6, 1.1, PAL.wood, [], 0.1, P + 0.2, 'wood');
    k.wallZ(1.65, -1.6, 1.6, 1.1, PAL.wood, [], 0.1, P + 0.2, 'wood');
    k.box(-2, P + 2.9, -2, 2, P + 3.05, 2, PAL.woodD, 'wood');
    k.gb.prism(-2.1, 2.1, -2.1, 2.1, P + 3.05, P + 3.9, 0x5a5c45, 'x');
    k.ladder(-0.5, -1.5, 0.5, -0.7, 0, P + 0.3, 'z');
    for (const [x0, z0, x1, z1] of [[-2.6, -2.6, 2.6, -2.2], [-2.6, 2.2, 2.6, 2.6], [-2.6, -2.2, -2.2, 2.2], [2.2, -2.2, 2.6, 2.2]]) {
      if (z0 === -2.6) { k.box(x0, F, z0, -0.7, F + 0.7, z1, 0xb5a37a, 'sand'); k.box(0.7, F, z0, x1, F + 0.7, z1, 0xb5a37a, 'sand'); }
      else k.box(x0, F, z0, x1, F + 0.7, z1, 0xb5a37a, 'sand');
    }
    k.loot(0.6, P + 0.2, 0.6, table); k.loot(-0.8, P + 0.2, 0.9, 'militar');
    k.finish();
  },

  celeiro(k) {
    const W = 12, D = 16, H = 4.5, F = 0.12;
    k.base(W, D, F, 0x8a7a5a, 0x8a7a5a);
    k.shell(W, D, H, PAL.red, { f: [{ a: -2.2, b: 2.2, y0: 0, y1: 3.8 }], b: [{ a: -1.5, b: 1.5, y0: 0, y1: 3 }], l: [Wop(-3)], r: [Wop(3)] }, F);
    for (const [x, z] of [[-W / 2, -D / 2], [W / 2, -D / 2], [-W / 2, D / 2], [W / 2, D / 2]]) k.vis(x - 0.15, F, z - 0.15, x + 0.15, F + H, z + 0.15, PAL.white);
    k.box(-W / 2 - 0.1, F + H, -D / 2 - 0.1, W / 2 + 0.1, F + H + 0.15, D / 2 + 0.1, 0x7a3a2a, 'wood');
    k.roofGable(W, D, F + H + 0.15, 3.2, 0x4a3a32, PAL.red, 'z', 0.4);
    for (const [x, z, y] of [[-4, 4, 0], [-4, 5.3, 0], [-4, 4, 0.8], [4, -4, 0], [4, -2.7, 0], [4.2, 5, 0], [3, 5, 0], [3.6, 5, 0.8]]) {
      k.box(x - 0.6, F + y, z - 0.4, x + 0.6, F + y + 0.8, z + 0.4, PAL.hay, 'wood');
    }
    k.loot(-4, F + 1.6, 4.5, 'fazenda'); k.loot(4, F + 0.8, -3.3, 'fazenda'); k.loot(-3, F, -5, 'fazenda'); k.loot(0, F, 6, 'fazenda');
    k.finish();
  },

  posto(k) {
    const F = 0.12;
    k.box(-8, -2.5, -7, 8, F, 9, PAL.conc);
    for (const [x, z] of [[-6, -5.5], [6, -5.5], [-6, 0.5], [6, 0.5]]) k.box(x - 0.2, F, z - 0.2, x + 0.2, F + 4.8, z + 0.2, 0xe8e8e4);
    k.box(-7.5, F + 4.8, -7, 7.5, F + 5.3, 2, 0xffffff);
    k.vis(-7.55, F + 4.85, -7.05, 7.55, F + 5.25, -6.95, 0x2a7a3a);
    for (const x of [-2.5, 2.5]) {
      k.box(x - 0.4, F, -2.9, x + 0.4, F + 1.6, -2.1, 0xd8d8d4, 'metal');
      k.vis(x - 0.42, F + 1.1, -2.92, x + 0.42, F + 1.5, -2.08, 0x2a7a3a);
      const p = k.tp(x, -2.5); World.pumps.push({ x: p[0], y: k.y + 1, z: p[1] });
    }
    // loja de conveniência
    const sk = new Kit(k.loc, ...(() => { const p = k.tp(0, 6); return [p[0], k.y, p[1]]; })(), k.rot);
    sk.shell(9, 6, 3, 0xf0efe8, { f: [Dop(-2, 1.4), Wop(1.8, 3, 0.6, 2.4)], b: [], l: [], r: [] }, F);
    sk.box(-4.6, F + 3, -3.1, 4.6, F + 3.2, 3.1, 0xd0d0cc);
    sk.box(-4, F, 1.8, 4, F + 1.4, 2.6, 0x8a8d92, 'metal');
    sk.box(2.5, F, -1.5, 3.8, F + 1.0, -0.8, 0x5a5c60, 'metal');
    sk.loot(-2.5, F + 1.4, 2.2, 'mercado'); sk.loot(1.5, F + 1.4, 2.2, 'mercado'); sk.loot(3.1, F + 1.0, -1.15, 'casa'); sk.loot(-3, F, -1, 'industrial');
    sk.finish();
    k.sign('POSTO', 0, F + 5.05, -7.12, Math.PI, 3.2, 0.4, '#2a7a3a', '#ffe14a');
    k.finish();
  },

  tenda(k, table = 'militar', color = PAL.canvas) {
    const W = 4, D = 5, F = 0.05;
    k.box(-W / 2, F, D / 2 - 0.08, W / 2, F + 1.4, D / 2, color, 'cloth');
    k.box(-W / 2, F, -D / 2, -W / 2 + 0.08, F + 1.4, D / 2, color, 'cloth');
    k.box(W / 2 - 0.08, F, -D / 2, W / 2, F + 1.4, D / 2, color, 'cloth');
    k.gb.prism(-W / 2 - 0.1, W / 2 + 0.1, -D / 2, D / 2, F + 1.4, F + 2.6, color, 'z');
    k.col(-W / 2, F + 2.4, -D / 2, W / 2, F + 2.5, D / 2, 'cloth', { ghost: true, roof: true });
    k.box(-1.6, F, -0.5, -0.8, F + 0.45, 2.2, 0x4d5338, 'cloth');
    k.loot(-1.2, F + 0.45, 0.8, table);
    if (this.r() < 0.5) k.loot(1.0, F, 1.5, table);
    k.finish();
  },

  cabana(k, table = 'caca') {
    const W = 6, D = 5, H = 2.6, F = 0.15;
    const wc = this.pick([0x8a5a2b, 0x7a4a24, 0x9c6b42]);
    k.base(W, D, F, 0x6b4a2a, 0x8a6a4a);
    k.shell(W, D, H, wc, { f: [Dop(-0.8)], l: [Wop(0, 1.0)], r: [Wop(0, 1.0)], b: [Wop(1.2, 1.0)] }, F, 0.22);
    k.door(-1.3, -D / 2, 'x', 1.0, 1, F, PAL.woodD);
    k.box(-W / 2 - 0.1, F + H, -D / 2 - 0.1, W / 2 + 0.1, F + H + 0.12, D / 2 + 0.1, PAL.woodD, 'wood');
    k.roofGable(W, D, F + H + 0.12, 1.5, 0x4a3a2a, wc, 'x', 0.4);
    k.box(1.0, F, 0.8, 2.6, F + 0.75, 2.2, PAL.woodD, 'wood');
    k.box(-2.7, F, 0.4, -1.2, F + 0.45, 2.3, 0x7a5a3a, 'wood');
    k.loot(1.8, F + 0.75, 1.5, table); k.loot(-2, F + 0.45, 1.3, table);
    if (this.r() < 0.5) k.loot(2, F, -1.5, table);
    k.finish();
  },

  container(k, color, table = 'industrial') {
    const L = 6, W = 2.4, H = 2.6, F = 0.1;
    k.box(-L / 2, -0.5, -W / 2, L / 2, F, W / 2, 0x4a4a4a, 'metal');
    k.wallX(-W / 2, -L / 2, L / 2, H, color, [], 0.08, F, 'metal');
    k.wallX(W / 2, -L / 2, L / 2, H, color, [], 0.08, F, 'metal');
    k.wallZ(-L / 2, -W / 2, W / 2, H, color, [], 0.08, F, 'metal');
    k.box(-L / 2, F + H, -W / 2, L / 2, F + H + 0.08, W / 2, color, 'metal');
    for (let x = -L / 2 + 0.3; x < L / 2; x += 0.5) { k.vis(x, F, -W / 2 - 0.06, x + 0.08, F + H, -W / 2 - 0.04, color); k.vis(x, F, W / 2 + 0.04, x + 0.08, F + H, W / 2 + 0.06, color); }
    k.vis(L / 2 - 0.05, F, W / 2, L / 2 + 0.05, F + H, W / 2 + 1.1, color);
    k.loot(-1.5, F, 0, table);
    if (this.r() < 0.4) k.loot(1, F, 0.5, table);
    k.finish();
  },

  guarita(k, table = 'militar') {
    const F = 0.12;
    k.base(3, 3, F, PAL.conc, 0x8a8478);
    k.shell(3, 3, 2.6, 0xd8d4c8, { f: [Dop(0, 0.9)], l: [Wop(0, 1.6, 1.0, 2.2)], r: [Wop(0, 1.6, 1.0, 2.2)], b: [Wop(0, 1.6, 1.0, 2.2)] }, F);
    k.box(-1.7, F + 2.6, -1.7, 1.7, F + 2.8, 1.7, 0x6a6e5a);
    k.box(0.4, F, 0.6, 1.3, F + 0.9, 1.3, PAL.woodD, 'wood');
    k.loot(0.85, F + 0.9, 0.95, table);
    k.finish();
  },

  sandbags(loc, x0, z0, x1, z1, y = null) {
    const k = this.kit(loc, (x0 + x1) / 2, (z0 + z1) / 2, 0, Math.abs(x1 - x0) / 2, Math.abs(z1 - z0) / 2, y);
    const hx = Math.abs(x1 - x0) / 2, hz = Math.abs(z1 - z0) / 2;
    k.box(-hx, -0.3, -hz, hx, 0.85, hz, 0xb5a37a, 'sand');
    k.finish();
  },

  // ---------------------------------------------------------------- Locais
  city(L) {
    const offs = [-72, -36, 0, 36, 72];
    const half = 5;
    for (const o of offs) {
      this.street(L, L.x - 88, L.z + o - half, L.x + 88, L.z + o + half);
      this.street(L, L.x + o - half, L.z - 88, L.x + o + half, L.z + 88);
    }
    // faixas centrais
    for (const o of offs) for (let t = -84; t < 84; t += 6) {
      this.street(L, L.x + t, L.z + o - 0.1, L.x + t + 3, L.z + o + 0.1, 0xe8d27a, L.h + 0.01);
      this.street(L, L.x + o - 0.1, L.z + t, L.x + o + 0.1, L.z + t + 3, 0xe8d27a, L.h + 0.01);
    }
    const plan = {
      '-54,-54': 'casas', '-18,-54': 'delegacia', '18,-54': 'mercado', '54,-54': 'casas',
      '-54,-18': 'predio', '-18,-18': 'praca', '18,-18': 'hospital', '54,-18': 'sobrados',
      '-54,18': 'galpao', '-18,18': 'museu', '18,18': 'predio', '54,18': 'casas',
      '-54,54': 'casas', '-18,54': 'sobrados', '18,54': 'casas', '54,54': 'predio',
    };
    for (const key in plan) {
      const [ox, oz] = key.split(',').map(Number);
      const bx = L.x + ox, bz = L.z + oz, type = plan[key];
      // calçada
      this.street(L, bx - 13.5, bz - 13.5, bx + 13.5, bz + 13.5, 0x9a978e, L.h + 0.03);
      const K = (x, z, rot, hw, hd) => this.kit(L, x, z, rot, hw, hd, L.h + 0.1);
      if (type === 'casas' || type === 'sobrados') {
        for (const [dx, dz] of [[-6.5, -6.5], [6.5, -6.5], [-6.5, 6.5], [6.5, 6.5]]) {
          const rot = dz < 0 ? 0 : 2;
          const k = K(bx + dx, bz + dz, rot, 5, 5);
          if (type === 'sobrados' ? this.r() < 0.7 : this.r() < 0.2) this.sobrado(k); else this.casa(k);
        }
      } else if (type === 'predio') this.predio(K(bx, bz, this.r() < 0.5 ? 0 : 2, 6, 6));
      else if (type === 'delegacia') this.delegacia(K(bx, bz, 0, 7, 5));
      else if (type === 'mercado') this.mercado(K(bx, bz, 0, 8, 6));
      else if (type === 'hospital') this.hospital(K(bx, bz, 0, 10, 6));
      else if (type === 'museu') this.museu(K(bx, bz + 2, 0, 7, 6));
      else if (type === 'galpao') this.galpao(K(bx, bz, 1, 10, 7));
      else if (type === 'praca') {
        const k = K(bx, bz, 0, 10, 10);
        k.vis(-12, 0.0, -12, 12, 0.02, 12, 0x7a8f4a);
        k.box(-2.5, -0.2, -2.5, 2.5, 0.6, 2.5, 0xd0ccc0);
        k.vis(-2.2, 0.6, -2.2, 2.2, 0.62, 2.2, 0x4a8ab0);
        k.box(-0.4, 0.6, -0.4, 0.4, 2.8, 0.4, 0xb0aca0);
        k.gb.sph(0.5, 0, 3.2, 0, 0x8a8478);
        for (const [x, z, r] of [[-8, -8, 0], [8, -8, 0], [-8, 8, 0], [8, 8, 0]]) {
          k.box(x - 1.2, 0, z - 0.3, x + 1.2, 0.45, z + 0.3, PAL.wood, 'wood');
          k.gb.cyl(0.18, 3, x + 3, 1.5, z, 0x5a3b22, 'y', 6); k.gb.sph(1.6, x + 3, 3.6, z, 0x4d7d34, 0.9, true);
          k.col(x + 2.8, 0, z - 0.2, x + 3.2, 4, z + 0.2, 'wood');
        }
        k.loot(-8, 0.45, -8, 'casa'); k.loot(8, 0.45, 8, 'casa');
        k.finish();
      }
    }
    for (const [x, z, yaw] of [[-36, -26, 0], [36, 30, Math.PI], [-60, 2, Math.PI / 2], [10, 72, -Math.PI / 2], [64, -36, Math.PI / 2]]) {
      World.vehicleSpawns.push({ x: L.x + x, z: L.z + z, yaw, type: this.r() < 0.6 ? 'fusca' : 'picape' });
    }
  },

  village(L) {
    this.street(L, L.x - 50, L.z - 4, L.x + 50, L.z + 4, 0x6e6a60);
    this.street(L, L.x - 4, L.z - 50, L.x + 4, L.z + 50, 0x6e6a60);
    const spots = [[-38, -14, 2], [-21, -14, 2], [21, -14, 2], [38, -14, 2], [-38, 14, 0], [-21, 14, 0], [21, 14, 0], [38, 14, 0]];
    spots.forEach(([dx, dz, rot], i) => {
      const k = this.kit(L, L.x + dx, L.z + dz, rot, 5, 5);
      if (i === 5) this.mercado(k, 'mercado', 'MERCEARIA');
      else if (i === 2 || i === 7) this.sobrado(k);
      else this.casa(k);
    });
    this.galpao(this.kit(L, L.x - 26, L.z + 36, 1, 7, 10), 'industrial');
    this.cabana(this.kit(L, L.x + 28, L.z - 36, 2, 3, 3), 'casa');
    World.vehicleSpawns.push({ x: L.x - 10, z: L.z + 2, yaw: Math.PI / 2, type: 'fusca' }, { x: L.x + 6, z: L.z - 24, yaw: 0, type: 'picape' });
  },

  port(L) {
    this.street(L, L.x - 46, L.z - 4, L.x + 40, L.z + 4, 0x55565a);
    this.street(L, L.x - 4, L.z - 46, L.x + 4, L.z + 46, 0x55565a);
    this.galpao(this.kit(L, L.x + 20, L.z - 22, 0, 10, 7), 'industrial');
    this.galpao(this.kit(L, L.x - 22, L.z - 24, 0, 10, 7), 'industrial');
    const cols = [0xa83a2a, 0x2f5fa8, 0x3d8a4f, 0xd9a21b, 0x8a3a6a, 0x3a7a7a];
    let i = 0;
    for (const dz of [14, 18, 22]) for (const dx of [14, 22, 30]) {
      if (this.r() < 0.25) continue;
      this.container(this.kit(L, L.x + dx, L.z + dz, this.r() < 0.5 ? 0 : 2, 3, 1.5), cols[i++ % cols.length], this.r() < 0.15 ? 'militar' : 'industrial');
    }
    this.casa(this.kit(L, L.x - 22, L.z + 16, 0, 5, 5));
    this.sobrado(this.kit(L, L.x - 36, L.z + 16, 0, 5, 5));
    this.mercado(this.kit(L, L.x - 26, L.z + 34, 2, 8, 6), 'mercado', 'PEIXARIA');
    // Píer sobre a água.
    const k = this.kit(L, L.x + 46, L.z, 0, 1, 1, L.h + 0.2);
    const len = 70;
    k.box(-6, -0.3, -2.5, len, 0, 2.5, 0x8a6a4a, 'wood');
    for (let x = 0; x < len; x += 6) for (const z of [-2.3, 2.3]) k.vis(x - 0.15, -12, z - 0.15, x + 0.15, 0, z + 0.15, 0x5a3b22);
    k.box(len - 6, 0, -2.5, len, 0.9, -2.4, PAL.woodD, 'wood'); k.box(len - 6, 0, 2.4, len, 0.9, 2.5, PAL.woodD, 'wood');
    for (const x of [20, 40]) k.box(x, 0, -2.3, x + 1.2, 0.8, -1.3, 0x9a7a4a, 'wood');
    k.loot(20.6, 0.8, -1.8, 'industrial'); k.loot(40.6, 0.8, -1.8, 'caca'); k.loot(len - 3, 0, 0, 'militar');
    // barco atracado
    const by = World.WATER - (k.y);
    k.box(30, by - 0.6, 3.5, 44, by + 1.0, 7.5, 0xe8e8e4, 'wood');
    k.box(36, by + 1.0, 4.2, 41, by + 2.8, 6.8, 0x2f5fa8, 'wood');
    k.vis(30, by + 0.9, 3.45, 44, by + 1.05, 7.55, 0xa83a2a);
    k.loot(33, by + 1.0, 5.5, 'caca');
    k.finish();
    World.vehicleSpawns.push({ x: L.x - 8, z: L.z + 2, yaw: Math.PI / 2, type: 'picape' });
  },

  base(L) {
    const S = 58, h = L.h + 0.05;
    this.street(L, L.x - 4, L.z - 4, L.x + 4, L.z + S + 8, 0x55565a);
    this.street(L, L.x - 4, L.z - 4, L.x + S + 8, L.z + 4, 0x55565a);
    this.street(L, L.x - 40, L.z - 4, L.x + 4, L.z + 4, 0x55565a);
    // muro com portões ao norte (+Z) e leste (+X)
    const k = this.kit(L, L.x, L.z, 0, S, S, h);
    const gate = { a: -6, b: 6, y0: 0, y1: 3.3 };
    k.wallX(-S, -S, S, 3.3, 0xb0aa94, [], 0.5, -0.5);
    k.wallX(S, -S, S, 3.3, 0xb0aa94, [gate], 0.5, -0.5);
    k.wallZ(-S, -S, S, 3.3, 0xb0aa94, [], 0.5, -0.5);
    k.wallZ(S, -S, S, 3.3, 0xb0aa94, [gate], 0.5, -0.5);
    for (let t = -S; t <= S; t += 4) for (const [x, z] of [[t, -S], [t, S], [-S, t], [S, t]]) if (Math.abs(t) > 7 || (x === -S || z === -S)) k.vis(x - 0.05, 2.8, z - 0.05, x + 0.05, 3.5, z + 0.05, 0x555555);
    // heliponto
    k.vis(-14, 0.02, 20, 2, 0.06, 36, 0x55565a);
    k.vis(-9, 0.07, 24, -7.6, 0.08, 32, 0xffffff); k.vis(-4.4, 0.07, 24, -3, 0.08, 32, 0xffffff); k.vis(-7.6, 0.07, 27.4, -4.4, 0.08, 28.6, 0xffffff);
    for (const x of [-6.6, 6.6]) k.box(x - 0.35, -0.5, S - 0.35, x + 0.35, 4.4, S + 0.35, 0x8a8470);
    k.vis(-7, 3.7, S - 0.3, 7, 4.4, S + 0.3, 0x6b6e5a);
    k.sign('BASE MILITAR SENTINELA', 0, 4.05, S + 0.32, 0, 6, 0.6, '#3d4430', '#e8e2c8');
    k.finish();
    this.hangar(this.kit(L, L.x - 28, L.z - 30, 2, 13, 10, h));
    for (const dz of [-42, -26, -10]) this.quartel(this.kit(L, L.x + 26, L.z + dz, 0, 8, 4, h));
    for (const [dx, dz] of [[-50, -50], [50, -50], [-50, 50], [50, 50]]) this.torre(this.kit(L, L.x + dx, L.z + dz, dz < 0 ? 2 : 0, 2, 2, h));
    for (const [dx, dz] of [[-40, 14], [-33, 14], [-26, 14], [-40, 26]]) this.tenda(this.kit(L, L.x + dx, L.z + dz, 0, 2, 2.5, h), 'militar');
    const cc = [0x5a6142, 0x6b6e5a, 0x4d5338];
    [[30, 26], [30, 32], [30, 38], [40, 32]].forEach(([dx, dz], i) => this.container(this.kit(L, L.x + dx, L.z + dz, 0, 3, 1.5, h), cc[i % 3], i === 3 ? 'elite' : 'militar'));
    this.guarita(this.kit(L, L.x + 9, L.z + S - 4, 0, 1.5, 1.5, h), 'militar');
    this.guarita(this.kit(L, L.x + S - 4, L.z - 9, 1, 1.5, 1.5, h), 'militar');
    this.sandbags(L, L.x - 10, L.z + S - 7, L.x - 6, L.z + S - 6, h);
    this.sandbags(L, L.x + S - 7, L.z + 6, L.x + S - 6, L.z + 10, h);
    World.vehicleSpawns.push({ x: L.x + 10, z: L.z - 2, yaw: 0, type: 'humvee' });
  },

  farm(L) {
    this.street(L, L.x - 54, L.z - 3, L.x + 4, L.z + 3, 0x86724e);
    this.street(L, L.x - 3, L.z - 54, L.x + 3, L.z + 54, 0x86724e);
    this.sobrado(this.kit(L, L.x - 20, L.z - 16, 2, 5, 5), 'fazenda');
    this.celeiro(this.kit(L, L.x - 24, L.z + 20, 1, 8, 6));
    const k = this.kit(L, L.x - 10, L.z + 30, 0, 3, 3);
    k.gb.cyl(3, 10, 0, 5, 0, 0xb0b4b8, 'y', 12); k.gb.cone(3.2, 2, 0, 11, 0, 0x8a8d92);
    k.col(-2.6, 0, -2.6, 2.6, 10, 2.6, 'metal');
    k.finish();
    // cercas da plantação
    const fk = this.kit(L, L.x, L.z, 0, 1, 1, L.h);
    const fence = (x0, z0, x1, z1) => {
      const b = fk.box(Math.min(x0, x1) - 0.05, 0, Math.min(z0, z1) - 0.05, Math.max(x0, x1) + 0.05, 0.75, Math.max(z0, z1) + 0.05, PAL.wood, 'wood');
      return b;
    };
    fence(6, -46, 48, -46); fence(6, 10, 18, 10); fence(26, 10, 48, 10); fence(48, -46, 48, 10); fence(6, -46, 6, -6);
    // trator
    fk.box(20, 0, -20, 23, 1.6, -18.4, 0x2f7a3a, 'metal'); fk.vis(20.4, 1.6, -19.8, 22.2, 2.8, -18.6, 0x3a3a3a);
    fk.gb.cyl(0.9, 0.5, 22.6, 0.9, -17.9, 0x1a1a1a, 'x', 10); fk.gb.cyl(0.9, 0.5, 22.6, 0.9, -20.5, 0x1a1a1a, 'x', 10);
    fk.finish();
    this.cabana(this.kit(L, L.x + 22, L.z + 30, 3, 3, 3), 'fazenda');
    World.vehicleSpawns.push({ x: L.x - 6, z: L.z - 8, yaw: 0, type: 'picape' });
  },

  gas(L) {
    this.street(L, L.x - 24, L.z - 4, L.x + 24, L.z + 4, 0x3d3e42);
    this.posto(this.kit(L, L.x, L.z - 14, 2, 8, 8));
    World.vehicleSpawns.push({ x: L.x + 6, z: L.z - 12, yaw: Math.PI / 2, type: 'fusca' });
  },

  camp(L) {
    this.street(L, L.x - 3, L.z - 32, L.x + 3, L.z + 2, 0x86724e);
    for (const [dx, dz] of [[-14, 8], [-8, 12], [10, 10], [14, 4]]) this.tenda(this.kit(L, L.x + dx, L.z + dz, dz > 8 ? 2 : 3, 2, 2.5), 'caca', 0x5a6a3a);
    this.cabana(this.kit(L, L.x - 15, L.z - 10, 1, 3, 3), 'caca');
    this.cabana(this.kit(L, L.x + 15, L.z - 12, 3, 3, 3), 'caca');
    this.torre(this.kit(L, L.x + 22, L.z + 18, 0, 2, 2), 'caca');
    const k = this.kit(L, L.x, L.z + 2, 0, 1, 1);
    for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; k.gb.box(0.6, 0.2, 0.2, Math.cos(a) * 0.5, 0.1, Math.sin(a) * 0.5, 0x5a3b22, 0, a, 0); }
    k.finish();
    World.fires.push({ x: L.x, y: k.y + 0.3, z: L.z + 2 });
    World.vehicleSpawns.push({ x: L.x + 4, z: L.z - 20, yaw: 0, type: 'picape' });
  },

  radio(L) {
    const k = this.kit(L, L.x + 6, L.z + 6, 0, 2, 2);
    const H = 34;
    for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) k.box(x * 0.9 - 0.07, 0, z * 0.9 - 0.07, x * 0.9 + 0.07, H, z * 0.9 + 0.07, 0xc0392b, 'metal');
    for (let y = 2; y < H; y += 2.5) { k.gb.box(1.9, 0.08, 0.08, 0, y, -0.9, y % 5 < 2.5 ? 0xffffff : 0xc0392b); k.gb.box(1.9, 0.08, 0.08, 0, y, 0.9, 0xffffff); k.gb.box(0.08, 0.08, 1.9, -0.9, y, 0, 0xffffff); k.gb.box(0.08, 0.08, 1.9, 0.9, y, 0, 0xc0392b); }
    k.ladder(-0.45, -0.45, 0.45, 0.45, 0, 12.3, 'z');
    k.box(-1.6, 12, -1.6, -0.6, 12.15, 1.6, 0x5a5c60, 'metal');
    k.box(0.6, 12, -1.6, 1.6, 12.15, 1.6, 0x5a5c60, 'metal');
    k.box(-0.6, 12, -1.6, 0.6, 12.15, -0.6, 0x5a5c60, 'metal');
    k.box(-0.6, 12, 0.6, 0.6, 12.15, 1.6, 0x5a5c60, 'metal');
    k.wallX(-1.6, -1.6, 1.6, 1.0, 0x8a8d92, [], 0.06, 12.15, 'metal');
    k.wallX(1.6, -1.6, 1.6, 1.0, 0x8a8d92, [], 0.06, 12.15, 'metal');
    k.wallZ(-1.6, -1.6, 1.6, 1.0, 0x8a8d92, [], 0.06, 12.15, 'metal');
    k.wallZ(1.6, -1.6, 1.6, 1.0, 0x8a8d92, [], 0.06, 12.15, 'metal');
    k.loot(0.8, 12.15, 0.8, 'elite');
    k.finish();
    this.container(this.kit(L, L.x - 12, L.z - 8, 1, 1.5, 3), 0x5a6142, 'militar');
    this.container(this.kit(L, L.x - 12, L.z + 10, 1, 1.5, 3), 0x4d5338, 'militar');
    this.guarita(this.kit(L, L.x + 12, L.z - 12, 0, 1.5, 1.5), 'militar');
  },

  range(L) {
    const x0 = -170, z = -185;
    const k = this.kit(L, x0, z, 0, 3, 6);
    k.box(-1.5, 0, -5, 1.5, 0.9, 5, PAL.woodD, 'wood');
    for (const [dx, dz] of [[-3, -6], [-3, 6], [2, -6], [2, 6]]) k.box(dx - 0.15, 0, dz - 0.15, dx + 0.15, 3.2, dz + 0.15, PAL.woodD, 'wood');
    k.box(-3.5, 3.2, -6.5, 2.5, 3.4, 6.5, 0x6b5a4a, 'wood');
    k.loot(0, 0.9, -3, 'militar'); k.loot(0, 0.9, 3, 'militar');
    k.sign('ESTANDE DE TIRO', -3.4, 2.6, 0, -Math.PI / 2, 4, 0.6, '#3d4430', '#e8e2c8');
    k.finish();
    this.cabana(this.kit(L, x0 + 6, z - 16, 1, 3, 3), 'militar');
    const dists = [25, 50, 100, 150, 200, 300];
    const offs = [-5, 4, -2, 5, -4, 0];
    dists.forEach((d, i) => {
      const tx = x0 + d, tz = z + offs[i];
      const kt = this.kit(L, tx, tz, 0, 1, 1);
      const sc = 1 + d / 300;
      kt.vis(-0.06, 0, -0.06, 0.06, 1.0, 0.06, 0x555555);
      kt.vis(-0.6 * sc, -0.3, -1.2 * sc, 0.6 * sc, 0.4, 1.2 * sc, 0x6b5a3a);
      kt.finish();
      const plate = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.6 * sc, 0.6 * sc), MAT.color(0xd8d8d0, false));
      plate.position.set(tx, kt.y + 1.0 + 0.3 * sc, tz);
      World.scene.add(plate);
      const ring = new THREE.Mesh(new THREE.BoxGeometry(0.065, 0.2 * sc, 0.2 * sc), MAT.color(0xc0392b, false));
      plate.add(ring);
      const col = Phys.add({ x0: tx - 0.04, x1: tx + 0.04, y0: kt.y + 1.0, y1: kt.y + 1.0 + 0.6 * sc, z0: tz - 0.3 * sc, z1: tz + 0.3 * sc, mat: 'metal' });
      const tgt = { dist: d, mesh: plate, col, swing: 0, x: tx, z: tz };
      col.target = tgt;
      World.targets.push(tgt);
      const sg = World.makeSign(d + ' m', 1.4, 0.5, '#2a2a2a', '#ffe14a');
      sg.position.set(tx - 0.2, kt.y + 2.4 + 0.3 * sc, tz); sg.rotation.y = -Math.PI / 2;
      World.scene.add(sg);
    });
    L.spawn = { x: x0 - 2.6, z, yaw: -Math.PI / 2 };
  },

  // Casas e cabanas isoladas pelo mapa.
  scatter() {
    const r = U.rng(World.SEED + 31);
    let placed = 0, tries = 0;
    const wild = { id: 'wild', name: 'Interior' };
    while (placed < 14 && tries < 600) {
      tries++;
      const x = (r() - 0.5) * 760, z = (r() - 0.5) * 760;
      const h = World.height(x, z);
      if (h < 4 || World.slope(x, z) > 0.35 || World.inAnyLoc(x, z, 30) || World.nearRoad(x, z, 10)) continue;
      if (Math.abs(z + 185) < 30 && x > -180 && x < 170) continue;
      if (World.lootPoints.some((p) => p.loc === 'wild' && Math.hypot(p.x - x, p.z - z) < 60)) continue;
      const k = this.kit(wild, x, z, Math.floor(r() * 4), 4, 4);
      if (r() < 0.65) this.cabana(k, r() < 0.7 ? 'caca' : 'casa'); else this.casa(k);
      placed++;
    }
  },

  // Carros abandonados nas estradas.
  wrecks() {
    const r = U.rng(World.SEED + 77);
    const wild = { id: 'wrecks' };
    const cols = [0x6a4a3a, 0x5a5f66, 0x7a3a2a, 0x4a5a6a, 0x8a7a5a];
    for (const road of World.roads) {
      if (road.kind === 'estande') continue;
      for (let i = 10; i < road.S.length - 10; i += 14 + Math.floor(r() * 18)) {
        if (r() < 0.45) continue;
        const a = road.S[i], b = road.S[i + 1];
        const ang = Math.atan2(b.x - a.x, b.z - a.z);
        const snap = Math.round(ang / (Math.PI / 2));
        const lane = (r() < 0.5 ? -1 : 1) * road.w * 0.22;
        const nx = Math.cos(ang) * lane, nz = -Math.sin(ang) * lane;
        const x = a.x + nx, z = a.z + nz;
        if (World.inAnyLoc(x, z, 4)) continue;
        const k = this.kit(wild, x, z, snap, 2, 2);
        k.y -= 0.15;
        const c = cols[Math.floor(r() * cols.length)];
        k.box(-0.85, 0.25, -2.0, 0.85, 1.05, 2.0, c, 'metal');
        k.vis(-0.75, 1.05, -0.8, 0.75, 1.55, 0.9, 0x2a2e33);
        for (const [wx, wz] of [[-0.8, -1.3], [0.8, -1.3], [-0.8, 1.3], [0.8, 1.3]]) k.gb.cyl(0.32, 0.25, wx, 0.3, wz, 0x18181a, 'x', 8);
        k.loot(0, 1.05, -1.5, U.chance(0.5) ? 'casa' : 'industrial');
        k.finish();
      }
    }
  },
};

// Placas com texto (textura de canvas).
World.makeSign = function (text, w, h, bg, fg) {
  const cv = document.createElement('canvas');
  const ratio = w / h;
  cv.height = 64; cv.width = Math.min(1024, Math.round(64 * ratio));
  const c = cv.getContext('2d');
  c.fillStyle = bg; c.fillRect(0, 0, cv.width, cv.height);
  c.fillStyle = fg;
  c.font = 'bold 44px system-ui, sans-serif';
  c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillText(text, cv.width / 2, cv.height / 2 + 2, cv.width - 10);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshLambertMaterial({ map: tex, side: THREE.DoubleSide }));
  return m;
};
