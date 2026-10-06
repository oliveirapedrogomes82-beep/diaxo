/* Caderneta Escolar — esquema do estado (fonte única de coleções, formatos de chave e saneamento).
   Usado pelo motor, pelo banco, pela importação, pelas migrações e pelos testes de contrato. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./util'));
  else (root.Core = root.Core || {}).schema = factory(root.Core.util);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (util) {
  'use strict';

  const CONTRACT = '2.0';
  const DATA_VERSION = 2;

  /** Coleções: tipo e, para mapas, o número de partes da chave. */
  const COLLECTIONS = {
    settings: { kind: 'single' },
    subjects: { kind: 'list', prefix: 's' },
    users: { kind: 'list', prefix: 'u' },
    classes: { kind: 'list', prefix: 'c' },
    students: { kind: 'list', prefix: 'a' },
    attendance: { kind: 'map', parts: 3 }, // classId|data|tempo
    grades: { kind: 'map', parts: 4 }, // ano|aluno|disciplina|etapa
    councils: { kind: 'map', parts: 2 }, // ano|aluno
    invoices: { kind: 'list', prefix: 'i' },
    events: { kind: 'list', prefix: 'e' },
    notices: { kind: 'list', prefix: 'n' },
    diary: { kind: 'list', prefix: 'd' },
    acks: { kind: 'map', parts: 1 }, // itemId → {studentId: {guardianId: ack}}
    routines: { kind: 'map', parts: 3 }, // classId|data|aluno
    messages: { kind: 'list', prefix: 'm' },
    support: { kind: 'list', prefix: 'r' },
    plans: { kind: 'list', prefix: 'l' },
    files: { kind: 'list', prefix: 'x' },
  };
  const KINDS = Object.fromEntries(Object.entries(COLLECTIONS).map(([k, v]) => [k, v.kind]));
  const SINGLE_ID = 'school';

  const emptyState = () => {
    const s = {};
    for (const [coll, kind] of Object.entries(KINDS)) s[coll] = kind === 'single' ? {} : kind === 'list' ? [] : Object.create(null);
    return s;
  };

  // ---------- saneamento de dados externos (importação) ----------
  const MAX_TEXT = 20000;
  /** Remove chaves perigosas e textos gigantes de qualquer valor JSON (recursivo). */
  const sanitize = (v, depth = 0) => {
    if (depth > 12) return null;
    if (v === null || typeof v === 'boolean' || typeof v === 'number') return Number.isFinite(v) || typeof v !== 'number' ? v : null;
    if (typeof v === 'string') return v.length > MAX_TEXT ? v.slice(0, MAX_TEXT) : v;
    if (Array.isArray(v)) return v.slice(0, 100000).map((x) => sanitize(x, depth + 1));
    if (typeof v === 'object') {
      const out = {};
      for (const k of Object.keys(v)) {
        if (util.FORBIDDEN_KEYS.has(k) || k.length > 200) continue;
        out[k] = sanitize(v[k], depth + 1);
      }
      return out;
    }
    return null;
  };

  /**
   * Valida e saneia um estado vindo de fora (backup). Devolve {state, report} ou lança CmdError('invalid').
   * Documentos com id inválido e chaves de mapa malformadas são descartados (e contados no relatório).
   */
  function cleanState(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) util.fail('invalid', 'O arquivo não contém dados da Caderneta.');
    const data = sanitize(raw);
    if (!data.settings || typeof data.settings !== 'object' || !Array.isArray(data.students)) util.fail('invalid', 'O arquivo não contém dados da Caderneta.');
    const state = emptyState();
    const report = { dropped: 0 };
    for (const [coll, def] of Object.entries(COLLECTIONS)) {
      const v = data[coll];
      if (v == null) continue;
      if (def.kind === 'single') {
        if (typeof v === 'object' && !Array.isArray(v)) state[coll] = v;
      } else if (def.kind === 'list') {
        if (!Array.isArray(v)) continue;
        const seen = new Set();
        for (const doc of v) {
          if (!doc || typeof doc !== 'object' || !util.isId(doc.id) || seen.has(doc.id)) {
            report.dropped++;
            continue;
          }
          seen.add(doc.id);
          state[coll].push(doc);
        }
      } else {
        if (typeof v !== 'object' || Array.isArray(v)) continue;
        for (const k of Object.keys(v)) {
          if (!util.key.ok(k, def.parts)) {
            report.dropped++;
            continue;
          }
          state[coll][k] = v[k];
        }
      }
    }
    return { state, report };
  }

  return { CONTRACT, DATA_VERSION, COLLECTIONS, KINDS, SINGLE_ID, emptyState, sanitize, cleanState };
});
