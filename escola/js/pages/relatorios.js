'use strict';
/* Relatórios: boletim, ata de notas, frequência, alunos em risco, inadimplência, aniversariantes e contatos. */
const REPORTS = [
  ['boletim', 'file', 'Boletim do aluno', 'Notas por bimestre, média e frequência'],
  ['ata', 'grade', 'Ata de notas da turma', 'Todas as disciplinas de um bimestre'],
  ['frequencia', 'checkSquare', 'Frequência da turma', 'Faltas e percentual de cada aluno'],
  ['risco', 'alert', 'Alunos que precisam de atenção', 'Média ou frequência abaixo do mínimo'],
  ['inadimplencia', 'wallet', 'Inadimplência', 'Famílias com mensalidade atrasada'],
  ['aniversariantes', 'cake', 'Aniversariantes', 'Por mês, com idade que vão completar'],
  ['contatos', 'phone', 'Contatos dos responsáveis', 'Telefone e e-mail por turma'],
];

Pages.relatorios = {
  title: 'Relatórios',
  state(params) {
    const v = (View.relatorios = View.relatorios || {});
    if (params[0] === 'boletim' && params[1]) {
      v.type = 'boletim';
      v.studentId = params[1];
    }
    v.type = v.type || 'boletim';
    const cls = Q.classes();
    if (!v.classId || !Q.klass(v.classId)) v.classId = (cls[0] || {}).id || '';
    if (!v.studentId || !Q.student(v.studentId)) v.studentId = (Q.students()[0] || {}).id || '';
    v.term = v.term || Q.settings().term;
    v.month = v.month || U.today().slice(5, 7);
    return v;
  },
  render(params) {
    const v = this.state(params);
    const r = this.build(v);
    const canPrint = !U.inFrame;
    return `
      <div class="page-head no-print"><div><h1>Relatórios</h1><p class="lead">Escolha um relatório, ajuste os filtros e exporte para planilha${canPrint ? ' ou imprima' : ''}.</p></div></div>
      <div class="layout-report">
        <nav class="report-list no-print" aria-label="Tipos de relatório">
          ${REPORTS.map(([k, ic, t, d]) => `<button type="button" data-type="${k}" aria-pressed="${v.type === k}">${icon(ic)}<span><b>${t}</b><span>${d}</span></span></button>`).join('')}
        </nav>
        <div class="stack" style="gap:14px">
          <div class="toolbar no-print">
            ${r.filters || ''}
            <span class="grow"></span>
            ${r.rows ? `<button class="btn" data-x="export">${icon('download')}Exportar</button>` : ''}
            ${canPrint ? `<button class="btn" data-x="print">${icon('printer')}Imprimir</button>` : ''}
          </div>
          ${r.html}
        </div>
      </div>`;
  },

  classSelect(v) {
    return `<select class="input" data-f="classId" style="width:auto" aria-label="Turma">${Q.classes().map((c) => `<option value="${c.id}" ${c.id === v.classId ? 'selected' : ''}>${U.esc(c.name)}</option>`).join('')}</select>`;
  },
  termSelect(v) {
    return `<select class="input" data-f="term" style="width:auto" aria-label="Bimestre">${[1, 2, 3, 4].map((t) => `<option value="${t}" ${t === Number(v.term) ? 'selected' : ''}>${t}º bimestre</option>`).join('')}</select>`;
  },
  table(head, rows, opts = {}) {
    if (!rows.length) return `<section class="card">${UI.empty({ icon: opts.emptyIcon || 'checkCircle', title: opts.emptyTitle || 'Nada para mostrar', text: opts.emptyText || '' })}</section>`;
    return `<section class="card">${opts.title ? `<div class="card-head"><h2>${opts.title}</h2><span class="sub">${opts.sub || ''}</span></div>` : ''}<div class="table-wrap" style="${opts.title ? 'margin-top:10px' : ''}"><table class="table">
      <thead><tr>${head.map((h) => `<th class="${h[1] || ''}">${h[0]}</th>`).join('')}</tr></thead>
      <tbody>${rows.map((r) => `<tr>${r.map((c, i) => `<td class="${head[i][1] || ''}">${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div></section>`;
  },

  build(v) {
    const s = Q.settings();
    if (!Store.state.classes.length) return { html: `<section class="card">${UI.empty({ icon: 'chart', title: 'Ainda sem dados', text: 'Os relatórios aparecem quando houver turmas e alunos cadastrados.' })}</section>` };

    if (v.type === 'boletim') {
      const a = Q.student(v.studentId);
      const filters = `<select class="input" data-f="studentId" style="width:auto;max-width:100%" aria-label="Aluno">${Q.classes()
        .map((c) => `<optgroup label="${U.esc(c.name)}">${Q.roster(c.id).map((x) => `<option value="${x.id}" ${x.id === v.studentId ? 'selected' : ''}>${U.esc(x.name)}</option>`).join('')}</optgroup>`)
        .join('')}</select>`;
      if (!a) return { filters, html: `<section class="card">${UI.empty({ icon: 'user', title: 'Escolha um aluno' })}</section>` };
      const subs = Q.classSubjects(a.classId);
      const att = Q.studentAttendance(a.id);
      const c = Q.klass(a.classId);
      const avg = Q.studentAvg(a.id);
      const rows = [['Disciplina', '1º bim.', '2º bim.', '3º bim.', '4º bim.', 'Média', 'Situação']].concat(
        subs.map((x) => {
          const m = Q.subjectAvg(a.id, x.id);
          return [x.name, ...[1, 2, 3, 4].map((t) => U.num(Q.grade(a.id, x.id, t))), U.num(m), Q.situation(m, Q.termsWithGrade(a.id, x.id) === 4).label];
        }),
      );
      return {
        filters,
        rows,
        name: `boletim-${U.slug(a.name)}`,
        html: `<section class="card boletim">
          <div class="boletim-head">
            <div><p class="eyebrow">Boletim escolar · ${s.year}</p><h2>${U.esc(s.schoolName)}</h2></div>
            <div style="text-align:right"><div class="strong">${U.esc(a.name)}</div><div class="small muted">Matrícula ${U.esc(a.enrollment)} · ${U.esc(c ? `${c.name} · ${c.shift}` : 'sem turma')}</div></div>
          </div>
          <div class="table-wrap"><table class="table">
            <thead><tr><th>Disciplina</th>${[1, 2, 3, 4].map((t) => `<th class="num">${t}º bim.</th>`).join('')}<th class="num">Média</th><th>Situação</th></tr></thead>
            <tbody>${subs
              .map((x) => {
                const m = Q.subjectAvg(a.id, x.id);
                const sit = Q.situation(m, Q.termsWithGrade(a.id, x.id) === 4);
                return `<tr><td>${U.esc(x.name)}</td>${[1, 2, 3, 4].map((t) => `<td class="num ${UI.gradeCls(Q.grade(a.id, x.id, t))}">${U.num(Q.grade(a.id, x.id, t))}</td>`).join('')}<td class="num strong ${UI.gradeCls(m)}">${U.num(m)}</td><td>${sit.tone ? UI.pill(sit.label, sit.tone) : '—'}</td></tr>`;
              })
              .join('')}</tbody>
          </table></div>
          <dl class="summary">
            <dt>Média geral</dt><dd class="${UI.gradeCls(avg)}">${U.num(avg)}</dd>
            <dt>Frequência</dt><dd>${U.pct(att.rate)} (${U.plural(att.absent, 'falta', 'faltas')}${att.justified ? `, ${att.justified} justificadas` : ''} em ${U.plural(att.days, 'dia letivo', 'dias letivos')})</dd>
            <dt>Critérios</dt><dd style="font-weight:400">Média mínima ${U.num(s.passing)} · recuperação a partir de ${U.num(s.recovery)} · frequência mínima ${s.minAttendance}%</dd>
          </dl>
          <div class="signatures"><div>Direção / Secretaria</div><div>Responsável</div></div>
          <p class="small muted">Emitido em ${U.fmtDate(U.today())}.</p>
        </section>`,
      };
    }

    if (v.type === 'ata') {
      const c = Q.klass(v.classId);
      const subs = Q.classSubjects(c.id);
      const kids = Q.roster(c.id);
      const head = [['Nº', 'num'], ['Aluno', ''], ...subs.map((x) => [U.esc(x.short || x.name), 'num']), ['Média', 'num']];
      const data = kids.map((a, i) => {
        const vals = subs.map((x) => Q.grade(a.id, x.id, v.term));
        return { a, i, vals, avg: U.avg(vals) };
      });
      return {
        filters: this.classSelect(v) + this.termSelect(v),
        name: `ata-${U.slug(c.name)}-${v.term}bim`,
        rows: [['Nº', 'Aluno', ...subs.map((x) => x.name), 'Média'], ...data.map((d) => [d.i + 1, d.a.name, ...d.vals.map((x) => U.num(x)), U.num(d.avg)])],
        html: this.table(
          head,
          data.map((d) => [d.i + 1, U.esc(d.a.name), ...d.vals.map((x) => `<span class="${UI.gradeCls(x)}">${U.num(x)}</span>`), `<b class="${UI.gradeCls(d.avg)}">${U.num(d.avg)}</b>`]),
          { title: `Ata de notas · ${U.esc(c.name)}`, sub: `${v.term}º bimestre de ${s.year} · notas abaixo de ${U.num(s.passing)} em vermelho`, emptyIcon: 'users', emptyTitle: 'Turma sem alunos' },
        ),
      };
    }

    if (v.type === 'frequencia') {
      const c = Q.klass(v.classId);
      const kids = Q.roster(c.id).map((a) => ({ a, att: Q.studentAttendance(a.id) }));
      return {
        filters: this.classSelect(v),
        name: `frequencia-${U.slug(c.name)}`,
        rows: [['Aluno', 'Dias', 'Presenças', 'Faltas', 'Justificadas', 'Frequência (%)'], ...kids.map(({ a, att }) => [a.name, att.days, att.present, att.absent, att.justified, att.rate == null ? '' : Math.round(att.rate)])],
        html: this.table(
          [['Aluno', ''], ['Dias', 'num'], ['Faltas', 'num'], ['Justif.', 'num'], ['Frequência', 'num']],
          kids.map(({ a, att }) => [`<a href="#alunos/${a.id}">${U.esc(a.name)}</a>`, att.days, att.absent, att.justified, `<div class="mini-bar">${UI.meter(att.rate, UI.attTone(att.rate))}<b>${U.pct(att.rate)}</b></div>`]),
          { title: `Frequência · ${U.esc(c.name)}`, sub: `mínimo exigido ${s.minAttendance}%`, emptyIcon: 'users', emptyTitle: 'Turma sem alunos' },
        ),
      };
    }

    if (v.type === 'risco') {
      const list = Q.atRisk().sort(U.by((x) => (Q.klass(x.a.classId)?.name || '') + x.a.name));
      return {
        name: 'alunos-atencao',
        rows: [['Aluno', 'Turma', 'Média', 'Frequência (%)', 'Responsável', 'Telefone'], ...list.map((x) => [x.a.name, Q.klass(x.a.classId)?.name || '', U.num(x.avg), x.att == null ? '' : Math.round(x.att), x.a.guardian?.name, x.a.guardian?.phone])],
        html: this.table(
          [['Aluno', ''], ['Turma', ''], ['Média', 'num'], ['Frequência', 'num'], ['Motivo', '']],
          list.map((x) => [
            `<a href="#alunos/${x.a.id}">${U.esc(x.a.name)}</a>`,
            U.esc(Q.klass(x.a.classId)?.name || ''),
            `<span class="${UI.gradeCls(x.avg)}">${U.num(x.avg)}</span>`,
            `<span style="${x.att != null && x.att < s.minAttendance ? 'color:var(--bad);font-weight:600' : ''}">${U.pct(x.att)}</span>`,
            [x.avg != null && x.avg < s.passing ? UI.pill('Notas', 'warn') : '', x.att != null && x.att < s.minAttendance ? UI.pill('Faltas', 'bad') : ''].join(' '),
          ]),
          { title: 'Alunos que precisam de atenção', sub: `média abaixo de ${U.num(s.passing)} ou frequência abaixo de ${s.minAttendance}%`, emptyTitle: 'Ninguém em risco', emptyText: 'Todos os alunos estão com média e frequência dentro do esperado.' },
        ),
      };
    }

    if (v.type === 'inadimplencia') {
      const d = Q.debtors();
      return {
        name: 'inadimplencia',
        rows: [['Aluno', 'Turma', 'Responsável', 'Telefone', 'Meses', 'Total atualizado'], ...d.map((x) => [x.student.name, Q.klass(x.student.classId)?.name || '', x.student.guardian?.name, x.student.guardian?.phone, x.invoices.map((i) => U.monthName(i.month)).join(', '), U.num(x.total, 2)])],
        html: this.table(
          [['Aluno', ''], ['Responsável', ''], ['Meses', ''], ['Total', 'num']],
          d.map((x) => [`<a href="#alunos/${x.student.id}">${U.esc(x.student.name)}</a>`, `${U.esc(x.student.guardian?.name || '')}<div class="person-sub">${U.esc(x.student.guardian?.phone || '')}</div>`, x.invoices.map((i) => U.fmtMonthShort(i.month)).join(', '), `<b>${U.money(x.total)}</b>`]),
          { title: 'Inadimplência', sub: `${U.money(U.sum(d.map((x) => x.total)))} no total, com multa e juros`, emptyTitle: 'Nenhuma família em atraso' },
        ),
      };
    }

    if (v.type === 'aniversariantes') {
      const list = Q.birthdays(v.month);
      const filters = `<select class="input" data-f="month" style="width:auto" aria-label="Mês">${U.MONTHS.map((m, i) => `<option value="${U.pad(i + 1)}" ${U.pad(i + 1) === v.month ? 'selected' : ''}>${U.cap(m)}</option>`).join('')}</select>`;
      return {
        filters,
        name: `aniversariantes-${U.MONTHS[Number(v.month) - 1]}`,
        rows: [['Dia', 'Aluno', 'Turma', 'Idade que completa'], ...list.map((a) => [Number(a.birth.slice(8)), a.name, Q.klass(a.classId)?.name || '', s.year - Number(a.birth.slice(0, 4))])],
        html: this.table(
          [['Dia', 'num'], ['Aluno', ''], ['Turma', ''], ['Completa', 'num']],
          list.map((a) => [Number(a.birth.slice(8)), `<a href="#alunos/${a.id}">${U.esc(a.name)}</a>`, U.esc(Q.klass(a.classId)?.name || ''), `${s.year - Number(a.birth.slice(0, 4))} anos`]),
          { title: `Aniversariantes de ${U.MONTHS[Number(v.month) - 1]}`, sub: U.plural(list.length, 'aluno', 'alunos'), emptyIcon: 'cake', emptyTitle: 'Nenhum aniversariante neste mês' },
        ),
      };
    }

    // contatos
    const c = Q.klass(v.classId);
    const kids = Q.roster(c.id);
    return {
      filters: this.classSelect(v),
      name: `contatos-${U.slug(c.name)}`,
      rows: [['Aluno', 'Responsável', 'Parentesco', 'Telefone', 'E-mail'], ...kids.map((a) => [a.name, a.guardian?.name, a.guardian?.relation, a.guardian?.phone, a.guardian?.email])],
      html: this.table(
        [['Aluno', ''], ['Responsável', ''], ['Telefone', 'nowrap'], ['E-mail', '']],
        kids.map((a) => [U.esc(a.name), `${U.esc(a.guardian?.name || '')} <span class="muted small">${U.esc(a.guardian?.relation || '')}</span>`, U.esc(a.guardian?.phone || ''), U.esc(a.guardian?.email || '')]),
        { title: `Contatos · ${U.esc(c.name)}`, sub: U.plural(kids.length, 'aluno', 'alunos'), emptyIcon: 'users', emptyTitle: 'Turma sem alunos' },
      ),
    };
  },

  mount(el) {
    const v = View.relatorios;
    el.addEventListener('click', (e) => {
      const t = e.target.closest('[data-type]');
      if (t) {
        v.type = t.dataset.type;
        if (App.route().length > 1) App.go('relatorios');
        else App.render();
        return;
      }
      const x = e.target.closest('[data-x]');
      if (!x) return;
      if (x.dataset.x === 'print') window.print();
      if (x.dataset.x === 'export') {
        const r = this.build(v);
        if (r.rows) Actions.exportTable(x, r.name || v.type, r.rows);
      }
    });
    el.addEventListener('change', (e) => {
      const f = e.target.closest('[data-f]');
      if (!f) return;
      v[f.dataset.f] = f.dataset.f === 'term' ? Number(f.value) : f.value;
      if (App.route().length > 1) App.go('relatorios');
      else App.render();
    });
  },
};
