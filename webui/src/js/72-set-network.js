/* ---------- Settings: Network (IPv4, IPv6, DNS, DHCP server and relay, routing mode, routes, ARP) ---------- */
{ // whole file in one block: nothing leaks into the shared bundle scope
ICONS.globe = '<circle cx="8" cy="8" r="6"/><path d="M2 8h12M8 2c2 2 2.6 4 2.6 6S10 12 8 14C6 12 5.4 10 5.4 8S6 4 8 2Z"/>';
ICONS.route = '<circle cx="3.5" cy="12.5" r="1.5"/><circle cx="12.5" cy="3.5" r="1.5"/><path d="M5 12.5h4.5a2.5 2.5 0 0 0 0-5h-3a2.5 2.5 0 0 1 0-5H11"/>';
ICONS.book = '<path d="M3 2.5h8.5v11H3ZM5.5 2.5v11M7.5 5.5h2.5"/>';

/* ---- shared helpers (also used by 73-set-time-files.js) ---- */
const IP4 = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/;
const vIp = v => IP4.test(String(v || '').trim()) ? null : 'enter an IPv4 address such as 192.168.1.10';
const vIpOpt = v => !v || IP4.test(v.trim()) ? null : 'enter an IPv4 address or leave it empty';
const vIp6 = v => /^[0-9a-f:.]{2,45}$/i.test(v || '') && v.includes(':') ? null : 'enter an IPv6 address such as 2001:db8::1';
const vMac = v => /^([0-9a-f]{2}[:-]){5}[0-9a-f]{2}$/i.test(v || '') ? null : 'enter a MAC address such as 00:11:22:33:44:55';
const vRange = (lo, hi) => v => /^\d+$/.test(String(v).trim()) && +v >= lo && +v <= hi ? null : `enter a whole number from ${lo} to ${hi}`;
const vReq = v => String(v || '').trim() ? null : 'required';
const macFmt = v => String(v).toLowerCase().replace(/-/g, ':');
/* "255.255.255.0", "/24" or "24" -> dotted mask (null if invalid or not contiguous) */
function toMask(v) {
  v = String(v || '').trim().replace(/^\//, '');
  let n;
  if (/^\d{1,2}$/.test(v)) n = +v;
  else if (IP4.test(v)) { const b = v.split('.').map(x => (+x).toString(2).padStart(8, '0')).join(''); if (/01/.test(b)) return null; return v; }
  if (n == null || n > 32) return null;
  const m = n ? (0xffffffff << (32 - n)) >>> 0 : 0;
  return [24, 16, 8, 0].map(s => (m >>> s) & 255).join('.');
}
const pfxLen = m => IP4.test(m || '') ? m.split('.').map(x => (+x).toString(2)).join('').replace(/0/g, '').length : '';
const vMask = v => toMask(v) ? null : 'enter a mask such as 255.255.255.0 or a prefix length such as 24';
const routingMode = c => String((c.get('SystemGlobalSetting') || {}).systemMode || '0')[0]; // '0' L2, '1' L2+
const vlanIfs = c => c.m.vlans.map(v => ['VLAN' + v.id, `VLAN ${v.id}${v.name ? ' · ' + v.name : ''}`]);
const portIfs = c => c.m.ports.map(p => [p.name, `Port ${p.no}`]);
const ifIndexOf = (c, name) => { const m = String(name).match(/^VLAN\s*(\d+)$/i); return m ? String(99999 + +m[1]) : String(portNo(name)); }; // layer2.md: VLAN v = 99999+v, gi1/0/N = N
const onOff = v => v === '1' ? 'On' : v === '2' ? 'Off' : v;
const sec = (s, wrap) => rows(s, wrap);
/* rows of a RomPager form page table: inputs "<col>$repeat?N" -> [{_n, col: v}], only the given columns, rows that have cols[0] */
function frows(key, cols) {
  const by = {};
  for (const [k, v] of Object.entries(data.get(key) || {})) {
    const m = k.match(/^(\w+)\$(?:repeat|scalar)\?(\d+)$/);
    if (m && cols.includes(m[1])) (by[m[2]] = by[m[2]] || { _n: m[2] })[m[1]] = v;
  }
  return Object.values(by).filter(r => r[cols[0]] != null && r[cols[0]] !== '').sort((a, b) => a._n - b._n);
}
/* post a form page with every input it has (pages whose inputs are all enabled), plus overrides */
async function formAll(getPath, postPath, over, label) {
  const all = await api.form(getPath, PRIO.USER);
  for (const k of ['restoreUrl', 'errorCollector', 'mibError']) delete all[k];
  for (const k of Object.keys(all)) if (/^mibError/.test(k)) delete all[k];
  return api.formPost(postPath, { ...all, ...over }, label);
}
/* form POST with repeated field names (pairs), same checks as api.formPost */
function formPostPairs(path, pairs, label) {
  const body = [['restoreUrl', ''], ['errorCollector', ''], ...pairs].map(([k, v]) => encodeURIComponent(k) + '=' + encodeURIComponent(v == null ? '' : String(v))).join('&');
  return net.enqueue(PRIO.USER, label || 'write ' + path, async () => {
    const { text } = await net.fetch(`${BASE}/${path}`, { method: 'POST', body, headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' } });
    const err = (text.match(/name="?mibError"?[^>]*value="([^"]*)"/i) || [])[1];
    if (err) throw new SwitchError(decodeURIComponent(err.replace(/^.*Diag=/, '')).trim() || 'The switch rejected the change.');
    if (!/<form|<input|<html/i.test(text)) throw new AuthError();
    bus.emit('wrote', [{ section: 'form:' + path }]);
    return text;
  });
}
/* keys read only when a section needs them (e.g. L2+ only pages), then the section redraws */
function lazyKeys(s, keys) {
  for (const k of keys) if (!s.keys.includes(k)) s.keys.push(k); // from now on the section reads and redraws on them
  const missing = keys.filter(k => !data.entry(k));
  if (missing.length && !keys.some(k => data.inflight.has(k))) data.need(missing, { prio: PRIO.USER }).catch(e => toast(e.message, true));
  return !missing.length;
}
const fkey = path => data.def('form:' + path, 'config', { prefetch: false });
const wcdKey = (k, cls = 'config') => data.def(k, cls, { prefetch: false });
const l2plusOnly = (c, what) => [c.note(`${what} is available only in L2+ (static routing) mode. The switch is in Layer 2 mode now; see System routing mode.`),
  h('button', { class: 'btn', onclick: () => openSettings('routing-mode') }, icon('route'), 'System routing mode')];

/* ================= IPv4 address ================= */
defSettings({
  id: 'ipv4', group: 'Network', title: 'IPv4 address', icon: 'globe',
  terms: 'ip address ipv4 dhcp client static subnet mask prefix default gateway management interface addressing',
  keys: [{ key: 'IPv4InterfaceList' }, { key: 'IPv4GatewayList' }, { key: 'SystemGlobalSetting' }],
  render(c) {
    const ifs = sec(c.get('IPv4InterfaceList'), 'ifEntry'), gws = sec(c.get('IPv4GatewayList'), 'GWEntry');
    const here = location.hostname, cur = ifs.find(r => r.IPAddr === here) || ifs[0] || {};
    const sgw = gws.find(g => g.owner === '1'), gw = sgw || gws[0];
    const L2 = routingMode(c) === '0';
    const src = o => ({ 1: 'Fixed (static)', 2: 'Automatic (DHCP)', 4: 'Default' }[o] || o);
    const out = [h('div', { class: 'blk' }, h('h3', {}, cur.IPAddr === here ? 'You reach the switch at' : 'Switch address'),
      h('div', { class: 'mono', style: 'font-size:22px;margin:2px 0 12px' }, cur.IPAddr && !/^0\./.test(cur.IPAddr) ? `${cur.IPAddr}/${pfxLen(cur.subnetMask)}` : 'no address yet'),
      c.kv([['Interface', cur.interfaceName], ['Address from', src(cur.owner)], ['Mask', cur.subnetMask], L2 ? ['Default gateway', gw ? gw.IPAddr + (gw.owner === '1' ? '' : ' (from DHCP)') : 'none'] : null]))];
    const cutWarn = all => {
      if (all.owner === '2') return `You reach the switch at ${here} now. With DHCP it may get a different address and this page loses the connection; look the new one up in your router's DHCP leases.`;
      if (all.IPAddr !== cur.IPAddr && cur.IPAddr === here) return `After this the switch answers only at ${all.IPAddr}. This page tries to reopen there; if your computer is not on that network, you lose access until you reconnect from it.`;
      return 'A wrong mask or gateway can make the switch unreachable from other networks.';
    };
    if (L2) out.push(c.form({
      title: 'Change the address', help: 'In Layer 2 mode the switch has one IPv4 address.',
      values: { owner: cur.owner === '1' ? '1' : '2', IPAddr: cur.IPAddr || '', mask: cur.subnetMask || '255.255.255.0', gw: sgw ? sgw.IPAddr : '' },
      fields: [
        { k: 'owner', label: 'Address from', type: 'seg', options: [['2', 'Automatic (DHCP)'], ['1', 'Fixed (static)']] },
        { k: 'IPAddr', label: 'IP address', show: v => v.owner === '1', validate: vIp },
        { k: 'mask', label: 'Subnet mask', help: '255.255.255.0 or a prefix length such as 24', show: v => v.owner === '1', validate: vMask },
        { k: 'gw', label: 'Default gateway', help: 'The router for other networks. Leave empty for none.', validate: vIpOpt },
      ],
      danger: (ch, all) => cutWarn(all),
      apply: async (ch, all) => {
        const st = all.owner === '1', ip = st ? all.IPAddr.trim() : cur.IPAddr;
        const blocks = [{ section: 'IPv4InterfaceList', action: 'set', body: { ifEntry: { IPAddr: ip, interfaceName: cur.interfaceName || 'VLAN1', subnetMask: st ? toMask(all.mask) : cur.subnetMask, owner: all.owner } } }];
        if (all.gw) blocks.push({ section: 'IPv4GatewayList', action: 'set', body: { GWEntry: { IPAddr: all.gw.trim() } } });
        else if (sgw) blocks.push({ section: 'IPv4GatewayList', action: 'delete', body: { GWEntry: { IPAddr: sgw.IPAddr, owner: sgw.owner } } });
        const moving = st && ip !== cur.IPAddr && cur.IPAddr === here;
        try { await api.post(blocks, 'IPv4 address'); } catch (e) { if (!moving || e.auth) throw e; } // the old address may stop answering mid-request
        if (moving) { toast(`Reopening at ${ip} in 5 s…`); setTimeout(() => { location.href = `${location.protocol}//${ip}${location.pathname}`; }, 5000); }
      },
    }));
    else out.push(c.table({
      title: 'IP interfaces', help: 'In L2+ mode each VLAN can have its own address; the default gateway is a static route to 0.0.0.0/0 (see Routes).',
      rows: ifs, key: r => r.interfaceName,
      columns: [{ label: 'Interface', get: r => r.interfaceName }, { label: 'Address', get: r => h('span', { class: 'mono' }, /^0\./.test(r.IPAddr) ? '(waiting for DHCP)' : `${r.IPAddr}/${pfxLen(r.subnetMask)}`) }, { label: 'From', get: r => src(r.owner) }],
      add: { label: 'Add address', values: { ifn: (vlanIfs(c)[0] || [''])[0], owner: '1', IPAddr: '', mask: '255.255.255.0' },
        fields: [{ k: 'ifn', label: 'Interface', type: 'select', options: [...vlanIfs(c), ...portIfs(c)] },
          { k: 'owner', label: 'Address from', type: 'seg', options: [['1', 'Fixed (static)'], ['2', 'Automatic (DHCP)']] },
          { k: 'IPAddr', label: 'IP address', show: v => v.owner === '1', validate: vIp }, { k: 'mask', label: 'Subnet mask', show: v => v.owner === '1', validate: vMask }],
        apply: a => c.post('IPv4InterfaceList', { ifEntry: { IPAddr: a.owner === '1' ? a.IPAddr.trim() : '', interfaceName: a.ifn, subnetMask: a.owner === '1' ? toMask(a.mask) : '', owner: a.owner } }) },
      edit: { fields: r => [{ k: 'mask', label: 'Subnet mask', validate: vMask }, ...(r.owner === '2' ? [{ k: 'owner', label: 'Address from', type: 'seg', options: [['2', 'Automatic (DHCP)'], ['1', 'Keep this address fixed']] }] : [])],
        values: r => ({ mask: r.subnetMask, owner: r.owner }),
        apply: (ch, a, r) => c.post('IPv4InterfaceList', { ifEntry: { IPAddr: r.IPAddr, interfaceName: r.interfaceName, subnetMask: toMask(a.mask), owner: a.owner } }) },
      remove: { confirm: r => r.IPAddr === here ? `This is the address you reach the switch at (${here}). Removing it cuts this connection.` : `Remove ${r.IPAddr} from ${r.interfaceName}?`,
        apply: r => c.post('IPv4InterfaceList', { ifEntry: { IPAddr: r.IPAddr, interfaceName: r.interfaceName, owner: r.owner } }, 'delete') },
    }));
    return out;
  },
});

/* ================= IPv6 ================= */
const v6zone = n => { const s = String(n || '').replace(/\s/g, ''); const m = s.match(/^vlan(\d+)$/i); return m ? 'vlan' + m[1] : /^(po|lag)/i.test(s) ? 'po' + s.replace(/\D/g, '') : /tunnel/i.test(s) ? 'tunnel1' : s.toLowerCase(); };
const INF = '4294967295';
defSettings({
  id: 'ipv6', group: 'Network', title: 'IPv6', icon: 'globe',
  terms: 'ipv6 interface address link local global unicast anycast default gateway dhcpv6 stateless autoconfiguration dad icmp rate limit hop limit',
  keys: ['IPv6GlobalSetting', 'IPv6InterfaceList', 'DHCPv6ClientInterfaceList', 'IPv6AddressList', 'IPv6RouteList', 'SystemGlobalSetting'],
  render(c) {
    const g = c.get('IPv6GlobalSetting') || {}, routing = 'unicastRoutingEnable' in g;
    const ifs = sec(c.get('IPv6InterfaceList'), 'InterfaceEntry'), dh = sec(c.get('DHCPv6ClientInterfaceList'), 'Entry');
    const addrs = sec(c.get('IPv6AddressList'), 'IPv6addressEntry'), routes = sec(c.get('IPv6RouteList'), 'Entry');
    const gws = routes.filter(r => (r.destinationIPv6Address === '::' || r.destinationIPv6Address === '') && +r.destinationPrefixLength === 0);
    const L2p = routingMode(c) === '1', ifOpts = ifs.map(r => [r.interfaceName, r.interfaceName]);
    const dhOf = n => dh.find(d => d.interfaceName === n) || {};
    const ATYPE = { 1: 'Link local', 2: 'Global', 3: 'Anycast', 4: 'Multicast' };
    const ifFields = add => [
      add ? { k: 'ifn', label: 'Interface', type: 'select', options: [...vlanIfs(c), ...portIfs(c)] } : null,
      { k: 'statelessAutoconfigEnable', label: 'Autoconfiguration', help: 'Build addresses from router advertisements (SLAAC)', type: 'toggle' },
      { k: 'DADAttemptsNo', label: 'Duplicate address checks (DAD)', help: '0 turns the check off', type: 'number', min: 0, max: 600, validate: vRange(0, 600) },
      { k: 'ICMPUnreachSendEnable', label: 'Send ICMP unreachable', type: 'toggle' },
      L2p ? { k: 'redirectEnable', label: 'Send ICMP redirects', type: 'toggle' } : null,
      { k: 'statelessEnable', label: 'DHCPv6 client (stateless)', help: 'Ask a DHCPv6 server for DNS and other options', type: 'toggle' },
      { k: 'refreshTime', label: 'Information refresh', unit: 's', help: '86400–4294967294, or "infinite"', show: v => v.statelessEnable === '1',
        validate: v => /^inf/i.test(v) || (+v >= 86400 && +v <= 4294967294) ? null : 'enter 86400–4294967294 or infinite' },
      { k: 'refreshTimeMinimum', label: 'Minimum refresh', unit: 's', help: '600–4294967294, or "infinite"; not more than the refresh above', show: v => v.statelessEnable === '1',
        validate: (v, a) => /^inf/i.test(v) || (+v >= 600 && +v <= 4294967294 && (/^inf/i.test(a.refreshTime) || +v <= +a.refreshTime)) ? null : 'enter 600–4294967294 (not above the refresh) or infinite' },
    ].filter(Boolean);
    const infOut = v => /^inf/i.test(v) ? '9'.repeat(20) : String(v).trim();
    const ifVals = (r, d) => ({ statelessAutoconfigEnable: r.statelessAutoconfigEnable || '1', DADAttemptsNo: r.DADAttemptsNo || '1', ICMPUnreachSendEnable: r.ICMPUnreachSendEnable || '1',
      redirectEnable: r.redirectEnable || '1', statelessEnable: d.statelessEnable || '2', refreshTime: d.refreshTime === INF ? 'infinite' : d.refreshTime || '86400',
      refreshTimeMinimum: d.refreshTimeMinimum === INF ? 'infinite' : d.refreshTimeMinimum || '86400' });
    const ifWrite = (name, id, a) => {
      const n = name.replace(/\s/g, ''), st = a.statelessEnable === '1';
      const minFirst = st && !/^inf/i.test(a.refreshTimeMinimum) && +a.refreshTimeMinimum >= 600 && +a.refreshTimeMinimum <= 86400;
      const e = x => ({ interfaceName: n, statelessEnable: a.statelessEnable, ...x });
      const mn = { refreshTimeMinimum: infOut(a.refreshTimeMinimum) }, rt = { refreshTime: infOut(a.refreshTime) };
      return api.post([{ section: 'DHCPv6ClientInterfaceList', action: 'set', body: { Entry: st ? (minFirst ? [e(mn), e(rt)] : [e(rt), e(mn)]) : [e({}), e({})] } },
        { section: 'IPv6InterfaceList', action: 'set', body: { InterfaceEntry: { interfaceType: null, interfaceName: n, interfaceID: id, DADAttemptsNo: a.DADAttemptsNo,
          statelessAutoconfigEnable: a.statelessAutoconfigEnable, ICMPUnreachSendEnable: a.ICMPUnreachSendEnable, redirectEnable: L2p ? a.redirectEnable : undefined } } }], 'IPv6 interface');
    };
    return [
      c.kv([['IPv6 interfaces', ifs.length ? ifs.map(r => r.interfaceName).join(', ') : 'none (IPv6 is off)'], ['Hop limit', g.hopLimit], ['Routing', routing ? onOff(g.unicastRoutingEnable) : null]]),
      c.form({
        title: 'Global settings',
        values: { ICMPErrorRateLimitInterval: g.ICMPErrorRateLimitInterval, ICMPErrorRateLimitBucketSize: g.ICMPErrorRateLimitBucketSize, unicastRoutingEnable: g.unicastRoutingEnable, hopLimit: g.hopLimit,
          linkLocalDefaultZoneIfName: !g.linkLocalDefaultZoneIfName || /^none$/i.test(g.linkLocalDefaultZoneIfName) ? 'None' : g.linkLocalDefaultZoneIfName },
        fields: [
          { k: 'ICMPErrorRateLimitInterval', label: 'ICMPv6 error rate limit interval', unit: 'ms', type: 'number', help: '0 = no limit', validate: vRange(0, 2147483647) },
          { k: 'ICMPErrorRateLimitBucketSize', label: 'ICMPv6 errors per interval', type: 'number', validate: vRange(1, 200) },
          ...(routing ? [{ k: 'unicastRoutingEnable', label: 'IPv6 routing', type: 'toggle' }, { k: 'hopLimit', label: 'Hop limit', type: 'number', validate: vRange(1, 255) },
            { k: 'linkLocalDefaultZoneIfName', label: 'Default zone for link-local addresses', type: 'select', options: [['None', 'None'], ...ifOpts] }] : []),
        ],
        apply: (ch, a) => c.post('IPv6GlobalSetting', routing ? { ICMPErrorRateLimitInterval: a.ICMPErrorRateLimitInterval, ICMPErrorRateLimitBucketSize: a.ICMPErrorRateLimitBucketSize,
          unicastRoutingEnable: a.unicastRoutingEnable, linkLocalDefaultZoneIfName: a.linkLocalDefaultZoneIfName, hopLimit: a.hopLimit }
          : { ICMPErrorRateLimitInterval: a.ICMPErrorRateLimitInterval, ICMPErrorRateLimitBucketSize: a.ICMPErrorRateLimitBucketSize }),
      }),
      c.table({
        title: 'IPv6 interfaces', help: 'Adding an interface turns IPv6 on there and gives it a link-local address.', rows: ifs, key: r => r.interfaceName, empty: 'No IPv6 interfaces.',
        columns: [{ label: 'Interface', get: r => r.interfaceName }, { label: 'Autoconfig', get: r => onOff(r.statelessAutoconfigEnable) }, { label: 'DAD', get: r => r.DADAttemptsNo, num: true },
          { label: 'ICMP unreachable', get: r => onOff(r.ICMPUnreachSendEnable) }, { label: 'DHCPv6', get: r => onOff(dhOf(r.interfaceName).statelessEnable) }],
        add: { label: 'Add interface', fields: ifFields(true), values: { ifn: (vlanIfs(c)[0] || [''])[0], ...ifVals({}, {}) },
          apply: a => ifWrite(a.ifn, /^VLAN/i.test(a.ifn) ? '-1' : ifIndexOf(c, a.ifn), a) },
        edit: { fields: () => ifFields(false), values: r => ifVals(r, dhOf(r.interfaceName)), apply: (ch, a, r) => ifWrite(r.interfaceName, r.interfaceID, a) },
        remove: { confirm: r => `Turn IPv6 off on ${r.interfaceName}? Its addresses and neighbours go too.`, apply: r => {
          const d = dhOf(r.interfaceName);
          return api.post([{ section: 'IPv6InterfaceList', action: 'delete', body: { InterfaceEntry: { interfaceName: r.interfaceName, interfaceID: r.interfaceID, interfaceType: r.interfaceType, DADAttemptsNo: r.DADAttemptsNo,
            statelessAutoconfigEnable: r.statelessAutoconfigEnable, ICMPUnreachSendEnable: r.ICMPUnreachSendEnable } } },
          { section: 'DHCPv6ClientInterfaceList', action: 'delete', body: { Entry: { interfaceName: r.interfaceName, interfaceType: d.interfaceType, statelessEnable: d.statelessEnable,
            reconfigureEnable: d.reconfigureEnable, refreshTimeMinimum: d.refreshTimeMinimum, refreshTime: d.refreshTime } } }], 'IPv6 interface');
        } },
      }),
      c.table({
        title: 'Addresses', rows: addrs, key: r => r.IPv6Address, empty: ifs.length ? 'No addresses yet.' : 'Add an IPv6 interface first.',
        columns: [{ label: 'Interface', get: r => r.interfaceName }, { label: 'Address', get: r => h('span', { class: 'mono' }, r.IPv6Address + (r.prefixLength && r.type !== '1' ? '/' + r.prefixLength : '')) },
          { label: 'Type', get: r => ATYPE[r.type] || r.type }],
        add: ifs.length ? { label: 'Add address', values: { ifn: ifOpts[0][0], type: '2', IPv6Address: '', prefixLength: '64' },
          fields: [{ k: 'ifn', label: 'Interface', type: 'select', options: ifOpts }, { k: 'type', label: 'Type', type: 'seg', options: [['1', 'Link local'], ['2', 'Global'], ['3', 'Anycast']] },
            { k: 'IPv6Address', label: 'Address', validate: (v, a) => vIp6(v) || (a.type === '1' && !/^fe80/i.test(v) ? 'a link-local address starts with fe80' : null) },
            { k: 'prefixLength', label: 'Prefix length', type: 'number', show: v => v.type !== '1', validate: vRange(3, 128) }],
          apply: a => c.post('IPv6AddressList', { IPv6addressEntry: { interfaceName: a.ifn, type: a.type, IPv6Address: a.IPv6Address.trim(), prefixLength: a.type === '1' ? null : a.prefixLength } }) } : undefined,
        remove: { apply: r => { if (r.origin === '5') throw new Error('This address is created automatically and cannot be removed.');
          return c.post('IPv6AddressList', { IPv6addressEntry: { interfaceName: r.interfaceName, type: r.type, IPv6Address: r.IPv6Address, prefixLength: r.prefixLength } }, 'delete'); } },
      }),
      c.table({
        title: 'Default gateway', help: 'Routers learned from advertisements appear here too; only the ones you added can be removed.', rows: gws, key: r => r.nextHopIPv6Address, empty: 'No IPv6 default gateway.',
        columns: [{ label: 'Router', get: r => h('span', { class: 'mono' }, r.nextHopIPv6Address) }, { label: 'Interface', get: r => r.interfaceName }, { label: 'Learned', get: r => r.routeType === '3' ? 'Added by you' : 'Automatic' }, { label: 'Metric', get: r => r.metric, num: true }],
        add: ifs.length ? { label: 'Add gateway', values: { ll: '1', ifn: ifOpts[0][0], addr: '', metric: '' },
          fields: [{ k: 'll', label: 'Address type', type: 'seg', options: [['1', 'Link local'], ['2', 'Global']] }, { k: 'ifn', label: 'Interface', type: 'select', options: ifOpts, show: v => v.ll === '1' },
            { k: 'addr', label: 'Router address', validate: vIp6 }, { k: 'metric', label: 'Metric', type: 'number', help: 'optional, 1–65535', validate: v => !v || !vRange(1, 65535)(v) ? null : 'enter 1–65535 or leave empty' }],
          apply: a => api.post({ section: 'IPv6RouteList', action: 'add', body: { Entry: { destinationIPv6Address: '::', destinationPrefixLength: '0', isPointToPoint: '2',
            nextHopIPv6Address: a.addr.trim() + (a.ll === '1' ? '%' + v6zone(a.ifn) : ''), metric: a.metric || null } } }, 'IPv6 gateway') } : undefined,
        remove: { apply: r => { if (r.routeType !== '3') throw new Error('Only gateways you added can be removed.');
          const nh = /^fe80/i.test(r.nextHopIPv6Address) && !r.nextHopIPv6Address.includes('%') ? r.nextHopIPv6Address + '%' + v6zone(r.interfaceName) : r.nextHopIPv6Address;
          return c.post('IPv6RouteList', { Entry: { interfaceName: r.interfaceName, nextHopIPv6Address: nh, destinationIPv6Address: '::', destinationPrefixLength: '0', isPointToPoint: '2' } }, 'delete'); } },
      }),
    ];
  },
});

defSettings({
  id: 'ipv6-nbr', group: 'Network', title: 'IPv6 neighbours', icon: 'dev', terms: 'ipv6 neighbors neighbours neighbor discovery nd cache static mac',
  keys: [{ key: 'IPv6NeighborList', cls: 'live' }, 'IPv6InterfaceList'],
  render(c) {
    const ns = sec(c.get('IPv6NeighborList'), 'NeighborEntry'), ifOpts = sec(c.get('IPv6InterfaceList'), 'InterfaceEntry').map(r => [r.interfaceName, r.interfaceName]);
    const TYPE = { 1: 'Other', 2: 'Invalid', 3: 'Dynamic', 4: 'Static', 5: 'Local' }, STATE = ['Unreachable', 'Reachable', 'Stale', 'Delay', 'Probe', 'Invalid', 'Unknown', 'Incomplete'];
    const ent = (r, x) => ({ NeighborEntry: { interfaceName: r.interfaceName, IPv6Address: r.IPv6Address, MACAddress: r.MACAddress, type: r.type, ...x } });
    return c.table({
      help: 'The IPv6 equivalent of the ARP table. Up to 64 entries.', rows: ns, key: r => r.IPv6Address, empty: ifOpts.length ? 'No neighbours known.' : 'IPv6 is off (no IPv6 interfaces).',
      columns: [{ label: 'Interface', get: r => r.interfaceName }, { label: 'IPv6 address', get: r => h('span', { class: 'mono' }, r.IPv6Address) }, { label: 'MAC', get: r => h('span', { class: 'mono' }, r.MACAddress) },
        { label: 'Type', get: r => TYPE[r.type] || r.type }, { label: 'State', get: r => r.type === '4' ? '—' : STATE[+r.state] || r.state }, { label: 'Router', get: r => r.type === '4' ? '—' : r.isRouter === '1' ? 'Yes' : 'No' }],
      add: ifOpts.length ? { label: 'Add static neighbour', values: { ifn: ifOpts[0][0], IPv6Address: '', MACAddress: '' },
        fields: [{ k: 'ifn', label: 'Interface', type: 'select', options: ifOpts }, { k: 'IPv6Address', label: 'IPv6 address', validate: vIp6 }, { k: 'MACAddress', label: 'MAC address', validate: vMac }],
        apply: a => c.post('IPv6NeighborList', { NeighborEntry: { interfaceName: a.ifn.replace(/\s/g, ''), IPv6Address: a.IPv6Address.trim(), MACAddress: macFmt(a.MACAddress), type: '4' } }) } : undefined,
      edit: { fields: r => [{ k: 'MACAddress', label: 'MAC address', validate: vMac, type: r.type === '4' ? 'text' : 'static' }, r.type === '4' ? null : { k: 'type', label: 'Type', type: 'seg', options: [['3', 'Dynamic'], ['4', 'Make static']] }].filter(Boolean),
        values: r => ({ MACAddress: r.MACAddress, type: r.type }),
        apply: (ch, a, r) => a.type === '3' && r.type === '3' ? null : api.post([{ section: 'IPv6NeighborList', action: 'delete', body: ent(r) },
          { section: 'IPv6NeighborList', action: 'set', body: ent(r, { interfaceName: r.interfaceName.replace(/\s/g, ''), MACAddress: macFmt(a.MACAddress), type: a.type }) }], 'IPv6 neighbour') },
      remove: { apply: r => { if (r.type === '3') throw new Error('Dynamic entries cannot be removed; they age out by themselves.');
        return c.post('IPv6NeighborList', { NeighborEntry: { interfaceName: r.interfaceName, IPv6Address: r.IPv6Address } }, 'delete'); } },
    });
  },
});

/* ================= DNS ================= */
defSettings({
  id: 'dns', group: 'Network', title: 'DNS', icon: 'book', terms: 'dns name server resolver domain name host name mapping static hosts lookup',
  keys: ['DNSGlobalSetting', 'NameServerList', 'StaticHostNameToAddrList'],
  render(c) {
    const g = c.get('DNSGlobalSetting') || {}, ns = sec(c.get('NameServerList'), 'Entry').sort((a, b) => a.preference - b.preference);
    const act = ns.find(r => r.owner === '1') || ns.find(r => r.owner === '2');
    const hosts = Object.values(sec(c.get('StaticHostNameToAddrList'), 'Entry').reduce((o, e) => { (o[e.hostName] = o[e.hostName] || { hostName: e.hostName, entries: [] }).entries.push(e); return o; }, {}));
    const reprefer = r => c.post('NameServerList', { Entry: ns.map(e => ({ IPAddr: e.IPAddr, addrType: e.addrType, preference: e === r ? '1' : String(+e.preference + 1), owner: e.owner })) });
    return [
      c.kv([['Name lookups', onOff(g.enbl)], ['Default domain', g.domainName], ['Server in use', act ? act.IPAddr + (act.owner === '2' ? ' (from DHCP)' : '') : 'none']]),
      c.form({
        title: 'Settings', values: { enbl: g.enbl, domainName: g.domainName || '', domainNameQueryInterval: g.domainNameQueryInterval || '8' },
        fields: [{ k: 'enbl', label: 'Name lookups (DNS client)', help: 'Lets the switch resolve names, e.g. for SNTP servers and ping', type: 'toggle' },
          { k: 'domainName', label: 'Default domain', placeholder: 'e.g. home.lan', help: 'Added to names without a domain', validate: v => !v || /^[A-Za-z0-9.-]{1,158}$/.test(v) ? null : 'letters, digits, dots and dashes, up to 158' },
          { k: 'domainNameQueryInterval', label: 'Retry interval', unit: 's', type: 'number', help: 'Default 8', validate: vRange(8, 3600) }],
        // the classic page restores the defaults first, then sets what is given (fields left out fall back to defaults)
        apply: (ch, a) => api.post([{ section: 'DNSGlobalSetting', action: 'restore', body: { domainName: null, enbl: null, domainNameOwner: null, domainNameQueryInterval: null } },
          { section: 'DNSGlobalSetting', action: 'set', body: { domainName: a.domainName || undefined, enbl: a.enbl, domainNameQueryInterval: String(a.domainNameQueryInterval) === '8' ? undefined : a.domainNameQueryInterval } }], 'DNS'),
      }),
      c.table({
        title: 'Name servers', help: 'The switch asks the server in use first. Up to 8.', rows: ns, key: r => r.IPAddr, max: 8, empty: 'No name servers.',
        columns: [{ label: 'Server', get: r => h('span', { class: 'mono' }, r.IPAddr) }, { label: 'From', get: r => r.owner === '2' ? 'DHCP' : 'Added by you' },
          { label: 'In use', get: r => r === act ? h('span', { class: 'cell' }, h('i', { class: 'led lg' }), ' in use') : '' }],
        add: { label: 'Add name server', values: { IPAddr: '' }, fields: [{ k: 'IPAddr', label: 'Server address', help: 'IPv4 or IPv6', validate: v => vIp(v) && vIp6(v) ? 'enter an IPv4 or IPv6 address' : null }],
          apply: a => c.post('NameServerList', { Entry: [...ns.map(e => ({ IPAddr: e.IPAddr, addrType: e.addrType, preference: e.preference, owner: e.owner })),
            { IPAddr: a.IPAddr.trim(), addrType: a.IPAddr.includes(':') ? '2' : '1', preference: String(Math.max(0, ...ns.map(e => +e.preference || 0)) + 1), owner: '1' }] }) },
        edit: { fields: r => [{ k: 'first', label: 'Use this server first', type: 'toggle', help: r === act ? 'It is in use now.' : '' }], values: r => ({ first: r === act ? '1' : '2' }),
          apply: (ch, a, r) => a.first === '1' && r !== act ? reprefer(r) : null },
        remove: { apply: r => { if (r.owner === '2') throw new Error('This server comes from DHCP and cannot be removed here.'); return c.post('NameServerList', { Entry: { IPAddr: r.IPAddr } }, 'delete'); } },
      }),
      c.table({
        title: 'Host names', help: 'Fixed name → address entries the switch uses before asking a name server.', rows: hosts, key: r => r.hostName, empty: 'No host names.',
        columns: [{ label: 'Name', get: r => r.hostName }, { label: 'Addresses', get: r => h('span', { class: 'mono' }, r.entries.map(e => e.IPAddr).join(', ')) }],
        add: { label: 'Add host name', values: { hostName: '', ips: '' },
          fields: [{ k: 'hostName', label: 'Name', validate: v => /^[A-Za-z0-9.-]{1,158}$/.test(v || '') ? null : 'letters, digits, dots and dashes' },
            { k: 'ips', label: 'Addresses', help: 'Up to 8, separated by commas; IPv4 or IPv6',
              validate: v => { const l = String(v || '').split(/[\s,]+/).filter(Boolean); return !l.length || l.length > 8 ? 'enter 1 to 8 addresses' : l.some(x => vIp(x) && vIp6(x)) ? 'one of the addresses is not valid' : null; } }],
          apply: a => c.post('StaticHostNameToAddrList', { Entry: a.ips.split(/[\s,]+/).filter(Boolean).map(ip => ({ hostName: a.hostName.trim(), owner: '1', addrType: !ip.includes(':') ? '1' : /^fe80/i.test(ip) ? '3' : '2', IPAddr: ip })) }) },
        remove: { confirm: r => `Remove ${r.hostName} and all its addresses?`, apply: r => c.post('StaticHostNameToAddrList', { Entry: r.entries.map(e => ({ ...e })) }, 'delete') },
      }),
    ];
  },
});

/* ================= DHCP server ================= */
const NBT = [['', 'None'], ['1', 'Broadcast (B-node)'], ['2', 'Peer-to-peer (P-node)'], ['4', 'Mixed (M-node)'], ['8', 'Hybrid (H-node)']];
const DHCP_OPTS = [
  { k: 'router', label: 'Default gateway (option 3)', validate: vIpOpt }, { k: 'dns', label: 'DNS server (option 6)', validate: vIpOpt },
  { k: 'domainName', label: 'Domain name (option 15)', validate: v => !v || v.length <= 32 ? null : 'up to 32 characters' },
  { k: 'time', label: 'Time server (option 4)', validate: vIpOpt }, { k: 'nbns', label: 'WINS server (option 44)', validate: vIpOpt },
  { k: 'NetBIOSType', label: 'NetBIOS node type (option 46)', type: 'select', options: NBT },
  { k: 'nxtSrvIPAddr', label: 'Boot server address (next server)', validate: vIpOpt },
  { k: 'nxtSrvName', label: 'Boot server name (option 66)', validate: v => !v || v.length <= 32 ? null : 'up to 32 characters' },
  { k: 'bootfileName', label: 'Boot file (option 67)', validate: v => !v || v.length <= 32 ? null : 'up to 32 characters' },
];
const first = (r, list, ent, f) => (arr((r[list] || {})[ent])[0] || {})[f] || '';
const dhcpOptVals = r => ({ router: first(r, 'RoutersList', 'RoutersEntry', 'routerIpAddr'), dns: first(r, 'DNSSrvList', 'DNSSrvEntry', 'DNSSrvIpAddr'), time: first(r, 'TimeSrvList', 'TimeSrvEntry', 'timeSrvIpAddr'),
  nbns: first(r, 'NetBIOSNameSrvList', 'NetBIOSNameSrvEntry', 'NetBIOSNameSrvIpAddr'), domainName: r.domainName || '', NetBIOSType: r.NetBIOSType || '', nxtSrvIPAddr: r.nxtSrvIPAddr || '', nxtSrvName: r.nxtSrvName || '', bootfileName: r.bootfileName || '' });
const dhcpOptBody = a => ({ nxtSrvIPAddr: a.nxtSrvIPAddr || '', nxtSrvName: a.nxtSrvName || '', bootfileName: a.bootfileName || '', domainName: a.domainName || '', NetBIOSType: a.NetBIOSType || '',
  RoutersList: { RoutersEntry: { routerIpAddr: a.router || '' } }, TimeSrvList: { TimeSrvEntry: { timeSrvIpAddr: a.time || '' } },
  DNSSrvList: { DNSSrvEntry: { DNSSrvIpAddr: a.dns || '' } }, NetBIOSNameSrvList: { NetBIOSNameSrvEntry: { NetBIOSNameSrvIpAddr: a.nbns || '' } } });
const leaseText = s => s === INF ? 'infinite' : (() => { const d = Math.floor(s / 86400), hh = Math.floor(s % 86400 / 3600), mm = Math.floor(s % 3600 / 60); return [d && d + ' d', hh && hh + ' h', mm && mm + ' min'].filter(Boolean).join(' ') || '0'; })();
defSettings({
  id: 'dhcp-server', group: 'Network', title: 'DHCP server', icon: 'dev',
  terms: 'dhcp server pool network pool lease static hosts reservation excluded addresses address binding option 66 67',
  keys: ['DHCPSrvGlobalSetting', 'DHCPSrvNetworkPoolList', 'DHCPSrvHostPoolList', 'DHCPSrvExcludedNetworkList', { key: 'DHCPSrvBindingList', cls: 'live' }],
  render(c) {
    const g = c.get('DHCPSrvGlobalSetting') || {}, pools = sec(c.get('DHCPSrvNetworkPoolList'), 'Entry'), hosts = sec(c.get('DHCPSrvHostPoolList'), 'Entry');
    const excl = sec(c.get('DHCPSrvExcludedNetworkList'), 'Entry'), binds = sec(c.get('DHCPSrvBindingList'), 'Entry');
    const poolFields = add => [add ? { k: 'poolName', label: 'Pool name', validate: v => /^\S{1,32}$/.test(v || '') ? null : '1–32 characters, no spaces' } : null,
      { k: 'loIPAddr', label: 'First address', validate: vIp }, { k: 'hiIPAddr', label: 'Last address', validate: vIp }, { k: 'subnetMask', label: 'Subnet mask', validate: vMask },
      { k: 'inf', label: 'Lease never expires', type: 'toggle' },
      { k: 'ld', label: 'Lease days', type: 'number', show: v => v.inf !== '1', validate: vRange(0, 49710) }, { k: 'lh', label: 'Lease hours', type: 'number', show: v => v.inf !== '1', validate: vRange(0, 23) },
      { k: 'lm', label: 'Lease minutes', type: 'number', show: v => v.inf !== '1', validate: vRange(0, 59) }, ...DHCP_OPTS].filter(Boolean);
    const poolVals = r => { const s = +r.leaseTime || 86400; return { poolName: r.poolName || '', loIPAddr: r.loIPAddr || '', hiIPAddr: r.hiIPAddr || '', subnetMask: r.subnetMask || '255.255.255.0',
      inf: r.leaseTime === INF ? '1' : '2', ld: String(Math.floor(s / 86400)), lh: String(Math.floor(s % 86400 / 3600)), lm: String(Math.floor(s % 3600 / 60)), ...dhcpOptVals(r) }; };
    const poolBody = (name, a) => ({ Entry: { poolName: name, subnetMask: toMask(a.subnetMask), loIPAddr: a.loIPAddr.trim(), hiIPAddr: a.hiIPAddr.trim(),
      leaseTime: a.inf === '1' ? INF : String(a.ld * 86400 + a.lh * 3600 + a.lm * 60), ...dhcpOptBody(a) } });
    const hostFields = add => [add ? { k: 'poolName', label: 'Name', help: '1–32 characters', validate: v => /^\S{1,32}$/.test(v || '') ? null : '1–32 characters, no spaces' } : null,
      { k: 'IPAddr', label: 'Address it gets', validate: vIp, type: add ? 'text' : 'static' }, { k: 'subnetMask', label: 'Subnet mask', validate: vMask },
      { k: 'clientIDType', label: 'Identify the device by', type: 'seg', options: [['1', 'MAC address'], ['2', 'Client identifier']] },
      { k: 'clientID', label: 'MAC address or client identifier', help: 'Client identifier in hex, e.g. 01b60819681172', validate: (v, a) => a.clientIDType === '1' ? vMac(v) : /^[0-9a-f]{2,}$/i.test(v || '') ? null : 'hex digits' },
      { k: 'hostName', label: 'Client name', help: 'Optional, without domain', validate: v => !v || v.length <= 32 ? null : 'up to 32 characters' }, ...DHCP_OPTS].filter(Boolean);
    const hostVals = r => ({ poolName: r.poolName || '', IPAddr: r.IPAddr || '', subnetMask: r.subnetMask || '255.255.255.0', clientIDType: r.clientIDType || '1', clientID: r.clientID || '', hostName: r.hostName || '', ...dhcpOptVals(r) });
    const hostEntry = (name, a) => ({ Entry: { poolName: name, IPAddr: a.IPAddr.trim(), subnetMask: toMask(a.subnetMask), clientIDType: a.clientIDType,
      clientID: a.clientIDType === '1' ? macFmt(a.clientID) : a.clientID, hostName: a.hostName || '', ...dhcpOptBody(a) } });
    const BT = { 1: 'Reserved', 2: 'Automatic', 3: 'Dynamic' };
    return [
      c.kv([['DHCP server', onOff(g.enbl)], ['Leases in use', g.activeEntriesNum != null ? `${g.activeEntriesNum} of ${g.maxClientsNum}` : '']]),
      c.form({ values: { enbl: g.enbl }, fields: [{ k: 'enbl', label: 'DHCP server', help: 'Hand out addresses from the pools below', type: 'toggle' }],
        danger: (ch, a) => a.enbl === '1' ? 'If another DHCP server already serves this network (usually your router), devices may get addresses from the wrong one and lose their connection.' : 'Devices that get addresses from this switch will lose them when their leases run out.',
        apply: (ch, a) => c.post('DHCPSrvGlobalSetting', { enbl: a.enbl }) }),
      c.table({ title: 'Address pools', rows: pools, key: r => r.poolName, empty: 'No pools.',
        columns: [{ label: 'Pool', get: r => r.poolName }, { label: 'Range', get: r => h('span', { class: 'mono' }, `${r.loIPAddr} – ${r.hiIPAddr}/${pfxLen(r.subnetMask)}`) },
          { label: 'Lease', get: r => leaseText(r.leaseTime) }, { label: 'Leased', get: r => r.totalAddrNum ? `${+r.totalAddrNum - +r.freeAddrNum} of ${r.totalAddrNum}` : '', num: true }],
        add: { label: 'Add pool', fields: poolFields(true), values: poolVals({}), apply: a => c.post('DHCPSrvNetworkPoolList', poolBody(a.poolName.trim(), a)) },
        edit: { fields: () => poolFields(false), values: poolVals, apply: (ch, a, r) => c.post('DHCPSrvNetworkPoolList', poolBody(r.poolName, a)) },
        remove: { apply: r => c.post('DHCPSrvNetworkPoolList', { Entry: { poolName: r.poolName } }, 'delete') } }),
      c.table({ title: 'Reserved addresses (static hosts)', help: 'A device always gets the same address.', rows: hosts, key: r => r.poolName, empty: 'No reservations.',
        columns: [{ label: 'Name', get: r => r.poolName }, { label: 'Address', get: r => h('span', { class: 'mono' }, r.IPAddr) }, { label: 'Device', get: r => h('span', { class: 'mono' }, r.clientID) }],
        add: { label: 'Add reservation', fields: hostFields(true), values: hostVals({}), apply: a => c.post('DHCPSrvHostPoolList', hostEntry(a.poolName.trim(), a)) },
        edit: { fields: () => hostFields(false), values: hostVals,
          apply: (ch, a, r) => api.post([{ section: 'DHCPSrvHostPoolList', action: 'delete', body: { Entry: { poolName: r.poolName } } },
            { section: 'DHCPSrvHostPoolList', action: 'set', body: hostEntry(r.poolName, { ...a, IPAddr: r.IPAddr }) }], 'DHCP reservation') },
        remove: { apply: r => c.post('DHCPSrvHostPoolList', { Entry: { poolName: r.poolName, IPAddr: r.IPAddr } }, 'delete') } }),
      c.table({ title: 'Excluded addresses', help: 'Never handed out, e.g. addresses set by hand on servers.', rows: excl, key: r => `${r.loIPAddr}–${r.hiIPAddr}`, empty: 'None.',
        columns: [{ label: 'From', get: r => h('span', { class: 'mono' }, r.loIPAddr) }, { label: 'To', get: r => h('span', { class: 'mono' }, r.hiIPAddr) }],
        add: { label: 'Exclude a range', values: { loIPAddr: '', hiIPAddr: '' }, fields: [{ k: 'loIPAddr', label: 'From', validate: vIp },
          { k: 'hiIPAddr', label: 'To', validate: (v, a) => vIp(v) || (a.loIPAddr.split('.').reduce((s, x) => s * 256 + +x, 0) > v.split('.').reduce((s, x) => s * 256 + +x, 0) ? 'must not be below From' : null) }],
          apply: a => c.post('DHCPSrvExcludedNetworkList', { Entry: { loIPAddr: a.loIPAddr.trim(), hiIPAddr: a.hiIPAddr.trim() } }) },
        remove: { apply: r => c.post('DHCPSrvExcludedNetworkList', { Entry: { poolName: r.poolName, loIPAddr: r.loIPAddr, hiIPAddr: r.hiIPAddr } }, 'delete') } }),
      c.table({ title: 'Leases (address bindings)', rows: binds, key: r => r.IPAddr, empty: 'No addresses handed out.',
        columns: [{ label: 'Address', get: r => h('span', { class: 'mono' }, r.IPAddr) }, { label: 'Device', get: r => h('span', { class: 'mono' }, r.clientID) },
          { label: 'Expires', get: r => r.leaseExpiration }, { label: 'Type', get: r => BT[r.type] || r.type }],
        remove: { label: 'Release', confirm: r => `Release ${r.IPAddr}? The device must ask for a new address.`,
          apply: r => { if (r.type === '1') throw new Error('This is a reservation; remove it under Reserved addresses.'); return c.post('DHCPSrvBindingList', { Entry: { IPAddr: r.IPAddr } }, 'delete'); } } }),
    ];
  },
});

/* ================= DHCP relay and UDP relay (L2+ only) ================= */
const RELAY = { srv: fkey('API/dhcp_relays_table.htm'), o82: fkey('API/dhcp_relays.htm'), ifs: fkey('API/dhcp_int_settings.htm'), udp: fkey('API/udp_relay_table.htm') };
const RELAY_BM = ['PortList', 'VlanId1To1024', 'VlanId1025To2048', 'VlanId2049To3072', 'VlanId3073To4094'].map(s => 'rlDhcpRelayInterfaceList' + s + '$query');
const hexBits = hex => [...String(hex || '').trim()].map(ch => (parseInt(ch, 16) || 0).toString(2).padStart(4, '0')).join('');
const bitsHex = bits => { while (bits.length % 8) bits += '0'; let o = ''; for (let i = 0; i < bits.length; i += 4) o += parseInt(bits.slice(i, i + 4), 2).toString(16); return o; };
const setBit = (hex, i, on) => { let b = hexBits(hex); while (b.length <= i) b += '0'; return bitsHex(b.slice(0, i) + (on ? '1' : '0') + b.slice(i + 1)); };
const relaySec = defSettings({
  id: 'dhcp-relay', group: 'Network', title: 'DHCP and UDP relay', icon: 'route',
  terms: 'dhcp relay helper address option 82 insertion udp relay forward broadcast ip helper',
  keys: [{ key: 'SystemGlobalSetting' }],
  render(c) {
    if (routingMode(c) !== '1') return l2plusOnly(c, 'Relaying DHCP and UDP broadcasts between VLANs');
    if (!lazyKeys(relaySec, Object.values(RELAY))) return c.note('Reading relay settings…');
    const F = k => data.get(k) || {};
    const srvs = frows(RELAY.srv, ['rlDhcpRelayNextServerIpAddr', 'rlDhcpRelayNextServerRowStatus']);
    const bm = RELAY_BM.map(n => F(RELAY.ifs)[n] || '');
    const members = [];
    hexBits(bm[0]).split('').forEach((b, i) => b === '1' && members.push({ name: (c.m.ports.find(p => p.no === i + 1) || {}).name || 'ifIndex ' + (i + 1), bm: 0, bit: i }));
    for (let k = 1; k < 5; k++) hexBits(bm[k]).split('').forEach((b, i) => b === '1' && members.push({ name: 'VLAN ' + ((k - 1) * 1024 + i + 1), bm: k, bit: i }));
    const udp = frows(RELAY.udp, ['rsUdpRelaySrcIpInf', 'rsUdpRelayDstPort', 'rsUdpRelayDstIpAddr', 'rsUdpRelayStatus']);
    const statics = sec(c.get('IPv4InterfaceList'), 'ifEntry').filter(r => r.owner === '1').map(r => [r.IPAddr, `${r.IPAddr} (${r.interfaceName})`]);
    return [
      c.form({ title: 'DHCP relay', values: { en: F(RELAY.srv)['rlDhcpRelayEnable$scalar'] || '2', o82: F(RELAY.o82).rlIpDhcpOpt82InsertionEnable || '2' },
        fields: [{ k: 'en', label: 'DHCP relay', help: 'Forward DHCP requests from the interfaces below to the servers below', type: 'toggle' },
          { k: 'o82', label: 'Add option 82 (relay agent information)', help: 'Tells the server which port and VLAN a request came from', type: 'toggle' }],
        apply: async ch => { if (ch.en) await c.formPost('API/dhcp_relays_table.htm', { 'rlDhcpRelayEnable$scalar': ch.en }); if (ch.o82) await c.formPost('API/dhcp_relays.htm', { rlIpDhcpOpt82InsertionEnable: ch.o82 }); } }),
      c.table({ title: 'DHCP servers', rows: srvs, key: r => r.rlDhcpRelayNextServerIpAddr, empty: 'No DHCP servers.',
        columns: [{ label: 'Server', get: r => h('span', { class: 'mono' }, r.rlDhcpRelayNextServerIpAddr) }],
        add: { label: 'Add server', values: { ip: '' }, fields: [{ k: 'ip', label: 'DHCP server address', validate: vIp }],
          apply: a => c.formPost('API/dhcp_relays_table.htm', { 'rlDhcpRelayNextServerIpAddr$add': a.ip.trim(), 'rlDhcpRelayNextServerRowStatus$add': '4', 'dhcpRelaysTableVT$endAdd': 'OK' }) },
        remove: { apply: r => c.formPost('API/dhcp_relays_table.htm', { 'rlDhcpRelayNextServerIpAddr$repeat?1': r.rlDhcpRelayNextServerIpAddr, 'rlDhcpRelayNextServerRowStatus$repeat?1': '6', 'dhcpRelaysTableVT$endRepeat?1': 'OK' }) } }),
      c.table({ title: 'Relay on these interfaces', rows: members, key: r => r.name, empty: 'No interfaces.',
        columns: [{ label: 'Interface', get: r => r.name }],
        add: { label: 'Add interface', values: { ifn: 'VLAN' + ((c.m.vlans[0] || {}).id || 1) }, fields: [{ k: 'ifn', label: 'Interface', type: 'select', options: [...vlanIfs(c), ...portIfs(c)] }],
          apply: a => {
            const v = a.ifn.match(/^VLAN(\d+)$/), k = v ? 1 + Math.floor((v[1] - 1) / 1024) : 0, bit = v ? (v[1] - 1) % 1024 : portNo(a.ifn) - 1;
            if (hexBits(bm[k])[bit] === '1') throw new Error('Entry already exists.');
            return c.formPost('API/dhcp_int_settings_a.htm', { [RELAY_BM[k]]: setBit(bm[k], bit, true), 'rlDhcpRelayInterfaceListTableVT$endQuery': 'OK' });
          } },
        remove: { apply: r => { const nb = bm.slice(); nb[r.bm] = setBit(nb[r.bm], r.bit, false);
          return c.formPost('API/dhcp_int_settings.htm', { 'rlDhcpRelayInterfaceListIndex$query': F(RELAY.ifs)['rlDhcpRelayInterfaceListIndex$query'] || '', ...Object.fromEntries(RELAY_BM.map((n, i) => [n, nb[i]])), 'rlDhcpRelayInterfaceListTableVT$endQuery': 'OK' }); } } }),
      c.table({ title: 'UDP relay', help: 'Forward UDP broadcasts for a port (e.g. 137 NetBIOS, 69 TFTP) to an address in another network.', rows: udp, key: r => `${r.rsUdpRelayDstPort} → ${r.rsUdpRelayDstIpAddr}`, empty: 'No UDP relays.',
        columns: [{ label: 'From interface', get: r => r.rsUdpRelaySrcIpInf === '255.255.255.255' ? 'All' : r.rsUdpRelaySrcIpInf }, { label: 'UDP port', get: r => r.rsUdpRelayDstPort, num: true },
          { label: 'Forward to', get: r => h('span', { class: 'mono' }, r.rsUdpRelayDstIpAddr) }],
        add: { label: 'Add UDP relay', values: { src: '255.255.255.255', svc: 'default', port: '', dst: '' },
          fields: [{ k: 'src', label: 'Broadcasts arriving on', type: 'select', options: [['255.255.255.255', 'All IP interfaces'], ...statics] },
            { k: 'svc', label: 'Ports', type: 'seg', options: [['default', 'Default services'], ['one', 'One port']] },
            { k: 'port', label: 'UDP port', type: 'number', show: v => v.svc === 'one', validate: vRange(1, 65535) }, { k: 'dst', label: 'Forward to', validate: vIp }],
          apply: a => formPostPairs('API/udp_relay_table_a.htm', (a.svc === 'one' ? [a.port] : ['37', '42', '49', '53', '137', '138']).flatMap(p => [['rsUdpRelaySrcIpInf$add', a.src],
            ['rsUdpRelayDstPort$add', p], ['rsUdpRelayDstIpAddr$add', a.dst.trim()], ['rsUdpRelayStatus$add', '4'], ['rsUdpRelayUserInfo$add', '0'], ['Udp_relay_tab$endAdd', 'OK']]), 'UDP relay') },
        remove: { apply: r => c.formPost('API/udp_relay_table.htm', { 'rsUdpRelaySrcIpInf$repeat?1': r.rsUdpRelaySrcIpInf, 'rsUdpRelayDstPort$repeat?1': r.rsUdpRelayDstPort,
          'rsUdpRelayDstIpAddr$repeat?1': r.rsUdpRelayDstIpAddr, 'rsUdpRelayStatus$repeat?1': '6', 'Udp_relay_tab$endRepeat?1': 'OK' }) } }),
    ];
  },
});

/* ================= System routing mode ================= */
defSettings({
  id: 'routing-mode', group: 'Network', title: 'System routing mode', icon: 'route', terms: 'system mode routing layer 2 l2 l2+ layer 3 static routing router',
  keys: [{ key: 'SystemGlobalSetting' }],
  render(c) {
    const s = c.get('SystemGlobalSetting') || {}, m = routingMode(c), NAME = { 0: 'Layer 2', 1: 'L2+ (static routing)' };
    return [
      c.kv([['Mode now', NAME[m] || m]]),
      c.note('Layer 2 switches only. L2+ adds static IPv4/IPv6 routes, DHCP relay, UDP relay and an address per VLAN; it turns off 802.1X guest VLAN, dynamic VLAN assignment and multi-session.'),
      c.block('Back up first', c.note('Changing the mode erases the startup configuration. Download it to restore your settings afterwards.'),
        h('div', { class: 'acts' }, h('a', { class: 'btn', href: '/Http_download?action=3', download: 'startup-config.txt' }, icon('save'), 'Startup configuration'),
          h('a', { class: 'btn', href: '/Http_download?action=2', download: 'running-config.txt' }, icon('save'), 'Running configuration'))),
      c.form({ title: 'Change the mode', values: { m }, applyLabel: 'Change and restart', fields: [{ k: 'm', label: 'Routing mode', type: 'seg', options: [['0', 'Layer 2'], ['1', 'L2+ (static routing)']] }],
        danger: () => `The switch erases its startup configuration and restarts right away. All settings, including the address you reach it at (${location.hostname}), VLANs and passwords, return to factory defaults; unsaved changes are lost too.`,
        apply: async (ch, a) => {
          try { await api.post({ section: 'GlobalActions', action: 'set', body: { systemMode: a.m + String(s.systemMode || '0').slice(1) } }, 'system mode'); } catch (e) { if (e.auth || !/answer/.test(e.message)) throw e; }
          waitForReboot();
        } }),
    ];
  },
});

/* ================= Routes (L2+) ================= */
const ROUTES4 = fkey('API/ipv4_routes_table.htm');
const routesSec = defSettings({
  id: 'routes', group: 'Network', title: 'Routes', icon: 'route', terms: 'ipv4 ipv6 static routes routing table next hop metric reject default route gateway',
  keys: [{ key: 'SystemGlobalSetting' }],
  render(c) {
    if (routingMode(c) !== '1') return l2plusOnly(c, 'Static routing');
    const r6k = wcdKey('IPv6RouteList'), i6k = wcdKey('IPv6InterfaceList');
    if (!lazyKeys(routesSec, [ROUTES4, r6k, i6k])) return c.note('Reading routes…');
    const fib = frows(ROUTES4, ['ipCidrRouteDest', 'ipCidrRouteMask', 'ipCidrRouteNextHop', 'ipCidrRouteType', 'ipCidrRouteProto', 'ipCidrRouteMetric1']);
    const st4 = frows(ROUTES4, ['rlInetStaticRouteDest', 'rlInetStaticRoutePfxLen', 'rlInetStaticRouteNextHop', 'rlInetStaticRouteType', 'rlInetStaticRoutePathCost']).filter(r => r.rlInetStaticRouteDest !== '0.0.0.0');
    const r6 = sec(data.get(r6k), 'Entry'), if6 = sec(data.get(i6k), 'InterfaceEntry').map(r => [r.interfaceName, r.interfaceName]);
    const owner = r => r.ipCidrRouteDest === '0.0.0.0' ? 'Default' : r.ipCidrRouteType === '2' ? 'Rejected' : r.ipCidrRouteType === '3' ? 'Directly connected' : { 3: 'Static', 8: 'RIP' }[r.ipCidrRouteProto] || 'Remote';
    const T6 = { 1: 'Other', 2: 'ICMP', 3: 'Static', 4: 'Connected', 5: 'Local', 6: 'ND', 7: 'ND' };
    const zero = (ip, len) => { const n = ip.split('.').reduce((s, x) => s * 256 + +x, 0), m = len ? (0xffffffff << (32 - len)) >>> 0 : 0, v = (n & m) >>> 0; return [24, 16, 8, 0].map(s => (v >>> s) & 255).join('.'); };
    const nh6 = (e, ifn) => /^fe80/i.test(e) && !e.includes('%') ? e + '%' + v6zone(ifn) : e;
    const e6 = (r, metric) => ({ Entry: { destinationIPv6Address: r.destinationIPv6Address, destinationPrefixLength: r.destinationPrefixLength, isPointToPoint: '2', nextHopIPv6Address: nh6(r.nextHopIPv6Address, r.interfaceName), interfaceName: r.interfaceName, metric } });
    return [
      c.table({ title: 'IPv4 static routes', rows: st4, key: r => `${r.rlInetStaticRouteDest}/${r.rlInetStaticRoutePfxLen}`, empty: 'No static routes.',
        columns: [{ label: 'Destination', get: r => h('span', { class: 'mono' }, `${r.rlInetStaticRouteDest}/${r.rlInetStaticRoutePfxLen}`) },
          { label: 'Next hop', get: r => r.rlInetStaticRouteType === '2' ? 'Reject (drop)' : h('span', { class: 'mono' }, r.rlInetStaticRouteNextHop) }, { label: 'Metric', get: r => r.rlInetStaticRoutePathCost, num: true }],
        add: { label: 'Add route', values: { dest: '', len: '24', type: '4', nh: '', metric: '1' },
          fields: [{ k: 'dest', label: 'Destination network', help: '0.0.0.0 with length 0 is the default route', validate: vIp },
            { k: 'len', label: 'Prefix length or mask', validate: vMask }, { k: 'type', label: 'Action', type: 'seg', options: [['4', 'Forward to next hop'], ['2', 'Reject (drop)']] },
            { k: 'nh', label: 'Next hop', show: v => v.type === '4', validate: v => vIp(v) || (v.trim() === '0.0.0.0' ? 'not 0.0.0.0' : null) },
            { k: 'metric', label: 'Metric', type: 'number', show: v => v.type === '4', validate: vRange(1, 255) }],
          apply: a => { const len = pfxLen(toMask(a.len)); return formAll('API/ipv4_routes_table_a.htm', 'API/ipv4_routes_table_a.htm', { 'rlInetStaticRouteDest$Add': zero(a.dest.trim(), len), 'rlInetStaticRoutePfxLen$Add': String(len),
            'rlInetStaticRouteType$Add': a.type, 'rlInetStaticRouteNextHop$Add': a.type === '2' ? '0.0.0.0' : a.nh.trim(), 'rlInetStaticRouteIfIndex$add': '0',
            'rlInetStaticRoutePathCost$Add': a.type === '2' ? '1' : a.metric, 'rlInetStaticRouteRowStatus$Add': '4', 'IP_Route_Table$endAdd': 'OK' }, 'IPv4 route'); } },
        edit: { fields: r => [{ k: 'metric', label: 'Metric', type: r.rlInetStaticRouteType === '2' ? 'static' : 'number', validate: vRange(1, 255) }], values: r => ({ metric: r.rlInetStaticRoutePathCost }),
          apply: (ch, a, r) => formAll(`API/ipv4_routes_table_e.htm?[IP_Route_Table]Query:rlInetStaticRouteDest=${r.rlInetStaticRouteDest}@rlInetStaticRoutePfxLen=${r.rlInetStaticRoutePfxLen}@rlInetStaticRouteNextHop=${r.rlInetStaticRouteNextHop}@rlInetStaticRouteIfIndex=0`,
            'API/ipv4_routes_table_e.htm', { 'rlInetStaticRouteDest$query': r.rlInetStaticRouteDest, 'rlInetStaticRoutePfxLen$query': r.rlInetStaticRoutePfxLen, 'rlInetStaticRouteType$query': r.rlInetStaticRouteType,
              'rlInetStaticRouteNextHop$query': r.rlInetStaticRouteNextHop, 'rlInetStaticRoutePathCost$query': a.metric, 'rlInetStaticRouteRowStatus$query': '1', 'rlInetStaticRouteIfIndex$query': '0', 'IP_Route_Table$endQuery': 'OK' }, 'IPv4 route') },
        remove: { apply: r => c.formPost('API/ipv4_routes_table.htm', { 'rlInetStaticRouteDest$repeat?1': r.rlInetStaticRouteDest, 'rlInetStaticRoutePfxLen$repeat?1': r.rlInetStaticRoutePfxLen,
          'rlInetStaticRouteNextHop$repeat?1': r.rlInetStaticRouteNextHop, 'rlInetStaticRouteIfIndex$repeat?1': '0', 'rlInetStaticRouteRowStatus$repeat?1': '6', 'IP_Route_Table$endRepeat?1': 'OK' }) } }),
      c.table({ title: 'IPv4 routes in use', rows: fib, key: r => r.ipCidrRouteDest, empty: 'No routes.',
        columns: [{ label: 'Destination', get: r => h('span', { class: 'mono' }, `${r.ipCidrRouteDest}/${pfxLen(r.ipCidrRouteMask)}`) }, { label: 'Next hop', get: r => r.ipCidrRouteNextHop === '0.0.0.0' ? '' : r.ipCidrRouteNextHop },
          { label: 'Source', get: owner }, { label: 'Metric', get: r => r.ipCidrRouteMetric1, num: true }] }),
      c.table({ title: 'IPv6 static routes', rows: r6.filter(r => r.routeType === '3'), key: r => `${r.destinationIPv6Address}/${r.destinationPrefixLength}`, empty: 'No IPv6 static routes.',
        columns: [{ label: 'Destination', get: r => h('span', { class: 'mono' }, `${r.destinationIPv6Address}/${r.destinationPrefixLength}`) }, { label: 'Next hop', get: r => h('span', { class: 'mono' }, r.nextHopIPv6Address) },
          { label: 'Interface', get: r => r.interfaceName }, { label: 'Metric', get: r => r.metric, num: true }],
        add: if6.length ? { label: 'Add IPv6 route', values: { dest: '', len: '64', ll: '2', ifn: if6[0][0], nh: '', metric: '1' },
          fields: [{ k: 'dest', label: 'Destination prefix', validate: vIp6 }, { k: 'len', label: 'Prefix length', type: 'number', validate: vRange(0, 128) },
            { k: 'll', label: 'Next hop type', type: 'seg', options: [['2', 'Global'], ['1', 'Link local']] }, { k: 'ifn', label: 'Interface', type: 'select', options: if6 },
            { k: 'nh', label: 'Next hop', validate: vIp6 }, { k: 'metric', label: 'Metric', type: 'number', validate: vRange(1, 65535) }],
          apply: a => api.post({ section: 'IPv6RouteList', action: 'add', body: { Entry: { destinationIPv6Address: a.dest.trim(), destinationPrefixLength: String(a.len),
            nextHopIPv6Address: a.nh.trim() + (a.ll === '1' ? '%' + a.ifn : ''), interfaceName: a.ll === '1' ? undefined : a.ifn, metric: a.metric, isPointToPoint: '2' } } }, 'IPv6 route') } : undefined,
        edit: { fields: () => [{ k: 'metric', label: 'Metric', type: 'number', validate: vRange(1, 65535) }], values: r => ({ metric: r.metric }),
          apply: (ch, a, r) => api.post({ section: 'IPv6RouteList', action: 'edit', body: e6(r, a.metric) }, 'IPv6 route') },
        remove: { apply: r => c.post('IPv6RouteList', e6(r, r.metric), 'delete') } }),
      c.table({ title: 'IPv6 routes in use', rows: r6.filter(r => r.routeType !== '3'), key: r => r.destinationIPv6Address, empty: 'None.',
        columns: [{ label: 'Destination', get: r => h('span', { class: 'mono' }, `${r.destinationIPv6Address}/${r.destinationPrefixLength}`) },
          { label: 'Next hop', get: r => /^(::)?$/.test(r.nextHopIPv6Address || '') && (r.routeType === '4' || r.routeType === '5') ? 'Directly connected' : r.nextHopIPv6Address },
          { label: 'Interface', get: r => r.interfaceName }, { label: 'Type', get: r => T6[r.routeType] || r.routeType }, { label: 'Lifetime', get: r => r.lifeTime === INF ? 'Infinite' : r.lifeTime ? r.lifeTime + ' s' : '' }] }),
    ];
  },
});

/* ================= ARP ================= */
defSettings({
  id: 'arp', group: 'Network', title: 'ARP table', icon: 'list', terms: 'arp table address resolution static arp entry age out timeout clear mac ip',
  keys: [{ key: 'ARPList', cls: 'live' }, 'ARPGlobalSetting', { key: 'IPv4InterfaceList' }],
  render(c) {
    const list = sec(c.get('ARPList'), 'ARPEntry'), g = c.get('ARPGlobalSetting') || {};
    const ipIfs = sec(c.get('IPv4InterfaceList'), 'ifEntry').map(r => r.interfaceName).filter((v, i, a) => a.indexOf(v) === i);
    const ST = { 1: 'Other', 2: 'Invalid', 3: 'Dynamic', 4: 'Static' };
    const ent = (r, x) => ({ ARPEntry: { interfaceID: r.interfaceID, interfaceType: r.interfaceType, interfaceName: r.interfaceName, IPAddress: r.IPAddress, ...x } });
    return [
      c.kv([['Entries', String(list.length)], ['Entries expire after', g.timeout ? g.timeout + ' s' : ''], ['Capacity', 'about 1000 in Layer 2 mode, 128 in L2+']]),
      c.form({ title: 'Settings', values: { timeout: g.timeout || '60000', deleteTableType: '0' },
        fields: [{ k: 'timeout', label: 'Expire entries after (age out)', unit: 's', type: 'number', validate: vRange(1, 40000000) },
          { k: 'deleteTableType', label: 'Clear entries now', type: 'select', options: [['0', 'No'], ['2', 'Clear dynamic entries'], ['3', 'Clear static entries'], ['1', 'Clear all entries']] }],
        danger: (ch, a) => a.deleteTableType === '1' || a.deleteTableType === '3' ? 'Static entries you added are removed and not restored.' : null,
        apply: (ch, a) => c.post('ARPGlobalSetting', { timeout: a.timeout, deleteTableType: a.deleteTableType }) }),
      c.table({ title: 'Entries', rows: list, key: r => r.IPAddress, empty: 'No entries.',
        columns: [{ label: 'Interface', get: r => r.interfaceName }, { label: 'IP address', get: r => h('span', { class: 'mono' }, r.IPAddress) },
          { label: 'MAC address', get: r => h('span', { class: 'mono' }, r.physicalAddress) }, { label: 'Type', get: r => ST[r.status] || r.status }],
        add: ipIfs.length ? { label: 'Add static entry', values: { ifn: ipIfs[0], IPAddress: '', mac: '' },
          fields: [{ k: 'ifn', label: 'Interface', type: 'select', options: ipIfs }, { k: 'IPAddress', label: 'IP address', validate: vIp }, { k: 'mac', label: 'MAC address', validate: vMac }],
          apply: a => { const vl = a.ifn.match(/^VLAN\s*(\d+)$/i), same = list.find(r => r.interfaceName === a.ifn);
            return c.post('ARPList', { ARPEntry: { interfaceID: same ? same.interfaceID : vl ? vl[1] : String(portNo(a.ifn)), interfaceType: vl ? '3' : '1', interfaceName: a.ifn.replace(' ', ''),
              IPAddress: a.IPAddress.trim(), physicalAddress: macFmt(a.mac), status: '4' } }); } } : undefined,
        edit: { fields: r => [{ k: 'mac', label: 'MAC address', validate: vMac }, r.status === '4' ? null : { k: 'status', label: 'Type', type: 'seg', options: [['3', 'Dynamic'], ['4', 'Make static']] }].filter(Boolean),
          values: r => ({ mac: r.physicalAddress, status: r.status }), apply: (ch, a, r) => c.post('ARPList', ent(r, { physicalAddress: macFmt(a.mac), status: a.status })) },
        remove: { apply: r => c.post('ARPList', { ARPEntry: { interfaceID: r.interfaceID, interfaceType: r.interfaceType, IPAddress: r.IPAddress, physicalAddress: r.physicalAddress, interfaceName: r.interfaceName } }, 'delete') } }),
    ];
  },
});
}
