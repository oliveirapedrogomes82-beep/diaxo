'use strict';
/* Persistência em SQLite (node:sqlite, sem dependências).
   - docs: um registro por documento de cada coleção do estado (JSON) — carregado em memória na inicialização.
   - credentials, sessions, invites, reads, requests, audit: fora do estado.
   commit() grava as mudanças de um comando, a auditoria e os efeitos numa única transação. */
const fs = require('node:fs');
const path = require('node:path');
const sqlite = require('node:sqlite');

class Database {
  /** @param {string} file caminho do .db (ou ':memory:') @param {object} kinds coleção → 'single'|'list'|'map' */
  constructor(file, kinds) {
    this.file = file;
    this.kinds = kinds;
    if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
    this.db = new sqlite.DatabaseSync(file);
    this.db.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL; PRAGMA busy_timeout = 5000;');
    this.migrate();
    this.prepare();
  }

  migrate() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS docs (coll TEXT NOT NULL, id TEXT NOT NULL, data TEXT NOT NULL, rev INTEGER NOT NULL, PRIMARY KEY (coll, id));
      CREATE TABLE IF NOT EXISTS credentials (
        user_id TEXT PRIMARY KEY, hash TEXT, updated_at TEXT,
        last_login_at TEXT, consent_at TEXT, consent_version TEXT
      );
      CREATE TABLE IF NOT EXISTS sessions (
        token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, mode TEXT NOT NULL DEFAULT 'equipe',
        created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, idle_until INTEGER NOT NULL, idle_ms INTEGER NOT NULL,
        ip TEXT, ua TEXT
      );
      CREATE INDEX IF NOT EXISTS sessions_user ON sessions (user_id);
      CREATE TABLE IF NOT EXISTS invites (
        code_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, purpose TEXT NOT NULL,
        created_at TEXT NOT NULL, expires_at TEXT NOT NULL, used_at TEXT
      );
      CREATE INDEX IF NOT EXISTS invites_user ON invites (user_id);
      CREATE TABLE IF NOT EXISTS reads (item_id TEXT NOT NULL, user_id TEXT NOT NULL, at TEXT NOT NULL, PRIMARY KEY (item_id, user_id));
      CREATE TABLE IF NOT EXISTS requests (user_id TEXT NOT NULL, request_id TEXT NOT NULL, at INTEGER NOT NULL, response TEXT NOT NULL, PRIMARY KEY (user_id, request_id));
      CREATE TABLE IF NOT EXISTS audit (
        id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT NOT NULL, user_id TEXT, user_name TEXT,
        cmd TEXT NOT NULL, summary TEXT NOT NULL, entity TEXT, ids TEXT, confidential INTEGER NOT NULL DEFAULT 0, ip TEXT
      );
      CREATE INDEX IF NOT EXISTS audit_user ON audit (user_id, id);
    `);
  }

  prepare() {
    const p = (sql) => this.db.prepare(sql);
    this.q = {
      getMeta: p('SELECT value FROM meta WHERE key = ?'),
      setMeta: p('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'),
      allDocs: p('SELECT coll, id, data FROM docs ORDER BY rowid'),
      anyDoc: p('SELECT 1 FROM docs LIMIT 1'),
      putDoc: p('INSERT INTO docs (coll, id, data, rev) VALUES (?, ?, ?, ?) ON CONFLICT(coll, id) DO UPDATE SET data = excluded.data, rev = excluded.rev'),
      delDoc: p('DELETE FROM docs WHERE coll = ? AND id = ?'),
      clearDocs: p('DELETE FROM docs'),
      getCred: p('SELECT * FROM credentials WHERE user_id = ?'),
      allCreds: p('SELECT user_id, last_login_at, consent_at, consent_version, hash IS NOT NULL AS has_password FROM credentials'),
      setHash: p('INSERT INTO credentials (user_id, hash, updated_at) VALUES (?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET hash = excluded.hash, updated_at = excluded.updated_at'),
      setLogin: p('INSERT INTO credentials (user_id, last_login_at) VALUES (?, ?) ON CONFLICT(user_id) DO UPDATE SET last_login_at = excluded.last_login_at'),
      setConsent: p('INSERT INTO credentials (user_id, consent_at, consent_version) VALUES (?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET consent_at = excluded.consent_at, consent_version = excluded.consent_version'),
      delCred: p('DELETE FROM credentials WHERE user_id = ?'),
      getSession: p('SELECT * FROM sessions WHERE token_hash = ?'),
      putSession: p('INSERT INTO sessions (token_hash, user_id, mode, created_at, expires_at, idle_until, idle_ms, ip, ua) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'),
      touchSession: p('UPDATE sessions SET idle_until = ? WHERE token_hash = ?'),
      setSessionMode: p('UPDATE sessions SET mode = ? WHERE token_hash = ?'),
      delSession: p('DELETE FROM sessions WHERE token_hash = ?'),
      delUserSessions: p('DELETE FROM sessions WHERE user_id = ?'),
      delUserSessionsExcept: p('DELETE FROM sessions WHERE user_id = ? AND token_hash <> ?'),
      delExpired: p('DELETE FROM sessions WHERE expires_at < ? OR idle_until < ?'),
      userSessions: p('SELECT token_hash, created_at, idle_until, ip, ua FROM sessions WHERE user_id = ?'),
      putInvite: p('INSERT INTO invites (code_hash, user_id, purpose, created_at, expires_at) VALUES (?, ?, ?, ?, ?)'),
      getInvite: p('SELECT * FROM invites WHERE code_hash = ?'),
      useInvite: p('UPDATE invites SET used_at = ? WHERE code_hash = ? AND used_at IS NULL'),
      dropUserInvites: p('UPDATE invites SET used_at = ? WHERE user_id = ? AND used_at IS NULL'),
      purgeInvites: p('DELETE FROM invites WHERE expires_at < ?'),
      pendingInvites: p('SELECT user_id, MAX(expires_at) AS expires_at FROM invites WHERE used_at IS NULL AND expires_at > ? GROUP BY user_id'),
      putRead: p('INSERT INTO reads (item_id, user_id, at) VALUES (?, ?, ?) ON CONFLICT(item_id, user_id) DO NOTHING'),
      readsFor: p('SELECT item_id, user_id, at FROM reads WHERE item_id IN (SELECT value FROM json_each(?))'),
      readsByUser: p('SELECT item_id, at FROM reads WHERE user_id = ?'),
      readsSince: p('SELECT item_id, user_id, at FROM reads WHERE at > ? ORDER BY at LIMIT 5000'),
      getRequest: p('SELECT response FROM requests WHERE user_id = ? AND request_id = ?'),
      putRequest: p('INSERT OR REPLACE INTO requests (user_id, request_id, at, response) VALUES (?, ?, ?, ?)'),
      purgeRequests: p('DELETE FROM requests WHERE at < ?'),
      addAudit: p('INSERT INTO audit (at, user_id, user_name, cmd, summary, entity, ids, confidential, ip) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'),
      auditPage: p('SELECT id, at, user_id AS userId, user_name AS userName, cmd, summary, entity, ids, confidential FROM audit WHERE id < ? ORDER BY id DESC LIMIT ?'),
      auditPageUser: p('SELECT id, at, user_id AS userId, user_name AS userName, cmd, summary, entity, ids, confidential FROM audit WHERE user_id = ? AND id < ? ORDER BY id DESC LIMIT ?'),
    };
  }

  transaction(fn) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const out = fn();
      this.db.exec('COMMIT');
      return out;
    } catch (e) {
      try {
        this.db.exec('ROLLBACK');
      } catch (e2) {
        /* já desfeita */
      }
      throw e;
    }
  }

  // ---------- meta ----------
  getMeta(key) {
    const r = this.q.getMeta.get(key);
    return r ? r.value : null;
  }
  setMeta(key, value) {
    this.q.setMeta.run(key, String(value));
  }
  get rev() {
    return Number(this.getMeta('rev') || 0);
  }
  isEmpty() {
    return !this.q.anyDoc.get();
  }

  // ---------- estado ----------
  loadState(base) {
    const state = base;
    for (const row of this.q.allDocs.iterate()) {
      const kind = this.kinds[row.coll];
      if (!kind) continue;
      const value = JSON.parse(row.data);
      if (kind === 'single') state[row.coll] = { ...state[row.coll], ...value };
      else if (kind === 'list') state[row.coll].push(value);
      else state[row.coll][row.id] = value;
    }
    return state;
  }
  _putChanges(changes, rev) {
    for (const c of changes) {
      if (!this.kinds[c.coll]) continue;
      if (c.op === 'del') this.q.delDoc.run(c.coll, String(c.id));
      else this.q.putDoc.run(c.coll, String(c.id), JSON.stringify(c.value), rev);
    }
  }

  /**
   * Grava, numa transação: mudanças do estado, linha de auditoria e efeitos (convites, sessões encerradas,
   * credenciais apagadas). Devolve a nova revisão.
   */
  commit({ changes = [], audit = null, invites = [], endSessions = [], deleteCredentials = [] }) {
    return this.transaction(() => {
      let rev = this.rev;
      if (changes.length) {
        rev += 1;
        this._putChanges(changes, rev);
        this.setMeta('rev', rev);
      }
      if (audit) this.q.addAudit.run(audit.at, audit.userId || null, audit.userName || null, audit.cmd, String(audit.summary).slice(0, 500), audit.entity || null, audit.ids ? JSON.stringify(audit.ids).slice(0, 2000) : null, audit.confidential ? 1 : 0, audit.ip || null);
      for (const inv of invites) {
        this.q.dropUserInvites.run(new Date().toISOString(), inv.userId);
        this.q.putInvite.run(inv.codeHash, inv.userId, inv.purpose, new Date().toISOString(), inv.expiresAt);
      }
      for (const uid of endSessions) this.q.delUserSessions.run(uid);
      for (const uid of deleteCredentials) this.q.delCred.run(uid);
      return rev;
    });
  }

  /** Substitui todo o estado (importação, dados de exemplo). */
  replaceState(state) {
    return this.transaction(() => {
      const rev = this.rev + 1;
      this.q.clearDocs.run();
      for (const [coll, kind] of Object.entries(this.kinds)) {
        const v = state[coll];
        if (v == null) continue;
        if (kind === 'single') this.q.putDoc.run(coll, 'school', JSON.stringify(v), rev);
        else if (kind === 'list') for (const doc of v) this.q.putDoc.run(coll, String(doc.id), JSON.stringify(doc), rev);
        else for (const k of Object.keys(v)) this.q.putDoc.run(coll, k, JSON.stringify(v[k]), rev);
      }
      this.setMeta('rev', rev);
      return rev;
    });
  }

  // ---------- credenciais ----------
  getCredentials(userId) {
    return this.q.getCred.get(userId) || null;
  }
  allCredentials() {
    const out = new Map();
    for (const r of this.q.allCreds.all()) out.set(r.user_id, r);
    return out;
  }
  setPasswordHash(userId, hash) {
    this.q.setHash.run(userId, hash, new Date().toISOString());
  }
  setLastLogin(userId, at) {
    this.q.setLogin.run(userId, at);
  }
  setConsent(userId, at, version) {
    this.q.setConsent.run(userId, at, String(version));
  }

  // ---------- sessões ----------
  createSession({ tokenHash, userId, mode = 'equipe', absoluteMs, idleMs, ip, ua }) {
    const now = Date.now();
    this.q.putSession.run(tokenHash, userId, mode, now, now + absoluteMs, now + idleMs, idleMs, String(ip || '').slice(0, 64), String(ua || '').slice(0, 200));
  }
  getSession(tokenHash) {
    const s = this.q.getSession.get(tokenHash);
    if (!s) return null;
    const now = Date.now();
    if (s.expires_at < now || s.idle_until < now) {
      this.q.delSession.run(tokenHash);
      return null;
    }
    return s;
  }
  touchSession(tokenHash, idleMs) {
    this.q.touchSession.run(Date.now() + idleMs, tokenHash);
  }
  setSessionMode(tokenHash, mode) {
    this.q.setSessionMode.run(mode, tokenHash);
  }
  deleteSession(tokenHash) {
    this.q.delSession.run(tokenHash);
  }
  deleteUserSessions(userId, exceptTokenHash = null) {
    if (exceptTokenHash) this.q.delUserSessionsExcept.run(userId, exceptTokenHash);
    else this.q.delUserSessions.run(userId);
  }
  purgeExpired() {
    const now = Date.now();
    this.q.delExpired.run(now, now);
    this.q.purgeInvites.run(new Date(now - 30 * 86400000).toISOString());
    this.q.purgeRequests.run(now - 86400000);
  }

  // ---------- convites ----------
  getInvite(codeHash) {
    return this.q.getInvite.get(codeHash) || null;
  }
  useInvite(codeHash) {
    return this.q.useInvite.run(new Date().toISOString(), codeHash).changes === 1;
  }
  pendingInvites() {
    const out = new Map();
    for (const r of this.q.pendingInvites.all(new Date().toISOString())) out.set(r.user_id, r.expires_at);
    return out;
  }

  // ---------- leituras ("visualizado") ----------
  addReads(itemIds, userId, at) {
    this.transaction(() => {
      for (const id of itemIds) this.q.putRead.run(id, userId, at);
    });
  }
  readsFor(itemIds) {
    if (!itemIds.length) return [];
    return this.q.readsFor.all(JSON.stringify(itemIds));
  }
  readsByUser(userId) {
    return this.q.readsByUser.all(userId);
  }
  readsSince(at) {
    return this.q.readsSince.all(at);
  }

  // ---------- idempotência ----------
  getRequest(userId, requestId) {
    const r = this.q.getRequest.get(userId, requestId);
    return r ? JSON.parse(r.response) : null;
  }
  putRequest(userId, requestId, response) {
    this.q.putRequest.run(userId, requestId, Date.now(), JSON.stringify(response));
  }

  // ---------- auditoria ----------
  addAudit(a) {
    this.q.addAudit.run(a.at, a.userId || null, a.userName || null, a.cmd, String(a.summary).slice(0, 500), a.entity || null, a.ids ? JSON.stringify(a.ids).slice(0, 2000) : null, a.confidential ? 1 : 0, a.ip || null);
  }
  auditPage({ before = Number.MAX_SAFE_INTEGER, limit = 100, userId = null } = {}) {
    const lim = Math.max(1, Math.min(500, Number(limit) || 100));
    const rows = userId ? this.q.auditPageUser.all(userId, before, lim) : this.q.auditPage.all(before, lim);
    return rows.map((r) => ({ ...r, ids: r.ids ? JSON.parse(r.ids) : [], confidential: !!r.confidential }));
  }

  // ---------- backup ----------
  /** Cópia consistente do banco (sqlite.backup, assíncrona) + pasta de arquivos; mantém as `keep` mais recentes. */
  async backup(dir, filesDir, keep = 14, stamp = new Date().toISOString().slice(0, 10)) {
    if (this.file === ':memory:') return null;
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    const target = path.join(dir, `caderneta-${stamp}.db`);
    if (fs.existsSync(target)) fs.unlinkSync(target);
    await sqlite.backup(this.db, target);
    fs.chmodSync(target, 0o600);
    if (filesDir && fs.existsSync(filesDir)) {
      const fdest = path.join(dir, `arquivos-${stamp}`);
      fs.rmSync(fdest, { recursive: true, force: true });
      fs.cpSync(filesDir, fdest, { recursive: true });
    }
    const all = fs.readdirSync(dir);
    const dbs = all.filter((f) => /^caderneta-\d{4}-\d{2}-\d{2}[\w-]*\.db$/.test(f)).sort();
    while (dbs.length > keep) fs.unlinkSync(path.join(dir, dbs.shift()));
    const fds = all.filter((f) => /^arquivos-\d{4}-\d{2}-\d{2}/.test(f)).sort();
    while (fds.length > keep) fs.rmSync(path.join(dir, fds.shift()), { recursive: true, force: true });
    return target;
  }

  close() {
    try {
      this.db.close();
    } catch (e) {
      /* já fechado */
    }
  }
}

module.exports = { Database };
