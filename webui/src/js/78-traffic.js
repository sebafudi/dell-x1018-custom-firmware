/* ---------- Traffic rules: QoS, access lists (ACLs), time ranges ----------
 * Most of these settings live on RomPager form pages (API/*.htm), not wcd sections, so per-port edits use a local kind of pending op:
 * {t:'pf', section:'L:<id>'} whose write is LPF[id].run(port, {field: value}) (see the pending.plan / pending.apply wrappers below).
 * Helpers here (fk, kd, frows, formRaw, lctl, LPF, fpost, ...) are shared with 79-diag.js. */
{
ICONS.funnel = '<path d="M2 3h12l-4.5 5.5V13l-3 1.5V8.5Z"/>';

/* ---------- shared helpers ---------- */
const fk = p => 'form:API/' + p;
const kd = (key, cls = 'config', prefetch = false) => ({ key, cls, prefetch });
/* rows of a form page: names like col$repeat?N / col$repeat2?N / col$repeat-eqVal?N grouped by N; keep rows that have `col` */
function frows(key, col, src) {
  const o = src || (key && data.get(key)) || {}, by = {};
  for (const [k, v] of Object.entries(o)) { const m = k.match(/^([^$]+)\$[\w-]*?\?(\d+)$/); if (m) (by[m[2]] = by[m[2]] || { _n: +m[2] })[m[1]] = v; }
  return Object.values(by).filter(r => r[col] != null && r[col] !== '').sort((a, b) => a._n - b._n);
}
const fs = (key, n) => fv(key, n) ?? fv(key, n + '$scalar');
/* a form page read right before a write: inputs plus selected <option>s; $all keeps repeated names in order */
function formRaw(path) {
  return net.enqueue(PRIO.USER, 'read ' + path, async () => {
    const { text } = await net.fetch(`${BASE}/${path}`);
    if (!/<form|<input/i.test(text)) throw new AuthError();
    const o = { $all: {} }, put = (k, v) => { o[k] = v; (o.$all[k] = o.$all[k] || []).push(v); };
    for (const m of text.matchAll(/<input[^>]*?name="?([^"\s>]+)"?[^>]*?value="([^"]*)"/gi)) put(m[1], m[2]);
    for (const m of text.matchAll(/<select[^>]*?name="?([^"\s>]+)"?[^>]*>([\s\S]*?)<\/select>/gi)) { const s = m[2].match(/<option[^>]*?value="?([^"\s>]+)"?[^>]*\bselected/i); if (s) put(m[1], s[1]); }
    return o;
  });
}
/* form write, then re-read the pages it changes */
async function fpost(path, fields, keys, label) {
  const r = await api.formPost(path, fields, label);
  if (keys) { data.invalidate(keys); setTimeout(() => data.need(keys, { prio: PRIO.VIEW }).catch(() => {}), 1200); }
  return r;
}
async function cliRun(cmds, label) {
  const out = await api.cli(['configure', ...cmds, 'end'], label);
  const bad = out.find(l => /^\s*%/.test(l));
  if (bad) throw new SwitchError(bad.replace(/^\s*%\s*/, ''));
  return out;
}
const ifx = p => p.no;                                                 // ifIndex of gi1/0/N is N; LAGs are 1000 + n
const ifName = i => +i > 1000 ? 'LAG ' + (i - 1000) : 'Port ' + i;
const macFmt = s => { const x = String(s || '').replace(/[^0-9a-f]/gi, ''); return x.length === 12 ? x.match(/../g).join(':').toLowerCase() : String(s || ''); };
const getBit = (hex, i) => !!(parseInt(String(hex || '')[Math.floor((i - 1) / 4)] || '0', 16) & (8 >> ((i - 1) % 4)));
function setBit(hex, i, on) {
  const a = String(hex || '').split(''), c = Math.floor((i - 1) / 4), b = 8 >> ((i - 1) % 4);
  while (a.length <= c) a.push('0');
  a[c] = ((parseInt(a[c], 16) & ~b) | (on ? b : 0)).toString(16).toUpperCase();
  return a.join('');
}
const rng = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
const numIn = (lo, hi) => v => /^\d+$/.test(String(v).trim()) && +v >= lo && +v <= hi ? null : `${lo}–${hi}`;
const chipList = items => items.length ? h('div', { class: 'chips' }, items.map(t => h('span', { class: 'chip' }, t))) : h('span', { class: 'mu' }, 'none');

/* ---------- per-port settings on form pages: local pending ops ---------- */
const LPF = pending.lpf = pending.lpf || {}; // id -> { label, run(port, {field: value}) }; shared with 79-diag.js
const lkey = (p, id, k) => pending.key({ t: 'pf', port: p.name, section: 'L:' + id, field: k });
/* effective value (pending or live) of the first selected port */
function lval(ports, spec, k) { const o = pending.find(lkey(ports[0], spec.id, k)); return o ? o.value : String(spec.live(ports[0], k) ?? ''); }
/* like portControl, but the live value comes from spec.live(p, field) */
function lctl(ports, spec, f) {
  const lives = ports.map(p => String(spec.live(p, f.k) ?? ''));
  const cur = ports.map((p, i) => { const o = pending.find(lkey(p, spec.id, f.k)); return o ? o.value : lives[i]; });
  const same = cur.every(x => x === cur[0]), pend = ports.some(p => pending.find(lkey(p, spec.id, f.k)));
  const set = v => { v = String(v); ports.forEach((p, i) => v === lives[i] ? pending.drop({ t: 'pf', port: p.name, section: 'L:' + spec.id, field: f.k })
    : pending.pf(p, { section: 'L:' + spec.id, text: spec.text, label: LPF[spec.id].label }, f.k, v, lives[i])); };
  const lbl = h('span', {}, h('b', {}, f.label), f.unit ? h('span', { class: 'mu' }, ` (${f.unit})`) : null, f.help ? h('span', { class: 'hint' }, f.help) : null);
  if (f.type === 'toggle') {
    const on = f.on ?? '1', off = f.off ?? '2', isOn = same && cur[0] === String(on);
    return h('div', { class: 'fl line' }, lbl, h('button', { type: 'button', class: ['tog', isOn && 'on', pend && 'pend'], role: 'switch', 'aria-checked': isOn ? 'true' : 'false', 'aria-label': f.label, onclick: () => set(isOn ? off : on) }));
  }
  if (f.type === 'select') {
    const o = opt(f.options); if (same && !o.some(([v]) => String(v) === cur[0])) o.push([cur[0], cur[0] || '—']);
    return h('div', { class: 'fl' }, lbl, h('select', { class: pend ? 'pend' : '', 'aria-label': f.label, onchange: e => set(e.target.value) },
      !same ? h('option', { value: '', selected: true, disabled: true }, 'mixed') : null, o.map(([ov, ol]) => h('option', { value: ov, selected: same && String(ov) === cur[0] }, ol))));
  }
  return h('div', { class: 'fl' }, lbl, h('input', { type: f.type === 'number' ? 'number' : 'text', class: pend ? 'pend' : '', min: f.min, max: f.max, value: same ? cur[0] : '', placeholder: same ? '' : 'mixed',
    'aria-label': f.label, onchange: e => set(e.target.value.trim()), onkeydown: e => { if (e.key === 'Enter') e.target.blur(); } }));
}
if (!pending.lpfPlan) (orig => {
  pending.lpfPlan = true;
  pending.plan = function (m) {
    const all = this.items, loc = all.filter(o => o.t === 'pf' && /^L:/.test(o.section));
    let posts;
    this.items = all.filter(o => !loc.includes(o));
    try { posts = orig.call(this, m); } finally { this.items = all; }
    const g = new Map();
    for (const o of loc) { const k = o.section + '|' + o.port; if (!g.has(k)) g.set(k, { id: o.section.slice(2), port: o.port, f: {}, ops: [] }); g.get(k).f[o.field] = o.value; g.get(k).ops.push(o); }
    for (const x of g.values()) {
      const L = LPF[x.id], p = m.byName.get(x.port) || { name: x.port, no: portNo(x.port) };
      if (L) posts.push({ label: `${L.label} (port ${p.no})`, blocks: [], ops: x.ops, run: () => L.run(p, x.f) });
    }
    return posts;
  };
})(pending.plan);
/* pending.apply (core) runs p.run() posts itself and drops each post's ops as it succeeds */

/* an editable grid of small coloured squares (CoS/DSCP maps) with its own Apply */
function gridEd(c, s, o) {
  const init = [...o.vals], vals = [...o.vals];
  let sel = null;
  const box = h('div', { class: 'blk' });
  const draw = () => {
    const n = vals.filter((v, i) => String(v) !== String(init[i])).length;
    const cells = [h('span'), ...rng(0, o.cols - 1).map(j => h('span', { class: 'mu', style: 'font-size:11px;text-align:center' }, o.colHead(j)))];
    vals.forEach((v, i) => {
      if (i % o.cols === 0) cells.push(h('span', { class: 'mu', style: 'font-size:11px;align-self:center' }, o.rowHead(i / o.cols)));
      const [t, col] = o.cell(v, i);
      cells.push(h('button', { type: 'button', class: ['bd', String(v) !== String(init[i]) && 'pend'], style: `--c:${col};width:30px;height:24px;border:${sel === i ? '2px solid currentColor' : '0'};cursor:pointer`,
        title: `${o.label(i)} → ${t}`, 'aria-label': `${o.label(i)} → ${t}`, onclick: () => { if (o.next) vals[i] = o.next(v); else sel = sel === i ? null : i; draw(); } }, t));
    });
    box.replaceChildren(h('h3', {}, o.title), o.help ? c.note(o.help) : null, o.key || null,
      h('div', { style: `display:grid;grid-template-columns:max-content repeat(${o.cols},30px);justify-content:start;gap:4px 6px;margin:8px 0` }, cells),
      sel != null ? h('div', { class: 'fl' }, h('label', {}, `${o.label(sel)} becomes`), h('input', { type: 'number', min: 0, max: 63, value: vals[sel], style: 'max-width:90px',
        onchange: e => { const x = Math.max(0, Math.min(63, +e.target.value || 0)); vals[sel] = String(x); draw(); } })) : null,
      h('div', { class: 'acts' },
        h('button', { class: 'btn pri', type: 'button', disabled: !n, onclick: async e => {
          try { await act(e.currentTarget, () => o.apply(vals), 'Applied. Not saved yet.'); journal.add([`${s.title}: ${o.title} (${n} changed)`]); init.splice(0, init.length, ...vals); draw(); setTimeout(c.refresh, 1200); } catch { /* toast shown */ }
        } }, n ? `Apply ${n} change${n > 1 ? 's' : ''}` : 'Apply'),
        n ? h('button', { class: 'btn', type: 'button', onclick: () => { vals.splice(0, vals.length, ...init); sel = null; draw(); } }, 'Reset') : null,
        o.def ? h('button', { class: 'btn ghost', type: 'button', onclick: () => { vals.splice(0, vals.length, ...o.def.map(String)); draw(); } }, 'Factory map') : null));
  };
  draw();
  return box;
}

/* ---------- QoS ---------- */
const Q = {
  glob: kd(fk('cosqos_global.htm')), queue: kd(fk('cosqos_queue.htm')), tcp: kd(fk('tcp_congestion.htm')),
  cos: kd(fk('cosqos_to.htm')), dscp: kd(fk('cosqos_dscp.htm')), remark: kd(fk('cosqos_dscp_map.htm')), rewrite: kd(fk('dscp_rewrite_edit.htm')),
  cmap: kd(fk('cosqos_cmap.htm')), agg: kd('AggregatePolicerList'), pol: kd('PolicyMapList'), pcm: kd('ClassMapList'), bind: kd('PolicyMapBindingList'),
  defcos: kd(fk('interface_table.htm')), band: kd(fk('cosqos_port_band_table.htm')), trust: kd(fk('cosqos_int_basic.htm')),
  sPol: kd(fk('policer_statistics.htm'), 'live'), sAgg: kd(fk('cosqos_agg_stat.htm'), 'live'), sQ: kd(fk('queues_statistics.htm'), 'live'),
};
const qmode = () => fv(Q.glob.key, 'rlQosGlobalQoSMode$query') || '';
const QMODE = { 1: 'off', 2: 'basic', 3: 'advanced' };
const QCOL = ['#7d8590', '#a9b0ba', '#c9ced6', '#eceef1'];          // queue 1 (lowest) .. 4 (highest): a grey ramp, so VLAN colours keep meaning VLANs
const qKey = () => h('div', { class: 'chips' }, QCOL.map((col, i) => h('span', { class: 'chip' }, h('span', { class: 'bd sm', style: `--c:${col}` }, i + 1), i === 0 ? ' lowest' : i === 3 ? ' highest' : '')));

defSettings({
  id: 'qos', group: 'Traffic', title: 'Traffic priority (QoS)', icon: 'traffic',
  terms: 'qos cos dscp trust queue scheduling strict priority wrr weighted round robin bandwidth tcp congestion avoidance wred tail drop basic advanced mode',
  keys: [Q.glob, Q.queue, Q.tcp],
  intro: 'Which traffic goes first when a port is busy. The switch has 4 queues per port; queue 4 is the most important.',
  render(c) {
    const G = Q.glob.key, g = k => fv(G, k + '$query'), mode = g('rlQosGlobalQoSMode');
    const out = [c.form({
      title: 'Mode', values: { mode },
      help: 'Basic: priority follows the CoS or DSCP mark of each frame. Advanced: you classify traffic yourself with class maps and policies.',
      fields: [{ k: 'mode', label: 'QoS mode', type: 'seg', options: [['1', 'Off'], ['2', 'Basic'], ['3', 'Advanced']], help: 'Written with the CLI command qos basic / qos advanced / no qos' }],
      danger: () => 'Switching QoS mode drops the settings of the mode you leave (trust, or policies and their port bindings), and traffic priorities change at once.',
      apply: ch => cliRun([{ 1: 'no qos', 2: 'qos basic', 3: 'qos advanced' }[ch.mode]], 'QoS mode'),
    })];
    if (mode === '2') out.push(c.form({
      title: 'Trust', values: { trust: g('rlQosBasicGlobalTrustMode'), mut: g('rlQosDscpMutationEnable') },
      help: 'Which mark in incoming frames decides the queue. Ports can opt out of trust in the port inspector.',
      fields: [{ k: 'trust', label: 'Trust', type: 'seg', options: [['1', 'CoS (802.1p)'], ['2', 'DSCP']] },
        { k: 'mut', label: 'Always rewrite DSCP', type: 'toggle', help: 'replace DSCP using the DSCP rewrite map (DSCP mutation)', show: v => v.trust === '2' }],
      apply: (ch, all) => c.formPost('API/cosqos_global.htm', { 'rlQosGlobalIndex$query': g('rlQosGlobalIndex') || '1', 'rlQosBasicGlobalTrustMode$query': all.trust,
        'rlQosDscpMutationEnable$query': all.trust === '2' ? all.mut : '2', 'QosModeGlobalVT$endQuery': 'OK' }),
    }));
    if (mode === '3') out.push(c.form({
      title: 'Trust in advanced mode', values: { t: g('rlQoSPortTrustAdvancedMode') },
      help: 'Whether ports honour incoming CoS/DSCP marks for traffic no policy classifies (qos advanced ports-trusted).',
      fields: [{ k: 't', label: 'Ports', type: 'seg', options: [['1', 'Trusted'], ['2', 'Not trusted']] }],
      apply: ch => cliRun([ch.t === '1' ? 'qos advanced ports-trusted' : 'qos advanced ports-not-trusted'], 'QoS trust'),
    }));
    // queue scheduling: strict queues are always the top ones; WRR on queues 1..k
    const Qk = Q.queue.key, ef = frows(Qk, 'rlQosEfQueueId'), wrr = String(ef.filter(r => r.rlQosEfState === '1').length);
    const w = q => fv(Qk, `rlQosValueQueue${q}$query`) ?? '';
    const share = (vals) => { const k = +vals.wrr, sum = rng(1, k).reduce((a, q) => a + (+vals['w' + q] || 0), 0);
      return rng(1, 4).map(q => q > k ? `queue ${q}: strict` : `queue ${q}: ${sum ? Math.round((+vals['w' + q] || 0) / sum * 100) : 0} %`).join(' · '); };
    const qv = { wrr, w1: w(1), w2: w(2), w3: w(3), w4: w(4) };
    out.push(c.form({
      title: 'Queue scheduling', values: qv,
      help: `Strict queues are always emptied first; the others share what is left by weight (WRR). Now: ${share(qv)}.`,
      fields: [{ k: 'wrr', label: 'Strict priority for', type: 'seg', options: [['4', 'None'], ['3', 'Queue 4'], ['2', 'Queues 3–4'], ['0', 'All queues'], ...(wrr === '1' ? [['1', 'Queues 2–4']] : [])] },
        ...rng(1, 4).map(q => ({ k: 'w' + q, label: `Queue ${q} weight`, type: 'number', min: 0, max: 255, width: '90px', show: v => q <= +v.wrr, validate: numIn(0, 255) }))],
      validate: null,
      apply: (ch, all) => {
        const k = +all.wrr, r = ef.find(x => +x.rlQosEfQueueId === (k || 1)) || ef[0];
        if (!r) throw new Error('The queue table did not load; refresh and try again.');
        if (k && !rng(1, k).some(q => +all['w' + q] > 0)) throw new Error('At least one weighted queue needs a weight above 0.');
        const f = { [`rlQosEfState$repeat-eqVal?${r._n}`]: k ? '1' : '2', [`rlQosEfQueueId$repeat-eqVal?${r._n}`]: r.rlQosEfQueueId,
          [`EfManageTable$endrepeat-eqVal?${r._n}`]: fv(Qk, `EfManageTable$endrepeat-eqVal?${r._n}`) || 'OK' };
        for (const q of rng(1, k)) f[`rlQosValueQueue${q}$query`] = String(all['w' + q]);
        for (const n of ['rlQueueProfileName$query', 'rlQosQueueProfileStatus$query', 'ProfileTable$endQuery']) if (fv(Qk, n) != null) f[n] = fv(Qk, n);
        return c.formPost('API/cosqos_queue.htm', f);
      },
    }));
    const T = Q.tcp.key, now = fs(T, 'rlWeightedRandomTailDropCurrentStatus'), after = fs(T, 'rlWeightedRandomTailDropStatusAfterReset');
    out.push(c.form({
      title: 'TCP congestion avoidance', values: { after },
      help: `Drops TCP packets early and at random before a queue fills, so TCP senders slow down smoothly (WRED). Takes effect after Save and restart. Running now: ${now === '1' ? 'off' : now == null ? '?' : 'on'}.`,
      fields: [{ k: 'after', label: 'After the next restart', type: 'toggle', on: '0', off: '1' }],
      apply: ch => c.formPost('API/tcp_congestion.htm', { rlWeightedRandomTailDropStatusAfterReset: ch.after }),
    }));
    return out;
  },
});

defSettings({
  id: 'qos-maps', group: 'Traffic', title: 'Priority maps', icon: 'vlan',
  terms: 'cos to queue dscp to queue map dscp mapping remark out of profile dscp rewrite mutation 802.1p',
  keys: [Q.glob, Q.cos, Q.dscp, Q.remark, Q.rewrite],
  intro: 'Which queue each priority mark goes to. Click a square to move that mark to the next queue.',
  render(c) {
    const mode = qmode();
    const cos = frows(Q.cos.key, 'rlQosCosIndex').map(r => r.rlQosCosQueueId);
    const dq = frows(Q.dscp.key, 'rlQosOldDscp'), dqDef = frows(Q.dscp.key, 'rlQosDscpQueueDefaultMapDscp').map(r => r.rlQosDscpQueueDefaultMapQueueId);
    const qcell = v => [String(v), QCOL[(+v || 1) - 1]];
    const out = [
      cos.length === 8 ? gridEd(c, this, { title: 'CoS (802.1p) to queue', key: qKey(), vals: cos, cols: 8, colHead: j => j, rowHead: () => 'CoS', label: i => `CoS ${i}`,
        cell: qcell, next: v => String(+v % 4 + 1), def: [1, 1, 2, 3, 3, 4, 4, 4],
        apply: vals => c.formPost('API/cosqos_to.htm', Object.assign({}, ...vals.map((q, i) => ({ [`rlQosCosIndex$repeat?${i + 1}`]: String(i), [`rlQosCosQueueId$repeat?${i + 1}`]: String(q), [`QosCosQueueTable$endRepeat?${i + 1}`]: 'OK' })))) })
        : c.note('CoS to queue map: not available.'),
      dq.length === 64 ? gridEd(c, this, { title: 'DSCP to queue', vals: dq.map(r => r.rlQosQueueNum), cols: 8, colHead: j => '+' + j, rowHead: r => r * 8, label: i => `DSCP ${i}`,
        cell: qcell, next: v => String(+v % 4 + 1), def: dqDef.length === 64 ? dqDef : null,
        apply: vals => c.formPost('API/cosqos_dscp.htm', Object.assign({}, ...vals.map((q, i) => ({ [`rlQosOldDscp$repeat?${i + 1}`]: String(i), [`rlQosQueueNum$repeat?${i + 1}`]: String(q), [`DSCPMapTable$endRepeat?${i + 1}`]: 'OK' })))) })
        : c.note('DSCP to queue map: not available.'),
    ];
    const dd = (v, i) => [String(v), +v === i ? '#5b6370' : '#b08af5'];
    if (mode === '3') {
      const rm = frows(Q.remark.key, 'rlQosOldDscp');
      if (rm.length === 64) out.push(gridEd(c, this, { title: 'Out-of-profile DSCP (remark map)', help: 'The DSCP a packet gets when a policer finds it over its rate and the action is “remark”. Click a square, then type the new value.',
        vals: rm.map(r => r.rlQosRmNewDscp), cols: 8, colHead: j => '+' + j, rowHead: r => r * 8, label: i => `DSCP ${i}`, cell: dd, def: rng(0, 63),
        apply: vals => c.formPost('API/cosqos_dscp_map.htm', Object.assign({}, ...vals.map((v, i) => ({ [`rlQosOldDscp$repeat?${i + 1}`]: rm[i].rlQosOldDscp, [`rlQosRmNewDscp$repeat?${i + 1}`]: String(v), [`DSCPMapTable$endRepeat?${i + 1}`]: 'OK' })))) }));
    }
    if (mode === '2') {
      const rw = frows(Q.rewrite.key, 'rlQosOldDscp');
      if (rw.length === 64) out.push(gridEd(c, this, { title: 'DSCP rewrite', help: 'Used when “Always rewrite DSCP” is on (Traffic priority). Click a square, then type the new value.',
        vals: rw.map(r => r.rlQosNewDscp), cols: 8, colHead: j => '+' + j, rowHead: r => r * 8, label: i => `DSCP ${i}`, cell: dd, def: rng(0, 63),
        apply: vals => c.formPost('API/dscp_rewrite_edit.htm', Object.assign({}, ...vals.map((v, i) => ({ [`rlQosOldDscp$repeat?${i + 1}`]: String(i), [`rlQosNewDscp$repeat?${i + 1}`]: String(v), [`DSCPMapTable$endRepeat?${i + 1}`]: 'OK' })))) }));
    }
    return out;
  },
});

/* ---------- advanced QoS: class maps, policers, policies ---------- */
const PCM_ACT = { 1: 'leave marks', 6: 'trust CoS/DSCP', 3: 'set DSCP', 4: 'set queue', 5: 'set CoS' };
const EXC = { 1: 'excess passes', 2: 'excess dropped', 3: 'excess remarked (DSCP map)' };
function pcmLine(r) {
  const a = PCM_ACT[r.action] || 'action ' + r.action, mv = ['3', '4', '5'].includes(r.action) ? ' ' + r.markVal : '';
  const pol = r.bindPoliceType === '1' ? `; police ${count(r.sglPolCIR)} kb/s, burst ${count(r.sglPolCBS)} B, ${EXC[r.sglPolAction] || ''}` : r.bindPoliceType === '2' ? `; aggregate policer “${r.aggPolNameRef}”` : '';
  return a + mv + pol;
}
const pcmFields = (aggs) => [
  { k: 'action', label: 'Then', type: 'select', options: Object.entries(PCM_ACT) },
  { k: 'markVal', label: 'New value', type: 'number', min: 0, max: 63, width: '90px', help: 'DSCP 0–63, queue 1–4, CoS 0–7', show: v => ['3', '4', '5'].includes(v.action),
    validate: (v, a) => numIn(a.action === '4' ? 1 : 0, a.action === '3' ? 63 : a.action === '4' ? 4 : 7)(v) },
  { k: 'bindPoliceType', label: 'Rate limit (police)', type: 'seg', options: [['0', 'None'], ['1', 'Own'], ...(aggs.length ? [['2', 'Shared']] : [])] },
  { k: 'sglPolCIR', label: 'Rate', unit: 'kb/s', type: 'number', min: 100, max: 1000000, show: v => v.bindPoliceType === '1', validate: numIn(100, 1000000) },
  { k: 'sglPolCBS', label: 'Burst', unit: 'bytes', type: 'number', min: 3000, max: 16769020, show: v => v.bindPoliceType === '1', validate: numIn(3000, 16769020) },
  { k: 'sglPolAction', label: 'Excess traffic', type: 'select', options: Object.entries(EXC), show: v => v.bindPoliceType === '1',
    validate: (v, a) => v === '3' && !['6', '3'].includes(a.action) ? 'remarking needs “trust” or “set DSCP”' : null },
  { k: 'aggPolNameRef', label: 'Shared policer', type: 'select', options: aggs.map(a => a.policerName), show: v => v.bindPoliceType === '2' },
];
const pcmBody = a => ({ action: a.action, ...(['3', '4', '5'].includes(a.action) ? { markVal: String(a.markVal) } : {}), bindPoliceType: a.bindPoliceType,
  sglPolCIR: a.bindPoliceType === '1' ? String(a.sglPolCIR) : '0', sglPolCBS: a.bindPoliceType === '1' ? String(a.sglPolCBS) : '0',
  sglPolAction: a.bindPoliceType === '1' ? a.sglPolAction : '0', aggPolNameRef: a.bindPoliceType === '2' ? a.aggPolNameRef : '0' });
const ACLT = { 1: 'MAC', 2: 'IPv4', 3: 'IPv6' };

defSettings({
  id: 'qos-policy', group: 'Traffic', title: 'QoS policies', icon: 'funnel',
  terms: 'class map class-map policy map policy table policy class maps aggregate policer police single policer binding service-policy advanced qos',
  keys: [Q.glob, Q.cmap, Q.agg, Q.pol, Q.pcm, Q.bind],
  intro: 'Advanced mode: a class map picks traffic with access lists; a policy says what to do with each class; a port runs one policy on incoming traffic.',
  render(c) {
    if (qmode() !== '3') return c.note(`QoS is in ${QMODE[qmode()] || 'another'} mode. Policies work only in advanced mode (Traffic priority → Mode).`);
    const acls = frows(Q.cmap.key, 'rlQosAclIndex'), aclName = i => { const a = acls.find(x => x.rlQosAclIndex === String(i)); return a ? `${ACLT[a.rlQosAclType] || 'IPv6'} “${a.rlQosAclName}”` : '#' + i; };
    const cms = frows(Q.cmap.key, 'rlQosClassMapName'), aggs = rows(c.get(Q.agg.key)), pols = rows(c.get(Q.pol.key)), pcm = rows(c.get(Q.pcm.key));
    const ofType = t => [['0', 'none'], ...acls.filter(a => a.rlQosAclType === t).map(a => [a.rlQosAclIndex, a.rlQosAclName])];
    const out = [c.table({
      title: 'Class maps', help: 'Traffic that matches the access lists. Lists are made under Access lists.', rows: cms, key: r => r.rlQosClassMapName, empty: 'No class maps.',
      columns: [{ label: 'Name', get: r => h('b', {}, r.rlQosClassMapName) },
        { label: 'Matches', get: r => [1, 2, 3].map(j => r['rlQosClassMapMatch' + j]).filter(x => x && x !== '0').map(aclName).join(r.rlQosClassMapType === '1' ? ' and ' : ' or ') }],
      add: acls.length ? { label: 'Add class map', values: { name: '', ip4: '0', ip6: '0', mac: '0', all: '2', macFirst: '2' },
        fields: [{ k: 'name', label: 'Name', validate: v => /^.{1,32}$/.test(v.trim()) ? (cms.some(x => x.rlQosClassMapName === v.trim()) ? 'already exists' : null) : '1–32 characters' },
          { k: 'ip4', label: 'IPv4 list', type: 'select', options: ofType('2') }, { k: 'ip6', label: 'IPv6 list', type: 'select', options: ofType('3') },
          { k: 'mac', label: 'MAC list', type: 'select', options: ofType('1'), validate: (v, a) => v === '0' && a.ip4 === '0' && a.ip6 === '0' ? 'pick at least one list' : null },
          { k: 'all', label: 'Match', type: 'seg', options: [['1', 'IP and MAC'], ['2', 'IP or MAC']], show: v => v.mac !== '0' && (v.ip4 !== '0' || v.ip6 !== '0') },
          { k: 'macFirst', label: 'Check the MAC list first', type: 'toggle', on: '1', off: '2', show: v => v.mac !== '0' && (v.ip4 !== '0' || v.ip6 !== '0') }],
        apply: a => {
          const both = a.mac !== '0' && (a.ip4 !== '0' || a.ip6 !== '0'), ms = (both && a.macFirst === '1' ? [a.mac, a.ip4, a.ip6] : [a.ip4, a.ip6, a.mac]).filter(x => x !== '0');
          const idx = Math.max(0, ...cms.map(x => +x.rlQosClassMapIndex || 0)) + 1;
          return c.formPost('API/create_new_cmap.htm', { 'rlQosClassMapIndex$add': String(idx), 'rlQosClassMapName$add': a.name.trim(), 'rlQosClassMapType$add': both ? a.all : '2',
            'rlQosClassMapStatus$add': '4', ...Object.fromEntries([1, 2, 3].map(j => ['rlQosClassMapMatch' + j + '$add', ms[j - 1] || '0'])), 'QosClassMapTable$endAdd': 'OK' });
        } } : null,
      remove: { confirm: r => `Class map “${r.rlQosClassMapName}” is removed. Unbind it from its policy first.`,
        apply: r => c.formPost('API/cosqos_cmap.htm', { 'rlQosClassMapIndex$repeat?1': r.rlQosClassMapIndex, 'rlQosClassMapStatus$repeat?1': '6', 'QosClassMapTable1$endRepeat?1': 'OK' }) },
    }), c.table({
      title: 'Shared policers (aggregate)', help: 'One rate limit shared by every class that uses it.', rows: aggs, key: r => r.policerName, empty: 'None.', max: 255,
      columns: [{ label: 'Name', get: r => h('b', {}, r.policerName) }, { label: 'Rate', num: true, get: r => `${count(r.CIR)} kb/s` }, { label: 'Burst', num: true, get: r => `${count(r.CBS)} B` },
        { label: 'Excess', get: r => ({ 1: 'passes', 2: 'dropped', 3: 'remarked' }[r.action] || r.action) }],
      add: { label: 'Add policer', values: { policerName: '', CIR: '1000', CBS: '128000', action: '2' },
        fields: [{ k: 'policerName', label: 'Name', validate: v => /^.{1,32}$/.test(v.trim()) ? (aggs.some(x => x.policerName === v.trim()) ? 'already exists' : null) : '1–32 characters' }, ...aggFields()],
        apply: a => c.post('AggregatePolicerList', { Entry: { policerName: a.policerName.trim(), CIR: String(a.CIR), CBS: String(a.CBS), action: a.action } }) },
      edit: { fields: () => aggFields(), values: r => ({ CIR: r.CIR, CBS: r.CBS, action: r.action }),
        apply: (ch, a, r) => c.post('AggregatePolicerList', { Entry: { policerName: r.policerName, CIR: String(a.CIR), CBS: String(a.CBS), action: a.action } }) },
      remove: { apply: r => c.post('AggregatePolicerList', { Entry: { policerID: r.policerID, policerName: r.policerName, CIR: r.CIR, CBS: r.CBS } }, 'delete') },
    }), c.table({
      title: 'Policies', rows: pols, key: r => r.policyName, empty: 'No policies.',
      columns: [{ label: 'Name', get: r => h('b', {}, r.policyName) }, { label: 'Classes', num: true, get: r => pcm.filter(x => x.policyIDRef === r.policyID).length },
        { label: 'Ports', get: r => rows(c.get(Q.bind.key)).filter(b => b.bindPolicyInEnbl === '1' && b.policyInNameRef === r.policyName).map(b => portNo(b.interfaceName) || b.interfaceName).join(', ') }],
      add: { label: 'Add policy', values: { name: '' }, fields: [{ k: 'name', label: 'Name', validate: v => /^.{1,32}$/.test(v.trim()) ? null : '1–32 characters' }],
        apply: a => c.post('PolicyMapList', { PolicyMapEntry: { policyName: a.name.trim() } }) },
      remove: { confirm: r => `Policy “${r.policyName}” is deleted. Unbind it from its ports first.`, apply: r => c.post('PolicyMapList', { PolicyMapEntry: { policyName: r.policyName } }, 'delete') },
    })];
    for (const P of pols) {
      const mine = pcm.filter(x => x.policyIDRef === P.policyID), free = pcm.filter(x => !x.policyIDRef || x.policyIDRef === '0');
      out.push(c.table({
        title: `Policy “${P.policyName}”`, rows: mine, key: r => r.className, empty: 'No classes in this policy yet.',
        columns: [{ label: 'Class', get: r => h('b', {}, r.className) }, { label: 'Does', get: r => pcmLine(r) }],
        add: free.length ? { label: 'Add a class', values: { classID: free[0].classID, action: '1', markVal: '0', bindPoliceType: '0', sglPolCIR: '1000', sglPolCBS: '128000', sglPolAction: '1', aggPolNameRef: aggs[0]?.policerName || '' },
          fields: [{ k: 'classID', label: 'Class map', type: 'select', options: free.map(x => [x.classID, x.className]) }, ...pcmFields(aggs)],
          apply: a => c.post('ClassMapList', { ClassMapEntry: { policyNameRef: P.policyName, policyIDRef: P.policyID, classID: a.classID, className: (free.find(x => x.classID === a.classID) || {}).className, ...pcmBody(a), bindPolicyEnbl: '1' } }) } : null,
        edit: { fields: () => pcmFields(aggs), values: r => ({ action: r.action, markVal: r.markVal || '0', bindPoliceType: r.bindPoliceType || '0', sglPolCIR: +r.sglPolCIR ? r.sglPolCIR : '1000',
          sglPolCBS: +r.sglPolCBS ? r.sglPolCBS : '128000', sglPolAction: +r.sglPolAction ? r.sglPolAction : '1', aggPolNameRef: r.aggPolNameRef && r.aggPolNameRef !== '0' ? r.aggPolNameRef : aggs[0]?.policerName || '' }),
          apply: (ch, a, r) => c.post('ClassMapList', { ClassMapEntry: { classID: r.classID, className: r.className, ...pcmBody(a) } }) },
        remove: { label: 'Unbind', confirm: r => `Class “${r.className}” leaves this policy (the class map stays).`,
          apply: r => c.post('ClassMapList', { ClassMapEntry: { classID: r.classID, className: r.className, policyIDRef: r.policyIDRef, policyNameRef: r.policyNameRef, bindPolicyEnbl: '2' } }) },
      }));
    }
    out.push(c.note('A policy runs on a port when you pick it in the port inspector (Traffic priority). A port takes a policy or access lists, not both.'));
    return out;
  },
});
function aggFields() {
  return [{ k: 'CIR', label: 'Rate', unit: 'kb/s', type: 'number', min: 3, max: 57982058, validate: numIn(3, 57982058) },
    { k: 'CBS', label: 'Burst', unit: 'bytes', type: 'number', min: 3000, max: 19173960, validate: numIn(3000, 19173960) },
    { k: 'action', label: 'Excess traffic', type: 'select', options: [['1', 'Passes'], ['2', 'Dropped'], ['3', 'Remarked (out-of-profile DSCP map)']] }];
}

/* QoS statistics (counters you create) */
const octHex = i => { const bits = '0'.repeat(i - 1) + '1', p = bits.padEnd(Math.ceil(bits.length / 8) * 8, '0'); return p.match(/.{8}/g).map(b => parseInt(b, 2).toString(16).padStart(2, '0')).join(''); };
const firstBit = hex => { const s = String(hex || '').replace(/[^0-9a-f]/gi, ''); for (let i = 0; i < s.length * 4; i++) if (getBit(s, i + 1)) return i + 1; return 0; };
defSettings({
  id: 'qos-stats', group: 'Monitoring', title: 'QoS counters', icon: 'traffic',
  terms: 'qos statistics policer statistics aggregate policer statistics queues statistics tail drop counters in profile out of profile',
  keys: [Q.sPol, Q.sAgg, Q.sQ, Q.agg],
  render(c) {
    const sq = frows(Q.sQ.key, 'rlQosOutQueueStatisticsCountrID'), sa = frows(Q.sAgg.key, 'rlQosAggregatePolicerStatisticsStatus'), sp = frows(Q.sPol.key, 'rlQosSinglePolicerStatisticsStatus');
    const aggs = rows(c.get(Q.agg.key)), aggName = i => (aggs.find(a => a.policerID === i) || {}).policerName || '#' + i;
    const cls = frows(Q.sPol.key, 'rlQosClassMapPolicer').filter(r => r.rlQosClassMapPolicer !== '0');
    const clsName = i => { const r = cls.find(x => x.rlQosClassMapPolicer === i); return r ? `${r.rlQosPolicyMapName} · ${r.rlQosClassMapName}` : '#' + i; };
    const usedSets = sq.map(r => r.rlQosOutQueueStatisticsCountrID);
    return [c.table({
      title: 'Queue counters', help: 'Up to two counter sets, each counting one port (or all) and one queue (or all).', rows: sq, key: r => 'set ' + r.rlQosOutQueueStatisticsCountrID, max: 2,
      columns: [{ label: 'Set', get: r => r.rlQosOutQueueStatisticsCountrID }, { label: 'Port', get: r => r.rlQosOutQueueStatisticsPortAll === '1' ? 'all' : ifName(firstBit(r.rlQosOutQueueStatisticsIfIndexList)) },
        { label: 'Queue', get: r => r.rlQosOutQueueStatisticsQueueAll === '1' ? 'all' : r.rlQosOutQueueStatisticsQueue },
        { label: 'Packets', num: true, get: r => count(r.rlQosOutQueueStatisticsCounterAllValue) }, { label: 'Tail-dropped', num: true, get: r => count(r.rlQosOutQueueStatisticsCounterTailDropValue) }],
      add: { label: 'Add counter', values: { set: usedSets.includes('1') ? '2' : '1', port: '0', queue: '0' },
        fields: [{ k: 'set', label: 'Counter set', type: 'seg', options: [['1', '1'], ['2', '2']], validate: v => usedSets.includes(v) ? 'in use' : null },
          { k: 'port', label: 'Port', type: 'select', options: [['0', 'All ports'], ...rng(1, 18).map(i => [String(i), 'Port ' + i])] },
          { k: 'queue', label: 'Queue', type: 'select', options: [['0', 'All queues'], ...rng(1, 4).map(i => [String(i), 'Queue ' + i])] }],
        apply: a => c.formPost('API/queues_statistics_a.htm', { 'rlQosOutQueueStatisticsCountrID$add': a.set, 'rlQosOutQueueStatisticsIfIndexList$add': a.port === '0' ? '00' : octHex(+a.port),
          'rlQosOutQueueStatisticsPortAll$add': a.port === '0' ? '1' : '2', 'rlQosOutQueueStatisticsVlan$add': '1', 'rlQosOutQueueStatisticsVlanAll$add': '1',
          'rlQosOutQueueStatisticsQueue$add': a.queue === '0' ? '1' : a.queue, 'rlQosOutQueueStatisticsQueueAll$add': a.queue === '0' ? '1' : '2',
          'rlQosOutQueueStatisticsStatus$add': '4', 'rlQosOutQueueStatisticsTableVT$endAdd': 'OK' }) },
      remove: { apply: r => c.formPost('API/queues_statistics.htm', { 'rlQosOutQueueStatisticsCountrID$repeat?1': r.rlQosOutQueueStatisticsCountrID, 'rlQosOutQueueStatisticsStatus$repeat?1': '6', 'rlQosOutQueueStatisticsTableVT$endRepeat?1': 'OK' }) },
    }), c.table({
      title: 'Shared policer counters', rows: sa, key: r => aggName(r.rlQosPolicerIndex),
      columns: [{ label: 'Policer', get: r => aggName(r.rlQosPolicerIndex) }, { label: 'Within rate', num: true, get: r => bytes(r.rlQosAggregatePolicerStatisticsInProfileCounterValue) },
        { label: 'Over rate', num: true, get: r => bytes(r.rlQosAggregatePolicerStatisticsOutProfileCounterValue) }],
      add: aggs.length ? { label: 'Count a shared policer', values: { p: aggs[0].policerID }, fields: [{ k: 'p', label: 'Policer', type: 'select', options: aggs.map(a => [a.policerID, a.policerName]) }],
        apply: a => c.formPost('API/cosqos_agg_stat_a.htm', { 'rlQosPolicerIndex$add': a.p, 'rlQosAggregatePolicerStatisticsStatus$add': '4', 'rlQosAggregatePolicerStatisticsTableVT$endAdd': 'OK' }) } : null,
      remove: { apply: r => c.formPost('API/cosqos_agg_stat.htm', { 'rlQosPolicerIndex$repeat?1': r.rlQosPolicerIndex, 'rlQosAggregatePolicerStatisticsStatus$repeat?1': '6', 'rlQosAggregatePolicerStatisticsTableVT$endRepeat?1': 'OK' }) },
    }), c.table({
      title: 'Class policer counters', rows: sp, key: r => `${ifName(r.rlIfIndex)} ${clsName(r.rlQosPolicerIndex)}`,
      columns: [{ label: 'Port', get: r => ifName(r.rlIfIndex) }, { label: 'Policy · class', get: r => clsName(r.rlQosPolicerIndex) },
        { label: 'Within rate', num: true, get: r => bytes(r.rlQosSinglePolicerStatisticsInProfileCounterValue) }, { label: 'Over rate', num: true, get: r => bytes(r.rlQosSinglePolicerStatisticsOutProfileCounterValue) }],
      add: cls.length ? { label: 'Count a class policer', values: { port: '1', p: cls[0].rlQosClassMapPolicer },
        fields: [{ k: 'port', label: 'Port', type: 'select', options: rng(1, 18).map(i => [String(i), 'Port ' + i]) }, { k: 'p', label: 'Policy · class', type: 'select', options: cls.map(r => [r.rlQosClassMapPolicer, clsName(r.rlQosClassMapPolicer)]) }],
        apply: a => c.formPost('API/policer_statistics_a.htm', { 'rlIfIndex$add': a.port, 'rlQosPolicerIndex$add': a.p, 'rlQosSinglePolicerStatisticsStatus$add': '4', 'rlQosSinglePolicerStatisticsTableVT$endAdd': 'OK' }) } : null,
      remove: { apply: r => c.formPost('API/policer_statistics.htm', { 'rlIfIndex$repeat?1': r.rlIfIndex, 'rlQosPolicerIndex$repeat?1': r.rlQosPolicerIndex,
        'rlQosSinglePolicerStatisticsStatus$repeat?1': '6', 'rlQosSinglePolicerStatisticsTableVT$endRepeat?1': 'OK' }) },
    })];
  },
});

/* per port: default CoS, trust (basic), rate limit, shaping, policy (advanced) */
const qrow = (k, col, p) => frows(k, col).find(r => r[col] === String(ifx(p))) || {};
const QP = {
  cos: { id: 'cos', live: p => qrow(Q.defcos.key, 'dot1dBasePort', p).dot1dPortDefaultUserPriority, text: (k, v) => `untagged frames get priority ${v}` },
  trust: { id: 'qtrust', live: p => qrow(Q.trust.key, 'rlIfIndex', p).rlQosIfTrustActive, text: (k, v) => v === '2' ? 'trusts frame marks' : 'ignores frame marks' },
  band: { id: 'band', live: (p, k) => qrow(Q.band.key, 'rlIfIndex', p)[k], text: (k, v) => ({
    rlQosPortRateLimitStatus: v === '2' ? 'incoming limit on' : 'incoming limit off', rlQosCirPortRateLimit: `incoming limit ${count(v)} kb/s`,
    rlQosPortShaperStatus: v === '2' ? 'outgoing shaping on' : 'outgoing shaping off', rlQosCirPortShaper: `outgoing rate ${count(v)} kb/s`, rlQosCbsPortShaper: `outgoing burst ${count(v)} B` })[k] },
  pol: { id: 'qpol', live: p => { const b = rows(data.get(Q.bind.key)).find(r => r.interfaceName === p.name && r.bindPolicyInEnbl === '1'); return b ? b.policyInNameRef : ''; },
    text: (k, v) => v ? `runs policy “${v}”` : 'no QoS policy' },
};
LPF.cos = { label: 'default priority', run: (p, f) => fpost('API/interface_table_e.htm', { 'dot1dBasePort$query': String(ifx(p)), 'dot1dPortDefaultUserPriority$query': f.v, 'portPriorityTable$endQuery': 'OK' }, [Q.defcos.key]) };
LPF.qtrust = { label: 'QoS trust', run: (p, f) => fpost('API/cosqos_int_basic_e.htm', { 'rlIfIndex$query': String(ifx(p)), 'rlIfType$query': qrow(Q.trust.key, 'rlIfIndex', p).rlIfType || '2',
  'rlQosIfTrustActive$query': f.v, 'IfPolicyVT$endQuery': 'OK' }, [Q.trust.key]) };
LPF.band = { label: 'bandwidth', run: (p, f) => {
  const r = qrow(Q.band.key, 'rlIfIndex', p), g = k => f[k] ?? r[k] ?? '', nz = (v, d) => +v ? String(v) : String(d);
  const rl = nz(g('rlQosCirPortRateLimit'), 100), sc = nz(g('rlQosCirPortShaper'), 64), sb = nz(g('rlQosCbsPortShaper'), 128000);
  if (+rl < 3 || +rl > 10000000) throw new Error('Incoming limit: 3–10000000 kb/s');
  if (+sc < 64 || +sc > 10000000) throw new Error('Outgoing rate: 64–10000000 kb/s');
  if (+sb < 4096 || +sb > 16762902) throw new Error('Outgoing burst: 4096–16762902 bytes');
  // in the page's own order, opened by the IfPolicyVT$query marker (without it the switch answers "Might be missing parameters")
  return fpost('API/cosqos_port_band.htm', [['IfPolicyVT$query', 'OK'], ['rlIfIndex$query', String(ifx(p))], ['rlIfType$query', r.rlIfType || '2'],
    ['rlQosIfPolicyMapStatus$query', r.rlQosIfPolicyMapStatus || '1'], ['rlQosPortRateLimitStatus$query', g('rlQosPortRateLimitStatus') || '1'], ['rlQosCirPortRateLimit$query', rl],
    ['rlQosCbsPortRateLimit$query', '128000'], ['rlQosPortShaperStatus$query', g('rlQosPortShaperStatus') || '1'], ['rlQosCirPortShaper$query', sc], ['rlQosCbsPortShaper$query', sb],
    ['IfPolicyVT$endQuery', 'OK']], [Q.band.key]);
} };
LPF.qpol = { label: 'QoS policy', run: (p, f) => {
  const old = rows(data.get(Q.bind.key)).find(r => r.interfaceName === p.name && r.bindPolicyInEnbl === '1'), blocks = [];
  const F = ['interfaceType', 'interfaceName', 'policyInNameRef', 'bindPolicyInEnbl', 'policyInIDRef', 'policyAclDefaultAction'];
  if (old) blocks.push({ section: 'PolicyMapBindingList', action: 'restore', body: { ifEntry: Object.fromEntries(F.map(k => [k, old[k] ?? ''])) } });
  if (f.v) blocks.push({ section: 'PolicyMapBindingList', action: 'set', body: { ifEntry: { interfaceType: '2', interfaceName: p.name, policyInNameRef: f.v, bindPolicyInEnbl: '1', policyInIDRef: '1', policyAclDefaultAction: '1' } } });
  return blocks.length ? api.post(blocks, 'QoS policy binding') : null;
} };
defPortGroup({
  id: 'qos', title: 'Traffic priority', icon: 'traffic', order: 60, keys: [Q.glob, Q.defcos, Q.band, Q.trust, Q.pol, Q.bind],
  summary(ports) {
    const p = ports[0], b = qrow(Q.band.key, 'rlIfIndex', p), pol = QP.pol.live(p);
    return [`priority ${QP.cos.live(p) ?? '?'}`, b.rlQosPortRateLimitStatus === '2' && 'in limited', b.rlQosPortShaperStatus === '2' && 'out shaped', pol && `policy ${pol}`].filter(Boolean).join(', ');
  },
  body(ports, c) {
    const mode = qmode(), on = k => lval(ports, QP.band, k) === '2';
    return [
      lctl(ports, QP.cos, { k: 'v', label: 'Default priority (CoS)', type: 'select', options: rng(0, 7).map(String), help: 'for frames that arrive without a priority tag' }),
      mode === '2' ? lctl(ports, QP.trust, { k: 'v', label: 'Trust frame marks', type: 'toggle', on: '2', off: '1', help: 'use the CoS/DSCP mark of incoming frames' }) : null,
      lctl(ports, QP.band, { k: 'rlQosPortRateLimitStatus', label: 'Limit incoming rate', type: 'toggle', on: '2', off: '1', help: 'drops what arrives above the rate (ingress rate limit)' }),
      on('rlQosPortRateLimitStatus') ? lctl(ports, QP.band, { k: 'rlQosCirPortRateLimit', label: 'Incoming rate', unit: 'kb/s', type: 'number', min: 3, max: 10000000 }) : null,
      lctl(ports, QP.band, { k: 'rlQosPortShaperStatus', label: 'Shape outgoing rate', type: 'toggle', on: '2', off: '1', help: 'queues what leaves above the rate (egress shaping)' }),
      on('rlQosPortShaperStatus') ? [lctl(ports, QP.band, { k: 'rlQosCirPortShaper', label: 'Outgoing rate', unit: 'kb/s', type: 'number', min: 64, max: 10000000 }),
        lctl(ports, QP.band, { k: 'rlQosCbsPortShaper', label: 'Outgoing burst', unit: 'bytes', type: 'number', min: 4096, max: 16762902 })] : null,
      mode === '3' ? lctl(ports, QP.pol, { k: 'v', label: 'QoS policy', type: 'select', options: [['', 'none'], ...rows(c.get(Q.pol.key)).map(x => x.policyName)], help: 'runs on incoming traffic; replaces access lists on this port' }) : null,
      h('button', { class: 'btn sm ghost', type: 'button', onclick: () => c.settings(mode === '3' ? 'qos-policy' : 'qos') }, icon('gear'), mode === '3' ? 'Policies…' : 'QoS settings…'),
    ];
  },
});

/* ---------- access lists (ACL) ---------- */
const A = { list: kd('ACLList'), mac: kd(fk('mac_based_ACE.htm')), ip4: kd(fk('ipv4_based_ACE.htm')), v6: kd('ACLRuleList'), tr: kd('TimeRangeList'),
  bind: kd(fk('acl_membership_table.htm')), ppf: kd(fk('proprietary_protocol_filterring.htm')), cnt: kd(fk('rmon_ace_counters.htm'), 'live') };
const ACT = { 1: 'permit', 2: 'deny', 3: 'deny and shut the port', 4: 'deny and log', 5: 'permit' };
const PROTO = { 1: 'ICMP', 2: 'IGMP', 4: 'IP-in-IP', 6: 'TCP', 8: 'EGP', 9: 'IGP', 17: 'UDP', 20: 'HMP', 27: 'RDP', 35: 'IDPR', 41: 'IPv6', 45: 'IDRP', 46: 'RSVP', 47: 'GRE', 50: 'ESP', 51: 'AH', 58: 'ICMPv6', 88: 'EIGRP', 89: 'OSPF', 94: 'IPIP', 103: 'PIM', 115: 'L2TP', 124: 'ISIS' };
const FLAGS = ['urg', 'ack', 'psh', 'rst', 'syn', 'fin'];
const hexIp = h8 => (h8.match(/../g) || []).map(x => parseInt(x, 16)).join('.');
function ipText(v2) {
  const x = String(v2 || '').replace(/[^0-9a-f]/gi, ''); if (x.length < 16) return 'any';
  const ip = hexIp(x.slice(0, 8)), w = parseInt(x.slice(8, 16), 16) >>> 0;
  if (w === 0xffffffff) return 'any';
  const len = 32 - w.toString(2).replace(/^0+/, '').length;
  return (w & (w + 1)) === 0 ? (len === 32 ? ip : `${ip}/${len}`) : `${ip} wildcard ${hexIp(x.slice(8, 16))}`;
}
function macText(v2) {
  const x = String(v2 || '').replace(/[^0-9a-f]/gi, ''); if (x.length < 24) return 'any';
  const m = x.slice(12, 24).toLowerCase();
  return m === 'ffffffffffff' ? 'any' : m === '000000000000' ? macFmt(x.slice(0, 12)) : `${macFmt(x.slice(0, 12))} wildcard ${macFmt(m)}`;
}
/* one readable line per rule: "deny TCP from any to 10.0.0.0/8 port 22" */
function aceLine(a, tup) {
  const T = {};
  for (let s = 1; s <= 10; s++) { const t = tup.get(a['rlQosAceTidxTuple' + s]); if (t) T[t.rlQosTupleType] = { v1: t.rlQosTupleValue1, v2: t.rlQosTupleValue2 }; }
  const tr = a.rlQosAceTidxTimeRange ? ` during “${a.rlQosAceTidxTimeRange}”` : '', act = ACT[a.rlQosAceTidxAction] || 'action ' + a.rlQosAceTidxAction;
  if (a.rlQosAceTidxType === '5') {
    const ex = [T[12] && `VLAN ${T[12].v1}`, T[16] && `CoS ${parseInt(String(T[16].v2).slice(0, 2), 16)} mask ${parseInt(String(T[16].v2).slice(2, 4), 16)}`, T[17] && `ethertype 0x${(+T[17].v1).toString(16).padStart(4, '0')}`];
    return `${act} from ${T[10] ? macText(T[10].v2) : 'any'} to ${T[11] ? macText(T[11].v2) : 'any'}${ex.filter(Boolean).map(x => ' ' + x).join('')}${tr}`;
  }
  const pn = T[1] ? parseInt(String(T[1].v2).slice(0, 2), 16) : null, proto = pn == null ? 'IP' : PROTO[pn] || 'protocol ' + pn;
  const port = (one, from, to) => (one ? ` port ${one.v1}` : from ? ` port ${from.v1}-${to ? to.v1 : '?'}` : '');
  const sp = port(T[8] || T[6], T[29] || T[25], T[30] || T[26]), dp = port(T[9] || T[7], T[31] || T[27], T[32] || T[28]);
  let fl = '';
  if (T[18]) { const v = String(T[18].v2), b1 = parseInt(v.slice(0, 2), 16), b2 = parseInt(v.slice(2, 4), 16); fl = FLAGS.map((n, i) => { const bit = 32 >> i; return b2 & bit ? '' : (b1 & bit ? '+' : '-') + n; }).filter(Boolean).join(' '); }
  const ex = [fl && 'flags ' + fl, T[19] && `type ${T[19].v1}`, T[20] && `code ${T[20].v1}`, T[21] && `IGMP type ${T[21].v1}`, T[4] && `DSCP ${T[4].v1}`, T[5] && `precedence ${T[5].v1}`];
  return `${act} ${proto} from ${T[2] ? ipText(T[2].v2) : 'any'}${sp} to ${T[3] ? ipText(T[3].v2) : 'any'}${dp}${ex.filter(Boolean).map(x => ' ' + x).join('')}${tr}`;
}
function v6Line(r) {
  const P = r.IPv6Parameters || {}, S = P.Source || {}, D = P.Destination || {}, pt = +P.protocolType;
  const end = (x, pre) => x[pre + 'AddressType'] === '2' ? `${x[pre + 'IPv6Address']}/${x[pre + 'PrefixLength']}` : 'any';
  const port = (x, pre) => x[pre + 'PortType'] === '2' ? ` port ${x[pre + 'Port']}` : x[pre + 'PortType'] === '4' ? ` port ${x[pre + 'PortStart']}-${x[pre + 'PortEnd']}` : '';
  const F = P.TCPFlags || {}, fl = P.TCPFlagsEnabled === '1' ? FLAGS.map(n => F[n] === '2' ? '+' + n : F[n] === '3' ? '-' + n : '').filter(Boolean).join(' ') : '';
  const ex = [fl && 'flags ' + fl, pt === 58 && P.ICMPType && P.ICMPType !== '256' && `type ${P.ICMPType}`, pt === 58 && P.ICMPCode && P.ICMPCode !== '256' && `code ${P.ICMPCode}`,
    P.ToSType === '2' && `DSCP ${P.ToSValue}`, P.ToSType === '3' && `precedence ${P.ToSValue}`];
  return `${ACT[r.ruleAction] || r.ruleAction} ${pt === 256 || !P.protocolType ? 'IPv6' : PROTO[pt] || 'protocol ' + pt} from ${end(S, 'source')}${port(S, 'source')} to ${end(D, 'destination')}${port(D, 'destination')}${ex.filter(Boolean).map(x => ' ' + x).join('')}${r.timeRangeName ? ` during “${r.timeRangeName}”` : ''}`;
}
/* parsing what the user types */
const ip4ok = s => /^(\d{1,3})(\.\d{1,3}){3}$/.test(s) && s.split('.').every(x => +x < 256);
const ip4hex = s => s.split('.').map(x => (+x).toString(16).padStart(2, '0')).join('');
function parseIp4(s) { // 'any' | a.b.c.d | a.b.c.d/len | a.b.c.d w.x.y.z -> [ip, wildcard] | null; throws on bad input
  s = String(s || '').trim().toLowerCase(); if (!s || s === 'any') return null;
  let m = s.match(/^([\d.]+)\/(\d+)$/);
  if (m && ip4ok(m[1]) && +m[2] <= 32) { const w = +m[2] === 0 ? 0xffffffff : (2 ** (32 - m[2]) - 1); return [m[1], [24, 16, 8, 0].map(b => (w >>> b) & 255).join('.')]; }
  m = s.match(/^([\d.]+)(?:\s+(?:wildcard\s+)?([\d.]+))?$/);
  if (m && ip4ok(m[1]) && (!m[2] || ip4ok(m[2]))) return [m[1], m[2] || '0.0.0.0'];
  throw new Error(`“${s}”: use any, 10.0.0.0/8 or 10.0.0.0 0.0.0.255`);
}
function parsePort(s) { s = String(s || '').trim().toLowerCase(); if (!s || s === 'any') return null; const m = s.match(/^(\d+)(?:\s*-\s*(\d+))?$/);
  if (!m || +m[1] > 65535 || (m[2] && (+m[2] > 65535 || +m[2] <= +m[1]))) throw new Error(`port “${s}”: use 22 or 1024-65535`); return m[2] ? [+m[1], +m[2]] : [+m[1]]; }
function parseFlags(s) { const o = {}; for (const t of String(s || '').toLowerCase().split(/[\s,]+/).filter(Boolean)) { const m = t.match(/^([+-])(urg|ack|psh|rst|syn|fin)$/); if (!m) throw new Error(`flag “${t}”: use +syn -ack …`); o[m[2]] = m[1] === '+'; } return o; }
const macOk = s => /^([0-9a-f]{2}[:-]){5}[0-9a-f]{2}$/i.test(s);
function parseMac(s) { s = String(s || '').trim(); if (!s || s.toLowerCase() === 'any') return null; const [a, w] = s.split(/\s+(?:wildcard\s+)?/i);
  if (!macOk(a) || (w && !macOk(w))) throw new Error(`“${s}”: use any, 00:11:22:33:44:55 or 00:11:22:00:00:00 00:00:00:ff:ff:ff`); return [a.replace(/-/g, ':'), (w || '00:00:00:00:00:00').replace(/-/g, ':')]; }
const tryV = fn => v => { try { fn(v); return null; } catch (e) { return e.message; } };
const protoNum = a => a.proto === 'other' ? +a.protoNum : +a.proto;

/* MAC / IPv4 rule: tuples + ACE row on the form page (three tables), free tuple indexes read right before */
async function addTupleAce(kind, aclIdx, a, trs) {
  const page = kind === 'mac' ? 'mac' : 'ipv4', ts = [];
  if (kind === 'mac') {
    const s = parseMac(a.src), d = parseMac(a.dst);
    if (s) ts.push({ slot: 1, type: 10, v2: s[0] + s[1] });
    if (d) ts.push({ slot: 2, type: 11, v2: d[0] + d[1] });
    if (a.vlan) ts.push({ slot: 3, type: 12, v1: a.vlan });
    if (a.cos !== '' && a.cos != null && a.cos !== 'any') ts.push({ slot: 4, type: 16, v1: '0', v2: `0${a.cos}0${a.cosMask || '7'}` });
    if (a.eth) ts.push({ slot: 5, type: 17, v1: String(parseInt(a.eth, 16)) });
  } else {
    const pn = protoNum(a), tcp = pn === 6, udp = pn === 17, s = parseIp4(a.src), d = parseIp4(a.dst);
    if (a.proto !== 'any') ts.push({ slot: 1, type: 1, v2: pn.toString(16).padStart(2, '0').toUpperCase() + 'ff' });
    if (s) ts.push({ slot: 2, type: 2, v2: ip4hex(s[0]) + ip4hex(s[1]) });
    if (tcp || udp) {
      const sp = parsePort(a.sport), dp = parsePort(a.dport);
      if (sp) { ts.push({ slot: 3, type: sp[1] ? (tcp ? 29 : 25) : (tcp ? 8 : 6), v1: sp[0], v2: sp[1] ? undefined : '0000' }); if (sp[1]) ts.push({ slot: 6, type: tcp ? 30 : 26, v1: sp[1] }); }
      if (dp) { ts.push({ slot: 5, type: dp[1] ? (tcp ? 31 : 27) : (tcp ? 9 : 7), v1: dp[0], v2: dp[1] ? undefined : '0000' }); if (dp[1]) ts.push({ slot: 7, type: tcp ? 32 : 28, v1: dp[1] }); }
    }
    if (pn === 1 && a.itype !== '' && a.itype !== 'any') ts.push({ slot: 4, type: 19, v1: a.itype });
    if (pn === 1 && a.icode !== '' && a.icode !== 'any') ts.push({ slot: 5, type: 20, v1: a.icode });
    if (pn === 2 && a.itype !== '' && a.itype !== 'any') ts.push({ slot: 4, type: 21, v1: a.itype });
    const fl = tcp ? parseFlags(a.flags) : {};
    if (Object.keys(fl).length) { let b1 = 0, b2 = 63; FLAGS.forEach((n, i) => { const bit = 32 >> i; if (n in fl) { b2 &= ~bit; if (fl[n]) b1 |= bit; } }); ts.push({ slot: 8, type: 18, v2: b1.toString(16).padStart(2, '0') + b2.toString(16).padStart(2, '0') }); }
    else if (a.dscp !== '') ts.push({ slot: 8, type: 4, v1: a.dscp });
    else if (a.prec !== '') ts.push({ slot: 8, type: 5, v1: a.prec });
    if (d) ts.push({ slot: 9, type: 3, v2: ip4hex(d[0]) + ip4hex(d[1]) });
  }
  const add = await formRaw(`API/${page}_based_ACE_a.htm?[AceVT]Filter:(rlQosAceTidxAclIndex=${aclIdx})`);
  let free;
  if (kind === 'mac') { const f0 = parseInt(add['rlQosFreeIndexesValue$query'], 10); free = ts.map((t, j) => (Number.isFinite(f0) ? f0 : 2) + j); }
  else { free = ((await formRaw('API/ipv4_based_ACE_a_tupel.htm')).$all['rlQosFreeIndexesValue$query'] || []).map(Number); if (free.length < ts.length) throw new SwitchError('The switch has no free rule slots.'); }
  const trAct = a.tr ? (frows(null, 'rlTBITimeRangeName', add).find(r => r.rlTBITimeRangeName === a.tr) || {}).rlTBITimeRangeActiveStatus || (trs.find(t => t.timeRangeName === a.tr) || {}).timeRangeEnable || '1' : '2';
  const f = {};
  ts.forEach((t, j) => { const k = j + 1; f['rlQosTupleIndex$add' + k] = String(free[j]); f['rlQosTupleType$add' + k] = String(t.type);
    if (t.v1 != null) f['rlQosTupleValue1$add' + k] = String(t.v1); if (t.v2 != null) f['rlQosTupleValue2$add' + k] = String(t.v2); f['TupleVT$endAdd' + k] = 'OK'; });
  Object.assign(f, { 'rlQosAceTidxAclIndex$add': String(aclIdx), 'rlQosAceTidxIndex$add': String(a.prio), 'rlQosAceTidxAction$add': a.act, 'rlQosAceTidxTimeRange$add': a.tr || '',
    'rlQosAceTidxTimeRangeIsActive$add': trAct }, ...ts.map((t, j) => ({ [`rlQosAceTidxTuple${t.slot}$add`]: String(free[j]) })),
  { 'rlQosAceTidxType$add': kind === 'mac' ? '5' : String({ 6: 2, 17: 3, 1: 7, 2: 8 }[protoNum(a)] || 1), 'AceVT$endAdd': 'OK' });
  return api.formPost(`API/${page}_based_ACE_a.htm`, f, 'add rule');
}
function v6Rule(acl, a) {
  const pn = protoNum(a), tcp = pn === 6, udp = pn === 17, end = (s, pre) => {
    s = String(s || '').trim(); const o = { [pre + 'AddressType']: '1' };
    const pp = (tcp || udp) ? parsePort(pre === 'source' ? a.sport : a.dport) : null;
    o[pre + 'PortType'] = !pp ? '1' : pp[1] ? '4' : '2';
    if (pp) Object.assign(o, pp[1] ? { [pre + 'PortStart']: String(pp[0]), [pre + 'PortEnd']: String(pp[1]) } : { [pre + 'Port']: String(pp[0]) });
    if (s && s.toLowerCase() !== 'any') { const m = s.match(/^([0-9a-f:.]+)\/(\d+)$/i); if (!m || +m[2] > 128) throw new Error(`“${s}”: use any or 2001:db8::/32`); Object.assign(o, { [pre + 'AddressType']: '2', [pre + 'IPv6Address']: m[1], [pre + 'PrefixLength']: m[2] }); }
    return o;
  };
  const fl = tcp ? parseFlags(a.flags) : {}, P = { protocolType: a.proto === 'any' ? '256' : String(pn), Source: end(a.src, 'source'), Destination: end(a.dst, 'destination'),
    TCPFlags: Object.keys(fl).length ? Object.fromEntries(FLAGS.map(n => [n, n in fl ? (fl[n] ? '2' : '3') : '1'])) : '', ToSType: a.dscp !== '' ? '2' : a.prec !== '' ? '3' : '1' };
  if (tcp) P.TCPFlagsEnabled = Object.keys(fl).length ? '1' : '2';
  if (pn === 58) { P.ICMPType = a.itype === '' || a.itype === 'any' ? '256' : String(a.itype); P.ICMPCode = a.icode === '' || a.icode === 'any' ? '256' : String(a.icode); }
  if (P.ToSType !== '1') P.ToSValue = String(a.dscp !== '' ? a.dscp : a.prec);
  return { ACLName: acl, rulePriority: String(a.prio), ruleAction: a.act, IPv6Parameters: P, ...(a.tr ? { timeRangeName: a.tr } : {}) };
}
function ruleFields(type, trs, used) {
  const isp = v => ['6', '17'].includes(v.proto) || (v.proto === 'other' && ['6', '17'].includes(String(v.protoNum)));
  const pv = v => v.proto === 'other' ? String(v.protoNum) : v.proto;
  const common = [{ k: 'prio', label: 'Order', type: 'number', min: 1, help: 'lower numbers are checked first', validate: v => numIn(1, 2147483647)(v) || (used.includes(String(v)) ? 'already used in this list' : null) },
    { k: 'act', label: 'Action', type: 'seg', options: [['1', 'Permit'], ['2', 'Deny'], ['4', 'Deny + log'], ['3', 'Deny + shut port']] }];
  const tail = trs.length ? [{ k: 'tr', label: 'Only during', type: 'select', options: [['', 'always'], ...trs.map(t => t.timeRangeName)] }] : [];
  if (type === '1') return [...common,
    { k: 'src', label: 'From MAC', placeholder: 'any', help: 'any, a MAC, or MAC + wildcard (ff = ignore)', validate: tryV(parseMac) },
    { k: 'dst', label: 'To MAC', placeholder: 'any', validate: tryV(parseMac) },
    { k: 'vlan', label: 'VLAN', type: 'number', placeholder: 'any', validate: v => v === '' ? null : numIn(1, 4094)(v) },
    { k: 'cos', label: 'CoS', placeholder: 'any', validate: v => v === '' || /^[1-7]$/.test(v) ? null : '1–7 (0 cannot be matched)' },
    { k: 'cosMask', label: 'CoS mask', show: v => v.cos !== '', validate: v => /^[0-7]$/.test(v) ? null : '0–7' },
    { k: 'eth', label: 'Ethertype (hex)', placeholder: 'any, e.g. 0806', validate: v => v === '' || (/^(0x)?[0-9a-f]{1,4}$/i.test(v) && parseInt(v, 16) >= 0x5dd) ? null : '05DD–FFFF' }, ...tail];
  const protos = type === '2' ? [['any', 'Any IP'], ['6', 'TCP'], ['17', 'UDP'], ['1', 'ICMP'], ['2', 'IGMP'], ['other', 'Other number']] : [['any', 'Any IPv6'], ['6', 'TCP'], ['17', 'UDP'], ['58', 'ICMPv6'], ['other', 'Other number']];
  const ipv = type === '2' ? tryV(parseIp4) : v => !v || v.toLowerCase() === 'any' || /^[0-9a-f:.]+\/\d+$/i.test(v.trim()) ? null : 'any or 2001:db8::/32';
  return [...common, { k: 'proto', label: 'Protocol', type: 'select', options: protos },
    { k: 'protoNum', label: 'Protocol number', type: 'number', show: v => v.proto === 'other', validate: numIn(0, 255) },
    { k: 'src', label: 'From', placeholder: 'any', help: type === '2' ? 'any, 10.0.0.0/8, or address + wildcard' : 'any or 2001:db8::/32', validate: ipv },
    { k: 'sport', label: 'From port', placeholder: 'any', show: isp, validate: tryV(parsePort) },
    { k: 'dst', label: 'To', placeholder: 'any', validate: ipv },
    { k: 'dport', label: 'To port', placeholder: 'any', show: isp, validate: tryV(parsePort) },
    { k: 'flags', label: 'TCP flags', placeholder: 'e.g. +syn -ack', show: v => pv(v) === '6', validate: tryV(parseFlags) },
    { k: 'itype', label: pvLabel(type), placeholder: 'any', show: v => ['1', '2', '58'].includes(pv(v)), validate: v => v === '' || v === 'any' ? null : numIn(0, 255)(v) },
    { k: 'icode', label: 'ICMP code', placeholder: 'any', show: v => ['1', '58'].includes(pv(v)), validate: v => v === '' || v === 'any' ? null : numIn(0, 255)(v) },
    { k: 'dscp', label: 'DSCP', placeholder: 'any', show: v => v.prec === '' && !(type === '2' && v.flags), validate: v => v === '' ? null : numIn(0, 63)(v) },
    { k: 'prec', label: 'IP precedence', placeholder: 'any', show: v => v.dscp === '' && !(type === '2' && v.flags), validate: v => v === '' ? null : numIn(0, 7)(v) }, ...tail];
}
const pvLabel = type => type === '2' ? 'ICMP / IGMP type' : 'ICMP type';
const RULE0 = { act: '2', tr: '', src: '', dst: '', vlan: '', cos: '', cosMask: '7', eth: '', proto: 'any', protoNum: '', sport: '', dport: '', flags: '', itype: '', icode: '', dscp: '', prec: '' };

defSettings({
  id: 'acl', group: 'Traffic', title: 'Access lists (ACL)', icon: 'list',
  terms: 'acl ace access control list mac based ipv4 based ipv6 based rules permit deny firewall filter denied aces counters',
  keys: [A.list, A.mac, A.ip4, A.v6, A.tr, A.cnt],
  intro: 'Rules that permit or drop traffic as it enters (or leaves) a port. A list does nothing until a port uses it: pick lists in the port inspector (Access lists). Traffic that matches no rule is dropped.',
  render(c) {
    const lists = rows(c.get(A.list.key)), trs = rows(c.get(A.tr.key)), fA = [c.get(A.mac.key) || {}, c.get(A.ip4.key) || {}];
    const idx = new Map(), tup = new Map(), aces = new Map();
    for (const o of fA) {
      for (const r of frows(null, 'rlQosAclIndex', o)) if (r.rlQosAclName) idx.set(r.rlQosAclName, r.rlQosAclIndex);
      for (const t of frows(null, 'rlQosTupleIndex', o)) tup.set(t.rlQosTupleIndex, t);
      for (const a of frows(null, 'rlQosAceTidxIndex', o)) aces.set(a.rlQosAceTidxAclIndex + ':' + a.rlQosAceTidxIndex, a);
    }
    const v6 = rows(c.get(A.v6.key));
    const out = lists.map(L => {
      const t = L.ACLType, ai = idx.get(L.ACLName) || L.ACLID;
      const rs = t === '3' ? v6.filter(r => r.ACLName === L.ACLName).map(r => ({ prio: r.rulePriority, line: v6Line(r), r }))
        : [...aces.values()].filter(a => a.rlQosAceTidxAclIndex === String(ai)).map(a => ({ prio: a.rlQosAceTidxIndex, line: aceLine(a, tup), a }));
      rs.sort((x, y) => x.prio - y.prio);
      const used = rs.map(r => String(r.prio)), next = String((Math.floor(Math.max(0, ...rs.map(r => +r.prio)) / 10) + 1) * 10);
      return [c.table({
        title: `${ACLT[t]} list “${L.ACLName}”`, rows: rs, key: r => `rule ${r.prio}`, empty: 'No rules yet: everything is dropped once a port uses this list.',
        columns: [{ label: 'Order', num: true, get: r => r.prio }, { label: 'Rule', get: r => h('span', { class: 'mono' }, r.line) }],
        add: { label: 'Add rule', values: { ...RULE0, prio: next }, fields: ruleFields(t, trs, used),
          apply: a => t === '3' ? c.post('ACLRuleList', { ACLRuleEntry: v6Rule(L.ACLName, a) }) : (ai ? addTupleAce(t === '1' ? 'mac' : 'ip4', ai, a, trs) : Promise.reject(new Error('List index unknown; refresh and try again.'))) },
        remove: { confirm: r => `Rule ${r.prio} (${r.line}) is removed.`,
          apply: r => t === '3' ? c.post('ACLRuleList', { ACLRuleEntry: { ACLName: L.ACLName, rulePriority: r.prio } }, 'delete')
            : c.formPost(`API/${t === '1' ? 'mac' : 'ipv4'}_based_ACE.htm`, { 'rlQosAceTidxAclIndex$repeat?1': r.a.rlQosAceTidxAclIndex, 'rlQosAceTidxIndex$repeat?1': r.a.rlQosAceTidxIndex, 'rlQosAceTidxStatus$repeat?1': '6', 'AceVT$endRepeat?1': 'OK' }) },
      }), h('div', { class: 'acts' }, h('button', { class: 'btn sm danger', type: 'button', onclick: async e => {
        if (!await confirmBox(`Delete list “${L.ACLName}”?`, ['Its rules go with it. Remove it from every port first, or the switch refuses.'], 'Delete list', true)) return;
        await act(e.currentTarget, () => c.post('ACLList', { ACLEntry: { ACLName: L.ACLName, ACLType: t } }, 'delete'), 'Deleted. Not saved yet.').catch(() => {});
        journal.add([`Access lists: deleted “${L.ACLName}”`]); setTimeout(c.refresh, 1200);
      } }, 'Delete list'))];
    });
    out.push(c.form({ title: 'New list', values: { name: '', type: '2' }, applyLabel: 'Create list',
      fields: [{ k: 'type', label: 'Matches', type: 'seg', options: [['2', 'IPv4'], ['3', 'IPv6'], ['1', 'MAC']] },
        { k: 'name', label: 'Name', validate: v => /^.{1,32}$/.test(v.trim()) ? (lists.some(l => l.ACLName === v.trim()) ? 'already exists' : null) : '1–32 characters' }],
      apply: (ch, a) => c.post('ACLList', { ACLEntry: { ACLName: a.name.trim(), ACLType: a.type } }) }));
    const cnt = frows(A.cnt.key, 'rlQosDenyAceStatisticsIfIndex').filter(r => +r.rlQosDenyAceStatisticsIfCounter > 0);
    out.push(c.block('Dropped by deny rules', cnt.length ? c.kv(cnt.map(r => [ifName(r.rlQosDenyAceStatisticsIfIndex), count(r.rlQosDenyAceStatisticsIfCounter) + ' packets'])) : c.note('Nothing dropped since the last clear.'),
      h('button', { class: 'btn sm', type: 'button', onclick: e => act(e.currentTarget, () => c.formPost('API/rmon_ace_counters.htm', { rlQosDenyAceStatisticsClearOtherFlowCounter: '1', rlQosDenyAceStatisticsClearIfCounters: '0', aceCountersVT: 'OK', 'aceCountersVT$endVT': 'OK' }), 'Cleared.').then(() => setTimeout(c.refresh, 1200)).catch(() => {}) }, 'Clear (all ports)')));
    return out;
  },
});

/* per port: which lists run, and proprietary protocol filtering */
const AB = { id: 'aclb', live: (p, k) => qrow(A.bind.key, 'rlIfIndex', p)[k] ?? '0', text: (k, v) => {
  const n = v === '0' ? 'none' : `“${(frows(A.bind.key, 'rlQosAclIndex').find(a => a.rlQosAclIndex === v) || {}).rlQosAclName || v}”`;
  return { rlQosIfAclIn: 'incoming MAC/IPv4 list ', rlQosIfIpv6AclIn: 'incoming IPv6 list ', rlQosIfAclOut: 'outgoing MAC/IPv4 list ', rlQosIfIpv6AclOut: 'outgoing IPv6 list ' }[k] + n; } };
LPF.aclb = { label: 'access lists', run: async (p, f) => {
  const r = qrow(A.bind.key, 'rlIfIndex', p), i = String(ifx(p)), types = Object.fromEntries(frows(A.bind.key, 'rlQosAclIndex').map(a => [a.rlQosAclIndex, a.rlQosAclType]));
  for (const D of ['In', 'Out']) {
    const k1 = 'rlQosIfAcl' + D, k6 = 'rlQosIfIpv6Acl' + D;
    if (!(k1 in f) && !(k6 in f)) continue;
    const a = f[k1] ?? r[k1] ?? '0', b = f[k6] ?? r[k6] ?? '0';
    if (types[a] === '1' && b !== '0') throw new Error('A MAC list cannot be combined with an IPv6 list on the same port.');
    await fpost('API/acl_membership_table_e.htm', { 'rlIfIndex$query': i, 'rlIfType$query': r.rlIfType || '2', [k1 + '$query']: '0', [k6 + '$query']: '0', 'qosifPolicyVT$endQuery': 'OK',
      'rlIfIndex$query2': i, 'rlIfType$query2': r.rlIfType || '2', [k1 + '$query2']: a, [k6 + '$query2']: b, 'qosifPolicyVT$endQuery2': 'OK' }, [A.bind.key], 'access list binding');
  }
} };
const PPF = { id: 'ppf', live: p => (frows(A.ppf.key, 'ifIndex').find(r => r.ifIndex === String(ifx(p))) || {}).rlProtocolFilteringList || '00000000',
  text: (k, v) => v === '00000000' ? 'Cisco protocols pass' : `blocks ${ppfName(v)}` };
const PPF_N = ['all Cisco protocols', 'CDP', 'VTP', 'DTP', 'UDLD', 'PAgP', 'SSTP'];
const ppfName = v => v[0] === '1' ? PPF_N[0] : PPF_N.filter((n, i) => i && v[i] === '1').join(', ') || 'nothing';
LPF.ppf = { label: 'protocol filtering', run: async (p, f) => {
  const i = String(ifx(p)), e = await formRaw(`API/proprietary_protocol_filterring_e.htm?[protocolFilterVT]Query:ifIndex=${i}`), fl = {};
  if (e['ifIndex$query']) Object.assign(fl, { 'ifIndex$query': i, 'rlProtocolFilteringRowStatus$query': '6', 'protocolFilterVTable$endQuery': 'OK' });
  if (f.v !== '00000000') Object.assign(fl, { 'ifIndex$add': i, 'rlProtocolFilteringList$add': f.v, 'rlProtocolFilteringRowStatus$add': '4', 'protocolFilterVTable$endAdd': 'OK' });
  if (Object.keys(fl).length) await fpost('API/proprietary_protocol_filterring_e.htm', fl, [A.ppf.key], 'protocol filtering');
} };
defPortGroup({
  id: 'acl', title: 'Access lists', icon: 'list', order: 62, keys: [A.bind, A.ppf],
  summary(ports) {
    const p = ports[0], nm = v => v && v !== '0' ? (frows(A.bind.key, 'rlQosAclIndex').find(a => a.rlQosAclIndex === v) || {}).rlQosAclName || v : '';
    const L = ['rlQosIfAclIn', 'rlQosIfIpv6AclIn', 'rlQosIfAclOut', 'rlQosIfIpv6AclOut'].map(k => nm(AB.live(p, k))).filter(Boolean);
    return [L.length ? L.join(', ') : 'none', PPF.live(p) !== '00000000' && 'filters Cisco protocols'].filter(Boolean).join(' · ');
  },
  body(ports, c) {
    const acl = frows(A.bind.key, 'rlQosAclIndex'), o = types => [['0', 'none'], ...acl.filter(a => types.includes(a.rlQosAclType)).map(a => [a.rlQosAclIndex, `${ACLT[a.rlQosAclType]} · ${a.rlQosAclName}`])];
    const ppfOpts = [['00000000', 'Let them pass'], ['10000000', 'Block all (CDP, VTP, DTP, UDLD, PAgP, SSTP)'], ...PPF_N.slice(1).map((n, i) => ['0'.repeat(i + 1) + '1' + '0'.repeat(6 - i), 'Block ' + n])];
    return [
      lctl(ports, AB, { k: 'rlQosIfAclIn', label: 'Incoming: MAC or IPv4 list', type: 'select', options: o(['1', '2']) }),
      lctl(ports, AB, { k: 'rlQosIfIpv6AclIn', label: 'Incoming: IPv6 list', type: 'select', options: o(['3']), help: 'not together with a MAC list' }),
      lctl(ports, AB, { k: 'rlQosIfAclOut', label: 'Outgoing: MAC or IPv4 list', type: 'select', options: o(['1', '2']) }),
      lctl(ports, AB, { k: 'rlQosIfIpv6AclOut', label: 'Outgoing: IPv6 list', type: 'select', options: o(['3']) }),
      c.note('A port with a list drops everything no rule permits. A port takes access lists or a QoS policy, not both, and not together with protocol filtering.'),
      lctl(ports, PPF, { k: 'v', label: 'Cisco protocol frames', type: 'select', options: ppfOpts, help: 'proprietary protocol filtering (01:00:0c:cc:cc:cc/cd)' }),
      h('button', { class: 'btn sm ghost', type: 'button', onclick: () => c.settings('acl') }, icon('gear'), 'Edit lists…'),
    ];
  },
});

/* ---------- time ranges (used by ACL rules) ---------- */
const TR = { abs: kd(fk('security_time_range_m.htm')), rec: kd(fk('security_recurring_range_m.htm')) };
const tr2in = s => { const m = String(s || '').match(/^(\d\d) (\d\d) (\d\d) (\d\d?:\d\d)$/); return m ? `20${m[3]}-${m[1]}-${m[2]} ${m[4]}` : ''; };
const in2tr = s => { const m = String(s || '').trim().match(/^20(\d\d)-(\d\d)-(\d\d)[ T](\d\d?):(\d\d)$/); return m ? `${m[2]} ${m[3]} ${m[1]} ${m[4].padStart(2, '0')}:${m[5]}` : null; };
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
function parseDays(s) { // "mon-fri", "sat,sun", "all", "weekdays" -> 'MTWTFSS' bits + '0'
  s = String(s || '').toLowerCase().replace(/\s/g, ''); if (s === 'all' || s === 'every' || s === 'daily') s = 'mon-sun'; if (s === 'weekdays') s = 'mon-fri'; if (s === 'weekend') s = 'sat-sun';
  const ix = d => DAYS.findIndex(x => x.toLowerCase() === d.slice(0, 3)), on = Array(7).fill(0);
  for (const part of s.split(',').filter(Boolean)) { const [a, b] = part.split('-').map(ix); if (a < 0 || (b != null && b < 0)) throw new Error(`days “${part}”: use mon-fri, sat,sun or all`); for (let i = a; i <= (b ?? a); i++) on[i] = 1; }
  if (!on.some(Boolean)) throw new Error('pick at least one day'); return on.join('') + '0';
}
const hm = v => /^([01]?\d|2[0-3]):[0-5]\d$/.test(v) ? null : 'HH:MM';
function recLine(r) {
  const w = String(r.rlTBIPeriodicWeekDayList || ''), st = String(r.rlTBIPeriodicStart || ''), en = String(r.rlTBIPeriodicEnd || '');
  if (/1/.test(w)) { const d = DAYS.filter((x, i) => w[i] === '1'); return `${d.length === 7 ? 'every day' : d.join(', ')} ${st.replace(/^\d+\s*/, '')}–${en.replace(/^\d+\s*/, '')}`; }
  const dn = s => DAYS[(+s.split(' ')[0] || 1) - 1] + ' ' + (s.split(' ')[1] || '');
  return `weekly from ${dn(st)} to ${dn(en)}`;
}
defSettings({
  id: 'time-ranges', group: 'Traffic', title: 'Time ranges', icon: 'clock',
  terms: 'time range absolute periodic recurring recurrence schedule acl ace',
  keys: [TR.abs, TR.rec],
  intro: 'When an access-list rule is active. Uses the switch clock in local time (no daylight saving). With repeating times added, the rule is active only when both apply.',
  render(c) {
    const abs = frows(TR.abs.key, 'rlTBITimeRangeName'), rec = frows(TR.rec.key, 'rlTBIPeriodicTimeRangeName');
    const dt = { placeholder: 'YYYY-MM-DD HH:MM', validate: v => !v || in2tr(v) ? null : 'YYYY-MM-DD HH:MM' };
    const order = (v, a) => a.from && a.to && in2tr(a.from) && in2tr(a.to) && a.from > a.to ? 'the end is before the start' : null;
    const absBody = a => ({ start: a.from ? in2tr(a.from) : '', end: a.to ? in2tr(a.to) : '' });
    return [c.table({
      title: 'Time ranges', rows: abs, key: r => r.rlTBITimeRangeName, empty: 'No time ranges.', max: 10,
      columns: [{ label: 'Name', get: r => h('b', {}, r.rlTBITimeRangeName) }, { label: 'From', get: r => tr2in(r.rlTBITimeRangeAbsoluteStart) || 'now' },
        { label: 'Until', get: r => tr2in(r.rlTBITimeRangeAbsoluteEnd) || 'forever' }, { label: 'Repeats', get: r => rec.filter(x => x.rlTBIPeriodicTimeRangeName === r.rlTBITimeRangeName).map(recLine).join('; ') || '—' }],
      add: { label: 'Add time range', values: { name: '', from: '', to: '' },
        fields: [{ k: 'name', label: 'Name', validate: v => /^[A-Za-z0-9 ]{1,32}$/.test(v.trim()) ? (abs.some(x => x.rlTBITimeRangeName === v.trim()) ? 'already exists' : null) : 'letters, digits, spaces; 1–32' },
          { k: 'from', label: 'From', help: 'empty = now', ...dt }, { k: 'to', label: 'Until', help: 'empty = forever', ...dt, validate: (v, a) => dt.validate(v) || order(v, a) }],
        apply: a => { const b = absBody(a); return c.formPost('API/security_time_range_a.htm', { 'rlTBITimeRangeName$add': a.name.trim(), 'rlTBITimeRangeAbsoluteStart$add': b.start, 'rlTBITimeRangeAbsoluteEnd$add': b.end, 'rlTBITimeRangeRowStatus$add': '4', 'time_table$endAdd': 'OK' }); } },
      edit: { fields: () => [{ k: 'from', label: 'From', help: 'empty = now', ...dt }, { k: 'to', label: 'Until', help: 'empty = forever', ...dt, validate: (v, a) => dt.validate(v) || order(v, a) }],
        values: r => ({ from: tr2in(r.rlTBITimeRangeAbsoluteStart), to: tr2in(r.rlTBITimeRangeAbsoluteEnd) }),
        apply: (ch, a, r) => { const b = absBody(a); return c.formPost('API/security_time_range_m.htm', { 'rlTBITimeRangeName$query': r.rlTBITimeRangeName, 'rlTBITimeRangeAbsoluteStart$query': b.start, 'rlTBITimeRangeAbsoluteEnd$query': b.end, 'time_table$endQuery': 'OK' }); } },
      remove: { confirm: r => `Time range “${r.rlTBITimeRangeName}” is removed. Rules that use it must be removed first.`,
        apply: r => c.formPost('API/security_time_range_m.htm', { 'rlTBITimeRangeName$repeat?1': r.rlTBITimeRangeName, 'rlTBITimeRangeRowStatus$repeat?1': '6', 'time_table$endRepeat?1': 'OK' }) },
    }), abs.length ? c.table({
      title: 'Repeating times', rows: rec, key: r => `${r.rlTBIPeriodicTimeRangeName} ${recLine(r)}`, empty: 'None: ranges apply all day, every day.',
      columns: [{ label: 'Time range', get: r => r.rlTBIPeriodicTimeRangeName }, { label: 'When', get: r => recLine(r) }],
      add: { label: 'Add repeating time', values: { name: abs[0].rlTBITimeRangeName, kind: 'd', days: 'mon-fri', from: '08:00', to: '18:00', d1: '1', d2: '5' },
        fields: [{ k: 'name', label: 'Time range', type: 'select', options: abs.map(r => r.rlTBITimeRangeName) }, { k: 'kind', label: 'Repeats', type: 'seg', options: [['d', 'On these days'], ['w', 'Weekly span']] },
          { k: 'days', label: 'Days', help: 'mon-fri, sat,sun or all', show: v => v.kind === 'd', validate: tryV(parseDays) },
          { k: 'd1', label: 'From day', type: 'select', options: DAYS.map((d, i) => [String(i + 1), d]), show: v => v.kind === 'w' },
          { k: 'from', label: 'From', placeholder: 'HH:MM', validate: hm },
          { k: 'd2', label: 'To day', type: 'select', options: DAYS.map((d, i) => [String(i + 1), d]), show: v => v.kind === 'w' },
          { k: 'to', label: 'To', placeholder: 'HH:MM', validate: hm }],
        apply: a => { const z = t => t.padStart(5, '0'), d = a.kind === 'd';
          return c.formPost('API/security_recurring_range_a.htm', { 'rlTBIPeriodicTimeRangeName$Add': a.name, 'rlTBIPeriodicWeekDayList$Add': d ? parseDays(a.days) : '00',
            'rlTBIPeriodicStart$Add': `${d ? 0 : a.d1} ${z(a.from)}`, 'rlTBIPeriodicEnd$Add': `${d ? 0 : a.d2} ${z(a.to)}`, 'rlTBIPeriodicRowStatus$Add': '4', 'recurring_table$endAdd': 'OK' }); } },
      remove: { apply: r => c.formPost('API/security_recurring_range_m.htm', { 'rlTBIPeriodicTimeRangeName$repeat?1': r.rlTBIPeriodicTimeRangeName, 'rlTBIPeriodicWeekDayList$repeat?1': r.rlTBIPeriodicWeekDayList,
        'rlTBIPeriodicStart$repeat?1': r.rlTBIPeriodicStart, 'rlTBIPeriodicEnd$repeat?1': r.rlTBIPeriodicEnd, 'rlTBIPeriodicRowStatus$repeat?1': '6', 'recurring_table$endRepeat?1': 'OK' }) },
    }) : null];
  },
});

/* helpers 79-diag.js reuses (each feature file is its own block scope) */
pending.lx = { fk, kd, frows, fs, formRaw, fpost, cliRun, ifx, ifName, macFmt, getBit, setBit, rng, numIn, chipList, lctl, lval, LPF, tryV, qrow };
}
