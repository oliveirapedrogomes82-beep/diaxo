/* Comandos: mensagens família ↔ escola e registro de arquivos enviados. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('../util'), require('../perms'), require('../engine'), require('./shared'));
  else factory(root.Core.util, root.Core.perms, root.Core.engine, root.Core.cmd);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (util, perms, E, X) {
  'use strict';
  const { V, fail } = util;
  const KINDS = ['recado', 'falta', 'saida', 'busca', 'medicacao', 'atestado', 'outro'];
  const LABEL = { recado: 'Recado', falta: 'Aviso de falta', saida: 'Saída antecipada', busca: 'Quem vai buscar', medicacao: 'Pedido de medicação', atestado: 'Atestado', outro: 'Mensagem' };

  /** A pessoa alcança a conversa? Família: filho dela. Equipe: mensagens.responder + aluno no escopo. */
  const reach = (tx, ctx, m) => {
    const s = tx.get('students', m.studentId);
    if (ctx.family) {
      if (!s || !ctx.studentIds.has(s.id)) fail('not_found', 'Mensagem não encontrada.');
    } else {
      if (!ctx.can('mensagens.responder')) fail('forbidden', 'Seu acesso não permite responder mensagens das famílias.');
      ctx.needStudent(s);
    }
    return s;
  };

  E.define('messages.create', {
    family: true,
    perm: 'mensagens.responder',
    run(tx, input, ctx, env) {
      const st = tx.get('settings');
      const s = tx.need('students', input.studentId, 'Aluno');
      if (ctx.family) {
        if (!ctx.studentIds.has(s.id)) fail('not_found', 'Aluno não encontrado.');
        if (st.familyMessages === false) fail('forbidden', 'A escola não está recebendo mensagens pelo portal. Fale com a secretaria.');
      } else ctx.needStudent(s);
      const kind = V.oneOf(input.kind || 'recado', 'Assunto', KINDS);
      const d = input.details && typeof input.details === 'object' ? input.details : {};
      const details = {};
      if (d.date) details.date = V.date(d.date, 'Data');
      if (d.time) details.time = V.time(d.time, 'Horário');
      if (d.person) details.person = V.str(d.person, 'Quem vai buscar', { max: 120 });
      if (d.document) details.document = V.str(d.document, 'Documento', { max: 60 });
      if (d.medicine) details.medicine = V.str(d.medicine, 'Medicamento', { max: 120 });
      if (d.dose) details.dose = V.str(d.dose, 'Dose', { max: 60 });
      if (d.schedule) details.schedule = V.str(d.schedule, 'Horários', { max: 120 });
      if (d.until) details.until = V.date(d.until, 'Até quando');
      if (kind === 'busca' && !details.person) fail('invalid', 'Informe quem vai buscar.');
      if (kind === 'medicacao' && (!details.medicine || !details.dose)) fail('invalid', 'Informe o medicamento e a dose.');
      const body = V.text(input.body, 'Mensagem', { required: true, max: 3000 });
      const id = env.newId('m');
      const attachments = X.attachFiles(tx, ctx, input.attachments, { coll: 'messages', id }, { max: 3 });
      const subject = V.str(input.subject, 'Assunto', { max: 120 }) || LABEL[kind];
      // from: lado de quem escreveu (uma conta da equipe também pode ser responsável e escrever pelo portal).
      // Conversa aberta pela escola já começa "respondida": fica aguardando a família, não a escola.
      const from = ctx.family ? 'familia' : 'escola';
      tx.put('messages', { id, studentId: s.id, kind, subject, details, attachments, status: ctx.family ? 'aberta' : 'respondida', createdBy: ctx.user.id, createdAt: env.now, posts: [{ id: env.newId('p'), kind: 'texto', from, userId: ctx.user.id, body, at: env.now, attachments }] });
      tx.effect({ type: 'notify', coll: 'messages', ids: [id] });
      tx.summary = `${LABEL[kind]} sobre ${s.name} ${ctx.family ? 'enviado pela família' : 'enviado à família'}`;
      tx.audit = { entity: 'messages', ids: [id] };
      return { id };
    },
  });

  E.define('messages.reply', {
    family: true,
    perm: 'mensagens.responder',
    run(tx, input, ctx, env) {
      const m = tx.need('messages', input.id, 'Mensagem');
      const s = reach(tx, ctx, m);
      if (ctx.family && tx.get('settings').familyMessages === false) fail('forbidden', 'A escola não está recebendo mensagens pelo portal. Fale com a secretaria.');
      const body = V.text(input.body, 'Resposta', { required: true, max: 3000 });
      const kind = !ctx.family && input.kind === 'registro' ? 'registro' : 'texto';
      const postId = env.newId('p');
      const attachments = X.attachFiles(tx, ctx, input.attachments, { coll: 'messages', id: m.id }, { max: 3 });
      const posts = (m.posts || []).concat([{ id: postId, kind, from: ctx.family ? 'familia' : 'escola', userId: ctx.user.id, body, at: env.now, attachments }]).slice(-200);
      // família escreveu: volta a pedir atenção da escola; escola respondeu: fica "respondida" (se não estava resolvida)
      const status = ctx.family ? 'aberta' : m.status === 'resolvida' ? 'resolvida' : 'respondida';
      tx.put('messages', { ...m, posts, status, attachments: [...new Set([...(m.attachments || []), ...attachments])] });
      tx.effect({ type: 'notify', coll: 'messages', ids: [m.id] });
      tx.summary = `${kind === 'registro' ? 'Registro' : 'Resposta'} na mensagem "${m.subject}" (${s.name})`;
      tx.audit = { entity: 'messages', ids: [m.id] };
      return { id: m.id, postId };
    },
  });

  E.define('messages.status', {
    family: true,
    perm: 'mensagens.responder',
    run(tx, input, ctx) {
      const m = tx.need('messages', input.id, 'Mensagem');
      reach(tx, ctx, m);
      const status = V.oneOf(input.status, 'Situação', ctx.family ? ['resolvida'] : ['aberta', 'respondida', 'resolvida']);
      tx.put('messages', { ...m, status });
      tx.summary = `Mensagem "${m.subject}" marcada como ${status}`;
      tx.audit = { entity: 'messages', ids: [m.id] };
      return { id: m.id };
    },
  });

  // ---------- arquivos ----------
  const TYPES = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'application/pdf': 'pdf' };
  /** Registra um arquivo enviado (chamado pela rota de upload, que já conferiu o conteúdo). */
  E.define('files.register', {
    family: true,
    staff: true,
    run(tx, input, ctx, env) {
      const type = V.oneOf(input.type, 'Tipo de arquivo', Object.keys(TYPES));
      const size = V.int(input.size, 'Tamanho', { required: true, min: 1, max: 10 * 1024 * 1024 });
      const name = (V.str(input.name, 'Nome do arquivo', { max: 120 }) || `arquivo.${TYPES[type]}`).replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_');
      const id = input.id && util.isId(input.id) && input.id.startsWith('x') ? input.id : env.newId('x');
      if (tx.get('files', id)) fail('conflict', 'Arquivo já registrado.');
      tx.put('files', { id, name, type, size, ownerId: ctx.user.id, at: env.now, refs: [] });
      tx.summary = `Arquivo enviado: ${name}`;
      tx.audit = { entity: 'files', ids: [id] };
      return { id };
    },
  });

  /** Apaga arquivos sem uso há mais de 24 h (agendador). */
  E.define('files.cleanup', {
    system: true,
    run(tx, input, ctx, env) {
      const limit = new Date(Date.parse(env.now) - 24 * 3600 * 1000).toISOString();
      const ids = [];
      for (const f of tx.list('files').slice()) {
        if ((f.refs || []).length || f.at > limit) continue;
        tx.del('files', f.id);
        tx.effect({ type: 'deleteFile', id: f.id });
        ids.push(f.id);
      }
      tx.summary = `${ids.length} arquivo(s) sem uso removido(s)`;
      tx.audit = { entity: 'files', ids };
      return { id: 'cleanup', ids };
    },
  });

  return { KINDS, LABEL, FILE_TYPES: TYPES };
});
