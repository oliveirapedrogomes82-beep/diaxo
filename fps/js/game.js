'use strict';
// Núcleo do jogo: entrada, estados, modos, câmera, interação, clima, salvamento e laço principal.

const Input = {
  k: {}, pset: new Set(), mb: [false, false, false], mbPressed: [false, false, false], dx: 0, dy: 0, wheel: 0,
  init() {
    addEventListener('keydown', (e) => {
      if (e.target && e.target.tagName === 'INPUT' && e.target.type !== 'range' && e.target.type !== 'checkbox') return;
      if (['Tab', 'Space', 'ArrowUp', 'ArrowDown'].includes(e.code) || (e.code === 'KeyF' && e.ctrlKey)) e.preventDefault();
      if (!this.k[e.code]) this.pset.add(e.code);
      this.k[e.code] = true;
      Game.onKey(e);
    });
    addEventListener('keyup', (e) => { this.k[e.code] = false; });
    addEventListener('blur', () => { this.k = {}; this.mb = [false, false, false]; });
    addEventListener('mousedown', (e) => {
      if (e.target.closest && e.target.closest('.panel, .screen, button')) return;
      this.mb[e.button] = true; this.mbPressed[e.button] = true;
    });
    addEventListener('mouseup', (e) => { this.mb[e.button] = false; });
    addEventListener('mousemove', (e) => {
      if (Game.state !== 'play' || UI.blocking()) return;
      if (document.pointerLockElement || Game.noLock) { this.dx += e.movementX || 0; this.dy += e.movementY || 0; }
    });
    addEventListener('wheel', (e) => { if (Game.state === 'play' && !UI.blocking()) this.wheel += Math.sign(e.deltaY); }, { passive: true });
    addEventListener('contextmenu', (e) => e.preventDefault());
  },
  pressed(c) { return this.pset.has(c); },
  tap(c) { this.pset.add(c); Game.onKey({ code: c, preventDefault() {} }); },
  endFrame() { this.pset.clear(); this.mbPressed = [false, false, false]; this.dx = 0; this.dy = 0; this.wheel = 0; },
};

const DAY_LEN = 1200; // segundos para um dia completo

const Game = {
  state: 'loading', mode: null, survival: false, infinite: false, god: false,
  time: 0, dayT: 0.34, day: 1, night: 0, weather: { rain: 0, target: 0, t: 240, wind: 0.3 },
  stats: { kills: 0, headshots: 0, shots: 0, animals: 0 },
  settings: { sens: 1, fov: 75, vol: 0.8, dist: 1, res: 1, shadows: true, invert: false, fps: false },
  shakeAmt: 0, prompt: null, interact: null, lastGunSlot: 'pri', menuT: 0,
  hordas: { wave: 0, state: 'pause', t: 10, toSpawn: 0, spawnT: 0 },
  get wave() { return this.hordas.wave; },

  async boot() {
    const prog = (p, t) => { document.getElementById('load-fill').style.width = p + '%'; document.getElementById('load-text').textContent = t; return new Promise((r) => setTimeout(r, 16)); };
    try { Object.assign(this.settings, JSON.parse(localStorage.getItem('zonamorta.cfg') || '{}')); } catch (e) { /* armazenamento indisponível */ }
    await prog(4, 'Iniciando o motor gráfico…');
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(2, devicePixelRatio) * this.settings.res);
    renderer.setSize(innerWidth, innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.autoClear = false;
    document.getElementById('view').appendChild(renderer.domElement);
    this.renderer = renderer;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(this.settings.fov, innerWidth / innerHeight, 0.05, 2600);
    this.camera.rotation.order = 'YXZ';
    World.scene = this.scene;
    const W = World;
    W.noise = makeNoise2D(W.SEED); W.rnd = U.rng(W.SEED);
    await prog(10, 'Gerando a ilha…'); W.defineLocations(); W.genHeights();
    await prog(22, 'Traçando estradas…'); W.defineRoads(); W.applyRoads();
    await prog(32, 'Modelando o relevo…'); W.buildTerrain(); W.buildWater(); W.buildRoadMeshes();
    await prog(45, 'Construindo cidades, base militar e fazendas…'); Buildings.buildAll(W); W.flushLocGeo();
    await prog(65, 'Plantando florestas…'); W.buildTrees();
    await prog(75, 'Céu e iluminação…'); W.buildSky();
    await prog(82, 'Carregando ' + WEAPON_LIST.length + ' armas e equipamentos…');
    Items.init(this.scene); FX.init(this.scene); Proj.init(this.scene); Zombies.init(this.scene); Animals.init(this.scene); Vehicles.init(this.scene);
    WeaponCtl.init(this.scene);
    this.initRain();
    Input.init();
    UI.init();
    await prog(90, 'Compilando shaders…');
    W.updateSky(this.dayT, this.camera.position, this.weather);
    renderer.compile(this.scene, this.camera);
    this.applySettings();
    addEventListener('resize', () => this.resize());
    document.addEventListener('pointerlockchange', () => this.onLockChange());
    renderer.domElement.addEventListener('click', () => { if (this.state === 'play' && !UI.blocking()) this.lock(); });
    await prog(100, 'Pronto!');
    document.getElementById('loading').classList.add('hidden');
    this.toMenu();
    this.clock = new THREE.Clock();
    this.loop();
  },

  resize() {
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(innerWidth, innerHeight);
  },
  applySettings() {
    const s = this.settings;
    this.renderer.setPixelRatio(Math.min(2, devicePixelRatio) * s.res);
    this.renderer.setSize(innerWidth, innerHeight);
    World.sun.castShadow = !!s.shadows;
    Sfx.setVolume(s.vol);
    document.getElementById('fps').classList.toggle('hidden', !s.fps);
    try { localStorage.setItem('zonamorta.cfg', JSON.stringify(s)); } catch (e) { /* ignora */ }
  },

  lock() {
    if (this.noLock || Touch.on) return;
    const el = this.renderer.domElement;
    try {
      const r = el.requestPointerLock && el.requestPointerLock();
      if (r && r.catch) r.catch(() => { this.noLock = true; });
    } catch (e) { this.noLock = true; }
  },
  unlock() { if (document.pointerLockElement) document.exitPointerLock(); },
  onLockChange() {
    if (!document.pointerLockElement && this.state === 'play' && !UI.blocking() && !this.noLock) this.pause();
  },

  // ---------------------------------------------------------------- Estados
  toMenu() {
    this.saveGame();
    this.state = 'menu';
    this.unlock();
    UI.open = null;
    for (const id of ['hud', 'pause', 'death', 'inv', 'map', 'arsenal', 'config', 'controles']) UI.hide(id);
    UI.show('menu');
    Touch.show(false);
    let has = false;
    try { has = !!localStorage.getItem('zonamorta.save'); } catch (e) { /* ignora */ }
    document.getElementById('btn-continue').classList.toggle('hidden', !has);
    if (Vehicles.engineSnd) { Vehicles.engineSnd.stop(); Vehicles.engineSnd = null; }
    WeaponCtl.root.visible = false;
  },
  pause() {
    if (this.state !== 'play') return;
    this.state = 'paused';
    UI.close();
    UI.open = 'pause';
    UI.show('pause');
    this.unlock();
    this.saveGame();
  },
  resume() {
    UI.hide('pause');
    for (const id of ['config', 'controles', 'arsenal']) UI.hide(id);
    this.state = 'play';
    UI.open = null;
    this.lock();
  },

  start(mode, cont = false) {
    Sfx.init(); Sfx.startAmbient();
    this.mode = mode;
    this.survival = mode === 'sobrevivencia';
    this.infinite = mode === 'arsenal';
    Items.clear(); Zombies.clear(); Animals.clear(); Vehicles.clear(); Proj.clear();
    FX.fires.length = 0;
    for (const d of World.doors) if (d.open) this.toggleDoor(d, true, true);
    Items.populate(mode === 'sobrevivencia' ? 0.62 : 0.4);
    for (const vs of World.vehicleSpawns) Vehicles.spawn(vs.type, vs.x, vs.z, vs.yaw, mode === 'arsenal' ? 1 : null);
    this.time = 0; this.dayT = mode === 'hordas' ? 0.7 : 0.34; this.day = 1;
    this.weather = { rain: 0, target: 0, t: 300, wind: 0.3 };
    this.stats = { kills: 0, headshots: 0, shots: 0, animals: 0 };
    this.hordas = { wave: 0, state: 'pause', t: 12, toSpawn: 0, spawnT: 0 };
    let save = null;
    if (cont) { try { save = JSON.parse(localStorage.getItem('zonamorta.save')); } catch (e) { save = null; } }
    this.spawnPlayer(save);
    UI.hide('menu'); UI.hide('death'); UI.show('hud');
    document.getElementById('wave').classList.toggle('hidden', mode !== 'hordas');
    Touch.show(true);
    this.state = 'play';
    UI.open = null;
    UI.dirty = true;
    this.lock();
    if (mode === 'sobrevivencia' && !cont) UI.note('Sobreviva: procure comida, água e armas. Zumbis ouvem seus tiros!', 'info');
    if (mode === 'hordas') UI.note('Prepare-se! Ondas de zumbis vão invadir Santa Cruz.', 'warn');
    if (mode === 'arsenal') UI.note('Campo de tiro: pressione K (ou Tab → Arsenal) para escolher qualquer arma.', 'info');
  },

  spawnPlayer(save) {
    const P = Player;
    let x = 0, z = 0, yaw = 0;
    if (this.mode === 'hordas') { const L = World.loc('santacruz'); x = L.x - 18; z = L.z - 22; yaw = Math.PI; }
    else if (this.mode === 'arsenal') { const s = World.loc('estande').spawn; x = s.x; z = s.z; yaw = s.yaw; }
    else { const s = this.pickSpawn(); x = s.x; z = s.z; yaw = s.yaw; }
    P.reset(x, z, yaw);
    const give = (st) => P.add(st);
    if (save && save.player) {
      P.restore(save.player);
      this.dayT = save.dayT ?? this.dayT; this.day = save.day ?? 1; this.time = save.time ?? 0;
      if (save.stats) this.stats = save.stats;
      UI.note('Jogo carregado. Dia ' + this.day + '.', 'ok');
    } else if (this.mode === 'sobrevivencia') {
      give({ id: 'facao', n: 1 }); give({ id: 'atadura', n: 2 }); give({ id: 'agua', n: 1 }); give({ id: 'barra', n: 1 });
    } else if (this.mode === 'hordas') {
      give(newWeaponItem(WEAPONS.glock17, true)); give({ id: 'ammo:9x19', n: 68 }); give({ id: 'faca', n: 1 });
      give({ id: 'atadura', n: 3 }); give({ id: 'kit', n: 1 }); give({ id: 'm67', n: 1 }); give({ id: 'mochila_trilha', n: 1 });
    } else {
      const m4 = newWeaponItem(WEAPONS.m4a1, true); m4.att = { opt: 'reddot', und: 'vgrip' };
      give(m4); give(newWeaponItem(WEAPONS.glock17, true)); give({ id: 'faca', n: 1 }); give({ id: 'm67', n: 5 }); give({ id: 'kit', n: 3 });
    }
    this.selectSlot(P.inv.pri ? 'pri' : P.inv.sec ? 'sec' : P.inv.mel ? 'mel' : 'pri', true);
  },

  pickSpawn() {
    for (let i = 0; i < 300; i++) {
      const r = U.pick(World.roads.filter((q) => q.kind !== 'estande'));
      const s = U.pick(r.S);
      if (World.inAnyLoc(s.x, s.z, 45)) continue;
      const x = s.x + 4, z = s.z + 2;
      if (World.height(x, z) < 1.5) continue;
      return { x, z, yaw: Math.random() * Math.PI * 2 };
    }
    return { x: 0, z: 0, yaw: 0 };
  },

  onDeath(src) {
    this.state = 'dead';
    this.unlock();
    Touch.show(false);
    const P = Player;
    if (this.survival) {
      for (const k of ['pri', 'sec', 'mel', 'thr', 'mochila', 'colete', 'capacete']) if (P.inv[k]) Items.drop(P.inv[k], P.body.p, 1.2);
      for (const st of P.inv.bag) Items.drop(st, P.body.p, 1.2);
      try { localStorage.removeItem('zonamorta.save'); } catch (e) { /* ignora */ }
    }
    const causes = { zumbi: 'devorado por zumbis', queda: 'uma queda feia', fome: 'fome, sede ou infecção', sangramento: 'hemorragia', explosao: 'uma explosão', fogo: 'queimaduras', afogamento: 'afogamento', batida: 'um acidente de carro' };
    const mins = Math.floor(this.time / 60);
    let html = `Causa: <b>${causes[src] || src}</b><br>Tempo sobrevivido: <b>${mins} min</b> · Dia <b>${this.day}</b><br>Zumbis abatidos: <b>${this.stats.kills}</b> (${this.stats.headshots} na cabeça)`;
    if (this.mode === 'hordas') html += `<br>Onda alcançada: <b>${this.hordas.wave}</b>`;
    if (this.survival) html += '<br><small>Seus itens ficaram no local da morte.</small>';
    document.getElementById('death-info').innerHTML = html;
    UI.close(); UI.open = 'death';
    setTimeout(() => UI.show('death'), 900);
  },
  respawn() {
    UI.hide('death');
    if (this.mode === 'sobrevivencia') {
      const s = this.pickSpawn();
      Player.reset(s.x, s.z, s.yaw);
      Player.add({ id: 'facao', n: 1 }); Player.add({ id: 'atadura', n: 2 }); Player.add({ id: 'agua', n: 1 });
      this.selectSlot('mel', true);
      this.state = 'play'; UI.open = null; UI.dirty = true; Touch.show(true); this.lock();
    } else this.start(this.mode);
  },

  saveGame() {
    if (this.mode !== 'sobrevivencia' || Player.dead || this.state === 'loading' || this.state === 'menu') return;
    try { localStorage.setItem('zonamorta.save', JSON.stringify({ v: 1, player: Player.serialize(), dayT: this.dayT, day: this.day, time: this.time, stats: this.stats })); } catch (e) { /* ignora */ }
  },

  // ---------------------------------------------------------------- Ações de interface
  action(act) {
    Sfx.init();
    switch (act) {
      case 'sobrevivencia': case 'hordas': this.start(act); break;
      case 'arsenal-mode': this.start('arsenal'); break;
      case 'continuar': this.start('sobrevivencia', true); break;
      case 'enciclopedia': UI.openArsenal('browse'); break;
      case 'controles': UI.openPanel('controles'); break;
      case 'config': UI.openPanel('config'); break;
      case 'fechar': UI.close(); break;
      case 'voltar': this.resume(); break;
      case 'sair': this.saveGame(); this.toMenu(); break;
      case 'renascer': this.respawn(); break;
      case 'menu': this.toMenu(); break;
      case 'spawnz': this.spawnRangeZombies(); UI.close(); break;
      case 'daynight': this.dayT = this.night > 0.5 ? 0.45 : 0.95; UI.note(this.night > 0.5 ? 'Dia' : 'Noite', 'info'); break;
    }
  },

  onKey(e) {
    const c = e.code;
    if (this.state === 'menu') { if (c === 'Escape') UI.close(); return; }
    if (c === 'Escape') {
      if (this.state === 'play' && UI.blocking()) { UI.close(); return; }
      if (this.state === 'paused') { if (UI.open && UI.open !== 'pause') UI.close(); else this.resume(); return; }
      if (this.state === 'play') { this.pause(); return; }
    }
    if (this.state !== 'play') return;
    if (c === 'Tab' || c === 'KeyI') { e.preventDefault && e.preventDefault(); if (UI.open === 'inv') UI.close(); else if (!UI.blocking()) { UI.invTab = 'itens'; document.querySelectorAll('.tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === 'itens')); UI.openPanel('inv'); } return; }
    if (c === 'KeyM') { if (UI.open === 'map') UI.close(); else if (!UI.blocking()) UI.openPanel('map'); return; }
    if (c === 'KeyK' && this.infinite) { if (UI.open === 'arsenal') UI.close(); else if (!UI.blocking()) UI.openArsenal('pick'); return; }
  },

  // ---------------------------------------------------------------- Armas e slots
  selectSlot(k, force = false) {
    const P = Player;
    const st = P.inv[k];
    if (!st && !force) return;
    if (WeaponCtl.cur === st && st && !force) return;
    P.slot = k;
    WeaponCtl.setWeapon(st);
    if (k === 'pri' || k === 'sec') this.lastGunSlot = k;
    UI.dirty = true;
  },
  cycleSlot(dir) {
    const order = ['pri', 'sec', 'mel', 'thr'];
    let i = order.indexOf(Player.slot);
    for (let n = 0; n < 4; n++) {
      i = (i + dir + 4) % 4;
      if (Player.inv[order[i]]) { this.selectSlot(order[i]); return; }
    }
  },
  giveWeapon(id, att) {
    const w = WEAPONS[id], P = Player;
    if (w.cls === 'arremesso') { P.inv.thr = { id, n: 10 }; this.selectSlot('thr', true); return; }
    const st = w.cls === 'melee' ? { id, n: 1 } : newWeaponItem(w, true);
    if (st.att) { st.att = Object.assign({}, att || {}); st.ammo = weaponCap(w, st); }
    P.inv[w.slot] = st;
    this.selectSlot(w.slot, true);
    UI.note('Equipado: ' + w.name, 'ok');
  },

  canCraft(r) {
    if (r.tool && !Player.count(r.tool)) return false;
    return r.in.every(([id, n]) => Player.count(id) >= n);
  },
  craft(r) {
    if (!this.canCraft(r)) return;
    for (const [id, n] of r.in) Player.take(id, n);
    const [id, n] = r.out;
    const st = { id, n };
    const d = itemDef(id);
    if (d.type === 'weapon' && !d.stack) Object.assign(st, newWeaponItem(WEAPONS[id], false));
    const got = Player.add(st, false);
    if (got < n) Items.drop({ id, n: n - got }, Player.body.p);
    Sfx.pickup();
    UI.note('Criou ' + n + '× ' + d.name, 'ok');
    UI.dirty = true;
  },

  // ---------------------------------------------------------------- Portas
  animDoors: new Set(),
  toggleDoor(d, force = false, instant = false) {
    const P = Player.body;
    if (d.open && !force) {
      const b = d.cb;
      if (P.p.x + P.r > b.x0 && P.p.x - P.r < b.x1 && P.p.z + P.r > b.z0 && P.p.z - P.r < b.z1 && P.p.y < b.y1) return;
    }
    d.open = !d.open;
    const b = d.open ? d.ob : d.cb;
    d.col.x0 = b.x0; d.col.x1 = b.x1; d.col.z0 = b.z0; d.col.z1 = b.z1;
    if (instant) d.pivot.rotation.y = d.open ? d.oy : d.cy;
    else { this.animDoors.add(d); Sfx.door(d.open); }
  },
  updateDoors(dt) {
    for (const d of this.animDoors) {
      const t = d.open ? d.oy : d.cy;
      const diff = U.angDiff(d.pivot.rotation.y, t);
      d.pivot.rotation.y += diff * Math.min(1, dt * 10);
      if (Math.abs(diff) < 0.01) { d.pivot.rotation.y = t; this.animDoors.delete(d); }
    }
  },

  // ---------------------------------------------------------------- Interação (tecla E)
  updateInteract() {
    const P = Player;
    this.prompt = null; this.interact = null;
    if (P.dead || UI.blocking()) return;
    if (P.vehicle) { this.prompt = 'Sair do veículo'; this.interact = { t: 'exit' }; }
    else {
      const eye = P.eye();
      const fwd = new THREE.Vector3(); this.camera.getWorldDirection(fwd);
      const h = Phys.ray(eye, fwd, 2.6, { water: false, terrain: false });
      const it = Items.target(eye, fwd);
      const dItem = it ? Math.hypot(it.x - eye.x, it.y - eye.y, it.z - eye.z) : 99;
      if (h && h.c && h.c.door && h.t < dItem) {
        this.prompt = h.c.door.open ? 'Fechar porta' : 'Abrir porta';
        this.interact = { t: 'door', d: h.c.door };
      } else if (it) {
        const d = itemDef(it.st.id);
        this.prompt = 'Pegar ' + d.name + (it.st.n > 1 ? ' (' + it.st.n + ')' : '') + (d.type === 'weapon' && d.cal ? ' · ' + CALIBERS[d.cal].name : '');
        this.interact = { t: 'item', it };
      } else {
        const v = Vehicles.near(P.body.p, 2.2);
        const pump = World.pumps.find((p) => Math.hypot(p.x - P.body.p.x, p.z - P.body.p.z) < 2.5);
        if (pump) {
          const pv = Vehicles.near(new THREE.Vector3(pump.x, pump.y, pump.z), 6);
          if (pv) { this.prompt = 'Abastecer ' + pv.def.name + ' na bomba'; this.interact = { t: 'pump', v: pv }; }
        }
        if (!this.interact && v) {
          this.prompt = `Entrar: ${v.def.name} (⛽ ${Math.round((v.fuel / v.def.fuel) * 100)}% · 🔧 ${Math.round((v.hp / v.def.hp) * 100)}%)`;
          this.interact = { t: 'veh', v };
        }
        if (!this.interact && P.count('garrafa') > 0) {
          const hw = Phys.ray(eye, fwd, 3.5, { water: true });
          if (hw && hw.kind === 'water') { this.prompt = 'Encher garrafa (água suja)'; this.interact = { t: 'water' }; }
        }
      }
    }
    if (Input.pressed('KeyE') && this.interact) {
      const I = this.interact;
      if (I.t === 'exit') P.exitVehicle();
      else if (I.t === 'door') this.toggleDoor(I.d);
      else if (I.t === 'item') P.pickup(I.it);
      else if (I.t === 'veh') P.enterVehicle(I.v);
      else if (I.t === 'pump') { I.v.fuel = I.v.def.fuel; UI.note('Tanque cheio!', 'ok'); Sfx.pickup(); }
      else if (I.t === 'water') { P.take('garrafa', 1); P.add({ id: 'aguasuja', n: 1 }); Sfx.splash(P.eye()); UI.note('Garrafa cheia de água suja. Ferva com um isqueiro (Criação).', 'info'); }
    }
  },

  // ---------------------------------------------------------------- Feedback de combate
  onHit(head, killed) {
    UI.hitmarker(head, killed);
    Sfx.hit(head);
  },
  onKill(z, head) {
    this.stats.kills++;
    if (head) this.stats.headshots++;
    if (z.t.xp > 1 || head) UI.note(z.t.name + ' eliminado' + (head ? ' · tiro na cabeça' : ''), 'kill');
  },
  targetHit(tgt, p, dmg, pt) {
    tgt.swing = 1;
    if (Sfx.ctx) Sfx.tone(Sfx.out(pt, 10, 600), { dur: 0.6, vol: 0.4, type: 'triangle', f: 1250, f2: 1180 });
    const dist = Player.body.p.distanceTo(pt);
    const drop = p.life > 0 ? 0.5 * 9.81 * (p.grav ?? 1) * p.life * p.life : 0;
    UI.rangeInfo(`Acerto a <b>${dist.toFixed(0)} m</b><br>Dano: <b>${dmg.toFixed(0)}</b> · voo: <b>${(p.life * 1000).toFixed(0)} ms</b><br>Queda da bala: <b>${(drop * 100).toFixed(0)} cm</b>`);
  },
  shake(a) { this.shakeAmt = Math.min(1.5, this.shakeAmt + a); },

  // ---------------------------------------------------------------- Modo hordas
  updateHordas(dt) {
    const H = this.hordas, P = Player;
    const el = document.getElementById('wave');
    if (H.state === 'pause') {
      H.t -= dt;
      el.innerHTML = H.wave ? `Onda ${H.wave} vencida!<small>Próxima onda em ${Math.ceil(H.t)} s</small>` : `Prepare-se<small>Primeira onda em ${Math.ceil(H.t)} s</small>`;
      if (H.t <= 0) {
        H.wave++; H.state = 'fight'; H.toSpawn = 6 + H.wave * 4; H.spawnT = 0;
        UI.note('Onda ' + H.wave + ' — ' + H.toSpawn + ' zumbis!', 'bad');
        Sfx.horn(P.body.p);
      }
    } else {
      const alive = Zombies.alive();
      el.innerHTML = `Onda ${H.wave}<small>${alive + H.toSpawn} zumbis restantes · ${this.stats.kills} abatidos</small>`;
      H.spawnT -= dt;
      if (H.toSpawn > 0 && H.spawnT <= 0 && alive < 26) {
        H.spawnT = Math.max(0.25, 1.4 - H.wave * 0.08);
        for (let k = 0; k < 6; k++) {
          const a = Math.random() * Math.PI * 2, r = 38 + Math.random() * 28;
          const x = P.body.p.x + Math.cos(a) * r, z = P.body.p.z + Math.sin(a) * r;
          const y = Phys.support(x, z, 0.3, 100);
          if (y < World.WATER + 0.3 || Phys.blocked(x - 0.3, y + 0.2, z - 0.3, x + 0.3, y + 1.8, z + 0.3)) continue;
          const w = H.wave, rr = Math.random();
          const type = rr < Math.min(0.12, 0.02 * w) ? 'brutamonte' : rr < 0.12 + Math.min(0.35, w * 0.04) ? 'corredor' : rr < 0.55 ? 'comum' : rr < 0.7 ? 'rastejante' : w > 3 && rr < 0.85 ? 'militar' : 'comum';
          const zb = Zombies.spawn(type, x, z, y);
          zb.hunter = true; zb.hp *= 1 + w * 0.04;
          H.toSpawn--;
          break;
        }
      }
      if (H.toSpawn <= 0 && alive === 0) {
        H.state = 'pause'; H.t = 20;
        UI.note('Onda ' + H.wave + ' vencida! Suprimentos lançados perto de você.', 'ok');
        this.supplyDrop();
      }
    }
  },
  supplyDrop() {
    const P = Player, p = P.body.p.clone();
    const a = Math.random() * 6.28;
    p.x += Math.cos(a) * 3; p.z += Math.sin(a) * 3;
    const tier = this.hordas.wave > 6 ? 'elite' : 'militar';
    const list = [...rollLoot(tier), ...rollLoot(tier), ...rollLoot('militar'), ...rollLoot('hospital')];
    const w = WeaponCtl.def;
    if (w && w.cal) list.push({ id: 'ammo:' + w.cal, n: Math.round(CALIBERS[w.cal].box[1] * 1.5) });
    for (const pw of [P.inv.pri, P.inv.sec]) if (pw && WEAPONS[pw.id].cal) list.push({ id: 'ammo:' + WEAPONS[pw.id].cal, n: CALIBERS[WEAPONS[pw.id].cal].box[1] });
    for (const st of list) Items.drop(st, p, 1.2);
    FX.emit('smoke', p.x, p.y + 0.5, p.z, 30, { color: 0xd04040, speed: 1, up: 2.5, grav: -0.5, life: 4 });
  },

  spawnRangeZombies() {
    const s = World.loc('estande').spawn;
    for (let i = 0; i < 10; i++) {
      const x = s.x + 35 + Math.random() * 60, z = s.z + (Math.random() - 0.5) * 30;
      const zb = Zombies.spawn(U.pick(['comum', 'comum', 'corredor', 'militar', 'rastejante', 'brutamonte']), x, z);
      zb.hunter = true;
    }
    UI.note('10 zumbis soltos no estande!', 'warn');
  },

  // ---------------------------------------------------------------- Chuva
  initRain() {
    const N = 1400, g = new THREE.BufferGeometry();
    const pos = new Float32Array(N * 6);
    this.rainDrops = [];
    for (let i = 0; i < N; i++) this.rainDrops.push([(Math.random() - 0.5) * 60, Math.random() * 30, (Math.random() - 0.5) * 60]);
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.rain = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0xaabbcc, transparent: true, opacity: 0.4, depthWrite: false }));
    this.rain.frustumCulled = false;
    this.rain.visible = false;
    this.scene.add(this.rain);
  },
  updateWeather(dt) {
    const W = this.weather;
    W.t -= dt;
    if (W.t <= 0) { W.target = Math.random() < 0.3 ? U.rand(0.5, 1) : 0; W.t = U.rand(180, 420); }
    if (this.mode === 'arsenal') W.target = 0;
    W.rain += (W.target - W.rain) * Math.min(1, dt * 0.05);
    W.wind = 0.3 + W.rain * 0.6;
    const vis = W.rain > 0.05;
    this.rain.visible = vis;
    if (vis) {
      const P = this.rain.geometry.attributes.position.array, c = this.camera.position;
      this.rain.material.opacity = W.rain * 0.45;
      for (let i = 0; i < this.rainDrops.length; i++) {
        const d = this.rainDrops[i];
        d[1] -= dt * 22;
        if (d[1] < -12) { d[1] = 18; d[0] = (Math.random() - 0.5) * 60; d[2] = (Math.random() - 0.5) * 60; }
        const x = c.x + d[0], y = c.y + d[1], z = c.z + d[2];
        P.set([x, y, z, x + W.wind * 0.3, y - 0.6, z], i * 6);
      }
      this.rain.geometry.attributes.position.needsUpdate = true;
    }
  },
  hours() { return (this.dayT * 24) % 24; },

  // ---------------------------------------------------------------- Câmera
  updateCamera(dt) {
    const P = Player, cam = this.camera, s = this.settings;
    if (this.state === 'play' && !UI.blocking()) {
      const z = WeaponCtl.zoom();
      const k = 0.0022 * s.sens / Math.max(1, z * 0.85);
      if (P.vehicle) { this.orbit = (this.orbit || 0) - Input.dx * k; this.orbitP = U.clamp((this.orbitP || 0.25) + Input.dy * k, -0.2, 1.0); }
      else { P.yaw -= Input.dx * k; P.pitch = U.clamp(P.pitch - Input.dy * k * (s.invert ? -1 : 1), -1.52, 1.52); }
      if (Input.wheel && !P.vehicle) this.cycleSlot(Input.wheel > 0 ? 1 : -1);
    }
    if (WeaponCtl.fireT < -0.06) P.recoilP -= P.recoilP * Math.min(1, dt * 7);
    this.shakeAmt *= Math.exp(-dt * 5);
    const sh = this.shakeAmt * 0.02;
    if (P.vehicle) {
      const v = P.vehicle;
      this.orbit = (this.orbit || 0) * Math.exp(-dt * (Math.abs(v.speed) > 3 ? 1.2 : 0));
      const yc = v.yaw + this.orbit, dist = 6.5 + v.hl * 0.6;
      const tgt = v.pos.clone(); tgt.y += 1.6;
      const cp = new THREE.Vector3(tgt.x + Math.sin(yc) * dist * Math.cos(this.orbitP), tgt.y + 1.0 + Math.sin(this.orbitP) * dist, tgt.z + Math.cos(yc) * dist * Math.cos(this.orbitP));
      cp.y = Math.max(cp.y, World.height(cp.x, cp.z) + 0.6, World.WATER + 0.3);
      cam.position.lerp(cp, Math.min(1, dt * 8));
      cam.lookAt(tgt);
    } else {
      const e = P.eye();
      cam.position.set(e.x + (Math.random() - 0.5) * sh, e.y + (Math.random() - 0.5) * sh, e.z + (Math.random() - 0.5) * sh);
      const lean = 0;
      cam.rotation.set(P.pitch + P.recoilP + WeaponCtl.aimSway.y, P.yaw + WeaponCtl.aimSway.x, lean, 'YXZ');
    }
    const fov = s.fov / WeaponCtl.zoom();
    if (Math.abs(cam.fov - fov) > 0.01) { cam.fov = fov; cam.updateProjectionMatrix(); }
    const fwd = new THREE.Vector3(); cam.getWorldDirection(fwd);
    Sfx.setListener(cam.position, fwd);
  },

  menuCamera(dt) {
    this.menuT += dt * 0.03;
    const L = World.loc('santacruz');
    const r = 150, a = this.menuT;
    this.camera.position.set(L.x + Math.cos(a) * r, L.h + 45, L.z + Math.sin(a) * r);
    this.camera.lookAt(L.x, L.h + 5, L.z);
    if (this.camera.fov !== 60) { this.camera.fov = 60; this.camera.updateProjectionMatrix(); }
  },

  // ---------------------------------------------------------------- Laço principal
  loop() {
    requestAnimationFrame(() => this.loop());
    const dt = Math.min(0.05, this.clock.getDelta());
    this.fpsAcc = (this.fpsAcc || 0) + dt; this.fpsN = (this.fpsN || 0) + 1;
    if (this.fpsAcc > 0.5) { document.getElementById('fps').textContent = Math.round(this.fpsN / this.fpsAcc) + ' FPS'; this.fpsAcc = 0; this.fpsN = 0; }
    if (this.state === 'menu') {
      this.menuCamera(dt);
      this.dayT = 0.36;
      this.sky = World.updateSky(this.dayT, this.camera.position, this.weather);
      World.cullTrees(this.camera.position, this.scene.fog.far + 40);
      World.updateClouds(dt, 0.3);
      FX.update(dt, this.camera.position);
      this.render();
      Input.endFrame();
      return;
    }
    if (this.state === 'play' || this.state === 'dead') this.tick(dt);
    this.render();
    Input.endFrame();
  },

  tick(dt) {
    const P = Player;
    this.time += dt;
    if (this.state === 'play' && !UI.blocking()) {
      for (const [code, k] of [['Digit1', 'pri'], ['Digit2', 'sec'], ['Digit3', 'mel'], ['Digit4', 'thr']]) if (Input.pressed(code)) this.selectSlot(k);
      if (Input.pressed('KeyG')) WeaponCtl.quickThrow();
      if (Input.pressed('KeyH')) P.quickHeal();
      if (Input.pressed('KeyV')) { if (P.count('binoculo') || P.binoc) P.binoc = !P.binoc; else UI.note('Você não tem binóculo.', 'warn'); }
      if (Input.pressed('KeyX') && WeaponCtl.cur && !P.vehicle) { P.dropStack(WeaponCtl.cur); this.cycleSlot(1); }
      if (P.binoc && (Input.mbPressed[0] || Input.mbPressed[2])) P.binoc = false;
    }
    this.updateInteract();
    P.update(dt);
    WeaponCtl.update(dt);
    Zombies.update(dt);
    Animals.update(dt);
    Vehicles.update(dt);
    Proj.update(dt);
    Items.update(dt, P.body.p);
    this.updateDoors(dt);
    if (this.mode === 'sobrevivencia') { Zombies.manage(dt); Animals.manage(dt); }
    else if (this.mode === 'hordas' && !P.dead) this.updateHordas(dt);
    else if (this.mode === 'arsenal') { Animals.manage(dt); }
    // relógio do dia
    if (this.mode !== 'arsenal' || this.dayLock === false) {
      this.dayT += dt / DAY_LEN;
      if (this.dayT >= 1) { this.dayT -= 1; this.day++; UI.note('Amanhece o dia ' + this.day + '.', 'info'); }
    }
    this.updateWeather(dt);
    this.updateCamera(dt);
    this.sky = World.updateSky(this.dayT, this.camera.position, this.weather);
    const fogMul = this.settings.dist;
    this.scene.fog.far *= fogMul; this.scene.fog.near *= fogMul;
    this.night = 1 - this.sky.day;
    World.cullTrees(this.camera.position, this.scene.fog.far + 40);
    World.updateClouds(dt, this.weather.wind);
    FX.update(dt, this.camera.position);
    for (const t of World.targets) if (t.swing > 0) { t.swing = Math.max(0, t.swing - dt * 1.5); t.mesh.rotation.z = Math.sin(t.swing * 18) * 0.35 * t.swing; }
    const indoor = !!Phys.ray(this.camera.position, new THREE.Vector3(0, 1, 0), 25, { water: false, terrain: false });
    Sfx.updateAmbient(dt, this.weather.wind, this.night, this.weather.rain, indoor);
    UI.update(dt);
    this.saveT = (this.saveT || 0) + dt;
    if (this.saveT > 30) { this.saveT = 0; this.saveGame(); }
  },

  render() {
    const r = this.renderer;
    r.clear();
    r.render(this.scene, this.camera);
    if (this.state === 'play' || this.state === 'dead' || this.state === 'paused') WeaponCtl.render(r);
  },
};

window.addEventListener('DOMContentLoaded', () => {
  Game.boot().catch((e) => {
    console.error(e);
    document.getElementById('load-text').textContent = 'Erro ao iniciar: ' + e.message + ' (seu navegador precisa de WebGL).';
  });
});
