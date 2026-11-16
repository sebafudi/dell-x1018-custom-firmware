/* ---------- Settings: Switch (identity) and Maintenance (session, restart) ---------- */
defSettings({
  id: 'identity', group: 'Switch', title: 'Name and location', icon: 'pen', terms: 'system name hostname location contact identity',
  keys: [{ key: 'SystemGlobalSetting', cls: 'config' }],
  render(c) {
    const s = c.get('SystemGlobalSetting') || {};
    return [c.form({
      help: 'The name appears in this page, in the CLI prompt and to network tools such as SNMP and LLDP.',
      values: { systemName: s.systemName || '', systemLocation: s.systemLocation || '', systemContact: s.systemContact || '' },
      fields: [
        { k: 'systemName', label: 'Switch name', validate: v => /^[A-Za-z0-9][\w.-]{0,159}$/.test(v) ? null : 'use letters, digits, dot, dash or underscore, no spaces' },
        { k: 'systemLocation', label: 'Location', placeholder: 'e.g. hallway closet' },
        { k: 'systemContact', label: 'Contact', placeholder: 'e.g. your name or email' },
      ],
      apply: ch => c.post('SystemGlobalSetting', ch),
    }), c.kv([['Model', s.systemDescription], ['Serial number', s.serialNumber], ['MAC address', s.MACAddress], ['Hardware', s.hardwareVersion], ['Boot code', s.bootVersion], ['Firmware', s.firmwareVersion], ['Up for', s.systemUpTime ? uptime(s.systemUpTime) : '']])];
  },
});

defSettings({
  id: 'restart', group: 'Maintenance', title: 'Save and restart', icon: 'refresh', terms: 'reboot reload restart save startup configuration copy running',
  keys: [dirty.key],
  render(c) {
    return [
      c.block('Startup configuration', c.note(dirty.state ? 'Some applied changes are not saved: they are lost when the switch restarts.' : 'The running configuration is saved.'),
        h('div', { class: 'acts' }, h('button', { class: 'btn pri', disabled: !dirty.state, onclick: e => saveConfig(e.currentTarget) }, icon('save'), 'Save configuration'))),
      c.block('Restart', c.note('All ports go down for about a minute.'),
        h('button', { class: 'btn danger', onclick: async e => {
          const btn = e.currentTarget;
          if (!await confirmBox('Restart the switch?', ['All ports go down for about a minute.', dirty.state ? 'There are unsaved changes; they will be lost.' : 'The startup configuration is up to date.'], 'Restart', true)) return;
          await act(btn, () => api.post({ section: 'Reload', action: 'set', body: { dummy: null } }, 'reload').catch(() => {}), 'Restarting… this page reconnects when the switch is back.');
          waitForReboot();
        } }, 'Restart switch…')),
      c.block('Sign-in session', c.kv([['Idle sign-out', `about ${Math.round(session.timeout / 1000)} s after the last request (measured)`],
        ['Keepalive', 'while this tab is visible, a tiny request whenever nothing else went out for a while']])),
    ];
  },
});

function waitForReboot() {
  const t0 = Date.now();
  session.state = 'expired'; net.paused = true; bus.emit('session');
  const tick = async () => {
    if (Date.now() - t0 < 40000) return setTimeout(tick, 5000);
    try { const r = await fetch(`${BASE}/config/log_off_page.htm`, { cache: 'no-store' }); if (r.ok) { toast('The switch is back. Sign in to continue.'); return; } } catch { /* still down */ }
    setTimeout(tick, 5000);
  };
  setTimeout(tick, 5000);
}
