/* Caderneta Escolar — o que cada usuário pode ver (contrato §5).
   Monta o retrato filtrado e redigido e filtra os deltas com as mesmas regras. Nunca lê o relógio: usa env. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./util'), require('./schema'), require('./perms'), require('./rules'));
  else (root.Core = root.Core || {}).view = factory(root.Core.util, root.Core.schema, root.Core.perms, root.Core.rules);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (util, schema, perms, rules) {
  'use strict';
  const { KINDS, SINGLE_ID } = schema;

  /** Janela (dias) da agenda, rotinas e mensagens no retrato; o resto vem pelo histórico. */
  const WINDOW_DAYS = 60;

  const pick = (obj, keys) => {
    const out = {};
    for (const k of keys) if (obj[k] !== undefined) out[k] = obj[k];
    return out;
  };
  const FAMILY_SETTINGS = ['schoolName', 'cnpj', 'phone', 'address', 'logo', 'year', 'timezone', 'termCount', 'termLabel', 'term', 'terms', 'passing', 'recovery', 'chargesFees', 'dueDay', 'lateFine', 'lateInterest', 'pixKey', 'segments', 'homeworkLabel', 'familyMessages', 'officeHours', 'routineFields', 'routineBring', 'privacy', 'demo'];

  /**
   * Cria os filtros de um usuário. env: {now, today, mode?: 'familia', history?: true}.
   * history=true desliga as janelas de tempo (usado pelo histórico paginado).
   */
  function makeFilter(state, user, env = {}) {
    const settings = state.settings || {};
    const today = env.today || util.today(settings.timezone);
    const windowStart = util.addDays(today, -WINDOW_DAYS);
    const year = String(settings.year);
    const ctx = perms.context(user, state, env);
    const can = (p) => ctx.perms.has(p);
    const studentsById = new Map(state.students.map((s) => [s.id, s]));
    const classesById = new Map(state.classes.map((c) => [c.id, c]));
    const diaryById = new Map(state.diary.map((d) => [d.id, d]));
    const fees = settings.chargesFees !== false;
    const inWindow = (date) => env.history || !date || date >= windowStart;

    const studentVisible = (sid) => {
      const s = studentsById.get(sid);
      if (!s) return false;
      if (ctx.family) return ctx.studentIds.has(sid);
      return can('alunos.ver') && perms.reachesStudent(ctx, s);
    };
    const guardianOfStudent = (sid) => {
      const s = studentsById.get(sid);
      return s ? (s.guardians || []).find((g) => g.userId === user.id && !g.bloqueado) || null : null;
    };

    // equipe que a família enxerga (nome e função): quem atua nas turmas dos filhos ou falou com ela
    let familyStaff = null;
    if (ctx.family) {
      familyStaff = new Set();
      for (const c of state.classes) {
        if (!ctx.classIds.has(c.id)) continue;
        if (c.teacherId) familyStaff.add(c.teacherId);
        (c.assistantIds || []).forEach((id) => familyStaff.add(id));
        Object.values(c.subjects || {}).forEach((id) => id && familyStaff.add(id));
      }
      for (const m of state.messages) if (ctx.studentIds.has(m.studentId)) (m.posts || []).filter((p) => p.kind !== 'registro').forEach((p) => familyStaff.add(p.userId));
      for (const p of state.plans) if (ctx.studentIds.has(p.studentId) && p.sharedWith && p.sharedWith.familia) familyStaff.add(p.authorId);
    }

    /** Item da agenda visível? Devolve o item recortado (ou null). */
    const diaryFor = (d) => {
      if (!d) return null;
      const pending = (d.due && d.due >= today) || (d.respondBy && d.respondBy >= today);
      if (!inWindow(d.date) && !pending) return null;
      if (ctx.family) {
        if (d.status !== 'publicado' && d.status !== 'cancelado') return null;
        if (d.internal) return null;
        const mine = (d.recipients || []).filter((id) => ctx.studentIds.has(id));
        if (!mine.length) return null;
        const out = { ...d, recipients: mine };
        delete out.approvedBy;
        return out;
      }
      if (!can('diario.ver')) return null;
      const byClass = perms.reachesClass(ctx, d.classId);
      const byStudent = (d.recipients || []).some((id) => ctx.extraStudentIds.has(id)) && !!d.studentId;
      if (!byClass && !byStudent) return null;
      if (d.status === 'rascunho' && d.authorId !== user.id) return null;
      if (d.status === 'pendente' && d.authorId !== user.id && !can('diario.aprovar')) return null;
      if (d.type === 'ocorrencia' && d.category !== 'elogio' && d.authorId !== user.id && !can('diario.ocorrencias') && !can('diario.aprovar') && !can('alunos.observacoes')) return null;
      return d;
    };

    if (familyStaff) for (const d of state.diary) if (ctx.classIds.has(d.classId) && diaryFor(d)) familyStaff.add(d.authorId);

    const supportReadable = (r) => {
      if (ctx.family || !r) return false;
      if (!perms.reachesStudent(ctx, studentsById.get(r.studentId))) return false;
      if (r.authorId === user.id) return true;
      if (!can('atendimentos.conteudo')) return false;
      if (r.confidentiality === 'apoio') return true;
      if (r.confidentiality === 'area') return !!user.area && user.area === r.area;
      return false;
    };

    const F = {
      settings(v) {
        if (ctx.family) return pick(v, FAMILY_SETTINGS);
        const out = { ...v };
        if (!can('usuarios.gerenciar')) delete out.profiles;
        return out;
      },
      subjects: (v) => v,
      users(u) {
        if (u.id === user.id) {
          const own = pick(u, ['id', 'name', 'title', 'email', 'phone', 'role', 'status', 'scope', 'segments', 'classIds', 'linkedStudentIds', 'subjectIds', 'area', 'validUntil', 'grants', 'revokes']);
          return own;
        }
        if (ctx.family) return familyStaff.has(u.id) && u.role !== 'responsavel' && u.status === 'ativo' ? pick(u, ['id', 'name', 'title', 'role']) : null;
        if (u.role === 'responsavel') {
          if (!can('familias.acessos') && !can('usuarios.gerenciar')) return null;
          const kids = [...perms.guardianOf(u, state)].filter(studentVisible);
          if (!kids.length && !can('usuarios.gerenciar')) return null;
          return { ...pick(u, ['id', 'name', 'email', 'phone', 'role', 'status', 'login', 'createdAt']), studentIds: kids };
        }
        if (can('usuarios.gerenciar')) return u;
        const basic = ['id', 'name', 'title', 'role', 'subjectIds', 'status', 'area'];
        return pick(u, can('equipe.ver') ? basic.concat(['email', 'phone']) : basic);
      },
      classes(c) {
        if (c.status === 'encerrada' && !env.history) return null;
        if (ctx.family) return ctx.classIds.has(c.id) ? pick(c, ['id', 'name', 'year', 'segment', 'shift', 'room', 'teacherId', 'assistantIds', 'subjects', 'schedule']) : null;
        if (perms.reachesClass(ctx, c.id)) return c;
        for (const sid of ctx.extraStudentIds) {
          const s = studentsById.get(sid);
          if (s && s.classId === c.id) return pick(c, ['id', 'name', 'year', 'segment', 'shift', 'schedule', 'subjects', 'teacherId']);
        }
        return null;
      },
      students(s) {
        if (!studentVisible(s.id)) return null;
        const hidden = [];
        const out = { ...s };
        const drop = (k) => {
          if (out[k] !== undefined && out[k] !== '' && out[k] !== null) hidden.push(k);
          delete out[k];
        };
        if (ctx.family) {
          drop('notes');
          drop('restrictions');
          out.guardians = (s.guardians || []).map((g) => (g.userId === user.id ? g : pick(g, ['id', 'name', 'relation', 'pedagogico', 'financeiro', 'podeBuscar'])));
          const g = guardianOfStudent(s.id);
          if (!g || !g.financeiro || !fees) {
            drop('fee');
            drop('discount');
          }
          out._hidden = hidden;
          return out;
        }
        if (!can('alunos.contatos')) {
          drop('cpf');
          drop('address');
          out.guardians = (s.guardians || []).map((g) => pick(g, ['id', 'name', 'relation', 'pedagogico', 'financeiro', 'podeBuscar', 'bloqueado', 'userId']));
          out.pickup = (s.pickup || []).map((p) => pick(p, ['id', 'name', 'relation', 'document']));
          if ((s.guardians || []).some((g) => g.phone || g.email)) hidden.push('guardians.contatos');
        }
        if (!can('alunos.alertas')) drop('alerts');
        if (!can('alunos.saude')) drop('health');
        if (!can('alunos.observacoes')) drop('notes');
        if (!can('financeiro.ver') || !fees) {
          drop('fee');
          drop('discount');
        }
        if (Array.isArray(s.history) && (!can('notas.ver') || !can('chamada.ver'))) {
          out.history = s.history.map((h) => {
            const x = { ...h };
            if (!can('notas.ver')) {
              delete x.avg;
              delete x.result;
            }
            if (!can('chamada.ver')) delete x.attendance;
            return x;
          });
          hidden.push('history.detalhes');
        }
        out._hidden = hidden;
        return out;
      },
      attendance(rec, key) {
        const [classId, date] = key.split('|');
        if (!env.history && date.slice(0, 4) !== year) return null;
        if (ctx.family) {
          if (!ctx.classIds.has(classId) && ![...ctx.studentIds].some((sid) => rec.marks && sid in rec.marks)) return null;
          const marks = {};
          for (const sid of Object.keys(rec.marks || {})) if (ctx.studentIds.has(sid)) marks[sid] = rec.marks[sid];
          if (!Object.keys(marks).length) return null;
          return { marks, subjectId: rec.subjectId || null };
        }
        if (!can('chamada.ver')) return null;
        if (perms.reachesClass(ctx, classId)) return rec;
        const marks = {};
        for (const sid of Object.keys(rec.marks || {})) if (ctx.extraStudentIds.has(sid)) marks[sid] = rec.marks[sid];
        return Object.keys(marks).length ? { ...rec, marks, reasons: undefined } : null;
      },
      grades(v, key) {
        const [y, sid, , term] = key.split('|');
        if (!env.history && y !== year) return null;
        if (ctx.family) {
          if (!ctx.studentIds.has(sid)) return null;
          // recuperação final só aparece quando a última etapa do ano foi liberada
          const t = term === 'rf' ? String(Number(settings.termCount) || 4) : String(term).replace(/^rec/, '');
          if (!rules.termReleased(settings, y, t)) return null;
          return v;
        }
        if (!can('notas.ver')) return null;
        return studentVisible(sid) ? v : null;
      },
      councils(v, key) {
        const [y, sid] = key.split('|');
        if (!env.history && y !== year) return null;
        if (ctx.family) return ctx.studentIds.has(sid) && v.released ? v : null;
        return can('notas.ver') && studentVisible(sid) ? v : null;
      },
      invoices(i) {
        if (!fees) return null;
        if (!env.history && i.month.slice(0, 4) !== year && i.paidAt) return null;
        if (ctx.family) {
          const g = guardianOfStudent(i.studentId);
          return ctx.studentIds.has(i.studentId) && g && g.financeiro ? i : null;
        }
        if (!can('financeiro.ver') || !studentsById.has(i.studentId)) return null;
        return ctx.all || studentVisible(i.studentId) ? i : null;
      },
      events(e) {
        if (ctx.family) return e.audience && e.audience.who !== 'equipe' && rules.audienceTouches(e.audience, ctx.classIds, classesById) ? e : null;
        return e;
      },
      notices(n) {
        if (ctx.family) return n.audience && n.audience.who !== 'equipe' && rules.audienceTouches(n.audience, ctx.classIds, classesById) ? n : null;
        return n;
      },
      diary: (d) => diaryFor(d),
      acks(byStudent, itemId) {
        if (!diaryFor(diaryById.get(itemId))) return null;
        if (!ctx.family) return byStudent;
        const out = {};
        for (const sid of Object.keys(byStudent || {})) {
          if (!ctx.studentIds.has(sid)) continue;
          const g = guardianOfStudent(sid);
          const entries = {};
          for (const gid of Object.keys(byStudent[sid] || {})) {
            const a = byStudent[sid][gid];
            if ((g && gid === g.id) || a.origin === 'escola') entries[gid] = a;
          }
          if (Object.keys(entries).length) out[sid] = entries;
        }
        return Object.keys(out).length ? out : null;
      },
      routines(r, key) {
        const [classId, date, sid] = key.split('|');
        if (!inWindow(date)) return null;
        if (ctx.family) return ctx.studentIds.has(sid) && r.sentAt ? r : null;
        if (!can('diario.ver')) return null;
        return perms.reachesClass(ctx, classId) || ctx.extraStudentIds.has(sid) ? r : null;
      },
      messages(m) {
        const last = (m.posts && m.posts.length ? m.posts[m.posts.length - 1].at : m.createdAt || '').slice(0, 10);
        if (!inWindow(last) && m.status === 'resolvida') return null;
        // "registro" = nota interna da equipe na conversa: nunca vai para a família
        if (ctx.family) return ctx.studentIds.has(m.studentId) ? { ...m, posts: (m.posts || []).filter((p) => p.kind !== 'registro') } : null;
        if (!can('mensagens.responder')) return null;
        return studentVisible(m.studentId) ? m : null;
      },
      support(r) {
        if (!supportReadable(r)) return null;
        return pick(r, ['id', 'studentId', 'area', 'date', 'type', 'confidentiality', 'authorId', 'createdAt']);
      },
      plans(p) {
        const s = studentsById.get(p.studentId);
        if (ctx.family) {
          if (!ctx.studentIds.has(p.studentId) || !(p.sharedWith && p.sharedWith.familia)) return null;
          return pick(p, ['id', 'studentId', 'title', 'status', 'start', 'goals', 'adaptations', 'authorId', 'updatedAt', 'familyAckAt']);
        }
        if (!perms.reachesStudent(ctx, s)) return null;
        if (p.authorId === user.id || can('atendimentos.conteudo')) return p;
        if (p.status !== 'ativo' || !p.sharedWith) return null;
        if (p.sharedWith.coordenacao && can('turmas.gerenciar')) return pick(p, ['id', 'studentId', 'title', 'status', 'start', 'goals', 'adaptations', 'authorId', 'updatedAt']);
        if (p.sharedWith.professores && perms.pedagogicLink(user, state, s)) return pick(p, ['id', 'studentId', 'adaptations', 'status', 'updatedAt']);
        return null;
      },
      files(f) {
        if (f.ownerId === user.id) return f;
        for (const ref of f.refs || []) {
          if (ref.coll === 'diary' && diaryFor(diaryById.get(ref.id))) return f;
          if (ref.coll === 'messages') {
            const m = state.messages.find((x) => x.id === ref.id);
            if (m && F.messages(m)) return f;
          }
          if (ref.coll === 'students' && studentVisible(ref.id)) return f;
          if (ref.coll === 'settings') return f;
        }
        return null;
      },
    };

    const filter = (coll, id, value) => {
      if (value === undefined || value === null) return null;
      const fn = F[coll];
      if (!fn) return null;
      try {
        const out = fn(value, id);
        return out === undefined ? null : out;
      } catch (e) {
        return null;
      }
    };
    return { ctx, filter, supportReadable, diaryFor, studentVisible };
  }

  /** Dados do próprio usuário para o cliente. */
  function me(state, user, env = {}) {
    const ctx = perms.context(user, state, env);
    const guardianIds = perms.guardianOf(user, state);
    return {
      id: user.id,
      name: user.name,
      title: user.title || '',
      email: user.email || '',
      phone: user.phone || '',
      role: user.role,
      roleLabel: perms.roleLabel(user.role),
      family: ctx.family,
      staffAndFamily: !perms.isFamily(user) && guardianIds.size > 0,
      owner: !!state.settings && state.settings.ownerId === user.id,
      perms: [...ctx.perms],
      scope: ctx.family ? 'familia' : user.scope,
      area: user.area || null,
      classIds: [...ctx.classIds],
      studentIds: ctx.family ? [...ctx.studentIds] : [],
      linkedStudentIds: ctx.family ? [] : [...ctx.extraStudentIds],
      validUntil: user.validUntil || null,
    };
  }

  /** Retrato completo filtrado. */
  function snapshot(state, user, env = {}) {
    const { filter } = makeFilter(state, user, env);
    const data = {};
    for (const [coll, kind] of Object.entries(KINDS)) {
      if (kind === 'single') data[coll] = filter(coll, SINGLE_ID, state[coll]) || {};
      else if (kind === 'list') {
        data[coll] = [];
        for (const doc of state[coll]) {
          const v = filter(coll, doc.id, doc);
          if (v) data[coll].push(v);
        }
      } else {
        data[coll] = {};
        for (const k of Object.keys(state[coll])) {
          const v = filter(coll, k, state[coll][k]);
          if (v != null) data[coll][k] = v;
        }
      }
    }
    return { me: me(state, user, env), data };
  }

  /** Interseção de duas versões filtradas do mesmo dado: só fica o que as duas pessoas podem ver. */
  const intersect = (t, a) => {
    if (Array.isArray(t) && Array.isArray(a)) {
      if (t.length && t.every((x) => x && typeof x === 'object' && 'id' in x)) {
        const byId = new Map(a.filter((x) => x && typeof x === 'object').map((x) => [x.id, x]));
        return t.filter((x) => byId.has(x.id)).map((x) => intersect(x, byId.get(x.id)));
      }
      return t;
    }
    if (t && a && typeof t === 'object' && typeof a === 'object' && !Array.isArray(t) && !Array.isArray(a)) {
      const out = {};
      for (const k of Object.keys(t)) {
        if (k === '_hidden') out._hidden = [...new Set([...(t._hidden || []), ...(a._hidden || [])])];
        else if (k in a) out[k] = intersect(t[k], a[k]);
      }
      return out;
    }
    return t;
  };

  /**
   * "Ver como": o retrato da pessoa-alvo, mas só com o que o ATOR também pode ver
   * (nunca revela, por exemplo, atendimentos ou mensalidades a quem não tem esse acesso).
   */
  function preview(state, actor, target, env = {}, actorEnv = env) {
    const t = snapshot(state, target, env);
    const { filter } = makeFilter(state, actor, actorEnv);
    const data = {};
    for (const [coll, kind] of Object.entries(KINDS)) {
      if (kind === 'single') data[coll] = t.data[coll];
      else if (kind === 'list') {
        const raw = new Map(state[coll].map((d) => [d.id, d]));
        data[coll] = [];
        for (const doc of t.data[coll]) {
          const mine = filter(coll, doc.id, raw.get(doc.id));
          if (mine) data[coll].push(intersect(doc, mine));
        }
      } else {
        data[coll] = {};
        for (const k of Object.keys(t.data[coll])) {
          const mine = filter(coll, k, state[coll][k]);
          if (mine != null) data[coll][k] = intersect(t.data[coll][k], mine);
        }
      }
    }
    return { me: t.me, data };
  }

  /**
   * Filtra mudanças para um usuário: visível → "put" recortado; era visível e deixou de ser (ou foi apagado) → "del".
   * `befores` = imagens anteriores do motor (avaliadas com as regras de agora; só podem gerar remoções).
   */
  function visibleChanges(state, user, changes, befores, env = {}) {
    const { filter } = makeFilter(state, user, env);
    const beforeMap = new Map((befores || []).map((b) => [b.coll + '\u0000' + b.id, b.value]));
    const out = [];
    for (const c of changes) {
      const before = beforeMap.get(c.coll + '\u0000' + c.id);
      const sawBefore = before !== undefined && filter(c.coll, c.id, before) != null;
      if (c.op === 'put') {
        const v = filter(c.coll, c.id, c.value);
        if (v != null) out.push({ coll: c.coll, id: c.id, op: 'put', value: v });
        else if (sawBefore) out.push({ coll: c.coll, id: c.id, op: 'del' });
      } else if (sawBefore) out.push({ coll: c.coll, id: c.id, op: 'del' });
    }
    return out;
  }

  /** Itens visíveis de uma coleção sem a janela de tempo (histórico paginado). */
  function history(state, user, coll, { classId = null, studentId = null, before = null, limit = 100 } = {}, env = {}) {
    const { filter } = makeFilter(state, user, { ...env, history: true });
    const out = [];
    const dateOf = (v, k) => (coll === 'diary' ? v.date : coll === 'messages' ? (v.createdAt || '').slice(0, 10) : coll === 'routines' || coll === 'attendance' ? k.split('|')[1] : coll === 'invoices' ? v.due : coll === 'classes' ? `${v.year || ''}-12-31` : '');
    const matches = (v, k) => {
      if (classId) {
        if (coll === 'diary' && v.classId !== classId) return false;
        if ((coll === 'routines' || coll === 'attendance') && !k.startsWith(classId + '|')) return false;
      }
      if (studentId) {
        if (coll === 'diary' && !(v.recipients || []).includes(studentId)) return false;
        if ((coll === 'messages' || coll === 'invoices') && v.studentId !== studentId) return false;
        if (coll === 'routines' && !k.endsWith('|' + studentId)) return false;
        if (coll === 'attendance' && !(v.marks && studentId in v.marks)) return false;
      }
      const d = dateOf(v, k);
      return !before || (d && d < before);
    };
    if (KINDS[coll] === 'list') {
      for (const doc of state[coll]) if (matches(doc, doc.id)) {
        const v = filter(coll, doc.id, doc);
        if (v) out.push({ id: doc.id, value: v, date: dateOf(doc, doc.id) });
      }
    } else if (KINDS[coll] === 'map') {
      for (const k of Object.keys(state[coll])) if (matches(state[coll][k], k)) {
        const v = filter(coll, k, state[coll][k]);
        if (v != null) out.push({ id: k, value: v, date: dateOf(state[coll][k], k) });
      }
    }
    out.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
    const lim = Math.max(1, Math.min(500, Number(limit) || 100));
    return { items: out.slice(0, lim), more: out.length > lim };
  }

  /** Histórico no "ver como": o da pessoa-alvo, recortado pelo que o ator também pode ver. */
  function historyAs(state, actor, target, coll, opts = {}, env = {}, actorEnv = env) {
    const t = history(state, target, coll, opts, env);
    const { filter } = makeFilter(state, actor, { ...actorEnv, history: true });
    const raw = KINDS[coll] === 'list' ? new Map(state[coll].map((d) => [d.id, d])) : null;
    const items = [];
    for (const it of t.items) {
      const mine = filter(coll, it.id, raw ? raw.get(it.id) : state[coll][it.id]);
      if (mine != null) items.push({ ...it, value: intersect(it.value, mine) });
    }
    return { items, more: t.more };
  }

  return { makeFilter, snapshot, preview, visibleChanges, history, historyAs, me, WINDOW_DAYS };
});
