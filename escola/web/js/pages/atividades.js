'use strict';
/* Módulo: Registro de atividades (auditoria).
   Quem tem auditoria.ver vê as atividades de toda a escola e filtra por pessoa; os demais veem só as próprias
   (o servidor já filtra). Paginação "carregar mais", busca no texto, tipo de atividade, marca de registro
   sigiloso e exportação em CSV. Os registros vêm por Api.audit (fora do retrato). */
(() => {
  const PAGE = 100;
  const EXPORT_MAX = 5000;
  /** Tipo de atividade pelo nome do comando/evento. */
  const CATS = [
    [/^(login|logout|senha|convite\.aceito|privacidade\.aceite|setup)/, 'Entrada e conta', 'key'],
    [/^(users\.|profiles\.|owner\.|staff\.links|me\.update|preview)/, 'Equipe e acessos', 'briefcase'],
    [/^(family\.|students\.guardian)/, 'Famílias', 'heart'],
    [/^students\./, 'Alunos', 'users'],
    [/^(classes\.|subjects\.)/, 'Turmas', 'layers'],
    [/^attendance\./, 'Frequência', 'checkSquare'],
    [/^(grades\.|terms\.|councils\.)/, 'Notas', 'grade'],
    [/^(diary\.|routines\.)/, 'Agenda', 'bookOpen'],
    [/^messages\./, 'Mensagens', 'message'],
    [/^(support|plans\.)/, 'Atendimentos', 'shield'],
    [/^(events\.|notices\.)/, 'Comunicação', 'megaphone'],
    [/^invoices\./, 'Financeiro', 'wallet'],
    [/^(settings\.|year\.)/, 'Configurações', 'settings'],
    [/^backup\./, 'Backup', 'download'],
    [/^desfazer:/, 'Desfazer', 'undo'],
  ];
  const catOf = (cmd) => {
    const c = String(cmd || '');
    const base = c.startsWith('desfazer:') ? c.slice(9) : c;
    for (const [re, label, ic] of CATS) if (re.test(c) || (c !== base && re.test(base))) return { label: c !== base ? 'Desfazer' : label, icon: c !== base ? 'undo' : ic };
    return { label: 'Outros', icon: 'activity' };
  };
  const failed = (cmd) => /falha$/.test(String(cmd || ''));

  const state = () => PageState.get('atividades', { userId: '', q: '', cat: '', items: [], more: true, loading: false, loaded: false, error: '', key: '' });
  const canAll = () => Store.can('auditoria.ver');
  const keyOf = (s) => `${Store.me ? Store.me.id : ''}|${canAll() ? s.userId || '' : 'eu'}`;
  const onPage = () => App.route()[0] === 'atividades';
  // cada vez que a pessoa volta para a tela, busca de novo (o registro cresce o tempo todo)
  window.addEventListener('hashchange', () => {
    if (onPage()) state().stale = true;
  });

  let seq = 0;
  const fetchPage = (s, before) => Api.audit({ before, limit: PAGE, userId: canAll() && s.userId ? s.userId : undefined });
  const load = async ({ reset = false } = {}) => {
    const s = state();
    if (Store.preview) return;
    const key = keyOf(s);
    if (reset || s.key !== key) {
      seq++; // descarta a resposta de uma busca anterior ainda em andamento
      Object.assign(s, { items: [], more: true, loaded: false, loading: false, error: '', key });
    }
    if (s.loading || !s.more) return;
    s.loading = true;
    s.error = '';
    const my = ++seq;
    if (s.loaded && onPage()) App.render();
    try {
      const last = s.items[s.items.length - 1];
      const r = await fetchPage(s, last ? last.id : undefined);
      if (my !== seq) return;
      const items = (r && Array.isArray(r.items) ? r.items : []).filter((x) => x && x.id != null);
      s.items = s.items.concat(items);
      s.more = items.length === PAGE;
    } catch (err) {
      if (my !== seq) return;
      s.error = (err && err.message) || 'Não foi possível carregar o registro.';
    } finally {
      if (my === seq) {
        s.loading = false;
        s.loaded = true;
        if (onPage()) App.render();
      }
    }
  };

  const filtered = (s, items = s.items) =>
    items.filter((x) => (!s.cat || catOf(x.cmd).label === s.cat) && (!s.q || U.matches(s.q, x.summary, x.userName, catOf(x.cmd).label)));

  const dayLabel = (iso) => {
    const d = new Date(iso);
    if (isNaN(d)) return 'Sem data';
    const day = U.iso(d);
    const t = U.today();
    if (day === t) return 'Hoje';
    if (day === U.addDays(t, -1)) return 'Ontem';
    return U.cap(U.fmtDateLong(day)) + (day.slice(0, 4) !== t.slice(0, 4) ? ` de ${day.slice(0, 4)}` : '');
  };
  const timeOf = (iso) => {
    const d = new Date(iso);
    return isNaN(d) ? '' : U.fmtTime(d);
  };

  const row = (x) => {
    const c = catOf(x.cmd);
    const who = x.userName || (x.userId ? Q.userName(x.userId, 'Pessoa removida') : 'Sistema');
    return html`<li class="at-item ${x.confidential ? 'conf' : ''} ${failed(x.cmd) ? 'fail' : ''}">
      <time class="at-time" datetime="${x.at}">${timeOf(x.at)}</time>
      ${x.userId ? UI.avatar(who, 'sm') : html`<span class="at-sys" aria-hidden="true">${icon('zap')}</span>`}
      <div class="at-text">
        <p><b>${who}</b> <span>${x.summary || x.cmd}</span></p>
        <p class="at-meta"><span class="at-cat">${icon(c.icon)}${c.label}</span>${x.confidential ? html`<span class="at-conf" title="Registro sigiloso: acesso a informação confidencial">${icon('lock')}Sigiloso</span>` : ''}${failed(x.cmd) ? html`<span class="at-fail">${icon('alert')}Recusado</span>` : ''}</p>
      </div>
    </li>`;
  };

  const listHTML = (s) => {
    const items = filtered(s);
    if (!s.loaded && s.loading) return html`<div class="card at-loading">${UI.spinner()}<span class="muted">Carregando o registro…</span></div>`;
    if (s.error && !s.items.length) return html`<div class="card">${UI.empty({ icon: 'alert', title: 'Não foi possível carregar', text: s.error, action: html`<button type="button" class="btn primary" data-retry>${icon('refresh')}Tentar de novo</button>` })}</div>`;
    if (!items.length) {
      const narrowed = s.q || s.cat;
      return html`<div class="card">${UI.empty({
        icon: narrowed ? 'search' : 'history',
        title: narrowed ? 'Nada encontrado' : 'Nenhuma atividade ainda',
        text: narrowed ? (s.more ? 'Nada nos registros carregados. Carregue registros mais antigos ou mude a busca.' : 'Nenhum registro combina com a busca.') : canAll() && s.userId ? 'Esta pessoa ainda não fez nada registrado.' : 'As ações feitas no sistema aparecem aqui.',
        action: narrowed ? html`<button type="button" class="btn" data-clear>${icon('x')}Limpar busca</button>${s.more ? html`<button type="button" class="btn" data-more>Carregar mais antigos</button>` : ''}` : '',
      })}</div>`;
    }
    const days = [];
    for (const x of items) {
      const label = dayLabel(x.at);
      const last = days[days.length - 1];
      if (last && last.label === label) last.items.push(x);
      else days.push({ label, items: [x] });
    }
    return html`<div class="card at-card">${days.map((d) => html`<section class="at-day"><h2 class="at-day-head">${d.label}<span>${d.items.length}</span></h2><ul class="at-list">${d.items.map(row)}</ul></section>`)}</div>
      <div class="at-foot">
        <span class="small muted">${s.q || s.cat ? `${items.length} de ${s.items.length} ${s.items.length === 1 ? 'registro carregado' : 'registros carregados'}` : s.items.length === 1 ? '1 registro carregado' : `${s.items.length} registros carregados`}${s.more ? '' : ' · fim do registro'}</span>
        ${s.more ? html`<button type="button" class="btn" data-more ${s.loading ? raw('disabled') : ''}>${s.loading ? UI.spinner() : icon('chevronDown')}Carregar mais antigos</button>` : ''}
      </div>`;
  };

  const render = () => {
    const s = state();
    const all = canAll();
    if (Store.preview) {
      return html`<div class="page-head"><div><h1>Registro de atividades</h1></div></div><div class="card">${UI.empty({ icon: 'eye', title: 'Indisponível no modo "ver como"', text: 'O registro de atividades mostra o que cada pessoa fez e não aparece na visualização como outra pessoa.' })}</div>`;
    }
    const staff = all ? Q.staff({ status: 'todos' }) : [];
    const cats = [...new Set(s.items.map((x) => catOf(x.cmd).label))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
    if (s.cat && !cats.includes(s.cat)) cats.push(s.cat);
    const who = all && s.userId ? Q.userName(s.userId, 'pessoa') : '';
    return html`
      <div class="page-head">
        <div><h1>${all ? 'Registro de atividades' : 'Minhas atividades'}</h1>
          <p class="lead">${all
            ? html`Quem fez o quê e quando, de toda a escola${who ? html` — mostrando <b>${who}</b>` : ''}. Leituras de informação sigilosa ficam marcadas com ${icon('lock')}.`
            : 'O que você fez no sistema. Só você e a direção veem este registro.'}</p></div>
        <div class="btn-row"><button type="button" class="btn" data-refresh ${s.loading ? raw('disabled') : ''}>${icon('refresh')}Atualizar</button><button type="button" class="btn" data-export ${!s.items.length ? raw('disabled') : ''}>${icon('download')}Exportar CSV</button></div>
      </div>
      <div class="toolbar at-toolbar">
        <div class="search-box"><label class="sr-only" for="at-q">Buscar nas atividades</label>${icon('search')}<input class="input" id="at-q" type="search" placeholder="Buscar no texto (aluno, turma, ação…)" value="${s.q}" autocomplete="off"></div>
        ${all
          ? html`<label class="sr-only" for="at-user">Pessoa</label><select class="input at-user" id="at-user" data-user><option value="">Todas as pessoas</option>${staff.map((u) => html`<option value="${u.id}" ${s.userId === u.id ? raw('selected') : ''}>${u.name}${u.status !== 'ativo' ? ' (inativo)' : ''}</option>`)}</select>`
          : ''}
        <label class="sr-only" for="at-cat">Tipo de atividade</label><select class="input at-cat-f" id="at-cat" data-cat><option value="">Todos os tipos</option>${cats.map((c) => html`<option value="${c}" ${s.cat === c ? raw('selected') : ''}>${c}</option>`)}</select>
      </div>
      ${s.error && s.items.length ? html`<div class="notice bad">${icon('alert')}<span class="grow">${s.error}</span><button type="button" class="btn sm" data-retry>Tentar de novo</button></div>` : ''}
      <div data-at-list>${listHTML(s)}</div>`;
  };

  const exportCSV = async (btn) => {
    const s = state();
    btn.disabled = true;
    btn.classList.add('loading');
    try {
      // junta tudo (até EXPORT_MAX) para a exportação não depender do que foi carregado na tela
      let rows = s.items.slice();
      let more = s.more;
      while (more && rows.length < EXPORT_MAX) {
        const r = await fetchPage(s, rows.length ? rows[rows.length - 1].id : undefined);
        const items = (r && r.items) || [];
        rows = rows.concat(items);
        more = items.length === PAGE;
      }
      const list = filtered(s, rows);
      if (!list.length) return UI.toast('Nada para exportar com esses filtros.', { tone: 'bad' });
      const out = [['Data', 'Hora', 'Pessoa', 'Tipo', 'O que foi feito', 'Sigiloso']].concat(
        list.map((x) => {
          const d = new Date(x.at);
          return [isNaN(d) ? '' : U.fmtDate(U.iso(d)), timeOf(x.at), x.userName || (x.userId ? Q.userName(x.userId, '') : 'Sistema'), catOf(x.cmd).label, x.summary || x.cmd, x.confidential ? 'sim' : ''];
        }),
      );
      const who = canAll() && s.userId ? '-' + U.slug(Q.userName(s.userId, 'pessoa')) : canAll() ? '' : '-minhas';
      const ok = await U.download(`atividades${who}-${U.today()}.csv`, U.toCSV(out));
      if (ok) UI.toast(`${list.length} registro${list.length === 1 ? '' : 's'} exportado${list.length === 1 ? '' : 's'}${more ? ` (limite de ${EXPORT_MAX})` : ''}.`, { ic: 'download' });
    } catch (err) {
      UI.errorToast(err);
    } finally {
      if (document.contains(btn)) {
        btn.disabled = false;
        btn.classList.remove('loading');
      }
    }
  };

  App.page({
    id: 'atividades',
    label: 'Registro de atividades',
    icon: 'history',
    group: 'Gestão',
    order: 90,
    nav: () => Store.can('auditoria.ver'),
    keys: 'auditoria histórico log quem fez',
    title: () => (canAll() ? 'Registro de atividades' : 'Minhas atividades'),
    render,
    mount(el) {
      const s = state();
      if (!Store.preview) {
        if (s.stale) {
          s.stale = false;
          load({ reset: true });
        } else if (s.key !== keyOf(s) || (!s.loaded && !s.loading)) load({ reset: s.key !== keyOf(s) });
      }
      const q = el.querySelector('#at-q');
      if (q)
        q.addEventListener(
          'input',
          U.debounce(() => {
            if (!document.contains(q)) return; // a tela já foi redesenhada
            s.q = q.value;
            UI.setHTML(el.querySelector('[data-at-list]'), listHTML(s));
          }, 150),
        );
      el.addEventListener('change', (e) => {
        if (q) s.q = q.value;
        if (e.target.matches('[data-user]')) {
          s.userId = e.target.value;
          s.cat = '';
          load({ reset: true });
          App.render();
        } else if (e.target.matches('[data-cat]')) {
          s.cat = e.target.value;
          UI.setHTML(el.querySelector('[data-at-list]'), listHTML(s));
        }
      });
      el.addEventListener('click', (e) => {
        const t = e.target;
        if (t.closest('[data-more]')) return load();
        if (t.closest('[data-refresh]')) {
          load({ reset: true });
          return App.render();
        }
        if (t.closest('[data-retry]')) {
          s.error = '';
          return load({ reset: !s.items.length });
        }
        if (t.closest('[data-clear]')) {
          s.q = '';
          s.cat = '';
          return App.render();
        }
        const ex = t.closest('[data-export]');
        if (ex) exportCSV(ex);
      });
    },
  });
})();
