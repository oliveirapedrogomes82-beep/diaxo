'use strict';
/* Comunicados: avisos para toda a escola ou uma turma, com modelos prontos e envio pelo WhatsApp. */
const NOTICE_TEMPLATES = [
  ['Reunião de pais', 'Reunião de pais e mestres', 'Senhores responsáveis,\n\nConvidamos para a reunião de pais e mestres no dia __/__, às __h, no auditório da escola. Conversaremos sobre o andamento do bimestre e entregaremos os boletins.\n\nContamos com a sua presença.'],
  ['Feriado', 'Não haverá aula', 'Informamos que no dia __/__ não haverá aula por conta do feriado. As atividades retornam normalmente no dia seguinte.'],
  ['Passeio', 'Passeio pedagógico', 'A turma fará um passeio pedagógico no dia __/__. Saída às __h e retorno previsto às __h.\n\nEnviem a autorização assinada até a véspera, junto com lanche e garrafa de água.'],
  ['Mensalidade', 'Lembrete de mensalidade', 'Lembramos que a mensalidade vence todo dia {vencimento}. Pagamentos por Pix e boleto são confirmados no mesmo dia.\n\nEm caso de dúvida, procure a secretaria.'],
  ['Provas', 'Semana de provas', 'Na próxima semana teremos as avaliações do bimestre. Confira o calendário de provas com seu filho e ajude na organização dos estudos.'],
];

Pages.comunicados = {
  title: 'Comunicados',
  render() {
    const v = (View.comunicados = View.comunicados || { audience: '', q: '' });
    const list = Store.state.notices
      .filter((n) => !v.audience || n.audience === v.audience || (v.audience !== 'all' && n.audience === 'all'))
      .filter((n) => U.matches(v.q, n.title, n.body))
      .sort((a, b) => (b.pinned - a.pinned) || (a.date < b.date ? 1 : -1));
    return `
      <div class="page-head">
        <div><h1>Comunicados</h1><p class="lead">Escreva o aviso uma vez e envie pelo WhatsApp ou copie para onde quiser. Fixe os mais importantes no topo.</p></div>
        <button class="btn primary" data-x="new">${icon('plus')}Novo comunicado</button>
      </div>
      <div class="toolbar">
        <label class="search-box" style="max-width:380px"><span class="sr-only">Buscar comunicado</span>${icon('search')}<input class="input" id="q-not" type="search" placeholder="Buscar nos comunicados" value="${U.esc(v.q)}"></label>
        <select class="input" id="f-aud" style="width:auto" aria-label="Filtrar por público"><option value="">Todos os públicos</option><option value="all" ${v.audience === 'all' ? 'selected' : ''}>Só os gerais</option>${Q.classes().map((c) => `<option value="${c.id}" ${v.audience === c.id ? 'selected' : ''}>${U.esc(c.name)}</option>`).join('')}</select>
      </div>
      <div class="stack" style="gap:14px">${
        list.length
          ? list
              .map(
                (n) => `<article class="card notice-card ${n.pinned ? 'pinned' : ''}">
                <div class="notice-meta">${n.pinned ? `<span class="pill mark plain">${icon('pin')}Fixado</span>` : ''}${UI.pill(Q.audienceLabel(n.audience), n.audience === 'all' ? 'info' : '', true)}<span>${U.esc(U.fmtDateLong(n.date, false))} · ${U.esc(n.author || 'Secretaria')}</span></div>
                <h2>${U.esc(n.title)}</h2>
                <div class="body">${U.esc(n.body)}</div>
                <div class="btn-row">
                  <button class="btn sm" data-wa="${n.id}">${icon('message')}Enviar no WhatsApp</button>
                  <button class="btn sm" data-copy-n="${n.id}">${icon('copy')}Copiar texto</button>
                  <span class="grow"></span>
                  <button class="btn sm ghost" data-pin="${n.id}">${icon('pin')}${n.pinned ? 'Desafixar' : 'Fixar'}</button>
                  <button class="icon-btn sm" data-edit="${n.id}" aria-label="Editar comunicado">${icon('pencil')}</button>
                  <button class="icon-btn sm" data-del="${n.id}" aria-label="Excluir comunicado">${icon('trash')}</button>
                </div>
              </article>`,
              )
              .join('')
          : `<section class="card">${UI.empty({ icon: 'megaphone', title: v.q || v.audience ? 'Nenhum comunicado encontrado' : 'Nenhum comunicado ainda', text: 'Use um dos modelos prontos para começar rápido.', action: `<button class="btn primary" data-x="new">Escrever comunicado</button>` })}</section>`
      }</div>`;
  },
  text(n) {
    return `*${n.title}*\n${Q.settings().schoolName}${n.audience !== 'all' ? ' · ' + Q.audienceLabel(n.audience) : ''}\n\n${n.body}`;
  },
  mount(el) {
    const v = View.comunicados;
    const find = (id) => Store.state.notices.find((n) => n.id === id);
    UI.$('#q-not', el).addEventListener('input', U.debounce((e) => {
      v.q = e.target.value;
      App.render();
      const i = UI.$('#q-not');
      i.focus();
      i.setSelectionRange(i.value.length, i.value.length);
    }, 250));
    UI.$('#f-aud', el).addEventListener('change', (e) => {
      v.audience = e.target.value;
      App.render();
    });
    el.addEventListener('click', async (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      const d = b.dataset;
      if (d.x === 'new') return Actions.novoComunicado();
      if (d.wa) return Actions.abrirLink(`https://wa.me/?text=${encodeURIComponent(this.text(find(d.wa)))}`, this.text(find(d.wa)));
      if (d.copyN) return UI.copy(this.text(find(d.copyN)), 'Texto copiado');
      if (d.pin) return Store.update((s) => (s.notices.find((n) => n.id === d.pin).pinned = !find(d.pin).pinned));
      if (d.edit) return Actions.novoComunicado({ id: d.edit });
      if (d.del) {
        const n = find(d.del);
        const ok = await UI.confirm({ title: 'Excluir comunicado?', text: `“${U.esc(n.title)}” será removido.`, ok: 'Excluir', danger: true });
        if (!ok) return;
        Store.update((s) => (s.notices = s.notices.filter((x) => x.id !== n.id)), { log: `Comunicado "${n.title}" excluído`, icon: 'trash', undo: true });
        UI.undoToast('Comunicado excluído');
      }
    });
  },
};

Actions.novoComunicado = ({ id = null } = {}) => {
  const n = id ? Store.state.notices.find((x) => x.id === id) : null;
  const defs = [
    { name: 'title', label: 'Título', required: true, full: true, placeholder: 'Ex.: Reunião de pais e mestres' },
    { name: 'audience', label: 'Para quem', type: 'select', full: true, options: [['all', 'Toda a escola'], ...Q.classes().map((c) => [c.id, `Turma ${c.name}`])] },
    { name: 'body', label: 'Mensagem', type: 'textarea', rows: 8, required: true, full: true, placeholder: 'Escreva o comunicado. Seja direto: o quê, quando, onde e o que a família precisa fazer.' },
    { name: 'pinned', label: 'Fixar no topo da lista', type: 'checkbox', full: true },
  ];
  UI.formDrawer({
    title: n ? 'Editar comunicado' : 'Novo comunicado',
    top: n
      ? ''
      : `<div class="field" style="margin-bottom:18px"><span class="label">Comece por um modelo</span><div class="chips">${NOTICE_TEMPLATES.map((t, i) => `<button type="button" class="chip" data-tpl="${i}">${U.esc(t[0])}</button>`).join('')}</div></div>`,
    defs,
    values: n || { audience: 'all', pinned: false },
    submitLabel: n ? 'Salvar alterações' : 'Publicar comunicado',
    onMount(el) {
      el.addEventListener('click', (e) => {
        const t = e.target.closest('[data-tpl]');
        if (!t) return;
        const [, title, body] = NOTICE_TEMPLATES[Number(t.dataset.tpl)];
        UI.$('#f-title', el).value = title;
        UI.$('#f-body', el).value = body.replace('{vencimento}', Q.settings().dueDay);
        UI.$$('[data-tpl]', el).forEach((b) => b.setAttribute('aria-pressed', String(b === t)));
        const body2 = UI.$('#f-body', el);
        body2.focus();
        body2.dispatchEvent(new Event('input', { bubbles: true }));
        const blank = body2.value.indexOf('__');
        if (blank >= 0) body2.setSelectionRange(blank, blank + 2);
      });
    },
    onSubmit(d) {
      Store.update(
        (s) => {
          if (n) Object.assign(s.notices.find((x) => x.id === id), d);
          else s.notices.push({ id: U.uid(), ...d, date: U.today(), author: 'Secretaria' });
        },
        { log: `Comunicado "${d.title}" ${n ? 'atualizado' : 'publicado'}`, icon: 'megaphone' },
      );
      UI.toast(n ? 'Comunicado atualizado' : 'Comunicado publicado', App.route()[0] === 'comunicados' ? {} : { action: { label: 'Ver', fn: () => App.go('comunicados') } });
    },
  });
};
