/* ---------- ⌘K search, Activity, Settings ---------- */
const palette = {
  open() {
    if ($('.palette')) return;
    const m = S.m || model();
    const items = [
      ...m.ports.map(p => ({ icon: 'link', label: `Port ${p.no}${p.label ? ' · ' + p.label : ''}`, hint: speedText(p), terms: `port ${p.no} ${p.name} ${p.desc} ${p.label}`, run: () => { S.sel = [p.name]; S.vlan = null; redraw(); } })),
      ...m.vlans.map(v => ({ icon: 'vlan', label: `VLAN ${v.id}${v.name ? ' · ' + v.name : ''}`, hint: 'VLAN', terms: `vlan ${v.id} ${v.name}`, run: () => { S.lens = 'vlans'; S.vlan = v.id; S.sel = []; redraw(); } })),
      ...m.devices.map(d => ({ icon: 'dev', label: `${d.name ? d.name + ' · ' : ''}${d.mac}${d.ip ? ' · ' + d.ip : ''}`, hint: `port ${portNo(d.port)}`, terms: `${d.mac} ${d.ip} ${d.name} device mac`, run: () => { S.sel = [d.port]; S.vlan = null; redraw(); } })),
      ...LENSES.map(([id, label, ic]) => ({ icon: ic, label: `${label} view`, hint: 'view', terms: `${label} lens view`, run: () => { S.lens = id; store.set('lens', id); redraw(); refresh(); } })),
      ...SETTINGS.map(s => ({ icon: s.icon || 'gear', label: s.title, hint: s.group, terms: `${s.title} ${s.terms || ''} ${s.group} settings`, run: () => openSettings(s.id) })),
      { icon: 'plus', label: 'New VLAN', hint: 'action', terms: 'new vlan create add', run: () => newVlan() },
      { icon: 'save', label: 'Save configuration', hint: 'action', terms: 'save startup configuration copy running write memory', run: () => saveConfig() },
      { icon: 'list', label: 'Activity: event log', hint: 'sheet', terms: 'log events activity syslog history', run: () => openActivity() },
      { icon: 'gear', label: 'Settings', hint: 'sheet', terms: 'settings system name identity session timeout firmware reboot', run: () => openSettings() },
      { icon: 'moon', label: 'Switch theme', hint: 'action', terms: 'theme dark light mode', run: () => theme.toggle() },
      { icon: 'refresh', label: 'Refresh from the switch', hint: 'action', terms: 'refresh reload update', run: () => refresh(true) },
    ];
    let idx = 0, shown = items;
    const input = h('input', { type: 'text', placeholder: 'Port, VLAN, MAC, IP, or what you want to do', 'aria-label': 'Search' });
    const ul = h('ul', { role: 'listbox' });
    const scrim = h('div', { class: 'scrim', onclick: () => close() });
    const box = h('div', { class: 'palette', role: 'dialog', 'aria-label': 'Search' }, input, ul);
    const draw = () => {
      const q = input.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
      shown = items.filter(it => q.every(w => it.terms.toLowerCase().includes(w) || it.label.toLowerCase().includes(w))).slice(0, 40);
      idx = Math.min(idx, Math.max(0, shown.length - 1));
      ul.replaceChildren(...(shown.length ? shown.map((it, i) => h('li', { class: i === idx ? 'on' : '', role: 'option', onclick: () => pick(it), onpointerenter: () => { idx = i; draw(); } },
        icon(it.icon), it.label, h('span', { class: 'mu' }, it.hint))) : [h('li', { class: 'mu' }, 'Nothing matches.')]));
    };
    const close = () => { scrim.remove(); box.remove(); document.removeEventListener('keydown', key, true); };
    const pick = it => { close(); it.run(); };
    const key = e => {
      if (e.key === 'Escape') { e.stopPropagation(); close(); }
      else if (e.key === 'ArrowDown') { idx = Math.min(idx + 1, shown.length - 1); draw(); e.preventDefault(); }
      else if (e.key === 'ArrowUp') { idx = Math.max(idx - 1, 0); draw(); e.preventDefault(); }
      else if (e.key === 'Enter' && shown[idx]) { e.preventDefault(); pick(shown[idx]); }
    };
    input.addEventListener('input', () => { idx = 0; draw(); });
    document.addEventListener('keydown', key, true);
    document.body.append(scrim, box);
    draw(); input.focus();
  },
};
document.addEventListener('keydown', e => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k' && $('.work')) { e.preventDefault(); palette.open(); } });

/* ---------- Activity: the event log, with the per-request connection noise folded ---------- */
const K_LOG = data.def('MemoryLogTable&count=200', 'live');
const SEV = ['Emergency', 'Alert', 'Critical', 'Error', 'Warning', 'Notice', 'Info', 'Debug'];
function openActivity() {
  const body = h('div');
  let showNoise = false;
  const draw = () => {
    const all = arr(data.get(K_LOG)?.LogEntry);
    const noise = e => /https? connection for user .* (ACCEPTED|TERMINATED)/i.test(e.message);
    const list = showNoise ? all : all.filter(e => !noise(e));
    const hidden = all.length - list.length;
    body.replaceChildren(
      h('p', { class: 'mu', style: 'margin:0 0 10px;display:flex;gap:12px;align-items:center;flex-wrap:wrap' }, icon('clock'),
        data.at(K_LOG) ? `read ${age(Date.now() - data.at(K_LOG))} ago` : 'reading…',
        hidden || showNoise ? h('button', { class: 'btn sm', onclick: () => { showNoise = !showNoise; draw(); } }, showNoise ? 'Hide web sign-in noise' : `Show ${hidden} web connection entries`) : null),
      list.length ? h('ul', { class: 'log' }, list.map(e => h('li', {}, h('time', {}, logTime(e.dateTime)), h('span', { class: 'sev s' + e.severityType }, SEV[+e.severityType] || ''),
        h('span', {}, linkPorts(e.message.replace(/^%[\w-]+:\s*/, '')))))) : h('p', { class: 'empty' }, data.get(K_LOG) ? 'No events.' : 'Reading the log…'));
  };
  const off = bus.on('data', k => { if (k === K_LOG) draw(); });
  draw();
  sheet('Activity', body, { onclose: off, tools: h('button', { class: 'btn sm', onclick: () => data.need([K_LOG], { prio: PRIO.USER, force: true }).catch(e => toast(e.message, true)) }, icon('refresh'), 'Refresh') });
  data.need([K_LOG], { prio: PRIO.USER }).catch(e => { if (!e.auth) toast(e.message, true); });
}
/* "gi1/0/7" in a log line becomes a link that selects port 7 */
function linkPorts(text) {
  const out = []; let last = 0;
  for (const mm of text.matchAll(/\bgi1\/0\/(\d+)\b/g)) {
    out.push(text.slice(last, mm.index), h('a', { onclick: () => { $('.sheet header .btn.ghost')?.click(); S.sel = [mm[0]]; S.vlan = null; redraw(); } }, `port ${mm[1]}`));
    last = mm.index + mm[0].length;
  }
  out.push(text.slice(last));
  return out;
}
