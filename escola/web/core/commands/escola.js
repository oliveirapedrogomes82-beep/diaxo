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
  /** Anexa o nome do campo ao erro de validação (a tela marca o campo certo). */
  const at = (field, fn) => {
    try {
      return fn();
    } catch (e) {
      if (e && e.code && !e.field) e.field = field;
      throw e;
    }
  };
  const TIMEZONES = ['America/Sao_Paulo', 'America/Manaus', 'America/Cuiaba', 'America/Porto_Velho', 'America/Rio_Branco', 'America/Belem', 'America/Fortaleza', 'America/Recife', 'America/Bahia', 'America/Noronha', 'America/Campo_Grande', 'America/Boa_Vista', 'America/Araguaina', 'America/Maceio'];
  const TERM_LABEL = { 2: 'semestre', 3: 'trimestre', 4: 'bimestre' };
  /** Chave estável de um campo da rotina (os registros guardam o valor por chave). */
  const ROUTINE_KEY = /^[a-z][a-z0-9_]{1,29}$/;
  const routineKey = (label) => {
    let k = norm(label).replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 30);
    if (!/^[a-z]/.test(k)) k = ('campo_' + k).slice(0, 30);
    return ROUTINE_KEY.test(k) ? k : 'campo';
  };

  E.define('settings.update', {
    perm: 'configuracoes.editar',
    run(tx, input) {
      const patch = input && input.patch && typeof input.patch === 'object' && !Array.isArray(input.patch) ? input.patch : {};
      const cur = tx.get('settings');
      const out = {};
      const f = (key, fn) => {
        if (has(patch, key)) out[key] = at(key, fn);
      };
      f('schoolName', () => V.str(patch.schoolName, 'Nome da escola', { required: true, max: 120 }));
      f('cnpj', () => V.str(patch.cnpj, 'CNPJ', { max: 20 }));
      f('phone', () => V.phone(patch.phone, 'Telefone da escola'));
      f('address', () => V.str(patch.address, 'Endereço da escola', { max: 200 }));
      f('timezone', () => V.oneOf(patch.timezone, 'Fuso horário', TIMEZONES));
      if (has(patch, 'termCount')) {
        const count = at('termCount', () => V.oneOf(Number(patch.termCount), 'Etapas', [2, 3, 4]));
        out.termCount = count;
        out.termLabel = TERM_LABEL[count];
        // menos etapas: não deixa notas do ano corrente "sumirem" em etapas que deixariam de existir
        if (count < (Number(cur.termCount) || 4)) {
          const y = String(cur.year);
          const orphan = tx.keys('grades').some((k) => {
            const p = k.split('|');
            if (p[0] !== y) return false;
            const t = String(p[3]).replace(/^rec/, '');
            return /^\d+$/.test(t) && Number(t) > count;
          });
          if (orphan) fail('invalid', `Já há notas lançadas depois do ${count}º ${TERM_LABEL[count]} em ${y}. Para dividir o ano em ${count} etapas, essas notas precisam ser apagadas antes.`, 'termCount');
        }
        if (!has(patch, 'term') && Number(cur.term) > count) out.term = count;
      }
      f('term', () => V.int(patch.term, 'Etapa atual', { required: true, min: 1, max: out.termCount || cur.termCount || 4 }));
      f('passing', () => V.num(patch.passing, 'Média para aprovação', { required: true, min: 0, max: 10 }));
      f('recovery', () => V.num(patch.recovery, 'Nota mínima para recuperação', { required: true, min: 0, max: 10 }));
      f('chargesFees', () => V.bool(patch.chargesFees));
      f('defaultFee', () => V.num(patch.defaultFee, 'Mensalidade padrão', { min: 0, max: 100000 }) || 0);
      f('dueDay', () => V.int(patch.dueDay, 'Dia de vencimento', { required: true, min: 1, max: 28 }));
      f('lateFine', () => V.num(patch.lateFine, 'Multa por atraso', { min: 0, max: 2 }) || 0);
      f('lateInterest', () => V.num(patch.lateInterest, 'Juros ao mês', { min: 0, max: 10 }) || 0);
      f('pixKey', () => V.str(patch.pixKey, 'Chave Pix', { max: 120 }));
      f('homeworkLabel', () => V.oneOf(patch.homeworkLabel, 'Nome do dever', ['Dever de casa', 'Lição de casa', 'Tarefa', 'Para casa']));
      f('diaryApproval', () => V.bool(patch.diaryApproval));
      f('familyMessages', () => V.bool(patch.familyMessages));
      f('officeHours', () => V.str(patch.officeHours, 'Horário de atendimento', { max: 200 }));
      f('absenceAlert', () => V.int(patch.absenceAlert, 'Alerta de faltas seguidas', { min: 2, max: 30 }));
      if (has(patch, 'segments')) {
        const seg = {};
        const given = patch.segments && typeof patch.segments === 'object' ? patch.segments : {};
        for (const name of SEGMENTS) {
          const v = (has(given, name) && given[name]) || (cur.segments || {})[name] || rules.DEFAULT_SEGMENT;
          const k = `segments.${name}.`;
          seg[name] = {
            attendance: at(k + 'attendance', () => V.oneOf(v.attendance, `Chamada (${name})`, ['diaria', 'por_aula'])),
            minAttendance: at(k + 'minAttendance', () => V.int(v.minAttendance, `Frequência mínima (${name})`, { required: true, min: 0, max: 100 })),
            evaluation: at(k + 'evaluation', () => V.oneOf(v.evaluation, `Avaliação (${name})`, ['nota', 'parecer'])),
          };
        }
        out.segments = seg;
      }
      if (has(patch, 'routineFields')) {
        if (!Array.isArray(patch.routineFields) || patch.routineFields.length > 12) fail('invalid', 'Campos da rotina: use no máximo 12 campos.', 'routineFields');
        const used = new Set();
        out.routineFields = patch.routineFields.map((raw) => {
          const fld = raw && typeof raw === 'object' ? raw : {};
          const label = at('routineFields', () => V.str(fld.label, 'Nome do campo da rotina', { required: true, max: 40 }));
          if (fld.options != null && (!Array.isArray(fld.options) || fld.options.length > 8)) fail('invalid', `O campo "${label}" pode ter no máximo 8 opções.`, 'routineFields');
          const options = at('routineFields', () => V.strs(fld.options, `Opções de "${label}"`, { max: 8, maxLen: 30 }));
          if (!options.length) fail('invalid', `O campo "${label}" precisa de pelo menos uma opção.`, 'routineFields');
          // a chave guardada continua a mesma ao renomear ou reordenar (os registros antigos seguem ligados)
          const base = typeof fld.key === 'string' && ROUTINE_KEY.test(fld.key) ? fld.key : routineKey(label);
          let key = base;
          for (let n = 2; used.has(key); n++) key = `${base.slice(0, 26)}_${n}`;
          used.add(key);
          return { key, label, options };
        });
      }
      f('routineBring', () => {
        if (patch.routineBring != null && (!Array.isArray(patch.routineBring) || patch.routineBring.length > 20)) fail('invalid', 'Itens para trazer: use no máximo 20 itens.');
        return V.strs(patch.routineBring, 'Itens para trazer', { max: 20, maxLen: 40 });
      });
      if (has(patch, 'privacy')) {
        const p = patch.privacy && typeof patch.privacy === 'object' ? patch.privacy : {};
        out.privacy = {
          controller: at('privacy.controller', () => V.str(p.controller, 'Controlador dos dados', { max: 160 })),
          dpoName: at('privacy.dpoName', () => V.str(p.dpoName, 'Encarregado de dados', { max: 120 })),
          dpoContact: at('privacy.dpoContact', () => V.str(p.dpoContact, 'Contato do encarregado', { max: 160 })),
          noticeVersion: String((Number((cur.privacy || {}).noticeVersion) || 1) + (p.bumpVersion ? 1 : 0)),
        };
      }
      const next = { ...cur, ...out };
      if (Number(next.recovery) > Number(next.passing)) fail('invalid', 'A nota de recuperação não pode ser maior que a média de aprovação.', has(patch, 'recovery') ? 'recovery' : 'passing');
      if (!Object.keys(out).length) return { id: 'school' };
      tx.settings(out);
      tx.summary = out.privacy && (patch.privacy || {}).bumpVersion ? `Nova versão do aviso de privacidade publicada (versão ${out.privacy.noticeVersion})` : 'Configurações da escola atualizadas';
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
      // o perfil atual também precisa caber no acesso do ator (senão quem tem menos acesso tiraria acessos de um cargo acima)
      for (const p of perms.profile(role, st)) if (!perms.CONFIDENTIAL.has(p) && !mine.has(p)) fail('forbidden', `O perfil "${perms.roleLabel(role)}" tem acessos que você não tem ("${perms.label(p)}"). Só quem tem todos eles pode alterá-lo.`);
      if (next) for (const p of next) if (!perms.CONFIDENTIAL.has(p) && !mine.has(p)) fail('forbidden', `Você não pode dar "${perms.label(p)}", porque não tem essa permissão.`);
      // dominância sobre todos os afetados, com o perfil novo
      const profiles = { ...(st.profiles || {}) };
      const system = perms.ROLE[role].perms;
      // igual ao padrão do sistema: volta a ser o padrão (não fica marcado como personalizado)
      if (reset || (next.length === system.length && next.every((p) => system.includes(p)))) delete profiles[role];
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
      if (to.validUntil) fail('invalid', `${to.name} tem acesso com prazo (até ${to.validUntil.split('-').reverse().join('/')}). A conta titular não pode ter prazo.`);
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
      const name = at('name', () => V.str(input.name, 'Nome da disciplina', { required: true, max: 60 }));
      const color = at('color', () => V.int(input.color, 'Cor', { min: 1, max: 8 })) || 1;
      const weekly = at('weekly', () => V.int(input.weekly, 'Aulas por semana', { min: 0, max: 15 })) ?? 1;
      const short = at('short', () => V.str(input.short, 'Abreviação', { max: 12 })) || (name.length > 9 ? name.slice(0, 5) + '.' : name);
      const dup = tx.list('subjects').find((s) => norm(s.name) === norm(name) && s.id !== input.id);
      if (dup) fail('conflict', `Já existe a disciplina ${dup.name}.`, 'name');
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
      // a chamada por aula guarda a disciplina de cada aula: sem ela o histórico de frequência perderia o nome
      const att = tx.state.attendance;
      if (Object.keys(att).some((k) => att[k] && att[k].subjectId === sub.id)) fail('conflict', `${sub.name} já tem aulas registradas na chamada. Ela pode ser retirada das turmas, mas não excluída.`);
      tx.del('subjects', sub.id);
      for (const c of tx.list('classes').slice()) {
        const schedule = Array.isArray(c.schedule) ? c.schedule : [];
        if (!(sub.id in (c.subjects || {})) && !schedule.flat().includes(sub.id)) continue;
        const subjects = { ...c.subjects };
        delete subjects[sub.id];
        tx.put('classes', { ...c, subjects, schedule: schedule.map((d) => (Array.isArray(d) ? d : []).map((x) => (x === sub.id ? '' : x))) });
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
        const t = X.staffUser(tx, input.teacherId, 'Professor(a) regente');
        X.assertCanLink(tx, ctx, t);
        teacherId = t.id;
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
      X.assertCanLink(tx, ctx, user);
      // tirar alguém de uma turma também mexe no alcance dela: vale a mesma regra para quem sai
      const prevId = input.slot === 'regente' ? c.teacherId : X.hasSubject(tx, c, input.slot) ? c.subjects[input.slot] : null;
      if (prevId && prevId !== (user && user.id)) X.assertCanLink(tx, ctx, tx.get('users', prevId));
      const userId = user ? user.id : null;
      if (input.slot === 'regente') {
        tx.put('classes', { ...c, teacherId: userId });
        tx.summary = `${rules.homeroomLabel(c)} do ${c.name}: ${user ? user.name : 'removido(a)'}`;
      } else {
        const sub = tx.need('subjects', input.slot, 'Disciplina');
        if (!X.hasSubject(tx, c, sub.id)) fail('invalid', `O ${c.name} não tem ${sub.name}.`);
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
      const before = new Set(c.assistantIds || []);
      const after = new Set(ids);
      for (const id of new Set([...before, ...after])) if (before.has(id) !== after.has(id)) X.assertCanLink(tx, ctx, tx.get('users', id));
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
      if (subjectId && !X.hasSubject(tx, c, subjectId)) fail('invalid', 'Esta disciplina não faz parte da turma.');
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
  const RESULTS = ['aprovado', 'retido', 'transferido', 'concluido'];
  const NEW_REF = /^new:\d{1,3}$/;
  /**
   * year.rollover {nextYear, open, mapping, results} — só a titular, com senha.
   *   open: [{ref: 'new:1', name, segment, shift, from?: turmaAntiga, people?: bool}] — turmas do novo ano, criadas aqui
   *         na mesma transação. `from` copia sala, vagas, disciplinas e horário da turma antiga; com `people` copia também
   *         regente, auxiliares, professores das disciplinas e os vínculos (classIds) de quem atuava nela.
   *   mapping: {turmaAntiga: destino|null, 'turmaAntiga:retido': destino|null} — destino = ref de `open` ou id de uma
   *         turma ativa do novo ano que já exista.
   *   results: {alunoId: aprovado|retido|transferido|concluido} (padrão: aprovado).
   * Grava o histórico de cada aluno (média e frequência do ano), move os alunos, encerra as turmas antigas e abre o novo ano.
   */
  E.define('year.rollover', {
    staff: true,
    reauth: true,
    run(tx, input, ctx, env) {
      const st = tx.get('settings');
      if (st.ownerId !== ctx.user.id) fail('forbidden', 'Só a conta titular pode fazer a virada do ano letivo.');
      const year = Number(st.year);
      const nextYear = V.int(input.nextYear, 'Novo ano letivo', { required: true, min: year + 1, max: year + 1 });
      const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
      const mapping = obj(input.mapping);
      const results = obj(input.results);
      const oldClasses = tx.list('classes').filter((c) => c.status !== 'encerrada' && Number(c.year) === year);
      const oldIds = new Set(oldClasses.map((c) => c.id));

      // ---- turmas do novo ano ----
      const open = input.open == null ? [] : input.open;
      if (!Array.isArray(open) || open.length > 200) fail('invalid', 'Lista de turmas novas inválida.');
      const names = new Set(tx.list('classes').filter((c) => c.status !== 'encerrada' && !oldIds.has(c.id)).map((c) => norm(c.name)));
      const refs = new Map();
      const pool = [];
      for (const sub of tx.list('subjects')) for (let k = 0; k < (sub.weekly || 0); k++) pool.push(sub.id);
      for (const raw of open) {
        const o = obj(raw);
        const ref = String(o.ref || '');
        if (!NEW_REF.test(ref) || refs.has(ref)) fail('invalid', 'Turma nova com referência inválida.');
        const name = V.str(o.name, 'Nome da turma nova', { required: true, max: 60 });
        if (names.has(norm(name))) fail('conflict', `Já existe uma turma "${name}" em ${nextYear}. Use outro nome.`);
        names.add(norm(name));
        const src = o.from ? oldClasses.find((c) => c.id === o.from) : null;
        if (o.from && !src) fail('not_found', 'Turma de origem não encontrada.');
        const segment = V.oneOf(o.segment || (src && src.segment) || 'Outro', `Etapa de ensino de ${name}`, SEGMENTS);
        const shift = V.oneOf(o.shift || (src && src.shift) || 'Manhã', `Turno de ${name}`, SHIFTS);
        const people = !!src && V.bool(o.people);
        let subjects;
        let schedule;
        if (src) {
          subjects = {};
          for (const [sid, uid] of Object.entries(src.subjects || {})) subjects[sid] = people ? uid || null : null;
          schedule = (Array.isArray(src.schedule) ? src.schedule : []).map((d) => (Array.isArray(d) ? d.slice() : []));
        } else {
          subjects = {};
          for (const sub of tx.list('subjects')) subjects[sub.id] = null;
          schedule = [0, 1, 2, 3, 4].map((di) => [0, 1, 2, 3, 4].map((pi) => pool[(pi * 5 + di) % Math.max(1, pool.length)] || ''));
        }
        const id = env.newId('c');
        tx.put('classes', {
          id, name, year: nextYear, status: 'ativa', segment, shift,
          room: src ? src.room || '' : '', capacity: src ? Number(src.capacity) || 0 : 0,
          teacherId: people ? src.teacherId || null : null,
          assistantIds: people ? (src.assistantIds || []).slice() : [],
          subjects, schedule,
        });
        if (people) for (const u of tx.list('users').slice()) if ((u.classIds || []).includes(src.id) && !u.classIds.includes(id)) tx.put('users', { ...u, classIds: u.classIds.concat([id]) });
        refs.set(ref, id);
      }
      const target = (v, label) => {
        if (!v) return null;
        if (refs.has(v)) return tx.get('classes', refs.get(v));
        const t = tx.need('classes', v, label);
        if (Number(t.year) !== nextYear || t.status === 'encerrada') fail('invalid', `A turma de destino ${t.name} não é do ano ${nextYear}.`);
        return t;
      };

      // ---- alunos ----
      const idx = rules.attendanceIndex(tx.state.attendance, { year });
      let moved = 0;
      const counts = { aprovado: 0, retido: 0, transferido: 0, concluido: 0 };
      for (const c of oldClasses) {
        const promoted = target(mapping[c.id], 'Turma de destino');
        const retained = target(mapping[c.id + ':retido'], 'Turma de destino');
        const subjects = Object.keys(c.subjects || {});
        for (const s of tx.list('students').slice()) {
          if (s.classId !== c.id || s.status !== 'ativo') continue;
          const result = V.oneOf(results[s.id] || 'aprovado', `Resultado de ${s.name}`, RESULTS);
          const avg = util.avg(subjects.map((sid) => rules.subjectFinal(tx.state.grades, st, year, s.id, sid)));
          const att = rules.rateOf(idx.get(s.id));
          const history = (s.history || []).concat([{ year, classId: c.id, className: c.name, result, avg: avg == null ? null : Math.round(avg * 10) / 10, attendance: att == null ? null : Math.round(att) }]);
          let classId = s.classId;
          let status = s.status;
          if (result === 'transferido') status = 'transferido';
          else if (result === 'concluido') status = 'concluido';
          else if (result === 'aprovado') classId = promoted ? promoted.id : '';
          else classId = retained ? retained.id : ''; // retido: continua na mesma série
          tx.put('students', { ...s, history, classId, status });
          const key = util.key.make(String(year), s.id);
          const prev = tx.get('councils', key) || {};
          tx.set('councils', key, { ...prev, result, by: ctx.user.id, at: env.now, released: true });
          counts[result]++;
          moved++;
        }
        tx.put('classes', { ...c, status: 'encerrada' });
      }
      const terms = { ...(st.terms || {}) };
      terms[nextYear] = {};
      for (let t = 1; t <= (Number(st.termCount) || 4); t++) terms[nextYear][t] = { closed: false, released: false };
      tx.settings({ year: nextYear, term: 1, terms });
      tx.summary = `Virada do ano letivo: ${year} → ${nextYear} (${moved} alunos, ${oldClasses.length} turmas encerradas, ${refs.size} turmas abertas)`;
      tx.audit = { entity: 'settings', ids: ['school'] };
      return { id: 'school', moved, ...counts, closed: oldClasses.length, created: [...refs.values()] };
    },
  });

  return { SEGMENTS, SHIFTS };
});
