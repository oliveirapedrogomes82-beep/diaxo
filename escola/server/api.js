'use strict';
/* Rotas /api/*: sessão, instalação, convites, retrato, deltas, comandos, desfazer, arquivos, histórico, backup. */
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const Core = require('../web/core');
const auth = require('./auth');
const { HttpError, readJSON, sendJSON, sendError, parseCookies, cookie } = require('./http');
const { sniff, readBody } = require('./files');

const { engine: E, view: View, perms: Perms, util, schema, seed: Seed, migrate: Migrate } = Core;

const MIN = 60 * 1000;
const SESSION = {
  staff: { idle: 60 * MIN, absolute: 12 * 60 * MIN },
  family: { idle: 180 * 24 * 60 * MIN, absolute: 180 * 24 * 60 * MIN },
};
const UNDO_TTL = 15 * MIN;
const BUFFER_SIZE = 2000;

class Api {
  /**
   * @param {object} o { state, db, files, config: {publicUrl, secure, trustProxy, demo, setupToken, version}, log }
   */
  constructor(o) {
    Object.assign(this, o);
    this.commits = []; // [{rev, changes, befores}]
    this.undo = new Map(); // token → {userId, sessionHash, record, expires}
    this.fingerprints = new Map(); // sessionHash → impressão digital do contexto
    this.loginByAccount = new auth.RateLimiter({ max: 5, windowMs: 15 * MIN });
    this.loginByIp = new auth.RateLimiter({ max: 30, windowMs: 15 * MIN });
    this.codeByIp = new auth.RateLimiter({ max: 10, windowMs: 15 * MIN });
    this.cookieName = this.config.secure ? '__Host-cad_sid' : 'cad_sid';
    this.bootId = util.uid('b');
  }

  // ---------- utilidades ----------
  env(extra = {}) {
    const st = this.state.settings || {};
    return { now: new Date().toISOString(), today: util.today(st.timezone || 'America/Sao_Paulo'), newId: (p) => util.uid(p), ...extra };
  }
  ip(req) {
    const n = Number(this.config.trustProxy) || 0;
    if (n > 0) {
      const list = String(req.headers['x-forwarded-for'] || '').split(',').map((s) => s.trim()).filter(Boolean);
      if (list.length >= n) return list[list.length - n];
    }
    return req.socket.remoteAddress || '';
  }
  user(id) {
    return this.state.users.find((u) => u.id === id) || null;
  }
  findLogin(login) {
    const raw = String(login || '').trim().toLowerCase();
    if (!raw) return null;
    if (raw.includes('@')) return this.state.users.find((u) => u.email && u.email.toLowerCase() === raw) || null;
    const d = util.digits(raw);
    if (d.length < 10) return null;
    return this.state.users.find((u) => u.phone && util.digits(u.phone) === d) || null;
  }
  /** A conta pode usar o sistema? (ativa, com login, dentro da validade; família com pelo menos um vínculo liberado) */
  usable(u) {
    if (!u || !u.login || !Perms.isActive(u, this.env().today)) return false;
    if (Perms.isFamily(u)) return Perms.guardianOf(u, this.state).size > 0;
    return true;
  }
  sessionTimes(u) {
    return Perms.isFamily(u) ? SESSION.family : SESSION.staff;
  }

  /** Confere CSRF em toda requisição que altera algo. */
  checkOrigin(req) {
    if (req.headers['x-caderneta'] !== '1') throw new HttpError(403, 'forbidden', 'Requisição recusada.');
    const site = req.headers['sec-fetch-site'];
    if (site && site !== 'same-origin' && site !== 'none') throw new HttpError(403, 'forbidden', 'Requisição recusada.');
    const origin = req.headers.origin;
    if (origin && !this.allowedOrigins(req).includes(origin)) throw new HttpError(403, 'forbidden', 'Requisição recusada.');
  }
  allowedOrigins(req) {
    if (this.config.publicUrl) return [new URL(this.config.publicUrl).origin];
    const host = req.headers.host || '';
    return [`http://${host}`, `https://${host}`];
  }

  /** Sessão atual: {sid, tokenHash, user, mode} ou null. Renova a inatividade quando `touch`. */
  session(req, touch = true) {
    const token = parseCookies(req)[this.cookieName];
    if (!token || token.length > 100) return null;
    const tokenHash = auth.sha256(token);
    const s = this.db.getSession(tokenHash);
    if (!s) return null;
    const u = this.user(s.user_id);
    if (!this.usable(u) || (s.mode === 'familia' && !Perms.isFamily(u) && !Perms.guardianOf(u, this.state).size)) {
      this.db.deleteSession(tokenHash);
      return null;
    }
    if (touch) this.db.touchSession(tokenHash, s.idle_ms);
    return { tokenHash, user: u, mode: s.mode, record: s };
  }
  needSession(req, touch = true) {
    const s = this.session(req, touch);
    if (!s) throw new HttpError(401, 'unauthorized', 'Sua sessão terminou. Entre de novo.');
    return s;
  }
  startSession(req, res, u, mode) {
    const token = auth.newToken();
    const t = this.sessionTimes(u);
    this.db.createSession({ tokenHash: auth.sha256(token), userId: u.id, mode: mode || (Perms.isFamily(u) ? 'familia' : 'equipe'), absoluteMs: t.absolute, idleMs: t.idle, ip: this.ip(req), ua: req.headers['user-agent'] });
    res.setHeader('Set-Cookie', cookie(this.cookieName, token, { maxAge: t.absolute / 1000, secure: this.config.secure }));
    this.db.setLastLogin(u.id, new Date().toISOString());
  }
  viewEnv(s) {
    return this.env({ mode: s.mode === 'familia' ? 'familia' : undefined });
  }
  audit(s, cmd, summary, extra = {}, req = null) {
    this.db.addAudit({ at: new Date().toISOString(), userId: s && s.user ? s.user.id : extra.userId || null, userName: s && s.user ? s.user.name : extra.userName || null, cmd, summary, entity: extra.entity, ids: extra.ids, confidential: extra.confidential, ip: req ? this.ip(req) : null });
  }

  // ---------- roteamento ----------
  async handle(req, res, url) {
    const route = url.pathname.slice(4); // depois de "/api"
    try {
      if (req.method === 'POST' || req.method === 'PUT' || req.method === 'DELETE') this.checkOrigin(req);
      if (req.method === 'GET') {
        if (route === '/health') return sendJSON(req, res, 200, { ok: true, version: this.config.version, mode: this.config.demo ? 'demo' : 'servidor' });
        if (route === '/session') return this.getSession(req, res);
        if (route === '/snapshot') return this.getSnapshot(req, res, url);
        if (route === '/changes') return this.getChanges(req, res, url);
        if (route === '/audit') return this.getAudit(req, res, url);
        if (route.startsWith('/history/')) return this.getHistory(req, res, url, route.slice(9));
        if (route.startsWith('/files/')) return this.getFile(req, res, route.slice(7));
        if (route.startsWith('/preview/')) return this.getPreview(req, res, route.slice(9));
      }
      if (req.method === 'POST') {
        if (route === '/setup') return await this.postSetup(req, res);
        if (route === '/login') return await this.postLogin(req, res);
        if (route === '/logout') return this.postLogout(req, res, false);
        if (route === '/logout-all') return this.postLogout(req, res, true);
        if (route === '/password') return await this.postPassword(req, res);
        if (route === '/invite/check') return await this.postInviteCheck(req, res);
        if (route === '/invite/accept') return await this.postInviteAccept(req, res);
        if (route === '/consent') return await this.postConsent(req, res);
        if (route === '/mode') return await this.postMode(req, res);
        if (route.startsWith('/cmd/')) return await this.postCmd(req, res, decodeURIComponent(route.slice(5)));
        if (route === '/undo') return await this.postUndo(req, res);
        if (route === '/read') return await this.postRead(req, res);
        if (route === '/support/read') return await this.postSupportRead(req, res);
        if (route === '/files') return await this.postFile(req, res);
        if (route === '/export') return await this.postExport(req, res);
        if (route === '/import') return await this.postImport(req, res);
        if (route === '/demo/login-as' && this.config.demo) return await this.postDemoLogin(req, res);
      }
      throw new HttpError(404, 'not_found', 'Endereço não encontrado.');
    } catch (err) {
      return sendError(req, res, err);
    }
  }

  // ---------- sessão e instalação ----------
  getSession(req, res) {
    if (!this.state.users.length) return sendJSON(req, res, 200, { needsSetup: true, demo: !!this.config.demo });
    const s = this.session(req, false);
    if (!s) {
      const body = { authenticated: false, demo: !!this.config.demo, school: { name: this.state.settings.schoolName, privacy: this.state.settings.privacy } };
      if (this.config.demo) body.accounts = Seed.demoAccounts(this.state);
      return sendJSON(req, res, 200, body);
    }
    return sendJSON(req, res, 200, { authenticated: true, demo: !!this.config.demo, me: View.me(this.state, s.user, this.viewEnv(s)), consent: this.consentInfo(s.user) });
  }
  consentInfo(u) {
    const version = String((this.state.settings.privacy || {}).noticeVersion || '1');
    const c = this.db.getCredentials(u.id) || {};
    return { required: Perms.isFamily(u) && c.consent_version !== version, version, at: c.consent_at || null };
  }

  async postSetup(req, res) {
    const body = await readJSON(req, 20000);
    const ipKey = 'setup:' + this.ip(req);
    if (this.codeByIp.blocked(ipKey)) throw new HttpError(429, 'rate', 'Muitas tentativas. Aguarde alguns minutos.');
    if (this.state.users.length) throw new HttpError(409, 'conflict', 'Esta instalação já foi configurada.');
    const token = String(body.token || '').trim();
    const expected = this.config.setupToken || '';
    if (!expected || token.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expected))) {
      this.codeByIp.hit(ipKey);
      throw new HttpError(403, 'forbidden', 'Código de instalação incorreto. Ele aparece no terminal do servidor e no arquivo setup-token.txt.');
    }
    const name = util.V.str(body.name, 'Seu nome', { required: true, max: 120 });
    const email = util.V.email(body.email, 'E-mail', { required: true });
    const phone = util.V.phone(body.phone, 'Celular');
    const schoolName = util.V.str(body.schoolName, 'Nome da escola', { required: true, max: 120 });
    const problem = auth.passwordProblem(body.password, { name, email });
    if (problem) throw new HttpError(400, 'invalid', problem);
    const env = this.env();
    const st = Seed.empty(env.today);
    const owner = { id: util.uid('u'), name, title: 'Diretor(a)', role: 'diretor', email, phone, status: 'ativo', login: true, validUntil: null, grants: [], revokes: [], scope: 'todas', segments: [], classIds: [], linkedStudentIds: [], subjectIds: [], area: null, createdAt: env.now };
    st.users.push(owner);
    st.settings.schoolName = schoolName;
    st.settings.ownerId = owner.id;
    st.settings.privacy = { controller: schoolName, dpoName: name, dpoContact: email, noticeVersion: '1' };
    const hash = await auth.hashPassword(body.password);
    this.replaceState(st);
    this.db.setPasswordHash(owner.id, hash);
    this.config.consumeSetupToken();
    this.audit(null, 'setup', `Instalação concluída: escola ${schoolName}, conta titular ${name}`, { userId: owner.id, userName: name }, req);
    this.startSession(req, res, owner, 'equipe');
    return sendJSON(req, res, 200, { ok: true });
  }

  async postLogin(req, res) {
    const body = await readJSON(req, 10000);
    const ipKey = 'ip:' + this.ip(req);
    const login = String(body.login || '').trim().toLowerCase().slice(0, 160);
    const acctKey = 'acct:' + (login.includes('@') ? login : util.digits(login));
    const wait = Math.max(this.loginByIp.blocked(ipKey), this.loginByAccount.blocked(acctKey));
    if (wait) {
      res.setHeader('Retry-After', String(wait));
      throw new HttpError(429, 'rate', `Muitas tentativas. Tente de novo em ${Math.ceil(wait / 60)} minuto(s).`);
    }
    const u = this.findLogin(login);
    const cred = u ? this.db.getCredentials(u.id) : null;
    const ok = u && cred && cred.hash ? await auth.verifyPassword(String(body.password || ''), cred.hash) : await auth.dummyVerify(String(body.password || ''));
    if (!ok || !this.usable(u)) {
      this.loginByIp.hit(ipKey);
      this.loginByAccount.hit(acctKey);
      this.audit(null, 'login.falha', 'Tentativa de entrada recusada', { userId: u ? u.id : null, userName: u ? u.name : null }, req);
      throw new HttpError(401, 'unauthorized', 'E-mail, celular ou senha incorretos.');
    }
    this.loginByAccount.reset(acctKey);
    this.startSession(req, res, u);
    this.audit({ user: u }, 'login', 'Entrou no sistema', {}, req);
    return sendJSON(req, res, 200, { ok: true });
  }

  postLogout(req, res, all) {
    const s = this.session(req, false);
    if (s) {
      if (all) this.db.deleteUserSessions(s.user.id);
      else this.db.deleteSession(s.tokenHash);
      this.audit(s, all ? 'logout.todos' : 'logout', all ? 'Saiu de todos os dispositivos' : 'Saiu do sistema', {}, req);
    }
    res.setHeader('Set-Cookie', cookie(this.cookieName, '', { maxAge: 0, secure: this.config.secure }));
    return sendJSON(req, res, 200, { ok: true });
  }

  async postPassword(req, res) {
    const s = this.needSession(req);
    const body = await readJSON(req, 10000);
    const key = 'pw:' + s.user.id;
    if (this.loginByAccount.blocked(key)) throw new HttpError(429, 'rate', 'Muitas tentativas. Aguarde alguns minutos.');
    const cred = this.db.getCredentials(s.user.id);
    if (!cred || !cred.hash || !(await auth.verifyPassword(String(body.current || ''), cred.hash))) {
      this.loginByAccount.hit(key);
      throw new HttpError(400, 'invalid', 'A senha atual não confere.');
    }
    const problem = auth.passwordProblem(body.next, s.user);
    if (problem) throw new HttpError(400, 'invalid', problem);
    this.db.setPasswordHash(s.user.id, await auth.hashPassword(body.next));
    this.db.deleteUserSessions(s.user.id, s.tokenHash);
    this.audit(s, 'senha', 'Trocou a própria senha (outras sessões encerradas)', {}, req);
    return sendJSON(req, res, 200, { ok: true });
  }

  inviteFor(code) {
    const clean = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (clean.length !== 10) return null;
    const inv = this.db.getInvite(auth.sha256('invite:' + clean));
    if (!inv || inv.used_at || inv.expires_at < new Date().toISOString()) return null;
    const u = this.user(inv.user_id);
    if (!u || u.status !== 'ativo') return null;
    return { inv, user: u, hash: auth.sha256('invite:' + clean) };
  }
  async postInviteCheck(req, res) {
    const body = await readJSON(req, 2000);
    const ipKey = 'code:' + this.ip(req);
    if (this.codeByIp.blocked(ipKey)) throw new HttpError(429, 'rate', 'Muitas tentativas. Aguarde alguns minutos.');
    const found = this.inviteFor(body.code);
    if (!found) {
      this.codeByIp.hit(ipKey);
      throw new HttpError(400, 'invalid', 'Código inválido ou vencido. Peça um novo código à escola.');
    }
    const u = found.user;
    return sendJSON(req, res, 200, { ok: true, name: u.name.split(' ')[0], purpose: found.inv.purpose, login: u.email || u.phone, family: Perms.isFamily(u), privacy: this.state.settings.privacy, school: this.state.settings.schoolName });
  }
  async postInviteAccept(req, res) {
    const body = await readJSON(req, 10000);
    const ipKey = 'code:' + this.ip(req);
    if (this.codeByIp.blocked(ipKey)) throw new HttpError(429, 'rate', 'Muitas tentativas. Aguarde alguns minutos.');
    const found = this.inviteFor(body.code);
    if (!found) {
      this.codeByIp.hit(ipKey);
      throw new HttpError(400, 'invalid', 'Código inválido ou vencido. Peça um novo código à escola.');
    }
    const u = found.user;
    const problem = auth.passwordProblem(body.password, u);
    if (problem) throw new HttpError(400, 'invalid', problem);
    if (Perms.isFamily(u) && !body.consent) throw new HttpError(400, 'invalid', 'Para continuar, leia e aceite o aviso de privacidade.');
    if (!this.db.useInvite(found.hash)) throw new HttpError(400, 'invalid', 'Este código já foi usado.');
    this.db.setPasswordHash(u.id, await auth.hashPassword(body.password));
    this.db.deleteUserSessions(u.id);
    if (body.consent) this.db.setConsent(u.id, new Date().toISOString(), (this.state.settings.privacy || {}).noticeVersion || '1');
    this.audit({ user: u }, 'convite.aceito', found.inv.purpose === 'redefinicao' ? 'Criou uma nova senha com código de acesso' : 'Primeiro acesso: criou a senha', {}, req);
    if (!this.usable(u)) throw new HttpError(403, 'forbidden', 'Senha criada, mas o acesso ainda não está liberado. Fale com a escola.');
    this.startSession(req, res, u);
    return sendJSON(req, res, 200, { ok: true });
  }
  async postConsent(req, res) {
    const s = this.needSession(req);
    const body = await readJSON(req, 2000);
    const version = String((this.state.settings.privacy || {}).noticeVersion || '1');
    if (String(body.version) !== version) throw new HttpError(409, 'conflict', 'O aviso de privacidade foi atualizado. Leia a nova versão.');
    this.db.setConsent(s.user.id, new Date().toISOString(), version);
    this.audit(s, 'privacidade.aceite', `Aceitou o aviso de privacidade (versão ${version})`, {}, req);
    return sendJSON(req, res, 200, { ok: true });
  }
  /** Conta da equipe que também é responsável: alterna entre "Equipe" e "Portal da família". */
  async postMode(req, res) {
    const s = this.needSession(req);
    const body = await readJSON(req, 2000);
    const mode = body.mode === 'familia' ? 'familia' : 'equipe';
    if (Perms.isFamily(s.user)) throw new HttpError(403, 'forbidden', 'Conta de família.');
    if (mode === 'familia' && !Perms.guardianOf(s.user, this.state).size) throw new HttpError(403, 'forbidden', 'Você não está cadastrado(a) como responsável de nenhum aluno.');
    this.db.setSessionMode(s.tokenHash, mode);
    this.fingerprints.delete(s.tokenHash);
    return sendJSON(req, res, 200, { ok: true, mode });
  }

  // ---------- retrato e deltas ----------
  /** Último acesso, senha criada e convite pendente (dados fora do estado), só para quem gerencia contas. Nunca altera o estado. */
  annotateUsers(userId, permSet, users) {
    const staff = permSet.has('usuarios.gerenciar');
    const families = permSet.has('familias.acessos');
    if (!staff && !families) return users;
    const creds = this.db.allCredentials();
    const pending = this.db.pendingInvites();
    return users.map((u) => {
      if (!u || u.id === userId || !(staff || (u.role === 'responsavel' && families))) return u;
      const c = creds.get(u.id);
      return { ...u, lastLoginAt: c ? c.last_login_at : null, hasPassword: !!(c && c.has_password), invitePending: pending.get(u.id) || null };
    });
  }
  annotateChanges(s, env, changes) {
    if (!changes.some((c) => c.coll === 'users' && c.op === 'put')) return changes;
    const ctx = Perms.context(s.user, this.state, env);
    const annotated = this.annotateUsers(s.user.id, ctx.perms, changes.map((c) => (c.coll === 'users' && c.op === 'put' ? c.value : null)));
    return changes.map((c, i) => (annotated[i] ? { ...c, value: annotated[i] } : c));
  }
  snapshotFor(s) {
    const env = this.viewEnv(s);
    const snap = View.snapshot(this.state, s.user, env);
    snap.data.users = this.annotateUsers(s.user.id, new Set(snap.me.perms), snap.data.users);
    let reads = {};
    if (snap.me.family) for (const r of this.db.readsByUser(s.user.id)) reads[r.item_id] = { [s.user.id]: r.at };
    else if (snap.me.perms.includes('diario.ver')) {
      for (const r of this.db.readsFor(snap.data.diary.map((d) => d.id))) (reads[r.item_id] = reads[r.item_id] || {})[r.user_id] = r.at;
    }
    this.fingerprints.set(s.tokenHash, Perms.fingerprint(s.user, this.state, env));
    return { rev: this.db.rev, boot: this.bootId, now: env.now, me: snap.me, data: snap.data, reads };
  }
  /** "Visualizado" das famílias desde um instante, para a equipe que acompanha a agenda. */
  readsSince(s, env, since) {
    if (env.mode === 'familia' || Perms.isFamily(s.user) || !since || !Perms.context(s.user, this.state, env).perms.has('diario.ver')) return undefined;
    const f = View.makeFilter(this.state, s.user, env);
    const byId = new Map(this.state.diary.map((d) => [d.id, d]));
    return this.db.readsSince(since).filter((r) => f.diaryFor(byId.get(r.item_id))).map((r) => [r.item_id, r.user_id, r.at]);
  }
  getSnapshot(req, res) {
    const s = this.needSession(req);
    return sendJSON(req, res, 200, this.snapshotFor(s));
  }
  getChanges(req, res, url) {
    const s = this.needSession(req, false);
    const since = Number(url.searchParams.get('since'));
    const boot = url.searchParams.get('boot');
    const readsAfter = url.searchParams.get('readsSince');
    const rev = this.db.rev;
    const env = this.viewEnv(s);
    const fp = Perms.fingerprint(s.user, this.state, env);
    const oldest = this.commits.length ? this.commits[0].rev : rev + 1;
    if (boot !== this.bootId || !Number.isFinite(since) || since > rev || since < oldest - 1 || this.fingerprints.get(s.tokenHash) !== fp) return sendJSON(req, res, 200, { rev, resync: true });
    let changes = [];
    for (const c of this.commits) if (c.rev > since) changes.push(...View.visibleChanges(this.state, s.user, c.changes, c.befores, env));
    changes = this.annotateChanges(s, env, changes);
    const body = { rev, now: env.now, changes };
    const reads = readsAfter && !isNaN(Date.parse(readsAfter)) ? this.readsSince(s, env, new Date(readsAfter).toISOString()) : undefined;
    if (reads && reads.length) body.reads = reads;
    return sendJSON(req, res, 200, body);
  }

  // ---------- comandos ----------
  /** Executa um comando e grava (seção crítica síncrona). Devolve o registro do commit. */
  execute(s, name, input, req, { system = false } = {}) {
    const actor = system ? E.SYSTEM : s.user;
    const env = system ? this.env() : this.viewEnv(s);
    const fpBefore = s ? Perms.fingerprint(s.user, this.state, env) : null;
    const out = E.run(this.state, actor, name, input, env);
    return this.persist(out, name, s, req, env, fpBefore);
  }
  persist(out, name, s, req, env, fpBefore) {
    const invites = [];
    const endSessions = [];
    const deleteCredentials = [];
    const shown = [];
    for (const e of out.effects || []) {
      if (e.type === 'invite') {
        const clean = e.code.replace(/[^A-Z0-9]/g, '');
        const cred = this.db.getCredentials(e.userId);
        const purpose = e.purpose === 'redefinicao' && !(cred && cred.hash) ? 'convite' : e.purpose; // quem nunca criou senha recebe "primeiro acesso"
        invites.push({ codeHash: auth.sha256('invite:' + clean), userId: e.userId, purpose, expiresAt: e.expiresAt });
        shown.push({ type: 'invite', userId: e.userId, code: e.code, expiresAt: e.expiresAt, purpose, link: `${this.config.publicUrl || ''}/#acesso/${e.code}` });
      } else if (e.type === 'endSessions' && (!s || e.userId !== s.user.id)) endSessions.push(e.userId);
      else if (e.type === 'deleteCredentials') deleteCredentials.push(e.userId);
    }
    const actor = s ? s.user : E.SYSTEM;
    const auditRow = out.changes.length || out.audit ? { at: env.now, userId: actor.id, userName: actor.name, cmd: name, summary: out.summary, entity: out.audit && out.audit.entity, ids: out.audit && out.audit.ids, confidential: out.audit && out.audit.confidential, ip: req ? this.ip(req) : null } : null;
    let rev;
    try {
      rev = this.db.commit({ changes: out.changes, audit: auditRow, invites, endSessions, deleteCredentials });
    } catch (err) {
      E.revert(this.state, out.befores);
      throw err;
    }
    if (out.changes.length) {
      this.commits.push({ rev, changes: out.changes, befores: out.befores });
      if (this.commits.length > BUFFER_SIZE) this.commits.splice(0, this.commits.length - BUFFER_SIZE);
    }
    for (const e of out.effects || []) if (e.type === 'deleteFile') this.files.remove(e.id);
    return { out, rev, shown, fpBefore };
  }

  async postCmd(req, res, name) {
    const s = this.needSession(req);
    const limit = name === 'routines.save' || name === 'attendance.save' ? 400000 : 200000;
    const body = await readJSON(req, limit);
    const spec = E.get(name);
    if (!spec) throw new HttpError(404, 'not_found', 'Ação desconhecida. Atualize a página.');
    const requestId = typeof body.requestId === 'string' && /^[A-Za-z0-9-]{8,64}$/.test(body.requestId) ? body.requestId : null;
    if (requestId) {
      const prev = this.db.getRequest(s.user.id, requestId);
      if (prev) return sendJSON(req, res, 200, prev);
    }
    if (spec.reauth) {
      const cred = this.db.getCredentials(s.user.id);
      if (!cred || !cred.hash || !(await auth.verifyPassword(String(body.password || ''), cred.hash))) throw new HttpError(403, 'forbidden', 'Senha incorreta. Esta ação pede a sua senha.');
    }
    const { out, rev, shown, fpBefore } = this.execute(s, name, body.input, req);
    const env = this.viewEnv(s);
    const response = { result: out.result, rev, changes: this.annotateChanges(s, env, View.visibleChanges(this.state, s.user, out.changes, out.befores, env)) };
    if (shown.length) response.effects = shown;
    if (out.undoable) {
      const token = auth.newToken();
      this.undo.set(token, { userId: s.user.id, sessionHash: s.tokenHash, expires: Date.now() + UNDO_TTL, record: { name, changes: out.changes, befores: out.befores, summary: out.summary, audit: out.audit } });
      response.undoToken = token;
    }
    if (Perms.fingerprint(s.user, this.state, env) !== fpBefore) response.resync = true;
    if (requestId) this.db.putRequest(s.user.id, requestId, response.effects ? { ...response, effects: undefined, changes: [], resync: true } : response);
    return sendJSON(req, res, 200, response);
  }

  async postUndo(req, res) {
    const s = this.needSession(req);
    const body = await readJSON(req, 2000);
    const token = String(body.token || '');
    const u = this.undo.get(token);
    if (!u || u.userId !== s.user.id || u.sessionHash !== s.tokenHash || u.expires < Date.now()) throw new HttpError(409, 'conflict', 'Não é mais possível desfazer esta ação.');
    this.undo.delete(token);
    const env = this.viewEnv(s);
    const fpBefore = Perms.fingerprint(s.user, this.state, env);
    const out = E.undo(this.state, s.user, u.record, env);
    const { rev } = this.persist(out, 'desfazer:' + u.record.name, s, req, env, fpBefore);
    const response = { result: null, rev, changes: View.visibleChanges(this.state, s.user, out.changes, out.befores, env) };
    if (Perms.fingerprint(s.user, this.state, env) !== fpBefore) response.resync = true;
    return sendJSON(req, res, 200, response);
  }

  async postRead(req, res) {
    const s = this.needSession(req);
    const body = await readJSON(req, 20000);
    const env = this.viewEnv(s);
    if (!env.mode && !Perms.isFamily(s.user)) return sendJSON(req, res, 200, { ok: true });
    const f = View.makeFilter(this.state, s.user, env);
    const ids = (Array.isArray(body.itemIds) ? body.itemIds : []).filter((id) => util.isId(id)).slice(0, 200).filter((id) => f.diaryFor(this.state.diary.find((d) => d.id === id)));
    if (ids.length) this.db.addReads(ids, s.user.id, env.now);
    return sendJSON(req, res, 200, { ok: true, ids });
  }

  async postSupportRead(req, res) {
    const s = this.needSession(req);
    const body = await readJSON(req, 2000);
    const env = this.viewEnv(s);
    const r = this.state.support.find((x) => x.id === body.id);
    const f = View.makeFilter(this.state, s.user, env);
    if (!r || !f.supportReadable(r)) throw new HttpError(404, 'not_found', 'Registro não encontrado.');
    this.audit(s, 'support.read', 'Leu um registro de atendimento', { entity: 'support', ids: [r.id], confidential: true }, req);
    return sendJSON(req, res, 200, { id: r.id, content: r.content, nextSteps: r.nextSteps, addenda: r.addenda || [] });
  }

  getAudit(req, res, url) {
    const s = this.needSession(req);
    const all = !s.mode || s.mode !== 'familia' ? Perms.effective(s.user, this.state.settings).has('auditoria.ver') : false;
    const userId = url.searchParams.get('userId');
    const before = Number(url.searchParams.get('before')) || undefined;
    const rows = this.db.auditPage({ before, limit: url.searchParams.get('limit'), userId: all ? (userId && util.isId(userId) ? userId : null) : s.user.id });
    return sendJSON(req, res, 200, { items: rows });
  }

  getHistory(req, res, url, coll) {
    const s = this.needSession(req);
    if (!['diary', 'routines', 'messages', 'attendance', 'invoices', 'classes'].includes(coll)) throw new HttpError(404, 'not_found', 'Histórico não disponível.');
    const q = (k) => {
      const v = url.searchParams.get(k);
      return v && util.isId(v) ? v : null;
    };
    const before = url.searchParams.get('before');
    const out = View.history(this.state, s.user, coll, { classId: q('classId'), studentId: q('studentId'), before: before && util.isValidDate(before) ? before : null, limit: url.searchParams.get('limit') }, this.viewEnv(s));
    return sendJSON(req, res, 200, out);
  }

  getPreview(req, res, userId) {
    const s = this.needSession(req);
    const target = this.user(userId);
    if (!target || Perms.isFamily(s.user) || !Perms.canPreview(s.user, target, this.state)) throw new HttpError(404, 'not_found', 'Pessoa não encontrada.');
    this.audit(s, 'preview', `Visualizou o sistema como ${target.name}`, { entity: 'users', ids: [target.id] }, req);
    const snap = View.snapshot(this.state, target, this.env());
    return sendJSON(req, res, 200, { rev: this.db.rev, me: snap.me, data: snap.data, reads: {}, preview: true });
  }

  // ---------- arquivos ----------
  async postFile(req, res) {
    const s = this.needSession(req);
    const buf = await readBody(req).catch((e) => {
      throw new HttpError(e.status || 400, 'too_large', 'O arquivo passa de 10 MB.');
    });
    const type = sniff(buf);
    if (!type) throw new HttpError(415, 'invalid', 'Envie uma imagem (PNG, JPEG, WEBP) ou um PDF.');
    const name = decodeURIComponent(String(req.headers['x-file-name'] || '')).slice(0, 120);
    const id = util.uid('x');
    this.files.write(id, buf);
    try {
      this.execute(s, 'files.register', { id, name, type, size: buf.length }, req);
    } catch (err) {
      this.files.remove(id);
      throw err;
    }
    return sendJSON(req, res, 200, { id, name, type, size: buf.length });
  }
  getFile(req, res, id) {
    const s = this.needSession(req);
    const f = this.state.files.find((x) => x.id === id);
    const visible = f && View.makeFilter(this.state, s.user, this.viewEnv(s)).filter('files', f.id, f);
    const buf = visible ? this.files.read(f.id) : null;
    if (!buf) throw new HttpError(404, 'not_found', 'Arquivo não encontrado.');
    res.statusCode = 200;
    res.setHeader('Content-Type', f.type);
    res.setHeader('Content-Length', buf.length);
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox");
    res.setHeader('Content-Disposition', `${f.type === 'application/pdf' ? 'attachment' : 'inline'}; filename*=UTF-8''${encodeURIComponent(f.name)}`);
    res.end(buf);
  }

  // ---------- backup ----------
  async reauth(s, password) {
    const cred = this.db.getCredentials(s.user.id);
    if (!cred || !cred.hash || !(await auth.verifyPassword(String(password || ''), cred.hash))) throw new HttpError(403, 'forbidden', 'Senha incorreta.');
  }
  async postExport(req, res) {
    const s = this.needSession(req);
    if (!Perms.effective(s.user, this.state.settings).has('dados.backup')) throw new HttpError(403, 'forbidden', 'Seu acesso não permite fazer backup.');
    const body = await readJSON(req, 5000);
    await this.reauth(s, body.password);
    const passphrase = String(body.passphrase || '');
    if (passphrase.length < 10) throw new HttpError(400, 'invalid', 'A senha do backup precisa ter pelo menos 10 caracteres.');
    const payload = { app: 'caderneta-escolar', contract: schema.CONTRACT, exportedAt: new Date().toISOString(), data: this.state };
    const plain = zlib.gzipSync(Buffer.from(JSON.stringify(payload)));
    const salt = crypto.randomBytes(16);
    const iv = crypto.randomBytes(12);
    const key = crypto.scryptSync(passphrase, salt, 32, { N: 32768, r: 8, p: 1, maxmem: 96 * 1024 * 1024 });
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const enc = Buffer.concat([cipher.update(plain), cipher.final()]);
    const file = Buffer.concat([Buffer.from('CADERNETA1'), salt, iv, cipher.getAuthTag(), enc]);
    this.audit(s, 'backup.exportar', 'Exportou um backup cifrado de todos os dados', {}, req);
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="backup-caderneta-${new Date().toISOString().slice(0, 10)}.caderneta"`);
    res.setHeader('Cache-Control', 'no-store');
    res.end(file);
  }
  async postImport(req, res) {
    const s = this.needSession(req);
    if (this.state.settings.ownerId !== s.user.id) throw new HttpError(403, 'forbidden', 'Só a conta titular pode importar dados.');
    const body = await readJSON(req, 80 * 1024 * 1024);
    await this.reauth(s, body.password);
    let raw = Buffer.from(String(body.file || ''), 'base64');
    let data;
    try {
      if (raw.slice(0, 10).toString() === 'CADERNETA1') {
        const salt = raw.slice(10, 26), iv = raw.slice(26, 38), tag = raw.slice(38, 54);
        const key = crypto.scryptSync(String(body.passphrase || ''), salt, 32, { N: 32768, r: 8, p: 1, maxmem: 96 * 1024 * 1024 });
        const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
        decipher.setAuthTag(tag);
        raw = zlib.gunzipSync(Buffer.concat([decipher.update(raw.slice(54)), decipher.final()]));
      }
      const json = JSON.parse(raw.toString('utf8'));
      data = json && json.data ? json.data : json;
    } catch (e) {
      throw new HttpError(400, 'invalid', 'Não foi possível ler o arquivo. Confira o arquivo e a senha do backup.');
    }
    const env = this.env();
    const v1 = Migrate.isV1(data);
    const incoming = v1 ? Migrate.fromV1(data, env) : schema.cleanState(data).state;
    // a importação nunca troca contas, credenciais, sessões ou auditoria: as contas atuais ficam
    const current = new Map(this.state.users.map((u) => [u.id, u]));
    const users = this.state.users.slice();
    if (v1) for (const u of incoming.users) if (!current.has(u.id)) users.push({ ...u, login: false });
    const known = new Set(users.map((u) => u.id));
    const fix = (id) => (id && known.has(id) ? id : null);
    incoming.users = users;
    incoming.classes.forEach((c) => {
      c.teacherId = fix(c.teacherId);
      c.assistantIds = (c.assistantIds || []).filter((id) => known.has(id));
      for (const k of Object.keys(c.subjects || {})) c.subjects[k] = fix(c.subjects[k]);
    });
    incoming.students.forEach((st) => (st.guardians || []).forEach((g) => (g.userId = fix(g.userId))));
    incoming.settings = { ...incoming.settings, ownerId: this.state.settings.ownerId, demo: false };
    if (this.config.backupNow) await this.config.backupNow('antes-da-importacao');
    this.replaceState(incoming);
    this.audit(s, 'backup.importar', `Importou dados ${v1 ? 'da versão anterior' : 'de um backup'} (${incoming.students.length} alunos)`, {}, req);
    return sendJSON(req, res, 200, { ok: true, students: incoming.students.length, classes: incoming.classes.length, v1 });
  }

  async postDemoLogin(req, res) {
    const body = await readJSON(req, 2000);
    const u = this.user(body.userId);
    if (!u || !this.usable(u)) throw new HttpError(404, 'not_found', 'Conta de exemplo não encontrada.');
    this.startSession(req, res, u);
    return sendJSON(req, res, 200, { ok: true });
  }

  /** Troca o estado inteiro (instalação, importação) e força todos os clientes a recarregar. */
  replaceState(next) {
    for (const k of Object.keys(this.state)) delete this.state[k];
    Object.assign(this.state, next);
    this.db.replaceState(this.state);
    this.commits = [];
    this.undo.clear();
    this.fingerprints.clear();
    this.bootId = util.uid('b');
  }

  // ---------- agendador ----------
  tick() {
    const env = this.env();
    if (this.state.diary.some((d) => d.status === 'agendado' && d.publishAt && d.publishAt <= env.now)) {
      try {
        this.execute(null, 'diary.release', {}, null, { system: true });
      } catch (e) {
        this.log('[agendador] falha ao publicar itens agendados:', e.message);
      }
    }
    for (const [token, u] of this.undo) if (u.expires < Date.now()) this.undo.delete(token);
    this.loginByAccount.sweep();
    this.loginByIp.sweep();
    this.codeByIp.sweep();
    this.db.purgeExpired();
  }
  dailyCleanup() {
    try {
      this.execute(null, 'files.cleanup', {}, null, { system: true });
    } catch (e) {
      this.log('[agendador] limpeza de arquivos:', e.message);
    }
  }
}

module.exports = { Api, SESSION };
