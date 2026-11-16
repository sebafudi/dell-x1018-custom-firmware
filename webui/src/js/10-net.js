/* ---------- network: one request at a time, by priority; session upkeep ----------
 * The switch is slow (~1 s per request, mostly the TLS handshake) and gets slower with parallel requests, so every request
 * goes through one queue. Priorities: USER (clicks, writes) > VIEW (what's on screen) > KEEP (keepalive) > PREFETCH.
 * A request that hits an expired session is put back at the head of the queue, the queue pauses, and it runs again
 * after the user signs in, so nothing the user did is lost. */
const PRIO = { USER: 0, VIEW: 1, KEEP: 2, PREFETCH: 3 };

class AuthError extends Error { constructor(m) { super(m || 'Signed out'); this.auth = true; } }
class SwitchError extends Error {}

const net = {
  q: [], seq: 0, busy: null, paused: false,
  lat: [],            // recent request durations (ms), for prefetch back-off
  lastStart: 0, lastEnd: 0,

  enqueue(prio, label, run) {
    return new Promise((resolve, reject) => {
      this.q.push({ prio, label, run, resolve, reject, seq: this.seq++ });
      this.q.sort((a, b) => a.prio - b.prio || a.seq - b.seq);
      bus.emit('net');
      this.pump();
    });
  },
  pending(prio) { return this.q.filter(x => prio == null || x.prio <= prio).length + (this.busy && (prio == null || this.busy.prio <= prio) ? 1 : 0); },
  async pump() {
    if (this.busy || this.paused || !this.q.length) return;
    const it = this.busy = this.q.shift();
    bus.emit('net');
    const t0 = this.lastStart = Date.now();
    try {
      const r = await it.run();
      session.touch(t0);
      it.resolve(r);
    } catch (e) {
      if (e && e.auth) { this.q.unshift(it); this.paused = true; session.expired(); } // retried after sign-in
      else it.reject(e);
    } finally {
      this.lastEnd = Date.now();
      if (it.prio !== PRIO.KEEP) { this.lat.push(this.lastEnd - t0); if (this.lat.length > 15) this.lat.shift(); }
      this.busy = null;
      bus.emit('net');
      this.pump();
    }
  },
  resume() { this.paused = false; this.pump(); },
  median() { const v = [...this.lat].sort((a, b) => a - b); return v.length ? v[v.length >> 1] : 1200; },

  /* one HTTP exchange; throws AuthError for every shape an expired session takes */
  async fetch(url, opts = {}) {
    // never let one stuck request block the queue: abort after a timeout (slow sections pass a longer one)
    const ctl = new AbortController(), ms = opts.timeout || 25000, timer = setTimeout(() => ctl.abort(), ms);
    let res, text;
    try {
      res = await fetch(url, { credentials: 'same-origin', cache: 'no-store', ...opts, signal: ctl.signal });
      text = await res.text();
    } catch (e) {
      throw new SwitchError(ctl.signal.aborted ? `The switch did not answer within ${Math.round(ms / 1000)} s.` : 'The switch did not answer. Check the network connection.');
    } finally { clearTimeout(timer); }
    if (res.redirected && /log_off_page/.test(res.url)) throw new AuthError();          // forms, keepalive: 302 to the login shell
    if (res.status >= 500) throw new SwitchError(`The switch returned HTTP ${res.status}.`);
    return { res, text };
  },
};

/* all <input>s of a RomPager form page: [{name, value, disabled}] (names and attributes come quoted or not, in any case) */
function formInputs(text) { // <input>s and <select>s in document order (a select's value is its selected option)
  const out = [];
  for (const m of text.matchAll(/<(input|select)\b([^>]*)>/gi)) {
    if (m[1].toLowerCase() === 'select') { const end = text.indexOf('</', m.index + m[0].length); m[3] = text.slice(m.index + m[0].length, end < 0 ? undefined : text.toLowerCase().indexOf('</select', m.index)); }
    const a = m[2], name = (a.match(/\bname\s*=\s*("([^"]*)"|[^\s>]+)/i) || [])[2] ?? (a.match(/\bname\s*=\s*([^\s>]+)/i) || [])[1];
    if (!name) continue;
    let value;
    if (m[1].toLowerCase() === 'select') { const o = (m[3] || '').match(/<option\b[^>]*\bselected\b[^>]*>/i) || (m[3] || '').match(/<option\b[^>]*>/i); value = o ? ((o[0].match(/\bvalue\s*=\s*("([^"]*)"|[^\s>]*)/i) || [])[2] ?? (o[0].match(/\bvalue\s*=\s*([^\s>]*)/i) || [])[1] ?? '') : ''; }
    else { const vm = a.match(/\bvalue\s*=\s*("([^"]*)"|[^\s>]*)/i); value = vm ? (vm[2] ?? vm[1]) : ''; }
    out.push({ name: name.replace(/^"|"$/g, ''), value: unent(value), disabled: /\bdisabled\b/i.test(a) });
  }
  return out;
}
const unent = s => String(s).replace(/&(#\d+|#x[0-9a-f]+|nbsp|amp|lt|gt|quot|apos|#39);/gi, (_, e) => e[0] === '#' ? String.fromCharCode(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : +e.slice(1)) : { nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }[e.toLowerCase()]);
/* ---------- XML (wcd) ---------- */
function conv(el) {
  if (!el.children.length) return el.textContent.trim();
  const o = {};
  for (const c of el.children) {
    const v = conv(c), k = c.tagName;
    if (k in o) { if (!Array.isArray(o[k])) o[k] = [o[k]]; o[k].push(v); } else o[k] = v;
  }
  return o;
}
function parseXml(text) {
  const i = text.indexOf('<?xml');
  if (i < 0) throw new AuthError(); // HTML where XML was expected: the login shell
  const doc = new DOMParser().parseFromString(text.slice(i), 'text/xml');
  const out = {};
  const dc = doc.querySelector('DeviceConfiguration');
  for (const el of dc ? dc.children : []) if (el.tagName !== 'version') out[el.tagName] = conv(el);
  const st = doc.querySelector('ActionStatus');
  const code = st && (st.querySelector('statusCode') || {}).textContent || '';
  const msg = st && (st.querySelector('statusString') || {}).textContent || '';
  if (code === '4' && /not authenticated/i.test(msg)) throw new AuthError();             // wcd: HTTP 200 + statusCode 4
  out._status = { code, msg };
  return out;
}
function toXml(obj) {
  let s = '';
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined) continue;
    for (const item of Array.isArray(v) ? v : [v])                                       // arrays -> repeated elements
      s += `<${k}>${item !== null && typeof item === 'object' ? toXml(item) : esc(item == null ? '' : String(item))}</${k}>`;
  }
  return s;
}

/* ---------- API ---------- */
const api = {
  /* read several wcd sections in one request */
  get(sections, prio = PRIO.VIEW) {
    const q = sections.map(s => `{${s}}`).join('');
    return net.enqueue(prio, 'read ' + sections.join(' '), async () => {
      const r = parseXml((await net.fetch(`${BASE}/wcd?${q}`)).text);
      if (r._status.code && r._status.code !== '0') throw new SwitchError(r._status.msg || 'The switch could not read this.');
      return r;
    });
  },
  /* write: blocks = [{section, action, body}] in one document (e.g. a delete block then a set block) */
  post(blocks, label, opts = {}) {
    if (!Array.isArray(blocks)) blocks = [blocks];
    const xml = `<?xml version='1.0' encoding='utf-8'?><DeviceConfiguration>${blocks.map(b =>
      `<${b.section} action="${b.action}">${toXml(b.body)}</${b.section}>`).join('')}</DeviceConfiguration>`;
    return net.enqueue(PRIO.USER, label || 'write ' + blocks[0].section, async () => {
      const r = parseXml((await net.fetch(`${BASE}/wcd?{${blocks[0].section}}`, {
        method: 'POST', body: xml, headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
      })).text);
      if (r._status.code !== '0') throw new SwitchError(r._status.msg || 'The switch rejected the change.');
      if (!opts.readOnly) bus.emit('wrote', blocks);
      return r;
    });
  },
  /* RomPager form page -> {name: value} */
  form(path, prio = PRIO.VIEW) {
    return net.enqueue(prio, 'read ' + path, async () => {
      const { text } = await net.fetch(`${BASE}/${path}`);
      if (!/<form|<input/i.test(text)) throw new AuthError();
      const out = {};
      for (const m of text.matchAll(/<input[^>]*?name="?([^"\s>]+)"?[^>]*?value="([^"]*)"/gi)) out[m[1]] = m[2];
      return out;
    });
  },
  /* RomPager form write: POST API/<page>.htm with only the fields to change (plus their end markers, e.g.
   * '<Table>$endRepeat?1': 'OK'). restoreUrl/errorCollector are added. Errors come back in a hidden 'mibError' input. */
  formPost(path, fields, label, opts = {}) {
    // fields: {name: value} or [[name, value], ...] when a name repeats.
    // Row-creating posts ($add fields) also need the page's own enabled inputs (table marker, $VT descriptors, $end markers),
    // as the classic form serialisation sends them: read the page first and include them (opts.full forces this).
    const pairs = Array.isArray(fields) ? fields : Object.entries(fields);
    const full = opts.full ?? pairs.some(([k]) => /\$add$/.test(k));
    return net.enqueue(PRIO.USER, label || 'write ' + path, async () => {
      if (!full && pairs.some(([k]) => /\$query$/.test(k))) {
        // edit ($query) posts: the page's own field order, opened by its <VT>$query marker when the page has one
        // (without it the switch answers "Might be missing parameters (...)"); nothing else from the page is added
        const tpl = api._tpl[path] || (api._tpl[path] = formInputs((await net.fetch(`${BASE}/${path}`)).text).map(i => i.name));
        const at = n => { const i = tpl.indexOf(n); return i < 0 ? 1e9 : i; };
        const out = [...pairs];
        for (const [k] of pairs) { const m = k.match(/^(.*)\$endQuery$/); if (m && tpl.includes(m[1] + '$query') && !out.some(([x]) => x === m[1] + '$query')) out.push([m[1] + '$query', 'OK']); }
        out.sort((a, b) => at(a[0]) - at(b[0]));
        return api._formSend(path, [['restoreUrl', ''], ['errorCollector', ''], ...out]);
      }
      if (!full) return api._formSend(path, [['restoreUrl', ''], ['errorCollector', ''], ...pairs]);
      // in page order (RomPager reads the fields in sequence): our value where the page has the field, the page's enabled inputs as they are
      const { text } = await net.fetch(`${BASE}/${opts.from || path}`);
      if (!/<input/i.test(text)) throw new AuthError();
      const mine = new Map(pairs), used = new Set(), out = [];
      for (const i of formInputs(text)) {
        if (mine.has(i.name) && !used.has(i.name)) { out.push([i.name, mine.get(i.name)]); used.add(i.name); }
        else if (!i.disabled && !mine.has(i.name)) out.push([i.name, i.value]);
      }
      for (const [k, v] of pairs) if (!used.has(k)) out.push([k, v]);
      return api._formSend(path, out);
    });
  },
  _tpl: {},
  async _formSend(path, all) {
    const body = all.map(([k, v]) => encodeURIComponent(k) + '=' + encodeURIComponent(v == null ? '' : String(v))).join('&');
    const { text } = await net.fetch(`${BASE}/${path}`, { method: 'POST', body, headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' } });
    const err = (text.match(/name="?mibError"?[^>]*value="([^"]*)"/i) || [])[1];
    if (err) throw new SwitchError(unent(decodeURIComponent(err.replace(/^.*Diag=/, ''))).replace(/'$/, '').trim() || 'The switch rejected the change.');
    if (!/<form|<input|<html/i.test(text)) throw new AuthError();
    bus.emit('wrote', [{ section: 'form:' + path }]);
    return text;
  },
  /* Remote CLI: run commands, return the output lines */
  async cli(cmds, label, opts = {}) { // opts.readOnly: 'show' commands, not a configuration change
    // 'terminal ...' commands crash the switch's remote CLI task (fatal error + reboot, seen 2026-11-16): never send them
    if (cmds.some(c => /^\s*term/i.test(c))) throw new SwitchError('Terminal commands are not allowed through the web CLI.');
    const body = { Entry: ['exit', 'exit', ...cmds].map(c => ({ commandText: c })) };
    await api.post({ section: 'RemoteCLITable', action: 'set', body }, label || 'cli', opts);
    for (let i = 0; i < 20; i++) {
      const r = await api.get(['ConfigInfoStatus'], PRIO.USER);
      if ((r.ConfigInfoStatus || {}).state === '6') break;
      await sleep(700);
    }
    const r = await api.get(['RemoteCLIOutputTable'], PRIO.USER);
    return arr((r.RemoteCLIOutputTable || {}).text).join('').split('\n').map(s => s.trimEnd()).filter(Boolean);
  },
  async login(user, pass) {
    const enc = s => s.replace(/[#%&+]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase());
    const res = await fetch(`${BASE}/config/System.xml?action=login&user=${enc(user)}&password=${enc(pass)}`, { cache: 'no-store' });
    const text = await res.text();
    const code = ((text.match(/<statusCode>\s*([^<]*?)\s*<\/statusCode>/) || [])[1]) || '';
    const lvl = ((text.match(/<usrPrivLvl>\s*([^<]*?)\s*<\/usrPrivLvl>/) || [])[1]) || '15';
    const sid = res.headers.get('sessionID');
    const ok = { '0': 'ok', '00': 'ok', '10': 'noStrong', '12': 'noStrong', '9': 'expired', '13': 'willExpire' }[code];
    if (!ok) {
      const msg = { '1': 'Wrong user name or password.', '2': 'Wrong user name or password.', '3': 'Too many failed attempts. Wait a minute and try again.',
        '4': 'Too many sessions are open on the switch.', '5': 'This account is locked.' }[code];
      throw new Error(msg || `Sign-in failed (code ${code || '?'}).`);
    }
    // the same cookies the classic UI sets, so its pages keep working with this session
    if (sid) cookie.set('sessionID', sid.split(';')[0]);
    cookie.set('userStatus', ok, 1);
    cookie.set('ContaxUserName', encodeURIComponent(user), 1);
    cookie.set('PriviligeLevel', lvl, 1);
    if (!cookie.get('DeviceMode')) cookie.set('DeviceMode', '1');
    store.set('user', user);
    return ok;
  },
  async logout() {
    try { await fetch(`${BASE}/System.xml?action=logout`, { cache: 'no-store' }); } catch { /* ignore */ }
    cookie.del('sessionID'); cookie.del('userStatus');
  },
};

/* ---------- session: keepalive while the tab is visible; inline sign-in on expiry ----------
 * The switch drops a session ~60 s after the last request, whatever the configured web timeout says
 * (webui/README.md). Any request resets that timer, so the keepalive only fires when nothing else went out. */
const session = {
  timeout: 60000, // measured; not learned at run time (a reboot or a sign-out elsewhere also ends sessions and taught it nonsense)
  last: 0,        // start time of the last request that the switch accepted
  state: 'unknown', // 'ok' | 'expired' | 'unknown'
  pingFail: false,  // the last keepalive could not reach the switch (network trouble): only then the "expires in" bar shows
  timer: null,
  touch(t) { this.last = Math.max(this.last, t); if (this.state !== 'ok') { this.state = 'ok'; bus.emit('session'); } },
  left() { return this.last ? this.timeout - (Date.now() - this.last) : 0; },
  expired() { if (this.state !== 'expired') { this.state = 'expired'; bus.emit('session'); } },
  ping(prio = PRIO.KEEP) {
    return net.enqueue(prio, 'keepalive', async () => {
      const { text } = await net.fetch(`${BASE}/device/authenticate_user.xml`);
      if (!/periodic authentication/i.test(text)) throw new AuthError();
      return true;
    }).then(r => { this.pingFail = false; return r; }, e => { if (!e.auth) this.pingFail = true; throw e; });
  },
  hiddenAt: Date.now(),
  /* how long a background tab keeps the session (ms; 0 = only while visible, -1 = always); Session sheet */
  bg() { const v = store.get('keepBg'); return v == null ? 3600e3 : v; },
  start() {
    clearInterval(this.timer); this.worker && this.worker.terminate();
    store.del('sessTimeout');
    // a worker's timer is not slowed down in background tabs (a page's is, to once a minute: too late for a 60 s session)
    try { this.worker = new Worker(URL.createObjectURL(new Blob(['setInterval(() => postMessage(0), 4000)'], { type: 'text/javascript' }))); this.worker.onmessage = () => this.tick(); }
    catch { this.timer = setInterval(() => this.tick(), 4000); }
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.hiddenAt = Date.now(); else this.tick(true); });
  },
  keepsAlive() { const bg = this.bg(); return !document.hidden || bg < 0 || (bg > 0 && Date.now() - this.hiddenAt < bg); },
  tick(wake) {
    bus.emit('session-tick');
    if (!this.keepsAlive() || this.state !== 'ok' || net.paused) return;
    if (net.busy || net.q.some(x => x.prio <= PRIO.KEEP)) return;       // something is already going out
    const idle = Date.now() - this.last;
    if ((wake && idle > 10000) || idle >= this.timeout / 2) this.ping().catch(() => {}); // every ~30 s of silence
  },
};
