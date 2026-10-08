'use strict';
/* Agenda do aluno — os dois lados da agenda escolar.
   Equipe: visão por dia/semana com filtros, cartões com acompanhamento (visualizado, ciente, autorizações),
   aprovação, edição, cancelamento (com "Desfazer"), respostas por aluno/responsável e ciente em papel.
   Compor: dever de casa, recado, lembrete, autorização e ocorrência (Actions.novoItemAgenda), com prévia
   "como a família vai ver". Família: o que precisa de resposta, hoje, próximas entregas e anteriores.
   Também: aba "Agenda" da ficha do aluno, cartões do painel e ações do menu "Novo".
   Comandos: diary.save, diary.cancel, diary.approve, diary.ack (web/core/commands/agenda.js). */
(() => {
  const can = (p) => Store.can(p);
  const tf = (b) => (b ? 'true' : 'false');
  /** Botões segmentados (igual a UI.seg, mas com aria-pressed "true"/"false": o html`` apaga booleanos). */
  const seg = (items, active, attr) =>
    html`<div class="seg" role="group">${items.map(([v, l]) => html`<button type="button" ${raw(attr)}="${v}" aria-pressed="${tf(String(v) === String(active))}">${l}</button>`)}</div>`;
  const me = () => Store.me;
  const today = () => U.today();
  const WINDOW_DAYS = 60;
  const windowStart = () => U.addDays(today(), -WINDOW_DAYS);
  const NEVER_SENT = new Set(['rascunho', 'pendente', 'agendado']);
  const STATUS = {
    rascunho: { label: 'Rascunho', tone: '' },
    pendente: { label: 'Aguardando aprovação', tone: 'warn' },
    agendado: { label: 'Agendado', tone: 'info' },
    publicado: { label: 'Enviado', tone: 'ok' },
    cancelado: { label: 'Cancelado', tone: 'bad' },
  };
  const TYPE_ORDER = ['dever', 'recado', 'lembrete', 'autorizacao', 'ocorrencia'];
  const typeInfo = (t) => Q.DIARY_TYPES[t] || Q.DIARY_TYPES.recado;
  const typeLabel = (t) => Q.diaryTypeLabel(t);
  const typeIcon = (t, extra = '') => html`<span class="ag-type ${typeInfo(t).tone} ${extra}" aria-hidden="true">${icon(typeInfo(t).icon)}</span>`;
  /** Cor do item: a do tipo; elogio em verde. */
  const toneOf = (d) => (d.type === 'ocorrencia' && d.category === 'elogio' ? 'c3' : typeInfo(d.type).tone);
  const itemIcon = (d, extra = '') => html`<span class="ag-type ${toneOf(d)} ${extra}" aria-hidden="true">${icon(d.type === 'ocorrencia' && d.category === 'elogio' ? 'star' : typeInfo(d.type).icon)}</span>`;
  const occLabel = (c) => Q.OCCURRENCE_CATEGORIES[c] || 'Ocorrência';
  /** Concordância: autorização e ocorrência são femininas ("enviada"); dever, recado e lembrete, masculinas. */
  const fem = (t) => t === 'autorizacao' || t === 'ocorrencia';
  const gw = (t, word) => (fem(t) ? word.replace(/o$/, 'a') : word);
  const textHTML = (s) => raw(U.linkify(U.esc(s || '')));
  /** "hoje às 14:32" — vazio se o instante for inválido (nunca mostra "—" no meio da frase). */
  const at = (iso) => (iso && !isNaN(Date.parse(iso)) ? U.fmtInstant(iso) : '');
  const withAt = (iso) => (at(iso) ? ` · ${at(iso)}` : '');
  /** Texto de motivo dentro de uma frase (sem ponto final duplicado). */
  const clause = (s) => String(s || '').trim().replace(/[.!…\s]+$/, '');
  /** Arquivos enviados nesta sessão (o nome aparece antes de o comando ligar o arquivo ao item). */
  const uploaded = new Map();
  const attachList = (ids, removable = false) => {
    if (!ids || !ids.length) return '';
    return html`<div class="attachments">${ids.map((id) => {
      const f = Q.file(id) || uploaded.get(id) || { id, name: 'Arquivo', type: '' };
      return html`<span class="attachment"><a href="${Api.fileUrl(id)}" target="_blank" rel="noopener noreferrer">${icon(f.type === 'application/pdf' ? 'file' : 'image')}<span>${f.name}</span></a>${removable ? html`<button type="button" class="icon-btn sm" data-remove-file="${id}" aria-label="Remover ${f.name}">${icon('x')}</button>` : ''}</span>`;
    })}</div>`;
  };

  // ---------- datas ----------
  const pad2 = (n) => String(n).padStart(2, '0');
  const ddmm = (d) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
  const shortDay = (d) => (d ? `${U.WD_SHORT[U.weekday(d)]}, ${ddmm(d)}` : '');
  const relShort = (d) => {
    if (!d) return '';
    const t = today();
    if (d === t) return 'hoje';
    if (d === U.addDays(t, 1)) return 'amanhã';
    if (d === U.addDays(t, -1)) return 'ontem';
    return shortDay(d);
  };
  const weekStart = (d) => U.addDays(d, -((U.weekday(d) + 6) % 7));
  const weekLabel = (start) => {
    const end = U.addDays(start, 6);
    const m1 = U.MONTHS_SHORT[Number(start.slice(5, 7)) - 1];
    const m2 = U.MONTHS_SHORT[Number(end.slice(5, 7)) - 1];
    return m1 === m2 ? `${Number(start.slice(8))} a ${Number(end.slice(8))} de ${m2}` : `${Number(start.slice(8))} ${m1} a ${Number(end.slice(8))} ${m2}`;
  };
  const localInput = (dt) => `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}T${pad2(dt.getHours())}:${pad2(dt.getMinutes())}`;
  /** Sugestão de horário para agendar: hoje às 18h, ou amanhã às 7h se já passou. */
  const defaultSchedule = () => {
    const d = new Date();
    if (d.getHours() < 17) d.setHours(18, 0, 0, 0);
    else {
      d.setDate(d.getDate() + 1);
      d.setHours(7, 0, 0, 0);
    }
    return localInput(d);
  };
  const nextSchoolDay = (from) => {
    let d = from;
    for (let i = 0; i < 20; i++) {
      d = U.addDays(d, 1);
      if (Q.isSchoolDay(d)) return d;
    }
    return U.addDays(from, 1);
  };
  /** Próxima aula da disciplina na turma (pelo horário). */
  const nextLesson = (classId, subjectId, from) => {
    const c = Q.klass(classId);
    if (!c || !subjectId || !Array.isArray(c.schedule)) return null;
    let d = from;
    for (let i = 0; i < 21; i++) {
      d = U.addDays(d, 1);
      const wd = U.weekday(d);
      if (wd < 1 || wd > 5 || !Q.isSchoolDay(d)) continue;
      if ((c.schedule[wd - 1] || []).includes(subjectId)) return d;
    }
    return null;
  };

  // ---------- dados (retrato + histórico carregado sob demanda) ----------
  /** Itens trazidos do histórico (mais de 60 dias). Presos à pessoa e ao modo, para não vazar entre contas. */
  const hist = { owner: '', items: new Map(), done: new Set() };
  const ownerKey = () => (me() ? `${me().id}|${Store.family ? 'f' : 'e'}|${Store.preview ? Store.preview.id : ''}` : '');
  const cache = () => {
    const k = ownerKey();
    if (hist.owner !== k) {
      hist.owner = k;
      hist.items = new Map();
      hist.done = new Set();
    }
    return hist;
  };
  const allDiary = () => {
    const list = Store.state.diary;
    const h = cache();
    if (!h.items.size) return list;
    const have = new Set(list.map((d) => d.id));
    return list.concat([...h.items.values()].filter((d) => !have.has(d.id)));
  };
  const loadHistory = async (params, key) => {
    const owner = ownerKey();
    try {
      const r = await Api.history('diary', { limit: 200, ...params });
      if (ownerKey() !== owner) return null; // trocou de conta (ou de prévia) enquanto carregava: descarta
      const h = cache();
      for (const x of r.items || []) if (x && x.value && x.value.id) h.items.set(x.value.id, { ...x.value, _old: true });
      if (key) h.done.add(key);
      Store.emit();
      return r;
    } catch (err) {
      UI.errorToast(err);
      return null;
    }
  };
  const sortItems = (a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : (b.createdAt || '').localeCompare(a.createdAt || ''));

  /** Cartões: um por envio (groupId) e situação — várias turmas ou vários alunos do mesmo envio ficam juntos. */
  const groupsOf = (items) => {
    const map = new Map();
    for (const d of items) {
      const k = `${d.groupId || d.id}|${d.status}`;
      let g = map.get(k);
      if (!g) map.set(k, (g = { key: k, items: [] }));
      g.items.push(d);
    }
    return [...map.values()].map((g) => ({ ...g, lead: g.items[0] }));
  };
  const cardKey = (d) => `${d.groupId || d.id}|${d.status}`;
  const findCard = (key, classId = '') => {
    const items = allDiary().filter((d) => cardKey(d) === key && (!classId || d.classId === classId)).sort(sortItems);
    return items.length ? { key, items, lead: items[0] } : null;
  };
  /** Todos os itens ainda ativos do mesmo envio (todas as turmas). */
  const wholeGroup = (d) => allDiary().filter((x) => (x.groupId || x.id) === (d.groupId || d.id) && x.status === d.status);

  const famUsers = (s) => ((s && s.guardians) || []).filter((g) => g.userId && !g.bloqueado).map((g) => g.userId);
  const hasAnswers = (d) => Object.values(Q.acks(d.id)).some((by) => Object.keys(by || {}).length);
  const deadlinePassed = (d) => d.type === 'autorizacao' && !!d.respondBy && d.respondBy < today();
  const reachable = (classId) => (me().classIds || []).includes(classId);
  const canManage = (d) => {
    const m = me();
    const typePerm = d.type === 'ocorrencia' ? can('diario.ocorrencias') : can('diario.publicar');
    return typePerm && reachable(d.classId) && (d.authorId === m.id || can('diario.aprovar') || (m.scope === 'todas' && can('diario.publicar')));
  };
  const canEdit = (d) => canManage(d) && d.status !== 'cancelado' && !d._old && !(d.type === 'autorizacao' && hasAnswers(d));
  const canPaper = (d) => can('diario.publicar') && reachable(d.classId) && d.status === 'publicado' && !d._old && (d.requireAck || d.type === 'autorizacao') && !deadlinePassed(d);

  /** Números de acompanhamento de um envio. */
  const trackOf = (items) => {
    const t = { recips: 0, portal: 0, viewed: 0, ack: 0, sim: 0, nao: 0, naoList: [], old: false, auth: items[0].type === 'autorizacao', requireAck: items.some((d) => d.requireAck) };
    for (const d of items) {
      if (d._old) {
        t.old = true;
        continue;
      }
      const reads = Store.reads[d.id] || {};
      const acks = Q.acks(d.id);
      for (const sid of d.recipients || []) {
        t.recips++;
        const users = famUsers(Q.student(sid));
        if (users.length) {
          t.portal++;
          if (users.some((u) => reads[u])) t.viewed++;
        }
        if (Object.keys(acks[sid] || {}).length) t.ack++;
        if (t.auth) {
          const a = Q.authorizationAnswer(d.id, sid);
          if (a === 'sim') t.sim++;
          else if (a === 'nao') {
            t.nao++;
            t.naoList.push(sid);
          }
        }
      }
    }
    return t;
  };

  // ---------- peças ----------
  const subjectTag = (id) => {
    const s = id ? Q.subject(id) : null;
    return s ? html`<span class="subject-tag"><span class="swatch c${s.color || 1}"></span>${s.name}</span>` : '';
  };
  const classNames = (items) => [...new Set(items.map((d) => (Q.klass(d.classId) || {}).name).filter(Boolean))];
  const recipientsText = (items) => {
    const per = items.filter((d) => d.studentId);
    if (!per.length) return 'turma toda';
    const names = per.map((d) => U.shortName((Q.student(d.studentId) || {}).name || 'Aluno'));
    return names.length <= 3 ? names.join(', ') : `${names.slice(0, 2).join(', ')} e mais ${names.length - 2}`;
  };
  const sentAt = (d) => (d.publishAt && d.status === 'publicado' && d.publishAt > (d.createdAt || '') ? d.publishAt : d.createdAt);
  const authorName = (id) => (id === me().id ? 'você' : U.shortName(Q.userName(id, 'Equipe da escola')));
  /** Prazo do item em texto curto ("Entrega: amanhã"). */
  const dueBits = (d) => {
    const out = [];
    if (d.type === 'dever' && d.due) out.push(html`<span class="ag-due ${d.due === today() ? 'is-today' : ''}">${icon('clock')}Entrega: <b>${relShort(d.due)}</b></span>`);
    else if (d.due) out.push(html`<span class="ag-due ${d.due === today() ? 'is-today' : ''}">${icon('calendar')}${d.type === 'lembrete' ? 'Data' : 'Até'}: <b>${relShort(d.due)}</b></span>`);
    if (d.respondBy) out.push(html`<span class="ag-due ${deadlinePassed(d) ? 'is-late' : ''}">${icon('clock')}Responder até <b>${relShort(d.respondBy)}</b>${deadlinePassed(d) ? ' (encerrado)' : ''}</span>`);
    return out;
  };

  const stat = (ic, label, n, of, unit, tone = '', foot = '') => html`<div class="ag-stat">
      <div class="ag-stat-top"><span class="ag-stat-l">${icon(ic)}${label}</span><span class="ag-stat-n"><b class="num">${n}</b> de <span class="num">${of}</span> ${unit}</span></div>
      ${UI.meter(of ? (n / of) * 100 : 0, tone)}${foot ? html`<span class="ag-stat-foot">${foot}</span>` : ''}
    </div>`;
  const trackHTML = (items, { withButton = true } = {}) => {
    const t = trackOf(items);
    if (t.old) return html`<div class="ag-track ag-track-old">${icon('history')}<span>Acompanhamento (visualizações e ciente) aparece só para os últimos ${WINDOW_DAYS} dias.</span></div>`;
    if (!t.recips) return '';
    const noPortal = t.recips - t.portal;
    const stats = [stat('eye', 'Visualizado', t.viewed, t.portal, t.portal === 1 ? 'família' : 'famílias', 'ok', noPortal ? `${U.plural(noPortal, 'aluno', 'alunos')} sem acesso ao portal` : '')];
    if (t.auth) {
      stats.push(html`<div class="ag-stat ag-auth">
        <div class="ag-stat-top"><span class="ag-stat-l">${icon('shieldCheck')}Respostas</span></div>
        <div class="ag-auth-pills">${UI.pill(`${t.sim} autoriza${t.sim === 1 ? '' : 'm'}`, 'ok')}${t.nao ? UI.pill(`${t.nao} não autoriza${t.nao === 1 ? '' : 'm'}`, 'bad') : ''}${UI.pill(`${t.recips - t.sim - t.nao} sem resposta`, t.recips - t.sim - t.nao ? 'warn' : '')}</div>
      </div>`);
    } else if (t.requireAck) stats.push(stat('checkCircle', 'Ciente', t.ack, t.recips, t.recips === 1 ? 'aluno' : 'alunos'));
    const nao = t.nao
      ? html`<p class="ag-nao">${icon('alert')}<span><b>Não autoriza:</b> ${html.join(t.naoList.slice(0, 6).map((sid) => (Q.student(sid) || {}).name || 'Aluno'), ', ')}${t.naoList.length > 6 ? ` e mais ${t.naoList.length - 6}` : ''}</span></p>`
      : '';
    return html`<div class="ag-track ${withButton ? '' : 'no-btn'}">
      <div class="ag-stats">${stats}</div>
      ${withButton ? html`<button type="button" class="btn sm ag-track-btn" data-ag-act="respostas">${icon('users')}Ver respostas</button>` : ''}
      ${nao}
    </div>`;
  };

  /** Cartão de um envio, para a equipe. */
  const cardHTML = (card, { classFilter = '' } = {}) => {
    const d = card.lead;
    const st = STATUS[d.status] || STATUS.publicado;
    const cls = classNames(card.items);
    const cancel = d.status === 'cancelado';
    const isAuthor = d.authorId === me().id;
    const approver = d.status === 'pendente' && can('diario.aprovar') && card.items.some((x) => reachable(x.classId));
    const who = recipientsText(card.items);
    const notes = [];
    if (d.status === 'rascunho') {
      if (d.returnedBy) notes.push(html`<div class="ag-note warn">${icon('undo')}<span><b>Devolvido por ${authorName(d.returnedBy)}</b>${d.cancelReason ? html`: ${clause(d.cancelReason)}` : ''}. Ajuste e envie de novo.</span></div>`);
      else notes.push(html`<div class="ag-note">${icon('pencil')}<span>Rascunho: só você vê. As famílias recebem quando você enviar.</span></div>`);
    } else if (d.status === 'pendente') notes.push(html`<div class="ag-note warn">${icon('clock')}<span>${approver && !isAuthor ? html`Enviado por <b>${authorName(d.authorId)}</b>. Revise e aprove para chegar às famílias.` : 'Aguardando a aprovação da coordenação. As famílias recebem depois de aprovado.'}</span></div>`);
    else if (d.status === 'agendado') notes.push(html`<div class="ag-note info">${icon('clock')}<span>Será enviado às famílias <b>${U.fmtInstant(d.publishAt)}</b>.</span></div>`);
    else if (cancel) notes.push(html`<div class="ag-note bad">${icon('x')}<span>Cancelado${d.canceledAt ? ` ${at(d.canceledAt)}` : ''}${d.cancelReason ? html`: ${clause(d.cancelReason)}` : ''}. A família vê o item riscado.</span></div>`);
    if (d.type === 'ocorrencia' && d.internal) notes.push(html`<div class="ag-note">${icon('lock')}<span>Registro interno: a família não vê.</span></div>`);
    let actions = '';
    if (approver) {
      actions = html`<div class="ag-card-bar"><button type="button" class="btn primary sm" data-ag-act="aprovar">${icon('check')}Aprovar e enviar</button>
        <button type="button" class="btn sm" data-ag-act="editar">${icon('pencil')}Revisar texto</button>
        ${!isAuthor ? html`<button type="button" class="btn sm ghost" data-ag-act="cancelar">${icon('undo')}Devolver</button>` : ''}</div>`;
    } else if (d.status === 'rascunho' && isAuthor) {
      actions = html`<div class="ag-card-bar"><button type="button" class="btn primary sm" data-ag-act="editar">${icon('pencil')}Continuar e enviar</button><button type="button" class="btn sm ghost danger" data-ag-act="cancelar">${icon('trash')}Excluir rascunho</button></div>`;
    }
    const showMenu = !d._old && (canEdit(d) || canManage(d) || d.status === 'publicado' || can('diario.publicar'));
    return html`<article class="card ag-card ${toneOf(d)} is-${d.status}" data-ag-card="${card.key}" data-ag-cls="${classFilter}">
      <div class="ag-card-main">
        ${itemIcon(d)}
        <div class="ag-card-body">
          <div class="ag-kicker"><b>${typeLabel(d.type)}</b>${d.type === 'ocorrencia' ? html`<span class="ag-occ ${d.category === 'elogio' ? 'ok' : ''}">${occLabel(d.category)}</span>` : ''}${subjectTag(d.subjectId)}
            <span class="ag-to">${icon('layers')}${cls.join(', ') || 'Turma'}${who !== 'turma toda' ? html` · ${who}` : ''}</span></div>
          <h3 class="ag-title">${d.title}</h3>
          ${d.body ? html`<p class="ag-text">${textHTML(d.body)}</p>` : ''}
          ${attachList(d.attachments)}
          <div class="ag-meta">${dueBits(d)}<span>${d.status === 'publicado' || cancel ? 'Enviado' : 'Criado'} por ${authorName(d.authorId)} · ${U.fmtInstant(sentAt(d))}</span>${d.editedAt ? html`<span>editado ${U.fmtInstant(d.editedAt)}</span>` : ''}${d._old ? html`<span>${icon('history')}histórico</span>` : ''}</div>
          ${notes}
        </div>
        <div class="ag-card-side">${d.status !== 'publicado' ? UI.pill(st.label, st.tone) : ''}${showMenu ? html`<button type="button" class="icon-btn sm" data-ag-act="menu" aria-label="Mais ações: ${d.title}" aria-haspopup="menu">${icon('dots')}</button>` : ''}</div>
      </div>
      ${d.status === 'publicado' && !(d.type === 'ocorrencia' && d.internal) ? trackHTML(card.items) : ''}
      ${actions}
    </article>`;
  };

  // =====================================================================
  // Ações sobre um envio (equipe)
  // =====================================================================
  const cardFromEl = (el) => {
    const c = el.closest('[data-ag-card]');
    return c ? findCard(c.dataset.agCard, c.dataset.agCls || '') : null;
  };

  const approveCard = async (card, btn) => {
    const ids = card.items.filter((d) => d.status === 'pendente' && reachable(d.classId)).map((d) => d.id);
    for (const id of ids) if (!(await UI.act('diary.approve', { id }, { btn }))) return;
    const after = Q.diaryItem(ids[0]);
    UI.toast(after && after.status === 'agendado' ? `Aprovado. Será enviado ${U.fmtInstant(after.publishAt)}.` : 'Aprovado: as famílias já podem ver.', { ic: 'checkCircle' });
  };

  /** Pede o motivo (e, se for o caso, o alcance) do cancelamento. Resolve {reason, all} ou null. */
  const askCancel = ({ title, text, okLabel, reasonLabel, required, scope }) =>
    new Promise((resolve) => {
      let out = null;
      UI.modal({
        title,
        size: 'sm',
        guard: false,
        body: html`<div class="stack ag-cancel">
          <p class="muted">${text}</p>
          ${scope
            ? html`<div class="field"><span class="label">Onde cancelar</span><div class="ag-radios">
                <label class="check"><input type="radio" name="ag-scope" value="one" checked><span>Só em ${scope.here}</span></label>
                <label class="check"><input type="radio" name="ag-scope" value="all"><span>Em todo o envio (${scope.all})</span></label></div></div>`
            : ''}
          <div class="field" data-field="reason"><label for="ag-reason">${reasonLabel}${required ? html` <span class="req">*</span>` : ''}</label>
            <textarea id="ag-reason" class="input" rows="3" maxlength="200" placeholder="Ex.: passeio adiado por causa da chuva"></textarea>
            <span class="hint">${required ? 'Aparece para quem recebeu, junto do item riscado.' : 'Opcional.'}</span></div>
        </div>`,
        foot: html`<button type="button" class="btn" data-close>Voltar</button><button type="button" class="btn danger solid" data-ok>${okLabel}</button>`,
        onMount(el, api) {
          const ok = UI.$('[data-ok]', el);
          ok.addEventListener('click', () => {
            const reason = UI.$('#ag-reason', el).value.trim();
            if (required && reason.length < 3) return UI.markField(el, 'reason', 'Escreva o motivo (pelo menos 3 letras).');
            const sc = UI.$('input[name="ag-scope"]:checked', el);
            out = { reason, all: sc ? sc.value === 'all' : true };
            api.close();
          });
        },
        onClose: () => resolve(out),
      });
    });

  const cancelCard = async (card) => {
    const d = card.lead;
    const label = typeLabel(d.type);
    const whole = wholeGroup(d);
    const mineAuthor = d.authorId === me().id;
    if (NEVER_SENT.has(d.status) && mineAuthor) {
      // nada chegou às famílias: apaga direto (dá para desfazer)
      await UI.act('diary.cancel', { id: d.id, group: whole.length > 1, reason: '' }, { ok: d.status === 'rascunho' ? 'Rascunho excluído' : d.status === 'agendado' ? 'Envio agendado cancelado' : 'Envio cancelado antes da aprovação' });
      return;
    }
    if (NEVER_SENT.has(d.status)) {
      const r = await askCancel({
        title: 'Devolver para ajustes?',
        text: html`O item volta para os rascunhos de <b>${Q.userName(d.authorId)}</b>, com o seu comentário. As famílias não recebem nada.`,
        okLabel: 'Devolver',
        reasonLabel: 'O que precisa mudar',
        required: true,
      });
      if (!r) return;
      await UI.act('diary.cancel', { id: d.id, group: whole.length > 1, reason: r.reason }, { ok: `Devolvido para ${U.firstName(Q.userName(d.authorId))}` });
      return;
    }
    const classes = classNames(whole);
    const scope = whole.length > card.items.length && card.items.length === 1 ? { here: classNames(card.items)[0] || 'nesta turma', all: `${classes.length} turmas` } : null;
    const r = await askCancel({
      title: `Cancelar ${fem(d.type) ? 'esta' : 'este'} ${label.toLowerCase()}?`,
      text: html`“${d.title}” continua aparecendo para as famílias, mas <b>riscado</b> e com o motivo. Você pode desfazer logo em seguida.`,
      okLabel: 'Cancelar envio',
      reasonLabel: 'Motivo do cancelamento',
      required: true,
      scope,
    });
    if (!r) return;
    const group = scope ? r.all : card.items.length > 1;
    await UI.act('diary.cancel', { id: d.id, group, reason: r.reason }, { ok: `${label} ${gw(d.type, 'cancelado')}. As famílias veem o item riscado.` });
  };

  const cardMenu = (anchor, card) => {
    const d = card.lead;
    const items = [];
    if (canEdit(d)) items.push({ label: d.status === 'rascunho' ? 'Continuar editando' : 'Editar', icon: 'pencil', fn: () => openComposer({ edit: card }) });
    else if (canManage(d) && d.type === 'autorizacao' && d.status === 'publicado' && hasAnswers(d))
      items.push({ label: 'Editar', icon: 'pencil', hint: 'Já tem respostas: cancele e envie outra', fn: () => UI.toast('Esta autorização já tem respostas. Para mudar, cancele e envie uma nova (use "Usar como modelo").', { ic: 'info', ms: 7000 }) });
    if (d.status === 'publicado' && !(d.type === 'ocorrencia' && d.internal)) items.push({ label: canPaper(d) ? 'Respostas e ciente em papel' : 'Ver respostas', icon: 'users', fn: () => openResponses(card.items) });
    if (allowedTypes().includes(d.type)) items.push({ label: 'Usar como modelo', icon: 'copy', hint: 'Novo envio com o mesmo texto', fn: () => openComposer({ copyFrom: d }) });
    if (canManage(d) && d.status !== 'cancelado') {
      items.push('-');
      const never = NEVER_SENT.has(d.status);
      items.push({ label: never ? (d.authorId === me().id ? (d.status === 'rascunho' ? 'Excluir rascunho' : 'Cancelar envio') : 'Devolver ao autor') : 'Cancelar envio…', icon: never && d.authorId !== me().id ? 'undo' : 'trash', danger: true, fn: () => cancelCard(card) });
    }
    if (!items.length) items.push({ label: 'Nada a fazer por aqui', icon: 'info', fn: () => {} });
    UI.menu(anchor, items);
  };

  /** Liga as ações dos cartões da equipe dentro de root. */
  const bindCards = (root) =>
    root.addEventListener('click', (e) => {
      const b = e.target.closest('[data-ag-act]');
      if (!b || !root.contains(b)) return;
      const card = cardFromEl(b);
      if (!card) return UI.toast('Este item mudou. A tela foi atualizada.', { ic: 'info' });
      const a = b.dataset.agAct;
      if (a === 'menu') cardMenu(b, card);
      else if (a === 'respostas') openResponses(card.items);
      else if (a === 'aprovar') approveCard(card, b);
      else if (a === 'editar') openComposer({ edit: card });
      else if (a === 'cancelar') cancelCard(card);
    });

  // =====================================================================
  // Respostas por aluno/responsável e ciente em papel
  // =====================================================================
  const paperAck = (d, s, after) => {
    const entries = Q.acks(d.id)[s.id] || {};
    const free = (s.guardians || []).filter((g) => !(entries[g.id] && entries[g.id].origin === 'portal'));
    if (!free.length) return UI.toast('Os responsáveis já responderam pelo portal. A resposta deles não pode ser substituída.', { ic: 'info' });
    const auth = d.type === 'autorizacao';
    const defs = [
      { name: 'guardianId', label: 'Responsável que assinou', type: 'select', required: true, full: true, options: free.map((g) => [g.id, `${g.name} (${g.relation || 'Responsável'})`]) },
      auth ? { name: 'answer', label: 'Resposta no papel', type: 'chips', required: true, full: true, options: [['sim', 'Autoriza', 3], ['nao', 'Não autoriza', 8]] } : null,
      { name: 'note', label: 'Observação', type: 'textarea', rows: 2, maxlength: 500, full: true, placeholder: 'Ex.: bilhete assinado entregue pela mãe na entrada.' },
    ].filter(Boolean);
    UI.modal({
      title: auth ? 'Registrar resposta em papel' : 'Registrar ciente em papel',
      sub: html`${s.name} · “${d.title}”`,
      size: 'sm',
      body: html`<form class="form-grid" novalidate>${UI.fields(defs, { guardianId: free[0].id })}<button type="submit" hidden></button></form>
        <p class="small muted ag-paper-hint">${icon('info')} Use quando a família respondeu no bilhete. O que a família responder pelo portal vale mais e nunca é apagado.</p>`,
      foot: html`<button type="button" class="btn" data-close>Cancelar</button><button type="button" class="btn primary" data-ok>${icon('check')}Registrar</button>`,
      onMount(el, api) {
        const form = UI.$('form', el);
        const go = async (e) => {
          e && e.preventDefault();
          const v = UI.readForm(form, defs);
          if (!UI.validate(form, defs, v)) return;
          const res = await UI.act('diary.ack', { itemId: d.id, studentId: s.id, guardianId: v.guardianId, answer: auth ? v.answer : undefined, note: v.note }, { btn: UI.$('[data-ok]', el), form, ok: auth ? 'Resposta em papel registrada' : 'Ciente em papel registrado' });
          if (!res) return;
          api.close();
          after && after();
        };
        form.addEventListener('submit', go);
        UI.$('[data-ok]', el).addEventListener('click', go);
      },
    });
  };

  const respRows = (items) => {
    const rows = [];
    for (const d of items) {
      if (d._old) continue;
      for (const sid of d.recipients || []) {
        const s = Q.student(sid);
        rows.push({ d, sid, s, name: s ? s.name : 'Aluno' });
      }
    }
    return rows.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  };
  const rowState = (r) => {
    const { d, sid, s } = r;
    const entries = Q.acks(d.id)[sid] || {};
    const users = famUsers(s);
    const reads = Store.reads[d.id] || {};
    const viewed = users.some((u) => reads[u]);
    const answered = d.type === 'autorizacao' ? ['sim', 'nao'].includes(Q.authorizationAnswer(d.id, sid)) : Object.keys(entries).length > 0;
    return { entries, users, reads, viewed, answered, ans: d.type === 'autorizacao' ? Q.authorizationAnswer(d.id, sid) : null, portal: users.length > 0 };
  };

  const openResponses = (items) => {
    const lead = items[0];
    const auth = lead.type === 'autorizacao';
    const asks = auth || items.some((d) => d.requireAck);
    let filter = 'todos';
    const multi = new Set(items.map((d) => d.classId)).size > 1;
    const body = () => {
      const rows = respRows(items).map((r) => ({ ...r, st: rowState(r) }));
      const counts = {
        todos: rows.length,
        sem: rows.filter((r) => asks && !r.st.answered).length,
        nao: rows.filter((r) => r.st.ans === 'nao').length,
        naoviu: rows.filter((r) => r.st.portal && !r.st.viewed).length,
        semportal: rows.filter((r) => !r.st.portal).length,
      };
      const opts = [['todos', `Todos (${counts.todos})`]];
      if (asks) opts.push(['sem', `${auth ? 'Sem resposta' : 'Sem ciente'} (${counts.sem})`]);
      if (auth) opts.push(['nao', `Não autoriza (${counts.nao})`]);
      opts.push(['naoviu', `Não visualizou (${counts.naoviu})`]);
      if (counts.semportal) opts.push(['semportal', `Sem portal (${counts.semportal})`]);
      const shown = rows.filter((r) => filter === 'todos' || (filter === 'sem' && asks && !r.st.answered) || (filter === 'nao' && r.st.ans === 'nao') || (filter === 'naoviu' && r.st.portal && !r.st.viewed) || (filter === 'semportal' && !r.st.portal));
      return html`<div class="ag-resp-wrap">
        ${trackHTML(items, { withButton: false })}
        <div class="ag-resp-filter">${seg(opts, filter, 'data-ag-rf')}</div>
        ${shown.length
          ? html`<ul class="ag-resp-list">${shown.map((r) => {
              const { d, sid, s, st } = r;
              const guardians = (s && s.guardians) || [];
              const lines = guardians.map((g) => {
                const a = st.entries[g.id];
                const read = g.userId && !g.bloqueado ? st.reads[g.userId] : null;
                return html`<div class="ag-resp-line">
                  <span class="ag-gname">${g.relation || 'Responsável'} · ${U.shortName(g.name)}</span>
                  ${g.userId && !g.bloqueado
                    ? read
                      ? html`<span class="ag-bit ok">${icon('eye')}Viu${at(read) ? ` ${at(read)}` : ''}</span>`
                      : html`<span class="ag-bit">${icon('eyeOff')}Não visualizou</span>`
                    : html`<span class="ag-bit muted">${icon('lock')}${g.bloqueado ? 'Acesso bloqueado' : 'Sem acesso ao portal'}</span>`}
                  ${a
                    ? html`<span class="ag-bit ${a.answer === 'nao' ? 'bad' : 'ok'}">${icon(a.answer === 'nao' ? 'x' : 'checkCircle')}${a.answer === 'sim' ? 'Autoriza' : a.answer === 'nao' ? 'Não autoriza' : 'Ciente'}${withAt(a.at)}${a.origin === 'escola' ? html` · em papel (${U.firstName(Q.userName(a.by, 'escola'))})` : ''}</span>${a.note ? html`<span class="ag-bit-note">“${a.note}”</span>` : ''}`
                    : ''}
                </div>`;
              });
              const pill = auth ? (st.ans === 'nao' ? UI.pill('Não autoriza', 'bad') : st.ans === 'sim' ? UI.pill('Autoriza', 'ok') : UI.pill('Sem resposta', 'warn')) : asks ? (st.answered ? UI.pill('Ciente', 'ok') : UI.pill('Sem ciente', 'warn')) : st.viewed ? UI.pill('Visualizou', 'info') : '';
              const paper = canPaper(d) && s && guardians.some((g) => !(st.entries[g.id] && st.entries[g.id].origin === 'portal'));
              return html`<li class="ag-resp ${st.ans === 'nao' ? 'is-nao' : ''}">
                <div class="person">${UI.avatar(r.name, 'sm', s && s.photo)}<div><a class="person-name" href="#alunos/${sid}">${r.name}</a>${multi ? html`<div class="person-sub">${(Q.klass(d.classId) || {}).name || ''}</div>` : ''}</div></div>
                <div class="ag-resp-g">${lines.length ? lines : html`<span class="ag-bit muted">Sem responsável cadastrado</span>`}</div>
                <div class="ag-resp-end">${pill}${paper ? html`<button type="button" class="btn sm" data-ag-paper="${d.id}|${sid}">${icon('file')}Em papel</button>` : ''}</div>
              </li>`;
            })}</ul>`
          : html`<p class="muted small ag-resp-empty">Ninguém nesta situação.</p>`}
      </div>`;
    };
    const missing = () =>
      respRows(items)
        .filter((r) => {
          const st = rowState(r);
          return asks ? !st.answered : st.portal && !st.viewed;
        })
        .map((r) => r.name);
    UI.modal({
      title: lead.title,
      sub: html`${typeLabel(lead.type)} · ${classNames(items).join(', ')} · enviado ${U.fmtInstant(sentAt(lead))}`,
      size: 'lg',
      body: body(),
      foot: html`<button type="button" class="btn left" data-ag-copy>${icon('copy')}${asks ? 'Copiar nomes sem resposta' : 'Copiar nomes de quem não viu'}</button><button type="button" class="btn primary" data-close>Fechar</button>`,
      onMount(el, api) {
        const redraw = () => {
          const sc = UI.$('.modal-body', el).scrollTop;
          api.setBody(body());
          UI.$('.modal-body', el).scrollTop = sc;
        };
        el.addEventListener('click', (e) => {
          const f = e.target.closest('[data-ag-rf]');
          if (f) {
            filter = f.dataset.agRf;
            return redraw();
          }
          const p = e.target.closest('[data-ag-paper]');
          if (p) {
            const [id, sid] = p.dataset.agPaper.split('|');
            const d = items.find((x) => x.id === id);
            const s = Q.student(sid);
            if (d && s) paperAck(Q.diaryItem(id) || d, s, redraw);
            return;
          }
          if (e.target.closest('[data-ag-copy]')) {
            const names = missing();
            if (!names.length) return UI.toast(asks ? 'Todos já responderam.' : 'Todas as famílias com portal já viram.', { ic: 'checkCircle' });
            UI.copy(`${lead.title} — ${asks ? 'sem resposta' : 'não visualizaram'} (${names.length}):\n${names.join('\n')}`, `${U.plural(names.length, 'nome copiado', 'nomes copiados')}`);
          }
          if (e.target.closest('a.person-name')) api.close();
        });
      },
    });
  };

  // =====================================================================
  // Compor (novo, editar, usar como modelo)
  // =====================================================================
  const allowedTypes = () => {
    const out = [];
    if (can('diario.publicar')) out.push('dever', 'recado', 'lembrete');
    if (can('diario.publicar') && can('diario.autorizacoes')) out.push('autorizacao');
    if (can('diario.ocorrencias')) out.push('ocorrencia');
    return out;
  };
  /** Turmas em que posso publicar (as minhas primeiro). */
  const pubClasses = () => {
    const ids = new Set(me().classIds || []);
    return Q.workClasses().filter((c) => ids.has(c.id));
  };
  const PLACEHOLDER = {
    dever: ['Ex.: Exercícios das páginas 48 e 49', 'O que fazer, onde (livro, caderno, folha) e como entregar.'],
    recado: ['Ex.: Material para a aula de Artes', 'Escreva o recado para as famílias.'],
    lembrete: ['Ex.: Prova de Ciências na quinta', 'Detalhes (opcional): conteúdo, o que trazer…'],
    autorizacao: ['Ex.: Passeio ao Museu Catavento', 'Data, horário de saída e volta, transporte, custo, o que levar.'],
    ocorrencia: ['Ex.: Não trouxe o material de Matemática', 'Descreva o que aconteceu, de forma objetiva e respeitosa.'],
  };

  const guessSubject = (f) => {
    if (!['dever', 'lembrete'].includes(f.type) || !f.classIds.length) return '';
    const subs = Q.classSubjects(f.classIds[0]).filter((s) => Q.teacherOf(f.classIds[0], s.id) === me().id);
    return subs.length === 1 ? subs[0].id : '';
  };

  const openComposer = (o = {}) => {
    const types = allowedTypes();
    if (!types.length) return UI.toast('Seu acesso não permite escrever na agenda. Fale com a direção.', { tone: 'bad' });
    const classes = pubClasses();
    if (!classes.length) return UI.toast('Você ainda não está em nenhuma turma. Peça à coordenação para fazer o vínculo.', { tone: 'bad' });
    const edit = o.edit ? o.edit : null;
    const editItems = edit ? wholeGroup(edit.lead).filter((d) => d.status !== 'cancelado') : [];
    let f;
    if (edit) {
      const d = edit.lead;
      f = {
        mode: 'edit', type: d.type, target: d.studentId ? 'alunos' : 'turma', classIds: [...new Set(editItems.map((x) => x.classId))], studentIds: editItems.map((x) => x.studentId).filter(Boolean),
        subjectId: d.subjectId || '', title: d.title, body: d.body || '', date: d.date, due: d.due || '', respondBy: d.respondBy || '', requireAck: !!d.requireAck,
        category: d.category || 'comportamento', internal: !!d.internal, attachments: (d.attachments || []).slice(), send: d.publishAt && NEVER_SENT.has(d.status) ? 'agendar' : 'agora',
        publishAt: d.publishAt ? localInput(new Date(d.publishAt)) : defaultSchedule(), status: d.status,
      };
    } else {
      const src = o.copyFrom || null;
      const stu = o.studentId ? Q.student(o.studentId) : null;
      let type = src ? src.type : types.includes(o.type) ? o.type : stu ? (types.includes('recado') ? 'recado' : types[0]) : types[0];
      if (!types.includes(type)) type = types[0];
      const pref = (stu && stu.classId) || o.classId || (src && src.classId) || PageState.get('agenda', {}).classId || '';
      const classIds = classes.some((c) => c.id === pref) ? [pref] : classes.length === 1 ? [classes[0].id] : [];
      f = {
        mode: src ? 'copy' : 'new', type, target: stu || type === 'ocorrencia' ? 'alunos' : 'turma', classIds, studentIds: stu && classIds[0] === stu.classId ? [stu.id] : [],
        subjectId: src && src.subjectId ? src.subjectId : '', title: src ? src.title : '', body: src ? src.body || '' : '', date: o.date && o.date >= today() ? o.date : today(), due: '', respondBy: '',
        requireAck: src ? !!src.requireAck : type === 'recado' || type === 'lembrete', category: (src && src.category) || 'comportamento', internal: false, attachments: [], send: 'agora', publishAt: defaultSchedule(), status: null,
      };
      if (!f.subjectId) f.subjectId = guessSubject(f);
    }
    let q = '';
    let previewOpen = window.innerWidth > 900;

    const needsApproval = () => !!Q.settings().diaryApproval && !can('diario.aprovar') && !(f.type === 'ocorrencia' && f.internal);
    const sendable = () => f.mode !== 'edit' || NEVER_SENT.has(f.status);
    const primaryLabel = () => {
      if (f.mode === 'edit' && !NEVER_SENT.has(f.status)) return 'Salvar alterações';
      if (f.type === 'ocorrencia') return f.internal ? 'Salvar registro interno' : 'Registrar e avisar a família';
      if (f.mode === 'edit' && f.status === 'pendente' && can('diario.aprovar')) return f.send === 'agendar' ? 'Aprovar e agendar' : 'Aprovar e enviar';
      if (needsApproval()) return f.mode === 'edit' && f.status === 'pendente' ? 'Salvar alterações' : 'Enviar para aprovação';
      if (f.send === 'agendar') return 'Agendar envio';
      return 'Enviar às famílias';
    };
    const subjectsFor = () => {
      const map = new Map();
      for (const cid of f.classIds) for (const s of Q.classSubjects(cid)) map.set(s.id, s);
      return [...map.values()];
    };
    const studentList = () => (f.classIds[0] ? Q.students({ classId: f.classIds[0] }) : []);

    const previewHTML = () => {
      if (f.type === 'ocorrencia' && f.internal) return html`<p class="muted small">${icon('lock')} Registro interno: a família não vê esta ocorrência.</p>`;
      const stu = f.studentIds.length ? Q.student(f.studentIds[0]) : null;
      const item = {
        id: 'preview', type: f.type, title: f.title || 'Título do item', body: f.body, date: f.date || today(), due: f.due || null, respondBy: f.respondBy || null,
        requireAck: f.type === 'autorizacao' || f.type === 'ocorrencia' || f.requireAck, category: f.category, subjectId: f.subjectId || null, attachments: f.attachments,
        authorId: edit ? edit.lead.authorId : me().id, status: 'publicado', createdAt: new Date().toISOString(), recipients: [],
      };
      return famCard(item, stu || { id: '', name: 'Nome do aluno' }, { preview: true, showChild: true });
    };

    const bodyHTML = () => {
      const t = f.type;
      const locked = f.mode === 'edit';
      const subs = ['dever', 'lembrete'].includes(t) ? subjectsFor() : [];
      const list = studentList();
      const lessonDay = t === 'dever' && f.subjectId && f.classIds[0] ? nextLesson(f.classIds[0], f.subjectId, f.date || today()) : null;
      const nsd = nextSchoolDay(f.date || today());
      const subj = f.subjectId ? Q.subject(f.subjectId) : null;
      const [phTitle, phBody] = PLACEHOLDER[t];
      return html`<div class="ag-compose" data-ag-compose>
        ${locked
          ? html`<div class="ag-locked">${typeIcon(t)}<div><b>${typeLabel(t)}</b><div class="small muted">${classNames(editItems).join(', ')} · ${recipientsText(editItems)}${editItems.length > 1 ? ` · as alterações valem para os ${editItems.length} itens deste envio` : ''}</div></div></div>`
          : html`<section class="ag-sec">
              <span class="label" id="ag-type-l">O que você quer enviar?</span>
              <div class="ag-types" role="radiogroup" aria-labelledby="ag-type-l">${types.map(
                (k) => html`<label class="ag-type-opt ${typeInfo(k).tone}"><input type="radio" name="ag-type" value="${k}" ${k === t ? raw('checked') : ''}>${icon(typeInfo(k).icon)}<span>${typeLabel(k)}</span></label>`,
              )}</div>
            </section>
            <section class="ag-sec">
              <span class="label">${t === 'ocorrencia' ? 'Aluno' : 'Para quem'}</span>
              ${t !== 'ocorrencia' ? seg([['turma', 'Turma toda'], ['alunos', 'Alunos escolhidos']], f.target, 'data-ag-target') : ''}
              ${f.target === 'turma' && t !== 'ocorrencia'
                ? html`<div class="field" data-field="classIds"><div class="chips ag-class-chips" role="group" aria-label="Turmas">${classes.map(
                    (c) => html`<label class="chip"><input type="checkbox" data-ag-class value="${c.id}" ${f.classIds.includes(c.id) ? raw('checked') : ''}>${c.name}</label>`,
                  )}</div><span class="hint">${f.classIds.length > 1 ? `Vai para ${f.classIds.length} turmas: cada uma recebe o seu item.` : 'Escolha uma ou mais turmas.'}</span></div>`
                : html`<div class="ag-pick">
                    <div class="field" data-field="classOne"><label for="ag-class1">Turma</label><select id="ag-class1" class="input" data-ag-class1>${[html`<option value="">Escolha a turma…</option>`, ...classes.map((c) => html`<option value="${c.id}" ${f.classIds[0] === c.id ? raw('selected') : ''}>${c.name}</option>`)]}</select></div>
                    ${f.classIds[0]
                      ? html`<div class="field" data-field="studentIds">
                          <div class="ag-pick-head"><label for="ag-q">${t === 'ocorrencia' ? 'Qual aluno?' : 'Quais alunos?'}</label>${t !== 'ocorrencia' ? html`<span class="small muted" data-ag-count>${U.plural(f.studentIds.length, 'escolhido', 'escolhidos')}</span>` : ''}</div>
                          <div class="search-box"><span>${icon('search')}</span><input id="ag-q" class="input" placeholder="Buscar aluno pelo nome" autocomplete="off" data-nodirty data-ag-q value="${q}"></div>
                          <div class="ag-students" role="${t === 'ocorrencia' ? 'radiogroup' : 'group'}" aria-label="Alunos">${list.length
                            ? list.map(
                                (s) => html`<label class="ag-stu" data-name="${U.norm(s.name)}"><input type="${t === 'ocorrencia' ? 'radio' : 'checkbox'}" name="ag-stu" value="${s.id}" ${f.studentIds.includes(s.id) ? raw('checked') : ''}>${UI.avatar(s.name, 'sm', s.photo)}<span>${s.name}</span></label>`,
                              )
                            : html`<p class="muted small">Nenhum aluno ativo nesta turma.</p>`}</div>
                          ${t !== 'ocorrencia' ? html`<span class="hint">Cada aluno escolhido recebe o seu próprio item (a família de um não vê a do outro).</span>` : ''}
                        </div>`
                      : ''}
                  </div>`}
            </section>`}

        ${t === 'ocorrencia'
          ? html`<section class="ag-sec"><div class="field" data-field="category"><span class="label" id="ag-cat-l">Tipo de ocorrência</span><div class="chips" role="radiogroup" aria-labelledby="ag-cat-l">${Object.entries(Q.OCCURRENCE_CATEGORIES).map(
              ([k, l]) => html`<label class="chip ${k === 'elogio' ? 'ag-chip-ok' : ''}"><input type="radio" name="ag-cat" value="${k}" ${f.category === k ? raw('checked') : ''}>${k === 'elogio' ? icon('star') : ''}${l}</label>`,
            )}</div></div></section>`
          : ''}

        <section class="ag-sec ag-grid">
          ${subs.length
            ? html`<div class="field full" data-field="subjectId"><label for="ag-subject">Disciplina${t === 'lembrete' ? html` <span class="muted small">(opcional)</span>` : ''}</label>
                <select id="ag-subject" class="input" data-k="subjectId">${[html`<option value="">${t === 'dever' ? 'Sem disciplina' : 'Nenhuma'}</option>`, ...subs.map((s) => html`<option value="${s.id}" ${f.subjectId === s.id ? raw('selected') : ''}>${s.name}</option>`)]}</select></div>`
            : ''}
          <div class="field full" data-field="title"><label for="ag-title">Título <span class="req">*</span></label><input id="ag-title" class="input" data-k="title" maxlength="140" value="${f.title}" placeholder="${phTitle}" autocomplete="off"></div>
          <div class="field full" data-field="body"><label for="ag-body">${t === 'lembrete' ? 'Detalhes' : 'Texto'}${t !== 'lembrete' ? html` <span class="req">*</span>` : ''}</label><textarea id="ag-body" class="input" data-k="body" rows="5" maxlength="5000" placeholder="${phBody}">${f.body}</textarea><span class="hint">Links (https://…) viram clicáveis para a família.</span></div>
          <div class="field" data-field="date"><label for="ag-date">Dia na agenda</label><input id="ag-date" class="input" type="date" data-k="date" value="${f.date}"></div>
          ${t === 'dever'
            ? html`<div class="field" data-field="due"><label for="ag-due">Entrega</label><input id="ag-due" class="input" type="date" data-k="due" value="${f.due}" min="${f.date}"></div>
              <div class="ag-quick full" role="group" aria-label="Sugestões de entrega">
                <button type="button" class="chip ${f.due === nsd ? 'on' : ''}" data-ag-due="${nsd}">Próximo dia de aula · ${shortDay(nsd)}</button>
                ${lessonDay && lessonDay !== nsd ? html`<button type="button" class="chip ${f.due === lessonDay ? 'on' : ''}" data-ag-due="${lessonDay}">Próxima aula de ${subj ? subj.name : 'disciplina'} · ${shortDay(lessonDay)}</button>` : ''}
                ${f.due ? html`<button type="button" class="chip" data-ag-due="">Sem data de entrega</button>` : ''}
              </div>`
            : t === 'lembrete'
              ? html`<div class="field" data-field="due"><label for="ag-due">Data do lembrete</label><input id="ag-due" class="input" type="date" data-k="due" value="${f.due}"><span class="hint">Ex.: o dia da prova ou do evento.</span></div>`
              : t === 'autorizacao'
                ? html`<div class="field" data-field="respondBy"><label for="ag-resp">Responder até <span class="req">*</span></label><input id="ag-resp" class="input" type="date" data-k="respondBy" value="${f.respondBy}" min="${today()}"><span class="hint">Depois dessa data a família não responde mais pelo portal.</span></div>`
                : html`<div></div>`}
        </section>

        <section class="ag-sec ag-opts">
          ${t === 'ocorrencia'
            ? html`<label class="check"><input type="checkbox" data-k="internal" ${f.internal ? raw('checked') : ''}><span><b>Só registro interno</b><br><span class="small muted">A família não vê. Fica na ficha do aluno para a equipe.</span></span></label>
              ${!f.internal ? html`<p class="small muted">${icon('checkCircle')} A família recebe e é convidada a dar ciente.</p>` : ''}`
            : t === 'autorizacao'
              ? html`<p class="small muted">${icon('shieldCheck')} Cada responsável responde “Autorizo” ou “Não autorizo”. Qualquer “não” prevalece e aparece em destaque para a escola.</p>`
              : html`<label class="check"><input type="checkbox" data-k="requireAck" ${f.requireAck ? raw('checked') : ''}><span><b>Pedir ciente da família</b><br><span class="small muted">A família toca em “Ciente” e você acompanha quem já leu.</span></span></label>`}
        </section>

        <section class="ag-sec">
          <div class="ag-attach-head"><span class="label">Anexos</span><button type="button" class="btn sm" data-ag-attach ${f.attachments.length >= 5 ? raw('disabled') : ''}>${icon('paperclip')}Anexar arquivo</button></div>
          ${f.attachments.length ? attachList(f.attachments, true) : html`<p class="small muted">PDF ou imagem (até 10 MB, no máximo 5).</p>`}
        </section>

        ${sendable() && t !== 'ocorrencia'
          ? html`<section class="ag-sec">
              <span class="label">Quando enviar</span>
              ${seg([['agora', 'Agora'], ['agendar', 'Agendar']], f.send, 'data-ag-send')}
              ${f.send === 'agendar' ? html`<div class="field ag-when" data-field="publishAt"><label for="ag-when">Enviar em</label><input id="ag-when" class="input" type="datetime-local" data-k="publishAt" value="${f.publishAt}" min="${localInput(new Date())}"></div>` : ''}
            </section>`
          : ''}

        ${needsApproval() && sendable() ? html`<div class="notice warn ag-approval">${icon('shieldCheck')}<span class="grow">Na sua escola, a coordenação revisa os envios. Este item vai para <b>aprovação</b> e chega às famílias depois de aprovado.</span></div>` : ''}

        <details class="ag-preview" ${previewOpen ? raw('open') : ''}>
          <summary>${icon('eye')}Prévia: como a família vai ver</summary>
          <div class="ag-preview-box" data-ag-preview>${previewHTML()}</div>
        </details>
      </div>`;
    };

    const footHTML = () =>
      html`<button type="button" class="btn" data-close>Cancelar</button>
        ${(f.mode !== 'edit' || f.status === 'rascunho') && f.type !== 'ocorrencia' ? html`<button type="button" class="btn" data-ag-draft>${icon('file')}Salvar rascunho</button>` : ''}
        <button type="button" class="btn primary" data-ag-submit>${icon(f.send === 'agendar' && sendable() ? 'clock' : f.type === 'ocorrencia' ? 'flag' : 'send')}<span>${primaryLabel()}</span></button>`;

    const title = edit ? (edit.lead.status === 'rascunho' ? 'Continuar rascunho' : `Editar ${typeLabel(f.type).toLowerCase()}`) : o.copyFrom ? 'Novo envio a partir de um modelo' : 'Escrever na agenda';
    UI.modal({
      title,
      sub: edit && edit.lead.status === 'publicado' ? 'As famílias veem a versão nova, marcada como "atualizado".' : 'Chega às famílias pelo Portal da família.',
      drawer: true,
      size: 'lg',
      body: bodyHTML(),
      foot: footHTML(),
      onMount(el, api) {
        api.wrap.classList.add('ag-dw');
        const root = () => UI.$('.modal-body', el);
        const sync = () => {
          UI.$$('[data-k]', el).forEach((i) => {
            f[i.dataset.k] = i.type === 'checkbox' ? i.checked : i.value;
          });
          const ty = UI.$('input[name="ag-type"]:checked', el);
          if (ty) f.type = ty.value;
          const cat = UI.$('input[name="ag-cat"]:checked', el);
          if (cat) f.category = cat.value;
          const det = UI.$('.ag-preview', el);
          if (det) previewOpen = det.open;
        };
        const redraw = () => {
          sync();
          const sc = root().scrollTop;
          const focusKey = document.activeElement && el.contains(document.activeElement) ? document.activeElement.id : '';
          api.setBody(bodyHTML());
          api.setFoot(footHTML());
          root().scrollTop = sc;
          if (focusKey) {
            const back = document.getElementById(focusKey);
            back && back.focus({ preventScroll: true });
          }
          filterStudents();
        };
        const updatePreview = U.debounce(() => {
          if (api.closed) return;
          sync();
          const box = UI.$('[data-ag-preview]', el);
          if (box) UI.setHTML(box, previewHTML());
        }, 160);
        const filterStudents = () => {
          const n = U.norm(q);
          UI.$$('.ag-stu', el).forEach((l) => (l.hidden = !!n && !l.dataset.name.includes(n)));
        };

        el.addEventListener('input', (e) => {
          const t = e.target;
          if (t.matches('[data-ag-q]')) {
            q = t.value;
            return filterStudents();
          }
          if (t.matches('[data-k]')) updatePreview();
        });
        el.addEventListener('change', (e) => {
          const t = e.target;
          if (t.name === 'ag-type') {
            sync();
            const prev = f.type;
            f.type = t.value;
            if (f.type === 'ocorrencia') {
              f.target = 'alunos';
              f.classIds = f.classIds.slice(0, 1);
              f.studentIds = f.studentIds.slice(0, 1);
            } else if (prev === 'ocorrencia') f.target = f.studentIds.length ? 'alunos' : 'turma';
            if (f.type === 'recado' || f.type === 'lembrete') f.requireAck = true;
            if (f.type === 'dever' && prev !== 'dever') f.requireAck = false;
            if (!f.subjectId) f.subjectId = guessSubject(f);
            return redraw();
          }
          if (t.matches('[data-ag-class]')) {
            sync();
            f.classIds = UI.$$('[data-ag-class]:checked', el).map((i) => i.value);
            if (f.subjectId && !subjectsFor().some((s) => s.id === f.subjectId)) f.subjectId = '';
            if (!f.subjectId) f.subjectId = guessSubject(f);
            return redraw();
          }
          if (t.matches('[data-ag-class1]')) {
            sync();
            f.classIds = t.value ? [t.value] : [];
            f.studentIds = [];
            q = '';
            if (f.subjectId && !subjectsFor().some((s) => s.id === f.subjectId)) f.subjectId = '';
            if (!f.subjectId) f.subjectId = guessSubject(f);
            return redraw();
          }
          if (t.name === 'ag-stu') {
            f.studentIds = UI.$$('input[name="ag-stu"]:checked', el).map((i) => i.value);
            const c = UI.$('[data-ag-count]', el);
            if (c) c.textContent = U.plural(f.studentIds.length, 'escolhido', 'escolhidos');
            UI.clearErrors(UI.$('[data-field="studentIds"]', el) || el);
            return updatePreview();
          }
          if (t.matches('[data-k="subjectId"]') || t.matches('[data-k="date"]')) return redraw();
          if (t.matches('[data-k="internal"]')) return redraw();
          if (t.name === 'ag-cat' || t.matches('[data-k]')) updatePreview();
        });
        el.addEventListener('toggle', (e) => {
          if (e.target.matches && e.target.matches('.ag-preview')) previewOpen = e.target.open;
        }, true);
        el.addEventListener('click', async (e) => {
          const tg = e.target.closest('[data-ag-target]');
          if (tg) {
            sync();
            f.target = tg.dataset.agTarget;
            if (f.target === 'alunos') f.classIds = f.classIds.slice(0, 1);
            else f.studentIds = [];
            return redraw();
          }
          const sd = e.target.closest('[data-ag-send]');
          if (sd) {
            sync();
            f.send = sd.dataset.agSend;
            return redraw();
          }
          const du = e.target.closest('[data-ag-due]');
          if (du) {
            sync();
            f.due = du.dataset.agDue;
            api.setDirty(true);
            return redraw();
          }
          if (e.target.closest('[data-ag-attach]')) {
            sync();
            const files = await UI.pickFiles();
            files.forEach((x) => uploaded.set(x.id, x));
            if (!files.length || api.closed) return;
            f.attachments = f.attachments.concat(files.map((x) => x.id)).slice(0, 5);
            api.setDirty(true);
            return redraw();
          }
          const rm = e.target.closest('[data-remove-file]');
          if (rm) {
            sync();
            f.attachments = f.attachments.filter((id) => id !== rm.dataset.removeFile);
            api.setDirty(true);
            return redraw();
          }
          const sub = e.target.closest('[data-ag-submit]');
          if (sub) return submit(false, sub);
          const dr = e.target.closest('[data-ag-draft]');
          if (dr) return submit(true, dr);
        });
        filterStudents();

        const check = (draft) => {
          const errs = [];
          if (!f.title.trim()) errs.push(['title', 'Escreva um título.']);
          if (f.type !== 'lembrete' && !f.body.trim()) errs.push(['body', 'Escreva o texto que a família vai ler.']);
          if (f.mode !== 'edit') {
            if (f.type === 'ocorrencia') {
              if (!f.classIds.length) errs.push(['classOne', 'Escolha a turma.']);
              else if (f.studentIds.length !== 1) errs.push(['studentIds', 'Escolha o aluno.']);
            } else if (f.target === 'turma') {
              if (!f.classIds.length) errs.push(['classIds', 'Escolha pelo menos uma turma.']);
            } else if (!f.classIds.length) errs.push(['classOne', 'Escolha a turma.']);
            else if (!f.studentIds.length) errs.push(['studentIds', 'Escolha pelo menos um aluno.']);
          }
          if (!f.date || !U.isValidDate(f.date)) errs.push(['date', 'Informe o dia.']);
          if (f.due && !U.isValidDate(f.due)) errs.push(['due', 'Data inválida.']);
          else if (f.type === 'dever' && f.due && f.date && f.due < f.date) errs.push(['due', 'A entrega não pode ser antes do dia em que o dever foi passado.']);
          if (f.type === 'autorizacao') {
            if (!f.respondBy) errs.push(['respondBy', 'Até quando a família pode responder?']);
            else if (!U.isValidDate(f.respondBy)) errs.push(['respondBy', 'Data inválida.']);
            else if (f.respondBy < today() && f.mode !== 'edit') errs.push(['respondBy', 'Escolha uma data a partir de hoje.']);
          }
          if (!draft && sendable() && f.type !== 'ocorrencia' && f.send === 'agendar') {
            const at = Date.parse(f.publishAt);
            if (!f.publishAt || isNaN(at)) errs.push(['publishAt', 'Escolha o dia e a hora do envio.']);
            else if (at <= Date.now() + 60000) errs.push(['publishAt', 'Escolha um horário no futuro.']);
          }
          return errs;
        };

        const submit = async (draft, btn) => {
          sync();
          const r = root();
          UI.clearErrors(r);
          const errs = check(draft);
          if (errs.length) {
            let first = true;
            for (const [k, m] of errs) {
              if (UI.markField(r, k, m, first)) first = false;
            }
            if (first) UI.toast(errs[0][1], { tone: 'bad' });
            return;
          }
          const scheduled = !draft && sendable() && f.type !== 'ocorrencia' && f.send === 'agendar';
          const input = {
            type: f.type, title: f.title.trim(), body: f.body.trim(), date: f.date, due: f.type === 'dever' || f.type === 'lembrete' ? f.due || null : null,
            respondBy: f.type === 'autorizacao' ? f.respondBy || null : null, requireAck: f.type === 'autorizacao' || (f.type === 'ocorrencia' && !f.internal) || !!f.requireAck,
            category: f.type === 'ocorrencia' ? f.category : null, internal: f.type === 'ocorrencia' ? !!f.internal : false, attachments: f.attachments,
            subjectId: f.subjectId || null, publishAt: scheduled ? new Date(f.publishAt).toISOString() : null, draft: !!draft,
          };
          if (f.mode === 'edit') {
            for (const d of editItems) {
              const cur = Q.diaryItem(d.id) || d;
              const res = await UI.act('diary.save', { ...input, id: d.id, baseUpdatedAt: cur.updatedAt }, { btn, form: r });
              if (!res) return;
            }
            api.close();
            const after = Q.diaryItem(editItems[0].id);
            let msg = 'Alterações salvas';
            if (after && f.status === 'pendente' && after.status !== 'pendente' && after.status !== 'rascunho') msg = after.status === 'agendado' ? `Aprovado. Será enviado ${U.fmtInstant(after.publishAt)}.` : 'Aprovado e enviado às famílias.';
            else if (after) msg = doneText(after, editItems.length, f.status === 'publicado' || (f.status === 'pendente' && after.status === 'pendente'));
            UI.toast(msg, { ic: 'checkCircle' });
            return;
          }
          const res = await UI.act('diary.save', { ...input, classIds: f.classIds, studentIds: f.target === 'alunos' || f.type === 'ocorrencia' ? f.studentIds : [] }, { btn, form: r });
          if (!res) return;
          api.close();
          const it = Q.diaryItem(res.result.id);
          const st = PageState.get('agenda', {});
          if (it && App.route()[0] === 'agenda' && !Store.family) {
            st.date = it.date;
            if (st.status && st.status !== it.status) st.status = '';
            if (st.type && st.type !== it.type) st.type = '';
            if (st.classId && !f.classIds.includes(st.classId)) st.classId = '';
          }
          const n = (res.result.ids || [res.result.id]).length;
          UI.toast(it ? doneText(it, n, false) : 'Salvo', App.route()[0] === 'agenda' ? { ic: 'checkCircle' } : { ic: 'checkCircle', action: { label: 'Ver na agenda', fn: () => App.go('agenda') } });
        };
      },
    });
  };
  /** Mensagem de confirmação conforme a situação final do item. */
  const doneText = (it, n, edited) => {
    const label = typeLabel(it.type);
    const where = n > 1 ? ` (${n} ${it.studentId ? 'alunos' : 'turmas'})` : '';
    if (it.type === 'ocorrencia') return it.internal ? 'Registro interno salvo na ficha do aluno' : 'Ocorrência registrada. A família foi avisada.';
    if (it.status === 'rascunho') return 'Rascunho salvo. Só você vê.';
    if (it.status === 'pendente') return edited ? 'Alterações salvas. Continua aguardando aprovação.' : 'Enviado para aprovação da coordenação.';
    if (it.status === 'agendado') return `${label} ${gw(it.type, 'agendado')} para ${U.fmtInstant(it.publishAt)}${where}.`;
    return edited ? 'Alterações salvas. As famílias veem a versão nova.' : `${label} ${gw(it.type, 'enviado')} às famílias${where}.`;
  };

  // =====================================================================
  // Tela da equipe
  // =====================================================================
  const ST = () => PageState.get('agenda', { view: window.innerWidth < 700 ? 'dia' : 'semana', date: U.today(), classId: '', type: '', status: '', mine: false, opened: '' });

  const filteredItems = (v, { ignoreDates = false } = {}) => {
    const [from, to] = v.view === 'dia' ? [v.date, v.date] : [weekStart(v.date), U.addDays(weekStart(v.date), 6)];
    const all = NEVER_SENT.has(v.status) || ignoreDates;
    const m = me();
    return allDiary()
      .filter((d) => (!v.classId || d.classId === v.classId) && (!v.type || d.type === v.type) && (!v.status || d.status === v.status) && (!v.mine || d.authorId === m.id) && (all || (d.date >= from && d.date <= to)))
      .sort(sortItems);
  };

  const emptyActions = (date) => {
    const types = allowedTypes();
    if (!types.length) return '';
    return html`${types.includes('dever') ? html`<button type="button" class="btn primary" data-ag-new="dever" data-date="${date || ''}">${icon('bookOpen')}Passar ${Q.homeworkLabel().toLowerCase()}</button>` : ''}
      ${types.includes('recado') ? html`<button type="button" class="btn" data-ag-new="recado" data-date="${date || ''}">${icon('message')}Enviar recado</button>` : ''}`;
  };

  const renderStaff = () => {
    const v = ST();
    if (!U.isValidDate(v.date)) v.date = today();
    const T = today();
    const types = allowedTypes();
    const classes = Q.workClasses();
    if (v.classId && !classes.some((c) => c.id === v.classId)) v.classId = '';
    const items = filteredItems(v);
    const cards = groupsOf(items);
    const statusAll = NEVER_SENT.has(v.status);
    // contadores (todas as datas)
    const pool = allDiary().filter((d) => !v.classId || d.classId === v.classId);
    const m = me();
    const nDraft = groupsOf(pool.filter((d) => d.status === 'rascunho' && d.authorId === m.id)).length;
    const nPend = groupsOf(pool.filter((d) => d.status === 'pendente' && (can('diario.aprovar') || d.authorId === m.id))).length;
    const nSched = groupsOf(pool.filter((d) => d.status === 'agendado')).length;
    const strip = [
      nPend ? html`<button type="button" class="chip ${v.status === 'pendente' ? 'on' : ''}" data-ag-quick="pendente">${icon('shieldCheck')}${can('diario.aprovar') ? `${nPend} para aprovar` : `${nPend} aguardando aprovação`}</button>` : '',
      nDraft ? html`<button type="button" class="chip ${v.status === 'rascunho' ? 'on' : ''}" data-ag-quick="rascunho">${icon('pencil')}${U.plural(nDraft, 'rascunho', 'rascunhos')}</button>` : '',
      nSched ? html`<button type="button" class="chip ${v.status === 'agendado' ? 'on' : ''}" data-ag-quick="agendado">${icon('clock')}${U.plural(nSched, 'agendado', 'agendados')}</button>` : '',
    ].filter(Boolean);
    const weekS = weekStart(v.date);
    const navLabel = v.view === 'dia' ? html`<span class="ag-nav-l">${U.cap(relShort(v.date))}${v.date === T || v.date === U.addDays(T, 1) || v.date === U.addDays(T, -1) ? html` <span class="muted">· ${ddmm(v.date)}</span>` : ''}</span>` : html`<span class="ag-nav-l">${weekLabel(weekS)}</span>`;
    const isNow = v.view === 'dia' ? v.date === T : weekS === weekStart(T);
    const oldRange = (v.view === 'dia' ? v.date : weekS) < windowStart();
    const histKey = `${v.classId}|${v.view}|${v.view === 'dia' ? v.date : weekS}`;

    let content;
    if (statusAll) {
      content = html`<div class="notice ag-allnote">${icon('filter')}<span class="grow">Mostrando <b>todos</b> os itens “${STATUS[v.status].label.toLowerCase()}”, de qualquer data.</span><button type="button" class="btn sm" data-ag-quick="">Voltar para a agenda</button></div>
        ${cards.length ? html`<div class="ag-list">${cards.map((c) => cardHTML(c, { classFilter: v.classId }))}</div>` : html`<div class="card">${UI.empty({ icon: 'checkCircle', title: 'Nada nesta situação', text: 'Quando houver, aparece aqui.' })}</div>`}`;
    } else if (v.view === 'dia') {
      const dueHere = groupsOf(allDiary().filter((d) => d.type === 'dever' && d.due === v.date && d.date !== v.date && d.status === 'publicado' && (!v.classId || d.classId === v.classId) && (!v.mine || d.authorId === m.id)));
      content = html`<section class="ag-day">
        <h2 class="ag-day-h">${U.cap(U.fmtDateLong(v.date))}${v.date === T ? html` <span class="pill mark plain">Hoje</span>` : ''}${Q.holiday(v.date) ? html` <span class="pill plain">${Q.holiday(v.date)}</span>` : ''}</h2>
        ${cards.length
          ? html`<div class="ag-list">${cards.map((c) => cardHTML(c, { classFilter: v.classId }))}</div>`
          : html`<div class="card">${UI.empty({ icon: 'bookOpen', title: 'Nada na agenda deste dia', text: types.length ? 'Passe o dever de casa ou mande um recado: as famílias recebem pelo Portal da família.' : 'Quando a equipe enviar deveres e recados para as turmas, eles aparecem aqui.', action: emptyActions(v.date) })}</div>`}
        ${dueHere.length
          ? html`<section class="card ag-duelist"><div class="card-head"><h2>${icon('clock')}Para entregar neste dia</h2></div><div class="card-body"><ul class="items">${dueHere.map(
              (c) => html`<li>${typeIcon('dever', 'sm')}<div class="grow"><b>${c.lead.title}</b><div class="small muted">${classNames(c.items).join(', ')} · passado em ${shortDay(c.lead.date)}${c.lead.subjectId && Q.subject(c.lead.subjectId) ? ` · ${Q.subject(c.lead.subjectId).name}` : ''}</div></div><button type="button" class="btn sm ghost" data-ag-goto="${c.lead.date}">Ver</button></li>`,
            )}</ul></div></section>`
          : ''}
      </section>`;
    } else {
      const days = [];
      for (let i = 0; i < 7; i++) {
        const d = U.addDays(weekS, i);
        const its = cards.filter((c) => c.lead.date === d);
        if (!its.length && (i >= 5 || v.type || v.mine)) continue;
        days.push(html`<section class="ag-wday ${d === T ? 'is-today' : ''}">
          <header class="ag-wday-h"><span class="date-chip ${d === T ? 'today' : ''}"><b>${Number(d.slice(8))}</b><span>${U.WD_SHORT[U.weekday(d)]}</span></span>
            <div class="grow"><b>${U.cap(U.WEEKDAYS[U.weekday(d)])}</b>${Q.holiday(d) ? html` <span class="small muted">· ${Q.holiday(d)}</span>` : ''}<div class="small muted">${its.length ? U.plural(its.length, 'envio', 'envios') : 'Nada enviado'}</div></div>
            ${types.length && d >= T ? html`<button type="button" class="btn sm ghost" data-ag-newday="${d}" aria-label="Escrever na agenda de ${U.fmtDateLong(d)}">${icon('plus')}<span class="hide-xs">Adicionar</span></button>` : ''}</header>
          ${its.length ? html`<div class="ag-list">${its.map((c) => cardHTML(c, { classFilter: v.classId }))}</div>` : ''}
        </section>`);
      }
      content = html`<div class="ag-week">${days}</div>
        ${!cards.length ? html`<p class="muted small ag-weekempty">${v.classId || v.type || v.status || v.mine ? 'Nenhum item com estes filtros nesta semana.' : 'Nenhum item da agenda nesta semana.'}</p>` : ''}`;
    }
    const histHTML = !statusAll && oldRange
      ? html`<div class="notice ag-hist">${icon('history')}<span class="grow">${cache().done.has(histKey) ? (cards.length ? 'Itens do histórico carregados.' : 'Não há itens no histórico para este período.') : `Itens com mais de ${WINDOW_DAYS} dias ficam no histórico da escola.`}</span>
          ${cache().done.has(histKey) ? '' : html`<button type="button" class="btn sm" data-ag-hist="${histKey}">${icon('download')}Carregar anteriores</button>`}</div>`
      : '';

    return html`
      <div class="page-head">
        <div><h1>Agenda</h1><p class="lead">${types.length ? 'Deveres, recados, lembretes e autorizações que chegam às famílias, com quem já viu e deu ciente.' : 'O que a escola enviou às famílias e quem já viu e deu ciente.'}</p></div>
        ${types.length
          ? html`<div class="btn-row ag-head-btns">${types.includes('dever') ? html`<button type="button" class="btn primary" data-ag-new="dever">${icon('bookOpen')}Passar ${Q.homeworkLabel().toLowerCase()}</button>` : ''}
              <button type="button" class="btn" data-ag-newmenu aria-haspopup="menu">${icon('plus')}${types.includes('dever') ? 'Outros tipos' : 'Escrever na agenda'}${icon('chevronDown')}</button></div>`
          : ''}
      </div>
      ${Q.settings().diaryApproval && !can('diario.aprovar') && types.length ? html`<div class="notice ag-approval">${icon('shieldCheck')}<span class="grow">Na sua escola, a coordenação revisa o que vai para as famílias antes do envio.</span></div>` : ''}
      <div class="ag-toolbar">
        <div class="ag-tb-row">
          ${seg([['dia', 'Dia'], ['semana', 'Semana']], v.view, 'data-ag-view')}
          <div class="date-nav ag-datenav">
            <button type="button" class="icon-btn" data-ag-nav="-1" aria-label="${v.view === 'dia' ? 'Dia anterior' : 'Semana anterior'}">${icon('chevronLeft')}</button>
            ${navLabel}
            <button type="button" class="icon-btn" data-ag-nav="1" aria-label="${v.view === 'dia' ? 'Próximo dia' : 'Próxima semana'}">${icon('chevronRight')}</button>
            <input type="date" class="input ag-dateinput" data-ag-date value="${v.date}" aria-label="Escolher data">
          </div>
          ${isNow ? '' : html`<button type="button" class="btn sm ghost" data-ag-nav="0">Hoje</button>`}
        </div>
        <div class="ag-tb-row ag-filters">
          <select class="input" data-ag-f="classId" aria-label="Turma">${[html`<option value="">Todas as turmas</option>`, ...classes.map((c) => html`<option value="${c.id}" ${v.classId === c.id ? raw('selected') : ''}>${c.name}</option>`)]}</select>
          <select class="input" data-ag-f="type" aria-label="Tipo">${[html`<option value="">Todos os tipos</option>`, ...TYPE_ORDER.map((t) => html`<option value="${t}" ${v.type === t ? raw('selected') : ''}>${typeLabel(t)}</option>`)]}</select>
          <select class="input" data-ag-f="status" aria-label="Situação">${[html`<option value="">Todas as situações</option>`, ...Object.entries(STATUS).map(([k, s]) => html`<option value="${k}" ${v.status === k ? raw('selected') : ''}>${s.label}</option>`)]}</select>
          ${types.length ? html`<label class="chip ag-mine"><input type="checkbox" data-ag-mine ${v.mine ? raw('checked') : ''}>Só os meus</label>` : ''}
        </div>
        ${strip.length ? html`<div class="ag-tb-row ag-strip">${strip}</div>` : ''}
      </div>
      ${content}
      ${histHTML}`;
  };

  /** Controle que deve voltar a ter foco depois de re-renderizar a tela (filtros, navegação). */
  let refocus = '';
  const mountStaff = (el, rest) => {
    const v = ST();
    if (refocus) {
      const t = UI.$(refocus, el);
      refocus = '';
      t && t.focus({ preventScroll: true });
    }
    bindCards(el);
    el.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-ag-view],[data-ag-nav],[data-ag-new],[data-ag-newday],[data-ag-newmenu],[data-ag-quick],[data-ag-goto],[data-ag-hist]');
      if (!b) return;
      if (b.dataset.agView) {
        refocus = `[data-ag-view="${b.dataset.agView}"]`;
        v.view = b.dataset.agView;
        return App.render();
      }
      if (b.dataset.agNav != null) {
        const n = Number(b.dataset.agNav);
        refocus = n === 0 ? '[data-ag-nav="1"]' : `[data-ag-nav="${b.dataset.agNav}"]`;
        v.date = n === 0 ? today() : U.addDays(v.date, n * (v.view === 'dia' ? 1 : 7));
        return App.render();
      }
      if (b.dataset.agNew) return openComposer({ type: b.dataset.agNew, classId: v.classId, date: b.dataset.date || (v.view === 'dia' ? v.date : '') });
      if (b.dataset.agNewday) return openComposer({ classId: v.classId, date: b.dataset.agNewday });
      if (b.hasAttribute('data-ag-newmenu')) {
        const types = allowedTypes().filter((t) => !(t === 'dever' && b.previousElementSibling));
        return UI.menu(b, types.map((t) => ({ label: typeLabel(t), icon: typeInfo(t).icon, fn: () => openComposer({ type: t, classId: v.classId, date: v.view === 'dia' ? v.date : '' }) })));
      }
      if (b.dataset.agQuick != null) {
        v.status = v.status === b.dataset.agQuick ? '' : b.dataset.agQuick;
        return App.render();
      }
      if (b.dataset.agGoto) {
        v.date = b.dataset.agGoto;
        return App.render();
      }
      if (b.dataset.agHist) {
        const weekS = weekStart(v.date);
        const end = v.view === 'dia' ? v.date : U.addDays(weekS, 6);
        b.disabled = true;
        b.classList.add('loading');
        await loadHistory({ classId: v.classId || undefined, before: U.addDays(end, 1) }, b.dataset.agHist);
      }
    });
    el.addEventListener('change', (e) => {
      const t = e.target;
      if (t.matches('[data-ag-f]')) {
        refocus = `[data-ag-f="${t.dataset.agF}"]`;
        v[t.dataset.agF] = t.value;
        return App.render();
      }
      if (t.matches('[data-ag-mine]')) {
        refocus = '[data-ag-mine]';
        v.mine = t.checked;
        return App.render();
      }
      if (t.matches('[data-ag-date]') && U.isValidDate(t.value)) {
        v.date = t.value;
        App.render();
      }
    });
    // #agenda/<id>: abre as respostas daquele item (links dos cartões do painel)
    const id = rest && rest[0];
    if (id && v.opened !== id) {
      v.opened = id;
      history.replaceState(null, '', '#agenda');
      const d = Q.diaryItem(id);
      if (!d) return UI.toast('Item da agenda não encontrado. Ele pode ter sido cancelado.', { ic: 'info' });
      Object.assign(v, { date: d.date, status: NEVER_SENT.has(d.status) ? d.status : '', type: '', mine: false, classId: v.classId && v.classId !== d.classId ? '' : v.classId });
      setTimeout(() => {
        App.render();
        const card = findCard(cardKey(d));
        if (card && d.status === 'publicado') openResponses(card.items);
      }, 0);
    }
  };

  // =====================================================================
  // Família
  // =====================================================================
  /** Itens vistos como "novos" nesta visita (o "visualizado" é registrado ao abrir; o selo fica até sair da tela). */
  const fresh = { owner: '', ids: new Set() };
  const freshIds = () => {
    if (fresh.owner !== ownerKey()) {
      fresh.owner = ownerKey();
      fresh.ids = new Set();
    }
    return fresh.ids;
  };
  window.addEventListener('hashchange', () => {
    const r = App.route()[0];
    if (r !== 'agenda' && r !== 'inicio') fresh.ids = new Set();
  });

  const myEntry = (d, s) => {
    const g = s && s.id ? Q.myGuardianRecord(s) : null;
    const entries = (s && s.id && Q.acks(d.id)[s.id]) || {};
    return { g, entries, mine: g ? entries[g.id] || null : null };
  };
  const needsMe = (d, s) => {
    if (d.status !== 'publicado' || !s) return false;
    const { g, mine } = myEntry(d, s);
    if (!g) return false;
    if (d.type === 'autorizacao') return !(mine && mine.answer) && !deadlinePassed(d);
    return !!d.requireAck && !mine;
  };

  /** Cartão do item para a família (também usado na prévia de quem escreve). */
  const famCard = (d, s, { preview = false, showChild = false, compact = false } = {}) => {
    const cancel = d.status === 'cancelado';
    const { mine, entries, g } = preview ? { mine: null, entries: {}, g: null } : myEntry(d, s);
    const auth = d.type === 'autorizacao';
    const late = deadlinePassed(d);
    const isNew = !preview && freshIds().has(d.id);
    const schoolPaper = Object.entries(entries).filter(([gid, a]) => a.origin === 'escola' && (!g || gid !== g.id)).map(([, a]) => a);
    const author = Q.user(d.authorId);
    const childName = s && s.name ? U.firstName(s.name) : '';
    let respond = '';
    if (!cancel) {
      if (auth) {
        if (mine && mine.answer) {
          respond = html`<div class="ag-answer ${mine.answer === 'nao' ? 'is-nao' : 'is-sim'}">${icon(mine.answer === 'nao' ? 'x' : 'checkCircle')}<span class="grow">${mine.origin === 'escola' ? 'A escola registrou (bilhete em papel)' : 'Você respondeu'}: <b>${mine.answer === 'sim' ? 'Autorizo' : 'Não autorizo'}</b>${withAt(mine.at)}${mine.note ? html`<br><span class="small">“${mine.note}”</span>` : ''}</span>
            ${!late && !preview ? html`<button type="button" class="btn sm ghost" data-ag-fa="mudar">Mudar resposta</button>` : ''}</div>`;
        } else if (late) respond = html`<div class="ag-answer is-late">${icon('clock')}<span>O prazo para responder terminou em ${U.fmtDate(d.respondBy)}. Se precisar, fale com a escola.</span></div>`;
        else
          respond = html`<div class="ag-respond"><p class="small"><b>${childName ? `Você autoriza ${childName}?` : 'Você autoriza?'}</b>${d.respondBy ? ` Responda até ${relShort(d.respondBy)}.` : ''}</p>
            <div class="btn-row"><button type="button" class="btn ag-yes" data-ag-fa="sim" ${preview ? raw('disabled') : ''}>${icon('check')}Autorizo</button><button type="button" class="btn ag-no" data-ag-fa="nao" ${preview ? raw('disabled') : ''}>${icon('x')}Não autorizo</button>
            <button type="button" class="btn sm ghost" data-ag-fa="obs" ${preview ? raw('disabled') : ''}>Responder com observação</button></div></div>`;
      } else if (d.requireAck) {
        respond = mine
          ? html`<div class="ag-answer is-sim">${icon('checkCircle')}<span>${mine.origin === 'escola' ? 'Ciente registrado pela escola' : 'Você deu ciente'}${withAt(mine.at)}</span></div>`
          : html`<div class="ag-respond ag-respond-row"><button type="button" class="btn primary" data-ag-fa="ciente" ${preview ? raw('disabled') : ''}>${icon('check')}Ciente</button><span class="small muted">Toque para avisar a escola que você leu.</span></div>`;
      }
    }
    const occ = d.type === 'ocorrencia' ? html`<span class="ag-occ ${d.category === 'elogio' ? 'ok' : ''}">${d.category === 'elogio' ? icon('star') : ''}${occLabel(d.category)}</span>` : '';
    return html`<article class="card ag-fcard ${toneOf(d)} ${cancel ? 'is-cancelado' : ''} ${!preview && needsMe(d, s) ? 'is-need' : ''} ${compact ? 'is-compact' : ''}" data-ag-f="${d.id}" data-sid="${(s && s.id) || ''}">
      <div class="ag-fhead">${itemIcon(d)}
        <div class="grow"><div class="ag-kicker"><b>${typeLabel(d.type)}</b>${occ}${subjectTag(d.subjectId)}${showChild && childName ? html`<span class="ag-child">${icon('user')}${childName}</span>` : ''}</div>
          <h3 class="ag-title">${d.title}</h3></div>
        ${isNew && !cancel ? UI.pill('Novo', 'mark') : ''}
      </div>
      ${d.body ? html`<p class="ag-text">${textHTML(d.body)}</p>` : ''}
      ${attachList(d.attachments)}
      <div class="ag-meta">${dueBits(d)}<span>${author ? `${U.shortName(author.name)}${author.title ? ` · ${author.title}` : ''}` : 'Escola'} · ${relShort(d.date)}</span>${d.editedAt && !cancel ? html`<span>atualizado ${U.fmtInstant(d.editedAt)}</span>` : ''}</div>
      ${cancel ? html`<div class="ag-note bad">${icon('x')}<span><b>Cancelado pela escola</b>${d.cancelReason ? html`: ${clause(d.cancelReason)}.` : '.'}</span></div>` : ''}
      ${schoolPaper.length && !(mine && mine.origin === 'escola') ? html`<p class="small muted">${icon('file')} A escola registrou uma resposta em papel de outro responsável.</p>` : ''}
      ${respond}
    </article>`;
  };

  const answerModal = (itemId, sid, preset = '') => {
    const d = Q.diaryItem(itemId);
    const s = Q.student(sid);
    if (!d || !s) return;
    const { mine } = myEntry(d, s);
    const defs = [
      { name: 'answer', label: `Você autoriza ${U.firstName(s.name)}?`, type: 'chips', required: true, full: true, options: [['sim', 'Autorizo', 3], ['nao', 'Não autorizo', 8]] },
      { name: 'note', label: 'Observação para a escola', type: 'textarea', rows: 3, maxlength: 500, full: true, placeholder: preset === 'nao' ? 'Se quiser, conte o motivo.' : 'Opcional.' },
    ];
    UI.modal({
      title: d.title,
      sub: html`Autorização · ${s.name} · responder até ${U.fmtDate(d.respondBy)}`,
      size: 'sm',
      body: html`<form class="form-grid" novalidate>${UI.fields(defs, { answer: preset || (mine && mine.answer) || '', note: (mine && mine.note) || '' })}<button type="submit" hidden></button></form>
        <p class="small muted">${icon('info')} Você pode mudar a resposta até o prazo. Se algum responsável disser “não”, vale o “não”.</p>`,
      foot: html`<button type="button" class="btn" data-close>Voltar</button><button type="button" class="btn primary" data-ok>${icon('send')}Enviar resposta</button>`,
      onMount(el, api) {
        const form = UI.$('form', el);
        const go = async (e) => {
          e && e.preventDefault();
          const v = UI.readForm(form, defs);
          if (!UI.validate(form, defs, v)) return;
          const res = await UI.act('diary.ack', { itemId, studentId: sid, answer: v.answer, note: v.note }, { btn: UI.$('[data-ok]', el), form, ok: v.answer === 'sim' ? 'Resposta enviada: autorizo' : 'Resposta enviada: não autorizo' });
          if (res) api.close();
        };
        form.addEventListener('submit', go);
        UI.$('[data-ok]', el).addEventListener('click', go);
      },
    });
  };

  /** Ações da família (ciente, autorização) dentro de root. */
  const bindFamily = (root) =>
    root.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-ag-fa]');
      if (!b || b.disabled) return;
      const card = b.closest('[data-ag-f]');
      if (!card) return;
      const itemId = card.dataset.agF;
      const sid = card.dataset.sid;
      const a = b.dataset.agFa;
      if (a === 'ciente') await UI.act('diary.ack', { itemId, studentId: sid }, { btn: b, ok: 'Ciente enviado à escola' });
      else if (a === 'sim') await UI.act('diary.ack', { itemId, studentId: sid, answer: 'sim' }, { btn: b, ok: 'Resposta enviada: autorizo' });
      else if (a === 'nao') answerModal(itemId, sid, 'nao');
      else if (a === 'obs' || a === 'mudar') answerModal(itemId, sid, '');
    });

  const FS = () => PageState.get('agenda-familia', { child: '', limit: 15 });
  const famEntries = (kids) => {
    const ids = new Set(kids.map((k) => k.id));
    const out = [];
    for (const d of allDiary()) {
      if (d.status !== 'publicado' && d.status !== 'cancelado') continue;
      for (const sid of d.recipients || []) if (ids.has(sid)) out.push({ d, s: Q.student(sid) });
    }
    return out;
  };
  const famSections = (kids) => {
    const T = today();
    const need = [];
    const hoje = [];
    const next = [];
    const old = [];
    for (const e of famEntries(kids)) {
      const { d, s } = e;
      if (needsMe(d, s)) need.push(e);
      else if (d.status === 'publicado' && ((d.due && d.due > T) || d.date > T)) next.push(e);
      else if (d.date === T || d.due === T) hoje.push(e);
      else old.push(e);
    }
    const dl = (e) => e.d.respondBy || e.d.due || e.d.date;
    need.sort((a, b) => dl(a).localeCompare(dl(b)) || sortItems(a.d, b.d));
    hoje.sort((a, b) => sortItems(a.d, b.d));
    next.sort((a, b) => (a.d.due || a.d.date).localeCompare(b.d.due || b.d.date));
    old.sort((a, b) => sortItems(a.d, b.d));
    return { need, hoje, next, old };
  };
  const selectedKids = () => {
    const kids = Q.myChildren();
    const v = FS();
    const one = kids.find((k) => k.id === v.child);
    return { kids, sel: one ? [one] : kids, one };
  };

  const renderFamily = () => {
    const { kids, sel, one } = selectedKids();
    if (!kids.length)
      return html`<div class="page-head"><div><h1>Agenda</h1></div></div><div class="card">${UI.empty({ icon: 'bookOpen', title: 'Nenhum aluno ligado à sua conta', text: 'Quando a escola vincular seu acesso aos seus filhos, a agenda aparece aqui. Fale com a secretaria.' })}</div>`;
    const v = FS();
    const multi = sel.length > 1;
    const { need, hoje, next, old } = famSections(sel);
    const ids = freshIds();
    const shownOld = old.slice(0, v.limit);
    [...need, ...hoje, ...next, ...shownOld].forEach((e) => !Q.isRead(e.d.id) && ids.add(e.d.id));
    const card = (e, extra = {}) => famCard(e.d, e.s, { showChild: multi, ...extra });
    const T = today();
    const histKey = `f|${sel.map((s) => s.id).join(',')}`;
    const done = cache().done.has(histKey);
    // anteriores agrupados por dia
    const byDay = [];
    for (const e of shownOld) {
      const last = byDay[byDay.length - 1];
      if (last && last.date === e.d.date) last.list.push(e);
      else byDay.push({ date: e.d.date, list: [e] });
    }
    const c = one ? Q.klass(one.classId) : null;
    return html`
      <div class="page-head">
        <div><h1>Agenda</h1><p class="lead">${one ? html`${one.name}${c ? html` · ${c.name}` : ''}` : kids.length === 1 ? 'Deveres, recados e autorizações da escola.' : 'Deveres, recados e autorizações dos seus filhos.'}</p></div>
      </div>
      ${kids.length > 1
        ? html`<div class="ag-kids" role="group" aria-label="Escolher filho">
            <button type="button" class="ag-kid ${!one ? 'on' : ''}" data-ag-kid="" aria-pressed="${tf(!one)}">${icon('users')}<span>Todos</span></button>
            ${kids.map((k) => html`<button type="button" class="ag-kid ${one && one.id === k.id ? 'on' : ''}" data-ag-kid="${k.id}" aria-pressed="${tf(one && one.id === k.id)}">${UI.avatar(k.name, 'sm', k.photo)}<span>${U.firstName(k.name)}</span></button>`)}
          </div>`
        : ''}
      ${need.length
        ? html`<section class="ag-fsec ag-fsec-need" aria-labelledby="ag-need-h"><h2 id="ag-need-h">${icon('bell')}Precisa da sua resposta <span class="badge">${need.length}</span></h2><div class="ag-flist">${need.map((e) => card(e))}</div></section>`
        : html`<div class="ag-allok">${icon('checkCircle')}<div><b>Tudo respondido</b><span class="small muted">Nenhuma autorização ou ciente esperando por você.</span></div></div>`}
      <section class="ag-fsec" aria-labelledby="ag-hoje-h"><h2 id="ag-hoje-h">${icon('sun')}Hoje <span class="muted small">${shortDay(T)}</span></h2>
        ${hoje.length ? html`<div class="ag-flist">${hoje.map((e) => card(e))}</div>` : html`<p class="muted small ag-fempty">Nada novo na agenda de hoje.</p>`}</section>
      ${next.length ? html`<section class="ag-fsec" aria-labelledby="ag-next-h"><h2 id="ag-next-h">${icon('calendar')}Próximas entregas e datas</h2><div class="ag-flist">${next.map((e) => card(e))}</div></section>` : ''}
      <section class="ag-fsec" aria-labelledby="ag-old-h"><h2 id="ag-old-h">${icon('history')}Anteriores</h2>
        ${byDay.length
          ? byDay.map((g) => html`<div class="ag-fday"><h3 class="ag-fday-h">${U.cap(relShort(g.date))}${g.date < U.addDays(T, -1) ? '' : html` <span class="muted">· ${shortDay(g.date)}</span>`}</h3><div class="ag-flist">${g.list.map((e) => card(e, { compact: true }))}</div></div>`)
          : html`<p class="muted small ag-fempty">Nada anterior por aqui.</p>`}
        <div class="ag-fmore">${old.length > shownOld.length
          ? html`<button type="button" class="btn" data-ag-fmore>Mostrar mais (${old.length - shownOld.length})</button>`
          : done
            ? html`<span class="small muted">Não há itens mais antigos.</span>`
            : html`<button type="button" class="btn ghost" data-ag-fhist="${histKey}">${icon('history')}Carregar anteriores</button>`}</div>
      </section>`;
  };

  const mountFamily = (el) => {
    bindFamily(el);
    el.addEventListener('click', async (e) => {
      const k = e.target.closest('[data-ag-kid]');
      if (k) {
        FS().child = k.dataset.agKid;
        FS().limit = 15;
        return App.render();
      }
      if (e.target.closest('[data-ag-fmore]')) {
        FS().limit += 20;
        return App.render();
      }
      const h = e.target.closest('[data-ag-fhist]');
      if (h) {
        h.disabled = true;
        h.classList.add('loading');
        const { sel } = selectedKids();
        const entries = famEntries(sel);
        const oldest = entries.reduce((m, x) => (x.d.date < m ? x.d.date : m), today());
        for (const s of sel) await loadHistory({ studentId: s.id, before: oldest, limit: 60 }, null);
        cache().done.add(h.dataset.agFhist);
        Store.emit();
      }
    });
    // "visualizado": registra o que está na tela
    const ids = [...new Set(UI.$$('[data-ag-f]', el).map((x) => x.dataset.agF))].filter((id) => id !== 'preview' && !Q.isRead(id));
    if (ids.length) Store.markRead(ids);
  };

  // =====================================================================
  // Registro das telas
  // =====================================================================
  App.page({
    id: 'agenda',
    label: 'Agenda',
    icon: 'bookOpen',
    group: 'Dia a dia',
    order: 15,
    perm: 'diario.ver',
    keys: 'dever de casa tarefa recado lembrete autorização ocorrência ciente',
    badge: () => {
      if (!can('diario.aprovar')) return null;
      const n = groupsOf(Q.pendingApprovals()).length;
      return n ? { n, title: `${n} ${n === 1 ? 'item aguardando' : 'itens aguardando'} sua aprovação` } : null;
    },
    title: () => 'Agenda',
    render: () => renderStaff(),
    mount: (el, rest) => mountStaff(el, rest),
  });

  App.page({
    id: 'agenda',
    label: 'Agenda',
    icon: 'bookOpen',
    family: true,
    order: 10,
    tab: 2,
    keys: 'dever de casa tarefa recado autorização ciente',
    badge: () => {
      const n = Store.state.diary.filter((d) => d.status === 'publicado' && !Q.isRead(d.id)).length;
      return n ? { n, title: `${n} ${n === 1 ? 'item novo' : 'itens novos'} na agenda` } : null;
    },
    render: () => renderFamily(),
    mount: (el) => mountFamily(el),
  });

  // ---------- ficha do aluno ----------
  const studentAck = (d, sid) => {
    if (d.status !== 'publicado') return UI.pill((STATUS[d.status] || STATUS.publicado).label, (STATUS[d.status] || STATUS.publicado).tone);
    if (d._old) return '';
    if (d.type === 'ocorrencia' && d.internal) return UI.pill('Interno', '');
    const a = d.type === 'autorizacao' ? Q.authorizationAnswer(d.id, sid) : null;
    if (d.type === 'autorizacao') return a === 'nao' ? UI.pill('Não autoriza', 'bad') : a === 'sim' ? UI.pill('Autoriza', 'ok') : UI.pill(deadlinePassed(d) ? 'Sem resposta (encerrado)' : 'Sem resposta', 'warn');
    const entries = Object.values(Q.acks(d.id)[sid] || {});
    if (d.requireAck) {
      if (!entries.length) return UI.pill('Sem ciente', 'warn');
      const last = entries.sort((x, y) => (y.at || '').localeCompare(x.at || ''))[0];
      return html`<span class="pill ok" title="${last.origin === 'escola' ? 'Registrado pela escola (papel)' : 'Pelo portal'}${withAt(last.at)}">Ciente${last.origin === 'escola' ? ' (papel)' : ''}</span>`;
    }
    const reads = Store.reads[d.id] || {};
    return famUsers(Q.student(sid)).some((u) => reads[u]) ? UI.pill('Visualizado', 'info') : '';
  };
  const studentRow = (d, s) => html`<li class="ag-srow" data-ag-card="${cardKey(d)}">
      <span class="date-chip ${d.date === today() ? 'today' : ''}"><b>${Number(d.date.slice(8))}</b><span>${U.MONTHS_SHORT[Number(d.date.slice(5, 7)) - 1]}</span></span>
      <div class="grow">
        <div class="ag-kicker">${itemIcon(d, 'sm')}<b>${typeLabel(d.type)}</b>${d.type === 'ocorrencia' ? html`<span class="ag-occ ${d.category === 'elogio' ? 'ok' : ''}">${occLabel(d.category)}</span>` : ''}${subjectTag(d.subjectId)}</div>
        <div class="ag-srow-t ${d.status === 'cancelado' ? 'is-cancel' : ''}">${d.title}</div>
        ${d.body ? html`<p class="ag-srow-b">${textHTML(d.body)}</p>` : ''}
        <div class="small muted">${d.studentId ? 'Só para este aluno' : `Turma · ${(Q.klass(d.classId) || {}).name || ''}`} · por ${authorName(d.authorId)}${d.respondBy ? ` · responder até ${shortDay(d.respondBy)}` : ''}${d.due && d.type === 'dever' ? ` · entrega ${shortDay(d.due)}` : ''}</div>
        ${(() => {
          const notes = Object.values(Q.acks(d.id)[s.id] || {}).filter((a) => a.note);
          return notes.length ? html`<p class="ag-srow-note">${icon('message')}“${notes[0].note}”</p>` : '';
        })()}
      </div>
      <div class="ag-srow-end">${studentAck(d, s.id)}
        ${canPaper(d) && (s.guardians || []).some((g) => !((Q.acks(d.id)[s.id] || {})[g.id] && (Q.acks(d.id)[s.id] || {})[g.id].origin === 'portal')) && !(d.type === 'autorizacao' ? ['sim', 'nao'].includes(Q.authorizationAnswer(d.id, s.id)) : Object.keys(Q.acks(d.id)[s.id] || {}).length) ? html`<button type="button" class="btn sm" data-ag-spaper="${d.id}">Em papel</button>` : ''}
      </div>
    </li>`;

  App.studentTab({
    id: 'agenda',
    label: 'Agenda',
    order: 40,
    perm: 'diario.ver',
    badge: (s) => {
      const n = Store.state.diary.filter((d) => d.type === 'autorizacao' && d.status === 'publicado' && (d.recipients || []).includes(s.id) && !deadlinePassed(d) && Q.authorizationAnswer(d.id, s.id) === 'nao').length;
      return n ? { n, tone: 'bad', title: 'Autorizações negadas' } : null;
    },
    render(s) {
      const items = allDiary().filter((d) => (d.recipients || []).includes(s.id)).sort(sortItems);
      const occ = items.filter((d) => d.type === 'ocorrencia');
      const auths = items.filter((d) => d.type === 'autorizacao');
      const rest = items.filter((d) => d.type !== 'ocorrencia' && d.type !== 'autorizacao');
      const key = `s|${s.id}`;
      const types = allowedTypes();
      const canWrite = s.status === 'ativo' && reachable(s.classId);
      const elogios = occ.filter((d) => d.category === 'elogio' && d.status !== 'cancelado').length;
      return html`<div class="ag-stab">
        ${canWrite && types.length
          ? html`<div class="btn-row ag-stab-btns">${types.includes('recado') ? html`<button type="button" class="btn" data-ag-snew="recado">${icon('message')}Recado para a família</button>` : ''}
              ${types.includes('ocorrencia') ? html`<button type="button" class="btn" data-ag-snew="ocorrencia">${icon('flag')}Registrar ocorrência</button>` : ''}</div>`
          : ''}
        <div class="grid-2">
          <section class="card"><div class="card-head"><h2>${icon('bookOpen')}Agenda</h2><span class="sub">Deveres, recados e lembretes</span></div>
            <div class="card-body">${rest.length ? html`<ul class="items ag-slist">${rest.slice(0, 25).map((d) => studentRow(d, s))}</ul>${rest.length > 25 ? html`<p class="small muted">Mostrando os 25 mais recentes de ${rest.length}.</p>` : ''}` : html`<p class="muted small">Nada na agenda deste aluno nos últimos ${WINDOW_DAYS} dias.</p>`}</div></section>
          <div class="stack">
            <section class="card"><div class="card-head"><h2>${icon('shieldCheck')}Autorizações</h2></div>
              <div class="card-body">${auths.length ? html`<ul class="items ag-slist">${auths.map((d) => studentRow(d, s))}</ul>` : html`<p class="muted small">Nenhum pedido de autorização recente.</p>`}</div></section>
            <section class="card"><div class="card-head"><h2>${icon('flag')}Ocorrências e elogios</h2>${elogios ? html`<span class="sub">${U.plural(elogios, 'elogio', 'elogios')}</span>` : ''}</div>
              <div class="card-body">${occ.length ? html`<ul class="items ag-slist">${occ.map((d) => studentRow(d, s))}</ul>` : html`<p class="muted small">Nenhuma ocorrência registrada.</p>`}</div></section>
          </div>
        </div>
        <div class="ag-fmore">${cache().done.has(key) ? html`<span class="small muted">Histórico carregado.</span>` : html`<button type="button" class="btn ghost" data-ag-shist>${icon('history')}Carregar itens com mais de ${WINDOW_DAYS} dias</button>`}</div>
      </div>`;
    },
    mount(el, s) {
      el.addEventListener('click', async (e) => {
        const n = e.target.closest('[data-ag-snew]');
        if (n) return openComposer({ type: n.dataset.agSnew, studentId: s.id, classId: s.classId });
        const p = e.target.closest('[data-ag-spaper]');
        if (p) {
          const d = Q.diaryItem(p.dataset.agSpaper);
          const cur = Q.student(s.id);
          if (d && cur) paperAck(d, cur, null);
          return;
        }
        const h = e.target.closest('[data-ag-shist]');
        if (h) {
          h.disabled = true;
          h.classList.add('loading');
          await loadHistory({ studentId: s.id, before: windowStart(), limit: 100 }, `s|${s.id}`);
        }
      });
    },
  });

  // ---------- painel ----------
  App.widget({
    id: 'agenda-hoje',
    order: 12,
    size: 'half',
    perm: 'diario.publicar',
    render() {
      const T = today();
      const mine = groupsOf(Store.state.diary.filter((d) => d.authorId === me().id && d.status !== 'cancelado' && (d.date === T || (d.createdAt || '').slice(0, 10) === T)).sort(sortItems));
      const shown = mine.slice(0, 5);
      return html`<section class="card ag-widget">
        <div class="card-head"><h2>${icon('bookOpen')}Minha agenda de hoje</h2><a class="sub" href="#agenda">Abrir agenda</a></div>
        <div class="card-body">${shown.length
          ? html`<ul class="items">${shown.map((c) => {
              const t = trackOf(c.items);
              const pct = c.lead.status === 'publicado' && (t.auth || t.requireAck) && t.recips ? Math.round(((t.auth ? t.sim + t.nao : t.ack) / t.recips) * 100) : null;
              return html`<li>${typeIcon(c.lead.type, 'sm')}<div class="grow"><b class="ag-w-t">${c.lead.title}</b><div class="small muted">${classNames(c.items).join(', ')} · ${c.lead.status === 'publicado' ? `${t.viewed}/${t.portal} viram` : STATUS[c.lead.status].label}</div>
                ${pct != null ? html`<div class="ag-w-meter">${UI.meter(pct, pct >= 70 ? 'ok' : pct >= 40 ? '' : 'warn')}<span class="small num">${pct}% ${t.auth ? 'responderam' : 'ciente'}</span></div>` : ''}</div></li>`;
            })}</ul>${mine.length > shown.length ? html`<a class="btn sm ghost" href="#agenda">Ver todos (${mine.length})${icon('arrowRight')}</a>` : ''}`
          : html`<div class="ag-w-empty"><p class="muted small">Você ainda não enviou nada hoje.</p><div class="btn-row">${allowedTypes().includes('dever') ? html`<button type="button" class="btn sm primary" data-ag-wnew="dever">${icon('bookOpen')}Passar ${Q.homeworkLabel().toLowerCase()}</button>` : ''}<button type="button" class="btn sm" data-ag-wnew="recado">${icon('message')}Recado</button></div></div>`}</div>
      </section>`;
    },
    mount(el) {
      el.addEventListener('click', (e) => {
        const b = e.target.closest('[data-ag-wnew]');
        if (b) openComposer({ type: b.dataset.agWnew });
      });
    },
  });

  App.widget({
    id: 'agenda-aprovacoes',
    order: 15,
    size: 'half',
    perm: 'diario.aprovar',
    when: () => !!Q.settings().diaryApproval || Q.pendingApprovals().length > 0,
    render() {
      const cards = groupsOf(Q.pendingApprovals().slice().sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || '')));
      const shown = cards.slice(0, 5);
      return html`<section class="card ag-widget">
        <div class="card-head"><h2>${icon('shieldCheck')}Aprovações da agenda</h2><span class="sub">${cards.length ? `${cards.length} aguardando` : 'Em dia'}</span></div>
        <div class="card-body">${shown.length
          ? html`<ul class="items">${shown.map(
              (c) => html`<li data-ag-card="${c.key}">${typeIcon(c.lead.type, 'sm')}<div class="grow"><b class="ag-w-t">${c.lead.title}</b><div class="small muted">${U.shortName(Q.userName(c.lead.authorId))} · ${classNames(c.items).join(', ')} · ${U.fmtInstant(c.lead.createdAt)}</div></div>
                <button type="button" class="btn sm primary" data-ag-act="aprovar">${icon('check')}<span class="hide-xs">Aprovar</span></button><button type="button" class="icon-btn sm" data-ag-wreview aria-label="Revisar ${c.lead.title}">${icon('eye')}</button></li>`,
            )}</ul>${cards.length > shown.length ? html`<button type="button" class="btn sm ghost" data-ag-wreview>Ver todos (${cards.length})${icon('arrowRight')}</button>` : ''}`
          : html`<p class="muted small">Nada aguardando aprovação. Os envios de professores e auxiliares aparecem aqui antes de chegar às famílias.</p>`}</div>
      </section>`;
    },
    mount(el) {
      bindCards(el);
      el.addEventListener('click', (e) => {
        if (!e.target.closest('[data-ag-wreview]')) return;
        Object.assign(ST(), { status: 'pendente', type: '', mine: false, classId: '' });
        App.go('agenda');
      });
    },
  });

  App.widget({
    id: 'agenda-autorizacoes-nao',
    order: 25,
    size: 'half',
    perm: 'diario.ver',
    when: () => Store.state.diary.some((d) => d.type === 'autorizacao' && d.status === 'publicado' && d.respondBy && d.respondBy >= U.addDays(today(), -3)),
    render() {
      const open = groupsOf(Store.state.diary.filter((d) => d.type === 'autorizacao' && d.status === 'publicado' && d.respondBy && d.respondBy >= U.addDays(today(), -3)).sort((a, b) => a.respondBy.localeCompare(b.respondBy)));
      return html`<section class="card ag-widget">
        <div class="card-head"><h2>${icon('shieldCheck')}Autorizações</h2><span class="sub">Qualquer “não” prevalece</span></div>
        <div class="card-body"><ul class="items">${open.slice(0, 5).map((c) => {
          const t = trackOf(c.items);
          const pending = t.recips - t.sim - t.nao;
          return html`<li class="ag-w-auth ${t.nao ? 'is-nao' : ''}"><div class="grow"><a class="ag-w-t" href="#agenda/${c.lead.id}">${c.lead.title}</a>
              <div class="small muted">${classNames(c.items).join(', ')} · ${deadlinePassed(c.lead) ? 'prazo encerrado' : `responder até ${relShort(c.lead.respondBy)}`}</div>
              <div class="ag-auth-pills">${UI.pill(`${t.sim} sim`, 'ok')}${t.nao ? UI.pill(`${t.nao} não`, 'bad') : ''}${pending ? UI.pill(`${pending} sem resposta`, 'warn') : ''}</div>
              ${t.nao ? html`<p class="ag-nao small">${icon('alert')}<span>${html.join(t.naoList.slice(0, 3).map((sid) => (Q.student(sid) || {}).name || 'Aluno'), ', ')}${t.naoList.length > 3 ? ` e mais ${t.naoList.length - 3}` : ''}</span></p>` : ''}</div></li>`;
        })}</ul></div>
      </section>`;
    },
  });

  App.widget({
    id: 'agenda-pendente',
    family: true,
    order: 5,
    size: 'full',
    render() {
      const kids = Q.myChildren();
      if (!kids.length) return '';
      const { need } = famSections(kids);
      const multi = kids.length > 1;
      const ids = freshIds();
      need.forEach((e) => !Q.isRead(e.d.id) && ids.add(e.d.id));
      return html`<section class="ag-wfam ${need.length ? 'is-need' : ''}">
        <div class="ag-wfam-h"><h2>${icon(need.length ? 'bell' : 'checkCircle')}${need.length ? 'Precisa da sua resposta' : 'Agenda em dia'}</h2><a class="btn sm ghost" href="#agenda">Abrir agenda${icon('arrowRight')}</a></div>
        ${need.length ? html`<div class="ag-flist">${need.slice(0, 4).map((e) => famCard(e.d, e.s, { showChild: multi }))}</div>${need.length > 4 ? html`<a class="btn sm" href="#agenda">Ver mais ${need.length - 4}</a>` : ''}` : html`<p class="small muted">Nenhuma autorização ou ciente esperando por você.</p>`}
      </section>`;
    },
    mount(el) {
      bindFamily(el);
      const ids = [...new Set(UI.$$('[data-ag-f]', el).map((x) => x.dataset.agF))].filter((id) => !Q.isRead(id));
      if (ids.length) Store.markRead(ids);
    },
  });

  // ---------- menu "Novo" e busca ----------
  App.action({ id: 'novo-dever', label: 'Passar dever de casa', icon: 'bookOpen', order: 5, perm: 'diario.publicar', keys: 'dever de casa tarefa lição agenda exercício', run: () => openComposer({ type: 'dever' }) });
  App.action({ id: 'novo-recado', label: 'Enviar recado às famílias', icon: 'message', order: 6, perm: 'diario.publicar', keys: 'recado bilhete aviso agenda lembrete autorização família', run: () => openComposer({ type: 'recado' }) });
  App.action({ id: 'nova-ocorrencia', label: 'Registrar ocorrência', icon: 'flag', order: 30, perm: 'diario.ocorrencias', keys: 'ocorrência comportamento atraso uniforme elogio advertência', run: () => openComposer({ type: 'ocorrencia' }) });

  App.searchProvider((query) => {
    if (!Store.family && !can('diario.ver')) return [];
    const T = today();
    const list = Store.state.diary.filter((d) => (Store.family ? d.status === 'publicado' : true) && U.matches(query, d.title, typeLabel(d.type))).sort(sortItems).slice(0, 5);
    return list.map((d) => ({
      group: 'Agenda',
      label: d.title,
      icon: typeInfo(d.type).icon,
      meta: `${typeLabel(d.type)} · ${d.date === T ? 'hoje' : shortDay(d.date)}`,
      run: () => {
        if (Store.family) return App.go('agenda');
        Object.assign(ST(), { date: d.date, view: 'dia', status: NEVER_SENT.has(d.status) ? d.status : '', type: '', classId: '', mine: false });
        App.go('agenda');
      },
    }));
  });

  Actions.novoItemAgenda = (opts = {}) => openComposer(opts);
  Actions.verRespostasAgenda = (itemId) => {
    const d = Q.diaryItem(itemId);
    const card = d && findCard(cardKey(d));
    if (card) openResponses(card.items);
  };
})();
