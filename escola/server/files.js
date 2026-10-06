'use strict';
/* Arquivos enviados (anexos e fotos): tipo conferido pelo conteúdo, limite de tamanho e gravação em DATA_DIR/files. */
const fs = require('node:fs');
const path = require('node:path');

const MAX_BYTES = 10 * 1024 * 1024;

/** Descobre o tipo pelos primeiros bytes (não confia no que o navegador diz). */
function sniff(buf) {
  if (buf.length >= 8 && buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.length >= 12 && buf.slice(0, 4).toString('ascii') === 'RIFF' && buf.slice(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
  if (buf.length >= 5 && buf.slice(0, 5).toString('ascii') === '%PDF-') return 'application/pdf';
  return null;
}

function readBody(req, limit = MAX_BYTES) {
  return new Promise((resolve, reject) => {
    const declared = Number(req.headers['content-length'] || 0);
    if (declared > limit) return reject(Object.assign(new Error('too_large'), { status: 413 }));
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) {
        reject(Object.assign(new Error('too_large'), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

class FileStore {
  constructor(dir) {
    this.dir = dir;
    if (dir) fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    this.mem = dir ? null : new Map();
  }
  pathOf(id) {
    if (!/^x[a-z0-9]{2,40}$/.test(id)) throw new Error('id inválido');
    return path.join(this.dir, id);
  }
  write(id, buf) {
    if (this.mem) return this.mem.set(id, buf);
    fs.writeFileSync(this.pathOf(id), buf, { mode: 0o600 });
  }
  read(id) {
    if (this.mem) return this.mem.get(id) || null;
    try {
      return fs.readFileSync(this.pathOf(id));
    } catch (e) {
      return null;
    }
  }
  remove(id) {
    if (this.mem) return this.mem.delete(id);
    try {
      fs.unlinkSync(this.pathOf(id));
    } catch (e) {
      /* já removido */
    }
  }
}

module.exports = { sniff, readBody, FileStore, MAX_BYTES };
