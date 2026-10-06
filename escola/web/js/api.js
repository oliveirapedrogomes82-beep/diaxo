'use strict';
/* Conexão com os dados.
   - HttpBackend: o servidor da escola (padrão). Sem conexão = tela "sem conexão"; nunca cai para a demonstração.
   - LocalBackend: demonstração que roda o mesmo núcleo no navegador (dados em IndexedDB deste navegador).
     Só é usado por escolha explícita: arquivo aberto direto (file:) ou página publicada com
     window.CADERNETA_MODE = 'demo'. */
class ApiError extends Error {
  constructor(code, message, status = 0, field = null, data = null) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.field = field;
    this.data = data;
  }
}

const Api = (() => {
  const isLocal = location.protocol === 'file:' || window.CADERNETA_MODE === 'demo';

  // =====================================================================
  // Servidor
  // =====================================================================
  const HttpBackend = () => {
    const req = async (method, path, body, { raw: rawBody = false, headers = {}, blob = false } = {}) => {
      let res;
      try {
        res = await fetch('/api' + path, {
          method,
          credentials: 'same-origin',
          cache: 'no-store',
          headers: { 'X-Caderneta': '1', ...(body !== undefined && !rawBody ? { 'Content-Type': 'application/json' } : {}), ...headers },
          body: rawBody ? body : body !== undefined ? JSON.stringify(body) : undefined,
        });
      } catch (e) {
        throw new ApiError('network', 'Sem conexão com o servidor da escola. Confira a internet e tente de novo.');
      }
      const type = res.headers.get('content-type') || '';
      if (blob && res.ok && !type.includes('application/json')) return res.blob();
      let data = null;
      if (type.includes('application/json')) data = await res.json().catch(() => null);
      if (!res.ok) {
        const e = (data && data.error) || {};
        const fallback = res.status === 502 || res.status === 503 || res.status === 504 ? 'O servidor da escola não respondeu. Tente de novo em instantes.' : 'Algo deu errado no servidor.';
        throw new ApiError(e.code || (res.status >= 500 ? 'server' : 'invalid'), e.message || fallback, res.status, e.field || null, data);
      }
      if (!data) throw new ApiError('server', 'O servidor respondeu de um jeito inesperado.', res.status);
      return data;
    };
    const qs = (params) => {
      const p = new URLSearchParams();
      for (const [k, v] of Object.entries(params || {})) if (v != null && v !== '') p.set(k, v);
      const s = p.toString();
      return s ? '?' + s : '';
    };
    return {
      kind: 'http',
      health: () => req('GET', '/health'),
      /** {authenticated, me, consent, demo, accounts?} — 401 vira {authenticated:false,…}; {needsSetup} em instalação nova. */
      async session() {
        try {
          return await req('GET', '/session');
        } catch (err) {
          if (err.status === 401 && err.data) return { ...err.data, authenticated: false };
          throw err;
        }
      },
      setup: (body) => req('POST', '/setup', body),
      login: (login, password) => req('POST', '/login', { login, password }),
      logout: () => req('POST', '/logout', {}),
      logoutAll: () => req('POST', '/logout-all', {}),
      password: (current, next) => req('POST', '/password', { current, next }),
      inviteCheck: (code) => req('POST', '/invite/check', { code }),
      inviteAccept: (code, password, consent) => req('POST', '/invite/accept', { code, password, consent }),
      consent: (version) => req('POST', '/consent', { version }),
      mode: (mode) => req('POST', '/mode', { mode }),
      snapshot: () => req('GET', '/snapshot'),
      changes: (since, boot) => req('GET', `/changes${qs({ since, boot })}`),
      cmd: (name, input, requestId, password) => req('POST', '/cmd/' + encodeURIComponent(name), { input, requestId, password }),
      undo: (token) => req('POST', '/undo', { token }),
      read: (itemIds) => req('POST', '/read', { itemIds }),
      supportRead: (id) => req('POST', '/support/read', { id }),
      history: (coll, params) => req('GET', `/history/${coll}${qs(params)}`),
      audit: (params) => req('GET', `/audit${qs(params)}`),
      preview: (userId) => req('GET', '/preview/' + encodeURIComponent(userId)),
      async uploadFile(file) {
        return req('POST', '/files', file, { raw: true, headers: { 'Content-Type': 'application/octet-stream', 'X-File-Name': encodeURIComponent(file.name || 'arquivo') } });
      },
      fileUrl: (id) => '/api/files/' + encodeURIComponent(id),
      exportBackup: (password, passphrase) => req('POST', '/export', { password, passphrase }, { blob: true }),
      importBackup: (fileBase64, password, passphrase) => req('POST', '/import', { file: fileBase64, password, passphrase }),
      demoLoginAs: (userId) => req('POST', '/demo/login-as', { userId }),
      resetDemo: null,
    };
  };

  // =====================================================================
  // Demonstração no navegador
  // =====================================================================
  const LocalBackend = () => {
    const { engine: E, view: View, perms: Perms, util, schema, seed: Seed, migrate: Migrate } = Core;
    const DB_NAME = 'caderneta-demo';
    const DB_VERSION = 1;
    const SESSION_KEY = 'caderneta.demo.sessao';
    const MIN = 60 * 1000;

    let state = null;
    let meta = { logins: {}, consents: {}, reads: {} }; // reads: itemId → {userId: at}
    let creds = {}; // userId → sha256(senha)
    let invites = {}; // códigoLimpo → {userId, purpose, expiresAt, usedAt}
    let audit = [];
    let auditSeq = 0;
    let session = null; // {userId, mode}
    let rev = 0;
    let bootId = util.uid('b');
    let commits = [];
    const undoTokens = new Map();
    const files = new Map(); // id → Blob
    const fileUrls = new Map();
    let fingerprint = null;
    let stale = false;
    let idb = null;
    let persistent = true;

    // ---------- IndexedDB ----------
    const openDb = () =>
      new Promise((resolve) => {
        try {
          const r = indexedDB.open(DB_NAME, DB_VERSION);
          r.onupgradeneeded = () => r.result.createObjectStore('kv');
          r.onsuccess = () => resolve(r.result);
          r.onerror = () => resolve(null);
          r.onblocked = () => resolve(null);
        } catch (e) {
          resolve(null);
        }
      });
    const idbGet = (key) =>
      new Promise((resolve) => {
        if (!idb) return resolve(undefined);
        try {
          const r = idb.transaction('kv').objectStore('kv').get(key);
          r.onsuccess = () => resolve(r.result);
          r.onerror = () => resolve(undefined);
        } catch (e) {
          resolve(undefined);
        }
      });
    const idbPut = (entries) =>
      new Promise((resolve) => {
        if (!idb) return resolve(false);
        try {
          const tx = idb.transaction('kv', 'readwrite');
          const os = tx.objectStore('kv');
          for (const [k, v] of entries) v === undefined ? os.delete(k) : os.put(v, k);
          tx.oncomplete = () => resolve(true);
          tx.onerror = () => resolve(false);
          tx.onabort = () => resolve(false);
        } catch (e) {
          resolve(false);
        }
      });
    const idbClear = () =>
      new Promise((resolve) => {
        if (!idb) return resolve();
        try {
          const tx = idb.transaction('kv', 'readwrite');
          tx.objectStore('kv').clear();
          tx.oncomplete = () => resolve();
          tx.onerror = () => resolve();
        } catch (e) {
          resolve();
        }
      });

    const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('caderneta-demo') : null;
    if (channel) channel.onmessage = (e) => e.data && e.data.type === 'saved' && (stale = true);

    let saveTimer = null;
    const save = () => {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(flush, 300);
    };
    const flush = async () => {
      clearTimeout(saveTimer);
      saveTimer = null;
      if (!idb || !state) return;
      const ok = await idbPut([
        ['state', JSON.stringify(state)],
        ['meta', JSON.stringify({ meta, creds, invites, auditSeq })],
        ['audit', JSON.stringify(audit.slice(0, 1000))],
        ['rev', rev],
        ['dataVersion', schema.DATA_VERSION],
      ]);
      persistent = ok;
      if (ok && channel) channel.postMessage({ type: 'saved' });
    };
    window.addEventListener('pagehide', () => saveTimer && flush());

    const readSession = () => {
      try {
        const s = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
        return s && typeof s.userId === 'string' ? s : null;
      } catch (e) {
        return null;
      }
    };
    const writeSession = (s) => {
      session = s;
      try {
        if (s) localStorage.setItem(SESSION_KEY, JSON.stringify(s));
        else localStorage.removeItem(SESSION_KEY);
      } catch (e) {
        /* sem armazenamento: vale só nesta aba */
      }
    };

    const fresh = () => {
      const { state: st, meta: m } = Seed.demoWithMeta(util.today('America/Sao_Paulo'));
      state = st;
      meta = { logins: { ...m.logins }, consents: { ...m.consents }, reads: {} };
      for (const [item, uid, at] of m.reads) (meta.reads[item] = meta.reads[item] || {})[uid] = at;
      creds = {};
      invites = {};
      audit = [];
      auditSeq = 0;
      rev = 1;
      commits = [];
    };

    const loadFromDb = async () => {
      const [rawState, rawMeta, rawAudit, savedRev, savedVersion] = await Promise.all([idbGet('state'), idbGet('meta'), idbGet('audit'), idbGet('rev'), idbGet('dataVersion')]);
      if (!rawState) return false;
      try {
        const parsed = JSON.parse(rawState);
        const version = Number(savedVersion) || schema.DATA_VERSION;
        const cleaned = schema.cleanState(parsed).state;
        state = version < schema.DATA_VERSION ? Migrate.upgrade(cleaned, version) : cleaned;
        const m = rawMeta ? JSON.parse(rawMeta) : {};
        meta = m.meta || { logins: {}, consents: {}, reads: {} };
        meta.reads = meta.reads || {};
        creds = m.creds || {};
        invites = m.invites || {};
        auditSeq = m.auditSeq || 0;
        audit = rawAudit ? JSON.parse(rawAudit) : [];
        rev = Number(savedRev) || 1;
        commits = [];
        bootId = util.uid('b');
        return true;
      } catch (e) {
        return false;
      }
    };

    const loadFiles = async () => {
      const ids = (await idbGet('files')) || [];
      for (const id of ids) {
        const b = await idbGet('file:' + id);
        if (b instanceof Blob) files.set(id, b);
      }
    };
    const saveFiles = () => idbPut([['files', [...files.keys()]]]);

    const init = async () => {
      idb = await openDb();
      persistent = !!idb;
      const ok = await loadFromDb();
      if (!ok) {
        fresh();
        await flush();
      }
      await loadFiles();
      session = readSession();
    };

    // ---------- utilidades ----------
    const env = (extra = {}) => ({ now: new Date().toISOString(), today: util.today((state.settings && state.settings.timezone) || 'America/Sao_Paulo'), newId: (p) => util.uid(p), ...extra });
    const user = (id) => state.users.find((u) => u.id === id) || null;
    const usable = (u) => {
      if (!u || !u.login || !Perms.isActive(u, env().today)) return false;
      if (Perms.isFamily(u)) return Perms.guardianOf(u, state).size > 0;
      return true;
    };
    const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
    const fail = (code, message, status = 400, field = null) => {
      throw new ApiError(code, message, status, field);
    };
    const STATUS = { forbidden: 403, invalid: 400, not_found: 404, conflict: 409, unauthorized: 401 };
    const wrap = (fn) => {
      try {
        return fn();
      } catch (err) {
        if (err instanceof ApiError) throw err;
        if (err && err.name === 'CmdError') throw new ApiError(err.code, err.message, STATUS[err.code] || 400, err.field || null);
        console.error(err);
        throw new ApiError('server', 'Erro interno da demonstração. Recarregue a página.', 500);
      }
    };
    const sha = async (text) => {
      try {
        const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('caderneta-demo:' + text));
        return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
      } catch (e) {
        let h = 0;
        for (const c of 'caderneta-demo:' + text) h = (h * 31 + c.charCodeAt(0)) >>> 0;
        return 'h' + h.toString(16);
      }
    };
    const viewEnv = () => env({ mode: session && session.mode === 'familia' ? 'familia' : undefined });
    const current = () => {
      if (!session) return null;
      const u = user(session.userId);
      if (!usable(u)) {
        writeSession(null);
        return null;
      }
      return u;
    };
    const needUser = () => {
      const u = current();
      if (!u) fail('unauthorized', 'Sua sessão terminou. Entre de novo.', 401);
      return u;
    };
    const addAudit = (u, cmd, summary, extra = {}) => {
      audit.unshift({ id: ++auditSeq, at: new Date().toISOString(), userId: u ? u.id : null, userName: u ? u.name : 'Sistema', cmd, summary, entity: extra.entity || null, ids: extra.ids || [], confidential: !!extra.confidential });
      if (audit.length > 1000) audit.length = 1000;
    };
    const consentInfo = (u) => {
      const version = String((state.settings.privacy || {}).noticeVersion || '1');
      const c = meta.consents[u.id] || {};
      return { required: Perms.isFamily(u) && c.version !== version, version, at: c.at || null };
    };
    const pendingInvite = (userId) => {
      const now = new Date().toISOString();
      let best = null;
      for (const inv of Object.values(invites)) if (inv.userId === userId && !inv.usedAt && inv.expiresAt > now && (!best || inv.expiresAt > best)) best = inv.expiresAt;
      return best;
    };

    /** Executa e grava um comando (mesma sequência do servidor). */
    const execute = (u, name, input, { system = false } = {}) => {
      const actor = system ? E.SYSTEM : u;
      const e = system ? env() : viewEnv();
      const out = wrap(() => E.run(state, actor, name, input, e));
      const shown = [];
      for (const ef of out.effects || []) {
        if (ef.type === 'invite') {
          const clean = ef.code.replace(/[^A-Z0-9]/g, '');
          invites[clean] = { userId: ef.userId, purpose: ef.purpose, expiresAt: ef.expiresAt, usedAt: null };
          shown.push({ type: 'invite', userId: ef.userId, code: ef.code, expiresAt: ef.expiresAt, purpose: ef.purpose, link: `${location.href.split('#')[0]}#acesso/${ef.code}` });
        } else if (ef.type === 'deleteCredentials') delete creds[ef.userId];
        else if (ef.type === 'deleteFile') {
          files.delete(ef.id);
          idbPut([['file:' + ef.id, undefined]]).then(saveFiles);
        }
      }
      if (out.changes.length || out.audit) addAudit(system ? null : u, name, out.summary, out.audit || {});
      if (out.changes.length) {
        rev += 1;
        commits.push({ rev, changes: out.changes, befores: out.befores });
        if (commits.length > 300) commits.splice(0, commits.length - 300);
      }
      save();
      return { out, shown };
    };

    const snapshotFor = (u) => {
      const e = viewEnv();
      const snap = View.snapshot(state, u, e);
      for (const x of snap.data.users) {
        if (x.id === u.id || (!snap.me.perms.includes('usuarios.gerenciar') && !(x.role === 'responsavel' && snap.me.perms.includes('familias.acessos')))) continue;
        x.lastLoginAt = meta.logins[x.id] || null;
        x.hasPassword = !!creds[x.id];
        x.invitePending = pendingInvite(x.id);
      }
      const reads = {};
      if (snap.me.family) {
        for (const [item, by] of Object.entries(meta.reads)) if (by[u.id]) reads[item] = { [u.id]: by[u.id] };
      } else if (snap.me.perms.includes('diario.ver')) {
        for (const d of snap.data.diary) if (meta.reads[d.id]) reads[d.id] = { ...meta.reads[d.id] };
      }
      fingerprint = Perms.fingerprint(u, state, e);
      return clone({ rev, boot: bootId, me: snap.me, data: snap.data, reads });
    };

    const startSession = (u, mode) => {
      writeSession({ userId: u.id, mode: mode || (Perms.isFamily(u) ? 'familia' : 'equipe') });
      meta.logins[u.id] = new Date().toISOString();
      fingerprint = null;
      save();
    };

    const tick = () => {
      if (!state) return;
      const now = new Date().toISOString();
      if (state.diary.some((d) => d.status === 'agendado' && d.publishAt && d.publishAt <= now)) {
        try {
          execute(null, 'diary.release', {}, { system: true });
        } catch (e) {
          /* nada a publicar */
        }
      }
      for (const [t, x] of undoTokens) if (x.expires < Date.now()) undoTokens.delete(t);
    };
    setInterval(tick, 30 * 1000);

    const sniff = async (blob) => {
      const b = new Uint8Array(await blob.slice(0, 12).arrayBuffer());
      const ascii = (from, to) => String.fromCharCode(...b.slice(from, to));
      if (b.length >= 8 && b[0] === 0x89 && ascii(1, 4) === 'PNG') return 'image/png';
      if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
      if (b.length >= 12 && ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'image/webp';
      if (b.length >= 5 && ascii(0, 5) === '%PDF-') return 'application/pdf';
      return null;
    };

    const ready = init();
    const api = {
      kind: 'local',
      get persistent() {
        return persistent;
      },
      async health() {
        await ready;
        return { ok: true, version: 'demo', mode: 'demo' };
      },
      async session() {
        await ready;
        if (stale) {
          await loadFromDb();
          stale = false;
        }
        const u = current();
        if (!u) return { authenticated: false, demo: true, local: true, school: { name: state.settings.schoolName, privacy: state.settings.privacy }, accounts: Seed.demoAccounts(state) };
        return { authenticated: true, demo: true, local: true, me: clone(View.me(state, u, viewEnv())), consent: consentInfo(u) };
      },
      async setup() {
        fail('conflict', 'A demonstração já vem com uma escola de exemplo.', 409);
      },
      async login(login, password) {
        await ready;
        const raw = String(login || '').trim().toLowerCase();
        const d = util.digits(raw);
        const u = raw.includes('@') ? state.users.find((x) => x.email && x.email.toLowerCase() === raw) : d.length >= 10 ? state.users.find((x) => x.phone && util.digits(x.phone) === d) : null;
        if (!u || !creds[u.id] || creds[u.id] !== (await sha(password)) || !usable(u)) {
          fail('unauthorized', u && !creds[u.id] && usable(u) ? 'Na demonstração, as contas de exemplo não têm senha: use "Entrar como" logo abaixo.' : 'E-mail, celular ou senha incorretos.', 401);
        }
        startSession(u);
        addAudit(u, 'login', 'Entrou no sistema');
        return { ok: true };
      },
      async logout() {
        const u = session && user(session.userId);
        if (u) addAudit(u, 'logout', 'Saiu do sistema');
        writeSession(null);
        save();
        return { ok: true };
      },
      async logoutAll() {
        return api.logout();
      },
      async password(currentPw, next) {
        const u = needUser();
        if (creds[u.id] && creds[u.id] !== (await sha(currentPw))) fail('invalid', 'A senha atual não confere.');
        if (String(next || '').length < 8) fail('invalid', 'A senha precisa ter pelo menos 8 caracteres.');
        creds[u.id] = await sha(next);
        addAudit(u, 'senha', 'Trocou a própria senha');
        save();
        return { ok: true };
      },
      async inviteCheck(code) {
        await ready;
        const clean = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
        const inv = invites[clean];
        const u = inv && user(inv.userId);
        if (!inv || inv.usedAt || inv.expiresAt < new Date().toISOString() || !u || u.status !== 'ativo') fail('invalid', 'Código inválido ou vencido. Peça um novo código à escola.');
        return { ok: true, name: u.name.split(' ')[0], purpose: inv.purpose, login: u.email || u.phone, family: Perms.isFamily(u), privacy: state.settings.privacy, school: state.settings.schoolName };
      },
      async inviteAccept(code, password, consent) {
        await api.inviteCheck(code);
        const clean = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
        const inv = invites[clean];
        const u = user(inv.userId);
        if (String(password || '').length < 8) fail('invalid', 'A senha precisa ter pelo menos 8 caracteres.');
        if (Perms.isFamily(u) && !consent) fail('invalid', 'Para continuar, leia e aceite o aviso de privacidade.');
        inv.usedAt = new Date().toISOString();
        creds[u.id] = await sha(password);
        if (consent) meta.consents[u.id] = { at: new Date().toISOString(), version: String((state.settings.privacy || {}).noticeVersion || '1') };
        addAudit(u, 'convite.aceito', 'Primeiro acesso: criou a senha');
        if (!usable(u)) fail('forbidden', 'Senha criada, mas o acesso ainda não está liberado. Fale com a escola.', 403);
        startSession(u);
        return { ok: true };
      },
      async consent(version) {
        const u = needUser();
        const v = String((state.settings.privacy || {}).noticeVersion || '1');
        if (String(version) !== v) fail('conflict', 'O aviso de privacidade foi atualizado. Leia a nova versão.', 409);
        meta.consents[u.id] = { at: new Date().toISOString(), version: v };
        addAudit(u, 'privacidade.aceite', `Aceitou o aviso de privacidade (versão ${v})`);
        save();
        return { ok: true };
      },
      async mode(mode) {
        const u = needUser();
        const m = mode === 'familia' ? 'familia' : 'equipe';
        if (Perms.isFamily(u)) fail('forbidden', 'Conta de família.', 403);
        if (m === 'familia' && !Perms.guardianOf(u, state).size) fail('forbidden', 'Você não está cadastrado(a) como responsável de nenhum aluno.', 403);
        writeSession({ ...session, mode: m });
        fingerprint = null;
        return { ok: true, mode: m };
      },
      async snapshot() {
        await ready;
        return snapshotFor(needUser());
      },
      async changes(since, boot) {
        await ready;
        if (stale) {
          await loadFromDb();
          stale = false;
          return { rev, resync: true };
        }
        const u = needUser();
        const e = viewEnv();
        const oldest = commits.length ? commits[0].rev : rev + 1;
        if (boot !== bootId || !Number.isFinite(Number(since)) || since > rev || since < oldest - 1 || Perms.fingerprint(u, state, e) !== fingerprint) return { rev, resync: true };
        const out = [];
        for (const c of commits) if (c.rev > since) out.push(...View.visibleChanges(state, u, c.changes, c.befores, e));
        return clone({ rev, changes: out });
      },
      async cmd(name, input, requestId, password) {
        await ready;
        if (stale) {
          await loadFromDb();
          stale = false;
        }
        const u = needUser();
        const spec = E.get(name);
        if (!spec) fail('not_found', 'Ação desconhecida. Atualize a página.', 404);
        if (spec.reauth && creds[u.id] && creds[u.id] !== (await sha(password))) fail('forbidden', 'Senha incorreta. Esta ação pede a sua senha.', 403);
        const e = viewEnv();
        const fpBefore = Perms.fingerprint(u, state, e);
        const { out, shown } = execute(u, name, clone(input));
        const response = { result: clone(out.result), rev, changes: clone(View.visibleChanges(state, u, out.changes, out.befores, e)) };
        if (shown.length) response.effects = shown;
        if (out.undoable) {
          const token = util.uid('t') + util.uid('k');
          undoTokens.set(token, { userId: u.id, expires: Date.now() + 15 * MIN, record: { name, changes: out.changes, befores: out.befores, summary: out.summary, audit: out.audit } });
          response.undoToken = token;
        }
        if (Perms.fingerprint(u, state, e) !== fpBefore) response.resync = true;
        return response;
      },
      async undo(token) {
        const u = needUser();
        const x = undoTokens.get(token);
        undoTokens.delete(token);
        if (!x || x.userId !== u.id || x.expires < Date.now()) fail('conflict', 'Não é mais possível desfazer esta ação.', 409);
        const e = viewEnv();
        const fpBefore = Perms.fingerprint(u, state, e);
        const out = wrap(() => E.undo(state, u, x.record, e));
        addAudit(u, 'desfazer:' + x.record.name, out.summary, out.audit || {});
        if (out.changes.length) {
          rev += 1;
          commits.push({ rev, changes: out.changes, befores: out.befores });
        }
        save();
        const response = { result: null, rev, changes: clone(View.visibleChanges(state, u, out.changes, out.befores, e)) };
        if (Perms.fingerprint(u, state, e) !== fpBefore) response.resync = true;
        return response;
      },
      async read(itemIds) {
        const u = needUser();
        const e = viewEnv();
        if (!e.mode && !Perms.isFamily(u)) return { ok: true };
        const f = View.makeFilter(state, u, e);
        const ids = (Array.isArray(itemIds) ? itemIds : []).filter((id) => util.isId(id)).slice(0, 200).filter((id) => f.diaryFor(state.diary.find((d) => d.id === id)));
        for (const id of ids) {
          meta.reads[id] = meta.reads[id] || {};
          if (!meta.reads[id][u.id]) meta.reads[id][u.id] = e.now;
        }
        save();
        return { ok: true, ids };
      },
      async supportRead(id) {
        const u = needUser();
        const r = state.support.find((x) => x.id === id);
        const f = View.makeFilter(state, u, viewEnv());
        if (!r || !f.supportReadable(r)) fail('not_found', 'Registro não encontrado.', 404);
        addAudit(u, 'support.read', 'Leu um registro de atendimento', { entity: 'support', ids: [r.id], confidential: true });
        save();
        return clone({ id: r.id, content: r.content, nextSteps: r.nextSteps, addenda: r.addenda || [] });
      },
      async history(coll, params = {}) {
        const u = needUser();
        if (!['diary', 'routines', 'messages', 'attendance', 'invoices'].includes(coll)) fail('not_found', 'Histórico não disponível.', 404);
        return clone(View.history(state, u, coll, params, viewEnv()));
      },
      async audit(params = {}) {
        const u = needUser();
        const all = !(session.mode === 'familia') && Perms.effective(u, state.settings).has('auditoria.ver');
        const before = Number(params.before) || Infinity;
        const lim = Math.max(1, Math.min(500, Number(params.limit) || 100));
        const who = all ? params.userId || null : u.id;
        return { items: clone(audit.filter((r) => r.id < before && (!who || r.userId === who)).slice(0, lim)) };
      },
      async preview(userId) {
        const u = needUser();
        const target = user(userId);
        if (!target || !Perms.dominates(u, target, state)) fail('not_found', 'Pessoa não encontrada.', 404);
        addAudit(u, 'preview', `Visualizou o sistema como ${target.name}`, { entity: 'users', ids: [target.id] });
        const snap = View.snapshot(state, target, env());
        return clone({ rev, me: snap.me, data: snap.data, reads: {}, preview: true });
      },
      async uploadFile(file) {
        const u = needUser();
        if (file.size > 10 * 1024 * 1024) fail('too_large', 'O arquivo passa de 10 MB.', 413);
        const type = await sniff(file);
        if (!type) fail('invalid', 'Envie uma imagem (PNG, JPEG, WEBP) ou um PDF.', 415);
        const id = util.uid('x');
        const name = String(file.name || 'arquivo').slice(0, 120);
        const blob = new Blob([await file.arrayBuffer()], { type });
        files.set(id, blob);
        try {
          execute(u, 'files.register', { id, name, type, size: blob.size });
        } catch (err) {
          files.delete(id);
          throw err;
        }
        await idbPut([['file:' + id, blob]]);
        await saveFiles();
        return { id, name, type, size: blob.size };
      },
      fileUrl(id) {
        if (fileUrls.has(id)) return fileUrls.get(id);
        const b = files.get(id);
        if (!b) return '#';
        const url = URL.createObjectURL(b);
        fileUrls.set(id, url);
        return url;
      },
      /** Na demonstração o backup é um JSON simples (sem cifra), só para levar os dados. */
      async exportBackup() {
        const u = needUser();
        if (!Perms.effective(u, state.settings).has('dados.backup')) fail('forbidden', 'Seu acesso não permite fazer backup.', 403);
        addAudit(u, 'backup.exportar', 'Exportou os dados da demonstração');
        return new Blob([JSON.stringify({ app: 'caderneta-escolar', contract: schema.CONTRACT, exportedAt: new Date().toISOString(), data: state })], { type: 'application/json' });
      },
      async importBackup(fileBase64) {
        const u = needUser();
        if (state.settings.ownerId !== u.id) fail('forbidden', 'Só a conta titular pode importar dados.', 403);
        let data;
        try {
          const bin = atob(String(fileBase64 || ''));
          const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
          const text = new TextDecoder().decode(bytes);
          if (text.startsWith('CADERNETA1')) fail('invalid', 'Backups cifrados do servidor só podem ser importados no servidor.');
          const json = JSON.parse(text);
          data = json && json.data ? json.data : json;
        } catch (e) {
          if (e instanceof ApiError) throw e;
          fail('invalid', 'Não foi possível ler o arquivo. Confira se é um backup da Caderneta.');
        }
        const e = env();
        const v1 = Migrate.isV1(data);
        const incoming = wrap(() => (v1 ? Migrate.fromV1(data, e) : schema.cleanState(data).state));
        const users = state.users.slice();
        const known0 = new Set(users.map((x) => x.id));
        if (v1) for (const x of incoming.users) if (!known0.has(x.id)) users.push({ ...x, login: false });
        const known = new Set(users.map((x) => x.id));
        const fix = (id) => (id && known.has(id) ? id : null);
        incoming.users = users;
        incoming.classes.forEach((c) => {
          c.teacherId = fix(c.teacherId);
          c.assistantIds = (c.assistantIds || []).filter((id) => known.has(id));
          for (const k of Object.keys(c.subjects || {})) c.subjects[k] = fix(c.subjects[k]);
        });
        incoming.students.forEach((st) => (st.guardians || []).forEach((g) => (g.userId = fix(g.userId))));
        incoming.settings = { ...incoming.settings, ownerId: state.settings.ownerId, demo: true };
        state = incoming;
        commits = [];
        undoTokens.clear();
        bootId = util.uid('b');
        rev += 1;
        addAudit(u, 'backup.importar', `Importou dados ${v1 ? 'da versão anterior' : 'de um backup'} (${incoming.students.length} alunos)`);
        await flush();
        return { ok: true, students: incoming.students.length, classes: incoming.classes.length, v1 };
      },
      async demoLoginAs(userId) {
        await ready;
        const u = user(userId);
        if (!u || !usable(u)) fail('not_found', 'Conta de exemplo não encontrada.', 404);
        startSession(u);
        addAudit(u, 'login', 'Entrou no sistema (demonstração)');
        return { ok: true };
      },
      /** Volta a demonstração ao estado inicial (apaga o que foi feito neste navegador). */
      async resetDemo() {
        await idbClear();
        files.clear();
        fileUrls.forEach((url) => URL.revokeObjectURL(url));
        fileUrls.clear();
        fresh();
        bootId = util.uid('b');
        writeSession(null);
        await flush();
        return { ok: true };
      },
    };
    return api;
  };

  const backend = isLocal ? LocalBackend() : HttpBackend();
  backend.isLocal = isLocal;
  backend.ApiError = ApiError;
  return backend;
})();
