'use strict';
/* API de ponta a ponta: instalação com código, login, CSRF, convites, sessões, idempotência, desfazer, arquivos e backup. */
const test = require('node:test');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const { assert } = require('./helpers');

const ROOT = path.join(__dirname, '..');
const freePort = () =>
  new Promise((resolve) => {
    const s = net.createServer();
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address();
      s.close(() => resolve(port));
    });
  });

async function startServer(extraEnv = {}, args = []) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'caderneta-test-'));
  const port = await freePort();
  const child = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', 'server/index.js', ...args], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', DATA_DIR: dir, ...extraEnv },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let out = '';
  child.stdout.on('data', (d) => (out += d));
  child.stderr.on('data', (d) => (out += d));
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 100; i++) {
    try {
      const r = await fetch(base + '/api/health');
      if (r.ok) break;
    } catch (e) {
      /* ainda subindo */
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  return { base, dir, child, log: () => out, stop: () => new Promise((r) => (child.exitCode != null ? r() : (child.once('exit', r), child.kill('SIGTERM')))) };
}

/** Cliente com cookie próprio (uma "pessoa"). */
function client(base) {
  let cookie = '';
  const call = async (method, p, body, headers = {}) => {
    const h = { 'X-Caderneta': '1', ...headers };
    if (cookie) h.Cookie = cookie;
    let payload;
    if (body !== undefined) {
      if (Buffer.isBuffer(body)) payload = body;
      else {
        h['Content-Type'] = 'application/json';
        payload = JSON.stringify(body);
      }
    }
    const res = await fetch(base + '/api' + p, { method, headers: h, body: payload });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0].endsWith('=') ? '' : set.split(';')[0];
    const type = res.headers.get('content-type') || '';
    const data = type.includes('json') ? await res.json() : Buffer.from(await res.arrayBuffer());
    return { status: res.status, data, headers: res.headers };
  };
  let n = 0;
  return {
    get: (p, h) => call('GET', p, undefined, h),
    post: (p, b, h) => call('POST', p, b === undefined ? {} : b, h),
    cmd: (name, input, extra = {}) => call('POST', '/cmd/' + name, { input, requestId: `req-${Date.now()}-${++n}-${Math.random().toString(36).slice(2, 8)}`, ...extra }),
    get cookie() {
      return cookie;
    },
  };
}

test('servidor real: instalação, contas, sessões e segurança', { timeout: 120000 }, async (t) => {
  const srv = await startServer();
  t.after(() => srv.stop());
  const anon = client(srv.base);

  // ----- instalação com código -----
  let r = await anon.get('/session');
  assert.equal(r.data.needsSetup, true);
  const token = fs.readFileSync(path.join(srv.dir, 'setup-token.txt'), 'utf8').trim();
  const owner = client(srv.base);
  r = await owner.post('/setup', { token: 'errado', schoolName: 'Escola Teste', name: 'Dona Diretora', email: 'diretora@teste.com', password: 'Ipe-Amarelo-2026' });
  assert.equal(r.status, 403);
  r = await owner.post('/setup', { token, schoolName: 'Escola Teste', name: 'Dona Diretora', email: 'diretora@teste.com', password: '12345678' });
  assert.equal(r.status, 400, 'senha fraca recusada');
  r = await owner.post('/setup', { token, schoolName: 'Escola Teste', name: 'Dona Diretora', email: 'diretora@teste.com', phone: '(11) 97777-1234', password: 'Ipe-Amarelo-2026' });
  assert.equal(r.status, 200);
  assert.ok(!fs.existsSync(path.join(srv.dir, 'setup-token.txt')), 'código de instalação some depois de usado');
  r = await anon.post('/setup', { token, schoolName: 'X', name: 'Y', email: 'y@y.com', password: 'Ipe-Amarelo-2026' });
  assert.ok(r.status === 409 || r.status === 403);
  r = await owner.get('/session');
  assert.equal(r.data.authenticated, true);
  assert.equal(r.data.me.owner, true);

  // ----- cabeçalhos e arquivos estáticos -----
  r = await anon.get('/health');
  assert.match(r.headers.get('content-security-policy') || '', /default-src 'self'/);
  assert.equal(r.headers.get('cache-control'), 'no-store');
  for (const p of ['/core/index.js', '/../server/api.js', '/%2e%2e/server/api.js', '/index.js']) {
    const res = await fetch(srv.base + p);
    assert.ok(res.status === 404 || !(await res.text()).includes('class Api'), `vazou ${p}`);
  }

  // ----- CSRF -----
  const csrf = await fetch(srv.base + '/api/cmd/subjects.save', { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: owner.cookie }, body: JSON.stringify({ input: { name: 'X' } }) });
  assert.equal(csrf.status, 403);
  r = await owner.post('/cmd/subjects.save', { input: { name: 'Robótica' } }, { Origin: 'https://evil.example' });
  assert.equal(r.status, 403);
  r = await owner.post('/cmd/subjects.save', { input: { name: 'Robótica' } }, { 'Sec-Fetch-Site': 'cross-site' });
  assert.equal(r.status, 403);

  // ----- idempotência -----
  const body = { input: { name: 'Robótica', short: 'ROB' }, requestId: 'idem-0001-abcdef' };
  const a1 = await owner.post('/cmd/subjects.save', body);
  const a2 = await owner.post('/cmd/subjects.save', body);
  assert.equal(a1.status, 200);
  assert.deepEqual(a2.data.result, a1.data.result);
  const snap = await owner.get('/snapshot');
  assert.equal(snap.data.data.subjects.filter((s) => s.name === 'Robótica').length, 1);

  // ----- turma, professora, convite e primeiro acesso -----
  r = await owner.cmd('classes.save', { name: '6º ano B', segment: 'Fundamental II', shift: 'Manhã', year: snap.data.data.settings.year });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const classId = r.data.result.id;
  r = await owner.cmd('users.save', { name: 'Paula Professora', role: 'professor', email: 'paula@teste.com', phone: '(11) 96666-5555', scope: 'vinculos', classIds: [classId] });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const paulaId = r.data.result.id;
  const invite = r.data.effects.find((e) => e.type === 'invite');
  assert.ok(invite.code && invite.link.includes('#acesso/'));
  const paula = client(srv.base);
  r = await paula.post('/invite/check', { code: invite.code.toLowerCase() });
  assert.equal(r.status, 200);
  assert.equal(r.data.name, 'Paula');
  r = await paula.post('/invite/accept', { code: invite.code, password: 'Giz-Colorido-77' });
  assert.equal(r.status, 200);
  r = await paula.post('/invite/accept', { code: invite.code, password: 'Giz-Colorido-77' });
  assert.equal(r.status, 400, 'código de uso único');
  r = await paula.get('/session');
  assert.equal(r.data.me.role, 'professor');
  assert.ok(!r.data.me.perms.includes('usuarios.gerenciar'));
  r = await paula.cmd('users.save', { name: 'Hacker', role: 'diretor', email: 'h@h.com' });
  assert.equal(r.status, 403);

  // login por e-mail e por celular; senha errada; limite de tentativas
  const p2 = client(srv.base);
  r = await p2.post('/login', { login: 'PAULA@teste.com', password: 'Giz-Colorido-77' });
  assert.equal(r.status, 200);
  const p3 = client(srv.base);
  r = await p3.post('/login', { login: '11 96666-5555', password: 'Giz-Colorido-77' });
  assert.equal(r.status, 200);
  const bad = client(srv.base);
  for (let i = 0; i < 5; i++) assert.equal((await bad.post('/login', { login: 'paula@teste.com', password: 'errada-' + i })).status, 401);
  r = await bad.post('/login', { login: 'paula@teste.com', password: 'Giz-Colorido-77' });
  assert.equal(r.status, 429, 'bloqueia depois de 5 erros');

  // ----- deltas: a professora vê a mudança feita pela diretora -----
  const ps = await paula.get('/snapshot');
  r = await owner.cmd('notices.save', { title: 'Reunião pedagógica', body: 'Quinta, 14h', audience: { who: 'equipe', segments: [], classIds: [] } });
  assert.equal(r.status, 200);
  r = await paula.get(`/changes?since=${ps.data.rev}&boot=${ps.data.boot}`);
  assert.ok(r.data.changes.some((c) => c.coll === 'notices' && c.value.title === 'Reunião pedagógica'));
  r = await paula.get(`/changes?since=${ps.data.rev}&boot=outro`);
  assert.equal(r.data.resync, true);

  // ----- desfazer: uso único -----
  const nid = (await owner.get('/snapshot')).data.data.notices.find((n) => n.title === 'Reunião pedagógica').id;
  r = await owner.cmd('notices.delete', { id: nid });
  assert.ok(r.data.undoToken);
  const tok = r.data.undoToken;
  assert.equal((await paula.post('/undo', { token: tok })).status, 409, 'token é da pessoa que fez');
  assert.equal((await owner.post('/undo', { token: tok })).status, 200, 'tentativa alheia não invalida o token');
  r = await owner.cmd('notices.save', { title: 'Outro aviso', body: 'x', audience: { who: 'equipe', segments: [], classIds: [] } });
  const nid2 = r.data.result.id;
  r = await owner.cmd('notices.delete', { id: nid2 });
  assert.equal((await owner.post('/undo', { token: r.data.undoToken })).status, 200);
  assert.equal((await owner.post('/undo', { token: r.data.undoToken })).status, 409);

  // ----- arquivos -----
  const png = Buffer.from('89504e470d0a1a0a0000000d4948445200000001000000010806000000', 'hex');
  r = await paula.post('/files', png, { 'Content-Type': 'application/octet-stream', 'X-File-Name': encodeURIComponent('foto.png') });
  assert.equal(r.status, 200);
  const fileId = r.data.id;
  r = await paula.post('/files', Buffer.from('<script>alert(1)</script>'), { 'Content-Type': 'application/octet-stream', 'X-File-Name': 'x.html' });
  assert.equal(r.status, 415);
  r = await paula.get('/files/' + fileId);
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-security-policy'), /sandbox/);
  r = await owner.get('/files/' + fileId);
  assert.equal(r.status, 404, 'arquivo solto só para quem enviou');

  // ----- desativar derruba a sessão -----
  r = await owner.cmd('users.status', { id: paulaId, status: 'inativo' });
  assert.equal(r.status, 200);
  assert.equal((await paula.get('/snapshot')).status, 401);
  assert.equal((await p2.get('/snapshot')).status, 401);

  // ----- backup cifrado e importação maliciosa -----
  r = await owner.post('/export', { password: 'errada', passphrase: 'frase-longa-de-backup' });
  assert.equal(r.status, 403);
  r = await owner.post('/export', { password: 'Ipe-Amarelo-2026', passphrase: 'frase-longa-de-backup' });
  assert.equal(r.status, 200);
  assert.equal(r.data.slice(0, 10).toString(), 'CADERNETA1');
  const cur = (await owner.get('/snapshot')).data.data;
  const evil = JSON.parse(JSON.stringify({ data: { settings: cur.settings, students: [{ id: '<img onerror=alert(1)>', name: 'X' }, { id: 'a00000001', name: '<b>Ana</b>', guardians: [] }], classes: [], users: [] } }));
  evil.data.settings.ownerId = 'u_invasor';
  const file = Buffer.from(JSON.stringify(evil).replace('"settings":{', '"__proto__":{"polluted":1},"settings":{')).toString('base64');
  r = await owner.post('/import', { file, password: 'Ipe-Amarelo-2026' });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const after = (await owner.get('/snapshot')).data;
  assert.deepEqual(after.data.students.map((s) => s.id), ['a00000001']);
  assert.equal(after.me.owner, true, 'importação nunca troca a titular');
  assert.ok(after.data.users.some((u) => u.email === 'diretora@teste.com'), 'contas atuais continuam');

  // ----- sair -----
  assert.equal((await owner.post('/logout')).status, 200);
  assert.equal((await owner.get('/snapshot')).status, 401);
});

test('servidor de demonstração: entrar como, retrato da família e consentimento', { timeout: 60000 }, async (t) => {
  const srv = await startServer({}, ['--demo']);
  t.after(() => srv.stop());
  const anon = client(srv.base);
  let r = await anon.get('/session');
  assert.equal(r.data.authenticated, false);
  assert.ok(r.data.accounts.length >= 8);
  const fam = r.data.accounts.find((a) => a.role === 'responsavel');
  const dir = r.data.accounts.find((a) => a.role === 'diretor');
  const f = client(srv.base);
  assert.equal((await f.post('/demo/login-as', { userId: fam.id })).status, 200);
  r = await f.get('/snapshot');
  assert.equal(r.data.me.family, true);
  assert.ok(r.data.data.students.length >= 1 && r.data.data.students.length <= 3);
  r = await f.cmd('grades.set', { studentId: r.data.data.students[0].id, subjectId: 's001', term: 4, value: 10 });
  assert.equal(r.status, 403);
  const d = client(srv.base);
  await d.post('/demo/login-as', { userId: dir.id });
  r = await d.get('/snapshot');
  const size = JSON.stringify(r.data).length;
  assert.ok(size < 3 * 1024 * 1024, `retrato da diretora: ${size} bytes`);
  // nova versão do aviso de privacidade pede novo aceite à família
  const ver = String(Number(r.data.data.settings.privacy.noticeVersion || 1) + 1);
  r = await d.cmd('settings.update', { patch: { privacy: { ...r.data.data.settings.privacy, bumpVersion: true } } });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  r = await f.get('/session');
  assert.equal(r.data.consent.required, true);
  assert.equal((await f.post('/consent', { version: ver })).status, 200);
  assert.equal((await f.get('/session')).data.consent.required, false);
});
