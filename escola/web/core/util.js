/* Caderneta Escolar — utilitários do núcleo (rodam no navegador e no Node).
   Datas no formato AAAA-MM-DD, ids, validação de entrada e erros de comando. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else (root.Core = root.Core || {}).util = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

  // ---------- datas ----------
  const pad = (n) => String(n).padStart(2, '0');
  const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parse = (s) => {
    const [y, m, d] = String(s).split('-').map(Number);
    return new Date(y, (m || 1) - 1, d || 1);
  };
  /** Data de hoje (AAAA-MM-DD) no fuso informado; sem fuso, usa o horário local. */
  const today = (timeZone) => {
    if (!timeZone) return iso(new Date());
    try {
      const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
      const get = (t) => parts.find((p) => p.type === t).value;
      return `${get('year')}-${get('month')}-${get('day')}`;
    } catch (e) {
      return iso(new Date());
    }
  };
  const addDays = (s, n) => {
    const d = parse(s);
    d.setDate(d.getDate() + n);
    return iso(d);
  };
  const addMonths = (month, n) => {
    const d = parse(month + '-01');
    d.setMonth(d.getMonth() + n);
    return iso(d).slice(0, 7);
  };
  const weekday = (s) => parse(s).getDay();
  const daysBetween = (a, b) => Math.round((parse(b) - parse(a)) / 86400000);
  const isValidDate = (s) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s || '')) return false;
    const d = parse(s);
    return !isNaN(d) && iso(d) === s;
  };
  const isValidTime = (s) => /^([01]\d|2[0-3]):[0-5]\d$/.test(s || '');
  const monthName = (month) => MONTHS[Number(String(month).split('-')[1]) - 1];

  // Páscoa (algoritmo de Meeus) para os feriados móveis
  const easter = (y) => {
    const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4;
    const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
    const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
    const l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
    const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
    return `${y}-${pad(month)}-${pad(day)}`;
  };
  const holidayCache = {};
  const holidays = (y) => {
    if (holidayCache[y]) return holidayCache[y];
    const e = easter(y);
    holidayCache[y] = {
      [`${y}-01-01`]: 'Confraternização Universal',
      [addDays(e, -48)]: 'Carnaval',
      [addDays(e, -47)]: 'Carnaval',
      [addDays(e, -2)]: 'Sexta-feira Santa',
      [`${y}-04-21`]: 'Tiradentes',
      [`${y}-05-01`]: 'Dia do Trabalho',
      [addDays(e, 60)]: 'Corpus Christi',
      [`${y}-09-07`]: 'Independência do Brasil',
      [`${y}-10-12`]: 'Nossa Senhora Aparecida',
      [`${y}-11-02`]: 'Finados',
      [`${y}-11-15`]: 'Proclamação da República',
      [`${y}-11-20`]: 'Dia da Consciência Negra',
      [`${y}-12-25`]: 'Natal',
    };
    return holidayCache[y];
  };
  const holidayName = (s) => holidays(Number(String(s).slice(0, 4)))[s] || null;

  // ---------- texto ----------
  const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  const digits = (s) => String(s || '').replace(/\D/g, '');
  const maskPhone = (s) => {
    const d = digits(s).slice(0, 11);
    if (d.length <= 2) return d.length ? `(${d}` : '';
    if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
    if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
    return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  };
  const maskCPF = (s) => {
    const d = digits(s).slice(0, 11);
    return d.replace(/^(\d{3})(\d)/, '$1.$2').replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3').replace(/\.(\d{3})(\d{1,2})$/, '.$1-$2');
  };
  const validCPF = (s) => {
    const d = digits(s);
    if (d.length !== 11 || /^(\d)\1+$/.test(d)) return false;
    const calc = (len) => {
      let t = 0;
      for (let i = 0; i < len; i++) t += Number(d[i]) * (len + 1 - i);
      const r = (t * 10) % 11;
      return r === 10 ? 0 : r;
    };
    return calc(9) === Number(d[9]) && calc(10) === Number(d[10]);
  };
  const validEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s || '');

  // ---------- números ----------
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const round2 = (n) => Math.round(Number(n) * 100) / 100;
  const avg = (arr) => {
    const v = arr.filter((x) => x != null && !isNaN(x));
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
  };
  const sum = (arr) => arr.reduce((a, b) => a + (Number(b) || 0), 0);
  const by = (fn) => (a, b) => {
    const x = fn(a), y = fn(b);
    if (typeof x === 'string') return x.localeCompare(y, 'pt-BR', { numeric: true, sensitivity: 'base' });
    return (x ?? Infinity) - (y ?? Infinity);
  };

  // ---------- ids e aleatoriedade ----------
  const cryptoObj = typeof globalThis !== 'undefined' && globalThis.crypto && globalThis.crypto.getRandomValues ? globalThis.crypto : null;
  const randomBytes = (n) => {
    const out = new Uint8Array(n);
    if (cryptoObj) cryptoObj.getRandomValues(out);
    else if (typeof require === 'function') out.set(require('crypto').randomBytes(n));
    else for (let i = 0; i < n; i++) out[i] = Math.floor(Math.random() * 256);
    return out;
  };
  const ALPHA = '0123456789abcdefghijklmnopqrstuvwxyz';
  /** Id curto e único: prefixo + tempo + 8 caracteres aleatórios. */
  const uid = (prefix = 'x') => {
    const r = randomBytes(8);
    let s = '';
    for (let i = 0; i < 8; i++) s += ALPHA[r[i] % 36];
    return (/^[a-z]$/.test(prefix) ? prefix : 'x') + Date.now().toString(36) + s;
  };
  /** Senha provisória legível (sem caracteres ambíguos). */
  const tempPassword = () => {
    const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789';
    const r = randomBytes(10);
    let s = '';
    for (let i = 0; i < 10; i++) s += chars[r[i] % chars.length];
    return s.slice(0, 5) + '-' + s.slice(5);
  };
  // gerador pseudoaleatório determinístico (mulberry32) para dados de exemplo
  const rng = (seed) => {
    let a = seed >>> 0;
    const next = () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    next.int = (min, max) => Math.floor(next() * (max - min + 1)) + min;
    next.pick = (arr) => arr[Math.floor(next() * arr.length)];
    next.chance = (p) => next() < p;
    next.shuffle = (arr) => {
      const a2 = arr.slice();
      for (let i = a2.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [a2[i], a2[j]] = [a2[j], a2[i]];
      }
      return a2;
    };
    return next;
  };

  const clone = (v) => (v == null ? v : JSON.parse(JSON.stringify(v)));
  /** JSON com chaves ordenadas: compara documentos sem depender da ordem das chaves. */
  const canonical = (v) => {
    if (v === undefined) return 'undefined';
    if (v === null || typeof v !== 'object') return JSON.stringify(v);
    if (Array.isArray(v)) return '[' + v.map(canonical).join(',') + ']';
    return '{' + Object.keys(v).filter((k) => v[k] !== undefined).sort().map((k) => JSON.stringify(k) + ':' + canonical(v[k])).join(',') + '}';
  };

  // ---------- ids e chaves compostas ----------
  const ID_RE = /^[a-z][a-z0-9]{2,40}$/;
  const isId = (s) => typeof s === 'string' && ID_RE.test(s);
  const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
  /** Partes aceitas numa chave composta: id, data, número, ano, etapa ou parte reservada (_parecer). */
  const PART_RE = /^(?:[a-z][a-z0-9]{2,40}|\d{4}-\d{2}-\d{2}|\d{1,4}|rec\d|rf|_[a-z]{2,20})$/;
  const key = {
    make(...parts) {
      for (const p of parts) if (!PART_RE.test(String(p))) throw new CmdError('invalid', 'Identificador inválido.');
      return parts.join('|');
    },
    parse(k, n) {
      if (typeof k !== 'string' || k.length > 200 || FORBIDDEN_KEYS.has(k)) return null;
      const parts = k.split('|');
      if (n && parts.length !== n) return null;
      return parts.every((p) => PART_RE.test(p)) ? parts : null;
    },
    ok: (k, n) => key.parse(k, n) !== null,
  };

  // ---------- erros e validação de entrada ----------
  class CmdError extends Error {
    constructor(code, message, field) {
      super(message);
      this.name = 'CmdError';
      this.code = code; // forbidden | invalid | not_found | conflict | unauthorized
      if (field) this.field = field;
    }
  }
  const fail = (code, message, field) => {
    throw new CmdError(code, message, field);
  };

  /**
   * Validadores: cada um recebe o valor bruto e devolve o valor limpo ou lança CmdError('invalid').
   * `label` é o nome do campo como o usuário o vê ("Nome do aluno").
   */
  const V = {
    /** Texto de uma linha: sem caracteres de controle (quebras e tabulações viram espaço). */
    str(v, label, { required = false, max = 200, min = 0, multiline = false } = {}) {
      if (v == null) v = '';
      if (typeof v !== 'string' && typeof v !== 'number') fail('invalid', `${label}: valor inválido.`);
      let s = String(v);
      s = multiline
        ? s.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
        : s.replace(/[\u0000-\u001f\u007f]+/g, ' ');
      s = s.replace(/\s+$/g, '').replace(/^\s+/g, '');
      if (required && !s) fail('invalid', `Preencha ${label.toLowerCase()}.`);
      if (s.length > max) fail('invalid', `${label} pode ter no máximo ${max} caracteres.`);
      if (s && s.length < min) fail('invalid', `${label} precisa ter pelo menos ${min} caracteres.`);
      return s;
    },
    /** Texto de várias linhas: quebras normalizadas para \n, sem outros caracteres de controle. */
    text(v, label, opts = {}) {
      return V.str(v, label, { max: 5000, ...opts, multiline: true });
    },
    num(v, label, { required = false, min = -Infinity, max = Infinity } = {}) {
      if (v === '' || v == null) {
        if (required) fail('invalid', `Informe ${label.toLowerCase()}.`);
        return null;
      }
      const n = Number(v);
      if (!Number.isFinite(n)) fail('invalid', `${label}: número inválido.`);
      if (n < min || n > max) fail('invalid', `${label} deve estar entre ${min} e ${max}.`);
      return n;
    },
    int(v, label, opts = {}) {
      const n = V.num(v, label, opts);
      if (n != null && !Number.isInteger(n)) fail('invalid', `${label} deve ser um número inteiro.`);
      return n;
    },
    bool: (v) => v === true || v === 'true' || v === 1,
    date(v, label, { required = false } = {}) {
      if (!v) {
        if (required) fail('invalid', `Informe ${label.toLowerCase()}.`);
        return null;
      }
      if (!isValidDate(v)) fail('invalid', `${label}: data inválida.`);
      return v;
    },
    month(v, label) {
      if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(v || '')) fail('invalid', `${label}: mês inválido.`);
      return v;
    },
    time(v, label) {
      if (!v) return '';
      if (!isValidTime(v)) fail('invalid', `${label}: horário inválido (use HH:MM).`);
      return v;
    },
    oneOf(v, label, options, { required = true } = {}) {
      if ((v == null || v === '') && !required) return null;
      if (!options.includes(v)) fail('invalid', `${label}: opção inválida.`);
      return v;
    },
    email(v, label, { required = false } = {}) {
      const s = V.str(v, label, { required, max: 160 }).toLowerCase();
      if (s && !validEmail(s)) fail('invalid', `${label}: confira o e-mail (ex.: nome@email.com).`);
      return s;
    },
    phone(v, label, { required = false } = {}) {
      const s = V.str(v, label, { required, max: 30 });
      if (s && digits(s).length < 10) fail('invalid', `${label}: informe DDD + número.`);
      return s ? maskPhone(s) : '';
    },
    cpf(v, label) {
      const s = V.str(v, label, { max: 20 });
      if (s && !validCPF(s)) fail('invalid', `${label}: CPF inválido.`);
      return s ? maskCPF(s) : '';
    },
    ids(v, label, { max = 2000 } = {}) {
      if (v == null) return [];
      if (!Array.isArray(v) || v.length > max || v.some((x) => !isId(x))) fail('invalid', `${label}: lista inválida.`);
      return [...new Set(v)];
    },
    /** Lista de textos curtos (ex.: itens "mandar amanhã"). */
    strs(v, label, { max = 30, maxLen = 80 } = {}) {
      if (v == null) return [];
      if (!Array.isArray(v) || v.length > max) fail('invalid', `${label}: lista inválida.`);
      return [...new Set(v.map((x) => V.str(x, label, { max: maxLen })).filter(Boolean))];
    },
    id(v, label) {
      if (!isId(v)) fail('not_found', `${label} não encontrado.`);
      return v;
    },
  };

  return {
    MONTHS, pad, iso, parse, today, addDays, addMonths, weekday, daysBetween, isValidDate, isValidTime, monthName,
    easter, holidays, holidayName, norm, digits, maskPhone, maskCPF, validCPF, validEmail, clamp, round2, avg, sum, by,
    randomBytes, uid, tempPassword, rng, clone, canonical, ID_RE, isId, key, FORBIDDEN_KEYS, CmdError, fail, V,
  };
});
