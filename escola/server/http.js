'use strict';
/* Utilidades HTTP: leitura de JSON com limite, respostas, cookies, arquivos estáticos e cabeçalhos de segurança. */
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
  '.txt': 'text/plain; charset=utf-8',
  '.woff2': 'font/woff2',
};

const SECURITY_HEADERS = {
  'Content-Security-Policy': [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self'",
    "img-src 'self' data:",
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "object-src 'none'",
  ].join('; '),
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'same-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
  'Cross-Origin-Opener-Policy': 'same-origin',
};

class HttpError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function setSecurityHeaders(res, secure) {
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) res.setHeader(k, v);
  if (secure) res.setHeader('Strict-Transport-Security', 'max-age=31536000');
}

function readJSON(req, limit) {
  return new Promise((resolve, reject) => {
    const type = String(req.headers['content-type'] || '');
    if (!type.startsWith('application/json')) return reject(new HttpError(415, 'invalid', 'Envie os dados em JSON.'));
    const declared = Number(req.headers['content-length'] || 0);
    if (declared > limit) return reject(new HttpError(413, 'too_large', 'Os dados enviados são grandes demais.'));
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) {
        reject(new HttpError(413, 'too_large', 'Os dados enviados são grandes demais.'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try {
        const v = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        if (v === null || typeof v !== 'object' || Array.isArray(v)) throw new Error('not object');
        resolve(v);
      } catch (e) {
        reject(new HttpError(400, 'invalid', 'JSON inválido.'));
      }
    });
    req.on('error', () => reject(new HttpError(400, 'invalid', 'Falha ao ler a requisição.')));
  });
}

function sendJSON(req, res, status, body) {
  let data = Buffer.from(JSON.stringify(body));
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  if (data.length > 1024 && /\bgzip\b/.test(req.headers['accept-encoding'] || '')) {
    data = zlib.gzipSync(data, { level: 6 });
    res.setHeader('Content-Encoding', 'gzip');
    res.setHeader('Vary', 'Accept-Encoding');
  }
  res.setHeader('Content-Length', data.length);
  res.end(data);
}

function sendError(req, res, err) {
  if (err instanceof HttpError) return sendJSON(req, res, err.status, { error: { code: err.code, message: err.message } });
  const map = { forbidden: 403, invalid: 400, not_found: 404, conflict: 409, unauthorized: 401 };
  if (err && err.name === 'CmdError') return sendJSON(req, res, map[err.code] || 400, { error: { code: err.code, message: err.message, field: err.field } });
  console.error('[erro]', err && err.stack ? err.stack : err);
  return sendJSON(req, res, 500, { error: { code: 'server', message: 'Erro interno. Tente de novo em instantes.' } });
}

function parseCookies(req) {
  const out = {};
  String(req.headers.cookie || '')
    .split(';')
    .forEach((part) => {
      const i = part.indexOf('=');
      if (i < 0) return;
      const k = part.slice(0, i).trim();
      if (k) out[k] = decodeURIComponent(part.slice(i + 1).trim());
    });
  return out;
}

function cookie(name, value, { maxAge = null, secure = false } = {}) {
  let c = `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax`;
  if (maxAge != null) c += `; Max-Age=${Math.floor(maxAge)}`;
  if (secure) c += '; Secure';
  return c;
}

/**
 * Serve arquivos estáticos com proteção contra path traversal, ETag e gzip.
 * `roots`: lista ordenada de [prefixo terminado em "/", pasta], ex.: [['/core/', coreDir], ['/', webDir]].
 */
function staticHandler(roots) {
  const cache = new Map();
  return (req, res, pathname) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return false;
    const match = roots.find(([prefix]) => pathname.startsWith(prefix));
    if (!match) return false;
    const [prefix, root] = match;
    const rel = pathname.slice(prefix.length - 1);
    let decoded;
    try {
      decoded = decodeURIComponent(rel);
    } catch (e) {
      return false;
    }
    if (decoded.includes('\0')) return false;
    if (decoded.endsWith('/')) decoded += 'index.html';
    const file = path.normalize(path.join(root, decoded));
    if (!file.startsWith(root + path.sep) && file !== root) return false;
    let stat;
    try {
      stat = fs.statSync(file);
    } catch (e) {
      return false;
    }
    if (!stat.isFile()) return false;
    const ext = path.extname(file).toLowerCase();
    const type = MIME[ext];
    if (!type) return false;
    const etag = `"${stat.size.toString(36)}-${stat.mtimeMs.toString(36)}"`;
    res.setHeader('ETag', etag);
    res.setHeader('Cache-Control', ext === '.html' ? 'no-cache' : ext === '.woff2' ? 'public, max-age=2592000, immutable' : 'public, max-age=300, must-revalidate');
    if (req.headers['if-none-match'] === etag) {
      res.statusCode = 304;
      res.end();
      return true;
    }
    const gz = /\bgzip\b/.test(req.headers['accept-encoding'] || '') && /^(text|application\/(json|javascript)|image\/svg)/.test(type);
    let body;
    const key = file + etag + (gz ? ':gz' : '');
    if (cache.has(key)) body = cache.get(key);
    else {
      body = fs.readFileSync(file);
      if (gz) body = zlib.gzipSync(body, { level: 6 });
      if (cache.size > 200) cache.clear();
      cache.set(key, body);
    }
    res.statusCode = 200;
    res.setHeader('Content-Type', type);
    if (gz) {
      res.setHeader('Content-Encoding', 'gzip');
      res.setHeader('Vary', 'Accept-Encoding');
    }
    res.setHeader('Content-Length', body.length);
    res.end(req.method === 'HEAD' ? undefined : body);
    return true;
  };
}

module.exports = { HttpError, setSecurityHeaders, readJSON, sendJSON, sendError, parseCookies, cookie, staticHandler, MIME };
