/* ---------- model: switch data merged into ports, VLANs and devices ---------- */
const K = {
  panel: data.def('ports', 'live'),                                     // front-panel layout + oper/admin status
  std: data.def('Standard802_3List&interfaceType=1', 'live'),           // description, admin state, speed, duplex
  vlans: data.def('VLANList', 'config'),
  mem: data.def('VLANMembershipInterfaceList&interfaceType=1', 'config'), // current tagged/untagged per port
  mode: data.def('VLANInterfaceISLiteList&interfaceType=1', 'config'),  // switchport mode + PVID per port (fast)
  stats: data.def('StatisticsList&interfaceType=1', 'live'),
  sys: data.def('SystemGlobalSetting', 'config'),
  fdb: data.def('ForwardingTable', 'live'),                             // MAC address table
  lldp: data.def('LLDPMEDNeighborList', 'live'),
  arp: data.def('ARPList', 'live'),
  ip: data.def('IPv4InterfaceList', 'config'),
  gw: data.def('IPv4GatewayList', 'config'),
  stp: data.def('STP&interfaceType=1', 'live'),                         // spanning tree: global + per-port state/role
  lag: data.def('LAGList', 'config'),
};
const WORKSPACE = [K.panel, K.std, K.vlans, K.mem, K.mode, K.stats];
const DEVICES = [K.fdb, K.lldp, K.arp];
prefetch.add('workspace', WORKSPACE);
prefetch.add('devices', DEVICES);
prefetch.add('system', [K.sys, K.ip, K.gw, dirty.key]);

const MODES = { '10': 'general', '11': 'access', '12': 'trunk', '13': 'private VLAN promiscuous', '14': 'private VLAN host', '15': 'customer' };

/* ---------- VLAN colours: stable per VLAN ID (first come, first served), VLAN 1 always blue ---------- */
const PALETTE = ['#3aa8ff', '#ff7a68', '#66cc63', '#b08af5', '#f5c400', '#ff9f1c', '#2ec4b6', '#f472b6', '#7dd3fc', '#a3e635', '#e8a87c', '#94a3b8'];
const vcol = {
  map: store.get('vlanColours') || { 1: PALETTE[0] },
  of(vid) {
    if (!this.map[vid]) {
      const used = new Set(Object.values(this.map));
      this.map[vid] = PALETTE.find(c => !used.has(c)) || PALETTE[(+vid * 7) % PALETTE.length];
      store.set('vlanColours', this.map);
    }
    return this.map[vid];
  },
};

/* ---------- ports ---------- */
let prevStats = store.get('prevStats') || null; // {at, by: {name: rx+tx}} from the read before the current one
bus.on('data', k => {
  if (k !== K.stats) return;
  const e = data.entry(K.stats);
  const cur = { at: e.at, by: {} };
  for (const s of arr(e.v && e.v.InterfaceStatisticsEntry)) cur.by[s.interfaceName] = (+s.receivePacketByteCount || 0) + (+s.transmitPacketByteCount || 0);
  const last = store.get('lastStats');
  if (last && last.at !== cur.at) { prevStats = last; store.set('prevStats', last); }
  store.set('lastStats', cur);
  traffic.add(e);
});

/* traffic history for the graph: per port [received, sent] b/s between consecutive counter reads; up to an hour, kept in this browser */
const traffic = {
  h: store.get('traffic') || { last: null, s: [] }, // s: [{at, r: {no: [rx, tx]}}]
  clear() { this.h = { last: null, s: [] }; },
  add(e) {
    const by = {};
    for (const x of arr(e.v && e.v.InterfaceStatisticsEntry)) by[portNo(x.interfaceName)] = [+x.receivePacketByteCount || 0, +x.transmitPacketByteCount || 0];
    const l = this.h.last;
    if (l && e.at > l.at) {
      const dt = (e.at - l.at) / 1000, r = {};
      for (const [no, [rx, tx]] of Object.entries(by)) { const o = l.by[no]; if (o && rx >= o[0] && tx >= o[1]) r[no] = [Math.round((rx - o[0]) * 8 / dt), Math.round((tx - o[1]) * 8 / dt)]; }
      this.h.s.push({ at: e.at, dt: e.at - l.at, r });
      this.h.s = this.h.s.filter(x => e.at - x.at < 3600e3).slice(-400);
    }
    if (!l || e.at > l.at) { this.h.last = { at: e.at, by }; store.set('traffic', this.h); }
  },
};

function model() {
  const by = new Map();
  const get = n => { if (!by.has(n)) by.set(n, { name: n, no: portNo(n), vlU: new Set(), vlT: new Set() }); return by.get(n); };
  const panel = data.get(K.panel);
  const phys = panel ? arr(panel?.data?.portsDataBase?.inBandPortTable?.port) : [];
  for (const p of phys) if (p.swIfType === '3') Object.assign(get(p.portName), { row: +p.row, col: +p.column, sfp: p.transType === '2',
    up: p.operStatus === '1', enabled: p.adminStatus === '1' });
  for (const e of arr(data.get(K.std)?.Entry)) Object.assign(get(e.interfaceName), {
    desc: e.interfaceDescription || '', enabled: e.adminState === '1', up: e.linkState === '1', speed: +e.speedOper || 0,
    duplex: e.duplexOperMode === '2' ? 'full' : e.duplexOperMode === '1' ? 'half' : '', autoneg: e.autoNegotiationAdminEnabled === '1',
    speedAdmin: e.speedAdmin, duplexAdmin: e.duplexAdminMode, flow: e.flowControlAdminType, sfp: e.mediaType === '2', raw: e });
  for (const e of arr(data.get(K.mem)?.Entry)) Object.assign(get(e.interfaceName), { vlU: parseList(e.currentUntaggedVLANs), vlT: parseList(e.currentTaggedVLANs) });
  for (const e of arr(data.get(K.mode)?.Entry)) Object.assign(get(e.interfaceName), { mode: e.switchportModeAdmin, pvid: e.generalPVID });
  const st = data.entry(K.stats);
  for (const s of arr(st?.v?.InterfaceStatisticsEntry)) {
    const p = get(s.interfaceName), tot = (+s.receivePacketByteCount || 0) + (+s.transmitPacketByteCount || 0);
    Object.assign(p, { rx: +s.receivePacketByteCount || 0, tx: +s.transmitPacketByteCount || 0, errors: +s.packetErrorCount || 0,
      act: !!(prevStats && prevStats.by[s.interfaceName] != null && tot > prevStats.by[s.interfaceName]) });
    if (prevStats && prevStats.by[s.interfaceName] != null && st.at > prevStats.at) p.rate = (tot - prevStats.by[s.interfaceName]) * 8 / ((st.at - prevStats.at) / 1000);
  }
  // devices seen on each port
  const arp = new Map(arr(data.get(K.arp)?.ARPEntry).map(a => [a.physicalAddress.toLowerCase(), a.IPAddress]));
  const lldp = new Map();
  for (const n of arr(data.get(K.lldp)?.NeighborEntry)) {
    const nm = n.systemName || (n.deviceIDSubtype === '7' || n.deviceIDSubtype === '5' ? n.deviceID : '') || n.deviceID;
    if (!lldp.has(n.interfaceName)) lldp.set(n.interfaceName, []);
    const macOf = (sub, v) => (sub === '3' || sub === '4') && /^([0-9a-f]{2}[:-]){5}[0-9a-f]{2}$/i.test(v) ? v.toLowerCase().replace(/-/g, ':') : null;
    lldp.get(n.interfaceName).push({ name: nm, port: n.advertisedPortID, caps: n.systemCapabilitiesEnabled, desc: n.systemDescription,
      macs: [macOf(n.advertisedPortIDSubtype, n.advertisedPortID), macOf(n.deviceIDSubtype, n.deviceID)].filter(Boolean) });
  }
  const devices = [];
  for (const f of arr(data.get(K.fdb)?.Entry)) {
    if (!/^gi/.test(f.interfaceName)) continue;
    const mac = f.MACAddress.toLowerCase();
    const d = { mac, vid: +f.VLANID, port: f.interfaceName, ip: arp.get(mac) || '', type: f.addressType };
    devices.push(d);
    const p = get(f.interfaceName); (p.macs = p.macs || []).push(d);
  }
  const lldpByMac = new Map();
  for (const [n, list] of lldp) { get(n).neighbors = list; for (const x of list) for (const mm of x.macs) lldpByMac.set(mm, x); }
  for (const d of devices) d.name = lldpByMac.get(d.mac)?.name || '';
  const ports = [...by.values()].filter(p => /^gi/.test(p.name)).sort((a, b) => a.no - b.no);
  for (const p of ports) { p.colour = p.vlU.size === 1 ? vcol.of([...p.vlU][0]) : null; p.label = p.desc || (p.neighbors && p.neighbors[0]?.name) || ''; }
  const vlans = arr(data.get(K.vlans)?.VLAN).map(v => ({ id: +v.VLANID, name: v.VLANName || '', colour: vcol.of(+v.VLANID) })).sort((a, b) => a.id - b.id);
  return { ports, vlans, devices, byName: by, mine: myPort(ports, devices) };
}

/* the port this browser reaches the switch through: client IP (in the session id) -> ARP -> MAC table -> port */
function myPort(ports, devices) {
  const ip = (decodeURIComponent(cookie.get('sessionID') || '').match(/UserId=([\d.]+)/) || [])[1];
  if (!ip) return store.get('mine') || null;
  const d = devices.find(x => x.ip === ip);
  if (d) { if (store.get('mine') !== d.port) store.set('mine', d.port); return d.port; }
  return store.get('mine') || null;
}
