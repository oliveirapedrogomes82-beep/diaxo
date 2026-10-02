'use strict';
// Interface: HUD, notificações, inventário, criação, mapa, arsenal, ajustes e controles por toque.

const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));

const UI = {
  open: null,
  dirty: true,
  cache: {},
  invTab: 'itens',
  arsSel: null,
  arsMode: 'browse',

  init() {
    document.addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]');
      if (b) { Sfx.ui(); Game.action(b.dataset.act, b); }
      const t = e.target.closest('[data-tab]');
      if (t) { this.invTab = t.dataset.tab; $$('.tabs button').forEach((x) => x.classList.toggle('on', x === t)); this.renderInv(); }
    });
    $('#gun-count').textContent = WEAPON_LIST.filter((w) => w.cls !== 'melee' && w.cls !== 'arremesso').length;
    this.buildCompass();
    $('#ars-search').addEventListener('input', () => this.renderArsList());
    $('#inv-body').addEventListener('click', (e) => this.invClick(e));
    $('#ars-info').addEventListener('click', (e) => this.arsClick(e));
    $('#ars-info').addEventListener('change', (e) => this.arsChange(e));
    Touch.init();
  },

  blocking() { return this.open !== null && this.open !== undefined; },
  show(id) { $('#' + id).classList.remove('hidden'); },
  hide(id) { $('#' + id).classList.add('hidden'); },

  openPanel(id) {
    for (const p of ['inv', 'map', 'arsenal', 'config', 'controles']) if (p !== id) this.hide(p);
    this.open = id;
    this.show(id);
    Game.unlock();
    if (id === 'inv') { this.renderInv(); }
    if (id === 'map') this.drawMap();
    if (id === 'config') this.renderConfig();
  },
  close() {
    for (const p of ['inv', 'map', 'arsenal', 'config', 'controles']) this.hide(p);
    const was = this.open;
    this.open = null;
    if (this.preview) this.preview.running = false;
    if (Game.state === 'play' && was !== 'pause') Game.lock();
    if (Game.state === 'paused') this.open = 'pause';
    if (Game.state === 'menu') this.open = null;
  },

  // ---------------------------------------------------------------- Notificações
  note(text, type = 'info') {
    const box = $('#notes');
    const el = document.createElement('div');
    el.className = 'note ' + type;
    el.textContent = text;
    box.appendChild(el);
    while (box.children.length > 6) box.removeChild(box.firstChild);
    setTimeout(() => el.classList.add('out'), 3800);
    setTimeout(() => el.remove(), 4500);
  },
  hurt(amount) {
    const v = $('#vign');
    v.style.transition = 'none';
    v.style.opacity = Math.min(1, 0.35 + amount / 30);
    requestAnimationFrame(() => { v.style.transition = 'opacity .6s'; v.style.opacity = Player.hp < 30 ? 0.35 : 0; });
  },
  hitmarker(head, kill) {
    const h = $('#hitm');
    h.className = 'on' + (head ? ' head' : '') + (kill ? ' kill' : '');
    clearTimeout(this.hmT);
    this.hmT = setTimeout(() => { h.className = ''; }, 90);
  },
  rangeInfo(html) {
    const r = $('#rangeinfo');
    r.innerHTML = html; r.classList.remove('hidden');
    clearTimeout(this.riT);
    this.riT = setTimeout(() => r.classList.add('hidden'), 3500);
  },
  set(id, prop, val) {
    const k = id + prop;
    if (this.cache[k] === val) return;
    this.cache[k] = val;
    const el = $(id);
    if (prop === 'text') el.textContent = val; else if (prop === 'html') el.innerHTML = val; else if (prop === 'class') el.className = val; else el.style[prop] = val;
  },

  // ---------------------------------------------------------------- HUD
  buildCompass() {
    const s = $('#compass-strip');
    const labels = { 0: 'N', 45: 'NE', 90: 'L', 135: 'SE', 180: 'S', 225: 'SO', 270: 'O', 315: 'NO' };
    this.compassW = 1440;
    let html = '';
    for (let rep = -1; rep <= 1; rep++) for (let a = 0; a < 360; a += 15) {
      const x = (rep * 360 + a) * (this.compassW / 360);
      const lb = labels[a];
      html += `<span style="left:${x}px" class="${lb ? 'c' : ''} ${a === 0 ? 'n' : ''}">${lb || (a % 45 === 0 ? '' : '·')}</span>`;
    }
    s.innerHTML = html;
  },

  update(dt) {
    const P = Player;
    const pct = (v) => U.clamp(v, 0, 100).toFixed(0) + '%';
    this.set('#s-hp i', 'width', pct(P.hp));
    this.set('#s-food i', 'width', pct(P.food));
    this.set('#s-water i', 'width', pct(P.water));
    this.set('#s-stam i', 'width', pct(P.stamina));
    this.set('#s-imm i', 'width', pct(P.immune));
    this.set('#s-hp', 'class', 'stat' + (P.hp < 30 ? ' low' : ''));
    this.set('#s-food', 'class', 'stat' + (P.food < 15 ? ' low' : ''));
    this.set('#s-water', 'class', 'stat' + (P.water < 15 ? ' low' : ''));
    this.set('#s-imm', 'class', 'stat' + (P.immune < 20 ? ' low' : ''));
    for (const id of ['#s-food', '#s-water', '#s-imm']) this.set(id, 'display', Game.survival ? 'flex' : 'none');
    let st = '';
    if (P.bleeding) st += '<span>🩸 Sangrando</span>';
    if (P.leg) st += '<span>🦴 Perna quebrada</span>';
    if (P.swimming) st += '<span class="buff">🌊 Nadando</span>';
    if (P.buffs.energia > 0) st += '<span class="buff">⚡ Energia</span>';
    if (P.buffs.adrenalina > 0) st += '<span class="buff">💉 Adrenalina</span>';
    if (P.stance !== 'stand') st += `<span class="buff">${P.stance === 'crouch' ? 'Agachado' : 'Deitado'}</span>`;
    this.set('#status', 'html', st);
    // arma
    const h = WeaponCtl.hud();
    this.set('#w-name', 'text', h.name);
    this.set('#w-ammo', 'text', h.ammo);
    this.set('#w-ammo', 'class', h.low ? 'low' : '');
    let sub = h.sub;
    if (WeaponCtl.reload) sub = 'Recarregando…';
    else if (WeaponCtl.cycleT > 0) sub = WeaponCtl.def.action === 'pump' ? 'Bombeando…' : 'Manejando…';
    this.set('#w-sub', 'text', sub);
    this.set('#w-mode', 'text', h.mode + (WeaponCtl.tacOn && (WeaponCtl.mods.light || WeaponCtl.mods.laser) ? ' · ' + (WeaponCtl.mods.light ? 'LANTERNA' : 'LASER') : ''));
    if (this.dirty) { this.renderHotbar(); this.dirty = false; if (this.open === 'inv') this.renderInv(); }
    // mira
    const W = WeaponCtl;
    const scoped = W.scoped();
    const ads = W.isGun() && W.adsT > 0.85;
    const cross = $('#cross');
    if (!W.isGun()) { cross.className = 'dot'; cross.style.display = P.vehicle ? 'none' : ''; }
    else {
      cross.className = '';
      cross.style.display = ads || P.vehicle || P.binoc ? 'none' : '';
      const fov = Game.camera.fov;
      const gap = Math.max(4, (Math.tan(U.deg(W.currentSpread())) / Math.tan(U.deg(fov / 2))) * (innerHeight / 2));
      if (Math.abs((this.lastGap || 0) - gap) > 0.5) {
        this.lastGap = gap;
        $('#cross .t').style.top = -(gap + 9) + 'px'; $('#cross .b').style.top = gap + 'px';
        $('#cross .l').style.left = -(gap + 9) + 'px'; $('#cross .r').style.left = gap + 'px';
      }
    }
    const ret = $('#reticle');
    const rt = W.isGun() && ads && !scoped && W.mods.ret && !W.mods.scope ? W.mods.ret : '';
    this.set('#reticle', 'class', rt);
    ret.style.display = rt ? 'block' : 'none';
    const sc = $('#scope');
    if (scoped) {
      if (this.scopeRet !== W.mods.ret) this.drawScope(W.mods.ret);
      sc.style.display = 'block';
      sc.style.transform = `translate(calc(-50% + ${W.aimSway.x * 3000}px), calc(-50% + ${-W.aimSway.y * 3000}px))`;
    } else sc.style.display = 'none';
    $('#binoc').style.display = P.binoc ? 'block' : 'none';
    // bússola
    const heading = ((-U.deg(1) * 0 + (-Player.yaw * 180) / Math.PI) % 360 + 360) % 360;
    const cw = $('#compass').clientWidth;
    $('#compass-strip').style.transform = `translateX(${cw / 2 - heading * (this.compassW / 360)}px)`;
    // relógio
    const hrs = Game.hours();
    this.set('#clock-time', 'text', String(Math.floor(hrs)).padStart(2, '0') + ':' + String(Math.floor((hrs % 1) * 60)).padStart(2, '0'));
    this.set('#clock-day', 'text', 'Dia ' + Game.day + (Game.weather.rain > 0.3 ? ' · chuva' : ''));
    const loc = World.locAt(P.body.p.x, P.body.p.z);
    this.set('#loc-name', 'text', loc ? loc.name : '');
    // interação
    const pr = Game.prompt;
    if (pr) { this.set('#prompt', 'html', `<kbd>E</kbd>${U.esc(pr)}`); $('#prompt').classList.remove('hidden'); }
    else $('#prompt').classList.add('hidden');
    // barra de uso
    let ub = null;
    if (P.using) ub = [itemDef(P.using.st.id).name, 1 - P.using.t / P.using.total];
    else if (W.reload && W.reload.kind === 'mag') ub = ['Recarregando', W.reload.t / W.reload.T];
    else if (W.def && W.def.id === 'arco' && W.bowDraw > 0) ub = ['Tensionando', W.bowDraw / W.def.draw];
    if (ub) { $('#usebar').classList.remove('hidden'); this.set('#use-label', 'text', ub[0]); this.set('#use-fill', 'width', (U.clamp(ub[1], 0, 1) * 100).toFixed(0) + '%'); }
    else $('#usebar').classList.add('hidden');
    // veículo
    const v = P.vehicle;
    if (v) {
      $('#veh').classList.remove('hidden');
      this.set('#veh', 'html', `<div><b>${Math.round(Math.abs(v.speed) * 3.6)}</b> km/h</div>
        <div class="mini">⛽ Combustível<div class="bar"><i style="width:${(v.fuel / v.def.fuel) * 100}%;background:#e8c13d"></i></div></div>
        <div class="mini">🔧 Lataria<div class="bar"><i style="width:${(v.hp / v.def.hp) * 100}%;background:#9cc25a"></i></div></div>
        <div>${v.def.name}${v.lights ? ' · 💡' : ''}</div>`);
      $('#weapon').classList.add('hidden'); $('#hotbar').classList.add('hidden');
    } else { $('#veh').classList.add('hidden'); $('#weapon').classList.remove('hidden'); $('#hotbar').classList.remove('hidden'); }
  },

  renderHotbar() {
    const inv = Player.inv;
    if (!inv) return;
    const names = { pri: ['1', 'Primária'], sec: ['2', 'Secundária'], mel: ['3', 'Corpo a corpo'], thr: ['4', 'Arremesso'] };
    let html = '';
    for (const k of ['pri', 'sec', 'mel', 'thr']) {
      const st = inv[k];
      const on = WeaponCtl.cur && WeaponCtl.cur === st;
      html += `<div class="slot ${on ? 'on' : ''} ${st ? '' : 'empty'}"><b>${names[k][0]}</b><div>${st ? U.esc(WEAPONS[st.id].name) + (st.n > 1 && k === 'thr' ? ' ×' + st.n : '') : names[k][1]}</div></div>`;
    }
    $('#hotbar').innerHTML = html;
  },

  drawScope(ret) {
    this.scopeRet = ret;
    const c = $('#scope').getContext('2d'), S = 1024, R = 380;
    c.clearRect(0, 0, S, S);
    c.fillStyle = '#000';
    c.beginPath(); c.rect(0, 0, S, S); c.arc(S / 2, S / 2, R, 0, Math.PI * 2, true); c.fill();
    const g = c.createRadialGradient(S / 2, S / 2, R * 0.8, S / 2, S / 2, R);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,.85)');
    c.fillStyle = g; c.beginPath(); c.arc(S / 2, S / 2, R, 0, Math.PI * 2); c.fill();
    c.strokeStyle = '#111'; c.fillStyle = '#111';
    const cx = S / 2, cy = S / 2;
    if (ret === 'mil' || ret === 'susat') {
      c.lineWidth = 6;
      c.beginPath(); c.moveTo(cx - R, cy); c.lineTo(cx - 60, cy); c.moveTo(cx + 60, cy); c.lineTo(cx + R, cy); c.moveTo(cx, cy + 60); c.lineTo(cx, cy + R); c.moveTo(cx, cy - R); c.lineTo(cx, cy - 60); c.stroke();
      c.lineWidth = 1.5;
      c.beginPath(); c.moveTo(cx - 60, cy); c.lineTo(cx + 60, cy); c.moveTo(cx, cy - 60); c.lineTo(cx, cy + 60); c.stroke();
      if (ret === 'mil') for (let i = -4; i <= 4; i++) { if (!i) continue; c.beginPath(); c.arc(cx + i * 14, cy, 2.5, 0, 7); c.arc(cx, cy + i * 14, 2.5, 0, 7); c.fill(); }
      if (ret === 'susat') { c.fillStyle = '#111'; c.beginPath(); c.moveTo(cx, cy); c.lineTo(cx - 8, cy + 60); c.lineTo(cx + 8, cy + 60); c.fill(); }
    } else if (ret === 'acog') {
      c.strokeStyle = '#e03030'; c.lineWidth = 4;
      c.beginPath(); c.moveTo(cx - 22, cy + 16); c.lineTo(cx, cy); c.lineTo(cx + 22, cy + 16); c.stroke();
      c.strokeStyle = '#111'; c.lineWidth = 2;
      c.beginPath(); c.moveTo(cx, cy + 4); c.lineTo(cx, cy + 150); c.stroke();
      for (let i = 1; i <= 5; i++) { const w = 26 - i * 3; c.beginPath(); c.moveTo(cx - w, cy + i * 26); c.lineTo(cx + w, cy + i * 26); c.stroke(); }
      c.lineWidth = 5; c.beginPath(); c.moveTo(cx - R, cy); c.lineTo(cx - 120, cy); c.moveTo(cx + 120, cy); c.lineTo(cx + R, cy); c.stroke();
    } else if (ret === 'pso') {
      c.strokeStyle = '#d02020'; c.fillStyle = '#d02020'; c.lineWidth = 3;
      c.beginPath(); c.moveTo(cx - 14, cy + 14); c.lineTo(cx, cy); c.lineTo(cx + 14, cy + 14); c.stroke();
      for (let i = 1; i <= 3; i++) { c.beginPath(); c.moveTo(cx - 9, cy + 20 + i * 26); c.lineTo(cx, cy + 6 + i * 26); c.lineTo(cx + 9, cy + 20 + i * 26); c.stroke(); }
      c.beginPath(); c.moveTo(cx - 160, cy); c.lineTo(cx - 30, cy); c.moveTo(cx + 30, cy); c.lineTo(cx + 160, cy); c.stroke();
      for (let i = 1; i <= 5; i++) { c.beginPath(); c.moveTo(cx - 30 - i * 26, cy); c.lineTo(cx - 30 - i * 26, cy - 10); c.moveTo(cx + 30 + i * 26, cy); c.lineTo(cx + 30 + i * 26, cy - 10); c.stroke(); }
      c.lineWidth = 1.5;
      c.beginPath(); c.moveTo(cx - 150, cy + 130); c.quadraticCurveTo(cx - 60, cy + 60, cx - 30, cy + 140); c.stroke();
    }
  },

  // ---------------------------------------------------------------- Inventário
  itemLine(st, where) {
    const d = itemDef(st.id);
    if (!d) return '';
    const icon = d.type === 'weapon' ? (d.cls === 'melee' ? '🔪' : d.cls === 'arremesso' ? '💣' : '🔫') : d.icon || '•';
    let sub = '';
    if (d.type === 'weapon' && d.cls !== 'melee' && !d.stack) sub = `${CALIBERS[d.cal].name} · ${st.ammo ?? 0}/${weaponCap(d, st)}`;
    else if (d.type === 'weapon' && d.cls === 'melee') sub = `Dano ${d.dmg}`;
    else if (d.type === 'ammo') sub = `${st.n} cartuchos`;
    else if (d.type === 'bag' || d.type === 'vest') sub = `+${d.cap} espaços` + (d.armor ? ` · proteção ${Math.round(d.armor * 100)}%` : '');
    else if (d.type === 'helmet') sub = `proteção ${Math.round(d.armor * 100)}%`;
    else if (d.type === 'attach') sub = SLOT_NAMES[d.slot] + (d.zoom ? ` · ${d.zoom}×` : '');
    else {
      const fx = [];
      if (d.health) fx.push('+' + d.health + ' vida'); if (d.food > 0) fx.push('+' + d.food + ' comida'); if (d.water > 0) fx.push('+' + d.water + ' água');
      if (d.immune) fx.push((d.immune > 0 ? '+' : '') + d.immune + ' imunidade'); if (d.bleed) fx.push('estanca'); if (d.leg) fx.push('trata fratura'); if (d.stamina) fx.push('+energia');
      sub = fx.join(' · ');
    }
    const cnt = st.n > 1 && d.type !== 'ammo' ? ` ×${st.n}` : '';
    return { icon, name: d.name + cnt, sub, d };
  },

  renderInv() {
    const body = $('#inv-body');
    $('#tab-arsenal').classList.toggle('hidden', !Game.infinite);
    if (this.invTab === 'criar') return this.renderCraft(body);
    if (this.invTab === 'arsenal') { this.openArsenal('pick'); return; }
    const P = Player, inv = P.inv;
    this.invRefs = [];
    const ref = (o) => { this.invRefs.push(o); return this.invRefs.length - 1; };
    let eq = '';
    const slots = [['pri', 'Primária'], ['sec', 'Secundária'], ['mel', 'Corpo a corpo'], ['thr', 'Arremesso'], ['mochila', 'Mochila'], ['colete', 'Colete'], ['capacete', 'Capacete']];
    for (const [k, lbl] of slots) {
      const st = inv[k];
      if (!st) { eq += `<div class="it empty"><div class="ic">·</div><div class="nm"><span class="slotlbl">${lbl}</span><b>vazio</b></div></div>`; continue; }
      const L = this.itemLine(st);
      const r = ref({ st, slot: k });
      eq += `<div class="it"><div class="ic">${L.icon}</div><div class="nm"><span class="slotlbl">${lbl}</span><b>${U.esc(L.name)}</b><small>${U.esc(L.sub)}</small></div>
        <div class="act">${['pri', 'sec', 'mel', 'thr'].includes(k) ? `<button data-i="${r}" data-a="sel" class="pri">Usar</button>` : ''}<button data-i="${r}" data-a="uneq">Guardar</button><button data-i="${r}" data-a="drop">Largar</button></div></div>`;
      const d = WEAPONS[st.id];
      if (d && d.rails && st.att) {
        let atts = '';
        for (const s of ['opt', 'muz', 'und', 'tac', 'mag']) {
          const integ = d.integ && d.integ[s];
          if (!d.rails[s] && !integ) continue;
          const a = st.att[s];
          if (integ) atts += `<div class="att"><span>${SLOT_NAMES[s]}: <b>${U.esc(s === 'opt' ? INTEG_OPT[integ].name : 'Supressor integrado')}</b></span><span>fixo</span></div>`;
          else atts += `<div class="att"><span>${SLOT_NAMES[s]}: <b>${a ? U.esc(ATTACH[a].name) : '—'}</b></span>${a ? `<button class="btn" data-i="${ref({ st, slot: s })}" data-a="detach">Remover</button>` : ''}</div>`;
        }
        if (atts) eq += `<div class="atts">${atts}</div>`;
      }
    }
    const used = P.used(), cap = P.capacity();
    let bag = '';
    inv.bag.forEach((st) => {
      const L = this.itemLine(st);
      const r = ref({ st });
      let acts = '';
      const d = L.d;
      if (['food', 'drink', 'med'].includes(d.type)) acts += `<button data-i="${r}" data-a="use" class="pri">Usar</button>`;
      else if (d.type === 'weapon' || d.type === 'bag' || d.type === 'vest' || d.type === 'helmet') acts += `<button data-i="${r}" data-a="equip" class="pri">Equipar</button>`;
      else if (d.type === 'attach') {
        for (const k of ['pri', 'sec']) {
          const w = inv[k];
          if (w && attachFits(WEAPONS[w.id], st.id)) acts += `<button data-i="${r}" data-a="attach-${k}" class="pri">Instalar (${k === 'pri' ? 'prim.' : 'sec.'})</button>`;
        }
      } else if (['galao', 'ferramentas', 'binoculo'].includes(st.id)) acts += `<button data-i="${r}" data-a="use" class="pri">Usar</button>`;
      acts += `<button data-i="${r}" data-a="drop">Largar</button>`;
      if (st.n > 1) acts += `<button data-i="${r}" data-a="drop1">−1</button>`;
      bag += `<div class="it"><div class="ic">${L.icon}</div><div class="nm"><b>${U.esc(L.name)}</b><small>${U.esc(L.sub)}</small></div><div class="act">${acts}</div></div>`;
    });
    if (!bag) bag = '<div class="it empty"><div class="nm"><b>Mochila vazia</b><small>Saqueie casas, delegacias e bases militares.</small></div></div>';
    let ground = '';
    const near = Items.near(P.body.p, 2.8);
    this.nearRefs = near;
    near.forEach((it, i) => {
      const L = this.itemLine(it.st);
      ground += `<div class="it"><div class="ic">${L.icon}</div><div class="nm"><b>${U.esc(L.name)}</b><small>${U.esc(L.sub)}</small></div><div class="act"><button data-g="${i}" class="pri">Pegar</button></div></div>`;
    });
    if (!ground) ground = '<div class="it empty"><div class="nm"><b>Nada por perto</b></div></div>';
    body.innerHTML = `<div class="cols">
      <div class="col"><h3>Equipamento <span>Proteção ${Math.round(P.armor() * 100)}%</span></h3><div class="list">${eq}</div></div>
      <div class="col"><h3>Mochila <span>${used}/${cap}</span></h3><div class="cap"><i style="width:${Math.min(100, (used / cap) * 100)}%"></i></div><div class="list">${bag}</div></div>
      <div class="col"><h3>Chão <button class="btn" data-g="all">Pegar tudo</button></h3><div class="list">${ground}</div></div></div>`;
  },

  invClick(e) {
    const b = e.target.closest('button');
    if (!b) return;
    const P = Player;
    if (b.dataset.g !== undefined) {
      const list = b.dataset.g === 'all' ? this.nearRefs.slice() : [this.nearRefs[+b.dataset.g]];
      for (const it of list) if (it) P.pickup(it);
      this.renderInv(); return;
    }
    if (b.dataset.craft !== undefined) { Game.craft(RECIPES[+b.dataset.craft]); this.renderInv(); return; }
    const r = this.invRefs && this.invRefs[+b.dataset.i];
    if (!r) return;
    const a = b.dataset.a;
    if (a === 'use') P.use(r.st);
    else if (a === 'equip') P.equip(r.st);
    else if (a === 'uneq') P.unequip(r.slot);
    else if (a === 'drop') P.dropStack(r.st);
    else if (a === 'drop1') P.dropStack(r.st, 1);
    else if (a === 'sel') { Game.selectSlot(r.slot, true); this.close(); return; }
    else if (a === 'detach') {
      const aid = r.st.att[r.slot];
      if (P.free() < 1) { this.note('Sem espaço para guardar o acessório.', 'warn'); return; }
      delete r.st.att[r.slot];
      P.inv.bag.push({ id: aid, n: 1 });
      if (r.slot === 'mag') r.st.ammo = Math.min(r.st.ammo, WEAPONS[r.st.id].mag);
      if (WeaponCtl.cur === r.st) WeaponCtl.refresh();
    } else if (a.startsWith('attach-')) {
      const k = a.slice(7), w = P.inv[k], aid = r.st.id, slot = ATTACH[aid].slot;
      const old = w.att[slot];
      w.att[slot] = aid;
      P.consume(r.st);
      if (old) P.inv.bag.push({ id: old, n: 1 });
      if (slot === 'mag' && old === 'extmag') w.ammo = Math.min(w.ammo, weaponCap(WEAPONS[w.id], w));
      if (WeaponCtl.cur === w) WeaponCtl.refresh();
      Sfx.click(1600, 0.3);
      this.note(ATTACH[aid].name + ' instalado(a) em ' + WEAPONS[w.id].name, 'ok');
    }
    this.dirty = true;
    this.renderInv();
  },

  renderCraft(body) {
    let html = '<p style="color:var(--mut);margin:0 0 10px">Combine materiais encontrados pela ilha. Ferramentas não são consumidas.</p>';
    RECIPES.forEach((r, i) => {
      const od = itemDef(r.out[0]);
      const ok = Game.canCraft(r);
      const req = r.in.map(([id, n]) => { const have = Player.count(id); return `<span class="${have >= n ? 'ok' : 'no'}">${n}× ${U.esc(itemDef(id).name)} (${have})</span>`; }).join(' + ');
      const tool = r.tool ? ` · ferramenta: <span class="${Player.count(r.tool) ? 'ok' : 'no'}">${U.esc(itemDef(r.tool).name)}</span>` : '';
      html += `<div class="recipe"><div class="nm"><b>${r.out[1]}× ${U.esc(od.name)}</b><div class="req">${req}${tool}</div></div><button class="btn ${ok ? 'pri' : ''}" data-craft="${i}" ${ok ? '' : 'disabled'}>Criar</button></div>`;
    });
    body.innerHTML = html;
  },

  // ---------------------------------------------------------------- Mapa
  buildMapImage() {
    const S = 500, cv = document.createElement('canvas');
    cv.width = cv.height = S;
    const c = cv.getContext('2d');
    const img = c.createImageData(S, S);
    const scale = World.SIZE / S;
    for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
      const x = -World.HALF + (i + 0.5) * scale, z = -World.HALF + (j + 0.5) * scale;
      const h = World.height(x, z);
      let r, g, b;
      if (h < World.WATER) { const d = U.clamp(-h / 16, 0, 1); r = 40 - d * 20; g = 100 - d * 40; b = 140 - d * 40; }
      else if (h < 2.4) { r = 205; g = 190; b = 140; }
      else { const t = U.clamp(h / 45, 0, 1); r = 80 + t * 70; g = 120 + t * 30; b = 60 + t * 50; }
      const sh = (World.height(x - 2, z - 2) - h) * 6;
      const k = (j * S + i) * 4;
      img.data[k] = U.clamp(r - sh, 0, 255); img.data[k + 1] = U.clamp(g - sh, 0, 255); img.data[k + 2] = U.clamp(b - sh, 0, 255); img.data[k + 3] = 255;
    }
    c.putImageData(img, 0, 0);
    c.lineCap = 'round';
    for (const r of World.roads) {
      if (r.kind === 'estande') continue;
      c.strokeStyle = r.kind === 'asfalto' ? '#3a3a3a' : '#8a7448'; c.lineWidth = r.kind === 'asfalto' ? 3 : 2;
      c.beginPath();
      r.S.forEach((s, i) => { const px = (s.x + World.HALF) / scale, pz = (s.z + World.HALF) / scale; if (i) c.lineTo(px, pz); else c.moveTo(px, pz); });
      c.stroke();
    }
    this.mapImg = cv;
  },
  drawMap() {
    if (!this.mapImg) this.buildMapImage();
    const cv = $('#map-canvas'), c = cv.getContext('2d'), S = cv.width, k = S / 500, scale = World.SIZE / S;
    c.imageSmoothingEnabled = true;
    c.drawImage(this.mapImg, 0, 0, S, S);
    const P = (x, z) => [(x + World.HALF) / scale, (z + World.HALF) / scale];
    // grade
    c.strokeStyle = 'rgba(255,255,255,.08)'; c.lineWidth = 1;
    for (let g = 0; g <= S; g += S / 10) { c.beginPath(); c.moveTo(g, 0); c.lineTo(g, S); c.moveTo(0, g); c.lineTo(S, g); c.stroke(); }
    for (const l of World.locations) {
      const [x, y] = P(l.x, l.z);
      c.fillStyle = l.type === 'militar' ? '#e2513f' : l.type === 'estande' ? '#e8a33d' : '#f1ede0';
      c.beginPath(); c.arc(x, y, 6, 0, 7); c.fill();
      c.font = '600 22px system-ui'; c.textAlign = 'center';
      const ly = l.type === 'estande' ? y + 28 : y - 12;
      c.lineWidth = 4; c.strokeStyle = 'rgba(0,0,0,.7)'; c.strokeText(l.name, x, ly); c.fillText(l.name, x, ly);
    }
    for (const v of Vehicles.list) { if (v.dead) continue; const [x, y] = P(v.pos.x, v.pos.z); c.fillStyle = '#7ab8e0'; c.fillRect(x - 5, y - 5, 10, 10); }
    // jogador
    const [px, py] = P(Player.body.p.x, Player.body.p.z);
    c.save(); c.translate(px, py); c.rotate(-Player.yaw);
    c.fillStyle = '#e8a33d'; c.strokeStyle = '#000'; c.lineWidth = 3;
    c.beginPath(); c.moveTo(0, -16); c.lineTo(10, 12); c.lineTo(0, 6); c.lineTo(-10, 12); c.closePath(); c.stroke(); c.fill();
    c.restore();
    c.fillStyle = 'rgba(0,0,0,.6)'; c.fillRect(10, S - 40, 360, 30);
    c.fillStyle = '#fff'; c.font = '16px system-ui'; c.textAlign = 'left';
    c.fillText('▲ você   ■ veículos   ● locais   (N para cima)', 18, S - 20);
  },

  // ---------------------------------------------------------------- Arsenal
  openArsenal(mode) {
    this.arsMode = mode;
    $('#ars-title').textContent = mode === 'pick' ? 'Arsenal — escolha sua arma' : 'Arsenal';
    this.openPanel('arsenal');
    this.renderArsList();
    if (!this.arsSel) this.arsSel = 'ak47';
    this.selectArs(this.arsSel);
  },
  renderArsList() {
    const q = $('#ars-search').value.trim().toLowerCase();
    let html = '';
    for (const cls in CLASSES) {
      const ws = WEAPON_LIST.filter((w) => w.cls === cls && (!q || (w.name + ' ' + (w.origin || '') + ' ' + (w.cal ? CALIBERS[w.cal].name : '')).toLowerCase().includes(q)));
      if (!ws.length) continue;
      html += `<h4>${CLASSES[cls]} (${ws.length})</h4>`;
      for (const w of ws) html += `<button data-ars="${w.id}" class="${w.id === this.arsSel ? 'on' : ''}">${U.esc(w.name)}<small>${w.cal ? U.esc(CALIBERS[w.cal].name.split(' ')[0]) : ''}</small></button>`;
    }
    const list = $('#ars-list');
    list.innerHTML = html || '<p style="color:var(--mut)">Nada encontrado.</p>';
    list.onclick = (e) => { const b = e.target.closest('[data-ars]'); if (b) { Sfx.ui(); this.selectArs(b.dataset.ars); $$('#ars-list button').forEach((x) => x.classList.toggle('on', x === b)); } };
  },
  selectArs(id) {
    this.arsSel = id;
    const w = WEAPONS[id];
    this.arsAtt = Object.assign({}, w.def || {});
    this.renderArsInfo();
    this.showPreview();
  },
  renderArsInfo() {
    const w = WEAPONS[this.arsSel];
    let html = `<h3>${U.esc(w.name)}</h3><div class="meta">${CLASSES[w.cls]}${w.origin ? ' · ' + U.esc(w.origin) : ''}${w.year ? ' · ' + w.year : ''}</div><p>${U.esc(w.d || '')}</p>`;
    const bar = (lbl, v, txt) => `<span>${lbl}</span><div class="b"><i style="width:${U.clamp(v, 0.02, 1) * 100}%"></i></div><span>${txt}</span>`;
    if (w.cls === 'melee') {
      html += `<div class="sbars">${bar('Dano', w.dmg / 120, w.dmg)}${bar('Velocidade', 1 - (w.rate - 0.4) / 1.1, w.rate.toFixed(2) + ' s')}${bar('Alcance', w.range / 2.4, w.range + ' m')}</div>`;
    } else if (w.cls === 'arremesso') {
      html += `<div class="facts">${w.fuse ? `<div><b>Espoleta</b>${w.fuse} s</div><div><b>Dano</b>${w.dmg}</div><div><b>Raio letal</b>${w.radius} m</div>` : `<div><b>Fogo</b>${w.fire.r} m por ${w.fire.t} s</div>`}</div>`;
    } else {
      const c = CALIBERS[w.cal];
      const dmg = c.boom ? c.boom.dmg : c.dmg * w.dmgMul * (w.pellets || 1);
      html += `<div class="sbars">
        ${bar('Dano', dmg / 230, Math.round(dmg) + (w.pellets ? ` (${w.pellets}×${c.dmg})` : ''))}
        ${bar('Cadência', w.rpm / 1200, w.rpm + ' t/min')}
        ${bar('Precisão', 1 - w.spread[1] / 1.6, w.spread[1] + '°')}
        ${bar('Velocidade', c.vel * w.velMul / 950, Math.round(c.vel * w.velMul) + ' m/s')}
        ${bar('Controle', 1 - w.recoil[0] / 6.5, w.recoil[0] + '°')}
        ${bar('Mobilidade', (w.move - 0.78) / 0.22, Math.round(w.move * 100) + '%')}</div>
        <div class="facts"><div><b>Calibre</b>${U.esc(c.name)}</div><div><b>Capacidade</b>${w.mag} tiros</div>
        <div><b>Modos</b>${w.modes.map((m) => MODE_LABEL[m]).join(' / ')}</div>
        <div><b>Ação</b>${w.action === 'bolt' ? 'Ferrolho' : w.action === 'pump' ? 'Bombeamento' : w.action === 'lever' ? 'Alavanca' : 'Automática / semi'}</div>
        <div><b>Recarga</b>${w.reloadType === 'shell' ? 'Um a um (' + w.shellTime + ' s)' : w.reloadType === 'clip' ? 'Pente de ' + w.clip : w.reloadType === 'enbloc' ? 'Pente en-bloc' : w.reload + ' s'}</div>
        <div><b>Encaixe</b>${w.slot === 'pri' ? 'Primária' : 'Secundária'}</div></div>`;
      const slots = ['opt', 'muz', 'und', 'tac', 'mag'].filter((s) => w.rails[s]);
      if (slots.length) html += `<div class="meta">Acessórios: ${slots.map((s) => SLOT_NAMES[s]).join(', ')}</div>`;
      if (this.arsMode === 'pick') {
        html += '<div class="ars-actions">';
        for (const s of slots) {
          const opts = Object.keys(ATTACH).filter((a) => ATTACH[a].slot === s && attachFits(w, a));
          if (!opts.length) continue;
          html += `<label>${SLOT_NAMES[s]} <select data-slot="${s}"><option value="">—</option>${opts.map((a) => `<option value="${a}" ${this.arsAtt[s] === a ? 'selected' : ''}>${U.esc(ATTACH[a].name)}</option>`).join('')}</select></label>`;
        }
        html += '</div>';
      }
    }
    if (this.arsMode === 'pick') html += `<div class="ars-actions"><button class="mbtn primary" data-take="1">Equipar ${U.esc(w.name)}</button></div>`;
    $('#ars-info').innerHTML = html;
  },
  arsChange(e) {
    const s = e.target.closest('select');
    if (!s) return;
    if (s.value) this.arsAtt[s.dataset.slot] = s.value; else delete this.arsAtt[s.dataset.slot];
    this.showPreview();
  },
  arsClick(e) {
    const b = e.target.closest('[data-take]');
    if (!b) return;
    Game.giveWeapon(this.arsSel, this.arsAtt);
    this.close();
  },
  showPreview() {
    const cv = $('#ars-canvas');
    if (!this.preview) {
      const r = new THREE.WebGLRenderer({ canvas: cv, antialias: true, alpha: true });
      r.setPixelRatio(Math.min(2, devicePixelRatio));
      const sc = new THREE.Scene();
      sc.add(new THREE.HemisphereLight(0xffffff, 0x404040, 1.6));
      const dl = new THREE.DirectionalLight(0xffffff, 2.2); dl.position.set(1, 2, 1.5); sc.add(dl);
      const cam = new THREE.PerspectiveCamera(30, cv.width / cv.height, 0.01, 50);
      this.preview = { r, sc, cam, obj: null, running: false, t: 0 };
    }
    const pv = this.preview;
    if (pv.obj) pv.sc.remove(pv.obj);
    const w = WEAPONS[this.arsSel];
    let obj;
    if (w.cls === 'melee' || w.cls === 'arremesso') { obj = new THREE.Group(); const m = new THREE.Mesh(Models.weapon(w.id).body, MAT.gun); m.rotation.z = -Math.PI / 2; obj.add(m); }
    else obj = Models.weaponGroup({ id: w.id, att: this.arsAtt, ammo: 1 }).group;
    const holder = new THREE.Group(); holder.add(obj);
    const box = new THREE.Box3().setFromObject(obj), ctr = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3());
    obj.position.sub(ctr);
    pv.sc.add(holder); pv.obj = holder;
    const L = Math.max(size.x, size.y, size.z, 0.15);
    const asp = (cv.clientWidth || 640) / (cv.clientHeight || 300);
    const hf = Math.tan(U.deg(15)) * Math.min(asp, 2.2);
    const dist = Math.max((L / 2 / hf) * 1.2, (Math.max(size.y, 0.1) / 2 / Math.tan(U.deg(15))) * 1.3);
    pv.cam.position.set(0, dist * 0.18, dist);
    pv.cam.lookAt(0, 0, 0);
    if (!pv.running) {
      pv.running = true;
      const loop = () => {
        if (!pv.running) return;
        pv.t += 0.01;
        pv.obj.rotation.y = Math.PI / 2 + Math.sin(pv.t) * 0.7;
        pv.r.setSize(cv.clientWidth || 640, cv.clientHeight || 300, false);
        pv.cam.aspect = (cv.clientWidth || 640) / (cv.clientHeight || 300); pv.cam.updateProjectionMatrix();
        pv.r.render(pv.sc, pv.cam);
        requestAnimationFrame(loop);
      };
      loop();
    }
  },

  // ---------------------------------------------------------------- Ajustes
  renderConfig() {
    const s = Game.settings;
    const bind = (id, key, fmt) => {
      const el = $('#c-' + id), out = $('#o-' + id);
      el.value = s[key]; out.textContent = fmt(s[key]);
      el.oninput = () => { s[key] = +el.value; out.textContent = fmt(s[key]); Game.applySettings(); };
    };
    bind('sens', 'sens', (v) => v.toFixed(2));
    bind('fov', 'fov', (v) => v + '°');
    bind('vol', 'vol', (v) => Math.round(v * 100) + '%');
    bind('dist', 'dist', (v) => Math.round(v * 100) + '%');
    bind('res', 'res', (v) => Math.round(v * 100) + '%');
    for (const [id, key] of [['shadow', 'shadows'], ['invert', 'invert'], ['fps', 'fps']]) {
      const el = $('#c-' + id); el.checked = !!s[key];
      el.onchange = () => { s[key] = el.checked; Game.applySettings(); };
    }
  },
};

// ---------------------------------------------------------------- Controles por toque
const Touch = {
  on: false, move: { x: 0, y: 0 }, fire: false, ads: false, sprint: false, jump: false,
  init() {
    this.on = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window && navigator.maxTouchPoints > 0;
    if (!this.on) return;
    document.body.classList.add('touch');
    const stick = $('#t-stick'), knob = $('#t-stick i');
    let sid = null, sx = 0, sy = 0;
    stick.addEventListener('pointerdown', (e) => { sid = e.pointerId; const r = stick.getBoundingClientRect(); sx = r.left + r.width / 2; sy = r.top + r.height / 2; stick.setPointerCapture(sid); this.stickMove(e, sx, sy, knob); });
    stick.addEventListener('pointermove', (e) => { if (e.pointerId === sid) this.stickMove(e, sx, sy, knob); });
    const end = (e) => { if (e.pointerId === sid) { sid = null; this.move.x = this.move.y = 0; knob.style.transform = ''; } };
    stick.addEventListener('pointerup', end); stick.addEventListener('pointercancel', end);
    // olhar: arrastar no restante da tela
    let lid = null, lx = 0, ly = 0;
    const view = $('#view');
    view.addEventListener('pointerdown', (e) => { if (e.pointerType !== 'touch' || Game.state !== 'play') return; lid = e.pointerId; lx = e.clientX; ly = e.clientY; });
    window.addEventListener('pointermove', (e) => { if (e.pointerId !== lid) return; Input.dx += (e.clientX - lx) * 2.2; Input.dy += (e.clientY - ly) * 2.2; lx = e.clientX; ly = e.clientY; });
    window.addEventListener('pointerup', (e) => { if (e.pointerId === lid) lid = null; });
    for (const b of $$('#t-buttons button')) {
      const t = b.dataset.t;
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault(); Sfx.init();
        if (t === 'fire') this.fire = true;
        else if (t === 'ads') { this.ads = !this.ads; b.classList.toggle('on', this.ads); }
        else if (t === 'sprint') { this.sprint = !this.sprint; b.classList.toggle('on', this.sprint); }
        else if (t === 'jump') this.jump = true;
        else if (t === 'reload') Input.tap('KeyR');
        else if (t === 'use') Input.tap('KeyE');
        else if (t === 'crouch') Input.tap('KeyC');
        else if (t === 'switch') Game.cycleSlot(1);
        else if (t === 'inv') Input.tap('Tab');
        else if (t === 'heal') Input.tap('KeyH');
      });
      b.addEventListener('pointerup', () => { if (t === 'fire') this.fire = false; });
      b.addEventListener('pointercancel', () => { if (t === 'fire') this.fire = false; });
    }
    $('#touch-menu').addEventListener('click', () => Game.pause());
  },
  stickMove(e, sx, sy, knob) {
    let dx = (e.clientX - sx) / 50, dy = (e.clientY - sy) / 50;
    const l = Math.hypot(dx, dy); if (l > 1) { dx /= l; dy /= l; }
    this.move.x = dx; this.move.y = -dy;
    knob.style.transform = `translate(${dx * 38}px, ${dy * 38}px)`;
  },
  show(v) {
    if (!this.on) return;
    $('#touch').classList.toggle('hidden', !v);
    $('#touch-menu').classList.toggle('hidden', !v);
  },
};
