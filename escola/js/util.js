'use strict';
/* Utilitários gerais: datas, formatação, máscaras, CSV, aleatório determinístico. */
const U = (() => {
  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const esc = (v) => (v == null ? '' : String(v).replace(/[&<>"']/g, (c) => ESC[c]));

  const uid = () => Date.now().toString(36).slice(-5) + Math.random().toString(36).slice(2, 8);

  const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  const MONTHS_SHORT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  const WEEKDAYS = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
  const WD_SHORT = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

  const pad = (n) => String(n).padStart(2, '0');
  const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const today = () => iso(new Date());
  const parse = (s) => {
    const [y, m, d] = String(s).split('-').map(Number);
    return new Date(y, (m || 1) - 1, d || 1);
  };
  const addDays = (s, n) => {
    const d = parse(s);
    d.setDate(d.getDate() + n);
    return iso(d);
  };
  const ym = (s) => String(s).slice(0, 7);
  const addMonths = (month, n) => {
    const d = parse(month + '-01');
    d.setMonth(d.getMonth() + n);
    return iso(d).slice(0, 7);
  };
  const weekday = (s) => parse(s).getDay();
  const daysBetween = (a, b) => Math.round((parse(b) - parse(a)) / 86400000);
  const isValidDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || '') && !isNaN(parse(s));

  const fmtDate = (s) => (s ? s.split('-').reverse().join('/') : '—');
  const fmtDayMonth = (s) => {
    const d = parse(s);
    return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`;
  };
  const fmtDateLong = (s, withWeekday = true) => {
    const d = parse(s);
    const base = `${d.getDate()} de ${MONTHS[d.getMonth()]}`;
    return withWeekday ? `${WEEKDAYS[d.getDay()]}, ${base}` : base;
  };
  const fmtMonth = (month) => {
    const [y, m] = month.split('-').map(Number);
    return `${MONTHS[m - 1]} de ${y}`;
  };
  const monthName = (month) => MONTHS[Number(month.split('-')[1]) - 1];
  const fmtMonthShort = (month) => MONTHS_SHORT[Number(month.split('-')[1]) - 1];
  const relDay = (s) => {
    const diff = daysBetween(today(), s);
    if (diff === 0) return 'hoje';
    if (diff === 1) return 'amanhã';
    if (diff === -1) return 'ontem';
    if (diff > 1 && diff < 7) return WEEKDAYS[weekday(s)].replace('-feira', '');
    if (diff > 0) return `em ${diff} dias`;
    return `há ${-diff} dias`;
  };
  const fmtTime = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

  const moneyFmt = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
  const money = (n) => moneyFmt.format(Number(n) || 0);
  const moneyShort = (n) => {
    const v = Number(n) || 0;
    if (Math.abs(v) >= 1e6) return 'R$ ' + (v / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' mi';
    if (Math.abs(v) >= 1e4) return 'R$ ' + (v / 1e3).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' mil';
    return money(v);
  };
  const num = (n, dec = 1) => (n == null || isNaN(n) ? '—' : Number(n).toLocaleString('pt-BR', { minimumFractionDigits: dec, maximumFractionDigits: dec }));
  const int = (n) => Number(n || 0).toLocaleString('pt-BR');
  const pct = (n) => (n == null || isNaN(n) ? '—' : Math.round(n) + '%');
  const parseNum = (s) => {
    if (typeof s === 'number') return s;
    const t = String(s || '').trim().replace(/[R$\s]/g, '');
    if (!t) return NaN;
    // aceita 1.234,56 · 1234,56 · 1234.56
    const normalized = t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t;
    return Number(normalized);
  };
  const parseGrade = (s) => {
    const t = String(s ?? '').trim();
    if (!t) return null;
    const n = Number(t.replace(',', '.'));
    if (isNaN(n) || n < 0 || n > 10) return NaN;
    return Math.round(n * 10) / 10;
  };

  const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : '');
  const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  const matches = (query, ...fields) => {
    const q = norm(query);
    if (!q) return true;
    const hay = norm(fields.join(' '));
    return q.split(/\s+/).every((part) => hay.includes(part));
  };
  const initials = (name) => {
    const parts = String(name || '?').trim().split(/\s+/).filter((p) => !/^(da|de|do|das|dos|e)$/i.test(p));
    return ((parts[0] || '?')[0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
  };
  const firstName = (name) => String(name || '').trim().split(/\s+/)[0];
  const shortName = (name) => {
    const parts = String(name || '').trim().split(/\s+/);
    return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1]}` : parts[0] || '';
  };
  const colorIndex = (str) => {
    let h = 0;
    for (const c of String(str)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    return (h % 8) + 1;
  };
  const age = (birth) => {
    if (!birth) return null;
    const b = parse(birth);
    const t = new Date();
    let a = t.getFullYear() - b.getFullYear();
    if (t.getMonth() < b.getMonth() || (t.getMonth() === b.getMonth() && t.getDate() < b.getDate())) a--;
    return a;
  };
  const plural = (n, one, many) => `${int(n)} ${n === 1 ? one : many}`;
  const avg = (arr) => {
    const v = arr.filter((x) => x != null && !isNaN(x));
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
  };
  const sum = (arr) => arr.reduce((a, b) => a + (Number(b) || 0), 0);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const by = (fn) => (a, b) => {
    const x = fn(a), y = fn(b);
    if (typeof x === 'string') return x.localeCompare(y, 'pt-BR', { numeric: true, sensitivity: 'base' });
    return (x ?? Infinity) - (y ?? Infinity);
  };

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
  const validEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s || '');
  const whatsappLink = (phone, text) => {
    let d = digits(phone);
    if (d.length === 10 || d.length === 11) d = '55' + d;
    return `https://wa.me/${d}?text=${encodeURIComponent(text || '')}`;
  };

  // gerador pseudoaleatório determinístico (mulberry32)
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

  const debounce = (fn, ms = 180) => {
    let t;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), ms);
    };
  };

  // CSV com ";" (padrão do Excel em português) e BOM para acentos
  const toCSV = (rows) =>
    '﻿' +
    rows
      .map((r) =>
        r
          .map((c) => {
            const s = c == null ? '' : String(c);
            return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
          })
          .join(';'),
      )
      .join('\r\n');
  const toTSV = (rows) => rows.map((r) => r.map((c) => String(c ?? '').replace(/[\t\n]/g, ' ')).join('\t')).join('\n');
  const download = (filename, content, mime = 'text/csv;charset=utf-8') => {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };
  const slug = (s) => norm(s).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  const greeting = () => {
    const h = new Date().getHours();
    return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
  };

  // Páscoa (algoritmo de Meeus) para feriados móveis
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
    const list = {
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
    holidayCache[y] = list;
    return list;
  };
  const holidayName = (s) => holidays(Number(s.slice(0, 4)))[s] || null;

  const inFrame = (() => {
    try {
      return window.self !== window.top;
    } catch (e) {
      return true;
    }
  })();

  return {
    esc, cap, uid, MONTHS, MONTHS_SHORT, WEEKDAYS, WD_SHORT, pad, iso, today, parse, addDays, ym, addMonths, weekday,
    daysBetween, isValidDate, fmtDate, fmtDayMonth, fmtDateLong, fmtMonth, monthName, fmtMonthShort, relDay, fmtTime,
    money, moneyShort, num, int, pct, parseNum, parseGrade, norm, matches, initials, firstName, shortName, colorIndex,
    age, plural, avg, sum, clamp, by, digits, maskPhone, maskCPF, validCPF, validEmail, whatsappLink, rng, debounce,
    toCSV, toTSV, download, slug, greeting, holidays, holidayName, inFrame,
  };
})();
