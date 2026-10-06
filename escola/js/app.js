'use strict';
/* Casca do app: navegação, rotas, busca rápida (Ctrl+K), menu "Novo", tema, atalhos e ajuda. */
const App = (() => {
  const NAV = [
    ['Dia a dia', [
      ['painel', 'Painel', 'home'],
      ['chamada', 'Chamada', 'checkSquare'],
      ['notas', 'Notas', 'grade'],
      ['agenda', 'Agenda', 'calendar'],
      ['comunicados', 'Comunicados', 'megaphone'],
    ]],
    ['Cadastros', [
      ['alunos', 'Alunos', 'users'],
      ['turmas', 'Turmas', 'layers'],
      ['professores', 'Professores', 'teacher'],
    ]],
    ['Gestão', [
      ['financeiro', 'Financeiro', 'wallet'],
      ['relatorios', 'Relatórios', 'chart'],
      ['configuracoes', 'Configurações', 'settings'],
    ]],
  ];
  const TABBAR = [['painel', 'Painel', 'home'], ['chamada', 'Chamada', 'checkSquare'], ['alunos', 'Alunos', 'users'], ['notas', 'Notas', 'grade']];

  const main = document.getElementById('main');
  let current = '';
  let lastWidth = window.innerWidth;

  const route = () => {
    const h = decodeURIComponent(location.hash.replace(/^#\/?/, ''));
    return h ? h.split('/') : ['painel'];
  };
  const go = (path) => {
    if (route().join('/') === path) render();
    else location.hash = path;
  };

  // ---------- navegação ----------
  const badges = () => {
    const pend = Q.pendingRolls().length;
    const debt = Q.debtors().length;
    return { chamada: pend ? `<span class="badge" title="Turmas sem chamada hoje">${pend}</span>` : '', financeiro: debt ? `<span class="badge bad" title="Alunos com mensalidade atrasada">${debt}</span>` : '' };
  };
  const renderNav = () => {
    const [name] = route();
    const b = badges();
    document.getElementById('nav').innerHTML = NAV.map(
      ([title, items]) =>
        `<div class="nav-group"><div class="nav-title">${title}</div>${items
          .map(([id, label, ic]) => `<a class="side-link ${name === id ? 'active' : ''}" href="#${id}" ${name === id ? 'aria-current="page"' : ''}>${icon(ic)}<span>${label}</span>${b[id] || ''}</a>`)
          .join('')}</div>`,
    ).join('');
    document.getElementById('tabbar').innerHTML =
      TABBAR.map(([id, label, ic]) => `<a href="#${id}" class="${name === id ? 'active' : ''}">${icon(ic)}<span>${label}</span>${b[id] || ''}</a>`).join('') +
      `<button type="button" data-act="open-menu">${icon('menu')}<span>Mais</span></button>`;
    const s = Q.settings();
    document.getElementById('brandName').textContent = s.schoolName;
    document.getElementById('brandYear').innerHTML = `Ano letivo ${s.year} · ${s.term}º bim.${s.demo ? '<span class="demo-tag">Exemplo</span>' : ''}`;
  };

  const renderBanner = () => {
    const s = Q.settings();
    const el = document.getElementById('banner');
    if (!Store.persistent) {
      el.innerHTML = `<div class="notice warn">${icon('alert')}<span class="grow">Este navegador não está guardando os dados (janela anônima ou armazenamento bloqueado). Antes de sair, exporte um backup em Configurações.</span></div>`;
    } else if (s.demo && !s.bannerClosed && route()[0] === 'painel') {
      el.innerHTML = `<div class="notice">${icon('sparkles')}<span class="grow"><b>Escola de exemplo.</b> Os alunos, notas e pagamentos aqui são fictícios, para você explorar à vontade. Quando quiser, comece com os dados da sua escola.</span>
        <button class="btn sm primary" data-act="start-fresh">Começar com minha escola</button><button class="btn sm ghost" data-act="close-banner">Continuar explorando</button></div>`;
    } else el.innerHTML = '';
  };

  const render = () => {
    const parts = route();
    const [name, ...rest] = parts;
    const page = Pages[name] || Pages.painel;
    const key = parts.join('/');
    const same = key === current;
    const y = window.scrollY;
    current = key;
    UI.closeMenu();
    const el = document.createElement('div');
    el.className = 'page';
    try {
      el.innerHTML = page.render(rest);
    } catch (err) {
      console.error(err);
      el.innerHTML = UI.empty({ icon: 'alert', title: 'Não foi possível abrir esta tela', text: 'Algo deu errado ao montar a página. Volte ao painel e tente de novo.', action: '<a class="btn primary" href="#painel">Ir para o painel</a>' });
    }
    if (same) el.style.animation = 'none';
    main.replaceChildren(el);
    try {
      page.mount && page.mount(el, rest);
    } catch (err) {
      console.error(err);
    }
    renderNav();
    renderBanner();
    document.title = `${page.title || 'Painel'} · ${Q.settings().schoolName}`;
    if (same) window.scrollTo(0, y);
    else window.scrollTo(0, 0);
    closeSidebar();
  };

  // ---------- menu lateral (telas estreitas) ----------
  const sidebar = document.getElementById('sidebar');
  const scrim = document.querySelector('.scrim');
  const openSidebar = () => {
    sidebar.classList.add('open');
    scrim.hidden = false;
    sidebar.querySelector('.side-link.active, .side-link')?.focus();
  };
  const closeSidebar = () => {
    sidebar.classList.remove('open');
    scrim.hidden = true;
  };

  // ---------- tema ----------
  const THEME_KEY = 'caderneta.tema';
  const getTheme = () => {
    try {
      return localStorage.getItem(THEME_KEY) || 'system';
    } catch (e) {
      return 'system';
    }
  };
  let ownTheme = false;
  const applyTheme = (t) => {
    const root = document.documentElement;
    if (t === 'light' || t === 'dark') {
      root.setAttribute('data-theme', t);
      ownTheme = true;
    } else if (ownTheme) {
      root.removeAttribute('data-theme');
      ownTheme = false;
    }
    const ic = { system: 'monitor', light: 'sun', dark: 'moon' }[t] || 'monitor';
    const label = { system: 'Tema: automático', light: 'Tema: claro', dark: 'Tema: escuro' }[t];
    const btn = document.getElementById('themeBtn');
    btn.innerHTML = icon(ic);
    btn.title = label + ' (clique para trocar)';
    btn.setAttribute('aria-label', label + '. Clique para trocar');
  };
  const setTheme = (t) => {
    try {
      localStorage.setItem(THEME_KEY, t);
    } catch (e) {
      /* sem armazenamento: vale só nesta visita */
    }
    applyTheme(t);
  };
  const cycleTheme = () => {
    const order = ['system', 'light', 'dark'];
    const next = order[(order.indexOf(getTheme()) + 1) % 3];
    setTheme(next);
    UI.toast({ system: 'Tema automático (segue o sistema)', light: 'Tema claro', dark: 'Tema escuro' }[next], { ic: next === 'dark' ? 'moon' : next === 'light' ? 'sun' : 'monitor' });
  };

  // ---------- menu "Novo" ----------
  const newItems = () => [
    { label: 'Matricular aluno', icon: 'userPlus', fn: () => Actions.matricular() },
    { label: 'Registrar pagamento', icon: 'cash', fn: () => Actions.receberRapido() },
    { label: 'Fazer chamada', icon: 'checkSquare', fn: () => go('chamada') },
    { label: 'Lançar notas', icon: 'grade', fn: () => go('notas') },
    { label: 'Novo evento na agenda', icon: 'calendar', fn: () => Actions.novoEvento() },
    { label: 'Novo comunicado', icon: 'megaphone', fn: () => Actions.novoComunicado() },
    '-',
    { label: 'Cadastrar professor', icon: 'teacher', fn: () => Actions.novoProfessor() },
    { label: 'Criar turma', icon: 'layers', fn: () => Actions.novaTurma() },
  ];

  // ---------- busca rápida ----------
  const palette = () => {
    const pages = NAV.flatMap(([, items]) => items).map(([id, label, ic]) => ({ group: 'Ir para', label, icon: ic, run: () => go(id), keys: label }));
    const actions = newItems()
      .filter((x) => x !== '-')
      .map((x) => ({ group: 'Ações', label: x.label, icon: x.icon, run: x.fn, keys: x.label }))
      .concat([
        { group: 'Ações', label: 'Gerar mensalidades do mês', icon: 'wallet', run: () => Actions.gerarMensalidades(), keys: 'gerar cobrança boleto mensalidade' },
        { group: 'Ações', label: 'Exportar backup dos dados', icon: 'download', run: () => go('configuracoes'), keys: 'backup exportar salvar copia' },
        { group: 'Ações', label: 'Trocar tema claro/escuro', icon: 'moon', run: cycleTheme, keys: 'tema escuro claro dark' },
      ]);
    const build = (q) => {
      const out = [];
      const qn = U.norm(q);
      const add = (list, limit) => list.filter((x) => !qn || U.matches(q, x.keys)).slice(0, limit).forEach((x) => out.push(x));
      if (!qn) {
        add(actions.slice(0, 6), 6);
        add(pages, 11);
        return out;
      }
      add(
        Q.students({ status: 'todos' }).map((a) => ({
          group: 'Alunos',
          label: a.name,
          avatar: a.name,
          meta: `${Q.klass(a.classId)?.name || 'sem turma'}${a.status !== 'ativo' ? ' · ' + a.status : ''}`,
          run: () => go('alunos/' + a.id),
          keys: `${a.name} ${a.enrollment} ${a.guardian?.name || ''}`,
        })),
        7,
      );
      add(Q.classes().map((c) => ({ group: 'Turmas', label: c.name, icon: 'layers', meta: `${c.shift} · ${Q.roster(c.id).length} alunos`, run: () => go('turmas/' + c.id), keys: `${c.name} turma ${c.room}` })), 4);
      add(Q.teachers().map((t) => ({ group: 'Professores', label: t.name, avatar: t.name, meta: t.subjectIds.map((s) => Q.subject(s)?.name).filter(Boolean).join(', '), run: () => Actions.verProfessor(t.id), keys: `${t.name} professor ${t.subjectIds.map((s) => Q.subject(s)?.name).join(' ')}` })), 4);
      add(actions, 5);
      add(pages, 5);
      return out;
    };
    let items = [];
    let sel = 0;
    const m = UI.modal({
      head: false,
      cls: 'palette',
      guard: false,
      top: `<div class="palette-input">${icon('search')}<input id="pal-q" placeholder="Digite o nome de um aluno, turma, professor ou ação…" autocomplete="off" aria-label="Buscar" autofocus><kbd>Esc</kbd></div>`,
      body: '<div id="pal-list" role="listbox"></div>',
      onMount(el, api) {
        const input = UI.$('#pal-q', el);
        const list = UI.$('#pal-list', el);
        const draw = () => {
          items = build(input.value);
          sel = Math.min(sel, Math.max(0, items.length - 1));
          let g = '';
          list.innerHTML = items.length
            ? items
                .map((it, i) => {
                  const head = it.group !== g ? `<div class="palette-group">${(g = it.group)}</div>` : '';
                  return `${head}<button class="palette-item ${i === sel ? 'sel' : ''}" role="option" aria-selected="${i === sel}" data-i="${i}">${it.avatar ? UI.avatar(it.avatar, 'sm') : icon(it.icon)}<span>${U.esc(it.label)}</span>${it.meta ? `<span class="meta">${U.esc(it.meta)}</span>` : ''}</button>`;
                })
                .join('')
            : `<div class="empty"><p>Nada encontrado para “${U.esc(input.value)}”. Tente parte do nome ou o número de matrícula.</p></div>`;
          const cur = list.querySelector('.sel');
          cur && cur.scrollIntoView({ block: 'nearest' });
        };
        const run = (i) => {
          const it = items[i];
          if (!it) return;
          api.close();
          it.run();
        };
        input.addEventListener('input', () => {
          sel = 0;
          draw();
        });
        input.addEventListener('keydown', (e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            sel = Math.min(items.length - 1, sel + 1);
            draw();
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            sel = Math.max(0, sel - 1);
            draw();
          } else if (e.key === 'Enter') {
            e.preventDefault();
            run(sel);
          }
        });
        list.addEventListener('click', (e) => {
          const b = e.target.closest('[data-i]');
          if (b) run(Number(b.dataset.i));
        });
        draw();
      },
    });
    return m;
  };

  // ---------- ajuda ----------
  const help = () =>
    UI.modal({
      title: 'Atalhos e ajuda',
      sub: 'Tudo o que você precisa para usar a Caderneta no dia a dia.',
      size: 'lg',
      body: `
        <div class="grid-2" style="grid-template-columns:repeat(auto-fit,minmax(240px,1fr))">
          <div class="stack" style="gap:12px">
            <h3>Como fazer</h3>
            <ul class="items small">
              <li>${icon('userPlus')}<span class="grow"><b>Matricular:</b> botão <b>Novo</b> → Matricular aluno. O passo a passo pede só o essencial.</span></li>
              <li>${icon('checkSquare')}<span class="grow"><b>Chamada:</b> todos começam presentes. Toque em quem faltou e salve.</span></li>
              <li>${icon('grade')}<span class="grow"><b>Notas:</b> escolha turma e disciplina, digite a nota e aperte Enter para ir ao próximo.</span></li>
              <li>${icon('cash')}<span class="grow"><b>Pagamento:</b> em Financeiro, clique em <b>Receber</b> na mensalidade.</span></li>
              <li>${icon('download')}<span class="grow"><b>Backup:</b> em Configurações você exporta e importa todos os dados.</span></li>
            </ul>
          </div>
          <div class="stack" style="gap:12px">
            <h3>Atalhos de teclado</h3>
            <table class="table small"><tbody>
              <tr><td><kbd>Ctrl</kbd> + <kbd>K</kbd> ou <kbd>/</kbd></td><td>Buscar qualquer coisa</td></tr>
              <tr><td><kbd>N</kbd></td><td>Abrir o menu Novo</td></tr>
              <tr><td><kbd>P</kbd> <kbd>F</kbd> <kbd>J</kbd></td><td>Na chamada: presente, falta, justificada</td></tr>
              <tr><td><kbd>Enter</kbd> / <kbd>↑</kbd> <kbd>↓</kbd></td><td>Nas notas: próximo / anterior aluno</td></tr>
              <tr><td><kbd>Esc</kbd></td><td>Fechar janelas</td></tr>
              <tr><td><kbd>?</kbd></td><td>Abrir esta ajuda</td></tr>
            </tbody></table>
            <p class="small muted">Os dados ficam guardados neste navegador. Faça um backup de vez em quando em Configurações.</p>
          </div>
        </div>`,
      foot: '<button class="btn primary" data-close>Entendi</button>',
    });

  // ---------- começar do zero ----------
  const startFresh = () => {
    const s = Q.settings();
    const defs = [
      { name: 'schoolName', label: 'Nome da escola', required: true, full: true, placeholder: 'Ex.: Escola Estadual Machado de Assis' },
      { name: 'year', label: 'Ano letivo', type: 'number', required: true, min: 2000, max: 2100 },
      { name: 'term', label: 'Bimestre atual', type: 'select', options: [[1, '1º bimestre'], [2, '2º bimestre'], [3, '3º bimestre'], [4, '4º bimestre']] },
      { name: 'defaultFee', label: 'Mensalidade padrão', type: 'money', min: 0, hint: 'Deixe 0 se a escola for pública.' },
      { name: 'dueDay', label: 'Dia de vencimento', type: 'number', min: 1, max: 28 },
    ];
    UI.formDrawer({
      title: 'Começar com a sua escola',
      sub: 'Os dados de exemplo serão apagados. As disciplinas padrão continuam e podem ser ajustadas depois.',
      defs,
      values: { schoolName: '', year: s.year, term: s.term, defaultFee: 0, dueDay: 10 },
      submitLabel: 'Criar minha escola',
      onSubmit(d) {
        const fresh = Seed.empty();
        Object.assign(fresh.settings, { schoolName: d.schoolName, year: Number(d.year), term: Number(d.term), defaultFee: d.defaultFee || 0, dueDay: Number(d.dueDay) || 10 });
        fresh.log = [{ at: Date.now(), text: `Escola ${d.schoolName} criada`, icon: 'school' }];
        Store.replace(fresh);
        go('painel');
        UI.toast('Pronto! Siga os primeiros passos do painel.', { ic: 'sparkles' });
      },
    });
  };

  // ---------- eventos globais ----------
  document.addEventListener('click', (e) => {
    const a = e.target.closest('[data-act]');
    if (!a) return;
    const act = a.dataset.act;
    if (act === 'skip') {
      e.preventDefault();
      main.focus();
    } else if (act === 'open-menu') openSidebar();
    else if (act === 'close-menu') closeSidebar();
    else if (act === 'palette') palette();
    else if (act === 'new-menu') UI.menu(a, newItems());
    else if (act === 'theme') cycleTheme();
    else if (act === 'help') {
      closeSidebar();
      help();
    } else if (act === 'close-banner') Store.update((s) => (s.settings.bannerClosed = true));
    else if (act === 'start-fresh') startFresh();
  });

  const typing = (el) => el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      if (!document.querySelector('.palette')) palette();
      return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey || typing(e.target) || document.querySelector('.overlay')) return;
    if (e.key === '/') {
      e.preventDefault();
      palette();
    } else if (e.key === '?') {
      e.preventDefault();
      help();
    } else if (e.key === 'n' || e.key === 'N') {
      const btn = document.querySelector('[data-act="new-menu"]');
      if (btn && !document.querySelector('.menu')) {
        e.preventDefault();
        UI.menu(btn, newItems());
      }
    } else if (e.key === 'Escape' && sidebar.classList.contains('open')) closeSidebar();
  });

  window.addEventListener('hashchange', render);
  window.addEventListener(
    'resize',
    U.debounce(() => {
      if (Math.abs(window.innerWidth - lastWidth) < 40) return;
      lastWidth = window.innerWidth;
      if (!typing(document.activeElement)) render();
    }, 220),
  );

  const init = () => {
    document.querySelectorAll('[data-icon]').forEach((el) => (el.outerHTML = icon(el.dataset.icon)));
    document.querySelector('.side-close').innerHTML = icon('x');
    applyTheme(getTheme());
    Store.load();
    Store.on(render);
    render();
  };

  const chrome = () => {
    renderNav();
    renderBanner();
  };

  return { init, go, render, route, palette, help, chrome, getTheme, setTheme };
})();

App.init();
