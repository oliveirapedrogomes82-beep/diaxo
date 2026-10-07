/* Comandos: mensalidades, cobranças avulsas, pagamentos e estornos (com motivo). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('../util'), require('../rules'), require('../engine'));
  else factory(root.Core.util, root.Core.rules, root.Core.engine);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (util, rules, E) {
  'use strict';
  const { V, fail, round2 } = util;
  const METHODS = ['Pix', 'Boleto', 'Cartão', 'Dinheiro', 'Transferência'];
  const money = (n) => 'R$ ' + Number(n || 0).toFixed(2).replace('.', ',');
  const feesOn = (tx) => {
    if (tx.get('settings').chargesFees === false) fail('forbidden', 'A cobrança de mensalidades está desligada nas configurações.');
  };
  const visibleStudent = (tx, ctx, id) => {
    const s = tx.need('students', id, 'Aluno');
    if (!ctx.all) ctx.needStudent(s);
    return s;
  };

  E.define('invoices.generate', {
    perm: 'financeiro.gerenciar',
    undoable: true,
    run(tx, input, ctx, env) {
      feesOn(tx);
      if (!ctx.all) fail('forbidden', 'Só quem enxerga todas as turmas gera as mensalidades do mês.');
      const month = V.month(input.month, 'Mês');
      const st = tx.get('settings');
      const has = new Set(tx.list('invoices').filter((i) => i.month === month && i.kind !== 'avulsa').map((i) => i.studentId));
      const ids = [];
      for (const s of tx.list('students').slice()) {
        if (s.status !== 'ativo' || has.has(s.id)) continue;
        const amount = rules.netFee(s);
        if (amount <= 0) continue;
        const id = env.newId('i');
        tx.put('invoices', { id, studentId: s.id, month, kind: 'mensalidade', description: `Mensalidade de ${util.monthName(month)}`, amount, due: `${month}-${util.pad(st.dueDay || 10)}`, paidAt: null, method: null, reversals: [] });
        ids.push(id);
      }
      if (!ids.length) fail('conflict', 'Todos os alunos ativos já têm a mensalidade deste mês (ou têm bolsa integral).');
      tx.summary = `${ids.length} mensalidade${ids.length === 1 ? '' : 's'} de ${util.monthName(month)} gerada${ids.length === 1 ? '' : 's'}`;
      tx.audit = { entity: 'invoices', ids };
      return { id: ids[0], ids };
    },
  });

  E.define('invoices.create', {
    perm: 'financeiro.gerenciar',
    run(tx, input, ctx, env) {
      feesOn(tx);
      const s = visibleStudent(tx, ctx, input.studentId);
      const description = V.str(input.description, 'Descrição', { required: true, max: 120 });
      const amount = round2(V.num(input.amount, 'Valor', { required: true, min: 0.01, max: 1000000 }));
      const due = V.date(input.due, 'Vencimento', { required: true });
      const id = env.newId('i');
      tx.put('invoices', { id, studentId: s.id, month: due.slice(0, 7), kind: 'avulsa', description, amount, due, paidAt: null, method: null, reversals: [] });
      tx.summary = `Cobrança lançada para ${s.name}: ${description} (${money(amount)})`;
      tx.audit = { entity: 'invoices', ids: [id] };
      return { id };
    },
  });

  E.define('invoices.update', {
    perm: 'financeiro.gerenciar',
    run(tx, input, ctx) {
      feesOn(tx);
      const cur = tx.need('invoices', input.id, 'Cobrança');
      visibleStudent(tx, ctx, cur.studentId);
      if (cur.paidAt) fail('conflict', 'Esta cobrança já foi paga. Estorne o pagamento antes de editar.');
      const description = V.str(input.description, 'Descrição', { required: true, max: 120 });
      const amount = round2(V.num(input.amount, 'Valor', { required: true, min: 0.01, max: 1000000 }));
      const due = V.date(input.due, 'Vencimento', { required: true });
      // cobrança avulsa pertence ao mês do vencimento; mensalidade mantém o mês de competência
      tx.put('invoices', { ...cur, description, amount, due, month: cur.kind === 'avulsa' ? due.slice(0, 7) : cur.month });
      tx.summary = `Cobrança atualizada: ${description} (${money(amount)})`;
      tx.audit = { entity: 'invoices', ids: [cur.id] };
      return { id: cur.id };
    },
  });

  E.define('invoices.delete', {
    perm: 'financeiro.gerenciar',
    undoable: true,
    run(tx, input, ctx) {
      const cur = tx.need('invoices', input.id, 'Cobrança');
      const s = visibleStudent(tx, ctx, cur.studentId);
      if (cur.paidAt || (cur.reversals || []).length) fail('conflict', 'Cobranças com pagamento ou estorno ficam no histórico e não podem ser excluídas.');
      tx.del('invoices', cur.id);
      tx.summary = `Cobrança excluída: ${cur.description} de ${s.name}`;
      tx.audit = { entity: 'invoices', ids: [cur.id] };
      return { id: cur.id };
    },
  });

  E.define('invoices.pay', {
    perm: 'financeiro.receber',
    undoable: true,
    run(tx, input, ctx, env) {
      feesOn(tx);
      const cur = tx.need('invoices', input.id, 'Cobrança');
      const s = visibleStudent(tx, ctx, cur.studentId);
      if (cur.paidAt) fail('conflict', 'Esta cobrança já está paga.');
      const paidAmount = round2(V.num(input.amount, 'Valor recebido', { required: true, min: 0.01, max: 1000000 }));
      const paidAt = V.date(input.paidAt, 'Data do pagamento', { required: true });
      if (paidAt > env.today) fail('invalid', 'A data do pagamento não pode estar no futuro.', 'paidAt');
      const method = V.oneOf(input.method, 'Forma de pagamento', METHODS);
      tx.put('invoices', { ...cur, paidAt, method, paidAmount, receivedBy: ctx.user.id });
      tx.summary = `Pagamento recebido de ${s.name}: ${cur.description}, ${money(paidAmount)} (${method})`;
      tx.audit = { entity: 'invoices', ids: [cur.id] };
      return { id: cur.id };
    },
  });

  /** Estorno: exige motivo e fica registrado na cobrança. */
  E.define('invoices.reverse', {
    perm: 'financeiro.receber',
    undoable: true,
    run(tx, input, ctx, env) {
      const cur = tx.need('invoices', input.id, 'Cobrança');
      visibleStudent(tx, ctx, cur.studentId);
      if (!cur.paidAt) fail('conflict', 'Esta cobrança não está paga.');
      const reason = V.str(input.reason, 'Motivo do estorno', { required: true, max: 200 });
      const reversals = (cur.reversals || []).concat([{ at: env.now, by: ctx.user.id, reason, amount: cur.paidAmount, paidAt: cur.paidAt, method: cur.method }]);
      const next = { ...cur, paidAt: null, method: null, reversals };
      delete next.paidAmount;
      delete next.receivedBy;
      tx.put('invoices', next);
      tx.summary = `Pagamento estornado: ${cur.description} — ${reason}`;
      tx.audit = { entity: 'invoices', ids: [cur.id] };
      return { id: cur.id };
    },
  });

  return { METHODS };
});
