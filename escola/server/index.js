'use strict';
/* Caderneta Escolar — servidor.
   Uso:
     node server/index.js                      servidor normal (dados em DATA_DIR, padrão ./data)
     node server/index.js --demo               demonstração: banco em memória com a escola de exemplo
     node server/index.js --reset-owner-password   gera um código para a conta titular criar nova senha
     node server/index.js --reset-password=<e-mail ou celular>   idem para qualquer conta (ex.: psicóloga, que a direção não redefine)
   Variáveis: PORT, HOST, PUBLIC_URL, DATA_DIR, TRUST_PROXY, ALLOW_INSECURE_HTTP, SETUP_TOKEN. */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const [major, minor] = process.versions.node.split('.').map(Number);
if (major < 22 || (major === 22 && minor < 16)) {
  console.error(`A Caderneta precisa do Node.js 22.16 ou mais novo (este é ${process.versions.node}).`);
  process.exit(1);
}

const Core = require('../web/core');
const { Database } = require('./db');
const { Api } = require('./api');
const { FileStore } = require('./files');
const { setSecurityHeaders, staticHandler, sendJSON } = require('./http');
const auth = require('./auth');

const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
const args = new Set(process.argv.slice(2));
const DEMO = args.has('--demo') || process.env.DEMO === '1';
const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '127.0.0.1';
const PUBLIC_URL = (process.env.PUBLIC_URL || '').replace(/\/+$/, '');
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(__dirname, '..', 'data'));
const LOOPBACK = ['127.0.0.1', '::1', 'localhost'].includes(HOST);
const SECURE = PUBLIC_URL.startsWith('https://');
const log = (...a) => console.log(new Date().toISOString().slice(0, 19).replace('T', ' '), ...a);

function fail(msg) {
  console.error('\n  ' + msg + '\n');
  process.exit(1);
}

if (PUBLIC_URL && !/^https?:\/\/[^/]+$/.test(PUBLIC_URL)) fail('PUBLIC_URL deve ser só a origem, por exemplo https://escola.exemplo.com.br');
if (!LOOPBACK && !DEMO && !SECURE && process.env.ALLOW_INSECURE_HTTP !== '1') {
  fail('Fora do próprio computador o servidor precisa de HTTPS. Defina PUBLIC_URL=https://seu-endereco (com o TLS feito por um proxy, como o Caddy)\n  ou, só em rede de testes, ALLOW_INSECURE_HTTP=1. Veja docs/IMPLANTACAO.md.');
}

// ---------- dados ----------
let db;
let files;
let setupToken = null;
const tokenFile = path.join(DATA_DIR, 'setup-token.txt');

if (DEMO) {
  db = new Database(':memory:', Core.schema.KINDS);
  files = new FileStore(null);
} else {
  fs.mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });
  try {
    fs.chmodSync(DATA_DIR, 0o700);
  } catch (e) {
    /* sistema sem permissões POSIX */
  }
  // instância única por pasta de dados
  const lock = path.join(DATA_DIR, 'caderneta.lock');
  try {
    const fd = fs.openSync(lock, 'wx');
    fs.writeSync(fd, String(process.pid));
    fs.closeSync(fd);
  } catch (e) {
    const pid = Number(fs.readFileSync(lock, 'utf8'));
    let alive = false;
    try {
      process.kill(pid, 0);
      alive = pid !== process.pid;
    } catch (e2) {
      alive = false;
    }
    if (alive) fail(`Já existe um servidor da Caderneta usando ${DATA_DIR} (processo ${pid}).`);
    fs.writeFileSync(lock, String(process.pid));
  }
  const releaseLock = () => {
    try {
      if (Number(fs.readFileSync(lock, 'utf8')) === process.pid) fs.unlinkSync(lock);
    } catch (e) {
      /* já liberado */
    }
  };
  process.on('exit', releaseLock);
  db = new Database(path.join(DATA_DIR, 'caderneta.db'), Core.schema.KINDS);
  files = new FileStore(path.join(DATA_DIR, 'files'));
}

const state = Core.schema.emptyState();
if (DEMO) {
  const { state: demo, meta } = Core.seed.demoWithMeta(Core.util.today('America/Sao_Paulo'));
  Object.assign(state, demo);
  db.replaceState(state);
  for (const [uid, at] of Object.entries(meta.logins)) db.setLastLogin(uid, at);
  for (const [uid, c] of Object.entries(meta.consents)) db.setConsent(uid, c.at, c.version);
  db.transaction(() => {
    for (const [item, uid, at] of meta.reads) db.q.putRead.run(item, uid, at);
  });
} else {
  db.loadState(state);
  const version = Number(db.getMeta('dataVersion') || Core.schema.DATA_VERSION);
  if (version < Core.schema.DATA_VERSION) {
    Object.assign(state, Core.migrate.upgrade(state, version));
    db.replaceState(state);
  }
  db.setMeta('dataVersion', Core.schema.DATA_VERSION);
}

// ---------- CLI: código de nova senha (titular, ou qualquer conta pelo e-mail/celular) ----------
const resetArg = process.argv.find((a) => a.startsWith('--reset-password='));
if (args.has('--reset-owner-password') || resetArg) {
  let target;
  if (resetArg) {
    const login = resetArg.slice('--reset-password='.length).trim().toLowerCase();
    const d = Core.util.digits(login);
    target = state.users.find((u) => (login.includes('@') ? u.email && u.email.toLowerCase() === login : d.length >= 10 && u.phone && Core.util.digits(u.phone) === d));
    if (!target) fail('Nenhuma conta com esse e-mail ou celular.');
  } else {
    target = state.users.find((u) => u.id === state.settings.ownerId);
    if (!target) fail('Esta instalação ainda não tem conta titular. Inicie o servidor e faça a instalação.');
  }
  if (target.status !== 'ativo') fail(`A conta de ${target.name} está desativada.`);
  const code = Core.util.tempPassword().replace('-', '').toUpperCase();
  const expiresAt = new Date(Date.now() + 72 * 3600 * 1000).toISOString();
  db.commit({ invites: [{ codeHash: auth.sha256('invite:' + code), userId: target.id, purpose: 'redefinicao', expiresAt }], endSessions: [target.id] });
  db.addAudit({ at: new Date().toISOString(), cmd: 'senha.redefinir.servidor', summary: `Código de nova senha gerado pelo servidor para ${target.name}`, userId: null, userName: 'Servidor', entity: 'users', ids: [target.id] });
  console.log(`\n  Código para ${target.name} criar uma nova senha: ${code.slice(0, 5)}-${code.slice(5)}`);
  console.log('  Na tela de entrada, use "Tenho um código de acesso". Vale por 72 horas e só uma vez.\n');
  process.exit(0);
}

// ---------- token de instalação ----------
if (!DEMO && !state.users.length) {
  setupToken = process.env.SETUP_TOKEN || (fs.existsSync(tokenFile) ? fs.readFileSync(tokenFile, 'utf8').trim() : '');
  if (!setupToken) {
    setupToken = crypto.randomBytes(9).toString('base64url');
    fs.writeFileSync(tokenFile, setupToken + '\n', { mode: 0o600 });
  }
}

// ---------- backups ----------
const backupDir = path.join(DATA_DIR, 'backups');
async function backupNow(label = '') {
  if (DEMO) return null;
  const stamp = new Date().toISOString().slice(0, 10) + (label ? '-' + label : '');
  const file = await db.backup(backupDir, path.join(DATA_DIR, 'files'), 14, stamp);
  log('[backup]', file);
  return file;
}

const api = new Api({
  state,
  db,
  files,
  log,
  config: {
    version: pkg.version,
    demo: DEMO,
    publicUrl: PUBLIC_URL,
    secure: SECURE,
    trustProxy: Number(process.env.TRUST_PROXY) || 0,
    get setupToken() {
      return setupToken;
    },
    consumeSetupToken() {
      setupToken = null;
      try {
        fs.unlinkSync(tokenFile);
      } catch (e) {
        /* já removido */
      }
    },
    backupNow,
  },
});

// ---------- HTTP ----------
const WEB = path.join(__dirname, '..', 'web');
const serveStatic = staticHandler([['/', WEB]]);

const server = http.createServer(async (req, res) => {
  const started = Date.now();
  setSecurityHeaders(res, SECURE);
  let url;
  try {
    url = new URL(req.url, 'http://local');
  } catch (e) {
    res.statusCode = 400;
    return res.end();
  }
  res.on('finish', () => {
    if (url.pathname.startsWith('/api/') && url.pathname !== '/api/changes') log(req.method, url.pathname.replace(/\/(files|preview|history)\/.+/, '/$1/…'), res.statusCode, Date.now() - started + 'ms');
  });
  if (url.pathname.startsWith('/api/')) return api.handle(req, res, url);
  if (url.pathname === '/index.js' || url.pathname.startsWith('/core/index.js') || (!DEMO && (url.pathname === '/demo.html' || url.pathname === '/js/demo-mode.js'))) {
    res.statusCode = 404;
    return res.end();
  }
  if (serveStatic(req, res, url.pathname)) return;
  // SPA: qualquer outra rota volta para o app
  if (req.method === 'GET' && !path.extname(url.pathname) && serveStatic(req, res, '/index.html')) return;
  res.statusCode = 404;
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.end('Não encontrado');
});
server.requestTimeout = 120000;
server.headersTimeout = 30000;

server.listen(PORT, HOST, () => {
  const where = PUBLIC_URL || `http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`;
  log(`Caderneta Escolar ${pkg.version} ${DEMO ? '(DEMONSTRAÇÃO — dados em memória)' : ''} em ${where}`);
  if (!DEMO) log('Dados em', DATA_DIR);
  if (setupToken) {
    console.log('\n  Primeira execução: abra o endereço acima e use este código de instalação:');
    console.log(`\n      ${setupToken}\n`);
    console.log(`  (o código também está em ${tokenFile} e deixa de valer depois de usado)\n`);
  }
  if (!LOOPBACK && !SECURE && !DEMO) log('ATENÇÃO: servindo sem HTTPS (ALLOW_INSECURE_HTTP=1). Use apenas em rede de testes.');
});

// ---------- agendador ----------
const timers = [];
timers.push(setInterval(() => api.tick(), 30 * 1000));
let lastDaily = '';
timers.push(
  setInterval(async () => {
    const now = new Date();
    const local = new Intl.DateTimeFormat('en-CA', { timeZone: state.settings.timezone || 'America/Sao_Paulo', hour: '2-digit', hour12: false, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
    const get = (t) => local.find((p) => p.type === t).value;
    const day = `${get('year')}-${get('month')}-${get('day')}`;
    if (Number(get('hour')) === 3 && lastDaily !== day) {
      lastDaily = day;
      api.dailyCleanup();
      try {
        await backupNow();
      } catch (e) {
        log('[backup] FALHOU:', e.message);
      }
    }
  }, 5 * 60 * 1000),
);
if (!DEMO && state.users.length) backupNow('inicio').catch((e) => log('[backup] FALHOU:', e.message));

function shutdown(sig) {
  log(`Encerrando (${sig})…`);
  timers.forEach(clearInterval);
  server.close(() => {
    db.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 5000).unref();
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

module.exports = { server, api, state, db };
