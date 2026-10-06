'use strict';
/* Apoio aos testes: escola de exemplo determinística, execução de comandos e asserções de erro. */
const assert = require('node:assert/strict');
const Core = require('../web/core');

const TODAY = '2026-10-06';
const NOW = '2026-10-06T15:00:00.000Z';
const env = (extra = {}) => ({ today: TODAY, now: NOW, ...extra });

/** Estado novo da escola de exemplo (cada teste começa do zero). */
const fresh = () => Core.seed.demo(TODAY);
const who = (st, prefix) => {
  const u = st.users.find((x) => x.name.startsWith(prefix));
  if (!u) throw new Error('conta não encontrada: ' + prefix);
  return u;
};
const family = (st) => {
  const count = (u) => st.students.filter((s) => (s.guardians || []).some((g) => g.userId === u.id)).length;
  return st.users.filter((u) => u.role === 'responsavel').sort((a, b) => count(b) - count(a))[0];
};
const kidsOf = (st, u) => st.students.filter((s) => (s.guardians || []).some((g) => g.userId === u.id && !g.bloqueado));
const run = (st, actor, name, input = {}, e = {}) => Core.engine.run(st, actor, name, input, env(e));
/** Confere que o comando falha com o código esperado (e não altera o estado). */
const fails = (st, actor, name, input, code, e = {}) => {
  const before = JSON.stringify(st);
  let err = null;
  try {
    run(st, actor, name, input, e);
  } catch (x) {
    err = x;
  }
  assert.ok(err, `${name} deveria falhar com ${code}`);
  assert.equal(err.code, code, `${name}: esperado ${code}, veio ${err.code} (${err.message})`);
  assert.equal(JSON.stringify(st), before, `${name}: estado mudou apesar do erro`);
  return err;
};
/** Conta de equipe sob medida, inserida direto no estado (para testar regras). */
const addStaff = (st, fields) => {
  const u = { id: 'u' + Math.random().toString(36).slice(2, 10), name: 'Pessoa Teste', title: '', role: 'secretaria', email: '', phone: '', status: 'ativo', login: true, validUntil: null, grants: [], revokes: [], scope: 'todas', segments: [], classIds: [], linkedStudentIds: [], subjectIds: [], area: null, createdAt: NOW, ...fields };
  st.users.push(u);
  return u;
};
const snapshot = (st, user, e = {}) => Core.view.snapshot(st, user, env(e));
const teacherClass = (st, teacher) => st.classes.find((c) => Object.values(c.subjects || {}).includes(teacher.id));

module.exports = { Core, TODAY, NOW, env, fresh, who, family, kidsOf, run, fails, addStaff, snapshot, teacherClass, assert };
