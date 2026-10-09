'use strict';
/* Rotina do dia da Educação Infantil (agenda da creche/pré-escola).
   Equipe: turma + data; preenche por momento do dia (lanche, almoço, sono…) ou por criança, com "aplicar a todos",
   "mandar amanhã" e observação; salva ao longo do dia e envia às famílias (routines.save / routines.send).
   Família: a rotina de cada filho, por dia. Comandos em web/core/commands/agenda.js. */
(() => {
  const can = (p) => Store.can(p);
  const tf = (b) => (b ? 'true' : 'false');
  /** Botões segmentados (igual a UI.seg, mas com aria-pressed "true"/"false": o html`` apaga booleanos). */
  const seg = (items, active, attr) =>
    html`<div class="seg" role="group">${items.map(([v, l]) => html`<button type="button" ${raw(attr)}="${v}" aria-pressed="${tf(String(v) === String(active))}">${l}</button>`)}</div>`;
  const today = () => U.today();
  const me = () => Store.me;
  const ddmm = (d) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
  const shortDay = (d) => `${U.WD_SHORT[U.weekday(d)]}, ${ddmm(d)}`;
  const relShort = (d) => {
    const t = today();
    if (d === t) return 'hoje';
    if (d === U.addDays(t, -1)) return 'ontem';
    return shortDay(d);
  };

  const fieldsDef = () => {
    const f = Q.settings().routineFields;
    return Array.isArray(f) && f.length ? f : (Core.seed && Core.seed.ROUTINE_FIELDS) || [];
  };
  const bringDef = () => {
    const b = Q.settings().routineBring;
    return Array.isArray(b) ? b : (Core.seed && Core.seed.ROUTINE_BRING) || [];
  };
  const WARN_RE = /(^|\s)(não|nao|pouco|choros|agitad|solto|recus|febre|vomit)/i;
  const toneOf = (opt) => (WARN_RE.test(opt) ? 't-warn' : 't-good');
  const fieldIcon = (key, label) => {
    const k = U.norm(`${key} ${label}`);
    if (/lanche|almoc|refei|janta|mamad|fruta|comeu/.test(k)) return 'utensils';
    if (/sono|dorm|soneca/.test(k)) return 'moonZ';
    if (/evacu|fralda|xixi|banheiro/.test(k)) return 'baby';
    if (/humor|emoc/.test(k)) return 'smile';
    return 'checkCircle';
  };
  const isInfant = (c) => !!c && (c.segment === 'Educação Infantil' || Q.evaluation(c.id) === 'parecer');

  // =====================================================================
  // Equipe
  // =====================================================================
  const RS = () => PageState.get('rotina', { classId: '', date: U.today(), mode: 'momento', field: '', drafts: {} });
  const infantClasses = () => Q.workClasses().filter(isInfant);
  const editable = (classId) => can('diario.publicar') && (me().classIds || []).includes(classId);
  const draftOf = (v) => {
    const k = `${v.classId}|${v.date}`;
    if (!v.drafts[k]) v.drafts[k] = {};
    return v.drafts[k];
  };
  const stored = (classId, date, sid) => Q.routine(classId, date, sid) || { fields: {}, bring: [], note: '', sentAt: null };
  /** Valor atual (rascunho por cima do salvo). */
  const valueOf = (v, sid, key) => {
    const d = draftOf(v)[sid];
    if (key === 'bring') return d && d.bring ? d.bring : stored(v.classId, v.date, sid).bring || [];
    if (key === 'note') return d && d.note != null ? d.note : stored(v.classId, v.date, sid).note || '';
    if (d && d.fields && key in d.fields) return d.fields[key];
    return (stored(v.classId, v.date, sid).fields || {})[key] || '';
  };
  const setDraft = (v, sid, key, value) => {
    const all = draftOf(v);
    const d = all[sid] || (all[sid] = {});
    const base = stored(v.classId, v.date, sid);
    if (key === 'bring') d.bring = value;
    else if (key === 'note') d.note = value;
    else (d.fields || (d.fields = {}))[key] = value;
    // limpa o que voltou a ser igual ao salvo
    if (d.fields) for (const k of Object.keys(d.fields)) if ((base.fields || {})[k] === d.fields[k] || (!(base.fields || {})[k] && !d.fields[k])) delete d.fields[k];
    if (d.fields && !Object.keys(d.fields).length) delete d.fields;
    if (d.bring && JSON.stringify(d.bring) === JSON.stringify(base.bring || [])) delete d.bring;
    if (d.note != null && d.note === (base.note || '')) delete d.note;
    if (!Object.keys(d).length) delete all[sid];
  };
  const changedIds = (v) => Object.keys(draftOf(v));
  const filledCount = (v, kids, key) =>
    kids.filter((s) => {
      const x = valueOf(v, s.id, key);
      return Array.isArray(x) ? x.length : !!x;
    }).length;
  const andList = (xs) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} e ${xs[xs.length - 1]}`);
  /** Momentos do dia que ainda faltam (com rascunho): ['Almoço de 2 crianças', 'Lanche da tarde', 'Sono']. */
  const missingMoments = (v, kids, fields) =>
    kids.length
      ? fields
          .map((f) => {
            const n = kids.length - filledCount(v, kids, f.key);
            return n <= 0 ? null : n === kids.length ? f.label : `${f.label} de ${U.plural(n, 'criança', 'crianças')}`;
          })
          .filter(Boolean)
      : [];

  const optBtn = (sid, key, opt, on, extra = '') => html`<button type="button" class="ro-opt ${toneOf(opt)} ${extra}" data-ro-opt="${key}" data-sid="${sid}" data-v="${opt}" aria-pressed="${tf(on)}" ${extra === 'is-ro' ? raw('disabled') : ''}>${on ? icon('check') : ''}${opt}</button>`;
  const fieldOpts = (v, sid, f, ro) =>
    html`<div class="ro-opts" role="group" aria-label="${f.label}">${f.options.map((o) => (ro ? (valueOf(v, sid, f.key) === o ? optBtn(sid, f.key, o, true, 'is-ro') : '') : optBtn(sid, f.key, o, valueOf(v, sid, f.key) === o)))}${ro && !valueOf(v, sid, f.key) ? html`<span class="muted small">—</span>` : ''}</div>`;
  const bringOpts = (v, sid, ro) => {
    const cur = valueOf(v, sid, 'bring');
    const opts = [...new Set(bringDef().concat(cur))];
    return html`<div class="ro-opts" role="group" aria-label="Mandar amanhã">${opts.map((o) => (ro && !cur.includes(o) ? '' : html`<button type="button" class="ro-opt" data-ro-bring="${o}" data-sid="${sid}" aria-pressed="${tf(cur.includes(o))}" ${ro ? raw('disabled') : ''}>${cur.includes(o) ? icon('check') : ''}${o}</button>`))}${ro && !cur.length ? html`<span class="muted small">—</span>` : ''}</div>`;
  };
  const noteBox = (v, sid, name, ro) => html`<textarea class="input ro-note" rows="2" maxlength="500" data-ro-note="${sid}" aria-label="Observação sobre ${name}" placeholder="Algo especial do dia (opcional)" ${ro ? raw('disabled') : ''}>${valueOf(v, sid, 'note')}</textarea>`;

  const renderStaff = (rest) => {
    const v = RS();
    const classes = infantClasses();
    // #rotina/<turma>/<data> vale ao chegar pela rota; depois a turma e o dia escolhidos na tela prevalecem
    const restKey = (rest || []).join('/');
    if (restKey !== v.lastRest) {
      v.lastRest = restKey;
      if (rest && rest[0] && classes.some((c) => c.id === rest[0])) v.classId = rest[0];
      if (rest && rest[1] && U.isValidDate(rest[1]) && rest[1] <= today()) v.date = rest[1];
    }
    if (!classes.some((c) => c.id === v.classId)) v.classId = (classes.find((c) => editable(c.id)) || classes[0] || {}).id || '';
    if (!U.isValidDate(v.date) || v.date > today()) v.date = today();
    const fields = fieldsDef();
    const keys = fields.map((f) => f.key).concat(['bring', 'note']);
    if (!keys.includes(v.field)) v.field = keys[0];
    const head = html`<div class="page-head"><div><h1>Rotina do dia</h1><p class="lead">Alimentação, sono, higiene e humor das crianças. As famílias recebem quando você envia.</p></div></div>`;
    if (!classes.length) return html`${head}<div class="card">${UI.empty({ icon: 'sun', title: 'Nenhuma turma de Educação Infantil', text: 'A rotina do dia aparece para as turmas da Educação Infantil em que você trabalha.' })}</div>`;
    const c = Q.klass(v.classId);
    const kids = Q.students({ classId: v.classId });
    const ro = !editable(v.classId);
    const T = today();
    const keysStored = kids.map((s) => Q.routine(v.classId, v.date, s.id)).filter(Boolean);
    const sent = keysStored.filter((r) => r.sentAt);
    const unsent = keysStored.filter((r) => !r.sentAt);
    const lastSent = sent.map((r) => r.sentAt).sort().pop();
    const changed = changedIds(v);
    const missing = missingMoments(v, kids, fields);
    const fieldLabel = (k) => (k === 'bring' ? 'Mandar amanhã' : k === 'note' ? 'Observação' : (fields.find((f) => f.key === k) || {}).label || k);
    const holiday = Q.holiday(v.date);
    const noClass = !Q.isSchoolDay(v.date);

    let status;
    if (!keysStored.length) status = html`${UI.pill('Ainda não preenchida', 'warn')}<span class="grow small muted">Preencha ao longo do dia e envie às famílias no fim da tarde.</span>`;
    else if (!unsent.length) status = html`${UI.pill(`Enviada ${U.fmtInstant(lastSent)}`, 'ok')}<span class="grow small muted">As famílias de ${U.plural(sent.length, 'criança', 'crianças')} já veem. Correções feitas depois aparecem para elas na hora.</span>`;
    else status = html`${UI.pill(sent.length ? `${unsent.length} ainda não enviada${unsent.length === 1 ? '' : 's'}` : 'Ainda não enviada', 'warn')}<span class="grow small muted">${sent.length ? `Enviada antes para ${U.plural(sent.length, 'criança', 'crianças')}${lastSent ? ` (${U.fmtInstant(lastSent)})` : ''}.` : `Começada para ${keysStored.length === kids.length && kids.length > 1 ? `as ${kids.length} crianças` : U.plural(keysStored.length, 'criança', 'crianças')}; só a equipe vê até você enviar.`}</span>`;
    // o que falta preencher (a mesma conta dos números dos momentos), em vez de "0/15 completas"
    const progress = !kids.length || (!keysStored.length && !changed.length)
      ? ''
      : missing.length
        ? html`<span class="small ro-missing">${icon('clock')}<span><b>Falta:</b> ${andList(missing)}</span></span>`
        : html`<span class="small ro-complete">${icon('checkCircle')}<span>Todos os momentos preenchidos</span></span>`;

    let body;
    if (!kids.length) body = html`<div class="card">${UI.empty({ icon: 'users', title: 'Nenhuma criança ativa nesta turma', text: 'Quando houver alunos matriculados, a rotina aparece aqui.' })}</div>`;
    else if (v.mode === 'momento') {
      const k = v.field;
      const f = fields.find((x) => x.key === k);
      body = html`<div class="ro-fields" role="tablist" aria-label="Momento do dia">${keys.map((key) => {
          const n = filledCount(v, kids, key);
          return html`<button type="button" class="chip ${key === k ? 'on' : ''}" role="tab" aria-selected="${tf(key === k)}" data-ro-field="${key}">${icon(key === 'bring' ? 'briefcase' : key === 'note' ? 'message' : fieldIcon(key, fieldLabel(key)))}${fieldLabel(key)}${key !== 'note' && key !== 'bring' ? html`<span class="ro-done">${n}/${kids.length}</span>` : ''}</button>`;
        })}</div>
        <section class="card">
          ${!ro && f ? html`<div class="ro-bulk"><span>Aplicar a todos:</span>${f.options.map((o) => html`<button type="button" class="ro-opt ${toneOf(o)}" data-ro-all="${o}">${o}</button>`)}${filledCount(v, kids, k) ? html`<button type="button" class="btn sm ghost" data-ro-all="">Limpar</button>` : ''}</div>` : ''}
          ${!ro && k === 'bring' ? html`<div class="ro-bulk"><span>Para todos:</span>${bringDef().map((o) => html`<button type="button" class="ro-opt" data-ro-bringall="${o}">${icon('plus')}${o}</button>`)}</div>` : ''}
          <ul class="ro-list">${kids.map((s) => html`<li class="ro-row ${draftOf(v)[s.id] ? 'is-changed' : ''}" data-ro-row="${s.id}">
              <div class="person">${UI.avatar(s.name, 'sm', s.photo)}<div><span class="person-name">${s.name}</span>${s.alerts && can('alunos.alertas') ? html`<div class="person-sub" title="${s.alerts}">${icon('heart')} alerta de saúde</div>` : ''}</div></div>
              ${f ? fieldOpts(v, s.id, f, ro) : k === 'bring' ? bringOpts(v, s.id, ro) : noteBox(v, s.id, s.name, ro)}
            </li>`)}</ul>
        </section>`;
    } else {
      body = html`<div class="ro-kid-grid">${kids.map((s) => html`<section class="card ro-kid ${draftOf(v)[s.id] ? 'is-changed' : ''}" data-ro-row="${s.id}">
          <div class="ro-kid-h">${UI.avatar(s.name, '', s.photo)}<div class="grow"><b>${s.name}</b><div class="small muted">${(() => {
            const r = Q.routine(v.classId, v.date, s.id);
            return r ? (r.sentAt ? `Enviada ${U.fmtInstant(r.sentAt)}` : `Salva ${U.fmtInstant(r.at)} · não enviada`) : 'Sem registro';
          })()}</div></div></div>
          ${fields.map((f) => html`<div class="ro-frow"><span>${f.label}</span>${fieldOpts(v, s.id, f, ro)}</div>`)}
          <div class="ro-frow"><span>Mandar amanhã</span>${bringOpts(v, s.id, ro)}</div>
          <div class="ro-frow"><span>Observação</span>${noteBox(v, s.id, s.name, ro)}</div>
        </section>`)}</div>`;
    }

    return html`${head}
      <div class="ro-toolbar">
        <select class="input" data-ro-class aria-label="Turma">${classes.map((x) => html`<option value="${x.id}" ${x.id === v.classId ? raw('selected') : ''}>${x.name}</option>`)}</select>
        <div class="date-nav">
          <button type="button" class="icon-btn" data-ro-nav="-1" aria-label="Dia anterior">${icon('chevronLeft')}</button>
          <span class="ag-nav-l">${U.cap(relShort(v.date))}${v.date === T ? html` <span class="muted">· ${ddmm(v.date)}</span>` : ''}</span>
          <button type="button" class="icon-btn" data-ro-nav="1" aria-label="Próximo dia" ${v.date >= T ? raw('disabled') : ''}>${icon('chevronRight')}</button>
          <input type="date" class="input ag-dateinput" data-ro-date value="${v.date}" max="${T}" aria-label="Escolher data">
        </div>
        ${v.date !== T ? html`<button type="button" class="btn sm ghost" data-ro-nav="0">Hoje</button>` : ''}
        <span class="grow"></span>
        ${seg([['momento', 'Por momento'], ['crianca', 'Por criança']], v.mode, 'data-ro-mode')}
      </div>
      ${ro ? html`<div class="notice">${icon('eye')}<span class="grow">Você vê a rotina do ${c ? c.name : 'turma'}, mas só quem trabalha na turma pode preencher.</span></div>` : ''}
      ${noClass ? html`<div class="notice warn">${icon('calendar')}<span class="grow">${holiday ? `${holiday}: ` : ''}${U.cap(U.fmtDateLong(v.date))} não é dia letivo.</span></div>` : ''}
      <section class="card ro-status">${icon('sun')}${status}${progress}</section>
      ${body}
      ${!ro && kids.length
        ? html`<div class="ro-savebar" role="region" aria-label="Salvar rotina">
            <span class="grow" data-ro-count>${changed.length ? html`<b>${U.plural(changed.length, 'criança alterada', 'crianças alteradas')}</b> · ainda não salvo` : keysStored.length ? 'Tudo salvo.' : 'Nada preenchido ainda.'}</span>
            ${changed.length ? html`<button type="button" class="btn ghost" data-ro-discard>Descartar</button><button type="button" class="btn" data-ro-save>${icon('check')}Salvar</button>` : ''}
            <button type="button" class="btn primary" data-ro-send ${!changed.length && !unsent.length ? raw('disabled') : ''}>${icon('send')}${changed.length ? 'Salvar e enviar' : unsent.length ? 'Enviar às famílias' : 'Enviado'}</button>
          </div>`
        : ''}`;
  };

  const save = async (v, btn, quiet = false) => {
    const all = draftOf(v);
    const ids = Object.keys(all);
    if (!ids.length) return true;
    const entries = {};
    for (const sid of ids) entries[sid] = all[sid];
    const res = await UI.act('routines.save', { classId: v.classId, date: v.date, entries }, { btn, ok: quiet ? null : `Rotina salva (${U.plural(ids.length, 'criança', 'crianças')})` });
    if (!res) return false;
    v.drafts[`${v.classId}|${v.date}`] = {};
    Store.emit();
    return true;
  };

  /** Depois de re-renderizar, devolve o foco ao mesmo controle (teclado e leitor de tela). */
  let refocus = null;
  const focusKey = (b) => {
    for (const a of ['roOpt', 'roBring', 'roAll', 'roBringall', 'roField', 'roMode', 'roNav']) if (b.dataset[a] != null) return { a, v: b.dataset[a], sid: b.dataset.sid || '', val: b.dataset.v || '' };
    return null;
  };
  const mountStaff = (el) => {
    const v = RS();
    if (refocus) {
      const k = refocus;
      refocus = null;
      const target = UI.$$('button', el).find((b) => b.dataset[k.a] === k.v && (b.dataset.sid || '') === k.sid && (b.dataset.v || '') === k.val);
      target && target.focus({ preventScroll: true });
    }
    const refreshCount = () => {
      // mudanças de rascunho mudam os botões: re-renderiza sem perder a rolagem
      App.render();
    };
    el.addEventListener('click', async (e) => {
      const b = e.target.closest('button');
      if (!b || !el.contains(b) || b.disabled) return;
      refocus = focusKey(b);
      if (b.dataset.roOpt) {
        if (!editable(v.classId)) return;
        const cur = valueOf(v, b.dataset.sid, b.dataset.roOpt);
        setDraft(v, b.dataset.sid, b.dataset.roOpt, cur === b.dataset.v ? '' : b.dataset.v);
        return refreshCount();
      }
      if (b.dataset.roBring != null) {
        if (!editable(v.classId)) return;
        const cur = valueOf(v, b.dataset.sid, 'bring');
        const o = b.dataset.roBring;
        setDraft(v, b.dataset.sid, 'bring', cur.includes(o) ? cur.filter((x) => x !== o) : cur.concat([o]));
        return refreshCount();
      }
      if (b.dataset.roAll != null) {
        for (const s of Q.students({ classId: v.classId })) setDraft(v, s.id, v.field, b.dataset.roAll);
        return refreshCount();
      }
      if (b.dataset.roBringall != null) {
        const kids = Q.students({ classId: v.classId });
        const o = b.dataset.roBringall;
        const everyone = kids.every((s) => valueOf(v, s.id, 'bring').includes(o));
        for (const s of kids) {
          const cur = valueOf(v, s.id, 'bring');
          setDraft(v, s.id, 'bring', everyone ? cur.filter((x) => x !== o) : cur.includes(o) ? cur : cur.concat([o]));
        }
        return refreshCount();
      }
      if (b.dataset.roField) {
        v.field = b.dataset.roField;
        return App.render();
      }
      if (b.dataset.roMode) {
        v.mode = b.dataset.roMode;
        return App.render();
      }
      if (b.dataset.roNav != null) {
        const n = Number(b.dataset.roNav);
        const next = n === 0 ? today() : U.addDays(v.date, n);
        if (next <= today()) v.date = next;
        return App.render();
      }
      if (b.hasAttribute('data-ro-discard')) {
        const n = changedIds(v).length;
        if (!(await UI.confirm({ title: 'Descartar alterações?', text: `O que você marcou para ${U.plural(n, 'criança', 'crianças')} e ainda não salvou será perdido.`, ok: 'Descartar', danger: true }))) return;
        v.drafts[`${v.classId}|${v.date}`] = {};
        return App.render();
      }
      if (b.hasAttribute('data-ro-save')) return save(v, b);
      if (b.hasAttribute('data-ro-send')) {
        const miss = missingMoments(v, Q.students({ classId: v.classId }), fieldsDef());
        if (
          miss.length &&
          !(await UI.confirm({
            title: 'Enviar a rotina incompleta?',
            text: html`<p>Ainda falta: <b>${andList(miss)}</b>.</p><p style="margin-top:8px">As famílias veem só o que foi preenchido. Se você completar depois, elas veem na hora.</p>`,
            ok: 'Enviar assim',
          }))
        )
          return;
        if (!(await save(v, b, true))) return;
        const res = await UI.act('routines.send', { classId: v.classId, date: v.date }, { btn: document.contains(b) ? b : null });
        if (res) UI.toast(`Rotina enviada às famílias de ${U.plural(res.result.sent, 'criança', 'crianças')}`, { ic: 'send' });
      }
    });
    el.addEventListener('input', (e) => {
      const t = e.target;
      if (t.matches('[data-ro-note]')) {
        const had = !!draftOf(v)[t.dataset.roNote];
        setDraft(v, t.dataset.roNote, 'note', t.value);
        const has = !!draftOf(v)[t.dataset.roNote];
        const row = t.closest('[data-ro-row]');
        if (row) row.classList.toggle('is-changed', has);
        if (had !== has) {
          const c = UI.$('[data-ro-count]', el);
          const n = changedIds(v).length;
          if (c) UI.setHTML(c, n ? html`<b>${U.plural(n, 'criança alterada', 'crianças alteradas')}</b> · ainda não salvo` : 'Tudo salvo.');
        }
      }
    });
    // ao sair do campo de observação, mostra os botões de salvar
    el.addEventListener('focusout', (e) => {
      if (e.target.matches && e.target.matches('[data-ro-note]')) setTimeout(() => {
        if (!el.contains(document.activeElement) || !document.activeElement.matches('[data-ro-note]')) App.render();
      }, 0);
    });
    el.addEventListener('change', (e) => {
      const t = e.target;
      if (t.matches('[data-ro-class]')) {
        v.classId = t.value;
        return App.render();
      }
      if (t.matches('[data-ro-date]') && U.isValidDate(t.value) && t.value <= today()) {
        v.date = t.value;
        App.render();
      }
    });
  };

  App.page({
    id: 'rotina',
    label: 'Rotina do dia',
    icon: 'sun',
    group: 'Dia a dia',
    order: 18,
    perm: 'diario.publicar',
    keys: 'educação infantil alimentação sono fralda creche',
    when: () => Q.classes().some(isInfant),
    badge: () => {
      const T = today();
      if (!Q.isSchoolDay(T)) return null;
      // só para quem trabalha na turma (regente/auxiliar), não para a coordenação
      const mine = Q.myClasses().filter((c) => isInfant(c) && editable(c.id));
      const n = mine.filter((c) => {
        const kids = Q.students({ classId: c.id });
        const list = kids.map((s) => Q.routine(c.id, T, s.id)).filter(Boolean);
        return kids.length && (!list.length || list.some((r) => !r.sentAt));
      }).length;
      return n ? { n, title: 'Turmas com a rotina de hoje ainda não enviada' } : null;
    },
    render: (rest) => renderStaff(rest),
    mount: (el) => mountStaff(el),
  });

  /** Turmas da Educação Infantil em que a pessoa preenche a rotina (regente/auxiliar com vínculo). */
  const myInfantClasses = () => Q.myClasses().filter((c) => isInfant(c) && editable(c.id) && Q.students({ classId: c.id }).length);
  const openRoutine = (classId) => {
    const v = RS();
    if (classId) v.classId = classId;
    v.date = today();
    App.go('rotina');
  };

  App.action({
    id: 'rotina-dia',
    label: 'Preencher rotina do dia',
    icon: 'sun',
    order: 4,
    perm: 'diario.publicar',
    keys: 'rotina educação infantil alimentação lanche almoço sono fralda humor creche',
    when: () => myInfantClasses().length > 0,
    run: () => {
      const list = myInfantClasses();
      openRoutine(list.length === 1 ? list[0].id : null);
    },
  });

  App.widget({
    id: 'rotina-hoje',
    order: 11,
    size: 'half',
    perm: 'diario.publicar',
    when: () => myInfantClasses().length > 0,
    render() {
      const T = today();
      const fields = fieldsDef();
      const school = Q.isSchoolDay(T);
      const hol = Q.holiday(T);
      const rows = myInfantClasses().map((c) => {
        const kids = Q.students({ classId: c.id });
        const v = { classId: c.id, date: T, drafts: RS().drafts };
        const recs = kids.map((s) => Q.routine(c.id, T, s.id)).filter(Boolean);
        const unsent = recs.filter((r) => !r.sentAt).length;
        const lastSent = recs.map((r) => r.sentAt).filter(Boolean).sort().pop();
        const missing = missingMoments(v, kids, fields);
        const dirty = changedIds(v).length;
        const state = !recs.length ? 'vazia' : unsent ? 'pendente' : 'enviada';
        const pill = state === 'vazia' ? UI.pill('Não preenchida', 'warn') : state === 'pendente' ? UI.pill(unsent < recs.length ? `${unsent} não enviada${unsent === 1 ? '' : 's'}` : 'Não enviada', 'warn') : UI.pill(`Enviada ${U.fmtInstant(lastSent)}`, 'ok');
        const sub = !recs.length && !dirty ? 'Preencha ao longo do dia e envie no fim da tarde.' : missing.length ? `Falta: ${andList(missing)}` : 'Todos os momentos preenchidos';
        const btn = state === 'enviada' && !dirty ? html`<button type="button" class="btn sm ghost" data-w-ro="${c.id}">Ver</button>` : html`<button type="button" class="btn sm ${missing.length ? '' : 'primary'}" data-w-ro="${c.id}">${!recs.length ? 'Preencher' : missing.length ? 'Continuar' : 'Revisar e enviar'}</button>`;
        return html`<li><span class="ro-w-ic" aria-hidden="true">${icon('sun')}</span><div class="grow"><div class="ro-w-top"><b>${c.name}</b>${pill}</div><div class="person-sub ro-w-sub">${sub}${dirty ? html` · <span class="ro-w-dirty">${U.plural(dirty, 'alteração não salva', 'alterações não salvas')}</span>` : ''}</div></div>${btn}</li>`;
      });
      return html`<section class="card ro-widget">
        <div class="card-head"><h2>${icon('sun')}Rotina de hoje</h2><a class="btn sm ghost" href="#rotina">Abrir rotina${icon('chevronRight')}</a></div>
        <div class="card-body">${school ? html`<ul class="items ro-w-list">${rows}</ul>` : html`<p class="ro-w-msg">${icon('sun')}<span>Hoje não é dia letivo${hol ? ` (${hol})` : ''}: não há rotina para enviar.</span></p>`}</div>
      </section>`;
    },
    mount(el) {
      el.addEventListener('click', (e) => {
        const b = e.target.closest('[data-w-ro]');
        if (b) openRoutine(b.dataset.wRo);
      });
    },
  });

  // =====================================================================
  // Família
  // =====================================================================
  const FS = () => PageState.get('rotina-familia', { child: '', date: '' });
  const older = { owner: '', map: new Map(), done: new Set() };
  const cache = () => {
    const k = me() ? `${me().id}|${Store.preview ? Store.preview.id : ''}` : '';
    if (older.owner !== k) {
      older.owner = k;
      older.map = new Map();
      older.done = new Set();
    }
    return older;
  };
  const infantKids = () => Q.myChildren().filter((s) => isInfant(Q.klass(s.classId)));
  /** Dias com rotina enviada para a criança (retrato + histórico carregado), do mais novo ao mais antigo. */
  const daysOf = (s) => {
    const out = new Map();
    const suffix = `|${s.id}`;
    for (const [k, r] of Object.entries(Store.state.routines)) if (k.endsWith(suffix) && r.sentAt) out.set(k.split('|')[1], { key: k, r });
    for (const [k, r] of cache().map) if (k.endsWith(suffix) && r.sentAt && !out.has(k.split('|')[1])) out.set(k.split('|')[1], { key: k, r });
    return [...out.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1)).map(([date, x]) => ({ date, ...x }));
  };

  const famCard = (s, day) => {
    const fields = fieldsDef();
    const r = day.r;
    const who = Q.user(r.by);
    return html`<section class="card ro-fcard">
      <div class="ro-fhead">${UI.avatar(s.name, '', s.photo)}<div class="grow"><h2>${U.firstName(s.name)}</h2><span class="small muted">${U.cap(U.fmtDateLong(day.date))}</span></div>${UI.pill(`Enviada ${U.fmtInstant(r.sentAt)}`, 'ok')}</div>
      <div class="ro-items">${fields.map((f) => {
        const val = (r.fields || {})[f.key];
        return html`<div class="ro-item"><span class="ro-ic ${val ? toneOf(val) : ''}">${icon(fieldIcon(f.key, f.label))}</span><div><small>${f.label}</small><b>${val || html`<span class="muted">Sem registro</span>`}</b></div></div>`;
      })}</div>
      ${(r.bring || []).length ? html`<div class="ro-bring">${icon('briefcase')}<div><b>Mandar amanhã:</b> ${r.bring.join(', ')}</div></div>` : ''}
      ${r.note ? html`<div class="ro-fnote">${icon('message')}<div><b class="small">Recado da escola</b><p>${r.note}</p></div></div>` : ''}
      <p class="small muted">${who ? `Registrado por ${U.shortName(who.name)}${who.title ? ` (${who.title})` : ''}` : 'Registrado pela escola'} · ${U.fmtInstant(r.at)}</p>
    </section>`;
  };

  const renderFamily = () => {
    const kids = infantKids();
    const head = html`<div class="page-head"><div><h1>Rotina</h1><p class="lead">Como foi o dia: alimentação, sono, higiene e humor.</p></div></div>`;
    if (!kids.length) return html`${head}<div class="card">${UI.empty({ icon: 'sun', title: 'Sem rotina para mostrar', text: 'A rotina do dia é enviada pelas turmas da Educação Infantil.' })}</div>`;
    const v = FS();
    const s = kids.find((k) => k.id === v.child) || kids[0];
    const days = daysOf(s);
    const T = today();
    const day = days.find((d) => d.date === v.date) || days.find((d) => d.date === T) || null;
    const selected = day ? day.date : v.date && v.date !== T ? v.date : T;
    const key = `r|${s.id}`;
    return html`${head}
      ${kids.length > 1
        ? html`<div class="ag-kids" role="group" aria-label="Escolher filho">${kids.map((k) => html`<button type="button" class="ag-kid ${k.id === s.id ? 'on' : ''}" data-ro-kid="${k.id}" aria-pressed="${tf(k.id === s.id)}">${UI.avatar(k.name, 'sm', k.photo)}<span>${U.firstName(k.name)}</span></button>`)}</div>`
        : ''}
      <div class="ro-days" role="group" aria-label="Dias">
        <button type="button" class="chip ${selected === T ? 'on' : ''}" data-ro-day="${T}" aria-pressed="${tf(selected === T)}">Hoje</button>
        ${days.filter((d) => d.date !== T).slice(0, 10).map((d) => html`<button type="button" class="chip ${selected === d.date ? 'on' : ''}" data-ro-day="${d.date}" aria-pressed="${tf(selected === d.date)}">${U.cap(relShort(d.date))}</button>`)}
      </div>
      ${day
        ? famCard(s, day)
        : html`<div class="card">${UI.empty({ icon: 'sun', title: selected === T ? 'A rotina de hoje ainda não chegou' : 'Sem rotina neste dia', text: selected === T ? 'A escola envia a rotina no fim do dia. Você pode ver os dias anteriores acima.' : 'Escolha outro dia.' })}</div>`}
      <div class="ag-fmore">${cache().done.has(key) ? html`<span class="small muted">Dias anteriores carregados.</span>` : html`<button type="button" class="btn ghost" data-ro-hist="${s.id}">${icon('history')}Carregar dias anteriores</button>`}</div>`;
  };

  const mountFamily = (el) => {
    el.addEventListener('click', async (e) => {
      const k = e.target.closest('[data-ro-kid]');
      if (k) {
        Object.assign(FS(), { child: k.dataset.roKid, date: '' });
        return App.render();
      }
      const d = e.target.closest('[data-ro-day]');
      if (d) {
        FS().date = d.dataset.roDay;
        return App.render();
      }
      const h = e.target.closest('[data-ro-hist]');
      if (h) {
        h.disabled = true;
        h.classList.add('loading');
        const sid = h.dataset.roHist;
        const days = daysOf(Q.student(sid) || { id: sid });
        const oldest = days.length ? days[days.length - 1].date : today();
        const owner = cache().owner;
        try {
          const r = await Api.history('routines', { studentId: sid, before: oldest, limit: 30 });
          if (cache().owner !== owner) return; // trocou de conta enquanto carregava: descarta
          for (const x of r.items || []) if (x && x.id && x.value) cache().map.set(x.id, x.value);
          cache().done.add(`r|${sid}`);
          Store.emit();
        } catch (err) {
          UI.errorToast(err);
          h.disabled = false;
          h.classList.remove('loading');
        }
      }
    });
  };

  App.page({
    id: 'rotina',
    label: 'Rotina',
    icon: 'sun',
    family: true,
    order: 20,
    when: () => infantKids().length > 0,
    render: () => renderFamily(),
    mount: (el) => mountFamily(el),
  });
})();
