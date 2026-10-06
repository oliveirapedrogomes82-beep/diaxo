/* Comandos: calendário escolar (eventos) e comunicados, com público dentro do escopo de quem publica. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('../util'), require('../perms'), require('../engine'), require('./shared'));
  else factory(root.Core.util, root.Core.perms, root.Core.engine, root.Core.cmd);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (util, perms, E, X) {
  'use strict';
  const { V, fail } = util;
  const EVENT_TYPES = ['prova', 'reuniao', 'evento', 'prazo', 'feriado'];
  /** Quem não enxerga todas as turmas só mexe no que publicou. */
  const ownOrAll = (ctx, doc) => {
    if (!ctx.all && doc.authorId !== ctx.user.id) fail('forbidden', 'Você só pode alterar o que você publicou.');
  };

  E.define('events.save', {
    perm: 'calendario.editar',
    run(tx, input, ctx, env) {
      const data = {
        title: V.str(input.title, 'Título', { required: true, max: 120 }),
        type: V.oneOf(input.type, 'Tipo', EVENT_TYPES),
        date: V.date(input.date, 'Data', { required: true }),
        time: V.time(input.time, 'Horário'),
        audience: X.audienceFrom(tx, ctx, input.audience),
        notes: V.text(input.notes, 'Detalhes', { max: 2000 }),
      };
      if (data.type === 'feriado' && !ctx.all) fail('forbidden', 'Só quem enxerga todas as turmas marca feriados.');
      if (input.id) {
        const cur = tx.need('events', input.id, 'Evento');
        ownOrAll(ctx, cur);
        tx.put('events', { ...cur, ...data });
        tx.summary = `Evento "${data.title}" atualizado`;
        tx.audit = { entity: 'events', ids: [cur.id] };
        return { id: cur.id };
      }
      const id = env.newId('e');
      tx.put('events', { id, ...data, authorId: ctx.user.id });
      tx.summary = `Evento "${data.title}" marcado para ${data.date.split('-').reverse().join('/')}`;
      tx.audit = { entity: 'events', ids: [id] };
      return { id };
    },
  });

  E.define('events.delete', {
    perm: 'calendario.editar',
    undoable: true,
    run(tx, input, ctx) {
      const cur = tx.need('events', input.id, 'Evento');
      ownOrAll(ctx, cur);
      tx.del('events', cur.id);
      tx.summary = `Evento "${cur.title}" excluído`;
      tx.audit = { entity: 'events', ids: [cur.id] };
      return { id: cur.id };
    },
  });

  E.define('notices.save', {
    perm: 'comunicados.publicar',
    run(tx, input, ctx, env) {
      const data = {
        title: V.str(input.title, 'Título', { required: true, max: 140 }),
        body: V.text(input.body, 'Mensagem', { required: true, max: 5000 }),
        audience: X.audienceFrom(tx, ctx, input.audience),
        pinned: V.bool(input.pinned),
      };
      if (input.id) {
        const cur = tx.need('notices', input.id, 'Comunicado');
        ownOrAll(ctx, cur);
        if (input.baseUpdatedAt && cur.updatedAt !== input.baseUpdatedAt) fail('conflict', 'Este comunicado foi alterado enquanto você editava. Abra de novo para ver a versão atual.');
        tx.put('notices', { ...cur, ...data, updatedAt: env.now });
        tx.summary = `Comunicado "${data.title}" atualizado`;
        tx.audit = { entity: 'notices', ids: [cur.id] };
        return { id: cur.id };
      }
      const id = env.newId('n');
      tx.put('notices', { id, ...data, date: env.today, authorId: ctx.user.id, createdAt: env.now, updatedAt: env.now });
      tx.effect({ type: 'notify', coll: 'notices', ids: [id] });
      tx.summary = `Comunicado "${data.title}" publicado`;
      tx.audit = { entity: 'notices', ids: [id] };
      return { id };
    },
  });

  E.define('notices.pin', {
    perm: 'comunicados.publicar',
    run(tx, input, ctx, env) {
      const cur = tx.need('notices', input.id, 'Comunicado');
      ownOrAll(ctx, cur);
      const pinned = V.bool(input.pinned);
      tx.put('notices', { ...cur, pinned, updatedAt: env.now });
      tx.summary = `Comunicado "${cur.title}" ${pinned ? 'fixado' : 'desafixado'}`;
      tx.audit = { entity: 'notices', ids: [cur.id] };
      return { id: cur.id };
    },
  });

  E.define('notices.delete', {
    perm: 'comunicados.publicar',
    undoable: true,
    run(tx, input, ctx) {
      const cur = tx.need('notices', input.id, 'Comunicado');
      ownOrAll(ctx, cur);
      tx.del('notices', cur.id);
      tx.summary = `Comunicado "${cur.title}" excluído`;
      tx.audit = { entity: 'notices', ids: [cur.id] };
      return { id: cur.id };
    },
  });

  return { EVENT_TYPES };
});
