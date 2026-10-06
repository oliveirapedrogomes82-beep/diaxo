'use strict';
/* Matrícula em passos curtos: aluno → responsável → turma → mensalidade → revisão. */
Actions.matricular = (opts = {}) => {
  if (!Store.state.classes.length) {
    UI.confirm({ title: 'Crie uma turma primeiro', text: 'Todo aluno precisa estar em uma turma. Quer criar a primeira agora?', ok: 'Criar turma' }).then((ok) => ok && Actions.novaTurma());
    return;
  }
  const s = Q.settings();
  const data = {
    name: '', birth: '', gender: 'F', cpf: '', health: '',
    guardian: { name: '', relation: 'Mãe', phone: '', email: '' }, address: '',
    classId: opts.classId || '', fee: s.defaultFee, discount: 0, genInvoices: s.defaultFee > 0,
  };
  const STEPS = ['Aluno', 'Responsável', 'Turma', 'Mensalidade', 'Revisão'];
  let step = 0;

  const remainingMonths = () => {
    const cur = U.today().slice(0, 7);
    const out = [];
    const end = `${s.year}-12`;
    for (let m = cur < `${s.year}-01` ? `${s.year}-01` : cur; m <= end; m = U.addMonths(m, 1)) out.push(m);
    return out;
  };
  const net = () => Math.round((Number(data.fee) || 0) * (1 - (Number(data.discount) || 0) / 100) * 100) / 100;

  const defsFor = (i) => {
    if (i === 0) return StudentForm.student();
    if (i === 1) return StudentForm.guardian();
    if (i === 3) return [...StudentForm.finance()];
    return [];
  };

  const bodyFor = (i) => {
    if (i === 0 || i === 1) return `<form class="form-grid" novalidate>${UI.fields(defsFor(i), data)}</form>`;
    if (i === 2) {
      const cls = Q.classes();
      return `<p class="muted" style="margin-bottom:14px">Escolha a turma de ${U.esc(U.firstName(data.name) || 'aluno')}. O número mostra quantas vagas ainda restam.</p>
        <div class="pick-grid" role="radiogroup" aria-label="Turma">${cls
          .map((c) => {
            const n = Q.roster(c.id).length;
            const free = (c.capacity || 0) - n;
            return `<label class="pick"><input type="radio" name="classId" value="${c.id}" ${data.classId === c.id ? 'checked' : ''}>
              <strong>${U.esc(c.name)}</strong><span>${U.esc(c.shift)}${c.room ? ' · ' + U.esc(c.room) : ''}</span>
              <span>${c.capacity ? (free > 0 ? `<b style="color:var(--ok)">${U.plural(free, 'vaga', 'vagas')}</b>` : '<b style="color:var(--bad)">Turma cheia</b>') : `${n} alunos`}</span></label>`;
          })
          .join('')}</div><p class="error small" id="cls-err" role="alert" hidden style="color:var(--bad);margin-top:10px;font-weight:600">Escolha uma turma para continuar.</p>`;
    }
    if (i === 3) {
      const months = remainingMonths();
      return `<form class="form-grid" novalidate>${UI.fields(defsFor(3), data)}
        <div class="full chips" aria-label="Descontos comuns">${[0, 5, 10, 20, 50, 100].map((d) => `<button type="button" class="chip" data-disc="${d}" aria-pressed="${Number(data.discount) === d}">${d === 0 ? 'Sem desconto' : d === 100 ? 'Bolsa integral' : d + '%'}</button>`).join('')}</div>
        <div class="full notice">${icon('wallet')}<span class="grow">Valor mensal: <b id="net-fee">${U.money(net())}</b></span></div>
        ${UI.field({ name: 'genInvoices', type: 'checkbox', full: true, label: `Gerar as mensalidades de ${months.length ? U.monthName(months[0]) : ''} a dezembro (${months.length})`, hint: `Vencimento todo dia ${s.dueDay}. Você pode ajustar cada cobrança depois.` }, data)}
      </form>`;
    }
    const c = Q.klass(data.classId);
    const months = data.genInvoices ? remainingMonths().length : 0;
    return `<p class="muted" style="margin-bottom:16px">Confira os dados. Se algo estiver errado, volte e corrija.</p>
      <dl class="summary">
        <dt>Aluno</dt><dd>${U.esc(data.name)}</dd>
        <dt>Nascimento</dt><dd>${U.fmtDate(data.birth)} (${U.age(data.birth)} anos)</dd>
        <dt>Responsável</dt><dd>${U.esc(data.guardian.name)} · ${U.esc(data.guardian.relation)}</dd>
        <dt>Contato</dt><dd>${U.esc(data.guardian.phone)}${data.guardian.email ? ' · ' + U.esc(data.guardian.email) : ''}</dd>
        <dt>Turma</dt><dd>${U.esc(c ? `${c.name} · ${c.shift}` : '—')}</dd>
        <dt>Mensalidade</dt><dd>${U.money(net())}${Number(data.discount) ? ` (${data.discount}% de desconto)` : ''}</dd>
        <dt>Cobranças</dt><dd>${months ? `${U.plural(months, 'mensalidade será gerada', 'mensalidades serão geradas')}` : 'Nenhuma agora'}</dd>
        ${data.health ? `<dt>Saúde</dt><dd>${U.esc(data.health)}</dd>` : ''}
        <dt>Matrícula nº</dt><dd class="num">${Q.enrollmentNo()}</dd>
      </dl>`;
  };

  const stepsHTML = () =>
    `<div class="steps" aria-label="Etapas">${STEPS.map((l, i) => `<span class="step ${i === step ? 'current' : i < step ? 'done' : ''}" ${i === step ? 'aria-current="step"' : ''}><b>${i < step ? '✓' : i + 1}</b>${l}</span>`).join('')}</div>`;

  const m = UI.modal({
    title: 'Matricular aluno',
    sub: 'Leva cerca de um minuto. Campos com * são obrigatórios.',
    size: 'lg',
    top: '<div data-steps></div>',
    body: '',
    foot: `<button class="btn left" data-back>${icon('arrowLeft')}Voltar</button><button class="btn" data-close>Cancelar</button><button class="btn primary" data-next></button>`,
    onMount(el, api) {
      const body = UI.$('.modal-body', el);
      const back = UI.$('[data-back]', el);
      const next = UI.$('[data-next]', el);
      UI.bindMasks(body);

      const collect = () => {
        const defs = defsFor(step);
        const form = UI.$('form', body);
        if (step === 2) {
          const sel = UI.$('input[name="classId"]:checked', body);
          data.classId = sel ? sel.value : '';
          return true;
        }
        if (!form) return true;
        const d = UI.readForm(form, defs);
        if (step === 0) Object.assign(data, d);
        if (step === 1) {
          data.guardian = { ...data.guardian, ...d.guardian };
          data.address = d.address;
        }
        if (step === 3) {
          data.fee = d.fee ?? 0;
          data.discount = Number(d.discount) || 0;
          const cb = UI.$('#f-genInvoices', body);
          data.genInvoices = cb ? cb.checked : false;
        }
        return d;
      };
      const valid = () => {
        if (step === 2) {
          const ok = !!UI.$('input[name="classId"]:checked', body);
          UI.$('#cls-err', body).hidden = ok;
          return ok;
        }
        const form = UI.$('form', body);
        if (!form) return true;
        const d = UI.readForm(form, defsFor(step));
        return UI.validate(form, defsFor(step), d);
      };
      const draw = () => {
        UI.$('[data-steps]', el).innerHTML = stepsHTML();
        body.innerHTML = bodyFor(step);
        back.style.visibility = step ? 'visible' : 'hidden';
        next.innerHTML = step === STEPS.length - 1 ? `${icon('check')}Confirmar matrícula` : `Continuar${icon('arrowRight')}`;
        const f = UI.$('input:not([type="radio"]):not([type="checkbox"]), select', body) || UI.$('input', body);
        f && f.focus({ preventScroll: true });
        body.scrollTop = 0;
      };
      body.addEventListener('click', (e) => {
        const d = e.target.closest('[data-disc]');
        if (!d) return;
        UI.$('#f-discount', body).value = d.dataset.disc;
        UI.$$('[data-disc]', body).forEach((b) => b.setAttribute('aria-pressed', String(b === d)));
        collect();
        UI.$('#net-fee', body).textContent = U.money(net());
      });
      body.addEventListener('input', () => {
        if (step === 3) {
          collect();
          const n = UI.$('#net-fee', body);
          if (n) n.textContent = U.money(net());
        }
      });
      body.addEventListener('change', (e) => {
        if (step === 2 && e.target.name === 'classId') UI.$('#cls-err', body).hidden = true;
      });
      body.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && e.target.tagName === 'INPUT' && e.target.type !== 'checkbox') {
          e.preventDefault();
          next.click();
        }
      });
      back.addEventListener('click', () => {
        collect();
        step = Math.max(0, step - 1);
        draw();
      });
      next.addEventListener('click', () => {
        if (step < STEPS.length - 1) {
          if (!valid()) return;
          collect();
          step++;
          draw();
          return;
        }
        finish(api);
      });
      draw();
    },
  });

  const finish = (api) => {
    const id = 'a' + U.uid();
    let created;
    Store.update(
      (st) => {
        const enrollment = Q.enrollmentNo();
        created = {
          id, enrollment, name: data.name, birth: data.birth, gender: data.gender, cpf: data.cpf, classId: data.classId, status: 'ativo',
          guardian: data.guardian, address: data.address, health: data.health, notes: '', fee: Number(data.fee) || 0, discount: Number(data.discount) || 0,
          joinedAt: U.today(),
        };
        st.students.push(created);
        st.settings.nextSeq++;
        if (data.genInvoices && net() > 0) {
          remainingMonths().forEach((m) =>
            st.invoices.push({ id: 'f' + U.uid(), studentId: id, month: m, description: `Mensalidade de ${U.monthName(m)}`, amount: net(), due: `${m}-${U.pad(st.settings.dueDay)}`, paidAt: null, method: null }),
          );
        }
      },
      { log: `${U.shortName(data.name)} matriculado no ${Q.klass(data.classId)?.name}`, icon: 'userPlus' },
    );
    api.close();
    UI.toast(`${U.firstName(data.name)} foi matriculado no ${Q.klass(data.classId)?.name}`, { action: { label: 'Ver ficha', fn: () => App.go('alunos/' + id) } });
  };
  return m;
};
