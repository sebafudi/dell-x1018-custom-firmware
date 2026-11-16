{ // block scope: nothing here leaks into the shared bundle scope
/* ---------- Settings: Monitoring (log settings, remote syslog, SNMP, RMON configuration) ----------
 * Local copies of the small helpers (each feature file is its own block scope). Live RMON statistics and history samples belong to the diagnostics views. */
function repRows(v, lead, suf = '$repeat?') {
  const out = [];
  for (const [k, val] of Object.entries(v || {})) {
    const i = k.indexOf(suf), n = i < 0 ? 0 : +k.slice(i + suf.length);
    if (n > 0) (out[n] = out[n] || { _n: n })[k.slice(0, i)] = val;
  }
  return out.filter(r => r && (!lead || r[lead] != null));
}
async function guard(title, msg) {
  if (msg && !await confirmBox(title, arr(msg), 'Apply anyway', true)) throw new Error('Cancelled. Nothing was sent to the switch.');
}
const rng = (a, b, blank) => v => (blank && String(v ?? '') === '') || (/^\d+$/.test(String(v).trim()) && +v >= a && +v <= b) ? null : `enter a whole number from ${a} to ${b}${blank ? ' or leave it empty' : ''}`;
const isIp = v => /^(\d{1,3}\.){3}\d{1,3}$/.test(v) ? v.split('.').every(x => +x < 256) : /^[0-9a-f:.]+$/i.test(v) && v.includes(':');
const ipOk = v => isIp(String(v || '').trim()) ? null : 'enter an IPv4 or IPv6 address';
ICONS.bell = '<path d="M4 11V7a4 4 0 0 1 8 0v4l1.5 1.5h-11ZM6.5 14h3"/>';

const SEVLVL = [['2', 'Urgent (emergency, alert, critical)'], ['4', 'Major and above (errors, warnings)'], ['6', 'Informational and above'], ['7', 'Everything, including debug'], ['8', 'Off']];
const sevText = v => +v >= 8 ? 'off' : +v >= 7 ? 'everything' : +v >= 5 ? 'informational and above' : +v >= 3 ? 'major and above' : 'urgent only';
const ENDIS = v => v === '1' ? 'on' : 'off';
const ipType = ip => String(ip).includes(':') ? '2' : '1';

/* ---------- Log settings ---------- */
const LOGK = 'form:API/logs_settings_s.htm';
const LOGF = [ // [key, form field, label, hint, kind]
  ['on', 'rlSyslogGlobalEnable$scalar', 'Logging', 'record events at all', 't'],
  ['aaa', 'rlAAAAuditingEnable$scalar', 'Sign-in events', 'who signed in or failed to', 't'],
  ['copy', 'rlCopyAuditingEnable$scalar', 'File copy events', 'firmware and configuration transfers', 't'],
  ['mng', 'rlMngInfAuditingEnable$scalar', 'Management access events', 'connections refused by management access rules', 't'],
  ['con', 'rlSyslogMinLogToConsoleSeverity$scalar', 'Console cable', 'what is printed on the serial console', 's'],
  ['ram', 'rlSyslogMinLogToCacheSeverity$scalar', 'RAM log', 'fast, lost at restart; shown in the Log view', 's'],
  ['file', 'rlSyslogMinLogToFileSeverity$scalar', 'Flash log', 'kept across restarts; keep it to urgent to spare the flash', 's'],
  ['size', 'rlSyslogCacheSizeAfterReset$scalar', 'RAM log size', 'entries, 20–400; takes effect after a restart', 'n'],
];
defSettings({
  id: 'logging', group: 'Monitoring', title: 'Log settings', icon: 'list', terms: 'logs syslog logging severity ram flash buffer console auditing clear log',
  keys: [LOGK],
  intro: 'What the switch writes to its own logs. Severity = how serious an event is; each target keeps the chosen level and everything more serious.',
  render(c) {
    const g = n => fv(LOGK, n);
    return [
      c.kv(LOGF.map(([, n, label, , kind]) => [label, kind === 't' ? ENDIS(g(n)) : kind === 's' ? sevText(g(n)) : g(n)])),
      c.form({
        values: Object.fromEntries(LOGF.map(([k, n]) => [k, g(n) ?? ''])),
        fields: LOGF.map(([k, , label, help, kind]) => kind === 't' ? { k, label, help, type: 'toggle', show: k === 'on' ? null : a => a.on === '1' }
          : kind === 's' ? { k, label, help, type: 'select', options: SEVLVL, show: k === 'con' ? null : a => a.on === '1' }
          : { k, label, help, type: 'number', min: 20, max: 400, width: '9em', validate: rng(20, 400), show: a => a.on === '1' }),
        apply: (ch, a) => c.formPost('API/logs_settings_s.htm', Object.fromEntries(LOGF.map(([k, n]) => [n, a[k]]))), // the classic page always sends all 8 together
      }),
      c.block('Clear logs', c.note('Deletes the stored entries; new events are recorded as before.'), h('div', { class: 'acts' },
        [['RAM log', 'API/logs_settings_ram.htm', 'rlSyslogClearCache$scalar'], ['Flash log', 'API/logs_settings_log.htm', 'rlSyslogClearLogfile$scalar']].map(([l, p, f]) =>
          h('button', { class: 'btn danger', type: 'button', onclick: async e => {
            if (!await confirmBox(`Clear the ${l}?`, [`Every entry in the ${l} is deleted. This cannot be undone.`], 'Clear', true)) return;
            await act(e.currentTarget, () => api.formPost(p, { [f]: '1' }, 'clear ' + l), `${l} cleared.`).catch(() => {});
          } }, 'Clear ' + l + '…')))),
    ];
  },
});

/* ---------- Remote log servers (syslog) ---------- */
const FAC = [16, 17, 18, 19, 20, 21, 22, 23].map(n => [String(n), 'Local ' + (n - 16)]);
const RSEV = [['2', 'Urgent'], ['4', 'Major and above'], ['6', 'Informational and above'], ['7', 'Everything']];
defSettings({
  id: 'syslog', group: 'Monitoring', title: 'Remote log servers', icon: 'list', terms: 'syslog server remote logging log server udp 514 facility',
  keys: ['SyslogServerList'],
  intro: 'Send log events to a syslog server on your network, where they survive anything that happens to the switch.',
  render(c) {
    const list = rows(c.get('SyslogServerList'), 'SyslogServer');
    const fields = edit => [edit ? null : { k: 'IPAddr', label: 'Server address', validate: ipOk },
      { k: 'portNo', label: 'UDP port', type: 'number', width: '9em', validate: rng(1, 65535) },
      { k: 'severity', label: 'Send', type: 'select', options: RSEV, help: 'the least serious level that is sent' },
      { k: 'facility', label: 'Facility', type: 'select', options: FAC, help: 'a label the server uses to sort messages' },
      { k: 'descr', label: 'Description', validate: v => (v || '').length <= 64 ? null : 'at most 64 characters' }].filter(Boolean);
    const body = (a, r) => ({ SyslogServer: { ...(r ? { index: r.index, addrType: r.addrType, IPAddr: r.IPAddr } : { addrType: ipType(a.IPAddr.trim()), IPAddr: a.IPAddr.trim() }),
      descr: a.descr || '', portNo: String(+a.portNo), facility: a.facility, severity: a.severity } });
    return c.table({
      rows: list, key: r => r.IPAddr, empty: 'No remote log servers.',
      columns: [{ label: 'Server', get: r => r.IPAddr + (r.portNo && r.portNo !== '514' ? ':' + r.portNo : '') }, { label: 'Sends', get: r => sevText(r.severity) },
        { label: 'Facility', get: r => (FAC.find(f => f[0] === r.facility) || [, r.facility === '24' ? 'no map' : r.facility])[1] }, { label: 'Description', get: r => r.descr }],
      add: { label: 'Add server', values: { portNo: '514', severity: '4', facility: '23', descr: '' }, fields: fields(false), apply: a => c.post('SyslogServerList', body(a)) },
      edit: { values: r => ({ portNo: r.portNo, severity: r.severity, facility: r.facility, descr: r.descr || '' }), fields: () => fields(true), apply: (ch, a, r) => c.post('SyslogServerList', body(a, r)) },
      remove: { confirm: r => `Stops sending log events to ${r.IPAddr}.`, apply: r => c.post('SyslogServerList', { SyslogServer: { index: r.index, addrType: r.addrType, IPAddr: r.IPAddr } }, 'delete') },
    });
  },
});

/* ---------- SNMP: agent, engine ID, communities ---------- */
const ACC = [['1', 'Read only'], ['2', 'Read and write'], ['3', 'SNMP admin']];
const SECM = [['1', 'v1'], ['2', 'v2c'], ['3', 'v3']];
const SECT = [['1', 'No authentication'], ['2', 'Authentication'], ['3', 'Authentication and encryption']];
const viewOpts = c => rows(c.get('ViewList'), 'ViewEntry').map(v => [v.viewName, v.viewName]);
defSettings({
  id: 'snmp', group: 'Monitoring', title: 'SNMP', icon: 'pulse', terms: 'snmp community public private agent engine id remote engine traps notifications monitoring v1 v2c',
  keys: ['SNMPGlobalSetting', 'CommunityList', 'SNMPGroupList', 'ViewList', 'SNMPRemoteEngineIDList'],
  intro: 'SNMP lets monitoring tools (graphs, alerts) read the switch\'s counters and status.',
  render(c) {
    const g = c.get('SNMPGlobalSetting') || {};
    const groups = rows(c.get('SNMPGroupList'), 'SNMPGroup').filter(x => x.securityModel !== '3').map(x => [x.SNMPGroupName, x.SNMPGroupName]);
    const comm = rows(c.get('CommunityList'), 'CommunityEntry');
    const cf = edit => [edit ? null : { k: 'communityString', label: 'Community', help: 'the password SNMP tools use to read the switch', validate: v => /^\S{1,20}$/.test(v || '') ? null : '1–20 characters, no spaces' },
      edit ? null : { k: 'ip', label: 'Allowed manager', placeholder: 'empty = any address', validate: v => !v || isIp(v.trim()) ? null : 'an IP address, or empty for any' },
      { k: 'mode', label: 'Mode', type: 'seg', options: [['basic', 'Basic'], ['adv', 'Group (advanced)']] },
      { k: 'accessMode', label: 'Access', type: 'select', options: ACC, show: a => a.mode === 'basic', help: 'SNMP admin can also change SNMP itself' },
      { k: 'viewName', label: 'View', type: 'select', options: [['', 'Everything'], ...viewOpts(c)], show: a => a.mode === 'basic' && a.accessMode !== '3', help: 'which part of the switch it can see' },
      { k: 'group', label: 'Group', type: 'select', options: groups.length ? groups : [['', 'no v1/v2c group yet']], show: a => a.mode === 'adv' }].filter(Boolean);
    const cbody = (a, r) => { const ip = r ? r.managementStationIPAddress : (a.ip || '').trim() || '0.0.0.0';
      return { CommunityEntry: { communityString: r ? r.communityString : a.communityString, managementStationType: ip === '0.0.0.0' ? '2' : '1', managementStationIPAddress: ip,
        ...(a.mode === 'basic' ? { Basic: { accessMode: a.accessMode, viewName: a.accessMode === '3' || !a.viewName ? null : a.viewName } } : { Advance: { SNMPGroupName: a.group } }) } }; };
    const writeWarn = a => a.mode === 'basic' && a.accessMode !== '1' ? 'Anyone who knows this community can change the switch configuration over SNMP, including settings that cut connectivity. Prefer read only.' : null;
    return [
      c.form({
        title: 'Agent', values: { SNMPEnbl: g.SNMPEnbl || '2', trapsEnbl: g.trapsEnbl || '2', authTrapsEnbl: g.authTrapsEnbl || '2', localEngineIDType: g.localEngineIDType || '0', localEngineID: g.localEngineID || '' },
        fields: [{ k: 'SNMPEnbl', label: 'SNMP', type: 'toggle', help: 'answer SNMP requests and send notifications' },
          { k: 'trapsEnbl', label: 'Notifications (traps)', type: 'toggle', help: 'tell the recipients below about events such as a link going down' },
          { k: 'authTrapsEnbl', label: 'Wrong-community notifications', type: 'toggle', help: 'report requests with an unknown community' },
          { k: 'localEngineIDType', label: 'Engine ID', type: 'select', options: [['0', 'None'], ['1', 'Default (from the MAC address)'], ['2', 'Custom']], help: 'needed before SNMPv3 users can be added' },
          { k: 'localEngineID', label: 'Custom engine ID', placeholder: 'hex, 10–64 digits', show: a => a.localEngineIDType === '2', validate: v => /^([0-9a-f]{2}){5,32}$/i.test(v || '') ? null : '10–64 hex digits, an even number' }],
        danger: ch => ch.localEngineIDType || ch.localEngineID ? 'Changing the engine ID makes existing SNMPv3 users invalid; they must be added again.' : null,
        apply: (ch, a) => c.post('SNMPGlobalSetting', { SNMPEnbl: a.SNMPEnbl, trapsEnbl: a.trapsEnbl, authTrapsEnbl: a.authTrapsEnbl, localEngineIDType: a.localEngineIDType, localEngineID: a.localEngineIDType === '2' ? a.localEngineID : undefined }),
      }),
      c.kv([['Current engine ID', g.localEngineIDType === '0' ? 'none' : g.localEngineID]]),
      c.table({
        title: 'Communities', rows: comm, key: r => r.communityString, empty: 'No communities: v1/v2c tools cannot read the switch.',
        help: 'Community = the password SNMP v1/v2c tools use to read the switch. It travels unencrypted.',
        columns: [{ label: 'Community', get: r => h('span', { class: 'mono' }, r.communityString) }, { label: 'Manager', get: r => r.managementStationType === '1' ? r.managementStationIPAddress : 'any' },
          { label: 'Access', get: r => r.Advance ? 'group ' + r.Advance.SNMPGroupName : (ACC.find(x => x[0] === (r.Basic || {}).accessMode) || [, ''])[1] + ((r.Basic || {}).viewName ? ` · view ${r.Basic.viewName}` : '') }],
        add: { label: 'Add community', values: { communityString: '', ip: '', mode: 'basic', accessMode: '1', viewName: '', group: (groups[0] || [''])[0] }, fields: cf(false),
          apply: async a => { await guard('Add community', writeWarn(a)); await c.post('CommunityList', cbody(a)); } },
        edit: { values: r => ({ mode: r.Advance ? 'adv' : 'basic', accessMode: (r.Basic || {}).accessMode || '1', viewName: (r.Basic || {}).viewName || '', group: (r.Advance || {}).SNMPGroupName || (groups[0] || [''])[0] }), fields: () => cf(true),
          apply: async (ch, a, r) => { await guard('Change community', writeWarn(a)); await c.post('CommunityList', cbody(a, r)); } },
        remove: { confirm: r => `Tools using "${r.communityString}" can no longer read the switch.`, apply: r => c.post('CommunityList', { CommunityEntry: { communityString: r.communityString, managementStationIPAddress: r.managementStationIPAddress } }, 'delete') },
      }),
      c.table({
        title: 'Remote engine IDs', help: 'Only needed to send SNMPv3 informs to, or accept users of, another SNMP engine.',
        rows: rows(c.get('SNMPRemoteEngineIDList'), 'Entry'), key: r => r.IPAddress, empty: 'None.',
        columns: [{ label: 'Address', get: r => r.IPAddress }, { label: 'Engine ID', get: r => h('span', { class: 'mono' }, r.remoteEngineID) }],
        add: { label: 'Add remote engine', fields: [{ k: 'IPAddress', label: 'Address', validate: ipOk }, { k: 'remoteEngineID', label: 'Engine ID', validate: v => /^([0-9a-f]{2}){5,32}$/i.test(v || '') ? null : '10–64 hex digits' }],
          apply: a => c.post('SNMPRemoteEngineIDList', { Entry: { IPAddress: a.IPAddress.trim(), remoteEngineID: a.remoteEngineID } }, 'add') },
        edit: { values: r => ({ remoteEngineID: r.remoteEngineID }), fields: () => [{ k: 'remoteEngineID', label: 'Engine ID', validate: v => /^([0-9a-f]{2}){5,32}$/i.test(v || '') ? null : '10–64 hex digits' }],
          apply: (ch, a, r) => c.post('SNMPRemoteEngineIDList', { Entry: { IPAddress: r.IPAddress, remoteEngineID: a.remoteEngineID } }, 'edit') },
        remove: { confirm: r => `SNMPv3 users tied to ${r.IPAddress} stop working.`, apply: r => c.post('SNMPRemoteEngineIDList', { Entry: { IPAddress: r.IPAddress, remoteEngineID: r.remoteEngineID } }, 'delete') },
      }),
    ];
  },
});

/* ---------- SNMP views, groups and v3 users ---------- */
const OIDV = v => /^\d+(\.\d+)*$/.test((v || '').trim()) ? null : 'a numeric OID such as 1.3.6.1.2.1';
defSettings({
  id: 'snmpv3', group: 'Monitoring', title: 'SNMP views, groups and users', icon: 'pulse', terms: 'snmp view oid subtree group access control vacm usm snmpv3 user authentication privacy md5 sha des',
  keys: ['ViewOIDList', 'ViewList', 'SNMPGroupList', 'SNMPUserISList', 'SNMPGlobalSetting', 'SNMPRemoteEngineIDList'],
  intro: 'View = which part of the switch\'s data a tool may see. Group = which views a set of users may read, write or be notified about. SNMPv3 users sign in with their own password.',
  render(c) {
    const vl = rows(c.get('ViewOIDList'), 'ViewEntry'), views = vl.map(v => v.viewName);
    const flat = vl.flatMap(v => rows(v.OIDSubtreeList, 'OIDEntry').map(o => ({ view: v.viewName, ...o })));
    const grp = rows(c.get('SNMPGroupList'), 'SNMPGroup'), v3g = grp.filter(x => x.securityModel === '3');
    const users = rows(c.get('SNMPUserISList'), 'Entry'), g = c.get('SNMPGlobalSetting') || {}, remotes = rows(c.get('SNMPRemoteEngineIDList'), 'Entry');
    const reserved = n => n === 'Default' || n === 'DefaultSuper';
    const vopt = [['', 'None'], ...views.map(v => [v, v])];
    const gf = edit => [edit ? null : { k: 'SNMPGroupName', label: 'Group name', validate: v => /^\S{1,30}$/.test(v || '') ? null : '1–30 characters, no spaces' },
      edit ? null : { k: 'securityModel', label: 'SNMP version', type: 'seg', options: SECM },
      edit ? null : { k: 'securityType', label: 'Security', type: 'select', options: SECT, show: a => a.securityModel === '3' },
      { k: 'readView', label: 'Read', type: 'select', options: vopt }, { k: 'writeView', label: 'Write', type: 'select', options: vopt },
      { k: 'notifyView', label: 'Notify', type: 'select', options: vopt, show: a => (a.securityModel || '') === '3' }].filter(Boolean);
    const gkey = r => ({ SNMPGroupName: r.SNMPGroupName, securityModel: r.securityModel, securityType: r.securityType });
    const engines = [...(g.localEngineIDType !== '0' ? [['local', 'This switch']] : []), ...remotes.map(r => [r.IPAddress, 'Remote ' + r.IPAddress])];
    const uf = edit => [edit ? null : { k: 'userName', label: 'User name', validate: v => /^\S{1,30}$/.test(v || '') ? null : '1–30 characters, no spaces' },
      edit ? null : { k: 'engine', label: 'Engine', type: 'select', options: engines.length ? engines : [['', 'set an engine ID first (SNMP section)']] },
      { k: 'groupName', label: 'Group', type: 'select', options: v3g.length ? [...new Set(v3g.map(x => x.SNMPGroupName))].map(n => [n, n]) : [['', 'add a v3 group first']] },
      { k: 'authenticationMethod', label: 'Authentication', type: 'seg', options: [['0', 'None'], ['1', 'MD5'], ['2', 'SHA']] },
      { k: 'authenticationPassword', label: 'Authentication password', type: 'password', show: a => a.authenticationMethod !== '0', validate: v => /^.{1,32}$/.test(v || '') ? null : '1–32 characters' },
      { k: 'privacyMethod', label: 'Encryption', type: 'seg', options: [['1', 'None'], ['2', 'DES']], show: a => a.authenticationMethod !== '0' },
      { k: 'privacyPassword', label: 'Encryption password', type: 'password', show: a => a.authenticationMethod !== '0' && a.privacyMethod === '2', validate: v => /^.{1,32}$/.test(v || '') ? null : '1–32 characters' }].filter(Boolean);
    const ubody = a => ({ authenticationMethod: a.authenticationMethod, privacyMethod: a.authenticationMethod === '0' ? '1' : a.privacyMethod,
      authenticationPassword: a.authenticationMethod === '0' ? '' : a.authenticationPassword, privacyPassword: a.authenticationMethod !== '0' && a.privacyMethod === '2' ? a.privacyPassword : '' });
    return [
      c.table({
        title: 'Views', rows: flat, key: r => `${r.view} ${r.OIDSubtree}`, empty: 'No views.',
        columns: [{ label: 'View', get: r => r.view }, { label: 'Subtree', get: r => h('span', {}, h('span', { class: 'mono' }, r.OIDSubtree), r.OIDSubtreeString ? h('span', { class: 'mu' }, ' ' + r.OIDSubtreeString) : null) },
          { label: '', get: r => r.viewAction === '1' ? 'included' : 'excluded' }],
        add: { label: 'Add subtree', values: { viewName: '', OIDSubtree: '', viewAction: '1' },
          fields: [{ k: 'viewName', label: 'View', placeholder: views.filter(v => !reserved(v)).join(', ') || 'e.g. interfaces', help: 'an existing view gets another subtree; a new name creates the view', validate: v => !/^\S{1,30}$/.test(v || '') ? '1–30 characters, no spaces' : reserved(v) ? 'Default and DefaultSuper are built in and read-only' : null },
            { k: 'OIDSubtree', label: 'OID subtree', placeholder: '1.3.6.1.2.1.2', validate: OIDV }, { k: 'viewAction', label: '', type: 'seg', options: [['1', 'Include'], ['2', 'Exclude']] }],
          apply: a => c.post('ViewOIDList', { ViewEntry: { viewName: a.viewName, OIDSubtreeList: { OIDEntry: [...flat.filter(r => r.view === a.viewName).map(r => ({ OIDSubtree: r.OIDSubtree, viewAction: r.viewAction })), { OIDSubtree: a.OIDSubtree.trim(), viewAction: a.viewAction }] } } }) },
        remove: { confirm: r => reserved(r.view) ? 'Built-in views cannot be changed; the switch will refuse.' : `Removes ${r.OIDSubtree} from view ${r.view}. Removing its last subtree removes the view.`,
          apply: r => { if (reserved(r.view)) throw new Error('Built-in views cannot be changed.'); return c.post('ViewOIDList', { ViewEntry: { viewName: r.view, OIDSubtreeList: { OIDEntry: { OIDSubtree: r.OIDSubtree } } } }, 'delete'); } },
      }),
      c.table({
        title: 'Groups', rows: grp, key: r => r.SNMPGroupName, empty: 'No groups.',
        columns: [{ label: 'Group', get: r => r.SNMPGroupName }, { label: 'Version', get: r => (SECM.find(x => x[0] === r.securityModel) || [, r.securityModel])[1] },
          { label: 'Security', get: r => r.securityModel === '3' ? (SECT.find(x => x[0] === r.securityType) || [, ''])[1] : '—' },
          { label: 'Read / write / notify', get: r => [r.readView, r.writeView, r.notifyView].map(v => v || '–').join(' / ') }],
        add: { label: 'Add group', values: { securityModel: '3', securityType: '2', readView: 'Default', writeView: '', notifyView: '' }, fields: gf(false),
          apply: a => c.post('SNMPGroupList', { SNMPGroup: { SNMPGroupName: a.SNMPGroupName, securityModel: a.securityModel, securityType: a.securityModel === '3' ? a.securityType : '1',
            readView: a.readView || undefined, writeView: a.writeView || undefined, notifyView: a.securityModel === '3' && a.notifyView || undefined } }) },
        edit: { values: r => ({ readView: r.readView || '', writeView: r.writeView || '', notifyView: r.notifyView || '', securityModel: r.securityModel }), fields: () => gf(true),
          apply: (ch, a, r) => api.post([{ section: 'SNMPGroupList', action: 'delete', body: { SNMPGroup: gkey(r) } },
            { section: 'SNMPGroupList', action: 'set', body: { SNMPGroup: { ...gkey(r), readView: a.readView, writeView: a.writeView, notifyView: r.securityModel === '3' ? a.notifyView : '' } } }], 'SNMP group') },
        remove: { confirm: r => `Communities and users in group ${r.SNMPGroupName} lose their access.`, apply: r => c.post('SNMPGroupList', { SNMPGroup: gkey(r) }, 'delete') },
      }),
      c.table({
        title: 'SNMPv3 users', rows: users, key: r => r.userName, empty: 'No SNMPv3 users.',
        columns: [{ label: 'User', get: r => r.userName }, { label: 'Group', get: r => r.groupName }, { label: 'Engine', get: r => r.engineIDType === '2' ? 'remote ' + r.IPAddress : 'this switch' },
          { label: 'Security', get: r => ['none', 'MD5', 'SHA'][+r.authenticationMethod] + (r.privacyMethod === '2' ? ' + DES' : '') }],
        add: { label: 'Add user', values: { engine: (engines[0] || [''])[0], groupName: (v3g[0] || {}).SNMPGroupName || '', authenticationMethod: '2', privacyMethod: '1' }, fields: uf(false),
          apply: a => {
            if (!a.engine) throw new Error('Set an engine ID first (SNMP section).');
            if (!a.groupName) throw new Error('Add an SNMPv3 group first.');
            const rem = a.engine !== 'local' && remotes.find(r => r.IPAddress === a.engine);
            return c.post('SNMPUserISList', { Entry: { userName: a.userName, groupName: a.groupName, IPAddress: rem ? rem.IPAddress : undefined, engineIDType: rem ? '2' : '1',
              engineID: rem ? rem.remoteEngineID : g.localEngineID, ...ubody(a) } }, 'add');
          } },
        edit: { values: r => ({ groupName: r.groupName, authenticationMethod: r.authenticationMethod || '0', privacyMethod: r.privacyMethod || '1', authenticationPassword: '', privacyPassword: '' }), fields: () => uf(true),
          apply: (ch, a, r) => c.post('SNMPUserISList', { Entry: { userName: r.userName, groupName: a.groupName, IPAddress: r.engineIDType === '2' ? r.IPAddress : undefined, engineIDType: r.engineIDType, engineID: r.engineID, ...ubody(a) } }, 'edit') },
        remove: { confirm: r => `Tools signing in as ${r.userName} lose access.`, apply: r => c.post('SNMPUserISList', { Entry: { engineID: r.engineID, userName: r.userName, engineIDType: r.engineIDType, IPAddress: r.IPAddress || '' } }, 'delete') },
      }),
    ];
  },
});

/* ---------- SNMP notifications: recipients and filters ---------- */
defSettings({
  id: 'snmpnotify', group: 'Monitoring', title: 'SNMP notifications', icon: 'bell', terms: 'snmp trap inform notification recipient receiver host filter v1 v2c v3 udp 162',
  keys: ['SNMPTrap', 'NotificationReceiverList', 'NotificationFilterList', 'SNMPUserISList'],
  intro: 'Where the switch sends alerts (traps or informs) such as a link going down. Informs are acknowledged and repeated until the recipient answers.',
  render(c) {
    const t = c.get('SNMPTrap') || {}, v12 = rows(t.SNMPTrapReceiverList, 'SNMPTrapReceiverEntry'), v3 = rows(c.get('NotificationReceiverList'), 'Receiver');
    const fl = rows(c.get('NotificationFilterList'), 'Filter'), flat = fl.flatMap(f => rows(f.OIDSubtreeList, 'OIDEntry').map(o => ({ filter: f.filterName, ...o })));
    const fopt = [['', 'None (send everything)'], ...fl.map(f => [f.filterName, f.filterName])];
    const uopt = [...new Set(rows(c.get('SNMPUserISList'), 'Entry').map(u => u.userName))].map(n => [n, n]);
    const NT = [['1', 'Traps'], ['2', 'Informs']];
    const common = (a, inf) => ({ UDPPortNo: String(+a.UDPPortNo), filterEnabled: a.filterName ? '1' : '2', filterName: a.filterName || undefined,
      timeout: inf ? String(+a.timeout) : '', retries: inf ? String(+a.retries) : '' });
    const tail = [{ k: 'UDPPortNo', label: 'UDP port', type: 'number', width: '9em', validate: rng(1, 65535) },
      { k: 'filterName', label: 'Filter', type: 'select', options: fopt },
      { k: 'timeout', label: 'Wait for answer', unit: 's', type: 'number', width: '9em', show: a => a.notificationType === '2', validate: rng(1, 300) },
      { k: 'retries', label: 'Retries', type: 'number', width: '9em', show: a => a.notificationType === '2', validate: rng(1, 255) }];
    const head = edit => edit ? [] : [{ k: 'receiverIPAddress', label: 'Recipient address', validate: ipOk }, { k: 'notificationType', label: 'Kind', type: 'seg', options: NT }];
    const DEF = { UDPPortNo: '162', filterName: '', timeout: '15', retries: '3', notificationType: '1' };
    const ev = r => ({ UDPPortNo: r.UDPPortNo, filterName: r.filterEnabled === '1' ? r.filterName || '' : '', timeout: r.timeout || '15', retries: r.retries || '3', notificationType: r.notificationType });
    const cols = who => [{ label: 'Recipient', get: r => r.receiverIPAddress + (r.UDPPortNo && r.UDPPortNo !== '162' ? ':' + r.UDPPortNo : '') },
      { label: 'Kind', get: r => r.notificationType === '2' ? 'informs' : 'traps' }, who, { label: 'Filter', get: r => r.filterEnabled === '1' ? r.filterName : '—' }];
    const v12body = (a, r) => ({ SNMPTrapReceiverList: { SNMPTrapReceiverEntry: { receiverIPAddress: r ? r.receiverIPAddress : a.receiverIPAddress.trim(), notificationType: r ? r.notificationType : a.notificationType,
      communityString: a.communityString, SNMPVersion: (r ? r.notificationType : a.notificationType) === '2' ? '2' : a.SNMPVersion, ...common(a, (r ? r.notificationType : a.notificationType) === '2') } } });
    const v3key = r => ({ receiverIPAddress: r.receiverIPAddress, notificationType: r.notificationType, userName: r.userName });
    const v3body = (a, r) => ({ Receiver: { receiverIPAddress: r ? r.receiverIPAddress : a.receiverIPAddress.trim(), notificationType: r ? r.notificationType : a.notificationType,
      userName: r ? r.userName : a.userName, securityType: a.securityType, ...common(a, (r ? r.notificationType : a.notificationType) === '2') } });
    return [
      c.table({
        title: 'Recipients, SNMP v1 and v2c', rows: v12, key: r => r.receiverIPAddress, empty: 'None.',
        columns: cols({ label: 'Community', get: r => `${r.communityString} · v${r.SNMPVersion === '1' ? '1' : '2c'}` }),
        add: { label: 'Add recipient', values: { ...DEF, communityString: '', SNMPVersion: '2' },
          fields: [...head(false), { k: 'communityString', label: 'Community', help: 'sent with each notification', validate: v => /^\S{1,32}$/.test(v || '') ? null : '1–32 characters' },
            { k: 'SNMPVersion', label: 'Version', type: 'seg', options: [['1', 'v1'], ['2', 'v2c']], show: a => a.notificationType === '1' }, ...tail],
          apply: a => c.post('SNMPTrap', v12body(a)) },
        edit: { values: r => ({ ...ev(r), communityString: r.communityString, SNMPVersion: r.SNMPVersion }),
          fields: r => [{ k: 'communityString', label: 'Community', validate: v => /^\S{1,32}$/.test(v || '') ? null : '1–32 characters' },
            ...(r.notificationType === '1' ? [{ k: 'SNMPVersion', label: 'Version', type: 'seg', options: [['1', 'v1'], ['2', 'v2c']] }] : []), ...tail],
          apply: (ch, a, r) => c.post('SNMPTrap', v12body(a, r)) },
        remove: { confirm: r => `${r.receiverIPAddress} gets no more ${r.notificationType === '2' ? 'informs' : 'traps'}.`,
          apply: r => c.post('SNMPTrap', { SNMPTrapReceiverList: { SNMPTrapReceiverEntry: { notificationType: r.notificationType, receiverIPAddress: r.receiverIPAddress } } }, 'delete') },
      }),
      c.table({
        title: 'Recipients, SNMPv3', rows: v3, key: r => r.receiverIPAddress, empty: 'None.',
        columns: cols({ label: 'User', get: r => r.userName }),
        add: { label: 'Add recipient', values: { ...DEF, userName: (uopt[0] || [''])[0], securityType: '2' },
          fields: [...head(false), { k: 'userName', label: 'SNMPv3 user', type: 'select', options: uopt.length ? uopt : [['', 'add an SNMPv3 user first']] },
            { k: 'securityType', label: 'Security', type: 'select', options: SECT }, ...tail],
          apply: a => { if (!a.userName) throw new Error('Add an SNMPv3 user first.'); return c.post('NotificationReceiverList', v3body(a)); } },
        edit: { values: r => ({ ...ev(r), securityType: r.securityType }), fields: () => [{ k: 'securityType', label: 'Security', type: 'select', options: SECT }, ...tail],
          apply: (ch, a, r) => api.post([{ section: 'NotificationReceiverList', action: 'delete', body: { Receiver: v3key(r) } }, { section: 'NotificationReceiverList', action: 'set', body: v3body(a, r) }], 'SNMPv3 recipient') },
        remove: { confirm: r => `${r.receiverIPAddress} gets no more notifications for ${r.userName}.`, apply: r => c.post('NotificationReceiverList', { Receiver: v3key(r) }, 'delete') },
      }),
      c.table({
        title: 'Filters', help: 'A filter limits which notifications a recipient gets, by OID subtree.', rows: flat, key: r => `${r.filter} ${r.OIDSubtree}`, empty: 'No filters.',
        columns: [{ label: 'Filter', get: r => r.filter }, { label: 'Subtree', get: r => h('span', { class: 'mono' }, r.OIDSubtree) }, { label: '', get: r => r.filterAction === '1' ? 'included' : 'excluded' }],
        add: { label: 'Add subtree', values: { filterName: '', OIDSubtree: '', filterAction: '1' },
          fields: [{ k: 'filterName', label: 'Filter', placeholder: fl.map(f => f.filterName).join(', ') || 'e.g. links', help: 'an existing filter gets another subtree; a new name creates the filter', validate: v => /^\S{1,30}$/.test(v || '') ? null : '1–30 characters, no spaces' },
            { k: 'OIDSubtree', label: 'OID subtree', placeholder: '1.3.6.1.6.3.1.1.5', validate: OIDV }, { k: 'filterAction', label: '', type: 'seg', options: [['1', 'Include'], ['2', 'Exclude']] }],
          apply: a => c.post('NotificationFilterList', { Filter: { filterName: a.filterName, OIDSubtreeList: { OIDEntry: [...flat.filter(r => r.filter === a.filterName).map(r => ({ OIDSubtree: r.OIDSubtree, filterAction: r.filterAction })), { OIDSubtree: a.OIDSubtree.trim(), filterAction: a.filterAction }] } } }) },
        remove: { confirm: r => `Removes ${r.OIDSubtree} from filter ${r.filter}. Removing its last subtree removes the filter.`,
          apply: r => c.post('NotificationFilterList', { Filter: { filterName: r.filter, OIDSubtreeList: { OIDEntry: { OIDSubtree: r.OIDSubtree } } } }, 'delete') },
      }),
    ];
  },
});

/* ---------- RMON: events, alarms (thresholds), history control ---------- */
const EVK = 'form:API/events_table.htm', ALK = 'form:API/alarms_table.htm', HCK = 'form:API/history_control_table.htm';
const EVT = [['1', 'Nothing'], ['2', 'Log'], ['3', 'Trap'], ['4', 'Log and trap']];
const CTR = [ // counter OID -> plain name (subset of the classic list: interface, Ethernet and RMON counters)
  ['1.3.6.1.2.1.2.2.1.10', 'Received bytes'], ['1.3.6.1.2.1.2.2.1.11', 'Received unicast packets'], ['1.3.6.1.2.1.31.1.1.1.2', 'Received multicast packets'], ['1.3.6.1.2.1.31.1.1.1.3', 'Received broadcast packets'],
  ['1.3.6.1.2.1.2.2.1.16', 'Sent bytes'], ['1.3.6.1.2.1.2.2.1.17', 'Sent unicast packets'], ['1.3.6.1.2.1.31.1.1.1.4', 'Sent multicast packets'], ['1.3.6.1.2.1.31.1.1.1.5', 'Sent broadcast packets'],
  ['1.3.6.1.2.1.10.7.2.1.3', 'FCS errors'], ['1.3.6.1.2.1.10.7.2.1.4', 'Single collisions'], ['1.3.6.1.2.1.10.7.2.1.8', 'Late collisions'], ['1.3.6.1.2.1.10.7.2.1.13', 'Frames too long'],
  ['1.3.6.1.2.1.10.7.2.1.16', 'Internal MAC receive errors'], ['1.3.6.1.2.1.10.7.10.1.3', 'Received pause frames'], ['1.3.6.1.2.1.10.7.10.1.4', 'Sent pause frames'],
  ...['bytes', 'packets', 'broadcast packets', 'multicast packets', 'CRC / alignment errors', 'undersize packets', 'oversize packets', 'fragments', 'jabbers', 'collisions',
    '64-byte frames', '65–127-byte frames', '128–255-byte frames', '256–511-byte frames', '512–1023-byte frames', '1024+-byte frames'].map((n, i) => ['1.3.6.1.2.1.16.1.1.1.' + (i + 4), 'RMON ' + n]),
];
const nextFree = used => { const s = new Set(used.map(Number)); let i = 1; while (s.has(i)) i++; return String(i); };
const splitVar = v => { const m = String(v || '').match(/^(.*)\.(\d+)$/); return m ? [m[1], m[2]] : [v, '']; };
defSettings({
  id: 'rmon', group: 'Monitoring', title: 'RMON alarms and history', icon: 'pulse', terms: 'rmon remote monitoring events alarms thresholds rising falling history control sampling',
  keys: [EVK, ALK, HCK],
  intro: 'The switch watches counters itself. Alarm = a threshold on a port counter that fires an event; event = log it, send a trap, or both; history = keep periodic samples of a port.',
  render(c) {
    const evs = repRows(c.get(EVK), 'eventIndex'), als = repRows(c.get(ALK), 'alarmIndex'), hcs = repRows(c.get(HCK), 'historyControlIndex');
    const portOpts = c.m.ports.map(p => [String(p.no), 'Port ' + p.no + (p.label ? ' · ' + p.label : '')]);
    const evOpts = evs.map(e => [e.eventIndex, `${e.eventIndex} · ${e.eventDescription || (EVT.find(x => x[0] === e.eventType) || [, ''])[1]}`]);
    const evName = i => (evOpts.find(o => o[0] === i) || [, i === '0' ? '—' : i])[1];
    const ctrName = o => (CTR.find(x => x[0] === o) || [, o])[1];
    const ef = [{ k: 'eventDescription', label: 'Description', validate: v => (v || '').length <= 127 ? null : 'at most 127 characters' },
      { k: 'eventType', label: 'Action', type: 'seg', options: EVT }, { k: 'eventCommunity', label: 'Trap community', show: a => a.eventType === '3' || a.eventType === '4', validate: v => (v || '').length <= 127 ? null : 'too long' },
      { k: 'eventOwner', label: 'Owner', placeholder: 'optional', validate: v => (v || '').length <= 160 ? null : 'at most 160 characters' }];
    const EVQ = { eventCommunity: 'community', eventDescription: 'description', eventOwner: 'owner' };
    const af = [{ k: 'port', label: 'Port', type: 'select', options: portOpts }, { k: 'oid', label: 'Counter', type: 'select', options: CTR },
      { k: 'alarmSampleType', label: 'Compare', type: 'seg', options: [['2', 'Change per interval (delta)'], ['1', 'Total (absolute)']] },
      { k: 'alarmInterval', label: 'Interval', unit: 's', type: 'number', width: '9em', validate: rng(1, 2147483647) },
      { k: 'alarmRisingThreshold', label: 'Rising threshold', type: 'number', width: '12em', validate: rng(0, 2147483647) }, { k: 'alarmRisingEventIndex', label: 'Then', type: 'select', options: evOpts },
      { k: 'alarmFallingThreshold', label: 'Falling threshold', type: 'number', width: '12em', validate: (v, a) => rng(0, 2147483647)(v) || (+v > +a.alarmRisingThreshold ? 'must not be above the rising threshold' : null) },
      { k: 'alarmFallingEventIndex', label: 'Then', type: 'select', options: evOpts },
      { k: 'alarmStartupAlarm', label: 'Fire at start when', type: 'select', options: [['3', 'rising or falling'], ['1', 'rising'], ['2', 'falling']] },
      { k: 'alarmOwner', label: 'Owner', placeholder: 'optional' }];
    const ALF = ['alarmSampleType', 'alarmRisingThreshold', 'alarmRisingEventIndex', 'alarmFallingThreshold', 'alarmFallingEventIndex', 'alarmStartupAlarm', 'alarmInterval', 'alarmOwner'];
    const hf = [{ k: 'port', label: 'Port', type: 'select', options: portOpts }, { k: 'historyControlInterval', label: 'Sample every', unit: 's', type: 'number', width: '9em', validate: rng(1, 3600) },
      { k: 'historyControlBucketsRequested', label: 'Keep samples', type: 'number', width: '9em', validate: rng(1, 50) }, { k: 'historyControlOwner', label: 'Owner', placeholder: 'optional' }];
    const IFOID = '1.3.6.1.2.1.2.2.1.1.';
    return [
      c.table({
        title: 'Events', rows: evs, key: r => 'event ' + r.eventIndex, empty: 'No events. Alarms need at least one.',
        columns: [{ label: '#', get: r => r.eventIndex, num: true }, { label: 'Description', get: r => r.eventDescription }, { label: 'Action', get: r => (EVT.find(x => x[0] === r.eventType) || [, r.eventType])[1] },
          { label: 'Community', get: r => r.eventCommunity }, { label: 'Owner', get: r => r.eventOwner }],
        add: { label: 'Add event', values: { eventType: '2', eventDescription: '', eventCommunity: '', eventOwner: '' }, fields: ef,
          apply: a => c.formPost('API/events_table_a.htm', { 'eventIndex$add': nextFree(evs.map(e => e.eventIndex)), 'eventCommunity$add': a.eventCommunity || '', 'eventType$add': a.eventType,
            'eventOwner$add': a.eventOwner || '', 'eventDescription$add': a.eventDescription || '', 'eventStatus$add': '2',
            'String$communityadd': 'OK', 'Default$communityadd': 'OK', 'String$owneradd': 'OK', 'Default$owneradd': 'OK', 'eventsTable$endAdd': 'OK' }) },
        edit: { values: r => ({ eventType: r.eventType, eventDescription: r.eventDescription || '', eventCommunity: r.eventCommunity || '', eventOwner: r.eventOwner || '' }), fields: () => ef,
          apply: (ch, a, r) => {
            const f = { 'eventIndex$query': r.eventIndex };
            for (const k of Object.keys(ch)) { f[k + '$query'] = ch[k]; if (EVQ[k]) Object.assign(f, { [`String$${EVQ[k]}query`]: 'OK', [`Default$${EVQ[k]}query`]: 'OK' }); }
            return c.formPost('API/events_table_e.htm', { ...f, 'eventStatus$query': '1', 'eventTable$endQuery': 'OK' });
          } },
        remove: { confirm: r => `Alarms that point at event ${r.eventIndex} no longer log or send anything.`,
          apply: r => c.formPost('API/events_table.htm', { 'eventIndex$repeat?1': r.eventIndex, 'eventStatus$repeat?1': '4', 'eventsTable$endRepeat?1': 'OK' }) },
      }),
      c.table({
        title: 'Alarms', rows: als, key: r => 'alarm ' + r.alarmIndex, empty: 'No alarms.',
        columns: [{ label: '#', get: r => r.alarmIndex, num: true }, { label: 'Watches', get: r => { const [o, i] = splitVar(r.alarmVariable); return `port ${i} · ${ctrName(o)}`; } },
          { label: 'Value', get: r => count(r.alarmValue), num: true },
          { label: 'Rising', get: r => `≥ ${count(r.alarmRisingThreshold)} → ${evName(r.alarmRisingEventIndex)}` }, { label: 'Falling', get: r => `≤ ${count(r.alarmFallingThreshold)} → ${evName(r.alarmFallingEventIndex)}` },
          { label: 'Every', get: r => r.alarmInterval + ' s', num: true }],
        add: { label: 'Add alarm', values: { port: (portOpts[0] || [''])[0], oid: CTR[0][0], alarmSampleType: '2', alarmInterval: '100', alarmRisingThreshold: '100', alarmFallingThreshold: '20',
          alarmRisingEventIndex: (evOpts[0] || [''])[0], alarmFallingEventIndex: (evOpts[0] || [''])[0], alarmStartupAlarm: '3', alarmOwner: '' }, fields: af,
          apply: a => {
            if (!evs.length) throw new Error('Add an event first: an alarm needs an event to fire.');
            return c.formPost('API/alarms_table_a.htm', { 'alarmIndex$add': nextFree(als.map(x => x.alarmIndex)), 'alarmVariable$add': `${a.oid}.${a.port}`,
              ...Object.fromEntries(ALF.map(k => [k + '$add', String(a[k] ?? '')])), 'String$add': 'OK', 'Default$add': 'OK', 'alarmStatus$add': '2', 'alarmsTable$endAdd': 'OK' });
          } },
        edit: { values: r => { const [o, i] = splitVar(r.alarmVariable); return { port: i, oid: o, ...Object.fromEntries(ALF.map(k => [k, r[k] ?? ''])) }; }, fields: () => af,
          apply: (ch, a, r) => c.formPost('API/alarms_table_e.htm', { 'alarmsTable$query': 'OK', 'alarmIndex$query': r.alarmIndex, 'alarmVariable$query': `${a.oid}.${a.port}`,
            ...Object.fromEntries(ALF.map(k => [k + '$query', String(a[k] ?? '')])), 'String$query': 'OK', 'Default$query': 'OK', 'alarmStatus$query': '1', 'alarmsTable$endQuery': 'OK' }) },
        remove: { confirm: r => `Alarm ${r.alarmIndex} stops watching its counter.`,
          apply: r => c.formPost('API/alarms_table.htm', { 'alarmIndex$repeat?1': r.alarmIndex, 'alarmStatus$repeat?1': '4', 'alarmsTable$endRepeat?1': 'OK' }) },
      }),
      c.table({
        title: 'History', help: 'Periodic traffic samples per port; the samples themselves are in the statistics views.', rows: hcs, key: r => 'history ' + r.historyControlIndex, empty: 'No history entries.',
        columns: [{ label: '#', get: r => r.historyControlIndex, num: true }, { label: 'Port', get: r => 'port ' + splitVar(r.historyControlDataSource)[1] },
          { label: 'Every', get: r => r.historyControlInterval + ' s', num: true }, { label: 'Samples kept', get: r => `${r.historyControlBucketsGranted} of ${r.historyControlBucketsRequested}`, num: true },
          { label: 'Owner', get: r => r.historyControlOwner }],
        add: { label: 'Add history', values: { port: (portOpts[0] || [''])[0], historyControlInterval: '1800', historyControlBucketsRequested: '50', historyControlOwner: '' }, fields: hf,
          apply: a => c.formPost('API/history_control_table_a.htm', { 'historyControlIndex$add': nextFree(hcs.map(x => x.historyControlIndex)), 'historyControlDataSource$add': IFOID + a.port,
            'historyControlInterval$add': String(+a.historyControlInterval), 'historyControlBucketsRequested$add': String(+a.historyControlBucketsRequested), 'String$select': 'OK',
            'historyControlOwner$query': a.historyControlOwner || '', 'Default$select': 'OK', 'historyControlStatus$add': '2', 'His_Control_Tab$endAdd': 'OK' }) },
        edit: { values: r => ({ port: splitVar(r.historyControlDataSource)[1], historyControlInterval: r.historyControlInterval, historyControlBucketsRequested: r.historyControlBucketsRequested, historyControlOwner: r.historyControlOwner || '' }), fields: () => hf,
          apply: (ch, a, r) => c.formPost('API/history_control_table_e.htm', { 'His_Control_Tab$query': 'OK', 'historyControlIndex$query': r.historyControlIndex, 'historyControlDataSource$query': IFOID + a.port,
            'String$select': 'OK', 'historyControlOwner$query': a.historyControlOwner || '', 'Default$select': 'OK', 'historyControlBucketsRequested$query': String(+a.historyControlBucketsRequested),
            'historyControlBucketsGranted$query': r.historyControlBucketsGranted, 'historyControlInterval$query': String(+a.historyControlInterval), 'historyControlStatus$query': r.historyControlStatus || '1', 'His_Control_Tab$endQuery': 'OK' }) },
        remove: { confirm: r => `Its stored samples are deleted.`,
          apply: r => c.formPost('API/history_control_table.htm', { 'historyControlIndex$repeat?1': r.historyControlIndex, 'historyControlStatus$repeat?1': '4', 'His_Control_Tab$endRepeat?1': 'OK' }) },
      }),
    ];
  },
});
}
