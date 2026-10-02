'use strict';
// Áudio procedural (WebAudio): tiros, recarga, zumbis, explosões, passos e ambiente.
// Nenhum arquivo de som: tudo é sintetizado na hora.

const Sfx = {
  ctx: null,
  master: null,
  volume: 0.8,
  noise: null,
  ambient: null,

  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.volume;
    // Compressor evita estouro quando muitos sons tocam juntos.
    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.knee.value = 10; comp.ratio.value = 6;
    comp.attack.value = 0.002; comp.release.value = 0.2;
    this.master.connect(comp); comp.connect(this.ctx.destination);
    const len = this.ctx.sampleRate * 2;
    this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    // Ruído marrom (mais grave) para vento e explosões.
    this.brown = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const b = this.brown.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; b[i] = last * 3.5; }
  },

  setVolume(v) { this.volume = v; if (this.master) this.master.gain.value = v; },

  setListener(pos, fwd) {
    if (!this.ctx) return;
    const l = this.ctx.listener, t = this.ctx.currentTime;
    if (l.positionX) {
      l.positionX.setTargetAtTime(pos.x, t, 0.02); l.positionY.setTargetAtTime(pos.y, t, 0.02); l.positionZ.setTargetAtTime(pos.z, t, 0.02);
      l.forwardX.setTargetAtTime(fwd.x, t, 0.02); l.forwardY.setTargetAtTime(fwd.y, t, 0.02); l.forwardZ.setTargetAtTime(fwd.z, t, 0.02);
      l.upX.value = 0; l.upY.value = 1; l.upZ.value = 0;
    } else {
      l.setPosition(pos.x, pos.y, pos.z);
      l.setOrientation(fwd.x, fwd.y, fwd.z, 0, 1, 0);
    }
  },

  // Saída: direta (som do próprio jogador) ou posicional.
  out(pos, ref = 4, max = 250) {
    if (!pos) return this.master;
    const p = this.ctx.createPanner();
    p.panningModel = 'equalpower';
    p.distanceModel = 'inverse';
    p.refDistance = ref; p.maxDistance = max; p.rolloffFactor = 1.1;
    if (p.positionX) { p.positionX.value = pos.x; p.positionY.value = pos.y; p.positionZ.value = pos.z; }
    else p.setPosition(pos.x, pos.y, pos.z);
    p.connect(this.master);
    return p;
  },

  // Rajada de ruído filtrado com envelope.
  burst(dest, { t = 0, dur = 0.1, vol = 0.5, type = 'lowpass', f = 1000, q = 0.7, f2 = null, attack = 0.002, buf = null }) {
    const c = this.ctx, now = c.currentTime + t;
    const src = c.createBufferSource();
    src.buffer = buf || this.noise;
    src.playbackRate.value = 0.9 + Math.random() * 0.2;
    const fl = c.createBiquadFilter();
    fl.type = type; fl.frequency.setValueAtTime(f, now); fl.Q.value = q;
    if (f2) fl.frequency.exponentialRampToValueAtTime(Math.max(20, f2), now + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(vol, now + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    src.connect(fl); fl.connect(g); g.connect(dest);
    src.start(now, Math.random() * Math.max(0, 1.9 - dur)); src.stop(now + dur + 0.05);
  },

  tone(dest, { t = 0, dur = 0.2, vol = 0.3, type = 'sine', f = 200, f2 = null, attack = 0.005 }) {
    const c = this.ctx, now = c.currentTime + t;
    const o = c.createOscillator();
    o.type = type; o.frequency.setValueAtTime(f, now);
    if (f2) o.frequency.exponentialRampToValueAtTime(Math.max(10, f2), now + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(vol, now + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    o.connect(g); g.connect(dest);
    o.start(now); o.stop(now + dur + 0.05);
  },

  // Perfil de tiro: energia (dano) + classe da arma definem estampido, corpo e cauda.
  shot(w, suppressed, pos) {
    if (!this.ctx) return;
    const d = this.out(pos, 8, 500);
    const e = U.clamp(w.snd || 40, 10, 220);
    const k = e / 60; // 0.2 .. 3.6
    if (suppressed) {
      this.burst(d, { dur: 0.07 + k * 0.03, vol: 0.32, type: 'bandpass', f: 900 + 300 / k, q: 1.2, f2: 300 });
      this.burst(d, { dur: 0.03, vol: 0.2, type: 'highpass', f: 3000 });
      this.tone(d, { dur: 0.06, vol: 0.12, f: 180, f2: 60 });
      return;
    }
    const pistol = w.cls === 'pistola' || w.cls === 'revolver' || w.cls === 'smg';
    this.burst(d, { dur: 0.05 + k * 0.015, vol: 0.9, type: 'highpass', f: pistol ? 1600 : 1100 });
    this.burst(d, { dur: 0.16 + k * 0.08, vol: 0.85, type: 'lowpass', f: pistol ? 3200 : 2400, f2: 400 });
    this.tone(d, { dur: 0.14 + k * 0.06, vol: 0.55 + Math.min(0.35, k * 0.12), type: 'triangle', f: 150 - Math.min(70, k * 20), f2: 35 });
    // Cauda/eco: armas grandes ecoam mais.
    this.burst(d, { t: 0.02, dur: 0.5 + k * 0.45, vol: 0.18 + Math.min(0.25, k * 0.07), type: 'lowpass', f: 650, f2: 120, attack: 0.03, buf: this.brown });
    if (w.cls === 'espingarda') this.burst(d, { dur: 0.3, vol: 0.5, type: 'lowpass', f: 900, f2: 150, buf: this.brown });
  },

  launch(pos) {
    if (!this.ctx) return;
    const d = this.out(pos, 6, 300);
    this.burst(d, { dur: 0.6, vol: 0.7, type: 'bandpass', f: 600, q: 0.6, f2: 2200 });
    this.tone(d, { dur: 0.2, vol: 0.5, type: 'triangle', f: 90, f2: 40 });
  },
  thump(pos) { // M79 / lançadores de 40 mm
    if (!this.ctx) return;
    const d = this.out(pos, 5, 200);
    this.tone(d, { dur: 0.18, vol: 0.7, type: 'triangle', f: 110, f2: 45 });
    this.burst(d, { dur: 0.12, vol: 0.4, type: 'lowpass', f: 900 });
  },
  bowRelease(pos) {
    if (!this.ctx) return;
    const d = this.out(pos, 4, 60);
    this.tone(d, { dur: 0.12, vol: 0.25, type: 'triangle', f: 160, f2: 80 });
    this.burst(d, { dur: 0.1, vol: 0.25, type: 'bandpass', f: 1500, q: 2 });
  },

  explosion(pos, big = 1) {
    if (!this.ctx) return;
    const d = this.out(pos, 15, 900);
    this.burst(d, { dur: 0.3, vol: 1, type: 'lowpass', f: 3000, f2: 300 });
    this.burst(d, { dur: 1.8 * big, vol: 1, type: 'lowpass', f: 500, f2: 60, buf: this.brown, attack: 0.01 });
    this.tone(d, { dur: 0.7, vol: 0.9, type: 'sine', f: 70, f2: 22 });
    this.burst(d, { t: 0.25, dur: 1.4, vol: 0.25, type: 'lowpass', f: 300, f2: 80, buf: this.brown, attack: 0.1 });
  },

  click(f = 2000, vol = 0.25, t = 0, pos = null) {
    if (!this.ctx) return;
    this.burst(this.out(pos), { t, dur: 0.025, vol, type: 'bandpass', f, q: 3 });
  },
  dry() { this.click(3200, 0.3); },
  modeSwitch() { this.click(2600, 0.2); this.click(1800, 0.15, 0.05); },
  magOut(t = 0) { this.click(1400, 0.3, t); this.burst(this.master, { t: t + 0.02, dur: 0.12, vol: 0.12, type: 'bandpass', f: 700, q: 1 }); },
  magIn(t = 0) { this.click(1100, 0.35, t); this.click(2400, 0.3, t + 0.06); },
  bolt(t = 0) {
    this.click(1600, 0.3, t);
    if (this.ctx) this.burst(this.master, { t: t + 0.02, dur: 0.1, vol: 0.12, type: 'bandpass', f: 2200, q: 1.5 });
    this.click(2600, 0.32, t + 0.16);
  },
  pump(t = 0) {
    if (!this.ctx) return;
    this.burst(this.master, { t, dur: 0.09, vol: 0.3, type: 'bandpass', f: 900, q: 1.5 });
    this.click(1500, 0.35, t + 0.08);
    this.burst(this.master, { t: t + 0.14, dur: 0.08, vol: 0.3, type: 'bandpass', f: 1200, q: 1.5 });
    this.click(2200, 0.35, t + 0.21);
  },
  shell(t = 0) { this.click(1300, 0.28, t); this.click(800, 0.18, t + 0.04); },
  casing(t = 0.35) {
    if (!this.ctx) return;
    this.tone(this.master, { t, dur: 0.08, vol: 0.04, f: 4200 + Math.random() * 1500 });
    this.tone(this.master, { t: t + 0.12, dur: 0.06, vol: 0.025, f: 3600 + Math.random() * 1500 });
  },
  swing() { if (this.ctx) this.burst(this.master, { dur: 0.18, vol: 0.25, type: 'bandpass', f: 500, q: 1, f2: 1600 }); },
  melee(pos) { if (this.ctx) { const d = this.out(pos); this.tone(d, { dur: 0.1, vol: 0.4, type: 'triangle', f: 140, f2: 60 }); this.burst(d, { dur: 0.08, vol: 0.4, type: 'lowpass', f: 1200 }); } },

  hit(head) {
    if (!this.ctx) return;
    if (head) this.tone(this.master, { dur: 0.12, vol: 0.18, type: 'square', f: 1900, f2: 1400 });
    else this.click(1400, 0.15);
  },
  impact(pos, kind) {
    if (!this.ctx) return;
    const d = this.out(pos, 2, 60);
    if (kind === 'metal') this.tone(d, { dur: 0.25, vol: 0.2, type: 'square', f: 1400 + Math.random() * 600, f2: 900 });
    else this.burst(d, { dur: 0.06, vol: 0.18, type: 'bandpass', f: kind === 'wood' ? 700 : 1800, q: 1 });
  },
  hurt() {
    if (!this.ctx) return;
    this.tone(this.master, { dur: 0.25, vol: 0.3, type: 'sawtooth', f: 260, f2: 140 });
    this.burst(this.master, { dur: 0.15, vol: 0.3, type: 'lowpass', f: 600 });
  },
  step(kind = 'grass', vol = 0.12) {
    if (!this.ctx) return;
    const f = kind === 'hard' ? 1600 : kind === 'wood' ? 700 : kind === 'water' ? 900 : 420;
    this.burst(this.master, { dur: kind === 'water' ? 0.18 : 0.07, vol, type: kind === 'water' ? 'bandpass' : 'lowpass', f, q: 0.8 });
  },
  zombie(pos, pitch = 1, kind = 'groan') {
    if (!this.ctx) return;
    const c = this.ctx, d = this.out(pos, 3, 80), now = c.currentTime;
    const dur = kind === 'attack' ? 0.45 : kind === 'die' ? 1.0 : 0.8 + Math.random() * 0.6;
    const o = c.createOscillator();
    o.type = 'sawtooth';
    const base = (kind === 'attack' ? 180 : 95) * pitch * (0.85 + Math.random() * 0.3);
    o.frequency.setValueAtTime(base, now);
    o.frequency.linearRampToValueAtTime(base * (kind === 'die' ? 0.5 : 0.8), now + dur);
    const lfo = c.createOscillator(), lg = c.createGain();
    lfo.frequency.value = 6 + Math.random() * 6; lg.gain.value = base * 0.08;
    lfo.connect(lg); lg.connect(o.frequency);
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 600 + Math.random() * 400; bp.Q.value = 2;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(kind === 'attack' ? 0.5 : 0.35, now + 0.08);
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    o.connect(bp); bp.connect(g); g.connect(d);
    o.start(now); lfo.start(now); o.stop(now + dur + 0.05); lfo.stop(now + dur + 0.05);
    this.burst(d, { dur: dur * 0.8, vol: 0.08, type: 'bandpass', f: 1200, q: 0.8, attack: 0.1 });
  },
  pickup() { if (this.ctx) { this.click(900, 0.2); this.click(1500, 0.15, 0.05); } },
  ui() { if (this.ctx) this.tone(this.master, { dur: 0.05, vol: 0.06, type: 'square', f: 900 }); },
  eat() { if (this.ctx) for (let i = 0; i < 3; i++) this.burst(this.master, { t: i * 0.18, dur: 0.1, vol: 0.2, type: 'bandpass', f: 500, q: 1 }); },
  drink() { if (this.ctx) for (let i = 0; i < 3; i++) this.tone(this.master, { t: i * 0.2, dur: 0.12, vol: 0.12, f: 300, f2: 180 }); },
  bandage() { if (this.ctx) for (let i = 0; i < 4; i++) this.burst(this.master, { t: i * 0.12, dur: 0.09, vol: 0.15, type: 'highpass', f: 2500 }); },
  door(open) { if (this.ctx) { this.tone(this.master, { dur: 0.3, vol: 0.06, type: 'sawtooth', f: open ? 300 : 220, f2: open ? 420 : 160 }); this.click(700, 0.3, open ? 0 : 0.25); } },
  splash(pos) { if (this.ctx) this.burst(this.out(pos, 3, 80), { dur: 0.35, vol: 0.3, type: 'bandpass', f: 900, q: 0.6, f2: 400 }); },
  fire(pos) { if (this.ctx) this.burst(this.out(pos, 4, 60), { dur: 1.2, vol: 0.35, type: 'lowpass', f: 1200, f2: 400, attack: 0.1 }); },
  pin() { this.click(3000, 0.25); this.click(2200, 0.2, 0.15); },
  bounce(pos) { this.click(1100, 0.2, 0, pos); },
  horn(pos) {
    if (!this.ctx) return;
    const d = this.out(pos, 6, 200);
    this.tone(d, { dur: 0.6, vol: 0.25, type: 'square', f: 420 }); this.tone(d, { dur: 0.6, vol: 0.2, type: 'square', f: 530 });
  },

  // Motor de veículo contínuo.
  engine() {
    if (!this.ctx) return null;
    const c = this.ctx;
    const o1 = c.createOscillator(), o2 = c.createOscillator();
    o1.type = 'sawtooth'; o2.type = 'square';
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 500;
    const g = c.createGain(); g.gain.value = 0;
    o1.connect(lp); o2.connect(lp); lp.connect(g); g.connect(this.master);
    o1.start(); o2.start();
    return {
      set(rpm, load) {
        const t = c.currentTime;
        o1.frequency.setTargetAtTime(28 + rpm * 70, t, 0.05);
        o2.frequency.setTargetAtTime(14 + rpm * 35, t, 0.05);
        lp.frequency.setTargetAtTime(300 + rpm * 900 + load * 300, t, 0.05);
        g.gain.setTargetAtTime(0.06 + load * 0.06, t, 0.05);
      },
      stop() { const t = c.currentTime; g.gain.setTargetAtTime(0, t, 0.1); o1.stop(t + 0.5); o2.stop(t + 0.5); },
    };
  },

  // Vento ambiente (loop) com intensidade ajustável.
  startAmbient() {
    if (!this.ctx || this.ambient) return;
    const c = this.ctx;
    const src = c.createBufferSource(); src.buffer = this.brown; src.loop = true;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 500;
    const g = c.createGain(); g.gain.value = 0.05;
    src.connect(lp); lp.connect(g); g.connect(this.master); src.start();
    const rs = c.createBufferSource(); rs.buffer = this.noise; rs.loop = true;
    const rf = c.createBiquadFilter(); rf.type = 'highpass'; rf.frequency.value = 1800;
    const rg = c.createGain(); rg.gain.value = 0;
    rs.connect(rf); rf.connect(rg); rg.connect(this.master); rs.start();
    this.ambient = { g, lp, rg };
    this.nextCricket = 0;
  },
  updateAmbient(dt, wind, night, rain, indoor) {
    if (!this.ambient) return;
    const t = this.ctx.currentTime;
    this.ambient.g.gain.setTargetAtTime((0.03 + wind * 0.06) * (indoor ? 0.4 : 1), t, 0.5);
    this.ambient.lp.frequency.setTargetAtTime(300 + wind * 500, t, 0.5);
    this.ambient.rg.gain.setTargetAtTime(rain * (indoor ? 0.03 : 0.09), t, 0.5);
    if (night > 0.5 && !rain) {
      this.nextCricket -= dt;
      if (this.nextCricket <= 0) {
        this.nextCricket = 0.4 + Math.random() * 2.5;
        const f = 4200 + Math.random() * 600;
        for (let i = 0; i < 3; i++) this.tone(this.master, { t: i * 0.07, dur: 0.04, vol: 0.012, f });
      }
    }
  },
};
