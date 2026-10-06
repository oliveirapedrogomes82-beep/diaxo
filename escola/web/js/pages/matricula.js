'use strict';
/* Matrícula: assistente em passos numa gaveta — aluno e turma → responsáveis → saúde e saída → mensalidade
   (só quando a escola cobra e a pessoa gerencia cobranças) → revisão. Envia students.enroll
   (web/core/commands/alunos.js) e, no fim, oferece o convite dos responsáveis para o Portal da família. */
(() => {
  const K = () => window.AlunosKit || {};
  const RELATIONS = (Core.students && Core.students.RELATIONS) || ['Mãe', 'Pai', 'Avó', 'Avô', 'Tia', 'Tio', 'Irmã(o)', 'Madrasta', 'Padrasto', 'Responsável legal', 'Outro'];
  const GENDERS = [['', 'Prefiro não informar'], ['F', 'Feminino'], ['M', 'Masculino']];
  const MAX_GUARDIANS = 3;
  const MAX_PICKUP = 5;
  const can = (p) => Store.can(p);
  const tf = (b) => (b ? 'true' : 'false');
  const fullName = (v) => (v && v.trim().split(/\s+/).length < 2 ? 'Escreva o nome completo (nome e sobrenome).' : '');
  const ga = (s, word) => (K().ga ? K().ga(s, word) : `${word}(a)`);

  const blankGuardian = (i) => ({ name: '', relation: i === 0 ? 'Mãe' : i === 1 ? 'Pai' : 'Responsável legal', phone: '', email: '', cpf: '', pedagogico: true, financeiro: i === 0, podeBuscar: true });
  const blankPickup = () => ({ name: '', relation: '', document: '', phone: '' });
  const vacancy = (c) => {
    const n = Q.roster(c.id).length;
    const cap = Number(c.capacity) || 0;
    return { n, cap, full: !!cap && n >= cap, text: cap ? (n >= cap ? `Turma cheia (${n}/${cap})` : `${U.plural(cap - n, 'vaga', 'vagas')} (${n}/${cap})`) : U.plural(n, 'aluno', 'alunos') };
  };

  /**
   * Abre o assistente de matrícula. opts: {classId} para já deixar a turma escolhida.
   * Devolve a API da gaveta (ou null se a pessoa não pode matricular).
   */
  Actions.matricular = (opts = {}) => {
    if (!can('alunos.cadastrar')) {
      UI.toast('Seu acesso não inclui matrículas. Fale com a secretaria ou a direção.', { tone: 'bad' });
      return null;
    }
    const classes = Q.classes();
    if (!classes.length) {
      const manage = can('turmas.gerenciar') && App.pages().some((p) => p.id === 'turmas');
      UI.confirm({ title: 'Crie uma turma primeiro', text: 'Todo aluno precisa estar em uma turma. Crie as turmas do ano e depois faça as matrículas.', ok: manage ? 'Ir para Turmas' : 'Entendi', cancel: manage ? 'Agora não' : 'Fechar' }).then((ok) => ok && manage && App.go('turmas'));
      return null;
    }
    const st = Q.settings();
    const fees = Q.chargesFees() && can('financeiro.gerenciar');
    const months = fees && Core.students && Core.students.remainingMonths ? Core.students.remainingMonths(st, U.today()) : [];
    const d = {
      name: '',
      birth: '',
      gender: '',
      cpf: '',
      address: '',
      classId: opts.classId && classes.some((c) => c.id === opts.classId) ? opts.classId : classes.length === 1 ? classes[0].id : '',
      guardians: [blankGuardian(0)],
      alerts: '',
      health: '',
      restrictions: '',
      notes: '',
      imageConsent: false,
      noDigitalAccess: false,
      pickup: [],
      fee: Number(st.defaultFee) || 0,
      discount: 0,
      genInvoices: months.length > 0 && (Number(st.defaultFee) || 0) > 0,
    };
    const STEPS = [
      { id: 'aluno', label: 'Aluno' },
      { id: 'resp', label: 'Responsáveis' },
      { id: 'saude', label: 'Saúde e saída' },
      fees ? { id: 'mens', label: 'Mensalidade' } : null,
      { id: 'rev', label: 'Revisão' },
    ].filter(Boolean);
    let step = 0;
    let dupAck = '';
    let done = null;
    const sid = () => STEPS[step].id;
    const net = () => Math.round((Number(d.fee) || 0) * (1 - (Number(d.discount) || 0) / 100) * 100) / 100;

    // ---------- campos de cada passo ----------
    const alunoDefs = () => [
      { name: 'name', label: 'Nome completo do aluno', required: true, full: true, maxlength: 120, placeholder: 'Ex.: Ana Clara Souza Lima', check: fullName },
      { name: 'birth', label: 'Data de nascimento', type: 'date', required: true, max: U.today(), check: (v) => (!v ? '' : v > U.today() ? 'A data não pode estar no futuro.' : U.age(v) > 100 ? 'Confira o ano de nascimento.' : '') },
      { name: 'gender', label: 'Sexo', type: 'select', options: GENDERS },
      { name: 'cpf', label: 'CPF do aluno', mask: 'cpf', hint: 'Opcional.' },
      { name: 'address', label: 'Endereço', maxlength: 200, placeholder: 'Rua, número — bairro', hint: 'Opcional.' },
    ];
    const gDefs = (i) => [
      { name: `g${i}.name`, label: 'Nome completo', required: true, full: true, maxlength: 120, check: fullName },
      { name: `g${i}.relation`, label: 'Parentesco', type: 'select', options: RELATIONS.map((r) => [r, r]) },
      { name: `g${i}.phone`, label: 'Celular (WhatsApp)', type: 'tel', placeholder: '(11) 98765-4321' },
      { name: `g${i}.email`, label: 'E-mail', type: 'email', placeholder: 'nome@email.com' },
      { name: `g${i}.cpf`, label: 'CPF', mask: 'cpf', hint: 'Opcional.' },
    ];
    const gChecks = (i) => [
      { name: `g${i}.pedagogico`, type: 'checkbox', label: 'Pedagógico', hint: 'Agenda, recados e boletim' },
      { name: `g${i}.financeiro`, type: 'checkbox', label: 'Financeiro', hint: 'Responde pelas mensalidades' },
      { name: `g${i}.podeBuscar`, type: 'checkbox', label: 'Pode buscar', hint: 'Retira o aluno na saída' },
    ];
    const respDefs = () => d.guardians.flatMap((g, i) => [...gDefs(i), ...gChecks(i)]);
    const healthDefs = () =>
      [
        { name: 'alerts', label: 'Alertas de saúde', type: 'textarea', rows: 3, full: true, maxlength: 1000, placeholder: 'Ex.: alergia a amendoim — sem amendoim no lanche.', hint: 'Alergias, restrições alimentares e o que fazer numa emergência. Aparece em destaque para professores e auxiliares.' },
        can('alunos.saude') && { name: 'health', label: 'Saúde detalhada', type: 'textarea', rows: 3, full: true, maxlength: 2000, placeholder: 'Diagnósticos, laudos, medicação de uso contínuo.', hint: 'Só quem tem acesso à saúde detalhada vê.' },
      ].filter(Boolean);
    const kDefs = (i) => [
      { name: `k${i}.name`, label: 'Nome completo', required: true, full: true, maxlength: 120 },
      { name: `k${i}.relation`, label: 'Parentesco ou vínculo', maxlength: 40, placeholder: 'Ex.: Avó, motorista da van' },
      { name: `k${i}.document`, label: 'Documento', maxlength: 40, placeholder: 'RG ou CPF' },
      { name: `k${i}.phone`, label: 'Celular', type: 'tel', placeholder: '(11) 98765-4321' },
    ];
    const exitDefs = () =>
      [
        { name: 'restrictions', label: 'Restrição de retirada', type: 'textarea', rows: 2, full: true, maxlength: 1000, placeholder: 'Ex.: somente a mãe pode retirar (decisão judicial).', hint: 'Opcional. Aparece em destaque para a equipe; não aparece para a família.' },
      ];
    const authDefs = () =>
      [
        { name: 'imageConsent', type: 'checkbox', full: true, label: 'A família autoriza o uso de imagem do aluno', hint: 'Fotos e vídeos em atividades, murais e redes da escola.' },
        { name: 'noDigitalAccess', type: 'checkbox', full: true, label: 'Família sem acesso digital', hint: 'Recados e avisos vão impressos; a família não recebe convite para o portal.' },
        can('alunos.observacoes') && { name: 'notes', label: 'Observações internas', type: 'textarea', rows: 2, full: true, maxlength: 3000, hint: 'Opcional. Nunca aparecem para a família.' },
      ].filter(Boolean);
    const pickupDefs = () => d.pickup.flatMap((p, i) => kDefs(i));
    const feeDefs = () => [
      { name: 'fee', label: 'Mensalidade cheia', type: 'money', min: 0, max: 100000, required: true },
      { name: 'discount', label: 'Desconto (%)', type: 'number', min: 0, max: 100, step: '0.5', hint: 'Bolsa ou desconto de irmãos.' },
    ];

    // ---------- telas de cada passo ----------
    const dupOf = () => {
      const n = U.norm(d.name).replace(/\s+/g, ' ').trim();
      return n ? Store.state.students.find((s) => U.norm(s.name).replace(/\s+/g, ' ').trim() === n) : null;
    };
    const stepAluno = () => {
      const dup = dupAck ? dupOf() : null;
      return html`
        ${dup ? html`<div class="notice warn" role="alert">${icon('alert')}<span class="grow">Já existe <a href="#alunos/${dup.id}" target="_blank">${dup.name}</a> (${(Q.klass(dup.classId) || {}).name || 'sem turma'}, matrícula ${dup.enrollment}). Se for outro aluno com o mesmo nome, toque em <b>Continuar</b> de novo.</span></div>` : ''}
        <form class="form-grid" novalidate data-wz-form>
          ${UI.fields(alunoDefs(), d)}
          <div class="field full" data-field="classId"><span class="label" id="wz-cls-l">Turma <span class="req" aria-hidden="true">*</span></span>
            <div class="pick-grid al-picks" role="radiogroup" aria-labelledby="wz-cls-l">${classes.map((c) => {
              const v = vacancy(c);
              return html`<label class="pick"><input type="radio" name="classId" value="${c.id}" ${d.classId === c.id ? raw('checked') : ''}><strong>${c.name}</strong><span>${c.shift || ''}${c.segment ? ` · ${c.segment}` : ''}</span><span class="${v.full ? 'al-full' : 'al-free'}">${v.text}</span></label>`;
            })}</div>
            <span class="hint">Turma cheia ainda aceita matrícula; a capacidade só serve de alerta.</span>
          </div>
          <button type="submit" hidden></button>
        </form>`;
    };
    const siblingTool = () =>
      can('alunos.contatos') && Store.state.students.length
        ? html`<details class="al-sib"><summary>${icon('users')}<span>Tem irmão ou irmã na escola? Copie os responsáveis</span></summary>
            <div class="al-sib-body"><label class="search-box"><span class="sr-only">Buscar irmão ou irmã</span>${icon('search')}<input class="input" data-wz-sib type="search" placeholder="Nome do irmão ou da irmã" autocomplete="off" data-nodirty></label><div data-wz-sib-list class="al-sib-list"></div></div></details>`
        : '';
    const stepResp = () => html`
      <p class="muted al-lead">Quem responde pelo aluno. O celular é usado no convite para o Portal da família.</p>
      ${siblingTool()}
      <form novalidate data-wz-form class="al-gforms">
        ${d.guardians.map(
          (g, i) => html`<fieldset class="al-gblock">
            <legend>Responsável ${i + 1}${i === 0 ? html` <span class="muted">(principal)</span>` : ''}</legend>
            ${i > 0 ? html`<button type="button" class="icon-btn sm al-gblock-x" data-wz="g-del" data-i="${i}" aria-label="Remover o responsável ${i + 1}">${icon('trash')}</button>` : ''}
            <div class="form-grid">${UI.fields(gDefs(i), { ['g' + i]: g })}<div class="full al-checks">${UI.fields(gChecks(i), { ['g' + i]: g })}</div></div>
          </fieldset>`,
        )}
        ${d.guardians.length < MAX_GUARDIANS ? html`<button type="button" class="btn al-add" data-wz="g-add">${icon('plus')}Adicionar outro responsável</button>` : ''}
        <button type="submit" hidden></button>
      </form>`;
    const stepSaude = () => html`
      <form class="form-grid" novalidate data-wz-form>
        <h3 class="form-h al-first">Saúde</h3>
        ${UI.fields(healthDefs(), d)}
        <h3 class="form-h">Saída da escola</h3>
        <p class="full small muted">Pessoas autorizadas a buscar, além dos responsáveis marcados com "pode buscar".</p>
        ${d.pickup.map(
          (p, i) => html`<fieldset class="al-gblock full">
            <legend>Pessoa autorizada ${i + 1}</legend>
            <button type="button" class="icon-btn sm al-gblock-x" data-wz="k-del" data-i="${i}" aria-label="Remover a pessoa autorizada ${i + 1}">${icon('trash')}</button>
            <div class="form-grid">${UI.fields(kDefs(i), { ['k' + i]: p })}</div>
          </fieldset>`,
        )}
        ${d.pickup.length < MAX_PICKUP ? html`<div class="full"><button type="button" class="btn sm" data-wz="k-add">${icon('plus')}Adicionar pessoa autorizada</button></div>` : ''}
        ${UI.fields(exitDefs(), d)}
        <h3 class="form-h">Autorizações</h3>
        ${UI.fields(authDefs(), d)}
        <button type="submit" hidden></button>
      </form>`;
    const discountChips = () => html`<div class="full chips" role="group" aria-label="Descontos comuns">${[0, 5, 10, 20, 50, 100].map(
      (x) => html`<button type="button" class="chip" data-wz-disc="${x}" aria-pressed="${tf(Number(d.discount) === x)}">${x === 0 ? 'Sem desconto' : x === 100 ? 'Bolsa integral' : `${x}%`}</button>`,
    )}</div>`;
    const stepMens = () => html`
      <form class="form-grid" novalidate data-wz-form>
        ${UI.fields(feeDefs(), d)}
        ${discountChips()}
        <div class="full notice">${icon('wallet')}<span class="grow">Valor mensal: <b data-wz-net>${U.money(net())}</b></span></div>
        ${months.length
          ? UI.field({ name: 'genInvoices', type: 'checkbox', full: true, label: `Gerar as mensalidades de ${U.monthName(months[0])} a dezembro (${months.length})`, hint: `Vencimento todo dia ${st.dueDay || 10}. Cada cobrança pode ser ajustada depois no Financeiro.` }, d)
          : html`<p class="full small muted">O ano letivo ${st.year} já terminou: nenhuma mensalidade será gerada agora.</p>`}
        <button type="submit" hidden></button>
      </form>`;
    const revSection = (title, i, body) => html`<section class="al-rev"><div class="al-rev-head"><h3>${title}</h3><button type="button" class="btn sm ghost" data-wz-goto="${i}">${icon('pencil')}Alterar</button></div>${body}</section>`;
    const stepRev = () => {
      const c = Q.klass(d.classId);
      const idx = (id) => STEPS.findIndex((x) => x.id === id);
      const seq = `${st.year}${String(Number(st.nextSeq) || 1).padStart(4, '0')}`;
      const kids = d.pickup.filter((p) => p.name.trim());
      return html`
        <p class="muted al-lead">Confira antes de confirmar. Toque em <b>Alterar</b> para corrigir uma parte.</p>
        ${revSection('Aluno', idx('aluno'), html`<dl class="summary">
          <dt>Nome</dt><dd>${d.name}</dd>
          <dt>Nascimento</dt><dd>${U.fmtDate(d.birth)} · ${U.plural(U.age(d.birth), 'ano', 'anos')}</dd>
          <dt>Sexo</dt><dd>${{ F: 'Feminino', M: 'Masculino' }[d.gender] || 'Não informado'}</dd>
          ${d.cpf ? html`<dt>CPF</dt><dd>${d.cpf}</dd>` : ''}
          ${d.address ? html`<dt>Endereço</dt><dd>${d.address}</dd>` : ''}
          <dt>Turma</dt><dd>${c ? `${c.name}${c.shift ? ` · ${c.shift}` : ''}` : '—'}</dd>
        </dl>`)}
        ${revSection('Responsáveis', idx('resp'), html`<ul class="items al-rev-list">${d.guardians.map(
          (g) => html`<li>${UI.avatar(g.name || '?', 'sm')}<div class="grow"><b>${g.name}</b> <span class="muted">· ${g.relation}</span>
            <div class="person-sub">${[g.phone, g.email].filter(Boolean).join(' · ') || 'Sem contato'}</div>
            <div class="al-marks">${g.pedagogico ? UI.pill('Pedagógico', 'info', true) : ''}${g.financeiro ? UI.pill('Financeiro', '', true) : ''}${g.podeBuscar ? UI.pill('Pode buscar', 'ok', true) : ''}</div></div></li>`,
        )}</ul>`)}
        ${revSection('Saúde e saída', idx('saude'), html`<dl class="summary">
          <dt>Alertas de saúde</dt><dd>${d.alerts || html`<span class="muted">Nenhum</span>`}</dd>
          ${can('alunos.saude') ? html`<dt>Saúde detalhada</dt><dd>${d.health || html`<span class="muted">Nada informado</span>`}</dd>` : ''}
          <dt>Também podem buscar</dt><dd>${kids.length ? html.join(kids.map((p) => `${p.name}${p.relation ? ` (${p.relation})` : ''}`), ', ') : html`<span class="muted">Só os responsáveis</span>`}</dd>
          ${d.restrictions ? html`<dt>Restrição de retirada</dt><dd>${d.restrictions}</dd>` : ''}
          <dt>Uso de imagem</dt><dd>${d.imageConsent ? 'Autorizado' : 'Não autorizado'}</dd>
          <dt>Comunicação</dt><dd>${d.noDigitalAccess ? 'Sem acesso digital (recados impressos)' : 'Pelo Portal da família'}</dd>
        </dl>`)}
        ${fees ? revSection('Mensalidade', idx('mens'), html`<dl class="summary">
          <dt>Valor mensal</dt><dd>${U.money(net())}${Number(d.discount) ? html` <span class="muted">(${U.num(d.discount, 0)}% de desconto sobre ${U.money(d.fee)})</span>` : ''}</dd>
          <dt>Cobranças</dt><dd>${d.genInvoices && months.length && net() > 0 ? U.plural(months.length, 'mensalidade será gerada', 'mensalidades serão geradas') : 'Nenhuma agora'}</dd>
        </dl>`) : ''}
        <p class="small muted al-seq">${icon('info')} Número de matrícula previsto: <b class="num">${seq}</b> (confirmado ao salvar).</p>`;
    };
    const stepsHTML = () => html`<div class="steps al-steps" aria-label="Etapas da matrícula">${STEPS.map(
      (x, i) => html`<span class="step ${i === step ? 'current' : i < step ? 'done' : ''}" ${i === step ? raw('aria-current="step"') : ''}><b>${i < step ? icon('check') : i + 1}</b><span class="al-step-l">${x.label}</span></span>`,
    )}</div>`;

    // ---------- leitura e validação ----------
    const formOf = (el) => UI.$('[data-wz-form]', el);
    const readGuardians = (form) => {
      const r = UI.readForm(form, respDefs());
      d.guardians = d.guardians.map((g, i) => ({ ...g, ...(r['g' + i] || {}) }));
    };
    const readPickup = (form) => {
      const r = UI.readForm(form, pickupDefs());
      d.pickup = d.pickup.map((p, i) => ({ ...p, ...(r['k' + i] || {}) }));
    };
    const collect = (el) => {
      const form = formOf(el);
      if (!form) return;
      const id = sid();
      if (id === 'aluno') {
        Object.assign(d, UI.readForm(form, alunoDefs()));
        d.classId = (UI.$('input[name="classId"]:checked', form) || {}).value || '';
      } else if (id === 'resp') readGuardians(form);
      else if (id === 'saude') {
        Object.assign(d, UI.readForm(form, [...healthDefs(), ...exitDefs(), ...authDefs()]));
        readPickup(form);
      } else if (id === 'mens') {
        const r = UI.readForm(form, [...feeDefs(), { name: 'genInvoices', type: 'checkbox' }]);
        d.fee = r.fee == null || isNaN(r.fee) ? 0 : r.fee;
        d.discount = r.discount == null || isNaN(r.discount) ? 0 : r.discount;
        d.genInvoices = !!r.genInvoices;
      }
    };
    const valid = (el) => {
      const form = formOf(el);
      if (!form) return true;
      const id = sid();
      if (id === 'aluno') {
        const data = UI.readForm(form, alunoDefs());
        let ok = UI.validate(form, alunoDefs(), data);
        const cls = (UI.$('input[name="classId"]:checked', form) || {}).value;
        if (!cls) {
          UI.markField(form, 'classId', 'Escolha a turma do aluno.', ok);
          ok = false;
        }
        return ok;
      }
      if (id === 'resp') {
        const defs = respDefs();
        const data = UI.readForm(form, defs);
        if (!UI.validate(form, defs, data)) return false;
        const gs = d.guardians.map((g, i) => data['g' + i] || {});
        if (!gs.some((g) => g.phone)) return !UI.markField(form, 'g0.phone', 'Informe o celular de pelo menos um responsável.');
        if (!gs.some((g) => g.pedagogico)) return !UI.markField(form, 'g0.pedagogico', 'Marque pelo menos um responsável pedagógico (quem recebe a agenda e os recados).');
        return true;
      }
      if (id === 'saude') {
        const defs = [...healthDefs(), ...pickupDefs(), ...exitDefs(), ...authDefs()];
        return UI.validate(form, defs, UI.readForm(form, defs));
      }
      if (id === 'mens') return UI.validate(form, feeDefs(), UI.readForm(form, feeDefs()));
      return true;
    };

    // ---------- gaveta ----------
    const SUB = 'Leva cerca de um minuto. Campos com * são obrigatórios.';
    const api = UI.modal({
      title: 'Matricular aluno',
      sub: SUB,
      drawer: true,
      cls: 'al-wiz',
      top: html`<div data-wz-steps></div>`,
      body: '',
      foot: html`<button type="button" class="btn left" data-wz-back>${icon('arrowLeft')}<span>Voltar</span></button><button type="button" class="btn" data-close>Cancelar</button><button type="button" class="btn primary" data-wz-next></button>`,
      onMount(el, api) {
        const body = UI.$('.modal-body', el);
        const back = UI.$('[data-wz-back]', el);
        const next = UI.$('[data-wz-next]', el);
        UI.bindMasks(body);

        const draw = (focus = true) => {
          UI.setHTML(UI.$('[data-wz-steps]', el), stepsHTML());
          const id = sid();
          UI.setHTML(body, id === 'aluno' ? stepAluno() : id === 'resp' ? stepResp() : id === 'saude' ? stepSaude() : id === 'mens' ? stepMens() : stepRev());
          back.style.visibility = step ? 'visible' : 'hidden';
          UI.setHTML(next, step === STEPS.length - 1 ? html`${icon('check')}<span>Confirmar matrícula</span>` : html`<span>Continuar</span>${icon('arrowRight')}`);
          body.scrollTop = 0;
          if (focus) {
            const f = UI.$('input:not([type="radio"]):not([type="checkbox"]):not([data-wz-sib]), select, textarea', body) || UI.$('button', body);
            f && f.focus({ preventScroll: true });
          }
        };

        const drawDone = () => {
          const s = Q.student(done.id);
          const c = s && Q.klass(s.classId);
          UI.setHTML(UI.$('[data-wz-steps]', el), '');
          const head = UI.$('.modal-head .sub', el);
          head && UI.setHTML(head, 'Pronto! A ficha já está disponível para a equipe.');
          const invitable = s && can('familias.acessos') && !s.noDigitalAccess;
          const gs = s ? (s.guardians || []).filter((g) => g.pedagogico) : [];
          UI.setHTML(
            body,
            html`<div class="al-done">
              <span class="al-done-icon">${icon('check')}</span>
              <h3>${s ? s.name : d.name} está ${ga(s || d, 'matriculado')}!</h3>
              <p class="muted">${c ? c.name : ''}${c ? ' · ' : ''}matrícula nº <b class="num">${done.enrollment}</b>${done.invoices ? html` · ${U.plural(done.invoices, 'mensalidade gerada', 'mensalidades geradas')}` : ''}</p>
            </div>
            ${invitable && gs.length
              ? html`<section class="al-next"><h3>Próximo passo: convidar para o Portal da família</h3>
                  <p class="small muted">Cada responsável recebe um código de primeiro acesso para acompanhar agenda, recados e boletim.</p>
                  <ul class="items">${gs.map(
                    (g) => html`<li>${UI.avatar(g.name, 'sm')}<div class="grow"><b>${g.name}</b> <span class="muted">· ${g.relation}</span><div class="person-sub">${g.phone || g.email || 'Sem celular nem e-mail'}</div></div>
                      ${g.phone || g.email ? html`<button type="button" class="btn sm primary" data-wz-inv="${g.id}">${icon('send')}Convidar</button>` : ''}</li>`,
                  )}</ul></section>`
              : s && !s.noDigitalAccess
                ? html`<p class="notice">${icon('info')}<span class="grow">A secretaria pode convidar a família para o Portal na ficha do aluno.</span></p>`
                : ''}`,
          );
          UI.setHTML(api.el.querySelector('.modal-foot'), html`<button type="button" class="btn left" data-wz-again>${icon('userPlus')}<span>Matricular outro</span></button><button type="button" class="btn primary" data-wz-open>${icon('user')}<span>Abrir ficha</span></button>`);
          const f = UI.$('[data-wz-inv]', body) || UI.$('[data-wz-open]', el);
          f && f.focus();
        };

        const submit = async () => {
          const input = {
            name: d.name,
            birth: d.birth,
            gender: d.gender,
            cpf: d.cpf,
            address: d.address,
            classId: d.classId,
            imageConsent: !!d.imageConsent,
            noDigitalAccess: !!d.noDigitalAccess,
            alerts: d.alerts,
            restrictions: d.restrictions,
            guardians: d.guardians.map((g) => ({ name: g.name, relation: g.relation, phone: g.phone, email: g.email, cpf: g.cpf, pedagogico: !!g.pedagogico, financeiro: !!g.financeiro, podeBuscar: !!g.podeBuscar })),
            pickup: d.pickup.filter((p) => p.name && p.name.trim()).map((p) => ({ name: p.name, relation: p.relation, document: p.document, phone: p.phone })),
          };
          if (can('alunos.saude')) input.health = d.health;
          if (can('alunos.observacoes')) input.notes = d.notes;
          if (fees) Object.assign(input, { fee: d.fee || 0, discount: d.discount || 0, genInvoices: !!d.genInvoices });
          const res = await UI.act('students.enroll', input, { btn: next });
          if (!res) return;
          api.setDirty(false);
          done = res.result || {};
          drawDone();
        };

        const go = async () => {
          if (done) return;
          if (step < STEPS.length - 1) {
            if (!valid(el)) return;
            collect(el);
            if (sid() === 'aluno') {
              const dup = dupOf();
              const key = U.norm(d.name);
              if (dup && dupAck !== key) {
                dupAck = key;
                draw(false);
                const n = UI.$('.notice', body);
                n && n.scrollIntoView({ block: 'nearest' });
                return;
              }
            }
            step++;
            draw();
            return;
          }
          submit();
        };

        back.addEventListener('click', () => {
          if (done) return;
          collect(el);
          step = Math.max(0, step - 1);
          draw();
        });
        next.addEventListener('click', go);
        el.addEventListener('submit', (e) => {
          e.preventDefault();
          go();
        });
        body.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' && e.target.tagName === 'INPUT' && !['checkbox', 'radio', 'search'].includes(e.target.type)) {
            e.preventDefault();
            go();
          }
        });
        body.addEventListener('input', (e) => {
          if (sid() === 'mens' && !done) {
            collect(el);
            const n = UI.$('[data-wz-net]', body);
            n && (n.textContent = U.money(net()));
            UI.$$('[data-wz-disc]', body).forEach((b) => b.setAttribute('aria-pressed', tf(Number(b.dataset.wzDisc) === Number(d.discount))));
          }
          if (e.target.matches('[data-wz-sib]')) drawSiblings(e.target.value);
        });
        body.addEventListener('change', (e) => {
          if (e.target.name === 'classId') {
            const w = UI.$('[data-field="classId"] .error', body);
            w && w.remove();
          }
        });

        const drawSiblings = (q) => {
          const box = UI.$('[data-wz-sib-list]', body);
          if (!box) return;
          const list = q.trim().length < 2 ? [] : Q.students({ status: 'todos', query: q }).slice(0, 5);
          UI.setHTML(
            box,
            q.trim().length < 2
              ? ''
              : list.length
                ? list.map((s) => html`<button type="button" class="al-sib-item" data-wz-sibpick="${s.id}">${UI.avatar(s.name, 'sm', s.photo)}<span class="grow"><b>${s.name}</b><span class="person-sub">${(Q.klass(s.classId) || {}).name || 'Sem turma'} · ${(s.guardians || []).map((g) => g.name).join(', ')}</span></span>${icon('copy', 'muted')}</button>`)
                : html`<p class="small muted">Nenhum aluno encontrado com esse nome.</p>`,
          );
        };

        body.addEventListener('click', (e) => {
          const b = e.target.closest('[data-wz], [data-wz-disc], [data-wz-goto], [data-wz-sibpick], [data-wz-inv]');
          if (!b) return;
          if (b.dataset.wzInv) {
            Actions.convidarResponsavel &&
              Actions.convidarResponsavel(done.id, b.dataset.wzInv, { btn: b }).then((res) => {
                if (res && document.contains(b)) {
                  b.replaceWith(Object.assign(document.createElement('span'), { className: 'pill ok', textContent: 'Código gerado' }));
                }
              });
            return;
          }
          if (b.dataset.wzGoto != null) {
            step = Number(b.dataset.wzGoto);
            draw();
            return;
          }
          if (b.dataset.wzDisc != null) {
            const input = UI.$('#f-discount', body);
            input.value = b.dataset.wzDisc;
            collect(el);
            UI.$('[data-wz-net]', body).textContent = U.money(net());
            UI.$$('[data-wz-disc]', body).forEach((x) => x.setAttribute('aria-pressed', tf(x === b)));
            api.setDirty(true);
            return;
          }
          if (b.dataset.wzSibpick) {
            const s = Q.student(b.dataset.wzSibpick);
            if (!s) return;
            collect(el);
            d.guardians = (s.guardians || []).slice(0, MAX_GUARDIANS).map((g) => ({ name: g.name, relation: RELATIONS.includes(g.relation) ? g.relation : 'Responsável legal', phone: g.phone || '', email: g.email || '', cpf: g.cpf || '', pedagogico: g.pedagogico !== false, financeiro: !!g.financeiro, podeBuscar: g.podeBuscar !== false && !g.bloqueado }));
            if (!d.guardians.length) d.guardians = [blankGuardian(0)];
            if (!d.address && s.address) d.address = s.address;
            api.setDirty(true);
            draw();
            UI.toast(`Responsáveis copiados da ficha de ${U.firstName(s.name)}. Confira os dados.`, { ic: 'copy' });
            return;
          }
          const a = b.dataset.wz;
          const i = Number(b.dataset.i);
          collect(el);
          if (a === 'g-add' && d.guardians.length < MAX_GUARDIANS) d.guardians.push(blankGuardian(d.guardians.length));
          else if (a === 'g-del') d.guardians.splice(i, 1);
          else if (a === 'k-add' && d.pickup.length < MAX_PICKUP) d.pickup.push(blankPickup());
          else if (a === 'k-del') d.pickup.splice(i, 1);
          draw(false);
          const target = a === 'g-add' ? UI.$(`#f-g${d.guardians.length - 1}-name`, body) : a === 'k-add' ? UI.$(`#f-k${d.pickup.length - 1}-name`, body) : null;
          if (target) {
            target.scrollIntoView({ block: 'center' });
            target.focus({ preventScroll: true });
          }
        });

        el.addEventListener('click', (e) => {
          if (e.target.closest('[data-wz-open]')) {
            const id = done.id;
            api.close();
            App.go('alunos/' + id);
          } else if (e.target.closest('[data-wz-again]')) {
            const classId = d.classId;
            api.close();
            Actions.matricular({ classId });
          }
        });

        draw();
      },
    });
    api.wrap.classList.add('al-dw');
    return api;
  };

  App.action({ id: 'matricular', label: 'Matricular aluno', icon: 'userPlus', order: 10, perm: 'alunos.cadastrar', keys: 'matrícula novo aluno cadastrar inscrição', run: () => Actions.matricular() });
})();
