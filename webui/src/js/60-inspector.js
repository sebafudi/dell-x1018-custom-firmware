/* ---------- inspector: everything about the selection, edits become pending changes ---------- */
/* live VLANs plus the ones pending creation */
function allVlans(m) {
  const created = pending.items.filter(o => o.t === 'vlan+' && !m.vlans.some(v => v.id === o.vid)).map(o => ({ id: o.vid, name: o.name, colour: vcol.of(o.vid), isNew: true }));
  return [...m.vlans, ...created].sort((a, b) => a.id - b.id);
}
function rangeText(nos) {
  const s = fmtList(new Set(nos)).replace(/-/g, '–').replace(/,/g, ', ');
  return (nos.length > 1 ? 'Ports ' : 'Port ') + s;
}

/* what the inspector shows; a new subject starts scrolled to the top with every group closed */
let inspSubject = '';
function renderInspector() {
  const ins = $('.insp');
  const subject = S.vlan != null ? 'v' + S.vlan : S.sel.join(',');
  const old = $('.insp-b', ins), same = subject === inspSubject, top = same && old ? old.scrollTop : 0;
  if (!same) { inspSubject = subject; openGroups.clear(); }
  const busy = same && document.activeElement && ins.contains(document.activeElement) && /INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName);
  const body = busy ? old : h('div', { class: 'insp-b' }, inspectorBody(S.m));
  const closeN = (S.sel.length || S.vlan != null) ? h('button', { class: 'btn icon ghost close-n', title: 'Clear the selection (Esc)', 'aria-label': 'Clear the selection', onclick: clearSel }, icon('x')) : null;
  ins.replaceChildren(...[resizer(), closeN, body, trayView(S.m)].filter(Boolean));
  body.scrollTop = top;
  ins.classList.toggle('closed', !S.sel.length && S.vlan == null && !pending.count());
}
/* drag the inspector's left edge to resize it; the width is remembered in this browser (double-click: default) */
function resizer() {
  return h('div', { class: 'rz', role: 'separator', 'aria-orientation': 'vertical', 'aria-label': 'Resize the side panel', title: 'Drag to resize, double-click to reset',
    ondblclick: () => { store.del('inspW'); document.documentElement.style.removeProperty('--insp-w'); },
    onpointerdown: e => {
      e.preventDefault(); const el = e.currentTarget; el.setPointerCapture(e.pointerId); document.body.classList.add('resizing');
      const move = ev => { const w = Math.round(Math.min(Math.max(innerWidth - ev.clientX, 300), Math.max(300, innerWidth - 760))); document.documentElement.style.setProperty('--insp-w', w + 'px'); store.set('inspW', w); };
      const up = () => { el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); document.body.classList.remove('resizing'); };
      el.addEventListener('pointermove', move); el.addEventListener('pointerup', up);
    } });
}
/* a collapsible group; body() runs only while it is open */
function grp(id, ic, title, summary, body) {
  return h('details', { class: 'grp', 'data-g': id, open: openGroups.has(id), ontoggle: e => {
    if (e.target.open) openGroups.add(id); else openGroups.delete(id);
    const gb = e.target.querySelector('.gb'); gb.replaceChildren(...(e.target.open ? arr(body()).flat(Infinity).filter(Boolean) : []));
  } }, h('summary', {}, icon(ic), h('b', {}, title), h('span', {}, summary)), h('div', { class: 'gb' }, openGroups.has(id) ? body() : null));
}

function inspectorBody(m) {
  if (S.vlan != null) return vlanInspector(m, S.vlan);
  const ports = S.sel.map(n => m.byName.get(n)).filter(Boolean);
  if (ports.length) return portInspector(m, ports);
  return switchInspector(m);
}

/* ---------- nothing selected: the switch ---------- */
function switchInspector(m) {
  const s = data.get(K.sys) || {}, ip = arr(data.get(K.ip)?.ifEntry)[0] || {}, gw = arr(data.get(K.gw)?.GWEntry)[0] || {};
  const up = m.ports.filter(p => p.up), errs = m.ports.filter(p => p.errors);
  return [h('h2', {}, s.systemName || 'x1018'), h('p', { class: 'sub' }, h('span', {}, s.systemDescription || 'Dell Networking X1018')),
    h('div', { class: 'f' }, h('dl', { class: 'kv' },
      h('dt', {}, 'Ports linked'), h('dd', {}, h('span', { class: 'cell' }, h('i', { class: 'led lg' }), `${up.length} of ${m.ports.length}`)),
      h('dt', {}, 'VLANs'), h('dd', {}, h('span', { class: 'chips' }, m.vlans.map(v => h('button', { class: 'chip', style: `--c:${v.colour}`, onclick: () => { S.lens = 'vlans'; S.vlan = v.id; redraw(); } },
        h('span', { class: 'bd sm' }, v.id), v.name || (v.id === 1 ? 'default' : ''))))),
      h('dt', {}, 'Address'), h('dd', {}, ip.IPAddr ? `${ip.IPAddr}${ip.owner === '2' ? ' (from DHCP)' : ''}` : '—'),
      h('dt', {}, 'Gateway'), h('dd', {}, gw.IPAddr || '—'),
      h('dt', {}, 'Up for'), h('dd', {}, s.systemUpTime ? uptime(s.systemUpTime) : '—'),
      h('dt', {}, 'Firmware'), h('dd', {}, s.firmwareVersion || '—'),
      errs.length ? [h('dt', {}, 'Errors'), h('dd', { style: 'color:var(--amb)' }, `on port${errs.length > 1 ? 's' : ''} ${errs.map(p => p.no).join(', ')}`)] : null)),
    h('p', { class: 'mu', style: 'margin-top:14px' }, 'Select ports on the panel (drag or shift-click for several) or a VLAN row to edit them.')];
}

/* ---------- one or more ports ---------- */
function portInspector(m, ports) {
  const one = ports.length === 1 ? ports[0] : null;
  const fut = ports.map(p => pending.future(p));
  const us = fut.map(f => [...f.U][0] || 0), sameU = us.every(u => u === us[0]);
  const lives = ports.map(p => [...p.vlU][0] || 0);
  const up = ports.filter(p => p.up);
  const nodes = [h('h2', {}, rangeText(ports.map(p => p.no))),
    h('p', { class: 'sub' }, ports.length > 1 ? h('span', {}, `${ports.length} selected`) : null,
      up.length ? h('span', { title: 'linked' }, h('i', { class: 'led lg' }), one ? speedText(one) : up.length) : null,
      ports.length - up.length ? h('span', { title: 'no link' }, h('i', { class: 'led' }), one ? speedText(one) : ports.length - up.length) : null,
      ports.some(p => p.name === m.mine) ? h('span', { title: 'Your computer reaches the switch through this port' }, icon('here'), 'your connection') : null)];

  if (one) {
    const curDesc = (pending.find(`port:${one.name}:interfaceDescription`)?.value) ?? one.desc;
    nodes.push(h('div', { class: 'f' }, h('label', { for: 'pdesc' }, 'Name'),
      h('input', { id: 'pdesc', type: 'text', maxlength: 64, value: curDesc, placeholder: one.neighbors?.[0]?.name || 'e.g. NAS, living room AP',
        onchange: e => pending.put({ t: 'port', port: one.name, field: 'interfaceDescription', value: e.target.value.trim() }, one.desc),
        onkeydown: e => { if (e.key === 'Enter') e.target.blur(); } })));
  }

  // network (untagged VLAN)
  const vopts = m.vlans.map(v => h('option', { value: v.id, selected: sameU && us[0] === v.id }, `${v.id} · ${v.name || (v.id === 1 ? 'default' : 'unnamed')}`));
  const created = pending.items.filter(o => o.t === 'vlan+').map(o => h('option', { value: o.vid, selected: sameU && us[0] === o.vid }, `${o.vid} · ${o.name || 'new'} (new)`));
  const uSel = h('select', { id: 'puntag', onchange: e => {
    const v = e.target.value;
    if (v === 'new') { e.target.value = sameU ? us[0] : ''; newVlanFor(ports); return; }
    for (const p of ports) pending.setUntagged(p, v === '0' ? 0 : +v);
  } }, !sameU ? h('option', { value: '', selected: true, disabled: true }, 'mixed') : null, vopts, created,
    h('option', { value: '0', selected: sameU && !us[0] }, 'none (tagged only)'), h('option', { value: 'new' }, '+ New VLAN…'));
  const moved = ports.filter((p, i) => us[i] !== lives[i]);
  nodes.push(h('div', { class: 'f' }, h('label', { for: 'puntag' }, 'Network (untagged VLAN)'),
    h('div', { style: 'display:flex;gap:8px;align-items:center' }, sameU && us[0] ? h('span', { class: 'bd sm', style: `--c:${vcol.of(us[0])}` }, us[0]) : null, uSel),
    moved.length ? h('p', { class: 'mv' }, moved.slice(0, 3).map(p => [h('span', { class: 'pn' }, p.no)]),
      lives[ports.indexOf(moved[0])] ? h('span', { class: 'bd sm', style: `--c:${vcol.of(lives[ports.indexOf(moved[0])])}` }, lives[ports.indexOf(moved[0])]) : h('span', { class: 'mu' }, 'none'),
      icon('arrow'), us[ports.indexOf(moved[0])] ? h('span', { class: 'bd sm pend', style: `--c:${vcol.of(us[ports.indexOf(moved[0])])}` }, us[ports.indexOf(moved[0])]) : h('span', {}, 'none'), 'pending') : null));

  // tagged VLANs: chips toggle tagged membership
  const allT = new Set(fut.flatMap(f => [...f.T]));
  const tagChips = [...allT].sort((a, b) => a - b).map(v => {
    const all = fut.every(f => f.T.has(v)), pend = ports.some(p => pending.memb(p, v).pend);
    return h('button', { class: 'chip', title: `Remove VLAN ${v} (tagged) from ${ports.length > 1 ? 'these ports' : 'this port'}`, style: `--c:${vcol.of(v)}`,
      onclick: () => { for (const p of ports) if (pending.future(p).T.has(v)) pending.put({ t: 'mem', port: p.name, vid: v, to: '-' }, pending.live(p, v)); } },
      h('span', { class: 'bd sm t' + (pend ? ' pend add' : '') }, v), all ? '' : h('span', { class: 'mu' }, `${fut.filter(f => f.T.has(v)).length} of ${ports.length}`), icon('x'));
  });
  const addable = allVlans(m).filter(v => !fut.every(f => f.T.has(v.id) || f.U.has(v.id)));
  const add = h('select', { 'aria-label': 'Add a tagged VLAN', style: 'width:auto', onchange: e => {
    const v = +e.target.value; if (!v) return;
    for (const p of ports) if (!pending.future(p).U.has(v)) pending.put({ t: 'mem', port: p.name, vid: v, to: 't' }, pending.live(p, v));
  } }, h('option', { value: '' }, '+ Add tagged'), addable.map(v => h('option', { value: v.id }, `${v.id} · ${v.name || 'unnamed'}`)));
  nodes.push(h('div', { class: 'f' }, h('span', { class: 'lbl' }, 'Tagged VLANs'),
    h('div', { class: 'line' }, tagChips.length ? h('span', { class: 'chips' }, tagChips) : h('span', { class: 'mu' }, 'None'), add)));

  // enabled
  const enNow = ports.map(p => (pending.find(`port:${p.name}:adminState`)?.value ?? (p.enabled ? '1' : '2')) === '1');
  const enPend = ports.some(p => pending.find(`port:${p.name}:adminState`));
  nodes.push(h('div', { class: 'f' }, h('div', { class: 'line' }, h('span', {}, h('b', {}, 'Port enabled'), h('br'),
    h('span', { class: 'mu', style: 'font-size:12px' }, enNow.every(Boolean) ? (ports.length > 1 ? `all ${ports.length} ports` : 'traffic flows') : enNow.some(Boolean) ? 'some ports' : 'port is shut down')),
    h('button', { class: ['tog', enNow.every(Boolean) && 'on', enPend && 'pend'], role: 'switch', 'aria-checked': enNow.every(Boolean) ? 'true' : 'false', 'aria-label': 'Port enabled',
      onclick: () => { const v = enNow.every(Boolean) ? '2' : '1'; for (const p of ports) pending.put({ t: 'port', port: p.name, field: 'adminState', value: v }, p.enabled ? '1' : '2'); } }))));

  const groups = []; // [id, node]
  // link settings (copper)
  if (one && !one.sfp) {
    const cur = one.autoneg ? 'auto' : `${one.speedAdmin}-${one.duplexAdmin}`;
    const pSpeed = pending.find(`port:${one.name}:autoNegotiationAdminEnabled`) || pending.find(`port:${one.name}:speedAdmin`);
    groups.push(['link', grp('link', 'link', 'Link', one.autoneg ? 'automatic' : speedText(one), () => [h('dl', { class: 'kv' }, h('dt', {}, 'Now'), h('dd', {}, speedText(one)), h('dt', {}, 'Media'), h('dd', {}, one.sfp ? 'fibre (SFP)' : 'copper')),
        h('div', {}, h('label', { class: 'mu', style: 'font-size:12px;display:block;margin-bottom:6px' }, 'Speed and duplex'),
          h('select', { class: pSpeed ? 'pend' : '', onchange: e => setSpeed(one, e.target.value, cur) },
            [['auto', 'Automatic (recommended)'], ['100-3', '100 Mb/s full duplex'], ['100-2', '100 Mb/s half duplex'], ['10-3', '10 Mb/s full duplex'], ['10-2', '10 Mb/s half duplex']]
              .map(([v, t]) => h('option', { value: v, selected: v === cur }, t)))),
        h('p', { class: 'mu', style: 'margin:0;font-size:12px' }, '1 Gb/s always negotiates automatically. Fix the speed only for devices that fail to negotiate.')])]);
  }

  // what's on the port
  if (one) {
    const seen = [...(one.neighbors || []).map(n => h('div', {}, h('b', {}, n.name), h('span', { class: 'mu' }, ' via LLDP'))),
      ...(one.macs || []).slice(0, 8).map(d => h('div', { class: 'mono' }, d.mac, d.ip ? h('span', { class: 'mu' }, '  ' + d.ip) : null, h('span', { class: 'bd sm', style: `--c:${vcol.of(d.vid)};margin-left:8px;vertical-align:middle`, title: `VLAN ${d.vid}` }, d.vid)))];
    groups.push(['seen', grp('seen', 'dev', 'Seen here', data.get(K.fdb) ? (one.neighbors?.[0]?.name || `${one.macs?.length || 0} device${one.macs?.length === 1 ? '' : 's'}`) : 'reading…', () => [
      seen.length ? seen : h('span', { class: 'mu' }, 'Nothing learned on this port.'),
      (one.macs || []).length > 8 ? h('button', { class: 'btn sm', onclick: () => { devFilter = one.name; setLens('devices'); } }, `All ${one.macs.length} devices`) : null])]);
    groups.push(['counters', grp('counters', 'pulse', 'Counters', one.errors ? `${count(one.errors)} errors` : 'no errors', () => h('dl', { class: 'kv' },
      h('dt', {}, 'Received'), h('dd', {}, bytes(one.rx)), h('dt', {}, 'Sent'), h('dd', {}, bytes(one.tx)),
      h('dt', {}, 'Rate'), h('dd', {}, rateText(one.rate)), h('dt', {}, 'Errors'), h('dd', {}, count(one.errors))))]);
  }
  for (const g of PORT_GROUPS) {
    let summary = '';
    try { summary = g.summary ? g.summary(ports, ctxPort()) : ''; } catch { summary = ''; }
    const det = h('details', { class: 'grp', 'data-g': g.id, open: openGroups.has(g.id), ontoggle: e => {
      if (e.target.open) { openGroups.add(g.id); data.need(g.keys, { prio: PRIO.USER }).catch(() => {}); } else openGroups.delete(g.id);
      fillGroup(e.target, g, ports);
    } }, h('summary', {}, icon(g.icon || 'gear'), h('b', {}, g.title), h('span', {}, g.keys.some(k => !data.entry(k)) ? 'reading…' : summary)), h('div', { class: 'gb' }));
    if (openGroups.has(g.id)) fillGroup(det, g, ports);
    groups.push([g.id, det]);
  }
  return [...nodes, h('div', { class: 'grps' }, groups.map(g => g[1]))];
}
const openGroups = new Set();
const ctxPort = () => ({ m: S.m, rows, rowOf, fv, get: k => data.get(k), control: portControl, kv: pairs => h('dl', { class: 'kv' }, pairs.filter(Boolean).map(([k, v]) => [h('dt', {}, k), h('dd', {}, v == null || v === '' ? '—' : v)])),
  note: (...t) => h('p', { class: 'note' }, t), settings: id => openSettings(id) });
function fillGroup(det, g, ports) {
  const gb = det.querySelector('.gb');
  if (!det.open) { gb.replaceChildren(); return; }
  if (g.keys.some(k => !data.entry(k))) { gb.replaceChildren(h('span', { class: 'mu' }, 'Reading from the switch…')); return; }
  try { gb.replaceChildren(...arr(g.body(ports, ctxPort())).flat(Infinity).filter(Boolean)); } catch (e) { console.error(e); gb.replaceChildren(h('span', { class: 'ferr' }, 'Could not show this: ' + e.message)); }
}
function setSpeed(p, v, cur) {
  if (v === 'auto') { pending.put({ t: 'port', port: p.name, field: 'autoNegotiationAdminEnabled', value: '1' }, p.autoneg ? '1' : '2'); pending.drop({ t: 'port', port: p.name, field: 'speedAdmin' }); pending.drop({ t: 'port', port: p.name, field: 'duplexAdminMode' }); return; }
  const [s, d] = v.split('-');
  pending.put({ t: 'port', port: p.name, field: 'autoNegotiationAdminEnabled', value: '2' }, p.autoneg ? '1' : '2');
  pending.put({ t: 'port', port: p.name, field: 'speedAdmin', value: s }, p.speedAdmin);
  pending.put({ t: 'port', port: p.name, field: 'duplexAdminMode', value: d }, p.duplexAdmin);
}
function newVlanFor(ports) { newVlan(ports); }

/* ---------- a VLAN ---------- */
function vlanInspector(m, vid) {
  const v = m.vlans.find(x => x.id === vid) || pending.items.filter(o => o.t === 'vlan+').map(o => ({ id: o.vid, name: o.name, isNew: true })).find(x => x.id === vid);
  if (!v) { S.vlan = null; return switchInspector(m); }
  const members = m.ports.map(p => ({ p, mb: pending.memb(p, vid) })).filter(x => x.mb.to !== '-' || x.mb.pend);
  const rn = pending.find(`vlan:${vid}`);
  const deleting = rn?.t === 'vlan-';
  const nameVal = rn && (rn.t === 'vlan~' || rn.t === 'vlan+') ? rn.name : v.name;
  return [h('h2', { style: `display:flex;align-items:center;gap:10px;--c:${vcol.of(vid)}` }, h('span', { class: 'bd' }, vid), v.name || (vid === 1 ? 'default' : 'VLAN ' + vid)),
    h('p', { class: 'sub' }, h('span', {}, `${members.filter(x => x.mb.to === 'u').length} untagged`), h('span', {}, `${members.filter(x => x.mb.to === 't').length} tagged`),
      v.isNew ? h('span', {}, 'new, not applied yet') : null),
    h('div', { class: 'f' }, h('label', { for: 'vname' }, 'Name'), h('input', { id: 'vname', type: 'text', maxlength: 32, value: nameVal, disabled: vid === 1,
      onchange: e => { const n = e.target.value.trim(); if (v.isNew) pending.put({ t: 'vlan+', vid, name: n }); else if (n !== v.name) pending.put({ t: 'vlan~', vid, name: n }); else pending.drop({ t: 'vlan~', vid }); },
      onkeydown: e => { if (e.key === 'Enter') e.target.blur(); } })),
    h('div', { class: 'f' }, h('span', { class: 'lbl' }, 'Ports'),
      h('p', { style: 'margin:0 0 8px' }, 'Click ports on the panel (or cells in its row) to cycle: ', h('span', { class: 'mu' }, 'not a member → untagged → tagged.')),
      members.length ? h('div', { class: 'chips' }, members.map(({ p, mb }) => h('button', { class: 'chip', onclick: () => { S.vlan = null; S.sel = [p.name]; redraw(); }, title: `Open port ${p.no}` },
        h('span', { class: ['sq', mb.to === 't' && 't', mb.to === '-' && 'rm', mb.pend && 'pend', mb.pend && (mb.to === '-' ? 'rmv' : 'add')], style: `--c:${vcol.of(vid)}` }), p.no, p.desc ? h('span', { class: 'mu' }, p.desc) : null)))
        : h('span', { class: 'mu' }, 'No ports yet.')),
    vid !== 1 ? h('div', { class: 'f' }, deleting
      ? h('button', { class: 'btn', onclick: () => pending.drop({ t: 'vlan-', vid }) }, icon('undo'), 'Keep this VLAN')
      : h('button', { class: 'btn danger', onclick: () => { if (v.isNew) { pending.drop({ t: 'vlan+', vid }); pending.items = pending.items.filter(o => !(o.t === 'mem' && o.vid === vid)); pending.save(); S.vlan = null; } else pending.put({ t: 'vlan-', vid }); } },
        icon('minus'), v.isNew ? 'Remove new VLAN' : 'Delete VLAN…'),
      !v.isNew ? h('p', { class: 'mu', style: 'font-size:12px;margin:6px 0 0' }, 'Deleting removes it from every port. Ports left with no untagged VLAN stop passing untagged traffic.') : null) : null];
}

/* ---------- pending tray ---------- */
function trayView(m) {
  if (!pending.count()) return h('div');
  const items = pending.describe(m), risks = pending.risks(m);
  return h('div', { class: 'tray', role: 'region', 'aria-label': 'Pending changes' },
    h('h3', {}, `${pending.count()} pending change${pending.count() > 1 ? 's' : ''}`, h('span', { class: 'mu' }, 'not applied yet')),
    h('div', { class: 'its' }, items.map(it => h('div', { class: 'it' }, h('span', { class: 'vis' }, trayVisual(it)), h('span', {}, it.p ? h('b', {}, `Port ${it.p.no} `) : null, it.text),
      it.o ? h('button', { class: 'btn icon ghost sm x-it', title: 'Undo this change', onclick: () => { pending.drop(it.o); if (it.o2) pending.drop(it.o2); } }, icon('x')) : null))),
    risks.map(r => h('p', { class: 'risk' }, icon('err'), r)),
    h('div', { class: 'acts' }, h('button', { class: 'btn pri', onclick: e => applyPending(e.currentTarget) }, `Apply ${pending.count()} change${pending.count() > 1 ? 's' : ''}`),
      h('button', { class: 'btn', onclick: () => pending.clear() }, 'Discard')));
}
function trayVisual(it) {
  const bd = (v, cls) => h('span', { class: 'bd sm ' + (cls || ''), style: `--c:${vcol.of(v)}` }, v);
  if (it.kind === 'mem') return [h('span', { class: 'pn' }, it.p.no), it.o.to === '-' ? [icon('minus'), bd(it.o.vid, 'pend rmv' + (pending.live(it.p, it.o.vid) === 't' ? ' t' : ''))] : [icon('plus'), bd(it.o.vid, 'pend add' + (it.o.to === 't' ? ' t' : ''))]];
  if (it.kind === 'move') return [h('span', { class: 'pn' }, it.p.no), bd(it.o2.vid), icon('arrow'), bd(it.o.vid, 'pend add')];
  if (it.kind === 'mode') { const f = pending.future(it.p), u = [...f.U][0]; return [h('span', { class: 'pn' }, it.p.no), icon('arrow'),
    h('span', { class: 'mp', style: `--c:${u ? vcol.of(u) : 'var(--plate)'}`, title: it.text }, [...f.T].slice(0, 2).map(v => h('i', { style: `--c:${vcol.of(v)}` })))]; }
  if (it.kind === 'port') return [h('span', { class: 'pn' }, it.p.no), icon(it.o.field === 'interfaceDescription' ? 'pen' : it.o.field === 'adminState' ? 'link' : 'gear')];
  if (it.kind === 'pf') return [h('span', { class: 'pn' }, it.p.no), icon('gear')];
  if (it.kind === 'vlan+') return [icon('plus'), bd(it.o.vid, 'pend add')];
  if (it.kind === 'vlan~') return [bd(it.o.vid), icon('pen')];
  if (it.kind === 'vlan-') return [icon('minus'), bd(it.o.vid, 'pend rmv')];
  return [];
}
async function applyPending(btn) {
  const m = S.m, risks = pending.risks(m);
  if (risks.length && !await confirmBox('These changes can cut you off', [...risks,
    'If the switch becomes unreachable, undo it from the serial console or a port that still carries your network. Nothing is saved to the startup configuration until you press Save, so a restart also undoes it.'],
  'Apply anyway', true)) return;
  const lines = pending.describe(m).map(it => (it.p ? `Port ${it.p.no} ` : '') + it.text);
  await act(btn, async () => { await pending.apply(m); journal.add(lines); }, `Applied ${lines.length} change${lines.length > 1 ? 's' : ''}. Not saved yet.`).catch(() => {});
}
