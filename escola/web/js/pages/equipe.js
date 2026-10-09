'use strict';
/* Módulo: Equipe e acessos.
   - #equipe: lista da equipe (busca, cargo, situação de acesso) ou diretório (só equipe.ver).
   - #equipe/<id>: detalhe da pessoa (acessos efetivos, turmas, último acesso, ações conforme a dominância).
   - #equipe/perfis: perfis de acesso por cargo (profiles.save).
   - Assistente "Nova conta da equipe" (users.save + staff.links) em passos: pessoa, cargo, acessos, turmas, conferir.
   - Cartão do painel 'equipe-acessos', busca de pessoas, Actions.novaConta / editarConta / verPessoa.
   O servidor confere tudo de novo (permissão, dominância, escopo); aqui só escondemos o que a pessoa não pode fazer. */
(() => {
  const P = Core.perms;
  const GROUPS = ['Gestão', 'Pedagógico', 'Sala de aula', 'Apoio', 'Administrativo'];
  const SEGMENTS = ['Educação Infantil', 'Fundamental I', 'Fundamental II', 'Ensino Médio', 'EJA', 'Outro'];
  const STAFF_ROLES = P.ROLES.filter((r) => !r.family);
  const SOON_DAYS = 30;
  const ROLE_INFO = {
    diretor: 'Vê e gerencia tudo: alunos, notas, financeiro, equipe e configurações.',
    vice: 'Como a direção, mas sem criar contas nem fazer backup.',
    mantenedor: 'Acompanha números da escola: frequência, notas, financeiro e relatórios.',
    coordenador: 'Turmas, chamada, notas, agenda, aprovações e acesso das famílias.',
    orientador: 'Acompanha alunos e famílias e registra atendimentos de orientação.',
    professor: 'Chamada, notas e agenda só das turmas em que dá aula.',
    auxiliar: 'Apoio na turma: chamada, agenda, rotina e recados.',
    aee: 'Atendimento educacional especializado dos alunos vinculados.',
    apoio: 'Acompanha alunos vinculados (mediação): alertas, saúde e agenda.',
    interprete: 'Acompanha as turmas vinculadas: agenda e alertas de saúde.',
    monitor: 'Circula pela escola: vê alertas e registra ocorrências.',
    estagiario: 'Acompanha as turmas vinculadas, só para consulta e com prazo.',
    psicologo: 'Atendimentos sigilosos de psicologia e planos de apoio.',
    psicopedagogo: 'Atendimentos de psicopedagogia e planos de apoio.',
    assistente_social: 'Contatos das famílias e atendimentos de serviço social.',
    enfermagem: 'Saúde, alergias, medicação e contatos de emergência.',
    nutricionista: 'Restrições alimentares e comunicados sobre alimentação.',
    bibliotecario: 'Consulta alunos e turmas.',
    secretaria: 'Matrículas, fichas, famílias, documentos e recebimentos.',
    aux_secretaria: 'Cadastros, contatos e acesso das famílias.',
    financeiro: 'Mensalidades, recebimentos e relatórios financeiros.',
    portaria: 'Entrada e saída: alunos, alertas e recados das famílias.',
    outro: 'Acesso mínimo: ajuste as permissões no passo seguinte.',
  };

  // ---------- utilidades ----------
  const S = () => Store.state;
  const settings = () => Q.settings();
  const today = () => U.today();
  const roleLabel = (r) => P.roleLabel(r);
  const roleGroup = (r) => (P.ROLE[r] ? P.ROLE[r].group : 'Administrativo');
  const titleOf = (u) => (u && u.title) || roleLabel(u && u.role);
  /** Formas flexionadas de um título com "(a)": 'Psicopedagogo(a)' → ['Psicopedagoga', 'Psicopedagogo']; sem "(a)", null. */
  const titleForms = (label) => (label && /\(a\)/.test(label) ? [label.replace(/o\(a\)/g, 'a').replace(/\(a\)/g, 'a'), label.replace(/\(a\)/g, '')] : null);
  /** O cargo acrescenta algo ao título? ("Professora" já diz "Professor(a)"; "Recepção" não diz "Portaria / recepção") */
  const roleAdds = (u) => {
    if (!u || !u.title) return false;
    const stem = (x) => U.norm(x).replace(/\(.*?\)/g, '').split(/[^a-z]+/).filter(Boolean)[0] || '';
    return stem(u.title).slice(0, 5) !== stem(roleLabel(u.role)).slice(0, 5);
  };
  const canLogin = (u) => !!u && (u.login || (Store.me && u.id === Store.me.id));
  const shortPerm = (k) => P.label(k).replace(/^Pode /, '');
  const sameSet = (a, b) => a.size === b.size && [...a].every((x) => b.has(x));
  const myPerms = () => new Set((Store.me && Store.me.perms) || []);
  const myDoc = () => (Store.me ? Q.user(Store.me.id) : null);
  const subjName = (id) => (Q.subject(id) || {}).name || 'Disciplina';
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
  /** Pode conceder p? Precisa ter p e o que ela implica (permissões confidenciais à parte, como no servidor). */
  const canGrant = (p, mine = myPerms()) => P.withImplied([p]).every((q) => P.CONFIDENTIAL.has(q) || mine.has(q));
  const isManager = () => !!Store.me && !Store.preview && Store.can('usuarios.gerenciar');
  /** Posso alterar esta conta? (mesma regra de dominância do servidor) */
  const canManage = (u) => {
    if (!isManager() || !u || u.role === 'responsavel' || u.id === Store.me.id) return false;
    const a = myDoc();
    return !!a && P.dominates(a, u, S());
  };
  const effectiveOf = (u) => new Set(P.effective({ ...u, status: 'ativo' }, settings()));
  const canLink = () => !!Store.me && Store.can('turmas.gerenciar') && Store.me.scope === 'todas';
  const isOwner = (u) => !!u && settings().ownerId === u.id;
  const DEPENDENTS = (() => {
    const m = {};
    for (const p of P.ALL) m[p] = P.ALL.filter((q) => q !== p && P.withImplied([q]).includes(p));
    return m;
  })();
  const IMPLIED = (p) => P.withImplied([p]).filter((q) => q !== p);
  const seg = (items, active, attr, label) =>
    html`<div class="seg" role="group" aria-label="${label}">${items.map(([v, l]) => html`<button type="button" ${raw(attr)}="${v}" aria-pressed="${String(String(v) === String(active))}">${l}</button>`)}</div>`;

  /* Último acesso, convite e senha vêm no retrato só para quem gerencia contas. Os deltas trazem o documento sem
     esses campos: guardamos o último valor visto para não "piscar" a situação depois de um comando. */
  const metaCache = new Map();
  const metaOf = (u) => {
    if (!u || Store.preview) return null;
    if ('lastLoginAt' in u || 'invitePending' in u || 'hasPassword' in u) metaCache.set(u.id, { lastLoginAt: u.lastLoginAt || null, hasPassword: !!u.hasPassword, invitePending: u.invitePending || null });
    return metaCache.get(u.id) || null;
  };
  /** Atualiza o retrato (último acesso e convites só chegam completos nele). */
  const refreshMeta = () => {
    if (Store.preview) return;
    Store.load().catch(() => {});
  };

  /** Situação de acesso de uma conta. */
  const accessOf = (u) => {
    const t = today();
    if (Store.me && u.id === Store.me.id) return { key: 'ativo', label: 'Ativo', tone: 'ok', sub: 'Você, conectado(a) agora' };
    const m = metaOf(u);
    const exp = u.validUntil ? U.daysBetween(t, u.validUntil) : null;
    const expiring = exp != null && exp >= 0 && exp <= SOON_DAYS;
    if (u.status !== 'ativo') return { key: 'inativo', label: 'Inativo', tone: '', sub: 'Conta desativada' };
    if (!u.login) return { key: 'semlogin', label: 'Sem acesso ao sistema', tone: '', sub: 'Aparece nas listas, mas não entra' };
    if (u.validUntil && u.validUntil < t) return { key: 'vencido', label: 'Acesso vencido', tone: 'bad', sub: `Venceu em ${U.fmtDate(u.validUntil)}` };
    const until = u.validUntil ? `Acesso até ${U.fmtDate(u.validUntil)}` : '';
    if (!m) return { key: 'ativo', label: 'Ativo', tone: 'ok', sub: until, expiring, exp };
    const pend = m.invitePending && m.invitePending > new Date().toISOString() ? m.invitePending : null;
    if (!m.lastLoginAt && pend) return { key: 'convite', label: 'Convite pendente', tone: 'warn', sub: `Código vale até ${U.fmtInstant(pend)}`, expiring, exp, pending: pend };
    if (!m.lastLoginAt) return { key: 'nunca', label: 'Nunca entrou', tone: 'warn', sub: until || 'Ainda não usou o sistema', expiring, exp };
    const ago = U.ago(m.lastLoginAt);
    const last = /^(há|agora)/.test(ago) ? `Último acesso ${ago}` : `Último acesso em ${ago}`;
    return { key: 'ativo', label: 'Ativo', tone: 'ok', sub: last + (pend ? ' · código de nova senha pendente' : ''), expiring, exp, last: m.lastLoginAt, pending: pend };
  };
  const accessPills = (a) => html`${UI.pill(a.label, a.tone)}${a.expiring && a.key !== 'vencido' ? html` ${UI.pill(a.exp === 0 ? 'Acesso vence hoje' : `Acesso até ${U.fmtDayMonth(U.addDays(today(), a.exp))}`, 'warn', true)}` : ''}`;

  /** Vínculos com turmas: userId → [{klass, regente, aux, acomp, subjects[]}] (turmas ativas, na ordem da escola). */
  const linksIndex = () => {
    const map = new Map();
    const classes = Q.classes();
    const order = new Map(classes.map((c, i) => [c.id, i]));
    const add = (uid, c, kind, sid) => {
      if (!uid) return;
      let e = map.get(uid);
      if (!e) map.set(uid, (e = new Map()));
      let x = e.get(c.id);
      if (!x) e.set(c.id, (x = { klass: c, regente: false, aux: false, acomp: false, subjects: [] }));
      if (kind === 'reg') x.regente = true;
      else if (kind === 'aux') x.aux = true;
      else if (kind === 'sub') x.subjects.push(sid);
      else x.acomp = true;
    };
    for (const c of classes) {
      add(c.teacherId, c, 'reg');
      for (const a of c.assistantIds || []) add(a, c, 'aux');
      for (const [sid, uid] of Object.entries(c.subjects || {})) add(uid, c, 'sub', sid);
    }
    const byId = new Map(classes.map((c) => [c.id, c]));
    for (const u of S().users) for (const cid of u.classIds || []) if (byId.has(cid)) add(u.id, byId.get(cid), 'acomp');
    const out = new Map();
    for (const [uid, m] of map) out.set(uid, [...m.values()].sort((a, b) => order.get(a.klass.id) - order.get(b.klass.id)));
    return out;
  };
  const homeroomShort = (c) => (['Educação Infantil', 'Fundamental I'].includes(c.segment) ? 'regente' : 'conselheiro(a)');
  const linkRole = (x, full = false) => {
    const parts = [];
    if (x.regente) parts.push(homeroomShort(x.klass));
    if (x.subjects.length) parts.push(x.subjects.map((s) => (full ? subjName(s) : (Q.subject(s) || {}).short || subjName(s))).join(', '));
    if (x.aux) parts.push('auxiliar');
    if (!parts.length && x.acomp) parts.push('acompanha');
    return parts.join(' · ');
  };
  const scopeText = (u) => {
    if (u.scope === 'todas') return 'Todas as turmas';
    if (u.scope === 'segmentos') return (u.segments || []).length ? (u.segments || []).join(', ') : 'Etapas de ensino';
    return 'Só onde atua';
  };

  const countByRole = () => {
    const m = {};
    for (const u of S().users) if (u.role !== 'responsavel') m[u.role] = (m[u.role] || 0) + 1;
    return m;
  };

  // =====================================================================
  // Editor de permissões (assistente e perfis)
  // =====================================================================
  const TAGS = {
    user: { std: 'padrão do cargo', extra: 'extra', off: 'retirado' },
    profile: { std: 'padrão do sistema', extra: 'acrescentado', off: 'retirado' },
  };
  const permCounts = (sel, base) => {
    let std = 0;
    let extra = 0;
    let off = 0;
    for (const p of P.ALL) {
      if (sel.has(p) && base.has(p)) std++;
      else if (sel.has(p)) extra++;
      else if (base.has(p)) off++;
    }
    return { std, extra, off };
  };
  const permSummary = (sel, base, mode = 'user') => {
    const c = permCounts(sel, base);
    const t = TAGS[mode];
    return html`<span class="eq-sum"><b>${c.std}</b> ${t.std}</span><span class="eq-sum ${c.extra ? 'extra' : ''}"><b>${c.extra}</b> ${c.extra === 1 ? t.extra : t.extra + 's'}</span><span class="eq-sum ${c.off ? 'off' : ''}"><b>${c.off}</b> ${c.off === 1 ? t.off : t.off + 's'}</span>`;
  };

  /**
   * Lista de permissões agrupada por módulo.
   * sel: Set marcado · base: Set padrão (cargo ou sistema) · mode: 'user' | 'profile' · locked: tudo só leitura.
   */
  const permEditor = ({ sel, base, mode = 'user', locked = false, note = '' }) => {
    const mine = myPerms();
    const t = TAGS[mode];
    return html`<div class="eq-perms" data-perms>
      <p class="eq-perm-note" role="status" aria-live="polite">${note ? html`${icon('info')}<span>${note}</span>` : ''}</p>
      ${P.groups().map((g) => {
        const n = g.items.filter((i) => sel.has(i.key)).length;
        return html`<fieldset class="eq-perm-group">
          <legend><span>${g.group}</span><span class="eq-perm-count">${n} de ${g.items.length}</span></legend>
          ${g.items.map((it) => {
            const on = sel.has(it.key);
            const inBase = base.has(it.key);
            const grant = canGrant(it.key, mine);
            const dis = locked || !grant;
            const conf = P.CONFIDENTIAL.has(it.key);
            const imp = IMPLIED(it.key);
            const tag = on && inBase ? html`<span class="eq-tag std">${t.std}</span>` : on ? html`<span class="eq-tag extra">${t.extra}</span>` : inBase ? html`<span class="eq-tag off">${t.off}</span>` : '';
            return html`<label class="eq-perm ${on ? 'on' : ''} ${dis ? 'dis' : ''} ${on && !inBase ? 'is-extra' : ''} ${!on && inBase ? 'is-off' : ''}">
              <input type="checkbox" data-perm="${it.key}" ${on ? raw('checked') : ''} ${dis ? raw('disabled') : ''}>
              <span class="eq-perm-text">
                <span class="eq-perm-label">${it.label}${it.sensitive ? html` <span class="eq-sens" title="Dado sensível">${icon('lock')}<span class="sr-only">(dado sensível)</span></span>` : ''}</span>
                ${it.hint ? html`<span class="eq-perm-hint">${it.hint}</span>` : ''}
                ${imp.length ? html`<span class="eq-perm-hint">Inclui: ${imp.map(shortPerm).join(', ')}.</span>` : ''}
                ${!grant && !locked ? html`<span class="eq-perm-why">${icon('lock')} Você não pode conceder um acesso que não tem.</span>` : ''}
                ${conf && grant && !mine.has(it.key) && !locked ? html`<span class="eq-perm-why conf">${icon('shield')} Confidencial: quem cria contas pode conceder mesmo sem ter. Fica no registro de atividades.</span>` : ''}
              </span>
              ${tag}
            </label>`;
          })}
        </fieldset>`;
      })}
    </div>`;
  };
  /** Marca/desmarca com as dependências. Devolve o aviso do que mudou junto. */
  const togglePerm = (sel, p, on) => {
    const before = new Set(sel);
    const mine = myPerms();
    if (on) {
      for (const q of P.withImplied([p])) if (canGrant(q, mine)) sel.add(q);
    } else {
      sel.delete(p);
      for (const q of DEPENDENTS[p]) sel.delete(q);
    }
    const added = [...sel].filter((q) => !before.has(q) && q !== p);
    const removed = [...before].filter((q) => !sel.has(q) && q !== p);
    if (added.length) return `"${shortPerm(p)}" depende de outros acessos, que também foram marcados: ${added.map(shortPerm).join(', ')}.`;
    if (removed.length) return `Sem "${shortPerm(p)}", também saíram: ${removed.map(shortPerm).join(', ')}.`;
    return '';
  };

  // =====================================================================
  // Assistente: nova conta / editar
  // =====================================================================
  const STEPS = ['Pessoa', 'Cargo', 'Acessos', 'Turmas e acesso', 'Conferir'];
  const scopeOptions = () => {
    const s = Store.me.scope;
    return [
      s === 'todas' ? ['todas', 'Todas as turmas', 'Vê todos os alunos e turmas da escola.'] : null,
      s === 'todas' || s === 'segmentos' ? ['segmentos', 'Etapas de ensino', 'Vê só as turmas das etapas escolhidas.'] : null,
      ['vinculos', 'Só onde atua', 'Vê só as turmas em que dá aula ou acompanha, e os alunos vinculados.'],
    ].filter(Boolean);
  };
  const allowedSegments = () => {
    if (Store.me.scope === 'todas') return SEGMENTS.filter((s) => Q.segments().includes(s));
    const mine = (myDoc() && myDoc().segments) || [];
    return SEGMENTS.filter((s) => mine.includes(s));
  };
  const defaultScope = (role) => {
    const want = (P.ROLE[role] || {}).scope || 'vinculos';
    return scopeOptions().some((o) => o[0] === want) ? want : 'vinculos';
  };
  const defaultSel = (role) => new Set(P.profile(role, settings()).filter((p) => canGrant(p)));
  const blankDraft = (role = '') => ({
    id: null, name: '', title: '', email: '', phone: '', role,
    sel: role ? defaultSel(role) : new Set(), scope: role ? defaultScope(role) : 'vinculos', segments: [], links: {}, origLinks: {},
    students: [], subjectIds: [], area: role ? (P.ROLE[role] || {}).area || '' : '', login: true, validUntil: '', sendInvite: true, note: '',
  });
  /** Papéis atuais da pessoa nas turmas (para editar). */
  const currentLinks = (u) => {
    const out = {};
    for (const x of linksIndex().get(u.id) || []) {
      const role = x.regente ? 'regente' : x.aux ? 'auxiliar' : x.subjects.length ? 'professor' : 'acompanha';
      out[x.klass.id] = { role, subjectIds: x.subjects.slice() };
    }
    return out;
  };
  const fromUser = (u) => {
    const links = currentLinks(u);
    return {
      id: u.id, name: u.name || '', title: u.title || '', email: u.email || '', phone: u.phone || '', role: u.role,
      sel: effectiveOf(u), scope: u.scope || 'vinculos', segments: (u.segments || []).slice(), links, origLinks: JSON.parse(JSON.stringify(links)),
      students: (u.linkedStudentIds || []).slice(), subjectIds: (u.subjectIds || []).slice(), area: u.area || '', login: !!u.login, validUntil: u.validUntil || '', sendInvite: false, note: '', roleNote: '', orig: u.role,
    };
  };
  const roleLinksOf = (links) =>
    Object.entries(links)
      .filter(([, l]) => ['regente', 'professor', 'auxiliar'].includes(l.role))
      .map(([classId, l]) => ({ classId, role: l.role, subjectIds: l.role === 'auxiliar' ? [] : l.subjectIds.slice().sort() }))
      .sort((a, b) => (a.classId < b.classId ? -1 : 1));
  const showArea = (d) => !!d.area || !!(P.ROLE[d.role] || {}).area || d.sel.has('atendimentos.registrar') || d.sel.has('atendimentos.conteudo');

  const titleHint = (d) => {
    const forms = d.role ? titleForms(roleLabel(d.role)) : null;
    if (!forms) return 'Opcional. Em branco, aparece o nome do cargo.';
    return html`Opcional. Em branco, aparece “${roleLabel(d.role)}”. Usar ${html.join(forms.map((f) => html`<button type="button" class="link small" data-title-sug="${f}">${f}</button>`), ' ou ')}`;
  };
  const personDefs = (d) => [
    { name: 'name', label: 'Nome completo', required: true, full: true, maxlength: 120, attrs: raw('autofocus') },
    { name: 'title', label: 'Como aparece para a equipe e as famílias', placeholder: d.role ? roleLabel(d.role) : 'Ex.: Professora de Inglês', hint: titleHint(d), maxlength: 80, full: true },
    { name: 'email', label: 'E-mail', type: 'email', placeholder: 'nome@escola.com.br', maxlength: 160, autocomplete: 'off' },
    { name: 'phone', label: 'Celular', type: 'tel', placeholder: '(11) 91234-5678' },
  ];
  const loginTaken = (d) => {
    const em = (d.email || '').toLowerCase();
    const ph = U.digits(d.phone);
    for (const u of S().users) {
      if (u.id === d.id) continue;
      const who = u.role === 'responsavel' ? `${u.name} (responsável)` : u.name;
      if (em && u.email && u.email.toLowerCase() === em) return ['email', `Este e-mail já é usado por ${who}. Cada conta precisa de um e-mail próprio.`];
      if (ph && u.phone && U.digits(u.phone) === ph) return ['phone', `Este celular já é usado por ${who}. Cada conta precisa de um celular próprio.`];
    }
    return null;
  };

  const stepPerson = (d) => html`<form class="form-grid" data-step-form novalidate>
      ${UI.fields(personDefs(d), d)}
      <p class="full small muted eq-help">${icon('key')}<span>A pessoa entra com o <b>e-mail ou o celular</b> e cria a própria senha com um código de primeiro acesso. Não há senha para você anotar.</span></p>
      <button type="submit" hidden></button>
    </form>`;

  const stepRole = (d) => {
    const st = settings();
    const counts = countByRole();
    const mine = myPerms();
    return html`<p class="muted eq-intro">Escolha o cargo. Cada cargo já vem com um conjunto de acessos, que você ajusta no próximo passo.</p>
      <div data-field="role" class="eq-role-wrap">
      ${GROUPS.map((g) => {
        const roles = STAFF_ROLES.filter((r) => r.group === g);
        return html`<section class="eq-role-group" aria-labelledby="eqg-${U.slug(g)}"><h3 id="eqg-${U.slug(g)}">${g}</h3><div class="pick-grid eq-role-grid" role="radiogroup" aria-labelledby="eqg-${U.slug(g)}">${roles.map((r) => {
          const custom = st.profiles && Array.isArray(st.profiles[r.id]);
          const blocked = P.profile(r.id, st).filter((p) => !canGrant(p, mine)).length;
          const n = counts[r.id] || 0;
          return html`<label class="pick eq-role"><input type="radio" name="eq-role" value="${r.id}" ${d.role === r.id ? raw('checked') : ''}><strong>${r.label}</strong><span>${ROLE_INFO[r.id] || ''}</span>${n || custom || blocked
            ? html`<span class="eq-role-meta">${n ? html`<span>${plural(n, 'pessoa', 'pessoas')}</span>` : ''}${custom ? html`<span class="eq-tag extra">perfil da escola</span>` : ''}${blocked ? html`<span class="eq-tag off" title="Você não tem alguns acessos deste cargo; eles ficarão de fora.">${plural(blocked, 'acesso que você não tem', 'acessos que você não tem')}</span>` : ''}</span>`
            : ''}</label>`;
        })}</div></section>`;
      })}</div>`;
  };

  const stepPerms = (d) => {
    const base = new Set(P.profile(d.role, settings()));
    const def = defaultSel(d.role);
    return html`<div class="eq-perm-head">
        <div class="grow"><p><b>${roleLabel(d.role)}</b>: o padrão do cargo já vem marcado. Marque o que mais a pessoa pode fazer <span class="eq-nowrap">(<span class="eq-tag extra">extra</span>)</span> ou desmarque o que ela não deve acessar <span class="eq-nowrap">(<span class="eq-tag off">retirado</span>)</span>.</p>
        <p class="eq-sums" data-sums>${permSummary(d.sel, base)}</p></div>
        <button type="button" class="btn sm" data-reset-perms ${sameSet(d.sel, def) ? raw('disabled') : ''}>${icon('undo')}Voltar ao padrão do cargo</button>
      </div>
      ${d.roleNote ? html`<div class="notice warn eq-role-note">${icon('swap')}<span class="grow">${d.roleNote}</span></div>` : ''}
      ${permEditor({ sel: d.sel, base, mode: 'user', note: d.note })}`;
  };

  const classRow = (d, c, link) => {
    const l = d.links[c.id] || { role: '', subjectIds: [] };
    const subs = Q.classSubjects(c.id);
    const locked = !link && ['regente', 'professor', 'auxiliar'].includes(l.role);
    const reg = c.teacherId && c.teacherId !== d.id ? Q.userName(c.teacherId) : null;
    const taken = l.subjectIds.filter((sid) => c.subjects[sid] && c.subjects[sid] !== d.id);
    const opts = [['', 'Não atua'], ['acompanha', 'Acompanha a turma']].concat(
      link || locked ? [['regente', Core.rules.homeroomLabel(c)], ['professor', 'Dá aula de disciplinas'], ['auxiliar', 'Auxiliar de classe']] : [],
    );
    return html`<li class="eq-class ${l.role ? 'on' : ''}" data-class-row="${c.id}">
      <div class="eq-class-top">
        <label class="eq-class-name" for="eqc-${c.id}"><b>${c.name}</b><span>${c.segment}${c.shift ? ` · ${c.shift}` : ''}</span></label>
        <select class="input eq-class-role" id="eqc-${c.id}" data-class-role="${c.id}" ${locked ? raw('disabled') : ''}>${opts.map(([v, t]) => html`<option value="${v}" ${l.role === v ? raw('selected') : ''}>${t}</option>`)}</select>
      </div>
      ${(l.role === 'regente' || l.role === 'professor') && subs.length
        ? html`<div class="eq-class-subs"><span class="small muted">${l.role === 'regente' ? 'Também dá aula de (opcional):' : 'Disciplinas:'}</span><div class="chips" role="group" aria-label="Disciplinas no ${c.name}">${subs.map((s) => {
            const owner = c.subjects[s.id];
            return html`<label class="chip eq-chip"><input type="checkbox" data-class-subject="${c.id}" value="${s.id}" ${l.subjectIds.includes(s.id) ? raw('checked') : ''} ${locked ? raw('disabled') : ''}><span class="swatch c${s.color || 1}"></span>${s.name}${owner && owner !== d.id ? html`<span class="eq-owner">· ${U.firstName(Q.userName(owner))}</span>` : ''}</label>`;
          })}</div></div>`
        : ''}
      ${l.role === 'regente' && reg ? html`<p class="eq-class-warn">${icon('swap')} Substitui ${reg} como ${homeroomShort(c)}.</p>` : ''}
      ${taken.length ? html`<p class="eq-class-warn">${icon('swap')} ${taken.map((sid) => `${subjName(sid)} sai de ${Q.userName(c.subjects[sid])}`).join('; ')}.</p>` : ''}
      ${l.role === 'professor' && !l.subjectIds.length ? html`<p class="eq-class-warn bad">${icon('alert')} Escolha ao menos uma disciplina.</p>` : ''}
      ${locked ? html`<p class="small muted">Definido por quem gerencia as turmas.</p>` : ''}
    </li>`;
  };

  const studentChips = (d) =>
    d.students.length
      ? d.students.map((sid) => {
          const s = Q.student(sid);
          const name = s ? s.name : 'Aluno fora do seu alcance';
          return html`<span class="chip on eq-st-chip">${name}${s && s.classId && Q.klass(s.classId) ? html`<span class="eq-owner">· ${Q.klass(s.classId).name}</span>` : ''}<button type="button" class="eq-chip-x" data-remove-student="${sid}" aria-label="Retirar ${name}">${icon('x')}</button></span>`;
        })
      : html`<span class="small muted">Nenhum aluno vinculado.</span>`;

  const stepScope = (d) => {
    const opts = scopeOptions();
    const link = canLink();
    const classes = Q.classes();
    const roleDef = P.ROLE[d.role] || {};
    const minDate = today();
    return html`<div class="eq-scope-step">
      <section class="eq-sec">
        <h3>Turmas que pode ver</h3>
        <div class="pick-grid eq-scope" role="radiogroup" aria-label="Turmas que pode ver">${opts.map(([v, t, h]) => html`<label class="pick"><input type="radio" name="eq-scope" value="${v}" ${d.scope === v ? raw('checked') : ''}><strong>${t}</strong><span>${h}</span></label>`)}</div>
        ${Store.me.scope !== 'todas' ? html`<p class="small muted">${icon('info')} Você só pode dar acesso às turmas que você mesmo vê.</p>` : ''}
        ${d.scope === 'segmentos'
          ? html`<div class="field" data-field="segments"><span class="label">Etapas de ensino <span class="req">*</span></span><div class="chips" role="group" aria-label="Etapas de ensino">${allowedSegments().map((s) => html`<label class="chip"><input type="checkbox" data-segment value="${s}" ${d.segments.includes(s) ? raw('checked') : ''}>${s}</label>`)}</div></div>`
          : ''}
      </section>
      <section class="eq-sec">
        <h3>Turmas em que atua</h3>
        <p class="small muted">${d.scope === 'vinculos' ? 'Ela verá só estas turmas (e os alunos vinculados abaixo).' : 'Opcional: marque se a pessoa também dá aula, é regente ou auxiliar de alguma turma.'}${link ? '' : ' Para definir regente, professor ou auxiliar é preciso poder gerenciar turmas e ver todas elas.'}</p>
        ${classes.length ? html`<ul class="eq-classes">${classes.map((c) => classRow(d, c, link))}</ul>` : html`<p class="small muted">Nenhuma turma ativa ainda. Crie as turmas e volte aqui para vincular.</p>`}
      </section>
      ${roleDef.teaches && d.role !== 'auxiliar'
        ? html`<section class="eq-sec"><div class="field" data-field="subjectIds"><span class="label">Disciplinas que leciona</span><span class="hint">Ajuda a sugerir professores ao montar as turmas.</span><div class="chips" role="group" aria-label="Disciplinas que leciona">${S().subjects.map((s) => html`<label class="chip"><input type="checkbox" data-subject value="${s.id}" ${d.subjectIds.includes(s.id) ? raw('checked') : ''}><span class="swatch c${s.color || 1}"></span>${s.name}</label>`)}</div></div></section>`
        : ''}
      ${d.scope !== 'todas'
        ? html`<section class="eq-sec"><div class="field" data-field="students"><span class="label">Alunos acompanhados</span><span class="hint">Para mediador(a), AEE ou apoio individual: a pessoa vê estes alunos mesmo sem ver a turma toda.</span>
            <div class="chips eq-students" data-students>${studentChips(d)}</div>
            <div class="search-box eq-st-search" data-nodirty>${icon('search')}<input class="input" id="eq-st-q" type="search" placeholder="Buscar aluno pelo nome" autocomplete="off" aria-label="Buscar aluno para acompanhar"></div>
            <div class="eq-st-results" data-st-results></div></div></section>`
        : ''}
      ${showArea(d)
        ? html`<section class="eq-sec"><div class="field" data-field="area"><label for="eq-area">Área de atendimento</label><select class="input" id="eq-area" data-area>${[['', 'Nenhuma']].concat(Object.entries(Q.AREAS)).map(([v, t]) => html`<option value="${v}" ${d.area === v ? raw('selected') : ''}>${t}</option>`)}</select><span class="hint">Define quem lê os atendimentos compartilhados "com a área".</span></div></section>`
        : ''}
      <section class="eq-sec">
        <h3>Acesso ao sistema</h3>
        <div class="form-grid">
          <label class="check full" data-field="login"><input type="checkbox" id="eq-login" data-login ${d.login ? raw('checked') : ''}><span>Pode entrar no sistema<br><span class="hint muted small">Desmarque para quem só aparece nos horários e listas, sem usar o sistema.</span></span></label>
          <div class="field" data-field="validUntil"><label for="eq-valid">Acesso até</label><input class="input" type="date" id="eq-valid" data-valid min="${minDate}" value="${d.validUntil}"><span class="hint">Para estagiários e temporários. Em branco, sem prazo.</span></div>
        </div>
      </section>
    </div>`;
  };

  const linksSummary = (d) => {
    const items = Object.entries(d.links)
      .filter(([, l]) => l.role)
      .map(([cid, l]) => {
        const c = Q.klass(cid);
        if (!c) return null;
        const what = l.role === 'regente' ? homeroomShort(c) : l.role === 'auxiliar' ? 'auxiliar' : l.role === 'acompanha' ? 'acompanha' : '';
        const subs = l.role !== 'auxiliar' && l.subjectIds.length ? l.subjectIds.map(subjName).join(', ') : '';
        return `${c.name} (${[what, subs].filter(Boolean).join(': ')})`;
      })
      .filter(Boolean);
    return items;
  };
  const stepReview = (d, isNew) => {
    const base = new Set(P.profile(d.role, settings()));
    const c = permCounts(d.sel, base);
    const extras = P.ALL.filter((p) => d.sel.has(p) && !base.has(p));
    const offs = P.ALL.filter((p) => !d.sel.has(p) && base.has(p));
    const links = linksSummary(d);
    const scope = d.scope === 'todas' ? 'Todas as turmas' : d.scope === 'segmentos' ? `Etapas: ${d.segments.join(', ')}` : 'Só onde atua';
    const nothing = d.scope === 'vinculos' && !links.length && !d.students.length;
    const edit = (step) => html`<button type="button" class="link small" data-go="${step}">Alterar</button>`;
    const shownTitle = d.title || roleLabel(d.role);
    const forms = titleForms(shownTitle);
    const titleCell = forms
      ? html`${shownTitle}<span class="eq-title-pick"><span class="small muted">As famílias leem isto ao lado do nome. Escolha a forma:</span><span class="chips">${forms.map((f) => html`<button type="button" class="chip" data-title-pick="${f}">${f}</button>`)}</span></span>`
      : shownTitle;
    return html`<div class="eq-review">
      ${nothing ? html`<div class="notice warn">${icon('alert')}<span class="grow">${U.firstName(d.name) || 'A pessoa'} não verá nenhum aluno até ser vinculada a uma turma ou a alunos.</span><button type="button" class="btn sm" data-go="3">Vincular turmas</button></div>` : ''}
      <section class="eq-rev-sec"><div class="eq-rev-head"><h3>Pessoa</h3>${edit(0)}</div>
        ${UI.kv([['Nome', d.name], ['Aparece como', titleCell], ['E-mail', d.email], ['Celular', d.phone]])}</section>
      <section class="eq-rev-sec"><div class="eq-rev-head"><h3>Cargo e acessos</h3>${edit(2)}</div>
        ${UI.kv([
          ['Cargo', d.roleNote ? html`${roleLabel(d.role)} <span class="eq-tag off">antes: ${roleLabel(d.orig)}</span>` : roleLabel(d.role)],
          ['Acessos', html`${d.sel.size} permissões · ${c.std} do padrão${c.extra ? `, ${c.extra} extra${c.extra > 1 ? 's' : ''}` : ''}${c.off ? `, ${c.off} retirada${c.off > 1 ? 's' : ''}` : ''}`],
          extras.length ? ['Extras', html`<span class="eq-taglist">${extras.map((p) => html`<span class="eq-tag extra">${shortPerm(p)}</span>`)}</span>`] : null,
          offs.length ? ['Retirados', html`<span class="eq-taglist">${offs.map((p) => html`<span class="eq-tag off">${shortPerm(p)}</span>`)}</span>`] : null,
        ])}</section>
      <section class="eq-rev-sec"><div class="eq-rev-head"><h3>Turmas e acesso</h3>${edit(3)}</div>
        ${UI.kv([
          ['Pode ver', scope],
          ['Atua em', links.length ? links.join('; ') : ''],
          d.students.length ? ['Alunos', d.students.map((sid) => (Q.student(sid) || {}).name || 'Aluno').join(', ')] : null,
          showArea(d) ? ['Área', d.area ? Q.AREAS[d.area] : 'Nenhuma'] : null,
          ['Entra no sistema', d.login ? (d.validUntil ? `Sim, até ${U.fmtDate(d.validUntil)}` : 'Sim') : 'Não'],
        ])}</section>
      ${isNew && d.login
        ? html`<label class="check eq-invite-check"><input type="checkbox" data-send-invite ${d.sendInvite ? raw('checked') : ''}><span><b>Gerar agora o código de primeiro acesso</b><br><span class="hint muted small">O código aparece uma única vez, para você mandar pelo WhatsApp, e-mail ou entregar impresso. Vale 72 horas.</span></span></label>`
        : ''}
      ${!isNew ? html`<p class="small muted">${icon('info')} Se os acessos ou as turmas mudarem, ${U.firstName(d.name)} sai dos aparelhos conectados e entra de novo com a mesma senha.</p>` : ''}
    </div>`;
  };

  /** Abre o assistente. id = editar; preset = {role, step}. */
  const openWizard = (id = null, preset = {}) => {
    if (!isManager()) return UI.toast('Seu acesso não permite criar ou editar contas da equipe.', { tone: 'bad' });
    const cur = id ? Q.user(id) : null;
    if (id && !canManage(cur)) return UI.toast(cur ? `Você não pode alterar a conta de ${cur.name}.` : 'Pessoa não encontrada.', { tone: 'bad' });
    const isNew = !cur;
    const d = cur ? fromUser(cur) : blankDraft(preset.role || '');
    d.step = Math.max(0, Math.min(4, preset.step || 0));
    d.visited = isNew ? d.step : 4;
    let api = null;

    const stepsHTML = () =>
      html`<nav class="steps eq-steps" aria-label="Etapas">${STEPS.map((s, i) => {
        const done = isNew ? i < d.step : i !== d.step;
        return html`<button type="button" class="step ${i === d.step ? 'current' : ''} ${done && i <= d.visited ? 'done' : ''}" data-go="${i}" ${i > d.visited ? raw('disabled') : ''} ${i === d.step ? raw('aria-current="step"') : ''}><b>${isNew && i < d.step ? icon('check') : i + 1}</b><span>${s}</span></button>`;
      })}</nav>`;
    const bodyHTML = () => [stepPerson, stepRole, stepPerms, stepScope, (x) => stepReview(x, isNew)][d.step](d);
    const footHTML = () =>
      html`<button type="button" class="btn ghost left" data-close>Cancelar</button>
        ${d.step > 0 ? html`<button type="button" class="btn" data-back>${icon('chevronLeft')}Voltar</button>` : ''}
        ${d.step < 4 ? html`<button type="button" class="btn ${isNew ? 'primary' : ''}" data-next>Continuar${icon('chevronRight')}</button>` : ''}
        ${d.step === 4 || !isNew ? html`<button type="button" class="btn primary" data-save>${icon('check')}${isNew ? 'Criar conta' : 'Salvar alterações'}</button>` : ''}`;
    const draw = (keepScroll = false) => {
      const body = api.el.querySelector('.modal-body');
      const y = body.scrollTop;
      UI.setHTML(api.el.querySelector('[data-steps]'), stepsHTML());
      api.setBody(bodyHTML());
      api.setFoot(footHTML());
      const form = api.el.querySelector('[data-step-form]');
      if (form) UI.bindMasks(form);
      if (keepScroll) body.scrollTop = y;
      else {
        body.scrollTop = 0;
        const f = body.querySelector('input:not([type=hidden]):not([disabled]):not([type=search]), select:not([disabled])');
        if (f && d.step !== 2) f.focus({ preventScroll: true });
      }
    };
    const redrawPerms = (focusKey) => {
      const box = api.el.querySelector('.modal-body');
      const y = box.scrollTop;
      api.setBody(bodyHTML());
      box.scrollTop = y;
      if (focusKey) {
        const el = box.querySelector(`[data-perm="${CSS.escape(focusKey)}"]`);
        el && el.focus({ preventScroll: true });
      }
    };

    // ----- leitura e validação de cada passo -----
    const readPerson = () => {
      const form = api.el.querySelector('[data-step-form]');
      if (form) Object.assign(d, UI.readForm(form, personDefs(d)));
    };
    const checkPerson = () => {
      const form = api.el.querySelector('[data-step-form]');
      if (!form) return true;
      readPerson();
      if (!UI.validate(form, personDefs(d), d)) return false;
      if (d.login && !d.email && !d.phone) {
        UI.markField(form, 'email', 'Informe e-mail ou celular: é com um deles que a pessoa entra.');
        return false;
      }
      const t = loginTaken(d);
      if (t) {
        UI.markField(form, t[0], t[1]);
        return false;
      }
      return true;
    };
    const fieldError = (name, msg) => {
      const wrap = api.el.querySelector(`[data-field="${name}"]`);
      if (!wrap) return UI.toast(msg, { tone: 'bad' });
      UI.markField(api.el.querySelector('.modal-body'), name, msg);
      wrap.scrollIntoView({ block: 'center', behavior: 'smooth' });
    };
    const checkStep = (step) => {
      if (step === 0) return checkPerson();
      if (step === 1) {
        if (!d.role) {
          fieldError('role', 'Escolha um cargo para continuar.');
          return false;
        }
        return true;
      }
      if (step === 3) {
        UI.clearErrors(api.el);
        if (d.scope === 'segmentos' && !d.segments.length) {
          fieldError('segments', 'Escolha ao menos uma etapa de ensino.');
          return false;
        }
        const bad = Object.entries(d.links).find(([, l]) => l.role === 'professor' && !l.subjectIds.length);
        if (bad) {
          const c = Q.klass(bad[0]);
          const row = api.el.querySelector(`[data-class-row="${CSS.escape(bad[0])}"]`);
          row && row.scrollIntoView({ block: 'center', behavior: 'smooth' });
          UI.toast(`Escolha as disciplinas de ${c ? c.name : 'uma turma'} ou mude o papel.`, { tone: 'bad' });
          return false;
        }
        if (d.validUntil && (!U.isValidDate(d.validUntil) || d.validUntil < today())) {
          fieldError('validUntil', 'Use uma data a partir de hoje.');
          return false;
        }
        if (d.login && !d.email && !d.phone) {
          fieldError('login', 'Para entrar, a pessoa precisa de e-mail ou celular (passo 1).');
          return false;
        }
      }
      return true;
    };
    const leave = () => {
      if (d.step === 0) readPerson();
    };
    const goto = (step) => {
      if (step === d.step) return;
      if (step > d.step) {
        for (let s = d.step; s < step; s++) {
          if (s !== d.step && isNew) break;
          if (!checkStep(s)) return;
        }
      } else leave();
      if (isNew && step > d.visited + 1) return;
      d.step = step;
      d.visited = Math.max(d.visited, step);
      d.note = '';
      draw();
    };

    // ----- salvar -----
    const showServerError = (err) => {
      const msg = (err && err.message) || 'Não foi possível salvar.';
      const n = msg.toLowerCase();
      const at = n.includes('e-mail') ? [0, 'email'] : n.includes('celular') ? [0, 'phone'] : n.includes('nome') ? [0, 'name'] : n.includes('data final') || n.includes('acesso até') ? [3, 'validUntil'] : n.includes('etapas') ? [3, 'segments'] : null;
      if (at) {
        d.step = at[0];
        d.visited = Math.max(d.visited, at[0]);
        draw();
        UI.markField(api.el.querySelector('.modal-body'), at[1], msg);
      } else UI.toast(msg, { tone: 'bad' });
    };
    /** Volta ao passo com problema e mostra o erro lá. */
    const back = (step) => {
      d.step = step;
      d.visited = Math.max(d.visited, step);
      draw();
      return checkStep(step);
    };
    const save = async (btn) => {
      if (d.step === 0 && !checkPerson()) return;
      if (d.step === 3 && !checkStep(3)) return;
      leave();
      if (!d.name || (d.login && !d.email && !d.phone) || loginTaken(d)) return back(0);
      if (!d.role) return back(1);
      if ((d.scope === 'segmentos' && !d.segments.length) || Object.values(d.links).some((l) => l.role === 'professor' && !l.subjectIds.length) || (d.validUntil && d.validUntil < today())) return back(3);
      const roleLinks = roleLinksOf(d.links);
      const classIds = Object.entries(d.links).filter(([, l]) => l.role === 'acompanha').map(([cid]) => cid);
      const subjectIds = [...new Set(d.subjectIds.concat(roleLinks.flatMap((l) => l.subjectIds)))];
      const input = {
        name: d.name, title: d.title || roleLabel(d.role), role: d.role, email: d.email, phone: d.phone, login: d.login,
        validUntil: d.validUntil || null, perms: [...d.sel], scope: d.scope, segments: d.scope === 'segmentos' ? d.segments : [],
        classIds, linkedStudentIds: d.scope === 'todas' ? [] : d.students, subjectIds, area: d.area || null,
      };
      if (cur) input.id = cur.id;
      else input.sendInvite = d.login && d.sendInvite;
      btn.disabled = true;
      btn.classList.add('loading');
      let res;
      try {
        res = await Store.cmd('users.save', input);
      } catch (err) {
        btn.disabled = false;
        btn.classList.remove('loading');
        if (err && err.code === 'canceled') return;
        return showServerError(err);
      }
      const uid = (res.result && res.result.id) || (cur && cur.id);
      let linkErr = null;
      const linksChanged = JSON.stringify(roleLinks) !== JSON.stringify(roleLinksOf(d.origLinks));
      if (canLink() && linksChanged) {
        try {
          await Store.cmd('staff.links', { userId: uid, classes: roleLinks, linkedStudentIds: input.linkedStudentIds });
        } catch (err) {
          linkErr = err;
        }
      }
      api.setDirty(false);
      api.close();
      const first = U.firstName(d.name);
      if (linkErr) UI.toast(`A conta de ${first} foi salva, mas as turmas não: ${linkErr.message}`, { tone: 'bad', ms: 9000 });
      else UI.toast(isNew ? `Conta de ${first} criada` : `Alterações de ${first} salvas`);
      const inv = (res.effects || []).find((e) => e.type === 'invite');
      if (isNew || inv) refreshMeta();
      if (inv) UI.showInvite(inv, { name: d.name, phone: d.phone, email: d.email });
      if (isNew) App.go('equipe/' + uid);
    };

    api = UI.modal({
      title: isNew ? 'Nova conta da equipe' : `Editar acesso de ${U.shortName(cur.name)}`,
      sub: isNew ? 'Crie o acesso por cargo e ajuste o que a pessoa pode ver e fazer.' : `${titleOf(cur)} · mudanças nos acessos valem na hora.`,
      size: 'lg',
      cls: 'eq-wizard',
      top: html`<div data-steps></div>`,
      body: '',
      onMount(el, a) {
        api = a;
        draw();
        el.addEventListener('click', (e) => {
          const t = e.target;
          const goEl = t.closest('[data-go]');
          if (goEl && !goEl.disabled) return goto(Number(goEl.dataset.go));
          if (t.closest('[data-back]')) return goto(d.step - 1);
          if (t.closest('[data-next]')) return goto(d.step + 1);
          const sv = t.closest('[data-save]');
          if (sv) return save(sv);
          const sug = t.closest('[data-title-sug]');
          if (sug) {
            const inp = el.querySelector('[data-step-form] [name="title"]');
            if (inp) {
              inp.value = sug.dataset.titleSug;
              inp.focus();
            }
            api.setDirty(true);
            return;
          }
          const pick = t.closest('[data-title-pick]');
          if (pick) {
            d.title = pick.dataset.titlePick;
            api.setDirty(true);
            draw(true);
            const head = el.querySelector('.eq-review [data-go="0"]');
            head && head.focus({ preventScroll: true });
            return;
          }
          if (t.closest('[data-reset-perms]')) {
            d.sel = defaultSel(d.role);
            d.note = 'Os acessos voltaram ao padrão do cargo.';
            api.setDirty(true);
            return redrawPerms();
          }
          const rm = t.closest('[data-remove-student]');
          if (rm) {
            d.students = d.students.filter((x) => x !== rm.dataset.removeStudent);
            api.setDirty(true);
            UI.setHTML(el.querySelector('[data-students]'), studentChips(d));
            el.querySelector('#eq-st-q') && el.querySelector('#eq-st-q').focus();
            return;
          }
          const add = t.closest('[data-add-student]');
          if (add) {
            if (!d.students.includes(add.dataset.addStudent)) d.students.push(add.dataset.addStudent);
            api.setDirty(true);
            UI.setHTML(el.querySelector('[data-students]'), studentChips(d));
            const q = el.querySelector('#eq-st-q');
            q.value = '';
            UI.setHTML(el.querySelector('[data-st-results]'), '');
            q.focus();
          }
        });
        el.addEventListener('change', (e) => {
          const t = e.target;
          if (t.dataset.perm) {
            d.note = togglePerm(d.sel, t.dataset.perm, t.checked);
            return redrawPerms(t.dataset.perm);
          }
          if (t.name === 'eq-role') {
            const changed = d.role !== t.value;
            d.role = t.value;
            UI.clearErrors(el);
            if (changed) {
              d.sel = defaultSel(d.role);
              if (isNew || !scopeOptions().some((o) => o[0] === d.scope)) d.scope = defaultScope(d.role);
              d.area = (P.ROLE[d.role] || {}).area || (isNew ? '' : d.area);
              d.roleNote = isNew || d.role === cur.role ? '' : `O cargo mudou de ${roleLabel(cur.role)} para ${roleLabel(d.role)}: os acessos voltaram ao padrão do novo cargo. Confira antes de salvar.`;
            }
            return;
          }
          if (t.name === 'eq-scope') {
            d.scope = t.value;
            return draw(true);
          }
          if (t.matches('[data-segment]')) {
            d.segments = [...el.querySelectorAll('[data-segment]:checked')].map((x) => x.value);
            return;
          }
          if (t.matches('[data-class-role]')) {
            const cid = t.dataset.classRole;
            const prev = d.links[cid] || { role: '', subjectIds: [] };
            if (!t.value) delete d.links[cid];
            else {
              let subs = prev.subjectIds;
              if (t.value === 'professor' && !subs.length) {
                const c = Q.klass(cid);
                subs = Object.keys((c && c.subjects) || {}).filter((sid) => d.subjectIds.includes(sid));
              }
              d.links[cid] = { role: t.value, subjectIds: t.value === 'auxiliar' || t.value === 'acompanha' ? [] : subs };
            }
            const row = t.closest('[data-class-row]');
            const tmp = document.createElement('ul');
            UI.setHTML(tmp, classRow(d, Q.klass(cid), canLink()));
            row.replaceWith(tmp.firstElementChild);
            const sel = el.querySelector(`[data-class-role="${CSS.escape(cid)}"]`);
            sel && sel.focus();
            return;
          }
          if (t.matches('[data-class-subject]')) {
            const cid = t.dataset.classSubject;
            const l = d.links[cid];
            if (!l) return;
            l.subjectIds = [...el.querySelectorAll(`[data-class-subject="${CSS.escape(cid)}"]:checked`)].map((x) => x.value);
            const row = t.closest('[data-class-row]');
            const tmp = document.createElement('ul');
            UI.setHTML(tmp, classRow(d, Q.klass(cid), canLink()));
            row.replaceWith(tmp.firstElementChild);
            const again = el.querySelector(`[data-class-subject="${CSS.escape(cid)}"][value="${CSS.escape(t.value)}"]`);
            again && again.focus();
            return;
          }
          if (t.matches('[data-subject]')) {
            d.subjectIds = [...el.querySelectorAll('[data-subject]:checked')].map((x) => x.value);
            return;
          }
          if (t.matches('[data-area]')) d.area = t.value;
          else if (t.matches('[data-login]')) d.login = t.checked;
          else if (t.matches('[data-valid]')) d.validUntil = t.value;
          else if (t.matches('[data-send-invite]')) d.sendInvite = t.checked;
        });
        el.addEventListener('input', (e) => {
          const fw = e.target.closest('[data-field]');
          if (fw && fw.querySelector('.error')) {
            fw.querySelectorAll('.error').forEach((x) => x.remove());
            fw.querySelectorAll('.invalid').forEach((x) => {
              x.classList.remove('invalid');
              x.removeAttribute('aria-invalid');
            });
          }
          if (e.target.id !== 'eq-st-q') return;
          const q = e.target.value.trim();
          const box = el.querySelector('[data-st-results]');
          if (q.length < 2) return UI.setHTML(box, q ? html`<p class="small muted">Digite pelo menos 2 letras.</p>` : '');
          const found = Q.students({ query: q }).filter((s) => !d.students.includes(s.id)).slice(0, 8);
          UI.setHTML(
            box,
            found.length
              ? html`<ul class="eq-st-list">${found.map((s) => html`<li><button type="button" data-add-student="${s.id}">${UI.avatar(s.name, 'sm', s.photo)}<span class="grow"><b>${s.name}</b><span>${(Q.klass(s.classId) || {}).name || 'Sem turma'}</span></span>${icon('plus')}</button></li>`)}</ul>`
              : html`<p class="small muted">Nenhum aluno ativo encontrado com “${q}”.</p>`,
          );
        });
        el.addEventListener('submit', (e) => {
          e.preventDefault();
          goto(d.step + 1);
        });
      },
    });
    return api;
  };

  // =====================================================================
  // Ações sobre uma conta
  // =====================================================================
  const doInvite = async (u, btn) => {
    const m = metaOf(u) || {};
    const used = m.hasPassword || m.lastLoginAt;
    if (!u.email && !u.phone) {
      UI.toast(`Cadastre um e-mail ou celular de ${U.firstName(u.name)} antes: é com um deles que a pessoa entra.`, { tone: 'bad' });
      return Actions.editarConta(u.id, 0);
    }
    if (used) {
      const ok = await UI.confirm({
        title: 'Gerar código para nova senha?',
        text: html`${U.firstName(u.name)} vai criar uma senha nova com o código. Por segurança, ${U.firstName(u.name)} sai dos aparelhos conectados agora. Use quando a pessoa esqueceu a senha ou perdeu o acesso.`,
        ok: 'Gerar código',
      });
      if (!ok) return;
    }
    const res = await UI.act('users.invite', { id: u.id, reset: !!used }, { btn });
    if (!res) return;
    const inv = (res.effects || []).find((e) => e.type === 'invite');
    refreshMeta();
    if (inv) UI.showInvite(inv, { name: u.name, phone: u.phone, email: u.email });
    else UI.toast('Código gerado.');
  };
  const doStatus = (u, status, btn) =>
    UI.act('users.status', { id: u.id, status }, { btn, ok: status === 'ativo' ? `Conta de ${U.firstName(u.name)} reativada` : `Conta de ${U.firstName(u.name)} desativada. Ela saiu do sistema.` });
  const doDelete = async (u) => {
    const ok = await UI.confirm({
      title: `Excluir a conta de ${U.firstName(u.name)}?`,
      text: html`Use só para contas criadas por engano. A exclusão <b>não pode ser desfeita</b>. Se ${U.firstName(u.name)} já usou o sistema (chamadas, recados, turmas), desative a conta em vez de excluir.`,
      ok: 'Excluir conta',
      danger: true,
    });
    if (!ok) return;
    const res = await UI.act('users.delete', { id: u.id }, { ok: `Conta de ${U.firstName(u.name)} excluída` });
    if (res) App.go('equipe');
  };
  const doTransfer = async (u) => {
    const manages = effectiveOf(u).has('usuarios.gerenciar');
    const ok = await UI.confirm({
      title: 'Transferir a titularidade?',
      text: html`<p><b>${u.name}</b> passa a ser a conta titular: só ela poderá alterar a própria conta, fazer a virada do ano e importar dados.</p>
        <p style="margin-top:8px">Você continua com os seus acessos, mas deixa de ser titular. Só a nova titular pode transferir de volta.</p>
        ${manages ? '' : html`<p class="notice warn small" style="margin-top:10px">${icon('alert')}<span class="grow">${U.firstName(u.name)} hoje não tem o acesso “Pode criar contas da equipe”. Se for cuidar das contas, ajuste os acessos antes.</span></p>`}`,
      ok: 'Transferir',
      danger: true,
      requireText: 'TRANSFERIR',
    });
    if (!ok) return;
    await UI.act('owner.transfer', { userId: u.id }, { ok: `Titularidade transferida para ${u.name}` });
  };
  const doPreview = (u) => App.previewAs(u.id);

  /** Itens do menu de ações de uma conta (lista e detalhe). */
  const accountMenu = (u, { detail = false } = {}) => {
    const manage = canManage(u);
    const m = metaOf(u) || {};
    const used = m.hasPassword || m.lastLoginAt;
    const items = [];
    if (!detail) items.push({ label: 'Ver detalhes', icon: 'user', fn: () => App.go('equipe/' + u.id) });
    if (manage) {
      if (!detail) items.push({ label: 'Editar acessos', icon: 'pencil', fn: () => Actions.editarConta(u.id) });
      if (u.status === 'ativo') {
        if (!detail) items.push({ label: 'Ver como esta pessoa', icon: 'eye', hint: 'Mostra o sistema como ela vê, só leitura', fn: () => doPreview(u) });
        items.push({ label: !u.login ? 'Liberar acesso e gerar código' : used ? 'Gerar código para nova senha' : 'Gerar novo código de acesso', icon: 'key', fn: () => doInvite(u) });
      }
      if (!isOwner(u) && (u.status === 'ativo' || !detail)) items.push(u.status === 'ativo' ? { label: 'Desativar conta', icon: 'userX', hint: 'Sai do sistema na hora; pode ser desfeito', fn: () => doStatus(u, 'inativo') } : { label: 'Reativar conta', icon: 'userCheck', fn: () => doStatus(u, 'ativo') });
    }
    if (detail && Store.me.owner && !Store.preview && u.id !== Store.me.id && u.status === 'ativo' && u.login) items.push({ label: 'Tornar titular da conta', icon: 'shieldCheck', fn: () => doTransfer(u) });
    if (detail && Store.can('auditoria.ver')) items.push({ label: 'Ver atividades desta pessoa', icon: 'history', fn: () => verAtividades(u.id) });
    if (manage && detail) items.push('-', { label: 'Excluir conta', icon: 'trash', danger: true, hint: 'Só para contas criadas por engano', fn: () => doDelete(u) });
    return items;
  };
  const verAtividades = (uid) => {
    const st = PageState.get('atividades', {});
    st.userId = uid;
    st.key = '';
    App.go('atividades');
  };

  // =====================================================================
  // Lista da equipe / diretório
  // =====================================================================
  const FILTERS = [
    ['ativas', 'Ativas'],
    ['convite', 'Convite pendente'],
    ['nunca', 'Nunca entraram'],
    ['expira', 'Acesso vence em breve'],
    ['inativas', 'Inativas'],
    ['todas', 'Todas'],
  ];
  const matchFilter = (u, f, a) => {
    if (f === 'todas') return true;
    if (f === 'inativas') return u.status !== 'ativo';
    if (u.status !== 'ativo') return false;
    if (f === 'ativas') return true;
    if (f === 'convite') return a.key === 'convite';
    if (f === 'nunca') return a.key === 'nunca' || a.key === 'convite';
    if (f === 'expira') return a.key === 'vencido' || !!a.expiring;
    return true;
  };
  const listState = () => PageState.get('equipe', { q: '', role: '', filter: 'ativas' });

  const rowLinks = (u, links) => {
    const xs = links || [];
    const head = u.scope === 'todas' ? html`<span class="eq-scope-tag">${icon('layers')}Todas as turmas</span>` : u.scope === 'segmentos' ? html`<span class="eq-scope-tag">${icon('layers')}${(u.segments || []).join(', ') || 'Etapas'}</span>` : '';
    const shown = xs.slice(0, 3);
    // sem gerenciar contas o escopo dos outros não vem no retrato: aí "sem turmas" seria um palpite
    if (!xs.length && !head) return html`<span class="small muted">${u.status === 'ativo' && u.scope ? 'Sem turmas vinculadas' : '—'}</span>`;
    return html`${head}${shown.map((x) => html`<span class="eq-link"><b>${x.klass.name}</b> ${linkRole(x)}</span>`)}${xs.length > 3 ? html`<span class="eq-link more">+${xs.length - 3}</span>` : ''}${(u.linkedStudentIds || []).length ? html`<span class="eq-link"><b>${plural(u.linkedStudentIds.length, 'aluno', 'alunos')}</b> acompanhados</span>` : ''}`;
  };

  const listBody = () => {
    const st = listState();
    const mgr = isManager();
    const all = Q.staff({ status: 'todos' });
    const idx = linksIndex();
    const access = new Map(all.map((u) => [u.id, mgr ? accessOf(u) : null]));
    const roleOk = (u) => !st.role || (st.role.startsWith('g:') ? roleGroup(u.role) === st.role.slice(2) : u.role === st.role.slice(2));
    const filter = mgr ? st.filter : 'ativas';
    const list = all.filter((u) => roleOk(u) && matchFilter(u, filter, access.get(u.id) || {}) && (!st.q || U.matches(st.q, u.name, u.title, roleLabel(u.role), u.email, u.phone)));
    if (!list.length) {
      const any = all.length > 0;
      return html`<div class="card">${UI.empty({
        icon: any ? 'search' : 'users',
        title: any ? 'Ninguém encontrado' : 'A equipe ainda está vazia',
        text: any ? (st.q ? `Nada com “${st.q}” neste filtro. Confira a grafia ou troque o filtro.` : 'Nenhuma pessoa neste filtro.') : 'Crie as contas por cargo: cada pessoa recebe um código para criar a própria senha.',
        action: any ? html`<button type="button" class="btn" data-clear>${icon('x')}Limpar filtros</button>` : mgr ? html`<button type="button" class="btn primary" data-new>${icon('userPlus')}Nova conta da equipe</button>` : '',
      })}</div>`;
    }
    const owner = settings().ownerId;
    const grouped = GROUPS.map((g) => [g, list.filter((u) => roleGroup(u.role) === g)]).filter(([, xs]) => xs.length);
    return html`<div class="card eq-list-card">
      <div class="eq-row eq-row-head ${mgr ? '' : 'dir'}" aria-hidden="true"><span>Pessoa</span><span>${mgr ? 'Turmas' : 'Contato'}</span><span>${mgr ? 'Acesso' : 'Turmas'}</span><span></span></div>
      ${grouped.map(([g, xs]) => html`<h2 class="eq-group-head">${g}<span>${xs.length}</span></h2>
        <ul class="eq-list" role="list">${xs.map((u) => {
          const a = access.get(u.id);
          const manage = mgr && canManage(u);
          return html`<li class="eq-row ${mgr ? '' : 'dir'} ${u.status !== 'ativo' ? 'off' : ''}" data-row="${u.id}">
            <div class="person eq-who">${UI.avatar(u.name)}<div><a class="person-name" href="#equipe/${u.id}">${u.name}</a><div class="person-sub">${titleOf(u)}${roleAdds(u) ? html` · ${roleLabel(u.role)}` : ''}</div>${u.id === owner ? html`<span class="eq-owner-tag">${icon('shieldCheck')}Titular</span>` : ''}</div></div>
            ${mgr
              ? html`<div class="eq-links-cell">${rowLinks(u, idx.get(u.id))}</div>
                <div class="eq-acc"><div class="eq-pills">${accessPills(a)}</div>${a.sub ? html`<span class="eq-acc-sub">${a.sub}</span>` : ''}</div>`
              : html`<div class="eq-contact">${u.email ? html`<a href="mailto:${u.email}">${icon('mail')}<span>${u.email}</span></a>` : ''}${u.phone ? html`<a href="${U.whatsappLink(u.phone, `Olá, ${U.firstName(u.name)}!`)}" target="_blank" rel="noopener noreferrer">${icon('phone')}<span>${u.phone}</span></a>` : ''}${!u.email && !u.phone ? html`<span class="small muted">Sem contato</span>` : ''}</div>
                <div class="eq-links-cell">${rowLinks(u, idx.get(u.id))}</div>`}
            <div class="eq-act">${manage ? html`<button type="button" class="icon-btn" data-menu="${u.id}" aria-label="Ações para ${u.name}" aria-haspopup="menu">${icon('dots')}</button>` : ''}</div>
          </li>`;
        })}</ul>`)}
    </div>`;
  };

  const roleSelect = (st) => {
    const counts = countByRole();
    return html`<label class="sr-only" for="eq-role-f">Cargo</label><select class="input eq-role-filter" id="eq-role-f" data-role-filter>
      <option value="">Todos os cargos</option>
      ${GROUPS.map((g) => {
        const roles = STAFF_ROLES.filter((r) => r.group === g && counts[r.id]);
        if (!roles.length) return '';
        return html`<optgroup label="${g}"><option value="g:${g}" ${st.role === 'g:' + g ? raw('selected') : ''}>Todo o grupo ${g}</option>${roles.map((r) => html`<option value="r:${r.id}" ${st.role === 'r:' + r.id ? raw('selected') : ''}>${r.label} (${counts[r.id]})</option>`)}</optgroup>`;
      })}
    </select>`;
  };

  const renderList = () => {
    const st = listState();
    const mgr = isManager();
    const all = Q.staff({ status: 'todos' });
    const active = all.filter((u) => u.status === 'ativo');
    const withLogin = active.filter(canLogin).length;
    let chips = '';
    if (mgr) {
      const acc = new Map(all.map((u) => [u.id, accessOf(u)]));
      chips = html`<div class="chips eq-filters" role="group" aria-label="Situação">${FILTERS.map(([v, l]) => {
        const n = all.filter((u) => matchFilter(u, v, acc.get(u.id))).length;
        if (!n && !['ativas', 'todas'].includes(v) && st.filter !== v) return '';
        return html`<button type="button" class="chip" data-filter="${v}" aria-pressed="${String(st.filter === v)}">${l}<span class="eq-count">${n}</span></button>`;
      })}</div>`;
    }
    return html`
      <div class="page-head">
        <div><h1>${mgr ? 'Equipe e acessos' : 'Equipe'}</h1>
          <p class="lead">${mgr ? html`${plural(active.length, 'pessoa ativa', 'pessoas ativas')}, ${withLogin} com acesso ao sistema. Cada cargo já vem com acessos prontos; você escolhe o que mais cada pessoa pode fazer.` : html`Contatos de ${plural(active.length, 'pessoa', 'pessoas')} da equipe.`}</p></div>
        ${mgr ? html`<div class="btn-row"><a class="btn" href="#equipe/perfis">${icon('shield')}Perfis de acesso</a><button type="button" class="btn primary" data-new>${icon('userPlus')}Nova conta</button></div>` : ''}
      </div>
      <div class="toolbar eq-toolbar">
        <div class="search-box"><label class="sr-only" for="eq-q">Buscar na equipe</label>${icon('search')}<input class="input" id="eq-q" type="search" placeholder="Nome, cargo, e-mail ou celular" value="${st.q}" autocomplete="off"></div>
        ${roleSelect(st)}
      </div>
      ${chips}
      <div data-list>${listBody()}</div>`;
  };

  const mountList = (el) => {
    const st = listState();
    const q = el.querySelector('#eq-q');
    const redraw = () => UI.setHTML(el.querySelector('[data-list]'), listBody());
    q.addEventListener('input', U.debounce(() => {
      if (!document.contains(q)) return; // a tela já foi redesenhada
      st.q = q.value;
      redraw();
    }, 150));
    el.querySelector('[data-role-filter]').addEventListener('change', (e) => {
      st.q = q.value;
      st.role = e.target.value;
      App.render();
    });
    el.addEventListener('click', (e) => {
      const t = e.target;
      const f = t.closest('[data-filter]');
      if (f) {
        st.q = q.value;
        st.filter = f.dataset.filter;
        return App.render();
      }
      if (t.closest('[data-new]')) return Actions.novaConta();
      if (t.closest('[data-clear]')) {
        Object.assign(st, { q: '', role: '', filter: 'ativas' });
        return App.render();
      }
      const mb = t.closest('[data-menu]');
      if (mb) {
        const u = Q.user(mb.dataset.menu);
        if (u) UI.menu(mb, accountMenu(u));
        return;
      }
      if (t.closest('a, button, input, select, label')) return;
      const row = t.closest('[data-row]');
      if (row) App.go('equipe/' + row.dataset.row);
    });
  };

  // =====================================================================
  // Detalhe da pessoa
  // =====================================================================
  const detailState = () => PageState.get('equipe-detalhe', { all: false });
  const permsCard = (u) => {
    const eff = effectiveOf(u);
    const base = new Set(P.profile(u.role, settings()));
    const st = detailState();
    const c = permCounts(eff, base);
    const groups = P.groups();
    const touched = groups.filter((g) => g.items.some((i) => eff.has(i.key)));
    return html`<section class="card">
      <div class="card-head"><div><h2>Acessos</h2><p class="sub">Perfil ${roleLabel(u.role)}${c.extra ? ` · ${c.extra} extra${c.extra > 1 ? 's' : ''}` : ''}${c.off ? ` · ${c.off} retirado${c.off > 1 ? 's' : ''}` : ''}</p></div>
        ${seg([['0', 'O que tem'], ['1', 'Tudo']], st.all ? '1' : '0', 'data-show-all', 'Mostrar permissões')}</div>
      <div class="card-body">
        ${u.status !== 'ativo' ? html`<p class="notice warn small">${icon('alert')}<span class="grow">Conta desativada: hoje não acessa nada. Abaixo, o que terá se for reativada.</span></p>` : ''}
        <p class="eq-reach">${touched.length ? html`Acessa: <b>${touched.map((g) => g.group).join(', ')}</b>.` : 'Nenhum acesso.'}</p>
        <div class="eq-perm-view">${groups.map((g) => {
          const items = g.items.filter((i) => st.all || eff.has(i.key) || base.has(i.key));
          if (!items.length) return '';
          return html`<div class="eq-pv-group"><h3>${g.group}</h3><ul>${items.map((i) => {
            const on = eff.has(i.key);
            const inBase = base.has(i.key);
            const tag = on && !inBase ? html`<span class="eq-tag extra">extra</span>` : !on && inBase ? html`<span class="eq-tag off">retirado</span>` : '';
            return html`<li class="${on ? 'on' : 'no'} ${!on && inBase ? 'is-off' : ''}">${icon(on ? 'check' : 'x')}<span class="grow">${i.label}${i.sensitive ? html` <span class="eq-sens" title="Dado sensível">${icon('lock')}</span>` : ''}</span>${tag}</li>`;
          })}</ul></div>`;
        })}</div>
      </div>
    </section>`;
  };
  const linksCard = (u, mgr) => {
    const links = linksIndex().get(u.id) || [];
    const students = (u.linkedStudentIds || []).map((id) => Q.student(id)).filter(Boolean);
    return html`<section class="card">
      <div class="card-head"><h2>Turmas</h2>${mgr ? html`<span class="sub">${scopeText(u)}</span>` : ''}</div>
      <div class="card-body">
        ${links.length
          ? html`<ul class="items eq-class-list">${links.map((x) => html`<li>${icon('layers', 'muted')}<span class="grow"><a class="person-name" href="#turmas/${x.klass.id}">${x.klass.name}</a><span class="person-sub">${U.cap(linkRole(x, true))}</span></span></li>`)}</ul>`
          : html`<p class="small muted">${u.scope === 'todas' ? 'Vê todas as turmas, sem vínculo de aula.' : 'Ainda não atua em nenhuma turma.'}</p>`}
        ${students.length ? html`<h3 class="eq-mini-h">Alunos acompanhados</h3><ul class="items">${students.map((s) => html`<li>${UI.avatar(s.name, 'sm', s.photo)}<span class="grow"><a class="person-name" href="#alunos/${s.id}">${s.name}</a><span class="person-sub">${(Q.klass(s.classId) || {}).name || 'Sem turma'}</span></span></li>`)}</ul>` : ''}
        ${mgr && u.area ? html`<p class="small" style="margin-top:12px">Área de atendimento: <b>${Q.AREAS[u.area] || u.area}</b></p>` : ''}
      </div>
    </section>`;
  };
  const accessCard = (u) => {
    const a = accessOf(u);
    const m = metaOf(u) || {};
    const manage = canManage(u);
    return html`<section class="card">
      <div class="card-head"><h2>Acesso ao sistema</h2></div>
      <div class="card-body">
        ${UI.kv([
          ['Situação', html`<span class="eq-pills">${accessPills(a)}</span>`],
          ['Entra com', canLogin(u) ? [u.email, u.phone].filter(Boolean).join(' ou ') || html`<span class="muted">sem e-mail ou celular</span>` : 'Não entra no sistema'],
          ['Último acesso', u.id === Store.me.id ? 'Agora' : m.lastLoginAt ? `${U.fmtInstant(m.lastLoginAt)} (${U.ago(m.lastLoginAt)})` : 'Nunca'],
          a.pending ? ['Código pendente', `vale até ${U.fmtInstant(a.pending)}`] : null,
          ['Validade', u.validUntil ? `até ${U.fmtDate(u.validUntil)}` : 'Sem prazo'],
          u.createdAt ? ['Conta criada', U.fmtDate(u.createdAt.slice(0, 10))] : null,
        ])}
        ${manage && u.status === 'ativo' && u.login
          ? html`<div class="btn-row" style="margin-top:14px"><button type="button" class="btn sm" data-invite>${icon('key')}${m.hasPassword || m.lastLoginAt ? 'Gerar código para nova senha' : 'Gerar novo código de acesso'}</button></div>`
          : manage && u.status === 'ativo' && !u.login
            ? html`<div class="btn-row" style="margin-top:14px"><button type="button" class="btn sm" data-invite>${icon('key')}Liberar acesso e gerar código</button></div>`
            : ''}
      </div>
    </section>`;
  };

  const renderDetail = (id) => {
    const u = Q.user(id);
    if (!u || u.role === 'responsavel') {
      return html`<div><nav class="crumbs"><a href="#equipe">Equipe e acessos</a></nav></div><div class="card">${UI.empty({ icon: 'user', title: 'Pessoa não encontrada', text: 'A conta pode ter sido excluída ou estar fora do seu acesso.', action: html`<a class="btn primary" href="#equipe">Voltar para a equipe</a>` })}</div>`;
    }
    const mgr = isManager();
    const manage = canManage(u);
    const self = u.id === Store.me.id;
    const owner = isOwner(u);
    const a = mgr ? accessOf(u) : null;
    const menu = accountMenu(u, { detail: true });
    const blockedBy = mgr && !manage && !self && !owner ? [...effectiveOf(u)].filter((p) => !P.CONFIDENTIAL.has(p) && !myPerms().has(p)) : [];
    return html`
      <div><nav class="crumbs"><a href="#equipe">${mgr ? 'Equipe e acessos' : 'Equipe'}</a>${icon('chevronRight')}<span>${U.shortName(u.name)}</span></nav></div>
      <section class="card profile-head eq-head">
        ${UI.avatar(u.name, 'lg')}
        <div class="grow">
          <h1>${u.name}</h1>
          <div class="meta-row"><span>${titleOf(u)}</span>${roleAdds(u) ? html`<span class="muted">Cargo: ${roleLabel(u.role)}</span>` : ''}${owner ? UI.pill('Conta titular', 'mark') : ''}${a ? accessPills(a) : u.status !== 'ativo' ? UI.pill('Inativo') : ''}</div>
          <div class="meta-row eq-contact-row">
            ${u.email ? html`<span>${icon('mail', 'muted')}<a href="mailto:${u.email}">${u.email}</a><button type="button" class="copy-btn" data-copy="${u.email}" aria-label="Copiar e-mail">${icon('copy')}</button></span>` : ''}
            ${u.phone ? html`<span>${icon('phone', 'muted')}<a href="tel:${U.digits(u.phone)}">${u.phone}</a><a class="btn sm ghost" href="${U.whatsappLink(u.phone, `Olá, ${U.firstName(u.name)}!`)}" target="_blank" rel="noopener noreferrer">WhatsApp</a></span>` : ''}
          </div>
        </div>
        <div class="btn-row eq-head-actions">
          ${self ? html`<button type="button" class="btn" data-my>${icon('user')}Meus dados</button>` : ''}
          ${manage && u.status === 'ativo' ? html`<button type="button" class="btn" data-preview>${icon('eye')}Ver como</button>` : ''}
          ${manage ? html`<button type="button" class="btn primary" data-edit>${icon('pencil')}Editar acessos</button>` : ''}
          ${manage && u.status !== 'ativo' ? html`<button type="button" class="btn" data-reactivate>${icon('userCheck')}Reativar</button>` : ''}
          ${menu.length ? html`<button type="button" class="icon-btn" data-more aria-label="Mais ações" aria-haspopup="menu">${icon('dots')}</button>` : ''}
        </div>
      </section>
      ${self && mgr ? html`<div class="notice">${icon('info')}<span class="grow">Esta é a sua conta. Para mudar o seu próprio cargo ou acessos, peça a outra pessoa que gerencia contas${owner ? ' (a conta titular só muda os próprios dados em "Meus dados")' : ''}.</span></div>` : ''}
      ${!self && owner && mgr ? html`<div class="notice">${icon('shieldCheck')}<span class="grow">Conta titular: responsável pelo sistema. Só a própria titular altera esta conta.</span></div>` : ''}
      ${blockedBy.length ? html`<div class="notice warn">${icon('lock')}<span class="grow">Você não pode alterar esta conta: ela tem acessos que você não tem (${blockedBy.slice(0, 3).map(shortPerm).join(', ')}${blockedBy.length > 3 ? ` e mais ${blockedBy.length - 3}` : ''}).</span></div>` : ''}
      ${a && a.key === 'vencido' && manage ? html`<div class="notice warn">${icon('clock')}<span class="grow">O acesso de ${U.firstName(u.name)} venceu em ${U.fmtDate(u.validUntil)}. Para liberar de novo, mude a validade.</span><button type="button" class="btn sm" data-edit-step="3">Mudar validade</button></div>` : ''}
      ${mgr || self
        ? html`<div class="grid-2">
            <div class="stack">${permsCard(u)}</div>
            <div class="stack">${linksCard(u, true)}${mgr ? accessCard(u) : ''}</div>
          </div>`
        : html`<div class="eq-dir-detail">${linksCard(u, false)}</div>`}`;
  };
  const mountDetail = (el, id) => {
    const u = Q.user(id);
    if (!u) return;
    el.addEventListener('click', (e) => {
      const t = e.target;
      const cp = t.closest('[data-copy]');
      if (cp) return UI.copy(cp.dataset.copy);
      if (t.closest('[data-edit]')) return Actions.editarConta(u.id);
      const es = t.closest('[data-edit-step]');
      if (es) return Actions.editarConta(u.id, Number(es.dataset.editStep));
      if (t.closest('[data-preview]')) return doPreview(u);
      if (t.closest('[data-my]')) return App.myAccount();
      const inv = t.closest('[data-invite]');
      if (inv) return doInvite(u, inv);
      const re = t.closest('[data-reactivate]');
      if (re) return doStatus(u, 'ativo', re);
      const more = t.closest('[data-more]');
      if (more) return UI.menu(more, accountMenu(u, { detail: true }));
      const sa = t.closest('[data-show-all]');
      if (sa) {
        detailState().all = sa.dataset.showAll === '1';
        App.render();
      }
    });
  };

  // =====================================================================
  // Perfis de acesso por cargo
  // =====================================================================
  const profState = () => PageState.get('equipe-perfis', { role: '', drafts: {} });
  const renderProfiles = () => {
    if (!isManager()) {
      return html`<div class="card">${UI.empty({ icon: 'lock', title: 'Sem acesso aos perfis', text: 'Só quem cria contas da equipe pode mudar os perfis de acesso dos cargos.', action: html`<a class="btn primary" href="#equipe">Voltar para a equipe</a>` })}</div>`;
    }
    const st = profState();
    if (!P.ROLE[st.role] || P.ROLE[st.role].family) st.role = STAFF_ROLES.find((r) => r.id !== Store.me.role).id;
    const role = st.role;
    const roleDef = P.ROLE[role];
    const sett = settings();
    const system = new Set(roleDef.perms);
    const current = new Set(P.profile(role, sett));
    const custom = !!(sett.profiles && Array.isArray(sett.profiles[role]));
    const sel = st.drafts[role] ? new Set(st.drafts[role]) : current;
    const dirty = !sameSet(sel, current);
    const own = role === Store.me.role;
    const people = Q.staff({ status: 'todos' }).filter((u) => u.role === role);
    const active = people.filter((u) => u.status === 'ativo');
    const mine = myPerms();
    const outOfReach = [...sel].filter((p) => !canGrant(p, mine));
    let blockers = [];
    if (dirty && !own) {
      const trial = { ...S(), settings: { ...sett, profiles: { ...(sett.profiles || {}), [role]: [...sel] } } };
      const a = myDoc();
      blockers = active.filter((u) => u.id !== Store.me.id && !(a && P.dominates(a, u, trial)));
    }
    const counts = countByRole();
    const locked = own || outOfReach.length > 0;
    const c = permCounts(sel, system);
    return html`
      <div><nav class="crumbs"><a href="#equipe">Equipe e acessos</a>${icon('chevronRight')}<span>Perfis de acesso</span></nav></div>
      <div class="page-head"><div><h1>Perfis de acesso</h1><p class="lead">O que cada cargo recebe por padrão. Mudar um perfil vale para todas as pessoas do cargo; os extras e retirados de cada pessoa continuam valendo.</p></div></div>
      <div class="eq-profiles">
        <aside class="card eq-role-nav" aria-label="Cargos">
          <div class="eq-role-select"><label class="sr-only" for="eq-prof-role">Cargo</label><select class="input" id="eq-prof-role" data-prof-role>${GROUPS.map((g) => html`<optgroup label="${g}">${STAFF_ROLES.filter((r) => r.group === g).map((r) => html`<option value="${r.id}" ${r.id === role ? raw('selected') : ''}>${r.label}${st.drafts[r.id] ? ' (não salvo)' : ''}</option>`)}</optgroup>`)}</select></div>
          <div class="eq-role-list">${GROUPS.map((g) => html`<div class="eq-rl-group"><h3>${g}</h3>${STAFF_ROLES.filter((r) => r.group === g).map((r) => {
            const isCustom = sett.profiles && Array.isArray(sett.profiles[r.id]);
            return html`<button type="button" class="eq-rl-item" data-prof="${r.id}" aria-pressed="${String(r.id === role)}"><span class="grow">${r.label}</span>${st.drafts[r.id] ? html`<span class="eq-dot" title="Alterações não salvas"></span>` : ''}${isCustom ? html`<span class="eq-tag extra" title="Personalizado pela escola">escola</span>` : ''}<span class="eq-rl-n" title="Pessoas com este cargo">${counts[r.id] || 0}</span></button>`;
          })}</div>`)}</div>
        </aside>
        <section class="card eq-prof-editor">
          <div class="card-head"><div><h2>${roleDef.label} ${custom ? html`<span class="eq-tag extra">perfil da escola</span>` : html`<span class="eq-tag std">padrão do sistema</span>`}</h2><p class="sub">${ROLE_INFO[role] || ''}</p></div></div>
          <div class="card-body">
            <p class="eq-affect">${icon('users')}${people.length ? html`<span>Usado por <b>${plural(people.length, 'pessoa', 'pessoas')}</b>${people.length !== active.length ? ` (${active.length} ativa${active.length === 1 ? '' : 's'})` : ''}: ${people.slice(0, 4).map((u) => U.shortName(u.name)).join(', ')}${people.length > 4 ? ` e mais ${people.length - 4}` : ''}.</span>` : html`<span>Ninguém tem este cargo ainda. O perfil vale para as próximas contas.</span>`}</p>
            ${own ? html`<div class="notice warn">${icon('lock')}<span class="grow">Este é o seu cargo. Para ninguém mudar o próprio acesso, o perfil do seu cargo só pode ser alterado por outra pessoa que gerencia contas.</span></div>` : ''}
            ${!own && outOfReach.length ? html`<div class="notice warn">${icon('lock')}<span class="grow">Este perfil tem acessos que você não tem (${outOfReach.slice(0, 3).map(shortPerm).join(', ')}${outOfReach.length > 3 ? '…' : ''}). Só quem tem todos eles pode alterá-lo.</span></div>` : ''}
            ${blockers.length ? html`<div class="notice bad">${icon('alert')}<span class="grow">Esta mudança não pode ser salva: afetaria ${blockers.map((u) => U.shortName(u.name)).join(', ')}, que ${blockers.length === 1 ? 'tem' : 'têm'} acessos que você não tem.</span></div>` : ''}
            <div class="eq-sums eq-sums-prof" data-sums>${permSummary(sel, system, 'profile')}</div>
            ${permEditor({ sel, base: system, mode: 'profile', locked, note: st.note || '' })}
          </div>
          <div class="eq-prof-bar">
            <span class="grow small muted">${dirty ? html`<b class="eq-unsaved">Alterações não salvas</b> · ` : ''}${sel.size} permissões · ${c.extra} acrescentada${c.extra === 1 ? '' : 's'} e ${c.off} retirada${c.off === 1 ? '' : 's'} em relação ao padrão do sistema</span>
            ${custom && !own && !outOfReach.length ? html`<button type="button" class="btn ghost" data-prof-reset>${icon('refresh')}Restaurar padrão do sistema</button>` : ''}
            ${dirty ? html`<button type="button" class="btn" data-prof-discard>Descartar</button>` : ''}
            <button type="button" class="btn primary" data-prof-save ${!dirty || locked || blockers.length ? raw('disabled') : ''}>${icon('check')}Salvar perfil</button>
          </div>
        </section>
      </div>`;
  };
  const mountProfiles = (el) => {
    const st = profState();
    const focusPerm = (key) => {
      const x = document.querySelector(`main [data-perm="${CSS.escape(key)}"]`);
      x && x.focus({ preventScroll: true });
    };
    el.addEventListener('change', (e) => {
      const t = e.target;
      if (t.dataset.perm) {
        const role = st.role;
        const sel = st.drafts[role] ? new Set(st.drafts[role]) : new Set(P.profile(role, settings()));
        st.note = togglePerm(sel, t.dataset.perm, t.checked);
        const current = new Set(P.profile(role, settings()));
        if (sameSet(sel, current)) delete st.drafts[role];
        else st.drafts[role] = [...sel];
        App.render();
        focusPerm(t.dataset.perm);
        return;
      }
      if (t.matches('[data-prof-role]')) {
        st.role = t.value;
        st.note = '';
        App.render();
      }
    });
    el.addEventListener('click', async (e) => {
      const t = e.target;
      const r = t.closest('[data-prof]');
      if (r) {
        st.role = r.dataset.prof;
        st.note = '';
        App.render();
        const again = document.querySelector(`main [data-prof="${CSS.escape(st.role)}"]`);
        again && again.focus({ preventScroll: true });
        if (window.innerWidth < 900) document.querySelector('main .eq-prof-editor').scrollIntoView({ block: 'start' });
        return;
      }
      if (t.closest('[data-prof-discard]')) {
        delete st.drafts[st.role];
        st.note = '';
        return App.render();
      }
      const role = st.role;
      const label = roleLabel(role);
      const people = Q.staff({ status: 'todos' }).filter((u) => u.role === role);
      const sv = t.closest('[data-prof-save]');
      if (sv) {
        const perms = st.drafts[role];
        if (!perms) return;
        if (people.length) {
          const ok = await UI.confirm({
            title: `Salvar o perfil “${label}”?`,
            text: html`O acesso de <b>${plural(people.length, 'pessoa', 'pessoas')}</b> muda agora. Quem estiver conectado precisará entrar de novo (com a mesma senha).`,
            ok: 'Salvar perfil',
          });
          if (!ok) return;
        }
        const res = await UI.act('profiles.save', { role, perms }, { btn: sv, ok: `Perfil “${label}” salvo` });
        if (res) {
          delete st.drafts[role];
          st.note = '';
          App.render();
        }
        return;
      }
      const rs = t.closest('[data-prof-reset]');
      if (rs) {
        const ok = await UI.confirm({
          title: `Restaurar o padrão do sistema para “${label}”?`,
          text: html`O perfil volta a ser o que a Caderneta sugere para o cargo.${people.length ? html` Isso muda o acesso de <b>${plural(people.length, 'pessoa', 'pessoas')}</b>.` : ''}`,
          ok: 'Restaurar padrão',
        });
        if (!ok) return;
        const res = await UI.act('profiles.save', { role, reset: true }, { btn: rs, ok: `Perfil “${label}” voltou ao padrão do sistema` });
        if (res) {
          delete st.drafts[role];
          st.note = '';
          App.render();
        }
      }
    });
  };

  // =====================================================================
  // Registro
  // =====================================================================
  App.page({
    id: 'equipe',
    label: 'Equipe e acessos',
    icon: 'briefcase',
    group: 'Gestão',
    order: 60,
    anyPerm: ['equipe.ver', 'usuarios.gerenciar'],
    keys: 'professores colaboradores usuários contas permissões cargos',
    title: (rest) => (rest[0] === 'perfis' ? 'Perfis de acesso' : rest[0] ? Q.userName(rest[0], 'Equipe') : 'Equipe e acessos'),
    render(rest) {
      if (rest[0] === 'perfis') return renderProfiles();
      if (rest[0]) return renderDetail(rest[0]);
      return renderList();
    },
    mount(el, rest) {
      if (rest[0] === 'perfis') return isManager() && mountProfiles(el);
      if (rest[0]) return mountDetail(el, rest[0]);
      mountList(el);
    },
  });

  App.action({ id: 'nova-conta', label: 'Nova conta da equipe', icon: 'userPlus', order: 80, perm: 'usuarios.gerenciar', keys: 'usuário colaborador professor funcionário acesso conta convite', run: () => Actions.novaConta() });

  App.widget({
    id: 'equipe-acessos',
    order: 80,
    size: 'half',
    perm: 'usuarios.gerenciar',
    render() {
      const staff = Q.staff().filter((u) => u.login);
      const acc = staff.map((u) => [u, accessOf(u)]);
      const pending = acc.filter(([, a]) => a.key === 'convite');
      const never = acc.filter(([, a]) => a.key === 'nunca');
      const expiring = acc.filter(([, a]) => a.key === 'vencido' || (a.expiring && a.exp <= 7));
      const block = (title, ic, tone, rows, meta) =>
        rows.length
          ? html`<div class="eq-w-block"><h3>${icon(ic)}${title}<span class="eq-count">${rows.length}</span></h3><ul class="items">${rows.slice(0, 4).map(([u, a]) => html`<li>${UI.avatar(u.name, 'sm')}<span class="grow"><a class="person-name" href="#equipe/${u.id}" title="${u.name}">${u.name}</a><span class="person-sub">${meta(u, a)}</span></span>${canManage(u) ? html`<button type="button" class="btn sm" data-w-invite="${u.id}">${icon('key')}<span class="hide-xs">Código</span></button>` : ''}</li>`)}</ul>${rows.length > 4 ? html`<a class="small" href="#equipe">e mais ${rows.length - 4}…</a>` : ''}</div>`
          : '';
      const any = pending.length || never.length || expiring.length;
      return html`<section class="card eq-widget">
        <div class="card-head"><h2>Acessos da equipe</h2><a class="btn sm ghost" href="#equipe">Ver equipe${icon('chevronRight')}</a></div>
        <div class="card-body">${any
          ? html`${block('Convites pendentes', 'mail', 'warn', pending, (u, a) => `${titleOf(u)} · código até ${U.fmtInstant(a.pending)}`)}
              ${block('Nunca entraram', 'userX', 'warn', never, (u) => `${titleOf(u)} · sem código ativo`)}
              ${block('Acesso vence em até 7 dias', 'clock', 'bad', expiring, (u, a) => (a.key === 'vencido' ? `venceu em ${U.fmtDate(u.validUntil)}` : a.exp === 0 ? 'vence hoje' : `até ${U.fmtDate(u.validUntil)}`))}`
          : html`<p class="eq-w-ok">${icon('checkCircle')}<span>Tudo em dia: todos da equipe já entraram e nenhum acesso vence nesta semana.</span></p>`}</div>
      </section>`;
    },
    mount(el) {
      el.addEventListener('click', (e) => {
        const b = e.target.closest('[data-w-invite]');
        if (!b) return;
        const u = Q.user(b.dataset.wInvite);
        if (u) doInvite(u, b);
      });
    },
  });

  App.searchProvider((q) => {
    if (!Store.me || Store.family || !Store.canAny('equipe.ver', 'usuarios.gerenciar')) return [];
    return Q.staff({ status: 'todos' })
      .filter((u) => U.matches(q, u.name, u.title, roleLabel(u.role), u.email))
      .slice(0, 6)
      .map((u) => ({ group: 'Equipe', label: u.name, avatar: u.name, meta: u.status === 'ativo' ? titleOf(u) : 'Inativo', keys: [u.name, u.title, roleLabel(u.role), u.email].join(' '), run: () => App.go('equipe/' + u.id) }));
  });

  Actions.novaConta = (preset = {}) => openWizard(null, preset);
  Actions.editarConta = (id, step = 0) => openWizard(id, { step });
  Actions.verPessoa = (id) => App.go('equipe/' + id);
})();
