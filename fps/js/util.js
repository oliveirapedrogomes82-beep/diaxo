'use strict';
// Utilidades gerais: matemática, aleatoriedade com semente e ruído.

const U = {
  clamp: (v, a, b) => (v < a ? a : v > b ? b : v),
  lerp: (a, b, t) => a + (b - a) * t,
  smooth: (t) => t * t * (3 - 2 * t),
  smoothstep(a, b, v) { return U.smooth(U.clamp((v - a) / (b - a), 0, 1)); },
  rand: (a, b) => a + Math.random() * (b - a),
  randi: (a, b) => Math.floor(a + Math.random() * (b - a + 1)),
  pick: (arr) => arr[Math.floor(Math.random() * arr.length)],
  chance: (p) => Math.random() < p,
  deg: (d) => (d * Math.PI) / 180,
  // Diferença angular no intervalo [-PI, PI].
  angDiff(a, b) {
    let d = (b - a) % (Math.PI * 2);
    if (d > Math.PI) d -= Math.PI * 2;
    if (d < -Math.PI) d += Math.PI * 2;
    return d;
  },
  dist2(ax, az, bx, bz) { const dx = ax - bx, dz = az - bz; return dx * dx + dz * dz; },
  // Escolha ponderada: lista de [valor, peso] ou objetos com campo w.
  weighted(list, rnd = Math.random) {
    let tot = 0;
    for (const e of list) tot += Array.isArray(e) ? e[1] : e.w;
    let r = rnd() * tot;
    for (const e of list) {
      r -= Array.isArray(e) ? e[1] : e.w;
      if (r <= 0) return Array.isArray(e) ? e[0] : e;
    }
    const last = list[list.length - 1];
    return Array.isArray(last) ? last[0] : last;
  },
  // Gerador pseudoaleatório determinístico.
  rng(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  },
  fmtTime(sec) {
    sec = Math.max(0, Math.floor(sec));
    const m = Math.floor(sec / 60), s = sec % 60;
    return m + ':' + String(s).padStart(2, '0');
  },
  esc(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  },
};

// Ruído gradiente 2D (Perlin clássico) com semente.
function makeNoise2D(seed) {
  const r = U.rng(seed);
  const p = new Uint8Array(512);
  const perm = [];
  for (let i = 0; i < 256; i++) perm.push(i);
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [perm[i], perm[j]] = [perm[j], perm[i]];
  }
  for (let i = 0; i < 512; i++) p[i] = perm[i & 255];
  const gx = [1, -1, 1, -1, 1, -1, 0, 0], gz = [1, 1, -1, -1, 0, 0, 1, -1];
  const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
  function grad(h, x, z) { h &= 7; return gx[h] * x + gz[h] * z; }
  function noise(x, z) {
    const X = Math.floor(x), Z = Math.floor(z);
    const xf = x - X, zf = z - Z;
    const xi = X & 255, zi = Z & 255;
    const u = fade(xf), v = fade(zf);
    const aa = p[p[xi] + zi], ab = p[p[xi] + zi + 1];
    const ba = p[p[xi + 1] + zi], bb = p[p[xi + 1] + zi + 1];
    const x1 = U.lerp(grad(aa, xf, zf), grad(ba, xf - 1, zf), u);
    const x2 = U.lerp(grad(ab, xf, zf - 1), grad(bb, xf - 1, zf - 1), u);
    return U.lerp(x1, x2, v); // aprox. [-1, 1]
  }
  noise.fbm = function (x, z, oct = 4, lac = 2, gain = 0.5) {
    let a = 1, f = 1, s = 0, n = 0;
    for (let i = 0; i < oct; i++) {
      s += noise(x * f, z * f) * a;
      n += a; a *= gain; f *= lac;
    }
    return s / n;
  };
  return noise;
}
