/* ---------- pending changes: edits collect here, are shown as the future state, and apply as batched writes ----------
 * Ops (one per key; a later edit of the same key replaces the earlier one; an edit back to the live value removes it):
 *   {t:'mem', port, vid, to:'u'|'t'|'-'}       VLAN membership of one port
 *   {t:'port', port, field, value}              Standard802_3List field (interfaceDescription, adminState, ...)
 *   {t:'vlan+', vid, name} {t:'vlan~', vid, name} {t:'vlan-', vid}
 */
const pending = {
  items: store.get('pending') || [],
  key: o => o.t === 'mem' ? `mem:${o.port}:${o.vid}` : o.t === 'port' ? `port:${o.port}:${o.field}` : `vlan:${o.vid}`,
  save() { store.set('pending', this.items); bus.emit('pending'); },
  find(k) { return this.items.find(o => this.key(o) === k); },
  put(op, liveValue) {
    const k = this.key(op);
    this.items = this.items.filter(o => this.key(o) !== k);
    const same = op.t === 'mem' ? op.to === liveValue : (op.t === 'port' || op.t === 'pf') ? liveValue !== undefined && String(op.value) === String(liveValue) : false;
    if (!same) this.items.push(op);
    this.save();
  },
  drop(op) { const k = this.key(op); this.items = this.items.filter(o => this.key(o) !== k); this.save(); },
  clear() { this.items = []; this.save(); },
  count() { return this.items.length; },

  /* live membership of a port in a VLAN: 'u' | 't' | '-' */
  live(p, vid) { return p.vlU.has(vid) ? 'u' : p.vlT.has(vid) ? 't' : '-'; },
  /* future membership (after pending ops), and whether it differs from live */
  memb(p, vid) {
    if (this.items.some(o => o.t === 'vlan-' && o.vid === vid)) return { to: '-', live: this.live(p, vid), pend: this.live(p, vid) !== '-' };
    const o = this.find(`mem:${p.name}:${vid}`);
    return o ? { to: o.to, live: this.live(p, vid), pend: true } : { to: this.live(p, vid), live: this.live(p, vid), pend: false };
  },
  /* the port's future untagged / tagged sets */
  future(p) {
    const U = new Set(p.vlU), T = new Set(p.vlT);
    for (const o of this.items) {
      if (o.t === 'mem' && o.port === p.name) { U.delete(o.vid); T.delete(o.vid); if (o.to === 'u') U.add(o.vid); if (o.to === 't') T.add(o.vid); }
      if (o.t === 'vlan-') { U.delete(o.vid); T.delete(o.vid); }
    }
    return { U, T };
  },
  /* cycle used by clicks in the VLAN lens: none -> untagged -> tagged -> none.
   * A port has at most one untagged VLAN here; making another one untagged moves the port (the old one is dropped). */
  cycle(p, vid) {
    const cur = this.memb(p, vid).to, next = { '-': 'u', u: 't', t: '-' }[cur];
    if (next === 'u') for (const v of this.future(p).U) if (v !== vid) this.put({ t: 'mem', port: p.name, vid: v, to: '-' }, this.live(p, v));
    this.put({ t: 'mem', port: p.name, vid, to: next }, this.live(p, vid));
  },
  setUntagged(p, vid) { // inspector "Network" select
    for (const v of this.future(p).U) if (v !== vid) this.put({ t: 'mem', port: p.name, vid: v, to: '-' }, this.live(p, v));
    if (vid) this.put({ t: 'mem', port: p.name, vid, to: 'u' }, this.live(p, vid));
  },

  /* what the port's switchport config becomes */
  shape(U, T) {
    if (U.size <= 1 && !T.size) return { mode: '11', label: 'access port' };
    if (U.size <= 1) return { mode: '12', label: U.size ? 'trunk' : 'tagged-only trunk' };
    return { mode: '10', label: 'general port' };
  },

  /* plain-language list of the pending changes, grouped per port / VLAN, for the tray */
  describe(m) {
    const out = [];
    const ports = new Map();
    for (const o of this.items) if (o.t === 'mem' || o.t === 'port' || o.t === 'pf') { if (!ports.has(o.port)) ports.set(o.port, []); ports.get(o.port).push(o); }
    for (const o of this.items) if (o.t === 'vlan+') out.push({ kind: 'vlan+', o, text: `Create VLAN ${o.vid}${o.name ? ' “' + o.name + '”' : ''}` });
    for (const o of this.items) if (o.t === 'vlan~') out.push({ kind: 'vlan~', o, text: `Rename VLAN ${o.vid} to “${o.name}”` });
    for (const [name, ops] of ports) {
      const p = m.byName.get(name); if (!p) continue;
      for (const o of ops) {
        if (o.t === 'port') out.push({ kind: 'port', o, p, text: PORT_FIELDS[o.field] ? PORT_FIELDS[o.field](o.value, p) : `${o.field} → ${o.value}` });
        if (o.t === 'pf') out.push({ kind: 'pf', o, p, text: o.text });
      }
      const mem = ops.filter(o => o.t === 'mem');
      if (mem.length) {
        const { U, T } = this.future(p), before = this.shape(p.vlU, p.vlT), after = this.shape(U, T);
        const vname = id => { const v = m.vlans.find(x => x.id === id) || this.items.find(x => x.t === 'vlan+' && x.vid === id); return v && v.name ? v.name : `VLAN ${id}`; };
        const join = mem.find(o => o.to === 'u'), leave = mem.find(o => o.to === '-' && pending.live(p, o.vid) === 'u');
        if (join && leave) out.push({ kind: 'move', o: join, o2: leave, p, text: `moves from ${vname(leave.vid)} to ${vname(join.vid)}` });
        for (const o of mem) {
          if (join && leave && (o === join || o === leave)) continue;
          const v = m.vlans.find(x => x.id === o.vid), vn = vname(o.vid);
          out.push({ kind: 'mem', o, p, v, text: o.to === 'u' ? `joins ${vn}` : o.to === 't' ? `carries ${vn}, tagged` : `leaves ${vn}` });
        }
        if (before.mode !== after.mode) out.push({ kind: 'mode', p, after, text: after.mode === '11' ? 'carries one VLAN again (access port)' : after.mode === '12' ? 'now carries several VLANs (trunk)' : 'now carries several untagged VLANs (general port)' });
      }
    }
    for (const o of this.items) if (o.t === 'vlan-') out.push({ kind: 'vlan-', o, text: `Delete VLAN ${o.vid}` });
    return out;
  },

  /* risks: anything that touches the port you're connected through (or port 1, the uplink) */
  risks(m) {
    const watch = new Set([m.mine, 'gi1/0/1'].filter(Boolean));
    const r = [];
    for (const o of this.items) {
      if ((o.t === 'mem' || o.t === 'port' || o.t === 'pf') && watch.has(o.port) && !(o.t === 'port' && o.field === 'interfaceDescription') && !o.safe)
        r.push(o.port === m.mine ? `Port ${portNo(o.port)} is your connection to the switch.` : `Port 1 is the uplink to your network.`);
      if (o.t === 'vlan-') for (const n of watch) { const p = m.byName.get(n); if (p && (p.vlU.has(o.vid) || p.vlT.has(o.vid))) r.push(`Deleting VLAN ${o.vid} affects port ${portNo(n)}, which you depend on.`); }
    }
    return [...new Set(r)];
  },

  /* turn the ops into the minimum number of writes */
  plan(m) {
    const posts = [];
    const vset = this.items.filter(o => o.t === 'vlan+' || o.t === 'vlan~').map(o => ({ VLANID: String(o.vid), VLANName: o.name || '' }));
    if (vset.length) posts.push({ label: 'create / rename VLANs', ops: this.items.filter(o => o.t === 'vlan+' || o.t === 'vlan~'), blocks: [{ section: 'VLANList', action: 'set', body: { VLAN: vset } }] });
    const portEntries = new Map();
    for (const o of this.items) if (o.t === 'port') {
      if (!portEntries.has(o.port)) portEntries.set(o.port, { interfaceName: o.port });
      portEntries.get(o.port)[o.field] = String(o.value);
    }
    if (portEntries.size) posts.push({ label: 'port settings', ops: this.items.filter(o => o.t === 'port'), blocks: [{ section: 'Standard802_3List', action: 'set', body: { Entry: [...portEntries.values()] } }] });
    // per-port sections (spanning tree, storm control, ...): one POST per section/action, one entry per port
    const pf = new Map();
    for (const o of this.items) if (o.t === 'pf') {
      const k = o.section + '|' + o.action + '|' + o.wrap;
      if (!pf.has(k)) pf.set(k, { section: o.section, action: o.action, wrap: o.wrap, entries: new Map(), ops: [] });
      const g = pf.get(k); g.ops.push(o);
      if (!g.entries.has(o.keyValue)) g.entries.set(o.keyValue, { [o.keyField]: o.keyValue, ...(o.extra || {}) });
      g.entries.get(o.keyValue)[o.field] = o.value;
    }
    for (const g of pf.values()) posts.push({ label: g.section, ops: g.ops, blocks: [{ section: g.section, action: g.action, body: { [g.wrap]: [...g.entries.values()] } }] });
    // VLAN membership: per changed port, mode, then clear the list(s), then set them (verified to run in this order in one POST)
    const changed = [...new Set(this.items.filter(o => o.t === 'mem').map(o => o.port))].map(n => m.byName.get(n)).filter(Boolean);
    const modes = [], clears = [], sets = [];
    for (const p of changed) {
      const { U, T } = this.future(p), s = this.shape(U, T), name = p.name, u = [...U][0];
      modes.push({ interfaceName: name, switchportModeAdmin: s.mode });
      // back to access: also restore the stored trunk list to its default, so a round trip leaves the config unchanged
      if (s.mode === '11') sets.push({ interfaceName: name, accessPVID: String(u || 1), ...(p.mode === '12' ? { trunkMemberVLANs: '1-4094' } : {}) });
      if (s.mode === '12') {
        clears.push({ interfaceName: name, trunkMemberVLANs: '1-4094' });
        sets.push({ interfaceName: name, trunkMemberVLANs: fmtList(new Set([...T, ...U])), trunkNativeVID: String(u || p.pvid || 1) });
      }
      if (s.mode === '10') {
        clears.push({ interfaceName: name, generalUntaggedVLANs: '1-4094', generalTaggedVLANs: '1-4094' });
        sets.push({ interfaceName: name, generalPVID: String(Math.min(...U)), generalUntaggedVLANs: fmtList(U), ...(T.size ? { generalTaggedVLANs: fmtList(T) } : {}) });
      }
    }
    if (changed.length) {
      const blocks = [{ section: 'VLANInterfaceISList', action: 'set', body: { Entry: modes } }];
      if (clears.length) blocks.push({ section: 'VLANInterfaceISList', action: 'delete', body: { Entry: clears } });
      blocks.push({ section: 'VLANInterfaceISList', action: 'set', body: { Entry: sets } });
      posts.push({ label: 'VLAN membership', ops: this.items.filter(o => o.t === 'mem'), blocks });
    }
    const vdel = this.items.filter(o => o.t === 'vlan-').map(o => ({ VLANID: String(o.vid) }));
    if (vdel.length) posts.push({ label: 'delete VLANs', ops: this.items.filter(o => o.t === 'vlan-'), blocks: [{ section: 'VLANList', action: 'delete', body: { VLAN: vdel } }] });
    return posts;
  },

  /* run the writes in order; each change leaves the pending list as soon as its write succeeds, so a failure part-way
   * keeps exactly what was not applied (and says which step failed) */
  async apply(m) {
    const posts = this.plan(m);
    let done = 0;
    for (const p of posts) {
      try { await (p.run ? p.run() : api.post(p.blocks, p.label)); }
      catch (e) { e.message = `${done ? `${done} of ${posts.length} steps applied; ` : ''}${p.label}: ${e.message}`; throw e; }
      done++;
      if (p.ops) { const gone = new Set(p.ops.map(o => this.key(o))); this.items = this.items.filter(o => !gone.has(this.key(o))); this.save(); }
    }
    if (posts.every(p => p.ops)) this.clear();
  },
};

/* plain-language text for port setting changes */
const PORT_FIELDS = {
  interfaceDescription: v => v ? `named “${v}”` : 'name cleared',
  adminState: v => v === '2' ? 'disabled' : 'enabled',
  autoNegotiationAdminEnabled: v => v === '1' ? 'speed: automatic' : 'speed: fixed',
  speedAdmin: v => `speed ${v} Mb/s`,
  duplexAdminMode: v => v === '2' ? 'half duplex' : 'full duplex',
  flowControlAdminType: v => ({ 1: 'flow control on', 2: 'flow control off', 3: 'flow control automatic' }[v] || 'flow control ' + v),
};
