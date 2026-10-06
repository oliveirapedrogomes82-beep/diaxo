/* Caderneta Escolar — migrações de dados.
   fromV1: converte os dados da v1 (app só no navegador) para o formato do contrato 2.0.
   upgrade: aplica migrações ordenadas conforme meta.dataVersion. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./util'), require('./schema'), require('./seed'));
  else (root.Core = root.Core || {}).migrate = factory(root.Core.util, root.Core.schema, root.Core.seed);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (util, schema, seed) {
  'use strict';

  /** É um backup/estado da v1? (tem `teachers` e `guardian` único) */
  const isV1 = (d) => !!d && Array.isArray(d.teachers) && Array.isArray(d.students) && !('acks' in d && typeof d.acks === 'object' && !Array.isArray(d.acks) && d.version === 2);

  /**
   * Converte a v1. Ids da v1 ("a12", "c3", "t4", "s1"…) são renumerados para o formato atual.
   * Professores viram contas da equipe sem acesso ao sistema (a direção convida depois).
   */
  function fromV1(v1, env = {}) {
    const today = env.today || util.today();
    const st = seed.empty(today);
    const old = v1.settings || {};
    const year = Number(old.year) || Number(today.slice(0, 4));
    const map = {};
    const nid = (prefix, oldId) => {
      const k = prefix + ':' + oldId;
      if (!map[k]) map[k] = prefix + 'v1' + String(oldId).toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 30);
      return map[k];
    };
    Object.assign(st.settings, {
      schoolName: String(old.schoolName || st.settings.schoolName).slice(0, 120),
      year,
      term: Number(old.term) || st.settings.term,
      passing: Number(old.passing ?? 6),
      recovery: Number(old.recovery ?? 4),
      defaultFee: Number(old.defaultFee) || 0,
      dueDay: Number(old.dueDay) || 10,
      lateFine: Number(old.lateFine ?? 2),
      lateInterest: Number(old.lateInterest ?? 1),
      nextSeq: Number(old.nextSeq) || 1,
      chargesFees: (v1.invoices || []).length > 0 || Number(old.defaultFee) > 0,
    });
    st.settings.terms = { [year]: { 1: {}, 2: {}, 3: {}, 4: {} } };
    for (const s of Object.values(st.settings.segments)) s.minAttendance = Number(old.minAttendance) || s.minAttendance;

    st.subjects = (v1.subjects || []).map((s) => ({ id: nid('s', s.id), name: String(s.name || 'Disciplina').slice(0, 60), short: String(s.short || '').slice(0, 12), color: Number(s.color) || 1, weekly: Number(s.weekly) || 0 }));
    st.users = (v1.teachers || []).map((t) => ({
      id: nid('u', t.id), name: String(t.name || 'Professor(a)').slice(0, 120), title: 'Professor(a)', role: 'professor', email: String(t.email || '').toLowerCase().slice(0, 160), phone: String(t.phone || '').slice(0, 30),
      status: t.status === 'ativo' ? 'ativo' : 'inativo', login: false, validUntil: null, grants: [], revokes: [], scope: 'vinculos', segments: [], classIds: [], linkedStudentIds: [],
      subjectIds: (t.subjectIds || []).map((x) => nid('s', x)), area: null, createdAt: env.now || new Date().toISOString(),
    }));
    st.classes = (v1.classes || []).map((c) => {
      const subjects = {};
      for (const [sid, tid] of Object.entries(c.subjects || {})) subjects[nid('s', sid)] = tid ? nid('u', tid) : null;
      return {
        id: nid('c', c.id), name: String(c.name || 'Turma').slice(0, 60), year, status: 'ativa', segment: c.segment || 'Outro', shift: c.shift || 'Manhã', room: c.room || '', capacity: Number(c.capacity) || 0,
        teacherId: c.teacherId ? nid('u', c.teacherId) : null, assistantIds: [], subjects,
        schedule: (c.schedule || []).map((d) => (d || []).map((x) => (x ? nid('s', x) : ''))),
      };
    });
    st.students = (v1.students || []).map((a) => {
      const g = a.guardian || {};
      return {
        id: nid('a', a.id), enrollment: String(a.enrollment || ''), name: String(a.name || 'Aluno').slice(0, 120), birth: a.birth || '', gender: a.gender || '', cpf: a.cpf || '',
        classId: a.classId ? nid('c', a.classId) : '', status: ['ativo', 'trancado', 'transferido'].includes(a.status) ? a.status : 'ativo', photo: null, address: a.address || '',
        imageConsent: false, noDigitalAccess: false,
        guardians: g.name ? [{ id: util.uid('g'), name: g.name, relation: g.relation || 'Responsável legal', phone: g.phone || '', email: g.email || '', cpf: '', pedagogico: true, financeiro: true, podeBuscar: true, bloqueado: false, userId: null }] : [],
        pickup: [], restrictions: '', alerts: a.health || '', health: '', notes: a.notes || '', fee: Number(a.fee) || 0, discount: Number(a.discount) || 0, joinedAt: a.joinedAt || today, history: [],
      };
    });
    // chamada: "classId|data" → "classId|data|0"; a falta justificada da v1 não contava como falta → vira "A"
    for (const [k, marks] of Object.entries(v1.attendance || {})) {
      const [cid, date] = k.split('|');
      if (!util.isValidDate(date)) continue;
      const m = {};
      for (const [sid, v] of Object.entries(marks || {})) m[nid('a', sid)] = v === 'J' ? 'A' : v === 'F' ? 'F' : 'P';
      st.attendance[`${nid('c', cid)}|${date}|0`] = { marks: m, subjectId: null, content: '', by: 'v1', at: `${date}T12:00:00.000Z` };
    }
    for (const [k, v] of Object.entries(v1.grades || {})) {
      const [sid, subj, term] = k.split('|');
      if (typeof v !== 'number' || !/^[1-4]$/.test(String(term))) continue;
      st.grades[`${year}|${nid('a', sid)}|${nid('s', subj)}|${term}`] = v;
    }
    st.invoices = (v1.invoices || []).map((i) => ({
      id: nid('i', i.id), studentId: nid('a', i.studentId), month: i.month, kind: /^Mensalidade/.test(i.description || '') ? 'mensalidade' : 'avulsa', description: String(i.description || '').slice(0, 120),
      amount: Number(i.amount) || 0, due: i.due, paidAt: i.paidAt || null, method: i.method || null, paidAmount: i.paidAt ? Number(i.paidAmount || i.amount) : undefined, reversals: [],
    }));
    const aud = (classId) => ({ who: 'todos', classIds: classId ? [nid('c', classId)] : [], segments: [] });
    st.events = (v1.events || []).map((e) => ({ id: nid('e', e.id), title: String(e.title || '').slice(0, 120), type: e.type || 'evento', date: e.date, time: e.time || '', audience: aud(e.classId), notes: e.notes || '', authorId: null }));
    st.notices = (v1.notices || []).map((n) => ({ id: nid('n', n.id), title: String(n.title || '').slice(0, 140), body: String(n.body || '').slice(0, 5000), audience: aud(n.audience === 'all' ? null : n.audience), pinned: !!n.pinned, date: n.date || today, authorId: null, createdAt: `${n.date || today}T12:00:00.000Z`, updatedAt: `${n.date || today}T12:00:00.000Z` }));
    return schema.cleanState(st).state;
  }

  /** Migrações por versão de dados. Cada uma recebe e devolve o estado. */
  const STEPS = [
    // 1 → 2: formato do contrato 2.0 (nada a fazer para dados criados já no 2.0)
    (s) => s,
  ];
  function upgrade(state, fromVersion) {
    let v = Number(fromVersion) || 1;
    let s = state;
    while (v < schema.DATA_VERSION) {
      s = STEPS[v - 1](s);
      v++;
    }
    return s;
  }

  return { isV1, fromV1, upgrade };
});
