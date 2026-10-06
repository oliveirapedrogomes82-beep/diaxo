# Caderneta Escolar

App de administração escolar feito para a secretaria e a coordenação resolverem o dia a dia sem treinamento:
alunos, turmas, professores, chamada, notas, mensalidades, agenda, comunicados e relatórios.

Não precisa de instalação nem de servidor: abra `index.html` no navegador. Os dados ficam guardados no
próprio navegador (localStorage), e em **Configurações** dá para exportar e importar um backup em JSON.

Na primeira abertura aparece uma **escola de exemplo** (dados fictícios gerados a partir da data de hoje),
para explorar à vontade. O botão **Começar com minha escola** apaga o exemplo e abre um passo a passo de
configuração.

## O que dá para fazer

| Tela | Para quê |
| --- | --- |
| **Painel** | O que precisa de atenção hoje (chamadas pendentes, mensalidades atrasadas, notas por lançar, aniversários), números principais, faltas por dia, recebimentos e próximos eventos. Atalhos para as tarefas mais comuns. |
| **Chamada** | Todos começam presentes; toque em quem faltou. Marcação no estilo gabarito: **P** (presente), **F** (falta) e **J** (falta justificada). Avisa feriados e fins de semana e sugere a próxima turma pendente depois de salvar. |
| **Notas** | Diário por turma, disciplina e bimestre. Digite a nota e aperte Enter para ir ao próximo aluno; salva sozinho. Mostra média, situação e quem está abaixo da média. |
| **Agenda** | Calendário com provas, reuniões, eventos e prazos, por turma ou para a escola toda. Feriados nacionais (inclusive Carnaval, Sexta-feira Santa e Corpus Christi) aparecem automaticamente. |
| **Comunicados** | Avisos com modelos prontos (reunião de pais, feriado, passeio…), fixar no topo, copiar e enviar pelo WhatsApp. |
| **Alunos** | Busca por nome, matrícula, responsável ou telefone; filtros e ordenação por menor frequência, menor média ou maior débito. Ficha completa com notas, faltas (com justificativa), financeiro e contato do responsável. |
| **Matrícula** | Passo a passo curto: aluno → responsável → turma (mostra as vagas) → mensalidade (descontos rápidos) → revisão. Gera as mensalidades até dezembro. |
| **Turmas** | Lotação, frequência e média de cada turma; professores por disciplina; horário semanal editável; desempenho por disciplina e alunos que precisam de atenção. |
| **Professores** | Disciplinas, turmas, aulas na semana e contato. |
| **Financeiro** | Mensalidades do mês, recebimento com forma de pagamento, multa e juros calculados sozinhos, lista de atrasados com mensagem de cobrança pronta para o WhatsApp, geração das mensalidades do mês e histórico recebido × previsto. |
| **Relatórios** | Boletim do aluno (para imprimir), ata de notas, frequência da turma, alunos em risco, inadimplência, aniversariantes e contatos. Tudo exporta para planilha (CSV ou copiar e colar no Excel/Google Planilhas). |
| **Configurações** | Nome da escola, ano letivo, bimestre atual, média de aprovação, recuperação, frequência mínima, mensalidade, vencimento, multa e juros, disciplinas, tema claro/escuro e backup. |

### Facilidades em todas as telas

- **Busca rápida** (`Ctrl + K` ou `/`): encontra alunos, turmas, professores e ações.
- **Botão Novo** (ou tecla `N`): matricular, registrar pagamento, fazer chamada, lançar notas, marcar evento…
- **Desfazer** em toda exclusão e pagamento registrado.
- Formulários avisam o que falta preencher, com máscara de telefone e CPF, e perguntam antes de descartar o que foi digitado.
- Funciona no celular (barra de navegação inferior) e tem tema claro e escuro.
- `?` mostra os atalhos de teclado.

## Regras usadas

- **Situação nas notas**: média ≥ média de aprovação → *Na média* (ou *Aprovado* com os 4 bimestres lançados);
  entre a nota de recuperação e a média → *Atenção* (*Recuperação*); abaixo → *Abaixo da média* (*Reprovado*).
- **Frequência**: presenças ÷ dias com chamada. Faltas justificadas não reduzem a frequência.
- **Atraso**: valor + multa (padrão 2%) + juros pro rata (padrão 1% ao mês), configuráveis.

## Estrutura

```
escola/
├── index.html          casca da página
├── css/app.css         visual (cores, tipografia, componentes, celular, impressão, tema escuro)
└── js/
    ├── util.js         datas, dinheiro, máscaras, CSV, feriados
    ├── icons.js        ícones SVG
    ├── seed.js         escola vazia e escola de exemplo
    ├── store.js        estado, persistência, desfazer e consultas (regras da escola)
    ├── ui.js           modal, gaveta, toast, menu, formulários, gráficos
    ├── pages/*.js      uma tela por arquivo
    └── app.js          navegação, busca rápida, menu Novo, tema e atalhos
```

Sem dependências nem etapa de build: são scripts comuns carregados em ordem, então também funciona
abrindo o arquivo direto (`file://`).

## Limitações

Os dados vivem no navegador de quem usa. Para várias pessoas usarem ao mesmo tempo, em computadores
diferentes, o próximo passo seria trocar `store.js` por uma API com banco de dados e login.
