'use strict';
/* Configurações da escola (Gestão).
   Seções (#configuracoes/<seção>), cada uma com o próprio formulário e "Salvar" (settings.update {patch} com a lista
   branca do núcleo): dados da escola, ano letivo e avaliação, etapas de ensino, disciplinas (subjects.save/delete),
   agenda e família (inclui o editor dos campos da rotina), mensalidades, privacidade (LGPD, nova versão do aviso),
   perfis de acesso (atalho para #equipe/perfis), virada do ano letivo (só a titular: year.rollover, com senha) e
   backup (dados.backup: exportar; importar só a titular). Na demonstração: "Recomeçar demonstração".
   Rascunhos ficam em PageState (sobrevivem às re-renderizações e à troca de seção) até salvar ou descartar.
   Também: quadro "Primeiros passos" do painel (titular, escola ainda vazia) e busca rápida pelas seções. */
(() => {
  const can = (p) => Store.can(p);
  const me = () => Store.me;
  const S = () => Q.settings();
  const today = () => U.today();
  const isOwner = () => !!(me() && me().owner);
  const ro = () => !!Store.preview;
  const hasPage = (id) => App.pages().some((p) => p.id === id);
  const fn = (name) => typeof Actions[name] === 'function';
  const joinPt = (list) => (list.length > 1 ? `${list.slice(0, -1).join(', ')} e ${list[list.length - 1]}` : list[0] || '');
  const CS = () => PageState.get('configuracoes', { drafts: {} });
  const clone = (v) => JSON.parse(JSON.stringify(v == null ? null : v));
  const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
  /** Base + rascunho (objetos aninhados mesclados; listas substituídas). */
  const merge = (base, over) => {
    if (!isObj(over)) return over === undefined ? base : over;
    const out = isObj(base) ? { ...base } : {};
    for (const k of Object.keys(over)) out[k] = isObj(over[k]) ? merge(out[k], over[k]) : over[k];
    return out;
  };
  /** NaN nunca volta para a tela (o campo fica vazio). */
  const sanitize = (v) => {
    if (typeof v === 'number' && isNaN(v)) return '';
    if (Array.isArray(v)) return v.map(sanitize);
    if (isObj(v)) return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, sanitize(x)]));
    return v;
  };
  /** Número decimal digitado do jeito brasileiro ("6,5"); vazio = null. */
  const dec = (x) => (x === '' || x == null ? null : U.parseNum(x));
  const fmtDec = (v) => (v == null || v === '' || isNaN(Number(v)) ? '' : Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 2 }));
  /** Campo decimal em texto (o campo numérico do navegador recusa vírgula fora do português). */
  const decField = (name, label, { min, max, required = false, hint = '', full = false, check = null } = {}) => ({
    name,
    label,
    required,
    hint,
    full,
    maxlength: 6,
    placeholder: '0,0',
    attrs: raw('inputmode="decimal"'),
    check: (x, d) => {
      if (x === '' || x == null) return '';
      const n = dec(x);
      if (isNaN(n)) return 'Informe um número (ex.: 6,5).';
      if (n < min || n > max) return `Use um valor entre ${fmtDec(min)} e ${fmtDec(max)}.`;
      return check ? check(n, d) || '' : '';
    },
  });
  const TERM_LABEL = { 2: 'semestre', 3: 'trimestre', 4: 'bimestre' };
  const TERM_PLURAL = { 2: 'semestres', 3: 'trimestres', 4: 'bimestres' };
  const SEGMENTS = ['Educação Infantil', 'Fundamental I', 'Fundamental II', 'Ensino Médio', 'EJA', 'Outro'];
  const SHIFTS = ['Manhã', 'Tarde', 'Noite', 'Integral'];
  const COLORS = [[1, 'Azul'], [2, 'Laranja'], [3, 'Verde-água'], [4, 'Amarelo'], [5, 'Rosa'], [6, 'Verde'], [7, 'Roxo'], [8, 'Vermelho']];
  const HOMEWORK = ['Dever de casa', 'Lição de casa', 'Tarefa', 'Para casa'];
  const TIMEZONES = [
    ['America/Sao_Paulo', 'Horário de Brasília (Sudeste, Sul, GO e DF)'],
    ['America/Bahia', 'Horário de Brasília (Bahia)'],
    ['America/Fortaleza', 'Horário de Brasília (CE, RN, PB, PI e MA)'],
    ['America/Recife', 'Horário de Brasília (Pernambuco)'],
    ['America/Maceio', 'Horário de Brasília (Alagoas e Sergipe)'],
    ['America/Belem', 'Horário de Brasília (Pará e Amapá)'],
    ['America/Araguaina', 'Horário de Brasília (Tocantins)'],
    ['America/Manaus', 'Amazonas (1 h a menos)'],
    ['America/Cuiaba', 'Mato Grosso (1 h a menos)'],
    ['America/Campo_Grande', 'Mato Grosso do Sul (1 h a menos)'],
    ['America/Porto_Velho', 'Rondônia (1 h a menos)'],
    ['America/Boa_Vista', 'Roraima (1 h a menos)'],
    ['America/Rio_Branco', 'Acre (2 h a menos)'],
    ['America/Noronha', 'Fernando de Noronha (1 h a mais)'],
  ];

  // ---------- CNPJ (máscara e dígitos verificadores) ----------
  const maskCNPJ = (v) =>
    U.digits(v)
      .slice(0, 14)
      .replace(/^(\d{2})(\d)/, '$1.$2')
      .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
      .replace(/\.(\d{3})(\d)/, '.$1/$2')
      .replace(/(\d{4})(\d)/, '$1-$2');
  const validCNPJ = (v) => {
    const d = U.digits(v);
    if (d.length !== 14 || /^(\d)\1+$/.test(d)) return false;
    const dv = (len) => {
      const w = len === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
      const r = w.reduce((a, x, i) => a + Number(d[i]) * x, 0) % 11;
      return r < 2 ? 0 : 11 - r;
    };
    return dv(12) === Number(d[12]) && dv(13) === Number(d[13]);
  };

  // ---------- "revisei as etapas e disciplinas" (conveniência deste aparelho, para os primeiros passos) ----------
  const REVIEW_KEY = () => `caderneta.passos.revisado.${me() ? me().id : ''}`;
  const reviewed = () => {
    try {
      return localStorage.getItem(REVIEW_KEY()) === '1';
    } catch (e) {
      return false;
    }
  };
  const markReviewed = () => {
    try {
      localStorage.setItem(REVIEW_KEY(), '1');
    } catch (e) {
      /* sem armazenamento: o passo continua aberto */
    }
  };

  // =====================================================================
  // Seções
  // =====================================================================
  const editor = () => can('configuracoes.editar');
  const SECTIONS = [
    { id: 'escola', label: 'Dados da escola', icon: 'school', desc: 'Nome, CNPJ, contato e fuso', keys: 'cnpj telefone endereço fuso horário nome', when: editor },
    { id: 'ano', label: 'Ano letivo e avaliação', icon: 'calendar', desc: 'Etapas, médias e faltas seguidas', keys: 'bimestre trimestre semestre média recuperação etapa atual faltas', when: editor },
    { id: 'etapas', label: 'Etapas de ensino', icon: 'layers', desc: 'Chamada, frequência e avaliação', keys: 'educação infantil fundamental médio chamada por aula diária frequência mínima parecer nota', when: editor },
    { id: 'disciplinas', label: 'Disciplinas', icon: 'book', desc: 'Nomes, siglas, cores e aulas', keys: 'matéria disciplina sigla cor aulas semanais', when: editor },
    { id: 'agenda', label: 'Agenda e família', icon: 'bookOpen', desc: 'Dever, aprovação e rotina', keys: 'dever de casa lição tarefa aprovação coordenação mensagens famílias rotina infantil horário de atendimento', when: editor },
    { id: 'financeiro', label: 'Mensalidades', icon: 'wallet', desc: 'Valor, vencimento, multa e Pix', keys: 'mensalidade vencimento multa juros pix cobrança', when: editor },
    { id: 'privacidade', label: 'Privacidade (LGPD)', icon: 'shield', desc: 'Controlador, encarregado e aviso', keys: 'lgpd dpo encarregado controlador aviso de privacidade consentimento', when: editor },
    { id: 'acessos', label: 'Perfis de acesso', icon: 'key', desc: 'O que cada cargo pode fazer', keys: 'permissões cargos perfis acessos', when: () => can('usuarios.gerenciar') },
    { id: 'virada', label: 'Virada do ano letivo', icon: 'repeat', desc: 'Encerrar o ano e abrir o próximo', keys: 'virada ano novo rematrícula promover aprovados retidos encerrar ano', when: () => isOwner() },
    { id: 'backup', label: 'Backup e dados', icon: 'download', desc: 'Exportar e importar uma cópia', keys: 'backup exportar importar cópia segurança restaurar', when: () => can('dados.backup') },
  ];
  const sections = () => SECTIONS.filter((s) => {
    try {
      return s.when();
    } catch (e) {
      return false;
    }
  });
  const current = (rest) => {
    const list = sections();
    return list.find((s) => s.id === rest[0]) || list[0] || null;
  };

  // ---------- peças comuns ----------
  const secHead = (title, text, extra = '') => html`<div class="cf-sec-head"><div><h2>${title}</h2>${text ? html`<p class="muted">${text}</p>` : ''}</div>${extra}</div>`;
  const savebar = (sec, { label = 'Salvar alterações', extra = '' } = {}) => {
    if (ro()) return '';
    const dirty = !!CS().drafts[sec];
    return html`<div class="cf-foot ${dirty ? 'is-dirty' : ''}" data-cf-foot>
      <span class="cf-state ${dirty ? 'is-dirty' : ''}" data-cf-state aria-live="polite">${dirty ? html`${icon('alert')}Alterações não salvas` : html`${icon('checkCircle')}Tudo salvo`}</span>
      <span class="cf-foot-btns">${extra}<button type="button" class="btn" data-cf-discard ${dirty ? '' : 'disabled'}>Descartar</button><button type="submit" class="btn primary" data-cf-save ${dirty ? '' : 'disabled'}>${icon('check')}${label}</button></span>
    </div>`;
  };
  const roNotice = () => (ro() ? html`<div class="notice">${icon('eye')}<span class="grow">Você está vendo como outra pessoa: as configurações aparecem só para leitura.</span></div>` : '');

  /** Definições dos formulários simples (os nomes são iguais aos campos do comando, para marcar os erros do servidor). */
  const SIMPLE = {
    escola: {
      ok: 'Dados da escola salvos',
      values: () => {
        const s = S();
        return { schoolName: s.schoolName || '', cnpj: s.cnpj || '', phone: s.phone || '', address: s.address || '', timezone: s.timezone || 'America/Sao_Paulo' };
      },
      defs: (v) => [
        { name: 'schoolName', label: 'Nome da escola', required: true, maxlength: 120, full: true, hint: 'Aparece no topo do sistema, nos recibos, nos boletins e para as famílias.' },
        { name: 'cnpj', label: 'CNPJ', maxlength: 18, placeholder: '00.000.000/0000-00', attrs: raw('inputmode="numeric" data-cf-mask="cnpj"'), check: (x) => (x && U.digits(x) !== U.digits(S().cnpj) && !validCNPJ(x) ? 'CNPJ inválido. Confira os números.' : '') },
        { name: 'phone', label: 'Telefone da escola', type: 'tel', autocomplete: 'tel' },
        { name: 'address', label: 'Endereço', maxlength: 200, full: true, placeholder: 'Rua, número — bairro, cidade/UF' },
        {
          name: 'timezone',
          label: 'Fuso horário',
          type: 'select',
          full: true,
          options: TIMEZONES.some(([k]) => k === v.timezone) ? TIMEZONES : TIMEZONES.concat([[v.timezone, v.timezone]]),
          hint: 'Define o "hoje" da escola: a data da chamada, da agenda e dos vencimentos.',
        },
      ],
      // o fuso só vai quando muda (um fuso antigo, fora da lista, continua valendo)
      patch: (d) => ({ schoolName: d.schoolName, cnpj: d.cnpj ? maskCNPJ(d.cnpj) : '', phone: d.phone, address: d.address, ...(d.timezone && d.timezone !== S().timezone ? { timezone: d.timezone } : {}) }),
    },
    ano: {
      ok: 'Ano letivo e avaliação salvos',
      values: () => {
        const s = S();
        return { termCount: String(s.termCount || 4), term: String(s.term || 1), passing: fmtDec(s.passing ?? 6), recovery: fmtDec(s.recovery ?? 4), absenceAlert: s.absenceAlert ?? 3 };
      },
      defs: (v) => {
        const n = Number(v.termCount) || 4;
        return [
          { name: 'termCount', label: 'Como o ano é dividido', type: 'chips', required: true, full: true, options: [['4', '4 bimestres'], ['3', '3 trimestres'], ['2', '2 semestres']], hint: 'As notas são lançadas por etapa; a média final é a média das etapas.' },
          { name: 'term', label: 'Etapa atual', type: 'select', required: true, options: termOptions(n), hint: 'É a etapa que abre primeiro nas notas e aparece no topo do sistema.' },
          { name: 'absenceAlert', label: 'Alerta de faltas seguidas', type: 'number', required: true, min: 2, max: 30, step: 1, hint: 'Avisa a equipe quando um aluno chega a este número de faltas seguidas.', check: (x) => (x != null && x !== '' && !Number.isInteger(x) ? 'Use um número inteiro.' : '') },
          html`<h3 class="form-h">Notas</h3>`,
          decField('passing', 'Média para aprovação', { required: true, min: 0, max: 10, hint: 'Média final igual ou maior que esta: aprovado(a).' }),
          decField('recovery', 'Nota mínima para recuperação', { required: true, min: 0, max: 10, hint: 'Entre esta nota e a média: recuperação. Abaixo dela: reprovado(a).', check: (n, d) => (dec(d.passing) != null && n > dec(d.passing) ? 'Não pode ser maior que a média para aprovação.' : '') }),
        ];
      },
      patch: (d) => ({ termCount: Number(d.termCount), term: Number(d.term), passing: dec(d.passing), recovery: dec(d.recovery), absenceAlert: d.absenceAlert }),
    },
    financeiro: {
      ok: 'Regras das mensalidades salvas',
      values: () => {
        const s = S();
        return { chargesFees: s.chargesFees !== false, defaultFee: s.defaultFee || 0, dueDay: s.dueDay || 10, lateFine: fmtDec(s.lateFine ?? 2), lateInterest: fmtDec(s.lateInterest ?? 1), pixKey: s.pixKey || '' };
      },
      defs: () => [
        { name: 'chargesFees', label: 'A escola cobra mensalidades pela Caderneta', type: 'checkbox', full: true, hint: 'Desligado, a área Financeiro e as mensalidades somem para a equipe e para as famílias (nada é apagado).' },
        { name: 'defaultFee', label: 'Mensalidade padrão (R$)', type: 'money', min: 0, max: 100000, hint: 'Sugerida nas novas matrículas. O valor de cada aluno (e o desconto) fica na ficha.' },
        { name: 'dueDay', label: 'Dia do vencimento', type: 'number', required: true, min: 1, max: 28, step: 1, hint: 'De 1 a 28, para valer em todos os meses.', check: (x) => (x != null && x !== '' && !Number.isInteger(x) ? 'Use um número inteiro.' : '') },
        decField('lateFine', 'Multa por atraso (%)', { min: 0, max: 2, hint: 'O Código de Defesa do Consumidor limita a multa a 2%.' }),
        decField('lateInterest', 'Juros ao mês (%)', { min: 0, max: 10, hint: 'Cobrados por dia de atraso (o usual é 1% ao mês).' }),
        { name: 'pixKey', label: 'Chave Pix', maxlength: 120, full: true, placeholder: 'CNPJ, e-mail, celular ou chave aleatória', hint: 'Aparece para as famílias junto das mensalidades em aberto.' },
      ],
      patch: (d) => ({ chargesFees: !!d.chargesFees, defaultFee: d.defaultFee ?? 0, dueDay: d.dueDay, lateFine: dec(d.lateFine) ?? 0, lateInterest: dec(d.lateInterest) ?? 0, pixKey: d.pixKey }),
    },
    privacidade: {
      ok: 'Dados de privacidade salvos',
      values: () => {
        const p = S().privacy || {};
        return { privacy: { controller: p.controller || '', dpoName: p.dpoName || '', dpoContact: p.dpoContact || '' } };
      },
      defs: () => [
        { name: 'privacy.controller', label: 'Controlador dos dados', maxlength: 160, full: true, placeholder: 'Razão social da escola', hint: 'A pessoa jurídica responsável pelos dados (em geral, a mantenedora da escola).' },
        { name: 'privacy.dpoName', label: 'Encarregado de dados (DPO)', maxlength: 120, placeholder: 'Nome de quem atende os pedidos' },
        { name: 'privacy.dpoContact', label: 'Contato do encarregado', maxlength: 160, placeholder: 'E-mail ou telefone' },
      ],
      patch: (d) => ({ privacy: { controller: d.privacy.controller, dpoName: d.privacy.dpoName, dpoContact: d.privacy.dpoContact } }),
    },
  };
  const termOptions = (n) => Array.from({ length: n }, (_, i) => [String(i + 1), `${i + 1}º ${TERM_LABEL[n]}`]);

  // etapas de ensino: um bloco por etapa, campos com nome "segments.<etapa>.<campo>"
  const segDefs = (name) => [
    { name: `segments.${name}.attendance`, label: 'Chamada', type: 'chips', required: true, options: [['diaria', 'Uma vez por dia'], ['por_aula', 'Por aula']] },
    { name: `segments.${name}.minAttendance`, label: 'Frequência mínima (%)', type: 'number', required: true, min: 0, max: 100, step: 1, check: (x) => (x != null && x !== '' && !Number.isInteger(x) ? 'Use um número inteiro.' : '') },
    { name: `segments.${name}.evaluation`, label: 'Avaliação', type: 'chips', required: true, options: [['nota', 'Notas de 0 a 10'], ['parecer', 'Parecer descritivo']] },
  ];
  SIMPLE.etapas = {
    ok: 'Etapas de ensino salvas',
    values: () => {
      const cur = S().segments || {};
      const out = {};
      for (const name of SEGMENTS) {
        const c = { ...Core.rules.DEFAULT_SEGMENT, ...(cur[name] || {}) };
        out[name] = { attendance: c.attendance, minAttendance: c.minAttendance, evaluation: c.evaluation };
      }
      return { segments: out };
    },
    defs: () => SEGMENTS.flatMap(segDefs),
    patch: (d) => ({ segments: d.segments }),
  };
  // agenda e família: campos simples + editor da rotina (listas guardadas no rascunho)
  SIMPLE.agenda = {
    ok: 'Agenda e família salvas',
    values: () => {
      const s = S();
      return {
        homeworkLabel: s.homeworkLabel || 'Dever de casa',
        diaryApproval: !!s.diaryApproval,
        familyMessages: s.familyMessages !== false,
        officeHours: s.officeHours || '',
        routineFields: clone(s.routineFields || []),
        routineBring: clone(s.routineBring || []),
      };
    },
    defs: () => [
      { name: 'homeworkLabel', label: 'Como a escola chama o dever', type: 'chips', required: true, full: true, options: HOMEWORK.map((h) => [h, h]), hint: 'O nome aparece na agenda, no painel e no Portal da família.' },
      { name: 'diaryApproval', label: 'O que professores e auxiliares mandam passa pela coordenação antes de chegar às famílias', type: 'checkbox', full: true, hint: 'Ligado, deveres, recados e autorizações de quem não aprova ficam "aguardando aprovação" até a coordenação liberar (na Agenda). Registros internos não passam.' },
      html`<h3 class="form-h">Famílias</h3>`,
      { name: 'familyMessages', label: 'Famílias podem escrever para a escola', type: 'checkbox', full: true, hint: 'Avisos de falta, saída antecipada, quem vai buscar, medicação. Desligado, as famílias só leem; a escola continua podendo escrever.' },
      { name: 'officeHours', label: 'Horário de atendimento da secretaria', maxlength: 200, full: true, placeholder: 'Ex.: segunda a sexta, das 7h às 18h', hint: 'Aparece para as famílias no portal, junto das mensagens.' },
    ],
    patch: (d) => ({
      homeworkLabel: d.homeworkLabel,
      diaryApproval: !!d.diaryApproval,
      familyMessages: !!d.familyMessages,
      officeHours: d.officeHours,
      routineFields: (d.routineFields || []).map((f) => ({ ...(f.key ? { key: f.key } : {}), label: String(f.label || '').trim(), options: (f.options || []).map((o) => String(o).trim()).filter(Boolean) })),
      routineBring: (d.routineBring || []).map((o) => String(o).trim()).filter(Boolean),
    }),
  };
  const values = (sec) => sanitize(merge(SIMPLE[sec].values(), CS().drafts[sec]));
  const formOf = (sec, inner, { cls = 'form-grid' } = {}) => html`<form class="${cls} cf-form" data-cf-form="${sec}" novalidate><fieldset class="cf-fs" ${ro() ? 'disabled' : ''}>${inner}</fieldset>${savebar(sec)}</form>`;

  // =====================================================================
  // Dados da escola
  // =====================================================================
  const renderEscola = () => {
    const v = values('escola');
    return html`${secHead('Dados da escola', 'Como a escola aparece no sistema, nos recibos e para as famílias.')}
      <section class="card cf-card"><div class="card-body">${formOf('escola', html`<div class="form-grid">${UI.fields(SIMPLE.escola.defs(v), v)}</div>`, { cls: 'cf-plain' })}</div></section>`;
  };

  // =====================================================================
  // Ano letivo e avaliação
  // =====================================================================
  const termsStatus = () => {
    const s = S();
    const y = Q.year();
    const n = Number(s.termCount) || 4;
    const items = Array.from({ length: n }, (_, i) => {
      const t = i + 1;
      const closed = !Q.termOpen(t, y);
      const released = Q.termReleased(t, y);
      return html`<li><span class="cf-term-n ${t === Number(s.term) ? 'is-cur' : ''}">${t}º</span><span class="grow">${Q.termLabel(t)}${t === Number(s.term) ? html` <span class="muted small">(atual)</span>` : ''}</span>
        ${closed ? UI.pill('Fechado', 'ok') : UI.pill('Aberto', 'info')}${released ? UI.pill('Boletim liberado', 'ok', true) : html`<span class="pill plain">Boletim não liberado</span>`}</li>`;
    });
    return html`<section class="card cf-card"><div class="card-head"><div><h2>${icon('grade', 'muted')}Etapas de ${y}</h2><p class="sub">Fechar etapas e liberar boletins é feito na tela de notas.</p></div>${hasPage('notas') ? html`<a class="btn sm" href="#notas">${icon('arrowRight')}Abrir notas</a>` : ''}</div>
      <div class="card-body"><ul class="items cf-terms">${items}</ul></div></section>`;
  };
  const renderAno = () => {
    const v = values('ano');
    const y = Q.year();
    return html`${secHead('Ano letivo e avaliação', 'Como o ano é dividido e as regras de aprovação. A frequência mínima fica em Etapas de ensino.')}
      <div class="cf-year">
        <div class="cf-year-n"><span class="small muted">Ano letivo</span><b>${y}</b></div>
        <p class="small muted grow">O ano muda pela <b>virada do ano letivo</b>, que encerra as turmas de ${y}, guarda o histórico dos alunos e abre ${Number(y) + 1}.</p>
        ${isOwner() ? html`<a class="btn sm" href="#configuracoes/virada">${icon('repeat')}Virada do ano</a>` : ''}
      </div>
      <section class="card cf-card"><div class="card-body">${formOf('ano', html`<div class="form-grid">${UI.fields(SIMPLE.ano.defs(v), v)}</div>`, { cls: 'cf-plain' })}</div></section>
      ${termsStatus()}`;
  };

  // =====================================================================
  // Etapas de ensino
  // =====================================================================
  const renderEtapas = () => {
    const v = values('etapas');
    const counts = new Map();
    Q.classes().forEach((c) => counts.set(c.segment, (counts.get(c.segment) || 0) + 1));
    const block = (name) => {
      const n = counts.get(name) || 0;
      return html`<fieldset class="cf-seg" data-cf-seg="${name}"><legend class="cf-seg-head"><b>${name}</b>${n ? UI.pill(U.plural(n, 'turma', 'turmas'), 'info', true) : html`<span class="small muted">sem turmas</span>`}</legend>
        <div class="cf-seg-grid">${UI.fields(segDefs(name), v)}</div></fieldset>`;
    };
    const used = SEGMENTS.filter((s) => counts.get(s));
    const unused = SEGMENTS.filter((s) => !counts.get(s));
    return html`${secHead('Etapas de ensino', 'Cada etapa tem a própria forma de chamada, frequência mínima e avaliação. Vale para todas as turmas da etapa.')}
      <div class="notice">${icon('info')}<span class="grow small">A LDB pede frequência mínima de 75% no Ensino Fundamental e Médio e de 60% na Educação Infantil. Mudar o tipo de chamada no meio do ano não apaga nada: a frequência continua somando o que já foi registrado.</span></div>
      <section class="card cf-card"><div class="card-body">${formOf(
        'etapas',
        html`${used.map(block)}${unused.length ? html`<details class="cf-more" ${used.length ? '' : 'open'}><summary>Outras etapas (sem turmas): ${unused.join(', ')}</summary>${unused.map(block)}</details>` : ''}`,
        { cls: 'cf-plain' },
      )}</div></section>`;
  };

  // =====================================================================
  // Disciplinas
  // =====================================================================
  const subjectUse = () => {
    const graded = new Set();
    for (const k of Object.keys(Store.state.grades)) graded.add(k.split('|')[2]);
    const att = Store.state.attendance;
    for (const k of Object.keys(att)) if (att[k] && att[k].subjectId) graded.add(att[k].subjectId);
    const classes = new Map();
    for (const c of Q.classes()) for (const sid of Object.keys(c.subjects || {})) classes.set(sid, (classes.get(sid) || 0) + 1);
    const teachers = new Map();
    for (const u of Q.staff()) for (const sid of u.subjectIds || []) teachers.set(sid, (teachers.get(sid) || 0) + 1);
    return { graded, classes, teachers };
  };
  const renderDisciplinas = () => {
    const list = Store.state.subjects.slice();
    const use = subjectUse();
    const add = ro() ? '' : html`<button type="button" class="btn primary" data-cf-subject-new>${icon('plus')}Nova disciplina</button>`;
    if (!list.length) {
      return html`${secHead('Disciplinas', 'As disciplinas das turmas, do horário e do boletim.')}
        <section class="card cf-card">${UI.empty({ icon: 'book', title: 'Nenhuma disciplina cadastrada', text: 'Cadastre as disciplinas para montar o horário das turmas e lançar notas.', action: add })}</section>`;
    }
    const rows = list.map((s) => {
      const locked = use.graded.has(s.id);
      const nc = use.classes.get(s.id) || 0;
      return html`<tr>
        <td class="first"><span class="cf-subj"><span class="cf-swatch" style="--c: var(--cat-${Number(s.color) || 1})" aria-hidden="true"></span><span><b>${s.name}</b><span class="small muted"> · ${s.short || '—'}</span></span></span></td>
        <td class="num" data-l="Aulas por semana">${U.int(s.weekly || 0)}</td>
        <td class="num" data-l="Turmas">${nc ? U.int(nc) : html`<span class="muted">nenhuma</span>`}</td>
        <td data-l="Situação">${locked ? html`<span class="pill plain" title="Já tem notas ou aulas registradas: pode ser retirada das turmas, mas não excluída.">${icon('lock')}Com registros</span>` : html`<span class="small muted">Sem notas</span>`}</td>
        <td class="end cf-row-acts">${ro() ? '' : html`<button type="button" class="icon-btn sm" data-cf-subject-edit="${s.id}" aria-label="Editar ${s.name}" title="Editar">${icon('pencil')}</button>${locked ? '' : html`<button type="button" class="icon-btn sm" data-cf-subject-del="${s.id}" aria-label="Excluir ${s.name}" title="Excluir">${icon('trash')}</button>`}`}</td>
      </tr>`;
    });
    return html`${secHead('Disciplinas', 'As disciplinas das turmas, do horário e do boletim. A cor ajuda a reconhecê-las no horário.', add)}
      <section class="card cf-card">
        <table class="table responsive cf-subjects"><thead><tr><th>Disciplina</th><th class="num">Aulas por semana</th><th class="num">Turmas</th><th>Situação</th><th class="end"><span class="sr-only">Ações</span></th></tr></thead><tbody>${rows}</tbody></table>
      </section>
      <p class="small muted">Disciplina nova não entra sozinha nas turmas que já existem: inclua em <b>Turmas</b> › turma › Disciplinas. Quem já tem notas ou aulas registradas não pode ser excluída (retire da turma, se não for mais dada).</p>`;
  };
  const subjectForm = (sub = null) => {
    if (ro() || !editor()) return;
    const used = new Set(Store.state.subjects.map((s) => Number(s.color)));
    const color = sub ? Number(sub.color) || 1 : (COLORS.find(([c]) => !used.has(c)) || [1])[0];
    UI.formDrawer({
      title: sub ? `Editar ${sub.name}` : 'Nova disciplina',
      sub: sub ? 'A mudança aparece em todas as turmas, no horário e no boletim.' : 'Depois de criar, inclua a disciplina nas turmas que a terão.',
      defs: [
        { name: 'name', label: 'Nome', required: true, maxlength: 60, full: true, placeholder: 'Ex.: Robótica', check: (v) => (Store.state.subjects.some((s) => (!sub || s.id !== sub.id) && U.norm(s.name) === U.norm(v)) ? 'Já existe uma disciplina com esse nome.' : '') },
        { name: 'short', label: 'Sigla', maxlength: 12, placeholder: 'Ex.: Rob.', hint: 'Usada no horário. Em branco, criamos uma.' },
        { name: 'weekly', label: 'Aulas por semana', type: 'number', min: 0, max: 15, step: 1, hint: 'Sugestão para o horário de turmas novas.', check: (v) => (v != null && v !== '' && !Number.isInteger(v) ? 'Use um número inteiro.' : '') },
        { name: 'color', label: 'Cor', type: 'chips', full: true, options: COLORS.map(([n, l]) => [String(n), l, n]) },
      ],
      values: sub ? { name: sub.name, short: sub.short || '', weekly: sub.weekly ?? 0, color: String(color) } : { name: '', short: '', weekly: 2, color: String(color) },
      submitLabel: sub ? 'Salvar disciplina' : 'Criar disciplina',
      onSubmit: async (d, api, form) => {
        const input = { name: d.name, short: d.short, weekly: d.weekly == null ? 0 : d.weekly, color: Number(d.color) || 1 };
        if (sub) input.id = sub.id;
        const res = await UI.act('subjects.save', input, { ok: sub ? `Disciplina ${d.name} atualizada` : `Disciplina ${d.name} criada`, form });
        if (res) markReviewed();
        return res;
      },
    });
  };
  const deleteSubject = async (id, btn) => {
    const sub = Q.subject(id);
    if (!sub) return;
    const res = await UI.act('subjects.delete', { id }, { btn, ok: `Disciplina ${sub.name} excluída` });
    if (res) markReviewed();
  };

  // =====================================================================
  // Agenda e família (com o editor de campos da rotina)
  // =====================================================================
  const RF_MAX = 12;
  const RF_OPT_MAX = 8;
  const BRING_MAX = 20;
  const agendaDraft = () => {
    const st = CS();
    if (!st.drafts.agenda) st.drafts.agenda = SIMPLE.agenda.values();
    return st.drafts.agenda;
  };
  const tags = (list, { kind, idx = '', max, placeholder, label }) => html`<div class="cf-tags" role="group" aria-label="${label}">
      ${list.map((o, i) => html`<span class="cf-tag">${o}${ro() ? '' : html`<button type="button" class="cf-tag-x" data-cf-tag-del="${kind}" data-i="${idx}" data-j="${i}" aria-label="Remover ${o}">${icon('x')}</button>`}</span>`)}
      ${ro() || list.length >= max ? '' : html`<span class="cf-tag-add"><input class="input" data-cf-tag-input="${kind}" data-i="${idx}" maxlength="${kind === 'bring' ? 40 : 30}" placeholder="${placeholder}" aria-label="${label}: nova opção" data-nodirty><button type="button" class="btn sm" data-cf-tag-add="${kind}" data-i="${idx}">${icon('plus')}<span>Incluir</span></button></span>`}
    </div>`;
  const routineEditor = (v) => {
    const fields = v.routineFields || [];
    return html`<div class="cf-rf" data-cf-rf>
      ${fields.length
        ? html`<ol class="cf-rf-list">${fields.map(
            (f, i) => html`<li class="cf-rf-item">
              <div class="cf-rf-top">
                <span class="cf-rf-n" aria-hidden="true">${i + 1}</span>
                <label class="sr-only" for="cf-rf-l${i}">Nome do campo ${i + 1}</label>
                <input class="input cf-rf-label" id="cf-rf-l${i}" data-cf-rf-label="${i}" value="${f.label}" maxlength="40" placeholder="Ex.: Lanche da manhã" autocomplete="off">
                ${ro() ? '' : html`<span class="cf-rf-btns">
                  <button type="button" class="icon-btn sm cf-up" data-cf-rf-move="${i}" data-dir="-1" aria-label="Subir ${f.label || 'campo'}" title="Subir" ${i === 0 ? 'disabled' : ''}>${icon('chevronDown')}</button>
                  <button type="button" class="icon-btn sm" data-cf-rf-move="${i}" data-dir="1" aria-label="Descer ${f.label || 'campo'}" title="Descer" ${i === fields.length - 1 ? 'disabled' : ''}>${icon('chevronDown')}</button>
                  <button type="button" class="icon-btn sm" data-cf-rf-del="${i}" aria-label="Remover o campo ${f.label || i + 1}" title="Remover campo">${icon('trash')}</button></span>`}
              </div>
              ${tags(f.options || [], { kind: 'opt', idx: i, max: RF_OPT_MAX, placeholder: 'Nova opção', label: `Opções de ${f.label || 'campo ' + (i + 1)}` })}
            </li>`,
          )}</ol>`
        : html`<p class="small muted">Nenhum campo. A rotina vai só com o recado e os itens para trazer.</p>`}
      ${ro() || fields.length >= RF_MAX ? '' : html`<button type="button" class="btn sm" data-cf-rf-add>${icon('plus')}Adicionar campo</button>`}
      <span class="small muted">${fields.length} de ${RF_MAX} campos · até ${RF_OPT_MAX} opções em cada</span>
    </div>`;
  };
  const renderAgenda = () => {
    const v = values('agenda');
    const hasInfantil = Q.classes().some((c) => c.segment === 'Educação Infantil');
    return html`${secHead('Agenda e família', 'Como a agenda do aluno funciona e o que as famílias podem fazer pelo portal.')}
      <form class="cf-form cf-plain" data-cf-form="agenda" novalidate><fieldset class="cf-fs" ${ro() ? 'disabled' : ''}>
        <section class="card cf-card"><div class="card-head"><h2>${icon('bookOpen', 'muted')}Agenda do aluno</h2></div>
          <div class="card-body"><div class="form-grid">${UI.fields(SIMPLE.agenda.defs(), v)}</div></div></section>
        <section class="card cf-card"><div class="card-head"><div><h2>${icon('baby', 'muted')}Rotina da Educação Infantil</h2><p class="sub">${hasInfantil ? 'Os campos que a professora marca para cada criança no fim do dia (alimentação, sono, humor…).' : 'Usada quando a escola tiver turmas de Educação Infantil.'}</p></div></div>
          <div class="card-body cf-rf-body">
            <div class="field full" data-field="routineFields"><span class="label">Campos e opções</span>${routineEditor(v)}</div>
            <div class="field full" data-field="routineBring"><span class="label">Lista "mandar amanhã"</span><span class="hint">Itens que a professora pode pedir para a família mandar (fralda, muda de roupa…).</span>
              ${tags(v.routineBring || [], { kind: 'bring', max: BRING_MAX, placeholder: 'Novo item', label: 'Itens para trazer' })}</div>
          </div></section>
      </fieldset>${savebar('agenda')}</form>`;
  };
  const validateAgenda = (form, d) => {
    const fields = d.routineFields || [];
    let msg = '';
    if (fields.length > RF_MAX) msg = `Use no máximo ${RF_MAX} campos.`;
    fields.forEach((f, i) => {
      const input = form.querySelector(`[data-cf-rf-label="${i}"]`);
      const bad = !String(f.label || '').trim() ? 'Dê um nome a cada campo da rotina.' : !(f.options || []).length ? `O campo "${f.label}" precisa de pelo menos uma opção.` : '';
      if (input) input.classList.toggle('invalid', !!bad);
      if (bad && !msg) msg = bad;
    });
    const seen = new Set();
    for (const f of fields) {
      const k = U.norm(f.label);
      if (k && seen.has(k)) msg = msg || `Há dois campos chamados "${f.label}".`;
      seen.add(k);
    }
    if (msg) {
      UI.markField(form, 'routineFields', msg, false);
      const first = form.querySelector('.cf-rf-label.invalid');
      (first || form.querySelector('[data-field="routineFields"]')).scrollIntoView({ block: 'center' });
      if (first) first.focus();
      return false;
    }
    return true;
  };

  // =====================================================================
  // Mensalidades
  // =====================================================================
  const feeExample = (v) => {
    const fee = Number(v.defaultFee) > 0 ? Number(v.defaultFee) : 500;
    const days = 15;
    const fine = fee * ((dec(v.lateFine) || 0) / 100);
    const interest = fee * ((dec(v.lateInterest) || 0) / 100) * (days / 30);
    return html`Exemplo: uma mensalidade de <b>${U.money(fee)}</b> paga ${days} dias depois do vencimento fica <b>${U.money(fee + fine + interest)}</b> (multa de ${U.money(fine)} + juros de ${U.money(interest)}).`;
  };
  const renderFinanceiro = () => {
    const v = values('financeiro');
    return html`${secHead('Mensalidades', 'Regras de cobrança usadas ao gerar as mensalidades e ao calcular o valor atualizado.')}
      <section class="card cf-card"><div class="card-body">${formOf(
        'financeiro',
        html`<div class="form-grid">${UI.fields(SIMPLE.financeiro.defs(), v)}</div>
          <p class="notice small cf-example" data-cf-fee-example>${icon('info')}<span class="grow">${feeExample(v)}</span></p>
          <p class="small muted">As mudanças valem para as próximas cobranças: as já geradas mantêm o valor e o vencimento.</p>`,
        { cls: 'cf-plain' },
      )}</div></section>`;
  };

  // =====================================================================
  // Privacidade
  // =====================================================================
  const renderPrivacidade = () => {
    const v = values('privacidade');
    const version = Number((S().privacy || {}).noticeVersion) || 1;
    return html`${secHead('Privacidade (LGPD)', 'Quem responde pelos dados e o aviso que as famílias leem e aceitam no primeiro acesso.')}
      <section class="card cf-card"><div class="card-body">${formOf('privacidade', html`<div class="form-grid">${UI.fields(SIMPLE.privacidade.defs(), v)}</div>`, { cls: 'cf-plain' })}</div></section>
      <section class="card cf-card"><div class="card-head"><div><h2>${icon('file', 'muted')}Aviso de privacidade</h2><p class="sub">Versão em vigor: <b>${version}</b>. É montado com os dados acima.</p></div></div>
        <div class="card-body cf-notice-body">
          <details class="privacy" data-cf-privacy-preview><summary>Ver o aviso como as famílias veem</summary>${App.privacyNotice(v.privacy, S().schoolName)}</details>
          ${ro()
            ? ''
            : html`<div class="cf-bump"><p class="small muted grow">Mudou a forma de tratar os dados (uma nova finalidade, um novo compartilhamento)? Publique uma nova versão: na próxima vez que entrarem, as famílias leem o aviso e confirmam de novo. Correções de nome ou contato não precisam de nova versão.</p>
              <button type="button" class="btn" data-cf-bump>${icon('send')}Publicar nova versão do aviso</button></div>`}
        </div></section>`;
  };

  // =====================================================================
  // Perfis de acesso (atalho)
  // =====================================================================
  const renderAcessos = () => {
    const staff = Q.staff();
    const byRole = new Map();
    staff.forEach((u) => byRole.set(u.role, (byRole.get(u.role) || 0) + 1));
    const profiles = S().profiles || {};
    const roles = Core.perms.ROLES.filter((r) => !r.family && (byRole.get(r.id) || profiles[r.id]));
    const open = hasPage('equipe') ? html`<a class="btn primary" href="#equipe/perfis">${icon('shield')}Abrir perfis de acesso</a>` : '';
    return html`${secHead('Perfis de acesso', 'Cada cargo tem um perfil pré-selecionado. A direção escolhe o que cada cargo pode fazer e, na conta de cada pessoa, acrescenta ou retira acessos.', open)}
      <section class="card cf-card">
        ${roles.length
          ? html`<table class="table responsive"><thead><tr><th>Cargo</th><th class="num">Pessoas</th><th class="num">Acessos no perfil</th><th>Perfil</th></tr></thead><tbody>${roles.map((r) => {
              const custom = Array.isArray(profiles[r.id]);
              return html`<tr><td class="first"><b>${r.label}</b></td><td class="num" data-l="Pessoas">${U.int(byRole.get(r.id) || 0)}</td><td class="num" data-l="Acessos">${U.int(Core.perms.profile(r.id, S()).length)}</td><td data-l="Perfil">${custom ? UI.pill('Personalizado', 'info') : html`<span class="small muted">Padrão do sistema</span>`}</td></tr>`;
            })}</tbody></table>`
          : UI.empty({ icon: 'users', title: 'Ainda não há equipe', text: 'Crie as contas da equipe: cada cargo já vem com um perfil de acesso pronto.', action: !ro() && fn('novaConta') ? html`<button type="button" class="btn primary" data-cf-new-account>${icon('userPlus')}Nova conta</button>` : '' })}
      </section>
      <p class="small muted">Mudar o perfil de um cargo vale para todas as pessoas daquele cargo. Para uma pessoa só, abra a conta dela em <b>Equipe e acessos</b>.</p>`;
  };

  // =====================================================================
  // Virada do ano letivo (assistente)
  // =====================================================================
  const VS = () => PageState.get('cf-virada', { step: 0, classId: '', results: {}, plan: null, done: null, errors: {} });
  const FIM = '__fim';
  const RESULTS = [['aprovado', 'Aprovado(a)'], ['retido', 'Retido(a)'], ['transferido', 'Transferido(a)'], ['concluido', 'Concluiu o curso']];
  const RESULT_LABEL = Object.fromEntries(RESULTS);
  const nextYear = () => Number(Q.year()) + 1;
  const oldClasses = () => Q.classes().filter((c) => Number(c.year) === Number(Q.year()));
  const futureClasses = () => Q.classes().filter((c) => Number(c.year) === nextYear());
  const kidsOf = (classId) => Store.state.students.filter((s) => s.classId === classId && s.status === 'ativo').sort(Q.cmpName);
  const defaultResult = (sid) => {
    const c = Q.council(sid);
    return c && ['aprovado', 'retido', 'transferido'].includes(c.result) ? c.result : 'aprovado';
  };
  const resultOf = (sid) => VS().results[sid] || defaultResult(sid);
  /** Média final e frequência do aluno no ano (iguais às que vão para o histórico). */
  const yearStats = (s) => {
    const parecer = Q.evaluation(s.classId) === 'parecer';
    const avg = parecer || !can('notas.ver') ? null : U.avg(Object.keys((Q.klass(s.classId) || {}).subjects || {}).map((sid) => Q.subjectFinal(s.id, sid)).filter((v) => v != null));
    const att = can('chamada.ver') ? Q.attendanceRate(s.id) : null;
    return { avg, att, parecer };
  };
  /** Sugestão do nome da turma no ano seguinte (o titular confere). null = última série (concluem). */
  const nextGrade = (c) => {
    const name = String(c.name || '').trim();
    let m = name.match(/^(.*?)(\d{1,2})\s*º\s*ano\b(.*)$/i);
    if (m) {
      const n = Number(m[2]);
      if (n >= 9) return { name: `${m[1]}1ª série${m[3]}`.replace(/\s+/g, ' ').trim(), segment: 'Ensino Médio' };
      return { name: `${m[1]}${n + 1}º ano${m[3]}`, segment: n + 1 >= 6 ? 'Fundamental II' : 'Fundamental I' };
    }
    m = name.match(/^(.*?)(\d)\s*ª\s*série\b(.*)$/i);
    if (m) {
      const n = Number(m[2]);
      return n >= 3 ? null : { name: `${m[1]}${n + 1}ª série${m[3]}`, segment: c.segment };
    }
    m = name.match(/^(.*?infantil\s*)(\d)(.*)$/i);
    if (m) {
      const n = Number(m[2]);
      return n >= 5 ? { name: `1º ano${m[3]}`.replace(/\s+/g, ' ').trim(), segment: 'Fundamental I' } : { name: `${m[1]}${n + 1}${m[3]}`, segment: c.segment };
    }
    return { name, segment: c.segment, guess: true };
  };
  /** Ordem das turmas: etapa de ensino e depois o nome (com números em ordem natural). */
  const byGrade = (a, b) => Q.segRank(a.segment) - Q.segRank(b.segment) || String(a.name || '~').localeCompare(String(b.name || '~'), 'pt-BR', { numeric: true });
  /** Monta (ou completa) o plano: turmas novas e destino de aprovados/retidos de cada turma. */
  const buildPlan = (plan = null) => {
    const p = plan || { open: [], map: {}, seq: 0 };
    const olds = oldClasses();
    const oldByName = new Map(olds.map((c) => [U.norm(c.name), c]));
    const byName = new Map();
    futureClasses().forEach((c) => byName.set(U.norm(c.name), c.id));
    p.open.forEach((o) => byName.set(U.norm(o.name), o.ref));
    const ensure = (name, segment, shift, src) => {
      const k = U.norm(name);
      if (byName.has(k)) return byName.get(k);
      const same = oldByName.get(k);
      const from = same || src;
      const ref = `new:${++p.seq}`;
      p.open.push({ ref, name, segment: same ? same.segment : segment, shift: same ? same.shift : shift, from: from ? from.id : '', people: !!same, guess: false });
      byName.set(k, ref);
      return ref;
    };
    // "1ª série A" vira "1ª série EM" quando a escola já tem uma única turma dessa série com outro nome
    const sameGrade = (name) => {
      const m = String(name).match(/^\s*(\d{1,2})\s*([ºª])\s*(ano|série)\b/i);
      if (!m || oldByName.has(U.norm(name))) return name;
      const pre = U.norm(`${m[1]}${m[2]} ${m[3]}`);
      const hits = olds.filter((c) => U.norm(c.name.replace(/^\s*(\d{1,2})\s*([ºª])\s*/, '$1$2 ')).startsWith(pre));
      return hits.length === 1 ? hits[0].name : name;
    };
    for (const c of olds) {
      if (!(c.id in p.map)) {
        const ng0 = nextGrade(c);
        // só ao mudar de etapa de ensino (9º ano → 1ª série): dentro da etapa a letra da turma acompanha os alunos
        const ng = ng0 && !ng0.guess && ng0.segment !== c.segment ? { ...ng0, name: sameGrade(ng0.name) } : ng0;
        p.map[c.id] = ng === null ? FIM : ensure(ng.name, ng.segment, c.shift, c);
        if (ng && ng.guess) {
          const o = p.open.find((x) => x.ref === p.map[c.id]);
          if (o) o.guess = true;
        }
      }
      const retained = kidsOf(c.id).some((s) => resultOf(s.id) === 'retido');
      if (retained && !p.map[c.id + ':retido']) p.map[c.id + ':retido'] = ensure(c.name, c.segment, c.shift, c);
    }
    p.open.sort(byGrade);
    return p;
  };
  const planOptions = (p, value, { retained = false } = {}) => {
    const fut = futureClasses();
    const opt = (v, l) => html`<option value="${v}" ${String(v) === String(value || '') ? 'selected' : ''}>${l}</option>`;
    return html`${p.open.length ? html`<optgroup label="Turmas novas de ${nextYear()}">${p.open.map((o) => opt(o.ref, o.name || 'Turma sem nome'))}</optgroup>` : ''}
      ${fut.length ? html`<optgroup label="Já criadas para ${nextYear()}">${fut.map((c) => opt(c.id, c.name))}</optgroup>` : ''}
      ${retained ? '' : opt(FIM, 'Concluem o curso (saem da escola)')}
      ${opt('', 'Ficam sem turma por enquanto')}`;
  };
  /** Para onde vai cada aluno com o plano atual. */
  const flows = (p) => {
    const dest = new Map(); // ref/id → [{s, from, kind}]
    const out = { aprovado: 0, retido: 0, transferido: 0, concluido: 0, semTurma: [], total: 0, dest };
    for (const c of oldClasses()) {
      for (const s of kidsOf(c.id)) {
        out.total++;
        let r = resultOf(s.id);
        let to = null;
        if (r === 'aprovado') {
          to = p.map[c.id] || '';
          if (to === FIM) {
            r = 'concluido';
            to = null;
          }
        } else if (r === 'retido') to = p.map[c.id + ':retido'] || '';
        out[r]++;
        if (to === '') out.semTurma.push({ s, from: c, kind: r });
        else if (to) {
          if (!dest.has(to)) dest.set(to, []);
          dest.get(to).push({ s, from: c, kind: r });
        }
      }
    }
    return out;
  };
  const destName = (p, ref) => {
    const o = p.open.find((x) => x.ref === ref);
    if (o) return o.name || 'Turma sem nome';
    const c = Q.klass(ref);
    return c ? c.name : 'Turma';
  };
  const checkPlan = (p) => {
    const errors = {};
    const names = new Map();
    futureClasses().forEach((c) => names.set(U.norm(c.name), 'existing'));
    p.open.forEach((o) => {
      const k = U.norm(o.name);
      if (!k) errors[o.ref] = 'Dê um nome à turma.';
      else if (names.has(k)) errors[o.ref] = names.get(k) === 'existing' ? `Já existe a turma ${o.name} em ${nextYear()}.` : 'Há duas turmas novas com este nome.';
      names.set(k, o.ref);
    });
    return errors;
  };

  const steps = (cur, hasClasses) => {
    const list = hasClasses ? ['Antes de começar', 'Resultados', 'Turmas do novo ano', 'Revisar e confirmar'] : ['Antes de começar', 'Revisar e confirmar'];
    const idx = hasClasses ? cur : cur === 0 ? 0 : 1;
    return html`<nav class="steps cf-steps" aria-label="Etapas da virada">${list.map((s, i) => html`<span class="step ${i === idx ? 'current' : ''} ${i < idx ? 'done' : ''}" ${i === idx ? raw('aria-current="step"') : ''}><b>${i < idx ? icon('check') : i + 1}</b><span>${s}</span></span>`)}</nav>`;
  };

  const viradaIntro = () => {
    const y = Q.year();
    const olds = oldClasses();
    const kids = olds.reduce((a, c) => a + kidsOf(c.id).length, 0);
    const n = Number(S().termCount) || 4;
    const closed = Array.from({ length: n }, (_, i) => i + 1).filter((t) => !Q.termOpen(t, y)).length;
    const noClass = Store.state.students.filter((s) => s.status === 'ativo' && !Q.klass(s.classId)).length;
    const councils = olds.reduce((a, c) => a + kidsOf(c.id).filter((s) => Q.council(s.id)).length, 0);
    const check = (ok, title, text, action = '') => html`<li class="cf-check ${ok ? 'ok' : 'warn'}"><span class="cf-check-ic">${icon(ok ? 'checkCircle' : 'alert')}</span><span class="grow"><b>${title}</b><span class="small muted">${text}</span></span>${action}</li>`;
    return html`<div class="card-body cf-vr-body">
      <div class="kpis cf-vr-kpis">
        <div class="card kpi"><span class="kpi-label">Turmas de ${y}</span><span class="kpi-value">${U.int(olds.length)}</span></div>
        <div class="card kpi"><span class="kpi-label">Alunos ativos nelas</span><span class="kpi-value">${U.int(kids)}</span></div>
        <div class="card kpi"><span class="kpi-label">Etapas fechadas</span><span class="kpi-value">${closed}<small>/${n}</small></span></div>
        <div class="card kpi"><span class="kpi-label">Resultados do conselho</span><span class="kpi-value">${U.int(councils)}<small>/${U.int(kids)}</small></span></div>
      </div>
      <ul class="items cf-checks">
        ${check(closed === n, closed === n ? 'Todas as etapas estão fechadas' : `${n - closed} ${n - closed === 1 ? 'etapa ainda aberta' : 'etapas ainda abertas'}`, closed === n ? 'As notas do ano não mudam mais.' : 'Feche as etapas na tela de notas antes da virada: notas lançadas depois não entram no histórico do ano.', closed < n && hasPage('notas') ? html`<a class="btn sm" href="#notas">Abrir notas</a>` : '')}
        ${can('dados.backup') ? check(!!lastBackup, lastBackup ? `Backup baixado ${U.fmtInstant(lastBackup)}` : 'Faça um backup antes', 'A virada não pode ser desfeita. Uma cópia dos dados permite voltar, se algo sair errado.', lastBackup ? '' : html`<a class="btn sm" href="#configuracoes/backup">${icon('download')}Fazer backup</a>`) : ''}
        ${noClass ? check(false, `${U.plural(noClass, 'aluno ativo está', 'alunos ativos estão')} sem turma`, 'Eles não participam da virada. Coloque-os numa turma antes, se for o caso.', hasPage('alunos') ? html`<a class="btn sm" href="#alunos">Ver alunos</a>` : '') : ''}
      </ul>
      <div class="cf-vr-what">
        <h3>O que a virada faz</h3>
        <ul class="small">
          <li>Grava no histórico de cada aluno o resultado de ${y}, a média final e a frequência.</li>
          <li>Leva os aprovados para as turmas de ${nextYear()} que você escolher, e os retidos para a turma em que vão refazer a série.</li>
          <li>Encerra as turmas de ${y} (elas continuam no histórico) e abre ${nextYear()} no 1º ${TERM_LABEL[n]}.</li>
          <li>Transferidos e concluintes saem das turmas ativas.</li>
        </ul>
      </div>
    </div>
    <div class="cf-vr-foot"><span class="grow"></span><button type="button" class="btn primary" data-vr-go="${olds.length ? 1 : 3}">${olds.length ? 'Começar' : `Revisar a virada para ${nextYear()}`}${icon('arrowRight')}</button></div>`;
  };

  const viradaResults = () => {
    const v = VS();
    const olds = oldClasses();
    const c = olds.find((x) => x.id === v.classId) || olds[0];
    const st = S();
    const kids = kidsOf(c.id);
    const min = Q.minAttendance(c.id);
    const counts = (cid) => {
      const o = { aprovado: 0, retido: 0, transferido: 0, concluido: 0 };
      kidsOf(cid).forEach((s) => o[resultOf(s.id)]++);
      return o;
    };
    const chip = (x) => {
      const o = counts(x.id);
      const other = o.retido + o.transferido + o.concluido;
      return html`<button type="button" class="chip ${x.id === c.id ? 'on' : ''}" data-vr-class="${x.id}" aria-pressed="${String(x.id === c.id)}">${x.name}${other ? html`<span class="cf-chip-n">${other}</span>` : ''}</button>`;
    };
    const row = (s) => {
      const { avg, att, parecer } = yearStats(s);
      const r = resultOf(s.id);
      const council = Q.council(s.id);
      const flags = [];
      if (avg != null && avg < st.passing) flags.push(UI.pill(`Média ${U.num(avg)}`, avg < st.recovery ? 'bad' : 'warn'));
      if (att != null && att < min) flags.push(UI.pill(`Frequência ${U.pct(att)}`, 'bad'));
      return html`<tr class="${r !== 'aprovado' ? 'cf-vr-diff' : ''}">
        <td class="first"><b>${s.name}</b>${council ? html`<span class="small muted cf-vr-council">Conselho: ${RESULT_LABEL[council.result] || U.cap(council.result)}</span>` : ''}</td>
        <td class="num" data-l="Média final">${parecer ? html`<span class="muted">parecer</span>` : avg == null ? html`<span class="muted">—</span>` : U.num(avg)}</td>
        <td class="num" data-l="Frequência">${att == null ? html`<span class="muted">—</span>` : U.pct(att)}</td>
        <td data-l="Atenção" class="${flags.length ? '' : 'cf-vr-noatt'}">${flags.length ? flags : html`<span class="muted small">—</span>`}</td>
        <td class="end"><label class="sr-only" for="vr-r-${s.id}">Resultado de ${s.name}</label><select class="input cf-vr-res" id="vr-r-${s.id}" data-vr-res="${s.id}">${RESULTS.map(([k, l]) => html`<option value="${k}" ${k === r ? 'selected' : ''}>${l}</option>`)}</select></td>
      </tr>`;
    };
    const o = counts(c.id);
    return html`<div class="card-body cf-vr-body">
      <p class="muted">Confira o resultado de cada aluno. Todos começam como <b>aprovados</b> (ou com o resultado do conselho de classe, quando houver). A média final e a frequência ajudam a decidir.</p>
      <div class="chips cf-vr-classes" role="group" aria-label="Turmas">${olds.map(chip)}</div>
      <div class="cf-vr-classhead"><div><h3>${c.name}</h3><span class="small muted">${[U.plural(kids.length, 'aluno', 'alunos'), U.plural(o.aprovado, 'aprovado', 'aprovados'), o.retido ? U.plural(o.retido, 'retido', 'retidos') : '', o.transferido ? U.plural(o.transferido, 'transferido', 'transferidos') : '', o.concluido ? U.plural(o.concluido, 'concluinte', 'concluintes') : ''].filter(Boolean).join(' · ')}</span></div>
        <button type="button" class="btn sm" data-vr-allok="${c.id}">${icon('checkCircle')}Todos aprovados</button></div>
      ${kids.length
        ? html`<div class="table-wrap cf-vr-tablewrap"><table class="table responsive cf-vr-table"><thead><tr><th>Aluno</th><th class="num">Média final</th><th class="num">Frequência</th><th>Atenção</th><th class="end">Resultado</th></tr></thead><tbody>${kids.map(row)}</tbody></table></div>`
        : html`<p class="muted small">Esta turma não tem alunos ativos.</p>`}
    </div>
    <div class="cf-vr-foot"><button type="button" class="btn" data-vr-go="0">${icon('arrowLeft')}Voltar</button><span class="grow"></span><button type="button" class="btn primary" data-vr-go="2">Próximo: turmas de ${nextYear()}${icon('arrowRight')}</button></div>`;
  };

  const viradaPlan = () => {
    const v = VS();
    const p = (v.plan = buildPlan(v.plan));
    const fl = flows(p);
    const errors = v.errors || {};
    const counts = (c) => {
      const o = { aprovado: 0, retido: 0 };
      kidsOf(c.id).forEach((s) => {
        const r = resultOf(s.id);
        if (r in o) o[r]++;
      });
      return o;
    };
    const mapRow = (c) => {
      const o = counts(c);
      return html`<tr>
        <td class="first"><b>${c.name}</b><span class="small muted cf-block">${U.plural(kidsOf(c.id).length, 'aluno', 'alunos')}</span></td>
        <td data-l="Aprovados (${o.aprovado}) vão para" class="${o.aprovado ? '' : 'cf-vr-none'}">${o.aprovado ? html`<label class="sr-only" for="vr-m-${c.id}">Aprovados de ${c.name} vão para</label><select class="input" id="vr-m-${c.id}" data-vr-map="${c.id}">${planOptions(p, p.map[c.id])}</select>` : html`<span class="muted small">nenhum aprovado</span>`}</td>
        <td data-l="Retidos (${o.retido}) ficam em" class="${o.retido ? '' : 'cf-vr-none'}">${o.retido ? html`<label class="sr-only" for="vr-mr-${c.id}">Retidos de ${c.name} ficam em</label><select class="input" id="vr-mr-${c.id}" data-vr-map="${c.id}:retido">${planOptions(p, p.map[c.id + ':retido'], { retained: true })}</select>` : html`<span class="muted small">nenhum retido</span>`}</td>
      </tr>`;
    };
    const olds = oldClasses();
    const openRow = (o) => {
      const arriving = (fl.dest.get(o.ref) || []).length;
      const src = olds.find((c) => c.id === o.from);
      const cap = src && src.capacity ? Number(src.capacity) : 0;
      return html`<li class="cf-vr-new ${errors[o.ref] ? 'has-error' : ''}" data-vr-open="${o.ref}">
        <div class="cf-vr-new-grid">
          <div class="field"><label for="vr-n-${o.ref}">Nome da turma</label><input class="input ${errors[o.ref] ? 'invalid' : ''}" id="vr-n-${o.ref}" data-vr-name="${o.ref}" value="${o.name}" maxlength="60" autocomplete="off">${errors[o.ref] ? html`<span class="error" role="alert">${errors[o.ref]}</span>` : o.guess ? html`<span class="hint">Confira o nome: não deu para adivinhar a série seguinte.</span>` : ''}</div>
          <div class="field"><label for="vr-s-${o.ref}">Etapa de ensino</label><select class="input" id="vr-s-${o.ref}" data-vr-seg="${o.ref}">${SEGMENTS.map((s) => html`<option ${s === o.segment ? 'selected' : ''}>${s}</option>`)}</select></div>
          <div class="field"><label for="vr-t-${o.ref}">Turno</label><select class="input" id="vr-t-${o.ref}" data-vr-shift="${o.ref}">${SHIFTS.map((s) => html`<option ${s === o.shift ? 'selected' : ''}>${s}</option>`)}</select></div>
          <div class="field"><label for="vr-f-${o.ref}">Copiar sala, disciplinas e horário de</label><select class="input" id="vr-f-${o.ref}" data-vr-from="${o.ref}"><option value="">Não copiar (turma em branco)</option>${olds.map((c) => html`<option value="${c.id}" ${c.id === o.from ? 'selected' : ''}>${c.name} (${Q.year()})</option>`)}</select></div>
        </div>
        <div class="cf-vr-new-foot">
          <label class="check"><input type="checkbox" data-vr-people="${o.ref}" ${o.people ? 'checked' : ''} ${o.from ? '' : 'disabled'}><span>Manter os professores${src ? ` do ${src.name}` : ''}</span></label>
          <span class="grow"></span>
          <span class="small ${cap && arriving > cap ? 'cf-over' : 'muted'}">${U.plural(arriving, 'aluno chega', 'alunos chegam')}${cap ? ` · ${cap} vagas` : ''}</span>
          <button type="button" class="icon-btn sm" data-vr-remove="${o.ref}" aria-label="Não abrir ${o.name || 'esta turma'}" title="Não abrir esta turma">${icon('trash')}</button>
        </div>
      </li>`;
    };
    return html`<div class="card-body cf-vr-body">
      <h3>Para onde vai cada turma</h3>
      <p class="muted small">Sugerimos a série seguinte pelo nome da turma. Troque o destino quando precisar (por exemplo, para juntar duas turmas).</p>
      <div class="table-wrap"><table class="table responsive cf-vr-map"><thead><tr><th>Turma de ${Q.year()}</th><th>Aprovados vão para</th><th>Retidos ficam em</th></tr></thead><tbody>${olds.map(mapRow)}</tbody></table></div>
      <h3 class="cf-vr-h">Turmas que serão abertas em ${nextYear()}</h3>
      <p class="muted small">"Copiar de" traz a sala, as vagas, as disciplinas e o horário de uma turma atual. Turmas para alunos novos também podem ser criadas depois, em Turmas.</p>
      ${p.open.length ? html`<ul class="cf-vr-news">${p.open.map(openRow)}</ul>` : html`<p class="muted small">Nenhuma turma nova. Os alunos vão para turmas já criadas para ${nextYear()}.</p>`}
      <button type="button" class="btn sm" data-vr-add>${icon('plus')}Adicionar turma</button>
      ${fl.semTurma.length ? html`<div class="notice warn">${icon('alert')}<span class="grow">${U.plural(fl.semTurma.length, 'aluno vai ficar', 'alunos vão ficar')} sem turma em ${nextYear()}. Eles continuam matriculados e podem ser colocados numa turma depois.</span></div>` : ''}
    </div>
    <div class="cf-vr-foot"><button type="button" class="btn" data-vr-go="1">${icon('arrowLeft')}Voltar</button><button type="button" class="btn ghost sm" data-vr-reset-plan>${icon('refresh')}Refazer sugestão</button><span class="grow"></span><button type="button" class="btn primary" data-vr-go="3">Revisar${icon('arrowRight')}</button></div>`;
  };

  const viradaReview = () => {
    const v = VS();
    const olds = oldClasses();
    const p = olds.length ? (v.plan = buildPlan(v.plan)) : { open: [], map: {} };
    const fl = flows(p);
    const y = Q.year();
    const n = Number(S().termCount) || 4;
    const openAll = Array.from({ length: n }, (_, i) => i + 1).filter((t) => Q.termOpen(t, y)).length;
    const destRows = [...p.open, ...futureClasses()].sort(byGrade).map((x) => x.ref || x.id).map((ref) => {
      const list = fl.dest.get(ref) || [];
      const o = p.open.find((x) => x.ref === ref);
      const src = new Map();
      list.forEach((x) => {
        const k = `${x.kind}|${x.from.id}`;
        src.set(k, { n: (src.get(k) || { n: 0 }).n + 1, kind: x.kind, from: x.from });
      });
      return html`<li><span class="grow"><b>${destName(p, ref)}</b> ${o ? UI.pill('nova', 'info', true) : html`<span class="small muted">(já existia)</span>`}
        <span class="small muted cf-block">${list.length ? [...src.values()].map((x) => `${x.n} ${x.kind === 'retido' ? (x.n === 1 ? 'retido' : 'retidos') : x.n === 1 ? 'aprovado' : 'aprovados'} do ${x.from.name}`).join(' · ') : 'Sem alunos por enquanto'}</span></span><b class="cf-num">${U.int(list.length)}</b></li>`;
    });
    return html`<div class="card-body cf-vr-body">
      <div class="kpis cf-vr-kpis">
        <div class="card kpi"><span class="kpi-label">Aprovados</span><span class="kpi-value">${U.int(fl.aprovado)}</span></div>
        <div class="card kpi"><span class="kpi-label">Retidos</span><span class="kpi-value">${U.int(fl.retido)}</span></div>
        <div class="card kpi"><span class="kpi-label">Concluintes</span><span class="kpi-value">${U.int(fl.concluido)}</span></div>
        <div class="card kpi"><span class="kpi-label">Transferidos</span><span class="kpi-value">${U.int(fl.transferido)}</span></div>
      </div>
      ${olds.length ? html`<h3>Turmas de ${nextYear()}</h3><ul class="items cf-vr-dest">${destRows}</ul>` : html`<p class="muted">Não há turmas ativas em ${y}: a virada só muda o ano letivo para ${nextYear()}.</p>`}
      ${fl.semTurma.length ? html`<div class="notice warn">${icon('alert')}<span class="grow"><b>${U.plural(fl.semTurma.length, 'aluno fica', 'alunos ficam')} sem turma:</b> ${fl.semTurma.slice(0, 6).map((x) => x.s.name).join(', ')}${fl.semTurma.length > 6 ? ` e mais ${fl.semTurma.length - 6}` : ''}.</span></div>` : ''}
      ${openAll ? html`<div class="notice warn">${icon('alert')}<span class="grow">${openAll === 1 ? 'Ainda há 1 etapa aberta' : `Ainda há ${openAll} etapas abertas`} em ${y}. Notas lançadas depois da virada não entram no histórico.</span></div>` : ''}
      <div class="notice bad">${icon('alert')}<span class="grow"><b>A virada não pode ser desfeita.</b> ${olds.length ? `${U.plural(olds.length, 'turma', 'turmas')} de ${y} ${olds.length === 1 ? 'será encerrada' : 'serão encerradas'}, ${p.open.length ? `${U.plural(p.open.length, 'turma nova será aberta', 'turmas novas serão abertas')}, ` : ''}` : ''}o ano letivo passa a ser ${nextYear()} e começa no 1º ${TERM_LABEL[n]}. Vamos pedir a sua senha.</span></div>
    </div>
    <div class="cf-vr-foot"><button type="button" class="btn" data-vr-go="${olds.length ? 2 : 0}">${icon('arrowLeft')}Voltar</button><span class="grow"></span><button type="button" class="btn danger solid" data-vr-run>${icon('repeat')}Fazer a virada para ${nextYear()}</button></div>`;
  };

  const viradaDone = (r) => html`<div class="card-body cf-vr-body cf-vr-done">
      <div class="cf-done-ic">${icon('checkCircle')}</div>
      <h3>Bem-vindos a ${r.year}!</h3>
      <p class="muted">${U.plural(r.moved || 0, 'aluno passou', 'alunos passaram')} pela virada: ${joinPt([U.plural(r.aprovado || 0, 'aprovado', 'aprovados'), r.retido ? U.plural(r.retido, 'retido', 'retidos') : '', r.concluido ? U.plural(r.concluido, 'concluinte', 'concluintes') : '', r.transferido ? U.plural(r.transferido, 'transferido', 'transferidos') : ''].filter(Boolean))}. ${U.cap(U.plural(r.closed || 0, 'turma encerrada', 'turmas encerradas'))} e ${U.plural((r.created || []).length, 'turma aberta', 'turmas abertas')}.</p>
      <ul class="items small cf-next">
        <li>${icon('layers')}<span class="grow">Confira as turmas novas: professores, horário e vagas.</span>${hasPage('turmas') ? html`<a class="btn sm" href="#turmas">Abrir turmas</a>` : ''}</li>
        <li>${icon('userPlus')}<span class="grow">Matricule os alunos novos e coloque numa turma quem ficou sem.</span>${hasPage('alunos') ? html`<a class="btn sm" href="#alunos">Abrir alunos</a>` : ''}</li>
        <li>${icon('calendar')}<span class="grow">Revise as datas e as regras do novo ano.</span><a class="btn sm" href="#configuracoes/ano">Ano letivo</a></li>
      </ul>
    </div>
    <div class="cf-vr-foot"><span class="grow"></span><button type="button" class="btn primary" data-vr-finish>Concluir</button></div>`;

  const renderVirada = () => {
    const v = VS();
    const olds = oldClasses();
    let body;
    if (v.done) body = viradaDone(v.done);
    else if (v.step === 1 && olds.length) body = viradaResults();
    else if (v.step === 2 && olds.length) body = viradaPlan();
    else if (v.step === 3) body = viradaReview();
    else body = viradaIntro();
    return html`${v.done ? secHead('Virada do ano letivo concluída', `O ano letivo agora é ${Q.year()}.`) : secHead(`Virada do ano letivo: ${Q.year()} → ${nextYear()}`, 'Fecha o ano que terminou e prepara o próximo, sem redigitar ninguém. Só a conta titular faz a virada.')}
      <section class="card cf-card cf-virada" data-cf-virada>${v.done ? '' : steps(v.step, olds.length > 0)}${body}</section>`;
  };

  const runVirada = async (btn) => {
    const v = VS();
    const olds = oldClasses();
    const p = olds.length ? (v.plan = buildPlan(v.plan)) : { open: [], map: {} };
    const errors = checkPlan(p);
    if (Object.keys(errors).length) {
      v.errors = errors;
      v.step = 2;
      App.render();
      UI.toast('Confira os nomes das turmas novas.', { tone: 'bad' });
      return;
    }
    const ny = nextYear();
    const ok = await UI.confirm({
      title: `Fazer a virada para ${ny}?`,
      text: html`As turmas de ${Q.year()} serão encerradas e os alunos irão para as turmas de ${ny}. <b>Não dá para desfazer.</b>`,
      ok: `Fazer a virada`,
      danger: true,
      requireText: String(ny),
    });
    if (!ok) return;
    const used = new Set(p.open.map((o) => o.ref));
    const mapping = {};
    const results = {};
    for (const c of olds) {
      const a = p.map[c.id];
      mapping[c.id] = a && a !== FIM && (used.has(a) || Q.klass(a)) ? a : null;
      const r = p.map[c.id + ':retido'];
      mapping[c.id + ':retido'] = r && (used.has(r) || Q.klass(r)) ? r : null;
      for (const s of kidsOf(c.id)) {
        let res = resultOf(s.id);
        if (res === 'aprovado' && a === FIM) res = 'concluido';
        results[s.id] = res;
      }
    }
    const open = p.open.map((o) => ({ ref: o.ref, name: o.name.trim(), segment: o.segment, shift: o.shift, ...(o.from ? { from: o.from, people: !!o.people } : {}) }));
    const res = await UI.act('year.rollover', { nextYear: ny, open, mapping, results }, { btn });
    if (!res) return;
    v.done = { ...res.result, year: ny };
    v.plan = null;
    v.results = {};
    v.errors = {};
    try {
      await Store.load();
    } catch (e) {
      /* o retrato volta na próxima sincronização */
    }
    UI.toast(`Ano letivo de ${ny} aberto`, { ic: 'sparkles' });
    App.render();
  };

  // =====================================================================
  // Backup e dados
  // =====================================================================
  let lastBackup = null; // instante do último backup baixado nesta visita (para a virada do ano)
  const fileToBase64 = (file) =>
    new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result).split(',')[1] || '');
      r.onerror = () => reject(new Error('Não foi possível ler o arquivo.'));
      r.readAsDataURL(file);
    });
  const renderBackup = () => {
    const local = Api.isLocal;
    const owner = isOwner();
    const exportCard = html`<section class="card cf-card"><div class="card-head"><div><h2>${icon('download', 'muted')}Exportar uma cópia</h2><p class="sub">Tudo da escola: alunos, turmas, frequência, notas, agenda, mensagens e mensalidades.</p></div></div>
      <div class="card-body">
        ${local
          ? html`<p class="notice small">${icon('info')}<span class="grow">Na demonstração, o backup é um arquivo <b>.json simples, sem senha</b>, só para levar os dados da escola de exemplo para outro navegador ou para o servidor. No servidor da escola, o backup é cifrado com uma senha que só você sabe.</span></p>
            <form class="cf-plain" data-cf-export novalidate><div class="btn-row"><button type="submit" class="btn primary" ${ro() ? 'disabled' : ''}>${icon('download')}Baixar backup</button></div></form>`
          : html`<form class="form-grid cf-plain" data-cf-export novalidate>
              ${UI.fields([
                { name: 'password', label: 'Sua senha', type: 'password', required: true, autocomplete: 'current-password', full: true, hint: 'A senha com que você entra na Caderneta.' },
                { name: 'passphrase', label: 'Senha do backup', type: 'password', required: true, autocomplete: 'new-password', hint: 'Pelo menos 10 caracteres.', check: (x) => (x && x.length < 10 ? 'Use pelo menos 10 caracteres.' : '') },
                { name: 'passphrase2', label: 'Repita a senha do backup', type: 'password', required: true, autocomplete: 'new-password', check: (x, d) => (x && x !== d.passphrase ? 'As senhas não são iguais.' : '') },
              ])}
              <p class="notice warn small full">${icon('key')}<span class="grow">Guarde a senha do backup em lugar seguro: <b>sem ela o arquivo não abre</b> e ninguém consegue recuperá-la.</span></p>
              <div class="field full"><div class="btn-row"><button type="submit" class="btn primary" ${ro() ? 'disabled' : ''}>${icon('download')}Baixar backup cifrado</button></div></div>
            </form>
            <p class="small muted cf-auto">${icon('clock')}O servidor também faz um backup automático todo dia às 3h (no fuso da escola) e guarda as últimas 14 cópias.</p>`}
      </div></section>`;
    const importCard = html`<section class="card cf-card"><div class="card-head"><div><h2>${icon('upload', 'muted')}Importar um backup</h2><p class="sub">Troca os dados da escola pelos do arquivo. Aceita também o backup da versão anterior da Caderneta.</p></div></div>
      <div class="card-body">
        ${owner
          ? html`<div class="notice warn small">${icon('alert')}<span class="grow"><b>Importar substitui todos os dados da escola</b> (alunos, turmas, notas, frequência, agenda, mensagens e mensalidades) pelos do arquivo. As contas da equipe, as senhas e o registro de atividades continuam os atuais. ${local ? 'Na demonstração não há cópia automática: baixe um backup antes, se quiser guardar o estado atual.' : 'Antes de importar, o servidor guarda sozinho uma cópia do estado atual.'}</span></div>
            <form class="form-grid cf-plain" data-cf-import novalidate>
              <div class="field full" data-field="file"><label for="cf-import-file">Arquivo do backup</label><input id="cf-import-file" class="input cf-file" type="file" accept=".caderneta,.json,application/json,application/octet-stream" ${ro() ? 'disabled' : ''}><span class="hint">Arquivo .caderneta (servidor) ou .json (demonstração ou versão anterior).</span></div>
              ${local
                ? ''
                : UI.fields([
                    { name: 'password', label: 'Sua senha', type: 'password', required: true, autocomplete: 'current-password' },
                    { name: 'passphrase', label: 'Senha do backup', type: 'password', autocomplete: 'off', hint: 'A que foi usada ao exportar (em branco para .json).' },
                  ])}
              <div class="field full"><div class="btn-row"><button type="submit" class="btn danger" ${ro() ? 'disabled' : ''}>${icon('upload')}Importar dados</button></div></div>
            </form>`
          : html`<p class="muted small">${icon('lock')} Só a conta titular pode importar dados.</p>`}
      </div></section>`;
    const demoCard = local
      ? html`<section class="card cf-card"><div class="card-head"><div><h2>${icon('sparkles', 'muted')}Demonstração</h2><p class="sub">Os dados da escola de exemplo ficam só neste navegador.</p></div></div>
          <div class="card-body cf-demo"><p class="small muted grow">Quer começar de novo? A escola de exemplo volta ao início e tudo o que foi feito neste navegador é apagado.</p><button type="button" class="btn danger" data-cf-reset-demo ${ro() ? 'disabled' : ''}>${icon('refresh')}Recomeçar demonstração</button></div></section>`
      : '';
    return html`${secHead('Backup e dados', 'Uma cópia de segurança protege a escola contra perda de dados. Faça antes de mudanças grandes, como a virada do ano.')}
      ${exportCard}${importCard}${demoCard}`;
  };
  const doExport = async (form) => {
    const btn = form.querySelector('[type=submit]');
    let password = '';
    let passphrase = '';
    if (!Api.isLocal) {
      const defs = [
        { name: 'password', type: 'password', required: true },
        { name: 'passphrase', type: 'password', required: true, check: (x) => (x && x.length < 10 ? 'Use pelo menos 10 caracteres.' : '') },
        { name: 'passphrase2', type: 'password', required: true, check: (x, d) => (x && x !== d.passphrase ? 'As senhas não são iguais.' : '') },
      ];
      const d = UI.readForm(form, defs);
      if (!UI.validate(form, defs, d)) return;
      password = d.password;
      passphrase = d.passphrase;
    }
    btn.disabled = true;
    btn.classList.add('loading');
    try {
      const blob = await Api.exportBackup(password, passphrase);
      const name = `backup-${U.slug(S().schoolName || 'escola') || 'escola'}-${today()}.${Api.isLocal ? 'json' : 'caderneta'}`;
      U.download(name, blob);
      lastBackup = new Date().toISOString();
      form.reset();
      UI.toast('Backup baixado. Guarde o arquivo em lugar seguro.', { ic: 'download' });
    } catch (err) {
      if (err && /senha/i.test(err.message || '') && !/backup/i.test(err.message || '') && UI.markField(form, 'password', err.message)) return;
      if (err && /backup/i.test(err.message || '') && UI.markField(form, 'passphrase', err.message)) return;
      UI.errorToast(err);
    } finally {
      if (document.contains(btn)) {
        btn.disabled = false;
        btn.classList.remove('loading');
      }
    }
  };
  const doImport = async (form) => {
    UI.clearErrors(form);
    const input = form.querySelector('#cf-import-file');
    const file = input && input.files && input.files[0];
    if (!file) return UI.markField(form, 'file', 'Escolha o arquivo do backup.');
    if (file.size > 55 * 1024 * 1024) return UI.markField(form, 'file', 'O arquivo passa de 55 MB. Confira se é mesmo um backup da Caderneta.');
    let password = '';
    let passphrase = '';
    if (!Api.isLocal) {
      const defs = [{ name: 'password', type: 'password', required: true }, { name: 'passphrase', type: 'password' }];
      const d = UI.readForm(form, defs);
      if (!UI.validate(form, defs, d)) return;
      password = d.password;
      passphrase = d.passphrase;
    }
    const ok = await UI.confirm({
      title: 'Substituir os dados da escola?',
      text: html`Os dados atuais serão trocados pelos do arquivo <b>${file.name}</b>. ${Api.isLocal ? 'Na demonstração não há cópia automática.' : 'O servidor guarda uma cópia do estado atual antes.'}`,
      ok: 'Importar e substituir',
      danger: true,
      requireText: 'IMPORTAR',
    });
    if (!ok) return;
    const btn = form.querySelector('[type=submit]');
    btn.disabled = true;
    btn.classList.add('loading');
    try {
      const b64 = await fileToBase64(file);
      const r = await Api.importBackup(b64, password, passphrase);
      UI.toast(`Dados importados: ${U.plural(r.students || 0, 'aluno', 'alunos')} e ${U.plural(r.classes || 0, 'turma', 'turmas')}${r.v1 ? ' (da versão anterior)' : ''}.`, { ic: 'upload' });
      PageState.reset('configuracoes');
      PageState.reset('cf-virada');
      await Store.load();
      App.render();
    } catch (err) {
      if (err && err.status === 403 && /senha/i.test(err.message || '') && UI.markField(form, 'password', err.message)) return;
      if (!UI.markField(form, 'file', (err && err.message) || 'Não foi possível importar.')) UI.errorToast(err);
    } finally {
      if (document.contains(btn)) {
        btn.disabled = false;
        btn.classList.remove('loading');
      }
    }
  };

  // =====================================================================
  // Tela
  // =====================================================================
  const RENDER = { escola: renderEscola, ano: renderAno, etapas: renderEtapas, disciplinas: renderDisciplinas, agenda: renderAgenda, financeiro: renderFinanceiro, privacidade: renderPrivacidade, acessos: renderAcessos, virada: renderVirada, backup: renderBackup };
  const render = (rest) => {
    const list = sections();
    const sec = current(rest);
    if (!sec) return html`<div class="page-head"><div><h1>Configurações</h1></div></div><div class="card">${UI.empty({ icon: 'lock', title: 'Sem acesso às configurações', text: 'Peça à direção para liberar o acesso, se precisar.' })}</div>`;
    const drafts = CS().drafts;
    const nav = html`<nav class="cf-nav" aria-label="Seções das configurações">${list.map(
      (s) => html`<a class="cf-nav-item ${s.id === sec.id ? 'active' : ''}" href="#configuracoes/${s.id}" ${s.id === sec.id ? raw('aria-current="page"') : ''}>${icon(s.icon)}<span class="cf-nav-text"><b>${s.label}</b><small>${s.desc}</small></span>${drafts[s.id] ? html`<span class="cf-dot" title="Alterações não salvas"><span class="sr-only">(alterações não salvas)</span></span>` : ''}</a>`,
    )}</nav>`;
    return html`<div class="page-head"><div><div class="eyebrow">Gestão</div><h1>Configurações</h1><p class="lead">${editor() ? 'As regras e os dados da escola. As mudanças valem na hora para toda a equipe e, quando for o caso, para as famílias.' : 'Cópias de segurança dos dados da escola.'}</p></div></div>
      ${roNotice()}
      <div class="cf-layout">${nav}<div class="cf-main" data-cf-sec="${sec.id}">${RENDER[sec.id]()}</div></div>`;
  };

  /** Atualiza o rótulo "Alterações não salvas" sem redesenhar a tela. */
  const markDirty = (form, sec) => {
    const dirty = !!CS().drafts[sec];
    const state = form.querySelector('[data-cf-state]');
    if (state) {
      state.classList.toggle('is-dirty', dirty);
      UI.setHTML(state, dirty ? html`${icon('alert')}Alterações não salvas` : html`${icon('checkCircle')}Tudo salvo`);
    }
    form.querySelectorAll('[data-cf-discard], [data-cf-save]').forEach((b) => (b.disabled = !dirty));
    const foot = form.querySelector('[data-cf-foot]');
    if (foot) foot.classList.toggle('is-dirty', dirty);
    const nav = document.querySelector(`.cf-nav-item[href="#configuracoes/${sec}"]`);
    if (nav && dirty && !nav.querySelector('.cf-dot')) nav.insertAdjacentHTML('beforeend', String(html`<span class="cf-dot" title="Alterações não salvas"><span class="sr-only">(alterações não salvas)</span></span>`));
  };
  const readDraft = (sec, form) => {
    const v = values(sec);
    const defs = SIMPLE[sec].defs(v).filter((d) => d && d.name);
    const d = UI.readForm(form, defs);
    if (sec === 'agenda') {
      const cur = agendaDraft();
      d.routineFields = cur.routineFields;
      d.routineBring = cur.routineBring;
    }
    return d;
  };
  const save = async (sec, form) => {
    const v = values(sec);
    const defs = SIMPLE[sec].defs(v);
    const d = readDraft(sec, form);
    if (!UI.validate(form, defs, d)) return;
    if (sec === 'agenda' && !validateAgenda(form, d)) return;
    const res = await UI.act('settings.update', { patch: SIMPLE[sec].patch(d) }, { btn: form.querySelector('[data-cf-save]'), ok: SIMPLE[sec].ok, form });
    if (!res) return;
    delete CS().drafts[sec];
    if (sec === 'ano' || sec === 'etapas') markReviewed();
    App.render();
  };

  const mountForm = (el, sec) => {
    const form = el.querySelector(`[data-cf-form="${sec}"]`);
    if (!form || ro()) return;
    UI.bindMasks(form);
    const update = (e) => {
      if (e && e.target && e.target.closest('[data-nodirty]')) return;
      if (e && e.target && e.target.dataset && e.target.dataset.cfMask === 'cnpj' && e.type === 'input') {
        const m = maskCNPJ(e.target.value);
        if (m !== e.target.value) e.target.value = m;
      }
      CS().drafts[sec] = readDraft(sec, form);
      markDirty(form, sec);
      if (sec === 'financeiro') {
        const ex = form.querySelector('[data-cf-fee-example] .grow');
        if (ex) UI.setHTML(ex, feeExample(sanitize(CS().drafts[sec])));
      }
      if (sec === 'privacidade') {
        const pv = el.querySelector('[data-cf-privacy-preview]');
        if (pv) {
          const open = pv.open;
          UI.setHTML(pv, html`<summary>Ver o aviso como as famílias veem</summary>${App.privacyNotice(sanitize(CS().drafts[sec]).privacy, S().schoolName)}`);
          pv.open = open;
        }
      }
    };
    form.addEventListener('input', update);
    form.addEventListener('change', (e) => {
      if (sec === 'ano' && e.target.name === 'termCount') {
        const n = Number(e.target.value) || 4;
        const sel = form.querySelector('select[name="term"]');
        if (sel) {
          const cur = Math.min(Number(sel.value) || 1, n);
          UI.setHTML(sel, termOptions(n).map(([k, l]) => html`<option value="${k}" ${Number(k) === cur ? 'selected' : ''}>${l}</option>`));
        }
      }
      update(e);
    });
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      save(sec, form);
    });
    form.addEventListener('click', (e) => {
      if (e.target.closest('[data-cf-discard]')) {
        delete CS().drafts[sec];
        UI.toast('Alterações descartadas', { ic: 'undo' });
        App.render();
      }
    });
  };

  const mountAgenda = (el) => {
    const form = el.querySelector('[data-cf-form="agenda"]');
    if (!form || ro()) return;
    const box = () => form.querySelector('[data-cf-rf]');
    const bringBox = () => form.querySelector('[data-field="routineBring"] .cf-tags');
    const touch = () => {
      const d = agendaDraft();
      Object.assign(d, UI.readForm(form, SIMPLE.agenda.defs().filter((x) => x && x.name)));
      markDirty(form, 'agenda');
    };
    const redraw = (...focus) => {
      const d = agendaDraft();
      UI.setHTML(box(), routineEditor(d));
      const bb = bringBox();
      if (bb) bb.outerHTML = String(tags(d.routineBring || [], { kind: 'bring', max: BRING_MAX, placeholder: 'Novo item', label: 'Itens para trazer' }));
      UI.$$('.field .error', form).forEach((x) => x.remove());
      touch();
      for (const sel of focus) {
        const f = sel && form.querySelector(sel);
        if (f) {
          f.focus();
          break;
        }
      }
    };
    const addTag = (kind, i) => {
      const input = form.querySelector(`[data-cf-tag-input="${kind}"][data-i="${i}"]`);
      if (!input) return;
      const val = input.value.trim();
      if (!val) return input.focus();
      const d = agendaDraft();
      const list = kind === 'bring' ? (d.routineBring = d.routineBring || []) : (d.routineFields[Number(i)].options = d.routineFields[Number(i)].options || []);
      if (list.some((x) => U.norm(x) === U.norm(val))) {
        UI.toast(`"${val}" já está na lista.`, { tone: 'bad' });
        return input.select();
      }
      list.push(val);
      redraw(`[data-cf-tag-input="${kind}"][data-i="${i}"]`);
    };
    form.addEventListener('input', (e) => {
      const lab = e.target.closest('[data-cf-rf-label]');
      if (lab) {
        agendaDraft().routineFields[Number(lab.dataset.cfRfLabel)].label = lab.value;
        lab.classList.remove('invalid');
        touch();
      }
    });
    form.addEventListener('keydown', (e) => {
      const t = e.target.closest('[data-cf-tag-input]');
      if (t && e.key === 'Enter') {
        e.preventDefault();
        addTag(t.dataset.cfTagInput, t.dataset.i);
      }
      if (e.target.closest('[data-cf-rf-label]') && e.key === 'Enter') e.preventDefault();
    });
    form.addEventListener('click', (e) => {
      const d = agendaDraft();
      const add = e.target.closest('[data-cf-tag-add]');
      if (add) return addTag(add.dataset.cfTagAdd, add.dataset.i);
      const del = e.target.closest('[data-cf-tag-del]');
      if (del) {
        const j = Number(del.dataset.j);
        if (del.dataset.cfTagDel === 'bring') d.routineBring.splice(j, 1);
        else d.routineFields[Number(del.dataset.i)].options.splice(j, 1);
        return redraw(`[data-cf-tag-input="${del.dataset.cfTagDel}"][data-i="${del.dataset.i}"]`, del.dataset.cfTagDel === 'bring' ? '[data-field="routineBring"] .cf-tag-x' : `[data-cf-rf-label="${del.dataset.i}"]`);
      }
      const mv = e.target.closest('[data-cf-rf-move]');
      if (mv) {
        const i = Number(mv.dataset.cfRfMove);
        const j = i + Number(mv.dataset.dir);
        if (j < 0 || j >= d.routineFields.length) return;
        [d.routineFields[i], d.routineFields[j]] = [d.routineFields[j], d.routineFields[i]];
        return redraw(`[data-cf-rf-move="${j}"][data-dir="${mv.dataset.dir}"]:not([disabled])`, `[data-cf-rf-label="${j}"]`);
      }
      const rm = e.target.closest('[data-cf-rf-del]');
      if (rm) {
        const i = Number(rm.dataset.cfRfDel);
        const gone = d.routineFields.splice(i, 1)[0];
        redraw('[data-cf-rf-add]');
        UI.toast(`Campo "${gone.label || 'sem nome'}" removido. Ele só sai de verdade quando você salvar.`, { action: { label: 'Desfazer', fn: () => { agendaDraft().routineFields.splice(i, 0, gone); redraw(`[data-cf-rf-label="${i}"]`); } } });
        return;
      }
      if (e.target.closest('[data-cf-rf-add]')) {
        d.routineFields.push({ label: '', options: [] });
        return redraw(`[data-cf-rf-label="${d.routineFields.length - 1}"]`);
      }
    });
  };

  const mountVirada = (el) => {
    const box = el.querySelector('[data-cf-virada]');
    if (!box) return;
    const v = VS();
    const redraw = () => {
      const a = document.activeElement;
      const keys = a && box.contains(a) ? [...a.attributes].filter((x) => x.name.startsWith('data-vr-')).map((x) => `[${x.name}="${CSS.escape(x.value)}"]`) : [];
      App.render();
      if (keys.length) {
        const f = document.querySelector(`[data-cf-virada] ${keys[0]}`);
        if (f) f.focus();
      }
    };
    const openOf = (ref) => (v.plan ? v.plan.open.find((o) => o.ref === ref) : null);
    box.addEventListener('click', async (e) => {
      const go = e.target.closest('[data-vr-go]');
      if (go) {
        const to = Number(go.dataset.vrGo);
        if (v.step === 2 && to === 3) {
          v.errors = checkPlan(buildPlan(v.plan));
          if (Object.keys(v.errors).length) {
            redraw();
            const f = box.querySelector('.cf-vr-new.has-error input');
            if (f) f.focus();
            return;
          }
        }
        v.step = to;
        App.render();
        const top = document.querySelector('[data-cf-virada]');
        if (top) top.scrollIntoView({ block: 'start' });
        return;
      }
      const cls = e.target.closest('[data-vr-class]');
      if (cls) {
        v.classId = cls.dataset.vrClass;
        return redraw();
      }
      const all = e.target.closest('[data-vr-allok]');
      if (all) {
        kidsOf(all.dataset.vrAllok).forEach((s) => (v.results[s.id] = 'aprovado'));
        return redraw();
      }
      if (e.target.closest('[data-vr-add]')) {
        const p = (v.plan = buildPlan(v.plan));
        const ref = `new:${++p.seq}`;
        p.open.push({ ref, name: '', segment: 'Outro', shift: 'Manhã', from: '', people: false });
        App.render();
        const f = document.querySelector(`[data-vr-name="${ref}"]`);
        if (f) f.focus();
        return;
      }
      const rm = e.target.closest('[data-vr-remove]');
      if (rm) {
        const ref = rm.dataset.vrRemove;
        const p = v.plan;
        const gone = p.open.find((o) => o.ref === ref);
        p.open = p.open.filter((o) => o.ref !== ref);
        for (const k of Object.keys(p.map)) if (p.map[k] === ref) p.map[k] = '';
        delete (v.errors || {})[ref];
        App.render();
        UI.toast(`${gone && gone.name ? gone.name : 'Turma'} não será aberta. Quem ia para ela fica sem turma.`);
        return;
      }
      if (e.target.closest('[data-vr-reset-plan]')) {
        v.plan = null;
        v.errors = {};
        App.render();
        UI.toast('Sugestão refeita a partir dos nomes das turmas.', { ic: 'refresh' });
        return;
      }
      const run = e.target.closest('[data-vr-run]');
      if (run) return runVirada(run);
      if (e.target.closest('[data-vr-finish]')) {
        PageState.reset('cf-virada');
        App.go('painel');
      }
    });
    box.addEventListener('change', (e) => {
      const t = e.target;
      if (t.dataset.vrRes) {
        v.results[t.dataset.vrRes] = t.value;
        return redraw();
      }
      if (t.dataset.vrMap) {
        v.plan.map[t.dataset.vrMap] = t.value;
        return redraw();
      }
      const o = openOf(t.dataset.vrName || t.dataset.vrSeg || t.dataset.vrShift || t.dataset.vrFrom || t.dataset.vrPeople);
      if (!o) return;
      if (t.dataset.vrName) {
        o.name = t.value.trim();
        o.guess = false;
        if (v.errors) delete v.errors[o.ref];
      } else if (t.dataset.vrSeg) o.segment = t.value;
      else if (t.dataset.vrShift) o.shift = t.value;
      else if (t.dataset.vrFrom) {
        o.from = t.value;
        if (!o.from) o.people = false;
      } else if (t.dataset.vrPeople) o.people = t.checked;
      redraw();
    });
  };

  const mountBackup = (el) => {
    const ex = el.querySelector('[data-cf-export]');
    if (ex) ex.addEventListener('submit', (e) => {
      e.preventDefault();
      if (!ro()) doExport(ex);
    });
    const im = el.querySelector('[data-cf-import]');
    if (im) im.addEventListener('submit', (e) => {
      e.preventDefault();
      if (!ro()) doImport(im);
    });
    const reset = el.querySelector('[data-cf-reset-demo]');
    if (reset) reset.addEventListener('click', async () => {
      const ok = await UI.confirm({ title: 'Recomeçar a demonstração?', text: 'Tudo o que foi feito neste navegador será apagado e a escola de exemplo volta ao início. Você vai precisar entrar de novo.', ok: 'Recomeçar', danger: true });
      if (!ok) return;
      reset.disabled = true;
      reset.classList.add('loading');
      try {
        await Api.resetDemo();
        location.hash = '';
        location.reload();
      } catch (err) {
        UI.errorToast(err);
        reset.disabled = false;
        reset.classList.remove('loading');
      }
    });
  };

  const mount = (el, rest) => {
    const sec = current(rest);
    if (!sec) return;
    const active = el.querySelector('.cf-nav-item.active');
    if (active && active.scrollIntoView && window.innerWidth <= 1020) {
      const nav = active.parentElement;
      nav.scrollLeft = Math.max(0, active.offsetLeft - 16);
    }
    if (SIMPLE[sec.id]) mountForm(el, sec.id);
    if (sec.id === 'agenda') mountAgenda(el);
    if (sec.id === 'virada') mountVirada(el);
    if (sec.id === 'backup') mountBackup(el);
    el.addEventListener('click', async (e) => {
      if (e.target.closest('[data-cf-subject-new]')) return subjectForm(null);
      const ed = e.target.closest('[data-cf-subject-edit]');
      if (ed) return subjectForm(Q.subject(ed.dataset.cfSubjectEdit));
      const del = e.target.closest('[data-cf-subject-del]');
      if (del) return deleteSubject(del.dataset.cfSubjectDel, del);
      if (e.target.closest('[data-cf-new-account]') && fn('novaConta')) return Actions.novaConta();
      const bump = e.target.closest('[data-cf-bump]');
      if (bump) {
        const form = el.querySelector('[data-cf-form="privacidade"]');
        const d = readDraft('privacidade', form);
        if (!UI.validate(form, SIMPLE.privacidade.defs(), d)) return;
        const next = (Number((S().privacy || {}).noticeVersion) || 1) + 1;
        const ok = await UI.confirm({
          title: `Publicar a versão ${next} do aviso?`,
          text: 'Na próxima vez que entrarem, todas as famílias vão ler o aviso de privacidade e confirmar de novo. Isso não pode ser desfeito.',
          ok: 'Publicar nova versão',
        });
        if (!ok) return;
        const res = await UI.act('settings.update', { patch: { privacy: { ...SIMPLE.privacidade.patch(d).privacy, bumpVersion: true } } }, { btn: bump, ok: `Versão ${next} do aviso publicada`, form });
        if (res) {
          delete CS().drafts.privacidade;
          App.render();
        }
      }
    });
  };

  App.page({
    id: 'configuracoes',
    label: 'Configurações',
    icon: 'settings',
    group: 'Gestão',
    order: 80,
    anyPerm: ['configuracoes.editar', 'dados.backup'],
    keys: 'configurações escola ano letivo disciplinas backup privacidade mensalidade virada',
    title: (rest) => {
      const s = current(rest);
      return s ? `Configurações · ${s.label}` : 'Configurações';
    },
    render,
    mount,
  });

  // busca rápida: ir direto para uma seção
  App.searchProvider((query) => {
    if (!Store.me || Store.family || !Store.canAny('configuracoes.editar', 'dados.backup')) return [];
    return sections()
      .filter((s) => U.matches(query, s.label, s.desc, s.keys))
      .map((s) => ({ group: 'Configurações', label: s.label, icon: s.icon, meta: s.desc, keys: `${s.label} ${s.desc} ${s.keys} configurações`, run: () => App.go(`configuracoes/${s.id}`) }));
  });

  // =====================================================================
  // Quadro "Primeiros passos" (painel da titular enquanto a escola está vazia)
  // =====================================================================
  const needsSetup = () => {
    if (!Store.me || !Store.me.owner || Store.preview || Store.family) return false;
    const others = Q.staff().filter((u) => u.id !== Store.me.id).length;
    return !Q.classes().length || !Store.state.students.length || others === 0;
  };
  const setupSteps = () => {
    const s = S();
    const kids = Store.state.students;
    const classes = Q.classes();
    const others = Q.staff().filter((u) => u.id !== Store.me.id).length;
    const families = kids.some((k) => (k.guardians || []).some((g) => g.userId));
    const act = (key, label, perm, fnName, href) => {
      if (perm && !can(perm)) return null;
      if (fnName && fn(fnName)) return { key, label };
      return href && hasPage(href.split('/')[0]) ? { href: '#' + href, label } : null;
    };
    return [
      { id: 'escola', title: 'Dados da escola', text: 'Nome, CNPJ, telefone e endereço: aparecem para as famílias e nos recibos.', done: !!(s.schoolName && s.schoolName !== 'Minha Escola' && (s.phone || s.address)), action: editor() ? { href: '#configuracoes/escola', label: 'Preencher' } : null },
      { id: 'ano', title: 'Ano letivo, etapas e disciplinas', text: 'Bimestres ou trimestres, média, frequência mínima e as disciplinas da escola.', done: reviewed(), action: editor() ? { href: '#configuracoes/ano', label: 'Revisar' } : null, confirm: editor() },
      { id: 'turmas', title: 'Turmas', text: 'Crie as turmas com turno, sala e vagas.', done: classes.length > 0, action: act('turma', 'Criar turma', 'turmas.gerenciar', 'novaTurma', 'turmas') },
      { id: 'equipe', title: 'Convidar a equipe', text: 'Cada pessoa recebe um código de acesso e vê só o que o cargo permite.', done: others > 0, action: act('conta', 'Nova conta', 'usuarios.gerenciar', 'novaConta', 'equipe') },
      { id: 'alunos', title: 'Matricular os alunos', text: classes.length ? 'Com os responsáveis e quem pode buscar.' : 'Crie uma turma antes de matricular.', done: kids.length > 0, action: classes.length ? act('aluno', 'Matricular', 'alunos.cadastrar', 'matricular', 'alunos') : null },
      { id: 'familias', title: 'Convidar as famílias', text: kids.length ? 'Elas acompanham a agenda, as notas e as mensagens pelo portal.' : 'Depois das matrículas, convide os responsáveis.', done: families, action: kids.length ? act('familias', 'Convidar', 'familias.acessos', 'convidarFamilias', 'alunos') : null },
    ];
  };
  App.widget({
    id: 'primeiros-passos',
    order: 1,
    size: 'full',
    when: needsSetup,
    render() {
      const list = setupSteps();
      const done = list.filter((x) => x.done).length;
      const next = list.find((x) => !x.done);
      return html`<section class="card pp-widget" aria-labelledby="pp-title">
        <div class="card-head"><div><h2 id="pp-title">${icon('sparkles')}Primeiros passos</h2><p class="sub">Poucos passos para deixar a Caderneta pronta para o dia a dia da escola.</p></div><span class="pp-count">${done} de ${list.length}</span></div>
        <div class="card-body">
          ${UI.meter((done / list.length) * 100, done === list.length ? 'ok' : '')}
          <ol class="pp-steps">${list.map((x, i) => {
            const isNext = next && next.id === x.id;
            const a = x.action;
            const btn = x.done || !a ? '' : a.href ? html`<a class="btn sm ${isNext ? 'primary' : ''}" href="${a.href}">${a.label}</a>` : html`<button type="button" class="btn sm ${isNext ? 'primary' : ''}" data-pp-act="${a.key}">${a.label}</button>`;
            return html`<li class="pp-step ${x.done ? 'done' : ''} ${isNext ? 'next' : ''}">
              <span class="pp-check" aria-hidden="true">${x.done ? icon('check') : i + 1}</span>
              <span class="pp-text"><b>${x.title}</b><span>${x.done ? 'Feito' : x.text}</span></span>
              <span class="pp-act">${btn}${!x.done && x.confirm ? html`<button type="button" class="btn ghost sm" data-pp-ok="${x.id}">Está certo</button>` : ''}</span>
              <span class="sr-only">${x.done ? '(concluído)' : '(pendente)'}</span>
            </li>`;
          })}</ol>
        </div>
      </section>`;
    },
    mount(el) {
      el.addEventListener('click', (e) => {
        const a = e.target.closest('[data-pp-act]');
        if (a) {
          const k = a.dataset.ppAct;
          if (k === 'turma' && fn('novaTurma')) Actions.novaTurma();
          else if (k === 'conta' && fn('novaConta')) Actions.novaConta();
          else if (k === 'aluno' && fn('matricular')) Actions.matricular();
          else if (k === 'familias' && fn('convidarFamilias')) Actions.convidarFamilias();
          return;
        }
        if (e.target.closest('[data-pp-ok]')) {
          markReviewed();
          UI.toast('Combinado: etapas e disciplinas revisadas.', { ic: 'check' });
          App.render();
        }
      });
    },
  });
})();
