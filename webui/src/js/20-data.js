/* ---------- data: cached resources, batched refresh, idle prefetch ----------
 * A resource is one wcd section (with its parameters), one form page ("form:API/x.htm") or one raw page ("raw:device/noStamp.xml").
 * Each has a freshness class; the last value is kept in localStorage so every view renders at once from cache and is
 * refreshed behind it. Views ask with data.need([...]); stale wcd sections are merged into one request. */
const TTL = { live: 30e3, config: 10 * 60e3, static: 24 * 3600e3, demand: Infinity };

const data = {
  defs: new Map(),   // key -> {cls, prefetch}
  mem: new Map(),    // key -> {at, v, err}
  inflight: new Map(),
  ns: 'r:' + location.host + BASE + ':',

  def(key, cls = 'config', opts = {}) { // the first definition of a key wins (the workspace's classes are not overridden by settings sections)
    if (!this.defs.has(key)) this.defs.set(key, { cls, prefetch: cls !== 'demand' && opts.prefetch !== false, ...opts });
    return key;
  },
  cls(key) { return (this.defs.get(key) || {}).cls || 'config'; },
  entry(key) {
    if (!this.mem.has(key)) { const c = store.get(this.ns + key); if (c) this.mem.set(key, c); }
    return this.mem.get(key);
  },
  get(key) { const e = this.entry(key); return e ? e.v : undefined; },
  at(key) { const e = this.entry(key); return e ? e.at : 0; },
  stale(key) { const e = this.entry(key); return !e || e.dirty || Date.now() - e.at > TTL[this.cls(key)]; },
  put(key, v) {
    const e = { at: Date.now(), v };
    this.mem.set(key, e);
    store.set(this.ns + key, e);
    bus.emit('data', key);
  },
  /* drop every cached switch value, in memory and in localStorage (sign-out with "forget cached data" on) */
  forget() { this.mem.clear(); for (const k of store.keys(this.ns)) store.del(k); bus.emit('data', '*'); },
  invalidate(keys) { for (const k of keys) { const e = this.entry(k); if (e) e.dirty = true; } },
  /* oldest timestamp among keys (for freshness labels) */
  oldest(keys) { let t = Infinity; for (const k of keys) t = Math.min(t, this.at(k) || 0); return t === Infinity ? 0 : t; },
  loading(keys) { return keys.some(k => this.inflight.has(k)); },

  /* make sure keys are fresh; returns when they are (or throws). force = refresh even if fresh. */
  async need(keys, { prio = PRIO.VIEW, force = false } = {}) {
    const todo = keys.filter(k => (force || this.stale(k)) && !this.inflight.has(k));
    const waits = keys.filter(k => this.inflight.has(k)).map(k => this.inflight.get(k));
    const wcd = todo.filter(k => !/^(form|raw):/.test(k)), other = todo.filter(k => /^(form|raw):/.test(k));
    const jobs = [];
    const batches = [];
    for (const k of wcd) { // ~12 sections per request, and never two variants of the same section (responses are keyed by name)
      const name = k.split('&')[0];
      let b = batches.find(x => x.length < 12 && !x.some(y => y.split('&')[0] === name));
      if (!b) batches.push(b = []);
      b.push(k);
    }
    for (const b of batches) jobs.push(this.fetchWcd(b, prio));
    for (const k of other) jobs.push(this.fetchOne(k, prio));
    const res = await Promise.allSettled([...jobs, ...waits]);
    const bad = res.find(r => r.status === 'rejected');
    if (bad) throw bad.reason;
  },
  fetchWcd(keys, prio) {
    const p = api.get(keys, prio).then(r => {
      for (const k of keys) {
        const name = k.split('&')[0];
        // the response element is named after the section, except a few aliases (e.g. ports -> Ports, *LiteList -> full name)
        const v = r[name] ?? r[name[0].toUpperCase() + name.slice(1)] ?? r[name.replace('LiteList', 'List')] ?? null;
        this.put(k, v);
      }
    }).finally(() => keys.forEach(k => this.inflight.delete(k)));
    keys.forEach(k => this.inflight.set(k, p));
    return p;
  },
  fetchOne(k, prio) {
    const [kind, path] = [k.slice(0, k.indexOf(':')), k.slice(k.indexOf(':') + 1)];
    const p = (kind === 'form' ? api.form(path, prio) : net.enqueue(prio, 'read ' + path, async () => (await net.fetch(`${BASE}/${path}`)).text))
      .then(v => this.put(k, v)).finally(() => this.inflight.delete(k));
    this.inflight.set(k, p);
    return p;
  },
};

/* after a write the switch updates derived tables asynchronously: re-read what the write touched ~1.2 s later */
bus.on('wrote', blocks => {
  const sections = new Set(blocks.map(b => b.section));
  // a form write to x_a.htm / x_e.htm / x.htm?query also changes what x.htm (and its queried variants) show
  const formBases = [...sections].filter(s => s.startsWith('form:')).map(s => s.replace(/\?.*$/, '').replace(/_[aem]\.htm$/, '.htm').replace(/\.htm$/, ''));
  const touched = [...data.defs.keys()].filter(k => {
    if (k.startsWith('form:') && formBases.some(b => k.replace(/\?.*$/, '').replace(/_[aem]\.htm$/, '.htm').replace(/\.htm$/, '') === b)) return true;
    const name = k.split('&')[0];
    return sections.has(name) || [...sections].some(s => (WRITE_AFFECTS[s] || []).includes(name));
  });
  data.invalidate(touched);
  setTimeout(() => data.need(touched, { prio: PRIO.VIEW }).catch(() => {}), 1200);
  dirty.mark();
});
/* sections whose contents change when another section is written */
const WRITE_AFFECTS = {
  VLANInterfaceISList: ['VLANMembershipInterfaceList', 'VLANInterfaceISLiteList', 'VLANMembershipList'],
  VLANList: ['VLANMembershipInterfaceList', 'VLANInterfaceISLiteList'],
  Standard802_3List: ['ports', 'StatisticsList'],
};

/* ---------- unsaved changes (running config vs startup config) ---------- */
const dirty = {
  state: store.get('dirty') || false,
  key: data.def('raw:device/noStamp.xml', 'config'),
  mark() { this.state = true; store.set('dirty', true); bus.emit('dirty'); },
  read() {
    const t = data.get(this.key) || '';
    const m = t.match(/<rlRunningCDBequalToStartupCDB>(\d)/);
    if (m) { this.state = m[1] === '2'; store.set('dirty', this.state); bus.emit('dirty'); }
  },
  async save() {
    await api.post({ section: 'GlobalActions', action: 'set', body: { copyCnfRun2Start: null } }, 'save configuration');
    this.state = false; store.set('dirty', false); bus.emit('dirty');
  },
};
bus.on('data', k => { if (k === dirty.key) dirty.read(); });

/* ---------- idle prefetch: one request at a time, only when nothing else is going on ----------
 * Groups are what a lens or sheet needs. Order: most used first (counted locally), then staleness.
 * Gap between prefetches starts at 2 s and doubles while the switch is slow (a request took > 2x the median),
 * halving back as it recovers. Never polls: once everything is fresh it stops until something goes stale. */
const prefetch = {
  groups: [], gap: 2000, timer: null, seen: 0, uses: store.get('uses') || {},
  add(name, keys) { this.groups.push({ name, keys }); },
  used(name) { this.uses[name] = (this.uses[name] || 0) + 1; store.set('uses', this.uses); },
  start() { clearInterval(this.timer); this.timer = setInterval(() => this.tick(), 1000); },
  tick() {
    if (document.hidden || net.paused || net.busy || net.q.length || session.state !== 'ok') return;
    if (Date.now() - net.lastEnd < this.gap) return;
    if (net.seq !== this.seen) { // adjust once per new request, not once per tick
      this.seen = net.seq;
      const last = net.lat[net.lat.length - 1];
      this.gap = last > 2 * net.median() ? Math.min(this.gap * 2, 60000) : Math.max(2000, this.gap / 2);
      if (Date.now() - net.lastEnd < this.gap) return;
    }
    const order = [...this.groups].sort((a, b) => (this.uses[b.name] || 0) - (this.uses[a.name] || 0));
    for (const g of order) {
      const keys = g.keys.filter(k => data.defs.get(k)?.prefetch && data.stale(k) && !data.inflight.has(k));
      if (keys.length) { data.need(keys, { prio: PRIO.PREFETCH }).catch(() => {}); bus.emit('prefetch', g.name); return; }
    }
  },
};
