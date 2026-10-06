/* Caderneta Escolar — motor de comandos.
   Toda alteração de dados é um comando registrado aqui e executado dentro de uma transação (tx) que:
   - aplica as mudanças no estado em memória;
   - guarda a imagem anterior de cada documento (para desfazer e para reverter em caso de erro);
   - devolve a lista de mudanças para o servidor gravar e para os clientes atualizarem a tela. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./util'), require('./schema'), require('./perms'));
  else (root.Core = root.Core || {}).engine = factory(root.Core.util, root.Core.schema, root.Core.perms);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (util, schema, perms) {
  'use strict';
  const { clone, fail, canonical } = util;
  const KINDS = schema.KINDS;
  const SINGLE_ID = schema.SINGLE_ID;

  /** Ator de sistema (agendador). */
  const SYSTEM = Object.freeze({ id: 'system', name: 'Sistema', role: 'system', status: 'ativo' });

  const registry = new Map();
  /**
   * Registra um comando. Todo comando declara a autorização:
   *   perm: 'chave' | anyPerm: [...] | family: true (família pode) | self: true (qualquer conta ativa) | system: true (só o agendador)
   * Outras opções: undoable (desfazível), reauth (exige senha no envelope), run(tx, input, ctx, env) → result.
   */
  const define = (name, spec) => {
    if (registry.has(name)) throw new Error(`Comando duplicado: ${name}`);
    if (!spec.perm && !spec.anyPerm && !spec.family && !spec.self && !spec.system && !spec.staff) throw new Error(`Comando sem autorização declarada: ${name}`);
    registry.set(name, spec);
  };
  const get = (name) => (typeof name === 'string' && registry.has(name) ? registry.get(name) : null);
  const names = () => [...registry.keys()];

  // ---------- transação ----------
  function createTx(state) {
    const changes = new Map();
    const indexOf = (coll, id) => state[coll].findIndex((d) => d.id === id);
    const current = (coll, id) => {
      const kind = KINDS[coll];
      if (kind === 'single') return state[coll];
      if (kind === 'list') {
        const i = indexOf(coll, id);
        return i < 0 ? undefined : state[coll][i];
      }
      return Object.prototype.hasOwnProperty.call(state[coll], id) ? state[coll][id] : undefined;
    };
    const record = (coll, id, op, value) => {
      const k = coll + '\u0000' + id;
      if (!changes.has(k)) {
        const before = current(coll, id);
        changes.set(k, { coll, id, op, value, before, hadBefore: before !== undefined });
      } else {
        const c = changes.get(k);
        c.op = op;
        c.value = value;
      }
    };
    const assertColl = (coll, kind) => {
      if (!KINDS[coll]) throw new Error(`Coleção desconhecida: ${coll}`);
      if (kind && KINDS[coll] !== kind) throw new Error(`Operação inválida para ${coll}`);
    };
    const assertKey = (coll, id) => {
      if (KINDS[coll] === 'map' && !util.key.ok(id, schema.COLLECTIONS[coll].parts)) throw new Error(`Chave inválida para ${coll}: ${id}`);
    };

    const tx = {
      state,
      summary: '',
      audit: null, // {entity, ids, confidential}
      effects: [],
      /** Cópia de um documento (lista), valor (mapa) ou das configurações. */
      get(coll, id) {
        assertColl(coll);
        const v = KINDS[coll] === 'single' ? state[coll] : current(coll, id);
        return v === undefined ? null : clone(v);
      },
      /** Igual a get, mas falha com not_found se não existir. */
      need(coll, id, label = 'Registro') {
        const d = util.isId(id) || KINDS[coll] !== 'list' ? tx.get(coll, id) : null;
        if (d == null) fail('not_found', `${label} não encontrado. Ele pode ter sido apagado por outra pessoa.`);
        return d;
      },
      /** Lista viva (somente leitura!) de uma coleção de lista. */
      list(coll) {
        assertColl(coll, 'list');
        return state[coll];
      },
      /** Chaves de um mapa (somente leitura). */
      keys(coll) {
        assertColl(coll, 'map');
        return Object.keys(state[coll]);
      },
      put(coll, doc) {
        assertColl(coll, 'list');
        if (!doc || !util.isId(doc.id)) throw new Error('Documento sem id válido');
        const value = clone(doc);
        record(coll, doc.id, 'put', value);
        const i = indexOf(coll, doc.id);
        if (i >= 0) state[coll][i] = value;
        else state[coll].push(value);
        return value;
      },
      del(coll, id) {
        assertColl(coll);
        const kind = KINDS[coll];
        if (kind === 'single') throw new Error('Não é possível apagar as configurações');
        if (current(coll, id) === undefined) return false;
        record(coll, id, 'del', undefined);
        if (kind === 'list') state[coll].splice(indexOf(coll, id), 1);
        else delete state[coll][id];
        return true;
      },
      /** Define (ou apaga, com null/undefined) uma chave de mapa. */
      set(coll, id, value) {
        assertColl(coll, 'map');
        assertKey(coll, id);
        if (value === undefined || value === null) return tx.del(coll, id);
        const v = clone(value);
        record(coll, id, 'put', v);
        state[coll][id] = v;
        return v;
      },
      /** Mescla campos nas configurações. */
      settings(patch) {
        const next = { ...state.settings, ...clone(patch) };
        record('settings', SINGLE_ID, 'put', next);
        state.settings = next;
        return next;
      },
      effect(e) {
        tx.effects.push(e);
      },
      changes() {
        return [...changes.values()].map(({ coll, id, op, value }) => (op === 'del' ? { coll, id, op } : { coll, id, op, value }));
      },
      befores() {
        return [...changes.values()].map(({ coll, id, before, hadBefore }) => ({ coll, id, value: hadBefore ? before : undefined }));
      },
      rollback() {
        revert(state, tx.befores());
        changes.clear();
      },
      size: () => changes.size,
    };
    return tx;
  }

  /** Volta o estado às imagens anteriores (erro ao gravar no banco, por exemplo). */
  function revert(state, befores) {
    for (const b of [...befores].reverse()) {
      const kind = KINDS[b.coll];
      if (kind === 'single') {
        if (b.value !== undefined) state[b.coll] = b.value;
      } else if (kind === 'list') {
        const i = state[b.coll].findIndex((d) => d.id === b.id);
        if (b.value === undefined) {
          if (i >= 0) state[b.coll].splice(i, 1);
        } else if (i >= 0) state[b.coll][i] = b.value;
        else state[b.coll].push(b.value);
      } else if (b.value === undefined) delete state[b.coll][b.id];
      else state[b.coll][b.id] = b.value;
    }
  }

  // ---------- contexto de acesso ----------
  function makeCtx(actor, state, env) {
    if (actor === SYSTEM) return { user: SYSTEM, system: true, family: false, perms: new Set(), all: true, classIds: new Set(state.classes.map((c) => c.id)), studentIds: null, extraStudentIds: new Set(), can: () => true, need() {}, needAny() {}, needClass() {}, needStudent() {} };
    const ctx = perms.context(actor, state, env);
    ctx.can = (p) => ctx.perms.has(p);
    ctx.need = (p, msg) => {
      if (!ctx.perms.has(p)) fail('forbidden', msg || `Seu acesso não permite esta ação (${perms.label(p)}). Fale com a direção.`);
    };
    ctx.needAny = (list, msg) => {
      if (!list.some((p) => ctx.perms.has(p))) fail('forbidden', msg || 'Seu acesso não permite esta ação. Fale com a direção.');
    };
    // fora do escopo: not_found (não revela que existe)
    ctx.needClass = (classId, label = 'Turma') => {
      if (!perms.reachesClass(ctx, classId)) fail('not_found', `${label} não encontrada.`);
    };
    ctx.needStudent = (student) => {
      if (!perms.reachesStudent(ctx, student)) fail('not_found', 'Aluno não encontrado.');
    };
    return ctx;
  }

  const makeEnv = (env = {}, settings = {}) => ({
    ...env,
    now: env.now || new Date().toISOString(),
    today: env.today || util.today(settings.timezone),
    newId: env.newId || ((prefix) => util.uid(prefix)),
  });

  /**
   * Executa um comando em nome de `actor`. Em caso de erro, o estado volta ao que era.
   * Retorna { result, changes, befores, undoable, summary, audit, effects }.
   */
  function run(state, actor, name, input, envIn) {
    const spec = get(name);
    if (!spec) fail('not_found', 'Ação desconhecida. Atualize a página e tente de novo.');
    const env = makeEnv(envIn, state.settings);
    if (actor === SYSTEM) {
      if (!spec.system) fail('forbidden', 'Ação não permitida.');
    } else {
      if (spec.system && !spec.perm && !spec.anyPerm && !spec.family && !spec.self && !spec.staff) fail('forbidden', 'Ação não permitida.');
      if (!actor || !perms.isActive(actor, env.today)) fail('unauthorized', 'Sua conta está inativa ou o acesso venceu. Fale com a direção.');
      const family = perms.isFamily(actor) || (envIn && envIn.mode === 'familia');
      if (family && !spec.family && !spec.self) fail('forbidden', 'Esta ação não está disponível no portal da família.');
      if (!family && spec.family && !spec.perm && !spec.anyPerm && !spec.self && !spec.staff) fail('forbidden', 'Esta ação é só para as famílias.');
    }
    const ctx = makeCtx(actor, state, env);
    if (!ctx.family && !ctx.system) {
      if (spec.perm) ctx.need(spec.perm);
      if (spec.anyPerm) ctx.needAny(spec.anyPerm);
    }
    const tx = createTx(state);
    let result;
    try {
      result = spec.run(tx, input && typeof input === 'object' && !Array.isArray(input) ? input : {}, ctx, env);
    } catch (e) {
      tx.rollback();
      throw e;
    }
    return {
      result: result === undefined ? null : result,
      changes: tx.changes(),
      befores: tx.befores(),
      undoable: !!spec.undoable && tx.size() > 0,
      summary: tx.summary || name,
      audit: tx.audit,
      effects: tx.effects,
    };
  }

  /**
   * Desfaz uma ação (record = {name, changes, befores, summary}) se os dados ainda forem os que ela deixou.
   * Confere de novo a permissão do comando original.
   */
  function undo(state, actor, record, envIn) {
    const spec = get(record.name);
    const env = makeEnv(envIn, state.settings);
    if (!spec || !spec.undoable) fail('forbidden', 'Esta ação não pode ser desfeita.');
    if (!actor || !perms.isActive(actor, env.today)) fail('unauthorized', 'Sua conta está inativa.');
    const ctx = makeCtx(actor, state, env);
    if (!ctx.family) {
      if (spec.perm) ctx.need(spec.perm);
      if (spec.anyPerm) ctx.needAny(spec.anyPerm);
    }
    const tx = createTx(state);
    try {
      for (const c of record.changes) {
        const kind = KINDS[c.coll];
        let cur;
        if (kind === 'single') cur = state.settings;
        else if (kind === 'list') cur = state[c.coll].find((d) => d.id === c.id);
        else cur = Object.prototype.hasOwnProperty.call(state[c.coll], c.id) ? state[c.coll][c.id] : undefined;
        if (canonical(cur) !== canonical(c.op === 'del' ? undefined : c.value)) fail('conflict', 'Não dá para desfazer: esses dados foram alterados depois.');
      }
      for (const b of record.befores) {
        const kind = KINDS[b.coll];
        if (kind === 'single') tx.settings(b.value);
        else if (kind === 'list') {
          if (b.value === undefined) tx.del(b.coll, b.id);
          else tx.put(b.coll, b.value);
        } else tx.set(b.coll, b.id, b.value);
      }
    } catch (e) {
      tx.rollback();
      throw e;
    }
    return { result: null, changes: tx.changes(), befores: tx.befores(), undoable: false, summary: `Desfez: ${record.summary || 'ação'}`, audit: record.audit || null, effects: [] };
  }

  return { KINDS, SINGLE_ID, SYSTEM, define, get, names, run, undo, revert, createTx, makeCtx, makeEnv, emptyState: schema.emptyState };
});
