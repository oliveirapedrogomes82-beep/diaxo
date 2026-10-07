'use strict';
/* Financeiro — mensalidades, cobranças avulsas, recebimentos, estornos e inadimplência.
   Equipe ("financeiro.ver"): mês com indicadores (previsto, recebido, a vencer, atrasado), lista filtrável,
   inadimplentes com lembrete pelo WhatsApp para o responsável financeiro, histórico, recibo para imprimir e
   planilha (.csv). "financeiro.receber" dá baixa e estorna (com motivo); "financeiro.gerenciar" gera as
   mensalidades do mês (com "Desfazer"), lança cobranças avulsas, edita e exclui.
   Família (responsável financeiro): mensalidades por filho, valor atualizado, chave Pix e recibos.
   Também: aba "Financeiro" da ficha do aluno, cartão do painel e ações do menu "Novo".
   Comandos: invoices.generate/create/update/delete/pay/reverse (web/core/commands/financeiro.js). */
(() => {
  const can = (p) => Store.can(p);
  const me = () => Store.me;
  const today = () => U.today();
  const S = () => Q.settings();
  const round2 = (n) => Math.round(Number(n) * 100) / 100;
  const METHODS = ['Pix', 'Boleto', 'Cartão', 'Dinheiro', 'Transferência'];
  const STATUS = { pago: ['Pago', 'ok'], aberto: ['A vencer', 'info'], atrasado: ['Atrasado', 'bad'] };
  const ORDER = { atrasado: 0, aberto: 1, pago: 2 };
  const invoice = (id) => Store.byId('invoices', id);
  const staffMode = () => !Store.family && !Store.preview;
  const canReceive = () => staffMode() && can('financeiro.receber');
  const canManage = () => staffMode() && can('financeiro.gerenciar');
  const canGenerate = () => canManage() && me().scope === 'todas';
  const hasPage = (id) => App.pages().some((p) => p.id === id);
  const joinPt = (list) => (list.length > 1 ? `${list.slice(0, -1).join(', ')} e ${list[list.length - 1]}` : list[0] || '');
  const className = (s) => (s && Q.klass(s.classId) ? Q.klass(s.classId).name : 'Sem turma');
  const paidValue = (i) => (i.paidAmount != null ? i.paidAmount : i.amount);
  const monthShort = (m) => U.MONTHS_SHORT[Number(m.slice(5, 7)) - 1];
  const invTitle = (i) => (i.kind === 'mensalidade' ? `Mensalidade de ${U.monthName(i.month)}` : i.description);

  // =====================================================================
  // Cálculos
  // =====================================================================
  const monthInvoices = (m) => Store.state.invoices.filter((i) => i.month === m);
  const summary = (list, T = today()) => {
    const o = { count: list.length, expected: 0, received: 0, open: 0, late: 0, lateDue: 0, nPaid: 0, nOpen: 0, nLate: 0, lateStudents: new Set() };
    for (const i of list) {
      o.expected += i.amount;
      const st = Q.invoiceStatus(i, T);
      if (st === 'pago') {
        o.received += paidValue(i);
        o.nPaid++;
      } else if (st === 'atrasado') {
        o.late += i.amount;
        o.lateDue += Q.amountDue(i, T);
        o.nLate++;
        o.lateStudents.add(i.studentId);
      } else {
        o.open += i.amount;
        o.nOpen++;
      }
    }
    o.pct = o.expected ? (o.received / o.expected) * 100 : 0;
    return o;
  };
  /** Alunos ativos com mensalidade a cobrar e ainda sem a mensalidade do mês. */
  const missingFor = (m) => {
    const has = new Set(Store.state.invoices.filter((i) => i.month === m && i.kind !== 'avulsa').map((i) => i.studentId));
    return Q.students().filter((s) => !has.has(s.id) && Q.netFee(s) > 0);
  };
  /** Multa + juros até a data (mesma regra do núcleo). */
  const charges = (i, date) => {
    const total = Q.amountDue(i, date);
    const days = !i.paidAt && i.due < date ? U.daysBetween(i.due, date) : 0;
    return { days, extra: round2(total - i.amount), total };
  };
  /** Inadimplentes: alunos com cobranças vencidas, do maior valor para o menor. */
  const debtors = () => {
    const T = today();
    const map = new Map();
    for (const i of Store.state.invoices) {
      if (Q.invoiceStatus(i, T) !== 'atrasado') continue;
      let d = map.get(i.studentId);
      if (!d) map.set(i.studentId, (d = { student: Q.student(i.studentId), invoices: [], total: 0, oldest: i.due }));
      d.invoices.push(i);
      d.total += Q.amountDue(i, T);
      if (i.due < d.oldest) d.oldest = i.due;
    }
    return [...map.values()]
      .filter((d) => d.student)
      .map((d) => {
        d.invoices.sort((a, b) => a.due.localeCompare(b.due));
        d.total = round2(d.total);
        return d;
      })
      .sort((a, b) => b.total - a.total || Q.cmpName(a.student, b.student));
  };
  const lateStudentCount = () => {
    const T = today();
    const set = new Set();
    for (const i of Store.state.invoices) if (!i.paidAt && i.due < T) set.add(i.studentId);
    return set.size;
  };

  // ---------- responsável financeiro e mensagem ----------
  const payers = (s) => ((s && s.guardians) || []).filter((g) => g.financeiro);
  const payer = (s) => payers(s).find((g) => !g.bloqueado) || payers(s)[0] || null;
  const reminderText = (s, list) => {
    const g = payer(s);
    const T = today();
    const total = round2(U.sum(list.map((i) => Q.amountDue(i, T))));
    const late = list.some((i) => Q.invoiceStatus(i, T) === 'atrasado');
    const allFees = list.every((i) => i.kind === 'mensalidade');
    const names = list.map((i) => (i.kind === 'mensalidade' ? U.monthName(i.month) : i.description));
    const what = allFees ? `${list.length > 1 ? 'as mensalidades' : 'a mensalidade'} de ${joinPt(names)}` : `${list.length > 1 ? 'as cobranças' : 'a cobrança'} ${joinPt(names.map((n) => `“${n}”`))}`;
    const school = S().schoolName || 'escola';
    const pix = S().pixKey ? ` Se preferir, pague pelo Pix (chave: ${S().pixKey}).` : '';
    return (
      `Olá${g ? `, ${U.firstName(g.name)}` : ''}! Tudo bem? Aqui é da secretaria (${school}). ` +
      (late ? `${list.length > 1 ? 'Constam' : 'Consta'} em aberto ${what} de ${U.firstName(s.name)}, no total atualizado de ${U.money(total)} (com multa e juros até hoje).` : `Lembramos que ${what} de ${U.firstName(s.name)} vence em ${U.fmtDate(list[0].due)}, no valor de ${U.money(total)}.`) +
      `${pix} Se já pagou, por favor desconsidere e nos envie o comprovante. Qualquer dúvida, estamos à disposição. Obrigado!`
    );
  };
  /** Abre um link externo; se o navegador bloquear, copia o texto para colar. */
  const openLink = (url, fallback) => {
    let w = null;
    try {
      w = window.open(url, '_blank');
      if (w) w.opener = null;
    } catch (e) {
      w = null;
    }
    if (!w && fallback) UI.copy(fallback, 'Mensagem copiada. Cole no WhatsApp do responsável.');
  };

  /** Tira a mensagem de erro do campo assim que a pessoa corrige. */
  const liveClear = (form) => {
    const clear = (e) => {
      const w = e.target.closest && e.target.closest('[data-field]');
      if (!w) return;
      w.querySelectorAll('.error').forEach((x) => x.remove());
      w.querySelectorAll('.invalid').forEach((x) => {
        x.classList.remove('invalid');
        x.removeAttribute('aria-invalid');
      });
    };
    form.addEventListener('input', clear);
    form.addEventListener('change', clear);
  };
  /** Abre o programa de e-mail (link mailto: sem abrir aba nova). */
  const openMail = (url) => {
    const a = document.createElement('a');
    a.href = url;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  // ---------- valor por extenso (recibo) ----------
  const UNITS = ['zero', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove', 'dez', 'onze', 'doze', 'treze', 'catorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove'];
  const TENS = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa'];
  const HUNDREDS = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos', 'setecentos', 'oitocentos', 'novecentos'];
  const upTo999 = (n) => {
    if (n === 100) return 'cem';
    const h = Math.floor(n / 100);
    const r = n % 100;
    const parts = [];
    if (h) parts.push(HUNDREDS[h]);
    if (r) parts.push(r < 20 ? UNITS[r] : r % 10 ? `${TENS[Math.floor(r / 10)]} e ${UNITS[r % 10]}` : TENS[r / 10]);
    return parts.join(' e ');
  };
  const intWords = (n) => {
    if (!n) return 'zero';
    const mi = Math.floor(n / 1e6);
    const th = Math.floor((n % 1e6) / 1000);
    const rest = n % 1000;
    const parts = [];
    if (mi) parts.push(mi === 1 ? 'um milhão' : `${upTo999(mi)} milhões`);
    if (th) parts.push(th === 1 ? 'mil' : `${upTo999(th)} mil`);
    if (rest) parts.push(upTo999(rest));
    if (parts.length > 1 && (!rest ? th && th % 100 === 0 : rest < 100 || rest % 100 === 0)) return `${parts.slice(0, -1).join(' ')} e ${parts[parts.length - 1]}`;
    return parts.join(' ');
  };
  const extenso = (v) => {
    const cents = Math.round(Number(v) * 100);
    const reais = Math.floor(cents / 100);
    const c = cents % 100;
    const parts = [];
    if (reais) parts.push(`${intWords(reais)}${reais >= 1e6 && reais % 1e6 === 0 ? ' de' : ''} ${reais === 1 ? 'real' : 'reais'}`);
    if (c) parts.push(`${intWords(c)} ${c === 1 ? 'centavo' : 'centavos'}`);
    return parts.join(' e ') || 'zero real';
  };

  // =====================================================================
  // Peças
  // =====================================================================
  const statusPill = (i) => {
    const [label, tone] = STATUS[Q.invoiceStatus(i)];
    return UI.pill(label, tone);
  };
  const studentCell = (s, i) => html`<div class="person">${UI.avatar(s ? s.name : '?', 'sm', s && s.photo)}<div>${s && hasPage('alunos') ? html`<a class="person-name" href="#alunos/${s.id}/financeiro">${s.name}</a>` : html`<span class="person-name">${s ? s.name : 'Aluno'}</span>`}<div class="person-sub">${className(s)}${i && i.kind === 'avulsa' ? ` · ${i.description}` : ''}</div></div></div>`;

  const row = (i, { student = true } = {}) => {
    const T = today();
    const st = Q.invoiceStatus(i, T);
    const s = Q.student(i.studentId);
    const due = Q.amountDue(i, T);
    const days = st === 'atrasado' ? U.daysBetween(i.due, T) : 0;
    const reversed = (i.reversals || []).length;
    return html`<tr class="fi-row is-${st}">
      <td class="first">${student ? studentCell(s, i) : html`<div class="fi-desc"><b>${invTitle(i)}</b>${i.kind === 'avulsa' ? html`<span class="pill plain">Avulsa</span>` : ''}</div>`}</td>
      ${student ? html`<td class="hide-sm fi-desc-col">${i.kind === 'avulsa' ? html`<span class="pill plain">Avulsa</span>` : U.cap(U.monthName(i.month))}</td>` : ''}
      <td class="num" data-l="Vence">${U.fmtDate(i.due)}${days ? html`<span class="fi-late">${U.plural(days, 'dia', 'dias')} de atraso</span>` : ''}</td>
      <td class="num" data-l="Valor"><b>${U.money(st === 'pago' ? paidValue(i) : due)}</b>${st === 'atrasado' && due !== i.amount ? html`<span class="person-sub">${U.money(i.amount)} + encargos</span>` : st === 'pago' && paidValue(i) !== i.amount ? html`<span class="person-sub">cobrado ${U.money(i.amount)}</span>` : ''}</td>
      <td data-l="Situação">${statusPill(i)}${i.paidAt ? html`<span class="person-sub">${U.fmtDate(i.paidAt)}${i.method ? ` · ${i.method}` : ''}</span>` : reversed ? html`<span class="person-sub" title="${i.reversals[reversed - 1].reason}">estorno em ${U.fmtDate(i.reversals[reversed - 1].at)}</span>` : ''}</td>
      <td class="end fi-acts">${!i.paidAt && canReceive() ? html`<button type="button" class="btn sm primary" data-fi-pay="${i.id}">${icon('cash')}<span>Receber</span></button>` : ''}${i.paidAt ? html`<button type="button" class="btn sm" data-fi-receipt="${i.id}">${icon('printer')}<span>Recibo</span></button>` : ''}<button type="button" class="icon-btn sm" data-fi-menu="${i.id}" aria-label="Mais opções: ${invTitle(i)}${s ? ` de ${s.name}` : ''}" title="Mais opções">${icon('dots')}</button></td>
    </tr>`;
  };
  const table = (list, opts = {}) =>
    html`<div class="table-wrap"><table class="table responsive fi-table"><thead><tr>${opts.student === false ? html`<th>Cobrança</th>` : html`<th>Aluno</th><th class="hide-sm">Referente a</th>`}<th class="num">Vencimento</th><th class="num">Valor</th><th>Situação</th><th class="end"><span class="sr-only">Ações</span></th></tr></thead>
      <tbody>${list.map((i) => row(i, opts))}</tbody></table></div>`;

  const rowMenu = (anchor, id) => {
    const i = invoice(id);
    if (!i) return;
    const s = Q.student(i.studentId);
    const g = payer(s);
    const items = [];
    if (i.paidAt) {
      items.push({ label: 'Ver recibo', icon: 'printer', fn: () => receipt(i.id) });
      if (canReceive()) items.push({ label: 'Estornar pagamento', icon: 'undo', hint: 'Pede o motivo', fn: () => reverse(i.id) });
    } else {
      if (canReceive()) items.push({ label: 'Registrar pagamento', icon: 'cash', fn: () => receive(i.id) });
      if (s && g && g.phone) items.push({ label: 'Lembrar pelo WhatsApp', icon: 'message', hint: `Para ${g.name}`, fn: () => openLink(U.whatsappLink(g.phone, reminderText(s, [i])), reminderText(s, [i])) });
      if (s) items.push({ label: 'Copiar mensagem de cobrança', icon: 'copy', fn: () => UI.copy(reminderText(s, [i]), 'Mensagem copiada') });
      if (canManage()) items.push({ label: 'Editar valor e vencimento', icon: 'pencil', fn: () => editInvoice(i.id) });
    }
    if ((i.reversals || []).length) items.push({ label: 'Ver estornos', icon: 'history', fn: () => reversalsInfo(i.id) });
    if (s && hasPage('alunos')) items.push({ label: 'Abrir ficha do aluno', icon: 'user', fn: () => App.go(`alunos/${s.id}/financeiro`) });
    if (canManage() && !i.paidAt && !(i.reversals || []).length) items.push('-', { label: 'Excluir cobrança', icon: 'trash', danger: true, fn: () => removeInvoice(i.id) });
    UI.menu(anchor, items);
  };

  /** Cliques comuns às listas de cobranças (tela, aba da ficha, inadimplentes). Devolve true se tratou. */
  const handleClick = (e) => {
    const pay = e.target.closest('[data-fi-pay]');
    if (pay) {
      receive(pay.dataset.fiPay);
      return true;
    }
    const rc = e.target.closest('[data-fi-receipt]');
    if (rc) {
      receipt(rc.dataset.fiReceipt);
      return true;
    }
    const mm = e.target.closest('[data-fi-menu]');
    if (mm) {
      rowMenu(mm, mm.dataset.fiMenu);
      return true;
    }
    return false;
  };

  // =====================================================================
  // Receber, estornar, editar, excluir, lançar
  // =====================================================================
  const receive = (id) => {
    if (Store.preview) return UI.toast('No modo "ver como" nada pode ser alterado.', { tone: 'bad' });
    if (!canReceive()) return UI.toast('Seu acesso não permite registrar pagamentos. Fale com a direção.', { tone: 'bad' });
    const i = invoice(id);
    if (!i) return UI.toast('Esta cobrança não existe mais.', { tone: 'bad' });
    if (i.paidAt) return UI.toast(`Esta cobrança já foi paga em ${U.fmtDate(i.paidAt)}.`, { tone: 'bad' });
    const s = Q.student(i.studentId);
    const T = today();
    const box = (date) => {
      const c = charges(i, U.isValidDate(date) ? date : T);
      return html`<div class="fi-paybox">
        <div class="fi-paybox-who">${UI.avatar(s ? s.name : '?', '', s && s.photo)}<div><b>${s ? s.name : 'Aluno'}</b><span class="small muted">${className(s)} · ${invTitle(i)} · vence ${U.fmtDate(i.due)}</span></div></div>
        <div class="fi-paybox-rows">
          <div class="fi-paybox-row"><span>Valor da cobrança</span><b>${U.money(i.amount)}</b></div>
          ${c.days ? html`<div class="fi-paybox-row"><span>Multa e juros <span class="muted">(${U.plural(c.days, 'dia', 'dias')} de atraso)</span></span><b>+ ${U.money(c.extra)}</b></div>` : ''}
          <div class="fi-paybox-row is-total"><span>${c.days ? 'Total na data do pagamento' : 'Total'}</span><b>${U.money(c.total)}</b></div>
        </div>
      </div>`;
    };
    const defs = [
      { name: 'paidAt', label: 'Data do pagamento', type: 'date', required: true, max: T, check: (v) => (v > T ? 'A data não pode estar no futuro.' : '') },
      { name: 'amount', label: 'Valor recebido', type: 'money', required: true, min: 0.01, max: 1000000, hint: ' ' },
      { name: 'method', label: 'Forma de pagamento', type: 'chips', full: true, required: true, options: METHODS.map((m) => [m, m]) },
      { name: 'receipt', label: 'Abrir o recibo para imprimir depois de salvar', type: 'checkbox', full: true },
    ];
    UI.formDrawer({
      title: 'Registrar pagamento',
      sub: 'Dê baixa quando o dinheiro entrar. Dá para desfazer logo em seguida.',
      top: html`<div data-fi-box>${box(T)}</div>`,
      defs,
      values: { paidAt: T, amount: Q.amountDue(i, T), method: 'Pix', receipt: false },
      submitLabel: 'Confirmar recebimento',
      cls: 'fi-drawer',
      onMount(el, api, form) {
        liveClear(form);
        const dateIn = UI.$('#f-paidAt', form);
        const amountIn = UI.$('#f-amount', form);
        const hint = UI.$('#f-amount-hint', form);
        let manual = false;
        const update = () => {
          const date = U.isValidDate(dateIn.value) && dateIn.value <= T ? dateIn.value : T;
          const total = Q.amountDue(i, date);
          UI.setHTML(UI.$('[data-fi-box]', el), box(date));
          if (!manual) amountIn.value = U.num(total, 2);
          const v = U.parseNum(amountIn.value);
          hint.textContent = isNaN(v) ? '' : v < total - 0.004 ? `Menor que o devido (${U.money(total)}). A cobrança fica como paga com o valor informado.` : v > total + 0.004 ? `Maior que o devido (${U.money(total)}).` : 'Valor devido na data do pagamento.';
          hint.classList.toggle('fi-warn', !isNaN(v) && Math.abs(v - total) > 0.004);
        };
        dateIn.addEventListener('input', update);
        amountIn.addEventListener('input', () => {
          manual = true;
          update();
        });
        update();
      },
      async onSubmit(d, api, form) {
        const res = await UI.act('invoices.pay', { id: i.id, amount: round2(d.amount), paidAt: d.paidAt, method: d.method }, { form, ok: `Pagamento de ${U.money(d.amount)} registrado${s ? ` · ${U.shortName(s.name)}` : ''}` });
        if (!res) return null;
        if (d.receipt) setTimeout(() => receipt(i.id), 50);
        return true;
      },
    });
  };

  const reverse = async (id) => {
    if (!canReceive()) return UI.toast('Seu acesso não permite estornar pagamentos.', { tone: 'bad' });
    const i = invoice(id);
    if (!i || !i.paidAt) return UI.toast('Esta cobrança não está paga.', { tone: 'bad' });
    const s = Q.student(i.studentId);
    const r = await UI.confirm({
      title: 'Estornar este pagamento?',
      text: html`O pagamento de <b>${U.money(paidValue(i))}</b> (${i.method || 'forma não informada'}, ${U.fmtDate(i.paidAt)}) de <b>${s ? s.name : 'aluno'}</b> será desfeito e a cobrança volta a ficar em aberto. O estorno fica registrado na cobrança, com o motivo.`,
      ok: 'Estornar pagamento',
      danger: true,
      reason: { label: 'Motivo do estorno', required: true, placeholder: 'Ex.: pagamento lançado no aluno errado' },
    });
    if (!r) return;
    if (r.reason.length > 200) return UI.toast('O motivo pode ter no máximo 200 caracteres.', { tone: 'bad' });
    UI.act('invoices.reverse', { id: i.id, reason: r.reason }, { ok: 'Pagamento estornado. A cobrança voltou a ficar em aberto.' });
  };

  const reversalsInfo = (id) => {
    const i = invoice(id);
    if (!i) return;
    UI.modal({
      title: 'Estornos desta cobrança',
      sub: `${invTitle(i)} · ${(Q.student(i.studentId) || {}).name || ''}`,
      size: 'sm',
      body: html`<ul class="items">${(i.reversals || []).slice().reverse().map(
        (r) => html`<li class="fi-rev">${icon('undo')}<div class="grow"><b>${U.fmtInstant(r.at)}</b> · ${Q.userName(r.by, 'Equipe')}<div class="small">${r.reason}</div>${r.amount != null ? html`<div class="small muted">Pagamento desfeito: ${U.money(r.amount)}${r.method ? ` · ${r.method}` : ''}${r.paidAt ? ` · pago em ${U.fmtDate(r.paidAt)}` : ''}</div>` : ''}</div></li>`,
      )}</ul>`,
      foot: html`<button type="button" class="btn primary" data-close>Fechar</button>`,
    });
  };

  const editInvoice = (id) => {
    if (!canManage()) return UI.toast('Seu acesso não permite editar cobranças.', { tone: 'bad' });
    const i = invoice(id);
    if (!i) return UI.toast('Esta cobrança não existe mais.', { tone: 'bad' });
    if (i.paidAt) return UI.toast('Esta cobrança já foi paga. Estorne o pagamento antes de editar.', { tone: 'bad' });
    const s = Q.student(i.studentId);
    UI.formDrawer({
      title: 'Editar cobrança',
      sub: html`${s ? s.name : ''} · ${className(s)}`,
      top: i.kind === 'mensalidade' ? html`<p class="notice fi-note">${icon('info')}<span class="grow">Muda só esta cobrança. Para mudar o valor das próximas mensalidades, edite a mensalidade e o desconto na ficha do aluno.</span></p>` : '',
      defs: [
        { name: 'description', label: 'Descrição', required: true, full: true, maxlength: 120 },
        { name: 'amount', label: 'Valor', type: 'money', required: true, min: 0.01, max: 1000000 },
        { name: 'due', label: 'Vencimento', type: 'date', required: true },
      ],
      values: { description: i.description, amount: i.amount, due: i.due },
      submitLabel: 'Salvar alterações',
      cls: 'fi-drawer',
      onMount: (el, api, form) => liveClear(form),
      async onSubmit(d, api, form) {
        const res = await UI.act('invoices.update', { id: i.id, description: d.description, amount: round2(d.amount), due: d.due }, { form, ok: 'Cobrança atualizada' });
        return res ? true : null;
      },
    });
  };

  const removeInvoice = (id) => {
    const i = invoice(id);
    if (!i) return;
    const s = Q.student(i.studentId);
    UI.act('invoices.delete', { id: i.id }, { ok: `Cobrança excluída: ${invTitle(i)}${s ? ` de ${U.shortName(s.name)}` : ''}` });
  };

  const SUGGESTIONS = ['Material escolar', 'Uniforme', 'Passeio pedagógico', 'Taxa de matrícula', 'Apostilas', 'Formatura', 'Segunda via de documento'];
  const newCharge = ({ studentId = '', classId = '' } = {}) => {
    if (Store.preview) return UI.toast('No modo "ver como" nada pode ser alterado.', { tone: 'bad' });
    if (!canManage()) return UI.toast('Seu acesso não permite lançar cobranças. Fale com a direção.', { tone: 'bad' });
    if (!Q.chargesFees()) return UI.toast('A cobrança de mensalidades está desligada nas configurações.', { tone: 'bad' });
    const studs = Q.students();
    if (!studs.length) return UI.toast('Matricule um aluno antes de lançar cobranças.', { tone: 'bad' });
    const fixed = studentId ? Q.student(studentId) : null;
    const classes = Q.classes().filter((c) => studs.some((s) => s.classId === c.id));
    const defs = [
      fixed ? null : { name: 'mode', label: 'Para quem', type: 'chips', full: true, options: [['aluno', 'Um aluno'], ['turma', 'Uma turma inteira']] },
      fixed ? null : { name: 'studentId', label: 'Aluno', type: 'select', full: true, options: [['', 'Escolha o aluno']].concat(studs.map((s) => [s.id, `${s.name} · ${className(s)}`])), check: (v, d) => (d.mode !== 'turma' && !v ? 'Escolha o aluno.' : '') },
      fixed ? null : { name: 'classId', label: 'Turma', type: 'select', full: true, options: [['', 'Escolha a turma']].concat(classes.map((c) => [c.id, `${c.name} · ${U.plural(Q.students({ classId: c.id }).length, 'aluno ativo', 'alunos ativos')}`])), check: (v, d) => (d.mode === 'turma' && !v ? 'Escolha a turma.' : '') },
      { name: 'description', label: 'Descrição', required: true, full: true, maxlength: 120, placeholder: 'Ex.: Kit de uniforme', hint: html`<span class="fi-sugg">${SUGGESTIONS.map((t) => html`<button type="button" class="chip" data-fi-sugg="${t}">${t}</button>`)}</span>` },
      { name: 'amount', label: 'Valor', type: 'money', required: true, min: 0.01, max: 1000000 },
      { name: 'due', label: 'Vencimento', type: 'date', required: true },
    ];
    UI.formDrawer({
      title: 'Cobrança avulsa',
      sub: fixed ? html`Para <b>${fixed.name}</b> · ${className(fixed)}` : 'Uniforme, material, passeio, taxa de matrícula…',
      defs,
      values: { mode: 'aluno', studentId: '', classId, due: U.addDays(today(), 7) },
      submitLabel: 'Lançar cobrança',
      cls: 'fi-drawer',
      onMount(el, api, form) {
        liveClear(form);
        const sync = () => {
          const mode = (UI.$('input[name="mode"]:checked', form) || {}).value || 'aluno';
          const sw = UI.$('[data-field="studentId"]', form);
          const cw = UI.$('[data-field="classId"]', form);
          if (sw) sw.hidden = mode !== 'aluno';
          if (cw) cw.hidden = mode !== 'turma';
          const label = UI.$('[data-submit] span', el);
          if (label) label.textContent = mode === 'turma' ? 'Lançar para a turma' : 'Lançar cobrança';
        };
        form.addEventListener('change', sync);
        sync();
        form.addEventListener('click', (e) => {
          const b = e.target.closest('[data-fi-sugg]');
          if (!b) return;
          const d = UI.$('#f-description', form);
          d.value = b.dataset.fiSugg;
          d.dispatchEvent(new Event('input', { bubbles: true }));
          d.focus();
        });
      },
      async onSubmit(d, api, form) {
        const amount = round2(d.amount);
        const base = { description: d.description, amount, due: d.due };
        if (fixed || d.mode !== 'turma') {
          const sid = fixed ? fixed.id : d.studentId;
          const s = Q.student(sid);
          const res = await UI.act('invoices.create', { ...base, studentId: sid }, { form, ok: `Cobrança lançada para ${s ? U.shortName(s.name) : 'o aluno'}: ${U.money(amount)}` });
          return res ? true : null;
        }
        const kids = Q.students({ classId: d.classId });
        const c = Q.klass(d.classId);
        if (!kids.length) return UI.markField(form, 'classId', 'Esta turma não tem alunos ativos.') && null;
        const ok = await UI.confirm({
          title: `Lançar ${U.plural(kids.length, 'cobrança', 'cobranças')}?`,
          text: html`<b>${d.description}</b> de ${U.money(amount)} para cada aluno ativo da turma <b>${c ? c.name : ''}</b>, com vencimento em ${U.fmtDate(d.due)}. Total: <b>${U.money(amount * kids.length)}</b>. Depois, cada cobrança pode ser editada ou excluída separadamente.`,
          ok: `Lançar ${kids.length}`,
        });
        if (!ok) return null;
        const btn = UI.$('[data-submit]', api.el);
        let done = 0;
        for (const s of kids) {
          if (btn) UI.setHTML(btn, html`${UI.spinner()}<span>Lançando ${done + 1} de ${kids.length}…</span>`);
          try {
            await Store.cmd('invoices.create', { ...base, studentId: s.id });
            done++;
          } catch (err) {
            if (btn) UI.setHTML(btn, html`${icon('check')}<span>Lançar para a turma</span>`);
            UI.toast(`${done ? `${U.plural(done, 'cobrança lançada', 'cobranças lançadas')}. ` : ''}Parou em ${U.shortName(s.name)}: ${err.message || 'erro desconhecido'}`, { tone: 'bad' });
            return done ? true : null;
          }
        }
        UI.toast(`${U.plural(done, 'cobrança lançada', 'cobranças lançadas')} para ${c ? c.name : 'a turma'} (${U.money(amount * done)})`);
        return true;
      },
    });
  };

  // ---------- gerar mensalidades ----------
  const generate = async (month, btn) => {
    if (Store.preview) return UI.toast('No modo "ver como" nada pode ser alterado.', { tone: 'bad' });
    if (!canManage()) return UI.toast('Seu acesso não permite gerar mensalidades.', { tone: 'bad' });
    if (!canGenerate()) return UI.toast('Só quem enxerga todas as turmas gera as mensalidades do mês.', { tone: 'bad' });
    const miss = missingFor(month);
    if (!miss.length) return UI.toast(`Todos os alunos ativos já têm a mensalidade de ${U.monthName(month)}.`, { ic: 'checkCircle' });
    const n = miss.length;
    const res = await UI.act('invoices.generate', { month }, { btn, ok: `${U.plural(n, 'mensalidade', 'mensalidades')} de ${U.monthName(month)} ${n === 1 ? 'gerada' : 'geradas'} (${U.money(U.sum(miss.map((s) => Q.netFee(s))))})` });
    if (res) {
      const st = PS();
      st.month = month;
      st.status = 'todas';
    }
    return res;
  };
  const generateChooser = () => {
    if (!canGenerate()) return generate(today().slice(0, 7));
    const cur = today().slice(0, 7);
    const months = [cur, U.addMonths(cur, 1)];
    UI.modal({
      title: 'Gerar mensalidades',
      sub: `Uma cobrança por aluno ativo, com vencimento no dia ${S().dueDay || 10}. Alunos com bolsa integral ficam de fora.`,
      size: 'sm',
      body: html`<div class="fi-gen">${months.map((m) => {
        const miss = missingFor(m);
        return html`<button type="button" class="fi-gen-opt" data-fi-gen="${m}" ${miss.length ? '' : raw('disabled')}><b>${U.cap(U.fmtMonth(m))}</b><span>${miss.length ? `${U.plural(miss.length, 'aluno', 'alunos')} · ${U.money(U.sum(miss.map((s) => Q.netFee(s))))}` : 'Já geradas para todos'}</span>${icon(miss.length ? 'arrowRight' : 'checkCircle')}</button>`;
      })}</div>`,
      foot: html`<button type="button" class="btn" data-close>Cancelar</button>`,
      onMount(el, api) {
        el.addEventListener('click', async (e) => {
          const b = e.target.closest('[data-fi-gen]');
          if (!b || b.disabled) return;
          api.close();
          const res = await generate(b.dataset.fiGen);
          if (res && App.route()[0] !== 'financeiro' && hasPage('financeiro')) App.go('financeiro');
        });
      },
    });
  };

  // ---------- registrar pagamento a partir de qualquer tela ----------
  const quickReceive = (studentId = null) => {
    if (!canReceive()) return UI.toast('Seu acesso não permite registrar pagamentos.', { tone: 'bad' });
    const T = today();
    const open = Store.state.invoices.filter((i) => !i.paidAt);
    if (!open.length) return UI.toast('Não há cobranças em aberto. Tudo pago!', { ic: 'checkCircle' });
    const byStudent = new Map();
    for (const i of open) {
      const s = Q.student(i.studentId);
      if (!s) continue;
      if (!byStudent.has(s.id)) byStudent.set(s.id, { s, list: [], late: false });
      const e = byStudent.get(s.id);
      e.list.push(i);
      if (i.due < T) e.late = true;
    }
    for (const e of byStudent.values()) e.list.sort((a, b) => a.due.localeCompare(b.due));
    const entries = [...byStudent.values()];
    if (studentId && byStudent.has(studentId) && byStudent.get(studentId).list.length === 1) return receive(byStudent.get(studentId).list[0].id);
    const draw = (q) => {
      const base = q ? entries.filter((e) => U.matches(q, e.s.name, e.s.enrollment, payers(e.s).map((g) => g.name).join(' '))) : studentId ? entries.filter((e) => e.s.id === studentId) : entries.filter((e) => e.late);
      const rows = base.sort((a, b) => Q.cmpName(a.s, b.s)).slice(0, 30);
      if (!rows.length) return html`<p class="muted small">${q ? 'Ninguém com cobrança em aberto encontrado com esse nome.' : 'Ninguém com pagamento atrasado. Busque pelo nome do aluno ou do responsável.'}</p>`;
      return html`${!q && !studentId ? html`<p class="small muted fi-qr-h">Com pagamento atrasado. Busque pelo nome para ver os demais.</p>` : ''}<ul class="items fi-qr">${rows.map(
        (e) => html`<li>${UI.avatar(e.s.name, 'sm', e.s.photo)}<div class="grow"><b>${e.s.name}</b><div class="person-sub">${className(e.s)}</div>
          <div class="chips fi-qr-chips">${e.list.map((i) => {
            const late = i.due < T;
            return html`<button type="button" class="chip ${late ? 'fi-chip-late' : ''}" data-fi-pick="${i.id}">${i.kind === 'mensalidade' ? U.cap(monthShort(i.month)) : i.description} · ${U.money(Q.amountDue(i, T))}${late ? ' · atrasada' : ''}</button>`;
          })}</div></div></li>`,
      )}</ul>`;
    };
    UI.modal({
      title: 'Registrar pagamento',
      sub: 'Busque o aluno e toque na cobrança que foi paga.',
      size: 'lg',
      guard: false,
      body: html`<label class="search-box fi-qr-search"><span class="sr-only">Buscar aluno ou responsável</span>${icon('search')}<input class="input" type="search" data-fi-qr placeholder="Nome do aluno ou do responsável" autocomplete="off" autofocus></label><div data-fi-qr-list>${draw('')}</div>`,
      onMount(el, api) {
        const list = UI.$('[data-fi-qr-list]', el);
        UI.$('[data-fi-qr]', el).addEventListener('input', U.debounce((e) => UI.setHTML(list, draw(e.target.value)), 120));
        list.addEventListener('click', (e) => {
          const b = e.target.closest('[data-fi-pick]');
          if (!b) return;
          api.close();
          receive(b.dataset.fiPick);
        });
      },
    });
  };

  // ---------- recibo ----------
  const receiptHTML = (i) => {
    const s = Q.student(i.studentId);
    const st = S();
    const g = payer(s);
    const value = paidValue(i);
    const by = i.receivedBy ? Q.userName(i.receivedBy, '') : '';
    const y = (i.paidAt || today()).slice(0, 4);
    return html`<div class="fi-receipt">
      <header class="fi-rc-head"><div><b class="fi-rc-school">${st.schoolName || 'Escola'}</b><div class="small">${[st.cnpj ? `CNPJ ${st.cnpj}` : '', st.address, st.phone].filter(Boolean).join(' · ')}</div></div>
        <div class="fi-rc-no"><span>Recibo</span><b>${i.id.toUpperCase()}</b></div></header>
      <div class="fi-rc-value"><span>Valor recebido</span><b>${U.money(value)}</b></div>
      <p class="fi-rc-text">Recebemos de <b>${g ? g.name : 'responsável financeiro'}</b>${g && g.cpf ? `, CPF ${g.cpf}` : ''}, a importância de <b>${U.money(value)}</b> (${extenso(value)}), referente a <b>${invTitle(i)}</b>${i.kind === 'mensalidade' ? ` de ${i.month.slice(0, 4)}` : ''} do(a) aluno(a) <b>${s ? s.name : ''}</b>${s && Q.klass(s.classId) ? `, turma ${Q.klass(s.classId).name}` : ''}, e damos quitação desse valor.</p>
      <dl class="fi-rc-kv">
        <dt>Vencimento</dt><dd>${U.fmtDate(i.due)}</dd>
        <dt>Pagamento</dt><dd>${U.fmtDate(i.paidAt)}</dd>
        <dt>Forma</dt><dd>${i.method || '—'}</dd>
        ${paidValue(i) !== i.amount ? html`<dt>Valor cobrado</dt><dd>${U.money(i.amount)}</dd>` : ''}
        ${by ? html`<dt>Recebido por</dt><dd>${by}</dd>` : ''}
      </dl>
      <p class="fi-rc-date">${U.cap(U.fmtDateLong(i.paidAt, false))} de ${y}.</p>
      <div class="fi-rc-sign"><span>${st.schoolName || 'Escola'}</span><span class="small">Tesouraria / Secretaria</span></div>
    </div>`;
  };
  const printHost = (content) => {
    document.querySelectorAll('.fi-print-host').forEach((n) => n.remove());
    const host = document.createElement('div');
    host.className = 'fi-print-host';
    UI.setHTML(host, content);
    document.body.appendChild(host);
    document.body.classList.add('fi-printing');
    const done = () => {
      document.body.classList.remove('fi-printing');
      host.remove();
      window.removeEventListener('afterprint', done);
    };
    window.addEventListener('afterprint', done);
    try {
      window.print();
    } catch (e) {
      done();
    }
  };
  const receipt = (id) => {
    const i = invoice(id);
    if (!i) return UI.toast('Esta cobrança não existe mais.', { tone: 'bad' });
    if (!i.paidAt) return UI.toast('O recibo fica disponível depois do pagamento.', { tone: 'bad' });
    UI.modal({
      title: 'Recibo',
      sub: `${invTitle(i)} · pago em ${U.fmtDate(i.paidAt)}`,
      size: 'lg',
      cls: 'fi-rc-modal',
      body: receiptHTML(i),
      foot: html`<button type="button" class="btn" data-close>Fechar</button><button type="button" class="btn primary" data-fi-print>${icon('printer')}Imprimir ou salvar em PDF</button>`,
      onMount(el) {
        UI.$('[data-fi-print]', el).addEventListener('click', () => printHost(receiptHTML(invoice(id) || i)));
      },
    });
  };

  // ---------- planilha ----------
  const exportInvoices = (list, name) => {
    const T = today();
    const rows = [['Aluno', 'Matrícula', 'Turma', 'Responsável financeiro', 'Celular', 'Referente a', 'Tipo', 'Vencimento', 'Valor', 'Valor atualizado', 'Situação', 'Pago em', 'Forma', 'Valor pago']];
    for (const i of list) {
      const s = Q.student(i.studentId);
      const g = payer(s);
      rows.push([s ? s.name : '', s ? s.enrollment : '', className(s), g ? g.name : '', g ? g.phone || '' : '', invTitle(i), i.kind === 'avulsa' ? 'Avulsa' : 'Mensalidade', U.fmtDate(i.due), U.num(i.amount, 2), U.num(Q.amountDue(i, T), 2), STATUS[Q.invoiceStatus(i, T)][0], i.paidAt ? U.fmtDate(i.paidAt) : '', i.method || '', i.paidAt ? U.num(paidValue(i), 2) : '']);
    }
    U.download(`${name}.csv`, U.toCSV(rows));
    UI.toast(`Planilha baixada (${U.plural(list.length, 'cobrança', 'cobranças')})`, { ic: 'download' });
  };
  const exportDebtors = (list) => {
    const rows = [['Aluno', 'Matrícula', 'Turma', 'Responsável financeiro', 'Celular', 'E-mail', 'Cobranças em atraso', 'Vencida desde', 'Total atualizado']];
    for (const d of list) {
      const g = payer(d.student);
      rows.push([d.student.name, d.student.enrollment, className(d.student), g ? g.name : '', g ? g.phone || '' : '', g ? g.email || '' : '', d.invoices.map(invTitle).join(', '), U.fmtDate(d.oldest), U.num(d.total, 2)]);
    }
    U.download(`inadimplentes-${today()}.csv`, U.toCSV(rows));
    UI.toast(`Planilha baixada (${U.plural(list.length, 'aluno', 'alunos')})`, { ic: 'download' });
  };

  // =====================================================================
  // Tela da equipe
  // =====================================================================
  const PS = () => PageState.get('financeiro', { tab: 'mes', month: today().slice(0, 7), status: 'todas', classId: '', q: '', limit: 60, dq: '', dClassId: '' });

  const kpis = (m, sum) => {
    const T = today();
    const totalLate = lateStudentCount();
    const otherLate = totalLate > sum.lateStudents.size ? totalLate : 0;
    const nextDue = monthInvoices(m).filter((i) => !i.paidAt && i.due >= T).map((i) => i.due).sort()[0];
    return html`<section class="kpis fi-kpis" aria-label="Resumo de ${U.fmtMonth(m)}">
      <div class="card kpi"><span class="kpi-label">${icon('wallet')}Previsto</span><span class="kpi-value" title="${U.money(sum.expected)}">${U.moneyShort(sum.expected)}</span><span class="kpi-foot">${U.plural(sum.count, 'cobrança', 'cobranças')} em ${U.monthName(m)}</span></div>
      <div class="card kpi"><span class="kpi-label">${icon('checkCircle')}Recebido</span><span class="kpi-value fi-ok" title="${U.money(sum.received)}">${U.moneyShort(sum.received)}</span>${UI.meter(Math.min(100, sum.pct), sum.pct >= 85 ? 'ok' : '')}<span class="kpi-foot">${U.pct(sum.pct)} do previsto · ${U.plural(sum.nPaid, 'paga', 'pagas')}</span></div>
      <div class="card kpi"><span class="kpi-label">${icon('clock')}A vencer</span><span class="kpi-value" title="${U.money(sum.open)}">${U.moneyShort(sum.open)}</span><span class="kpi-foot">${sum.nOpen ? `${U.plural(sum.nOpen, 'cobrança', 'cobranças')}${nextDue ? ` · vence ${U.fmtDate(nextDue)}` : ''}` : 'nada a vencer'}</span></div>
      <div class="card kpi ${sum.nLate ? 'fi-kpi-bad' : ''}"><span class="kpi-label">${icon('alert')}Atrasado</span><span class="kpi-value ${sum.nLate ? 'fi-bad' : ''}" title="${U.money(sum.lateDue)}">${U.moneyShort(sum.lateDue)}</span><span class="kpi-foot">${sum.nLate ? `${U.plural(sum.lateStudents.size, 'aluno', 'alunos')} · com multa e juros` : 'nada vencido neste mês'}${otherLate ? html`<button type="button" class="link fi-kpi-link" data-fi-tab="atrasados">${U.plural(otherLate, 'aluno', 'alunos')} em atraso ${sum.nLate ? 'no total' : 'em outros meses'}</button>` : ''}</span></div>
    </section>`;
  };

  const monthTab = (st) => {
    const T = today();
    const cur = T.slice(0, 7);
    const all = monthInvoices(st.month);
    const counts = { todas: all.length, atrasado: 0, aberto: 0, pago: 0 };
    all.forEach((i) => counts[Q.invoiceStatus(i, T)]++);
    if (st.status !== 'todas' && !counts[st.status]) st.status = 'todas';
    const cmap = new Map();
    const sOf = (i) => {
      if (!cmap.has(i.studentId)) cmap.set(i.studentId, Q.student(i.studentId));
      return cmap.get(i.studentId);
    };
    let list = all.filter((i) => st.status === 'todas' || Q.invoiceStatus(i, T) === st.status);
    if (st.classId) list = list.filter((i) => (sOf(i) || {}).classId === st.classId);
    if (st.q) list = list.filter((i) => {
      const s = sOf(i);
      return U.matches(st.q, s && s.name, s && s.enrollment, payers(s).map((g) => g.name).join(' '), i.description);
    });
    list.sort((a, b) => ORDER[Q.invoiceStatus(a, T)] - ORDER[Q.invoiceStatus(b, T)] || Q.cmpName(sOf(a) || {}, sOf(b) || {}) || a.due.localeCompare(b.due));
    const shown = list.slice(0, st.limit);
    const near = st.month === cur || st.month === U.addMonths(cur, 1);
    const miss = canGenerate() && near ? missingFor(st.month) : [];
    const missTotal = U.sum(miss.map((s) => Q.netFee(s)));
    const classes = Q.classes();
    const filtered = st.status !== 'todas' || st.classId || st.q;
    return html`
      ${miss.length && all.length
        ? html`<div class="notice fi-gen-notice">${icon('info')}<span class="grow">${U.plural(miss.length, 'aluno ativo ainda não tem', 'alunos ativos ainda não têm')} a mensalidade de ${U.monthName(st.month)} (${U.money(missTotal)}).</span><button type="button" class="btn sm primary" data-fi-gen="${st.month}">${icon('plus')}Gerar ${U.plural(miss.length, 'mensalidade', 'mensalidades')}</button></div>`
        : ''}
      ${all.length
        ? html`<div class="toolbar fi-toolbar">
            ${UI.seg([['todas', `Todas (${counts.todas})`], ['atrasado', `Atrasadas (${counts.atrasado})`], ['aberto', `A vencer (${counts.aberto})`], ['pago', `Pagas (${counts.pago})`]], st.status, 'data-fi-status')}
            <span class="grow"></span>
            ${classes.length > 1 ? html`<select class="input fi-filter" data-fi-class aria-label="Filtrar por turma"><option value="">Todas as turmas</option>${classes.map((c) => html`<option value="${c.id}" ${c.id === st.classId ? raw('selected') : ''}>${c.name}</option>`)}</select>` : ''}
            <label class="search-box fi-search"><span class="sr-only">Buscar aluno, responsável ou descrição</span>${icon('search')}<input class="input" type="search" data-fi-q value="${st.q}" placeholder="Aluno, responsável ou descrição" autocomplete="off"></label>
            ${U.inFrame ? '' : html`<button type="button" class="btn" data-fi-export title="Baixar a lista filtrada (.csv)">${icon('download')}<span class="hide-xs">Planilha</span></button>`}
          </div>`
        : ''}
      <section class="card fi-listcard">
        ${shown.length
          ? html`${table(shown)}${list.length > shown.length ? html`<div class="fi-more"><button type="button" class="btn" data-fi-more>Mostrar mais ${Math.min(60, list.length - shown.length)} de ${list.length - shown.length}</button></div>` : ''}`
          : all.length
            ? UI.empty({ icon: 'search', title: 'Nenhuma cobrança com esses filtros', text: 'Mude a situação, a turma ou a busca.', action: filtered ? html`<button type="button" class="btn" data-fi-clear>Limpar filtros</button>` : '' })
            : UI.empty({
                icon: 'wallet',
                title: `Nenhuma cobrança em ${U.monthName(st.month)}`,
                text: miss.length ? `Gere de uma vez as mensalidades de ${U.monthName(st.month)} para ${U.plural(miss.length, 'aluno ativo', 'alunos ativos')} (${U.money(missTotal)}), com vencimento no dia ${S().dueDay || 10}.` : st.month > cur ? 'As mensalidades deste mês ainda não foram geradas.' : 'Não há mensalidades nem cobranças avulsas neste mês.',
                action: miss.length ? html`<button type="button" class="btn primary" data-fi-gen="${st.month}">${icon('plus')}Gerar mensalidades de ${U.monthName(st.month)}</button>` : '',
              })}
      </section>`;
  };

  const debtorsTab = (st) => {
    const all = debtors();
    if (!all.length) return html`<section class="card">${UI.empty({ icon: 'checkCircle', title: 'Nenhum pagamento atrasado', text: 'Todas as famílias estão em dia. Ótima notícia!' })}</section>`;
    let list = all;
    if (st.dClassId) list = list.filter((d) => d.student.classId === st.dClassId);
    if (st.dq) list = list.filter((d) => U.matches(st.dq, d.student.name, d.student.enrollment, payers(d.student).map((g) => g.name).join(' ')));
    const total = U.sum(all.map((d) => d.total));
    const classes = Q.classes().filter((c) => all.some((d) => d.student.classId === c.id));
    const T = today();
    return html`
      <div class="notice warn fi-debt-sum">${icon('alert')}<span class="grow"><b>${U.plural(all.length, 'aluno', 'alunos')} com pagamento atrasado · ${U.money(total)}</b> com multa e juros até hoje. O botão do WhatsApp abre uma mensagem pronta e educada para o responsável financeiro.</span>${U.inFrame ? '' : html`<button type="button" class="btn sm" data-fi-dexport>${icon('download')}Planilha</button>`}</div>
      ${all.length > 8
        ? html`<div class="toolbar fi-toolbar">
            <label class="search-box fi-search"><span class="sr-only">Buscar aluno ou responsável</span>${icon('search')}<input class="input" type="search" data-fi-dq value="${st.dq}" placeholder="Aluno ou responsável" autocomplete="off"></label>
            ${classes.length > 1 ? html`<select class="input fi-filter" data-fi-dclass aria-label="Filtrar por turma"><option value="">Todas as turmas</option>${classes.map((c) => html`<option value="${c.id}" ${c.id === st.dClassId ? raw('selected') : ''}>${c.name}</option>`)}</select>` : ''}
          </div>`
        : ''}
      <section class="card">${list.length
        ? html`<div class="table-wrap"><table class="table responsive fi-table fi-debt"><thead><tr><th>Aluno</th><th>Responsável financeiro</th><th>Em atraso</th><th class="num">Total atualizado</th><th class="end"><span class="sr-only">Ações</span></th></tr></thead><tbody>${list.map((d) => {
            const s = d.student;
            const g = payer(s);
            const msg = reminderText(s, d.invoices);
            const days = U.daysBetween(d.oldest, T);
            return html`<tr>
              <td class="first">${studentCell(s)}</td>
              <td data-l="Responsável">${g ? html`<div class="fi-payer"><span>${g.name}</span>${g.phone ? html`<span class="person-sub">${g.phone}</span>` : UI.hidden(s, 'guardians.contatos') ? html`<span class="person-sub">${UI.noAccess('contato restrito')}</span>` : html`<span class="person-sub">sem celular</span>`}</div>` : html`<span class="muted">Não indicado</span>`}</td>
              <td data-l="Em atraso"><div class="fi-months">${d.invoices.map((i) => html`<span class="pill bad plain" title="${invTitle(i)} · venceu ${U.fmtDate(i.due)}">${i.kind === 'mensalidade' ? monthShort(i.month) : i.description}</span>`)}</div><span class="person-sub">há ${U.plural(days, 'dia', 'dias')}</span></td>
              <td class="num" data-l="Total"><b class="fi-bad">${U.money(d.total)}</b></td>
              <td class="end fi-acts">
                ${g && g.phone ? html`<a class="btn sm" href="${U.whatsappLink(g.phone, msg)}" target="_blank" rel="noopener noreferrer" aria-label="Lembrar ${g.name} pelo WhatsApp">${icon('message')}<span>WhatsApp</span></a>` : ''}
                ${canReceive() ? html`<button type="button" class="btn sm primary" data-fi-recv="${s.id}">${icon('cash')}<span>Receber</span></button>` : ''}
                <button type="button" class="icon-btn sm" data-fi-dmenu="${s.id}" aria-label="Mais opções: ${s.name}" title="Mais opções">${icon('dots')}</button>
              </td>
            </tr>`;
          })}</tbody></table></div>`
        : UI.empty({ icon: 'search', title: 'Ninguém encontrado', text: 'Mude a busca ou a turma.' })}</section>`;
  };

  const historyMonths = () => {
    const cur = today().slice(0, 7);
    const months = new Set(Store.state.invoices.map((i) => i.month).filter((m) => m <= cur));
    const first = [...months].sort()[0] || cur;
    const start = U.addMonths(cur, -11) > first ? U.addMonths(cur, -11) : first;
    const out = [];
    for (let m = start; m <= cur; m = U.addMonths(m, 1)) out.push(m);
    return out;
  };
  const historyTab = () => {
    const months = historyMonths();
    const T = today();
    const rows = months.map((m) => ({ m, s: summary(monthInvoices(m), T) }));
    const methods = new Map();
    for (const i of Store.state.invoices) if (i.paidAt && i.paidAt.slice(0, 4) === T.slice(0, 4)) methods.set(i.method || 'Outra', (methods.get(i.method || 'Outra') || 0) + paidValue(i));
    const mTotal = U.sum([...methods.values()]);
    return html`<div class="grid-2 fi-hist">
      <section class="card"><div class="card-head"><h2>Recebido x previsto</h2><div class="legend"><span><span class="swatch" style="--c:var(--primary)"></span>Recebido</span><span><span class="swatch" style="--c:var(--accent-soft)"></span>Previsto</span></div></div>
        <div class="card-body"><div data-fi-chart data-label="Mensalidades recebidas e previstas por mês"></div></div></section>
      <section class="card"><div class="card-head"><h2>Formas de pagamento</h2><span class="sub">Recebido em ${T.slice(0, 4)}</span></div>
        <div class="card-body">${mTotal
          ? html`<div class="hbars">${[...methods.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => html`<div class="hbar fi-hbar"><span>${k}</span><div class="track"><div class="fill" style="width:${(v / mTotal) * 100}%"></div></div><span class="v">${U.pct((v / mTotal) * 100)}</span></div>`)}</div><p class="small muted fi-hbar-total">Total recebido no ano: <b>${U.money(mTotal)}</b></p>`
          : html`<p class="muted small">Nenhum pagamento registrado neste ano.</p>`}</div></section>
    </div>
    <section class="card"><div class="table-wrap"><table class="table responsive fi-table"><thead><tr><th>Mês</th><th class="num">Previsto</th><th class="num">Recebido</th><th class="num">A vencer</th><th class="num">Atrasado</th><th class="num">%</th></tr></thead><tbody>
      ${rows.slice().reverse().map(({ m, s }) => html`<tr class="clickable" data-fi-gomonth="${m}"><td class="first"><button type="button" class="link fi-mlink" data-fi-gomonth="${m}">${U.cap(U.fmtMonth(m))}</button></td><td class="num" data-l="Previsto">${U.money(s.expected)}</td><td class="num" data-l="Recebido">${U.money(s.received)}</td><td class="num" data-l="A vencer">${U.money(s.open)}</td><td class="num" data-l="Atrasado">${s.lateDue ? html`<span class="fi-bad">${U.money(s.lateDue)}</span>` : U.money(0)}</td><td class="num" data-l="Recebido">${U.pct(s.pct)}</td></tr>`)}
    </tbody></table></div></section>`;
  };

  const renderStaff = () => {
    const st = PS();
    if (!/^\d{4}-\d{2}$/.test(st.month)) st.month = today().slice(0, 7);
    const cur = today().slice(0, 7);
    const s = S();
    const sum = summary(monthInvoices(st.month));
    const nDebt = lateStudentCount();
    const fine = Number(s.lateFine) || 0;
    const interest = Number(s.lateInterest) || 0;
    const lead = `Mensalidades e cobranças de cada mês, pagamentos e quem está em atraso.${fine || interest ? ` Multa de ${U.num(fine, fine % 1 ? 1 : 0)}% e juros de ${U.num(interest, interest % 1 ? 1 : 0)}% ao mês são calculados sozinhos.` : ''}`;
    let body;
    if (st.tab === 'atrasados') body = debtorsTab(st);
    else if (st.tab === 'historico') body = historyTab();
    else body = monthTab(st);
    return html`
      <div class="page-head">
        <div><h1>Financeiro</h1><p class="lead">${lead}</p></div>
        <div class="btn-row fi-head-btns">
          ${canManage() ? html`<button type="button" class="btn" data-fi-newcharge>${icon('plus')}Cobrança avulsa</button>` : ''}
          ${canReceive() ? html`<button type="button" class="btn primary" data-fi-quick>${icon('cash')}Registrar pagamento</button>` : ''}
        </div>
      </div>
      ${st.tab === 'mes'
        ? html`<div class="toolbar fi-monthbar">
            <div class="date-nav">
              <button type="button" class="icon-btn" data-fi-month="-1" aria-label="Mês anterior">${icon('chevronLeft')}</button>
              <h2 class="fi-month">${U.cap(U.fmtMonth(st.month))}</h2>
              <button type="button" class="icon-btn" data-fi-month="1" aria-label="Próximo mês">${icon('chevronRight')}</button>
              ${st.month !== cur ? html`<button type="button" class="btn sm ghost" data-fi-month="0">Mês atual</button>` : ''}
            </div>
          </div>
          ${kpis(st.month, sum)}`
        : ''}
      ${UI.tabs([['mes', 'Cobranças do mês'], ['atrasados', 'Inadimplentes', nDebt ? html` <span class="badge bad">${nDebt}</span>` : ''], ['historico', 'Histórico']], st.tab, 'data-fi-tab')}
      ${body}`;
  };

  const rerenderKeepingFocus = (sel) => {
    const a = document.activeElement;
    const pos = a && a.matches && a.matches(sel) ? a.selectionStart : null;
    App.render();
    if (pos == null) return;
    const again = document.querySelector(sel);
    if (again) {
      again.focus();
      try {
        again.setSelectionRange(pos, pos);
      } catch (e) {
        /* campo sem seleção */
      }
    }
  };

  const mountStaff = (el) => {
    const st = PS();
    el.addEventListener('click', (e) => {
      if (handleClick(e)) return;
      const b = e.target.closest('[data-fi-tab],[data-fi-month],[data-fi-status],[data-fi-gen],[data-fi-newcharge],[data-fi-quick],[data-fi-export],[data-fi-dexport],[data-fi-more],[data-fi-clear],[data-fi-dmenu],[data-fi-recv],[data-fi-gomonth]');
      if (!b) return;
      const d = b.dataset;
      if (d.fiTab) {
        st.tab = d.fiTab;
        return App.render();
      }
      if (d.fiMonth != null) {
        const n = Number(d.fiMonth);
        st.month = n === 0 ? today().slice(0, 7) : U.addMonths(st.month, n);
        st.limit = 60;
        return App.render();
      }
      if (d.fiGomonth) {
        st.month = d.fiGomonth;
        st.tab = 'mes';
        st.status = 'todas';
        st.limit = 60;
        App.render();
        return window.scrollTo(0, 0);
      }
      if (d.fiStatus) {
        st.status = d.fiStatus;
        st.limit = 60;
        return App.render();
      }
      if (d.fiGen) return generate(d.fiGen, b);
      if ('fiNewcharge' in d) return newCharge({ classId: st.classId });
      if ('fiQuick' in d) return quickReceive();
      if ('fiMore' in d) {
        st.limit += 60;
        return App.render();
      }
      if ('fiClear' in d) {
        Object.assign(st, { status: 'todas', classId: '', q: '', limit: 60 });
        return App.render();
      }
      if ('fiExport' in d) {
        const T = today();
        const list = monthInvoices(st.month)
          .filter((i) => st.status === 'todas' || Q.invoiceStatus(i, T) === st.status)
          .filter((i) => !st.classId || (Q.student(i.studentId) || {}).classId === st.classId)
          .filter((i) => {
            const s = Q.student(i.studentId);
            return !st.q || U.matches(st.q, s && s.name, s && s.enrollment, payers(s).map((g) => g.name).join(' '), i.description);
          });
        return exportInvoices(list, `cobrancas-${st.month}`);
      }
      if ('fiDexport' in d) return exportDebtors(debtors());
      if (d.fiDmenu) {
        const dd = debtors().find((x) => x.student.id === d.fiDmenu);
        if (!dd) return;
        const g = payer(dd.student);
        const text = reminderText(dd.student, dd.invoices);
        return UI.menu(b, [
          { label: 'Copiar mensagem de cobrança', icon: 'copy', fn: () => UI.copy(text, 'Mensagem copiada. Cole no WhatsApp ou e-mail do responsável.') },
          g && g.email ? { label: 'Enviar por e-mail', icon: 'mail', hint: g.email, fn: () => openMail(`mailto:${g.email}?subject=${encodeURIComponent(`Mensalidade em aberto — ${dd.student.name}`)}&body=${encodeURIComponent(text)}`) } : null,
          hasPage('alunos') ? { label: 'Abrir ficha do aluno', icon: 'user', fn: () => App.go(`alunos/${dd.student.id}/financeiro`) } : null,
        ]);
      }
      if (d.fiRecv) return quickReceive(d.fiRecv);
    });
    el.addEventListener('change', (e) => {
      if (e.target.matches('[data-fi-class]')) {
        st.classId = e.target.value;
        st.limit = 60;
        App.render();
      } else if (e.target.matches('[data-fi-dclass]')) {
        st.dClassId = e.target.value;
        App.render();
      }
    });
    const q = UI.$('[data-fi-q]', el);
    q &&
      q.addEventListener(
        'input',
        U.debounce(() => {
          st.q = q.value;
          st.limit = 60;
          rerenderKeepingFocus('[data-fi-q]');
        }, 220),
      );
    const dq = UI.$('[data-fi-dq]', el);
    dq &&
      dq.addEventListener(
        'input',
        U.debounce(() => {
          st.dq = dq.value;
          rerenderKeepingFocus('[data-fi-dq]');
        }, 220),
      );
    const chart = UI.$('[data-fi-chart]', el);
    if (chart) {
      const T = today();
      UI.columns(chart, {
        height: 220,
        label: 'last',
        fmt: (n) => (n >= 1000 ? `${U.num(n / 1000, n >= 1e5 || n % 1000 === 0 ? 0 : 1)} mil` : U.int(n)),
        data: historyMonths().map((m) => {
          const s = summary(monthInvoices(m), T);
          return { label: monthShort(m), value: s.received, track: s.expected, tip: `${U.cap(U.fmtMonth(m))}: ${U.money(s.received)} de ${U.money(s.expected)} (${U.pct(s.pct)})` };
        }),
      });
    }
  };

  // =====================================================================
  // Portal da família
  // =====================================================================
  const myPayingChildren = () => Q.myChildren().filter((s) => (Q.myGuardianRecord(s) || {}).financeiro);
  const famPS = () => PageState.get('financeiro-familia', { showPaid: {} });

  const famInvoice = (i) => {
    const T = today();
    const st = Q.invoiceStatus(i, T);
    const c = charges(i, T);
    return html`<li class="fi-fi is-${st}">
      <span class="fi-fi-ic" aria-hidden="true">${icon(st === 'pago' ? 'checkCircle' : st === 'atrasado' ? 'alert' : 'clock')}</span>
      <div class="grow">
        <b>${invTitle(i)}</b>
        <div class="small muted">${st === 'pago' ? `Pago em ${U.fmtDate(i.paidAt)}${i.method ? ` · ${i.method}` : ''}` : st === 'atrasado' ? `Venceu em ${U.fmtDate(i.due)} · ${U.plural(c.days, 'dia', 'dias')} de atraso` : `Vence em ${U.fmtDate(i.due)} (${U.relDay(i.due)})`}</div>
        ${st === 'atrasado' && c.extra ? html`<div class="small fi-fi-extra">${U.money(i.amount)} + ${U.money(c.extra)} de multa e juros até hoje</div>` : ''}
      </div>
      <div class="fi-fi-end"><b class="${st === 'atrasado' ? 'fi-bad' : ''}">${U.money(st === 'pago' ? paidValue(i) : c.total)}</b>
        ${st === 'pago' ? html`<button type="button" class="btn sm" data-fi-receipt="${i.id}">${icon('printer')}<span>Recibo</span></button>` : UI.pill(STATUS[st][0], STATUS[st][1])}</div>
    </li>`;
  };

  const renderFamily = () => {
    const kids = myPayingChildren();
    const T = today();
    const s = S();
    const fp = famPS();
    const all = Store.state.invoices.filter((i) => kids.some((k) => k.id === i.studentId));
    const open = all.filter((i) => !i.paidAt);
    const late = open.filter((i) => i.due < T);
    const totalOpen = round2(U.sum(open.map((i) => Q.amountDue(i, T))));
    const next = open.filter((i) => i.due >= T).sort((a, b) => a.due.localeCompare(b.due))[0];
    const names = kids.map((k) => U.firstName(k.name));
    const msg = typeof Actions.novaMensagem === 'function';
    return html`
      <div class="page-head"><div><h1>Mensalidades</h1><p class="lead">Valores, vencimentos e recibos${names.length ? ` de ${joinPt(names)}` : ''}. O pagamento aparece aqui assim que a escola dá baixa.</p></div></div>
      ${open.length
        ? html`<section class="card fi-due ${late.length ? 'is-late' : ''}">
            <div class="fi-due-main">
              <span class="kpi-label">${icon(late.length ? 'alert' : 'wallet')}${late.length ? 'Em aberto (com atraso)' : 'Em aberto'}</span>
              <b class="fi-due-v ${late.length ? 'fi-bad' : ''}">${U.money(totalOpen)}</b>
              <span class="small muted">${late.length ? `${U.plural(late.length, 'cobrança atrasada', 'cobranças atrasadas')}, com multa e juros até hoje.` : ''}${next ? ` Próximo vencimento: ${U.fmtDate(next.due)} (${U.money(next.amount)}).` : ''}</span>
            </div>
            <div class="fi-pix">
              ${s.pixKey
                ? html`<span class="kpi-label">${icon('key')}Pague pelo Pix</span><code class="fi-pix-key">${s.pixKey}</code><div class="btn-row"><button type="button" class="btn primary" data-fi-pix>${icon('copy')}Copiar chave Pix</button>${msg && kids.length ? html`<button type="button" class="btn" data-fi-proof>${icon('send')}Enviar comprovante</button>` : ''}</div><span class="small muted">Use o valor da cobrança. Se pagar com atraso, inclua a multa e os juros.</span>`
                : html`<span class="kpi-label">${icon('info')}Como pagar</span><p class="small">Fale com a secretaria para saber as formas de pagamento${s.phone ? html`: <b>${s.phone}</b>` : ''}.</p>${msg && kids.length ? html`<div class="btn-row"><button type="button" class="btn" data-fi-proof>${icon('send')}Falar com a escola</button></div>` : ''}`}
            </div>
          </section>`
        : html`<div class="notice ok">${icon('checkCircle')}<span class="grow"><b>Tudo em dia.</b> Não há mensalidades em aberto. Obrigado!</span></div>`}
      ${kids.map((k) => {
        const mine = all.filter((i) => i.studentId === k.id).sort((a, b) => ORDER[Q.invoiceStatus(a, T)] - ORDER[Q.invoiceStatus(b, T)] || (Q.invoiceStatus(a, T) === 'pago' ? b.due.localeCompare(a.due) : a.due.localeCompare(b.due)));
        const pending = mine.filter((i) => !i.paidAt);
        const paid = mine.filter((i) => i.paidAt);
        const showAll = !!fp.showPaid[k.id];
        const paidShown = showAll ? paid : paid.slice(0, 3);
        const fee = k.fee != null ? Q.netFee(k) : null;
        return html`<section class="card fi-kid">
          <div class="card-head"><div class="person">${UI.avatar(k.name, '', k.photo)}<div><h2>${k.name}</h2><span class="person-sub">${className(k)}${fee ? ` · mensalidade ${U.money(fee)}${k.discount ? ` (${U.num(k.discount, 0)}% de desconto)` : ''}` : ''}</span></div></div></div>
          <div class="card-body">
            ${mine.length
              ? html`${pending.length ? html`<ul class="items fi-fam-list">${pending.map(famInvoice)}</ul>` : html`<p class="small muted fi-none">${icon('checkCircle')}Nada em aberto para ${U.firstName(k.name)}.</p>`}
                  ${paid.length ? html`<h3 class="fi-sub">Pagas</h3><ul class="items fi-fam-list">${paidShown.map(famInvoice)}</ul>${paid.length > 3 ? html`<button type="button" class="btn sm ghost" data-fi-allpaid="${k.id}">${showAll ? 'Mostrar menos' : `Ver todas as pagas (${paid.length})`}</button>` : ''}` : ''}`
              : html`<p class="muted small">Nenhuma cobrança neste ano.</p>`}
          </div>
        </section>`;
      })}
      <p class="small muted fi-fam-foot">${icon('info')} Mensalidade com vencimento no dia ${s.dueDay || 10}.${Number(s.lateFine) || Number(s.lateInterest) ? ` Depois do vencimento: multa de ${U.num(Number(s.lateFine) || 0, 0)}% e juros de ${U.num(Number(s.lateInterest) || 0, 0)}% ao mês.` : ''} Dúvidas: fale com a secretaria${s.phone ? ` (${s.phone})` : ''}.</p>`;
  };
  const mountFamily = (el) => {
    el.addEventListener('click', (e) => {
      if (handleClick(e)) return;
      if (e.target.closest('[data-fi-pix]')) return UI.copy(S().pixKey, 'Chave Pix copiada. Cole no aplicativo do banco.');
      if (e.target.closest('[data-fi-proof]')) {
        const kids = myPayingChildren();
        const k = kids.find((x) => Store.state.invoices.some((i) => i.studentId === x.id && !i.paidAt)) || kids[0];
        if (typeof Actions.novaMensagem === 'function' && k) Actions.novaMensagem({ studentId: k.id, kind: 'recado' });
        return;
      }
      const all = e.target.closest('[data-fi-allpaid]');
      if (all) {
        const fp = famPS();
        fp.showPaid[all.dataset.fiAllpaid] = !fp.showPaid[all.dataset.fiAllpaid];
        App.render();
      }
    });
  };

  // =====================================================================
  // Aba "Financeiro" da ficha do aluno
  // =====================================================================
  const olderCache = new Map(); // studentId → {loading, items, error}
  const renderStudentTab = (s) => {
    const T = today();
    const list = Q.studentInvoices(s.id);
    const ids = new Set(list.map((i) => i.id));
    const older = (olderCache.get(s.id) || {}).items || [];
    const extra = older.filter((i) => !ids.has(i.id));
    const sum = summary(list.filter((i) => !i.paidAt), T);
    const fee = s.fee != null ? Q.netFee(s) : null;
    const gs = payers(s);
    const lateList = list.filter((i) => Q.invoiceStatus(i, T) === 'atrasado').sort((a, b) => a.due.localeCompare(b.due));
    const openList = list.filter((i) => !i.paidAt).sort((a, b) => a.due.localeCompare(b.due));
    const msgList = lateList.length ? lateList : openList.slice(0, 1);
    const cache = olderCache.get(s.id) || {};
    return html`<div class="fi-stab">
      <div class="fi-sgrid">
        <div class="card kpi"><span class="kpi-label">${icon('wallet')}Mensalidade</span><span class="kpi-value">${fee != null ? U.money(fee) : '—'}</span><span class="kpi-foot">${fee == null ? 'Sem acesso ao valor' : s.discount ? `${U.num(s.discount, s.discount % 1 ? 1 : 0)}% de desconto sobre ${U.money(s.fee)}` : fee ? `vence todo dia ${S().dueDay || 10}` : 'bolsa integral ou sem valor'}</span></div>
        <div class="card kpi"><span class="kpi-label">${icon('clock')}A vencer</span><span class="kpi-value">${U.money(sum.open)}</span><span class="kpi-foot">${sum.nOpen ? U.plural(sum.nOpen, 'cobrança', 'cobranças') : 'nada a vencer'}</span></div>
        <div class="card kpi ${sum.nLate ? 'fi-kpi-bad' : ''}"><span class="kpi-label">${icon('alert')}Atrasado</span><span class="kpi-value ${sum.nLate ? 'fi-bad' : ''}">${U.money(sum.lateDue)}</span><span class="kpi-foot">${sum.nLate ? `${U.plural(sum.nLate, 'cobrança', 'cobranças')} · com multa e juros` : 'em dia'}</span></div>
      </div>
      <section class="card"><div class="card-head"><h2>${icon('users')}${gs.length > 1 ? 'Responsáveis financeiros' : 'Responsável financeiro'}</h2></div>
        <div class="card-body">${gs.length
          ? html`<ul class="items">${gs.map((g) => html`<li>${UI.avatar(g.name, 'sm')}<div class="grow"><b>${g.name}</b><div class="person-sub">${g.relation || 'Responsável'}${g.phone ? ` · ${g.phone}` : ''}${g.email ? ` · ${g.email}` : ''}${g.bloqueado ? ' · acesso bloqueado' : ''}</div></div>
              ${g.phone && msgList.length ? html`<a class="btn sm" href="${U.whatsappLink(g.phone, reminderText(s, msgList))}" target="_blank" rel="noopener noreferrer">${icon('message')}<span>${lateList.length ? 'Lembrar do atraso' : 'Lembrar do vencimento'}</span></a>` : ''}</li>`)}</ul>
            ${UI.hidden(s, 'guardians.contatos') ? html`<p class="small muted">${UI.noAccess('Contatos visíveis só para quem tem acesso a contatos')}</p>` : ''}`
          : html`<p class="small muted">Nenhum responsável marcado como financeiro na ficha.${can('alunos.cadastrar') ? ' Edite os responsáveis em “Dados e família”.' : ''}</p>`}</div></section>
      <section class="card">
        <div class="card-head"><h2>${icon('list')}Cobranças de ${Q.year()}</h2>
          ${canManage() && s.status === 'ativo' ? html`<button type="button" class="btn sm" data-fi-snew>${icon('plus')}Cobrança avulsa</button>` : ''}</div>
        ${list.length ? table(list, { student: false }) : html`<div class="card-body"><p class="muted small">Nenhuma cobrança neste ano.</p></div>`}
        ${extra.length ? html`<h3 class="fi-sub fi-sub-pad">Anos anteriores</h3>${table(extra.sort((a, b) => b.due.localeCompare(a.due)), { student: false })}` : ''}
        <div class="fi-more">${cache.done
          ? html`<span class="small muted">${extra.length ? 'Histórico carregado.' : 'Não há cobranças de anos anteriores.'}</span>`
          : html`<button type="button" class="btn ghost" data-fi-older ${cache.loading ? raw('disabled') : ''}>${icon('history')}Ver anos anteriores</button>`}</div>
      </section>
    </div>`;
  };
  const mountStudentTab = (el, s) => {
    el.addEventListener('click', async (e) => {
      if (handleClick(e)) return;
      if (e.target.closest('[data-fi-snew]')) return newCharge({ studentId: s.id });
      const b = e.target.closest('[data-fi-older]');
      if (!b) return;
      olderCache.set(s.id, { loading: true });
      b.disabled = true;
      b.classList.add('loading');
      try {
        const r = await Api.history('invoices', { studentId: s.id, before: `${Q.year()}-01-01`, limit: 200 });
        olderCache.set(s.id, { done: true, items: (r.items || []).map((x) => x.value) });
      } catch (err) {
        olderCache.delete(s.id);
        UI.errorToast(err);
      }
      App.render();
    });
  };

  // =====================================================================
  // Registro
  // =====================================================================
  App.page({
    id: 'financeiro',
    label: 'Financeiro',
    icon: 'wallet',
    group: 'Gestão',
    order: 10,
    perm: 'financeiro.ver',
    when: () => Q.chargesFees(),
    keys: 'mensalidades pagamentos cobranças inadimplência boleto pix recibo',
    badge: () => {
      const n = lateStudentCount();
      return n ? { n, tone: 'bad', title: `${n} ${n === 1 ? 'aluno' : 'alunos'} com pagamento atrasado` } : null;
    },
    title: () => 'Financeiro',
    render: renderStaff,
    mount: mountStaff,
  });

  App.page({
    id: 'financeiro',
    label: 'Mensalidades',
    icon: 'wallet',
    family: true,
    order: 50,
    when: () => Q.chargesFees() && myPayingChildren().length > 0,
    keys: 'pagamento boleto pix recibo',
    badge: () => {
      const T = today();
      const kids = new Set(myPayingChildren().map((k) => k.id));
      const n = Store.state.invoices.filter((i) => kids.has(i.studentId) && !i.paidAt && i.due < T).length;
      return n ? { n, tone: 'bad', title: `${n} ${n === 1 ? 'mensalidade atrasada' : 'mensalidades atrasadas'}` } : null;
    },
    title: () => 'Mensalidades',
    render: renderFamily,
    mount: mountFamily,
  });

  App.studentTab({
    id: 'financeiro',
    label: 'Financeiro',
    order: 70,
    perm: 'financeiro.ver',
    when: () => Q.chargesFees(),
    badge: (s) => {
      const T = today();
      const n = Q.studentInvoices(s.id).filter((i) => !i.paidAt && i.due < T).length;
      return n ? { n, tone: 'bad', title: `${n} ${n === 1 ? 'cobrança atrasada' : 'cobranças atrasadas'}` } : null;
    },
    render: renderStudentTab,
    mount: mountStudentTab,
  });

  App.widget({
    id: 'financeiro-mes',
    order: 35,
    size: 'half',
    perm: 'financeiro.ver',
    when: () => Q.chargesFees(),
    render() {
      const T = today();
      const m = T.slice(0, 7);
      const sum = summary(monthInvoices(m), T);
      const nDebt = lateStudentCount();
      const debtTotal = round2(U.sum(Store.state.invoices.filter((i) => !i.paidAt && i.due < T).map((i) => Q.amountDue(i, T))));
      const miss = canGenerate() ? missingFor(m) : [];
      return html`<section class="card fi-widget">
        <div class="card-head"><h2>${icon('wallet')}Mensalidades de ${U.monthName(m)}</h2><a class="sub" href="#financeiro">Abrir financeiro</a></div>
        <div class="card-body">
          ${sum.count
            ? html`<div class="fi-w-top"><div><span class="small muted">Recebido</span><b class="fi-w-big">${U.money(sum.received)}</b><span class="small muted">de ${U.money(sum.expected)} previstos</span></div><b class="fi-w-pct">${U.pct(sum.pct)}</b></div>
                ${UI.meter(Math.min(100, sum.pct), sum.pct >= 85 ? 'ok' : '')}
                <ul class="fi-w-stats">
                  <li><span class="small muted">A vencer</span><b>${U.money(sum.open)}</b><span class="small muted">${U.plural(sum.nOpen, 'cobrança', 'cobranças')}</span></li>
                  <li class="${nDebt ? 'is-bad' : ''}"><span class="small muted">Em atraso (todos os meses)</span><b>${U.money(debtTotal)}</b><span class="small muted">${U.plural(nDebt, 'aluno', 'alunos')}</span></li>
                </ul>`
            : html`<p class="small muted">Nenhuma cobrança em ${U.monthName(m)} ainda.</p>`}
          ${miss.length ? html`<div class="notice fi-w-notice">${icon('info')}<span class="grow small">${U.plural(miss.length, 'aluno sem', 'alunos sem')} a mensalidade de ${U.monthName(m)}.</span><button type="button" class="btn sm primary" data-fi-wgen="${m}">Gerar</button></div>` : ''}
          <div class="btn-row fi-w-btns">
            ${canReceive() ? html`<button type="button" class="btn sm primary" data-fi-wquick>${icon('cash')}Registrar pagamento</button>` : ''}
            ${nDebt ? html`<button type="button" class="btn sm" data-fi-wdebt>${icon('alert')}Ver inadimplentes</button>` : ''}
          </div>
        </div>
      </section>`;
    },
    mount(el) {
      el.addEventListener('click', (e) => {
        if (e.target.closest('[data-fi-wquick]')) return quickReceive();
        const g = e.target.closest('[data-fi-wgen]');
        if (g) return generate(g.dataset.fiWgen, g);
        if (e.target.closest('[data-fi-wdebt]')) {
          PS().tab = 'atrasados';
          App.go('financeiro');
        }
      });
    },
  });

  App.action({ id: 'receber-pagamento', label: 'Registrar pagamento', icon: 'cash', order: 50, perm: 'financeiro.receber', when: () => Q.chargesFees(), keys: 'pagamento baixa mensalidade recebimento pix boleto dinheiro', run: () => quickReceive() });
  App.action({ id: 'nova-cobranca', label: 'Lançar cobrança avulsa', icon: 'wallet', order: 52, perm: 'financeiro.gerenciar', when: () => Q.chargesFees(), keys: 'cobrança avulsa uniforme material passeio taxa', run: () => newCharge({}) });
  App.action({ id: 'gerar-mensalidades', label: 'Gerar mensalidades do mês', icon: 'repeat', order: 54, perm: 'financeiro.gerenciar', when: () => Q.chargesFees() && Store.me.scope === 'todas', keys: 'gerar mensalidades mês cobrança', run: () => generateChooser() });

  Actions.receber = (invoiceId) => (invoiceId ? receive(invoiceId) : quickReceive());
  Actions.gerarMensalidades = (month) => (month ? generate(month) : generateChooser());
  Actions.novaCobranca = (opts = {}) => newCharge(opts);
  Actions.reciboPagamento = (invoiceId) => receipt(invoiceId);
})();
