# Caderneta Escolar — arquitetura e contrato (contrato: 2.0)

Este é o contrato da versão profissional. Toda implementação segue este documento; mudanças entram aqui
primeiro (com nova versão do contrato). Público-alvo: escola particular pequena ou média, uma unidade
por instalação (multiunidade e integração com sistemas oficiais de redes públicas estão fora do escopo).

## 1. Visão geral

| Peça | O que é |
| --- | --- |
| `web/core/` | **Núcleo isomórfico** (UMD, roda no Node e no navegador): esquema, permissões, regras, comandos, visibilidade, dados de exemplo, migrações. O servidor faz `require('../web/core/...')`; o navegador carrega `core/*.js` (lista em `core/manifest.js`). |
| `server/` | Node ≥ 22.16, **sem dependências**: `node:http`, `node:sqlite`, `node:crypto`. Autoridade: toda alteração é um comando executado aqui. |
| `web/` | Front-end em scripts clássicos, sem build. Recebe um retrato filtrado e deltas; envia comandos. |
| Demonstração | `LocalBackend` no navegador roda o mesmo núcleo. Só por critério explícito (protocolo `file:`, `window.CADERNETA_MODE = 'demo'` em página publicada) ou servidor com `--demo` (banco em memória). **Nunca** é plano B de falha de rede (aí aparece "sem conexão"). |

Princípios: o servidor decide (o cliente só esconde botões); o núcleo **nunca lê o relógio** (recebe
`env`); toda rota que altera estado executa um comando; dados sensíveis saem do retrato quando possível.

## 2. Convenções

- **Ids**: gerados só pelo servidor (`env.newId(prefixo)`), formato `^[a-z][a-z0-9]{2,40}$`.
  Prefixos: `u` usuário, `c` turma, `a` aluno, `g` responsável, `k` pessoa autorizada a buscar, `s` disciplina,
  `i` cobrança, `e` evento, `n` comunicado, `d` agenda, `m` mensagem, `p` post, `r` atendimento, `l` plano, `x` arquivo.
- **Chaves compostas** com `|`, montadas e conferidas por `util.key.make/parse` (cada parte validada).
  Partes reservadas começam com `_` (ex.: `_parecer`). Nunca acessar `obj[chaveDoUsuário]` sem validar.
- **Datas civis** `AAAA-MM-DD` no fuso da escola (`settings.timezone`, padrão `America/Sao_Paulo`), via
  `util.today(tz)`. **Instantes** ISO UTC com `Z` (`createdAt`, `at`, `publishAt`, `editedAt`…).
  `env = { now, today, newId, actorIp? }` é passado a comandos e à visibilidade.
- **Comandos**: `<coleção>.<verbo>`. `*.save {id?, ...campos}` cria (sem id) ou edita (com id, só os campos
  da lista branca presentes); o servidor preenche `id`, `authorId`, `createdAt`, `updatedAt`.
  Campos fora da lista branca ou sem permissão de escrita são **ignorados** (nunca apagam o valor guardado).
  Arrays de subdocumentos nunca são trocados inteiros: há comandos próprios (`students.guardian.save`…).
  Resultado sempre `{id}` ou `{ids}` (mais campos não sensíveis quando dito). Efeitos com segredo
  (código de convite) voltam em `effects` só para o autor e só nessa resposta.
- **Erros**: `CmdError(code, message, field?)`, `code ∈ forbidden | invalid | not_found | conflict | unauthorized`.
  Fora do escopo, a resposta é `not_found` (não revela existência). Mensagens em português, prontas para a tela.
- **Texto**: tamanho máximo sempre validado; o front-end escapa tudo por padrão (`html` com tag).

## 3. Modelo de dados (`core/schema.js` é a fonte única)

| Coleção | Tipo | Chave / formato |
| --- | --- | --- |
| `settings` | único (`id: "school"`) | §3.1 |
| `subjects` | lista | `{id, name, short, color 1–8, weekly}` |
| `users` | lista | §3.2 |
| `classes` | lista | `{id, name, year, status: ativa|encerrada, segment, shift, room, capacity, teacherId, assistantIds[], subjects: {subjectId: userId|null}, schedule: [5][n]}` |
| `students` | lista | §3.3 |
| `attendance` | mapa | `classId|AAAA-MM-DD|tempo` → `{marks: {studentId: P|F|J|A}, reasons?: {studentId: texto}, subjectId|null, content?, by, at}`. Tempo `0` = chamada diária; `1..n` = aula do horário. |
| `grades` | mapa | `ano|studentId|subjectId|etapa` → número 0–10 (uma casa); `ano|studentId|_parecer|etapa` → texto. Etapa `1..termCount`, `rec1..recN` (recuperação da etapa), `rf` (final). |
| `councils` | mapa | `ano|studentId` → `{result: aprovado|retido|recuperacao|transferido, note, by, at}` |
| `invoices` | lista | `{id, studentId, month, kind: mensalidade|avulsa, description, amount, due, paidAt, method, paidAmount, receivedBy, reversals: [{at, by, reason}]}` |
| `events` | lista | `{id, title, type: prova|reuniao|evento|prazo|feriado, date, time, audience, notes, authorId}` |
| `notices` | lista | `{id, title, body, audience, pinned, date, authorId, createdAt, updatedAt}` |
| `diary` | lista | §3.4 |
| `acks` | mapa | `itemId` → `{studentId: {guardianId: {answer?: sim|nao, note?, origin: portal|escola, by, at, history?: [...]}}}` |
| `routines` | mapa | `classId|AAAA-MM-DD|studentId` → `{fields: {campo: valor}, bring: [], note, by, at, sentAt|null}` |
| `messages` | lista | §3.5 |
| `support` | lista | §3.6 |
| `plans` | lista | §3.6 |
| `files` | lista | `{id, name, type, size, ownerId, at, refs: [{coll, id}]}` (conteúdo em `DATA_DIR/files/`, ou IndexedDB na demonstração) |

**Fora do estado** (tabelas próprias no servidor; no LocalBackend, estruturas próprias): credenciais
(`hash`, `lastLoginAt`, `consentAt`, `consentVersion`), sessões, convites, leituras (`reads`: item ×
usuário × instante — "visualizado"), pedidos idempotentes, auditoria. `lastLoginAt`, `consentAt` e as
contagens de leitura entram no retrato só na montagem, para quem pode vê-los.

**Público** (`audience`): `{who: todos|familias|equipe, segments: [], classIds: []}`; listas vazias = escola toda.

### 3.1 Configurações
```
{ schoolName, cnpj, phone, address, logo?: fileId, timezone, year,
  termCount: 2|3|4, termLabel: bimestre|trimestre|semestre, term,
  terms: { "<ano>": { "<etapa>": {closed: bool, released: bool, start?, end?} } },
  passing, recovery, chargesFees, defaultFee, dueDay, lateFine, lateInterest, pixKey,
  segments: { "<etapa de ensino>": {attendance: diaria|por_aula, minAttendance, evaluation: nota|parecer} },
  homeworkLabel, diaryApproval, familyMessages, officeHours, routineFields: [{key, label, options[]}],
  routineBring: [], absenceAlert, privacy: {controller, dpoName, dpoContact, noticeVersion},
  profiles: { "<cargo>": [perms] }, ownerId, nextSeq, demo }
```
`settings.update` tem lista branca (nunca `profiles`, `ownerId`, `nextSeq`, `demo`). Perfis mudam por
`profiles.save`; titularidade por `owner.transfer`. Família recebe só nome/contato da escola, ano, etapas
e rótulos, `homeworkLabel`, `officeHours`, regras de cobrança, `pixKey`, `routineFields`, `privacy`.

### 3.2 Usuários
```
{ id, name, title, role, email, phone, status: ativo|inativo, login: bool, validUntil|null,
  grants: [], revokes: [], scope: todas|segmentos|vinculos, segments: [], classIds: [], linkedStudentIds: [],
  subjectIds: [], area: psicologia|psicopedagogia|orientacao|aee|servico_social|null, createdAt }
```
Permissões efetivas = fechamento(`(perfil ∪ grants) − revokes`) (perfil = `settings.profiles[role]` ou o padrão
de `core/perms.js`). Login por e-mail **ou** celular, únicos entre contas. O vínculo família ↔ aluno existe
**só** em `students.guardians[].userId`. Uma conta de equipe também pode ser responsável: alterna entre
"Equipe" e "Portal da família" (`/api/snapshot?modo=familia`).

### 3.3 Alunos
```
{ id, enrollment, name, birth, gender, cpf, classId, status: ativo|trancado|transferido|concluido,
  photo|null, address, imageConsent: bool, noDigitalAccess: bool,
  guardians: [{id, name, relation, phone, email, cpf, pedagogico, financeiro, podeBuscar, bloqueado, userId|null}],
  pickup: [{id, name, relation, document, phone}], restrictions,
  alerts /* alertas de saúde */, health /* saúde detalhada */, notes /* observações internas */,
  fee, discount, joinedAt, history: [{year, classId, className, result, avg, attendance}] }
```
Documentos redigidos levam `_hidden: [campos]` para a tela mostrar "sem acesso" em vez de "vazio".

### 3.4 Agenda do aluno (`diary`)
```
{ id, groupId, type: dever|recado|lembrete|autorizacao|ocorrencia, category?, classId,
  studentId|null /* null = turma toda */, recipients: [studentIds resolvidos na publicação],
  subjectId|null, title, body, date, due|null, respondBy|null, requireAck, internal,
  attachments: [fileId], status: rascunho|pendente|agendado|publicado|cancelado, publishAt|null,
  authorId, approvedBy?, createdAt, updatedAt, editedAt?, canceledAt?, cancelReason? }
```
- `ocorrencia`: exatamente um aluno; categorias `comportamento|atraso|uniforme|material|tarefa|elogio`;
  `internal` = só registro interno. Recado para alunos escolhidos vira um item por aluno (mesmo `groupId`).
- Várias turmas: `diary.save {classIds}` cria um item por turma (mesmo `groupId`), devolve `{ids}`.
- `agendado` → `publicado` pelo agendador (`diary.release`, ator `system`), gerando revisão e delta.
- Ciente/resposta por responsável (`guardianId`); a escola registra ciente em papel (`origin: escola`)
  e nunca sobrescreve resposta da família. Autorização: **qualquer "não" prevalece** e alerta a coordenação.
  Autorização com resposta não é editada: cancela e reenvia. Depois do primeiro ciente, editar grava
  `editedAt`. Excluir = cancelar (`cancelReason`), visível riscado para a família.

### 3.5 Mensagens família ↔ escola
```
{ id, studentId, kind: recado|falta|saida|busca|medicacao|atestado|outro, subject,
  details: {date?, time?, person?, document?, medicine?, dose?, schedule?, until?},
  attachments: [fileId], status: aberta|respondida|resolvida, createdBy, createdAt,
  posts: [{id, kind: texto|registro, userId, body, at, attachments?}] }
```
Equipe que vê: `mensagens.responder` + aluno visível (pela turma **atual** do aluno). Leitura vai para `reads`.

### 3.6 Atendimentos e planos
```
support { id, studentId, area, date, type: atendimento|observacao|familia|devolutiva|encaminhamento,
          confidentiality: autor|area|apoio, content, nextSteps, authorId, createdAt, addenda: [{by, at, text}] }
plans   { id, studentId, title, status: ativo|encerrado, start, goals, adaptations,
          sharedWith: {professores, familia}, authorId, updatedAt, familyAckAt? }
```
Retrato: `support` só com metadados `{id, studentId, area, date, type, confidentiality, authorId}` para quem
pode ler; o conteúdo vem por `support.read` (auditado). Quem lê: o autor; `area` → mesma área com
`atendimentos.conteudo`; `apoio` → `atendimentos.conteudo`. Só o autor edita; correção por adendo; ninguém
exclui. Plano: completo para autor e `atendimentos.conteudo`; para professores com vínculo pedagógico, só
`adaptations`; para a família (se compartilhado) título, metas e adaptações, com "ciente".

## 4. Permissões, perfis e escopo

Catálogo e perfis em `core/perms.js` (rótulos na voz do diretor; dependências em `IMPLIES`, aplicadas como
fechamento). Escopo: `todas` | `segmentos` | `vinculos` (regente, disciplina, auxiliar, `classIds` + alunos
em `linkedStudentIds`). Só turmas `ativa` contam para `vinculos`.

**Regras de contas** (anti-escalada):
- Dominância: o ator só cria, edita, reenvia convite, desativa ou exclui uma conta de equipe se, antes e
  depois, `perms(alvo) ⊆ perms(ator)` (ignorando `atendimentos.*`) e as turmas/alunos alcançados pelo alvo
  ⊆ os do ator (conjuntos resolvidos na hora). Ninguém age sobre si mesmo por `users.*`.
- Conta titular (`settings.ownerId`): só ela edita a si mesma; nunca fica inativa; transfere com senha.
- `profiles.save {role, perms}`: `usuarios.gerenciar`, dominância sobre o perfil resultante e sobre todos
  os afetados; proibido no próprio cargo.
- Famílias só por `family.*` com `familias.acessos` e escopo sobre o aluno; convite só para responsável
  já cadastrado na ficha. Bloquear encerra as sessões na hora.
- Desativar, convidar de novo, mudar permissões/escopo e bloquear família encerram as sessões do alvo.

## 5. Visibilidade (`core/view.js`)

Filtro por coleção com redação de campos; o mesmo filtro vale para o retrato, para os deltas e para os
documentos devolvidos. Janelas do retrato: chamada, notas, conselhos e cobranças do **ano corrente** (mais
cobranças em aberto de anos anteriores); agenda, rotinas e mensagens dos **últimos 60 dias** e do futuro
(e itens que ainda pedem ação). O resto vem por `GET /api/history/:coll`. Turmas encerradas e dados de anos
anteriores ficam no histórico. Família: só filhos com vínculo não bloqueado; nunca `notes`, `restrictions`,
contatos de outros responsáveis, `support`, planos não compartilhados, ocorrências internas, itens não
publicados; notas só de etapas liberadas; mensalidades só se for responsável financeiro.

## 6. Motor, sincronização e desfazer

- `Engine.run(state, actor, name, input, env)` → `{result, changes, befores, undoable, audit, effects}`.
  Registro em `Map`; todo comando declara autorização (`perm`, `anyPerm`, `family`, `self`, `system`) e
  opcionalmente `reauth: true` (a senha vem no envelope e é conferida pela rota). Transação com reversão.
- `changes = [{coll, id, op: put|del, value}]` (`put` traz o valor completo, já filtrado para quem recebe;
  o cliente substitui). `befores` nunca saem do servidor.
- **Seção crítica** no servidor: `run → db.commit({changes, audit, effects})` numa transação SQLite; se o
  banco falhar, `Engine.revert(state, befores)`. Instância única (lockfile em `DATA_DIR`).
- **Deltas**: o servidor guarda em memória os últimos 2000 commits. `GET /api/changes?since=rev` devolve
  `{rev, changes, resync?}` filtrados para o usuário; `resync` quando `since` saiu do buffer, o servidor
  reiniciou, ou a impressão digital do contexto do usuário mudou (permissões, turmas, alunos, titularidade).
  O cliente consulta a cada 15 s e ao voltar para a aba; só avança a revisão local quando recebeu o intervalo
  inteiro; `del` de id desconhecido é ignorado.
- **Idempotência**: `POST /api/cmd/:name {input, requestId, password?}`; repetição do mesmo `requestId`
  (24 h) devolve a mesma resposta. O cliente serializa os comandos.
- **Concorrência**: `attendance.save` envia só as marcações alteradas + `baseAt`; textos editáveis levam
  `baseUpdatedAt` e recebem `conflict` ("Fulano alterou enquanto você editava").
- **Desfazer**: comandos `undoable` (cancelamentos, exclusões, pagamento e estorno, situação de matrícula,
  geração de mensalidades). Token opaco em memória, uso único, preso ao usuário e à sessão, 15 min; um
  reinício invalida. Desfazer confere a permissão de novo e se o valor atual ainda é o que a ação deixou
  (JSON canônico); senão `conflict`.

## 7. Regras de negócio (`core/rules.js`, usado pelo servidor e pelo cliente)

- Chamada: modo por etapa de ensino; `roster(classId, date)` = chaves já gravadas ∪ alunos ativos da turma.
  Frequência = (P + J… ) — **F e J contam como falta; A (abonada/compensada) sai do denominador**.
  Por aula: o professor registra as próprias aulas (disciplina do horário); regente/coordenação, todas.
  Alerta de faltas seguidas (`absenceAlert`).
- Notas: média da etapa com recuperação (`recN` substitui se maior); média final = média das etapas;
  situação por `passing`/`recovery`; o regente lança só disciplinas sem professor; etapa fechada só com
  `notas.fechar`; família vê etapas liberadas.
- Financeiro: `netFee`, `amountDue` (multa + juros pro rata), mensalidades do mês.
- Público de eventos/comunicados, dias letivos, feriados nacionais.

## 8. Servidor

Configuração por ambiente: `PUBLIC_URL` (obrigatória fora de loopback; `https://` = HTTPS com TLS no proxy),
`HOST` (padrão `127.0.0.1`), `PORT`, `DATA_DIR`, `TRUST_PROXY` (número de proxies), `ALLOW_INSECURE_HTTP`,
`SETUP_TOKEN`. Inicialização: confere a versão do Node/SQLite, lockfile, `PRAGMA synchronous=FULL`,
migrações (`meta.dataVersion`), agendador (publicações agendadas, expiração de contas, limpeza de arquivos
órfãos, backup diário às 03h no fuso da escola via `sqlite.backup()` + cópia de `files/`, 14 cópias).

Segurança: POST exige `application/json`, `X-Caderneta: 1` e `Origin`/`Sec-Fetch-Site` compatíveis com
`PUBLIC_URL`; nunca CORS; `no-store` em `/api/*`; CSP só `'self'` (fontes locais); cookie `__Host-cad_sid`
(HTTPS) ou `cad_sid`; sessão: inatividade 60 min / máximo 12 h (equipe), 180 dias (família), `/api/changes`
não renova; scrypt N=2^15; limites por conta e por IP em login, convite, senha e instalação; mensagens
genéricas; logs só com método, rota, status e tempo.

### API
| Rota | Uso |
| --- | --- |
| `GET /api/health` | `{ok, version, mode}` |
| `GET /api/session` | `{user}` / 401; `{needsSetup: true}` em instalação nova |
| `POST /api/setup` | `{token, schoolName, name, email, phone, password}` (token de instalação, uso único) |
| `POST /api/login` | `{login (e-mail ou celular), password}` |
| `POST /api/logout`, `/api/logout-all` | encerra esta sessão / todas |
| `POST /api/password` | `{current, next}` |
| `POST /api/invite/check`, `/api/invite/accept` | `{code}` / `{code, password}` (convite ou redefinição) |
| `POST /api/consent` | aceite do aviso de privacidade (família) |
| `GET /api/snapshot[?modo=familia]` | `{rev, me, data, reads}` |
| `GET /api/changes?since=&boot=&readsSince=` | `{rev, now, changes, reads?, resync?}` (`reads`: novas visualizações da agenda para a equipe) |
| `POST /api/cmd/:name` | `{input, requestId, password?}` → `{result, changes, rev, undoToken?, effects?}` |
| `POST /api/undo` | `{token}` |
| `POST /api/read` | `{itemIds}` registra "visualizado" (família) |
| `GET /api/history/:coll` | histórico paginado (`classId`, `studentId`, `before`, `limit`; `as=<userId>` no "ver como": histórico da pessoa-alvo recortado pelo de quem vê) |
| `POST /api/support/read` | `{id}` conteúdo do atendimento (auditado) |
| `GET /api/audit` | registro de atividades (`before`, `limit`, `userId`) |
| `POST /api/files`, `GET /api/files/:id` | upload (bytes; PNG/JPEG/WEBP/PDF, 10 MB) / download com checagem de visibilidade |
| `GET /api/preview/:userId` | "ver como" (`Core.perms.canPreview`; somente leitura; `View.preview` = interseção do que a pessoa-alvo e quem vê podem ver) |
| `POST /api/export`, `POST /api/import` | backup cifrado (senha) / importação (titular + senha) |
| `POST /api/demo/login-as` | só com `--demo` |

CLI: `node server/index.js --reset-owner-password` ou `--reset-password=<e-mail|celular>` (só com acesso ao servidor;
é o caminho para contas que leem atendimentos sigilosos, cujo código a direção não gera).

Outros detalhes: cada aba envia `X-Caderneta-Modo` (equipe/familia); se outra aba trocou a área da sessão, `/api/changes`
responde `resync` e `/api/cmd` responde `conflict`. Entradas, primeiros acessos e aceites viram eventos de conta que chegam
pela sincronização a quem gerencia contas. `me.update` não revela de quem é um celular já usado (mensagem neutra, com limite).
Conta desativada que acerta a senha recebe 403 com explicação. A impressão digital da família inclui etapas liberadas,
vínculo financeiro e a equipe que ela enxerga (mudou → o portal recarrega).

## 9. Front-end

- Ordem dos scripts: `core/manifest.js` lista o núcleo; `index.html` carrega exatamente essa lista (teste).
- `Api` (Http ou Local), `Store` (retrato em memória — nunca em storage no modo servidor; aplica deltas;
  `Store.cmd` serializa, gera `requestId`, trata `resync`/`not_found`/`forbidden` recarregando e 401 abrindo
  login sem perder a tela), `Q` (consultas; regras vêm de `Core.rules`), `PageState` (filtros das telas).
- Registro de telas sem editar o shell: `App.page({id, label, icon, group, perm, family?, badge?, render, mount})`.
  Abas da ficha do aluno: `App.studentTab({...})`. Cartões do painel: `App.widget({...})`.
- **Todo HTML pelo `html` com tag** (escape por padrão); `raw()` só para HTML já montado pelo próprio código.
- Rotas: `#calendario` (antigo `#agenda` de eventos), `#agenda` = agenda do aluno; rotas antigas redirecionam.
- CSV/TSV: prefixo `'` em células que começam com `= + - @`, tab ou CR.

## 10. Comandos

Legenda: ✎ lista branca por permissão · ↶ desfazível · 🔒 reauth (senha no envelope).

**Escola** — `settings.update {patch}` (configuracoes.editar ✎) · `profiles.save {role, perms}` (usuarios.gerenciar) ·
`owner.transfer {userId}` (titular 🔒) · `subjects.save` · `subjects.delete` ↶ (só sem notas) · `year.rollover {mapping, results}` (titular 🔒).

**Turmas** — `classes.save` · `classes.close {id}` ↶ · `classes.delete {id}` (só sem histórico) · `classes.assign {classId, slot: regente|subjectId, userId|null}` ·
`classes.assistants {classId, userIds}` · `classes.subject {classId, subjectId, enabled}` · `classes.slot {classId, day, period, subjectId}` —
todos `turmas.gerenciar` + escopo `todas` para vínculos de pessoas, nunca sobre si mesmo.

**Equipe** — `users.save` ✎ · `users.status {id, status}` · `users.invite {id}` (gera convite) · `users.delete {id}` (só sem histórico) ·
`staff.links {userId, classes: [{classId, role: regente|professor|auxiliar, subjectIds}], linkedStudentIds}` — `usuarios.gerenciar` + dominância.
`me.update {phone}` (self).

**Alunos e famílias** — `students.enroll` ✎ (com `guardians[]` e `pickup[]`) · `students.update {id, patch}` ✎ (inclui `photo`: arquivo de imagem do autor) · `students.status {id, status}` ↶ · `students.delete {id}` (só sem histórico) ·
`students.guardian.save {studentId, guardian}` ✎ · `students.guardian.remove {studentId, guardianId}` · `students.pickup.save` · `students.pickup.remove` —
`alunos.cadastrar` + escopo (contatos exigem `alunos.contatos`; `alerts/health` exigem `alunos.saude`; `notes` exige `alunos.observacoes`; `fee/discount` exigem `financeiro.gerenciar`).
`family.invite {studentId, guardianId}` (cria/vincula conta, devolve convite em `effects`) · `family.invites {classId}` (lote) ·
`family.block {studentId, guardianId, blocked}` · `family.unlink {studentId, guardianId}` — `familias.acessos` + escopo.

**Frequência e notas** — `attendance.save {classId, date, period, marks, content?, reasons?, baseAt?}` (chamada.registrar + escopo + aula própria; `baseAt: null` = "abri antes de existir chamada", conflito se alguém salvou; `reasons` só com chamada.justificar, para J/A) ·
`attendance.justify {classId, date, period?, studentId, mark: J|A|F, reason}` (chamada.justificar) ·
`grades.set {studentId, subjectId|_parecer, term, value}` (notas.lancar + regra da disciplina + etapa aberta) ·
`terms.update {term, closed?, released?}` (notas.fechar) · `councils.set {studentId, result, note}` (notas.fechar).

**Agenda e rotina** — `diary.save` (diario.publicar, ou só diario.ocorrencias para ocorrências; autorização exige diario.autorizacoes; na edição o tipo é sempre o do item guardado) ·
`diary.cancel {id|groupId, reason}` ↶ (publicado → cancelado, visível riscado à família; nunca publicado → apagado se for do autor, ou devolvido ao autor como rascunho com motivo) · `diary.approve {id}` (diario.aprovar) · `diary.release {id}` (system) ·
`diary.ack {itemId, studentId, guardianId?, answer?, note?}` (família do aluno; ou diario.publicar + escopo com `origin: escola`) ·
`routines.save {classId, date, entries: {studentId: {fields, bring, note}}}` · `routines.send {classId, date}` (diario.publicar + escopo).

**Mensagens** — `messages.create {studentId, kind, subject, details, body, attachments}` (família do aluno, ou mensagens.responder) ·
`messages.reply {id, body, kind?: texto|registro}` (`registro` = nota interna da equipe: a família não vê e a situação não muda) · `messages.status {id, status}`.

**Atendimentos** — `support.save` (atendimentos.registrar; edição só do autor) · `support.addendum {id, text}` (autor) ·
`plans.save` · `plans.status` (atendimentos.registrar; autor ou atendimentos.conteudo) · `plans.ack {id}` (família).

**Comunicação** — `events.save` · `events.delete` ↶ (calendario.editar; público dentro do escopo; "escola toda" só com escopo `todas`) ·
`notices.save` · `notices.pin` · `notices.delete` ↶ (comunicados.publicar, idem).

**Financeiro** (desligado se `chargesFees = false`) — `invoices.generate {month}` ↶ · `invoices.create` · `invoices.update` · `invoices.delete` ↶ (financeiro.gerenciar) ·
`invoices.pay {id, amount, paidAt, method}` ↶ · `invoices.reverse {id, reason}` ↶ (financeiro.receber).

**Arquivos** — referência só se `file.ownerId === ator` e o arquivo estiver livre ou já for da mesma entidade; o comando atualiza `files.refs`.

## 11. Migração e versões
`core/migrate.js`: `fromV1(data, env)` (professores → contas sem login; chamada → `|0` com `{marks}`; J da v1 → `A`
(a v1 não contava como falta); notas → com ano; `guardian` → `guardians[0]`; `audience`/`classId` → público;
`kind` das mensalidades) e migrações ordenadas por `meta.dataVersion`, aplicadas ao carregar, ao importar e
no LocalBackend. Na demonstração, se houver dados da v1 no navegador, oferecer "baixar para levar ao
servidor" (nunca apagar automaticamente).

## 12. Testes (`npm test`)
Contrato (coleções, chaves, cargos fechados), permissões e perfis, dominância e todos os caminhos de
escalada, escopo e `not_found`, visibilidade e redação por perfil (família, professor, financeiro,
psicólogo), cada comando (permitido, negado, validação, lista branca), desfazer, deltas e `resync`,
idempotência, API (instalação com token, login por e-mail e celular, limites, CSRF, sessão, desativação
derruba sessão, convites), importação maliciosa (`__proto__`, ids com HTML), XSS em campos de família e
professor, arquivos (tipo, tamanho, acesso), desempenho com seed grande (retrato do diretor < 3 MB,
comandos < 50 ms). Navegador (Playwright): fluxos principais por perfil.
