/* ---------- workspace: top bar, lenses, front panel, matrix / tables ---------- */
const S = {
  lens: store.get('lens') || 'vlans',
  sel: [],            // selected port names
  vlan: null,         // selected VLAN id (VLAN lens: plate clicks edit its membership)
  hover: null,        // port name under the pointer
  m: null,            // last model
  dev: null,          // selected device (MAC) in the Devices lens
};
const LENSES = [['link', 'Link', 'link'], ['vlans', 'VLANs', 'vlan'], ['traffic', 'Traffic', 'traffic'], ['errors', 'Errors', 'err'], ['devices', 'Devices', 'dev'], ['stp', 'Spanning tree', 'tree'], ['lag', 'LAG', 'lag']];
const LENS_KEYS = { link: WORKSPACE, vlans: WORKSPACE, traffic: WORKSPACE, errors: WORKSPACE, devices: [...WORKSPACE, ...DEVICES], stp: [...WORKSPACE, K.stp], lag: [...WORKSPACE, K.lag] };

let frame = 0;
function redraw() { if (!frame) frame = requestAnimationFrame(() => { frame = 0; renderAll(); }); }

function renderAll() {
  const root = $('#app');
  if (!root || !$('.work', root)) return;
  S.m = model();
  renderTop(); renderWs(); renderInspector();
  root.classList.toggle('stale', session.state === 'expired');
}

/* ---------- top bar ---------- */
const KEY_NAMES = () => ({ [K.std]: 'links', [K.panel]: 'links', [K.vlans]: 'VLANs', [K.mem]: 'VLANs', [K.mode]: 'VLANs', [K.stats]: 'traffic', [K.fdb]: 'devices', [K.lldp]: 'devices', [K.arp]: 'devices', [K.stp]: 'spanning tree', [K.lag]: 'LAGs' });
function freshness(keys) {
  if (!data.oldest(keys)) return { text: 'loading', cls: '' };
  const oldest = keys.reduce((o, k) => data.at(k) < data.at(o) ? k : o, keys[0]), a = Date.now() - data.at(oldest);
  if (a < 60e3) return { text: 'Live', sub: age(a), cls: '' };
  return { text: `${KEY_NAMES()[oldest] || 'data'} ${age(a)}`, cls: data.stale(oldest) ? 'bad' : '' };
}
function renderTop() {
  const top = $('.top'), m = S.m;
  const name = data.get(K.sys)?.systemName || store.get('sysname') || 'x1018';
  if (name) store.set('sysname', name);
  document.title = name + ' · switch';
  const ip = arr(data.get(K.ip)?.ifEntry)[0]?.IPAddr || location.hostname;
  const exp = session.state === 'expired';
  const fr = freshness(LENS_KEYS[S.lens]);
  const loading = data.loading(LENS_KEYS[S.lens]);
  const nPend = pending.count();
  top.replaceChildren(...[
    h('span', { class: 'nm' }, name), h('span', { class: 'mu ip hide-n' }, ip),
    h('button', { class: 'st' + (exp ? ' bad' : ''), onclick: () => openSession(), title: exp ? 'Signed out: sign in again to continue.' :
      'Signed in. A tiny keepalive request runs while this tab is visible; the switch drops idle sessions after about a minute. Click for session options.' },
      ring(exp ? 0 : !session.keepsAlive() ? session.left() / session.timeout : 1, 'var(--grn)'), h('span', { class: 'hide-n' }, exp ? h('b', {}, 'Signed out') : 'Session kept alive')),
    h('span', { class: 'st' + (fr.cls ? ' bad' : ''), title: loading ? 'Reading from the switch…' : 'Age of the data on screen' },
      loading ? icon('refresh', { class: 'spin' }) : icon('clock'), h('b', {}, fr.text), fr.sub ? h('span', { class: 'hide-n' }, fr.sub) : null),
    h('span', { class: 'sp' }),
    h('button', { class: 'btn srch', onclick: () => palette.open(), title: 'Search ports, VLANs, devices and settings (⌘K)' }, icon('search'), h('span', { class: 'lbl' }, 'Search'), h('kbd', {}, '⌘K')),
    nPend ? h('button', { class: 'btn', title: 'Changes waiting for Apply', onclick: () => $('.tray')?.scrollIntoView({ block: 'nearest' }) },
      h('span', { class: 'sq pend', style: '--c:transparent' }), `${nPend}`, h('span', { class: 'lbl-n' }, ' pending')) : null,
    dirty.state ? h('button', { class: 'btn pri', title: 'Applied changes are not in the startup configuration yet: they are lost on reboot until saved',
      onclick: e => saveConfig(e.currentTarget) }, icon('save'), h('span', { class: 'lbl-n' }, 'Save'), journal.count() ? h('span', {}, ` ${journal.count()}`, h('span', { class: 'lbl-n' }, ` change${journal.count() > 1 ? 's' : ''}`)) : h('span', { class: 'lbl-n' }, ' changes')) : null,
    h('button', { class: 'btn', onclick: () => openSettings() }, icon('gear'), h('span', { class: 'hide-n' }, 'Settings')),
    h('button', { class: 'btn hide-sm', onclick: () => openActivity() }, icon('list'), h('span', { class: 'hide-n' }, 'Activity')),
    h('button', { class: 'btn icon hide-sm', title: theme.get() === 'dark' ? 'Switch to light theme' : 'Switch to dark theme', onclick: () => theme.toggle() }, icon(theme.get() === 'dark' ? 'moon' : 'sun'))].filter(Boolean));
}
bus.on('theme', redraw);

function lensTabs() {
  const every = refreshEvery();
  return h('nav', { class: 'lenses', 'aria-label': 'What to show for the ports' }, LENSES.map(([id, label, ic]) => h('button', { class: S.lens === id ? 'on' : '', 'aria-pressed': S.lens === id ? 'true' : 'false',
    onclick: () => setLens(id) }, icon(ic), label)),
    h('span', { class: 'sp' }),
    h('span', { class: 'rfr' }, h('button', { class: 'btn icon ghost sm', title: 'Read again now', 'aria-label': 'Read again now', onclick: () => data.need(LIVE_KEYS[S.lens], { prio: PRIO.USER, force: true }).catch(e => toast(e.message, true)) },
      icon('refresh', { class: data.loading(LIVE_KEYS[S.lens]) ? 'spin' : '' })),
    h('select', { 'aria-label': 'Refresh every', title: 'How often this view reads the switch again (live data: link state, counters, devices)',
      onchange: e => { const m = store.get('refreshEvery') || {}; m[S.lens] = +e.target.value; store.set('refreshEvery', m); redraw(); } },
      REFRESH_OPTS.map(([v, t]) => h('option', { value: v, selected: v === every }, t)))));
}
/* auto refresh, per view (like a dashboard's refresh picker): which live data each view re-reads, and how often */
const LIVE_KEYS = { link: [K.panel, K.std, K.stats], vlans: [K.panel, K.std, K.stats], traffic: [K.stats], errors: [K.std, K.stats], devices: DEVICES, stp: [K.stp], lag: [K.panel, K.std] };
const REFRESH_OPTS = [[0, 'Off'], [5e3, '5 s'], [10e3, '10 s'], [30e3, '30 s'], [60e3, '1 min'], [300e3, '5 min']];
const refreshEvery = (lens = S.lens) => { const v = (store.get('refreshEvery') || {})[lens]; return v != null ? v : lens === 'traffic' ? 10e3 : 30e3; };
function setLens(id) { S.lens = id; store.set('lens', id); prefetch.used(id); if (id !== 'vlans') S.vlan = null; if (id !== 'devices') S.dev = null; refresh(); redraw(); }

/* ---------- main area ---------- */
function renderWs() {
  if (document.activeElement?.matches('.rfr select')) return; // don't close the refresh picker under the pointer
  const m = S.m, ws = $('.ws');
  const linked = m.ports.filter(p => p.up).length;
  const nodes = [h('div', { class: 'ws-head' }, h('h2', {}, 'Front panel'),
    m.ports.length ? h('span', { class: 'mu' }, `16 × RJ45 · 2 × SFP · ${linked} linked`) : h('span', { class: 'mu' }, 'Reading the switch…'),
    S.sel.length ? h('button', { class: 'chip selx', title: 'Clear the selection (Esc)', onclick: clearSel }, `${rangeText(S.sel.map(portNo))} selected`, icon('x')) : null)];
  nodes.push(keyStrip(m));
  nodes.push(h('div', { class: 'gw' }, panel(m)));
  nodes.push(lensTabs());
  if (S.lens === 'vlans') nodes.push(h('div', { class: 'gw' }, matrix(m)), h('button', { class: 'newv', onclick: () => newVlan() }, icon('plus'), 'New VLAN'));
  if (S.lens === 'link') nodes.push(linkTable(m));
  if (S.lens === 'traffic') nodes.push(trafficGraph(m), trafficTable(m));
  if (S.lens === 'errors') nodes.push(errorsTable(m));
  if (S.lens === 'devices') nodes.push(devicesTable(m));
  if (S.lens === 'stp') nodes.push(stpView(m));
  if (S.lens === 'lag') nodes.push(lagView(m));
  nodes.push(freshLine());
  ws.replaceChildren(...nodes);
}

function keyStrip(m) {
  const v1 = 'var(--c)';
  const k = [
    h('span', { class: 'kk' }, icon('here'), 'your connection'),
    h('span', { class: 'kk' }, h('span', { class: 'mp', style: `--c:${vcol.of(1)}` }), 'untagged VLAN'),
    h('span', { class: 'kk' }, h('span', { class: 'mp', style: `--c:${vcol.of(1)}` }, h('i', { style: `--c:${PALETTE[1]}` }), h('i', { style: `--c:${PALETTE[2]}` })), 'tagged VLANs'),
    h('span', { class: 'kk' }, h('i', { class: 'led lg' }), '1 Gb/s'), h('span', { class: 'kk' }, h('i', { class: 'led ly' }), '10/100'),
    h('span', { class: 'kk' }, h('i', { class: 'led' }), 'no link'), h('span', { class: 'kk' }, h('i', { class: 'led act' }), 'traffic'),
    h('span', { class: 'kk' }, h('span', { class: 'selk' }, '5'), 'selected'), h('span', { class: 'kk' }, h('span', { class: 'hvk' }, '10'), 'pointer'),
  ];
  if (pending.count()) k.push(h('span', { class: 'br' }), h('span', { class: 'kk' }, h('b', { style: 'color:var(--tx)' }, 'Pending')),
    h('span', { class: 'kk', style: `--c:${PALETTE[1]}` }, h('i', { class: 'sq pend add' }), 'joins untagged'),
    h('span', { class: 'kk', style: `--c:${PALETTE[1]}` }, h('i', { class: 'sq t pend add' }), 'joins tagged'),
    h('span', { class: 'kk', style: `--c:${vcol.of(1)}` }, h('i', { class: 'sq rm pend rmv' }), 'leaves'));
  if (S.lens === 'vlans' && S.vlan != null) {
    const v = m.vlans.find(x => x.id === S.vlan);
    k.push(h('span', { class: 'br' }), h('span', { class: 'kk', style: `color:var(--tx);--c:${vcol.of(S.vlan)}` }, h('span', { class: 'bd sm' }, S.vlan),
      h('span', {}, h('b', {}, 'Editing ', v?.name || `VLAN ${S.vlan}`), ': click ports to cycle  ', h('span', { class: 'mu' }, 'not a member → untagged → tagged')),
      h('button', { class: 'btn sm', onclick: () => { S.vlan = null; redraw(); } }, 'Done')));
  }
  return h('div', { class: 'keys' }, k);
}

/* ---------- front panel ---------- */
let drag = null;
function panel(m) {
  const g = h('div', { class: 'g panel', role: 'group', 'aria-label': 'Front panel' }, h('span', { class: 'lab' }));
  const byNo = new Map(m.ports.map(p => [p.no, p]));
  for (let c = 0; c < 9; c++) {
    if (c === 8) g.append(h('span', { class: 'gap' }));
    const top = byNo.get(c * 2 + 1), bot = byNo.get(c * 2 + 2);
    g.append(h('div', { class: 'pc' }, label(top, m, false), plate(top, m, false), plate(bot, m, true), label(bot, m, true)));
  }
  return g;
}
function label(p, m, bottom) {
  if (!p) return h('span', { class: 'sn' + (bottom ? ' bt' : '') });
  const mine = p.name === m.mine;
  return h('span', { class: 'sn' + (bottom ? ' bt' : ''), onclick: e => selectPort(p, e), title: p.desc || '' },
    h('b', { class: 'no' }, p.no, mine ? icon('here', { title: 'Your connection: your computer reaches the switch through this port. Changes that could cut it off ask before applying.' }) : null),
    (() => { const o = pending.find(`port:${p.name}:interfaceDescription`); const t = o ? o.value : p.label; // a pending name shows in the silkscreen at once
      return t ? h('small', { class: o ? 'pname' : '' }, t) : (p.sfp ? h('small', {}, 'SFP') : null); })());
}
function plate(p, m, bottom) {
  if (!p) return h('span', { class: 'pl' + (bottom ? ' bt' : ''), style: 'visibility:hidden' });
  const f = pending.future(p), fu = [...f.U][0], lu = [...p.vlU][0];
  const cls = ['pl', bottom && 'bt', p.up && (p.speed >= 1000 ? 'k' : 'a'), p.up && p.act && 'act', !p.enabled && 'dis',
    S.sel.includes(p.name) && 'sel', S.hover === p.name && 'hov', (fu !== lu || pendingPort(p)) && 'chg',
    S.lens === 'vlans' && S.vlan != null && pending.memb(p, S.vlan).to === '-' && 'dim',
    S.lens === 'stp' && p.up && stpOf(p) && stpOf(p).portState !== '5' && 'dim'];
  const tagged = [...new Set([...p.vlT, ...f.T])].sort((a, b) => a - b).slice(0, 4);
  const tip = [`Port ${p.no}${p.label ? ' · ' + p.label : ''}`, !p.enabled ? 'disabled' : p.up ? `link ${p.speed >= 1000 ? p.speed / 1000 + ' Gb/s' : p.speed + ' Mb/s'}${p.duplex === 'half' ? ' half duplex' : ''}` : 'no link',
    lu ? `untagged VLAN ${lu}` : 'no untagged VLAN', p.vlT.size ? `tagged ${fmtList(p.vlT)}` : ''].filter(Boolean).join('\n');
  const coloured = lu && (p.up || lu !== 1 || p.vlT.size || (S.lens === 'vlans' && S.vlan === lu)); // unconfigured, unlinked ports stay neutral
  return h('button', { class: cls, 'data-no': p.no, style: coloured ? `--c:${vcol.of(lu)}` : '', title: tip, 'aria-label': tip.replace(/\n/g, ', '), 'aria-pressed': S.sel.includes(p.name) ? 'true' : 'false',
    onpointerdown: e => { if (e.button === 0 && !(S.lens === 'vlans' && S.vlan != null)) { drag = { from: p.no, base: e.shiftKey || e.metaKey || e.ctrlKey ? [...S.sel] : [] }; } },
    onpointerenter: e => { S.hover = p.name; if (drag && drag.from !== p.no && (e.buttons & 1)) dragTo(p.no); else redrawHover(); },
    onpointerleave: () => { if (S.hover === p.name) { S.hover = null; redrawHover(); } },
    onclick: e => plateClick(p, e) },
    h('i', { class: 'j' + (p.sfp ? ' sfp' : '') }), h('i', { class: 'le' }),
    tagged.length ? h('i', { class: 'tg' }, tagged.map(v => h('u', { class: pending.memb(p, v).pend ? 'pend' : '', style: `--c:${vcol.of(v)}`, title: `tagged VLAN ${v}` }))) : null,
    S.lens === 'lag' && lagOf(p) ? h('span', { class: 'lagk', title: `member of LAG ${lagOf(p)}` }, `L${lagOf(p)}`) : null,
    fu !== lu ? h('span', { class: 'fut', title: fu ? `Pending: untagged VLAN becomes ${fu}` : 'Pending: no untagged VLAN' }, icon('arrow'),
      h('i', { class: fu ? '' : 'none', style: fu ? `--c:${vcol.of(fu)}` : '' })) : null);
}
const pendingPort = p => pending.items.some(o => o.t === 'port' && o.port === p.name && o.field !== 'interfaceDescription');
/* hover only flips classes: a re-render under the pointer would swallow the click (pointerdown and pointerup on different elements) */
function redrawHover() {
  const n = S.hover ? String(portNo(S.hover)) : '';
  for (const el of $$('.ws [data-no]')) el.classList.toggle(el.classList.contains('pl') ? 'hov' : 'hv', el.dataset.no === n && !el.classList.contains('no'));
}
window.addEventListener('pointerup', () => setTimeout(() => { drag = null; }, 0)); // after the click that follows
function dragTo(no) {
  const a = Math.min(drag.from, no), b = Math.max(drag.from, no);
  const range = S.m.ports.filter(p => p.no >= a && p.no <= b).map(p => p.name);
  S.sel = [...new Set([...drag.base, ...range])]; drag.moved = true; redraw();
}
function plateClick(p, e) {
  if (drag?.moved) { drag = null; return; }
  drag = null;
  if (S.lens === 'vlans' && S.vlan != null && !(e.shiftKey || e.metaKey || e.ctrlKey)) { pending.cycle(p, S.vlan); return; }
  selectPort(p, e);
}
function selectPort(p, e) {
  if (e && (e.shiftKey || e.metaKey || e.ctrlKey)) S.sel = S.sel.includes(p.name) ? S.sel.filter(n => n !== p.name) : [...S.sel, p.name];
  else S.sel = S.sel.length === 1 && S.sel[0] === p.name ? [] : [p.name];
  S.dev = null;
  redraw();
}
function clearSel() { S.sel = []; S.vlan = null; S.dev = null; redraw(); }

/* ---------- VLAN matrix ---------- */
function matrix(m) {
  const sel = new Set(S.sel.map(portNo)), hv = S.hover ? portNo(S.hover) : 0;
  const col = no => no <= 16 ? no + 1 : no + 2; // grid column of a port slot (17/18 sit after the SFP gap)
  const nums = h('div', { class: 'g nums' }, h('span', { class: 'mk', style: `--c:${vcol.of(1)}` }, h('span', {}, h('i', { class: 'sq' }), 'untagged'), h('span', {}, h('i', { class: 'sq t' }), 'tagged')));
  for (let n = 1; n <= 18; n++) { if (n === 17) nums.append(h('span')); nums.append(h('span', { class: n === hv ? 'hv' : sel.has(n) ? 'sel' : '', 'data-no': n }, n)); }
  const ov = h('div', { class: 'g ov' }, h('i', { style: 'grid-column:1' }), [2, 4, 6, 8, 10, 12, 14, 16].map(c => h('i', { style: `grid-column:${c}/${c + 2}` })), h('i', { style: 'grid-column:19/21' }));
  const created = pending.items.filter(o => o.t === 'vlan+').map(o => ({ id: o.vid, name: o.name, colour: vcol.of(o.vid), isNew: true }));
  const vlans = [...m.vlans, ...created.filter(c => !m.vlans.some(v => v.id === c.id))].sort((a, b) => a.id - b.id);
  const rows = vlans.map((v, i) => {
    const deleting = pending.items.some(o => o.t === 'vlan-' && o.vid === v.id);
    let u = 0, t = 0, du = 0, dt = 0, dl = 0;
    const cells = m.ports.map(p => {
      const mb = pending.memb(p, v.id);
      if (mb.live === 'u') u++; if (mb.live === 't') t++;
      if (mb.pend) { if (mb.to === 'u') du++; else if (mb.to === 't') dt++; else dl++; }
      const shown = mb.pend && mb.to === '-' ? 'rm' : mb.to;
      const cls = ['x', shown === 't' ? 't' : shown === '-' ? 'no' : shown === 'rm' ? 'rm' : '', mb.pend && 'pend', mb.pend && (mb.to === '-' ? 'rmv' : 'add'), p.no === hv && mb.to !== '-' && 'hv'];
      const what = { u: 'untagged member', t: 'tagged member', '-': 'not a member' };
      return h('button', { class: cls, 'data-no': p.no, style: `grid-column:${col(p.no)}`, title: `Port ${p.no} · VLAN ${v.id}: ${what[mb.to]}${mb.pend ? ' (pending; was ' + what[mb.live] + ')' : ''}. Click to cycle.`,
        'aria-label': `Port ${p.no}, VLAN ${v.id}: ${what[mb.to]}`, onclick: () => pending.cycle(p, v.id),
        onpointerenter: () => { S.hover = p.name; redrawHover(); }, onpointerleave: () => { if (S.hover === p.name) { S.hover = null; redrawHover(); } } });
    });
    const ct = h('span', { class: 'ct' }, h('span', { title: 'untagged ports' }, h('i', { class: 'sq' }), u), t ? h('span', { title: 'tagged ports' }, h('i', { class: 'sq t' }), t) : null,
      du ? h('span', { class: 'd', title: `${du} pending untagged` }, '+' + du, h('i', { class: 'sq' })) : null,
      dt ? h('span', { class: 'd', title: `${dt} pending tagged` }, '+' + dt, h('i', { class: 'sq t' })) : null,
      dl ? h('span', { class: 'd', title: `${dl} pending removals` }, '−' + dl) : null,
      v.isNew ? h('span', { class: 'd' }, 'new') : null, deleting ? h('span', { class: 'd' }, 'deleting') : null);
    return h('div', { class: ['g r', i % 2 === 0 && 'alt', S.vlan === v.id && 'on'], style: `--c:${v.colour}` },
      h('span', { class: 'vl', onclick: () => { S.vlan = S.vlan === v.id ? null : v.id; S.sel = []; redraw(); }, title: 'Select to edit this VLAN and its ports' },
        h('span', { class: 'bd' + (v.isNew ? ' pend add' : '') }, v.id), h('span', {}, h('b', {}, v.name || (v.id === 1 ? 'default' : 'unnamed')), ct)),
      h('i', { class: 'ln' }), cells);
  });
  return h('div', { class: 'mx' }, ov, nums, rows);
}

/* ---------- spanning tree and LAG lenses ---------- */
const STP_STATE = { 1: 'disabled', 2: 'blocking', 3: 'listening', 4: 'learning', 5: 'forwarding', 6: 'broken' };
const STP_ROLE = { 0: '—', 1: 'disabled', 2: 'alternate', 3: 'backup', 4: 'root', 5: 'designated' };
const stpOf = p => rows(data.get(K.stp)?.InterfaceList, 'InterfaceEntry').find(r => r.interfaceName === p.name);
const lagOf = p => { for (const l of rows(data.get(K.lag), 'LAGEntry')) if (rows(l.PortList, 'PortEntry').some(x => x.portName === p.name)) return +String(l.interfaceName).replace(/\D/g, ''); return 0; };
function stpView(m) {
  const v = data.get(K.stp);
  if (!v) return h('p', { class: 'empty' }, 'Reading spanning tree…');
  const root = v.GlobalSetting?.DesignatedRoot || {}, isRoot = root.bridgeID && root.bridgeID === root.rootBridgeID;
  const rp = +root.rootPortID ? m.ports.find(p => p.no === (+root.rootPortID & 0xfff)) : null;
  return h('div', {}, h('p', { class: 'note', style: 'margin-top:12px' }, isRoot ? 'This switch is the root of the spanning tree.' :
      [`Root bridge ${root.rootBridgeID || '—'}`, rp ? `, reached through port ${rp.no}` : '', ` (path cost ${root.rootPathCost || 0}).`],
      ` ${root.topologyChangeCount || 0} topology change${root.topologyChangeCount === '1' ? '' : 's'}.`,
      h('button', { class: 'btn sm', style: 'margin-left:10px', onclick: () => openSettings('stp') }, 'Spanning tree settings…')),
    h('table', { class: 'tbl' }, h('thead', {}, h('tr', {}, ['Port', 'Name', 'State', 'Role', 'Edge port', 'Path cost'].map((t, i) => h('th', { class: i === 5 ? 'num' : '' }, t)))),
      h('tbody', {}, m.ports.map((p, i) => { const r = stpOf(p) || {}; const on = r.STPEnabled !== '2';
        return portRow(p, i, [h('td', {}, h('b', {}, p.no)), h('td', {}, p.desc || h('span', { class: 'mu' }, '—')),
          h('td', {}, on ? h('span', { class: 'cell' }, h('i', { class: 'led' + (r.portState === '5' ? ' lg' : r.portState === '1' || !p.up ? '' : ' ly') }), STP_STATE[r.portState] || '—') : h('span', { class: 'mu' }, 'spanning tree off')),
          h('td', {}, on ? STP_ROLE[r.portRole] || '—' : '—'), h('td', {}, r.portFastOperEnabled === '1' ? 'yes' : 'no'), h('td', { class: 'num' }, r.pathCost ? count(r.pathCost) : '—')]); }))));
}
function lagView(m) {
  const lags = rows(data.get(K.lag), 'LAGEntry').map(l => ({ n: +String(l.interfaceName).replace(/\D/g, ''), type: l.LACPType, members: rows(l.PortList, 'PortEntry').map(x => portNo(x.portName)) })).filter(l => l.members.length);
  const sel = S.sel.map(portNo);
  return h('div', {}, h('p', { class: 'note', style: 'margin-top:12px' }, 'A LAG bundles several cables to the same device into one link. ',
      sel.length >= 2 ? h('button', { class: 'btn sm pri', onclick: () => openSettings('lag') }, icon('lag'), `Bundle ports ${fmtList(new Set(sel))} into a LAG…`) : h('span', { class: 'mu' }, 'Select two or more ports to bundle them.')),
    lags.length ? h('table', { class: 'tbl' }, h('thead', {}, h('tr', {}, ['LAG', 'Kind', 'Ports', 'Links up'].map(t => h('th', {}, t)))),
      h('tbody', {}, lags.map((l, i) => h('tr', { class: i % 2 ? 'alt' : '', onclick: () => { S.sel = l.members.map(n => 'gi1/0/' + n); redraw(); } },
        h('td', {}, h('b', {}, 'LAG ' + l.n)), h('td', {}, l.type === '2' ? 'LACP' : 'static'), h('td', {}, fmtList(new Set(l.members)).replace(/,/g, ', ')),
        h('td', {}, `${l.members.filter(n => m.ports.find(p => p.no === n)?.up).length} of ${l.members.length}`)))))
      : h('p', { class: 'empty' }, 'No LAGs.'));
}

/* ---------- lens tables ---------- */
const speedText = p => !p.enabled ? 'disabled' : !p.up ? 'no link' : (p.speed >= 1000 ? p.speed / 1000 + ' Gb/s' : p.speed + ' Mb/s') + (p.duplex === 'half' ? ' half' : '');
const ledOf = p => h('i', { class: 'led' + (p.up ? (p.speed >= 1000 ? ' lg' : ' ly') : '') });
function vlanChips(p) {
  return h('span', { class: 'cell' }, [...p.vlU].map(v => h('span', { class: 'bd sm', style: `--c:${vcol.of(v)}`, title: `untagged VLAN ${v}` }, v)),
    [...p.vlT].map(v => h('span', { class: 'bd sm t', style: `--c:${vcol.of(v)}`, title: `tagged VLAN ${v}` }, v)));
}
function portRow(p, i, cells) {
  return h('tr', { class: [i % 2 && 'alt', S.sel.includes(p.name) && 'sel'], onclick: e => selectPort(p, e) }, cells);
}
function linkTable(m) {
  return h('table', { class: 'tbl' }, h('thead', {}, h('tr', {}, ['Port', 'Name', 'Link', 'VLANs', 'Seen on this port', 'Received', 'Sent'].map((t, i) => h('th', { class: i > 4 ? 'num' : '' }, t)))),
    h('tbody', {}, m.ports.map((p, i) => portRow(p, i, [
      h('td', {}, h('b', {}, p.no), p.name === m.mine ? icon('here', { title: 'Your connection' }) : null), h('td', {}, p.desc || h('span', { class: 'mu' }, '—')),
      h('td', {}, h('span', { class: 'cell' }, ledOf(p), speedText(p))), h('td', {}, vlanChips(p)),
      h('td', {}, p.neighbors?.length ? p.neighbors[0].name : p.macs?.length ? `${p.macs.length} device${p.macs.length > 1 ? 's' : ''}` : h('span', { class: 'mu' }, '—')),
      h('td', { class: 'num' }, bytes(p.rx)), h('td', { class: 'num' }, bytes(p.tx))]))));
}
function rateText(bps) { if (bps == null) return '—'; const u = ['b/s', 'kb/s', 'Mb/s', 'Gb/s']; let i = 0; while (bps >= 1000 && i < 3) { bps /= 1000; i++; } return `${bps >= 100 || !i ? Math.round(bps) : bps.toFixed(1)} ${u[i]}`; }
function trafficTable(m) {
  const max = Math.max(1, ...m.ports.map(p => p.rate || 0));
  const ports = [...m.ports].sort((a, b) => (b.rate || 0) - (a.rate || 0) || a.no - b.no);
  return h('div', {}, h('p', { class: 'mu', style: 'margin:12px 0 0' }, prevStats ? `Average over the last ${age(data.at(K.stats) - prevStats.at)} between two reads.` : 'Rates appear after the counters have been read twice.'),
    h('table', { class: 'tbl' }, h('thead', {}, h('tr', {}, ['Port', 'Name', 'Rate', '', 'Received', 'Sent'].map((t, i) => h('th', { class: i > 3 || i === 2 ? 'num' : '' }, t)))),
      h('tbody', {}, ports.map((p, i) => portRow(p, i, [h('td', {}, h('b', {}, p.no)), h('td', {}, p.desc || h('span', { class: 'mu' }, '—')),
        h('td', { class: 'num' }, rateText(p.rate)), h('td', { style: 'width:30%' }, h('span', { class: 'bar', style: `width:${Math.round((p.rate || 0) / max * 100)}%` })),
        h('td', { class: 'num' }, bytes(p.rx)), h('td', { class: 'num' }, bytes(p.tx))])))));
}
/* ---------- traffic graph: the selected ports (or the busiest) over the last 30 min ---------- */
const gcol = { m: new Map() }; // port -> series slot; a port keeps its colour while it stays on the graph
function graphPorts(m) {
  const sel = S.sel.map(portNo).sort((a, b) => a - b);
  if (sel.length) return { ports: sel.slice(0, 4), more: sel.length - 4, picked: true };
  return { ports: [...m.ports].filter(p => p.rate > 0).sort((a, b) => b.rate - a.rate).slice(0, 3).map(p => p.no).sort((a, b) => a - b), more: 0, picked: false };
}
function trafficGraph(m) {
  const { ports, more, picked } = graphPorts(m);
  for (const n of [...gcol.m.keys()]) if (!ports.includes(n)) gcol.m.delete(n);
  for (const n of ports) if (!gcol.m.has(n)) { const used = new Set(gcol.m.values()); gcol.m.set(n, [1, 2, 3, 4].find(i => !used.has(i))); }
  const now = Date.now(), span = 30 * 60e3, t0 = now - span;
  const samples = traffic.h.s.filter(x => x.at > t0);
  const head = h('p', { class: 'mu', style: 'margin:0' }, picked ? `${rangeText(ports)}${more > 0 ? ` (the first 4 of ${ports.length + more} selected)` : ''}, last 30 minutes.`
    : ports.length ? 'The busiest ports, last 30 minutes. Select ports on the panel to graph them.' : 'Select ports on the panel to graph their traffic.');
  if (samples.length < 2) return h('div', { class: 'tgraph' }, head, h('p', { class: 'empty' }, 'Collecting: the counters are read every 10 s while this view is open.'));
  const W = 720, H = 190, L = 56, B = 22;
  let max = 0; for (const x of samples) for (const n of ports) { const r = x.r[n]; if (r) max = Math.max(max, r[0], r[1]); }
  const nice = v => { if (v <= 0) return 1000; const e = 10 ** Math.floor(Math.log10(v)), f = v / e; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * e; };
  max = nice(max);
  const X = t => L + (t - t0) / span * (W - L), Y = v => (H - B) - v / max * (H - B - 6);
  const path = (n, i) => { let d = '', prev = 0;
    for (const x of samples) { const r = x.r[n]; if (!r) { prev = 0; continue; } const gap = prev && x.at - prev > Math.max(90e3, x.dt * 3); d += `${!d || gap || !prev ? 'M' : 'L'}${X(x.at).toFixed(1)},${Y(r[i]).toFixed(1)}`; prev = x.at; }
    return d; };
  const svg = h('svg', { svg: true, viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': `Traffic of ports ${ports.join(', ')}` },
    [0, 0.5, 1].map(f => [h('line', { svg: true, class: 'ax', x1: L, x2: W, y1: Y(max * f), y2: Y(max * f) }),
      h('text', { svg: true, x: L - 8, y: Y(max * f) + 4, 'text-anchor': 'end' }, rateText(max * f))]),
    [[t0, '30 min ago'], [now - span / 2, '15 min'], [now, 'now']].map(([t, l], i) => h('text', { svg: true, x: X(t), y: H - 4, 'text-anchor': i === 0 ? 'start' : i === 2 ? 'end' : 'middle' }, l)),
    ports.map(n => [h('path', { svg: true, class: 'tl', style: `--c:var(--s${gcol.m.get(n)})`, d: path(n, 0), 'vector-effect': 'non-scaling-stroke' }),
      h('path', { svg: true, class: 'tl tx', style: `--c:var(--s${gcol.m.get(n)})`, d: path(n, 1), 'vector-effect': 'non-scaling-stroke' })]),
    h('line', { svg: true, class: 'cross', y1: 0, y2: H - B, x1: 0, x2: 0, visibility: 'hidden' }));
  const tip = h('div', { class: 'ttip', hidden: true });
  svg.addEventListener('pointermove', e => {
    const b = svg.getBoundingClientRect(), t = t0 + ((e.clientX - b.left) / b.width * W - L) / (W - L) * span;
    const x = samples.reduce((a, c) => Math.abs(c.at - t) < Math.abs(a.at - t) ? c : a);
    const cx = X(x.at), cr = svg.querySelector('.cross'); cr.setAttribute('x1', cx); cr.setAttribute('x2', cx); cr.setAttribute('visibility', 'visible');
    tip.hidden = false; tip.style.left = Math.min(b.width - 190, Math.max(0, cx / W * b.width + 12)) + 'px';
    tip.replaceChildren(h('b', {}, new Date(x.at).toLocaleTimeString()), ports.map(n => { const r = x.r[n]; return h('div', { style: `--c:var(--s${gcol.m.get(n)})` },
      h('i'), `Port ${n}`, h('span', {}, r ? `↓ ${rateText(r[0])}  ↑ ${rateText(r[1])}` : '—')); }));
  });
  svg.addEventListener('pointerleave', () => { tip.hidden = true; svg.querySelector('.cross').setAttribute('visibility', 'hidden'); });
  return h('div', { class: 'tgraph' }, head, h('div', { style: 'position:relative' }, svg, tip),
    h('div', { class: 'tleg' }, ports.map(n => h('span', { style: `--c:var(--s${gcol.m.get(n)})` }, h('i'), `Port ${n}${m.ports.find(p => p.no === n)?.desc ? ' · ' + m.ports.find(p => p.no === n).desc : ''}`)),
      h('span', {}, h('i', { style: '--c:var(--mu)' }), 'received'), h('span', {}, h('i', { class: 'tx', style: '--c:var(--mu)' }), 'sent')));
}
function errorsTable(m) {
  const bad = m.ports.filter(p => p.errors || (p.up && (p.duplex === 'half' || p.speed < 1000)));
  if (!bad.length) return h('p', { class: 'empty' }, 'No port has errors, and every linked port runs at 1 Gb/s full duplex.');
  return h('table', { class: 'tbl' }, h('thead', {}, h('tr', {}, ['Port', 'Name', 'Link', 'Errors', 'What it may mean'].map(t => h('th', {}, t)))),
    h('tbody', {}, bad.map((p, i) => portRow(p, i, [h('td', {}, h('b', {}, p.no)), h('td', {}, p.desc || '—'), h('td', {}, h('span', { class: 'cell' }, ledOf(p), speedText(p))),
      h('td', {}, count(p.errors)), h('td', { class: 'mu' }, p.duplex === 'half' ? 'Half duplex: usually a speed/duplex mismatch with the device.' :
        p.up && p.speed < 1000 ? 'Linked below 1 Gb/s: check the cable (all 8 wires) or the device.' : 'Damaged frames: try the cable test in the inspector.')]))));
}
let devFilter = '';
function devicesTable(m) {
  const f = devFilter.toLowerCase();
  const list = m.devices.filter(d => !f || [d.mac, d.ip, d.port, String(d.vid), d.name, m.byName.get(d.port)?.desc || ''].some(x => x.toLowerCase().includes(f)))
    .sort((a, b) => portNo(a.port) - portNo(b.port) || a.mac.localeCompare(b.mac));
  const input = h('input', { type: 'text', placeholder: 'Filter by MAC, IP, port or name', value: devFilter, style: 'max-width:320px;margin-top:12px',
    oninput: e => { devFilter = e.target.value; const pos = e.target.selectionStart; redraw(); requestAnimationFrame(() => { const i = $('.ws input'); if (i) { i.focus(); i.setSelectionRange(pos, pos); } }); } });
  return h('div', {}, input, list.length ? h('table', { class: 'tbl' }, h('thead', {}, h('tr', {}, ['Port', 'MAC address', 'IP address', 'VLAN', 'Name (from LLDP)'].map(t => h('th', {}, t)))),
    h('tbody', {}, list.map((d, i) => { const p = m.byName.get(d.port); return h('tr', { class: [i % 2 && 'alt', S.dev === d.mac && 'sel'],
      onclick: () => { if (!p) return; const same = S.dev === d.mac; S.dev = same ? null : d.mac; S.sel = same ? [] : [p.name]; S.vlan = null; redraw(); } },
      h('td', {}, h('b', {}, portNo(d.port)), p?.desc ? h('span', { class: 'mu' }, ' ' + p.desc) : null), h('td', { class: 'mono' }, d.mac), h('td', {}, d.ip || h('span', { class: 'mu' }, '—')),
      h('td', {}, h('span', { class: 'bd sm', style: `--c:${vcol.of(d.vid)}` }, d.vid)), h('td', {}, d.name || h('span', { class: 'mu' }, '—'))); })))
    : h('p', { class: 'empty' }, data.get(K.fdb) ? (f ? 'No device matches the filter.' : 'The switch has not learned any device addresses yet.') : 'Reading the address table…'));
}

function freshLine() {
  const parts = [['links', [K.std, K.panel]], ['VLANs', [K.vlans, K.mem]], ['traffic', [K.stats]]];
  if (S.lens === 'devices') parts.push(['devices', DEVICES]);
  return h('p', { class: 'fresh' }, icon('clock'), parts.map(([n, ks], i) => {
    const at = data.oldest(ks), a = Date.now() - at;
    return h('span', { class: at && a > 15 * 60e3 ? 'old' : '' }, (i ? ' · ' : '') + n + ' ' + (data.loading(ks) ? 'reading…' : at ? age(a) : '—'));
  }), session.state === 'expired' ? h('span', { class: 'old' }, ' · signed out, showing the last data read') : null);
}

/* ---------- refresh: what the current lens needs, at view priority ---------- */
function refresh(force) {
  const keys = LENS_KEYS[S.lens];
  data.need(keys, { force }).catch(e => { if (!e.auth) toast(e.message, true); });
  redraw();
}
const onScreen = () => new Set([...LENS_KEYS[S.lens], ...WORKSPACE, K.sys, K.ip, K.gw, dirty.key, ...(S.sel.length ? PORT_GROUPS.flatMap(g => g.keys) : [])]);
bus.on('data', k => { if (k === '*' || onScreen().has(k)) redraw(); }); bus.on('pending', redraw); bus.on('dirty', redraw); bus.on('session', redraw); bus.on('net', redraw);
/* every 5 s: only the ages on screen change (a full render would disturb the inspector); refresh what went stale.
 * The Traffic view reads the counters every 10 s while it is open, for its graph. */
let tickN = 0;
setInterval(() => {
  if (document.hidden || !$('.work') || session.state !== 'ok') return;
  if (++tickN % 5 === 0) { renderTop(); const f = $('.fresh'); f && f.replaceWith(freshLine()); }
  if (net.busy || net.q.length) return;
  const live = LIVE_KEYS[S.lens], every = refreshEvery();
  const due = live.filter(k => !data.entry(k) || data.entry(k).dirty || (every && Date.now() - data.at(k) >= every - 500));
  const other = LENS_KEYS[S.lens].filter(k => !live.includes(k) && data.cls(k) !== 'live' && data.stale(k));
  if (due.length) data.need(due, { force: true }).catch(() => {});
  else if (other.length) refresh();
}, 1000);
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && !$('.sheet') && !$('.palette') && !document.body.classList.contains('locked')) clearSel();
});

/* ---------- journal: applied-but-unsaved changes, so Save can say what it saves ---------- */
const journal = {
  list: store.get('journal') || [],
  add(lines) { this.list.push(...lines.map(text => ({ at: Date.now(), text }))); store.set('journal', this.list); },
  count() { return dirty.state ? this.list.length : 0; },
  clear() { this.list = []; store.set('journal', []); },
};
async function saveConfig(btn) {
  const lines = journal.list.map(j => j.text);
  if (!await confirmBox('Save to the startup configuration?', [
    'Applied changes are active now but are lost when the switch restarts. Saving makes them permanent.',
    lines.length ? h('ul', { style: 'margin:0;padding-left:18px' }, lines.slice(-12).map(l => h('li', {}, l))) : 'This also saves any change made outside this tab (for example in the classic interface).',
  ], 'Save')) return;
  await act(btn, async () => { await dirty.save(); journal.clear(); }, 'Saved. The switch will start with this configuration.');
}

function newVlan(forPorts) {
  const used = new Set([...S.m.vlans.map(v => v.id), ...pending.items.filter(o => o.t === 'vlan+').map(o => o.vid)]);
  let id = 10; while (used.has(id)) id += 10;
  const idIn = h('input', { type: 'number', min: 2, max: 4094, value: id }), nameIn = h('input', { type: 'text', maxlength: 32, placeholder: 'e.g. iot, guests' });
  const err = h('p', { class: 'warn', style: 'min-height:1em;margin:0' });
  const close = sheet('New VLAN', h('form', { onsubmit: e => {
    e.preventDefault();
    const vid = +idIn.value, name = nameIn.value.trim();
    if (!(vid >= 2 && vid <= 4094)) { err.textContent = 'VLAN ID must be between 2 and 4094.'; return; }
    if (used.has(vid)) { err.textContent = `VLAN ${vid} already exists.`; return; }
    if (!/^[\w .:-]*$/.test(name)) { err.textContent = 'Use letters, digits, spaces and . : _ - in the name.'; return; }
    if (forPorts) { pending.put({ t: 'vlan+', vid, name }, undefined); for (const p of forPorts) pending.setUntagged(p, vid); S.sel = forPorts.map(p => p.name); S.vlan = null; close(); redraw(); return; }
    pending.put({ t: 'vlan+', vid, name });
    S.lens = 'vlans'; S.vlan = vid; close(); redraw();
    toast(`VLAN ${vid} added to pending changes. Click ports to add them, then Apply.`);
  } }, h('div', { class: 'f' }, h('label', {}, 'VLAN ID'), idIn), h('div', { class: 'f' }, h('label', {}, 'Name'), nameIn), err,
    h('div', { class: 'acts' }, h('button', { class: 'btn pri', type: 'submit' }, 'Add VLAN'))));
  nameIn.focus();
}
