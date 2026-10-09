'use strict';
/* Alunos e famílias — lista de alunos, ficha do aluno (anfitriã das abas dos outros módulos), responsáveis,
   pessoas autorizadas a buscar, saúde, acesso das famílias ao Portal, situação da matrícula, aniversariantes.
   Comandos: students.* e family.* (web/core/commands/alunos.js). A matrícula fica em matricula.js. */
(() => {
  const RELATIONS = (Core.students && Core.students.RELATIONS) || ['Mãe', 'Pai', 'Avó', 'Avô', 'Tia', 'Tio', 'Irmã(o)', 'Madrasta', 'Padrasto', 'Responsável legal', 'Outro'];
  const GENDERS = [['', 'Prefiro não informar'], ['F', 'Feminino'], ['M', 'Masculino']];
  const can = (p) => Store.can(p);
  /** Palavra no gênero do aluno: ga(s, 'matriculado') → matriculada | matriculado | matriculado(a). */
  const ga = (s, word) => (s && s.gender === 'F' ? word.replace(/o$/, 'a') : s && s.gender === 'M' ? word : `${word}(a)`);
  const tf = (b) => (b ? 'true' : 'false');
  const fullName = (v) => (v && v.trim().split(/\s+/).length < 2 ? 'Escreva o nome completo (nome e sobrenome).' : '');
  const birthCheck = (v) => (!v ? '' : v > U.today() ? 'A data de nascimento não pode estar no futuro.' : U.age(v) > 100 ? 'Confira o ano de nascimento.' : '');
  const hasPage = (id) => App.pages().some((p) => p.id === id);
  /** Gaveta alta: limita a altura à tela para o rodapé (Salvar) ficar sempre visível (ver alunos.css). */
  const fitDrawer = (api) => {
    if (api && api.wrap) api.wrap.classList.add('al-dw');
    return api;
  };
  /** UI.formDrawer com a correção de altura. */
  const drawer = (opts) => fitDrawer(UI.formDrawer(opts));
  const fresh = (id) => Q.student(id);

  // =====================================================================
  // Situação da matrícula
  // =====================================================================
  const STATUS = {
    ativo: { label: 'Ativo', many: 'Ativos', title: 'Ativa', tone: 'ok', pill: () => 'Matrícula ativa', effect: 'Participa da chamada, das notas, da agenda e das listas da turma.' },
    trancado: { label: 'Trancado', many: 'Trancados', title: 'Trancada', tone: 'warn', pill: () => 'Matrícula trancada', effect: 'Sai da chamada e das listas da turma, mas continua vinculado à escola. Pode ser reativada quando voltar.' },
    transferido: { label: 'Transferido', many: 'Transferidos', title: 'Transferido para outra escola', tone: '', pill: (s) => ga(s, 'Transferido'), effect: 'Saiu da escola. O cadastro e o histórico ficam guardados; deixa de aparecer nas turmas.' },
    concluido: { label: 'Concluído', many: 'Concluídos', title: 'Concluiu o curso', tone: 'info', pill: () => 'Curso concluído', effect: 'Terminou a última etapa oferecida pela escola. O histórico fica guardado.' },
  };
  const statusOf = (s) => STATUS[s.status] || STATUS.ativo;
  const statusPill = (s) => UI.pill(statusOf(s).pill(s), statusOf(s).tone);

  // =====================================================================
  // Portal da família
  // =====================================================================
  /** Convites gerados nesta sessão (userId → validade): o delta da conta nova não traz "convite pendente". */
  const invitedNow = new Map();
  const nowISO = () => new Date().toISOString();
  /** Situação de um responsável no Portal da família. */
  const portalOf = (g) => {
    if (g.bloqueado) return { key: 'bloqueado', label: 'Acesso bloqueado', short: 'Bloqueado', tone: 'bad' };
    if (!g.userId) return { key: 'sem', label: 'Sem acesso ao portal', short: 'Sem acesso', tone: '' };
    const u = Q.user(g.userId);
    if (!u) return { key: 'conectada', label: 'Tem acesso ao portal', short: 'Com acesso', tone: 'ok' };
    if (u.role !== 'responsavel') return { key: 'conectada', label: 'Entra com a conta da equipe', short: 'Conta da equipe', tone: 'ok' };
    if (u.status && u.status !== 'ativo') return { key: 'sem', label: 'Conta desativada', short: 'Desativada', tone: 'warn', expired: true };
    if (u.lastLoginAt || u.hasPassword) return { key: 'conectada', label: 'Conectada', short: 'Conectada', tone: 'ok', sub: u.lastLoginAt ? `último acesso ${U.ago(u.lastLoginAt)}` : '' };
    const pend = [u.invitePending, invitedNow.get(u.id)].filter(Boolean).sort().pop();
    if (pend && pend > nowISO()) return { key: 'pendente', label: 'Convite pendente', short: 'Convite pendente', tone: 'warn', sub: `código vale até ${U.fmtInstant(pend)}` };
    return { key: 'pendente', label: 'Código vencido', short: 'Código vencido', tone: 'warn', sub: 'ainda não entrou; gere um novo código', expired: true };
  };
  /** Situação do aluno no portal (a melhor entre os responsáveis). */
  const studentPortal = (s) => {
    if (s.noDigitalAccess) return { key: 'offline', short: 'Sem acesso digital', tone: '' };
    const list = (s.guardians || []).map(portalOf);
    const best = list.find((p) => p.key === 'conectada') || list.find((p) => p.key === 'pendente' && !p.expired) || list.find((p) => p.key === 'pendente');
    if (best) return { key: best.key, short: best.key === 'conectada' ? 'Conectada' : best.short, tone: best.tone };
    return { key: 'sem', short: 'Sem acesso', tone: '' };
  };
  const PORTAL_FILTERS = [['', 'Portal: todas'], ['conectada', 'Portal: conectadas'], ['pendente', 'Portal: convite pendente'], ['sem', 'Portal: sem acesso'], ['offline', 'Sem acesso digital']];

  // =====================================================================
  // Lista de alunos
  // =====================================================================
  const LS = () => PageState.get('alunos', { q: '', classId: '', status: 'ativo', portal: '', alerts: false, sort: 'name', desc: false, limit: 200 });
  const cols = () => ({ contatos: can('alunos.contatos'), portal: can('familias.acessos'), alertas: can('alunos.alertas') });

  const filtered = () => {
    const v = LS();
    let list = Q.students({ classId: v.classId || null, status: v.status, query: v.q.trim() });
    if (v.alerts && can('alunos.alertas')) list = list.filter((s) => s.alerts);
    if (v.portal && can('familias.acessos')) list = list.filter((s) => studentPortal(s).key === v.portal);
    if (v.sort === 'class') {
      const idx = new Map(Q.classes({ includeClosed: true }).map((c, i) => [c.id, i]));
      list = list.slice().sort((a, b) => (idx.has(a.classId) ? idx.get(a.classId) : 999) - (idx.has(b.classId) ? idx.get(b.classId) : 999) || Q.cmpName(a, b));
    }
    if (v.desc) list = list.slice().reverse();
    return list;
  };
  const filtersOn = () => {
    const v = LS();
    return !!(v.q.trim() || v.classId || v.status !== 'ativo' || v.portal || v.alerts);
  };

  const healthPill = (s) => html`<span class="pill bad plain al-hp" title="${s.alerts}" data-tip="${s.alerts}">${icon('heart')}Alerta de saúde</span>`;

  const rowHTML = (s, ctx) => {
    const c = ctx.classes.get(s.classId);
    const age = U.age(s.birth);
    const g = ctx.contatos ? Q.mainGuardian(s) : null;
    const p = ctx.portal ? studentPortal(s) : null;
    const flags = [
      ctx.alertas && s.alerts ? healthPill(s) : '',
      s.restrictions ? html`<span class="pill warn plain al-hp" title="${s.restrictions}" data-tip="${s.restrictions}">${icon('lock')}Restrição de retirada</span>` : '',
      !s.imageConsent ? html`<span class="pill plain al-hp" title="A família não autorizou o uso de imagem">${icon('eyeOff')}Sem uso de imagem</span>` : '',
      s.status !== 'ativo' ? statusPill(s) : '',
    ].filter(Boolean);
    return html`<tr class="clickable" data-al-go="${s.id}">
      <td class="first"><div class="person">${UI.avatar(s.name, '', s.photo)}<div>
        <a class="person-name" href="#alunos/${s.id}">${s.name}</a>
        <div class="person-sub">${age != null ? `${age} anos · ` : ''}Matrícula ${s.enrollment}</div>
        ${flags.length ? html`<div class="al-flags">${flags}</div>` : ''}
      </div></div></td>
      <td data-l="Turma">${c ? html`<span class="al-cls">${c.name}</span><span class="person-sub al-shift">${c.shift || ''}</span>` : html`<span class="muted">Sem turma</span>`}</td>
      ${ctx.contatos
        ? html`<td data-l="Responsável" class="al-td-g">${g
            ? html`<span class="al-gn">${g.name}</span><span class="person-sub">${g.relation}${g.phone ? ` · ${g.phone}` : ''}</span>`
            : html`<span class="muted">—</span>`}</td>`
        : ''}
      ${ctx.portal ? html`<td data-l="Portal" class="end">${UI.pill(p.short, p.tone)}</td>` : ''}
    </tr>`;
  };

  const sortBtn = (key, label) => {
    const v = LS();
    const on = v.sort === key;
    return html`<button type="button" class="al-sort ${on ? 'on' : ''}" data-al-sort="${key}">${label}${on ? icon('chevronDown', v.desc ? '' : 'al-up') : ''}</button>`;
  };

  const resultsHTML = () => {
    const v = LS();
    const rows = filtered();
    const ctx = { ...cols(), classes: new Map(Q.classes({ includeClosed: true }).map((c) => [c.id, c])) };
    const shown = rows.slice(0, v.limit);
    const count = html`<div class="al-count"><p class="result-count" aria-live="polite">${U.plural(rows.length, 'aluno encontrado', 'alunos encontrados')}${v.alerts ? ' com alerta de saúde' : ''}</p>
      ${filtersOn() ? html`<button type="button" class="link small" data-al-x="clear">Limpar filtros</button>` : ''}</div>`;
    if (!rows.length) {
      const none = !Store.state.students.length;
      return html`${count}<div class="card">${none
        ? emptyNoStudents()
        : UI.empty({ icon: 'search', title: 'Nenhum aluno encontrado', text: 'Confira a busca e os filtros. Se for um aluno novo, faça a matrícula.', action: html`<button type="button" class="btn" data-al-x="clear">Limpar filtros</button>${can('alunos.cadastrar') ? html`<button type="button" class="btn primary" data-al-x="new">${icon('userPlus')}Matricular aluno</button>` : ''}` })}</div>`;
    }
    const sortAttr = (k) => (v.sort === k ? raw(`aria-sort="${v.desc ? 'descending' : 'ascending'}"`) : '');
    return html`${count}<div class="card al-list">
      <table class="table responsive al-table">
        <thead><tr>
          <th ${sortAttr('name')}>${sortBtn('name', 'Aluno')}</th>
          <th class="al-th-class" ${sortAttr('class')}>${sortBtn('class', 'Turma')}</th>
          ${ctx.contatos ? html`<th class="al-th-g">Responsável principal</th>` : ''}
          ${ctx.portal ? html`<th class="al-th-p">Portal da família</th>` : ''}
        </tr></thead>
        <tbody>${shown.map((s) => rowHTML(s, ctx))}</tbody>
      </table>
      ${rows.length > shown.length ? html`<div class="al-more"><button type="button" class="btn" data-al-x="all">Mostrar todos os ${U.int(rows.length)} alunos</button></div>` : ''}
    </div>`;
  };

  const emptyNoStudents = () => {
    if (!Q.classes().length) {
      return UI.empty({
        icon: 'layers',
        title: Store.me.scope === 'todas' ? 'Nenhuma turma criada ainda' : 'Você ainda não tem turmas',
        text: Store.me.scope === 'todas' ? 'Todo aluno precisa de uma turma. Crie as turmas do ano e depois faça as matrículas.' : 'Peça à coordenação para vincular você às suas turmas. Os alunos aparecem aqui assim que isso for feito.',
        action: can('turmas.gerenciar') && hasPage('turmas') ? html`<a class="btn primary" href="#turmas">${icon('layers')}Ir para Turmas</a>` : '',
      });
    }
    return UI.empty({
      icon: 'users',
      title: 'Nenhum aluno matriculado ainda',
      text: can('alunos.cadastrar') ? 'Comece pela matrícula: leva cerca de um minuto por aluno.' : 'Assim que a secretaria fizer as matrículas, os alunos aparecem aqui.',
      action: can('alunos.cadastrar') ? html`<button type="button" class="btn primary" data-al-x="new">${icon('userPlus')}Matricular o primeiro aluno</button>` : '',
    });
  };

  const renderList = () => {
    const v = LS();
    const classes = Q.classes();
    if (v.classId && !classes.some((c) => c.id === v.classId)) v.classId = '';
    const scoped = Store.me.scope !== 'todas';
    const inClass = Store.state.students.filter((s) => !v.classId || s.classId === v.classId);
    const count = (st) => inClass.filter((s) => st === 'todos' || s.status === st).length;
    const active = Store.state.students.filter((s) => s.status === 'ativo').length;
    const c = cols();
    const lead = scoped
      ? `${U.plural(active, 'aluno ativo', 'alunos ativos')} nas suas turmas (${U.plural(classes.length, 'turma', 'turmas')}).`
      : `${U.plural(active, 'aluno ativo', 'alunos ativos')} em ${U.plural(classes.length, 'turma', 'turmas')}. Toque em um aluno para abrir a ficha.`;
    return html`
      <div class="page-head">
        <div><h1>Alunos</h1><p class="lead">${lead}</p></div>
        <div class="btn-row al-head-actions">
          ${c.portal && classes.length ? html`<button type="button" class="btn" data-al-x="invite">${icon('send')}<span>Convidar famílias</span></button>` : ''}
          ${Store.state.students.length ? html`<button type="button" class="btn" data-al-x="export" aria-haspopup="menu">${icon('download')}<span>Exportar</span></button>` : ''}
          ${can('alunos.cadastrar') ? html`<button type="button" class="btn primary" data-al-x="new">${icon('userPlus')}<span>Matricular aluno</span></button>` : ''}
        </div>
      </div>
      <div class="toolbar al-toolbar">
        <label class="search-box"><span class="sr-only">Buscar aluno</span>${icon('search')}<input class="input" id="al-q" type="search" placeholder="Nome, matrícula ou responsável" value="${v.q}" autocomplete="off"></label>
        <select class="input al-sel" id="al-class" aria-label="Filtrar por turma">
          <option value="">${scoped ? 'Todas as minhas turmas' : 'Todas as turmas'}</option>
          ${classes.map((k) => html`<option value="${k.id}" ${v.classId === k.id ? raw('selected') : ''}>${k.name}${k.shift ? ` · ${k.shift}` : ''}</option>`)}
        </select>
        <select class="input al-sel" id="al-status" aria-label="Situação da matrícula">
          ${['ativo', 'trancado', 'transferido', 'concluido', 'todos'].map((k) => html`<option value="${k}" ${v.status === k ? raw('selected') : ''}>${k === 'todos' ? 'Todas as situações' : STATUS[k].many} (${count(k)})</option>`)}
        </select>
        ${c.portal ? html`<select class="input al-sel" id="al-portal" aria-label="Situação no Portal da família">${PORTAL_FILTERS.map(([k, l]) => html`<option value="${k}" ${v.portal === k ? raw('selected') : ''}>${l}</option>`)}</select>` : ''}
        ${c.alertas ? html`<button type="button" class="chip al-chip" data-al-x="alerts" aria-pressed="${tf(v.alerts)}">${icon('heart')}Com alerta de saúde</button>` : ''}
      </div>
      <div data-al-results>${resultsHTML()}</div>`;
  };

  const exportTable = (list) => {
    const c = cols();
    const head = ['Matrícula', 'Nome', 'Nascimento', 'Idade', 'Sexo', 'Turma', 'Turno', 'Situação', 'Uso de imagem'];
    if (c.alertas) head.push('Alerta de saúde');
    if (c.contatos) head.push('Responsável 1', 'Parentesco 1', 'Celular 1', 'E-mail 1', 'Responsável 2', 'Parentesco 2', 'Celular 2', 'E-mail 2', 'Endereço');
    if (c.portal) head.push('Portal da família');
    const rows = list.map((s) => {
      const k = Q.klass(s.classId) || {};
      const r = [s.enrollment, s.name, U.fmtDate(s.birth), U.age(s.birth) ?? '', { F: 'Feminino', M: 'Masculino' }[s.gender] || '', k.name || '', k.shift || '', statusOf(s).label, s.imageConsent ? 'Autorizado' : 'Não autorizado'];
      if (c.alertas) r.push(s.alerts || '');
      if (c.contatos) {
        const gs = s.guardians || [];
        for (let i = 0; i < 2; i++) {
          const g = gs[i] || {};
          r.push(g.name || '', g.relation || '', g.phone || '', g.email || '');
        }
        r.push(s.address || '');
      }
      if (c.portal) r.push(studentPortal(s).short);
      return r;
    });
    return [head, ...rows];
  };

  const mountList = (el) => {
    const v = LS();
    const results = () => UI.$('[data-al-results]', el);
    const drawResults = () => UI.setHTML(results(), resultsHTML());
    /** Re-renderiza a tela e devolve o foco ao controle (sem perder o lugar para quem usa teclado). */
    const rerender = (focusSel) => {
      App.render();
      const f = focusSel && UI.$(focusSel, document.getElementById('main'));
      f && f.focus({ preventScroll: true });
    };
    const q = UI.$('#al-q', el);
    q.addEventListener('input', U.debounce(() => {
      v.q = q.value;
      v.limit = 200;
      drawResults();
    }, 120));
    UI.$('#al-class', el).addEventListener('change', (e) => {
      v.classId = e.target.value;
      v.limit = 200;
      rerender('#al-class');
    });
    UI.$('#al-status', el).addEventListener('change', (e) => {
      v.status = e.target.value;
      drawResults();
    });
    const portal = UI.$('#al-portal', el);
    portal &&
      portal.addEventListener('change', (e) => {
        v.portal = e.target.value;
        drawResults();
      });
    el.addEventListener('click', (e) => {
      const so = e.target.closest('[data-al-sort]');
      if (so) {
        const k = so.dataset.alSort;
        if (v.sort === k) v.desc = !v.desc;
        else Object.assign(v, { sort: k, desc: false });
        drawResults();
        const again = UI.$(`[data-al-sort="${k}"]`, el);
        again && again.focus();
        return;
      }
      const x = e.target.closest('[data-al-x]');
      if (x) {
        const a = x.dataset.alX;
        if (a === 'new') Actions.matricular && Actions.matricular({ classId: v.classId || null });
        else if (a === 'invite') Actions.convidarFamilias(v.classId);
        else if (a === 'all') {
          v.limit = Infinity;
          drawResults();
        } else if (a === 'alerts') {
          v.alerts = !v.alerts;
          x.setAttribute('aria-pressed', tf(v.alerts));
          drawResults();
        } else if (a === 'clear') {
          Object.assign(v, { q: '', classId: '', status: 'ativo', portal: '', alerts: false, limit: 200 });
          rerender('#al-q');
        } else if (a === 'export') {
          const table = exportTable(filtered());
          const items = [{ label: 'Copiar para planilha', icon: 'copy', hint: 'Cole no Excel ou no Google Planilhas', fn: () => UI.copy(U.toTSV(table), 'Tabela copiada. Cole na planilha.') }];
          items.unshift({ label: 'Baixar planilha (.csv)', icon: 'download', hint: `${U.plural(table.length - 1, 'aluno', 'alunos')} da lista filtrada`, fn: () => U.download(`alunos-${U.today()}.csv`, U.toCSV(table)) });
          UI.menu(x, items);
        }
        return;
      }
      const row = e.target.closest('tr[data-al-go]');
      if (row && !e.target.closest('a, button')) App.go('alunos/' + row.dataset.alGo);
    });
  };

  // =====================================================================
  // Ficha do aluno
  // =====================================================================
  const classLink = (c) => (c ? (hasPage('turmas') ? html`<a href="#turmas/${c.id}">${c.name}</a>` : html`${c.name}`) : html`<span class="muted">Sem turma</span>`);
  const birthdayToday = (s) => s.birth && s.birth.slice(5) === U.today().slice(5);

  const moreItems = (s) => {
    const items = [];
    if (can('alunos.cadastrar')) {
      items.push({ label: 'Situação da matrícula', icon: 'flag', hint: `Hoje: ${statusOf(s).title.toLowerCase()}`, fn: () => Actions.situacaoMatricula(s.id) });
      items.push({ label: 'Trocar de turma', icon: 'swap', fn: () => Actions.trocarTurma(s.id) });
      items.push({ label: s.photo ? 'Trocar foto' : 'Adicionar foto', icon: 'image', fn: () => pickPhoto(s.id) });
      if (s.photo) items.push({ label: 'Remover foto', icon: 'x', fn: () => removePhoto(s.id) });
    }
    if (can('alunos.excluir')) {
      if (items.length) items.push('-');
      items.push({ label: 'Excluir cadastro', icon: 'trash', danger: true, hint: 'Só para matrícula feita por engano', fn: () => Actions.excluirAluno(s.id) });
    }
    return items;
  };

  const headerActions = (s) => {
    const btns = [];
    if (typeof Actions.novaMensagem === 'function' && can('mensagens.responder')) btns.push(html`<button type="button" class="btn" data-al="msg">${icon('message')}<span>Mensagem à família</span></button>`);
    if (typeof Actions.novoItemAgenda === 'function' && Store.canAny('diario.publicar', 'diario.ocorrencias', 'diario.autorizacoes') && s.status === 'ativo') btns.push(html`<button type="button" class="btn" data-al="agenda" title="Escrever na agenda do aluno">${icon('bookOpen')}<span>Agenda</span></button>`);
    if (can('alunos.cadastrar')) btns.push(html`<button type="button" class="btn" data-al="edit">${icon('pencil')}<span>Editar</span></button>`);
    if (moreItems(s).length) btns.push(html`<button type="button" class="icon-btn al-more-btn" data-al="more" aria-label="Mais ações para ${s.name}" aria-haspopup="menu">${icon('dots')}</button>`);
    return btns.length ? html`<div class="btn-row al-actions">${btns}</div>` : '';
  };

  const photoHTML = (s) => {
    const av = UI.avatar(s.name, 'lg', s.photo);
    if (!can('alunos.cadastrar')) return html`<span class="al-photo-wrap">${av}</span>`;
    return html`<button type="button" class="al-photo" data-al="photo" aria-label="${s.photo ? 'Trocar ou remover a foto' : 'Adicionar foto'} de ${s.name}" aria-haspopup="${s.photo ? 'menu' : 'false'}">${av}<span class="al-photo-cam">${icon('image')}</span></button>`;
  };

  const tabBadge = (t, s) => {
    if (!t.badge) return '';
    try {
      const b = t.badge(s);
      const o = typeof b === 'number' ? { n: b } : b || {};
      return o.n ? html` <span class="badge ${o.tone || ''}" ${o.title ? raw(`title="${U.esc(o.title)}"`) : ''}>${o.n > 99 ? '99+' : o.n}</span>` : '';
    } catch (e) {
      return '';
    }
  };

  const renderProfile = (id, tabId) => {
    const s = Q.student(id);
    if (!s) {
      return html`<nav class="crumbs" aria-label="Caminho"><a href="#alunos">Alunos</a></nav>
        <div class="card">${UI.empty({ icon: 'user', title: 'Aluno não encontrado', text: 'O cadastro pode ter sido excluído, ou o aluno não está nas turmas que você acessa.', action: html`<a class="btn primary" href="#alunos">Ver a lista de alunos</a>` })}</div>`;
    }
    const c = Q.klass(s.classId);
    const tabs = App.studentTabs(s);
    const tab = tabs.find((t) => t.id === tabId) || tabs[0] || null;
    const age = U.age(s.birth);
    let body = '';
    if (tab) {
      try {
        body = tab.render(s);
      } catch (e) {
        console.error(e);
        body = UI.empty({ icon: 'alert', title: 'Não foi possível abrir esta parte da ficha', text: 'Tente outra aba ou volte mais tarde.' });
      }
    }
    const stripes = [];
    if (can('alunos.alertas') && s.alerts) stripes.push(html`<div class="al-alert" role="note">${icon('heart')}<div><b>Alerta de saúde</b><p class="al-pre">${s.alerts}</p></div></div>`);
    if (s.restrictions) stripes.push(html`<div class="al-alert warn" role="note">${icon('lock')}<div><b>Restrição de retirada</b><p class="al-pre">${s.restrictions}</p></div></div>`);
    if (s.status !== 'ativo')
      stripes.push(html`<div class="notice warn al-statusbar">${icon('info')}<span class="grow"><b>${statusOf(s).pill(s)}.</b> ${s.status === 'trancado' ? 'Não aparece na chamada nem nas listas da turma.' : 'Fica no histórico da escola e não aparece nas turmas.'}</span>${can('alunos.cadastrar') ? html`<button type="button" class="btn sm" data-al="status">Alterar situação</button>` : ''}</div>`);
    return html`
      <nav class="crumbs" aria-label="Caminho"><a href="#alunos">Alunos</a>${icon('chevronRight')}${c ? html`<span>${c.name}</span>${icon('chevronRight')}` : ''}<span aria-current="page">${U.shortName(s.name)}</span></nav>
      <section class="card al-head">
        <div class="profile-head">
          ${photoHTML(s)}
          <div class="grow">
            <h1>${s.name}</h1>
            <div class="meta-row">
              <span>${icon('layers')}${classLink(c)}${c && c.shift ? html`<span class="muted">· ${c.shift}</span>` : ''}</span>
              <span>Matrícula <b class="num">${s.enrollment}</b></span>
              ${age != null ? html`<span>${icon('cake')}${U.plural(age, 'ano', 'anos')}</span>` : ''}
              ${birthdayToday(s) ? UI.pill('Aniversário hoje', 'mark') : ''}
              ${statusPill(s)}
              ${s.noDigitalAccess ? UI.pill('Sem acesso digital', '') : ''}
              ${!s.imageConsent ? html`<span class="pill warn" title="A família não autorizou o uso de imagem do aluno">Sem autorização de imagem</span>` : ''}
            </div>
          </div>
          ${headerActions(s)}
        </div>
        ${stripes.length ? html`<div class="al-stripes">${stripes}</div>` : ''}
      </section>
      ${tabs.length > 1
        ? html`<div class="tabs al-tabs" role="tablist" aria-label="Partes da ficha">${tabs.map(
            (t) => html`<button type="button" role="tab" id="al-tab-${t.id}" data-al-tab="${t.id}" aria-controls="al-panel" aria-selected="${tf(t === tab)}" tabindex="${t === tab ? '0' : '-1'}">${t.label}${tabBadge(t, s)}</button>`,
          )}</div>`
        : ''}
      <div class="al-panel" id="al-panel" role="tabpanel" ${tab && tabs.length > 1 ? raw(`aria-labelledby="al-tab-${U.esc(tab.id)}"`) : ''}>${body}</div>`;
  };

  const switchTab = (sid, tab) => {
    const y = window.scrollY;
    history.replaceState(null, '', `#alunos/${sid}/${tab}`);
    App.render();
    window.scrollTo(0, y);
    const b = document.querySelector(`[data-al-tab="${CSS.escape(tab)}"]`);
    b && b.focus({ preventScroll: true });
  };

  const mountProfile = (el, id, tabId) => {
    const s = Q.student(id);
    if (!s) return;
    const tabs = App.studentTabs(s);
    const tab = tabs.find((t) => t.id === tabId) || tabs[0];
    const panel = UI.$('#al-panel', el);
    if (tab && tab.mount && panel) {
      try {
        tab.mount(panel, s);
      } catch (e) {
        console.error(e);
      }
    }
    const list = UI.$('.al-tabs', el);
    list &&
      list.addEventListener('keydown', (e) => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
        const btns = UI.$$('[data-al-tab]', list);
        const i = btns.indexOf(document.activeElement);
        if (i < 0) return;
        e.preventDefault();
        const j = e.key === 'Home' ? 0 : e.key === 'End' ? btns.length - 1 : (i + (e.key === 'ArrowRight' ? 1 : -1) + btns.length) % btns.length;
        switchTab(s.id, btns[j].dataset.alTab);
      });
    el.addEventListener('click', (e) => {
      const t = e.target.closest('[data-al-tab]');
      if (t) {
        if (t.getAttribute('aria-selected') !== 'true') switchTab(s.id, t.dataset.alTab);
        return;
      }
      const b = e.target.closest('[data-al]');
      if (!b) return;
      const cur = fresh(s.id) || s;
      const a = b.dataset.al;
      if (a === 'msg') Actions.novaMensagem && Actions.novaMensagem({ studentId: cur.id });
      else if (a === 'agenda') Actions.novoItemAgenda && Actions.novoItemAgenda({ studentId: cur.id, classId: cur.classId });
      else if (a === 'edit') Actions.editarAluno(cur.id);
      else if (a === 'status') Actions.situacaoMatricula(cur.id);
      else if (a === 'more') UI.menu(b, moreItems(cur));
      else if (a === 'photo') {
        if (!cur.photo) pickPhoto(cur.id);
        else UI.menu(b, [{ label: 'Trocar foto', icon: 'image', fn: () => pickPhoto(cur.id) }, { label: 'Remover foto', icon: 'x', fn: () => removePhoto(cur.id) }]);
      }
    });
  };

  // ---------- foto ----------
  const pickPhoto = async (id) => {
    const files = await UI.pickFiles({ accept: 'image/png,image/jpeg,image/webp', multiple: false });
    const f = files && files[0];
    if (!f) return;
    if (!/^image\/(png|jpeg|webp)$/.test(f.type)) {
      UI.toast('Escolha uma foto em PNG, JPEG ou WEBP.', { tone: 'bad' });
      return;
    }
    await UI.act('students.update', { id, patch: { photo: f.id } }, { ok: 'Foto atualizada' });
  };
  const removePhoto = (id) => UI.act('students.update', { id, patch: { photo: null } }, { ok: 'Foto removida' });

  // =====================================================================
  // Aba "Dados e família"
  // =====================================================================
  const contactHTML = (s, g) => {
    if (!can('alunos.contatos')) return UI.hidden(s, 'guardians.contatos') ? UI.noAccess('Contato restrito ao seu perfil') : html`<span class="muted small">Sem contato visível</span>`;
    if (!g.phone && !g.email) return html`<span class="small al-warn-text">${icon('alert')}Sem celular nem e-mail cadastrado</span>`;
    const school = Q.settings().schoolName || 'escola';
    const msg = `Olá, ${U.firstName(g.name)}! Aqui é da ${school}, sobre ${U.firstName(s.name)}.`;
    return html`${g.phone
      ? html`<div class="al-contact">${icon('phone')}<a class="num al-tel" href="tel:${U.digits(g.phone)}" title="Ligar">${g.phone}</a>
          <a class="al-wa" href="${U.whatsappLink(g.phone, msg)}" target="_blank" rel="noopener noreferrer" aria-label="Abrir conversa de WhatsApp com ${g.name}">WhatsApp</a></div>`
      : ''}
      ${g.email ? html`<div class="al-contact">${icon('mail')}<a href="mailto:${g.email}" class="al-mail" title="${g.email}">${g.email}</a><button type="button" class="copy-btn" data-ald="copy" data-v="${g.email}" aria-label="Copiar e-mail de ${g.name}">${icon('copy')}</button></div>` : ''}`;
  };

  /** Conta do portal do responsável, quando quem está usando pode "ver como" ela (Core.perms.canPreview). */
  const previewTarget = (g) => {
    if (!g.userId || g.bloqueado || Store.preview || !Store.me || !can('familias.acessos')) return null;
    const fu = Store.byId('users', g.userId);
    const meDoc = Store.byId('users', Store.me.id);
    if (!fu || !meDoc || fu.role !== 'responsavel' || (fu.status && fu.status !== 'ativo')) return null;
    return Core.perms.canPreview(meDoc, fu, Store.state) ? fu : null;
  };

  const guardianCard = (s, g) => {
    const p = portalOf(g);
    const viewAs = !s.noDigitalAccess && previewTarget(g);
    const manage = can('familias.acessos');
    const menuOn = can('alunos.cadastrar') || manage;
    const marks = [
      g.pedagogico ? UI.pill('Pedagógico', 'info', true) : '',
      g.financeiro ? UI.pill('Financeiro', '', true) : '',
      g.podeBuscar && !g.bloqueado ? UI.pill('Pode buscar', 'ok', true) : '',
      g.bloqueado ? UI.pill('Acesso bloqueado', 'bad', true) : '',
    ].filter(Boolean);
    const invitable = manage && !s.noDigitalAccess && !g.bloqueado && (p.key === 'sem' || p.expired);
    return html`<article class="al-gcard ${g.bloqueado ? 'blocked' : ''}">
      <div class="al-gtop">${UI.avatar(g.name, 'sm')}<div class="grow"><b class="al-gname">${g.name}</b><span class="person-sub">${g.relation || 'Responsável'}</span></div>
        ${menuOn ? html`<button type="button" class="icon-btn sm" data-ald="g-menu" data-g="${g.id}" aria-label="Ações para ${g.name}" aria-haspopup="menu">${icon('dots')}</button>` : ''}</div>
      <div class="al-gcontact">${contactHTML(s, g)}</div>
      ${marks.length ? html`<div class="al-marks">${marks}</div>` : ''}
      <div class="al-portal"><span class="al-dot ${p.tone}" aria-hidden="true"></span><span class="grow"><span class="muted">Portal:</span> <b>${p.label}</b>${p.sub ? html`<span class="person-sub">${p.sub}</span>` : ''}</span>
        ${invitable ? html`<button type="button" class="btn sm primary" data-ald="g-invite" data-g="${g.id}">${icon('send')}${p.expired ? 'Novo código' : 'Convidar'}</button>` : ''}
        ${viewAs && !invitable ? html`<button type="button" class="btn sm ghost" data-ald="g-preview" data-g="${g.id}" title="Mostra o portal como ${g.name} vê, só leitura">${icon('eye')}Ver como</button>` : ''}</div>
    </article>`;
  };

  const guardiansCard = (s) => {
    const gs = s.guardians || [];
    const sub = s.noDigitalAccess
      ? 'Família sem acesso digital: recados e avisos vão impressos.'
      : can('familias.acessos')
        ? 'Convide para o Portal da família quem acompanha a vida escolar.'
        : 'Quem responde pelo aluno na escola.';
    return html`<section class="card">
      <div class="card-head"><div><h2>Responsáveis</h2><p class="sub">${sub}</p></div>
        ${can('alunos.cadastrar') && gs.length < 6 ? html`<button type="button" class="btn sm" data-ald="g-add">${icon('plus')}Adicionar</button>` : ''}</div>
      <div class="card-body">${gs.length
        ? html`<div class="al-guardians">${gs.map((g) => guardianCard(s, g))}</div>`
        : UI.empty({ icon: 'users', title: 'Nenhum responsável', text: 'Cadastre quem responde pelo aluno.' })}</div>
    </section>`;
  };

  const pickupCard = (s) => {
    const gs = (s.guardians || []).filter((g) => g.podeBuscar && !g.bloqueado);
    const list = s.pickup || [];
    const edit = can('alunos.cadastrar');
    const contatos = can('alunos.contatos');
    return html`<section class="card">
      <div class="card-head"><div><h2>Quem pode buscar</h2><p class="sub">A portaria confere o documento na saída.</p></div>
        ${edit && list.length < 10 ? html`<button type="button" class="btn sm" data-ald="k-add">${icon('plus')}Adicionar</button>` : ''}</div>
      <div class="card-body al-pickup">
        ${s.restrictions ? html`<p class="al-restr">${icon('lock')}<span><b>Restrição de retirada:</b> ${s.restrictions}</span></p>` : ''}
        <div><h3 class="al-sub">Responsáveis</h3>
          ${gs.length ? html`<div class="al-who">${gs.map((g) => html`<span class="al-who-item">${UI.avatar(g.name, 'sm')}<span><b>${g.name}</b><span class="person-sub">${g.relation}</span></span></span>`)}</div>` : html`<p class="muted small">Nenhum responsável marcado como "pode buscar".</p>`}
        </div>
        <div><h3 class="al-sub">Outras pessoas autorizadas</h3>
          ${list.length
            ? html`<ul class="items al-kitems">${list.map(
                (p) => html`<li>${UI.avatar(p.name, 'sm')}<div class="grow"><b>${p.name}</b>${p.relation ? html` <span class="muted">· ${p.relation}</span>` : ''}
                  <div class="person-sub al-kdoc">${p.document ? html`<span>${p.document}</span>` : html`<span>Sem documento anotado</span>`}${contatos ? (p.phone ? html`<span class="num">${p.phone}</span>` : '') : html`<span>${UI.noAccess('Contato restrito')}</span>`}</div></div>
                  ${edit ? html`<button type="button" class="icon-btn sm" data-ald="k-edit" data-k="${p.id}" aria-label="Editar ${p.name}">${icon('pencil')}</button><button type="button" class="icon-btn sm" data-ald="k-remove" data-k="${p.id}" aria-label="Remover ${p.name} da lista">${icon('trash')}</button>` : ''}</li>`,
              )}</ul>`
            : html`<p class="muted small">Ninguém além dos responsáveis.</p>`}
        </div>
        ${edit && can('alunos.observacoes') ? html`<div><button type="button" class="btn sm ghost" data-ald="restr">${icon('lock')}${s.restrictions ? 'Editar restrição de retirada' : 'Registrar restrição de retirada'}</button></div>` : ''}
      </div>
    </section>`;
  };

  const personalCard = (s) => {
    const contatos = can('alunos.contatos');
    const age = U.age(s.birth);
    const fee = s.fee != null && Q.chargesFees() && can('financeiro.ver');
    const net = fee ? Q.netFee(s) : 0;
    return html`<section class="card">
      <div class="card-head"><h2>Dados pessoais</h2>${can('alunos.cadastrar') ? html`<button type="button" class="btn sm ghost" data-ald="edit">${icon('pencil')}Editar</button>` : ''}</div>
      <div class="card-body">${UI.kv([
        ['Nome completo', s.name],
        ['Nascimento', s.birth ? `${U.fmtDate(s.birth)}${age != null ? ` · ${U.plural(age, 'ano', 'anos')}` : ''}` : null],
        ['Sexo', { F: 'Feminino', M: 'Masculino' }[s.gender] || 'Não informado'],
        ['CPF', contatos ? s.cpf || null : UI.noAccess()],
        ['Endereço', contatos ? s.address || null : UI.noAccess()],
        ['Matrícula', html`<span class="num">${s.enrollment}</span>`],
        ['Na escola desde', s.joinedAt ? U.fmtDate(s.joinedAt) : null],
        ['Uso de imagem', s.imageConsent ? UI.pill('Autorizado', 'ok') : UI.pill('Não autorizado', 'warn')],
        ['Comunicação', s.noDigitalAccess ? 'Sem acesso digital: recados impressos' : 'Pelo Portal da família'],
        fee ? ['Mensalidade', html`${U.money(net)}${s.discount ? html` <span class="muted">(${U.num(s.discount, 0)}% de desconto sobre ${U.money(s.fee)})</span>` : ''}`] : null,
      ])}</div>
    </section>`;
  };

  const healthCard = (s) => {
    if (!can('alunos.alertas')) return '';
    const edit = can('alunos.cadastrar') && can('alunos.saude');
    return html`<section class="card">
      <div class="card-head"><h2>Saúde</h2>${edit ? html`<button type="button" class="btn sm ghost" data-ald="health">${icon('pencil')}Editar</button>` : ''}</div>
      <div class="card-body al-health">
        <div><h3 class="al-sub">Alertas de saúde</h3>${s.alerts ? html`<p class="al-pre al-alert-text">${s.alerts}</p>` : html`<p class="muted small">Nenhum alerta informado pela família.</p>`}</div>
        <div><h3 class="al-sub">Saúde detalhada</h3>${can('alunos.saude') ? (s.health ? html`<p class="al-pre">${s.health}</p>` : html`<p class="muted small">Nada registrado.</p>`) : UI.noAccess('Restrito a quem cuida da saúde dos alunos')}</div>
      </div>
    </section>`;
  };

  const notesCard = (s) => {
    if (!can('alunos.observacoes')) return '';
    return html`<section class="card">
      <div class="card-head"><div><h2>Observações internas</h2><p class="sub">${icon('eyeOff')} Nunca aparecem para a família.</p></div>${can('alunos.cadastrar') ? html`<button type="button" class="btn sm ghost" data-ald="notes">${icon('pencil')}Editar</button>` : ''}</div>
      <div class="card-body">${s.notes ? html`<p class="al-pre">${s.notes}</p>` : html`<p class="muted small">Nenhuma observação.</p>`}</div>
    </section>`;
  };

  const renderDados = (s) => html`<div class="al-cols">
    <div class="stack">${guardiansCard(s)}${pickupCard(s)}</div>
    <div class="stack">${personalCard(s)}${healthCard(s)}${notesCard(s)}</div>
  </div>`;

  const mountDados = (el, s0) => {
    el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-ald]');
      if (!b) return;
      const s = fresh(s0.id) || s0;
      const g = b.dataset.g ? (s.guardians || []).find((x) => x.id === b.dataset.g) : null;
      const p = b.dataset.k ? (s.pickup || []).find((x) => x.id === b.dataset.k) : null;
      switch (b.dataset.ald) {
        case 'g-add':
          return editGuardian(s.id, null);
        case 'g-menu':
          return g && guardianMenu(b, s, g);
        case 'g-invite':
          return g && Actions.convidarResponsavel(s.id, g.id, { btn: b });
        case 'g-preview': {
          const fu = g && previewTarget(g);
          return fu && App.previewAs(fu.id);
        }
        case 'k-add':
          return editPickup(s.id, null);
        case 'k-edit':
          return p && editPickup(s.id, p.id);
        case 'k-remove':
          return p && removePickup(s.id, p.id);
        case 'restr':
          return editRestrictions(s.id);
        case 'health':
          return editHealth(s.id);
        case 'notes':
          return editNotes(s.id);
        case 'edit':
          return Actions.editarAluno(s.id);
        case 'copy':
          return UI.copy(b.dataset.v, 'Copiado');
        default:
      }
    });
  };

  // ---------- responsáveis ----------
  const guardianMenu = (anchor, s, g) => {
    const items = [];
    const fu = !s.noDigitalAccess && previewTarget(g);
    if (fu) items.push({ label: 'Ver como esta família', icon: 'eye', hint: 'Mostra o portal como a família vê, só leitura', fn: () => App.previewAs(fu.id) }, '-');
    if (can('alunos.cadastrar')) items.push({ label: 'Editar dados', icon: 'pencil', fn: () => editGuardian(s.id, g.id) });
    if (can('familias.acessos')) {
      if (!g.bloqueado && !s.noDigitalAccess) items.push({ label: g.userId ? 'Gerar novo código de acesso' : 'Convidar para o portal', icon: 'send', hint: g.userId ? 'Para quem esqueceu a senha ou perdeu o código' : '', fn: () => Actions.convidarResponsavel(s.id, g.id) });
      items.push(g.bloqueado ? { label: 'Desbloquear acesso', icon: 'lock', fn: () => blockGuardian(s.id, g.id, false) } : { label: 'Bloquear acesso', icon: 'lock', hint: 'Sai do portal na hora', fn: () => blockGuardian(s.id, g.id, true) });
      if (g.userId) items.push({ label: 'Desvincular conta do portal', icon: 'userX', fn: () => unlinkGuardian(s.id, g.id) });
    }
    if (can('alunos.cadastrar')) {
      if (items.length) items.push('-');
      items.push({ label: 'Remover da ficha', icon: 'trash', danger: true, hint: (s.guardians || []).length <= 1 ? 'O aluno precisa de pelo menos um responsável' : '', fn: () => removeGuardian(s.id, g.id) });
    }
    UI.menu(anchor, items);
  };

  const guardianDefs = (isNew) => {
    const contatos = can('alunos.contatos') || isNew;
    return [
      { name: 'name', label: 'Nome completo', required: true, full: true, maxlength: 120, check: fullName },
      { name: 'relation', label: 'Parentesco', type: 'select', options: RELATIONS.map((r) => [r, r]) },
      contatos && { name: 'phone', label: 'Celular (WhatsApp)', type: 'tel', placeholder: '(11) 98765-4321', hint: 'Usado no convite para o portal.' },
      contatos && { name: 'email', label: 'E-mail', type: 'email', placeholder: 'nome@email.com', autocomplete: 'off' },
      contatos && { name: 'cpf', label: 'CPF', mask: 'cpf', hint: 'Opcional.' },
      html`<h3 class="form-h">O que esta pessoa pode fazer</h3>`,
      { name: 'pedagogico', type: 'checkbox', full: true, label: 'Responsável pedagógico', hint: 'Recebe a agenda, os recados e o boletim, e dá ciente.' },
      { name: 'financeiro', type: 'checkbox', full: true, label: 'Responsável financeiro', hint: 'Vê e responde pelas mensalidades.' },
      { name: 'podeBuscar', type: 'checkbox', full: true, label: 'Pode buscar o aluno na escola' },
    ].filter(Boolean);
  };

  const editGuardian = (sid, gid) => {
    const s = fresh(sid);
    if (!s || !can('alunos.cadastrar')) return;
    const g = gid ? (s.guardians || []).find((x) => x.id === gid) : null;
    const isNew = !g;
    const values = g ? { ...g, relation: RELATIONS.includes(g.relation) ? g.relation : 'Responsável legal' } : { relation: 'Mãe', pedagogico: true, financeiro: false, podeBuscar: true };
    const defs = guardianDefs(isNew);
    drawer({
      title: isNew ? 'Adicionar responsável' : 'Editar responsável',
      sub: html`Aluno: <b>${s.name}</b>`,
      defs,
      values,
      submitLabel: isNew ? 'Adicionar responsável' : 'Salvar alterações',
      top: !isNew && !can('alunos.contatos') ? html`<div class="notice" style="margin-bottom:16px">${icon('lock')}<span class="grow">Seu perfil não mostra os contatos. Celular, e-mail e CPF continuam como estão.</span></div>` : '',
      onSubmit: async (d, api, form) => {
        const guardian = { ...d };
        if (g) guardian.id = g.id;
        const res = await UI.act('students.guardian.save', { studentId: s.id, guardian }, { form });
        if (!res) return null;
        const newId = res.result && res.result.id;
        if (isNew && can('familias.acessos') && !s.noDigitalAccess && (d.phone || d.email) && d.pedagogico) {
          UI.toast(`${U.firstName(d.name)} foi incluído(a) na ficha.`, { action: { label: 'Convidar para o portal', fn: () => Actions.convidarResponsavel(s.id, newId) } });
        } else UI.toast(isNew ? 'Responsável incluído' : 'Responsável atualizado');
        return res;
      },
    });
  };

  const removeGuardian = async (sid, gid) => {
    const s = fresh(sid);
    const g = s && (s.guardians || []).find((x) => x.id === gid);
    if (!g) return;
    if ((s.guardians || []).length <= 1) {
      UI.toast('O aluno precisa ter pelo menos um responsável. Cadastre outro antes de remover.', { tone: 'bad' });
      return;
    }
    const ok = await UI.confirm({
      title: `Remover ${U.firstName(g.name)} da ficha?`,
      text: html`<b>${g.name}</b> deixa de ser responsável por ${s.name}${g.userId ? ' e sai do Portal da família deste aluno na hora' : ''}. Para voltar, será preciso cadastrar de novo.`,
      ok: 'Remover responsável',
      danger: true,
    });
    if (ok) UI.act('students.guardian.remove', { studentId: s.id, guardianId: g.id }, { ok: 'Responsável removido da ficha' });
  };

  const blockGuardian = async (sid, gid, blocked) => {
    const s = fresh(sid);
    const g = s && (s.guardians || []).find((x) => x.id === gid);
    if (!g) return;
    if (blocked) {
      const ok = await UI.confirm({
        title: `Bloquear o acesso de ${U.firstName(g.name)}?`,
        text: html`${g.name} sai do Portal da família na hora e deixa de ver ${s.name}. Também perde a autorização para buscar o aluno. Dá para desbloquear depois.`,
        ok: 'Bloquear acesso',
        danger: true,
      });
      if (!ok) return;
    }
    UI.act('family.block', { studentId: s.id, guardianId: g.id, blocked }, { ok: blocked ? `Acesso de ${U.firstName(g.name)} bloqueado` : `Acesso de ${U.firstName(g.name)} liberado. Marque de novo "pode buscar", se for o caso.` });
  };

  const unlinkGuardian = async (sid, gid) => {
    const s = fresh(sid);
    const g = s && (s.guardians || []).find((x) => x.id === gid);
    if (!g || !g.userId) return;
    const ok = await UI.confirm({
      title: 'Desvincular a conta do portal?',
      text: html`${g.name} deixa de ver ${s.name} no Portal da família (a conta continua valendo para outros filhos). O cadastro de responsável fica na ficha. Para voltar, convide de novo.`,
      ok: 'Desvincular',
      danger: true,
    });
    if (ok) UI.act('family.unlink', { studentId: s.id, guardianId: g.id }, { ok: 'Conta desvinculada deste aluno' });
  };

  /** Convida um responsável para o portal (ou gera um novo código) e mostra o código uma única vez. */
  Actions.convidarResponsavel = async (studentId, guardianId, opts = {}) => {
    const s = fresh(studentId);
    const g = s && (s.guardians || []).find((x) => x.id === guardianId);
    if (!g) {
      UI.toast('Responsável não encontrado.', { tone: 'bad' });
      return null;
    }
    if (!can('familias.acessos')) {
      UI.toast('Seu acesso não inclui convidar famílias. Fale com a secretaria.', { tone: 'bad' });
      return null;
    }
    if (g.bloqueado) {
      UI.toast(`${U.firstName(g.name)} está com o acesso bloqueado. Desbloqueie antes de convidar.`, { tone: 'bad' });
      return null;
    }
    if (!g.phone && !g.email) {
      UI.toast(`Cadastre o celular ou o e-mail de ${U.firstName(g.name)} antes de convidar.`, { tone: 'bad' });
      if (can('alunos.cadastrar')) editGuardian(s.id, g.id);
      return null;
    }
    if (g.userId && portalOf(g).key === 'conectada') {
      const ok = await UI.confirm({
        title: 'Gerar novo código de acesso?',
        text: `Use quando ${U.firstName(g.name)} esqueceu a senha ou não consegue entrar. Com o código, ${U.firstName(g.name)} cria uma nova senha. Códigos anteriores deixam de valer.`,
        ok: 'Gerar código',
      });
      if (!ok) return null;
    }
    const res = await UI.act('family.invite', { studentId: s.id, guardianId: g.id }, { btn: opts.btn });
    if (!res) return null;
    const ef = (res.effects || []).find((x) => x.type === 'invite');
    if (ef) {
      invitedNow.set(ef.userId, ef.expiresAt);
      Store.emit();
      UI.showInvite(ef, { name: g.name, phone: g.phone, email: g.email });
    } else if ((res.effects || []).some((x) => x.type === 'linked')) UI.toast(`${U.firstName(g.name)} já tinha uma conta no Portal da família (de outro filho): este aluno foi vinculado a ela. É só entrar com a senha de sempre.`, { ms: 7000 });
    else UI.toast(`${U.firstName(g.name)} já tem uma conta da equipe: o Portal da família foi vinculado a ela.`);
    return res;
  };

  // ---------- pessoas autorizadas a buscar ----------
  const editPickup = (sid, kid) => {
    const s = fresh(sid);
    if (!s || !can('alunos.cadastrar')) return;
    const p = kid ? (s.pickup || []).find((x) => x.id === kid) : null;
    const contatos = can('alunos.contatos') || !p;
    drawer({
      title: p ? 'Editar pessoa autorizada' : 'Autorizar pessoa a buscar',
      sub: html`Aluno: <b>${s.name}</b>`,
      top: html`<p class="muted small" style="margin-bottom:16px">Para quem não é responsável mas pode retirar o aluno (avó, vizinha, motorista da van). A portaria confere o documento na saída.</p>`,
      defs: [
        { name: 'name', label: 'Nome completo', required: true, full: true, maxlength: 120, check: fullName },
        { name: 'relation', label: 'Parentesco ou vínculo', placeholder: 'Ex.: Avó, motorista da van', maxlength: 40 },
        { name: 'document', label: 'Documento', placeholder: 'RG ou CPF', maxlength: 40 },
        contatos && { name: 'phone', label: 'Celular', type: 'tel', placeholder: '(11) 98765-4321' },
      ].filter(Boolean),
      values: p || {},
      submitLabel: p ? 'Salvar alterações' : 'Autorizar',
      onSubmit: (d, api, form) => UI.act('students.pickup.save', { studentId: s.id, person: { ...(p ? { id: p.id } : {}), ...d } }, { ok: p ? 'Dados atualizados' : `${U.firstName(d.name)} pode buscar ${U.firstName(s.name)}`, form }),
    });
  };
  const removePickup = async (sid, kid) => {
    const s = fresh(sid);
    const p = s && (s.pickup || []).find((x) => x.id === kid);
    if (!p) return;
    const ok = await UI.confirm({ title: `Tirar ${U.firstName(p.name)} da lista?`, text: html`<b>${p.name}</b> deixa de estar autorizado(a) a buscar ${s.name}. Avise a portaria.`, ok: 'Tirar da lista', danger: true });
    if (ok) UI.act('students.pickup.remove', { studentId: s.id, personId: p.id }, { ok: 'Autorização removida' });
  };

  // ---------- saúde, observações e restrição ----------
  const patchDrawer = (sid, { title, sub, defs, ok }) => {
    const s = fresh(sid);
    if (!s) return;
    drawer({
      title,
      sub: sub || html`Aluno: <b>${s.name}</b>`,
      defs,
      values: s,
      layout: 'section',
      onSubmit: (d, api, form) => {
        const patch = {};
        Object.keys(d).forEach((k) => {
          if ((d[k] || '') !== (s[k] || '')) patch[k] = d[k];
        });
        if (!Object.keys(patch).length) return true;
        return UI.act('students.update', { id: s.id, patch }, { ok, form });
      },
    });
  };
  const editHealth = (sid) =>
    patchDrawer(sid, {
      title: 'Saúde do aluno',
      ok: 'Informações de saúde atualizadas',
      defs: [
        { name: 'alerts', label: 'Alertas de saúde', type: 'textarea', rows: 4, maxlength: 1000, placeholder: 'Ex.: alergia a amendoim — sem amendoim no lanche. Em caso de reação, ligar para a mãe e levar ao pronto-socorro.', hint: 'Alergias, restrições alimentares e o que fazer numa emergência. Aparece em destaque para professores e auxiliares.' },
        { name: 'health', label: 'Saúde detalhada', type: 'textarea', rows: 4, maxlength: 2000, placeholder: 'Diagnósticos, laudos, medicação de uso contínuo.', hint: 'Só quem tem acesso à saúde detalhada vê.' },
      ],
    });
  const editNotes = (sid) =>
    patchDrawer(sid, {
      title: 'Observações internas',
      ok: 'Observações salvas',
      defs: [{ name: 'notes', label: 'Observações internas', type: 'textarea', rows: 7, maxlength: 3000, hint: 'Anotações da escola. Nunca aparecem para a família.' }],
    });
  const editRestrictions = (sid) =>
    patchDrawer(sid, {
      title: 'Restrição de retirada',
      ok: 'Restrição de retirada atualizada',
      defs: [{ name: 'restrictions', label: 'Quem NÃO pode retirar ou condições especiais', type: 'textarea', rows: 4, maxlength: 1000, placeholder: 'Ex.: somente a mãe e a avó materna podem retirar (decisão judicial arquivada na secretaria).', hint: 'Aparece em destaque para toda a equipe que vê o aluno. Não aparece para a família. Deixe em branco para retirar a restrição.' }],
    });

  // =====================================================================
  // Editar, situação, turma e exclusão
  // =====================================================================
  Actions.editarAluno = (id) => {
    const s = fresh(id);
    if (!s || !can('alunos.cadastrar')) return;
    const fees = can('financeiro.gerenciar') && Q.chargesFees() && s.fee !== undefined;
    const defs = [
      { name: 'name', label: 'Nome completo', required: true, full: true, maxlength: 120, check: fullName },
      { name: 'birth', label: 'Data de nascimento', type: 'date', required: true, max: U.today(), check: birthCheck },
      { name: 'gender', label: 'Sexo', type: 'select', options: GENDERS },
      can('alunos.contatos') && { name: 'cpf', label: 'CPF do aluno', mask: 'cpf', hint: 'Opcional.' },
      can('alunos.contatos') && { name: 'address', label: 'Endereço', full: true, maxlength: 200, placeholder: 'Rua, número — bairro, cidade' },
      html`<h3 class="form-h">Autorizações</h3>`,
      { name: 'imageConsent', type: 'checkbox', full: true, label: 'A família autoriza o uso de imagem', hint: 'Fotos e vídeos em atividades, murais e redes da escola.' },
      { name: 'noDigitalAccess', type: 'checkbox', full: true, label: 'Família sem acesso digital', hint: 'Recados e avisos vão impressos; a família não recebe convite para o portal.' },
      can('alunos.saude') && html`<h3 class="form-h">Saúde</h3>`,
      can('alunos.saude') && { name: 'alerts', label: 'Alertas de saúde', type: 'textarea', rows: 3, full: true, maxlength: 1000, hint: 'Alergias e o que fazer numa emergência. Aparece em destaque para quem dá aula.' },
      can('alunos.saude') && { name: 'health', label: 'Saúde detalhada', type: 'textarea', rows: 3, full: true, maxlength: 2000, hint: 'Diagnósticos, laudos e medicação de uso contínuo.' },
      can('alunos.observacoes') && html`<h3 class="form-h">Uso interno</h3>`,
      can('alunos.observacoes') && { name: 'restrictions', label: 'Restrição de retirada', type: 'textarea', rows: 2, full: true, maxlength: 1000, hint: 'Ex.: decisão judicial. Aparece em destaque para a equipe.' },
      can('alunos.observacoes') && { name: 'notes', label: 'Observações internas', type: 'textarea', rows: 3, full: true, maxlength: 3000, hint: 'Nunca aparecem para a família.' },
      fees && html`<h3 class="form-h">Mensalidade</h3>`,
      fees && { name: 'fee', label: 'Mensalidade cheia', type: 'money', min: 0, max: 100000 },
      fees && { name: 'discount', label: 'Desconto (%)', type: 'number', min: 0, max: 100, step: '0.5', hint: 'Vale para as próximas cobranças geradas.' },
    ].filter(Boolean);
    drawer({
      title: 'Editar cadastro',
      sub: html`${s.name} · matrícula ${s.enrollment}`,
      defs,
      values: s,
      submitLabel: 'Salvar alterações',
      onSubmit: async (d, api, form) => {
        const patch = {};
        defs.filter((x) => x && x.name).forEach((def) => {
          const k = def.name;
          const nv = d[k];
          const ov = s[k];
          if (def.type === 'checkbox') {
            if (!!nv !== !!ov) patch[k] = !!nv;
          } else if (def.type === 'money' || def.type === 'number') {
            const n = nv == null || isNaN(nv) ? 0 : nv;
            if (Number(ov || 0) !== n) patch[k] = n;
          } else if (k === 'cpf') {
            if (U.digits(nv) !== U.digits(ov)) patch[k] = nv;
          } else if ((nv || '') !== (ov || '')) patch[k] = nv;
        });
        if (!Object.keys(patch).length) {
          UI.toast('Nada foi alterado.');
          return true;
        }
        return UI.act('students.update', { id: s.id, patch }, { ok: 'Cadastro atualizado', form });
      },
    });
  };

  Actions.situacaoMatricula = (id) => {
    const s = fresh(id);
    if (!s || !can('alunos.cadastrar')) return;
    const OK = { ativo: 'reativada', trancado: 'trancada', transferido: 'transferência registrada', concluido: 'conclusão registrada' };
    UI.modal({
      title: 'Situação da matrícula',
      sub: html`${s.name} · hoje: <b>${statusOf(s).title.toLowerCase()}</b>`,
      body: html`<div class="al-status-grid" role="radiogroup" aria-label="Situação da matrícula">${Object.entries(STATUS).map(
        ([k, v]) => html`<label class="pick"><input type="radio" name="al-st" value="${k}" ${k === s.status ? raw('checked') : ''}><strong>${k === 'transferido' ? ga(s, 'Transferido') + ' para outra escola' : v.title}${k === s.status ? html` <span class="pill plain">atual</span>` : ''}</strong><span>${v.effect}</span></label>`,
      )}</div>
      <p class="small muted al-st-hint" data-hint hidden>${icon('info')} O acesso dos responsáveis ao Portal da família continua. Se a família não deve mais acompanhar, bloqueie o acesso na ficha.</p>`,
      foot: html`<button type="button" class="btn" data-close>Cancelar</button><button type="button" class="btn primary" data-ok>Salvar situação</button>`,
      onMount(el, api) {
        const hint = UI.$('[data-hint]', el);
        const sync = () => {
          const v = (UI.$('input[name="al-st"]:checked', el) || {}).value;
          hint.hidden = !(v === 'transferido' || v === 'concluido') || v === s.status;
        };
        el.addEventListener('change', sync);
        UI.$('[data-ok]', el).addEventListener('click', async (e) => {
          const v = (UI.$('input[name="al-st"]:checked', el) || {}).value;
          if (!v || v === s.status) return api.close();
          const res = await UI.act('students.status', { id: s.id, status: v }, { btn: e.currentTarget, ok: `Matrícula de ${U.firstName(s.name)}: ${OK[v]}` });
          if (res) api.close();
        });
      },
    });
  };

  Actions.trocarTurma = (id) => {
    const s = fresh(id);
    if (!s || !can('alunos.cadastrar')) return;
    const classes = Q.classes();
    if (classes.length < 2 && classes.some((c) => c.id === s.classId)) {
      UI.toast('Não há outra turma disponível para a troca.', { tone: 'bad' });
      return;
    }
    UI.modal({
      title: 'Trocar de turma',
      sub: html`${s.name} está no <b>${(Q.klass(s.classId) || {}).name || 'grupo sem turma'}</b>.`,
      body: html`<div class="pick-grid al-picks" role="radiogroup" aria-label="Nova turma">${classes.map((c) => {
        const n = Q.roster(c.id).length;
        const cap = Number(c.capacity) || 0;
        const cur = c.id === s.classId;
        return html`<label class="pick ${cur ? 'al-pick-cur' : ''}"><input type="radio" name="al-cls" value="${c.id}" ${cur ? raw('disabled') : ''}><strong>${c.name}</strong><span>${c.shift || ''}${c.segment ? ` · ${c.segment}` : ''}</span>
          <span class="${cap && n >= cap ? 'al-full' : ''}">${cur ? 'Turma atual' : cap ? (n >= cap ? `Turma cheia (${n}/${cap})` : `${U.plural(cap - n, 'vaga', 'vagas')} (${n}/${cap})`) : U.plural(n, 'aluno', 'alunos')}</span></label>`;
      })}</div>
      <p class="small muted" style="margin-top:14px">As notas e a frequência já registradas ficam guardadas. Daqui em diante, ${U.firstName(s.name)} aparece na chamada, nas notas e na agenda da nova turma.</p>`,
      foot: html`<button type="button" class="btn" data-close>Cancelar</button><button type="button" class="btn primary" data-ok disabled>Trocar de turma</button>`,
      onMount(el, api) {
        const ok = UI.$('[data-ok]', el);
        el.addEventListener('change', () => (ok.disabled = !UI.$('input[name="al-cls"]:checked', el)));
        ok.addEventListener('click', async () => {
          const to = (UI.$('input[name="al-cls"]:checked', el) || {}).value;
          if (!to) return;
          const res = await UI.act('students.update', { id: s.id, patch: { classId: to } }, { btn: ok, ok: `${U.firstName(s.name)} agora está no ${(Q.klass(to) || {}).name}` });
          if (res) api.close();
        });
      },
    });
  };

  /** O que impede a exclusão (mesma regra do servidor, com o que está no retrato). */
  const historyOf = (s) => {
    const st = Store.state;
    const pre = `|${s.id}|`;
    const out = [];
    if (Object.keys(st.grades || {}).some((k) => k.includes(pre))) out.push('notas');
    if (Object.values(st.attendance || {}).some((a) => a.marks && s.id in a.marks)) out.push('chamadas');
    if ((st.invoices || []).some((i) => i.studentId === s.id)) out.push('cobranças');
    if ((st.support || []).some((r) => r.studentId === s.id)) out.push('atendimentos');
    if ((st.messages || []).some((m) => m.studentId === s.id)) out.push('mensagens');
    if ((st.diary || []).some((d) => d.studentId && (d.recipients || []).includes(s.id))) out.push('registros na agenda');
    return out;
  };

  Actions.excluirAluno = async (id) => {
    const s = fresh(id);
    if (!s || !can('alunos.excluir')) return;
    const found = historyOf(s);
    if (found.length) {
      const list = found.length > 1 ? `${found.slice(0, -1).join(', ')} e ${found[found.length - 1]}` : found[0];
      const go = await UI.confirm({
        title: 'Este cadastro não pode ser excluído',
        text: html`<b>${s.name}</b> já tem ${list}. Para guardar o histórico, registre a saída em <b>Situação da matrícula</b> (transferido ou trancado).${found.includes('cobranças') ? ' Se a matrícula foi feita por engano, cancele antes as cobranças no Financeiro.' : ''}`,
        ok: can('alunos.cadastrar') ? 'Abrir situação da matrícula' : 'Entendi',
        cancel: 'Fechar',
      });
      if (go && can('alunos.cadastrar')) Actions.situacaoMatricula(s.id);
      return;
    }
    const ok = await UI.confirm({
      title: 'Excluir este cadastro?',
      text: html`Isto apaga o cadastro de <b>${s.name}</b> e <b>não pode ser desfeito</b>. Use só para matrícula feita por engano. Se o aluno saiu da escola, registre a transferência em <b>Situação da matrícula</b>: o histórico fica guardado.`,
      ok: 'Excluir cadastro',
      danger: true,
      requireText: 'EXCLUIR',
    });
    if (!ok) return;
    const res = await UI.act('students.delete', { id: s.id }, { ok: `Cadastro de ${U.firstName(s.name)} excluído` });
    if (res) App.go('alunos');
  };

  Actions.verAluno = (id, tab) => App.go(`alunos/${id}${tab ? '/' + tab : ''}`);

  // =====================================================================
  // Convites em lote (turma) — cartões imprimíveis
  // =====================================================================
  const invitePreview = (classId) => {
    const out = { invite: [], connected: 0, pending: 0, missing: [], blocked: 0, offline: 0, students: 0 };
    for (const s of Q.students({ classId })) {
      out.students++;
      if (s.noDigitalAccess) {
        out.offline++;
        continue;
      }
      for (const g of s.guardians || []) {
        if (!g.pedagogico) continue;
        if (g.bloqueado) out.blocked++;
        else if (g.userId) portalOf(g).key === 'conectada' ? out.connected++ : out.pending++;
        else if (!g.phone && !g.email) out.missing.push({ s, g });
        else out.invite.push({ s, g });
      }
    }
    return out;
  };

  Actions.convidarFamilias = (classId = '') => {
    if (!can('familias.acessos')) return;
    const classes = Q.classes();
    if (!classes.length) {
      UI.toast('Nenhuma turma disponível.', { tone: 'bad' });
      return;
    }
    let cid = classId && classes.some((c) => c.id === classId) ? classId : classes[0].id;
    const summary = () => {
      const p = invitePreview(cid);
      const people = new Set(p.invite.map((x) => U.digits(x.g.phone) || x.g.email)).size;
      return html`
        <div class="al-inv-stats">
          <div class="al-inv-stat ok"><b>${people}</b><span>${people === 1 ? 'responsável vai receber o código agora' : 'responsáveis vão receber o código agora'}</span></div>
          <div class="al-inv-stat"><b>${p.connected}</b><span>já usam o portal</span></div>
          <div class="al-inv-stat"><b>${p.pending}</b><span>com convite enviado antes</span></div>
        </div>
        ${p.invite.length ? html`<details class="al-inv-list"><summary>Ver quem vai receber</summary><ul class="items small">${p.invite.map(({ s, g }) => html`<li><span class="grow"><b>${g.name}</b> <span class="muted">· ${g.relation} de ${s.name}</span></span><span class="muted nowrap">${g.phone || g.email}</span></li>`)}</ul></details>` : ''}
        ${p.pending ? html`<p class="small muted">${icon('info')} Quem já recebeu convite não ganha outro código aqui. Se o código venceu, gere um novo na ficha do aluno.</p>` : ''}
        ${p.missing.length ? html`<div class="notice warn">${icon('alert')}<span class="grow"><b>${U.plural(p.missing.length, 'responsável sem', 'responsáveis sem')} celular nem e-mail:</b> ${html.join(p.missing.map(({ s, g }) => html`<a href="#alunos/${s.id}" data-close>${g.name}</a>`), ', ')}. Complete o cadastro para convidar.</span></div>` : ''}
        ${p.offline ? html`<p class="small muted">${U.plural(p.offline, 'família está marcada', 'famílias estão marcadas')} como sem acesso digital e não ${p.offline === 1 ? 'recebe' : 'recebem'} convite.</p>` : ''}
        ${!p.students ? html`<p class="muted">Esta turma ainda não tem alunos ativos.</p>` : ''}`;
    };
    UI.modal({
      title: 'Convidar famílias para o portal',
      sub: 'Gera um código de primeiro acesso para cada responsável pedagógico que ainda não tem conta. Os códigos aparecem uma única vez: imprima ou copie.',
      body: html`<div class="field"><label for="al-inv-class">Turma</label><select id="al-inv-class" class="input" data-nodirty>${classes.map((c) => html`<option value="${c.id}" ${c.id === cid ? raw('selected') : ''}>${c.name}${c.shift ? ` · ${c.shift}` : ''}</option>`)}</select></div>
        <div class="al-inv-sum" data-sum>${summary()}</div>`,
      foot: html`<button type="button" class="btn" data-close>Cancelar</button><button type="button" class="btn primary" data-go>${icon('send')}<span>Gerar códigos</span></button>`,
      guard: false,
      onMount(el, api) {
        const go = UI.$('[data-go]', el);
        const sync = () => {
          UI.setHTML(UI.$('[data-sum]', el), summary());
          go.disabled = !invitePreview(cid).invite.length;
        };
        sync();
        UI.$('#al-inv-class', el).addEventListener('change', (e) => {
          cid = e.target.value;
          sync();
        });
        go.addEventListener('click', async () => {
          const res = await UI.act('family.invites', { classId: cid }, { btn: go });
          if (!res) return;
          api.close();
          const effects = (res.effects || []).filter((x) => x.type === 'invite');
          const linked = (res.effects || []).filter((x) => x.type === 'linked').length;
          if (!effects.length) {
            UI.toast(linked ? `${U.plural(linked, 'responsável já tinha conta e foi vinculado', 'responsáveis já tinham conta e foram vinculados')} (entram com a senha de sempre). Nenhum código novo.` : 'Nenhum convite novo: todos os responsáveis desta turma já foram convidados ou faltam contatos.', { ms: 7000 });
            return;
          }
          showInviteSheet(effects, Q.klass(cid));
        });
      },
    });
  };

  /** Agrupa os códigos devolvidos (o último código de cada conta é o que vale). */
  const inviteEntries = (effects, klass) => {
    const byUser = new Map();
    for (const ef of effects) byUser.set(ef.userId, ef);
    const students = Q.students({ classId: klass ? klass.id : null, status: 'todos' });
    const entries = [];
    for (const ef of byUser.values()) {
      invitedNow.set(ef.userId, ef.expiresAt);
      const kids = [];
      let g = null;
      for (const s of students) {
        const gg = (s.guardians || []).find((x) => x.userId === ef.userId);
        if (gg) {
          kids.push(s);
          g = g || gg;
        }
      }
      const u = Q.user(ef.userId);
      entries.push({ ef, name: (g && g.name) || (u && u.name) || 'Responsável', phone: (g && g.phone) || '', email: (g && g.email) || '', kids });
    }
    return entries.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  };
  const accessLink = (ef) => (ef.link && /^https?:/.test(ef.link) ? ef.link : `${location.origin}${location.pathname}#acesso/${ef.code}`);
  const inviteMessage = (e) => {
    const school = Q.settings().schoolName || 'a escola';
    return `Olá, ${U.firstName(e.name)}! Seu acesso ao Portal da família da ${school} está pronto. Abra ${accessLink(e.ef)} e digite o código ${e.ef.code} para criar a sua senha. O código vale até ${U.fmtInstant(e.ef.expiresAt)} e só pode ser usado uma vez.`;
  };

  const showInviteSheet = (effects, klass) => {
    Store.emit();
    const entries = inviteEntries(effects, klass);
    const school = Q.settings().schoolName || '';
    const until = entries.length ? U.fmtInstant(entries[0].ef.expiresAt) : '';
    const card = (e, print) => html`<article class="al-icard">
      <div class="al-icard-top"><div><b class="al-icard-name">${e.name}</b><span class="person-sub">Responsável de ${html.join(e.kids.map((k) => k.name), ', ') || '—'}${klass ? ` · ${klass.name}` : ''}</span></div></div>
      <div class="al-icode" aria-label="Código de acesso">${e.ef.code}</div>
      <p class="al-ihow">Abra <b class="al-ilink">${accessLink(e.ef)}</b>, digite o código e crie a sua senha. Vale até ${U.fmtInstant(e.ef.expiresAt)} · uso único.</p>
      ${print
        ? ''
        : html`<div class="btn-row al-iacts">
          <button type="button" class="btn sm" data-copy-one="${e.ef.userId}">${icon('copy')}Copiar</button>
          ${e.phone ? html`<a class="btn sm" href="${U.whatsappLink(e.phone, inviteMessage(e))}" target="_blank" rel="noopener noreferrer">${icon('phone')}WhatsApp</a>` : ''}
          ${e.email ? html`<a class="btn sm" href="mailto:${e.email}?subject=${encodeURIComponent('Acesso ao Portal da família')}&body=${encodeURIComponent(inviteMessage(e))}">${icon('mail')}E-mail</a>` : ''}
        </div>`}
    </article>`;
    const sheet = html`<div class="al-sheet">
      <header class="al-sheet-head"><div><b>${school}</b><h1>Portal da família: código de primeiro acesso</h1><p>${klass ? klass.name + ' · ' : ''}gerado em ${U.fmtDate(U.today())}${Q.settings().phone ? ` · dúvidas: secretaria, ${Q.settings().phone}` : ''}</p></div></header>
      <div class="al-icards">${entries.map((e) => card(e, true))}</div>
    </div>`;
    const allText = [
      `Convites para o Portal da família${klass ? ` — ${klass.name}` : ''}${school ? ` (${school})` : ''}`,
      'Como entrar: abra o link, digite o código e crie a sua senha. Cada código só pode ser usado uma vez.',
      '',
      ...entries.map((e) => `${e.name} — responsável de ${e.kids.map((k) => k.name).join(', ')}\nCódigo: ${e.ef.code} (vale até ${U.fmtInstant(e.ef.expiresAt)})\nLink: ${accessLink(e.ef)}\n`),
    ].join('\n');
    UI.modal({
      title: `${U.plural(entries.length, 'código gerado', 'códigos gerados')}`,
      sub: html`${klass ? html`<b>${klass.name}</b> · ` : ''}Os códigos aparecem só agora (válidos até ${until}). Imprima para entregar na reunião ou na saída, ou envie por WhatsApp.`,
      size: 'lg',
      guard: false,
      body: html`<div class="al-icards">${entries.map((e) => card(e, false))}</div>`,
      foot: html`<button type="button" class="btn left" data-copy-all>${icon('copy')}Copiar tudo</button><button type="button" class="btn" data-print>${icon('printer')}Imprimir cartões</button><button type="button" class="btn primary" data-close>Pronto</button>`,
      onMount(el) {
        UI.$('[data-copy-all]', el).addEventListener('click', () => UI.copy(allText, 'Todos os códigos copiados'));
        UI.$('[data-print]', el).addEventListener('click', () => printSheet(sheet));
        el.addEventListener('click', (ev) => {
          const b = ev.target.closest('[data-copy-one]');
          if (!b) return;
          const e = entries.find((x) => x.ef.userId === b.dataset.copyOne);
          e && UI.copy(inviteMessage(e), 'Mensagem copiada');
        });
      },
    });
  };

  /** Imprime só a folha de cartões (o resto da tela fica escondido na impressão). */
  const printSheet = (content) => {
    if (!U.canPrint()) return;
    document.querySelectorAll('.al-print-host').forEach((n) => n.remove());
    const host = document.createElement('div');
    host.className = 'al-print-host';
    UI.setHTML(host, content);
    document.body.appendChild(host);
    document.body.classList.add('al-printing');
    const done = () => {
      document.body.classList.remove('al-printing');
      host.remove();
      window.removeEventListener('afterprint', done);
    };
    window.addEventListener('afterprint', done);
    try {
      window.print();
    } catch (e) {
      done();
    }
  };

  // =====================================================================
  // Aba "Histórico"
  // =====================================================================
  const RESULT = { aprovado: ['Aprovado', 'ok'], retido: ['Retido', 'bad'], recuperacao: ['Em recuperação', 'warn'], transferido: ['Transferido', ''], concluido: ['Concluiu', 'info'] };
  const renderHistory = (s) => {
    const c = Q.klass(s.classId);
    const hist = (s.history || []).slice().sort((a, b) => String(b.year).localeCompare(String(a.year)));
    const resultPill = (r) => {
      const [l, t] = RESULT[r] || [r ? U.cap(String(r)) : '—', ''];
      return r ? UI.pill(r === 'aprovado' || r === 'retido' || r === 'transferido' ? ga(s, l) : l, t) : html`<span class="muted">—</span>`;
    };
    return html`<div class="al-cols al-cols-hist">
      <section class="card">
        <div class="card-head"><div><h2>Vida escolar</h2><p class="sub">Um ano por linha, do mais recente ao mais antigo.</p></div></div>
        <div class="card-body al-flush">
          <table class="table responsive">
            <thead><tr><th>Ano</th><th>Turma</th><th>Resultado</th><th class="num">Média</th><th class="num">Frequência</th></tr></thead>
            <tbody>
              <tr><td class="first"><b class="num">${Q.year()}</b> <span class="muted small">(atual)</span></td><td data-l="Turma">${c ? c.name : html`<span class="muted">Sem turma</span>`}</td><td data-l="Resultado">${s.status === 'ativo' ? UI.pill('Em andamento', 'info') : statusPill(s)}</td><td class="num muted" data-l="Média">—</td><td class="num muted" data-l="Frequência">—</td></tr>
              ${hist.map((h) => html`<tr><td class="first"><b class="num">${h.year}</b></td><td data-l="Turma">${h.className || (Q.klass(h.classId) || {}).name || '—'}</td><td data-l="Resultado">${resultPill(h.result)}</td><td class="num" data-l="Média">${h.avg == null ? '—' : U.num(h.avg)}</td><td class="num" data-l="Frequência">${h.attendance == null ? '—' : U.pct(h.attendance)}</td></tr>`)}
            </tbody>
          </table>
          ${hist.length ? '' : html`<p class="small muted al-hist-empty">${icon('history')} Ainda não há anos anteriores nesta escola. O histórico é gravado na virada do ano letivo.</p>`}
        </div>
      </section>
      <section class="card">
        <div class="card-head"><h2>Na escola</h2></div>
        <div class="card-body">${UI.kv([
          ['Entrada', s.joinedAt ? `${U.fmtDate(s.joinedAt)} (${U.fmtDateLong(s.joinedAt, false)} de ${s.joinedAt.slice(0, 4)})` : null],
          ['Tempo na escola', s.joinedAt ? tenure(s.joinedAt) : null],
          ['Matrícula', html`<span class="num">${s.enrollment}</span>`],
          ['Situação', statusPill(s)],
        ])}</div>
      </section>
    </div>`;
  };
  const tenure = (from) => {
    const days = U.daysBetween(from, U.today());
    if (days < 0) return 'começa em ' + U.fmtDate(from);
    const months = Math.floor(days / 30.44);
    if (months < 1) return U.plural(days, 'dia', 'dias');
    if (months < 12) return U.plural(months, 'mês', 'meses');
    const y = Math.floor(months / 12);
    const m = months % 12;
    return U.plural(y, 'ano', 'anos') + (m ? ` e ${U.plural(m, 'mês', 'meses')}` : '');
  };

  // =====================================================================
  // Painel: aniversariantes e alertas de saúde
  // =====================================================================
  const birthdaysAhead = (days = 7) => {
    const today = U.today();
    const y = Number(today.slice(0, 4));
    const out = [];
    for (const s of Q.students()) {
      if (!s.birth || !U.isValidDate(s.birth)) continue;
      const md = s.birth.slice(5);
      for (const yy of [y, y + 1]) {
        let d = `${yy}-${md}`;
        if (!U.isValidDate(d)) d = `${yy}-02-28`; // nascido em 29/02, em ano não bissexto
        const diff = U.daysBetween(today, d);
        if (diff >= 0) {
          if (diff < days) out.push({ s, date: d, diff, turning: yy - Number(s.birth.slice(0, 4)) });
          break;
        }
      }
    }
    return out.sort((a, b) => a.diff - b.diff || Q.cmpName(a.s, b.s));
  };

  App.widget({
    id: 'aniversariantes',
    order: 70,
    size: 'third',
    perm: 'alunos.ver',
    render() {
      const list = birthdaysAhead(7);
      const shown = list.slice(0, 6);
      return html`<section class="card al-widget">
        <div class="card-head"><h2>${icon('cake')}Aniversariantes</h2><span class="sub">Próximos 7 dias</span></div>
        <div class="card-body">${list.length
          ? html`<ul class="items">${shown.map(({ s, date, diff, turning }) => {
              const c = Q.klass(s.classId);
              return html`<li><span class="date-chip ${diff === 0 ? 'today' : ''}"><b>${Number(date.slice(8))}</b><span>${U.MONTHS_SHORT[Number(date.slice(5, 7)) - 1]}</span></span>
                <div class="grow"><a class="person-name" href="#alunos/${s.id}">${s.name}</a><div class="person-sub">${diff === 0 ? 'Hoje' : U.cap(U.relDay(date))} · faz ${turning} anos${c ? ` · ${c.name}` : ''}</div></div></li>`;
            })}</ul>${list.length > shown.length ? html`<p class="small muted al-wmore">e mais ${U.plural(list.length - shown.length, 'aniversariante', 'aniversariantes')} na semana</p>` : ''}`
          : html`<p class="muted small al-wempty">Nenhum aniversário nos próximos 7 dias.</p>`}</div>
      </section>`;
    },
  });

  App.widget({
    id: 'alertas-saude',
    order: 30,
    size: 'half',
    perm: 'alunos.alertas',
    render() {
      const mine = Q.myClasses();
      const ids = new Set(mine.map((c) => c.id));
      const scoped = mine.length > 0;
      const list = Q.students().filter((s) => s.alerts && (!scoped || ids.has(s.classId)));
      const shown = list.slice(0, 6);
      const sub = scoped ? (mine.length === 1 ? mine[0].name : 'Das suas turmas') : 'Alunos ativos';
      return html`<section class="card al-widget">
        <div class="card-head"><h2>${icon('heart')}Alertas de saúde</h2><span class="sub">${sub}</span></div>
        <div class="card-body">${list.length
          ? html`<ul class="items al-walerts">${shown.map((s) => {
              const c = Q.klass(s.classId);
              return html`<li>${UI.avatar(s.name, 'sm', s.photo)}<div class="grow"><a class="person-name" href="#alunos/${s.id}">${s.name}</a><div class="person-sub">${c ? c.name : 'Sem turma'}</div><p class="al-walert">${s.alerts}</p></div></li>`;
            })}</ul>
            ${list.length > shown.length ? html`<a class="btn sm ghost al-wmore" href="#alunos" data-al-w="alerts">Ver todos (${list.length})${icon('arrowRight')}</a>` : ''}`
          : html`<p class="muted small al-wempty">${scoped ? 'Nenhum aluno das suas turmas tem alerta de saúde registrado.' : 'Nenhum aluno com alerta de saúde registrado.'}</p>`}</div>
      </section>`;
    },
    mount(el) {
      el.addEventListener('click', (e) => {
        const a = e.target.closest('[data-al-w="alerts"]');
        if (!a) return;
        e.preventDefault();
        Object.assign(LS(), { alerts: true, status: 'ativo', q: '', portal: '', classId: '', limit: 200 });
        App.go('alunos');
      });
    },
  });

  // =====================================================================
  // Registro: tela, abas, busca e ações
  // =====================================================================
  App.page({
    id: 'alunos',
    label: 'Alunos',
    icon: 'users',
    group: 'Alunos e turmas',
    order: 10,
    tab: 3,
    perm: 'alunos.ver',
    keys: 'estudantes ficha famílias responsáveis matrícula',
    title: (rest) => (rest[0] && Q.student(rest[0]) ? Q.student(rest[0]).name : 'Alunos'),
    render: (rest) => (rest[0] ? renderProfile(rest[0], rest[1]) : renderList()),
    mount: (el, rest) => (rest[0] ? mountProfile(el, rest[0], rest[1]) : mountList(el)),
  });

  App.studentTab({ id: 'dados', label: 'Dados e família', order: 10, render: renderDados, mount: mountDados });
  App.studentTab({ id: 'historico', label: 'Histórico', order: 80, render: renderHistory });

  App.action({ id: 'convidar-familias', label: 'Convidar famílias para o portal', icon: 'send', order: 60, perm: 'familias.acessos', keys: 'convite código acesso portal família responsáveis', run: () => Actions.convidarFamilias(LS().classId) });

  App.searchProvider((query) => {
    if (Store.family || !can('alunos.ver')) return [];
    const list = Q.students({ status: 'todos', query });
    list.sort((a, b) => (a.status === 'ativo' ? 0 : 1) - (b.status === 'ativo' ? 0 : 1));
    return list.slice(0, 6).map((s) => {
      const c = Q.klass(s.classId);
      return {
        group: 'Alunos',
        label: s.name,
        avatar: s.name,
        meta: [c ? c.name : 'Sem turma', s.status !== 'ativo' ? statusOf(s).label : ''].filter(Boolean).join(' · '),
        keys: [s.name, s.enrollment, c ? c.name : '', ...(s.guardians || []).map((g) => g.name)].join(' '),
        run: () => App.go('alunos/' + s.id),
      };
    });
  });

  /* Peças compartilhadas com a matrícula (matricula.js) e com outros módulos. */
  window.AlunosKit = { fitDrawer, STATUS, statusPill, portalOf, studentPortal, ga, fullName, birthCheck, GENDERS, RELATIONS, invitedNow, birthdaysAhead, editGuardian };
})();
