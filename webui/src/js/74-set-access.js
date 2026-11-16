{ // block scope: nothing here leaks into the shared bundle scope
/* ---------- Settings: Access and security (users, passwords, services, management ACL, sign-in methods, RADIUS, TACACS+, sessions) ----------
 * Every write here can lock the owner out of their own switch, so every form and table asks first and says how.
 * Form-page (RomPager) writes send only the fields being changed plus their end markers (docs/classic-api/system-and-management.md, part C). */
ICONS.user = '<circle cx="8" cy="5" r="2.8"/><path d="M2.5 14c.6-3 2.8-4.5 5.5-4.5s4.9 1.5 5.5 4.5"/>';
ICONS.key = '<circle cx="5" cy="8" r="3"/><path d="M8 8h6.5M12 8v2.5M14 8v2"/>';

/* rows of a RomPager form page: {'col$repeat?N': v} -> [{_n: N, col: v}], only rows that have `lead` */
function repRows(v, lead, suf = '$repeat?') {
  const out = [];
  for (const [k, val] of Object.entries(v || {})) {
    const i = k.indexOf(suf), n = i < 0 ? 0 : +k.slice(i + suf.length);
    if (n > 0) (out[n] = out[n] || { _n: n })[k.slice(0, i)] = val;
  }
  return out.filter(r => r && (!lead || r[lead] != null));
}
/* confirmation inside a table add/edit apply (tableView has no `danger`): throws when declined */
async function guard(title, msg) {
  if (msg && !await confirmBox(title, arr(msg), 'Apply anyway', true)) throw new Error('Cancelled. Nothing was sent to the switch.');
}
/* a resource read only when the user asks (slow or sensitive); cached value shown with its age */
function demandBox(key, load, label, view) {
  const box = h('div');
  const draw = () => {
    const e = data.entry(key);
    box.replaceChildren(h('div', { class: 'acts' }, h('button', { class: 'btn sm', type: 'button', onclick: ev => act(ev.currentTarget, async () => { data.put(key, await load()); draw(); }).catch(() => {}) },
      icon('refresh'), e ? 'Read again' : label), e ? h('span', { class: 'mu' }, 'read ' + age(Date.now() - e.at) + ' ago') : null), e ? view(e.v) : null);
  };
  draw();
  return box;
}
/* Remote CLI config commands; '%' lines are the CLI's error messages */
async function cliCfg(cmds, label) {
  const out = await api.cli(['configure', ...cmds, 'end'], label);
  const bad = out.filter(l => /^\s*%/.test(l));
  if (bad.length) throw new SwitchError(bad.join(' '));
  return out;
}
const rng = (a, b, blank) => v => (blank && String(v ?? '') === '') || (/^\d+$/.test(String(v).trim()) && +v >= a && +v <= b) ? null : `enter a whole number from ${a} to ${b}${blank ? ' or leave it empty' : ''}`;
const isIp = v => /^(\d{1,3}\.){3}\d{1,3}$/.test(v) ? v.split('.').every(x => +x < 256) : /^[0-9a-f:.]+$/i.test(v) && v.includes(':');
const ipOk = v => isIp(String(v || '').trim()) ? null : 'enter an IPv4 or IPv6 address';
const myIp = () => (decodeURIComponent(cookie.get('sessionID') || '').match(/UserId=([\d.:a-f]+)/i) || [])[1] || '';
const myProto = () => location.protocol === 'https:' ? 'HTTPS' : 'HTTP';
const me = () => store.get('user') || '';
const pwPair = (minLen) => [
  { k: 'pw', label: 'Password', type: 'password', validate: v => (v || '').length < Math.max(1, minLen || 0) ? `at least ${Math.max(1, minLen || 0)} characters` : v.length > 64 ? 'at most 64 characters' : null },
  { k: 'pw2', label: 'Confirm password', type: 'password', validate: (v, a) => v === a.pw ? null : 'the two passwords differ' },
];
const PWK = 'form:API/pswrd_mgmt.htm';
const minPw = c => fv(PWK, 'rlAAAPasswordComplexityEnabled') === '1' ? +fv(PWK, 'rlAAAMinPasswordLength') || 0 : 0;
const LVL = [['1', '1 · read-only'], ['15', '15 · full control']];
const OWNSELF = 'If this is the account you are signed in with, the new password is needed the next time you sign in.';

/* ---------- Users (Local User Database) ---------- */
const USERS = 'x:users'; // auth_table_TIC.htm: names, levels, expiry, lock state (no hashes); ~2–8 s, so read on demand. AdminUserSetting is never read.
const loadUsers = () => api.form('API/auth_table_TIC.htm', PRIO.USER).then(v => repRows(v, 'rlAAALocalUserName').map(r =>
  ({ name: r.rlAAALocalUserName, lvl: r.rlAAALocalUserPrivilage, exp: r.rlAAALocalPasswordExpieryDate, locked: r.rlAAALocalLockedState === '0' })));
defSettings({
  id: 'users', group: 'Access and security', title: 'Users', icon: 'user', terms: 'local user database username password privilege level admin account add delete change password',
  keys: [PWK],
  intro: 'Accounts that can sign in to this page, SSH, Telnet and the console. Level 15 can change everything; level 1 can only look.',
  render(c) {
    const reload = async () => data.put(USERS, await loadUsers());
    return [demandBox(USERS, loadUsers, 'Show users', list => c.table({
      rows: list, key: r => r.name, empty: 'No local users.',
      columns: [{ label: 'User', get: r => h('span', {}, h('b', {}, r.name), r.name === me() ? h('span', { class: 'mu' }, ' (you)') : null) },
        { label: 'Level', get: r => h('span', { class: 'chip' }, r.lvl === '15' ? '15 · full' : r.lvl === '1' ? '1 · read-only' : r.lvl) },
        { label: 'Password expires', get: r => r.exp && r.exp !== '0' ? r.exp : 'never' },
        { label: 'State', get: r => r.locked ? h('span', { class: 'warn' }, h('span', { class: 'led ly' }), ' locked out') : 'usable' }],
      add: { label: 'Add user', values: { lvl: '15' },
        fields: [{ k: 'name', label: 'User name', validate: v => /^[^\s"'?]{1,20}$/.test(v || '') ? null : '1–20 characters, no spaces or quotes' },
          { k: 'lvl', label: 'Access level', type: 'seg', options: LVL }, ...pwPair(minPw(c))],
        apply: async a => {
          if (list.some(r => r.name === a.name)) throw new Error(`User ${a.name} already exists: use Edit.`);
          await guard('Add user', a.lvl === '15' ? `${a.name} gets full control of the switch, including changing or deleting your own account (${me() || 'you'}).` : null);
          await c.formPost('API/auth_table_TIC.htm', { 'rlAAALocalUserName$add': a.name, 'rlAAALocalUserPrivilage$add': a.lvl, 'rlAAALocalUserPassword$add': '$' + a.pw,
            'rlAAALocalHostStatus$add': '4', 'LocalUserTable$endAdd': 'OK' });
          await reload();
        } },
      edit: { values: r => ({ lvl: r.lvl, pw: '', pw2: '', unlock: '2' }),
        fields: r => [{ k: 'lvl', label: 'Access level', type: 'seg', options: LVL },
          ...pwPair(minPw(c)).map(f => ({ ...f, label: 'New ' + f.label.toLowerCase(), help: f.k === 'pw' ? 'Required: the switch stores level and password together.' : null })),
          r.locked ? { k: 'unlock', label: 'Unlock (reactivate) this user', type: 'toggle', on: '1', off: '2' } : null].filter(Boolean),
        apply: async (ch, a, r) => {
          const self = r.name === me(), admins = list.filter(x => x.lvl === '15');
          await guard('Change user ' + r.name, [self ? `This is the account you are signed in with (${r.name}). The new password is needed the next time you sign in; this session keeps working.` : `The password of ${r.name} changes right away; anyone using it must use the new one.`,
            a.lvl === '1' && r.lvl === '15' ? (self ? 'You also lower your own level to read-only: you can no longer change settings, including this one.' : admins.length <= 1 ? 'This is the last level-15 user: nobody could change settings any more.' : `${r.name} can no longer change settings.`) : null].filter(Boolean));
          const f = { 'rlAAALocalUserName$query': r.name, 'rlAAALocalUserPrivilage$query': a.lvl, 'rlAAALocalHostStatus$query': '1', 'rlAAALocalUserPassword$query': '$' + a.pw };
          if (a.unlock === '1') f['rlAAAUnlockUserName$scalar'] = r.name;
          await c.formPost('API/auth_table_TIC_e.htm', f);
          await reload();
        } },
      remove: { confirm: r => r.name === me() ? `${r.name} is the account you are signed in with. This page keeps working until the session ends, then you cannot sign in with it again. Make sure another level-15 user exists and you know its password.`
          : list.filter(x => x.lvl === '15').length <= 1 && r.lvl === '15' ? `${r.name} is the last level-15 user: after this nobody can sign in with full control.` : `${r.name} can no longer sign in. Active sessions of this user continue until they end.`,
        apply: async r => {
          await c.formPost('API/auth_table_TIC.htm', { 'rlAAALocalUserName$repeat?1': r.name, 'rlAAALocalHostStatus$repeat?1': '6', 'LocalUserTable$endRepeat?1': 'OK' });
          await reload();
        } },
    })), c.note('The list is read only when you ask: the switch is slow to list users.')];
  },
});

/* ---------- Password rules (Global Password Management) ---------- */
const PWF = [ // [key, form field, label, hint, min, max]
  ['rep', 'rlAAAPasswordComplexityCharRepeat', 'Max repeated characters', '0 = no limit', 0, 16],
  ['min', 'rlAAAMinPasswordLength', 'Minimum length', '0 = no minimum, otherwise 8–64', 0, 64],
  ['att', 'rlAAAMaxNumLogAttmpts$hidden', 'Lock after wrong passwords', 'failed sign-ins in a row before the account locks; 0 = never', 0, 5],
  ['age', 'rlAAAPasswordGlobalAgingTime$input', 'Passwords expire after', 'days (aging); 0 = never. Needs SNTP time', 0, 365],
  ['hist', 'rlAAAPasswordHistSize', 'Remember old passwords', 'how many previous passwords cannot be reused; 0 = off', 0, 10],
  ['hold', 'rlAAAPasswordHistHoldTime$input', 'Keep old passwords for', 'days; 0 = off', 0, 365],
];
defSettings({
  id: 'pwrules', group: 'Access and security', title: 'Password rules', icon: 'key', terms: 'global password management complexity strong password aging expiry lockout login attempts history minimum length',
  keys: [PWK],
  render(c) {
    const g = n => fv(PWK, n);
    const vals = { cx: g('rlAAAPasswordComplexityEnabled') || '2', cls: g('rlAAAPasswordComplexityMinCharClasses') || '0', ...Object.fromEntries(PWF.map(f => [f[0], g(f[1]) ?? '0'])) };
    return c.form({
      help: 'Rules for new passwords of users, line and enable passwords. Existing passwords keep working until they are changed or expire.',
      values: vals,
      fields: [{ k: 'cx', label: 'Strong passwords (complexity)', type: 'toggle', help: 'require a mix of upper case, lower case, digits and symbols' },
        { k: 'cls', label: 'Character classes required', type: 'select', options: ['0', '1', '2', '3', '4'], show: a => a.cx === '1' },
        ...PWF.map(([k, , label, help, a, b]) => ({ k, label, help, type: 'number', min: a, max: b, unit: /days/.test(help) ? 'days' : null, width: '9em',
          validate: k === 'min' ? v => v === '0' || (+v >= 8 && +v <= 64) ? null : '0, or 8 to 64' : rng(a, b) }))],
      danger: (ch, a) => [`These rules apply to every account, including yours (${me() || 'the one you signed in with'}).`,
        ch.att && a.att !== '0' ? `After ${a.att} wrong passwords in a row an account locks, yours too; unlocking then needs another level-15 user or the console cable.` : null,
        ch.age && a.age !== '0' ? `Passwords expire after ${a.age} days: an expired password must be changed at sign-in, and with a wrong clock that can happen at once.` : null,
        ch.cx || ch.min || ch.cls ? 'New passwords that break the rules are refused, so keep a compliant password ready.' : null].filter(Boolean).join(' '),
      apply: ch => {
        const f = {};
        if (ch.cx) f.rlAAAPasswordComplexityEnabled = ch.cx;
        if (ch.cls != null && (ch.cx || fv(PWK, 'rlAAAPasswordComplexityEnabled')) === '1') f.rlAAAPasswordComplexityMinCharClasses = ch.cls;
        for (const [k, n] of PWF) if (ch[k] != null) f[n] = String(+ch[k]);
        return c.formPost('API/pswrd_mgmt.htm', f);
      },
    });
  },
});

/* ---------- CLI passwords: line (console / Telnet / SSH) and enable ---------- */
const LINEPW = [['5', 'Console (serial cable)', '2', '0'], ['1', 'Telnet', '1', '1'], ['3', 'SSH', '1', '3']]; // [row, label, PortType, ServiceType]
const ENK = 'form:API/sec_password.htm';
defSettings({
  id: 'clipw', group: 'Access and security', title: 'CLI passwords', icon: 'lock', terms: 'line password console telnet ssh enable password privileged exec level',
  keys: [ENK, PWK],
  intro: 'A line password is asked when a sign-in method uses "Line"; the enable password guards the CLI\'s privileged mode (enable).',
  render(c) {
    const lines = demandBox('x:linepw', () => api.form('API/sec_line_password_TIC.htm', PRIO.USER).then(v => repRows(v, 'rlAAALinePortType').map(r =>
      ({ n: String(r._n), set: !!r.rlAAALinePassword, exp: r.rlAAALinePasswordExpieryDate }))), 'Show line password state', list => c.kv(LINEPW.map(([n, l]) => {
      const r = list.find(x => x.n === n) || {};
      return [l, r.set ? 'set' + (r.exp ? ', expires ' + r.exp : '') : 'none'];
    })));
    const st = repRows(c.get(ENK), 'rlAAASysPassStatLevel');
    const lock = l => { const r = st.find(x => x.rlAAASysPassStatLevel === l); return !r ? '—' : (r.rlAAASysPassStatLockedState === '0' ? 'locked out' : 'usable') + (r.rlAAASysPassStatPasswordExpieryDate ? ', expires ' + r.rlAAASysPassStatPasswordExpieryDate : ''); };
    return [
      c.block('Line passwords', lines, c.form({
        values: { line: '5', pw: '', pw2: '', re: '2' },
        fields: [{ k: 'line', label: 'Line', type: 'seg', options: LINEPW.map(l => [l[0], l[1]]) }, ...pwPair(minPw(c)),
          { k: 're', label: 'Reactivate the line if it is locked', type: 'toggle', on: '1', off: '2' }],
        danger: (ch, a) => `The ${LINEPW.find(l => l[0] === a.line)[1]} password changes now. If a sign-in method for that line uses "Line", only the new password works there; a typo here locks that line.`,
        apply: (ch, a) => {
          const [n, , pt, svc] = LINEPW.find(l => l[0] === a.line);
          return c.formPost('API/sec_line_password_TIC.htm', { [`rlAAALinePassword$repeat?${n}`]: '$' + a.pw, [`rlAAAIfIndex$repeat?${n}`]: '0', [`rlAAALinePortType$repeat?${n}`]: pt,
            [`rlAAAServiceType$repeat?${n}`]: svc, [`rlAAALockedLineStatus$repeat?${n}`]: a.re === '1' ? '1' : '0', [`LineTable$endRepeat?${n}`]: 'OK' });
        },
      })),
      c.block('Enable password', c.kv([['Level 1', lock('1')], ['Level 15', lock('15')]]), c.form({
        values: { lvl: '15', pw: '', pw2: '' },
        fields: [{ k: 'lvl', label: 'For level', type: 'seg', options: LVL }, ...pwPair(+fv(ENK, 'rlAAAMinPasswordLength$Scalar') || 0)],
        danger: (ch, a) => `The level-${a.lvl} enable password changes now; the CLI command "enable" then needs the new one. It also unlocks that level if it was locked.`,
        apply: (ch, a) => c.formPost('API/sec_password.htm', { [`rlAAASystemPasswordlevel${a.lvl}$scalar`]: '$' + a.pw, 'rlAAAUnlockSystemPassword$scalar': a.lvl }),
      })),
    ];
  },
});

/* ---------- Management services (HTTP, HTTPS, Telnet, SSH) and web idle timeout: Remote CLI ---------- */
const SVC = [ // [key, label, on-command, hint]
  ['http', 'Web (HTTP)', 'ip http server', 'unencrypted web page'],
  ['https', 'Web (HTTPS)', 'ip http secure-server', 'encrypted web page'],
  ['telnet', 'Telnet', 'ip telnet server', 'unencrypted command line'],
  ['ssh', 'SSH', 'ip ssh server', 'encrypted command line'],
];
defSettings({
  id: 'services', group: 'Access and security', title: 'Management services', icon: 'link', terms: 'http https ssh telnet server web server enable disable ip http server secure-server timeout-policy idle timeout session',
  keys: ['DeviceBasicInfo', dirty.key],
  intro: 'Which ways of managing the switch are switched on. The classic interface has no page for this; changes go through the switch\'s command line (Remote CLI).',
  render(c) {
    const d = c.get('DeviceBasicInfo') || {}, ns = data.get(dirty.key) || '';
    const tag = n => (ns.match(new RegExp('<' + n + '>\\s*(\\d+)')) || [])[1];
    const idle = tag(myProto() === 'HTTPS' ? 'rlEmWebMaxHttpsIdleTimeout' : 'rlEmWebMaxIdleTimeout') ?? (d.idleTimeout ? String(+d.idleTimeout * 60) : '');
    const SEG = [['', 'No change'], ['on', 'On'], ['off', 'Off']];
    return [
      c.kv([['You are using', `${myProto()} from ${myIp() || 'this computer'}`], ['Telnet', d.telnetEnabled === '1' ? 'on' : d.telnetEnabled ? 'off' : ''],
        ['Web idle sign-out (configured)', idle === '0' ? 'never' : idle ? idle + ' s' : ''], ['Web idle sign-out (real)', `about ${Math.round(session.timeout / 1000)} s after the last request, whatever is configured; this page keeps the session alive`]]),
      c.block('Current state from the CLI', demandBox('x:svc-cli', () => api.cli(['show ip http', 'show ip https', 'show ip ssh'], 'show services', { readOnly: true }), 'Ask the switch',
        lines => h('pre', { class: 'mono' }, lines.join('\n')))),
      c.form({
        title: 'Change services',
        values: { http: '', https: '', telnet: '', ssh: '', idle: idle || '' },
        fields: [...SVC.map(([k, label, , help]) => ({ k, label, help, type: 'seg', options: SEG })),
          { k: 'idle', label: 'Web idle sign-out', unit: 's', type: 'number', min: 0, max: 86400, width: '9em', help: 'ip http timeout-policy; 0 = never. The switch still ends idle sessions after about a minute.', validate: rng(0, 86400) }],
        danger: (ch, a) => {
          const off = SVC.filter(s => a[s[0]] === 'off').map(s => s[1]);
          const mine = a[myProto().toLowerCase()] === 'off';
          return [mine ? `You are using ${myProto()} right now: turning it off ends this page at once and you can only get back through another service that is still on (or the console cable).` : null,
            off.length ? `Turning off ${off.join(', ')} stops every session that uses it.` : null,
            'If no way to manage the switch is left on, only the console cable gets you back in.'].filter(Boolean).join(' ');
        },
        apply: ch => cliCfg([...SVC.filter(s => ch[s[0]]).map(s => (ch[s[0]] === 'off' ? 'no ' : '') + s[2]), ...(ch.idle != null ? [`ip http timeout-policy ${+ch.idle}`] : [])], 'management services'),
      }),
    ];
  },
});

/* ---------- Management access (Access Profiles and Rules) ---------- */
const ACK = 'form:API/security_mng.htm';
const MSVC = ['All services', 'Telnet', 'SNMP', 'HTTP', 'HTTPS', 'SSH'];
const ip4 = a => { const p = String(a).split('.'); return p.length === 4 && p.every(x => /^\d+$/.test(x)) ? p.reduce((n, x) => n * 256 + +x, 0) : null; };
const plenMask = n => [24, 16, 8, 0].map(s => (n >= 32 - s ? 255 : n <= 24 - s ? 0 : (0xff << (8 - (n - (24 - s)))) & 0xff)).join('.');
const maskLen = m => { const v = ip4(m); if (v == null) return null; let n = 0; for (let b = 31; b >= 0 && (v / 2 ** b | 0) % 2; b--) n++; return n; };
function accRules(v) {
  return repRows(v, 'rlMngInfListInetName').map(r => ({ name: r.rlMngInfListInetName, prio: r.rlMngInfListInetPriority, svc: r.rlMngInfListInetService, ifx: r.rlMngInfListInetIfIndex,
    ip: r.rlMngInfListInetIpAddr, mask: r.rlMngInfListInetIpNetMask, plen: r.rlMngInfListInetIPv6PrefixLength, act: r.rlMngInfListInetAction }));
}
const srcText = r => !r.ip || r.ip === '0.0.0.0' ? 'any address' : r.ip.includes(':') ? `${r.ip}/${r.plen}` : `${r.ip}/${maskLen(r.mask) ?? r.plen}`;
/* what a profile would do to this browser: first matching rule by priority; no match = denied */
function accVerdict(rules, prof, c) {
  if (!prof) return { ok: true, text: 'With no active profile every address may manage the switch over every service.' };
  const ip = myIp(), svc = String(MSVC.indexOf(myProto())), mine = c.m.mine ? String(portNo(c.m.mine)) : '';
  if (prof === 'console-only') return { ok: false, text: `"console-only" blocks every network service: this page (${ip}, ${myProto()}) stops working at once and only the console cable gets you back in.` };
  let unsure = false;
  for (const r of rules.filter(r => r.name === prof).sort((a, b) => a.prio - b.prio)) {
    if (r.svc !== '0' && r.svc !== svc) continue;
    if (r.ifx && r.ifx !== '0') { if (!mine) { unsure = true; continue; } if (r.ifx !== mine) continue; }
    if (r.ip && r.ip !== '0.0.0.0') {
      if (r.ip.includes(':') || ip4(ip) == null) { unsure = true; continue; }
      const m = ip4(r.mask) ?? ip4(plenMask(+r.plen));
      if ((ip4(ip) & m) !== (ip4(r.ip) & m)) continue;
    }
    const ok = r.act === '0';
    return { ok, text: `Your browser reaches the switch from ${ip || 'an unknown address'} over ${myProto()}. Rule ${r.prio} of "${prof}" (${MSVC[+r.svc]}, ${srcText(r)}) ${ok ? 'permits' : 'DENIES'} it${ok ? '' : ': this page stops working at once and only the console cable or another permitted address gets you back in'}.${unsure ? ' Some earlier rules could not be checked (port or IPv6 based).' : ''}` };
  }
  return { ok: false, text: `No rule of "${prof}" permits ${ip || 'your address'} over ${myProto()}, and anything not permitted is denied: this page stops working at once and only the console cable or another permitted address gets you back in.${unsure ? ' (Some port or IPv6 rules could not be checked.)' : ''}` };
}
defSettings({
  id: 'mgmtacl', group: 'Access and security', title: 'Management access', icon: 'shield', terms: 'access profiles rules management acl permit deny source address console-only management access list',
  keys: [ACK],
  intro: 'Limit which addresses and services may manage the switch. Rules live in profiles; only the active profile counts, and its first matching rule (lowest priority number) decides.',
  render(c) {
    const v = c.get(ACK) || {}, rules = accRules(v);
    const active = v['rlMngInfEnable$scalar'] === '1' ? v['rlMngInfActiveListName$scalar'] || '' : '';
    const profs = [...new Set(rules.map(r => r.name))];
    const portOpts = [['0', 'Any port'], ...c.m.ports.map(p => [String(p.no), 'Port ' + p.no + (p.label ? ' · ' + p.label : '')])];
    const ruleFields = edit => [
      edit ? null : { k: 'name', label: 'Profile', placeholder: profs.filter(p => p !== 'console-only').join(', ') || 'e.g. lan-only', help: 'an existing profile name adds a rule to it; a new name creates the profile', validate: v => /^\S{1,32}$/.test(v || '') ? null : '1–32 characters, no spaces' },
      edit ? null : { k: 'prio', label: 'Priority', type: 'number', min: 1, max: 65535, width: '9em', help: 'lower numbers are checked first', validate: rng(1, 65535) },
      { k: 'svc', label: 'Service', type: 'select', options: MSVC.map((l, i) => [String(i), l]) },
      { k: 'ifx', label: 'Arriving on', type: 'select', options: portOpts },
      { k: 'src', label: 'Source address', placeholder: 'any, or e.g. 192.168.1.0/24', validate: v => !v || (/^([^/]+)\/(\d{1,3})$/.test(v) ? isIp(v.split('/')[0]) : isIp(v)) ? null : 'an address, optionally with /prefix length' },
      { k: 'act', label: 'Action', type: 'seg', options: [['0', 'Permit'], ['1', 'Deny']] },
    ].filter(Boolean);
    const srcFields = (src, suf) => {
      const [ip, len] = (src || '').trim().split('/');
      if (!ip) return { [`rlMngInfListInetIpAddr${suf}`]: '0.0.0.0' };
      return ip.includes(':') ? { [`rlMngInfListInetIpAddr${suf}`]: ip, [`rlMngInfListInetIPv6PrefixLength${suf}`]: len || '128' }
        : { [`rlMngInfListInetIpAddr${suf}`]: ip, [`rlMngInfListInetIpNetMask${suf}`]: plenMask(len ? +len : 32) };
    };
    const ruleWarn = name => name === active ? null : `This rule takes effect only when "${name}" is activated. Before activating it, make sure a rule permits ${myIp() || 'your address'} over ${myProto()}, or this page will be cut off.`;
    const notActive = name => { if (name && name === active) throw new Error(`"${name}" is active: the switch does not allow changing its rules. Set the active profile to None first.`); };
    return [
      c.kv([['Active profile', active || 'None (everyone may manage the switch)'], ['Your address', `${myIp() || 'unknown'} over ${myProto()}`]]),
      c.form({
        title: 'Active profile', values: { prof: active },
        fields: [{ k: 'prof', label: 'Active profile', type: 'select', options: [['', 'None'], ...profs.map(p => [p, p === 'console-only' ? 'Console only (no network management)' : p])] }],
        danger: (ch, a) => { const r = accVerdict(rules, a.prof, c); return (r.ok ? '' : 'DANGER: ') + r.text; },
        apply: (ch, a) => c.formPost('API/security_mng.htm', a.prof ? { 'rlMngInfEnable$scalar': '1', 'rlMngInfActiveListName$scalar': a.prof } : { 'rlMngInfActiveListName$scalar': '', 'rlMngInfEnable$scalar': '2' }),
      }),
      c.table({
        title: 'Rules', rows: rules.sort((a, b) => a.name.localeCompare(b.name) || a.prio - b.prio), key: r => `${r.name} rule ${r.prio}`, empty: 'No rules.',
        columns: [{ label: 'Profile', get: r => h('span', {}, r.name, r.name === active ? h('span', { class: 'chip' }, 'active') : null) }, { label: 'Priority', get: r => r.prio, num: true },
          { label: 'Service', get: r => MSVC[+r.svc] || r.svc }, { label: 'Port', get: r => r.ifx && r.ifx !== '0' ? 'port ' + r.ifx : 'any' }, { label: 'Source', get: r => srcText(r) },
          { label: 'Action', get: r => h('span', {}, h('span', { class: 'led ' + (r.act === '0' ? 'lg' : 'ly') }), r.act === '0' ? ' permit' : ' deny') }],
        add: { label: 'Add rule', values: { name: '', prio: '', svc: '0', ifx: '0', src: '', act: '0' }, fields: ruleFields(false),
          apply: async a => {
            notActive(a.name);
            if (rules.some(r => r.name === a.name && r.prio === String(+a.prio))) throw new Error(`"${a.name}" already has a rule with priority ${+a.prio}.`);
            await guard('Add rule', ruleWarn(a.name));
            await c.formPost('API/security_mng.htm', { 'rlMngInfListInetName$add': a.name, 'rlMngInfListInetPriority$add': String(+a.prio), 'rlMngInfListInetService$add': a.svc,
              'rlMngInfListInetIfIndex$add': a.ifx, ...srcFields(a.src, '$add'), 'rlMngInfListInetAction$add': a.act,
              'rlMngInfListInetRowStatus$add': profs.includes(a.name) ? '1' : '4', 'MngInfListInetTable$endAdd': 'OK' });
          } },
        edit: { values: r => ({ svc: r.svc, ifx: r.ifx || '0', src: r.ip && r.ip !== '0.0.0.0' ? srcText(r) : '', act: r.act }), fields: () => ruleFields(true),
          apply: async (ch, a, r) => {
            notActive(r.name);
            await guard('Change rule', ruleWarn(r.name));
            await c.formPost('API/security_mng.htm', { 'rlMngInfListInetName$query': r.name, 'rlMngInfListInetPriority$query': r.prio, 'rlMngInfListInetService$query': a.svc,
              'rlMngInfListInetIfIndex$query': a.ifx, ...srcFields(a.src, '$query'), 'rlMngInfListInetAction$query': a.act, 'rlMngInfListInetRowStatus$query': '1', 'MngInfListInetTable$endQuery': 'OK' });
          } },
        remove: { confirm: r => r.name === 'console-only' ? 'The built-in console-only profile cannot be removed; the switch will refuse.' : r.name === active ? `"${r.name}" is active: the switch refuses to change it. Set the active profile to None first.`
            : `Removes rule ${r.prio} from "${r.name}". If it was the rule that permits ${myIp() || 'your address'}, activating "${r.name}" later will cut this page off. Removing the last rule removes the profile.`,
          apply: r => c.formPost('API/security_mng.htm', { 'rlMngInfListInetName$repeat?1': r.name, 'rlMngInfListInetPriority$repeat?1': r.prio, 'rlMngInfListInetRowStatus$repeat?1': '6', 'MngInfListInetTable$endRepeat?1': 'OK' }) },
      }),
    ];
  },
});

/* ---------- Sign-in methods: authentication profiles (login lists) and which line uses which ---------- */
const METH = ['Stop (deny)', 'Line password', 'Enable password', 'Local users', 'RADIUS', 'TACACS+', 'No password'];
const AUK = 'form:API/authen_profiles_method.htm', SAK = 'form:API/select_Authentication.htm';
const methodsOf = r => [1, 2, 3, 4, 5, 6].map(i => r['rlAAAMethodType' + i]).filter(x => x && x !== '0');
const methText = ms => ms.length ? ms.map(m => METH[+m] || m).join(' → ') : 'nothing (deny)';
const profName = n => ({ login_n_default: 'Network default', login_c_default: 'Console default' })[n] || String(n).replace(/^login_/, '');
const AUTHWARN = 'If none of the methods can check your password (for example RADIUS without a reachable server, or a local user that does not exist), you cannot sign in. Keep "Local users" in the list as a fallback.';
defSettings({
  id: 'authprofiles', group: 'Access and security', title: 'Sign-in methods', icon: 'key', terms: 'authentication profiles select authentication login method list aaa radius tacacs local line enable console telnet ssh http https',
  keys: [SAK, AUK],
  intro: 'How a password is checked. A profile is an ordered list of methods; the next one is tried only when the previous one cannot answer (a server is down), not when the password is wrong.',
  render(c) {
    const sv = c.get(SAK) || {}, sr = repRows(sv);
    const lists = sr.filter(r => r.rlAAAMethodListName != null), lines = sr.filter(r => r.rlAAALinePortType != null);
    const logins = lists.filter(r => /^login_/.test(r.rlAAAMethodListName));
    const LN = [['console', 'Console', '2', '0'], ['telnet', 'Telnet', '1', '1'], ['ssh', 'SSH', '1', '3']];
    const lineOf = (pt, st) => lines.find(r => r.rlAAALinePortType === pt && r.rlAAAServiceType === st);
    const webOf = n => lists.find(r => r.rlAAAMethodListName === n);
    const PRESET = [['3', 'Local users'], ['4,3', 'RADIUS, then local users'], ['5,3', 'TACACS+, then local users'], ['4,5,3', 'RADIUS, TACACS+, then local users'], ['4', 'RADIUS only'], ['5', 'TACACS+ only'], ['3,6', 'Local users, then no password'], ['6', 'No password at all']];
    const webOpts = cur => PRESET.some(p => p[0] === cur) || !cur ? PRESET : [[cur, methText(cur.split(','))], ...PRESET];
    const vals = Object.fromEntries([...LN.map(([k, , pt, st]) => [k, (lineOf(pt, st) || {}).rlAAALineMethodListNameLevel1 || '']),
      ...['http', 'https'].map(n => [n, methodsOf(webOf(n) || {}).join(',')])]);
    const ar = repRows(c.get(AUK), 'rlAAAMethodListName').filter(r => /^login_/.test(r.rlAAAMethodListName));
    const slots = [1, 2, 3, 4, 5, 6].map(i => ({ k: 'm' + i, label: i === 1 ? 'First method' : `Method ${i}`, type: 'select', options: [['', i === 1 ? '—' : '(end of list)'], ...METH.slice(1).map((l, j) => [String(j + 1), l])],
      show: a => i === 1 || !!a['m' + (i - 1)] }));
    const pick = a => { const ms = []; for (let i = 1; i <= 6 && a['m' + i]; i++) ms.push(a['m' + i]); return ms; };
    const slotCheck = { validate: (v, a) => { const ms = pick(a); return !ms.length ? 'choose at least one method' : new Set(ms).size !== ms.length ? 'each method only once' : null; } };
    const types = (ms, suf) => Object.fromEntries([1, 2, 3, 4, 5, 6].map(i => [`rlAAAMethodType${i}${suf}`, ms[i - 1] || '0']));
    return [
      c.form({
        title: 'Which profile each way in uses', values: vals,
        fields: [...LN.map(([k, label]) => ({ k, label, type: 'select', options: logins.filter(r => k === 'console' ? r.rlAAAMethodListName !== 'login_n_default' : r.rlAAAMethodListName !== 'login_c_default')
            .map(r => [r.rlAAAMethodListName, `${profName(r.rlAAAMethodListName)} · ${methText(methodsOf(r))}`]) })),
          { k: 'http', label: 'Web (HTTP)', type: 'select', options: webOpts(vals.http) }, { k: 'https', label: 'Web (HTTPS)', type: 'select', options: webOpts(vals.https) }],
        danger: ch => [ch[myProto().toLowerCase()] ? `You changed the method for ${myProto()}, the way you are signed in now: the next sign-in to this page uses it.` : null, AUTHWARN].filter(Boolean).join(' '),
        apply: ch => {
          const f = {};
          for (const [k, , pt, st] of LN) if (ch[k] != null) {
            const n = (lineOf(pt, st) || {})._n; if (!n) throw new Error(`The switch has no ${k} line entry to change.`);
            Object.assign(f, { [`rlAAALinePortType$repeat?${n}`]: pt, [`rlAAAIfIndex$repeat?${n}`]: '0', [`rlAAAServiceType$repeat?${n}`]: st, [`rlAAALineStatus$repeat?${n}`]: '1',
              [`rlAAALineMethodListNameLevel1$repeat?${n}`]: ch[k], [`lineTable$endRepeat?${n}`]: 'OK' });
          }
          for (const k of ['http', 'https']) if (ch[k] != null) {
            const r = webOf(k); if (!r) throw new Error(`The switch has no ${k} method list to change.`);
            Object.assign(f, { [`rlAAAMethodListName$repeat?${r._n}`]: k, [`rlAAAAuthorizeEnable$repeat?${r._n}`]: '1', ...types(ch[k].split(','), '$repeat?' + r._n), [`methodListTable$endRepeat?${r._n}`]: 'OK' });
          }
          return c.formPost('API/select_Authentication.htm', f);
        },
      }),
      c.table({
        title: 'Profiles (for console, Telnet and SSH)', rows: ar, key: r => profName(r.rlAAAMethodListName), empty: 'No profiles.',
        columns: [{ label: 'Profile', get: r => profName(r.rlAAAMethodListName) }, { label: 'Methods, in order', get: r => methText(methodsOf(r)) },
          { label: 'Used by', get: r => LN.filter(([, , pt, st]) => (lineOf(pt, st) || {}).rlAAALineMethodListNameLevel1 === r.rlAAAMethodListName).map(l => l[1]).join(', ') || '—' }],
        add: { label: 'Add profile', values: { name: '', m1: '3' }, fields: [{ k: 'name', label: 'Name', validate: v => /^\S{1,12}$/.test(v || '') ? null : '1–12 characters, no spaces' }, ...slots.map((s, i) => i ? s : { ...s, ...slotCheck })],
          apply: async a => {
            if (ar.some(r => r.rlAAAMethodListName === 'login_' + a.name)) throw new Error(`Profile ${a.name} already exists.`);
            await c.formPost('API/authen_profiles_method_a.htm', { 'rlAAAMethodListName$add': 'login_' + a.name, ...types(pick(a), '$add'), 'rlAAAMethodListStatus$add': '4', 'rlAAAAuthorizeEnable$add': '1', 'methodListTable$endAdd': 'OK' });
          } },
        edit: { values: r => Object.fromEntries(methodsOf(r).map((m, i) => ['m' + (i + 1), m])), fields: () => slots.map((s, i) => i ? s : { ...s, ...slotCheck }),
          apply: async (ch, a, r) => {
            const used = LN.filter(([, , pt, st]) => (lineOf(pt, st) || {}).rlAAALineMethodListNameLevel1 === r.rlAAAMethodListName).map(l => l[1]);
            await guard('Change profile', [used.length ? `${used.join(', ')} sign-ins use this profile and switch to the new methods at once.` : 'No line uses this profile yet.', AUTHWARN]);
            const n = r._n;
            await c.formPost('API/authen_profiles_method.htm', { [`rlAAAMethodListName$repeat?${n}`]: r.rlAAAMethodListName, ...types(pick(a), '$repeat?' + n),
              [`rlAAAMethodListStatus$repeat?${n}`]: '1', [`rlAAAAuthorizeEnable$repeat?${n}`]: '1', [`methodListTable$endRepeat?${n}`]: 'OK' });
          } },
        remove: { confirm: r => /_default$/.test(r.rlAAAMethodListName) ? 'Built-in default profiles cannot be removed; edit their methods instead.' : `Removes profile ${profName(r.rlAAAMethodListName)}. A console, Telnet or SSH line that still uses it may refuse every sign-in; point those lines at another profile first.`,
          apply: r => { if (/_default$/.test(r.rlAAAMethodListName)) throw new Error('Built-in default profiles cannot be removed.');
            return c.formPost('API/authen_profiles_method.htm', { 'rlAAAMethodListName$repeat?1': r.rlAAAMethodListName, 'rlAAAMethodListStatus$repeat?1': '6', 'methodListTable$endRepeat?1': 'OK' }); } },
      }),
    ];
  },
});

/* ---------- RADIUS and TACACS+ servers ---------- */
const KEYF = { k: 'key', label: 'Shared secret (key)', type: 'password', help: 'leave empty to use the default key above' };
const blank0 = (v, d) => String(v ?? '').trim() === '' ? d : String(+v);
const AAAWARN = s => `If sign-in methods use ${s}, a wrong address or key makes ${s} sign-ins fail; "Local users" after ${s} in the method list is what still lets you in.`;
defSettings({
  id: 'radius', group: 'Access and security', title: 'RADIUS', icon: 'dev', terms: 'radius server aaa authentication 802.1x key secret timeout retries dead time',
  keys: ['RadiusDefaultParam', 'RadiusServerList', 'SourceAddressSelectionList&applicationType=1'],
  intro: 'RADIUS = a server that checks passwords centrally, for sign-in to the switch and for 802.1X port authentication.',
  render(c) {
    const d = c.get('RadiusDefaultParam') || {}, src = rows(c.get('SourceAddressSelectionList&applicationType=1'))[0] || {};
    const list = rows(c.get('RadiusServerList'), 'RadiusServer');
    const USE = [['3', 'Sign-in and 802.1X'], ['1', 'Sign-in'], ['2', '802.1X']];
    const sf = edit => [edit ? null : { k: 'IPAddress', label: 'Server address', validate: ipOk },
      { k: 'serverPriority', label: 'Priority', type: 'number', min: 0, max: 65535, width: '9em', help: '0 = asked first', validate: rng(0, 65535) },
      { k: 'authPortNo', label: 'Authentication port', type: 'number', width: '9em', help: '0 = not used for authentication', validate: rng(0, 65535) },
      { k: 'accountPortNo', label: 'Accounting port', type: 'number', width: '9em', help: '0 = not used for accounting', validate: rng(0, 65535) },
      { k: 'usageType', label: 'Used for', type: 'seg', options: USE },
      { k: 'timeoutForReply', label: 'Reply timeout', unit: 's', type: 'number', width: '9em', placeholder: 'default', validate: rng(1, 30, true) },
      { k: 'numberOfRetries', label: 'Retries', type: 'number', width: '9em', placeholder: 'default', validate: rng(1, 10, true) },
      { k: 'deadTime', label: 'Skip when down for', unit: 'min', type: 'number', width: '9em', placeholder: 'default', validate: rng(0, 2000, true) }, KEYF].filter(Boolean);
    const body = (a, r) => ({ RadiusServer: { IPAddress: r ? r.IPAddress : a.IPAddress.trim(), authPortNo: String(+a.authPortNo), accountPortNo: String(+a.accountPortNo), serverPriority: String(+a.serverPriority),
      timeoutForReply: blank0(a.timeoutForReply, '0'), numberOfRetries: blank0(a.numberOfRetries, '0'), deadTime: blank0(a.deadTime, '2001'),
      keyString: a.key ? a.key : null, globalDefaultKeyEnable: a.key ? '2' : '1', usageType: a.usageType } });
    const ev = r => ({ serverPriority: r.serverPriority, authPortNo: r.authPortNo, accountPortNo: r.accountPortNo, usageType: r.usageType, key: '',
      timeoutForReply: r.timeoutForReply === '0' ? '' : r.timeoutForReply, numberOfRetries: r.numberOfRetries === '0' ? '' : r.numberOfRetries, deadTime: r.deadTime === '2001' ? '' : r.deadTime });
    return [
      c.form({
        title: 'Defaults for all servers', values: { timeoutForReply: d.timeoutForReply || '3', numberOfRetries: d.numberOfRetries || '3', deadTime: d.deadTime || '0', keyString: '' },
        fields: [{ k: 'timeoutForReply', label: 'Reply timeout', unit: 's', type: 'number', width: '9em', validate: rng(1, 30) },
          { k: 'numberOfRetries', label: 'Retries', type: 'number', width: '9em', validate: rng(1, 10) },
          { k: 'deadTime', label: 'Skip a silent server for', unit: 'min', type: 'number', width: '9em', help: 'dead time; 0 = keep asking', validate: rng(0, 2000) },
          { k: 'keyString', label: 'Default key', type: 'password', help: 'shared secret; leave empty to keep the current one', validate: v => !v || v.length <= 128 ? null : 'at most 128 characters' }],
        danger: () => AAAWARN('RADIUS'),
        apply: ch => c.post('RadiusDefaultParam', ch),
      }),
      c.kv([['Source interface', src.IPv4InterfaceName && src.IPv4InterfaceName !== 'none' ? src.IPv4InterfaceName : 'automatic']]),
      c.table({
        title: 'Servers', rows: list, key: r => r.IPAddress, empty: 'No RADIUS servers.', max: 8,
        columns: [{ label: 'Server', get: r => r.IPAddress }, { label: 'Priority', get: r => r.serverPriority, num: true }, { label: 'Ports', get: r => `${r.authPortNo} / ${r.accountPortNo}` },
          { label: 'Used for', get: r => (USE.find(u => u[0] === r.usageType) || [, r.usageType])[1] }, { label: 'Key', get: r => r.globalDefaultKeyEnable === '2' ? 'own' : 'default' }],
        add: { label: 'Add server', values: { serverPriority: '0', authPortNo: '1812', accountPortNo: '1813', usageType: '3' }, fields: sf(false),
          apply: async a => { await guard('Add RADIUS server', AAAWARN('RADIUS'));
            await api.post([{ section: 'RadiusServerList', action: 'set', body: body(a) }, { section: 'AAAGlobalSetting', action: 'set', body: { loginAccountingType: '2', dot1xAccountingType: '2' } }], 'RADIUS server'); } },
        edit: { values: ev, fields: () => sf(true),
          apply: async (ch, a, r) => { await guard('Change RADIUS server', AAAWARN('RADIUS') + (a.key ? '' : ' An empty key field switches this server to the default key.')); await c.post('RadiusServerList', body(a, r)); } },
        remove: { confirm: r => `Removes ${r.IPAddress}. ${AAAWARN('RADIUS')}`, apply: r => c.post('RadiusServerList', { RadiusServer: { IPAddress: r.IPAddress } }, 'delete') },
      }),
    ];
  },
});
defSettings({
  id: 'tacacs', group: 'Access and security', title: 'TACACS+', icon: 'dev', terms: 'tacacs tacacs+ server aaa authentication key secret timeout single connection',
  keys: ['TACACSDefaultParam', 'TACACSServerList', 'SourceAddressSelectionList&applicationType=6'],
  intro: 'TACACS+ = a server that checks sign-in passwords centrally (common with Cisco-style networks).',
  render(c) {
    const d = c.get('TACACSDefaultParam') || {}, list = rows(c.get('TACACSServerList'), 'TACACSServer');
    const src = rows(c.get('SourceAddressSelectionList&applicationType=6'))[0] || {};
    const sf = edit => [edit ? null : { k: 'IPAddress', label: 'Server address', validate: ipOk },
      { k: 'serverPriority', label: 'Priority', type: 'number', width: '9em', help: '0 = asked first', validate: rng(0, 65535) },
      { k: 'portNo', label: 'Port', type: 'number', width: '9em', validate: rng(0, 65535) },
      { k: 'timeoutForReply', label: 'Reply timeout', unit: 's', type: 'number', width: '9em', placeholder: 'default', validate: rng(1, 30, true) },
      { k: 'connectionType', label: 'Single connection', type: 'toggle', on: '0', off: '1', help: 'keep one TCP connection open to the server' }, KEYF].filter(Boolean);
    const body = (a, r) => ({ TACACSServer: { IPAddress: r ? r.IPAddress : a.IPAddress.trim(), portNo: String(+a.portNo), serverPriority: String(+a.serverPriority),
      timeoutForReply: blank0(a.timeoutForReply, '0'), keyString: a.key ? a.key : null, globalDefaultKeyEnable: a.key ? '2' : '1', connectionType: a.connectionType } });
    return [
      c.form({
        title: 'Defaults for all servers', values: { timeoutForReply: d.timeoutForReply || '5', keyString: '' },
        fields: [{ k: 'timeoutForReply', label: 'Reply timeout', unit: 's', type: 'number', width: '9em', validate: rng(1, 30) },
          { k: 'keyString', label: 'Default key', type: 'password', help: 'shared secret; leave empty to keep the current one', validate: v => !v || v.length <= 128 ? null : 'at most 128 characters' }],
        danger: () => AAAWARN('TACACS+'),
        apply: ch => c.post('TACACSDefaultParam', ch),
      }),
      c.kv([['Source interface', src.IPv4InterfaceName && src.IPv4InterfaceName !== 'none' ? src.IPv4InterfaceName : 'automatic']]),
      c.table({
        title: 'Servers', rows: list, key: r => r.IPAddress, empty: 'No TACACS+ servers.',
        columns: [{ label: 'Server', get: r => r.IPAddress }, { label: 'Priority', get: r => r.serverPriority, num: true }, { label: 'Port', get: r => r.portNo, num: true },
          { label: 'Key', get: r => r.globalDefaultKeyEnable === '2' ? 'own' : 'default' },
          { label: 'Status', get: r => h('span', {}, h('span', { class: 'led ' + (r.connectionStatus === '0' ? 'lg' : 'ly') }), r.connectionStatus === '0' ? ' connected' : ' not connected') }],
        add: { label: 'Add server', values: { serverPriority: '0', portNo: '49', connectionType: '1' }, fields: sf(false),
          apply: async a => { await guard('Add TACACS+ server', AAAWARN('TACACS+')); await c.post('TACACSServerList', body(a)); } },
        edit: { values: r => ({ serverPriority: r.serverPriority, portNo: r.portNo, timeoutForReply: r.timeoutForReply === '0' ? '' : r.timeoutForReply, connectionType: r.connectionType, key: '' }), fields: () => sf(true),
          apply: async (ch, a, r) => { await guard('Change TACACS+ server', AAAWARN('TACACS+') + (a.key ? '' : ' An empty key field switches this server to the default key.')); await c.post('TACACSServerList', body(a, r)); } },
        remove: { confirm: r => `Removes ${r.IPAddress}. ${AAAWARN('TACACS+')}`, apply: r => c.post('TACACSServerList', { TACACSServer: { IPAddress: r.IPAddress } }, 'delete') },
      }),
    ];
  },
});

/* ---------- Who is signed in, and sign-in history ---------- */
const AUK2 = 'form:API/active_users.htm', LHK = 'form:API/login_history.htm';
const USVC = { '1': 'Telnet', '2': 'Web (HTTP)', '3': 'SSH', '4': 'Web (HTTPS)', '5': 'SNMP' };
const HSVC = { '0': 'Console', '1': 'Telnet', '2': 'Web (HTTP)', '3': 'SSH', '4': 'Web (HTTPS)', '5': 'SNMP' };
defSettings({
  id: 'sessions', group: 'Access and security', title: 'Sessions and sign-ins', icon: 'clock', terms: 'active users sessions login history who is logged in signed in',
  keys: [{ key: AUK2, cls: 'live', prefetch: false }, { key: LHK, cls: 'live', prefetch: false }],
  render(c) {
    const now = repRows(c.get(AUK2), 'rlAAAUserName'), hist = repRows(c.get(LHK), 'rlAAALocalLoginHistName').sort((a, b) => +b.rlAAALocalLoginHistIndex - +a.rlAAALocalLoginHistIndex);
    return [
      c.table({ title: 'Signed in now', rows: now, empty: 'Nobody.', columns: [{ label: 'User', get: r => r.rlAAAUserName },
        { label: 'Using', get: r => USVC[r.rlAAAUserServiceType] || 'Console' },
        { label: 'From', get: r => h('span', {}, r.rlAAAUserRemoteIpAddress, r.rlAAAUserRemoteIpAddress === myIp() ? h('span', { class: 'mu' }, ' (this computer)') : null) }] }),
      c.note('Each browser tab or tool keeps its own session; the switch cannot end another session from here.'),
      c.table({ title: 'Recent sign-ins', rows: hist.slice(0, 50), empty: 'No sign-ins recorded.', columns: [{ label: 'When', get: r => r.rlAAALocalLoginDateTime },
        { label: 'User', get: r => r.rlAAALocalLoginHistName }, { label: 'Using', get: r => HSVC[r.rlAAALocalLoginHistServiceType] || 'unknown' }, { label: 'From', get: r => r.rlAAALocalLoginHistRemoteIpAddress }] }),
      c.form({
        values: { f: fv(LHK, 'rlAAASuccLoginWriteToFile') || '2' },
        fields: [{ k: 'f', label: 'Keep sign-in history in flash', type: 'toggle', help: 'survives a restart' }],
        danger: () => 'This only changes where sign-ins are recorded; it cannot lock you out.',
        apply: (ch, a) => c.formPost('API/login_history.htm', { rlAAASuccLoginWriteToFile: a.f }),
      }),
    ];
  },
});
}
