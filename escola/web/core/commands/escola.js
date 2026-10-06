/* Comandos: configurações, perfis de acesso, titularidade, disciplinas, turmas e virada do ano letivo. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('../util'), require('../perms'), require('../rules'), require('../engine'), require('./shared'));
  else factory(root.Core.util, root.Core.perms, root.Core.rules, root.Core.engine, root.Core.cmd);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (util, perms, rules, E, X) {
  'use strict';
  const { V, fail, norm } = util;

  const SEGMENTS = ['Educação Infantil', 'Fundamental I', 'Fundamental II', 'Ensino Médio', 'EJA', 'Outro'];
  const SHIFTS = ['Manhã', 'Tarde', 'Noite', 'Integral'];
  const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

  // ---------- configurações ----------
  E.define('settings.update', {
    perm: 'configuracoes.editar',
    run(tx, { patch = {} }) {
      const cur = tx.get('settings');
      const out = {};
      if (has(patch, 'schoolName')) out.schoolName = V.str(patch.schoolName, 'Nome da escola', { required: true, max: 120 });
      if (has(patch, 'cnpj')) out.cnpj = V.str(patch.cnpj, 'CNPJ', { max: 20 });
      if (has(patch, 'phone')) out.phone = V.phone(patch.phone, 'Telefone da escola');
      if (has(patch, 'address')) out.address = V.str(patch.address, 'Endereço da escola', { max: 200 });
      if (has(patch, 'timezone')) out.timezone = V.oneOf(patch.timezone, 'Fuso horário', ['America/Sao_Paulo', 'America/Manaus', 'America/Cuiaba', 'America/Porto_Velho', 'America/Rio_Branco', 'America/Belem', 'America/Fortaleza', 'America/Recife', 'America/Bahia', 'America/Noronha', 'America/Campo_Grande', 'America/Boa_Vista', 'America/Araguaina', 'America/Maceio']);
      if (has(patch, 'termCount')) {
        out.termCount = V.oneOf(Number(patch.termCount), 'Etapas', [2, 3, 4]);
        out.termLabel = { 2: 'semestre', 3: 'trimestre', 4: 'bimestre' }[out.termCount];
      }
      if (has(patch, 'term')) out.term = V.int(patch.term, 'Etapa atual', { required: true, min: 1, max: out.termCount || cur.termCount || 4 });
      if (has(patch, 'passing')) out.passing = V.num(patch.passing, 'Média para aprovação', { required: true, min: 0, max: 10 });
      if (has(patch, 'recovery')) out.recovery = V.num(patch.recovery, 'Nota mínima para recuperação', { required: true, min: 0, max: 10 });
      if (has(patch, 'chargesFees')) out.chargesFees = V.bool(patch.chargesFees);
      if (has(patch, 'defaultFee')) out.defaultFee = V.num(patch.defaultFee, 'Mensalidade padrão', { min: 0, max: 100000 }) || 0;
      if (has(patch, 'dueDay')) out.dueDay = V.int(patch.dueDay, 'Dia de vencimento', { required: true, min: 1, max: 28 });
      if (has(patch, 'lateFine')) out.lateFine = V.num(patch.lateFine, 'Multa por atraso', { min: 0, max: 2 }) || 0;
      if (has(patch, 'lateInterest')) out.lateInterest = V.num(patch.lateInterest, 'Juros ao mês', { min: 0, max: 10 }) || 0;
      if (has(patch, 'pixKey')) out.pixKey = V.str(patch.pixKey, 'Chave Pix', { max: 120 });
      if (has(patch, 'homeworkLabel')) out.homeworkLabel = V.oneOf(patch.homeworkLabel, 'Nome do dever', ['Dever de casa', 'Lição de casa', 'Tarefa', 'Para casa']);
      if (has(patch, 'diaryApproval')) out.diaryApproval = V.bool(patch.diaryApproval);
      if (has(patch, 'familyMessages')) out.familyMessages = V.bool(patch.familyMessages);
      if (has(patch, 'officeHours')) out.officeHours = V.str(patch.officeHours, 'Horário de atendimento', { max: 200 });
      if (has(patch, 'absenceAlert')) out.absenceAlert = V.int(patch.absenceAlert, 'Alerta de faltas seguidas', { min: 2, max: 30 });
      if (has(patch, 'segments')) {
        const seg = {};
        for (const name of SEGMENTS) {
          const v = (patch.segments || {})[name] || cur.segments[name] || rules.DEFAULT_SEGMENT;
          seg[name] = {
            attendance: V.oneOf(v.attendance, `Chamada (${name})`, ['diaria', 'por_aula']),
            minAttendance: V.int(v.minAttendance, `Frequência mínima (${name})`, { required: true, min: 0, max: 100 }),
            evaluation: V.oneOf(v.evaluation, `Avaliação (${name})`, ['nota', 'parecer']),
          };
        }
        out.segments = seg;
      }
      if (has(patch, 'routineFields')) {
        if (!Array.isArray(patch.routineFields) || patch.routineFields.length > 12) fail('invalid', 'Campos da rotina: lista inválida.');
        out.routineFields = patch.routineFields.map((f, i) => ({
          key: /^[a-z_]{2,30}$/.test(f.key || '') ? f.key : `campo_${i + 1}`,
          label: V.str(f.label, 'Nome do campo', { required: true, max: 40 }),
          options: V.strs(f.options, 'Opções', { max: 8, maxLen: 30 }),
        }));
      }
      if (has(patch, 'routineBring')) out.routineBring = V.strs(patch.routineBring, 'Itens para trazer', { max: 20, maxLen: 40 });
      if (has(patch, 'privacy')) {
        const p = patch.privacy || {};
        out.privacy = {
          controller: V.str(p.controller, 'Controlador dos dados', { max: 160 }),
          dpoName: V.str(p.dpoName, 'Encarregado de dados', { max: 120 }),
          dpoContact: V.str(p.dpoContact, 'Contato do encarregado', { max: 160 }),
          noticeVersion: String((Number((cur.privacy || {}).noticeVersion) || 1) + (p.bumpVersion ? 1 : 0)),
        };
      }
      const next = { ...cur, ...out };
      if (next.recovery > next.passing) fail('invalid', 'A nota de recuperação não pode ser maior que a média de aprovação.');
      if (!Object.keys(out).length) return { id: 'school' };
      tx.settings(out);
      tx.summary = 'Configurações da escola atualizadas';
      tx.audit = { entity: 'settings', ids: ['school'] };
      return { id: 'school' };
    },
  });

  // ---------- perfis de acesso ----------
  E.define('profiles.save', {
    perm: 'usuarios.gerenciar',
    run(tx, input, ctx) {
      const role = V.oneOf(input.role, 'Cargo', perms.STAFF_ROLES);
      if (role === ctx.user.role) fail('forbidden', 'Você não pode alterar o perfil do seu próprio cargo.');
      const st = tx.get('settings');
      const reset = V.bool(input.reset);
      const next = reset ? null : perms.withImplied(perms.clean(input.perms));
      const mine = perms.effective(ctx.user, st);
      if (next) for (const p of next) if (!perms.CONFIDENTIAL.has(p) && !mine.has(p)) fail('forbidden', `Você não pode dar "${perms.label(p)}", porque não tem essa permissão.`);
      // dominância sobre todos os afetados, com o perfil novo
      const profiles = { ...(st.profiles || {}) };
      if (reset) delete profiles[role];
      else profiles[role] = next;
      const trial = { ...tx.state, settings: { ...st, profiles } };
      // antes e depois: não dá para reduzir (nem ampliar) o acesso de quem tem mais acesso que você
      for (const u of tx.list('users')) {
        if (u.role !== role || u.status !== 'ativo') continue;
        if (!perms.dominates(ctx.user, u, tx.state) || !perms.dominates(ctx.user, u, trial)) fail('forbidden', `Esta mudança afetaria ${u.name}, que tem mais acesso do que você.`);
      }
      tx.settings({ profiles });
      const affected = tx.list('users').filter((u) => u.role === role).length;
      tx.summary = `Perfil de acesso "${perms.roleLabel(role)}" ${reset ? 'restaurado ao padrão' : 'atualizado'} (${affected} pessoa${affected === 1 ? '' : 's'})`;
      tx.audit = { entity: 'profiles', ids: [role] };
      for (const u of tx.list('users')) if (u.role === role) X.endSessionsEffect(tx, u.id);
      return { id: role, affected };
    },
  });

  E.define('owner.transfer', {
    staff: true,
    reauth: true,
    run(tx, input, ctx) {
      const st = tx.get('settings');
      if (st.ownerId !== ctx.user.id) fail('forbidden', 'Só a conta titular pode transferir a titularidade.');
      const to = X.staffUser(tx, input.userId, 'Nova conta titular');
      if (to.id === ctx.user.id) fail('invalid', 'Escolha outra pessoa.');
      if (!to.login) fail('invalid', `${to.name} precisa ter acesso ao sistema para ser titular.`);
      tx.settings({ ownerId: to.id });
      tx.summary = `Titularidade da conta transferida para ${to.name}`;
      tx.audit = { entity: 'users', ids: [to.id] };
      return { id: to.id };
    },
  });

  // ---------- disciplinas ----------
  E.define('subjects.save', {
    perm: 'configuracoes.editar',
    run(tx, input, ctx, env) {
      const name = V.str(input.name, 'Nome da disciplina', { required: true, max: 60 });
      const color = V.int(input.color, 'Cor', { min: 1, max: 8 }) || 1;
      const weekly = V.int(input.weekly, 'Aulas por semana', { min: 0, max: 15 }) ?? 1;
      const short = V.str(input.short, 'Abreviação', { max: 12 }) || (name.length > 9 ? name.slice(0, 5) + '.' : name);
      const dup = tx.list('subjects').find((s) => norm(s.name) === norm(name) && s.id !== input.id);
      if (dup) fail('conflict', `Já existe a disciplina ${dup.name}.`);
      if (input.id) {
        const cur = tx.need('subjects', input.id, 'Disciplina');
        tx.put('subjects', { ...cur, name, short, color, weekly });
        tx.summary = `Disciplina ${name} atualizada`;
        tx.audit = { entity: 'subjects', ids: [cur.id] };
        return { id: cur.id };
      }
      const id = env.newId('s');
      tx.put('subjects', { id, name, short, color, weekly });
      tx.summary = `Disciplina ${name} criada`;
      tx.audit = { entity: 'subjects', ids: [id] };
      return { id };
    },
  });

  E.define('subjects.delete', {
    perm: 'configuracoes.editar',
    undoable: true,
    run(tx, input) {
      const sub = tx.need('subjects', input.id, 'Disciplina');
      if (tx.keys('grades').some((k) => k.split('|')[2] === sub.id)) fail('conflict', `${sub.name} já tem notas lançadas. Ela pode ser retirada das turmas, mas não excluída.`);
      tx.del('subjects', sub.id);
      for (const c of tx.list('classes').slice()) {
        if (!(sub.id in (c.subjects || {})) && !c.schedule.flat().includes(sub.id)) continue;
        const subjects = { ...c.subjects };
        delete subjects[sub.id];
        tx.put('classes', { ...c, subjects, schedule: c.schedule.map((d) => d.map((x) => (x === sub.id ? '' : x))) });
      }
      for (const u of tx.list('users').slice()) if ((u.subjectIds || []).includes(sub.id)) tx.put('users', { ...u, subjectIds: u.subjectIds.filter((x) => x !== sub.id) });
      tx.summary = `Disciplina ${sub.name} excluída`;
      tx.audit = { entity: 'subjects', ids: [sub.id] };
      return { id: sub.id };
    },
  });

  // ---------- turmas ----------
  /** Vincular pessoas a turmas exige escopo "todas" e nunca sobre si mesmo. */
  const assertLinker = (ctx, userId) => {
    if (!ctx.all) fail('forbidden', 'Só quem enxerga todas as turmas pode definir quem dá aula em cada uma.');
    if (userId && userId === ctx.user.id) fail('forbidden', 'Peça a outra pessoa da gestão para vincular você a uma turma.');
  };

  E.define('classes.save', {
    perm: 'turmas.gerenciar',
    run(tx, input, ctx, env) {
      const name = V.str(input.name, 'Nome da turma', { required: true, max: 60 });
      const st = tx.get('settings');
      const data = {
        name,
        segment: V.oneOf(input.segment || 'Outro', 'Etapa de ensino', SEGMENTS),
        shift: V.oneOf(input.shift, 'Turno', SHIFTS),
        room: V.str(input.room, 'Sala', { max: 40 }),
        capacity: V.int(input.capacity, 'Vagas', { min: 0, max: 500 }) || 0,
      };
      const dup = tx.list('classes').find((c) => c.status !== 'encerrada' && norm(c.name) === norm(name) && c.id !== input.id);
      if (dup) fail('conflict', 'Já existe uma turma ativa com esse nome.');
      if (input.id) {
        const cur = tx.need('classes', input.id, 'Turma');
        ctx.needClass(cur.id);
        tx.put('classes', { ...cur, ...data });
        tx.summary = `Turma ${name} atualizada`;
        tx.audit = { entity: 'classes', ids: [cur.id] };
        return { id: cur.id };
      }
      if (!ctx.all) fail('forbidden', 'Só quem enxerga todas as turmas pode criar turmas.');
      let teacherId = null;
      if (input.teacherId) {
        assertLinker(ctx, input.teacherId);
        teacherId = X.staffUser(tx, input.teacherId, 'Professor(a) regente').id;
      }
      const id = env.newId('c');
      const subjects = {};
      for (const s of tx.list('subjects')) subjects[s.id] = null;
      const pool = [];
      for (const s of tx.list('subjects')) for (let k = 0; k < (s.weekly || 0); k++) pool.push(s.id);
      const schedule = [0, 1, 2, 3, 4].map((di) => [0, 1, 2, 3, 4].map((pi) => pool[(pi * 5 + di) % Math.max(1, pool.length)] || ''));
      const year = input.year ? V.int(input.year, 'Ano letivo da turma', { min: st.year, max: st.year + 1 }) : st.year;
      tx.put('classes', { id, ...data, year, status: 'ativa', teacherId, assistantIds: [], subjects, schedule });
      tx.summary = `Turma ${name} criada`;
      tx.audit = { entity: 'classes', ids: [id] };
      return { id };
    },
  });

  E.define('classes.close', {
    perm: 'turmas.gerenciar',
    undoable: true,
    run(tx, input, ctx) {
      const c = tx.need('classes', input.id, 'Turma');
      if (!ctx.all) fail('forbidden', 'Só quem enxerga todas as turmas pode encerrar turmas.');
      if (tx.list('students').some((s) => s.classId === c.id && s.status === 'ativo')) fail('conflict', 'A turma ainda tem alunos ativos. Mova os alunos antes de encerrar.');
      tx.put('classes', { ...c, status: 'encerrada' });
      tx.summary = `Turma ${c.name} encerrada`;
      tx.audit = { entity: 'classes', ids: [c.id] };
      return { id: c.id };
    },
  });

  E.define('classes.delete', {
    perm: 'turmas.gerenciar',
    run(tx, input, ctx) {
      const c = tx.need('classes', input.id, 'Turma');
      if (!ctx.all) fail('forbidden', 'Só quem enxerga todas as turmas pode excluir turmas.');
      const prefix = c.id + '|';
      const history = tx.list('students').some((s) => s.classId === c.id) || tx.keys('attendance').some((k) => k.startsWith(prefix)) || tx.list('diary').some((d) => d.classId === c.id) || tx.keys('routines').some((k) => k.startsWith(prefix));
      if (history) fail('conflict', 'Esta turma já tem alunos ou registros. Use "Encerrar turma" para guardar o histórico.');
      tx.del('classes', c.id);
      for (const u of tx.list('users').slice()) if ((u.classIds || []).includes(c.id)) tx.put('users', { ...u, classIds: u.classIds.filter((x) => x !== c.id) });
      tx.summary = `Turma ${c.name} excluída`;
      tx.audit = { entity: 'classes', ids: [c.id] };
      return { id: c.id };
    },
  });

  E.define('classes.assign', {
    perm: 'turmas.gerenciar',
    run(tx, input, ctx) {
      const c = tx.need('classes', input.classId, 'Turma');
      assertLinker(ctx, input.userId);
      const user = X.staffUser(tx, input.userId || null, 'Professor(a)');
      const userId = user ? user.id : null;
      if (input.slot === 'regente') {
        tx.put('classes', { ...c, teacherId: userId });
        tx.summary = `${rules.homeroomLabel(c)} do ${c.name}: ${user ? user.name : 'removido(a)'}`;
      } else {
        const sub = tx.need('subjects', input.slot, 'Disciplina');
        if (!(sub.id in c.subjects)) fail('invalid', `O ${c.name} não tem ${sub.name}.`);
        tx.put('classes', { ...c, subjects: { ...c.subjects, [sub.id]: userId } });
        tx.summary = `${sub.name} no ${c.name}: ${user ? user.name : 'sem professor(a)'}`;
      }
      tx.audit = { entity: 'classes', ids: [c.id] };
      return { id: c.id };
    },
  });

  E.define('classes.assistants', {
    perm: 'turmas.gerenciar',
    run(tx, input, ctx) {
      const c = tx.need('classes', input.classId, 'Turma');
      const ids = V.ids(input.userIds, 'Auxiliares', { max: 20 });
      ids.forEach((id) => assertLinker(ctx, id));
      if (!ctx.all) assertLinker(ctx, null);
      tx.put('classes', { ...c, assistantIds: ids.map((id) => X.staffUser(tx, id, 'Auxiliar').id) });
      tx.summary = `Auxiliares do ${c.name} atualizados`;
      tx.audit = { entity: 'classes', ids: [c.id] };
      return { id: c.id };
    },
  });

  E.define('classes.subject', {
    perm: 'turmas.gerenciar',
    run(tx, input, ctx) {
      const c = tx.need('classes', input.classId, 'Turma');
      ctx.needClass(c.id);
      const sub = tx.need('subjects', input.subjectId, 'Disciplina');
      const subjects = { ...c.subjects };
      let schedule = c.schedule;
      const enabled = V.bool(input.enabled);
      if (enabled) {
        if (!(sub.id in subjects)) subjects[sub.id] = null;
      } else {
        delete subjects[sub.id];
        schedule = schedule.map((d) => d.map((x) => (x === sub.id ? '' : x)));
      }
      tx.put('classes', { ...c, subjects, schedule });
      tx.summary = `${sub.name} ${enabled ? 'incluída no' : 'retirada do'} ${c.name}`;
      tx.audit = { entity: 'classes', ids: [c.id] };
      return { id: c.id };
    },
  });

  E.define('classes.slot', {
    perm: 'turmas.gerenciar',
    run(tx, input, ctx) {
      const c = tx.need('classes', input.classId, 'Turma');
      ctx.needClass(c.id);
      const day = V.int(input.day, 'Dia', { required: true, min: 0, max: 4 });
      const period = V.int(input.period, 'Tempo', { required: true, min: 0, max: 9 });
      const subjectId = input.subjectId || '';
      if (subjectId && !(subjectId in c.subjects)) fail('invalid', 'Esta disciplina não faz parte da turma.');
      const schedule = c.schedule.map((d) => d.slice());
      while (schedule.length < 5) schedule.push([]);
      while (schedule[day].length <= period) schedule[day].push('');
      schedule[day][period] = subjectId;
      tx.put('classes', { ...c, schedule });
      tx.summary = `Horário do ${c.name} atualizado`;
      tx.audit = { entity: 'classes', ids: [c.id] };
      return { id: c.id };
    },
  });

  // ---------- virada do ano letivo ----------
  /**
   * year.rollover {mapping: {turmaAntiga: turmaNova|null}, results: {alunoId: aprovado|retido|transferido|concluido}}
   * Grava o histórico de cada aluno, move os alunos, encerra as turmas antigas e abre o novo ano.
   * As turmas novas precisam existir antes (criadas no ano novo pela tela de virada).
   */
  E.define('year.rollover', {
    staff: true,
    reauth: true,
    run(tx, input, ctx, env) {
      const st = tx.get('settings');
      if (st.ownerId !== ctx.user.id) fail('forbidden', 'Só a conta titular pode fazer a virada do ano letivo.');
      const year = st.year;
      const nextYear = V.int(input.nextYear, 'Novo ano letivo', { required: true, min: year + 1, max: year + 1 });
      const mapping = input.mapping && typeof input.mapping === 'object' ? input.mapping : {};
      const results = input.results && typeof input.results === 'object' ? input.results : {};
      const idx = rules.attendanceIndex(tx.state.attendance, { year });
      const oldClasses = tx.list('classes').filter((c) => c.status !== 'encerrada' && c.year === year);
      let moved = 0;
      for (const c of oldClasses) {
        const target = mapping[c.id] ? tx.need('classes', mapping[c.id], 'Turma de destino') : null;
        if (target && target.year !== nextYear) fail('invalid', `A turma de destino ${target.name} não é do ano ${nextYear}.`);
        for (const s of tx.list('students').slice()) {
          if (s.classId !== c.id || s.status !== 'ativo') continue;
          const result = V.oneOf(results[s.id] || 'aprovado', `Resultado de ${s.name}`, ['aprovado', 'retido', 'transferido', 'concluido']);
          const subjects = Object.keys(c.subjects || {});
          const avg = util.avg(subjects.map((sid) => rules.subjectFinal(tx.state.grades, st, year, s.id, sid)));
          const att = rules.rateOf(idx.get(s.id));
          const history = (s.history || []).concat([{ year, classId: c.id, className: c.name, result, avg: avg == null ? null : Math.round(avg * 10) / 10, attendance: att == null ? null : Math.round(att) }]);
          let classId = s.classId;
          let status = s.status;
          if (result === 'transferido') status = 'transferido';
          else if (result === 'concluido') status = 'concluido';
          else if (result === 'aprovado') classId = target ? target.id : '';
          // retido: continua na mesma série — vai para a turma indicada em mapping[c.id + ':retido'] ou fica sem turma
          else if (result === 'retido') classId = mapping[c.id + ':retido'] ? tx.need('classes', mapping[c.id + ':retido'], 'Turma de destino').id : '';
          tx.put('students', { ...s, history, classId, status });
          tx.set('councils', util.key.make(String(year), s.id), { result, by: ctx.user.id, at: env.now, released: true });
          moved++;
        }
        tx.put('classes', { ...c, status: 'encerrada' });
      }
      const terms = { ...(st.terms || {}) };
      terms[nextYear] = {};
      for (let t = 1; t <= (st.termCount || 4); t++) terms[nextYear][t] = { closed: false, released: false };
      tx.settings({ year: nextYear, term: 1, terms });
      tx.summary = `Virada do ano letivo: ${year} → ${nextYear} (${moved} alunos)`;
      tx.audit = { entity: 'settings', ids: ['school'] };
      return { id: 'school', moved };
    },
  });

  return { SEGMENTS, SHIFTS };
});
