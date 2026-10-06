'use strict';
/* Painel: o que precisa de atenção hoje, números principais e atalhos. */
Pages.painel = {
  title: 'Painel',
  render() {
    const st = Store.state;
    const s = Q.settings();
    const T = U.today();

    if (!st.classes.length || !st.students.length) return this.firstSteps();

    const pend = Q.pendingRolls(T);
    const school = Q.isSchoolDay(T);
    const day = Q.dayAttendance(T);
    const debtors = Q.debtors();
    const debtTotal = U.sum(debtors.map((d) => d.total));
    const prog = Q.termProgress(s.term);
    const bdays = Q.birthdays(T.slice(5, 7));
    const bToday = bdays.filter((a) => a.birth.slice(5) === T.slice(5));
    const month = T.slice(0, 7);
    const ms = Q.monthSummary(month);
    const active = Q.students();
    const capacity = U.sum(st.classes.map((c) => c.capacity || 0));
    const schoolAvg = U.avg(active.map((a) => Q.studentAvg(a.id)));
    const risk = Q.atRisk();
    const missingInv = s.defaultFee > 0 || st.invoices.length ? Q.missingInvoices(month).length : 0;

    // ---- tarefas do dia ----
    const tasks = [];
    if (school) {
      if (pend.length)
        tasks.push({
          tone: 'warn', ic: 'checkSquare',
          title: `Chamada pendente em ${U.plural(pend.length, 'turma', 'turmas')}`,
          text: pend.map((c) => c.name).join(', '),
          btn: `<a class="btn primary sm" href="#chamada">Fazer chamada</a>`,
        });
      else tasks.push({ tone: 'ok', ic: 'checkCircle', title: 'Chamada de todas as turmas feita', text: `${U.pct(day.rate)} de presença hoje`, btn: '' });
    } else {
      const h = Q.holiday(T);
      tasks.push({ tone: '', ic: 'sunrise', title: h ? `Hoje é feriado: ${h}` : 'Hoje não tem aula', text: 'A chamada volta no próximo dia letivo.', btn: '' });
    }
    if (debtors.length)
      tasks.push({
        tone: 'bad', ic: 'wallet',
        title: `${U.plural(debtors.length, 'família', 'famílias')} com mensalidade atrasada`,
        text: `${U.money(debtTotal)} em aberto, já com multa e juros`,
        btn: `<a class="btn sm" href="#financeiro" data-fin-tab="inadimplentes">Ver e cobrar</a>`,
      });
    if (missingInv && s.defaultFee > 0)
      tasks.push({
        tone: 'warn', ic: 'cash',
        title: `${U.plural(missingInv, 'aluno', 'alunos')} sem mensalidade de ${U.monthName(month)}`,
        text: 'Gere as cobranças do mês com um clique.',
        btn: `<button class="btn sm" data-x="gen">Gerar agora</button>`,
      });
    if (prog.pct < 100)
      tasks.push({
        tone: '', ic: 'grade',
        title: `Notas do ${s.term}º bimestre: ${U.pct(prog.pct)} lançadas`,
        text: `Faltam ${U.int(prog.total - prog.filled)} notas em ${U.plural(Q.pendingGradeSets(s.term).length, 'diário', 'diários')}.`,
        btn: `<a class="btn sm" href="#notas">Lançar notas</a>`,
      });
    if (bToday.length)
      tasks.push({
        tone: '', ic: 'cake',
        title: `Aniversário hoje: ${bToday.map((a) => U.shortName(a.name)).join(', ')}`,
        text: bToday.map((a) => `${U.age(a.birth)} anos · ${Q.klass(a.classId)?.name || ''}`).join(' · '),
        btn: '',
      });

    const quick = [
      ['matricular', 'userPlus', 'Matricular aluno'],
      ['chamada', 'checkSquare', 'Fazer chamada'],
      ['notas', 'grade', 'Lançar notas'],
      ['receber', 'cash', 'Registrar pagamento'],
      ['comunicado', 'megaphone', 'Enviar comunicado'],
      ['evento', 'calendar', 'Marcar evento'],
    ];

    const events = Q.upcoming(6);
    const log = st.log.slice(0, 6);
    const rel = (t) => {
      const m = Math.round((Date.now() - t) / 60000);
      if (m < 1) return 'agora';
      if (m < 60) return `há ${m} min`;
      const h = Math.round(m / 60);
      if (h < 24) return `há ${h} h`;
      return `há ${Math.round(h / 24)} d`;
    };

    return `
      <div class="page-head">
        <div>
          <p class="eyebrow">${U.esc(U.fmtDateLong(T))} · ${s.term}º bimestre</p>
          <h1>${U.greeting()}! Este é o resumo de hoje.</h1>
        </div>
      </div>

      <section class="quick" aria-label="Atalhos">
        ${quick.map(([k, ic, l]) => `<button type="button" data-quick="${k}">${icon(ic)}<span>${l}</span></button>`).join('')}
      </section>

      <section class="kpis" aria-label="Números da escola">
        <div class="card kpi">
          <span class="kpi-label">${icon('users')}Alunos ativos</span>
          <span class="kpi-value">${U.int(active.length)}</span>
          <span class="kpi-foot">${capacity ? `${U.pct((active.length / capacity) * 100)} das ${U.int(capacity)} vagas` : `${st.classes.length} turmas`}</span>
        </div>
        <div class="card kpi">
          <span class="kpi-label">${icon('checkSquare')}Presença hoje</span>
          <span class="kpi-value">${day.rate == null ? '—' : U.pct(day.rate)}</span>
          <span class="kpi-foot">${school ? `${day.taken} de ${day.classes} turmas com chamada` : 'Sem aula hoje'}</span>
        </div>
        <div class="card kpi">
          <span class="kpi-label">${icon('wallet')}Recebido em ${U.monthName(month)}</span>
          <span class="kpi-value">${U.moneyShort(ms.received)}</span>
          ${UI.meter(ms.pct, ms.pct >= 85 ? 'ok' : '')}
          <span class="kpi-foot">${U.pct(ms.pct)} de ${U.moneyShort(ms.expected)} previstos</span>
        </div>
        <div class="card kpi">
          <span class="kpi-label">${icon('grade')}Média geral</span>
          <span class="kpi-value">${U.num(schoolAvg)}</span>
          <span class="kpi-foot">${risk.length ? `<a href="#relatorios" data-rep="risco">${U.plural(risk.length, 'aluno precisa', 'alunos precisam')} de atenção</a>` : 'Nenhum aluno em risco'}</span>
        </div>
      </section>

      <div class="grid-2">
        <div class="stack">
          <section class="card" aria-labelledby="t-tasks">
            <div class="card-head"><h2 id="t-tasks">Para hoje</h2><span class="sub">${tasks.filter((t) => t.btn).length ? 'Itens que pedem sua atenção' : 'Tudo em dia'}</span></div>
            <div class="card-body tasks">
              ${tasks
                .map(
                  (t) => `<div class="task ${t.tone}"><span class="task-icon">${icon(t.ic)}</span>
                  <div class="task-text"><strong>${U.esc(t.title)}</strong><span>${U.esc(t.text)}</span></div>${t.btn}</div>`,
                )
                .join('')}
            </div>
          </section>


          <section class="card" aria-labelledby="t-abs">
            <div class="card-head"><h2 id="t-abs">Faltas por dia</h2><span class="sub">Últimos 10 dias letivos, todas as turmas</span></div>
            <div class="card-body"><div data-chart="abs" data-label="Faltas por dia nos últimos 10 dias letivos"></div></div>
          </section>

          <section class="card" aria-labelledby="t-rev">
            <div class="card-head"><h2 id="t-rev">Mensalidades recebidas</h2>
              <div class="legend"><span><span class="swatch" style="--c:var(--primary)"></span>Recebido</span><span><span class="swatch" style="--c:var(--accent-soft)"></span>Previsto</span></div>
            </div>
            <div class="card-body"><div data-chart="rev" data-label="Mensalidades recebidas e previstas nos últimos 6 meses"></div></div>
          </section>
        </div>

        <div class="stack">
          <section class="card" aria-labelledby="t-ev">
            <div class="card-head"><h2 id="t-ev">Próximos eventos</h2><a class="btn ghost sm" href="#agenda">Agenda ${icon('arrowRight')}</a></div>
            <div class="card-body">
              ${
                events.length
                  ? `<ul class="items">${events
                      .map((e) => {
                        const tp = Q.EVENT_TYPES[e.type] || Q.EVENT_TYPES.evento;
                        return `<li><span class="date-chip ${e.date === T ? 'today' : ''}"><b>${U.parse(e.date).getDate()}</b><span>${U.MONTHS_SHORT[U.parse(e.date).getMonth()]}</span></span>
                        <div class="grow"><div class="strong">${U.esc(e.title)}</div><div class="small muted">${U.esc(U.relDay(e.date))}${e.time ? ' · ' + e.time : ''}${e.classId ? ' · ' + U.esc(Q.klass(e.classId)?.name || '') : ''}</div></div>
                        <span class="ev-dot" style="--c:var(--cat-${tp.c})" title="${tp.label}"></span></li>`;
                      })
                      .join('')}</ul>`
                  : UI.empty({ icon: 'calendar', title: 'Agenda livre', text: 'Nenhum evento nos próximos dias.' })
              }
            </div>
          </section>

          <section class="card" aria-labelledby="t-bd">
            <div class="card-head"><h2 id="t-bd">Aniversariantes de ${U.monthName(month)}</h2><span class="sub">${bdays.length}</span></div>
            <div class="card-body">
              ${
                bdays.length
                  ? `<ul class="items">${bdays
                      .slice(0, 6)
                      .map(
                        (a) => `<li>${UI.avatar(a.name, 'sm')}<div class="grow"><a class="person-name" href="#alunos/${a.id}">${U.esc(U.shortName(a.name))}</a><div class="person-sub">${U.esc(Q.klass(a.classId)?.name || '')}</div></div>
                        <span class="${a.birth.slice(5) === T.slice(5) ? 'pill mark plain' : 'small muted'}">${a.birth.slice(5) === T.slice(5) ? 'hoje' : 'dia ' + Number(a.birth.slice(8))}</span></li>`,
                      )
                      .join('')}</ul>${bdays.length > 6 ? `<p class="small muted" style="margin-top:8px">e mais ${bdays.length - 6}.</p>` : ''}`
                  : '<p class="muted small">Nenhum aniversariante este mês.</p>'
              }
            </div>
          </section>

          <section class="card" aria-labelledby="t-log">
            <div class="card-head"><h2 id="t-log">Atividade recente</h2></div>
            <div class="card-body">
              ${
                log.length
                  ? `<ul class="items">${log.map((l) => `<li>${icon(l.icon || 'checkCircle', 'muted')}<span class="grow small">${U.esc(l.text)}</span><span class="small muted nowrap">${rel(l.at)}</span></li>`).join('')}</ul>`
                  : '<p class="muted small">As ações feitas aqui aparecem nesta lista.</p>'
              }
            </div>
          </section>
        </div>
      </div>`;
  },

  firstSteps() {
    const st = Store.state;
    const s = Q.settings();
    const steps = [
      ['Confira os dados da escola', 'Nome, ano letivo, média e mensalidade.', s.schoolName !== 'Minha Escola', 'configuracoes', 'Abrir configurações'],
      ['Revise as disciplinas', `${st.subjects.length} disciplinas já vêm prontas. Ajuste se precisar.`, st.subjects.length > 0, 'configuracoes', 'Ver disciplinas'],
      ['Cadastre os professores', 'Nome, contato e o que cada um leciona.', st.teachers.length > 0, 'act:prof', 'Cadastrar professor'],
      ['Crie as turmas', 'Ex.: 6º ano A, turno da manhã, sala 11.', st.classes.length > 0, 'act:turma', 'Criar turma'],
      ['Matricule os alunos', 'Um passo a passo curto: aluno, responsável, turma e mensalidade.', st.students.length > 0, 'act:matricula', 'Matricular aluno'],
    ];
    const next = steps.findIndex((x) => !x[2]);
    return `
      <div class="page-head"><div><p class="eyebrow">${U.esc(s.schoolName)} · ${s.year}</p><h1>Vamos preparar a sua escola</h1>
      <p class="lead">Faça estes passos uma vez. Depois o painel passa a mostrar a chamada do dia, cobranças e notas pendentes.</p></div></div>
      <section class="card"><div class="card-body tasks">
        ${steps
          .map(
            ([t, d, done, target, cta], i) => `<div class="task ${done ? 'ok' : i === next ? 'warn' : ''}">
              <span class="task-icon">${done ? icon('check') : `<b>${i + 1}</b>`}</span>
              <div class="task-text"><strong>${t}</strong><span>${d}</span></div>
              ${done ? '<span class="pill ok">Feito</span>' : target.startsWith('act:') ? `<button class="btn sm ${i === next ? 'primary' : ''}" data-step="${target.slice(4)}">${cta}</button>` : `<a class="btn sm ${i === next ? 'primary' : ''}" href="#${target}">${cta}</a>`}
            </div>`,
          )
          .join('')}
      </div></section>
      <p class="small muted">Quer só conhecer o sistema? <button class="btn sm ghost" data-x="demo">${icon('sparkles')}Carregar escola de exemplo</button></p>`;
  },

  mount(el) {
    el.addEventListener('click', (e) => {
      const q = e.target.closest('[data-quick]');
      if (q) {
        const k = q.dataset.quick;
        if (k === 'matricular') Actions.matricular();
        else if (k === 'chamada') App.go('chamada');
        else if (k === 'notas') App.go('notas');
        else if (k === 'receber') Actions.receberRapido();
        else if (k === 'comunicado') Actions.novoComunicado();
        else if (k === 'evento') Actions.novoEvento();
        return;
      }
      const step = e.target.closest('[data-step]');
      if (step) {
        const k = step.dataset.step;
        if (k === 'prof') Actions.novoProfessor();
        else if (k === 'turma') Actions.novaTurma();
        else if (k === 'matricula') Actions.matricular();
        return;
      }
      if (e.target.closest('[data-fin-tab]')) View.financeiro = { ...(View.financeiro || {}), tab: 'inadimplentes' };
      if (e.target.closest('[data-rep]')) View.relatorios = { ...(View.relatorios || {}), type: 'risco' };
      const x = e.target.closest('[data-x]');
      if (x && x.dataset.x === 'gen') Actions.gerarMensalidades();
      if (x && x.dataset.x === 'demo')
        UI.confirm({ title: 'Carregar a escola de exemplo?', text: 'Os dados atuais serão substituídos por uma escola fictícia completa.', ok: 'Carregar exemplo' }).then((ok) => {
          if (ok) Store.replace(Seed.demo());
        });
    });

    const absBox = el.querySelector('[data-chart="abs"]');
    if (absBox) {
      const days = Q.lastSchoolDays(10, U.today(), false);
      UI.columns(absBox, {
        height: 170,
        label: 'max',
        data: days.map((d) => {
          const a = Q.dayAttendance(d);
          return {
            label: `${U.WD_SHORT[U.weekday(d)]} ${U.parse(d).getDate()}`,
            short: String(U.parse(d).getDate()),
            value: a.absent,
            tip: `${U.fmtDateLong(d)}: ${U.plural(a.absent, 'falta', 'faltas')} · ${U.pct(a.rate)} de presença`,
          };
        }),
      });
    }
    const revBox = el.querySelector('[data-chart="rev"]');
    if (revBox) {
      const cur = U.today().slice(0, 7);
      const months = [-5, -4, -3, -2, -1, 0].map((n) => U.addMonths(cur, n));
      UI.columns(revBox, {
        height: 180,
        label: 'last',
        fmt: (v) => (v >= 1000 ? `${U.num(v / 1000, v >= 1e5 || v % 1000 === 0 ? 0 : 1)} mil` : U.int(v)),
        data: months.map((m) => {
          const s = Q.monthSummary(m);
          return {
            label: U.fmtMonthShort(m),
            value: s.received,
            track: s.expected,
            tip: `${U.fmtMonth(m)}: ${U.money(s.received)} recebidos de ${U.money(s.expected)} (${U.pct(s.pct)})`,
          };
        }),
      });
    }
  },
};
