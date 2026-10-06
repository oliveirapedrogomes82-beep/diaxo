'use strict';
/* Senhas (scrypt com sal), tokens de sessão e limite de tentativas de login. */
const crypto = require('node:crypto');
const { promisify } = require('node:util');

const scrypt = promisify(crypto.scrypt);
const SCRYPT = { N: 32768, r: 8, p: 1, keylen: 64 };
const MIN_PASSWORD = 8;

async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(String(password).normalize('NFKC'), salt, SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p, maxmem: 96 * 1024 * 1024 });
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString('base64')}$${key.toString('base64')}`;
}

async function verifyPassword(password, stored) {
  try {
    const [alg, N, r, p, saltB64, keyB64] = String(stored).split('$');
    if (alg !== 'scrypt') return false;
    const expected = Buffer.from(keyB64, 'base64');
    const key = await scrypt(String(password).normalize('NFKC'), Buffer.from(saltB64, 'base64'), expected.length, { N: Number(N), r: Number(r), p: Number(p), maxmem: 96 * 1024 * 1024 });
    return key.length === expected.length && crypto.timingSafeEqual(key, expected);
  } catch (e) {
    return false;
  }
}

/** Hash usado só para igualar o tempo de resposta quando o e-mail não existe. */
let dummyHash = null;
async function dummyVerify(password) {
  if (!dummyHash) dummyHash = await hashPassword('caderneta-dummy-password');
  await verifyPassword(password, dummyHash);
  return false;
}

const COMMON = new Set([
  '12345678', '123456789', '1234567890', '87654321', '11111111', '00000000', '12341234', '123123123', '11223344', '102030405060',
  'password', 'password1', 'qwertyui', 'qwerty123', 'abcdefgh', 'abc12345', 'iloveyou', 'mudar123', 'senha123', 'senha1234',
  'escola123', 'colegio123', 'professor', 'professora', 'brasil123', 'flamengo', 'corinthians', 'palmeiras', 'gremio123',
  'jesus123', 'deusefiel', 'familia123', 'mae12345', 'amor1234', 'gabriel1', 'lucas123', 'maria123', 'mariana1', 'futebol1',
]);

function passwordProblem(password, { name = '', email = '' } = {}) {
  const p = String(password || '');
  if (p.length < MIN_PASSWORD) return `A senha precisa ter pelo menos ${MIN_PASSWORD} caracteres.`;
  if (p.length > 200) return 'A senha pode ter no máximo 200 caracteres.';
  const low = p.toLowerCase();
  if (/^(.)\1+$/.test(p) || /^(0123456789|1234567890|9876543210)/.test(low) || COMMON.has(low) || /^(senha|escola|colegio|brasil|mudar|trocar)\d{0,6}[!@#.]?$/.test(low))
    return 'Essa senha é fácil de adivinhar. Escolha outra.';
  const first = String(name).trim().split(/\s+/)[0];
  if (first && first.length >= 4 && low.includes(first.toLowerCase())) return 'Não use o seu nome na senha.';
  const user = String(email).split('@')[0];
  if (user && user.length >= 4 && low.includes(user.toLowerCase())) return 'Não use o seu e-mail na senha.';
  return null;
}

const newToken = () => crypto.randomBytes(32).toString('base64url');
const sha256 = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');

/**
 * Limite de tentativas em janela deslizante. `hit(key)` registra uma falha;
 * `blocked(key)` diz quantos segundos faltam para liberar (0 = liberado).
 */
class RateLimiter {
  constructor({ max, windowMs }) {
    this.max = max;
    this.windowMs = windowMs;
    this.map = new Map();
  }
  _list(key, now) {
    const list = (this.map.get(key) || []).filter((t) => now - t < this.windowMs);
    if (list.length) this.map.set(key, list);
    else this.map.delete(key);
    return list;
  }
  blocked(key, now = Date.now()) {
    const list = this._list(key, now);
    if (list.length < this.max) return 0;
    return Math.ceil((list[0] + this.windowMs - now) / 1000);
  }
  hit(key, now = Date.now()) {
    const list = this._list(key, now);
    list.push(now);
    this.map.set(key, list);
  }
  reset(key) {
    this.map.delete(key);
  }
  sweep(now = Date.now()) {
    for (const key of this.map.keys()) this._list(key, now);
  }
}

module.exports = { hashPassword, verifyPassword, dummyVerify, passwordProblem, newToken, sha256, RateLimiter, MIN_PASSWORD };
