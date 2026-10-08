'use strict';
/* Permissões, perfis, escopo e todos os caminhos de escalada de privilégio. */
const test = require('node:test');
const { Core, fresh, who, family, run, fails, addStaff, assert } = require('./helpers');
const { perms } = Core;

const manager = (st, extra = {}) =>
  addStaff(st, { name: 'Gestora Parcial', role: 'coordenador', grants: ['usuarios.gerenciar'], email: 'gestora@escola.test', ...extra });

test('permissões efetivas = perfil + extras − retiradas, com dependências', () => {
  const st = fresh();
  const u = addStaff(st, { role: 'professor', scope: 'vinculos', grants: ['comunicados.publicar', 'notas.fechar'], revokes: ['diario.ocorrencias'] });
  const eff = perms.effective(u, st.settings);
  assert.ok(eff.has('comunicados.publicar') && eff.has('notas.fechar'));
  assert.ok(eff.has('notas.ver'), 'notas.fechar implica ver notas');
  assert.ok(!eff.has('diario.ocorrencias'));
  assert.equal(perms.effective({ ...u, status: 'inativo' }, st.settings).size, 0);
  assert.equal(perms.effective(family(st), st.settings).size, 0);
  // perfil personalizado da escola substitui o padrão do cargo
  st.settings.profiles = { professor: ['alunos.ver', 'turmas.ver'] };
  const p = perms.effective({ ...u, grants: [], revokes: [] }, st.settings);
  assert.deepEqual([...p].sort(), ['alunos.ver', 'turmas.ver']);
});

test('diretora titular cria conta com acessos extras e recebe código de convite', () => {
  const st = fresh();
  const dir = who(st, 'Ana Beatriz');
  const wanted = [...perms.profile('professor', st.settings), 'comunicados.publicar'];
  const out = run(st, dir, 'users.save', { name: 'Clara Nunes', role: 'professor', email: 'clara@ipe.test', scope: 'vinculos', perms: wanted });
  const u = st.users.find((x) => x.id === out.result.id);
  assert.deepEqual(u.grants, ['comunicados.publicar']);
  assert.deepEqual(u.revokes, []);
  const inv = out.effects.find((e) => e.type === 'invite');
  assert.ok(inv && /^[A-Z0-9]{5}-[A-Z0-9]{5}$/.test(inv.code));
  // e-mail repetido é recusado
  fails(st, dir, 'users.save', { name: 'Outra', role: 'auxiliar', email: 'clara@ipe.test' }, 'conflict');
});

test('ninguém concede o que não tem nem cria cargo acima do seu', () => {
  const st = fresh();
  const m = manager(st);
  fails(st, m, 'users.save', { name: 'Diretor Falso', role: 'diretor', email: 'x@x.test' }, 'forbidden');
  fails(st, m, 'users.save', { name: 'Tesoureiro', role: 'financeiro', email: 'y@x.test' }, 'forbidden');
  fails(st, m, 'users.save', { name: 'Admin', role: 'auxiliar', email: 'z@x.test', perms: [...perms.profile('auxiliar', st.settings), 'configuracoes.editar'] }, 'forbidden');
  // acessos confidenciais (atendimentos) podem ser dados por quem gerencia contas
  const ok = run(st, m, 'users.save', { name: 'Psi Nova', role: 'psicologo', email: 'psi@x.test', perms: perms.profile('psicologo', st.settings).filter((p) => p !== 'relatorios.ver') });
  assert.ok(ok.result.id);
});

test('quem não vê todas as turmas não dá acesso a todas, nem a turmas fora do seu alcance', () => {
  const st = fresh();
  const c = st.classes[0];
  const m = manager(st, { scope: 'vinculos', classIds: [c.id] });
  fails(st, m, 'users.save', { name: 'Aux', role: 'auxiliar', email: 'aux@x.test', scope: 'todas' }, 'forbidden');
  fails(st, m, 'users.save', { name: 'Aux', role: 'auxiliar', email: 'aux@x.test', scope: 'vinculos', classIds: [st.classes[3].id] }, 'not_found');
  const ok = run(st, m, 'users.save', { name: 'Aux', role: 'auxiliar', email: 'aux@x.test', scope: 'vinculos', classIds: [c.id] });
  assert.ok(ok.result.id);
});

test('dominância: não altera quem tem mais acesso, a si mesmo, a titular ou família', () => {
  const st = fresh();
  const m = manager(st);
  const dir = who(st, 'Ana Beatriz');
  const fin = who(st, 'Paulo'); // tem financeiro.gerenciar, que a gestora parcial não tem
  const prof = who(st, 'Marcos');
  fails(st, m, 'users.status', { id: fin.id, status: 'inativo' }, 'forbidden');
  fails(st, m, 'users.invite', { id: fin.id }, 'forbidden');
  fails(st, m, 'users.save', { id: dir.id, name: 'Outra' }, 'forbidden');
  fails(st, m, 'users.save', { id: m.id, name: 'Eu' }, 'forbidden');
  fails(st, m, 'users.status', { id: family(st).id, status: 'inativo' }, 'forbidden');
  fails(st, dir, 'users.status', { id: dir.id, status: 'inativo' }, 'forbidden');
  // a professora pode ser desativada pela gestora (subconjunto) e a ação se desfaz
  const out = run(st, m, 'users.status', { id: prof.id, status: 'inativo' });
  assert.ok(out.undoable);
  assert.ok(out.effects.some((e) => e.type === 'endSessions' && e.userId === prof.id));
  Core.engine.undo(st, m, { name: 'users.status', ...out }, { today: '2026-10-06' });
  assert.equal(st.users.find((u) => u.id === prof.id).status, 'ativo');
});

test('perfis de acesso: sem escalada, nunca o próprio cargo, dominância sobre todos os afetados', () => {
  const st = fresh();
  const dir = who(st, 'Ana Beatriz');
  const m = manager(st);
  fails(st, dir, 'profiles.save', { role: 'diretor', perms: [] }, 'forbidden');
  fails(st, m, 'profiles.save', { role: 'auxiliar', perms: ['financeiro.gerenciar'] }, 'forbidden');
  fails(st, m, 'profiles.save', { role: 'coordenador', perms: ['alunos.ver'] }, 'forbidden');
  fails(st, m, 'profiles.save', { role: 'financeiro', perms: ['alunos.ver'] }, 'forbidden');
  const out = run(st, dir, 'profiles.save', { role: 'professor', perms: [...perms.profile('professor', st.settings), 'comunicados.publicar'] });
  assert.ok(out.result.affected >= 2);
  assert.ok(perms.effective(who(st, 'Marcos'), st.settings).has('comunicados.publicar'));
  run(st, dir, 'profiles.save', { role: 'professor', reset: true });
  assert.ok(!perms.effective(who(st, 'Marcos'), st.settings).has('comunicados.publicar'));
});

test('titularidade: só a titular transfere; ninguém mais', () => {
  const st = fresh();
  const dir = who(st, 'Ana Beatriz');
  const coord = who(st, 'Fernanda');
  fails(st, coord, 'owner.transfer', { userId: coord.id }, 'forbidden');
  run(st, dir, 'owner.transfer', { userId: coord.id });
  assert.equal(st.settings.ownerId, coord.id);
});

test('família não executa comandos da equipe; conta inativa ou vencida não executa nada', () => {
  const st = fresh();
  const fam = family(st);
  fails(st, fam, 'grades.set', { studentId: st.students[0].id, subjectId: 's001', term: 4, value: 10 }, 'forbidden');
  fails(st, fam, 'users.save', { name: 'X', role: 'diretor', email: 'q@q.test' }, 'forbidden');
  const prof = who(st, 'Marcos');
  prof.validUntil = '2026-10-01';
  fails(st, prof, 'diary.save', { type: 'recado', classIds: [st.classes[5].id], title: 'x', body: 'y' }, 'unauthorized');
  prof.validUntil = null;
  prof.status = 'inativo';
  fails(st, prof, 'diary.save', { type: 'recado', classIds: [st.classes[5].id], title: 'x', body: 'y' }, 'unauthorized');
});

test('impressão digital muda quando o acesso muda', () => {
  const st = fresh();
  const prof = who(st, 'Marcos');
  const a = perms.fingerprint(prof, st);
  prof.grants = ['comunicados.publicar'];
  const b = perms.fingerprint(prof, st);
  assert.notEqual(a, b);
  const s = st.students.find((x) => x.classId && !perms.context(prof, st).classIds.has(x.classId));
  const c0 = st.classes.find((c) => Object.values(c.subjects).includes(prof.id));
  s.classId = c0.id;
  assert.notEqual(perms.fingerprint(prof, st), b, 'aluno que entra na turma muda o que o professor vê');
});

test('ver como: equipe dominada ou família dos alunos que o ator alcança', () => {
  const st = fresh();
  const dir = who(st, 'Ana Beatriz');
  const sec = who(st, 'Rita');
  const prof = who(st, 'Marcos');
  const fam = family(st);
  assert.ok(perms.canPreview(dir, prof, st));
  assert.ok(!perms.canPreview(prof, dir, st));
  assert.ok(!perms.canPreview(dir, dir, st));
  assert.ok(perms.canPreview(sec, fam, st), 'secretaria gerencia acessos das famílias');
  assert.ok(!perms.canPreview(prof, fam, st), 'professor não tem familias.acessos');
  assert.ok(!perms.canPreview(who(st, 'Paulo'), fam, st));
});

test('convite da família: ninguém vincula a própria conta; código só para quem alcança todos os filhos da conta', () => {
  const st = fresh();
  const aux = addStaff(st, { role: 'aux_secretaria', name: 'Aux Sec', email: 'aux@escola.test', phone: '(11) 90000-1111' });
  const s = st.students.find((x) => x.status === 'ativo' && x.classId);
  const g = run(st, aux, 'students.guardian.save', { studentId: s.id, guardian: { name: 'Eu Mesma', relation: 'Outro', email: 'aux@escola.test' } }).result.id;
  fails(st, aux, 'family.invite', { studentId: s.id, guardianId: g }, 'forbidden');
  // professor com acesso às famílias da turma dele não gera código para uma família que tem filho em outra turma
  const fam = family(st);
  const kids = st.students.filter((k) => k.guardians.some((x) => x.userId === fam.id));
  const prof = addStaff(st, { role: 'professor', name: 'Prof Escopo', email: 'pe@escola.test', scope: 'vinculos', classIds: [kids[0].classId], grants: ['familias.acessos'] });
  if (kids.some((k) => k.classId !== kids[0].classId)) {
    const gid = kids[0].guardians.find((x) => x.userId === fam.id).id;
    fails(st, prof, 'family.invite', { studentId: kids[0].id, guardianId: gid }, 'forbidden');
  }
  // conta encontrada pelo contato é marcada como existente (o servidor só vincula se ela já tiver senha)
  const other = st.students.find((k) => k.status === 'ativo' && !k.guardians.some((x) => x.userId === fam.id));
  const famPhone = fam.phone;
  const gid2 = run(st, who(st, 'Rita'), 'students.guardian.save', { studentId: other.id, guardian: { name: fam.name, relation: 'Mãe', phone: famPhone } }).result.id;
  const out = run(st, who(st, 'Rita'), 'family.invite', { studentId: other.id, guardianId: gid2 });
  assert.equal(out.result.id, fam.id);
  assert.ok(out.effects.some((e) => e.type === 'invite' && e.existing === true));
});

test('ver como: só o que o ator também pode ver', () => {
  const st = fresh();
  const coord = who(st, 'Fernanda'); // familias.acessos, sem financeiro.ver
  const fam = family(st);
  const p = Core.view.preview(st, coord, fam, {});
  assert.equal(p.data.invoices.length, 0, 'sem financeiro.ver, não vê mensalidades da família');
  assert.ok(p.data.students.every((s) => s.fee === undefined));
  const dir = who(st, 'Ana Beatriz');
  const psi = who(st, 'Júlia');
  const own = Core.view.snapshot(st, dir, {});
  const pv = Core.view.preview(st, dir, psi, {});
  assert.equal(pv.data.support.length, own.data.support.length, 'diretora não vê atendimentos nem pelo "ver como"');
  assert.ok(pv.data.plans.every((pl) => { const mine = own.data.plans.find((x) => x.id === pl.id); return mine && Object.keys(pl).every((k) => k in mine); }));
});
