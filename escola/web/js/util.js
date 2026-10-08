'use strict';
/* Utilitários do navegador: formatação, escape de HTML, exportação e helpers de data.
   As regras puras (datas, máscaras, feriados) vêm do núcleo compartilhado (Core.util). */
const U = (() => {
  const C = Core.util;
  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;' };
  const esc = (v) => (v == null ? '' : String(v).replace(/[&<>"'`]/g, (c) => ESC[c]));

  const MONTHS = C.MONTHS;
  const MONTHS_SHORT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  const WEEKDAYS = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
  const WD_SHORT = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

  /** Hoje no fuso da escola (o retrato traz o fuso nas configurações). */
  const today = () => C.today((typeof Store !== 'undefined' && Store.state && Store.state.settings && Store.state.settings.timezone) || undefined);

  const fmtDate = (s) => (s ? String(s).slice(0, 10).split('-').reverse().join('/') : '—');
  const fmtDayMonth = (s) => {
    const d = C.parse(s);
    return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`;
  };
  const fmtDateLong = (s, withWeekday = true) => {
    const d = C.parse(s);
    const base = `${d.getDate()} de ${MONTHS[d.getMonth()]}`;
    return withWeekday ? `${WEEKDAYS[d.getDay()]}, ${base}` : base;
  };
  const fmtMonth = (month) => {
    const [y, m] = month.split('-').map(Number);
    return `${MONTHS[m - 1]} de ${y}`;
  };
  const fmtMonthShort = (month) => MONTHS_SHORT[Number(month.split('-')[1]) - 1];
  /** Instante ISO (UTC) → "06/10 às 14:32" no horário local. */
  const fmtInstant = (iso, { date = true } = {}) => {
    if (!iso) return '—';
    const d = new Date(iso);
    if (isNaN(d)) return '—';
    const t = `${C.pad(d.getHours())}:${C.pad(d.getMinutes())}`;
    if (!date) return t;
    const day = C.iso(d);
    if (day === today()) return `hoje às ${t}`;
    if (day === C.addDays(today(), -1)) return `ontem às ${t}`;
    return `${C.pad(d.getDate())}/${C.pad(d.getMonth() + 1)} às ${t}`;
  };
  const ago = (iso) => {
    const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
    if (!isFinite(m)) return '';
    if (m < 1) return 'agora';
    if (m < 60) return `há ${m} min`;
    const h = Math.round(m / 60);
    if (h < 24) return `há ${h} h`;
    const d = Math.round(h / 24);
    return d < 30 ? `há ${d} d` : fmtDate(String(iso).slice(0, 10));
  };
  const relDay = (s) => {
    const diff = C.daysBetween(today(), s);
    if (diff === 0) return 'hoje';
    if (diff === 1) return 'amanhã';
    if (diff === -1) return 'ontem';
    if (diff > 1 && diff < 7) return WEEKDAYS[C.weekday(s)].replace('-feira', '');
    if (diff > 0) return `em ${diff} dias`;
    return `há ${-diff} dias`;
  };
  const fmtTime = (d) => `${C.pad(d.getHours())}:${C.pad(d.getMinutes())}`;
  const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : '');

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

  const matches = (query, ...fields) => {
    const q = C.norm(query);
    if (!q) return true;
    const hay = C.norm(fields.join(' '));
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
    const b = C.parse(birth);
    const t = C.parse(today());
    let a = t.getFullYear() - b.getFullYear();
    if (t.getMonth() < b.getMonth() || (t.getMonth() === b.getMonth() && t.getDate() < b.getDate())) a--;
    return a;
  };
  const plural = (n, one, many) => `${int(n)} ${n === 1 ? one : many}`;

  const whatsappLink = (phone, text) => {
    let d = C.digits(phone);
    if (d.length === 10 || d.length === 11) d = '55' + d;
    return d ? `https://wa.me/${d}?text=${encodeURIComponent(text || '')}` : `https://wa.me/?text=${encodeURIComponent(text || '')}`;
  };

  const debounce = (fn, ms = 180) => {
    let t;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), ms);
    };
  };

  /** Evita que planilhas executem fórmulas digitadas por usuários (=, +, -, @, tab, CR no início). */
  const cell = (c) => {
    // quebras de linha viram \n; qualquer início de linha que pareça fórmula ganha apóstrofo
    const s = (c == null ? '' : String(c)).replace(/\r\n?/g, '\n');
    return s.split('\n').map((line) => (/^[=+\-@\t]/.test(line) ? `'${line}` : line)).join('\n');
  };
  const toCSV = (rows) =>
    '﻿' +
    rows.map((r) => r.map((c) => {
      const s = cell(c);
      return /[";\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    }).join(';')).join('\r\n');
  const toTSV = (rows) => rows.map((r) => r.map((c) => cell(c).replace(/[\t\r\n]+/g, ' ')).join('\t')).join('\n');
  const download = (filename, content, mime = 'text/csv;charset=utf-8') => {
    const blob = content instanceof Blob ? content : new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };
  const slug = (s) => C.norm(s).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const greeting = () => {
    const h = new Date().getHours();
    return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
  };
  /** Links clicáveis num texto já escapado (só http/https, abrem em nova aba). */
  const linkify = (escaped) => escaped.replace(/\bhttps?:\/\/[^\s<>"']+[^\s<>"'.,;:!?)]/g, (u) => `<a href="${u}" target="_blank" rel="noopener noreferrer">${u}</a>`);

  const inFrame = (() => {
    try {
      return window.self !== window.top;
    } catch (e) {
      return true;
    }
  })();

  return {
    ...C, esc, MONTHS, MONTHS_SHORT, WEEKDAYS, WD_SHORT, today, fmtDate, fmtDayMonth, fmtDateLong, fmtMonth, fmtMonthShort, fmtInstant, ago, relDay,
    fmtTime, cap, money, moneyShort, num, int, pct, parseNum, parseGrade, matches, initials, firstName, shortName, colorIndex, age, plural,
    whatsappLink, debounce, cell, toCSV, toTSV, download, slug, greeting, linkify, inFrame,
  };
})();
