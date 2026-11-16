/* ---------- Port sign-in (802.1X), DHCP snooping, ARP inspection, diagnostics and statistics ----------
 * Reuses the helpers 78-traffic.js exports on pending.lx (form rows, local pending ops for form-page port settings). */
{
const { fk, kd, frows, fs, formRaw, fpost, ifx, ifName, macFmt, getBit, setBit, rng, numIn, chipList, lctl, lval, LPF, qrow } = pending.lx;
const ipOk = s => /^(\d{1,3})(\.\d{1,3}){3}$/.test(s) && s.split('.').every(x => +x < 256);
const macOk = s => /^([0-9a-f]{2}[:-]){5}[0-9a-f]{2}$/i.test(String(s).trim());
const portOpts = () => rng(1, 18).map(i => [String(i), 'Port ' + i]);
const vlanOpts = c => c.m.vlans.map(v => [String(v.id), `${v.id}${v.name ? ' · ' + v.name : ''}`]);
const pct = (a, b) => b > 0 ? Math.round(a / b * 100) + ' %' : '—';

/* ---------- 802.1X ---------- */
const D = { glob: kd(fk('authen_global_param.htm')), tab: kd(fk('authen_table.htm')), host: kd(fk('advanced_authen_table.htm')),
  users: kd(fk('users_table.htm'), 'live'), eap: kd('EAPStatisticsList&interfaceType=1', 'live'), vlans: { key: K.vlans, cls: 'config' } };
const CTRL = { 3: 'always allowed', 2: 'sign-in required', 1: 'always blocked' };
const PMETH = { 1: '802.1X', 2: '802.1X or MAC', 3: 'MAC only' };
const HMODE = { 1: 'one device', 2: 'many devices, one sign-in', 3: 'each device signs in' };
const PAE = { 1: 'initializing', 2: 'disconnected', 3: 'connecting', 4: 'authenticating', 5: 'authenticated', 6: 'aborting', 7: 'held', 8: 'force authorized', 9: 'force unauthorized' };
const d1row = p => frows(D.tab.key, 'dot1xPaePortNumber').find(r => r.dot1xPaePortNumber === String(ifx(p))) || {};
const D1X = ['dot1xPaePortNumber', 'dot1xAuthAuthControlledPortStatus', 'rldot1xAuthenticationPortMethod', 'rldot1xRadiusAttrVlanIdEnabled', 'rldot1xRadiusAttAclNameEnabled',
  'dot1xAuthReAuthEnabled', 'dot1xAuthReAuthPeriod', 'dot1xPaePortReauthenticate', 'dot1xAuthServerTimeout', 'dot1xAuthTxPeriod', 'dot1xAuthQuietPeriod', 'dot1xAuthSuppTimeout', 'dot1xAuthMaxReq'];
const D1R = { dot1xAuthReAuthPeriod: [300, 4294967295], dot1xAuthServerTimeout: [1, 65535], dot1xAuthTxPeriod: [30, 65535], dot1xAuthQuietPeriod: [10, 65535], dot1xAuthSuppTimeout: [1, 65535], dot1xAuthMaxReq: [1, 10] };
const onoff = v => v === '1' ? 'on' : 'off';
const DX = { id: 'dot1x', live: (p, k) => k === 'guest' ? (getBit(fs(D.tab.key, 'rldot1xGuestVlanPorts'), ifx(p)) ? '1' : '2') : d1row(p)[k], text: (k, v) => ({
  dot1xAuthAuthControlledPortControl: '802.1X: ' + CTRL[v], rldot1xAuthenticationPortMethod: 'sign-in by ' + PMETH[v], guest: 'guest VLAN ' + onoff(v),
  dot1xAuthReAuthEnabled: 'periodic re-sign-in ' + onoff(v), dot1xAuthReAuthPeriod: `re-sign-in every ${v} s`, rldot1xRadiusAttrVlanIdEnabled: 'VLAN from RADIUS ' + onoff(v),
  rldot1xRadiusAttAclNameEnabled: 'ACL from RADIUS ' + onoff(v), dot1xAuthQuietPeriod: `quiet period ${v} s`, dot1xAuthTxPeriod: `EAP request every ${v} s`,
  dot1xAuthSuppTimeout: `supplicant timeout ${v} s`, dot1xAuthServerTimeout: `server timeout ${v} s`, dot1xAuthMaxReq: `max ${v} EAP requests` })[k] || `${k} ${v}` };
LPF.dot1x = { label: '802.1X', run: async (p, f) => {
  const i = String(ifx(p)), row = d1row(p), q = `API/authen_table_e.htm?Query:dot1xPaePortNumber=${i}`;
  for (const [k, [lo, hi]] of Object.entries(D1R)) if (k in f && numIn(lo, hi)(f[k])) throw new Error(`802.1X ${DX.text(k, f[k])}: allowed ${lo}–${hi}`);
  if (('rldot1xAuthenticationPortMethod' in f || 'rldot1xRadiusAttrVlanIdEnabled' in f) && row.dot1xAuthAuthControlledPortControl !== '3')
    throw new Error(`Port ${i}: set it to “always allowed” and apply first, then change the sign-in method or RADIUS VLAN.`);
  if (['2', '3'].includes(f.rldot1xAuthenticationPortMethod) && (f.dot1xAuthReAuthEnabled ?? row.dot1xAuthReAuthEnabled) !== '1')
    throw new Error(`Port ${i}: MAC sign-in needs periodic re-sign-in turned on.`);
  const e = await formRaw(q), out = {};
  for (const n of D1X) out[n + '$query'] = f[n] ?? e[n + '$query'] ?? row[n] ?? '';
  out['dot1xAuthAuthControlledPortControl$query'] = f.dot1xAuthAuthControlledPortControl ?? e['dot1xAuthAuthControlledPortControl$query'] ?? row.dot1xAuthAuthControlledPortControl;
  out['dot1xAuthReAuthEnabled$select'] = out['dot1xAuthReAuthEnabled$query'];
  out['securityPortAuthTable$endQuery'] = 'OK';
  const bm = e['rldot1xGuestVlanPorts$scalar'] ?? fs(D.tab.key, 'rldot1xGuestVlanPorts') ?? '';
  out['rldot1xGuestVlanPorts$scalar'] = 'guest' in f ? setBit(bm, +i, f.guest === '1') : bm;
  if (!out['dot1xAuthAuthControlledPortControl$query']) throw new SwitchError('Could not read the port’s 802.1X settings.');
  return fpost(q, out, [D.tab.key], '802.1X port');
} };
const HX = { id: 'd1host', live: (p, k) => (frows(D.host.key, 'ifIndex').find(r => r.ifIndex === String(ifx(p))) || {})[k],
  text: (k, v) => k === 'swIfHostMode' ? '802.1X: ' + HMODE[v] : 'single-host violation: ' + { 1: 'discard', 2: 'forward', 3: 'shut down' }[v] };
LPF.d1host = { label: '802.1X host mode', run: (p, f) => {
  const i = String(ifx(p)), m = f.swIfHostMode ?? HX.live(p, 'swIfHostMode') ?? '2';
  return fpost(`API/advanced_authen_table_e.htm?Filter:((ifOperStatus!=6) && (ifIndex <=18))^Query:ifIndex=${i}`, { 'ifIndex$query': i, 'swIfHostMode$query': m,
    'swIfSingleHostViolationAdminAction$query': m === '1' ? (f.swIfSingleHostViolationAdminAction ?? HX.live(p, 'swIfSingleHostViolationAdminAction') ?? '1') : '1', 'secPAuthAdvTable$endQuery': 'OK' }, [D.host.key]);
} };

defSettings({
  id: 'dot1x', group: 'Access and security', title: 'Port sign-in (802.1X)', icon: 'lock',
  terms: 'dot1x 802.1x port based authentication radius eap supplicant guest vlan mac authentication host authentication single multi session authenticated users eap statistics',
  keys: [D.glob, D.tab, D.host, D.users, D.eap, D.vlans],
  intro: 'Devices must sign in (through a RADIUS server) before a port passes their traffic. Each port is set in the port inspector; set the RADIUS server under Access and security.',
  render(c) {
    const G = D.glob.key, t1 = fv(G, 'rlAAAEapMethodType1$repeat?1'), t2 = fv(G, 'rlAAAEapMethodType2$repeat?1');
    const ports = frows(D.tab.key, 'dot1xPaePortNumber'), hosts = frows(D.host.key, 'ifIndex'), gbm = fs(D.tab.key, 'rldot1xGuestVlanPorts');
    const auto = ports.filter(r => r.dot1xAuthAuthControlledPortControl === '2').map(r => +r.dot1xPaePortNumber);
    const users = frows(D.users.key, 'rldot1xAuthMultiSessionUserName');
    return [c.form({
      values: { st: fs(G, 'dot1xPaeSystemAuthControl'), m: t1 === '1' && t2 === '2' ? '3' : t1 === '1' ? '1' : '2', guest: fs(G, 'rldot1xGuestVlanVID') || '0', rej: fs(G, 'rldot1xRadiusAttributesErrorsAclReject') },
      fields: [{ k: 'st', label: 'Port sign-in', type: 'toggle', help: 'port-based authentication state' },
        { k: 'm', label: 'Check sign-ins with', type: 'select', options: [['1', 'RADIUS'], ['3', 'RADIUS, then let in if it does not answer'], ['2', 'Nothing (let everyone in)']] },
        { k: 'guest', label: 'Guest VLAN', type: 'select', options: [['0', 'none'], ...vlanOpts(c)], help: 'where devices that cannot sign in go (enable per port)' },
        { k: 'rej', label: 'Let devices in when a RADIUS ACL/policy cannot be applied', type: 'toggle', on: '2', off: '1' }],
      danger: (ch, a) => ch.st === '1' && auto.length ? `Ports ${auto.join(', ')} require sign-in: devices on them lose access until they sign in.${auto.some(n => 'gi1/0/' + n === c.m.mine || n === 1) ? ' This includes the port you depend on.' : ''}` : null,
      apply: (ch, a) => c.formPost('API/authen_global_param.htm', { dot1xPaeSystemAuthControl: a.st, 'rlAAAEapMethodListName$repeat?1': fv(G, 'rlAAAEapMethodListName$repeat?1') || 'default',
        'rlAAAEapMethodType1$repeat?1': a.m === '2' ? '2' : '1', 'rlAAAEapMethodType2$repeat?1': a.m === '3' ? '2' : '0', 'MethodListTable$endRepeat?1': 'OK',
        'rldot1xGuestVlanVID$scalar': a.guest, 'rldot1xRadiusAttributesErrorsAclReject$scalar': a.rej }),
    }), c.table({
      title: 'Ports', rows: ports.filter(r => +r.dot1xPaePortNumber <= 18), empty: 'No port data.',
      columns: [{ label: 'Port', get: r => r.dot1xPaePortNumber }, { label: 'Mode', get: r => CTRL[r.dot1xAuthAuthControlledPortControl] || '—' },
        { label: 'Now', get: r => r.ifOperStatus && r.ifOperStatus !== '1' ? 'port down' : h('span', {}, h('span', { class: 'led ' + (r.dot1xAuthAuthControlledPortStatus === '1' ? 'lg' : 'ly') }), ' ', r.dot1xAuthAuthControlledPortStatus === '1' ? 'authorized' : 'unauthorized') },
        { label: 'Method', get: r => PMETH[r.rldot1xAuthenticationPortMethod] }, { label: 'Devices', get: r => HMODE[(hosts.find(x => x.ifIndex === r.dot1xPaePortNumber) || {}).swIfHostMode] || '—' },
        { label: 'Guest', get: r => getBit(gbm, +r.dot1xPaePortNumber) ? 'yes' : '' }, { label: 'User', get: r => r.dot1xAuthSessionUserName || '' }],
    }), c.table({
      title: 'Signed-in devices', rows: users, empty: 'Nobody is signed in.',
      columns: [{ label: 'User', get: r => r.rldot1xAuthMultiSessionUserName }, { label: 'Port', get: r => ifName(r.rldot1xAuthMultiSessionStatsPortNumber) },
        { label: 'MAC', get: r => h('span', { class: 'mono' }, macFmt(r.rldot1xAuthMultiSessionStatsSourceMac)) }, { label: 'For', get: r => age(+r.rldot1xAuthMultiSessionTime * 1000) },
        { label: 'VLAN', get: r => +r.rldot1xAuthMultiSessionRadiusAttrVlan ? r.rldot1xAuthMultiSessionRadiusAttrVlan : '' },
        { label: 'Filter', get: r => { const f = String(r.rldot1xAuthMultiSessionRadiusAttrFilterId || '').trim(); return !f ? '' : f === 'warning' ? 'could not apply' : f; } }],
    }), c.table({
      title: 'EAP frames', rows: rows(c.get(D.eap.key)).filter(r => +r.receiveFrameCount || +r.transmitFrameCount), empty: 'No EAP traffic.',
      columns: [{ label: 'Port', get: r => portNo(r.interfaceName) }, { label: 'Received', num: true, get: r => count(r.receiveFrameCount) }, { label: 'Sent', num: true, get: r => count(r.transmitFrameCount) },
        { label: 'Start', num: true, get: r => count(r.receiveStartFrameCount) }, { label: 'Logoff', num: true, get: r => count(r.receiveLogoffFrameCount) },
        { label: 'Invalid', num: true, get: r => count(+r.receiveInvalidFrameCount + +r.receiveLengthErrorFrameCount) },
        { label: 'Last from', get: r => h('span', { class: 'mono' }, macFmt(r.lastFrameSourceMACAddress)) }],
    })];
  },
});
defPortGroup({
  id: 'dot1x', title: 'Port sign-in (802.1X)', icon: 'lock', order: 64, keys: [D.glob, D.tab, D.host],
  summary(ports) { const r = d1row(ports[0]); return fs(D.glob.key, 'dot1xPaeSystemAuthControl') !== '1' ? 'off on this switch' : CTRL[r.dot1xAuthAuthControlledPortControl] || ''; },
  body(ports, c) {
    const one = ports.length === 1 ? ports[0] : null, r = one ? d1row(one) : {}, guestV = fs(D.glob.key, 'rldot1xGuestVlanVID');
    const n = (k, label) => lctl(ports, DX, { k, label, type: 'number', unit: 's', min: D1R[k][0], max: D1R[k][1] });
    return [
      fs(D.glob.key, 'dot1xPaeSystemAuthControl') !== '1' ? c.note('Port sign-in is off for the whole switch; these settings wait until it is on.') : null,
      one ? c.kv([['Now', r.dot1xAuthAuthControlledPortStatus === '1' ? 'authorized' : 'unauthorized'], ['State', PAE[r.dot1xAuthPaeState]], ['User', r.dot1xAuthSessionUserName]]) : null,
      lctl(ports, DX, { k: 'dot1xAuthAuthControlledPortControl', label: 'Traffic on this port', type: 'select', options: [['3', 'Always allowed (force authorized)'], ['2', 'Only after sign-in (auto)'], ['1', 'Always blocked (force unauthorized)']] }),
      lctl(ports, DX, { k: 'rldot1xAuthenticationPortMethod', label: 'Sign in by', type: 'select', options: Object.entries(PMETH), help: 'change while the port is always allowed' }),
      lctl(ports, HX, { k: 'swIfHostMode', label: 'Devices', type: 'select', options: [['1', 'One device (single host)'], ['2', 'Many, one sign-in opens the port (multi-host)'], ['3', 'Each device signs in (multi-session)']] }),
      lval(ports, HX, 'swIfHostMode') === '1' ? lctl(ports, HX, { k: 'swIfSingleHostViolationAdminAction', label: 'A second device', type: 'select', options: [['1', 'Its frames are dropped'], ['2', 'Is let through'], ['3', 'Shuts the port']] }) : null,
      +guestV ? lctl(ports, DX, { k: 'guest', label: `Guest VLAN ${guestV}`, type: 'toggle', help: 'devices that do not sign in go there' }) : null,
      lctl(ports, DX, { k: 'dot1xAuthReAuthEnabled', label: 'Sign in again periodically', type: 'toggle' }),
      lval(ports, DX, 'dot1xAuthReAuthEnabled') === '1' ? n('dot1xAuthReAuthPeriod', 'Every') : null,
      lctl(ports, DX, { k: 'rldot1xRadiusAttrVlanIdEnabled', label: 'VLAN from RADIUS', type: 'toggle', help: 'dynamic VLAN assignment' }),
      lctl(ports, DX, { k: 'rldot1xRadiusAttAclNameEnabled', label: 'ACL from RADIUS', type: 'toggle', help: 'dynamic policy / ACL assignment' }),
      n('dot1xAuthQuietPeriod', 'Wait after a failed sign-in'), n('dot1xAuthTxPeriod', 'Repeat the identity request every'), n('dot1xAuthSuppTimeout', 'Device answer timeout'),
      n('dot1xAuthServerTimeout', 'RADIUS answer timeout'), lctl(ports, DX, { k: 'dot1xAuthMaxReq', label: 'EAP requests before giving up', type: 'number', min: 1, max: 10 }),
      one ? h('button', { class: 'btn sm', type: 'button', onclick: e => act(e.currentTarget, () => LPF.dot1x.run(one, { dot1xPaePortReauthenticate: '1' }), 'Asked the device to sign in again.').catch(() => {}) }, icon('refresh'), 'Sign in again now') : null,
    ];
  },
});

/* ---------- DHCP snooping ---------- */
const SN = { glob: kd(fk('property_dhcp.htm')), vl: kd('DHCPSnoopingVLANList'), tr: kd(fk('trusted_table.htm')), db: kd(fk('binding_database.htm'), 'live'), vlans: { key: K.vlans, cls: 'config' } };
const AR = { glob: kd(fk('arp_inspection_global.htm')), list: kd(fk('arp_inspection_list.htm')), vl: kd(fk('arp_vlan_settings.htm')), tr: kd(fk('arp_inspection_trustedInt.htm')) };
const trusted = key => frows(key, 'ifIndex').map(r => +r.ifIndex);
defSettings({
  id: 'dhcp-snoop', group: 'Access and security', title: 'DHCP snooping', icon: 'shield',
  terms: 'dhcp snooping trusted interfaces binding database option 82 verify mac rogue dhcp server',
  keys: [SN.glob, SN.vl, SN.tr, SN.db, SN.vlans],
  intro: 'Blocks DHCP servers on untrusted ports and remembers which address each device got (the binding database, also used by ARP inspection).',
  render(c) {
    const G = SN.glob.key, tr = trusted(SN.tr.key), vl = rows(c.get(SN.vl.key)), db = frows(SN.db.key, 'rlIpDhcpSnoopMACAddress');
    return [c.form({
      values: { en: fs(G, 'rlIpDhcpSnoopEnable'), o82: fs(G, 'rlIpDhcpOpt82RxOnUntrustedEnable'), mac: fs(G, 'rlIpDhcpSnoopVerifyMacAddress'), file: fs(G, 'rlIpDhcpSnoopFileEnable'), t: fs(G, 'rlIpDhcpSnoopFileUpdateTime') },
      fields: [{ k: 'en', label: 'DHCP snooping', type: 'toggle' },
        { k: 'o82', label: 'Pass option 82 from untrusted ports', type: 'toggle', show: v => v.en === '1' },
        { k: 'mac', label: 'Check the client MAC', type: 'toggle', help: 'source MAC must match the DHCP client address', show: v => v.en === '1' },
        { k: 'file', label: 'Keep bindings in flash', type: 'toggle', help: 'survive a restart', show: v => v.en === '1' },
        { k: 't', label: 'Write to flash every', unit: 's', type: 'number', min: 600, max: 86400, show: v => v.en === '1' && v.file === '1', validate: numIn(600, 86400) }],
      danger: (ch, a) => ch.en === '1' && !tr.includes(1) ? 'Port 1 (your uplink) is not trusted: DHCP answers arriving there are dropped on snooping VLANs, so devices stop getting addresses.' : null,
      apply: (ch, a) => c.formPost('API/property_dhcp.htm', a.en === '1' ? { rlIpDhcpSnoopEnable: '1', rlIpDhcpOpt82RxOnUntrustedEnable: a.o82, rlIpDhcpSnoopVerifyMacAddress: a.mac, rlIpDhcpSnoopFileEnable: a.file,
        ...('t' in ch ? { rlIpDhcpSnoopFileUpdateTime: a.t } : {}) } : { rlIpDhcpSnoopEnable: '2' }),
    }), c.table({
      title: 'VLANs', help: 'Snooping works only on these VLANs.', rows: vl, key: r => 'VLAN ' + r.VLANID, empty: 'No VLANs.',
      columns: [{ label: 'VLAN', get: r => h('span', { class: 'bd', style: '--c:' + vcol.of(+r.VLANID) }, r.VLANID) }, { label: 'Name', get: r => r.VLANName }],
      add: { label: 'Add VLAN', values: { v: '' }, fields: [{ k: 'v', label: 'VLAN', type: 'select', options: [['', 'pick'], ...vlanOpts(c).filter(([v]) => !vl.some(x => x.VLANID === v))], validate: v => v ? null : 'pick a VLAN' }],
        apply: a => c.post('DHCPSnoopingVLANList', { VLAN: { VLANID: a.v } }) },
      remove: { confirm: r => `Snooping stops on VLAN ${r.VLANID}; its bindings are deleted.`, apply: r => c.post('DHCPSnoopingVLANList', { VLAN: { VLANID: r.VLANID } }, 'delete') },
    }), c.block('Trusted ports', chipList(tr.map(ifName)), c.note('Set per port in the port inspector (Trusted for DHCP and ARP). Trust the ports that lead to your DHCP server.')),
    c.table({
      title: 'Bindings', rows: db, key: r => macFmt(r.rlIpDhcpSnoopMACAddress), empty: 'No bindings.',
      columns: [{ label: 'MAC', get: r => h('span', { class: 'mono' }, macFmt(r.rlIpDhcpSnoopMACAddress)) }, { label: 'VLAN', get: r => r.rlIpDhcpSnoopVLANTag },
        { label: 'IP', get: r => r.rlIpDhcpSnoopIPAddress }, { label: 'Port', get: r => ifName(r.rlIpDhcpSnoopPortInterface) },
        { label: 'Type', get: r => ({ 2: 'learned', 3: 'static' }[r.rlIpDhcpSnoopType] || 'dynamic') },
        { label: 'Lease', get: r => r.rlIpDhcpSnoopType === '3' ? '' : +r.rlIpDhcpSnoopLeaseTime === 4294967295 ? 'infinite' : r.rlIpDhcpSnoopLeaseTime + ' s' }],
      add: { label: 'Add binding', values: { type: '3', mac: '', vid: String(c.m.vlans[0]?.id || 1), ip: '', port: '1', lease: '' },
        fields: [{ k: 'type', label: 'Kind', type: 'seg', options: [['3', 'Static'], ['2', 'Dynamic']] }, { k: 'mac', label: 'MAC', validate: v => macOk(v) ? null : '00:11:22:33:44:55' },
          { k: 'vid', label: 'VLAN', type: 'select', options: vlanOpts(c) }, { k: 'ip', label: 'IP address', validate: v => ipOk(v) ? null : 'a.b.c.d' },
          { k: 'port', label: 'Port', type: 'select', options: portOpts() },
          { k: 'lease', label: 'Lease', unit: 's', type: 'number', placeholder: 'infinite', show: v => v.type === '2', validate: v => v === '' ? null : numIn(10, 4294967294)(v) }],
        apply: a => c.formPost('API/binding_database_a.htm', a.type === '3'
          ? { 'rlIpDhcpSnoopStaticRowStatus$add': '4', 'rlIpDhcpSnoopStaticVLANTag$add': a.vid, 'rlIpDhcpSnoopStaticMACAddress$add': a.mac.trim(), 'rlIpDhcpSnoopStaticIPAddress$add': a.ip, 'rlIpDhcpSnoopStaticPortInterface$add': a.port, 'dhcpStaticTable$endAdd': 'OK' }
          : { 'rlIpDhcpSnoopRowStatus$add': '4', 'rlIpDhcpSnoopPortInterface$add': a.port, 'rlIpDhcpSnoopVLANTag$add': a.vid, 'rlIpDhcpSnoopType$add': '2', 'rlIpDhcpSnoopMACAddress$add': a.mac.trim(),
            'rlIpDhcpSnoopIPAddress$add': a.ip, ...(a.lease ? { 'rlIpDhcpSnoopLeaseTime$add': a.lease } : {}), 'dhcpBindingTable$endAdd': 'OK' }) },
      remove: { apply: r => c.formPost('API/binding_database.htm', { 'rlIpDhcpSnoopMACAddress$repeat?1': r.rlIpDhcpSnoopMACAddress, 'rlIpDhcpSnoopVLANTag$repeat?1': r.rlIpDhcpSnoopVLANTag, 'rlIpDhcpSnoopType$repeat?1': r.rlIpDhcpSnoopType,
        [r.rlIpDhcpSnoopType === '3' ? 'rlIpDhcpSnoopStaticRowStatus$repeat?1' : 'rlIpDhcpSnoopRowStatus$repeat?1']: '6', 'dhcpBindingTable$endRepeat?1': 'OK' }) },
    }), h('button', { class: 'btn sm', type: 'button', onclick: async e => {
      if (!await confirmBox('Clear learned bindings?', ['Every dynamic binding is removed; devices are re-learned when they renew their address.'], 'Clear', true)) return;
      act(e.currentTarget, () => c.formPost('API/binding_database.htm', { rlIpDhcpSnoopClearAction: '2' }), 'Cleared.').then(() => setTimeout(c.refresh, 1200)).catch(() => {});
    } }, 'Clear learned bindings')];
  },
});

/* ---------- Dynamic ARP inspection ---------- */
const oct2s = s => /^([0-9a-f]{2})+$/i.test(s || '') && /[0-9]/.test(s) ? s.match(/../g).map(x => String.fromCharCode(parseInt(x, 16))).join('').replace(/\0/g, '') : s || '';
defSettings({
  id: 'dai', group: 'Access and security', title: 'ARP inspection (DAI)', icon: 'shield',
  terms: 'dynamic arp inspection dai arp spoofing acl list entries vlan settings trusted interfaces validate',
  keys: [AR.glob, AR.list, AR.vl, AR.tr, SN.vl],
  intro: 'Drops ARP packets on untrusted ports unless the address pair is in a list below or in the DHCP snooping bindings of that VLAN. Stops ARP spoofing.',
  render(c) {
    const G = AR.glob.key, ents = frows(AR.list.key, 'rlIpArpInspectListName'), names = [...new Set(ents.map(r => r.rlIpArpInspectListName))];
    const vls = frows(AR.vl.key, 'rlIpArpInspectEnableVlanTag'), tr = trusted(AR.tr.key), li = fs(G, 'rlIpArpInspectLogInterval');
    const bindL = (vid, name) => c.formPost(`API/arp_vlan_settings_bind.htm?[arpVlanTable]Query:rlIpArpInspectEnableVlanTag=${vid}[ArpInterface]Query:rlIpArpInspectListName=`,
      { 'String$query': 'OK', 'rlIpArpInspectEnableVlanTag$query': vid, 'Default$query': 'OK', 'rlIpArpInspectAssignedListName$query': name, 'arpVlanTable$endQuery': 'OK' });
    return [c.form({
      values: { en: fs(G, 'rlIpArpInspectEnable'), val: fs(G, 'rlIpArpInspectValidation'), log: li === '4294967295' ? 'never' : li },
      fields: [{ k: 'en', label: 'ARP inspection', type: 'toggle' }, { k: 'val', label: 'Also check addresses', type: 'toggle', help: 'source/destination MAC and IP sanity (validate)' },
        { k: 'log', label: 'Log drops at most every', unit: 's', help: '0–86400, or never', validate: v => v === 'never' ? null : numIn(0, 86400)(v) }],
      danger: (ch, a) => ch.en === '1' && !tr.includes(1) ? 'Port 1 (your uplink) is not trusted for ARP: on inspected VLANs, ARP from there is dropped unless it matches a list or binding.' : null,
      apply: (ch, a) => c.formPost('API/arp_inspection_global.htm', { rlIpArpInspectEnable: a.en, rlIpArpInspectValidation: a.val, rlIpArpInspectLogInterval: a.log === 'never' ? '4294967295' : a.log }),
    }), c.table({
      title: 'VLANs', rows: vls, key: r => 'VLAN ' + r.rlIpArpInspectEnableVlanTag, empty: 'Inspection runs on no VLAN.',
      columns: [{ label: 'VLAN', get: r => h('span', { class: 'bd', style: '--c:' + vcol.of(+r.rlIpArpInspectEnableVlanTag) }, r.rlIpArpInspectEnableVlanTag) },
        { label: 'Allowed pairs from', get: r => [oct2s(r.rlIpArpInspectAssignedListName) && `list “${oct2s(r.rlIpArpInspectAssignedListName)}”`, rows(c.get(SN.vl.key)).some(x => x.VLANID === r.rlIpArpInspectEnableVlanTag) && 'DHCP snooping'].filter(Boolean).join(' + ') || 'nothing (all ARP dropped)' }],
      add: { label: 'Inspect a VLAN', values: { v: '', l: '' }, fields: [{ k: 'v', label: 'VLAN', type: 'select', options: [['', 'pick'], ...vlanOpts(c)], validate: v => v ? null : 'pick a VLAN' },
        ...(names.length ? [{ k: 'l', label: 'List', type: 'select', options: [['', 'none'], ...names] }] : [])],
        apply: async a => { await c.formPost('API/arp_vlan_settings_a.htm', { 'rlIpArpInspectEnableVlanTag$add': a.v, 'rlIpArpInspectEnableVlanRowStatus$add': '4', 'arpVlanTable$endAdd': 'OK' }); if (a.l) await bindL(a.v, a.l); } },
      edit: names.length ? { fields: () => [{ k: 'l', label: 'List', type: 'select', options: names }], values: r => ({ l: oct2s(r.rlIpArpInspectAssignedListName) || names[0] }), apply: (ch, a, r) => bindL(r.rlIpArpInspectEnableVlanTag, a.l) } : null,
      remove: { apply: r => c.formPost('API/arp_vlan_settings.htm', { 'rlIpArpInspectEnableVlanTag$repeat?1': r.rlIpArpInspectEnableVlanTag, 'String$repeat?1': 'OK', 'rlIpArpInspectEnableVlanRowStatus$repeat?1': '6', 'arpVlanTable$endRepeat?1': 'OK' }) },
    }), c.table({
      title: 'Allowed address pairs (lists)', rows: ents, key: r => `${r.rlIpArpInspectListName} ${r.rlIpArpInspectListIPAddress}`, empty: 'No lists.',
      columns: [{ label: 'List', get: r => h('b', {}, r.rlIpArpInspectListName) }, { label: 'IP', get: r => r.rlIpArpInspectListIPAddress }, { label: 'MAC', get: r => h('span', { class: 'mono' }, macFmt(r.rlIpArpInspectListMACAddress)) }],
      add: { label: 'Add pair', values: { n: names[0] || '', ip: '', mac: '' },
        fields: [{ k: 'n', label: 'List', help: names.length ? `existing: ${names.join(', ')}; a new name makes a new list` : 'a new list', validate: v => /^.{1,32}$/.test(v.trim()) ? null : '1–32 characters' },
          { k: 'ip', label: 'IP address', validate: v => ipOk(v) ? null : 'a.b.c.d' }, { k: 'mac', label: 'MAC', validate: v => macOk(v) ? null : '00:11:22:33:44:55' }],
        apply: a => c.formPost(names.includes(a.n.trim()) ? 'API/arp_inspection_list_entries_a.htm' : 'API/arp_inspection_list_a.htm', { 'rlIpArpInspectListName$add': a.n.trim(), 'rlIpArpInspectListIPAddress$add': a.ip,
          'rlIpArpInspectListMACAddress$add': a.mac.trim(), 'String$add': 'OK', 'Default$add': 'OK', 'ArpInterface$endAdd': 'OK' }) },
      remove: { confirm: r => `The pair ${r.rlIpArpInspectListIPAddress} is removed from “${r.rlIpArpInspectListName}” (the list goes when its last pair does).`,
        apply: r => c.formPost('API/arp_inspection_list_entries.htm', { 'String$repeat?1': 'OK', 'Default$repeat?1': 'OK', 'rlIpArpInspectListName$repeat?1': r.rlIpArpInspectListName,
          'rlIpArpInspectListIPAddress$repeat?1': r.rlIpArpInspectListIPAddress, 'rlIpArpInspectListRowStatus$repeat?1': '6', 'ArpInterface$endRepeat?1': 'OK' }) },
    }), c.block('Trusted ports', chipList(tr.map(ifName)), c.note('Set per port in the port inspector (Trusted for DHCP and ARP). This is separate from DHCP snooping trust.'))];
  },
});

/* per port: DHCP snooping trust and ARP inspection trust (presence tables) */
const TS = { id: 'dhcpt', live: p => trusted(SN.tr.key).includes(ifx(p)) ? '1' : '2', text: (k, v) => v === '1' ? 'trusted for DHCP' : 'not trusted for DHCP' };
const TA = { id: 'arpt', live: p => trusted(AR.tr.key).includes(ifx(p)) ? '1' : '2', text: (k, v) => v === '1' ? 'trusted for ARP' : 'not trusted for ARP' };
LPF.dhcpt = { label: 'DHCP trust', run: (p, f) => { const i = String(ifx(p)); return fpost(`API/trusted_table_e.htm?Query:ifIndex=${i}`, f.v === '1'
  ? { 'ifIndex$query': i, 'rlIpDhcpSnoopTrustedPortRowStatus$query': '4', 'dhcpTrustedTable$endAdd': 'OK' } : { 'ifIndex$query': i, 'rlIpDhcpSnoopTrustedPortRowStatus$query': '6', 'dhcpTrustedTable$endQuery': 'OK' }, [SN.tr.key]); } };
LPF.arpt = { label: 'ARP trust', run: (p, f) => { const i = String(ifx(p)); return fpost(`API/arp_inspection_trustedInt_e.htm?Query:ifIndex=${i}`, f.v === '1'
  ? { 'ifIndex$add': i, 'ArpInterface$endAdd': 'OK' } : { 'ifIndex$query': i, 'rlIpArpInspectTrustedPortRowStatus$query': '6', 'ArpInterface$endQuery': 'OK' }, [AR.tr.key]); } };
defPortGroup({
  id: 'snoop-trust', title: 'Trusted for DHCP and ARP', icon: 'shield', order: 66, keys: [SN.tr, AR.tr],
  summary: ports => [TS.live(ports[0]) === '1' && 'DHCP', TA.live(ports[0]) === '1' && 'ARP'].filter(Boolean).join(' + ') || 'untrusted',
  body: (ports, c) => [lctl(ports, TS, { k: 'v', label: 'DHCP servers allowed here', type: 'toggle', help: 'DHCP snooping trusted port' }),
    lctl(ports, TA, { k: 'v', label: 'ARP not inspected here', type: 'toggle', help: 'ARP inspection trusted port' }),
    c.note('Trust uplinks and the port of your DHCP server.')],
});

/* ---------- diagnostics: cable test, transceivers ---------- */
const CT = kd('CableTestPortList');
const CT_RES = { 1: 'OK (4 pairs)', 2: 'OK (2 pairs)', 3: 'no cable', 4: 'open', 5: 'short', 6: 'bad cable', 7: 'impedance mismatch' };
const CT_LEN = { 1: 'under 50 m', 2: '50–80 m', 3: '80–110 m', 4: '110–140 m', 5: 'over 140 m' };
const ctOf = name => { const o = {}; for (const e of rows(data.get(CT.key))) if (e.interfaceName === name) o[e.testType] = e; return o; };
const dbm2mw = v => Math.pow(10, +v / 10000);
function cableKv(c, T) {
  const date = Object.values(T).map(e => e.testDate).filter(Boolean).sort().pop();
  return c.kv([['Result', T[2] ? CT_RES[T[2].resultVal] || 'unknown (' + T[2].resultVal + ')' : 'not tested'], T[3] && +T[3].resultVal ? ['Fault at', T[3].resultVal + ' m'] : null,
    ['Length', T[4] ? CT_LEN[T[4].resultVal] || '?' : '—'], ['Tested', date ? logTime(date) : '—']]);
}
function pairs(T) {
  if (!T[13] && !T[17] && !T[21]) return null;
  const row = (l, b, f) => h('tr', {}, h('td', {}, l), ...rng(0, 3).map(j => h('td', { class: 'num' }, T[b + j] ? f(T[b + j].resultVal) : '—')));
  return h('table', { class: 'tbl' }, h('thead', {}, h('tr', {}, h('th', {}, 'Pair'), ...['A', 'B', 'C', 'D'].map(x => h('th', { class: 'num' }, x)))),
    h('tbody', {}, row('Channel', 13, v => v), row('Polarity', 17, v => v === '0' ? 'normal' : 'reversed'), row('Skew', 21, v => v + ' ns')));
}
function optics(c, T) {
  const v = (t, f) => T[t] ? f(T[t].resultVal) : 'n/a', yn = x => +x ? 'yes' : 'no';
  return c.kv([['Transceiver', v(25, x => ({ 1: 'Dell qualified', 2: 'generic' }[x] || 'n/a'))], ['Temperature', v(5, x => x + ' °C')], ['Voltage', v(6, x => (x / 1e6).toFixed(2) + ' V')],
    ['Laser current', v(7, x => (x / 1000).toFixed(2) + ' mA')], ['Sending', v(8, x => `${dbm2mw(x).toFixed(3)} mW (${(x / 1000).toFixed(2)} dBm)`)],
    ['Receiving', v(9, x => `${dbm2mw(x).toFixed(3)} mW (${(x / 1000).toFixed(2)} dBm)`)], ['Signal lost', v(11, yn)], ['Transmit fault', v(12, yn)], ['Data ready', v(10, yn)]]);
}
async function cableTest(p, c, btn) {
  const m = c.m || {}, risky = p.name === m.mine ? `Port ${p.no} is your connection to the switch.` : p.name === 'gi1/0/1' ? 'Port 1 is the uplink to your network.' : null;
  const lines = [`The link on port ${p.no} drops while the test runs (a few seconds) and comes back by itself; traffic on it stops meanwhile.`, 'Copper only, cables up to about 120 m. Length is measured only on a 1 Gb/s link.'];
  if (risky) lines.unshift(risky + ' You will lose this page until the link returns, and a stuck test can cut you off.');
  if (!await confirmBox(`Test the cable on port ${p.no}?`, lines, risky ? 'Run the test anyway' : 'Run test', !!risky)) return;
  await act(btn, () => api.post({ section: 'CableTestPortList', action: 'set', body: { Entry: { interfaceName: p.name, testType: '2' } } }, 'cable test'), 'Cable test finished.').catch(() => {});
  data.need([CT.key], { prio: PRIO.USER, force: true }).catch(() => {});
}
defPortGroup({
  id: 'diag', title: 'Cable and transceiver', icon: 'cable', order: 80, keys: [CT],
  summary(ports) { const p = ports[0], T = ctOf(p.name); return p.sfp ? (T[5] ? `${T[5].resultVal} °C` : 'transceiver') : T[2] ? CT_RES[T[2].resultVal] || 'tested' : T[4] ? CT_LEN[T[4].resultVal] || '' : 'not tested'; },
  body(ports, c) {
    if (ports.length > 1) return c.note('Select one port to test its cable or read its transceiver.');
    const p = ports[0], T = ctOf(p.name);
    if (p.sfp) return [T[5] || T[8] || T[9] ? optics(c, T) : c.note('No diagnostics: no module, or it does not report them (needs SFF-8472 DDM).'), c.note('Readings are as of the last read; press refresh in Settings → Cables and transceivers.')];
    return [cableKv(c, T), pairs(T), h('button', { class: 'btn sm', type: 'button', onclick: e => cableTest(p, c, e.currentTarget) }, icon('cable'), 'Test cable…')];
  },
});
defSettings({
  id: 'cables', group: 'Monitoring', title: 'Cables and transceivers', icon: 'cable', terms: 'cable test tdr integrated cable test copper length fault optical transceiver diagnostics sfp ddm temperature power',
  keys: [CT, { key: K.std, cls: 'live' }],
  intro: 'Last cable test of each copper port and live readings of the SFP modules. Run a cable test from the port inspector.',
  render(c) {
    const P = c.m.ports;
    return [c.table({ title: 'Copper ports', rows: P.filter(p => !p.sfp), columns: [{ label: 'Port', get: p => p.no },
      { label: 'Result', get: p => { const T = ctOf(p.name); return T[2] ? CT_RES[T[2].resultVal] || '?' : '—'; } }, { label: 'Fault at', num: true, get: p => { const T = ctOf(p.name); return T[3] && +T[3].resultVal ? T[3].resultVal + ' m' : ''; } },
      { label: 'Length', get: p => { const T = ctOf(p.name); return T[4] ? CT_LEN[T[4].resultVal] || '?' : ''; } },
      { label: 'Tested', get: p => { const d = Object.values(ctOf(p.name)).map(e => e.testDate).filter(Boolean).sort().pop(); return d ? logTime(d) : ''; } }] }),
    ...P.filter(p => p.sfp).map(p => c.block(`Port ${p.no} (SFP)`, optics(c, ctOf(p.name))))];
  },
});
defSettings({
  id: 'identify', group: 'Switch', title: 'Find this switch', icon: 'here', terms: 'identify blink led locate beacon',
  keys: [kd(fk('diagnostics_identify.htm'))],
  render(c) {
    let t = String(fs(fk('diagnostics_identify.htm'), 'rlPhdPhyLedTimeout') || '').trim();
    if (numIn(1, 255)(t)) t = '60'; // the switch reports 0 when nothing blinks: what the box shows is what gets sent
    const inp = h('input', { type: 'number', min: 1, max: 255, value: t, style: 'max-width:90px', oninput: e => { t = e.target.value; } });
    return [c.note('Blinks the front-panel LEDs so you can spot the switch in a rack (Identify). The platform reports no dedicated locator LED, so nothing may visibly blink on the X1018.'),
      h('div', { class: 'fl' }, h('label', {}, 'Blink for', h('span', { class: 'mu' }, ' (s, 1–255)')), inp),
      h('button', { class: 'btn pri', type: 'button', onclick: e => { if (numIn(1, 255)(t)) return toast('Use 1–255 seconds.', true);
        act(e.currentTarget, () => api.formPost('API/diagnostics_identify.htm', { 'rlPhdPhyLedStackUnit$scalar': '1', 'rlPhdPhyLedTimeout$scalar': String(t) }, 'identify'), `Blinking for ${t} s.`).catch(() => {}); } }, 'Blink')];
  },
});

/* ---------- counters ---------- */
const ST = { key: K.stats, cls: 'live' }, EL = kd('EtherlikeStatisticsList&interfaceType=1', 'live'), RM = kd('RMONStatistics&interfaceType=1', 'live');
const rmRows = () => { const v = data.get(RM.key); return rows(v && v.InterfaceStatisticsList ? v.InterfaceStatisticsList : v); };
const byName = (list, n) => list.find(r => r.interfaceName === n) || {};
const CNT = {
  traffic: [['Bytes in', 'receivePacketByteCount', bytes], ['Unicast in', 'receiveUnicastPacketCount'], ['Multicast in', 'receiveMulticastPacketCount'], ['Broadcast in', 'receiveBroadcastPacketCount'], ['Errors in', 'packetErrorCount'],
    ['Bytes out', 'transmitPacketByteCount', bytes], ['Unicast out', 'transmitUnicastPacketCount'], ['Multicast out', 'transmitMulticastPacketCount'], ['Broadcast out', 'transmitBroadcastPacketCount']],
  errors: [['FCS errors', 'frameCheckSequenceErrorCount'], ['Single collisions', 'singleCollisionFrameCount'], ['Late collisions', 'lateCollisionCount'], ['Excessive collisions', 'excessiveCollisionCount'],
    ['MAC receive errors', 'internalMACReceiveErrorCount'], ['Oversized', 'oversizePacketCount'], ['Pause in', 'receivePauseFrameCount'], ['Pause out', 'transmitPauseFrameCount']],
  rmon: [['Packets in', 'receivePacketCount'], ['CRC/align errors', 'CRCAlignErrorCount'], ['Undersized', 'undersizePacketCount'], ['Oversized', 'oversizePacketCount'], ['Fragments', 'fragmentCount'],
    ['Jabbers', 'jabberCount'], ['Collisions', 'collisionCount'], ['Drop events', 'dropEventCount']],
  sizes: [['64', 'frameOf64BytesCount'], ['65–127', 'frameOf65To127BytesCount'], ['128–255', 'frameOf128To255BytesCount'], ['256–511', 'frameOf256To511BytesCount'], ['512–1023', 'frameOf512To1023BytesCount'], ['1024+', 'frameOf1024To1518BytesCount']],
};
const cntSrc = { traffic: () => rows(data.get(K.stats)), errors: () => rows(data.get(EL.key)), rmon: rmRows, sizes: rmRows };
const fmtN = (f, v) => v == null || v === '' ? '—' : (f || count)(v);
async function clearAll(c, btn) {
  if (!await confirmBox('Clear all counters?', ['This resets the counters of every port, not only the selected one. Rates and error marks start from zero.'], 'Clear all', true)) return;
  await act(btn, () => api.post({ section: 'GlobalStatisticsSetting', action: 'set', body: { clearInterfaceStatistics: '1' } }, 'clear counters'), 'Counters cleared.').catch(() => {});
  data.invalidate([K.stats, EL.key, RM.key]); setTimeout(() => data.need([K.stats, EL.key, RM.key], { prio: PRIO.USER }).catch(() => {}), 1200);
}
defPortGroup({
  id: 'port-counters', title: 'Detailed counters', icon: 'pulse', order: 82, keys: [ST, EL, RM],
  summary(ports) { const e = byName(rows(data.get(EL.key)), ports[0].name), n = CNT.errors.slice(0, 5).reduce((a, [, k]) => a + (+e[k] || 0), 0); return n ? `${count(n)} link errors` : 'no link errors'; },
  body(ports, c) {
    const p = ports[0], kv = (set, f) => c.kv(CNT[set].map(([l, k, fm]) => [l, fmtN(fm, byName(cntSrc[set](), p.name)[k])]).filter(([, v]) => f || v !== '0'));
    return [ports.length > 1 ? c.note(`Showing port ${p.no}.`) : null, kv('traffic', true), kv('errors'), kv('rmon'),
      h('button', { class: 'btn sm', type: 'button', onclick: e => clearAll(c, e.currentTarget) }, 'Clear counters (all ports)…')];
  },
});
let cTab = 'traffic';
defSettings({
  id: 'port-counters', group: 'Monitoring', title: 'Port counters', icon: 'pulse',
  terms: 'interface counters statistics etherlike rmon statistics fcs collisions pause frames frame sizes histogram clear counters',
  keys: [ST, EL, RM],
  render(c) {
    const box = h('div');
    const draw = () => box.replaceChildren(h('div', { class: 'seg', role: 'radiogroup' }, [['traffic', 'Traffic'], ['errors', 'Errors (Etherlike)'], ['rmon', 'RMON'], ['sizes', 'Frame sizes']].map(([v, l]) =>
      h('button', { type: 'button', class: cTab === v ? 'on' : '', role: 'radio', 'aria-checked': cTab === v ? 'true' : 'false', onclick: () => { cTab = v; draw(); } }, l))),
    c.table({ rows: cntSrc[cTab]().filter(r => /^gi/.test(r.interfaceName)), empty: 'No data.',
      columns: [{ label: 'Port', get: r => portNo(r.interfaceName) }, ...CNT[cTab].map(([l, k, f]) => ({ label: l, num: true, get: r => fmtN(f, r[k]) }))] }));
    draw();
    return [box, h('button', { class: 'btn sm', type: 'button', onclick: e => clearAll(c, e.currentTarget) }, 'Clear all counters…')];
  },
});

/* utilization: percentages from the difference between two reads */
const UT = kd(fk('sum_utilize.htm'), 'live');
let utilS = [];
const utilSnap = () => { const e = data.entry(UT.key); if (e && e.v && !utilS.some(s => s.at === e.at)) { utilS.push({ at: e.at, v: e.v }); utilS = utilS.slice(-2); } };
bus.on('data', k => { if (k === UT.key) utilSnap(); });
defSettings({
  id: 'utilization', group: 'Monitoring', title: 'Port utilization', icon: 'traffic', terms: 'utilization summary bandwidth usage percent load unicast non unicast errors',
  keys: [UT],
  intro: 'Share of each port’s capacity used between the last two reads. Press refresh (top right) to take a new reading.',
  render(c) {
    utilSnap();
    if (utilS.length < 2) return [c.note('One reading so far. Press refresh to measure.')];
    const [a, b] = utilS, ra = frows(null, 'ifIndex', a.v), rb = frows(null, 'ifIndex', b.v), dt = (+fs(UT.key, 'sysUpTime') - +(a.v['sysUpTime$scalar'] ?? a.v.sysUpTime)) / 100 || (b.at - a.at) / 1000;
    const rowsU = rb.filter(r => +r.ifIndex <= 18 || r.ifOperStatus === '1').map(r => {
      const o = ra.find(x => x.ifIndex === r.ifIndex) || {}, d = k => Math.max(0, (+r[k] || 0) - (+o[k] || 0));
      const sp = +r.ifHighSpeed ? r.ifHighSpeed * 1e6 : +r.ifSpeed, oct = (d('ifHCInOctets') + d('ifHCOutOctets')) / 2, pk = (d('ifInUcastPkts') + d('ifOutUcastPkts') + d('ifInNUcastPkts') + d('ifOutNUcastPkts')) / 2;
      const inU = d('ifInUcastPkts'), inN = d('ifInNUcastPkts'), uni = inU + inN ? [inU, inN] : [d('ifOutUcastPkts'), d('ifOutNUcastPkts')];
      return { r, up: r.ifOperStatus === '1', util: r.ifOperStatus === '1' && sp && dt > 0 ? Math.min(100, (pk * 160 + oct * 8) / (sp * dt) * 100) : null, uni, err: [d('ifInErrors'), inU + inN + d('ifInErrors')] };
    });
    return [c.note(`Over ${Math.round(dt)} s.`), c.table({ rows: rowsU, columns: [{ label: 'Port', get: x => ifName(x.r.ifIndex) }, { label: 'Link', get: x => h('span', { class: 'led ' + (x.up ? 'lg' : '') }) },
      { label: 'Used', num: true, get: x => x.util == null ? '—' : x.util.toFixed(x.util < 1 ? 2 : 0) + ' %' }, { label: 'Unicast', num: true, get: x => pct(x.uni[0], x.uni[0] + x.uni[1]) },
      { label: 'Multicast / broadcast', num: true, get: x => pct(x.uni[1], x.uni[0] + x.uni[1]) }, { label: 'Errors', num: true, get: x => pct(x.err[0], x.err[1]) }] })];
  },
});

/* CPU load: samples kept while the section is open */
const CPU = kd(fk('cpu_utilization_chart.htm'), 'live');
let cpuS = [];
bus.on('data', k => { if (k !== CPU.key) return; const e = data.entry(k), v = +fs(k, 'rlCpuUtilDuringLastSecond'); if (e && Number.isFinite(v) && !cpuS.some(s => s.at === e.at)) cpuS = [...cpuS, { at: e.at, v }].slice(-30); });
defSettings({
  id: 'cpu', group: 'Monitoring', title: 'CPU load', icon: 'pulse', terms: 'cpu utilization load processor',
  keys: [CPU],
  render(c) {
    const v = fs(CPU.key, 'rlCpuUtilDuringLastSecond'), pts = cpuS.map((s, i) => `${(i / Math.max(1, cpuS.length - 1) * 300).toFixed(1)},${(60 - s.v * 0.6).toFixed(1)}`).join(' ');
    const box = h('div', {}, h('p', { style: 'font-size:28px;margin:0' }, v != null ? v + ' %' : '—', h('span', { class: 'mu', style: 'font-size:13px' }, ' during the last second')),
      cpuS.length > 1 ? h('svg', { viewBox: '0 0 300 60', style: 'width:100%;max-width:420px;height:70px;color:var(--grn)', role: 'img', 'aria-label': 'CPU load history' },
        h('path', { svg: true, d: 'M0 59.5H300', stroke: 'currentColor', 'stroke-opacity': '.25', fill: 'none' }),
        h('polyline', { svg: true, points: pts, fill: 'none', stroke: 'currentColor', 'stroke-width': '1.5' })) : null,
      c.note('Read every 10 s while this page is open. The switch’s CPU is slow by design; brief peaks while pages load are normal.'));
    const t = setInterval(() => { if (!box.isConnected) return clearInterval(t); if (!document.hidden && !net.q.length) data.need([CPU.key], { force: true }).catch(() => {}); }, 10000);
    return box;
  },
});

/* RMON history samples (read-only; RMON history control is configured under RMON alarms and history) */
const HC = kd(fk('history_control_table.htm'));
let hSel = null;
defSettings({
  id: 'rmon-samples', group: 'Monitoring', title: 'RMON history samples', icon: 'clock', terms: 'rmon history table samples ether history utilization',
  keys: [HC],
  render(c) {
    const ctl = frows(HC.key, 'historyControlIndex'), box = h('div');
    if (!ctl.length) return c.note('No history is being recorded. Add a history entry under RMON alarms and history.');
    if (!ctl.some(r => r.historyControlIndex === hSel)) hSel = ctl[0].historyControlIndex;
    const show = () => {
      const k = fk(`history_ether.htm?[His_Control_Tab]Query:historyControlIndex=${hSel}[Hist_Ether_Tab]Filter:(etherHistoryIndex=${hSel})`);
      if (!data.defs.has(k)) data.def(k, 'live', { prefetch: false });
      const sel = h('select', { 'aria-label': 'History entry', onchange: e => { hSel = e.target.value; show(); } }, ctl.map(r => h('option', { value: r.historyControlIndex, selected: r.historyControlIndex === hSel },
        `#${r.historyControlIndex} · ${ifName(String(r.historyControlDataSource || '').split('.').pop())} · every ${r.historyControlInterval} s`)));
      const s = frows(k, 'etherHistorySampleIndex').filter(r => r.etherHistoryIndex === hSel);
      box.replaceChildren(sel, !data.entry(k) ? c.note('Reading…') : c.table({ rows: s.reverse(), empty: 'No samples yet.', columns: [{ label: 'Sample', num: true, get: r => r.etherHistorySampleIndex },
        { label: 'Bytes', num: true, get: r => bytes(r.etherHistoryOctets) }, { label: 'Packets', num: true, get: r => count(r.etherHistoryPkts) },
        { label: 'Broadcast', num: true, get: r => count(r.etherHistoryBroadcastPkts) }, { label: 'Multicast', num: true, get: r => count(r.etherHistoryMulticastPkts) },
        { label: 'CRC errors', num: true, get: r => count(r.etherHistoryCRCAlignErrors) }, { label: 'Collisions', num: true, get: r => count(r.etherHistoryCollisions) },
        { label: 'Drops', num: true, get: r => count(r.etherHistoryDropEvents) }, { label: 'Used', num: true, get: r => +r.etherHistoryUtilization ? Math.max(1, r.etherHistoryUtilization / 100) + ' %' : '0 %' }] }));
      if (!data.entry(k) || data.stale(k)) data.need([k], { prio: PRIO.USER }).then(() => box.isConnected && show()).catch(e => toast(e.message, true));
    };
    show();
    return box;
  },
});
}
