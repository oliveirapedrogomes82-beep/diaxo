/* Caderneta Escolar — escola vazia e escola de exemplo.
   A escola de exemplo é gerada a partir da data de hoje, para a demonstração sempre parecer atual.
   Nenhuma conta de exemplo tem senha: na demonstração entra-se por "Entrar como…". */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./util'), require('./schema'));
  else (root.Core = root.Core || {}).seed = factory(root.Core.util, root.Core.schema);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (util, schema) {
  'use strict';
  const { pad, addDays, addMonths, weekday, holidayName, clamp, maskPhone, norm } = util;

  const DEFAULT_SUBJECTS = [
    ['Língua Portuguesa', 'Port.', 1, 5],
    ['Matemática', 'Mat.', 2, 5],
    ['Ciências', 'Ciên.', 3, 3],
    ['História', 'Hist.', 4, 3],
    ['Geografia', 'Geo.', 5, 3],
    ['Inglês', 'Ing.', 7, 2],
    ['Artes', 'Arte', 8, 2],
    ['Educação Física', 'Ed. Fís.', 6, 2],
  ];
  const SEGMENTS = {
    'Educação Infantil': { attendance: 'diaria', minAttendance: 60, evaluation: 'parecer' },
    'Fundamental I': { attendance: 'diaria', minAttendance: 75, evaluation: 'nota' },
    'Fundamental II': { attendance: 'por_aula', minAttendance: 75, evaluation: 'nota' },
    'Ensino Médio': { attendance: 'por_aula', minAttendance: 75, evaluation: 'nota' },
    EJA: { attendance: 'por_aula', minAttendance: 75, evaluation: 'nota' },
    Outro: { attendance: 'diaria', minAttendance: 75, evaluation: 'nota' },
  };
  const MEALS = ['Comeu tudo', 'Comeu bem', 'Comeu pouco', 'Não comeu'];
  const ROUTINE_FIELDS = [
    { key: 'lanche_manha', label: 'Lanche da manhã', options: MEALS },
    { key: 'almoco', label: 'Almoço', options: MEALS },
    { key: 'lanche_tarde', label: 'Lanche da tarde', options: MEALS },
    { key: 'sono', label: 'Sono', options: ['Dormiu bem', 'Dormiu pouco', 'Não dormiu'] },
    { key: 'evacuacao', label: 'Evacuação', options: ['Normal', 'Não evacuou', 'Intestino solto'] },
    { key: 'humor', label: 'Humor', options: ['Tranquilo(a)', 'Animado(a)', 'Choroso(a)', 'Agitado(a)'] },
  ];
  const ROUTINE_BRING = ['Fralda', 'Lenço umedecido', 'Muda de roupa', 'Pomada', 'Escova de dente', 'Toalha', 'Agasalho'];

  const currentTerm = (today, count = 4) => {
    const m = Number(today.slice(5, 7));
    if (count === 2) return m <= 6 ? 1 : 2;
    if (count === 3) return m <= 5 ? 1 : m <= 8 ? 2 : 3;
    return m <= 4 ? 1 : m <= 7 ? 2 : m <= 9 ? 3 : 4;
  };

  const baseSettings = (today) => {
    const year = Number(today.slice(0, 4));
    const term = currentTerm(today);
    const terms = { [year]: {} };
    for (let t = 1; t <= 4; t++) terms[year][t] = { closed: false, released: false };
    return {
      schoolName: 'Minha Escola',
      cnpj: '',
      phone: '',
      address: '',
      year,
      timezone: 'America/Sao_Paulo',
      termCount: 4,
      termLabel: 'bimestre',
      term,
      terms,
      passing: 6,
      recovery: 4,
      chargesFees: true,
      defaultFee: 0,
      dueDay: 10,
      lateFine: 2,
      lateInterest: 1,
      pixKey: '',
      segments: JSON.parse(JSON.stringify(SEGMENTS)),
      homeworkLabel: 'Dever de casa',
      diaryApproval: false,
      familyMessages: true,
      officeHours: 'Segunda a sexta, das 7h às 18h',
      routineFields: JSON.parse(JSON.stringify(ROUTINE_FIELDS)),
      routineBring: ROUTINE_BRING.slice(),
      absenceAlert: 3,
      privacy: { controller: '', dpoName: '', dpoContact: '', noticeVersion: '1' },
      profiles: {},
      ownerId: null,
      nextSeq: 1,
      demo: false,
    };
  };

  const num = (prefix, n, width = 3) => prefix + String(n).padStart(width, '0');
  const subjects = () => DEFAULT_SUBJECTS.map(([name, short, color, weekly], i) => ({ id: num('s', i + 1), name, short, color, weekly }));

  const empty = (today = util.today()) => {
    const st = schema.emptyState();
    st.settings = baseSettings(today);
    st.subjects = subjects();
    return st;
  };

  // ======================================================================================
  // Escola de exemplo
  // ======================================================================================
  const FEM = ['Ana', 'Beatriz', 'Helena', 'Alice', 'Laura', 'Manuela', 'Valentina', 'Sophia', 'Isabela', 'Lívia', 'Giovanna', 'Maria Eduarda', 'Luiza', 'Cecília', 'Lorena', 'Yasmin', 'Clara', 'Mariana', 'Júlia', 'Heloísa', 'Rafaela', 'Esther', 'Lara', 'Agatha', 'Nicole', 'Isadora', 'Melissa', 'Bianca', 'Larissa', 'Antonella', 'Emanuelly', 'Raquel', 'Vitória', 'Pietra', 'Ayla', 'Maitê', 'Catarina', 'Gabriela', 'Fernanda', 'Letícia'];
  const MASC = ['Miguel', 'Arthur', 'Gael', 'Heitor', 'Theo', 'Davi', 'Bernardo', 'Gabriel', 'Ravi', 'Samuel', 'Pedro', 'Lucas', 'Benjamin', 'Matheus', 'Rafael', 'Joaquim', 'Enzo', 'Lorenzo', 'Nicolas', 'Guilherme', 'Henrique', 'Murilo', 'Isaac', 'Bryan', 'Caio', 'Vicente', 'Felipe', 'Daniel', 'João Pedro', 'Leonardo', 'Eduardo', 'Otávio', 'Vinícius', 'Benício', 'Anthony', 'Thiago', 'Emanuel', 'Diego', 'Kauã', 'Rodrigo'];
  const SUR = ['Silva', 'Santos', 'Oliveira', 'Souza', 'Rodrigues', 'Ferreira', 'Alves', 'Pereira', 'Lima', 'Gomes', 'Costa', 'Ribeiro', 'Martins', 'Carvalho', 'Almeida', 'Lopes', 'Soares', 'Fernandes', 'Vieira', 'Barbosa', 'Rocha', 'Dias', 'Nascimento', 'Andrade', 'Moreira', 'Nunes', 'Marques', 'Machado', 'Mendes', 'Freitas', 'Cardoso', 'Ramos', 'Gonçalves', 'Santana', 'Teixeira', 'Araújo', 'Correia', 'Pinto', 'Campos', 'Monteiro', 'Cavalcanti', 'Barros', 'Moura', 'Batista', 'Azevedo'];
  const ADULT_F = ['Patrícia', 'Juliana', 'Adriana', 'Fabiana', 'Renata', 'Camila', 'Vanessa', 'Aline', 'Daniela', 'Simone', 'Cristiane', 'Luciana', 'Tatiane', 'Priscila', 'Elaine', 'Sandra', 'Kátia', 'Mônica', 'Viviane', 'Roberta'];
  const ADULT_M = ['Marcelo', 'Rodrigo', 'Anderson', 'Fábio', 'Leandro', 'Ricardo', 'Alexandre', 'Márcio', 'Sérgio', 'André', 'Fernando', 'Paulo', 'Carlos', 'Luciano', 'Renato', 'Wagner', 'Júlio', 'Roberto', 'Flávio', 'Gustavo'];
  const STREETS = ['Rua das Acácias', 'Rua Ipê Roxo', 'Av. Brasil', 'Rua Sete de Setembro', 'Rua Dom Pedro II', 'Rua das Palmeiras', 'Av. Santos Dumont', 'Rua Tiradentes', 'Rua São João', 'Travessa da Matriz', 'Rua Monteiro Lobato', 'Rua Cecília Meireles'];
  const HOODS = ['Centro', 'Jardim América', 'Vila Nova', 'Santa Luzia', 'Boa Vista', 'Parque das Flores'];
  const ALERTS = ['Alergia a amendoim: sem amendoim e derivados no lanche.', 'Asma leve: usa bombinha (fica na mochila).', 'Intolerância à lactose.', 'Usa óculos para leitura.', 'Alergia a dipirona.', 'Rinite alérgica.', 'Alergia a picada de inseto: avisar a família imediatamente.'];

  const CLASSES = [
    { name: 'Infantil 5 A', segment: 'Educação Infantil', shift: 'Integral', room: 'Sala 1', age: 5, size: 16 },
    { name: '1º ano A', segment: 'Fundamental I', shift: 'Manhã', room: 'Sala 3', age: 6, size: 18 },
    { name: '3º ano A', segment: 'Fundamental I', shift: 'Manhã', room: 'Sala 5', age: 8, size: 20 },
    { name: '5º ano A', segment: 'Fundamental I', shift: 'Manhã', room: 'Sala 7', age: 10, size: 22 },
    { name: '6º ano A', segment: 'Fundamental II', shift: 'Tarde', room: 'Sala 11', age: 11, size: 24 },
    { name: '7º ano B', segment: 'Fundamental II', shift: 'Tarde', room: 'Sala 12', age: 12, size: 21 },
    { name: '9º ano A', segment: 'Fundamental II', shift: 'Tarde', room: 'Sala 14', age: 14, size: 23 },
    { name: '1ª série EM', segment: 'Ensino Médio', shift: 'Manhã', room: 'Lab. 2', age: 15, size: 19 },
  ];

  // [nome, cargo, função exibida, disciplinas, extras]
  const STAFF = [
    ['Ana Beatriz Moura', 'diretor', 'Diretora', []],
    ['Fernanda Rocha Vidal', 'coordenador', 'Coordenadora pedagógica', []],
    ['Luciana Prates Ribeiro', 'orientador', 'Orientadora educacional', []],
    ['Rita de Cássia Lopes', 'secretaria', 'Secretária escolar', []],
    ['Paulo Henrique Diniz', 'financeiro', 'Tesouraria', []],
    ['Júlia Mendes Arantes', 'psicologo', 'Psicóloga escolar', []],
    ['Mariana Costa Leite', 'psicopedagogo', 'Psicopedagoga', []],
    ['Cláudia Regina Prado', 'professor', 'Professora', ['s001']],
    ['Marcos Vinícius Tavares', 'professor', 'Professor', ['s002']],
    ['Helena Bastos Furtado', 'professor', 'Professora', ['s001', 's007']],
    ['Roberto Ayres Nogueira', 'professor', 'Professor', ['s002', 's003']],
    ['Silvia Helena Couto', 'professor', 'Professora', ['s003']],
    ['Jorge Luiz Amaral', 'professor', 'Professor', ['s004', 's005']],
    ['Denise Carvalho Lins', 'professor', 'Professora', ['s005', 's004']],
    ['Kátia Moraes Brandão', 'professor', 'Professora de Inglês', ['s006']],
    ['Paula Fontes Rezende', 'professor', 'Professora de Artes', ['s007']],
    ['Eduardo Saraiva Pacheco', 'professor', 'Professor de Educação Física', ['s008']],
    ['Tereza Cristina Lobo', 'professor', 'Professora', ['s001', 's004']],
    ['Aline Gomes Teixeira', 'professor', 'Professora da Educação Infantil', []],
    ['Bruna Siqueira Melo', 'auxiliar', 'Auxiliar de classe', []],
    ['Daniele Freire Costa', 'auxiliar', 'Auxiliar de classe', []],
    ['Vera Lúcia Batista', 'portaria', 'Recepção', []],
    ['Simone Antunes Reis', 'nutricionista', 'Nutricionista', []],
  ];

  const parecer = (name, r) => {
    const n = name.split(' ')[0];
    const a = r.pick([
      `${n} participa das rodas de conversa com interesse e já relata acontecimentos do fim de semana em sequência.`,
      `${n} demonstra curiosidade nas atividades de exploração e gosta de investigar materiais da natureza.`,
      `${n} está mais seguro(a) nas brincadeiras de movimento, sobe e desce do trepa-trepa com autonomia.`,
    ]);
    const b = r.pick([
      'Reconhece as letras do próprio nome e começa a registrar o nome sem apoio.',
      'Conta objetos até 10 com correspondência um a um e compara quantidades.',
      'Cuida dos próprios pertences e ajuda na organização da sala.',
    ]);
    const c = r.pick([
      'Seguiremos estimulando a escuta atenta nos momentos de história.',
      'Vamos trabalhar a espera da vez nas brincadeiras em grupo.',
      'Continuaremos incentivando o registro por meio de desenhos.',
    ]);
    return `${a} ${b} ${c}`;
  };

  /**
   * Escola de exemplo completa. Devolve { state, meta } — `meta` traz o que fica fora do estado
   * (últimos acessos, aceites de privacidade e leituras "visualizado").
   */
  const demoWithMeta = (today = util.today()) => {
    const r = util.rng(20260214);
    const T = today;
    const st = empty(T);
    const s = st.settings;
    const year = s.year;
    const meta = { logins: {}, consents: {}, reads: [] };
    const S = (n) => num('s', n);
    Object.assign(s, {
      schoolName: 'Colégio Ipê Amarelo',
      cnpj: '12.345.678/0001-90',
      phone: '(11) 3456-7890',
      address: 'Rua das Acácias, 450 — Jardim América',
      defaultFee: 890,
      pixKey: 'financeiro@ipeamarelo.edu.br',
      demo: true,
      privacy: { controller: 'Colégio Ipê Amarelo Ltda.', dpoName: 'Ana Beatriz Moura', dpoContact: 'privacidade@ipeamarelo.edu.br', noticeVersion: '1' },
    });
    for (let t = 1; t < s.term; t++) s.terms[year][t] = { closed: true, released: true };
    // horário de Brasília (UTC−3) convertido para um instante UTC válido (17h → 20:00Z; 22h → 01:00Z do dia seguinte)
    const stamp = (d, h = 10, m = 0) => new Date(Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8, 10)), h + 3, m)).toISOString();
    let userSeq = 0;
    const newUser = (o) => ({
      id: num('u', ++userSeq),
      title: '',
      email: '',
      phone: '',
      status: 'ativo',
      login: true,
      validUntil: null,
      grants: [],
      revokes: [],
      scope: 'todas',
      segments: [],
      classIds: [],
      linkedStudentIds: [],
      subjectIds: [],
      area: null,
      createdAt: `${year}-01-20T12:00:00.000Z`,
      ...o,
    });

    // ---------- equipe ----------
    STAFF.forEach(([name, role, title, subj]) => {
      const parts = norm(name).split(' ');
      const u = newUser({
        name,
        title,
        role,
        email: `${parts[0]}.${parts[parts.length - 1]}@ipeamarelo.edu.br`.replace(/[^a-z0-9.@]/g, ''),
        phone: maskPhone(`119${r.int(6000, 9999)}${r.int(1000, 9999)}`),
        scope: ['professor', 'auxiliar'].includes(role) ? 'vinculos' : 'todas',
        subjectIds: subj,
        area: { psicologo: 'psicologia', psicopedagogo: 'psicopedagogia', orientador: 'orientacao' }[role] || null,
      });
      st.users.push(u);
      meta.logins[u.id] = stamp(addDays(T, -r.int(0, 3)), r.int(7, 17), r.int(0, 59));
    });
    const byName = (n) => st.users.find((u) => u.name.startsWith(n)).id;
    s.ownerId = byName('Ana Beatriz');
    const intern = newUser({ name: 'Igor Matias Duarte', title: 'Estagiário de Pedagogia', role: 'estagiario', email: 'igor.duarte@ipeamarelo.edu.br', phone: maskPhone('11987001122'), scope: 'vinculos', validUntil: `${year}-12-15` });
    st.users.push(intern);

    // ---------- turmas ----------
    const teachersFor = (sid) => st.users.filter((u) => u.role === 'professor' && u.subjectIds.includes(sid));
    CLASSES.forEach((c, i) => {
      const subjMap = {};
      const infantil = c.segment === 'Educação Infantil';
      st.subjects.forEach((sub) => {
        if (infantil && ![S(1), S(2), S(7), S(8)].includes(sub.id)) return;
        const opts = teachersFor(sub.id);
        subjMap[sub.id] = infantil && [S(1), S(2)].includes(sub.id) ? null : opts.length ? opts[(i + 2) % opts.length].id : null;
      });
      let teacherId = subjMap[S(1)] || null;
      if (infantil) teacherId = byName('Aline');
      if (c.segment === 'Fundamental I') {
        teacherId = [byName('Tereza'), byName('Cláudia'), byName('Helena')][i - 1];
        // no Fundamental I a regente dá Português, Matemática, Ciências, História e Geografia
        [S(1), S(2), S(3), S(4), S(5)].forEach((sid) => (subjMap[sid] = teacherId));
      }
      const pool = [];
      st.subjects.forEach((sub) => {
        if (!(sub.id in subjMap)) return;
        for (let k = 0; k < sub.weekly; k++) pool.push(sub.id);
      });
      const shuffled = r.shuffle(pool);
      const schedule = [0, 1, 2, 3, 4].map((d) => [0, 1, 2, 3, 4].map((p) => shuffled[(d * 5 + p) % shuffled.length] || ''));
      st.classes.push({
        id: num('c', i + 1),
        name: c.name,
        year,
        status: 'ativa',
        segment: c.segment,
        shift: c.shift,
        room: c.room,
        capacity: c.size < 20 ? 20 : c.size < 22 ? 25 : 30,
        teacherId,
        assistantIds: infantil ? [byName('Bruna')] : i === 1 ? [byName('Daniele')] : [],
        subjects: subjMap,
        schedule,
      });
    });
    intern.classIds = [st.classes[0].id];
    const C = (n) => st.classes[n - 1].id;

    // ---------- alunos e responsáveis ----------
    let seq = 1;
    const used = new Set();
    const newGuardian = (surname, mom) => {
      const first = r.pick(mom ? ADULT_F : ADULT_M);
      const name = `${first} ${r.pick(SUR)} ${surname}`;
      return { id: util.uid('g'), name, relation: mom ? 'Mãe' : 'Pai', phone: maskPhone(`119${r.int(6000, 9999)}${r.int(1000, 9999)}`), email: `${norm(first)}.${norm(surname)}${r.int(1, 99)}@email.com`, cpf: '', pedagogico: true, financeiro: true, podeBuscar: true, bloqueado: false, userId: null };
    };
    CLASSES.forEach((c, ci) => {
      const klass = st.classes[ci];
      for (let k = 0; k < c.size; k++) {
        const fem = r.chance(0.5);
        let name;
        do {
          const s1 = r.pick(SUR);
          let s2 = r.pick(SUR);
          if (s2 === s1) s2 = r.pick(SUR);
          name = `${r.pick(fem ? FEM : MASC)} ${s1} ${s2}`;
        } while (used.has(name));
        used.add(name);
        const last = name.split(' ').pop();
        const guardians = [newGuardian(last, r.chance(0.75))];
        if (r.chance(0.35)) {
          const other = newGuardian(last, guardians[0].relation !== 'Mãe');
          if (r.chance(0.5)) other.financeiro = false; // pais separados: só um é responsável financeiro
          guardians.push(other);
        }
        st.students.push({
          id: num('a', seq, 4),
          enrollment: `${year}${String(seq).padStart(4, '0')}`,
          name,
          birth: `${year - c.age - (r.chance(0.35) ? 1 : 0)}-${pad(r.int(1, 12))}-${pad(r.int(1, 28))}`,
          gender: fem ? 'F' : 'M',
          cpf: '',
          classId: klass.id,
          status: 'ativo',
          photo: null,
          address: `${r.pick(STREETS)}, ${r.int(12, 1890)} — ${r.pick(HOODS)}`,
          imageConsent: r.chance(0.85),
          noDigitalAccess: false,
          guardians,
          pickup: c.age <= 10 && r.chance(0.5) ? [{ id: util.uid('k'), name: `${r.pick(ADULT_F)} ${r.pick(SUR)} ${last}`, relation: 'Avó', document: `RG ${r.int(10, 59)}.${r.int(100, 999)}.${r.int(100, 999)}-${r.int(0, 9)}`, phone: maskPhone(`119${r.int(6000, 9999)}${r.int(1000, 9999)}`) }] : [],
          restrictions: '',
          alerts: r.chance(0.14) ? r.pick(ALERTS) : '',
          health: '',
          notes: '',
          fee: s.defaultFee,
          discount: r.chance(0.12) ? r.pick([10, 15, 20, 50]) : 0,
          joinedAt: `${year}-01-${pad(r.int(10, 30))}`,
          history: [],
        });
        seq++;
      }
    });
    s.nextSeq = seq;
    const A = (n) => st.students[n];
    A(8).status = 'trancado';
    A(45).status = 'transferido';
    A(85).health = 'TDAH, em acompanhamento neurológico. Metilfenidato 10 mg pela manhã (tomado em casa).';
    A(60).health = 'Diabetes tipo 1. Mede a glicemia antes do lanche; a família deixou o kit na secretaria.';
    A(60).alerts = 'Diabetes tipo 1: em caso de tontura ou suor frio, oferecer o sachê de glicose e chamar a enfermaria.';
    A(33).notes = 'Pais em processo de separação. Combinado com a mãe: qualquer recado importante vai para os dois responsáveis.';
    A(33).restrictions = 'Somente a mãe e a avó materna podem retirar a criança (decisão judicial arquivada na secretaria).';
    A(33).guardians.forEach((g) => (g.podeBuscar = g.relation === 'Mãe'));
    A(17).noDigitalAccess = true;
    // irmãos: compartilham os responsáveis
    [[18, 39], [81, 130]].forEach(([a, b]) => {
      const X = A(a), Y = A(b);
      if (!X || !Y) return;
      Y.guardians = X.guardians.map((g) => ({ ...g, id: util.uid('g') }));
      Y.name = `${Y.name.split(' ')[0]} ${X.name.split(' ').slice(1).join(' ')}`;
      Y.address = X.address;
    });

    // contas de família: ~75% dos responsáveis principais e ~60% dos segundos; mesmo celular = mesma conta
    const accountByPhone = new Map();
    st.students.forEach((stu) => {
      if (stu.noDigitalAccess) return;
      stu.guardians.forEach((g, gi) => {
        if (!g.pedagogico || (gi === 0 ? !r.chance(0.78) : !r.chance(0.6))) return;
        let u = accountByPhone.get(g.phone);
        if (!u) {
          u = newUser({ name: g.name, role: 'responsavel', email: g.email, phone: g.phone, scope: 'vinculos', createdAt: `${year}-02-0${r.int(1, 9)}T12:00:00.000Z` });
          accountByPhone.set(g.phone, u);
          st.users.push(u);
          meta.logins[u.id] = stamp(addDays(T, -r.int(0, 6)), r.int(6, 21), r.int(0, 59));
          meta.consents[u.id] = { at: `${year}-02-10T12:00:00.000Z`, version: '1' };
        }
      });
    });
    st.students.forEach((stu) => stu.guardians.forEach((g) => {
      const u = accountByPhone.get(g.phone);
      if (u) g.userId = u.id;
    }));
    const famOf = (sid) => {
      const stu = st.students.find((x) => x.id === sid);
      return stu ? stu.guardians.filter((g) => g.userId) : [];
    };

    // perfil de cada aluno, para notas e frequência coerentes
    const profile = {};
    st.students.forEach((a) => {
      profile[a.id] = { base: clamp(5.2 + r() * 4.6 + (r.chance(0.08) ? -2 : 0), 2.5, 9.8), absent: r.chance(0.08) ? 0.16 + r() * 0.12 : 0.02 + r() * 0.05 };
    });
    const activeStudents = st.students.filter((x) => x.status === 'ativo');

    // ---------- frequência ----------
    const isSchoolDay = (d) => weekday(d) > 0 && weekday(d) < 6 && !holidayName(d);
    const days = [];
    for (let cursor = addDays(T, -1); days.length < 30; cursor = addDays(cursor, -1)) if (isSchoolDay(cursor)) days.push(cursor);
    const doneToday = new Set([C(1), C(2), C(3)]);
    const allDays = isSchoolDay(T) ? [T, ...days] : days;
    st.classes.forEach((c) => {
      const kids = activeStudents.filter((a) => a.classId === c.id);
      const mode = (s.segments[c.segment] || {}).attendance;
      allDays.forEach((d) => {
        const dayMarks = {};
        kids.forEach((a) => (dayMarks[a.id] = r() < profile[a.id].absent ? (r.chance(0.25) ? 'J' : 'F') : 'P'));
        const periods = mode === 'por_aula' ? [1, 2, 3, 4, 5] : [0];
        periods.forEach((p) => {
          if (d === T && !doneToday.has(c.id) && !(mode === 'por_aula' && p <= 2)) return;
          const subjectId = p ? c.schedule[weekday(d) - 1][p - 1] || null : null;
          st.attendance[`${c.id}|${d}|${p}`] = {
            marks: { ...dayMarks },
            subjectId,
            content: p && r.chance(0.7) ? r.pick(['Correção dos exercícios e explicação do conteúdo novo.', 'Leitura compartilhada e interpretação.', 'Atividade em grupo e apresentação.', 'Revisão para a avaliação.', 'Resolução de problemas no caderno.']) : '',
            by: (p ? c.subjects[subjectId] : null) || c.teacherId || byName('Fernanda'),
            at: stamp(d, p ? 6 + p : 8, r.int(0, 59)),
          };
        });
      });
    });

    // ---------- notas e pareceres ----------
    const curTerm = s.term;
    st.classes.forEach((c, ci) => {
      const kids = activeStudents.filter((a) => a.classId === c.id);
      if ((s.segments[c.segment] || {}).evaluation === 'parecer') {
        for (let term = 1; term < curTerm; term++) kids.forEach((a) => (st.grades[`${year}|${a.id}|_parecer|${term}`] = parecer(a.name, r)));
        return;
      }
      Object.keys(c.subjects).forEach((sid, si) => {
        for (let term = 1; term <= curTerm; term++) {
          if (term === curTerm && (si + ci) % 3 !== 0) continue;
          kids.forEach((a) => {
            const v = clamp(profile[a.id].base + (r() - 0.5) * 3 + (sid === S(2) ? -0.4 : 0), 0, 10);
            st.grades[`${year}|${a.id}|${sid}|${term}`] = Math.round(v * 2) / 2;
            // recuperação da etapa para quem ficou abaixo da média nas etapas fechadas
            if (term < curTerm && v < s.passing && r.chance(0.7)) st.grades[`${year}|${a.id}|${sid}|rec${term}`] = Math.round(clamp(v + 1 + r() * 2.5, 0, 10) * 2) / 2;
          });
        }
      });
    });

    // ---------- mensalidades ----------
    const curMonth = T.slice(0, 7);
    let invSeq = 1;
    const finance = byName('Paulo');
    st.students.forEach((a) => {
      const late = profile[a.id].base < 5.8 && r.chance(0.45) ? 1 : r.chance(0.06) ? 1 : 0;
      const amount = Math.round(a.fee * (1 - a.discount / 100) * 100) / 100;
      for (let m = `${year}-02`; m <= curMonth; m = addMonths(m, 1)) {
        if (a.status !== 'ativo' && m > `${year}-06`) break;
        const due = `${m}-${pad(s.dueDay)}`;
        const monthsAgo = Number(curMonth.slice(5)) - Number(m.slice(5));
        let paidAt = null, method = null;
        if (due < T) {
          if (!(late && monthsAgo <= (r.chance(0.5) ? 2 : 1))) {
            paidAt = addDays(due, r.int(-8, 3));
            method = r.pick(['Pix', 'Pix', 'Pix', 'Boleto', 'Boleto', 'Cartão', 'Dinheiro']);
          }
        } else if (r.chance(0.38)) {
          paidAt = addDays(T, -r.int(0, 4));
          method = r.pick(['Pix', 'Pix', 'Boleto', 'Cartão']);
        }
        const inv = { id: num('i', invSeq++, 5), studentId: a.id, month: m, kind: 'mensalidade', description: `Mensalidade de ${util.monthName(m)}`, amount, due, paidAt, method, reversals: [] };
        if (paidAt) Object.assign(inv, { paidAmount: amount, receivedBy: finance });
        st.invoices.push(inv);
      }
    });

    // ---------- calendário e comunicados ----------
    const nextWeekday = (from, wd) => {
      let d = from;
      while (weekday(d) !== wd) d = addDays(d, 1);
      return d;
    };
    const aud = (who = 'todos', classIds = [], segments = []) => ({ who, classIds, segments });
    const coord = byName('Fernanda');
    const ev = (title, date, type, audience, extra = {}) => st.events.push({ id: num('e', st.events.length + 1), title, date, type, time: '', audience, notes: '', authorId: coord, ...extra });
    ev('Reunião de pais e mestres', nextWeekday(addDays(T, 2), 4), 'reuniao', aud('familias'), { time: '19:00', notes: 'No auditório. Entrega dos boletins do bimestre.' });
    ev('Prova de Matemática', nextWeekday(addDays(T, 1), 2), 'prova', aud('todos', [C(5)]), { time: '13:30' });
    ev('Prova de Ciências', nextWeekday(addDays(T, 3), 3), 'prova', aud('todos', [C(7)]), { time: '14:20' });
    ev('Entrega do trabalho de História', nextWeekday(addDays(T, 5), 5), 'prazo', aud('todos', [C(6)]));
    ev('Feira de Ciências', nextWeekday(addDays(T, 16), 6), 'evento', aud('todos'), { time: '09:00', notes: 'Aberta à comunidade. Montagem dos estandes na sexta.' });
    ev('Conselho de classe', nextWeekday(addDays(T, 20), 3), 'reuniao', aud('equipe'), { time: '17:30', notes: 'Pauta: alunos em recuperação e infrequentes.' });
    const passeioDate = nextWeekday(addDays(T, 9), 5);
    ev('Passeio ao Museu Catavento', passeioDate, 'evento', aud('todos', [C(4)]), { time: '08:00', notes: 'Autorização pela agenda até a véspera.' });
    ev('Simulado do ENEM', nextWeekday(addDays(T, 12), 6), 'prova', aud('todos', [C(8)]), { time: '08:00' });
    ev('Formação de professores (sem aula para os alunos)', nextWeekday(addDays(T, 25), 5), 'evento', aud('todos'), { time: '08:00' });
    ev('Dia da família na Educação Infantil', nextWeekday(addDays(T, 11), 6), 'evento', aud('todos', [], ['Educação Infantil']), { time: '09:00' });

    const nt = (title, body, audience, daysAgo, pinned = false, authorId = s.ownerId) => {
      const date = addDays(T, -daysAgo);
      st.notices.push({ id: num('n', st.notices.length + 1), title, body, audience, pinned, date, authorId, createdAt: stamp(date, 9), updatedAt: stamp(date, 9) });
    };
    nt('Reunião de pais e mestres', 'Senhores responsáveis,\n\nConvidamos para a reunião de pais e mestres na próxima quinta-feira, às 19h, no auditório. Na ocasião entregaremos os boletins e conversaremos sobre o andamento do bimestre.\n\nContamos com a presença de todos.', aud('familias'), 1, true);
    nt('Feriado de Nossa Senhora Aparecida', 'Informamos que no dia 12 de outubro não haverá aula por conta do feriado nacional. As atividades retornam normalmente no dia seguinte.', aud('todos'), 3);
    nt('Uniforme de Educação Física', 'A partir da próxima semana, o uso do uniforme completo será obrigatório nas aulas de Educação Física.', aud('familias', [], ['Fundamental I', 'Fundamental II', 'Ensino Médio']), 12);
    nt('Planejamento do 4º bimestre', 'Equipe, os planejamentos do 4º bimestre devem ser enviados à coordenação até sexta-feira. Lembrem de registrar o conteúdo das aulas na chamada.', aud('equipe'), 4, false, coord);

    // ---------- agenda do aluno ----------
    let dSeq = 1;
    const recipientsOf = (classId, studentId) => (studentId ? [studentId] : activeStudents.filter((a) => a.classId === classId).map((a) => a.id));
    const item = (o) => {
      const id = num('d', dSeq++, 4);
      const it = { id, groupId: id, studentId: null, category: null, subjectId: null, body: '', due: null, respondBy: null, requireAck: false, internal: false, attachments: [], status: 'publicado', publishAt: null, authorId: coord, ...o };
      it.recipients = recipientsOf(it.classId, it.studentId);
      it.createdAt = it.createdAt || stamp(it.date, 15, r.int(0, 59));
      it.updatedAt = it.createdAt;
      st.diary.push(it);
      return it;
    };
    const recent = days.slice(0, 8).reverse();
    st.classes.forEach((c) => {
      const kids = activeStudents.filter((a) => a.classId === c.id);
      const infantil = c.segment === 'Educação Infantil';
      if (!infantil) {
        recent.concat(isSchoolDay(T) ? [T] : []).forEach((d, di) => {
          if (d === T && c.id !== C(2)) return;
          const subs = Object.keys(c.subjects);
          const sid = subs[(di + c.name.length) % subs.length];
          item({
            type: 'dever', classId: c.id, subjectId: sid, date: d, due: addDays(d, weekday(d) === 5 ? 3 : 1), authorId: c.subjects[sid] || c.teacherId,
            title: r.pick(['Exercícios do livro', 'Leitura e resumo', 'Lista de exercícios', 'Pesquisa', 'Revisão do conteúdo']),
            body: r.pick(['Fazer os exercícios das páginas 48 e 49 do livro.', 'Ler o capítulo 5 e escrever um resumo de 10 linhas no caderno.', 'Resolver a lista entregue em sala (questões 1 a 8).', 'Pesquisar três curiosidades sobre o tema da aula e trazer anotadas.', 'Revisar o conteúdo da semana: haverá correção coletiva.']),
          });
        });
        item({ type: 'lembrete', classId: c.id, date: recent[recent.length - 2], title: 'Avaliação na próxima semana', body: 'Estudar o conteúdo do bimestre. Trazer lápis, borracha e caneta azul.', requireAck: true, authorId: c.teacherId || coord });
      } else {
        item({ type: 'recado', classId: c.id, date: recent[recent.length - 3], title: 'Pijama day na sexta', body: 'Na sexta-feira as crianças podem vir de pijama para o cineminha da turma. Mandar um travesseiro pequeno.', authorId: c.teacherId, requireAck: true });
      }
      item({ type: 'recado', classId: c.id, date: recent[recent.length - 1], title: 'Material para a aula de Artes', body: 'Enviar na mochila uma caixa de sapato vazia e revistas velhas para recorte.', requireAck: true, authorId: c.subjects[S(7)] || c.teacherId || coord });
      const kid = kids[3];
      if (kid) item({ type: 'ocorrencia', category: 'elogio', classId: c.id, studentId: kid.id, date: recent[recent.length - 1], title: 'Destaque da semana', body: `${kid.name.split(' ')[0]} ajudou os colegas na atividade em grupo e apresentou o trabalho com muita segurança. Parabéns!`, requireAck: true, authorId: c.teacherId || coord });
      const kid2 = kids[6];
      if (kid2 && !infantil) item({ type: 'ocorrencia', category: 'tarefa', classId: c.id, studentId: kid2.id, date: recent[recent.length - 2], title: 'Tarefa não entregue', body: 'O dever de casa de ontem não foi entregue. Pedimos que acompanhem a agenda e a organização dos estudos em casa.', requireAck: true, authorId: c.teacherId || coord });
    });
    const passeio = item({ type: 'autorizacao', classId: C(4), date: addDays(T, -2), title: 'Autorização: passeio ao Museu Catavento', body: `Passeio pedagógico no dia ${passeioDate.split('-').reverse().join('/')}. Saída às 8h e retorno previsto às 12h30, de ônibus fretado. Enviar lanche e garrafa de água.`, respondBy: addDays(passeioDate, -1), requireAck: true, authorId: byName('Helena') });
    if (isSchoolDay(T)) item({ type: 'dever', classId: C(5), subjectId: S(2), date: T, due: addDays(T, 2), title: 'Lista de frações', body: 'Resolver os exercícios 1 a 10 da lista de frações (folha entregue em aula).', status: 'agendado', publishAt: `${T}T21:00:00.000Z`, authorId: byName('Marcos') });

    // cientes, respostas (por responsável) e leituras
    st.diary.forEach((d) => {
      if (d.status !== 'publicado') return;
      d.recipients.forEach((sid) => {
        famOf(sid).forEach((g) => {
          if (r.chance(0.82)) meta.reads.push([d.id, g.userId, stamp(d.date, r.int(17, 21), r.int(0, 59))]);
          if (d.requireAck && r.chance(d.type === 'autorizacao' ? 0.7 : 0.65)) {
            const byItem = st.acks[d.id] || (st.acks[d.id] = {});
            const bySt = byItem[sid] || (byItem[sid] = {});
            bySt[g.id] = { answer: d.type === 'autorizacao' ? (r.chance(0.92) ? 'sim' : 'nao') : undefined, origin: 'portal', by: g.userId, at: stamp(d.date, r.int(18, 22), r.int(0, 59)) };
            if (bySt[g.id].answer === undefined) delete bySt[g.id].answer;
          }
        });
      });
    });
    const paperKid = activeStudents.find((a) => a.classId === C(4) && !famOf(a.id).length);
    if (paperKid) {
      const byItem = st.acks[passeio.id] || (st.acks[passeio.id] = {});
      byItem[paperKid.id] = { [paperKid.guardians[0].id]: { answer: 'sim', origin: 'escola', by: byName('Helena'), at: stamp(addDays(T, -1), 8, 10), note: 'Autorização assinada no papel.' } };
    }

    // ---------- rotina da Educação Infantil ----------
    const infKids = activeStudents.filter((a) => a.classId === C(1));
    days.slice(0, 5).concat(isSchoolDay(T) ? [T] : []).forEach((d) => {
      infKids.forEach((a) => {
        const fields = {};
        ROUTINE_FIELDS.forEach((f) => (fields[f.key] = d === T && ['lanche_tarde', 'sono'].includes(f.key) ? '' : r.pick(f.options.slice(0, r.chance(0.8) ? 2 : f.options.length))));
        st.routines[`${C(1)}|${d}|${a.id}`] = {
          fields,
          bring: r.chance(0.2) ? [r.pick(['Muda de roupa', 'Lenço umedecido', 'Agasalho'])] : [],
          note: r.chance(0.15) ? r.pick(['Brincou muito no parque hoje!', 'Pediu para ler a história de novo.', 'Estava com saudade de casa depois do almoço, mas logo se animou.']) : '',
          by: r.chance(0.5) ? byName('Bruna') : byName('Aline'),
          at: stamp(d, 15, r.int(0, 59)),
          sentAt: d === T ? null : stamp(d, 16, 30),
        };
      });
    });

    // ---------- mensagens das famílias ----------
    let pSeq = 1;
    const msg = (sid, kind, subject, details, body, daysAgo, replies = [], status = 'aberta') => {
      const fam = famOf(sid)[0];
      if (!fam) return;
      const at = stamp(addDays(T, -daysAgo), 7, r.int(0, 50));
      st.messages.push({
        id: num('m', st.messages.length + 1), studentId: sid, kind, subject, details, attachments: [], status, createdBy: fam.userId, createdAt: at,
        posts: [{ id: num('p', pSeq++), kind: 'texto', userId: fam.userId, body, at }].concat(replies.map(([uid, text, kind2], i) => ({ id: num('p', pSeq++), kind: kind2 || 'texto', userId: uid, body: text, at: stamp(addDays(T, -daysAgo), 9 + i, 15) }))),
      });
    };
    const withFam = activeStudents.filter((a) => famOf(a.id).length);
    const firstIn = (cid, skip = 0) => withFam.filter((a) => a.classId === cid)[skip] || withFam[0];
    msg(firstIn(C(2)).id, 'falta', 'Falta amanhã', { date: addDays(T, 1) }, 'Bom dia! Amanhã ele não irá à aula porque tem consulta no dentista às 9h. Obrigada.', 0);
    msg(firstIn(C(1)).id, 'busca', 'Quem vai buscar hoje', { date: T, person: 'Maria Aparecida (avó)', document: 'RG 23.456.789-0' }, 'Hoje quem vai buscar é a avó, Maria Aparecida. Ela leva o documento.', 0, [[byName('Bruna'), 'Combinado! Vamos conferir o documento na saída.']], 'respondida');
    msg(firstIn(C(1), 1).id, 'medicacao', 'Antitérmico se tiver febre', { medicine: 'Paracetamol gotas', dose: '15 gotas', schedule: 'Se a febre passar de 37,8 °C', until: addDays(T, 2) }, 'Ela acordou um pouco quente. Se tiver febre, por favor dar 15 gotas de paracetamol (o vidro está na mochila) e me avisar.', 1, [[byName('Aline'), 'Recebido. Vamos acompanhar a temperatura e avisamos.'], [byName('Aline'), 'Medicado às 14h10 com 15 gotas (temperatura 38,1 °C). Está bem e brincando.', 'registro']], 'resolvida');
    msg(firstIn(C(6)).id, 'recado', 'Dúvida sobre o trabalho de História', {}, 'Boa tarde, o trabalho de História pode ser feito em dupla?', 2, [[byName('Jorge'), 'Pode sim, em dupla ou trio. Entrega na sexta.']], 'respondida');

    // ---------- atendimentos e planos ----------
    const sup = (stu, author, area, type, confidentiality, daysAgo, content, nextSteps) => st.support.push({ id: num('r', st.support.length + 1), studentId: stu.id, area, date: addDays(T, -daysAgo), type, confidentiality, content, nextSteps, authorId: author, createdAt: stamp(addDays(T, -daysAgo), 14), addenda: [] });
    const psi = byName('Júlia'), ppd = byName('Mariana'), ori = byName('Luciana');
    sup(A(85), psi, 'psicologia', 'atendimento', 'autor', 9, 'Relata dificuldade para dormir e preocupação com as provas. Trabalhamos estratégias de respiração e de organização da rotina de estudos.', 'Novo encontro em 15 dias. Conversar com a família sobre a rotina de sono.');
    sup(A(85), psi, 'psicologia', 'familia', 'autor', 4, 'Mãe informa acompanhamento neurológico e ajuste recente de medicação. Combinado retorno quinzenal.', 'Devolutiva à coordenação sobre adaptações de prova (sem detalhes clínicos).');
    sup(A(70), ppd, 'psicopedagogia', 'observacao', 'area', 6, 'Dificuldade na leitura de enunciados longos; troca de letras na escrita espontânea. Boa compreensão quando a leitura é feita em voz alta.', 'Avaliação psicopedagógica com a família na próxima semana.');
    sup(A(33), ori, 'orientacao', 'atendimento', 'apoio', 3, 'Chorou no intervalo; conversamos sobre a mudança de casa. Está se adaptando à nova rotina.', 'Acompanhar nas próximas semanas e avisar a coordenação se houver queda de rendimento.');
    st.plans.push({ id: num('l', 1), studentId: A(70).id, title: 'Plano de acompanhamento — leitura e escrita', status: 'ativo', start: addDays(T, -40), goals: 'Ampliar a fluência leitora e a autonomia na leitura de enunciados.', adaptations: 'Ler os enunciados em voz alta nas avaliações; tempo adicional de 20 minutos; uma pergunta por item.', sharedWith: { professores: true, coordenacao: true, familia: true }, authorId: ppd, updatedAt: stamp(addDays(T, -10), 11), familyAckAt: stamp(addDays(T, -8), 20) });
    st.plans.push({ id: num('l', 2), studentId: A(85).id, title: 'Plano de acompanhamento — atenção e organização', status: 'ativo', start: addDays(T, -60), goals: 'Apoiar a organização dos estudos e a atenção nas aulas expositivas.', adaptations: 'Sentar nas primeiras fileiras, longe da porta; dividir tarefas longas em etapas; avisar com antecedência as mudanças de rotina.', sharedWith: { professores: true, coordenacao: true, familia: false }, authorId: psi, updatedAt: stamp(addDays(T, -20), 11) });

    return { state: st, meta };
  };
  const demo = (today) => demoWithMeta(today).state;

  /** Contas exibidas em "Entrar como…" na demonstração. */
  const demoAccounts = (state) => {
    const pick = (fn) => state.users.find(fn);
    const famCount = (u) => state.students.filter((s) => (s.guardians || []).some((g) => g.userId === u.id)).length;
    const fam = state.users.filter((u) => u.role === 'responsavel').sort((a, b) => famCount(b) - famCount(a))[0];
    return [
      pick((u) => u.id === state.settings.ownerId),
      pick((u) => u.role === 'coordenador'),
      pick((u) => u.role === 'secretaria'),
      pick((u) => u.name.startsWith('Marcos')),
      pick((u) => u.name.startsWith('Aline')),
      pick((u) => u.role === 'auxiliar'),
      pick((u) => u.role === 'psicologo'),
      pick((u) => u.role === 'financeiro'),
      fam,
    ].filter(Boolean).map((u) => ({ id: u.id, name: u.name, role: u.role, title: u.title || '' }));
  };

  return { empty, demo, demoWithMeta, demoAccounts, subjects, SEGMENTS, ROUTINE_FIELDS, ROUTINE_BRING, currentTerm };
});
