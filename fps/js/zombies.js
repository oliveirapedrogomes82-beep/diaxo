'use strict';
// Zumbis (IA com percepção por visão e audição, A* em grade, ataques) e animais selvagens.

const ZTYPES = {
  comum: { name: 'Zumbi', hp: 100, walk: 1.1, run: 4.3, dmg: 12, rate: 1.1, scale: 1, pitch: 1, loot: 'zumbi', drop: 0.35, xp: 1 },
  corredor: { name: 'Corredor', hp: 75, walk: 1.4, run: 6.4, dmg: 9, rate: 0.8, scale: 0.95, pitch: 1.3, loot: 'zumbi', drop: 0.3, xp: 1 },
  rastejante: { name: 'Rastejante', hp: 70, walk: 0.7, run: 2.5, dmg: 10, rate: 1.0, scale: 1, pitch: 0.85, crawl: true, loot: 'zumbi', drop: 0.25, xp: 1 },
  brutamonte: { name: 'Brutamonte', hp: 650, walk: 1.0, run: 3.7, dmg: 32, rate: 1.6, scale: 1.55, pitch: 0.55, knock: true, loot: 'zumbi_mil', drop: 0.9, xp: 5 },
  militar: { name: 'Zumbi militar', hp: 180, walk: 1.1, run: 4.6, dmg: 15, rate: 1.0, scale: 1, pitch: 0.9, helmet: true, loot: 'zumbi_mil', drop: 0.6, xp: 2 },
};

// Caixas de acerto em coordenadas do modelo (centro, meia-extensão).
const ZHIT = {
  stand: [['head', 0, 1.66, -0.02, 0.17, 0.17, 0.17], ['body', 0, 1.2, 0, 0.27, 0.33, 0.17], ['limb', 0, 0.45, 0, 0.24, 0.46, 0.13], ['limb', 0, 1.43, -0.33, 0.42, 0.1, 0.33]],
  crawl: [['head', 0, 0.4, -0.8, 0.17, 0.17, 0.17], ['body', 0, 0.3, -0.3, 0.27, 0.16, 0.34], ['limb', 0, 0.2, 0.45, 0.22, 0.13, 0.46]],
};

// Navegação: A* numa grade de 0,5 m com ocupação calculada sob demanda.
const Nav = {
  cache: new Map(),
  C: 0.5,
  cellBlocked(ix, iz, yRef) {
    const band = Math.round(yRef * 2);
    const key = (ix * 73856093) ^ (iz * 19349663) ^ (band * 83492791);
    const c = this.cache.get(key);
    if (c !== undefined) return c;
    const yb = band / 2;
    const cx = (ix + 0.5) * this.C, cz = (iz + 0.5) * this.C;
    const s = Phys.support(cx, cz, 0.2, yb + 0.5);
    let b = s < World.WATER - 1.1 || s < yb - 2.6;
    if (!b) {
      const list = Phys.query(cx - 0.24, cz - 0.24, cx + 0.24, cz + 0.24, Phys._tmp2);
      for (const col of list) {
        if (col.ghost || col.door || col.vehicle) continue;
        if (col.y1 > s + 0.45 && col.y0 < s + 1.6) { b = true; break; }
      }
    }
    if (this.cache.size > 400000) this.cache.clear();
    this.cache.set(key, b);
    return b;
  },
  find(from, to, maxIter = 2500) {
    const C = this.C;
    const R = 100;
    const sx = Math.floor(from.x / C), sz = Math.floor(from.z / C);
    let tx = Math.floor(to.x / C), tz = Math.floor(to.z / C);
    // alvo distante: mira um ponto intermediário na borda da janela de busca
    const far = Math.max(Math.abs(tx - sx), Math.abs(tz - sz));
    if (far > R - 6) { const k = (R - 6) / far; tx = sx + Math.round((tx - sx) * k); tz = sz + Math.round((tz - sz) * k); }
    const yRef = from.y;
    const W = R * 2 + 1;
    const K = (x, z) => (x - sx + R) * W + (z - sz + R);
    const g = new Map(), came = new Map(), closed = new Set();
    // heap binário de [f, x, z]
    const heap = [];
    const push = (n) => { heap.push(n); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
    const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = i * 2 + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
    const H = (x, z) => { const dx = Math.abs(x - tx), dz = Math.abs(z - tz); return Math.max(dx, dz) + 0.41 * Math.min(dx, dz); };
    g.set(K(sx, sz), 0);
    push([H(sx, sz), sx, sz]);
    let it = 0, found = false, best = null, bestH = Infinity;
    while (heap.length && it++ < maxIter) {
      const [, x, z] = pop();
      const k = K(x, z);
      if (closed.has(k)) continue;
      closed.add(k);
      const h = H(x, z);
      if (h < bestH) { bestH = h; best = [x, z]; }
      if (x === tx && z === tz) { found = true; best = [x, z]; break; }
      const gc = g.get(k);
      for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
        if (!dx && !dz) continue;
        const nx = x + dx, nz = z + dz;
        if (Math.abs(nx - sx) >= R || Math.abs(nz - sz) >= R) continue;
        if (this.cellBlocked(nx, nz, yRef)) continue;
        if (dx && dz && (this.cellBlocked(x + dx, z, yRef) || this.cellBlocked(x, z + dz, yRef))) continue;
        const nk = K(nx, nz);
        const ng = gc + (dx && dz ? 1.41 : 1);
        if (g.has(nk) && g.get(nk) <= ng) continue;
        g.set(nk, ng); came.set(nk, k);
        push([ng + H(nx, nz) * 1.1, nx, nz]);
      }
    }
    if (!best || (!found && bestH > H(sx, sz) - 4)) return null;
    // reconstrói (até o melhor nó alcançado, se o alvo não foi encontrado)
    const path = [];
    let k = K(best[0], best[1]);
    while (k !== undefined) {
      const x = Math.floor(k / W) - R + sx, z = (k % W) - R + sz;
      path.push({ x: (x + 0.5) * C, z: (z + 0.5) * C });
      k = came.get(k);
    }
    path.reverse();
    // simplifica: mantém só os pontos onde a direção muda
    const out = [path[0]];
    for (let i = 1; i < path.length - 1; i++) {
      const a = path[i - 1], b = path[i], d = path[i + 1];
      if (Math.sign(b.x - a.x) !== Math.sign(d.x - b.x) || Math.sign(b.z - a.z) !== Math.sign(d.z - b.z)) out.push(b);
    }
    if (path.length > 1) out.push(path[path.length - 1]);
    return out;
  },
};

const Zombies = {
  list: [],
  scene: null,
  manageT: 0,
  pathBudget: 0,

  init(scene) { this.scene = scene; },
  clear() { for (const z of this.list) this.scene.remove(z.m.root); this.list = []; },
  alive() { let n = 0; for (const z of this.list) if (!z.dead) n++; return n; },

  spawn(type, x, z, y = null) {
    const t = ZTYPES[type];
    const m = Models.zombie(type);
    m.root.scale.setScalar(t.scale);
    const py = y ?? Phys.support(x, z, 0.3, 500);
    const zb = {
      type, t, m, hp: t.hp, maxHp: t.hp,
      b: { p: new THREE.Vector3(x, py, z), v: new THREE.Vector3(), r: 0.25 * t.scale, h: (t.crawl ? 0.7 : 1.8) * t.scale, step: 0.45, onGround: true },
      yaw: Math.random() * Math.PI * 2, state: 'idle', home: { x, z }, wp: null, wpT: 0,
      think: Math.random() * 0.3, phase: Math.random() * 10, atkT: 0, swing: 0, path: null, pathT: 0, pathI: 0,
      lastSeen: null, lostT: 0, groanT: 2 + Math.random() * 8, dead: false, deadT: 0, stagger: 0, bash: 0, stuckT: 0, lastP: new THREE.Vector3(x, py, z),
      speedNow: 0, sideT: 0, side: 1,
    };
    if (t.crawl) {
      m.hips.position.y = 0.26; m.torso.rotation.x = -1.35; m.head.rotation.x = 1.25;
      m.armL.rotation.x = 3.0; m.armR.rotation.x = 3.0; m.legL.rotation.x = -1.5; m.legR.rotation.x = -1.5;
    }
    m.root.position.copy(zb.b.p);
    this.scene.add(m.root);
    this.list.push(zb);
    return zb;
  },
  remove(z) {
    const i = this.list.indexOf(z);
    if (i >= 0) this.list.splice(i, 1);
    this.scene.remove(z.m.root);
  },

  // Raio contra as caixas de acerto de todos os zumbis.
  raycast(o, dir, len) {
    let best = null;
    const lo = new THREE.Vector3(), ld = new THREE.Vector3();
    for (const z of this.list) {
      if (z.dead) continue;
      const p = z.b.p, s = z.t.scale;
      // descarte rápido por esfera
      const cx = p.x - o.x, cy = p.y + 1 * s - o.y, cz = p.z - o.z;
      const tc = cx * dir.x + cy * dir.y + cz * dir.z;
      if (tc < -2 * s || tc > len + 2 * s) continue;
      const d2 = cx * cx + cy * cy + cz * cz - tc * tc;
      if (d2 > 2.2 * s * s) continue;
      const c = Math.cos(-z.yaw), sn = Math.sin(-z.yaw);
      const rx = o.x - p.x, ry = o.y - p.y, rz = o.z - p.z;
      lo.set((rx * c + rz * sn) / s, ry / s, (-rx * sn + rz * c) / s);
      ld.set((dir.x * c + dir.z * sn) / s, dir.y / s, (-dir.x * sn + dir.z * c) / s);
      for (const hb of ZHIT[z.t.crawl ? 'crawl' : 'stand']) {
        const box = { x0: hb[1] - hb[4], x1: hb[1] + hb[4], y0: hb[2] - hb[5], y1: hb[2] + hb[5], z0: hb[3] - hb[6], z1: hb[3] + hb[6] };
        const h = Phys.rayBox(lo.x, lo.y, lo.z, ld.x, ld.y, ld.z, box, best ? best.t : len);
        if (h && h.t > 0 && (!best || h.t < best.t || (h.t - best.t < 0.05 && hb[0] === 'head'))) best = { t: h.t, zombie: z, part: hb[0] };
      }
    }
    if (best) best.point = o.clone().addScaledVector(dir, best.t);
    return best;
  },

  damage(z, dmg, part, dir, owner, w, explosive) {
    if (z.dead) return;
    let mul = part === 'head' ? 3.3 : part === 'limb' ? 0.75 : 1;
    if (z.t.helmet && part === 'head' && (!w || !w.cal || CALIBERS[w.cal].dmg < 50) && w && w.cls !== 'melee') mul = 1.7;
    const d = dmg * mul;
    z.hp -= d;
    z.stagger = Math.min(0.35, z.stagger + d / 300);
    if (dir && explosive) { z.b.v.x += dir.x * 6; z.b.v.z += dir.z * 6; }
    if (z.state !== 'chase' && owner === 'player') { z.state = 'chase'; z.lostT = 0; }
    const killed = z.hp <= 0;
    if (owner === 'player') Game.onHit(part === 'head', killed);
    if (killed) this.die(z, part === 'head', owner);
    else if (Math.random() < 0.3) Sfx.zombie(z.b.p, z.t.pitch, 'attack');
  },

  die(z, head, owner) {
    z.dead = true; z.deadT = 0;
    z.fallDir = Math.random() < 0.5 ? 1 : -1;
    Sfx.zombie(z.b.p, z.t.pitch, 'die');
    if (Math.random() < z.t.drop) for (const st of rollLoot(z.t.loot)) Items.drop(st, z.b.p, 0.8);
    if (Math.random() < 0.25) Items.drop({ id: 'pano', n: U.randi(1, 2) }, z.b.p, 0.8);
    if (owner === 'player') Game.onKill(z, head);
  },

  // Alerta zumbis num raio (tiros, explosões, buzina).
  hear(pos, radius) {
    for (const z of this.list) {
      if (z.dead || z.state === 'chase') continue;
      const d = Math.hypot(z.b.p.x - pos.x, z.b.p.z - pos.z);
      if (d > radius) continue;
      z.state = 'investigate';
      const j = d * 0.15;
      z.ip = { x: pos.x + (Math.random() - 0.5) * j, y: pos.y, z: pos.z + (Math.random() - 0.5) * j };
      z.path = null; z.pathT = 0;
      if (d < radius * 0.35 && Math.random() < 0.5) { z.state = 'chase'; z.lostT = 0; }
    }
  },

  update(dt) {
    this.pathBudget = 3;
    const P = Player;
    const tgt = P.targetPos();
    const night = Game.night;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const z = this.list[i];
      if (z.dead) { this.animDead(z, dt); if (z.deadT > 30) this.remove(z); continue; }
      this.think(z, dt, tgt, night);
      this.move(z, dt, tgt, night);
      this.animate(z, dt);
    }
    // separação simples
    const L = this.list;
    for (let i = 0; i < L.length; i++) {
      const a = L[i]; if (a.dead) continue;
      for (let j = i + 1; j < L.length; j++) {
        const b = L[j]; if (b.dead) continue;
        const dx = b.b.p.x - a.b.p.x, dz = b.b.p.z - a.b.p.z, d2 = dx * dx + dz * dz;
        const rr = (a.b.r + b.b.r) * 1.1;
        if (d2 < rr * rr && d2 > 1e-6 && Math.abs(a.b.p.y - b.b.p.y) < 1.5) {
          const d = Math.sqrt(d2), push = (rr - d) * 0.5;
          a.b.p.x -= dx / d * push; a.b.p.z -= dz / d * push;
          b.b.p.x += dx / d * push; b.b.p.z += dz / d * push;
        }
      }
    }
  },

  think(z, dt, tgt, night) {
    z.think -= dt;
    z.groanT -= dt;
    if (z.groanT <= 0) { z.groanT = 4 + Math.random() * 9; const d = z.b.p.distanceTo(tgt); if (d < 45) Sfx.zombie(z.b.p, z.t.pitch, 'groan'); }
    if (z.think > 0) return;
    z.think = 0.25 + Math.random() * 0.15;
    const P = Player;
    if (P.dead) { if (z.state === 'chase') z.state = 'idle'; return; }
    if (z.hunter && z.state !== 'chase') { z.state = 'investigate'; z.ip = { x: tgt.x, y: tgt.y, z: tgt.z }; }
    const dx = tgt.x - z.b.p.x, dz = tgt.z - z.b.p.z, dist = Math.hypot(dx, dz);
    let sight = U.lerp(34, 13, night);
    if (P.flashOn) sight += 22 * night;
    if (P.vehicle) sight = 50;
    else if (P.stance === 'crouch') sight *= 0.6;
    else if (P.stance === 'prone') sight *= 0.4;
    let sees = false;
    if (dist < sight && Math.abs(tgt.y - z.b.p.y) < 12) {
      const fx = -Math.sin(z.yaw), fz = -Math.cos(z.yaw);
      const dot = (dx * fx + dz * fz) / Math.max(0.01, dist);
      if (dot > -0.25 || dist < 4.5) {
        const eye = new THREE.Vector3(z.b.p.x, z.b.p.y + z.b.h * 0.9, z.b.p.z);
        sees = Phys.los(eye, P.vehicle ? tgt.clone().setY(tgt.y + 1) : P.eye());
      }
    }
    if (sees) {
      if (z.state !== 'chase') { z.state = 'chase'; Sfx.zombie(z.b.p, z.t.pitch, 'attack'); z.path = null; }
      z.lastSeen = { x: tgt.x, y: tgt.y, z: tgt.z }; z.lostT = 0;
    } else if (z.state === 'chase') {
      z.lostT += 0.3;
      if (z.lostT > 7 || dist > 90) { z.state = 'investigate'; z.ip = z.lastSeen || { x: tgt.x, y: tgt.y, z: tgt.z }; }
    }
  },

  move(z, dt, tgt, night) {
    const t = z.t, b = z.b;
    let goal = null, speed = 0;
    z.atkT -= dt;
    z.stagger = Math.max(0, z.stagger - dt);
    const nightMul = 1 + night * 0.15;
    if (z.state === 'idle') {
      z.wpT -= dt;
      if (!z.wp || z.wpT <= 0) {
        z.wpT = 4 + Math.random() * 8;
        z.wp = Math.random() < 0.4 ? null : { x: z.home.x + (Math.random() - 0.5) * 16, z: z.home.z + (Math.random() - 0.5) * 16 };
      }
      if (z.wp) { goal = z.wp; speed = t.walk; if (Math.hypot(goal.x - b.p.x, goal.z - b.p.z) < 0.8) z.wp = null; }
    } else if (z.state === 'investigate') {
      goal = z.ip; speed = t.walk * 2.2;
      if (!goal || Math.hypot(goal.x - b.p.x, goal.z - b.p.z) < 1.5) { z.state = 'search'; z.wpT = 4; z.home = { x: b.p.x, z: b.p.z }; }
    } else if (z.state === 'search') {
      z.wpT -= dt; z.yaw += dt * 1.2;
      if (z.wpT <= 0) z.state = 'idle';
    } else if (z.state === 'chase') {
      goal = tgt; speed = t.run * nightMul;
      const dist = Math.hypot(tgt.x - b.p.x, tgt.z - b.p.z);
      const reach = (Player.vehicle ? 2.6 : 1.35) * t.scale;
      if (dist < reach && Math.abs(tgt.y - b.p.y) < 1.7 * t.scale) {
        speed = 0;
        if (z.atkT <= 0 && z.swing <= 0) { z.swing = 0.45; Sfx.zombie(b.p, t.pitch, 'attack'); }
      }
    }
    // golpe
    if (z.swing > 0) {
      z.swing -= dt;
      speed = 0;
      if (z.swing <= 0) {
        z.atkT = t.rate;
        const dist = Math.hypot(tgt.x - b.p.x, tgt.z - b.p.z);
        if (dist < 1.9 * t.scale + (Player.vehicle ? 1.2 : 0) && Math.abs(tgt.y - b.p.y) < 2 * t.scale) {
          if (Player.vehicle) Vehicles.damage(Player.vehicle, t.dmg * 1.5);
          else Player.zombieHit(z, t.dmg * (1 + Game.night * 0.25) * (Game.mode === 'hordas' ? 1 + Game.wave * 0.03 : 1));
        }
      }
    }
    if (z.stagger > 0) speed *= 0.3;
    // direção (com A* quando há parede no caminho)
    let mx = 0, mz = 0;
    if (goal && speed > 0) {
      let aim = goal;
      if (z.state === 'chase' || z.state === 'investigate') {
        z.pathT -= dt;
        if (z.pathT <= 0) {
          z.pathT = 1.0 + Math.random() * 0.5;
          const from = new THREE.Vector3(b.p.x, b.p.y + 0.5, b.p.z), to = new THREE.Vector3(goal.x, (goal.y ?? b.p.y) + 0.5, goal.z);
          const d = from.distanceTo(to);
          if (d > 2 && d < 160 && (z.forcePath || !Phys.los(from, to)) && this.pathBudget > 0) {
            z.forcePath = false;
            this.pathBudget--;
            z.path = Nav.find(b.p, goal); z.pathI = 1;
          } else if (Phys.los(from, to)) z.path = null;
        }
        if (z.path && z.pathI < z.path.length) {
          aim = z.path[z.pathI];
          if (Math.hypot(aim.x - b.p.x, aim.z - b.p.z) < 0.45) z.pathI++;
        }
      }
      const dx = aim.x - b.p.x, dz = aim.z - b.p.z, d = Math.hypot(dx, dz);
      if (d > 0.05) {
        mx = dx / d; mz = dz / d;
        // contorna quando preso
        if (z.sideT > 0 && !(z.path && z.pathI < z.path.length)) { z.sideT -= dt; const sx = -mz * z.side, sz = mx * z.side; mx = mx * 0.3 + sx; mz = mz * 0.3 + sz; const l = Math.hypot(mx, mz); mx /= l; mz /= l; }
        const want = Math.atan2(-mx, -mz);
        z.yaw += U.angDiff(z.yaw, want) * Math.min(1, dt * 8);
      }
    } else if (z.state === 'chase') {
      const want = Math.atan2(-(tgt.x - b.p.x), -(tgt.z - b.p.z));
      z.yaw += U.angDiff(z.yaw, want) * Math.min(1, dt * 10);
    }
    // física
    const accel = b.onGround ? 10 : 2;
    b.v.x += (mx * speed - b.v.x) * Math.min(1, accel * dt);
    b.v.z += (mz * speed - b.v.z) * Math.min(1, accel * dt);
    b.v.y -= 20 * dt;
    if (b.p.y < World.WATER - 1.0) { b.v.y = Math.max(b.v.y, -1); b.v.x *= 0.96; b.v.z *= 0.96; }
    Phys.move(b, b.v.x * dt, b.v.y * dt, b.v.z * dt);
    if (b.onGround) Phys.snapDown(b, 0.3);
    z.speedNow = Math.hypot(b.v.x, b.v.z);
    // portas: força até abrir
    if (b.hitDoor && !b.hitDoor.open && speed > 0) {
      z.bash += dt;
      if (z.bash > 1.6) { z.bash = 0; Game.toggleDoor(b.hitDoor, true); Sfx.melee(b.p); }
    } else if (b.hitWall && speed > 0) {
      z.stuckT += dt;
      if (z.stuckT > 0.8) { z.stuckT = 0; z.sideT = 0.6; z.side = Math.random() < 0.5 ? 1 : -1; z.pathT = 0; z.forcePath = true; }
    } else z.stuckT = Math.max(0, z.stuckT - dt);
    z.m.root.position.copy(b.p);
    z.m.root.rotation.y = z.yaw;
  },

  animate(z, dt) {
    const m = z.m, sp = z.speedNow;
    z.phase += dt * (1.5 + sp * 2.2);
    const a = Math.min(0.9, 0.15 + sp * 0.15);
    if (z.t.crawl) {
      m.armL.rotation.x = 3.0 + Math.sin(z.phase) * 0.5;
      m.armR.rotation.x = 3.0 - Math.sin(z.phase) * 0.5;
      m.legL.rotation.z = Math.sin(z.phase) * 0.15;
      return;
    }
    m.legL.rotation.x = Math.sin(z.phase) * a;
    m.legR.rotation.x = -Math.sin(z.phase) * a;
    m.torso.rotation.x = -0.12 - sp * 0.03 + z.stagger * 0.8;
    m.head.rotation.z = Math.sin(z.phase * 0.5) * 0.18;
    m.hips.position.y = 0.88 + Math.abs(Math.sin(z.phase)) * 0.04;
    let arm = 1.4 + Math.sin(z.phase * 0.5) * 0.12;
    if (z.swing > 0) { const k = 1 - z.swing / 0.45; arm = 1.4 + Math.sin(k * Math.PI) * 0.9 - k * 0.6; }
    m.armL.rotation.x = arm + Math.sin(z.phase) * 0.08;
    m.armR.rotation.x = arm - Math.sin(z.phase) * 0.08;
  },

  animDead(z, dt) {
    z.deadT += dt;
    const k = Math.min(1, z.deadT / 0.6);
    const r = z.m.root;
    if (!z.t.crawl) r.rotation.x = z.fallDir * (Math.PI / 2) * (k * k);
    if (z.deadT > 25) r.position.y -= dt * 0.4;
  },

  // Mantém a população perto do jogador (modo sobrevivência).
  manage(dt) {
    this.manageT -= dt;
    if (this.manageT > 0) return;
    this.manageT = 1.2;
    const pp = Player.body.p;
    for (const z of this.list.slice()) {
      const d = Math.hypot(z.b.p.x - pp.x, z.b.p.z - pp.z);
      if (d > 230 && !(z.state === 'chase' && d < 300)) this.remove(z);
    }
    const night = Game.night;
    let quota = 4 + Math.round(night * 4);
    const near = [];
    for (const l of World.locations) {
      if (!l.zombies) continue;
      const d = Math.hypot(l.x - pp.x, l.z - pp.z) - (l.r || 0);
      if (d < 170) { quota += Math.round(l.zombies * (1 + night * 0.5)); near.push(l); }
    }
    quota = Math.min(quota, 48);
    if (this.alive() >= quota) return;
    for (let k = 0; k < 2; k++) {
      let x, z, type = 'comum';
      const useLoc = near.length && Math.random() < 0.85;
      if (useLoc) {
        const l = U.pick(near);
        const ang = Math.random() * Math.PI * 2, rr = Math.sqrt(Math.random()) * l.r * 0.95;
        x = l.x + Math.cos(ang) * rr; z = l.z + Math.sin(ang) * rr;
        type = this.pickType(l.type, night);
      } else {
        const ang = Math.random() * Math.PI * 2, rr = 70 + Math.random() * 70;
        x = pp.x + Math.cos(ang) * rr; z = pp.z + Math.sin(ang) * rr;
        type = this.pickType('wild', night);
      }
      const d = Math.hypot(x - pp.x, z - pp.z);
      if (d < 45 || d > 200) continue;
      if (Math.abs(x) > World.HALF - 10 || Math.abs(z) > World.HALF - 10) continue;
      const y = Phys.support(x, z, 0.3, 200);
      if (y < World.WATER + 0.3) continue;
      if (Phys.blocked(x - 0.3, y + 0.2, z - 0.3, x + 0.3, y + 1.8, z + 0.3)) continue;
      this.spawn(type, x, z, y);
    }
  },
  pickType(locType, night) {
    const r = Math.random();
    if (locType === 'militar' || locType === 'torre') return r < 0.65 ? 'militar' : r < 0.8 ? 'corredor' : r < 0.85 + night * 0.05 ? 'brutamonte' : 'comum';
    if (r < 0.04 + night * 0.05) return 'brutamonte';
    if (r < 0.28 + night * 0.12) return 'corredor';
    if (r < 0.38 + night * 0.12) return 'rastejante';
    return 'comum';
  },
};

// ---------------------------------------------------------------- Animais
const ATYPES = {
  capivara: { name: 'Capivara', hp: 60, walk: 1.0, run: 5.0, meat: [1, 2], hit: [0, 0.5, -0.1, 0.28, 0.28, 0.68] },
  veado: { name: 'Veado', hp: 80, walk: 1.4, run: 9.0, meat: [2, 4], hit: [0, 1.15, -0.2, 0.2, 0.5, 0.75] },
};
const Animals = {
  list: [], scene: null, manageT: 0,
  init(scene) { this.scene = scene; },
  clear() { for (const a of this.list) this.scene.remove(a.m.root); this.list = []; },
  spawn(type, x, z) {
    const t = ATYPES[type];
    const m = Models.animal(type);
    const y = Phys.support(x, z, 0.3, 300);
    const a = { type, t, m, hp: t.hp, p: new THREE.Vector3(x, y, z), b: null, yaw: Math.random() * 6.28, state: 'wander', timer: 0, dead: false, deadT: 0, phase: 0, speed: 0 };
    a.b = { p: a.p, v: new THREE.Vector3(), r: 0.35, h: 1.0, step: 0.4, onGround: true };
    m.root.position.copy(a.p);
    this.scene.add(m.root);
    this.list.push(a);
    return a;
  },
  raycast(o, dir, len) {
    let best = null;
    for (const a of this.list) {
      if (a.dead) continue;
      const p = a.p;
      if (Math.abs(p.x - o.x) > len + 3 && Math.abs(p.z - o.z) > len + 3) continue;
      const c = Math.cos(-a.yaw), s = Math.sin(-a.yaw);
      const rx = o.x - p.x, ry = o.y - p.y, rz = o.z - p.z;
      const lx = rx * c + rz * s, lz = -rx * s + rz * c, dx = dir.x * c + dir.z * s, dz = -dir.x * s + dir.z * c;
      const hb = a.t.hit;
      const h = Phys.rayBox(lx, ry, lz, dx, dir.y, dz, { x0: hb[0] - hb[3], x1: hb[0] + hb[3], y0: hb[1] - hb[4], y1: hb[1] + hb[4], z0: hb[2] - hb[5], z1: hb[2] + hb[5] }, best ? best.t : len);
      if (h && h.t > 0) best = { t: h.t, animal: a, part: lz + dz * h.t < hb[2] - hb[5] * 0.6 ? 'head' : 'body' };
    }
    if (best) best.point = o.clone().addScaledVector(dir, best.t);
    return best;
  },
  damage(a, dmg) {
    if (a.dead) return;
    a.hp -= dmg;
    a.state = 'flee'; a.timer = 8;
    Game.onHit(false, a.hp <= 0);
    if (a.hp <= 0) {
      a.dead = true;
      const n = U.randi(a.t.meat[0], a.t.meat[1]);
      Items.drop({ id: 'carnecrua', n }, a.p, 0.5);
      Game.stats.animals++;
      UI.note(a.t.name + ' abatido(a): ' + n + '× carne crua', 'ok');
    }
  },
  scare(pos, r) {
    for (const a of this.list) if (!a.dead && a.p.distanceTo(pos) < r) { a.state = 'flee'; a.timer = 8; }
  },
  update(dt) {
    const pp = Player.body.p;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const a = this.list[i];
      if (a.dead) {
        a.deadT += dt;
        a.m.root.rotation.z = Math.min(Math.PI / 2, a.deadT * 4);
        if (a.deadT > 40) { this.scene.remove(a.m.root); this.list.splice(i, 1); }
        continue;
      }
      const dPlayer = Math.hypot(pp.x - a.p.x, pp.z - a.p.z);
      if (dPlayer < (Player.stance === 'stand' ? 16 : 7) && !Player.dead) { a.state = 'flee'; a.timer = 5; }
      a.timer -= dt;
      let tx = 0, tz = 0, sp = 0;
      if (a.state === 'flee') {
        sp = a.t.run;
        tx = a.p.x - pp.x; tz = a.p.z - pp.z;
        if (a.timer <= 0) a.state = 'wander';
      } else {
        if (a.timer <= 0) { a.timer = 3 + Math.random() * 6; a.goal = Math.random() < 0.5 ? null : { x: a.p.x + (Math.random() - 0.5) * 20, z: a.p.z + (Math.random() - 0.5) * 20 }; }
        if (a.goal) { tx = a.goal.x - a.p.x; tz = a.goal.z - a.p.z; sp = a.t.walk; if (Math.hypot(tx, tz) < 1) a.goal = null; }
      }
      const l = Math.hypot(tx, tz);
      if (l > 0.01 && sp > 0) {
        const want = Math.atan2(-tx, -tz);
        a.yaw += U.angDiff(a.yaw, want) * Math.min(1, dt * 4);
      } else sp = 0;
      const fx = -Math.sin(a.yaw), fz = -Math.cos(a.yaw);
      a.b.v.x += (fx * sp - a.b.v.x) * Math.min(1, dt * 5);
      a.b.v.z += (fz * sp - a.b.v.z) * Math.min(1, dt * 5);
      a.b.v.y -= 20 * dt;
      // evita água funda
      const ahead = World.height(a.p.x + fx * 3, a.p.z + fz * 3);
      if (ahead < World.WATER + 0.2) { a.yaw += 2.5; a.b.v.x *= -0.5; a.b.v.z *= -0.5; }
      Phys.move(a.b, a.b.v.x * dt, a.b.v.y * dt, a.b.v.z * dt);
      if (a.b.hitWall) a.yaw += (Math.random() - 0.5) * 3;
      a.speed = Math.hypot(a.b.v.x, a.b.v.z);
      a.phase += dt * a.speed * 3;
      a.m.legs.forEach((lg, k) => { lg.rotation.x = Math.sin(a.phase + (k % 2 ? Math.PI : 0) + (k > 1 ? 1 : 0)) * Math.min(0.7, a.speed * 0.12); });
      a.m.root.position.copy(a.p);
      a.m.root.rotation.y = a.yaw;
      if (dPlayer > 260) { this.scene.remove(a.m.root); this.list.splice(i, 1); }
    }
  },
  manage(dt) {
    this.manageT -= dt;
    if (this.manageT > 0) return;
    this.manageT = 4;
    const alive = this.list.filter((a) => !a.dead).length;
    if (alive >= 9) return;
    const pp = Player.body.p;
    const ang = Math.random() * Math.PI * 2, rr = 80 + Math.random() * 90;
    const x = pp.x + Math.cos(ang) * rr, z = pp.z + Math.sin(ang) * rr;
    if (Math.abs(x) > World.HALF - 20 || Math.abs(z) > World.HALF - 20) return;
    const h = World.height(x, z);
    if (h < 1.5 || World.inAnyLoc(x, z, 15)) return;
    this.spawn(h < 6 || Math.random() < 0.45 ? 'capivara' : 'veado', x, z);
  },
};
