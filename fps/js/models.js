'use strict';
// Modelos procedurais em low-poly: armas, acessórios, itens, zumbis, animais e veículos.
// Tudo é montado com caixas e cilindros e mesclado numa única geometria com cores por vértice.

const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _s = new THREE.Vector3();
const _n3 = new THREE.Matrix3(), _col = new THREE.Color();

const UNIT = {
  box: new THREE.BoxGeometry(1, 1, 1).toNonIndexed(),
  cyl6: new THREE.CylinderGeometry(1, 1, 1, 6).toNonIndexed(),
  cyl8: new THREE.CylinderGeometry(1, 1, 1, 8).toNonIndexed(),
  cyl12: new THREE.CylinderGeometry(1, 1, 1, 12).toNonIndexed(),
  cone8: new THREE.CylinderGeometry(0, 1, 1, 8).toNonIndexed(),
  sph: new THREE.IcosahedronGeometry(1, 1).toNonIndexed(),
  sph0: new THREE.IcosahedronGeometry(1, 0).toNonIndexed(),
};

// Construtor de geometria: acumula primitivas transformadas com cor.
class GB {
  constructor() { this.p = []; this.n = []; this.c = []; }
  add(geo, m, color) {
    const P = geo.attributes.position, N = geo.attributes.normal;
    _n3.getNormalMatrix(m);
    _col.set(color);
    for (let i = 0; i < P.count; i++) {
      _v.fromBufferAttribute(P, i).applyMatrix4(m);
      this.p.push(_v.x, _v.y, _v.z);
      _v.fromBufferAttribute(N, i).applyMatrix3(_n3).normalize();
      this.n.push(_v.x, _v.y, _v.z);
      this.c.push(_col.r, _col.g, _col.b);
    }
    return this;
  }
  _mat(x, y, z, sx, sy, sz, rx = 0, ry = 0, rz = 0) {
    _e.set(rx, ry, rz); _q.setFromEuler(_e);
    return _m4.compose(_v.set(x, y, z), _q, _s.set(sx, sy, sz));
  }
  // Caixa centrada em (x,y,z).
  box(w, h, d, x, y, z, color, rx = 0, ry = 0, rz = 0) { return this.add(UNIT.box, this._mat(x, y, z, w, h, d, rx, ry, rz), color); }
  // Caixa definida por cantos.
  aabb(x0, y0, z0, x1, y1, z1, color) {
    return this.box(Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0), (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, color);
  }
  // Cilindro ao longo do eixo Z (padrão), X ou Y.
  cyl(r, len, x, y, z, color, axis = 'z', seg = 8, r2 = null) {
    const g = seg === 6 ? UNIT.cyl6 : seg === 12 ? UNIT.cyl12 : UNIT.cyl8;
    const rx = axis === 'z' ? Math.PI / 2 : 0, rz = axis === 'x' ? Math.PI / 2 : 0;
    if (r2 !== null) {
      const cg = new THREE.CylinderGeometry(r2, r, 1, seg).toNonIndexed();
      return this.add(cg, this._mat(x, y, z, 1, len, 1, rx, 0, rz), color);
    }
    return this.add(g, this._mat(x, y, z, r, len, r, rx, 0, rz), color);
  }
  cylR(r, len, x, y, z, color, rx, ry, rz, seg = 8) {
    const g = seg === 6 ? UNIT.cyl6 : seg === 12 ? UNIT.cyl12 : UNIT.cyl8;
    return this.add(g, this._mat(x, y, z, r, len, r, rx, ry, rz), color);
  }
  sph(r, x, y, z, color, sy = 1, low = false) { return this.add(low ? UNIT.sph0 : UNIT.sph, this._mat(x, y, z, r, r * sy, r), color); }
  cone(r, h, x, y, z, color, rx = 0, rz = 0) { return this.add(UNIT.cone8, this._mat(x, y, z, r, h, r, rx, 0, rz), color); }
  // Triângulo com normal plana (a ordem dos vértices define a face).
  tri(a, b, c, color) {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    _col.set(color);
    for (const p of [a, b, c]) { this.p.push(p[0], p[1], p[2]); this.n.push(nx, ny, nz); this.c.push(_col.r, _col.g, _col.b); }
    return this;
  }
  quad(a, b, c, d, color) { this.tri(a, b, c, color); return this.tri(a, c, d, color); }
  // Prisma triangular (telhado de duas águas) com cumeeira ao longo de X ou Z.
  prism(x0, x1, z0, z1, y0, y1, color, axis = 'x', gable = null) {
    if (axis === 'x') {
      const zc = (z0 + z1) / 2;
      this.quad([x0, y0, z0], [x0, y1, zc], [x1, y1, zc], [x1, y0, z0], color);
      this.quad([x1, y0, z1], [x1, y1, zc], [x0, y1, zc], [x0, y0, z1], color);
      const g = gable ?? color;
      this.tri([x0, y0, z1], [x0, y1, zc], [x0, y0, z0], g);
      this.tri([x1, y0, z0], [x1, y1, zc], [x1, y0, z1], g);
    } else {
      const xc = (x0 + x1) / 2;
      this.quad([x1, y0, z0], [xc, y1, z0], [xc, y1, z1], [x1, y0, z1], color);
      this.quad([x0, y0, z1], [xc, y1, z1], [xc, y1, z0], [x0, y0, z0], color);
      const g = gable ?? color;
      this.tri([x0, y0, z0], [xc, y1, z0], [x1, y0, z0], g);
      this.tri([x1, y0, z1], [xc, y1, z1], [x0, y0, z1], g);
    }
    return this;
  }
  // Acrescenta outra geometria (não indexada) com transformação.
  addGeo(geo, m) {
    const P = geo.attributes.position, N = geo.attributes.normal, Cc = geo.attributes.color;
    _n3.getNormalMatrix(m);
    for (let i = 0; i < P.count; i++) {
      _v.fromBufferAttribute(P, i).applyMatrix4(m); this.p.push(_v.x, _v.y, _v.z);
      _v.fromBufferAttribute(N, i).applyMatrix3(_n3).normalize(); this.n.push(_v.x, _v.y, _v.z);
      this.c.push(Cc.getX(i), Cc.getY(i), Cc.getZ(i));
    }
    return this;
  }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
  get empty() { return this.p.length === 0; }
}

const MAT = {
  vc: new THREE.MeshLambertMaterial({ vertexColors: true }),
  vcFlat: new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }),
  vcDouble: new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide }),
  gun: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62, metalness: 0.25 }),
  flash: new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0.95, depthWrite: false, blending: THREE.AdditiveBlending }),
  lens: new THREE.MeshBasicMaterial({ color: 0x223344 }),
  colorCache: {},
  color(hex, flat = true) {
    const k = hex + (flat ? 'f' : 's');
    return this.colorCache[k] || (this.colorCache[k] = new THREE.MeshLambertMaterial({ color: hex, flatShading: flat }));
  },
};

const Models = {
  cache: {},

  // ---------------------------------------------------------------- Armas
  weapon(id) {
    if (this.cache[id]) return this.cache[id];
    const w = WEAPONS[id];
    const p = w.m || {};
    let r;
    switch (p.k) {
      case 'pistol': r = this.pistol(p); break;
      case 'revolver': r = this.revolver(p); break;
      case 'rifle': r = this.rifle(p); break;
      case 'bullpup': r = this.bullpup(p); break;
      case 'p90': r = this.p90(p); break;
      case 'rpg': r = this.rpg(p); break;
      case 'm79': r = this.m79(p); break;
      case 'm32': r = this.m32(p); break;
      case 'crossbow': r = this.crossbow(p); break;
      case 'bow': r = this.bow(p); break;
      case 'frag': case 'rgd': case 'molotov': r = this.throwable(p); break;
      default: r = this.melee(p); break;
    }
    r.body = r.gb.build();
    r.magGeo = r.mag && !r.mag.empty ? r.mag.build() : null;
    delete r.gb; delete r.mag;
    this.cache[id] = r;
    return r;
  },

  // Informações padrão de montagem (mira, cano, trilho inferior, lateral, mãos).
  info(o) {
    return Object.assign({
      muzzle: new THREE.Vector3(0, 0.04, -0.5), railY: 0.07, railZ: -0.05, sightY: 0.08, rearZ: 0.0, sightX: 0,
      under: new THREE.Vector3(0, -0.01, -0.3), side: new THREE.Vector3(0.03, 0.04, -0.3),
      support: new THREE.Vector3(0, -0.02, -0.28), magPos: new THREE.Vector3(0, 0, -0.1), len: 0.8, back: 0.3,
    }, o);
  },

  pistol(p) {
    const gb = new GB(), mag = new GB();
    const sl = p.sl || 0.19, sh = p.sh || 0.033, sw = p.sw || 0.028, gh = p.gh || 0.105;
    const fc = p.fc ?? C.BLK, sc = p.sc ?? C.BLK, gc = p.gc ?? fc;
    const ga = U.deg(p.ga ?? 18);
    const z0 = 0.045, z1 = z0 - sl, y0 = 0.012, by = y0 + sh * 0.5;
    if (p.luger) {
      gb.box(sw * 0.9, sh * 0.8, sl * 0.45, 0, y0 + sh * 0.4, z0 - sl * 0.22, sc);
      gb.cyl(0.009, sl * 0.62, 0, by, z1 + sl * 0.31, sc, 'z', 8);
      gb.box(sw * 0.7, 0.012, 0.06, 0, y0 + sh + 0.004, z0 - 0.04, sc); // articulação
      gb.sph(0.009, 0.0, y0 + sh + 0.008, z0 - 0.01, sc);
    } else if (p.c96) {
      gb.box(sw, sh * 1.1, sl * 0.55, 0, y0 + sh * 0.55, z0 - sl * 0.27, sc);
      gb.cyl(0.008, sl * 0.5, 0, by + 0.004, z1 + sl * 0.25, sc, 'z', 8);
      gb.box(sw * 0.9, 0.06, 0.05, 0, y0 - 0.025, z0 - 0.1, sc); // carregador fixo
      gb.box(0.006, 0.012, 0.01, 0, y0 + sh * 1.1 + 0.006, z1 + 0.02, sc);
    } else {
      gb.box(sw, sh, sl, 0, y0 + sh / 2, z0 - sl / 2, sc); // ferrolho
      if (p.open) gb.box(sw * 1.02, sh * 0.5, sl * 0.35, 0, y0 + sh * 0.25, z1 + sl * 0.175, sc);
      if (p.tri) gb.box(sw * 0.9, sh * 0.45, sl * 0.6, 0, y0 + sh + 0.004, z1 + sl * 0.3, sc); // trilho da Desert Eagle
      gb.cyl(0.0075, 0.01, 0, by, z1 - 0.004, 0x111111, 'z', 8);
      if (p.bl) gb.cyl(0.011, p.bl, 0, by, z1 - p.bl / 2, sc, 'z', 8);
      if (p.comp) for (let i = 0; i < 3; i++) gb.box(sw * 1.03, 0.004, 0.007, 0, y0 + sh, z1 + 0.012 + i * 0.012, 0x111111);
      // miras
      gb.box(0.004, 0.008, 0.006, 0, y0 + sh + 0.004, z1 + 0.012 - (p.bl || 0), sc);
      gb.box(0.016, 0.007, 0.006, 0, y0 + sh + 0.0035, z0 - 0.012, sc);
      // serrilhado
      for (let i = 0; i < 4; i++) gb.box(sw * 1.04, sh * 0.7, 0.002, 0, y0 + sh * 0.5, z0 - 0.01 - i * 0.008, 0x111111);
    }
    // armação
    const fl = sl * (p.c96 ? 0.6 : 0.82);
    gb.box(sw * 0.95, 0.018, fl, 0, y0 - 0.006, z0 - fl / 2 - 0.005, fc);
    if (p.rail) gb.box(sw * 0.8, 0.008, 0.05, 0, y0 - 0.019, z0 - fl + 0.03, fc);
    // guarda-mato
    gb.box(0.006, 0.004, 0.05, 0, y0 - 0.034, z0 - 0.085, fc);
    gb.box(0.006, 0.026, 0.004, 0, y0 - 0.022, z0 - 0.11, fc);
    gb.box(0.004, 0.016, 0.004, 0, y0 - 0.022, z0 - 0.075, 0x111111);
    // empunhadura inclinada
    const gx = 0, gy = y0 - gh / 2, gz = z0 - 0.035 + Math.sin(ga) * gh / 2;
    gb.box(sw * 1.05, gh, 0.045, gx, gy, gz, gc, -ga, 0, 0);
    gb.box(sw * 1.12, gh * 0.75, 0.035, gx, gy - 0.004, gz + 0.002, gc === fc ? 0x1a1a1a : gc, -ga, 0, 0);
    if (p.hammer) gb.box(0.008, 0.016, 0.01, 0, y0 + sh * 0.6, z0 + 0.008, sc, -0.4, 0, 0);
    // carregador (sai pela base do punho)
    const mh = gh * 0.95 + (p.magExt || 0);
    if (!p.c96) {
      mag.box(sw * 0.8, mh, 0.034, 0, -mh / 2, Math.sin(ga) * mh / 2, 0x1c1c1e, -ga, 0, 0);
      mag.box(sw * 0.95, 0.008, 0.04, 0, -mh + 0.004, Math.sin(ga) * mh, 0x1c1c1e, -ga, 0, 0);
    }
    const magPos = new THREE.Vector3(0, y0 - 0.01, gz - 0.002 - Math.sin(ga) * gh / 2 + 0.01);
    return {
      gb, mag, kind: 'pistol', info: this.info({
        muzzle: new THREE.Vector3(0, by, z1 - (p.bl || 0) - 0.01), railY: y0 + sh, railZ: z0 - sl / 2,
        sightY: y0 + sh + 0.007, rearZ: z0 - 0.012,
        under: new THREE.Vector3(0, y0 - 0.03, z0 - fl + 0.03), side: new THREE.Vector3(0, y0 - 0.03, z0 - fl + 0.03),
        support: new THREE.Vector3(-0.012, -0.045, 0.02), magPos, len: sl + 0.05, back: 0.06,
      }),
    };
  },

  revolver(p) {
    const gb = new GB(), mag = new GB();
    const bl = p.bl || 0.15, fc = p.fc ?? C.STL, gc = p.gc ?? C.WOOD;
    const by = 0.04;
    // armação e tambor
    gb.box(0.026, 0.05, 0.085, 0, 0.03, -0.01, fc);
    gb.box(0.024, 0.012, 0.06, 0, 0.061, -0.03, fc);
    mag.cyl(0.021, 0.042, 0, 0, 0, fc, 'z', 6);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      mag.cyl(0.0045, 0.044, Math.cos(a) * 0.012, Math.sin(a) * 0.012, 0, 0x111111, 'z', 6);
    }
    // cano
    gb.cyl(0.0095, bl, 0, by, -0.055 - bl / 2, fc, 'z', 8);
    if (p.shroud) gb.box(0.018, 0.022, bl, 0, by - 0.006, -0.055 - bl / 2, fc);
    if (p.rib) gb.box(0.008, 0.008, bl, 0, by + 0.012, -0.055 - bl / 2, fc);
    if (p.ported) for (let i = 0; i < 4; i++) gb.box(0.019, 0.005, 0.006, 0, by + 0.008, -0.055 - bl + 0.01 + i * 0.012, 0x111111);
    if (!p.shroud && !p.saa) gb.cyl(0.005, bl * 0.8, 0, by - 0.017, -0.055 - bl * 0.4, fc, 'z', 6); // vareta do extrator
    gb.box(0.004, 0.012, 0.008, 0, by + 0.016, -0.055 - bl + 0.008, fc);
    // cão e gatilho
    gb.box(0.008, 0.022, 0.012, 0, 0.065, 0.035, fc, -0.6, 0, 0);
    gb.box(0.006, 0.004, 0.04, 0, -0.012, -0.01, fc);
    gb.box(0.004, 0.018, 0.004, 0, -0.005, -0.005, 0x111111);
    // cabo
    const ga = p.saa ? 0.55 : 0.35;
    gb.box(0.03, 0.1, 0.04, 0, -0.035, 0.045, gc, -ga, 0, 0);
    return {
      gb, mag, kind: 'revolver', info: this.info({
        muzzle: new THREE.Vector3(0, by, -0.06 - bl), sightY: by + 0.024, rearZ: 0.02, railY: 0.065,
        support: new THREE.Vector3(-0.012, -0.045, 0.03), magPos: new THREE.Vector3(0, by - 0.006, -0.03), len: bl + 0.1, back: 0.07,
      }),
    };
  },

  // Gerador genérico de armas longas a partir de parâmetros.
  rifle(p) {
    const gb = new GB(), mag = new GB();
    const m = p.m ?? C.BLK, f = p.f ?? m, a = p.a ?? 0x18191c;
    const rl = p.rl || 0.32, rh = p.rh || 0.07, rw = p.rw || 0.046, rr = 0.12;
    const zr = rr, zf = rr - rl, ry0 = -0.008, ry1 = ry0 + rh, by = ry0 + rh * 0.64;
    const hl = p.ht === 'none' || !p.ht ? 0 : p.hl || 0.25;
    const bl = p.bl ?? 0.15, br = p.br || 0.011;
    const hh = rh * (p.ht === 'slim' ? 0.7 : 0.85);
    // Receptor
    if (p.round) gb.cyl(rh / 2, rl, 0, ry0 + rh / 2, (zr + zf) / 2, m, 'z', 12);
    else {
      gb.box(rw, rh * 0.55, rl, 0, ry0 + rh * 0.275, (zr + zf) / 2, m); // inferior
      gb.box(rw * 0.94, rh * 0.45, rl * 0.98, 0, ry0 + rh * 0.775, (zr + zf) / 2 - 0.002, p.ak ? m : m); // superior
      if (p.ak) { gb.box(rw * 1.02, 0.006, rl * 0.45, rw * 0.0, ry0 + rh * 0.56, zr - rl * 0.6, 0x1a1a1a); gb.box(0.012, 0.01, 0.04, rw * 0.55, ry0 + rh * 0.65, zr - rl * 0.55, m); }
      if (p.ar) {
        gb.box(rw * 0.5, rh * 0.25, 0.05, rw * 0.5, ry0 + rh * 0.62, zf + 0.12, a); // janela de ejeção
        gb.box(0.03, 0.012, 0.03, 0, ry1 - 0.002, zr - 0.012, m); // alavanca de manejo
      }
      if (p.ctube) gb.cyl(0.013, rl * 0.85 + hl * 0.6, 0, ry1 - 0.004, zf + rl * 0.42 - hl * 0.3, m, 'z', 8);
      if (p.vector) gb.box(rw * 0.95, rh * 0.45, rl * 0.45, 0, ry0 - rh * 0.2, zf + rl * 0.25, m);
    }
    // Empunhadura
    if (p.gr !== 'none') {
      const gc = p.gr === 'wood' ? (p.f ?? C.WOOD) : f === C.WOOD || f === C.WOODR || f === C.WOODL ? 0x1d1d20 : f;
      gb.box(0.032, 0.105, 0.042, 0, ry0 - 0.05, 0.05, gc, -0.3, 0, 0);
    }
    // Guarda-mato e gatilho
    const tz = p.gr === 'none' ? 0.05 : 0.0;
    gb.box(0.006, 0.004, 0.065, 0, ry0 - 0.032, tz - 0.012, m);
    gb.box(0.006, 0.03, 0.004, 0, ry0 - 0.018, tz - 0.045, m);
    gb.box(0.004, 0.02, 0.004, 0, ry0 - 0.016, tz - 0.005, 0x111111);

    // Guarda-mão
    const hz0 = zf, hz1 = zf - hl, hzc = (hz0 + hz1) / 2;
    let under = new THREE.Vector3(0, by - hh / 2 - 0.005, hz1 + hl * 0.45), support = new THREE.Vector3(0, by - hh / 2 - 0.02, hz1 + hl * 0.55);
    switch (p.ht) {
      case 'ak':
        gb.box(rw * 1.1, hh * 0.8, hl, 0, by - hh * 0.25, hzc, f);
        gb.box(rw * 0.85, hh * 0.35, hl * 0.75, 0, by + hh * 0.42, hzc + hl * 0.12, f);
        break;
      case 'wood': case 'poly': case 'slim': case 'svd': case 'aw':
        gb.box(rw * (p.ht === 'slim' ? 0.95 : 1.05), hh, hl, 0, by - hh * 0.12, hzc, p.ht === 'poly' || p.ht === 'slim' || p.ht === 'aw' ? f : f);
        if (p.ht === 'svd') for (let i = 0; i < 3; i++) gb.box(rw * 1.08, hh * 0.15, 0.03, 0, by, hz1 + 0.05 + i * 0.06, 0x111111);
        if (p.ht === 'aw') gb.box(rw * 0.9, 0.012, hl * 0.6, 0, by - hh * 0.62, hzc, a);
        break;
      case 'rail':
        gb.box(rw * 1.12, hh * 1.05, hl, 0, by - hh * 0.05, hzc, p.f === C.TAN ? C.TAN : m);
        for (let i = 0; i < Math.floor(hl / 0.02); i++) gb.box(rw * 0.7, 0.006, 0.008, 0, by + hh * 0.5, hz0 - 0.01 - i * 0.02, a);
        break;
      case 'ar':
        gb.cyl(hh * 0.62, hl, 0, by - 0.004, hzc, f, 'z', 12);
        for (let i = 0; i < 5; i++) gb.box(0.004, hh * 1.0, 0.012, hh * 0.5, by - 0.004, hz1 + hl * (0.15 + i * 0.16), a);
        break;
      case 'vent':
        gb.cyl(hh * 0.5, hl, 0, by, hzc, m, 'z', 12);
        for (let i = 0; i < Math.floor(hl / 0.03); i++) gb.box(rw * 1.05, hh * 0.32, 0.01, 0, by, hz0 - 0.02 - i * 0.03, 0x121212);
        support = new THREE.Vector3(0, by - hh * 0.6, hz0 - hl * 0.3);
        break;
      case 'metal':
        gb.box(rw * 0.9, hh * 0.8, hl, 0, by - hh * 0.15, hzc, m);
        break;
      case 'ribbed':
        gb.box(rw * 1.0, hh * 1.0, hl, 0, by - hh * 0.1, hzc, f);
        for (let i = 0; i < Math.floor(hl / 0.025); i++) gb.box(rw * 1.05, hh * 0.85, 0.006, 0, by - hh * 0.1, hz0 - 0.012 - i * 0.025, 0x111111);
        break;
      case 'pump': case 'pumpv':
        gb.box(rw * 1.05, hh * 0.75, hl * 0.8, 0, by - rh * 0.45, hz0 - hl * 0.55, f);
        if (p.ht === 'pumpv') for (let i = 0; i < 4; i++) gb.box(rw * 1.08, hh * 0.2, 0.012, 0, by - rh * 0.4, hz0 - hl * 0.25 - i * 0.04, 0x111111);
        support = new THREE.Vector3(0, by - rh * 0.65, hz0 - hl * 0.55);
        under = new THREE.Vector3(0, by - rh * 0.8, hz0 - hl * 0.55);
        break;
      case 'tube':
        gb.cyl(rh * 0.38, hl, 0, by, hzc, m, 'z', 12);
        for (let i = 0; i < 6; i++) gb.box(rh * 0.8, 0.004, hl * 0.9, 0, by, hzc, 0x111111, 0, 0, (i / 6) * Math.PI);
        break;
      case 'none': default:
        support = new THREE.Vector3(0, ry0 - 0.03, zf + 0.04);
        break;
    }
    if (p.fgrip) { // empunhadura frontal (Thompson, MP7)
      const fz = p.fgrip === 2 ? zf - 0.06 : zf - 0.01;
      gb.box(0.03, 0.09, 0.035, 0, by - 0.07, fz, p.fgrip === 2 ? f : m, -0.1, 0, 0);
      support = new THREE.Vector3(0, by - 0.1, fz);
    }
    if (p.heat) gb.box(rw * 0.7, 0.02, bl * 0.55, 0, by + 0.012, hz1 - bl * 0.3, m);

    // Cano
    const bz0 = hl ? hz1 : zf;
    const muzzleZ = bz0 - bl;
    if (p.dbl) {
      gb.cyl(br * 1.15, bl + hl * 0.9, -br * 1.1, by, bz0 - bl / 2 + hl * 0.45, m, 'z', 12);
      gb.cyl(br * 1.15, bl + hl * 0.9, br * 1.1, by, bz0 - bl / 2 + hl * 0.45, m, 'z', 12);
      gb.box(0.006, 0.006, bl + hl * 0.8, 0, by + br * 1.15, bz0 - bl / 2 + hl * 0.4, m);
    } else if (bl > 0) gb.cyl(br, bl + 0.02, 0, by, bz0 - bl / 2 + 0.01, m, 'z', 8);
    if (p.fins) for (let i = 0; i < 6; i++) gb.cyl(br * 1.7, 0.005, 0, by, bz0 - 0.01 - i * 0.012, m, 'z', 8);
    if (p.gas) gb.cyl(0.007, Math.max(0.05, hl * 0.95), 0, by + 0.024, hz0 - hl * 0.5, m, 'z', 6);
    if (p.mg === 'tube') {
      const tl = (hl + bl) * 0.85;
      gb.cyl(br * 0.95, tl, 0, by - br * 2.2, bz0 + hl - tl / 2, m, 'z', 8);
    }
    if (p.bay) gb.box(0.008, 0.012, 0.2, 0, by - 0.022, muzzleZ + 0.11, C.SIL);

    // Bocal
    let mzEnd = muzzleZ;
    switch (p.mz) {
      case 'a2': gb.cyl(br * 1.4, 0.045, 0, by, muzzleZ - 0.022, m, 'z', 8); mzEnd -= 0.045; break;
      case 'flash': gb.cyl(br * 1.5, 0.05, 0, by, muzzleZ - 0.025, a, 'z', 6); mzEnd -= 0.05; break;
      case 'slant': gb.cyl(br * 1.5, 0.03, 0, by, muzzleZ - 0.015, m, 'z', 8); mzEnd -= 0.03; break;
      case 'brake74': gb.cyl(br * 1.6, 0.07, 0, by, muzzleZ - 0.035, m, 'z', 8); gb.box(br * 3.4, 0.004, 0.012, 0, by, muzzleZ - 0.04, 0x111111); mzEnd -= 0.07; break;
      case 'brake': gb.box(br * 3.2, br * 2.4, 0.07, 0, by, muzzleZ - 0.035, a); for (let i = 0; i < 2; i++) gb.box(br * 3.4, br * 1.6, 0.008, 0, by, muzzleZ - 0.02 - i * 0.025, 0x111111); mzEnd -= 0.07; break;
      case 'barrett': gb.box(0.07, 0.04, 0.11, 0, by, muzzleZ - 0.055, m); gb.box(0.075, 0.03, 0.015, 0, by, muzzleZ - 0.035, 0x111111); gb.box(0.075, 0.03, 0.015, 0, by, muzzleZ - 0.075, 0x111111); mzEnd -= 0.11; break;
      case 'booster': gb.cyl(br * 2.2, 0.08, 0, by, muzzleZ - 0.04, m, 'z', 8); mzEnd -= 0.08; break;
      case 'cone': gb.cyl(br * 2.6, 0.07, 0, by, muzzleZ - 0.035, m, 'z', 8, br * 1.4); mzEnd -= 0.07; break;
      case 'cutts': gb.box(br * 3, br * 3, 0.05, 0, by, muzzleZ - 0.025, m); mzEnd -= 0.05; break;
      case 'tri': gb.cyl(br * 1.7, 0.03, 0, by, muzzleZ - 0.015, m, 'z', 6); mzEnd -= 0.03; break;
      case 'supplong': gb.cyl(0.024, 0.26, 0, by, bz0 - 0.13, a === 0x18191c ? 0x2a2b2f : a, 'z', 12); mzEnd = bz0 - 0.26; break;
    }

    // Coronha
    const sl = p.sl || 0.28;
    const sz0 = zr, sz1 = zr + sl;
    const sc = p.st === 'tube' || p.st === 'side' || p.st === 'skel' || p.st === 'mp5' || p.st === 'scar' || p.st === 'chassis' ? (p.f === C.TAN && p.m !== C.TAN ? C.TAN : f) : f;
    switch (p.st) {
      case 'wood': case 'ak': case 'rpk': {
        const drop = p.gr === 'none' ? 0.02 : 0.035;
        const wristZ = sz0 + sl * 0.3;
        if (p.gr === 'none') gb.box(rw * 0.9, rh * 0.85, sl * 0.4, 0, ry0 + rh * 0.3 - 0.012, sz0 + sl * 0.18, sc, 0.18, 0, 0);
        gb.box(rw * 0.95, rh * 1.25, sl * 0.72, 0, ry0 + rh * 0.35 - drop - 0.015, wristZ + sl * 0.33, sc, 0.08, 0, 0);
        gb.box(rw * 1.0, rh * 1.6, 0.02, 0, ry0 + rh * 0.3 - drop - 0.04, sz1 - 0.008, p.st === 'rpk' ? sc : 0x2a1a10, 0.08, 0, 0);
        if (p.st === 'rpk') gb.box(rw * 0.9, 0.04, 0.06, 0, ry0 - 0.03 - drop, sz1 - 0.06, sc);
        if (p.gr === 'none' || p.st === 'wood') { /* coronha clássica: já inclui o punho */ }
        if (p.gr === 'none') { // empunhadura no "punho" da coronha
          gb.box(0.03, 0.06, 0.05, 0, ry0 - 0.03, 0.05, sc, -0.35, 0, 0);
        }
        break;
      }
      case 'poly': case 'barrett': case 'mg42':
        gb.box(rw * 0.95, rh * (p.st === 'barrett' ? 0.9 : 1.15), sl * 0.85, 0, ry0 + rh * 0.4 - 0.01, sz0 + sl * 0.45, sc);
        gb.box(rw * 1.0, rh * (p.st === 'barrett' ? 1.6 : 1.45), 0.025, 0, ry0 + rh * 0.35 - 0.012, sz1 - 0.012, 0x151515);
        if (p.st === 'barrett') gb.box(0.04, 0.03, 0.06, 0, ry0 - 0.02, sz1 - 0.06, sc);
        if (p.gr === 'none') gb.box(0.03, 0.06, 0.05, 0, ry0 - 0.03, 0.05, sc, -0.35, 0, 0);
        break;
      case 'tube': case 'mp5':
        gb.cyl(0.015, sl * 0.8, 0, by - 0.01, sz0 + sl * 0.4, m, 'z', 8);
        if (p.st === 'tube') gb.box(rw * 0.9, rh * 0.95, sl * 0.45, 0, by - 0.022, sz0 + sl * 0.68, sc);
        else { gb.box(0.008, 0.008, sl, 0.018, by - 0.01, sz0 + sl / 2, m); gb.box(0.008, 0.008, sl, -0.018, by - 0.01, sz0 + sl / 2, m); }
        gb.box(rw * 0.95, rh * 1.3, 0.02, 0, by - 0.03, sz1 - 0.01, 0x151515);
        break;
      case 'a2':
        gb.box(rw * 0.95, rh * 0.9, sl * 0.9, 0, by - 0.02, sz0 + sl * 0.45, sc, 0.05, 0, 0);
        gb.box(rw * 1.0, rh * 1.5, 0.02, 0, by - 0.035, sz1 - 0.01, 0x151515);
        break;
      case 'side': case 'skel': case 'scar': case 'chassis': case 'aw':
        gb.box(rw * 0.6, 0.014, sl * 0.9, 0, by - 0.002, sz0 + sl * 0.45, sc);
        gb.box(rw * 0.6, 0.012, sl * 0.75, 0, by - rh * 0.85, sz0 + sl * 0.55, sc, 0.12, 0, 0);
        gb.box(rw * 0.9, rh * 1.35, 0.03, 0, by - rh * 0.45, sz1 - 0.015, sc);
        if (p.st === 'scar' || p.st === 'chassis' || p.st === 'aw') gb.box(rw * 0.8, 0.02, sl * 0.4, 0, by + 0.012, sz0 + sl * 0.6, sc);
        if (p.st !== 'skel') gb.box(rw * 0.7, rh * 0.5, 0.04, 0, by - rh * 0.25, sz0 + 0.02, sc);
        break;
      case 'thumb':
        gb.box(rw * 0.85, 0.022, sl * 0.95, 0, by + 0.002, sz0 + sl * 0.48, sc);
        gb.box(rw * 0.85, 0.022, sl * 0.7, 0, by - rh * 1.0, sz0 + sl * 0.6, sc, 0.1, 0, 0);
        gb.box(rw * 0.85, rh * 0.9, 0.025, 0, by - rh * 0.25, sz0 + 0.06, sc, 0.25, 0, 0);
        gb.box(rw * 0.95, rh * 1.5, 0.035, 0, by - rh * 0.45, sz1 - 0.017, sc);
        break;
      case 'fold':
        gb.box(0.006, 0.006, sl * 0.95, rw * 0.55, by - 0.005, sz0 + sl * 0.47, m);
        gb.box(0.006, 0.006, sl * 0.95, -rw * 0.55, by - 0.005, sz0 + sl * 0.47, m);
        gb.box(rw * 1.2, rh * 1.0, 0.012, 0, by - 0.02, sz1, m);
        break;
      case 'wire':
        gb.cyl(0.005, sl, 0, by - 0.005, sz0 + sl / 2, m, 'z', 6);
        gb.cyl(0.005, sl * 0.95, 0, by - rh * 0.9, sz0 + sl * 0.5, m, 'z', 6);
        gb.box(0.03, rh * 1.0, 0.01, 0, by - rh * 0.45, sz1, m);
        break;
      case 'g3':
        gb.box(rw * 0.95, rh * 1.0, sl * 0.9, 0, by - 0.012, sz0 + sl * 0.45, sc, 0.06, 0, 0);
        gb.box(rw * 1.0, rh * 1.6, 0.025, 0, by - 0.035, sz1 - 0.012, 0x151515);
        break;
      case 'none': default: break;
    }

    // Carregador
    const mgc = p.mgc ?? (p.mg === 'curved' && p.ak && f === C.WOOD ? 0x8a5a2b : 0x1e1f22);
    const ml = p.ml || 0.2, mw = p.mw || rw * 0.62;
    let magPos = new THREE.Vector3(0, ry0, zr - rl * 0.62 + (p.mz2 || 0));
    switch (p.mg) {
      case 'curved': {
        const c = p.mc ?? 1, segs = 4, seg = ml / segs;
        let y = 0, z = 0, ang = 0;
        for (let i = 0; i < segs; i++) {
          ang = 0.12 * c * (i + 0.5);
          mag.box(mw, seg * 1.04, 0.07, 0, y - seg / 2, z - Math.sin(ang) * seg * 0.5, mgc, ang, 0, 0);
          y -= Math.cos(ang) * seg; z -= Math.sin(ang) * seg;
        }
        break;
      }
      case 'stanag': mag.box(mw, ml, 0.06, 0, -ml / 2, -0.01, mgc, 0.1, 0, 0); break;
      case 'straight': mag.box(mw, ml, 0.045, 0, -ml / 2, 0, mgc, 0.05, 0, 0); break;
      case 'box': mag.box(mw * 1.05, ml, 0.075, 0, -ml / 2, 0, mgc); break;
      case 'grip': magPos = new THREE.Vector3(0, ry0, 0.05); mag.box(0.026, ml, 0.032, 0, -ml / 2, 0.012, mgc, -0.3, 0, 0); break;
      case 'drum':
        mag.box(mw, 0.05, 0.06, 0, -0.025, 0, mgc);
        mag.cyl(0.085, 0.07, 0, -0.11, 0, mgc, 'x', 12);
        break;
      case 'helical': magPos = new THREE.Vector3(0, by - 0.035, zf - 0.05); mag.cyl(0.032, ml, 0, 0, -ml / 2 + 0.06, mgc, 'z', 12); break;
      case 'side': magPos = new THREE.Vector3(-rw / 2, by, zf + rl * 0.35); mag.box(ml, 0.035, 0.04, -ml / 2, 0, 0, mgc); break;
      case 'belt':
        magPos = new THREE.Vector3(rw * 0.2, ry0 - 0.01, zr - rl * 0.55);
        mag.box(0.1, ml, 0.12, -0.02, -ml / 2, 0, p.m === C.STL ? 0x4b5038 : 0x3f4433);
        for (let i = 0; i < 5; i++) mag.box(0.01, 0.012, 0.006, 0.02, 0.0 + i * 0.008, -0.03 + i * 0.012, C.BRASS);
        break;
      case 'beltdrum': magPos = new THREE.Vector3(-rw * 0.6, ry0 + 0.01, zr - rl * 0.55); mag.cyl(0.06, 0.06, -0.03, -0.03, 0, mgc, 'x', 12); break;
      case 'pan': magPos = new THREE.Vector3(0, ry1 + 0.012, zr - rl * 0.5); mag.cyl(0.13, 0.025, 0, 0, 0, mgc, 'y', 12); mag.cyl(0.02, 0.03, 0, 0.012, 0, 0x111111, 'y', 8); break;
      case 'top_bren': {
        magPos = new THREE.Vector3(0, ry1, zr - rl * 0.5);
        for (let i = 0; i < 4; i++) { const ang = 0.15 + i * 0.12; mag.box(0.035, 0.055, 0.08, 0, 0.025 + i * 0.05, -Math.sin(ang) * i * 0.05, mgc, -ang, 0, 0); }
        break;
      }
      case 'rotary': mag.box(0.04, 0.045, 0.045, 0, -0.02, 0, mgc); break;
      case 'fixed': gb.box(rw * 0.8, 0.05, 0.08, 0, ry0 - 0.025, zr - rl * 0.62, m); break;
      case 'none': case 'tube': default: break;
    }

    // Miras e trilho superior
    let sightY = ry1 + 0.02, rearZ = zf + 0.05, sightX = 0;
    const fz = (p.ht === 'none' || !p.ht ? zf : hz1) - (p.mz === 'supplong' ? -0.05 : 0.02);
    switch (p.sg) {
      case 'ak':
        gb.box(0.022, 0.016, 0.07, 0, ry1 + 0.006, zf + 0.06, m);
        gb.box(0.006, 0.026, 0.008, 0, by + 0.028, Math.min(fz, muzzleZ + 0.03), m);
        gb.box(0.016, 0.004, 0.012, 0, by + 0.012, Math.min(fz, muzzleZ + 0.03), m);
        sightY = by + 0.04; rearZ = zf + 0.04;
        break;
      case 'carry': case 'g36': case 'aa12': {
        const h = 0.055;
        gb.box(0.016, 0.012, rl * 0.65, 0, ry1 + h, zr - rl * 0.45, m);
        gb.box(0.014, h, 0.02, 0, ry1 + h / 2, zr - rl * 0.15, m);
        gb.box(0.014, h, 0.02, 0, ry1 + h / 2, zr - rl * 0.78, m);
        if (p.sg === 'carry') gb.box(0.008, 0.06, 0.012, 0, by + 0.03, Math.min(fz, muzzleZ + 0.06), m);
        sightY = ry1 + h + 0.012; rearZ = zr - rl * 0.15;
        break;
      }
      case 'flat':
        gb.box(rw * 0.55, 0.008, rl * 0.92, 0, ry1 + 0.004, (zr + zf) / 2, a);
        gb.box(0.012, 0.026, 0.01, 0, ry1 + 0.017, zr - 0.04, a);
        gb.box(0.01, 0.03, 0.01, 0, by + 0.03, Math.min(fz, hz1 + 0.02), a);
        sightY = ry1 + 0.028; rearZ = zr - 0.04;
        break;
      case 'hood':
        gb.box(0.02, 0.022, 0.025, 0, ry1 + 0.01, zr - 0.03, m);
        gb.cyl(0.013, 0.02, 0, by + 0.034, Math.min(fz, muzzleZ + 0.04), m, 'z', 8);
        gb.box(0.004, 0.03, 0.006, 0, by + 0.02, Math.min(fz, muzzleZ + 0.04), m);
        sightY = by + 0.036; rearZ = zr - 0.03;
        if (p.ctube) sightY = ry1 + 0.024;
        break;
      case 'peep':
        gb.box(0.018, 0.03, 0.02, 0, ry1 + 0.012, zr - 0.02, m);
        gb.box(0.006, 0.028, 0.006, 0, by + 0.025, muzzleZ + 0.015, m);
        sightY = by + 0.04; rearZ = zr - 0.02;
        break;
      case 'post':
        gb.box(0.006, 0.02, 0.006, 0, ry1 + 0.006, zf + 0.02, m);
        gb.box(0.014, 0.012, 0.008, 0, ry1 + 0.004, zr - 0.02, m);
        sightY = ry1 + 0.014; rearZ = zr - 0.02;
        break;
      case 'bead':
        gb.box(0.008, 0.005, (hl + bl) * 0.9, 0, by + br + 0.003, (bz0 + hl - bl) / 2, m);
        gb.sph(0.003, 0, by + br + 0.007, muzzleZ + 0.01, C.BRASS);
        sightY = by + br + 0.008; rearZ = zr - 0.03;
        break;
      case 'offset':
        sightX = -0.055;
        gb.box(0.04, 0.008, 0.02, -0.03, ry1 + 0.01, zr - 0.04, m);
        gb.box(0.008, 0.04, 0.01, sightX, ry1 + 0.03, zr - 0.04, m);
        gb.box(0.035, 0.008, 0.012, -0.025, by + 0.01, muzzleZ + 0.1, m);
        gb.box(0.006, 0.04, 0.006, sightX, by + 0.03, muzzleZ + 0.1, m);
        sightY = ry1 + 0.05; rearZ = zr - 0.04;
        break;
      case 'none': default:
        gb.box(rw * 0.5, 0.008, rl * 0.6, 0, ry1 + 0.004, (zr + zf) / 2, a);
        sightY = ry1 + 0.03;
        break;
    }
    if (p.carry && p.sg !== 'carry' && p.sg !== 'g36' && p.sg !== 'aa12') {
      gb.box(0.014, 0.012, 0.11, rw * 0.3, ry1 + 0.04, zr - rl * 0.55, m);
      gb.box(0.012, 0.035, 0.012, rw * 0.3, ry1 + 0.02, zr - rl * 0.55 + 0.05, m);
      gb.box(0.012, 0.035, 0.012, rw * 0.3, ry1 + 0.02, zr - rl * 0.55 - 0.05, m);
    }
    if (p.bolt) {
      gb.cyl(0.009, 0.05, rw * 0.5 + 0.02, ry1 - 0.012, zr - 0.06, C.SIL, 'x', 6);
      gb.sph(0.011, rw * 0.5 + 0.046, ry1 - 0.016, zr - 0.06, m);
    }
    if (p.lever) {
      gb.box(0.008, 0.008, 0.11, 0, ry0 - 0.03, 0.02, m);
      gb.box(0.008, 0.04, 0.008, 0, ry0 - 0.05, 0.075, m);
      gb.box(0.008, 0.008, 0.06, 0, ry0 - 0.07, 0.045, m);
    }
    // Bipé (dobrado)
    if (p.bip) {
      const bzz = muzzleZ + Math.min(0.15, bl * 0.5) + (hl ? 0 : 0.05);
      gb.box(0.03, 0.02, 0.02, 0, by - 0.02, bzz, m);
      gb.cyl(0.005, 0.2, 0.012, by - 0.026, bzz + 0.1, m, 'z', 6);
      gb.cyl(0.005, 0.2, -0.012, by - 0.026, bzz + 0.1, m, 'z', 6);
    }
    const railZ = p.sg === 'carry' || p.sg === 'g36' ? zr - rl * 0.45 : (zr + zf) / 2 - (p.ak ? 0.0 : 0);
    const railY = p.sg === 'carry' || p.sg === 'g36' || p.sg === 'aa12' ? ry1 + 0.067 : ry1 + 0.008;
    return {
      gb, mag, kind: 'rifle', info: this.info({
        muzzle: new THREE.Vector3(0, by, mzEnd), railY, railZ, sightY, rearZ, sightX,
        under, side: new THREE.Vector3(rw * 0.55 + 0.012, by, hl ? hz0 - hl * 0.6 : zf - 0.02),
        support, magPos, len: zr - mzEnd, back: sl + 0.12,
      }),
    };
  },

  // Fuzis bullpup: o mecanismo e o carregador ficam atrás da empunhadura.
  bullpup(p) {
    const gb = new GB(), mag = new GB();
    const m = p.m ?? C.BLK, f = p.f ?? m, a = 0x18191c;
    const by = 0.05, br = 0.011;
    const zb = 0.43, zf = p.ksg ? -0.24 : -0.2; // coronha e frente do corpo
    const body = (h, y, z0, z1, c, w = 0.055) => gb.box(w, h, Math.abs(z1 - z0), 0, y, (z0 + z1) / 2, c);
    let sightY = by + 0.06, rearZ = 0.2, railY = by + 0.045, railZ = 0.05, magPos = new THREE.Vector3(0, -0.005, 0.2);
    let support = new THREE.Vector3(0, -0.02, -0.15), under = new THREE.Vector3(0, 0.0, -0.17);
    let bl = 0.2, muzzleExtra = 0;
    if (p.aug) {
      body(0.095, by - 0.02, zb, zf, f, 0.06);
      gb.cyl(0.045, 0.3, 0, by - 0.005, 0.25, f, 'z', 12);
      // luneta integrada com alça
      gb.box(0.02, 0.06, 0.04, 0, by + 0.05, 0.05, f); gb.box(0.02, 0.05, 0.03, 0, by + 0.045, -0.11, f);
      gb.cyl(0.022, 0.2, 0, by + 0.09, -0.03, f, 'z', 12);
      gb.cyl(0.026, 0.03, 0, by + 0.09, -0.13, f, 'z', 12);
      gb.box(0.03, 0.09, 0.035, 0, by - 0.1, -0.13, f, 0.15, 0, 0); // empunhadura frontal
      gb.box(0.08, 0.008, 0.25, 0, by - 0.075, -0.02, f); // guarda-mato grande
      sightY = by + 0.09; rearZ = 0.07; railY = by + 0.09; bl = 0.2;
      support = new THREE.Vector3(0, by - 0.12, -0.13);
    } else if (p.famas) {
      body(0.09, by - 0.02, zb, zf, f, 0.055);
      gb.box(0.03, 0.02, 0.5, 0, by + 0.09, 0.03, f); // alça longa
      gb.box(0.03, 0.08, 0.025, 0, by + 0.045, -0.2, f); gb.box(0.03, 0.06, 0.025, 0, by + 0.05, 0.25, f);
      gb.box(0.015, 0.02, 0.02, 0, by + 0.11, 0.24, f);
      gb.cyl(0.006, 0.22, 0.02, by - 0.01, -0.3, m, 'z', 6); gb.cyl(0.006, 0.22, -0.02, by - 0.01, -0.3, m, 'z', 6); // bipé dobrado
      sightY = by + 0.115; rearZ = 0.24; railY = by + 0.1; railZ = 0.0; bl = 0.18;
    } else if (p.l85) {
      body(0.085, by - 0.02, zb, zf, f, 0.052);
      gb.box(0.055, 0.04, 0.2, 0, by - 0.04, -0.25, f); // guarda-mão
      gb.box(0.02, 0.025, 0.06, 0, by + 0.035, 0.05, m);
      gb.cyl(0.024, 0.16, 0, by + 0.065, 0.04, 0x1a1a1a, 'z', 12); // SUSAT
      gb.box(0.035, 0.03, 0.08, 0, by + 0.04, 0.0, m);
      sightY = by + 0.065; rearZ = 0.12; railY = by + 0.065; bl = 0.16;
      support = new THREE.Vector3(0, by - 0.07, -0.25); under = new THREE.Vector3(0, by - 0.065, -0.26);
    } else if (p.qbz) {
      body(0.1, by - 0.02, zb, zf, f, 0.06);
      gb.box(0.025, 0.02, 0.24, 0, by + 0.075, 0.0, f); gb.box(0.025, 0.06, 0.03, 0, by + 0.04, 0.1, f); gb.box(0.025, 0.06, 0.03, 0, by + 0.04, -0.1, f);
      gb.box(0.006, 0.02, 0.008, 0, by + 0.095, -0.1, f);
      sightY = by + 0.1; rearZ = 0.1; railY = by + 0.088; bl = 0.17;
    } else if (p.tavor) {
      body(0.1, by - 0.02, zb, zf, f, 0.06);
      gb.box(0.05, 0.07, 0.14, 0, by - 0.11, -0.04, f); // guarda-mato fechado
      gb.box(0.03, 0.008, 0.35, 0, by + 0.035, 0.0, a);
      gb.box(0.012, 0.025, 0.01, 0, by + 0.05, 0.15, a); gb.box(0.01, 0.025, 0.01, 0, by + 0.05, -0.18, a);
      sightY = by + 0.062; rearZ = 0.15; railY = by + 0.04; bl = 0.14;
    } else if (p.ksg) {
      body(0.075, by + 0.005, zb, zf, f, 0.055);
      gb.cyl(0.018, 0.55, 0.018, by - 0.05, 0.0, m, 'z', 8); gb.cyl(0.018, 0.55, -0.018, by - 0.05, 0.0, m, 'z', 8);
      gb.box(0.07, 0.045, 0.12, 0, by - 0.06, -0.25, f); // telha da bomba
      gb.box(0.03, 0.008, 0.38, 0, by + 0.047, 0.0, a);
      gb.box(0.03, 0.07, 0.03, 0, by - 0.1, -0.29, f); // punho frontal
      sightY = by + 0.07; rearZ = 0.15; railY = by + 0.05; bl = 0.06;
      support = new THREE.Vector3(0, by - 0.13, -0.29);
    }
    // empunhadura e gatilho
    gb.box(0.032, 0.11, 0.045, 0, -0.05, 0.03, 0x1d1d20, -0.25, 0, 0);
    if (!p.aug && !p.tavor) { gb.box(0.006, 0.004, 0.07, 0, -0.03, -0.01, m); gb.box(0.006, 0.03, 0.004, 0, -0.016, -0.045, m); }
    gb.box(0.07, 0.11, 0.02, 0, by - 0.02, zb - 0.01, 0x151515); // soleira
    // cano
    gb.cyl(br, bl, 0, by, zf - bl / 2, m, 'z', 8);
    if (!p.ksg) { gb.cyl(br * 1.5, 0.045, 0, by, zf - bl - 0.022, a, 'z', 6); muzzleExtra = 0.045; }
    // carregador atrás do gatilho
    if (!p.ksg) {
      const mgc = p.mgc ?? 0x1e1f22;
      magPos = new THREE.Vector3(0, by - 0.06, 0.17);
      mag.box(0.028, 0.18, 0.06, 0, -0.09, -0.01, mgc, 0.12, 0, 0);
    } else magPos = new THREE.Vector3(0, by - 0.05, -0.1);
    return {
      gb, mag, kind: 'bullpup', info: this.info({
        muzzle: new THREE.Vector3(0, by, zf - bl - muzzleExtra), railY, railZ, sightY, rearZ,
        under, side: new THREE.Vector3(0.04, by, -0.17), support, magPos, len: zb - (zf - bl), back: zb + 0.05,
      }),
    };
  },

  p90(p) {
    const gb = new GB(), mag = new GB();
    const m = p.m ?? C.BLK, by = 0.04;
    gb.box(0.06, 0.1, 0.5, 0, by - 0.01, 0.1, m);
    gb.box(0.055, 0.06, 0.12, 0, by - 0.085, -0.04, m); // corpo com abertura do polegar
    gb.box(0.05, 0.03, 0.06, 0, by - 0.13, 0.02, m);
    gb.box(0.05, 0.03, 0.05, 0, by - 0.11, -0.11, m);
    gb.box(0.065, 0.12, 0.03, 0, by - 0.02, 0.34, 0x151515);
    gb.cyl(0.011, 0.07, 0, by, -0.18, m, 'z', 8);
    gb.box(0.03, 0.035, 0.08, 0, by + 0.07, 0.03, m); // mira ring sight
    gb.box(0.026, 0.02, 0.01, 0, by + 0.095, 0.0, 0x223344);
    mag.box(0.055, 0.025, 0.3, 0, 0.012, 0, 0x30353c);
    mag.box(0.04, 0.008, 0.28, 0, 0.026, 0, 0x6c6a5a);
    return {
      gb, mag, kind: 'p90', info: this.info({
        muzzle: new THREE.Vector3(0, by, -0.22), railY: by + 0.09, railZ: 0.03, sightY: by + 0.095, rearZ: 0.06,
        side: new THREE.Vector3(0.035, by, -0.14), support: new THREE.Vector3(0, by - 0.12, -0.1),
        magPos: new THREE.Vector3(0, by + 0.04, 0.12), len: 0.5, back: 0.38,
      }),
    };
  },

  rpg(p) {
    const gb = new GB(), mag = new GB();
    const by = 0.07;
    gb.cyl(0.03, 0.95, 0, by, 0.05, C.OD, 'z', 12);
    gb.cyl(0.045, 0.22, 0, by, 0.05, C.WOOD, 'z', 12); // proteção térmica
    gb.cyl(0.045, 0.12, 0, by, 0.55, C.OD, 'z', 12, 0.06);
    gb.box(0.03, 0.1, 0.045, 0, -0.04, 0.0, 0x1d1d20, -0.25, 0, 0);
    gb.box(0.03, 0.1, 0.045, 0, -0.04, -0.2, 0x1d1d20, -0.2, 0, 0);
    gb.box(0.008, 0.04, 0.008, 0, by + 0.05, -0.35, C.OD); gb.box(0.02, 0.03, 0.01, 0, by + 0.045, -0.05, C.OD);
    // foguete PG-7V
    mag.cyl(0.02, 0.15, 0, 0, 0.0, 0x4d5a3b, 'z', 8);
    mag.cyl(0.042, 0.13, 0, 0, -0.14, 0x4d5a3b, 'z', 12);
    mag.cone(0.042, 0.12, 0, 0, -0.265, 0x4d5a3b, -Math.PI / 2);
    return {
      gb, mag, kind: 'rpg', info: this.info({
        muzzle: new THREE.Vector3(0, by, -0.45), sightY: by + 0.07, rearZ: -0.05,
        support: new THREE.Vector3(0, -0.06, -0.2), magPos: new THREE.Vector3(0, by, -0.42), len: 1.0, back: 0.6,
      }),
    };
  },
  m79(p) {
    const gb = new GB(), mag = new GB();
    const by = 0.05;
    gb.cyl(0.026, 0.36, 0, by, -0.2, C.STL, 'z', 12);
    gb.box(0.05, 0.06, 0.12, 0, by - 0.01, 0.03, C.STL);
    gb.box(0.045, 0.05, 0.2, 0, by - 0.035, -0.18, C.WOOD);
    gb.box(0.042, 0.09, 0.3, 0, by - 0.03, 0.22, C.WOOD, 0.12, 0, 0);
    gb.box(0.03, 0.06, 0.05, 0, -0.03, 0.06, C.WOOD, -0.3, 0, 0);
    gb.box(0.03, 0.05, 0.01, 0, by + 0.05, -0.08, C.STL); // alça rebatível
    mag.cyl(0.021, 0.1, 0, 0, 0, 0x5c6142, 'z', 8);
    return {
      gb, mag, kind: 'm79', info: this.info({
        muzzle: new THREE.Vector3(0, by, -0.39), sightY: by + 0.075, rearZ: -0.08, support: new THREE.Vector3(0, by - 0.07, -0.18),
        magPos: new THREE.Vector3(0, by, -0.05), len: 0.75, back: 0.38,
      }),
    };
  },
  m32(p) {
    const gb = new GB(), mag = new GB();
    const by = 0.06;
    gb.cyl(0.026, 0.3, 0, by, -0.22, C.BLK, 'z', 12);
    gb.box(0.035, 0.04, 0.32, 0, by + 0.035, -0.12, C.BLK);
    mag.cyl(0.07, 0.16, 0, 0, 0, 0x2a2c30, 'z', 6);
    for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; mag.cyl(0.022, 0.165, Math.cos(a) * 0.045, Math.sin(a) * 0.045, 0, 0x111111, 'z', 8); }
    gb.box(0.03, 0.1, 0.045, 0, -0.04, 0.05, 0x1d1d20, -0.25, 0, 0);
    gb.box(0.03, 0.08, 0.04, 0, -0.03, -0.25, 0x1d1d20, -0.1, 0, 0);
    gb.cyl(0.014, 0.22, 0, by, 0.2, C.BLK, 'z', 8);
    gb.box(0.04, 0.1, 0.02, 0, by - 0.02, 0.31, 0x151515);
    gb.box(0.03, 0.03, 0.06, 0, by + 0.07, -0.05, 0x1a1a1a);
    return {
      gb, mag, kind: 'm32', info: this.info({
        muzzle: new THREE.Vector3(0, by, -0.37), sightY: by + 0.085, rearZ: -0.03, railY: by + 0.055, railZ: -0.1,
        support: new THREE.Vector3(0, -0.04, -0.25), magPos: new THREE.Vector3(0, by - 0.03, -0.02), len: 0.7, back: 0.35,
      }),
    };
  },
  crossbow(p) {
    const gb = new GB(), mag = new GB();
    const by = 0.04;
    gb.box(0.04, 0.05, 0.6, 0, by - 0.01, -0.05, C.OD);
    gb.box(0.035, 0.1, 0.045, 0, -0.04, 0.05, 0x1d1d20, -0.25, 0, 0);
    gb.box(0.04, 0.08, 0.2, 0, by - 0.03, 0.32, C.OD, 0.08, 0, 0);
    gb.box(0.5, 0.025, 0.04, 0, by + 0.005, -0.33, C.BLK); // arco
    gb.box(0.06, 0.03, 0.05, 0.22, by + 0.005, -0.31, C.BLK, 0, 0.4, 0); gb.box(0.06, 0.03, 0.05, -0.22, by + 0.005, -0.31, C.BLK, 0, -0.4, 0);
    gb.box(0.48, 0.003, 0.003, 0, by + 0.02, -0.18, 0xdddddd); // corda
    mag.cyl(0.005, 0.4, 0, 0, 0, C.SIL, 'z', 6); mag.cone(0.01, 0.03, 0, 0, -0.21, C.SIL, -Math.PI / 2);
    return {
      gb, mag, kind: 'crossbow', info: this.info({
        muzzle: new THREE.Vector3(0, by + 0.03, -0.36), sightY: by + 0.06, railY: by + 0.02, railZ: -0.02, rearZ: 0.0,
        support: new THREE.Vector3(0, by - 0.05, -0.22), magPos: new THREE.Vector3(0, by + 0.028, -0.15), len: 0.65, back: 0.4,
      }),
    };
  },
  bow(p) {
    const gb = new GB(), mag = new GB();
    // arco segurado na vertical, flecha ao longo de -Z
    gb.box(0.03, 0.14, 0.04, 0, 0.0, 0.0, C.BLK);
    gb.box(0.02, 0.32, 0.03, 0, 0.22, -0.04, C.OD, -0.2, 0, 0); gb.box(0.02, 0.32, 0.03, 0, -0.22, -0.04, C.OD, 0.2, 0, 0);
    gb.cyl(0.025, 0.02, 0, 0.38, -0.08, C.BLK, 'x', 8); gb.cyl(0.025, 0.02, 0, -0.38, -0.08, C.BLK, 'x', 8);
    gb.box(0.003, 0.76, 0.003, 0, 0.0, 0.05, 0xdddddd);
    mag.cyl(0.004, 0.7, 0, 0, 0, 0x222222, 'z', 6); mag.cone(0.009, 0.03, 0, 0, -0.36, C.SIL, -Math.PI / 2);
    mag.box(0.002, 0.02, 0.06, 0, 0.008, 0.3, 0xcc3322);
    return {
      gb, mag, kind: 'bow', info: this.info({
        muzzle: new THREE.Vector3(0, 0.03, -0.15), sightY: 0.03, rearZ: 0.05, support: new THREE.Vector3(0, 0, 0),
        magPos: new THREE.Vector3(0.012, 0.03, 0.05), len: 0.3, back: 0.1,
      }),
    };
  },
  throwable(p) {
    const gb = new GB();
    if (p.k === 'frag') { gb.sph(0.032, 0, 0.03, 0, 0x4d5a3b); gb.cyl(0.012, 0.03, 0, 0.07, 0, C.GRY, 'y', 8); gb.box(0.008, 0.06, 0.012, 0.016, 0.05, 0, C.GRY, 0, 0, -0.2); gb.cyl(0.01, 0.004, -0.014, 0.082, 0, C.SIL, 'x', 8); }
    else if (p.k === 'rgd') { gb.sph(0.03, 0, 0.035, 0, 0x5c6142, 1.3); gb.cyl(0.011, 0.025, 0, 0.08, 0, C.GRY, 'y', 8); gb.box(0.008, 0.05, 0.012, 0.015, 0.06, 0, C.GRY); }
    else { gb.cyl(0.035, 0.16, 0, 0.06, 0, 0x2f6b3a, 'y', 8); gb.cyl(0.013, 0.06, 0, 0.17, 0, 0x2f6b3a, 'y', 8); gb.box(0.03, 0.05, 0.02, 0, 0.2, 0, 0xddd2b0); }
    return { gb, mag: null, kind: 'throw', info: this.info({ support: new THREE.Vector3(0, 0, 0), len: 0.1, back: 0.05 }) };
  },
  melee(p) {
    const gb = new GB();
    const steel = 0xb5b9be, dark = 0x2b2b2e;
    switch (p.k) {
      case 'knife': gb.box(0.026, 0.11, 0.032, 0, -0.03, 0, 0x5a3b22); gb.box(0.05, 0.012, 0.035, 0, 0.03, 0, dark); gb.box(0.006, 0.18, 0.032, 0, 0.125, 0, steel); gb.box(0.006, 0.03, 0.02, 0, 0.225, 0.006, steel, 0.6, 0, 0); break;
      case 'machete': gb.box(0.028, 0.12, 0.034, 0, -0.03, 0, 0x2a2a2a); gb.box(0.005, 0.42, 0.05, 0, 0.24, 0.006, steel); gb.box(0.005, 0.05, 0.06, 0, 0.45, 0.012, steel, 0.4, 0, 0); break;
      case 'axe': gb.box(0.035, 0.7, 0.04, 0, 0.22, 0, 0x8a5a2b); gb.box(0.03, 0.12, 0.22, 0, 0.52, 0.04, C.RED); gb.box(0.025, 0.14, 0.03, 0, 0.52, 0.15, steel); gb.box(0.02, 0.06, 0.08, 0, 0.52, -0.1, C.RED); break;
      case 'bat': gb.cyl(0.018, 0.25, 0, 0.0, 0, 0x8a5a2b, 'y', 8); gb.cyl(0.032, 0.5, 0, 0.36, 0, 0x9c6534, 'y', 8, 0.024); gb.cyl(0.024, 0.02, 0, -0.13, 0, 0x8a5a2b, 'y', 8); break;
      case 'crowbar': gb.cyl(0.012, 0.6, 0, 0.18, 0, 0x7a1f1f, 'y', 6); gb.box(0.02, 0.06, 0.02, 0, 0.5, 0.025, 0x7a1f1f, 0.8, 0, 0); gb.box(0.02, 0.04, 0.02, 0, -0.13, -0.015, 0x7a1f1f, -0.4, 0, 0); break;
      case 'katana': gb.box(0.03, 0.22, 0.034, 0, 0.0, 0, 0x1a1a1f); gb.cyl(0.04, 0.008, 0, 0.115, 0, C.BRASS, 'y', 8); gb.box(0.005, 0.68, 0.03, 0, 0.46, 0.004, 0xd0d4da); break;
      case 'sledge': gb.box(0.035, 0.75, 0.04, 0, 0.25, 0, 0x9c6534); gb.box(0.07, 0.08, 0.2, 0, 0.62, 0, 0x3a3d42); break;
      case 'shovel': gb.box(0.03, 0.5, 0.035, 0, 0.15, 0, 0x5a3b22); gb.box(0.12, 0.16, 0.012, 0, 0.47, 0.01, 0x4d5a3b); gb.box(0.07, 0.025, 0.03, 0, -0.1, 0, dark); break;
    }
    return { gb, mag: null, kind: 'melee', info: this.info({ support: new THREE.Vector3(0, 0, 0), len: 0.6, back: 0.1 }) };
  },

  // ---------------------------------------------------------------- Acessórios
  attach(id) {
    const k = 'att:' + id;
    if (this.cache[k]) return this.cache[k];
    const gb = new GB();
    let h = 0; // altura da linha de visada acima do trilho
    let len = 0, eye = 0;
    const blk = 0x1c1d20;
    switch (id) {
      case 'reddot': gb.box(0.03, 0.015, 0.04, 0, 0.007, 0, blk); gb.cyl(0.018, 0.08, 0, 0.035, 0, blk, 'z', 12); h = 0.035; len = 0.08; break;
      case 'holo': gb.box(0.04, 0.015, 0.09, 0, 0.007, 0, blk); gb.box(0.045, 0.045, 0.012, 0, 0.035, -0.035, blk); gb.box(0.045, 0.045, 0.012, 0, 0.035, 0.03, blk); gb.box(0.006, 0.045, 0.07, 0.02, 0.035, 0, blk); gb.box(0.006, 0.045, 0.07, -0.02, 0.035, 0, blk); gb.box(0.045, 0.006, 0.07, 0, 0.058, 0, blk); h = 0.035; len = 0.09; break;
      case 'kobra': gb.box(0.03, 0.03, 0.08, 0.0, 0.015, 0, 0x2a2b26); gb.box(0.04, 0.05, 0.012, 0, 0.045, -0.025, 0x2a2b26); gb.box(0.04, 0.05, 0.012, 0, 0.045, 0.025, 0x2a2b26); h = 0.045; len = 0.08; break;
      case 'acog': gb.box(0.03, 0.02, 0.06, 0, 0.01, 0, blk); gb.cyl(0.02, 0.13, 0, 0.042, 0, blk, 'z', 12); gb.cyl(0.024, 0.04, 0, 0.042, -0.07, blk, 'z', 12); gb.box(0.012, 0.012, 0.03, 0, 0.068, -0.01, 0x3a3a3a); h = 0.042; len = 0.15; eye = 0.065; break;
      case 'pso1': gb.box(0.02, 0.03, 0.08, -0.015, 0.02, 0, 0x2a2b26); gb.cyl(0.02, 0.2, -0.025, 0.055, 0, 0x2a2b26, 'z', 12); gb.cyl(0.026, 0.05, -0.025, 0.055, -0.11, 0x2a2b26, 'z', 12); gb.cyl(0.024, 0.08, -0.025, 0.055, 0.12, 0x111111, 'z', 12); h = 0.055; len = 0.26; eye = 0.16; break;
      case 'scope8': case 'scope10': case 'scope12': {
        const L = id === 'scope8' ? 0.3 : id === 'scope10' ? 0.33 : 0.36, R = id === 'scope12' ? 0.032 : 0.028;
        gb.box(0.025, 0.035, 0.03, 0, 0.017, -0.06, blk); gb.box(0.025, 0.035, 0.03, 0, 0.017, 0.06, blk);
        gb.cyl(0.016, L, 0, 0.05, 0, blk, 'z', 12);
        gb.cyl(R, 0.08, 0, 0.05, -L / 2 + 0.02, blk, 'z', 12, 0.017);
        gb.cyl(0.021, 0.07, 0, 0.05, L / 2 - 0.03, blk, 'z', 12);
        gb.cyl(0.02, 0.03, 0, 0.075, 0, blk, 'y', 8); gb.cyl(0.02, 0.03, 0.025, 0.05, 0, blk, 'x', 8);
        h = 0.05; len = L; eye = L / 2 + 0.06; break;
      }
      case 'supp': gb.cyl(0.02, 0.18, 0, 0, -0.09, 0x2a2b2f, 'z', 12); len = 0.18; break;
      case 'comp': gb.cyl(0.015, 0.05, 0, 0, -0.025, 0x2a2b2f, 'z', 8); gb.box(0.032, 0.006, 0.01, 0, 0.008, -0.02, 0x111111); len = 0.05; break;
      case 'vgrip': gb.cyl(0.016, 0.1, 0, -0.05, 0, blk, 'y', 8); gb.box(0.025, 0.012, 0.04, 0, -0.005, 0, blk); break;
      case 'agrip': gb.box(0.025, 0.035, 0.09, 0, -0.018, 0, blk, 0.35, 0, 0); break;
      case 'bipe': gb.box(0.03, 0.02, 0.03, 0, -0.01, 0, blk); gb.cylR(0.005, 0.2, 0.03, -0.1, 0.0, blk, 0, 0, 0.3); gb.cylR(0.005, 0.2, -0.03, -0.1, 0.0, blk, 0, 0, -0.3); break;
      case 'laser': gb.box(0.025, 0.02, 0.05, 0, 0, 0, 0x3b3f2d); gb.cyl(0.004, 0.004, 0, 0.0, -0.027, 0xff2222, 'z', 6); break;
      case 'lanterna': gb.cyl(0.013, 0.08, 0, 0, 0, blk, 'z', 8); gb.cyl(0.017, 0.025, 0, 0, -0.045, blk, 'z', 8); gb.cyl(0.014, 0.003, 0, 0, -0.059, 0xffffee, 'z', 8); break;
      case 'extmag': gb.box(0.03, 0.08, 0.06, 0, 0, 0, 0x1e1f22); break;
    }
    const r = { geo: gb.build(), h, len, eye };
    this.cache[k] = r;
    return r;
  },

  // Monta a arma completa (corpo + carregador + acessórios) num grupo.
  weaponGroup(item, opts = {}) {
    const w = WEAPONS[item.id];
    const mdl = this.weapon(item.id);
    const g = new THREE.Group();
    const mat = opts.mat || MAT.gun;
    const body = new THREE.Mesh(mdl.body, mat);
    g.add(body);
    let magMesh = null;
    if (mdl.magGeo) {
      magMesh = new THREE.Mesh(mdl.magGeo, mat);
      magMesh.position.copy(mdl.info.magPos);
      if (item.att && item.att.mag === 'extmag') magMesh.scale.set(1, 1.4, 1);
      g.add(magMesh);
    }
    const parts = { body, mag: magMesh, opt: null, muz: null, und: null, tac: null };
    const info = mdl.info;
    let sightY = info.sightY, rearZ = info.rearZ, sight = null, muzzle = info.muzzle.clone();
    const att = item.att || {};
    if (w.integ && w.integ.opt) sight = INTEG_OPT[w.integ.opt];
    for (const slot of ['opt', 'muz', 'und', 'tac']) {
      const aid = att[slot];
      if (!aid || !ATTACH[aid]) continue;
      const a = this.attach(aid);
      const mesh = new THREE.Mesh(a.geo, mat);
      if (slot === 'opt') {
        mesh.position.set(0, info.railY, info.railZ);
        sightY = info.railY + a.h; rearZ = info.railZ + (a.eye || 0.03);
        sight = ATTACH[aid];
        if (aid === 'pso1') { mesh.position.x = 0.025; }
      } else if (slot === 'muz') {
        mesh.position.copy(info.muzzle);
        muzzle.z -= a.len;
      } else if (slot === 'und') mesh.position.copy(info.under);
      else if (slot === 'tac') mesh.position.copy(info.side);
      g.add(mesh);
      parts[slot] = mesh;
    }
    return { group: g, parts, info, sightY, rearZ, sight, muzzle, sightX: att.opt ? 0 : info.sightX };
  },

  // ---------------------------------------------------------------- Itens no chão
  item(id) {
    const k = 'item:' + id;
    if (this.cache[k]) return this.cache[k];
    const d = itemDef(id);
    const gb = new GB();
    if (d.type === 'ammo') {
      const c = CALIBERS[d.cal];
      const mil = /x|bmg|338|408|303|06|mm/.test(d.cal) && !['9x19', '9x18', '7.62x25', '7.62x38r', '4.6x30', '5.7x28'].includes(d.cal);
      if (c.boom) { gb.box(0.25, 0.1, 0.12, 0, 0.05, 0, 0x4d5a3b); gb.box(0.26, 0.02, 0.13, 0, 0.1, 0, 0xc9a43a); }
      else if (c.arrow) { for (let i = 0; i < 4; i++) gb.cyl(0.004, 0.5, (i - 1.5) * 0.015, 0.01, 0, 0x222222, 'z', 6); }
      else { gb.box(0.16, 0.08, 0.1, 0, 0.04, 0, mil ? 0x4d5a3b : d.cal === '12ga' ? 0xa83a2a : 0xd9b23a); gb.box(0.165, 0.012, 0.06, 0, 0.06, 0, mil ? 0xc9a43a : 0xffffff); }
    } else if (d.type === 'attach') {
      const a = this.attach(id);
      return (this.cache[k] = a.geo);
    } else if (d.type === 'food') {
      if (/feijoada|sardinha/.test(id)) { gb.cyl(0.045, 0.11, 0, 0.055, 0, id === 'feijoada' ? 0x8a3a1f : 0x2f5fa8, 'y', 8); gb.cyl(0.046, 0.01, 0, 0.11, 0, C.SIL, 'y', 8); }
      else if (id === 'maca') gb.sph(0.04, 0, 0.04, 0, 0xc0392b);
      else if (id === 'mre') gb.box(0.14, 0.05, 0.22, 0, 0.025, 0, 0x8b7d5c);
      else if (id === 'pao') gb.sph(0.045, 0, 0.035, 0, 0xc9902f, 0.7);
      else if (/carne/.test(id)) gb.box(0.14, 0.04, 0.1, 0, 0.02, 0, id === 'carnecrua' ? 0xb03a3a : 0x7a4224);
      else gb.box(0.12, 0.04, 0.18, 0, 0.02, 0, U.pick([0xd9a21b, 0x7a3a1f, 0x2f8a5f, 0xc0392b]));
    } else if (d.type === 'drink') {
      const col = { agua: 0x8fc7e8, refri: 0xb53a2f, coco: 0x6b8a3a, energetico: 0x2f2f6b, leite: 0xf0f0f0, aguasuja: 0x7d8a5a }[id] || 0x8fc7e8;
      if (id === 'leite') gb.box(0.07, 0.15, 0.07, 0, 0.075, 0, col);
      else if (id === 'coco') gb.sph(0.07, 0, 0.065, 0, col);
      else { gb.cyl(0.035, 0.18, 0, 0.09, 0, col, 'y', 8); gb.cyl(0.014, 0.04, 0, 0.2, 0, 0x2a5fa8, 'y', 6); }
    } else if (d.type === 'med') {
      if (id === 'kit' || id === 'ifak') { gb.box(0.22, 0.1, 0.16, 0, 0.05, 0, id === 'ifak' ? 0x5a6142 : 0xd0d0d0); gb.box(0.06, 0.102, 0.02, 0, 0.051, 0, C.RED); gb.box(0.02, 0.102, 0.06, 0, 0.051, 0, C.RED); }
      else if (id === 'tala') { gb.box(0.05, 0.02, 0.3, 0, 0.01, 0, 0xc9a26b); gb.box(0.052, 0.022, 0.03, 0, 0.011, 0.05, 0xffffff); }
      else if (/morfina|adrenalina|vacina/.test(id)) { gb.cyl(0.012, 0.1, 0, 0.012, 0, id === 'vacina' ? 0x3ab07a : 0xeeeeee, 'z', 6); gb.cyl(0.002, 0.03, 0, 0.012, -0.065, C.SIL, 'z', 6); }
      else if (id === 'atadura') gb.cyl(0.035, 0.06, 0, 0.035, 0, 0xf2efe6, 'x', 8);
      else gb.box(0.05, 0.08, 0.03, 0, 0.04, 0, 0xffffff);
    } else if (d.type === 'bag') { gb.box(0.32, 0.4, 0.18, 0, 0.2, 0, d.color); gb.box(0.26, 0.18, 0.06, 0, 0.14, 0.11, d.color); gb.box(0.04, 0.3, 0.02, 0.1, 0.22, -0.1, 0x222222); }
    else if (d.type === 'vest') { gb.box(0.42, 0.06, 0.48, 0, 0.03, 0, d.color); gb.box(0.36, 0.08, 0.1, 0, 0.06, 0.12, d.color); }
    else if (d.type === 'helmet') { gb.sph(0.13, 0, 0.0, 0, d.color, 0.75); gb.box(0.3, 0.02, 0.3, 0, 0.0, 0, d.color); }
    else if (id === 'pano') gb.box(0.2, 0.03, 0.2, 0, 0.015, 0, 0xc9b38a);
    else if (id === 'tabua') { gb.box(0.12, 0.03, 0.7, 0, 0.015, 0, 0x9c6534); gb.box(0.12, 0.03, 0.7, 0.02, 0.045, 0, 0x8a5a2b); }
    else if (id === 'sucata') { gb.box(0.1, 0.06, 0.12, 0, 0.03, 0, C.GRY); gb.box(0.08, 0.05, 0.05, 0.06, 0.05, 0.03, 0x7a5a3a, 0.4, 0.3, 0); }
    else if (id === 'polvora') { gb.cyl(0.05, 0.1, 0, 0.05, 0, 0x222222, 'y', 8); gb.cyl(0.03, 0.02, 0, 0.11, 0, C.RED, 'y', 8); }
    else if (id === 'garrafa') gb.cyl(0.035, 0.2, 0, 0.1, 0, 0x3a7a4a, 'y', 8);
    else if (id === 'galao') { gb.box(0.16, 0.3, 0.26, 0, 0.15, 0, 0xb53a2f); gb.box(0.03, 0.06, 0.03, 0, 0.32, 0.08, 0x222222); gb.box(0.04, 0.03, 0.14, 0, 0.31, -0.04, 0xb53a2f); }
    else if (id === 'ferramentas') { gb.box(0.36, 0.14, 0.16, 0, 0.07, 0, 0xc0392b); gb.box(0.2, 0.03, 0.03, 0, 0.16, 0, 0x222222); }
    else if (id === 'isqueiro') gb.box(0.03, 0.06, 0.015, 0, 0.03, 0, 0xd9a21b);
    else if (id === 'binoculo') { gb.cyl(0.03, 0.12, 0.035, 0.03, 0, 0x222222, 'z', 8); gb.cyl(0.03, 0.12, -0.035, 0.03, 0, 0x222222, 'z', 8); }
    else gb.box(0.1, 0.1, 0.1, 0, 0.05, 0, 0x888888);
    const g = gb.build();
    this.cache[k] = g;
    return g;
  },

  // ---------------------------------------------------------------- Zumbis e animais
  zombieParts: null,
  zombie(type) {
    if (!this.zombieParts) {
      const box = (w, h, d, oy) => { const g = new THREE.BoxGeometry(w, h, d); g.translate(0, oy, 0); return g; };
      this.zombieParts = {
        torso: box(0.5, 0.6, 0.28, 0.3), head: box(0.3, 0.3, 0.3, 0.15), arm: box(0.15, 0.62, 0.15, -0.28),
        leg: box(0.18, 0.86, 0.2, -0.43), helmet: box(0.36, 0.14, 0.36, 0.0), vest: box(0.54, 0.4, 0.33, 0.0),
        eye: new THREE.BoxGeometry(0.06, 0.035, 0.02),
      };
    }
    const P = this.zombieParts;
    const skins = [0x7f9a6e, 0x8aa27a, 0x6e8b62, 0x9aa585, 0x7b8f73];
    const shirts = [0x4a6fa5, 0xa54a4a, 0x5f8a4a, 0x8a7a5a, 0xd0c9b0, 0x333438, 0x6b4a8a, 0xb5853a, 0x3a7a7a, 0x8a3a5a];
    const pants = [0x2f3a55, 0x3a3a3a, 0x5a4a3a, 0x4a5a3a, 0x6a5f4a];
    let shirt = U.pick(shirts), pant = U.pick(pants), skin = U.pick(skins);
    if (type === 'militar') { shirt = 0x5a6142; pant = 0x4d5338; }
    if (type === 'brutamonte') { skin = 0x6f7f5c; shirt = 0x3a3030; }
    if (type === 'corredor') skin = 0x95a882;
    const root = new THREE.Group();
    const hips = new THREE.Group(); hips.position.y = 0.88; root.add(hips);
    const torso = new THREE.Mesh(P.torso, MAT.color(shirt)); hips.add(torso);
    const head = new THREE.Mesh(P.head, MAT.color(skin)); head.position.y = 0.62; torso.add(head);
    const eyeMat = MAT.color(0xffe066);
    const e1 = new THREE.Mesh(P.eye, eyeMat); e1.position.set(0.07, 0.17, -0.155); head.add(e1);
    const e2 = new THREE.Mesh(P.eye, eyeMat); e2.position.set(-0.07, 0.17, -0.155); head.add(e2);
    const armL = new THREE.Mesh(P.arm, MAT.color(U.chance(0.5) ? skin : shirt)); armL.position.set(-0.33, 0.55, 0); torso.add(armL);
    const armR = new THREE.Mesh(P.arm, MAT.color(U.chance(0.5) ? skin : shirt)); armR.position.set(0.33, 0.55, 0); torso.add(armR);
    const legL = new THREE.Mesh(P.leg, MAT.color(pant)); legL.position.set(-0.13, 0.02, 0); hips.add(legL);
    const legR = new THREE.Mesh(P.leg, MAT.color(pant)); legR.position.set(0.13, 0.02, 0); hips.add(legR);
    if (type === 'militar') {
      const hm = new THREE.Mesh(P.helmet, MAT.color(0x4d5338)); hm.position.y = 0.32; head.add(hm);
      const vs = new THREE.Mesh(P.vest, MAT.color(0x6b6a4a)); vs.position.y = 0.32; torso.add(vs);
    }
    root.traverse((o) => { if (o.isMesh) { o.castShadow = true; } });
    return { root, hips, torso, head, armL, armR, legL, legR };
  },

  animal(type) {
    const root = new THREE.Group();
    const gb = new GB();
    let legs = [];
    if (type === 'capivara') {
      gb.box(0.5, 0.42, 0.9, 0, 0.5, 0, 0x8a6a45); gb.box(0.36, 0.34, 0.38, 0, 0.6, -0.55, 0x7a5a3a); gb.box(0.08, 0.08, 0.06, 0.12, 0.8, -0.5, 0x5a3a2a); gb.box(0.08, 0.08, 0.06, -0.12, 0.8, -0.5, 0x5a3a2a);
      gb.box(0.04, 0.04, 0.02, 0.1, 0.68, -0.75, 0x111111); gb.box(0.04, 0.04, 0.02, -0.1, 0.68, -0.75, 0x111111);
      legs = [[0.17, 0.3, -0.3], [-0.17, 0.3, -0.3], [0.17, 0.3, 0.3], [-0.17, 0.3, 0.3]];
    } else {
      gb.box(0.36, 0.42, 1.0, 0, 0.95, 0, 0xa0703e); gb.box(0.16, 0.5, 0.18, 0, 1.3, -0.48, 0xa0703e, 0.5, 0, 0);
      gb.box(0.2, 0.2, 0.34, 0, 1.55, -0.65, 0x9a683a); gb.box(0.14, 0.12, 0.1, 0, 1.5, -0.84, 0x5a3a2a);
      gb.box(0.03, 0.25, 0.03, 0.08, 1.75, -0.6, 0xd9c9a0, 0, 0, -0.3); gb.box(0.03, 0.25, 0.03, -0.08, 1.75, -0.6, 0xd9c9a0, 0, 0, 0.3);
      gb.box(0.02, 0.12, 0.02, 0.15, 1.85, -0.62, 0xd9c9a0, 0, 0, -0.9); gb.box(0.02, 0.12, 0.02, -0.15, 1.85, -0.62, 0xd9c9a0, 0, 0, 0.9);
      gb.box(0.12, 0.14, 0.06, 0, 1.0, 0.52, 0xf0e6d6);
      legs = [[0.12, 0.78, -0.38], [-0.12, 0.78, -0.38], [0.12, 0.78, 0.38], [-0.12, 0.78, 0.38]];
    }
    const body = new THREE.Mesh(gb.build(), MAT.vcFlat); body.castShadow = true; root.add(body);
    const legMeshes = legs.map(([x, y, z]) => {
      const g = new THREE.BoxGeometry(0.09, y, 0.09); g.translate(0, -y / 2, 0);
      const l = new THREE.Mesh(g, MAT.color(type === 'capivara' ? 0x6a4a30 : 0x8a5a30));
      l.position.set(x, y, z); root.add(l); return l;
    });
    return { root, legs: legMeshes };
  },

  // ---------------------------------------------------------------- Veículos
  vehicle(type, color) {
    const gb = new GB();
    const dark = 0x1d1e21, glass = 0x2a3a48, chrome = 0xc8ccd0;
    let wheels = [], size = [1.8, 1.5, 4.0], wr = 0.36;
    if (type === 'fusca') {
      gb.box(1.55, 0.55, 3.9, 0, 0.62, 0, color);
      gb.sph(1, 0, 0.9, 0.15, color, 0.62);
      gb.box(1.3, 0.38, 1.5, 0, 1.15, 0.2, glass);
      gb.box(1.72, 0.32, 0.9, 0, 0.72, -1.3, color); gb.box(1.72, 0.32, 0.9, 0, 0.72, 1.35, color);
      gb.box(1.62, 0.12, 0.12, 0, 0.5, -1.98, chrome); gb.box(1.62, 0.12, 0.12, 0, 0.5, 1.98, chrome);
      gb.sph(0.12, 0.6, 0.85, -1.75, 0xfff6c0); gb.sph(0.12, -0.6, 0.85, -1.75, 0xfff6c0);
      wheels = [[0.78, -1.25], [-0.78, -1.25], [0.78, 1.3], [-0.78, 1.3]]; size = [1.75, 1.6, 4.0]; wr = 0.34;
    } else if (type === 'picape') {
      gb.box(1.9, 0.7, 5.0, 0, 0.85, 0, color);
      gb.box(1.8, 0.75, 1.9, 0, 1.55, -0.55, color); gb.box(1.75, 0.55, 1.85, 0, 1.6, -0.55, glass);
      gb.box(1.9, 0.5, 0.08, 0, 1.4, 2.46, color); gb.box(0.08, 0.5, 2.3, 0.91, 1.4, 1.35, color); gb.box(0.08, 0.5, 2.3, -0.91, 1.4, 1.35, color);
      gb.box(1.95, 0.25, 0.15, 0, 0.6, -2.5, dark); gb.box(1.95, 0.2, 0.15, 0, 0.6, 2.5, dark);
      gb.box(0.25, 0.15, 0.05, 0.7, 1.0, -2.51, 0xfff6c0); gb.box(0.25, 0.15, 0.05, -0.7, 1.0, -2.51, 0xfff6c0);
      wheels = [[0.92, -1.6], [-0.92, -1.6], [0.92, 1.6], [-0.92, 1.6]]; size = [2.0, 2.0, 5.0]; wr = 0.42;
    } else {
      gb.box(2.2, 0.9, 4.7, 0, 1.0, 0, color);
      gb.box(2.1, 0.7, 2.4, 0, 1.8, 0.3, color); gb.box(2.12, 0.4, 2.2, 0, 1.85, 0.3, glass);
      gb.box(2.0, 0.5, 1.3, 0, 1.55, -1.75, color);
      gb.box(0.3, 0.3, 0.3, 0, 2.3, 0.6, dark); gb.box(0.08, 0.08, 0.8, 0, 2.35, 0.2, dark);
      gb.box(2.3, 0.3, 0.2, 0, 0.7, -2.4, dark);
      gb.box(0.2, 0.12, 0.05, 0.75, 1.3, -2.36, 0xfff6c0); gb.box(0.2, 0.12, 0.05, -0.75, 1.3, -2.36, 0xfff6c0);
      wheels = [[1.0, -1.55], [-1.0, -1.55], [1.0, 1.55], [-1.0, 1.55]]; size = [2.3, 2.4, 4.8]; wr = 0.48;
    }
    const root = new THREE.Group();
    const body = new THREE.Mesh(gb.build(), MAT.vcFlat); body.castShadow = true; body.receiveShadow = true;
    root.add(body);
    const wg = new THREE.CylinderGeometry(wr, wr, 0.3, 10); wg.rotateZ(Math.PI / 2);
    const wm = MAT.color(0x18181a);
    const wheelMeshes = wheels.map(([x, z]) => {
      const piv = new THREE.Group(); piv.position.set(x, wr, z);
      const m = new THREE.Mesh(wg, wm); m.castShadow = true; piv.add(m);
      const hub = new THREE.Mesh(new THREE.BoxGeometry(0.31, wr * 0.8, 0.12), MAT.color(0x8a8d92)); m.add(hub);
      root.add(piv); return piv;
    });
    return { root, body, wheels: wheelMeshes, size, wr };
  },
};
