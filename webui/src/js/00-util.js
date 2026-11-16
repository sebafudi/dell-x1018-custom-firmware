/* x1018 web UI v2. Source files in src/js are concatenated in name order into two classic scripts (bundle.py):
 * the core (loaded by the shell) and the features (72-79, loaded after the first render). They share one global scope. No dependencies. */
const BASE = location.pathname.replace(/\/config\/[^/]*$/, '').replace(/\/$/, '');
const MORE_URL = document.currentScript && document.currentScript.dataset.more; // the feature bundle, loaded after the first render

/* ---------- DOM ---------- */
/* replaceChildren/append ignore null/undefined/false and flatten arrays, like h() does (instead of rendering "null") */
for (const P of [Element.prototype, DocumentFragment.prototype]) for (const fn of ['replaceChildren', 'append', 'prepend']) {
  const orig = P[fn];
  P[fn] = function (...kids) { return orig.apply(this, kids.flat(Infinity).filter(k => k != null && k !== false)); };
}
function h(tag, attrs, ...kids) {
  const el = tag === 'svg' || attrs?.svg ? document.createElementNS('http://www.w3.org/2000/svg', tag) : document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false || k === 'svg') continue;
    if (k === 'class') el.setAttribute('class', Array.isArray(v) ? v.filter(Boolean).join(' ') : v);
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'ref') v(el);
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, v);
  }
  for (const c of kids.flat(Infinity)) if (c != null && c !== false) el.append(c instanceof Node ? c : String(c));
  return el;
}
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const arr = x => (x == null || x === '') ? [] : Array.isArray(x) ? x : [x];
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* ---------- tiny event bus ---------- */
const bus = {
  m: new Map(),
  on(ev, fn) { if (!this.m.has(ev)) this.m.set(ev, new Set()); this.m.get(ev).add(fn); return () => this.m.get(ev).delete(fn); },
  emit(ev, arg) { for (const fn of this.m.get(ev) || []) { try { fn(arg); } catch (e) { console.error(e); } } },
};

/* ---------- VLAN lists ("1-3,10" <-> Set) ---------- */
function parseList(s) {
  const out = new Set();
  for (const part of String(s || '').split(',')) {
    const m = part.trim().match(/^(\d+)(?:-(\d+))?$/);
    if (!m) continue;
    const a = +m[1], b = m[2] ? +m[2] : a;
    if (b - a > 5000) continue;
    for (let i = a; i <= b; i++) out.add(i);
  }
  return out;
}
function fmtList(set) {
  const v = [...set].sort((a, b) => a - b), out = [];
  for (let i = 0; i < v.length; i++) {
    let j = i;
    while (j + 1 < v.length && v[j + 1] === v[j] + 1) j++;
    out.push(j > i ? `${v[i]}-${v[j]}` : `${v[i]}`);
    i = j;
  }
  return out.join(',');
}
const validList = s => /^\s*\d+(\s*-\s*\d+)?(\s*,\s*\d+(\s*-\s*\d+)?)*\s*$/.test(s) &&
  [...parseList(s.replace(/\s/g, ''))].every(n => n >= 1 && n <= 4094);

/* ---------- formatting ---------- */
function bytes(n) {
  n = +n || 0;
  const u = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  while (n >= 1000 && i < u.length - 1) { n /= 1000; i++; }
  return `${n >= 100 || i === 0 ? Math.round(n) : n.toFixed(1)} ${u[i]}`;
}
const count = n => (+n || 0).toLocaleString();
function uptime(ticks) { // hundredths of a second
  let s = Math.floor((+ticks || 0) / 100);
  const d = Math.floor(s / 86400); s %= 86400;
  const hh = Math.floor(s / 3600), mm = Math.floor(s % 3600 / 60);
  return d ? `${d}d ${hh}h` : hh ? `${hh}h ${mm}m` : `${mm}m`;
}
function age(ms) { // "12 s", "4 min", "3 h", "2 days"
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s} s`;
  if (s < 3600) return `${Math.round(s / 60)} min`;
  if (s < 86400 * 2) return `${Math.round(s / 3600)} h`;
  return `${Math.round(s / 86400)} days`;
}
function logTime(s) { // "11152026 22:00:46" -> "15 Nov 22:00:46"
  const m = String(s).match(/^(\d\d)(\d\d)(\d{4})\s+(.*)$/);
  if (!m) return s;
  const mon = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][+m[1] - 1] || m[1];
  return `${+m[2]} ${mon} ${m[4]}`;
}
const portNo = name => +(String(name).match(/(\d+)$/) || [0, 0])[1];

/* ---------- storage ---------- */
const store = {
  get(k) { try { return JSON.parse(localStorage.getItem('x1018:' + k)); } catch { return null; } },
  set(k, v) {
    try { localStorage.setItem('x1018:' + k, JSON.stringify(v)); return true; } catch {
      store.evict(); // quota: drop the oldest cached resources and retry once
      try { localStorage.setItem('x1018:' + k, JSON.stringify(v)); return true; } catch { return false; }
    }
  },
  del(k) { try { localStorage.removeItem('x1018:' + k); } catch { /* ignore */ } },
  keys(prefix) { const out = []; try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k.startsWith('x1018:' + prefix)) out.push(k.slice(6)); } } catch { /* ignore */ } return out; },
  evict() {
    const items = store.keys('r:').map(k => [k, (store.get(k) || {}).at || 0]).sort((a, b) => a[1] - b[1]);
    for (const [k] of items.slice(0, Math.ceil(items.length / 3))) store.del(k);
  },
};
const cookie = {
  get(n) { return (document.cookie.match(new RegExp('(?:^|; )' + n + '=([^;]*)')) || [])[1]; },
  set(n, v, days) {
    const exp = days ? '; expires=' + new Date(Date.now() + days * 864e5).toUTCString() : '';
    document.cookie = `${n}=${v}${exp}; path=/`;
  },
  del(n) { document.cookie = `${n}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`; },
};
