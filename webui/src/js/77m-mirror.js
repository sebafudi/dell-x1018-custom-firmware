/* ---------- Port mirroring (classic: Port and VLAN Mirroring, form page API/port_mirror.htm) ---------- */
{
const MK = 'form:API/port_mirror.htm';
const DIR = [['3', 'both directions'], ['1', 'received only'], ['2', 'sent only']];
/* sessions: rows portCopySource$repeat?N / portCopyDest / portCopyDirection / portCopyStatus (ifIndex = port number; VLANs >= 100000) */
function sessions(v) {
  const out = [];
  for (let i = 1; v && v[`portCopySource$repeat?${i}`] != null; i++)
    out.push({ i, src: +v[`portCopySource$repeat?${i}`], dst: +v[`portCopyDest$repeat?${i}`], dir: v[`portCopyDirection$repeat?${i}`], status: v[`portCopyStatus$repeat?${i}`] });
  return out;
}
const srcName = n => n >= 100000 ? `VLAN ${n - 99999}` : `port ${n}`;
const portList = m => m.ports.map(p => [String(p.no), `${p.no}${p.label ? ' · ' + p.label : ''}`]);

defSettings({
  id: 'mirror', group: 'Switching', title: 'Port mirroring', icon: 'traffic', terms: 'port mirroring span monitor copy traffic analyzer wireshark',
  keys: [{ key: MK, cls: 'config' }],
  intro: 'Copies the traffic of one or more ports to a destination port, for a packet analyser such as Wireshark.',
  render(c) {
    const list = sessions(c.get(MK)), dest = list[0]?.dst;
    const mine = portNo(c.m.mine || '');
    return [c.table({
      rows: list, empty: 'No port is being mirrored.', key: s => `${srcName(s.src)} → port ${s.dst}`,
      columns: [{ label: 'Copy from', get: s => h('b', {}, srcName(s.src)) }, { label: 'Direction', get: s => (DIR.find(d => d[0] === s.dir) || [0, s.dir])[1] },
        { label: 'To', get: s => `port ${s.dst}` }, { label: 'State', get: s => s.status === '1' ? 'active' : s.status === '3' ? 'not ready (destination down?)' : 'inactive' }],
      add: { label: 'Mirror a port', values: { src: '', dst: dest ? String(dest) : '', dir: '3' },
        fields: [
          { k: 'src', type: 'select', label: 'Copy traffic from', options: [['', 'choose a port'], ...portList(c.m)], validate: (v, a) => !v ? 'choose a port' : v === a.dst ? 'source and destination must differ' : list.some(s => s.src === +v) ? 'this port is already mirrored' : null },
          { k: 'dir', type: 'seg', label: 'Direction', options: DIR },
          dest ? { k: 'dst', type: 'static', label: 'To (all sessions share one destination)' }
            : { k: 'dst', type: 'select', label: 'To destination port', options: [['', 'choose a port'], ...portList(c.m)], help: 'The destination only carries the copy: its own devices lose the network while mirroring is on.',
              validate: v => !v ? 'choose a destination' : +v === mine ? 'this is your connection to the switch' : v === '1' ? 'port 1 is the uplink' : null },
        ],
        danger: (ch, a) => `Port ${a.dst} stops normal traffic and only sends the copy. Devices on it lose the network until mirroring is removed.`,
        apply: a => c.formPost('API/port_mirror_a.htm', { 'portCopySource$add': a.src, 'portCopyDest$add': a.dst, 'portCopyDirection$add': a.dir, 'portCopyStatus$add': '4' }, 'add mirroring') },
      remove: { label: 'Stop', confirm: s => `Stop copying ${srcName(s.src)} to port ${s.dst}.`,
        apply: s => c.formPost('API/port_mirror.htm', { [`portCopySource$repeat?${s.i}`]: s.src, [`portCopyDest$repeat?${s.i}`]: s.dst, [`portCopyStatus$repeat?${s.i}`]: '6', [`PortMirror$endRepeat?${s.i}`]: 'OK' }, 'remove mirroring') },
    })];
  },
});

defPortGroup({
  id: 'mirror', title: 'Mirroring', icon: 'traffic', order: 80, keys: [{ key: MK, cls: 'config' }],
  summary(ports, c) {
    const list = sessions(c.get(MK)), p = ports[0];
    if (ports.length > 1) return '';
    if (list.some(s => s.dst === p.no)) return 'receives a copy';
    const s = list.find(x => x.src === p.no);
    return s ? `copied to port ${s.dst}` : 'off';
  },
  body(ports, c) {
    const list = sessions(c.get(MK)), p = ports[0];
    const asDst = list.filter(s => s.dst === p.no), asSrc = list.find(s => s.src === p.no);
    return [asDst.length ? c.note(`This port receives a copy of ${asDst.map(s => srcName(s.src)).join(', ')}. It carries no normal traffic.`)
      : asSrc ? c.note(`Traffic of this port (${(DIR.find(d => d[0] === asSrc.dir) || [0, ''])[1]}) is copied to port ${asSrc.dst}.`)
      : c.note('Not mirrored.'),
      h('button', { class: 'btn sm', onclick: () => c.settings('mirror') }, 'Port mirroring…')];
  },
});
}
