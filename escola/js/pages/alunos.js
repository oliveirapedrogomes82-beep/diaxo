'use strict';
/* Alunos: lista com filtros, ficha completa do aluno e edição. */
const StudentForm = {
  student: (opts = {}) => [
    { name: 'name', label: 'Nome completo', required: true, full: true, placeholder: 'Ex.: Ana Clara Souza', autocomplete: 'off' },
    { name: 'birth', label: 'Data de nascimento', type: 'date', required: true, check: (v) => (v && v > U.today() ? 'A data não pode estar no futuro.' : '') },
    { name: 'gender', label: 'Sexo', type: 'select', options: [['F', 'Feminino'], ['M', 'Masculino'], ['', 'Prefiro não informar']] },
    { name: 'cpf', label: 'CPF do aluno', mask: 'cpf', hint: 'Opcional.' },
    ...(opts.withClass
      ? [
          { name: 'classId', label: 'Turma', type: 'select', options: [['', 'Sem turma'], ...Q.classes().map((c) => [c.id, `${c.name} · ${c.shift}`])] },
          { name: 'status', label: 'Situação da matrícula', type: 'select', options: [['ativo', 'Ativa'], ['trancado', 'Trancada'], ['transferido', 'Transferido (saiu da escola)']] },
        ]
      : []),
    { name: 'health', label: 'Saúde e alergias', type: 'textarea', rows: 2, full: true, placeholder: 'Ex.: alergia a amendoim, usa bombinha para asma', hint: 'Aparece em destaque na ficha do aluno.' },
  ],
  guardian: () => [
    { name: 'guardian.name', label: 'Nome do responsável', required: true, full: true },
    { name: 'guardian.relation', label: 'Parentesco', type: 'select', options: ['Mãe', 'Pai', 'Avó', 'Avô', 'Tia', 'Tio', 'Irmã(o)', 'Responsável legal'].map((x) => [x, x]) },
    { name: 'guardian.phone', label: 'Celular / WhatsApp', type: 'tel', required: true, placeholder: '(11) 98765-4321' },
    { name: 'guardian.email', label: 'E-mail', type: 'email', full: true, placeholder: 'nome@email.com' },
    { name: 'address', label: 'Endereço', full: true, placeholder: 'Rua, número — bairro' },
  ],
  finance: () => [
    { name: 'fee', label: 'Mensalidade (cheia)', type: 'money', min: 0 },
    { name: 'discount', label: 'Desconto (%)', type: 'number', min: 0, max: 100, hint: 'Bolsa ou desconto de irmãos, por exemplo.' },
  ],
};

Pages.alunos = {
  title: 'Alunos',
  state() {
    return (View.alunos = View.alunos || { q: '', classId: '', status: 'ativo', sort: 'nome' });
  },
  filtered() {
    const v = this.state();
    let list = Q.students({ classId: v.classId || null, status: v.status }).filter((a) =>
      U.matches(v.q, a.name, a.enrollment, a.guardian?.name, a.guardian?.phone, Q.klass(a.classId)?.name),
    );
    const rows = list.map((a) => ({ a, att: Q.studentAttendance(a.id).rate, avg: Q.studentAvg(a.id), fin: Q.studentFinance(a.id) }));
    if (v.sort === 'turma') rows.sort(U.by((r) => (Q.klass(r.a.classId)?.name || '~') + r.a.name));
    else if (v.sort === 'freq') rows.sort(U.by((r) => r.att ?? 999));
    else if (v.sort === 'media') rows.sort(U.by((r) => r.avg ?? 999));
    else if (v.sort === 'debito') rows.sort((x, y) => y.fin.overdueTotal - x.fin.overdueTotal);
    return rows;
  },
  rowsHTML(rows) {
    if (!rows.length) return '';
    return rows
      .map(({ a, att, avg, fin }) => {
        const c = Q.klass(a.classId);
        return `<tr class="clickable" data-go="${a.id}">
          <td class="first"><div class="person">${UI.avatar(a.name)}<div><a class="person-name" href="#alunos/${a.id}">${U.esc(a.name)}</a><div class="person-sub">Matrícula ${U.esc(a.enrollment)}${a.status !== 'ativo' ? ' · ' + a.status : ''}${a.health ? ' · ' + icon('heart') : ''}</div></div></div></td>
          <td data-l="Turma:">${c ? U.esc(c.name) : '<span class="muted">Sem turma</span>'}</td>
          <td class="hide-sm"><div class="person-name" style="font-weight:500">${U.esc(a.guardian?.name || '—')}</div><div class="person-sub">${U.esc(a.guardian?.phone || '')}</div></td>
          <td class="num" data-l="Freq.:"><div class="mini-bar">${att == null ? '<span class="muted">—</span>' : `${UI.meter(att, UI.attTone(att))}<span>${U.pct(att)}</span>`}</div></td>
          <td class="num ${UI.gradeCls(avg)}" data-l="Média:">${U.num(avg)}</td>
          <td class="end">${fin.overdue.length ? UI.pill(`${fin.overdue.length} atrasada${fin.overdue.length > 1 ? 's' : ''}`, 'bad') : UI.pill('Em dia', 'ok')}</td>
        </tr>`;
      })
      .join('');
  },
  render(params) {
    if (params[0]) return Pages.aluno.render(params);
    const v = this.state();
    const rows = this.filtered();
    const total = Q.students().length;
    const statusSeg = UI.seg([['ativo', 'Ativos'], ['trancado', 'Trancados'], ['transferido', 'Transferidos'], ['todos', 'Todos']], v.status, 'data-status');
    return `
      <div class="page-head">
        <div><h1>Alunos</h1><p class="lead">${U.plural(total, 'aluno ativo', 'alunos ativos')} em ${U.plural(Store.state.classes.length, 'turma', 'turmas')}. Clique em um aluno para ver a ficha completa.</p></div>
        <div class="btn-row">
          <button class="btn" data-x="export">${icon('download')}Exportar</button>
          <button class="btn primary" data-x="new">${icon('userPlus')}Matricular aluno</button>
        </div>
      </div>
      <div class="toolbar">
        <label class="search-box"><span class="sr-only">Buscar aluno</span>${icon('search')}<input class="input" id="q-alunos" type="search" placeholder="Nome, matrícula, responsável ou telefone" value="${U.esc(v.q)}"></label>
        <select class="input" id="f-turma" style="width:auto" aria-label="Filtrar por turma">
          <option value="">Todas as turmas</option>${Q.classes().map((c) => `<option value="${c.id}" ${v.classId === c.id ? 'selected' : ''}>${U.esc(c.name)}</option>`).join('')}
        </select>
        ${statusSeg}
        <select class="input" id="f-sort" style="width:auto" aria-label="Ordenar">
          ${[['nome', 'Ordem: nome'], ['turma', 'Ordem: turma'], ['freq', 'Menor frequência'], ['media', 'Menor média'], ['debito', 'Maior débito']].map(([k, l]) => `<option value="${k}" ${v.sort === k ? 'selected' : ''}>${l}</option>`).join('')}
        </select>
      </div>
      <p class="result-count" id="count-alunos" aria-live="polite">${U.plural(rows.length, 'aluno encontrado', 'alunos encontrados')}</p>
      <div class="card">
        <div class="table-wrap">
          <table class="table responsive">
            <thead><tr><th>Aluno</th><th>Turma</th><th class="hide-sm">Responsável</th><th class="num">Frequência</th><th class="num">Média</th><th>Financeiro</th></tr></thead>
            <tbody id="rows-alunos">${this.rowsHTML(rows)}</tbody>
          </table>
          <div id="empty-alunos" ${rows.length ? 'hidden' : ''}>${UI.empty({ icon: 'search', title: 'Nenhum aluno encontrado', text: 'Confira a busca ou os filtros. Se for um aluno novo, faça a matrícula.', action: `<button class="btn" data-x="clear">Limpar filtros</button><button class="btn primary" data-x="new">Matricular aluno</button>` })}</div>
        </div>
      </div>`;
  },
  mount(el, params) {
    if (params[0]) return Pages.aluno.mount(el, params);
    const v = this.state();
    const refresh = () => {
      const rows = this.filtered();
      UI.$('#rows-alunos', el).innerHTML = this.rowsHTML(rows);
      UI.$('#count-alunos', el).textContent = U.plural(rows.length, 'aluno encontrado', 'alunos encontrados');
      UI.$('#empty-alunos', el).hidden = rows.length > 0;
    };
    UI.$('#q-alunos', el).addEventListener('input', U.debounce((e) => {
      v.q = e.target.value;
      refresh();
    }, 120));
    UI.$('#f-turma', el).addEventListener('change', (e) => {
      v.classId = e.target.value;
      refresh();
    });
    UI.$('#f-sort', el).addEventListener('change', (e) => {
      v.sort = e.target.value;
      refresh();
    });
    el.addEventListener('click', (e) => {
      const st = e.target.closest('[data-status]');
      if (st) {
        v.status = st.dataset.status;
        UI.$$('[data-status]', el).forEach((b) => b.setAttribute('aria-pressed', String(b === st)));
        refresh();
        return;
      }
      const x = e.target.closest('[data-x]');
      if (x) {
        if (x.dataset.x === 'new') Actions.matricular({ classId: v.classId || null });
        else if (x.dataset.x === 'clear') {
          Object.assign(v, { q: '', classId: '', status: 'ativo' });
          App.render();
        } else if (x.dataset.x === 'export') {
          const rows = this.filtered();
          const table = [
            ['Matrícula', 'Nome', 'Nascimento', 'Turma', 'Situação', 'Responsável', 'Parentesco', 'Telefone', 'E-mail', 'Endereço', 'Frequência (%)', 'Média'],
            ...rows.map(({ a, att, avg }) => [a.enrollment, a.name, U.fmtDate(a.birth), Q.klass(a.classId)?.name || '', a.status, a.guardian?.name, a.guardian?.relation, a.guardian?.phone, a.guardian?.email, a.address, att == null ? '' : Math.round(att), avg == null ? '' : U.num(avg)]),
          ];
          Actions.exportTable(x, 'alunos', table);
        }
        return;
      }
      const row = e.target.closest('tr[data-go]');
      if (row && !e.target.closest('a')) App.go('alunos/' + row.dataset.go);
    });
  },
};

/* ---------- ficha do aluno ---------- */
Pages.aluno = {
  render([id]) {
    const a = Q.student(id);
    if (!a)
      return UI.empty({ icon: 'user', title: 'Aluno não encontrado', text: 'Ele pode ter sido excluído.', action: '<a class="btn primary" href="#alunos">Ver todos os alunos</a>' });
    const v = (View.aluno = View.aluno && View.aluno.id === id ? View.aluno : { id, tab: 'geral' });
    const c = Q.klass(a.classId);
    const att = Q.studentAttendance(a.id);
    const avg = Q.studentAvg(a.id);
    const fin = Q.studentFinance(a.id);
    const s = Q.settings();
    const statusPill = a.status === 'ativo' ? UI.pill('Matrícula ativa', 'ok') : a.status === 'trancado' ? UI.pill('Matrícula trancada', 'warn') : UI.pill('Transferido', '');
    const risk = (avg != null && avg < s.passing) || (att.rate != null && att.rate < s.minAttendance);

    const tabs = UI.tabs(
      [
        ['geral', 'Visão geral'],
        ['notas', 'Notas'],
        ['frequencia', 'Frequência', att.absent ? ` <span class="badge">${att.absent}</span>` : ''],
        ['financeiro', 'Financeiro', fin.overdue.length ? ` <span class="badge bad">${fin.overdue.length}</span>` : ''],
      ],
      v.tab,
    );

    return `
      <nav class="crumbs" aria-label="Caminho"><a href="#alunos">Alunos</a>${icon('chevronRight')}<span>${U.esc(U.shortName(a.name))}</span></nav>
      <section class="card">
        <div class="profile-head">
          ${UI.avatar(a.name, 'lg')}
          <div class="grow">
            <h1>${U.esc(a.name)}</h1>
            <div class="meta-row">
              <span>Matrícula <b class="num">${U.esc(a.enrollment)}</b></span>
              <span>${icon('layers')}${c ? `<a href="#turmas/${c.id}">${U.esc(c.name)}</a> · ${U.esc(c.shift)}` : 'Sem turma'}</span>
              ${a.birth ? `<span>${icon('cake')}${U.age(a.birth)} anos</span>` : ''}
              ${statusPill}
              ${risk && a.status === 'ativo' ? UI.pill('Precisa de atenção', 'warn') : ''}
            </div>
          </div>
          <div class="btn-row">
            <button class="btn" data-x="edit">${icon('pencil')}Editar</button>
            <a class="btn" href="#relatorios/boletim/${a.id}">${icon('file')}Boletim</a>
            <button class="icon-btn" data-x="more" aria-label="Mais ações">${icon('dots')}</button>
          </div>
        </div>
        ${a.health ? `<div class="notice warn" style="margin:0 20px 18px">${icon('heart')}<span class="grow"><b>Saúde:</b> ${U.esc(a.health)}</span></div>` : ''}
      </section>
      ${tabs}
      <div id="aluno-tab">${this[v.tab] ? this[v.tab](a, { att, avg, fin }) : ''}</div>`;
  },

  geral(a, { att, avg, fin }) {
    const g = a.guardian || {};
    const wa = g.phone ? U.whatsappLink(g.phone, `Olá, ${U.firstName(g.name)}! Aqui é da ${Q.settings().schoolName}, sobre ${U.firstName(a.name)}.`) : '';
    return `
      <div class="kpis" style="margin-bottom:22px">
        <div class="card kpi"><span class="kpi-label">${icon('grade')}Média geral</span><span class="kpi-value ${UI.gradeCls(avg)}">${U.num(avg)}</span><span class="kpi-foot">${Q.situation(avg).label}</span></div>
        <div class="card kpi"><span class="kpi-label">${icon('checkSquare')}Frequência</span><span class="kpi-value">${U.pct(att.rate)}</span>${UI.meter(att.rate, UI.attTone(att.rate))}<span class="kpi-foot">${U.plural(att.absent, 'falta', 'faltas')} em ${U.plural(att.days, 'dia', 'dias')}</span></div>
        <div class="card kpi"><span class="kpi-label">${icon('wallet')}Financeiro</span><span class="kpi-value" style="font-size:1.3rem">${fin.overdue.length ? `<span style="color:var(--bad)">${U.money(fin.overdueTotal)}</span>` : 'Em dia'}</span><span class="kpi-foot">${fin.overdue.length ? U.plural(fin.overdue.length, 'mensalidade atrasada', 'mensalidades atrasadas') : `Mensalidade de ${U.money(Q.netFee(a))}`}</span></div>
        <div class="card kpi"><span class="kpi-label">${icon('calendar')}Na escola desde</span><span class="kpi-value" style="font-size:1.3rem">${U.fmtDate(a.joinedAt)}</span><span class="kpi-foot">&nbsp;</span></div>
      </div>
      <div class="grid-2" style="grid-template-columns:repeat(auto-fit,minmax(300px,1fr))">
        <section class="card"><div class="card-head"><h2>Dados do aluno</h2></div><div class="card-body">
          <dl class="kv">
            <dt>Nascimento</dt><dd>${U.fmtDate(a.birth)}${a.birth ? ` <span class="muted">(${U.age(a.birth)} anos)</span>` : ''}</dd>
            <dt>Sexo</dt><dd>${{ F: 'Feminino', M: 'Masculino' }[a.gender] || '—'}</dd>
            <dt>CPF</dt><dd>${U.esc(a.cpf || '—')}</dd>
            <dt>Endereço</dt><dd>${U.esc(a.address || '—')}</dd>
            <dt>Observações</dt><dd>${U.esc(a.notes || '—')}</dd>
          </dl></div></section>
        <section class="card"><div class="card-head"><h2>Responsável</h2></div><div class="card-body">
          <dl class="kv">
            <dt>Nome</dt><dd>${U.esc(g.name || '—')} ${g.relation ? `<span class="muted">(${U.esc(g.relation)})</span>` : ''}</dd>
            <dt>Celular</dt><dd>${g.phone ? `<span class="num">${U.esc(g.phone)}</span><button class="copy-btn" data-copy="${U.esc(g.phone)}" aria-label="Copiar telefone">${icon('copy')}</button><a class="btn sm" href="${wa}" target="_blank" rel="noopener">${icon('message')}WhatsApp</a>` : '—'}</dd>
            <dt>E-mail</dt><dd>${g.email ? `${U.esc(g.email)}<button class="copy-btn" data-copy="${U.esc(g.email)}" aria-label="Copiar e-mail">${icon('copy')}</button>` : '—'}</dd>
          </dl></div></section>
      </div>`;
  },

  notas(a) {
    const subs = Q.classSubjects(a.classId);
    if (!subs.length) return UI.empty({ icon: 'grade', title: 'Sem disciplinas', text: 'Coloque o aluno em uma turma para lançar notas.' });
    return `<section class="card"><div class="table-wrap"><table class="table">
      <thead><tr><th>Disciplina</th>${[1, 2, 3, 4].map((t) => `<th class="num">${t}º bim.</th>`).join('')}<th class="num">Média</th><th>Situação</th></tr></thead>
      <tbody>${subs
        .map((s) => {
          const avg = Q.subjectAvg(a.id, s.id);
          const sit = Q.situation(avg, Q.termsWithGrade(a.id, s.id) === 4);
          return `<tr><td><span class="subject-tag"><span class="swatch c${s.color}"></span>${U.esc(s.name)}</span></td>
            ${[1, 2, 3, 4].map((t) => {
              const g = Q.grade(a.id, s.id, t);
              return `<td class="num ${UI.gradeCls(g)}">${U.num(g)}</td>`;
            }).join('')}
            <td class="num strong ${UI.gradeCls(avg)}">${U.num(avg)}</td><td>${sit.tone ? UI.pill(sit.label, sit.tone) : '<span class="muted small">—</span>'}</td></tr>`;
        })
        .join('')}</tbody></table></div></section>
      <p class="small muted">Média para aprovação: ${U.num(Q.settings().passing)}. Para lançar ou corrigir notas, use a tela <a href="#notas">Notas</a>.</p>`;
  },

  frequencia(a, { att }) {
    return `
      <div class="kpis" style="margin-bottom:22px">
        <div class="card kpi"><span class="kpi-label">Frequência</span><span class="kpi-value">${U.pct(att.rate)}</span>${UI.meter(att.rate, UI.attTone(att.rate))}<span class="kpi-foot">mínimo exigido: ${Q.settings().minAttendance}%</span></div>
        <div class="card kpi"><span class="kpi-label"><span class="dot-ok"></span>Presenças</span><span class="kpi-value">${att.present}</span></div>
        <div class="card kpi"><span class="kpi-label"><span class="dot-bad"></span>Faltas</span><span class="kpi-value">${att.absent}</span></div>
        <div class="card kpi"><span class="kpi-label"><span class="dot-warn"></span>Justificadas</span><span class="kpi-value">${att.justified}</span><span class="kpi-foot">não reduzem a frequência</span></div>
      </div>
      <section class="card"><div class="card-head"><h2>Faltas registradas</h2><span class="sub">Justifique quando a família apresentar atestado ou motivo.</span></div>
      <div class="card-body">${
        att.absences.length
          ? `<ul class="items">${att.absences
              .map(
                (x) => `<li><span class="date-chip"><b>${U.parse(x.date).getDate()}</b><span>${U.MONTHS_SHORT[U.parse(x.date).getMonth()]}</span></span>
                <div class="grow"><div class="strong">${U.esc(U.fmtDateLong(x.date))}</div><div class="small muted">${x.mark === 'J' ? 'Falta justificada' : 'Falta'}</div></div>
                ${x.mark === 'F' ? `<button class="btn sm" data-just="${x.date}" data-m="J">Justificar</button>` : `<button class="btn sm ghost" data-just="${x.date}" data-m="F">Tirar justificativa</button>`}</li>`,
              )
              .join('')}</ul>`
          : UI.empty({ icon: 'checkCircle', title: 'Nenhuma falta', text: 'Este aluno esteve presente em todas as chamadas registradas.' })
      }</div></section>`;
  },

  financeiro(a) {
    const inv = Q.studentInvoices(a.id);
    return `
      <div class="toolbar"><p class="grow muted">Mensalidade: <b>${U.money(Q.netFee(a))}</b>${a.discount ? ` (${a.discount}% de desconto sobre ${U.money(a.fee)})` : ''}</p>
        <button class="btn" data-x="charge">${icon('plus')}Nova cobrança</button></div>
      <section class="card" style="margin-top:14px">${
        inv.length
          ? `<div class="table-wrap"><table class="table responsive"><thead><tr><th>Descrição</th><th>Vencimento</th><th class="num">Valor</th><th>Situação</th><th></th></tr></thead><tbody>
          ${inv.map((i) => Pages.financeiro.invoiceRow(i, { showStudent: false })).join('')}</tbody></table></div>`
          : UI.empty({ icon: 'wallet', title: 'Nenhuma cobrança', text: 'As mensalidades geradas para este aluno aparecem aqui.' })
      }</section>`;
  },

  mount(el, [id]) {
    const a = Q.student(id);
    if (!a) return;
    const v = View.aluno;
    el.addEventListener('click', (e) => {
      const tab = e.target.closest('[data-tab]');
      if (tab) {
        v.tab = tab.dataset.tab;
        App.render();
        return;
      }
      const cp = e.target.closest('[data-copy]');
      if (cp) return UI.copy(cp.dataset.copy);
      const j = e.target.closest('[data-just]');
      if (j) {
        const key = Q.akey(a.classId, j.dataset.just);
        Store.update((s) => {
          if (s.attendance[key]) s.attendance[key][a.id] = j.dataset.m;
        }, { log: `Falta de ${U.shortName(a.name)} em ${U.fmtDate(j.dataset.just)} ${j.dataset.m === 'J' ? 'justificada' : 'sem justificativa'}`, icon: 'checkSquare' });
        return;
      }
      if (Pages.financeiro.handleInvoiceClick(e)) return;
      const x = e.target.closest('[data-x]');
      if (!x) return;
      if (x.dataset.x === 'edit') Actions.editarAluno(a.id);
      else if (x.dataset.x === 'charge') Actions.novaCobranca({ studentId: a.id });
      else if (x.dataset.x === 'more') {
        UI.menu(x, [
          { label: 'Trocar de turma', icon: 'swap', fn: () => Actions.trocarTurma(a.id) },
          a.status === 'ativo'
            ? { label: 'Trancar matrícula', icon: 'lock', fn: () => Actions.mudarSituacao(a.id, 'trancado') }
            : { label: 'Reativar matrícula', icon: 'refresh', fn: () => Actions.mudarSituacao(a.id, 'ativo') },
          a.status !== 'transferido' ? { label: 'Registrar transferência', icon: 'arrowRight', fn: () => Actions.mudarSituacao(a.id, 'transferido') } : null,
          '-',
          { label: 'Excluir cadastro', icon: 'trash', danger: true, fn: () => Actions.excluirAluno(a.id) },
        ].filter(Boolean));
      }
    });
  },
};

/* ---------- ações sobre alunos ---------- */
Actions.editarAluno = (id) => {
  const a = Q.student(id);
  if (!a) return;
  const defs = [
    ...StudentForm.student({ withClass: true }),
    { name: 'notes', label: 'Observações', type: 'textarea', rows: 2, full: true },
    '<h3 class="form-h">Responsável</h3>',
    ...StudentForm.guardian(),
    '<h3 class="form-h">Financeiro</h3>',
    ...StudentForm.finance(),
  ];
  UI.formDrawer({
    title: 'Editar aluno',
    sub: `Matrícula ${a.enrollment}`,
    defs,
    values: a,
    submitLabel: 'Salvar alterações',
    onSubmit(d) {
      Store.update(
        (s) => {
          const t = s.students.find((x) => x.id === id);
          Object.assign(t, d, { guardian: { ...t.guardian, ...d.guardian }, fee: d.fee ?? t.fee, discount: Number(d.discount) || 0 });
        },
        { log: `Cadastro de ${U.shortName(d.name)} atualizado`, icon: 'pencil' },
      );
      UI.toast('Alterações salvas');
    },
  });
};

Actions.trocarTurma = (id) => {
  const a = Q.student(id);
  const cls = Q.classes();
  UI.modal({
    title: 'Trocar de turma',
    sub: `${U.esc(a.name)} está em ${U.esc(Q.klass(a.classId)?.name || 'nenhuma turma')}.`,
    body: `<div class="pick-grid" role="radiogroup">${cls
      .map((c) => {
        const n = Q.roster(c.id).length;
        return `<label class="pick"><input type="radio" name="tc" value="${c.id}" ${c.id === a.classId ? 'checked' : ''}><strong>${U.esc(c.name)}</strong><span>${U.esc(c.shift)} · ${n}/${c.capacity || '∞'} alunos</span></label>`;
      })
      .join('')}</div><p class="small muted" style="margin-top:14px">As notas já lançadas acompanham o aluno. A frequência passa a contar a partir da nova turma.</p>`,
    foot: '<button class="btn" data-close>Cancelar</button><button class="btn primary" data-ok>Trocar turma</button>',
    onMount(el, api) {
      UI.$('[data-ok]', el).addEventListener('click', () => {
        const to = (UI.$('input[name="tc"]:checked', el) || {}).value;
        if (!to || to === a.classId) return api.close();
        const name = Q.klass(to).name;
        Store.update((s) => (s.students.find((x) => x.id === id).classId = to), { log: `${U.shortName(a.name)} mudou para o ${name}`, icon: 'swap', undo: true });
        api.close();
        UI.undoToast(`${U.firstName(a.name)} agora está no ${name}`);
      });
    },
  });
};

Actions.mudarSituacao = async (id, status) => {
  const a = Q.student(id);
  const txt = {
    trancado: ['Trancar matrícula?', `${a.name} deixa de aparecer na chamada e nas notas. Você pode reativar quando quiser.`, 'Trancar'],
    transferido: ['Registrar transferência?', `${a.name} sai da lista de alunos ativos. O histórico fica guardado.`, 'Registrar'],
    ativo: ['Reativar matrícula?', `${a.name} volta para a chamada e as notas da turma.`, 'Reativar'],
  }[status];
  const ok = await UI.confirm({ title: txt[0], text: U.esc(txt[1]), ok: txt[2] });
  if (!ok) return;
  Store.update((s) => (s.students.find((x) => x.id === id).status = status), { log: `${U.shortName(a.name)}: matrícula ${status === 'ativo' ? 'reativada' : status}`, icon: 'user', undo: true });
  UI.undoToast('Situação da matrícula atualizada');
};

Actions.excluirAluno = async (id) => {
  const a = Q.student(id);
  const ok = await UI.confirm({
    title: 'Excluir este cadastro?',
    text: `Isso apaga ${U.esc(a.name)}, as notas e as cobranças dele. Se o aluno saiu da escola, prefira <b>Registrar transferência</b> para manter o histórico.`,
    ok: 'Excluir',
    danger: true,
  });
  if (!ok) return;
  Store.update(
    (s) => {
      s.students = s.students.filter((x) => x.id !== id);
      s.invoices = s.invoices.filter((i) => i.studentId !== id);
      Object.keys(s.grades).forEach((k) => k.startsWith(id + '|') && delete s.grades[k]);
      Object.values(s.attendance).forEach((m) => delete m[id]);
    },
    { log: `Cadastro de ${U.shortName(a.name)} excluído`, icon: 'trash', undo: true },
  );
  App.go('alunos');
  UI.undoToast(`${U.firstName(a.name)} foi excluído`);
};

/* Exportar tabela: baixar CSV (Excel) ou copiar para colar numa planilha. */
Actions.exportTable = (anchor, name, rows) => {
  const items = [{ label: 'Copiar para planilha', icon: 'copy', fn: () => UI.copy(U.toTSV(rows), 'Tabela copiada. Cole no Excel ou Google Planilhas.') }];
  if (!U.inFrame) items.unshift({ label: 'Baixar planilha (.csv)', icon: 'download', fn: () => U.download(`${name}-${U.today()}.csv`, U.toCSV(rows)) });
  UI.menu(anchor, items);
};
