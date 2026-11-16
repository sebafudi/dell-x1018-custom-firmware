/* ---------- Switching: per-port features (storm control, port security, protected ports, energy saving, UDLD,
 * proprietary protocol filtering) and the MAC address table. Uses the helpers from 76-sw-protocols.js. ---------- */
{ // block scope; shared helpers come from 76-sw-protocols.js via api.sw
const SW = api.sw, { alias: swAlias, formRows: swFormRows, ctls: swCtls, bit: swBit, onOff: swOnOff, portOpts: swPortOpts } = SW;
const PFK = {
  storm: data.def('form:API/port_parameters_table.htm', 'config', { prefetch: false }),
  psec: data.def('form:API/port_security_table.htm', 'config', { prefetch: false }),  // ~68 KB
  pfilt: data.def('form:API/proprietary_protocol_filterring.htm', 'config', { prefetch: false }),
  stat: 'form:API/address_static_table.htm',
};
const swFormPg = (name, key, idf) => swAlias(name, key, v => swFormRows(v, idf));

/* ================= Storm control (form page, one edit per port) ================= */
defPortGroup({
  id: 'storm', title: 'Storm control', icon: 'traffic', order: 72, keys: [{ key: PFK.storm, cls: 'config', prefetch: false }],
  summary(ports) {
    const k = swFormPg('storm', PFK.storm, 'dot1dBasePort$query'), rs = ports.map(p => rowOf(k, p, 'dot1dBasePort$query')).filter(Boolean);
    const on = rs.filter(r => r['rlStormCtrlBroadcastEnable$query'] === '1');
    return !rs.length ? '' : rs.length > 1 ? (on.length ? `${on.length} limited` : 'off') : on.length ? `${+on[0]['rlStormCtrlBroadcastRate$query'] / 1000} Mbit/s` : 'off';
  },
  body: (ports, c) => [swCtls(ports, c, { key: swFormPg('storm', PFK.storm, 'dot1dBasePort$query'), section: 'form:API/port_parameters_table_e.htm', wrap: 'stormCtrlTable',
    keyField: 'dot1dBasePort$query', keyValue: p => String(p.no) }, [
    { k: 'rlStormCtrlBroadcastEnable$query', type: 'toggle', label: 'Storm control', t: 'storm control', help: 'Caps broadcast floods, e.g. from a loop or a faulty device.' },
    { k: 'rlStormCtrlMulticastEnable$query', type: 'select', label: 'Applies to', t: 'storm control for', options: [['2', 'Broadcast'], ['1', 'Broadcast and multicast']] },
    { k: 'rlStormCtrlBroadcastRate$query', type: 'number', label: 'Limit', t: 'storm limit', unit: 'kbit/s', min: 3500, max: 1000000 }]),
  c.note('Limit 3500–1000000 kbit/s on gigabit ports.')],
});

/* ================= Port security (form page) ================= */
const PSEC_F = ['swIfLockAdminStatus$query', 'swIfAdminLockTrapEnable$query'];
defPortGroup({
  id: 'psec', title: 'Port security', icon: 'lock', order: 74, keys: [{ key: PFK.psec, cls: 'config', prefetch: false }],
  summary(ports) {
    const k = swFormPg('psec', PFK.psec, 'swIfIndex$query'), rs = ports.map(p => rowOf(k, p, 'swIfIndex$query')).filter(Boolean);
    if (rs.length !== 1) return rs.length ? `${rs.filter(r => r[PSEC_F[0]] === '1').length} locked` : '';
    const r = rs[0];
    return r[PSEC_F[0]] !== '1' ? 'off' : r['swIfLockLimitationMode$query'] === '2' ? `max ${r['swIfLockMaxMacAddresses$query']} address${r['swIfLockMaxMacAddresses$query'] === '1' ? '' : 'es'}` : 'locked';
  },
  body(ports, c) {
    const key = swFormPg('psec', PFK.psec, 'swIfIndex$query'), one = ports.length === 1 ? rowOf(key, ports[0], 'swIfIndex$query') : null;
    return [one ? c.kv([['Now', one['swIfLockOperStatus$query'] === '1' ? 'locked' : 'open']]) : null,
      one && one['swIfHostMode$query'] === '1' ? c.note('802.1X single-host mode is on here: lock, action and trap cannot be changed.') : null,
      c.note('Set learning and the maximum first, apply, then lock the port.'),
      swCtls(ports, c, { key, section: 'form:API/port_security_table_e.htm', wrap: 'swIfVT', keyField: 'swIfIndex$query', keyValue: p => String(p.no),
        extra: p => { const r = rowOf(key, p, 'swIfIndex$query') || {}; return Object.fromEntries(PSEC_F.map(f => [f, r[f] || '2'])); } }, [
        { k: PSEC_F[0], type: 'toggle', label: 'Lock the port (port security)', t: 'port security', help: 'Only known devices may use the port.' },
        { k: 'swIfLockLimitationMode$query', type: 'select', label: 'Allowed devices', t: 'port security learning', options: [['1', 'Those seen so far (classic lock)'], ['2', 'Up to a maximum (limited dynamic)']] },
        { k: 'swIfLockMaxMacAddresses$query', type: 'number', label: 'Max addresses', t: 'max addresses', min: 0, max: 256 },
        { k: 'swIfAdminLockAction$query', type: 'select', label: 'Unknown device', t: 'on violation', options: [['1', 'Drop its traffic'], ['2', 'Forward it (just learn nothing)'], ['3', 'Shut the port down']] },
        { k: PSEC_F[1], type: 'toggle', label: 'Send an SNMP trap', t: 'port security trap' },
        { k: 'swIfLockAdminTrapFrequency$query', type: 'number', label: 'At most one trap every', t: 'trap interval', unit: 's', min: 1, max: 1000000 }])];
  },
});

/* ================= Protected ports ================= */
const PPK = 'ProtectedPortList&interfaceType=1';
defPortGroup({
  id: 'prot', title: 'Protected port', icon: 'shield', order: 76, keys: [PPK],
  summary(ports) {
    const rs = ports.map(p => rowOf(PPK, p)).filter(Boolean);
    if (rs.length > 1) { const n = rs.filter(r => r.type === '2').length; return n ? `${n} protected` : 'not protected'; }
    const r = rs[0]; return !r ? '' : r.type !== '2' ? 'not protected' : +r.community ? `protected, group ${r.community}` : 'protected';
  },
  body: (ports, c) => [swCtls(ports, c, { key: PPK, section: 'ProtectedPortList', wrap: 'IfEntry',
    extra: p => { const r = rowOf(PPK, p) || {}; return { interfaceID: String(p.no), interfaceType: '1', type: r.type || '1', community: r.community || '0' }; } }, [
    { k: 'type', type: 'toggle', on: '2', off: '1', label: 'Protected', t: 'protected port', help: 'Protected ports cannot talk to each other, only to unprotected ports (the uplink).' },
    { k: 'community', type: 'select', label: 'Community', t: 'community', help: 'Protected ports in the same community can talk to each other.',
      options: [['0', 'None (isolated)'], ...Array.from({ length: 30 }, (_, i) => String(i + 1))] }])],
});

/* ================= Energy saving (Green Ethernet / EEE) ================= */
const GEK = { g: 'GreenEthGlobalSetting', eee: 'EEEGlobalSetting', pe: 'EEEInterfaceList', pl: 'EEELLDPInterfaceList', st: 'GreenEthSavingTypeList' };
const GE_REASON = { 1: 'not present', 2: 'link type', 3: 'link up', 4: 'link speed', 5: 'cable length', 6: 'errors detected', 7: 'link down' };
defSettings({
  id: 'green', group: 'Switching', title: 'Energy saving', icon: 'leaf', terms: 'green ethernet eee energy efficient 802.3az energy detect short reach power',
  keys: [GEK.g, GEK.eee],
  render(c) {
    const g = c.get(GEK.g) || {}, e = c.get(GEK.eee) || {}, w = v => (Math.round(+v / 10) / 100) + ' W';
    return [c.form({ values: { EEEEnable: e.EEEEnable, nrgDetectEnbl: g.nrgDetectEnbl, shrtReachEnbl: g.shrtReachEnbl },
      fields: [{ k: 'EEEEnable', type: 'toggle', label: 'Energy Efficient Ethernet (EEE)', help: 'Idle links sleep between packets. Both ends must support it.' },
        g.nrgDetectEnbl != null ? { k: 'nrgDetectEnbl', type: 'toggle', label: 'Energy detect', help: 'Ports without a cable connected draw less power.' } : null,
        { k: 'shrtReachEnbl', type: 'toggle', label: 'Short reach', help: 'Lower power on short cables.' }].filter(Boolean),
      apply: ch => api.post([...('EEEEnable' in ch ? [{ section: GEK.eee, action: 'set', body: { EEEEnable: ch.EEEEnable } }] : []),
        ...('nrgDetectEnbl' in ch || 'shrtReachEnbl' in ch ? [{ section: GEK.g, action: 'set', body: Object.fromEntries(Object.entries(ch).filter(([k]) => k !== 'EEEEnable')) }] : [])], 'energy saving') }),
    c.kv([['Power now', g.currPwrConsumption ? w(g.currPwrConsumption) : ''], ['Maximum', g.maxPwrConsumption ? w(g.maxPwrConsumption) : ''],
      ['Saving', g.nrgDetectEnbl === '1' && +g.maxPwrConsumption ? Math.round(100 - g.currPwrConsumption / g.maxPwrConsumption * 100) + ' %' : '0 %'],
      ['Energy used', g.cumulativeNrg != null ? g.cumulativeNrg + ' Wh' : '']]),
    h('div', { class: 'acts' }, h('button', { class: 'btn', type: 'button', onclick: async ev => {
      if (!await confirmBox('Reset the energy counter?', ['The cumulative energy count starts again from zero.'], 'Reset', false)) return;
      await act(ev.currentTarget, () => c.post(GEK.g, { cumulativeNrg: null }, 'restore'), 'Counter reset.').catch(() => {}); setTimeout(c.refresh, 1200);
    } }, 'Reset energy counter')), c.note('Per-port settings are in the port inspector.')];
  },
});
const swGeRows = t => swAlias('ge' + t, GEK.st, v => rows(v).filter(r => r.savingType === t));
defPortGroup({
  id: 'green', title: 'Energy saving', icon: 'leaf', order: 78, keys: [GEK.pe, GEK.pl, GEK.st],
  summary: ports => { const s = [...new Set(ports.map(p => (rowOf(GEK.pe, p) || {}).EEEAdminStatus))]; return s.length > 1 ? 'mixed' : s[0] ? 'EEE ' + swOnOff(s[0]) : ''; },
  body(ports, c) {
    const one = ports.length === 1 ? ports[0] : null, e = one && rowOf(GEK.pe, one), ed = one && rowOf(swGeRows('1'), one), sr = one && rowOf(swGeRows('2'), one);
    const st = r => r ? (r.operState === '1' ? 'active' : 'inactive') + (GE_REASON[r.reason] && r.operState !== '1' ? ` (${GE_REASON[r.reason]})` : '') : '';
    const ge = t => ({ key: swGeRows(t), section: 'GreenEthSavingTypeList#' + t, extra: () => ({ savingType: t }) });
    return [one ? c.kv([['EEE now', e ? `${e.EEEOperStatus === '1' ? 'active' : 'inactive'}${e.EEERemoteStatus === '1' ? ', other end supports it' : ''}` : ''],
      ['Energy detect now', st(ed)], ['Short reach now', st(sr)]]) : null,
    swCtls(ports, c, { key: GEK.pe, section: GEK.pe }, [{ k: 'EEEAdminStatus', type: 'toggle', label: 'Energy Efficient Ethernet (EEE)', t: 'EEE', help: 'Not together with back pressure.' }]),
    swCtls(ports, c, { key: GEK.pl, section: GEK.pl }, [{ k: 'EEELLDPAdminStatus', type: 'toggle', label: 'Announce EEE over LLDP', t: 'EEE over LLDP' }]),
    swCtls(ports, c, ge('1'), [{ k: 'adminState', type: 'toggle', label: 'Energy detect', t: 'energy detect' }]),
    swCtls(ports, c, ge('2'), [{ k: 'adminState', type: 'toggle', label: 'Short reach', t: 'short reach' }])];
  },
});

/* ================= UDLD ================= */
const UDK = { g: 'UDLDGlobalSetting', p: 'UDLDInterfaceSettingList', n: 'UDLDNeighborList' };
const UD_MODE = { 1: 'normal', 2: 'aggressive', 3: 'off', 4: 'default' };
const UD_BIDI = { 1: 'shut down', 2: 'idle', 3: 'detecting', 4: 'undetermined', 5: 'two-way' };
defSettings({
  id: 'udld', group: 'Switching', title: 'UDLD (one-way link detection)', icon: 'cable', terms: 'udld unidirectional link detection fiber aggressive normal message time neighbors',
  keys: [UDK.g, UDK.n],
  intro: 'UDLD notices when a link only works in one direction (typically a broken fibre) and shuts the port.',
  render(c) {
    const g = c.get(UDK.g) || {};
    return [c.form({ values: { UDLDState: g.UDLDState, messageTime: g.messageTime },
      fields: [{ k: 'UDLDState', type: 'select', label: 'Fibre ports by default', options: [['3', 'Off'], ['1', 'Normal (shut on one-way link)'], ['2', 'Aggressive (also when unsure)']] },
        { k: 'messageTime', type: 'number', label: 'Message interval', unit: 's', min: 1, max: 90, help: 'Default 15. Neighbours expire after 3×.', validate: v => +v >= 1 && +v <= 90 ? null : '1–90 s' }],
      apply: (ch, a) => c.post(UDK.g, { messageTime: String(a.messageTime), UDLDState: a.UDLDState }) }),
    c.table({ title: 'Neighbours', rows: rows(c.get(UDK.n)), empty: 'No UDLD neighbours.', columns: [{ label: 'Port', get: x => portNo(x.interfaceName) || x.interfaceName },
      { label: 'Device', get: x => x.deviceName || x.deviceMAC }, { label: 'Their port', get: x => x.portName },
      { label: 'State', get: x => ({ 1: 'disabled', 2: 'enabled', 3: 'undefined', 4: 'two-way' }[x.neighborCurrentState]) }, { label: 'Expires', num: true, get: x => x.expirationTime + ' s' }] }),
    c.note('A port shut down by UDLD comes back with “Re-activate” in its port settings.')];
  },
});
defPortGroup({
  id: 'udld', title: 'UDLD', icon: 'cable', order: 82, keys: [UDK.p],
  summary: ports => { const s = [...new Set(ports.map(p => (rowOf(UDK.p, p) || {}).UDLDOperState))]; return s.length > 1 ? 'mixed' : UD_MODE[s[0]] || ''; },
  body(ports, c) {
    const r = ports.length === 1 ? rowOf(UDK.p, ports[0]) : null;
    return [r ? c.kv([['Now', `${UD_MODE[r.UDLDOperState] || '—'}, link ${UD_BIDI[r.bidirectionalState] || '—'}`], ['Neighbours', r.numberOfNeighbors]]) : null,
      swCtls(ports, c, { key: UDK.p, section: UDK.p }, [{ k: 'UDLDState', type: 'select', label: 'UDLD', t: 'UDLD', help: 'Default: the switch setting on fibre ports, off on copper.',
        options: [['4', 'Default'], ['1', 'Normal'], ['2', 'Aggressive'], ['3', 'Off']] }])];
  },
});

/* ================= Proprietary protocol filtering (form page; rows are created / destroyed) ================= */
const PF_BITS = [[0, 'All of them'], [1, 'CDP'], [2, 'VTP'], [3, 'DTP'], [4, 'UDLD'], [5, 'PAgP'], [6, 'SSTP']];
SW.forms['API/proprietary_protocol_filterring_e.htm'] = async (entries, label) => {
  const path = 'API/proprietary_protocol_filterring_e.htm';
  for (const e of entries) {
    const bits = e['rlProtocolFilteringList$query'].padEnd(8, '0'), idx = e['ifIndex$query'], any = bits.includes('1'), had = e.exists === '1';
    const add = { 'ifIndex$add': idx, 'rlProtocolFilteringList$add': bits, 'rlProtocolFilteringRowStatus$add': '4', 'protocolFilterVTable$endAdd': 'OK' };
    const del = { 'ifIndex$query': idx, 'rlProtocolFilteringRowStatus$query': '6', 'protocolFilterVTable$endQuery': 'OK' };
    if (had || any) await api.formPost(path, had ? { ...del, ...(any ? add : {}) } : add, label);
  }
};
defPortGroup({
  id: 'pfilt', title: 'Protocol filtering', icon: 'shield', order: 84, keys: [{ key: PFK.pfilt, cls: 'config', prefetch: false }],
  summary(ports) {
    const k = swFormPg('pfilt', PFK.pfilt, 'ifIndex$query'), b = ports.map(p => (rowOf(k, p, 'ifIndex$query') || {})['rlProtocolFilteringList$query'] || '');
    return b.some(x => x.includes('1')) ? (ports.length > 1 ? 'some blocked' : b[0][0] === '1' ? 'all blocked' : PF_BITS.filter(([i]) => b[0][i] === '1').map(x => x[1]).join(', ') + ' blocked') : 'none';
  },
  body(ports, c) {
    const key = swFormPg('pfilt', PFK.pfilt, 'ifIndex$query');
    const spec = { key, keyField: 'ifIndex$query', keyValue: p => String(p.no), section: 'form:API/proprietary_protocol_filterring_e.htm', wrap: 'protocolFilterVTable',
      extra: p => ({ exists: (rowOf(key, p, 'ifIndex$query') || {})['rlProtocolFilteringRowStatus$query'] ? '1' : '0' }),
      text: (k, v) => { const l = PF_BITS.filter(([i]) => v[i] === '1').map(x => x[1]); return l.length ? `blocks ${l.join(', ')}` : 'blocks no vendor protocols'; } };
    return [c.note('Drop Cisco-style protocol frames arriving on this port.'), PF_BITS.map(([i, l]) => swBit(ports, spec, 'rlProtocolFilteringList$query', i, l, 8))];
  },
});

/* ================= MAC address table ================= */
const SW_MAC_TYPE = { 1: 'secure', 2: 'invalid', 3: 'learned', 4: 'this switch', 5: 'static', 6: 'learned (kept)' };
const SW_STAT_KIND = [['3', 'Permanent'], ['4', 'Until restart'], ['5', 'Until it ages out'], ['1', 'Secure (locked port)']];
const swMacFmt = s => (String(s).replace(/[^0-9a-f]/gi, '').toLowerCase().match(/../g) || []).join(':');
let swMacFilter = '';
defSettings({
  id: 'mac', group: 'Switching', title: 'MAC address table', icon: 'list', terms: 'mac address table fdb forwarding database aging static dynamic clear learned',
  keys: ['ForwardingGlobalSetting', { key: K.fdb, cls: 'live' }, PFK.stat, { key: K.arp, cls: 'live' }],
  intro: 'Which device (MAC address) the switch reaches through which port. The Devices view shows the same table with names.',
  render(c) {
    const stat = swFormRows(c.get(PFK.stat), 'dot1qStaticUnicastAddress$query'), q = (r, f) => r[f + '$query'];
    const portName = i => +i < 1000 ? 'Port ' + i : 'LAG ' + (+i - 999);
    const fdb = rows(c.get(K.fdb)), arp = new Map(rows(c.get(K.arp)).map(a => [String(a.physicalAddress).toLowerCase(), a.IPAddress]));
    const list = h('div');
    const drawList = () => {
      const f = swMacFilter.trim().toLowerCase(), hit = fdb.filter(x => !f || [x.MACAddress, x.interfaceName, 'port ' + portNo(x.interfaceName), 'vlan ' + x.VLANID, arp.get(String(x.MACAddress).toLowerCase())].some(v => String(v || '').toLowerCase().includes(f)));
      list.replaceChildren(c.table({ rows: hit.slice(0, 300), empty: f ? 'Nothing matches.' : 'The table is empty.', columns: [
        { label: 'VLAN', get: x => +x.VLANID >= 4096 ? 'internal' : h('span', { class: 'bd sm', style: '--c:' + vcol.of(+x.VLANID) }, x.VLANID) },
        { label: 'MAC address', get: x => h('span', { class: 'mono' }, x.MACAddress) }, { label: 'IP', get: x => arp.get(String(x.MACAddress).toLowerCase()) || '' },
        { label: 'Port', get: x => /^gi/.test(x.interfaceName) ? portNo(x.interfaceName) : x.interfaceName === 'none' ? '—' : x.interfaceName },
        { label: 'Kind', get: x => SW_MAC_TYPE[x.addressType] || x.addressType }] }), hit.length > 300 ? c.note(`First 300 of ${hit.length}.`) : null);
    };
    drawList();
    return [c.form({ values: { agingInterval: (c.get('ForwardingGlobalSetting') || {}).agingInterval },
      fields: [{ k: 'agingInterval', type: 'number', label: 'Forget silent devices after', unit: 's', min: 10, max: 630, help: 'Default 300.', validate: v => +v >= 10 && +v <= 630 ? null : '10–630 s' }],
      apply: (ch, a) => c.post('ForwardingGlobalSetting', { agingInterval: String(a.agingInterval) }) }),
    c.table({ title: 'Static entries', rows: stat, empty: 'No static entries.', key: r => swMacFmt(q(r, 'dot1qStaticUnicastAddress')), columns: [
      { label: 'MAC address', get: r => h('span', { class: 'mono' }, swMacFmt(q(r, 'dot1qStaticUnicastAddress'))) },
      { label: 'VLAN', get: r => +q(r, 'dot1qFdbId') >= 4096 ? 'routed' : h('span', { class: 'bd sm', style: '--c:' + vcol.of(+q(r, 'dot1qFdbId')) }, q(r, 'dot1qFdbId')) },
      { label: 'Port', get: r => portName(q(r, 'dot1qStaticUnicastReceivePort')) }, { label: 'Kept', get: r => (SW_STAT_KIND.find(k => k[0] === q(r, 'dot1qStaticUnicastStatus')) || [])[1] || '' }],
      add: { label: 'Add static entry', fields: [{ k: 'mac', label: 'MAC address', placeholder: 'aa:bb:cc:dd:ee:ff',
        validate: v => /^([0-9a-f]{2}[:-]?){5}[0-9a-f]{2}$/i.test(v) && !(parseInt(v.slice(0, 2), 16) & 1) ? null : 'a unicast MAC address' },
      { k: 'vid', type: 'select', label: 'VLAN', options: c.m.vlans.map(x => String(x.id)) },
      { k: 'port', type: 'select', label: 'Port', options: [...swPortOpts(c.m), ...Array.from({ length: 12 }, (_, i) => [String(1000 + i), 'LAG ' + (i + 1)])] },
      { k: 'st', type: 'select', label: 'Kept', options: SW_STAT_KIND }], values: { mac: '', vid: '1', port: '2', st: '3' },
        apply: a => c.formPost('API/address_static_table_a.htm', { 'dot1qStaticUnicastReceivePort$add': a.port, 'dot1qStaticUnicastAddress$add': swMacFmt(a.mac).toUpperCase(),
          'dot1qFdbId$add': a.vid, 'dot1qStaticUnicastStatus$add': a.st, 'AddressStaticVT$endAdd': 'OK' }) },
      remove: { apply: r => c.formPost('API/address_static_table.htm', { 'dot1qStaticUnicastAddress$repeat?1': q(r, 'dot1qStaticUnicastAddress'), 'dot1qFdbId$repeat?1': q(r, 'dot1qFdbId'),
        'dot1qStaticUnicastReceivePort$repeat?1': q(r, 'dot1qStaticUnicastReceivePort'), 'dot1qStaticUnicastStatus$repeat?1': '2', 'AddressStaticVT$endRepeat?1': 'OK' }) } }),
    c.block(`All entries (${fdb.length})`, h('div', { class: 'fl' }, h('input', { type: 'text', value: swMacFilter, placeholder: 'Filter by MAC, IP, “port 3”, “vlan 10”', 'aria-label': 'Filter',
      oninput: e => { swMacFilter = e.target.value; drawList(); } })), list,
    h('div', { class: 'acts' }, h('button', { class: 'btn', type: 'button', onclick: async e => {
      if (!await confirmBox('Clear learned addresses?', ['Every learned (dynamic) entry is removed. Traffic floods briefly until devices are learned again.'], 'Clear', false)) return;
      await act(e.currentTarget, () => c.post('ForwardingTable', { Entry: '' }, 'deleteAll'), 'Cleared.').catch(() => {}); setTimeout(c.refresh, 1200);
    } }, 'Clear learned addresses')))];
  },
});
}
