'use strict';
/* Dados iniciais: uma escola vazia (configurações e disciplinas padrão) ou uma escola de exemplo completa,
   gerada a partir da data de hoje para que a demonstração sempre pareça atual. */
const Seed = (() => {
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

  const baseSettings = () => {
    const now = new Date();
    const m = now.getMonth() + 1;
    return {
      schoolName: 'Minha Escola',
      year: now.getFullYear(),
      term: m <= 4 ? 1 : m <= 7 ? 2 : m <= 9 ? 3 : 4,
      passing: 6,
      recovery: 4,
      minAttendance: 75,
      defaultFee: 850,
      dueDay: 10,
      lateFine: 2,
      lateInterest: 1,
      nextSeq: 1,
      demo: false,
      bannerClosed: false,
    };
  };

  const subjects = () =>
    DEFAULT_SUBJECTS.map(([name, short, color, weekly], i) => ({ id: 's' + (i + 1), name, short, color, weekly }));

  const empty = () => ({
    version: 1,
    settings: baseSettings(),
    subjects: subjects(),
    teachers: [],
    classes: [],
    students: [],
    attendance: {},
    grades: {},
    invoices: [],
    events: [],
    notices: [],
    log: [],
  });

  // ---------- escola de exemplo ----------
  const FEM = ['Ana', 'Beatriz', 'Helena', 'Alice', 'Laura', 'Manuela', 'Valentina', 'Sophia', 'Isabela', 'Lívia', 'Giovanna', 'Maria Eduarda', 'Luiza', 'Cecília', 'Lorena', 'Yasmin', 'Clara', 'Mariana', 'Júlia', 'Heloísa', 'Rafaela', 'Esther', 'Lara', 'Agatha', 'Nicole', 'Isadora', 'Melissa', 'Bianca', 'Larissa', 'Antonella', 'Emanuelly', 'Raquel', 'Vitória', 'Pietra', 'Ayla', 'Maitê', 'Catarina', 'Gabriela', 'Fernanda', 'Letícia'];
  const MASC = ['Miguel', 'Arthur', 'Gael', 'Heitor', 'Theo', 'Davi', 'Bernardo', 'Gabriel', 'Ravi', 'Samuel', 'Pedro', 'Lucas', 'Benjamin', 'Matheus', 'Rafael', 'Joaquim', 'Enzo', 'Lorenzo', 'Nicolas', 'Guilherme', 'Henrique', 'Murilo', 'Isaac', 'Bryan', 'Caio', 'Vicente', 'Felipe', 'Daniel', 'João Pedro', 'Leonardo', 'Eduardo', 'Otávio', 'Vinícius', 'Benício', 'Anthony', 'Thiago', 'Emanuel', 'Diego', 'Kauã', 'Rodrigo'];
  const SUR = ['Silva', 'Santos', 'Oliveira', 'Souza', 'Rodrigues', 'Ferreira', 'Alves', 'Pereira', 'Lima', 'Gomes', 'Costa', 'Ribeiro', 'Martins', 'Carvalho', 'Almeida', 'Lopes', 'Soares', 'Fernandes', 'Vieira', 'Barbosa', 'Rocha', 'Dias', 'Nascimento', 'Andrade', 'Moreira', 'Nunes', 'Marques', 'Machado', 'Mendes', 'Freitas', 'Cardoso', 'Ramos', 'Gonçalves', 'Santana', 'Teixeira', 'Araújo', 'Correia', 'Pinto', 'Campos', 'Monteiro', 'Cavalcanti', 'Barros', 'Moura', 'Batista', 'Azevedo'];
  const ADULT_F = ['Patrícia', 'Juliana', 'Adriana', 'Fabiana', 'Renata', 'Camila', 'Vanessa', 'Aline', 'Daniela', 'Simone', 'Cristiane', 'Luciana', 'Tatiane', 'Priscila', 'Elaine', 'Sandra', 'Kátia', 'Mônica', 'Viviane', 'Roberta'];
  const ADULT_M = ['Marcelo', 'Rodrigo', 'Anderson', 'Fábio', 'Leandro', 'Ricardo', 'Alexandre', 'Márcio', 'Sérgio', 'André', 'Fernando', 'Paulo', 'Carlos', 'Luciano', 'Renato', 'Wagner', 'Júlio', 'Roberto', 'Flávio', 'Gustavo'];
  const STREETS = ['Rua das Acácias', 'Rua Ipê Roxo', 'Av. Brasil', 'Rua Sete de Setembro', 'Rua Dom Pedro II', 'Rua das Palmeiras', 'Av. Santos Dumont', 'Rua Tiradentes', 'Rua São João', 'Travessa da Matriz', 'Rua Monteiro Lobato', 'Rua Cecília Meireles'];
  const HOODS = ['Centro', 'Jardim América', 'Vila Nova', 'Santa Luzia', 'Boa Vista', 'Parque das Flores'];
  const HEALTH = ['Alergia a amendoim', 'Asma leve — usa bombinha', 'Intolerância à lactose', 'Usa óculos', 'Alergia a dipirona', 'Rinite alérgica'];

  const CLASSES = [
    { name: '1º ano A', segment: 'Fundamental I', shift: 'Manhã', room: 'Sala 3', age: 6, size: 18 },
    { name: '3º ano A', segment: 'Fundamental I', shift: 'Manhã', room: 'Sala 5', age: 8, size: 20 },
    { name: '5º ano A', segment: 'Fundamental I', shift: 'Manhã', room: 'Sala 7', age: 10, size: 22 },
    { name: '6º ano A', segment: 'Fundamental II', shift: 'Tarde', room: 'Sala 11', age: 11, size: 24 },
    { name: '7º ano B', segment: 'Fundamental II', shift: 'Tarde', room: 'Sala 12', age: 12, size: 21 },
    { name: '9º ano A', segment: 'Fundamental II', shift: 'Tarde', room: 'Sala 14', age: 14, size: 23 },
    { name: '1ª série EM', segment: 'Ensino Médio', shift: 'Manhã', room: 'Lab. 2', age: 15, size: 19 },
  ];

  const TEACHERS = [
    ['Cláudia Regina Prado', ['s1']],
    ['Marcos Vinícius Tavares', ['s2']],
    ['Helena Bastos Furtado', ['s1', 's7']],
    ['Roberto Ayres Nogueira', ['s2', 's3']],
    ['Silvia Helena Couto', ['s3']],
    ['Jorge Luiz Amaral', ['s4', 's5']],
    ['Denise Carvalho Lins', ['s5', 's4']],
    ['Kátia Moraes Brandão', ['s6']],
    ['Paula Fontes Rezende', ['s7']],
    ['Eduardo Saraiva Pacheco', ['s8']],
    ['Tereza Cristina Lobo', ['s1', 's4']],
  ];

  const demo = () => {
    const r = U.rng(20260214);
    const st = empty();
    const T = U.today();
    const year = Number(T.slice(0, 4));
    const s = st.settings;
    s.schoolName = 'Colégio Ipê Amarelo';
    s.year = year;
    s.demo = true;
    s.defaultFee = 890;

    // professores
    st.teachers = TEACHERS.map(([name, subj], i) => {
      const parts = U.norm(name).split(' ');
      return {
        id: 't' + (i + 1),
        name,
        email: `${parts[0]}.${parts[parts.length - 1]}@ipeamarelo.edu.br`.replace(/[^a-z0-9.@]/g, ''),
        phone: U.maskPhone(`119${r.int(6000, 9999)}${r.int(1000, 9999)}`),
        subjectIds: subj,
        status: 'ativo',
      };
    });
    const teachersFor = (sid) => st.teachers.filter((t) => t.subjectIds.includes(sid));

    // turmas
    st.classes = CLASSES.map((c, i) => {
      const subjMap = {};
      st.subjects.forEach((sub) => {
        const opts = teachersFor(sub.id);
        subjMap[sub.id] = opts.length ? opts[(i + sub.id.length) % opts.length].id : null;
      });
      // horário semanal: distribui as aulas da semana em 5 dias × 5 tempos
      const pool = [];
      st.subjects.forEach((sub) => {
        for (let k = 0; k < sub.weekly; k++) pool.push(sub.id);
      });
      const shuffled = r.shuffle(pool);
      const schedule = [0, 1, 2, 3, 4].map((d) => shuffled.slice(d * 5, d * 5 + 5));
      return {
        id: 'c' + (i + 1),
        name: c.name,
        segment: c.segment,
        shift: c.shift,
        room: c.room,
        capacity: c.size < 22 ? 25 : 30,
        teacherId: subjMap.s1 || st.teachers[0].id,
        subjects: subjMap,
        schedule,
        _age: c.age,
        _size: c.size,
      };
    });

    // alunos
    let seq = 1;
    const usedNames = new Set();
    st.classes.forEach((c) => {
      for (let k = 0; k < c._size; k++) {
        const fem = r.chance(0.5);
        let name;
        do {
          const first = r.pick(fem ? FEM : MASC);
          const s1 = r.pick(SUR);
          let s2 = r.pick(SUR);
          if (s2 === s1) s2 = r.pick(SUR);
          name = `${first} ${s1} ${s2}`;
        } while (usedNames.has(name));
        usedNames.add(name);
        const last = name.split(' ').pop();
        const mom = r.chance(0.72);
        const gName = `${r.pick(mom ? ADULT_F : ADULT_M)} ${r.pick(SUR)} ${last}`;
        const birthYear = year - c._age - (r.chance(0.35) ? 1 : 0);
        const birth = `${birthYear}-${U.pad(r.int(1, 12))}-${U.pad(r.int(1, 28))}`;
        const disc = r.chance(0.12) ? r.pick([10, 15, 20, 50]) : 0;
        st.students.push({
          id: 'a' + seq,
          enrollment: `${year}${String(seq).padStart(4, '0')}`,
          name,
          birth,
          gender: fem ? 'F' : 'M',
          cpf: '',
          classId: c.id,
          status: 'ativo',
          guardian: {
            name: gName,
            relation: mom ? 'Mãe' : 'Pai',
            phone: U.maskPhone(`119${r.int(6000, 9999)}${r.int(1000, 9999)}`),
            email: `${U.norm(gName.split(' ')[0])}.${U.norm(last)}${r.int(1, 99)}@email.com`,
          },
          address: `${r.pick(STREETS)}, ${r.int(12, 1890)} — ${r.pick(HOODS)}`,
          health: r.chance(0.14) ? r.pick(HEALTH) : '',
          notes: '',
          fee: s.defaultFee,
          discount: disc,
          joinedAt: `${year}-01-${U.pad(r.int(10, 30))}`,
        });
        seq++;
      }
    });
    // alguns casos reais de secretaria
    st.students[7].status = 'trancado';
    st.students[40].status = 'transferido';
    s.nextSeq = seq;

    const active = st.students.filter((a) => a.status === 'ativo');

    // perfil de cada aluno (para notas e frequência coerentes)
    const profile = {};
    st.students.forEach((a) => {
      const base = U.clamp(5.2 + r() * 4.6 + (r.chance(0.08) ? -2 : 0), 2.5, 9.8);
      const absent = r.chance(0.1) ? 0.18 + r() * 0.12 : 0.02 + r() * 0.06;
      profile[a.id] = { base, absent };
    });

    // frequência: últimos ~30 dias letivos; hoje só algumas turmas fizeram a chamada
    const isSchoolDay = (d) => U.weekday(d) > 0 && U.weekday(d) < 6 && !U.holidayName(d);
    const days = [];
    let cursor = U.addDays(T, -1);
    while (days.length < 30) {
      if (isSchoolDay(cursor)) days.push(cursor);
      cursor = U.addDays(cursor, -1);
    }
    const doneToday = new Set(['c1', 'c2', 'c3']);
    const allDays = isSchoolDay(T) ? [T, ...days] : days;
    st.classes.forEach((c) => {
      const kids = active.filter((a) => a.classId === c.id);
      allDays.forEach((d) => {
        if (d === T && !doneToday.has(c.id)) return;
        const marks = {};
        kids.forEach((a) => {
          const p = profile[a.id].absent;
          marks[a.id] = r() < p ? (r.chance(0.3) ? 'J' : 'F') : 'P';
        });
        st.attendance[`${c.id}|${d}`] = marks;
      });
    });

    // notas: bimestres anteriores completos; o atual pela metade
    const curTerm = s.term;
    st.classes.forEach((c, ci) => {
      const kids = active.filter((a) => a.classId === c.id);
      st.subjects.forEach((sub, si) => {
        for (let term = 1; term <= curTerm; term++) {
          if (term === curTerm && (si + ci) % 3 !== 0) continue;
          kids.forEach((a) => {
            const v = U.clamp(profile[a.id].base + (r() - 0.5) * 3 + (si === 1 ? -0.4 : 0), 0, 10);
            st.grades[`${a.id}|${sub.id}|${term}`] = Math.round(v * 2) / 2;
          });
        }
      });
    });

    // mensalidades: de fevereiro até o mês atual
    const curMonth = T.slice(0, 7);
    const startMonth = `${year}-02`;
    let invSeq = 1;
    st.students.forEach((a) => {
      const prof = profile[a.id];
      const late = prof.base < 5.8 && r.chance(0.45) ? 1 : r.chance(0.07) ? 1 : 0;
      for (let m = startMonth; m <= curMonth; m = U.addMonths(m, 1)) {
        if (a.status !== 'ativo' && m > `${year}-06`) break;
        const due = `${m}-${U.pad(s.dueDay)}`;
        const amount = Math.round(a.fee * (1 - a.discount / 100) * 100) / 100;
        const monthsAgo = (Number(curMonth.slice(5)) - Number(m.slice(5)));
        let paidAt = null;
        let method = null;
        if (due < T) {
          const unpaid = late && monthsAgo <= (r.chance(0.5) ? 2 : 1);
          if (!unpaid) {
            paidAt = U.addDays(due, r.int(-8, 3));
            method = r.pick(['Pix', 'Pix', 'Pix', 'Boleto', 'Boleto', 'Cartão', 'Dinheiro']);
          }
        } else if (r.chance(0.38)) {
          paidAt = U.addDays(T, -r.int(0, 4));
          method = r.pick(['Pix', 'Pix', 'Boleto', 'Cartão']);
        }
        st.invoices.push({
          id: 'f' + invSeq++,
          studentId: a.id,
          month: m,
          description: `Mensalidade de ${U.monthName(m)}`,
          amount,
          due,
          paidAt,
          method,
        });
      }
    });

    // agenda
    const nextWeekday = (from, wd) => {
      let d = from;
      while (U.weekday(d) !== wd) d = U.addDays(d, 1);
      return d;
    };
    const ev = (title, date, type, extra = {}) => st.events.push({ id: U.uid(), title, date, type, time: '', classId: null, notes: '', ...extra });
    ev('Reunião de pais e mestres', nextWeekday(U.addDays(T, 2), 4), 'reuniao', { time: '19:00', notes: 'No auditório. Entrega dos boletins do bimestre.' });
    ev('Prova de Matemática', nextWeekday(U.addDays(T, 1), 2), 'prova', { classId: 'c4', time: '13:30' });
    ev('Prova de Ciências', nextWeekday(U.addDays(T, 3), 3), 'prova', { classId: 'c6', time: '14:20' });
    ev('Entrega do trabalho de História', nextWeekday(U.addDays(T, 5), 5), 'prazo', { classId: 'c5' });
    ev('Feira de Ciências', nextWeekday(U.addDays(T, 16), 6), 'evento', { time: '09:00', notes: 'Aberta à comunidade. Montagem dos estandes na sexta.' });
    ev('Conselho de classe', nextWeekday(U.addDays(T, 20), 3), 'reuniao', { time: '17:30' });
    ev('Passeio ao Museu Catavento', nextWeekday(U.addDays(T, 9), 5), 'evento', { classId: 'c3', time: '08:00', notes: 'Autorização assinada até a véspera.' });
    ev('Simulado do ENEM', nextWeekday(U.addDays(T, 12), 6), 'prova', { classId: 'c7', time: '08:00' });
    ev('Prova de Português', nextWeekday(U.addDays(T, -6), 2), 'prova', { classId: 'c4', time: '13:30' });
    ev('Formação de professores', nextWeekday(U.addDays(T, -10), 6), 'evento', { time: '08:00' });

    // comunicados
    const n = (title, body, audience, daysAgo, pinned = false) =>
      st.notices.push({ id: U.uid(), title, body, audience, date: U.addDays(T, -daysAgo), pinned, author: 'Secretaria' });
    n('Reunião de pais e mestres', `Senhores responsáveis,\n\nConvidamos para a reunião de pais e mestres na próxima quinta-feira, às 19h, no auditório. Na ocasião entregaremos os boletins e conversaremos sobre o andamento do bimestre.\n\nContamos com a presença de todos.`, 'all', 1, true);
    n('Feriado de Nossa Senhora Aparecida', `Informamos que no dia 12 de outubro não haverá aula por conta do feriado nacional. As atividades retornam normalmente no dia seguinte.`, 'all', 3);
    n('Passeio ao Museu Catavento', `O 5º ano A fará um passeio ao Museu Catavento. Saída às 8h e retorno às 12h30. Enviem a autorização assinada e lanche.`, 'c3', 5);
    n('Uniforme de Educação Física', `A partir da próxima semana, o uso do uniforme completo será obrigatório nas aulas de Educação Física.`, 'all', 12);

    st.log = [
      { at: Date.now() - 1000 * 60 * 25, text: 'Chamada do 3º ano A registrada', icon: 'checkSquare' },
      { at: Date.now() - 1000 * 60 * 50, text: 'Pagamento de mensalidade recebido via Pix', icon: 'cash' },
      { at: Date.now() - 1000 * 60 * 95, text: 'Comunicado "Reunião de pais e mestres" publicado', icon: 'megaphone' },
      { at: Date.now() - 1000 * 60 * 60 * 20, text: 'Notas de Matemática do 6º ano A lançadas', icon: 'grade' },
    ];

    st.classes.forEach((c) => {
      delete c._age;
      delete c._size;
    });
    return st;
  };

  return { empty, demo, subjects };
})();
