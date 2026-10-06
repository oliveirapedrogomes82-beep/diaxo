'use strict';
/* Chamada: todos começam presentes; marque quem faltou e salve. Marcação no estilo gabarito (P / F / J). */
Pages.chamada = {
  title: 'Chamada',
  state() {
    const v = (View.chamada = View.chamada || {});
    v.drafts = v.drafts || {};
    const T = U.today();
    if (!v.date) v.date = Q.isSchoolDay(T) ? T : Q.lastSchoolDays(1, T)[0] || T;
    const cls = Q.classes().filter((c) => Q.roster(c.id).length);
    if (!v.classId || !cls.some((c) => c.id === v.classId)) {
      const pending = Q.pendingRolls(v.date);
      v.classId = (pending[0] || cls[0] || {}).id || '';
    }
    return v;
  },
  marks(v) {
    const key = Q.akey(v.classId, v.date);
    if (v.drafts[key]) return v.drafts[key];
    const saved = Q.roll(v.classId, v.date);
    const out = {};
    Q.roster(v.classId).forEach((a) => (out[a.id] = (saved && saved[a.id]) || 'P'));
    return out;
  },
  render() {
    const v = this.state();
    const cls = Q.classes().filter((c) => Q.roster(c.id).length);
    if (!cls.length)
      return `<div class="page-head"><div><h1>Chamada</h1></div></div><section class="card">${UI.empty({
        icon: 'checkSquare',
        title: 'Nenhuma turma com alunos',
        text: 'Crie uma turma e matricule os alunos para começar a fazer a chamada.',
        action: `<a class="btn primary" href="#turmas">Ir para turmas</a>`,
      })}</section>`;
    const c = Q.klass(v.classId);
    const kids = Q.roster(c.id);
    const marks = this.marks(v);
    const saved = Q.roll(c.id, v.date);
    const T = U.today();
    const holiday = Q.holiday(v.date);
    const wd = U.weekday(v.date);
    const s = Q.settings();

    return `
      <div class="page-head">
        <div><h1>Chamada</h1><p class="lead">Todos começam como presentes. Toque no nome de quem faltou (ou use as letras <b>P</b>, <b>F</b> e <b>J</b>) e depois salve.</p></div>
        <div class="date-nav" aria-label="Data da chamada">
          <button class="icon-btn" data-day="-1" aria-label="Dia letivo anterior">${icon('chevronLeft')}</button>
          <div class="label"><div>${U.esc(U.cap(U.fmtDateLong(v.date)))}</div><div class="small muted">${v.date === T ? 'hoje' : U.relDay(v.date)}</div></div>
          <button class="icon-btn" data-day="1" aria-label="Próximo dia letivo" ${v.date >= T ? 'disabled' : ''}>${icon('chevronRight')}</button>
          <input type="date" class="input" id="roll-date" value="${v.date}" max="${T}" aria-label="Escolher data" style="width:auto">
        </div>
      </div>

      <div class="class-strip" role="group" aria-label="Turmas">
        ${cls
          .map((x) => {
            const done = !!Q.roll(x.id, v.date);
            const draft = !!v.drafts[Q.akey(x.id, v.date)];
            return `<button type="button" class="chip" data-class="${x.id}" aria-pressed="${x.id === c.id}" title="${done ? 'Chamada registrada' : 'Sem chamada'}">
              <span class="state ${done ? 'done' : ''}">${done ? icon('check') : ''}</span>${U.esc(x.name)}${draft ? ' •' : ''}</button>`;
          })
          .join('')}
      </div>

      ${
        wd === 0 || wd === 6 || holiday
          ? `<div class="notice warn">${icon('alert')}<span class="grow">${holiday ? `Este dia é feriado (${U.esc(holiday)}).` : `Este dia é ${U.WEEKDAYS[wd]}.`} Normalmente não há aula. Você pode registrar mesmo assim, se houve atividade.</span></div>`
          : ''
      }

      <section class="card">
        <div class="card-head">
          <div><h2>${U.esc(c.name)} <span class="muted" style="font-weight:500">· ${U.esc(c.shift)}</span></h2>
          <span class="sub">${saved ? `${icon('checkCircle')} Chamada registrada. Se mudar algo, salve de novo.` : 'Esta chamada ainda não foi registrada.'}</span></div>
          <div class="btn-row"><button class="btn sm" data-all="P">${icon('check')}Todos presentes</button></div>
        </div>
        <ul class="roll" style="margin-top:10px">
          ${kids
            .map((a, i) => {
              const m = marks[a.id] || 'P';
              const att = Q.studentAttendance(a.id).rate;
              const low = att != null && att < s.minAttendance;
              return `<li class="${m}" data-sid="${a.id}">
                <span class="n">${i + 1}</span>
                <button type="button" class="who" data-toggle aria-label="${U.esc(a.name)}: ${m === 'P' ? 'presente' : m === 'F' ? 'falta' : 'falta justificada'}. Toque para alternar presença">
                  ${UI.avatar(a.name, 'sm')}<span style="min-width:0"><span class="person-name">${U.esc(a.name)}</span>
                  ${low ? `<span class="person-sub" style="color:var(--bad)">Frequência ${U.pct(att)}: abaixo do mínimo</span>` : ''}</span>
                </button>
                <div class="bubbles" role="radiogroup" aria-label="Presença de ${U.esc(U.firstName(a.name))}">
                  ${[['P', 'Presente'], ['F', 'Falta'], ['J', 'Falta justificada']].map(([k, l]) => `<button type="button" role="radio" class="bubble ${k}" data-mark="${k}" aria-checked="${m === k}" title="${l}" aria-label="${l}">${k}</button>`).join('')}
                </div>
              </li>`;
            })
            .join('')}
        </ul>
      </section>

      <div class="savebar" role="region" aria-label="Resumo da chamada">
        <div class="counts" id="roll-counts"></div>
        <button class="btn primary lg" data-save>${icon('check')}<span>Salvar chamada</span></button>
      </div>`;
  },

  mount(el) {
    const v = View.chamada;
    if (!v || !v.classId) return;
    const key = () => Q.akey(v.classId, v.date);
    const marks = () => v.drafts[key()] || (v.drafts[key()] = { ...this.marks(v) });
    const dirty = () => {
      const saved = Q.roll(v.classId, v.date);
      const d = v.drafts[key()];
      if (!saved) return true;
      if (!d) return false;
      return Object.keys(d).some((k) => d[k] !== saved[k]);
    };
    const paint = () => {
      const m = v.drafts[key()] || this.marks(v);
      const vals = Object.values(m);
      const p = vals.filter((x) => x === 'P').length;
      const f = vals.filter((x) => x === 'F').length;
      const j = vals.filter((x) => x === 'J').length;
      UI.$('#roll-counts', el).innerHTML = `<span><span class="dot-ok"></span><b>${p}</b> presentes</span><span><span class="dot-bad"></span><b>${f}</b> faltas</span><span><span class="dot-warn"></span><b>${j}</b> justificadas</span>`;
      const btn = UI.$('[data-save]', el);
      const isDirty = dirty();
      btn.disabled = !isDirty;
      btn.querySelector('span').textContent = isDirty ? (Q.roll(v.classId, v.date) ? 'Salvar alterações' : 'Salvar chamada') : 'Chamada salva';
    };
    const setMark = (li, mark) => {
      const sid = li.dataset.sid;
      marks()[sid] = mark;
      li.className = mark;
      UI.$$('.bubble', li).forEach((b) => b.setAttribute('aria-checked', String(b.dataset.mark === mark)));
      const who = UI.$('.who', li);
      const name = Q.student(sid).name;
      who.setAttribute('aria-label', `${name}: ${mark === 'P' ? 'presente' : mark === 'F' ? 'falta' : 'falta justificada'}. Toque para alternar presença`);
      paint();
    };
    const focusRow = (li) => li && UI.$('.who', li).focus();

    el.addEventListener('click', (e) => {
      const cb = e.target.closest('[data-class]');
      if (cb) {
        v.classId = cb.dataset.class;
        App.render();
        return;
      }
      const d = e.target.closest('[data-day]');
      if (d) {
        const dir = Number(d.dataset.day);
        let x = v.date;
        for (let i = 0; i < 15; i++) {
          x = U.addDays(x, dir);
          if (Q.isSchoolDay(x)) break;
        }
        if (x > U.today()) return;
        v.date = x;
        App.render();
        return;
      }
      const li = e.target.closest('li[data-sid]');
      const mk = e.target.closest('[data-mark]');
      if (li && mk) return setMark(li, mk.dataset.mark);
      if (li && e.target.closest('[data-toggle]')) return setMark(li, li.classList.contains('P') ? 'F' : 'P');
      const all = e.target.closest('[data-all]');
      if (all) {
        UI.$$('li[data-sid]', el).forEach((x) => setMark(x, 'P'));
        return;
      }
      if (e.target.closest('[data-save]')) {
        const c = Q.klass(v.classId);
        const m = { ...marks() };
        const f = Object.values(m).filter((x) => x === 'F').length;
        const was = !!Q.roll(v.classId, v.date);
        delete v.drafts[key()];
        Store.update((s) => (s.attendance[key()] = m), { log: `Chamada do ${c.name} ${was ? 'corrigida' : 'registrada'} (${U.fmtDate(v.date)})`, icon: 'checkSquare' });
        const next = Q.pendingRolls(v.date)[0];
        UI.toast(`Chamada do ${c.name} salva: ${U.plural(f, 'falta', 'faltas')}`, next ? { action: { label: `Próxima: ${next.name}`, fn: () => { v.classId = next.id; App.go('chamada'); } } } : {});
      }
    });

    el.addEventListener('keydown', (e) => {
      const li = e.target.closest && e.target.closest('li[data-sid]');
      if (!li) return;
      const k = e.key.toUpperCase();
      if (k === 'P' || k === 'F' || k === 'J') {
        e.preventDefault();
        setMark(li, k);
        focusRow(li.nextElementSibling);
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        focusRow(li.nextElementSibling);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        focusRow(li.previousElementSibling);
      }
    });

    UI.$('#roll-date', el).addEventListener('change', (e) => {
      if (!U.isValidDate(e.target.value) || e.target.value > U.today()) return;
      v.date = e.target.value;
      App.render();
    });
    paint();
  },
};
