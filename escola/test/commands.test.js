'use strict';
/* Comandos de cada área: permitido, negado, validação, lista branca, escopo (not_found) e desfazer. */
const test = require('node:test');
const { Core, fresh, who, family, kidsOf, run, fails, teacherClass, env, assert } = require('./helpers');
const { engine: E, rules } = Core;

const undo = (st, actor, name, out, e) => E.undo(st, actor, { name, changes: out.changes, befores: out.befores, summary: out.summary }, env(e));

test('chamada: professor registra a própria aula; outra turma é not_found; aula de outro é forbidden', () => {
  const st = fresh();
  const prof = who(st, 'Marcos');
  const c = teacherClass(st, prof);
  const date = '2026-10-05';
  const lessons = rules.periodsFor(st.settings, c, date);
  const mine = lessons.find((p) => c.subjects[p.subjectId] === prof.id);
  const other = lessons.find((p) => c.subjects[p.subjectId] && c.subjects[p.subjectId] !== prof.id);
  assert.ok(mine && other, 'horário de exemplo precisa ter aulas do professor e de outros');
  const s = st.students.find((x) => x.classId === c.id && x.status === 'ativo');
  const out = run(st, prof, 'attendance.save', { classId: c.id, date, period: mine.period, marks: { [s.id]: 'F' }, content: 'Frações' });
  const rec = st.attendance[`${c.id}|${date}|${mine.period}`];
  assert.equal(rec.marks[s.id], 'F');
  assert.equal(rec.content, 'Frações');
  assert.equal(out.result.absent >= 1, true);
  fails(st, prof, 'attendance.save', { classId: c.id, date, period: other.period, marks: {} }, 'forbidden');
  const foreign = st.classes.find((k) => !Object.values(k.subjects).includes(prof.id) && k.teacherId !== prof.id);
  fails(st, prof, 'attendance.save', { classId: foreign.id, date, period: 1, marks: {} }, 'not_found');
  fails(st, prof, 'attendance.save', { classId: c.id, date: '2026-12-01', period: mine.period, marks: {} }, 'invalid');
  // professor não justifica: J vira F
  run(st, prof, 'attendance.save', { classId: c.id, date, period: mine.period, marks: { [s.id]: 'J' } });
  assert.equal(st.attendance[`${c.id}|${date}|${mine.period}`].marks[s.id], 'F');
  // secretaria justifica com motivo; F e J contam como falta, A sai da conta
  const sec = who(st, 'Rita');
  run(st, sec, 'attendance.justify', { classId: c.id, date, studentId: s.id, mark: 'J', reason: 'Atestado médico' });
  assert.equal(st.attendance[`${c.id}|${date}|${mine.period}`].marks[s.id], 'J');
  fails(st, prof, 'attendance.justify', { classId: c.id, date, studentId: s.id, mark: 'A', reason: 'x' }, 'forbidden');
});

test('chamada: conflito quando outra pessoa salvou depois (baseAt)', () => {
  const st = fresh();
  const coord = who(st, 'Fernanda');
  const aline = who(st, 'Aline');
  const c = st.classes.find((k) => k.teacherId === aline.id);
  const date = '2026-10-06';
  const first = run(st, aline, 'attendance.save', { classId: c.id, date, marks: {} }, { now: '2026-10-06T11:00:00.000Z' });
  run(st, coord, 'attendance.save', { classId: c.id, date, marks: {}, baseAt: first.result.at }, { now: '2026-10-06T11:05:00.000Z' });
  fails(st, aline, 'attendance.save', { classId: c.id, date, marks: {}, baseAt: first.result.at }, 'conflict');
});

test('notas: disciplina própria, etapa fechada, parecer só na Educação Infantil', () => {
  const st = fresh();
  const prof = who(st, 'Marcos');
  const c = teacherClass(st, prof);
  const s = st.students.find((x) => x.classId === c.id && x.status === 'ativo');
  const own = Object.keys(c.subjects).find((k) => c.subjects[k] === prof.id);
  const other = Object.keys(c.subjects).find((k) => c.subjects[k] && c.subjects[k] !== prof.id);
  run(st, prof, 'grades.set', { studentId: s.id, subjectId: own, term: 4, value: 7.25 });
  assert.equal(st.grades[`2026|${s.id}|${own}|4`], 7.3);
  fails(st, prof, 'grades.set', { studentId: s.id, subjectId: other, term: 4, value: 7 }, 'forbidden');
  fails(st, prof, 'grades.set', { studentId: s.id, subjectId: own, term: 1, value: 7 }, 'forbidden'); // 1ª etapa fechada
  fails(st, prof, 'grades.set', { studentId: s.id, subjectId: own, term: 4, value: 11 }, 'invalid');
  fails(st, prof, 'grades.set', { studentId: s.id, subjectId: own, term: '__proto__', value: 5 }, 'invalid');
  fails(st, prof, 'grades.set', { studentId: s.id, subjectId: '_parecer', term: 4, value: 'texto' }, 'invalid');
  const aline = who(st, 'Aline');
  const inf = st.classes.find((k) => k.teacherId === aline.id);
  const kid = st.students.find((x) => x.classId === inf.id && x.status === 'ativo');
  run(st, aline, 'grades.set', { studentId: kid.id, subjectId: '_parecer', term: 4, value: 'Participa das rodas de conversa.' });
  assert.equal(st.grades[`2026|${kid.id}|_parecer|4`], 'Participa das rodas de conversa.');
  // coordenação fecha e libera a etapa
  const coord = who(st, 'Fernanda');
  run(st, coord, 'terms.update', { term: 4, closed: true, released: true });
  assert.ok(st.settings.terms['2026']['4'].closed && st.settings.terms['2026']['4'].released);
  fails(st, prof, 'grades.set', { studentId: s.id, subjectId: own, term: 4, value: 8 }, 'forbidden');
  fails(st, prof, 'terms.update', { term: 4, closed: false }, 'forbidden');
});

test('agenda: dever para várias turmas, ocorrência exige permissão, aprovação da coordenação', () => {
  const st = fresh();
  const prof = who(st, 'Marcos');
  const classes = st.classes.filter((k) => Object.values(k.subjects).includes(prof.id)).slice(0, 2);
  const out = run(st, prof, 'diary.save', { type: 'dever', classIds: classes.map((k) => k.id), title: 'Exercícios 1 a 5', body: 'Página 42', due: '2026-10-08' });
  assert.equal(out.result.ids.length, classes.length);
  const items = out.result.ids.map((id) => st.diary.find((d) => d.id === id));
  assert.ok(items.every((d) => d.status === 'publicado' && d.groupId === items[0].groupId && d.recipients.length > 0));
  const bruna = who(st, 'Bruna');
  const bc = st.classes.find((k) => (k.assistantIds || []).includes(bruna.id));
  fails(st, bruna, 'diary.save', { type: 'ocorrencia', classIds: [bc.id], studentIds: [st.students.find((x) => x.classId === bc.id).id], title: 'x', body: 'y' }, 'forbidden');
  const foreign = st.classes.find((k) => !Object.values(k.subjects).includes(prof.id) && k.teacherId !== prof.id);
  fails(st, prof, 'diary.save', { type: 'recado', classIds: [foreign.id], title: 'x', body: 'y' }, 'not_found');
  fails(st, prof, 'diary.save', { type: 'autorizacao', classIds: [classes[0].id], title: 'Passeio', body: 'Zoológico' }, 'invalid'); // falta "responder até"
  // com aprovação ligada, o recado do professor vai para a coordenação
  st.settings.diaryApproval = true;
  const p = run(st, prof, 'diary.save', { type: 'recado', classIds: [classes[0].id], title: 'Reunião', body: 'Sexta às 18h' });
  const pend = st.diary.find((d) => d.id === p.result.id);
  assert.equal(pend.status, 'pendente');
  fails(st, prof, 'diary.approve', { id: pend.id }, 'forbidden');
  run(st, who(st, 'Fernanda'), 'diary.approve', { id: pend.id });
  assert.equal(st.diary.find((d) => d.id === pend.id).status, 'publicado');
});

test('agenda: ciente e autorização da família; "não" prevalece; papel nunca sobrescreve o portal; cancelar desfaz', () => {
  const st = fresh();
  const fam = family(st);
  const kid = kidsOf(st, fam)[0];
  const prof = who(st, 'Fernanda');
  const out = run(st, prof, 'diary.save', { type: 'autorizacao', classIds: [kid.classId], title: 'Passeio ao museu', body: 'Saída às 8h', respondBy: '2026-10-20' });
  const id = out.result.ids[0];
  const g = kid.guardians.find((x) => x.userId === fam.id);
  const r = run(st, fam, 'diary.ack', { itemId: id, studentId: kid.id, answer: 'nao', note: 'Ele tem consulta' });
  assert.ok(r.effects.some((e) => e.type === 'alert' && e.reason === 'autorizacao_negada'));
  assert.equal(st.acks[id][kid.id][g.id].answer, 'nao');
  assert.equal(st.acks[id][kid.id][g.id].origin, 'portal');
  fails(st, prof, 'diary.ack', { itemId: id, studentId: kid.id, guardianId: g.id, answer: 'sim' }, 'conflict');
  const other = st.students.find((s) => s.classId === kid.classId && !kidsOf(st, fam).includes(s));
  fails(st, fam, 'diary.ack', { itemId: id, studentId: other.id, answer: 'sim' }, 'not_found');
  // autorização com resposta não é editada: cancela e reenvia
  fails(st, prof, 'diary.save', { id, type: 'autorizacao', title: 'Outro', body: 'x', respondBy: '2026-10-20' }, 'conflict');
  const c = run(st, prof, 'diary.cancel', { id, reason: 'Passeio adiado' });
  assert.equal(st.diary.find((d) => d.id === id).status, 'cancelado');
  undo(st, prof, 'diary.cancel', c);
  assert.equal(st.diary.find((d) => d.id === id).status, 'publicado');
  // prazo vencido
  fails(st, fam, 'diary.ack', { itemId: id, studentId: kid.id, answer: 'sim' }, 'conflict', { today: '2026-10-21' });
});

test('rotina da Educação Infantil: salvar e enviar às famílias', () => {
  const st = fresh();
  const bruna = who(st, 'Bruna');
  const c = st.classes.find((k) => (k.assistantIds || []).includes(bruna.id));
  const s = st.students.find((x) => x.classId === c.id && x.status === 'ativo');
  run(st, bruna, 'routines.save', { classId: c.id, date: '2026-10-06', entries: { [s.id]: { fields: { almoco: 'Comeu tudo' }, bring: ['Fralda'], note: 'Dia tranquilo' } } });
  const key = `${c.id}|2026-10-06|${s.id}`;
  assert.equal(st.routines[key].fields.almoco, 'Comeu tudo');
  run(st, bruna, 'routines.send', { classId: c.id, date: '2026-10-06' });
  assert.ok(st.routines[key].sentAt);
  fails(st, bruna, 'routines.save', { classId: c.id, date: '2026-10-06', entries: { [s.id]: { fields: { almoco: '<b>opção inventada</b>' } } } }, 'invalid');
  run(st, bruna, 'routines.save', { classId: c.id, date: '2026-10-06', entries: JSON.parse(`{"${s.id}": {"fields": {"__proto__": "x", "campoInventado": "y"}}}`) });
  const f = st.routines[key].fields;
  assert.ok(!Object.prototype.hasOwnProperty.call(f, 'campoInventado') && !Object.prototype.hasOwnProperty.call(f, '__proto__'));
  assert.equal(Object.getPrototypeOf(f), Object.prototype);
});

test('alunos: matrícula com lista branca por permissão; contatos e saúde protegidos', () => {
  const st = fresh();
  const sec = who(st, 'Rita');
  const out = run(st, sec, 'students.enroll', {
    name: 'Laura Teste', birth: '2019-03-02', classId: st.classes[1].id, fee: 9999, alerts: 'Alergia a amendoim',
    guardians: [{ name: 'Mãe Teste', relation: 'Mãe', phone: '(11) 98888-7777', email: 'mae@teste.com', pedagogico: true, financeiro: true, podeBuscar: true }],
  });
  const s = st.students.find((x) => x.id === out.result.id);
  assert.equal(s.alerts, 'Alergia a amendoim');
  assert.notEqual(s.fee, 9999, 'mensalidade exige financeiro.gerenciar');
  const prof = who(st, 'Marcos');
  fails(st, prof, 'students.enroll', { name: 'X', classId: st.classes[1].id }, 'forbidden');
  // convite da família: código só no efeito, conta criada e vinculada
  const g = s.guardians[0];
  const inv = run(st, sec, 'family.invite', { studentId: s.id, guardianId: g.id });
  const eff = inv.effects.find((e) => e.type === 'invite');
  assert.ok(eff && eff.code);
  const acct = st.users.find((u) => u.id === inv.result.id);
  assert.equal(acct.role, 'responsavel');
  assert.equal(st.students.find((x) => x.id === s.id).guardians[0].userId, acct.id);
  // bloquear encerra sessões
  const b = run(st, sec, 'family.block', { studentId: s.id, guardianId: g.id, blocked: true });
  assert.ok(b.effects.some((e) => e.type === 'endSessions' && e.userId === acct.id));
  // situação da matrícula se desfaz
  const t = run(st, sec, 'students.status', { id: s.id, status: 'transferido' });
  undo(st, sec, 'students.status', t);
  assert.equal(st.students.find((x) => x.id === s.id).status, 'ativo');
});

test('mensagens: família avisa falta e medicação; escola responde; outro aluno é not_found', () => {
  const st = fresh();
  const fam = family(st);
  const kid = kidsOf(st, fam)[0];
  const m = run(st, fam, 'messages.create', { studentId: kid.id, kind: 'medicacao', body: 'Dar às 10h', details: { medicine: 'Amoxicilina', dose: '5 ml', schedule: '10h', until: '2026-10-10' } });
  fails(st, fam, 'messages.create', { studentId: kid.id, kind: 'medicacao', body: 'x', details: { medicine: 'Dipirona' } }, 'invalid');
  const other = st.students.find((s) => !kidsOf(st, fam).includes(s));
  fails(st, fam, 'messages.create', { studentId: other.id, kind: 'recado', body: 'oi' }, 'not_found');
  const sec = who(st, 'Rita');
  run(st, sec, 'messages.reply', { id: m.result.id, body: 'Recebido, daremos às 10h.' });
  const msg = st.messages.find((x) => x.id === m.result.id);
  assert.equal(msg.posts.length, 2);
  assert.equal(msg.status, 'respondida');
  st.settings.familyMessages = false;
  fails(st, fam, 'messages.create', { studentId: kid.id, kind: 'recado', body: 'oi' }, 'forbidden');
});

test('atendimentos: só o autor edita; depois de 24 h só adendo; ninguém de fora lê', () => {
  const st = fresh();
  const psi = who(st, 'Júlia');
  const s = st.students[20];
  const out = run(st, psi, 'support.save', { studentId: s.id, content: 'Primeira escuta.', confidentiality: 'autor' }, { now: '2026-10-01T12:00:00.000Z', today: '2026-10-01' });
  const id = out.result.id;
  fails(st, psi, 'support.save', { id, content: 'Reescrito' }, 'conflict');
  run(st, psi, 'support.addendum', { id, text: 'Correção: a escuta foi com a mãe.' });
  const dir = who(st, 'Ana Beatriz');
  fails(st, dir, 'support.save', { studentId: s.id, content: 'x' }, 'forbidden');
  fails(st, dir, 'support.addendum', { id, text: 'x' }, 'forbidden');
  const view = Core.view.makeFilter(st, dir, env());
  assert.equal(view.supportReadable(st.support.find((r) => r.id === id)), false);
});

test('financeiro: receber, estornar com motivo e desfazer; tesoureiro não mexe em notas', () => {
  const st = fresh();
  const fin = who(st, 'Paulo');
  const inv = st.invoices.find((i) => !i.paidAt);
  const p = run(st, fin, 'invoices.pay', { id: inv.id, amount: inv.amount, paidAt: '2026-10-06', method: 'Pix' });
  assert.ok(st.invoices.find((i) => i.id === inv.id).paidAt);
  undo(st, fin, 'invoices.pay', p);
  assert.ok(!st.invoices.find((i) => i.id === inv.id).paidAt);
  run(st, fin, 'invoices.pay', { id: inv.id, amount: inv.amount, paidAt: '2026-10-06', method: 'Dinheiro' });
  fails(st, fin, 'invoices.reverse', { id: inv.id, reason: '' }, 'invalid');
  run(st, fin, 'invoices.reverse', { id: inv.id, reason: 'Pagamento lançado em duplicidade' });
  assert.ok(!st.invoices.find((i) => i.id === inv.id).paidAt);
  fails(st, fin, 'grades.set', { studentId: st.students[0].id, subjectId: 's001', term: 4, value: 5 }, 'forbidden');
  st.settings.chargesFees = false;
  fails(st, fin, 'invoices.generate', { month: '2026-11' }, 'forbidden');
});

test('comunicação: público "escola toda" só para quem vê todas as turmas', () => {
  const st = fresh();
  const prof = who(st, 'Marcos');
  prof.grants = ['comunicados.publicar'];
  fails(st, prof, 'notices.save', { title: 'Aviso', body: 'Texto', audience: { who: 'todos', segments: [], classIds: [] } }, 'forbidden');
  const c = teacherClass(st, prof);
  const out = run(st, prof, 'notices.save', { title: 'Aviso da turma', body: 'Texto', audience: { who: 'familias', segments: [], classIds: [c.id] } });
  assert.ok(out.result.id);
  const coord = who(st, 'Fernanda');
  const ev = run(st, coord, 'events.save', { title: 'Feira de ciências', type: 'evento', date: '2026-10-20', audience: { who: 'todos', segments: [], classIds: [] } });
  const d = run(st, coord, 'events.delete', { id: ev.result.id });
  undo(st, coord, 'events.delete', d);
  assert.ok(st.events.find((e) => e.id === ev.result.id));
});

test('desfazer recusa quando os dados mudaram depois', () => {
  const st = fresh();
  const fin = who(st, 'Paulo');
  const inv = st.invoices.find((i) => !i.paidAt);
  const p = run(st, fin, 'invoices.pay', { id: inv.id, amount: inv.amount, paidAt: '2026-10-06', method: 'Pix' });
  run(st, fin, 'invoices.reverse', { id: inv.id, reason: 'Erro de lançamento' });
  assert.throws(() => undo(st, fin, 'invoices.pay', p), (e) => e.code === 'conflict');
});

test('configurações: lista branca (nunca perfis, titular ou demonstração)', () => {
  const st = fresh();
  const dir = who(st, 'Ana Beatriz');
  const owner = st.settings.ownerId;
  run(st, dir, 'settings.update', { patch: { schoolName: 'Colégio Novo', ownerId: 'u999', profiles: { professor: ['usuarios.gerenciar'] }, demo: false, passing: 6 } });
  assert.equal(st.settings.schoolName, 'Colégio Novo');
  assert.equal(st.settings.ownerId, owner);
  assert.ok(!st.settings.profiles.professor);
  assert.equal(st.settings.passing, 6);
  fails(st, who(st, 'Marcos'), 'settings.update', { patch: { schoolName: 'X' } }, 'forbidden');
});
