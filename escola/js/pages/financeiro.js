'use strict';
/* Financeiro: mensalidades do mês, recebimentos, inadimplência e cobranças avulsas. */
Pages.financeiro = {
  title: 'Financeiro',
  state() {
    const v = (View.financeiro = View.financeiro || {});
    v.month = v.month || U.today().slice(0, 7);
    v.status = v.status || 'todas';
    v.q = v.q || '';
    v.tab = v.tab || 'mensalidades';
    return v;
  },

  invoiceRow(i, { showStudent = true } = {}) {
    const st = Q.invoiceStatus(i);
    const a = Q.student(i.studentId);
    const [label, tone] = Q.STATUS_LABEL[st];
    const due = Q.amountDue(i);
    const late = st === 'atrasado' ? U.daysBetween(i.due, U.today()) : 0;
    return `<tr>
      ${showStudent ? `<td class="first"><div class="person">${UI.avatar(a?.name || '?', 'sm')}<div><a class="person-name" href="#alunos/${i.studentId}">${U.esc(a ? a.name : 'Aluno removido')}</a><div class="person-sub">${U.esc(Q.klass(a?.classId)?.name || '')}</div></div></div></td>` : ''}
      <td ${showStudent ? 'class="hide-sm"' : 'class="first"'}>${U.esc(i.description)}</td>
      <td class="num" data-l="Vence:">${U.fmtDate(i.due)}${late ? `<div class="person-sub" style="color:var(--bad)">${U.plural(late, 'dia', 'dias')} de atraso</div>` : ''}</td>
      <td class="num" data-l="Valor:"><b>${U.money(st === 'atrasado' ? due : i.amount)}</b>${st === 'atrasado' && due !== i.amount ? `<div class="person-sub">${U.money(i.amount)} + encargos</div>` : ''}</td>
      <td>${UI.pill(label, tone)}${i.paidAt ? `<div class="person-sub">${U.fmtDate(i.paidAt)}${i.method ? ' · ' + U.esc(i.method) : ''}</div>` : ''}</td>
      <td class="end" style="text-align:right;white-space:nowrap">
        ${i.paidAt ? '' : `<button class="btn sm primary" data-pay="${i.id}">${icon('cash')}Receber</button>`}
        <button class="icon-btn sm" data-inv-menu="${i.id}" aria-label="Mais opções da cobrança">${icon('dots')}</button>
      </td>
    </tr>`;
  },

  /** Cliques nas linhas de cobrança (usado aqui e na ficha do aluno). */
  handleInvoiceClick(e) {
    const pay = e.target.closest('[data-pay]');
    if (pay) {
      Actions.receber(pay.dataset.pay);
      return true;
    }
    const mm = e.target.closest('[data-inv-menu]');
    if (mm) {
      const inv = Store.state.invoices.find((x) => x.id === mm.dataset.invMenu);
      if (!inv) return true;
      const a = Q.student(inv.studentId);
      const items = [];
      if (inv.paidAt) items.push({ label: 'Desfazer pagamento', icon: 'undo', fn: () => Actions.estornar(inv.id) });
      else {
        items.push({ label: 'Editar valor e vencimento', icon: 'pencil', fn: () => Actions.editarCobranca(inv.id) });
        if (a?.guardian?.phone) items.push({ label: 'Lembrar pelo WhatsApp', icon: 'message', fn: () => Actions.abrirLink(U.whatsappLink(a.guardian.phone, Actions.textoCobranca(a, [inv])), Actions.textoCobranca(a, [inv])) });
      }
      items.push('-', { label: 'Excluir cobrança', icon: 'trash', danger: true, fn: () => Actions.excluirCobranca(inv.id) });
      UI.menu(mm, items);
      return true;
    }
    return false;
  },

  render() {
    const v = this.state();
    const ms = Q.monthSummary(v.month);
    const debtors = Q.debtors();
    const debtTotal = U.sum(debtors.map((d) => d.total));
    const missing = Q.missingInvoices(v.month);
    const cur = U.today().slice(0, 7);

    const head = `
      <div class="page-head">
        <div><h1>Financeiro</h1><p class="lead">Mensalidades, pagamentos e quem está com pagamento atrasado. Multa de ${U.num(Q.settings().lateFine, 0)}% e juros de ${U.num(Q.settings().lateInterest, 0)}% ao mês são calculados sozinhos.</p></div>
        <div class="btn-row">
          <button class="btn" data-x="charge">${icon('plus')}Cobrança avulsa</button>
          <button class="btn primary" data-x="receive">${icon('cash')}Registrar pagamento</button>
        </div>
      </div>
      <section class="kpis">
        <div class="card kpi"><span class="kpi-label">${icon('wallet')}Previsto em ${U.monthName(v.month)}</span><span class="kpi-value">${U.moneyShort(ms.expected)}</span><span class="kpi-foot">${U.plural(ms.count, 'cobrança', 'cobranças')}</span></div>
        <div class="card kpi"><span class="kpi-label">${icon('checkCircle')}Recebido</span><span class="kpi-value">${U.moneyShort(ms.received)}</span>${UI.meter(ms.pct, ms.pct >= 85 ? 'ok' : '')}<span class="kpi-foot">${U.pct(ms.pct)} do previsto</span></div>
        <div class="card kpi"><span class="kpi-label">${icon('clock')}A receber no mês</span><span class="kpi-value">${U.moneyShort(ms.open)}</span><span class="kpi-foot">${ms.overdueCount ? `${ms.overdueCount} já vencidas` : 'nenhuma vencida'}</span></div>
        <div class="card kpi"><span class="kpi-label">${icon('alert')}Inadimplência total</span><span class="kpi-value" style="${debtTotal ? 'color:var(--bad)' : ''}">${U.moneyShort(debtTotal)}</span><span class="kpi-foot">${U.plural(debtors.length, 'família', 'famílias')} com atraso</span></div>
      </section>
      ${UI.tabs([['mensalidades', 'Mensalidades do mês'], ['inadimplentes', 'Atrasados', debtors.length ? ` <span class="badge bad">${debtors.length}</span>` : ''], ['grafico', 'Histórico']], v.tab)}`;

    if (v.tab === 'inadimplentes') return head + this.debtorsView(debtors);
    if (v.tab === 'grafico')
      return (
        head +
        `<section class="card"><div class="card-head"><h2>Recebido x previsto</h2><div class="legend"><span><span class="swatch" style="--c:var(--primary)"></span>Recebido</span><span><span class="swatch" style="--c:var(--accent-soft)"></span>Previsto</span></div></div>
        <div class="card-body"><div data-chart="hist" data-label="Mensalidades recebidas e previstas por mês"></div></div></section>
        <section class="card"><div class="table-wrap"><table class="table"><thead><tr><th>Mês</th><th class="num">Previsto</th><th class="num">Recebido</th><th class="num">Em aberto</th><th class="num">%</th></tr></thead><tbody>
        ${this.histMonths()
          .reverse()
          .map((m) => {
            const s = Q.monthSummary(m);
            return `<tr><td>${U.esc(U.fmtMonth(m))}</td><td class="num">${U.money(s.expected)}</td><td class="num">${U.money(s.received)}</td><td class="num">${U.money(s.open)}</td><td class="num">${U.pct(s.pct)}</td></tr>`;
          })
          .join('')}</tbody></table></div></section>`
      );

    const list = this.filtered(v);
    return (
      head +
      `
      <div class="toolbar">
        <div class="date-nav">
          <button class="icon-btn" data-month="-1" aria-label="Mês anterior">${icon('chevronLeft')}</button>
          <b style="min-width:150px;text-align:center">${U.esc(U.cap(U.fmtMonth(v.month)))}</b>
          <button class="icon-btn" data-month="1" aria-label="Próximo mês">${icon('chevronRight')}</button>
          ${v.month !== cur ? `<button class="btn sm ghost" data-month="0">Mês atual</button>` : ''}
        </div>
        ${UI.seg([['todas', 'Todas'], ['aberto', 'Em aberto'], ['atrasado', 'Atrasadas'], ['pago', 'Pagas']], v.status, 'data-status')}
        <label class="search-box"><span class="sr-only">Buscar</span>${icon('search')}<input class="input" type="search" id="q-fin" placeholder="Aluno ou responsável" value="${U.esc(v.q)}"></label>
        <button class="btn" data-x="export">${icon('download')}Exportar</button>
      </div>
      ${
        missing.length
          ? `<div class="notice">${icon('info')}<span class="grow">${U.plural(missing.length, 'aluno ativo ainda não tem', 'alunos ativos ainda não têm')} mensalidade de ${U.monthName(v.month)}.</span><button class="btn sm primary" data-x="gen">Gerar ${U.plural(missing.length, 'mensalidade', 'mensalidades')}</button></div>`
          : ''
      }
      <section class="card">
        ${
          list.length
            ? `<div class="table-wrap"><table class="table responsive"><thead><tr><th>Aluno</th><th class="hide-sm">Descrição</th><th class="num">Vencimento</th><th class="num">Valor</th><th>Situação</th><th></th></tr></thead>
          <tbody id="fin-rows">${list.map((i) => this.invoiceRow(i)).join('')}</tbody></table></div>`
            : UI.empty({
                icon: 'wallet',
                title: ms.count ? 'Nenhuma cobrança com esses filtros' : `Nenhuma cobrança em ${U.monthName(v.month)}`,
                text: ms.count ? 'Mude o filtro de situação ou a busca.' : 'Gere as mensalidades do mês para todos os alunos ativos de uma vez.',
                action: ms.count ? '' : `<button class="btn primary" data-x="gen">Gerar mensalidades</button>`,
              })
        }
      </section>`
    );
  },

  histMonths() {
    const cur = U.today().slice(0, 7);
    const first = Store.state.invoices.reduce((m, i) => (i.month < m ? i.month : m), cur);
    const out = [];
    for (let m = U.addMonths(cur, -11) > first ? U.addMonths(cur, -11) : first; m <= cur; m = U.addMonths(m, 1)) out.push(m);
    return out;
  },

  filtered(v) {
    const order = { atrasado: 0, aberto: 1, pago: 2 };
    return Q.monthInvoices(v.month)
      .filter((i) => v.status === 'todas' || Q.invoiceStatus(i) === v.status)
      .filter((i) => {
        const a = Q.student(i.studentId);
        return U.matches(v.q, a?.name, a?.guardian?.name, a?.enrollment, i.description);
      })
      .sort((x, y) => order[Q.invoiceStatus(x)] - order[Q.invoiceStatus(y)] || (Q.student(x.studentId)?.name || '').localeCompare(Q.student(y.studentId)?.name || '', 'pt-BR'));
  },

  debtorsView(debtors) {
    if (!debtors.length) return `<section class="card">${UI.empty({ icon: 'checkCircle', title: 'Nenhuma mensalidade atrasada', text: 'Todas as famílias estão em dia. Ótima notícia!' })}</section>`;
    return `<p class="muted">Ordenado pelo maior valor. O botão do WhatsApp abre uma mensagem pronta e educada para o responsável.</p>
      <section class="card"><div class="table-wrap"><table class="table responsive">
      <thead><tr><th>Aluno</th><th>Responsável</th><th>Meses em atraso</th><th class="num">Total devido</th><th></th></tr></thead>
      <tbody>${debtors
        .map((d) => {
          const a = d.student;
          const g = a.guardian || {};
          return `<tr><td class="first"><div class="person">${UI.avatar(a.name, 'sm')}<div><a class="person-name" href="#alunos/${a.id}">${U.esc(a.name)}</a><div class="person-sub">${U.esc(Q.klass(a.classId)?.name || '')}</div></div></div></td>
            <td data-l=""><div>${U.esc(g.name || '—')}</div><div class="person-sub">${U.esc(g.phone || '')}</div></td>
            <td data-l="">${d.invoices.map((i) => `<span class="pill bad plain" style="margin:2px">${U.esc(U.fmtMonthShort(i.month))}</span>`).join('')}</td>
            <td class="num" data-l="Total:"><b style="color:var(--bad)">${U.money(d.total)}</b></td>
            <td class="end" style="white-space:nowrap;text-align:right">
              ${g.phone ? `<a class="btn sm" href="${U.whatsappLink(g.phone, Actions.textoCobranca(a, d.invoices))}" target="_blank" rel="noopener">${icon('message')}WhatsApp</a>` : ''}
              <button class="btn sm" data-copy-msg="${a.id}" aria-label="Copiar mensagem de cobrança">${icon('copy')}</button>
              <button class="btn sm primary" data-pay="${d.invoices[0].id}">${icon('cash')}Receber</button>
            </td></tr>`;
        })
        .join('')}</tbody></table></div></section>`;
  },

  mount(el) {
    const v = View.financeiro;
    const q = UI.$('#q-fin', el);
    q &&
      q.addEventListener(
        'input',
        U.debounce((e) => {
          v.q = e.target.value;
          const rows = UI.$('#fin-rows', el);
          if (rows) rows.innerHTML = this.filtered(v).map((i) => this.invoiceRow(i)).join('');
          else App.render();
        }, 150),
      );
    el.addEventListener('click', (e) => {
      if (this.handleInvoiceClick(e)) return;
      const tab = e.target.closest('[data-tab]');
      if (tab) {
        v.tab = tab.dataset.tab;
        return App.render();
      }
      const mb = e.target.closest('[data-month]');
      if (mb) {
        const n = Number(mb.dataset.month);
        v.month = n === 0 ? U.today().slice(0, 7) : U.addMonths(v.month, n);
        return App.render();
      }
      const sb = e.target.closest('[data-status]');
      if (sb) {
        v.status = sb.dataset.status;
        return App.render();
      }
      const cm = e.target.closest('[data-copy-msg]');
      if (cm) {
        const d = Q.debtors().find((x) => x.student.id === cm.dataset.copyMsg);
        if (d) UI.copy(Actions.textoCobranca(d.student, d.invoices), 'Mensagem copiada');
        return;
      }
      const x = e.target.closest('[data-x]');
      if (!x) return;
      const k = x.dataset.x;
      if (k === 'gen') Actions.gerarMensalidades(v.month);
      else if (k === 'charge') Actions.novaCobranca({});
      else if (k === 'receive') Actions.receberRapido();
      else if (k === 'export') {
        const rows = this.filtered(v);
        Actions.exportTable(x, `mensalidades-${v.month}`, [
          ['Aluno', 'Turma', 'Responsável', 'Telefone', 'Descrição', 'Vencimento', 'Valor', 'Valor atualizado', 'Situação', 'Pago em', 'Forma'],
          ...rows.map((i) => {
            const a = Q.student(i.studentId);
            return [a?.name, Q.klass(a?.classId)?.name || '', a?.guardian?.name, a?.guardian?.phone, i.description, U.fmtDate(i.due), U.num(i.amount, 2), U.num(Q.amountDue(i), 2), Q.STATUS_LABEL[Q.invoiceStatus(i)][0], i.paidAt ? U.fmtDate(i.paidAt) : '', i.method || ''];
          }),
        ]);
      }
    });
    const hist = el.querySelector('[data-chart="hist"]');
    if (hist) {
      UI.columns(hist, {
        height: 220,
        label: 'last',
        fmt: (n) => (n >= 1000 ? `${U.num(n / 1000, n >= 1e5 || n % 1000 === 0 ? 0 : 1)} mil` : U.int(n)),
        data: this.histMonths().map((m) => {
          const s = Q.monthSummary(m);
          return { label: U.fmtMonthShort(m), value: s.received, track: s.expected, tip: `${U.fmtMonth(m)}: ${U.money(s.received)} de ${U.money(s.expected)} (${U.pct(s.pct)})` };
        }),
      });
    }
  },
};

/* ---------- ações financeiras ---------- */
/* Abre um link externo; se o navegador bloquear, copia o texto para colar manualmente. */
Actions.abrirLink = (url, fallbackText) => {
  let w = null;
  try {
    // sem 'noopener' na chamada: com ele o navegador sempre devolve null e não daria para saber se abriu
    w = window.open(url, '_blank');
    if (w) w.opener = null;
  } catch (e) {
    w = null;
  }
  if (!w && fallbackText) UI.copy(fallbackText, 'Mensagem copiada. Cole no WhatsApp do responsável.');
};

Actions.textoCobranca = (a, invoices) => {
  const s = Q.settings();
  const total = U.sum(invoices.map((i) => Q.amountDue(i)));
  const months = invoices.map((i) => U.monthName(i.month)).join(', ');
  return `Olá, ${U.firstName(a.guardian?.name || '')}! Tudo bem? Aqui é da secretaria da ${s.schoolName}. ` +
    `Identificamos em aberto a mensalidade de ${months} de ${U.firstName(a.name)}, no total atualizado de ${U.money(total)}. ` +
    `Se já pagou, por favor desconsidere e nos envie o comprovante. Qualquer dúvida, estamos à disposição. Obrigado!`;
};

Actions.receber = (invId) => {
  const inv = Store.state.invoices.find((i) => i.id === invId);
  if (!inv) return;
  const a = Q.student(inv.studentId);
  const st = Q.invoiceStatus(inv);
  const due = Q.amountDue(inv);
  const defs = [
    { name: 'amount', label: 'Valor recebido', type: 'money', required: true, min: 0, hint: st === 'atrasado' ? `Valor original ${U.money(inv.amount)}. Já incluímos multa e juros: ${U.money(due - inv.amount)}.` : '' },
    { name: 'paidAt', label: 'Data do pagamento', type: 'date', required: true, check: (v) => (v > U.today() ? 'A data não pode estar no futuro.' : '') },
    { name: 'method', label: 'Forma de pagamento', type: 'chips', full: true, required: true, options: ['Pix', 'Boleto', 'Cartão', 'Dinheiro', 'Transferência'].map((x) => [x, x]) },
  ];
  UI.formDrawer({
    title: 'Registrar pagamento',
    sub: `${U.esc(a?.name || '')} · ${U.esc(inv.description)} · vence ${U.fmtDate(inv.due)}`,
    defs,
    values: { amount: due, paidAt: U.today(), method: 'Pix' },
    submitLabel: 'Confirmar recebimento',
    onSubmit(d) {
      Store.update(
        (s) => {
          const t = s.invoices.find((i) => i.id === invId);
          t.paidAt = d.paidAt;
          t.method = d.method;
          t.paidAmount = d.amount;
        },
        { log: `Pagamento de ${U.shortName(a?.name || '')} recebido (${d.method})`, icon: 'cash', undo: true },
      );
      UI.undoToast(`Pagamento de ${U.money(d.amount)} registrado`);
    },
  });
};

Actions.estornar = async (invId) => {
  const inv = Store.state.invoices.find((i) => i.id === invId);
  const ok = await UI.confirm({ title: 'Desfazer este pagamento?', text: 'A cobrança volta a ficar em aberto.', ok: 'Desfazer pagamento' });
  if (!ok) return;
  Store.update(
    (s) => {
      const t = s.invoices.find((i) => i.id === invId);
      t.paidAt = null;
      t.method = null;
      delete t.paidAmount;
    },
    { log: `Pagamento estornado: ${inv.description}`, icon: 'undo', undo: true },
  );
  UI.undoToast('Pagamento desfeito');
};

Actions.excluirCobranca = async (invId) => {
  const inv = Store.state.invoices.find((i) => i.id === invId);
  const ok = await UI.confirm({ title: 'Excluir cobrança?', text: `${U.esc(inv.description)} de ${U.esc(Q.student(inv.studentId)?.name || '')} será removida.`, ok: 'Excluir', danger: true });
  if (!ok) return;
  Store.update((s) => (s.invoices = s.invoices.filter((i) => i.id !== invId)), { log: `Cobrança excluída: ${inv.description}`, icon: 'trash', undo: true });
  UI.undoToast('Cobrança excluída');
};

Actions.editarCobranca = (invId) => {
  const inv = Store.state.invoices.find((i) => i.id === invId);
  UI.formDrawer({
    title: 'Editar cobrança',
    sub: U.esc(Q.student(inv.studentId)?.name || ''),
    defs: [
      { name: 'description', label: 'Descrição', required: true, full: true },
      { name: 'amount', label: 'Valor', type: 'money', required: true, min: 0 },
      { name: 'due', label: 'Vencimento', type: 'date', required: true },
    ],
    values: inv,
    onSubmit(d) {
      Store.update((s) => Object.assign(s.invoices.find((i) => i.id === invId), d), { log: `Cobrança atualizada: ${d.description}`, icon: 'pencil' });
      UI.toast('Cobrança atualizada');
    },
  });
};

Actions.novaCobranca = ({ studentId = '' } = {}) => {
  const studs = Q.students();
  if (!studs.length) return UI.toast('Matricule um aluno antes de lançar cobranças.', { tone: 'bad' });
  const T = U.today();
  UI.formDrawer({
    title: 'Nova cobrança avulsa',
    sub: 'Para uniforme, material, passeio, taxa de matrícula…',
    defs: [
      { name: 'studentId', label: 'Aluno', type: 'select', required: true, full: true, options: [['', 'Escolha o aluno'], ...studs.map((a) => [a.id, `${a.name} · ${Q.klass(a.classId)?.name || 'sem turma'}`])] },
      { name: 'description', label: 'Descrição', required: true, full: true, placeholder: 'Ex.: Kit de uniforme' },
      { name: 'amount', label: 'Valor', type: 'money', required: true, min: 0.01 },
      { name: 'due', label: 'Vencimento', type: 'date', required: true },
    ],
    values: { studentId, due: U.addDays(T, 7) },
    submitLabel: 'Lançar cobrança',
    onSubmit(d) {
      Store.update((s) => s.invoices.push({ id: 'f' + U.uid(), ...d, month: d.due.slice(0, 7), paidAt: null, method: null }), { log: `Cobrança lançada: ${d.description}`, icon: 'wallet' });
      UI.toast('Cobrança lançada');
    },
  });
};

Actions.gerarMensalidades = async (month = U.today().slice(0, 7)) => {
  const missing = Q.missingInvoices(month);
  const s = Q.settings();
  if (!missing.length) return UI.toast(`Todos os alunos ativos já têm a mensalidade de ${U.monthName(month)}.`);
  const total = U.sum(missing.map((a) => Q.netFee(a)));
  const ok = await UI.confirm({
    title: `Gerar mensalidades de ${U.fmtMonth(month)}?`,
    text: `Serão criadas ${U.plural(missing.length, 'cobrança', 'cobranças')} (${U.money(total)} no total), com vencimento no dia ${s.dueDay}. Alunos com bolsa integral ficam de fora.`,
    ok: 'Gerar mensalidades',
  });
  if (!ok) return;
  let n = 0;
  Store.update(
    (st) => {
      missing.forEach((a) => {
        const amount = Q.netFee(a);
        if (amount <= 0) return;
        n++;
        st.invoices.push({ id: 'f' + U.uid(), studentId: a.id, month, description: `Mensalidade de ${U.monthName(month)}`, amount, due: `${month}-${U.pad(st.settings.dueDay)}`, paidAt: null, method: null });
      });
    },
    { log: `Mensalidades de ${U.monthName(month)} geradas`, icon: 'wallet', undo: true },
  );
  UI.undoToast(`${U.plural(n, 'mensalidade gerada', 'mensalidades geradas')}`);
};

/* Registrar pagamento a partir de qualquer tela: busca o aluno e mostra o que está em aberto. */
Actions.receberRapido = () => {
  const open = Store.state.invoices.filter((i) => !i.paidAt);
  if (!open.length) return UI.toast('Não há cobranças em aberto. Tudo pago!');
  const draw = (q) => {
    const byStudent = new Map();
    open.forEach((i) => {
      const a = Q.student(i.studentId);
      if (!a || !U.matches(q, a.name, a.guardian?.name, a.enrollment)) return;
      if (!byStudent.has(a.id)) byStudent.set(a.id, { a, inv: [] });
      byStudent.get(a.id).inv.push(i);
    });
    const rows = [...byStudent.values()].sort(U.by((x) => x.a.name)).slice(0, 30);
    if (!rows.length) return `<p class="muted">Ninguém encontrado com cobrança em aberto.</p>`;
    return `<ul class="items">${rows
      .map(
        ({ a, inv }) => `<li style="align-items:flex-start">${UI.avatar(a.name, 'sm')}<div class="grow"><div class="strong">${U.esc(a.name)}</div><div class="person-sub">${U.esc(Q.klass(a.classId)?.name || '')}</div>
        <div class="chips" style="margin-top:8px">${inv
          .sort((x, y) => (x.due < y.due ? -1 : 1))
          .map((i) => {
            const st = Q.invoiceStatus(i);
            return `<button class="chip" data-pick="${i.id}" style="${st === 'atrasado' ? 'border-color:var(--bad)' : ''}">${U.esc(i.description.replace('Mensalidade de ', ''))} · ${U.money(Q.amountDue(i))}${st === 'atrasado' ? ' · atrasada' : ''}</button>`;
          })
          .join('')}</div></div></li>`,
      )
      .join('')}</ul>`;
  };
  UI.modal({
    title: 'Registrar pagamento',
    sub: 'Busque o aluno e escolha a cobrança que foi paga.',
    size: 'lg',
    guard: false,
    body: `<label class="search-box" style="display:block;margin-bottom:12px"><span class="sr-only">Buscar aluno</span>${icon('search')}<input class="input" id="rr-q" type="search" placeholder="Nome do aluno ou do responsável" autofocus></label><div id="rr-list">${draw('')}</div>`,
    onMount(el, api) {
      const list = UI.$('#rr-list', el);
      UI.$('#rr-q', el).addEventListener('input', U.debounce((e) => (list.innerHTML = draw(e.target.value)), 120));
      list.addEventListener('click', (e) => {
        const b = e.target.closest('[data-pick]');
        if (!b) return;
        api.close();
        Actions.receber(b.dataset.pick);
      });
    },
  });
};
