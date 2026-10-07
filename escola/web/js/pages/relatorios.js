'use strict';
/* Relatórios (Gestão) — #relatorios/<relatório>.
   Pedagógicos (relatorios.ver + a permissão do dado): frequência (por turma e alunos abaixo do mínimo), desempenho
   (médias por turma e disciplina, alunos abaixo da média por etapa), ocorrências (por turma, categoria e mês; o ano
   inteiro vem do histórico), famílias e agenda (visualizados e ciente, a partir de Store.reads e Q.acks), lista de
   alunos (contatos só com alunos.contatos) e aniversariantes do mês. Financeiro (relatorios.financeiro): recebido
   por mês e inadimplência por turma. Cada relatório tem filtros, totais, gráfico quando ajuda, CSV e impressão.
   Tudo é calculado no navegador a partir do retrato, que já vem filtrado pelo escopo de quem vê. */
(() => {
  const R = Core.rules;
  const can = (p) => Store.can(p);
  const me = () => Store.me;
  const S = () => Q.settings();
  const today = () => U.today();
  const hasPage = (id) => App.pages().some((p) => p.id === id);
  const fn = (name) => typeof Actions[name] === 'function';
  const RS = () => PageState.get('relatorios', { classId: '', period: 'ano', term: 'ano', occPeriod: '60', status: 'ativo', q: '', month: Number(today().slice(5, 7)), sort: 'nome' });
  const pct = (v) => (v == null ? '—' : `${Math.round(v)}%`);
  const ratio = (a, b) => (b ? (a / b) * 100 : null);
  const joinPt = (list) => (list.length > 1 ? `${list.slice(0, -1).join(', ')} e ${list[list.length - 1]}` : list[0] || '');
  const shortClass = (name) => String(name).replace(/Infantil\s*/i, 'Inf. ').replace(/º\s*ano/i, 'º').replace(/ª\s*série/i, 'ª s.').replace(/\s+/g, ' ').trim();
  const className = (id) => (Q.klass(id) || {}).name || 'Sem turma';
  const paidValue = (i) => (i.paidAmount != null ? i.paidAmount : i.amount);

  // cache por versão dos dados (os relatórios fazem contas sobre milhares de registros)
  const cache = new Map();
  let cacheV = -1;
  const cached = (k, make) => {
    if (cacheV !== Store.version) {
      cache.clear();
      cacheV = Store.version;
    }
    if (!cache.has(k)) cache.set(k, make());
    return cache.get(k);
  };
  /** Turmas do ano corrente que a pessoa enxerga. */
  const yearClasses = () => Q.classes().filter((c) => !c.year || Number(c.year) <= Number(Q.year()));
  const charts = new Map(); // gráficos montados no render e desenhados no mount (precisam da largura)

  // =====================================================================
  // Peças comuns
  // =====================================================================
  const classSelect = (value, list, { all = 'Todas as turmas' } = {}) =>
    html`<label class="rp-filter"><span>Turma</span><select class="input" data-rp-f="classId">${all ? html`<option value="">${all}</option>` : ''}${list.map((c) => html`<option value="${c.id}" ${c.id === value ? 'selected' : ''}>${c.name}</option>`)}</select></label>`;
  const selectF = (key, label, value, options) =>
    html`<label class="rp-filter"><span>${label}</span><select class="input" data-rp-f="${key}">${options.map(([v, l]) => html`<option value="${v}" ${String(v) === String(value) ? 'selected' : ''}>${l}</option>`)}</select></label>`;
  const kpi = (label, value, foot = '', tone = '') => html`<div class="card kpi rp-kpi ${tone ? 'is-' + tone : ''}"><span class="kpi-label">${label}</span><span class="kpi-value">${value}</span>${foot ? html`<span class="kpi-foot">${foot}</span>` : ''}</div>`;
  const chart = (key, data, { fmt = (v) => U.int(v), label = 'all', height = 190, title = '' } = {}) => {
    if (!data.length || data.every((d) => !d.value && !d.track)) return '';
    charts.set(key, { data, fmt, label: data.length > 12 ? 'max' : label, height });
    return html`<figure class="rp-chart"><figcaption class="small muted">${title}</figcaption><div class="rp-chart-box" data-rp-chart="${key}" data-label="${title}"></div></figure>`;
  };
  const meterCell = (v, tone) => (v == null ? html`<span class="muted">—</span>` : html`<span class="rp-meter">${UI.meter(v, tone)}<b class="${tone ? 'rp-t-' + tone : ''}">${pct(v)}</b></span>`);
  const studentLink = (s) => html`<a href="#alunos/${s.id}" class="rp-person">${s.name}</a>`;
  const section = (title, body, extra = '') => html`<section class="rp-sec"><div class="rp-sec-head"><h3>${title}</h3>${extra}</div>${body}</section>`;
  const none = (text) => html`<p class="muted small rp-none">${text}</p>`;
  const toneFor = (rate, min) => (rate == null ? '' : rate < min ? 'bad' : rate < min + 10 ? 'warn' : 'ok');
  const gTone = (v) => (v == null ? '' : v < S().passing ? (v < S().recovery ? 'bad' : 'warn') : '');

  // =====================================================================
  // 1. Frequência
  // =====================================================================
  const periodRange = (p) => {
    if (p === '30') return { from: U.addDays(today(), -30) };
    if (/^\d{4}-\d{2}$/.test(p)) return { from: `${p}-01`, to: `${p}-31` };
    return {};
  };
  const attIdx = (p) => cached(`att|${p}`, () => R.attendanceIndex(Store.state.attendance, { year: Q.year(), ...periodRange(p) }));
  const attMonths = () =>
    cached('att-months', () => {
      const y = Q.year();
      const set = new Set();
      for (const k of Object.keys(Store.state.attendance)) {
        const p1 = k.indexOf('|');
        const d = k.slice(p1 + 1, p1 + 11);
        if (d.slice(0, 4) === y) set.add(d.slice(0, 7));
      }
      return [...set].sort();
    });
  const sumIdx = (kids, idx) => {
    const e = { lessons: 0, P: 0, F: 0, J: 0, A: 0 };
    for (const k of kids) {
      const x = idx.get(k.id);
      if (!x) continue;
      e.lessons += x.lessons;
      e.P += x.P;
      e.F += x.F;
      e.J += x.J;
      e.A += x.A;
    }
    return e;
  };
  const freqData = (st) => {
    const idx = attIdx(st.period);
    const classes = yearClasses().filter((c) => !st.classId || c.id === st.classId);
    const perClass = classes.map((c) => {
      const kids = Q.roster(c.id);
      const min = Q.minAttendance(c.id);
      const e = sumIdx(kids, idx);
      const rows = kids.map((s) => {
        const x = idx.get(s.id);
        return { s, c, x, rate: R.rateOf(x), min };
      });
      return { c, kids, min, e, rate: R.rateOf(e), below: rows.filter((r) => r.rate != null && r.rate < r.min), rows };
    });
    const all = perClass.flatMap((p) => p.rows);
    const e = perClass.reduce((a, p) => ({ lessons: a.lessons + p.e.lessons, F: a.F + p.e.F, J: a.J + p.e.J, A: a.A + p.e.A, P: a.P + p.e.P }), { lessons: 0, P: 0, F: 0, J: 0, A: 0 });
    return { perClass, all, e, rate: R.rateOf(e), below: all.filter((r) => r.rate != null && r.rate < r.min), withData: all.filter((r) => r.rate != null).length };
  };
  const periodLabel = (p) => (p === 'ano' ? `ano letivo de ${Q.year()}` : p === '30' ? 'últimos 30 dias' : U.fmtMonth(p));
  const freqReport = (st) => {
    const months = attMonths();
    if (st.period !== 'ano' && st.period !== '30' && !months.includes(st.period)) st.period = 'ano';
    const d = freqData(st);
    const one = st.classId ? d.perClass[0] : null;
    const filters = html`${classSelect(st.classId, yearClasses())}${selectF('period', 'Período', st.period, [['ano', 'Ano letivo todo'], ['30', 'Últimos 30 dias'], ...months.slice().reverse().map((m) => [m, U.cap(U.fmtMonth(m))])])}`;
    if (!d.all.length) return { filters, body: UI.empty({ icon: 'checkSquare', title: 'Nenhum aluno nesta seleção', text: 'Escolha outra turma ou matricule alunos para ver a frequência.' }) };
    let chartHTML;
    if (one) {
      const data = months.map((m) => {
        const e = sumIdx(one.kids, attIdx(m));
        const r = R.rateOf(e);
        return { label: U.fmtMonthShort(m), value: r || 0, tip: `${U.cap(U.fmtMonth(m))}: ${r == null ? 'sem chamada' : pct(r)}` };
      });
      chartHTML = chart('freq', data, { fmt: (v) => `${Math.round(v)}%`, title: `Frequência de ${one.c.name} por mês` });
    } else {
      chartHTML = chart('freq', d.perClass.filter((p) => p.rate != null).map((p) => ({ label: p.c.name, short: shortClass(p.c.name), value: p.rate, tip: `${p.c.name}: ${pct(p.rate)} (mínimo ${p.min}%)` })), { fmt: (v) => `${Math.round(v)}%`, title: 'Frequência por turma' });
    }
    const streaks = st.period === 'ano' && typeof Q.absenceStreaks === 'function';
    const classTable = one
      ? ''
      : section(
          'Por turma',
          html`<div class="table-wrap"><table class="table responsive rp-table"><thead><tr><th>Turma</th><th class="num">Alunos</th><th>Frequência</th><th class="num">Abaixo do mínimo</th><th class="num">Faltas</th></tr></thead><tbody>${d.perClass.map(
            (p) => html`<tr class="clickable" data-rp-pick="${p.c.id}" tabindex="0"><td class="first nowrap"><b>${p.c.name}</b><span class="small muted rp-sub">mínimo ${p.min}%</span></td><td class="num" data-l="Alunos">${U.int(p.kids.length)}</td><td data-l="Frequência">${meterCell(p.rate, toneFor(p.rate, p.min))}</td><td class="num" data-l="Abaixo do mínimo">${p.below.length ? html`<b class="rp-t-bad">${U.int(p.below.length)}</b>` : '0'}</td><td class="num" data-l="Faltas">${U.int(p.e.F + p.e.J)}<span class="small muted rp-sub">${U.int(p.e.J)} justificadas</span></td></tr>`,
          )}</tbody></table></div>`,
        );
    const list = one ? one.rows.slice().sort((a, b) => (a.rate ?? 101) - (b.rate ?? 101) || Q.cmpName(a.s, b.s)) : d.below.slice().sort((a, b) => a.rate - b.rate);
    const sm = new Map();
    if (streaks) for (const p of d.perClass) for (const [sid, n] of Q.absenceStreaks(p.c.id)) sm.set(sid, n);
    const alert = Number(S().absenceAlert) || 3;
    const studentTable = list.length
      ? html`<div class="table-wrap"><table class="table responsive rp-table"><thead><tr><th>Aluno</th>${one ? '' : html`<th>Turma</th>`}<th>Frequência</th><th class="num">Faltas</th><th class="num">Abonos</th>${streaks ? html`<th class="num">Seguidas</th>` : ''}</tr></thead><tbody>${list.map((r) => {
          const x = r.x || { F: 0, J: 0, A: 0 };
          const n = sm.get(r.s.id) || 0;
          return html`<tr><td class="first">${studentLink(r.s)}</td>${one ? '' : html`<td class="nowrap" data-l="Turma">${r.c.name}</td>`}<td data-l="Frequência">${meterCell(r.rate, toneFor(r.rate, r.min))}</td><td class="num" data-l="Faltas">${U.int(x.F + x.J)}${x.J ? html`<span class="small muted rp-sub">${U.int(x.J)} justificadas</span>` : ''}</td><td class="num" data-l="Abonos">${U.int(x.A)}</td>${streaks ? html`<td class="num" data-l="Faltas seguidas">${n >= alert ? html`<b class="rp-t-bad" title="Faltas seguidas">${n}</b>` : U.int(n)}</td>` : ''}</tr>`;
        })}</tbody></table></div>`
      : html`<div class="rp-ok">${icon('checkCircle')}<span>Nenhum aluno abaixo da frequência mínima no período. </span></div>`;
    const body = html`<div class="kpis rp-kpis">
        ${kpi('Frequência média', pct(d.rate), `${periodLabel(st.period)}`, toneFor(d.rate, one ? one.min : 75))}
        ${kpi('Abaixo do mínimo', html`${U.int(d.below.length)}<small> de ${U.int(d.all.length)}</small>`, 'alunos', d.below.length ? 'bad' : 'ok')}
        ${kpi('Faltas registradas', U.int(d.e.F + d.e.J), `${U.int(d.e.J)} justificadas`)}
        ${kpi('Abonos', U.int(d.e.A), 'não contam como falta')}
      </div>
      ${chartHTML}
      ${classTable}
      ${section(one ? `Alunos de ${one.c.name}` : 'Alunos abaixo da frequência mínima', studentTable, one ? html`<span class="small muted">mínimo de ${one.min}%</span>` : '')}
      <p class="small muted rp-foot">Faltas justificadas também contam como falta; abonos saem da conta, como prevê a lei. Nas turmas com chamada por aula, cada aula conta uma vez.</p>`;
    const csv = () => {
      const rows = [['Aluno', 'Matrícula', 'Turma', 'Registros', 'Presenças', 'Faltas', 'Justificadas', 'Abonadas', 'Frequência (%)', 'Mínimo (%)', 'Situação']];
      for (const r of d.all.slice().sort((a, b) => Q.cmpName(a.c, b.c) || Q.cmpName(a.s, b.s))) {
        const x = r.x || { lessons: 0, P: 0, F: 0, J: 0, A: 0 };
        rows.push([r.s.name, r.s.enrollment || '', r.c.name, x.lessons, x.P, x.F, x.J, x.A, r.rate == null ? '' : U.num(r.rate, 1), r.min, r.rate == null ? 'Sem registros' : r.rate < r.min ? 'Abaixo do mínimo' : 'Regular']);
      }
      return { rows, name: `frequencia-${st.classId ? U.slug(className(st.classId)) + '-' : ''}${st.period}` };
    };
    return { filters, body, csv, desc: `${st.classId ? className(st.classId) : 'Todas as turmas'} · ${periodLabel(st.period)}` };
  };

  // =====================================================================
  // 2. Desempenho
  // =====================================================================
  const gradeClasses = () => yearClasses().filter((c) => Q.evaluation(c.id) !== 'parecer');
  const gradeValue = (sid, subj, term) => (term === 'ano' ? Q.subjectAverage(sid, subj) : Q.termGrade(sid, subj, Number(term)));
  const perfData = (st) =>
    cached(`perf|${st.classId}|${st.term}`, () => {
      const passing = Number(S().passing);
      const recovery = Number(S().recovery);
      const classes = gradeClasses().filter((c) => !st.classId || c.id === st.classId);
      const upTo = st.term === 'ano' ? Q.currentTerm() : 1;
      const perClass = classes.map((c) => {
        const subjects = Q.classSubjects(c.id);
        const kids = Q.roster(c.id);
        const bySubject = subjects.map((sub) => {
          const vals = kids.map((k) => gradeValue(k.id, sub.id, st.term));
          const got = vals.filter((v) => v != null);
          return { sub, avg: U.avg(got), below: got.filter((v) => v < passing).length, launched: got.length, expected: kids.length };
        });
        const students = kids.map((k) => {
          const per = subjects.map((sub) => ({ sub, v: gradeValue(k.id, sub.id, st.term) }));
          const got = per.filter((x) => x.v != null);
          return { s: k, c, per, avg: U.avg(got.map((x) => x.v)), below: got.filter((x) => x.v < passing) };
        });
        let filled = 0;
        let expected = 0;
        if (st.term === 'ano') {
          for (const k of kids) for (const sub of subjects) for (let t = 1; t <= upTo; t++) {
            expected++;
            if (Q.termGrade(k.id, sub.id, t) != null) filled++;
          }
        } else {
          for (const b of bySubject) {
            filled += b.launched;
            expected += b.expected;
          }
        }
        return { c, subjects, kids, bySubject, students, avg: U.avg(students.map((x) => x.avg)), filled, expected };
      });
      const students = perClass.flatMap((p) => p.students);
      const subjMap = new Map();
      for (const p of perClass) for (const b of p.bySubject) {
        const cur = subjMap.get(b.sub.id) || { sub: b.sub, vals: [], below: 0 };
        for (const k of p.kids) {
          const v = gradeValue(k.id, b.sub.id, st.term);
          if (v != null) cur.vals.push(v);
        }
        cur.below += b.below;
        subjMap.set(b.sub.id, cur);
      }
      const order = new Map(Store.state.subjects.map((s, i) => [s.id, i]));
      const subjects = [...subjMap.values()].sort((a, b) => (order.get(a.sub.id) ?? 99) - (order.get(b.sub.id) ?? 99)).map((x) => ({ sub: x.sub, avg: U.avg(x.vals), below: x.below, n: x.vals.length }));
      const filled = perClass.reduce((a, p) => a + p.filled, 0);
      const expected = perClass.reduce((a, p) => a + p.expected, 0);
      return {
        perClass, students, subjects, passing, recovery,
        avg: U.avg(students.map((x) => x.avg)),
        below: students.filter((x) => x.below.length),
        critical: students.filter((x) => x.avg != null && x.avg < recovery),
        filled: ratio(filled, expected),
      };
    });
  const termName = (t) => (t === 'ano' ? 'média do ano até agora' : Q.termLabel(Number(t)));
  const perfReport = (st) => {
    const classes = gradeClasses();
    if (st.classId && !classes.some((c) => c.id === st.classId)) st.classId = '';
    if (st.term !== 'ano' && !Q.terms().includes(Number(st.term))) st.term = 'ano';
    const filters = html`${classSelect(st.classId, classes)}${selectF('term', 'Etapa', st.term, [['ano', 'Média do ano'], ...Q.terms().map((t) => [String(t), Q.termLabel(t)])])}`;
    if (!classes.length) return { filters: '', body: UI.empty({ icon: 'grade', title: 'Nenhuma turma com notas', text: 'As turmas que você acompanha usam parecer descritivo (Educação Infantil) ou ainda não há turmas.' }) };
    const d = perfData(st);
    const one = st.classId ? d.perClass[0] : null;
    if (!d.students.length) return { filters, body: UI.empty({ icon: 'grade', title: 'Nenhum aluno nesta seleção', text: 'Escolha outra turma.' }) };
    const fmt1 = (v) => U.num(v, 1);
    const chartHTML = chart('perf', d.subjects.filter((x) => x.avg != null).map((x) => ({ label: x.sub.short || x.sub.name, short: (x.sub.short || x.sub.name).slice(0, 5), value: x.avg, tip: `${x.sub.name}: média ${U.num(x.avg)} · ${x.below} abaixo de ${U.num(d.passing)}` })), { fmt: fmt1, title: `Média por disciplina · ${termName(st.term)}` });
    const cell = (v) => (v == null ? html`<span class="muted">—</span>` : html`<b class="rp-g ${gTone(v) ? 'rp-t-' + gTone(v) : ''}">${U.num(v)}</b>`);
    let mainTable;
    if (one) {
      mainTable = section(
        `Disciplinas de ${one.c.name}`,
        html`<div class="table-wrap"><table class="table responsive rp-table"><thead><tr><th>Disciplina</th><th>Professor(a)</th><th class="num">Média</th><th class="num">Abaixo da média</th><th class="num">Notas lançadas</th></tr></thead><tbody>${one.bySubject.map(
          (b) => html`<tr><td class="first"><span class="rp-subj"><span class="rp-dot" style="--c: var(--cat-${Number(b.sub.color) || 1})"></span>${b.sub.name}</span></td><td data-l="Professor(a)">${Q.teacherOf(one.c.id, b.sub.id) ? U.shortName(Q.userName(Q.teacherOf(one.c.id, b.sub.id))) : html`<span class="muted">a definir</span>`}</td><td class="num" data-l="Média">${cell(b.avg)}</td><td class="num" data-l="Abaixo da média">${b.below ? html`<b class="rp-t-bad">${b.below}</b>` : '0'}</td><td class="num" data-l="Notas lançadas">${st.term === 'ano' ? U.int(b.launched) : `${b.launched}/${b.expected}`}</td></tr>`,
        )}</tbody></table></div>`,
      );
    } else {
      const cols = d.subjects;
      mainTable = section(
        'Média por turma e disciplina',
        html`<div class="table-wrap rp-matrix-wrap"><table class="table rp-matrix"><thead><tr><th>Turma</th>${cols.map((x) => html`<th class="num" title="${x.sub.name}">${x.sub.short || x.sub.name}</th>`)}<th class="num">Geral</th><th class="num">Abaixo</th></tr></thead><tbody>${d.perClass.map((p) => {
          const m = new Map(p.bySubject.map((b) => [b.sub.id, b]));
          return html`<tr class="clickable" data-rp-pick="${p.c.id}" tabindex="0"><td class="nowrap"><b>${p.c.name}</b></td>${cols.map((x) => html`<td class="num">${m.has(x.sub.id) ? cell(m.get(x.sub.id).avg) : html`<span class="muted">·</span>`}</td>`)}<td class="num">${cell(p.avg)}</td><td class="num">${U.int(p.students.filter((s) => s.below.length).length)}</td></tr>`;
        })}</tbody></table></div>`,
        html`<span class="small muted">Toque numa turma para ver os detalhes</span>`,
      );
    }
    const below = d.below.slice().sort((a, b) => b.below.length - a.below.length || (a.avg ?? 10) - (b.avg ?? 10));
    const belowTable = below.length
      ? html`<div class="table-wrap"><table class="table responsive rp-table"><thead><tr><th>Aluno</th>${one ? '' : html`<th>Turma</th>`}<th>Disciplinas abaixo da média</th><th class="num">Média geral</th></tr></thead><tbody>${below.map(
          (x) => html`<tr><td class="first">${studentLink(x.s)}</td>${one ? '' : html`<td class="nowrap" data-l="Turma">${x.c.name}</td>`}<td data-l="Abaixo em"><span class="rp-chips">${x.below.map((b) => html`<span class="rp-gchip ${'rp-t-' + (gTone(b.v) || 'warn')}">${b.sub.short || b.sub.name} ${U.num(b.v)}</span>`)}</span></td><td class="num" data-l="Média geral">${cell(x.avg)}</td></tr>`,
        )}</tbody></table></div>`
      : html`<div class="rp-ok">${icon('checkCircle')}<span>Nenhum aluno abaixo da média em ${termName(st.term)}.</span></div>`;
    const body = html`<div class="kpis rp-kpis">
        ${kpi('Média geral', d.avg == null ? '—' : U.num(d.avg), `aprovação com ${U.num(d.passing)}`, gTone(d.avg))}
        ${kpi('Abaixo da média', html`${U.int(d.below.length)}<small> de ${U.int(d.students.length)}</small>`, 'alunos em ao menos uma disciplina', d.below.length ? 'warn' : 'ok')}
        ${kpi('Abaixo da recuperação', U.int(d.critical.length), `média geral menor que ${U.num(d.recovery)}`, d.critical.length ? 'bad' : '')}
        ${kpi('Notas lançadas', pct(d.filled), st.term === 'ano' ? `até o ${Q.termLabel(Q.currentTerm())}` : Q.termLabel(Number(st.term)))}
      </div>
      ${chartHTML}
      ${mainTable}
      ${section('Alunos abaixo da média', belowTable)}
      ${yearClasses().some((c) => Q.evaluation(c.id) === 'parecer') ? html`<p class="small muted rp-foot">Turmas com parecer descritivo (Educação Infantil) não entram neste relatório.</p>` : ''}`;
    const csv = () => {
      const subs = d.subjects.map((x) => x.sub);
      const rows = [['Aluno', 'Matrícula', 'Turma', ...subs.map((s) => s.name), 'Média geral', 'Disciplinas abaixo da média']];
      for (const x of d.students) {
        const m = new Map(x.per.map((p) => [p.sub.id, p.v]));
        rows.push([x.s.name, x.s.enrollment || '', x.c.name, ...subs.map((s) => (m.get(s.id) == null ? '' : U.num(m.get(s.id), 1))), x.avg == null ? '' : U.num(x.avg, 1), x.below.map((b) => b.sub.name).join(', ')]);
      }
      return { rows, name: `desempenho-${st.classId ? U.slug(className(st.classId)) + '-' : ''}${st.term === 'ano' ? 'ano' : 'etapa-' + st.term}` };
    };
    return { filters, body, csv, desc: `${st.classId ? className(st.classId) : 'Todas as turmas'} · ${termName(st.term)}` };
  };

  // =====================================================================
  // 3. Ocorrências (60 dias no retrato; o ano inteiro vem do histórico)
  // =====================================================================
  let hist = { key: '', items: new Map(), loading: false, done: false, error: '' };
  const histKey = () => `${(me() || {}).id}|${Q.year()}|${Store.preview ? 'p' : ''}`;
  const loadYear = async () => {
    const key = histKey();
    if (hist.key === key && (hist.loading || hist.done)) return;
    hist = { key, items: new Map(), loading: true, done: false, error: '' };
    const start = `${Q.year()}-01-01`;
    try {
      let before = U.addDays(today(), -58);
      for (let i = 0; i < 40; i++) {
        const r = await Api.history('diary', { before, limit: 500 });
        const items = (r && r.items) || [];
        let oldest = before;
        let added = 0;
        for (const it of items) {
          if (!hist.items.has(it.id)) {
            hist.items.set(it.id, it.value);
            added++;
          }
          if (it.date && it.date < oldest) oldest = it.date;
        }
        if (!r || !r.more || !items.length || oldest < start) break;
        before = added ? U.addDays(oldest, 1) : oldest;
        if (!added && oldest === before) break;
      }
      hist.done = true;
    } catch (err) {
      hist.error = (err && err.message) || 'Não foi possível carregar o histórico.';
    } finally {
      hist.loading = false;
      if (hist.key === key && App.route()[0] === 'relatorios') App.render();
    }
  };
  const occSince = (p) => (p === 'ano' ? `${Q.year()}-01-01` : U.addDays(today(), -Number(p)));
  const occItems = (st) => {
    const from = occSince(st.occPeriod);
    const map = new Map();
    if (st.occPeriod === 'ano' && hist.key === histKey()) for (const [id, d] of hist.items) map.set(id, d);
    for (const d of Store.state.diary) map.set(d.id, d);
    const visible = new Set(yearClasses().map((c) => c.id));
    return [...map.values()]
      .filter((d) => d.type === 'ocorrencia' && d.status !== 'cancelado' && d.status !== 'rascunho' && d.date >= from && d.date <= today() && (!st.classId ? visible.has(d.classId) || !Q.klass(d.classId) : d.classId === st.classId))
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  };
  const CAT = () => Q.OCCURRENCE_CATEGORIES;
  const occReport = (st) => {
    const filters = html`${classSelect(st.classId, yearClasses())}${selectF('occPeriod', 'Período', st.occPeriod, [['30', 'Últimos 30 dias'], ['60', 'Últimos 60 dias'], ['ano', 'Ano letivo todo']])}`;
    if (st.occPeriod === 'ano' && !(hist.key === histKey() && hist.done)) {
      if (hist.key === histKey() && hist.error) return { filters, body: html`<div class="notice bad">${icon('alert')}<span class="grow">${hist.error}</span><button type="button" class="btn sm" data-rp-retry>Tentar de novo</button></div>` };
      return { filters, body: html`<div class="rp-loading">${UI.spinner()}<span>Carregando as ocorrências do ano…</span></div>`, load: true };
    }
    const list = occItems(st);
    const cats = Object.keys(CAT());
    const bad = list.filter((d) => d.category !== 'elogio');
    const praise = list.filter((d) => d.category === 'elogio');
    const byStudent = new Map();
    for (const d of list) {
      const sid = d.studentId || (d.recipients || [])[0];
      if (!sid) continue;
      const cur = byStudent.get(sid) || { sid, classId: d.classId, n: 0, praise: 0, cats: new Map(), last: '' };
      if (d.category === 'elogio') cur.praise++;
      else cur.n++;
      cur.cats.set(d.category, (cur.cats.get(d.category) || 0) + 1);
      if (d.date > cur.last) cur.last = d.date;
      byStudent.set(sid, cur);
    }
    const repeat = [...byStudent.values()].filter((x) => x.n >= 3);
    const byClass = new Map();
    for (const d of list) {
      const cur = byClass.get(d.classId) || { classId: d.classId, total: 0, cats: new Map() };
      cur.total++;
      cur.cats.set(d.category, (cur.cats.get(d.category) || 0) + 1);
      byClass.set(d.classId, cur);
    }
    const months = [];
    const start = occSince(st.occPeriod).slice(0, 7);
    for (let m = start; m <= today().slice(0, 7); m = U.addMonths(`${m}-01`, 1).slice(0, 7)) months.push(m);
    const data = months.map((m) => {
      const n = bad.filter((d) => d.date.slice(0, 7) === m).length;
      const p = praise.filter((d) => d.date.slice(0, 7) === m).length;
      return { label: U.fmtMonthShort(m), value: n, tip: `${U.cap(U.fmtMonth(m))}: ${U.plural(n, 'ocorrência', 'ocorrências')} e ${U.plural(p, 'elogio', 'elogios')}` };
    });
    if (!list.length) {
      return {
        filters,
        body: html`${UI.empty({ icon: 'flag', title: 'Nenhuma ocorrência no período', text: st.occPeriod !== 'ano' ? 'Nada foi registrado nesta seleção. Veja o ano letivo inteiro para comparar com os meses anteriores.' : 'Nada foi registrado nesta seleção.', action: st.occPeriod !== 'ano' ? html`<button type="button" class="btn" data-rp-set="occPeriod" data-v="ano">Ver o ano letivo</button>` : '' })}`,
        csv: null,
      };
    }
    const top = [...byStudent.values()].sort((a, b) => b.n - a.n || b.praise - a.praise).slice(0, 15);
    const catHead = cats.map((k) => html`<th class="num" title="${CAT()[k]}">${k === 'tarefa' ? 'Tarefa' : CAT()[k]}</th>`);
    const body = html`<div class="kpis rp-kpis">
        ${kpi('Ocorrências', U.int(bad.length), 'sem contar os elogios', bad.length ? 'warn' : '')}
        ${kpi('Elogios', U.int(praise.length), '', praise.length ? 'ok' : '')}
        ${kpi('Alunos envolvidos', U.int(byStudent.size), 'com algum registro')}
        ${kpi('Com 3 ou mais', U.int(repeat.length), 'ocorrências no período', repeat.length ? 'bad' : '')}
      </div>
      ${chart('occ', data, { fmt: (v) => U.int(v), title: 'Ocorrências por mês (sem elogios)', label: 'all' })}
      ${section(
        'Por turma e categoria',
        html`<div class="table-wrap rp-matrix-wrap"><table class="table rp-matrix"><thead><tr><th>Turma</th>${catHead}<th class="num">Total</th></tr></thead><tbody>${[...byClass.values()]
          .sort((a, b) => b.total - a.total)
          .map((x) => html`<tr><td><b>${className(x.classId)}</b></td>${cats.map((k) => html`<td class="num">${x.cats.get(k) ? html`<b class="${k === 'elogio' ? 'rp-t-ok' : ''}">${x.cats.get(k)}</b>` : html`<span class="muted">·</span>`}</td>`)}<td class="num"><b>${x.total}</b></td></tr>`)}</tbody></table></div>`,
      )}
      ${section(
        'Alunos com mais registros',
        html`<div class="table-wrap"><table class="table responsive rp-table"><thead><tr><th>Aluno</th><th>Turma</th><th class="num">Ocorr.</th><th class="num">Elogios</th><th>Categorias</th><th>Último</th></tr></thead><tbody>${top.map((x) => {
          const s = Q.student(x.sid);
          return html`<tr><td class="first">${s ? studentLink(s) : 'Aluno'}</td><td class="nowrap" data-l="Turma">${className(x.classId)}</td><td class="num" data-l="Ocorrências">${x.n >= 3 ? html`<b class="rp-t-bad">${x.n}</b>` : U.int(x.n)}</td><td class="num" data-l="Elogios">${U.int(x.praise)}</td><td data-l="Categorias" class="small">${[...x.cats.entries()].map(([k, n]) => `${CAT()[k] || k} (${n})`).join(', ')}</td><td class="nowrap" data-l="Último">${U.fmtDate(x.last).slice(0, 5)}</td></tr>`;
        })}</tbody></table></div>`,
      )}
      ${st.occPeriod !== 'ano' ? html`<p class="small muted rp-foot">Mostrando os últimos ${st.occPeriod} dias. <button type="button" class="link" data-rp-set="occPeriod" data-v="ano">Ver o ano letivo inteiro</button></p>` : ''}
      ${!can('diario.ocorrencias') && !can('diario.aprovar') && !can('alunos.observacoes') ? html`<p class="small muted rp-foot">Você vê os elogios e as ocorrências que registrou.</p>` : ''}`;
    const csv = () => {
      const rows = [['Data', 'Aluno', 'Matrícula', 'Turma', 'Categoria', 'Título', 'Descrição', 'Registro interno', 'Registrado por']];
      for (const d of list) {
        const s = Q.student(d.studentId || (d.recipients || [])[0]);
        rows.push([U.fmtDate(d.date), s ? s.name : '', s ? s.enrollment || '' : '', className(d.classId), CAT()[d.category] || d.category || '', d.title || '', d.body || '', d.internal ? 'Sim' : 'Não', Q.userName(d.authorId, '')]);
      }
      return { rows, name: `ocorrencias-${st.classId ? U.slug(className(st.classId)) + '-' : ''}${st.occPeriod === 'ano' ? Q.year() : st.occPeriod + '-dias'}` };
    };
    return { filters, body, csv, desc: `${st.classId ? className(st.classId) : 'Todas as turmas'} · ${st.occPeriod === 'ano' ? `ano letivo de ${Q.year()}` : `últimos ${st.occPeriod} dias`}` };
  };

  // =====================================================================
  // 4. Famílias e agenda (visualizado e ciente)
  // =====================================================================
  const engData = (st) =>
    cached(`eng|${st.classId}|${Object.keys(Store.reads).length}`, () => {
      const from = U.addDays(today(), -60);
      const reads = Store.reads;
      const acks = Store.state.acks;
      const classes = yearClasses().filter((c) => !st.classId || c.id === st.classId);
      const classIds = new Set(classes.map((c) => c.id));
      const per = new Map(); // studentId → agregado
      const kids = classes.flatMap((c) => Q.roster(c.id));
      for (const s of kids) {
        const linked = (s.guardians || []).filter((g) => g.userId && !g.bloqueado);
        per.set(s.id, { s, classId: s.classId, users: linked.map((g) => g.userId), access: linked.length > 0, delivered: 0, viewed: 0, needAck: 0, acked: 0, pendingAuth: 0 });
      }
      const itemsByClass = new Map();
      for (const d of Store.state.diary) {
        if (d.status !== 'publicado' || d.internal || d.date < from || d.date > today() || !classIds.has(d.classId)) continue;
        itemsByClass.set(d.classId, (itemsByClass.get(d.classId) || 0) + 1);
        const r = reads[d.id] || {};
        const a = acks[d.id] || {};
        const ack = d.requireAck || d.type === 'autorizacao';
        for (const sid of d.recipients || []) {
          const p = per.get(sid);
          if (!p) continue;
          p.delivered++;
          if (p.users.some((u) => r[u])) p.viewed++;
          if (ack) {
            p.needAck++;
            const done = a[sid] && Object.keys(a[sid]).length > 0;
            if (done) p.acked++;
            else if (d.type === 'autorizacao' && (!d.respondBy || d.respondBy >= today())) p.pendingAuth++;
          }
        }
      }
      const perClass = classes.map((c) => {
        const list = [...per.values()].filter((p) => p.classId === c.id);
        const sum = (k) => list.reduce((a, p) => a + p[k], 0);
        return { c, n: list.length, access: list.filter((p) => p.access).length, items: itemsByClass.get(c.id) || 0, delivered: sum('delivered'), viewed: sum('viewed'), needAck: sum('needAck'), acked: sum('acked'), pendingAuth: sum('pendingAuth') };
      });
      const all = [...per.values()];
      const sum = (k) => all.reduce((a, p) => a + p[k], 0);
      const withAccess = all.filter((p) => p.access);
      return {
        perClass, all,
        n: all.length,
        access: withAccess.length,
        delivered: sum('delivered'),
        viewed: sum('viewed'),
        viewedAccess: ratio(withAccess.reduce((a, p) => a + p.viewed, 0), withAccess.reduce((a, p) => a + p.delivered, 0)),
        needAck: sum('needAck'),
        acked: sum('acked'),
        pendingAuth: sum('pendingAuth'),
        items: perClass.reduce((a, p) => a + p.items, 0),
      };
    });
  const engReport = (st) => {
    const filters = html`${classSelect(st.classId, yearClasses())}<span class="rp-filter-note small muted">${icon('clock')}Últimos 60 dias</span>`;
    const d = engData(st);
    if (!d.n) return { filters, body: UI.empty({ icon: 'users', title: 'Nenhum aluno nesta seleção', text: 'Escolha outra turma.' }) };
    const viewRate = ratio(d.viewed, d.delivered);
    const ackRate = ratio(d.acked, d.needAck);
    const accessRate = ratio(d.access, d.n);
    const tone = (v) => (v == null ? '' : v >= 75 ? 'ok' : v >= 50 ? 'warn' : 'bad');
    const chartHTML = st.classId ? '' : chart('eng', d.perClass.filter((p) => p.delivered).map((p) => ({ label: p.c.name, short: shortClass(p.c.name), value: ratio(p.viewed, p.delivered) || 0, tip: `${p.c.name}: ${pct(ratio(p.viewed, p.delivered))} visualizado · ${pct(ratio(p.acked, p.needAck))} com ciente` })), { fmt: (v) => `${Math.round(v)}%`, title: 'Visualização da agenda por turma' });
    const classTable = section(
      'Por turma',
      html`<div class="table-wrap"><table class="table responsive rp-table"><thead><tr><th>Turma</th><th class="num">Acesso ao portal</th><th class="num">Itens</th><th>Visualizados</th><th>Ciente</th><th class="num">Autorizações pendentes</th></tr></thead><tbody>${d.perClass.map((p) => {
        const v = ratio(p.viewed, p.delivered);
        const a = ratio(p.acked, p.needAck);
        return html`<tr ${st.classId ? '' : raw(`class="clickable" data-rp-pick="${U.esc(p.c.id)}" tabindex="0"`)}><td class="first nowrap"><b>${p.c.name}</b></td><td class="num" data-l="Com acesso">${p.access}/${p.n}</td><td class="num" data-l="Itens enviados">${U.int(p.items)}</td><td data-l="Visualizados">${meterCell(v, tone(v))}</td><td data-l="Ciente">${p.needAck ? meterCell(a, tone(a)) : html`<span class="muted small">nada pedia ciente</span>`}</td><td class="num" data-l="Autorizações sem resposta">${p.pendingAuth ? html`<b class="rp-t-warn">${p.pendingAuth}</b>` : '0'}</td></tr>`;
      })}</tbody></table></div>`,
    );
    // famílias sem acesso ao portal: compactas, por turma, com o convite da turma
    const canInvite = can('familias.acessos') && !Store.preview;
    const noAccess = d.all.filter((p) => !p.access);
    const noAccessByClass = new Map();
    for (const p of noAccess) {
      if (!noAccessByClass.has(p.classId)) noAccessByClass.set(p.classId, []);
      noAccessByClass.get(p.classId).push(p);
    }
    const noAccessHTML = noAccess.length
      ? html`<ul class="rp-noaccess">${[...noAccessByClass.entries()].map(
          ([cid, list]) => html`<li><div class="rp-na-head"><b>${className(cid)}</b><span class="small muted">${U.plural(list.length, 'aluno', 'alunos')}</span>${canInvite && fn('convidarFamilias') ? html`<button type="button" class="btn sm" data-rp-invite-class="${cid}">${icon('send')}<span>Convidar famílias</span></button>` : ''}</div>
            <p class="rp-na-names small">${html.join(list.map((p) => html`<a href="#alunos/${p.s.id}">${p.s.name}</a>${p.s.noDigitalAccess ? html` <span class="muted">(prefere papel)</span>` : ''}`), ', ')}</p></li>`,
        )}</ul>`
      : html`<div class="rp-ok">${icon('checkCircle')}<span>Todas as famílias têm acesso ao portal.</span></div>`;
    const low = d.all
      .filter((p) => p.access && ((p.delivered >= 3 && p.viewed / p.delivered < 0.5) || p.pendingAuth))
      .sort((a, b) => (a.delivered ? a.viewed / a.delivered : 1) - (b.delivered ? b.viewed / b.delivered : 1) || b.pendingAuth - a.pendingAuth);
    const canMsg = fn('novaMensagem') && can('mensagens.responder') && !Store.preview;
    const lowHTML = low.length
      ? html`<div class="table-wrap"><table class="table responsive rp-table"><thead><tr><th>Aluno</th>${st.classId ? '' : html`<th>Turma</th>`}<th class="num">Visualizados</th><th class="num">Ciente</th><th class="end"><span class="sr-only">Ação</span></th></tr></thead><tbody>${low.map(
          (p) => html`<tr><td class="first">${studentLink(p.s)}</td>${st.classId ? '' : html`<td class="nowrap" data-l="Turma">${className(p.classId)}</td>`}<td class="num" data-l="Visualizados">${p.delivered ? html`<b class="${p.viewed / p.delivered < 0.5 ? 'rp-t-bad' : ''}">${p.viewed}/${p.delivered}</b>` : '—'}</td><td class="num" data-l="Ciente">${p.needAck ? `${p.acked}/${p.needAck}` : '—'}${p.pendingAuth ? html`<span class="small rp-t-warn rp-sub">${U.plural(p.pendingAuth, 'autorização pendente', 'autorizações pendentes')}</span>` : ''}</td><td class="end">${canMsg ? html`<button type="button" class="btn sm" data-rp-msg="${p.s.id}">${icon('message')}<span>Mensagem</span></button>` : ''}</td></tr>`,
        )}</tbody></table></div>`
      : html`<div class="rp-ok">${icon('checkCircle')}<span>As famílias com acesso estão acompanhando a agenda.</span></div>`;
    const body = html`<div class="kpis rp-kpis">
        ${kpi('Famílias com acesso', pct(accessRate), `${U.int(d.access)} de ${U.int(d.n)} alunos`, tone(accessRate))}
        ${kpi('Visualizados', pct(viewRate), d.viewedAccess != null ? `${pct(d.viewedAccess)} entre quem tem acesso` : 'nada enviado', tone(viewRate))}
        ${kpi('Ciente', pct(ackRate), d.needAck ? `${U.int(d.acked)} de ${U.int(d.needAck)} pedidos` : 'nada pedia ciente', tone(ackRate))}
        ${kpi('Autorizações sem resposta', U.int(d.pendingAuth), 'ainda no prazo', d.pendingAuth ? 'warn' : '')}
      </div>
      ${chartHTML}
      ${classTable}
      ${section('Com acesso, mas acompanham pouco', lowHTML, html`<span class="small muted">viram menos da metade ou têm autorização pendente</span>`)}
      ${section(`Ainda sem acesso ao portal (${U.int(noAccess.length)})`, noAccessHTML, html`<span class="small muted">recebem a agenda só se a escola mandar de outro jeito</span>`)}
      <p class="small muted rp-foot">"Visualizado" conta quando algum responsável com acesso abriu o item no portal; "ciente" inclui o ciente registrado pela escola (em papel). Considera deveres, recados, lembretes, autorizações e ocorrências enviados às famílias nos últimos 60 dias.</p>`;
    const csv = () => {
      const rows = [['Aluno', 'Matrícula', 'Turma', 'Acesso ao portal', 'Itens recebidos', 'Visualizados', 'Visualizados (%)', 'Pedidos de ciente', 'Cientes', 'Autorizações sem resposta']];
      for (const p of d.all.slice().sort((a, b) => Q.cmpName({ name: className(a.classId) }, { name: className(b.classId) }) || Q.cmpName(a.s, b.s))) rows.push([p.s.name, p.s.enrollment || '', className(p.classId), p.access ? 'Sim' : p.s.noDigitalAccess ? 'Sem acesso digital' : 'Não', p.delivered, p.viewed, p.delivered ? U.num(ratio(p.viewed, p.delivered), 0) : '', p.needAck, p.acked, p.pendingAuth]);
      return { rows, name: `familias-e-agenda-${st.classId ? U.slug(className(st.classId)) : 'escola'}` };
    };
    return { filters, body, csv, desc: `${st.classId ? className(st.classId) : 'Todas as turmas'} · últimos 60 dias` };
  };

  // =====================================================================
  // 5. Lista de alunos
  // =====================================================================
  const STATUS = [['ativo', 'Ativos'], ['todos', 'Todas as situações'], ['trancado', 'Trancados'], ['transferido', 'Transferidos'], ['concluido', 'Concluídos']];
  const STATUS_ONE = { ativo: 'Ativo', trancado: 'Trancado', transferido: 'Transferido', concluido: 'Concluído' };
  const listReport = (st) => {
    const contacts = can('alunos.contatos');
    const filters = html`${classSelect(st.classId, Q.classes())}${selectF('status', 'Situação', st.status, STATUS)}
      <label class="rp-filter rp-search"><span>Buscar</span><input class="input" type="search" data-rp-f="q" value="${st.q}" placeholder="Nome, matrícula ou responsável" autocomplete="off"></label>`;
    const order = new Map(Q.classes({ includeClosed: true }).map((c, i) => [c.id, i]));
    const rank = (s) => (order.has(s.classId) ? order.get(s.classId) : 9999);
    const list = Q.students({ classId: st.classId || null, status: st.status, query: st.q }).sort((a, b) => (st.classId ? 0 : rank(a) - rank(b)) || Q.cmpName(a, b));
    if (!list.length) return { filters, body: UI.empty({ icon: 'users', title: 'Nenhum aluno encontrado', text: st.q ? 'Confira a busca ou limpe os filtros.' : 'Não há alunos nesta seleção.' }) };
    const guardiansCell = (s) => {
      const gs = (s.guardians || []).filter((g) => !g.bloqueado);
      if (!gs.length) return html`<span class="muted">—</span>`;
      return html`<span class="rp-guardians">${gs.map(
        (g) => html`<span class="rp-g-line"><b>${g.name}</b>${g.relation ? html` <span class="muted">(${g.relation})</span>` : ''}${contacts && (g.phone || g.email) ? html`<span class="rp-contact">${g.phone ? html`<a href="tel:${U.digits(g.phone)}">${g.phone}</a>` : ''}${g.phone && g.email ? ' · ' : ''}${g.email ? html`<a href="mailto:${g.email}">${g.email}</a>` : ''}</span>` : ''}</span>`,
      )}</span>`;
    };
    const groups = [];
    for (const stu of list) {
      const g = groups[groups.length - 1];
      if (g && g.classId === stu.classId) g.items.push(stu);
      else groups.push({ classId: stu.classId, items: [stu] });
    }
    const row = (stu, i) => html`<tr><td class="num rp-idx">${i + 1}</td><td class="first">${studentLink(stu)}${stu.enrollment ? html`<span class="small muted rp-sub">Matrícula ${stu.enrollment}</span>` : ''}</td><td class="nowrap" data-l="Nascimento">${stu.birth ? html`${U.fmtDate(stu.birth)}<span class="small muted rp-sub">${U.age(stu.birth)} anos</span>` : html`<span class="muted">—</span>`}</td><td data-l="Responsáveis">${guardiansCell(stu)}</td>${st.status !== 'ativo' ? html`<td data-l="Situação">${STATUS_ONE[stu.status] || stu.status}</td>` : ''}</tr>`;
    const cols = st.status !== 'ativo' ? 5 : 4;
    const body = html`<p class="rp-count small muted">${U.plural(list.length, 'aluno', 'alunos')}${st.classId ? '' : ` em ${U.plural(groups.length, 'turma', 'turmas')}`}</p>
      ${!contacts ? html`<p class="notice small">${icon('lock')}<span class="grow">Telefones e e-mails dos responsáveis aparecem só para quem tem acesso a contatos.</span></p>` : ''}
      <div class="table-wrap"><table class="table responsive rp-table rp-list"><thead><tr><th class="num rp-idx">#</th><th>Aluno</th><th>Nascimento</th><th>Responsáveis</th>${st.status !== 'ativo' ? html`<th>Situação</th>` : ''}</tr></thead>
        ${groups.map((g) => html`<tbody>${st.classId ? '' : html`<tr class="rp-group"><th colspan="${cols}" scope="rowgroup">${className(g.classId)} <span class="muted">· ${U.plural(g.items.length, 'aluno', 'alunos')}</span></th></tr>`}${g.items.map(row)}</tbody>`)}
      </table></div>`;
    const csv = () => {
      const max = Math.max(1, ...list.map((s) => (s.guardians || []).length));
      const head = ['Aluno', 'Matrícula', 'Turma', 'Turno', 'Nascimento', 'Idade', 'Situação'];
      for (let k = 1; k <= max; k++) head.push(`Responsável ${k}`, `Parentesco ${k}`, ...(contacts ? [`Celular ${k}`, `E-mail ${k}`] : []));
      const rows = [head];
      for (const s of list) {
        const c = Q.klass(s.classId);
        const row = [s.name, s.enrollment || '', c ? c.name : '', c ? c.shift || '' : '', s.birth ? U.fmtDate(s.birth) : '', s.birth ? U.age(s.birth) : '', STATUS_ONE[s.status] || s.status];
        for (let k = 0; k < max; k++) {
          const g = (s.guardians || [])[k];
          row.push(g ? g.name : '', g ? g.relation || '' : '', ...(contacts ? [g ? g.phone || '' : '', g ? g.email || '' : ''] : []));
        }
        rows.push(row);
      }
      return { rows, name: `alunos-${st.classId ? U.slug(className(st.classId)) : 'escola'}${contacts ? '-contatos' : ''}` };
    };
    return { filters, body, csv, desc: `${st.classId ? className(st.classId) : 'Todas as turmas'} · ${STATUS.find((x) => x[0] === st.status)[1].toLowerCase()}${st.q ? ` · busca "${st.q}"` : ''}` };
  };

  // =====================================================================
  // 6. Aniversariantes do mês
  // =====================================================================
  const bdayReport = (st) => {
    const m = Number(st.month) || Number(today().slice(5, 7));
    const filters = html`${selectF('month', 'Mês', m, U.MONTHS.map((n, i) => [i + 1, U.cap(n)]))}${classSelect(st.classId, Q.classes())}`;
    const y = Number(today().slice(0, 4));
    const list = Q.students({ classId: st.classId || null })
      .filter((s) => s.birth && Number(s.birth.slice(5, 7)) === m)
      .sort((a, b) => Number(a.birth.slice(8, 10)) - Number(b.birth.slice(8, 10)) || Q.cmpName(a, b));
    if (!list.length) return { filters, body: UI.empty({ icon: 'cake', title: `Ninguém faz aniversário em ${U.MONTHS[m - 1]}`, text: st.classId ? 'Nesta turma, não há aniversariantes no mês escolhido.' : 'Escolha outro mês.' }) };
    const td = today();
    const days = new Map();
    for (const s of list) {
      const d = Number(s.birth.slice(8, 10));
      if (!days.has(d)) days.set(d, []);
      days.get(d).push(s);
    }
    const dateOf = (d) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const todayN = list.filter((s) => s.birth.slice(5) === td.slice(5)).length;
    const body = html`<p class="rp-count small muted">${U.plural(list.length, 'aniversariante', 'aniversariantes')} em ${U.MONTHS[m - 1]}${todayN ? html` · <b>${todayN} hoje</b>` : ''}</p>
      <ol class="rp-bdays">${[...days.entries()].map(([d, kids]) => {
        const date = dateOf(d);
        const valid = U.isValidDate(date);
        const isToday = valid && date === td;
        return html`<li class="rp-bday ${isToday ? 'is-today' : ''} ${valid && date < td ? 'is-past' : ''}"><span class="rp-bday-day"><b>${d}</b><small>${valid ? U.WD_SHORT[U.weekday(date)] : ''}</small></span>
          <ul class="rp-bday-kids">${kids.map((s) => html`<li>${UI.avatar(s.name, 'sm', s.photo)}<span class="grow">${studentLink(s)}<span class="small muted">${className(s.classId)} · faz ${y - Number(s.birth.slice(0, 4))} anos</span></span>${isToday ? UI.pill('Hoje', 'mark') : ''}</li>`)}</ul></li>`;
      })}</ol>`;
    const csv = () => ({ rows: [['Dia', 'Aluno', 'Turma', 'Nascimento', 'Idade que completa'], ...list.map((s) => [s.birth.slice(8, 10) + '/' + s.birth.slice(5, 7), s.name, className(s.classId), U.fmtDate(s.birth), y - Number(s.birth.slice(0, 4))])], name: `aniversariantes-${U.slug(U.MONTHS[m - 1])}${st.classId ? '-' + U.slug(className(st.classId)) : ''}` });
    return { filters, body, csv, desc: `${U.cap(U.MONTHS[m - 1])}${st.classId ? ` · ${className(st.classId)}` : ''}` };
  };

  // =====================================================================
  // 7. Financeiro
  // =====================================================================
  const finData = () =>
    cached('fin', () => {
      const y = Q.year();
      const T = today();
      const inv = Store.state.invoices;
      const months = Array.from({ length: 12 }, (_, i) => `${y}-${String(i + 1).padStart(2, '0')}`);
      const per = new Map(months.map((m) => [m, { m, expected: 0, nExpected: 0, received: 0, nReceived: 0, late: 0, nLate: 0, paidOfMonth: 0 }]));
      const methods = new Map();
      let expected = 0;
      let received = 0;
      for (const i of inv) {
        const dm = (i.due || '').slice(0, 7);
        const st = Q.invoiceStatus(i, T);
        if (per.has(dm)) {
          const p = per.get(dm);
          p.expected += i.amount;
          p.nExpected++;
          if (st === 'atrasado') {
            p.late += i.amount;
            p.nLate++;
          }
          if (st === 'pago') p.paidOfMonth += i.amount;
          expected += i.amount;
        }
        if (i.paidAt && i.paidAt.slice(0, 4) === y) {
          const pm = per.get(i.paidAt.slice(0, 7));
          if (pm) {
            pm.received += paidValue(i);
            pm.nReceived++;
          }
          received += paidValue(i);
          const k = i.method || 'Não informado';
          methods.set(k, (methods.get(k) || 0) + paidValue(i));
        }
      }
      const overdue = inv.filter((i) => Q.invoiceStatus(i, T) === 'atrasado');
      const byClass = new Map();
      const kidsByClass = new Map();
      for (const s of Q.students()) kidsByClass.set(s.classId, (kidsByClass.get(s.classId) || 0) + 1);
      for (const i of overdue) {
        const s = Q.student(i.studentId);
        const cid = s ? s.classId || '' : '';
        const cur = byClass.get(cid) || { classId: cid, students: new Set(), n: 0, amount: 0, due: 0 };
        cur.students.add(i.studentId);
        cur.n++;
        cur.amount += i.amount;
        cur.due += Q.amountDue(i, T);
        byClass.set(cid, cur);
      }
      const lateKids = new Set(overdue.map((i) => i.studentId));
      const active = Q.students().length;
      return {
        months: [...per.values()],
        expected, received, methods,
        overdue,
        overdueDue: overdue.reduce((a, i) => a + Q.amountDue(i, T), 0),
        byClass: [...byClass.values()].map((x) => ({ ...x, kids: kidsByClass.get(x.classId) || 0 })).sort((a, b) => b.due - a.due),
        lateKids: lateKids.size,
        active,
      };
    });
  const finReport = () => {
    const d = finData();
    const y = Q.year();
    const cur = today().slice(0, 7);
    const shown = d.months.filter((p) => p.m <= cur || p.expected || p.received);
    if (!d.expected && !d.received && !d.overdue.length) return { filters: '', body: UI.empty({ icon: 'wallet', title: `Nenhuma cobrança em ${y}`, text: 'Quando as mensalidades forem geradas, o relatório mostra o recebido por mês e a inadimplência por turma.', action: hasPage('financeiro') ? html`<a class="btn primary" href="#financeiro">Abrir o financeiro</a>` : '' }) };
    const data = shown.map((p) => ({ label: U.fmtMonthShort(p.m), value: p.received, track: p.expected, tip: `${U.cap(U.fmtMonth(p.m))}: recebido ${U.money(p.received)} · vencimentos ${U.money(p.expected)}` }));
    const lateRate = ratio(d.lateKids, d.active);
    const monthTable = section(
      'Mês a mês',
      html`<div class="table-wrap"><table class="table responsive rp-table"><thead><tr><th>Mês</th><th class="num">Vencimentos</th><th class="num">Recebido no mês</th><th class="num">Em atraso</th><th>Pago</th></tr></thead><tbody>${shown.map((p) => {
        const r = ratio(p.paidOfMonth, p.expected);
        return html`<tr class="${p.m === cur ? 'rp-cur' : ''}"><td class="first"><b>${U.cap(U.MONTHS[Number(p.m.slice(5, 7)) - 1])}</b></td><td class="num" data-l="Vencimentos">${U.money(p.expected)}</td><td class="num" data-l="Recebido">${U.money(p.received)}</td><td class="num" data-l="Em atraso">${p.late ? html`<b class="rp-t-bad">${U.money(p.late)}</b>` : U.money(0)}</td><td data-l="Pago">${p.expected ? meterCell(r, r >= 90 ? 'ok' : r >= 70 ? 'warn' : 'bad') : html`<span class="muted">—</span>`}</td></tr>`;
      })}</tbody><tfoot><tr><th>Total</th><th class="num">${U.money(d.expected)}</th><th class="num">${U.money(d.received)}</th><th class="num">${U.money(d.months.reduce((a, p) => a + p.late, 0))}</th><th></th></tr></tfoot></table></div>`,
    );
    const classTable = section(
      'Inadimplência por turma',
      d.byClass.length
        ? html`<div class="table-wrap"><table class="table responsive rp-table"><thead><tr><th>Turma</th><th class="num">Alunos em atraso</th><th class="num">Cobranças</th><th class="num">Valor atualizado</th><th>Da turma</th></tr></thead><tbody>${d.byClass.map((x) => {
            const r = ratio(x.students.size, x.kids);
            return html`<tr><td class="first nowrap"><b>${x.classId ? className(x.classId) : 'Sem turma'}</b></td><td class="num" data-l="Alunos em atraso">${x.students.size}${x.kids ? html`<span class="muted">/${x.kids}</span>` : ''}</td><td class="num" data-l="Cobranças">${U.int(x.n)}</td><td class="num" data-l="Atualizado"><b class="rp-t-bad">${U.money(x.due)}</b><span class="small muted rp-sub">original ${U.money(x.amount)}</span></td><td data-l="Da turma">${x.kids ? meterCell(r, r > 15 ? 'bad' : r > 5 ? 'warn' : 'ok') : html`<span class="muted">—</span>`}</td></tr>`;
          })}</tbody></table></div>`
        : html`<div class="rp-ok">${icon('checkCircle')}<span>Nenhuma cobrança em atraso. </span></div>`,
      hasPage('financeiro') && d.byClass.length ? html`<a class="btn sm" href="#financeiro">${icon('arrowRight')}Ver inadimplentes</a>` : '',
    );
    const totalM = [...d.methods.values()].reduce((a, b) => a + b, 0);
    const methods = totalM
      ? section(
          'Formas de pagamento',
          html`<div class="hbars rp-methods">${[...d.methods.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => html`<div class="hbar"><span>${k}</span><span class="track"><span class="fill" style="width:${(v / totalM) * 100}%"></span></span><span class="v">${pct((v / totalM) * 100)}</span></div>`)}</div>`,
          html`<span class="small muted">recebido em ${y}</span>`,
        )
      : '';
    const body = html`<div class="kpis rp-kpis">
        ${kpi(`Vencimentos de ${y}`, U.moneyShort(d.expected), 'cobranças com vencimento no ano')}
        ${kpi(`Recebido em ${y}`, U.moneyShort(d.received), d.expected ? `${pct(ratio(d.received, d.expected))} dos vencimentos` : '', 'ok')}
        ${kpi('Em atraso', U.moneyShort(d.overdueDue), `${U.plural(d.overdue.length, 'cobrança', 'cobranças')}, com multa e juros`, d.overdue.length ? 'bad' : '')}
        ${kpi('Inadimplência', pct(lateRate), `${U.int(d.lateKids)} de ${U.int(d.active)} alunos`, lateRate > 10 ? 'bad' : lateRate > 3 ? 'warn' : 'ok')}
      </div>
      ${chart('fin', data, { fmt: (v) => (v >= 1000 ? `${U.num(v / 1000, v >= 10000 ? 0 : 1)} mil` : U.int(v)), title: 'Recebido por mês (a faixa clara é o total dos vencimentos)', label: 'last' })}
      ${monthTable}
      ${classTable}
      ${methods}
      <p class="small muted rp-foot">"Recebido no mês" soma os pagamentos pela data em que entraram; "pago dos vencimentos" mostra quanto das cobranças que venciam no mês já foi pago.</p>`;
    const csv = () => {
      const rows = [['Mês', 'Vencimentos (R$)', 'Recebido no mês (R$)', 'Em atraso (R$)', 'Pago dos vencimentos (%)']];
      for (const p of shown) rows.push([U.cap(U.fmtMonth(p.m)), U.num(p.expected, 2), U.num(p.received, 2), U.num(p.late, 2), p.expected ? U.num(ratio(p.paidOfMonth, p.expected), 0) : '']);
      rows.push([]);
      rows.push(['Turma', 'Alunos em atraso', 'Alunos na turma', 'Cobranças em atraso', 'Valor original (R$)', 'Valor atualizado (R$)']);
      for (const x of d.byClass) rows.push([x.classId ? className(x.classId) : 'Sem turma', x.students.size, x.kids, x.n, U.num(x.amount, 2), U.num(x.due, 2)]);
      return { rows, name: `financeiro-${y}` };
    };
    return { filters: '', body, csv, desc: `Ano de ${y}` };
  };

  // =====================================================================
  // Registro dos relatórios
  // =====================================================================
  const ped = (p) => () => can('relatorios.ver') && can(p);
  const REPORTS = [
    { id: 'frequencia', label: 'Frequência', icon: 'checkSquare', desc: 'Por turma e alunos abaixo do mínimo', when: ped('chamada.ver'), build: freqReport },
    { id: 'desempenho', label: 'Desempenho', icon: 'grade', desc: 'Médias por turma e disciplina', when: ped('notas.ver'), build: perfReport },
    { id: 'ocorrencias', label: 'Ocorrências', icon: 'flag', desc: 'Por turma, categoria e mês', when: ped('diario.ver'), build: occReport },
    { id: 'familias', label: 'Famílias e agenda', icon: 'eye', desc: 'Quem visualiza e dá ciente', when: ped('diario.ver'), build: engReport },
    { id: 'alunos', label: 'Lista de alunos', icon: 'users', desc: 'Turma, nascimento e responsáveis', when: ped('alunos.ver'), build: listReport },
    { id: 'aniversariantes', label: 'Aniversariantes', icon: 'cake', desc: 'Alunos que fazem anos no mês', when: ped('alunos.ver'), build: bdayReport },
    { id: 'financeiro', label: 'Financeiro', icon: 'wallet', desc: 'Recebido por mês e inadimplência', when: () => can('relatorios.financeiro') && Q.chargesFees(), build: finReport },
  ];
  const reports = () => REPORTS.filter((r) => {
    try {
      return r.when();
    } catch (e) {
      return false;
    }
  });
  const currentReport = (rest) => {
    const list = reports();
    return list.find((r) => r.id === rest[0]) || list[0] || null;
  };
  let last = null; // relatório montado (para o CSV)

  const render = (rest) => {
    charts.clear();
    const list = reports();
    const rep = currentReport(rest);
    const head = html`<div class="page-head"><div><div class="eyebrow">Gestão</div><h1>Relatórios</h1><p class="lead">Números da escola para decidir e prestar contas. Filtre, exporte para planilha (CSV) ou imprima.</p></div></div>`;
    if (!rep) {
      return html`${head}<div class="card">${UI.empty({ icon: 'chart', title: 'Nenhum relatório disponível', text: Q.chargesFees() ? 'O seu acesso não inclui os dados usados nos relatórios.' : 'O relatório financeiro aparece quando a escola cobra mensalidades pela Caderneta.' })}</div>`;
    }
    const st = RS();
    let out;
    try {
      out = rep.build(st);
    } catch (err) {
      console.error(err);
      out = { filters: '', body: UI.empty({ icon: 'alert', title: 'Não foi possível montar este relatório', text: 'Tente outro filtro ou volte mais tarde.' }) };
    }
    last = { rep, out };
    const s = S();
    const scopeNote = me().scope !== 'todas' && rep.id !== 'financeiro' ? html`<p class="notice small rp-scope no-print">${icon('info')}<span class="grow">Você vê só as turmas e os alunos que acompanha.</span></p>` : '';
    return html`${head}
      <div class="layout-report rp-layout">
        <nav class="rp-side no-print" aria-label="Relatórios">
          <div class="report-list rp-list-desk">${list.map((r) => html`<button type="button" data-rp-go="${r.id}" aria-pressed="${String(r.id === rep.id)}">${icon(r.icon)}<span><b>${r.label}</b><span>${r.desc}</span></span></button>`)}</div>
          <label class="rp-pick"><span class="sr-only">Relatório</span><select class="input" data-rp-go-select>${list.map((r) => html`<option value="${r.id}" ${r.id === rep.id ? 'selected' : ''}>${r.label}</option>`)}</select></label>
        </nav>
        <section class="card rp-card" aria-labelledby="rp-title">
          <div class="print-only rp-print-head"><b>${s.schoolName || 'Escola'}</b><span>Relatório: ${rep.label}${out.desc ? ` · ${out.desc}` : ''}</span><span>Emitido em ${U.fmtDate(today())} por ${me().name}</span></div>
          <div class="rp-head"><div><h2 id="rp-title">${icon(rep.icon, 'muted')}${rep.label}</h2>${out.desc ? html`<p class="sub">${out.desc}</p>` : ''}</div>
            ${out.csv ? html`<div class="rp-acts no-print"><button type="button" class="btn sm" data-rp-csv>${icon('download')}<span>Planilha (CSV)</span></button><button type="button" class="btn sm" data-rp-print>${icon('printer')}<span>Imprimir</span></button></div>` : ''}</div>
          ${out.filters ? html`<div class="toolbar rp-filters no-print">${out.filters}</div>` : ''}
          ${scopeNote}
          <div class="rp-body">${out.body}</div>
        </section>
      </div>`;
  };

  const rerender = () => {
    const a = document.activeElement;
    const key = a && a.dataset ? a.dataset.rpF : null;
    const pos = key && typeof a.selectionStart === 'number' ? a.selectionStart : null;
    App.render();
    if (key) {
      const f = document.querySelector(`[data-rp-f="${key}"]`);
      if (f) {
        f.focus();
        if (pos != null && f.setSelectionRange) {
          try {
            f.setSelectionRange(pos, pos);
          } catch (e) {
            /* campo sem seleção */
          }
        }
      }
    }
  };
  const go = (id) => App.go(`relatorios/${id}`);

  const mount = (el, rest) => {
    const rep = currentReport(rest);
    if (!rep) return;
    const st = RS();
    // gráficos
    UI.$$('[data-rp-chart]', el).forEach((box) => {
      const c = charts.get(box.dataset.rpChart);
      if (c) UI.columns(box, { data: c.data, fmt: c.fmt, label: c.label, height: c.height });
    });
    if (last && last.out && last.out.load) loadYear();
    const setF = U.debounce(rerender, 260);
    el.addEventListener('change', (e) => {
      const f = e.target.closest('[data-rp-f]');
      if (f && f.dataset.rpF !== 'q') {
        st[f.dataset.rpF] = f.value;
        rerender();
        return;
      }
      if (e.target.closest('[data-rp-go-select]')) go(e.target.value);
    });
    el.addEventListener('input', (e) => {
      const f = e.target.closest('[data-rp-f="q"]');
      if (f) {
        st.q = f.value;
        setF();
      }
    });
    const pick = (row) => {
      st.classId = row.dataset.rpPick;
      rerender();
      const card = el.ownerDocument.querySelector('.rp-card');
      if (card) card.scrollIntoView({ block: 'start' });
    };
    el.addEventListener('keydown', (e) => {
      const row = e.target.closest('[data-rp-pick]');
      if (row && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault();
        pick(row);
      }
    });
    el.addEventListener('click', (e) => {
      const g = e.target.closest('[data-rp-go]');
      if (g) return go(g.dataset.rpGo);
      if (e.target.closest('a')) return;
      const row = e.target.closest('[data-rp-pick]');
      if (row) return pick(row);
      const set = e.target.closest('[data-rp-set]');
      if (set) {
        st[set.dataset.rpSet] = set.dataset.v;
        return rerender();
      }
      if (e.target.closest('[data-rp-retry]')) {
        hist = { key: '', items: new Map(), loading: false, done: false, error: '' };
        return rerender();
      }
      if (e.target.closest('[data-rp-csv]')) {
        if (!last || !last.out.csv) return;
        const { rows, name } = last.out.csv();
        U.download(`${name}-${today()}.csv`, U.toCSV(rows));
        UI.toast(`Planilha baixada (${U.plural(Math.max(0, rows.filter((r) => r.length).length - 1), 'linha', 'linhas')})`, { ic: 'download' });
        return;
      }
      if (e.target.closest('[data-rp-print]')) {
        try {
          window.print();
        } catch (err) {
          UI.toast('Não foi possível abrir a impressão neste navegador.', { tone: 'bad' });
        }
        return;
      }
      const invc = e.target.closest('[data-rp-invite-class]');
      if (invc && fn('convidarFamilias')) return Actions.convidarFamilias(invc.dataset.rpInviteClass);
      const msg = e.target.closest('[data-rp-msg]');
      if (msg && fn('novaMensagem')) return Actions.novaMensagem({ studentId: msg.dataset.rpMsg });
    });
  };

  App.page({
    id: 'relatorios',
    label: 'Relatórios',
    icon: 'chart',
    group: 'Gestão',
    order: 70,
    anyPerm: ['relatorios.ver', 'relatorios.financeiro'],
    keys: 'relatório frequência desempenho notas médias ocorrências aniversariantes inadimplência lista de alunos contatos',
    title: (rest) => {
      const r = currentReport(rest);
      return r ? `Relatório de ${r.label.toLowerCase()}` : 'Relatórios';
    },
    render,
    mount,
  });

  // busca rápida: abrir um relatório direto
  App.searchProvider((query) => {
    if (!Store.me || Store.family || !Store.canAny('relatorios.ver', 'relatorios.financeiro')) return [];
    return reports()
      .filter((r) => U.matches(query, 'relatório', r.label, r.desc))
      .map((r) => ({ group: 'Relatórios', label: `Relatório: ${r.label}`, icon: r.icon, meta: r.desc, keys: `relatório ${r.label} ${r.desc}`, run: () => go(r.id) }));
  });
})();
