'use strict';
// Controle da arma em mãos: modelo em primeira pessoa, mira, disparo, recuo, recarga,
// ciclo de ferrolho/bomba, armas brancas, arremessáveis e arco.

const MODE_LABEL = { auto: 'AUTO', semi: 'SEMI', burst: 'RAJADA', pump: 'BOMBA' };
const DRAW_T = { pistola: 0.3, revolver: 0.35, smg: 0.4, fuzil: 0.5, batalha: 0.55, dmr: 0.6, carabina: 0.5, sniper: 0.7, espingarda: 0.55, lmg: 0.9, lancador: 0.8, arco: 0.5, melee: 0.3, arremesso: 0.3 };

const WeaponCtl = {
  cur: null, def: null, gun: null, mods: {},
  adsT: 0, fireT: 0, drawT: 0, drawTotal: 0.3, reload: null, cycleT: 0, cycleTotal: 0, needCycle: false,
  burstLeft: 0, latch: false, bloom: 0, kick: 0, kickRot: 0, swing: 0, swingHit: false, throwT: 0, thrown: false, throwHard: true,
  bowDraw: 0, tacOn: false, holstered: false, sprintT: 0, bob: 0, swayX: 0, swayY: 0, flashT: 0, aimSway: { x: 0, y: 0 }, breath: 0,

  init(worldScene) {
    this.scene = new THREE.Scene();
    this.cam = new THREE.PerspectiveCamera(56, 1, 0.01, 20);
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x45403a, 1.0);
    this.dirL = new THREE.DirectionalLight(0xffffff, 1.4); this.dirL.position.set(0.4, 1, 0.5);
    this.scene.add(this.hemi, this.dirL);
    this.root = new THREE.Group(); this.scene.add(this.root);
    this.pivot = new THREE.Group(); this.root.add(this.pivot);
    // braços
    const sleeveGeo = new THREE.BoxGeometry(0.08, 0.08, 1).translate(0, 0, 0.5);
    this.sleeveMat = new THREE.MeshLambertMaterial({ color: 0x4a5a3a });
    const gloveMat = new THREE.MeshLambertMaterial({ color: 0x2a2b2e });
    const handGeo = new THREE.BoxGeometry(0.06, 0.075, 0.1);
    this.armR = new THREE.Mesh(sleeveGeo, this.sleeveMat); this.armL = new THREE.Mesh(sleeveGeo, this.sleeveMat);
    this.handR = new THREE.Mesh(handGeo, gloveMat); this.handL = new THREE.Mesh(handGeo, gloveMat);
    this.root.add(this.armR, this.armL, this.handR, this.handL);
    // clarão do disparo
    this.flash = new THREE.Group();
    const fg = new THREE.PlaneGeometry(0.16, 0.16);
    for (let i = 0; i < 3; i++) { const m = new THREE.Mesh(fg, MAT.flash); m.rotation.y = (i * Math.PI) / 3; m.rotation.x = i === 2 ? Math.PI / 2 : 0; this.flash.add(m); }
    this.flash.visible = false;
    // cápsulas
    this.shells = [];
    const sg = new THREE.CylinderGeometry(0.005, 0.005, 0.024, 6).rotateZ(Math.PI / 2);
    const sm = new THREE.MeshStandardMaterial({ color: 0xc9a43a, metalness: 0.8, roughness: 0.35 });
    for (let i = 0; i < 14; i++) { const m = new THREE.Mesh(sg, sm); m.visible = false; this.scene.add(m); this.shells.push({ m, v: new THREE.Vector3(), t: 0 }); }
    // laser e lanterna (no mundo)
    this.laserDot = new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 4), new THREE.MeshBasicMaterial({ color: 0xff2020 }));
    this.laserDot.visible = false; worldScene.add(this.laserDot);
    this.lamp = new THREE.SpotLight(0xfff6e0, 0, 70, 0.42, 0.45, 1.1);
    worldScene.add(this.lamp, this.lamp.target);
  },

  // ---------------------------------------------------------------- Equipar
  setWeapon(st) {
    this.cur = st || null;
    this.def = st ? WEAPONS[st.id] : null;
    while (this.pivot.children.length) this.pivot.remove(this.pivot.children[0]);
    this.gun = null; this.reload = null; this.cycleT = 0; this.needCycle = false; this.burstLeft = 0;
    this.swing = 0; this.throwT = 0; this.bowDraw = 0; this.adsT = 0; this.fireT = 0.15;
    const d = this.def;
    this.drawTotal = d ? DRAW_T[d.cls] || 0.4 : 0.2;
    this.drawT = this.drawTotal;
    if (!d) {
      this.mods = {};
    } else if (d.cls === 'melee' || d.cls === 'arremesso') {
      const mesh = new THREE.Mesh(Models.weapon(d.id).body, MAT.gun);
      this.pivot.add(mesh);
      this.mods = {};
    } else {
      this.gun = Models.weaponGroup(st);
      this.pivot.add(this.gun.group);
      this.gun.group.add(this.flash);
      this.flash.position.copy(this.gun.muzzle);
      this.computeMods();
    }
    if (this.cur && this.cur.mode === undefined) this.cur.mode = 0;
    UI.dirty = true;
  },
  refresh() { if (this.cur) { const a = this.adsT; this.setWeapon(this.cur); this.drawT = 0; this.adsT = a; } },
  holster(h) { this.holstered = h; if (h) { this.adsT = 0; this.reload = null; } },

  computeMods() {
    const w = this.def, att = this.cur.att || {};
    const m = { rv: 1, rh: 1, hip: 1, adsMul: 1, reload: 1, loud: 1, dmg: 1, sup: false, light: false, laser: false, bipod: !!w.bipod };
    for (const slot in att) {
      const a = ATTACH[att[slot]];
      if (!a) continue;
      if (a.recoil) { m.rv *= a.recoil; m.rh *= a.recoil; }
      if (a.recoilV) m.rv *= a.recoilV;
      if (a.recoilH) m.rh *= a.recoilH;
      if (a.hip) m.hip *= a.hip;
      if (a.ads) m.adsMul *= a.ads;
      if (a.reload) m.reload *= a.reload;
      if (a.loud) { m.sup = true; m.loud = a.loud; }
      if (a.dmg) m.dmg *= a.dmg;
      if (a.light) m.light = true;
      if (att[slot] === 'laser') m.laser = true;
      if (a.bipod) m.bipod = true;
    }
    if (w.integ && w.integ.muz === 'supp') { m.sup = true; m.loud = 0.18; }
    if (w.silent) { m.sup = true; m.loud = 0.1; }
    const s = this.gun.sight;
    m.zoom = s ? s.zoom : w.zoom;
    m.scope = !!(s && s.scope);
    m.ret = s ? s.ret : null;
    this.mods = m;
  },

  cap() { return weaponCap(this.def, this.cur); },
  isGun() { return this.def && !['melee', 'arremesso'].includes(this.def.cls); },
  mode() { const d = this.def; return d && d.modes ? d.modes[(this.cur.mode || 0) % d.modes.length] : null; },
  zoom() {
    if (Player.binoc) return 6;
    if (!this.isGun()) return 1;
    return U.lerp(1, this.mods.zoom || 1.2, U.smooth(this.adsT));
  },
  scoped() { return this.isGun() && this.mods.scope && this.adsT > 0.9; },

  // ---------------------------------------------------------------- Lógica
  update(dt) {
    const P = Player, In = Input;
    const blocked = UI.blocking() || P.dead || !!P.vehicle || this.holstered;
    const d = this.def;
    this.fireT -= dt;
    this.drawT = Math.max(0, this.drawT - dt);
    this.bloom = Math.max(0, this.bloom - dt * 3.5);
    this.flashT -= dt;
    this.flash.visible = this.flashT > 0;
    const fireHeld = !blocked && (In.mb[0] || Touch.fire);
    if (!fireHeld) this.latch = false;
    const canAct = !blocked && this.drawT <= 0 && !P.using && !P.swimming && !P.ladder && !P.binoc;
    // mira
    const wantAds = !blocked && (In.mb[2] || Touch.ads) && this.isGun() && !P.sprinting && !this.reload && !P.swimming && !P.ladder && !P.binoc;
    const adsTime = (d && d.adsTime ? d.adsTime : 0.2) * (this.mods.adsMul || 1);
    this.adsT = U.clamp(this.adsT + (wantAds ? 1 : -1.4) * dt / adsTime, 0, 1);
    this.sprintT += ((P.sprinting && !this.reload ? 1 : 0) - this.sprintT) * Math.min(1, dt * 8);
    if (!blocked && In.pressed('KeyB') && this.isGun() && d.modes.length > 1) {
      this.cur.mode = ((this.cur.mode || 0) + 1) % d.modes.length;
      Sfx.modeSwitch(); UI.note('Modo de tiro: ' + MODE_LABEL[this.mode()], 'info'); UI.dirty = true;
    }
    if (!blocked && In.pressed('KeyF') && this.isGun() && (this.mods.light || this.mods.laser)) { this.tacOn = !this.tacOn; Sfx.click(2400, 0.2); }
    if (!blocked && In.pressed('KeyR') && this.isGun()) this.startReload();
    if (!d || d.cls === 'melee') this.updateMelee(dt, fireHeld && canAct);
    else if (d.cls === 'arremesso') this.updateThrow(dt, fireHeld && canAct, !blocked && In.mbPressed[2] && canAct);
    else this.updateGun(dt, fireHeld, canAct);
    this.updateTactical(blocked);
    this.animate(dt, blocked);
  },

  updateGun(dt, fireHeld, canAct) {
    const d = this.def, it = this.cur;
    this.updateReload(dt, fireHeld);
    if (this.cycleT > 0) {
      this.cycleT -= dt;
      if (this.cycleT <= 0) this.needCycle = false;
    }
    if (d.id === 'arco') return this.updateBow(dt, fireHeld, canAct);
    const ready = canAct && !this.reload && this.cycleT <= 0 && !this.needCycle;
    if (this.burstLeft > 0) {
      if (this.fireT <= 0 && ready && it.ammo > 0) { this.shoot(); this.burstLeft--; }
      else if (it.ammo <= 0) this.burstLeft = 0;
      return;
    }
    if (!fireHeld) return;
    if (this.reload && this.reload.kind === 'shell' && it.ammo > 0) { this.reload.stop = true; return; }
    if (!ready) return;
    if (it.ammo <= 0) {
      if (!this.latch) { this.latch = true; Sfx.dry(); if (Player.ammo(d.cal) > 0) this.startReload(); }
      return;
    }
    const mode = this.mode();
    if (mode === 'auto') { if (this.fireT <= 0) this.shoot(); }
    else if (!this.latch && this.fireT <= 0) {
      this.latch = true;
      if (mode === 'burst') { this.burstLeft = 2; this.shoot(); }
      else this.shoot();
    }
  },

  updateBow(dt, fireHeld, canAct) {
    const d = this.def, it = this.cur;
    if (it.ammo <= 0 && !this.reload && Player.ammo(d.cal) > 0 && canAct) this.startReload();
    if (fireHeld && canAct && it.ammo > 0 && !this.reload) this.bowDraw = Math.min(d.draw, this.bowDraw + dt);
    else if (!fireHeld && this.bowDraw > 0.12 && it.ammo > 0) { this.shoot(this.bowDraw / d.draw); this.bowDraw = 0; }
    else if (!fireHeld) this.bowDraw = 0;
  },

  startReload() {
    const d = this.def, it = this.cur;
    if (!d || this.reload || !this.isGun()) return;
    const cap = this.cap();
    if (it.ammo >= cap) return;
    const reserve = Player.ammo(d.cal);
    if (reserve <= 0) { UI.note('Sem munição ' + CALIBERS[d.cal].name, 'warn'); return; }
    if (d.reloadType === 'enbloc' && it.ammo > 0) { UI.note('O Garand só recarrega com o pente vazio.', 'info'); return; }
    this.adsT = Math.min(this.adsT, 0.3);
    this.burstLeft = 0;
    const rm = this.mods.reload || 1;
    if (d.reloadType === 'mag' || d.reloadType === 'enbloc' || (d.cls === 'revolver' && it.ammo === 0 && reserve >= cap)) {
      let T = (d.cls === 'revolver' ? 2.3 : d.reload) * rm * (it.ammo > 0 ? 0.88 : 1);
      this.reload = { kind: 'mag', t: 0, T, empty: it.ammo === 0, s1: false, s2: false, s3: false };
    } else {
      this.reload = { kind: 'shell', t: 0, phase: 'start', pt: 0.28, stop: false };
    }
  },

  updateReload(dt, fireHeld) {
    const r = this.reload;
    if (!r) return;
    const d = this.def, it = this.cur;
    if (r.kind === 'mag') {
      r.t += dt;
      const k = r.t / r.T;
      if (!r.s1 && k > 0.18) { r.s1 = true; Sfx.magOut(); }
      if (!r.s2 && k > 0.62) { r.s2 = true; Sfx.magIn(); }
      if (!r.s3 && k > 0.86 && r.empty && !['revolver', 'lancador', 'arco'].includes(d.cls)) { r.s3 = true; Sfx.bolt(); }
      if (k >= 1) {
        const need = this.cap() - it.ammo;
        it.ammo += Player.takeAmmo(d.cal, need);
        this.reload = null; this.needCycle = false;
        UI.dirty = true;
      }
      return;
    }
    // cartucho a cartucho (ou pente)
    r.pt -= dt;
    if (r.pt > 0) return;
    if (r.phase === 'start') { r.phase = 'load'; r.pt = this.insertTime(); return; }
    if (r.phase === 'load') {
      const cap = this.cap();
      let n = 1;
      if (d.reloadType === 'clip' && cap - it.ammo >= d.clip) n = d.clip;
      n = Player.takeAmmo(d.cal, Math.min(n, cap - it.ammo));
      it.ammo += n;
      if (n > 1) Sfx.magIn(); else Sfx.shell();
      UI.dirty = true;
      if (it.ammo >= cap || Player.ammo(d.cal) <= 0 || r.stop || n === 0) { r.phase = 'end'; r.pt = 0.3; }
      else r.pt = this.insertTime();
      return;
    }
    if (r.phase === 'end') {
      this.reload = null;
      if (d.action === 'pump' || d.action === 'lever' || d.action === 'bolt') { this.cycle(); }
    }
  },
  insertTime() {
    const d = this.def, it = this.cur;
    if (d.reloadType === 'clip' && this.cap() - it.ammo >= d.clip && Player.ammo(d.cal) >= d.clip) return d.reload * 0.75;
    return (d.shellTime || 0.5) * (this.mods.reload || 1);
  },
  cycle() {
    const d = this.def;
    if (!d.action) return;
    if (d.action === 'pump' && this.mode() === 'semi') return;
    this.needCycle = true;
    this.cycleTotal = this.cycleT = d.cycle || 0.8;
    if (d.action === 'pump') Sfx.pump(0.05); else Sfx.bolt(0.05);
  },

  currentSpread() {
    const w = this.def, P = Player, m = this.mods;
    let s = U.lerp(w.spread[0] * (m.hip || 1) * (this.tacOn && m.laser ? 0.55 : 1), w.spread[1], U.smooth(this.adsT));
    const hs = Math.hypot(P.body.v.x, P.body.v.z);
    s += (hs / 4.6) * (this.adsT > 0.5 ? 0.45 : 1.5) * (w.cls === 'sniper' ? 2.2 : 1);
    if (!P.body.onGround) s += 3;
    if (P.stance === 'crouch') s *= 0.8; else if (P.stance === 'prone') s *= 0.6;
    return s + this.bloom;
  },

  shoot(power = 1) {
    const d = this.def, it = this.cur, m = this.mods, P = Player;
    const cal = CALIBERS[d.cal];
    it.ammo--;
    this.fireT = 60 / d.rpm;
    const cam = Game.camera;
    const eye = cam.position.clone();
    const fwd = new THREE.Vector3(); cam.getWorldDirection(fwd);
    const right = new THREE.Vector3().crossVectors(fwd, cam.up).normalize();
    const up = new THREE.Vector3().crossVectors(right, fwd).normalize();
    const spread = U.deg(this.currentSpread());
    const n = d.pellets || 1;
    const kind = cal.boom ? (d.id === 'rpg7' ? 'rocket' : 'gl') : cal.arrow ? 'arrow' : 'bullet';
    const aim = new THREE.Vector3();
    const jitter = () => { const a = Math.random() * Math.PI * 2, r = spread * Math.random(); return [Math.cos(a) * r, Math.sin(a) * r]; };
    const [ax, ay] = jitter();
    for (let i = 0; i < n; i++) {
      let [px, py] = [ax, ay];
      if (n > 1) { const a = Math.random() * Math.PI * 2, r = U.deg(d.choke) * Math.sqrt(Math.random()); px += Math.cos(a) * r; py += Math.sin(a) * r; }
      aim.copy(fwd).addScaledVector(right, Math.tan(px)).addScaledVector(up, Math.tan(py)).normalize();
      const vel = aim.clone().multiplyScalar(cal.vel * d.velMul * (kind === 'arrow' ? 0.35 + 0.65 * power : 1));
      Proj.fire({
        pos: eye.clone().addScaledVector(aim, 0.25), vel, dmg: cal.dmg * d.dmgMul * (m.dmg || 1) * (kind === 'arrow' ? 0.3 + 0.7 * power : 1),
        cal: d.cal, w: d, owner: 'player', kind, tracer: kind === 'bullet' && !m.sup && (n === 1 || i < 3),
        tracerColor: d.cls === 'lmg' ? 0xff9a50 : 0xffe0a0, ignoreVeh: Player.vehicle,
      });
    }
    // recuo
    let rk = 1;
    if (P.stance === 'crouch') rk *= 0.88;
    if (P.stance === 'prone') rk *= m.bipod ? 0.4 : 0.72;
    else if (m.bipod && P.stance === 'crouch') rk *= 0.8;
    if (this.adsT > 0.5) rk *= 0.85;
    const kv = d.recoil[0] * (m.rv || 1) * rk * U.rand(0.85, 1.15);
    const kh = d.recoil[1] * (m.rh || 1) * rk * (U.rand(-1, 1) + 0.2);
    P.pitch = U.clamp(P.pitch + U.deg(kv) * 0.35, -1.5, 1.5);
    P.recoilP += U.deg(kv) * 0.65;
    P.yaw -= U.deg(kh);
    this.bloom = Math.min(4, this.bloom + kv * 0.18);
    this.kick = Math.min(0.09, this.kick + 0.012 + kv * 0.008);
    this.kickRot = Math.min(0.35, this.kickRot + 0.03 + kv * 0.02);
    // som, clarão e ruído
    if (kind === 'rocket') Sfx.launch(null); else if (kind === 'gl') Sfx.thump(null); else if (kind === 'arrow') Sfx.bowRelease(null); else Sfx.shot(d, m.sup, null);
    if (!m.sup) { this.flashT = 0.045; this.flash.rotation.z = Math.random() * 6; this.flash.scale.setScalar(0.7 + Math.min(1.6, d.snd / 50)); FX.muzzle(eye.clone().addScaledVector(fwd, 1)); }
    const radius = m.sup ? 10 + 20 * (m.loud || 0.2) : U.clamp(d.snd * 2.2, 40, 220);
    Zombies.hear(P.body.p, radius);
    Animals.scare(P.body.p, radius * 1.2);
    if (kind === 'bullet' && !['revolver', 'espingarda'].includes(d.cls) && !(d.action === 'bolt' || d.action === 'lever')) this.ejectShell();
    if (d.reloadType === 'enbloc' && it.ammo === 0 && Sfx.ctx) Sfx.tone(Sfx.master, { t: 0.08, dur: 0.4, vol: 0.12, f: 2600, f2: 2400 });
    Game.stats.shots++;
    if (it.ammo > 0) {
      if (d.action === 'bolt' || d.action === 'lever' || (d.action === 'pump' && this.mode() !== 'semi')) this.cycle();
    }
    if (it.ammo === 0 && (d.cls === 'arco' || d.cls === 'lancador') && Player.ammo(d.cal) > 0) setTimeout(() => { if (this.cur === it) this.startReload(); }, 250);
    UI.dirty = true;
  },

  ejectShell() {
    const s = this.shells.find((q) => q.t <= 0) || this.shells[0];
    if (!this.gun) return;
    const p = new THREE.Vector3(0.025, this.gun.info.railY - 0.025, this.gun.rearZ - 0.06);
    this.pivot.localToWorld(p);
    s.m.position.copy(p);
    s.v.set(1.2 + Math.random() * 0.6, 1.2 + Math.random() * 0.6, 0.3);
    s.t = 0.6; s.m.visible = true;
    Sfx.casing();
  },

  // ---------------------------------------------------------------- Armas brancas
  updateMelee(dt, fireHeld) {
    const d = this.def;
    const rate = d ? d.rate : 0.5;
    if (fireHeld && this.swing <= 0 && Player.stamina > 4) {
      this.swing = rate; this.swingHit = false;
      if (Game.survival) Player.stamina -= d ? 4 + d.rate * 4 : 3;
      Sfx.swing();
    }
    if (this.swing > 0) {
      this.swing -= dt;
      const k = 1 - this.swing / rate;
      if (!this.swingHit && k > 0.35) { this.swingHit = true; this.meleeHit(); }
    }
  },
  meleeHit() {
    const d = this.def;
    const range = d ? d.range : 1.6, dmg = d ? d.dmg : 14;
    const eye = Game.camera.position.clone();
    const fwd = new THREE.Vector3(); Game.camera.getWorldDirection(fwd);
    const hz = Zombies.raycast(eye, fwd, range), ha = Animals.raycast(eye, fwd, range), hw = Phys.ray(eye, fwd, range, { water: false });
    let best = null;
    for (const h of [hz, ha, hw]) if (h && (!best || h.t < best.t)) best = h;
    if (!best) return;
    if (best.zombie) {
      Zombies.damage(best.zombie, dmg * (best.part === 'head' ? 0.6 : 1), best.part, fwd, 'player', d || { cls: 'melee' });
      FX.blood(best.point, fwd.clone().negate(), 1);
      best.zombie.b.v.x += fwd.x * 3; best.zombie.b.v.z += fwd.z * 3; best.zombie.stagger = 0.4;
      Sfx.melee(best.point);
    } else if (best.animal) {
      Animals.damage(best.animal, dmg); FX.blood(best.point, fwd.clone().negate(), 1); Sfx.melee(best.point);
    } else if (best.kind === 'col' || best.kind === 'terrain') {
      const c = best.c;
      FX.impact(best.point, best.normal, c ? c.mat || 'concrete' : 'terrain');
      if (c && c.tree && d && d.tree) {
        if (World.damageTree(c.tree, dmg)) {
          UI.note('Árvore derrubada! +3 tábuas', 'ok');
          for (let i = 0; i < 3; i++) Items.drop({ id: 'tabua', n: 1 }, new THREE.Vector3(c.tree.x, c.tree.y + 0.5, c.tree.z), 1.5);
          Sfx.explosion(new THREE.Vector3(c.tree.x, c.tree.y, c.tree.z), 0.2);
        }
      }
      if (c && c.vehicle) Vehicles.damage(c.vehicle, dmg * 0.2);
      if (c && c.door && !c.door.open && d && d.dmg >= 70) Game.toggleDoor(c.door, true);
    }
    Zombies.hear(Player.body.p, 6);
  },

  // ---------------------------------------------------------------- Arremessáveis
  updateThrow(dt, fireHeld, alt) {
    if (this.throwT <= 0 && (fireHeld || alt) && !this.latch && this.cur && this.cur.n > 0) {
      this.latch = true; this.throwT = 0.5; this.thrown = false; this.throwHard = !alt;
      Sfx.pin();
    }
    if (this.throwT > 0) {
      this.throwT -= dt;
      if (!this.thrown && this.throwT < 0.2) { this.thrown = true; this.launchNade(this.def, this.throwHard); }
      if (this.throwT <= 0 && (!Player.inv.thr || Player.inv.thr.n <= 0)) { Player.inv.thr = null; Game.selectSlot(Game.lastGunSlot || 'pri', true); }
    }
  },
  launchNade(def, hard) {
    const cam = Game.camera;
    const fwd = new THREE.Vector3(); cam.getWorldDirection(fwd);
    const pos = cam.position.clone().addScaledVector(fwd, 0.5);
    const vel = fwd.clone().multiplyScalar(hard ? 17 : 8).add(new THREE.Vector3(0, hard ? 2.5 : 3, 0)).addScaledVector(Player.body.v, 0.5);
    Proj.fire({ kind: 'nade', pos, vel, w: def, owner: 'player' });
    const st = Player.inv.thr;
    if (st && st.id === def.id) Player.consume(st);
    Sfx.swing();
    UI.dirty = true;
  },
  quickThrow() {
    const st = Player.inv.thr;
    if (!st || st.n <= 0 || this.def === WEAPONS[st.id]) return;
    Sfx.pin();
    setTimeout(() => { if (!Player.dead) this.launchNade(WEAPONS[st.id], true); }, 250);
  },

  // ---------------------------------------------------------------- Lanterna e laser
  updateTactical(blocked) {
    const on = this.tacOn && this.isGun() && !blocked;
    const cam = Game.camera;
    const fwd = new THREE.Vector3(); cam.getWorldDirection(fwd);
    Player.flashOn = on && this.mods.light;
    if (on && this.mods.light) {
      this.lamp.position.copy(cam.position).addScaledVector(fwd, 0.4).y -= 0.12;
      this.lamp.target.position.copy(cam.position).addScaledVector(fwd, 12);
      this.lamp.intensity = 90;
    } else this.lamp.intensity = 0;
    if (on && this.mods.laser && this.adsT < 0.9) {
      const h = Phys.ray(cam.position, fwd, 150, { water: true });
      const hz = Zombies.raycast(cam.position, fwd, h ? h.t : 150);
      const pt = hz ? hz.point : h ? h.point : null;
      if (pt) { this.laserDot.position.copy(pt); this.laserDot.scale.setScalar(0.4 + cam.position.distanceTo(pt) * 0.03); this.laserDot.visible = true; }
      else this.laserDot.visible = false;
    } else this.laserDot.visible = false;
  },

  // ---------------------------------------------------------------- Animação do modelo
  hipPos() {
    const k = this.gun ? this.gun.info && Models.weapon(this.cur.id).kind : null;
    if (k === 'pistol' || k === 'revolver') return [0.12, -0.125, -0.34];
    if (k === 'bullpup' || k === 'p90') return [0.13, -0.15, -0.4];
    if (k === 'rpg') return [0.15, -0.1, -0.2];
    if (k === 'bow') return [-0.02, -0.08, -0.42];
    return [0.135, -0.155, -0.29];
  },

  animate(dt, blocked) {
    const P = Player, d = this.def;
    const hidden = blocked || this.scoped() || P.binoc;
    this.root.visible = !hidden;
    // balanço e respiração
    const hs = Math.hypot(P.body.v.x, P.body.v.z);
    this.bob += dt * (P.body.onGround ? hs * 1.9 : 0);
    const bobAmp = P.body.onGround ? Math.min(1, hs / 4.6) * (1 - this.adsT * 0.85) : 0;
    this.breath += dt;
    this.swayX += (-Input.dx * 0.0004 - this.swayX) * Math.min(1, dt * 8);
    this.swayY += (Input.dy * 0.0004 - this.swayY) * Math.min(1, dt * 8);
    this.kick *= Math.exp(-dt * 16);
    this.kickRot *= Math.exp(-dt * 12);
    const sx = this.swayX * (1 - this.adsT * 0.7), sy = this.swayY * (1 - this.adsT * 0.7);
    // oscilação da mira com lunetas (segure Shift para prender a respiração)
    const scoped = this.isGun() && this.mods.scope && this.adsT > 0.5;
    let amp = scoped ? 0.0035 * (this.mods.zoom / 8 + 0.5) : this.adsT * 0.0008;
    if (P.stance === 'prone') amp *= 0.4; else if (P.stance === 'crouch') amp *= 0.75;
    if (scoped && (Input.k.ShiftLeft || Input.k.ShiftRight) && P.stamina > 5) { amp *= 0.15; P.stamina -= dt * 12; P.stamT = 0.6; }
    this.aimSway.x = Math.sin(this.breath * 0.9) * amp + Math.sin(this.breath * 2.3) * amp * 0.3;
    this.aimSway.y = Math.sin(this.breath * 1.3 + 1) * amp;

    let pos = new THREE.Vector3(), rot = new THREE.Euler();
    if (!d) {
      // punhos
      this.pivot.visible = false;
      const k = this.swing > 0 ? Math.sin((1 - this.swing / 0.5) * Math.PI) : 0;
      const bobY = Math.abs(Math.cos(this.bob)) * 0.012 * bobAmp;
      this.handR.position.set(0.15 - k * 0.1, -0.2 + bobY + k * 0.05, -0.32 - k * 0.22);
      this.handL.position.set(-0.15, -0.21 + bobY, -0.33);
      this.handR.rotation.set(0, 0, 0); this.handL.rotation.set(0, 0, 0);
      this.placeArm(this.armR, new THREE.Vector3(0.25, -0.42, 0.12), this.handR.position);
      this.placeArm(this.armL, new THREE.Vector3(-0.25, -0.42, 0.12), this.handL.position);
      this.armL.visible = this.handL.visible = true;
      this.updateShells(dt);
      return;
    }
    this.pivot.visible = true;
    if (d.cls === 'melee') {
      pos.set(0.2, -0.28, -0.42); rot.set(-0.55, 0, 0.3);
      if (this.swing > 0) {
        const k = 1 - this.swing / d.rate;
        const s = k < 0.35 ? k / 0.35 : 1 - (k - 0.35) / 0.65;
        pos.x -= 0.2 * s; pos.y += 0.05 * s; pos.z -= 0.15 * s;
        rot.x -= 1.3 * s; rot.z += 0.6 * s; rot.y += 0.4 * s;
      }
    } else if (d.cls === 'arremesso') {
      pos.set(0.16, -0.2, -0.36); rot.set(0, 0, 0);
      if (this.throwT > 0) {
        const k = 1 - this.throwT / 0.5;
        if (k < 0.55) { pos.z += 0.1 * (k / 0.55); pos.y += 0.08 * (k / 0.55); }
        else { const q = (k - 0.55) / 0.45; pos.z -= 0.35 * q; pos.y += 0.08 - 0.15 * q; }
        if (this.thrown) this.pivot.visible = false;
      }
    } else {
      const hip = this.hipPos();
      const g = this.gun;
      const ads = [-g.sightX, -g.sightY, -0.115 - g.rearZ];
      const a = U.smooth(this.adsT);
      pos.set(U.lerp(hip[0], ads[0], a), U.lerp(hip[1], ads[1], a), U.lerp(hip[2], ads[2], a));
      // corrida
      const sp = this.sprintT;
      pos.x += sp * 0.03; pos.y -= sp * 0.06; pos.z += sp * 0.03;
      rot.x += -sp * 0.3; rot.y += sp * 0.75; rot.z += sp * 0.25;
      // recarga
      if (this.reload) {
        const r = this.reload;
        let e;
        if (r.kind === 'mag') { const k = r.t / r.T; e = Math.sin(Math.min(1, k) * Math.PI); }
        else e = r.phase === 'load' ? 1 : r.phase === 'start' ? 1 - r.pt / 0.28 : r.pt / 0.3;
        e = U.clamp(e, 0, 1);
        rot.z += 0.55 * e; rot.x += 0.22 * e; pos.y -= 0.05 * e; pos.x -= 0.02 * e;
        if (g.parts.mag && r.kind === 'mag') {
          const k = r.t / r.T;
          const drop = k < 0.2 ? 0 : k < 0.38 ? (k - 0.2) / 0.18 : k < 0.5 ? 1 : k < 0.68 ? 1 - (k - 0.5) / 0.18 : 0;
          g.parts.mag.position.copy(g.info.magPos);
          g.parts.mag.position.y -= drop * 0.28;
        }
        if (r.kind === 'shell' && r.phase === 'load') { const q = r.pt / this.insertTime(); pos.y -= Math.sin(q * Math.PI) * 0.01; rot.z += Math.sin(q * Math.PI) * 0.05; }
      } else if (g.parts.mag) g.parts.mag.position.copy(g.info.magPos);
      // ferrolho / bomba
      if (this.cycleT > 0) {
        const k = 1 - this.cycleT / this.cycleTotal, s = Math.sin(k * Math.PI);
        if (d.action === 'pump') pos.z += 0.045 * s;
        else { rot.z += 0.18 * s; pos.y -= 0.015 * s; pos.z += 0.02 * s; }
      }
      // arco tensionado
      if (d.id === 'arco' && g.parts.mag) g.parts.mag.position.z = g.info.magPos.z + this.bowDraw / d.draw * 0.22;
      if (d.id === 'arco' && g.parts.mag) g.parts.mag.visible = this.cur.ammo > 0;
      pos.z += this.kick; rot.x += this.kickRot;
    }
    // sacar
    if (this.drawT > 0) { const k = this.drawT / this.drawTotal; pos.y -= 0.25 * k * k; rot.x -= 0.7 * k * k; }
    // bob e balanço
    pos.x += Math.sin(this.bob) * 0.012 * bobAmp + sx;
    pos.y += Math.abs(Math.cos(this.bob)) * 0.01 * bobAmp + sy + Math.sin(this.breath * 1.6) * 0.0015 * (1 - this.adsT);
    this.pivot.position.copy(pos);
    this.pivot.rotation.copy(rot);
    this.pivot.updateMatrixWorld(true);
    // mãos e braços
    const grip = new THREE.Vector3(0, -0.035, 0.025);
    const sup = this.gun ? this.gun.info.support.clone() : new THREE.Vector3();
    if (d.cls === 'melee') grip.set(0, 0.0, 0);
    if (d.cls === 'arremesso') grip.set(0, 0.02, 0.03);
    if (d.id === 'arco') { grip.set(0, 0, 0.01); }
    const hr = this.pivot.localToWorld(d.id === 'arco' ? new THREE.Vector3(0.01, 0.03, 0.05 + this.bowDraw / d.draw * 0.22 + 0.3) : grip);
    if (d.id === 'arco') hr.copy(this.pivot.localToWorld(new THREE.Vector3(0.012, 0.03, 0.05 + 0.33 + this.bowDraw / d.draw * 0.22)));
    this.handR.position.copy(hr); this.handR.quaternion.copy(this.pivot.quaternion);
    this.placeArm(this.armR, new THREE.Vector3(0.24, -0.42, 0.12), hr);
    const twoHands = this.gun && !(this.reload && this.reload.kind === 'mag' && this.reload.t / this.reload.T > 0.15 && this.reload.t / this.reload.T < 0.72);
    if (twoHands || d.id === 'arco') {
      const hl = this.pivot.localToWorld(d.id === 'arco' ? new THREE.Vector3(0, 0, 0) : sup);
      this.handL.position.copy(hl); this.handL.quaternion.copy(this.pivot.quaternion);
      this.placeArm(this.armL, new THREE.Vector3(-0.22, -0.42, 0.06), hl);
      this.armL.visible = this.handL.visible = true;
    } else if (this.gun && this.reload) {
      // mão esquerda segura o carregador
      const k = this.reload.t / this.reload.T;
      const mp = this.gun.parts.mag ? this.gun.parts.mag.getWorldPosition(new THREE.Vector3()) : this.pivot.localToWorld(sup.clone());
      mp.y -= 0.05;
      if (k > 0.38 && k < 0.5) mp.y -= 0.08;
      this.handL.position.copy(mp);
      this.placeArm(this.armL, new THREE.Vector3(-0.22, -0.42, 0.06), mp);
      this.armL.visible = this.handL.visible = true;
    } else this.armL.visible = this.handL.visible = false;
    this.updateShells(dt);
  },

  placeArm(arm, shoulder, hand) {
    arm.position.copy(shoulder);
    arm.lookAt(hand);
    arm.scale.set(1, 1, Math.max(0.01, shoulder.distanceTo(hand) + 0.02));
  },

  updateShells(dt) {
    for (const s of this.shells) {
      if (s.t <= 0) continue;
      s.t -= dt;
      s.v.y -= 9 * dt;
      s.m.position.addScaledVector(s.v, dt);
      s.m.rotation.x += dt * 20; s.m.rotation.y += dt * 13;
      if (s.t <= 0) s.m.visible = false;
    }
  },

  render(renderer) {
    if (!this.root.visible) return;
    this.cam.aspect = Game.camera.aspect;
    this.cam.updateProjectionMatrix();
    this.hemi.intensity = World.hemi.intensity * 0.85 + 0.2 + (Player.flashOn ? 0.6 : 0);
    this.hemi.color.copy(World.hemi.color);
    this.dirL.intensity = World.sun.intensity * 0.6 + 0.25;
    this.dirL.color.copy(World.sun.color);
    if (Player.inv && Player.inv.colete) this.sleeveMat.color.set(ITEMS[Player.inv.colete.id].color);
    else this.sleeveMat.color.set(0x4a5a3a);
    renderer.clearDepth();
    renderer.render(this.scene, this.cam);
  },

  // Informações para o HUD.
  hud() {
    const d = this.def, it = this.cur;
    if (!d) return { name: 'Mãos vazias', ammo: '', sub: 'Socos', mode: '' };
    if (d.cls === 'melee') return { name: d.name, ammo: '', sub: 'Corpo a corpo', mode: '' };
    if (d.cls === 'arremesso') return { name: d.name, ammo: String(it.n), sub: 'Arremessável', mode: '' };
    const res = Game.infinite ? '∞' : Player.ammo(d.cal);
    let mode = MODE_LABEL[this.mode()] || '';
    if (d.action === 'bolt') mode = 'FERROLHO'; else if (d.action === 'lever') mode = 'ALAVANCA'; else if (d.action === 'pump' && this.mode() !== 'semi') mode = 'BOMBA';
    return { name: d.name, ammo: it.ammo + ' / ' + res, sub: CALIBERS[d.cal].name, mode, low: it.ammo <= Math.ceil(this.cap() * 0.2) };
  },
};
