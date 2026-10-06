/* Caderneta Escolar — lista ordenada dos arquivos do núcleo.
   O navegador carrega exatamente esta lista (index.html); o servidor faz require na mesma ordem. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else (root.Core = root.Core || {}).manifest = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  return [
    'util.js',
    'schema.js',
    'perms.js',
    'rules.js',
    'engine.js',
    'view.js',
    'seed.js',
    'migrate.js',
    'commands/shared.js',
    'commands/escola.js',
    'commands/equipe.js',
    'commands/alunos.js',
    'commands/pedagogico.js',
    'commands/agenda.js',
    'commands/mensagens.js',
    'commands/atendimentos.js',
    'commands/comunicacao.js',
    'commands/financeiro.js',
  ];
});
