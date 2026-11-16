/* ---------- boot: render from cache at once, then refresh behind it ---------- */
function startWorkspace() {
  if (store.get('inspW')) document.documentElement.style.setProperty('--insp-w', store.get('inspW') + 'px');
  $('#app').replaceChildren(h('header', { class: 'top' }),
    h('div', { class: 'work' }, h('main', { class: 'ws' }), h('aside', { class: 'insp', 'aria-label': 'Inspector' })));
  if (session.state !== 'ok') { session.state = 'ok'; session.last = Date.now() - session.timeout * 0.5; } // optimistic: the first request tells
  session.start();
  prefetch.start();
  renderAll();
  refresh();
  data.need([K.sys, K.ip, K.gw, dirty.key], { prio: PRIO.VIEW }).catch(() => {});
  data.need(DEVICES, { prio: PRIO.PREFETCH }).catch(() => {}); // finds "your connection" and fills names from LLDP
  setTimeout(() => features.load().catch(() => {}), 1500);
}

if (cookie.get('sessionID') && cookie.get('userStatus')) startWorkspace();
else { if (forgetOn()) forgetCache(); showLogin(); }
