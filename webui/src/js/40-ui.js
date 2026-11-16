/* ---------- UI primitives: icons, toasts, sheets, confirm, theme ---------- */
const ICONS = {
  vlan: '<rect x="2" y="2.5" width="5" height="5" rx="1"/><rect x="9" y="2.5" width="5" height="5" rx="1"/><rect x="2" y="9.5" width="5" height="5" rx="1"/><rect x="9" y="9.5" width="5" height="5" rx="1"/>',
  link: '<rect x="1.5" y="4" width="13" height="9" rx="1.5"/><path d="M6 13v-2.5h4V13M4 6.5h2M10 6.5h2"/>',
  traffic: '<path d="M3 13V8M6.5 13V4M10 13V7M13.5 13V2.5"/>',
  err: '<path d="M8 2 14.5 13.5h-13Z M8 6.5v3.2M8 11.6v.1"/>',
  dev: '<rect x="2" y="3" width="12" height="8" rx="1"/><path d="M5.5 14h5M8 11v3"/>',
  tree: '<circle cx="8" cy="3" r="1.6"/><circle cx="3.5" cy="12.5" r="1.6"/><circle cx="12.5" cy="12.5" r="1.6"/><path d="M8 4.6V8M8 8 3.5 10.9M8 8l4.5 2.9"/>',
  lag: '<path d="M1.5 4h5c2 0 2.5 4 4.5 4h3.5M1.5 8h13M1.5 12h5c2 0 2.5-4 4.5-4"/>',
  shield: '<path d="M8 1.8 13 3.6v4.1c0 3-2.1 5.4-5 6.5-2.9-1.1-5-3.5-5-6.5V3.6Z"/>',
  leaf: '<path d="M3 13C3 7 7 3 13.5 2.5 13.5 9 9 13 3 13ZM3 13l6-6"/>',
  pulse: '<path d="M1.5 8.5h3l2-5 3 9 2-4h3"/>',
  lock: '<rect x="3" y="7" width="10" height="7" rx="1"/><path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2"/>',
  clock: '<circle cx="8" cy="8" r="6"/><path d="M8 4.5V8l2.5 1.5"/>',
  arrow: '<path d="M2.5 8h11M9.5 4l4 4-4 4"/>',
  pen: '<path d="M2.5 13.5 3.3 10 10.8 2.5l2.7 2.7L6 12.7Z"/>',
  plus: '<path d="M8 3v10M3 8h10"/>',
  minus: '<path d="M3 8h10"/>',
  search: '<circle cx="7" cy="7" r="4.5"/><path d="M10.5 10.5 14 14"/>',
  moon: '<path d="M13 9.5A5.5 5.5 0 0 1 6.5 3a5.5 5.5 0 1 0 6.5 6.5Z"/>',
  sun: '<circle cx="8" cy="8" r="3"/><path d="M8 1.5v1.5M8 13v1.5M1.5 8H3M13 8h1.5M3.4 3.4l1 1M11.6 11.6l1 1M3.4 12.6l1-1M11.6 4.4l1-1"/>',
  save: '<path d="M3 2.5h8l2.5 2.5v8.5h-11Z M5.5 2.5v3.5h5V2.5M5 13.5V9.5h6v4"/>',
  here: '<path d="M5.5 1.5v3M10.5 1.5v3M4 4.5h8v3a4 4 0 0 1-8 0Z M8 11.5v3"/>',
  x: '<path d="M4 4l8 8M12 4l-8 8"/>',
  gear: '<path d="M2 4h6M11 4h3M2 8h2M7 8h7M2 12h8M13 12h1"/><circle cx="9.5" cy="4" r="1.5"/><circle cx="5.5" cy="8" r="1.5"/><circle cx="11.5" cy="12" r="1.5"/>',
  list: '<path d="M5.5 4h8M5.5 8h8M5.5 12h8M2.5 4h.1M2.5 8h.1M2.5 12h.1"/>',
  cable: '<path d="M2 13h3l1-2h4l1 2h3M8 11V6M5.5 3.5h5v2.5h-5Z"/>',
  refresh: '<path d="M13 8a5 5 0 1 1-1.5-3.6M13 2.5v3h-3"/>',
  undo: '<path d="M5 3.5 2.5 6 5 8.5M2.5 6h7a4 4 0 0 1 0 8H6"/>',
};
function icon(name, attrs) {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('class', 'i' + (attrs?.class ? ' ' + attrs.class : ''));
  s.setAttribute('viewBox', '0 0 16 16');
  s.setAttribute('aria-hidden', 'true');
  s.innerHTML = ICONS[name] || '';
  if (attrs?.title) { const t = document.createElementNS('http://www.w3.org/2000/svg', 'title'); t.textContent = attrs.title; s.prepend(t); s.removeAttribute('aria-hidden'); }
  return s;
}
/* session ring: fraction of the idle window left */
function ring(frac, ok) {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('class', 'i'); s.setAttribute('viewBox', '0 0 16 16');
  const a = Math.max(0, Math.min(1, frac)) * 2 * Math.PI, x = 8 + 6 * Math.sin(a), y = 8 - 6 * Math.cos(a);
  s.innerHTML = `<circle cx="8" cy="8" r="6" stroke="var(--off)"/>` + (frac >= 1 ? `<circle cx="8" cy="8" r="6" stroke="${ok}"/>` :
    frac > 0 ? `<path d="M8 2A6 6 0 ${a > Math.PI ? 1 : 0} 1 ${x.toFixed(2)} ${y.toFixed(2)}" stroke="${ok}"/>` : '');
  return s;
}

function toast(msg, bad) {
  let box = $('.toasts');
  if (!box) document.body.append(box = h('div', { class: 'toasts', role: 'status', 'aria-live': 'polite' }));
  const t = h('div', { class: 'toast' + (bad ? ' bad' : '') }, msg);
  box.append(t);
  setTimeout(() => t.remove(), bad ? 8000 : 3500);
}

/* side sheet over the workspace (Settings, Activity, Devices details) */
function sheet(title, body, opts = {}) {
  const prev = document.activeElement;
  const close = () => { scrim.remove(); el.remove(); document.removeEventListener('keydown', key); prev && prev.focus && prev.focus(); opts.onclose && opts.onclose(); };
  const key = e => { if (e.key === 'Escape' && !$('.palette')) close(); };
  const scrim = h('div', { class: 'scrim', onclick: close });
  const el = h('aside', { class: 'sheet' + (opts.wide ? ' wide' : ''), role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
    h('header', {}, h('h2', {}, title), h('span', { style: 'flex:1' }), opts.tools || null,
      h('button', { class: 'btn icon ghost', title: 'Close (Esc)', onclick: close }, icon('x'))),
    h('div', { class: 'sb' }, body));
  document.addEventListener('keydown', key);
  document.body.append(scrim, el);
  (el.querySelector('input, select, button.btn:not(.ghost)') || el).focus?.();
  return close;
}

function confirmBox(title, lines, okLabel, danger) {
  return new Promise(res => {
    let done = false;
    const fin = v => { if (!done) { done = true; close(); res(v); } };
    const body = h('div', {}, arr(lines).map(l => h('p', { style: 'margin:0 0 10px;max-width:60ch' }, l)),
      h('div', { class: 'acts' }, h('button', { class: 'btn ' + (danger ? 'danger' : 'pri'), onclick: () => fin(true) }, okLabel),
        h('button', { class: 'btn', onclick: () => fin(false) }, 'Cancel')));
    const close = sheet(title, body, { onclose: () => fin(false) });
  });
}

/* run an async action from a button: busy state, errors as toasts */
async function act(btn, fn, okMsg) {
  const label = btn ? [...btn.childNodes] : null;
  if (btn) { btn.disabled = true; btn.replaceChildren('Working…'); }
  try {
    const r = await fn();
    if (okMsg) toast(okMsg);
    return r;
  } catch (e) {
    toast(e.message || String(e), true);
    throw e;
  } finally { if (btn) { btn.disabled = false; btn.replaceChildren(...label); } }
}

const theme = {
  get() { return store.get('theme') || 'dark'; },
  apply() { document.documentElement.dataset.theme = this.get(); },
  toggle() { store.set('theme', this.get() === 'dark' ? 'light' : 'dark'); this.apply(); bus.emit('theme'); },
};
theme.apply();
