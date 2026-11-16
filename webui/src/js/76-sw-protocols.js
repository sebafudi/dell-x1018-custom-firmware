/* ---------- Switching: layer-2 protocols (spanning tree, LAG/LACP, LLDP, voice VLAN, GVRP, protocol / private VLANs, multicast) ----------
 * Shared helpers for 76/77 first. Two small adapters let port groups use the engine's pending tray for writes it can't express yet:
 *  - nested wcd bodies: a port-group `wrap` of 'InterfaceList/InterfaceEntry' becomes <InterfaceList><InterfaceEntry>…; a '?a=1' suffix
 *    adds scalar siblings (RSTP needs pathCostDefaultValueType echoed); a '#tag' suffix on a section name keeps two pending groups apart
 *    (GreenEthSavingTypeList rows 1 and 2) and is stripped before sending; SW.fix[section](entry) reshapes an entry (LLDP-MED policies).
 *  - form pages: a pending section 'form:API/x_e.htm' is sent as one RomPager edit per port (fields + '<VT>$endQuery=OK'),
 *    or through SW.forms[path] when the page needs something special (read-modify-write bitmaps, create/destroy rows). */
ICONS.mcast = '<circle cx="3.5" cy="8" r="1.6"/><path d="M5.1 8H8M8 8l5-4.5M8 8h5.5M8 8l5 4.5"/>';
ICONS.phone = '<path d="M4 2.5h2.5l1 3-1.6 1.1a7 7 0 0 0 3.5 3.5l1.1-1.6 3 1V12a1.5 1.5 0 0 1-1.6 1.5A10.5 10.5 0 0 1 2.5 4.1 1.5 1.5 0 0 1 4 2.5Z"/>';

{ // block scope: nothing below leaks into the shared bundle scope; 77-sw-ports.js gets these helpers through api.sw
const SW = api.sw = { forms: {}, fix: {} };
(post0 => {
  api.post = function (blocks, label) {
    blocks = arr(blocks);
    if (blocks[0] && /^form:/.test(blocks[0].section)) return swForm(blocks[0], label);
    return post0.call(this, blocks.map(b => {
      const section = b.section.replace(/#.*/, ''), body = {};
      for (const [k, v] of Object.entries(b.body || {})) {
        const val = SW.fix[section] && Array.isArray(v) ? v.map(SW.fix[section]) : v;
        if (!/[/?]/.test(k)) { body[k] = val; continue; }
        const [path, q] = k.split('?'), [a, z] = path.split('/');
        if (q) for (const kv of q.split('&')) { const [n, x] = kv.split('='); body[n] = x; }
        body[a] = z ? { [z]: val } : val;
      }
      return { ...b, section, body };
    }), label);
  };
})(api.post);
async function swForm(b, label) {
  const path = b.section.slice(5).replace(/#.*/, ''), [vt, list] = Object.entries(b.body)[0];
  if (SW.forms[path]) await SW.forms[path](arr(list), label);
  else for (const e of arr(list)) await api.formPost(path, { ...e, [vt + '$endQuery']: 'OK' }, label);
  bus.emit('wrote', [{ section: 'form:' + path.replace(/_e\.htm$/, '.htm') }]);
  return { _status: { code: '0' } };
}
/* form list page -> rows [{'field$query': v}] (one per $repeat?N), keeping rows that have `need` */
function swFormRows(v, need) {
  const by = {};
  for (const [k, val] of Object.entries(v || {})) { const m = k.match(/^(.+)\$repeat\?(\d+)$/); if (m) (by[m[2]] = by[m[2]] || {})[m[1] + '$query'] = val; }
  return Object.values(by).filter(r => r[need] != null && r[need] !== '');
}
/* a derived in-memory resource so portControl/rowOf can read nested or form data: swAlias(name, key, v => rows) -> key */
function swAlias(name, key, fn) { const e = data.entry(key); data.mem.set('~' + name, { at: e ? e.at : 0, v: { E: e && e.v ? fn(e.v) : [] } }); return '~' + name; }
/* per-port controls with automatic pending-tray text: "fast link on", "path cost 20000" */
function swCtls(ports, c, spec, fields) {
  spec.text = spec.text || ((k, v) => {
    const f = fields.find(x => x.k === k) || {}, o = f.options && opt(f.options).find(x => String(x[0]) === String(v));
    return `${f.t || f.label || k} ${f.type === 'toggle' ? (String(v) === String(f.on ?? '1') ? 'on' : 'off') : o ? o[1].toLowerCase() : v + (f.unit ? ' ' + f.unit : '')}`;
  });
  return fields.map(f => c.control(ports, spec, f));
}
/* one character of a bit-string field ("01100000") as a toggle; each port keeps its other bits */
function swBit(ports, spec, k, idx, label, len, help) {
  const st = ports.map(p => {
    const o = pending.find(pending.key({ t: 'pf', port: p.name, section: spec.section, field: k })), r = rowOf(spec.key, p, spec.keyField);
    const live = r ? String(r[k] ?? '') : '';
    return { v: (o ? o.value : live).padEnd(len, '0'), live };
  });
  const on = st.every(s => s.v[idx] === '1'), pend = ports.some(p => pending.find(pending.key({ t: 'pf', port: p.name, section: spec.section, field: k })));
  return h('div', { class: 'fl line' }, h('span', {}, h('b', {}, label), help ? h('span', { class: 'hint' }, help) : null),
    h('button', { type: 'button', class: ['tog', on && 'on', pend && 'pend'], role: 'switch', 'aria-checked': on ? 'true' : 'false', 'aria-label': label,
      onclick: () => ports.forEach((p, i) => { const a = st[i].v.split(''); a[idx] = on ? '0' : '1'; pending.pf(p, spec, k, a.join(''), st[i].live); }) }));
}
const swOnOff = v => v === '1' ? 'on' : 'off';
const SW_PRIO16 = Array.from({ length: 16 }, (_, i) => String(i * 16));
const swPortOpts = m => m.ports.map(p => [String(p.no), `Port ${p.no}${p.desc ? ' · ' + p.desc : ''}`]);
/* port lists in multicast tables: "gi1/0/1-4,gi1/0/7,LAG1" <-> Set of port numbers (+ other names kept as is) */
function swPlParse(s) {
  const ports = new Set(), other = [];
  for (const t of String(s || '').split(',').map(x => x.trim()).filter(Boolean)) {
    const m = t.match(/^gi\d+\/\d+\/(\d+)(?:-(\d+))?$/i);
    if (m) for (let i = +m[1]; i <= +(m[2] || m[1]); i++) ports.add(i); else other.push(t);
  }
  return { ports, other };
}
const swPlNames = set => fmtList(set).split(',').filter(Boolean).map(r => 'gi1/0/' + r).join(',');
const swPlText = s => { const { ports, other } = swPlParse(s); return [ports.size ? fmtList(ports).replace(/,/g, ', ') : '', ...other].filter(Boolean).join(', ') || '—'; };
const swPortSetOk = v => !v || (/^[\d,\s-]+$/.test(v) && [...parseList(v.replace(/\s/g, ''))].every(n => n >= 1 && n <= 18)) ? null : 'use port numbers 1–18, e.g. 1-4,7';
const swWatched = (c, nos) => [...nos].map(n => 'gi1/0/' + n).filter(n => n === c.m.mine || n === 'gi1/0/1')
  .map(n => n === c.m.mine ? `Port ${portNo(n)} is your connection to the switch.` : 'Port 1 is the uplink to your network.');

Object.assign(SW, { alias: swAlias, formRows: swFormRows, ctls: swCtls, bit: swBit, onOff: swOnOff, portOpts: swPortOpts });

/* ================= Spanning tree ================= */
const STPK = { g: 'SpanningTreeGlobalParam', stp: 'STP&interfaceType=1', rstp: 'RSTP&interfaceType=1', mst: 'MSTPGlobalSetting', inst: 'MSTPInstanceList' };
const STP_STATE = { 1: 'disabled', 2: 'blocking', 3: 'listening', 4: 'learning', 5: 'forwarding', 6: 'broken' };
const STP_ROLE = { 0: 'unknown', 1: 'disabled', 2: 'alternate', 3: 'backup', 4: 'root', 5: 'designated' };
const swStpState = (v, mode) => mode === '2' && (v === '2' || v === '3') ? 'discarding' : STP_STATE[v] || '—';
const swStpPorts = c => arr(((c.get(STPK.stp) || {}).InterfaceList || {}).InterfaceEntry);
const swRstpPorts = c => arr(((c.get(STPK.rstp) || {}).InterfaceList || {}).InterfaceEntry);

defSettings({
  id: 'stp', group: 'Switching', title: 'Spanning tree', icon: 'tree',
  terms: 'stp rstp mstp spanning-tree loop bridge priority root hello max age forward delay bpdu filtering flooding path cost rapid',
  keys: [STPK.g, STPK.stp, STPK.rstp],
  intro: 'Spanning tree finds cabling loops and blocks the extra links, so a loop cannot flood the network.',
  render(c) {
    const g = c.get(STPK.g) || {}, gs = (c.get(STPK.stp) || {}).GlobalSetting || {}, b = gs.BridgeSetting || {}, r = gs.DesignatedRoot || {};
    const mode = g.STPOperationMode, rp = new Map(swRstpPorts(c).map(x => [x.interfaceName, x]));
    const isRoot = r.bridgeID && r.bridgeID === r.rootBridgeID;
    return [c.form({
      values: { enabled: g.enabled, STPOperationMode: mode, BPDUHandlingMode: gs.BPDUHandlingMode, pathCostDefaultValueType: gs.pathCostDefaultValueType,
        bridgePriority: b.bridgePriority, helloTime: b.helloTime, maxAge: b.maxAge, forwardDelay: b.forwardDelay },
      fields: [
        { k: 'enabled', type: 'toggle', label: 'Loop protection (spanning tree)', help: 'Off only if nothing can ever form a loop.' },
        { k: 'STPOperationMode', type: 'seg', label: 'Version', options: [['0', 'STP'], ['2', 'Rapid (RSTP)'], ['3', 'Multiple (MSTP)']], help: 'Rapid is the usual choice. MSTP runs one tree per group of VLANs.' },
        { k: 'bridgePriority', type: 'number', label: 'Bridge priority', min: 0, max: 61440, help: 'Lowest priority becomes the root. Steps of 4096; default 32768.',
          validate: v => +v >= 0 && +v <= 61440 && +v % 4096 === 0 ? null : '0–61440 in steps of 4096' },
        { k: 'BPDUHandlingMode', type: 'select', label: 'Spanning-tree frames where it is off', options: [['2', 'Pass them on (flooding)'], ['1', 'Drop them (filtering)']] },
        { k: 'pathCostDefaultValueType', type: 'seg', label: 'Path cost method', options: [['1', 'Short (16-bit)'], ['2', 'Long (32-bit)']] },
        { k: 'helloTime', type: 'number', label: 'Hello time', unit: 's', min: 1, max: 10, validate: v => +v >= 1 && +v <= 10 ? null : '1–10 s' },
        { k: 'maxAge', type: 'number', label: 'Max age', unit: 's', min: 6, max: 40,
          validate: (v, a) => +v < 6 || +v > 40 ? '6–40 s' : +v < 2 * (+a.helloTime + 1) ? 'must be at least 2 × (hello time + 1)' : null },
        { k: 'forwardDelay', type: 'number', label: 'Forward delay', unit: 's', min: 4, max: 30,
          validate: (v, a) => +v < 4 || +v > 30 ? '4–30 s' : 2 * (+v - 1) < +a.maxAge ? 'must satisfy 2 × (forward delay − 1) ≥ max age' : null },
      ],
      danger: ch => ch.enabled === '2' ? 'With spanning tree off, one looped cable can flood the whole network, including your connection.'
        : 'STPOperationMode' in ch || 'bridgePriority' in ch ? 'The tree is recalculated: links can pause for up to 30 s, including yours.' : null,
      apply: (ch, a) => {
        const blocks = [];
        if ('enabled' in ch || 'STPOperationMode' in ch) blocks.push({ section: 'SpanningTreeGlobalParam', action: 'set', body: { enabled: a.enabled, STPOperationMode: a.STPOperationMode } });
        if (Object.keys(ch).some(k => !['enabled', 'STPOperationMode'].includes(k))) blocks.push({ section: 'STP', action: 'set', body: { GlobalSetting: {
          BPDUHandlingMode: a.BPDUHandlingMode, pathCostDefaultValueType: a.pathCostDefaultValueType,
          BridgeSetting: { bridgePriority: a.bridgePriority, helloTime: a.helloTime, maxAge: a.maxAge, forwardDelay: a.forwardDelay } } } });
        return api.post(blocks, 'spanning tree');
      },
    }),
    c.block('Tree now', c.kv([['This switch', r.bridgeID], ['Root bridge', isRoot ? 'this switch' : r.rootBridgeID],
      ['Root port', r.rootPortID && r.rootPortID !== '0' ? r.rootPortID : 'none (this switch is the root)'], ['Root path cost', r.rootPathCost],
      ['Topology changes', `${r.topologyChangeCount || 0}${r.lastTopologyChangeDateTime ? ', last ' + r.lastTopologyChangeDateTime + ' ago' : ''}`]])),
    c.table({ title: 'Ports', help: 'Per-port settings are in the port inspector.', rows: swStpPorts(c), columns: [
      { label: 'Port', get: x => portNo(x.interfaceName) },
      { label: 'State', get: x => x.STPEnabled === '2' ? 'off' : [h('span', { class: ['led', x.portState === '5' ? 'lg' : x.portState === '1' ? '' : 'ly'] }), ' ', swStpState(x.portState, mode)] },
      { label: 'Role', get: x => STP_ROLE[x.portRole] },
      { label: 'Edge', get: x => swOnOff(x.portFastOperEnabled) },
      { label: 'Link type', get: x => { const q = rp.get(x.interfaceName); return q ? (q.pointToPointOperationStatusMode === '1' ? 'point-to-point' : 'shared') + (q.STPMode === '1' ? ', STP peer' : '') : '—'; } },
      { label: 'Cost', num: true, get: x => x.pathCost },
    ] })];
  },
});

let swMstpInst = '1';
const swMstpIfKey = n => data.def(`MSTPInterfaceList&instanceID=${n}&interfaceType=1`, 'config', { prefetch: false });
const swMstpSec = defSettings({
  id: 'mstp', group: 'Switching', title: 'Multiple spanning tree (MSTP)', icon: 'tree',
  terms: 'mstp msti instance region revision max hops vlan to instance mapping mst interface priority path cost',
  keys: [STPK.g, STPK.mst, STPK.inst, swMstpIfKey(1)],
  render(c) {
    const g = c.get(STPK.g) || {}, mg = c.get(STPK.mst) || {}, inst = rows(c.get(STPK.inst)).filter(x => x.instanceID !== '0');
    const ifk = swMstpIfKey(swMstpInst), ifs = rows(c.get(ifk));
    return [g.STPOperationMode !== '3' ? c.note('These settings take effect only when the spanning tree version is Multiple (MSTP).') : null,
      c.form({ title: 'Region', help: 'Switches with the same name, revision and VLAN mapping form one MSTP region.',
        values: { regionName: mg.regionName, revision: mg.revision, maxHops: mg.maxHops },
        fields: [{ k: 'regionName', label: 'Region name', validate: v => v && v.length <= 32 ? null : '1–32 characters' },
          { k: 'revision', type: 'number', label: 'Revision', min: 0, max: 65535, validate: v => +v >= 0 && +v <= 65535 && v !== '' ? null : '0–65535' },
          { k: 'maxHops', type: 'number', label: 'Max hops', min: 1, max: 40, validate: v => +v >= 1 && +v <= 40 ? null : '1–40' }],
        apply: (ch, a) => c.post('MSTPGlobalSetting', { regionName: a.regionName, revision: String(a.revision), maxHops: String(a.maxHops) }) }),
      c.kv([['Region root (IST master)', mg.ISTMasterAddr ? `${mg.ISTMasterPriority}-${mg.ISTMasterAddr}` : '']]),
      c.table({ title: 'Instances and their VLANs', rows: inst, key: x => 'instance ' + x.instanceID, columns: [
        { label: 'Instance', get: x => x.instanceID }, { label: 'VLANs', get: x => x.VLANList || 'none' }, { label: 'Priority', num: true, get: x => x.priority },
        { label: 'Root bridge', get: x => x.dsgRootAddr === x.brdgAddr ? 'this switch' : `${x.dsgRootPriority}-${x.dsgRootAddr}` },
        { label: 'Root port', get: x => x.rootIfName && x.rootIfName !== '0' ? x.rootIfName : '—' }, { label: 'Cost', num: true, get: x => x.rootCost },
        { label: 'Hops left', num: true, get: x => x.rmngHops }],
        edit: { fields: () => [
          { k: 'priority', type: 'number', label: 'Bridge priority', min: 0, max: 61440, validate: v => +v >= 0 && +v <= 61440 && +v % 4096 === 0 ? null : '0–61440 in steps of 4096' },
          { k: 'add', label: 'Map VLANs to this instance', placeholder: 'e.g. 10-20,30', validate: v => !v || validList(v) ? null : 'VLAN list like 10-20,30' },
          { k: 'del', label: 'Return VLANs to the common tree', placeholder: 'e.g. 15', validate: v => !v || validList(v) ? null : 'VLAN list like 10-20,30' }],
          values: x => ({ priority: x.priority, add: '', del: '' }),
          apply: (ch, a, x) => {
            const blocks = [], ent = s => [...parseList(s.replace(/\s/g, ''))].map(v => ({ VLANID: String(v), instanceID: x.instanceID }));
            if ('priority' in ch) blocks.push({ section: 'MSTPInstanceList', action: 'set', body: { Entry: { instanceID: x.instanceID, priority: String(a.priority) } } });
            if (a.add) blocks.push({ section: 'MSTPVLANList', action: 'set', body: { Entry: ent(a.add) } });
            if (a.del) blocks.push({ section: 'MSTPVLANList', action: 'restore', body: { Entry: ent(a.del) } });
            return blocks.length ? api.post(blocks, 'MSTP instance') : null;
          } } }),
      c.block('Ports in instance ', h('select', { 'aria-label': 'Instance', onchange: e => {
        swMstpInst = e.target.value; const k = swMstpIfKey(swMstpInst);
        swMstpSec.keys = swMstpSec.keys.filter(x => !/^MSTPInterfaceList/.test(x)).concat(k); c.refresh();
      } }, (inst.length ? inst : [{ instanceID: '1' }]).map(x => h('option', { value: x.instanceID, selected: x.instanceID === swMstpInst }, 'Instance ' + x.instanceID)))),
      c.table({ rows: ifs, key: x => 'port ' + portNo(x.interfaceName), empty: 'Reading…', columns: [
        { label: 'Port', get: x => portNo(x.interfaceName) }, { label: 'State', get: x => STP_STATE[x.state] }, { label: 'Role', get: x => STP_ROLE[x.role] },
        { label: 'Boundary', get: x => x.bndryEnbl === '2' ? 'boundary' : 'internal' }, { label: 'Priority', num: true, get: x => x.priority },
        { label: 'Cost', num: true, get: x => x.adminPathCost === '0' ? `${x.operPathCost} (auto)` : x.adminPathCost }],
        edit: { fields: () => [{ k: 'priority', type: 'select', label: 'Port priority', options: SW_PRIO16 },
          { k: 'adminPathCost', type: 'number', label: 'Path cost', help: '0 = automatic from the link speed', min: 0, max: 200000000, validate: v => +v >= 0 && +v <= 200000000 ? null : '0–200000000' }],
          values: x => ({ priority: x.priority, adminPathCost: x.adminPathCost }),
          apply: (ch, a, x) => c.post('MSTPInterfaceList', { Entry: { instanceID: swMstpInst, interfaceName: x.interfaceName, interfaceType: '1', priority: String(a.priority), adminPathCost: String(a.adminPathCost) } }) } })];
  },
});

defPortGroup({
  id: 'stp', title: 'Spanning tree', icon: 'tree', order: 60, keys: [STPK.stp, STPK.rstp, STPK.g],
  summary(ports, c) {
    const rs = ports.map(p => rowOf(swAlias('stp', STPK.stp, v => arr((v.InterfaceList || {}).InterfaceEntry)), p)).filter(Boolean);
    if (!rs.length) return '';
    if (rs.length > 1) { const e = rs.filter(r => r.portFastOperEnabled === '1').length; return e ? `${e} edge port${e > 1 ? 's' : ''}` : ''; }
    const r = rs[0];
    return r.STPEnabled === '2' ? 'off' : `${swStpState(r.portState, (c.get(STPK.g) || {}).STPOperationMode)}${r.portFastOperEnabled === '1' ? ', edge port' : ''}`;
  },
  body(ports, c) {
    const key = swAlias('stp', STPK.stp, v => arr((v.InterfaceList || {}).InterfaceEntry)), rkey = swAlias('rstp', STPK.rstp, v => arr((v.InterfaceList || {}).InterfaceEntry));
    const one = ports.length === 1 ? rowOf(key, ports[0]) : null, rs = ports.length === 1 ? rowOf(rkey, ports[0]) : null;
    const mode = (c.get(STPK.g) || {}).STPOperationMode, pct = (c.get(STPK.rstp) || {}).pathCostDefaultValueType || '2';
    const rspec = { key: rkey, section: 'RSTP', wrap: 'InterfaceList/InterfaceEntry?pathCostDefaultValueType=' + pct };
    return [one ? c.kv([['State', one.STPEnabled === '2' ? 'spanning tree off' : `${swStpState(one.portState, mode)}, ${STP_ROLE[one.portRole]} port`],
      ['Edge port now', swOnOff(one.portFastOperEnabled)], rs ? ['Link type now', rs.pointToPointOperationStatusMode === '1' ? 'point-to-point' : 'shared'] : null,
      ['Path cost now', one.pathCost], ['Designated bridge', one.designatedBridgeString], ['Times forwarding', one.forwardTransitionCount],
      one.LAGID && one.LAGID !== '0' ? ['LAG', `in LAG ${one.LAGID}: the LAG's settings apply`] : null]) : null,
    swCtls(ports, c, { key, section: 'STP', wrap: 'InterfaceList/InterfaceEntry' }, [
      { k: 'STPEnabled', type: 'toggle', label: 'Spanning tree on this port', t: 'spanning tree' },
      { k: 'portFastEnabled', type: 'select', label: 'Fast link (PortFast, edge port)', t: 'fast link', help: 'Starts forwarding at once; for ports with one device, not a switch.',
        options: [['3', 'Automatic'], ['1', 'On'], ['2', 'Off']] },
      { k: 'BPDUGuardEnabled', type: 'toggle', label: 'BPDU guard', t: 'BPDU guard', help: 'Shuts the port down if a switch is plugged in.' },
      { k: 'rootGuardEnabled', type: 'toggle', label: 'Root guard', t: 'root guard', help: 'Never lets the root bridge be reached through this port.' },
      { k: 'portPriority', type: 'select', label: 'Port priority', t: 'STP priority', options: SW_PRIO16 },
      { k: 'pathCost', type: 'number', label: 'Path cost', t: 'path cost', min: 1, max: 200000000 }]),
    swCtls(ports, c, rspec, [{ k: 'pointToPointAdminStatusMode', type: 'select', label: 'Link type (point-to-point)', t: 'link type',
      help: 'Automatic: point-to-point on full duplex.', options: [['2', 'Automatic'], ['0', 'Point-to-point'], ['1', 'Shared']] }]),
    h('div', { class: 'acts' }, h('button', { class: 'btn sm', type: 'button', title: 'Send RSTP frames again to find out whether the neighbour still speaks only classic STP',
      onclick: () => ports.forEach(p => pending.pf(p, { ...rspec, text: () => 're-check neighbour STP version' }, 'activateProtocolMigrationTestEnabled', '1', '2')) }, 'Re-check neighbour version (protocol migration)'))];
  },
});

/* ================= Link aggregation ================= */
const LAGK = { list: 'LAGList', lacpLag: 'LACPLAGList', lacpPort: 'LACPPortList', lacpG: 'LACPGlobalSetting', std: 'Standard802_3List&interfaceType=2' };
const LAG_TYPE = { 1: 'static', 2: 'LACP' };
const swLags = c => rows(c.get(LAGK.list), 'LAGEntry').map(l => ({ name: l.interfaceName, n: +String(l.interfaceName).replace(/\D/g, ''), type: l.LACPType,
  members: arr(l.PortList && l.PortList.PortEntry).map(x => x.portName) }));
const swLagOf = (c, p) => swLags(c).find(l => l.members.includes(p.name));
const swLagBody = (l, type, ports) => ({ LAGEntry: { interfaceName: l, LACPType: String(type), PortList: { PortEntry: ports.map(n => ({ portName: n })) } } });

defSettings({
  id: 'lag', group: 'Switching', title: 'Link aggregation (LAG)', icon: 'lag',
  terms: 'lag lacp port-channel channel-group trunk bond bonding team aggregation etherchannel 802.3ad system priority',
  keys: [LAGK.list, LAGK.lacpPort, LAGK.lacpG, LAGK.std],
  intro: 'A LAG bundles several cables to the same device into one faster, redundant link. Both ends must be set up the same way.',
  render(c) {
    const lags = swLags(c), std = new Map(rows(c.get(LAGK.std)).map(x => [x.interfaceName, x]));
    const used = new Map(); for (const l of lags) for (const n of l.members) used.set(n, l.n);
    const free = lags.filter(l => !l.members.length);
    // creation flow
    const sel = new Set(); let num = free[0] ? String(free[0].n) : '', type = '2';
    const chips = h('div', { class: 'chips' }), warn = h('div');
    const drawChips = () => {
      chips.replaceChildren(...c.m.ports.map(p => {
        const other = used.get(p.name), on = sel.has(p.no);
        return h('button', { type: 'button', class: 'chip', disabled: !!other, 'aria-pressed': on ? 'true' : 'false', title: other ? `Already in LAG ${other}` : p.desc || '',
          onclick: () => { on ? sel.delete(p.no) : sel.add(p.no); drawChips(); } }, h('span', { class: ['led', on && 'lg'] }), h('b', {}, p.no), other ? h('span', { class: 'mu' }, `LAG ${other}`) : null);
      }));
      warn.replaceChildren(...swWatched(c, sel).map(r => h('p', { class: 'risk' }, icon('err'), r)),
        sel.size > 8 ? h('p', { class: 'risk' }, icon('err'), 'A LAG holds at most 8 ports.') : null);
    };
    drawChips();
    const create = free.length ? c.block('New LAG',
      h('div', { class: 'fl' }, h('label', {}, 'LAG number'), h('select', { onchange: e => { num = e.target.value; } }, free.map(l => h('option', { value: String(l.n) }, 'LAG ' + l.n)))),
      h('div', { class: 'fl' }, h('label', {}, 'Kind'), h('div', { class: 'seg', role: 'radiogroup' }, [['2', 'LACP (negotiated)'], ['1', 'Static']].map(([v, l]) =>
        h('button', { type: 'button', class: v === type ? 'on' : '', role: 'radio', 'aria-checked': v === type ? 'true' : 'false',
          onclick: e => { type = v; [...e.currentTarget.parentNode.children].forEach(b => { const o = b === e.currentTarget; b.className = o ? 'on' : ''; b.setAttribute('aria-checked', o); }); } }, l))),
        h('span', { class: 'hint' }, 'LACP checks that the other end agrees; static just bundles the ports.')),
      h('div', { class: 'fl' }, h('label', {}, 'Member ports'), chips, h('span', { class: 'hint' }, 'Members take over the LAG\'s VLAN and spanning-tree settings.')), warn,
      h('div', { class: 'acts' }, h('button', { class: 'btn pri', type: 'button', onclick: async e => {
        if (!num || !sel.size) return toast('Pick a LAG number and at least one port.', true);
        if (sel.size > 8) return toast('A LAG holds at most 8 ports.', true);
        const risks = swWatched(c, sel);
        if (risks.length && !await confirmBox('This can cut you off', [...risks, 'The port stops working on its own and only carries traffic once the other end forms the same LAG.'], 'Create anyway', true)) return;
        const names = [...sel].sort((a, b) => a - b).map(n => 'gi1/0/' + n);
        await act(e.currentTarget, () => c.post('LAGList', swLagBody('LAG' + num, type, names)), `LAG ${num} created. Not saved yet.`).catch(() => {});
        journal.add([`LAG ${num}: created (${LAG_TYPE[type]}) with ports ${fmtList(sel)}`]); setTimeout(c.refresh, 1200);
      } }, icon('plus'), 'Create LAG'))) : c.note('All LAGs are in use.');
    return [c.table({ title: 'LAGs', rows: lags.filter(l => l.members.length || std.get(l.name)?.interfaceDescription), empty: 'No LAGs yet.', key: l => l.name, columns: [
      { label: 'LAG', get: l => l.n }, { label: 'Kind', get: l => LAG_TYPE[l.type] || '—' },
      { label: 'Ports', get: l => fmtList(new Set(l.members.map(portNo))).replace(/,/g, ', ') || 'none' },
      { label: 'Link', get: l => { const s = std.get(l.name); return s ? [h('span', { class: ['led', s.linkState === '1' && 'lg'] }), ' ', s.linkState === '1' ? (s.speedOper ? s.speedOper + ' Mb/s' : 'up') : 'down'] : '—'; } },
      { label: 'Name', get: l => std.get(l.name)?.interfaceDescription || '' }],
      edit: { fields: () => [{ k: 'desc', label: 'Name' }, { k: 'admin', type: 'toggle', label: 'Enabled' },
        { k: 'type', type: 'seg', label: 'Kind', options: [['2', 'LACP'], ['1', 'Static']] },
        { k: 'ports', label: 'Member ports', placeholder: 'e.g. 5-6', validate: (v, a) => swPortSetOk(v) || ([...parseList(v)].some(n => used.has('gi1/0/' + n) && used.get('gi1/0/' + n) !== a._n) ? 'a port is already in another LAG' : parseList(v).size > 8 ? 'at most 8 ports' : null) }],
        values: l => ({ desc: std.get(l.name)?.interfaceDescription || '', admin: std.get(l.name)?.adminState || '1', type: l.type === '1' ? '1' : '2', ports: fmtList(new Set(l.members.map(portNo))), _n: l.n }),
        apply: async (ch, a, l) => {
          const now = parseList(a.ports.replace(/\s/g, '')), old = new Set(l.members.map(portNo)), nm = s => [...s].sort((x, y) => x - y).map(n => 'gi1/0/' + n);
          const blocks = [], typeCh = 'type' in ch && l.members.length;
          const gone = typeCh ? old : new Set([...old].filter(n => !now.has(n)));
          const risks = swWatched(c, new Set([...gone, ...[...now].filter(n => !old.has(n))]));
          if (risks.length && !await confirmBox('This can cut you off', risks, 'Apply anyway', true)) throw new Error('Cancelled.');
          if (gone.size) blocks.push({ section: 'LAGList', action: 'delete', body: swLagBody(l.name, typeCh ? l.type : a.type, nm(gone)) });
          if (now.size && ('ports' in ch || typeCh)) blocks.push({ section: 'LAGList', action: 'set', body: swLagBody(l.name, a.type, nm(now)) });
          if ('desc' in ch || 'admin' in ch) blocks.push({ section: 'Standard802_3List', action: 'set', body: { Entry: { interfaceName: l.name, ...('desc' in ch ? { interfaceDescription: a.desc } : {}), ...('admin' in ch ? { adminState: a.admin } : {}) } } });
          if (blocks.length) await api.post(blocks, 'LAG ' + l.n);
        } },
      remove: { label: 'Empty', title: 'Remove all ports from this LAG?', confirm: l => `Ports ${fmtList(new Set(l.members.map(portNo)))} go back to working on their own.`,
        apply: l => l.members.length ? c.post('LAGList', swLagBody(l.name, l.type, l.members), 'delete') : null } }),
    create,
    c.form({ title: 'LACP', values: { p: (c.get(LAGK.lacpG) || {}).LACPSystemPriority },
      fields: [{ k: 'p', type: 'number', label: 'System priority', min: 1, max: 65535, help: 'When the two ends disagree, the side with the lower number decides which ports are active.',
        validate: v => +v >= 1 && +v <= 65535 ? null : '1–65535' }],
      apply: (ch, a) => c.post('LACPGlobalSetting', { LACPSystemPriority: String(a.p) }) }),
    c.note('Per-port LACP priority and timeout are in the port inspector.')];
  },
});

defPortGroup({
  id: 'lag', title: 'Link aggregation', icon: 'lag', order: 62, keys: [LAGK.list, LAGK.lacpPort],
  summary(ports, c) {
    const ls = ports.map(p => swLagOf(c, p));
    if (ports.length > 1) { const n = ls.filter(Boolean).length; return n ? `${n} in a LAG` : 'not in a LAG'; }
    return ls[0] ? `LAG ${ls[0].n} (${LAG_TYPE[ls[0].type] || '?'})` : 'not in a LAG';
  },
  body(ports, c) {
    const l = ports.length === 1 ? swLagOf(c, ports[0]) : null;
    return [ports.length === 1 ? c.kv([['LAG', l ? `LAG ${l.n}, ${LAG_TYPE[l.type] || ''} with ports ${fmtList(new Set(l.members.map(portNo)))}` : 'none']]) : null,
      h('div', { class: 'acts' }, h('button', { class: 'btn sm', type: 'button', onclick: () => c.settings('lag') }, icon('lag'), l ? 'LAG settings' : 'Create a LAG…'),
        l ? h('button', { class: 'btn sm danger', type: 'button', onclick: async e => {
          const p = ports[0], risks = swWatched(c, [p.no]);
          if (!await confirmBox(`Remove port ${p.no} from LAG ${l.n}?`, [...risks, 'The port goes back to working on its own.'], 'Remove', true)) return;
          await act(e.currentTarget, () => api.post({ section: 'LAGList', action: 'delete', body: swLagBody(l.name, l.type, [p.name]) }, 'LAG ' + l.n), 'Removed from the LAG. Not saved yet.').catch(() => {});
          journal.add([`Port ${p.no}: removed from LAG ${l.n}`]);
        } }, 'Remove from LAG…') : null),
      swCtls(ports, c, { key: LAGK.lacpPort, section: 'LACPPortList' }, [
        { k: 'actorPortPriority', type: 'number', label: 'LACP port priority', t: 'LACP priority', min: 1, max: 65535, help: 'Lower is preferred when not all ports can be active.' },
        { k: 'actorPortAdminTimeout', type: 'select', label: 'LACP timeout', t: 'LACP timeout', options: [['2', 'Long (slow, 30 s)'], ['1', 'Short (fast, 1 s)']] }])];
  },
});

/* ================= LLDP ================= */
const LLDPK = { g: 'LLDPGlobalSetting', port: 'LLDPInterfaceList', med: 'LLDPMEDInterfaceList', pol: 'LLDPMEDNetworkPolicyList' };
const MED_APP = [['1', 'Voice'], ['2', 'Voice signaling'], ['3', 'Guest voice'], ['4', 'Guest voice signaling'], ['5', 'Softphone voice'], ['6', 'Video conferencing'], ['7', 'Streaming video'], ['8', 'Video signaling']];
const LLDP_TLV = [[0, 'Port description'], [1, 'System name'], [2, 'System description'], [3, 'Capabilities'], [4, 'Speed and duplex (802.3 MAC/PHY)'], [5, 'LAG (802.3)'], [7, 'Max frame size (802.3)']];
const LLDP_CAPS = ['other', 'repeater', 'bridge', 'Wi-Fi AP', 'router', 'phone', 'DOCSIS', 'station'];
const lldpCaps = s => [...String(s || '')].map((b, i) => b === '1' ? LLDP_CAPS[i] : null).filter(Boolean).join(', ') || 'unknown';
const lldpPols = c => rows(c.get(LLDPK.pol), 'NetworkPolicyEntry');
const lldpPolText = x => `${(MED_APP.find(a => a[0] === x.application) || [])[1] || 'policy'}, VLAN ${x.VLANID}${x.VLANType === '2' ? ' untagged' : ''}`;
SW.fix.LLDPMEDInterfaceList = e => { // pol:N fields -> <NetworkPolicyList><NetworkPolicyEntry>
  const out = {}, pl = [];
  for (const [k, v] of Object.entries(e)) { const m = k.match(/^pol:(\d+)$/); if (m) pl.push({ policyID: m[1], policyEnbl: v }); else out[k] = v; }
  if (pl.length) out.NetworkPolicyList = { NetworkPolicyEntry: pl };
  return out;
};

defSettings({
  id: 'lldp', group: 'Switching', title: 'LLDP (neighbour discovery)', icon: 'dev',
  terms: 'lldp lldp-med neighbors neighbours discovery tlv network policy voice med hold multiplier transmit interval',
  keys: [LLDPK.g, LLDPK.pol, { key: K.lldp, cls: 'live' }],
  intro: 'With LLDP, the switch and the devices on its ports tell each other their name, port and abilities.',
  render(c) {
    const g = c.get(LLDPK.g) || {}, pols = lldpPols(c), used = new Set(pols.map(x => x.policyID));
    const polFields = [{ k: 'application', type: 'select', label: 'Traffic', options: MED_APP },
      { k: 'VLANID', type: 'number', label: 'VLAN', min: 1, max: 4094, validate: v => +v >= 1 && +v <= 4094 ? null : '1–4094' },
      { k: 'VLANType', type: 'seg', label: 'Frames', options: [['1', 'Tagged'], ['2', 'Untagged']] },
      { k: 'userPriority', type: 'select', label: 'Priority (802.1p)', options: ['0', '1', '2', '3', '4', '5', '6', '7'] },
      { k: 'DSCP', type: 'number', label: 'DSCP', min: 0, max: 63, validate: v => +v >= 0 && +v <= 63 && v !== '' ? null : '0–63' }];
    const polBody = a => ({ NetworkPolicyEntry: { policyID: String(a.policyID), application: a.application, VLANID: String(a.VLANID), VLANType: a.VLANType, userPriority: String(a.userPriority), DSCP: String(a.DSCP) } });
    const nb = rows(c.get(K.lldp), 'NeighborEntry');
    return [c.form({
      values: { LLDPEnabled: g.LLDPEnabled, updateInterval: g.updateInterval, holdMultiplier: g.holdMultiplier, reinitializingDelay: g.reinitializingDelay, transmitDelay: g.transmitDelay },
      fields: [{ k: 'LLDPEnabled', type: 'toggle', label: 'LLDP' },
        { k: 'updateInterval', type: 'number', label: 'Send every', unit: 's', min: 5, max: 32768, help: 'Default 30.', validate: v => +v >= 5 && +v <= 32768 ? null : '5–32768 s' },
        { k: 'holdMultiplier', type: 'number', label: 'Neighbours keep it for', unit: '× interval', min: 2, max: 10, help: 'Default 4.', validate: v => +v >= 2 && +v <= 10 ? null : '2–10' },
        { k: 'reinitializingDelay', type: 'number', label: 'Restart delay', unit: 's', min: 1, max: 10, help: 'Default 2.', validate: v => +v >= 1 && +v <= 10 ? null : '1–10 s' },
        { k: 'transmitDelay', type: 'number', label: 'Min. gap after a change', unit: 's', min: 1, max: 8192, help: 'Default 2. At most a quarter of the interval.',
          validate: (v, a) => +v < 1 || +v > 8192 ? '1–8192 s' : +v > +a.updateInterval / 4 ? 'at most a quarter of the send interval' : null }],
      apply: ch => c.post('LLDPGlobalSetting', ch) }),
    c.table({ title: 'Network policies (LLDP-MED)', help: 'Tell phones and cameras which VLAN and priority to use. Attach them to ports in the port inspector.',
      rows: pols, key: x => 'policy ' + x.policyID, max: 32, columns: [{ label: '#', get: x => x.policyID }, { label: 'Traffic', get: x => (MED_APP.find(a => a[0] === x.application) || [])[1] },
        { label: 'VLAN', get: x => h('span', { class: 'bd sm', style: '--c:' + vcol.of(+x.VLANID) }, x.VLANID) }, { label: 'Frames', get: x => x.VLANType === '2' ? 'untagged' : 'tagged' },
        { label: 'Priority', num: true, get: x => x.userPriority }, { label: 'DSCP', num: true, get: x => x.DSCP }],
      add: { label: 'Add policy', fields: [{ k: 'policyID', type: 'select', label: 'Number', options: Array.from({ length: 32 }, (_, i) => String(i + 1)).filter(n => !used.has(n)) }, ...polFields],
        values: { policyID: Array.from({ length: 32 }, (_, i) => String(i + 1)).find(n => !used.has(n)), application: '1', VLANID: '', VLANType: '1', userPriority: '5', DSCP: '46' },
        apply: a => c.post(LLDPK.pol, polBody(a)) },
      edit: { fields: () => polFields, values: x => ({ ...x }),
        apply: (ch, a, x) => api.post([{ section: LLDPK.pol, action: 'delete', body: { NetworkPolicyEntry: { policyID: x.policyID } } }, { section: LLDPK.pol, action: 'set', body: polBody({ ...a, policyID: x.policyID }) }], 'network policy') },
      remove: { apply: x => c.post(LLDPK.pol, { NetworkPolicyEntry: { policyID: x.policyID } }, 'delete') } }),
    c.table({ title: 'Neighbours', rows: nb, empty: 'No LLDP neighbours.', columns: [{ label: 'Port', get: x => portNo(x.interfaceName) || x.interfaceName },
      { label: 'Device', get: x => x.systemName || x.deviceID }, { label: 'Their port', get: x => x.portDescription || x.advertisedPortID },
      { label: 'Kind', get: x => lldpCaps(x.systemCapabilitiesEnabled || x.systemCapabilitiesSupported) },
      { label: 'Address', get: x => arr(x.MngAddrList && (x.MngAddrList.MngAddrEntry || x.MngAddrList)).map(a => a.addr).filter(Boolean)[0] || '' }]}),
    nb.length ? h('div', { class: 'acts' }, h('button', { class: 'btn', type: 'button', onclick: async e => {
      if (!await confirmBox('Clear the neighbour table?', ['Neighbours reappear as they send their next LLDP frame.'], 'Clear', false)) return;
      await act(e.currentTarget, () => c.post('LLDPMEDNeighborList', { NeighborEntry: '' }, 'deleteAll'), 'Cleared.').catch(() => {}); setTimeout(c.refresh, 1200);
    } }, 'Clear neighbour table')) : null];
  },
});

defPortGroup({
  id: 'lldp', title: 'LLDP', icon: 'dev', order: 64, keys: [LLDPK.port, LLDPK.med, LLDPK.pol, K.ip],
  summary(ports) {
    const st = [...new Set(ports.map(p => (rowOf(LLDPK.port, p) || {}).portState))];
    return st.length > 1 ? 'mixed' : ({ 1: 'send only', 2: 'receive only', 3: 'send and receive', 4: 'off' }[st[0]] || '');
  },
  body(ports, c) {
    const spec = { key: LLDPK.port, section: LLDPK.port, wrap: 'InterfaceEntry', extra: p => ({ managementAddress: (rowOf(LLDPK.port, p) || {}).managementAddress || '' }), text: (k, v) => k === 'optionalTLVs' ? `LLDP sends: ${LLDP_TLV.filter(([i]) => v[i] === '1').map(t => t[1].toLowerCase()).join(', ') || 'basics only'}`
      : k === 'managementAddress' ? `LLDP address ${v || 'not sent'}` : k === 'mngAddrState' ? (v === '1' ? 'LLDP defaults' : 'LLDP custom') : `LLDP ${({ 1: 'send only', 2: 'receive only', 3: 'send and receive', 4: 'off' })[v]}` };
    // the switch only advertises a fixed (static) address: "Advertisement cannot be configured on non-static IP address"
    const ips = rows(c.get(K.ip)).filter(x => x.owner === '1').map(x => x.IPAddr).filter(x => x && !/^0\./.test(x));
    // explicit TLVs need explicit mode; the address always goes along (extra), empty = not advertised
    const custom = () => ports.forEach(p => { const l = (rowOf(LLDPK.port, p) || {}).mngAddrState; if (l !== '0') pending.pf(p, spec, 'mngAddrState', '0', l); });
    const mspec = { key: swAlias('med', LLDPK.med, v => rows(v, 'InterfaceEntry').map(r => { const o = { ...r }; for (const x of lldpPols(c)) o['pol:' + x.policyID] = arr((r.NetworkPolicyList || {}).NetworkPolicyEntry).some(q => q.policyID === x.policyID && q.policyEnbl !== '2') ? '1' : '2'; return o; })),
      section: LLDPK.med, wrap: 'InterfaceEntry', extra: p => ({ interfaceID: String(p.no), interfaceType: '1' }),
      text: (k, v) => k === 'MEDOptionalTLVs' ? `LLDP-MED ${v[0] === '1' ? 'on' : 'off'}${v[1] === '1' ? ', policy' : ''}${v[2] === '1' ? ', location' : ''}` : `network policy ${k.slice(4)} ${v === '1' ? 'attached' : 'detached'}` };
    return [swCtls(ports, c, spec, [{ k: 'portState', type: 'select', label: 'LLDP on this port', options: [['3', 'Send and receive'], ['1', 'Send only'], ['2', 'Receive only'], ['4', 'Off']] }]),
      h('p', { class: 'note' }, 'Extra information sent (the basics are always sent):'),
      h('div', { onclick: custom }, LLDP_TLV.map(([i, l]) => swBit(ports, spec, 'optionalTLVs', i, l, 8))),
      h('div', { onchange: custom }, c.control(ports, spec, { k: 'managementAddress', type: 'select', label: 'Management address sent', options: [['', 'None'], ...ips], help: ips.length ? null : 'Only a fixed (static) switch address can be sent; this one comes from DHCP.' })),
      h('p', { class: 'note' }, 'LLDP-MED (phones, cameras):'),
      swBit(ports, mspec, 'MEDOptionalTLVs', 0, 'LLDP-MED', 6), swBit(ports, mspec, 'MEDOptionalTLVs', 1, 'Send network policy', 6), swBit(ports, mspec, 'MEDOptionalTLVs', 2, 'Send location', 6),
      lldpPols(c).length ? lldpPols(c).map(x => c.control(ports, mspec, { k: 'pol:' + x.policyID, type: 'toggle', label: `Policy ${x.policyID}`, help: lldpPolText(x) }))
        : c.note('No network policies yet (LLDP settings).')];
  },
});

/* ================= Voice VLAN ================= */
const VOK = { g: 'VoiceVLANGlobalSetting', v: 'VoiceVLANList', oui: 'VoiceVLANOUIList', port: 'VoiceVLANInterfaceList&interfaceType=1' };
const swOuiFmt = s => String(s).replace(/[^0-9a-f]/gi, '').toUpperCase().match(/../g)?.join(':') || s;
defSettings({
  id: 'voice', group: 'Switching', title: 'Voice VLAN', icon: 'phone', terms: 'voice vlan phone telephony oui cos remark aging voip',
  keys: [VOK.g, VOK.v, VOK.oui, { key: K.vlans, cls: 'config' }],
  intro: 'Puts IP phones on their own VLAN with a higher priority. Phones are recognised by the first half of their MAC address (OUI).',
  render(c) {
    const g = c.get(VOK.g) || {}, v = rows(c.get(VOK.v), 'VLAN')[0] || {}, ouis = rows(c.get(VOK.oui), 'OUIEntry');
    return [c.form({
      values: { st: g.voiceVLANStateAdmin === '3' ? '3' : '0', VLANID: v.VLANID || g.voiceVLANIDAdmin, CoS: v.CoS || g.CoS, remark: v.remarkCoSEnable === '1' ? '1' : '2', age: g.agingTimeout },
      fields: [{ k: 'st', type: 'toggle', on: '3', off: '0', label: 'Voice VLAN' },
        { k: 'VLANID', type: 'select', label: 'VLAN', options: c.m.vlans.map(x => [String(x.id), `${x.id}${x.name ? ' · ' + x.name : ''}`]), show: a => a.st === '3' },
        { k: 'CoS', type: 'select', label: 'Priority (CoS)', options: ['0', '1', '2', '3', '4', '5', '6', '7'], help: 'Default 6.', show: a => a.st === '3' },
        { k: 'remark', type: 'toggle', label: 'Rewrite the priority of phone traffic (remark CoS)', show: a => a.st === '3' },
        { k: 'age', type: 'number', label: 'Forget a phone after', unit: 'min', min: 1, max: 43200, help: 'Default 1440 (one day).', validate: x => +x >= 1 && +x <= 43200 ? null : '1–43200 min' }],
      apply: (ch, a) => a.st === '3'
        ? api.post([{ section: VOK.v, action: 'set', body: { VLAN: { VLANID: String(a.VLANID), CoS: String(a.CoS), remarkCoSEnable: a.remark } } },
          { section: VOK.g, action: 'set', body: { voiceVLANStateAdmin: '3', agingTimeout: String(a.age) } }], 'voice VLAN')
        : api.post([{ section: VOK.g, action: 'set', body: { voiceVLANStateAdmin: '0', agingTimeout: String(a.age) } },
          ...(String(v.VLANID || '1') !== '1' ? [{ section: VOK.v, action: 'set', body: { VLAN: { VLANID: '1' } } }] : [])], 'voice VLAN') }),
    c.table({ title: 'Phone vendors (OUI)', rows: ouis, max: 16, key: x => swOuiFmt(x.OUIPrefix), columns: [{ label: 'OUI', get: x => h('span', { class: 'mono' }, swOuiFmt(x.OUIPrefix)) },
      { label: 'Vendor', get: x => String(x.OUIDescription || '').replace(/_+$/, '').replace(/_/g, ' ') }],
      add: { label: 'Add vendor', fields: [{ k: 'p', label: 'OUI', placeholder: '00:E0:BB', validate: x => !/^[0-9a-f]{2}([:-])[0-9a-f]{2}\1[0-9a-f]{2}$/i.test(x) ? 'three hex pairs like 00:E0:BB'
        : /^00[:-]00[:-]00$/.test(x) ? 'not 00:00:00' : parseInt(x[1], 16) % 2 ? 'that is a multicast prefix' : ouis.some(o => o.OUIPrefix.replace(/\W/g, '').toUpperCase() === x.replace(/\W/g, '').toUpperCase()) ? 'already listed' : null },
      { k: 'd', label: 'Vendor', validate: x => x.length <= 32 ? null : 'at most 32 characters' }], values: { p: '', d: '' },
        apply: a => c.post(VOK.oui, { OUIEntry: { OUIPrefix: a.p.replace(/\W/g, '').toUpperCase(), OUIDescription: a.d.replace(/ /g, '_') } }) },
      remove: { apply: x => c.post(VOK.oui, { OUIEntry: { OUIPrefix: x.OUIPrefix + ' ' } }, 'delete') } }),
    h('div', { class: 'acts' }, h('button', { class: 'btn', type: 'button', onclick: async e => {
      if (!await confirmBox('Restore the default vendor list?', ['All vendors you added are erased.'], 'Restore', true)) return;
      await act(e.currentTarget, () => c.post(VOK.oui, { OUIEntry: '' }, 'restoreAll'), 'Restored. Not saved yet.').catch(() => {}); setTimeout(c.refresh, 1200);
    } }, 'Restore default vendors'))];
  },
});
defPortGroup({
  id: 'voice', title: 'Voice VLAN', icon: 'phone', order: 66, keys: [VOK.port, VOK.g],
  summary: ports => { const s = [...new Set(ports.map(p => (rowOf(VOK.port, p) || {}).voiceVLANEnable))]; return s.length > 1 ? 'mixed' : s[0] === '1' ? 'phones detected' : 'off'; },
  body(ports, c) {
    const g = c.get(VOK.g) || {};
    return [g.voiceVLANStateAdmin !== '3' ? c.note('Voice VLAN is off for the switch (Settings → Voice VLAN).') : null,
      swCtls(ports, c, { key: VOK.port, section: 'VoiceVLANInterfaceList', wrap: 'InterfaceEntry', extra: p => ({ interfaceID: String(p.no) }) }, [
        { k: 'voiceVLANEnable', type: 'select', label: 'Voice VLAN', t: 'voice VLAN', options: [['1', 'Automatic (when a phone is seen)'], ['2', 'Off']], help: 'For a fixed setup, add the voice VLAN tagged on this port instead.' },
        { k: 'securityEnable', type: 'toggle', label: 'Phones only', t: 'voice VLAN phones-only', help: 'Drops traffic on the voice VLAN from devices that are not phones.' }])];
  },
});

/* ================= GVRP / GARP ================= */
const GARPK = data.def('form:API/garp_timers_table.htm', 'config', { prefetch: false });
defSettings({
  id: 'gvrp', group: 'Switching', title: 'GVRP (VLAN registration)', icon: 'vlan', terms: 'gvrp garp dynamic vlan registration join leave timers',
  keys: ['VLANGlobalSetting'],
  render: c => [c.form({ values: { GVRPEnable: (c.get('VLANGlobalSetting') || {}).GVRPEnable },
    fields: [{ k: 'GVRPEnable', type: 'toggle', label: 'GVRP', help: 'Lets neighbouring switches announce VLANs, which are then created here automatically. Works on trunk and general ports.' }],
    apply: ch => c.post('VLANGlobalSetting', ch) }), c.note('Turn it on per port, and set the GARP timers, in the port inspector.')],
});
defPortGroup({
  id: 'gvrp', title: 'GVRP', icon: 'vlan', order: 80, keys: ['GVRPInterfaceTable&interfaceType=1', { key: GARPK, cls: 'config', prefetch: false }],
  summary: ports => { const s = [...new Set(ports.map(p => (rowOf('GVRPInterfaceTable&interfaceType=1', p) || {}).GVRPEnable))]; return s.length > 1 ? 'mixed' : swOnOff(s[0]); },
  body(ports, c) {
    const k = 'GVRPInterfaceTable&interfaceType=1', gk = swAlias('garp', GARPK, v => swFormRows(v, 'dot1dBasePort$query'));
    const pick = (key, p, fs, kf) => { const r = rowOf(key, p, kf) || {}; return Object.fromEntries(fs.map(f => [f, r[f] || ''])); };
    const T = ['dot1dPortGarpJoinTime$query', 'dot1dPortGarpLeaveTime$query', 'dot1dPortGarpLeaveAllTime$query'];
    return [swCtls(ports, c, { key: k, section: 'GVRPInterfaceTable', extra: p => pick(k, p, ['GVRPEnable', 'VLANCreationEnable', 'VLANRegistrationEnable']) }, [
      { k: 'GVRPEnable', type: 'toggle', label: 'GVRP on this port', t: 'GVRP' },
      { k: 'VLANCreationEnable', type: 'toggle', label: 'Create VLANs it learns', t: 'GVRP VLAN creation' },
      { k: 'VLANRegistrationEnable', type: 'toggle', label: 'Register VLANs (dynamic membership)', t: 'GVRP registration' }]),
    h('p', { class: 'note' }, 'GARP timers, in hundredths of a second (default 20 / 60 / 1000). Leave ≥ 3 × join; leave-all > leave.'),
    swCtls(ports, c, { key: gk, section: 'form:API/garp_timers_table_e.htm', wrap: 'garpTimers', keyField: 'dot1dBasePort$query', keyValue: p => String(p.no), extra: p => pick(gk, p, T, 'dot1dBasePort$query') }, [
      { k: T[0], type: 'number', label: 'Join', t: 'GARP join', unit: '× 10 ms', min: 1 }, { k: T[1], type: 'number', label: 'Leave', t: 'GARP leave', unit: '× 10 ms', min: 1 },
      { k: T[2], type: 'number', label: 'Leave all', t: 'GARP leave-all', unit: '× 10 ms', min: 1 }])];
  },
});

/* ================= Protocol-based and private VLANs (form pages) ================= */
const PVK = { grp: 'form:API/protocol_group_table.htm', port: 'form:API/protocol_port.htm', pv: 'form:API/switch_private_vlan.htm' };
const PV_FRAME = [['1', 'Ethernet'], ['2', 'RFC 1042'], ['5', 'LLC other']];
const PV_ETYPE = { '0800': 'IPv4', '8137': 'IPX', '86dd': 'IPv6', '0806': 'ARP' };
const swHex4 = s => String(s).replace(/[^0-9a-f]/gi, '').toLowerCase().padStart(4, '0');
defSettings({
  id: 'protovlan', group: 'Switching', title: 'Protocol-based VLANs', icon: 'vlan', terms: 'protocol vlan group ethertype classification ipx arp frame type',
  keys: [PVK.grp, PVK.port],
  intro: 'Sorts untagged frames into VLANs by protocol (EtherType). Works on general-mode ports only.',
  render(c) {
    const grps = swFormRows(c.get(PVK.grp), 'dot1vProtocolGroupId$query'), maps = swFormRows(c.get(PVK.port), 'dot1dBasePort$query');
    const q = (r, f) => r[f + '$query'];
    return [c.table({ title: 'Protocol groups', rows: grps, key: r => 'group ' + q(r, 'dot1vProtocolGroupId'), columns: [
      { label: 'Group', get: r => q(r, 'dot1vProtocolGroupId') }, { label: 'Frame type', get: r => (PV_FRAME.find(f => f[0] === q(r, 'dot1vProtocolTemplateFrameType')) || [])[1] },
      { label: 'Protocol', get: r => { const v = swHex4(q(r, 'dot1vProtocolTemplateProtocolValue')); return `${PV_ETYPE[v] || ''} 0x${v}`; } }],
      add: { label: 'Add protocol', fields: [{ k: 'ft', type: 'select', label: 'Frame type', options: PV_FRAME },
        { k: 'pv', label: 'Protocol (EtherType, hex)', placeholder: '0800 = IPv4, 86dd = IPv6, 0806 = ARP', validate: v => /^[0-9a-f]{4}$/i.test(v) && parseInt(v, 16) >= 0x600 ? null : '4 hex digits, 0600–FFFF' },
        { k: 'g', type: 'number', label: 'Group number', min: 1, validate: v => +v >= 1 && +v <= 2147483647 ? null : 'a positive number' }], values: { ft: '1', pv: '0800', g: '1' },
        apply: a => c.formPost('API/protocol_group_add.htm', { 'dot1vProtocolTemplateFrameType$add': a.ft, 'dot1vProtocolTemplateProtocolValue$add': a.pv, 'dot1vProtocolGroupId$add': String(a.g), 'dot1vProtocolGroupRowStatus$add': '4', 'Proto_Group$endAdd': 'OK' }) },
      remove: { apply: r => c.formPost('API/protocol_group_table.htm', { 'dot1vProtocolTemplateFrameType$repeat?1': q(r, 'dot1vProtocolTemplateFrameType'), 'dot1vProtocolTemplateProtocolValue$repeat?1': q(r, 'dot1vProtocolTemplateProtocolValue'),
        'dot1vProtocolGroupRowStatus$repeat?1': '6', 'Proto_Group$endRepeat?1': 'OK' }) } }),
    c.table({ title: 'Ports', rows: maps, key: r => `port ${q(r, 'dot1dBasePort')} group ${q(r, 'dot1vProtocolPortGroupId')}`, columns: [
      { label: 'Port', get: r => q(r, 'rlPhdPortsIfIndexName') || q(r, 'dot1dBasePort') }, { label: 'Group', get: r => q(r, 'dot1vProtocolPortGroupId') },
      { label: 'VLAN', get: r => h('span', { class: 'bd sm', style: '--c:' + vcol.of(+q(r, 'dot1vProtocolPortGroupVid')) }, q(r, 'dot1vProtocolPortGroupVid')) }],
      add: { label: 'Map a port', fields: [{ k: 'p', type: 'select', label: 'Port', options: swPortOpts(c.m) }, { k: 'g', type: 'select', label: 'Group', options: [...new Set(grps.map(r => q(r, 'dot1vProtocolGroupId')))] },
        { k: 'v', type: 'select', label: 'VLAN', options: c.m.vlans.map(x => String(x.id)) }], values: { p: '2', g: grps[0] ? q(grps[0], 'dot1vProtocolGroupId') : '', v: '1' },
        apply: a => c.formPost('API/protocol_port_a.htm', { 'dot1dBasePort$add': a.p, 'dot1vProtocolPortGroupId$add': a.g, 'dot1vProtocolPortGroupVid$add': a.v, 'dot1vProtocolPortRowStatus$add': '4', 'Proto_Port$endAdd': 'OK' }) },
      edit: { fields: () => [{ k: 'v', type: 'select', label: 'VLAN', options: c.m.vlans.map(x => String(x.id)) }], values: r => ({ v: q(r, 'dot1vProtocolPortGroupVid') }),
        apply: (ch, a, r) => c.formPost('API/protocol_port_e.htm', { 'dot1dBasePort$query': q(r, 'dot1dBasePort'), 'dot1vProtocolPortGroupId$query': q(r, 'dot1vProtocolPortGroupId'), 'dot1vProtocolPortGroupVid$query': a.v, 'Proto_Port$endQuery': 'OK' }) },
      remove: { apply: r => c.formPost('API/protocol_port.htm', { 'dot1dBasePort$repeat?1': q(r, 'dot1dBasePort'), 'dot1vProtocolPortGroupId$repeat?1': q(r, 'dot1vProtocolPortGroupId'),
        'vlanPortModeState$repeat?1': '1', 'dot1vProtocolPortRowStatus$repeat?1': '6', 'Proto_Port$endRepeat?1': 'OK' }) } })];
  },
});
defSettings({
  id: 'pvlan', group: 'Switching', title: 'Private VLANs', icon: 'vlan', terms: 'private vlan pvlan primary isolated community promiscuous host',
  keys: [PVK.pv],
  intro: 'A primary VLAN with isolated VLANs: hosts reach the shared (promiscuous) ports but not each other.',
  render(c) {
    const r = swFormRows(c.get(PVK.pv), 'vlanPrivateVid$query'), q = (x, f) => x[f + '$query'];
    const prim = r.filter(x => q(x, 'vlanPrivateType') === '1').map(x => q(x, 'vlanPrivateVid'));
    return [c.table({ rows: r, key: x => 'VLAN ' + q(x, 'vlanPrivateVid'), empty: 'No private VLANs.', columns: [
      { label: 'VLAN', get: x => h('span', { class: 'bd sm', style: '--c:' + vcol.of(+q(x, 'vlanPrivateVid')) }, q(x, 'vlanPrivateVid')) },
      { label: 'Kind', get: x => q(x, 'vlanPrivateType') === '1' ? 'primary' : 'isolated' },
      { label: 'Primary', get: x => +q(x, 'vlanPrivatePrimaryVid') ? q(x, 'vlanPrivatePrimaryVid') : '—' }],
      add: { label: 'Add private VLAN', fields: [{ k: 'v', type: 'select', label: 'VLAN', options: c.m.vlans.filter(x => x.id > 1).map(x => String(x.id)) },
        { k: 't', type: 'seg', label: 'Kind', options: [['1', 'Primary'], ['2', 'Isolated']] },
        { k: 'p', type: 'select', label: 'Belongs to primary', options: [['', 'None yet'], ...prim], show: a => a.t === '2' && prim.length }], values: { t: '1', p: '' },
        apply: a => c.formPost('API/switch_private_vlan_a.htm', { 'vlanPrivateVid$add': a.v, 'vlanPrivateType$add': a.t, 'vlanPrivateStatus$add': '4', 'vlanPrivateVT$endAdd': 'OK',
          ...(a.t === '2' && a.p ? { 'vlanPrivateMapPrimaryVid$add': a.p, 'vlanPrivateMapSecondaryVid$add': a.v, 'vlanPrivateMapStatus$add': '4', 'privateMapVT$endAdd': 'OK' } : {}) }) },
      remove: { apply: x => c.formPost('API/switch_private_vlan.htm', { 'vlanPrivateVid$repeat?1': q(x, 'vlanPrivateVid'), 'vlanPrivateStatus$repeat?1': '6', 'vlanPrivateVT$endRepeat?1': 'OK' }) } }),
    c.note('Which ports are hosts or shared ports is still set in the classic UI (Private VLAN → membership).')];
  },
});

/* ================= Multicast ================= */
const MCK = { g: 'MulticastGlobalSetting', mgmt: 'MulticastMgmtList', ig: 'IGMPMLDSnoopVLANList&addrType=1', ml: 'IGMPMLDSnoopVLANList&addrType=2',
  mac: 'MulticastMacGroupList', ip: 'MulticastIPGroupList', macp: 'MulticastMacGroupPortList', ipp: 'MulticastIPGroupPortList', fwd: 'MulticastForwardAllList',
  unreg: 'form:API/igmp_member_unreg.htm', tv: 'form:API/bridg_multicast_TV_Map.htm' };
const FWD_MODE = [['1', 'By MAC group'], ['2', 'By IP group'], ['3', 'By source and IP group']];
defSettings({
  id: 'mcast', group: 'Switching', title: 'Multicast', icon: 'mcast', terms: 'multicast bridge filtering igmp mld snooping querier forwarding method',
  keys: [MCK.g, MCK.mgmt],
  intro: 'Without filtering, multicast (video streams, discovery) goes to every port like broadcast.',
  render(c) {
    const g = c.get(MCK.g) || {}, mg = rows(c.get(MCK.mgmt), 'MulticastMgmtEntry'), vids = [...new Set(mg.map(x => x.VID))];
    const modeOf = (vid, t) => (mg.find(x => x.VID === vid && x.addrType === t) || {}).adminMode;
    return [c.form({ values: { multicastFilterEnbl: g.multicastFilterEnbl, IGMPSnoopEnbl: g.IGMPSnoopEnbl, querierEnbl: g.querierEnbl, MLDSnoopEnbl: g.MLDSnoopEnbl, MLDQuerierEnbl: g.MLDQuerierEnbl },
      fields: [{ k: 'multicastFilterEnbl', type: 'toggle', label: 'Multicast filtering', help: 'Needed for snooping: send multicast only where it is wanted.' },
        { k: 'IGMPSnoopEnbl', type: 'toggle', label: 'IGMP snooping (IPv4)', help: 'Learn which ports joined which group. Also turn it on per VLAN.' },
        { k: 'querierEnbl', type: 'toggle', label: 'IGMP querier', help: 'Asks hosts what they want, when no router does.' },
        { k: 'MLDSnoopEnbl', type: 'toggle', label: 'MLD snooping (IPv6)' }, { k: 'MLDQuerierEnbl', type: 'toggle', label: 'MLD querier' }],
      apply: (ch, a) => c.post(MCK.g, { multicastFilterEnbl: a.multicastFilterEnbl, IGMPSnoopEnbl: a.IGMPSnoopEnbl, querierEnbl: a.querierEnbl, MLDSnoopEnbl: a.MLDSnoopEnbl, MLDQuerierEnbl: a.MLDQuerierEnbl }) }),
    c.table({ title: 'Forwarding method per VLAN', rows: vids, key: v => 'VLAN ' + v, columns: [
      { label: 'VLAN', get: v => h('span', { class: 'bd sm', style: '--c:' + vcol.of(+v) }, v) },
      { label: 'IPv4', get: v => (FWD_MODE.find(x => x[0] === modeOf(v, '1')) || [])[1] }, { label: 'IPv6', get: v => (FWD_MODE.find(x => x[0] === modeOf(v, '2')) || [])[1] }],
      edit: { fields: () => [{ k: 'v4', type: 'select', label: 'IPv4', options: FWD_MODE }, { k: 'v6', type: 'select', label: 'IPv6', options: FWD_MODE }],
        values: v => ({ v4: modeOf(v, '1'), v6: modeOf(v, '2') }),
        apply: (ch, a, v) => c.post(MCK.mgmt, { MulticastMgmtEntry: [{ VID: v, adminMode: a.v6, addrType: '2' }, { VID: v, adminMode: a.v4, addrType: '1' }] }) } })];
  },
});

function swSnoopTable(c, key, t) {
  const v6 = t === '2', ips = rows(c.get(K.ip)).map(x => x.IPAddr).filter(x => x && !/^0\./.test(x));
  return c.table({ title: v6 ? 'MLD snooping (IPv6) per VLAN' : 'IGMP snooping (IPv4) per VLAN', rows: rows(c.get(key), 'VLANEntry'), key: x => 'VLAN ' + x.VLANID, columns: [
    { label: 'VLAN', get: x => h('span', { class: 'bd sm', style: '--c:' + vcol.of(+x.VLANID) }, x.VLANID) },
    { label: 'Snooping', get: x => [h('span', { class: ['led', x.operSnoopEnbl === '1' && 'lg'] }), ' ', swOnOff(x.adminSnoopEnbl)] },
    { label: 'Querier', get: x => x.querierAdminEnable === '1' ? `on, v${x.querierAdminVersion}` : 'off' }, { label: 'Fast leave', get: x => swOnOff(x.immediateLeaveEnbl) },
    { label: 'Query every', num: true, get: x => x.queryIntervalAdmin + ' s' }],
    edit: { fields: () => [{ k: 'adminSnoopEnbl', type: 'toggle', label: 'Snooping on this VLAN' },
      { k: 'MRouterLearnEnbl', type: 'toggle', label: 'Learn router ports automatically' },
      { k: 'immediateLeaveEnbl', type: 'toggle', label: 'Fast leave', help: 'Stop a stream as soon as a port leaves; for ports with one receiver.' },
      { k: 'robustnessAdmin', type: 'number', label: 'Robustness', min: 1, max: 7, help: 'Default 2.', validate: v => +v >= 1 && +v <= 7 ? null : '1–7' },
      { k: 'queryIntervalAdmin', type: 'number', label: 'Query interval', unit: 's', min: 30, max: 18000, validate: v => +v >= 30 && +v <= 18000 ? null : '30–18000 s' },
      { k: 'queryMaxResponseTimeAdmin', type: 'number', label: 'Max response time', unit: 's', min: 5, max: 20, validate: v => +v >= 5 && +v <= 20 ? null : '5–20 s' },
      { k: 'lastMemberQueryIntervalAdmin', type: 'number', label: 'Last member query interval', unit: 'ms', min: 100, max: 25500, validate: v => +v >= 100 && +v <= 25500 ? null : '100–25500 ms' },
      { k: 'lastMemberQueryCountAdmin', type: 'number', label: 'Last member query count', min: 0, max: 7, help: '0 = same as robustness.', validate: v => +v >= 0 && +v <= 7 ? null : '0–7' },
      { k: 'querierAdminEnable', type: 'toggle', label: 'Querier on this VLAN' },
      { k: 'querierAdminVersion', type: 'seg', label: 'Querier version', options: v6 ? [['1', 'MLDv1'], ['2', 'MLDv2']] : [['2', 'IGMPv2'], ['3', 'IGMPv3']], show: a => a.querierAdminEnable === '1' },
      v6 ? { k: 'querierElectionEnbl', type: 'toggle', label: 'Querier election', show: a => a.querierAdminEnable === '1' }
        : { k: 'querierAdminIPAddress', type: 'select', label: 'Querier source address', options: ips, show: a => a.querierAdminEnable === '1' }],
      values: x => ({ ...x, querierAdminIPAddress: ips.includes(x.querierAdminIPAddress) ? x.querierAdminIPAddress : ips[0] || '' }),
      apply: (ch, a, x) => {
        const e = { addrType: t, VLANID: x.VLANID };
        for (const f of ['adminSnoopEnbl', 'MRouterLearnEnbl', 'immediateLeaveEnbl', 'robustnessAdmin', 'queryIntervalAdmin', 'queryMaxResponseTimeAdmin', 'lastMemberQueryIntervalAdmin', 'lastMemberQueryCountAdmin', 'querierAdminEnable']) e[f] = String(a[f]);
        if (!+e.lastMemberQueryCountAdmin) e.lastMemberQueryCountAdmin = e.robustnessAdmin;
        if (a.querierAdminEnable === '1') Object.assign(e, v6 ? { querierElectionEnbl: a.querierElectionEnbl, querierAdminVersion: a.querierAdminVersion } : { querierAdminIPAddress: a.querierAdminIPAddress, querierAdminVersion: a.querierAdminVersion });
        return c.post('IGMPMLDSnoopVLANList', { VLANEntry: e });
      } } });
}
defSettings({
  id: 'snoop', group: 'Switching', title: 'IGMP and MLD snooping', icon: 'mcast', terms: 'igmp mld snooping querier fast leave immediate leave robustness query interval mrouter',
  keys: [MCK.g, MCK.ig, MCK.ml, { key: K.ip, cls: 'config' }],
  render(c) {
    const g = c.get(MCK.g) || {};
    return [g.multicastFilterEnbl !== '1' || (g.IGMPSnoopEnbl !== '1' && g.MLDSnoopEnbl !== '1') ? c.note('Snooping works only with multicast filtering and snooping turned on for the switch (Multicast).') : null,
      swSnoopTable(c, MCK.ig, '1'), swSnoopTable(c, MCK.ml, '2')];
  },
});

const swIp2mac = ip => { const o = ip.split('.').map(Number); return ['01', '00', '5e', (o[1] & 127).toString(16), o[2].toString(16), o[3].toString(16)].map(x => x.padStart(2, '0')).join(':'); };
const swIsMcIp = v => /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.test(v) && +v.split('.')[0] >= 224 && +v.split('.')[0] <= 239 && v.split('.').every(x => +x <= 255);
const swIsMcMac = v => /^([0-9a-f]{2}[:-]){5}[0-9a-f]{2}$/i.test(v) && parseInt(v.slice(0, 2), 16) % 2 === 1;
/* static / forbidden port-list edit -> delete removed ports, then set the new full lists */
function swPlWrite(key, before, a) {
  const S0 = swPlParse(before.staticPortList).ports, F0 = swPlParse(before.forbdnPortList).ports, S1 = parseList(a.st.replace(/\s/g, '')), F1 = parseList(a.fb.replace(/\s/g, ''));
  const gone = (x, y) => new Set([...x].filter(n => !y.has(n)));
  const blocks = [], dS = gone(S0, S1), dF = gone(F0, F1);
  if (dS.size || dF.size) blocks.push({ action: 'delete', body: { ...key, staticPortList: swPlNames(dS), forbdnPortList: swPlNames(dF) } });
  blocks.push({ action: 'set', body: { ...key, staticPortList: swPlNames(S1), forbdnPortList: swPlNames(F1) } });
  return blocks;
}
const SW_PL_FIELDS = [{ k: 'st', label: 'Always send to ports (static)', placeholder: 'e.g. 3-4', validate: swPortSetOk },
  { k: 'fb', label: 'Never send to ports (forbidden)', placeholder: 'e.g. 9', validate: (v, a) => swPortSetOk(v) || ([...parseList(v)].some(n => parseList(a.st).has(n)) ? 'a port cannot be both' : null) }];
defSettings({
  id: 'mgroups', group: 'Switching', title: 'Multicast groups', icon: 'mcast', terms: 'multicast group static forward all forbidden mrouter unregistered tv vlan iptv',
  keys: [MCK.mac, MCK.ip, MCK.macp, MCK.ipp, MCK.fwd, MCK.tv],
  render(c) {
    const macp = rows(c.get(MCK.macp), 'GroupEntry'), ipp = rows(c.get(MCK.ipp), 'GroupEntry');
    const gk = x => `${x.VID}|${x.groupAddr}|${x.srcAddr || ''}`, seen = new Map();
    for (const x of [...rows(c.get(MCK.ip), 'GroupEntry'), ...ipp]) seen.set(gk(x), { ...seen.get(gk(x)), ...x, ip: true });
    for (const x of [...rows(c.get(MCK.mac), 'GroupEntry'), ...macp]) seen.set(gk(x), { ...seen.get(gk(x)), ...x });
    const all = [...seen.values()], tv = swFormRows(c.get(MCK.tv), 'rlIgmpSnoopMulticastTvVID$query');
    const macOf = x => x.ip ? (swIsMcIp(x.groupAddr) ? swIp2mac(x.groupAddr) : null) : x.groupAddr;
    const portsOf = x => macp.find(y => y.VID === x.VID && y.groupAddr === macOf(x)) || x;
    const groups = all.filter(x => x.ip || !all.some(y => y.ip && y.VID === x.VID && macOf(y) === x.groupAddr)); // a MAC row mirroring an IP group
    return [c.table({ title: 'Groups', help: 'Groups learned by snooping, and groups you add with fixed ports.', rows: groups, empty: 'No multicast groups.', key: x => x.groupAddr, columns: [
      { label: 'VLAN', get: x => h('span', { class: 'bd sm', style: '--c:' + vcol.of(+x.VID) }, x.VID) }, { label: 'Group', get: x => h('span', { class: 'mono' }, x.groupAddr) },
      { label: 'Source', get: x => x.srcAddr && !/^0\.0\.0\.0$|^::$/.test(x.srcAddr) ? x.srcAddr : 'any' },
      { label: 'Static', get: x => swPlText(portsOf(x).staticPortList) }, { label: 'Forbidden', get: x => swPlText(portsOf(x).forbdnPortList) }],
      add: { label: 'Add group', fields: [{ k: 'vid', type: 'select', label: 'VLAN', options: c.m.vlans.map(x => String(x.id)) },
        { k: 'g', label: 'Group (IPv4 or MAC)', placeholder: '239.1.1.1 or 01:00:5e:01:01:01', validate: v => swIsMcIp(v) || swIsMcMac(v) ? null : 'an IPv4 multicast address (224–239.x.x.x) or a multicast MAC' },
        { k: 'src', label: 'Source (optional)', placeholder: 'any', show: a => swIsMcIp(a.g), validate: v => !v || /^\d+\.\d+\.\d+\.\d+$/.test(v) ? null : 'an IPv4 address' }, ...SW_PL_FIELDS],
        values: { vid: '1', g: '', src: '', st: '', fb: '' },
        apply: a => {
          const pl = { staticPortList: swPlNames(parseList(a.st)), forbdnPortList: swPlNames(parseList(a.fb)) }, mac = swIsMcIp(a.g) ? swIp2mac(a.g) : a.g.replace(/-/g, ':').toLowerCase();
          return api.post([...(swIsMcIp(a.g) ? [{ section: MCK.ipp, action: 'set', body: { GroupEntry: { VID: a.vid, groupAddr: a.g, srcAddr: a.src || '0.0.0.0', ...pl } } }] : []),
            { section: MCK.macp, action: 'set', body: { GroupEntry: { VID: a.vid, groupAddr: mac, ...pl } } }], 'multicast group');
        } },
      edit: { fields: () => SW_PL_FIELDS, values: x => ({ st: fmtList(swPlParse(portsOf(x).staticPortList).ports), fb: fmtList(swPlParse(portsOf(x).forbdnPortList).ports) }),
        apply: (ch, a, x) => { const mac = macOf(x); if (!mac) throw new Error('IPv6 groups are edited in the classic UI.');
          return api.post(swPlWrite({ VID: x.VID, groupAddr: mac }, portsOf(x), a).map(b => ({ section: MCK.macp, action: b.action, body: { GroupEntry: b.body } })), 'multicast group'); } },
      remove: { apply: x => api.post([...(x.ip ? [{ section: MCK.ip, action: 'delete', body: { GroupEntry: { VID: x.VID, groupAddr: x.groupAddr, ...(x.srcAddr ? { srcAddr: x.srcAddr } : {}) } } }] : []),
        ...(macOf(x) ? [{ section: MCK.mac, action: 'delete', body: { GroupEntry: { VID: x.VID, groupAddr: macOf(x) } } }] : [])], 'multicast group') } }),
    c.table({ title: 'Forward all', help: 'Ports that get every multicast stream of a VLAN (e.g. towards a multicast router).', rows: rows(c.get(MCK.fwd), 'VLANEntry'), key: x => 'VLAN ' + x.VLANID, columns: [
      { label: 'VLAN', get: x => h('span', { class: 'bd sm', style: '--c:' + vcol.of(+x.VLANID) }, x.VLANID) }, { label: 'Static', get: x => swPlText(x.staticPortList) },
      { label: 'Forbidden', get: x => swPlText(x.forbdnPortList) }, { label: 'Learned', get: x => swPlText(x.dynamicPortList) }],
      edit: { fields: () => SW_PL_FIELDS, values: x => ({ st: fmtList(swPlParse(x.staticPortList).ports), fb: fmtList(swPlParse(x.forbdnPortList).ports) }),
        apply: (ch, a, x) => api.post(swPlWrite({ VLANID: x.VLANID }, x, a).map(b => ({ section: MCK.fwd, action: b.action, body: { VLANEntry: b.body } })), 'forward all') } }),
    c.table({ title: 'Multicast TV VLAN', help: 'Streams of these groups are delivered on the TV VLAN to access ports in other VLANs.', rows: tv, empty: 'No TV groups.',
      key: r => r['rlIgmpSnoopMulticastTvGroup$query'], columns: [{ label: 'TV VLAN', get: r => h('span', { class: 'bd sm', style: '--c:' + vcol.of(+r['rlIgmpSnoopMulticastTvVID$query']) }, r['rlIgmpSnoopMulticastTvVID$query']) },
        { label: 'Group', get: r => r['rlIgmpSnoopMulticastTvGroup$query'] }],
      add: { label: 'Add TV group', fields: [{ k: 'v', type: 'select', label: 'TV VLAN', options: c.m.vlans.map(x => String(x.id)) },
        { k: 'g', label: 'Group', placeholder: '239.1.1.1', validate: v => swIsMcIp(v) ? null : 'an IPv4 multicast address' }], values: { v: '1', g: '' },
        apply: a => c.formPost('API/bridg_multicast_TV_Map_a.htm', { 'rlIgmpSnoopMulticastTvVID$add': a.v, 'rlIgmpSnoopMulticastTvGroup$add': a.g, 'rlIgmpSnoopMulticastTvStatus$add': '4', 'T1$endAdd': 'OK' }) },
      remove: { apply: r => c.formPost('API/bridg_multicast_TV_Map.htm', { 'rlIgmpSnoopMulticastTvVID$repeat?1': r['rlIgmpSnoopMulticastTvVID$query'], 'rlIgmpSnoopMulticastTvGroup$repeat?1': r['rlIgmpSnoopMulticastTvGroup$query'],
        'rlIgmpSnoopMulticastTvStatus$repeat?1': '6', 'T1$endRepeat?1': 'OK' }) } }),
    c.note('Unregistered multicast (streams nobody joined) is set per port in the port inspector.')];
  },
});

/* unregistered multicast: one hex bitmap for all ports (MSB first, bit ifIndex-1 = 1 means filter); read fresh, flip, write whole */
const swUnregBit = (hex, n) => (parseInt(hex[(n - 1) >> 2] || '0', 16) >> (3 - (n - 1) % 4)) & 1;
SW.forms['API/igmp_member_unreg.htm'] = async (entries, label) => {
  const v = await api.form('API/igmp_member_unreg.htm', PRIO.USER), f = 'rlMacMulticastUnregFilterEnable$scalar', hex = (v[f] || '').split('');
  for (const e of entries) {
    const n = +e.port, i = (n - 1) >> 2, m = 8 >> ((n - 1) % 4);
    while (hex.length <= i) hex.push('0');
    hex[i] = ((parseInt(hex[i], 16) & ~m) | (e.unreg === '1' ? m : 0)).toString(16).toUpperCase();
  }
  if (hex.length % 2) hex.push('0');
  await api.formPost('API/igmp_member_unreg.htm', { [f]: hex.join('').toUpperCase() }, label);
};
defPortGroup({
  id: 'mcast', title: 'Multicast', icon: 'mcast', order: 70, keys: [MCK.unreg],
  summary(ports, c) { const s = [...new Set(ports.map(p => swUnregBit(fv(MCK.unreg, 'rlMacMulticastUnregFilterEnable$scalar') || '', p.no)))]; return s.length > 1 ? 'mixed' : s[0] ? 'unregistered: dropped' : ''; },
  body(ports, c) {
    const key = swAlias('unreg', MCK.unreg, v => c.m.ports.map(p => ({ port: String(p.no), unreg: String(swUnregBit(v['rlMacMulticastUnregFilterEnable$scalar'] || '', p.no)) })));
    return [swCtls(ports, c, { key, section: 'form:API/igmp_member_unreg.htm', wrap: 'unreg', keyField: 'port', keyValue: p => String(p.no) }, [
      { k: 'unreg', type: 'select', label: 'Streams nobody joined (unregistered)', t: 'unregistered multicast', options: [['0', 'Forward'], ['1', 'Drop (filter)']] }]),
    h('div', { class: 'acts' }, h('button', { class: 'btn sm', type: 'button', onclick: () => c.settings('mgroups') }, 'Groups and forward-all…'))];
  },
});
}
