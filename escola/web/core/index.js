/* Caderneta Escolar — carrega o núcleo no Node (mesma ordem do navegador). */
'use strict';
const path = require('node:path');
const manifest = require('./manifest');

for (const file of manifest) require(path.join(__dirname, file));

module.exports = {
  util: require('./util'),
  schema: require('./schema'),
  perms: require('./perms'),
  rules: require('./rules'),
  engine: require('./engine'),
  view: require('./view'),
  seed: require('./seed'),
  migrate: require('./migrate'),
  manifest,
};
