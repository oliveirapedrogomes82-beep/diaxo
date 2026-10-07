/* Comandos: atendimentos (psicologia, psicopedagogia, orientação, AEE, serviço social) e planos de acompanhamento.
   Sigilo: só o autor edita; correção por adendo; ninguém exclui. O conteúdo é lido por support.read (auditado). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('../util'), require('../perms'), require('../engine'));
  else factory(root.Core.util, root.Core.perms, root.Core.engine);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (util, perms, E) {
  'use strict';
  const { V, fail } = util;
  const AREAS = ['psicologia', 'psicopedagogia', 'orientacao', 'aee', 'servico_social'];
  const TYPES = ['atendimento', 'observacao', 'familia', 'devolutiva', 'encaminhamento'];

  E.define('support.save', {
    perm: 'atendimentos.registrar',
    run(tx, input, ctx, env) {
      // edição: só o autor; o aluno é sempre o do registro guardado (não dá para "mudar" o aluno)
      const cur = input.id ? tx.need('support', input.id, 'Registro') : null;
      if (cur && cur.authorId !== ctx.user.id) fail('not_found', 'Registro não encontrado.');
      const s = tx.need('students', cur ? cur.studentId : input.studentId, 'Aluno');
      ctx.needStudent(s);
      // na edição, campo ausente mantém o valor guardado (contrato §2)
      const has = (k) => !cur || input[k] !== undefined;
      const areaIn = has('area') ? input.area || ctx.user.area : cur.area;
      if (!areaIn) fail('invalid', 'Escolha a área do atendimento.', 'area');
      const area = V.oneOf(areaIn, 'Área', AREAS);
      const data = {
        area,
        date: has('date') ? V.date(input.date || env.today, 'Data', { required: true }) : cur.date,
        type: has('type') ? V.oneOf(input.type || 'atendimento', 'Tipo', TYPES) : cur.type,
        confidentiality: has('confidentiality') ? V.oneOf(input.confidentiality || (area === 'psicologia' ? 'autor' : 'area'), 'Quem pode ler', ['autor', 'area', 'apoio']) : cur.confidentiality,
        content: has('content') ? V.text(input.content, 'Registro', { required: true, max: 10000 }) : cur.content,
        nextSteps: has('nextSteps') ? V.text(input.nextSteps, 'Próximos passos', { max: 3000 }) : cur.nextSteps || '',
      };
      if (data.date > env.today) fail('invalid', 'A data do atendimento não pode estar no futuro.', 'date');
      if (cur) {
        // depois de 24 h, o texto original fica guardado: correção só por adendo
        if (Date.parse(env.now) - Date.parse(cur.createdAt) > 24 * 3600 * 1000 && (data.content !== cur.content || data.nextSteps !== (cur.nextSteps || ''))) fail('conflict', 'Registros com mais de 24 horas não são reescritos. Acrescente um adendo.');
        tx.put('support', { ...cur, ...data, studentId: cur.studentId, updatedAt: env.now });
        tx.summary = 'Registro de atendimento atualizado';
        tx.audit = { entity: 'support', ids: [cur.id], confidential: true };
        return { id: cur.id };
      }
      const id = env.newId('r');
      tx.put('support', { id, studentId: s.id, ...data, authorId: ctx.user.id, createdAt: env.now, addenda: [] });
      tx.summary = 'Registro de atendimento criado';
      tx.audit = { entity: 'support', ids: [id], confidential: true };
      return { id };
    },
  });

  E.define('support.addendum', {
    perm: 'atendimentos.registrar',
    run(tx, input, ctx, env) {
      const cur = tx.need('support', input.id, 'Registro');
      if (cur.authorId !== ctx.user.id) fail('not_found', 'Registro não encontrado.');
      ctx.needStudent(tx.get('students', cur.studentId));
      const text = V.text(input.text, 'Adendo', { required: true, max: 3000 });
      tx.put('support', { ...cur, addenda: (cur.addenda || []).concat([{ by: ctx.user.id, at: env.now, text }]) });
      tx.summary = 'Adendo incluído em registro de atendimento';
      tx.audit = { entity: 'support', ids: [cur.id], confidential: true };
      return { id: cur.id };
    },
  });

  E.define('plans.save', {
    perm: 'atendimentos.registrar',
    run(tx, input, ctx, env) {
      const cur = input.id ? tx.need('plans', input.id, 'Plano') : null;
      const s = tx.need('students', cur ? cur.studentId : input.studentId, 'Aluno');
      ctx.needStudent(s);
      if (cur && cur.authorId !== ctx.user.id && !ctx.can('atendimentos.conteudo')) fail('not_found', 'Plano não encontrado.');
      // na edição, campo ausente mantém o valor guardado (contrato §2); sharedWith parcial completa com o atual
      const has = (k) => !cur || input[k] !== undefined;
      const sw = { ...((cur && cur.sharedWith) || {}), ...(input.sharedWith && typeof input.sharedWith === 'object' ? input.sharedWith : {}) };
      const data = {
        title: has('title') ? V.str(input.title, 'Título', { required: true, max: 140 }) : cur.title,
        start: V.date(input.start || (cur && cur.start) || env.today, 'Início', { required: true }),
        goals: has('goals') ? V.text(input.goals, 'Metas', { max: 5000 }) : cur.goals || '',
        adaptations: has('adaptations') ? V.text(input.adaptations, 'Adaptações e orientações para os professores', { max: 5000 }) : cur.adaptations || '',
        sharedWith: { professores: V.bool(sw.professores), coordenacao: V.bool(sw.coordenacao), familia: V.bool(sw.familia) },
      };
      if (cur) {
        // a família dá ciente de novo se o conteúdo mudou ou se o plano passou a ser compartilhado com ela agora
        const newlyShared = data.sharedWith.familia && !(cur.sharedWith && cur.sharedWith.familia);
        const familyChanged = newlyShared || (data.sharedWith.familia && (data.goals !== (cur.goals || '') || data.adaptations !== (cur.adaptations || '') || data.title !== cur.title));
        tx.put('plans', { ...cur, ...data, updatedAt: env.now, familyAckAt: familyChanged ? null : cur.familyAckAt || null });
        tx.summary = `Plano de acompanhamento de ${s.name} atualizado`;
        tx.audit = { entity: 'plans', ids: [cur.id], confidential: true };
        return { id: cur.id };
      }
      const id = env.newId('l');
      tx.put('plans', { id, studentId: s.id, status: 'ativo', ...data, authorId: ctx.user.id, updatedAt: env.now, familyAckAt: null });
      tx.summary = `Plano de acompanhamento criado para ${s.name}`;
      tx.audit = { entity: 'plans', ids: [id], confidential: true };
      return { id };
    },
  });

  E.define('plans.status', {
    perm: 'atendimentos.registrar',
    run(tx, input, ctx, env) {
      const cur = tx.need('plans', input.id, 'Plano');
      ctx.needStudent(tx.get('students', cur.studentId));
      if (cur.authorId !== ctx.user.id && !ctx.can('atendimentos.conteudo')) fail('not_found', 'Plano não encontrado.');
      const status = V.oneOf(input.status, 'Situação', ['ativo', 'encerrado']);
      tx.put('plans', { ...cur, status, updatedAt: env.now });
      tx.summary = `Plano de acompanhamento ${status === 'ativo' ? 'reaberto' : 'encerrado'}`;
      tx.audit = { entity: 'plans', ids: [cur.id], confidential: true };
      return { id: cur.id };
    },
  });

  /** Família dá ciente do plano compartilhado. */
  E.define('plans.ack', {
    family: true,
    run(tx, input, ctx, env) {
      const cur = tx.need('plans', input.id, 'Plano');
      if (!ctx.studentIds.has(cur.studentId) || !(cur.sharedWith && cur.sharedWith.familia)) fail('not_found', 'Plano não encontrado.');
      tx.put('plans', { ...cur, familyAckAt: env.now, familyAckBy: ctx.user.id });
      tx.summary = 'Família deu ciente no plano de acompanhamento';
      tx.audit = { entity: 'plans', ids: [cur.id], confidential: true };
      return { id: cur.id };
    },
  });

  return { AREAS, TYPES };
});
