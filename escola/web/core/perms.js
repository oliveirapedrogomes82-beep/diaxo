/* Caderneta Escolar — permissões, perfis de acesso (cargos), escopo de turmas e regras anti-escalada.
   Mesmo arquivo no servidor e no navegador. O servidor decide; o navegador só usa para mostrar e esconder. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else (root.Core = root.Core || {}).perms = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /**
   * Catálogo: [chave, módulo, rótulo na voz do diretor, explicação, nível]
   * nível: 'ver' (só leitura) ou 'alterar'. `sensitive` marca dados sensíveis (cadeado na tela).
   */
  const CATALOG = [
    ['alunos.ver', 'Alunos', 'Pode ver os alunos', 'Nome, turma, idade e responsáveis das turmas que acessa.', 'ver'],
    ['alunos.alertas', 'Alunos', 'Pode ver alertas de saúde', 'Alergias, restrições alimentares e o que fazer em uma emergência.', 'ver', true],
    ['alunos.saude', 'Alunos', 'Pode ver saúde detalhada', 'Diagnósticos, laudos e medicação de uso contínuo.', 'ver', true],
    ['alunos.observacoes', 'Alunos', 'Pode ver observações internas', 'Anotações da escola que nunca vão para a família.', 'ver', true],
    ['alunos.contatos', 'Alunos', 'Pode ver contatos e documentos', 'Telefones, e-mails, endereço e CPF.', 'ver', true],
    ['alunos.cadastrar', 'Alunos', 'Pode matricular e editar cadastros', 'Matrícula, edição, troca de turma, trancamento e transferência.', 'alterar'],
    ['alunos.excluir', 'Alunos', 'Pode excluir cadastros feitos por engano', 'Só para alunos sem histórico (notas, chamadas ou cobranças).', 'alterar'],
    ['familias.acessos', 'Famílias', 'Pode cuidar do acesso das famílias', 'Convidar responsáveis, gerar novo código de acesso e bloquear.', 'alterar'],
    ['turmas.ver', 'Turmas', 'Pode ver turmas e horários', '', 'ver'],
    ['turmas.gerenciar', 'Turmas', 'Pode gerenciar turmas', 'Criar e editar turmas, horários e quem dá aula em cada uma.', 'alterar'],
    ['chamada.ver', 'Frequência', 'Pode ver a frequência', '', 'ver'],
    ['chamada.registrar', 'Frequência', 'Pode fazer a chamada', 'Registrar e corrigir a chamada das próprias aulas.', 'alterar'],
    ['chamada.justificar', 'Frequência', 'Pode justificar e abonar faltas', 'Atestados e abonos previstos em lei.', 'alterar'],
    ['notas.ver', 'Notas', 'Pode ver notas e boletins', '', 'ver'],
    ['notas.lancar', 'Notas', 'Pode lançar notas', 'Professores lançam só nas disciplinas que dão.', 'alterar'],
    ['notas.fechar', 'Notas', 'Pode fechar etapas e liberar o boletim', 'Depois de fechada, só quem tem esta permissão corrige notas.', 'alterar'],
    ['diario.ver', 'Agenda', 'Pode ver a agenda das turmas', 'Deveres, recados e quem já viu ou deu ciente.', 'ver'],
    ['diario.publicar', 'Agenda', 'Pode mandar deveres e recados', 'Dever de casa, recados, lembretes e rotina da Educação Infantil.', 'alterar'],
    ['diario.ocorrencias', 'Agenda', 'Pode registrar ocorrências e elogios', '', 'alterar'],
    ['diario.autorizacoes', 'Agenda', 'Pode pedir autorizações', 'Passeios, saídas e atividades que pedem "autorizo / não autorizo".', 'alterar'],
    ['diario.aprovar', 'Agenda', 'Pode aprovar o que vai para as famílias', 'Quando a aprovação está ligada, revisa recados de professores e auxiliares.', 'alterar'],
    ['mensagens.responder', 'Mensagens', 'Pode ler e responder as famílias', 'Bilhetes das famílias: faltas, saídas, quem busca, medicação.', 'alterar'],
    ['atendimentos.registrar', 'Atendimentos', 'Pode registrar atendimentos', 'Os próprios registros de psicologia, psicopedagogia, orientação ou AEE.', 'alterar', true],
    ['atendimentos.conteudo', 'Atendimentos', 'Pode ler atendimentos compartilhados', 'Só os registros que o autor compartilhou com a área ou com a equipe de apoio.', 'ver', true],
    ['calendario.editar', 'Comunicação', 'Pode marcar eventos no calendário', 'Todos veem o calendário.', 'alterar'],
    ['comunicados.publicar', 'Comunicação', 'Pode publicar comunicados', 'Todos leem os comunicados.', 'alterar'],
    ['financeiro.ver', 'Financeiro', 'Pode ver mensalidades', 'Valores, pagamentos e inadimplência.', 'ver', true],
    ['financeiro.receber', 'Financeiro', 'Pode registrar pagamentos', 'Dar baixa e estornar (com motivo).', 'alterar'],
    ['financeiro.gerenciar', 'Financeiro', 'Pode gerenciar cobranças', 'Gerar, criar, editar e excluir cobranças, valores e descontos.', 'alterar'],
    ['relatorios.ver', 'Gestão', 'Pode ver relatórios pedagógicos', '', 'ver'],
    ['relatorios.financeiro', 'Gestão', 'Pode ver relatórios financeiros', '', 'ver', true],
    ['equipe.ver', 'Gestão', 'Pode ver a equipe e os contatos', '', 'ver'],
    ['usuarios.gerenciar', 'Gestão', 'Pode criar contas da equipe', 'Só dá acessos que ela mesma tem.', 'alterar', true],
    ['configuracoes.editar', 'Gestão', 'Pode mudar as configurações da escola', 'Dados da escola, regras de avaliação, mensalidades e disciplinas.', 'alterar'],
    ['dados.backup', 'Gestão', 'Pode fazer backup dos dados', 'Exportar uma cópia cifrada de tudo.', 'alterar', true],
    ['auditoria.ver', 'Gestão', 'Pode ver o registro de atividades', 'Quem fez o quê e quando, de toda a equipe.', 'ver', true],
  ];
  const ALL = CATALOG.map((c) => c[0]);
  const KNOWN = new Set(ALL);
  const SENSITIVE = new Set(CATALOG.filter((c) => c[5]).map((c) => c[0]));
  /** Permissões confidenciais: quem gerencia contas pode concedê-las mesmo sem possuí-las (fica na auditoria). */
  const CONFIDENTIAL = new Set(['atendimentos.registrar', 'atendimentos.conteudo']);

  /** Cada permissão implica as listadas (marcar "lançar" marca "ver"). */
  const IMPLIES = {
    'alunos.alertas': ['alunos.ver'],
    'alunos.saude': ['alunos.ver', 'alunos.alertas'],
    'alunos.observacoes': ['alunos.ver'],
    'alunos.contatos': ['alunos.ver'],
    'alunos.cadastrar': ['alunos.ver', 'turmas.ver'],
    'alunos.excluir': ['alunos.ver', 'alunos.cadastrar'],
    'familias.acessos': ['alunos.ver', 'alunos.contatos'],
    'turmas.gerenciar': ['turmas.ver'],
    'chamada.registrar': ['chamada.ver', 'alunos.ver'],
    'chamada.justificar': ['chamada.ver', 'alunos.ver'],
    'chamada.ver': ['alunos.ver'],
    'notas.lancar': ['notas.ver', 'alunos.ver'],
    'notas.fechar': ['notas.ver', 'alunos.ver'],
    'notas.ver': ['alunos.ver'],
    'diario.publicar': ['diario.ver', 'alunos.ver'],
    'diario.ocorrencias': ['diario.ver', 'alunos.ver'],
    'diario.autorizacoes': ['diario.ver', 'alunos.ver'],
    'diario.aprovar': ['diario.ver', 'alunos.ver'],
    'diario.ver': ['alunos.ver'],
    'mensagens.responder': ['alunos.ver'],
    'atendimentos.registrar': ['alunos.ver'],
    'atendimentos.conteudo': ['alunos.ver'],
    'financeiro.receber': ['financeiro.ver'],
    'financeiro.gerenciar': ['financeiro.ver'],
    'financeiro.ver': ['alunos.ver'],
    'relatorios.financeiro': ['financeiro.ver'],
  };
  const withImplied = (list) => {
    const set = new Set(list);
    let grew = true;
    while (grew) {
      grew = false;
      for (const p of [...set]) for (const q of IMPLIES[p] || []) if (!set.has(q)) {
        set.add(q);
        grew = true;
      }
    }
    return ALL.filter((p) => set.has(p));
  };

  const without = (list, ...remove) => list.filter((p) => !remove.includes(p));
  const P = (...list) => withImplied(list);
  const ALUNOS_COMPLETO = ['alunos.ver', 'alunos.alertas', 'alunos.saude', 'alunos.observacoes', 'alunos.contatos'];
  const APOIO = P(...ALUNOS_COMPLETO, 'turmas.ver', 'chamada.ver', 'notas.ver', 'diario.ver', 'mensagens.responder', 'atendimentos.registrar', 'atendimentos.conteudo', 'relatorios.ver');

  /**
   * Perfis de acesso pré-definidos (cargo). scope: 'todas' | 'segmentos' | 'vinculos'.
   * teaches: aparece nas listas de professor/auxiliar das turmas. area: área de atendimento.
   */
  const ROLES = [
    { id: 'diretor', label: 'Diretor(a)', group: 'Gestão', scope: 'todas', perms: without(ALL, 'atendimentos.registrar', 'atendimentos.conteudo') },
    { id: 'vice', label: 'Vice-diretor(a)', group: 'Gestão', scope: 'todas', perms: without(ALL, 'atendimentos.registrar', 'atendimentos.conteudo', 'usuarios.gerenciar', 'dados.backup') },
    { id: 'mantenedor', label: 'Mantenedor(a)', group: 'Gestão', scope: 'todas', perms: P('alunos.ver', 'turmas.ver', 'chamada.ver', 'notas.ver', 'financeiro.ver', 'relatorios.ver', 'relatorios.financeiro', 'equipe.ver', 'auditoria.ver') },
    { id: 'coordenador', label: 'Coordenador(a) pedagógico(a)', group: 'Pedagógico', scope: 'todas', perms: P(...ALUNOS_COMPLETO, 'turmas.gerenciar', 'chamada.registrar', 'chamada.justificar', 'notas.lancar', 'notas.fechar', 'diario.publicar', 'diario.ocorrencias', 'diario.autorizacoes', 'diario.aprovar', 'mensagens.responder', 'familias.acessos', 'calendario.editar', 'comunicados.publicar', 'relatorios.ver', 'equipe.ver') },
    { id: 'orientador', label: 'Orientador(a) educacional', group: 'Pedagógico', scope: 'todas', area: 'orientacao', perms: P(...ALUNOS_COMPLETO, 'turmas.ver', 'chamada.justificar', 'notas.ver', 'diario.publicar', 'diario.ocorrencias', 'mensagens.responder', 'atendimentos.registrar', 'atendimentos.conteudo', 'comunicados.publicar', 'relatorios.ver') },
    { id: 'professor', label: 'Professor(a)', group: 'Sala de aula', scope: 'vinculos', teaches: true, perms: P('alunos.alertas', 'turmas.ver', 'chamada.registrar', 'notas.lancar', 'diario.publicar', 'diario.ocorrencias', 'diario.autorizacoes', 'mensagens.responder', 'relatorios.ver') },
    { id: 'auxiliar', label: 'Auxiliar de classe', group: 'Sala de aula', scope: 'vinculos', teaches: true, perms: P('alunos.alertas', 'turmas.ver', 'chamada.registrar', 'diario.publicar', 'mensagens.responder') },
    { id: 'aee', label: 'Professor(a) de AEE', group: 'Sala de aula', scope: 'vinculos', teaches: true, area: 'aee', perms: P('alunos.alertas', 'alunos.saude', 'turmas.ver', 'chamada.ver', 'notas.ver', 'diario.publicar', 'mensagens.responder', 'atendimentos.registrar', 'relatorios.ver') },
    { id: 'apoio', label: 'Profissional de apoio / mediador(a)', group: 'Sala de aula', scope: 'vinculos', perms: P('alunos.alertas', 'alunos.saude', 'turmas.ver', 'diario.ver') },
    { id: 'interprete', label: 'Intérprete de Libras', group: 'Sala de aula', scope: 'vinculos', perms: P('alunos.alertas', 'turmas.ver', 'diario.ver') },
    { id: 'monitor', label: 'Monitor(a) / inspetor(a)', group: 'Sala de aula', scope: 'todas', perms: P('alunos.alertas', 'turmas.ver', 'chamada.ver', 'diario.ver', 'diario.ocorrencias') },
    { id: 'estagiario', label: 'Estagiário(a)', group: 'Sala de aula', scope: 'vinculos', perms: P('alunos.alertas', 'turmas.ver', 'diario.ver') },
    { id: 'psicologo', label: 'Psicólogo(a)', group: 'Apoio', scope: 'todas', area: 'psicologia', perms: APOIO },
    { id: 'psicopedagogo', label: 'Psicopedagogo(a)', group: 'Apoio', scope: 'todas', area: 'psicopedagogia', perms: APOIO },
    { id: 'assistente_social', label: 'Assistente social', group: 'Apoio', scope: 'todas', area: 'servico_social', perms: P('alunos.ver', 'alunos.contatos', 'alunos.observacoes', 'turmas.ver', 'chamada.ver', 'mensagens.responder', 'atendimentos.registrar', 'relatorios.ver') },
    { id: 'enfermagem', label: 'Enfermagem', group: 'Apoio', scope: 'todas', perms: P('alunos.alertas', 'alunos.saude', 'alunos.contatos', 'turmas.ver', 'mensagens.responder') },
    { id: 'nutricionista', label: 'Nutricionista', group: 'Apoio', scope: 'todas', perms: P('alunos.alertas', 'turmas.ver', 'comunicados.publicar') },
    { id: 'bibliotecario', label: 'Bibliotecário(a)', group: 'Apoio', scope: 'todas', perms: P('alunos.ver', 'turmas.ver') },
    { id: 'secretaria', label: 'Secretário(a) escolar', group: 'Administrativo', scope: 'todas', perms: P(...ALUNOS_COMPLETO, 'alunos.cadastrar', 'familias.acessos', 'turmas.ver', 'chamada.justificar', 'notas.ver', 'notas.fechar', 'diario.ver', 'mensagens.responder', 'calendario.editar', 'comunicados.publicar', 'financeiro.receber', 'relatorios.ver', 'relatorios.financeiro', 'equipe.ver') },
    { id: 'aux_secretaria', label: 'Auxiliar de secretaria', group: 'Administrativo', scope: 'todas', perms: P('alunos.ver', 'alunos.contatos', 'alunos.cadastrar', 'familias.acessos', 'turmas.ver', 'chamada.justificar', 'diario.ver', 'mensagens.responder') },
    { id: 'financeiro', label: 'Financeiro / tesouraria', group: 'Administrativo', scope: 'todas', perms: P('alunos.ver', 'alunos.contatos', 'financeiro.receber', 'financeiro.gerenciar', 'relatorios.financeiro') },
    { id: 'portaria', label: 'Portaria / recepção', group: 'Administrativo', scope: 'todas', perms: P('alunos.ver', 'alunos.alertas', 'turmas.ver', 'mensagens.responder') },
    { id: 'outro', label: 'Outro', group: 'Administrativo', scope: 'vinculos', perms: P('alunos.ver', 'turmas.ver') },
    { id: 'responsavel', label: 'Responsável (família)', group: 'Família', scope: 'familia', family: true, perms: [] },
  ];
  const ROLE = Object.fromEntries(ROLES.map((r) => [r.id, r]));
  const STAFF_ROLES = ROLES.filter((r) => !r.family).map((r) => r.id);
  const roleLabel = (id) => (ROLE[id] ? ROLE[id].label : 'Colaborador(a)');
  const isFamily = (user) => !!user && user.role === 'responsavel';

  /** Normaliza uma lista de permissões: só chaves conhecidas, sem repetição, na ordem do catálogo. */
  const clean = (list) => {
    const set = new Set((Array.isArray(list) ? list : []).filter((p) => KNOWN.has(p)));
    return ALL.filter((p) => set.has(p));
  };

  /** Perfil do cargo, considerando a personalização da escola (settings.profiles). */
  const profile = (roleId, settings) => {
    const custom = settings && settings.profiles && settings.profiles[roleId];
    if (Array.isArray(custom)) return withImplied(clean(custom));
    return ROLE[roleId] && !ROLE[roleId].family ? ROLE[roleId].perms.slice() : [];
  };

  /** Usuário está liberado para usar o sistema agora? */
  const isActive = (user, today) => !!user && user.status === 'ativo' && (!user.validUntil || !today || user.validUntil >= today);

  /** Permissões efetivas = (perfil ∪ concedidas) − retiradas, com as implicações. */
  const effective = (user, settings) => {
    if (!user || user.status !== 'ativo' || isFamily(user)) return new Set();
    const base = new Set(profile(user.role, settings));
    for (const p of clean(user.grants)) base.add(p);
    for (const p of clean(user.revokes)) base.delete(p);
    return new Set(withImplied([...base]));
  };

  const activeClass = (c) => c.status !== 'encerrada';
  /** Turmas ativas em que a pessoa atua (regente, disciplina, auxiliar) ou foi vinculada. */
  const linkedClassIds = (user, state) => {
    const ids = new Set();
    const extra = new Set(user.classIds || []);
    for (const c of state.classes || []) {
      if (!activeClass(c)) continue;
      if (extra.has(c.id) || c.teacherId === user.id || (c.assistantIds || []).includes(user.id) || (c.subjects && Object.values(c.subjects).includes(user.id))) ids.add(c.id);
    }
    return ids;
  };
  /** Alunos de quem a conta é responsável (vínculo em students.guardians[].userId, sem bloqueio). */
  const guardianOf = (user, state) => {
    const ids = new Set();
    for (const s of state.students || []) if ((s.guardians || []).some((g) => g.userId === user.id && !g.bloqueado)) ids.add(s.id);
    return ids;
  };

  /**
   * Contexto de acesso. all: enxerga todas as turmas e alunos sem turma; classIds: turmas acessíveis;
   * extraStudentIds: alunos vinculados diretamente (mediador, AEE); studentIds (família): filhos.
   */
  const context = (user, state, env = {}) => {
    const settings = state.settings || {};
    if (isFamily(user) || env.mode === 'familia') {
      const studentIds = guardianOf(user, state);
      const classIds = new Set();
      for (const s of state.students || []) if (studentIds.has(s.id) && s.classId) classIds.add(s.classId);
      return { user, settings, family: true, perms: new Set(), all: false, classIds, studentIds, extraStudentIds: new Set() };
    }
    const perms = effective(user, settings);
    const all = user.scope === 'todas';
    let classIds;
    if (all) classIds = new Set((state.classes || []).filter(activeClass).map((c) => c.id));
    else {
      classIds = linkedClassIds(user, state);
      if (user.scope === 'segmentos') for (const c of state.classes || []) if (activeClass(c) && (user.segments || []).includes(c.segment)) classIds.add(c.id);
    }
    const extraStudentIds = new Set(all ? [] : user.linkedStudentIds || []);
    return { user, settings, family: false, perms, all, classIds, studentIds: null, extraStudentIds };
  };
  /** Impressão digital do contexto: muda quando o que a pessoa enxerga muda (o cliente recarrega o retrato). */
  const fingerprint = (user, state, env = {}) => {
    const c = context(user, state, env);
    // alunos alcançados (fora do escopo "todas"): um aluno que muda de turma muda o que a pessoa enxerga
    let reach = '*';
    if (!c.all) {
      const ids = [];
      for (const s of state.students || []) if (reachesStudent(c, s)) ids.push(s.id);
      reach = ids.sort().join(',');
    }
    // família: o que ela vê também depende de dados fora dos próprios documentos (etapas liberadas, cobrança ligada,
    // ser o responsável financeiro, quem da equipe aparece para ela) — se mudar, o cliente recarrega o retrato
    let fam = '';
    if (c.family) {
      const st = state.settings || {};
      const released = Object.entries((st.terms || {})[String(st.year)] || {}).filter(([, t]) => t && t.released).map(([k]) => k).sort().join(',');
      const fin = [];
      const staff = new Set();
      for (const s of state.students || []) {
        if (!c.studentIds.has(s.id)) continue;
        const g = (s.guardians || []).find((x) => x.userId === user.id && !x.bloqueado);
        if (g && g.financeiro) fin.push(s.id);
      }
      for (const k of state.classes || []) {
        if (!c.classIds.has(k.id)) continue;
        if (k.teacherId) staff.add(k.teacherId);
        (k.assistantIds || []).forEach((id) => staff.add(id));
        Object.values(k.subjects || {}).forEach((id) => id && staff.add(id));
      }
      for (const m of state.messages || []) if (c.studentIds.has(m.studentId)) (m.posts || []).forEach((p) => p.kind !== 'registro' && staff.add(p.userId));
      for (const d of state.diary || []) if ((d.status === 'publicado' || d.status === 'cancelado') && !d.internal && (d.recipients || []).some((id) => c.studentIds.has(id))) staff.add(d.authorId);
      for (const p of state.plans || []) if (c.studentIds.has(p.studentId) && p.sharedWith && p.sharedWith.familia) staff.add(p.authorId);
      fam = [released, fin.sort().join(','), [...staff].sort().join(',')].join('/');
    }
    return [user.status, user.validUntil || '', c.family ? 'F' : 'E', [...c.perms].join(','), (c.all ? '*' : '') + [...c.classIds].sort().join(','), reach, state.settings && state.settings.ownerId === user.id ? 'o' : '', state.settings && state.settings.chargesFees === false ? 'nf' : 'f', fam].join('#');
  };

  /** O contexto alcança este aluno? */
  const reachesStudent = (ctx, student) => {
    if (!student) return false;
    if (ctx.family) return ctx.studentIds.has(student.id);
    if (ctx.all) return true;
    if (ctx.extraStudentIds.has(student.id)) return true;
    return !!student.classId && ctx.classIds.has(student.classId);
  };
  const reachesClass = (ctx, classId) => !!classId && (ctx.all || ctx.classIds.has(classId));

  /** Vínculo pedagógico direto com a turma (regente, disciplina, auxiliar, vínculo explícito) ou com o aluno. */
  const pedagogicLink = (user, state, student) => {
    if (!student) return false;
    if ((user.linkedStudentIds || []).includes(student.id)) return true;
    return !!student.classId && linkedClassIds(user, state).has(student.classId);
  };

  /** Quem lança nota de uma disciplina numa turma: o professor da disciplina; o regente só nas que não têm professor. */
  const canGradeSubject = (ctx, klass, subjectId) => {
    if (ctx.all) return true;
    if (!klass || !reachesClass(ctx, klass.id)) return false;
    const owner = klass.subjects ? klass.subjects[subjectId] : null;
    if (owner) return owner === ctx.user.id;
    return klass.teacherId === ctx.user.id;
  };

  // ---------- regras anti-escalada ----------
  const scopeRank = { vinculos: 0, segmentos: 1, todas: 2 };
  /** Escopo do alvo cabe no escopo do ator? */
  const scopeWithin = (target, actor) => {
    if (actor.scope === 'todas') return true;
    if (target.scope === 'todas') return false;
    if (target.scope === 'segmentos') return actor.scope === 'segmentos' && (target.segments || []).every((s) => (actor.segments || []).includes(s));
    return true;
  };
  /**
   * O ator pode gerenciar a conta (antes e depois da mudança)? Confere dominância de permissões e escopo.
   * Permissões confidenciais não entram na comparação (podem ser dadas por quem gerencia contas).
   */
  const dominates = (actor, target, state) => {
    const settings = (state && state.settings) || {};
    if (!actor || !target || actor.id === target.id) return false;
    if (settings.ownerId === target.id) return false;
    if (isFamily(target)) return false;
    const a = effective(actor, settings);
    if (!a.has('usuarios.gerenciar')) return false;
    const t = effective({ ...target, status: 'ativo' }, settings);
    for (const p of t) if (!CONFIDENTIAL.has(p) && !a.has(p)) return false;
    if (actor.scope === 'todas') return true;
    if (target.scope === 'todas') return false;
    // compara os conjuntos já resolvidos de turmas e alunos
    const ca = context(actor, state);
    const ct = context({ ...target, status: 'ativo' }, state);
    for (const id of ct.classIds) if (!ca.classIds.has(id)) return false;
    for (const id of ct.extraStudentIds) if (!ca.extraStudentIds.has(id) && !reachesStudent(ca, (state.students || []).find((s) => s.id === id))) return false;
    return true;
  };

  /**
   * "Ver como" (somente leitura): conta de equipe que o ator domina, ou conta de família cujos filhos o ator alcança
   * e cujos acessos ao portal ele gerencia (familias.acessos). Nunca a si mesmo.
   */
  const canPreview = (actor, target, state) => {
    if (!actor || !target || actor.id === target.id) return false;
    if (!isFamily(target)) return dominates(actor, target, state);
    if (!effective(actor, (state && state.settings) || {}).has('familias.acessos')) return false;
    const kids = guardianOf(target, state);
    if (!kids.size) return false;
    const ctx = context(actor, state);
    for (const id of kids) if (!reachesStudent(ctx, (state.students || []).find((s) => s.id === id))) return false;
    return true;
  };

  /** Diferença entre as permissões efetivas e o perfil do cargo (para mostrar "padrão" e "alterado"). */
  const diffFromProfile = (roleId, perms, settings) => {
    const base = new Set(profile(roleId, settings));
    const have = new Set(clean(perms));
    return { added: ALL.filter((p) => have.has(p) && !base.has(p)), removed: ALL.filter((p) => base.has(p) && !have.has(p)) };
  };
  /** Converte uma lista final de permissões em grants/revokes relativos ao perfil. */
  const toGrantsRevokes = (roleId, perms, settings) => {
    const d = diffFromProfile(roleId, withImplied(clean(perms)), settings);
    return { grants: d.added, revokes: d.removed };
  };

  const groups = () => {
    const out = [];
    for (const [key, group, label, hint, level, sensitive] of CATALOG) {
      let g = out.find((x) => x.group === group);
      if (!g) out.push((g = { group, items: [] }));
      g.items.push({ key, label, hint, level, sensitive: !!sensitive });
    }
    return out;
  };
  const label = (key) => (CATALOG.find((c) => c[0] === key) || [key, '', key])[2];

  return {
    CATALOG, ALL, SENSITIVE, CONFIDENTIAL, IMPLIES, ROLES, ROLE, STAFF_ROLES, roleLabel, isFamily, clean, withImplied,
    profile, isActive, effective, activeClass, linkedClassIds, guardianOf, context, fingerprint, reachesStudent, reachesClass, pedagogicLink, canGradeSubject,
    scopeRank, scopeWithin, dominates, canPreview, diffFromProfile, toGrantsRevokes, groups, label,
  };
});
