'use strict';
/* Turmas — lista por etapa de ensino, página da turma (alunos, equipe, horário, desempenho), criar, editar,
   encerrar e excluir turma. Comandos: classes.* (web/core/commands/escola.js).
   Este arquivo também acrescenta ao Q as consultas pedagógicas usadas por Chamada e Notas
   (quem registra cada aula, chamadas pendentes, faltas seguidas, médias e frequência por turma). */
(() => {
  const R = Core.rules;
  const SEGMENTS = ['Educação Infantil', 'Fundamental I', 'Fundamental II', 'Ensino Médio', 'EJA', 'Outro'];
  const SHIFTS = ['Manhã', 'Tarde', 'Noite', 'Integral'];
  const DAYS = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta'];
  const DAYS_SHORT = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex'];
  const can = (p) => Store.can(p);
  const tf = (b) => (b ? 'true' : 'false');

  // =====================================================================
  // Consultas pedagógicas (compartilhadas por Turmas, Chamada e Notas)
  // =====================================================================
  /** Cache que vale até a próxima mudança de dados. */
  let memo = { v: -1, m: new Map() };
  const cached = (key, fn) => {
    if (memo.v !== Store.version) memo = { v: Store.version, m: new Map() };
    if (!memo.m.has(key)) memo.m.set(key, fn());
    return memo.m.get(key);
  };
  const meCtx = () => {
    const m = Store.me || {};
    return { all: m.scope === 'todas', classIds: new Set(m.classIds || []), user: { id: m.id } };
  };
  /** Quem registra a chamada de uma aula — a mesma regra do comando attendance.save. */
  const canTakeLesson = (classId, period = 0, subjectId = null) => {
    if (!Store.me || Store.family || !can('chamada.registrar')) return false;
    const c = Q.klass(classId);
    if (!c) return false;
    const ctx = meCtx();
    if (Core.pedagogico && Core.pedagogico.canTakeLesson) return Core.pedagogico.canTakeLesson(ctx, c, period, subjectId);
    if (ctx.all) return true;
    if (!ctx.classIds.has(c.id)) return false;
    if (!period) return true;
    if (c.teacherId === ctx.user.id && ['Educação Infantil', 'Fundamental I'].includes(c.segment)) return true;
    return !!subjectId && !!c.subjects && c.subjects[subjectId] === ctx.user.id;
  };
  /** Aulas do dia que eu posso registrar e ainda estão sem chamada: [{klass, missing: [{period, subjectId}]}]. */
  const rollsToDo = (date = U.today()) =>
    cached('todo|' + date, () => {
      if (!can('chamada.registrar') || !Q.isSchoolDay(date)) return [];
      const mine = Store.me.scope === 'todas' ? [] : Q.myClasses();
      return (mine.length ? mine : Q.classes())
        .filter((c) => Q.roster(c.id).length)
        .map((c) => ({ klass: c, missing: Q.periods(c.id, date).filter((p) => canTakeLesson(c.id, p.period, p.subjectId) && !Q.attendance(c.id, date, p.period)) }))
        .filter((x) => x.missing.length);
    });
  /** Situação da chamada de uma turma num dia: {total, done} (aulas do horário ou a chamada diária). */
  const rollState = (classId, date) => {
    const ps = Q.periods(classId, date);
    return { total: ps.length, done: ps.filter((p) => Q.attendance(classId, date, p.period)).length };
  };
  /** Faltas seguidas mais recentes de cada aluno da turma (uma passada só). Map(studentId → n). */
  const absenceStreaks = (classId) =>
    cached('streak|' + classId, () => {
      const byStudent = new Map();
      const att = Store.state.attendance;
      const prefix = classId + '|';
      for (const k of Object.keys(att)) {
        if (!k.startsWith(prefix)) continue;
        const date = k.slice(prefix.length, prefix.length + 10);
        const marks = att[k].marks || {};
        for (const sid of Object.keys(marks)) {
          let days = byStudent.get(sid);
          if (!days) byStudent.set(sid, (days = new Map()));
          const m = marks[sid];
          const cur = days.get(date);
          days.set(date, cur === 'P' || m === 'P' || m === 'A' ? 'P' : 'F');
        }
      }
      const out = new Map();
      for (const [sid, days] of byStudent) {
        let n = 0;
        for (const d of [...days.keys()].sort().reverse()) {
          if (days.get(d) === 'F') n++;
          else break;
        }
        out.set(sid, n);
      }
      return out;
    });
  const absenceAlert = () => Number(Q.settings().absenceAlert) || 3;
  /** Agrega registros de frequência {lessons, F, J, A} → % (A sai da conta). */
  const rateFrom = (e) => R.rateOf(e && e.lessons ? e : null);
  /** Média anual do aluno (média das médias das disciplinas da turma). */
  const studentAverage = (sid, classId) =>
    cached('savg|' + sid + '|' + classId, () => U.avg(Q.classSubjects(classId).map((s) => Q.subjectAverage(sid, s.id)).filter((v) => v != null)));
  /** Indicadores de uma turma: alunos, frequência (ano e 30 dias), média geral, pareceres da etapa. */
  // índices de frequência do ano e dos últimos 30 dias (um de cada por versão dos dados)
  const idxYear = () => cached('idx|year', () => R.attendanceIndex(Store.state.attendance, { year: Q.year() }));
  const idxRecent = () => cached('idx|30', () => R.attendanceIndex(Store.state.attendance, { year: Q.year(), from: U.addDays(U.today(), -30) }));
  const classStats = (classId) =>
    cached('cstats|' + classId, () => {
      const kids = Q.roster(classId);
      const idx = idxYear();
      const recent = idxRecent();
      const sum = (map) => {
        const e = { lessons: 0, P: 0, F: 0, J: 0, A: 0 };
        for (const k of kids) {
          const x = map.get(k.id);
          if (!x) continue;
          e.lessons += x.lessons;
          e.F += x.F;
          e.J += x.J;
          e.A += x.A;
        }
        return e;
      };
      const parecer = Q.evaluation(classId) === 'parecer';
      const avgs = parecer ? [] : kids.map((k) => studentAverage(k.id, classId)).filter((v) => v != null);
      const term = Q.currentTerm();
      return {
        n: kids.length,
        rate: rateFrom(sum(idx)),
        recent: rateFrom(sum(recent)),
        avg: U.avg(avgs),
        parecer,
        pareceres: parecer ? kids.filter((k) => Q.grade(k.id, '_parecer', term)).length : 0,
      };
    });
  /** Frequência por disciplina de uma turma (modo por aula). [{subjectId, rate, lessons}] */
  const subjectAttendance = (classId) =>
    cached('subatt|' + classId, () => {
      const kids = new Set(Q.roster(classId).map((s) => s.id));
      const by = new Map();
      const att = Store.state.attendance;
      const prefix = classId + '|';
      const y = Q.year();
      for (const k of Object.keys(att)) {
        if (!k.startsWith(prefix) || k.slice(prefix.length, prefix.length + 4) !== y) continue;
        const rec = att[k];
        if (!rec.subjectId) continue;
        let e = by.get(rec.subjectId);
        if (!e) by.set(rec.subjectId, (e = { lessons: 0, P: 0, F: 0, J: 0, A: 0, days: 0 }));
        e.days++;
        for (const [sid, m] of Object.entries(rec.marks || {})) {
          if (!kids.has(sid)) continue;
          e.lessons++;
          if (e[m] !== undefined) e[m]++;
        }
      }
      return [...by.entries()].map(([subjectId, e]) => ({ subjectId, rate: rateFrom(e), lessons: e.days }));
    });
  /** Alunos que pedem atenção: média abaixo, frequência abaixo do mínimo ou faltas seguidas. */
  const atRisk = (classId) =>
    cached('risk|' + classId, () => {
      const st = Q.settings();
      const min = Q.minAttendance(classId);
      const streaks = can('chamada.ver') ? absenceStreaks(classId) : new Map();
      const alert = absenceAlert();
      const parecer = Q.evaluation(classId) === 'parecer';
      return Q.roster(classId)
        .map((s) => {
          const avg = can('notas.ver') && !parecer ? studentAverage(s.id, classId) : null;
          const att = can('chamada.ver') ? Q.attendanceRate(s.id) : null;
          const streak = streaks.get(s.id) || 0;
          const reasons = [];
          if (avg != null && avg < st.passing) reasons.push({ k: 'nota', label: `média ${U.num(avg)}`, tone: avg < st.recovery ? 'bad' : 'warn' });
          if (att != null && att < min) reasons.push({ k: 'freq', label: `frequência ${U.pct(att)}`, tone: 'bad' });
          if (streak >= alert) reasons.push({ k: 'seguidas', label: `${streak} faltas seguidas`, tone: 'bad' });
          return { s, avg, att, streak, reasons };
        })
        .filter((x) => x.reasons.length)
        .sort((a, b) => b.reasons.length - a.reasons.length || (a.avg ?? 10) - (b.avg ?? 10));
    });
  /** Registros de chamada de um aluno no ano: [{classId, date, period, subjectId, mark, reason}] */
  const attendanceRecords = (sid) =>
    cached('arecs|' + sid, () => {
      const out = [];
      const y = Q.year();
      const att = Store.state.attendance;
      for (const k of Object.keys(att)) {
        const rec = att[k];
        const m = rec.marks && rec.marks[sid];
        if (!m) continue;
        const [classId, date, p] = k.split('|');
        if (date.slice(0, 4) !== y) continue;
        out.push({ classId, date, period: Number(p), subjectId: rec.subjectId || null, mark: m, reason: (rec.reasons || {})[sid] || '' });
      }
      return out;
    });
  const homeroom = (c) => (c && ['Educação Infantil', 'Fundamental I'].includes(c.segment) ? 'Regente' : 'Conselheiro(a)');
  const gradeTone = (v) => (v == null ? '' : v < Q.settings().passing ? (v < Q.settings().recovery ? 'pd-g-bad' : 'pd-g-warn') : '');

  Object.assign(Q, { canTakeLesson, rollsToDo, rollState, absenceStreaks, absenceAlert, studentAverage, classStats, subjectAttendance, atRisk, attendanceRecords, homeroom, gradeTone });

  // =====================================================================
  // Pessoas para vincular às turmas
  // =====================================================================
  const teaches = (u) => {
    const r = Core.perms.ROLE[u.role];
    return !!(r && r.teaches);
  };
  const ASSIST_ROLES = ['auxiliar', 'apoio', 'interprete', 'estagiario', 'monitor'];
  /** Opções agrupadas de um select de pessoa (nunca a própria pessoa, que não pode se vincular). */
  const personOptions = (value, groups) => {
    const meId = Store.me.id;
    const seen = new Set();
    const opt = (u) => html`<option value="${u.id}" ${u.id === value ? raw('selected') : ''}>${u.name}</option>`;
    const out = [];
    for (const [label, list] of groups) {
      const items = list.filter((u) => u.id !== meId && !seen.has(u.id));
      items.forEach((u) => seen.add(u.id));
      if (items.length) out.push(html`<optgroup label="${label}">${items.map(opt)}</optgroup>`);
    }
    if (value && !seen.has(value)) {
      const cur = Q.user(value);
      out.unshift(html`<option value="${value}" selected ${value === meId ? raw('disabled') : ''}>${cur ? cur.name : 'Pessoa sem acesso'}${value === meId ? ' (você)' : ''}</option>`);
    }
    return out;
  };
  const teacherGroups = (subjectId) => {
    const staff = Q.staff();
    const teachers = staff.filter(teaches);
    if (!subjectId) return [['Professores', teachers.filter((u) => u.role !== 'auxiliar')], ['Outras pessoas da sala de aula', teachers.filter((u) => u.role === 'auxiliar')]];
    const sub = Q.subject(subjectId);
    return [[`Lecionam ${sub ? sub.name : 'esta disciplina'}`, teachers.filter((u) => (u.subjectIds || []).includes(subjectId))], ['Outros professores', teachers.filter((u) => u.role !== 'auxiliar')]];
  };
  const assistantCandidates = (c) => {
    const taken = new Set(c.assistantIds || []);
    const staff = Q.staff().filter((u) => !taken.has(u.id) && u.id !== Store.me.id);
    return [['Auxiliares e apoio', staff.filter((u) => ASSIST_ROLES.includes(u.role))], ['Professores', staff.filter((u) => teaches(u) && !ASSIST_ROLES.includes(u.role))]];
  };

  // =====================================================================
  // Permissões da tela
  // =====================================================================
  const canManage = () => can('turmas.gerenciar');
  /** Criar turma, vincular pessoas, encerrar e excluir exigem enxergar todas as turmas. */
  const canLink = () => canManage() && Store.me.scope === 'todas';

  // =====================================================================
  // Lista de turmas
  // =====================================================================
  const LS = () => PageState.get('turmas', { q: '' });

  const rollPill = (c, today) => {
    if (!can('chamada.ver') || !Q.isSchoolDay(today) || !Q.roster(c.id).length) return '';
    const r = rollState(c.id, today);
    if (!r.total) return '';
    if (r.total === 1) return r.done ? UI.pill('Chamada feita', 'ok') : UI.pill('Chamada pendente', 'warn');
    return UI.pill(`${r.done} de ${r.total} aulas`, r.done === r.total ? 'ok' : r.done ? 'info' : 'warn');
  };

  const tile = (c, today) => {
    const st = classStats(c.id);
    const reg = Q.user(c.teacherId);
    const full = c.capacity ? (st.n / c.capacity) * 100 : 0;
    const free = c.capacity ? c.capacity - st.n : null;
    const attTone = Q.attTone(st.rate, c.id);
    return html`<a class="card tile pd-tile" href="#turmas/${c.id}">
      <div class="tile-top"><div class="grow"><h3>${c.name}</h3><div class="person-sub">${[c.shift, c.room].filter(Boolean).join(' · ')}</div></div>${c.year && Number(c.year) > Number(Q.year()) ? UI.pill(`Ano letivo ${c.year}`, 'info') : rollPill(c, today)}</div>
      <div class="pd-cap"><div class="pd-cap-row small muted"><span>${U.plural(st.n, 'aluno', 'alunos')}${c.capacity ? ` de ${c.capacity}` : ''}</span><span>${free == null ? 'vagas livres' : free > 0 ? U.plural(free, 'vaga', 'vagas') : free === 0 ? 'lotada' : `${-free} acima`}</span></div>
        ${c.capacity ? UI.meter(full, full > 100 ? 'bad' : full >= 90 ? 'warn' : '') : ''}</div>
      <div class="pd-reg small">${icon('teacher')}<span>${homeroom(c)}: <b>${reg ? U.shortName(reg.name) : 'a definir'}</b></span></div>
      <div class="tile-stats">
        <div><b>${st.n}</b><span>alunos</span></div>
        <div>${can('chamada.ver') ? html`<b class="pd-t-${attTone}">${U.pct(st.rate)}</b>` : html`<b class="muted">—</b>`}<span>frequência</span></div>
        <div>${st.parecer
          ? html`<b>${st.pareceres}<small class="muted">/${st.n}</small></b><span>pareceres</span>`
          : can('notas.ver') ? html`<b class="${gradeTone(st.avg)}">${U.num(st.avg)}</b><span>média geral</span>` : html`<b class="muted">—</b><span>média geral</span>`}</div>
      </div>
    </a>`;
  };

  const renderList = () => {
    const v = LS();
    const all = Q.classes();
    const today = U.today();
    const totalKids = all.reduce((n, c) => n + Q.roster(c.id).length, 0);
    const newBtn = canLink() ? html`<button type="button" class="btn primary" data-pd="new">${icon('plus')}Nova turma</button>` : '';
    const head = html`<div class="page-head"><div><h1>Turmas</h1><p class="lead">${all.length
      ? Store.me.scope === 'todas'
        ? `${U.plural(all.length, 'turma ativa', 'turmas ativas')} em ${Q.year()} · ${U.plural(totalKids, 'aluno', 'alunos')}. Abra uma turma para ver alunos, equipe, horário e desempenho.`
        : `${all.length === 1 ? 'A turma' : 'As turmas'} em que você atua em ${Q.year()}.`
      : ''}</p></div>${newBtn}</div>`;
    if (!all.length)
      return html`${head}<section class="card">${UI.empty({
        icon: 'layers',
        title: canLink() ? 'Nenhuma turma criada ainda' : 'Nenhuma turma para mostrar',
        text: canLink() ? 'Crie as turmas da escola. Depois matricule os alunos, defina quem dá cada disciplina e monte o horário.' : 'Você ainda não está vinculado(a) a nenhuma turma. Peça à coordenação para incluir você na equipe de uma turma.',
        action: newBtn,
      })}</section>`;
    const q = v.q.trim();
    const list = q ? all.filter((c) => U.matches(q, c.name, c.segment, c.shift, c.room, Q.userName(c.teacherId, ''))) : all;
    const groups = SEGMENTS.concat([...new Set(list.map((c) => c.segment))].filter((s) => !SEGMENTS.includes(s)))
      .map((seg) => [seg, list.filter((c) => (c.segment || 'Outro') === seg)])
      .filter(([, cs]) => cs.length);
    return html`${head}
      ${all.length > 4
        ? html`<div class="toolbar"><label class="search-box"><span class="sr-only">Buscar turma</span>${icon('search')}<input class="input" type="search" data-pd-q value="${v.q}" placeholder="Buscar turma, sala ou professor(a)…" autocomplete="off"></label>
          ${q ? html`<span class="result-count">${U.plural(list.length, 'turma encontrada', 'turmas encontradas')}</span>` : ''}</div>`
        : ''}
      ${list.length
        ? groups.map(([seg, cs]) => {
            const n = cs.reduce((t, c) => t + Q.roster(c.id).length, 0);
            const cfg = R.segmentCfg(Q.settings(), { segment: seg });
            return html`<section class="pd-group" aria-label="${seg}">
              <div class="pd-group-head"><h2>${seg}</h2><span class="muted small">${U.plural(cs.length, 'turma', 'turmas')} · ${U.plural(n, 'aluno', 'alunos')} · chamada ${cfg.attendance === 'por_aula' ? 'por aula' : 'diária'} · ${cfg.evaluation === 'parecer' ? 'parecer descritivo' : 'notas'}</span></div>
              <div class="cards">${cs.map((c) => tile(c, today))}</div>
            </section>`;
          })
        : html`<section class="card">${UI.empty({ icon: 'search', title: 'Nenhuma turma encontrada', text: `Nada encontrado para “${q}”. Confira a grafia ou limpe a busca.`, action: html`<button type="button" class="btn" data-pd="clear">Limpar busca</button>` })}</section>`}`;
  };

  const mountList = (el) => {
    const v = LS();
    const q = UI.$('[data-pd-q]', el);
    if (q) {
      q.addEventListener(
        'input',
        U.debounce(() => {
          v.q = q.value;
          App.render();
          const again = document.querySelector('[data-pd-q]');
          if (again) {
            again.focus();
            again.setSelectionRange(again.value.length, again.value.length);
          }
        }, 160),
      );
    }
    el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-pd]');
      if (!b) return;
      if (b.dataset.pd === 'new') Actions.novaTurma();
      else if (b.dataset.pd === 'clear') {
        v.q = '';
        App.render();
      }
    });
  };

  // =====================================================================
  // Página da turma
  // =====================================================================
  const TABS = [
    ['alunos', 'Alunos'],
    ['equipe', 'Equipe'],
    ['horario', 'Horário'],
    ['desempenho', 'Desempenho'],
  ];
  const tabsFor = () => TABS.filter(([id]) => id !== 'desempenho' || Store.canAny('chamada.ver', 'notas.ver'));
  const DS = () => PageState.get('turma', { day: null, minRows: {} });

  const moreItems = (c) => {
    if (!canLink()) return [];
    return [
      { label: 'Encerrar turma', icon: 'lock', hint: 'Guarda o histórico; precisa estar sem alunos ativos', fn: () => closeClass(c.id) },
      '-',
      { label: 'Excluir turma', icon: 'trash', danger: true, hint: 'Só para turma criada por engano, sem registros', fn: () => deleteClass(c.id) },
    ];
  };

  const renderDetail = (id, tabId) => {
    const c = Q.klass(id);
    if (!c)
      return html`<nav class="crumbs" aria-label="Caminho"><a href="#turmas">Turmas</a></nav>
        <section class="card">${UI.empty({ icon: 'layers', title: 'Turma não encontrada', text: 'Ela pode ter sido encerrada ou excluída, ou não está entre as turmas que você acessa.', action: html`<a class="btn primary" href="#turmas">Ver as turmas</a>` })}</section>`;
    const tabs = tabsFor();
    const tab = tabs.some(([t]) => t === tabId) ? tabId : 'alunos';
    const kids = Q.roster(c.id);
    const reg = Q.user(c.teacherId);
    const cfg = Q.segmentCfg(c.id);
    const btns = [];
    if (kids.length && can('chamada.registrar')) btns.push(html`<button type="button" class="btn" data-pd="roll">${icon('checkSquare')}<span>Fazer chamada</span></button>`);
    else if (kids.length && can('chamada.ver')) btns.push(html`<button type="button" class="btn" data-pd="roll">${icon('checkSquare')}<span>Ver chamada</span></button>`);
    if (kids.length && Store.canAny('notas.ver', 'notas.lancar')) btns.push(html`<button type="button" class="btn" data-pd="grades">${icon('grade')}<span>${cfg.evaluation === 'parecer' ? 'Pareceres' : 'Notas'}</span></button>`);
    if (canManage()) btns.push(html`<button type="button" class="btn" data-pd="edit">${icon('pencil')}<span>Editar</span></button>`);
    if (moreItems(c).length) btns.push(html`<button type="button" class="icon-btn" data-pd="more" aria-label="Mais ações da turma" aria-haspopup="menu">${icon('dots')}</button>`);
    let body;
    try {
      body = tab === 'equipe' ? tabEquipe(c) : tab === 'horario' ? tabHorario(c) : tab === 'desempenho' ? tabDesempenho(c) : tabAlunos(c);
    } catch (err) {
      console.error(err);
      body = UI.empty({ icon: 'alert', title: 'Não foi possível abrir esta parte', text: 'Tente outra aba ou volte mais tarde.' });
    }
    return html`
      <nav class="crumbs" aria-label="Caminho"><a href="#turmas">Turmas</a>${icon('chevronRight')}<span aria-current="page">${c.name}</span></nav>
      <section class="card pd-head">
        <div class="pd-head-main">
          <div class="grow">
            <div class="eyebrow">${c.segment || 'Turma'}${c.year && String(c.year) !== Q.year() ? ` · ano letivo ${c.year}` : ''}</div>
            <h1>${c.name}</h1>
            <div class="meta-row">
              ${c.shift ? html`<span>${icon('sunrise')}${c.shift}</span>` : ''}
              ${c.room ? html`<span>${icon('door')}${c.room}</span>` : ''}
              <span>${icon('users')}${U.plural(kids.length, 'aluno', 'alunos')}${c.capacity ? ` de ${c.capacity} vagas` : ''}</span>
              <span>${icon('teacher')}${homeroom(c)}: ${reg ? reg.name : html`<span class="muted">a definir</span>`}</span>
            </div>
            <div class="pd-modes small muted">Chamada ${cfg.attendance === 'por_aula' ? 'por aula' : 'diária'} · ${cfg.evaluation === 'parecer' ? 'avaliação por parecer descritivo' : 'avaliação por notas'} · frequência mínima ${cfg.minAttendance}%</div>
          </div>
          ${btns.length ? html`<div class="btn-row pd-head-actions">${btns}</div>` : ''}
        </div>
      </section>
      <div class="tabs pd-tabs" role="tablist" aria-label="Partes da turma">${tabs.map(
        ([t, label]) => html`<button type="button" role="tab" id="pd-tab-${t}" data-pd-tab="${t}" aria-controls="pd-panel" aria-selected="${tf(t === tab)}" tabindex="${t === tab ? '0' : '-1'}">${label}${t === 'alunos' ? html` <span class="pd-count">${kids.length}</span>` : ''}</button>`,
      )}</div>
      <div id="pd-panel" class="pd-panel" role="tabpanel" aria-labelledby="pd-tab-${tab}">${body}</div>`;
  };

  // ---------- aba Alunos ----------
  const tabAlunos = (c) => {
    const kids = Q.roster(c.id);
    const showAtt = can('chamada.ver');
    const parecer = Q.evaluation(c.id) === 'parecer';
    const showAvg = can('notas.ver') && !parecer;
    const streaks = showAtt ? absenceStreaks(c.id) : new Map();
    const alert = absenceAlert();
    const idx = showAtt ? idxYear() : null;
    const btns = [];
    if (kids.length) btns.push(html`<button type="button" class="btn" data-pd="export">${icon('download')}<span>Exportar lista</span></button>`);
    if (typeof Actions.convidarFamilias === 'function' && can('familias.acessos') && kids.length) btns.push(html`<button type="button" class="btn" data-pd="invite">${icon('send')}<span>Convidar famílias</span></button>`);
    if (typeof Actions.matricular === 'function' && can('alunos.cadastrar')) btns.push(html`<button type="button" class="btn primary" data-pd="enroll">${icon('userPlus')}<span>Matricular aluno</span></button>`);
    if (!kids.length)
      return html`<section class="card">${UI.empty({
        icon: 'users',
        title: 'Turma sem alunos',
        text: can('alunos.cadastrar') ? 'Matricule alunos nesta turma, ou troque a turma de alunos já cadastrados pela ficha de cada um.' : 'Ainda não há alunos ativos nesta turma.',
        action: btns.length ? html`${btns}` : '',
      })}</section>`;
    return html`<div class="toolbar"><span class="grow result-count">${U.plural(kids.length, 'aluno ativo', 'alunos ativos')} em ordem alfabética (número de chamada)</span>${btns}</div>
      <section class="card"><div class="table-wrap"><table class="table responsive pd-roster">
        <thead><tr><th class="num hide-sm">Nº</th><th>Aluno</th>${showAtt ? html`<th class="num">Frequência</th>` : ''}${showAvg ? html`<th class="num">Média</th>` : ''}</tr></thead>
        <tbody>${kids.map((s, i) => {
          const rate = showAtt ? R.rateOf(idx.get(s.id)) : null;
          const avg = showAvg ? studentAverage(s.id, c.id) : null;
          const streak = streaks.get(s.id) || 0;
          return html`<tr class="clickable" data-pd-go="${s.id}">
            <td class="num muted hide-sm">${i + 1}</td>
            <td class="first"><div class="person">${UI.avatar(s.name, 'sm', s.photo)}<div>
              <a class="person-name" href="#alunos/${s.id}">${s.name}</a>
              <div class="pd-flags">${can('alunos.alertas') && s.alerts ? html`<span class="pill bad plain" title="${s.alerts}">${icon('heart')}Alerta de saúde</span>` : ''}${streak >= alert ? html`<span class="pill bad plain">${U.plural(streak, 'falta seguida', 'faltas seguidas')}</span>` : ''}</div>
            </div></div></td>
            ${showAtt ? html`<td class="num" data-l="Frequência"><div class="mini-bar">${rate == null ? html`<span class="muted">—</span>` : html`${UI.meter(rate, Q.attTone(rate, c.id))}<span>${U.pct(rate)}</span>`}</div></td>` : ''}
            ${showAvg ? html`<td class="num end ${gradeTone(avg)}" data-l="Média">${U.num(avg)}</td>` : ''}
          </tr>`;
        })}</tbody></table></div></section>`;
  };

  const exportRoster = (c) => {
    const kids = Q.roster(c.id);
    const contatos = can('alunos.contatos');
    const showAtt = can('chamada.ver');
    const showAvg = can('notas.ver') && Q.evaluation(c.id) !== 'parecer';
    const head = ['Nº', 'Aluno', 'Matrícula', 'Nascimento'];
    if (showAtt) head.push('Frequência (%)');
    if (showAvg) head.push('Média');
    if (contatos) head.push('Responsável', 'Telefone', 'E-mail');
    const rows = kids.map((s, i) => {
      const r = [i + 1, s.name, s.enrollment, U.fmtDate(s.birth)];
      if (showAtt) {
        const rate = Q.attendanceRate(s.id);
        r.push(rate == null ? '' : Math.round(rate));
      }
      if (showAvg) {
        const a = studentAverage(s.id, c.id);
        r.push(a == null ? '' : U.num(a));
      }
      if (contatos) {
        const g = Q.mainGuardian(s);
        r.push(g ? g.name : '', g ? g.phone || '' : '', g ? g.email || '' : '');
      }
      return r;
    });
    U.download(`${U.slug(c.name)}-alunos.csv`, U.toCSV([head, ...rows]));
    UI.toast('Lista exportada (planilha CSV)', { ic: 'download' });
  };

  // ---------- aba Equipe ----------
  const tabEquipe = (c) => {
    const edit = canLink();
    const subjEdit = canManage();
    const reg = Q.user(c.teacherId);
    const assistants = (c.assistantIds || []).map((id) => Q.user(id) || { id, name: 'Pessoa sem acesso' });
    const counts = {};
    (c.schedule || []).flat().forEach((x) => x && (counts[x] = (counts[x] || 0) + 1));
    const all = Store.state.subjects.slice();
    const inClass = (sid) => Object.prototype.hasOwnProperty.call(c.subjects || {}, sid);
    const list = subjEdit ? all : all.filter((s) => inClass(s.id));
    const person = (u, sub) => (u ? html`<div class="person">${UI.avatar(u.name, 'sm')}<div><span class="person-name">${u.name}</span>${sub ? html`<span class="person-sub">${sub}</span>` : ''}</div></div>` : html`<span class="muted">A definir</span>`);
    return html`
      ${!edit && canManage() ? html`<div class="notice">${icon('info')}<span class="grow">Quem dá aula em cada turma é definido por quem enxerga todas as turmas (direção ou coordenação). Você pode ajustar as disciplinas e o horário.</span></div>` : ''}
      <div class="pd-team">
        <section class="card">
          <div class="card-head"><h2>Responsáveis pela turma</h2></div>
          <div class="card-body pd-team-body">
            <div class="pd-team-row">
              <div class="pd-team-label"><b>${homeroom(c) === 'Regente' ? 'Professor(a) regente' : 'Professor(a) conselheiro(a)'}</b><span class="small muted">${homeroom(c) === 'Regente' ? 'Acompanha a turma no dia a dia, faz a chamada diária e escreve os pareceres.' : 'Acompanha a turma e conduz o conselho de classe.'}</span></div>
              ${edit
                ? html`<label class="sr-only" for="pd-reg">${homeroom(c)}</label><select id="pd-reg" class="input pd-select" data-pd-assign="regente"><option value="">— A definir —</option>${personOptions(c.teacherId, teacherGroups(null))}</select>`
                : person(reg, reg ? reg.title || Q.roleLabel(reg.role) : '')}
            </div>
            <div class="pd-team-row">
              <div class="pd-team-label"><b>Auxiliares</b><span class="small muted">Apoiam a turma: veem os alunos, a agenda e podem registrar a rotina e a chamada diária.</span></div>
              <div class="pd-aux">
                ${assistants.length
                  ? html`<ul class="pd-aux-list">${assistants.map((u) => html`<li>${UI.avatar(u.name, 'sm')}<span class="grow"><span class="person-name">${u.name}</span><span class="person-sub">${u.title || Q.roleLabel(u.role)}</span></span>${edit && u.id !== Store.me.id ? html`<button type="button" class="icon-btn sm" data-pd-aux-del="${u.id}" aria-label="Tirar ${u.name} da turma">${icon('x')}</button>` : ''}</li>`)}</ul>`
                  : html`<p class="muted small">Nenhum(a) auxiliar nesta turma.</p>`}
                ${edit
                  ? html`<label class="sr-only" for="pd-aux-add">Adicionar auxiliar</label><select id="pd-aux-add" class="input pd-select" data-pd-aux-add><option value="">+ Adicionar auxiliar…</option>${personOptions(null, assistantCandidates(c))}</select>`
                  : ''}
              </div>
            </div>
          </div>
        </section>
        <section class="card">
          <div class="card-head"><div><h2>Disciplinas e professores</h2><span class="sub">${subjEdit ? 'Marque as disciplinas que a turma tem e escolha quem dá cada uma. Tudo é salvo na hora.' : 'Quem dá cada disciplina nesta turma.'}</span></div></div>
          ${list.length
            ? html`<div class="table-wrap"><table class="table pd-subj">
              <thead><tr><th>Disciplina</th><th>Professor(a)</th><th class="num hide-sm">Aulas no horário</th></tr></thead>
              <tbody>${list.map((s) => {
                const on = inClass(s.id);
                const t = on ? Q.user(c.subjects[s.id]) : null;
                const n = counts[s.id] || 0;
                return html`<tr class="${on ? '' : 'pd-off'}">
                  <td>${subjEdit
                    ? html`<label class="check pd-subj-check"><input type="checkbox" data-pd-subj="${s.id}" ${on ? raw('checked') : ''}><span class="subject-tag"><span class="swatch c${s.color}"></span>${s.name}</span></label>`
                    : html`<span class="subject-tag"><span class="swatch c${s.color}"></span>${s.name}</span>`}</td>
                  <td>${!on
                    ? html`<span class="small muted">Não faz parte da turma</span>`
                    : edit
                      ? html`<select class="input pd-select" data-pd-assign="${s.id}" aria-label="Professor(a) de ${s.name}"><option value="">— Sem professor(a) —</option>${personOptions(c.subjects[s.id], teacherGroups(s.id))}</select>`
                      : t ? html`<span>${t.name}</span>` : html`<span class="muted">${c.teacherId && homeroom(c) === 'Regente' ? `Regente (${U.shortName(Q.userName(c.teacherId))})` : 'Sem professor(a)'}</span>`}</td>
                  <td class="num hide-sm">${on ? html`<span class="${s.weekly && n !== s.weekly ? 'pd-t-warn' : ''}" title="${s.weekly ? `Previsto: ${s.weekly} por semana` : ''}">${n}${s.weekly ? html`<span class="muted"> / ${s.weekly}</span>` : ''}</span>` : ''}</td>
                </tr>`;
              })}</tbody></table></div>`
            : html`<div class="card-body">${UI.empty({ icon: 'book', title: 'Nenhuma disciplina', text: 'Esta turma ainda não tem disciplinas.' })}</div>`}
          ${homeroom(c) === 'Regente' ? html`<p class="small muted pd-foot-note">Disciplinas sem professor(a) ficam com a regente: ela lança as notas dessas disciplinas.</p>` : ''}
        </section>
      </div>`;
  };

  // ---------- aba Horário ----------
  const scheduleRows = (c) => {
    const sched = c.schedule || [];
    let last = 0;
    sched.forEach((d) => (d || []).forEach((x, i) => x && (last = Math.max(last, i + 1))));
    return Math.min(10, Math.max(5, last, DS().minRows[c.id] || 0));
  };
  const slotHTML = (c, di, pi, edit, subs) => {
    const sid = ((c.schedule || [])[di] || [])[pi] || '';
    const s = sid ? Q.subject(sid) : null;
    const t = s ? Q.user((c.subjects || {})[sid]) : null;
    const who = s ? (t ? U.shortName(t.name) : homeroom(c) === 'Regente' && c.teacherId ? U.shortName(Q.userName(c.teacherId)) : 'sem professor(a)') : '';
    const label = `${DAYS[di]}, ${pi + 1}ª aula`;
    if (!edit)
      return html`<div class="slot pd-slot ${s ? '' : 'pd-slot-empty'}" style="${s ? `--c:var(--cat-${s.color})` : ''}"><span class="pd-slot-name">${s ? s.name : 'Vago'}</span><small>${who || raw('&nbsp;')}</small></div>`;
    return html`<div class="slot pd-slot ${s ? '' : 'pd-slot-empty'}" style="${s ? `--c:var(--cat-${s.color})` : ''}">
      <select data-pd-slot="${di}-${pi}" aria-label="${label}"><option value="">Vago</option>${subs.map((x) => html`<option value="${x.id}" ${x.id === sid ? raw('selected') : ''}>${x.name}</option>`)}</select>
      <small>${who || raw('&nbsp;')}</small></div>`;
  };
  const legendHTML = (c) => {
    const counts = {};
    (c.schedule || []).flat().forEach((x) => x && (counts[x] = (counts[x] || 0) + 1));
    return Q.classSubjects(c.id).map((s) => {
      const n = counts[s.id] || 0;
      const off = s.weekly && n !== s.weekly;
      return html`<span class="${off ? 'pd-legend-off' : ''}" title="${s.weekly ? `Previsto: ${s.weekly} aula(s) por semana` : ''}"><span class="swatch c${s.color}"></span>${s.name}: <b>${n}${s.weekly ? html`<small class="muted">/${s.weekly}</small>` : ''}</b></span>`;
    });
  };
  const tabHorario = (c) => {
    const edit = canManage();
    const subs = Q.classSubjects(c.id);
    const rows = scheduleRows(c);
    const ds = DS();
    const todayWd = U.weekday(U.today());
    const day = ds.day != null ? ds.day : todayWd >= 1 && todayWd <= 5 ? todayWd - 1 : 0;
    const mode = Q.attendanceMode(c.id);
    if (!subs.length)
      return html`<section class="card">${UI.empty({ icon: 'calendar', title: 'A turma ainda não tem disciplinas', text: 'Inclua as disciplinas na aba Equipe para montar o horário.', action: html`<button type="button" class="btn primary" data-pd-tab="equipe">Ir para Equipe</button>` })}</section>`;
    return html`
      <div class="notice ${mode === 'por_aula' ? '' : 'pd-notice-soft'}">${icon('info')}<span class="grow">${mode === 'por_aula'
        ? html`A chamada desta turma é <b>por aula</b> e segue este horário: cada professor(a) registra as próprias aulas.`
        : html`A chamada desta turma é <b>diária</b>. O horário serve de referência para a equipe e para as famílias.`}${edit ? ' Escolha a disciplina de cada aula; salva na hora.' : ''}</span></div>
      <section class="card card-pad pd-tt-wide">
        <div class="table-wrap"><table class="timetable pd-timetable">
          <thead><tr><th><span class="sr-only">Aula</span></th>${DAYS.map((d, i) => html`<th class="${i === todayWd - 1 ? 'pd-today' : ''}">${d}</th>`)}</tr></thead>
          <tbody>${Array.from({ length: rows }, (_, pi) => html`<tr><th class="period">${pi + 1}ª</th>${DAYS.map((d, di) => html`<td>${slotHTML(c, di, pi, edit, subs)}</td>`)}</tr>`)}</tbody>
        </table></div>
        ${edit && rows < 10 ? html`<button type="button" class="btn sm ghost pd-add-row" data-pd="addrow">${icon('plus')}Adicionar uma aula por dia</button>` : ''}
      </section>
      <section class="card card-pad pd-tt-narrow">
        <div class="seg pd-days" role="group" aria-label="Dia da semana">${DAYS_SHORT.map((d, i) => html`<button type="button" data-pd-day="${i}" aria-pressed="${tf(i === day)}">${d}</button>`)}</div>
        <ol class="pd-day-list">${Array.from({ length: rows }, (_, pi) => html`<li><span class="pd-day-n">${pi + 1}ª</span>${slotHTML(c, day, pi, edit, subs)}</li>`)}</ol>
        ${edit && rows < 10 ? html`<button type="button" class="btn sm ghost pd-add-row" data-pd="addrow">${icon('plus')}Adicionar uma aula por dia</button>` : ''}
      </section>
      <div class="legend pd-legend" aria-label="Aulas por semana">${legendHTML(c)}</div>`;
  };

  // ---------- aba Desempenho ----------
  const hbars = (rows, { ref, fmt, max = 10, lowTone }) =>
    html`<div class="hbars">${rows.map((r) => {
      const v = r.value;
      const low = v != null && lowTone(v);
      return html`<div class="hbar" data-tip="${r.label}: ${v == null ? 'sem registros' : fmt(v)}"><span class="pd-hbar-label">${r.label}</span><div class="track"><div class="fill ${low ? 'low' : ''}" style="width:${v == null ? 0 : U.clamp((v / max) * 100, 0, 100)}%"></div>${ref != null ? html`<div class="line" style="left:${U.clamp((ref / max) * 100, 0, 100)}%"></div>` : ''}</div><span class="v ${low ? 'pd-g-bad' : ''}">${v == null ? '—' : fmt(v)}</span></div>`;
    })}</div>`;

  const tabDesempenho = (c) => {
    const st = Q.settings();
    const stats = classStats(c.id);
    const showAtt = can('chamada.ver');
    const showGr = can('notas.ver');
    const parecer = stats.parecer;
    const subs = Q.classSubjects(c.id);
    const kids = Q.roster(c.id);
    const min = Q.minAttendance(c.id);
    const risk = atRisk(c.id);
    const term = Q.currentTerm();
    const kpis = [];
    if (showGr && !parecer) kpis.push(html`<div class="card kpi"><span class="kpi-label">${icon('grade')}Média geral</span><span class="kpi-value ${gradeTone(stats.avg)}">${U.num(stats.avg)}</span><span class="kpi-foot">média para aprovação: ${U.num(st.passing)}</span></div>`);
    if (showGr && parecer) kpis.push(html`<div class="card kpi"><span class="kpi-label">${icon('pencil')}Pareceres do ${Q.termLabel(term)}</span><span class="kpi-value">${stats.pareceres}<small> de ${stats.n}</small></span>${UI.meter(stats.n ? (stats.pareceres / stats.n) * 100 : 0, stats.pareceres === stats.n ? 'ok' : '')}</div>`);
    if (showAtt) {
      kpis.push(html`<div class="card kpi"><span class="kpi-label">${icon('checkSquare')}Frequência no ano</span><span class="kpi-value">${U.pct(stats.rate)}</span>${UI.meter(stats.rate, Q.attTone(stats.rate, c.id))}<span class="kpi-foot">mínimo ${min}%</span></div>`);
      kpis.push(html`<div class="card kpi"><span class="kpi-label">${icon('clock')}Últimos 30 dias</span><span class="kpi-value">${U.pct(stats.recent)}</span><span class="kpi-foot">de presença</span></div>`);
    }
    kpis.push(html`<div class="card kpi"><span class="kpi-label">${icon('alert')}Precisam de atenção</span><span class="kpi-value ${risk.length ? 'pd-g-bad' : ''}">${risk.length}</span><span class="kpi-foot">de ${U.plural(kids.length, 'aluno', 'alunos')}</span></div>`);
    const subjAvg = showGr && !parecer ? subs.map((s) => ({ label: s.name, value: U.avg(kids.map((k) => Q.subjectAverage(k.id, s.id)).filter((v) => v != null)) })) : [];
    const subjAtt = showAtt && Q.attendanceMode(c.id) === 'por_aula' ? subjectAttendance(c.id) : [];
    return html`
      <div class="kpis">${kpis}</div>
      <div class="grid-2">
        <div class="stack">
          ${subjAvg.length
            ? html`<section class="card"><div class="card-head"><h2>Média por disciplina</h2><span class="sub">No ano · a linha marca a média ${U.num(st.passing)}</span></div>
              <div class="card-body">${hbars(subjAvg, { ref: st.passing, fmt: (v) => U.num(v), lowTone: (v) => v < st.passing })}</div></section>`
            : ''}
          ${subjAtt.length
            ? html`<section class="card"><div class="card-head"><h2>Frequência por disciplina</h2><span class="sub">A linha marca o mínimo de ${min}%</span></div>
              <div class="card-body">${hbars(
                subjAtt.map((x) => ({ label: (Q.subject(x.subjectId) || {}).name || 'Disciplina', value: x.rate })).sort((a, b) => a.label.localeCompare(b.label, 'pt-BR')),
                { ref: min, max: 100, fmt: (v) => U.pct(v), lowTone: (v) => v < min },
              )}</div></section>`
            : ''}
          ${!subjAvg.length && !subjAtt.length
            ? html`<section class="card">${UI.empty({ icon: 'chart', title: parecer ? 'Avaliação por parecer' : 'Sem dados ainda', text: parecer ? 'Na Educação Infantil não há médias: acompanhe os pareceres descritivos de cada criança e a frequência.' : 'Quando houver notas e chamadas registradas, os gráficos aparecem aqui.' })}</section>`
            : ''}
        </div>
        <section class="card"><div class="card-head"><h2>Alunos que precisam de atenção</h2></div>
          <div class="card-body">${risk.length
            ? html`<ul class="items">${risk.slice(0, 12).map(
                (x) => html`<li>${UI.avatar(x.s.name, 'sm', x.s.photo)}<div class="grow"><a class="person-name" href="#alunos/${x.s.id}">${x.s.name}</a><div class="pd-flags">${x.reasons.map((r) => UI.pill(r.label, r.tone))}</div></div></li>`,
              )}</ul>${risk.length > 12 ? html`<p class="small muted">e mais ${risk.length - 12}.</p>` : ''}`
            : html`<p class="pd-ok">${icon('checkCircle')}<span>Ninguém com média abaixo de ${U.num(st.passing)}, frequência abaixo de ${min}% ou ${absenceAlert()} faltas seguidas.</span></p>`}</div>
        </section>
      </div>`;
  };

  // ---------- eventos da página da turma ----------
  const switchTab = (id, tab) => {
    const y = window.scrollY;
    history.replaceState(null, '', `#turmas/${id}/${tab}`);
    App.render();
    window.scrollTo(0, y);
    const b = document.querySelector(`[data-pd-tab="${CSS.escape(tab)}"]`);
    b && b.focus({ preventScroll: true });
  };

  const mountDetail = (el, id) => {
    const c0 = Q.klass(id);
    if (!c0) return;
    const fresh = () => Q.klass(id);
    const tabList = UI.$('.pd-tabs', el);
    tabList &&
      tabList.addEventListener('keydown', (e) => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
        const btns = UI.$$('[data-pd-tab]', tabList);
        const i = btns.indexOf(document.activeElement);
        if (i < 0) return;
        e.preventDefault();
        const j = e.key === 'Home' ? 0 : e.key === 'End' ? btns.length - 1 : (i + (e.key === 'ArrowRight' ? 1 : -1) + btns.length) % btns.length;
        switchTab(id, btns[j].dataset.pdTab);
      });
    el.addEventListener('click', (e) => {
      const t = e.target.closest('[data-pd-tab]');
      if (t) {
        if (t.getAttribute('aria-selected') !== 'true') switchTab(id, t.dataset.pdTab);
        return;
      }
      const row = e.target.closest('tr[data-pd-go]');
      if (row && !e.target.closest('a, button, input, select')) return App.go('alunos/' + row.dataset.pdGo);
      const dayBtn = e.target.closest('[data-pd-day]');
      if (dayBtn) {
        DS().day = Number(dayBtn.dataset.pdDay);
        App.render();
        return;
      }
      const auxDel = e.target.closest('[data-pd-aux-del]');
      if (auxDel) {
        const c = fresh();
        const u = Q.user(auxDel.dataset.pdAuxDel);
        UI.act('classes.assistants', { classId: c.id, userIds: (c.assistantIds || []).filter((x) => x !== auxDel.dataset.pdAuxDel) }, { btn: auxDel, ok: `${u ? U.shortName(u.name) : 'Auxiliar'} saiu da equipe do ${c.name}` });
        return;
      }
      const b = e.target.closest('[data-pd]');
      if (!b) return;
      const c = fresh();
      if (!c) return;
      const a = b.dataset.pd;
      if (a === 'roll') Actions.fazerChamada(c.id);
      else if (a === 'grades') Actions.abrirNotas ? Actions.abrirNotas(c.id) : App.go('notas');
      else if (a === 'edit') Actions.editarTurma(c.id);
      else if (a === 'more') UI.menu(b, moreItems(c));
      else if (a === 'export') exportRoster(c);
      else if (a === 'invite') Actions.convidarFamilias && Actions.convidarFamilias(c.id);
      else if (a === 'enroll') Actions.matricular && Actions.matricular({ classId: c.id });
      else if (a === 'addrow') {
        DS().minRows[c.id] = scheduleRows(c) + 1;
        App.render();
      }
    });
    el.addEventListener('change', async (e) => {
      const c = fresh();
      if (!c) return;
      const as = e.target.closest('[data-pd-assign]');
      if (as) {
        const slot = as.dataset.pdAssign;
        const userId = as.value || null;
        const u = userId ? Q.user(userId) : null;
        const sub = slot === 'regente' ? null : Q.subject(slot);
        const msg = slot === 'regente' ? `${homeroom(c)} do ${c.name}: ${u ? u.name : 'a definir'}` : `${sub ? sub.name : 'Disciplina'} no ${c.name}: ${u ? u.name : 'sem professor(a)'}`;
        as.disabled = true;
        const res = await UI.act('classes.assign', { classId: c.id, slot, userId }, { ok: msg });
        as.disabled = false;
        if (!res) as.value = slot === 'regente' ? c.teacherId || '' : (c.subjects || {})[slot] || '';
        return;
      }
      const add = e.target.closest('[data-pd-aux-add]');
      if (add) {
        if (!add.value) return;
        const u = Q.user(add.value);
        add.disabled = true;
        const res = await UI.act('classes.assistants', { classId: c.id, userIds: [...(c.assistantIds || []), add.value] }, { ok: `${u ? U.shortName(u.name) : 'Auxiliar'} entrou na equipe do ${c.name}` });
        add.disabled = false;
        if (!res) add.value = '';
        return;
      }
      const subj = e.target.closest('[data-pd-subj]');
      if (subj) {
        const sid = subj.dataset.pdSubj;
        const sub = Q.subject(sid);
        const enabled = subj.checked;
        if (!enabled) {
          const n = (c.schedule || []).flat().filter((x) => x === sid).length;
          const t = Q.user((c.subjects || {})[sid]);
          const effects = [];
          if (n) effects.push(`${U.plural(n, 'aula sai', 'aulas saem')} do horário`);
          if (t) effects.push(`${U.shortName(t.name)} deixa de dar ${sub.name} nesta turma`);
          const ok = await UI.confirm({
            title: `Retirar ${sub.name} do ${c.name}?`,
            text: html`${effects.length ? html`<p>${U.cap(effects.join(' e '))}.</p>` : ''}<p style="margin-top:8px">As notas já lançadas continuam guardadas. Para voltar, marque a disciplina de novo (o professor e o horário precisam ser refeitos).</p>`,
            ok: 'Retirar disciplina',
            danger: true,
          });
          if (!ok) {
            subj.checked = true;
            return;
          }
        }
        subj.disabled = true;
        const res = await UI.act('classes.subject', { classId: c.id, subjectId: sid, enabled }, { ok: `${sub.name} ${enabled ? 'incluída no' : 'retirada do'} ${c.name}` });
        subj.disabled = false;
        if (!res) subj.checked = !enabled;
        return;
      }
      const slot = e.target.closest('[data-pd-slot]');
      if (slot) {
        const [di, pi] = slot.dataset.pdSlot.split('-').map(Number);
        const before = ((c.schedule || [])[di] || [])[pi] || '';
        const sid = slot.value;
        // atualiza a célula na hora (a tela só é redesenhada quando o foco sair do campo)
        const paint = (value) => {
          const s = value ? Q.subject(value) : null;
          UI.$$(`[data-pd-slot="${di}-${pi}"]`, el).forEach((sel) => {
            sel.value = value;
            const box = sel.closest('.slot');
            box.style.cssText = s ? `--c:var(--cat-${s.color})` : '';
            box.classList.toggle('pd-slot-empty', !s);
            const t = s ? Q.user((c.subjects || {})[value]) : null;
            box.querySelector('small').textContent = s ? (t ? U.shortName(t.name) : homeroom(c) === 'Regente' && c.teacherId ? U.shortName(Q.userName(c.teacherId)) : 'sem professor(a)') : ' ';
          });
        };
        paint(sid);
        const res = await UI.act('classes.slot', { classId: c.id, day: di, period: pi, subjectId: sid });
        if (!res) paint(before);
        else {
          const legend = UI.$('.pd-legend', el);
          legend && UI.setHTML(legend, legendHTML(Q.klass(id)));
        }
      }
    });
  };

  // =====================================================================
  // Criar, editar, encerrar e excluir
  // =====================================================================
  const segHint = (seg) => {
    const cfg = R.segmentCfg(Q.settings(), { segment: seg });
    return `Chamada ${cfg.attendance === 'por_aula' ? 'por aula' : 'diária'} · avaliação por ${cfg.evaluation === 'parecer' ? 'parecer descritivo' : 'notas'} · frequência mínima ${cfg.minAttendance}%`;
  };
  const classDefs = (c) => {
    const y = Number(Q.year());
    const n = c ? Q.roster(c.id).length : 0;
    return [
      {
        name: 'name',
        label: 'Nome da turma',
        required: true,
        placeholder: 'Ex.: 6º ano A',
        full: true,
        maxlength: 60,
        check: (v) => {
          const dup = Store.state.classes.find((x) => x.status !== 'encerrada' && U.norm(x.name) === U.norm(v) && (!c || x.id !== c.id));
          return dup ? 'Já existe uma turma ativa com esse nome.' : '';
        },
      },
      { name: 'segment', label: 'Etapa de ensino', type: 'select', required: true, options: SEGMENTS.map((s) => [s, s]), hint: segHint((c && c.segment) || 'Fundamental I'), full: true },
      { name: 'shift', label: 'Turno', type: 'chips', required: true, options: SHIFTS.map((s) => [s, s]), full: true },
      { name: 'room', label: 'Sala', placeholder: 'Ex.: Sala 11', maxlength: 40 },
      {
        name: 'capacity',
        label: 'Vagas',
        type: 'number',
        min: 0,
        max: 500,
        hint: 'Use 0 para não controlar vagas.',
        check: (v) => (v && n && v < n ? `A turma já tem ${n} alunos ativos. Use pelo menos ${n} (ou 0).` : ''),
      },
      !c && canLink() ? { name: 'teacherId', label: 'Professor(a) regente ou conselheiro(a)', type: 'select', full: true, options: [['', 'Definir depois'], ...Q.staff().filter((u) => teaches(u) && u.id !== Store.me.id).map((u) => [u.id, u.name + (u.title ? ` — ${u.title}` : '')])] } : null,
      !c ? { name: 'year', label: 'Ano letivo', type: 'select', options: [[String(y), String(y)], [String(y + 1), `${y + 1} (próximo ano)`]], hint: 'Turmas do próximo ano servem para a virada do ano letivo.' } : null,
    ].filter(Boolean);
  };
  const bindSegHint = (el) => {
    const sel = UI.$('#f-segment', el);
    const hint = UI.$('#f-segment-hint', el);
    if (sel && hint) sel.addEventListener('change', () => (hint.textContent = segHint(sel.value)));
  };

  Actions.novaTurma = (preset = {}) => {
    if (!canLink()) return UI.toast('Só quem enxerga todas as turmas pode criar turmas.', { tone: 'bad' });
    UI.formDrawer({
      title: 'Nova turma',
      sub: 'Todas as disciplinas da escola entram na turma com um horário inicial. Depois você ajusta a equipe e o horário.',
      defs: classDefs(null),
      values: { segment: 'Fundamental I', shift: 'Manhã', capacity: 25, year: Q.year(), ...preset },
      submitLabel: 'Criar turma',
      onMount: (el) => bindSegHint(el),
      async onSubmit(d, api, form) {
        const input = { name: d.name, segment: d.segment, shift: d.shift, room: d.room, capacity: d.capacity || 0, year: Number(d.year) || undefined };
        if (d.teacherId) input.teacherId = d.teacherId;
        const res = await UI.act('classes.save', input, { form });
        if (!res) return false;
        api.close();
        UI.toast(`Turma ${d.name} criada. Agora defina a equipe e o horário.`, { ic: 'layers' });
        App.go(`turmas/${res.result.id}/equipe`);
        return true;
      },
    });
  };

  Actions.editarTurma = (id) => {
    const c = Q.klass(id);
    if (!c || !canManage()) return;
    UI.formDrawer({
      title: 'Editar turma',
      sub: c.name,
      defs: classDefs(c),
      values: { name: c.name, segment: c.segment || 'Outro', shift: c.shift, room: c.room, capacity: c.capacity || 0 },
      submitLabel: 'Salvar alterações',
      top: Q.roster(c.id).length ? html`<div class="notice warn pd-drawer-note">${icon('alert')}<span class="grow">Mudar a etapa de ensino muda a forma de chamada e de avaliação desta turma.</span></div>` : '',
      onMount: (el) => bindSegHint(el),
      async onSubmit(d, api, form) {
        const res = await UI.act('classes.save', { id: c.id, name: d.name, segment: d.segment, shift: d.shift, room: d.room, capacity: d.capacity || 0 }, { form, ok: 'Turma atualizada' });
        return res ? true : false;
      },
    });
  };

  const closeClass = async (id) => {
    const c = Q.klass(id);
    if (!c) return;
    const n = Q.roster(c.id).length;
    if (n) {
      UI.modal({
        title: `Encerrar o ${c.name}`,
        size: 'sm',
        body: html`<p>A turma ainda tem <b>${U.plural(n, 'aluno ativo', 'alunos ativos')}</b>. Antes de encerrar, troque esses alunos de turma (na ficha de cada um) ou faça a virada do ano letivo.</p><p class="muted small" style="margin-top:10px">Encerrar guarda a turma no histórico: chamadas, notas e agenda continuam registradas.</p>`,
        foot: html`<button type="button" class="btn" data-close>Fechar</button><a class="btn primary" href="#turmas/${c.id}/alunos" data-close>Ver alunos da turma</a>`,
      });
      return;
    }
    const res = await UI.act('classes.close', { id: c.id }, { ok: `Turma ${c.name} encerrada` });
    if (res) App.go('turmas');
  };

  const hasHistory = (c) => {
    const prefix = c.id + '|';
    const st = Store.state;
    return st.students.some((s) => s.classId === c.id) || Object.keys(st.attendance).some((k) => k.startsWith(prefix)) || st.diary.some((d) => d.classId === c.id) || Object.keys(st.routines).some((k) => k.startsWith(prefix));
  };
  const deleteClass = async (id) => {
    const c = Q.klass(id);
    if (!c) return;
    if (hasHistory(c)) {
      UI.modal({
        title: 'Esta turma não pode ser excluída',
        size: 'sm',
        body: html`<p>O <b>${c.name}</b> já tem alunos ou registros (chamadas, agenda ou rotina). Excluir apagaria esse histórico.</p><p style="margin-top:10px">Use <b>Encerrar turma</b>: ela sai das listas e o histórico fica guardado.</p>`,
        foot: html`<button type="button" class="btn" data-close>Entendi</button>`,
      });
      return;
    }
    const ok = await UI.confirm({ title: `Excluir o ${c.name}?`, text: 'A turma foi criada por engano e não tem registros. A exclusão não pode ser desfeita.', ok: 'Excluir turma', danger: true });
    if (!ok) return;
    const res = await UI.act('classes.delete', { id: c.id }, { ok: `Turma ${c.name} excluída` });
    if (res) App.go('turmas');
  };

  /** Abre a chamada de uma turma (opts: {date, period}). */
  Actions.fazerChamada = (classId, opts = {}) => {
    const v = PageState.get('chamada', {});
    if (classId) v.classId = classId;
    if (opts.date) v.date = opts.date;
    v.period = opts.period != null ? Number(opts.period) : null;
    App.go('chamada');
  };

  // =====================================================================
  // Registro
  // =====================================================================
  App.page({
    id: 'turmas',
    label: 'Turmas',
    icon: 'layers',
    group: 'Alunos e turmas',
    order: 20,
    anyPerm: ['turmas.ver', 'turmas.gerenciar'],
    keys: 'classes salas horário professores disciplinas equipe',
    title: (rest) => (rest[0] && Q.klass(rest[0]) ? Q.klass(rest[0]).name : 'Turmas'),
    render: (rest) => (rest[0] ? renderDetail(rest[0], rest[1]) : renderList()),
    mount: (el, rest) => (rest[0] ? mountDetail(el, rest[0]) : mountList(el)),
  });

  App.action({ id: 'nova-turma', label: 'Nova turma', icon: 'layers', order: 40, perm: 'turmas.gerenciar', when: () => Store.me.scope === 'todas', keys: 'criar turma classe sala', run: () => Actions.novaTurma() });

  App.searchProvider((query) => {
    if (Store.family || !Store.canAny('turmas.ver', 'turmas.gerenciar')) return [];
    return Q.classes()
      .filter((c) => U.matches(query, c.name, c.segment, c.room, c.shift, Q.userName(c.teacherId, '')))
      .slice(0, 6)
      .map((c) => ({
        group: 'Turmas',
        label: c.name,
        icon: 'layers',
        meta: `${c.segment || 'Turma'} · ${U.plural(Q.roster(c.id).length, 'aluno', 'alunos')}`,
        keys: [c.name, c.segment, c.room, c.shift, Q.userName(c.teacherId, '')].join(' '),
        run: () => App.go('turmas/' + c.id),
      }));
  });
})();
