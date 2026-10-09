'use strict';
/* Componentes de interface: HTML seguro (html``), modal, gaveta, confirmação, toast, menu, formulários,
   convites, anexos e gráficos.

   REGRA: todo HTML é montado com a tag html`...`. Valores interpolados são escapados; só passam direto
   outros html`...`, listas deles e raw() (use raw() apenas para HTML montado pelo próprio código). */
class SafeHTML {
  constructor(s) {
    this.s = s;
  }
  toString() {
    return this.s;
  }
  valueOf() {
    return this.s;
  }
}
const toHTML = (v) => {
  if (v == null || v === false || v === true) return '';
  if (v instanceof SafeHTML) return v.s;
  if (Array.isArray(v)) return v.map(toHTML).join('');
  return U.esc(v);
};
const html = (strings, ...values) => {
  let out = strings[0];
  for (let i = 0; i < values.length; i++) out += toHTML(values[i]) + strings[i + 1];
  return new SafeHTML(out);
};
const raw = (s) => (s instanceof SafeHTML ? s : new SafeHTML(s == null ? '' : String(s)));
/** Junta itens (html ou texto) com um separador já seguro. */
html.join = (items, sep = '') => raw(items.filter((x) => x != null && x !== false && x !== '').map(toHTML).join(toHTML(sep)));

const UI = (() => {
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const layer = () => document.getElementById('layer');
  const setHTML = (el, v) => {
    el.innerHTML = toHTML(v);
    return el;
  };

  // ---------- peças pequenas ----------
  const avatar = (name, size = '', photoId = null) =>
    photoId && typeof Api !== 'undefined'
      ? html`<span class="avatar photo ${size}" aria-hidden="true"><img src="${Api.fileUrl(photoId)}" alt="" loading="lazy"></span>`
      : html`<span class="avatar c${U.colorIndex(name)} ${size}" aria-hidden="true">${U.initials(name)}</span>`;
  const pill = (label, tone = '', plain = false) => html`<span class="pill ${tone} ${plain ? 'plain' : ''}">${label}</span>`;
  const empty = ({ icon: ic = 'info', title, text = '', action = '' }) =>
    html`<div class="empty">${icon(ic)}<h3>${title}</h3>${text ? html`<p>${text}</p>` : ''}${action ? html`<div class="btn-row" style="justify-content:center">${action}</div>` : ''}</div>`;
  const meter = (pct, tone = '') => html`<div class="meter ${tone}" role="presentation"><span style="width:${U.clamp(pct || 0, 0, 100)}%"></span></div>`;
  const tabs = (items, active, attr = 'data-tab') =>
    html`<div class="tabs" role="tablist">${items.map(([id, label, extra]) => html`<button type="button" role="tab" ${raw(attr)}="${id}" aria-selected="${String(id === active)}">${label}${extra || ''}</button>`)}</div>`;
  const seg = (items, active, attr) =>
    html`<div class="seg" role="group">${items.map(([v, l]) => html`<button type="button" ${raw(attr)}="${v}" aria-pressed="${String(String(v) === String(active))}">${l}</button>`)}</div>`;
  /** "Sem acesso" para campos que o servidor retirou do retrato (doc._hidden). */
  const hidden = (doc, field) => doc && Array.isArray(doc._hidden) && doc._hidden.includes(field);
  const noAccess = (text = 'Sem acesso') => html`<span class="muted small no-access">${icon('lock')} ${text}</span>`;
  const kv = (rows) => html`<dl class="kv">${rows.filter(Boolean).map(([k, v]) => html`<dt>${k}</dt><dd>${v == null || v === '' ? html`<span class="muted">—</span>` : v}</dd>`)}</dl>`;
  const spinner = () => html`<span class="spinner" aria-hidden="true"></span>`;

  // ---------- pilha de camadas (Esc fecha a de cima) ----------
  const stack = [];
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || !stack.length) return;
    e.preventDefault();
    stack[stack.length - 1].requestClose();
  });

  const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
  const trapTab = (e, root) => {
    if (e.key !== 'Tab') return;
    const items = $$(FOCUSABLE, root).filter((el) => el.offsetParent !== null);
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  /**
   * Abre um modal (ou gaveta lateral). title é texto; sub, body, foot e top são html``.
   * opts: { title, sub, body, foot, top, size: sm|lg|xl, drawer, cls (no .modal), wrapCls (no .overlay), head:false, onMount(el, api), onClose, guard }
   * api: { el, wrap, close(), requestClose(), setDirty(v), setBody(html), setFoot(html) }
   */
  const modal = (opts) => {
    const prevFocus = document.activeElement;
    const wrap = document.createElement('div');
    wrap.className = 'overlay' + (opts.drawer ? ' drawer-wrap' : '') + (opts.wrapCls ? ' ' + opts.wrapCls : '');
    const titleId = 'm' + Math.random().toString(36).slice(2, 9);
    setHTML(
      wrap,
      html`
      <div class="modal ${opts.size || ''} ${opts.cls || ''}" role="dialog" aria-modal="true" ${opts.head === false ? raw(`aria-label="${U.esc(opts.title || 'Janela')}"`) : raw(`aria-labelledby="${titleId}"`)}>
        ${opts.head === false
          ? ''
          : html`<div class="modal-head"><div><h2 id="${titleId}">${opts.title || ''}</h2>${opts.sub ? html`<p class="sub">${opts.sub}</p>` : ''}</div>
          <button type="button" class="icon-btn" data-close aria-label="Fechar">${icon('x')}</button></div>`}
        ${opts.top || ''}
        <div class="modal-body">${opts.body || ''}</div>
        <div class="modal-foot" ${opts.foot ? '' : 'hidden'}>${opts.foot || ''}</div>
      </div>`,
    );
    layer().appendChild(wrap);
    const box = wrap.firstElementChild;
    let dirty = false;
    let closed = false;
    box.addEventListener('input', (e) => {
      if (!e.target.closest('[data-nodirty]')) dirty = true;
    });
    box.addEventListener('keydown', (e) => trapTab(e, box));

    const api = {
      el: box,
      wrap,
      get closed() {
        return closed;
      },
      setDirty: (v) => (dirty = v),
      setBody: (v) => setHTML($('.modal-body', box), v),
      setFoot(v) {
        const f = $('.modal-foot', box);
        setHTML(f, v);
        f.hidden = !v;
      },
      close() {
        if (closed) return;
        closed = true;
        const i = stack.indexOf(api);
        if (i >= 0) stack.splice(i, 1);
        wrap.remove();
        opts.onClose && opts.onClose();
        if (prevFocus && document.contains(prevFocus)) prevFocus.focus({ preventScroll: true });
      },
      async requestClose() {
        if (dirty && opts.guard !== false) {
          const ok = await confirm({ title: 'Descartar alterações?', text: 'O que você preencheu nesta janela será perdido.', ok: 'Descartar', danger: true });
          if (!ok) return;
        }
        api.close();
      },
    };
    stack.push(api);
    wrap.addEventListener('mousedown', (e) => {
      if (e.target === wrap) api.requestClose();
    });
    box.addEventListener('click', (e) => {
      if (e.target.closest('[data-close]')) api.requestClose();
    });
    opts.onMount && opts.onMount(box, api);
    requestAnimationFrame(() => {
      if (closed) return;
      const target = $('[autofocus]', box) || $('.modal-body ' + FOCUSABLE, box) || $(FOCUSABLE, box);
      target && target.focus({ preventScroll: true });
    });
    return api;
  };
  const closeAll = () => [...stack].reverse().forEach((m) => m.close());

  /** Confirmação. text pode ser texto ou html``. requireText exige digitar a palavra. */
  const confirm = ({ title, text = '', ok = 'Confirmar', cancel = 'Cancelar', danger = false, requireText = '', reason = null }) =>
    new Promise((resolve) => {
      let result = false;
      modal({
        title,
        size: 'sm',
        guard: false,
        body: html`<div class="muted">${text}</div>
          ${reason ? html`<div class="field" style="margin-top:14px"><label for="cf-reason">${reason.label || 'Motivo'}${reason.required ? html` <span class="req">*</span>` : ''}</label><textarea id="cf-reason" class="input" rows="3" maxlength="500" placeholder="${reason.placeholder || ''}"></textarea></div>` : ''}
          ${requireText ? html`<div class="field" style="margin-top:14px"><label for="cf-text">Para confirmar, digite <b>${requireText}</b></label><input id="cf-text" class="input" autocomplete="off"></div>` : ''}`,
        foot: html`<button type="button" class="btn" data-close>${cancel}</button><button type="button" class="btn ${danger ? 'danger solid' : 'primary'}" data-ok ${requireText || (reason && reason.required) ? 'disabled' : ''}>${ok}</button>`,
        onMount(el, api) {
          const okBtn = $('[data-ok]', el);
          const check = () => {
            const t = requireText ? $('#cf-text', el).value.trim().toUpperCase() === requireText.toUpperCase() : true;
            const r = reason && reason.required ? $('#cf-reason', el).value.trim().length >= 3 : true;
            okBtn.disabled = !(t && r);
          };
          el.addEventListener('input', check);
          okBtn.addEventListener('click', () => {
            result = reason ? { reason: $('#cf-reason', el).value.trim() } : true;
            api.close();
          });
          if (!requireText && !reason) setTimeout(() => okBtn.focus(), 30);
        },
        onClose: () => resolve(result),
      });
    });

  /** Pede a senha da própria conta (ações sensíveis). Resolve com a senha ou null. */
  const askPassword = ({ title = 'Confirme com a sua senha', text = 'Por segurança, esta ação pede a sua senha.', ok = 'Confirmar' } = {}) =>
    new Promise((resolve) => {
      let value = null;
      modal({
        title,
        size: 'sm',
        guard: false,
        body: html`<p class="muted">${text}</p><form class="stack" style="margin-top:12px" novalidate><div class="field"><label for="rp-pass">Sua senha</label><input id="rp-pass" class="input" type="password" autocomplete="current-password" autofocus></div><button type="submit" hidden></button></form>`,
        foot: html`<button type="button" class="btn" data-close>Cancelar</button><button type="button" class="btn primary" data-ok>${ok}</button>`,
        onMount(el, api) {
          const done = (e) => {
            e && e.preventDefault();
            const v = $('#rp-pass', el).value;
            if (!v) return $('#rp-pass', el).focus();
            value = v;
            api.close();
          };
          $('form', el).addEventListener('submit', done);
          $('[data-ok]', el).addEventListener('click', done);
        },
        onClose: () => resolve(value),
      });
    });

  // ---------- toast ----------
  const toast = (text, { action = null, tone = '', ic = null, ms = 4200 } = {}) => {
    const host = document.getElementById('toasts');
    if (!host) return;
    const el = document.createElement('div');
    el.className = 'toast ' + tone;
    setHTML(el, html`${icon(ic || (tone === 'bad' ? 'alert' : 'checkCircle'))}<span class="grow">${text}</span>${action ? html`<button type="button">${action.label}</button>` : ''}`);
    host.appendChild(el);
    const kill = () => el.remove();
    if (action) {
      el.querySelector('button').addEventListener('click', () => {
        kill();
        action.fn();
      });
    }
    setTimeout(kill, action ? Math.max(ms, 8000) : tone === 'bad' ? Math.max(ms, 6500) : ms);
    while (host.children.length > 3) host.firstChild.remove();
  };
  const errorToast = (err) => toast((err && err.message) || 'Algo deu errado. Tente de novo.', { tone: 'bad' });

  /**
   * Executa um comando no servidor com retorno visual.
   * opts: { btn, ok: 'mensagem de sucesso', form (raiz para marcar o campo com erro), password, quiet }
   * Devolve a resposta ({result, effects, undoToken…}) ou null se falhou (o erro já foi mostrado).
   */
  const act = async (name, input, opts = {}) => {
    const { btn, ok, form } = opts;
    const label = btn ? btn.innerHTML : '';
    if (btn) {
      if (btn.disabled) return null;
      btn.disabled = true;
      btn.classList.add('loading');
    }
    try {
      const res = await Store.cmd(name, input, { password: opts.password });
      if (ok) {
        if (res.undoToken) toast(ok, { action: { label: 'Desfazer', fn: () => undo(res.undoToken) } });
        else toast(ok);
      }
      return res;
    } catch (err) {
      if (err && err.code === 'canceled') return null;
      if (form && err && err.field && markField(form, err.field, err.message)) return null;
      if (!opts.quiet) errorToast(err);
      return null;
    } finally {
      if (btn && document.contains(btn)) {
        btn.disabled = false;
        btn.classList.remove('loading');
        if (btn.innerHTML !== label && !btn.querySelector('.spinner')) btn.innerHTML = label;
      }
    }
  };
  const undo = async (token) => {
    try {
      await Store.undo(token);
      toast('Alteração desfeita', { ic: 'undo' });
    } catch (err) {
      errorToast(err);
    }
  };

  // ---------- menu suspenso ----------
  let openMenu = null;
  const closeMenu = () => {
    if (openMenu) {
      openMenu.remove();
      openMenu = null;
    }
  };
  /** items: [{label, icon?, fn, danger?, checked?, hint?} | '-' | {heading}] */
  const menu = (anchor, items) => {
    closeMenu();
    const el = document.createElement('div');
    el.className = 'menu';
    el.setAttribute('role', 'menu');
    setHTML(
      el,
      items.filter(Boolean).map((it, i) =>
        it === '-'
          ? html`<hr>`
          : it.heading
            ? html`<div class="menu-heading">${it.heading}</div>`
            : html`<button type="button" role="menuitem" data-i="${i}" class="${it.danger ? 'danger' : ''}" ${it.checked ? raw('aria-current="true"') : ''}>${it.icon ? icon(it.icon) : ''}<span class="grow">${it.label}${it.hint ? html`<span class="menu-hint">${it.hint}</span>` : ''}</span>${it.checked ? icon('check', 'muted') : ''}</button>`,
      ),
    );
    const list = items.filter(Boolean);
    document.body.appendChild(el);
    const r = anchor.getBoundingClientRect();
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    let left = r.right - w;
    if (left < 12) left = Math.min(r.left, window.innerWidth - w - 12);
    let top = r.bottom + 6;
    if (top + h > window.innerHeight - 12) top = Math.max(12, r.top - h - 6);
    el.style.left = left + 'px';
    el.style.top = top + 'px';
    openMenu = el;
    menuOpenedAt = Date.now();
    const btns = $$('button', el);
    btns[0] && btns[0].focus();
    el.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-i]');
      if (!b) return;
      closeMenu();
      anchor.focus({ preventScroll: true });
      list[Number(b.dataset.i)].fn();
    });
    el.addEventListener('keydown', (e) => {
      const i = btns.indexOf(document.activeElement);
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        btns[(i + 1) % btns.length].focus();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        btns[(i - 1 + btns.length) % btns.length].focus();
      } else if (e.key === 'Escape') {
        e.stopPropagation();
        closeMenu();
        anchor.focus();
      } else if (e.key === 'Tab') closeMenu();
    });
  };
  document.addEventListener('mousedown', (e) => {
    if (openMenu && !openMenu.contains(e.target)) closeMenu();
  });
  let menuOpenedAt = 0;
  window.addEventListener('resize', closeMenu);
  window.addEventListener(
    'scroll',
    (e) => {
      if (!openMenu || (e.target instanceof Node && openMenu.contains(e.target))) return;
      if (Date.now() - menuOpenedAt < 300) return; // rolagem causada ao abrir (scrollIntoView, foco)
      closeMenu();
    },
    true,
  );

  // ---------- área de transferência ----------
  const copy = async (text, msg = 'Copiado') => {
    try {
      await navigator.clipboard.writeText(text);
      toast(msg, { ic: 'copy' });
    } catch (e) {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      let ok = false;
      try {
        ok = document.execCommand('copy');
      } catch (err) {
        ok = false;
      }
      ta.remove();
      toast(ok ? msg : 'Não foi possível copiar. Selecione o texto e use Ctrl+C.', { ic: ok ? 'copy' : 'alert', tone: ok ? '' : 'bad' });
    }
  };

  // ---------- formulários ----------
  const fid = (name) => 'f-' + name.replace(/[^a-zA-Z0-9_-]/g, '-');
  const getPath = (obj, path) => path.split('.').reduce((o, k) => (o == null ? o : o[k]), obj);
  const setPath = (obj, path, v) => {
    const keys = path.split('.');
    let o = obj;
    keys.slice(0, -1).forEach((k) => {
      if (o[k] == null || typeof o[k] !== 'object') o[k] = {};
      o = o[k];
    });
    o[keys[keys.length - 1]] = v;
  };

  /**
   * Campo de formulário. d: { name, label, type: text|email|tel|date|time|number|money|select|textarea|checkbox|chips|multichips|password,
   *   required, hint (texto ou html), options: [[valor, rótulo, cor?]], placeholder, min, max, step, maxlength, rows, full, mask: cpf,
   *   disabled, autocomplete, attrs (html``) }
   */
  const field = (d, values = {}) => {
    const id = fid(d.name);
    let v = getPath(values, d.name);
    if (v == null) v = d.value ?? '';
    const req = d.required ? html` <span class="req" aria-hidden="true">*</span>` : '';
    const hint = d.hint ? html`<span class="hint" id="${id}-hint">${d.hint}</span>` : '';
    const dis = d.disabled ? raw('disabled') : '';
    const common = html`id="${id}" name="${d.name}" ${d.required ? raw('aria-required="true"') : ''} ${d.hint ? raw(`aria-describedby="${id}-hint"`) : ''} ${dis} ${d.attrs || ''}`;
    let control;
    switch (d.type) {
      case 'select':
        control = html`<select class="input" ${common}>${d.options.map(([ov, ol]) => html`<option value="${ov}" ${String(ov) === String(v) ? raw('selected') : ''}>${ol}</option>`)}</select>`;
        break;
      case 'textarea':
        control = html`<textarea class="input" ${common} rows="${d.rows || 4}" maxlength="${d.maxlength || 5000}" placeholder="${d.placeholder || ''}">${v}</textarea>`;
        break;
      case 'checkbox':
        return html`<label class="check ${d.full ? 'full' : ''}" data-field="${d.name}"><input type="checkbox" ${common} ${v ? raw('checked') : ''}><span>${d.label}${d.hint ? html`<br><span class="hint muted small">${d.hint}</span>` : ''}</span></label>`;
      case 'chips':
      case 'multichips': {
        const multi = d.type === 'multichips';
        const sel = multi ? new Set((v || []).map(String)) : new Set([String(v)]);
        control = html`<div class="chips" role="${multi ? 'group' : 'radiogroup'}" aria-labelledby="${id}-l">${d.options.map(
          ([ov, ol, dot]) =>
            html`<label class="chip">${dot ? html`<span class="dot" style="background:var(--cat-${dot})"></span>` : ''}<input type="${multi ? 'checkbox' : 'radio'}" name="${d.name}" value="${ov}" ${sel.has(String(ov)) ? raw('checked') : ''} ${dis}>${ol}</label>`,
        )}</div>`;
        return html`<div class="field ${d.full ? 'full' : ''}" data-field="${d.name}"><span class="label" id="${id}-l">${d.label}${req}</span>${control}${hint}</div>`;
      }
      case 'money':
        control = html`<input class="input num" ${common} inputmode="decimal" autocomplete="off" value="${v === '' || v == null ? '' : U.num(v, 2)}" placeholder="0,00">`;
        break;
      default: {
        const type = d.type === 'tel' ? 'tel' : d.type || 'text';
        const extra = d.type === 'tel' ? raw('inputmode="tel" data-mask="phone"') : d.mask === 'cpf' ? raw('inputmode="numeric" data-mask="cpf"') : '';
        control = html`<input class="input" type="${type}" ${common} ${extra} value="${v}" placeholder="${d.placeholder || ''}" ${d.min != null ? raw(`min="${U.esc(d.min)}"`) : ''} ${d.max != null ? raw(`max="${U.esc(d.max)}"`) : ''} ${d.step ? raw(`step="${U.esc(d.step)}"`) : ''} ${d.maxlength ? raw(`maxlength="${Number(d.maxlength)}"`) : type === 'text' ? raw('maxlength="200"') : ''} autocomplete="${d.autocomplete || 'off'}">`;
      }
    }
    return html`<div class="field ${d.full ? 'full' : ''}" data-field="${d.name}"><label for="${id}">${d.label}${req}</label>${control}${hint}</div>`;
  };
  /** Lista de campos; itens html`` (títulos de seção etc.) passam direto. */
  const fields = (defs, values) => html`${defs.filter(Boolean).map((d) => (d instanceof SafeHTML ? d : field(d, values)))}`;
  const isDef = (d) => d && !(d instanceof SafeHTML) && typeof d === 'object' && d.name;

  const bindMasks = (root) => {
    root.addEventListener('input', (e) => {
      const m = e.target.dataset && e.target.dataset.mask;
      if (!m) return;
      const fn = m === 'phone' ? U.maskPhone : U.maskCPF;
      const before = e.target.value;
      const after = fn(before);
      if (before !== after) e.target.value = after;
    });
  };

  const readForm = (root, defs) => {
    const out = {};
    defs.filter(isDef).forEach((d) => {
      let v;
      if (d.type === 'checkbox') v = !!($(`#${fid(d.name)}`, root) || {}).checked;
      else if (d.type === 'chips') v = ($(`input[name="${d.name}"]:checked`, root) || {}).value ?? '';
      else if (d.type === 'multichips') v = $$(`input[name="${d.name}"]:checked`, root).map((i) => i.value);
      else {
        const el = $(`#${fid(d.name)}`, root);
        v = el ? (d.type === 'password' ? el.value : el.value.trim()) : '';
        if (d.type === 'money' || d.type === 'number') v = v === '' ? null : U.parseNum(v);
      }
      setPath(out, d.name, v);
    });
    return out;
  };

  const clearErrors = (root) => {
    $$('.field .error', root).forEach((e) => e.remove());
    $$('.input.invalid', root).forEach((e) => {
      e.classList.remove('invalid');
      e.removeAttribute('aria-invalid');
    });
  };
  /** Marca um campo com erro (usado também para erros vindos do servidor). Devolve true se achou o campo. */
  const markField = (root, name, msg, focus = true) => {
    const wrap = $(`[data-field="${CSS.escape(name)}"]`, root);
    if (!wrap) return false;
    const input = $('.input, input', wrap);
    if (input) {
      input.classList.add('invalid');
      input.setAttribute('aria-invalid', 'true');
    }
    $$('.error', wrap).forEach((e) => e.remove());
    wrap.insertAdjacentHTML('beforeend', toHTML(html`<span class="error" role="alert">${msg}</span>`));
    if (focus && input) input.focus();
    return true;
  };

  /** Valida e mostra mensagens ao lado dos campos. Retorna true se está tudo certo. */
  const validate = (root, defs, data) => {
    clearErrors(root);
    let first = null;
    defs.filter(isDef).forEach((d) => {
      const v = getPath(data, d.name);
      let msg = '';
      const blank = v == null || v === '' || (Array.isArray(v) && !v.length) || (typeof v === 'number' && isNaN(v));
      if (d.required && blank && d.type !== 'checkbox') msg = d.type === 'chips' || d.type === 'select' ? 'Escolha uma opção.' : 'Preencha este campo.';
      else if (d.required && d.type === 'checkbox' && !v) msg = 'Marque para continuar.';
      else if (!blank) {
        if (d.type === 'email' && !U.validEmail(v)) msg = 'Confira o e-mail (ex.: nome@email.com).';
        else if (d.type === 'tel' && U.digits(v).length < 10) msg = 'Informe DDD + número.';
        else if (d.mask === 'cpf' && !U.validCPF(v)) msg = 'CPF inválido. Confira os números.';
        else if ((d.type === 'money' || d.type === 'number') && (isNaN(v) || (d.min != null && v < d.min) || (d.max != null && v > d.max)))
          msg = d.max != null ? `Use um valor entre ${d.min ?? 0} e ${d.max}.` : d.min != null && v < d.min ? `O valor mínimo é ${d.min}.` : 'Informe um número válido.';
        else if (d.type === 'date' && !U.isValidDate(v)) msg = 'Data inválida.';
        else if (d.type === 'time' && !U.isValidTime(v)) msg = 'Hora inválida.';
      }
      if (!msg && d.check) msg = d.check(v, data) || '';
      if (msg && markField(root, d.name, msg, false) && !first) first = $(`[data-field="${CSS.escape(d.name)}"] .input, [data-field="${CSS.escape(d.name)}"] input`, root);
    });
    if (first) first.focus();
    return !first;
  };

  /**
   * Gaveta de formulário. onSubmit(data, api) pode ser assíncrono; devolver false ou null mantém aberta
   * (use UI.act dentro dele: em caso de erro devolve null e o erro já aparece no campo ou num aviso).
   */
  const formDrawer = ({ title, sub, defs, values = {}, submitLabel = 'Salvar', onSubmit, extraFoot = '', layout = 'grid', top = '', bottom = '', onMount, size = '', cls = '', wrapCls = '' }) =>
    modal({
      title,
      sub,
      drawer: true,
      size,
      cls,
      wrapCls,
      body: html`${top}<form class="${layout === 'grid' ? 'form-grid' : 'form-section'}" novalidate>${fields(defs, values)}<button type="submit" hidden></button></form>${bottom}`,
      foot: html`${extraFoot}<button class="btn" type="button" data-close>Cancelar</button><button class="btn primary" type="button" data-submit>${icon('check')}<span>${submitLabel}</span></button>`,
      onMount(el, api) {
        const form = $('form', el);
        bindMasks(form);
        const btn = $('[data-submit]', el);
        let busy = false;
        const submit = async (e) => {
          e && e.preventDefault();
          if (busy) return;
          const data = readForm(form, defs);
          if (!validate(form, defs, data)) return;
          busy = true;
          btn.disabled = true;
          try {
            const res = await onSubmit(data, api, form);
            if (res !== false && res !== null && !api.closed) api.close();
          } finally {
            busy = false;
            if (document.contains(btn)) btn.disabled = false;
          }
        };
        form.addEventListener('submit', submit);
        btn.addEventListener('click', submit);
        onMount && onMount(el, api, form);
      },
    });

  // ---------- convites (códigos de acesso) ----------
  /**
   * Mostra o código de primeiro acesso devolvido pelo servidor em `effects` (só aparece uma vez).
   * effect: {code, link, expiresAt, purpose}; person: {name, phone?, email?}
   */
  const showInvite = (effect, person = {}) => {
    const link = effect.link && /^https?:/.test(effect.link) ? effect.link : `${location.origin}${location.pathname}#acesso/${effect.code}`;
    const school = (Store.state && Store.state.settings && Store.state.settings.schoolName) || 'a escola';
    const first = U.firstName(person.name || '');
    const reset = effect.purpose === 'redefinicao';
    const msg = `Olá, ${first}! ${reset ? 'Use este código para criar uma nova senha' : `Seu acesso à Caderneta da ${school} está pronto. Para entrar pela primeira vez`}: abra ${link} e digite o código ${effect.code}. O código vale até ${U.fmtInstant(effect.expiresAt)} e só pode ser usado uma vez.`;
    return modal({
      title: reset ? 'Código para nova senha' : 'Código de primeiro acesso',
      sub: html`Código para <b>${person.name || ''}</b>. Este código só aparece agora: envie pelo WhatsApp, por e-mail ou entregue impresso.`,
      size: 'sm',
      guard: false,
      body: html`<div class="invite-code" aria-label="Código">${effect.code}</div>
        <p class="small muted center">Vale até ${U.fmtInstant(effect.expiresAt)} · uso único · quem recebe cria a própria senha</p>
        <div class="field" style="margin-top:12px"><label for="inv-link">Link de acesso</label><input id="inv-link" class="input" readonly value="${link}"></div>`,
      foot: html`<button type="button" class="btn" data-copy>${icon('copy')}Copiar mensagem</button>
        ${person.phone ? html`<a class="btn" href="${U.whatsappLink(person.phone, msg)}" target="_blank" rel="noopener noreferrer">${icon('phone')}WhatsApp</a>` : ''}
        ${person.email ? html`<a class="btn" href="mailto:${person.email}?subject=${encodeURIComponent('Acesso à Caderneta Escolar')}&body=${encodeURIComponent(msg)}">${icon('mail')}E-mail</a>` : ''}
        <button type="button" class="btn primary" data-close>Pronto</button>`,
      onMount(el) {
        $('[data-copy]', el).addEventListener('click', () => copy(msg, 'Mensagem copiada'));
      },
    });
  };

  // ---------- anexos ----------
  /** Abre o seletor de arquivos e envia. Resolve com [{id, name, type, size}] (vazio se cancelado). */
  const pickFiles = ({ accept = 'image/png,image/jpeg,image/webp,application/pdf', multiple = true } = {}) =>
    new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = accept;
      input.multiple = multiple;
      input.addEventListener('change', async () => {
        const out = [];
        for (const f of input.files) {
          if (f.size > 10 * 1024 * 1024) {
            toast(`"${f.name}" passa de 10 MB.`, { tone: 'bad' });
            continue;
          }
          try {
            out.push(await Api.uploadFile(f));
          } catch (err) {
            errorToast(err);
          }
        }
        resolve(out);
      });
      input.click();
    });
  /** Lista de anexos (ids) como links. */
  const attachments = (ids, { removable = false } = {}) => {
    const files = (ids || []).map((id) => Q.file(id) || { id, name: 'Arquivo', type: '' });
    if (!files.length) return '';
    return html`<div class="attachments">${files.map(
      (f) => html`<span class="attachment"><a href="${Api.fileUrl(f.id)}" target="_blank" rel="noopener noreferrer">${icon(f.type === 'application/pdf' ? 'file' : 'image')}<span>${f.name}</span></a>${removable ? html`<button type="button" class="icon-btn sm" data-remove-file="${f.id}" aria-label="Remover ${f.name}">${icon('x')}</button>` : ''}</span>`,
    )}</div>`;
  };

  // ---------- dica flutuante (gráficos) ----------
  const tipEl = () => document.getElementById('tip');
  document.addEventListener('mouseover', (e) => {
    const t = e.target.closest && e.target.closest('[data-tip]');
    const tip = tipEl();
    if (!tip) return;
    if (!t) {
      tip.hidden = true;
      return;
    }
    tip.textContent = t.dataset.tip;
    tip.hidden = false;
  });
  document.addEventListener('mousemove', (e) => {
    const tip = tipEl();
    if (!tip || tip.hidden) return;
    const w = tip.offsetWidth;
    let x = e.clientX + 14;
    if (x + w > window.innerWidth - 8) x = e.clientX - w - 14;
    tip.style.left = x + 'px';
    tip.style.top = e.clientY + 16 + 'px';
  });

  // ---------- gráficos ----------
  const barPath = (x, y, w, h) => {
    if (h <= 0) return '';
    const r = Math.min(4, w / 2, h);
    const b = y + h;
    return `M${x},${b}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${b}Z`;
  };
  const niceMax = (v) => {
    if (v <= 0) return 1;
    const p = Math.pow(10, Math.floor(Math.log10(v)));
    const n = v / p;
    const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10;
    return step * p;
  };
  /**
   * Colunas verticais com escala única a partir de zero.
   * data: [{ label, short?, value, track?, tip }]. track desenha a meta (ex.: previsto) atrás da coluna.
   */
  const columns = (box, { data, height = 180, fmt = (v) => U.int(v), label = 'last' }) => {
    const W = Math.max(260, box.clientWidth || 600);
    const H = height;
    const padL = 44;
    const padR = 8;
    const padT = 18;
    const padB = 26;
    const innerW = W - padL - padR;
    const innerH = H - padT - padB;
    const maxV = niceMax(Math.max(1, ...data.map((d) => Math.max(d.value, d.track || 0))));
    const band = innerW / Math.max(1, data.length);
    const bw = Math.min(24, band * 0.56);
    const y = (v) => padT + innerH - (v / maxV) * innerH;
    const ticks = [0, maxV / 2, maxV];
    const maxIdx = data.reduce((m, d, i) => (d.value > data[m].value ? i : m), 0);
    const svg = html`<svg class="chart" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${box.dataset.label || 'Gráfico'}">
      ${ticks.map((t) => html`<line class="grid" x1="${padL}" x2="${W - padR}" y1="${y(t)}" y2="${y(t)}"/><text x="${padL - 8}" y="${y(t) + 4}" text-anchor="end">${fmt(t)}</text>`)}
      ${data.map((d, i) => {
        const cx = padL + band * i + band / 2;
        const x = cx - bw / 2;
        const showVal = (label === 'last' && i === data.length - 1) || (label === 'max' && i === maxIdx) || label === 'all';
        return html`<g data-tip="${d.tip || `${d.label}: ${fmt(d.value)}`}"><rect class="hit" x="${padL + band * i}" y="${padT}" width="${band}" height="${innerH}"/>
          ${d.track != null && d.track > 0 ? html`<path class="track" d="${barPath(x, y(d.track), bw, innerH + padT - y(d.track))}"/>` : ''}
          <path class="bar" d="${barPath(x, y(d.value), bw, innerH + padT - y(d.value))}"/></g>
          <text x="${cx}" y="${H - 8}" text-anchor="middle">${band < 46 && d.short ? d.short : d.label}</text>
          ${showVal && d.value > 0 ? html`<text class="val" x="${cx}" y="${y(Math.max(d.value, d.track || 0)) - 6}" text-anchor="middle">${fmt(d.value)}</text>` : ''}`;
      })}</svg>`;
    setHTML(box, svg);
  };

  return {
    $, $$, setHTML, avatar, pill, empty, meter, tabs, seg, hidden, noAccess, kv, spinner, modal, closeAll, confirm, askPassword, toast, errorToast, act, undo,
    menu, closeMenu, copy, field, fields, readForm, validate, clearErrors, markField, bindMasks, formDrawer, showInvite, pickFiles, attachments, columns,
  };
})();

/* Ações compartilhadas entre telas (cada módulo registra as suas: Actions.matricular = …). */
const Actions = {};
/* Estado de tela (filtros, abas, turma escolhida) que sobrevive às re-renderizações. */
const PageState = (() => {
  const map = new Map();
  return {
    /** Objeto mutável da tela, criado com os valores padrão na primeira vez. */
    get(page, defaults = {}) {
      if (!map.has(page)) map.set(page, { ...defaults });
      return map.get(page);
    },
    reset(page) {
      map.delete(page);
    },
    clear: () => map.clear(),
  };
})();
