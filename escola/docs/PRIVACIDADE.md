# Privacidade e proteção de dados (LGPD)

Este documento descreve como a Caderneta Escolar trata dados pessoais e o que a escola precisa fazer para
usá-la de acordo com a Lei Geral de Proteção de Dados (Lei 13.709/2018). Ele não substitui a orientação
jurídica da escola.

## Papéis

- **Controladora**: a escola (decide para que os dados são usados). Nome e encarregado (DPO) ficam em
  Configurações → Privacidade e aparecem no aviso mostrado às famílias.
- **Operadora**: quem hospeda o servidor para a escola, se não for a própria escola.
- A Caderneta **não envia dados a terceiros**: não usa serviços de análise, publicidade, fontes ou scripts
  externos. Tudo fica no servidor da escola.

## Dados tratados e finalidade

| Dados | Finalidade | Base legal típica |
| --- | --- | --- |
| Identificação do aluno, turma, matrícula, histórico, frequência, notas, pareceres | Prestar o serviço educacional e cumprir obrigações legais de registro escolar | Execução de contrato (art. 7º, V) e obrigação legal (art. 7º, II); dados de criança no melhor interesse (art. 14) |
| Responsáveis: nome, parentesco, contatos, CPF | Comunicação escola–família, cobrança, segurança na saída | Execução de contrato |
| Pessoas autorizadas a buscar | Segurança do aluno na saída | Proteção da vida/incolumidade (art. 7º, VII) e legítimo interesse |
| Alertas e informações de saúde, medicação | Proteger o aluno (alergias, medicação na escola) | Dado sensível: tutela da saúde e proteção da vida (art. 11, II, e/f) |
| Atendimentos psicológicos/psicopedagógicos, planos de apoio | Acompanhamento pedagógico e de inclusão | Dado sensível: tutela da saúde / obrigação legal (inclusão) — com sigilo profissional |
| Agenda, ocorrências, rotina, mensagens | Comunicação escolar | Execução de contrato |
| Mensalidades e pagamentos | Cobrança | Execução de contrato |
| Equipe: nome, contatos, cargo, registros de acesso | Gestão de acessos e segurança | Execução de contrato / legítimo interesse |

## Quem vê o quê (minimização)

- **Contas por cargo** com permissões pré-definidas e ajustáveis pela direção; a conta titular não pode ser
  rebaixada por ninguém e ninguém concede um acesso que não possui.
- **Escopo**: professores, auxiliares e mediadores veem só as turmas e alunos com que trabalham.
- **Campos sensíveis em níveis**: alerta de saúde (quem cuida do aluno), saúde detalhada, observações
  internas, contatos e CPF, mensalidade — cada um com permissão própria. O servidor retira do retrato o que a
  pessoa não pode ver (não é só esconder na tela).
- **Atendimentos**: o conteúdo nunca vai no retrato; é lido sob demanda e **cada leitura é registrada**.
  Níveis de sigilo: só o autor, mesma área (ex.: psicologia) ou equipe de apoio. A direção **não** lê
  atendimentos por padrão. Ninguém exclui; correções são adendos.
- **Família**: vê só os próprios filhos; não vê observações internas, ocorrências internas, atendimentos,
  contatos de outros responsáveis, notas de etapas não liberadas nem mensalidades se não for o responsável
  financeiro.

## Direitos do titular (art. 18)

Os pedidos (acesso, correção, informação sobre compartilhamento, eliminação quando cabível) chegam ao
encarregado indicado no aviso. Como atender:

- **Acesso/cópia**: a ficha do aluno e os relatórios exportam os dados em planilha; o backup completo é
  restrito à direção.
- **Correção**: secretaria, pela ficha do aluno.
- **Eliminação**: a escola tem obrigação legal de manter o registro escolar; dados não obrigatórios (contatos
  antigos, pessoas autorizadas, anexos) podem ser removidos na ficha. A exclusão completa de um aluno só é
  possível sem histórico (antes disso, use "transferido/concluído").

## Consentimento e aviso

Famílias leem e aceitam o **aviso de privacidade** no primeiro acesso. Quando a escola publica uma nova
versão (Configurações → Privacidade), o aviso aparece de novo. A autorização de uso de imagem é registrada
na ficha do aluno.

## Segurança

Senhas com scrypt; códigos de convite de uso único (72 h) guardados só como hash; sessões curtas para a
equipe; limites de tentativas; HTTPS obrigatório fora do servidor local; anexos validados e servidos em
sandbox; registro de atividades; backups diários e backups manuais cifrados (AES-256-GCM).

## Retenção sugerida

| Dado | Sugestão |
| --- | --- |
| Registro escolar (frequência, notas, histórico) | Permanente (obrigação legal) |
| Agenda, rotina e mensagens | Ano letivo corrente + 1 ano |
| Atendimentos | Conforme o código de ética da profissão (psicologia: mínimo de 5 anos) |
| Registro de atividades | 2 anos |
| Contas de família de alunos que saíram | Desativar ao fim do ano letivo |

## Incidentes

Em caso de suspeita de vazamento: troque as senhas das contas de gestão, use "Sair de todos os aparelhos",
consulte o Registro de atividades, preserve os backups e comunique o encarregado. Incidentes com risco
relevante devem ser comunicados à ANPD e aos titulares (art. 48).
