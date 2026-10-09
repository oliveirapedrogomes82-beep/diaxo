'use strict';
/* Calendário escolar — provas, reuniões, eventos, prazos e feriados (os nacionais aparecem sozinhos).
   Equipe com "calendario.editar" marca, edita e exclui (excluir tem "Desfazer"); quem não enxerga todas as
   turmas só publica para as próprias turmas e só mexe no que marcou. Família e o resto da equipe só leem.
   Também: seletor de público compartilhado com os comunicados (window.ComKit), cartão "Próximos eventos"
   do painel e do início da família, ação "Marcar evento" do menu Novo e busca.
   Comandos: events.save, events.delete (web/core/commands/comunicacao.js). */
(() => {
  const R = Core.rules;
  const can = (p) => Store.can(p);
  const me = () => Store.me;
  const today = () => U.today();
  const tf = (b) => (b ? 'true' : 'false');
  const textHTML = (s) => raw(U.linkify(U.esc(s || '')));

  // =====================================================================
  // Público (quem vê) — usado também por comunicados.js
  // =====================================================================
  const allScope = () => !!me() && me().scope === 'todas';
  /** Turmas para as quais a pessoa pode publicar (o servidor confere de novo). */
  const publishClasses = () => {
    if (!me()) return [];
    const mine = new Set(me().classIds || []);
    return Q.classes().filter((c) => allScope() || mine.has(c.id));
  };
  /** Pode alterar este evento/comunicado? Quem não vê todas as turmas só mexe no que publicou. */
  const canManage = (doc, perm) => !!doc && !Store.family && !Store.preview && can(perm) && (allScope() || doc.authorId === me().id);
  const WHO = [
    ['todos', 'Famílias e equipe'],
    ['familias', 'Só as famílias'],
    ['equipe', 'Só a equipe'],
  ];
  const SCOPES = [
    ['escola', 'Escola toda'],
    ['etapas', 'Etapas de ensino'],
    ['turmas', 'Turmas'],
  ];
  const groupBySegment = (classes) => {
    const out = new Map();
    for (const c of classes) {
      const k = c.segment || 'Outras';
      if (!out.has(k)) out.set(k, []);
      out.get(k).push(c);
    }
    return [...out.entries()];
  };
  const radio = (name, value, label, checked) => html`<label class="chip"><input type="radio" name="${name}" value="${value}" ${checked ? raw('checked') : ''}>${label}</label>`;
  const check = (name, value, label, checked) => html`<label class="chip"><input type="checkbox" name="${name}" value="${value}" ${checked ? raw('checked') : ''}>${label}</label>`;

  /**
   * Campo "Para quem" dentro de um formulário (form-grid). aud: {who, segments, classIds}.
   * Escopo "todas": escola toda, etapas ou turmas. Demais: só as próprias turmas.
   */
  const audienceField = (aud = {}, { label = 'Para quem', hint = '' } = {}) => {
    const all = allScope();
    const classes = publishClasses();
    const a = { who: aud.who || 'todos', segments: aud.segments || [], classIds: aud.classIds || [] };
    const scope = a.classIds.length ? 'turmas' : a.segments.length ? 'etapas' : all ? 'escola' : 'turmas';
    const segs = Q.segments();
    const chosen = new Set(a.classIds);
    return html`<div class="field full ca-aud" data-field="audience" role="group" aria-labelledby="ca-aud-l">
      <span class="label" id="ca-aud-l">${label} <span class="req" aria-hidden="true">*</span></span>
      <div class="chips" role="radiogroup" aria-label="Quem vê">${WHO.map(([v, l]) => radio('aud-who', v, l, a.who === v))}</div>
      ${all
        ? html`<div class="ca-aud-row"><span class="ca-aud-sub">Alcance</span><div class="chips" role="radiogroup" aria-label="Alcance">${SCOPES.map(([v, l]) => radio('aud-scope', v, l, scope === v))}</div></div>`
        : html`<input type="hidden" name="aud-scope" value="turmas">`}
      <div class="ca-aud-box" data-aud-box="etapas" ${scope === 'etapas' ? '' : raw('hidden')}>
        <div class="chips" role="group" aria-label="Etapas de ensino">${segs.map((sg) => check('aud-seg', sg, sg, a.segments.includes(sg)))}</div>
      </div>
      <div class="ca-aud-box" data-aud-box="turmas" ${scope === 'turmas' ? '' : raw('hidden')}>
        ${classes.length
          ? html`${groupBySegment(classes).map(([sg, list]) => html`<div class="ca-aud-group"><span class="ca-aud-sub">${sg}</span><div class="chips" role="group" aria-label="${sg}">${list.map((c) => check('aud-class', c.id, c.name, chosen.has(c.id)))}</div></div>`)}
              ${classes.length > 3 ? html`<div class="btn-row"><button type="button" class="btn sm ghost" data-aud-all>Marcar todas</button><button type="button" class="btn sm ghost" data-aud-none>Desmarcar</button></div>` : ''}`
          : html`<p class="small muted">Você ainda não tem turmas vinculadas. Peça à direção para vincular as suas turmas.</p>`}
      </div>
      <span class="hint ca-aud-sum" data-aud-sum>${hint}</span>
    </div>`;
  };

  /** Lê o público do formulário (sem validar). */
  const audienceValue = (root) => {
    const who = (UI.$('input[name="aud-who"]:checked', root) || {}).value || 'todos';
    const scopeEl = UI.$('input[name="aud-scope"]:checked', root) || UI.$('input[name="aud-scope"][type="hidden"]', root);
    const scope = scopeEl ? scopeEl.value : 'escola';
    const segments = scope === 'etapas' ? UI.$$('input[name="aud-seg"]:checked', root).map((i) => i.value) : [];
    const classIds = scope === 'turmas' ? UI.$$('input[name="aud-class"]:checked', root).map((i) => i.value) : [];
    return { who, scope, segments, classIds };
  };
  /** Lê e valida; marca o campo com erro e devolve null quando falta algo. */
  const readAudience = (root) => {
    const v = audienceValue(root);
    if (v.scope === 'etapas' && !v.segments.length) return UI.markField(root, 'audience', 'Escolha pelo menos uma etapa de ensino.') && null;
    if (v.scope === 'turmas' && !v.classIds.length) return UI.markField(root, 'audience', allScope() ? 'Escolha pelo menos uma turma.' : 'Escolha pelo menos uma das suas turmas.') && null;
    if (v.scope === 'escola' && !allScope()) return UI.markField(root, 'audience', 'Você só pode publicar para as suas turmas.') && null;
    return { who: v.who, segments: v.segments, classIds: v.classIds };
  };
  const audienceSummary = (root) => {
    const v = audienceValue(root);
    if (v.scope === 'etapas' && !v.segments.length) return 'Escolha as etapas.';
    if (v.scope === 'turmas' && !v.classIds.length) return 'Escolha as turmas.';
    const label = Q.audienceLabel({ who: v.who, segments: v.segments, classIds: v.classIds });
    const fam = v.who === 'equipe' ? ' As famílias não veem.' : v.who === 'familias' ? ' Aparece no portal das famílias.' : ' Aparece no portal das famílias e para a equipe.';
    return `Quem vai ver: ${label}.${fam}`;
  };
  /** Liga os controles do campo de público (mostrar etapas/turmas, marcar todas, resumo). */
  const bindAudience = (root) => {
    const box = UI.$('[data-field="audience"]', root);
    if (!box) return;
    const sync = () => {
      const { scope } = audienceValue(root);
      UI.$$('[data-aud-box]', box).forEach((b) => (b.hidden = b.dataset.audBox !== scope));
      const sum = UI.$('[data-aud-sum]', box);
      if (sum) sum.textContent = audienceSummary(root);
      UI.$$('.error', box).forEach((e) => e.remove());
    };
    box.addEventListener('change', sync);
    box.addEventListener('click', (e) => {
      const all = e.target.closest('[data-aud-all]');
      const none = e.target.closest('[data-aud-none]');
      if (!all && !none) return;
      UI.$$('input[name="aud-class"]', box).forEach((i) => (i.checked = !!all));
      sync();
    });
    sync();
  };

  /** Para a família: de qual filho é este evento/comunicado? */
  const familyTarget = (aud) => {
    const a = aud || {};
    if (!(a.classIds || []).length && !(a.segments || []).length) return 'Toda a escola';
    const cmap = Q.classesById();
    const kids = Q.myChildren().filter((s) => s.classId && R.audienceTouches(a, [s.classId], cmap));
    if (!kids.length) return whereLabel(a, cmap) || 'Toda a escola';
    return kids.map((s) => `${U.firstName(s.name)} (${(Q.klass(s.classId) || {}).name || 'turma'})`).join(', ');
  };

  /** Onde vale o público, por extenso ("6º ano A", "Educação Infantil"); '' = escola toda.
      Turma que a pessoa não enxerga vira "outra turma" (nunca "escola toda"). */
  const whereLabel = (aud, cmap = Q.classesById()) => {
    const a = aud || {};
    const ids = a.classIds || [];
    const parts = ids.map((id) => (cmap.get(id) || {}).name).filter(Boolean).concat(a.segments || []);
    const unknown = ids.filter((id) => !cmap.has(id)).length;
    if (unknown) parts.push(parts.length ? U.plural(unknown, 'turma', 'turmas') : unknown === 1 ? 'outra turma' : `${unknown} outras turmas`);
    if (parts.length > 3) return `${parts.slice(0, 2).join(', ')} e mais ${parts.length - 2}`;
    return parts.length > 1 ? `${parts.slice(0, -1).join(', ')} e ${parts[parts.length - 1]}` : parts[0] || '';
  };
  /** Público para a equipe: "Todos · 6º ano A", "Só a equipe · escola toda". */
  const audienceText = (aud) => {
    const a = aud || {};
    const who = { todos: 'Todos', familias: 'Famílias', equipe: 'Só a equipe' }[a.who] || 'Todos';
    return `${who} · ${whereLabel(a) || 'escola toda'}`;
  };

  /** Tira a mensagem de erro do campo assim que a pessoa corrige. */
  const liveClear = (form) => {
    const clear = (e) => {
      const w = e.target.closest && e.target.closest('[data-field]');
      if (!w || w.dataset.field === 'audience') return;
      w.querySelectorAll('.error').forEach((x) => x.remove());
      w.querySelectorAll('.invalid').forEach((x) => {
        x.classList.remove('invalid');
        x.removeAttribute('aria-invalid');
      });
    };
    form.addEventListener('input', clear);
    form.addEventListener('change', clear);
  };

  window.ComKit = { liveClear, allScope, publishClasses, canManage, audienceField, audienceValue, readAudience, bindAudience, familyTarget, whereLabel, audienceText, WHO };

  // =====================================================================
  // Datas e eventos
  // =====================================================================
  const PS = () => PageState.get('calendario', { month: today().slice(0, 7), sel: today(), view: 'mes', classId: '', childId: '', hidden: [] });
  const evType = (t) => Q.EVENT_TYPES[t] || Q.EVENT_TYPES.evento;
  const dayNum = (d) => Number(d.slice(8, 10));
  const monShort = (d) => U.MONTHS_SHORT[Number(d.slice(5, 7)) - 1];
  const dateChip = (d) => html`<span class="date-chip ${d === today() ? 'today' : ''}"><b>${dayNum(d)}</b><span>${monShort(d)}</span></span>`;
  const byWhen = (a, b) => (a.date + (a.time || '99')).localeCompare(b.date + (b.time || '99')) || String(a.title).localeCompare(String(b.title), 'pt-BR');
  const event = (id) => Store.byId('events', id);

  /** Turmas que interessam a quem vê (null = todas): família → turmas dos filhos; equipe que vê a escola → todas;
      coordenação de etapas → as turmas visíveis; demais (vínculos) → as próprias turmas. */
  const relevantScope = () => {
    if (Store.family) return { ids: Q.myChildren().map((s) => s.classId).filter(Boolean), segs: new Set() };
    const m = me();
    if (!m || m.scope === 'todas') return null;
    const list = m.scope === 'segmentos' ? Q.classes() : Q.myClasses();
    return { ids: list.map((c) => c.id), segs: new Set(m.scope === 'segmentos' ? m.segments || [] : []) };
  };
  const touchesScope = (e, sc, cmap) => !sc || R.audienceTouches(e.audience, sc.ids, cmap) || ((e.audience && e.audience.segments) || []).some((x) => sc.segs.has(x));
  /** Eventos de um período que dizem respeito a quem vê: os da escola toda e os das suas turmas/etapas
      (para quem vê a escola inteira, todos). Os de outras turmas continuam no Calendário. */
  const relevantEvents = (from = today(), to = '') => {
    const sc = relevantScope();
    const cmap = Q.classesById();
    return Store.state.events.filter((e) => e.date >= from && (!to || e.date <= to) && touchesScope(e, sc, cmap)).sort(byWhen);
  };
  Object.assign(Q, { relevantEvents, eventWhere: (e) => whereLabel(e && e.audience) });
  /** Feriado nacional do dia (o da escola é um evento do tipo "feriado"). */
  const national = (d) => U.holidayName(d);

  /** Eventos que passam pelos filtros da tela (turma/filho e tipos escondidos). */
  const filtered = (st = PS()) => {
    const hide = new Set(st.hidden || []);
    const cmap = Q.classesById();
    let target = null;
    if (Store.family) {
      if (st.childId) {
        const s = Q.student(st.childId);
        target = s && s.classId ? [s.classId] : [];
      }
    } else if (st.classId) target = [st.classId];
    return Store.state.events.filter((e) => !hide.has(e.type) && (!target || R.audienceTouches(e.audience, target, cmap)));
  };
  const byDate = (list) => {
    const m = new Map();
    for (const e of list) {
      if (!m.has(e.date)) m.set(e.date, []);
      m.get(e.date).push(e);
    }
    for (const arr of m.values()) arr.sort(byWhen);
    return m;
  };
  const monthDays = (month) => {
    const first = `${month}-01`;
    const last = U.addDays(`${U.addMonths(month, 1)}-01`, -1);
    const out = [];
    for (let d = first; d <= last; d = U.addDays(d, 1)) out.push(d);
    return out;
  };
  const gridDays = (month) => {
    const first = `${month}-01`;
    const last = U.addDays(`${U.addMonths(month, 1)}-01`, -1);
    const start = U.addDays(first, -U.weekday(first));
    const end = U.addDays(last, 6 - U.weekday(last));
    const out = [];
    for (let d = start; d <= end; d = U.addDays(d, 1)) out.push(d);
    return out;
  };
  const schoolDays = (month) => monthDays(month).filter((d) => Q.isSchoolDay(d)).length;

  // ---------- salvar no calendário do celular (.ics) ----------
  const icsEsc = (s) => String(s || '').replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/([,;])/g, '\\$1');
  const icsFold = (line) => {
    const out = [];
    let s = line;
    while (s.length > 74) {
      out.push(s.slice(0, 74));
      s = ' ' + s.slice(74);
    }
    out.push(s);
    return out.join('\r\n');
  };
  const icsStamp = (iso) => iso.replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const downloadIcs = (e) => {
    const d = e.date.replace(/-/g, '');
    const school = Q.settings().schoolName || 'Escola';
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Caderneta Escolar//PT-BR', 'CALSCALE:GREGORIAN', 'BEGIN:VEVENT', `UID:${e.id}@caderneta-escolar`, `DTSTAMP:${icsStamp(new Date().toISOString())}`];
    if (e.time) {
      const [h, m] = e.time.split(':').map(Number);
      const endH = Math.min(23, h + 1);
      lines.push(`DTSTART:${d}T${String(h).padStart(2, '0')}${String(m).padStart(2, '0')}00`, `DTEND:${d}T${String(endH).padStart(2, '0')}${String(endH === h ? 59 : m).padStart(2, '0')}00`);
    } else lines.push(`DTSTART;VALUE=DATE:${d}`, `DTEND;VALUE=DATE:${U.addDays(e.date, 1).replace(/-/g, '')}`);
    lines.push(`SUMMARY:${icsEsc(`${e.title} (${school})`)}`);
    const desc = [evType(e.type).label, Store.family ? familyTarget(e.audience) : audienceText(e.audience), e.notes].filter(Boolean).join('\n');
    lines.push(`DESCRIPTION:${icsEsc(desc)}`, 'END:VEVENT', 'END:VCALENDAR');
    U.download(`${U.slug(e.title) || 'evento'}-${e.date}.ics`, lines.map(icsFold).join('\r\n') + '\r\n', 'text/calendar;charset=utf-8');
    UI.toast('Arquivo do evento baixado. Abra para adicionar ao seu calendário.', { ic: 'calendar' });
  };

  // =====================================================================
  // Peças da tela
  // =====================================================================
  const targetLine = (e) => (Store.family ? familyTarget(e.audience) : audienceText(e.audience));
  /** Complemento curto das listas "Próximos": de que turma/etapa é (nada quando é da escola toda). */
  const whereBit = (e) => {
    if (e.hol) return '';
    const w = Store.family ? (whereLabel(e.audience) ? familyTarget(e.audience) : '') : whereLabel(e.audience);
    return w ? ` · ${w}` : '';
  };
  const eventItem = (e, { showDate = false } = {}) => {
    const t = evType(e.type);
    const manage = canManage(e, 'calendario.editar');
    const author = !Store.family ? Q.userName(e.authorId, '') : '';
    return html`<li class="ca-ev" style="--c:var(--cat-${t.c})">
      ${showDate ? dateChip(e.date) : html`<span class="ca-ev-bar" aria-hidden="true"></span>`}
      <div class="grow">
        <div class="ca-ev-kick"><span class="ev-dot" aria-hidden="true"></span><b>${t.label}</b><span>${e.time ? html`${icon('clock')}${e.time}` : 'Dia todo'}</span>${showDate ? html`<span>${U.relDay(e.date)}</span>` : ''}</div>
        <div class="ca-ev-t">${e.title}</div>
        <div class="ca-ev-m">${icon(e.audience && e.audience.who === 'equipe' ? 'briefcase' : 'users')}<span>${targetLine(e)}${author ? ` · marcado por ${U.shortName(author)}` : ''}</span></div>
        ${e.notes ? html`<p class="ca-ev-n">${textHTML(e.notes)}</p>` : ''}
      </div>
      <div class="ca-ev-acts">
        <button type="button" class="icon-btn sm" data-ca-ics="${e.id}" aria-label="Salvar “${e.title}” no calendário do celular" title="Salvar no calendário do celular">${icon('download')}</button>
        ${manage
          ? html`<button type="button" class="icon-btn sm" data-ca-edit="${e.id}" aria-label="Editar “${e.title}”" title="Editar">${icon('pencil')}</button>
            <button type="button" class="icon-btn sm" data-ca-del="${e.id}" aria-label="Excluir “${e.title}”" title="Excluir">${icon('trash')}</button>`
          : ''}
      </div>
    </li>`;
  };
  const holidayItem = (d, name, { showDate = false } = {}) => html`<li class="ca-ev is-hol" style="--c:var(--cat-8)">
      ${showDate ? dateChip(d) : html`<span class="ca-ev-bar" aria-hidden="true"></span>`}
      <div class="grow"><div class="ca-ev-kick"><span class="ev-dot" aria-hidden="true"></span><b>Feriado nacional</b>${showDate ? html`<span>${U.relDay(d)}</span>` : ''}</div>
        <div class="ca-ev-t">${name}</div><div class="ca-ev-m"><span>Não há aula.</span></div></div>
    </li>`;

  const legend = (st) => {
    const hide = new Set(st.hidden || []);
    return html`<div class="ca-legend" role="group" aria-label="Mostrar tipos de evento">${Object.entries(Q.EVENT_TYPES).map(
      ([k, t]) => html`<button type="button" class="chip ca-leg" data-ca-type="${k}" aria-pressed="${tf(!hide.has(k))}" title="${hide.has(k) ? 'Mostrar' : 'Esconder'} ${t.label.toLowerCase()}"><span class="dot" style="background:var(--cat-${t.c})"></span>${t.label}</button>`,
    )}</div>`;
  };

  const grid = (st, map) => {
    const T = today();
    const days = gridDays(st.month);
    return html`<div class="cal ca-grid" role="grid" aria-label="Calendário de ${U.fmtMonth(st.month)}">
      <div class="ca-row" role="row">${U.WD_SHORT.map((w) => html`<div class="wd" role="columnheader">${w}</div>`)}</div>
      ${Array.from({ length: days.length / 7 }, (_, r) => html`<div class="ca-row" role="row">${days.slice(r * 7, r * 7 + 7).map((d) => {
        const evs = map.get(d) || [];
        const hol = national(d);
        const out = d.slice(0, 7) !== st.month;
        const wd = U.weekday(d);
        const schoolHol = evs.some((e) => e.type === 'feriado');
        const cls = ['day', out ? 'out' : '', d === T ? 'today' : '', d === st.sel ? 'sel' : '', wd === 0 || wd === 6 ? 'weekend' : '', hol || schoolHol ? 'holiday' : ''].filter(Boolean).join(' ');
        const label = `${U.cap(U.fmtDateLong(d))}${hol ? `, feriado: ${hol}` : ''}${evs.length ? `, ${U.plural(evs.length, 'evento', 'eventos')}` : ''}`;
        return html`<div role="gridcell" class="ca-cell"><button type="button" class="${cls}" data-ca-day="${d}" aria-label="${label}" aria-pressed="${tf(d === st.sel)}" tabindex="${d === st.sel ? '0' : '-1'}">
          <span class="dn">${dayNum(d)}</span>
          ${hol ? html`<span class="ca-hol">${hol}</span>` : ''}
          ${evs.slice(0, 3).map((e) => html`<span class="ev" style="--c:var(--cat-${evType(e.type).c})" title="${e.time ? `${e.time} · ` : ''}${e.title}">${e.title}</span>`)}
          ${evs.length > 3 ? html`<span class="ev-more">+${evs.length - 3} ${evs.length - 3 === 1 ? 'outro' : 'outros'}</span>` : ''}
          ${evs.length || hol ? html`<span class="dots">${hol && !schoolHol ? html`<span class="ev-dot" style="--c:var(--cat-8)"></span>` : ''}${evs.slice(0, 3).map((e) => html`<span class="ev-dot" style="--c:var(--cat-${evType(e.type).c})"></span>`)}</span>` : ''}
        </button></div>`;
      })}</div>`)}
    </div>`;
  };

  /** "Hoje", "Amanhã", "Em 3 dias", "Há 2 dias" (sem repetir o dia da semana do título). */
  const distance = (d) => {
    const n = U.daysBetween(today(), d);
    return n === 0 ? 'Hoje' : n === 1 ? 'Amanhã' : n === -1 ? 'Ontem' : n > 0 ? `Em ${n} dias` : `Há ${-n} dias`;
  };
  const dayCard = (st, map) => {
    const d = st.sel;
    const evs = map.get(d) || [];
    const hol = national(d);
    const editor = can('calendario.editar') && !Store.family && !Store.preview;
    const school = !Store.family && Q.isSchoolDay(d);
    return html`<section class="card ca-daycard">
      <div class="card-head"><div><h2>${U.cap(U.fmtDateLong(d))}</h2><span class="sub">${distance(d)}${school ? ' · dia útil' : ''}</span></div>
        ${editor ? html`<button type="button" class="btn sm" data-ca-new="${d}">${icon('plus')}Marcar neste dia</button>` : ''}</div>
      <div class="card-body">${evs.length || hol
        ? html`<ul class="items ca-evs">${hol ? holidayItem(d, hol) : ''}${evs.map((e) => eventItem(e))}</ul>`
        : html`<p class="muted small ca-none">Nada marcado para este dia.${editor ? ' Use “Marcar neste dia” para incluir uma prova, reunião ou prazo.' : ''}</p>`}</div>
    </section>`;
  };

  const upcomingCard = (list) => {
    const T = today();
    const next = list.filter((e) => e.date >= T).sort(byWhen).slice(0, 6);
    return html`<section class="card">
      <div class="card-head"><h2>Próximos</h2><span class="sub">A partir de hoje</span></div>
      <div class="card-body">${next.length
        ? html`<ul class="items ca-next">${next.map((e) => {
            const t = evType(e.type);
            return html`<li><button type="button" class="ca-next-btn" data-ca-goto="${e.date}">${dateChip(e.date)}<span class="grow"><b class="ca-next-t">${e.title}</b><span class="small muted">${U.cap(U.relDay(e.date))}${e.time ? ` · ${e.time}` : ''} · ${t.label}${whereBit(e)}</span></span><span class="ev-dot" style="--c:var(--cat-${t.c})" aria-hidden="true"></span></button></li>`;
          })}</ul>`
        : html`<p class="muted small">Nada marcado daqui para a frente.</p>`}</div>
    </section>`;
  };

  const monthList = (st, map) => {
    const rows = [];
    for (const d of monthDays(st.month)) {
      const evs = map.get(d) || [];
      const hol = national(d);
      if (hol) rows.push(holidayItem(d, hol, { showDate: true }));
      evs.forEach((e) => rows.push(eventItem(e, { showDate: true })));
    }
    const editor = can('calendario.editar') && !Store.family && !Store.preview;
    return html`<section class="card">
      <div class="card-body">${rows.length
        ? html`<ul class="items ca-evs ca-list">${rows}</ul>`
        : UI.empty({ icon: 'calendar', title: `Nada marcado em ${U.monthName(st.month)}`, text: editor ? 'Marque provas, reuniões, passeios e prazos. As famílias veem no portal o que for para elas.' : 'Quando a escola marcar provas, reuniões ou passeios, eles aparecem aqui.', action: editor ? html`<button type="button" class="btn primary" data-ca-new="${st.month === today().slice(0, 7) ? today() : `${st.month}-01`}">${icon('plus')}Marcar evento</button>` : '' })}</div>
    </section>`;
  };

  // =====================================================================
  // Tela
  // =====================================================================
  const render = () => {
    const st = PS();
    if (!/^\d{4}-\d{2}$/.test(st.month)) st.month = today().slice(0, 7);
    const list = filtered(st);
    const map = byDate(list);
    const editor = can('calendario.editar') && !Store.family && !Store.preview;
    const kids = Store.family ? Q.myChildren() : [];
    if (st.childId && !kids.some((k) => k.id === st.childId)) st.childId = '';
    const classes = Store.family ? [] : Q.classes();
    if (st.classId && !classes.some((c) => c.id === st.classId)) st.classId = '';
    const cur = today().slice(0, 7);
    const nSchool = schoolDays(st.month);
    const lead = Store.family
      ? `Provas, reuniões, passeios e outras datas da escola${kids.length ? ` para ${kids.map((k) => U.firstName(k.name)).join(', ').replace(/, ([^,]*)$/, ' e $1')}` : ''}. Toque em um dia para ver os detalhes.`
      : 'Provas, reuniões, eventos e prazos da escola. Os feriados nacionais já aparecem sozinhos.';
    return html`
      <div class="page-head">
        <div><h1>Calendário</h1><p class="lead">${lead}</p></div>
        ${editor ? html`<button type="button" class="btn primary" data-ca-new="${st.sel}">${icon('plus')}Novo evento</button>` : ''}
      </div>
      <div class="toolbar ca-toolbar">
        <div class="date-nav">
          <button type="button" class="icon-btn" data-ca-month="-1" aria-label="Mês anterior">${icon('chevronLeft')}</button>
          <h2 class="ca-month" aria-live="polite">${U.cap(U.fmtMonth(st.month))}</h2>
          <button type="button" class="icon-btn" data-ca-month="1" aria-label="Próximo mês">${icon('chevronRight')}</button>
          ${st.month !== cur || st.sel !== today() ? html`<button type="button" class="btn sm ghost" data-ca-month="0">Hoje</button>` : ''}
        </div>
        ${Store.family ? '' : html`<span class="small muted ca-sdays" title="Dias de segunda a sexta sem feriado">${U.plural(nSchool, 'dia útil', 'dias úteis')}</span>`}
        <span class="grow"></span>
        ${UI.seg([['mes', 'Mês'], ['lista', 'Lista']], st.view, 'data-ca-view')}
        ${kids.length > 1
          ? html`<select class="input ca-filter" data-ca-child aria-label="Filtrar por filho"><option value="">Todos os filhos</option>${kids.map((k) => html`<option value="${k.id}" ${k.id === st.childId ? raw('selected') : ''}>${U.firstName(k.name)}</option>`)}</select>`
          : ''}
        ${classes.length > 1
          ? html`<select class="input ca-filter" data-ca-class aria-label="Filtrar por turma"><option value="">Todas as turmas</option>${classes.map((c) => html`<option value="${c.id}" ${c.id === st.classId ? raw('selected') : ''}>${c.name}</option>`)}</select>`
          : ''}
      </div>
      ${legend(st)}
      ${st.view === 'lista'
        ? html`<div class="grid-2">${monthList(st, map)}<div class="stack">${upcomingCard(list)}</div></div>`
        : html`<div class="grid-2 ca-layout">
            <section class="card ca-calcard">${grid(st, map)}</section>
            <div class="stack">${dayCard(st, map)}${upcomingCard(list)}</div>
          </div>`}`;
  };

  const select = (d, focus = false) => {
    const st = PS();
    st.sel = d;
    if (d.slice(0, 7) !== st.month) st.month = d.slice(0, 7);
    App.render();
    if (focus) {
      const b = document.querySelector(`[data-ca-day="${d}"]`);
      b && b.focus({ preventScroll: false });
    }
  };

  const removeEvent = (id, btn) => {
    const e = event(id);
    if (!e) return;
    UI.act('events.delete', { id }, { btn, ok: `Evento “${e.title}” excluído` });
  };

  const mount = (el) => {
    const st = PS();
    el.addEventListener('click', (e) => {
      const day = e.target.closest('[data-ca-day]');
      if (day) return select(day.dataset.caDay);
      const go = e.target.closest('[data-ca-goto]');
      if (go) {
        st.view = 'mes';
        return select(go.dataset.caGoto);
      }
      const m = e.target.closest('[data-ca-month]');
      if (m) {
        const n = Number(m.dataset.caMonth);
        if (n === 0) {
          st.month = today().slice(0, 7);
          st.sel = today();
        } else {
          st.month = U.addMonths(st.month, n);
          st.sel = st.month === today().slice(0, 7) ? today() : `${st.month}-01`;
        }
        return App.render();
      }
      const v = e.target.closest('[data-ca-view]');
      if (v) {
        st.view = v.dataset.caView;
        return App.render();
      }
      const t = e.target.closest('[data-ca-type]');
      if (t) {
        const hide = new Set(st.hidden || []);
        if (hide.has(t.dataset.caType)) hide.delete(t.dataset.caType);
        else hide.add(t.dataset.caType);
        st.hidden = [...hide];
        return App.render();
      }
      const n = e.target.closest('[data-ca-new]');
      if (n) return openEvent({ date: n.dataset.caNew, classId: st.classId || null });
      const ed = e.target.closest('[data-ca-edit]');
      if (ed) return openEvent({ id: ed.dataset.caEdit });
      const del = e.target.closest('[data-ca-del]');
      if (del) return removeEvent(del.dataset.caDel, del);
      const ics = e.target.closest('[data-ca-ics]');
      if (ics) {
        const ev = event(ics.dataset.caIcs);
        if (ev) downloadIcs(ev);
      }
    });
    el.addEventListener('change', (e) => {
      if (e.target.matches('[data-ca-class]')) {
        st.classId = e.target.value;
        App.render();
      } else if (e.target.matches('[data-ca-child]')) {
        st.childId = e.target.value;
        App.render();
      }
    });
    // setas do teclado movem o dia escolhido na grade
    const gridEl = UI.$('.ca-grid', el);
    gridEl &&
      gridEl.addEventListener('keydown', (e) => {
        const b = e.target.closest('[data-ca-day]');
        if (!b) return;
        const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key];
        if (e.key === 'Home' || e.key === 'End') {
          e.preventDefault();
          return select(e.key === 'Home' ? `${st.month}-01` : U.addDays(`${U.addMonths(st.month, 1)}-01`, -1), true);
        }
        if (!step) return;
        e.preventDefault();
        select(U.addDays(b.dataset.caDay, step), true);
      });
  };

  // =====================================================================
  // Marcar / editar evento
  // =====================================================================
  const dateHint = (d) => {
    if (!d || !U.isValidDate(d)) return 'Dia do evento.';
    const hol = Q.holiday(d);
    const wd = U.weekday(d);
    const parts = [U.cap(U.fmtDateLong(d))];
    if (hol) parts.push(`feriado: ${hol}`);
    else if (wd === 0 || wd === 6) parts.push('fim de semana');
    if (d < today()) parts.push('data já passou');
    return parts.join(' · ');
  };

  const openEvent = ({ id = null, date = null, classId = null, type = null } = {}) => {
    if (Store.preview) return UI.toast('No modo "ver como" nada pode ser alterado.', { tone: 'bad' });
    if (!can('calendario.editar')) return UI.toast('Seu acesso não permite marcar eventos. Fale com a direção.', { tone: 'bad' });
    const ev = id ? event(id) : null;
    if (id && !ev) return UI.toast('Este evento não existe mais.', { tone: 'bad' });
    if (ev && !canManage(ev, 'calendario.editar')) return UI.toast('Você só pode alterar os eventos que você marcou.', { tone: 'bad' });
    if (!allScope() && !publishClasses().length) return UI.toast('Você ainda não tem turmas vinculadas para marcar eventos. Fale com a direção.', { tone: 'bad' });
    const types = Object.entries(Q.EVENT_TYPES).filter(([k]) => k !== 'feriado' || allScope() || (ev && ev.type === 'feriado'));
    const d0 = ev ? ev.date : date && U.isValidDate(date) ? date : today();
    const aud0 = ev ? ev.audience : classId ? { who: 'todos', classIds: [classId], segments: [] } : allScope() ? { who: 'todos' } : { who: 'todos', classIds: publishClasses().length === 1 ? [publishClasses()[0].id] : [] };
    const defs = [
      { name: 'title', label: 'O que vai acontecer?', required: true, full: true, maxlength: 120, placeholder: 'Ex.: Prova de Matemática, Reunião de pais' },
      { name: 'type', label: 'Tipo', type: 'chips', full: true, required: true, options: types.map(([k, t]) => [k, t.label, t.c]) },
      { name: 'date', label: 'Data', type: 'date', required: true, hint: dateHint(d0) },
      { name: 'time', label: 'Horário', type: 'time', hint: 'Deixe em branco se for o dia todo.' },
      audienceField(aud0, { label: 'Para quem' }),
      { name: 'notes', label: 'Detalhes', type: 'textarea', rows: 3, full: true, maxlength: 2000, placeholder: 'Local, o que levar, horário de saída e volta…', hint: 'Opcional. Aparece para quem vê o evento.' },
    ];
    UI.formDrawer({
      title: ev ? 'Editar evento' : 'Novo evento',
      sub: ev ? html`Marcado por ${Q.userName(ev.authorId, 'alguém da equipe')}` : 'Aparece no calendário de quem você escolher.',
      defs,
      values: ev ? { ...ev } : { type: type || 'evento', date: d0, time: '' },
      submitLabel: ev ? 'Salvar alterações' : 'Marcar no calendário',
      cls: 'ca-drawer',
      onMount(el, api, form) {
        bindAudience(form);
        liveClear(form);
        const dateIn = UI.$('#f-date', form);
        const hint = UI.$('#f-date-hint', form);
        dateIn &&
          hint &&
          dateIn.addEventListener('input', () => {
            hint.textContent = dateHint(dateIn.value);
          });
      },
      async onSubmit(d, api, form) {
        const audience = readAudience(form);
        if (!audience) return null;
        const input = { title: d.title, type: d.type, date: d.date, time: d.time || '', notes: d.notes || '', audience };
        if (ev) input.id = ev.id;
        const res = await UI.act('events.save', input, { form, ok: ev ? 'Evento atualizado' : `Evento marcado para ${U.fmtDateLong(d.date, false)}` });
        if (!res) return null;
        const st = PS();
        st.sel = d.date;
        st.month = d.date.slice(0, 7);
        if (st.hidden && st.hidden.includes(d.type)) st.hidden = st.hidden.filter((x) => x !== d.type);
        if (App.route()[0] === 'calendario') App.render();
        return true;
      },
    });
  };

  // =====================================================================
  // Registro
  // =====================================================================
  App.page({
    id: 'calendario',
    label: 'Calendário',
    icon: 'calendar',
    group: 'Comunicação',
    order: 10,
    family: 'both',
    keys: 'eventos provas reuniões feriados datas agenda escolar',
    title: () => 'Calendário',
    render,
    mount,
  });

  App.widget({
    id: 'proximos-eventos',
    family: 'both',
    order: 60,
    size: 'third',
    render() {
      const T = today();
      const mine = relevantEvents(T);
      const next = mine.slice(0, 5);
      // quem atua só em algumas turmas vê a escola toda e as suas; as provas das outras turmas ficam no Calendário
      const others = Store.family ? 0 : Store.state.events.filter((e) => e.date >= T).length - mine.length;
      // feriado nacional nos próximos 14 dias também entra
      const hols = [];
      for (let i = 0, d = T; i < 15; i++, d = U.addDays(d, 1)) if (national(d) && !Store.state.events.some((e) => e.date === d && e.type === 'feriado')) hols.push({ id: 'hol' + d, date: d, title: national(d), type: 'feriado', time: '', hol: true });
      const list = next.concat(hols).sort(byWhen).slice(0, 5);
      return html`<section class="card ca-widget">
        <div class="card-head"><h2>${icon('calendar')}Próximos eventos</h2><a class="sub" href="#calendario">Ver calendário</a></div>
        <div class="card-body">${list.length
          ? html`<ul class="items ca-next">${list.map((e) => {
              const t = evType(e.type);
              return html`<li><button type="button" class="ca-next-btn" data-ca-wgo="${e.date}">${dateChip(e.date)}<span class="grow"><b class="ca-next-t">${e.title}</b><span class="small muted">${U.cap(U.relDay(e.date))}${e.time ? ` · ${e.time}` : ''} · ${e.hol ? 'Feriado nacional' : t.label}${whereBit(e)}</span></span><span class="ev-dot" style="--c:var(--cat-${t.c})" aria-hidden="true"></span></button></li>`;
            })}</ul>`
          : html`<p class="muted small">Nada marcado para os próximos dias${others ? ' na escola toda ou nas suas turmas' : ''}.</p>`}
          ${others > 0 ? html`<p class="small muted ca-w-others">Mostrando a escola toda e as suas turmas. ${U.plural(others, 'evento de outra turma está', 'eventos de outras turmas estão')} no <a href="#calendario">calendário</a>.</p>` : ''}</div>
      </section>`;
    },
    mount(el) {
      el.addEventListener('click', (e) => {
        const b = e.target.closest('[data-ca-wgo]');
        if (!b) return;
        const st = PS();
        st.sel = b.dataset.caWgo;
        st.month = st.sel.slice(0, 7);
        st.view = 'mes';
        App.go('calendario');
      });
    },
  });

  App.action({ id: 'novo-evento', label: 'Marcar evento no calendário', icon: 'calendar', order: 70, perm: 'calendario.editar', keys: 'evento prova reunião feriado passeio prazo data calendário', run: () => openEvent({}) });

  App.searchProvider((query) => {
    const T = today();
    const hits = Store.state.events.filter((e) => U.matches(query, e.title, evType(e.type).label, e.notes));
    // primeiro os que ainda vão acontecer (do mais próximo), depois os que já passaram (do mais recente)
    const next = hits.filter((e) => e.date >= T).sort(byWhen);
    const past = hits.filter((e) => e.date < T).sort((a, b) => byWhen(b, a));
    return next
      .concat(past)
      .slice(0, 5)
      .map((e) => ({
        group: 'Calendário',
        label: e.title,
        icon: 'calendar',
        meta: `${evType(e.type).label} · ${U.fmtDate(e.date)}`,
        run: () => {
          const st = PS();
          st.sel = e.date;
          st.month = e.date.slice(0, 7);
          st.view = 'mes';
          App.go('calendario');
        },
      }));
  });

  Actions.novoEvento = (opts = {}) => openEvent(opts);
  Actions.verCalendario = (date) => {
    const st = PS();
    if (date && U.isValidDate(date)) {
      st.sel = date;
      st.month = date.slice(0, 7);
    }
    App.go('calendario');
  };
})();
