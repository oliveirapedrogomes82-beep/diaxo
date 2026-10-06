'use strict';
/* Monta um HTML único e autossuficiente da demonstração (CSS, fontes e scripts embutidos), para publicar
   como página estática. Uso: node tools/build-artifact.js [saida.html]  (padrão: dist/caderneta-demo.html) */
const fs = require('node:fs');
const path = require('node:path');
const WEB = path.join(__dirname, '..', 'web');
const out = path.resolve(process.argv[2] || path.join(__dirname, '..', 'dist', 'caderneta-demo.html'));

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
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, bundled);
console.log(`${out} (${(bundled.length / 1024).toFixed(0)} KB)`);
