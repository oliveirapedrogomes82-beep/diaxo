'use strict';
/* Notas — lançamento por turma, disciplina e etapa (nota e recuperação, gravação por célula), parecer descritivo
   na Educação Infantil, fechamento das etapas e liberação do boletim às famílias, conselho de classe e a aba
   "Boletim" da ficha do aluno (com versão para imprimir).
   Comandos: grades.set, terms.update, councils.set (web/core/commands/pedagogico.js). */
(() => {
  const R = Core.rules;
  const can = (p) => Store.can(p);
  const tf = (b) => (b ? 'true' : 'false');
  const COUNCIL = {
    aprovado: { label: 'Aprovado(a)', tone: 'ok' },
    recuperacao: { label: 'Em recuperação', tone: 'warn' },
    retido: { label: 'Retido(a)', tone: 'bad' },
    transferido: { label: 'Transferido(a)', tone: '' },
  };
  const fmt = (v) => (v == null ? '' : U.num(v));
  const tone = (v) => Q.gradeTone(v);
  const termCount = () => Q.terms().length;
  const lastTerm = () => termCount();
  /** Quem escreve o parecer (regra do comando grades.set). */
  const canParecer = (c) => !!c && can('notas.lancar') && (Store.me.scope === 'todas' || c.teacherId === Store.me.id || (c.assistantIds || []).includes(Store.me.id));
  /** A etapa aceita alterações para mim? */
  const termEditable = (term) => Q.termOpen(term) || can('notas.fechar');
  const canCloseTerms = () => can('notas.fechar') && Store.me.scope === 'todas';

  // =====================================================================
  // Estado
  // =====================================================================
  const NS = () => {
    const v = PageState.get('notas', {});
    if (!v.errors) v.errors = {};
    if (!v.view) v.view = 'notas';
    return v;
  };
  const gradeClasses = () => Q.workClasses().filter((c) => Q.roster(c.id).length);
  /** Disciplinas mostradas: as que posso lançar (ou todas, para quem só consulta). */
  const subjectsFor = (c, showAll) => {
    const all = Q.classSubjects(c.id);
    if (!can('notas.lancar')) return { list: all, editable: new Set(), hidden: 0 };
    const mine = all.filter((s) => Q.canGradeSubject(c.id, s.id));
    if (!mine.length) return { list: all, editable: new Set(), hidden: 0, none: true };
    return { list: showAll ? all : mine, editable: new Set(mine.map((s) => s.id)), hidden: all.length - mine.length };
  };
  const missingFor = (c, subjectId, term) => Q.roster(c.id).filter((s) => Q.grade(s.id, subjectId, term) == null).length;

  const resolve = (rest = []) => {
    const v = NS();
    const restKey = rest.join('/');
    if (restKey && restKey !== v.lastRest) {
      if (Q.klass(rest[0])) v.classId = rest[0];
      if (rest[1]) v.subjectId = rest[1];
      if (rest[2] && /^\d$/.test(rest[2])) v.term = Number(rest[2]);
    }
    v.lastRest = restKey;
    const list = gradeClasses();
    if (!list.some((c) => c.id === v.classId)) {
      v.classId = (list[0] || {}).id || null;
      v.subjectId = null;
    }
    if (!Q.terms().includes(Number(v.term))) v.term = Q.currentTerm();
    v.term = Number(v.term);
    if (v.view === 'conselho' && !can('notas.fechar')) v.view = 'notas';
    const c = v.classId ? Q.klass(v.classId) : null;
    if (c && Q.evaluation(c.id) !== 'parecer') {
      const { list: subs, editable } = subjectsFor(c, v.showAll);
      if (!subs.some((s) => s.id === v.subjectId)) {
        const pend = subs.find((s) => editable.has(s.id) && missingFor(c, s.id, v.term) > 0);
        v.subjectId = (pend || subs[0] || {}).id || null;
      }
    }
    return { v, list, c };
  };

  // =====================================================================
  // Tela principal
  // =====================================================================
  const termSeg = (v) =>
    html`<div class="seg pd-terms" role="group" aria-label="Etapa">${Q.terms().map((t) => {
      const open = Q.termOpen(t);
      const rel = Q.termReleased(t);
      const title = `${Q.termLabel(t)}${t === Q.currentTerm() ? ' (atual)' : ''}: ${rel ? 'fechado e liberado às famílias' : open ? 'aberto' : 'fechado'}`;
      return html`<button type="button" data-ng-term="${t}" aria-pressed="${tf(t === v.term)}" title="${title}">${Q.termLabel(t, { short: true })}${!open ? icon(rel ? 'eye' : 'lock', 'pd-term-ic') : ''}${t === Q.currentTerm() ? html`<span class="pd-cur-dot" aria-hidden="true"></span>` : ''}<span class="sr-only">${title}</span></button>`;
    })}</div>`;

  const termNotice = (v) => {
    const t = v.term;
    if (Q.termOpen(t)) {
      if (t > Q.currentTerm()) return html`<div class="notice">${icon('info')}<span class="grow">O ${Q.termLabel(t)} ainda não começou. Você pode adiantar notas, se precisar.</span></div>`;
      return '';
    }
    const rel = Q.termReleased(t);
    if (!can('notas.fechar'))
      return html`<div class="notice warn">${icon('lock')}<span class="grow"><b>${U.cap(Q.termLabel(t))} fechado.</b> As notas ficam só para consulta. Para corrigir alguma, fale com a coordenação.</span></div>`;
    return html`<div class="notice warn">${icon('lock')}<span class="grow"><b>${U.cap(Q.termLabel(t))} fechado.</b> Professores não alteram mais; você pode corrigir porque fecha etapas.${rel ? ' O boletim já está liberado: as famílias veem a correção na hora.' : ''}</span>${canCloseTerms() ? html`<button type="button" class="btn sm" data-ng-terms>Etapas e boletim</button>` : ''}</div>`;
  };

  const statsHTML = (c, subjectId, term) => {
    const kids = Q.roster(c.id);
    const vals = kids.map((s) => Q.termGrade(s.id, subjectId, term)).filter((x) => x != null);
    const filled = kids.filter((s) => Q.grade(s.id, subjectId, term) != null).length;
    const st = Q.settings();
    const below = vals.filter((x) => x < st.passing).length;
    const avg = U.avg(vals);
    return html`
      <div class="card kpi"><span class="kpi-label">Lançadas</span><span class="kpi-value">${filled}<small> de ${kids.length}</small></span>${UI.meter(kids.length ? (filled / kids.length) * 100 : 0, filled === kids.length ? 'ok' : '')}</div>
      <div class="card kpi"><span class="kpi-label">Média da turma</span><span class="kpi-value ${tone(avg)}">${U.num(avg)}</span><span class="kpi-foot">no ${Q.termLabel(term)}</span></div>
      <div class="card kpi"><span class="kpi-label">Abaixo da média</span><span class="kpi-value ${below ? 'pd-g-bad' : ''}">${below}</span><span class="kpi-foot">de ${U.num(st.passing)}, com a recuperação</span></div>
      <div class="card kpi hide-sm"><span class="kpi-label">Maior e menor</span><span class="kpi-value">${U.num(vals.length ? Math.max(...vals) : null)}<small> / ${U.num(vals.length ? Math.min(...vals) : null)}</small></span></div>`;
  };

  const sitCell = (sid, subjectId) => {
    const fin = Q.subjectFinal(sid, subjectId);
    const complete = R.termsWithGrade(Store.state.grades, Q.settings(), Q.year(), sid, subjectId) === termCount();
    const sit = Q.situation(fin, complete);
    return sit.tone ? UI.pill(sit.label, sit.tone) : html`<span class="muted small">—</span>`;
  };
  const avgCell = (sid, subjectId) => {
    const a = Q.subjectAverage(sid, subjectId);
    return html`<b class="${tone(a)}">${U.num(a)}</b>`;
  };

  const cellInput = (v, s, subjectId, term, editable, label) => {
    const key = R.gradeKey(Q.year(), s.id, subjectId, term);
    const err = v.errors[key];
    const val = err ? err.value : fmt(Q.grade(s.id, subjectId, term));
    const g = Q.grade(s.id, subjectId, term);
    return html`<span class="pd-cell"><input class="grade-input ${err ? 'invalid' : g != null && g < Q.settings().passing ? 'low' : ''}" data-ng-sid="${s.id}" data-ng-t="${term}" value="${val}" inputmode="decimal" autocomplete="off" maxlength="4" aria-label="${label} de ${s.name}" ${err ? raw(`aria-invalid="true" title="${U.esc(err.message)}"`) : ''} ${editable ? '' : raw('disabled')}><span class="pd-cell-st" aria-hidden="true">${err ? icon('alert') : ''}</span></span>`;
  };

  /** Alguma etapa não aberta na tabela tem nota trocada pela recuperação (marca "R")? */
  const recUsed = (c, subjectId, sel) =>
    Q.terms().some((t) => t !== sel && Q.roster(c.id).some((s) => {
      const rec = Q.grade(s.id, subjectId, 'rec' + t);
      return rec != null && rec > (Q.grade(s.id, subjectId, t) ?? -1);
    }));

  const gradesTable = (v, c, subjectId, editable) => {
    const kids = Q.roster(c.id);
    const terms = Q.terms();
    const sel = v.term;
    const last = sel === lastTerm();
    const tl = (t) => Q.termLabel(t, { short: true });
    return html`<div class="table-wrap"><table class="table grades responsive pd-grades">
      <thead><tr><th class="num hide-sm">Nº</th><th>Aluno</th>
        ${terms.map((t) =>
          t === sel
            ? html`<th class="center cur">${tl(t)}</th><th class="center cur" title="Recuperação da etapa: vale a maior nota">Rec.</th>`
            : html`<th class="center term-btn hide-sm"><button type="button" data-ng-term="${t}" title="Abrir o ${Q.termLabel(t)}">${tl(t)}</button></th>`,
        )}
        ${last ? html`<th class="center cur" title="Recuperação final: para quem ficou abaixo da média no ano">Final</th>` : ''}
        <th class="num">Média</th><th class="hide-sm">Situação</th></tr></thead>
      <tbody>${kids.map((s, i) => html`<tr data-ng-row="${s.id}">
        <td class="num muted hide-sm">${i + 1}</td>
        <td class="first"><div class="person">${UI.avatar(s.name, 'sm', s.photo)}<a class="person-name" href="#alunos/${s.id}/boletim" tabindex="-1">${s.name}</a></div></td>
        ${terms.map((t) => {
          if (t !== sel) {
            const g = Q.grade(s.id, subjectId, t);
            const tg = Q.termGrade(s.id, subjectId, t);
            const rec = Q.grade(s.id, subjectId, 'rec' + t);
            const byRec = rec != null && rec > (g ?? -1);
            return html`<td class="center num hide-sm ${tone(tg)}" title="${rec != null ? `Nota ${fmt(g) || '—'} · recuperação ${fmt(rec)}` : ''}">${U.num(tg)}${byRec ? html`<sup class="pd-rec-mark" aria-hidden="true">R</sup><span class="pd-rec-was">era ${fmt(g) || '—'}</span>` : ''}</td>`;
          }
          return html`<td class="center cur" data-l="${tl(t)}">${cellInput(v, s, subjectId, String(t), editable, `Nota do ${Q.termLabel(t)}`)}</td>
            <td class="center cur" data-l="Rec.">${cellInput(v, s, subjectId, 'rec' + t, editable, `Recuperação do ${Q.termLabel(t)}`)}</td>`;
        })}
        ${last ? html`<td class="center cur" data-l="Final">${cellInput(v, s, subjectId, 'rf', editable, 'Recuperação final')}</td>` : ''}
        <td class="num end" data-l="Média" data-ng-avg>${avgCell(s.id, subjectId)}</td>
        <td class="hide-sm" data-ng-sit>${sitCell(s.id, subjectId)}</td>
      </tr>`)}</tbody></table></div>`;
  };

  const parecerList = (v, c, editable) => {
    const kids = Q.roster(c.id);
    const term = v.term;
    const prev = Q.terms().filter((t) => t !== term);
    return html`<div class="pd-pareceres">${kids.map((s) => {
      const key = R.gradeKey(Q.year(), s.id, '_parecer', term);
      const err = v.errors[key];
      const text = err ? err.value : Q.grade(s.id, '_parecer', term) || '';
      const olds = prev.map((t) => [t, Q.grade(s.id, '_parecer', t)]).filter(([, x]) => x);
      return html`<section class="card pd-par" data-ng-psid="${s.id}">
        <div class="pd-par-head">${UI.avatar(s.name, 'sm', s.photo)}<div class="grow"><a class="person-name" href="#alunos/${s.id}/boletim">${s.name}</a><span class="person-sub">${U.age(s.birth) != null ? `${U.age(s.birth)} anos` : ''}</span></div>
          <span data-ng-ppill>${text ? UI.pill('Escrito', 'ok') : UI.pill('Pendente', 'warn')}</span></div>
        ${editable
          ? html`<label class="sr-only" for="ng-p-${s.id}">Parecer de ${s.name} no ${Q.termLabel(term)}</label><textarea id="ng-p-${s.id}" class="input pd-par-text ${err ? 'invalid' : ''}" data-ng-par="${s.id}" rows="5" maxlength="4000" placeholder="Como ${U.firstName(s.name)} está se desenvolvendo: interações, linguagem, movimento, autonomia, conquistas e próximos passos.">${text}</textarea>
            <div class="pd-par-foot small muted"><span data-ng-pcount>${text.length}/4000</span><span data-ng-pstatus class="${err ? 'pd-g-bad' : ''}">${err ? err.message : ''}</span></div>`
          : html`<p class="pd-pre pd-par-ro">${text || html`<span class="muted">Ainda não escrito.</span>`}</p>`}
        ${olds.length ? html`<details class="pd-par-old"><summary>${olds.length === 1 ? 'Parecer anterior' : `Pareceres anteriores (${olds.length})`}</summary>${olds.map(([t, x]) => html`<div><b class="small">${U.cap(Q.termLabel(t))}</b><p class="pd-pre small">${x}</p></div>`)}</details>` : ''}
      </section>`;
    })}</div>`;
  };

  /** Sem turma com alunos: quem monta as turmas (escopo "todas" ou turmas.gerenciar) recebe o caminho; os demais, "peça à coordenação". */
  const emptyNoRoster = () => {
    const anyClass = Q.classes().length > 0;
    if (Store.me.scope === 'todas' || can('turmas.gerenciar')) {
      const mk = !anyClass && can('turmas.gerenciar') && typeof Actions.novaTurma === 'function';
      const enroll = anyClass && can('alunos.cadastrar') && typeof Actions.matricular === 'function';
      return UI.empty({
        icon: 'grade',
        title: anyClass ? 'Nenhum aluno matriculado ainda' : 'Ainda não há turmas com alunos',
        text: anyClass ? 'As turmas ainda não têm alunos. Matricule os alunos para lançar notas e pareceres.' : mk ? 'Crie as turmas, defina as disciplinas e matricule os alunos para lançar notas e pareceres.' : 'Quando as turmas forem criadas e os alunos matriculados, as notas aparecem aqui.',
        action: html`${mk ? html`<button type="button" class="btn primary" data-ng-setup="turma">Criar turma</button>` : ''}${enroll ? html`<button type="button" class="btn primary" data-ng-setup="aluno">Matricular aluno</button>` : ''}`,
      });
    }
    return UI.empty({
      icon: 'grade',
      title: 'Nenhuma turma com alunos',
      text: can('notas.lancar') ? 'Você ainda não está em nenhuma turma com alunos. Peça à coordenação para incluir você na turma e na disciplina.' : 'Quando houver turmas com alunos, as notas aparecem aqui.',
    });
  };

  const render = (rest) => {
    const { v, list, c } = resolve(rest);
    const flag = html`<span class="saved-flag pd-flag" id="ng-flag" aria-live="polite">${v.flagAt ? html`${icon('check')} Salvo às ${v.flagAt}` : ''}</span>`;
    const closeBtn = canCloseTerms() ? html`<button type="button" class="btn" data-ng-terms>${icon('lock')}<span>Etapas e boletim</span></button>` : '';
    if (!list.length) return html`<div class="page-head"><div><h1>Notas</h1></div>${closeBtn}</div><section class="card">${emptyNoRoster()}</section>`;
    const parecer = Q.evaluation(c.id) === 'parecer';
    const lead = parecer
      ? 'Na Educação Infantil a avaliação é por parecer descritivo: escreva como cada criança está se desenvolvendo na etapa. O texto é salvo sozinho.'
      : 'Digite a nota e aperte Enter para ir ao próximo aluno. Aceita vírgula (7,5). Cada nota é salva na hora.';
    const toolbar = html`<div class="toolbar pd-ng-toolbar">
      ${list.length > 1
        ? html`<label class="sr-only" for="ng-class">Turma</label><select class="input pd-ng-class" id="ng-class">${list.map((x) => html`<option value="${x.id}" ${x.id === c.id ? raw('selected') : ''}>${x.name}</option>`)}</select>`
        : html`<span class="pd-ng-one">${icon('layers')}${c.name}</span>`}
      ${v.view === 'conselho' ? '' : termSeg(v)}
      <span class="grow"></span>
      ${can('notas.fechar') ? html`<div class="seg" role="group" aria-label="Visão">${[['notas', parecer ? 'Pareceres' : 'Notas'], ['conselho', 'Conselho de classe']].map(([k, l]) => html`<button type="button" data-ng-view="${k}" aria-pressed="${tf(v.view === k)}">${l}</button>`)}</div>` : ''}
    </div>`;
    const head = html`<div class="page-head"><div><h1>${parecer ? 'Pareceres' : 'Notas'}</h1><p class="lead">${v.view === 'conselho' ? 'Resultado do ano de cada aluno, decidido no conselho de classe.' : lead}</p></div><div class="btn-row">${flag}${closeBtn}</div></div>`;
    if (v.view === 'conselho') return html`${head}${toolbar}${councilView(c)}`;
    const errs = Object.entries(v.errors).filter(([k]) => k.startsWith(Q.year() + '|'));
    const errNotice = errs.length
      ? html`<div class="notice bad">${icon('alert')}<span class="grow"><b>${U.plural(errs.length, 'nota não foi salva', 'notas não foram salvas')}.</b> ${errs[0][1].message}</span><button type="button" class="btn sm" data-ng-clear-errors>Descartar</button></div>`
      : '';
    if (parecer) {
      const editable = canParecer(c) && termEditable(v.term);
      const kids = Q.roster(c.id);
      const done = kids.filter((s) => Q.grade(s.id, '_parecer', v.term)).length;
      return html`${head}${toolbar}${termNotice(v)}${errNotice}
        ${!canParecer(c) && can('notas.lancar') ? html`<div class="notice">${icon('info')}<span class="grow">O parecer é escrito pela professora regente e pelas auxiliares da turma. Aqui você só consulta.</span></div>` : ''}
        <div class="pd-par-summary"><span><b>${done}</b> de ${kids.length} pareceres escritos no ${Q.termLabel(v.term)}</span>${UI.meter(kids.length ? (done / kids.length) * 100 : 0, done === kids.length ? 'ok' : '')}</div>
        ${parecerList(v, c, editable)}`;
    }
    const { list: subs, editable: mine, hidden, none } = subjectsFor(c, v.showAll);
    const sub = Q.subject(v.subjectId);
    if (!sub)
      return html`${head}${toolbar}<section class="card">${UI.empty({ icon: 'book', title: 'Turma sem disciplinas', text: 'Inclua as disciplinas da turma em Turmas › Equipe.' })}</section>`;
    const editable = mine.has(sub.id) && termEditable(v.term);
    const t = Q.teacherOf(c.id, sub.id);
    const teacher = t ? Q.userName(t) : ['Educação Infantil', 'Fundamental I'].includes(c.segment) && c.teacherId ? `${Q.userName(c.teacherId)} (regente)` : null;
    return html`${head}${toolbar}
      <div class="chips pd-subjects" role="group" aria-label="Disciplina">${subs.map((x) => {
        const miss = missingFor(c, x.id, v.term);
        const n = Q.roster(c.id).length;
        return html`<button type="button" class="chip" data-ng-subject="${x.id}" aria-pressed="${tf(x.id === sub.id)}"><span class="dot" style="background:var(--cat-${x.color})"></span>${x.name}${!mine.has(x.id) && can('notas.lancar') ? icon('lock', 'pd-chip-ic') : miss === 0 ? icon('check', 'pd-chip-ic pd-t-ok') : html`<span class="pd-miss" title="${U.plural(miss, 'nota faltando', 'notas faltando')}">${miss === n ? 'vazio' : miss}</span>`}</button>`;
      })}
      ${hidden && !v.showAll ? html`<button type="button" class="chip pd-chip-more" data-ng-showall>${icon('eye')}Ver as outras ${hidden}</button>` : ''}
      ${hidden && v.showAll ? html`<button type="button" class="chip pd-chip-more" data-ng-showall>Só as minhas</button>` : ''}</div>
      ${none ? html`<div class="notice">${icon('info')}<span class="grow">Você não dá nenhuma disciplina no ${c.name}: as notas ficam só para consulta.</span></div>` : ''}
      ${termNotice(v)}${errNotice}
      <section class="kpis" id="ng-stats">${statsHTML(c, sub.id, v.term)}</section>
      <section class="card">
        <div class="card-head"><div><h2>${sub.name} · ${c.name}</h2><span class="sub">${teacher ? `Professor(a): ${teacher}` : 'Sem professor(a) definido(a)'}${!mine.has(sub.id) && can('notas.lancar') ? ' · somente consulta' : ''}</span></div>
</div>
        ${gradesTable(v, c, sub.id, editable)}
        <p class="small muted pd-grades-foot">Rec.: recuperação do ${Q.termLabel(v.term)} (vale a maior nota).${v.term === lastTerm() ? ` Final: recuperação final, para quem fechou o ano abaixo de ${U.num(Q.settings().passing)}.` : ''} Média: média anual das etapas.${recUsed(c, sub.id, v.term) ? html`<span class="pd-rec-legend hide-sm"> <b class="pd-rec-mark">R</b> nas outras etapas: vale a nota da recuperação; embaixo, a nota que o aluno tinha tirado.</span>` : ''}</p>
      </section>`;
  };

  // =====================================================================
  // Eventos: notas e pareceres
  // =====================================================================
  const mount = (el, rest) => {
    const { v, list, c } = resolve(rest);
    if (!list.length || !c) {
      el.addEventListener('click', (e) => {
        if (e.target.closest('[data-ng-terms]')) return openTerms();
        const b = e.target.closest('[data-ng-setup]');
        if (b && b.dataset.ngSetup === 'turma') Actions.novaTurma();
        else if (b) Actions.matricular({});
      });
      return;
    }
    const flag = () => UI.$('#ng-flag', el);
    const setFlag = () => {
      v.flagAt = U.fmtTime(new Date());
      const f = flag();
      f && UI.setHTML(f, html`${icon('check')} Salvo às ${v.flagAt}`);
    };
    /** Último valor enviado por chave (evita gravar duas vezes o mesmo valor: Enter + saída do campo). */
    const sent = new Map();

    const commit = (input) => {
      const sid = input.dataset.ngSid;
      const term = input.dataset.ngT;
      const subjectId = v.subjectId;
      const key = R.gradeKey(Q.year(), sid, subjectId, term);
      const val = U.parseGrade(input.value);
      const st = UI.$('.pd-cell-st', input.parentElement);
      if (Number.isNaN(val)) {
        input.classList.add('invalid');
        input.setAttribute('aria-invalid', 'true');
        input.title = 'Use uma nota de 0 a 10 (ex.: 7,5)';
        if (st) UI.setHTML(st, icon('alert'));
        const f = flag();
        f && UI.setHTML(f, html`<span class="pd-g-bad">${icon('alert')} Nota inválida: use de 0 a 10</span>`);
        return false;
      }
      input.classList.remove('invalid');
      input.removeAttribute('aria-invalid');
      input.title = '';
      const cur = Q.grade(sid, subjectId, term);
      const last = sent.has(key) ? sent.get(key) : cur;
      input.value = fmt(val);
      input.classList.toggle('low', val != null && val < Q.settings().passing);
      if ((last ?? null) === (val ?? null) && !v.errors[key]) {
        if (st && !st.querySelector('.spinner')) UI.setHTML(st, '');
        return true;
      }
      sent.set(key, val);
      if (st) UI.setHTML(st, UI.spinner());
      input.closest('.pd-cell').classList.add('saving');
      Store.cmd('grades.set', { studentId: sid, subjectId, term, value: val })
        .then(() => {
          delete v.errors[key];
          const box = document.contains(input) ? input.closest('.pd-cell') : null;
          if (box) {
            box.classList.remove('saving');
            const s2 = UI.$('.pd-cell-st', box);
            s2 && UI.setHTML(s2, icon('check'));
            const tr = input.closest('tr');
            const a = tr && UI.$('[data-ng-avg]', tr);
            const s = tr && UI.$('[data-ng-sit]', tr);
            a && UI.setHTML(a, avgCell(sid, subjectId));
            s && UI.setHTML(s, sitCell(sid, subjectId));
            const stats = UI.$('#ng-stats', el);
            stats && UI.setHTML(stats, statsHTML(Q.klass(v.classId), subjectId, v.term));
          }
          setFlag();
        })
        .catch((err) => {
          sent.delete(key);
          v.errors[key] = { value: input.value, message: (err && err.message) || 'Não foi possível salvar.' };
          if (document.contains(input)) {
            const box = input.closest('.pd-cell');
            box.classList.remove('saving');
            input.classList.add('invalid');
            input.setAttribute('aria-invalid', 'true');
            input.title = v.errors[key].message;
            const s2 = UI.$('.pd-cell-st', box);
            s2 && UI.setHTML(s2, icon('alert'));
          }
          UI.errorToast(err);
        });
      return true;
    };

    const inputs = (col) => UI.$$(`input[data-ng-t="${CSS.escape(col)}"]:not([disabled])`, el);
    el.addEventListener('keydown', (e) => {
      const inp = e.target.closest && e.target.closest('input[data-ng-sid]');
      if (!inp) return;
      const col = inputs(inp.dataset.ngT);
      const i = col.indexOf(inp);
      if (e.key === 'Enter' || e.key === 'ArrowDown') {
        e.preventDefault();
        if (!commit(inp)) return;
        const nx = col[i + 1];
        if (nx) nx.focus();
        else if (e.key === 'Enter') {
          inp.blur();
          UI.toast('Fim da lista. As notas desta coluna estão salvas.', { ic: 'checkCircle' });
        }
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (!commit(inp)) return;
        col[i - 1] && col[i - 1].focus();
      } else if (e.key === 'Escape') {
        const key = R.gradeKey(Q.year(), inp.dataset.ngSid, v.subjectId, inp.dataset.ngT);
        if (!v.errors[key]) {
          e.stopPropagation();
          inp.value = fmt(Q.grade(inp.dataset.ngSid, v.subjectId, inp.dataset.ngT));
          inp.classList.remove('invalid');
        }
      }
    });
    el.addEventListener('input', (e) => {
      const inp = e.target.closest('input[data-ng-sid]');
      if (inp) {
        const bad = Number.isNaN(U.parseGrade(inp.value));
        inp.classList.toggle('invalid', bad);
        return;
      }
      const ta = e.target.closest('[data-ng-par]');
      if (ta) {
        const cnt = UI.$('[data-ng-pcount]', ta.closest('.pd-par'));
        cnt && (cnt.textContent = `${ta.value.length}/4000`);
        scheduleParecer(ta);
      }
    });
    el.addEventListener('change', (e) => {
      const inp = e.target.closest('input[data-ng-sid]');
      if (inp) return void commit(inp);
      const ta = e.target.closest('[data-ng-par]');
      if (ta) return void saveParecer(ta);
      if (e.target.id === 'ng-class') {
        v.classId = e.target.value;
        v.subjectId = null;
        v.showAll = false;
        App.render();
      }
    });
    el.addEventListener('focusin', (e) => {
      const inp = e.target.closest('input[data-ng-sid]');
      if (inp) inp.select();
    });

    // ---------- parecer ----------
    const parTimers = new Map();
    const parSent = new Map();
    const scheduleParecer = (ta) => {
      clearTimeout(parTimers.get(ta.dataset.ngPar));
      parTimers.set(ta.dataset.ngPar, setTimeout(() => saveParecer(ta), 1800));
      const st = UI.$('[data-ng-pstatus]', ta.closest('.pd-par'));
      st && (st.textContent = 'Alterações não salvas…');
    };
    const saveParecer = (ta) => {
      const sid = ta.dataset.ngPar;
      clearTimeout(parTimers.get(sid));
      const text = ta.value.trim();
      const key = R.gradeKey(Q.year(), sid, '_parecer', v.term);
      const cur = Q.grade(sid, '_parecer', v.term) || '';
      const last = parSent.has(key) ? parSent.get(key) : cur;
      const box = ta.closest('.pd-par');
      const st = UI.$('[data-ng-pstatus]', box);
      if (last === text && !v.errors[key]) {
        st && (st.textContent = text ? 'Salvo' : '');
        return;
      }
      parSent.set(key, text);
      st && (st.textContent = 'Salvando…');
      st && st.classList.remove('pd-g-bad');
      Store.cmd('grades.set', { studentId: sid, subjectId: '_parecer', term: v.term, value: text })
        .then(() => {
          delete v.errors[key];
          if (document.contains(ta)) {
            ta.classList.remove('invalid');
            st && (st.textContent = `Salvo às ${U.fmtTime(new Date())}`);
            const pill = UI.$('[data-ng-ppill]', box);
            pill && UI.setHTML(pill, text ? UI.pill('Escrito', 'ok') : UI.pill('Pendente', 'warn'));
          }
          setFlag();
        })
        .catch((err) => {
          parSent.delete(key);
          v.errors[key] = { value: ta.value, message: (err && err.message) || 'Não foi possível salvar.' };
          if (document.contains(ta)) {
            ta.classList.add('invalid');
            st && (st.textContent = v.errors[key].message);
            st && st.classList.add('pd-g-bad');
          }
          UI.errorToast(err);
        });
    };

    el.addEventListener('click', (e) => {
      const t = e.target.closest('[data-ng-term]');
      if (t) {
        v.term = Number(t.dataset.ngTerm);
        App.render();
        return;
      }
      const sb = e.target.closest('[data-ng-subject]');
      if (sb) {
        v.subjectId = sb.dataset.ngSubject;
        App.render();
        const first = document.querySelector('main input[data-ng-sid]:not([disabled])');
        first && first.focus({ preventScroll: true });
        return;
      }
      if (e.target.closest('[data-ng-showall]')) {
        v.showAll = !v.showAll;
        App.render();
        return;
      }
      const vw = e.target.closest('[data-ng-view]');
      if (vw) {
        v.view = vw.dataset.ngView;
        App.render();
        return;
      }
      if (e.target.closest('[data-ng-terms]')) return openTerms();
      if (e.target.closest('[data-ng-clear-errors]')) {
        v.errors = {};
        App.render();
        return;
      }
      const cs = e.target.closest('[data-ng-council]');
      if (cs) return openCouncil(cs.dataset.ngCouncil);
    });
  };

  // =====================================================================
  // Etapas: fechar e liberar o boletim
  // =====================================================================
  const termProgress = (term) => {
    let total = 0;
    let filled = 0;
    for (const c of Q.classes()) {
      const kids = Q.roster(c.id);
      if (Q.evaluation(c.id) === 'parecer') {
        total += kids.length;
        filled += kids.filter((s) => Q.grade(s.id, '_parecer', term)).length;
        continue;
      }
      for (const sub of Q.classSubjects(c.id)) {
        total += kids.length;
        filled += kids.filter((s) => Q.grade(s.id, sub.id, term) != null).length;
      }
    }
    return { total, filled, missing: total - filled, pct: total ? (filled / total) * 100 : 0 };
  };
  const familiesCount = () => new Set(Q.students().map((s) => s.id)).size;

  const termsBody = () => {
    const rows = Q.terms().map((t) => {
      const open = Q.termOpen(t);
      const rel = Q.termReleased(t);
      const p = termProgress(t);
      const status = rel ? UI.pill('Liberado às famílias', 'ok') : open ? UI.pill('Aberto', 'info') : UI.pill('Fechado', 'warn');
      const actions = [];
      if (open) actions.push(html`<button type="button" class="btn sm" data-tm="close" data-t="${t}">${icon('lock')}Fechar</button>`);
      else {
        if (!rel) actions.push(html`<button type="button" class="btn sm primary" data-tm="release" data-t="${t}">${icon('eye')}Liberar às famílias</button>`);
        else actions.push(html`<button type="button" class="btn sm" data-tm="unrelease" data-t="${t}">${icon('eyeOff')}Recolher boletim</button>`);
        actions.push(html`<button type="button" class="btn sm ghost" data-tm="open" data-t="${t}">Reabrir</button>`);
      }
      return html`<tr><td class="first"><b>${U.cap(Q.termLabel(t))}</b>${t === Q.currentTerm() ? html` <span class="pill mark plain">atual</span>` : ''}</td>
        <td data-l="Lançado"><div class="mini-bar pd-mini-left">${UI.meter(p.pct, p.missing ? '' : 'ok')}<span class="small">${U.pct(p.pct)}</span></div>${p.missing ? html`<div class="person-sub">faltam ${U.int(p.missing)}</div>` : ''}</td>
        <td data-l="Situação">${status}</td>
        <td class="end"><div class="btn-row pd-tm-actions">${actions}</div></td></tr>`;
    });
    return html`<div class="pd-terms-help">
        <p><b>Fechar a etapa:</b> professores não conseguem mais alterar as notas e pareceres dela. Quem tem permissão de fechar etapas ainda corrige.</p>
        <p><b>Liberar o boletim:</b> as famílias passam a ver no Portal as notas e os pareceres da etapa. Só dá para liberar uma etapa fechada.</p>
      </div>
      <div class="table-wrap"><table class="table responsive pd-terms-table"><thead><tr><th>Etapa</th><th>Lançado</th><th>Situação</th><th><span class="sr-only">Ações</span></th></tr></thead><tbody>${rows}</tbody></table></div>`;
  };

  const openTerms = () => {
    if (!canCloseTerms()) return;
    UI.modal({
      title: 'Etapas e boletim',
      sub: `Ano letivo ${Q.year()} · ${Q.terms().length} ${Q.settings().termLabel === 'trimestre' ? 'trimestres' : Q.settings().termLabel === 'semestre' ? 'semestres' : 'bimestres'}`,
      size: 'lg',
      body: termsBody(),
      foot: html`<button type="button" class="btn primary" data-close>Pronto</button>`,
      onMount(el, api) {
        el.addEventListener('click', async (e) => {
          const b = e.target.closest('[data-tm]');
          if (!b) return;
          const t = Number(b.dataset.t);
          const label = Q.termLabel(t);
          const what = b.dataset.tm;
          let input;
          let ok;
          if (what === 'close') {
            const p = termProgress(t);
            if (p.missing) {
              const go = await UI.confirm({ title: `Fechar o ${label}?`, text: html`<p>Ainda faltam <b>${U.int(p.missing)}</b> ${p.missing === 1 ? 'nota ou parecer' : 'notas ou pareceres'} nesta etapa (${U.pct(p.pct)} lançado).</p><p style="margin-top:8px">Depois de fechada, só quem tem permissão de fechar etapas consegue lançar ou corrigir.</p>`, ok: 'Fechar mesmo assim' });
              if (!go) return;
            }
            input = { term: t, closed: true };
            ok = `${U.cap(label)} fechado`;
          } else if (what === 'release') {
            const go = await UI.confirm({ title: `Liberar o boletim do ${label}?`, text: html`<p>As famílias de <b>${U.plural(familiesCount(), 'aluno', 'alunos')}</b> vão ver no Portal as notas e os pareceres do ${label}.</p><p style="margin-top:8px">Confira se está tudo lançado: depois que a família vê, a correção fica visível para ela.</p>`, ok: 'Liberar às famílias' });
            if (!go) return;
            input = { term: t, released: true };
            ok = `Boletim do ${label} liberado às famílias`;
          } else if (what === 'unrelease') {
            input = { term: t, released: false };
            ok = `Boletim do ${label} recolhido: as famílias deixam de ver esta etapa`;
          } else {
            input = { term: t, closed: false, released: false };
            ok = `${U.cap(label)} reaberto para os professores`;
          }
          const res = await UI.act('terms.update', input, { btn: b, ok });
          if (res && !api.closed) api.setBody(termsBody());
        });
      },
    });
  };

  // =====================================================================
  // Conselho de classe
  // =====================================================================
  const councilInfo = (s, c) => {
    const st = Q.settings();
    const subs = Q.classSubjects(c.id);
    const finals = subs.map((x) => ({ s: x, v: Q.subjectFinal(s.id, x.id) }));
    const below = finals.filter((x) => x.v != null && x.v < st.passing);
    const avg = U.avg(finals.map((x) => x.v).filter((x) => x != null));
    const att = Q.attendanceRate(s.id);
    const min = Q.minAttendance(c.id);
    const parecer = Q.evaluation(c.id) === 'parecer';
    const suggestion = parecer ? (att != null && att < min ? null : 'aprovado') : below.length || (att != null && att < min) ? (below.length ? 'recuperacao' : null) : avg != null ? 'aprovado' : null;
    return { below, avg, att, min, suggestion, parecer };
  };
  const councilView = (c) => {
    const kids = Q.roster(c.id);
    if (!kids.length) return html`<section class="card">${UI.empty({ icon: 'users', title: 'Turma sem alunos', text: 'Não há alunos ativos nesta turma.' })}</section>`;
    const rows = kids.map((s) => ({ s, info: councilInfo(s, c), co: Q.council(s.id) }));
    const done = rows.filter((r) => r.co).length;
    const counts = {};
    rows.forEach((r) => r.co && (counts[r.co.result] = (counts[r.co.result] || 0) + 1));
    return html`<section class="card">
      <div class="card-head"><div><h2>Conselho de classe · ${c.name}</h2><span class="sub">${done} de ${kids.length} com resultado registrado. O resultado só aparece no boletim da família quando marcado como liberado.</span></div>
        <div class="btn-row">${Object.entries(counts).map(([k, n]) => UI.pill(`${n} ${COUNCIL[k].label.toLowerCase()}`, COUNCIL[k].tone))}</div></div>
      <div class="table-wrap"><table class="table responsive pd-council">
        <thead><tr><th>Aluno</th>${rows[0].info.parecer ? '' : html`<th class="num">Média</th><th>Abaixo da média</th>`}<th class="num">Frequência</th><th>Resultado</th><th><span class="sr-only">Ações</span></th></tr></thead>
        <tbody>${rows.map(({ s, info, co }) => html`<tr>
          <td class="first"><div class="person">${UI.avatar(s.name, 'sm', s.photo)}<a class="person-name" href="#alunos/${s.id}/boletim">${s.name}</a></div></td>
          ${info.parecer ? '' : html`<td class="num" data-l="Média"><b class="${tone(info.avg)}">${U.num(info.avg)}</b></td>
          <td data-l="Abaixo">${info.below.length ? html`<span class="small pd-g-bad">${info.below.map((x) => x.s.short || x.s.name).join(', ')}</span>` : html`<span class="small muted">nenhuma</span>`}</td>`}
          <td class="num" data-l="Frequência"><span class="pd-t-${Q.attTone(info.att, c.id)}">${U.pct(info.att)}</span></td>
          <td data-l="Resultado">${co ? html`${UI.pill(COUNCIL[co.result].label, COUNCIL[co.result].tone)}${co.released ? html`<span class="pd-rel" title="Liberado no boletim da família">${icon('eye')}</span>` : ''}` : html`<span class="small muted">${info.suggestion ? `Sugestão: ${COUNCIL[info.suggestion].label.toLowerCase()}` : 'A decidir'}</span>`}</td>
          <td class="end"><button type="button" class="btn sm" data-ng-council="${s.id}">${co ? 'Alterar' : 'Registrar'}</button></td>
        </tr>`)}</tbody></table></div>
    </section>`;
  };

  const openCouncil = (sid) => {
    const s = Q.student(sid);
    const c = s && Q.klass(s.classId);
    if (!s || !c || !can('notas.fechar')) return;
    const co = Q.council(s.id);
    const info = councilInfo(s, c);
    const result = co ? co.result : info.suggestion || '';
    UI.modal({
      title: 'Conselho de classe',
      sub: html`${s.name} · ${c.name} · ${Q.year()}`,
      body: html`<div class="pd-co-facts">
          ${info.parecer ? '' : html`<div><span class="small muted">Média geral</span><b class="${tone(info.avg)}">${U.num(info.avg)}</b></div>`}
          <div><span class="small muted">Frequência</span><b class="pd-t-${Q.attTone(info.att, c.id)}">${U.pct(info.att)}</b><span class="small muted">mínimo ${info.min}%</span></div>
          ${info.parecer ? '' : html`<div><span class="small muted">Abaixo da média</span><b>${info.below.length ? info.below.map((x) => x.s.name).join(', ') : 'nenhuma disciplina'}</b></div>`}
        </div>
        <form class="form-section" novalidate>
          <div class="field" data-field="result"><span class="label" id="co-res-l">Resultado</span><div class="chips" role="radiogroup" aria-labelledby="co-res-l">${Object.entries(COUNCIL).map(([k, x]) => html`<label class="chip"><input type="radio" name="result" value="${k}" ${k === result ? raw('checked') : ''}>${x.label}</label>`)}</div>
            ${!co && info.suggestion ? html`<span class="hint">Sugestão pelas notas e frequência: ${COUNCIL[info.suggestion].label.toLowerCase()}.</span>` : ''}</div>
          <div class="field"><label for="co-note">Observações do conselho</label><textarea id="co-note" class="input" rows="4" maxlength="1000" placeholder="Ex.: aprovado(a) pelo conselho considerando a evolução no 2º semestre.">${co ? co.note || '' : ''}</textarea></div>
          <label class="check"><input type="checkbox" id="co-rel" ${co && co.released ? raw('checked') : ''}><span>Mostrar o resultado no boletim do Portal da família</span></label>
        </form>`,
      foot: html`${co ? html`<button type="button" class="btn danger left" data-co-del>Remover resultado</button>` : ''}<button type="button" class="btn" data-close>Cancelar</button><button type="button" class="btn primary" data-co-save>${icon('check')}Salvar</button>`,
      onMount(el, api) {
        const form = UI.$('form', el);
        UI.$('[data-co-save]', el).addEventListener('click', async (e) => {
          UI.clearErrors(form);
          const r = (UI.$('input[name="result"]:checked', el) || {}).value;
          if (!r) return UI.markField(form, 'result', 'Escolha o resultado.');
          const res = await UI.act('councils.set', { studentId: s.id, result: r, note: UI.$('#co-note', el).value.trim(), released: UI.$('#co-rel', el).checked }, { btn: e.currentTarget, ok: `Conselho de classe: ${U.shortName(s.name)} — ${COUNCIL[r].label.toLowerCase()}` });
          if (res) api.close();
        });
        const del = UI.$('[data-co-del]', el);
        del &&
          del.addEventListener('click', async () => {
            const go = await UI.confirm({ title: 'Remover o resultado?', text: `${s.name} fica sem resultado do conselho de classe.`, ok: 'Remover', danger: true });
            if (!go) return;
            const res = await UI.act('councils.set', { studentId: s.id, result: null }, { btn: del, ok: 'Resultado removido' });
            if (res) api.close();
          });
      },
    });
  };

  // =====================================================================
  // Ficha do aluno: Boletim
  // =====================================================================
  /** "1º bimestre", "1º e 2º bimestres"… (rótulos das etapas, para avisos). */
  const termsText = (list) => {
    const names = list.map((t) => Q.termLabel(t));
    return names.length > 1 ? `${names.slice(0, -1).join(', ')} e ${names[names.length - 1]}` : names[0] || '';
  };
  /**
   * Boletim da ficha do aluno. A tela mostra tudo o que a equipe enxerga (com as etapas não liberadas marcadas).
   * Quando há etapa ainda não liberada às famílias, a impressão tem duas versões:
   * - para a família (padrão, também no Ctrl+P): só as etapas liberadas, como o portal — média e situação
   *   calculadas com elas, recuperação final só com a última etapa liberada, conselho só se liberado;
   * - uso interno (botão próprio): tudo, com a marca "Uso interno — não entregar à família" no papel.
   */
  const renderBoletim = (s) => {
    const c = Q.klass(s.classId);
    if (!c) return html`<section class="card">${UI.empty({ icon: 'grade', title: 'Sem turma', text: `${U.firstName(s.name)} não está em nenhuma turma ativa. O boletim aparece quando o aluno estiver numa turma.` })}</section>`;
    const st = Q.settings();
    const terms = Q.terms();
    const parecer = Q.evaluation(c.id) === 'parecer';
    const att = Q.attendanceRate(s.id);
    const co = Q.council(s.id);
    const rel = terms.filter((t) => Q.termReleased(t));
    const nrel = terms.filter((t) => !Q.termReleased(t));
    const split = nrel.length > 0;
    const recs = Q.attendanceRecords ? Q.attendanceRecords(s.id) : [];
    const bySub = new Map();
    recs.forEach((r) => {
      if (!r.subjectId) return;
      let x = bySub.get(r.subjectId);
      if (!x) bySub.set(r.subjectId, (x = { lessons: 0, P: 0, F: 0, J: 0, A: 0 }));
      x.lessons++;
      x[r.mark]++;
    });
    const subs = parecer ? [] : Q.classSubjects(c.id);
    if (!parecer && !subs.length) return html`<section class="card">${UI.empty({ icon: 'book', title: 'Turma sem disciplinas', text: 'O boletim aparece quando a turma tiver disciplinas.' })}</section>`;

    /** Linhas de notas: fam=true considera só as etapas liberadas (o que a família vê no portal). */
    const lastReleased = Q.termReleased(terms[terms.length - 1]);
    const rowsOf = (fam) =>
      subs.map((x) => {
        const cells = terms.map((t) => {
          if (fam && !Q.termReleased(t)) return { t, locked: true };
          return { t, g: Q.grade(s.id, x.id, t), rec: Q.grade(s.id, x.id, 'rec' + t), tg: Q.termGrade(s.id, x.id, t) };
        });
        const avg = fam ? U.avg(cells.filter((cl) => !cl.locked).map((cl) => cl.tg)) : Q.subjectAverage(s.id, x.id);
        const rf = !fam || lastReleased ? Q.grade(s.id, x.id, 'rf') : null;
        const fin = fam ? (rf != null && avg != null && avg < st.passing ? Math.max(avg, rf) : avg) : Q.subjectFinal(s.id, x.id);
        const complete = fam ? cells.every((cl) => !cl.locked && cl.tg != null) : R.termsWithGrade(Store.state.grades, st, Q.year(), s.id, x.id) === terms.length;
        return { x, cells, avg, rf, fin, sit: Q.situation(fin, complete) };
      });

    const printHead = (kind) => html`<div class="print-only pd-bol-ph"><div class="boletim-head"><div><h2>${st.schoolName || 'Escola'}</h2><div class="small">${[st.address, st.phone].filter(Boolean).join(' · ')}</div></div><div class="pd-bol-ph-r"><b>Boletim escolar ${Q.year()}${kind === 'int' ? ' · uso interno' : ''}</b><div class="small">Emitido em ${U.fmtDate(U.today())}</div></div></div>
      ${kind === 'int' ? html`<p class="pd-bol-intmark">${icon('eyeOff')}<span><b>Uso interno da escola — não entregar à família.</b> Inclui ${nrel.length > 1 ? 'etapas' : 'etapa'} ainda não ${nrel.length > 1 ? 'liberadas' : 'liberada'} às famílias: ${termsText(nrel)}.</span></p>` : ''}
      <dl class="summary pd-bol-id"><dt>Aluno(a)</dt><dd>${s.name}</dd><dt>Matrícula</dt><dd>${s.enrollment}</dd><dt>Turma</dt><dd>${c.name}${c.shift ? ` · ${c.shift}` : ''}</dd></dl></div>`;
    const sigs = (kind) => html`<div class="print-only"><div class="signatures"><div>Direção / Secretaria</div>${kind === 'int' ? '' : html`<div>Responsável</div>`}</div></div>`;

    const foot = (fam) => {
      const showCo = co && COUNCIL[co.result] && (!fam || co.released);
      const avgAll = fam ? U.avg(rowsOf(true).map((r) => r.avg)) : Q.studentAverage(s.id, c.id);
      return html`<div class="pd-bol-foot">
        <div><span class="small muted">Frequência no ano</span><b class="pd-t-${Q.attTone(att, c.id)}">${U.pct(att)}</b><span class="small muted">mínimo ${Q.minAttendance(c.id)}%</span></div>
        ${parecer ? '' : html`<div><span class="small muted">Média geral${fam && split ? ' (parcial)' : ''}</span><b class="${tone(avgAll)}">${U.num(avgAll)}</b><span class="small muted">aprovação com ${U.num(st.passing)}</span></div>`}
        <div><span class="small muted">Conselho de classe</span>${showCo ? html`<b>${COUNCIL[co.result].label}</b>${co.note ? html`<span class="small muted">${co.note}</span>` : ''}${!co.released ? html`<span class="small muted">não liberado às famílias</span>` : ''}` : html`<b class="muted">—</b>`}</div>
      </div>`;
    };
    const recNote = parecer ? '' : 'vale a maior nota entre a da etapa e a da recuperação (rec.)';
    const legend = (kind) => {
      if (kind === 'fam') return html`<p class="small muted pd-bol-legend"><span>— etapa ainda não liberada pela escola${parecer ? '' : '; média e situação consideram só as etapas liberadas'}${recNote ? ` · ${recNote}` : ''}.</span></p>`;
      if (kind === 'int') return html`<p class="small muted pd-bol-legend">${icon('eyeOff', 'pd-inline-ic')}<span>etapa ainda não liberada às famílias${recNote ? ` · ${recNote}` : ''}</span></p>`;
      return recNote ? html`<p class="small muted pd-bol-legend"><span>${U.cap(recNote)}.</span></p>` : '';
    };
    const nrelMark = html`<span class="pd-nrel" role="img" aria-label="ainda não liberado às famílias" title="Ainda não liberado às famílias">${icon('eyeOff')}<span class="print-only pd-nrel-t">não liberado</span></span>`;

    /** Corpo do boletim: kind 'int' (tudo, com marcas), 'fam' (só o liberado) ou 'all' (tudo liberado: um só). */
    const body = (kind) => {
      const fam = kind === 'fam';
      if (parecer) {
        return html`<div class="stack pd-bol-par">${terms.map((t) => {
          const ok = Q.termReleased(t);
          const txt = fam && !ok ? null : Q.grade(s.id, '_parecer', t);
          return html`<section class="card card-pad"><div class="pd-bol-par-h"><h3>${U.cap(Q.termLabel(t))}</h3>${!ok && !fam ? html`<span class="pill plain pd-nrel-pill">${icon('eyeOff')}não liberado</span>` : ''}</div>${
            fam && !ok ? html`<p class="muted">Etapa ainda não liberada pela escola.</p>` : html`<p class="pd-pre">${txt || html`<span class="muted">Ainda não escrito.</span>`}</p>`
          }</section>`;
        })}</div>`;
      }
      const rows = rowsOf(fam);
      const anySubAtt = bySub.size > 0;
      return html`<section class="card"><div class="table-wrap"><table class="table pd-bol">
        <caption class="sr-only">Notas de ${s.name} por disciplina e etapa${fam ? ' (só etapas liberadas às famílias)' : ''}</caption>
        <thead><tr><th>Disciplina</th>${terms.map((t) => html`<th class="center">${Q.termLabel(t, { short: true })}${!Q.termReleased(t) && !fam ? nrelMark : ''}</th>`)}<th class="center">Média${fam && split ? html`<span class="pd-bol-th-sub">parcial</span>` : ''}</th><th class="center">Final</th>${anySubAtt ? html`<th class="center">Faltas</th><th class="center">Freq.</th>` : ''}<th>Situação</th></tr></thead>
        <tbody>${rows.map((r) => {
          const a = bySub.get(r.x.id);
          const rate = a ? R.rateOf(a) : null;
          return html`<tr><td><span class="subject-tag"><span class="swatch c${r.x.color}"></span>${r.x.name}</span></td>
            ${r.cells.map((cl) =>
              cl.locked
                ? html`<td class="center"><span class="muted" title="Ainda não liberado">—</span></td>`
                : html`<td class="center num ${tone(cl.tg)}">${U.num(cl.tg)}${cl.rec != null ? html`<span class="pd-bol-rec" title="Nota da etapa ${fmt(cl.g) || '—'} · recuperação ${fmt(cl.rec)}">nota ${fmt(cl.g) || '—'} · rec. ${fmt(cl.rec)}</span>` : ''}</td>`,
            )}
            <td class="center num"><b class="${tone(r.avg)}">${U.num(r.avg)}</b></td>
            <td class="center num ${tone(r.rf)}">${r.rf != null ? U.num(r.rf) : html`<span class="muted">—</span>`}</td>
            ${anySubAtt ? html`<td class="center num">${a ? a.F + a.J : html`<span class="muted">—</span>`}</td><td class="center num"><span class="pd-t-${Q.attTone(rate, c.id)}">${U.pct(rate)}</span></td>` : ''}
            <td>${r.sit.tone ? UI.pill(r.sit.label, r.sit.tone) : html`<span class="muted small">—</span>`}</td></tr>`;
        })}</tbody></table></div></section>`;
    };

    const tools = html`<div class="toolbar no-print pd-bol-tools"><span class="grow small muted">${c.name} · ano letivo ${Q.year()}</span>${split
      ? html`<button type="button" class="btn" data-bol-print="fam">${icon('printer')}Imprimir para a família</button><button type="button" class="btn ghost" data-bol-print="int">${icon('eyeOff')}Imprimir uso interno</button>`
      : html`<button type="button" class="btn" data-bol-print="fam">${icon('printer')}Imprimir boletim</button>`}</div>`;
    if (!split) return html`<div class="pd-boletim">${tools}<div class="pd-bol-view">${printHead('all')}${body('all')}${legend('all')}${foot(false)}${sigs('all')}</div></div>`;
    const info = html`<div class="notice no-print pd-bol-info">${icon('info')}<span class="grow">${nrel.length > 1 ? `As etapas ${termsText(nrel)} ainda não foram liberadas` : `O ${termsText(nrel)} ainda não foi liberado`} às famílias. A impressão para a família leva só as etapas liberadas, como no portal; a de uso interno leva tudo.</span></div>`;
    return html`<div class="pd-boletim pd-bol-split">${tools}${info}
      <div class="pd-bol-view pd-bol-int">${printHead('int')}${body('int')}${legend('int')}${foot(false)}${sigs('int')}</div>
      <div class="pd-bol-view pd-bol-fam">${printHead('fam')}${body('fam')}${legend('fam')}${foot(true)}${sigs('fam')}</div>
    </div>`;
  };
  const mountBoletim = (el) => {
    el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-bol-print]');
      if (!b) return;
      if (!U.canPrint()) return;
      const internal = b.dataset.bolPrint === 'int';
      document.body.classList.add('pd-printing');
      document.body.classList.toggle('pd-print-internal', internal);
      const done = () => {
        document.body.classList.remove('pd-printing', 'pd-print-internal');
        window.removeEventListener('afterprint', done);
      };
      window.addEventListener('afterprint', done);
      setTimeout(() => {
        window.print();
        setTimeout(done, 1000);
      }, 30);
    });
  };

  // =====================================================================
  // Painel: notas pendentes
  // =====================================================================
  App.widget({
    id: 'notas-pendentes',
    order: 40,
    size: 'half',
    perm: 'notas.lancar',
    render() {
      const term = Q.currentTerm();
      const editable = termEditable(term);
      const mine = Store.me.scope === 'todas' ? [] : Q.myClasses();
      const classes = (mine.length ? mine : Q.classes()).filter((c) => Q.roster(c.id).length);
      const list = [];
      if (editable)
        classes.forEach((c) => {
          const n = Q.roster(c.id).length;
          if (Q.evaluation(c.id) === 'parecer') {
            if (!canParecer(c)) return;
            const miss = Q.roster(c.id).filter((s) => !Q.grade(s.id, '_parecer', term)).length;
            if (miss) list.push({ c, sub: null, miss, n });
            return;
          }
          Q.classSubjects(c.id).forEach((s) => {
            if (!Q.canGradeSubject(c.id, s.id)) return;
            const miss = missingFor(c, s.id, term);
            if (miss) list.push({ c, sub: s, miss, n });
          });
        });
      // quem enxerga todas as turmas vê o resumo por turma; o professor, por disciplina
      if (Store.me.scope === 'todas') {
        const byClass = new Map();
        list.forEach((x) => {
          const g = byClass.get(x.c.id) || { c: x.c, sub: null, miss: 0, n: 0, subjects: 0, agg: true };
          g.miss += x.miss;
          g.n += x.n;
          g.subjects += 1;
          byClass.set(x.c.id, g);
        });
        list.length = 0;
        byClass.forEach((g) => list.push(g));
      }
      list.sort((a, b) => b.miss / b.n - a.miss / a.n || a.c.name.localeCompare(b.c.name, 'pt-BR'));
      const shown = list.slice(0, 5);
      const total = list.reduce((t, x) => t + x.miss, 0);
      const kind = evalKind();
      const what = kind === 'parecer' ? 'Pareceres' : kind === 'ambos' ? 'Notas e pareceres' : 'Notas';
      return html`<section class="card pd-widget">
        <div class="card-head"><h2>${icon('grade')}${what} do ${Q.termLabel(term)}</h2><a class="btn sm ghost" href="#notas">${kind === 'parecer' ? 'Abrir pareceres' : 'Abrir notas'}${icon('chevronRight')}</a></div>
        <div class="card-body">${!editable
          ? html`<p class="pd-w-msg">${icon('lock')}<span>O ${Q.termLabel(term)} está fechado. Correções só com a coordenação.</span></p>`
          : list.length
            ? html`<p class="small muted pd-w-total">${kind === 'parecer' ? U.plural(total, 'parecer por escrever', 'pareceres por escrever') : U.plural(total, 'lançamento pendente', 'lançamentos pendentes')}</p><ul class="items pd-w-list">${shown.map(
                (x) => html`<li><span class="pd-w-ic ${x.sub ? `c${x.sub.color}` : ''}">${icon(x.sub ? 'grade' : 'pencil')}</span><div class="grow"><b>${x.c.name}</b><div class="person-sub">${x.agg && Q.evaluation(x.c.id) !== 'parecer' ? `${U.plural(x.subjects, 'disciplina', 'disciplinas')} com notas faltando · ${U.int(x.miss)} de ${U.int(x.n)} em aberto` : `${x.sub ? x.sub.name : 'Pareceres'} · faltam ${x.miss} de ${x.n}`}</div>${UI.meter(((x.n - x.miss) / x.n) * 100)}</div>
                  <button type="button" class="btn sm" data-w-grade="${x.c.id}" data-w-sub="${x.sub ? x.sub.id : ''}">${x.agg ? 'Ver' : x.sub ? 'Lançar' : 'Escrever'}</button></li>`,
              )}</ul>${list.length > shown.length ? html`<p class="small muted">e mais ${list.length - shown.length}.</p>` : ''}`
            : html`<p class="pd-ok">${icon('checkCircle')}<span>${kind === 'parecer' ? 'Todos os pareceres escritos' : 'Tudo lançado'} no ${Q.termLabel(term)}.</span></p>`}</div>
      </section>`;
    },
    mount(el) {
      el.addEventListener('click', (e) => {
        const b = e.target.closest('[data-w-grade]');
        if (b) Actions.abrirNotas(b.dataset.wGrade, { subjectId: b.dataset.wSub || null, term: Q.currentTerm() });
      });
    },
  });

  /** Abre as notas de uma turma (opts: {subjectId, term}). */
  Actions.abrirNotas = (classId, opts = {}) => {
    const v = NS();
    if (classId) v.classId = classId;
    v.subjectId = opts.subjectId || null;
    if (opts.term) v.term = Number(opts.term);
    v.view = 'notas';
    v.showAll = false;
    App.go('notas');
  };

  // =====================================================================
  // Registro
  // =====================================================================
  App.page({
    id: 'notas',
    label: 'Notas',
    icon: 'grade',
    group: 'Dia a dia',
    order: 30,
    tab: 4,
    anyPerm: ['notas.ver', 'notas.lancar'],
    keys: 'boletim avaliação parecer etapa bimestre conselho de classe recuperação',
    render,
    mount,
  });

  App.studentTab({ id: 'boletim', label: 'Boletim', order: 30, perm: 'notas.ver', render: renderBoletim, mount: mountBoletim });

  /** Como se avalia nas turmas de trabalho da pessoa: 'nota', 'parecer' (só Educação Infantil) ou 'ambos' — muda o nome do atalho. */
  const evalKind = () => {
    const mine = Q.myClasses().filter((c) => Q.roster(c.id).length);
    const list = mine.length ? mine : gradeClasses();
    const par = list.filter((c) => Q.evaluation(c.id) === 'parecer').length;
    return !list.length ? '' : !par ? 'nota' : par === list.length ? 'parecer' : 'ambos';
  };
  const openGrades = () => App.go('notas');
  App.action({ id: 'lancar-notas', label: 'Lançar notas', icon: 'grade', order: 30, perm: 'notas.lancar', keys: 'nota avaliação boletim', when: () => evalKind() === 'nota', run: openGrades });
  App.action({ id: 'escrever-pareceres', label: 'Escrever pareceres', icon: 'grade', order: 30, perm: 'notas.lancar', keys: 'parecer descritivo avaliação educação infantil boletim', when: () => evalKind() === 'parecer', run: openGrades });
  App.action({ id: 'lancar-notas-pareceres', label: 'Lançar notas e pareceres', icon: 'grade', order: 30, perm: 'notas.lancar', keys: 'nota parecer avaliação boletim', when: () => evalKind() === 'ambos', run: openGrades });
})();
