'use strict';
// Itens no chão, efeitos visuais, projéteis (balística), explosões e ruídos que atraem zumbis.

// ---------------------------------------------------------------- Itens no chão
const Items = {
  list: [],
  group: null,
  respawnT: 0,

  init(scene) {
    this.group = new THREE.Group();
    scene.add(this.group);
  },
  clear() {
    for (const it of this.list) { this.group.remove(it.obj); if (it.point) it.point.item = null; }
    this.list = [];
  },

  makeObj(st) {
    const d = itemDef(st.id);
    let obj;
    if (d.type === 'weapon' && d.cls !== 'melee' && !d.stack) {
      obj = Models.weaponGroup(st, { mat: MAT.gun }).group;
      obj.rotation.set(0, 0, Math.PI / 2);
      const o = new THREE.Group(); o.add(obj); obj = o;
    } else if (d.type === 'weapon') {
      const mdl = Models.weapon(st.id);
      const m = new THREE.Mesh(mdl.body, MAT.gun);
      m.rotation.set(Math.PI / 2, 0, 0);
      obj = new THREE.Group(); obj.add(m);
    } else {
      obj = new THREE.Group();
      obj.add(new THREE.Mesh(Models.item(st.id), d.type === 'attach' ? MAT.gun : MAT.vcFlat));
    }
    obj.rotation.y = Math.random() * Math.PI * 2;
    obj.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(obj);
    obj.userData.lift = -box.min.y + 0.004;
    obj.traverse((o) => { if (o.isMesh) o.castShadow = false; });
    return obj;
  },

  spawn(st, x, y, z, point = null) {
    const obj = this.makeObj(st);
    obj.position.set(x, y + obj.userData.lift, z);
    this.group.add(obj);
    const it = { st, obj, x, y, z, point, age: 0 };
    this.list.push(it);
    if (point) point.item = it;
    return it;
  },
  remove(it) {
    const i = this.list.indexOf(it);
    if (i >= 0) this.list.splice(i, 1);
    this.group.remove(it.obj);
    if (it.point) it.point.item = null;
  },
  // Solta um item perto de uma posição, apoiado na superfície.
  drop(st, pos, spread = 0.6) {
    const a = Math.random() * Math.PI * 2, r = Math.random() * spread;
    const x = pos.x + Math.cos(a) * r, z = pos.z + Math.sin(a) * r;
    const y = Math.max(Phys.support(x, z, 0.05, pos.y + 0.6), World.WATER - 0.6);
    return this.spawn(st, x, y, z);
  },

  // Gera o loot inicial nos pontos de saque.
  populate(fraction = 0.6) {
    for (const p of World.lootPoints) if (!p.item && Math.random() < fraction) this.fillPoint(p);
  },
  fillPoint(p) {
    const stacks = rollLoot(p.table);
    stacks.forEach((st, i) => {
      if (i === 0) this.spawn(st, p.x, p.y, p.z, p);
      else this.spawn(st, p.x + (Math.random() - 0.5) * 0.5, p.y, p.z + (Math.random() - 0.5) * 0.5);
    });
  },

  update(dt, pp) {
    this.respawnT += dt;
    if (this.respawnT > 1) {
      this.respawnT = 0;
      for (const it of this.list) {
        const d = Math.abs(it.x - pp.x) + Math.abs(it.z - pp.z);
        it.obj.visible = d < 90;
        it.age += 1;
      }
      // Reposição lenta do saque longe do jogador.
      if (Game.mode === 'sobrevivencia' && Math.random() < 0.35) {
        const p = World.lootPoints[Math.floor(Math.random() * World.lootPoints.length)];
        if (p && !p.item && Math.hypot(p.x - pp.x, p.z - pp.z) > 80) this.fillPoint(p);
      }
      // Remove itens largados muito antigos e longe (evita acúmulo).
      if (this.list.length > 900) {
        const old = this.list.find((it) => !it.point && it.age > 600 && Math.hypot(it.x - pp.x, it.z - pp.z) > 60);
        if (old) this.remove(old);
      }
    }
  },

  // Item para o qual o jogador está olhando.
  target(eye, dir, maxD = 2.7) {
    let best = null, bs = 0.965;
    const v = new THREE.Vector3();
    for (const it of this.list) {
      const dx = it.x - eye.x, dz = it.z - eye.z;
      if (dx * dx + dz * dz > maxD * maxD + 4) continue;
      v.set(dx, it.y + 0.06 - eye.y, dz);
      const d = v.length();
      if (d > maxD) continue;
      v.divideScalar(d);
      const dot = v.dot(dir) + (d < 1.2 ? 0.02 : 0);
      if (dot > bs) { bs = dot; best = it; }
    }
    if (best) {
      const tp = new THREE.Vector3(best.x, best.y + 0.08, best.z);
      if (!Phys.los(eye, tp)) return null;
    }
    return best;
  },
  near(pos, r = 2.6) {
    return this.list.filter((it) => Math.hypot(it.x - pos.x, it.z - pos.z) < r && Math.abs(it.y - pos.y) < 2.2);
  },
};

// ---------------------------------------------------------------- Efeitos
const FX = {
  scene: null,
  init(scene) {
    this.scene = scene;
    const cv = document.createElement('canvas'); cv.width = cv.height = 32;
    const c = cv.getContext('2d');
    const g = c.createRadialGradient(16, 16, 0, 16, 16, 16);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.5, 'rgba(255,255,255,0.6)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g; c.fillRect(0, 0, 32, 32);
    const tex = new THREE.CanvasTexture(cv);
    // Sistemas de partículas: pequeno (faíscas/sangue), médio (poeira/fumaça) e fogo (aditivo).
    this.sys = {
      small: this.makeSys(1500, 0.07, tex, THREE.NormalBlending),
      dust: this.makeSys(900, 0.45, tex, THREE.NormalBlending),
      smoke: this.makeSys(500, 1.6, tex, THREE.NormalBlending, 0.55),
      fire: this.makeSys(700, 0.55, tex, THREE.AdditiveBlending),
      spark: this.makeSys(400, 0.06, tex, THREE.AdditiveBlending),
    };
    // Marcas de bala.
    this.decals = [];
    const dg = new THREE.PlaneGeometry(0.09, 0.09);
    const dm = new THREE.MeshBasicMaterial({ color: 0x151515, transparent: true, opacity: 0.85, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 });
    for (let i = 0; i < 140; i++) { const m = new THREE.Mesh(dg, dm); m.visible = false; scene.add(m); this.decals.push(m); }
    this.decalI = 0;
    // Traçantes.
    this.tracerMax = 96;
    const tg = new THREE.BufferGeometry();
    tg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.tracerMax * 6), 3));
    tg.setAttribute('color', new THREE.BufferAttribute(new Float32Array(this.tracerMax * 6), 3));
    this.tracers = new THREE.LineSegments(tg, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.tracers.frustumCulled = false;
    scene.add(this.tracers);
    // Explosões (esferas) e luzes compartilhadas (número fixo para não recompilar shaders).
    this.booms = [];
    this.boomGeo = new THREE.IcosahedronGeometry(1, 1);
    this.boomLight = new THREE.PointLight(0xffa040, 0, 40, 1.6); scene.add(this.boomLight);
    this.fireLight = new THREE.PointLight(0xff8a30, 0, 18, 1.5); scene.add(this.fireLight);
    this.muzzleLight = new THREE.PointLight(0xffc070, 0, 10, 2); scene.add(this.muzzleLight);
    this.fires = [];
    // Respingos d'água.
    this.flashT = 0;
  },

  makeSys(max, size, tex, blending, opacity = 0.9) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(max * 3), 3));
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(max * 3), 3));
    g.setDrawRange(0, 0);
    const m = new THREE.PointsMaterial({ size, map: tex, vertexColors: true, transparent: true, opacity, depthWrite: false, blending, sizeAttenuation: true });
    const pts = new THREE.Points(g, m);
    pts.frustumCulled = false;
    this.scene.add(pts);
    return { pts, g, max, p: [] };
  },

  emit(sys, x, y, z, n, o = {}) {
    const S = this.sys[sys];
    const col = new THREE.Color(o.color ?? 0xffffff);
    for (let i = 0; i < n; i++) {
      if (S.p.length >= S.max) S.p.shift();
      const sp = o.speed ?? 2;
      const dir = o.dir;
      let vx = (Math.random() - 0.5) * 2 * sp, vy = (Math.random() - 0.2) * sp, vz = (Math.random() - 0.5) * 2 * sp;
      if (dir) { vx = vx * (o.cone ?? 0.5) + dir.x * sp; vy = vy * (o.cone ?? 0.5) + dir.y * sp; vz = vz * (o.cone ?? 0.5) + dir.z * sp; }
      const c = col.clone().multiplyScalar(0.8 + Math.random() * 0.4);
      S.p.push({ x: x + (Math.random() - 0.5) * (o.jit || 0), y: y + (Math.random() - 0.5) * (o.jit || 0), z: z + (Math.random() - 0.5) * (o.jit || 0), vx, vy: vy + (o.up || 0), vz, life: (o.life ?? 0.6) * (0.6 + Math.random() * 0.8), g: o.grav ?? 9, drag: o.drag ?? 1.5, c, fade: o.fade !== false });
    }
  },

  // Impacto de bala por material.
  impact(pt, normal, mat, dir) {
    const n = normal || new THREE.Vector3(0, 1, 0);
    const colors = { concrete: 0xb5b0a5, wood: 0x8a6a45, metal: 0xffd27a, rock: 0x9a968c, terrain: 0x7a6a4a, sand: 0xd9c793, cloth: 0x6b6e4a, water: 0xddeeff, glass: 0xcfe8f0 };
    const c = colors[mat] ?? 0xaaaaaa;
    if (mat === 'water') {
      this.emit('dust', pt.x, pt.y + 0.05, pt.z, 10, { color: 0xe6f2ff, speed: 1.5, up: 3, grav: 9, life: 0.7 });
      Sfx.splash(pt);
      return;
    }
    if (mat === 'metal') this.emit('spark', pt.x, pt.y, pt.z, 10, { color: 0xffc860, speed: 4, dir: n, cone: 1.0, grav: 12, life: 0.35 });
    this.emit('dust', pt.x + n.x * 0.05, pt.y + n.y * 0.05, pt.z + n.z * 0.05, 6, { color: c, speed: 1.2, dir: n, cone: 0.9, grav: 2, life: 0.8, drag: 3 });
    this.emit('small', pt.x, pt.y, pt.z, 6, { color: c, speed: 3, dir: n, cone: 1.0, grav: 12, life: 0.6 });
    if (mat !== 'terrain' && mat !== 'cloth') this.decal(pt, n);
    Sfx.impact(pt, mat === 'metal' ? 'metal' : mat === 'wood' ? 'wood' : 'hard');
  },
  blood(pt, dir, amount = 1) {
    this.emit('small', pt.x, pt.y, pt.z, Math.round(12 * amount), { color: 0x7a1010, speed: 2.5, dir, cone: 1.2, grav: 12, life: 0.7 });
    this.emit('dust', pt.x, pt.y, pt.z, Math.round(4 * amount), { color: 0x5a0a0a, speed: 0.8, grav: 1, life: 0.6, drag: 4 });
  },
  decal(pt, n) {
    const m = this.decals[this.decalI++ % this.decals.length];
    m.position.copy(pt).addScaledVector(n, 0.012);
    m.lookAt(pt.x + n.x, pt.y + n.y, pt.z + n.z);
    m.rotation.z = Math.random() * 6;
    m.visible = true;
  },
  tracer(a, b, color = 0xffd88a) {
    if (!this.tq) this.tq = [];
    this.tq.push([a.x, a.y, a.z, b.x, b.y, b.z, color]);
  },
  muzzle(pos) { this.muzzleLight.position.copy(pos); this.muzzleLight.intensity = 6; this.flashT = 0.05; },

  explosion(pos, big = 1) {
    const m = new THREE.Mesh(this.boomGeo, new THREE.MeshBasicMaterial({ color: 0xffb040, transparent: true, opacity: 0.95, depthWrite: false, blending: THREE.AdditiveBlending }));
    m.position.copy(pos);
    this.scene.add(m);
    this.booms.push({ m, t: 0, big });
    this.boomLight.position.copy(pos).y += 1.5;
    this.boomLight.intensity = 60 * big;
    this.emit('fire', pos.x, pos.y + 0.5, pos.z, 50, { color: 0xff8a30, speed: 6 * big, up: 2, grav: -1, life: 0.5, drag: 3, jit: 1 });
    this.emit('smoke', pos.x, pos.y + 1, pos.z, 26, { color: 0x3a3a3a, speed: 2.2 * big, up: 2.5, grav: -0.6, life: 3.2, drag: 1.2, jit: 1.5 });
    this.emit('small', pos.x, pos.y + 0.3, pos.z, 50, { color: 0x3a3028, speed: 10 * big, up: 4, grav: 14, life: 1.2, drag: 0.6 });
    this.emit('spark', pos.x, pos.y + 0.3, pos.z, 40, { color: 0xffd080, speed: 14 * big, up: 3, grav: 10, life: 0.6, drag: 0.5 });
  },
  addFire(pos, r, t, dps) {
    this.fires.push({ x: pos.x, y: pos.y, z: pos.z, r, t, dps, tick: 0 });
    Sfx.fire(pos);
  },

  update(dt, camPos) {
    for (const k in this.sys) {
      const S = this.sys[k], P = S.g.attributes.position.array, Cc = S.g.attributes.color.array;
      let n = 0;
      for (let i = 0; i < S.p.length; i++) {
        const q = S.p[i];
        q.life -= dt;
        if (q.life <= 0) continue;
        q.vy -= q.g * dt;
        const dr = Math.exp(-q.drag * dt);
        q.vx *= dr; q.vy *= dr; q.vz *= dr;
        q.x += q.vx * dt; q.y += q.vy * dt; q.z += q.vz * dt;
        S.p[n++] = q;
        const j = (n - 1) * 3;
        P[j] = q.x; P[j + 1] = q.y; P[j + 2] = q.z;
        const f = q.fade ? Math.min(1, q.life * 3) : 1;
        Cc[j] = q.c.r * f; Cc[j + 1] = q.c.g * f; Cc[j + 2] = q.c.b * f;
      }
      S.p.length = n;
      S.g.setDrawRange(0, n);
      S.g.attributes.position.needsUpdate = true;
      S.g.attributes.color.needsUpdate = true;
    }
    // traçantes deste quadro
    const TP = this.tracers.geometry.attributes.position.array, TC = this.tracers.geometry.attributes.color.array;
    const q = this.tq || [];
    const cc = new THREE.Color();
    let n = 0;
    for (const t of q) {
      if (n >= this.tracerMax) break;
      TP.set([t[0], t[1], t[2], t[3], t[4], t[5]], n * 6);
      cc.set(t[6]);
      TC.set([cc.r * 0.3, cc.g * 0.3, cc.b * 0.3, cc.r, cc.g, cc.b], n * 6);
      n++;
    }
    this.tracers.geometry.setDrawRange(0, n * 2);
    this.tracers.geometry.attributes.position.needsUpdate = true;
    this.tracers.geometry.attributes.color.needsUpdate = true;
    this.tq = [];
    // explosões
    for (let i = this.booms.length - 1; i >= 0; i--) {
      const b = this.booms[i];
      b.t += dt;
      const s = (1 + b.t * 14) * b.big;
      b.m.scale.setScalar(Math.min(s, 6 * b.big));
      b.m.material.opacity = Math.max(0, 0.95 - b.t * 3);
      if (b.t > 0.35) { this.scene.remove(b.m); b.m.material.dispose(); this.booms.splice(i, 1); }
    }
    this.boomLight.intensity = Math.max(0, this.boomLight.intensity - dt * 160);
    this.flashT -= dt;
    if (this.flashT <= 0) this.muzzleLight.intensity = 0;
    // fogo (molotov e fogueiras)
    let nearest = null, nd = 1e9;
    for (let i = this.fires.length - 1; i >= 0; i--) {
      const f = this.fires[i];
      f.t -= dt;
      if (f.t <= 0) { this.fires.splice(i, 1); continue; }
      if (Math.random() < 0.8) this.emit('fire', f.x + (Math.random() - 0.5) * f.r * 1.4, f.y + 0.1, f.z + (Math.random() - 0.5) * f.r * 1.4, f.perm ? 1 : 3, { color: 0xff7a20, speed: 0.4, up: 2.2, grav: -1.5, life: 0.7, drag: 1 });
      if (Math.random() < 0.15) this.emit('smoke', f.x, f.y + 1.5, f.z, 1, { color: 0x2a2a2a, speed: 0.4, up: 1.5, grav: -0.5, life: 2.5 });
      const d = Math.abs(f.x - camPos.x) + Math.abs(f.z - camPos.z);
      if (d < nd) { nd = d; nearest = f; }
      // dano por segundo
      f.tick -= dt;
      if (f.dps && f.tick <= 0) {
        f.tick = 0.25;
        const P = Player.body.p;
        if (Math.hypot(P.x - f.x, P.z - f.z) < f.r && Math.abs(P.y - f.y) < 2 && !Player.vehicle) Player.damage(f.dps * 0.25, 'fogo');
        for (const z of Zombies.list) if (!z.dead && Math.hypot(z.b.p.x - f.x, z.b.p.z - f.z) < f.r) Zombies.damage(z, f.dps * 0.25 * 1.5, 'body', null, 'fogo');
      }
    }
    for (const w of World.fires) {
      const d = Math.abs(w.x - camPos.x) + Math.abs(w.z - camPos.z);
      if (d < 70 && Math.random() < 0.5) this.emit('fire', w.x + (Math.random() - 0.5) * 0.6, w.y, w.z + (Math.random() - 0.5) * 0.6, 1, { color: 0xff7a20, speed: 0.2, up: 1.4, grav: -1, life: 0.6 });
      if (d < nd) { nd = d; nearest = w; }
    }
    if (nearest && nd < 60) {
      this.fireLight.position.set(nearest.x, nearest.y + 1.2, nearest.z);
      this.fireLight.intensity = (nearest.r ? 14 : 8) * (0.8 + Math.random() * 0.4);
    } else this.fireLight.intensity = 0;
  },
};

// ---------------------------------------------------------------- Ruídos (atraem zumbis)
const Noise = {
  list: [],
  emit(pos, radius, kind = 'tiro') { this.list.push({ x: pos.x, y: pos.y, z: pos.z, r: radius, t: 0.2, kind }); },
  update(dt) { for (let i = this.list.length - 1; i >= 0; i--) { this.list[i].t -= dt; if (this.list[i].t <= 0) this.list.splice(i, 1); } },
};

// ---------------------------------------------------------------- Projéteis
const Proj = {
  list: [],
  scene: null,
  init(scene) {
    this.scene = scene;
    this.arrowGeo = new THREE.CylinderGeometry(0.006, 0.006, 0.7, 5).rotateX(Math.PI / 2);
    this.nadeGeos = {};
  },
  clear() { for (const p of this.list) if (p.mesh) this.scene.remove(p.mesh); this.list = []; },

  // o: {pos, vel, dmg, cal, w, owner, tracer, kind: 'bullet'|'arrow'|'rocket'|'nade'|'gl'}
  fire(o) {
    const c = CALIBERS[o.cal] || {};
    const p = Object.assign({ life: 0, drag: c.drag ?? 0.3, grav: c.grav ?? 1, v0: o.vel.length(), kind: 'bullet' }, o);
    if (p.kind === 'arrow' || p.kind === 'rocket' || p.kind === 'gl') {
      let mesh;
      if (p.kind === 'arrow') mesh = new THREE.Mesh(this.arrowGeo, MAT.color(0x222222));
      else { mesh = new THREE.Mesh(Models.weapon(p.w.id).magGeo || this.arrowGeo, MAT.gun); }
      mesh.position.copy(p.pos);
      this.scene.add(mesh);
      p.mesh = mesh;
    }
    if (p.kind === 'nade') {
      const mdl = Models.weapon(p.w.id);
      p.mesh = new THREE.Mesh(mdl.body, MAT.gun);
      p.mesh.position.copy(p.pos);
      this.scene.add(p.mesh);
      p.fuse = p.w.fuse || 99;
      p.spin = new THREE.Vector3(Math.random() * 10, Math.random() * 10, Math.random() * 10);
    }
    this.list.push(p);
    return p;
  },

  update(dt) {
    const a = new THREE.Vector3(), dir = new THREE.Vector3();
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      p.life += dt;
      if (p.kind === 'nade') { if (this.updateNade(p, dt)) this.list.splice(i, 1); continue; }
      a.copy(p.pos);
      p.vel.y -= 9.81 * p.grav * dt;
      if (p.kind === 'rocket' && p.life < 1.2) p.vel.multiplyScalar(1 + dt * 0.6);
      p.vel.multiplyScalar(Math.exp(-p.drag * dt));
      const step = p.vel.length() * dt;
      dir.copy(p.vel).normalize();
      // Entidades (zumbis, animais, veículos) e mundo.
      const hitE = Zombies.raycast(a, dir, step);
      const hitA = Animals.raycast(a, dir, step);
      const hitV = Vehicles.raycast(a, dir, step, p.ignoreVeh);
      const hitW = Phys.ray(a, dir, step, { noVehicles: true });
      let best = null;
      for (const h of [hitE, hitA, hitV, hitW]) if (h && (!best || h.t < best.t)) best = h;
      const end = best ? best.point || a.clone().addScaledVector(dir, best.t) : a.clone().addScaledVector(dir, step);
      if (p.tracer && p.life > 0.012) FX.tracer(a.clone().addScaledVector(dir, -Math.min(step * 0.6, 7)), end, p.tracerColor);
      if (p.mesh) { p.mesh.position.copy(end); p.mesh.lookAt(end.x - dir.x, end.y - dir.y, end.z - dir.z); }
      if (p.kind === 'rocket' && Math.random() < 0.9) FX.emit('smoke', a.x, a.y, a.z, 1, { color: 0x8a8a8a, speed: 0.3, grav: -0.3, life: 1.4 });
      if (best) {
        this.onHit(p, best, end, dir);
        if (!p.pierce) { if (p.mesh && !p.keepMesh) this.scene.remove(p.mesh); this.list.splice(i, 1); }
        continue;
      }
      p.pos.copy(end);
      if (p.life > 4 || p.pos.y < -30) { if (p.mesh) this.scene.remove(p.mesh); this.list.splice(i, 1); }
    }
  },

  onHit(p, h, pt, dir) {
    const speedF = p.v0 > 0 ? U.clamp(p.vel.length() / p.v0, 0, 1) : 1;
    if (p.kind === 'rocket' || p.kind === 'gl') {
      if (p.kind === 'gl' && p.life * p.v0 < 8) { FX.impact(pt, h.normal, 'metal'); return; } // não armou
      const back = pt.clone().addScaledVector(dir, -0.3);
      Explosions.blast(back, CALIBERS[p.cal].boom.r, CALIBERS[p.cal].boom.dmg, p.owner);
      return;
    }
    let dmg = p.dmg * (0.4 + 0.6 * speedF);
    if (h.zombie) {
      Zombies.damage(h.zombie, dmg, h.part, dir, p.owner, p.w);
      FX.blood(pt, dir.clone().negate(), h.part === 'head' ? 1.5 : 1);
      if (p.kind === 'arrow' && Math.random() < 0.5) Items.drop({ id: 'ammo:' + p.cal, n: 1 }, pt, 0.3);
      return;
    }
    if (h.animal) { Animals.damage(h.animal, dmg * (h.part === 'head' ? 2 : 1), dir); FX.blood(pt, dir.clone().negate(), 1); return; }
    if (h.vehicle) { Vehicles.damage(h.vehicle, dmg * 0.5); FX.impact(pt, h.normal, 'metal', dir); return; }
    const mat = h.kind === 'water' ? 'water' : h.kind === 'terrain' ? 'terrain' : h.c.mat || 'concrete';
    if (h.c && h.c.target) Game.targetHit(h.c.target, p, dmg, pt);
    if (h.c && h.c.tree && p.w && p.w.cls === 'melee') return;
    FX.impact(pt, h.normal, mat, dir);
    if (p.kind === 'arrow' && mat !== 'water' && Math.random() < 0.75) {
      const back = pt.clone().addScaledVector(dir, -0.25);
      if (h.normal && h.normal.y > 0.5) Items.spawn({ id: 'ammo:' + p.cal, n: 1 }, back.x, pt.y, back.z);
      else Items.drop({ id: 'ammo:' + p.cal, n: 1 }, back, 0.2);
    }
  },

  // Granadas de mão: quicam e explodem ao fim da espoleta.
  updateNade(p, dt) {
    p.fuse -= dt;
    const a = p.pos.clone();
    p.vel.y -= 9.81 * dt;
    const step = p.vel.length() * dt;
    if (step > 1e-5) {
      const dir = p.vel.clone().normalize();
      const h = Phys.ray(a, dir, step + 0.05, { water: true });
      if (h && h.t <= step + 0.05) {
        if (p.w.impact) { this.molotov(p, h.point, h.kind === 'water'); return true; }
        p.pos.copy(h.point).addScaledVector(h.normal, 0.06);
        const vn = h.normal.clone().multiplyScalar(p.vel.dot(h.normal));
        const vt = p.vel.clone().sub(vn);
        p.vel.copy(vt.multiplyScalar(0.6)).sub(vn.multiplyScalar(0.35));
        if (h.kind === 'water') p.vel.multiplyScalar(0.2);
        if (p.vel.length() > 2) Sfx.bounce(p.pos);
        p.spin.multiplyScalar(0.6);
      } else p.pos.addScaledVector(dir, step);
    }
    p.mesh.position.copy(p.pos);
    p.mesh.rotation.x += p.spin.x * dt; p.mesh.rotation.y += p.spin.y * dt; p.mesh.rotation.z += p.spin.z * dt;
    if (p.fuse <= 0) {
      this.scene.remove(p.mesh);
      if (p.pos.y < World.WATER - 0.5) { FX.impact(p.pos, null, 'water'); Explosions.blast(p.pos, p.w.radius * 0.5, p.w.dmg * 0.5, p.owner, true); }
      else Explosions.blast(p.pos.clone().add(new THREE.Vector3(0, 0.2, 0)), p.w.radius, p.w.dmg, p.owner);
      return true;
    }
    if (p.life > 20) { this.scene.remove(p.mesh); return true; }
    return false;
  },
  molotov(p, pt, water) {
    this.scene.remove(p.mesh);
    FX.emit('small', pt.x, pt.y + 0.1, pt.z, 20, { color: 0x3a7a4a, speed: 3, up: 2, grav: 12, life: 0.6 });
    Sfx.impact(pt, 'hard');
    if (water) { FX.impact(pt, null, 'water'); return; }
    FX.addFire(pt, p.w.fire.r, p.w.fire.t, p.w.fire.dps);
    Noise.emit(pt, 30);
  },
};

// ---------------------------------------------------------------- Explosões
const Explosions = {
  blast(pos, r, dmg, owner, muffled = false) {
    if (!muffled) FX.explosion(pos, U.clamp(r / 8, 0.6, 1.4));
    Sfx.explosion(pos, r / 8);
    Noise.emit(pos, 160, 'explosao');
    const tmp = new THREE.Vector3();
    // Jogador
    const pe = Player.eye();
    const dp = pe.distanceTo(pos);
    if (dp < r * 1.6) {
      tmp.copy(pe);
      const f = U.clamp(1 - dp / (r * 1.6), 0, 1);
      if (Phys.los(pos, tmp)) Player.damage(dmg * f * f * 0.9, 'explosao', pos);
    }
    if (dp < r * 6) Game.shake(U.clamp(1 - dp / (r * 6), 0, 1) * 1.2);
    for (const z of Zombies.list) {
      if (z.dead) continue;
      tmp.set(z.b.p.x, z.b.p.y + 1, z.b.p.z);
      const d = tmp.distanceTo(pos);
      if (d > r) continue;
      if (!Phys.los(pos, tmp)) continue;
      const f = 1 - d / r;
      Zombies.damage(z, dmg * (0.3 + 0.7 * f), 'body', tmp.clone().sub(pos).normalize(), owner, null, true);
    }
    for (const an of Animals.list) {
      if (an.dead) continue;
      if (an.p.distanceTo(pos) < r) Animals.damage(an, dmg, null);
    }
    for (const v of Vehicles.list) {
      const d = v.pos.distanceTo(pos);
      if (d < r) Vehicles.damage(v, dmg * (1 - d / r) * 1.5);
    }
    for (const d of World.doors) if (!d.open && Math.hypot(d.x - pos.x, d.z - pos.z) < r * 0.5) Game.toggleDoor(d, true);
  },
};
