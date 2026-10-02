# diaxo

Projetos para abrir direto no navegador, sem etapa de build:

- **[Zona Morta](fps/)** (`fps/index.html`): FPS de sobrevivência em mundo aberto no estilo Unturned, com
  zumbis, saque, veículos e 112 armas de fogo reais. Veja [fps/README.md](fps/README.md).
- **Árvore ao vento** (`index.html`): descrita abaixo.

# Árvore ao vento

Simulação de uma árvore balançando ao vento enquanto suas folhas se soltam, flutuam e se acumulam no chão.
É uma página única (`index.html`), sem dependências nem etapa de build: basta abri-la no navegador.

## Como usar

- **Arraste** na tela para soprar o vento (para a direita ou para a esquerda); um **toque** dá uma rajada.
- **Painel**: intensidade do vento, quantidade de folhas, estação (outono, verão, cerejeira em flor),
  rebrota contínua das folhas, rajada, pausa, reiniciar e gerar uma nova árvore.
- **Teclado**: `Espaço` pausa/continua, `G` dá uma rajada.

## Como funciona

- **Árvore procedural**: troncos e galhos são gerados recursivamente (semente determinística) e cada galho
  herda o movimento do anterior, então a ponta dos galhos finos balança mais que o tronco.
- **Vento**: soma de ondas suaves + rajadas ocasionais. Dobra os galhos, faz as folhas tremularem e
  aumenta a chance de uma folha se soltar.
- **Folhas**: cada uma é presa a um galho e, ao se soltar, cai com arrasto, gravidade e oscilação lateral
  (efeito "folha caindo"), girando em torno do próprio eixo. No chão, vento forte volta a arrastá-las e levantá-las.
- **Ciclo**: com "Folhas rebrotam" ligado, as folhas do chão desaparecem aos poucos e novas brotam na copa;
  desligado, a árvore vai ficando nua.
- Desenhado em Canvas 2D, com sprites pré-renderizados para manter a fluidez com milhares de folhas.
