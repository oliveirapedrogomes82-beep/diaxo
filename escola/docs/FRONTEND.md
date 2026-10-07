# Caderneta Escolar — guia do front-end (telas)

Complementa `docs/ARQUITETURA.md` (contrato 2.0: modelo de dados §3, permissões §4, visibilidade §5,
comandos §10). Leia os dois antes de escrever uma tela.

## 1. Como uma tela nasce

Cada módulo é um arquivo em `web/js/pages/` (já listado em `web/index.html`) e um CSS próprio em
`web/css/modules/`. O módulo **registra** o que oferece; a casca (`web/js/app.js`) monta o menu, as rotas,
a busca e o menu "Novo" a partir do que está registrado e do que o usuário pode fazer.

```js
App.page({
  id: 'chamada',            // rota #chamada (e #chamada/c123/2026-10-06 → rest = ['c123', '2026-10-06'])
  label: 'Chamada', icon: 'checkSquare',
  group: 'Dia a dia',       // equipe: 'Dia a dia' | 'Alunos e turmas' | 'Comunicação' | 'Gestão'
  order: 20,                // ordem no menu
  tab: 2,                   // opcional: aparece na barra inferior do celular (até 4, menor primeiro)
  perm: 'chamada.ver',      // ou anyPerm: ['a', 'b'], ou when: () => boolean
  family: undefined,        // undefined = só equipe · true = só Portal da família · 'both' = os dois
  badge: () => ({ n: 3, tone: 'bad', title: 'Turmas sem chamada hoje' }), // opcional
  title: (rest) => 'Chamada', // opcional (título da aba do navegador)
  render(rest) { return html`...`; },   // devolve html`` — nunca string
  mount(el, rest) { /* liga eventos dentro de el */ },
});
App.studentTab({ id: 'frequencia', label: 'Frequência', order: 30, perm: 'chamada.ver', render(student) {}, mount(el, student) {} });
App.widget({ id: 'chamadas-pendentes', order: 10, size: 'half', perm: 'chamada.registrar', render() {}, mount(el) {} }); // painel
App.action({ id: 'nova-chamada', label: 'Fazer chamada', icon: 'checkSquare', order: 20, perm: 'chamada.registrar', keys: 'presença falta', run() {} }); // menu Novo + busca
App.searchProvider((query) => [{ group: 'Alunos', label, avatar: name, meta, run() {} }]);
```

- `App.go('alunos/a123')`, `App.route()`, `App.render()`, `App.previewAs(userId)` ("ver como").
- `App.studentTabs(student)` / `App.widgets()` / `App.actions()` devolvem os itens permitidos, em ordem
  (usados pelo host da ficha do aluno e pelo painel).
- Ações compartilhadas entre módulos ficam em `Actions` (ex.: `Actions.matricular()`); sempre chame com
  guarda: `Actions.novaMensagem && Actions.novaMensagem({ studentId })`.

### Re-renderização
A casca re-renderiza a tela atual **sempre que os dados mudam** (comando seu, de outra pessoa via
sincronização a cada 15 s, ou recarga). Enquanto a pessoa digita num campo da página, espera ela sair
do campo. Por isso:
- **Estado da tela** (filtros, aba, turma escolhida, rascunho ainda não salvo) fica em
  `PageState.get('chamada', { classId: null, ... })` — objeto que sobrevive às re-renderizações.
- `render` deve ser puro e rápido (montar a partir de `Store.state` / `Q`); eventos só em `mount`.
- Gavetas e modais (`UI.modal`, `UI.formDrawer`) ficam em outra camada e **não** são re-renderizados.

## 2. Globais disponíveis

| Global | O que é |
| --- | --- |
| `html`, `raw` | **Todo HTML** é `html\`...\``: valores interpolados são escapados; passam direto só outros `html`, listas deles e `raw()` (só para HTML que o próprio código montou). Listas: interpole o array (`${items.map((x) => html\`<li>${x}</li>\`)}`) — **nunca** `.join('')` (vira texto escapado). `html.join(items, sep)` quando precisar de separador. |
| `icon(name, cls)` | ícone SVG seguro (`web/js/icons.js` lista os nomes). |
| `U` | formatação: `fmtDate`, `fmtDateLong`, `fmtDayMonth`, `fmtMonth`, `fmtInstant` (ISO → "hoje às 14:32"), `ago`, `relDay`, `money`, `num`, `int`, `pct`, `parseNum`, `parseGrade`, `matches`, `initials`, `firstName`, `shortName`, `age`, `plural`, `whatsappLink`, `debounce`, `toCSV`/`toTSV` (seguros contra fórmulas), `download`, `slug`, `greeting`, `linkify` (texto **já escapado**), `cap`; e tudo de `Core.util` (`today` no fuso da escola, `addDays`, `addMonths`, `weekday`, `daysBetween`, `isValidDate`, `maskPhone`, `maskCPF`, `validCPF`, `validEmail`, `clamp`, `avg`, `sum`, `by`, `norm`, `digits`, `holidayName`…). |
| `UI` | componentes: `modal`, `formDrawer` (aceita `onSubmit` assíncrono: devolva `null`/`false` para manter aberta), `confirm` (`reason: {label, required}` pede motivo e resolve `{reason}`; `requireText` pede digitar uma palavra), `askPassword`, `toast`, `errorToast`, **`act(name, input, {btn, ok, form})`** (executa comando com botão ocupado, toast de sucesso com "Desfazer" quando o servidor oferece, erro no campo `err.field` ou em toast; devolve a resposta ou `null`), `undo`, `menu`, `copy`, `field`/`fields`/`readForm`/`validate`/`markField`/`clearErrors`/`bindMasks`, `showInvite(effect, person)` (mostra código de acesso devolvido em `effects`), `pickFiles()` (envia e devolve `[{id,name,type,size}]`), `attachments(ids, {removable})`, `avatar(name, size, photoId)`, `pill(label, tone)`, `empty({icon,title,text,action})`, `meter`, `tabs`, `seg`, `kv(rows)`, `hidden(doc, campo)` + `noAccess()` (campo retirado pelo servidor), `spinner`, `columns` (gráfico de colunas), `$`, `$$`, `setHTML(el, html)`. |
| `Store` | `state` (coleções filtradas), `me` (`{id, name, role, roleLabel, perms[], scope, family, classIds, studentIds, owner, staffAndFamily}`), `can(p)`, `canAny(...)`, `family`, `preview` (pessoa do "ver como"), `cmd(name, input)`, `reads` (`{itemId: {userId: at}}`), `markRead(ids)` (família), `byId(coll, id)`, `version`, `online`. |
| `Q` | consultas prontas (ver `web/js/store.js`): turmas (`classes`, `myClasses`, `workClasses`, `classSubjects`, `teacherOf`, `canGradeSubject`, `segmentCfg`, `evaluation`, `attendanceMode`), alunos (`students({classId,status,query})`, `roster`, `mainGuardian`, `myChildren`, `myGuardianRecord`), equipe (`staff`, `familyUsers`, `roleLabel`, `userName`, `personLabel`), etapas/notas (`terms`, `termLabel`, `currentTerm`, `termOpen`, `termReleased`, `grade`, `termGrade`, `subjectAverage`, `subjectFinal`, `situation`, `council`), frequência (`periods`, `attendance`, `isSchoolDay`, `holiday`, `lastSchoolDays`, `attendanceIndex`, `attendanceRate`, `attTone`, `consecutiveAbsences`, `pendingRolls`), financeiro (`invoiceStatus`, `amountDue`, `netFee`, `studentInvoices`, `overdue`, `chargesFees`), agenda (`DIARY_TYPES`, `OCCURRENCE_CATEGORIES`, `diaryTypeLabel`, `homeworkLabel`, `diaryFor`, `acks`, `authorizationAnswer`, `readers`, `isRead`, `pendingApprovals`, `routine`, `openMessages`), calendário (`EVENT_TYPES`, `eventsOn`, `upcoming`, `notices`, `audienceLabel`), atendimentos (`AREAS`, `supportFor`, `plansFor`). Módulos podem acrescentar consultas próprias com `Object.assign(Q, {...})` **no próprio arquivo**, com nomes prefixados se houver risco de colisão. |
| `Api` | `history(coll, {classId, studentId, before, limit})` (dados antigos fora da janela do retrato), `supportRead(id)` (conteúdo sigiloso, auditado), `audit({before, limit, userId})`, `fileUrl(id)`, `uploadFile(file)`, `exportBackup(password, passphrase)` (Blob), `importBackup(base64, password, passphrase)`, `isLocal` (demonstração no navegador). Comandos sempre por `Store.cmd`/`UI.act`. |
| `Core` | núcleo compartilhado: `Core.perms` (CATALOG, ROLES, `groups()`, `profile`, `label`, `roleLabel`, `diffFromProfile`, `toGrantsRevokes`, `withImplied`, `dominates`), `Core.rules`, `Core.util`, `Core.seed` (`SEGMENTS`, `ROUTINE_FIELDS`, `ROUTINE_BRING`). |
| `Actions`, `PageState` | ações compartilhadas · estado de tela. |

## 3. Comandos e erros
- Entrada exata de cada comando: leia `web/core/commands/<arquivo>.js` (listas brancas, validações, quem pode).
  O servidor é a autoridade; o cliente só esconde o que a pessoa não pode fazer (`Store.can`).
- `UI.act` resolve com `{result, effects?, undoToken?}` ou `null` (erro já mostrado). Campos com erro do
  servidor (`err.field`) são marcados quando o nome do campo do formulário é igual ao do comando.
- Comandos com senha (`reauth`) pedem a senha sozinhos.
- Convites: `users.save` (conta nova), `users.invite`, `family.invite` e `family.invites` devolvem
  `effects: [{type:'invite', userId, code, link, expiresAt, purpose}]` — mostre com `UI.showInvite(effect, pessoa)`
  (ou, em lote, uma lista imprimível). O código aparece **uma única vez**.
- Documentos redigidos trazem `_hidden: ['health', ...]`: mostre `UI.noAccess()` em vez de "vazio".
- Ids nunca são gerados no cliente; datas civis `AAAA-MM-DD` (`U.today()`), instantes ISO.

## 4. Regras de interface (padrão "versão final")
- **Português do Brasil**, frases curtas, sem jargão técnico; botões com verbo ("Salvar chamada").
- Estado vazio sempre explica e oferece a próxima ação (`UI.empty`).
- Confirmação só para o que não se desfaz; o resto usa "Desfazer" (toast).
- Nada de `onclick=` no HTML (a política de segurança bloqueia): eventos em `mount` com `addEventListener`,
  de preferência delegação (`el.addEventListener('click', (e) => { const b = e.target.closest('[data-x]') ... })`).
- Celular primeiro: funciona em 390 px sem rolagem horizontal; tabelas largas usam `.table.responsive`
  (com `data-l` nos `td`) ou `.table-wrap`. Tema claro e escuro só com as variáveis de cor de `css/app.css`.
- Acessibilidade: `label` em todo campo, `aria-label` em botão só de ícone, foco visível, ordem lógica.
- Desempenho: retrato do diretor tem ~160 alunos e milhares de registros; evite laços O(n²) em `render`
  (monte `Map`s uma vez por render).
- Visual: reutilize as classes de `web/css/app.css` (`page-head`, `card`, `card-head`, `card-body`, `kpis`/`kpi`,
  `toolbar`, `table`, `items`, `pill`, `badge`, `notice`, `tabs`, `seg`, `chips`, `form-grid`, `field`, `btn`
  (`primary`, `ghost`, `sm`, `danger`), `empty`, `kv`, `avatar`, `meter`, `crumbs`…). CSS novo vai no arquivo
  do módulo em `web/css/modules/`, com prefixo próprio nas classes.

## 5. Demonstração e testes manuais
- `web/index.html` aberto direto (file://) roda a demonstração no navegador (`LocalBackend`), com
  "Entrar como…" para: diretora (titular), coordenadora, secretária, professor (Fund. II/EM), professora da
  Educação Infantil, auxiliar, psicóloga, tesoureiro e uma responsável (família com dois filhos).
- `npm run demo` sobe o servidor com a mesma escola em memória (http://127.0.0.1:3000).
- Playwright: `require('/opt/node22/lib/node_modules/playwright')`, Chromium já instalado. Use um contexto
  novo por teste (a demonstração guarda dados no IndexedDB do contexto).

## 6. Convenções já adotadas pelos módulos (leia antes de integrar)

- **Widgets do painel**: `render()` devolve o cartão inteiro — `<section class="card <prefixo>-widget">` com
  `card-head` (título com ícone e um link/sub) e `card-body`. O host (painel da equipe ou início da família)
  **não** embrulha em outro `.card`: só posiciona numa grade pelo `size` (`full` = linha inteira,
  `half` = metade, `third` = um terço; no celular tudo vira uma coluna) e chama `mount(el)` no elemento do
  widget. Widgets registrados até agora: `agenda-hoje`, `agenda-aprovacoes`, `agenda-autorizacoes-nao`,
  `agenda-pendente` (família), `alertas-saude`, `aniversariantes`, `chamadas-pendentes`, `faltas-seguidas`,
  `notas-pendentes`, `equipe-acessos`, `mensagens-abertas`, `mensagens-familia` (família), `atendimentos-recentes`,
  `apoio-familia` (família: plano de apoio com "Li e estou ciente"), `proximos-eventos` e `comunicados-fixados`
  (equipe e família), `financeiro-mes`.
- **Ações compartilhadas já existentes** (chame com guarda `typeof Actions.x === 'function'`):
  `Actions.matricular({classId})`, `verAluno(id, aba?)`, `editarAluno(id)`, `convidarResponsavel(studentId, guardianId)`,
  `situacaoMatricula(id)`, `trocarTurma(id)`, `excluirAluno(id)`, `convidarFamilias(classId)`,
  `novaConta()`, `editarConta(id)`, `verPessoa(id)`, `novaTurma()`, `editarTurma(id)`,
  `fazerChamada(classId, {date, period})`, `justificarFalta(...)`, `abrirNotas(...)`,
  `novoItemAgenda({classId, studentId, type})`, `verRespostasAgenda(itemId)`,
  `novaMensagem({studentId, kind?})` (equipe ou família), `abrirMensagem(id)`, `novoAtendimento({studentId})`,
  `novoPlanoApoio({studentId})`, `abrirAtendimento(id)`, `novoEvento({date, classId, type})`, `verCalendario(date)`,
  `novoComunicado()`, `receber(invoiceId)`, `gerarMensalidades()`.
- **Consultas extras** (de `turmas.js`): `Q.canTakeLesson`, `Q.rollsToDo(date)` → `[{klass, missing}]`,
  `Q.rollState`, `Q.absenceStreaks`, `Q.absenceAlert`, `Q.studentAverage`, `Q.classStats`,
  `Q.subjectAttendance`, `Q.atRisk`, `Q.attendanceRecords`, `Q.homeroom`, `Q.gradeTone`.
  `Q.pendingRolls()` usa `Q.rollsToDo` quando ele existe. `window.AlunosKit` tem utilitários da ficha
  (situação da matrícula, situação no portal, etc.).
- **Abas da ficha do aluno** aceitam `badge(student)` (número ou `{n, tone, title}`); um erro numa aba fica
  contido nela. Rotas: `#alunos/<id>/<aba>`.
- `Store.reads` (visualizações da agenda) e os campos `lastLoginAt`/`hasPassword`/`invitePending` das contas
  chegam também pela sincronização (não só no retrato).
- `UI.formDrawer` aceita `cls` (no `.modal`) e `wrapCls` (no `.overlay`); gavetas longas rolam por dentro.
- `UI.tabs`/`UI.seg` marcam o item ativo (`aria-selected`/`aria-pressed="true"`).
- `Api.history('classes')` devolve turmas encerradas.
