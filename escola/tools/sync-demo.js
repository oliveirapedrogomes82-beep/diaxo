'use strict';
/* Gera web/demo.html a partir de web/index.html (mesma página + modo demonstração no navegador).
   Uso: node tools/sync-demo.js  (o teste de contrato confere que os dois estão em dia). */
const fs = require('node:fs');
const path = require('node:path');
const WEB = path.join(__dirname, '..', 'web');

function demoHtml(index) {
  return index
    .replace('<title>Caderneta Escolar</title>', '<title>Caderneta Escolar · demonstração</title>')
    .replace('<script src="core/manifest.js"></script>', '<script src="js/demo-mode.js"></script>\n<script src="core/manifest.js"></script>');
}
if (require.main === module) {
  const index = fs.readFileSync(path.join(WEB, 'index.html'), 'utf8');
  fs.writeFileSync(path.join(WEB, 'demo.html'), demoHtml(index));
  console.log('web/demo.html atualizado');
}
module.exports = { demoHtml };
