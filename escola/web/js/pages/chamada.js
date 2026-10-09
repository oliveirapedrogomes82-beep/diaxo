'use strict';
/* Chamada — diária (Educação Infantil e Fundamental I) ou por aula (segue o horário da turma).
   Todos começam presentes; marcação no estilo gabarito (P / F, e J / A para quem justifica faltas).
   Envia só as marcações alteradas + baseAt (conflito quando outra pessoa salvou antes).
   Também: justificar faltas (attendance.justify), aba "Frequência" da ficha do aluno e os cartões do painel.
   Comandos: attendance.save, attendance.justify (web/core/commands/pedagogico.js). */
(() => {
  const R = Core.rules;
  const can = (p) => Store.can(p);
  const tf = (b) => (b ? 'true' : 'false');
  const MARKS = {
    P: { label: 'Presente', short: 'Presente', tone: 'ok' },
    F: { label: 'Falta', short: 'Falta', tone: 'bad' },
    J: { label: 'Falta justificada', short: 'Justificada', tone: 'warn' },
    A: { label: 'Falta abonada', short: 'Abonada', tone: 'info' },
  };
  const lessonLabel = (period, subjectId) => {
    if (!period) return 'Chamada do dia';
    const s = subjectId ? Q.subject(subjectId) : null;
    return `${period}ª aula${s ? ` · ${s.name}` : ''}`;
  };
  const teacherOfLesson = (c, subjectId) => {
    const t = subjectId && c.subjects ? c.subjects[subjectId] : null;
    if (t) return Q.user(t);
    return ['Educação Infantil', 'Fundamental I'].includes(c.segment) ? Q.user(c.teacherId) : null;
  };

  // =====================================================================
  // Estado da tela
  // =====================================================================
  const VS = () => {
    const v = PageState.get('chamada', {});
    if (!v.drafts) v.drafts = {};
    return v;
  };
  const rollClasses = () => Q.workClasses().filter((c) => Q.roster(c.id).length || Object.keys(Store.state.attendance).some((k) => k.startsWith(c.id + '|')));
  const keyOf = (v) => R.attendanceKey(v.classId, v.date, v.period || 0);
  const lastSchoolDay = (T) => (Q.isSchoolDay(T) ? T : Q.lastSchoolDays(1, T, false)[0] || T);

  /** Normaliza turma, data e aula escolhidas (também lê #chamada/turma/data/aula). */
  const resolve = (rest = []) => {
    const v = VS();
    const restKey = rest.join('/');
    if (restKey && restKey !== v.lastRest) {
      if (Q.klass(rest[0])) v.classId = rest[0];
      if (rest[1] && U.isValidDate(rest[1])) v.date = rest[1];
      if (rest[2] != null && /^\d$/.test(rest[2])) v.period = Number(rest[2]);
    }
    v.lastRest = restKey;
    const T = U.today();
    if (!v.date || !U.isValidDate(v.date) || v.date > T) v.date = lastSchoolDay(T);
    const list = rollClasses();
    if (!list.some((c) => c.id === v.classId)) {
      const todo = Q.rollsToDo(v.date);
      v.classId = (todo[0] && todo[0].klass.id) || (list[0] || {}).id || null;
      v.period = null;
    }
    if (v.classId) {
      if (Q.attendanceMode(v.classId) !== 'por_aula') v.period = 0;
      else {
        const lessons = Q.periods(v.classId, v.date);
        if (!lessons.some((p) => p.period === v.period)) {
          const mine = lessons.filter((p) => Q.canTakeLesson(v.classId, p.period, p.subjectId));
          const open = (p) => !Q.attendance(v.classId, v.date, p.period);
          const pick = mine.find(open) || mine[0] || lessons.find(open) || lessons[0];
          v.period = pick ? pick.period : null;
        }
      }
    }
    return { v, list };
  };

  /** Marcações em edição (só o que mudou em relação ao registro salvo). */
  const draftOf = (v, create = false) => {
    const key = keyOf(v);
    let d = v.drafts[key];
    if (!d && create) {
      const rec = Q.attendance(v.classId, v.date, v.period || 0);
      d = v.drafts[key] = { marks: {}, reasons: {}, content: undefined, baseAt: rec ? rec.at : null, rebase: false };
    }
    return d || null;
  };
  /** Marcação atual: rascunho → registro salvo → sugestão (aviso de falta da família, só sem registro) → presente. */
  const markOf = (rec, d, sid, sugg = null) => {
    if (d && Object.prototype.hasOwnProperty.call(d.marks, sid)) return d.marks[sid];
    if (rec) return (rec.marks && rec.marks[sid]) || 'P';
    return (sugg && sugg.get(sid)) || 'P';
  };
  const reasonOf = (rec, d, sid) => (d && Object.prototype.hasOwnProperty.call(d.reasons, sid) ? d.reasons[sid] : ((rec && rec.reasons) || {})[sid] || '');
  const changes = (rec, d, sugg = null) => {
    const out = { marks: {}, reasons: {}, content: undefined };
    // chamada nova: as faltas avisadas pela família (e não mexidas) vão junto
    if (!rec && sugg) sugg.forEach((m, sid) => !(d && Object.prototype.hasOwnProperty.call(d.marks, sid)) && m !== 'P' && (out.marks[sid] = m));
    if (!d) return out;
    for (const [sid, m] of Object.entries(d.marks)) {
      const base = rec && rec.marks ? rec.marks[sid] : undefined;
      if (rec ? m !== base : m !== 'P') out.marks[sid] = m;
    }
    for (const [sid, r] of Object.entries(d.reasons)) if (r !== (((rec && rec.reasons) || {})[sid] || '')) out.reasons[sid] = r;
    if (d.content !== undefined && d.content !== ((rec && rec.content) || '')) out.content = d.content;
    return out;
  };
  const isDirty = (rec, d) => {
    if (!rec) return true;
    const ch = changes(rec, d);
    return Object.keys(ch.marks).length > 0 || Object.keys(ch.reasons).length > 0 || ch.content !== undefined;
  };
  const rosterOf = (v) => R.roster(Store.state, v.classId, v.date, v.period || 0).slice().sort(Q.cmpName);

  // ---------- avisos de falta das famílias (mensagens "Avisar falta" / "Enviar atestado") ----------
  /** studentId → aviso que cobre o dia (Q.absenceNotices vem de mensagens.js; quem não vê mensagens não recebe nenhum). */
  const famNotices = (date) => (typeof Q.absenceNotices === 'function' ? Q.absenceNotices(date) : new Map());
  /** Sugestões para uma chamada ainda não registrada: quem a família avisou que falta já começa com F. */
  const suggestionsFor = (rec, roster, notices) => {
    if (rec || !notices.size) return null;
    const out = new Map();
    roster.forEach((s) => notices.has(s.id) && out.set(s.id, 'F'));
    return out.size ? out : null;
  };
  const noticeLabel = (n) => (n.kind === 'atestado' ? 'Atestado da família' : 'Família avisou');
  const noticeWhen = (n) => (n.until && n.until !== n.from ? ` (${U.fmtDate(n.from).slice(0, 5)} a ${U.fmtDate(n.until).slice(0, 5)})` : '');
  /** Texto para o motivo da justificativa, a partir do aviso. */
  const noticeJustification = (n) => {
    const base = n.kind === 'atestado' ? 'Atestado médico enviado pela família' : 'Família avisou por mensagem';
    return `${base}${n.reason && n.kind !== 'atestado' ? `: ${n.reason}` : ''}`.slice(0, 300);
  };
  /** Linha inteira abaixo do nome: "Família avisou (07/10 a 10/10) · Está com febre…". */
  const famRow = (s, ctx) => {
    const n = ctx.notices && ctx.notices.get(s.id);
    if (!n) return '';
    return html`<div class="pd-fam-row"><span class="pill ${n.kind === 'atestado' ? 'warn' : 'info'} plain pd-fam-pill">${icon(n.kind === 'atestado' ? 'file' : 'message')}${noticeLabel(n)}</span><span class="pd-fam-why">${noticeWhen(n).trim()}${noticeWhen(n) && n.reason && n.kind !== 'atestado' ? ' · ' : ''}${n.kind !== 'atestado' ? n.reason : ''}</span></div>`;
  };

  // =====================================================================
  // Tela
  // =====================================================================
  const dateNav = (v) => {
    const T = U.today();
    return html`<div class="date-nav pd-date-nav" role="group" aria-label="Dia da chamada">
      <button type="button" class="icon-btn" data-ch-day="-1" aria-label="Dia letivo anterior">${icon('chevronLeft')}</button>
      <div class="label"><div>${U.cap(U.fmtDateLong(v.date))}</div><div class="small muted">${v.date === T ? 'hoje' : U.relDay(v.date)}</div></div>
      <button type="button" class="icon-btn" data-ch-day="1" aria-label="Próximo dia letivo" ${v.date >= T ? raw('disabled') : ''}>${icon('chevronRight')}</button>
      <label class="sr-only" for="ch-date">Escolher a data</label><input type="date" class="input" id="ch-date" value="${v.date}" max="${T}">
      ${v.date !== T ? html`<button type="button" class="btn sm" data-ch-today>Hoje</button>` : ''}
    </div>`;
  };

  const classStrip = (v, list) => {
    if (list.length < 2) return '';
    return html`<div class="class-strip pd-strip" role="group" aria-label="Turmas">${list.map((c) => {
      const st = Q.rollState(c.id, v.date);
      const done = st.total > 0 && st.done === st.total;
      const part = st.done > 0 && !done;
      const hasDraft = Object.keys(v.drafts).some((k) => k.startsWith(`${c.id}|${v.date}|`) && isDirty(Q.attendance(c.id, v.date, Number(k.split('|')[2])), v.drafts[k]));
      const title = !st.total ? 'Sem aula neste dia' : done ? 'Chamada registrada' : part ? `${st.done} de ${st.total} aulas registradas` : 'Sem chamada';
      return html`<button type="button" class="chip" data-ch-class="${c.id}" aria-pressed="${tf(c.id === v.classId)}" title="${title}">
        <span class="state ${done ? 'done' : part ? 'pd-part' : ''}" aria-hidden="true">${done ? icon('check') : part ? html`<b>${st.done}</b>` : ''}</span>${c.name}${hasDraft ? html`<span class="pd-draft-dot" title="Alterações não salvas"></span>` : ''}<span class="sr-only">: ${title}</span></button>`;
    })}</div>`;
  };

  const lessonPicker = (v, c) => {
    const lessons = Q.periods(c.id, v.date);
    if (lessons.length < 1) return '';
    return html`<div class="pd-lessons" role="group" aria-label="Aulas do dia">${lessons.map((p) => {
      const s = Q.subject(p.subjectId);
      const t = teacherOfLesson(c, p.subjectId);
      const done = !!Q.attendance(c.id, v.date, p.period);
      const mine = Q.canTakeLesson(c.id, p.period, p.subjectId);
      return html`<button type="button" class="pd-lesson ${done ? 'done' : ''} ${mine ? 'mine' : ''}" data-ch-period="${p.period}" aria-pressed="${tf(p.period === v.period)}">
        <span class="pd-lesson-top"><span class="pd-lesson-n">${p.period}ª aula</span>${done ? html`<span class="pd-lesson-ok" title="Chamada registrada">${icon('checkCircle')}<span class="sr-only">registrada</span></span>` : mine ? html`<span class="pd-lesson-todo" title="Sem chamada">pendente</span>` : ''}</span>
        <span class="pd-lesson-sub">${s ? html`<span class="swatch c${s.color}"></span>${s.name}` : 'Aula'}</span>
        <span class="pd-lesson-who">${t ? (t.id === Store.me.id ? 'Você' : U.shortName(t.name)) : 'Sem professor(a)'}</span>
      </button>`;
    })}</div>`;
  };

  const rowSub = (s, ctx) => {
    const parts = [];
    const streak = ctx.streaks.get(s.id) || 0;
    if (streak >= ctx.alert) parts.push(html`<span class="pill bad plain">${U.plural(streak, 'falta seguida', 'faltas seguidas')}</span>`);
    const rate = ctx.showRate ? Q.attendanceRate(s.id) : null;
    if (rate != null && rate < ctx.min) parts.push(html`<span class="pd-low">Frequência ${U.pct(rate)}</span>`);
    if (s.status !== 'ativo') parts.push(html`<span class="pill plain">${s.status === 'trancado' ? 'Matrícula trancada' : 'Saiu da turma'}</span>`);
    else if (s.classId !== ctx.classId) parts.push(html`<span class="pill plain">Mudou de turma</span>`);
    return parts;
  };

  const editRow = (s, i, ctx) => {
    const m = markOf(ctx.rec, ctx.d, s.id, ctx.sugg);
    const opts = ctx.justify ? ['P', 'F', 'J', 'A'] : ['P', 'F'];
    if (!opts.includes(m)) opts.push(m);
    const sub = rowSub(s, ctx);
    return html`<li class="${m}" data-sid="${s.id}">
      <span class="n">${i + 1}</span>
      <button type="button" class="who" data-ch-toggle aria-label="${s.name}: ${MARKS[m].label.toLowerCase()}. Toque para alternar entre presente e falta.">
        ${UI.avatar(s.name, 'sm', s.photo)}<span class="pd-who-text"><span class="person-name">${s.name}</span>${sub.length ? html`<span class="pd-who-sub">${sub}</span>` : ''}</span>
      </button>
      <div class="bubbles" role="radiogroup" aria-label="Presença de ${U.firstName(s.name)}">${opts.map(
        (k) => html`<button type="button" role="radio" class="bubble ${k}" data-ch-mark="${k}" aria-checked="${tf(m === k)}" tabindex="${m === k ? '0' : '-1'}" aria-label="${MARKS[k].label}" title="${MARKS[k].label} (tecla ${k})" ${!ctx.justify && (k === 'J' || k === 'A') ? raw('disabled') : ''}>${k}</button>`,
      )}</div>
      ${famRow(s, ctx)}
      ${ctx.justify && (m === 'J' || m === 'A') ? reasonRow(s, reasonOf(ctx.rec, ctx.d, s.id)) : ''}
    </li>`;
  };
  const reasonRow = (s, value) =>
    html`<div class="pd-reason-row"><label class="sr-only" for="ch-r-${s.id}">Motivo da falta de ${s.name}</label><input id="ch-r-${s.id}" class="input pd-reason-input" data-ch-reason="${s.id}" value="${value}" maxlength="300" placeholder="Motivo (ex.: atestado médico)" autocomplete="off"></div>`;

  const viewRow = (s, i, ctx) => {
    const m = markOf(ctx.rec, null, s.id);
    const reason = reasonOf(ctx.rec, null, s.id);
    const sub = rowSub(s, ctx);
    if ((m === 'J' || m === 'A') && reason) sub.push(html`<span class="pd-reason">${MARKS[m].short}: ${reason}</span>`);
    return html`<li class="${m} pd-ro" data-sid="${s.id}">
      <span class="n">${i + 1}</span>
      <a class="who" href="#alunos/${s.id}/frequencia">${UI.avatar(s.name, 'sm', s.photo)}<span class="pd-who-text"><span class="person-name">${s.name}</span>${sub.length ? html`<span class="pd-who-sub">${sub}</span>` : ''}</span></a>
      <div class="pd-ro-end">${UI.pill(MARKS[m].short, MARKS[m].tone)}${ctx.justifyBtn && m !== 'P' ? html`<button type="button" class="btn sm" data-ch-justify="${s.id}" aria-label="Justificar a falta de ${s.name}">${icon('pencil')}<span class="hide-xs">Justificar</span></button>` : ''}</div>
      ${famRow(s, ctx)}
    </li>`;
  };

  const counts = (roster, rec, d, sugg = null) => {
    const n = { P: 0, F: 0, J: 0, A: 0 };
    roster.forEach((s) => n[markOf(rec, d, s.id, sugg)]++);
    return n;
  };
  const countsHTML = (n, showJA) =>
    html`<span><span class="dot-ok"></span><b>${n.P}</b> ${n.P === 1 ? 'presente' : 'presentes'}</span><span><span class="dot-bad"></span><b>${n.F}</b> ${n.F === 1 ? 'falta' : 'faltas'}</span>${showJA || n.J ? html`<span><span class="dot-warn"></span><b>${n.J}</b> ${n.J === 1 ? 'justificada' : 'justificadas'}</span>` : ''}${showJA || n.A ? html`<span><span class="pd-dot-info"></span><b>${n.A}</b> ${n.A === 1 ? 'abonada' : 'abonadas'}</span>` : ''}`;

  const render = (rest) => {
    const { v, list } = resolve(rest);
    const T = U.today();
    const registrar = can('chamada.registrar');
    const head = (lead) => html`<div class="page-head"><div><h1>Chamada</h1><p class="lead">${lead}</p></div>${list.length ? dateNav(v) : ''}</div>`;
    if (!list.length)
      return html`${head('')}<section class="card">${UI.empty({
        icon: 'checkSquare',
        title: 'Nenhuma turma com alunos',
        text: registrar ? 'Você ainda não está em nenhuma turma com alunos. Peça à coordenação para incluir você na equipe da turma.' : 'Quando houver turmas com alunos, a chamada aparece aqui.',
        action: Store.canAny('turmas.ver', 'turmas.gerenciar') ? html`<a class="btn primary" href="#turmas">Ver turmas</a>` : '',
      })}</section>`;
    const c = Q.klass(v.classId);
    const mode = Q.attendanceMode(c.id);
    const wd = U.weekday(v.date);
    const hol = Q.holiday(v.date);
    const offDay = wd === 0 || wd === 6 || !!hol;
    const lessons = Q.periods(c.id, v.date);
    const lead = registrar ? 'Todos começam presentes: toque em quem faltou e salve.' : 'Consulte quem esteve presente em cada dia e aula.';
    const parts = [head(lead), classStrip(v, list)];
    if (offDay)
      parts.push(html`<div class="notice warn">${icon('alert')}<span class="grow">${hol ? html`<b>${U.cap(U.fmtDateLong(v.date))}</b> é feriado (${hol}).` : html`Este dia é ${U.WEEKDAYS[wd]}.`} Normalmente não há aula.${mode === 'diaria' && registrar ? ' Se houve atividade, a chamada pode ser registrada mesmo assim.' : ''}</span>${hol || mode === 'por_aula' ? html`<button type="button" class="btn sm" data-ch-day="-1">Ir para o dia letivo anterior</button>` : ''}</div>`);
    if (mode === 'por_aula') {
      if (!lessons.length) {
        parts.push(html`<section class="card">${UI.empty({
          icon: 'calendar',
          title: `${c.name}: sem aulas neste dia`,
          text: offDay ? 'Escolha um dia letivo para fazer a chamada.' : `O horário do ${c.name} não tem aulas na ${U.WEEKDAYS[wd]}.`,
          action: Store.canAny('turmas.ver', 'turmas.gerenciar') ? html`<a class="btn" href="#turmas/${c.id}/horario">Ver o horário da turma</a>` : '',
        })}</section>`);
        return html`${parts}`;
      }
      parts.push(lessonPicker(v, c));
    }
    const lesson = lessons.find((p) => p.period === (v.period || 0)) || { period: 0, subjectId: null };
    const rec = Q.attendance(c.id, v.date, v.period || 0);
    const editable = Q.canTakeLesson(c.id, lesson.period, lesson.subjectId);
    const d = editable ? draftOf(v) : null;
    const roster = rosterOf(v);
    const famMap = famNotices(v.date);
    const sugg = editable ? suggestionsFor(rec, roster, famMap) : null;
    const ctx = {
      rec,
      d,
      sugg,
      notices: famMap,
      classId: c.id,
      justify: can('chamada.justificar'),
      justifyBtn: can('chamada.justificar') && !!rec,
      streaks: Q.absenceStreaks(c.id),
      alert: Q.absenceAlert(),
      min: Q.minAttendance(c.id),
      showRate: can('chamada.ver'),
    };
    const t = mode === 'por_aula' ? teacherOfLesson(c, lesson.subjectId) : null;
    const sub = Q.subject(lesson.subjectId);
    const notices = [];
    if (v.conflict && v.conflict.key === keyOf(v))
      notices.push(html`<div class="notice warn">${icon('alert')}<span class="grow"><b>${v.conflict.message}</b> A lista abaixo já mostra a versão salva, com as suas mudanças por cima.</span><button type="button" class="btn sm" data-ch-discard>Descartar as minhas mudanças</button></div>`);
    const warned = roster.filter((s) => famMap.has(s.id));
    if (warned.length) {
      /** "<b>Ana</b>, <b>Bia</b> e <b>Caio</b>" (até 4 nomes; depois "e mais N"). */
      const namesOf = (list) => {
        const shown = list.slice(0, list.length > 4 ? 3 : 4).map((s) => html`<b>${U.shortName(s.name)}</b>`);
        if (list.length > shown.length) return html`${html.join(shown, ', ')} e mais ${list.length - shown.length}`;
        return shown.length > 1 ? html`${html.join(shown.slice(0, -1), ', ')} e ${shown[shown.length - 1]}` : shown[0];
      };
      const names = namesOf(warned);
      const link = can('mensagens.responder') ? html`<a class="btn sm" href="${warned.length === 1 ? `#mensagens/${famMap.get(warned[0].id).id}` : '#mensagens'}">${icon('message')}${warned.length === 1 ? 'Ver o aviso' : 'Ver mensagens'}</a>` : '';
      if (sugg) notices.push(html`<div class="notice">${icon('message')}<span class="grow">A família avisou a falta de ${names}: ${warned.length === 1 ? 'já está marcado(a)' : 'já estão marcados'} como falta. Se ${warned.length === 1 ? 'veio' : 'alguém veio'}, toque no nome para mudar.</span>${link}</div>`);
      else if (rec) {
        const here = warned.filter((s) => markOf(rec, d, s.id) === 'P');
        if (here.length) notices.push(html`<div class="notice warn">${icon('alert')}<span class="grow">A família avisou a falta de ${namesOf(here)}, mas ${here.length === 1 ? 'está' : 'estão'} como presente nesta chamada. Confira.</span>${link}</div>`);
      } else notices.push(html`<div class="notice">${icon('message')}<span class="grow">A família avisou a falta de ${names} neste dia.</span>${link}</div>`);
    }
    if (!editable && registrar && mode === 'por_aula' && Q.myClasses().some((x) => x.id === c.id))
      notices.push(html`<div class="notice">${icon('lock')}<span class="grow">Esta aula é de ${t ? t.name : 'outro(a) professor(a)'}. Só ${t ? U.firstName(t.name) : 'quem dá a aula'} e a coordenação registram a chamada dela.</span></div>`);
    const prev = editable && mode === 'por_aula' ? lessons.filter((p) => p.period < lesson.period && p.subjectId === lesson.subjectId && Q.attendance(c.id, v.date, p.period)).pop() : null;
    const tools = [];
    if (editable && prev && (!rec || !isDirty(rec, d))) tools.push(html`<button type="button" class="btn sm" data-ch-copy="${prev.period}" title="Copia as presenças da ${prev.period}ª aula (mesma disciplina)">${icon('repeat')}<span>Repetir a ${prev.period}ª aula</span></button>`);
    if (editable) tools.push(html`<button type="button" class="btn sm" data-ch-all>${icon('check')}<span>Todos presentes</span></button>`);
    const status = rec
      ? html`${icon('checkCircle')} Registrada por ${rec.by === Store.me.id ? 'você' : Q.userName(rec.by, 'alguém da equipe')} ${U.fmtInstant(rec.at)}${editable ? '. Se mudar algo, salve de novo.' : '.'}`
      : editable ? 'Ainda não registrada. Confira a lista e salve.' : 'A chamada desta aula ainda não foi registrada.';
    const content = d && d.content !== undefined ? d.content : (rec && rec.content) || '';
    let rollList;
    if (!roster.length) rollList = UI.empty({ icon: 'users', title: 'Turma sem alunos ativos', text: 'Matricule alunos na turma para fazer a chamada.' });
    else if (!editable && !rec) rollList = UI.empty({ icon: 'clock', title: 'Chamada ainda não registrada', text: t ? `Quando ${U.firstName(t.name)} registrar, as presenças aparecem aqui.` : 'Quando a chamada for registrada, as presenças aparecem aqui.' });
    else rollList = html`<ul class="roll pd-roll" aria-label="Lista de chamada">${roster.map((s, i) => (editable ? editRow(s, i, ctx) : viewRow(s, i, ctx)))}</ul>`;
    parts.push(html`<section class="card pd-roll-card">
      <div class="card-head">
        <div><h2>${c.name}${mode === 'por_aula' ? html` <span class="muted pd-h-light">· ${lesson.period}ª aula${sub ? ` · ${sub.name}` : ''}</span>` : html` <span class="muted pd-h-light">· ${c.shift || ''}</span>`}</h2>
        <span class="sub">${status}</span></div>
        ${tools.length ? html`<div class="btn-row">${tools}</div>` : ''}
      </div>
      ${notices.length ? html`<div class="pd-notices">${notices}</div>` : ''}
      ${rollList}
      ${editable && roster.length ? html`<p class="pd-keys small muted no-print">${icon('keyboard')}<span>No teclado: <kbd>P</kbd> presente, <kbd>F</kbd> falta${ctx.justify ? html`, <kbd>J</kbd> justificada, <kbd>A</kbd> abonada` : ''} · <kbd>↑</kbd> <kbd>↓</kbd> muda de aluno · <kbd>Ctrl</kbd>+<kbd>S</kbd> salva</span></p>` : ''}
      ${mode === 'por_aula' && (editable || content)
        ? html`<div class="pd-content">${editable
            ? html`<div class="field"><label for="ch-content">Conteúdo da aula <span class="muted">(opcional)</span></label><textarea id="ch-content" class="input" rows="2" maxlength="2000" data-ch-content placeholder="Ex.: Frações equivalentes — exercícios da página 42">${content}</textarea></div>`
            : html`<div class="small"><b>Conteúdo da aula:</b> <span class="pd-pre">${content}</span></div>`}</div>`
        : ''}
    </section>`);
    if (editable && roster.length) {
      const n = counts(roster, rec, d, sugg);
      const dirty = isDirty(rec, d);
      parts.push(html`<div class="savebar pd-savebar" role="region" aria-label="Resumo da chamada">
        <div class="counts" id="ch-counts" aria-live="polite">${countsHTML(n, ctx.justify)}</div>
        <button type="button" class="btn ghost" data-ch-discard ${rec && dirty ? '' : raw('hidden')}>Descartar</button>
        <button type="button" class="btn primary lg" data-ch-save ${dirty ? '' : raw('disabled')}>${icon(dirty ? 'check' : 'checkCircle')}<span>${!rec ? 'Salvar chamada' : dirty ? 'Salvar alterações' : 'Chamada salva'}</span></button>
      </div>`);
    }
    return html`${parts}`;
  };

  // =====================================================================
  // Eventos
  // =====================================================================
  const mount = (el, rest) => {
    const { v, list } = resolve(rest);
    if (!list.length || !v.classId) return;
    const c = Q.klass(v.classId);
    const T = U.today();
    const lessons = Q.periods(c.id, v.date);
    const lesson = lessons.find((p) => p.period === (v.period || 0)) || { period: 0, subjectId: null };
    const editable = Q.canTakeLesson(c.id, lesson.period, lesson.subjectId) && (Q.attendanceMode(c.id) !== 'por_aula' || lessons.length > 0);
    const rec = () => Q.attendance(v.classId, v.date, v.period || 0);
    const justify = can('chamada.justificar');
    const famMap = famNotices(v.date);
    /** Sugestões dos avisos das famílias (só enquanto a chamada não foi salva). */
    const sugg = () => (editable ? suggestionsFor(rec(), rosterOf(v), famMap) : null);

    const paint = () => {
      const r = rec();
      const d = draftOf(v);
      const roster = rosterOf(v);
      const box = UI.$('#ch-counts', el);
      if (box) UI.setHTML(box, countsHTML(counts(roster, r, d, sugg()), justify));
      const btn = UI.$('[data-ch-save]', el);
      if (btn) {
        const dirty = isDirty(r, d);
        btn.disabled = !dirty;
        UI.setHTML(btn, html`${icon(dirty ? 'check' : 'checkCircle')}<span>${!r ? 'Salvar chamada' : dirty ? 'Salvar alterações' : 'Chamada salva'}</span>`);
        const discard = UI.$('.pd-savebar [data-ch-discard]', el);
        if (discard) discard.hidden = !(r && dirty);
      }
    };

    const setMark = (li, mark) => {
      if (!li || !editable) return;
      if ((mark === 'J' || mark === 'A') && !justify) return;
      const sid = li.dataset.sid;
      const d = draftOf(v, true);
      d.marks[sid] = mark;
      li.className = mark;
      UI.$$('.bubble', li).forEach((b) => {
        const on = b.dataset.chMark === mark;
        b.setAttribute('aria-checked', tf(on));
        b.tabIndex = on ? 0 : -1;
      });
      const s = Q.student(sid);
      const who = UI.$('.who', li);
      if (who && s) who.setAttribute('aria-label', `${s.name}: ${MARKS[mark].label.toLowerCase()}. Toque para alternar entre presente e falta.`);
      if (justify) {
        const row = UI.$('.pd-reason-row', li);
        if ((mark === 'J' || mark === 'A') && !row && s) {
          // com aviso da família, o motivo já vem preenchido (dá para mudar)
          const fam = famMap.get(sid);
          if (fam && !reasonOf(rec(), d, sid)) d.reasons[sid] = noticeJustification(fam);
          li.insertAdjacentHTML('beforeend', String(reasonRow(s, reasonOf(rec(), d, sid))));
        }
        else if (mark !== 'J' && mark !== 'A' && row) {
          row.remove();
          delete d.reasons[sid];
        }
      }
      paint();
    };
    const rows = () => UI.$$('li[data-sid]', el);
    const focusRow = (li, sel = '.who') => {
      if (!li) return;
      const t = UI.$(sel, li) || UI.$('.who', li);
      t && t.focus();
    };

    const save = async (btn) => {
      const r = rec();
      const d = draftOf(v);
      const ch = changes(r, d, sugg());
      const input = { classId: v.classId, date: v.date, period: v.period || 0, marks: ch.marks };
      input.baseAt = d ? (d.rebase ? (r ? r.at : null) : d.baseAt) : r ? r.at : null;
      if (ch.content !== undefined) input.content = ch.content;
      if (justify && Object.keys(ch.reasons).length) input.reasons = ch.reasons;
      const key = keyOf(v);
      const label = btn ? btn.innerHTML : '';
      if (btn) {
        btn.disabled = true;
        btn.classList.add('loading');
      }
      try {
        const res = await Store.cmd('attendance.save', input);
        delete v.drafts[key];
        if (v.conflict && v.conflict.key === key) v.conflict = null;
        const f = (res.result && res.result.absent) || 0;
        const next = Q.rollsToDo(v.date).flatMap((x) => x.missing.map((p) => ({ c: x.klass, p })))[0];
        UI.toast(`Chamada salva: ${c.name}${v.period ? ` · ${v.period}ª aula` : ''} · ${U.plural(f, 'falta', 'faltas')}`, next ? { action: { label: `Próxima: ${next.c.name}${next.p.period ? ` (${next.p.period}ª)` : ''}`, fn: () => Actions.fazerChamada(next.c.id, { date: v.date, period: next.p.period }) } } : {});
      } catch (err) {
        if (err && err.code === 'conflict') {
          const dd = draftOf(v, true);
          dd.rebase = true;
          v.conflict = { key, message: err.message };
          App.render();
        } else if (err && err.code !== 'canceled') UI.errorToast(err);
      } finally {
        if (btn && document.contains(btn)) {
          btn.classList.remove('loading');
          btn.innerHTML = label;
          paint();
        }
      }
    };

    const goDay = (dir) => {
      let x = v.date;
      for (let i = 0; i < 40; i++) {
        x = U.addDays(x, dir);
        if (Q.isSchoolDay(x)) break;
      }
      if (x > T) return;
      v.date = x;
      v.period = null;
      App.render();
    };

    el.addEventListener('click', (e) => {
      const cb = e.target.closest('[data-ch-class]');
      if (cb) {
        if (cb.dataset.chClass !== v.classId) {
          v.classId = cb.dataset.chClass;
          v.period = null;
          App.render();
        }
        return;
      }
      const pb = e.target.closest('[data-ch-period]');
      if (pb) {
        v.period = Number(pb.dataset.chPeriod);
        App.render();
        return;
      }
      const day = e.target.closest('[data-ch-day]');
      if (day) return goDay(Number(day.dataset.chDay));
      if (e.target.closest('[data-ch-today]')) {
        v.date = T;
        v.period = null;
        App.render();
        return;
      }
      const li = e.target.closest('li[data-sid]');
      const mk = e.target.closest('[data-ch-mark]');
      if (li && mk) return setMark(li, mk.dataset.chMark);
      if (li && e.target.closest('[data-ch-toggle]')) {
        const cur = markOf(rec(), draftOf(v), li.dataset.sid, sugg());
        return setMark(li, cur === 'P' ? 'F' : 'P');
      }
      const jb = e.target.closest('[data-ch-justify]');
      if (jb) return Actions.justificarFalta({ classId: v.classId, date: v.date, period: v.period || 0, studentId: jb.dataset.chJustify });
      if (e.target.closest('[data-ch-all]')) {
        const list = rows();
        const sg = sugg();
        const kept = list.filter((x) => ['J', 'A'].includes(markOf(rec(), draftOf(v), x.dataset.sid, sg))).length;
        list.forEach((x) => markOf(rec(), draftOf(v), x.dataset.sid, sg) === 'F' && setMark(x, 'P'));
        UI.toast(kept ? `Todos presentes, exceto ${U.plural(kept, 'falta justificada ou abonada', 'faltas justificadas ou abonadas')}.` : 'Todos marcados como presentes.', { ic: 'check' });
        return;
      }
      const cp = e.target.closest('[data-ch-copy]');
      if (cp) {
        const src = Q.attendance(v.classId, v.date, Number(cp.dataset.chCopy));
        if (!src) return;
        const d = draftOf(v, true);
        rosterOf(v).forEach((s) => (d.marks[s.id] = (src.marks || {})[s.id] || 'P'));
        if (d.content === undefined && !(rec() && rec().content) && src.content) d.content = src.content;
        App.render();
        UI.toast(`Presenças copiadas da ${cp.dataset.chCopy}ª aula. Confira e salve.`, { ic: 'repeat' });
        return;
      }
      if (e.target.closest('[data-ch-discard]')) {
        delete v.drafts[keyOf(v)];
        if (v.conflict && v.conflict.key === keyOf(v)) v.conflict = null;
        App.render();
        return;
      }
      const sb = e.target.closest('[data-ch-save]');
      if (sb) save(sb);
    });

    el.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        const sb = UI.$('[data-ch-save]', el);
        if (sb) {
          e.preventDefault();
          if (!sb.disabled) save(sb);
        }
        return;
      }
      const li = e.target.closest && e.target.closest('li[data-sid]');
      if (!li || !editable || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.target.matches('input, textarea')) return;
      const k = e.key.length === 1 ? e.key.toUpperCase() : e.key;
      const list = rows();
      const i = list.indexOf(li);
      const onBubble = !!e.target.closest('.bubble');
      if (['P', 'F', 'J', 'A'].includes(k)) {
        if ((k === 'J' || k === 'A') && !justify) return;
        e.preventDefault();
        setMark(li, k);
        if (!((k === 'J' || k === 'A') && justify)) focusRow(list[i + 1]);
        else {
          const inp = UI.$('[data-ch-reason]', li);
          inp && inp.focus();
        }
      } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        focusRow(list[i + (e.key === 'ArrowDown' ? 1 : -1)], onBubble ? '.bubble[aria-checked="true"]' : '.who');
      } else if (onBubble && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) {
        e.preventDefault();
        const bs = UI.$$('.bubble:not([disabled])', li);
        const j = bs.indexOf(e.target.closest('.bubble'));
        const nb = bs[(j + (e.key === 'ArrowRight' ? 1 : -1) + bs.length) % bs.length];
        setMark(li, nb.dataset.chMark);
        UI.$(`.bubble[data-ch-mark="${nb.dataset.chMark}"]`, li).focus();
      }
    });

    el.addEventListener('input', (e) => {
      const ta = e.target.closest('[data-ch-content]');
      if (ta) {
        draftOf(v, true).content = ta.value;
        paint();
        return;
      }
      const ri = e.target.closest('[data-ch-reason]');
      if (ri) {
        draftOf(v, true).reasons[ri.dataset.chReason] = ri.value.trim();
        paint();
      }
    });
    el.addEventListener('keydown', (e) => {
      const ri = e.target.closest && e.target.closest('[data-ch-reason]');
      if (ri && e.key === 'Enter') {
        e.preventDefault();
        const list = rows();
        focusRow(list[list.indexOf(ri.closest('li')) + 1]);
      }
    });
    const di = UI.$('#ch-date', el);
    di &&
      di.addEventListener('change', () => {
        if (!U.isValidDate(di.value) || di.value > T) return;
        v.date = di.value;
        v.period = null;
        App.render();
      });
    // traz a turma e a aula escolhidas para a vista nas faixas que rolam de lado (celular)
    UI.$$('.pd-strip [aria-pressed="true"], .pd-lessons [aria-pressed="true"]', el).forEach((sel) => {
      const strip = sel.parentElement;
      const left = sel.offsetLeft - strip.offsetLeft;
      if (strip.scrollWidth > strip.clientWidth && (left + sel.offsetWidth > strip.clientWidth + strip.scrollLeft || left < strip.scrollLeft)) strip.scrollLeft = Math.max(0, left - 12);
    });
  };

  // =====================================================================
  // Justificar falta
  // =====================================================================
  /** Faltas (F, J, A) de um aluno numa turma e dia: [{period, subjectId, mark, reason}] */
  const absencesOn = (classId, date, sid) => {
    const att = Store.state.attendance;
    const prefix = `${classId}|${date}|`;
    return Object.keys(att)
      .filter((k) => k.startsWith(prefix))
      .map((k) => ({ period: Number(k.slice(prefix.length)), rec: att[k] }))
      .filter((x) => x.rec.marks && x.rec.marks[sid] && x.rec.marks[sid] !== 'P')
      .map((x) => ({ period: x.period, subjectId: x.rec.subjectId || null, mark: x.rec.marks[sid], reason: (x.rec.reasons || {})[sid] || '' }))
      .sort((a, b) => a.period - b.period);
  };

  Actions.justificarFalta = ({ classId, date, period = null, studentId }) => {
    if (!can('chamada.justificar')) return;
    const s = Q.student(studentId);
    if (!s) return;
    const list = absencesOn(classId, date, studentId);
    if (!list.length) return UI.toast('Não há falta registrada para este aluno nesse dia.', { tone: 'bad' });
    const cur = list.find((x) => x.period === period) || list[0];
    const many = list.length > 1;
    const fam = famNotices(date).get(studentId);
    UI.modal({
      title: 'Justificar falta',
      sub: html`${s.name} · ${U.cap(U.fmtDateLong(date))}`,
      size: 'sm',
      body: html`<form class="form-section pd-just" novalidate>
        ${fam ? html`<div class="notice pd-just-fam">${icon(fam.kind === 'atestado' ? 'file' : 'message')}<span class="grow"><b>${noticeLabel(fam)}${noticeWhen(fam)}</b>${fam.reason && fam.kind !== 'atestado' ? html`: “${fam.reason}”` : fam.kind === 'atestado' ? ' (anexo na mensagem)' : ''}</span>${can('mensagens.responder') ? html`<a class="btn sm" href="#mensagens/${fam.id}" data-close>Ver</a>` : ''}</div>` : ''}
        ${many
          ? html`<div class="field" data-field="scope"><span class="label">Quais faltas</span><div class="chips" role="radiogroup" aria-label="Quais faltas">
              <label class="chip"><input type="radio" name="scope" value="all" checked>Todas do dia (${list.length})</label>
              ${list.map((x) => html`<label class="chip"><input type="radio" name="scope" value="${x.period}">${lessonLabel(x.period, x.subjectId)}</label>`)}
            </div></div>`
          : html`<p class="small muted">${lessonLabel(cur.period, cur.subjectId)} · registrada como <b>${MARKS[cur.mark].label.toLowerCase()}</b>${cur.reason ? html` (“${cur.reason}”)` : ''}</p>`}
        <div class="field" data-field="mark"><span class="label">Como fica</span><div class="pd-just-opts">
          ${[
            ['J', 'Falta justificada', 'Continua contando como falta, com o motivo registrado (ex.: atestado médico).'],
            ['A', 'Falta abonada', 'Não conta na frequência. Use nos casos previstos em lei ou quando houve reposição.'],
            ['F', 'Sem justificativa', 'Volta a ser falta comum e o motivo é apagado.'],
          ].map(([k, t, h]) => html`<label class="pick"><input type="radio" name="mark" value="${k}" ${(cur.mark === 'F' ? 'J' : cur.mark) === k ? raw('checked') : ''}><strong>${t}</strong><span>${h}</span></label>`)}
        </div></div>
        <div class="field" data-field="reason"><label for="pj-reason">Motivo <span class="req">*</span></label><textarea id="pj-reason" class="input" rows="3" maxlength="300" placeholder="Ex.: atestado médico de 2 dias">${cur.reason || (fam ? noticeJustification(fam) : '')}</textarea><span class="hint">Aparece para a equipe na chamada e na frequência do aluno.</span></div>
        <button type="submit" hidden></button>
      </form>`,
      foot: html`<button type="button" class="btn" data-close>Cancelar</button><button type="button" class="btn primary" data-pj-save>${icon('check')}Salvar</button>`,
      onMount(el, api) {
        const form = UI.$('form', el);
        const reasonWrap = UI.$('[data-field="reason"]', el);
        const sync = () => {
          const mark = (UI.$('input[name="mark"]:checked', el) || {}).value;
          reasonWrap.hidden = mark === 'F';
        };
        form.addEventListener('change', sync);
        sync();
        const submit = async (e) => {
          e && e.preventDefault();
          UI.clearErrors(form);
          const mark = (UI.$('input[name="mark"]:checked', el) || {}).value;
          const reason = UI.$('#pj-reason', el).value.trim();
          if (!mark) return UI.markField(form, 'mark', 'Escolha uma opção.');
          if (mark !== 'F' && reason.length < 3) return UI.markField(form, 'reason', 'Escreva o motivo (ex.: atestado médico).');
          const scope = many ? (UI.$('input[name="scope"]:checked', el) || {}).value : String(cur.period);
          const input = { classId, date, studentId, mark, reason: mark === 'F' ? '' : reason };
          if (scope !== 'all') input.period = Number(scope);
          const res = await UI.act('attendance.justify', input, { btn: UI.$('[data-pj-save]', el), form, ok: mark === 'F' ? 'Falta voltou a ser sem justificativa' : mark === 'A' ? 'Falta abonada' : 'Falta justificada' });
          if (res) api.close();
        };
        form.addEventListener('submit', submit);
        UI.$('[data-pj-save]', el).addEventListener('click', submit);
      },
    });
  };

  // =====================================================================
  // Ficha do aluno: Frequência
  // =====================================================================
  const studentRecords = (sid) => Q.attendanceRecords(sid);
  const FS = () => PageState.get('frequencia', { all: false });

  const renderFreq = (s) => {
    const recs = studentRecords(s.id);
    const e = Q.attendanceIndex().get(s.id);
    const rate = R.rateOf(e);
    const c = Q.klass(s.classId);
    const min = Q.minAttendance(s.classId);
    const tone = Q.attTone(rate, s.classId);
    const streak = c ? Q.absenceStreaks(c.id).get(s.id) || 0 : 0;
    const alert = Q.absenceAlert();
    if (!recs.length)
      return html`<section class="card">${UI.empty({ icon: 'checkSquare', title: 'Sem chamadas registradas', text: `Ainda não há chamadas de ${U.firstName(s.name)} em ${Q.year()}.` })}</section>`;
    const daily = recs.every((r) => !r.period);
    const unit = daily ? ['dia', 'dias'] : ['aula', 'aulas'];
    const abs = (e.F || 0) + (e.J || 0);
    const bySubject = new Map();
    recs.filter((r) => r.subjectId).forEach((r) => {
      let x = bySubject.get(r.subjectId);
      if (!x) bySubject.set(r.subjectId, (x = { lessons: 0, P: 0, F: 0, J: 0, A: 0 }));
      x.lessons++;
      x[r.mark]++;
    });
    const subjRows = [...bySubject.entries()].map(([sid, x]) => ({ s: Q.subject(sid) || { name: 'Disciplina', color: 1 }, x, rate: R.rateOf(x) })).sort((a, b) => a.s.name.localeCompare(b.s.name, 'pt-BR'));
    const byDate = new Map();
    recs.filter((r) => r.mark !== 'P').forEach((r) => {
      if (!byDate.has(r.date)) byDate.set(r.date, []);
      byDate.get(r.date).push(r);
    });
    const dates = [...byDate.keys()].sort().reverse();
    const fs = FS();
    const shown = fs.all ? dates : dates.slice(0, 12);
    const canJ = can('chamada.justificar');
    return html`<div class="stack pd-freq">
      <div class="kpis pd-kpis">
        <div class="card kpi"><span class="kpi-label">${icon('checkSquare')}Frequência</span><span class="kpi-value pd-t-${tone}">${U.pct(rate)}</span>${UI.meter(rate, tone)}<span class="kpi-foot">mínimo ${min}% · ${U.plural(e.lessons - e.A, unit[0] + ' contado', unit[1] + ' contados')}</span></div>
        <div class="card kpi"><span class="kpi-label">${icon('userX')}Faltas</span><span class="kpi-value ${abs ? 'pd-g-bad' : ''}">${abs}</span><span class="kpi-foot">${daily ? 'dias' : 'aulas'} com falta (inclui justificadas)</span></div>
        <div class="card kpi"><span class="kpi-label">${icon('file')}Justificadas</span><span class="kpi-value">${e.J || 0}</span><span class="kpi-foot">contam como falta</span></div>
        <div class="card kpi"><span class="kpi-label">${icon('shieldCheck')}Abonadas</span><span class="kpi-value">${e.A || 0}</span><span class="kpi-foot">não entram na conta</span></div>
      </div>
      ${streak >= alert
        ? html`<div class="notice bad">${icon('alert')}<span class="grow"><b>${U.plural(streak, 'falta seguida', 'faltas seguidas')}</b> (dias letivos com chamada). Vale falar com a família.</span>${typeof Actions.novaMensagem === 'function' && can('mensagens.responder') ? html`<button type="button" class="btn sm" data-fq-msg>${icon('message')}Mensagem à família</button>` : ''}</div>`
        : ''}
      <div class="grid-2">
        <section class="card"><div class="card-head"><h2>Faltas</h2><span class="sub">${dates.length ? `${U.plural(dates.length, 'dia', 'dias')} com falta em ${Q.year()}` : ''}</span></div>
          <div class="card-body">${dates.length
            ? html`<ul class="items pd-abs">${shown.map((date) => {
                const items = byDate.get(date).sort((a, b) => a.period - b.period);
                const anyOpen = items.some((r) => r.mark !== 'P');
                return html`<li><span class="date-chip"><b>${Number(date.slice(8))}</b><span>${U.MONTHS_SHORT[Number(date.slice(5, 7)) - 1]}</span></span>
                  <div class="grow"><div class="pd-abs-day">${U.cap(U.WEEKDAYS[U.weekday(date)])}${items[0].classId !== s.classId && Q.klass(items[0].classId) ? html` · <span class="muted">${Q.klass(items[0].classId).name}</span>` : ''}</div>
                    <div class="pd-abs-items">${items.map((r) => html`<span class="pd-abs-item">${UI.pill(MARKS[r.mark].short, MARKS[r.mark].tone)}<span class="small">${r.period ? lessonLabel(r.period, r.subjectId) : 'Chamada do dia'}</span></span>`)}</div>
                    ${items.filter((r) => r.reason).length ? html`<div class="small muted pd-abs-reason">${[...new Set(items.filter((r) => r.reason).map((r) => r.reason))].join(' · ')}</div>` : ''}
                  </div>
                  ${canJ && anyOpen ? html`<button type="button" class="btn sm" data-fq-just="${date}" data-fq-class="${items[0].classId}" aria-label="Justificar falta de ${U.fmtDate(date)}">${icon('pencil')}<span class="hide-xs">Justificar</span></button>` : ''}</li>`;
              })}</ul>${dates.length > shown.length ? html`<button type="button" class="btn sm ghost" data-fq-all>Mostrar todas (${dates.length})</button>` : ''}`
            : html`<p class="pd-ok">${icon('checkCircle')}<span>Nenhuma falta em ${Q.year()}.</span></p>`}</div>
        </section>
        ${subjRows.length
          ? html`<section class="card"><div class="card-head"><h2>Por disciplina</h2></div>
            <div class="table-wrap"><table class="table pd-freq-subj">
              <thead><tr><th>Disciplina</th><th class="num">Aulas</th><th class="num">Faltas</th><th class="num">Frequência</th></tr></thead>
              <tbody>${subjRows.map((r) => html`<tr><td><span class="subject-tag"><span class="swatch c${r.s.color}"></span>${r.s.name}</span></td><td class="num">${r.x.lessons - r.x.A}</td><td class="num">${r.x.F + r.x.J}</td><td class="num"><b class="pd-t-${Q.attTone(r.rate, s.classId)}">${U.pct(r.rate)}</b></td></tr>`)}</tbody>
            </table></div></section>`
          : html`<section class="card card-pad pd-freq-note"><h2>Como é calculada</h2><p class="small muted">A frequência considera os ${daily ? 'dias' : 'aulas'} com chamada no ano. Falta e falta justificada contam como ausência; falta abonada não entra na conta. O mínimo para a etapa é ${min}%.</p></section>`}
      </div>
      ${subjRows.length ? html`<p class="small muted">Ano letivo ${Q.year()}. Falta e falta justificada contam como ausência; falta abonada sai do cálculo. Mínimo da etapa: ${min}%.</p>` : ''}
    </div>`;
  };
  const mountFreq = (el, s) => {
    el.addEventListener('click', (e) => {
      const j = e.target.closest('[data-fq-just]');
      if (j) return Actions.justificarFalta({ classId: j.dataset.fqClass, date: j.dataset.fqJust, studentId: s.id });
      if (e.target.closest('[data-fq-all]')) {
        FS().all = true;
        App.render();
        return;
      }
      if (e.target.closest('[data-fq-msg]')) Actions.novaMensagem && Actions.novaMensagem({ studentId: s.id });
    });
  };

  // =====================================================================
  // Painel
  // =====================================================================
  const todoItems = (todo, date) => {
    const famMap = famNotices(date);
    return html`<ul class="items pd-w-list">${todo.slice(0, 5).map((x) => {
      const first = x.missing[0];
      const label = x.missing.length === 1 ? lessonLabel(first.period, first.subjectId) : `${x.missing.length} aulas sem chamada (${x.missing.map((p) => p.period + 'ª').join(', ')})`;
      const warned = famMap.size ? Q.roster(x.klass.id).filter((s) => famMap.has(s.id)).length : 0;
      return html`<li><span class="pd-w-ic">${icon('checkSquare')}</span><div class="grow"><b>${x.klass.name}</b><div class="person-sub">${label}${warned ? html` · <span class="pd-w-fam">${icon('message')}${U.plural(warned, 'falta avisada pela família', 'faltas avisadas pela família')}</span>` : ''}</div></div>
        <button type="button" class="btn sm" data-w-roll="${x.klass.id}" data-w-date="${date}" data-w-period="${first.period}">Fazer</button></li>`;
    })}</ul>${todo.length > 5 ? html`<p class="small muted">e mais ${U.plural(todo.length - 5, 'turma', 'turmas')}.</p>` : ''}`;
  };

  App.widget({
    id: 'chamadas-pendentes',
    order: 10,
    size: 'half',
    perm: 'chamada.registrar',
    render() {
      const T = U.today();
      const school = Q.isSchoolDay(T);
      const todo = school ? Q.rollsToDo(T) : [];
      const prevDay = Q.lastSchoolDays(1, T, false)[0];
      const late = prevDay ? Q.rollsToDo(prevDay) : [];
      const hol = Q.holiday(T);
      let body;
      if (!school) body = html`<p class="pd-w-msg">${icon('sun')}<span>Hoje não é dia letivo${hol ? ` (${hol})` : ''}. Bom descanso!</span></p>`;
      else if (!todo.length) body = html`<p class="pd-ok">${icon('checkCircle')}<span>Tudo em dia: as chamadas de hoje estão feitas.</span></p>`;
      else body = todoItems(todo, T);
      return html`<section class="card pd-widget">
        <div class="card-head"><h2>${icon('checkSquare')}Chamada de hoje</h2><a class="btn sm ghost" href="#chamada">Abrir chamada${icon('chevronRight')}</a></div>
        <div class="card-body">${body}
          ${late.length ? html`<div class="pd-w-late"><h3 class="small">Ficaram para trás · ${U.relDay(prevDay)} (${U.fmtDate(prevDay)})</h3>${todoItems(late, prevDay)}</div>` : ''}
        </div>
      </section>`;
    },
    mount(el) {
      el.addEventListener('click', (e) => {
        const b = e.target.closest('[data-w-roll]');
        if (b) Actions.fazerChamada(b.dataset.wRoll, { date: b.dataset.wDate, period: Number(b.dataset.wPeriod) });
      });
    },
  });

  App.widget({
    id: 'faltas-seguidas',
    order: 20,
    size: 'half',
    perm: 'chamada.ver',
    render() {
      const alert = Q.absenceAlert();
      const mine = Store.me.scope === 'todas' ? [] : Q.myClasses();
      const classes = mine.length ? mine : Q.classes();
      const list = [];
      classes.forEach((c) => {
        const streaks = Q.absenceStreaks(c.id);
        Q.roster(c.id).forEach((s) => {
          const n = streaks.get(s.id) || 0;
          if (n >= alert) list.push({ s, c, n });
        });
      });
      list.sort((a, b) => b.n - a.n || Q.cmpName(a.s, b.s));
      return html`<section class="card pd-widget">
        <div class="card-head"><h2>${icon('userX')}Faltas seguidas</h2><span class="sub">${alert} ou mais dias letivos${mine.length ? ' · suas turmas' : ''}</span></div>
        <div class="card-body">${list.length
          ? html`<ul class="items">${list.slice(0, 6).map(
              (x) => html`<li>${UI.avatar(x.s.name, 'sm', x.s.photo)}<div class="grow"><a class="person-name" href="#alunos/${x.s.id}/frequencia">${x.s.name}</a><div class="person-sub">${x.c.name}</div></div>${UI.pill(U.plural(x.n, 'falta', 'faltas'), 'bad')}</li>`,
            )}</ul>${list.length > 6 ? html`<p class="small muted">e mais ${U.plural(list.length - 6, 'aluno', 'alunos')}.</p>` : ''}`
          : html`<p class="pd-ok">${icon('checkCircle')}<span>Nenhum aluno com ${alert} ou mais faltas seguidas.</span></p>`}</div>
      </section>`;
    },
  });

  // =====================================================================
  // Registro
  // =====================================================================
  App.page({
    id: 'chamada',
    label: 'Chamada',
    icon: 'checkSquare',
    group: 'Dia a dia',
    order: 20,
    tab: 2,
    anyPerm: ['chamada.ver', 'chamada.registrar'],
    keys: 'presença falta frequência lista',
    badge: () => {
      const n = Q.rollsToDo().length;
      return n ? { n, title: n === 1 ? 'Uma turma com chamada pendente hoje' : `${n} turmas com chamada pendente hoje` } : null;
    },
    render,
    mount,
  });

  App.studentTab({ id: 'frequencia', label: 'Frequência', order: 25, perm: 'chamada.ver', render: renderFreq, mount: mountFreq });

  App.action({ id: 'fazer-chamada', label: 'Fazer chamada', icon: 'checkSquare', order: 20, perm: 'chamada.registrar', keys: 'presença falta lista', run: () => Actions.fazerChamada(null) });
})();
