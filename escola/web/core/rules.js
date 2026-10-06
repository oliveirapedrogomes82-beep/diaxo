/* Caderneta Escolar — regras de negócio puras (frequência, notas, cobranças, calendário).
   Usadas pelos comandos no servidor e pelas consultas no navegador, para os dois lados concordarem sempre. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./util'));
  else (root.Core = root.Core || {}).rules = factory(root.Core.util);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (util) {
  'use strict';
  const { avg, round2 } = util;

  // ---------- etapas de ensino ----------
  const DEFAULT_SEGMENT = { attendance: 'diaria', minAttendance: 75, evaluation: 'nota' };
  const segmentCfg = (settings, klass) => ({ ...DEFAULT_SEGMENT, ...((settings && settings.segments && klass && settings.segments[klass.segment]) || {}) });
  const attendanceMode = (settings, klass) => segmentCfg(settings, klass).attendance;
  const minAttendance = (settings, klass) => Number(segmentCfg(settings, klass).minAttendance) || 75;
  const evaluation = (settings, klass) => segmentCfg(settings, klass).evaluation;
  /** Rótulo do responsável pela turma: regente (Infantil/Fund. I) ou conselheiro(a). */
  const homeroomLabel = (klass) => (klass && ['Educação Infantil', 'Fundamental I'].includes(klass.segment) ? 'Professor(a) regente' : 'Professor(a) conselheiro(a)');

  // ---------- calendário ----------
  const holiday = (state, date) => {
    const ev = (state.events || []).find((e) => e.date === date && e.type === 'feriado');
    return ev ? ev.title : util.holidayName(date);
  };
  const isSchoolDay = (state, date) => {
    const wd = util.weekday(date);
    return wd > 0 && wd < 6 && !holiday(state, date);
  };
  /** Últimos n dias letivos até `from` (inclusive, se includeFrom). */
  const lastSchoolDays = (state, n, from, includeFrom = true) => {
    const out = [];
    let d = includeFrom ? from : util.addDays(from, -1);
    for (let guard = 0; out.length < n && guard < 400; guard++) {
      if (isSchoolDay(state, d)) out.push(d);
      d = util.addDays(d, -1);
    }
    return out.reverse();
  };

  // ---------- chamada ----------
  /** Aulas do dia: [{period: 1.., subjectId}] no modo por aula; [{period: 0}] no modo diário. */
  const periodsFor = (settings, klass, date) => {
    if (attendanceMode(settings, klass) !== 'por_aula') return [{ period: 0, subjectId: null }];
    const wd = util.weekday(date);
    if (wd < 1 || wd > 5) return [];
    const day = (klass.schedule || [])[wd - 1] || [];
    return day.map((subjectId, i) => ({ period: i + 1, subjectId: subjectId || null })).filter((p) => p.subjectId);
  };
  const attendanceKey = (classId, date, period) => `${classId}|${date}|${period}`;
  /** Lista de chamada de uma data: quem já foi marcado ∪ alunos ativos da turma. */
  const roster = (state, classId, date, period) => {
    const rec = state.attendance[attendanceKey(classId, date, period)];
    const ids = new Set(rec ? Object.keys(rec.marks || {}) : []);
    for (const s of state.students) if (s.classId === classId && s.status === 'ativo') ids.add(s.id);
    return state.students.filter((s) => ids.has(s.id));
  };

  /**
   * Índice de frequência por aluno em uma passada: {studentId: {lessons, P, F, J, A, days: Set, absDays: [datas]}}.
   * F e J contam como falta; A (abono/compensação) sai do total.
   */
  const attendanceIndex = (attendance, { year = null, from = null, to = null } = {}) => {
    const idx = new Map();
    for (const k of Object.keys(attendance)) {
      const p1 = k.indexOf('|');
      const date = k.slice(p1 + 1, p1 + 11);
      if (year && date.slice(0, 4) !== String(year)) continue;
      if (from && date < from) continue;
      if (to && date > to) continue;
      const marks = attendance[k].marks || {};
      for (const sid of Object.keys(marks)) {
        let e = idx.get(sid);
        if (!e) idx.set(sid, (e = { lessons: 0, P: 0, F: 0, J: 0, A: 0, absDates: new Set() }));
        const m = marks[sid];
        e.lessons++;
        if (e[m] !== undefined) e[m]++;
        if (m === 'F' || m === 'J') e.absDates.add(date);
      }
    }
    return idx;
  };
  /** Frequência em % (null sem aulas). */
  const rateOf = (e) => {
    if (!e) return null;
    const counted = e.lessons - e.A;
    return counted > 0 ? ((counted - e.F - e.J) / counted) * 100 : null;
  };
  /** Faltas seguidas mais recentes (por dia letivo com chamada). */
  const consecutiveAbsences = (attendance, studentId, classId) => {
    const byDate = new Map();
    for (const k of Object.keys(attendance)) {
      if (!k.startsWith(classId + '|')) continue;
      const m = (attendance[k].marks || {})[studentId];
      if (!m) continue;
      const date = k.split('|')[1];
      const cur = byDate.get(date);
      // presente em qualquer aula do dia = presente no dia
      byDate.set(date, cur === 'P' || m === 'P' || m === 'A' ? 'P' : 'F');
    }
    const dates = [...byDate.keys()].sort().reverse();
    let n = 0;
    for (const d of dates) {
      if (byDate.get(d) === 'F') n++;
      else break;
    }
    return n;
  };

  // ---------- notas ----------
  const gradeKey = (year, sid, subjectId, term) => `${year}|${sid}|${subjectId}|${term}`;
  /** Nota da etapa considerando a recuperação (vale a maior). */
  const termGrade = (grades, year, sid, subjectId, term) => {
    const g = grades[gradeKey(year, sid, subjectId, term)];
    const r = grades[gradeKey(year, sid, subjectId, 'rec' + term)];
    const v = typeof g === 'number' ? g : null;
    const rv = typeof r === 'number' ? r : null;
    if (v == null) return rv;
    return rv != null && rv > v ? rv : v;
  };
  const terms = (settings) => Array.from({ length: Number(settings.termCount) || 4 }, (_, i) => i + 1);
  const subjectAverage = (grades, settings, year, sid, subjectId) => avg(terms(settings).map((t) => termGrade(grades, year, sid, subjectId, t)));
  const subjectFinal = (grades, settings, year, sid, subjectId) => {
    const a = subjectAverage(grades, settings, year, sid, subjectId);
    const rf = grades[gradeKey(year, sid, subjectId, 'rf')];
    if (typeof rf === 'number' && a != null && a < settings.passing) return Math.max(a, rf);
    return a;
  };
  const termsWithGrade = (grades, settings, year, sid, subjectId) => terms(settings).filter((t) => termGrade(grades, year, sid, subjectId, t) != null).length;
  /** Situação de uma média. complete=true quando todas as etapas estão lançadas. */
  const situation = (value, settings, complete = false) => {
    if (value == null) return { label: 'Sem notas', tone: '' };
    if (value >= settings.passing) return { label: complete ? 'Aprovado(a)' : 'Na média', tone: 'ok' };
    if (value >= settings.recovery) return { label: complete ? 'Recuperação' : 'Atenção', tone: 'warn' };
    return { label: complete ? 'Reprovado(a)' : 'Abaixo da média', tone: 'bad' };
  };
  const termOpen = (settings, year, term) => !(settings.terms && settings.terms[year] && settings.terms[year][term] && settings.terms[year][term].closed);
  const termReleased = (settings, year, term) => !!(settings.terms && settings.terms[year] && settings.terms[year][term] && settings.terms[year][term].released);

  // ---------- financeiro ----------
  const netFee = (s) => round2((Number(s.fee) || 0) * (1 - (Number(s.discount) || 0) / 100));
  const invoiceStatus = (inv, today) => (inv.paidAt ? 'pago' : inv.due < today ? 'atrasado' : 'aberto');
  /** Valor atualizado: multa + juros pro rata (configuração da escola). */
  const amountDue = (inv, today, settings) => {
    if (inv.paidAt || inv.due >= today) return inv.amount;
    const days = util.daysBetween(inv.due, today);
    const fine = inv.amount * ((Number(settings.lateFine) || 0) / 100);
    const interest = inv.amount * ((Number(settings.lateInterest) || 0) / 100) * (days / 30);
    return round2(inv.amount + fine + interest);
  };

  // ---------- público (eventos e comunicados) ----------
  const audienceLabel = (aud, classesById) => {
    const a = aud || {};
    const who = { todos: 'Todos', familias: 'Famílias', equipe: 'Só a equipe' }[a.who] || 'Todos';
    const where = (a.classIds || []).map((id) => (classesById.get(id) || {}).name).filter(Boolean).concat(a.segments || []);
    return where.length ? `${who} · ${where.join(', ')}` : `${who} · escola toda`;
  };
  /** Público alcança alguma das turmas informadas? (lista vazia = escola toda) */
  const audienceTouches = (aud, classIds, classesById) => {
    const a = aud || {};
    if (!(a.classIds || []).length && !(a.segments || []).length) return true;
    for (const cid of classIds) {
      if ((a.classIds || []).includes(cid)) return true;
      const c = classesById.get(cid);
      if (c && (a.segments || []).includes(c.segment)) return true;
    }
    return false;
  };

  return {
    DEFAULT_SEGMENT, segmentCfg, attendanceMode, minAttendance, evaluation, homeroomLabel, holiday, isSchoolDay, lastSchoolDays,
    periodsFor, attendanceKey, roster, attendanceIndex, rateOf, consecutiveAbsences, gradeKey, termGrade, terms, subjectAverage,
    subjectFinal, termsWithGrade, situation, termOpen, termReleased, netFee, invoiceStatus, amountDue, audienceLabel, audienceTouches,
  };
});
