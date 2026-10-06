'use strict';
/* Estado da aplicação, persistência no navegador e consultas (regras da escola). */
const Store = (() => {
  const KEY = 'caderneta.escola.v1';
  const listeners = new Set();
  let state = null;
  let undoSnapshot = null;
  let persistent = true;

  const read = () => {
    try {
      const raw = localStorage.getItem(KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      persistent = false;
      return null;
    }
  };
  const write = () => {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
      persistent = true;
    } catch (e) {
      persistent = false;
    }
  };

  const migrate = (s) => {
    const base = Seed.empty();
    const out = { ...base, ...s, settings: { ...base.settings, ...(s.settings || {}) } };
    ['subjects', 'teachers', 'classes', 'students', 'invoices', 'events', 'notices', 'log'].forEach((k) => {
      if (!Array.isArray(out[k])) out[k] = base[k];
    });
    ['attendance', 'grades'].forEach((k) => {
      if (!out[k] || typeof out[k] !== 'object') out[k] = {};
    });
    out.classes.forEach((c) => {
      c.subjects = c.subjects || {};
      c.schedule = c.schedule || [0, 1, 2, 3, 4].map(() => ['', '', '', '', '']);
    });
    return out;
  };

  const load = () => {
    const saved = read();
    state = saved ? migrate(saved) : Seed.demo();
    if (!saved) write();
  };

  const emit = () => listeners.forEach((fn) => fn(state));

  const addLog = (text, icon = 'checkCircle') => {
    state.log.unshift({ at: Date.now(), text, icon });
    state.log = state.log.slice(0, 40);
  };

  return {
    get state() {
      return state;
    },
    get persistent() {
      return persistent;
    },
    load,
    on: (fn) => listeners.add(fn),
    /** Aplica uma alteração. opts: { log, icon, undo, silent } */
    update(fn, opts = {}) {
      if (opts.undo) undoSnapshot = JSON.stringify(state);
      fn(state);
      if (opts.log) addLog(opts.log, opts.icon);
      write();
      if (!opts.silent) emit();
    },
    canUndo: () => !!undoSnapshot,
    undo() {
      if (!undoSnapshot) return false;
      state = migrate(JSON.parse(undoSnapshot));
      undoSnapshot = null;
      write();
      emit();
      return true;
    },
    replace(next) {
      state = migrate(next);
      undoSnapshot = null;
      write();
      emit();
    },
    exportJSON: () => JSON.stringify({ app: 'caderneta-escolar', exportedAt: new Date().toISOString(), data: state }, null, 2),
    validate(obj) {
      const data = obj && obj.data ? obj.data : obj;
      if (!data || typeof data !== 'object' || !Array.isArray(data.students) || !data.settings) return null;
      return data;
    },
  };
})();

/* ---------- consultas ---------- */
const Q = (() => {
  const S = () => Store.state;
  const byId = (list, id) => list.find((x) => x.id === id) || null;
  const cmpName = U.by((x) => x.name);

  const settings = () => S().settings;
  const student = (id) => byId(S().students, id);
  const teacher = (id) => byId(S().teachers, id);
  const klass = (id) => byId(S().classes, id);
  const subject = (id) => byId(S().subjects, id);
  // turmas na ordem da escola: etapa (infantil → médio) e depois nome
  const SEGMENT_ORDER = ['Educação Infantil', 'Fundamental I', 'Fundamental II', 'Ensino Médio', 'EJA'];
  const segRank = (c) => {
    const i = SEGMENT_ORDER.indexOf(c.segment);
    return i < 0 ? SEGMENT_ORDER.length : i;
  };
  const classes = () => S().classes.slice().sort((a, b) => segRank(a) - segRank(b) || cmpName(a, b));
  const teachers = () => S().teachers.slice().sort(cmpName);
  const subjects = () => S().subjects;

  const students = ({ classId = null, status = 'ativo' } = {}) =>
    S()
      .students.filter((a) => (!classId || a.classId === classId) && (status === 'todos' || a.status === status))
      .sort(cmpName);
  const roster = (classId) => students({ classId });

  const classSubjects = (classId) => {
    const c = klass(classId);
    if (!c) return [];
    return S().subjects.filter((s) => s.id in c.subjects || Object.keys(c.subjects).length === 0);
  };
  const teacherClasses = (teacherId) => {
    const out = [];
    S().classes.forEach((c) => {
      const subs = Object.entries(c.subjects)
        .filter(([, t]) => t === teacherId)
        .map(([sid]) => subject(sid))
        .filter(Boolean);
      if (subs.length || c.teacherId === teacherId) out.push({ klass: c, subjects: subs, homeroom: c.teacherId === teacherId });
    });
    return out.sort(U.by((x) => x.klass.name));
  };

  // ---------- notas ----------
  const gkey = (sid, subj, term) => `${sid}|${subj}|${term}`;
  const grade = (sid, subj, term) => {
    const v = S().grades[gkey(sid, subj, term)];
    return v == null ? null : v;
  };
  const subjectAvg = (sid, subj) => U.avg([1, 2, 3, 4].map((t) => grade(sid, subj, t)));
  const termsWithGrade = (sid, subj) => [1, 2, 3, 4].filter((t) => grade(sid, subj, t) != null).length;
  const studentAvg = (sid) => {
    const a = student(sid);
    if (!a) return null;
    return U.avg(classSubjects(a.classId).map((s) => subjectAvg(sid, s.id)));
  };
  const studentTermAvg = (sid, term) => {
    const a = student(sid);
    if (!a) return null;
    return U.avg(classSubjects(a.classId).map((s) => grade(sid, s.id, term)));
  };
  /** Situação de uma média. final=true quando os 4 bimestres estão lançados. */
  const situation = (avg, final = false) => {
    const st = settings();
    if (avg == null) return { label: 'Sem notas', tone: '' };
    if (avg >= st.passing) return { label: final ? 'Aprovado' : 'Na média', tone: 'ok' };
    if (avg >= st.recovery) return { label: final ? 'Recuperação' : 'Atenção', tone: 'warn' };
    return { label: final ? 'Reprovado' : 'Abaixo da média', tone: 'bad' };
  };
  const classAvg = (classId, subj = null, term = null) => {
    const vals = roster(classId).map((a) => {
      if (subj && term) return grade(a.id, subj, term);
      if (subj) return subjectAvg(a.id, subj);
      if (term) return studentTermAvg(a.id, term);
      return studentAvg(a.id);
    });
    return U.avg(vals);
  };
  const termProgress = (term) => {
    let filled = 0, total = 0;
    S().classes.forEach((c) => {
      const kids = roster(c.id);
      classSubjects(c.id).forEach((s) => {
        kids.forEach((a) => {
          total++;
          if (grade(a.id, s.id, term) != null) filled++;
        });
      });
    });
    return { filled, total, pct: total ? (filled / total) * 100 : 0 };
  };
  const pendingGradeSets = (term) => {
    const out = [];
    S().classes.forEach((c) => {
      const kids = roster(c.id);
      if (!kids.length) return;
      classSubjects(c.id).forEach((s) => {
        const missing = kids.filter((a) => grade(a.id, s.id, term) == null).length;
        if (missing) out.push({ klass: c, subject: s, missing, total: kids.length });
      });
    });
    return out;
  };

  // ---------- frequência ----------
  const akey = (classId, date) => `${classId}|${date}`;
  const roll = (classId, date) => S().attendance[akey(classId, date)] || null;
  const studentAttendance = (sid) => {
    const a = student(sid);
    const res = { days: 0, present: 0, absent: 0, justified: 0, rate: null, absences: [] };
    if (!a) return res;
    const prefix = a.classId + '|';
    for (const [k, marks] of Object.entries(S().attendance)) {
      if (!k.startsWith(prefix) || !(sid in marks)) continue;
      res.days++;
      const m = marks[sid];
      if (m === 'P') res.present++;
      else {
        if (m === 'F') res.absent++;
        else res.justified++;
        res.absences.push({ date: k.slice(prefix.length), mark: m });
      }
    }
    // falta justificada não reduz a frequência
    res.rate = res.days ? ((res.present + res.justified) / res.days) * 100 : null;
    res.absences.sort((x, y) => (x.date < y.date ? 1 : -1));
    return res;
  };
  const classAttendance = (classId, from = null) => {
    let p = 0, t = 0, days = 0;
    const prefix = classId + '|';
    for (const [k, marks] of Object.entries(S().attendance)) {
      if (!k.startsWith(prefix)) continue;
      if (from && k.slice(prefix.length) < from) continue;
      days++;
      for (const m of Object.values(marks)) {
        t++;
        if (m !== 'F') p++;
      }
    }
    return { rate: t ? (p / t) * 100 : null, days };
  };
  const dayAttendance = (date) => {
    let present = 0, total = 0, taken = 0;
    const cls = S().classes.filter((c) => roster(c.id).length);
    cls.forEach((c) => {
      const r = roll(c.id, date);
      if (!r) return;
      taken++;
      Object.values(r).forEach((m) => {
        total++;
        if (m !== 'F') present++;
      });
    });
    return { taken, classes: cls.length, rate: total ? (present / total) * 100 : null, present, total, absent: total - present };
  };
  const holiday = (date) => {
    const ev = S().events.find((e) => e.date === date && e.type === 'feriado');
    return ev ? ev.title : U.holidayName(date);
  };
  const isSchoolDay = (date) => {
    const wd = U.weekday(date);
    return wd > 0 && wd < 6 && !holiday(date);
  };
  const lastSchoolDays = (n, from = U.today(), includeFrom = true) => {
    const out = [];
    let d = includeFrom ? from : U.addDays(from, -1);
    let guard = 0;
    while (out.length < n && guard++ < 400) {
      if (isSchoolDay(d)) out.push(d);
      d = U.addDays(d, -1);
    }
    return out.reverse();
  };
  const pendingRolls = (date = U.today()) => (isSchoolDay(date) ? S().classes.filter((c) => roster(c.id).length && !roll(c.id, date)) : []);

  // ---------- financeiro ----------
  const invoiceStatus = (inv, date = U.today()) => (inv.paidAt ? 'pago' : inv.due < date ? 'atrasado' : 'aberto');
  const STATUS_LABEL = { pago: ['Pago', 'ok'], atrasado: ['Atrasado', 'bad'], aberto: ['Em aberto', 'info'] };
  /** Valor atualizado com multa e juros pro rata (configuração da escola). */
  const amountDue = (inv, date = U.today()) => {
    if (inv.paidAt || inv.due >= date) return inv.amount;
    const st = settings();
    const days = U.daysBetween(inv.due, date);
    const fine = inv.amount * (st.lateFine / 100);
    const interest = inv.amount * (st.lateInterest / 100) * (days / 30);
    return Math.round((inv.amount + fine + interest) * 100) / 100;
  };
  const studentInvoices = (sid) => S().invoices.filter((i) => i.studentId === sid).sort((a, b) => (a.due < b.due ? 1 : -1));
  const studentFinance = (sid) => {
    const inv = studentInvoices(sid);
    const overdue = inv.filter((i) => invoiceStatus(i) === 'atrasado');
    const open = inv.filter((i) => invoiceStatus(i) === 'aberto');
    return {
      overdue,
      open,
      overdueTotal: U.sum(overdue.map((i) => amountDue(i))),
      status: overdue.length ? 'atrasado' : 'em dia',
    };
  };
  const monthInvoices = (month) => S().invoices.filter((i) => i.month === month);
  const monthSummary = (month) => {
    const inv = monthInvoices(month);
    const expected = U.sum(inv.map((i) => i.amount));
    const received = U.sum(inv.filter((i) => i.paidAt).map((i) => i.paidAmount ?? i.amount));
    const open = U.sum(inv.filter((i) => !i.paidAt).map((i) => i.amount));
    const overdue = inv.filter((i) => invoiceStatus(i) === 'atrasado');
    return { count: inv.length, expected, received, open, overdueCount: overdue.length, pct: expected ? (received / expected) * 100 : 0 };
  };
  const overdueAll = () => S().invoices.filter((i) => invoiceStatus(i) === 'atrasado');
  const debtors = () => {
    const map = new Map();
    overdueAll().forEach((i) => {
      if (!map.has(i.studentId)) map.set(i.studentId, []);
      map.get(i.studentId).push(i);
    });
    return [...map.entries()]
      .map(([sid, invs]) => ({ student: student(sid), invoices: invs.sort((a, b) => (a.due < b.due ? -1 : 1)), total: U.sum(invs.map((i) => amountDue(i))) }))
      .filter((d) => d.student)
      .sort((a, b) => b.total - a.total);
  };
  const missingInvoices = (month) => {
    const has = new Set(S().invoices.filter((i) => i.month === month && /^Mensalidade/.test(i.description)).map((i) => i.studentId));
    return students().filter((a) => !has.has(a.id));
  };
  const netFee = (a) => Math.round((Number(a.fee) || 0) * (1 - (Number(a.discount) || 0) / 100) * 100) / 100;

  // ---------- agenda ----------
  const EVENT_TYPES = {
    prova: { label: 'Prova', c: 7 },
    reuniao: { label: 'Reunião', c: 1 },
    evento: { label: 'Evento', c: 3 },
    prazo: { label: 'Prazo', c: 2 },
    feriado: { label: 'Feriado', c: 8 },
  };
  const eventsOn = (date) => {
    const list = S().events.filter((e) => e.date === date).sort(U.by((e) => e.time || '99'));
    const h = U.holidayName(date);
    if (h && !list.some((e) => e.type === 'feriado')) list.unshift({ id: 'h-' + date, title: h, date, type: 'feriado', time: '', classId: null, notes: 'Feriado nacional', builtin: true });
    return list;
  };
  const upcoming = (n = 6, from = U.today()) => {
    const out = [];
    for (let i = 0; i < 120 && out.length < n; i++) {
      const d = U.addDays(from, i);
      eventsOn(d).forEach((e) => out.push(e));
    }
    return out.slice(0, n);
  };

  // ---------- diversos ----------
  const birthdays = (month) =>
    students()
      .filter((a) => a.birth && a.birth.slice(5, 7) === month)
      .sort(U.by((a) => a.birth.slice(8)));
  const atRisk = (classId = null) =>
    students({ classId })
      .map((a) => ({ a, avg: studentAvg(a.id), att: studentAttendance(a.id).rate }))
      .filter((x) => (x.avg != null && x.avg < settings().passing) || (x.att != null && x.att < settings().minAttendance));
  const enrollmentNo = () => `${settings().year}${String(settings().nextSeq).padStart(4, '0')}`;
  const audienceLabel = (aud) => (aud === 'all' ? 'Toda a escola' : klass(aud)?.name || 'Turma removida');

  return {
    settings, student, teacher, klass, subject, classes, teachers, subjects, students, roster, classSubjects, teacherClasses,
    gkey, grade, subjectAvg, termsWithGrade, studentAvg, studentTermAvg, situation, classAvg, termProgress, pendingGradeSets,
    akey, roll, studentAttendance, classAttendance, dayAttendance, holiday, isSchoolDay, lastSchoolDays, pendingRolls,
    invoiceStatus, STATUS_LABEL, amountDue, studentInvoices, studentFinance, monthInvoices, monthSummary, overdueAll, debtors,
    missingInvoices, netFee, EVENT_TYPES, eventsOn, upcoming, birthdays, atRisk, enrollmentNo, audienceLabel,
  };
})();
