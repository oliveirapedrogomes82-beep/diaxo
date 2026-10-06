'use strict';
/* Notas: diário de notas por turma, disciplina e bimestre. Salva sozinho a cada nota digitada. */
Pages.notas = {
  title: 'Notas',
  state() {
    const v = (View.notas = View.notas || {});
    const cls = Q.classes().filter((c) => Q.roster(c.id).length);
    if (!v.classId || !cls.some((c) => c.id === v.classId)) v.classId = (cls[0] || {}).id || '';
    const subs = Q.classSubjects(v.classId);
    if (!v.subjectId || !subs.some((s) => s.id === v.subjectId)) {
      // começa pela primeira disciplina com notas faltando no bimestre atual
      const term = v.term || Q.settings().term;
      const kids = Q.roster(v.classId);
      const pend = subs.find((s) => kids.some((a) => Q.grade(a.id, s.id, term) == null));
      v.subjectId = (pend || subs[0] || {}).id || '';
    }
    if (!v.term) v.term = Q.settings().term;
    return v;
  },
  stats(v) {
    const kids = Q.roster(v.classId);
    const vals = kids.map((a) => Q.grade(a.id, v.subjectId, v.term)).filter((x) => x != null);
    const s = Q.settings();
    return {
      filled: vals.length,
      total: kids.length,
      avg: U.avg(vals),
      max: vals.length ? Math.max(...vals) : null,
      min: vals.length ? Math.min(...vals) : null,
      below: vals.filter((x) => x < s.passing).length,
    };
  },
  statsHTML(v) {
    const st = this.stats(v);
    return `
      <div class="card kpi"><span class="kpi-label">Lançadas</span><span class="kpi-value">${st.filled}<small> de ${st.total}</small></span>${UI.meter(st.total ? (st.filled / st.total) * 100 : 0, st.filled === st.total ? 'ok' : '')}</div>
      <div class="card kpi"><span class="kpi-label">Média da turma</span><span class="kpi-value ${UI.gradeCls(st.avg)}">${U.num(st.avg)}</span><span class="kpi-foot">neste bimestre</span></div>
      <div class="card kpi hide-sm"><span class="kpi-label">Maior e menor</span><span class="kpi-value">${U.num(st.max)}<small> / ${U.num(st.min)}</small></span></div>
      <div class="card kpi hide-sm"><span class="kpi-label">Abaixo da média</span><span class="kpi-value ${st.below ? 'g-low' : ''}">${st.below}</span><span class="kpi-foot">média mínima ${U.num(Q.settings().passing)}</span></div>`;
  },
  render() {
    const v = this.state();
    if (!v.classId)
      return `<div class="page-head"><div><h1>Notas</h1></div></div><section class="card">${UI.empty({ icon: 'grade', title: 'Nenhuma turma com alunos', text: 'Crie uma turma e matricule alunos para lançar notas.', action: '<a class="btn primary" href="#turmas">Ir para turmas</a>' })}</section>`;
    const c = Q.klass(v.classId);
    const subs = Q.classSubjects(c.id);
    const sub = Q.subject(v.subjectId);
    const kids = Q.roster(c.id);
    const tch = sub ? Q.teacher(c.subjects[sub.id]) : null;
    const s = Q.settings();
    return `
      <div class="page-head">
        <div><h1>Notas</h1><p class="lead">Digite a nota e aperte <b>Enter</b> para ir ao próximo aluno. Aceita vírgula ou ponto (7,5 ou 7.5). Tudo é salvo automaticamente.</p></div>
        <span class="saved-flag" id="saved-flag" aria-live="polite"></span>
      </div>
      <div class="toolbar">
        <select class="input" id="n-class" style="width:auto" aria-label="Turma">${Q.classes()
          .filter((x) => Q.roster(x.id).length)
          .map((x) => `<option value="${x.id}" ${x.id === c.id ? 'selected' : ''}>${U.esc(x.name)}</option>`)
          .join('')}</select>
        ${UI.seg([1, 2, 3, 4].map((t) => [t, `${t}º bim.`]), v.term, 'data-term')}
        <span class="grow"></span>
        ${t_currentHint(v.term, s.term)}
      </div>
      <div class="chips" role="group" aria-label="Disciplina">${subs
        .map((x) => {
          const missing = kids.filter((a) => Q.grade(a.id, x.id, v.term) == null).length;
          return `<button type="button" class="chip" data-subject="${x.id}" aria-pressed="${x.id === v.subjectId}"><span class="dot" style="background:var(--cat-${x.color})"></span>${U.esc(x.name)}${missing && missing < kids.length ? ` <span class="muted small">(${missing})</span>` : missing === kids.length ? ' <span class="muted small">(vazio)</span>' : ` ${icon('check')}`}</button>`;
        })
        .join('')}</div>
      <section class="kpis" id="n-stats">${this.statsHTML(v)}</section>
      <section class="card">
        <div class="card-head"><h2>${U.esc(sub ? sub.name : '')} · ${U.esc(c.name)}</h2><span class="sub">${tch ? 'Professor(a): ' + U.esc(tch.name) : 'Sem professor definido'}</span></div>
        <div class="table-wrap" style="margin-top:10px"><table class="table grades">
          <thead><tr><th class="num hide-sm">Nº</th><th>Aluno</th>${[1, 2, 3, 4]
            .map((t) => `<th class="center term-btn ${t === v.term ? 'cur' : 'hide-sm'}">${t === v.term ? `${t}º bim.` : `<button type="button" data-term="${t}" title="Lançar o ${t}º bimestre">${t}º bim.</button>`}</th>`)
            .join('')}<th class="num">Média</th><th class="hide-sm">Situação</th></tr></thead>
          <tbody>${kids
            .map((a, i) => {
              return `<tr data-sid="${a.id}"><td class="num muted hide-sm">${i + 1}</td>
                <td><div class="person">${UI.avatar(a.name, 'sm')}<a class="person-name" href="#alunos/${a.id}" tabindex="-1">${U.esc(a.name)}</a></div></td>
                ${[1, 2, 3, 4]
                  .map((t) => {
                    const g = Q.grade(a.id, v.subjectId, t);
                    if (t === v.term)
                      return `<td class="center cur"><input class="grade-input ${g != null && g < s.passing ? 'low' : ''}" data-grade="${a.id}" value="${g == null ? '' : U.num(g)}" inputmode="decimal" autocomplete="off" aria-label="Nota de ${U.esc(a.name)} no ${t}º bimestre" maxlength="4"></td>`;
                    return `<td class="center num hide-sm ${UI.gradeCls(g)}">${U.num(g)}</td>`;
                  })
                  .join('')}
                ${this.rowTail(a.id, v.subjectId)}</tr>`;
            })
            .join('')}</tbody>
        </table></div>
      </section>`;
  },
  avgCell(sid, subj) {
    const avg = Q.subjectAvg(sid, subj);
    return `<td class="num strong ${UI.gradeCls(avg)}" data-avg>${U.num(avg)}</td>`;
  },
  sitCell(sid, subj) {
    const sit = Q.situation(Q.subjectAvg(sid, subj), Q.termsWithGrade(sid, subj) === 4);
    return `<td class="hide-sm" data-sit>${sit.tone ? UI.pill(sit.label, sit.tone) : '<span class="muted small">—</span>'}</td>`;
  },
  rowTail(sid, subj) {
    return this.avgCell(sid, subj) + this.sitCell(sid, subj);
  },
  mount(el) {
    const v = View.notas;
    if (!v || !v.classId) return;
    const flag = UI.$('#saved-flag', el);
    const inputs = () => UI.$$('[data-grade]', el);

    const commit = (input) => {
      const sid = input.dataset.grade;
      const val = U.parseGrade(input.value);
      if (Number.isNaN(val)) {
        input.classList.add('invalid');
        input.setAttribute('aria-invalid', 'true');
        input.title = 'Use uma nota de 0 a 10';
        return false;
      }
      input.classList.remove('invalid');
      input.removeAttribute('aria-invalid');
      input.title = '';
      const key = Q.gkey(sid, v.subjectId, v.term);
      const prev = Store.state.grades[key];
      if ((prev ?? null) === val) {
        input.value = val == null ? '' : U.num(val);
        return true;
      }
      Store.update(
        (s) => {
          if (val == null) delete s.grades[key];
          else s.grades[key] = val;
        },
        { silent: true },
      );
      input.value = val == null ? '' : U.num(val);
      input.classList.toggle('low', val != null && val < Q.settings().passing);
      const tr = input.closest('tr');
      tr.querySelector('[data-avg]').outerHTML = this.avgCell(sid, v.subjectId);
      tr.querySelector('[data-sit]').outerHTML = this.sitCell(sid, v.subjectId);
      UI.$('#n-stats', el).innerHTML = this.statsHTML(v);
      flag.innerHTML = `${icon('check')} Salvo às ${U.fmtTime(new Date())}`;
      pendingLog = true;
      return true;
    };
    let pendingLog = false;
    const logOnce = U.debounce(() => {
      if (!pendingLog) return;
      pendingLog = false;
      const c = Q.klass(v.classId);
      Store.update(() => {}, { log: `Notas de ${Q.subject(v.subjectId)?.name} do ${c?.name} (${v.term}º bim.) atualizadas`, icon: 'grade', silent: true });
    }, 4000);

    el.addEventListener('input', (e) => {
      const inp = e.target.closest('[data-grade]');
      if (!inp) return;
      const ok = !Number.isNaN(U.parseGrade(inp.value));
      inp.classList.toggle('invalid', !ok);
    });
    el.addEventListener('change', (e) => {
      const inp = e.target.closest('[data-grade]');
      if (inp) {
        commit(inp);
        logOnce();
      }
      if (e.target.id === 'n-class') {
        v.classId = e.target.value;
        v.subjectId = '';
        App.render();
      }
    });
    el.addEventListener('focusin', (e) => {
      const inp = e.target.closest('[data-grade]');
      if (inp) inp.select();
    });
    el.addEventListener('keydown', (e) => {
      const inp = e.target.closest('[data-grade]');
      if (!inp) return;
      const list = inputs();
      const i = list.indexOf(inp);
      if (e.key === 'Enter' || e.key === 'ArrowDown') {
        e.preventDefault();
        if (!commit(inp)) return;
        logOnce();
        const nx = list[i + 1];
        if (nx) nx.focus();
        else {
          inp.blur();
          UI.toast('Última nota da lista. Tudo salvo!');
        }
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (!commit(inp)) return;
        list[i - 1] && list[i - 1].focus();
      }
    });
    el.addEventListener('click', (e) => {
      const t = e.target.closest('[data-term]');
      if (t) {
        v.term = Number(t.dataset.term);
        App.render();
        return;
      }
      const sb = e.target.closest('[data-subject]');
      if (sb) {
        v.subjectId = sb.dataset.subject;
        App.render();
        const first = UI.$('[data-grade]');
        first && first.focus({ preventScroll: true });
      }
    });
  },
};

function t_currentHint(term, current) {
  if (term === current) return `<span class="pill mark plain">Bimestre atual</span>`;
  return `<span class="pill plain">${term < current ? 'Bimestre encerrado' : 'Bimestre futuro'}</span>`;
}
