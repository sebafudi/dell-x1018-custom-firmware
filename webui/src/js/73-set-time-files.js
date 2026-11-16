/* ---------- Settings: Time (clock, time zone, SNTP), Maintenance (firmware, transfers, factory reset), Switching (jumbo frames) ---------- */
{ // whole file in one block: nothing leaks into the shared bundle scope
ICONS.chipi = '<rect x="4" y="4" width="8" height="8" rx="1"/><path d="M6 1.5V4M10 1.5V4M6 12v2.5M10 12v2.5M1.5 6H4M1.5 10H4M12 6h2.5M12 10h2.5"/>';
ICONS.xfer = '<path d="M5 2.5v10M2.5 10 5 12.5 7.5 10M11 13.5v-10M8.5 6 11 3.5 13.5 6"/>';
/* small helpers (same as in 72-set-network.js; kept local so this file stands alone) */
const IP4 = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/;
const vIp = v => IP4.test(String(v || '').trim()) ? null : 'enter an IPv4 address such as 192.168.1.10';
const vIp6 = v => /^[0-9a-f:.]{2,45}$/i.test(v || '') && v.includes(':') ? null : 'enter an IPv6 address such as 2001:db8::1';
const vRange = (lo, hi) => v => /^\d+$/.test(String(v).trim()) && +v >= lo && +v <= hi ? null : `enter a whole number from ${lo} to ${hi}`;
const vlanIfs = c => c.m.vlans.map(v => ['VLAN' + v.id, `VLAN ${v.id}${v.name ? ' · ' + v.name : ''}`]);
const portIfs = c => c.m.ports.map(p => [p.name, `Port ${p.no}`]);
const ifIndexOf = (c, name) => { const m = String(name).match(/^VLAN\s*(\d+)$/i); return m ? String(99999 + +m[1]) : String(portNo(name)); };
const onOff = v => v === '1' ? 'On' : v === '2' ? 'Off' : v;
const sec = (s, wrap) => rows(s, wrap);
function frows(key, cols) {
  const by = {};
  for (const [k, v] of Object.entries(data.get(key) || {})) {
    const m = k.match(/^(\w+)\$(?:repeat|scalar)\?(\d+)$/);
    if (m && cols.includes(m[1])) (by[m[2]] = by[m[2]] || { _n: m[2] })[m[1]] = v;
  }
  return Object.values(by).filter(r => r[cols[0]] != null && r[cols[0]] !== '').sort((a, b) => a._n - b._n);
}
const fkey = path => data.def('form:' + path, 'config', { prefetch: false });

const TK = { src: fkey('API/time_synch_global.htm'), tz: fkey('API/general_sntp_settings.htm'), srv: fkey('API/sntp_servers.htm'), glob: fkey('API/general_sntp_set.htm'),
  auth: { key: 'form:API/show_authen_table.htm', cls: 'demand' }, bc: fkey('API/general_sntp_m.htm') };
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const TZS = ['-12:00', '-11:00', '-10:00', '-9:00', '-8:00', '-7:00', '-6:00', '-5:00', '-4:00', '-3:30', '-3:00', '-2:00', '-1:00', '00:00', '01:00', '02:00', '03:00', '03:30', '04:00', '04:30',
  '05:00', '05:30', '05:45', '06:00', '06:30', '07:00', '08:00', '09:00', '09:30', '10:00', '11:00', '12:00', '13:00'].map(o => [o, o === '00:00' ? 'UTC' : 'UTC ' + (o[0] === '-' ? '−' + o.slice(1) : '+' + o)]);
const WEEKS = [['00', 'First'], ['02', 'Second'], ['03', 'Third'], ['04', 'Fourth'], ['06', 'Last']];
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map((d, i) => ['0' + (i + 1), d]);
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'].map((m, i) => [String(i + 1).padStart(2, '0'), m]);
const DST = { usa: ['02 01 03 02:00', '01 01 11 02:00'], eu: ['06 01 03 01:00', '06 01 10 01:00'] }; // classic presets (2nd Sun Mar → 1st Sun Nov; last Sun Mar → last Sun Oct)
const unhex = s => (String(s || '').match(/../g) || []).map(x => String.fromCharCode(parseInt(x, 16))).join('');
const tohex = s => [...s].map(ch => ch.charCodeAt(0).toString(16).padStart(2, '0')).join('');
const vHM = v => /^([01]?\d|2[0-3]):[0-5]\d$/.test(v || '') ? null : 'enter a time as hh:mm';
const vDate = v => { const m = String(v || '').match(/^(\d{4})-(\d\d)-(\d\d)$/); return m && +m[1] >= 2000 && +m[1] <= 2097 && +m[2] >= 1 && +m[2] <= 12 && +m[3] >= 1 && +m[3] <= 31 ? null : 'enter a date as YYYY-MM-DD (2000–2097)'; };
const weekNorm = w => +w <= 1 ? '00' : +w >= 5 ? '06' : w; // the switch may report 01/05 for first/last
/* "WW DD MM hh:mm" -> "Last Sunday of March, 02:00" */
const recText = s => { const [w, d, m, t] = s.split(' '); return `${(WEEKS.find(x => x[0] === weekNorm(w)) || [, w])[1]} ${(DAYS.find(x => x[0] === d) || [, d])[1]} of ${(MONTHS.find(x => x[0] === m) || [, m])[1]}, ${t}`; };
/* "MM DD YY hh:mm" -> "2026-03-29 02:00" */
const fixText = s => { const m = s.match(/^(\d\d) (\d\d) (\d\d) (.*)$/); return m ? `20${m[3]}-${m[1]}-${m[2]} ${m[4]}` : s; };
function switchClock(v) { const m = String(v || '').match(/^(\d\d)(\d\d)(\d\d)(\d\d)(\d\d)(\d\d)$/); return m ? { d: `20${m[3]}-${m[2]}-${m[1]}`, t: `${m[4]}:${m[5]}:${m[6]}`, text: `${+m[1]} ${MON[+m[2] - 1]} 20${m[3]} ${m[4]}:${m[5]}:${m[6]}` } : null; }
const SNTP_ST = { 1: 'Unknown', 2: 'Connecting', 3: 'Up', 4: 'Down' };
const ntpAge = hex => { const s = parseInt(String(hex || '').slice(0, 8), 16); return s ? age(Date.now() - (s - 2208988800) * 1000) + ' ago' : ''; };

/* ================= Date and time ================= */
defSettings({
  id: 'clock', group: 'Time', title: 'Date and time', icon: 'clock',
  terms: 'clock time date time zone utc offset daylight saving summer time dst clock source local sntp manual set time',
  keys: [TK.src, TK.tz, TK.srv],
  render(c) {
    const T = k => fv(TK.tz, k), method = fv(TK.src, 'rlTimeSyncMethod$scalar'), clk = switchClock(T('rndTimeSyncManagedDateTime$scalar'));
    const off = T('rlTimeZoneTimeZoneOffset$query') || '00:00', mode = T('rlTimeZoneDaylightSavingTimeMode$query') || '3';
    const start = unhex(T('rlTimeZoneDaylightSavingTimeStart$query')), end = unhex(T('rlTimeZoneDaylightSavingTimeEnd$query'));
    const syncAddr = fv(TK.srv, 'rlSntpNtpConfigSyncSrvAddr'), srvs = frows(TK.srv, ['rlSntpServerInetAddress', 'rlSntpServerInetStatus']);
    const synced = srvs.find(r => r.rlSntpServerInetAddress === syncAddr && r.rlSntpServerInetStatus === '3');
    const pre = mode === '3' ? 'none' : mode === '1' && ['02 01 03 02:00', '01 01 03 02:00'].includes(start) && ['01 01 11 02:00', '00 01 11 02:00'].includes(end) ? 'usa'
      : mode === '1' && ['06 01 03 01:00', '05 01 03 01:00'].includes(start) && ['06 01 10 01:00', '05 01 10 01:00'].includes(end) ? 'eu' : 'other';
    const rs = (mode === '1' ? start : '00 01 03 02:00').split(' '), re = (mode === '1' ? end : '06 01 10 03:00').split(' ');
    const fs = (mode === '2' ? fixText(start) : '').split(' '), fe = (mode === '2' ? fixText(end) : '').split(' ');
    const dstText = mode === '3' ? 'none' : (pre === 'usa' ? 'USA: ' : pre === 'eu' ? 'Europe: ' : '') + (mode === '1' ? `${recText(start)} → ${recText(end)}` : `${fixText(start)} → ${fixText(end)}`) + `, +${T('rlTimeZoneDaylightSavingTimeOffset$query') || 60} min`;
    const other = v => v.pre === 'other', rec = v => other(v) && v.rec === '1', fix = v => other(v) && v.rec === '2';
    const ruleFields = (p, l) => [{ k: p + 'w', label: l + ': week', type: 'select', options: WEEKS, show: rec }, { k: p + 'd', label: l + ': day', type: 'select', options: DAYS, show: rec },
      { k: p + 'm', label: l + ': month', type: 'select', options: MONTHS, show: rec }, { k: p + 't', label: l + ': time', placeholder: 'hh:mm', show: rec, validate: vHM },
      { k: p + 'D', label: l + ': date', placeholder: 'YYYY-MM-DD', show: fix, validate: vDate }, { k: p + 'T', label: l + ': time', placeholder: 'hh:mm', show: fix, validate: vHM }];
    const fixOut = (d, t) => { const [y, m, dd] = d.split('-'); return `${m} ${dd} ${y.slice(2)} ${t.padStart(5, '0')}`; };
    return [
      h('div', { class: 'blk' }, h('h3', {}, 'Switch clock'), h('div', { class: 'mono', style: 'font-size:22px;margin:2px 0 12px' }, clk ? clk.text : '—'),
        c.kv([['Set by', method === '2' ? 'Time servers (SNTP)' : method === '1' ? 'Hand (local clock)' : method],
          ['Synchronised', method === '2' ? (synced ? h('span', { class: 'cell' }, h('i', { class: 'led lg' }), ' with ' + syncAddr) : h('span', { class: 'cell' }, h('i', { class: 'led ly' }), ' not in sync')) : null],
          ['Time zone', (TZS.find(z => z[0] === off) || [, off])[1]], ['Summer time', dstText]])),
      c.form({ title: 'Clock source', values: { m: method }, fields: [{ k: 'm', label: 'Set the clock from', type: 'seg', options: [['2', 'Time servers (SNTP)'], ['1', 'By hand (local)']] }],
        apply: (ch, a) => c.formPost('API/time_synch_global.htm', { 'rlTimeSyncMethod$scalar': a.m }) }),
      c.form({
        title: 'Time zone and summer time',
        values: { off, pre, rec: mode === '2' ? '2' : '1', dOff: T('rlTimeZoneDaylightSavingTimeOffset$query') || '60',
          sw: weekNorm(rs[0]), sd: rs[1], sm: rs[2], st: rs[3], ew: weekNorm(re[0]), ed: re[1], em: re[2], et: re[3], sD: fs[0] || '', sT: fs[1] || '02:00', eD: fe[0] || '', eT: fe[1] || '03:00' },
        fields: [
          { k: 'off', label: 'Time zone (offset from UTC)', type: 'select', options: TZS },
          { k: 'pre', label: 'Summer time (daylight saving)', type: 'seg', options: [['none', 'None'], ['usa', 'USA'], ['eu', 'Europe'], ['other', 'Other']] },
          { k: 'dOff', label: 'Clock moves forward by', unit: 'min', type: 'number', show: v => v.pre !== 'none', validate: vRange(1, 1440) },
          { k: 'rec', label: 'Repeats', type: 'seg', options: [['1', 'Every year'], ['2', 'Only on these dates']], show: other },
          ...ruleFields('s', 'Starts'), ...ruleFields('e', 'Ends'),
        ],
        apply: (ch, a) => {
          const m = a.pre === 'none' ? '3' : a.pre === 'other' && a.rec === '2' ? '2' : '1';
          const [s, e] = a.pre === 'usa' || a.pre === 'eu' ? DST[a.pre] : m === '2' ? [fixOut(a.sD, a.sT), fixOut(a.eD, a.eT)] : [`${a.sw} ${a.sd} ${a.sm} ${a.st.padStart(5, '0')}`, `${a.ew} ${a.ed} ${a.em} ${a.et.padStart(5, '0')}`];
          if (m === '2' && `${a.sD} ${a.sT.padStart(5, '0')}` >= `${a.eD} ${a.eT.padStart(5, '0')}`) throw new Error('Summer time must end after it starts.');
          // not sent: rndTimeSyncManagedDateTime$scalar (the classic page re-sends the clock as read when the page loaded, before the zone)
          return c.formPost('API/general_sntp_settings.htm', { rlTimeZoneVT: 'OK', 'rlTimeZoneVT$query': 'OK', 'rlTimeZoneIndex$query': T('rlTimeZoneIndex$query') || '1', 'rlTimeZoneTimeZoneOffset$query': a.off,
            'rlTimeZoneTimeZoneCode$query': a.off !== '00:00' ? 'UTC' : T('rlTimeZoneTimeZoneCode$query') || '', 'rlTimeZoneDaylightSavingTimeCode$query': T('rlTimeZoneDaylightSavingTimeCode$query') || '',
            'rlTimeZoneDaylightSavingTimeMode$query': m, ...(m === '3' ? {} : { 'rlTimeZoneDaylightSavingTimeOffset$query': a.dOff, 'rlTimeZoneDaylightSavingTimeStart$query': tohex(s), 'rlTimeZoneDaylightSavingTimeEnd$query': tohex(e) }),
            'rlTimeZoneVT$endQuery': 'OK' });
        },
      }),
      c.form({
        title: 'Set the clock by hand', help: `Local time in the switch's time zone. Not kept across a restart${method === '2' ? '; while SNTP is in sync it overrides this' : ''}. Set the time zone first: the switch reads this as local time in its current zone.`,
        values: { d: '', t: '' }, applyLabel: 'Set clock',
        fields: [{ k: 'd', label: 'Date', placeholder: clk ? clk.d : 'YYYY-MM-DD', validate: vDate }, { k: 't', label: 'Time', placeholder: clk ? clk.t : 'hh:mm:ss', validate: v => /^([01]?\d|2[0-3]):[0-5]\d:[0-5]\d$/.test(v || '') ? null : 'enter a time as hh:mm:ss' }],
        apply: (ch, a) => { const [y, m, d] = a.d.split('-'), [hh, mm, ss] = a.t.split(':'); return c.formPost('API/general_sntp_settings.htm', { 'rndTimeSyncManagedDateTime$scalar': d + m + y.slice(2) + hh.padStart(2, '0') + mm + ss }); },
      }),
      h('div', { class: 'acts' }, h('button', { class: 'btn', onclick: e => {
        const n = new Date(), p = x => String(x).padStart(2, '0');
        act(e.currentTarget, () => c.formPost('API/general_sntp_settings.htm', { 'rndTimeSyncManagedDateTime$scalar': p(n.getDate()) + p(n.getMonth() + 1) + String(n.getFullYear()).slice(2) + p(n.getHours()) + p(n.getMinutes()) + p(n.getSeconds()) }),
          'Clock set. Not saved yet.').then(() => { journal.add(['Date and time: clock set from this computer']); setTimeout(c.refresh, 1200); }).catch(() => {});
      } }, icon('clock'), "Set to this computer's time")),
    ];
  },
});

/* ================= SNTP ================= */
defSettings({
  id: 'sntp', group: 'Time', title: 'Time servers (SNTP)', icon: 'clock',
  terms: 'sntp ntp time server poll interval unicast broadcast anycast authentication key trusted interface synchronisation sync',
  keys: [TK.srv, TK.glob, TK.auth, TK.bc],
  render(c) {
    const syncAddr = fv(TK.srv, 'rlSntpNtpConfigSyncSrvAddr'), G = k => fv(TK.glob, k + '$scalar');
    const srvs = frows(TK.srv, ['rlSntpServerInetAddress', 'rlSntpServerInetPolled', 'rlSntpServerInetKeyIdentifier', 'rlSntpServerInetStatus', 'rlSntpServerInetLastResp']);
    const keys = frows(TK.auth, ['rlSntpAuthenticationKeyID', 'rlSntpAuthenticationKeyValue', 'rlSntpAuthenticationKeyState']);
    const bc = frows(TK.bc, ['rlSntpBroadcastIfIndex', 'rlPhdPortsIfIndexName', 'rlSntpBroadcastIfAdminState']);
    const keyOpts = [['0', 'None'], ...keys.map(k => [k.rlSntpAuthenticationKeyID, 'Key ' + k.rlSntpAuthenticationKeyID])];
    const ifName = i => +i > 99999 ? 'VLAN ' + (i - 99999) : 'Port ' + i;
    const SRV = 'sntp_servers_table', AUT = 'sntp_authentication_table';
    return [
      c.table({ title: 'Servers', help: 'The switch takes the time from the best server that answers (Primary).', rows: srvs, key: r => r.rlSntpServerInetAddress, empty: 'No time servers.',
        columns: [{ label: 'Server', get: r => h('span', { class: 'mono' }, r.rlSntpServerInetAddress) },
          { label: 'Status', get: r => h('span', { class: 'cell' }, h('i', { class: 'led ' + (r.rlSntpServerInetStatus === '3' ? 'lg' : r.rlSntpServerInetStatus === '2' ? 'ly' : '') }),
            ' ' + (r.rlSntpServerInetStatus === '3' && r.rlSntpServerInetAddress === syncAddr ? 'In sync (primary)' : SNTP_ST[r.rlSntpServerInetStatus] || r.rlSntpServerInetStatus)) },
          { label: 'Last answer', get: r => ntpAge(r.rlSntpServerInetLastResp) }, { label: 'Polled', get: r => onOff(r.rlSntpServerInetPolled) },
          { label: 'Key', get: r => r.rlSntpServerInetKeyIdentifier === '0' ? '' : r.rlSntpServerInetKeyIdentifier }],
        add: { label: 'Add server', values: { a: '', p: '1', k: '0' },
          fields: [{ k: 'a', label: 'Server address', help: 'IPv4 or IPv6, e.g. 162.159.200.1', validate: v => vIp(v) && vIp6(v) ? 'enter an IPv4 or IPv6 address' : null },
            { k: 'p', label: 'Poll this server', type: 'toggle' }, { k: 'k', label: 'Authentication key', type: 'select', options: keyOpts }],
          apply: a => c.formPost('API/sntp_servers_a.htm', { [SRV]: 'OK', [SRV + '$endVT']: 'OK', 'rlSntpServerInetAddress$add': a.a.trim(), 'rlSntpServerInetPolled$select': a.p,
            'rlSntpServerInetKeyIdentifier$add': a.k, 'rlSntpServerInetRowStatus$add': '0', [SRV + '$endAdd']: 'OK' }) },
        edit: { fields: () => [{ k: 'p', label: 'Poll this server', type: 'toggle' }, { k: 'k', label: 'Authentication key', type: 'select', options: keyOpts }],
          values: r => ({ p: r.rlSntpServerInetPolled, k: r.rlSntpServerInetKeyIdentifier || '0' }),
          apply: (ch, a, r) => c.formPost(`API/sntp_servers_e.htm?Query:rlSntpServerInetAddress=${r.rlSntpServerInetAddress}`, { 'rlSntpServerInetAddress$query2': r.rlSntpServerInetAddress,
            'rlSntpServerInetPolled$query': a.p, 'rlSntpServerInetKeyIdentifier$query': a.k, 'rlSntpServerInetRowStatus$query': '1', [SRV + '$endQuery']: 'OK' }) },
        remove: { apply: r => c.formPost('API/sntp_servers.htm', { [SRV]: 'OK', [SRV + '$endVT']: 'OK', 'rlSntpServerInetAddress$repeat?1': r.rlSntpServerInetAddress,
          'rlSntpServerInetRowStatus$repeat?1': '6', [SRV + '$endRepeat?1']: 'OK' }) } }),
      c.form({ title: 'How the switch listens',
        values: { poll: G('rlSntpNtpConfigPollInterval'), uni: G('rlSntpUnicastAdminState'), upoll: G('rlSntpUnicastPollState'), bc: G('rlSntpBroadcastAdminState'), any: G('rlSntpAnycastAdminState') },
        fields: [{ k: 'uni', label: 'Use the servers above (unicast)', type: 'toggle' }, { k: 'upoll', label: 'Ask them regularly (poll)', type: 'toggle' },
          { k: 'poll', label: 'Poll interval', unit: 's', type: 'number', validate: vRange(60, 86400) },
          { k: 'bc', label: 'Accept broadcast time updates', help: 'From any SNTP server on the network, on the interfaces below', type: 'toggle' },
          { k: 'any', label: 'Accept anycast time updates', type: 'toggle' }],
        apply: (ch, a) => c.formPost('API/general_sntp_set.htm', { 'rlSntpNtpConfigPollInterval$scalar': a.poll, 'rlSntpBroadcastAdminState$scalar': a.bc, 'rlSntpAnycastAdminState$scalar': a.any,
          'rlSntpUnicastAdminState$scalar': a.uni, 'rlSntpUnicastPollState$scalar': a.upoll }) }),
      c.table({ title: 'Broadcast and anycast interfaces', help: 'Where the switch accepts broadcast or anycast updates.', rows: bc, key: r => ifName(r.rlSntpBroadcastIfIndex), empty: 'No interfaces.',
        columns: [{ label: 'Interface', get: r => ifName(r.rlSntpBroadcastIfIndex) }, { label: 'Receives updates', get: r => r.rlSntpBroadcastIfAdminState === '1' ? 'Yes' : 'No' }],
        add: { label: 'Add interface', values: { ifn: 'VLAN' + ((c.m.vlans[0] || {}).id || 1) }, fields: [{ k: 'ifn', label: 'Interface', type: 'select', options: [...vlanIfs(c), ...portIfs(c)] }],
          apply: a => c.formPost('API/general_sntp_a.htm', { 'rlSntpBroadcastIfIndex$Add': ifIndexOf(c, a.ifn), 'rlSntpBroadcastIfAdminState$Add': '1', 'rlSntpBroadcastMode$Add': '4',
            'rlSntpBroadcastPolled$Add': '1', 'rlSntpBroadcastRowStatus$Add': '4', 'sntp_broadcast_table$endAdd': 'OK' }) },
        remove: { apply: r => c.formPost('API/general_sntp_m.htm', { 'rlSntpBroadcastIfIndex$repeat?1': r.rlSntpBroadcastIfIndex, 'rlSntpBroadcastRowStatus$repeat?1': '6', 'sntp_broadcast_table$endRepeat?1': 'OK' }) } }),
      c.form({ title: 'Authentication', values: { s: fv(TK.auth, 'rlSntpAuthenticationState$scalar') },
        fields: [{ k: 's', label: 'Require authenticated time', help: 'Accept time only from servers using a trusted key', type: 'toggle' }],
        danger: (ch, a) => a.s === '1' && !keys.some(k => k.rlSntpAuthenticationKeyState === '1') ? 'No key is trusted yet, so the switch will stop accepting time from any server.' : null,
        apply: (ch, a) => c.formPost('API/show_authen_table.htm', { 'rlSntpAuthenticationState$scalar': a.s }) }),
      c.table({ title: 'Authentication keys', rows: keys, key: r => 'key ' + r.rlSntpAuthenticationKeyID, empty: 'No keys.',
        columns: [{ label: 'Key ID', get: r => r.rlSntpAuthenticationKeyID, num: true }, { label: 'Key', get: () => '••••••' }, { label: 'Trusted', get: r => r.rlSntpAuthenticationKeyState === '1' ? 'Yes' : 'No' }],
        add: { label: 'Add key', values: { id: '', v: '', t: '2' }, fields: [{ k: 'id', label: 'Key ID', type: 'number', validate: vRange(1, 4294967295) },
          { k: 'v', label: 'Key', type: 'password', validate: v => /^.{1,8}$/.test(v || '') ? null : '1 to 8 characters' }, { k: 't', label: 'Trusted', type: 'toggle' }],
          apply: a => c.formPost('API/show_authen_table_a.htm', { 'rlSntpAuthenticationKeyID$add': a.id, 'rlSntpAuthenticationKeyValue$add': a.v, 'rlSntpAuthenticationKeyState$add': a.t,
            'rlSntpAuthenticationRowStatus$add': '4', [AUT + '$endAdd']: 'OK' }) },
        edit: { fields: () => [{ k: 'v', label: 'New key', type: 'password', help: 'Leave empty to keep it', validate: v => !v || /^.{1,8}$/.test(v) ? null : '1 to 8 characters' }, { k: 't', label: 'Trusted', type: 'toggle' }],
          values: r => ({ v: '', t: r.rlSntpAuthenticationKeyState }),
          apply: (ch, a, r) => c.formPost(`API/show_authen_table_e.htm?Query:rlSntpAuthenticationKeyID=${r.rlSntpAuthenticationKeyID}`, { 'rlSntpAuthenticationKeyID$query': r.rlSntpAuthenticationKeyID,
            'rlSntpAuthenticationKeyValue$query': a.v || r.rlSntpAuthenticationKeyValue, 'rlSntpAuthenticationKeyState$query': a.t, [AUT + '$endQuery']: 'OK' }) },
        remove: { apply: r => c.formPost('API/show_authen_table.htm', { 'rlSntpAuthenticationKeyID$repeat?1': r.rlSntpAuthenticationKeyID, 'rlSntpAuthenticationRowStatus$repeat?1': '6',
          'sntp_authentication_Table$endRepeat?1': 'OK' }) } }),
    ];
  },
});

/* ================= shared: save / restart buttons, file transfer progress ================= */
const saveBtn = () => h('button', { class: 'btn pri', disabled: !dirty.state, onclick: e => saveConfig(e.currentTarget) }, icon('save'), 'Save configuration');
const restartBtn = () => h('button', { class: 'btn danger', onclick: async e => {
  const b = e.currentTarget;
  if (!await confirmBox('Restart the switch?', ['All ports go down for about a minute.', dirty.state ? 'There are unsaved changes; they will be lost.' : 'The startup configuration is up to date.'], 'Restart', true)) return;
  await act(b, () => api.post({ section: 'Reload', action: 'set', body: { dummy: null } }, 'reload').catch(() => {}), 'Restarting… this page reconnects when the switch is back.');
  waitForReboot();
} }, icon('refresh'), 'Restart switch…');

const xfer = { line: h('p', { class: 'note', role: 'status' }), bar: h('div', { class: 'progress', hidden: true }, h('i')), busy: false };
function xferShow(text, frac) { xfer.line.textContent = text || ''; xfer.bar.hidden = frac == null; if (frac != null) xfer.bar.firstChild.style.width = Math.round(frac * 100) + '%'; }
/* follow a copy through LoadStatus (1 s polls; 60 s watchdog until it shows up), then clear it; a startup-config download restarts the switch */
async function watchLoad(opts = {}) {
  const t0 = Date.now();
  let seen = false, st = '';
  for (;;) {
    await sleep(1000);
    const s = (await api.get(['LoadStatus'], PRIO.USER)).LoadStatus || {};
    data.put('LoadStatus', s);
    st = s.copyStatusType || '';
    if (st === '1' || st === '2') { seen = true; xferShow(`Copying on the switch… ${bytes(s.bytesTransfered)}`, null); continue; }
    if (st === '5') { xferShow(`Done${s.bytesTransfered ? ` (${bytes(s.bytesTransfered)})` : ''}.`); break; }
    if (st === '3' || st === '4') { xferShow('The copy failed' + (s.errorMessage ? ': ' + s.errorMessage : '.')); break; }
    if (!seen && Date.now() - t0 > 60000) { xferShow(opts.quiet ? '' : 'The switch reported no transfer.'); return false; }
    if (Date.now() - t0 > 30 * 60000) { xferShow('Still not finished after 30 minutes; check the log.'); return false; }
  }
  const reboot = st === '5' && opts.reboot && String(((data.get('LoadStatus') || {}).destinationFileType) || '3') === '3';
  await api.post([{ section: 'LoadStatus', action: 'delete', body: { unitID: '0' } }, ...(reboot ? [{ section: 'Reload', action: 'set', body: { unitID: '0' } }] : [])], 'clear transfer status').catch(() => {});
  if (reboot) { toast('Startup configuration replaced. Restarting…'); waitForReboot(); }
  if (st === '5' && !reboot) toast('Transfer finished.');
  if (st !== '5') toast('The transfer failed.', true);
  return st === '5';
}
function uploadFile(file, code) {
  const name = ('C:\\fakepath\\' + file.name).replace(/[#&%+ ]/g, encodeURIComponent); // what the classic iframe form sends as filename
  return net.enqueue(PRIO.USER, 'upload ' + file.name, () => new Promise((res, rej) => {
    const x = new XMLHttpRequest();
    x.open('POST', `/http_uploadfile?action=${code}&filename=${name}`);
    x.timeout = 30 * 60000;
    x.upload.onprogress = e => e.lengthComputable && xferShow(`Uploading ${file.name}… ${bytes(e.loaded)} of ${bytes(e.total)}`, e.loaded / e.total);
    x.onload = () => /log_off_page/.test(x.responseURL || '') ? rej(new AuthError()) : x.status >= 400 ? rej(new SwitchError(`The switch returned HTTP ${x.status}.`)) : res(x.responseText);
    x.onerror = () => rej(new SwitchError('The upload failed. Check the connection.'));
    x.ontimeout = () => rej(new SwitchError('The upload took too long.'));
    const fd = new FormData(); fd.append('srcFileName', file); x.send(fd);
  }));
}
const UP_OPTS = [['8', 'Firmware image'], ['9', 'Boot code'], ['2', 'Running configuration'], ['3', 'Startup configuration']], UP_KIND = Object.fromEntries(UP_OPTS);
const upWarn = (code, c) => {
  const iu = sec(c.get('ImageUnitList'), 'Entry')[0] || {}, other = iu.currentImage === '1' ? '2' : '1';
  return { 8: `The file replaces image ${other} (the one not running now, version ${iu['image' + other + 'Version'] || 'none'}). The switch keeps running; to use it, choose it under Firmware images and restart.`,
    9: 'A wrong or broken boot code file can stop the switch from starting.',
    2: `The commands are applied to the running configuration right away. Lines that change the management address (${location.hostname}), VLAN 1 or the uplink port can cut this connection.`,
    3: 'This replaces the startup configuration and restarts the switch when the copy finishes. Unsaved changes are lost.' }[code];
};

/* ================= Firmware images ================= */
defSettings({
  id: 'firmware', group: 'Maintenance', title: 'Firmware images', icon: 'chipi', terms: 'firmware image active image boot image next boot version upgrade downgrade dual image',
  keys: [{ key: 'ImageUnitList' }, { key: 'SystemGlobalSetting' }, dirty.key],
  render(c) {
    const iu = sec(c.get('ImageUnitList'), 'Entry')[0] || {}, s = c.get('SystemGlobalSetting') || {};
    const img = n => ({ n: String(n), v: iu['image' + n + 'Version'] || 'not available', d: iu['image' + n + 'Description'] || '' });
    const imgs = [img(1), img(2)];
    return [
      c.kv([['Running', `image ${iu.currentImage}, version ${s.firmwareVersion || img(iu.currentImage).v}`], ['Starts next from', `image ${iu.nextBootImage}`], ['Boot code', s.bootVersion],
        iu.currentImage !== iu.nextBootImage ? ['', h('span', { class: 'cell' }, h('i', { class: 'led ly' }), ' the next restart switches images')] : null]),
      c.table({ rows: imgs, key: r => 'image ' + r.n,
        columns: [{ label: 'Image', get: r => r.n }, { label: 'Version', get: r => h('span', { class: 'mono' }, r.v) },
          { label: 'Running now', get: r => r.n === iu.currentImage ? h('span', { class: 'cell' }, h('i', { class: 'led lg' }), ' yes') : '' },
          { label: 'At next start', get: r => r.n === iu.nextBootImage ? 'yes' : '' }] }),
      c.form({ title: 'Image to start next time', values: { n: iu.nextBootImage },
        fields: [{ k: 'n', label: 'Start from', type: 'seg', options: imgs.map(r => [r.n, `Image ${r.n} · ${r.v}`]) }],
        danger: (ch, a) => `Takes effect at the next restart. If image ${a.n} (${img(a.n).v}) is broken or much older, the switch may not come back or may drop settings it does not know.` +
          (s.doesNextImageRequireCDBDeletion === '1' ? ' The switch reports that this image needs the configuration erased.' : ''),
        apply: (ch, a) => c.post('ImageUnitList', { Entry: { nextBootImage: a.n } }) }),
      iu.currentImage !== iu.nextBootImage ? c.block('Restart to switch images', h('div', { class: 'acts' }, saveBtn(), restartBtn())) : null,
    ];
  },
});

/* ================= Update and backup ================= */
const AUTO = fkey('API/file_auto_update.htm');
defSettings({
  id: 'transfer', group: 'Maintenance', title: 'Update and backup', icon: 'xfer',
  terms: 'update firmware upload download backup configuration running startup copy tftp http file transfer auto update auto configuration dhcp option 67',
  keys: [{ key: 'ImageUnitList' }, { key: 'SystemGlobalSetting' }, { key: 'LoadStatus', cls: 'live' }, AUTO],
  render(c) {
    const ls = c.get('LoadStatus') || {}, A = k => fv(AUTO, k + '$scalar');
    if (!xfer.busy && /^[12]$/.test(ls.copyStatusType || '')) xferShow(`A copy is running on the switch… ${bytes(ls.bytesTransfered)}`);
    const file = h('input', { type: 'file', 'aria-label': 'File to upload' });
    const kind = h('select', { 'aria-label': 'What the file is' }, UP_OPTS.map(([v, l]) => h('option', { value: v }, l)));
    const dl = (action, label) => h('a', { class: 'btn', href: '/Http_download?action=' + action, download: '', onclick: () => {
      if (xfer.busy) return; xfer.busy = true; xferShow('Preparing ' + label.toLowerCase() + '…');
      setTimeout(() => watchLoad({ quiet: true }).catch(e => toast(e.message, true)).finally(() => { xfer.busy = false; }), 500);
    } }, icon('save'), label);
    return [
      c.block('Back up to this computer', c.note('Downloads straight from the switch.'),
        h('div', { class: 'acts' }, dl(2, 'Running configuration'), dl(3, 'Startup configuration'), dl(4, 'Firmware image'))),
      c.block('Update from this computer', c.note(`Firmware ${(c.get('SystemGlobalSetting') || {}).firmwareVersion || ''}, boot code ${(c.get('SystemGlobalSetting') || {}).bootVersion || ''} now. A new image goes into the slot that is not running.`),
        h('div', { class: 'ff' }, h('div', { class: 'fl' }, h('label', {}, 'What the file is'), kind), h('div', { class: 'fl' }, h('label', {}, 'File'), file)),
        h('div', { class: 'acts' }, h('button', { class: 'btn pri', onclick: async e => {
          const b = e.currentTarget, f = file.files[0], code = kind.value;
          if (!f) return toast('Choose a file first.', true);
          if (xfer.busy) return toast('A transfer is already running.', true);
          if (!await confirmBox(`Upload ${UP_KIND[code].toLowerCase()}?`, [f.name + ' · ' + bytes(f.size), upWarn(code, c)], 'Upload', code !== '8')) return;
          xfer.busy = true;
          try {
            await act(b, () => uploadFile(f, code));
            journal.add([`Update and backup: uploaded ${UP_KIND[code].toLowerCase()} ${f.name}`]);
            xferShow('Uploaded. The switch is writing it…');
            await watchLoad({ reboot: code === '3' });
            setTimeout(c.refresh, 1200);
          } catch (ex) { xferShow(ex.message); } finally { xfer.busy = false; }
        } }, icon('xfer'), 'Upload'))),
      h('div', { class: 'blk' }, xfer.line, xfer.bar),
      c.form({
        title: 'Copy with a TFTP server', values: { dir: 'down', what: '8', back: '2', ip: '', fn: '' },
        fields: [{ k: 'dir', label: 'Direction', type: 'seg', options: [['down', 'Server → switch'], ['up', 'Switch → server']] },
          { k: 'what', label: 'File', type: 'select', options: UP_OPTS, show: v => v.dir === 'down' },
          { k: 'back', label: 'File', type: 'select', options: [['2', 'Running configuration'], ['3', 'Startup configuration'], ['8', 'Firmware image']], show: v => v.dir === 'up' },
          { k: 'ip', label: 'TFTP server', validate: vIp }, { k: 'fn', label: 'File name on the server', validate: v => /^.{1,64}$/.test(v || '') ? null : '1 to 64 characters' }],
        danger: (ch, a) => a.dir === 'down' ? upWarn(a.what, c) : null,
        apply: async (ch, a) => {
          if (xfer.busy) throw new Error('A transfer is already running.');
          await c.post('FileCopy', a.dir === 'down' ? { srcLocation: '3', srcFileType: '1', srcIPAddr: a.ip.trim(), srcFileName: a.fn, destLocation: '1', destFileType: a.what }
            : { srcLocation: '1', srcFileType: a.back, destLocation: '3', destIPAddr: a.ip.trim(), destFileType: '1', destFileName: a.fn });
          xfer.busy = true; xferShow('Started…');
          watchLoad({ reboot: a.dir === 'down' && a.what === '3' }).catch(e => toast(e.message, true)).finally(() => { xfer.busy = false; });
        },
      }),
      c.form({
        title: 'Automatic update at start-up', help: 'Uses DHCP options 66/67 and a TFTP server; needs an address from DHCP in the startup configuration.',
        values: { cfg: A('rlDhcpClOption67Enable'), img: A('rlDhcpClAutoUpdateEnabled'), force: A('rlDhcpClAutoConfigForce'), save: A('rlDhcpClAutoConfigAutoSave') },
        fields: [{ k: 'cfg', label: 'Download configuration', help: 'Only when the startup configuration is empty, unless forced below', type: 'toggle' },
          { k: 'img', label: 'Download firmware', type: 'toggle' },
          { k: 'force', label: 'Force the configuration download at the next start', help: 'Even if a startup configuration exists', type: 'toggle' },
          { k: 'save', label: 'Save the downloaded configuration', help: 'Copy it to the startup configuration', type: 'toggle' }],
        danger: (ch, a) => a.force === '1' ? 'At the next start the switch replaces its configuration with the one from the TFTP server.' : null,
        apply: (ch, a) => c.formPost('API/file_auto_update.htm', { 'rlDhcpClOption67Enable$scalar': a.cfg, 'rlDhcpClAutoUpdateEnabled$scalar': a.img, 'rlDhcpClAutoConfigForce$scalar': a.force, 'rlDhcpClAutoConfigAutoSave$scalar': a.save }),
      }),
    ];
  },
});

/* ================= Factory defaults ================= */
defSettings({
  id: 'factory', group: 'Maintenance', title: 'Factory defaults', icon: 'undo', terms: 'restore factory defaults reset erase configuration wipe',
  keys: [],
  render(c) {
    return [
      c.note('Erases the startup configuration. After the next restart every setting is back to factory defaults.'),
      c.kv([['Address after reset', '192.168.2.1, mask 255.255.255.0'], ['Sign-in after reset', 'admin / admin'], ['This connection', `lost: you reach the switch at ${location.hostname} now`]]),
      c.block('Back up first', h('div', { class: 'acts' }, h('a', { class: 'btn', href: '/Http_download?action=3', download: '' }, icon('save'), 'Startup configuration'),
        h('a', { class: 'btn', href: '/Http_download?action=2', download: '' }, icon('save'), 'Running configuration'))),
      h('div', { class: 'acts' }, h('button', { class: 'btn danger', onclick: async e => {
        const b = e.currentTarget;
        if (!await confirmBox('Restore factory defaults?', ['The startup configuration is erased now. After the restart the switch answers at 192.168.2.1 with user admin / admin; VLANs, addresses and passwords are gone.'], 'Erase configuration', true)) return;
        try {
          await act(b, async () => {
            const f = await api.form('API/restore_factory_defaults.htm', PRIO.USER);
            if (f['rlCopyIndex$query'] === '1') throw new Error('Another file transfer is in progress. Try again when it has finished.');
            await c.formPost('API/restore_factory_defaults.htm', { rndAction: '27' });
          }, 'Configuration erased. Restart the switch to finish.');
          journal.add(['Factory defaults: startup configuration erased']);
          b.parentNode.append(' ', restartBtn());
        } catch { /* toast shown */ }
      } }, 'Restore factory defaults…')),
    ];
  },
});

/* ================= Jumbo frames (Switching) ================= */
defSettings({
  id: 'jumbo', group: 'Switching', title: 'Jumbo frames', icon: 'link', terms: 'jumbo frames mtu 9000 large frames frame size',
  keys: [{ key: 'SystemGlobalSetting' }, dirty.key],
  render(c) {
    const s = c.get('SystemGlobalSetting') || {}, now = s.jumboFrameEnabled, next = s.jumboFrameEnabledAfterReset;
    return [
      c.kv([['Now', onOff(now)], ['After the next restart', onOff(next)], now !== next ? ['', h('span', { class: 'cell' }, h('i', { class: 'led ly' }), ' waiting for save and restart')] : null]),
      c.form({ values: { j: next }, fields: [{ k: 'j', label: 'Jumbo frames', help: 'Frames up to about 10 KB on all ports. Takes effect after saving and restarting.', type: 'toggle' }],
        apply: (ch, a) => c.formPost('API/switch_jumbo_fr.htm', { rlJumboFramesStatusAfterReset: a.j }) }),
      now !== next ? c.block('Save and restart to apply', h('div', { class: 'acts' }, saveBtn(), restartBtn())) : null,
    ];
  },
});
}
