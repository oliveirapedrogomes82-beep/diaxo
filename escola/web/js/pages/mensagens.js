'use strict';
/* Mensagens família ↔ escola — os dois lados.
   Equipe: caixa de entrada com filtros (para responder, respondidas, resolvidas; tipo; turma; busca), conversa com
   detalhes do pedido (data, hora, quem busca, documento, remédio, dose…), conferência com a ficha (pessoas
   autorizadas, restrição de retirada, alerta de saúde), linha do tempo, resposta com anexos, nota interna
   (kind "registro": só a equipe vê e não muda a situação) e resolver/reabrir com "Desfazer".
   A escola também inicia conversa com a família (Actions.novaMensagem({studentId})).
   Família: conversas por filho e formulários simples — avisar falta, saída antecipada, outra pessoa vai buscar,
   medicação, atestado e recado — respeitando settings.familyMessages e mostrando settings.officeHours.
   Também: aba "Mensagens" da ficha do aluno, cartões do painel, ações do menu "Novo" e busca.
   Comandos: messages.create, messages.reply, messages.status (web/core/commands/mensagens.js). */
(() => {
  const can = (p) => Store.can(p);
  const me = () => Store.me;
  const today = () => U.today();
  const tf = (b) => (b ? 'true' : 'false');
  const WINDOW_DAYS = 60;
  const windowStart = () => U.addDays(today(), -WINDOW_DAYS);
  const textHTML = (s) => raw(U.linkify(U.esc(s || '')));
  const settings = () => Q.settings();
  const portalOn = () => settings().familyMessages !== false;

  // ---------- tipos e situações ----------
  const KINDS = {
    falta: { label: 'Aviso de falta', fam: 'Avisar falta', icon: 'calendar', tone: 'c8', hint: 'Seu filho não vai à aula' },
    saida: { label: 'Saída antecipada', fam: 'Saída antecipada', icon: 'door', tone: 'c2', hint: 'Buscar antes do horário' },
    busca: { label: 'Outra pessoa busca', fam: 'Outra pessoa vai buscar', icon: 'userCheck', tone: 'c7', hint: 'Avó, tio, transporte…' },
    medicacao: { label: 'Medicação', fam: 'Medicação', icon: 'activity', tone: 'c5', hint: 'Remédio durante a aula' },
    atestado: { label: 'Atestado', fam: 'Enviar atestado', icon: 'file', tone: 'c3', hint: 'Atestado médico (foto ou PDF)' },
    recado: { label: 'Recado', fam: 'Recado para a escola', icon: 'message', tone: 'c1', hint: 'Dúvidas e outros assuntos' },
    outro: { label: 'Outro assunto', fam: 'Outro assunto', icon: 'inbox', tone: 'c4', hint: '' },
  };
  const FAMILY_KINDS = ['falta', 'saida', 'busca', 'medicacao', 'atestado', 'recado'];
  const kindOf = (k) => KINDS[k] || KINDS.outro;
  const kindIcon = (k, extra = '') => html`<span class="mg-kind ${kindOf(k).tone} ${extra}" aria-hidden="true">${icon(kindOf(k).icon)}</span>`;
  const STAFF_STATUS = {
    aberta: { label: 'Para responder', tone: 'warn' },
    respondida: { label: 'Respondida', tone: 'info' },
    resolvida: { label: 'Resolvida', tone: 'ok' },
  };
  const FAMILY_STATUS = {
    aberta: { label: 'Aguardando a escola', tone: 'warn' },
    respondida: { label: 'Respondida', tone: 'info' },
    resolvida: { label: 'Resolvida', tone: 'ok' },
  };
  const statusPill = (m) => {
    const st = (Store.family ? FAMILY_STATUS : STAFF_STATUS)[m.status] || STAFF_STATUS.aberta;
    return UI.pill(st.label, st.tone);
  };

  // ---------- datas ----------
  const ddmm = (d) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}` : '');
  const shortDay = (d) => (d ? `${U.WD_SHORT[U.weekday(d)]}, ${ddmm(d)}` : '');
  const relShort = (d) => {
    if (!d) return '';
    if (d === today()) return 'hoje';
    if (d === U.addDays(today(), 1)) return 'amanhã';
    if (d === U.addDays(today(), -1)) return 'ontem';
    return shortDay(d);
  };
  /** "hoje (qua, 07/10)", "amanhã (qui, 08/10)" ou "em sex, 09/10" — a data fica escrita para quem lê depois. */
  const whenText = (d) => (relShort(d) === 'hoje' || relShort(d) === 'amanhã' ? `${relShort(d)} (${shortDay(d)})` : `em ${shortDay(d)}`);
  const validInstant = (iso) => iso && !isNaN(Date.parse(iso));
  const at = (iso) => (validInstant(iso) ? U.fmtInstant(iso) : '');
  const ago = (iso) => (validInstant(iso) ? U.ago(iso) : '');
  const dayOfInstant = (iso) => {
    const d = new Date(iso);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  const dayLabel = (iso) => {
    const d = dayOfInstant(iso);
    if (d === today()) return 'Hoje';
    if (d === U.addDays(today(), -1)) return 'Ontem';
    return U.cap(U.fmtDateLong(d));
  };

  // ---------- conversas ----------
  /** Conversas antigas carregadas pelo histórico (fora da janela do retrato), só leitura até a próxima resposta.
      Presas à pessoa, ao modo e ao "ver como": trocar de conta (ou entrar na prévia) começa do zero, para nada
      carregado por uma pessoa aparecer para outra na mesma aba. */
  const hist = { owner: '', map: new Map(), done: new Set() };
  const ownerKey = () => (me() ? `${me().id}|${Store.family ? 'f' : 'e'}|${Store.preview ? Store.preview.id : ''}` : '');
  const histCache = () => {
    const k = ownerKey();
    if (hist.owner !== k) {
      hist.owner = k;
      hist.map = new Map();
      hist.done = new Set();
    }
    return hist;
  };
  /** Só o que é de um aluno que a conta atual enxerga (o retrato é a autoridade). */
  const olderMessages = () => [...histCache().map.values()].filter((m) => m && Q.student(m.studentId));
  const findMessage = (id) => {
    const m = Q.message(id);
    if (m) return m;
    const o = histCache().map.get(id);
    return o && Q.student(o.studentId) ? o : null;
  };
  const allMessages = () => {
    const list = Store.state.messages.slice();
    const ids = new Set(list.map((m) => m.id));
    olderMessages().forEach((m) => !ids.has(m.id) && list.push(m));
    return list;
  };
  const postsOf = (m) => (Store.family ? (m.posts || []).filter((p) => p.kind !== 'registro') : m.posts || []);
  const lastPost = (m) => {
    const ps = postsOf(m);
    return ps.length ? ps[ps.length - 1] : null;
  };
  const lastAt = (m) => {
    const p = lastPost(m);
    return (p && p.at) || m.createdAt || '';
  };
  const byRecent = (a, b) => lastAt(b).localeCompare(lastAt(a));
  /** Lado de quem escreveu. Posts antigos não têm `from`: deduz pela conta (família = conta de responsável). */
  const sideOf = (p) => {
    if (!p) return 'escola';
    if (p.from === 'familia' || p.from === 'escola') return p.from;
    const u = Q.user(p.userId);
    if (u) return u.role === 'responsavel' ? 'familia' : 'escola';
    if (me() && p.userId === me().id) return Store.family ? 'familia' : 'escola';
    return 'familia'; // a equipe enxerga toda a equipe; conta desconhecida é de família
  };
  const studentOf = (m) => Q.student(m.studentId);
  const className = (s) => (s && Q.klass(s.classId) ? Q.klass(s.classId).name : '');
  /** Nome de quem é da família, a partir da ficha (a equipe sem acesso a contatos ainda vê nome e parentesco). */
  const familyName = (s, userId, { short = false } = {}) => {
    if (me() && userId === me().id) return 'Você';
    const g = s && (s.guardians || []).find((x) => x.userId && x.userId === userId);
    if (g) {
      const n = short ? U.firstName(g.name) : U.shortName(g.name);
      return g.relation ? `${n} (${g.relation.toLowerCase()})` : n;
    }
    const u = Q.user(userId);
    if (u) return short ? U.firstName(u.name) : U.shortName(u.name);
    return Store.family ? 'Outro responsável' : 'Família';
  };
  const staffName = (userId, { short = false } = {}) => {
    if (me() && userId === me().id) return 'Você';
    const u = Q.user(userId);
    if (!u) return 'Equipe da escola';
    return short ? U.firstName(u.name) : U.shortName(u.name);
  };
  const authorOf = (m, p, opts) => (sideOf(p) === 'familia' ? familyName(studentOf(m), p.userId, opts) : staffName(p.userId, opts));
  const openerLabel = (m) => {
    const first = (m.posts || [])[0];
    if (!first) return '';
    if (me() && first.userId === me().id) return sideOf(first) === 'escola' ? 'Iniciada por você' : 'Enviada por você';
    return sideOf(first) === 'escola' ? `Iniciada pela escola (${staffName(first.userId)})` : `Enviada por ${familyName(studentOf(m), first.userId)}`;
  };
  /** Trecho da última mensagem, com quem escreveu. */
  const snippet = (m) => {
    const p = lastPost(m);
    if (!p) return '';
    const who = p.kind === 'registro' ? 'Nota interna' : sideOf(p) === (Store.family ? 'familia' : 'escola') && p.userId === me().id ? 'Você' : authorOf(m, p, { short: true });
    return `${who}: ${String(p.body || '').replace(/\s+/g, ' ').slice(0, 140)}`;
  };

  // ---------- "visto" (família): por aparelho, só para destacar respostas novas ----------
  const SEEN_KEY = () => `caderneta.mensagens.vistas.${(me() || {}).id || ''}`;
  let seenCache = null;
  const seenMap = () => {
    if (seenCache && seenCache.key === SEEN_KEY()) return seenCache.map;
    let map = {};
    try {
      map = JSON.parse(localStorage.getItem(SEEN_KEY()) || '{}') || {};
    } catch (e) {
      map = {};
    }
    seenCache = { key: SEEN_KEY(), map };
    return map;
  };
  const markSeen = (m) => {
    const map = seenMap();
    const t = lastAt(m);
    if (map[m.id] === t) return;
    map[m.id] = t;
    try {
      localStorage.setItem(SEEN_KEY(), JSON.stringify(map));
    } catch (e) {
      /* vale só nesta visita */
    }
  };
  /** Resposta nova da escola que a família ainda não abriu (neste aparelho). */
  const hasNewReply = (m) => {
    const p = lastPost(m);
    if (!p || sideOf(p) !== 'escola') return false;
    const seen = seenMap()[m.id];
    return !seen || seen < p.at;
  };

  // ---------- anexos ----------
  const uploaded = new Map(); // nomes dos arquivos enviados nesta sessão (antes de o comando ligá-los)
  const attachList = (ids, removable = false) => {
    if (!ids || !ids.length) return '';
    return html`<div class="attachments">${ids.map((id) => {
      const f = Q.file(id) || uploaded.get(id) || { id, name: 'Arquivo', type: '' };
      return html`<span class="attachment"><a href="${Api.fileUrl(id)}" target="_blank" rel="noopener noreferrer">${icon(f.type === 'application/pdf' ? 'file' : 'image')}<span>${f.name}</span></a>${removable ? html`<button type="button" class="icon-btn sm" data-mg-rmfile="${id}" aria-label="Remover ${f.name}">${icon('x')}</button>` : ''}</span>`;
    })}</div>`;
  };
  const pick = async (current, max = 3) => {
    if (current.length >= max) {
      UI.toast(`Cada mensagem leva até ${max} anexos.`, { tone: 'bad' });
      return current;
    }
    const files = await UI.pickFiles();
    files.forEach((f) => uploaded.set(f.id, f));
    const next = current.concat(files.map((f) => f.id)).slice(0, max);
    if (current.length + files.length > max) UI.toast(`Ficaram só os ${max} primeiros anexos.`, { tone: 'bad' });
    return next;
  };

  /** Nas gavetas do módulo: o aviso de erro de um campo some assim que a pessoa corrige. */
  const clearOnEdit = (el) =>
    el.addEventListener('input', (e) => {
      const f = e.target.closest && e.target.closest('[data-field]');
      if (!f) return;
      UI.$$('.error', f).forEach((x) => x.remove());
      UI.$$('.input.invalid', f).forEach((x) => {
        x.classList.remove('invalid');
        x.removeAttribute('aria-invalid');
      });
    });

  // ---------- detalhes do pedido ----------
  const detailRows = (m) => {
    const d = m.details || {};
    const rows = [];
    if (d.date) {
      const range = d.until && m.kind !== 'medicacao' && d.until !== d.date;
      rows.push(['calendar', range ? 'Período' : 'Data', range ? `${shortDay(d.date)} a ${shortDay(d.until)}` : `${U.cap(relShort(d.date))}${relShort(d.date) !== shortDay(d.date) ? ` · ${shortDay(d.date)}` : ''}`, d.date === today() ? 'today' : '']);
    }
    if (d.time) rows.push(['clock', m.kind === 'saida' ? 'Horário da saída' : 'Horário', d.time.replace(':', 'h'), '']);
    if (d.person) rows.push(['userCheck', m.kind === 'saida' ? 'Quem vem buscar' : 'Quem vai buscar', d.person, '']);
    if (d.document) rows.push(['shield', 'Documento', d.document, '']);
    if (d.medicine) rows.push(['activity', 'Medicamento', d.medicine, '']);
    if (d.dose) rows.push(['zap', 'Dose', d.dose, '']);
    if (d.schedule) rows.push(['clock', 'Horários', d.schedule, '']);
    if (d.until && (m.kind === 'medicacao' || !d.date)) rows.push(['calendar', 'Até quando', `${shortDay(d.until)}${d.until < today() ? ' (já passou)' : ''}`, '']);
    return rows;
  };
  const detailsBlock = (m) => {
    const rows = detailRows(m);
    if (!rows.length) return '';
    return html`<dl class="mg-details">${rows.map(([ic, k, v, tone]) => html`<div class="mg-detail ${tone === 'today' ? 'is-today' : ''}">${icon(ic)}<div><dt>${k}</dt><dd><span class="mg-dv">${v}</span></dd></div></div>`)}</dl>`;
  };
  /** Nome confere com alguém autorizado na ficha? (pelo menos dois nomes iguais, ou o único nome) */
  const nameMatches = (person, name) => {
    const tok = (s) => U.norm(s).split(/[^a-z0-9]+/).filter((t) => t.length > 2 && !['das', 'dos'].includes(t));
    const a = new Set(tok(person));
    const b = tok(name);
    if (!b.length) return false;
    const hits = b.filter((t) => a.has(t)).length;
    return b.length === 1 ? hits === 1 : hits >= 2;
  };
  /** Conferência com a ficha (só equipe): autorizados a buscar, restrição de retirada, alerta de saúde. */
  const checksBlock = (m) => {
    if (Store.family) return '';
    const s = studentOf(m);
    if (!s) return '';
    const out = [];
    const d = m.details || {};
    if ((m.kind === 'busca' || m.kind === 'saida') && d.person) {
      const allowed = (s.pickup || []).map((p) => ({ name: p.name, rel: p.relation, doc: p.document })).concat((s.guardians || []).filter((g) => g.podeBuscar && !g.bloqueado).map((g) => ({ name: g.name, rel: g.relation, doc: '' })));
      const hit = allowed.find((p) => nameMatches(d.person, p.name));
      out.push(
        hit
          ? html`<div class="mg-check ok">${icon('checkCircle')}<div><b>Consta na ficha como autorizada a buscar</b><span>${hit.name}${hit.rel ? ` (${hit.rel.toLowerCase()})` : ''}${hit.doc ? ` · ${hit.doc}` : ''}</span></div></div>`
          : html`<div class="mg-check warn">${icon('alert')}<div><b>Não está na lista de pessoas autorizadas</b><span>${allowed.length ? `Autorizados na ficha: ${allowed.map((p) => `${U.shortName(p.name)}${p.rel ? ` (${p.rel.toLowerCase()})` : ''}`).join(', ')}.` : 'A ficha não tem pessoas autorizadas além dos responsáveis.'} Confira o documento na saída e, se tiver dúvida, ligue para a família.</span></div></div>`,
      );
    }
    if ((m.kind === 'busca' || m.kind === 'saida') && s.restrictions) out.push(html`<div class="mg-check bad">${icon('lock')}<div><b>Restrição de retirada</b><span>${s.restrictions}</span></div></div>`);
    if (m.kind === 'medicacao' && s.alerts && can('alunos.alertas')) out.push(html`<div class="mg-check bad">${icon('heart')}<div><b>Alerta de saúde na ficha</b><span>${s.alerts}</span></div></div>`);
    return out.length ? html`<div class="mg-checks">${out}</div>` : '';
  };

  // ---------- linha do tempo ----------
  const postHTML = (m, p) => {
    const side = sideOf(p);
    const mineSide = Store.family ? 'familia' : 'escola';
    const right = side === mineSide;
    if (p.kind === 'registro') {
      return html`<li class="mg-post is-note"><div class="mg-note-head">${icon('lock')}<b>Nota interna</b><span>só a equipe vê · ${staffName(p.userId)} · ${at(p.at)}</span></div><div class="mg-bubble">${textHTML(p.body)}</div></li>`;
    }
    const s = studentOf(m);
    const who = side === 'familia' ? familyName(s, p.userId) : staffName(p.userId);
    const role = side === 'escola' && p.userId !== (me() || {}).id ? Q.personLabel(p.userId) : '';
    return html`<li class="mg-post ${right ? 'is-right' : 'is-left'} is-${side}">
      <div class="mg-post-meta"><b>${who}</b>${role ? html`<span>${role}</span>` : ''}<time datetime="${p.at}">${validInstant(p.at) ? U.fmtInstant(p.at, { date: false }) : ''}</time></div>
      <div class="mg-bubble">${textHTML(p.body)}${p.attachments && p.attachments.length ? attachList(p.attachments) : ''}</div>
    </li>`;
  };
  const threadHTML = (m) => {
    const posts = postsOf(m);
    let day = '';
    const out = [];
    posts.forEach((p) => {
      if (validInstant(p.at)) {
        const d = dayOfInstant(p.at);
        if (d !== day) {
          day = d;
          out.push(html`<li class="mg-day" aria-hidden="true"><span>${dayLabel(p.at)}</span></li>`);
        }
      }
      out.push(postHTML(m, p));
    });
    // anexos do pedido que não estão em nenhum post (conversas antigas)
    const inPosts = new Set(posts.flatMap((p) => p.attachments || []));
    const loose = (m.attachments || []).filter((id) => !inPosts.has(id));
    if (loose.length) out.push(html`<li class="mg-post is-left">${attachList(loose)}</li>`);
    return html`<ol class="mg-thread" data-mg-thread aria-label="Mensagens da conversa">${out}</ol>`;
  };

  // ---------- rascunhos ----------
  const drafts = () => PageState.get('mensagens.rascunhos', { map: {} }).map;
  const draftOf = (id) => drafts()[id] || (drafts()[id] = { body: '', mode: 'texto', files: [] });
  const QUICK = ['Recebido!', 'Combinado!', 'Agradecemos o aviso!', 'Vamos verificar e retornamos.'];

  const composerHTML = (m) => {
    const d = draftOf(m.id);
    if (Store.preview) return '';
    if (Store.family) {
      if (!portalOn()) return html`<div class="mg-composer is-off">${icon('lock')}<span>A escola desativou as respostas pelo portal. ${settings().phone ? html`Para falar com a escola, ligue para <a href="tel:${U.digits(settings().phone)}">${settings().phone}</a>.` : 'Fale com a secretaria.'}</span></div>`;
      return html`<form class="mg-composer" data-mg-form novalidate>
        <label class="sr-only" for="mg-body">Responder à escola</label>
        <textarea id="mg-body" class="input" rows="3" maxlength="3000" placeholder="${m.status === 'resolvida' ? 'Escreva para reabrir a conversa…' : 'Escreva sua resposta…'}" data-mg-draft>${d.body}</textarea>
        ${attachList(d.files, true)}
        <div class="mg-composer-bar">
          <button type="button" class="btn ghost sm" data-mg="attach">${icon('paperclip')}<span>Anexar</span></button>
          <span class="grow small muted hide-xs">Ctrl + Enter envia</span>
          <button type="submit" class="btn primary">${icon('send')}<span>Enviar</span></button>
        </div>
      </form>`;
    }
    const note = d.mode === 'registro';
    return html`<form class="mg-composer ${note ? 'is-note' : ''}" data-mg-form novalidate>
      <div class="mg-composer-top">
        <div class="seg" role="group" aria-label="Tipo de resposta">
          <button type="button" data-mg-mode="texto" aria-pressed="${tf(!note)}">${icon('send')}Responder à família</button>
          <button type="button" data-mg-mode="registro" aria-pressed="${tf(note)}">${icon('lock')}Nota interna</button>
        </div>
        ${m.kind === 'medicacao' && !note ? html`<button type="button" class="btn sm ghost" data-mg="dose">${icon('activity')}Registrar dose dada</button>` : ''}
      </div>
      <p class="small muted mg-mode-hint">${note
        ? html`${icon('lock')}<span><b>Só a equipe vê.</b> Use para anotar o que foi feito (ex.: "medicado às 14h10", "avó conferida na saída"). A família não recebe e a situação da conversa não muda.</span>`
        : !portalOn()
          ? html`${icon('alert')}<span>As mensagens pelo portal estão desativadas: a família lê a resposta, mas não consegue escrever de volta.</span>`
          : html`${icon('eye')}<span>A família vê esta resposta no portal.</span>`}</p>
      ${!note && !d.body ? html`<div class="mg-quick" role="group" aria-label="Respostas rápidas">${QUICK.map((q) => html`<button type="button" class="chip" data-mg-quick="${q}">${q}</button>`)}</div>` : ''}
      <label class="sr-only" for="mg-body">${note ? 'Nota interna' : 'Resposta para a família'}</label>
      <textarea id="mg-body" class="input" rows="3" maxlength="3000" placeholder="${note ? 'Anotação interna para a equipe…' : 'Escreva a resposta para a família…'}" data-mg-draft>${d.body}</textarea>
      ${note ? '' : attachList(d.files, true)}
      <div class="mg-composer-bar">
        ${note ? '' : html`<button type="button" class="btn ghost sm" data-mg="attach">${icon('paperclip')}<span>Anexar</span></button>`}
        <span class="grow small muted hide-xs">Ctrl + Enter envia</span>
        ${!note && m.status !== 'resolvida' ? html`<button type="button" class="btn" data-mg="send-resolve">${icon('checkCircle')}<span>Enviar e resolver</span></button>` : ''}
        <button type="submit" class="btn primary">${icon(note ? 'check' : 'send')}<span>${note ? 'Salvar nota' : 'Enviar'}</span></button>
      </div>
    </form>`;
  };

  // ---------- conversa ----------
  const convHTML = (m, { back = '#mensagens' } = {}) => {
    const s = studentOf(m);
    const st = m.status;
    const canStatus = !Store.preview && (Store.family ? st !== 'resolvida' : can('mensagens.responder'));
    const studentLink = s && !Store.family && App.pages().some((p) => p.id === 'alunos') ? html`<a href="#alunos/${s.id}">${s.name}</a>` : html`<b>${s ? s.name : 'Aluno'}</b>`;
    return html`<article class="card mg-conv" data-mg-conv="${m.id}">
      <header class="mg-conv-head">
        <a class="btn ghost sm mg-back" href="${back}">${icon('arrowLeft')}Todas as conversas</a>
        <div class="mg-conv-title">
          ${kindIcon(m.kind)}
          <div class="grow">
            <div class="mg-kicker"><b>${kindOf(m.kind).label}</b><span>${openerLabel(m)} · ${at(m.createdAt)}</span></div>
            <h2>${m.subject || kindOf(m.kind).label}</h2>
            <div class="mg-conv-who">${s ? UI.avatar(s.name, 'sm', s.photo) : ''}<span>${studentLink}${className(s) ? html`<span class="muted"> · ${className(s)}</span>` : ''}</span>${statusPill(m)}</div>
          </div>
          ${canStatus
            ? st === 'resolvida'
              ? html`<button type="button" class="btn sm" data-mg="reopen">${icon('undo')}<span>Reabrir</span></button>`
              : html`<button type="button" class="btn sm" data-mg="resolve">${icon('checkCircle')}<span>${Store.family ? 'Assunto resolvido' : 'Marcar resolvida'}</span></button>`
            : ''}
        </div>
      </header>
      ${detailsBlock(m)}
      ${checksBlock(m)}
      ${threadHTML(m)}
      ${composerHTML(m)}
    </article>`;
  };

  // ---------- ações ----------
  const setStatus = async (m, status, btn) => {
    const prev = m.status;
    const res = await UI.act('messages.status', { id: m.id, status }, { btn });
    if (!res) return;
    if (Store.family) {
      // a família só marca como resolvida; para reabrir, basta escrever de novo
      UI.toast('Conversa marcada como resolvida. Se precisar, é só escrever de novo.', { ic: 'checkCircle' });
      return;
    }
    // o servidor não oferece desfazer para a situação: "Desfazer" volta à situação anterior
    UI.toast(status === 'resolvida' ? 'Conversa marcada como resolvida' : 'Conversa reaberta', { action: { label: 'Desfazer', fn: () => UI.act('messages.status', { id: m.id, status: prev }, { ok: 'Situação restaurada' }) } });
  };

  const send = async (m, form, { resolve = false } = {}) => {
    const d = draftOf(m.id);
    const ta = UI.$('#mg-body', form);
    const body = (ta ? ta.value : d.body).trim();
    UI.clearErrors(form);
    if (!body) {
      ta && ta.classList.add('invalid');
      UI.toast(d.mode === 'registro' ? 'Escreva a nota antes de salvar.' : 'Escreva a mensagem antes de enviar.', { tone: 'bad' });
      ta && ta.focus();
      return;
    }
    const note = !Store.family && d.mode === 'registro';
    const input = { id: m.id, body, attachments: note ? [] : d.files.slice() };
    if (note) input.kind = 'registro';
    const btn = UI.$(resolve ? '[data-mg="send-resolve"]' : 'button[type="submit"]', form);
    const res = await UI.act('messages.reply', input, { btn });
    if (!res) return;
    drafts()[m.id] = { body: '', mode: 'texto', files: [] };
    if (resolve) {
      const r2 = await UI.act('messages.status', { id: m.id, status: 'resolvida' });
      if (r2) UI.toast('Resposta enviada e conversa resolvida', { action: { label: 'Reabrir', fn: () => UI.act('messages.status', { id: m.id, status: 'respondida' }, { ok: 'Conversa reaberta' }) } });
    } else UI.toast(note ? 'Nota interna salva (só a equipe vê)' : Store.family ? 'Mensagem enviada à escola' : 'Resposta enviada à família', { ic: note ? 'lock' : 'send' });
    if (histCache().map.has(m.id) && Q.message(m.id)) histCache().map.delete(m.id);
    App.render();
  };

  /** Liga os eventos de uma conversa (equipe ou família) dentro de el. */
  const bindConversation = (el) => {
    const box = UI.$('[data-mg-conv]', el);
    if (!box) return;
    const id = box.dataset.mgConv;
    const form = UI.$('[data-mg-form]', box);
    box.addEventListener('input', (e) => {
      if (e.target.matches('[data-mg-draft]')) {
        draftOf(id).body = e.target.value;
        e.target.classList.remove('invalid');
      }
    });
    box.addEventListener('keydown', (e) => {
      if (e.target.matches('[data-mg-draft]') && e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        const m = findMessage(id);
        if (m && form) send(m, form);
      }
    });
    form &&
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const m = findMessage(id);
        if (m) send(m, form);
      });
    box.addEventListener('click', async (e) => {
      const m = findMessage(id);
      if (!m) return;
      const d = draftOf(id);
      const mode = e.target.closest('[data-mg-mode]');
      if (mode) {
        if (d.mode === mode.dataset.mgMode) return;
        d.mode = mode.dataset.mgMode;
        App.render();
        const ta = document.getElementById('mg-body');
        ta && ta.focus();
        return;
      }
      const q = e.target.closest('[data-mg-quick]');
      if (q) {
        d.body = q.dataset.mgQuick;
        App.render();
        const ta = document.getElementById('mg-body');
        if (ta) {
          ta.focus();
          ta.setSelectionRange(ta.value.length, ta.value.length);
        }
        return;
      }
      const rm = e.target.closest('[data-mg-rmfile]');
      if (rm) {
        d.files = d.files.filter((x) => x !== rm.dataset.mgRmfile);
        App.render();
        return;
      }
      const b = e.target.closest('[data-mg]');
      if (!b) return;
      const a = b.dataset.mg;
      if (a === 'attach') {
        const ta = document.getElementById('mg-body');
        if (ta) d.body = ta.value;
        d.files = await pick(d.files);
        App.render();
      } else if (a === 'resolve') setStatus(m, 'resolvida', b);
      else if (a === 'reopen') setStatus(m, 'aberta', b);
      else if (a === 'send-resolve') send(m, form, { resolve: true });
      else if (a === 'dose') {
        const now = new Date();
        const hh = `${String(now.getHours()).padStart(2, '0')}h${String(now.getMinutes()).padStart(2, '0')}`;
        d.mode = 'registro';
        d.body = `Medicado às ${hh}${m.details && m.details.dose ? ` com ${m.details.dose}` : ''}${m.details && m.details.medicine ? ` de ${m.details.medicine}` : ''}. `;
        App.render();
        const ta = document.getElementById('mg-body');
        if (ta) {
          ta.focus();
          ta.setSelectionRange(ta.value.length, ta.value.length);
        }
      }
    });
  };

  // =====================================================================
  // Equipe: caixa de entrada
  // =====================================================================
  const ST = () => PageState.get('mensagens', { status: 'aberta', kind: '', classId: '', q: '' });
  const STATUS_TABS = [
    ['aberta', 'Para responder'],
    ['respondida', 'Respondidas'],
    ['resolvida', 'Resolvidas'],
    ['todas', 'Todas'],
  ];
  const filtered = () => {
    const f = ST();
    const base = allMessages().filter((m) => {
      if (f.kind && m.kind !== f.kind) return false;
      const s = studentOf(m);
      if (f.classId && (!s || s.classId !== f.classId)) return false;
      if (f.q && !U.matches(f.q, m.subject, s ? s.name : '', className(s), (m.posts || []).map((p) => p.body).join(' '))) return false;
      return true;
    });
    const counts = { aberta: 0, respondida: 0, resolvida: 0, todas: base.length };
    base.forEach((m) => counts[m.status] != null && counts[m.status]++);
    const list = base.filter((m) => f.status === 'todas' || m.status === f.status).sort(byRecent);
    return { list, counts };
  };

  const itemHTML = (m, activeId) => {
    const s = studentOf(m);
    const p = lastPost(m);
    return html`<li><a class="mg-item ${m.id === activeId ? 'active' : ''} ${m.status === 'aberta' ? 'is-open' : ''}" href="#mensagens/${m.id}" ${m.id === activeId ? raw('aria-current="true"') : ''}>
      ${kindIcon(m.kind, 'sm')}
      <span class="mg-item-main">
        <span class="mg-item-top"><b class="mg-item-who">${s ? s.name : 'Aluno'}</b><span class="mg-time">${ago(lastAt(m))}</span></span>
        <span class="mg-item-subj">${m.subject || kindOf(m.kind).label}${className(s) ? html`<span class="muted"> · ${className(s)}</span>` : ''}</span>
        <span class="mg-snippet">${p && p.kind === 'registro' ? icon('lock') : ''}${snippet(m)}</span>
      </span>
      ${m.status === 'aberta' ? html`<span class="mg-dot" title="Aguardando resposta da escola"><span class="sr-only">Para responder</span></span>` : ''}
    </a></li>`;
  };

  const renderStaff = (rest) => {
    const f = ST();
    const id = rest[0] || null;
    const m = id ? findMessage(id) : null;
    const { list, counts } = filtered();
    const classes = Q.workClasses();
    const emptyText = {
      aberta: ['Nada para responder', 'Quando uma família mandar recado, aviso de falta, saída ou medicação, aparece aqui.'],
      respondida: ['Nenhuma conversa respondida', 'As conversas respondidas ficam aqui até alguém marcar como resolvidas.'],
      resolvida: ['Nenhuma conversa resolvida', `As resolvidas dos últimos ${WINDOW_DAYS} dias aparecem aqui. As mais antigas ficam na ficha do aluno.`],
      todas: ['Nenhuma conversa', 'Ainda não há mensagens das famílias das suas turmas.'],
    }[f.status] || ['Nenhuma conversa', ''];
    const filtersOn = f.kind || f.classId || f.q;
    return html`<div class="mg-page ${id ? 'has-conv' : ''}">
      <div class="page-head mg-head">
        <div><h1>Mensagens</h1><p class="lead">Recados das famílias: faltas, saídas antecipadas, quem vai buscar, medicação e outros assuntos.</p></div>
        ${Store.preview ? '' : html`<div class="btn-row"><button type="button" class="btn primary" data-mg-new>${icon('plus')}<span>Mensagem à família</span></button></div>`}
      </div>
      ${!portalOn() ? html`<div class="notice warn mg-head">${icon('alert')}<span class="grow">As famílias não conseguem escrever pelo portal (desligado nas configurações da escola). Vocês ainda podem enviar mensagens e responder às conversas abertas.</span></div>` : ''}
      <div class="mg-split ${id ? 'has-conv' : ''}">
        <section class="card mg-inbox" aria-label="Caixa de entrada">
          <div class="mg-tools">
            <div class="seg mg-status" role="group" aria-label="Situação">${STATUS_TABS.map(([v, l]) => html`<button type="button" data-mg-status="${v}" aria-pressed="${tf(f.status === v)}">${l}${counts[v] ? html` <span class="mg-count">${counts[v]}</span>` : ''}</button>`)}</div>
            <label class="search-box"><span class="sr-only">Buscar nas mensagens</span>${icon('search')}<input class="input" type="search" placeholder="Buscar aluno, assunto ou texto" value="${f.q}" autocomplete="off" data-mg-q></label>
            <div class="mg-selects">
              <select class="input" data-mg-kind aria-label="Tipo de mensagem"><option value="">Todos os tipos</option>${Object.entries(KINDS).map(([k, v]) => html`<option value="${k}" ${f.kind === k ? raw('selected') : ''}>${v.label}</option>`)}</select>
              <select class="input" data-mg-class aria-label="Turma"><option value="">Todas as turmas</option>${classes.map((c) => html`<option value="${c.id}" ${f.classId === c.id ? raw('selected') : ''}>${c.name}</option>`)}</select>
            </div>
          </div>
          ${list.length
            ? html`<ul class="mg-list">${list.map((x) => itemHTML(x, id))}</ul>`
            : html`<div class="mg-empty">${UI.empty({
                icon: f.status === 'aberta' && !filtersOn ? 'checkCircle' : 'inbox',
                title: filtersOn ? 'Nada com esses filtros' : emptyText[0],
                text: filtersOn ? 'Tente outro tipo, turma ou termo de busca.' : emptyText[1],
                action: filtersOn ? html`<button type="button" class="btn sm" data-mg-clear>Limpar filtros</button>` : '',
              })}</div>`}
        </section>
        <section class="mg-pane" aria-live="polite">
          ${m
            ? convHTML(m)
            : id
              ? html`<div class="card">${UI.empty({ icon: 'inbox', title: 'Conversa não encontrada', text: 'Ela pode ser de um aluno fora das suas turmas, ou ter mais de 60 dias (veja na ficha do aluno, aba Mensagens).', action: html`<a class="btn primary" href="#mensagens">Ver a caixa de entrada</a>` })}</div>`
              : html`<div class="card mg-placeholder">${UI.empty({ icon: 'message', title: 'Escolha uma conversa', text: 'Abra uma mensagem da lista para ler os detalhes, responder ou marcar como resolvida.' })}</div>`}
        </section>
      </div>
    </div>`;
  };

  const mountStaff = (el, rest) => {
    const f = ST();
    bindConversation(el);
    el.addEventListener('click', (e) => {
      const s = e.target.closest('[data-mg-status]');
      if (s) {
        f.status = s.dataset.mgStatus;
        App.render();
        return;
      }
      if (e.target.closest('[data-mg-clear]')) {
        Object.assign(f, { kind: '', classId: '', q: '' });
        App.render();
        return;
      }
      if (e.target.closest('[data-mg-new]')) openStaffComposer({});
    });
    el.addEventListener('change', (e) => {
      if (e.target.matches('[data-mg-kind]')) f.kind = e.target.value;
      else if (e.target.matches('[data-mg-class]')) f.classId = e.target.value;
      else return;
      App.render();
    });
    const q = UI.$('[data-mg-q]', el);
    q &&
      q.addEventListener(
        'input',
        U.debounce(() => {
          f.q = q.value.trim();
          const pos = q.selectionStart;
          App.render();
          const nq = document.querySelector('[data-mg-q]');
          if (nq) {
            nq.focus();
            try {
              nq.setSelectionRange(pos, pos);
            } catch (err) {
              /* tipo search sem seleção */
            }
          }
        }, 250),
      );
    if (rest[0]) {
      const cur = UI.$('.mg-item.active', el);
      cur && cur.scrollIntoView({ block: 'nearest' });
    }
  };

  // ---------- seletor de aluno (equipe) ----------
  const studentChoice = (s) => html`<div class="mg-chosen">${UI.avatar(s.name, 'sm', s.photo)}<span class="grow"><b>${s.name}</b><span class="small muted">${className(s)}</span></span><button type="button" class="btn sm ghost" data-mg-pick-change>Trocar</button></div>`;
  const pickerHTML = (selected) => html`<div class="field full mg-picker" data-field="studentId">
      <label for="mg-pick-q">Aluno <span class="req" aria-hidden="true">*</span></label>
      <div data-mg-pick-box>${selected ? studentChoice(selected) : html`<input id="mg-pick-q" class="input" type="search" autocomplete="off" placeholder="Digite o nome do aluno ou da turma" aria-describedby="mg-pick-hint" data-nodirty><span class="hint" id="mg-pick-hint">Mostra os alunos das turmas que você acessa.</span><ul class="mg-pick-list" data-mg-pick-list></ul>`}</div>
      <input type="hidden" name="studentId" value="${selected ? selected.id : ''}">
    </div>`;
  const bindPicker = (root, onChange) => {
    const wrap = UI.$('.mg-picker', root);
    if (!wrap) return;
    const hidden = UI.$('input[name="studentId"]', wrap);
    const box = UI.$('[data-mg-pick-box]', wrap);
    const draw = () => {
      const s = hidden.value ? Q.student(hidden.value) : null;
      UI.setHTML(box, s ? studentChoice(s) : html`<input id="mg-pick-q" class="input" type="search" autocomplete="off" placeholder="Digite o nome do aluno ou da turma" aria-describedby="mg-pick-hint" data-nodirty><span class="hint" id="mg-pick-hint">Mostra os alunos das turmas que você acessa.</span><ul class="mg-pick-list" data-mg-pick-list></ul>`);
      if (!s) {
        const input = UI.$('#mg-pick-q', box);
        input.addEventListener('input', () => results(input.value));
        input.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            const first = UI.$('[data-mg-pick]', box);
            first && first.click();
          } else if (e.key === 'ArrowDown') {
            const first = UI.$('[data-mg-pick]', box);
            if (first) {
              e.preventDefault();
              first.focus();
            }
          }
        });
        setTimeout(() => input.focus(), 30);
      }
      onChange && onChange(s);
    };
    const results = (q) => {
      const list = UI.$('[data-mg-pick-list]', box);
      if (!list) return;
      const query = q.trim();
      if (query.length < 2) return UI.setHTML(list, '');
      const found = Q.students({ status: 'ativo' }).filter((s) => U.matches(query, s.name, className(s))).slice(0, 8);
      UI.setHTML(list, found.length ? found.map((s) => html`<li><button type="button" data-mg-pick="${s.id}">${UI.avatar(s.name, 'sm', s.photo)}<span class="grow"><b>${s.name}</b><span class="small muted">${className(s)}</span></span></button></li>`) : html`<li class="small muted mg-pick-none">Nenhum aluno encontrado.</li>`);
    };
    wrap.addEventListener('click', (e) => {
      const b = e.target.closest('[data-mg-pick]');
      if (b) {
        hidden.value = b.dataset.mgPick;
        UI.clearErrors(wrap);
        draw();
        return;
      }
      if (e.target.closest('[data-mg-pick-change]')) {
        hidden.value = '';
        draw();
      }
    });
    wrap.addEventListener('keydown', (e) => {
      const b = e.target.closest('[data-mg-pick]');
      if (!b || !['ArrowDown', 'ArrowUp'].includes(e.key)) return;
      e.preventDefault();
      const btns = UI.$$('[data-mg-pick]', wrap);
      const i = btns.indexOf(b);
      const j = e.key === 'ArrowDown' ? Math.min(btns.length - 1, i + 1) : i - 1;
      if (j < 0) UI.$('#mg-pick-q', wrap).focus();
      else btns[j].focus();
    });
    draw();
  };

  /** Quem recebe pelo portal (responsáveis com conta ativa e não bloqueada). */
  const recipientsNote = (s) => {
    if (!s) return html`<p class="small muted">Escolha o aluno para ver quem recebe.</p>`;
    const gs = (s.guardians || []).filter((g) => !g.bloqueado);
    const portal = gs.filter((g) => g.userId);
    const parts = [];
    if (portal.length) parts.push(html`<div class="mg-recips ok">${icon('checkCircle')}<span>Chega pelo portal para <b>${html.join(portal.map((g) => `${U.shortName(g.name)}${g.relation ? ` (${g.relation.toLowerCase()})` : ''}`), ', ')}</b>.</span></div>`);
    else
      parts.push(
        html`<div class="mg-recips warn">${icon('alert')}<span><b>Nenhum responsável deste aluno usa o portal ainda.</b> A mensagem fica guardada e aparece quando a família entrar. Para avisar agora, ligue ou mande bilhete.${typeof Actions.convidarResponsavel === 'function' && can('familias.acessos') && gs.length ? html` <button type="button" class="btn sm" data-mg-invite="${gs[0].id}">${icon('send')}Convidar ${U.firstName(gs[0].name)}</button>` : ''}</span></div>`,
      );
    if (s.noDigitalAccess) parts.push(html`<div class="mg-recips warn">${icon('info')}<span>A ficha indica que a família <b>não tem acesso digital</b>. Prefira bilhete impresso ou ligação.</span></div>`);
    if (!portalOn()) parts.push(html`<div class="mg-recips">${icon('lock')}<span>As respostas pelo portal estão desligadas: a família lê, mas não consegue responder por aqui.</span></div>`);
    return html`${parts}`;
  };

  /** Escola inicia conversa com a família. */
  const openStaffComposer = ({ studentId = null } = {}) => {
    if (!can('mensagens.responder')) return UI.toast('Seu acesso não inclui mensagens às famílias.', { tone: 'bad' });
    const preset = studentId ? Q.student(studentId) : null;
    let files = [];
    const defs = [
      { name: 'subject', label: 'Assunto', required: true, maxlength: 120, full: true, placeholder: 'Ex.: Material para a aula de Artes' },
      { name: 'body', label: 'Mensagem', type: 'textarea', required: true, maxlength: 3000, rows: 6, full: true, placeholder: 'Escreva como se fosse um bilhete na agenda: curto e claro.' },
    ];
    UI.formDrawer({
      title: 'Mensagem para a família',
      sub: preset ? html`Sobre <b>${preset.name}</b>${className(preset) ? html` · ${className(preset)}` : ''}` : 'A família recebe no Portal e pode responder por ali.',
      defs,
      submitLabel: 'Enviar mensagem',
      top: html`${preset ? '' : html`<div class="form-grid mg-pick-grid">${pickerHTML(null)}</div>`}<div class="mg-recips-box" data-mg-recips>${recipientsNote(preset)}</div>`,
      bottom: html`<div class="field mg-files" data-field="attachments"><span class="label">Anexos <span class="muted small">(opcional, até 3 · foto ou PDF)</span></span><div data-mg-files></div><div><button type="button" class="btn sm" data-mg-attach>${icon('paperclip')}Anexar arquivo</button></div></div>`,
      onMount(el, api) {
        clearOnEdit(el);
        const recips = UI.$('[data-mg-recips]', el);
        bindPicker(el, (s) => UI.setHTML(recips, recipientsNote(s || preset)));
        const drawFiles = () => UI.setHTML(UI.$('[data-mg-files]', el), attachList(files, true));
        el.addEventListener('click', async (e) => {
          if (e.target.closest('[data-mg-attach]')) {
            files = await pick(files);
            api.setDirty(true);
            drawFiles();
          }
          const rm = e.target.closest('[data-mg-rmfile]');
          if (rm) {
            files = files.filter((x) => x !== rm.dataset.mgRmfile);
            drawFiles();
          }
          const inv = e.target.closest('[data-mg-invite]');
          if (inv) {
            const sid = (UI.$('input[name="studentId"]', el) || {}).value || (preset && preset.id);
            if (sid) Actions.convidarResponsavel(sid, inv.dataset.mgInvite);
          }
        });
      },
      async onSubmit(data, api, form) {
        const root = api.el;
        const sid = preset ? preset.id : (UI.$('input[name="studentId"]', root) || {}).value;
        if (!sid) {
          UI.markField(root, 'studentId', 'Escolha o aluno.', false);
          const q = UI.$('#mg-pick-q', root);
          q && q.focus();
          return null;
        }
        const res = await UI.act('messages.create', { studentId: sid, kind: 'recado', subject: data.subject, body: data.body, attachments: files }, { form });
        if (!res) return null;
        const id = res.result.id;
        UI.toast('Mensagem enviada à família', { ic: 'send', action: { label: 'Abrir conversa', fn: () => App.go('mensagens/' + id) } });
        return true;
      },
    });
  };

  // =====================================================================
  // Família
  // =====================================================================
  const FST = () => PageState.get('mensagens.familia', { child: '' });
  const famList = () => {
    const kids = Q.myChildren();
    const f = FST();
    const ids = new Set(kids.map((k) => k.id));
    return Store.state.messages.filter((m) => ids.has(m.studentId) && (!f.child || m.studentId === f.child)).sort(byRecent);
  };
  const hoursNotice = () => {
    const s = settings();
    const phone = s.phone ? html`<a href="tel:${U.digits(s.phone)}">${s.phone}</a>` : '';
    if (!s.officeHours && !phone) return '';
    return html`<div class="mg-hours">${icon('clock')}<span><b>Atendimento da escola${s.officeHours ? ':' : ''}</b> ${s.officeHours || ''}${phone ? html`<span class="mg-hours-phone">${s.officeHours ? ' · ' : ''}Telefone ${phone}</span>` : ''}<br><span class="small muted">As mensagens são lidas nesse horário. Para urgências, ligue para a escola.</span></span></div>`;
  };
  const famItemHTML = (m, multi) => {
    const s = studentOf(m);
    const fresh = hasNewReply(m);
    return html`<li><a class="mg-fitem ${fresh ? 'is-new' : ''}" href="#mensagens/${m.id}">
      ${kindIcon(m.kind)}
      <span class="mg-item-main">
        <span class="mg-item-top"><b class="mg-item-who">${m.subject || kindOf(m.kind).label}</b><span class="mg-time">${ago(lastAt(m))}</span></span>
        ${multi && s ? html`<span class="mg-fchild">${icon('user')}${U.firstName(s.name)}</span>` : ''}
        <span class="mg-snippet">${snippet(m)}</span>
        <span class="mg-fpills">${fresh ? UI.pill('Resposta nova', 'mark') : ''}${statusPill(m)}</span>
      </span>
      ${icon('chevronRight', 'muted')}
    </a></li>`;
  };
  const tilesHTML = () =>
    html`<div class="mg-tiles" role="group" aria-label="Nova mensagem">${FAMILY_KINDS.map(
      (k) => html`<button type="button" class="mg-tile" data-mg-fnew="${k}">${kindIcon(k)}<span><b>${KINDS[k].fam}</b><span>${KINDS[k].hint}</span></span></button>`,
    )}</div>`;

  const renderFamily = (rest) => {
    const kids = Q.myChildren();
    const id = rest[0] || null;
    if (id) {
      const m = Q.message(id);
      if (!m) return html`<nav class="crumbs" aria-label="Caminho"><a href="#mensagens">Mensagens</a></nav><div class="card">${UI.empty({ icon: 'inbox', title: 'Conversa não encontrada', text: 'Ela pode ter sido encerrada há muito tempo. Volte para a lista de mensagens.', action: html`<a class="btn primary" href="#mensagens">Ver mensagens</a>` })}</div>`;
      return html`<div class="mg-page has-conv mg-fam-conv">${convHTML(m)}${hoursNotice()}</div>`;
    }
    const f = FST();
    if (f.child && !kids.some((k) => k.id === f.child)) f.child = '';
    const list = famList();
    const multi = kids.length > 1;
    const newCount = list.filter(hasNewReply).length;
    return html`<div class="mg-page mg-fam">
      <div class="page-head"><div><h1>Mensagens</h1><p class="lead">Avise a escola sobre faltas, saídas, quem vai buscar e medicação, ou mande um recado. A resposta chega aqui.</p></div></div>
      ${portalOn()
        ? html`<section class="mg-fnew" aria-labelledby="mg-fnew-h"><h2 id="mg-fnew-h">O que você precisa avisar?</h2>${tilesHTML()}</section>`
        : html`<div class="notice warn">${icon('lock')}<span class="grow"><b>A escola desativou as mensagens pelo portal.</b> ${settings().phone ? html`Para avisar faltas, saídas ou medicação, ligue para <a href="tel:${U.digits(settings().phone)}">${settings().phone}</a>.` : 'Para avisar faltas, saídas ou medicação, fale com a secretaria.'} As conversas anteriores continuam abaixo.</span></div>`}
      ${hoursNotice()}
      <section class="card mg-fconvs">
        <div class="card-head"><h2>${icon('inbox')}Conversas${newCount ? html` <span class="badge">${newCount}</span>` : ''}</h2>
          ${multi ? html`<div class="seg" role="group" aria-label="Filho">${[['', 'Todos']].concat(kids.map((k) => [k.id, U.firstName(k.name)])).map(([v, l]) => html`<button type="button" data-mg-child="${v}" aria-pressed="${tf(f.child === v)}">${l}</button>`)}</div>` : ''}
        </div>
        <div class="card-body">${list.length
          ? html`<ul class="mg-flist">${list.map((m) => famItemHTML(m, multi))}</ul>`
          : UI.empty({ icon: 'message', title: 'Nenhuma conversa ainda', text: portalOn() ? 'Escolha acima o que você quer avisar. A escola responde por aqui, e você recebe a resposta nesta tela.' : 'Quando a escola enviar uma mensagem, ela aparece aqui.' })}</div>
      </section>
    </div>`;
  };
  const mountFamily = (el, rest) => {
    bindConversation(el);
    if (rest[0]) {
      const m = Q.message(rest[0]);
      if (m) markSeen(m);
    }
    el.addEventListener('click', (e) => {
      const n = e.target.closest('[data-mg-fnew]');
      if (n) return openFamilyComposer(n.dataset.mgFnew, { studentId: FST().child || null });
      const c = e.target.closest('[data-mg-child]');
      if (c) {
        FST().child = c.dataset.mgChild;
        App.render();
      }
    });
  };

  // ---------- formulários da família ----------
  const childName = (sid) => U.firstName((Q.student(sid) || {}).name || 'seu filho');
  const FAMILY_FORMS = {
    falta: {
      title: 'Avisar falta',
      defs: () => [
        { name: 'details.date', label: 'Dia da falta', type: 'date', required: true, value: today() },
        { name: 'details.until', label: 'Até (se for mais de um dia)', type: 'date', hint: 'Deixe em branco se for só um dia.', check: (v, d) => (v && d.details && d.details.date && v < d.details.date ? 'Precisa ser depois do primeiro dia.' : '') },
        { name: 'note', label: 'Motivo', type: 'textarea', rows: 3, maxlength: 2000, full: true, placeholder: 'Ex.: consulta médica, viagem, está doente…' },
      ],
      files: { label: 'Atestado (opcional)', hint: 'Se tiver atestado, anexe a foto ou o PDF.' },
      subject: (d) => (d.until && d.until !== d.date ? `Falta de ${ddmm(d.date)} a ${ddmm(d.until)}` : `Falta em ${ddmm(d.date)}`),
      body: (d, sid) => `${childName(sid)} não vai à escola ${d.until && d.until !== d.date ? `de ${shortDay(d.date)} a ${shortDay(d.until)}` : whenText(d.date)}.`,
    },
    saida: {
      title: 'Saída antecipada',
      defs: () => [
        { name: 'details.date', label: 'Dia', type: 'date', required: true, value: today(), check: (v) => (v && v < today() ? 'Essa data já passou.' : '') },
        { name: 'details.time', label: 'Horário da saída', type: 'time', required: true },
        { name: 'details.person', label: 'Quem vem buscar', required: true, maxlength: 120, full: true, placeholder: 'Nome e parentesco. Ex.: Maria Aparecida (avó)' },
        { name: 'note', label: 'Observação', type: 'textarea', rows: 3, maxlength: 2000, full: true, placeholder: 'Ex.: consulta às 11h; ela já sabe que sai mais cedo.' },
      ],
      pickup: true,
      subject: (d) => `Saída antecipada em ${ddmm(d.date)} às ${d.time.replace(':', 'h')}`,
      body: (d, sid) => `${childName(sid)} vai sair mais cedo ${whenText(d.date)}, às ${d.time.replace(':', 'h')}. Quem vem buscar: ${d.person}.`,
    },
    busca: {
      title: 'Outra pessoa vai buscar',
      defs: () => [
        { name: 'details.person', label: 'Nome de quem vai buscar', required: true, maxlength: 120, full: true, placeholder: 'Nome completo e parentesco. Ex.: Maria Aparecida (avó)' },
        { name: 'details.date', label: 'Dia', type: 'date', required: true, value: today(), check: (v) => (v && v < today() ? 'Essa data já passou.' : '') },
        { name: 'details.document', label: 'Documento da pessoa', required: true, maxlength: 60, placeholder: 'Ex.: RG 12.345.678-9', hint: 'A escola confere o documento na saída.' },
        { name: 'note', label: 'Observação', type: 'textarea', rows: 3, maxlength: 2000, full: true },
      ],
      pickup: true,
      subject: (d) => `Quem vai buscar em ${ddmm(d.date)}`,
      body: (d, sid) => `${U.cap(whenText(d.date).replace(/^em /, ''))}, quem vai buscar ${childName(sid)} é ${d.person} (${d.document}).`,
    },
    medicacao: {
      title: 'Pedido de medicação',
      defs: () => [
        { name: 'details.medicine', label: 'Remédio', required: true, maxlength: 120, placeholder: 'Ex.: Paracetamol gotas' },
        { name: 'details.dose', label: 'Dose', required: true, maxlength: 60, placeholder: 'Ex.: 15 gotas, 5 ml' },
        { name: 'details.schedule', label: 'Horários', required: true, maxlength: 120, placeholder: 'Ex.: 10h e 15h, ou se tiver febre' },
        { name: 'details.until', label: 'Até quando', type: 'date', value: today(), check: (v) => (v && v < today() ? 'Essa data já passou.' : '') },
        { name: 'note', label: 'Observações', type: 'textarea', rows: 3, maxlength: 2000, full: true, placeholder: 'Ex.: o remédio está na mochila, na bolsinha azul.' },
      ],
      files: { label: 'Receita (recomendado)', hint: 'Anexe a foto da receita médica.' },
      subject: (d) => `Medicação: ${d.medicine}`,
      body: (d, sid) => `Por favor, dar ${d.medicine} para ${childName(sid)}: ${d.dose}, ${d.schedule}${d.until ? `, até ${shortDay(d.until)}` : ''}.`,
    },
    atestado: {
      title: 'Enviar atestado',
      defs: () => [
        { name: 'details.date', label: 'Primeiro dia do atestado', type: 'date', required: true, value: today() },
        { name: 'details.until', label: 'Último dia', type: 'date', check: (v, d) => (v && d.details && d.details.date && v < d.details.date ? 'Precisa ser depois do primeiro dia.' : '') },
        { name: 'note', label: 'Observação', type: 'textarea', rows: 3, maxlength: 2000, full: true },
      ],
      files: { label: 'Atestado', hint: 'Foto ou PDF do atestado médico.', required: true },
      subject: (d) => (d.until && d.until !== d.date ? `Atestado de ${ddmm(d.date)} a ${ddmm(d.until)}` : `Atestado de ${ddmm(d.date)}`),
      body: (d, sid) => `Segue o atestado médico de ${childName(sid)}${d.until && d.until !== d.date ? ` (${shortDay(d.date)} a ${shortDay(d.until)})` : ` (${shortDay(d.date)})`}.`,
    },
    recado: {
      title: 'Recado para a escola',
      defs: () => [
        { name: 'subject', label: 'Assunto', required: true, maxlength: 120, full: true, placeholder: 'Ex.: Dúvida sobre o trabalho de Ciências' },
        { name: 'note', label: 'Mensagem', type: 'textarea', rows: 6, required: true, maxlength: 3000, full: true },
      ],
      files: { label: 'Anexo (opcional)', hint: 'Foto ou PDF, se precisar.' },
      subject: (d, data) => data.subject,
      body: () => '',
    },
  };

  const pickupChips = (s) => {
    const list = (s && s.pickup) || [];
    if (!list.length) return '';
    return html`<div class="mg-pickup"><span class="small muted">Pessoas já autorizadas na ficha:</span><div class="chips">${list.map((p) => html`<button type="button" class="chip" data-mg-person="${p.id}">${icon('userCheck')}${U.shortName(p.name)}${p.relation ? ` (${p.relation.toLowerCase()})` : ''}</button>`)}</div></div>`;
  };

  const chooseKind = (opts) =>
    UI.modal({
      title: 'Nova mensagem para a escola',
      sub: 'Escolha o assunto. Cada um tem um formulário curto.',
      body: tilesHTML(),
      onMount(el, api) {
        el.addEventListener('click', (e) => {
          const b = e.target.closest('[data-mg-fnew]');
          if (!b) return;
          api.close();
          openFamilyComposer(b.dataset.mgFnew, opts);
        });
      },
    });

  const openFamilyComposer = (kind, { studentId = null } = {}) => {
    if (!portalOn()) return UI.toast('A escola desativou as mensagens pelo portal. Fale com a secretaria.', { tone: 'bad' });
    if (!kind || !FAMILY_FORMS[kind]) return chooseKind({ studentId });
    const kids = Q.myChildren();
    if (!kids.length) return UI.toast('Nenhum aluno vinculado à sua conta. Fale com a secretaria.', { tone: 'bad' });
    const form = FAMILY_FORMS[kind];
    const single = kids.length === 1 ? kids[0] : null;
    const chosen = single ? single.id : kids.some((k) => k.id === studentId) ? studentId : '';
    let files = [];
    const defs = [];
    if (!single) defs.push({ name: 'studentId', label: 'Sobre qual filho?', type: 'chips', required: true, full: true, options: kids.map((k) => [k.id, U.firstName(k.name)]), value: chosen });
    defs.push(...form.defs());
    const fileField = form.files
      ? html`<div class="field mg-files" data-field="attachments"><span class="label">${form.files.label}${form.files.required ? html` <span class="req" aria-hidden="true">*</span>` : ''}</span><span class="hint">${form.files.hint} Até 3 arquivos, 10 MB cada.</span><div data-mg-files></div><div><button type="button" class="btn sm" data-mg-attach>${icon('paperclip')}Anexar ${form.files.required ? 'atestado' : 'arquivo'}</button></div></div>`
      : '';
    UI.formDrawer({
      title: form.title,
      sub: single ? html`Sobre <b>${single.name}</b>${className(single) ? html` · ${className(single)}` : ''}` : 'A escola recebe agora e responde por aqui.',
      defs,
      values: { studentId: chosen },
      submitLabel: 'Enviar para a escola',
      top: html`<div class="mg-fdrawer-top">${kindIcon(kind)}<p class="small muted">${{ falta: 'A escola fica sabendo antes da chamada. Se tiver atestado, anexe.', saida: 'A portaria e a professora ficam avisadas do horário e de quem vem buscar.', busca: 'Por segurança, a escola só entrega o aluno a quem estiver avisado e com documento.', medicacao: 'Informe exatamente o remédio, a dose e os horários. Mande o remédio identificado com o nome do aluno.', atestado: 'O atestado fica guardado na conversa e a secretaria registra a justificativa.', recado: 'Para dúvidas, combinados e outros assuntos.' }[kind]}</p></div>`,
      bottom: html`${form.pickup ? html`<div data-mg-pickup>${pickupChips(single || Q.student(chosen))}</div>` : ''}${fileField}`,
      onMount(el, api) {
        clearOnEdit(el);
        const drawFiles = () => {
          const box = UI.$('[data-mg-files]', el);
          box && UI.setHTML(box, attachList(files, true));
        };
        el.addEventListener('change', (e) => {
          if (e.target.name === 'studentId' && form.pickup) UI.setHTML(UI.$('[data-mg-pickup]', el), pickupChips(Q.student(e.target.value)));
        });
        el.addEventListener('click', async (e) => {
          if (e.target.closest('[data-mg-attach]')) {
            files = await pick(files);
            api.setDirty(true);
            UI.clearErrors(UI.$('[data-field="attachments"]', el) || el);
            drawFiles();
            return;
          }
          const rm = e.target.closest('[data-mg-rmfile]');
          if (rm) {
            files = files.filter((x) => x !== rm.dataset.mgRmfile);
            drawFiles();
            return;
          }
          const p = e.target.closest('[data-mg-person]');
          if (p) {
            const sid = single ? single.id : (UI.$('input[name="studentId"]:checked', el) || {}).value;
            const person = ((Q.student(sid) || {}).pickup || []).find((x) => x.id === p.dataset.mgPerson);
            if (!person) return;
            const name = UI.$('[name="details.person"]', el);
            const doc = UI.$('[name="details.document"]', el);
            if (name) name.value = `${person.name}${person.relation ? ` (${person.relation.toLowerCase()})` : ''}`;
            if (doc && person.document) doc.value = person.document;
            api.setDirty(true);
          }
        });
      },
      async onSubmit(data, api, formEl) {
        const sid = single ? single.id : data.studentId;
        const d = {};
        Object.entries(data.details || {}).forEach(([k, v]) => v && (d[k] = v));
        if (form.files && form.files.required && !files.length) {
          UI.markField(api.el, 'attachments', 'Anexe o atestado (foto ou PDF).', false);
          const b = UI.$('[data-mg-attach]', api.el);
          b && b.focus();
          return null;
        }
        const note = (data.note || '').trim();
        const auto = form.body(d, sid);
        const body = kind === 'recado' ? note : note ? `${auto}\n\n${note}` : auto;
        const input = { studentId: sid, kind, subject: form.subject(d, data).slice(0, 120), details: d, body, attachments: files };
        const res = await UI.act('messages.create', input, { form: formEl });
        if (!res) return null;
        UI.toast('Mensagem enviada à escola. A resposta chega nesta tela.', { ic: 'send' });
        App.go('mensagens/' + res.result.id);
        return true;
      },
    });
  };

  // =====================================================================
  // Registro das telas
  // =====================================================================
  App.page({
    id: 'mensagens',
    label: 'Mensagens',
    icon: 'inbox',
    group: 'Dia a dia',
    order: 40,
    perm: 'mensagens.responder',
    keys: 'recado família falta saída buscar medicação atestado bilhete',
    badge: () => {
      const n = Q.openMessages().length;
      return n ? { n, title: `${n} ${n === 1 ? 'mensagem aguardando' : 'mensagens aguardando'} resposta` } : null;
    },
    title: (rest) => {
      const m = rest[0] && findMessage(rest[0]);
      return m ? `${m.subject || 'Conversa'} · Mensagens` : 'Mensagens';
    },
    render: (rest) => renderStaff(rest),
    mount: (el, rest) => mountStaff(el, rest),
  });

  App.page({
    id: 'mensagens',
    label: 'Mensagens',
    icon: 'message',
    family: true,
    order: 30,
    tab: 3,
    keys: 'falta saída buscar medicação atestado recado escola',
    badge: () => {
      const ids = new Set(Q.myChildren().map((k) => k.id));
      const n = Store.state.messages.filter((m) => ids.has(m.studentId) && hasNewReply(m)).length;
      return n ? { n, title: `${n} ${n === 1 ? 'resposta nova' : 'respostas novas'} da escola` } : null;
    },
    title: (rest) => {
      const m = rest[0] && Q.message(rest[0]);
      return m ? `${m.subject || 'Conversa'} · Mensagens` : 'Mensagens';
    },
    render: (rest) => renderFamily(rest),
    mount: (el, rest) => mountFamily(el, rest),
  });

  // ---------- ficha do aluno ----------
  App.studentTab({
    id: 'mensagens',
    label: 'Mensagens',
    order: 50,
    perm: 'mensagens.responder',
    badge: (s) => {
      const n = Store.state.messages.filter((m) => m.studentId === s.id && m.status === 'aberta').length;
      return n ? { n, title: 'Mensagens aguardando resposta' } : null;
    },
    render(s) {
      const list = allMessages().filter((m) => m.studentId === s.id).sort(byRecent);
      const key = 's|' + s.id;
      return html`<div class="mg-stab">
        <div class="btn-row">${!Store.preview ? html`<button type="button" class="btn primary" data-mg-snew>${icon('message')}Mensagem à família</button>` : ''}</div>
        <section class="card">
          <div class="card-head"><h2>${icon('inbox')}Conversas com a família</h2><span class="sub">${list.length ? U.plural(list.length, 'conversa', 'conversas') : ''}</span></div>
          <div class="card-body">${list.length
            ? html`<ul class="mg-slist">${list.map((m) => {
                const p = lastPost(m);
                return html`<li><a class="mg-sitem" href="#mensagens/${m.id}">${kindIcon(m.kind, 'sm')}<span class="mg-item-main"><span class="mg-item-top"><b class="mg-item-who">${m.subject || kindOf(m.kind).label}</b><span class="mg-time">${at(lastAt(m))}</span></span><span class="mg-snippet">${p && p.kind === 'registro' ? icon('lock') : ''}${snippet(m)}</span></span>${statusPill(m)}</a></li>`;
              })}</ul>`
            : html`<p class="muted small">Nenhuma conversa com a família nos últimos ${WINDOW_DAYS} dias.</p>`}
            <div class="mg-shist">${histCache().done.has(key) ? html`<span class="small muted">Conversas antigas carregadas.</span>` : html`<button type="button" class="btn ghost sm" data-mg-shist>${icon('history')}Carregar conversas com mais de ${WINDOW_DAYS} dias</button>`}</div>
          </div>
        </section>
      </div>`;
    },
    mount(el, s) {
      el.addEventListener('click', async (e) => {
        if (e.target.closest('[data-mg-snew]')) return openStaffComposer({ studentId: s.id });
        const h = e.target.closest('[data-mg-shist]');
        if (h) {
          h.disabled = true;
          h.classList.add('loading');
          try {
            const owner = ownerKey();
            const r = await Api.history('messages', { studentId: s.id, before: windowStart(), limit: 100 });
            // a pessoa saiu ou trocou de conta enquanto o pedido estava no caminho: descarta
            if (ownerKey() !== owner) return;
            const h = histCache();
            (r.items || []).forEach((it) => it && it.value && it.value.studentId === s.id && !Q.message(it.id) && h.map.set(it.id, it.value));
            h.done.add('s|' + s.id);
            UI.toast(r.items && r.items.length ? `${U.plural(r.items.length, 'conversa antiga carregada', 'conversas antigas carregadas')}` : 'Não há conversas mais antigas.', { ic: 'history' });
          } catch (err) {
            UI.errorToast(err);
          }
          App.render();
        }
      });
    },
  });

  // ---------- painel ----------
  App.widget({
    id: 'mensagens-abertas',
    order: 18,
    size: 'half',
    perm: 'mensagens.responder',
    render() {
      const open = Q.openMessages().slice().sort((a, b) => lastAt(a).localeCompare(lastAt(b)));
      const T = today();
      const exits = Store.state.messages.filter((m) => (m.kind === 'busca' || m.kind === 'saida') && m.details && m.details.date === T).sort((a, b) => ((a.details.time || '') < (b.details.time || '') ? -1 : 1));
      const shown = open.slice(0, 5);
      return html`<section class="card mg-widget">
        <div class="card-head"><h2>${icon('inbox')}Mensagens das famílias</h2><a class="sub" href="#mensagens">${open.length ? `${open.length} para responder` : 'Abrir caixa'}</a></div>
        <div class="card-body">
          ${exits.length
            ? html`<div class="mg-w-exits"><b class="small">${icon('door')}Saídas e buscas de hoje</b><ul>${exits.map((m) => {
                const s = studentOf(m);
                return html`<li><a href="#mensagens/${m.id}"><span class="num">${m.details.time ? m.details.time.replace(':', 'h') : '—'}</span><span class="grow">${s ? U.shortName(s.name) : 'Aluno'}${className(s) ? html` <span class="muted">· ${className(s)}</span>` : ''}</span><span class="muted small">${m.details.person || ''}</span></a></li>`;
              })}</ul></div>`
            : ''}
          ${shown.length
            ? html`<ul class="items mg-w-list">${shown.map((m) => {
                const s = studentOf(m);
                return html`<li>${kindIcon(m.kind, 'sm')}<a class="grow mg-w-link" href="#mensagens/${m.id}"><b>${m.subject || kindOf(m.kind).label}</b><span class="small muted">${s ? U.shortName(s.name) : ''}${className(s) ? ` · ${className(s)}` : ''} · ${ago(lastAt(m))}</span></a></li>`;
              })}</ul>${open.length > shown.length ? html`<a class="btn sm ghost" href="#mensagens">Ver todas (${open.length})${icon('arrowRight')}</a>` : ''}`
            : html`<p class="muted small mg-w-empty">${icon('checkCircle')}Tudo respondido. As mensagens novas das famílias aparecem aqui.</p>`}
        </div>
      </section>`;
    },
    mount(el) {
      el.addEventListener('click', (e) => {
        const a = e.target.closest('a[href^="#mensagens/"]');
        if (a) ST().status = 'todas';
      });
    },
  });

  App.widget({
    id: 'mensagens-familia',
    family: true,
    order: 30,
    size: 'half',
    render() {
      const ids = new Set(Q.myChildren().map((k) => k.id));
      const mine = Store.state.messages.filter((m) => ids.has(m.studentId)).sort(byRecent);
      const fresh = mine.filter(hasNewReply);
      const waiting = mine.filter((m) => m.status === 'aberta').length;
      const multi = ids.size > 1;
      return html`<section class="card mg-widget">
        <div class="card-head"><h2>${icon('message')}Mensagens da escola</h2><a class="sub" href="#mensagens">Abrir</a></div>
        <div class="card-body">
          ${fresh.length
            ? html`<ul class="items mg-w-list">${fresh.slice(0, 4).map((m) => {
                const p = lastPost(m);
                const s = studentOf(m);
                return html`<li>${kindIcon(m.kind, 'sm')}<a class="grow mg-w-link" href="#mensagens/${m.id}"><b>${m.subject || kindOf(m.kind).label}</b><span class="small muted">${multi && s ? `${U.firstName(s.name)} · ` : ''}${p ? `${authorOf(m, p, { short: true })} respondeu ${ago(p.at)}` : ''}</span></a>${UI.pill('Nova', 'mark')}</li>`;
              })}</ul>`
            : html`<p class="muted small mg-w-empty">${icon('checkCircle')}Nenhuma resposta nova.${waiting ? ` ${U.plural(waiting, 'mensagem sua aguarda', 'mensagens suas aguardam')} a escola.` : ''}</p>`}
          ${portalOn() ? html`<div class="btn-row mg-w-btns"><button type="button" class="btn sm" data-mg-wf="falta">${icon('calendar')}Avisar falta</button><button type="button" class="btn sm ghost" data-mg-wf="">${icon('plus')}Outra mensagem</button></div>` : ''}
        </div>
      </section>`;
    },
    mount(el) {
      el.addEventListener('click', (e) => {
        const b = e.target.closest('[data-mg-wf]');
        if (b) openFamilyComposer(b.dataset.mgWf || null, {});
      });
    },
  });

  // ---------- menu "Novo" e busca ----------
  App.action({ id: 'nova-mensagem', label: 'Mensagem para a família', icon: 'message', order: 35, perm: 'mensagens.responder', keys: 'mensagem família responsável recado bilhete pais', run: () => openStaffComposer({}) });
  App.action({ id: 'familia-avisar-falta', label: 'Avisar falta', icon: 'calendar', order: 10, family: true, when: portalOn, keys: 'falta faltar não vai aula atestado', run: () => openFamilyComposer('falta', {}) });
  App.action({ id: 'familia-nova-mensagem', label: 'Mensagem para a escola', icon: 'message', order: 11, family: true, when: portalOn, keys: 'recado saída buscar medicação remédio mensagem', run: () => openFamilyComposer(null, {}) });

  App.searchProvider((query) => {
    const list = Store.family ? Store.state.messages : can('mensagens.responder') ? Store.state.messages : [];
    return list
      .filter((m) => U.matches(query, m.subject, (studentOf(m) || {}).name || ''))
      .sort(byRecent)
      .slice(0, 5)
      .map((m) => ({ group: 'Mensagens', label: m.subject || kindOf(m.kind).label, icon: kindOf(m.kind).icon, meta: `${U.shortName((studentOf(m) || {}).name || '')} · ${(Store.family ? FAMILY_STATUS : STAFF_STATUS)[m.status].label}`, run: () => App.go('mensagens/' + m.id) }));
  });

  Actions.novaMensagem = (opts = {}) => (Store.family ? openFamilyComposer(opts.kind || null, opts) : openStaffComposer(opts));
  Actions.abrirMensagem = (id) => App.go('mensagens/' + id);
})();
