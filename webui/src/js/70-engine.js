/* ---------- settings engine ----------
 * Global settings are "sections": a declarative description rendered into forms and tables inside the Settings sheet.
 * Per-port settings are "port groups": collapsible groups in the port inspector whose edits become pending changes.
 *
 *   defSettings({ id, group, title, icon, terms, keys, render(c) })     c = context, see makeCtx()
 *   defPortGroup({ id, title, icon, order, keys, summary(p, c), body(ports, c) })
 *
 * Writes from a settings form apply right away (Apply button, confirmation when marked dangerous) and are journaled for Save.
 * Writes from a port group go through the pending tray: c.portField(...) / c.portControl(...) create {t:'pf'} ops. */
/* the feature bundle (sections 72-79): fetched once through the request queue, then served from the browser cache */
const features = {
  loaded: !MORE_URL, p: null,
  load(prio = PRIO.PREFETCH) {
    if (this.loaded) return Promise.resolve();
    if (this.p) return this.p;
    this.p = net.enqueue(prio, 'interface features', async () => {
      let res;
      try { res = await fetch(new URL(MORE_URL, document.baseURI), { credentials: 'same-origin' }); } catch { throw new SwitchError('Could not load the settings pages from the switch.'); }
      if (!res.ok) throw new SwitchError(`Could not load the settings pages (HTTP ${res.status}).`);
      const s = document.createElement('script'); s.textContent = await res.text(); document.head.append(s);
      this.loaded = true; bus.emit('features');
    }).catch(e => { this.p = null; throw e; });
    return this.p;
  },
};
bus.on('features', () => redraw());
const SETTINGS = [];
const SETTINGS_GROUPS = ['Switch', 'Network', 'Time', 'Access and security', 'Switching', 'Traffic', 'Monitoring', 'Maintenance'];
function defSettings(s) { s.keys = (s.keys || []).map(k => typeof k === 'string' ? data.def(k, 'config', { prefetch: false }) : data.def(k.key, k.cls || 'config', k)); SETTINGS.push(s); return s; }
const PORT_GROUPS = [];
function defPortGroup(g) { g.keys = (g.keys || []).map(k => typeof k === 'string' ? data.def(k, 'config') : data.def(k.key, k.cls || 'config', k)); PORT_GROUPS.push(g); PORT_GROUPS.sort((a, b) => (a.order || 50) - (b.order || 50)); prefetch.add('port:' + g.id, g.keys.filter(k => data.defs.get(k).prefetch)); return g; }

/* ---------- helpers usable everywhere ---------- */
/* entries of a wcd section value: the repeated child element, whatever its name (Entry, IfEntry, VLAN, ...) */
function rows(v, wrap) {
  if (!v || typeof v !== 'object') return [];
  if (wrap) return arr(v[wrap]);
  for (const k of Object.keys(v)) if (Array.isArray(v[k]) || (typeof v[k] === 'object' && v[k] && !Array.isArray(v[k]))) return arr(v[k]);
  return [];
}
/* the entry for one port in a per-port section */
function rowOf(key, p, field = 'interfaceName') { return rows(data.get(key)).find(r => r[field] === p.name || r[field] === String(p.no) || r.ifIndex === String(p.no)); }
/* form page values: {name: value} with the $scalar / $repeat?N suffixes intact */
const fv = (key, name) => (data.get(key) || {})[name];
const opt = (pairs) => pairs.map(p => Array.isArray(p) ? p : [p, p]);
const ON_OFF = [['1', 'On'], ['2', 'Off']];
const EN_DIS = [['1', 'Enabled'], ['2', 'Disabled']];

/* ---------- pending ops for per-port sections ---------- */
/* {t:'pf', port, section, wrap, key:'interfaceName', field, value, extra:{...}, label, text} */
pending.pf = function (p, spec, field, value, live) {
  this.put({ t: 'pf', port: p.name, section: spec.section, wrap: spec.wrap || 'Entry', keyField: spec.keyField || 'interfaceName',
    keyValue: spec.keyValue ? spec.keyValue(p) : p.name, extra: spec.extra ? spec.extra(p) : undefined, action: spec.action || 'set',
    field, value: String(value), text: spec.text ? spec.text(field, value, p) : `${spec.label || spec.section}: ${field} → ${value}` }, live == null ? live : String(live));
};

/* ---------- context for settings renderers ---------- */
function makeCtx(s, redrawSection) {
  const c = {
    get: k => data.get(k),
    rows, rowOf, fv,
    m: S.m || model(),
    refresh: () => data.need(s.keys, { prio: PRIO.USER, force: true }).then(() => redrawSection(true)).catch(e => toast(e.message, true)),
    /* a titled block inside a section */
    block: (title, ...kids) => h('div', { class: 'blk' }, title ? h('h3', {}, title) : null, kids),
    note: (...t) => h('p', { class: 'note' }, t),
    kv: pairs => h('dl', { class: 'kv' }, pairs.filter(Boolean).map(([k, v]) => [h('dt', {}, k), h('dd', {}, v == null || v === '' ? '—' : v)])),
    form: spec => formView(spec, s, c),
    table: spec => tableView(spec, s, c),
    /* write helpers: wcd set on a scalar section, and form pages */
    post: (section, body, action = 'set', label) => api.post({ section, action, body }, label || s.title),
    formPost: (path, fields, label) => api.formPost(path, fields, label || s.title),
  };
  return c;
}

/* ---------- form: fields + Apply ----------
 * spec: { title, help, fields: [field], values: {k: v}, apply: async (changed, all) => void, danger?: (changed, all) => string|null,
 *         applyLabel, readOnly }
 * field: { k, label, type: 'text'|'number'|'select'|'toggle'|'seg'|'password'|'textarea'|'static', options, on, off, min, max, unit,
 *          placeholder, help, show: vals => bool, validate: (v, vals) => message|null, width } */
function formView(spec, s, c) {
  const init = { ...spec.values };
  const vals = { ...spec.values };
  const errEl = h('p', { class: 'ferr', role: 'alert' });
  const fieldsEl = h('div', { class: 'ff' });
  const applyBtn = h('button', { class: 'btn pri', type: 'submit', disabled: true }, spec.applyLabel || 'Apply');
  const resetBtn = h('button', { class: 'btn', type: 'button', hidden: true, onclick: () => { Object.assign(vals, init); draw(); } }, 'Reset');
  const changed = () => Object.fromEntries(Object.entries(vals).filter(([k, v]) => String(v ?? '') !== String(init[k] ?? '')));
  const sync = () => { const n = Object.keys(changed()).length; applyBtn.disabled = !n; resetBtn.hidden = !n; };
  function draw() {
    fieldsEl.replaceChildren(...spec.fields.filter(f => !f.show || f.show(vals)).map(f => fieldView(f, vals, v => { vals[f.k] = v; if (spec.fields.some(x => x.show)) draw(); sync(); })));
    sync();
  }
  draw();
  const form = h('form', { class: 'sform', onsubmit: async e => {
    e.preventDefault();
    errEl.textContent = '';
    const ch = changed();
    for (const f of spec.fields) if ((!f.show || f.show(vals)) && f.validate) { const m = f.validate(vals[f.k], vals); if (m) { errEl.textContent = `${f.label}: ${m}`; return; } }
    const warn = spec.danger && spec.danger(ch, vals);
    if (warn && !await confirmBox(spec.title || s.title, [warn], 'Apply anyway', true)) return;
    try {
      await act(applyBtn, () => spec.apply(ch, vals), 'Applied. Not saved yet.');
      journal.add([`${s.title}${spec.title && spec.title !== s.title ? ' · ' + spec.title : ''}: ${Object.keys(ch).map(k => (spec.fields.find(f => f.k === k) || {}).label || k).join(', ')} changed`]);
      Object.assign(init, vals); sync();
      setTimeout(c.refresh, 1200);
    } catch (ex) { errEl.textContent = ex.message; }
  } }, spec.title ? h('h3', {}, spec.title) : null, spec.help ? h('p', { class: 'note' }, spec.help) : null, fieldsEl, errEl,
    spec.readOnly ? null : h('div', { class: 'acts' }, applyBtn, resetBtn));
  return form;
}
function fieldView(f, vals, set) {
  const v = vals[f.k];
  const id = 'f-' + f.k.replace(/[^\w-]/g, '_') + '-' + Math.random().toString(36).slice(2, 6);
  let input;
  switch (f.type) {
    case 'select': input = h('select', { id, onchange: e => set(e.target.value) }, opt(f.options || []).map(([ov, ol]) => h('option', { value: ov, selected: String(ov) === String(v) }, ol))); break;
    case 'toggle': {
      const on = f.on ?? '1', off = f.off ?? '2', isOn = String(v) === String(on);
      input = h('button', { id, type: 'button', class: ['tog', isOn && 'on'], role: 'switch', 'aria-checked': isOn ? 'true' : 'false', onclick: () => set(isOn ? off : on) });
      return h('div', { class: 'fl line' }, h('label', { for: id }, h('b', {}, f.label), f.help ? h('span', { class: 'hint' }, f.help) : null), input);
    }
    case 'seg': input = h('div', { class: 'seg', role: 'radiogroup', id }, opt(f.options).map(([ov, ol]) => h('button', { type: 'button', class: String(ov) === String(v) ? 'on' : '', role: 'radio', 'aria-checked': String(ov) === String(v) ? 'true' : 'false', onclick: () => set(ov) }, ol))); break;
    case 'textarea': input = h('textarea', { id, rows: f.rows || 4, placeholder: f.placeholder || '', oninput: e => set(e.target.value) }, v ?? ''); break;
    case 'static': input = h('div', { class: 'static', id }, v == null || v === '' ? '—' : v); break;
    default: input = h('input', { id, type: f.type === 'number' ? 'number' : f.type === 'password' ? 'password' : 'text', value: v ?? '', min: f.min, max: f.max,
      placeholder: f.placeholder || '', autocomplete: f.type === 'password' ? 'new-password' : 'off', style: f.width ? `max-width:${f.width}` : null, oninput: e => set(e.target.value) });
  }
  return h('div', { class: 'fl' }, h('label', { for: id }, f.label, f.unit ? h('span', { class: 'mu' }, ` (${f.unit})`) : null),
    f.unit && f.type === 'number' ? h('div', { class: 'withunit' }, input) : input, f.help ? h('span', { class: 'hint' }, f.help) : null);
}

/* ---------- table with add / edit / remove ----------
 * spec: { title, help, columns: [{ label, get: row => node|string, num }], rows, empty, key: row => string,
 *         add: { label, fields, values, apply(vals) }, edit: { fields: row => [...], values: row => {...}, apply(changed, all, row) },
 *         remove: { label, confirm: row => string, apply(row) }, max } */
function tableView(spec, s, c) {
  const wrap = h('div', { class: 'stbl' });
  let open = null; // {mode:'add'|'edit', row}
  function draw() {
    const body = spec.rows.length ? h('table', { class: 'tbl' }, h('thead', {}, h('tr', {}, spec.columns.map(col => h('th', { class: col.num ? 'num' : '' }, col.label)), spec.edit || spec.remove ? h('th') : null)),
      h('tbody', {}, spec.rows.map((r, i) => h('tr', { class: i % 2 ? 'alt' : '' }, spec.columns.map(col => h('td', { class: col.num ? 'num' : '' }, col.get(r) ?? '—')),
        spec.edit || spec.remove ? h('td', { class: 'num nowrap' },
          spec.edit && (!spec.edit.can || spec.edit.can(r)) ? h('button', { class: 'btn sm', type: 'button', onclick: () => { open = { mode: 'edit', row: r }; draw(); } }, 'Edit') : null, ' ',
          spec.remove && (!spec.remove.can || spec.remove.can(r)) ? h('button', { class: 'btn sm danger', type: 'button', onclick: async e => {
            const btn = e.currentTarget;
            if (!await confirmBox(spec.remove.title || 'Remove?', [spec.remove.confirm ? spec.remove.confirm(r) : 'This takes effect right away.'], spec.remove.label || 'Remove', true)) return;
            const ok = await act(btn, () => spec.remove.apply(r), 'Removed. Not saved yet.').then(() => true, () => false);
            if (!ok) return;
            spec.rows = spec.rows.filter(x => x !== r); draw(); // gone at once; the re-read confirms
            journal.add([`${s.title}: removed ${spec.key ? spec.key(r) : 'an entry'}`]); setTimeout(c.refresh, 1200);
          } }, spec.remove.label || 'Remove') : null) : null)))) : h('p', { class: 'empty' }, spec.empty || 'None yet.');
    let editor = null;
    if (open) {
      const isAdd = open.mode === 'add', row = open.row;
      editor = h('div', { class: 'tedit' }, formView({ title: isAdd ? (spec.add.label || 'Add') : 'Edit ' + (spec.key ? spec.key(row) : ''),
        fields: isAdd ? spec.add.fields : spec.edit.fields(row), values: isAdd ? (spec.add.values || {}) : spec.edit.values(row),
        applyLabel: isAdd ? (spec.add.label || 'Add') : 'Apply', danger: isAdd ? spec.add.danger : spec.edit.danger,
        apply: async (ch, all) => { if (isAdd) await spec.add.apply(all); else await spec.edit.apply(ch, all, row); open = null; draw(); } }, s, c),
        h('button', { class: 'btn ghost', type: 'button', onclick: () => { open = null; draw(); } }, 'Cancel'));
    }
    wrap.replaceChildren(...[spec.title ? h('h3', {}, spec.title) : null, spec.help ? h('p', { class: 'note' }, spec.help) : null, body, editor,
      spec.add && !open && !(spec.max && spec.rows.length >= spec.max) ? h('button', { class: 'btn', type: 'button', onclick: () => { open = { mode: 'add' }; draw(); } }, icon('plus'), spec.add.label || 'Add') : null].filter(Boolean));
  }
  draw();
  return wrap;
}

/* ---------- Settings sheet: grouped section list + search, one section at a time ---------- */
function openSettings(id) {
  if (!features.loaded) { toast('Loading the settings pages…'); features.load(PRIO.USER).then(() => openSettings(id), e => toast(e.message, true)); return; }
  let cur = SETTINGS.find(s => s.id === (id || store.get('settingsSection'))) || SETTINGS[0];
  let q = '';
  const nav = h('nav', { class: 'snav', 'aria-label': 'Settings sections' }), main = h('div', { class: 'smain' });
  const search = h('input', { type: 'text', placeholder: 'Find a setting', 'aria-label': 'Find a setting', oninput: e => { q = e.target.value.toLowerCase(); drawNav(); } });
  function drawNav() {
    const hit = s => !q || (s.title + ' ' + (s.terms || '') + ' ' + s.group).toLowerCase().includes(q);
    nav.replaceChildren(...SETTINGS_GROUPS.map(g => {
      const items = SETTINGS.filter(s => s.group === g && hit(s));
      return items.length ? h('div', { class: 'sg' }, h('span', { class: 'sgt' }, g), items.map(s => h('button', { class: s === cur ? 'on' : '', onclick: () => { cur = s; store.set('settingsSection', s.id); drawNav(); show(); main.scrollTop = 0; } }, icon(s.icon || 'gear'), s.title))) : null;
    }).filter(Boolean));
  }
  let off = null;
  function show() {
    off && off();
    const s = cur;
    const draw = (force) => {
      if (cur !== s) return;
      const loading = s.keys.some(k => !data.entry(k));
      const at = data.oldest(s.keys);
      let content;
      try { content = loading ? h('p', { class: 'empty' }, 'Reading from the switch…') : s.render(makeCtx(s, draw)); }
      catch (e) { console.error(e); content = h('p', { class: 'ferr' }, 'Could not show this section: ' + e.message); }
      const active = document.activeElement && main.contains(document.activeElement) && /INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName);
      const editing = main.querySelector('.tedit') || main.querySelector('form.sform .btn.pri:not(:disabled)'); // an open editor or unapplied edits
      if ((active || editing) && !loading && main.dataset.sec === s.id && !force) return; // don't pull the form out from under the user
      main.dataset.sec = s.id;
      main.replaceChildren(...[h('div', { class: 'shead' }, icon(s.icon || 'gear'), h('h2', {}, s.title), h('span', { style: 'flex:1' }),
        at ? h('span', { class: 'mu fresh-s' }, icon('clock'), data.loading(s.keys) ? 'reading…' : age(Date.now() - at)) : null,
        h('button', { class: 'btn sm', title: 'Read again from the switch', onclick: () => data.need(s.keys, { prio: PRIO.USER, force: true }).catch(e => toast(e.message, true)) }, icon('refresh'))),
        s.intro ? h('p', { class: 'note' }, s.intro) : null, ...arr(content).flat(Infinity)].filter(Boolean));
    };
    off = bus.on('data', k => { if (s.keys.includes(k)) draw(); });
    draw();
    data.need(s.keys, { prio: PRIO.USER }).catch(e => { if (!e.auth) toast(e.message, true); });
  }
  drawNav(); show();
  sheet('Settings', h('div', { class: 'sset' }, h('div', { class: 'sside' }, search, nav), main), { onclose: () => off && off(), wide: true });
}

/* ---------- port groups in the inspector ---------- */
/* a control bound to a per-port field, staged as a pending change; spec as for pending.pf plus get(entry) -> live value */
function portControl(ports, spec, f) {
  const lives = ports.map(p => { const r = rowOf(spec.key, p, spec.keyField); return r ? String(spec.get ? spec.get(r, f.k) : r[f.k] ?? '') : ''; });
  const cur = ports.map((p, i) => { const o = pending.find(pending.key({ t: 'pf', port: p.name, section: spec.section, field: f.k })); return o ? o.value : lives[i]; });
  const same = cur.every(x => x === cur[0]), pend = ports.some(p => pending.find(pending.key({ t: 'pf', port: p.name, section: spec.section, field: f.k })));
  const set = v => ports.forEach((p, i) => pending.pf(p, spec, f.k, v, lives[i]));
  const lbl = h('span', {}, h('b', {}, f.label), f.help ? h('span', { class: 'hint' }, f.help) : null);
  if (f.type === 'toggle') {
    const on = f.on ?? '1', off = f.off ?? '2', isOn = same && cur[0] === String(on);
    return h('div', { class: 'fl line' }, lbl, h('button', { type: 'button', class: ['tog', isOn && 'on', pend && 'pend'], role: 'switch', 'aria-checked': isOn ? 'true' : 'false', 'aria-label': f.label, onclick: () => set(isOn ? off : on) }));
  }
  if (f.type === 'select') return h('div', { class: 'fl' }, lbl, h('select', { class: pend ? 'pend' : '', 'aria-label': f.label, onchange: e => set(e.target.value) },
    !same ? h('option', { value: '', selected: true, disabled: true }, 'mixed') : null, opt(f.options).map(([ov, ol]) => h('option', { value: ov, selected: same && String(ov) === cur[0] }, ol))));
  return h('div', { class: 'fl' }, lbl, h('input', { type: f.type === 'number' ? 'number' : 'text', class: pend ? 'pend' : '', min: f.min, max: f.max, value: same ? cur[0] : '', placeholder: same ? '' : 'mixed',
    'aria-label': f.label, onchange: e => set(e.target.value.trim()), onkeydown: e => { if (e.key === 'Enter') e.target.blur(); } }));
}
pending.key = (orig => o => o.t === 'pf' ? `pf:${o.port}:${o.section}:${o.field}` : orig(o))(pending.key);
