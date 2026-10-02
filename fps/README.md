# Zona Morta — FPS de sobrevivência

FPS de sobrevivência em mundo aberto no estilo **Unturned**: uma ilha low-poly com cidades, base militar,
fazenda, porto e floresta, cheia de zumbis e de saque, com **112 armas de fogo reais** (mais armas brancas
e arremessáveis), 36 calibres, 16 acessórios, veículos, criação de itens e ciclo de dia e noite.

Roda direto no navegador, sem etapa de build e sem internet: abra `fps/index.html`.
Se o navegador bloquear arquivos locais, sirva a pasta com `python3 -m http.server` e acesse
`http://localhost:8000/fps/`.

## Modos de jogo

- **Sobrevivência:** você começa na estrada com um facão, ataduras e um pouco de comida. Saqueie casas,
  delegacias, hospitais, o museu militar e a base para achar armas, munição, mochilas e coletes. Fome, sede,
  energia, imunidade, sangramento e pernas quebradas importam. O jogo salva sozinho (botão *Continuar*);
  ao morrer, seus itens ficam no chão onde você caiu.
- **Hordas:** ondas crescentes de zumbis atacam Santa Cruz. Cada onda vencida derruba suprimentos.
- **Campo de tiro:** estande com alvos de aço a 25, 50, 100, 150, 200 e 300 m que mostram distância, dano,
  tempo de voo e queda da bala. Pressione `K` para pegar **qualquer** arma com qualquer acessório e munição
  infinita; há botões para soltar zumbis no estande e alternar dia e noite.

O **Arsenal** do menu é uma enciclopédia de todas as armas, com modelo 3D girando, origem, ano, calibre,
cadência, precisão, velocidade de boca, recuo e acessórios compatíveis.

## Controles

| Tecla | Ação |
| --- | --- |
| `W A S D` | mover · `Shift` correr (e prender a respiração com luneta) |
| `Espaço` | pular · `C` agachar · `Z` deitar |
| Botão esquerdo / direito | atirar ou golpear / mirar |
| `R` · `B` · `F` | recarregar · modo de tiro · lanterna, laser ou faróis |
| `E` | pegar itens, abrir portas, entrar no veículo, abastecer, encher garrafa |
| `1 2 3 4` / roda do mouse | trocar entre primária, secundária, corpo a corpo e arremesso |
| `G` · `H` · `V` · `X` | granada rápida · cura rápida · binóculo · largar arma em mãos |
| `Tab` ou `I` · `M` · `K` | inventário e criação · mapa · arsenal (campo de tiro) |
| No veículo | `W/S` acelera e ré, `A/D` vira, `Espaço` freia, `Q` buzina, `F` faróis, `E` sai |

Em celulares e tablets aparecem um joystick virtual e botões na tela (arraste a tela para olhar).

## O que tem no jogo

**Armas** — cada uma com calibre, capacidade, cadência, modos de tiro, recuo, dispersão, tipo de recarga e
modelo 3D próprios, montados proceduralmente:

- **Pistolas (18):** Glock 17, Glock 18C, Beretta M9, Taurus PT92, Colt M1911A1, SIG Sauer P226, SIG Sauer M17,
  H&K USP .45, Walther PPK, FN Five-seveN, Desert Eagle .50 AE, Makarov PM, Tokarev TT-33, CZ 75, Ruger Mark IV,
  Luger P08, Mauser C96 "Red 9", Stechkin APS
- **Revólveres (5):** S&W Model 29, Colt Python, Taurus Raging Bull, Nagant M1895, Colt Single Action Army
- **Submetralhadoras (17):** MP5A3, MP5SD6, UMP45, Uzi, Micro Uzi, KRISS Vector, FN P90, MP7A2, Thompson M1928A1,
  MP 40, PPSh-41, Škorpion vz. 61, MAC-10, CZ Scorpion EVO 3, PP-19 Bizon, Sten Mk II, SIG MPX
- **Fuzis de assalto (21):** AK-47, AKM, AK-74M, AK-12, AKS-74U, M16A4, M4A1, HK416, SCAR-L, Steyr AUG, FAMAS,
  L85A2, G36C, Galil ACE 32, IMBEL IA2, QBZ-95, Tavor TAR-21, AS Val, SIG MCX, Taurus T4, StG 44
- **Fuzis de batalha (6):** FN FAL (IMBEL M964), G3A3, M14, SCAR-H, M1 Garand, SVT-40
- **Fuzis de precisão (4):** SVD Dragunov, Mk 14 EBR, SR-25, VSS Vintorez
- **Carabinas e alavanca (6):** SKS, Mini-14, M1 Carbine, Ruger 10/22, Rossi Puma R92, Winchester 1894
- **Fuzis de ferrolho (10):** Remington 700, M24 SWS, AWM, Sako TRG-42, CheyTac M200, Barrett M82A1,
  Mosin–Nagant, Karabiner 98k, Lee–Enfield No. 4, SV-98
- **Espingardas (11):** Remington 870, Mossberg 500, CBC Pump Military 3.0, Benelli M4, SPAS-12, Saiga-12,
  AA-12, Kel-Tec KSG, Baikal IZH-43, cano duplo serrado, Winchester 1897
- **Metralhadoras (9):** M249, PKM, RPK, M60, MG 42, Negev, Bren, BAR M1918, DP-28
- **Lançadores (3):** RPG-7, M79, M32 MGL · **Arcos (2):** besta e arco composto (segure para tensionar)
- **Corpo a corpo (8):** faca KA-BAR, facão, machado (corta árvores para obter tábuas), taco, pé de cabra,
  katana, marreta, pá militar · **Arremessáveis (3):** M67, RGD-5, coquetel molotov

**Mecânicas de tiro:** projéteis com velocidade de boca real, arrasto e gravidade (queda da bala nas
lunetas), dano que cai com a velocidade, tiros na cabeça, chumbo em cone nas espingardas, recuo vertical e
horizontal com recuperação, dispersão que cresce ao andar e pular, ferrolho, bomba e alavanca, recarga por
carregador, cartucho a cartucho, pente (Mosin, Kar98k, SKS, C96) e en-bloc (Garand, com o "ping").
Acessórios: red dot, holográfica, Kobra, ACOG 4×, PSO-1, lunetas 8×/10×/12×, supressor, compensador,
empunhaduras, bipé, laser, lanterna e carregador estendido. Supressores reduzem o raio em que os zumbis
ouvem o disparo.

**Zumbis:** comum, corredor, rastejante, brutamonte e militar (com capacete). Eles enxergam (menos à noite,
mais se sua lanterna estiver ligada), ouvem tiros, passos e buzinas, contornam paredes com A*, arrombam
portas, causam sangramento e infecção e soltam saque.

**Mundo:** ilha de 1 km² gerada por ruído com Santa Cruz (delegacia, hospital, mercado, museu militar,
prédios com terraço), Vila Esperança, Porto Novo (píer e contêineres), Base Militar Sentinela (hangar,
quartéis, torres com escada), Fazenda Boa Vista, posto de gasolina, acampamento na mata, torre de rádio e
casas isoladas. Fusca, picape 4×4 e Humvee com combustível e lataria; capivaras e veados para caçar; chuva;
noite escura de verdade.

**Criação:** ataduras, talas, molotovs, munição recarregada (sucata + pólvora), flechas, virotes, kit de
ferramentas, mochila de pano, carne assada e água fervida.

## Estrutura

```
fps/
  index.html, style.css    interface (menus, HUD, inventário, mapa, arsenal)
  lib/three.min.js         Three.js r159 (licença MIT, em lib/THREE-LICENSE)
  js/util.js               matemática, aleatoriedade com semente e ruído
  js/audio.js              sons sintetizados com WebAudio (nenhum arquivo de áudio)
  js/data.js               calibres, armas, acessórios, itens, saque e receitas
  js/models.js             modelos procedurais de armas, itens, zumbis, animais e veículos
  js/phys.js               colisão AABB com hash espacial, degraus, escadas e raycast
  js/world.js              relevo, estradas, vegetação, água, céu e dia/noite
  js/buildings.js          prédios e locais da ilha
  js/entities.js           itens no chão, efeitos, balística e explosões
  js/zombies.js            IA dos zumbis (visão, audição, A*) e animais
  js/vehicles.js           veículos dirigíveis
  js/player.js             movimento, sobrevivência e inventário
  js/weapons.js            arma em primeira pessoa: mira, disparo, recuo e recarga
  js/ui.js, js/game.js     interface e laço principal do jogo
```
