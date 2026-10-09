'use strict';
/* Contrato: coleções, chaves, catálogo de permissões, cargos e lista de comandos. */
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { Core, fresh, assert } = require('./helpers');
const { schema, perms, engine: E, util } = Core;

test('coleções do esquema e dados de exemplo válidos', () => {
  const st = fresh();
  assert.deepEqual(Object.keys(schema.KINDS).sort(), Object.keys(schema.COLLECTIONS).sort());
  for (const [coll, def] of Object.entries(schema.COLLECTIONS)) {
    if (def.kind === 'list') {
      const ids = new Set();
      for (const d of st[coll]) {
        assert.ok(util.isId(d.id), `${coll}: id inválido ${d.id}`);
        assert.ok(d.id.startsWith(def.prefix), `${coll}: prefixo errado ${d.id}`);
        assert.ok(!ids.has(d.id), `${coll}: id repetido ${d.id}`);
        ids.add(d.id);
      }
    } else if (def.kind === 'map') {
      for (const k of Object.keys(st[coll])) assert.ok(util.key.ok(k, def.parts), `${coll}: chave inválida ${k}`);
    }
  }
  const { report } = schema.cleanState(JSON.parse(JSON.stringify(st)));
  assert.equal(report.dropped, 0);
});

test('saneamento de importação descarta chaves perigosas e ids inválidos', () => {
  const st = fresh();
  const raw = JSON.parse(JSON.stringify(st));
  raw.students.push({ id: '<img src=x onerror=alert(1)>', name: 'X' });
  raw.students.push({ id: 'a' + 'b'.repeat(60), name: 'Y' });
  raw.grades['2026|a001|s001|1|extra'] = 5;
  raw.grades['__proto__'] = 1;
  const evil = JSON.parse('{"__proto__": {"polluted": true}, "constructor": {"x": 1}, "name": "Z", "id": "a999"}');
  raw.students.push(evil);
  const { state, report } = schema.cleanState(raw);
  assert.ok(report.dropped >= 3);
  assert.equal({}.polluted, undefined);
  const z = state.students.find((s) => s.id === 'a999');
  assert.ok(z && !Object.prototype.hasOwnProperty.call(z, '__proto__') && !Object.prototype.hasOwnProperty.call(z, 'constructor'));
  assert.ok(!state.students.some((s) => s.id.includes('<')));
});

test('catálogo de permissões e cargos fechados', () => {
  const keys = new Set(perms.CATALOG.map((c) => c[0]));
  assert.equal(keys.size, perms.CATALOG.length, 'chave de permissão repetida');
  for (const [k, deps] of Object.entries(perms.IMPLIES)) {
    assert.ok(keys.has(k), `IMPLIES com chave desconhecida ${k}`);
    for (const d of deps) assert.ok(keys.has(d), `IMPLIES aponta para ${d}`);
  }
  const roleIds = new Set();
  for (const r of perms.ROLES) {
    assert.ok(!roleIds.has(r.id), `cargo repetido ${r.id}`);
    roleIds.add(r.id);
    for (const p of r.perms) assert.ok(keys.has(p), `${r.id}: permissão desconhecida ${p}`);
    const closed = perms.withImplied(r.perms);
    assert.deepEqual(perms.withImplied(closed), closed, 'fechamento não é idempotente');
  }
  for (const id of ['diretor', 'coordenador', 'professor', 'auxiliar', 'psicologo', 'psicopedagogo', 'secretaria', 'financeiro', 'responsavel']) assert.ok(roleIds.has(id), `falta o cargo ${id}`);
  // o diretor não lê atendimentos sigilosos por padrão
  assert.ok(!perms.profile('diretor', {}).includes('atendimentos.conteudo'));
  assert.ok(perms.profile('psicologo', {}).includes('atendimentos.conteudo'));
});

test('todo comando do contrato (§10) existe e declara autorização', () => {
  const doc = fs.readFileSync(path.join(__dirname, '../docs/ARQUITETURA.md'), 'utf8');
  const section = doc.slice(doc.indexOf('## 10. Comandos'), doc.indexOf('## 11.'));
  const permKeys = new Set(perms.CATALOG.map((c) => c[0]));
  const names = new Set([...section.matchAll(/`([a-z]+(?:\.[a-z]+)+)\b/g)].map((m) => m[1]).filter((n) => !permKeys.has(n) && n !== 'files.refs'));
  assert.ok(names.size > 40);
  for (const n of names) assert.ok(E.get(n), `comando do contrato não implementado: ${n}`);
  for (const n of E.names()) {
    const s = E.get(n);
    assert.ok(s.perm || s.anyPerm || s.family || s.self || s.system || s.staff, `${n} sem autorização`);
  }
});

test('index.html carrega o núcleo exatamente na ordem do manifesto', () => {
  const html = fs.readFileSync(path.join(__dirname, '../web/index.html'), 'utf8');
  const scripts = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map((m) => m[1]);
  const core = scripts.filter((s) => s.startsWith('core/') && s !== 'core/manifest.js').map((s) => s.slice(5));
  assert.deepEqual(core, Core.manifest);
  const firstApp = scripts.findIndex((s) => s.startsWith('js/'));
  const lastCore = scripts.map((s) => s.startsWith('core/')).lastIndexOf(true);
  assert.ok(lastCore < firstApp, 'o núcleo precisa vir antes dos scripts do app');
  assert.ok(!/<script>[^<]/.test(html), 'sem scripts embutidos (CSP)');
  assert.ok(!/fonts\.googleapis|fonts\.gstatic/.test(html), 'fontes devem ser locais');
  for (const s of scripts) assert.ok(fs.existsSync(path.join(__dirname, '../web', s)), `script não existe: ${s}`);
});

test('demo.html é o index.html com o modo demonstração', () => {
  const { demoHtml } = require('../tools/sync-demo');
  const index = fs.readFileSync(path.join(__dirname, '../web/index.html'), 'utf8');
  const demo = fs.readFileSync(path.join(__dirname, '../web/demo.html'), 'utf8');
  assert.equal(demo, demoHtml(index), 'rode: node tools/sync-demo.js');
  assert.ok(!index.includes('demo-mode.js'), 'o index.html do servidor nunca liga a demonstração');
});

test('migração da v1: chamada diária continua valendo em todas as etapas', () => {
  const v1 = { settings: { schoolName: 'Escola V1', year: 2026, term: 3, minAttendance: 75 }, subjects: [], teachers: [], classes: [{ id: 'c4', name: '6º ano A', shift: 'Manhã', subjects: {}, schedule: [] }], students: [{ id: 'a1', name: 'Aluno', classId: 'c4', status: 'ativo', guardian: { name: 'Mãe', phone: '' } }], attendance: { 'c4|2026-10-07': { a1: 'P' } }, grades: {}, invoices: [], events: [], notices: [] };
  const Core = require('../web/core');
  assert.ok(Core.migrate.isV1(v1));
  const st = Core.migrate.fromV1(v1, { today: '2026-10-08', now: '2026-10-08T12:00:00.000Z', newId: (p) => Core.util.uid(p) });
  for (const seg of Object.values(st.settings.segments)) assert.equal(seg.attendance, 'diaria');
  const k = Object.keys(st.attendance)[0];
  assert.ok(k && k.endsWith('|0'));
});
