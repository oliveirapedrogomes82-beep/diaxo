/* Comandos — utilidades compartilhadas (anexos, público, pessoas da equipe). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('../util'), require('../perms'));
  else (root.Core = root.Core || {}).cmd = factory(root.Core.util, root.Core.perms);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (util, perms) {
  'use strict';
  const { V, fail } = util;

  /** Pessoa ativa da equipe (para vínculos e atribuições). */
  const staffUser = (tx, id, label) => {
    if (!id) return null;
    const u = tx.get('users', V.id(id, label));
    if (!u || u.role === 'responsavel') fail('invalid', `${label}: pessoa não encontrada na equipe.`);
    if (u.status !== 'ativo') fail('invalid', `${u.name} está com o cadastro inativo.`);
    return u;
  };

  /**
   * Liga arquivos a uma entidade. Só o dono do arquivo pode anexá-lo, e só se ele estiver livre
   * ou já for da mesma entidade (evita usar o id de um anexo confidencial em outro lugar).
   */
  const attachFiles = (tx, ctx, ids, ref, { max = 5 } = {}) => {
    const list = V.ids(ids, 'Anexos', { max });
    const keep = [];
    for (const id of list) {
      const f = tx.get('files', id);
      if (!f) fail('invalid', 'Um dos anexos não foi encontrado. Envie o arquivo de novo.');
      const refs = f.refs || [];
      const same = refs.some((r) => r.coll === ref.coll && r.id === ref.id);
      if (!same) {
        if (f.ownerId !== ctx.user.id) fail('forbidden', 'Só quem enviou o arquivo pode anexá-lo.');
        if (refs.length) fail('conflict', 'Este arquivo já está anexado a outro registro. Envie uma cópia.');
        tx.put('files', { ...f, refs: [{ coll: ref.coll, id: ref.id }] });
      }
      keep.push(id);
    }
    return keep;
  };
  /** Solta anexos que deixaram de ser usados por uma entidade. */
  const releaseFiles = (tx, previous, current, ref) => {
    for (const id of previous || []) {
      if ((current || []).includes(id)) continue;
      const f = tx.get('files', id);
      if (f) tx.put('files', { ...f, refs: (f.refs || []).filter((r) => !(r.coll === ref.coll && r.id === ref.id)) });
    }
  };

  /** Público de eventos e comunicados, dentro do escopo de quem publica. */
  const audienceFrom = (tx, ctx, a) => {
    const raw = a && typeof a === 'object' ? a : { who: 'todos' };
    const who = V.oneOf(raw.who || 'todos', 'Público', ['todos', 'familias', 'equipe']);
    const classIds = V.ids(raw.classIds, 'Turmas', { max: 200 }).filter((id) => tx.get('classes', id));
    const segments = (Array.isArray(raw.segments) ? raw.segments : []).filter((s) => typeof s === 'string' && s.length < 40).slice(0, 10);
    if (!classIds.length && !segments.length && !ctx.all) fail('forbidden', 'Você só pode publicar para as suas turmas.');
    if (!ctx.all) {
      for (const id of classIds) ctx.needClass(id);
      if (segments.length) fail('forbidden', 'Você só pode publicar para as suas turmas.');
    }
    return { who, classIds, segments };
  };

  /** Convite de acesso (código de uso único, 72 h). O servidor guarda só o hash. */
  const inviteEffect = (tx, userId, env, purpose = 'convite') => {
    const code = util.tempPassword().replace('-', '').toUpperCase();
    const pretty = code.slice(0, 5) + '-' + code.slice(5);
    const expiresAt = new Date(Date.parse(env.now) + 72 * 3600 * 1000).toISOString();
    tx.effect({ type: 'invite', userId, code: pretty, expiresAt, purpose });
    return { code: pretty, expiresAt };
  };
  const endSessionsEffect = (tx, userId) => tx.effect({ type: 'endSessions', userId });

  /** Confere unicidade de e-mail e celular entre contas. */
  const uniqueLogin = (tx, { email, phone, exceptId }) => {
    const d = util.digits(phone);
    for (const u of tx.list('users')) {
      if (u.id === exceptId) continue;
      if (email && u.email && u.email.toLowerCase() === email.toLowerCase()) fail('conflict', `O e-mail ${email} já é usado por outra conta.`);
      if (d && u.phone && util.digits(u.phone) === d) fail('conflict', `O celular ${phone} já é usado por outra conta.`);
    }
  };

  return { staffUser, attachFiles, releaseFiles, audienceFrom, inviteEffect, endSessionsEffect, uniqueLogin };
});
