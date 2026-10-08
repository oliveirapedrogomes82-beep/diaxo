'use strict';
/* Visibilidade e redação por perfil (retrato, deltas e histórico). */
const test = require('node:test');
const { Core, fresh, who, family, kidsOf, run, snapshot, teacherClass, env, assert } = require('./helpers');
const { view, perms } = Core;

test('família vê só os filhos, sem observações internas, atendimentos ou itens não publicados', () => {
  const st = fresh();
  const fam = family(st);
  const kids = kidsOf(st, fam);
  const snap = snapshot(st, fam);
  const ids = new Set(kids.map((k) => k.id));
  assert.deepEqual(new Set(snap.data.students.map((s) => s.id)), ids);
  for (const s of snap.data.students) {
    assert.equal(s.notes, undefined);
    assert.equal(s.restrictions, undefined);
    for (const g of s.guardians) if (g.userId !== fam.id) assert.equal(g.phone, undefined, 'contato de outro responsável não vai para a família');
  }
  assert.equal(snap.data.support.length, 0);
  assert.ok(snap.data.diary.every((d) => (d.status === 'publicado' || d.status === 'cancelado') && !d.internal && d.recipients.every((r) => ids.has(r))));
  assert.ok(snap.data.messages.every((m) => ids.has(m.studentId)));
  assert.equal(snap.data.settings.profiles, undefined);
  assert.equal(snap.data.settings.ownerId, undefined);
  // notas só de etapas liberadas
  for (const k of Object.keys(snap.data.grades)) {
    const term = k.split('|')[3];
    if (term !== 'rf') assert.ok(Core.rules.termReleased(st.settings, k.split('|')[0], term.replace('rec', '')), `nota de etapa não liberada: ${k}`);
  }
  // usuários: só nome e cargo de quem trabalha com os filhos
  for (const u of snap.data.users) if (u.id !== fam.id) assert.deepEqual(Object.keys(u).sort(), ['id', 'name', 'role', 'title'].filter((k) => k in u).sort());
  assert.ok(!snap.data.users.some((u) => u.role === 'responsavel' && u.id !== fam.id));
});

test('mensalidade só para o responsável financeiro', () => {
  const st = fresh();
  const fam = family(st);
  const kid = kidsOf(st, fam)[0];
  kid.guardians.find((g) => g.userId === fam.id).financeiro = false;
  const snap = snapshot(st, fam);
  assert.ok(!snap.data.invoices.some((i) => i.studentId === kid.id));
  assert.equal(snap.data.students.find((s) => s.id === kid.id).fee, undefined);
});

test('professor vê só as turmas em que atua, sem contatos nem saúde detalhada', () => {
  const st = fresh();
  const prof = who(st, 'Marcos');
  const snap = snapshot(st, prof);
  const ctx = perms.context(prof, st);
  assert.ok(snap.data.students.length > 0 && snap.data.students.length < st.students.length);
  assert.ok(snap.data.students.every((s) => ctx.classIds.has(s.classId)));
  for (const s of snap.data.students) {
    assert.equal(s.health, undefined);
    assert.equal(s.cpf, undefined);
    assert.ok(s.guardians.every((g) => g.phone === undefined && g.email === undefined));
  }
  const withHealth = st.students.find((s) => s.health && ctx.classIds.has(s.classId));
  if (withHealth) assert.ok(snap.data.students.find((s) => s.id === withHealth.id)._hidden.includes('health'));
  assert.equal(snap.data.invoices.length, 0);
  assert.equal(snap.data.support.length, 0);
  assert.ok(snap.data.classes.every((c) => ctx.classIds.has(c.id)));
  assert.ok(snap.data.users.every((u) => u.email === undefined || u.id === prof.id), 'sem equipe.ver não vê contatos da equipe');
});

test('atendimentos: retrato só com metadados; leitura por autor, área e equipe de apoio', () => {
  const st = fresh();
  const psi = who(st, 'Júlia');
  const s = st.students[30];
  const mk = (confidentiality) => run(st, psi, 'support.save', { studentId: s.id, content: 'conteúdo sigiloso ' + confidentiality, confidentiality }).result.id;
  const idAutor = mk('autor');
  const idArea = mk('area');
  const idApoio = mk('apoio');
  const snapPsi = snapshot(st, psi);
  const own = snapPsi.data.support.find((r) => r.id === idAutor);
  assert.ok(own && own.content === undefined, 'conteúdo nunca vai no retrato');
  const colega = { ...psi, id: 'u777', name: 'Outra Psicóloga', email: 'o@x.test' };
  st.users.push(colega);
  const fc = view.makeFilter(st, colega, env());
  const get = (id) => st.support.find((r) => r.id === id);
  assert.equal(fc.supportReadable(get(idAutor)), false);
  assert.equal(fc.supportReadable(get(idArea)), true);
  const ped = { ...psi, id: 'u778', role: 'psicopedagogo', area: 'psicopedagogia', email: 'p@x.test' };
  st.users.push(ped);
  const fp = view.makeFilter(st, ped, env());
  assert.equal(fp.supportReadable(get(idArea)), false);
  assert.equal(fp.supportReadable(get(idApoio)), true);
  const dir = who(st, 'Ana Beatriz');
  assert.equal(snapshot(st, dir).data.support.length, 0, 'diretora não lê atendimentos por padrão');
});

test('plano de apoio: professor com vínculo vê só as adaptações; família só se compartilhado', () => {
  const st = fresh();
  const plan = st.plans.find((p) => p.sharedWith && p.sharedWith.professores);
  const s = st.students.find((x) => x.id === plan.studentId);
  const c = st.classes.find((k) => k.id === s.classId);
  const teacherId = Object.values(c.subjects).find(Boolean) || c.teacherId;
  const teacher = st.users.find((u) => u.id === teacherId);
  const snap = snapshot(st, teacher);
  const seen = snap.data.plans.find((p) => p.id === plan.id);
  assert.ok(seen && seen.adaptations && seen.goals === undefined);
});

test('deltas: item que deixa de ser visível vira "del"; outra turma não aparece', () => {
  const st = fresh();
  const prof = who(st, 'Marcos');
  const fam = family(st);
  const kid = kidsOf(st, fam)[0];
  const coord = who(st, 'Fernanda');
  const out = run(st, coord, 'diary.save', { type: 'recado', classIds: [kid.classId], title: 'Recado', body: 'Texto' });
  const famChanges = view.visibleChanges(st, fam, out.changes, out.befores, env());
  assert.ok(famChanges.some((c) => c.coll === 'diary' && c.op === 'put'));
  const c = run(st, coord, 'diary.save', { id: out.result.id, type: 'recado', title: 'Recado', body: 'Texto', draft: true });
  // publicado continua publicado na edição (rascunho só vale para itens novos), então a família segue vendo
  assert.ok(view.visibleChanges(st, fam, c.changes, c.befores, env()).every((x) => x.op === 'put'));
  // bloquear muda a impressão digital da família (o cliente recarrega o retrato) e encerra as sessões
  const fpBefore = perms.fingerprint(fam, st, env());
  const k = run(st, coord, 'family.block', { studentId: kid.id, guardianId: kid.guardians.find((g) => g.userId === fam.id).id, blocked: true });
  assert.notEqual(perms.fingerprint(fam, st, env()), fpBefore);
  assert.ok(k.effects.some((e) => e.type === 'endSessions' && e.userId === fam.id));
  assert.ok(!snapshot(st, fam).data.students.some((x) => x.id === kid.id));
  const profCtx = perms.context(prof, st);
  if (!profCtx.classIds.has(kid.classId)) assert.equal(view.visibleChanges(st, prof, out.changes, out.befores, env()).length, 0);
});

test('janela do retrato e histórico paginado', () => {
  const st = fresh();
  const dir = who(st, 'Ana Beatriz');
  const old = { ...st.diary[0], id: 'd9old0001', date: '2026-05-01', due: null, respondBy: null, status: 'publicado' };
  st.diary.push(old);
  const snap = snapshot(st, dir);
  assert.ok(!snap.data.diary.some((d) => d.id === old.id), 'fora da janela de 60 dias');
  const h = view.history(st, dir, 'diary', { before: '2026-06-01', limit: 50 }, env());
  assert.ok(h.items.some((x) => x.id === old.id));
});

test('desempenho: retrato da diretora < 3 MB e comandos rápidos', () => {
  const st = fresh();
  const dir = who(st, 'Ana Beatriz');
  const t0 = process.hrtime.bigint();
  const size = JSON.stringify(snapshot(st, dir)).length;
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  assert.ok(size < 3 * 1024 * 1024, `retrato com ${size} bytes`);
  assert.ok(ms < 1500, `retrato levou ${ms} ms`);
  const prof = who(st, 'Marcos');
  const c = teacherClass(st, prof);
  const lesson = Core.rules.periodsFor(st.settings, c, '2026-10-05').find((p) => c.subjects[p.subjectId] === prof.id);
  const t1 = process.hrtime.bigint();
  for (let i = 0; i < 20; i++) run(st, prof, 'attendance.save', { classId: c.id, date: '2026-10-05', period: lesson.period, marks: {} });
  const per = Number(process.hrtime.bigint() - t1) / 1e6 / 20;
  assert.ok(per < 50, `chamada levou ${per} ms`);
});

test('mensagens: nota interna da equipe ("registro") nunca vai para a família', () => {
  const st = fresh();
  const fam = family(st);
  const kid = kidsOf(st, fam)[0];
  const m = run(st, fam, 'messages.create', { studentId: kid.id, kind: 'recado', body: 'Oi' });
  const sec = who(st, 'Rita');
  run(st, sec, 'messages.reply', { id: m.result.id, body: 'Mãe ligou, já resolvido por telefone', kind: 'registro' });
  assert.equal(st.messages.find((x) => x.id === m.result.id).status, 'aberta');
  const seen = snapshot(st, fam).data.messages.find((x) => x.id === m.result.id);
  assert.ok(seen.posts.every((p) => p.kind !== 'registro'));
  assert.equal(snapshot(st, sec).data.messages.find((x) => x.id === m.result.id).posts.length, 2);
});

test('recuperação final só aparece para a família com a última etapa liberada', () => {
  const st = fresh();
  const fam = family(st);
  const kid = kidsOf(st, fam).find((s) => Core.rules.evaluation(st.settings, st.classes.find((c) => c.id === s.classId)) === 'nota');
  const klass = st.classes.find((c) => c.id === kid.classId);
  const sub = Object.keys(klass.subjects)[0];
  const coord = who(st, 'Fernanda');
  run(st, coord, 'grades.set', { studentId: kid.id, subjectId: sub, term: 'rf', value: 2.5 });
  const key = `2026|${kid.id}|${sub}|rf`;
  assert.equal(snapshot(st, fam).data.grades[key], undefined);
  run(st, coord, 'terms.update', { term: 4, closed: true, released: true });
  assert.equal(snapshot(st, fam).data.grades[key], 2.5);
});

test('revisão: histórico escolar, equipe visível à família e impressão digital', () => {
  const st = fresh();
  const fin = who(st, 'Paulo'); // vê alunos, sem notas nem chamada
  const withHist = st.students.find((s) => (s.history || []).length);
  if (withHist) {
    const seen = snapshot(st, fin).data.students.find((s) => s.id === withHist.id);
    assert.ok(seen.history.every((h) => h.avg === undefined && h.result === undefined && h.attendance === undefined));
  }
  // autora de plano não compartilhado não aparece para a família
  const fam = family(st);
  const kid = kidsOf(st, fam)[0];
  const psi = who(st, 'Júlia');
  st.plans.push({ id: 'l9teste01', studentId: kid.id, title: 'Plano', status: 'ativo', start: '2026-09-01', goals: 'x', adaptations: 'y', sharedWith: { professores: false, coordenacao: false, familia: false }, authorId: psi.id, updatedAt: '2026-09-01T12:00:00.000Z' });
  const famUsers = snapshot(st, fam).data.users.map((u) => u.id);
  const psiElsewhere = st.messages.some((m) => kidsOf(st, fam).some((k) => k.id === m.studentId) && (m.posts || []).some((p) => p.userId === psi.id));
  if (!psiElsewhere) assert.ok(!famUsers.includes(psi.id));
  // liberar o boletim muda a impressão digital da família (o portal recarrega)
  const fp = Core.perms.fingerprint(fam, st);
  run(st, who(st, 'Fernanda'), 'terms.update', { term: 4, closed: true, released: true });
  assert.notEqual(Core.perms.fingerprint(fam, st), fp);
  // CNPJ vai para a família (recibo)
  assert.ok('cnpj' in snapshot(st, fam).data.settings || !st.settings.cnpj);
});
