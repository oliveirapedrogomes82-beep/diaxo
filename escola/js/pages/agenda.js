'use strict';
/* Agenda: calendário do mês com provas, reuniões, eventos, prazos e feriados nacionais. */
Pages.agenda = {
  title: 'Agenda',
  state() {
    const v = (View.agenda = View.agenda || {});
    v.month = v.month || U.today().slice(0, 7);
    v.sel = v.sel || U.today();
    v.classId = v.classId || '';
    return v;
  },
  visible(list, v) {
    return list.filter((e) => !v.classId || !e.classId || e.classId === v.classId);
  },
  render() {
    const v = this.state();
    const T = U.today();
    const first = U.parse(v.month + '-01');
    let start = U.addDays(v.month + '-01', -first.getDay());
    const lastDay = U.addDays(U.addMonths(v.month, 1) + '-01', -1);
    const end = U.addDays(lastDay, 6 - U.weekday(lastDay));
    const days = [];
    for (let d = start; d <= end; d = U.addDays(d, 1)) days.push(d);
    const types = Q.EVENT_TYPES;
    const selEvents = this.visible(Q.eventsOn(v.sel), v);
    const next = this.visible(Q.upcoming(40), v).filter((e) => e.date >= T).slice(0, 8);

    return `
      <div class="page-head">
        <div><h1>Agenda</h1><p class="lead">Clique em um dia para ver ou marcar eventos. Feriados nacionais já aparecem sozinhos.</p></div>
        <button class="btn primary" data-x="new">${icon('plus')}Novo evento</button>
      </div>
      <div class="toolbar">
        <div class="date-nav">
          <button class="icon-btn" data-month="-1" aria-label="Mês anterior">${icon('chevronLeft')}</button>
          <h2 style="min-width:190px;text-align:center">${U.esc(U.cap(U.fmtMonth(v.month)))}</h2>
          <button class="icon-btn" data-month="1" aria-label="Próximo mês">${icon('chevronRight')}</button>
          <button class="btn sm ghost" data-month="0">Hoje</button>
        </div>
        <span class="grow"></span>
        <select class="input" id="ag-class" style="width:auto" aria-label="Filtrar por turma"><option value="">Todas as turmas</option>${Q.classes().map((c) => `<option value="${c.id}" ${c.id === v.classId ? 'selected' : ''}>${U.esc(c.name)}</option>`).join('')}</select>
      </div>
      <div class="legend">${Object.values(types).map((t) => `<span><span class="ev-dot" style="--c:var(--cat-${t.c})"></span>${t.label}</span>`).join('')}</div>
      <div class="grid-2">
        <section class="card card-pad">
          <div class="cal" role="grid" aria-label="Calendário de ${U.esc(U.fmtMonth(v.month))}">
            ${U.WD_SHORT.map((d) => `<div class="wd" role="columnheader">${d}</div>`).join('')}
            ${days
              .map((d) => {
                const evs = this.visible(Q.eventsOn(d), v);
                const out = d.slice(0, 7) !== v.month;
                const wd = U.weekday(d);
                const hol = evs.some((e) => e.type === 'feriado');
                const cls = ['day', out ? 'out' : '', d === T ? 'today' : '', d === v.sel ? 'sel' : '', wd === 0 || wd === 6 ? 'weekend' : '', hol ? 'holiday' : ''].join(' ');
                return `<button type="button" class="${cls}" data-date="${d}" aria-label="${U.esc(U.fmtDateLong(d))}${evs.length ? ', ' + U.plural(evs.length, 'evento', 'eventos') : ''}" aria-pressed="${d === v.sel}">
                  <span class="dn">${U.parse(d).getDate()}</span>
                  ${evs.slice(0, 2).map((e) => `<span class="ev" style="--c:var(--cat-${(types[e.type] || types.evento).c})">${U.esc(e.title)}</span>`).join('')}
                  ${evs.length > 2 ? `<span class="ev-more">+${evs.length - 2}</span>` : ''}
                  ${evs.length ? `<span class="dots">${evs.slice(0, 3).map((e) => `<span class="ev-dot" style="--c:var(--cat-${(types[e.type] || types.evento).c})"></span>`).join('')}</span>` : ''}
                </button>`;
              })
              .join('')}
          </div>
        </section>
        <div class="stack">
          <section class="card">
            <div class="card-head"><div><h2>${U.esc(U.cap(U.fmtDateLong(v.sel)))}</h2><span class="sub">${U.esc(U.relDay(v.sel))}</span></div>
              <button class="btn sm" data-x="new-day">${icon('plus')}Marcar neste dia</button></div>
            <div class="card-body">${
              selEvents.length
                ? `<ul class="items">${selEvents.map((e) => this.eventItem(e)).join('')}</ul>`
                : `<p class="muted small">Nada marcado para este dia.</p>`
            }</div>
          </section>
          <section class="card">
            <div class="card-head"><h2>Próximos eventos</h2></div>
            <div class="card-body">${
              next.length
                ? `<ul class="items">${next
                    .map((e) => {
                      const t = types[e.type] || types.evento;
                      return `<li><span class="date-chip ${e.date === T ? 'today' : ''}"><b>${U.parse(e.date).getDate()}</b><span>${U.MONTHS_SHORT[U.parse(e.date).getMonth()]}</span></span>
                      <button class="grow" style="all:unset;cursor:pointer;flex:1;min-width:0" data-goto="${e.date}"><div class="strong">${U.esc(e.title)}</div><div class="small muted">${U.esc(U.relDay(e.date))}${e.time ? ' · ' + e.time : ''}${e.classId ? ' · ' + U.esc(Q.klass(e.classId)?.name || '') : ''}</div></button>
                      <span class="ev-dot" style="--c:var(--cat-${t.c})" title="${t.label}"></span></li>`;
                    })
                    .join('')}</ul>`
                : '<p class="muted small">Nenhum evento à frente.</p>'
            }</div>
          </section>
        </div>
      </div>`;
  },
  eventItem(e) {
    const t = Q.EVENT_TYPES[e.type] || Q.EVENT_TYPES.evento;
    return `<li style="align-items:flex-start"><span class="ev-dot" style="--c:var(--cat-${t.c});margin-top:8px"></span>
      <div class="grow"><div class="strong">${U.esc(e.title)}</div>
      <div class="small muted">${t.label}${e.time ? ' · ' + e.time : ''} · ${U.esc(e.classId ? Q.klass(e.classId)?.name || '' : 'Toda a escola')}</div>
      ${e.notes ? `<p class="small" style="margin-top:4px;color:var(--fg-2)">${U.esc(e.notes)}</p>` : ''}</div>
      ${e.builtin ? '' : `<button class="icon-btn sm" data-edit="${e.id}" aria-label="Editar evento">${icon('pencil')}</button><button class="icon-btn sm" data-del="${e.id}" aria-label="Excluir evento">${icon('trash')}</button>`}</li>`;
  },
  mount(el) {
    const v = View.agenda;
    el.addEventListener('click', (e) => {
      const d = e.target.closest('[data-date]');
      if (d) {
        v.sel = d.dataset.date;
        if (v.sel.slice(0, 7) !== v.month) v.month = v.sel.slice(0, 7);
        return App.render();
      }
      const g = e.target.closest('[data-goto]');
      if (g) {
        v.sel = g.dataset.goto;
        v.month = v.sel.slice(0, 7);
        return App.render();
      }
      const m = e.target.closest('[data-month]');
      if (m) {
        const n = Number(m.dataset.month);
        if (n === 0) {
          v.month = U.today().slice(0, 7);
          v.sel = U.today();
        } else v.month = U.addMonths(v.month, n);
        return App.render();
      }
      const ed = e.target.closest('[data-edit]');
      if (ed) return Actions.novoEvento({ id: ed.dataset.edit });
      const del = e.target.closest('[data-del]');
      if (del) return Actions.excluirEvento(del.dataset.del);
      const x = e.target.closest('[data-x]');
      if (x) Actions.novoEvento({ date: x.dataset.x === 'new-day' ? v.sel : U.today() });
    });
    UI.$('#ag-class', el).addEventListener('change', (e) => {
      v.classId = e.target.value;
      App.render();
    });
  },
};

Actions.novoEvento = ({ id = null, date = null } = {}) => {
  const ev = id ? Store.state.events.find((e) => e.id === id) : null;
  const defs = [
    { name: 'title', label: 'O que vai acontecer?', required: true, full: true, placeholder: 'Ex.: Prova de Matemática' },
    { name: 'type', label: 'Tipo', type: 'chips', full: true, required: true, options: Object.entries(Q.EVENT_TYPES).map(([k, t]) => [k, t.label, t.c]) },
    { name: 'date', label: 'Data', type: 'date', required: true },
    { name: 'time', label: 'Horário', type: 'time', hint: 'Opcional' },
    { name: 'classId', label: 'Para quem', type: 'select', full: true, options: [['', 'Toda a escola'], ...Q.classes().map((c) => [c.id, c.name])] },
    { name: 'notes', label: 'Detalhes', type: 'textarea', rows: 3, full: true, placeholder: 'Local, o que levar, observações…' },
  ];
  UI.formDrawer({
    title: ev ? 'Editar evento' : 'Novo evento',
    defs,
    values: ev || { type: 'evento', date: date || U.today(), classId: '' },
    submitLabel: ev ? 'Salvar alterações' : 'Marcar na agenda',
    onSubmit(d) {
      const data = { ...d, classId: d.classId || null };
      Store.update(
        (s) => {
          if (ev) Object.assign(s.events.find((x) => x.id === id), data);
          else s.events.push({ id: U.uid(), ...data });
        },
        { log: `Evento "${d.title}" ${ev ? 'atualizado' : 'marcado para ' + U.fmtDate(d.date)}`, icon: 'calendar' },
      );
      View.agenda = { ...(View.agenda || {}), sel: d.date, month: d.date.slice(0, 7) };
      UI.toast(ev ? 'Evento atualizado' : `Evento marcado para ${U.fmtDateLong(d.date, false)}`, App.route()[0] === 'agenda' ? {} : { action: { label: 'Ver agenda', fn: () => App.go('agenda') } });
    },
  });
};

Actions.excluirEvento = async (id) => {
  const ev = Store.state.events.find((e) => e.id === id);
  const ok = await UI.confirm({ title: 'Excluir evento?', text: `“${U.esc(ev.title)}” sai da agenda.`, ok: 'Excluir', danger: true });
  if (!ok) return;
  Store.update((s) => (s.events = s.events.filter((e) => e.id !== id)), { log: `Evento "${ev.title}" excluído`, icon: 'trash', undo: true });
  UI.undoToast('Evento excluído');
};
