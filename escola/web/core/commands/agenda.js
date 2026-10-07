/* Comandos: agenda do aluno (deveres, recados, lembretes, autorizações, ocorrências), ciente e rotina da Educação Infantil. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('../util'), require('../perms'), require('../rules'), require('../engine'), require('./shared'));
  else factory(root.Core.util, root.Core.perms, root.Core.rules, root.Core.engine, root.Core.cmd);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (util, perms, rules, E, X) {
  'use strict';
  const { V, fail } = util;
  const TYPES = ['dever', 'recado', 'lembrete', 'autorizacao', 'ocorrencia'];
  const CATEGORIES = ['comportamento', 'atraso', 'uniforme', 'material', 'tarefa', 'elogio'];
  const LABEL = { dever: 'Dever de casa', recado: 'Recado', lembrete: 'Lembrete', autorizacao: 'Autorização', ocorrencia: 'Ocorrência' };

  const activeRoster = (tx, classId) => tx.list('students').filter((s) => s.classId === classId && s.status === 'ativo').map((s) => s.id);
  const hasAnswers = (tx, itemId) => {
    const a = tx.get('acks', itemId);
    return !!a && Object.values(a).some((byG) => Object.keys(byG || {}).length);
  };
  /** Quem pode editar/cancelar: o autor, ou quem aprova, ou escopo "todas" com diario.publicar. */
  const canManage = (ctx, item) => item.authorId === ctx.user.id || ctx.can('diario.aprovar') || (ctx.all && ctx.can('diario.publicar'));
  /**
   * Anexos na edição: além das regras gerais (X.attachFiles), aceita um arquivo que já está num item do mesmo envio
   * (mesmo groupId) — o envio para várias turmas ou alunos é editado item a item e compartilha os anexos.
   */
  const attachGroupFiles = (tx, ctx, ids, cur) => {
    const list = V.ids(ids, 'Anexos', { max: 5 });
    const rest = [];
    for (const id of list) {
      const f = tx.get('files', id);
      const refs = (f && f.refs) || [];
      const mine = refs.some((r) => r.coll === 'diary' && r.id === cur.id);
      const sibling = !mine && refs.length > 0 && refs.every((r) => r.coll === 'diary' && (tx.get('diary', r.id) || {}).groupId === cur.groupId);
      if (f && sibling) tx.put('files', { ...f, refs: refs.concat([{ coll: 'diary', id: cur.id }]) });
      else rest.push(id);
    }
    const kept = X.attachFiles(tx, ctx, rest, { coll: 'diary', id: cur.id });
    return list.filter((id) => kept.includes(id) || !rest.includes(id));
  };

  /**
   * diary.save {id?, type, classIds[] (ou classId), studentIds[] (alunos escolhidos), category, subjectId, title, body,
   *             date, due, respondBy, requireAck, internal, attachments[], publishAt, draft}
   * Novo: um item por turma; com alunos escolhidos, um item por aluno (mesmo groupId). Devolve {ids}.
   */
  E.define('diary.save', {
    // monitor/inspetor registra ocorrências sem mandar deveres e recados: basta diario.ocorrencias para o tipo "ocorrencia"
    anyPerm: ['diario.publicar', 'diario.ocorrencias'],
    run(tx, input, ctx, env) {
      const st = tx.get('settings');
      // na edição o tipo é o do item guardado (não muda: evita, por ex., tirar uma ocorrência interna do sigilo trocando o tipo)
      const existing = input.id ? tx.need('diary', input.id, 'Item da agenda') : null;
      const type = existing ? existing.type : V.oneOf(input.type, 'Tipo', TYPES);
      if (type === 'ocorrencia') ctx.need('diario.ocorrencias');
      else ctx.need('diario.publicar');
      if (type === 'autorizacao') ctx.need('diario.autorizacoes');
      const title = V.str(input.title, 'Título', { required: true, max: 140 });
      const body = V.text(input.body, 'Texto', { required: type !== 'lembrete', max: 5000 });
      const date = V.date(input.date || env.today, 'Data', { required: true });
      const due = V.date(input.due, type === 'dever' ? 'Entrega' : 'Data do lembrete');
      const respondBy = type === 'autorizacao' ? V.date(input.respondBy, 'Responder até', { required: true }) : null;
      if (respondBy && !existing && respondBy < env.today) fail('invalid', 'O prazo para responder já passou. Escolha uma data a partir de hoje.', 'respondBy');
      const category = type === 'ocorrencia' ? V.oneOf(input.category || 'comportamento', 'Categoria', CATEGORIES) : null;
      const internal = type === 'ocorrencia' ? V.bool(input.internal) : false;
      const requireAck = type === 'autorizacao' || (type === 'ocorrencia' && !internal) ? true : V.bool(input.requireAck);
      let publishAt = null;
      if (input.publishAt) {
        if (typeof input.publishAt !== 'string' || isNaN(Date.parse(input.publishAt)) || !input.publishAt.endsWith('Z')) fail('invalid', 'Horário de envio inválido.');
        publishAt = new Date(input.publishAt).toISOString();
        if (publishAt <= env.now) publishAt = null;
      }
      const draft = V.bool(input.draft);
      const needsApproval = st.diaryApproval && !ctx.can('diario.aprovar') && !internal;
      const status = draft ? 'rascunho' : needsApproval ? 'pendente' : publishAt ? 'agendado' : 'publicado';

      // ----- edição -----
      if (existing) {
        const cur = existing;
        ctx.needClass(cur.classId, 'Item da agenda');
        if (!canManage(ctx, cur)) fail('forbidden', 'Só quem publicou (ou a coordenação) pode editar este item.');
        if (cur.status === 'cancelado') fail('conflict', 'Este item foi cancelado.');
        const answered = hasAnswers(tx, cur.id);
        if (cur.type === 'autorizacao' && answered) fail('conflict', 'Esta autorização já tem respostas. Cancele e envie uma nova.');
        const subjectId = input.subjectId && input.subjectId in (tx.get('classes', cur.classId) || {}).subjects ? input.subjectId : cur.subjectId;
        const attachments = attachGroupFiles(tx, ctx, input.attachments ?? cur.attachments, cur);
        X.releaseFiles(tx, cur.attachments, attachments, { coll: 'diary', id: cur.id });
        if (input.baseUpdatedAt && cur.updatedAt !== input.baseUpdatedAt) {
          const who = tx.get('users', cur.authorId);
          fail('conflict', `${who ? who.name : 'Outra pessoa'} alterou este item enquanto você editava. Abra de novo para ver a versão atual.`);
        }
        const next = { ...cur, title, body, date, due, respondBy, category, internal, requireAck, subjectId, attachments, updatedAt: env.now };
        if (cur.status === 'rascunho' || cur.status === 'pendente' || cur.status === 'agendado') {
          next.status = status;
          next.publishAt = publishAt;
          // quem aprova e edita um item pendente já o aprova ao enviar
          if (cur.status === 'pendente' && (status === 'publicado' || status === 'agendado')) next.approvedBy = ctx.user.id;
          // devolvido pela coordenação e reenviado: o motivo da devolução deixa de valer
          if (status !== 'rascunho') {
            delete next.returnedBy;
            delete next.returnedAt;
            delete next.cancelReason;
          }
        }
        if (answered || cur.status === 'publicado') next.editedAt = env.now;
        tx.put('diary', next);
        if (next.status === 'publicado' && cur.status !== 'publicado') tx.effect({ type: 'notify', coll: 'diary', ids: [cur.id] });
        tx.summary = `${LABEL[type]} "${title}" editado(a)`;
        tx.audit = { entity: 'diary', ids: [cur.id] };
        return { id: cur.id, ids: [cur.id] };
      }

      // ----- novo -----
      const classIds = V.ids(input.classIds || (input.classId ? [input.classId] : []), 'Turmas', { max: 60 });
      if (!classIds.length) fail('invalid', 'Escolha pelo menos uma turma.');
      const studentIds = V.ids(input.studentIds, 'Alunos', { max: 60 });
      if (type === 'ocorrencia' && studentIds.length !== 1) fail('invalid', 'A ocorrência é sempre de um aluno só. Para vários alunos, registre uma para cada um.');
      if (studentIds.length && classIds.length > 1) fail('invalid', 'Para alunos escolhidos, envie para uma turma por vez.');
      const groupId = env.newId('d');
      const ids = [];
      for (const classId of classIds) {
        const c = tx.need('classes', classId, 'Turma');
        ctx.needClass(c.id);
        if (c.status === 'encerrada') fail('invalid', `A turma ${c.name} está encerrada.`);
        const subjectId = input.subjectId && input.subjectId in c.subjects ? input.subjectId : null;
        const roster = activeRoster(tx, c.id);
        const targets = studentIds.length ? studentIds : [null];
        for (const sid of targets) {
          if (sid && !roster.includes(sid)) fail('not_found', 'Aluno não encontrado nesta turma.');
          const id = ids.length === 0 ? groupId : env.newId('d');
          const attachments = ids.length === 0 ? X.attachFiles(tx, ctx, input.attachments, { coll: 'diary', id }) : [];
          tx.put('diary', {
            id, groupId, type, category, classId: c.id, studentId: sid, recipients: sid ? [sid] : roster, subjectId, title, body, date, due, respondBy,
            requireAck, internal, attachments, status, publishAt, authorId: ctx.user.id, createdAt: env.now, updatedAt: env.now,
          });
          ids.push(id);
        }
      }
      // anexos ficam no primeiro item; os outros do mesmo envio apontam para os mesmos arquivos
      if (ids.length > 1) {
        const first = tx.get('diary', ids[0]);
        for (const id of ids.slice(1)) {
          const it = tx.get('diary', id);
          tx.put('diary', { ...it, attachments: first.attachments });
        }
        for (const fid of first.attachments) {
          const f = tx.get('files', fid);
          tx.put('files', { ...f, refs: ids.map((id) => ({ coll: 'diary', id })) });
        }
      }
      if (status === 'publicado') tx.effect({ type: 'notify', coll: 'diary', ids });
      const where = classIds.length > 1 ? `${classIds.length} turmas` : tx.get('classes', classIds[0]).name;
      tx.summary = `${LABEL[type]} "${title}" ${status === 'publicado' ? 'enviado(a)' : status === 'agendado' ? 'agendado(a)' : status === 'pendente' ? 'enviado(a) para aprovação' : 'salvo(a) como rascunho'} — ${where}${studentIds.length ? ` (${studentIds.length} aluno${studentIds.length === 1 ? '' : 's'})` : ''}`;
      tx.audit = { entity: 'diary', ids };
      return { id: ids[0], ids };
    },
  });

  /** diary.cancel {id, reason, group?} — cancela (não apaga); com group, todo o envio. */
  E.define('diary.cancel', {
    anyPerm: ['diario.publicar', 'diario.ocorrencias'],
    undoable: true,
    run(tx, input, ctx, env) {
      const cur = tx.need('diary', input.id, 'Item da agenda');
      ctx.needClass(cur.classId, 'Item da agenda');
      ctx.need(cur.type === 'ocorrencia' ? 'diario.ocorrencias' : 'diario.publicar');
      if (!canManage(ctx, cur)) fail('forbidden', 'Só quem publicou (ou a coordenação) pode cancelar este item.');
      const reason = V.str(input.reason, 'Motivo do cancelamento', { max: 200 });
      if (cur.status === 'cancelado' && !V.bool(input.group)) fail('conflict', 'Este item já foi cancelado.');
      const items = V.bool(input.group) ? tx.list('diary').filter((d) => d.groupId === cur.groupId && d.status !== 'cancelado') : [cur];
      const ids = [];
      let returned = 0;
      for (const it of items.slice()) {
        if (!perms.reachesClass(ctx, it.classId) || !canManage(ctx, it)) continue;
        // nunca publicado (rascunho, aguardando aprovação, agendado): não pode chegar à família como "cancelado".
        // Quem escreveu: apaga (dá para desfazer). Outra pessoa (coordenação): devolve como rascunho do autor, com o motivo.
        const neverPublished = (it.status === 'rascunho' || it.status === 'pendente' || it.status === 'agendado') && !hasAnswers(tx, it.id);
        if (neverPublished && it.authorId !== ctx.user.id) {
          tx.put('diary', { ...it, status: 'rascunho', publishAt: null, cancelReason: reason, returnedBy: ctx.user.id, returnedAt: env.now, updatedAt: env.now });
          returned++;
        } else if (neverPublished) {
          tx.del('diary', it.id);
          X.releaseFiles(tx, it.attachments, [], { coll: 'diary', id: it.id });
        } else tx.put('diary', { ...it, status: 'cancelado', canceledAt: env.now, cancelReason: reason, updatedAt: env.now });
        ids.push(it.id);
      }
      if (!ids.length) fail('conflict', 'Nada para cancelar: este envio já foi cancelado.');
      tx.summary = returned
        ? `${LABEL[cur.type]} "${cur.title}" devolvido(a) para ajustes${reason ? `: ${reason}` : ''}`
        : `${LABEL[cur.type]} "${cur.title}" cancelado(a)${ids.length > 1 ? ` em ${ids.length} turmas` : ''}${reason ? `: ${reason}` : ''}`;
      tx.audit = { entity: 'diary', ids };
      return { id: cur.id, ids };
    },
  });

  E.define('diary.approve', {
    perm: 'diario.aprovar',
    run(tx, input, ctx, env) {
      const cur = tx.need('diary', input.id, 'Item da agenda');
      ctx.needClass(cur.classId, 'Item da agenda');
      if (cur.status !== 'pendente') fail('conflict', 'Este item não está aguardando aprovação.');
      const status = cur.publishAt && cur.publishAt > env.now ? 'agendado' : 'publicado';
      tx.put('diary', { ...cur, status, approvedBy: ctx.user.id, updatedAt: env.now });
      if (status === 'publicado') tx.effect({ type: 'notify', coll: 'diary', ids: [cur.id] });
      tx.summary = `${LABEL[cur.type]} "${cur.title}" aprovado(a)`;
      tx.audit = { entity: 'diary', ids: [cur.id] };
      return { id: cur.id };
    },
  });

  /** Publica itens agendados que chegaram na hora (agendador do servidor/LocalBackend). */
  E.define('diary.release', {
    system: true,
    run(tx, input, ctx, env) {
      const ids = [];
      for (const d of tx.list('diary').slice()) {
        if (d.status !== 'agendado' || !d.publishAt || d.publishAt > env.now) continue;
        tx.put('diary', { ...d, status: 'publicado', updatedAt: env.now });
        ids.push(d.id);
      }
      if (ids.length) tx.effect({ type: 'notify', coll: 'diary', ids });
      tx.summary = `${ids.length} item(ns) agendado(s) publicado(s)`;
      tx.audit = { entity: 'diary', ids };
      return { id: 'release', ids };
    },
  });

  /**
   * diary.ack {itemId, studentId, guardianId?, answer?, note?}
   * Família: dá ciente ou responde pelo próprio vínculo. Escola: registra ciente recebido em papel
   * (origin "escola"), sem nunca sobrescrever uma resposta da família.
   */
  E.define('diary.ack', {
    family: true,
    perm: 'diario.publicar',
    run(tx, input, ctx, env) {
      const item = tx.need('diary', input.itemId, 'Item da agenda');
      const s = tx.need('students', input.studentId, 'Aluno');
      if (!(item.recipients || []).includes(s.id) || item.status !== 'publicado') fail('not_found', 'Item da agenda não encontrado.');
      let guardian;
      let origin;
      if (ctx.family) {
        if (!ctx.studentIds.has(s.id)) fail('not_found', 'Item da agenda não encontrado.');
        guardian = (s.guardians || []).find((g) => g.userId === ctx.user.id && !g.bloqueado);
        if (!guardian) fail('not_found', 'Item da agenda não encontrado.');
        origin = 'portal';
      } else {
        ctx.needClass(item.classId, 'Item da agenda');
        guardian = (s.guardians || []).find((g) => g.id === input.guardianId) || (s.guardians || [])[0];
        if (!guardian) fail('invalid', 'O aluno não tem responsável cadastrado.');
        origin = 'escola';
      }
      if (item.respondBy && env.today > item.respondBy && item.type === 'autorizacao') fail('conflict', 'O prazo para responder esta autorização já passou. Fale com a escola.');
      const answer = item.type === 'autorizacao' ? V.oneOf(input.answer, 'Resposta', ['sim', 'nao']) : undefined;
      const note = V.str(input.note, 'Observação', { max: 500 });
      const byItem = tx.get('acks', item.id) || {};
      const bySt = { ...(byItem[s.id] || {}) };
      const prev = bySt[guardian.id];
      if (prev && prev.origin === 'portal' && origin === 'escola') fail('conflict', 'A família já respondeu pelo portal. A resposta dela não pode ser substituída.');
      const history = prev ? (prev.history || []).concat([{ answer: prev.answer, at: prev.at, by: prev.by, origin: prev.origin }]).slice(-10) : undefined;
      bySt[guardian.id] = { answer, note: note || undefined, origin, by: ctx.user.id, at: env.now, history };
      tx.set('acks', item.id, { ...byItem, [s.id]: bySt });
      // qualquer "não" prevalece: avisa a coordenação
      if (answer === 'nao') tx.effect({ type: 'alert', reason: 'autorizacao_negada', itemId: item.id, studentId: s.id });
      tx.summary = `${answer ? `Resposta "${answer === 'sim' ? 'autorizo' : 'não autorizo'}"` : 'Ciente'} em "${item.title}" — ${s.name}${origin === 'escola' ? ' (registrado pela escola)' : ''}`;
      tx.audit = { entity: 'diary', ids: [item.id] };
      return { id: item.id };
    },
  });

  // ---------- rotina da Educação Infantil ----------
  /** routines.save {classId, date, entries: {studentId: {fields, bring, note}}} — salvamento parcial ao longo do dia. */
  E.define('routines.save', {
    perm: 'diario.publicar',
    run(tx, input, ctx, env) {
      const st = tx.get('settings');
      const c = tx.need('classes', input.classId, 'Turma');
      ctx.needClass(c.id);
      const date = V.date(input.date, 'Data', { required: true });
      if (date > env.today) fail('invalid', 'A rotina é registrada no próprio dia.');
      const fields = st.routineFields || [];
      const entries = input.entries && typeof input.entries === 'object' ? input.entries : {};
      const roster = new Set(activeRoster(tx, c.id));
      let n = 0;
      for (const sid of Object.keys(entries).slice(0, 80)) {
        if (!util.isId(sid) || !roster.has(sid)) continue;
        const e = entries[sid] || {};
        const key = util.key.make(c.id, date, sid);
        const prev = tx.get('routines', key) || { fields: {}, bring: [], note: '', sentAt: null };
        const nextFields = { ...prev.fields };
        for (const f of fields) {
          if (!e.fields || !Object.prototype.hasOwnProperty.call(e.fields, f.key)) continue;
          const v = e.fields[f.key];
          nextFields[f.key] = v === '' || v == null ? '' : V.oneOf(v, f.label, f.options);
        }
        const bring = e.bring === undefined ? prev.bring : V.strs(e.bring, 'Mandar amanhã', { max: 12, maxLen: 40 });
        const note = e.note === undefined ? prev.note : V.str(e.note, 'Observação', { max: 500 });
        tx.set('routines', key, { fields: nextFields, bring, note, by: ctx.user.id, at: env.now, sentAt: prev.sentAt || null });
        n++;
      }
      tx.summary = `Rotina do ${c.name} (${date.split('-').reverse().join('/')}) atualizada: ${n} criança${n === 1 ? '' : 's'}`;
      tx.audit = { entity: 'routines', ids: [c.id] };
      return { id: c.id, updated: n };
    },
  });

  /** routines.send {classId, date, studentIds?} — envia a agenda do dia para as famílias. */
  E.define('routines.send', {
    perm: 'diario.publicar',
    run(tx, input, ctx, env) {
      const c = tx.need('classes', input.classId, 'Turma');
      ctx.needClass(c.id);
      const date = V.date(input.date, 'Data', { required: true });
      const only = input.studentIds ? new Set(V.ids(input.studentIds, 'Alunos', { max: 80 })) : null;
      let n = 0;
      for (const k of tx.keys('routines')) {
        if (!k.startsWith(`${c.id}|${date}|`)) continue;
        const sid = k.split('|')[2];
        if (only && !only.has(sid)) continue;
        const r = tx.get('routines', k);
        tx.set('routines', k, { ...r, sentAt: env.now });
        n++;
      }
      if (!n) fail('invalid', 'Preencha a rotina de pelo menos uma criança antes de enviar.');
      tx.effect({ type: 'notify', coll: 'routines', classId: c.id, date });
      tx.summary = `Rotina do dia enviada às famílias do ${c.name} (${n} criança${n === 1 ? '' : 's'})`;
      tx.audit = { entity: 'routines', ids: [c.id] };
      return { id: c.id, sent: n };
    },
  });

  return { TYPES, CATEGORIES, LABEL };
});
