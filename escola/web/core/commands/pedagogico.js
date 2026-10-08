/* Comandos: chamada (diária ou por aula), justificativas, notas/pareceres, etapas e conselho de classe. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('../util'), require('../perms'), require('../rules'), require('../engine'));
  else (root.Core = root.Core || {}).pedagogico = factory(root.Core.util, root.Core.perms, root.Core.rules, root.Core.engine);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (util, perms, rules, E) {
  'use strict';
  const { V, fail } = util;
  const fmtDate = (s) => s.split('-').reverse().join('/');

  /** Quem registra a chamada de uma aula: professor da disciplina; regente/vinculado na diária; escopo "todas", qualquer aula. */
  const canTakeLesson = (ctx, klass, period, subjectId) => {
    if (ctx.all) return true;
    if (!perms.reachesClass(ctx, klass.id)) return false;
    if (!period) return true; // chamada diária: qualquer pessoa vinculada à turma (regente, auxiliar)
    if (klass.teacherId === ctx.user.id && ['Educação Infantil', 'Fundamental I'].includes(klass.segment)) return true;
    return !!subjectId && klass.subjects && klass.subjects[subjectId] === ctx.user.id;
  };

  /**
   * attendance.save {classId, date, period, marks: {studentId: P|F|J|A}, content?, baseAt?, reasons?}
   * Envia só as marcações alteradas; as demais ficam como estão (ou "P" se a chamada é nova).
   * baseAt: `at` da versão que a pessoa abriu; `null` = abriu a chamada ainda não registrada
   * (se outra pessoa registrar antes, dá conflito). reasons: {studentId: motivo} para J/A, só com chamada.justificar.
   */
  E.define('attendance.save', {
    perm: 'chamada.registrar',
    run(tx, input, ctx, env) {
      const st = tx.get('settings');
      const c = tx.need('classes', input.classId, 'Turma');
      ctx.needClass(c.id);
      const date = V.date(input.date, 'Data da chamada', { required: true });
      if (date > env.today) fail('invalid', 'Não dá para registrar chamada de um dia que ainda não chegou.');
      const mode = rules.attendanceMode(st, c);
      const period = mode === 'por_aula' ? V.int(input.period, 'Aula', { required: true, min: 1, max: 9 }) : 0;
      let subjectId = null;
      if (period) {
        const lesson = rules.periodsFor(st, c, date).find((p) => p.period === period);
        subjectId = (lesson && lesson.subjectId) || (typeof input.subjectId === 'string' && Object.prototype.hasOwnProperty.call(c.subjects || {}, input.subjectId) && tx.get('subjects', input.subjectId) ? input.subjectId : null);
        if (!subjectId) fail('invalid', 'Esta aula não está no horário da turma.');
      }
      if (!canTakeLesson(ctx, c, period, subjectId)) fail('forbidden', 'Esta aula é de outro(a) professor(a).');
      const key = rules.attendanceKey(c.id, date, period);
      const prev = tx.get('attendance', key);
      const base = Object.prototype.hasOwnProperty.call(input, 'baseAt') ? input.baseAt : undefined;
      if (prev && base !== undefined && (base === null || base === '' || prev.at !== base) && prev.by !== ctx.user.id) {
        const who = tx.get('users', prev.by);
        fail('conflict', `${who ? who.name : 'Outra pessoa'} salvou esta chamada enquanto você editava. Confira e salve de novo.`);
      }
      const roster = rules.roster(tx.state, c.id, date, period);
      if (!roster.length) fail('invalid', 'Esta turma não tem alunos ativos.');
      const given = input.marks && typeof input.marks === 'object' ? input.marks : {};
      const marks = {};
      const reasons = { ...((prev && prev.reasons) || {}) };
      for (const s of roster) {
        const old = prev && prev.marks ? prev.marks[s.id] : undefined;
        let m = Object.prototype.hasOwnProperty.call(given, s.id) ? V.oneOf(given[s.id], 'Marcação', ['P', 'F', 'J', 'A']) : old || 'P';
        // justificar e abonar é de quem tem chamada.justificar; na chamada comum só P e F
        if ((m === 'J' || m === 'A') && m !== old && !ctx.can('chamada.justificar')) m = 'F';
        // e uma falta já justificada/abonada pela secretaria não é desfeita por quem não justifica
        if ((old === 'J' || old === 'A') && m !== old && !ctx.can('chamada.justificar')) m = old;
        if (m !== old && (m === 'P' || m === 'F')) delete reasons[s.id];
        marks[s.id] = m;
      }
      // motivo de falta justificada/abonada, para quem pode justificar (o resto é ignorado)
      const givenReasons = input.reasons && typeof input.reasons === 'object' && !Array.isArray(input.reasons) ? input.reasons : null;
      if (givenReasons && ctx.can('chamada.justificar')) {
        for (const s of roster) {
          if (!Object.prototype.hasOwnProperty.call(givenReasons, s.id) || (marks[s.id] !== 'J' && marks[s.id] !== 'A')) continue;
          const r = V.str(givenReasons[s.id], 'Motivo', { max: 300 });
          if (r) reasons[s.id] = r;
          else delete reasons[s.id];
        }
      }
      const content = input.content === undefined ? (prev && prev.content) || '' : V.text(input.content, 'Conteúdo da aula', { max: 2000 });
      tx.set('attendance', key, { marks, reasons: Object.keys(reasons).length ? reasons : undefined, subjectId, content, by: ctx.user.id, at: env.now });
      const f = Object.values(marks).filter((m) => m === 'F').length;
      const sub = subjectId ? tx.get('subjects', subjectId) : null;
      tx.summary = `Chamada do ${c.name}${sub ? ` (${period}ª aula, ${sub.name})` : ''} ${prev ? 'corrigida' : 'registrada'} em ${fmtDate(date)}: ${f} falta${f === 1 ? '' : 's'}`;
      tx.audit = { entity: 'attendance', ids: [key] };
      return { id: key, at: env.now, absent: f, total: roster.length };
    },
  });

  /** attendance.justify {classId, date, period?, studentId, mark: J|A|F, reason} — em todas as aulas do dia se period ausente. */
  E.define('attendance.justify', {
    perm: 'chamada.justificar',
    run(tx, input, ctx, env) {
      const c = tx.need('classes', input.classId, 'Turma');
      const s = tx.need('students', input.studentId, 'Aluno');
      ctx.needStudent(s);
      const date = V.date(input.date, 'Data', { required: true });
      const mark = V.oneOf(input.mark, 'Marcação', ['J', 'A', 'F']);
      const reason = V.str(input.reason, 'Motivo', { required: mark !== 'F', max: 300 });
      const keys = input.period != null ? [rules.attendanceKey(c.id, date, V.int(input.period, 'Aula', { min: 0, max: 9 }))] : tx.keys('attendance').filter((k) => k.startsWith(`${c.id}|${date}|`));
      let n = 0;
      for (const k of keys) {
        const rec = tx.get('attendance', k);
        if (!rec || !rec.marks || !(s.id in rec.marks) || rec.marks[s.id] === 'P') continue;
        const reasons = { ...(rec.reasons || {}) };
        if (mark === 'F') delete reasons[s.id];
        else reasons[s.id] = reason;
        tx.set('attendance', k, { ...rec, marks: { ...rec.marks, [s.id]: mark }, reasons: Object.keys(reasons).length ? reasons : undefined });
        n++;
      }
      if (!n) fail('not_found', 'Não há falta registrada para este aluno nesse dia.');
      tx.summary = `Falta de ${s.name} em ${fmtDate(date)}: ${{ J: 'justificada', A: 'abonada', F: 'sem justificativa' }[mark]}`;
      tx.audit = { entity: 'students', ids: [s.id] };
      return { id: s.id, updated: n };
    },
  });

  /** grades.set {studentId, subjectId (ou _parecer), term (1.., recN, rf), value} */
  E.define('grades.set', {
    perm: 'notas.lancar',
    run(tx, input, ctx) {
      const st = tx.get('settings');
      const s = tx.need('students', input.studentId, 'Aluno');
      ctx.needStudent(s);
      const klass = tx.get('classes', s.classId);
      if (!klass) fail('invalid', 'O aluno precisa estar em uma turma para receber notas.');
      const year = String(st.year);
      const termRaw = String(input.term);
      const termCount = Number(st.termCount) || 4;
      if (!(/^[1-4]$/.test(termRaw) && Number(termRaw) <= termCount) && !(/^rec[1-4]$/.test(termRaw) && Number(termRaw.slice(3)) <= termCount) && termRaw !== 'rf') fail('invalid', 'Etapa inválida.');
      const baseTerm = termRaw === 'rf' ? String(termCount) : termRaw.replace('rec', '');
      if (!rules.termOpen(st, year, baseTerm) && !ctx.can('notas.fechar')) fail('forbidden', 'Esta etapa já foi fechada. Peça a correção à coordenação.');
      const parecer = input.subjectId === '_parecer';
      if (parecer) {
        if (rules.evaluation(st, klass) !== 'parecer') fail('invalid', 'Esta turma é avaliada com notas.');
        if (!ctx.all && klass.teacherId !== ctx.user.id && !(klass.assistantIds || []).includes(ctx.user.id)) fail('forbidden', 'O parecer é escrito pela professora regente da turma.');
        if (!/^[1-4]$/.test(termRaw)) fail('invalid', 'Etapa inválida.');
        const text = V.text(input.value, 'Parecer', { max: 4000 });
        const key = util.key.make(year, s.id, '_parecer', termRaw);
        tx.set('grades', key, text || null);
        tx.summary = `Parecer descritivo de ${s.name} (${termRaw}ª etapa) ${text ? 'registrado' : 'apagado'}`;
        tx.audit = { entity: 'grades', ids: [key] };
        return { id: key };
      }
      const sub = tx.need('subjects', input.subjectId, 'Disciplina');
      if (!Object.prototype.hasOwnProperty.call(klass.subjects || {}, sub.id)) fail('invalid', `O ${klass.name} não tem ${sub.name}.`);
      if (!perms.canGradeSubject(ctx, klass, sub.id)) fail('forbidden', `${sub.name} no ${klass.name} é de outro(a) professor(a).`);
      let value = input.value;
      if (value === '' || value === undefined) value = null;
      if (value !== null) value = Math.round(V.num(value, 'Nota', { required: true, min: 0, max: 10 }) * 10) / 10;
      const key = util.key.make(year, s.id, sub.id, termRaw);
      tx.set('grades', key, value);
      const label = termRaw === 'rf' ? 'recuperação final' : termRaw.startsWith('rec') ? `recuperação da ${termRaw.slice(3)}ª etapa` : `${termRaw}ª etapa`;
      tx.summary = `Nota de ${sub.name} (${label}) de ${s.name}: ${value === null ? 'apagada' : String(value).replace('.', ',')}`;
      tx.audit = { entity: 'grades', ids: [key] };
      return { id: key, value };
    },
  });

  /** terms.update {term, closed?, released?} — fechar etapa e liberar o boletim para as famílias. */
  E.define('terms.update', {
    perm: 'notas.fechar',
    run(tx, input, ctx) {
      if (!ctx.all) fail('forbidden', 'Só quem enxerga todas as turmas pode fechar etapas.');
      const st = tx.get('settings');
      const term = V.int(input.term, 'Etapa', { required: true, min: 1, max: Number(st.termCount) || 4 });
      const year = String(st.year);
      const terms = { ...(st.terms || {}) };
      const y = { ...(terms[year] || {}) };
      const cur = { closed: false, released: false, ...(y[term] || {}) };
      if (input.closed !== undefined) cur.closed = V.bool(input.closed);
      if (input.released !== undefined) cur.released = V.bool(input.released);
      if (cur.released && !cur.closed) fail('invalid', 'Feche a etapa antes de liberar o boletim para as famílias.');
      y[term] = cur;
      terms[year] = y;
      tx.settings({ terms });
      tx.summary = `${term}ª etapa de ${year}: ${cur.closed ? 'fechada' : 'aberta'}${cur.released ? ' e liberada às famílias' : ''}`;
      tx.audit = { entity: 'settings', ids: ['school'] };
      return { id: String(term) };
    },
  });

  /** councils.set {studentId, result, note, released} — resultado do conselho de classe do ano. */
  E.define('councils.set', {
    perm: 'notas.fechar',
    run(tx, input, ctx, env) {
      const st = tx.get('settings');
      const s = tx.need('students', input.studentId, 'Aluno');
      ctx.needStudent(s);
      const result = V.oneOf(input.result || null, 'Resultado', ['aprovado', 'retido', 'recuperacao', 'transferido'], { required: false });
      const key = util.key.make(String(st.year), s.id);
      if (!result) {
        tx.del('councils', key);
        tx.summary = `Resultado do conselho de classe de ${s.name} removido`;
      } else {
        tx.set('councils', key, { result, note: V.text(input.note, 'Observação do conselho', { max: 1000 }), released: V.bool(input.released), by: ctx.user.id, at: env.now });
        tx.summary = `Conselho de classe: ${s.name} — ${result}`;
      }
      tx.audit = { entity: 'students', ids: [s.id] };
      return { id: key };
    },
  });

  return { canTakeLesson };
});
