'use strict';
/* Estado do app no navegador.
   Store: guarda o retrato que o servidor mandou (só em memória), aplica os deltas, envia comandos
   (em fila, com requestId para não repetir), recarrega quando o servidor pede e trata sessão vencida.
   Q: consultas usadas pelas telas (as regras da escola vêm de Core.rules, iguais às do servidor). */
const Store = (() => {
  const KINDS = Core.schema.KINDS;
  const listeners = new Set();
  let data = null; // coleções filtradas para o usuário
  let me = null;
  let reads = {};
  let rev = 0;
  let boot = null;
  let readsSince = null; // instante (do servidor) até onde já recebemos os "visualizados"
  let preview = null; // {saved, me} quando está "vendo como"
  let online = true;
  let queue = Promise.resolve();
  let pending = 0;
  let pollTimer = null;
  let polling = false;
  let index = new Map(); // coll → Map(id → doc), refeito sob demanda
  let version = 0; // muda a cada alteração local (para caches das consultas)

  // ---------- notificação das telas ----------
  let scheduled = false;
  const emit = () => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      listeners.forEach((fn) => {
        try {
          fn();
        } catch (e) {
          console.error(e);
        }
      });
    });
  };
  const setOnline = (v) => {
    if (online === v) return;
    online = v;
    emit();
  };

  // ---------- retrato e deltas ----------
  const install = (snap) => {
    const next = {};
    for (const [coll, kind] of Object.entries(KINDS)) {
      const v = snap.data[coll];
      next[coll] = kind === 'list' ? (Array.isArray(v) ? v : []) : v && typeof v === 'object' ? v : {};
    }
    data = next;
    me = snap.me;
    if (!preview) window.__cadernetaModo = !me ? undefined : me.family ? 'familia' : 'equipe'; // área desta aba (o servidor confere)
    reads = snap.reads || {};
    rev = Number(snap.rev) || 0;
    boot = snap.boot || null;
    readsSince = snap.now || null;
    index = new Map();
    version++;
    emit();
  };
  const apply = (changes) => {
    if (!changes || !changes.length || !data) return;
    for (const c of changes) {
      const kind = KINDS[c.coll];
      if (!kind) continue;
      if (kind === 'single') {
        if (c.op === 'put') data[c.coll] = c.value;
      } else if (kind === 'list') {
        const list = data[c.coll];
        const i = list.findIndex((d) => d.id === c.id);
        if (c.op === 'put') {
          if (i >= 0) list[i] = c.value;
          else list.push(c.value);
        } else if (i >= 0) list.splice(i, 1);
      } else if (c.op === 'put') data[c.coll][c.id] = c.value;
      else delete data[c.coll][c.id];
      index.delete(c.coll);
    }
    version++;
    emit();
  };

  const load = async () => {
    const snap = await Api.snapshot();
    install(snap);
    setOnline(true);
    return snap;
  };

  const poll = async () => {
    if (!me || preview || polling || pending) return;
    polling = true;
    try {
      const r = await Api.changes(rev, boot, readsSince);
      if (r.resync) await load();
      else {
        if (r.reads && r.reads.length) {
          for (const [item, uid, at] of r.reads) reads[item] = { ...(reads[item] || {}), [uid]: at };
          version++;
          if (!r.changes || !r.changes.length) emit();
        }
        apply(r.changes);
        rev = r.rev;
        if (r.now) readsSince = r.now;
      }
      setOnline(true);
    } catch (err) {
      if (err.code === 'network' || err.status >= 500) setOnline(false);
      else if (err.status === 401) App.sessionExpired();
    } finally {
      polling = false;
    }
  };
  const startPolling = () => {
    stopPolling();
    pollTimer = setInterval(() => document.visibilityState === 'visible' && poll(), 15000);
  };
  const stopPolling = () => {
    clearInterval(pollTimer);
    pollTimer = null;
  };
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && pollTimer) poll();
  });
  window.addEventListener('online', () => pollTimer && poll());

  const newRequestId = () => {
    try {
      return crypto.randomUUID();
    } catch (e) {
      return Core.util.uid('q') + Core.util.uid('r');
    }
  };

  /** Resultado de um comando ou desfazer: aplica as mudanças e acerta a revisão. */
  const absorb = async (res) => {
    apply(res.changes);
    if (res.resync) await load();
    else if (res.rev === rev + 1) rev = res.rev;
    else if (res.rev > rev) setTimeout(poll, 0);
  };

  /** Erros que indicam dados desatualizados: recarrega o retrato em segundo plano. */
  const STALE = new Set(['not_found', 'forbidden', 'conflict']);

  const send = async (fn) => {
    pending++;
    try {
      let res;
      try {
        res = await fn();
      } catch (err) {
        if (err.status === 401 && (await App.relogin())) res = await fn();
        else throw err;
      }
      setOnline(true);
      await absorb(res);
      return res;
    } catch (err) {
      if (err.code === 'network') setOnline(false);
      if (STALE.has(err.code)) setTimeout(() => load().catch(() => {}), 0);
      throw err;
    } finally {
      pending--;
    }
  };

  /**
   * Envia um comando. opts: {password}. Comandos que pedem senha (reauth) abrem a confirmação sozinhos.
   * Devolve {result, effects?, undoToken?}. Erros: ApiError {code, message, field}.
   */
  const cmd = (name, input = {}, opts = {}) => {
    const run = async () => {
      if (preview) throw new ApiError('forbidden', 'No modo "ver como" nada pode ser alterado.');
      if (!me) throw new ApiError('unauthorized', 'Entre para continuar.', 401);
      const spec = Core.engine.get(name);
      let password = opts.password;
      if (spec && spec.reauth && !password) {
        password = await UI.askPassword({ text: Api.isLocal ? 'Esta ação pede a sua senha. (Na demonstração, contas sem senha podem confirmar com qualquer texto.)' : 'Por segurança, esta ação pede a sua senha.' });
        if (!password) throw new ApiError('canceled', 'Ação cancelada.');
      }
      const requestId = newRequestId();
      return send(() => Api.cmd(name, input, requestId, password));
    };
    const p = queue.then(run, run);
    queue = p.catch(() => {});
    return p;
  };

  const undo = (token) => {
    const run = () => send(() => Api.undo(token));
    const p = queue.then(run, run);
    queue = p.catch(() => {});
    return p;
  };

  // ---------- "ver como" (somente leitura) ----------
  const startPreview = async (userId) => {
    const snap = await Api.preview(userId);
    if (!preview) preview = { saved: { data, me, reads, rev, boot } };
    stopPolling();
    install(snap);
    preview.me = snap.me;
  };
  const endPreview = async () => {
    if (!preview) return;
    const { saved } = preview;
    preview = null;
    install({ data: saved.data, me: saved.me, reads: saved.reads, rev: saved.rev, boot: saved.boot });
    startPolling();
    await poll();
  };

  const byId = (coll, id) => {
    if (!data || !id) return null;
    let m = index.get(coll);
    if (!m) {
      m = new Map((data[coll] || []).map((d) => [d.id, d]));
      index.set(coll, m);
    }
    return m.get(id) || null;
  };

  return {
    get state() {
      return data;
    },
    get me() {
      return me;
    },
    get reads() {
      return reads;
    },
    get rev() {
      return rev;
    },
    get version() {
      return version;
    },
    get online() {
      return online;
    },
    get preview() {
      return preview ? preview.me : null;
    },
    get ready() {
      return !!data && !!me;
    },
    get family() {
      return !!(me && me.family);
    },
    on: (fn) => listeners.add(fn),
    off: (fn) => listeners.delete(fn),
    emit,
    load,
    poll,
    startPolling,
    stopPolling,
    apply,
    cmd,
    undo,
    byId,
    startPreview,
    endPreview,
    /** Tem a permissão? (família nunca tem permissões de equipe) */
    can: (p) => !!(me && me.perms && me.perms.includes(p)),
    canAny: (...ps) => !!(me && me.perms && ps.some((p) => me.perms.includes(p))),
    /** Registra "visualizado" (família) e atualiza na hora. */
    async markRead(itemIds) {
      if (!me || preview || !me.family) return;
      const ids = itemIds.filter((id) => !(reads[id] && reads[id][me.id]));
      if (!ids.length) return;
      try {
        const r = await Api.read(ids);
        const at = new Date().toISOString();
        for (const id of r.ids || []) reads[id] = { ...(reads[id] || {}), [me.id]: at };
        emit();
      } catch (e) {
        /* tenta de novo na próxima abertura */
      }
    },
    /** Equipe ↔ Portal da família (conta de equipe que também é responsável). */
    async setMode(mode) {
      await Api.mode(mode);
      PageState.clear();
      await load();
    },
    /** Limpa tudo (saída). */
    clear() {
      stopPolling();
      data = null;
      me = null;
      reads = {};
      rev = 0;
      boot = null;
      preview = null;
      index = new Map();
      window.__cadernetaModo = undefined;
      PageState.clear();
    },
  };
})();

/* ===================================================================== */
/* Consultas                                                              */
/* ===================================================================== */
const Q = (() => {
  const R = Core.rules;
  const S = () => Store.state;
  const cmpName = (a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'pt-BR');
  const SEG_ORDER = ['Educação Infantil', 'Fundamental I', 'Fundamental II', 'Ensino Médio', 'EJA', 'Outro'];
  const segRank = (seg) => {
    const i = SEG_ORDER.indexOf(seg);
    return i < 0 ? SEG_ORDER.length : i;
  };

  const settings = () => S().settings || {};
  const year = () => String(settings().year || U.today().slice(0, 4));
  const me = () => Store.me;
  const today = () => U.today();

  // ---------- documentos ----------
  const user = (id) => Store.byId('users', id);
  const student = (id) => Store.byId('students', id);
  const klass = (id) => Store.byId('classes', id);
  const subject = (id) => Store.byId('subjects', id);
  const file = (id) => Store.byId('files', id);
  const diaryItem = (id) => Store.byId('diary', id);
  const message = (id) => Store.byId('messages', id);
  const invoice = (id) => Store.byId('invoices', id);
  const plan = (id) => Store.byId('plans', id);
  const userName = (id, fallback = '—') => (id === 'system' ? 'Sistema' : (user(id) || {}).name || fallback);

  // ---------- turmas ----------
  const classSort = (a, b) => segRank(a.segment) - segRank(b.segment) || cmpName(a, b);
  /** Turmas ativas visíveis (o retrato já vem filtrado pelo escopo). */
  const classes = ({ includeClosed = false } = {}) => S().classes.filter((c) => includeClosed || c.status !== 'encerrada').sort(classSort);
  /** Turmas em que eu atuo (regente, disciplina, auxiliar ou vínculo). */
  const myClasses = () => {
    const m = me();
    if (!m) return [];
    const own = new Set(m.classIds || []);
    return classes().filter((c) => c.teacherId === m.id || (c.assistantIds || []).includes(m.id) || Object.values(c.subjects || {}).includes(m.id) || (m.scope !== 'todas' && own.has(c.id)));
  };
  /** Turmas para escolher numa tela: as minhas primeiro; se não tenho vínculo, todas as visíveis. */
  const workClasses = () => {
    const mine = myClasses();
    return mine.length ? mine.concat(classes().filter((c) => !mine.includes(c))) : classes();
  };
  const segments = () => {
    const set = new Set(Object.keys(settings().segments || {}));
    classes().forEach((c) => c.segment && set.add(c.segment));
    return [...set].sort((a, b) => segRank(a) - segRank(b));
  };
  const segmentCfg = (classId) => R.segmentCfg(settings(), klass(classId));
  const evaluation = (classId) => R.evaluation(settings(), klass(classId));
  const attendanceMode = (classId) => R.attendanceMode(settings(), klass(classId));
  /** Disciplinas da turma (na ordem do cadastro). */
  const classSubjects = (classId) => {
    const c = klass(classId);
    if (!c) return [];
    const keys = Object.keys(c.subjects || {});
    return S().subjects.filter((s) => keys.includes(s.id));
  };
  const teacherOf = (classId, subjectId) => {
    const c = klass(classId);
    return c && c.subjects ? c.subjects[subjectId] || null : null;
  };
  /** Disciplinas da turma em que eu posso lançar nota (regra igual à do servidor). */
  const canGradeSubject = (classId, subjectId) => {
    const m = me();
    const c = klass(classId);
    if (!m || !c || !Store.can('notas.lancar')) return false;
    if (m.scope === 'todas') return true;
    const t = c.subjects ? c.subjects[subjectId] : undefined;
    if (t === m.id) return true;
    return c.teacherId === m.id && !t;
  };

  // ---------- alunos ----------
  const students = ({ classId = null, status = 'ativo', query = '' } = {}) =>
    S()
      .students.filter((s) => (status === 'todos' || s.status === status) && (!classId || s.classId === classId) && (!query || U.matches(query, s.name, s.enrollment, (s.guardians || []).map((g) => g.name).join(' '))))
      .sort(cmpName);
  const roster = (classId) => students({ classId });
  const age = (s) => U.age(s.birth);
  const guardians = (s) => (s && s.guardians) || [];
  /** Responsável pedagógico principal (para contato). */
  const mainGuardian = (s) => guardians(s).find((g) => g.pedagogico && !g.bloqueado) || guardians(s)[0] || null;
  /** Filhos da conta de família atual. */
  const myChildren = () => {
    const m = me();
    if (!m || !m.family) return [];
    const ids = new Set(m.studentIds || []);
    return S().students.filter((s) => ids.has(s.id)).sort(cmpName);
  };
  /** Meu registro de responsável na ficha do aluno (família). */
  const myGuardianRecord = (s) => {
    const m = me();
    return m ? guardians(s).find((g) => g.userId === m.id) || null : null;
  };

  // ---------- equipe ----------
  const staff = ({ status = 'ativo' } = {}) => S().users.filter((u) => u.role !== 'responsavel' && (status === 'todos' || u.status === status)).sort(cmpName);
  const familyUsers = () => S().users.filter((u) => u.role === 'responsavel').sort(cmpName);
  const roleLabel = (role) => Core.perms.roleLabel(role);
  const personLabel = (id) => {
    const u = user(id);
    if (!u) return 'Equipe da escola';
    return u.title || roleLabel(u.role);
  };

  // ---------- etapas e notas ----------
  const termLabel = (t, { short = false } = {}) => {
    const label = settings().termLabel || 'bimestre';
    if (t === 'rf') return short ? 'Final' : 'Recuperação final';
    if (String(t).startsWith('rec')) return short ? `Rec. ${String(t).slice(3)}` : `Recuperação do ${String(t).slice(3)}º ${label}`;
    return short ? `${t}º ${label.slice(0, 3)}.` : `${t}º ${label}`;
  };
  const terms = () => R.terms(settings());
  const currentTerm = () => Number(settings().term) || 1;
  const termOpen = (term, y = year()) => R.termOpen(settings(), y, term);
  const termReleased = (term, y = year()) => R.termReleased(settings(), y, term);
  const grade = (sid, subjectId, term, y = year()) => {
    const v = S().grades[R.gradeKey(y, sid, subjectId, term)];
    return v === undefined ? null : v;
  };
  const termGrade = (sid, subjectId, term, y = year()) => R.termGrade(S().grades, y, sid, subjectId, term);
  const subjectAverage = (sid, subjectId, y = year()) => R.subjectAverage(S().grades, settings(), y, sid, subjectId);
  const subjectFinal = (sid, subjectId, y = year()) => R.subjectFinal(S().grades, settings(), y, sid, subjectId);
  const situation = (value, complete = false) => R.situation(value, settings(), complete);
  const council = (sid, y = year()) => S().councils[`${y}|${sid}`] || null;

  // ---------- frequência ----------
  const periods = (classId, date) => (klass(classId) ? R.periodsFor(settings(), klass(classId), date) : []);
  const attendance = (classId, date, period) => S().attendance[R.attendanceKey(classId, date, period)] || null;
  const isSchoolDay = (date) => R.isSchoolDay(S(), date);
  const holiday = (date) => R.holiday(S(), date);
  const lastSchoolDays = (n, from = today(), includeFrom = true) => R.lastSchoolDays(S(), n, from, includeFrom);
  let attCache = { key: null, idx: null };
  /** Índice de frequência do ano (em cache até a próxima mudança). */
  const attendanceIndex = (opts = {}) => {
    const key = JSON.stringify(opts) + '|' + Store.version;
    if (attCache.key !== key) attCache = { key, idx: R.attendanceIndex(S().attendance, { year: year(), ...opts }) };
    return attCache.idx;
  };
  const attendanceRate = (sid) => R.rateOf(attendanceIndex().get(sid));
  const minAttendance = (classId) => R.minAttendance(settings(), klass(classId));
  const attTone = (rate, classId) => {
    if (rate == null) return '';
    const min = minAttendance(classId);
    return rate < min ? 'bad' : rate < min + 10 ? 'warn' : 'ok';
  };
  const consecutiveAbsences = (sid, classId) => R.consecutiveAbsences(S().attendance, sid, classId);
  /** Turmas (que eu posso registrar) sem chamada hoje. */
  const pendingRolls = (date = today()) => {
    // a tela de chamada registra Q.rollsToDo com a regra exata de quem registra cada aula
    if (typeof Q.rollsToDo === 'function') return Q.rollsToDo(date).map((x) => x.klass);
    if (!Store.can('chamada.registrar') || !isSchoolDay(date)) return [];
    const mine = Store.me.scope === 'todas' ? [] : myClasses();
    return (mine.length ? mine : classes()).filter((c) => roster(c.id).length && periods(c.id, date).some((p) => !attendance(c.id, date, p.period)));
  };

  // ---------- financeiro ----------
  const invoiceStatus = (inv, date = today()) => R.invoiceStatus(inv, date);
  const amountDue = (inv, date = today()) => R.amountDue(inv, date, settings());
  const netFee = (s) => R.netFee(s);
  const studentInvoices = (sid) => S().invoices.filter((i) => i.studentId === sid).sort((a, b) => (a.due < b.due ? 1 : -1));
  const overdue = () => S().invoices.filter((i) => invoiceStatus(i) === 'atrasado');
  const chargesFees = () => settings().chargesFees !== false;

  // ---------- agenda, leituras, mensagens ----------
  const DIARY_TYPES = {
    dever: { label: 'Dever de casa', icon: 'bookOpen', tone: 'c1' },
    recado: { label: 'Recado', icon: 'message', tone: 'c3' },
    lembrete: { label: 'Lembrete', icon: 'bell', tone: 'c4' },
    autorizacao: { label: 'Autorização', icon: 'shieldCheck', tone: 'c7' },
    ocorrencia: { label: 'Ocorrência', icon: 'flag', tone: 'c8' },
  };
  const OCCURRENCE_CATEGORIES = { comportamento: 'Comportamento', atraso: 'Atraso', uniforme: 'Uniforme', material: 'Material', tarefa: 'Tarefa não feita', elogio: 'Elogio' };
  const homeworkLabel = () => settings().homeworkLabel || 'Dever de casa';
  const diaryTypeLabel = (t) => (t === 'dever' ? homeworkLabel() : (DIARY_TYPES[t] || {}).label || 'Item');
  const readers = (itemId) => Object.keys(Store.reads[itemId] || {});
  const isRead = (itemId) => {
    const m = me();
    return !!(m && Store.reads[itemId] && Store.reads[itemId][m.id]);
  };
  /** Ciente/respostas de um item: {studentId: {guardianId: ack}} */
  const acks = (itemId) => S().acks[itemId] || {};
  /** A resposta que vale para uma autorização: qualquer "não" prevalece. */
  const authorizationAnswer = (itemId, sid) => {
    const entries = Object.values(acks(itemId)[sid] || {});
    if (entries.some((a) => a.answer === 'nao')) return 'nao';
    if (entries.some((a) => a.answer === 'sim')) return 'sim';
    return entries.length ? 'ciente' : null;
  };
  const diaryFor = ({ classId = null, studentId = null, from = null, to = null, types = null, status = null } = {}) =>
    S()
      .diary.filter(
        (d) =>
          (!classId || d.classId === classId) &&
          (!studentId || (d.recipients || []).includes(studentId)) &&
          (!from || d.date >= from) &&
          (!to || d.date <= to) &&
          (!types || types.includes(d.type)) &&
          (!status || (Array.isArray(status) ? status.includes(d.status) : d.status === status)),
      )
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : (b.createdAt || '').localeCompare(a.createdAt || '')));
  const pendingApprovals = () => (Store.can('diario.aprovar') ? S().diary.filter((d) => d.status === 'pendente') : []);
  const openMessages = () => S().messages.filter((m) => m.status === 'aberta');
  const routine = (classId, date, sid) => S().routines[`${classId}|${date}|${sid}`] || null;

  // ---------- eventos e comunicados ----------
  const EVENT_TYPES = {
    prova: { label: 'Prova', c: 7 },
    reuniao: { label: 'Reunião', c: 1 },
    evento: { label: 'Evento', c: 3 },
    prazo: { label: 'Prazo', c: 2 },
    feriado: { label: 'Feriado', c: 8 },
  };
  const classesById = () => new Map(S().classes.map((c) => [c.id, c]));
  const audienceLabel = (aud) => R.audienceLabel(aud, classesById());
  const eventsOn = (date) => S().events.filter((e) => e.date === date).sort((a, b) => (a.time || '').localeCompare(b.time || ''));
  const upcoming = (n = 6, from = today()) =>
    S()
      .events.filter((e) => e.date >= from)
      .sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || '')))
      .slice(0, n);
  const notices = () => S().notices.slice().sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || (b.date || '').localeCompare(a.date || ''));

  // ---------- atendimentos ----------
  const AREAS = { psicologia: 'Psicologia', psicopedagogia: 'Psicopedagogia', orientacao: 'Orientação educacional', aee: 'AEE', servico_social: 'Serviço social' };
  const supportFor = (sid) => S().support.filter((r) => r.studentId === sid).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const plansFor = (sid) => S().plans.filter((p) => p.studentId === sid);

  return {
    settings, year, me, today, user, student, klass, subject, file, diaryItem, message, invoice, plan, userName,
    classes, myClasses, workClasses, segments, segRank, SEG_ORDER, segmentCfg, evaluation, attendanceMode, classSubjects, teacherOf, canGradeSubject,
    students, roster, age, guardians, mainGuardian, myChildren, myGuardianRecord,
    staff, familyUsers, roleLabel, personLabel,
    termLabel, terms, currentTerm, termOpen, termReleased, grade, termGrade, subjectAverage, subjectFinal, situation, council,
    periods, attendance, isSchoolDay, holiday, lastSchoolDays, attendanceIndex, attendanceRate, minAttendance, attTone, consecutiveAbsences, pendingRolls,
    invoiceStatus, amountDue, netFee, studentInvoices, overdue, chargesFees,
    DIARY_TYPES, OCCURRENCE_CATEGORIES, homeworkLabel, diaryTypeLabel, readers, isRead, acks, authorizationAnswer, diaryFor, pendingApprovals, openMessages, routine,
    EVENT_TYPES, classesById, audienceLabel, eventsOn, upcoming, notices,
    AREAS, supportFor, plansFor, cmpName,
  };
})();
