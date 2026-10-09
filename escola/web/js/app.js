'use strict';
/* Casca do app: entrada (instalação, login, código de acesso, aviso de privacidade), navegação filtrada por
   permissão, registro de telas, busca rápida (Ctrl+K), menu "Novo", conta do usuário, "ver como" e tema.

   Os módulos se registram sem editar este arquivo:
     App.page({id, label, icon, group, order, perm|anyPerm|when, family, tab, badge, title, render(rest), mount(el, rest)})
     App.studentTab({id, label, order, perm|anyPerm|when(student), family, render(student), mount(el, student)})
     App.widget({id, order, size: full|half|third, perm|anyPerm|when, family, render(), mount(el)})
     App.action({id, label, icon, order, perm|anyPerm|when, family, keys, run()})       → menu "Novo" e busca
     App.searchProvider((query) => [{group, label, icon|avatar, meta, run}])
   family: true = só no Portal da família; 'both' = nos dois; omitido = só equipe. */
const App = (() => {
  const GROUPS = ['Dia a dia', 'Alunos e turmas', 'Comunicação', 'Gestão'];
  const FAMILY_GROUPS = ['Portal da família'];
  const REDIRECTS = { professores: 'equipe', matricula: 'alunos', eventos: 'calendario' };

  const pages = new Map();
  const studentTabs = [];
  const widgets = [];
  const actions = [];
  const providers = [];

  // ---------- registro ----------
  const page = (def) => {
    const k = (def.family === true ? 'f:' : 'e:') + def.id;
    pages.set(k, { nav: true, order: 50, group: def.family === true ? FAMILY_GROUPS[0] : 'Dia a dia', ...def });
    if (def.family === 'both') pages.set('f:' + def.id, pages.get(k));
  };
  const studentTab = (def) => studentTabs.push({ order: 50, ...def });
  const widget = (def) => widgets.push({ order: 50, size: 'half', ...def });
  const action = (def) => actions.push({ order: 50, ...def });
  const searchProvider = (fn) => providers.push(fn);

  /** A definição vale para quem está usando agora (modo e permissões)? */
  const allowed = (def, ...args) => {
    if (!def || !Store.me) return false;
    const fam = Store.family;
    if (fam && !(def.family === true || def.family === 'both')) return false;
    if (!fam && def.family === true) return false;
    if (def.perm && !Store.can(def.perm)) return false;
    if (def.anyPerm && !Store.canAny(...def.anyPerm)) return false;
    if (def.when) {
      try {
        if (!def.when(...args)) return false;
      } catch (e) {
        return false;
      }
    }
    return true;
  };
  const sortDefs = (a, b) => a.order - b.order || String(a.label || a.id).localeCompare(String(b.label || b.id));
  const findPage = (id) => pages.get((Store.family ? 'f:' : 'e:') + id) || null;
  const visiblePages = () => [...pages.entries()].filter(([k, p]) => k.startsWith(Store.family ? 'f:' : 'e:') && allowed(p)).map(([, p]) => p).sort(sortDefs);
  const homeId = () => {
    const list = visiblePages();
    const home = list.find((p) => p.id === (Store.family ? 'inicio' : 'painel'));
    return (home || list[0] || { id: 'painel' }).id;
  };
  /** nav: false esconde do menu (a rota continua valendo); nav: () => boolean decide na hora. */
  const inNav = (p) => p.nav !== false && (typeof p.nav !== 'function' || !!p.nav());
  const allowedStudentTabs = (s) => studentTabs.filter((t) => allowed(t, s)).sort(sortDefs);
  const allowedWidgets = () => widgets.filter((w) => allowed(w)).sort(sortDefs);
  const allowedActions = () => actions.filter((a) => allowed(a)).sort(sortDefs);

  // ---------- elementos ----------
  const $ = (id) => document.getElementById(id);
  const main = () => $('main');
  const screenEl = () => $('screen');
  const appEl = () => $('app');
  let current = '';
  let lastWidth = window.innerWidth;
  let sessionInfo = null;
  let started = false;

  const route = () => {
    const h = decodeURIComponent(location.hash.replace(/^#\/?/, ''));
    return h ? h.split('/') : [homeId()];
  };
  const go = (path) => {
    if (route().join('/') === path) render();
    else location.hash = path;
  };

  // =====================================================================
  // Telas de entrada
  // =====================================================================
  const brandBlock = (school) => html`<div class="auth-brand"><span class="brand-mark" aria-hidden="true"></span><div><strong>Caderneta Escolar</strong>${school ? html`<span>${school}</span>` : ''}</div></div>`;
  const showScreen = (content, { wide = false } = {}) => {
    UI.closeAll();
    appEl().hidden = true;
    const el = screenEl();
    el.hidden = false;
    UI.setHTML(el, html`<div class="auth ${wide ? 'wide' : ''}"><div class="auth-card">${content}</div><p class="auth-foot">${Api.isLocal ? 'Demonstração · os dados ficam só neste navegador' : 'Caderneta Escolar'}</p></div>`);
    const first = el.querySelector('[autofocus]') || el.querySelector('input, button');
    first && first.focus();
    return el;
  };
  const formError = (el, err) => {
    const box = el.querySelector('[data-error]');
    if (!box) return UI.errorToast(err);
    UI.setHTML(box, html`${icon('alert')}<span>${err.message || 'Algo deu errado.'}</span>`);
    box.hidden = false;
  };
  const busyBtn = (btn, on, label) => {
    if (!btn) return;
    btn.disabled = on;
    btn.classList.toggle('loading', on);
    if (label) UI.setHTML(btn, label);
  };

  const loadingScreen = (text = 'Carregando…') => showScreen(html`<div class="center stack" style="gap:14px;padding:30px 0">${UI.spinner()}<p class="muted">${text}</p></div>`);

  const offlineScreen = (err) => {
    const el = showScreen(html`${brandBlock()}
      <h1>Sem conexão com o servidor</h1>
      <p class="muted">${err && err.code !== 'network' ? err.message : 'Não foi possível falar com o servidor da escola. Confira a internet ou se o servidor está ligado.'}</p>
      <button type="button" class="btn primary block" data-retry autofocus>${icon('refresh')}Tentar de novo</button>`);
    el.querySelector('[data-retry]').addEventListener('click', () => boot());
  };

  const setupScreen = () => {
    const el = showScreen(
      html`${brandBlock()}
      <h1>Instalação da escola</h1>
      <p class="muted">Crie a conta titular (a pessoa responsável pelo sistema, em geral a direção). Ela poderá criar as contas da equipe e definir o que cada um acessa.</p>
      <form class="stack" novalidate>
        <div class="notice" data-error hidden></div>
        <div class="field"><label for="st-token">Código de instalação</label><input id="st-token" class="input" autocomplete="off" required autofocus><span class="hint">Aparece no terminal do servidor e no arquivo <code>setup-token.txt</code> da pasta de dados.</span></div>
        <div class="field"><label for="st-school">Nome da escola</label><input id="st-school" class="input" maxlength="120" required></div>
        <div class="field"><label for="st-name">Seu nome completo</label><input id="st-name" class="input" autocomplete="name" maxlength="120" required></div>
        <div class="form-grid"><div class="field"><label for="st-email">E-mail</label><input id="st-email" class="input" type="email" autocomplete="email" required></div>
        <div class="field"><label for="st-phone">Celular</label><input id="st-phone" class="input" type="tel" inputmode="tel" data-mask="phone" autocomplete="tel"></div></div>
        <div class="form-grid"><div class="field"><label for="st-pass">Senha</label><input id="st-pass" class="input" type="password" autocomplete="new-password" required><span class="hint">Pelo menos 8 caracteres, difícil de adivinhar.</span></div>
        <div class="field"><label for="st-pass2">Repita a senha</label><input id="st-pass2" class="input" type="password" autocomplete="new-password" required></div></div>
        <button type="submit" class="btn primary block">${icon('check')}Concluir instalação</button>
      </form>`,
      { wide: true },
    );
    const form = el.querySelector('form');
    UI.bindMasks(form);
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const v = (id) => el.querySelector('#' + id).value.trim();
      if (el.querySelector('#st-pass').value !== el.querySelector('#st-pass2').value) return formError(el, { message: 'As senhas não são iguais.' });
      const btn = form.querySelector('[type=submit]');
      busyBtn(btn, true);
      try {
        await Api.setup({ token: v('st-token'), schoolName: v('st-school'), name: v('st-name'), email: v('st-email'), phone: v('st-phone'), password: el.querySelector('#st-pass').value });
        await boot();
      } catch (err) {
        formError(el, err);
      } finally {
        busyBtn(btn, false);
      }
    });
  };

  /** Dados da versão anterior (guardados no navegador): nunca apagados, sempre oferecidos para baixar. */
  const V1_KEY = 'caderneta.escola.v1';
  const v1Data = () => {
    try {
      const raw = localStorage.getItem(V1_KEY);
      if (!raw) return null;
      const d = JSON.parse(raw);
      return d && Array.isArray(d.students) ? d : null;
    } catch (e) {
      return null;
    }
  };
  const downloadV1 = () => {
    const d = v1Data();
    if (!d) return;
    U.download(`caderneta-versao-anterior-${U.today()}.json`, JSON.stringify({ app: 'caderneta-escolar', exportedAt: new Date().toISOString(), data: d }), 'application/json');
    UI.toast('Arquivo baixado. Importe na Caderneta da escola pela conta titular.', { ic: 'download', ms: 7000 });
  };

  const loginScreen = (info = sessionInfo || {}) => {
    const school = (info.school && info.school.name) || '';
    const accounts = info.accounts || [];
    const ROLE_HINT = {
      diretor: 'vê e gerencia tudo, cria contas e define acessos',
      coordenador: 'turmas, chamada, notas, agenda e aprovações',
      secretaria: 'matrículas, fichas, famílias e documentos',
      professor: 'só as próprias turmas: chamada, notas e agenda',
      auxiliar: 'apoio na turma: agenda e rotina',
      psicologo: 'atendimentos sigilosos e planos de apoio',
      financeiro: 'mensalidades, recebimentos e relatórios',
      responsavel: 'Portal da família: agenda, recados, notas e mensalidades',
    };
    const el = showScreen(
      html`${brandBlock(school)}
      <h1>Entrar</h1>
      <form class="stack" novalidate>
        <div class="notice bad" data-error hidden></div>
        <div class="field"><label for="lg-login">E-mail ou celular</label><input id="lg-login" class="input" autocomplete="username" required autofocus maxlength="160"></div>
        <div class="field"><label for="lg-pass">Senha</label><div class="input-group"><input id="lg-pass" class="input" type="password" autocomplete="current-password" required><button type="button" class="icon-btn" data-show-pass aria-label="Mostrar senha">${icon('eye')}</button></div></div>
        <button type="submit" class="btn primary block">Entrar</button>
      </form>
      <div class="auth-links"><a href="#acesso">Tenho um código de acesso</a><button type="button" class="link" data-forgot>Esqueci minha senha</button></div>
      ${v1Data() ? html`<div class="notice warn">${icon('download')}<span class="grow"><b>Há dados da versão anterior neste navegador.</b> Baixe o arquivo e importe na Caderneta da escola (Configurações → Backup e dados → Importar, pela conta titular). Nada é apagado.</span><button type="button" class="btn sm" data-v1-download>Baixar dados</button></div>` : ''}
      ${accounts.length
        ? html`<div class="demo-accounts"><h2>${icon('sparkles')}Demonstração: entrar como…</h2><p class="small muted">Cada pessoa vê só o que o cargo e os acessos permitem.</p>
          <div class="account-list">${accounts.map(
            (a) => html`<button type="button" class="account-btn" data-as="${a.id}">${UI.avatar(a.name, 'sm')}<span class="grow"><b>${a.name}</b><span>${a.title || Q.roleLabel(a.role)}${/infantil/i.test(a.title || '') ? html` · só a própria turma: chamada, rotina do dia, pareceres e agenda` : ROLE_HINT[a.role] ? html` · ${ROLE_HINT[a.role]}` : ''}</span></span>${icon('chevronRight')}</button>`,
          )}</div>
          ${Api.isLocal ? html`<button type="button" class="btn ghost sm" data-reset-demo>${icon('refresh')}Recomeçar a demonstração</button>` : ''}</div>`
        : ''}`,
      { wide: accounts.length > 0 },
    );
    const form = el.querySelector('form');
    const v1Btn = el.querySelector('[data-v1-download]');
    v1Btn && v1Btn.addEventListener('click', downloadV1);
    el.querySelector('[data-show-pass]').addEventListener('click', (e) => {
      const input = el.querySelector('#lg-pass');
      input.type = input.type === 'password' ? 'text' : 'password';
      UI.setHTML(e.currentTarget, icon(input.type === 'password' ? 'eye' : 'eyeOff'));
    });
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = form.querySelector('[type=submit]');
      busyBtn(btn, true);
      try {
        await Api.login(el.querySelector('#lg-login').value.trim(), el.querySelector('#lg-pass').value);
        await boot();
      } catch (err) {
        formError(el, err);
        el.querySelector('#lg-pass').select();
      } finally {
        busyBtn(btn, false);
      }
    });
    el.querySelector('[data-forgot]').addEventListener('click', () =>
      UI.modal({
        title: 'Esqueci minha senha',
        size: 'sm',
        body: html`<p>Por segurança, a senha é refeita com um <b>código de acesso</b>.</p><ul class="items small" style="margin-top:10px"><li>${icon('users')}<span class="grow"><b>Famílias e equipe:</b> peça um novo código à secretaria ou à direção da escola.</span></li><li>${icon('key')}<span class="grow">Com o código em mãos, toque em <b>Tenho um código de acesso</b> e crie a nova senha.</span></li><li>${icon('shield')}<span class="grow"><b>Conta titular:</b> quem cuida do servidor pode gerar o código com <code>--reset-owner-password</code>.</span></li></ul>`,
        foot: html`<button type="button" class="btn primary" data-close>Entendi</button>`,
      }),
    );
    el.querySelectorAll('[data-as]').forEach((b) =>
      b.addEventListener('click', async () => {
        busyBtn(b, true);
        try {
          await Api.demoLoginAs(b.dataset.as);
          await boot();
        } catch (err) {
          UI.errorToast(err);
          busyBtn(b, false);
        }
      }),
    );
    const reset = el.querySelector('[data-reset-demo]');
    reset &&
      reset.addEventListener('click', async () => {
        if (!(await UI.confirm({ title: 'Recomeçar a demonstração?', text: 'Tudo o que foi feito neste navegador será apagado e a escola de exemplo volta ao início.', ok: 'Recomeçar', danger: true }))) return;
        await Api.resetDemo();
        location.hash = '';
        await boot();
      });
  };

  /** Aviso de privacidade (LGPD) montado com os dados da escola. */
  const privacyNotice = (privacy = {}, school = '') => {
    const controller = privacy.controller || school || 'a escola';
    return html`<div class="privacy-text">
      <p><b>${controller}</b> é a responsável (controladora) pelos dados tratados nesta Caderneta.</p>
      <p><b>Quais dados:</b> nome e contatos dos responsáveis; dados escolares do aluno (turma, frequência, notas, agenda, ocorrências, rotina); informações de saúde e de autorização de saída que a família fornecer; mensagens trocadas com a escola; mensalidades, quando houver.</p>
      <p><b>Para quê:</b> cumprir o contrato de prestação de serviços educacionais e as obrigações legais da escola, acompanhar a vida escolar do aluno e manter a comunicação entre escola e família. Dados de saúde são usados só para proteger o aluno.</p>
      <p><b>Quem vê:</b> cada pessoa da equipe vê só o necessário para a sua função (por exemplo, o professor vê as próprias turmas). Registros de atendimento psicológico e psicopedagógico são sigilosos. Os dados não são vendidos nem usados para publicidade.</p>
      <p><b>Seus direitos:</b> você pode pedir acesso, correção, informação sobre compartilhamento e, quando cabível, eliminação dos dados (Lei 13.709/2018, art. 18).${privacy.dpoName || privacy.dpoContact ? html` Fale com <b>${privacy.dpoName || 'o encarregado de dados'}</b>${privacy.dpoContact ? html` (${privacy.dpoContact})` : ''}.` : ''}</p>
      <p><b>Segurança:</b> acesso por senha pessoal; registro de quem acessou informações sigilosas; cópias de segurança cifradas.</p>
    </div>`;
  };

  const codeScreen = (prefill = '') => {
    const el = showScreen(html`${brandBlock()}
      <h1>Código de acesso</h1>
      <p class="muted">Digite o código que a escola enviou para você. Com ele você cria a sua senha.</p>
      <form class="stack" novalidate data-step="check">
        <div class="notice bad" data-error hidden></div>
        <div class="field"><label for="cd-code">Código</label><input id="cd-code" class="input code-input" autocomplete="one-time-code" placeholder="XXXXX-XXXXX" maxlength="11" value="${prefill}" required autofocus></div>
        <button type="submit" class="btn primary block">Continuar</button>
      </form>
      <div class="auth-links"><a href="#">Voltar para a entrada</a></div>`);
    const form = el.querySelector('form');
    const codeInput = el.querySelector('#cd-code');
    codeInput.addEventListener('input', () => {
      const c = codeInput.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10);
      codeInput.value = c.length > 5 ? c.slice(0, 5) + '-' + c.slice(5) : c;
    });
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = form.querySelector('[type=submit]');
      busyBtn(btn, true);
      try {
        const info = await Api.inviteCheck(codeInput.value);
        passwordStep(codeInput.value, info);
      } catch (err) {
        formError(el, err);
      } finally {
        busyBtn(btn, false);
      }
    });
    if (prefill.replace(/[^A-Z0-9]/gi, '').length === 10) form.requestSubmit();
  };
  const passwordStep = (code, info) => {
    const reset = info.purpose === 'redefinicao';
    const el = showScreen(
      html`${brandBlock(info.school)}
      <h1>Olá, ${info.name}!</h1>
      <p class="muted">${reset ? 'Crie uma nova senha.' : 'Crie a sua senha para entrar.'} Depois, entre com <b>${info.login || 'o seu e-mail ou celular'}</b> e esta senha.</p>
      <form class="stack" novalidate>
        <div class="notice bad" data-error hidden></div>
        <div class="form-grid"><div class="field"><label for="cd-pass">Nova senha</label><input id="cd-pass" class="input" type="password" autocomplete="new-password" required autofocus><span class="hint">Pelo menos 8 caracteres. Evite datas e nomes.</span></div>
        <div class="field"><label for="cd-pass2">Repita a senha</label><input id="cd-pass2" class="input" type="password" autocomplete="new-password" required></div></div>
        ${info.family
          ? html`<details class="privacy" open><summary>Aviso de privacidade</summary>${privacyNotice(info.privacy, info.school)}</details>
            <label class="check"><input type="checkbox" id="cd-consent"><span>Li o aviso de privacidade e estou ciente de como a escola trata os dados.</span></label>`
          : ''}
        <button type="submit" class="btn primary block">${icon('check')}${reset ? 'Salvar nova senha' : 'Criar senha e entrar'}</button>
      </form>`,
      { wide: !!info.family },
    );
    const form = el.querySelector('form');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const p1 = el.querySelector('#cd-pass').value;
      if (p1 !== el.querySelector('#cd-pass2').value) return formError(el, { message: 'As senhas não são iguais.' });
      const consent = el.querySelector('#cd-consent');
      if (consent && !consent.checked) return formError(el, { message: 'Para continuar, marque que leu o aviso de privacidade.' });
      const btn = form.querySelector('[type=submit]');
      busyBtn(btn, true);
      try {
        await Api.inviteAccept(code, p1, consent ? consent.checked : false);
        location.hash = '';
        await boot();
      } catch (err) {
        formError(el, err);
      } finally {
        busyBtn(btn, false);
      }
    });
  };

  const consentScreen = (info) => {
    const el = showScreen(
      html`${brandBlock(info.school && info.school.name)}
      <h1>Aviso de privacidade</h1>
      <p class="muted">${info.consent.at ? 'O aviso foi atualizado. Leia a nova versão para continuar.' : 'Antes de começar, leia como a escola cuida dos dados da sua família.'}</p>
      ${privacyNotice((Store.state && Store.state.settings.privacy) || (info.school && info.school.privacy) || {}, info.school && info.school.name)}
      <div class="notice bad" data-error hidden></div>
      <div class="btn-row"><button type="button" class="btn" data-logout>Sair</button><button type="button" class="btn primary grow" data-accept autofocus>${icon('check')}Li e estou ciente</button></div>`,
      { wide: true },
    );
    el.querySelector('[data-accept]').addEventListener('click', async (e) => {
      busyBtn(e.currentTarget, true);
      try {
        await Api.consent(info.consent.version);
        await boot();
      } catch (err) {
        formError(el, err);
        busyBtn(e.currentTarget, false);
      }
    });
    el.querySelector('[data-logout]').addEventListener('click', logout);
  };

  // =====================================================================
  // Fluxo de entrada
  // =====================================================================
  const boot = async () => {
    const r = route();
    if (r[0] === 'acesso' && !Store.ready) return codeScreen(r[1] || '');
    loadingScreen();
    let info;
    try {
      await Api.health();
      info = await Api.session();
    } catch (err) {
      return offlineScreen(err);
    }
    sessionInfo = info;
    if (info.needsSetup) return setupScreen();
    if (!info.authenticated) {
      Store.clear();
      return loginScreen(info);
    }
    if (info.consent && info.consent.required) {
      info.school = info.school || {};
      return consentScreen(info);
    }
    try {
      await Store.load();
    } catch (err) {
      if (err.status === 401) return loginScreen(await Api.session().catch(() => ({})));
      return offlineScreen(err);
    }
    enterApp();
  };

  const enterApp = () => {
    screenEl().hidden = true;
    UI.setHTML(screenEl(), '');
    appEl().hidden = false;
    Store.startPolling();
    if (route()[0] === 'acesso') history.replaceState(null, '', location.pathname + location.search);
    current = '';
    render();
  };

  const logout = async (all = false) => {
    try {
      await (all === true ? Api.logoutAll() : Api.logout());
    } catch (e) {
      /* sai mesmo assim */
    }
    Store.clear();
    UI.closeAll();
    // recarrega a página: nenhuma tela, cache de módulo ou dado da conta anterior fica na memória
    location.replace(location.pathname + location.search);
  };

  /** Sessão venceu no meio do uso: pede a senha sem perder a tela. Resolve true se entrou de novo. */
  let relogging = null;
  const relogin = () => {
    if (relogging) return relogging;
    const m = Store.me;
    if (!m || Api.isLocal) {
      sessionExpired(true);
      return Promise.resolve(false);
    }
    relogging = new Promise((resolve) => {
      let ok = false;
      document.body.classList.add('locked'); // esconde a tela com dados enquanto pede a senha
      UI.modal({
        title: 'Sua sessão terminou',
        sub: 'Por segurança, a sessão fecha depois de um tempo sem uso. Entre de novo para continuar de onde parou.',
        size: 'sm',
        guard: false,
        body: html`<form class="stack" novalidate><div class="notice bad" data-error hidden></div>
          <div class="field"><label for="rl-login">E-mail ou celular</label><input id="rl-login" class="input" value="${m.email || m.phone}" autocomplete="username"></div>
          <div class="field"><label for="rl-pass">Senha</label><input id="rl-pass" class="input" type="password" autocomplete="current-password" autofocus></div><button type="submit" hidden></button></form>`,
        foot: html`<button type="button" class="btn" data-close>Sair</button><button type="button" class="btn primary" data-ok>Entrar</button>`,
        onMount(el, api) {
          const submit = async (e) => {
            e && e.preventDefault();
            const btn = el.querySelector('[data-ok]');
            busyBtn(btn, true);
            try {
              const login = el.querySelector('#rl-login').value.trim();
              await Api.login(login, el.querySelector('#rl-pass').value);
              const s = await Api.session();
              if (!s.authenticated || !s.me || s.me.id !== m.id) {
                location.reload();
                return;
              }
              ok = true;
              api.close();
            } catch (err) {
              const box = el.querySelector('[data-error]');
              UI.setHTML(box, html`${icon('alert')}<span>${err.message}</span>`);
              box.hidden = false;
            } finally {
              busyBtn(btn, false);
            }
          };
          el.querySelector('form').addEventListener('submit', submit);
          el.querySelector('[data-ok]').addEventListener('click', submit);
        },
        onClose() {
          relogging = null;
          document.body.classList.remove('locked');
          resolve(ok);
          if (!ok) logout();
        },
      });
    });
    return relogging;
  };
  const sessionExpired = (hard = false) => {
    if (hard || !Store.me) return logout();
    relogin();
  };

  // =====================================================================
  // Casca (navegação, barra superior, avisos)
  // =====================================================================
  const badgeHTML = (p) => {
    if (!p.badge) return '';
    let b;
    try {
      b = p.badge();
    } catch (e) {
      return '';
    }
    if (!b) return '';
    const o = typeof b === 'number' ? { n: b } : b;
    return o.n ? html`<span class="badge ${o.tone || ''}" title="${o.title || ''}">${o.n > 99 ? '99+' : o.n}</span>` : '';
  };

  /** Barra inferior do celular: as 4 áreas de trabalho mais usadas por quem está usando (depende do cargo). */
  const TAB_PRIORITY = {
    financeiro: ['painel', 'financeiro', 'alunos', 'relatorios'],
    psicologo: ['painel', 'atendimentos', 'alunos', 'agenda'],
    psicopedagogo: ['painel', 'atendimentos', 'alunos', 'agenda'],
    orientador: ['painel', 'atendimentos', 'agenda', 'alunos'],
    assistente_social: ['painel', 'atendimentos', 'mensagens', 'alunos'],
    aee: ['painel', 'agenda', 'atendimentos', 'alunos'],
    secretaria: ['painel', 'alunos', 'mensagens', 'chamada'],
    aux_secretaria: ['painel', 'alunos', 'mensagens', 'chamada'],
    portaria: ['painel', 'mensagens', 'alunos', 'calendario'],
    enfermagem: ['painel', 'mensagens', 'alunos', 'calendario'],
    coordenador: ['painel', 'agenda', 'chamada', 'notas'],
    professor: ['painel', 'chamada', 'agenda', 'notas'],
    auxiliar: ['painel', 'agenda', 'rotina', 'chamada'],
    diretor: ['painel', 'agenda', 'alunos', 'financeiro'],
  };
  const tabbarPages = (list) => {
    if (Store.family) return list.filter((p) => p.tab != null).sort((a, b) => a.tab - b.tab).slice(0, 4);
    const byId = new Map(list.map((p) => [p.id, p]));
    let pref = (TAB_PRIORITY[Store.me.role] || []).slice();
    // professora da Educação Infantil: rotina do dia no lugar das notas
    if (byId.has('rotina') && Q.myClasses().some((c) => Q.evaluation(c.id) === 'parecer') && !Q.myClasses().some((c) => Q.evaluation(c.id) === 'nota')) pref = pref.map((id) => (id === 'notas' ? 'rotina' : id));
    const out = [];
    for (const id of pref) if (byId.has(id) && !out.includes(byId.get(id))) out.push(byId.get(id));
    for (const p of list.filter((x) => x.tab != null).sort((a, b) => a.tab - b.tab)) if (out.length < 4 && !out.includes(p)) out.push(p);
    for (const p of list) if (out.length < 4 && !out.includes(p)) out.push(p);
    return out.slice(0, 4);
  };

  const renderNav = () => {
    const [name] = route();
    const list = visiblePages().filter(inNav);
    const groups = Store.family ? FAMILY_GROUPS : GROUPS.concat([...new Set(list.map((p) => p.group))].filter((g) => !GROUPS.includes(g)));
    const link = (p) => html`<a class="side-link ${name === p.id ? 'active' : ''}" href="#${p.id}" ${name === p.id ? raw('aria-current="page"') : ''}>${icon(p.icon || 'grid')}<span>${p.label}</span>${badgeHTML(p)}</a>`;
    UI.setHTML(
      $('nav'),
      groups.map((g) => {
        const items = list.filter((p) => (Store.family ? true : p.group === g));
        return items.length ? html`<div class="nav-group">${Store.family ? '' : html`<div class="nav-title">${g}</div>`}${items.map(link)}</div>` : '';
      }),
    );
    const tabs = tabbarPages(list);
    UI.setHTML(
      $('tabbar'),
      html`${tabs.map((p) => html`<a href="#${p.id}" class="${name === p.id ? 'active' : ''}">${icon(p.icon || 'grid')}<span>${p.short || p.label}</span>${badgeHTML(p)}</a>`)}<button type="button" data-act="open-menu">${icon('menu')}<span>Mais</span></button>`,
    );
    const s = Q.settings();
    $('brandName').textContent = s.schoolName || 'Escola';
    UI.setHTML($('brandYear'), html`${Store.family ? 'Portal da família' : html`Ano letivo ${s.year} · ${Q.termLabel(Q.currentTerm())}`}${Api.isLocal || s.demo ? html`<span class="demo-tag">Demonstração</span>` : ''}`);
    const m = Store.me;
    UI.setHTML(
      $('userBtn'),
      html`${UI.avatar(m.name, 'sm')}<span class="user-text"><b>${U.shortName(m.name)}</b><span>${Store.family ? 'Família' : m.title || m.roleLabel}</span></span>${icon('chevronDown', 'muted')}`,
    );
    const newBtn = document.querySelector('[data-act="new-menu"]');
    newBtn.hidden = Store.preview != null || !allowedActions().length;
  };

  const renderBanner = () => {
    const parts = [];
    if (Store.preview) {
      const pv = Store.preview;
      const kids = pv.family ? Q.students({ status: 'todos' }).filter((x) => (pv.studentIds || []).includes(x.id)).map((x) => U.firstName(x.name)) : [];
      const who = pv.family ? (kids.length ? `responsável por ${kids.join(' e ')}` : 'família') : pv.title || pv.roleLabel;
      parts.push(html`<div class="notice preview">${icon('eye')}<span class="grow">Você está vendo o sistema como <b>${pv.name}</b> — ${who}. Somente leitura.</span><button type="button" class="btn sm" data-act="end-preview">Voltar para a minha conta</button></div>`);
    }
    if (!Store.online) parts.push(html`<div class="notice warn">${icon('alert')}<span class="grow">Sem conexão com o servidor. O que aparece pode estar desatualizado; tentaremos de novo sozinhos.</span><button type="button" class="btn sm" data-act="retry">Tentar agora</button></div>`);
    if (Api.isLocal && Api.persistent === false) parts.push(html`<div class="notice warn">${icon('alert')}<span class="grow">Este navegador não está guardando os dados da demonstração (janela anônima ou armazenamento bloqueado). Ao fechar, tudo volta ao início.</span></div>`);
    if (Store.me && Store.me.validUntil && !Store.family) {
      const days = U.daysBetween(U.today(), Store.me.validUntil);
      if (days >= 0 && days <= 7) parts.push(html`<div class="notice">${icon('clock')}<span class="grow">Seu acesso vale até ${U.fmtDate(Store.me.validUntil)}. Fale com a direção se precisar de mais tempo.</span></div>`);
    }
    UI.setHTML($('banner'), parts);
  };

  const render = () => {
    if (!Store.ready || appEl().hidden) return;
    let parts = route();
    if (REDIRECTS[parts[0]] && !findPage(parts[0])) {
      location.replace('#' + [REDIRECTS[parts[0]], ...parts.slice(1)].join('/'));
      return;
    }
    if (parts[0] === 'acesso') parts = [homeId()];
    const [name, ...rest] = parts;
    const p = findPage(name);
    const key = parts.join('/');
    const same = key === current;
    const y = window.scrollY;
    current = key;
    if (!same) UI.closeMenu();
    const el = document.createElement('div');
    el.className = 'page';
    let ok = true;
    if (!p) {
      UI.setHTML(el, UI.empty({ icon: 'info', title: 'Tela não encontrada', text: 'O endereço pode estar incompleto. Volte para o início.', action: html`<a class="btn primary" href="#${homeId()}">Ir para o início</a>` }));
      ok = false;
    } else if (!allowed(p)) {
      let d = null;
      try {
        d = p.denied ? p.denied(rest) : null;
      } catch (e) {
        d = null;
      }
      const text = d && d.text ? d.text : Store.preview ? 'A pessoa que você está vendo não tem acesso a esta área.' : Store.family ? 'Esta área não está disponível para a sua família.' : Store.can('usuarios.gerenciar') ? 'Esta área não faz parte do seu perfil de acesso. Para mudar, vá em Equipe e acessos → Perfis de acesso.' : 'O seu perfil não inclui esta área. Se precisar, peça à direção para liberar o acesso.';
      UI.setHTML(el, UI.empty({ icon: 'lock', title: (d && d.title) || 'Sem acesso a esta tela', text, action: html`<a class="btn primary" href="#${homeId()}">Ir para o início</a>` }));
      ok = false;
    } else {
      try {
        UI.setHTML(el, p.render(rest));
      } catch (err) {
        console.error(err);
        ok = false;
        UI.setHTML(el, UI.empty({ icon: 'alert', title: 'Não foi possível abrir esta tela', text: 'Algo deu errado ao montar a página. Volte ao início e tente de novo.', action: html`<a class="btn primary" href="#${homeId()}">Ir para o início</a>` }));
      }
    }
    if (same) el.style.animation = 'none';
    main().replaceChildren(el);
    if (ok && p.mount) {
      try {
        p.mount(el, rest);
      } catch (err) {
        console.error(err);
      }
    }
    appEl().classList.toggle('is-preview', !!Store.preview);
    renderNav();
    renderBanner();
    let title = p ? p.label : 'Caderneta';
    if (p && p.title) {
      try {
        title = p.title(rest) || title;
      } catch (e) {
        /* título padrão */
      }
    }
    document.title = `${title} · ${Q.settings().schoolName || 'Caderneta Escolar'}`;
    if (same) window.scrollTo(0, y);
    else window.scrollTo(0, 0);
    if (!same) closeSidebar();
  };

  /** Re-renderiza quando os dados mudam, mas espera a pessoa terminar de digitar. */
  let deferred = false;
  const typing = (el) => el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
  const onData = () => {
    if (!Store.ready || appEl().hidden) return;
    const a = document.activeElement;
    if (typing(a) && main().contains(a)) {
      deferred = true;
      return;
    }
    render();
  };
  document.addEventListener('focusout', () =>
    setTimeout(() => {
      if (!deferred) return;
      const a = document.activeElement;
      if (typing(a) && main().contains(a)) return;
      deferred = false;
      render();
    }, 0),
  );

  // ---------- menu lateral (telas estreitas) ----------
  const openSidebar = () => {
    $('sidebar').classList.add('open');
    document.querySelector('.scrim').hidden = false;
    const f = $('sidebar').querySelector('.side-link.active, .side-link');
    f && f.focus();
  };
  const closeSidebar = () => {
    $('sidebar').classList.remove('open');
    document.querySelector('.scrim').hidden = true;
  };

  // ---------- tema ----------
  const THEME_KEY = 'caderneta.tema';
  const getTheme = () => {
    try {
      return localStorage.getItem(THEME_KEY) || 'system';
    } catch (e) {
      return 'system';
    }
  };
  const applyTheme = (t) => {
    const root = document.documentElement;
    if (t === 'light' || t === 'dark') root.setAttribute('data-theme', t);
    else root.removeAttribute('data-theme');
  };
  const setTheme = (t) => {
    try {
      localStorage.setItem(THEME_KEY, t);
    } catch (e) {
      /* vale só nesta visita */
    }
    applyTheme(t);
  };

  // ---------- conta do usuário ----------
  const myAccount = () => {
    if (Store.preview) {
      return UI.modal({
        title: 'Meus dados',
        size: 'sm',
        body: html`<p>Você está vendo o sistema como <b>${Store.preview.name}</b>. Os dados e a senha da conta não podem ser alterados neste modo.</p>`,
        foot: html`<button type="button" class="btn" data-close>Fechar</button><button type="button" class="btn primary" data-act="end-preview" data-close>Voltar para a minha conta</button>`,
      });
    }
    const m = Store.me;
    const fam = Store.family;
    UI.modal({
      title: 'Meus dados',
      sub: html`${m.name} · ${fam ? 'Responsável' : m.title || m.roleLabel}`,
      drawer: true,
      body: html`
        <section class="stack">
          <h3>Contato</h3>
          ${UI.kv([['E-mail', m.email], ['Celular', m.phone], fam ? null : ['Cargo', m.roleLabel], m.validUntil ? ['Acesso válido até', U.fmtDate(m.validUntil)] : null])}
          <form class="form-grid" data-phone novalidate>${UI.field({ name: 'phone', label: 'Atualizar celular', type: 'tel', value: m.phone, hint: 'O celular também serve para entrar.' })}<div class="field" style="align-self:end"><button type="submit" class="btn">Salvar celular</button></div></form>
          <p class="small muted">Para mudar nome ou e-mail, fale com a secretaria.</p>
        </section>
        <section class="stack" style="margin-top:22px">
          <h3>Senha</h3>
          ${Api.isLocal ? html`<p class="small muted">Na demonstração, as contas de exemplo entram sem senha.</p>` : ''}
          <form class="form-grid" data-password novalidate>
            ${UI.fields([
              { name: 'current', label: 'Senha atual', type: 'password', autocomplete: 'current-password', full: true },
              { name: 'next', label: 'Nova senha', type: 'password', autocomplete: 'new-password', hint: 'Pelo menos 8 caracteres.' },
              { name: 'next2', label: 'Repita a nova senha', type: 'password', autocomplete: 'new-password' },
            ])}
            <div class="field full"><button type="submit" class="btn">${icon('key')}Trocar senha</button><span class="hint">Ao trocar, os outros aparelhos conectados saem da conta.</span></div>
          </form>
        </section>
        <section class="stack" style="margin-top:22px">
          <h3>Aparelhos</h3>
          <p class="small muted">Esqueceu a conta aberta em outro computador ou celular? Saia de todos de uma vez.</p>
          <div><button type="button" class="btn" data-logout-all>${icon('logout')}Sair de todos os aparelhos</button></div>
        </section>
        <section class="stack" style="margin-top:22px">
          <h3>Privacidade</h3>
          <details class="privacy"><summary>Como a escola trata os dados</summary>${privacyNotice(Q.settings().privacy || {}, Q.settings().schoolName)}</details>
          ${!fam ? html`<p class="small"><a href="#atividades">Ver o meu registro de atividades</a></p>` : ''}
        </section>`,
      onMount(el, api) {
        const pf = el.querySelector('[data-phone]');
        UI.bindMasks(pf);
        pf.addEventListener('submit', async (e) => {
          e.preventDefault();
          const phone = pf.querySelector('input').value.trim();
          if (phone && U.digits(phone).length < 10) return UI.markField(pf, 'phone', 'Informe DDD + número.');
          const res = await UI.act('me.update', { phone }, { btn: pf.querySelector('button'), ok: 'Celular atualizado', form: pf });
          if (res) api.setDirty(false);
        });
        const pw = el.querySelector('[data-password]');
        pw.addEventListener('submit', async (e) => {
          e.preventDefault();
          const d = UI.readForm(pw, [{ name: 'current', type: 'password' }, { name: 'next', type: 'password' }, { name: 'next2', type: 'password' }]);
          UI.clearErrors(pw);
          if (!d.next || d.next.length < 8) return UI.markField(pw, 'next', 'Pelo menos 8 caracteres.');
          if (d.next !== d.next2) return UI.markField(pw, 'next2', 'As senhas não são iguais.');
          const btn = pw.querySelector('button');
          busyBtn(btn, true);
          try {
            await Api.password(d.current, d.next);
            pw.reset();
            api.setDirty(false);
            UI.toast('Senha trocada. Os outros aparelhos saíram da conta.', { ic: 'key' });
          } catch (err) {
            if (!UI.markField(pw, /atual/.test(err.message) ? 'current' : 'next', err.message)) UI.errorToast(err);
          } finally {
            busyBtn(btn, false);
          }
        });
        el.querySelector('[data-logout-all]').addEventListener('click', async () => {
          if (await UI.confirm({ title: 'Sair de todos os aparelhos?', text: 'Você também sairá deste. Para voltar, entre de novo com a sua senha.', ok: 'Sair de todos', danger: true })) logout(true);
        });
      },
    });
  };

  const userMenu = (anchor) => {
    const m = Store.me;
    const theme = getTheme();
    UI.menu(anchor, [
      { heading: m.name },
      { label: 'Meus dados e senha', icon: 'user', fn: myAccount },
      m.staffAndFamily && !Store.preview ? (Store.family ? { label: 'Voltar para a área da equipe', icon: 'briefcase', fn: () => switchMode('equipe') } : { label: 'Abrir o Portal da família', icon: 'heart', fn: () => switchMode('familia') }) : null,
      '-',
      { label: 'Tema automático', icon: 'monitor', checked: theme === 'system', fn: () => setTheme('system') },
      { label: 'Tema claro', icon: 'sun', checked: theme === 'light', fn: () => setTheme('light') },
      { label: 'Tema escuro', icon: 'moon', checked: theme === 'dark', fn: () => setTheme('dark') },
      '-',
      { label: 'Atalhos e ajuda', icon: 'help', fn: help },
      Api.isLocal || (sessionInfo && sessionInfo.demo) ? { label: 'Trocar de conta (demonstração)', icon: 'swap', fn: () => logout() } : null,
      { label: 'Sair', icon: 'logout', fn: () => logout() },
    ]);
  };

  const switchMode = async (mode) => {
    try {
      await Store.setMode(mode);
      current = '';
      location.hash = mode === 'familia' ? 'inicio' : 'painel';
      render();
      UI.toast(mode === 'familia' ? 'Você está no Portal da família' : 'Você está na área da equipe', { ic: mode === 'familia' ? 'heart' : 'briefcase' });
    } catch (err) {
      UI.errorToast(err);
    }
  };

  /** "Ver como": mostra o sistema do jeito que a pessoa vê (somente leitura). */
  let previewReturn = 'equipe';
  const previewAs = async (userId) => {
    try {
      if (!Store.preview) previewReturn = location.hash.replace(/^#/, '') || 'equipe';
      await Store.startPreview(userId);
      current = '';
      location.hash = homeId();
      render();
    } catch (err) {
      UI.errorToast(err);
    }
  };
  const endPreview = async () => {
    await Store.endPreview();
    current = '';
    location.hash = previewReturn || 'equipe';
    render();
  };

  // ---------- menu "Novo" e busca rápida ----------
  const newItems = () => allowedActions().map((a) => ({ label: a.label, icon: a.icon, fn: () => a.run() }));

  const palette = () => {
    const pageItems = visiblePages().filter(inNav).map((p) => ({ group: 'Ir para', label: p.label, icon: p.icon, run: () => go(p.id), keys: p.label + ' ' + (p.keys || '') }));
    const actionItems = Store.preview ? [] : allowedActions().map((a) => ({ group: 'Ações', label: a.label, icon: a.icon, run: a.run, keys: a.label + ' ' + (a.keys || '') }));
    const build = (q) => {
      const out = [];
      const qn = U.norm(q);
      const add = (list, limit) => list.filter((x) => !qn || U.matches(q, x.keys || x.label)).slice(0, limit).forEach((x) => out.push(x));
      if (!qn) {
        add(actionItems, 6);
        add(pageItems, 12);
        return out;
      }
      for (const fn of providers) {
        try {
          add(fn(q) || [], 6);
        } catch (e) {
          console.error(e);
        }
      }
      add(actionItems, 5);
      add(pageItems, 6);
      return out;
    };
    let items = [];
    let sel = 0;
    UI.modal({
      head: false,
      title: 'Busca',
      cls: 'palette',
      guard: false,
      top: html`<div class="palette-input">${icon('search')}<input id="pal-q" placeholder="${Store.family ? 'Buscar tela ou assunto…' : 'Buscar aluno, turma, pessoa ou ação…'}" autocomplete="off" aria-label="Buscar" data-nodirty autofocus><kbd>Esc</kbd></div>`,
      body: html`<div id="pal-list" role="listbox"></div>`,
      onMount(el, api) {
        const input = el.querySelector('#pal-q');
        const list = el.querySelector('#pal-list');
        const draw = () => {
          items = build(input.value);
          sel = Math.min(sel, Math.max(0, items.length - 1));
          let g = '';
          UI.setHTML(
            list,
            items.length
              ? items.map((it, i) => {
                  const head = it.group !== g ? html`<div class="palette-group">${(g = it.group)}</div>` : '';
                  return html`${head}<button type="button" class="palette-item ${i === sel ? 'sel' : ''}" role="option" aria-selected="${i === sel}" data-i="${i}">${it.avatar ? UI.avatar(it.avatar, 'sm') : icon(it.icon || 'arrowRight')}<span>${it.label}</span>${it.meta ? html`<span class="meta">${it.meta}</span>` : ''}</button>`;
                })
              : html`<div class="empty"><p>Nada encontrado para “${input.value}”.</p></div>`,
          );
          const cur = list.querySelector('.sel');
          cur && cur.scrollIntoView({ block: 'nearest' });
        };
        const run = (i) => {
          const it = items[i];
          if (!it) return;
          api.close();
          it.run();
        };
        input.addEventListener('input', () => {
          sel = 0;
          draw();
        });
        input.addEventListener('keydown', (e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            sel = Math.min(items.length - 1, sel + 1);
            draw();
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            sel = Math.max(0, sel - 1);
            draw();
          } else if (e.key === 'Enter') {
            e.preventDefault();
            run(sel);
          }
        });
        list.addEventListener('click', (e) => {
          const b = e.target.closest('[data-i]');
          if (b) run(Number(b.dataset.i));
        });
        draw();
      },
    });
  };

  // ---------- ajuda ----------
  const help = () =>
    UI.modal({
      title: 'Atalhos e ajuda',
      sub: 'O essencial para usar a Caderneta no dia a dia.',
      size: 'lg',
      body: Store.family
        ? html`<ul class="items">
            <li>${icon('bookOpen')}<span class="grow"><b>Agenda:</b> deveres, recados e autorizações dos seus filhos. Toque em <b>Ciente</b> para avisar a escola que você leu.</span></li>
            <li>${icon('message')}<span class="grow"><b>Mensagens:</b> avise faltas, saídas antecipadas, quem vai buscar e medicação. A escola responde por ali.</span></li>
            <li>${icon('grade')}<span class="grow"><b>Boletim:</b> notas das etapas liberadas e frequência.</span></li>
            <li>${icon('key')}<span class="grow"><b>Senha:</b> em <b>Meus dados</b> você troca a senha e sai de outros aparelhos.</span></li>
          </ul>`
        : html`<div class="grid-2" style="grid-template-columns:repeat(auto-fit,minmax(240px,1fr))">
          <div class="stack" style="gap:12px">
            <h3>Como funciona</h3>
            <ul class="items small">
              <li>${icon('shield')}<span class="grow"><b>Cada um vê o que precisa:</b> o menu mostra só as áreas liberadas para o seu cargo. A direção ajusta os acessos em <b>Equipe e acessos</b>.</span></li>
              <li>${icon('bookOpen')}<span class="grow"><b>Agenda do aluno:</b> dever de casa, recados, lembretes e autorizações chegam às famílias pelo portal.</span></li>
              <li>${icon('checkSquare')}<span class="grow"><b>Chamada:</b> todos começam presentes; toque em quem faltou e salve.</span></li>
              <li>${icon('undo')}<span class="grow"><b>Desfazer:</b> cancelamentos, pagamentos e exclusões mostram "Desfazer" por alguns segundos.</span></li>
            </ul>
          </div>
          <div class="stack" style="gap:12px">
            <h3>Atalhos de teclado</h3>
            <table class="table small"><tbody>
              <tr><td><kbd>Ctrl</kbd> + <kbd>K</kbd> ou <kbd>/</kbd></td><td>Buscar qualquer coisa</td></tr>
              <tr><td><kbd>N</kbd></td><td>Abrir o menu Novo</td></tr>
              <tr><td><kbd>P</kbd> <kbd>F</kbd> <kbd>J</kbd></td><td>Na chamada: presente, falta, justificada</td></tr>
              <tr><td><kbd>Enter</kbd> / <kbd>↑</kbd> <kbd>↓</kbd></td><td>Nas notas: próximo / anterior aluno</td></tr>
              <tr><td><kbd>Esc</kbd></td><td>Fechar janelas</td></tr>
              <tr><td><kbd>?</kbd></td><td>Abrir esta ajuda</td></tr>
            </tbody></table>
          </div>
        </div>`,
      foot: html`<button type="button" class="btn primary" data-close>Entendi</button>`,
    });

  // ---------- eventos globais ----------
  const bindGlobal = () => {
    document.addEventListener('click', (e) => {
      const a = e.target.closest('[data-act]');
      if (!a) return;
      const act = a.dataset.act;
      if (act === 'skip') {
        e.preventDefault();
        main().focus();
      } else if (act === 'open-menu') openSidebar();
      else if (act === 'close-menu') closeSidebar();
      else if (act === 'palette') palette();
      else if (act === 'new-menu') UI.menu(a, newItems());
      else if (act === 'user-menu') userMenu(a);
      else if (act === 'help') {
        closeSidebar();
        help();
      } else if (act === 'end-preview') endPreview();
      else if (act === 'retry') Store.poll();
    });
    document.addEventListener('keydown', (e) => {
      if (!Store.ready || appEl().hidden) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (!document.querySelector('.palette')) palette();
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey || typing(e.target) || document.querySelector('.overlay')) return;
      if (e.key === '/') {
        e.preventDefault();
        palette();
      } else if (e.key === '?') {
        e.preventDefault();
        help();
      } else if (e.key === 'n' || e.key === 'N') {
        const btn = document.querySelector('[data-act="new-menu"]');
        if (btn && !btn.hidden && !document.querySelector('.menu')) {
          e.preventDefault();
          UI.menu(btn, newItems());
        }
      } else if (e.key === 'Escape' && $('sidebar').classList.contains('open')) closeSidebar();
    });
    window.addEventListener('hashchange', () => {
      const r = route();
      if (r[0] === 'acesso' && !Store.ready) return codeScreen(r[1] || '');
      if (!Store.ready && !screenEl().hidden && r[0] !== 'acesso') {
        if (screenEl().querySelector('#cd-code')) return boot();
        return;
      }
      render();
    });
    window.addEventListener(
      'resize',
      U.debounce(() => {
        if (Math.abs(window.innerWidth - lastWidth) < 40) return;
        lastWidth = window.innerWidth;
        if (!typing(document.activeElement)) render();
      }, 220),
    );
    Store.on(onData);
  };

  const start = () => {
    if (started) return;
    started = true;
    applyTheme(getTheme());
    document.querySelectorAll('[data-icon]').forEach((el) => (el.outerHTML = String(icon(el.dataset.icon))));
    bindGlobal();
    boot();
  };
  document.addEventListener('DOMContentLoaded', start);

  return {
    page, studentTab, widget, action, searchProvider, allowed,
    pages: visiblePages, studentTabs: allowedStudentTabs, widgets: allowedWidgets, actions: allowedActions,
    go, render, route, homeId, palette, help, relogin, sessionExpired, logout, previewAs, endPreview, privacyNotice, myAccount, getTheme, setTheme, v1Data, downloadV1,
  };
})();
