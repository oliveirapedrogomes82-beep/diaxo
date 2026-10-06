'use strict';
/* Turmas: visão geral, alunos, professores por disciplina, horário semanal e desempenho. */
const PERIODS = {
  Manhã: ['07:30', '08:20', '09:30', '10:20', '11:10'],
  Tarde: ['13:00', '13:50', '15:00', '15:50', '16:40'],
  Noite: ['19:00', '19:45', '20:40', '21:25', '22:10'],
  Integral: ['08:00', '09:00', '10:15', '13:30', '14:30'],
};

Pages.turmas = {
  title: 'Turmas',
  render(params) {
    if (params[0]) return Pages.turma.render(params);
    const cls = Q.classes();
    if (!cls.length)
      return `<div class="page-head"><div><h1>Turmas</h1></div></div><section class="card">${UI.empty({
        icon: 'layers',
        title: 'Nenhuma turma criada',
        text: 'Crie as turmas da escola. Depois você matricula os alunos e define os professores de cada disciplina.',
        action: `<button class="btn primary" data-x="new">${icon('plus')}Criar turma</button>`,
      })}</section>`;
    const s = Q.settings();
    return `
      <div class="page-head">
        <div><h1>Turmas</h1><p class="lead">${U.plural(cls.length, 'turma', 'turmas')} em ${s.year}. Abra uma turma para ver alunos, horário e desempenho.</p></div>
        <button class="btn primary" data-x="new">${icon('plus')}Criar turma</button>
      </div>
      <div class="cards">${cls
        .map((c) => {
          const n = Q.roster(c.id).length;
          const att = Q.classAttendance(c.id).rate;
          const avg = Q.classAvg(c.id);
          const today = Q.roll(c.id, U.today());
          const reg = Q.teacher(c.teacherId);
          const full = c.capacity ? (n / c.capacity) * 100 : 0;
          return `<a class="card tile" href="#turmas/${c.id}">
            <div class="tile-top"><div class="grow"><h3>${U.esc(c.name)}</h3><div class="person-sub">${U.esc(c.shift)}${c.room ? ' · ' + U.esc(c.room) : ''}${c.segment ? ' · ' + U.esc(c.segment) : ''}</div></div>
            ${Q.isSchoolDay(U.today()) && n ? (today ? UI.pill('Chamada feita', 'ok') : UI.pill('Sem chamada', 'warn')) : ''}</div>
            <div><div class="small muted" style="display:flex;justify-content:space-between"><span>${n} alunos</span><span>${c.capacity ? `${Math.max(0, c.capacity - n)} vagas` : ''}</span></div>${UI.meter(full, full >= 100 ? 'bad' : full >= 90 ? 'warn' : '')}</div>
            <div class="small muted">${icon('teacher')} Regente: <b style="color:var(--fg)">${U.esc(reg ? U.shortName(reg.name) : 'não definido')}</b></div>
            <div class="tile-stats">
              <div><b>${n}</b><span>alunos</span></div>
              <div><b>${U.pct(att)}</b><span>frequência</span></div>
              <div><b class="${UI.gradeCls(avg)}">${U.num(avg)}</b><span>média</span></div>
            </div>
          </a>`;
        })
        .join('')}</div>`;
  },
  mount(el, params) {
    if (params[0]) return Pages.turma.mount(el, params);
    el.addEventListener('click', (e) => {
      if (e.target.closest('[data-x="new"]')) Actions.novaTurma();
    });
  },
};

Pages.turma = {
  render([id]) {
    const c = Q.klass(id);
    if (!c) return UI.empty({ icon: 'layers', title: 'Turma não encontrada', action: '<a class="btn primary" href="#turmas">Ver turmas</a>' });
    const v = (View.turma = View.turma && View.turma.id === id ? View.turma : { id, tab: 'alunos' });
    const kids = Q.roster(id);
    const reg = Q.teacher(c.teacherId);
    return `
      <nav class="crumbs" aria-label="Caminho"><a href="#turmas">Turmas</a>${icon('chevronRight')}<span>${U.esc(c.name)}</span></nav>
      <div class="page-head">
        <div><h1>${U.esc(c.name)}</h1>
          <div class="meta-row"><span>${icon('sunrise')}${U.esc(c.shift)}</span>${c.room ? `<span>${icon('door')}${U.esc(c.room)}</span>` : ''}<span>${icon('users')}${kids.length}${c.capacity ? '/' + c.capacity : ''} alunos</span><span>${icon('teacher')}Regente: ${U.esc(reg ? reg.name : 'não definido')}</span></div>
        </div>
        <div class="btn-row">
          <button class="btn" data-x="roll">${icon('checkSquare')}Fazer chamada</button>
          <button class="btn" data-x="grades">${icon('grade')}Lançar notas</button>
          <button class="btn" data-x="edit">${icon('pencil')}Editar</button>
          <button class="icon-btn" data-x="more" aria-label="Mais ações">${icon('dots')}</button>
        </div>
      </div>
      ${UI.tabs([['alunos', 'Alunos'], ['professores', 'Professores'], ['horario', 'Horário'], ['desempenho', 'Desempenho']], v.tab)}
      <div>${this[v.tab](c, kids)}</div>`;
  },

  alunos(c, kids) {
    if (!kids.length)
      return `<section class="card">${UI.empty({ icon: 'users', title: 'Turma sem alunos', text: 'Matricule alunos nesta turma ou transfira de outra turma.', action: `<button class="btn primary" data-x="enroll">${icon('userPlus')}Matricular aluno</button>` })}</section>`;
    return `<div class="toolbar"><span class="grow result-count">${U.plural(kids.length, 'aluno', 'alunos')} em ordem alfabética (número de chamada)</span><button class="btn" data-x="export">${icon('download')}Exportar lista</button><button class="btn primary" data-x="enroll">${icon('userPlus')}Matricular aqui</button></div>
      <section class="card" style="margin-top:12px"><div class="table-wrap"><table class="table responsive">
      <thead><tr><th class="num">Nº</th><th>Aluno</th><th class="hide-sm">Responsável</th><th class="num">Frequência</th><th class="num">Média</th></tr></thead>
      <tbody>${kids
        .map((a, i) => {
          const att = Q.studentAttendance(a.id).rate;
          const avg = Q.studentAvg(a.id);
          return `<tr class="clickable" data-go="${a.id}"><td class="num hide-sm muted">${i + 1}</td>
          <td class="first"><div class="person">${UI.avatar(a.name, 'sm')}<div><a class="person-name" href="#alunos/${a.id}">${U.esc(a.name)}</a>${a.health ? `<div class="person-sub">${icon('heart')} ${U.esc(a.health)}</div>` : ''}</div></div></td>
          <td class="hide-sm"><div>${U.esc(a.guardian?.name || '—')}</div><div class="person-sub">${U.esc(a.guardian?.phone || '')}</div></td>
          <td class="num" data-l="Freq.:"><div class="mini-bar">${att == null ? '—' : `${UI.meter(att, UI.attTone(att))}<span>${U.pct(att)}</span>`}</div></td>
          <td class="num ${UI.gradeCls(avg)}" data-l="Média:">${U.num(avg)}</td></tr>`;
        })
        .join('')}</tbody></table></div></section>`;
  },

  professores(c) {
    const subs = Q.subjects();
    const teachers = Q.teachers();
    return `<p class="muted" style="margin-bottom:14px">Escolha quem dá cada disciplina nesta turma. Professores que lecionam a disciplina aparecem primeiro. As mudanças são salvas na hora.</p>
      <section class="card"><div class="table-wrap"><table class="table">
      <thead><tr><th>Disciplina</th><th>Professor</th><th class="num hide-sm">Aulas/semana</th></tr></thead>
      <tbody>
        <tr><td><b>Professor(a) regente</b><div class="person-sub">Responsável pela turma</div></td><td>${this.teacherSelect('reg', c.teacherId, teachers, null)}</td><td class="hide-sm"></td></tr>
        ${subs
          .map((s) => {
            const n = c.schedule.flat().filter((x) => x === s.id).length;
            const on = s.id in c.subjects;
            return `<tr><td><label class="check" style="align-items:center"><input type="checkbox" data-has="${s.id}" ${on ? 'checked' : ''} aria-label="Turma tem ${U.esc(s.name)}"><span class="subject-tag"><span class="swatch c${s.color}"></span>${U.esc(s.name)}</span></label></td>
              <td>${on ? this.teacherSelect(s.id, c.subjects[s.id], teachers, s.id) : '<span class="small muted">Esta turma não tem esta disciplina</span>'}</td><td class="num hide-sm">${n || '—'}</td></tr>`;
          })
          .join('')}
      </tbody></table></div></section>`;
  },
  teacherSelect(key, value, teachers, subjectId) {
    const fit = subjectId ? teachers.filter((t) => t.subjectIds.includes(subjectId)) : teachers;
    const rest = subjectId ? teachers.filter((t) => !t.subjectIds.includes(subjectId)) : [];
    const opt = (t) => `<option value="${t.id}" ${t.id === value ? 'selected' : ''}>${U.esc(t.name)}</option>`;
    return `<select class="input" data-assign="${key}" style="max-width:340px" aria-label="Professor">
      <option value="">— Sem professor —</option>
      ${subjectId && fit.length ? `<optgroup label="Lecionam esta disciplina">${fit.map(opt).join('')}</optgroup>` : fit.map(opt).join('')}
      ${rest.length ? `<optgroup label="Outros professores">${rest.map(opt).join('')}</optgroup>` : ''}
    </select>`;
  },

  horario(c) {
    const subs = Q.classSubjects(c.id);
    const times = PERIODS[c.shift] || PERIODS.Manhã;
    const days = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta'];
    const counts = {};
    c.schedule.flat().forEach((x) => x && (counts[x] = (counts[x] || 0) + 1));
    return `<p class="muted" style="margin-bottom:14px">Clique em uma aula para trocar a disciplina. O professor de cada aula vem da aba Professores.</p>
      <section class="card card-pad"><div class="table-wrap"><table class="timetable">
      <thead><tr><th></th>${days.map((d) => `<th>${d}</th>`).join('')}</tr></thead>
      <tbody>${times
        .map(
          (t, pi) => `<tr><th class="period">${pi + 1}º<br><span class="muted" style="font-weight:500">${t}</span></th>${days
            .map((d, di) => {
              const sid = (c.schedule[di] || [])[pi] || '';
              const s = Q.subject(sid);
              const tch = s ? Q.teacher(c.subjects[sid]) : null;
              return `<td><div class="slot" style="${s ? `--c:var(--cat-${s.color})` : ''}">
                <select data-slot="${di}-${pi}" aria-label="${d}, ${pi + 1}º tempo"><option value="">Vago</option>${subs.map((x) => `<option value="${x.id}" ${x.id === sid ? 'selected' : ''}>${U.esc(x.name)}</option>`).join('')}</select>
                <small>${s ? U.esc(tch ? U.shortName(tch.name) : 'sem professor') : '&nbsp;'}</small></div></td>`;
            })
            .join('')}</tr>`,
        )
        .join('')}</tbody></table></div></section>
      <div class="legend" style="margin-top:12px">${subs.map((s) => `<span><span class="swatch c${s.color}"></span>${U.esc(s.name)}: ${counts[s.id] || 0}</span>`).join('')}</div>`;
  },

  desempenho(c, kids) {
    const s = Q.settings();
    const subs = Q.classSubjects(c.id);
    const risk = Q.atRisk(c.id);
    const att = Q.classAttendance(c.id);
    const att30 = Q.classAttendance(c.id, U.addDays(U.today(), -30));
    return `
      <div class="kpis" style="margin-bottom:22px">
        <div class="card kpi"><span class="kpi-label">Média da turma</span><span class="kpi-value ${UI.gradeCls(Q.classAvg(c.id))}">${U.num(Q.classAvg(c.id))}</span><span class="kpi-foot">média para aprovação: ${U.num(s.passing)}</span></div>
        <div class="card kpi"><span class="kpi-label">Frequência</span><span class="kpi-value">${U.pct(att.rate)}</span>${UI.meter(att.rate, UI.attTone(att.rate))}<span class="kpi-foot">${U.plural(att.days, 'dia registrado', 'dias registrados')}</span></div>
        <div class="card kpi"><span class="kpi-label">Últimos 30 dias</span><span class="kpi-value">${U.pct(att30.rate)}</span><span class="kpi-foot">de presença</span></div>
        <div class="card kpi"><span class="kpi-label">Precisam de atenção</span><span class="kpi-value">${risk.length}</span><span class="kpi-foot">nota ou frequência baixa</span></div>
      </div>
      <div class="grid-2">
        <section class="card"><div class="card-head"><h2>Média por disciplina</h2><span class="sub">A linha marca a média ${U.num(s.passing)}</span></div>
          <div class="card-body hbars">${subs
            .map((x) => {
              const v = Q.classAvg(c.id, x.id);
              return `<div class="hbar" data-tip="${U.esc(x.name)}: média ${U.num(v)}"><span>${U.esc(x.name)}</span><div class="track"><div class="fill ${v != null && v < s.passing ? 'low' : ''}" style="width:${(v || 0) * 10}%"></div><div class="line" style="left:${s.passing * 10}%"></div></div><span class="v ${UI.gradeCls(v)}">${U.num(v)}</span></div>`;
            })
            .join('')}</div></section>
        <section class="card"><div class="card-head"><h2>Alunos que precisam de atenção</h2></div><div class="card-body">${
          risk.length
            ? `<ul class="items">${risk
                .map(
                  (x) => `<li>${UI.avatar(x.a.name, 'sm')}<div class="grow"><a class="person-name" href="#alunos/${x.a.id}">${U.esc(U.shortName(x.a.name))}</a>
                  <div class="person-sub">${x.avg != null && x.avg < s.passing ? `média ${U.num(x.avg)}` : ''}${x.avg != null && x.avg < s.passing && x.att != null && x.att < s.minAttendance ? ' · ' : ''}${x.att != null && x.att < s.minAttendance ? `frequência ${U.pct(x.att)}` : ''}</div></div>
                  ${x.att != null && x.att < s.minAttendance ? UI.pill('Faltas', 'bad') : UI.pill('Notas', 'warn')}</li>`,
                )
                .join('')}</ul>`
            : UI.empty({ icon: 'checkCircle', title: 'Ninguém em risco', text: 'Todos estão com média e frequência dentro do esperado.' })
        }</div></section>
      </div>`;
  },

  mount(el, [id]) {
    const c = Q.klass(id);
    if (!c) return;
    const v = View.turma;
    el.addEventListener('click', (e) => {
      const tab = e.target.closest('[data-tab]');
      if (tab) {
        v.tab = tab.dataset.tab;
        App.render();
        return;
      }
      const row = e.target.closest('tr[data-go]');
      if (row && !e.target.closest('a')) return App.go('alunos/' + row.dataset.go);
      const x = e.target.closest('[data-x]');
      if (!x) return;
      const k = x.dataset.x;
      if (k === 'roll') {
        View.chamada = { ...(View.chamada || {}), classId: id };
        App.go('chamada');
      } else if (k === 'grades') {
        View.notas = { ...(View.notas || {}), classId: id };
        App.go('notas');
      } else if (k === 'edit') Actions.editarTurma(id);
      else if (k === 'enroll') Actions.matricular({ classId: id });
      else if (k === 'export') {
        const kids = Q.roster(id);
        Actions.exportTable(x, U.slug(c.name), [
          ['Nº', 'Aluno', 'Matrícula', 'Nascimento', 'Responsável', 'Telefone', 'E-mail'],
          ...kids.map((a, i) => [i + 1, a.name, a.enrollment, U.fmtDate(a.birth), a.guardian?.name, a.guardian?.phone, a.guardian?.email]),
        ]);
      } else if (k === 'more')
        UI.menu(x, [
          { label: 'Editar dados da turma', icon: 'pencil', fn: () => Actions.editarTurma(id) },
          { label: 'Ver ata de notas', icon: 'file', fn: () => { View.relatorios = { type: 'ata', classId: id }; App.go('relatorios'); } },
          '-',
          { label: 'Excluir turma', icon: 'trash', danger: true, fn: () => Actions.excluirTurma(id) },
        ]);
    });
    el.addEventListener('change', (e) => {
      const as = e.target.closest('[data-assign]');
      if (as) {
        const key = as.dataset.assign;
        const val = as.value || null;
        Store.update((s) => {
          const t = s.classes.find((x) => x.id === id);
          if (key === 'reg') t.teacherId = val;
          else t.subjects[key] = val;
        }, { log: `Professor atualizado no ${c.name}`, icon: 'teacher' });
        UI.toast(val ? `${U.shortName(Q.teacher(val).name)} definido(a)` : 'Professor removido');
        return;
      }
      const has = e.target.closest('[data-has]');
      if (has) {
        const sid = has.dataset.has;
        Store.update((s) => {
          const t = s.classes.find((x) => x.id === id);
          if (has.checked) t.subjects[sid] = null;
          else {
            delete t.subjects[sid];
            t.schedule = t.schedule.map((d) => d.map((x) => (x === sid ? '' : x)));
          }
        });
        return;
      }
      const slot = e.target.closest('[data-slot]');
      if (slot) {
        // salva sem redesenhar a tela, para não perder o foco ao montar o horário
        const [di, pi] = slot.dataset.slot.split('-').map(Number);
        Store.update(
          (s) => {
            const t = s.classes.find((x) => x.id === id);
            while (t.schedule.length < 5) t.schedule.push(['', '', '', '', '']);
            t.schedule[di][pi] = slot.value;
          },
          { silent: true },
        );
        const sub = Q.subject(slot.value);
        const box = slot.closest('.slot');
        box.style.cssText = sub ? `--c:var(--cat-${sub.color})` : '';
        const tch = sub ? Q.teacher(Q.klass(id).subjects[sub.id]) : null;
        box.querySelector('small').innerHTML = sub ? U.esc(tch ? U.shortName(tch.name) : 'sem professor') : '&nbsp;';
        const counts = {};
        Q.klass(id).schedule.flat().forEach((x) => x && (counts[x] = (counts[x] || 0) + 1));
        const legend = el.querySelector('.legend');
        if (legend) legend.innerHTML = Q.classSubjects(id).map((x) => `<span><span class="swatch c${x.color}"></span>${U.esc(x.name)}: ${counts[x.id] || 0}</span>`).join('');
      }
    });
  },
};

const classDefs = () => [
  { name: 'name', label: 'Nome da turma', required: true, placeholder: 'Ex.: 6º ano A', full: true },
  { name: 'segment', label: 'Etapa', type: 'select', options: ['Educação Infantil', 'Fundamental I', 'Fundamental II', 'Ensino Médio', 'EJA', 'Outro'].map((x) => [x, x]) },
  { name: 'shift', label: 'Turno', type: 'chips', required: true, options: ['Manhã', 'Tarde', 'Noite', 'Integral'].map((x) => [x, x]) },
  { name: 'room', label: 'Sala', placeholder: 'Ex.: Sala 11' },
  { name: 'capacity', label: 'Vagas', type: 'number', min: 1, max: 200 },
  { name: 'teacherId', label: 'Professor(a) regente', type: 'select', full: true, options: [['', 'Definir depois'], ...Q.teachers().map((t) => [t.id, t.name])] },
];

Actions.novaTurma = () =>
  UI.formDrawer({
    title: 'Criar turma',
    sub: 'Todas as disciplinas entram na turma. Você ajusta depois na aba Professores.',
    defs: classDefs(),
    values: { shift: 'Manhã', capacity: 30, segment: 'Fundamental II' },
    submitLabel: 'Criar turma',
    onSubmit(d) {
      if (Store.state.classes.some((c) => U.norm(c.name) === U.norm(d.name))) {
        UI.toast('Já existe uma turma com esse nome.', { tone: 'bad' });
        return false;
      }
      const id = 'c' + U.uid();
      const subjects = {};
      Q.subjects().forEach((s) => (subjects[s.id] = Q.teachers().find((t) => t.subjectIds.includes(s.id))?.id || null));
      // horário inicial: distribui a carga semanal de cada disciplina
      const pool = [];
      Q.subjects().forEach((s) => {
        for (let k = 0; k < (s.weekly || 1); k++) pool.push(s.id);
      });
      const schedule = [0, 1, 2, 3, 4].map((di) => [0, 1, 2, 3, 4].map((pi) => pool[(pi * 5 + di) % Math.max(1, pool.length)] || ''));
      Store.update((s) => s.classes.push({ id, ...d, capacity: Number(d.capacity) || 0, teacherId: d.teacherId || null, subjects, schedule }), { log: `Turma ${d.name} criada`, icon: 'layers' });
      UI.toast(`Turma ${d.name} criada`, { action: { label: 'Abrir', fn: () => App.go('turmas/' + id) } });
    },
  });

Actions.editarTurma = (id) =>
  UI.formDrawer({
    title: 'Editar turma',
    defs: classDefs(),
    values: Q.klass(id),
    submitLabel: 'Salvar alterações',
    onSubmit(d) {
      Store.update((s) => Object.assign(s.classes.find((x) => x.id === id), d, { capacity: Number(d.capacity) || 0, teacherId: d.teacherId || null }), { log: `Turma ${d.name} atualizada`, icon: 'pencil' });
      UI.toast('Turma atualizada');
    },
  });

Actions.excluirTurma = async (id) => {
  const c = Q.klass(id);
  const n = Q.students({ classId: id, status: 'todos' }).length;
  const ok = await UI.confirm({
    title: `Excluir o ${U.esc(c.name)}?`,
    text: n ? `${U.plural(n, 'aluno ficará', 'alunos ficarão')} sem turma, e a frequência registrada desta turma será apagada. Notas e cobranças continuam com os alunos.` : 'A turma não tem alunos.',
    ok: 'Excluir turma',
    danger: true,
  });
  if (!ok) return;
  Store.update(
    (s) => {
      s.classes = s.classes.filter((x) => x.id !== id);
      s.students.forEach((a) => a.classId === id && (a.classId = ''));
      Object.keys(s.attendance).forEach((k) => k.startsWith(id + '|') && delete s.attendance[k]);
    },
    { log: `Turma ${c.name} excluída`, icon: 'trash', undo: true },
  );
  App.go('turmas');
  UI.undoToast(`Turma ${c.name} excluída`);
};
