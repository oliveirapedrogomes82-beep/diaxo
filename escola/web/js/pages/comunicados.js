'use strict';
/* Comunicados — avisos gerais da escola (reunião, feriado, passeio, uniforme…), com fixados no topo.
   Equipe com "comunicados.publicar" escreve (com modelos prontos), edita, fixa e exclui (excluir tem
   "Desfazer"); quem não enxerga todas as turmas publica só para as próprias turmas e mexe só no que publicou.
   Família e o resto da equipe leem. "Novo" marca o que chegou desde a última visita (só neste aparelho).
   Usa o seletor de público de calendario.js (window.ComKit).
   Comandos: notices.save, notices.pin, notices.delete (web/core/commands/comunicacao.js). */
(() => {
  const can = (p) => Store.can(p);
  const me = () => Store.me;
  const today = () => U.today();
  const K = () => window.ComKit;
  const textHTML = (s) => raw(U.linkify(U.esc(s || '')));
  const PS = () => PageState.get('comunicados', { q: '', filter: 'todos', open: {}, seenBefore: null });
  const notice = (id) => Store.byId('notices', id);
  const canPublish = () => can('comunicados.publicar') && !Store.family && !Store.preview;
  const canManage = (n) => !!(K() && K().canManage(n, 'comunicados.publicar'));

  // ---------- "novo desde a última visita" (conveniência deste aparelho) ----------
  const seenKey = () => `caderneta.comunicados.visto.${me() ? me().id : ''}`;
  const lastSeen = () => {
    try {
      return localStorage.getItem(seenKey()) || '';
    } catch (e) {
      return '';
    }
  };
  const markSeen = () => {
    try {
      localStorage.setItem(seenKey(), new Date().toISOString());
    } catch (e) {
      /* sem armazenamento: o "novo" só some nesta visita */
    }
  };
  let onPage = false;
  window.addEventListener('hashchange', () => {
    if (App.route()[0] !== 'comunicados') onPage = false;
  });
  const relevant = (n) => (Store.family ? true : !n.audience || n.audience.who !== 'familias');
  const since = (seen) => {
    const floor = new Date(Date.now() - 30 * 86400000).toISOString();
    return seen && seen > floor ? seen : floor;
  };
  const isNew = (n, seen) => n.authorId !== (me() || {}).id && relevant(n) && (n.createdAt || '') > since(seen);
  const newCount = () => {
    if (!Store.ready || !me()) return 0;
    const seen = lastSeen();
    return Store.state.notices.filter((n) => isNew(n, seen)).length;
  };

  // ---------- peças ----------
  const authorLine = (n) => {
    const u = Q.user(n.authorId);
    if (!u) return Q.settings().schoolName || 'Escola';
    const role = u.title || Q.roleLabel(u.role);
    return `${U.shortName(u.name)}${role ? ` · ${role}` : ''}`;
  };
  const audiencePill = (n) => {
    const who = (n.audience && n.audience.who) || 'todos';
    const text = Store.family && K() ? K().familyTarget(n.audience) : Q.audienceLabel(n.audience);
    return html`<span class="pill plain co-aud ${who === 'equipe' ? 'is-staff' : 'info'}">${icon(who === 'equipe' ? 'briefcase' : 'users')}${text}</span>`;
  };
  const LONG = 420;
  const isLong = (n) => (n.body || '').length > LONG || (n.body || '').split('\n').length > 7;
  /** Comunicado só para a equipe: nunca vai às famílias, então não ganha atalho para fora do sistema. */
  const isInternal = (n) => !!(n.audience && n.audience.who === 'equipe');
  const shareText = (n) => `*${n.title}*\n${Q.settings().schoolName || ''}${isInternal(n) ? '\n_Comunicado interno — só para a equipe da escola_' : ''}\n\n${n.body}`;
  const edited = (n) => n.updatedAt && n.createdAt && Date.parse(n.updatedAt) - Date.parse(n.createdAt) > 60000;

  const card = (n, st, seen) => {
    const open = !!st.open[n.id];
    const long = isLong(n);
    const manage = canManage(n);
    const staff = !Store.family;
    return html`<article class="card notice-card co-card ${n.pinned ? 'pinned' : ''}" data-co="${n.id}">
      <div class="notice-meta">
        ${n.pinned ? html`<span class="pill mark plain">${icon('pin')}Fixado</span>` : ''}
        ${isNew(n, seen) ? UI.pill('Novo', 'info') : ''}
        ${audiencePill(n)}
        <span class="co-when">${U.cap(U.fmtDateLong(n.date || (n.createdAt || '').slice(0, 10), false))}${n.date === today() ? ' (hoje)' : ''} · ${authorLine(n)}${edited(n) ? ' · editado' : ''}</span>
      </div>
      <h2 class="co-title">${n.title}</h2>
      <div class="body co-body ${long && !open ? 'is-clamped' : ''}" id="co-body-${n.id}">${textHTML(n.body)}</div>
      ${long ? html`<div><button type="button" class="link small" data-co-more="${n.id}" aria-expanded="${open ? 'true' : 'false'}" aria-controls="co-body-${n.id}">${open ? 'Mostrar menos' : 'Ler o comunicado inteiro'}</button></div>` : ''}
      ${staff
        ? html`<div class="btn-row co-acts">
            <button type="button" class="btn sm" data-co-copy="${n.id}">${icon(isInternal(n) ? 'lock' : 'copy')}Copiar texto</button>
            ${isInternal(n) ? '' : html`<a class="btn sm" href="${U.whatsappLink('', shareText(n))}" target="_blank" rel="noopener noreferrer">${icon('message')}Enviar no WhatsApp</a>`}
            ${manage
              ? html`<span class="grow"></span>
                <button type="button" class="btn sm ghost" data-co-pin="${n.id}" aria-pressed="${n.pinned ? 'true' : 'false'}">${icon('pin')}${n.pinned ? 'Desafixar' : 'Fixar no topo'}</button>
                <button type="button" class="icon-btn sm" data-co-edit="${n.id}" aria-label="Editar “${n.title}”" title="Editar">${icon('pencil')}</button>
                <button type="button" class="icon-btn sm" data-co-del="${n.id}" aria-label="Excluir “${n.title}”" title="Excluir">${icon('trash')}</button>`
              : ''}
          </div>`
        : ''}
    </article>`;
  };

  const FILTERS = [
    ['todos', 'Todos'],
    ['familias', 'Para as famílias'],
    ['equipe', 'Só a equipe'],
    ['meus', 'Publicados por mim'],
  ];
  const applyFilter = (list, st) => {
    let out = list;
    if (!Store.family) {
      if (st.filter === 'familias') out = out.filter((n) => !n.audience || n.audience.who !== 'equipe');
      else if (st.filter === 'equipe') out = out.filter((n) => n.audience && n.audience.who === 'equipe');
      else if (st.filter === 'meus') out = out.filter((n) => n.authorId === me().id);
    }
    if (st.q) out = out.filter((n) => U.matches(st.q, n.title, n.body));
    return out;
  };

  // =====================================================================
  // Tela
  // =====================================================================
  const render = () => {
    const st = PS();
    if (!onPage) {
      st.seenBefore = lastSeen();
      onPage = true;
    }
    const all = Q.notices();
    const list = applyFilter(all, st);
    const pub = canPublish();
    const filters = FILTERS.filter(([k]) => k !== 'meus' || pub || all.some((n) => n.authorId === me().id));
    if (!filters.some(([k]) => k === st.filter)) st.filter = 'todos';
    const pinned = list.filter((n) => n.pinned);
    const rest = list.filter((n) => !n.pinned);
    const filteredOut = list.length < all.length;
    return html`
      <div class="page-head">
        <div><h1>Comunicados</h1><p class="lead">${Store.family ? 'Avisos da escola para a sua família. Os mais importantes ficam fixados no topo.' : pub ? 'Escreva o aviso uma vez: ele aparece no portal das famílias (se for para elas) e você pode enviar pelo WhatsApp. Fixe os mais importantes no topo.' : 'Avisos da escola para as famílias e para a equipe.'}</p></div>
        ${pub ? html`<button type="button" class="btn primary" data-co-new>${icon('plus')}Novo comunicado</button>` : ''}
      </div>
      ${all.length
        ? html`<div class="toolbar co-toolbar">
            <label class="search-box co-search"><span class="sr-only">Buscar nos comunicados</span>${icon('search')}<input class="input" type="search" data-co-q placeholder="Buscar nos comunicados" value="${st.q}" autocomplete="off"></label>
            ${Store.family ? '' : UI.seg(filters, st.filter, 'data-co-filter')}
            ${filteredOut ? html`<span class="result-count">${U.plural(list.length, 'comunicado', 'comunicados')}</span>` : ''}
          </div>`
        : ''}
      <div class="co-list" data-co-list>
        ${list.length
          ? html`${pinned.map((n) => card(n, st, st.seenBefore))}${pinned.length && rest.length ? html`<h2 class="co-sep">Anteriores</h2>` : ''}${rest.map((n) => card(n, st, st.seenBefore))}`
          : html`<section class="card">${all.length
              ? UI.empty({ icon: 'search', title: 'Nenhum comunicado encontrado', text: 'Tente outra palavra ou mude o filtro.', action: html`<button type="button" class="btn" data-co-clear>Limpar busca e filtros</button>` })
              : UI.empty({
                  icon: 'megaphone',
                  title: 'Nenhum comunicado ainda',
                  text: Store.family ? 'Quando a escola publicar um aviso para a sua família, ele aparece aqui.' : pub ? 'Use um dos modelos prontos (reunião, feriado, passeio…) para começar rápido.' : 'Os avisos publicados pela direção e pela coordenação aparecem aqui.',
                  action: pub ? html`<button type="button" class="btn primary" data-co-new>${icon('plus')}Escrever comunicado</button>` : '',
                })}</section>`}
      </div>`;
  };

  const mount = (el) => {
    const st = PS();
    markSeen();
    const q = UI.$('[data-co-q]', el);
    q &&
      q.addEventListener(
        'input',
        U.debounce(() => {
          st.q = q.value;
          const pos = q.selectionStart;
          App.render();
          const again = document.querySelector('[data-co-q]');
          if (again) {
            again.focus();
            try {
              again.setSelectionRange(pos, pos);
            } catch (e) {
              /* campo de busca sem seleção */
            }
          }
        }, 220),
      );
    el.addEventListener('click', async (e) => {
      const b = e.target.closest('button');
      if (!b || !el.contains(b)) return;
      const d = b.dataset;
      if ('coNew' in d) return openNotice({});
      if ('coClear' in d) {
        st.q = '';
        st.filter = 'todos';
        return App.render();
      }
      if (d.coFilter) {
        st.filter = d.coFilter;
        return App.render();
      }
      if (d.coMore) {
        st.open[d.coMore] = !st.open[d.coMore];
        return App.render();
      }
      const n = notice(d.coCopy || d.coPin || d.coEdit || d.coDel || '');
      if (!n) return;
      if (d.coCopy) {
        if (!isInternal(n)) return UI.copy(shareText(n), 'Texto copiado. Cole onde quiser.');
        return UI.confirm({
          title: 'Copiar um comunicado interno?',
          text: 'Este comunicado é só para a equipe e não aparece para as famílias. Cole o texto apenas em conversas da equipe da escola.',
          ok: 'Copiar mesmo assim',
        }).then((go) => go && UI.copy(shareText(n), 'Texto copiado (comunicado interno, só para a equipe).'));
      }
      if (d.coEdit) return openNotice({ id: n.id });
      if (d.coPin) return UI.act('notices.pin', { id: n.id, pinned: !n.pinned }, { btn: b, ok: n.pinned ? 'Comunicado desafixado' : 'Comunicado fixado no topo' });
      if (d.coDel) return UI.act('notices.delete', { id: n.id }, { btn: b, ok: `Comunicado “${n.title}” excluído` });
    });
  };

  // =====================================================================
  // Escrever / editar
  // =====================================================================
  const TEMPLATES = [
    ['Reunião de pais', 'Reunião de pais e mestres', 'Senhores responsáveis,\n\nConvidamos para a reunião de pais e mestres no dia __/__, às __h, no auditório da escola. Conversaremos sobre o andamento do bimestre e entregaremos os boletins.\n\nContamos com a sua presença.', 'familias'],
    ['Sem aula / feriado', 'Não haverá aula', 'Informamos que no dia __/__ não haverá aula por conta de __. As atividades retornam normalmente no dia seguinte.', 'todos'],
    ['Passeio', 'Passeio pedagógico', 'A turma fará um passeio pedagógico no dia __/__. Saída às __h e retorno previsto às __h.\n\nA autorização será pedida pela agenda. Mandar lanche, garrafa de água e boné.', 'familias'],
    ['Semana de provas', 'Semana de provas', 'Na próxima semana teremos as avaliações do bimestre. Confira o calendário de provas com seu filho e ajude na organização dos estudos.', 'familias'],
    ['Uniforme', 'Uso do uniforme', 'Lembramos que o uso do uniforme completo é obrigatório a partir de __/__. Em caso de dúvida, procure a secretaria.', 'familias'],
    ['Mensalidade', 'Lembrete de mensalidade', 'Lembramos que a mensalidade vence todo dia {vencimento}. Pagamentos por Pix são confirmados no mesmo dia.{pix}\n\nEm caso de dúvida, procure a secretaria.', 'familias', 'fees'],
    ['Reunião da equipe', 'Reunião pedagógica', 'Equipe, teremos reunião pedagógica no dia __/__, às __h, na sala dos professores. Pauta: __.', 'equipe'],
  ];

  const openNotice = ({ id = null } = {}) => {
    if (Store.preview) return UI.toast('No modo "ver como" nada pode ser alterado.', { tone: 'bad' });
    if (!can('comunicados.publicar')) return UI.toast('Seu acesso não permite publicar comunicados. Fale com a direção.', { tone: 'bad' });
    if (!K()) return UI.toast('Não foi possível abrir o formulário. Recarregue a página.', { tone: 'bad' });
    const n = id ? notice(id) : null;
    if (id && !n) return UI.toast('Este comunicado não existe mais.', { tone: 'bad' });
    if (n && !canManage(n)) return UI.toast('Você só pode alterar os comunicados que você publicou.', { tone: 'bad' });
    if (!K().allScope() && !K().publishClasses().length) return UI.toast('Você ainda não tem turmas vinculadas para publicar comunicados. Fale com a direção.', { tone: 'bad' });
    const s = Q.settings();
    const fees = Q.chargesFees();
    const templates = TEMPLATES.filter((t) => t[4] !== 'fees' || fees);
    const mine = K().publishClasses();
    const aud0 = n ? n.audience : K().allScope() ? { who: 'familias' } : { who: 'familias', classIds: mine.length === 1 ? [mine[0].id] : [] };
    const defs = [
      { name: 'title', label: 'Título', required: true, full: true, maxlength: 140, placeholder: 'Ex.: Reunião de pais e mestres' },
      K().audienceField(aud0, { label: 'Para quem' }),
      { name: 'body', label: 'Mensagem', type: 'textarea', rows: 9, required: true, full: true, maxlength: 5000, placeholder: 'Seja direto: o quê, quando, onde e o que a família precisa fazer.', hint: html`<span data-co-count>0</span> de 5.000 caracteres. Links (https://…) viram clicáveis.` },
      { name: 'pinned', label: 'Fixar no topo da lista', type: 'checkbox', full: true, hint: 'Fica em destaque para todos até você desafixar.' },
    ];
    UI.formDrawer({
      title: n ? 'Editar comunicado' : 'Novo comunicado',
      sub: n ? html`Publicado em ${U.fmtDate(n.date)} por ${authorLine(n)}` : 'Aparece no portal das famílias (se for para elas) e para a equipe.',
      top: n
        ? ''
        : html`<div class="field co-tpl"><span class="label">Comece por um modelo</span><div class="chips" role="group" aria-label="Modelos">${templates.map((t, i) => html`<button type="button" class="chip" data-co-tpl="${i}" aria-pressed="false">${t[0]}</button>`)}</div><span class="hint">Troque os “__” pelas informações certas antes de publicar.</span></div>`,
      defs,
      values: n ? { ...n } : { pinned: false },
      submitLabel: n ? 'Salvar alterações' : 'Publicar comunicado',
      cls: 'co-drawer',
      onMount(el, api, form) {
        K().bindAudience(form);
        if (K().liveClear) K().liveClear(form);
        const body = UI.$('#f-body', form);
        const count = UI.$('[data-co-count]', form);
        const upd = () => count && (count.textContent = U.int(body.value.length));
        body && body.addEventListener('input', upd);
        upd();
        el.addEventListener('click', (e) => {
          const t = e.target.closest('[data-co-tpl]');
          if (!t) return;
          const [, title, text, who] = templates[Number(t.dataset.coTpl)];
          const titleIn = UI.$('#f-title', form);
          if ((titleIn.value.trim() || body.value.trim()) && !t.dataset.ok) {
            // trocar um texto já escrito pede um segundo toque
            UI.$$('[data-co-tpl]', el).forEach((x) => delete x.dataset.ok);
            t.dataset.ok = '1';
            UI.toast('Toque de novo no modelo para trocar o texto que você já escreveu.', { ic: 'info' });
            return;
          }
          titleIn.value = title;
          body.value = text.replace('{vencimento}', String(s.dueDay || 10)).replace('{pix}', s.pixKey ? ` Chave Pix: ${s.pixKey}.` : '');
          const whoIn = UI.$(`input[name="aud-who"][value="${who}"]`, form);
          if (whoIn) {
            whoIn.checked = true;
            whoIn.dispatchEvent(new Event('change', { bubbles: true }));
          }
          UI.$$('[data-co-tpl]', el).forEach((x) => {
            x.setAttribute('aria-pressed', String(x === t));
            delete x.dataset.ok;
          });
          api.setDirty(true);
          upd();
          body.focus();
          const blank = body.value.indexOf('__');
          if (blank >= 0) body.setSelectionRange(blank, blank + 2);
        });
      },
      async onSubmit(d, api, form) {
        const audience = K().readAudience(form);
        if (!audience) return null;
        const input = { title: d.title, body: d.body, audience, pinned: !!d.pinned };
        if (n) Object.assign(input, { id: n.id, baseUpdatedAt: n.updatedAt });
        if (/__/.test(d.title + d.body)) {
          const ok = await UI.confirm({ title: 'Publicar com espaços em branco?', text: 'O texto ainda tem “__” do modelo. A família vai ver assim.', ok: 'Publicar assim mesmo', cancel: 'Voltar e completar' });
          if (!ok) return null;
        }
        const res = await UI.act('notices.save', input, { form, ok: n ? 'Comunicado atualizado' : audience.who === 'equipe' ? 'Comunicado publicado para a equipe' : 'Comunicado publicado' });
        if (!res) return null;
        if (!n && App.route()[0] === 'comunicados') {
          PS().filter = 'todos';
          PS().q = '';
        }
        return true;
      },
    });
  };

  // =====================================================================
  // Registro
  // =====================================================================
  App.page({
    id: 'comunicados',
    label: 'Comunicados',
    icon: 'megaphone',
    group: 'Comunicação',
    order: 20,
    family: 'both',
    keys: 'avisos circulares recados gerais informes',
    badge: () => {
      if (App.route()[0] === 'comunicados') return null;
      const n = newCount();
      return n ? { n, title: `${n} ${n === 1 ? 'comunicado novo' : 'comunicados novos'}` } : null;
    },
    title: () => 'Comunicados',
    render,
    mount,
  });

  App.widget({
    id: 'comunicados-fixados',
    family: 'both',
    order: 65,
    size: 'third',
    render() {
      const all = Q.notices();
      const pinned = all.filter((n) => n.pinned);
      const list = (pinned.length ? pinned : all).slice(0, 3);
      const seen = lastSeen();
      return html`<section class="card co-widget">
        <div class="card-head"><h2>${icon('megaphone')}${pinned.length ? 'Comunicados fixados' : 'Comunicados'}</h2><a class="sub" href="#comunicados">Ver todos</a></div>
        <div class="card-body">${list.length
          ? html`<ul class="items co-wlist">${list.map(
              (n) => html`<li><a class="co-wlink" href="#comunicados" data-co-wopen="${n.id}"><span class="co-wt">${n.pinned ? icon('pin') : ''}${n.title}${isNew(n, seen) ? html` <span class="pill info">Novo</span>` : ''}</span><span class="co-wx small muted">${U.fmtDate(n.date)} · ${(n.body || '').replace(/\s+/g, ' ').slice(0, 110)}${(n.body || '').length > 110 ? '…' : ''}</span></a></li>`,
            )}</ul>`
          : html`<p class="muted small">Nenhum comunicado por enquanto.</p>`}</div>
      </section>`;
    },
    mount(el) {
      el.addEventListener('click', (e) => {
        const a = e.target.closest('[data-co-wopen]');
        if (!a) return;
        PS().open[a.dataset.coWopen] = true;
      });
    },
  });

  App.action({ id: 'novo-comunicado', label: 'Publicar comunicado', icon: 'megaphone', order: 72, perm: 'comunicados.publicar', keys: 'comunicado aviso circular informe recado geral reunião feriado', run: () => openNotice({}) });

  App.searchProvider((query) =>
    Q.notices()
      .filter((n) => U.matches(query, n.title, n.body))
      .slice(0, 5)
      .map((n) => ({
        group: 'Comunicados',
        label: n.title,
        icon: 'megaphone',
        meta: U.fmtDate(n.date),
        run: () => {
          const st = PS();
          st.q = '';
          st.filter = 'todos';
          st.open[n.id] = true;
          App.go('comunicados');
        },
      })),
  );

  Actions.novoComunicado = (opts = {}) => openNotice(opts);
})();
