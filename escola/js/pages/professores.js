'use strict';
/* Professores: quem leciona o quê e em quais turmas. */
Pages.professores = {
  title: 'Professores',
  render() {
    const v = (View.prof = View.prof || { q: '' });
    const list = Q.teachers().filter((t) => U.matches(v.q, t.name, t.email, ...t.subjectIds.map((s) => Q.subject(s)?.name)));
    const all = Store.state.teachers.length;
    return `
      <div class="page-head">
        <div><h1>Professores</h1><p class="lead">${U.plural(all, 'professor cadastrado', 'professores cadastrados')}. Para definir quem dá aula em cada turma, abra a turma e use a aba Professores.</p></div>
        <button class="btn primary" data-x="new">${icon('plus')}Cadastrar professor</button>
      </div>
      ${
        all
          ? `<div class="toolbar"><label class="search-box" style="max-width:420px"><span class="sr-only">Buscar professor</span>${icon('search')}<input class="input" id="q-prof" type="search" placeholder="Nome ou disciplina" value="${U.esc(v.q)}"></label></div>
        <div class="cards">${
          list.length
            ? list
                .map((t) => {
                  const tc = Q.teacherClasses(t.id);
                  const lessons = Store.state.classes.reduce((n, c) => n + c.schedule.flat().filter((sid) => sid && c.subjects[sid] === t.id).length, 0);
                  return `<button type="button" class="card tile" data-t="${t.id}">
                    <div class="tile-top">${UI.avatar(t.name, '')}<div class="grow"><h3>${U.esc(t.name)}</h3><div class="person-sub">${U.esc(t.email || t.phone || 'Sem contato')}</div></div>
                    ${t.status !== 'ativo' ? UI.pill('Afastado', 'warn') : ''}</div>
                    <div class="chips">${t.subjectIds.map((sid) => Q.subject(sid)).filter(Boolean).map((s) => `<span class="subject-tag"><span class="swatch c${s.color}"></span>${U.esc(s.name)}</span>`).join('') || '<span class="small muted">Nenhuma disciplina</span>'}</div>
                    <div class="tile-stats">
                      <div><b>${tc.length}</b><span>turmas</span></div>
                      <div><b>${lessons}</b><span>aulas/semana</span></div>
                      <div><b style="font-size:.9rem;line-height:1.35">${tc.some((x) => x.homeroom) ? tc.filter((x) => x.homeroom).map((x) => U.esc(x.klass.name)).join(', ') : '—'}</b><span>regente de</span></div>
                    </div>
                  </button>`;
                })
                .join('')
            : `<div class="card" style="grid-column:1/-1">${UI.empty({ icon: 'search', title: 'Nenhum professor encontrado', text: 'Tente outro nome ou disciplina.' })}</div>`
        }</div>`
          : `<section class="card">${UI.empty({ icon: 'teacher', title: 'Nenhum professor ainda', text: 'Cadastre os professores para depois ligá-los às turmas e disciplinas.', action: `<button class="btn primary" data-x="new">${icon('plus')}Cadastrar professor</button>` })}</section>`
      }`;
  },
  mount(el) {
    const q = UI.$('#q-prof', el);
    q &&
      q.addEventListener(
        'input',
        U.debounce((e) => {
          View.prof.q = e.target.value;
          App.render();
          const n = UI.$('#q-prof');
          n.focus();
          n.setSelectionRange(n.value.length, n.value.length);
        }, 200),
      );
    el.addEventListener('click', (e) => {
      const t = e.target.closest('[data-t]');
      if (t) return Actions.verProfessor(t.dataset.t);
      if (e.target.closest('[data-x="new"]')) Actions.novoProfessor();
    });
  },
};

const teacherDefs = () => [
  { name: 'name', label: 'Nome completo', required: true, full: true },
  { name: 'email', label: 'E-mail', type: 'email', placeholder: 'nome@escola.com' },
  { name: 'phone', label: 'Celular', type: 'tel' },
  { name: 'subjectIds', label: 'Disciplinas que leciona', type: 'multichips', full: true, options: Q.subjects().map((s) => [s.id, s.name, s.color]) },
  { name: 'status', label: 'Situação', type: 'select', options: [['ativo', 'Em atividade'], ['afastado', 'Afastado / licença']] },
];

Actions.novoProfessor = () =>
  UI.formDrawer({
    title: 'Cadastrar professor',
    defs: teacherDefs(),
    values: { status: 'ativo', subjectIds: [] },
    submitLabel: 'Cadastrar',
    onSubmit(d) {
      const id = 't' + U.uid();
      Store.update((s) => s.teachers.push({ id, ...d }), { log: `Professor(a) ${U.shortName(d.name)} cadastrado(a)`, icon: 'teacher' });
      UI.toast(`${U.firstName(d.name)} foi cadastrado(a)`, { action: { label: 'Ver', fn: () => Actions.verProfessor(id) } });
    },
  });

Actions.editarProfessor = (id) => {
  const t = Q.teacher(id);
  UI.formDrawer({
    title: 'Editar professor',
    defs: teacherDefs(),
    values: t,
    submitLabel: 'Salvar alterações',
    onSubmit(d) {
      Store.update((s) => Object.assign(s.teachers.find((x) => x.id === id), d), { log: `Cadastro de ${U.shortName(d.name)} atualizado`, icon: 'pencil' });
      UI.toast('Alterações salvas');
    },
  });
};

Actions.verProfessor = (id) => {
  const t = Q.teacher(id);
  if (!t) return;
  const tc = Q.teacherClasses(id);
  const dayNames = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex'];
  const lessons = [];
  Store.state.classes.forEach((c) =>
    c.schedule.forEach((day, di) =>
      day.forEach((sid, pi) => {
        if (sid && c.subjects[sid] === id) lessons.push({ di, pi, c, s: Q.subject(sid) });
      }),
    ),
  );
  lessons.sort((a, b) => a.di - b.di || a.pi - b.pi);
  UI.modal({
    title: t.name,
    sub: t.subjectIds.map((s) => Q.subject(s)?.name).filter(Boolean).join(' · ') || 'Sem disciplinas',
    drawer: true,
    body: `
      <div class="stack" style="gap:20px">
        <dl class="kv">
          <dt>E-mail</dt><dd>${t.email ? `${U.esc(t.email)}<button class="copy-btn" data-copy="${U.esc(t.email)}" aria-label="Copiar e-mail">${icon('copy')}</button>` : '—'}</dd>
          <dt>Celular</dt><dd>${t.phone ? `<span class="num">${U.esc(t.phone)}</span><button class="copy-btn" data-copy="${U.esc(t.phone)}" aria-label="Copiar telefone">${icon('copy')}</button><a class="btn sm" href="${U.whatsappLink(t.phone, `Olá, ${U.firstName(t.name)}!`)}" target="_blank" rel="noopener">${icon('message')}WhatsApp</a>` : '—'}</dd>
          <dt>Situação</dt><dd>${t.status === 'ativo' ? UI.pill('Em atividade', 'ok') : UI.pill('Afastado', 'warn')}</dd>
        </dl>
        <div><h3 style="margin-bottom:10px">Turmas</h3>${
          tc.length
            ? `<ul class="items">${tc
                .map((x) => `<li>${icon('layers', 'muted')}<div class="grow"><a class="person-name" href="#turmas/${x.klass.id}" data-close>${U.esc(x.klass.name)}</a><div class="person-sub">${x.subjects.map((s) => U.esc(s.name)).join(', ') || '—'}</div></div>${x.homeroom ? UI.pill('Regente', 'info', true) : ''}</li>`)
                .join('')}</ul>`
            : '<p class="small muted">Ainda não dá aula em nenhuma turma. Abra uma turma e escolha este professor na aba Professores.</p>'
        }</div>
        <div><h3 style="margin-bottom:10px">Aulas na semana (${lessons.length})</h3>${
          lessons.length
            ? `<ul class="items small">${lessons.map((l) => `<li><b style="width:36px;flex:none">${dayNames[l.di]}</b><span class="muted nowrap" style="width:64px;flex:none">${l.pi + 1}º tempo</span><span class="grow">${U.esc(l.s?.name || '')}</span><span class="muted">${U.esc(l.c.name)}</span></li>`).join('')}</ul>`
            : '<p class="small muted">Sem aulas no horário das turmas.</p>'
        }</div>
      </div>`,
    foot: `<button class="btn danger left" data-del>${icon('trash')}Excluir</button><button class="btn" data-close>Fechar</button><button class="btn primary" data-edit>${icon('pencil')}Editar</button>`,
    onMount(el, api) {
      el.addEventListener('click', async (e) => {
        const cp = e.target.closest('[data-copy]');
        if (cp) return UI.copy(cp.dataset.copy);
        if (e.target.closest('a[data-close]')) return api.close();
        if (e.target.closest('[data-edit]')) {
          api.close();
          Actions.editarProfessor(id);
        }
        if (e.target.closest('[data-del]')) {
          const ok = await UI.confirm({
            title: 'Excluir professor?',
            text: tc.length ? `${U.esc(t.name)} está em ${U.plural(tc.length, 'turma', 'turmas')}. Essas aulas ficarão sem professor.` : `${U.esc(t.name)} será removido.`,
            ok: 'Excluir',
            danger: true,
          });
          if (!ok) return;
          api.close();
          Store.update(
            (s) => {
              s.teachers = s.teachers.filter((x) => x.id !== id);
              s.classes.forEach((c) => {
                Object.keys(c.subjects).forEach((k) => c.subjects[k] === id && (c.subjects[k] = null));
                if (c.teacherId === id) c.teacherId = null;
              });
            },
            { log: `Professor(a) ${U.shortName(t.name)} excluído(a)`, icon: 'trash', undo: true },
          );
          UI.undoToast(`${U.firstName(t.name)} foi excluído(a)`);
        }
      });
    },
  });
};
