/* Comandos: contas da equipe (com regra de dominância), vínculos com turmas e dados próprios. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('../util'), require('../perms'), require('../engine'), require('./shared'));
  else factory(root.Core.util, root.Core.perms, root.Core.engine, root.Core.cmd);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (util, perms, E, X) {
  'use strict';
  const { V, fail } = util;
  const AREAS = ['psicologia', 'psicopedagogia', 'orientacao', 'aee', 'servico_social'];
  const SEGMENTS = ['Educação Infantil', 'Fundamental I', 'Fundamental II', 'Ensino Médio', 'EJA', 'Outro'];

  /** O ator pode gerenciar este alvo agora? (titular só se gerencia sozinha; família não é por aqui) */
  const needDominance = (tx, ctx, target, label = 'esta conta') => {
    if (target.id === ctx.user.id) fail('forbidden', 'Você não pode alterar a própria conta por aqui. Use "Meus dados".');
    if (target.role === 'responsavel') fail('forbidden', 'Contas de família são gerenciadas pela ficha do aluno.');
    if (!perms.dominates(ctx.user, target, tx.state)) fail('forbidden', `Você não pode alterar ${label}: ela tem acessos que você não tem.`);
  };

  /**
   * users.save {id?, name, title, role, email, phone, login, validUntil, perms?, scope, segments, classIds, linkedStudentIds, subjectIds, area}
   * `perms` (lista final desejada) vira grants/revokes relativos ao perfil do cargo.
   */
  E.define('users.save', {
    perm: 'usuarios.gerenciar',
    run(tx, input, ctx, env) {
      const st = tx.get('settings');
      const cur = input.id ? tx.need('users', input.id, 'Pessoa') : null;
      if (cur) needDominance(tx, ctx, cur);
      const role = V.oneOf(input.role || (cur && cur.role), 'Perfil de acesso', perms.STAFF_ROLES);
      const name = V.str(input.name ?? (cur && cur.name), 'Nome', { required: true, max: 120 });
      const email = V.email(input.email ?? (cur && cur.email), 'E-mail');
      const phone = V.phone(input.phone ?? (cur && cur.phone), 'Celular');
      const login = input.login === undefined ? (cur ? cur.login : true) : V.bool(input.login);
      if (login && !email && !phone) fail('invalid', 'Para entrar no sistema a pessoa precisa de e-mail ou celular.', 'email');
      X.uniqueLogin(tx, { email, phone, exceptId: cur && cur.id });
      const roleDef = perms.ROLE[role];
      const scope = V.oneOf(input.scope || (cur && cur.scope) || roleDef.scope, 'Turmas que pode ver', ['todas', 'segmentos', 'vinculos']);
      if (scope === 'todas' && !ctx.all) fail('forbidden', 'Você não pode dar acesso a todas as turmas, porque não tem esse acesso.');
      const segments = (Array.isArray(input.segments) ? input.segments : (cur && cur.segments) || []).filter((x) => SEGMENTS.includes(x));
      if (scope === 'segmentos' && !segments.length) fail('invalid', 'Escolha as etapas de ensino que a pessoa pode ver.', 'segments');
      const classIds = V.ids(input.classIds ?? (cur && cur.classIds), 'Turmas vinculadas', { max: 200 }).filter((id) => tx.get('classes', id));
      const linkedStudentIds = V.ids(input.linkedStudentIds ?? (cur && cur.linkedStudentIds), 'Alunos acompanhados', { max: 200 }).filter((id) => tx.get('students', id));
      if (!ctx.all) {
        for (const id of classIds) ctx.needClass(id);
        for (const id of linkedStudentIds) ctx.needStudent(tx.get('students', id));
      }
      const subjectIds = V.ids(input.subjectIds ?? (cur && cur.subjectIds), 'Disciplinas', { max: 30 }).filter((id) => tx.get('subjects', id));
      const area = input.area === undefined ? (cur ? cur.area : roleDef.area || null) : V.oneOf(input.area || null, 'Área', AREAS, { required: false });
      const validUntil = V.date(input.validUntil === undefined ? cur && cur.validUntil : input.validUntil, 'Acesso até');
      if (validUntil && validUntil < env.today && (!cur || validUntil !== cur.validUntil)) fail('invalid', 'A data final do acesso já passou.', 'validUntil');
      const wanted = Array.isArray(input.perms) ? perms.withImplied(perms.clean(input.perms)) : cur ? [...perms.effective({ ...cur, status: 'ativo' }, st)] : perms.profile(role, st);
      // sem escalada: só concede o que tem (permissões confidenciais à parte)
      const mine = perms.effective(ctx.user, st);
      for (const p of wanted) if (!perms.CONFIDENTIAL.has(p) && !mine.has(p)) fail('forbidden', `Você não pode dar "${perms.label(p)}", porque não tem essa permissão.`);
      const gr = perms.toGrantsRevokes(role, wanted, st);
      const doc = {
        ...(cur || { id: env.newId('u'), status: 'ativo', createdAt: env.now }),
        name, title: V.str(input.title ?? (cur && cur.title) ?? roleDef.label, 'Função', { max: 80 }), role, email, phone, login, validUntil: validUntil || null,
        grants: gr.grants, revokes: gr.revokes, scope, segments: scope === 'segmentos' ? segments : [], classIds, linkedStudentIds, subjectIds, area: area || null,
      };
      // depois da mudança o ator ainda precisa dominar o alvo
      const trial = { ...tx.state, users: tx.state.users.filter((u) => u.id !== doc.id).concat([doc]) };
      if (!perms.dominates(ctx.user, doc, trial)) fail('forbidden', 'Com esses acessos a pessoa passaria a ter mais acesso do que você.');
      tx.put('users', doc);
      // encerra as sessões só quando muda o acesso ou o login (corrigir um nome não tira a pessoa do sistema)
      const ACCESS = ['role', 'email', 'phone', 'login', 'validUntil', 'grants', 'revokes', 'scope', 'segments', 'classIds', 'linkedStudentIds', 'area'];
      if (cur && ACCESS.some((k) => util.canonical(cur[k] ?? null) !== util.canonical(doc[k] ?? null))) X.endSessionsEffect(tx, doc.id);
      const confidential = wanted.filter((p) => perms.CONFIDENTIAL.has(p) && !mine.has(p));
      tx.summary = cur ? `Conta de ${name} atualizada` : `Conta de ${name} criada (${perms.roleLabel(role)})`;
      if (confidential.length) tx.summary += ` — com acesso confidencial: ${confidential.map(perms.label).join(', ')}`;
      tx.audit = { entity: 'users', ids: [doc.id] };
      let invite = null;
      if (!cur && login && V.bool(input.sendInvite !== undefined ? input.sendInvite : true)) invite = X.inviteEffect(tx, doc.id, env, 'convite');
      return { id: doc.id, invited: !!invite };
    },
  });

  E.define('users.status', {
    perm: 'usuarios.gerenciar',
    undoable: true,
    run(tx, input, ctx) {
      const cur = tx.need('users', input.id, 'Pessoa');
      needDominance(tx, ctx, cur);
      const status = V.oneOf(input.status, 'Situação', ['ativo', 'inativo']);
      if (status === 'inativo' && tx.get('settings').ownerId === cur.id) fail('forbidden', 'A conta titular não pode ser desativada.');
      tx.put('users', { ...cur, status });
      if (status === 'inativo') X.endSessionsEffect(tx, cur.id);
      tx.summary = `Conta de ${cur.name} ${status === 'ativo' ? 'reativada' : 'desativada'}`;
      tx.audit = { entity: 'users', ids: [cur.id] };
      return { id: cur.id };
    },
  });

  E.define('users.invite', {
    perm: 'usuarios.gerenciar',
    run(tx, input, ctx, env) {
      const cur = tx.need('users', input.id, 'Pessoa');
      needDominance(tx, ctx, cur);
      if (cur.status !== 'ativo') fail('conflict', `${cur.name} está com a conta desativada.`);
      if (!cur.email && !cur.phone) fail('invalid', `Cadastre um e-mail ou celular de ${cur.name} antes: é com um deles que a pessoa entra.`);
      if (!cur.login) tx.put('users', { ...cur, login: true });
      X.inviteEffect(tx, cur.id, env, input.reset ? 'redefinicao' : 'convite');
      X.endSessionsEffect(tx, cur.id);
      tx.summary = `${input.reset ? 'Novo código de acesso' : 'Convite'} gerado para ${cur.name}`;
      tx.audit = { entity: 'users', ids: [cur.id] };
      return { id: cur.id };
    },
  });

  E.define('users.delete', {
    perm: 'usuarios.gerenciar',
    run(tx, input, ctx) {
      const cur = tx.need('users', input.id, 'Pessoa');
      needDominance(tx, ctx, cur);
      const used =
        tx.list('classes').some((c) => c.teacherId === cur.id || (c.assistantIds || []).includes(cur.id) || Object.values(c.subjects || {}).includes(cur.id)) ||
        tx.list('diary').some((d) => d.authorId === cur.id) ||
        tx.list('support').some((r) => r.authorId === cur.id) ||
        tx.list('messages').some((m) => m.createdBy === cur.id || (m.posts || []).some((p) => p.userId === cur.id)) ||
        tx.list('plans').some((p) => p.authorId === cur.id) ||
        tx.list('notices').some((n) => n.authorId === cur.id) ||
        tx.list('events').some((e) => e.authorId === cur.id) ||
        tx.list('invoices').some((i) => i.receivedBy === cur.id || (i.reversals || []).some((r) => r.by === cur.id)) ||
        Object.values(tx.state.attendance).some((a) => a.by === cur.id) ||
        Object.values(tx.state.routines).some((r) => r.by === cur.id) ||
        Object.values(tx.state.councils).some((c) => c.by === cur.id);
      if (used) fail('conflict', `${cur.name} já tem registros no sistema. Desative a conta em vez de excluir.`);
      if (tx.list('students').some((st) => (st.guardians || []).some((g) => g.userId === cur.id))) fail('conflict', `${cur.name} também é responsável por um aluno. Desative a conta em vez de excluir.`);
      tx.del('users', cur.id);
      X.endSessionsEffect(tx, cur.id);
      tx.effect({ type: 'deleteCredentials', userId: cur.id });
      tx.summary = `Conta de ${cur.name} excluída`;
      tx.audit = { entity: 'users', ids: [cur.id] };
      return { id: cur.id };
    },
  });

  /**
   * staff.links {userId, classes: [{classId, role: regente|professor|auxiliar, subjectIds}], linkedStudentIds}
   * Define, a partir da pessoa, onde ela trabalha. Reescreve as atribuições dessa pessoa nas turmas.
   */
  E.define('staff.links', {
    perm: 'turmas.gerenciar',
    run(tx, input, ctx) {
      if (!ctx.all) fail('forbidden', 'Só quem enxerga todas as turmas pode definir vínculos.');
      const u = X.staffUser(tx, input.userId, 'Pessoa');
      if (u.id === ctx.user.id) fail('forbidden', 'Peça a outra pessoa da gestão para vincular você a uma turma.');
      if (!perms.dominates(ctx.user, u, tx.state)) {
        // sem dominância (inclusive sem gerenciar contas) ainda pode montar turmas — mas não sobre quem tem mais acesso
        const mine = perms.effective(ctx.user, tx.state.settings);
        for (const p of perms.effective(u, tx.state.settings)) if (!perms.CONFIDENTIAL.has(p) && !mine.has(p)) fail('forbidden', `Você não pode alterar os vínculos de ${u.name}.`);
      }
      const wanted = new Map();
      for (const l of Array.isArray(input.classes) ? input.classes.slice(0, 100) : []) {
        const c = tx.need('classes', l.classId, 'Turma');
        const role = V.oneOf(l.role, 'Papel na turma', ['regente', 'professor', 'auxiliar']);
        const subjectIds = V.ids(l.subjectIds, 'Disciplinas', { max: 20 }).filter((sid) => sid in c.subjects);
        wanted.set(c.id, { role, subjectIds });
      }
      for (const c of tx.list('classes').slice()) {
        if (c.status === 'encerrada') continue;
        const w = wanted.get(c.id);
        const next = { ...c, subjects: { ...c.subjects }, assistantIds: (c.assistantIds || []).slice() };
        if (next.teacherId === u.id && (!w || w.role !== 'regente')) next.teacherId = null;
        for (const sid of Object.keys(next.subjects)) if (next.subjects[sid] === u.id && (!w || !w.subjectIds.includes(sid))) next.subjects[sid] = null;
        next.assistantIds = next.assistantIds.filter((x) => x !== u.id || (w && w.role === 'auxiliar'));
        if (w) {
          if (w.role === 'regente') next.teacherId = u.id;
          if (w.role === 'auxiliar' && !next.assistantIds.includes(u.id)) next.assistantIds.push(u.id);
          for (const sid of w.subjectIds) next.subjects[sid] = u.id;
        }
        if (util.canonical(next) !== util.canonical(c)) tx.put('classes', next);
      }
      const linkedStudentIds = V.ids(input.linkedStudentIds, 'Alunos acompanhados', { max: 200 }).filter((id) => tx.get('students', id));
      tx.put('users', { ...u, linkedStudentIds, subjectIds: [...new Set([...(u.subjectIds || []), ...[...wanted.values()].flatMap((w) => w.subjectIds)])] });
      X.endSessionsEffect(tx, u.id);
      tx.summary = `Turmas e aulas de ${u.name} atualizadas`;
      tx.audit = { entity: 'users', ids: [u.id] };
      return { id: u.id };
    },
  });

  E.define('me.update', {
    self: true,
    run(tx, input, ctx) {
      const cur = tx.need('users', ctx.user.id, 'Conta');
      const phone = V.phone(input.phone, 'Celular');
      X.uniqueLogin(tx, { phone, exceptId: cur.id });
      if (!phone && !cur.email) fail('invalid', 'Mantenha pelo menos um e-mail ou celular para entrar.');
      tx.put('users', { ...cur, phone });
      tx.summary = 'Celular atualizado';
      tx.audit = { entity: 'users', ids: [cur.id] };
      return { id: cur.id };
    },
  });

  return { AREAS };
});
