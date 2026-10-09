'use strict';
/* Painel (início da equipe).
   Saudação com o resumo do dia, atalhos do menu "Novo", visão geral (para quem enxerga a escola ou um segmento),
   "Minhas turmas" (para quem tem vínculos), "Hoje" (eventos e aniversários) e a grade de widgets dos módulos.
   O host dos widgets (PainelKit.widgetGrid / mountWidgets) também serve ao início do Portal da família (portal.js).
   Quem está em "ver como" vê o painel da pessoa (Store.me já é ela); os atalhos somem porque nada pode ser alterado. */
(() => {
  const today = () => U.today();
  const can = (p) => Store.can(p);
  const me = () => Store.me;

  /** Gênero gramatical de quem se fala, quando se sabe: aluno pelo campo "sexo" (F/M); equipe pelo título
      ("Professora", "Diretor", "Psicóloga"…). '' quando não dá para saber. */
  const genderOf = (p) => {
    if (!p) return '';
    if (p.gender === 'F' || p.gender === 'M') return p.gender;
    const w = String(p.title || '').trim().split(/\s+/)[0].toLowerCase();
    if (/(ora|óloga|ária|eira)$/.test(w)) return 'F';
    if (/(or|ólogo|ário|eiro)$/.test(w)) return 'M';
    return '';
  };
  /** Concordância: masculino, feminino ou a forma neutra quando não se sabe (ex.: 'Aprovado', 'Aprovada', 'Aprovado(a)'). */
  const byGender = (p, masc, fem, neutral) => {
    const g = genderOf(p);
    return g === 'F' ? fem : g === 'M' ? masc : neutral;
  };
  /** Nota com uma casa, como no boletim. Se o arredondamento cruzaria a média de aprovação ou a nota de recuperação
      (5,96 viraria "6,0" e pareceria na média, embora a regra da escola compare o valor exato), mostra duas casas
      sem arredondar para cima ("5,96"): número e cor contam a mesma história. */
  const gradeText = (v) => {
    if (v == null || isNaN(v)) return '—';
    const st = Q.settings();
    const shown = Number(Number(v).toFixed(1));
    const crosses = [Number(st.passing), Number(st.recovery)].some((t) => !isNaN(t) && v < t && shown >= t);
    return crosses ? U.num(Math.floor(Number(Number(v).toFixed(6)) * 100 + 1e-6) / 100, 2) : U.num(v);
  };
  Object.assign(Q, { genderOf, byGender, gradeText });

  // =====================================================================
  // Grade de widgets (compartilhada com o Portal da família)
  // =====================================================================
  const COLS = { half: 2, third: 3 };
  const isBlank = (out) => !out || !String(out instanceof SafeHTML ? out.s : out).trim();
  /**
   * Monta os widgets permitidos. O próprio widget devolve o cartão; aqui só posicionamos pelo size:
   * full ocupa a linha; halves e thirds seguidos formam um grupo em colunas (2 ou 3) que o mount equilibra
   * pela altura (sem buracos). No celular tudo vira uma coluna, na ordem original.
   */
  const widgetGrid = (defs = App.widgets(), { cls = '', merge = false } = {}) => {
    const items = [];
    for (const w of defs) {
      let out;
      try {
        out = w.render();
      } catch (err) {
        console.error(`Quadro "${w.id}" do painel:`, err);
        continue;
      }
      if (isBlank(out)) continue;
      // merge: metades e terços viram uma grade só de duas colunas (telas com poucos quadros, como o Portal da família)
      const size = w.size === 'full' ? 'full' : merge || !COLS[w.size] ? 'half' : w.size;
      items.push({ w, out, size });
    }
    if (!items.length) return '';
    const segs = [];
    for (const it of items) {
      const last = segs[segs.length - 1];
      if (it.size !== 'full' && last && last.size === it.size) last.items.push(it);
      else segs.push({ size: it.size, items: [it] });
    }
    const box = (it, i, extra = '') => html`<div class="pn-w ${extra}" data-pn-w="${it.w.id}" data-pn-i="${i}" style="order:${i}">${it.out}</div>`;
    return html`<div class="pn-grid ${cls}">${segs.map((seg) => {
      const k = seg.size === 'full' ? 1 : Math.min(COLS[seg.size], seg.items.length);
      if (k === 1) return seg.items.map((it, i) => box(it, i, 'pn-w-full'));
      const stacks = Array.from({ length: k }, () => []);
      seg.items.forEach((it, i) => stacks[i % k].push(box(it, i)));
      return html`<div class="pn-group pn-g${k} pn-g-${seg.size}" data-pn-group>${stacks.map((st) => html`<div class="pn-stack">${st}</div>`)}</div>`;
    })}</div>`;
  };
  /** Equilibra as colunas de cada grupo: cada quadro vai, na ordem, para a coluna mais baixa. */
  const balance = (root) => {
    UI.$$('[data-pn-group]', root).forEach((g) => {
      const stacks = [...g.children];
      if (stacks.length < 2 || getComputedStyle(stacks[0]).display === 'contents') return;
      const boxes = UI.$$('[data-pn-w]', g).sort((a, b) => Number(a.dataset.pnI) - Number(b.dataset.pnI));
      const heights = stacks.map(() => 0);
      const target = boxes.map((b) => {
        let k = 0;
        for (let i = 1; i < heights.length; i++) if (heights[i] < heights[k] - 1) k = i;
        heights[k] += b.offsetHeight + 18;
        return k;
      });
      if (boxes.every((b, i) => b.parentElement === stacks[target[i]])) return;
      boxes.forEach((b, i) => stacks[target[i]].appendChild(b));
    });
  };
  /** Liga os eventos de cada widget no próprio elemento dele e equilibra as colunas. */
  const mountWidgets = (root) => {
    const defs = new Map(App.widgets().map((w) => [w.id, w]));
    UI.$$('[data-pn-w]', root).forEach((el) => {
      const w = defs.get(el.dataset.pnW);
      if (!w || !w.mount) return;
      try {
        w.mount(el);
      } catch (err) {
        console.error(`Quadro "${w.id}" do painel:`, err);
      }
    });
    balance(root);
  };
  const visiblePages = () => new Set(App.pages().map((p) => p.id));

  /**
   * Quadro "principal" de quem vê: o widget declara primary() (ex.: Atendimentos para a equipe de apoio,
   * Mensalidades para a tesouraria) e sobe para logo abaixo dos números, em vez de esperar a sua vez no fim do painel.
   */
  const isPrimary = (w) => {
    try {
      return typeof w.primary === 'function' && !!w.primary();
    } catch (err) {
      return false;
    }
  };
  /** Widgets soltos (sem grade), um embaixo do outro: usados para os principais na coluna da esquerda. */
  const widgetStack = (defs) =>
    defs.map((w, i) => {
      let out;
      try {
        out = w.render();
      } catch (err) {
        console.error(`Quadro "${w.id}" do painel:`, err);
        return '';
      }
      return isBlank(out) ? '' : html`<div class="pn-w pn-w-full pn-w-first" data-pn-w="${w.id}" data-pn-i="${i}" data-pn-first>${out}</div>`;
    });
  /**
   * Na tela larga, o principal fica na coluna da esquerda só se isso não abrir buraco ao lado do "Hoje";
   * senão desce para a linha inteira logo abaixo (no celular fica sempre logo depois dos números).
   */
  const placeFirst = (root) => {
    const main = UI.$('.pn-main', root);
    const col = UI.$('.pn-col', root);
    const side = UI.$('.pn-side', root);
    const slot = UI.$('[data-pn-first-slot]', root);
    const boxes = UI.$$('.pn-col > [data-pn-first]', root);
    if (!main || !col || !side || !slot || !boxes.length) return;
    if (getComputedStyle(main).gridTemplateColumns.trim().split(/\s+/).length < 2) return;
    const gap = parseFloat(getComputedStyle(col).rowGap) || 0;
    const firstH = boxes.reduce((n, b) => n + b.offsetHeight + gap, 0);
    const colH = col.offsetHeight;
    const sideH = side.offsetHeight;
    if (boxes.length === col.children.length) return; // só o principal na coluna: fica lá
    if (Math.abs(colH - firstH - sideH) < Math.abs(colH - sideH)) boxes.forEach((b) => slot.appendChild(b));
  };

  // =====================================================================
  // Atalhos (menu "Novo")
  // =====================================================================
  const QUICK_MAX = 6;
  const quickActions = () => {
    if (Store.preview) return '';
    const list = App.actions();
    if (!list.length) return '';
    const more = list.length > QUICK_MAX;
    const shown = list.slice(0, more ? QUICK_MAX - 1 : QUICK_MAX);
    return html`<section class="pn-quick" aria-label="Atalhos">
      ${shown.map((a) => html`<button type="button" class="pn-q" data-pn-act="${a.id}"><span class="pn-q-ic">${icon(a.icon || 'plus')}</span><span class="pn-q-l">${a.label}</span></button>`)}
      ${more ? html`<button type="button" class="pn-q pn-q-more" data-pn-more aria-haspopup="menu"><span class="pn-q-ic">${icon('dots')}</span><span class="pn-q-l">Mais ações <span class="pn-q-n">${list.length - shown.length}</span></span></button>` : ''}
    </section>`;
  };

  // =====================================================================
  // Chamada do dia (local; usa as consultas do módulo de turmas quando existem)
  // =====================================================================
  const rollState = (classId, date) => {
    if (typeof Q.rollState === 'function') return Q.rollState(classId, date);
    const ps = Q.periods(classId, date);
    return { total: ps.length, done: ps.filter((p) => Q.attendance(classId, date, p.period)).length };
  };
  const canTake = (c, p) => {
    if (!can('chamada.registrar')) return false;
    if (typeof Q.canTakeLesson === 'function') return Q.canTakeLesson(c.id, p.period, p.subjectId);
    const m = me();
    if (m.scope === 'todas' || !p.period) return true;
    if (c.teacherId === m.id && ['Educação Infantil', 'Fundamental I'].includes(c.segment)) return true;
    return !!(p.subjectId && c.subjects && c.subjects[p.subjectId] === m.id);
  };
  /** Presença registrada hoje nas turmas visíveis: {P, F, J, A, rate}. */
  const presenceOn = (date) => {
    const out = { P: 0, F: 0, J: 0, A: 0 };
    const att = Store.state.attendance;
    for (const k of Object.keys(att)) {
      const p1 = k.indexOf('|');
      if (k.slice(p1 + 1, p1 + 11) !== date) continue;
      for (const m of Object.values(att[k].marks || {})) if (out[m] !== undefined) out[m]++;
    }
    const counted = out.P + out.F + out.J;
    out.rate = counted ? (out.P / counted) * 100 : null;
    return out;
  };
  const dayOff = (date) => {
    if (Q.isSchoolDay(date)) return null;
    const h = Q.holiday(date);
    if (h) return { title: `Feriado: ${h}`, text: 'Não há aula hoje. A chamada volta no próximo dia letivo.', icon: 'sunrise' };
    const wd = U.weekday(date);
    if (wd === 0 || wd === 6) return { title: 'Fim de semana', text: 'Sem aula hoje. Bom descanso!', icon: 'sun' };
    return { title: 'Hoje não é dia letivo', text: 'A chamada volta no próximo dia letivo.', icon: 'sunrise' };
  };

  // =====================================================================
  // Visão geral (quem enxerga a escola ou um segmento)
  // =====================================================================
  const groupCount = (list) => new Set(list.map((d) => d.groupId || d.id)).size;
  const overview = (vis) => {
    const T = today();
    const out = [];
    const classes = Q.classes();
    // quem registra atendimentos vê primeiro o próprio trabalho
    if (can('atendimentos.registrar') && vis.has('atendimentos')) {
      const month = T.slice(0, 7);
      const n = Store.state.support.filter((r) => r.authorId === me().id && (r.date || '').slice(0, 7) === month).length;
      const plans = Store.state.plans.filter((p) => p.status === 'ativo').length;
      out.push({ href: '#atendimentos', icon: 'heart', label: `Seus atendimentos em ${U.monthName(month)}`, value: U.int(n), foot: U.plural(plans, 'plano de apoio ativo', 'planos de apoio ativos') });
    }
    if (can('alunos.ver') && vis.has('alunos')) {
      const n = Q.students().length;
      out.push({ href: '#alunos', icon: 'users', label: 'Alunos ativos', value: U.int(n), foot: classes.length ? U.plural(classes.length, 'turma ativa', 'turmas ativas') : 'Nenhuma turma ativa' });
    }
    // a situação das chamadas interessa a quem registra, justifica ou coordena
    if (can('chamada.ver') && Store.canAny('chamada.registrar', 'chamada.justificar', 'turmas.gerenciar') && vis.has('chamada') && classes.length) {
      const off = dayOff(T);
      if (off) out.push({ href: '#chamada', icon: 'checkSquare', label: 'Chamada de hoje', value: '—', foot: off.title });
      else {
        const withKids = classes.filter((c) => Q.roster(c.id).length);
        let full = 0;
        let started = 0;
        for (const c of withKids) {
          const r = rollState(c.id, T);
          if (r.total && r.done === r.total) full++;
          if (r.done) started++;
        }
        const pres = presenceOn(T);
        out.push({
          href: '#chamada',
          icon: 'checkSquare',
          label: 'Chamadas de hoje',
          value: html`${U.int(full)}<small>/${U.int(withKids.length)}</small>`,
          foot: pres.rate != null ? `${U.pct(pres.rate)} de presença${started > full ? ` · ${started - full} em andamento` : ''}` : 'Nenhuma chamada registrada ainda',
          tone: full < withKids.length ? 'warn' : 'ok',
          meter: withKids.length ? (full / withKids.length) * 100 : 0,
        });
      }
    }
    if (can('financeiro.ver') && Q.chargesFees() && vis.has('financeiro')) {
      const late = Store.state.invoices.filter((i) => !i.paidAt && i.due < T);
      const kids = new Set(late.map((i) => i.studentId)).size;
      const total = U.sum(late.map((i) => Q.amountDue(i, T)));
      out.push({ href: '#financeiro', icon: 'wallet', label: 'Mensalidades atrasadas', value: U.int(kids), foot: kids ? `${U.plural(kids, 'aluno', 'alunos')} · ${U.moneyShort(total)} em aberto` : 'Nenhum atraso', tone: kids ? 'bad' : 'ok' });
    }
    if (can('mensagens.responder') && vis.has('mensagens')) {
      const n = Q.openMessages().length;
      out.push({ href: '#mensagens', icon: 'inbox', label: 'Mensagens para responder', value: U.int(n), foot: n ? 'Enviadas pelas famílias' : 'Tudo respondido', tone: n ? 'warn' : 'ok' });
    }
    if (can('diario.aprovar') && vis.has('agenda')) {
      const pend = Q.pendingApprovals();
      if (pend.length || Q.settings().diaryApproval) {
        const n = groupCount(pend);
        out.push({ href: '#agenda', icon: 'shieldCheck', label: 'Aprovações da agenda', value: U.int(n), foot: n ? 'Aguardando você' : 'Nada pendente', tone: n ? 'warn' : 'ok', approvals: n > 0 });
      }
    }
    if (can('diario.ver') && vis.has('agenda')) {
      const n = groupCount(Store.state.diary.filter((d) => d.status === 'publicado' && d.date === T));
      out.push({ href: '#agenda', icon: 'bookOpen', label: 'Publicados hoje na agenda', value: U.int(n), foot: n ? 'Deveres, recados e avisos' : 'Nada publicado ainda hoje' });
    }
    return out.slice(0, 4);
  };
  const kpiTile = (k) => html`<a class="card kpi pn-kpi ${k.tone ? 'is-' + k.tone : ''}" href="${k.href}" ${k.approvals ? raw('data-pn-approvals') : ''}>
      <span class="kpi-label">${icon(k.icon)}${k.label}</span>
      <span class="kpi-value num">${k.value}</span>
      ${k.meter != null ? UI.meter(k.meter, k.tone === 'ok' ? 'ok' : '') : ''}
      <span class="kpi-foot">${k.foot}</span>
    </a>`;

  // =====================================================================
  // Minhas turmas
  // =====================================================================
  const ordinal = (n) => `${n}ª`;
  const myRole = (c) => {
    const m = me();
    if (c.teacherId === m.id) return ['Educação Infantil', 'Fundamental I'].includes(c.segment) ? 'Regente' : byGender(m, 'Conselheiro', 'Conselheira', 'Conselho da turma');
    if ((c.assistantIds || []).includes(m.id)) return 'Auxiliar';
    const subs = Object.entries(c.subjects || {}).filter(([, uid]) => uid === m.id).map(([sid]) => (Q.subject(sid) || {}).name).filter(Boolean);
    if (subs.length) return subs.length > 2 ? `${subs.slice(0, 2).join(', ')} e mais ${subs.length - 2}` : subs.join(' e ');
    return 'Acompanha';
  };
  const subjectShort = (sid) => {
    const s = Q.subject(sid);
    return s ? s.short || s.name : 'Aula';
  };
  const birthdaysToday = (list) => {
    const md = today().slice(5);
    return list.filter((s) => s.birth && s.birth.slice(5) === md);
  };
  const classCard = (c, vis) => {
    const T = today();
    const kids = Q.roster(c.id);
    const off = dayOff(T);
    const mode = Q.attendanceMode(c.id);
    const parecer = Q.evaluation(c.id) === 'parecer';
    const ps = off ? [] : Q.periods(c.id, T);
    const mine = ps.filter((p) => canTake(c, p));
    const pending = mine.filter((p) => !Q.attendance(c.id, T, p.period));
    const st = can('chamada.ver') && typeof Q.classStats === 'function' ? Q.classStats(c.id) : null;
    const bdays = birthdaysToday(kids);
    const isInfant = c.segment === 'Educação Infantil';
    const showRoll = vis.has('chamada') && (can('chamada.ver') || can('chamada.registrar'));
    let todayHTML = '';
    if (off) todayHTML = html`<span class="pn-today-off">${icon(off.icon)}${off.title}</span>`;
    else if (mode === 'por_aula' && mine.length && !(mine.length === 1 && !mine[0].period)) {
      todayHTML = html`<ul class="pn-lessons" aria-label="Suas aulas hoje">${mine.map((p) => {
        const done = !!Q.attendance(c.id, T, p.period);
        return html`<li class="pn-lesson ${done ? 'is-done' : ''}">${done ? icon('check') : icon('clock')}<span>${ordinal(p.period)} aula · ${subjectShort(p.subjectId)}</span><span class="sr-only">${done ? 'chamada feita' : 'chamada pendente'}</span></li>`;
      })}</ul>`;
    } else if (showRoll && ps.length) {
      const r = rollState(c.id, T);
      const done = r.total && r.done === r.total;
      todayHTML = done ? UI.pill(r.total > 1 ? 'Chamadas de hoje feitas' : 'Chamada de hoje feita', 'ok') : r.done ? UI.pill(`Chamada: ${r.done} de ${r.total} aulas`, 'warn') : UI.pill('Chamada de hoje pendente', 'warn');
    } else if (mode === 'por_aula') todayHTML = html`<span class="pn-today-off">${icon('calendar')}Sem aulas suas hoje nesta turma</span>`;
    const btns = [];
    if (showRoll && can('chamada.registrar') && pending.length) btns.push(html`<button type="button" class="btn sm primary" data-pn-roll="${c.id}" data-period="${pending[0].period}">${icon('checkSquare')}Fazer chamada</button>`);
    else if (showRoll && ps.length) btns.push(html`<button type="button" class="btn sm" data-pn-roll="${c.id}">${icon('checkSquare')}Ver chamada</button>`);
    if (can('diario.publicar') && typeof Actions.novoItemAgenda === 'function') btns.push(html`<button type="button" class="btn sm" data-pn-hw="${c.id}">${icon(isInfant ? 'message' : 'bookOpen')}${isInfant ? 'Recado' : Q.homeworkLabel()}</button>`);
    if (isInfant && vis.has('rotina')) btns.push(html`<a class="btn sm" href="#rotina">${icon('sun')}Rotina</a>`);
    if (vis.has('notas') && (can('notas.lancar') || can('notas.ver'))) btns.push(html`<button type="button" class="btn sm" data-pn-grades="${c.id}">${icon('grade')}${parecer ? 'Pareceres' : 'Notas'}</button>`);
    if (vis.has('agenda') && !can('diario.publicar')) btns.push(html`<button type="button" class="btn sm" data-pn-agenda="${c.id}">${icon('bookOpen')}Agenda</button>`);
    const turmaLink = vis.has('turmas');
    return html`<article class="card pn-class">
      <div class="pn-class-top">
        <span class="pn-class-mark c${U.colorIndex(c.name)}" aria-hidden="true">${icon(isInfant ? 'baby' : 'layers')}</span>
        <div class="grow">
          <h3>${turmaLink ? html`<a href="#turmas/${c.id}">${c.name}</a>` : c.name}</h3>
          <p class="small muted">${[c.segment, c.shift, c.room].filter(Boolean).join(' · ')}</p>
        </div>
        <span class="pill info plain pn-role">${myRole(c)}</span>
      </div>
      <dl class="pn-class-stats">
        <div><dt>Alunos</dt><dd class="num">${U.int(kids.length)}</dd></div>
        ${st && st.rate != null ? html`<div><dt>Frequência</dt><dd class="num pn-t-${Q.attTone(st.rate, c.id)}">${U.pct(st.rate)}</dd></div>` : ''}
        ${st && !st.parecer && st.avg != null && can('notas.ver') ? html`<div><dt>Média geral</dt><dd class="num">${U.num(st.avg)}</dd></div>` : ''}
      </dl>
      <div class="pn-class-today"><span class="pn-label">Hoje</span>${todayHTML || html`<span class="small muted">Nada marcado</span>`}</div>
      ${bdays.length ? html`<p class="pn-bday small">${icon('cake')}<span>Aniversário hoje: <b>${html.join(bdays.map((s) => U.shortName(s.name)), ', ')}</b></span></p>` : ''}
      ${btns.length ? html`<div class="pn-class-btns n${btns.length}">${btns}</div>` : ''}
    </article>`;
  };
  const myClassesBlock = (list, vis) => {
    const total = U.sum(list.map((c) => Q.roster(c.id).length));
    return html`<section class="pn-section" aria-labelledby="pn-classes-h">
      <div class="pn-section-h"><h2 id="pn-classes-h">${icon('layers')}Minhas turmas</h2><span class="sub">${U.plural(list.length, 'turma', 'turmas')} · ${U.plural(total, 'aluno', 'alunos')}</span>${vis.has('turmas') ? html`<a class="btn ghost sm pn-section-link" href="#turmas">Ver turmas${icon('arrowRight')}</a>` : ''}</div>
      <div class="pn-classes n${Math.min(list.length, 2)}">${list.map((c) => classCard(c, vis))}</div>
    </section>`;
  };
  const noClassesBlock = () => html`<section class="card pn-noclass">${UI.empty({
    icon: 'layers',
    title: 'Você ainda não está em nenhuma turma',
    text: 'Quando a direção ou a coordenação vincular você a uma turma, ela aparece aqui com a chamada do dia e os atalhos.',
  })}</section>`;

  // =====================================================================
  // Hoje
  // =====================================================================
  const EVENT_TONE = (t) => (Q.EVENT_TYPES[t] || Q.EVENT_TYPES.evento).c;
  /** Eventos do dia que dizem respeito à pessoa (escola toda e as suas turmas; calendario.js decide quando existe). */
  const eventsFor = (date) => {
    if (typeof Q.relevantEvents === 'function') return Q.relevantEvents(date, date);
    const m = me();
    if (m.scope === 'todas') return Q.eventsOn(date);
    const ids = new Set(m.classIds || []);
    const byId = Q.classesById();
    return Q.eventsOn(date).filter((e) => !e.audience || e.audience.who === 'equipe' || Core.rules.audienceTouches(e.audience, ids, byId));
  };
  /** De que turma/etapa é o evento ('' = escola toda). */
  const eventWhere = (e) => (typeof Q.eventWhere === 'function' ? Q.eventWhere(e) : e.audience ? Q.audienceLabel(e.audience).replace(/^[^·]*·\s*/, '').replace('escola toda', '') : '');
  const eventRow = (e) => {
    const t = Q.EVENT_TYPES[e.type] || Q.EVENT_TYPES.evento;
    const where = eventWhere(e);
    const staff = e.audience && e.audience.who === 'equipe';
    return html`<li class="pn-ev"><span class="pn-ev-time num">${e.time || 'Dia todo'}</span><span class="ev-dot" style="--c:var(--cat-${EVENT_TONE(e.type)})" aria-hidden="true"></span><div class="grow"><b>${e.title}</b><span class="small muted">${t.label}${where ? ` · ${where}` : ''}${staff ? ' · só a equipe' : ''}</span></div></li>`;
  };
  const todayCard = (vis) => {
    const T = today();
    const tomorrow = U.addDays(T, 1);
    const off = dayOff(T);
    const evs = eventsFor(T);
    const next = eventsFor(tomorrow);
    // o quadro "Aniversariantes" (próximos 7 dias, com os de hoje marcados) já está no painel: não repete aqui
    const bdays = can('alunos.ver') && !App.widgets().some((w) => w.id === 'aniversariantes') ? birthdaysToday(Q.students()) : [];
    const upcoming = !evs.length && !next.length ? (typeof Q.relevantEvents === 'function' ? Q.relevantEvents(U.addDays(T, 2)) : Q.upcoming(1, U.addDays(T, 2)))[0] : null;
    const cal = vis.has('calendario');
    return html`<section class="card pn-today" aria-labelledby="pn-today-h">
      <div class="card-head"><h2 id="pn-today-h">${icon('sun')}Hoje</h2>${cal ? html`<a class="sub" href="#calendario">Calendário</a>` : ''}</div>
      <div class="card-body">
        <div class="pn-day">
          <span class="date-chip today"><b>${Number(T.slice(8))}</b><span>${U.MONTHS_SHORT[Number(T.slice(5, 7)) - 1]}</span></span>
          <div><b>${U.cap(U.fmtDateLong(T))}</b><span class="small muted">${off ? off.title : 'Dia letivo'}</span></div>
        </div>
        ${evs.length ? html`<ul class="items pn-evs">${evs.map(eventRow)}</ul>` : html`<p class="small muted pn-none">Nenhum evento marcado para hoje.</p>`}
        ${bdays.length
          ? html`<div class="pn-sub"><h3>${icon('cake')}Aniversariantes de hoje</h3><ul class="items pn-bdays">${bdays.slice(0, 5).map((s) => {
              const c = Q.klass(s.classId);
              const age = U.age(s.birth);
              return html`<li>${UI.avatar(s.name, 'sm', s.photo)}<div class="grow"><a class="person-name" href="#alunos/${s.id}">${U.shortName(s.name)}</a><span class="person-sub">${age != null ? `${age} anos` : ''}${c ? ` · ${c.name}` : ''}</span></div></li>`;
            })}</ul>${bdays.length > 5 ? html`<p class="small muted">e mais ${bdays.length - 5}.</p>` : ''}</div>`
          : ''}
        ${next.length ? html`<div class="pn-sub"><h3>${icon('calendar')}Amanhã</h3><ul class="items pn-evs">${next.slice(0, 4).map(eventRow)}</ul></div>` : ''}
        ${upcoming ? html`<p class="small muted pn-next">${icon('calendar')}<span>Próximo: <b>${upcoming.title}</b>${eventWhere(upcoming) ? ` · ${eventWhere(upcoming)}` : ''} · ${U.relDay(upcoming.date)} (${U.fmtDate(upcoming.date)})</span></p>` : ''}
      </div>
    </section>`;
  };

  // =====================================================================
  // Saudação e resumo
  // =====================================================================
  /** Número do selo de uma tela visível (a própria tela sabe o que está pendente). */
  const pageBadge = (id) => {
    const p = App.pages().find((x) => x.id === id);
    if (!p || !p.badge) return 0;
    try {
      const b = p.badge();
      return b ? (typeof b === 'number' ? b : Number(b.n) || 0) : 0;
    } catch (e) {
      return 0;
    }
  };
  const summaryLine = (vis) => {
    const parts = [];
    const T = today();
    if (vis.has('chamada') && can('chamada.registrar') && Q.isSchoolDay(T)) {
      const n = Q.pendingRolls(T).length;
      if (n) parts.push(n === 1 ? '1 turma ainda sem chamada hoje' : `${n} turmas ainda sem chamada hoje`);
    }
    if (vis.has('rotina')) {
      const n = pageBadge('rotina');
      if (n) parts.push(n === 1 ? 'a rotina de hoje para enviar às famílias' : `a rotina de hoje para enviar em ${n} turmas`);
    }
    if (vis.has('mensagens') && can('mensagens.responder')) {
      const n = Q.openMessages().length;
      if (n) parts.push(U.plural(n, 'mensagem para responder', 'mensagens para responder'));
    }
    if (vis.has('agenda') && can('diario.aprovar')) {
      const n = groupCount(Q.pendingApprovals());
      if (n) parts.push(U.plural(n, 'envio da agenda para aprovar', 'envios da agenda para aprovar'));
    }
    let money = '';
    if (vis.has('financeiro') && Store.canAny('financeiro.receber', 'financeiro.gerenciar') && Q.chargesFees()) {
      const n = new Set(Store.state.invoices.filter((i) => !i.paidAt && i.due < T).map((i) => i.studentId)).size;
      if (n) money = `${U.plural(n, 'aluno está', 'alunos estão')} com mensalidade em atraso.`;
    }
    if (!parts.length && !money) {
      // escola sem turmas ou alunos (ou pessoa sem turma): não há o que estar "em dia"
      if (emptySchool()) return App.widgets().some((w) => w.id === 'primeiros-passos') ? 'Vamos começar: siga os primeiros passos abaixo para preparar a escola.' : 'Ainda não há turmas ou alunos cadastrados.';
      if (noClassesYet()) return 'As pendências do dia aparecem aqui assim que a escola ligar você a uma turma.';
      return 'Tudo em dia por aqui.';
    }
    if (!parts.length) return money;
    const last = parts.pop();
    return `Você tem ${parts.length ? `${parts.join(', ')} e ${last}` : last}.${money ? ` ${money}` : ''}`;
  };
  const head = (vis) => {
    const m = me();
    const s = Q.settings();
    const T = today();
    return html`<div class="page-head pn-head">
      <div>
        <p class="eyebrow">${U.cap(U.fmtDateLong(T))} · ${Q.termLabel(Q.currentTerm())} de ${Q.year()}</p>
        <h1>${U.greeting()}, ${U.firstName(m.name)}!</h1>
        <p class="lead">${summaryLine(vis)}</p>
      </div>
      <div class="pn-head-side">
        <span class="pn-who small muted">${m.title || m.roleLabel}${s.schoolName ? ` · ${s.schoolName}` : ''}</span>
        ${m.staffAndFamily && !Store.preview ? html`<button type="button" class="btn ghost sm pn-portal" data-pn-portal>${icon('heart')}Abrir o Portal da família</button>` : ''}
      </div>
    </div>`;
  };

  // =====================================================================
  // Escola vazia (o widget 'primeiros-passos' da gestão ocupa o topo; aqui só um apoio se ele não existir)
  // =====================================================================
  const emptySchool = () => me().scope === 'todas' && (!Q.classes().length || !Store.state.students.length);
  /** Professor/auxiliar ainda sem turma vinculada. */
  const noClassesYet = () => me().scope === 'vinculos' && !Q.myClasses().length;
  /**
   * Sem turmas ou alunos, os quadros do dia a dia diriam "Tudo em dia: as chamadas de hoje estão feitas",
   * "Tudo lançado no bimestre"… sem haver nada para fazer. Ficam só os que valem para a escola vazia
   * (primeiros passos, calendário, comunicados) e os acessos da equipe quando já há colegas convidados.
   */
  const SETUP_WIDGETS = new Set(['primeiros-passos', 'proximos-eventos', 'comunicados-fixados']);
  const setupWidgets = () => App.widgets().filter((w) => SETUP_WIDGETS.has(w.id) || (w.id === 'equipe-acessos' && Q.staff().length > 1));
  const setupFallback = (vis) => {
    if (App.widgets().some((w) => w.id === 'primeiros-passos')) return '';
    const steps = [];
    if (vis.has('configuracoes')) steps.push(html`<a class="btn" href="#configuracoes">${icon('settings')}Dados da escola</a>`);
    if (can('turmas.gerenciar') && typeof Actions.novaTurma === 'function' && !Store.preview) steps.push(html`<button type="button" class="btn" data-pn-setup="turma">${icon('layers')}Criar turma</button>`);
    if (can('usuarios.gerenciar') && typeof Actions.novaConta === 'function' && !Store.preview) steps.push(html`<button type="button" class="btn" data-pn-setup="conta">${icon('userPlus')}Convidar a equipe</button>`);
    if (can('alunos.cadastrar') && typeof Actions.matricular === 'function' && !Store.preview && Q.classes().length) steps.push(html`<button type="button" class="btn primary" data-pn-setup="aluno">${icon('userPlus')}Matricular aluno</button>`);
    return html`<section class="card pn-setup">${UI.empty({
      icon: 'sparkles',
      title: 'Vamos preparar a escola',
      text: steps.length ? 'Ainda não há turmas ou alunos. Comece pelos dados da escola, crie as turmas e matricule os alunos: depois o painel passa a mostrar a chamada, a agenda e as pendências do dia.' : 'Ainda não há turmas ou alunos cadastrados. Quando a direção preparar a escola, o painel passa a mostrar o dia a dia.',
      action: steps.length ? html`${steps}` : '',
    })}</section>`;
  };

  // =====================================================================
  // Tela
  // =====================================================================
  const render = () => {
    const vis = visiblePages();
    const m = me();
    if (emptySchool()) {
      return html`${head(vis)}
        ${widgetGrid(setupWidgets())}
        ${setupFallback(vis)}
        ${quickActions()}`;
    }
    const mine = Q.myClasses();
    const kpis = m.scope !== 'vinculos' ? overview(vis) : [];
    const defs = noClassesYet() ? setupWidgets() : App.widgets();
    const firsts = defs.filter(isPrimary);
    const main = [];
    if (kpis.length) main.push(html`<section class="pn-kpis n${kpis.length}" aria-label="Visão geral">${kpis.map(kpiTile)}</section>`);
    if (mine.length) main.push(myClassesBlock(mine, vis));
    else if (m.scope === 'vinculos') main.push(noClassesBlock());
    const firstHTML = widgetStack(firsts).filter(Boolean);
    main.push(...firstHTML);
    return html`${head(vis)}
      ${quickActions()}
      <div class="pn-main ${main.length ? '' : 'is-solo'}">
        ${main.length ? html`<div class="pn-col">${main}</div>` : ''}
        <div class="pn-side">${todayCard(vis)}</div>
      </div>
      <div class="pn-first-slot" data-pn-first-slot></div>
      ${widgetGrid(defs.filter((w) => !firsts.includes(w)))}`;
  };

  const AGENDA_DEFAULTS = () => ({ view: window.innerWidth < 700 ? 'dia' : 'semana', date: U.today(), classId: '', type: '', status: '', mine: false, opened: '' });

  const openPortal = async (btn) => {
    btn.disabled = true;
    btn.classList.add('loading');
    try {
      await Store.setMode('familia');
      history.replaceState(null, '', '#inicio');
      App.render();
      UI.toast('Você está no Portal da família', { ic: 'heart' });
    } catch (err) {
      UI.errorToast(err);
      if (document.contains(btn)) {
        btn.disabled = false;
        btn.classList.remove('loading');
      }
    }
  };

  const mount = (el) => {
    mountWidgets(el);
    placeFirst(el);
    el.addEventListener('click', (e) => {
      if (e.target.closest('[data-pn-w]')) return; // os widgets cuidam dos próprios cliques
      const act = e.target.closest('[data-pn-act]');
      if (act) {
        const a = App.actions().find((x) => x.id === act.dataset.pnAct);
        if (a) a.run();
        return;
      }
      const more = e.target.closest('[data-pn-more]');
      if (more) {
        const rest = App.actions().slice(QUICK_MAX - 1);
        UI.menu(more, rest.map((a) => ({ label: a.label, icon: a.icon, fn: () => a.run() })));
        return;
      }
      const roll = e.target.closest('[data-pn-roll]');
      if (roll) {
        const period = roll.dataset.period;
        if (typeof Actions.fazerChamada === 'function') Actions.fazerChamada(roll.dataset.pnRoll, { date: today(), period: period != null && period !== '' ? Number(period) : null });
        else App.go('chamada');
        return;
      }
      const hw = e.target.closest('[data-pn-hw]');
      if (hw) {
        const c = Q.klass(hw.dataset.pnHw);
        if (typeof Actions.novoItemAgenda === 'function') Actions.novoItemAgenda({ classId: hw.dataset.pnHw, type: c && c.segment === 'Educação Infantil' ? 'recado' : 'dever' });
        return;
      }
      const gr = e.target.closest('[data-pn-grades]');
      if (gr) {
        if (typeof Actions.abrirNotas === 'function') Actions.abrirNotas(gr.dataset.pnGrades);
        else App.go('notas');
        return;
      }
      const ag = e.target.closest('[data-pn-agenda]');
      if (ag) {
        PageState.get('agenda', AGENDA_DEFAULTS()).classId = ag.dataset.pnAgenda;
        App.go('agenda');
        return;
      }
      if (e.target.closest('[data-pn-approvals]')) {
        Object.assign(PageState.get('agenda', AGENDA_DEFAULTS()), { status: 'pendente', type: '', mine: false, classId: '' });
        return; // o link segue para #agenda
      }
      const setup = e.target.closest('[data-pn-setup]');
      if (setup) {
        const k = setup.dataset.pnSetup;
        if (k === 'turma') Actions.novaTurma();
        else if (k === 'conta') Actions.novaConta();
        else if (k === 'aluno') Actions.matricular();
        return;
      }
      const portal = e.target.closest('[data-pn-portal]');
      if (portal) openPortal(portal);
    });
  };

  App.page({
    id: 'painel',
    label: 'Painel',
    icon: 'home',
    group: 'Dia a dia',
    order: 1,
    tab: 1,
    keys: 'início resumo hoje atalhos',
    title: () => 'Painel',
    render,
    mount,
  });

  window.PainelKit = { widgetGrid, mountWidgets, dayOff };
})();
