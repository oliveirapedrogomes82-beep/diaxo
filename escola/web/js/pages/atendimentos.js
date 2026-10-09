'use strict';
/* Atendimentos — psicologia, psicopedagogia, orientação educacional, AEE e serviço social — e planos de apoio (PEI).
   Sigilo (LGPD): o retrato traz só metadados (aluno, área, data, tipo, sigilo, autor); o texto vem por
   Api.supportRead(id), que é auditado — a tela avisa antes de abrir. Só o autor edita; depois de 24 h o texto
   original fica guardado e a correção é por adendo; ninguém exclui.
   Planos: criar/editar (metas, adaptações, compartilhar com professores, coordenação e família), encerrar/reativar,
   situação do "ciente" da família. Professores com vínculo recebem só as adaptações (aba "Adaptações recomendadas").
   Comandos: support.save, support.addendum, plans.save, plans.status (web/core/commands/atendimentos.js). */
(() => {
  const can = (p) => Store.can(p);
  const me = () => Store.me;
  const today = () => U.today();
  const tf = (b) => (b ? 'true' : 'false');
  const textHTML = (s) => raw(U.linkify(U.esc(s || '')));
  const canWrite = () => can('atendimentos.registrar') && !Store.preview;
  const DAY_MS = 24 * 3600 * 1000;

  const TYPES = {
    atendimento: { label: 'Atendimento', icon: 'heart', tone: 'c7' },
    observacao: { label: 'Observação', icon: 'eye', tone: 'c1' },
    familia: { label: 'Conversa com a família', icon: 'users', tone: 'c3' },
    devolutiva: { label: 'Devolutiva', icon: 'message', tone: 'c4' },
    encaminhamento: { label: 'Encaminhamento', icon: 'external', tone: 'c2' },
  };
  const typeOf = (t) => TYPES[t] || TYPES.atendimento;
  const typeIcon = (t, extra = '') => html`<span class="at-type ${typeOf(t).tone} ${extra}" aria-hidden="true">${icon(typeOf(t).icon)}</span>`;
  const areaLabel = (a) => Q.AREAS[a] || 'Apoio';
  const CONF = {
    autor: { label: 'Só eu', icon: 'lock', text: () => 'Só quem escreveu lê. Nem a direção nem outros profissionais.' },
    area: { label: 'Minha área', icon: 'shield', text: (a) => `Quem escreveu e os profissionais de ${a ? areaLabel(a).toLowerCase() : 'mesma área'} com acesso a atendimentos compartilhados.` },
    apoio: { label: 'Equipe de apoio', icon: 'users', text: () => 'Profissionais de apoio (psicologia, psicopedagogia, orientação, AEE…) com acesso a atendimentos compartilhados.' },
  };
  const confOf = (c) => CONF[c] || CONF.autor;
  const confTag = (r) => html`<span class="at-conf ${r.confidentiality}" title="${confOf(r.confidentiality).text(r.area)}">${icon(confOf(r.confidentiality).icon)}${confOf(r.confidentiality).label}</span>`;

  const student = (id) => Q.student(id);
  const className = (s) => (s && Q.klass(s.classId) ? Q.klass(s.classId).name : '');
  const userShort = (id) => (me() && id === me().id ? 'você' : U.shortName(Q.userName(id, 'Equipe de apoio')));
  const studentLink = (s) => (s ? (App.pages().some((p) => p.id === 'alunos') ? html`<a href="#alunos/${s.id}">${s.name}</a>` : html`<b>${s.name}</b>`) : html`<b>Aluno</b>`);
  const validInstant = (iso) => iso && !isNaN(Date.parse(iso));
  const at = (iso) => (validInstant(iso) ? U.fmtInstant(iso) : '');
  const within24 = (r) => validInstant(r.createdAt) && Date.now() - Date.parse(r.createdAt) < DAY_MS;
  const editDeadline = (r) => (validInstant(r.createdAt) ? U.fmtInstant(new Date(Date.parse(r.createdAt) + DAY_MS).toISOString()) : '');
  const dateChip = (d) => html`<span class="date-chip ${d === today() ? 'today' : ''}"><b>${Number(d.slice(8))}</b><span>${U.MONTHS_SHORT[Number(d.slice(5, 7)) - 1]}</span></span>`;

  /** Nas gavetas do módulo: o aviso de erro de um campo some assim que a pessoa corrige. */
  const clearOnEdit = (el) =>
    el.addEventListener('input', (e) => {
      const f = e.target.closest && e.target.closest('[data-field]');
      if (!f) return;
      UI.$$('.error', f).forEach((x) => x.remove());
      UI.$$('.input.invalid', f).forEach((x) => {
        x.classList.remove('invalid');
        x.removeAttribute('aria-invalid');
      });
    });

  const records = () => Store.state.support.slice().sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.createdAt || '').localeCompare(a.createdAt || ''));
  /** Plano completo (autor ou atendimentos.conteudo): traz sharedWith. Os recortes (coordenação, professores) não. */
  const isFull = (p) => !!p.sharedWith;
  const canEditPlan = (p) => canWrite() && isFull(p) && (p.authorId === me().id || can('atendimentos.conteudo'));

  // =====================================================================
  // Registro (leitura auditada)
  // =====================================================================
  const metaRows = (r) => {
    const s = student(r.studentId);
    return UI.kv([
      ['Aluno', html`${studentLink(s)}${className(s) ? html` <span class="muted">· ${className(s)}</span>` : ''}`],
      ['Data', U.fmtDateLong(r.date)],
      ['Tipo', typeOf(r.type).label],
      ['Área', areaLabel(r.area)],
      ['Quem pode ler', html`${confTag(r)}<span class="small muted">${confOf(r.confidentiality).text(r.area)}</span>`],
      ['Registrado por', html`${Q.userName(r.authorId, 'Equipe de apoio')}${r.authorId === me().id ? html` <span class="muted">(você)</span>` : ''}`],
      r.createdAt ? ['Registrado', at(r.createdAt)] : null,
    ]);
  };

  const contentHTML = (r, c) => {
    const mine = r.authorId === me().id;
    const fresh = within24(r);
    return html`<div class="at-read">
      <section><h3>Registro</h3><div class="at-text">${textHTML(c.content)}</div></section>
      ${c.nextSteps ? html`<section><h3>Próximos passos</h3><div class="at-text">${textHTML(c.nextSteps)}</div></section>` : ''}
      ${(c.addenda || []).length
        ? html`<section><h3>Adendos</h3><ol class="at-addenda">${c.addenda.map((a) => html`<li><div class="small muted">${userShort(a.by) === 'você' ? 'Você' : userShort(a.by)} · ${at(a.at)}</div><div class="at-text">${textHTML(a.text)}</div></li>`)}</ol></section>`
        : ''}
      ${mine && canWrite()
        ? html`<section class="at-author">
            ${fresh
              ? html`<p class="small muted">${icon('clock')}Você pode corrigir o texto até ${editDeadline(r)}. Depois, o original fica guardado e a correção é por adendo.</p>`
              : html`<p class="small muted">${icon('lock')}O texto original não muda depois de 24 horas. Para corrigir ou completar, acrescente um adendo.</p>`}
            <form class="at-addendum" data-at-addendum novalidate>
              <div class="field" data-field="text"><label for="at-add-text">Acrescentar adendo</label><textarea id="at-add-text" class="input" rows="3" maxlength="3000" placeholder="Correção ou informação nova. Fica com data, hora e o seu nome."></textarea></div>
              <div class="btn-row"><button type="submit" class="btn">${icon('plus')}Salvar adendo</button><button type="button" class="btn ghost" data-at-edit>${icon('pencil')}${fresh ? 'Corrigir registro' : 'Alterar data, tipo ou sigilo'}</button></div>
            </form>
          </section>`
        : !mine
          ? html`<p class="small muted at-only-author">${icon('info')}Só ${Q.userName(r.authorId, 'quem escreveu')} pode acrescentar adendos a este registro.</p>`
          : ''}
    </div>`;
  };

  /** Lê o texto (auditado). O servidor responde not_found quando o sigilo ou o acesso mudou. */
  const readSupport = async (id) => {
    try {
      return await Api.supportRead(id);
    } catch (err) {
      if (err && (err.code === 'not_found' || err.status === 404)) throw new Error('Este registro não está mais disponível para você (o sigilo ou o seu acesso pode ter mudado).');
      throw err;
    }
  };

  const openRecord = (id) => {
    const r0 = Store.byId('support', id);
    if (!r0) return UI.toast('Registro não encontrado. Ele pode não estar mais visível para você.', { tone: 'bad' });
    const s = student(r0.studentId);
    const mine = r0.authorId === me().id;
    let loaded = null;
    const gate = () => html`${metaRows(Store.byId('support', id) || r0)}
      <div class="notice at-audit">${icon('shield')}<span class="grow"><b>Este acesso fica registrado.</b> Ao abrir o texto, o sistema guarda quem abriu, o dia e a hora no histórico de atividades da escola (LGPD).</span></div>
      <div class="btn-row at-gate"><button type="button" class="btn primary" data-at-read>${icon('eye')}Abrir o registro</button></div>`;
    const body = () => {
      const r = Store.byId('support', id) || r0;
      return html`${metaRows(r)}<p class="small muted at-audit-mini">${icon('shield')}Este acesso fica registrado no histórico de atividades.</p>${contentHTML(r, loaded)}`;
    };
    const read = async (api) => {
      api.setBody(html`${metaRows(r0)}<div class="at-loading">${UI.spinner()}<span class="muted">Abrindo o registro…</span></div>`);
      try {
        loaded = await readSupport(id);
        api.setBody(body());
      } catch (err) {
        api.setBody(html`${metaRows(r0)}<div class="notice warn">${icon('alert')}<span class="grow">${err.message || 'Não foi possível abrir o registro.'}</span></div>`);
      }
    };
    UI.modal({
      title: `${typeOf(r0.type).label} · ${U.fmtDate(r0.date)}`,
      sub: html`${s ? s.name : 'Aluno'}${className(s) ? ` · ${className(s)}` : ''} · ${areaLabel(r0.area)}`,
      drawer: true,
      cls: 'at-drawer',
      body: mine ? html`${metaRows(r0)}<div class="at-loading">${UI.spinner()}</div>` : gate(),
      foot: html`<button type="button" class="btn" data-close>Fechar</button>`,
      onMount(el, api) {
        if (mine) read(api);
        el.addEventListener('click', async (e) => {
          if (e.target.closest('[data-at-read]')) return read(api);
          if (e.target.closest('[data-at-edit]')) {
            const r = Store.byId('support', id);
            if (!r || !loaded) return;
            openRecordForm({ record: r, content: loaded, onSaved: (patch) => {
              Object.assign(loaded, patch);
              api.setBody(body());
            } });
          }
        });
        el.addEventListener('submit', async (e) => {
          const f = e.target.closest('[data-at-addendum]');
          if (!f) return;
          e.preventDefault();
          const ta = UI.$('#at-add-text', f);
          const text = ta.value.trim();
          UI.clearErrors(f);
          if (text.length < 3) return UI.markField(f, 'text', 'Escreva o adendo (pelo menos 3 letras).');
          const res = await UI.act('support.addendum', { id, text }, { btn: UI.$('button[type="submit"]', f), form: f, ok: 'Adendo salvo' });
          if (!res) return;
          loaded.addenda = (loaded.addenda || []).concat([{ by: me().id, at: new Date().toISOString(), text }]);
          api.setDirty(false);
          api.setBody(body());
        });
      },
    });
  };
  // =====================================================================
  // Novo registro / edição
  // =====================================================================
  const studentChoice = (s) => html`<div class="at-chosen">${UI.avatar(s.name, 'sm', s.photo)}<span class="grow"><b>${s.name}</b><span class="small muted">${className(s)}</span></span><button type="button" class="btn sm ghost" data-at-pick-change>Trocar</button></div>`;
  const pickerInput = () => html`<input id="at-pick-q" class="input" type="search" autocomplete="off" placeholder="Digite o nome do aluno ou da turma" data-nodirty><ul class="at-pick-list" data-at-pick-list></ul>`;
  const pickerHTML = () => html`<div class="field full at-picker" data-field="studentId"><label for="at-pick-q">Aluno <span class="req" aria-hidden="true">*</span></label><div data-at-pick-box>${pickerInput()}</div><input type="hidden" name="studentId" value=""></div>`;
  const bindPicker = (root) => {
    const wrap = UI.$('.at-picker', root);
    if (!wrap) return;
    const hidden = UI.$('input[name="studentId"]', wrap);
    const box = UI.$('[data-at-pick-box]', wrap);
    const results = (q) => {
      const list = UI.$('[data-at-pick-list]', box);
      if (!list) return;
      if (q.trim().length < 2) return UI.setHTML(list, '');
      const found = Q.students({ status: 'ativo' }).filter((s) => U.matches(q, s.name, className(s))).slice(0, 8);
      UI.setHTML(list, found.length ? found.map((s) => html`<li><button type="button" data-at-pick="${s.id}">${UI.avatar(s.name, 'sm', s.photo)}<span class="grow"><b>${s.name}</b><span class="small muted">${className(s)}</span></span></button></li>`) : html`<li class="small muted at-pick-none">Nenhum aluno encontrado.</li>`);
    };
    const draw = () => {
      const s = hidden.value ? student(hidden.value) : null;
      UI.setHTML(box, s ? studentChoice(s) : pickerInput());
      if (s) return;
      const input = UI.$('#at-pick-q', box);
      input.addEventListener('input', () => results(input.value));
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          const first = UI.$('[data-at-pick]', box);
          first && first.click();
        } else if (e.key === 'ArrowDown') {
          const first = UI.$('[data-at-pick]', box);
          if (first) {
            e.preventDefault();
            first.focus();
          }
        }
      });
    };
    wrap.addEventListener('click', (e) => {
      const b = e.target.closest('[data-at-pick]');
      if (b) {
        hidden.value = b.dataset.atPick;
        UI.clearErrors(wrap);
        draw();
        return;
      }
      if (e.target.closest('[data-at-pick-change]')) {
        hidden.value = '';
        draw();
        const q = UI.$('#at-pick-q', wrap);
        q && q.focus();
      }
    });
    wrap.addEventListener('keydown', (e) => {
      const b = e.target.closest('[data-at-pick]');
      if (!b || !['ArrowDown', 'ArrowUp'].includes(e.key)) return;
      e.preventDefault();
      const btns = UI.$$('[data-at-pick]', wrap);
      const i = btns.indexOf(b);
      const j = e.key === 'ArrowDown' ? Math.min(btns.length - 1, i + 1) : i - 1;
      if (j < 0) UI.$('#at-pick-q', wrap).focus();
      else btns[j].focus();
    });
    draw();
  };

  const confPicker = (value, area) =>
    html`<fieldset class="field full at-conf-pick" data-field="confidentiality"><legend class="label">Quem pode ler <span class="req" aria-hidden="true">*</span></legend>
      ${Object.entries(CONF).map(
        ([k, c]) => html`<label class="at-conf-opt"><input type="radio" name="confidentiality" value="${k}" ${value === k ? raw('checked') : ''}><span class="at-conf-ic">${icon(c.icon)}</span><span class="at-conf-txt"><b>${c.label}</b><span data-at-conf-text="${k}">${c.text(area)}</span></span></label>`,
      )}
      <span class="hint">${icon('lock')} A família nunca vê registros de atendimento. Professores e direção também não, a menos que tenham o acesso "Pode ler atendimentos compartilhados".</span>
    </fieldset>`;

  /** record + content: edição (só o autor). onSaved(patch) atualiza a gaveta de leitura. */
  const openRecordForm = ({ studentId = null, record = null, content = null, onSaved = null } = {}) => {
    if (!canWrite()) return UI.toast('Seu acesso não inclui registrar atendimentos.', { tone: 'bad' });
    const edit = !!record;
    const textOk = !edit || within24(record);
    const preset = edit ? student(record.studentId) : studentId ? student(studentId) : null;
    const myArea = me().area || '';
    const area0 = edit ? record.area : myArea;
    const conf0 = edit ? record.confidentiality : area0 === 'psicologia' ? 'autor' : 'area';
    const defs = [
      { name: 'date', label: 'Data', type: 'date', required: true, max: today(), check: (v) => (v && v > today() ? 'A data não pode estar no futuro.' : '') },
      { name: 'area', label: 'Área', type: 'select', required: true, options: [['', 'Escolha a área…']].concat(Object.entries(Q.AREAS)), hint: myArea && !edit ? 'Já vem com a sua área.' : '' },
      { name: 'type', label: 'Tipo', type: 'chips', required: true, full: true, options: Object.entries(TYPES).map(([k, t]) => [k, t.label]) },
      confPicker(conf0, area0),
    ];
    if (textOk) {
      defs.push(
        { name: 'content', label: 'Registro', type: 'textarea', required: true, rows: 9, maxlength: 10000, full: true, placeholder: 'O que foi observado, conversado e combinado.', hint: 'Escreva só o necessário para o acompanhamento do aluno (LGPD). Depois de 24 horas, o texto não muda: a correção é por adendo.' },
        { name: 'nextSteps', label: 'Próximos passos', type: 'textarea', rows: 3, maxlength: 3000, full: true, placeholder: 'Ex.: novo encontro em 15 dias; conversar com a família sobre a rotina de sono.' },
      );
    }
    const values = edit ? { date: record.date, area: record.area, type: record.type, content: content ? content.content : '', nextSteps: content ? content.nextSteps : '' } : { date: today(), area: area0, type: 'atendimento' };
    UI.formDrawer({
      title: edit ? (textOk ? 'Corrigir registro' : 'Alterar data, tipo ou sigilo') : 'Novo registro de atendimento',
      sub: preset ? html`<b>${preset.name}</b>${className(preset) ? ` · ${className(preset)}` : ''}` : 'Sigiloso: só quem você escolher pode ler.',
      defs,
      values,
      cls: 'at-form',
      submitLabel: edit ? 'Salvar alterações' : 'Salvar registro',
      top: html`${!preset ? html`<div class="form-grid at-pick-grid">${pickerHTML()}</div>` : ''}${edit && !textOk ? html`<div class="notice at-note-24">${icon('lock')}<span class="grow">O texto foi registrado há mais de 24 horas e não muda mais. Para corrigir ou completar, feche esta janela e use <b>Acrescentar adendo</b>.</span></div>` : ''}`,
      onMount(el) {
        bindPicker(el);
        clearOnEdit(el);
        el.addEventListener('change', (e) => {
          if (e.target.name !== 'area') return;
          const t = UI.$('[data-at-conf-text="area"]', el);
          if (t) t.textContent = CONF.area.text(e.target.value);
        });
      },
      async onSubmit(data, api, form) {
        const root = api.el;
        const sid = preset ? preset.id : (UI.$('input[name="studentId"]', root) || {}).value;
        if (!sid) {
          UI.markField(root, 'studentId', 'Escolha o aluno.', false);
          const q = UI.$('#at-pick-q', root);
          q && q.focus();
          return null;
        }
        const conf = (UI.$('input[name="confidentiality"]:checked', form) || {}).value;
        if (!conf) {
          UI.markField(form, 'confidentiality', 'Escolha quem pode ler.', false);
          return null;
        }
        const input = { date: data.date, area: data.area, type: data.type, confidentiality: conf };
        if (textOk) Object.assign(input, { content: data.content, nextSteps: data.nextSteps });
        if (edit) input.id = record.id;
        else input.studentId = sid;
        const res = await UI.act('support.save', input, { form, ok: edit ? 'Registro atualizado' : { autor: 'Registro salvo · só você pode ler', area: 'Registro salvo · sua área pode ler', apoio: 'Registro salvo · a equipe de apoio pode ler' }[conf] });
        if (!res) return null;
        onSaved && onSaved(textOk ? { content: data.content, nextSteps: data.nextSteps } : {});
        return true;
      },
    });
  };

  // =====================================================================
  // Planos de apoio (PEI)
  // =====================================================================
  const sharedChips = (p) =>
    html`<div class="at-shared" aria-label="Compartilhado com">${[
      ['professores', 'Professores', 'teacher'],
      ['coordenacao', 'Coordenação', 'briefcase'],
      ['familia', 'Família', 'heart'],
    ].map(([k, l, ic]) => html`<span class="at-share ${p.sharedWith && p.sharedWith[k] ? 'on' : ''}" title="${p.sharedWith && p.sharedWith[k] ? `Compartilhado com ${l.toLowerCase()}` : `Não compartilhado com ${l.toLowerCase()}`}">${icon(p.sharedWith && p.sharedWith[k] ? ic : 'eyeOff')}${l}</span>`)}</div>`;
  const ackPill = (p) => {
    if (!p.sharedWith || !p.sharedWith.familia) return '';
    return p.familyAckAt ? html`<span class="pill ok" title="A família confirmou pelo portal">Família ciente · ${U.fmtDate(String(p.familyAckAt).slice(0, 10))}</span>` : UI.pill('Aguardando ciente da família', 'warn');
  };
  const planCard = (p, { showStudent = true } = {}) => {
    const s = student(p.studentId);
    const closed = p.status === 'encerrado';
    return html`<article class="card at-plan ${closed ? 'is-closed' : ''}" data-at-plan="${p.id}">
      <div class="at-plan-head">
        <span class="at-plan-ic" aria-hidden="true">${icon('clipboard')}</span>
        <div class="grow">
          <div class="at-kicker">Plano de apoio${p.start ? ` · desde ${U.fmtDate(p.start)}` : ''}${p.authorId ? ` · por ${userShort(p.authorId)}` : ''}</div>
          <h3>${p.title || 'Plano de apoio'}</h3>
          ${showStudent ? html`<div class="at-who">${s ? UI.avatar(s.name, 'sm', s.photo) : ''}<span>${studentLink(s)}${className(s) ? html`<span class="muted"> · ${className(s)}</span>` : ''}</span></div>` : ''}
        </div>
        ${closed ? UI.pill('Encerrado', '') : UI.pill('Ativo', 'ok')}
      </div>
      <div class="at-plan-body">
        ${p.goals != null ? html`<section><h4>Metas</h4><div class="at-text">${p.goals ? textHTML(p.goals) : html`<span class="muted">Sem metas escritas.</span>`}</div></section>` : ''}
        <section><h4>Adaptações e orientações para os professores</h4><div class="at-text">${p.adaptations ? textHTML(p.adaptations) : html`<span class="muted">Sem adaptações escritas.</span>`}</div></section>
      </div>
      <div class="at-plan-foot">
        ${isFull(p) ? sharedChips(p) : ''}
        ${ackPill(p)}
        <span class="grow small muted">${p.updatedAt ? `Atualizado ${at(p.updatedAt)}` : ''}</span>
        ${canEditPlan(p)
          ? html`<div class="btn-row"><button type="button" class="btn sm" data-at-plan-edit="${p.id}">${icon('pencil')}Editar</button>${closed ? html`<button type="button" class="btn sm" data-at-plan-status="ativo" data-id="${p.id}">${icon('refresh')}Reativar</button>` : html`<button type="button" class="btn sm ghost" data-at-plan-status="encerrado" data-id="${p.id}">${icon('check')}Encerrar</button>`}</div>`
          : ''}
      </div>
    </article>`;
  };

  const openPlanForm = ({ studentId = null, plan = null } = {}) => {
    if (!canWrite()) return UI.toast('Seu acesso não inclui planos de apoio.', { tone: 'bad' });
    const edit = !!plan;
    const preset = edit ? student(plan.studentId) : studentId ? student(studentId) : null;
    const defs = [
      { name: 'title', label: 'Título', required: true, maxlength: 140, full: true, placeholder: 'Ex.: Plano de apoio — leitura e escrita' },
      { name: 'start', label: 'Início', type: 'date', required: true },
      { name: 'goals', label: 'Metas', type: 'textarea', rows: 5, maxlength: 5000, full: true, placeholder: 'O que se quer alcançar com o aluno neste período.', hint: 'Coordenação e família (se compartilhado) também veem as metas.' },
      { name: 'adaptations', label: 'Adaptações e orientações para os professores', type: 'textarea', rows: 6, maxlength: 5000, full: true, placeholder: 'Ex.: ler os enunciados em voz alta; tempo adicional de 20 minutos; uma pergunta por item.', hint: 'É a única parte que os professores do aluno veem. Seja prático: o que fazer em sala e nas avaliações.' },
      html`<div class="full at-share-head"><h3>Compartilhar com</h3><p class="small muted">Registros de atendimento nunca são compartilhados por aqui: só o plano.</p></div>`,
      { name: 'sharedWith.professores', label: 'Professores do aluno', type: 'checkbox', full: true, hint: 'Veem só as adaptações, na ficha do aluno (aba "Adaptações recomendadas").' },
      { name: 'sharedWith.coordenacao', label: 'Coordenação', type: 'checkbox', full: true, hint: 'Vê título, metas e adaptações.' },
      { name: 'sharedWith.familia', label: 'Família (Portal)', type: 'checkbox', full: true, hint: 'Vê título, metas e adaptações e confirma que está ciente. Se o plano mudar, a família confirma de novo.' },
    ];
    const values = edit
      ? { title: plan.title, start: plan.start, goals: plan.goals || '', adaptations: plan.adaptations || '', sharedWith: { ...(plan.sharedWith || {}) } }
      : { title: 'Plano de apoio — ', start: today(), sharedWith: { professores: true, coordenacao: true, familia: false } };
    UI.formDrawer({
      title: edit ? 'Editar plano de apoio' : 'Novo plano de apoio (PEI)',
      sub: preset ? html`<b>${preset.name}</b>${className(preset) ? ` · ${className(preset)}` : ''}` : 'Metas, adaptações e com quem compartilhar.',
      defs,
      values,
      cls: 'at-form',
      submitLabel: edit ? 'Salvar plano' : 'Criar plano',
      top: html`${!preset ? html`<div class="form-grid at-pick-grid">${pickerHTML()}</div>` : ''}${edit && plan.sharedWith && plan.sharedWith.familia && plan.familyAckAt ? html`<div class="notice at-note-24">${icon('info')}<span class="grow">A família já deu ciente. Se você mudar o título, as metas ou as adaptações, ela precisará confirmar de novo.</span></div>` : ''}`,
      onMount(el) {
        bindPicker(el);
        clearOnEdit(el);
      },
      async onSubmit(data, api, form) {
        const root = api.el;
        const sid = preset ? preset.id : (UI.$('input[name="studentId"]', root) || {}).value;
        if (!sid) {
          UI.markField(root, 'studentId', 'Escolha o aluno.', false);
          const q = UI.$('#at-pick-q', root);
          q && q.focus();
          return null;
        }
        if (data.title.replace(/[—\-\s]+$/, '').trim().length < 3 || /—\s*$/.test(data.title)) {
          UI.markField(form, 'title', 'Complete o título (ex.: Plano de apoio — leitura e escrita).');
          return null;
        }
        const input = { title: data.title, start: data.start, goals: data.goals, adaptations: data.adaptations, sharedWith: data.sharedWith };
        if (edit) input.id = plan.id;
        else input.studentId = sid;
        const res = await UI.act('plans.save', input, { form, ok: edit ? 'Plano atualizado' : 'Plano de apoio criado' });
        return res ? true : null;
      },
    });
  };

  const setPlanStatus = async (id, status, btn) => {
    const p = Q.plan(id);
    if (!p) return;
    const prev = p.status;
    const res = await UI.act('plans.status', { id, status }, { btn });
    if (!res) return;
    UI.toast(status === 'encerrado' ? 'Plano encerrado' : 'Plano reativado', { action: { label: 'Desfazer', fn: () => UI.act('plans.status', { id, status: prev }, { ok: 'Situação do plano restaurada' }) } });
  };

  /** Eventos comuns (lista de registros e cartões de plano) dentro de el. */
  const bindCommon = (el) => {
    el.addEventListener('click', (e) => {
      const o = e.target.closest('[data-at-open]');
      if (o) return openRecord(o.dataset.atOpen);
      const pe = e.target.closest('[data-at-plan-edit]');
      if (pe) {
        const p = Q.plan(pe.dataset.atPlanEdit);
        if (p) openPlanForm({ plan: p });
        return;
      }
      const ps = e.target.closest('[data-at-plan-status]');
      if (ps) return setPlanStatus(ps.dataset.id, ps.dataset.atPlanStatus, ps);
    });
  };

  const recordRow = (r, { showStudent = true } = {}) => {
    const s = student(r.studentId);
    return html`<li><button type="button" class="at-row" data-at-open="${r.id}" aria-label="Abrir ${typeOf(r.type).label.toLowerCase()} de ${s ? s.name : 'aluno'} em ${U.fmtDate(r.date)} (o acesso fica registrado)">
      ${dateChip(r.date)}
      <span class="at-row-main">
        ${showStudent ? html`<span class="at-row-top"><b>${s ? s.name : 'Aluno'}</b></span>` : ''}
        <span class="at-row-meta"><span class="at-row-bits">${showStudent && className(s) ? html`<span class="at-row-class">${className(s)}</span>` : ''}<span class="at-row-type">${typeIcon(r.type, 'xs')}${typeOf(r.type).label}</span><span class="muted">${areaLabel(r.area)}</span><span class="muted">por ${userShort(r.authorId)}</span></span></span>
      </span>
      ${confTag(r)}
      ${icon('chevronRight', 'muted at-row-go')}
    </button></li>`;
  };

  // =====================================================================
  // Tela principal
  // =====================================================================
  const ST = () => PageState.get('atendimentos', { q: '', area: '', type: '', conf: '', mine: false, pstatus: 'ativo', pq: '' });

  const renderPage = (rest) => {
    const tab = rest[0] === 'planos' ? 'planos' : 'registros';
    const f = ST();
    const all = records();
    const plans = Store.state.plans.slice().sort((a, b) => (a.status === b.status ? 0 : a.status === 'ativo' ? -1 : 1) || (b.updatedAt || '').localeCompare(a.updatedAt || ''));
    const head = html`<div class="page-head">
        <div><h1>Atendimentos</h1><p class="lead">Registros de psicologia, psicopedagogia, orientação e AEE, e planos de apoio dos alunos.</p></div>
        ${canWrite() ? html`<div class="btn-row"><button type="button" class="btn" data-at-new-plan>${icon('clipboard')}<span>Novo plano</span></button><button type="button" class="btn primary" data-at-new>${icon('plus')}<span>Novo registro</span></button></div>` : ''}
      </div>
      <div class="notice at-privacy">${icon('lock')}<span class="grow"><b>Sigiloso.</b> A lista mostra só data, aluno e tipo. O texto abre quando você clica, e cada abertura fica registrada no histórico de atividades. A família e os professores não veem esta área.</span></div>
      ${UI.tabs([['registros', html`Registros <span class="at-tab-n">${all.length}</span>`], ['planos', html`Planos de apoio <span class="at-tab-n">${plans.filter((p) => p.status === 'ativo').length}</span>`]], tab, 'data-at-tab')}`;

    if (tab === 'planos') {
      const list = plans.filter((p) => (f.pstatus === 'todos' || p.status === f.pstatus) && (!f.pq || U.matches(f.pq, p.title || '', (student(p.studentId) || {}).name || '', className(student(p.studentId)))));
      const waiting = plans.filter((p) => p.status === 'ativo' && p.sharedWith && p.sharedWith.familia && !p.familyAckAt).length;
      return html`<div class="at-page">${head}
        <div class="toolbar">
          ${UI.seg([['ativo', 'Ativos'], ['encerrado', 'Encerrados'], ['todos', 'Todos']], f.pstatus, 'data-at-pstatus')}
          <label class="search-box"><span class="sr-only">Buscar plano</span>${icon('search')}<input class="input" type="search" placeholder="Buscar aluno, turma ou título" value="${f.pq}" autocomplete="off" data-at-pq></label>
          ${waiting ? html`<span class="small muted">${icon('clock')} ${U.plural(waiting, 'plano aguarda', 'planos aguardam')} o ciente da família</span>` : ''}
        </div>
        ${list.length
          ? html`<div class="at-plans">${list.map((p) => planCard(p))}</div>`
          : html`<div class="card">${UI.empty({
              icon: 'clipboard',
              title: plans.length ? 'Nenhum plano com esse filtro' : 'Nenhum plano de apoio ainda',
              text: plans.length ? 'Mude a situação ou o termo de busca.' : 'O plano reúne metas e adaptações para um aluno e pode ser compartilhado com os professores, a coordenação e a família.',
              action: !plans.length && canWrite() ? html`<button type="button" class="btn primary" data-at-new-plan>${icon('plus')}Criar o primeiro plano</button>` : '',
            })}</div>`}
      </div>`;
    }

    const list = all.filter((r) => {
      if (f.area && r.area !== f.area) return false;
      if (f.type && r.type !== f.type) return false;
      if (f.conf && r.confidentiality !== f.conf) return false;
      if (f.mine && r.authorId !== me().id) return false;
      if (f.q) {
        const s = student(r.studentId);
        if (!U.matches(f.q, s ? s.name : '', className(s))) return false;
      }
      return true;
    });
    const filtersOn = f.area || f.type || f.conf || f.mine || f.q;
    const thisMonth = all.filter((r) => (r.date || '').slice(0, 7) === today().slice(0, 7)).length;
    const studentsN = new Set(all.map((r) => r.studentId)).size;
    return html`<div class="at-page">${head}
      <div class="at-filters">
        <label class="search-box"><span class="sr-only">Buscar aluno</span>${icon('search')}<input class="input" type="search" placeholder="Buscar aluno ou turma" value="${f.q}" autocomplete="off" data-at-q></label>
        <select class="input" data-at-f="area" aria-label="Área"><option value="">Todas as áreas</option>${Object.entries(Q.AREAS).map(([k, l]) => html`<option value="${k}" ${f.area === k ? raw('selected') : ''}>${l}</option>`)}</select>
        <select class="input" data-at-f="type" aria-label="Tipo"><option value="">Todos os tipos</option>${Object.entries(TYPES).map(([k, t]) => html`<option value="${k}" ${f.type === k ? raw('selected') : ''}>${t.label}</option>`)}</select>
        <select class="input" data-at-f="conf" aria-label="Quem pode ler"><option value="">Qualquer sigilo</option>${Object.entries(CONF).map(([k, c]) => html`<option value="${k}" ${f.conf === k ? raw('selected') : ''}>${c.label}</option>`)}</select>
        <label class="check at-mine"><input type="checkbox" data-at-mine ${f.mine ? raw('checked') : ''}><span>Só os meus</span></label>
      </div>
      <section class="card">
        <div class="card-head"><h2>${icon('heart')}Registros</h2><span class="sub">${filtersOn ? `${list.length} de ${all.length}` : `${U.plural(all.length, 'registro', 'registros')} · ${thisMonth} neste mês · ${U.plural(studentsN, 'aluno', 'alunos')}`}</span></div>
        <div class="card-body">${list.length
          ? html`<ul class="at-list">${list.map((r) => recordRow(r))}</ul>`
          : UI.empty({
              icon: filtersOn ? 'filter' : 'heart',
              title: filtersOn ? 'Nenhum registro com esses filtros' : 'Nenhum registro visível',
              text: filtersOn ? 'Mude a área, o tipo, o sigilo ou o termo de busca.' : canWrite() ? 'Registre atendimentos, observações e conversas com a família. Você escolhe quem pode ler cada registro.' : 'Aparecem aqui os registros que os autores compartilharam com a sua área ou com a equipe de apoio.',
              action: filtersOn ? html`<button type="button" class="btn sm" data-at-clear>Limpar filtros</button>` : canWrite() ? html`<button type="button" class="btn primary" data-at-new>${icon('plus')}Novo registro</button>` : '',
            })}</div>
      </section>
    </div>`;
  };

  const refocus = (sel, pos) => {
    const n = document.querySelector(sel);
    if (!n) return;
    n.focus();
    try {
      n.setSelectionRange(pos, pos);
    } catch (e) {
      /* sem seleção */
    }
  };
  const mountPage = (el) => {
    const f = ST();
    bindCommon(el);
    el.addEventListener('click', (e) => {
      const t = e.target.closest('[data-at-tab]');
      if (t) return App.go(t.dataset.atTab === 'planos' ? 'atendimentos/planos' : 'atendimentos');
      if (e.target.closest('[data-at-new]')) return openRecordForm({});
      if (e.target.closest('[data-at-new-plan]')) return openPlanForm({});
      if (e.target.closest('[data-at-clear]')) {
        Object.assign(f, { q: '', area: '', type: '', conf: '', mine: false });
        return App.render();
      }
      const ps = e.target.closest('[data-at-pstatus]');
      if (ps) {
        f.pstatus = ps.dataset.atPstatus;
        App.render();
      }
    });
    el.addEventListener('change', (e) => {
      const s = e.target.closest('[data-at-f]');
      if (s) {
        f[s.dataset.atF] = s.value;
        return App.render();
      }
      if (e.target.matches('[data-at-mine]')) {
        f.mine = e.target.checked;
        App.render();
      }
    });
    const bindSearch = (sel, key) => {
      const q = UI.$(sel, el);
      q &&
        q.addEventListener(
          'input',
          U.debounce(() => {
            f[key] = q.value.trim();
            const pos = q.selectionStart;
            App.render();
            refocus(sel, pos);
          }, 250),
        );
    };
    bindSearch('[data-at-q]', 'q');
    bindSearch('[data-at-pq]', 'pq');
  };

  // =====================================================================
  // Registro das telas
  // =====================================================================
  App.page({
    id: 'atendimentos',
    label: 'Atendimentos',
    icon: 'heart',
    group: 'Alunos e turmas',
    order: 40,
    anyPerm: ['atendimentos.registrar', 'atendimentos.conteudo'],
    keys: 'psicologia psicopedagogia orientação AEE PEI plano de apoio sigilo atendimento',
    title: (rest) => (rest[0] === 'planos' ? 'Planos de apoio' : 'Atendimentos'),
    render: (rest) => renderPage(rest),
    mount: (el, rest) => mountPage(el, rest),
  });

  // ---------- ficha do aluno ----------
  App.studentTab({
    id: 'atendimentos',
    label: 'Atendimentos',
    order: 60,
    anyPerm: ['atendimentos.registrar', 'atendimentos.conteudo'],
    render(s) {
      const recs = records().filter((r) => r.studentId === s.id);
      const plans = Q.plansFor(s.id).sort((a, b) => (a.status === b.status ? 0 : a.status === 'ativo' ? -1 : 1));
      const active = s.status === 'ativo';
      return html`<div class="at-stab">
        <div class="notice at-privacy">${icon('lock')}<span class="grow">Sigiloso: a família e os professores não veem esta aba. Abrir um registro fica registrado no histórico de atividades.</span></div>
        ${canWrite() && active ? html`<div class="btn-row"><button type="button" class="btn primary" data-at-snew>${icon('plus')}Novo registro</button><button type="button" class="btn" data-at-snew-plan>${icon('clipboard')}Novo plano de apoio</button></div>` : ''}
        <div class="grid-2">
          <section class="card"><div class="card-head"><h2>${icon('heart')}Registros</h2><span class="sub">${recs.length ? U.plural(recs.length, 'registro visível', 'registros visíveis') : ''}</span></div>
            <div class="card-body">${recs.length ? html`<ul class="at-list">${recs.map((r) => recordRow(r, { showStudent: false }))}</ul>` : html`<p class="muted small">Nenhum registro que você possa ler. Registros marcados como "Só eu" por outros profissionais não aparecem.</p>`}</div></section>
          <div class="stack at-splans">${plans.length ? plans.map((p) => planCard(p, { showStudent: false })) : html`<section class="card"><div class="card-head"><h2>${icon('clipboard')}Planos de apoio</h2></div><div class="card-body"><p class="muted small">Nenhum plano de apoio para este aluno.</p></div></section>`}</div>
        </div>
      </div>`;
    },
    mount(el, s) {
      bindCommon(el);
      el.addEventListener('click', (e) => {
        if (e.target.closest('[data-at-snew]')) openRecordForm({ studentId: s.id });
        else if (e.target.closest('[data-at-snew-plan]')) openPlanForm({ studentId: s.id });
      });
    },
  });

  App.studentTab({
    id: 'apoio',
    label: 'Adaptações recomendadas',
    order: 35,
    when: (s) => Q.plansFor(s.id).filter((p) => p.status === 'ativo').length > 0 && !Store.canAny('atendimentos.registrar', 'atendimentos.conteudo'),
    render(s) {
      const plans = Q.plansFor(s.id).filter((p) => p.status === 'ativo');
      return html`<section class="card at-apoio">
        <div class="card-head"><h2>${icon('clipboard')}Adaptações recomendadas</h2><span class="sub">Pela equipe de apoio</span></div>
        <div class="card-body">
          <p class="small muted at-apoio-lead">Orientações práticas para a sala de aula e as avaliações de ${U.firstName(s.name)}. Registros de atendimento e informações clínicas não aparecem aqui.</p>
          ${plans.map(
            (p) => html`<article class="at-apoio-item">
              ${p.title ? html`<h3>${p.title}</h3>` : ''}
              ${p.goals ? html`<div class="at-apoio-block"><h4>Metas</h4><div class="at-text">${textHTML(p.goals)}</div></div>` : ''}
              <div class="at-apoio-block at-apoio-adapt"><h4>${icon('checkSquare')}O que fazer</h4><div class="at-text">${p.adaptations ? textHTML(p.adaptations) : html`<span class="muted">Sem adaptações escritas.</span>`}</div></div>
              <p class="small muted">${p.authorId && Q.user(p.authorId) ? `${Q.userName(p.authorId)} (${Q.personLabel(p.authorId)})` : 'Equipe de apoio'}${p.updatedAt ? ` · atualizado ${at(p.updatedAt)}` : ''}</p>
            </article>`,
          )}
        </div>
      </section>`;
    },
  });

  // ---------- painel ----------
  App.widget({
    id: 'atendimentos-recentes',
    order: 45,
    size: 'half',
    perm: 'atendimentos.registrar',
    // para a equipe de apoio (psicologia, orientação, AEE…) é o trabalho do dia: sobe para o topo do painel
    primary: () => !Store.canAny('chamada.registrar', 'turmas.gerenciar'),
    render() {
      const recs = records().slice(0, 5);
      const waiting = Store.state.plans.filter((p) => p.status === 'ativo' && p.sharedWith && p.sharedWith.familia && !p.familyAckAt);
      const active = Store.state.plans.filter((p) => p.status === 'ativo' && isFull(p)).length;
      return html`<section class="card at-widget">
        <div class="card-head"><h2>${icon('heart')}Atendimentos</h2><a class="sub" href="#atendimentos">Abrir</a></div>
        <div class="card-body">
          ${recs.length ? html`<ul class="at-list at-wlist">${recs.map((r) => recordRow(r))}</ul>` : html`<p class="muted small">Nenhum registro ainda. Os seus registros e os compartilhados com você aparecem aqui.</p>`}
          <div class="at-wfoot">
            <a class="small" href="#atendimentos/planos">${icon('clipboard')}${U.plural(active, 'plano ativo', 'planos ativos')}${waiting.length ? html` · <span class="at-wwait">${waiting.length} sem ciente da família</span>` : ''}</a>
            ${canWrite() ? html`<button type="button" class="btn sm" data-at-wnew>${icon('plus')}Novo registro</button>` : ''}
          </div>
        </div>
      </section>`;
    },
    mount(el) {
      bindCommon(el);
      el.addEventListener('click', (e) => {
        if (e.target.closest('[data-at-wnew]')) openRecordForm({});
      });
    },
  });

  // ---------- família: plano de apoio compartilhado (ciente) ----------
  App.widget({
    id: 'apoio-familia',
    family: true,
    order: 35,
    size: 'half',
    when: () => {
      const kids = new Set(Q.myChildren().map((k) => k.id));
      return Store.state.plans.some((p) => p.status === 'ativo' && kids.has(p.studentId));
    },
    render() {
      const kids = Q.myChildren();
      const ids = new Set(kids.map((k) => k.id));
      const plans = Store.state.plans.filter((p) => p.status === 'ativo' && ids.has(p.studentId));
      const pending = plans.filter((p) => !p.familyAckAt).length;
      return html`<section class="card at-widget at-fam">
        <div class="card-head"><h2>${icon('clipboard')}Plano de apoio</h2><span class="sub">${pending ? 'Leia e confirme' : 'Combinado com a escola'}</span></div>
        <div class="card-body">${plans.map((p) => {
          const s = student(p.studentId);
          const author = Q.user(p.authorId);
          return html`<article class="at-fplan">
            <div class="at-kicker">${kids.length > 1 && s ? html`<b>${U.firstName(s.name)}</b> · ` : ''}${author ? `${U.shortName(author.name)} · ${author.title || Q.roleLabel(author.role)}` : 'Equipe de apoio'}${p.updatedAt ? ` · ${U.fmtDate(String(p.updatedAt).slice(0, 10))}` : ''}</div>
            <h3>${p.title || 'Plano de apoio'}</h3>
            ${p.goals ? html`<div class="at-apoio-block"><h4>Metas</h4><div class="at-text">${textHTML(p.goals)}</div></div>` : ''}
            ${p.adaptations ? html`<div class="at-apoio-block"><h4>Como a escola vai apoiar</h4><div class="at-text">${textHTML(p.adaptations)}</div></div>` : ''}
            ${p.familyAckAt
              ? html`<p class="at-fack ok">${icon('checkCircle')}Você confirmou a leitura em ${U.fmtDate(String(p.familyAckAt).slice(0, 10))}.</p>`
              : Store.preview
                ? ''
                : html`<div class="at-fack"><button type="button" class="btn primary sm" data-at-ack="${p.id}">${icon('check')}Li e estou ciente</button><span class="small muted">A escola fica sabendo que você leu o plano. Dúvidas? Fale com a escola em Mensagens.</span></div>`}
          </article>`;
        })}</div>
      </section>`;
    },
    mount(el) {
      el.addEventListener('click', (e) => {
        const b = e.target.closest('[data-at-ack]');
        if (b) UI.act('plans.ack', { id: b.dataset.atAck }, { btn: b, ok: 'Obrigado! A escola foi avisada de que você leu o plano.' });
      });
    },
  });

  // ---------- menu "Novo" ----------
  App.action({ id: 'novo-atendimento', label: 'Registrar atendimento', icon: 'heart', order: 55, perm: 'atendimentos.registrar', keys: 'atendimento psicologia psicopedagogia orientação observação devolutiva encaminhamento', run: () => openRecordForm({}) });
  App.action({ id: 'novo-plano-apoio', label: 'Novo plano de apoio (PEI)', icon: 'clipboard', order: 56, perm: 'atendimentos.registrar', keys: 'plano PEI adaptação inclusão apoio metas', run: () => openPlanForm({}) });

  Actions.novoAtendimento = (opts = {}) => openRecordForm({ studentId: opts.studentId || null });
  Actions.novoPlanoApoio = (opts = {}) => openPlanForm({ studentId: opts.studentId || null });
  Actions.abrirAtendimento = (id) => openRecord(id);
})();
