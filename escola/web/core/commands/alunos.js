/* Comandos: matrícula, ficha do aluno, responsáveis, pessoas autorizadas e acesso das famílias. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('../util'), require('../perms'), require('../rules'), require('../engine'), require('./shared'));
  else (root.Core = root.Core || {}).students = factory(root.Core.util, root.Core.perms, root.Core.rules, root.Core.engine, root.Core.cmd);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (util, perms, rules, E, X) {
  'use strict';
  const { V, fail } = util;

  const RELATIONS = ['Mãe', 'Pai', 'Avó', 'Avô', 'Tia', 'Tio', 'Irmã(o)', 'Madrasta', 'Padrasto', 'Responsável legal', 'Outro'];
  const STATUS = ['ativo', 'trancado', 'transferido', 'concluido'];
  const has = (o, k) => Object.prototype.hasOwnProperty.call(o || {}, k);

  /** Meses de cobrança: do mês atual (ou janeiro do ano letivo) até dezembro do ano letivo. */
  const remainingMonths = (settings, today) => {
    const out = [];
    const start = today.slice(0, 7) < `${settings.year}-01` ? `${settings.year}-01` : today.slice(0, 7);
    for (let m = start; m <= `${settings.year}-12`; m = util.addMonths(m, 1)) out.push(m);
    return out;
  };

  /** Turma para onde o aluno vai (precisa estar no escopo e ativa). */
  const targetClass = (tx, ctx, classId) => {
    if (!classId) {
      if (!ctx.all) fail('invalid', 'Escolha a turma do aluno.');
      return '';
    }
    const c = tx.need('classes', classId, 'Turma');
    ctx.needClass(c.id);
    if (c.status === 'encerrada') fail('invalid', `A turma ${c.name} está encerrada.`);
    return c.id;
  };

  /** Responsável a partir da entrada, respeitando o que a pessoa pode gravar (contatos). */
  const guardianFrom = (g, cur, ctx, env) => {
    const out = { ...(cur || { id: env.newId('g'), userId: null, bloqueado: false }) };
    out.name = V.str(has(g, 'name') ? g.name : out.name, 'Nome do responsável', { required: true, max: 120 });
    out.relation = V.oneOf(has(g, 'relation') ? g.relation : out.relation || 'Responsável legal', 'Parentesco', RELATIONS);
    out.pedagogico = has(g, 'pedagogico') ? V.bool(g.pedagogico) : out.pedagogico !== false;
    out.financeiro = has(g, 'financeiro') ? V.bool(g.financeiro) : out.financeiro !== false;
    out.podeBuscar = has(g, 'podeBuscar') ? V.bool(g.podeBuscar) : out.podeBuscar !== false;
    if (ctx.can('alunos.contatos')) {
      if (has(g, 'phone')) out.phone = V.phone(g.phone, 'Celular do responsável');
      if (has(g, 'email')) out.email = V.email(g.email, 'E-mail do responsável');
      if (has(g, 'cpf')) out.cpf = V.cpf(g.cpf, 'CPF do responsável');
    } else if (!cur) {
      // quem não vê contatos pode cadastrar o responsável na matrícula (o contato é necessário)
      out.phone = V.phone(g.phone, 'Celular do responsável');
      out.email = V.email(g.email, 'E-mail do responsável');
      out.cpf = V.cpf(g.cpf, 'CPF do responsável');
    }
    out.phone = out.phone || '';
    out.email = out.email || '';
    out.cpf = out.cpf || '';
    return out;
  };

  /** Campos da ficha que a pessoa pode gravar (o que está redigido para ela, ela também não grava). */
  const applyStudentFields = (next, p, ctx, env, creating) => {
    if (has(p, 'name') || creating) next.name = V.str(p.name, 'Nome do aluno', { required: true, max: 120 });
    if (has(p, 'birth') || creating) {
      next.birth = V.date(p.birth, 'Data de nascimento', { required: true });
      if (next.birth > env.today) fail('invalid', 'A data de nascimento não pode estar no futuro.');
    }
    if (has(p, 'gender')) next.gender = V.oneOf(p.gender || '', 'Sexo', ['F', 'M', '']);
    if (has(p, 'imageConsent')) next.imageConsent = V.bool(p.imageConsent);
    if (has(p, 'noDigitalAccess')) next.noDigitalAccess = V.bool(p.noDigitalAccess);
    if (ctx.can('alunos.contatos')) {
      if (has(p, 'cpf')) next.cpf = V.cpf(p.cpf, 'CPF do aluno');
      if (has(p, 'address')) next.address = V.str(p.address, 'Endereço', { max: 200 });
    } else if (creating) {
      next.cpf = V.cpf(p.cpf, 'CPF do aluno');
      next.address = V.str(p.address, 'Endereço', { max: 200 });
    }
    if (ctx.can('alunos.saude') || creating) {
      if (has(p, 'alerts')) next.alerts = V.text(p.alerts, 'Alertas de saúde', { max: 1000 });
      if (has(p, 'health') && (ctx.can('alunos.saude') || creating)) next.health = V.text(p.health, 'Saúde detalhada', { max: 2000 });
    }
    if (ctx.can('alunos.observacoes') || creating) {
      if (has(p, 'notes')) next.notes = V.text(p.notes, 'Observações internas', { max: 3000 });
      if (has(p, 'restrictions')) next.restrictions = V.text(p.restrictions, 'Restrição de retirada', { max: 1000 });
    }
    if (ctx.can('financeiro.gerenciar')) {
      if (has(p, 'fee')) next.fee = V.num(p.fee, 'Mensalidade', { min: 0, max: 100000 }) || 0;
      if (has(p, 'discount')) next.discount = V.num(p.discount, 'Desconto', { min: 0, max: 100 }) || 0;
    }
    return next;
  };

  E.define('students.enroll', {
    perm: 'alunos.cadastrar',
    run(tx, input, ctx, env) {
      const st = tx.get('settings');
      const classId = targetClass(tx, ctx, input.classId);
      if (!classId) fail('invalid', 'Escolha a turma do aluno.');
      const seq = Number(st.nextSeq) || 1;
      const id = env.newId('a');
      const s = applyStudentFields({ id, enrollment: `${st.year}${String(seq).padStart(4, '0')}`, gender: '', cpf: '', classId, status: 'ativo', photo: null, address: '', imageConsent: false, noDigitalAccess: false, guardians: [], pickup: [], restrictions: '', alerts: '', health: '', notes: '', fee: st.defaultFee || 0, discount: 0, joinedAt: env.today, history: [] }, input, ctx, env, true);
      const gs = Array.isArray(input.guardians) ? input.guardians.slice(0, 4) : [];
      if (!gs.length) fail('invalid', 'Cadastre pelo menos um responsável.');
      s.guardians = gs.map((g) => guardianFrom(g, null, ctx, env));
      if (!s.guardians.some((g) => g.phone)) fail('invalid', 'Informe o celular de pelo menos um responsável.');
      tx.put('students', s);
      tx.settings({ nextSeq: seq + 1 });
      let invoices = 0;
      if (V.bool(input.genInvoices) && ctx.can('financeiro.gerenciar') && st.chargesFees !== false && rules.netFee(s) > 0) {
        for (const m of remainingMonths(st, env.today)) {
          tx.put('invoices', { id: env.newId('i'), studentId: id, month: m, kind: 'mensalidade', description: `Mensalidade de ${util.monthName(m)}`, amount: rules.netFee(s), due: `${m}-${util.pad(st.dueDay || 10)}`, paidAt: null, method: null, reversals: [] });
          invoices++;
        }
      }
      tx.summary = `${s.name} matriculado(a) no ${tx.get('classes', classId).name}`;
      tx.audit = { entity: 'students', ids: [id] };
      return { id, enrollment: s.enrollment, invoices };
    },
  });

  E.define('students.update', {
    perm: 'alunos.cadastrar',
    run(tx, input, ctx, env) {
      const cur = tx.need('students', input.id, 'Aluno');
      ctx.needStudent(cur);
      const p = input.patch && typeof input.patch === 'object' ? input.patch : {};
      const next = applyStudentFields({ ...cur }, p, ctx, env, false);
      if (has(p, 'classId') && p.classId !== cur.classId) next.classId = targetClass(tx, ctx, p.classId);
      tx.put('students', next);
      const moved = next.classId !== cur.classId;
      tx.summary = moved ? `${next.name} mudou para o ${(tx.get('classes', next.classId) || {}).name || 'grupo sem turma'}` : `Cadastro de ${next.name} atualizado`;
      tx.audit = { entity: 'students', ids: [cur.id] };
      return { id: cur.id };
    },
  });

  E.define('students.status', {
    perm: 'alunos.cadastrar',
    undoable: true,
    run(tx, input, ctx) {
      const cur = tx.need('students', input.id, 'Aluno');
      ctx.needStudent(cur);
      const status = V.oneOf(input.status, 'Situação', STATUS);
      tx.put('students', { ...cur, status });
      tx.summary = `Matrícula de ${cur.name}: ${{ ativo: 'reativada', trancado: 'trancada', transferido: 'transferência registrada', concluido: 'concluída' }[status]}`;
      tx.audit = { entity: 'students', ids: [cur.id] };
      return { id: cur.id };
    },
  });

  E.define('students.delete', {
    perm: 'alunos.excluir',
    run(tx, input, ctx) {
      const s = tx.need('students', input.id, 'Aluno');
      ctx.needStudent(s);
      const pre = `|${s.id}|`;
      const history =
        tx.keys('grades').some((k) => k.includes(pre)) ||
        Object.values(tx.state.attendance).some((a) => a.marks && s.id in a.marks) ||
        tx.list('invoices').some((i) => i.studentId === s.id) ||
        tx.list('support').some((r) => r.studentId === s.id) ||
        tx.list('messages').some((m) => m.studentId === s.id) ||
        tx.list('diary').some((d) => (d.recipients || []).includes(s.id) && d.studentId);
      if (history) fail('conflict', `${s.name} já tem histórico (notas, chamadas, cobranças ou registros). Registre a transferência em vez de excluir.`);
      tx.del('students', s.id);
      tx.summary = `Cadastro de ${s.name} excluído (feito por engano)`;
      tx.audit = { entity: 'students', ids: [s.id] };
      return { id: s.id };
    },
  });

  // ---------- responsáveis e pessoas autorizadas ----------
  E.define('students.guardian.save', {
    perm: 'alunos.cadastrar',
    run(tx, input, ctx, env) {
      const s = tx.need('students', input.studentId, 'Aluno');
      ctx.needStudent(s);
      const g = input.guardian && typeof input.guardian === 'object' ? input.guardian : {};
      const guardians = (s.guardians || []).slice();
      const i = g.id ? guardians.findIndex((x) => x.id === g.id) : -1;
      if (g.id && i < 0) fail('not_found', 'Responsável não encontrado.');
      if (i < 0 && guardians.length >= 6) fail('invalid', 'Limite de 6 responsáveis por aluno.');
      const before = i >= 0 ? guardians[i] : null;
      const next = guardianFrom(g, before, ctx, env);
      if (before && before.userId && (before.phone !== next.phone || before.email !== next.email)) tx.effect({ type: 'notifyGuardians', studentId: s.id, reason: 'contato alterado' });
      if (i >= 0) guardians[i] = next;
      else guardians.push(next);
      tx.put('students', { ...s, guardians });
      tx.summary = `Responsável ${next.name} ${before ? 'atualizado(a)' : 'incluído(a)'} na ficha de ${s.name}`;
      tx.audit = { entity: 'students', ids: [s.id] };
      return { id: next.id };
    },
  });

  E.define('students.guardian.remove', {
    perm: 'alunos.cadastrar',
    run(tx, input, ctx) {
      const s = tx.need('students', input.studentId, 'Aluno');
      ctx.needStudent(s);
      const g = (s.guardians || []).find((x) => x.id === input.guardianId);
      if (!g) fail('not_found', 'Responsável não encontrado.');
      if ((s.guardians || []).length <= 1) fail('conflict', 'O aluno precisa ter pelo menos um responsável.');
      tx.put('students', { ...s, guardians: s.guardians.filter((x) => x.id !== g.id) });
      if (g.userId) X.endSessionsEffect(tx, g.userId);
      tx.summary = `Responsável ${g.name} removido(a) da ficha de ${s.name}`;
      tx.audit = { entity: 'students', ids: [s.id] };
      return { id: g.id };
    },
  });

  E.define('students.pickup.save', {
    perm: 'alunos.cadastrar',
    run(tx, input, ctx, env) {
      const s = tx.need('students', input.studentId, 'Aluno');
      ctx.needStudent(s);
      const p = input.person && typeof input.person === 'object' ? input.person : {};
      const list = (s.pickup || []).slice();
      const i = p.id ? list.findIndex((x) => x.id === p.id) : -1;
      if (p.id && i < 0) fail('not_found', 'Pessoa não encontrada.');
      const cur = i >= 0 ? list[i] : { id: env.newId('k') };
      const next = { ...cur, name: V.str(p.name, 'Nome', { required: true, max: 120 }), relation: V.str(p.relation, 'Parentesco', { max: 40 }), document: V.str(p.document, 'Documento', { max: 40 }) };
      if (ctx.can('alunos.contatos') || i < 0) next.phone = V.phone(p.phone, 'Telefone');
      if (i >= 0) list[i] = next;
      else list.push(next);
      tx.put('students', { ...s, pickup: list.slice(0, 10) });
      tx.summary = `Autorizado(a) a buscar ${s.name}: ${next.name}`;
      tx.audit = { entity: 'students', ids: [s.id] };
      return { id: next.id };
    },
  });

  E.define('students.pickup.remove', {
    perm: 'alunos.cadastrar',
    run(tx, input, ctx) {
      const s = tx.need('students', input.studentId, 'Aluno');
      ctx.needStudent(s);
      const p = (s.pickup || []).find((x) => x.id === input.personId);
      if (!p) fail('not_found', 'Pessoa não encontrada.');
      tx.put('students', { ...s, pickup: s.pickup.filter((x) => x.id !== p.id) });
      tx.summary = `${p.name} deixou de estar autorizado(a) a buscar ${s.name}`;
      tx.audit = { entity: 'students', ids: [s.id] };
      return { id: p.id };
    },
  });

  // ---------- acesso das famílias ----------
  /**
   * family.invite {studentId, guardianId}: cria (ou reaproveita, pelo celular/e-mail) a conta do responsável,
   * vincula ao aluno e gera um código de primeiro acesso (devolvido só a quem convidou).
   */
  const inviteGuardian = (tx, ctx, env, s, g, purpose) => {
    if (!g.phone && !g.email) fail('invalid', `Cadastre o celular ou o e-mail de ${g.name} antes de convidar.`);
    if (g.bloqueado) fail('conflict', `${g.name} está com o acesso bloqueado.`);
    let user = g.userId ? tx.get('users', g.userId) : null;
    if (!user) {
      const d = util.digits(g.phone);
      user = tx.list('users').find((u) => (d && util.digits(u.phone) === d) || (g.email && u.email && u.email.toLowerCase() === g.email.toLowerCase())) || null;
      if (user && user.role !== 'responsavel' && user.status !== 'ativo') fail('conflict', 'Já existe uma conta inativa com esse contato. Fale com a direção.');
    }
    if (!user) {
      user = { id: env.newId('u'), name: g.name, title: '', role: 'responsavel', email: g.email || '', phone: g.phone || '', status: 'ativo', login: true, validUntil: null, grants: [], revokes: [], scope: 'vinculos', segments: [], classIds: [], linkedStudentIds: [], subjectIds: [], area: null, createdAt: env.now };
      tx.put('users', user);
    } else if (user.role === 'responsavel' && user.status !== 'ativo') {
      tx.put('users', { ...user, status: 'ativo', login: true });
    }
    const guardians = s.guardians.map((x) => (x.id === g.id ? { ...x, userId: user.id } : x));
    tx.put('students', { ...s, guardians });
    // conta de equipe que também é responsável: só vincula; o acesso dela continua o mesmo
    if (user.role !== 'responsavel') return { userId: user.id, code: null };
    const inv = X.inviteEffect(tx, user.id, env, purpose);
    if (purpose === 'convite') tx.effect({ type: 'notifyGuardians', studentId: s.id, reason: 'novo acesso', except: user.id });
    return { userId: user.id, code: inv.code };
  };

  E.define('family.invite', {
    perm: 'familias.acessos',
    run(tx, input, ctx, env) {
      const s = tx.need('students', input.studentId, 'Aluno');
      ctx.needStudent(s);
      const g = (s.guardians || []).find((x) => x.id === input.guardianId);
      if (!g) fail('not_found', 'Responsável não encontrado.');
      const out = inviteGuardian(tx, ctx, env, s, g, g.userId ? 'redefinicao' : 'convite');
      tx.summary = `${g.userId ? 'Novo código de acesso' : 'Convite de acesso'} para ${g.name} (responsável de ${s.name})`;
      tx.audit = { entity: 'students', ids: [s.id] };
      return { id: out.userId };
    },
  });

  E.define('family.invites', {
    perm: 'familias.acessos',
    run(tx, input, ctx, env) {
      const c = tx.need('classes', input.classId, 'Turma');
      ctx.needClass(c.id);
      let n = 0;
      for (const s0 of tx.list('students').slice()) {
        if (s0.classId !== c.id || s0.status !== 'ativo' || s0.noDigitalAccess) continue;
        for (const g of s0.guardians || []) {
          const s = tx.get('students', s0.id);
          const cur = s.guardians.find((x) => x.id === g.id);
          if (!cur || cur.userId || !cur.pedagogico || cur.bloqueado || (!cur.phone && !cur.email)) continue;
          inviteGuardian(tx, ctx, env, s, cur, 'convite');
          n++;
        }
      }
      tx.summary = `${n} convite${n === 1 ? '' : 's'} de acesso gerado${n === 1 ? '' : 's'} para as famílias do ${c.name}`;
      tx.audit = { entity: 'classes', ids: [c.id] };
      return { id: c.id, invited: n };
    },
  });

  E.define('family.block', {
    perm: 'familias.acessos',
    run(tx, input, ctx) {
      const s = tx.need('students', input.studentId, 'Aluno');
      ctx.needStudent(s);
      const g = (s.guardians || []).find((x) => x.id === input.guardianId);
      if (!g) fail('not_found', 'Responsável não encontrado.');
      const blocked = V.bool(input.blocked);
      tx.put('students', { ...s, guardians: s.guardians.map((x) => (x.id === g.id ? { ...x, bloqueado: blocked, podeBuscar: blocked ? false : x.podeBuscar } : x)) });
      if (g.userId) X.endSessionsEffect(tx, g.userId);
      tx.summary = `Acesso de ${g.name} ao portal (aluno ${s.name}) ${blocked ? 'bloqueado' : 'liberado'}`;
      tx.audit = { entity: 'students', ids: [s.id] };
      return { id: g.id };
    },
  });

  E.define('family.unlink', {
    perm: 'familias.acessos',
    run(tx, input, ctx) {
      const s = tx.need('students', input.studentId, 'Aluno');
      ctx.needStudent(s);
      const g = (s.guardians || []).find((x) => x.id === input.guardianId);
      if (!g || !g.userId) fail('not_found', 'Este responsável não tem acesso ao portal.');
      tx.put('students', { ...s, guardians: s.guardians.map((x) => (x.id === g.id ? { ...x, userId: null } : x)) });
      X.endSessionsEffect(tx, g.userId);
      tx.summary = `Acesso de ${g.name} desvinculado do aluno ${s.name}`;
      tx.audit = { entity: 'students', ids: [s.id] };
      return { id: g.id };
    },
  });

  return { remainingMonths, RELATIONS, STATUS };
});
