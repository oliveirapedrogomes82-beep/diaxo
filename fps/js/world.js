'use strict';
// Mundo: ilha procedural com relevo, estradas, cidades, vegetação, água e ciclo dia/noite.

const World = {
  SIZE: 1000, HALF: 500, CELL: 4, N: 250, WATER: 0, SEED: 7331,
  H: null, roadD: null,
  locations: [], roads: [], lootPoints: [], doors: [], vehicleSpawns: [], targets: [], trees: [], pumps: [],
  zoneSpawns: [], animalsSpawns: [], fires: [],
  locGeo: {},

  init(scene) {
    this.scene = scene;
    this.noise = makeNoise2D(this.SEED);
    this.rnd = U.rng(this.SEED);
    this.defineLocations();
    this.genHeights();
    this.defineRoads();
    this.applyRoads();
    this.buildTerrain();
    this.buildWater();
    this.buildRoadMeshes();
    Buildings.buildAll(this);
    this.flushLocGeo();
    this.buildTrees();
    this.buildSky();
  },

  // ---------------------------------------------------------------- Relevo
  raw(x, z) {
    const n = this.noise;
    const d = Math.hypot(x, z) / this.HALF;
    const warp = n(x * 0.004 + 31.7, z * 0.004 - 12.3) * 0.12;
    const island = U.smoothstep(0.97, 0.74, d + warp);
    let h = 6 + n.fbm(x * 0.0028, z * 0.0028, 4) * 20;
    const ridge = 1 - Math.abs(n.fbm(x * 0.0045 + 100, z * 0.0045 - 50, 3));
    h += Math.pow(ridge, 3) * 30 * U.smoothstep(0.15, 0.7, n(x * 0.002 - 40, z * 0.002 + 70) * 0.5 + 0.5);
    h += n(x * 0.03, z * 0.03) * 1.0;
    h = Math.max(h, -3);
    return U.lerp(-16, h, island);
  },

  idx(i, j) { return j * (this.N + 1) + i; },

  genHeights() {
    const N = this.N, n1 = N + 1, C = this.CELL, Hh = this.HALF;
    this.H = new Float32Array(n1 * n1);
    for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) this.H[j * n1 + i] = this.raw(-Hh + i * C, -Hh + j * C);
    // Aplaina os locais.
    for (const L of this.locations) {
      if (!L.r) continue;
      let s = 0, k = 0;
      for (let a = 0; a < 12; a++) for (const rr of [0, 0.35, 0.7]) {
        s += this.raw(L.x + Math.cos(a) * L.r * rr, L.z + Math.sin(a) * L.r * rr); k++;
      }
      L.h = Math.max(s / k, L.minH || 3);
      if (L.keepHill) L.h = Math.max(L.h, this.raw(L.x, L.z));
      const fall = L.fall || 26;
      const i0 = Math.max(0, Math.floor((L.x - L.r - fall + Hh) / C)), i1 = Math.min(N, Math.ceil((L.x + L.r + fall + Hh) / C));
      const j0 = Math.max(0, Math.floor((L.z - L.r - fall + Hh) / C)), j1 = Math.min(N, Math.ceil((L.z + L.r + fall + Hh) / C));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const x = -Hh + i * C, z = -Hh + j * C;
        const d = L.square ? Math.max(Math.abs(x - L.x), Math.abs(z - L.z)) : Math.hypot(x - L.x, z - L.z);
        const t = U.smoothstep(L.r + fall, L.r, d);
        if (t > 0) this.H[j * n1 + i] = U.lerp(this.H[j * n1 + i], L.h, t);
      }
    }
  },

  // Altura exata (mesma triangulação da malha).
  height(x, z) {
    const C = this.CELL, Hh = this.HALF, N = this.N, n1 = N + 1;
    let fx = (x + Hh) / C, fz = (z + Hh) / C;
    if (fx < 0 || fz < 0 || fx >= N || fz >= N) return -16;
    const i = Math.floor(fx), j = Math.floor(fz);
    fx -= i; fz -= j;
    const H = this.H, b = j * n1 + i;
    const h00 = H[b], h10 = H[b + 1], h01 = H[b + n1], h11 = H[b + n1 + 1];
    if (fx + fz <= 1) return h00 + (h10 - h00) * fx + (h01 - h00) * fz;
    return h11 + (h01 - h11) * (1 - fx) + (h10 - h11) * (1 - fz);
  },
  normal(x, z) {
    const e = 1.0;
    const hx = this.height(x + e, z) - this.height(x - e, z), hz = this.height(x, z + e) - this.height(x, z - e);
    return new THREE.Vector3(-hx, 2 * e, -hz).normalize();
  },
  slope(x, z) { const n = this.normal(x, z); return Math.sqrt(1 - n.y * n.y) / Math.max(0.05, n.y); },

  // ---------------------------------------------------------------- Locais
  defineLocations() {
    const L = (id, name, x, z, r, type, o = {}) => { const l = Object.assign({ id, name, x, z, r, type }, o); this.locations.push(l); return l; };
    L('santacruz', 'Santa Cruz', -140, 60, 88, 'cidade', { zombies: 24, square: true, fall: 30 });
    L('esperanca', 'Vila Esperança', 170, 185, 50, 'vila', { zombies: 10 });
    let cx = 140; const pz = -205;
    while (cx < 470 && this.raw(cx, pz) > 0.8) cx += 2;
    this.coastX = cx;
    L('porto', 'Porto Novo', cx - 44, pz, 46, 'porto', { zombies: 12, minH: 2.8 });
    L('base', 'Base Militar Sentinela', -235, -185, 66, 'militar', { zombies: 16, square: true });
    L('fazenda', 'Fazenda Boa Vista', 100, -30, 54, 'fazenda', { zombies: 6 });
    L('posto', 'Posto Rodovia', 25, 140, 24, 'posto', { zombies: 4 });
    L('acampamento', 'Acampamento Pica-Pau', -45, 285, 32, 'acampamento', { zombies: 5 });
    L('torre', 'Torre de Rádio', 290, 45, 22, 'torre', { zombies: 4, keepHill: true });
    L('estande', 'Estande de Tiro', -10, -185, 0, 'estande', { zombies: 0 });
    // Saídas para as estradas.
    for (const l of this.locations) {
      if (l.r) l.exits = [[l.x + l.r * 0.95, l.z], [l.x - l.r * 0.95, l.z], [l.x, l.z + l.r * 0.95], [l.x, l.z - l.r * 0.95]];
    }
  },
  loc(id) { return this.locations.find((l) => l.id === id); },
  locAt(x, z) {
    let best = null, bd = Infinity;
    for (const l of this.locations) {
      const d = Math.hypot(x - l.x, z - l.z) - (l.r || 20);
      if (d < bd) { bd = d; best = l; }
    }
    return bd < 15 ? best : null;
  },
  inAnyLoc(x, z, pad = 0) {
    for (const l of this.locations) {
      if (!l.r) continue;
      const d = l.square ? Math.max(Math.abs(x - l.x), Math.abs(z - l.z)) : Math.hypot(x - l.x, z - l.z);
      if (d < l.r + pad) return l;
    }
    return null;
  },

  // ---------------------------------------------------------------- Estradas
  defineRoads() {
    const ex = (a, b) => {
      const A = this.loc(a), B = this.loc(b);
      let best = A.exits[0], bd = Infinity;
      for (const e of A.exits) { const d = Math.hypot(e[0] - B.x, e[1] - B.z); if (d < bd) { bd = d; best = e; } }
      return best;
    };
    const R = (kind, w, ...pts) => this.roads.push({ kind, w, pts });
    const chain = (kind, w, ids) => {
      for (let i = 0; i < ids.length - 1; i++) R(kind, w, ex(ids[i], ids[i + 1]), ex(ids[i + 1], ids[i]));
    };
    chain('asfalto', 9, ['santacruz', 'posto', 'esperanca']);
    chain('asfalto', 9, ['santacruz', 'base']);
    chain('asfalto', 9, ['santacruz', 'fazenda', 'porto']);
    chain('asfalto', 8, ['esperanca', 'fazenda']);
    chain('terra', 6, ['esperanca', 'torre']);
    chain('terra', 6, ['santacruz', 'acampamento']);
    R('estande', 18, [-176, -185], [160, -185]);
    // Curvas suaves e amostragem a cada 4 m.
    for (const r of this.roads) {
      let pts = r.pts;
      if (r.kind !== 'estande') {
        const [a, b] = pts;
        const dx = b[0] - a[0], dz = b[1] - a[1], len = Math.hypot(dx, dz);
        const nx = -dz / len, nz = dx / len;
        const o1 = (this.rnd() - 0.5) * len * 0.18, o2 = (this.rnd() - 0.5) * len * 0.18;
        // Pontas retas para encaixar nas saídas das cidades.
        const ax = a[0] + dx * 0.08, az = a[1] + dz * 0.08, bx = b[0] - dx * 0.08, bz = b[1] - dz * 0.08;
        pts = [a, [ax, az], [a[0] + dx * 0.36 + nx * o1, a[1] + dz * 0.36 + nz * o1], [a[0] + dx * 0.68 + nx * o2, a[1] + dz * 0.68 + nz * o2], [bx, bz], b];
      }
      // Catmull-Rom simples.
      const S = [];
      const P = (i) => pts[U.clamp(i, 0, pts.length - 1)];
      for (let i = 0; i < pts.length - 1; i++) {
        const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
        const segLen = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
        const n = Math.max(1, Math.ceil(segLen / 4));
        for (let k = 0; k < n; k++) {
          const t = k / n, t2 = t * t, t3 = t2 * t;
          const f = (a0, a1, a2, a3) => 0.5 * (2 * a1 + (-a0 + a2) * t + (2 * a0 - 5 * a1 + 4 * a2 - a3) * t2 + (-a0 + 3 * a1 - 3 * a2 + a3) * t3);
          S.push({ x: f(p0[0], p1[0], p2[0], p3[0]), z: f(p0[1], p1[1], p2[1], p3[1]) });
        }
      }
      const last = pts[pts.length - 1];
      S.push({ x: last[0], z: last[1] });
      for (const s of S) s.h = this.height(s.x, s.z);
      // Suaviza o perfil vertical.
      for (let pass = 0; pass < (r.kind === 'estande' ? 30 : 6); pass++) {
        const hs = S.map((s) => s.h);
        for (let i = 1; i < S.length - 1; i++) {
          let sum = 0, c = 0;
          for (let k = -3; k <= 3; k++) { const q = hs[U.clamp(i + k, 0, S.length - 1)]; sum += q; c++; }
          S[i].h = sum / c;
        }
      }
      for (const s of S) s.h = Math.max(s.h, 1.4);
      r.S = S;
    }
  },

  applyRoads() {
    const N = this.N, n1 = N + 1, C = this.CELL, Hh = this.HALF;
    const dBest = new Float32Array(n1 * n1).fill(1e9), hBest = new Float32Array(n1 * n1), wBest = new Float32Array(n1 * n1);
    for (const r of this.roads) {
      const S = r.S, fall = r.kind === 'estande' ? 22 : 10, half = r.w / 2;
      for (let s = 0; s < S.length - 1; s++) {
        const a = S[s], b = S[s + 1];
        const ext = half + fall;
        const i0 = Math.max(0, Math.floor((Math.min(a.x, b.x) - ext + Hh) / C)), i1 = Math.min(N, Math.ceil((Math.max(a.x, b.x) + ext + Hh) / C));
        const j0 = Math.max(0, Math.floor((Math.min(a.z, b.z) - ext + Hh) / C)), j1 = Math.min(N, Math.ceil((Math.max(a.z, b.z) + ext + Hh) / C));
        const dx = b.x - a.x, dz = b.z - a.z, l2 = dx * dx + dz * dz || 1;
        for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
          const x = -Hh + i * C, z = -Hh + j * C;
          let t = ((x - a.x) * dx + (z - a.z) * dz) / l2; t = U.clamp(t, 0, 1);
          const px = a.x + dx * t, pz = a.z + dz * t;
          const d = Math.hypot(x - px, z - pz);
          const k = j * n1 + i;
          if (d < dBest[k]) { dBest[k] = d; hBest[k] = U.lerp(a.h, b.h, t); wBest[k] = half + (r.kind === 'estande' ? 1000 : 0); }
        }
      }
    }
    this.roadD = dBest;
    for (let k = 0; k < n1 * n1; k++) {
      if (dBest[k] > 1e8) continue;
      const half = wBest[k] >= 1000 ? wBest[k] - 1000 : wBest[k];
      const fall = wBest[k] >= 1000 ? 22 : 10;
      const t = U.smoothstep(half + fall, half + 1, dBest[k]);
      if (t > 0) this.H[k] = U.lerp(this.H[k], hBest[k] - 0.05, t);
    }
  },

  nearRoad(x, z, d) {
    for (const r of this.roads) for (let i = 0; i < r.S.length; i += 2) {
      const s = r.S[i];
      if (Math.abs(s.x - x) < d + r.w && Math.abs(s.z - z) < d + r.w && Math.hypot(s.x - x, s.z - z) < d + r.w / 2) return r;
    }
    return null;
  },

  // ---------------------------------------------------------------- Malhas do terreno
  buildTerrain() {
    const N = this.N, n1 = N + 1, C = this.CELL, Hh = this.HALF, CH = 25;
    const n = this.noise;
    const col = new THREE.Color(), tmp = new THREE.Color();
    const cGrass = [new THREE.Color(0x5d8c38), new THREE.Color(0x6f9a40), new THREE.Color(0x4f7d32)];
    const cDirt = new THREE.Color(0x8a7650), cSand = new THREE.Color(0xd9c793), cRock = new THREE.Color(0x7d7a73);
    const cTown = new THREE.Color(0x8a877c), cVillage = new THREE.Color(0x7f8a52), cMil = new THREE.Color(0x7a7a62);
    const cField1 = new THREE.Color(0x7a5c34), cField2 = new THREE.Color(0xa6a24a), cSnow = new THREE.Color(0x9a9a92);
    const farm = this.loc('fazenda');
    const colors = new Float32Array(n1 * n1 * 3);
    for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) {
      const k = j * n1 + i, x = -Hh + i * C, z = -Hh + j * C, h = this.H[k];
      const v = n(x * 0.02, z * 0.02) * 0.5 + 0.5;
      col.copy(cGrass[0]).lerp(v > 0.5 ? cGrass[1] : cGrass[2], Math.abs(v - 0.5) * 2);
      const dirt = n(x * 0.012 + 9, z * 0.012 - 4);
      if (dirt > 0.25) col.lerp(cDirt, U.clamp((dirt - 0.25) * 2.5, 0, 0.7));
      // inclinação
      const hx = (this.H[j * n1 + Math.min(N, i + 1)] - this.H[j * n1 + Math.max(0, i - 1)]) / (2 * C);
      const hz = (this.H[Math.min(N, j + 1) * n1 + i] - this.H[Math.max(0, j - 1) * n1 + i]) / (2 * C);
      const sl = Math.hypot(hx, hz);
      if (sl > 0.55) col.lerp(cRock, U.clamp((sl - 0.55) * 3, 0, 1));
      if (h > 38) col.lerp(cSnow, U.clamp((h - 38) / 10, 0, 0.6));
      if (h < 2.6) col.lerp(cSand, U.clamp((2.6 - h) / 1.4, 0, 1));
      // locais
      for (const L of this.locations) {
        if (!L.r) continue;
        const d = L.square ? Math.max(Math.abs(x - L.x), Math.abs(z - L.z)) : Math.hypot(x - L.x, z - L.z);
        if (d < L.r + 6) {
          const t = U.smoothstep(L.r + 6, L.r - 6, d);
          tmp.copy(L.type === 'cidade' || L.type === 'porto' || L.type === 'posto' ? cTown : L.type === 'militar' || L.type === 'torre' ? cMil : cVillage);
          col.lerp(tmp, t * (L.type === 'fazenda' || L.type === 'acampamento' ? 0.5 : 0.85));
        }
      }
      // plantação da fazenda
      if (farm && x > farm.x + 6 && x < farm.x + 48 && z > farm.z - 46 && z < farm.z + 10) {
        col.copy(Math.floor((x - farm.x) / 4) % 2 ? cField1 : cField2);
      }
      const rd = this.roadD[k];
      if (rd < 7) col.lerp(cDirt, U.smoothstep(7, 3, rd) * 0.6);
      colors[k * 3] = col.r; colors[k * 3 + 1] = col.g; colors[k * 3 + 2] = col.b;
    }
    this.terrainMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
    this.terrain = new THREE.Group();
    for (let cj = 0; cj < N / CH; cj++) for (let ci = 0; ci < N / CH; ci++) {
      const pos = [], cols = [], idx = [];
      for (let j = 0; j <= CH; j++) for (let i = 0; i <= CH; i++) {
        const gi = ci * CH + i, gj = cj * CH + j, k = gj * n1 + gi;
        pos.push(-Hh + gi * C, this.H[k], -Hh + gj * C);
        cols.push(colors[k * 3], colors[k * 3 + 1], colors[k * 3 + 2]);
      }
      const w = CH + 1;
      for (let j = 0; j < CH; j++) for (let i = 0; i < CH; i++) {
        const a = j * w + i, b = a + 1, c = a + w, d = c + 1;
        idx.push(a, c, b, b, c, d);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
      g.setIndex(idx);
      g.computeVertexNormals();
      g.computeBoundingSphere();
      const m = new THREE.Mesh(g, this.terrainMat);
      m.receiveShadow = true;
      this.terrain.add(m);
    }
    this.scene.add(this.terrain);
  },

  buildWater() {
    const g = new THREE.PlaneGeometry(6000, 6000, 1, 1);
    g.rotateX(-Math.PI / 2);
    this.waterMat = new THREE.MeshLambertMaterial({ color: 0x2b6f8c, transparent: true, opacity: 0.84 });
    this.water = new THREE.Mesh(g, this.waterMat);
    this.water.position.y = this.WATER;
    this.water.renderOrder = 2;
    this.scene.add(this.water);
    // Fundo escuro distante para o horizonte do mar.
    const fl = new THREE.Mesh(new THREE.PlaneGeometry(6000, 6000).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x173f52 }));
    fl.position.y = -18;
    this.scene.add(fl);
  },

  buildRoadMeshes() {
    const gb = new GB();
    const cA = 0x3d3e42, cT = 0x86724e, cLine = 0xe8d27a;
    for (const r of this.roads) {
      if (r.kind === 'estande') continue;
      const S = r.S, half = r.w / 2;
      for (let i = 0; i < S.length - 1; i++) {
        const a = S[i], b = S[i + 1];
        const dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz) || 1;
        const nx = -dz / l * half, nz = dx / l * half;
        const y = (x, z) => this.height(x, z) + 0.07;
        const p1 = [a.x + nx, 0, a.z + nz], p2 = [a.x - nx, 0, a.z - nz], p3 = [b.x - nx, 0, b.z - nz], p4 = [b.x + nx, 0, b.z + nz];
        for (const p of [p1, p2, p3, p4]) p[1] = y(p[0], p[2]);
        gb.quad(p1, p4, p3, p2, r.kind === 'asfalto' ? cA : cT);
        if (r.kind === 'asfalto' && i % 3 === 0) {
          const lx = -dz / l * 0.12, lz = dx / l * 0.12;
          const q1 = [a.x + lx, 0, a.z + lz], q2 = [a.x - lx, 0, a.z - lz], q3 = [b.x - lx, 0, b.z - lz], q4 = [b.x + lx, 0, b.z + lz];
          for (const p of [q1, q2, q3, q4]) p[1] = y(p[0], p[2]) + 0.02;
          gb.quad(q1, q4, q3, q2, cLine);
        }
      }
    }
    const m = new THREE.Mesh(gb.build(), MAT.vcFlat);
    m.receiveShadow = true;
    this.scene.add(m);
  },

  // Geometria estática dos locais (mesclada por local).
  addLocGeo(id, geo) { (this.locGeo[id] || (this.locGeo[id] = [])).push(geo); },
  flushLocGeo() {
    for (const id in this.locGeo) {
      const gb = new GB();
      const I = new THREE.Matrix4();
      for (const g of this.locGeo[id]) gb.addGeo(g, I);
      if (gb.empty) continue;
      const m = new THREE.Mesh(gb.build(), MAT.vcDouble);
      m.castShadow = true; m.receiveShadow = true;
      this.scene.add(m);
    }
    this.locGeo = {};
  },

  // ---------------------------------------------------------------- Vegetação e rochas
  buildTrees() {
    const r = U.rng(this.SEED + 99), n = this.noise;
    const geos = {};
    let gb = new GB();
    gb.cyl(0.2, 2.2, 0, 1.1, 0, 0x5a3b22, 'y', 6);
    gb.cone(1.7, 2.6, 0, 2.7, 0, 0x2f5a2f); gb.cone(1.3, 2.2, 0, 4.0, 0, 0x34622f); gb.cone(0.85, 1.9, 0, 5.2, 0, 0x3a6a35);
    geos.pine = gb.build();
    gb = new GB();
    gb.cyl(0.24, 3.2, 0, 1.6, 0, 0x5f4128, 'y', 6);
    gb.sph(2.1, 0, 4.4, 0, 0x4d7d34, 0.85, true); gb.sph(1.5, 0.9, 3.7, 0.6, 0x5a8a3a, 0.8, true); gb.sph(1.3, -0.8, 4.0, -0.5, 0x45722f, 0.9, true);
    geos.broad = gb.build();
    gb = new GB();
    for (let i = 0; i < 6; i++) gb.box(0.28 - i * 0.02, 1.1, 0.28 - i * 0.02, i * 0.12, 0.55 + i * 1.05, 0, 0x8a6d47, 0, 0, -0.06 * i);
    for (let i = 0; i < 7; i++) { const a = (i / 7) * Math.PI * 2; gb.box(0.5, 0.06, 2.4, 0.7 + Math.cos(a) * 1.0, 6.2, Math.sin(a) * 1.0, 0x5f8a32, -0.35 * Math.cos(0), a + Math.PI / 2, 0.45); }
    gb.sph(0.18, 0.7, 6.0, 0.2, 0x6b4a2a); gb.sph(0.18, 0.55, 6.0, -0.15, 0x6b4a2a);
    geos.palm = gb.build();
    gb = new GB();
    gb.sph(0.9, 0, 0.5, 0, 0x4a7a32, 0.7, true); gb.sph(0.6, 0.6, 0.4, 0.3, 0x568a38, 0.7, true);
    geos.bush = gb.build();
    gb = new GB();
    gb.sph(1, 0, 0.3, 0, 0x7f7b72, 0.7, true);
    geos.rock = gb.build();

    const list = { pine: [], broad: [], palm: [], bush: [], rock: [] };
    const step = 7;
    for (let z = -this.HALF + 4; z < this.HALF - 4; z += step) for (let x = -this.HALF + 4; x < this.HALF - 4; x += step) {
      const px = x + (r() - 0.5) * step, pz = z + (r() - 0.5) * step;
      const h = this.height(px, pz);
      if (h < 0.6) continue;
      if (this.inAnyLoc(px, pz, 8)) continue;
      const k = this.idx(Math.round((px + this.HALF) / this.CELL), Math.round((pz + this.HALF) / this.CELL));
      if (this.roadD[k] < 9) continue;
      const forest = n.fbm(px * 0.006 + 200, pz * 0.006 - 80, 3);
      const sl = this.slope(px, pz);
      if (h < 3.2) { if (r() < 0.07) list.palm.push([px, h, pz]); continue; }
      if (sl > 1.2) { if (r() < 0.08) list.rock.push([px, h, pz]); continue; }
      const p = U.clamp(0.04 + (forest + 0.05) * 1.6, 0.02, 0.85);
      if (r() < p) list[h > 16 || forest > 0.2 ? (r() < 0.75 ? 'pine' : 'broad') : r() < 0.6 ? 'broad' : 'pine'].push([px, h, pz]);
      else if (r() < p * 0.6) list.bush.push([px + 2, this.height(px + 2, pz), pz]);
      else if (r() < 0.012) list.rock.push([px, h, pz]);
    }
    const mat = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), e = new THREE.Euler();
    const tint = new THREE.Color();
    this.treeMeshes = {};
    for (const type in list) {
      const L = list[type];
      if (!L.length) continue;
      const im = new THREE.InstancedMesh(geos[type], MAT.vcFlat, L.length);
      im.castShadow = type !== 'bush';
      im.receiveShadow = true;
      L.forEach((t, i) => {
        const sc = type === 'rock' ? 0.6 + r() * 1.6 : 0.8 + r() * 0.55;
        e.set(0, r() * Math.PI * 2, 0); q.setFromEuler(e);
        p.set(t[0], t[1] - (type === 'rock' ? 0.2 : 0.1), t[2]);
        s.set(sc, type === 'rock' ? sc * (0.6 + r() * 0.5) : sc, sc);
        mat.compose(p, q, s);
        im.setMatrixAt(i, mat);
        tint.setHSL(0, 0, 0.85 + r() * 0.3);
        im.setColorAt(i, tint);
        const tree = { type, i, x: t[0], y: t[1], z: t[2], sc, hp: type === 'rock' ? 400 : 120, mat: mat.clone() };
        if (type !== 'bush') {
          const rad = type === 'rock' ? sc * 0.85 : 0.28 * sc;
          tree.col = Phys.add({ x0: t[0] - rad, x1: t[0] + rad, z0: t[2] - rad, z1: t[2] + rad, y0: t[1] - 1, y1: t[1] + (type === 'rock' ? sc * 0.8 : 7 * sc), mat: type === 'rock' ? 'rock' : 'wood', tree });
        }
        this.trees.push(tree);
      });
      im.instanceMatrix.needsUpdate = true;
      this.treeMeshes[type] = im;
      this.scene.add(im);
    }
  },

  // Derruba uma árvore (machado) e retorna true se caiu.
  damageTree(tree, dmg) {
    if (tree.type === 'rock' || tree.dead) return false;
    tree.hp -= dmg;
    if (tree.hp > 0) return false;
    tree.dead = true;
    const im = this.treeMeshes[tree.type];
    const m = new THREE.Matrix4().makeScale(0.0001, 0.0001, 0.0001);
    im.setMatrixAt(tree.i, m); im.instanceMatrix.needsUpdate = true;
    if (tree.col) Phys.remove(tree.col);
    return true;
  },

  // ---------------------------------------------------------------- Céu e iluminação
  buildSky() {
    const s = this.scene;
    this.skyUni = { top: { value: new THREE.Color(0x4f8fd6) }, hor: { value: new THREE.Color(0xb9d6ee) }, bot: { value: new THREE.Color(0x6a8aa0) } };
    const skyMat = new THREE.ShaderMaterial({
      uniforms: this.skyUni, side: THREE.BackSide, depthWrite: false, fog: false,
      vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'uniform vec3 top; uniform vec3 hor; uniform vec3 bot; varying vec3 vP; void main(){ float h = vP.y; vec3 c = h > 0.0 ? mix(hor, top, pow(min(1.0,h*1.6), 0.7)) : mix(hor, bot, min(1.0,-h*4.0)); gl_FragColor = vec4(c,1.0); }',
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(1400, 24, 12), skyMat);
    this.sky.renderOrder = -10;
    this.sky.frustumCulled = false;
    s.add(this.sky);
    this.sunMesh = new THREE.Mesh(new THREE.CircleGeometry(38, 20), new THREE.MeshBasicMaterial({ color: 0xfff1c4, fog: false, transparent: true }));
    this.moonMesh = new THREE.Mesh(new THREE.CircleGeometry(26, 20), new THREE.MeshBasicMaterial({ color: 0xdfe6f0, fog: false, transparent: true }));
    s.add(this.sunMesh, this.moonMesh);
    const sp = [];
    const rr = U.rng(5);
    for (let i = 0; i < 900; i++) {
      const u = rr() * 2 - 1, a = rr() * Math.PI * 2, y = Math.abs(u);
      const rad = Math.sqrt(1 - y * y);
      sp.push(Math.cos(a) * rad * 1300, y * 1300, Math.sin(a) * rad * 1300);
    }
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
    this.stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false }));
    this.stars.frustumCulled = false;
    s.add(this.stars);
    // Nuvens.
    this.clouds = new THREE.Group();
    const cm = new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true, transparent: true, opacity: 0.92 });
    this.cloudMat = cm;
    for (let i = 0; i < 46; i++) {
      const g = new THREE.Group();
      const n = 3 + Math.floor(rr() * 4);
      for (let k = 0; k < n; k++) {
        const m = new THREE.Mesh(UNIT.sph0, cm);
        m.scale.set(18 + rr() * 22, 7 + rr() * 6, 14 + rr() * 16);
        m.position.set(k * 20 - n * 10, rr() * 5, (rr() - 0.5) * 14);
        g.add(m);
      }
      g.position.set((rr() - 0.5) * 1600, 170 + rr() * 70, (rr() - 0.5) * 1600);
      this.clouds.add(g);
    }
    s.add(this.clouds);
    // Luzes.
    this.hemi = new THREE.HemisphereLight(0xbcd8ff, 0x4a5a3a, 0.9);
    s.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xfff2dd, 2.2);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = -70; sc.right = 70; sc.top = 70; sc.bottom = -70; sc.near = 1; sc.far = 400;
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.04;
    s.add(this.sun, this.sun.target);
    s.fog = new THREE.Fog(0xb9d6ee, 80, 380);
  },

  // t: fração do dia (0 = meia-noite, 0.5 = meio-dia).
  updateSky(t, camPos, weather) {
    const ang = (t - 0.25) * Math.PI * 2;
    const elev = Math.sin(ang);
    const sunDir = new THREE.Vector3(Math.cos(ang) * 0.85, elev, 0.4).normalize();
    const day = U.smoothstep(-0.14, 0.22, elev);
    const dusk = U.clamp(1 - Math.abs(elev) / 0.3, 0, 1) * U.smoothstep(-0.3, 0.05, elev);
    const rain = weather.rain;
    const c = (h) => new THREE.Color(h);
    const top = c(0x08101e).lerp(c(0x4a86d0), day).lerp(c(0x5b6a9a), dusk * 0.5).lerp(c(0x6a7480), rain * 0.7 * day);
    const hor = c(0x141c2c).lerp(c(0xb7d3ec), day).lerp(c(0xf0975a), dusk * 0.75).lerp(c(0x8a929a), rain * 0.7 * day);
    this.skyUni.top.value.copy(top); this.skyUni.hor.value.copy(hor); this.skyUni.bot.value.copy(hor).multiplyScalar(0.6);
    this.scene.fog.color.copy(hor);
    const fogFar = U.lerp(150, 420, day) * (1 - rain * 0.45);
    this.scene.fog.near = fogFar * 0.2; this.scene.fog.far = fogFar;
    this.sky.position.copy(camPos); this.stars.position.copy(camPos);
    this.stars.material.opacity = U.clamp(1 - day * 1.6, 0, 1) * (1 - rain);
    this.sunMesh.position.copy(camPos).addScaledVector(sunDir, 1200); this.sunMesh.lookAt(camPos);
    this.sunMesh.material.color.set(0xfff1c4).lerp(c(0xff9a50), dusk);
    this.sunMesh.material.opacity = 1 - rain * 0.8;
    this.moonMesh.position.copy(camPos).addScaledVector(sunDir, -1200); this.moonMesh.lookAt(camPos);
    this.moonMesh.material.opacity = (1 - day) * (1 - rain * 0.8);
    // Sol ou lua como luz direcional.
    const sunUp = elev > -0.05;
    const ld = sunUp ? sunDir : sunDir.clone().negate();
    this.sun.position.copy(camPos).addScaledVector(ld, 160);
    this.sun.target.position.copy(camPos);
    if (sunUp) {
      this.sun.color.set(0xfff2dd).lerp(c(0xff9a5a), dusk);
      this.sun.intensity = 2.3 * U.smoothstep(-0.05, 0.25, elev) * (1 - rain * 0.6);
    } else {
      this.sun.color.set(0x9fb4e0);
      this.sun.intensity = 0.32 * U.smoothstep(-0.05, 0.3, -elev);
    }
    this.hemi.intensity = U.lerp(0.32, 1.05, day) * (1 - rain * 0.25);
    this.hemi.color.copy(c(0x5a6f9a).lerp(c(0xbcd8ff), day));
    this.hemi.groundColor.copy(c(0x1c2230).lerp(c(0x55603f), day));
    this.cloudMat.color.set(0x2a3040).lerp(c(0xffffff), day).lerp(c(0x8a8f96), rain);
    this.waterMat.color.set(0x0f2733).lerp(c(0x2b6f8c), day);
    return { day, elev, sunDir };
  },

  updateClouds(dt, wind) {
    for (const g of this.clouds.children) {
      g.position.x += dt * (2 + wind * 6);
      if (g.position.x > 800) g.position.x -= 1600;
    }
  },
};
