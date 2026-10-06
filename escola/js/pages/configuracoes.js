'use strict';
/* Configurações: dados da escola, regras de avaliação e cobrança, disciplinas, aparência e backup. */
Pages.configuracoes = {
  title: 'Configurações',
  SETTINGS: [
    ['Escola', 'school', [
      { name: 'schoolName', label: 'Nome da escola', required: true, full: true },
      { name: 'year', label: 'Ano letivo', type: 'number', min: 2000, max: 2100, required: true },
      { name: 'term', label: 'Bimestre atual', type: 'select', options: [[1, '1º bimestre'], [2, '2º bimestre'], [3, '3º bimestre'], [4, '4º bimestre']], hint: 'É o bimestre que abre primeiro na tela de notas.' },
    ]],
    ['Avaliação e frequência', 'grade', [
      { name: 'passing', label: 'Média para aprovação', type: 'number', min: 0, max: 10, step: 0.5, required: true },
      { name: 'recovery', label: 'Nota mínima para recuperação', type: 'number', min: 0, max: 10, step: 0.5, required: true, hint: 'Abaixo disso o aluno é reprovado direto.' },
      { name: 'minAttendance', label: 'Frequência mínima (%)', type: 'number', min: 0, max: 100, required: true, hint: 'A LDB exige 75%.' },
    ]],
    ['Mensalidades', 'wallet', [
      { name: 'defaultFee', label: 'Mensalidade padrão', type: 'money', min: 0, hint: 'Usada nas novas matrículas.' },
      { name: 'dueDay', label: 'Dia de vencimento', type: 'number', min: 1, max: 28, required: true },
      { name: 'lateFine', label: 'Multa por atraso (%)', type: 'number', min: 0, max: 2, step: 0.5, hint: 'O Código de Defesa do Consumidor limita a 2%.' },
      { name: 'lateInterest', label: 'Juros ao mês (%)', type: 'number', min: 0, max: 10, step: 0.5 },
    ]],
  ],
  render() {
    const s = Q.settings();
    const theme = App.getTheme();
    return `
      <div class="page-head"><div><h1>Configurações</h1><p class="lead">As alterações são salvas assim que você sai do campo.</p></div><span class="saved-flag" id="cfg-flag" aria-live="polite"></span></div>
      <div class="settings-grid">
        <div class="stack">
          ${this.SETTINGS.map(
            ([title, ic, defs]) => `<section class="card"><div class="card-head"><h2>${icon(ic, 'muted')} ${title}</h2></div>
              <div class="card-body"><form class="form-grid" data-settings novalidate>${UI.fields(defs, s)}</form></div></section>`,
          ).join('')}
        </div>
        <div class="stack">
          <section class="card"><div class="card-head"><h2>${icon('book', 'muted')} Disciplinas</h2><button class="btn sm" data-x="add-subject">${icon('plus')}Adicionar</button></div>
            <div class="card-body" style="display:grid;gap:10px">
              <p class="small muted">A cor ajuda a reconhecer a disciplina no horário e nas notas. "Aulas" é a carga semanal sugerida para novas turmas.</p>
              ${Q.subjects()
                .map(
                  (x) => `<div class="subject-row" data-subj="${x.id}">
                  <button type="button" class="icon-btn sm" data-color-menu aria-label="Cor de ${U.esc(x.name)}" title="Trocar a cor"><span class="swatch c${x.color}" style="width:18px;height:18px;border-radius:5px"></span></button>
                  <input class="input" data-sname value="${U.esc(x.name)}" aria-label="Nome da disciplina">
                  <input class="input short num" data-sweekly type="number" min="0" max="10" value="${x.weekly || 0}" aria-label="Aulas por semana" title="Aulas por semana">
                  <button class="icon-btn sm" data-sdel aria-label="Excluir ${U.esc(x.name)}">${icon('trash')}</button>
                </div>`,
                )
                .join('')}
            </div></section>
          <section class="card"><div class="card-head"><h2>${icon('sun', 'muted')} Aparência</h2></div>
            <div class="card-body">${UI.seg([['system', 'Automático'], ['light', 'Claro'], ['dark', 'Escuro']], theme, 'data-theme-set')}
            <p class="small muted" style="margin-top:8px">Automático segue o tema do seu computador ou celular.</p></div></section>
          <section class="card"><div class="card-head"><h2>${icon('download', 'muted')} Seus dados</h2></div>
            <div class="card-body" style="display:grid;gap:14px">
              <p class="small muted">Tudo fica guardado neste navegador${Store.persistent ? '' : ' <b style="color:var(--bad)">(agora sem salvar: armazenamento bloqueado)</b>'}. Exporte um backup de vez em quando e guarde em local seguro. Para usar em outro computador, importe o arquivo lá.</p>
              <div class="btn-row">
                ${U.inFrame ? '' : `<button class="btn" data-x="export">${icon('download')}Baixar backup</button>`}
                <button class="btn" data-x="copy">${icon('copy')}Copiar backup</button>
                <button class="btn" data-x="import">${icon('upload')}Importar backup</button><input type="file" accept=".json,application/json" id="cfg-import" hidden>
              </div>
              <div class="btn-row" style="padding-top:12px;border-top:1px solid var(--line)">
                <button class="btn" data-x="demo">${icon('sparkles')}Carregar escola de exemplo</button>
                <button class="btn danger" data-x="wipe">${icon('trash')}Apagar tudo e começar do zero</button>
              </div>
            </div></section>
        </div>
      </div>`;
  },
  mount(el) {
    const flag = UI.$('#cfg-flag', el);
    const saved = () => (flag.innerHTML = `${icon('check')} Salvo às ${U.fmtTime(new Date())}`);
    const allDefs = this.SETTINGS.flatMap((x) => x[2]);

    UI.$$('form[data-settings]', el).forEach((form) => {
      const defs = this.SETTINGS.find((x) => UI.$(`#f-${x[2][0].name}`, form))[2];
      form.addEventListener('submit', (e) => e.preventDefault());
      form.addEventListener('change', () => {
        const d = UI.readForm(form, defs);
        if (!UI.validate(form, defs, d)) return;
        if (d.recovery != null && d.passing != null && d.recovery > d.passing) {
          UI.toast('A nota de recuperação não pode ser maior que a média de aprovação.', { tone: 'bad' });
          return;
        }
        Store.update(
          (s) => {
            Object.entries(d).forEach(([k, val]) => {
              const def = allDefs.find((x) => x.name === k);
              s.settings[k] = def.type === 'number' || def.type === 'money' || def.type === 'select' ? Number(val) || 0 : val;
            });
          },
          { silent: true },
        );
        App.chrome();
        saved();
      });
    });

    const subjEdit = (row, fn, rerender = false) => {
      const id = row.dataset.subj;
      Store.update((s) => fn(s.subjects.find((x) => x.id === id), s), { silent: !rerender });
      if (!rerender) saved();
    };
    el.addEventListener('change', (e) => {
      const row = e.target.closest('[data-subj]');
      if (!row) return;
      if (e.target.matches('[data-sname]')) {
        const name = e.target.value.trim();
        if (!name) return UI.toast('A disciplina precisa de um nome.', { tone: 'bad' });
        subjEdit(row, (x) => {
          x.name = name;
          x.short = name.length > 9 ? name.slice(0, 5) + '.' : name;
        });
      }
      if (e.target.matches('[data-sweekly]')) subjEdit(row, (x) => (x.weekly = U.clamp(Number(e.target.value) || 0, 0, 10)));
    });

    el.addEventListener('click', async (e) => {
      const cm = e.target.closest('[data-color-menu]');
      if (cm) {
        const row = cm.closest('[data-subj]');
        const cur = Q.subject(row.dataset.subj).color;
        const names = ['Azul', 'Laranja', 'Verde-água', 'Amarelo', 'Rosa', 'Verde', 'Roxo', 'Vermelho'];
        UI.menu(
          cm,
          names.map((label, i) => ({
            label,
            swatch: i + 1,
            checked: cur === i + 1,
            fn: () => {
              subjEdit(row, (x) => (x.color = i + 1));
              cm.querySelector('.swatch').className = `swatch c${i + 1}`;
            },
          })),
        );
        return;
      }
      const del = e.target.closest('[data-sdel]');
      if (del) {
        const row = del.closest('[data-subj]');
        const sub = Q.subject(row.dataset.subj);
        const used = Object.keys(Store.state.grades).filter((k) => k.split('|')[1] === sub.id).length;
        const ok = await UI.confirm({
          title: `Excluir ${U.esc(sub.name)}?`,
          text: used ? `Existem ${U.int(used)} notas lançadas nesta disciplina. Elas também serão apagadas.` : 'A disciplina sai de todas as turmas e do horário.',
          ok: 'Excluir disciplina',
          danger: true,
        });
        if (!ok) return;
        Store.update(
          (s) => {
            s.subjects = s.subjects.filter((x) => x.id !== sub.id);
            s.classes.forEach((c) => {
              delete c.subjects[sub.id];
              c.schedule = c.schedule.map((d) => d.map((x) => (x === sub.id ? '' : x)));
            });
            Object.keys(s.grades).forEach((k) => k.split('|')[1] === sub.id && delete s.grades[k]);
            s.teachers.forEach((t) => (t.subjectIds = t.subjectIds.filter((x) => x !== sub.id)));
          },
          { log: `Disciplina ${sub.name} excluída`, icon: 'trash', undo: true },
        );
        UI.undoToast(`${sub.name} excluída`);
        return;
      }
      const th = e.target.closest('[data-theme-set]');
      if (th) {
        App.setTheme(th.dataset.themeSet);
        UI.$$('[data-theme-set]', el).forEach((b) => b.setAttribute('aria-pressed', String(b === th)));
        return;
      }
      const x = e.target.closest('[data-x]');
      if (!x) return;
      const k = x.dataset.x;
      if (k === 'add-subject') {
        const id = 's' + U.uid();
        const used = new Set(Q.subjects().map((s) => s.color));
        const color = [1, 2, 3, 4, 5, 6, 7, 8].find((c) => !used.has(c)) || 1;
        Store.update((s) => {
          s.subjects.push({ id, name: 'Nova disciplina', short: 'Nova', color, weekly: 1 });
          s.classes.forEach((c) => (c.subjects[id] = null));
        });
        const inp = UI.$(`[data-subj="${id}"] [data-sname]`);
        if (inp) {
          inp.focus();
          inp.select();
        }
      } else if (k === 'export') {
        U.download(`backup-${U.slug(Q.settings().schoolName)}-${U.today()}.json`, Store.exportJSON(), 'application/json');
        UI.toast('Backup baixado');
      } else if (k === 'import') UI.$('#cfg-import', el).click();
      else if (k === 'copy') UI.copy(Store.exportJSON(), 'Backup copiado. Cole num arquivo de texto e guarde.');
      else if (k === 'demo') {
        const ok = await UI.confirm({ title: 'Carregar a escola de exemplo?', text: 'Todos os dados atuais serão substituídos por uma escola fictícia. Faça um backup antes, se precisar.', ok: 'Carregar exemplo', danger: true });
        if (ok) {
          Store.replace(Seed.demo());
          App.go('painel');
          UI.toast('Escola de exemplo carregada', { ic: 'sparkles' });
        }
      } else if (k === 'wipe') {
        const ok = await UI.confirm({ title: 'Apagar todos os dados?', text: 'Alunos, turmas, notas, frequência, cobranças e agenda serão apagados deste navegador. Não dá para desfazer.', ok: 'Apagar tudo', danger: true, requireText: 'APAGAR' });
        if (ok) {
          const fresh = Seed.empty();
          Store.replace(fresh);
          App.go('painel');
          UI.toast('Tudo apagado. Vamos começar!');
        }
      }
    });

    UI.$('#cfg-import', el).addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async () => {
        let data = null;
        try {
          data = Store.validate(JSON.parse(reader.result));
        } catch (err) {
          data = null;
        }
        e.target.value = '';
        if (!data) return UI.toast('Este arquivo não é um backup da Caderneta. Confira se escolheu o arquivo certo.', { tone: 'bad', ms: 6000 });
        const ok = await UI.confirm({
          title: 'Importar este backup?',
          text: `Backup de <b>${U.esc(data.settings.schoolName)}</b> com ${U.plural(data.students.length, 'aluno', 'alunos')} e ${U.plural((data.classes || []).length, 'turma', 'turmas')}. Os dados atuais serão substituídos.`,
          ok: 'Importar',
        });
        if (!ok) return;
        Store.replace(data);
        App.go('painel');
        UI.toast('Backup importado com sucesso');
      };
      reader.readAsText(file);
    });
  },
};
