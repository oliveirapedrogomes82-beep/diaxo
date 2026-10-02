'use strict';
// Jogador: movimento (correr, agachar, deitar, pular, nadar, escadas), sobrevivência e inventário.

const STANCE = {
  stand: { h: 1.8, eye: 1.62, speed: 4.6 },
  crouch: { h: 1.25, eye: 1.08, speed: 2.3 },
  prone: { h: 0.62, eye: 0.42, speed: 1.1 },
};

const Player = {
  body: { p: new THREE.Vector3(), v: new THREE.Vector3(), r: 0.32, h: 1.8, step: 0.45, onGround: false },
  yaw: 0, pitch: 0, recoilP: 0, recoilY: 0,
  stance: 'stand', eyeY: 1.62,
  hp: 100, food: 100, water: 100, stamina: 100, immune: 100,
  bleeding: false, leg: false, legT: 0, buffs: {},
  inv: null, slot: 'pri',
  vehicle: null, dead: true, flashOn: false, swimming: false, ladder: null, sprinting: false,
  stepAcc: 0, using: null, binoc: false, lastHurt: 0,

  reset(x, z, yaw = 0) {
    const b = this.body;
    b.p.set(x, Phys.ground(x, z), z);
    b.v.set(0, 0, 0);
    this.yaw = yaw; this.pitch = 0; this.recoilP = 0;
    this.stance = 'stand'; b.h = 1.8; this.eyeY = 1.62;
    this.hp = 100; this.food = 100; this.water = 100; this.stamina = 100; this.immune = 100;
    this.bleeding = false; this.leg = false; this.buffs = {};
    this.inv = { pri: null, sec: null, mel: null, thr: null, bag: [], mochila: null, colete: null, capacete: null };
    this.slot = 'pri';
    this.vehicle = null; this.dead = false; this.flashOn = false; this.using = null; this.binoc = false;
  },

  eye() { return new THREE.Vector3(this.body.p.x, this.body.p.y + this.eyeY, this.body.p.z); },
  targetPos() { return this.vehicle ? this.vehicle.pos : this.body.p; },
  forward() {
    const cp = Math.cos(this.pitch + this.recoilP);
    return new THREE.Vector3(-Math.sin(this.yaw) * cp, Math.sin(this.pitch + this.recoilP), -Math.cos(this.yaw) * cp);
  },

  // ---------------------------------------------------------------- Movimento
  update(dt) {
    if (this.dead) return;
    if (this.vehicle) {
      const v = this.vehicle;
      this.body.p.copy(v.pos);
      this.body.v.set(0, 0, 0);
    } else this.move(dt);
    if (Game.survival) this.stats(dt); else this.lightStats(dt);
    if (this.using) {
      this.using.t -= dt;
      if (this.using.t <= 0) { const u = this.using; this.using = null; this.applyItem(u.st); }
    }
  },

  setStance(s) {
    if (s === this.stance) return;
    const b = this.body, nh = STANCE[s].h;
    if (nh > b.h && Phys.blocked(b.p.x - b.r + 0.02, b.p.y + b.h, b.p.z - b.r + 0.02, b.p.x + b.r - 0.02, b.p.y + nh, b.p.z + b.r - 0.02)) { UI.note('Sem espaço para levantar', 'warn'); return; }
    this.stance = s; b.h = nh;
  },

  move(dt) {
    const b = this.body, In = Input;
    const typing = UI.blocking();
    let f = 0, r = 0;
    if (!typing) {
      f = (In.k.KeyW ? 1 : 0) - (In.k.KeyS ? 1 : 0);
      r = (In.k.KeyD ? 1 : 0) - (In.k.KeyA ? 1 : 0);
      if (Touch.on) { f += Touch.move.y; r += Touch.move.x; }
      if (In.pressed('KeyC') || In.pressed('ControlLeft')) this.setStance(this.stance === 'crouch' ? 'stand' : 'crouch');
      if (In.pressed('KeyZ')) this.setStance(this.stance === 'prone' ? 'stand' : 'prone');
    }
    const len = Math.hypot(f, r);
    if (len > 1) { f /= len; r /= len; }
    const st = STANCE[this.stance];
    const w = WeaponCtl.def;
    let speed = st.speed * (w && w.move ? w.move : 1);
    const wantSprint = (In.k.ShiftLeft || In.k.ShiftRight || Touch.sprint) && f > 0.3 && !typing;
    this.sprinting = false;
    if (wantSprint && this.stance !== 'prone' && this.stamina > 3 && !this.leg && WeaponCtl.adsT < 0.3 && !this.using) {
      if (this.stance === 'crouch') this.setStance('stand');
      if (this.stance === 'stand') { speed = 7.2 * (w && w.move ? Math.min(1, w.move + 0.05) : 1); this.sprinting = true; }
    }
    if (WeaponCtl.adsT > 0.5) speed *= 0.6;
    if (this.leg) speed *= 0.55;
    if (this.buffs.adrenalina > 0) speed *= 1.15;
    if (this.using) speed *= 0.5;
    if (f < 0) speed *= 0.8;
    // direção
    const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
    let mx = (-sy * f + cy * r), mz = (-cy * f - sy * r);
    // água
    const depth = World.WATER - b.p.y;
    this.swimming = depth > 1.25;
    this.ladder = Phys.ladderAt(b.p, b.r, b.h);
    const wasGround = b.onGround, prevVy = b.v.y;
    if (this.ladder && !this.swimming) {
      const L = this.ladder;
      const climb = f !== 0 ? f : 0;
      b.v.y = climb * 2.8;
      const top = b.p.y > L.y1 - 0.5;
      const cxl = (L.x0 + L.x1) / 2, czl = (L.z0 + L.z1) / 2;
      if (!top || climb <= 0) { b.p.x += (cxl - b.p.x) * Math.min(1, dt * 6); b.p.z += (czl - b.p.z) * Math.min(1, dt * 6); }
      const hs = top ? 2.5 : 0.6;
      b.v.x = mx * hs; b.v.z = mz * hs;
      if (In.pressed('Space')) { this.ladder = null; b.v.y = 3; b.v.x = sy * 3; b.v.z = cy * 3; }
      if (this.stance !== 'stand') this.setStance('stand');
    } else if (this.swimming) {
      speed = 2.6 * (this.stamina > 0 ? 1 : 0.5);
      if (this.stance !== 'stand') this.setStance('stand');
      const target = World.WATER - 1.35;
      b.v.y += ((target - b.p.y) * 4 - b.v.y) * Math.min(1, dt * 3);
      b.v.x += (mx * speed - b.v.x) * Math.min(1, dt * 3);
      b.v.z += (mz * speed - b.v.z) * Math.min(1, dt * 3);
      this.stamina = Math.max(0, this.stamina - dt * (len > 0 ? 3 : 1));
      if (this.stamina <= 0) this.damage(dt * 8, 'afogamento');
    } else {
      const accel = b.onGround ? 14 : 2.5;
      b.v.x += (mx * speed - b.v.x) * Math.min(1, accel * dt);
      b.v.z += (mz * speed - b.v.z) * Math.min(1, accel * dt);
      b.v.y -= 18 * dt;
      if ((In.pressed('Space') || Touch.jump) && b.onGround && !typing) {
        if (this.stance !== 'stand') this.setStance('stand');
        else if (!this.leg && this.stamina > 8) { b.v.y = 6.2; this.stamina -= 10; b.onGround = false; this.jumped = true; }
      }
    }
    Touch.jump = false;
    Phys.move(b, b.v.x * dt, b.v.y * dt, b.v.z * dt);
    if (b.stepped) { b.stepped = false; }
    if (wasGround && !b.onGround && b.v.y <= 0 && !this.jumped && !this.ladder && !this.swimming) Phys.snapDown(b, 0.5);
    if (b.onGround) this.jumped = false;
    // dano de queda
    if (!wasGround && b.onGround && !this.ladder) {
      if (prevVy < -11.5) {
        this.damage((-prevVy - 11.5) * 7, 'queda');
        if (prevVy < -14 && Math.random() < 0.7 && !this.leg) { this.leg = true; this.legT = 300; UI.note('Você quebrou a perna! Use uma tala.', 'bad'); }
      }
      if (prevVy < -4) Sfx.step('hard', 0.25);
    }
    // altura dos olhos suave
    const eyeT = this.swimming ? 1.5 : st.eye;
    this.eyeY += (eyeT - this.eyeY) * Math.min(1, dt * 10);
    // estamina
    if (this.sprinting && len > 0) { this.stamina = Math.max(0, this.stamina - dt * (this.buffs.energia > 0 ? 6 : 14)); this.stamT = 0.9; }
    else { this.stamT = (this.stamT || 0) - dt; if (this.stamT <= 0) this.stamina = Math.min(100, this.stamina + dt * 18); }
    // passos e ruído
    const hs = Math.hypot(b.v.x, b.v.z);
    if ((b.onGround || this.swimming) && hs > 0.5) {
      this.stepAcc += hs * dt;
      const stride = this.sprinting ? 2.5 : this.stance === 'stand' ? 1.9 : 1.2;
      if (this.stepAcc > stride) {
        this.stepAcc = 0;
        const surf = this.swimming || depth > 0.2 ? 'water' : b.ground ? (b.ground.mat === 'wood' ? 'wood' : 'hard') : 'grass';
        const vol = this.sprinting ? 0.16 : this.stance === 'stand' ? 0.1 : 0.05;
        Sfx.step(surf, vol);
        const nr = this.sprinting ? 16 : this.stance === 'stand' ? 7 : this.stance === 'crouch' ? 2.5 : 1;
        Zombies.hear(b.p, nr);
      }
    }
  },

  // ---------------------------------------------------------------- Sobrevivência
  stats(dt) {
    const k = this.sprinting ? 1.6 : 1;
    this.food = Math.max(0, this.food - dt * (100 / 1500) * k);
    this.water = Math.max(0, this.water - dt * (100 / 1100) * k);
    let dmg = 0;
    if (this.food <= 0) dmg += 0.5;
    if (this.water <= 0) dmg += 0.6;
    if (this.immune <= 0) dmg += 0.6;
    this.lightStats(dt);
    if (this.food > 50 && this.water > 50 && !this.bleeding && this.immune > 20 && this.hp < 100) this.hp = Math.min(100, this.hp + dt * (this.food > 85 && this.water > 85 ? 1.0 : 0.45));
    if (dmg) this.damage(dmg * dt, 'fome');
  },
  lightStats(dt) {
    if (this.bleeding) {
      this.damage(dt * 0.9, 'sangramento');
      if (Math.random() < dt * 2) FX.emit('small', this.body.p.x, this.body.p.y + 0.9, this.body.p.z, 2, { color: 0x7a1010, speed: 0.5, grav: 9, life: 0.6 });
    }
    if (!Game.survival && this.hp < 100 && !this.bleeding && Game.time - this.lastHurt > 6) this.hp = Math.min(100, this.hp + dt * 2.5);
    if (this.leg) { this.legT -= dt; if (this.legT <= 0) { this.leg = false; UI.note('Sua perna se recuperou.', 'ok'); } }
    for (const b in this.buffs) this.buffs[b] = Math.max(0, this.buffs[b] - dt);
  },

  armor() {
    let a = 0;
    if (this.inv.colete) a += ITEMS[this.inv.colete.id].armor;
    if (this.inv.capacete) a += ITEMS[this.inv.capacete.id].armor * 0.4;
    return Math.min(0.7, a);
  },

  damage(amount, src, from) {
    if (this.dead || Game.god || amount <= 0) return;
    if (src === 'zumbi' || src === 'explosao') amount *= 1 - this.armor();
    this.hp -= amount;
    if (amount > 1.5) {
      this.lastHurt = Game.time;
      UI.hurt(amount, from);
      if (src !== 'sangramento' && src !== 'fome') Sfx.hurt();
      Game.shake(Math.min(0.6, amount / 40));
    }
    if (this.hp <= 0) { this.hp = 0; this.die(src); }
  },
  zombieHit(z, dmg) {
    if (this.dead) return;
    this.damage(dmg, 'zumbi', z.b.p);
    if (Game.survival) this.immune = Math.max(0, this.immune - (3 + Math.random() * 5));
    if (!this.bleeding && Math.random() < 0.22) { this.bleeding = true; UI.note('Você está sangrando! Use uma atadura (H).', 'bad'); }
    if (z.t.knock) {
      const dx = this.body.p.x - z.b.p.x, dz = this.body.p.z - z.b.p.z, d = Math.hypot(dx, dz) || 1;
      this.body.v.x += (dx / d) * 9; this.body.v.z += (dz / d) * 9; this.body.v.y = 4;
    }
  },
  die(src) {
    if (this.dead) return;
    this.dead = true;
    if (this.vehicle) this.exitVehicle(true);
    Game.onDeath(src);
  },

  // ---------------------------------------------------------------- Veículos
  enterVehicle(v) {
    if (v.dead) return;
    this.vehicle = v;
    this.setStance('stand');
    WeaponCtl.holster(true);
    UI.note('Você entrou: ' + v.def.name + ' — W/S acelera, A/D vira, Espaço freia, Q buzina, F faróis, E sai', 'info');
  },
  exitVehicle(force = false) {
    const v = this.vehicle;
    if (!v) return;
    const fwd = Vehicles.forward(v), right = new THREE.Vector3(-fwd.z, 0, fwd.x);
    const tries = [right.clone().multiplyScalar(-(v.hw + 0.7)), right.clone().multiplyScalar(v.hw + 0.7), fwd.clone().multiplyScalar(-(v.hl + 0.8)), fwd.clone().multiplyScalar(v.hl + 0.8), new THREE.Vector3(0, 0, 0)];
    let placed = false;
    for (const o of tries) {
      const x = v.pos.x + o.x, z = v.pos.z + o.z;
      const y = Phys.support(x, z, 0.3, v.pos.y + 1.5);
      if (o.lengthSq() === 0 || !Phys.blocked(x - 0.3, y + 0.1, z - 0.3, x + 0.3, y + 1.8, z + 0.3)) {
        this.body.p.set(x, o.lengthSq() === 0 ? v.pos.y + v.ht : y, z);
        placed = true; break;
      }
    }
    if (!placed && !force) return;
    this.body.v.set(0, 0, 0);
    this.vehicle = null;
    if (Vehicles.engineSnd) { Vehicles.engineSnd.stop(); Vehicles.engineSnd = null; }
    WeaponCtl.holster(false);
  },

  // ---------------------------------------------------------------- Inventário
  capacity() {
    let c = 6;
    if (this.inv.mochila) c += ITEMS[this.inv.mochila.id].cap;
    if (this.inv.colete) c += ITEMS[this.inv.colete.id].cap;
    return c;
  },
  used() { let u = 0; for (const s of this.inv.bag) u += itemSize(s); return u; },
  free() { return this.capacity() - this.used(); },

  count(id) {
    let n = 0;
    for (const s of this.inv.bag) if (s.id === id) n += s.n;
    if (this.inv.thr && this.inv.thr.id === id) n += this.inv.thr.n;
    return n;
  },
  take(id, n) {
    let got = 0;
    for (let i = this.inv.bag.length - 1; i >= 0 && got < n; i--) {
      const s = this.inv.bag[i];
      if (s.id !== id) continue;
      const k = Math.min(n - got, s.n);
      s.n -= k; got += k;
      if (s.n <= 0) this.inv.bag.splice(i, 1);
    }
    return got;
  },
  ammo(cal) { return Game.infinite ? 999 : this.count('ammo:' + cal); },
  takeAmmo(cal, n) { return Game.infinite ? n : this.take('ammo:' + cal, n); },

  // Adiciona ao inventário. Retorna quantas unidades couberam.
  add(st, autoEquip = true) {
    const d = itemDef(st.id);
    if (!d) return 0;
    const inv = this.inv;
    if (d.type === 'weapon' && !d.stack) {
      if (autoEquip && !inv[d.slot]) { inv[d.slot] = st; if (WeaponCtl.cur === null && !this.vehicle) Game.selectSlot(d.slot); return 1; }
      if (this.free() >= itemSize(st)) { inv.bag.push(st); return 1; }
      return 0;
    }
    if (d.type === 'weapon' && d.stack) {
      if (!inv.thr || inv.thr.id === st.id) {
        if (!inv.thr) inv.thr = { id: st.id, n: 0 };
        inv.thr.n += st.n;
        return st.n;
      }
    }
    if (autoEquip && (d.type === 'bag' || d.type === 'vest' || d.type === 'helmet')) {
      const k = d.type === 'bag' ? 'mochila' : d.type === 'vest' ? 'colete' : 'capacete';
      if (!inv[k]) { inv[k] = st; return 1; }
    }
    if (stackable(st.id)) {
      // quanto cabe?
      let n = st.n;
      const existing = inv.bag.find((s) => s.id === st.id);
      const base = existing ? existing.n : 0;
      const before = existing ? itemSize(existing) : 0;
      const room = this.free() + before;
      while (n > 0 && itemSize({ id: st.id, n: base + n }) > room) n--;
      if (n <= 0) return 0;
      if (existing) existing.n += n; else inv.bag.push({ id: st.id, n });
      return n;
    }
    if (this.free() >= itemSize(st)) { inv.bag.push(st); return st.n || 1; }
    return 0;
  },

  // Pega um item do chão.
  pickup(it) {
    const st = it.st;
    const n = this.add(st);
    if (n <= 0) { UI.note('Sem espaço na mochila!', 'warn'); return false; }
    const d = itemDef(st.id);
    if (st.n && n < st.n) { st.n -= n; UI.note('Pegou ' + n + '× ' + d.name + ' (sem espaço para o resto)', 'warn'); }
    else { Items.remove(it); UI.note('Pegou ' + (st.n > 1 ? st.n + '× ' : '') + d.name, 'ok'); }
    Sfx.pickup();
    UI.dirty = true;
    return true;
  },

  dropStack(st, n = null) {
    const inv = this.inv;
    let out = st;
    const i = inv.bag.indexOf(st);
    if (i >= 0) {
      if (n !== null && n < st.n) { st.n -= n; out = { id: st.id, n }; }
      else inv.bag.splice(i, 1);
    } else {
      for (const k of ['pri', 'sec', 'mel', 'thr', 'mochila', 'colete', 'capacete']) {
        if (inv[k] === st) {
          if (k === 'mochila' || k === 'colete') {
            const cap = ITEMS[st.id].cap;
            if (this.used() > this.capacity() - cap) { UI.note('Esvazie espaço antes de tirar isso.', 'warn'); return; }
          }
          inv[k] = null;
          if (WeaponCtl.cur === st) WeaponCtl.setWeapon(null);
        }
      }
    }
    Items.drop(out, this.body.p, 0.7);
    UI.dirty = true;
  },

  equip(st) {
    const d = itemDef(st.id), inv = this.inv;
    const i = inv.bag.indexOf(st);
    if (d.type === 'weapon' && !d.stack) {
      const old = inv[d.slot];
      if (i >= 0) inv.bag.splice(i, 1);
      inv[d.slot] = st;
      if (old) { if (this.free() >= itemSize(old)) inv.bag.push(old); else Items.drop(old, this.body.p); }
      Game.selectSlot(d.slot, true);
    } else if (d.type === 'bag' || d.type === 'vest' || d.type === 'helmet') {
      const k = d.type === 'bag' ? 'mochila' : d.type === 'vest' ? 'colete' : 'capacete';
      const old = inv[k];
      if (i >= 0) inv.bag.splice(i, 1);
      inv[k] = st;
      if (old) { if (this.free() >= itemSize(old)) inv.bag.push(old); else Items.drop(old, this.body.p); }
    } else if (d.type === 'weapon' && d.stack) {
      if (i >= 0) inv.bag.splice(i, 1);
      if (inv.thr) inv.bag.push(inv.thr);
      inv.thr = st;
    }
    UI.dirty = true;
  },
  unequip(k) {
    const st = this.inv[k];
    if (!st) return;
    if (k === 'mochila' || k === 'colete') { if (this.used() > this.capacity() - ITEMS[st.id].cap) { UI.note('Sem espaço para guardar isso.', 'warn'); return; } }
    if (this.free() < itemSize(st)) { UI.note('Sem espaço na mochila.', 'warn'); return; }
    this.inv[k] = null;
    this.inv.bag.push(st);
    if (WeaponCtl.cur === st) WeaponCtl.setWeapon(null);
    UI.dirty = true;
  },

  // Consumíveis.
  use(st) {
    if (!st) return;
    const d = itemDef(st.id);
    if (!d) return;
    if (['food', 'drink', 'med'].includes(d.type)) {
      if (this.using) return;
      if (d.type === 'med' && d.leg && !this.leg) { UI.note('Sua perna não está quebrada.', 'warn'); return; }
      this.using = { st, t: d.time || (d.type === 'food' ? 1.4 : 1.1), total: d.time || (d.type === 'food' ? 1.4 : 1.1) };
      if (d.type === 'food') Sfx.eat(); else if (d.type === 'drink') Sfx.drink(); else Sfx.bandage();
      return;
    }
    if (d.type === 'weapon' || d.type === 'bag' || d.type === 'vest' || d.type === 'helmet') return this.equip(st);
    if (st.id === 'binoculo') { this.binoc = !this.binoc; UI.close(); return; }
    if (st.id === 'galao' || st.id === 'ferramentas') {
      const v = Vehicles.near(this.body.p, 4);
      if (!v) { UI.note('Chegue perto de um veículo.', 'warn'); return; }
      if (st.id === 'galao') { v.fuel = Math.min(v.def.fuel, v.fuel + 40); UI.note('Abasteceu ' + v.def.name + '.', 'ok'); }
      else { v.hp = Math.min(v.def.hp, v.hp + v.def.hp * 0.6); UI.note('Consertou ' + v.def.name + '.', 'ok'); }
      this.consume(st);
      Sfx.pickup();
      return;
    }
    if (d.type === 'attach') { UI.note('Abra o inventário e clique no acessório para instalar numa arma.', 'info'); }
  },
  consume(st) {
    st.n = (st.n || 1) - 1;
    if (st.n <= 0) {
      const i = this.inv.bag.indexOf(st);
      if (i >= 0) this.inv.bag.splice(i, 1);
      if (this.inv.thr === st) this.inv.thr = null;
    }
    UI.dirty = true;
  },
  applyItem(st) {
    const d = itemDef(st.id);
    if (this.inv.bag.indexOf(st) < 0) return;
    if (d.health) this.hp = Math.min(100, this.hp + d.health);
    if (d.food) this.food = U.clamp(this.food + d.food, 0, 100);
    if (d.water) this.water = U.clamp(this.water + d.water, 0, 100);
    if (d.stamina) this.stamina = Math.min(100, this.stamina + d.stamina);
    if (d.immune) this.immune = U.clamp(this.immune + d.immune, 0, 100);
    if (d.bleed && this.bleeding) { this.bleeding = false; UI.note('Sangramento estancado.', 'ok'); }
    if (d.leg) { this.leg = false; UI.note('Perna imobilizada.', 'ok'); }
    if (d.buff) this.buffs[d.buff] = 60;
    this.consume(st);
    if (d.empty) this.add({ id: d.empty, n: 1 });
    UI.note('Usou ' + d.name, 'ok');
  },
  // Cura rápida (tecla H).
  quickHeal() {
    const meds = this.inv.bag.filter((s) => { const d = itemDef(s.id); return d.type === 'med' && (d.health || d.bleed); });
    if (!meds.length) { UI.note('Nenhum item médico.', 'warn'); return; }
    if (this.hp >= 100 && !this.bleeding) { UI.note('Você não está ferido.', 'info'); return; }
    let best = meds[0], score = -Infinity;
    for (const s of meds) {
      const d = itemDef(s.id);
      let sc = (d.bleed && this.bleeding ? 100 : 0) + Math.min(d.health || 0, 100 - this.hp) - (d.time || 1) * 2;
      if (sc > score) { score = sc; best = s; }
    }
    this.use(best);
  },

  // Estado para salvar.
  serialize() {
    return { p: this.body.p.toArray(), yaw: this.yaw, hp: this.hp, food: this.food, water: this.water, stamina: this.stamina, immune: this.immune, bleeding: this.bleeding, leg: this.leg, inv: this.inv, slot: this.slot };
  },
  restore(s) {
    this.body.p.fromArray(s.p); this.yaw = s.yaw;
    Object.assign(this, { hp: s.hp, food: s.food, water: s.water, stamina: s.stamina, immune: s.immune, bleeding: s.bleeding, leg: s.leg, legT: 120 });
    this.inv = s.inv; this.slot = s.slot;
  },
};
