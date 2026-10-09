'use strict';
/* Monta um HTML único e autossuficiente da demonstração (CSS, fontes e scripts embutidos), para publicar
   como página estática. Uso: node tools/build-artifact.js [saida.html] [--fragment]  (padrão: dist/caderneta-demo.html) */
const fs = require('node:fs');
const path = require('node:path');
const WEB = path.join(__dirname, '..', 'web');
const argv = process.argv.slice(2);
const fragment = argv.includes('--fragment'); // sem doctype/html/head/body (para publicar numa página que já tem o esqueleto)
const out = path.resolve(argv.find((a) => !a.startsWith('--')) || path.join(__dirname, '..', 'dist', 'caderneta-demo.html'));

const read = (rel) => fs.readFileSync(path.join(WEB, rel), 'utf8');
const html = read('demo.html');

const css = (rel) => {
  let text = read(rel);
  const dir = path.dirname(rel);
  // fontes viram data: URIs
  text = text.replace(/url\('([^')]+\.woff2)'\)/g, (_, f) => `url(data:font/woff2;base64,${fs.readFileSync(path.join(WEB, dir, f)).toString('base64')})`);
  return `<style>\n${text}\n</style>`;
};
const js = (rel) => `<script>\n${read(rel).replace(/<\/script/gi, '<\\/script').replace(/<!--/g, '<\\!--')}\n</script>`;

let bundled = html
  .replace(/<link rel="stylesheet" href="([^"]+)">/g, (_, href) => css(href))
  .replace(/<script src="([^"]+)"><\/script>/g, (_, src) => js(src));
if (/<script src=|<link rel="stylesheet" href=/.test(bundled)) throw new Error('sobrou referência externa');
if (fragment) {
  bundled = bundled
    .replace(/<!doctype html>\s*/i, '')
    .replace(/<html[^>]*>\s*/i, '')
    .replace(/<\/html>\s*$/i, '')
    .replace(/<head>\s*/i, '')
    .replace(/<\/head>\s*/i, '')
    .replace(/<body>\s*/i, '')
    .replace(/<\/body>\s*/i, '')
    .replace(/<meta charset="utf-8">\s*/i, '')
    .replace(/<meta name="viewport"[^>]*>\s*/i, '')
    .replace(/<title>[^<]*<\/title>/i, '<title>Caderneta Escolar</title>');
}
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, bundled);
console.log(`${out} (${(bundled.length / 1024).toFixed(0)} KB)`);
