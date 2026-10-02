'use strict';
// Banco de dados do jogo: calibres, armas reais, acessórios, itens, loot e receitas.

// Paleta de acabamentos usada pelos modelos procedurais.
const C = {
  BLK: 0x24262b, STL: 0x3b3e44, GUN: 0x2e3137, PARK: 0x45484c, GRY: 0x5d6168, SIL: 0xb9bdc3, CHR: 0xd9dce0,
  WOOD: 0x7a4824, WOODL: 0x9c6534, WOODD: 0x55321a, WOODR: 0x8e3f1e, BAKE: 0x4a2d26,
  TAN: 0xb39a6c, OD: 0x5a6142, GRN: 0x4d5a3b, PLUM: 0x5b2f2c, GOLD: 0xc9a43a, BRASS: 0xb8913a, RED: 0x9c2b22,
};

// Calibres: dano base por projétil, velocidade de boca (m/s), arrasto e quantos cabem por espaço.
const CALIBERS = {
  '.22lr': { name: '.22 LR', dmg: 16, vel: 370, drag: 0.55, stack: 100, box: [20, 50] },
  '.32acp': { name: '.32 ACP (7,65 mm)', dmg: 20, vel: 300, drag: 0.5, stack: 80, box: [15, 30] },
  '.380': { name: '.380 ACP', dmg: 23, vel: 300, drag: 0.5, stack: 80, box: [12, 30] },
  '9x18': { name: '9×18 mm Makarov', dmg: 25, vel: 315, drag: 0.5, stack: 70, box: [16, 40] },
  '9x19': { name: '9×19 mm Parabellum', dmg: 30, vel: 380, drag: 0.45, stack: 60, box: [15, 45] },
  '7.62x25': { name: '7,62×25 mm Tokarev', dmg: 30, vel: 450, drag: 0.45, stack: 60, box: [16, 40] },
  '.45acp': { name: '.45 ACP', dmg: 36, vel: 260, drag: 0.5, stack: 50, box: [12, 35] },
  '.45lc': { name: '.45 Colt', dmg: 46, vel: 280, drag: 0.5, stack: 40, box: [6, 18] },
  '7.62x38r': { name: '7,62×38 mmR Nagant', dmg: 26, vel: 270, drag: 0.5, stack: 50, box: [7, 21] },
  '.357': { name: '.357 Magnum', dmg: 50, vel: 440, drag: 0.42, stack: 40, box: [6, 24] },
  '.44mag': { name: '.44 Magnum', dmg: 62, vel: 450, drag: 0.42, stack: 36, box: [6, 18] },
  '.50ae': { name: '.50 Action Express', dmg: 72, vel: 470, drag: 0.42, stack: 30, box: [7, 14] },
  '5.7x28': { name: '5,7×28 mm', dmg: 30, vel: 715, drag: 0.32, stack: 60, box: [20, 50] },
  '4.6x30': { name: '4,6×30 mm', dmg: 28, vel: 720, drag: 0.32, stack: 60, box: [20, 40] },
  '.30carbine': { name: '.30 Carbine', dmg: 34, vel: 600, drag: 0.38, stack: 50, box: [15, 30] },
  '5.56x45': { name: '5,56×45 mm NATO', dmg: 38, vel: 920, drag: 0.27, stack: 50, box: [20, 60] },
  '5.45x39': { name: '5,45×39 mm', dmg: 37, vel: 880, drag: 0.27, stack: 50, box: [20, 60] },
  '5.8x42': { name: '5,8×42 mm DBP', dmg: 39, vel: 930, drag: 0.27, stack: 50, box: [20, 50] },
  '7.62x39': { name: '7,62×39 mm', dmg: 44, vel: 715, drag: 0.3, stack: 40, box: [20, 50] },
  '7.92x33': { name: '7,92×33 mm Kurz', dmg: 42, vel: 690, drag: 0.31, stack: 40, box: [15, 30] },
  '.300blk': { name: '.300 AAC Blackout', dmg: 42, vel: 680, drag: 0.3, stack: 40, box: [15, 40] },
  '9x39': { name: '9×39 mm SP-5', dmg: 48, vel: 295, drag: 0.4, stack: 40, box: [10, 30] },
  '.30-30': { name: '.30-30 Winchester', dmg: 52, vel: 720, drag: 0.3, stack: 30, box: [8, 20] },
  '7.62x51': { name: '7,62×51 mm NATO (.308)', dmg: 58, vel: 840, drag: 0.22, stack: 30, box: [10, 40] },
  '7.62x54r': { name: '7,62×54 mmR', dmg: 60, vel: 830, drag: 0.22, stack: 30, box: [10, 40] },
  '7.92x57': { name: '7,92×57 mm Mauser', dmg: 62, vel: 760, drag: 0.23, stack: 30, box: [10, 30] },
  '.303': { name: '.303 British', dmg: 58, vel: 745, drag: 0.23, stack: 30, box: [10, 30] },
  '.30-06': { name: '.30-06 Springfield', dmg: 62, vel: 850, drag: 0.22, stack: 30, box: [8, 24] },
  '.338': { name: '.338 Lapua Magnum', dmg: 115, vel: 900, drag: 0.12, stack: 20, box: [5, 15] },
  '.408': { name: '.408 CheyTac', dmg: 135, vel: 910, drag: 0.1, stack: 20, box: [7, 14] },
  '.50bmg': { name: '.50 BMG (12,7×99 mm)', dmg: 190, vel: 890, drag: 0.1, stack: 15, box: [5, 15] },
  '12ga': { name: 'Calibre 12 (chumbo 00)', dmg: 15, vel: 400, drag: 1.2, stack: 30, box: [6, 20] },
  '40mm': { name: 'Granada 40 mm HE', dmg: 0, vel: 76, drag: 0.02, stack: 6, box: [2, 4], boom: { r: 7, dmg: 230 } },
  'pg7v': { name: 'Foguete PG-7V', dmg: 0, vel: 145, drag: 0, grav: 0.15, stack: 2, box: [1, 2], boom: { r: 8, dmg: 320 } },
  'virote': { name: 'Virote de besta', dmg: 80, vel: 110, drag: 0.05, stack: 20, box: [3, 8], arrow: true },
  'flecha': { name: 'Flecha de carbono', dmg: 70, vel: 85, drag: 0.05, stack: 20, box: [3, 10], arrow: true },
};

// Nomes das categorias (na ordem do Arsenal).
const CLASSES = {
  pistola: 'Pistolas', revolver: 'Revólveres', smg: 'Submetralhadoras', fuzil: 'Fuzis de assalto',
  batalha: 'Fuzis de batalha', dmr: 'Fuzis de precisão (DMR)', carabina: 'Carabinas e alavanca',
  sniper: 'Fuzis de ferrolho', espingarda: 'Espingardas', lmg: 'Metralhadoras', lancador: 'Lançadores',
  arco: 'Arcos e bestas', melee: 'Corpo a corpo', arremesso: 'Arremessáveis',
};

// Padrões por categoria. recoil: [vertical, horizontal] em graus; spread: [quadril, mirando].
const CLASS_DEF = {
  pistola: { slot: 'sec', reload: 1.5, recoil: [1.5, 0.5], spread: [1.8, 0.45], adsTime: 0.14, zoom: 1.15, move: 1.0, rails: { tac: 1 }, size: 2 },
  revolver: { slot: 'sec', reload: 0, reloadType: 'shell', shellTime: 0.5, recoil: [3.4, 0.8], spread: [1.6, 0.35], adsTime: 0.16, zoom: 1.15, move: 1.0, rails: {}, size: 2 },
  smg: { slot: 'pri', reload: 2.0, recoil: [0.75, 0.42], spread: [2.4, 0.55], adsTime: 0.17, zoom: 1.25, move: 0.98, rails: { opt: 1, muz: 1, und: 1, tac: 1 }, size: 4 },
  fuzil: { slot: 'pri', reload: 2.3, recoil: [1.0, 0.45], spread: [2.8, 0.18], adsTime: 0.22, zoom: 1.3, move: 0.95, rails: { opt: 1, muz: 1, und: 1, tac: 1 }, size: 6 },
  batalha: { slot: 'pri', reload: 2.6, recoil: [1.6, 0.6], spread: [3.0, 0.14], adsTime: 0.25, zoom: 1.35, move: 0.93, rails: { opt: 1, muz: 1, und: 1, tac: 1 }, size: 6 },
  dmr: { slot: 'pri', reload: 2.6, recoil: [1.9, 0.5], spread: [3.5, 0.08], adsTime: 0.27, zoom: 1.35, move: 0.92, rails: { opt: 1, muz: 1, und: 1, tac: 1 }, size: 6 },
  carabina: { slot: 'pri', reload: 2.2, recoil: [1.3, 0.4], spread: [3.0, 0.15], adsTime: 0.22, zoom: 1.3, move: 0.96, rails: { opt: 1 }, size: 5 },
  sniper: { slot: 'pri', reload: 3.0, action: 'bolt', cycle: 1.0, recoil: [3.2, 0.6], spread: [6, 0.02], adsTime: 0.32, zoom: 1.4, move: 0.9, rails: { opt: 1, muz: 1, und: 1 }, size: 7 },
  espingarda: { slot: 'pri', reloadType: 'shell', shellTime: 0.48, action: 'pump', cycle: 0.5, pellets: 9, choke: 3.2, recoil: [4.0, 1.0], spread: [1.6, 0.7], adsTime: 0.24, zoom: 1.15, move: 0.94, rails: { opt: 1, tac: 1 }, size: 6 },
  lmg: { slot: 'pri', reload: 5.0, recoil: [0.85, 0.55], spread: [4.2, 0.5], adsTime: 0.35, zoom: 1.3, move: 0.85, rails: { opt: 1, tac: 1 }, bipod: true, size: 9 },
  lancador: { slot: 'pri', reload: 3.5, recoil: [5, 1], spread: [2.5, 0.6], adsTime: 0.3, zoom: 1.25, move: 0.86, rails: {}, size: 8 },
  arco: { slot: 'pri', reload: 2.2, recoil: [0.6, 0.2], spread: [3.0, 0.15], adsTime: 0.25, zoom: 1.3, move: 0.97, rails: { opt: 1 }, silent: true, size: 5 },
};

const WEAPONS = {};
const WEAPON_LIST = [];
function W(id, name, cls, cal, mag, rpm, modes, o = {}) {
  const base = CLASS_DEF[cls];
  const w = Object.assign({ id, name, cls, cal, mag, rpm, modes, reloadType: 'mag', dmgMul: 1, velMul: 1, tags: [], rar: 1 }, base, o);
  w.rails = Object.assign({}, base.rails, o.rails || {});
  if (o.noRails) for (const k of o.noRails) delete w.rails[k];
  const c = CALIBERS[cal];
  w.snd = c.boom ? 80 : (c.dmg * w.dmgMul * (w.pellets ? 4 : 1)) * (w.cls === 'pistola' || w.cls === 'revolver' ? 0.8 : 1);
  // Carregador estendido só cabe em armas de carregador destacável comum.
  const mg = w.m && w.m.mg;
  w.rails.mag = w.reloadType === 'mag' && !['drum', 'belt', 'pan', 'helical', 'top', 'beltdrum', 'none', 'tube', 'top_bren'].includes(mg) && w.cls !== 'lancador' && w.cls !== 'arco' && w.mag > 2;
  WEAPONS[id] = w;
  WEAPON_LIST.push(w);
  return w;
}

// ---------------------------------------------------------------- Pistolas
W('glock17', 'Glock 17', 'pistola', '9x19', 17, 420, ['semi'], { origin: 'Áustria', year: 1982, tags: ['civil', 'policia'], rails: { muz: 1 }, d: 'A pistola de polímero que conquistou as polícias do mundo. Leve, simples e confiável.', m: { k: 'pistol', sl: 0.186, sh: 0.034, fc: C.BLK, sc: C.BLK, ga: 20, boxy: 1 } });
W('glock18c', 'Glock 18C', 'pistola', '9x19', 33, 1200, ['auto', 'semi'], { recoil: [1.1, 0.95], spread: [2.4, 0.8], origin: 'Áustria', year: 1986, tags: ['militar', 'elite'], rar: 0.5, rails: { muz: 1 }, d: 'Versão automática da Glock com cano compensado. Esvazia um carregador de 33 em menos de 2 segundos.', m: { k: 'pistol', sl: 0.186, sh: 0.034, fc: C.BLK, sc: C.BLK, ga: 20, boxy: 1, comp: 1, magExt: 0.09 } });
W('m9', 'Beretta M9', 'pistola', '9x19', 15, 400, ['semi'], { origin: 'Itália / EUA', year: 1985, tags: ['policia', 'militar'], d: 'Pistola padrão das Forças Armadas dos EUA por 30 anos. Ferrolho aberto característico.', m: { k: 'pistol', sl: 0.2, sh: 0.032, fc: C.BLK, sc: C.BLK, open: 1, hammer: 1 } });
W('pt92', 'Taurus PT92', 'pistola', '9x19', 17, 400, ['semi'], { origin: 'Brasil', year: 1983, tags: ['civil', 'policia'], d: 'Fabricada em São Leopoldo (RS) com o maquinário original da Beretta. Clássica nas polícias brasileiras.', m: { k: 'pistol', sl: 0.2, sh: 0.032, fc: C.SIL, sc: C.SIL, gc: C.BLK, open: 1, hammer: 1 } });
W('m1911', 'Colt M1911A1', 'pistola', '.45acp', 7, 380, ['semi'], { recoil: [2.0, 0.6], origin: 'EUA', year: 1911, tags: ['civil', 'historico', 'policia'], rails: { muz: 0 }, d: 'Projeto de John Browning que serviu por mais de 70 anos. Ação simples, calibre .45 pesado.', m: { k: 'pistol', sl: 0.21, sh: 0.03, fc: C.STL, sc: C.STL, gc: C.WOOD, hammer: 1 } });
W('p226', 'SIG Sauer P226', 'pistola', '9x19', 15, 420, ['semi'], { origin: 'Suíça / Alemanha', year: 1984, tags: ['policia'], d: 'Precisa e robusta, preferida de forças especiais como os Navy SEALs.', m: { k: 'pistol', sl: 0.196, sh: 0.037, fc: C.BLK, sc: C.BLK, hammer: 1, rail: 1 } });
W('m17', 'SIG Sauer M17 (P320)', 'pistola', '9x19', 17, 420, ['semi'], { origin: 'EUA', year: 2017, tags: ['policia', 'militar'], rails: { muz: 1 }, d: 'Pistola modular que substituiu a M9 no Exército dos EUA. Acabamento coyote.', m: { k: 'pistol', sl: 0.2, sh: 0.035, fc: C.TAN, sc: C.TAN, gc: C.TAN, boxy: 1, rail: 1 } });
W('usp45', 'H&K USP .45', 'pistola', '.45acp', 12, 380, ['semi'], { recoil: [1.9, 0.6], origin: 'Alemanha', year: 1993, tags: ['policia'], rails: { muz: 1 }, d: 'Universal Selbstladepistole: projetada para aguentar munição +P e supressores.', m: { k: 'pistol', sl: 0.2, sh: 0.037, fc: C.BLK, sc: C.BLK, rail: 1 } });
W('ppk', 'Walther PPK', 'pistola', '.380', 7, 380, ['semi'], { recoil: [1.3, 0.5], origin: 'Alemanha', year: 1931, tags: ['civil'], d: 'Compacta e elegante, eternizada pelo cinema de espionagem.', m: { k: 'pistol', sl: 0.155, sh: 0.03, fc: C.SIL, sc: C.SIL, gc: C.BLK, gh: 0.085, hammer: 1 } });
W('fiveseven', 'FN Five-seveN', 'pistola', '5.7x28', 20, 420, ['semi'], { recoil: [1.1, 0.4], origin: 'Bélgica', year: 2000, tags: ['policia', 'militar'], rails: { muz: 1 }, d: 'Companheira da P90: calibre pequeno de alta velocidade e 20 tiros.', m: { k: 'pistol', sl: 0.208, sh: 0.033, fc: C.BLK, sc: C.GRY, rail: 1 } });
W('deagle', 'IMI Desert Eagle .50 AE', 'pistola', '.50ae', 7, 240, ['semi'], { recoil: [6.0, 1.4], spread: [2.6, 0.5], reload: 1.9, origin: 'Israel / EUA', year: 1983, tags: ['elite', 'civil'], rar: 0.35, d: 'Pistola a gás com potência de fuzil. Pesada, barulhenta e icônica.', m: { k: 'pistol', sl: 0.27, sh: 0.045, sw: 0.034, fc: C.SIL, sc: C.SIL, gc: C.BLK, tri: 1, hammer: 1 } });
W('makarov', 'Makarov PM', 'pistola', '9x18', 8, 380, ['semi'], { origin: 'URSS', year: 1951, tags: ['civil', 'policia', 'historico'], d: 'Pistola de serviço soviética por décadas, simples e indestrutível.', m: { k: 'pistol', sl: 0.16, sh: 0.031, fc: C.STL, sc: C.STL, gc: C.BAKE, gh: 0.09, hammer: 1 } });
W('tt33', 'Tokarev TT-33', 'pistola', '7.62x25', 8, 380, ['semi'], { origin: 'URSS', year: 1933, tags: ['civil', 'historico'], d: 'Cartucho rápido e perfurante, usada na Segunda Guerra.', m: { k: 'pistol', sl: 0.195, sh: 0.03, fc: C.STL, sc: C.STL, gc: C.BLK, hammer: 1 } });
W('cz75', 'CZ 75', 'pistola', '9x19', 16, 420, ['semi'], { origin: 'Tchecoslováquia', year: 1975, tags: ['civil', 'policia'], d: 'Ferrolho que corre por dentro da armação: excelente ergonomia e precisão.', m: { k: 'pistol', sl: 0.2, sh: 0.03, fc: C.STL, sc: C.STL, gc: C.WOODD, hammer: 1 } });
W('ruger22', 'Ruger Mark IV', 'pistola', '.22lr', 10, 420, ['semi'], { recoil: [0.5, 0.2], spread: [1.4, 0.25], origin: 'EUA', year: 2016, tags: ['civil'], rails: { muz: 1, opt: 0 }, d: 'Pistola de tiro esportivo calibre .22 com cano pesado. Quase sem recuo.', m: { k: 'pistol', sl: 0.13, sh: 0.03, fc: C.BLK, sc: C.STL, bl: 0.11, ga: 28 } });
W('luger', 'Luger P08', 'pistola', '9x19', 8, 360, ['semi'], { origin: 'Alemanha', year: 1908, tags: ['historico'], rar: 0.6, d: 'Mecanismo de articulação (toggle) que levanta ao disparar. Peça de colecionador.', m: { k: 'pistol', luger: 1, sl: 0.2, sh: 0.028, fc: C.STL, sc: C.STL, gc: C.WOOD, ga: 33 } });
W('c96', 'Mauser C96 "Red 9"', 'pistola', '9x19', 10, 360, ['semi'], { reloadType: 'clip', clip: 10, reload: 2.4, origin: 'Alemanha', year: 1916, tags: ['historico'], rar: 0.5, d: 'A "Broomhandle": carregador fixo à frente do gatilho, abastecido por pente.', m: { k: 'pistol', c96: 1, sl: 0.26, sh: 0.032, fc: C.STL, sc: C.STL, gc: C.WOOD } });
W('aps', 'Stechkin APS', 'pistola', '9x18', 20, 750, ['auto', 'semi'], { recoil: [1.0, 0.75], spread: [2.2, 0.6], origin: 'URSS', year: 1951, tags: ['militar', 'historico'], rar: 0.6, d: 'Pistola automática soviética de 20 tiros para tripulações de blindados.', m: { k: 'pistol', sl: 0.225, sh: 0.033, fc: C.STL, sc: C.STL, gc: C.BAKE, hammer: 1 } });

// ---------------------------------------------------------------- Revólveres
W('sw29', 'Smith & Wesson Model 29', 'revolver', '.44mag', 6, 200, ['semi'], { origin: 'EUA', year: 1955, tags: ['civil', 'policia'], d: 'O "revólver mais poderoso do mundo" nos anos 70. Recuo brutal.', m: { k: 'revolver', bl: 0.2, fc: C.STL, gc: C.WOOD, rib: 1 } });
W('python', 'Colt Python', 'revolver', '.357', 6, 230, ['semi'], { recoil: [2.8, 0.7], origin: 'EUA', year: 1955, tags: ['civil', 'policia'], d: 'O "Rolls-Royce dos revólveres": gatilho suave e cano com nervura ventilada.', m: { k: 'revolver', bl: 0.15, fc: C.GUN, gc: C.WOOD, rib: 1, shroud: 1 } });
W('ragingbull', 'Taurus Raging Bull', 'revolver', '.44mag', 6, 200, ['semi'], { recoil: [3.0, 0.7], origin: 'Brasil', year: 1997, tags: ['civil', 'policia'], d: 'Revólver brasileiro de grande porte com cano portado para domar o .44 Magnum.', m: { k: 'revolver', bl: 0.21, fc: C.SIL, gc: C.BLK, rib: 1, shroud: 1, ported: 1 } });
W('nagant', 'Nagant M1895', 'revolver', '7.62x38r', 7, 180, ['semi'], { recoil: [1.8, 0.5], shellTime: 0.7, origin: 'Rússia', year: 1895, tags: ['historico', 'civil'], d: 'Tambor que avança e veda o gás: um dos raros revólveres que aceitam supressor.', m: { k: 'revolver', bl: 0.11, fc: C.STL, gc: C.WOODD } });
W('saa', 'Colt Single Action Army', 'revolver', '.45lc', 6, 120, ['semi'], { recoil: [3.8, 0.9], shellTime: 0.65, origin: 'EUA', year: 1873, tags: ['historico', 'civil'], d: '"The Peacemaker". Ação simples: o cão é armado a cada tiro.', m: { k: 'revolver', bl: 0.14, fc: C.GUN, gc: C.WOOD, saa: 1 } });

// ---------------------------------------------------------------- Submetralhadoras
W('mp5', 'H&K MP5A3', 'smg', '9x19', 30, 800, ['auto', 'burst', 'semi'], { origin: 'Alemanha', year: 1966, tags: ['policia', 'militar'], d: 'Ferrolho com roletes retardados: suave e precisa. Referência em contraterrorismo.', m: { k: 'rifle', rl: 0.33, rh: 0.058, rw: 0.042, hl: 0.15, ht: 'slim', bl: 0.035, st: 'mp5', sl: 0.2, mg: 'curved', ml: 0.17, mc: 0.35, sg: 'hood', mz: 'tri', ctube: 1, m: C.BLK, f: C.BLK } });
W('mp5sd', 'H&K MP5SD6', 'smg', '9x19', 30, 700, ['auto', 'burst', 'semi'], { recoil: [0.6, 0.35], dmgMul: 0.92, integ: { muz: 'supp' }, noRails: ['muz'], origin: 'Alemanha', year: 1974, tags: ['elite', 'policia'], rar: 0.6, d: 'Supressor integrado que reduz a munição a velocidade subsônica. Quase silenciosa.', m: { k: 'rifle', rl: 0.33, rh: 0.058, rw: 0.042, hl: 0.12, ht: 'slim', bl: 0, st: 'mp5', sl: 0.2, mg: 'curved', ml: 0.17, mc: 0.35, sg: 'hood', mz: 'supplong', ctube: 1, m: C.BLK, f: C.BLK } });
W('ump45', 'H&K UMP45', 'smg', '.45acp', 25, 600, ['auto', 'burst', 'semi'], { recoil: [0.85, 0.4], origin: 'Alemanha', year: 1999, tags: ['policia'], d: 'Sucessora barata e leve da MP5, em calibre .45 de grande poder de parada.', m: { k: 'rifle', rl: 0.3, rh: 0.075, rw: 0.05, hl: 0.14, ht: 'poly', bl: 0.05, st: 'side', sl: 0.24, mg: 'straight', ml: 0.2, sg: 'flat', m: C.BLK, f: C.BLK } });
W('uzi', 'IMI Uzi', 'smg', '9x19', 32, 600, ['auto', 'semi'], { origin: 'Israel', year: 1954, tags: ['policia', 'civil', 'historico'], d: 'Carregador dentro do punho e ferrolho telescópico. Um ícone da Guerra Fria.', m: { k: 'rifle', rl: 0.3, rh: 0.075, rw: 0.06, ht: 'none', bl: 0.07, st: 'fold', sl: 0.22, mg: 'grip', ml: 0.23, sg: 'post', m: C.PARK, f: C.BLK } });
W('microuzi', 'Micro Uzi', 'smg', '9x19', 20, 1200, ['auto', 'semi'], { slot: 'sec', size: 3, recoil: [0.95, 0.85], spread: [2.8, 1.0], origin: 'Israel', year: 1986, tags: ['policia', 'civil'], noRails: ['opt', 'und'], d: 'Uzi reduzida ao tamanho de uma pistola, com cadência altíssima.', m: { k: 'rifle', rl: 0.2, rh: 0.065, rw: 0.05, ht: 'none', bl: 0.03, st: 'none', mg: 'grip', ml: 0.2, sg: 'post', m: C.BLK, f: C.BLK } });
W('vector', 'KRISS Vector', 'smg', '.45acp', 25, 1200, ['auto', 'burst', 'semi'], { recoil: [0.5, 0.35], origin: 'EUA', year: 2009, tags: ['elite', 'policia'], rar: 0.6, d: 'Sistema Super V desvia o recuo para baixo. Cadência absurda em .45 ACP.', m: { k: 'rifle', vector: 1, rl: 0.3, rh: 0.1, rw: 0.05, hl: 0.12, ht: 'rail', bl: 0.06, st: 'side', sl: 0.24, mg: 'straight', ml: 0.18, mz2: -0.06, sg: 'flat', m: C.BLK, f: C.BLK } });
W('p90', 'FN P90', 'smg', '5.7x28', 50, 900, ['auto', 'semi'], { recoil: [0.55, 0.35], integ: { opt: 'ring' }, noRails: ['opt', 'und'], origin: 'Bélgica', year: 1990, tags: ['militar', 'policia', 'elite'], rar: 0.7, d: 'Bullpup com carregador horizontal de 50 tiros sobre a arma e mira reflexa integrada.', m: { k: 'p90', m: C.BLK, f: C.BLK } });
W('mp7', 'H&K MP7A2', 'smg', '4.6x30', 40, 950, ['auto', 'semi'], { recoil: [0.55, 0.38], origin: 'Alemanha', year: 2001, tags: ['militar', 'elite'], d: 'Arma de defesa pessoal compacta com munição capaz de perfurar coletes leves.', m: { k: 'rifle', rl: 0.24, rh: 0.08, rw: 0.05, hl: 0.08, ht: 'rail', bl: 0.05, st: 'mp5', sl: 0.18, mg: 'grip', ml: 0.25, sg: 'flat', fgrip: 1, m: C.BLK, f: C.BLK } });
W('thompson', 'Thompson M1928A1', 'smg', '.45acp', 50, 700, ['auto', 'semi'], { reload: 3.2, recoil: [0.95, 0.5], move: 0.95, noRails: ['opt', 'und', 'muz'], origin: 'EUA', year: 1928, tags: ['historico'], rar: 0.7, d: 'A "Tommy Gun" dos gângsteres e da Segunda Guerra, com tambor de 50 tiros.', m: { k: 'rifle', rl: 0.3, rh: 0.065, rw: 0.045, ht: 'none', fgrip: 2, bl: 0.17, st: 'wood', sl: 0.32, gr: 'wood', mg: 'drum', ml: 0.06, sg: 'post', mz: 'cutts', fins: 1, m: C.STL, f: C.WOOD } });
W('mp40', 'MP 40', 'smg', '9x19', 32, 500, ['auto'], { recoil: [0.65, 0.35], noRails: ['opt', 'und'], origin: 'Alemanha', year: 1940, tags: ['historico'], d: 'Submetralhadora alemã de aço estampado e coronha rebatível.', m: { k: 'rifle', rl: 0.3, rh: 0.05, rw: 0.045, ht: 'none', bl: 0.12, st: 'fold', sl: 0.22, mg: 'straight', ml: 0.25, sg: 'hood', m: C.STL, f: C.BLK } });
W('ppsh', 'PPSh-41', 'smg', '7.62x25', 71, 1000, ['auto', 'semi'], { reload: 3.4, recoil: [0.8, 0.55], noRails: ['opt', 'und', 'muz'], origin: 'URSS', year: 1941, tags: ['historico'], d: 'A "Papasha": tambor de 71 tiros e cadência de 1000 tiros por minuto.', m: { k: 'rifle', rl: 0.25, rh: 0.06, rw: 0.045, hl: 0.24, ht: 'vent', bl: 0.02, st: 'wood', sl: 0.36, gr: 'none', mg: 'drum', ml: 0.05, sg: 'hood', m: C.STL, f: C.WOOD } });
W('skorpion', 'Škorpion vz. 61', 'smg', '.32acp', 20, 850, ['auto', 'semi'], { slot: 'sec', size: 3, recoil: [0.6, 0.55], noRails: ['opt', 'und'], origin: 'Tchecoslováquia', year: 1961, tags: ['policia', 'historico', 'civil'], d: 'Pistola-metralhadora compacta com coronha de arame dobrada sobre a arma.', m: { k: 'rifle', rl: 0.17, rh: 0.055, rw: 0.04, ht: 'none', bl: 0.03, st: 'wire', sl: 0.2, mg: 'curved', ml: 0.15, mc: 0.6, gr: 'wood', sg: 'post', m: C.STL, f: C.WOODD } });
W('mac10', 'Ingram MAC-10', 'smg', '.45acp', 30, 1090, ['auto', 'semi'], { slot: 'sec', size: 3, recoil: [1.0, 0.95], spread: [3.0, 1.0], noRails: ['opt', 'und'], origin: 'EUA', year: 1970, tags: ['civil', 'policia'], d: 'Uma caixa de aço que cospe .45 ACP. Cadência difícil de controlar.', m: { k: 'rifle', rl: 0.27, rh: 0.075, rw: 0.05, ht: 'none', bl: 0.04, st: 'none', mg: 'grip', ml: 0.25, sg: 'post', m: C.GRY, f: C.BLK } });
W('evo3', 'CZ Scorpion EVO 3', 'smg', '9x19', 30, 1150, ['auto', 'semi'], { recoil: [0.65, 0.45], origin: 'República Tcheca', year: 2009, tags: ['policia'], d: 'Submetralhadora moderna e modular, adotada por polícias europeias e brasileiras.', m: { k: 'rifle', rl: 0.28, rh: 0.07, rw: 0.05, hl: 0.12, ht: 'rail', bl: 0.05, st: 'side', sl: 0.23, mg: 'straight', ml: 0.2, sg: 'flat', m: C.BLK, f: C.BLK } });
W('bizon', 'PP-19 Bizon', 'smg', '9x18', 64, 700, ['auto', 'semi'], { reload: 2.6, origin: 'Rússia', year: 1996, tags: ['policia', 'militar'], d: 'Baseada no AK, com carregador helicoidal de 64 tiros sob o cano.', m: { k: 'rifle', ak: 1, rl: 0.3, rh: 0.065, rw: 0.045, ht: 'none', bl: 0.08, st: 'side', sl: 0.22, mg: 'helical', ml: 0.3, sg: 'ak', m: C.BLK, f: C.BLK } });
W('sten', 'Sten Mk II', 'smg', '9x19', 32, 550, ['auto', 'semi'], { recoil: [0.7, 0.45], noRails: ['opt', 'und'], origin: 'Reino Unido', year: 1941, tags: ['historico'], d: 'Feita com tubos e chapas em fábricas improvisadas. Carregador lateral.', m: { k: 'rifle', rl: 0.28, rh: 0.045, rw: 0.045, round: 1, ht: 'vent', hl: 0.08, bl: 0.07, st: 'wire', sl: 0.3, gr: 'none', mg: 'side', ml: 0.23, sg: 'post', m: C.STL, f: C.STL } });
W('mpx', 'SIG MPX', 'smg', '9x19', 30, 850, ['auto', 'semi'], { recoil: [0.6, 0.35], origin: 'EUA', year: 2015, tags: ['policia'], d: 'Submetralhadora com ergonomia de AR-15 e pistão a gás.', m: { k: 'rifle', ar: 1, rl: 0.28, rh: 0.07, rw: 0.045, hl: 0.2, ht: 'rail', bl: 0.04, st: 'skel', sl: 0.24, mg: 'straight', ml: 0.2, sg: 'flat', mz: 'flash', m: C.BLK, f: C.BLK } });

// ---------------------------------------------------------------- Fuzis de assalto
W('ak47', 'AK-47', 'fuzil', '7.62x39', 30, 600, ['auto', 'semi'], { recoil: [1.35, 0.6], rails: { und: 0, tac: 0 }, origin: 'URSS', year: 1949, tags: ['militar'], d: 'O fuzil mais produzido da história. Tolerâncias folgadas e confiabilidade lendária.', m: { k: 'rifle', ak: 1, rl: 0.33, rh: 0.07, rw: 0.048, hl: 0.24, ht: 'ak', bl: 0.17, st: 'ak', sl: 0.3, mg: 'curved', ml: 0.22, mc: 1, sg: 'ak', gas: 1, m: C.STL, f: C.WOOD } });
W('akm', 'AKM', 'fuzil', '7.62x39', 30, 600, ['auto', 'semi'], { recoil: [1.25, 0.55], rails: { und: 0, tac: 0 }, origin: 'URSS', year: 1959, tags: ['militar', 'civil'], d: 'AK modernizado com receptor estampado e quebra-chamas inclinado.', m: { k: 'rifle', ak: 1, rl: 0.33, rh: 0.07, rw: 0.048, hl: 0.24, ht: 'ak', bl: 0.16, st: 'ak', sl: 0.3, mg: 'curved', ml: 0.22, mc: 1, sg: 'ak', mz: 'slant', gas: 1, m: C.STL, f: C.WOODR } });
W('ak74m', 'AK-74M', 'fuzil', '5.45x39', 30, 650, ['auto', 'semi'], { recoil: [0.9, 0.45], rails: { und: 0 }, origin: 'Rússia', year: 1991, tags: ['militar'], d: 'Calibre menor e freio de boca eficiente: recuo bem mais controlável que o AK-47.', m: { k: 'rifle', ak: 1, rl: 0.33, rh: 0.07, rw: 0.048, hl: 0.24, ht: 'ak', bl: 0.15, st: 'side', sl: 0.28, mg: 'curved', ml: 0.22, mc: 0.8, mgc: C.PLUM, sg: 'ak', mz: 'brake74', gas: 1, m: C.BLK, f: C.BLK } });
W('ak12', 'AK-12', 'fuzil', '5.45x39', 30, 700, ['auto', 'burst', 'semi'], { recoil: [0.8, 0.4], origin: 'Rússia', year: 2018, tags: ['militar', 'elite'], rar: 0.7, d: 'A geração atual do AK, com trilhos Picatinny e coronha telescópica.', m: { k: 'rifle', ak: 1, rl: 0.33, rh: 0.075, rw: 0.048, hl: 0.24, ht: 'rail', bl: 0.14, st: 'side', sl: 0.27, mg: 'curved', ml: 0.22, mc: 0.8, sg: 'flat', mz: 'brake', m: C.BLK, f: C.BLK } });
W('aks74u', 'AKS-74U', 'fuzil', '5.45x39', 30, 700, ['auto', 'semi'], { recoil: [1.05, 0.7], spread: [3.0, 0.32], rails: { und: 0, tac: 0 }, origin: 'URSS', year: 1979, tags: ['militar'], d: 'A "Krinkov": carabina curta para tripulações de veículos e pilotos.', m: { k: 'rifle', ak: 1, rl: 0.3, rh: 0.07, rw: 0.048, hl: 0.14, ht: 'ak', bl: 0.03, st: 'fold', sl: 0.24, mg: 'curved', ml: 0.22, mc: 0.8, sg: 'ak', mz: 'booster', gas: 1, m: C.STL, f: C.WOODR } });
W('m16a4', 'M16A4', 'fuzil', '5.56x45', 30, 800, ['burst', 'semi'], { recoil: [0.8, 0.35], spread: [3.0, 0.14], origin: 'EUA', year: 1998, tags: ['militar'], d: 'Fuzil longo com rajada de três tiros e alça de transporte destacável.', m: { k: 'rifle', ar: 1, rl: 0.3, rh: 0.075, rw: 0.045, hl: 0.32, ht: 'rail', bl: 0.18, st: 'a2', sl: 0.28, mg: 'stanag', ml: 0.2, sg: 'carry', mz: 'a2', m: C.BLK, f: C.BLK } });
W('m4a1', 'Colt M4A1', 'fuzil', '5.56x45', 30, 850, ['auto', 'semi'], { recoil: [0.85, 0.38], origin: 'EUA', year: 1994, tags: ['militar', 'policia'], d: 'Carabina compacta derivada do M16, padrão de infantaria e forças especiais.', m: { k: 'rifle', ar: 1, rl: 0.3, rh: 0.075, rw: 0.045, hl: 0.18, ht: 'ar', bl: 0.13, st: 'tube', sl: 0.26, mg: 'stanag', ml: 0.2, sg: 'flat', mz: 'a2', m: C.BLK, f: C.BLK } });
W('hk416', 'H&K HK416', 'fuzil', '5.56x45', 30, 850, ['auto', 'semi'], { recoil: [0.78, 0.36], origin: 'Alemanha', year: 2004, tags: ['militar', 'elite'], rar: 0.7, d: 'AR-15 com pistão de gás curto: mais limpo e confiável. Usado na operação contra Bin Laden.', m: { k: 'rifle', ar: 1, rl: 0.3, rh: 0.078, rw: 0.046, hl: 0.24, ht: 'rail', bl: 0.07, st: 'tube', sl: 0.26, mg: 'stanag', ml: 0.2, sg: 'flat', mz: 'flash', m: C.BLK, f: C.BLK } });
W('scarl', 'FN SCAR-L', 'fuzil', '5.56x45', 30, 625, ['auto', 'semi'], { recoil: [0.8, 0.4], origin: 'Bélgica', year: 2009, tags: ['militar', 'elite'], rar: 0.8, d: 'Fuzil modular das forças especiais dos EUA. Cadência moderada e muito controlável.', m: { k: 'rifle', rl: 0.4, rh: 0.08, rw: 0.05, hl: 0.16, ht: 'rail', bl: 0.11, st: 'scar', sl: 0.25, mg: 'stanag', ml: 0.2, sg: 'flat', mz: 'flash', m: C.TAN, f: C.TAN, a: C.BLK } });
W('aug', 'Steyr AUG A1', 'fuzil', '5.56x45', 30, 680, ['auto', 'semi'], { recoil: [0.75, 0.4], spread: [2.6, 0.12], integ: { opt: 'aug' }, noRails: ['opt'], origin: 'Áustria', year: 1978, tags: ['militar'], d: 'Bullpup pioneiro com luneta 1,5× integrada e corpo de polímero.', m: { k: 'bullpup', aug: 1, m: C.GRN, f: C.GRN, mgc: 0x6e746c } });
W('famas', 'FAMAS F1', 'fuzil', '5.56x45', 25, 1000, ['auto', 'burst', 'semi'], { recoil: [0.95, 0.5], origin: 'França', year: 1978, tags: ['militar'], d: 'O "Clairon" (corneta) francês: bullpup com alça longa e cadência de 1000 t/min.', m: { k: 'bullpup', famas: 1, m: C.BLK, f: C.BLK } });
W('l85', 'L85A2 (SA80)', 'fuzil', '5.56x45', 30, 650, ['auto', 'semi'], { recoil: [0.7, 0.35], spread: [2.8, 0.1], integ: { opt: 'susat' }, noRails: ['opt'], origin: 'Reino Unido', year: 1985, tags: ['militar'], d: 'Fuzil britânico bullpup com luneta SUSAT 4× e muito peso à retaguarda.', m: { k: 'bullpup', l85: 1, m: C.BLK, f: C.BLK } });
W('g36c', 'H&K G36C', 'fuzil', '5.56x45', 30, 750, ['auto', 'burst', 'semi'], { recoil: [0.8, 0.4], origin: 'Alemanha', year: 2001, tags: ['militar', 'policia'], d: 'Carabina de polímero reforçado com alça de transporte integrada.', m: { k: 'rifle', rl: 0.3, rh: 0.08, rw: 0.05, hl: 0.14, ht: 'poly', bl: 0.06, st: 'skel', sl: 0.25, mg: 'stanag', ml: 0.2, sg: 'g36', mz: 'flash', m: C.BLK, f: C.BLK, mgc: 0x5a5e66 } });
W('galil', 'IWI Galil ACE 32', 'fuzil', '7.62x39', 35, 700, ['auto', 'semi'], { recoil: [1.15, 0.5], origin: 'Israel', year: 2008, tags: ['militar'], d: 'Herdeira do Galil, baseada no sistema Kalashnikov, com trilhos modernos.', m: { k: 'rifle', ak: 1, rl: 0.34, rh: 0.075, rw: 0.048, hl: 0.22, ht: 'rail', bl: 0.12, st: 'side', sl: 0.27, mg: 'curved', ml: 0.23, mc: 1, sg: 'flat', mz: 'flash', m: C.BLK, f: C.BLK } });
W('ia2', 'IMBEL IA2', 'fuzil', '5.56x45', 30, 700, ['auto', 'semi'], { recoil: [0.85, 0.4], origin: 'Brasil', year: 2012, tags: ['militar', 'policia'], d: 'Fuzil de assalto brasileiro da IMBEL, padrão do Exército Brasileiro.', m: { k: 'rifle', rl: 0.34, rh: 0.075, rw: 0.048, hl: 0.2, ht: 'rail', bl: 0.12, st: 'side', sl: 0.26, mg: 'stanag', ml: 0.2, sg: 'flat', mz: 'flash', m: C.BLK, f: C.BLK } });
W('qbz95', 'QBZ-95', 'fuzil', '5.8x42', 30, 650, ['auto', 'semi'], { recoil: [0.8, 0.42], origin: 'China', year: 1997, tags: ['militar'], d: 'Bullpup do Exército de Libertação Popular, com calibre próprio de 5,8 mm.', m: { k: 'bullpup', qbz: 1, m: C.GRN, f: 0x3f4632 } });
W('tavor', 'IWI Tavor TAR-21', 'fuzil', '5.56x45', 30, 900, ['auto', 'semi'], { recoil: [0.8, 0.45], origin: 'Israel', year: 2001, tags: ['militar', 'elite'], d: 'Bullpup israelense robusto, com guarda-mato fechado e cano completo em corpo curto.', m: { k: 'bullpup', tavor: 1, m: C.BLK, f: C.BLK } });
W('asval', 'AS Val', 'fuzil', '9x39', 20, 900, ['auto', 'semi'], { recoil: [0.75, 0.45], integ: { muz: 'supp' }, noRails: ['muz', 'und'], origin: 'Rússia', year: 1987, tags: ['elite'], rar: 0.6, d: 'Fuzil silenciado de forças especiais com munição subsônica pesada 9×39.', m: { k: 'rifle', ak: 1, rl: 0.3, rh: 0.065, rw: 0.045, ht: 'none', bl: 0, st: 'skel', sl: 0.25, mg: 'straight', ml: 0.18, sg: 'ak', mz: 'supplong', m: C.BLK, f: C.BLK } });
W('mcx', 'SIG MCX', 'fuzil', '.300blk', 30, 800, ['auto', 'semi'], { recoil: [0.9, 0.42], origin: 'EUA', year: 2015, tags: ['militar', 'elite'], d: 'Projetada para o .300 Blackout, ideal com supressor.', m: { k: 'rifle', ar: 1, rl: 0.3, rh: 0.076, rw: 0.046, hl: 0.22, ht: 'rail', bl: 0.05, st: 'skel', sl: 0.24, mg: 'stanag', ml: 0.2, sg: 'flat', mz: 'flash', m: C.BLK, f: C.BLK } });
W('t4', 'Taurus T4', 'fuzil', '5.56x45', 30, 750, ['auto', 'semi'], { recoil: [0.85, 0.4], origin: 'Brasil', year: 2014, tags: ['policia', 'militar'], d: 'Plataforma AR brasileira usada por polícias estaduais.', m: { k: 'rifle', ar: 1, rl: 0.3, rh: 0.075, rw: 0.045, hl: 0.22, ht: 'rail', bl: 0.1, st: 'tube', sl: 0.26, mg: 'stanag', ml: 0.2, sg: 'flat', mz: 'a2', m: C.BLK, f: C.TAN } });
W('stg44', 'StG 44', 'fuzil', '7.92x33', 30, 550, ['auto', 'semi'], { recoil: [1.1, 0.5], noRails: ['opt', 'und', 'tac'], origin: 'Alemanha', year: 1943, tags: ['historico'], rar: 0.7, d: 'O primeiro fuzil de assalto de verdade, com cartucho intermediário.', m: { k: 'rifle', rl: 0.32, rh: 0.07, rw: 0.045, hl: 0.12, ht: 'metal', bl: 0.2, st: 'wood', sl: 0.3, mg: 'curved', ml: 0.27, mc: 0.5, sg: 'hood', gas: 1, m: C.STL, f: C.WOOD } });

// ---------------------------------------------------------------- Fuzis de batalha
W('fal', 'FN FAL (IMBEL M964)', 'batalha', '7.62x51', 20, 650, ['auto', 'semi'], { origin: 'Bélgica / Brasil', year: 1953, tags: ['militar'], d: 'O "braço direito do mundo livre", fabricado no Brasil pela IMBEL por décadas.', m: { k: 'rifle', rl: 0.4, rh: 0.08, rw: 0.05, hl: 0.22, ht: 'wood', bl: 0.18, st: 'wood', sl: 0.3, mg: 'box', ml: 0.17, sg: 'hood', mz: 'flash', m: C.STL, f: C.WOOD } });
W('g3', 'H&K G3A3', 'batalha', '7.62x51', 20, 550, ['auto', 'semi'], { origin: 'Alemanha', year: 1959, tags: ['militar'], d: 'Ferrolho de roletes, tambor de mira giratório e potência de sobra.', m: { k: 'rifle', rl: 0.37, rh: 0.075, rw: 0.048, hl: 0.26, ht: 'slim', bl: 0.16, st: 'g3', sl: 0.28, mg: 'straight', ml: 0.18, sg: 'hood', mz: 'flash', ctube: 1, m: C.BLK, f: C.BLK } });
W('m14', 'M14', 'batalha', '7.62x51', 20, 700, ['auto', 'semi'], { recoil: [1.8, 0.7], origin: 'EUA', year: 1959, tags: ['militar', 'historico'], d: 'Evolução do Garand com carregador de 20 tiros e modo automático.', m: { k: 'rifle', rl: 0.3, rh: 0.07, rw: 0.048, hl: 0.32, ht: 'wood', bl: 0.15, st: 'wood', sl: 0.32, gr: 'none', mg: 'box', ml: 0.15, sg: 'peep', mz: 'flash', m: C.STL, f: C.WOOD } });
W('scarh', 'FN SCAR-H', 'batalha', '7.62x51', 20, 600, ['auto', 'semi'], { recoil: [1.4, 0.55], origin: 'Bélgica', year: 2009, tags: ['elite'], rar: 0.8, d: 'Versão pesada do SCAR em 7,62 NATO, surpreendentemente controlável.', m: { k: 'rifle', rl: 0.42, rh: 0.085, rw: 0.052, hl: 0.17, ht: 'rail', bl: 0.13, st: 'scar', sl: 0.25, mg: 'box', ml: 0.15, sg: 'flat', mz: 'flash', m: C.TAN, f: C.TAN, a: C.BLK } });
W('garand', 'M1 Garand', 'batalha', '.30-06', 8, 300, ['semi'], { reloadType: 'enbloc', reload: 2.0, noRails: ['opt', 'und', 'tac', 'muz'], origin: 'EUA', year: 1936, tags: ['historico'], d: '"A maior arma de batalha já criada" (Patton). Pente en-bloc com o famoso "ping".', m: { k: 'rifle', rl: 0.3, rh: 0.07, rw: 0.048, hl: 0.36, ht: 'wood', bl: 0.15, st: 'wood', sl: 0.32, gr: 'none', mg: 'none', sg: 'peep', m: C.STL, f: C.WOOD } });
W('svt40', 'SVT-40', 'batalha', '7.62x54r', 10, 350, ['semi'], { recoil: [1.8, 0.6], noRails: ['und', 'tac'], origin: 'URSS', year: 1940, tags: ['historico'], d: 'Fuzil semiautomático soviético, com freio de boca e carregador de 10.', m: { k: 'rifle', rl: 0.28, rh: 0.07, rw: 0.046, hl: 0.36, ht: 'wood', bl: 0.18, st: 'wood', sl: 0.32, gr: 'none', mg: 'box', ml: 0.1, sg: 'hood', mz: 'brake', m: C.STL, f: C.WOOD } });
W('sks', 'SKS', 'carabina', '7.62x39', 10, 350, ['semi'], { reloadType: 'clip', clip: 10, reload: 2.4, noRails: ['und'], origin: 'URSS', year: 1945, tags: ['civil', 'caca', 'historico'], d: 'Carabina semiautomática com baioneta dobrável, abastecida por pente.', m: { k: 'rifle', rl: 0.26, rh: 0.065, rw: 0.046, hl: 0.28, ht: 'wood', bl: 0.2, st: 'wood', sl: 0.32, gr: 'none', mg: 'fixed', ml: 0.05, sg: 'ak', gas: 1, bay: 1, m: C.STL, f: C.WOOD } });

// ---------------------------------------------------------------- DMR / precisão semiautomática
W('svd', 'SVD Dragunov', 'dmr', '7.62x54r', 10, 300, ['semi'], { def: { opt: 'pso1' }, origin: 'URSS', year: 1963, tags: ['militar', 'elite'], rar: 0.7, d: 'Fuzil de atirador designado soviético, com coronha vazada e luneta PSO-1.', m: { k: 'rifle', ak: 1, rl: 0.33, rh: 0.07, rw: 0.048, hl: 0.25, ht: 'svd', bl: 0.27, st: 'thumb', sl: 0.3, mg: 'box', ml: 0.14, sg: 'ak', mz: 'flash', gas: 1, m: C.STL, f: C.WOODR } });
W('mk14', 'Mk 14 EBR', 'dmr', '7.62x51', 20, 700, ['semi', 'auto'], { def: { opt: 'acog' }, origin: 'EUA', year: 2004, tags: ['elite'], rar: 0.6, d: 'M14 modernizado em chassi de alumínio com trilhos e coronha ajustável.', m: { k: 'rifle', rl: 0.3, rh: 0.075, rw: 0.05, hl: 0.3, ht: 'rail', bl: 0.17, st: 'chassis', sl: 0.26, mg: 'box', ml: 0.15, sg: 'flat', mz: 'flash', m: C.BLK, f: C.TAN } });
W('sr25', 'KAC SR-25', 'dmr', '7.62x51', 20, 300, ['semi'], { def: { opt: 'scope8' }, recoil: [1.7, 0.45], spread: [3.5, 0.05], origin: 'EUA', year: 1990, tags: ['elite'], rar: 0.6, d: 'AR-10 de precisão de Eugene Stoner, base do M110 SASS.', m: { k: 'rifle', ar: 1, rl: 0.34, rh: 0.08, rw: 0.048, hl: 0.3, ht: 'rail', bl: 0.24, br: 0.013, st: 'a2', sl: 0.28, mg: 'box', ml: 0.15, sg: 'flat', mz: 'flash', m: C.BLK, f: C.BLK } });
W('vss', 'VSS Vintorez', 'dmr', '9x39', 10, 900, ['semi', 'auto'], { recoil: [1.0, 0.45], spread: [3.0, 0.12], def: { opt: 'pso1' }, integ: { muz: 'supp' }, noRails: ['muz', 'und'], origin: 'URSS', year: 1987, tags: ['elite'], rar: 0.5, d: '"Vintorez" (parafuso): fuzil de precisão silenciado para operações especiais.', m: { k: 'rifle', ak: 1, rl: 0.3, rh: 0.065, rw: 0.045, ht: 'none', bl: 0, st: 'thumb', sl: 0.28, mg: 'straight', ml: 0.1, sg: 'ak', mz: 'supplong', m: C.BLK, f: C.WOOD } });
W('mini14', 'Ruger Mini-14', 'carabina', '5.56x45', 20, 350, ['semi'], { origin: 'EUA', year: 1973, tags: ['civil', 'caca', 'policia'], noRails: [], rails: { muz: 1 }, d: 'Carabina de rancho com mecanismo do M14 e calibre 5,56.', m: { k: 'rifle', rl: 0.26, rh: 0.065, rw: 0.046, hl: 0.25, ht: 'wood', bl: 0.18, st: 'wood', sl: 0.32, gr: 'none', mg: 'box', ml: 0.12, sg: 'peep', m: C.SIL, f: C.WOOD } });
W('m1carbine', 'M1 Carbine', 'carabina', '.30carbine', 15, 400, ['semi'], { recoil: [1.0, 0.4], origin: 'EUA', year: 1942, tags: ['historico', 'civil'], d: 'Carabina leve para tropas de apoio na Segunda Guerra e na Coreia.', m: { k: 'rifle', rl: 0.22, rh: 0.06, rw: 0.044, hl: 0.25, ht: 'wood', bl: 0.12, st: 'wood', sl: 0.3, gr: 'none', mg: 'straight', ml: 0.11, sg: 'peep', m: C.STL, f: C.WOOD } });
W('ruger1022', 'Ruger 10/22', 'carabina', '.22lr', 10, 400, ['semi'], { recoil: [0.4, 0.2], origin: 'EUA', year: 1964, tags: ['civil', 'caca'], rails: { muz: 1 }, d: 'A carabina .22 mais popular do mundo, com carregador rotativo de 10.', m: { k: 'rifle', rl: 0.22, rh: 0.06, rw: 0.044, hl: 0.2, ht: 'wood', bl: 0.22, br: 0.009, st: 'wood', sl: 0.3, gr: 'none', mg: 'rotary', ml: 0.04, sg: 'post', m: C.BLK, f: C.WOODL } });
W('puma', 'Rossi Puma R92', 'carabina', '.357', 10, 120, ['semi'], { action: 'lever', cycle: 0.45, reloadType: 'shell', shellTime: 0.45, recoil: [1.6, 0.4], origin: 'Brasil', year: 1978, tags: ['civil', 'caca'], d: 'Clássica carabina brasileira de alavanca, cópia do Winchester 1892 em .357.', m: { k: 'rifle', rl: 0.2, rh: 0.062, rw: 0.044, hl: 0.2, ht: 'wood', bl: 0.28, st: 'wood', sl: 0.32, gr: 'none', mg: 'tube', lever: 1, sg: 'post', m: C.STL, f: C.WOOD } });
W('win94', 'Winchester Model 1894', 'carabina', '.30-30', 7, 110, ['semi'], { action: 'lever', cycle: 0.5, reloadType: 'shell', shellTime: 0.5, recoil: [2.0, 0.5], spread: [3.0, 0.08], origin: 'EUA', year: 1894, tags: ['caca', 'historico'], d: 'O fuzil de alavanca que conquistou o Oeste. Mais de 7 milhões produzidos.', m: { k: 'rifle', rl: 0.2, rh: 0.064, rw: 0.044, hl: 0.22, ht: 'wood', bl: 0.3, st: 'wood', sl: 0.33, gr: 'none', mg: 'tube', lever: 1, sg: 'post', m: C.STL, f: C.WOODL } });

// ---------------------------------------------------------------- Fuzis de ferrolho
W('rem700', 'Remington 700', 'sniper', '7.62x51', 5, 50, ['semi'], { def: { opt: 'scope8' }, origin: 'EUA', year: 1962, tags: ['caca'], d: 'O fuzil de ferrolho mais vendido dos EUA, base de inúmeros fuzis de precisão.', m: { k: 'rifle', rl: 0.24, rh: 0.06, rw: 0.044, hl: 0.3, ht: 'wood', bl: 0.32, st: 'wood', sl: 0.34, gr: 'none', mg: 'none', bolt: 1, sg: 'none', m: C.BLK, f: C.WOOD } });
W('m24', 'M24 SWS', 'sniper', '7.62x51', 5, 50, ['semi'], { def: { opt: 'scope10' }, spread: [6, 0.015], origin: 'EUA', year: 1988, tags: ['militar', 'elite'], d: 'Sistema de armas de atirador de elite do Exército dos EUA, baseado no Remington 700.', m: { k: 'rifle', rl: 0.24, rh: 0.062, rw: 0.046, hl: 0.32, ht: 'poly', bl: 0.33, br: 0.013, st: 'poly', sl: 0.34, gr: 'none', mg: 'none', bolt: 1, sg: 'none', m: C.BLK, f: C.OD } });
W('awm', 'Accuracy International AWM', 'sniper', '.338', 5, 45, ['semi'], { cycle: 1.2, recoil: [4.5, 0.8], move: 0.86, def: { opt: 'scope12' }, bipod: true, origin: 'Reino Unido', year: 1996, tags: ['elite'], rar: 0.4, d: 'Fuzil "Magnum" ártico em .338 Lapua: tiros letais a mais de 1 km.', m: { k: 'rifle', rl: 0.3, rh: 0.075, rw: 0.06, hl: 0.3, ht: 'aw', bl: 0.36, br: 0.014, st: 'aw', sl: 0.32, mg: 'box', ml: 0.1, bolt: 1, sg: 'none', mz: 'brake', bip: 1, m: C.BLK, f: C.GRN } });
W('trg42', 'Sako TRG-42', 'sniper', '.338', 5, 45, ['semi'], { cycle: 1.1, recoil: [4.3, 0.8], move: 0.87, def: { opt: 'scope12' }, origin: 'Finlândia', year: 1999, tags: ['elite'], rar: 0.4, d: 'Fuzil finlandês de precisão extrema com coronha ajustável.', m: { k: 'rifle', rl: 0.28, rh: 0.07, rw: 0.055, hl: 0.3, ht: 'poly', bl: 0.36, br: 0.014, st: 'chassis', sl: 0.3, mg: 'box', ml: 0.1, bolt: 1, sg: 'none', mz: 'brake', m: C.BLK, f: C.BLK } });
W('m200', 'CheyTac M200 Intervention', 'sniper', '.408', 7, 40, ['semi'], { cycle: 1.25, recoil: [5.0, 0.9], move: 0.84, def: { opt: 'scope12' }, bipod: true, origin: 'EUA', year: 2001, tags: ['elite'], rar: 0.3, d: 'Sistema de longo alcance em .408 CheyTac, preciso além de 2 km.', m: { k: 'rifle', rl: 0.32, rh: 0.075, rw: 0.06, hl: 0.36, ht: 'tube', bl: 0.26, br: 0.016, st: 'skel', sl: 0.3, mg: 'box', ml: 0.1, bolt: 1, sg: 'none', mz: 'brake', bip: 1, m: C.TAN, f: C.TAN, a: C.BLK } });
W('m82', 'Barrett M82A1', 'sniper', '.50bmg', 10, 120, ['semi'], { action: null, reload: 3.8, recoil: [6.5, 1.2], move: 0.8, def: { opt: 'scope10' }, bipod: true, size: 9, origin: 'EUA', year: 1982, tags: ['elite'], rar: 0.3, d: 'Fuzil antimaterial semiautomático em .50 BMG. Atravessa motores e blindagens leves.', m: { k: 'rifle', rl: 0.55, rh: 0.11, rw: 0.07, ht: 'none', bl: 0.46, br: 0.017, st: 'barrett', sl: 0.3, mg: 'box', ml: 0.12, sg: 'none', mz: 'barrett', bip: 1, carry: 1, m: C.BLK, f: C.BLK } });
W('mosin', 'Mosin–Nagant M91/30', 'sniper', '7.62x54r', 5, 40, ['semi'], { cycle: 1.1, reloadType: 'clip', clip: 5, reload: 2.6, spread: [6, 0.04], noRails: ['und'], origin: 'Rússia', year: 1930, tags: ['historico', 'caca'], d: 'Fuzil de ferrolho russo usado de 1891 até hoje. Cano longo e muito robusto.', m: { k: 'rifle', rl: 0.3, rh: 0.065, rw: 0.046, hl: 0.46, ht: 'wood', bl: 0.16, st: 'wood', sl: 0.34, gr: 'none', mg: 'none', bolt: 1, sg: 'hood', m: C.STL, f: C.WOOD } });
W('kar98k', 'Karabiner 98k', 'sniper', '7.92x57', 5, 40, ['semi'], { cycle: 1.0, reloadType: 'clip', clip: 5, reload: 2.4, spread: [6, 0.035], noRails: ['und'], origin: 'Alemanha', year: 1935, tags: ['historico', 'caca'], d: 'Fuzil de serviço alemão com o lendário ferrolho Mauser 98.', m: { k: 'rifle', rl: 0.28, rh: 0.065, rw: 0.046, hl: 0.4, ht: 'wood', bl: 0.14, st: 'wood', sl: 0.34, gr: 'none', mg: 'none', bolt: 1, sg: 'hood', m: C.STL, f: C.WOODD } });
W('enfield', 'Lee–Enfield No. 4 Mk I', 'sniper', '.303', 10, 50, ['semi'], { cycle: 0.75, reloadType: 'clip', clip: 5, reload: 2.2, spread: [6, 0.04], noRails: ['und'], origin: 'Reino Unido', year: 1941, tags: ['historico', 'caca'], d: 'O ferrolho mais rápido da Segunda Guerra, com carregador de 10 tiros.', m: { k: 'rifle', rl: 0.3, rh: 0.065, rw: 0.046, hl: 0.4, ht: 'wood', bl: 0.08, st: 'wood', sl: 0.34, gr: 'none', mg: 'box', ml: 0.07, bolt: 1, sg: 'peep', m: C.STL, f: C.WOOD } });
W('sv98', 'SV-98', 'sniper', '7.62x54r', 10, 50, ['semi'], { def: { opt: 'scope8' }, origin: 'Rússia', year: 1998, tags: ['militar', 'elite'], d: 'Fuzil de precisão russo de ferrolho com carregador de 10 tiros.', m: { k: 'rifle', rl: 0.28, rh: 0.065, rw: 0.05, hl: 0.32, ht: 'poly', bl: 0.26, st: 'thumb', sl: 0.3, mg: 'box', ml: 0.12, bolt: 1, sg: 'none', mz: 'brake', m: C.BLK, f: 0x3d4434 } });

// ---------------------------------------------------------------- Espingardas
W('rem870', 'Remington 870', 'espingarda', '12ga', 6, 70, ['semi'], { origin: 'EUA', year: 1950, tags: ['civil', 'policia', 'caca'], d: 'A espingarda de bombeamento mais vendida da história.', m: { k: 'rifle', rl: 0.25, rh: 0.07, rw: 0.045, hl: 0.2, ht: 'pump', bl: 0.32, br: 0.012, st: 'wood', sl: 0.34, gr: 'none', mg: 'tube', sg: 'bead', m: C.BLK, f: C.WOOD } });
W('m500', 'Mossberg 500', 'espingarda', '12ga', 6, 70, ['semi'], { origin: 'EUA', year: 1961, tags: ['civil', 'policia'], d: 'Rival do 870, com trava de segurança no topo e corpo de alumínio.', m: { k: 'rifle', rl: 0.25, rh: 0.07, rw: 0.045, hl: 0.2, ht: 'pump', bl: 0.3, br: 0.012, st: 'poly', sl: 0.33, gr: 'none', mg: 'tube', sg: 'bead', m: C.BLK, f: C.BLK } });
W('cbcpump', 'CBC Pump Military 3.0', 'espingarda', '12ga', 7, 75, ['semi'], { origin: 'Brasil', year: 2010, tags: ['policia', 'civil'], d: 'Espingarda tática da Companhia Brasileira de Cartuchos, comum nas polícias.', m: { k: 'rifle', rl: 0.25, rh: 0.07, rw: 0.045, hl: 0.2, ht: 'pump', bl: 0.25, br: 0.012, st: 'tube', sl: 0.26, mg: 'tube', sg: 'flat', m: C.BLK, f: C.BLK } });
W('benelli', 'Benelli M4 Super 90', 'espingarda', '12ga', 7, 220, ['semi'], { action: null, recoil: [3.4, 0.9], origin: 'Itália', year: 1998, tags: ['policia', 'militar'], d: 'Semiautomática a gás adotada pelos Fuzileiros dos EUA como M1014.', m: { k: 'rifle', rl: 0.28, rh: 0.072, rw: 0.046, hl: 0.2, ht: 'poly', bl: 0.25, br: 0.012, st: 'skel', sl: 0.26, mg: 'tube', sg: 'flat', m: C.BLK, f: C.BLK } });
W('spas12', 'Franchi SPAS-12', 'espingarda', '12ga', 8, 90, ['pump', 'semi'], { recoil: [3.8, 1.0], origin: 'Itália', year: 1979, tags: ['policia', 'militar'], d: 'Alterna entre bombeamento e semiautomático. Coronha com gancho e ar de cinema.', m: { k: 'rifle', rl: 0.27, rh: 0.075, rw: 0.046, hl: 0.22, ht: 'pumpv', bl: 0.2, br: 0.012, st: 'fold', sl: 0.25, mg: 'tube', sg: 'post', m: C.BLK, f: C.BLK } });
W('saiga12', 'Saiga-12', 'espingarda', '12ga', 8, 300, ['semi'], { action: null, reloadType: 'mag', reload: 2.6, recoil: [3.6, 1.0], origin: 'Rússia', year: 1997, tags: ['militar', 'civil'], d: 'Espingarda semiautomática com mecanismo Kalashnikov e carregador destacável.', m: { k: 'rifle', ak: 1, rl: 0.33, rh: 0.07, rw: 0.05, hl: 0.2, ht: 'ak', bl: 0.2, br: 0.013, st: 'side', sl: 0.27, mg: 'box', ml: 0.17, mw: 0.06, sg: 'ak', gas: 1, m: C.BLK, f: C.BLK } });
W('aa12', 'AA-12', 'espingarda', '12ga', 20, 300, ['auto', 'semi'], { action: null, reloadType: 'mag', reload: 3.0, recoil: [1.6, 0.8], move: 0.9, origin: 'EUA', year: 2005, tags: ['elite'], rar: 0.4, d: 'Espingarda totalmente automática de recuo quase nulo, com tambor de 20.', m: { k: 'rifle', rl: 0.45, rh: 0.09, rw: 0.06, ht: 'none', bl: 0.26, br: 0.013, st: 'poly', sl: 0.25, mg: 'drum', ml: 0.06, sg: 'aa12', carry: 1, m: C.BLK, f: C.BLK } });
W('ksg', 'Kel-Tec KSG', 'espingarda', '12ga', 14, 75, ['semi'], { origin: 'EUA', year: 2011, tags: ['policia', 'civil'], d: 'Bullpup com dois tubos de carregador: 14 cartuchos em corpo compacto.', m: { k: 'bullpup', ksg: 1, m: C.BLK, f: C.BLK } });
W('izh43', 'Baikal IZH-43 (cano duplo)', 'espingarda', '12ga', 2, 300, ['semi'], { action: null, shellTime: 0.6, noRails: ['opt', 'tac'], origin: 'Rússia', year: 1986, tags: ['civil', 'caca'], d: 'Espingarda de canos lado a lado: dois tiros devastadores e recarga rápida.', m: { k: 'rifle', rl: 0.13, rh: 0.065, rw: 0.06, hl: 0.25, ht: 'wood', bl: 0.45, dbl: 1, st: 'wood', sl: 0.34, gr: 'none', mg: 'none', sg: 'bead', m: C.STL, f: C.WOOD } });
W('sawedoff', 'Cano duplo serrado', 'espingarda', '12ga', 2, 300, ['semi'], { slot: 'sec', size: 3, action: null, shellTime: 0.6, choke: 5, recoil: [5, 1.5], spread: [2, 1.5], noRails: ['opt', 'tac'], origin: '—', year: null, tags: ['civil'], d: 'Canos e coronha serrados: cabe no coldre e espalha chumbo para todo lado.', m: { k: 'rifle', rl: 0.13, rh: 0.065, rw: 0.06, hl: 0.12, ht: 'wood', bl: 0.18, dbl: 1, st: 'none', gr: 'wood', mg: 'none', sg: 'bead', m: C.STL, f: C.WOOD } });
W('win1897', 'Winchester 1897 "Trench"', 'espingarda', '12ga', 5, 100, ['semi'], { cycle: 0.4, noRails: ['opt', 'tac'], origin: 'EUA', year: 1897, tags: ['historico', 'caca'], d: 'Espingarda de trincheira da Primeira Guerra, com protetor de cano ventilado.', m: { k: 'rifle', rl: 0.25, rh: 0.07, rw: 0.045, hl: 0.18, ht: 'pump', bl: 0.35, br: 0.012, heat: 1, st: 'wood', sl: 0.34, gr: 'none', mg: 'tube', sg: 'bead', m: C.STL, f: C.WOOD } });

// ---------------------------------------------------------------- Metralhadoras
W('m249', 'FN M249 SAW', 'lmg', '5.56x45', 200, 800, ['auto'], { origin: 'Bélgica / EUA', year: 1984, tags: ['elite', 'militar'], rar: 0.5, d: 'Metralhadora leve de esquadra alimentada por fita de 200 tiros.', m: { k: 'rifle', rl: 0.4, rh: 0.095, rw: 0.07, hl: 0.2, ht: 'ribbed', bl: 0.26, st: 'poly', sl: 0.28, mg: 'belt', ml: 0.12, carry: 1, bip: 1, sg: 'flat', mz: 'flash', m: C.BLK, f: C.BLK } });
W('pkm', 'PKM', 'lmg', '7.62x54r', 100, 650, ['auto'], { recoil: [1.0, 0.6], origin: 'URSS', year: 1969, tags: ['elite', 'militar'], rar: 0.5, d: 'Metralhadora de uso geral soviética: leve para seu calibre e muito confiável.', m: { k: 'rifle', rl: 0.38, rh: 0.085, rw: 0.06, ht: 'none', bl: 0.38, br: 0.013, st: 'thumb', sl: 0.3, mg: 'belt', ml: 0.12, carry: 1, bip: 1, sg: 'ak', mz: 'flash', m: C.STL, f: C.WOODR } });
W('rpk', 'RPK', 'lmg', '7.62x39', 75, 600, ['auto', 'semi'], { reload: 3.4, recoil: [1.0, 0.5], origin: 'URSS', year: 1961, tags: ['militar'], d: 'AK de cano pesado com bipé, coronha "pé de cabra" e tambor de 75.', m: { k: 'rifle', ak: 1, rl: 0.33, rh: 0.07, rw: 0.048, hl: 0.24, ht: 'ak', bl: 0.3, st: 'rpk', sl: 0.3, mg: 'drum', ml: 0.05, sg: 'ak', gas: 1, bip: 1, m: C.STL, f: C.WOOD } });
W('m60', 'M60', 'lmg', '7.62x51', 100, 550, ['auto'], { recoil: [1.05, 0.6], origin: 'EUA', year: 1957, tags: ['elite', 'militar'], rar: 0.5, d: '"The Pig": metralhadora de uso geral do Vietnã, fita de 100 tiros.', m: { k: 'rifle', rl: 0.42, rh: 0.085, rw: 0.06, hl: 0.22, ht: 'ribbed', bl: 0.32, st: 'poly', sl: 0.32, mg: 'belt', ml: 0.12, carry: 1, bip: 1, sg: 'hood', mz: 'flash', m: C.STL, f: C.BLK } });
W('mg42', 'MG 42', 'lmg', '7.92x57', 50, 1200, ['auto'], { recoil: [1.2, 0.85], origin: 'Alemanha', year: 1942, tags: ['historico'], rar: 0.4, d: 'A "serra de Hitler": 1200 tiros por minuto e um som inconfundível.', m: { k: 'rifle', rl: 0.32, rh: 0.075, rw: 0.055, hl: 0.38, ht: 'vent', bl: 0.04, st: 'mg42', sl: 0.3, gr: 'pistol', mg: 'beltdrum', ml: 0.1, bip: 1, sg: 'hood', mz: 'cone', m: C.STL, f: C.BAKE } });
W('negev', 'IWI Negev NG5', 'lmg', '5.56x45', 150, 900, ['auto', 'semi'], { recoil: [0.8, 0.55], origin: 'Israel', year: 1997, tags: ['elite'], rar: 0.5, d: 'Metralhadora leve israelense que aceita fita ou carregadores de fuzil.', m: { k: 'rifle', rl: 0.38, rh: 0.09, rw: 0.065, hl: 0.2, ht: 'rail', bl: 0.24, st: 'side', sl: 0.28, mg: 'belt', ml: 0.12, carry: 1, bip: 1, sg: 'flat', mz: 'flash', m: C.BLK, f: C.BLK } });
W('bren', 'Bren Mk II', 'lmg', '.303', 30, 520, ['auto', 'semi'], { reload: 3.0, noRails: ['opt', 'tac'], origin: 'Reino Unido', year: 1938, tags: ['historico'], rar: 0.5, d: 'Metralhadora leve britânica com carregador curvo encaixado por cima.', m: { k: 'rifle', rl: 0.38, rh: 0.075, rw: 0.055, ht: 'none', bl: 0.32, st: 'wood', sl: 0.32, gr: 'wood', mg: 'top_bren', ml: 0.2, carry: 1, bip: 1, sg: 'offset', mz: 'cone', m: C.STL, f: C.WOOD } });
W('bar', 'M1918 BAR', 'lmg', '.30-06', 20, 550, ['auto', 'semi'], { reload: 2.8, move: 0.88, noRails: ['opt', 'tac'], origin: 'EUA', year: 1918, tags: ['historico'], rar: 0.5, d: 'Browning Automatic Rifle: fuzil automático pesado das duas guerras mundiais.', m: { k: 'rifle', rl: 0.4, rh: 0.075, rw: 0.05, hl: 0.2, ht: 'wood', bl: 0.3, st: 'wood', sl: 0.32, gr: 'none', mg: 'box', ml: 0.15, bip: 1, sg: 'peep', mz: 'flash', m: C.STL, f: C.WOOD } });
W('dp28', 'DP-28', 'lmg', '7.62x54r', 47, 550, ['auto'], { reload: 3.6, noRails: ['opt', 'tac'], origin: 'URSS', year: 1928, tags: ['historico'], rar: 0.5, d: 'A "vitrola": metralhadora soviética com carregador em disco sobre a arma.', m: { k: 'rifle', rl: 0.3, rh: 0.07, rw: 0.05, hl: 0.4, ht: 'vent', bl: 0.06, st: 'wood', sl: 0.32, gr: 'none', mg: 'pan', ml: 0.05, bip: 1, sg: 'hood', mz: 'cone', m: C.STL, f: C.WOOD } });

// ---------------------------------------------------------------- Lançadores
W('rpg7', 'RPG-7', 'lancador', 'pg7v', 1, 30, ['semi'], { reload: 3.5, rails: {}, origin: 'URSS', year: 1961, tags: ['elite'], rar: 0.3, size: 9, d: 'Lançador de foguetes antitanque reutilizável. Explosão devastadora.', m: { k: 'rpg', m: C.OD, f: C.WOOD } });
W('m79', 'M79', 'lancador', '40mm', 1, 30, ['semi'], { reload: 2.2, recoil: [3.5, 0.8], origin: 'EUA', year: 1961, tags: ['elite'], rar: 0.4, size: 6, d: 'O "Thumper": lançador de granadas de cano basculante.', m: { k: 'm79', m: C.STL, f: C.WOOD } });
W('m32', 'Milkor M32 MGL', 'lancador', '40mm', 6, 120, ['semi'], { reloadType: 'shell', shellTime: 0.7, recoil: [3.0, 0.8], origin: 'África do Sul', year: 1983, tags: ['elite'], rar: 0.25, size: 9, d: 'Lançador de granadas revólver de seis tiros.', m: { k: 'm32', m: C.BLK, f: C.BLK } });

// ---------------------------------------------------------------- Arcos e bestas
W('besta', 'Besta de caça', 'arco', 'virote', 1, 30, ['semi'], { reload: 2.2, origin: '—', year: null, tags: ['caca'], d: 'Silenciosa e potente. Recarga lenta, mas o virote pode ser recuperado.', m: { k: 'crossbow', m: C.BLK, f: C.OD } });
W('arco', 'Arco composto', 'arco', 'flecha', 1, 60, ['semi'], { reload: 0.6, draw: 0.75, noRails: ['opt'], spread: [2.2, 0.25], origin: '—', year: null, tags: ['caca'], d: 'Segure o gatilho para tensionar e solte para disparar. Totalmente silencioso.', m: { k: 'bow', m: C.BLK, f: C.OD } });

// ---------------------------------------------------------------- Corpo a corpo
function M(id, name, dmg, rate, range, o = {}) {
  const w = Object.assign({ id, name, cls: 'melee', slot: 'mel', dmg, rate, range, size: 2, tags: [], rar: 1, move: 1 }, o);
  WEAPONS[id] = w; WEAPON_LIST.push(w); return w;
}
M('faca', 'Faca de combate KA-BAR', 38, 0.45, 1.7, { tags: ['militar', 'civil', 'caca'], d: 'Faca dos Fuzileiros dos EUA desde 1942. Rápida e silenciosa.', m: { k: 'knife' } });
M('facao', 'Facão', 52, 0.65, 2.0, { tags: ['civil', 'caca'], d: 'Ferramenta de mato indispensável no interior do Brasil.', m: { k: 'machete' } });
M('machado', 'Machado de incêndio', 85, 1.0, 2.1, { tags: ['civil'], tree: true, d: 'Pesado e devastador. Também serve para cortar árvores e obter tábuas.', m: { k: 'axe' } });
M('taco', 'Taco de beisebol', 46, 0.75, 2.1, { tags: ['civil'], d: 'Madeira maciça. Bom alcance e golpes que derrubam.', m: { k: 'bat' } });
M('pedecabra', 'Pé de cabra', 42, 0.65, 1.9, { tags: ['civil'], d: 'Aço forjado: o melhor amigo de quem saqueia.', m: { k: 'crowbar' } });
M('katana', 'Katana', 72, 0.7, 2.3, { tags: ['civil'], rar: 0.3, d: 'Lâmina japonesa afiadíssima, com o maior alcance entre as armas brancas.', m: { k: 'katana' } });
M('marreta', 'Marreta', 115, 1.4, 2.1, { tags: ['civil'], rar: 0.6, move: 0.92, d: 'Golpes lentos que esmagam qualquer crânio.', m: { k: 'sledge' } });
M('pa', 'Pá militar', 46, 0.8, 2.0, { tags: ['militar'], d: 'Pá dobrável de trincheira: arma clássica de combate próximo.', m: { k: 'shovel' } });

// ---------------------------------------------------------------- Arremessáveis
function T(id, name, o) {
  const w = Object.assign({ id, name, cls: 'arremesso', slot: 'thr', size: 1, tags: [], rar: 1, stack: true }, o);
  WEAPONS[id] = w; WEAPON_LIST.push(w); return w;
}
T('m67', 'Granada M67', { fuse: 4, dmg: 240, radius: 9, tags: ['militar', 'elite'], origin: 'EUA', year: 1968, d: 'Granada de fragmentação esférica. Espoleta de 4 segundos.', m: { k: 'frag' } });
T('rgd5', 'Granada RGD-5', { fuse: 3.5, dmg: 200, radius: 8, tags: ['militar'], origin: 'URSS', year: 1954, d: 'Granada soviética ovoide de fragmentação. Espoleta de 3,5 segundos.', m: { k: 'rgd' } });
T('molotov', 'Coquetel Molotov', { impact: true, fire: { r: 4.5, t: 9, dps: 30 }, tags: ['civil'], origin: 'Finlândia', year: 1939, d: 'Garrafa de gasolina com pavio. Incendeia a área de impacto.', m: { k: 'molotov' } });

// ---------------------------------------------------------------- Acessórios
const ATTACH = {
  reddot: { name: 'Mira red dot (Aimpoint)', slot: 'opt', zoom: 1.35, ret: 'dot', tags: ['policia', 'militar', 'civil'] },
  holo: { name: 'Mira holográfica (EOTech)', slot: 'opt', zoom: 1.4, ret: 'holo', tags: ['policia', 'militar'] },
  kobra: { name: 'Mira Kobra EKP-1S', slot: 'opt', zoom: 1.35, ret: 'kobra', tags: ['militar'] },
  acog: { name: 'Luneta ACOG 4×', slot: 'opt', zoom: 4, ret: 'acog', scope: true, ads: 1.15, tags: ['militar', 'elite'] },
  pso1: { name: 'Luneta PSO-1 4×', slot: 'opt', zoom: 4, ret: 'pso', scope: true, ads: 1.15, tags: ['militar', 'elite'] },
  scope8: { name: 'Luneta 8× (Leupold)', slot: 'opt', zoom: 8, ret: 'mil', scope: true, ads: 1.3, tags: ['caca', 'elite'] },
  scope10: { name: 'Luneta 10× (M3A)', slot: 'opt', zoom: 10, ret: 'mil', scope: true, ads: 1.35, tags: ['elite'] },
  scope12: { name: 'Luneta 12× (Schmidt & Bender)', slot: 'opt', zoom: 12, ret: 'mil', scope: true, ads: 1.4, tags: ['elite'] },
  supp: { name: 'Supressor', slot: 'muz', recoil: 0.9, loud: 0.2, dmg: 0.96, tags: ['militar', 'elite', 'policia'] },
  comp: { name: 'Compensador', slot: 'muz', recoilV: 0.78, recoilH: 0.9, tags: ['policia', 'militar', 'civil'] },
  vgrip: { name: 'Empunhadura vertical', slot: 'und', recoilV: 0.85, recoilH: 0.72, tags: ['policia', 'militar', 'civil'] },
  agrip: { name: 'Empunhadura angular', slot: 'und', recoilV: 0.92, recoilH: 0.85, ads: 0.8, tags: ['militar', 'elite'] },
  bipe: { name: 'Bipé', slot: 'und', bipod: true, tags: ['militar', 'elite', 'caca'] },
  laser: { name: 'Mira laser', slot: 'tac', hip: 0.55, tags: ['policia', 'militar', 'civil'] },
  lanterna: { name: 'Lanterna tática', slot: 'tac', light: true, tags: ['policia', 'militar', 'civil'] },
  extmag: { name: 'Carregador estendido', slot: 'mag', magMul: 1.5, reload: 1.12, tags: ['policia', 'militar', 'elite'] },
};
// Miras integradas (não removíveis).
const INTEG_OPT = {
  aug: { name: 'Luneta Swarovski 1,5×', zoom: 1.6, ret: 'ring' },
  susat: { name: 'SUSAT 4×', zoom: 4, ret: 'susat', scope: true, ads: 1.1 },
  ring: { name: 'Mira reflexa Ring Sight', zoom: 1.3, ret: 'dot' },
};
const SLOT_NAMES = { opt: 'Mira', muz: 'Cano', und: 'Inferior', tac: 'Tático', mag: 'Carregador' };

function attachFits(w, aid) {
  const a = ATTACH[aid];
  if (!a || !w.rails || !w.rails[a.slot]) return false;
  if (a.slot === 'opt' && (w.cls === 'pistola' || w.cls === 'revolver')) return false;
  if (a.scope && a.zoom >= 8 && ['smg', 'pistola', 'espingarda', 'lancador'].includes(w.cls)) return false;
  if (a.bipod && w.bipod) return false;
  return true;
}

// ---------------------------------------------------------------- Itens
const ITEMS = {
  // Comida
  feijoada: { name: 'Feijoada em lata', type: 'food', food: 40, water: -6, icon: '🥫' },
  sardinha: { name: 'Lata de sardinha', type: 'food', food: 25, water: -5, icon: '🐟' },
  biscoito: { name: 'Pacote de biscoito', type: 'food', food: 15, water: -4, icon: '🍪' },
  barra: { name: 'Barra de cereal', type: 'food', food: 12, icon: '🍫' },
  chocolate: { name: 'Chocolate', type: 'food', food: 10, stamina: 25, icon: '🍫' },
  maca: { name: 'Maçã', type: 'food', food: 8, water: 6, icon: '🍎' },
  pao: { name: 'Pão francês', type: 'food', food: 12, water: -2, icon: '🥖' },
  pacoca: { name: 'Paçoca', type: 'food', food: 8, water: -3, icon: '🥜' },
  mre: { name: 'Ração militar (MRE)', type: 'food', food: 60, water: 10, icon: '📦' },
  carnecrua: { name: 'Carne crua', type: 'food', food: 15, immune: -15, icon: '🥩' },
  carneassada: { name: 'Carne assada', type: 'food', food: 40, health: 5, icon: '🍖' },
  // Bebida
  agua: { name: 'Garrafa de água', type: 'drink', water: 40, empty: 'garrafa', icon: '💧' },
  refri: { name: 'Refrigerante', type: 'drink', water: 25, food: 4, icon: '🥤' },
  coco: { name: 'Água de coco', type: 'drink', water: 32, health: 4, icon: '🥥' },
  energetico: { name: 'Energético', type: 'drink', water: 15, stamina: 100, buff: 'energia', icon: '⚡' },
  leite: { name: 'Caixa de leite', type: 'drink', water: 25, food: 8, icon: '🥛' },
  aguasuja: { name: 'Garrafa de água suja', type: 'drink', water: 30, immune: -18, empty: 'garrafa', icon: '🫗' },
  // Médicos
  atadura: { name: 'Atadura', type: 'med', health: 15, bleed: true, time: 1.8, icon: '🩹' },
  kit: { name: 'Kit de primeiros socorros', type: 'med', health: 65, bleed: true, time: 4.5, size: 2, icon: '🧰' },
  ifak: { name: 'IFAK (kit individual)', type: 'med', health: 45, bleed: true, time: 3, icon: '🎒' },
  morfina: { name: 'Morfina', type: 'med', health: 30, time: 1, icon: '💉' },
  tala: { name: 'Tala', type: 'med', leg: true, time: 3, icon: '🦴' },
  antibiotico: { name: 'Antibiótico', type: 'med', immune: 50, time: 1.2, icon: '💊' },
  vacina: { name: 'Vacina experimental', type: 'med', immune: 100, health: 10, time: 1.5, icon: '🧪' },
  analgesico: { name: 'Analgésico', type: 'med', health: 10, time: 0.8, icon: '💊' },
  adrenalina: { name: 'Adrenalina', type: 'med', health: 15, stamina: 100, buff: 'adrenalina', time: 1, icon: '💉' },
  // Mochilas (espaço extra)
  mochila_escolar: { name: 'Mochila escolar', type: 'bag', cap: 8, icon: '🎒', color: 0x2f5fa8 },
  mochila_trilha: { name: 'Mochila de trilha', type: 'bag', cap: 14, icon: '🎒', color: 0xa8542f },
  mochila_militar: { name: 'Mochila militar ALICE', type: 'bag', cap: 20, icon: '🎒', color: 0x55593f },
  mochila_tatica: { name: 'Mochila tática 3-Day', type: 'bag', cap: 28, icon: '🎒', color: 0x8b7d5c },
  // Coletes (proteção + espaço)
  colete_tatico: { name: 'Colete tático de lona', type: 'vest', armor: 0.08, cap: 6, icon: '🦺', color: 0x5a6142 },
  colete_policial: { name: 'Colete balístico policial', type: 'vest', armor: 0.25, cap: 4, icon: '🦺', color: 0x222428 },
  colete_militar: { name: 'Colete militar', type: 'vest', armor: 0.35, cap: 8, icon: '🦺', color: 0x6b6a4a },
  plate: { name: 'Plate carrier nível IV', type: 'vest', armor: 0.5, cap: 10, icon: '🦺', color: 0x8b7d5c },
  // Capacetes
  capacete_obra: { name: 'Capacete de obra', type: 'helmet', armor: 0.15, icon: '⛑️', color: 0xd9a21b },
  capacete_moto: { name: 'Capacete de moto', type: 'helmet', armor: 0.2, icon: '⛑️', color: 0x2a2a2e },
  capacete_pasgt: { name: 'Capacete PASGT', type: 'helmet', armor: 0.3, icon: '🪖', color: 0x55593f },
  capacete_fast: { name: 'Capacete balístico FAST', type: 'helmet', armor: 0.42, icon: '🪖', color: 0x8b7d5c },
  // Materiais e ferramentas
  pano: { name: 'Pano', type: 'mat', icon: '🧶', stackN: 10 },
  tabua: { name: 'Tábua de madeira', type: 'mat', icon: '🪵', stackN: 6 },
  sucata: { name: 'Sucata de metal', type: 'mat', icon: '🔩', stackN: 8 },
  polvora: { name: 'Pólvora', type: 'mat', icon: '⚫', stackN: 10 },
  garrafa: { name: 'Garrafa vazia', type: 'mat', icon: '🍾', stackN: 4 },
  galao: { name: 'Galão de gasolina', type: 'tool', fuel: 40, icon: '⛽', size: 2 },
  ferramentas: { name: 'Kit de ferramentas', type: 'tool', icon: '🔧', size: 2 },
  isqueiro: { name: 'Isqueiro', type: 'tool', icon: '🔥' },
  binoculo: { name: 'Binóculo', type: 'tool', icon: '🔭' },
};
const ITEM_GROUPS = {
  comida: ['feijoada', 'sardinha', 'biscoito', 'barra', 'chocolate', 'maca', 'pao', 'pacoca', 'leite'],
  bebida: ['agua', 'agua', 'agua', 'refri', 'coco', 'energetico', 'leite'],
  med_basico: ['atadura', 'atadura', 'atadura', 'analgesico', 'tala', 'antibiotico', 'pano'],
  med_avancado: ['kit', 'morfina', 'vacina', 'adrenalina', 'antibiotico', 'tala', 'ifak'],
  material: ['pano', 'pano', 'tabua', 'sucata', 'sucata', 'garrafa', 'polvora'],
  ferramenta: ['galao', 'ferramentas', 'isqueiro', 'binoculo', 'galao'],
  mochila_civil: ['mochila_escolar', 'mochila_escolar', 'mochila_trilha'],
  mochila_mil: ['mochila_militar', 'mochila_militar', 'mochila_tatica'],
  colete_pol: ['colete_policial', 'colete_policial', 'colete_tatico'],
  colete_mil: ['colete_militar', 'colete_militar', 'colete_tatico', 'plate'],
  capacete_civ: ['capacete_obra', 'capacete_moto'],
  capacete_mil: ['capacete_pasgt', 'capacete_pasgt', 'capacete_fast'],
  militar_extra: ['mre', 'ifak', 'atadura', 'energetico'],
};
const ATTACH_GROUPS = {
  civil: ['reddot', 'laser', 'lanterna', 'vgrip', 'comp'],
  policia: ['reddot', 'holo', 'laser', 'lanterna', 'vgrip', 'comp', 'extmag', 'supp'],
  militar: ['holo', 'reddot', 'kobra', 'acog', 'pso1', 'supp', 'comp', 'vgrip', 'agrip', 'bipe', 'lanterna', 'laser', 'extmag'],
  elite: ['scope8', 'scope10', 'scope12', 'acog', 'supp', 'bipe', 'agrip', 'extmag', 'holo'],
  caca: ['scope8', 'reddot', 'bipe', 'lanterna'],
};

// Tabelas de loot por tipo de local: [tipo, parâmetro, peso].
const LOOT = {
  casa: [['g', 'comida', 24], ['g', 'bebida', 16], ['g', 'med_basico', 10], ['g', 'material', 12], ['melee', 'civil', 5], ['arma', 'civil', 6], ['mun', 'civil', 9], ['g', 'mochila_civil', 4], ['ac', 'civil', 2], ['g', 'capacete_civ', 2], ['g', 'ferramenta', 3]],
  mercado: [['g', 'comida', 50], ['g', 'bebida', 34], ['g', 'med_basico', 6], ['g', 'material', 4], ['g', 'mochila_civil', 3], ['g', 'ferramenta', 3]],
  policia: [['arma', 'policia', 24], ['mun', 'policia', 26], ['g', 'colete_pol', 7], ['ac', 'policia', 12], ['g', 'med_basico', 10], ['g', 'capacete_civ', 3], ['g', 'comida', 5], ['item', 'm67', 1]],
  hospital: [['g', 'med_basico', 40], ['g', 'med_avancado', 30], ['g', 'bebida', 10], ['g', 'comida', 5], ['g', 'material', 5]],
  militar: [['arma', 'militar', 20], ['mun', 'militar', 24], ['ac', 'militar', 13], ['g', 'colete_mil', 5], ['g', 'capacete_mil', 5], ['g', 'mochila_mil', 5], ['thr', 'militar', 7], ['g', 'militar_extra', 10], ['melee', 'militar', 3]],
  elite: [['arma', 'elite', 22], ['mun', 'elite', 20], ['ac', 'elite', 14], ['item', 'plate', 4], ['item', 'capacete_fast', 4], ['item', 'mochila_tatica', 4], ['thr', 'militar', 9], ['g', 'militar_extra', 8], ['arma', 'militar', 6], ['mun', 'militar', 6]],
  fazenda: [['arma', 'caca', 8], ['mun', 'caca', 10], ['g', 'comida', 22], ['g', 'bebida', 12], ['g', 'material', 14], ['melee', 'civil', 8], ['item', 'galao', 5], ['g', 'mochila_civil', 3], ['arma', 'civil', 3], ['item', 'molotov', 1]],
  caca: [['arma', 'caca', 24], ['mun', 'caca', 24], ['ac', 'caca', 8], ['g', 'comida', 14], ['g', 'bebida', 10], ['melee', 'caca', 7], ['g', 'med_basico', 6], ['arma', 'historico', 2]],
  industrial: [['g', 'material', 34], ['g', 'ferramenta', 14], ['melee', 'civil', 10], ['g', 'mochila_civil', 5], ['g', 'comida', 8], ['g', 'bebida', 8], ['arma', 'civil', 3], ['mun', 'civil', 5], ['item', 'capacete_obra', 5]],
  museu: [['arma', 'historico', 40], ['mun', 'historico', 40], ['melee', 'civil', 4], ['item', 'katana', 3], ['thr', 'militar', 2]],
  zumbi: [['g', 'material', 30], ['g', 'comida', 14], ['g', 'bebida', 12], ['g', 'med_basico', 14], ['mun', 'civil', 10], ['arma', 'civil', 2]],
  zumbi_mil: [['mun', 'militar', 30], ['g', 'militar_extra', 20], ['ac', 'militar', 8], ['arma', 'militar', 6], ['thr', 'militar', 6], ['g', 'capacete_mil', 3]],
};

// Receitas de criação: entradas consumidas, ferramenta opcional (não consumida).
const RECIPES = [
  { out: ['atadura', 1], in: [['pano', 2]] },
  { out: ['tala', 1], in: [['tabua', 1], ['pano', 2]] },
  { out: ['molotov', 3], in: [['garrafa', 3], ['pano', 3], ['galao', 1]] },
  { out: ['carneassada', 1], in: [['carnecrua', 1]], tool: 'isqueiro' },
  { out: ['agua', 1], in: [['aguasuja', 1]], tool: 'isqueiro' },
  { out: ['ferramentas', 1], in: [['sucata', 4]] },
  { out: ['ammo:9x19', 15], in: [['sucata', 1], ['polvora', 1]] },
  { out: ['ammo:.45acp', 12], in: [['sucata', 1], ['polvora', 1]] },
  { out: ['ammo:5.56x45', 10], in: [['sucata', 2], ['polvora', 2]] },
  { out: ['ammo:7.62x39', 10], in: [['sucata', 2], ['polvora', 2]] },
  { out: ['ammo:7.62x51', 6], in: [['sucata', 2], ['polvora', 2]] },
  { out: ['ammo:12ga', 6], in: [['sucata', 1], ['polvora', 2]] },
  { out: ['ammo:flecha', 4], in: [['tabua', 1], ['sucata', 1]] },
  { out: ['ammo:virote', 4], in: [['tabua', 1], ['sucata', 1]] },
  { out: ['mochila_escolar', 1], in: [['pano', 8]] },
];

// Veículos.
const VEHICLES = {
  fusca: { name: 'Fusca', speed: 30, accel: 7, hp: 320, fuel: 40, colors: [0x2f6fb5, 0xd1c3a0, 0xb53a2f, 0x3d8a4f, 0xe0b23a] },
  picape: { name: 'Picape 4×4', speed: 34, accel: 8, hp: 480, fuel: 60, colors: [0x8a8d92, 0x23262b, 0xe8e8e6, 0x7a1f1f] },
  humvee: { name: 'Humvee M1151', speed: 31, accel: 7, hp: 1000, fuel: 80, colors: [0x6b6a4a, 0xa89270] },
};

// ---------------------------------------------------------------- Auxiliares
function itemDef(id) {
  if (id.startsWith('ammo:')) {
    const cal = id.slice(5), c = CALIBERS[cal];
    return { name: 'Munição ' + c.name, type: 'ammo', cal, icon: '🔸' };
  }
  if (WEAPONS[id]) return Object.assign({ type: 'weapon' }, WEAPONS[id]);
  if (ATTACH[id]) return Object.assign({ type: 'attach', icon: '🔧' }, ATTACH[id]);
  return ITEMS[id];
}
// Quantos "espaços" um item ocupa na mochila.
function itemSize(st) {
  const d = itemDef(st.id);
  if (!d) return 1;
  if (d.type === 'ammo') return Math.max(1, Math.ceil(st.n / CALIBERS[d.cal].stack));
  if (d.type === 'weapon') return d.stack ? Math.ceil(st.n / 4) : d.size || 3;
  if (d.stackN) return Math.max(1, Math.ceil(st.n / d.stackN));
  if (d.type === 'attach') return 1;
  return (d.size || 1) * (st.n || 1);
}
function stackable(id) {
  const d = itemDef(id);
  if (!d) return false;
  return d.type === 'ammo' || d.type === 'food' || d.type === 'drink' || d.type === 'med' || d.type === 'mat' || !!d.stack;
}

// Escolhe uma arma aleatória com a etiqueta dada, ponderando raridade.
function randomWeapon(tag, filter) {
  const pool = WEAPON_LIST.filter((w) => w.tags.includes(tag) && w.cls !== 'melee' && w.cls !== 'arremesso' && (!filter || filter(w)));
  if (!pool.length) return null;
  return U.weighted(pool.map((w) => [w, w.rar]));
}
function randomMelee(tag) {
  const pool = WEAPON_LIST.filter((w) => w.cls === 'melee' && w.tags.includes(tag));
  return pool.length ? U.weighted(pool.map((w) => [w, w.rar])) : WEAPONS.faca;
}
function newWeaponItem(w, full = true, rndAttach = 0) {
  const it = { id: w.id, n: 1 };
  if (w.cls === 'melee') return it;
  if (w.stack) return it;
  it.att = {};
  if (w.def) Object.assign(it.att, w.def);
  if (rndAttach > 0 && Math.random() < rndAttach) {
    const keys = Object.keys(ATTACH).filter((a) => attachFits(w, a) && !it.att[ATTACH[a].slot]);
    if (keys.length) { const a = U.pick(keys); it.att[ATTACH[a].slot] = a; }
  }
  it.ammo = full ? weaponCap(w, it) : Math.floor(Math.random() * (weaponCap(w, it) + 1));
  it.mode = 0;
  return it;
}
function weaponCap(w, it) {
  if (it && it.att && it.att.mag === 'extmag') return Math.round(w.mag * 1.5);
  return w.mag;
}

// Gera itens de uma tabela de loot. Retorna lista de pilhas {id, n, ...}.
function rollLoot(table) {
  const e = U.weighted(LOOT[table].map((x) => [x, x[2]]));
  const [kind, p] = e;
  const out = [];
  if (kind === 'g') { const id = U.pick(ITEM_GROUPS[p]); out.push({ id, n: 1 }); }
  else if (kind === 'item') {
    const d = itemDef(p);
    out.push(d.type === 'weapon' && !d.stack && d.cls !== 'melee' ? newWeaponItem(WEAPONS[p], false) : { id: p, n: d.stack ? U.randi(1, 2) : 1 });
  } else if (kind === 'arma') {
    const w = randomWeapon(p);
    if (w) {
      out.push(newWeaponItem(w, Math.random() < 0.5, p === 'elite' ? 0.5 : p === 'militar' ? 0.3 : 0.12));
      const c = CALIBERS[w.cal];
      out.push({ id: 'ammo:' + w.cal, n: Math.max(1, Math.round(U.rand(c.box[0], c.box[1]) * (w.cls === 'lmg' ? 1.6 : 1))) });
    }
  } else if (kind === 'mun') {
    const w = randomWeapon(p);
    if (w) { const c = CALIBERS[w.cal]; out.push({ id: 'ammo:' + w.cal, n: U.randi(c.box[0], c.box[1]) }); }
  } else if (kind === 'melee') out.push({ id: randomMelee(p).id, n: 1 });
  else if (kind === 'thr') out.push({ id: U.pick(['m67', 'rgd5', 'm67']), n: U.randi(1, 2) });
  else if (kind === 'ac') out.push({ id: U.pick(ATTACH_GROUPS[p]), n: 1 });
  return out;
}
