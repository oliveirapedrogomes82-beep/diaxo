'use strict';
/* Portal da família.
   - Início (#inicio): saudação, um cartão por filho com o que importa hoje (presença, agenda, o que precisa de resposta,
     próximas entregas, respostas da escola, mensalidade), contato da escola e os quadros que os módulos registram
     (App.widgets da família, na mesma grade do painel da equipe: PainelKit em painel.js).
   - Boletim (#boletim/<filho>): notas das etapas liberadas (o retrato só traz as liberadas), médias, situação,
     frequência geral e por disciplina, dias com falta, conselho de classe (quando liberado) e parecer descritivo da
     Educação Infantil; versão para imprimir.
   - Meus filhos (#filhos, #filhos/<filho>): dados do aluno como a família vê, equipe da turma, responsáveis, quem pode
     buscar, saúde e plano de apoio compartilhado com "Li e estou ciente" (plans.ack {id}).
   Tudo é leitura do retrato já filtrado pelo servidor; o único comando é plans.ack. Em "ver como" nada é alterado. */
(() => {
  const R = Core.rules;
  const today = () => U.today();
  const me = () => Store.me;
  const readOnly = () => !!Store.preview;
  const hasPage = (id) => App.pages().some((p) => p.id === id);
  const portalOn = () => Q.settings().familyMessages !== false;
  const canMessage = () => !readOnly() && portalOn() && typeof Actions.novaMensagem === 'function';

  // =====================================================================
  // Utilitários
  // =====================================================================
  const kids = () => Q.myChildren();
  const findKid = (id) => kids().find((k) => k.id === id) || null;
  const classOf = (s) => (s ? Q.klass(s.classId) : null);
  const classLine = (c) => (c ? [c.name, c.segment, c.shift].filter(Boolean).join(' · ') : 'Sem turma no momento');
  const isInfant = (c) => !!c && c.segment === 'Educação Infantil';
  const byGender = (p, masc, fem, neutral) => (typeof Q.byGender === 'function' ? Q.byGender(p, masc, fem, neutral) : neutral);
  /** "Regente" (Infantil e Fund. I) ou "Conselheira"/"Conselheiro" pelo título da pessoa; sem dado, "Responsável pela turma". */
  const homeroomTitle = (c, teacher) => (c && ['Educação Infantil', 'Fundamental I'].includes(c.segment) ? 'Regente' : byGender(teacher, 'Conselheiro', 'Conselheira', 'Responsável pela turma'));
  const subjectName = (id) => (Q.subject(id) || {}).name || '';
  const listText = (arr) => (arr.length > 1 ? `${arr.slice(0, -1).join(', ')} e ${arr[arr.length - 1]}` : arr[0] || '');
  const typeInfo = (t) => Q.DIARY_TYPES[t] || { label: 'Item', icon: 'bookOpen', tone: 'c1' };
  const plainText = (t, n = 120) => {
    const s = String(t || '').replace(/\s+/g, ' ').trim();
    return s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s;
  };
  /** Texto com quebras de linha e links (escapado antes). */
  const textHTML = (t) => raw(U.linkify(U.esc(t || '')).replace(/\n/g, '<br>'));
  /** "hoje", "amanhã", "sexta", "15/10". */
  const when = (date) => {
    if (!date) return '';
    const n = U.daysBetween(today(), date);
    if (n === 0) return 'hoje';
    if (n === 1) return 'amanhã';
    if (n === -1) return 'ontem';
    if (n > 1 && n < 7) return U.WEEKDAYS[U.weekday(date)].replace('-feira', '');
    return U.fmtDate(date).slice(0, 5);
  };
  const dayOff = (date) => {
    if (Q.isSchoolDay(date)) return null;
    const h = Q.holiday(date);
    if (h) return `Sem aula hoje: ${h}`;
    const wd = U.weekday(date);
    return wd === 0 || wd === 6 ? 'Fim de semana, sem aula' : 'Hoje não é dia letivo';
  };
  /** Liga a tela de outro módulo já no filho escolhido (os módulos guardam o filho no PageState). */
  const CHILD_STATE = {
    agenda: ['agenda-familia', { child: '', limit: 15 }],
    rotina: ['rotina-familia', { child: '', date: '' }],
    mensagens: ['mensagens.familia', { child: '' }],
  };
  const presetChild = (page, sid) => {
    const def = CHILD_STATE[page];
    if (def && sid) PageState.get(def[0], def[1]).child = sid;
  };
  const srOnly = (text) => html`<span class="sr-only">${text}</span>`;

  // ---------- agenda ----------
  const deadlinePassed = (d) => d.type === 'autorizacao' && !!d.respondBy && d.respondBy < today();
  const myAck = (d, s) => {
    const g = Q.myGuardianRecord(s);
    const entries = (Q.acks(d.id) || {})[s.id] || {};
    return { g, mine: g ? entries[g.id] || null : null };
  };
  /** Precisa de uma ação minha (ciente ou resposta da autorização)? Regra igual à da agenda. */
  const needsMe = (d, s) => {
    if (d.status !== 'publicado') return false;
    const { g, mine } = myAck(d, s);
    if (!g) return false;
    if (d.type === 'autorizacao') return !(mine && mine.answer) && !deadlinePassed(d);
    return !!d.requireAck && !mine;
  };
  const kidDiary = (s) => Store.state.diary.filter((d) => d.status === 'publicado' && (d.recipients || []).includes(s.id));

  // ---------- mensagens ----------
  const sideOf = (p) => {
    if (!p) return 'escola';
    if (p.from === 'familia' || p.from === 'escola') return p.from;
    if (me() && p.userId === me().id) return 'familia';
    const u = Q.user(p.userId);
    return u && u.role !== 'responsavel' ? 'escola' : 'familia';
  };
  const lastPost = (m) => {
    const ps = (m.posts || []).filter((p) => p.kind !== 'registro');
    return ps.length ? ps[ps.length - 1] : null;
  };
  /** Conversas que a família já abriu neste aparelho (o módulo de mensagens guarda; aqui só lemos). */
  const seenMessages = () => {
    try {
      return JSON.parse(localStorage.getItem(`caderneta.mensagens.vistas.${(me() || {}).id || ''}`) || '{}') || {};
    } catch (e) {
      return {};
    }
  };

  // ---------- frequência ----------
  /** Registros de chamada do filho no ano: [{date, period, subjectId, mark}] (o retrato só traz as marcas dele). */
  const attRecords = (sid) => {
    const out = [];
    const y = Q.year();
    const att = Store.state.attendance;
    for (const k of Object.keys(att)) {
      const rec = att[k];
      const m = rec && rec.marks && rec.marks[sid];
      if (!m) continue;
      const parts = k.split('|');
      if (parts[1].slice(0, 4) !== y) continue;
      out.push({ classId: parts[0], date: parts[1], period: Number(parts[2]) || 0, subjectId: rec.subjectId || null, mark: m });
    }
    return out;
  };
  const tally = (list) => {
    const e = { lessons: 0, P: 0, F: 0, J: 0, A: 0 };
    for (const r of list) {
      e.lessons++;
      if (e[r.mark] !== undefined) e[r.mark]++;
    }
    return e;
  };
  /** Presença de hoje: 'P' (presente em alguma aula), 'F' (falta), 'J' (falta justificada), 'A' (abonada) ou null (sem chamada). */
  const todayMark = (sid) => {
    const T = today();
    const marks = attRecords(sid).filter((r) => r.date === T).map((r) => r.mark);
    if (!marks.length) return null;
    if (marks.includes('P')) return 'P';
    if (marks.includes('F')) return 'F';
    if (marks.includes('J')) return 'J';
    return 'A';
  };
  /** Dias com falta: [{date, F, J, A, total}] (mais recentes primeiro). */
  const absenceDays = (recs) => {
    const by = new Map();
    for (const r of recs) {
      let d = by.get(r.date);
      if (!d) by.set(r.date, (d = { date: r.date, F: 0, J: 0, A: 0, P: 0, total: 0 }));
      d.total++;
      if (d[r.mark] !== undefined) d[r.mark]++;
    }
    return [...by.values()].filter((d) => d.F + d.J + d.A > 0).sort((a, b) => b.date.localeCompare(a.date));
  };

  // ---------- notas ----------
  const gTone = (v) => {
    if (v == null) return '';
    const st = Q.settings();
    return v < st.passing ? (v < st.recovery ? 'pt-g-bad' : 'pt-g-warn') : '';
  };
  /** Texto da nota coerente com a cor: uma casa, ou duas quando o arredondamento cruzaria a média (ver Q.gradeText). */
  const gNum = (v) => (typeof Q.gradeText === 'function' ? Q.gradeText(v) : U.num(v));
  const fmtG = (v) => (v == null ? '' : gNum(v));
  const releasedTerms = () => Q.terms().filter((t) => Q.termReleased(t));

  // ---------- financeiro ----------
  const dueText = (date) => {
    const w = when(date);
    const ddmm = U.fmtDate(date).slice(0, 5);
    return w === ddmm ? `vence em ${U.fmtDate(date)}` : `vence ${w} (${ddmm})`;
  };
  const paysFor = (s) => Q.chargesFees() && !!(Q.myGuardianRecord(s) || {}).financeiro;

  // =====================================================================
  // Início
  // =====================================================================
  const kidSummary = (s) => {
    const T = today();
    const items = kidDiary(s);
    const need = items.filter((d) => needsMe(d, s)).sort((a, b) => (a.respondBy || a.due || a.date).localeCompare(b.respondBy || b.due || b.date));
    const needIds = new Set(need.map((d) => d.id));
    const todays = items.filter((d) => d.date === T && !needIds.has(d.id) && !(d.type === 'ocorrencia' && d.internal));
    const todayIds = new Set(todays.map((d) => d.id));
    const due = items
      .filter((d) => d.type === 'dever' && d.due && d.due >= T && !todayIds.has(d.id) && !needIds.has(d.id))
      .sort((a, b) => a.due.localeCompare(b.due) || (a.createdAt || '').localeCompare(b.createdAt || ''));
    const seen = seenMessages();
    const msgs = Store.state.messages.filter((m) => m.studentId === s.id);
    const replies = msgs
      .map((m) => ({ m, p: lastPost(m) }))
      .filter((x) => x.p && sideOf(x.p) === 'escola' && U.daysBetween(String(x.p.at).slice(0, 10), T) <= 14)
      .sort((a, b) => String(b.p.at).localeCompare(String(a.p.at)))
      .map((x) => ({ ...x, isNew: !seen[x.m.id] || seen[x.m.id] < x.p.at }));
    const waiting = msgs.filter((m) => m.status === 'aberta' && sideOf(lastPost(m)) === 'familia').length;
    let money = null;
    if (paysFor(s)) {
      const open = Store.state.invoices.filter((i) => i.studentId === s.id && !i.paidAt);
      const late = open.filter((i) => i.due < T).sort((a, b) => a.due.localeCompare(b.due));
      const next = open.filter((i) => i.due >= T).sort((a, b) => a.due.localeCompare(b.due))[0] || null;
      money = { late, next, lateTotal: U.sum(late.map((i) => Q.amountDue(i, T))) };
    }
    const rate = Q.attendanceRate(s.id);
    const idx = Q.attendanceIndex().get(s.id);
    return { T, need, todays, due, replies, waiting, money, rate, absences: idx ? idx.absDates.size : 0, mark: todayMark(s.id) };
  };

  /** Linha clicável quando a tela de destino existe; senão, só informação. */
  const row = (page, href, attrs, inner) =>
    hasPage(page) ? html`<a class="pt-row" href="${href}" ${attrs || ''}>${inner}</a>` : html`<div class="pt-row is-static">${inner}</div>`;
  const itemRow = (d, s, extra = '') => {
    const t = typeInfo(d.type);
    const sub = d.subjectId ? subjectName(d.subjectId) : '';
    const fresh = !Q.isRead(d.id);
    return html`<li>${row(
      'agenda',
      '#agenda',
      html`data-pt-child="${s.id}" data-pt-for="agenda"`,
      html`<span class="pt-row-ic ${t.tone}" aria-hidden="true">${icon(t.icon)}</span>
        <span class="grow"><b>${d.title}</b><span class="small muted">${html.join([Q.diaryTypeLabel(d.type), sub, extra], ' · ')}</span></span>
        ${fresh ? html`<span class="pill mark plain pt-new">Novo</span>` : ''}`,
    )}</li>`;
  };
  const markPill = (mark) => {
    if (!mark) return '';
    const M = { P: ['Presente hoje', 'ok', 'checkCircle'], F: ['Falta registrada hoje', 'bad', 'alert'], J: ['Falta justificada hoje', 'warn', 'info'], A: ['Falta abonada hoje', '', 'info'] }[mark];
    return html`<span class="pt-mark ${M[1]}">${icon(M[2])}${M[0]}</span>`;
  };

  const kidCard = (s) => {
    const c = classOf(s);
    const k = kidSummary(s);
    const teacher = c && c.teacherId ? Q.user(c.teacherId) : null;
    const off = dayOff(k.T);
    const tone = Q.attTone(k.rate, s.classId);
    const first = U.firstName(s.name);
    const sec = [];
    if (k.need.length) {
      sec.push(html`<section class="pt-sec is-need" aria-label="Precisa da sua resposta">
        <h3>${icon('bell')}Precisa da sua resposta</h3>
        <ul class="pt-rows">${k.need.slice(0, 3).map((d) => itemRow(d, s, d.type === 'autorizacao' ? `responder até ${when(d.respondBy || d.date)}` : 'confirme a leitura'))}</ul>
        ${k.need.length > 3 ? html`<a class="small pt-more" href="#agenda" data-pt-child="${s.id}" data-pt-for="agenda">e mais ${k.need.length - 3}</a>` : ''}
      </section>`);
    }
    sec.push(html`<section class="pt-sec" aria-label="Hoje na agenda">
      <h3>${icon('bookOpen')}Hoje na agenda</h3>
      ${k.todays.length
        ? html`<ul class="pt-rows">${k.todays.slice(0, 3).map((d) => itemRow(d, s, d.type === 'dever' && d.due ? `entrega ${when(d.due)}` : ''))}</ul>${k.todays.length > 3 ? html`<a class="small pt-more" href="#agenda" data-pt-child="${s.id}" data-pt-for="agenda">e mais ${k.todays.length - 3}</a>` : ''}`
        : html`<p class="small muted pt-none">${off ? `${off}.` : 'Nada publicado hoje até agora.'}</p>`}
    </section>`);
    if (k.due.length) {
      sec.push(html`<section class="pt-sec" aria-label="Próximas entregas">
        <h3>${icon('clock')}Próximas entregas</h3>
        <ul class="pt-rows">${k.due.slice(0, 3).map((d) => itemRow(d, s, `entrega ${when(d.due)}`))}</ul>
      </section>`);
    }
    if (k.replies.length || k.waiting) {
      sec.push(html`<section class="pt-sec" aria-label="Mensagens">
        <h3>${icon('message')}Mensagens</h3>
        ${k.replies.length
          ? html`<ul class="pt-rows">${k.replies.slice(0, 2).map(
              (x) => html`<li>${row(
                'mensagens',
                `#mensagens/${x.m.id}`,
                '',
                html`<span class="pt-row-ic c3" aria-hidden="true">${icon('message')}</span>
                  <span class="grow"><b>${x.m.subject || 'Conversa com a escola'}</b><span class="small muted">${U.firstName(Q.userName(x.p.userId, 'Escola'))} respondeu ${U.ago(x.p.at)}: “${plainText(x.p.body, 70)}”</span></span>
                  ${x.isNew ? html`<span class="pill mark plain pt-new">Nova</span>` : ''}`,
              )}</li>`,
            )}</ul>`
          : ''}
        ${k.waiting ? html`<p class="small muted pt-none">${U.plural(k.waiting, 'mensagem sua aguarda', 'mensagens suas aguardam')} a resposta da escola.</p>` : ''}
      </section>`);
    }
    if (k.money) {
      const { late, next, lateTotal } = k.money;
      sec.push(html`<section class="pt-sec" aria-label="Mensalidade">
        <h3>${icon('wallet')}Mensalidade</h3>
        ${late.length
          ? html`<div class="pt-money is-late">${row('financeiro', '#financeiro', '', html`<span class="pt-row-ic" aria-hidden="true">${icon('alert')}</span><span class="grow"><b>${late.length === 1 ? `${U.cap(U.monthName(late[0].month))} em atraso` : `${late.length} mensalidades em atraso`}</b><span class="small">${U.money(lateTotal)} com multa e juros · venceu em ${U.fmtDate(late[0].due)}</span></span>`)}</div>`
          : next
            ? html`<div class="pt-money">${row('financeiro', '#financeiro', '', html`<span class="pt-row-ic" aria-hidden="true">${icon('clock')}</span><span class="grow"><b>${U.cap(U.monthName(next.month))}: ${U.money(next.amount)}</b><span class="small muted">${dueText(next.due)}</span></span>`)}</div>`
            : html`<p class="small pt-none pt-ok">${icon('checkCircle')}Mensalidades em dia.</p>`}
      </section>`);
    }
    const btns = [];
    if (hasPage('agenda')) btns.push(html`<a class="btn sm" href="#agenda" data-pt-child="${s.id}" data-pt-for="agenda">${icon('bookOpen')}Agenda</a>`);
    if (isInfant(c) && hasPage('rotina')) btns.push(html`<a class="btn sm" href="#rotina" data-pt-child="${s.id}" data-pt-for="rotina">${icon('sun')}Rotina</a>`);
    btns.push(html`<a class="btn sm" href="#boletim/${s.id}">${icon('grade')}${c && Q.evaluation(c.id) === 'parecer' ? 'Parecer' : 'Boletim'}</a>`);
    if (canMessage()) btns.push(html`<button type="button" class="btn sm" data-pt-msg="falta" data-pt-sid="${s.id}">${icon('calendar')}Avisar falta</button>`);
    return html`<article class="card pt-kid" aria-labelledby="pt-kid-${s.id}">
      <header class="pt-kid-head">
        <a class="pt-kid-av" href="#filhos/${s.id}" tabindex="-1" aria-hidden="true">${UI.avatar(s.name, 'lg', s.photo)}</a>
        <div class="grow">
          <h2 id="pt-kid-${s.id}"><a href="#filhos/${s.id}">${first}</a></h2>
          <p class="small muted">${classLine(c)}</p>
          ${teacher ? html`<p class="small pt-kid-teacher">${homeroomTitle(c, teacher)}: <b>${U.shortName(teacher.name)}</b></p>` : ''}
        </div>
        <a class="icon-btn pt-kid-go" href="#filhos/${s.id}" aria-label="Dados de ${first}">${icon('chevronRight')}</a>
      </header>
      ${markPill(k.mark)}
      <dl class="pt-kid-stats">
        <div><dt>Frequência no ano</dt><dd><b class="num pt-t-${tone}">${U.pct(k.rate)}</b>${k.rate != null ? UI.meter(k.rate, tone) : ''}<span class="small muted">${k.absences ? U.plural(k.absences, 'dia com falta', 'dias com falta') : k.rate != null ? 'Nenhuma falta' : 'Sem chamada ainda'}</span></dd></div>
        <div><dt>Hoje na agenda</dt><dd><b class="num">${U.int(k.todays.length + k.need.filter((d) => d.date === k.T).length)}</b><span class="small muted">${k.due.length ? `${U.plural(k.due.length, 'entrega', 'entregas')} a seguir` : 'itens publicados'}</span></dd></div>
        <div class="${k.need.length ? 'is-need' : ''}"><dt>Para responder</dt><dd><b class="num">${U.int(k.need.length)}</b><span class="small muted">${k.need.length ? 'ciente ou autorização' : 'tudo respondido'}</span></dd></div>
      </dl>
      <div class="pt-kid-body">${sec}</div>
      <footer class="pt-kid-foot">${btns}</footer>
    </article>`;
  };

  const contactCard = () => {
    const st = Q.settings();
    const tel = U.digits(st.phone || '');
    const rows = [];
    if (st.phone) rows.push(html`<li>${icon('phone')}<div class="grow"><span class="small muted">Telefone</span><a href="tel:${tel}" class="pt-strong">${st.phone}</a></div></li>`);
    if (st.officeHours) rows.push(html`<li>${icon('clock')}<div class="grow"><span class="small muted">Atendimento</span><span>${st.officeHours}</span></div></li>`);
    if (st.address) rows.push(html`<li>${icon('building')}<div class="grow"><span class="small muted">Endereço</span><a href="https://www.google.com/maps/search/?api=1&amp;query=${encodeURIComponent(st.address)}" target="_blank" rel="noopener noreferrer">${st.address}</a></div></li>`);
    return html`<section class="card pt-contact" aria-labelledby="pt-contact-h">
      <div class="pt-contact-main">
        <div class="pt-contact-title"><span class="pt-contact-mark" aria-hidden="true">${icon('school')}</span><div><h2 id="pt-contact-h">Fale com a escola</h2><p class="small muted">${st.schoolName || 'Escola'}</p></div></div>
        ${rows.length ? html`<ul class="pt-contact-list">${rows}</ul>` : html`<p class="small muted">A escola ainda não informou telefone e endereço.</p>`}
      </div>
      ${canMessage() ? html`<div class="pt-contact-btns"><button type="button" class="btn primary" data-pt-msg="">${icon('message')}Mensagem para a escola</button>${tel ? html`<a class="btn" href="tel:${tel}">${icon('phone')}Ligar</a>` : ''}</div>` : tel ? html`<div class="pt-contact-btns"><a class="btn" href="tel:${tel}">${icon('phone')}Ligar para a escola</a></div>` : ''}
    </section>`;
  };

  const homeSummary = (list) => {
    const need = list.map((s) => ({ s, n: kidDiary(s).filter((d) => needsMe(d, s)).length })).filter((x) => x.n);
    const total = U.sum(need.map((x) => x.n));
    const lateKids = list.filter((s) => paysFor(s) && Store.state.invoices.some((i) => i.studentId === s.id && !i.paidAt && i.due < today()));
    const parts = [];
    if (total) parts.push(need.length === 1 && list.length > 1 ? `${U.firstName(need[0].s.name)} tem ${U.plural(total, 'item', 'itens')} esperando a sua resposta na agenda` : `${U.plural(total, 'item espera', 'itens esperam')} a sua resposta na agenda`);
    if (lateKids.length) parts.push(lateKids.length === 1 ? 'há uma mensalidade em atraso' : 'há mensalidades em atraso');
    if (!parts.length) return list.length > 1 ? 'Tudo em dia com os seus filhos por aqui.' : `Tudo em dia com ${U.firstName(list[0].name)} por aqui.`;
    return U.cap(parts.join(' e ')) + '.';
  };

  const familyActions = () => (readOnly() ? [] : App.actions());

  const renderHome = () => {
    const m = me();
    const list = kids();
    const T = today();
    const s = Q.settings();
    const acts = familyActions();
    const PK = window.PainelKit;
    const head = html`<div class="page-head pt-head">
      <div>
        <p class="eyebrow">${U.cap(U.fmtDateLong(T))}${s.schoolName ? ` · ${s.schoolName}` : ''}</p>
        <h1>${U.greeting()}, ${U.firstName(m.name)}!</h1>
        <p class="lead">${list.length ? homeSummary(list) : 'Bem-vindo(a) ao Portal da família.'}</p>
      </div>
      ${acts.length || (m.staffAndFamily && !readOnly())
        ? html`<div class="pt-head-side">
            ${acts.length ? html`<div class="btn-row pt-head-acts">${acts.slice(0, 3).map((a, i) => html`<button type="button" class="btn ${i === 0 ? 'primary' : ''}" data-pt-act="${a.id}">${icon(a.icon || 'plus')}${a.label}</button>`)}</div>` : ''}
            ${m.staffAndFamily && !readOnly() ? html`<button type="button" class="btn ghost sm pt-staff" data-pt-mode="equipe">${icon('briefcase')}Voltar para a área da equipe</button>` : ''}
          </div>`
        : ''}
    </div>`;
    if (!list.length) {
      return html`${head}
        <section class="card">${UI.empty({ icon: 'users', title: 'Nenhum aluno ligado à sua conta', text: 'Quando a escola vincular o seu acesso aos seus filhos, a agenda, o boletim e os recados aparecem aqui. Fale com a secretaria.' })}</section>
        ${contactCard()}`;
    }
    return html`${head}
      <div class="pt-kids n${Math.min(list.length, 3)}">${list.map(kidCard)}</div>
      ${contactCard()}
      ${PK ? PK.widgetGrid(App.widgets(), { cls: 'pt-widgets', merge: true }) : ''}`;
  };

  const switchToStaff = async (btn) => {
    btn.disabled = true;
    btn.classList.add('loading');
    try {
      await Store.setMode('equipe');
      history.replaceState(null, '', '#painel');
      App.render();
      UI.toast('Você está na área da equipe', { ic: 'briefcase' });
    } catch (err) {
      UI.errorToast(err);
      if (document.contains(btn)) {
        btn.disabled = false;
        btn.classList.remove('loading');
      }
    }
  };

  /** Cliques comuns às telas do portal (atalhos para outros módulos já no filho certo, mensagens). */
  const bindCommon = (el) => {
    el.addEventListener('click', (e) => {
      if (e.target.closest('[data-pn-w]')) return; // quadros dos módulos cuidam dos próprios cliques
      const go = e.target.closest('[data-pt-for]');
      if (go) {
        presetChild(go.dataset.ptFor, go.dataset.ptChild);
        return; // o link segue
      }
      const msg = e.target.closest('[data-pt-msg]');
      if (msg) {
        if (!canMessage()) return UI.toast('As mensagens pelo portal estão desligadas. Ligue para a escola.', { tone: 'bad' });
        Actions.novaMensagem({ studentId: msg.dataset.ptSid || null, kind: msg.dataset.ptMsg || undefined });
        return;
      }
      const act = e.target.closest('[data-pt-act]');
      if (act) {
        const a = App.actions().find((x) => x.id === act.dataset.ptAct);
        if (a) a.run();
        return;
      }
      const mode = e.target.closest('[data-pt-mode]');
      if (mode) switchToStaff(mode);
    });
  };

  const mountHome = (el) => {
    if (window.PainelKit) window.PainelKit.mountWidgets(el);
    bindCommon(el);
  };

  // =====================================================================
  // Boletim
  // =====================================================================
  const BS = () => PageState.get('portal-boletim', { child: '' });
  const pickKid = (rest, state) => {
    const list = kids();
    const want = (rest && rest[0]) || state.child;
    const s = list.find((k) => k.id === want) || list[0] || null;
    if (s) state.child = s.id;
    return { list, s, missing: !!(rest && rest[0]) && !list.some((k) => k.id === rest[0]) };
  };
  const kidSwitch = (list, s, base) =>
    list.length > 1
      ? html`<nav class="seg pt-switch no-print" aria-label="Escolha o filho">${list.map((k) => html`<a href="#${base}/${k.id}" ${k.id === s.id ? raw('aria-current="page"') : ''}>${UI.avatar(k.name, 'sm', k.photo)}${U.firstName(k.name)}</a>`)}</nav>`
      : '';

  /** Resultado do conselho, concordando com o aluno (sexo informado na ficha). */
  const COUNCIL = {
    aprovado: { label: (s) => byGender(s, 'Aprovado', 'Aprovada', 'Aprovado(a)'), tone: 'ok' },
    recuperacao: { label: () => 'Em recuperação', tone: 'warn' },
    retido: { label: (s) => byGender(s, 'Retido', 'Retida', 'Retido(a)'), tone: 'bad' },
    transferido: { label: (s) => byGender(s, 'Transferido', 'Transferida', 'Transferido(a)'), tone: '' },
  };
  /** Situação na disciplina (Core.rules) com a concordância do aluno. */
  const sitLabel = (sit, s) => (sit.label === 'Aprovado(a)' ? byGender(s, 'Aprovado', 'Aprovada', sit.label) : sit.label === 'Reprovado(a)' ? byGender(s, 'Reprovado', 'Reprovada', sit.label) : sit.label);

  const termStatusNotice = (terms) => {
    const st = Q.settings();
    const locked = terms.filter((t) => !Q.termReleased(t));
    if (!locked.length) return '';
    const cur = Q.currentTerm();
    const waiting = locked.filter((t) => t < cur).map((t) => Q.termLabel(t));
    const future = locked.filter((t) => t >= cur);
    const parts = [];
    if (waiting.length) parts.push(waiting.length > 1 ? `As notas de ${listText(waiting)} ainda estão sendo conferidas e serão liberadas pela escola.` : `As notas do ${waiting[0]} ainda estão sendo conferidas e serão liberadas pela escola.`);
    if (future.includes(cur)) parts.push(`O ${Q.termLabel(cur)} está em andamento: as notas dele aparecem aqui quando a escola fechar a etapa e liberar o boletim.`);
    else if (future.length) parts.push(`As próximas etapas aparecem aqui quando forem liberadas.`);
    return html`<div class="notice pt-notice no-print">${icon('lock')}<span class="grow">${parts.join(' ')}</span></div>`;
  };

  const printHead = (s, c) => {
    const st = Q.settings();
    return html`<div class="print-only pt-print-head">
      <div class="boletim-head"><div><h2>${st.schoolName || 'Escola'}</h2><div class="small">${[st.address, st.phone].filter(Boolean).join(' · ')}</div></div>
        <div class="pt-print-r"><b>Boletim escolar ${Q.year()}</b><div class="small">Emitido em ${U.fmtDate(today())} pelo Portal da família</div></div></div>
      <dl class="summary pt-print-id"><dt>Aluno(a)</dt><dd>${s.name}</dd><dt>Matrícula</dt><dd>${s.enrollment || '—'}</dd><dt>Turma</dt><dd>${classLine(c)}</dd></dl>
    </div>`;
  };

  const attendanceBlock = (s, c, recs) => {
    const mode = Q.attendanceMode(c.id);
    const min = Q.minAttendance(c.id);
    const days = absenceDays(recs);
    let bySubject = '';
    if (mode === 'por_aula') {
      const by = new Map();
      for (const r of recs) {
        if (!r.subjectId) continue;
        if (!by.has(r.subjectId)) by.set(r.subjectId, []);
        by.get(r.subjectId).push(r);
      }
      const rows = Q.classSubjects(c.id)
        .filter((x) => by.has(x.id))
        .map((x) => {
          const e = tally(by.get(x.id));
          return { x, e, rate: R.rateOf(e) };
        });
      bySubject = rows.length
        ? html`<div class="pt-subatt"><h3>Por disciplina</h3><ul class="pt-hbars">${rows.map(
            ({ x, e, rate }) => html`<li><span class="pt-hb-l"><span class="swatch c${x.color || 1}" aria-hidden="true"></span>${x.name}</span>
              <span class="pt-hb-t" aria-hidden="true"><span class="pt-hb-f ${Q.attTone(rate, c.id)}" style="width:${U.clamp(rate || 0, 0, 100)}%"></span><span class="pt-hb-min" style="left:${min}%"></span></span>
              <span class="pt-hb-v num pt-t-${Q.attTone(rate, c.id)}">${U.pct(rate)}</span>
              <span class="pt-hb-n small muted">${e.F + e.J ? U.plural(e.F + e.J, 'falta', 'faltas') : 'sem faltas'}</span></li>`,
          )}</ul><p class="small muted">A linha marca o mínimo de ${min}% de presença.</p></div>`
        : html`<p class="small muted">Ainda não há aulas registradas por disciplina.</p>`;
    } else {
      bySubject = html`<p class="small muted pt-daily">${icon('info')}Na turma de ${U.firstName(s.name)} a chamada é feita uma vez por dia; a frequência vale para todas as disciplinas.</p>`;
    }
    const label = (d) => {
      const per = mode === 'por_aula' && d.total > 1;
      const miss = d.F + d.J + d.A;
      if (per && miss < d.total) return { pill: `${miss} de ${d.total} aulas`, tone: d.F ? 'bad' : 'warn', detail: d.F ? 'faltou a parte das aulas' : 'faltas justificadas' };
      const detail = per ? `${d.total} aulas` : '';
      if (d.F) return { pill: 'Falta', tone: 'bad', detail: d.J ? `${detail}${detail ? ' · ' : ''}parte justificada` : detail };
      if (d.J) return { pill: 'Justificada', tone: 'warn', detail };
      return { pill: 'Abonada', tone: '', detail };
    };
    return html`<section class="card pt-att" aria-labelledby="pt-att-h">
      <div class="card-head"><h2 id="pt-att-h">${icon('checkSquare')}Frequência</h2><span class="sub">mínimo de ${min}% de presença</span></div>
      <div class="card-body">
        ${bySubject}
        <div class="pt-absdays">
          <h3>Dias com falta</h3>
          ${days.length
            ? html`<ul class="pt-days">${days.slice(0, 12).map((d) => {
                const l = label(d);
                return html`<li><span class="date-chip"><b>${Number(d.date.slice(8))}</b><span>${U.MONTHS_SHORT[Number(d.date.slice(5, 7)) - 1]}</span></span><span class="grow"><span>${U.cap(U.WEEKDAYS[U.weekday(d.date)])}</span>${l.detail ? html`<span class="small muted">${l.detail}</span>` : ''}</span>${UI.pill(l.pill, l.tone)}</li>`;
              })}</ul>${days.length > 12 ? html`<p class="small muted">e mais ${days.length - 12} dias no ano.</p>` : ''}`
            : html`<p class="small muted">${recs.length ? `${U.firstName(s.name)} não faltou nenhum dia neste ano.` : 'Ainda não há chamada registrada neste ano.'}</p>`}
          ${canMessage() && days.some((d) => d.F) ? html`<p class="small muted pt-justify">Faltou com atestado? <button type="button" class="link" data-pt-msg="atestado" data-pt-sid="${s.id}">Envie o atestado</button> para a escola justificar.</p>` : ''}
        </div>
      </div>
    </section>`;
  };

  const renderBoletim = (rest) => {
    const st = BS();
    const { list, s, missing } = pickKid(rest, st);
    const headTitle = html`<div class="page-head pt-bhead no-print"><div><h1>Boletim</h1><p class="lead">Notas e frequência do ano letivo de ${Q.year()}.</p></div>${s ? html`<div class="btn-row"><button type="button" class="btn" data-pt-print>${icon('printer')}Imprimir</button></div>` : ''}</div>`;
    if (!s) return html`${headTitle}<section class="card">${UI.empty({ icon: 'grade', title: 'Nenhum aluno ligado à sua conta', text: 'O boletim aparece quando a escola vincular o seu acesso aos seus filhos.' })}</section>`;
    const c = classOf(s);
    const switcher = kidSwitch(list, s, 'boletim');
    const lost = missing ? html`<div class="notice warn no-print">${icon('info')}<span class="grow">Esse endereço é de um aluno que não está ligado à sua conta. Mostrando o boletim de ${U.firstName(s.name)}.</span></div>` : '';
    if (!c) return html`${headTitle}${switcher}${lost}<section class="card">${UI.empty({ icon: 'grade', title: `${U.firstName(s.name)} está sem turma no momento`, text: 'O boletim aparece quando o aluno estiver numa turma do ano letivo. Fale com a secretaria.' })}</section>`;
    const terms = Q.terms();
    const parecer = Q.evaluation(c.id) === 'parecer';
    const recs = attRecords(s.id);
    const all = tally(recs);
    const rate = R.rateOf(all);
    const tone = Q.attTone(rate, c.id);
    const absDays = absenceDays(recs);
    const co = Q.council(s.id);
    const rel = releasedTerms();
    const sett = Q.settings();
    const sigs = html`<div class="print-only"><div class="signatures"><div>Direção / Secretaria</div><div>Responsável</div></div></div>`;
    const coBlock = co && COUNCIL[co.result]
      ? html`<section class="card card-pad pt-council"><div class="pt-council-h">${icon('users')}<div class="grow"><span class="small muted">Conselho de classe de ${Q.year()}</span><b>${COUNCIL[co.result].label(s)}</b></div>${UI.pill(COUNCIL[co.result].label(s), COUNCIL[co.result].tone)}</div>${co.note ? html`<p class="pt-council-note">${co.note}</p>` : ''}</section>`
      : '';
    const kpis = [];
    kpis.push(html`<div class="card kpi"><span class="kpi-label">${icon('checkSquare')}Frequência no ano</span><span class="kpi-value num pt-t-${tone}">${U.pct(rate)}</span>${rate != null ? UI.meter(rate, tone) : ''}<span class="kpi-foot">mínimo ${Q.minAttendance(c.id)}%</span></div>`);
    kpis.push(html`<div class="card kpi"><span class="kpi-label">${icon('calendar')}Dias com falta</span><span class="kpi-value num">${U.int(absDays.length)}</span><span class="kpi-foot">${absDays.filter((d) => d.J && !d.F).length ? `${absDays.filter((d) => d.J && !d.F).length} com justificativa` : 'no ano letivo'}</span></div>`);
    if (!parecer) {
      const avgs = Q.classSubjects(c.id).map((x) => Q.subjectAverage(s.id, x.id)).filter((v) => v != null);
      const avg = U.avg(avgs);
      kpis.push(html`<div class="card kpi"><span class="kpi-label">${icon('grade')}Média geral${rel.length < terms.length ? ' (parcial)' : ''}</span><span class="kpi-value num ${gTone(avg)}">${avg != null ? gNum(avg) : '—'}</span><span class="kpi-foot">aprovação com ${U.num(sett.passing)}</span></div>`);
    }
    kpis.push(html`<div class="card kpi"><span class="kpi-label">${icon('layers')}Etapas liberadas</span><span class="kpi-value num">${rel.length}<small>/${terms.length}</small></span><span class="kpi-foot">${rel.length === terms.length ? 'boletim completo' : `${Q.termLabel(Q.currentTerm())} em andamento`}</span></div>`);

    if (parecer) {
      return html`<div class="pt-boletim">${headTitle}${switcher}${lost}${printHead(s, c)}
        <div class="pt-kidline no-print">${UI.avatar(s.name, '', s.photo)}<div><b>${s.name}</b><span class="small muted">${classLine(c)}</span></div></div>
        <div class="pt-kpis n${kpis.length}">${kpis}</div>
        ${termStatusNotice(terms)}
        <section class="pt-par" aria-label="Pareceres descritivos">
          <h2 class="pt-h2">${icon('bookOpen')}Parecer descritivo</h2>
          ${terms.map((t) => {
            const ok = Q.termReleased(t);
            const txt = ok ? Q.grade(s.id, '_parecer', t) : null;
            return html`<article class="card card-pad pt-par-t ${ok ? '' : 'is-locked'}"><div class="pt-par-h"><h3>${U.cap(Q.termLabel(t))}</h3>${ok ? '' : UI.pill('Ainda não liberado', '')}</div>
              ${ok ? (txt ? html`<p class="pt-pre">${txt}</p>` : html`<p class="small muted">A escola não escreveu parecer nesta etapa.</p>`) : html`<p class="small muted">${t === Q.currentTerm() ? 'Etapa em andamento. ' : ''}O parecer aparece aqui quando a escola liberar.</p>`}</article>`;
          })}
        </section>
        ${coBlock}
        ${attendanceBlock(s, c, recs)}
        ${sigs}</div>`;
    }

    const subs = Q.classSubjects(c.id);
    const anyRf = subs.some((x) => Q.grade(s.id, x.id, 'rf') != null);
    const rows = subs.map((x) => {
      const cells = terms.map((t) => {
        if (!Q.termReleased(t)) return { t, locked: true };
        const g = Q.grade(s.id, x.id, t);
        const rec = Q.grade(s.id, x.id, 'rec' + t);
        return { t, g, rec, tg: Q.termGrade(s.id, x.id, t) };
      });
      const avg = Q.subjectAverage(s.id, x.id);
      const rf = Q.grade(s.id, x.id, 'rf');
      const fin = Q.subjectFinal(s.id, x.id);
      const complete = cells.every((cl) => !cl.locked && cl.tg != null);
      return { x, cells, avg, rf, fin, sit: Q.situation(fin, complete) };
    });
    const termWord = sett.termLabel || 'bimestre';
    /** Frases da recuperação de uma disciplina, por extenso (no celular não há tooltip). */
    const recLines = (cells) => {
      const list = cells.filter((cl) => !cl.locked && cl.rec != null);
      if (!list.length) return '';
      return html`<ul class="pt-bl-recs small muted">${list.map((cl) => {
        const t = U.cap(Q.termLabel(cl.t));
        if (cl.g == null) return html`<li>${t}: nota da recuperação <b>${fmtG(cl.rec)}</b>.</li>`;
        if (cl.rec > cl.g) return html`<li>${t}: de ${fmtG(cl.g)} para <b>${fmtG(cl.tg)}</b> com a recuperação.</li>`;
        return html`<li>${t}: fez recuperação (${fmtG(cl.rec)}), mas vale a nota do ${termWord}, <b>${fmtG(cl.tg)}</b>.</li>`;
      })}</ul>`;
    };
    const termTh = (t) => html`<th class="center">${Q.termLabel(t, { short: true })}${Q.termReleased(t) ? '' : html`<span class="pt-lock" title="Ainda não liberado">${icon('lock')}${srOnly('ainda não liberado')}</span>`}</th>`;
    const cellTd = (cl) =>
      cl.locked
        ? html`<td class="center pt-locked"><span class="muted" title="Ainda não liberado">—</span></td>`
        : html`<td class="center num ${gTone(cl.tg)}">${cl.tg != null ? gNum(cl.tg) : html`<span class="muted">—</span>`}${cl.rec != null ? html`<span class="pt-rec">no ${termWord} ${fmtG(cl.g) || '—'}</span><span class="pt-rec">recuperação ${fmtG(cl.rec)}</span>` : ''}</td>`;
    const table = html`<section class="card pt-bol-card"><div class="table-wrap"><table class="table pt-bol">
      <caption class="sr-only">Notas de ${s.name} por disciplina e etapa</caption>
      <thead><tr><th>Disciplina</th>${terms.map(termTh)}<th class="center">Média${rel.length < terms.length ? html`<span class="pt-th-sub">parcial</span>` : ''}</th>${anyRf ? html`<th class="center">Recuperação final</th>` : ''}<th>Situação</th></tr></thead>
      <tbody>${rows.map(
        (r) => html`<tr><td><span class="subject-tag"><span class="swatch c${r.x.color || 1}"></span>${r.x.name}</span></td>${r.cells.map(cellTd)}
          <td class="center num"><b class="${gTone(r.avg)}">${r.avg != null ? gNum(r.avg) : html`<span class="muted">—</span>`}</b></td>
          ${anyRf ? html`<td class="center num ${gTone(r.rf)}">${r.rf != null ? gNum(r.rf) : html`<span class="muted">—</span>`}</td>` : ''}
          <td>${r.sit.tone ? UI.pill(sitLabel(r.sit, s), r.sit.tone) : html`<span class="small muted">${r.sit.label}</span>`}</td></tr>`,
      )}</tbody></table></div></section>`;
    const cards = html`<ul class="pt-bl no-print" aria-label="Notas por disciplina">${rows.map(
      (r) => html`<li class="card">
        <div class="pt-bl-h"><span class="swatch c${r.x.color || 1}" aria-hidden="true"></span><b class="grow">${r.x.name}</b><span class="pt-bl-avg"><span class="small muted">média</span> <b class="num ${gTone(r.avg)}">${r.avg != null ? gNum(r.avg) : '—'}</b></span></div>
        <div class="pt-bl-terms">${r.cells.map(
          (cl) => html`<span class="pt-bl-t ${cl.locked ? 'is-locked' : ''}"><span class="pt-bl-tl">${Q.termLabel(cl.t, { short: true })}</span>${cl.locked ? html`${icon('lock')}<span class="sr-only">ainda não liberado</span>` : html`<b class="num ${gTone(cl.tg)}">${cl.tg != null ? gNum(cl.tg) : '—'}</b>${cl.rec != null && cl.rec > (cl.g ?? -1) ? html`<span class="pt-rec">recuperação</span>` : ''}`}</span>`,
        )}</div>
        ${recLines(r.cells)}
        <div class="pt-bl-f">${r.sit.tone ? UI.pill(sitLabel(r.sit, s), r.sit.tone) : html`<span class="small muted">${r.sit.label}</span>`}${r.rf != null ? html`<span class="small muted">Recuperação final: <b class="${gTone(r.rf)}">${gNum(r.rf)}</b></span>` : ''}</div>
      </li>`,
    )}</ul>`;
    return html`<div class="pt-boletim">${headTitle}${switcher}${lost}${printHead(s, c)}
      <div class="pt-kidline no-print">${UI.avatar(s.name, '', s.photo)}<div><b>${s.name}</b><span class="small muted">${classLine(c)}</span></div></div>
      <div class="pt-kpis n${kpis.length}">${kpis}</div>
      ${termStatusNotice(terms)}
      ${subs.length
        ? html`<div class="pt-grades"><h2 class="pt-h2">${icon('grade')}Notas por disciplina</h2>${table}${cards}
            <p class="small muted pt-legend">Notas de 0 a 10. Aprovação com média ${U.num(sett.passing)}${sett.recovery != null ? `; abaixo de ${U.num(sett.recovery)} a situação é crítica` : ''}. Quando há recuperação, vale a maior nota entre a do ${termWord} e a da recuperação.${rel.length < terms.length ? ' A média considera só as etapas já liberadas.' : ''}</p></div>`
        : html`<section class="card">${UI.empty({ icon: 'book', title: 'Turma sem disciplinas cadastradas', text: 'As notas aparecem quando a escola cadastrar as disciplinas da turma.' })}</section>`}
      ${coBlock}
      ${attendanceBlock(s, c, recs)}
      ${sigs}
    </div>`;
  };

  const doPrint = () => {
    document.body.classList.add('pt-printing');
    const done = () => {
      document.body.classList.remove('pt-printing');
      window.removeEventListener('afterprint', done);
    };
    window.addEventListener('afterprint', done);
    setTimeout(() => {
      window.print();
      setTimeout(done, 1000);
    }, 30);
  };
  const mountBoletim = (el) => {
    bindCommon(el);
    el.addEventListener('click', (e) => {
      if (e.target.closest('[data-pt-print]')) doPrint();
    });
  };

  // =====================================================================
  // Meus filhos
  // =====================================================================
  const plansOf = (s) => Store.state.plans.filter((p) => p.studentId === s.id).sort((a, b) => (a.status === 'ativo' ? 0 : 1) - (b.status === 'ativo' ? 0 : 1) || String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
  const plansToAck = () => {
    const ids = new Set(kids().map((k) => k.id));
    return Store.state.plans.filter((p) => ids.has(p.studentId) && p.status === 'ativo' && !p.familyAckAt);
  };

  const staffOf = (c) => {
    if (!c) return [];
    const out = new Map();
    const add = (uid, role, subject) => {
      const u = uid && Q.user(uid);
      if (!u || u.role === 'responsavel') return;
      let e = out.get(uid);
      if (!e) out.set(uid, (e = { u, roles: [], subjects: [] }));
      if (role && !e.roles.includes(role)) e.roles.push(role);
      if (subject && !e.subjects.includes(subject)) e.subjects.push(subject);
    };
    if (c.teacherId) add(c.teacherId, homeroomTitle(c, Q.user(c.teacherId)));
    (c.assistantIds || []).forEach((id) => add(id, 'Auxiliar de classe'));
    for (const x of Q.classSubjects(c.id)) {
      const uid = (c.subjects || {})[x.id];
      if (uid) add(uid, null, x.name);
    }
    const rank = (e) => (e.u.id === c.teacherId ? 0 : (c.assistantIds || []).includes(e.u.id) ? 1 : 2);
    return [...out.values()].sort((a, b) => rank(a) - rank(b) || Q.cmpName(a.u, b.u));
  };

  const renderKidList = (list) =>
    html`<div class="page-head"><div><h1>Meus filhos</h1><p class="lead">Dados de cada um como estão na escola, a equipe da turma e quem pode buscar.</p></div></div>
      <div class="pt-kidcards">${list.map((s) => {
        const c = classOf(s);
        const age = U.age(s.birth);
        const plans = plansOf(s).filter((p) => p.status === 'ativo' && !p.familyAckAt).length;
        const teacher = c && c.teacherId ? Q.user(c.teacherId) : null;
        const pickers = (s.guardians || []).filter((x) => x.podeBuscar && !x.bloqueado).length + (s.pickup || []).length;
        return html`<a class="card tile pt-kidtile" href="#filhos/${s.id}">
          <div class="tile-top">${UI.avatar(s.name, 'lg', s.photo)}<div class="grow"><h3>${s.name}</h3><p class="small muted">${classLine(c)}</p><p class="small muted">${age != null ? `${age} anos` : ''}${s.enrollment ? ` · matrícula ${s.enrollment}` : ''}</p></div>${icon('chevronRight', 'muted')}</div>
          <ul class="pt-tile-facts">
            ${teacher ? html`<li>${icon('teacher')}<span>${homeroomTitle(c, teacher)}: <b>${U.shortName(teacher.name)}</b></span></li>` : ''}
            <li>${icon('door')}<span>${pickers ? `${U.plural(pickers, 'pessoa pode', 'pessoas podem')} buscar` : 'Ninguém cadastrado para buscar'}</span></li>
            ${s.alerts ? html`<li class="is-bad">${icon('heart')}<span>${s.alerts}</span></li>` : ''}
          </ul>
          ${plans ? html`<div class="pt-tile-tags"><span class="pill mark plain">${icon('clipboard')}Plano de apoio para ler</span></div>` : ''}
        </a>`;
      })}</div>`;

  const changeHelp = (s) => {
    const st = Q.settings();
    return html`<section class="card pt-change" aria-labelledby="pt-change-h">
      <div class="card-head"><h2 id="pt-change-h">${icon('pencil')}Algum dado mudou?</h2></div>
      <div class="card-body">
        <p class="small">Os dados são mantidos pela secretaria. Para mudar endereço, telefone, quem pode buscar ou informações de saúde, avise a escola${canMessage() ? ' por mensagem' : ''}.${st.phone ? html` Telefone: <a href="tel:${U.digits(st.phone)}">${st.phone}</a>.` : ''}</p>
        ${canMessage() ? html`<div class="btn-row"><button type="button" class="btn" data-pt-msg="recado" data-pt-sid="${s.id}">${icon('message')}Pedir atualização dos dados</button></div>` : ''}
        <p class="small muted">Seu celular de acesso você mesmo atualiza em <button type="button" class="link" data-pt-account>Meus dados</button>.</p>
      </div>
    </section>`;
  };

  const planCard = (p, s) => {
    const author = Q.user(p.authorId);
    const ended = p.status !== 'ativo';
    return html`<article class="pt-plan ${ended ? 'is-ended' : ''}">
      <div class="pt-plan-h"><div class="grow"><h3>${p.title || 'Plano de apoio'}</h3>
        <p class="small muted">${author ? `${U.shortName(author.name)}${author.title ? ` · ${author.title}` : ''}` : 'Equipe de apoio'}${p.start ? ` · desde ${U.fmtDate(p.start)}` : ''}${p.updatedAt ? ` · atualizado em ${U.fmtDate(String(p.updatedAt).slice(0, 10))}` : ''}</p></div>
        ${ended ? UI.pill('Encerrado', '') : p.familyAckAt ? UI.pill('Lido', 'ok') : UI.pill('Leia e confirme', 'warn')}</div>
      ${p.goals ? html`<div class="pt-plan-b"><h4>Metas</h4><p class="pt-pre">${textHTML(p.goals)}</p></div>` : ''}
      ${p.adaptations ? html`<div class="pt-plan-b"><h4>Como a escola vai apoiar</h4><p class="pt-pre">${textHTML(p.adaptations)}</p></div>` : ''}
      ${ended
        ? ''
        : p.familyAckAt
          ? html`<p class="pt-plan-ack is-ok">${icon('checkCircle')}Você confirmou a leitura em ${U.fmtDate(String(p.familyAckAt).slice(0, 10))}.</p>`
          : readOnly()
            ? html`<p class="pt-plan-ack small muted">${icon('clock')}Aguardando a família confirmar a leitura.</p>`
            : html`<div class="pt-plan-ack"><button type="button" class="btn primary" data-pt-ack="${p.id}">${icon('check')}Li e estou ciente</button><span class="small muted">A escola fica sabendo que você leu. Dúvidas sobre o plano?${canMessage() ? html` <button type="button" class="link" data-pt-msg="recado" data-pt-sid="${s.id}">Converse com a escola</button>.` : ' Fale com a escola.'}</span></div>`}
    </article>`;
  };

  const renderKid = (s, list) => {
    const c = classOf(s);
    const g = Q.myGuardianRecord(s);
    const age = U.age(s.birth);
    const team = staffOf(c);
    const plans = plansOf(s);
    const guardians = s.guardians || [];
    const pickers = guardians.filter((x) => x.podeBuscar && !x.bloqueado);
    const pickup = s.pickup || [];
    const hiddenHealth = UI.hidden(s, 'alerts') || UI.hidden(s, 'health');
    const hasHealth = !!(s.alerts || s.health);
    const crumbs = list.length > 1 ? html`<nav class="crumbs no-print" aria-label="Caminho"><a href="#filhos">Meus filhos</a>${icon('chevronRight')}<span>${U.firstName(s.name)}</span></nav>` : '';
    const links = [];
    if (hasPage('agenda')) links.push(html`<a class="btn" href="#agenda" data-pt-child="${s.id}" data-pt-for="agenda">${icon('bookOpen')}Agenda</a>`);
    links.push(html`<a class="btn" href="#boletim/${s.id}">${icon('grade')}Boletim</a>`);
    if (paysFor(s) && hasPage('financeiro')) links.push(html`<a class="btn" href="#financeiro">${icon('wallet')}Mensalidades</a>`);
    return html`${crumbs}
      <section class="card profile-head pt-profile">
        ${UI.avatar(s.name, 'lg', s.photo)}
        <div class="grow">
          <h1>${s.name}</h1>
          <div class="meta-row">
            <span>${icon('layers')}${classLine(c)}</span>
            ${age != null ? html`<span>${icon('cake')}${age} anos</span>` : ''}
            ${s.enrollment ? html`<span>${icon('file')}Matrícula ${s.enrollment}</span>` : ''}
          </div>
        </div>
        <div class="btn-row pt-profile-links">${links}</div>
      </section>
      ${plans.length
        ? html`<section class="card pt-plans" aria-labelledby="pt-d-plan">
            <div class="card-head"><h2 id="pt-d-plan">${icon('clipboard')}${plans.length > 1 ? 'Planos de apoio' : 'Plano de apoio'}</h2><span class="sub">compartilhado pela escola</span></div>
            <div class="card-body">${plans.map((p) => planCard(p, s))}</div>
          </section>`
        : ''}
      <div class="pt-detail">
        <div class="stack">
          <section class="card" aria-labelledby="pt-d-dados">
            <div class="card-head"><h2 id="pt-d-dados">${icon('user')}Dados do aluno</h2></div>
            <div class="card-body">${UI.kv([
              ['Nome completo', s.name],
              ['Nascimento', s.birth ? `${U.fmtDate(s.birth)}${age != null ? ` (${age} anos)` : ''}` : ''],
              ['Matrícula', s.enrollment],
              ['Turma', c ? c.name : html`<span class="muted">Sem turma no momento</span>`],
              c && c.segment ? ['Etapa', c.segment] : null,
              c && (c.shift || c.room) ? ['Turno e sala', [c.shift, c.room].filter(Boolean).join(' · ')] : null,
              s.address !== undefined ? ['Endereço', s.address] : null,
              ['Uso de imagem', s.imageConsent ? 'Autorizado (fotos em atividades e murais da escola)' : 'Não autorizado'],
            ])}</div>
          </section>
          <section class="card" aria-labelledby="pt-d-team">
            <div class="card-head"><h2 id="pt-d-team">${icon('teacher')}Equipe da turma</h2>${c ? html`<span class="sub">${c.name}</span>` : ''}</div>
            <div class="card-body">${team.length
              ? html`<ul class="items pt-team">${team.map(
                  (e) => html`<li>${UI.avatar(e.u.name, 'sm')}<div class="grow"><b>${e.u.name}</b><span class="small muted">${html.join([e.roles.join(' · '), e.subjects.length ? listText(e.subjects) : !e.roles.length ? e.u.title || Q.roleLabel(e.u.role) : ''], ' · ')}</span></div></li>`,
                )}</ul>`
              : html`<p class="small muted">A escola ainda não informou a equipe desta turma.</p>`}</div>
          </section>
          <section class="card" aria-labelledby="pt-d-resp">
            <div class="card-head"><h2 id="pt-d-resp">${icon('users')}Responsáveis</h2></div>
            <div class="card-body"><ul class="items pt-guard">${guardians.map((x) => {
              const mine = g && x.id === g.id;
              const tags = [x.pedagogico ? 'Acompanha a vida escolar' : null, x.financeiro ? 'Responsável financeiro' : null].filter(Boolean);
              return html`<li>${UI.avatar(x.name, 'sm')}<div class="grow"><b>${x.name}${mine ? html` <span class="pill info plain">Você</span>` : ''}</b>
                <span class="small muted">${html.join([x.relation, tags.join(' · ')], ' · ')}</span>
                ${mine && (x.phone || x.email) ? html`<span class="small muted">Contato na ficha: ${html.join([x.phone, x.email], ' · ')}</span>` : ''}</div></li>`;
            })}</ul></div>
          </section>
        </div>
        <div class="stack">
          <section class="card" aria-labelledby="pt-d-pick">
            <div class="card-head"><h2 id="pt-d-pick">${icon('door')}Quem pode buscar</h2></div>
            <div class="card-body">
              ${pickers.length || pickup.length
                ? html`<ul class="items pt-pick">${pickers.map(
                    (x) => html`<li>${icon('userCheck')}<div class="grow"><b>${x.name}</b><span class="small muted">${x.relation || 'Responsável'}${g && x.id === g.id ? ' · você' : ''}</span></div></li>`,
                  )}${pickup.map(
                    (p) => html`<li>${icon('userCheck')}<div class="grow"><b>${p.name}</b><span class="small muted">${html.join([p.relation, p.document, p.phone], ' · ')}</span></div></li>`,
                  )}</ul>`
                : html`<p class="small muted">Nenhuma pessoa cadastrada para buscar. Avise a escola quem pode retirar ${U.firstName(s.name)}.</p>`}
              <p class="small muted pt-pick-hint">${icon('shieldCheck')}<span>A escola só entrega ${U.firstName(s.name)} a quem está nesta lista, com documento.${canMessage() ? html` Alguém diferente vai buscar? <button type="button" class="link" data-pt-msg="busca" data-pt-sid="${s.id}">Avise a escola</button>.` : ''}</span></p>
            </div>
          </section>
          <section class="card" aria-labelledby="pt-d-health">
            <div class="card-head"><h2 id="pt-d-health">${icon('heart')}Saúde e alertas</h2></div>
            <div class="card-body">
              ${hasHealth
                ? html`${s.alerts ? html`<div class="notice bad pt-alert">${icon('alert')}<span class="grow"><b>Alerta:</b> ${s.alerts}</span></div>` : ''}
                    ${s.health ? html`<div class="pt-health"><h3>Informações de saúde</h3><p class="pt-pre">${textHTML(s.health)}</p></div>` : ''}`
                : hiddenHealth
                  ? UI.noAccess()
                  : html`<p class="small muted">Nenhuma informação de saúde cadastrada. Se ${U.firstName(s.name)} tem alergia, usa medicação ou precisa de algum cuidado, avise a escola.</p>`}
            </div>
          </section>
          ${changeHelp(s)}
        </div>
      </div>`;
  };

  const renderKids = (rest) => {
    const list = kids();
    if (!list.length)
      return html`<div class="page-head"><div><h1>Meus filhos</h1></div></div><section class="card">${UI.empty({ icon: 'users', title: 'Nenhum aluno ligado à sua conta', text: 'Quando a escola vincular o seu acesso aos seus filhos, os dados deles aparecem aqui. Fale com a secretaria.' })}</section>`;
    const id = rest && rest[0];
    if (id) {
      const s = findKid(id);
      if (!s) return html`<div class="page-head"><div><h1>Meus filhos</h1></div></div><section class="card">${UI.empty({ icon: 'users', title: 'Aluno não encontrado', text: 'Este aluno não está ligado à sua conta. Veja a lista dos seus filhos.', action: html`<a class="btn primary" href="#filhos">Ver meus filhos</a>` })}</section>`;
      return renderKid(s, list);
    }
    return list.length === 1 ? renderKid(list[0], list) : renderKidList(list);
  };
  const mountKids = (el) => {
    bindCommon(el);
    el.addEventListener('click', (e) => {
      const ack = e.target.closest('[data-pt-ack]');
      if (ack) {
        UI.act('plans.ack', { id: ack.dataset.ptAck }, { btn: ack, ok: 'Obrigado! A escola foi avisada de que você leu o plano.' });
        return;
      }
      if (e.target.closest('[data-pt-account]') && typeof App.myAccount === 'function') App.myAccount();
    });
  };

  // =====================================================================
  // Registro
  // =====================================================================
  App.page({
    id: 'inicio',
    label: 'Início',
    icon: 'home',
    family: true,
    order: 1,
    tab: 1,
    keys: 'resumo hoje filhos contato escola',
    title: () => 'Início',
    render: renderHome,
    mount: mountHome,
  });
  App.page({
    id: 'boletim',
    label: 'Boletim',
    icon: 'grade',
    family: true,
    order: 40,
    tab: 4,
    keys: 'notas médias frequência faltas parecer conselho',
    title: (rest) => {
      const s = rest && rest[0] && findKid(rest[0]);
      return s ? `Boletim de ${U.firstName(s.name)}` : 'Boletim';
    },
    render: renderBoletim,
    mount: mountBoletim,
  });
  App.page({
    id: 'filhos',
    label: 'Meus filhos',
    icon: 'users',
    family: true,
    order: 60,
    keys: 'dados aluno turma equipe professores responsáveis buscar saúde plano de apoio',
    badge: () => {
      const n = plansToAck().length;
      return n ? { n, title: n === 1 ? 'Um plano de apoio para ler' : `${n} planos de apoio para ler` } : null;
    },
    title: (rest) => {
      const s = rest && rest[0] && findKid(rest[0]);
      return s ? s.name : 'Meus filhos';
    },
    render: renderKids,
    mount: mountKids,
  });

  App.searchProvider((query) => {
    if (!Store.family) return [];
    return kids()
      .filter((s) => U.matches(query, s.name))
      .map((s) => ({ group: 'Meus filhos', label: s.name, avatar: s.name, meta: (classOf(s) || {}).name || '', run: () => App.go('filhos/' + s.id) }));
  });
})();
