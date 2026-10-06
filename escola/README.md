# Caderneta Escolar

Sistema de administração escolar para escolas brasileiras: **contas por cargo com acessos definidos pela
direção**, **agenda do aluno** (dever de casa, recados, autorizações e ocorrências que chegam às famílias),
chamada, notas e pareceres, **Portal da família**, mensagens escola ↔ família, atendimentos com sigilo,
financeiro, comunicados, calendário e relatórios. Feito para quem usa no dia a dia — diretora, coordenação,
secretaria, professores e famílias no celular — sem treinamento.

- **Experimentar agora**: abra [`web/demo.html`](web/demo.html) no navegador (ou `index.html` desta pasta).
  É uma escola de exemplo com 163 alunos que roda inteira no navegador; escolha "Entrar como…" a diretora,
  a coordenadora, a secretária, um professor, a professora da Educação Infantil, a auxiliar, a psicóloga, o
  tesoureiro ou uma mãe, e veja o que cada um enxerga.
- **Usar com a sua escola**: instale o servidor (Node.js 22.16+, sem dependências) — veja
  [docs/IMPLANTACAO.md](docs/IMPLANTACAO.md).

## Contas por cargo

A direção cria a conta de cada colaborador escolhendo o **cargo** — diretor(a), vice, mantenedor(a),
coordenador(a), orientador(a), professor(a), auxiliar de classe, professor(a) de AEE, mediador(a), intérprete
de Libras, monitor(a), estagiário(a), psicólogo(a), psicopedagogo(a), assistente social, enfermagem,
nutricionista, bibliotecário(a), secretaria, financeiro, portaria e outros. O cargo já vem com os acessos
pré-selecionados; a direção **marca acessos extras ou retira** o que quiser, define **quais turmas** a pessoa
vê (todas, por etapa de ensino ou só as turmas em que trabalha) e, se precisar, a validade do acesso.

- Ninguém concede um acesso que não tem; a conta titular não pode ser rebaixada; mudanças de acesso
  derrubam as sessões abertas da pessoa.
- Perfis por cargo editáveis para a escola toda (Equipe e acessos → Perfis de acesso).
- "Ver como": a direção vê o sistema exatamente como a pessoa vê, só para conferir.
- Cada pessoa cria a própria senha com um **código de primeiro acesso** (enviado por WhatsApp ou e-mail).
- Registro de atividades de tudo o que foi alterado (e de cada leitura de atendimento sigiloso).

## Agenda do aluno

Professores e coordenação "passam a agenda": **dever de casa** (com disciplina e data de entrega),
**recados**, **lembretes**, **autorizações** (passeio, evento — a família responde sim ou não; qualquer "não"
prevalece e avisa a coordenação) e **ocorrências** (inclusive elogios). Para uma ou várias turmas ou para
alunos escolhidos, com anexos, agendamento e aprovação da coordenação quando a escola quiser. A escola vê
quem **visualizou** e quem deu **ciente**; ciente recebido em papel também é registrado. Na Educação
Infantil, a **rotina do dia** (alimentação, sono, humor, o que mandar amanhã) vai para as famílias.

## Portal da família

Pelo celular, cada responsável vê só os próprios filhos: agenda com o que precisa de resposta, rotina,
boletim das etapas liberadas e frequência, comunicados, calendário, mensalidades (se for o responsável
financeiro), plano de apoio compartilhado e mensagens com a escola — avisar falta, saída antecipada, quem vai
buscar, medicação com receita anexa. A família aceita o aviso de privacidade no primeiro acesso.

## E também

| Área | Destaques |
| --- | --- |
| Alunos | Matrícula em passos, ficha com responsáveis, pessoas autorizadas a buscar, saúde em níveis de acesso, histórico; convites das famílias por turma. |
| Turmas | Regente, auxiliares e professores por disciplina; horário semanal; desempenho. |
| Chamada | Diária ou por aula (conforme a etapa de ensino), conteúdo da aula, justificativas e abonos pela secretaria, alerta de faltas seguidas. |
| Notas | Nota por etapa com recuperação ou parecer descritivo (Educação Infantil); fechar etapa e liberar boletim; conselho de classe. |
| Atendimentos | Psicologia, psicopedagogia, orientação, AEE: registros com sigilo (só eu / minha área / equipe de apoio), adendos, planos de apoio (PEI) compartilhados com professores e família. |
| Financeiro | Mensalidades do mês, recebimentos com multa e juros, estorno com motivo, cobrança por WhatsApp, recibo. |
| Gestão | Configurações da escola, virada do ano letivo, backup cifrado, relatórios em planilha. |

Em todas as telas: busca rápida (`Ctrl + K`), menu **Novo** com as ações que a pessoa pode fazer, desfazer,
tema claro e escuro, uso no celular.

## Como é feito

| Pasta | O que tem |
| --- | --- |
| `web/core/` | Núcleo compartilhado entre servidor e navegador: esquema, permissões e cargos, regras (frequência, notas, multa), comandos, visibilidade por perfil, escola de exemplo, migração da versão anterior. |
| `server/` | Servidor Node.js sem dependências (`node:http`, `node:sqlite`, `node:crypto`): sessões, convites, sincronização por deltas, desfazer, arquivos, backups. |
| `web/` | Aplicativo (scripts clássicos, sem etapa de build): `js/` infraestrutura, `js/pages/` uma área por arquivo, `css/`. |
| `test/` | `npm test` — contrato, permissões e escalada, comandos, visibilidade, API de ponta a ponta. |
| `tools/` | Testes no navegador (`npm run test:browser`), demonstração em arquivo único. |
| `docs/` | [Arquitetura e contrato](docs/ARQUITETURA.md), [guia das telas](docs/FRONTEND.md), [implantação](docs/IMPLANTACAO.md), [privacidade (LGPD)](docs/PRIVACIDADE.md). |

O servidor é a autoridade: toda alteração é um comando conferido no servidor (permissão, turmas
alcançadas, lista de campos permitidos) e cada pessoa recebe só os dados que pode ver.

```bash
npm start          # servidor (veja docs/IMPLANTACAO.md)
npm run demo       # servidor com a escola de exemplo em memória
npm test           # testes automáticos
npm run test:browser   # testes no navegador (Playwright)
```
