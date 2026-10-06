'use strict';
/* Componentes de interface: modal, gaveta, confirmação, toast, menu, formulários, gráficos. */
const UI = (() => {
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const layer = () => document.getElementById('layer');

  const avatar = (name, size = '') => `<span class="avatar c${U.colorIndex(name)} ${size}" aria-hidden="true">${U.esc(U.initials(name))}</span>`;
  const pill = (label, tone = '', plain = false) => `<span class="pill ${tone} ${plain ? 'plain' : ''}">${U.esc(label)}</span>`;
  const empty = ({ icon: ic = 'info', title, text = '', action = '' }) =>
    `<div class="empty">${icon(ic)}<h3>${U.esc(title)}</h3>${text ? `<p>${text}</p>` : ''}${action ? `<div class="btn-row" style="justify-content:center">${action}</div>` : ''}</div>`;
  const meter = (pct, tone = '') => `<div class="meter ${tone}" role="presentation"><span style="width:${U.clamp(pct || 0, 0, 100)}%"></span></div>`;
  const attTone = (rate) => (rate == null ? '' : rate < Q.settings().minAttendance ? 'bad' : rate < Q.settings().minAttendance + 10 ? 'warn' : 'ok');
  const gradeCls = (v) => (v == null ? 'muted' : v < Q.settings().passing ? 'g-low' : 'g-ok');
  const tabs = (items, active, attr = 'data-tab') =>
    `<div class="tabs" role="tablist">${items
      .map(([id, label, extra]) => `<button role="tab" ${attr}="${id}" aria-selected="${id === active}">${label}${extra || ''}</button>`)
      .join('')}</div>`;
  const seg = (items, active, attr) =>
    `<div class="seg" role="group">${items.map(([v, l]) => `<button type="button" ${attr}="${v}" aria-pressed="${String(v) === String(active)}">${l}</button>`).join('')}</div>`;

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
    const first = items[0], last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  /**
   * Abre um modal (ou gaveta lateral). body/foot são HTML.
   * opts: { title, sub, body, foot, size, drawer, cls, onMount(el, api), onClose, guard }
   */
  const modal = (opts) => {
    const prevFocus = document.activeElement;
    const wrap = document.createElement('div');
    wrap.className = 'overlay' + (opts.drawer ? ' drawer-wrap' : '');
    const titleId = 'm' + U.uid();
    wrap.innerHTML = `
      <div class="modal ${opts.size || ''} ${opts.cls || ''}" role="dialog" aria-modal="true" aria-labelledby="${titleId}">
        ${opts.head === false ? '' : `<div class="modal-head"><div><h2 id="${titleId}">${U.esc(opts.title || '')}</h2>${opts.sub ? `<p class="sub">${opts.sub}</p>` : ''}</div>
          <button class="icon-btn" data-close aria-label="Fechar">${icon('x')}</button></div>`}
        ${opts.top || ''}
        <div class="modal-body">${opts.body || ''}</div>
        ${opts.foot ? `<div class="modal-foot">${opts.foot}</div>` : ''}
      </div>`;
    layer().appendChild(wrap);
    const box = wrap.firstElementChild;
    let dirty = false;
    let closed = false;
    box.addEventListener('input', () => (dirty = true));
    box.addEventListener('keydown', (e) => trapTab(e, box));

    const api = {
      el: box,
      wrap,
      setDirty: (v) => (dirty = v),
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
          const ok = await confirm({ title: 'Descartar alterações?', text: 'O que você preencheu neste formulário será perdido.', ok: 'Descartar', danger: true });
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

  const confirm = ({ title, text = '', ok = 'Confirmar', cancel = 'Cancelar', danger = false, requireText = '' }) =>
    new Promise((resolve) => {
      let result = false;
      modal({
        title,
        size: 'sm',
        guard: false,
        body: `<p class="muted">${text}</p>${
          requireText ? `<div class="field" style="margin-top:14px"><label for="cf-text">Para confirmar, digite <b>${U.esc(requireText)}</b></label><input id="cf-text" class="input" autocomplete="off"></div>` : ''
        }`,
        foot: `<button class="btn" data-close>${U.esc(cancel)}</button><button class="btn ${danger ? 'danger solid' : 'primary'}" data-ok ${requireText ? 'disabled' : ''}>${U.esc(ok)}</button>`,
        onMount(el, api) {
          const okBtn = $('[data-ok]', el);
          if (requireText) {
            $('#cf-text', el).addEventListener('input', (e) => (okBtn.disabled = e.target.value.trim().toUpperCase() !== requireText));
          }
          okBtn.addEventListener('click', () => {
            result = true;
            api.close();
          });
          if (!requireText) setTimeout(() => okBtn.focus(), 30);
        },
        onClose: () => resolve(result),
      });
    });

  // ---------- toast ----------
  const toast = (text, { action = null, tone = '', ic = null, ms = 4200 } = {}) => {
    const host = document.getElementById('toasts');
    const el = document.createElement('div');
    el.className = 'toast ' + tone;
    el.innerHTML = `${icon(ic || (tone === 'bad' ? 'alert' : 'checkCircle'))}<span class="grow">${U.esc(text)}</span>${action ? `<button type="button">${U.esc(action.label)}</button>` : ''}`;
    host.appendChild(el);
    const kill = () => el.remove();
    if (action) {
      el.querySelector('button').addEventListener('click', () => {
        action.fn();
        kill();
      });
    }
    setTimeout(kill, action ? Math.max(ms, 7000) : ms);
    while (host.children.length > 3) host.firstChild.remove();
  };
  const undoToast = (text) => toast(text, { action: { label: 'Desfazer', fn: () => Store.undo() && toast('Alteração desfeita', { ic: 'undo' }) } });

  // ---------- menu suspenso ----------
  let openMenu = null;
  const closeMenu = () => {
    if (openMenu) {
      openMenu.remove();
      openMenu = null;
    }
  };
  const menu = (anchor, items) => {
    closeMenu();
    const el = document.createElement('div');
    el.className = 'menu';
    el.setAttribute('role', 'menu');
    el.innerHTML = items
      .map((it, i) =>
        it === '-'
          ? '<hr>'
          : `<button role="menuitem" data-i="${i}" class="${it.danger ? 'danger' : ''}" ${it.checked ? 'aria-current="true"' : ''}>${it.icon ? icon(it.icon) : ''}${it.swatch ? `<span class="swatch c${it.swatch}" style="width:14px;height:14px"></span>` : ''}<span>${U.esc(it.label)}</span>${it.checked ? icon('check', 'muted') : ''}</button>`,
      )
      .join('');
    document.body.appendChild(el);
    const r = anchor.getBoundingClientRect();
    const w = el.offsetWidth, h = el.offsetHeight;
    let left = r.right - w;
    if (left < 12) left = Math.min(r.left, window.innerWidth - w - 12);
    let top = r.bottom + 6;
    if (top + h > window.innerHeight - 12) top = Math.max(12, r.top - h - 6);
    el.style.left = left + 'px';
    el.style.top = top + 'px';
    openMenu = el;
    const btns = $$('button', el);
    btns[0] && btns[0].focus();
    el.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-i]');
      if (!b) return;
      closeMenu();
      anchor.focus({ preventScroll: true });
      items[Number(b.dataset.i)].fn();
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
  window.addEventListener('resize', closeMenu);
  window.addEventListener('scroll', closeMenu, true);

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
  const fid = (name) => 'f-' + name.replace(/\./g, '-');
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

  const field = (d, values = {}) => {
    const id = fid(d.name);
    let v = getPath(values, d.name);
    if (v == null) v = d.value ?? '';
    const req = d.required ? ' <span class="req" aria-hidden="true">*</span>' : '';
    const hint = d.hint ? `<span class="hint" id="${id}-hint">${d.hint}</span>` : '';
    const common = `id="${id}" name="${d.name}" ${d.required ? 'aria-required="true"' : ''} ${d.hint ? `aria-describedby="${id}-hint"` : ''} ${d.attrs || ''}`;
    let control;
    switch (d.type) {
      case 'select':
        control = `<select class="input" ${common}>${d.options
          .map(([ov, ol]) => `<option value="${U.esc(ov)}" ${String(ov) === String(v) ? 'selected' : ''}>${U.esc(ol)}</option>`)
          .join('')}</select>`;
        break;
      case 'textarea':
        control = `<textarea class="input" ${common} rows="${d.rows || 4}" placeholder="${U.esc(d.placeholder || '')}">${U.esc(v)}</textarea>`;
        break;
      case 'checkbox':
        return `<label class="check ${d.full ? 'full' : ''}"><input type="checkbox" ${common} ${v ? 'checked' : ''}><span>${d.label}${d.hint ? `<br><span class="hint muted small">${d.hint}</span>` : ''}</span></label>`;
      case 'chips':
      case 'multichips': {
        const multi = d.type === 'multichips';
        const sel = multi ? new Set(v || []) : new Set([String(v)]);
        control = `<div class="chips" role="${multi ? 'group' : 'radiogroup'}" aria-labelledby="${id}-l">${d.options
          .map(
            ([ov, ol, dot]) =>
              `<label class="chip">${dot ? `<span class="dot" style="background:var(--cat-${dot})"></span>` : ''}<input type="${multi ? 'checkbox' : 'radio'}" name="${d.name}" value="${U.esc(ov)}" ${
                sel.has(String(ov)) || sel.has(ov) ? 'checked' : ''
              }>${U.esc(ol)}</label>`,
          )
          .join('')}</div>`;
        return `<div class="field ${d.full ? 'full' : ''}" data-field="${d.name}"><span class="label" id="${id}-l">${d.label}${req}</span>${control}${hint}</div>`;
      }
      case 'money':
        control = `<input class="input num" ${common} inputmode="decimal" autocomplete="off" value="${v === '' ? '' : U.esc(U.num(v, 2))}" placeholder="0,00">`;
        break;
      default: {
        const type = d.type === 'tel' ? 'tel' : d.type || 'text';
        const extra = d.type === 'tel' ? 'inputmode="tel" data-mask="phone"' : d.mask === 'cpf' ? 'inputmode="numeric" data-mask="cpf"' : '';
        control = `<input class="input" type="${type}" ${common} ${extra} value="${U.esc(v)}" placeholder="${U.esc(d.placeholder || '')}" ${d.min != null ? `min="${d.min}"` : ''} ${
          d.max != null ? `max="${d.max}"` : ''
        } ${d.step ? `step="${d.step}"` : ''} autocomplete="${d.autocomplete || 'off'}">`;
      }
    }
    return `<div class="field ${d.full ? 'full' : ''}" data-field="${d.name}"><label for="${id}">${d.label}${req}</label>${control}${hint}</div>`;
  };
  const fields = (defs, values) => defs.map((d) => (typeof d === 'string' ? d : field(d, values))).join('');

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
    defs.forEach((d) => {
      if (typeof d === 'string') return;
      let v;
      if (d.type === 'checkbox') v = $(`#${fid(d.name)}`, root).checked;
      else if (d.type === 'chips') v = ($(`input[name="${d.name}"]:checked`, root) || {}).value ?? '';
      else if (d.type === 'multichips') v = $$(`input[name="${d.name}"]:checked`, root).map((i) => i.value);
      else {
        const el = $(`#${fid(d.name)}`, root);
        v = el ? el.value.trim() : '';
        if (d.type === 'money' || d.type === 'number') v = v === '' ? null : U.parseNum(v);
      }
      setPath(out, d.name, v);
    });
    return out;
  };

  /** Valida e mostra mensagens ao lado dos campos. Retorna true se está tudo certo. */
  const validate = (root, defs, data) => {
    $$('.field .error', root).forEach((e) => e.remove());
    $$('.input.invalid', root).forEach((e) => {
      e.classList.remove('invalid');
      e.removeAttribute('aria-invalid');
    });
    let first = null;
    defs.forEach((d) => {
      if (typeof d === 'string') return;
      const v = getPath(data, d.name);
      let msg = '';
      const blank = v == null || v === '' || (Array.isArray(v) && !v.length) || (typeof v === 'number' && isNaN(v));
      if (d.required && blank) msg = d.type === 'chips' || d.type === 'select' ? 'Escolha uma opção.' : 'Preencha este campo.';
      else if (!blank) {
        if (d.type === 'email' && !U.validEmail(v)) msg = 'Confira o e-mail (ex.: nome@email.com).';
        else if (d.type === 'tel' && U.digits(v).length < 10) msg = 'Informe DDD + número.';
        else if (d.mask === 'cpf' && !U.validCPF(v)) msg = 'CPF inválido. Confira os números.';
        else if ((d.type === 'money' || d.type === 'number') && (isNaN(v) || (d.min != null && v < d.min) || (d.max != null && v > d.max)))
          msg = d.max != null ? `Use um valor entre ${d.min ?? 0} e ${d.max}.` : 'Informe um número válido.';
        else if (d.type === 'date' && !U.isValidDate(v)) msg = 'Data inválida.';
      }
      if (!msg && d.check) msg = d.check(v, data) || '';
      if (msg) {
        const wrap = $(`[data-field="${d.name}"]`, root);
        if (!wrap) return;
        const input = $(`#${fid(d.name)}`, wrap);
        if (input) {
          input.classList.add('invalid');
          input.setAttribute('aria-invalid', 'true');
        }
        wrap.insertAdjacentHTML('beforeend', `<span class="error" role="alert">${U.esc(msg)}</span>`);
        if (!first) first = input || $('input', wrap);
      }
    });
    if (first) first.focus();
    return !first;
  };

  /** Gaveta de formulário pronta: fields + salvar. */
  const formDrawer = ({ title, sub, defs, values = {}, submitLabel = 'Salvar', onSubmit, extraFoot = '', layout = 'grid', top = '', onMount }) =>
    modal({
      title,
      sub,
      drawer: true,
      body: `${top}<form class="${layout === 'grid' ? 'form-grid' : 'form-section'}" novalidate>${fields(defs, values)}<button type="submit" hidden></button></form>`,
      foot: `${extraFoot}<button class="btn" type="button" data-close>Cancelar</button><button class="btn primary" type="button" data-submit>${icon('check')}${U.esc(submitLabel)}</button>`,
      onMount(el, api) {
        const form = $('form', el);
        bindMasks(form);
        const submit = (e) => {
          e && e.preventDefault();
          const data = readForm(form, defs);
          if (!validate(form, defs, data)) return;
          const res = onSubmit(data, api);
          if (res !== false) api.close();
        };
        form.addEventListener('submit', submit);
        $('[data-submit]', el).addEventListener('click', submit);
        onMount && onMount(el, api);
      },
    });

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
   * data: [{ label, value, track?, tip }]. track desenha a meta (ex.: previsto) atrás da coluna.
   */
  const columns = (box, { data, height = 180, fmt = (v) => U.int(v), label = 'last' }) => {
    const W = Math.max(260, box.clientWidth || 600);
    const H = height;
    const padL = 44, padR = 8, padT = 18, padB = 26;
    const innerW = W - padL - padR, innerH = H - padT - padB;
    const maxV = niceMax(Math.max(1, ...data.map((d) => Math.max(d.value, d.track || 0))));
    const band = innerW / data.length;
    const bw = Math.min(24, band * 0.56);
    const y = (v) => padT + innerH - (v / maxV) * innerH;
    const ticks = [0, maxV / 2, maxV];
    let svg = `<svg class="chart" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${U.esc(box.dataset.label || 'Gráfico')}">`;
    ticks.forEach((t) => {
      svg += `<line class="grid" x1="${padL}" x2="${W - padR}" y1="${y(t)}" y2="${y(t)}"/><text x="${padL - 8}" y="${y(t) + 4}" text-anchor="end">${U.esc(fmt(t))}</text>`;
    });
    const maxIdx = data.reduce((m, d, i) => (d.value > data[m].value ? i : m), 0);
    data.forEach((d, i) => {
      const cx = padL + band * i + band / 2;
      const x = cx - bw / 2;
      svg += `<g data-tip="${U.esc(d.tip || `${d.label}: ${fmt(d.value)}`)}">`;
      svg += `<rect class="hit" x="${padL + band * i}" y="${padT}" width="${band}" height="${innerH}"/>`;
      if (d.track != null && d.track > 0) svg += `<path class="track" d="${barPath(x, y(d.track), bw, innerH + padT - y(d.track))}"/>`;
      svg += `<path class="bar" d="${barPath(x, y(d.value), bw, innerH + padT - y(d.value))}"/>`;
      svg += `</g>`;
      // com pouco espaço por coluna, usa o rótulo curto (ex.: só o dia)
      svg += `<text x="${cx}" y="${H - 8}" text-anchor="middle">${U.esc(band < 46 && d.short ? d.short : d.label)}</text>`;
      const showVal = (label === 'last' && i === data.length - 1) || (label === 'max' && i === maxIdx) || label === 'all';
      if (showVal && d.value > 0) svg += `<text class="val" x="${cx}" y="${y(Math.max(d.value, d.track || 0)) - 6}" text-anchor="middle">${U.esc(fmt(d.value))}</text>`;
    });
    svg += '</svg>';
    box.innerHTML = svg;
  };

  return {
    $, $$, avatar, pill, empty, meter, attTone, gradeCls, tabs, seg, modal, confirm, toast, undoToast, menu, closeMenu, copy,
    field, fields, readForm, validate, bindMasks, formDrawer, columns,
  };
})();

/* Registro das páginas e das ações compartilhadas (preenchidos pelos arquivos em js/pages). */
const Pages = {};
const Actions = {};
/* Estado de tela (filtros, abas) que sobrevive às re-renderizações. */
const View = {};
