/* ---------- sign-in: full screen only when there is no session at all; inline when one expires ---------- */
function loginForm(onDone, compact) {
  const user = h('input', { type: 'text', name: 'user', autocomplete: 'username', value: store.get('user') || 'admin', 'aria-label': 'User name' });
  const pass = h('input', { type: 'password', name: 'pass', autocomplete: 'current-password', 'aria-label': 'Password', placeholder: 'Password' });
  const bar = h('i'), prog = h('div', { class: 'progress', hidden: true }, bar), err = h('p', { class: 'err', role: 'alert' });
  const btn = h('button', { class: 'btn pri', type: 'submit' }, 'Sign in');
  const form = h('form', { onsubmit: async e => {
    e.preventDefault();
    btn.disabled = true; btn.textContent = 'Signing in…'; err.textContent = ''; prog.hidden = false;
    const t0 = Date.now(), timer = setInterval(() => { bar.style.width = Math.min(95, (Date.now() - t0) / 90) + '%'; }, 200);
    try {
      const status = await api.login(user.value.trim(), pass.value);
      if (status === 'expired' || status === 'noStrong') { location.href = `${BASE}/home.htm`; return; } // forced password change: the classic UI handles it
      session.touch(Date.now()); onDone();
    } catch (ex) { err.textContent = ex.message; pass.select(); } finally {
      clearInterval(timer); prog.hidden = true; bar.style.width = '0'; btn.disabled = false; btn.textContent = 'Sign in';
    }
  } }, compact ? null : h('label', {}, h('span', { class: 'mu', style: 'display:block;font-size:12px;margin-bottom:6px' }, 'User name'), user),
    compact ? h('p', {}, 'User ', h('b', {}, store.get('user') || 'admin')) : null,
    h('label', {}, compact ? null : h('span', { class: 'mu', style: 'display:block;font-size:12px;margin-bottom:6px' }, 'Password'), pass),
    h('div', { style: 'display:flex;gap:10px;align-items:center' }, btn, h('span', { class: 'mu', style: 'font-size:12px' }, 'takes about 8 s')), prog, err);
  if (compact) user.hidden = true, form.prepend(user);
  setTimeout(() => (store.get('user') ? pass : user).focus(), 0);
  return form;
}

function showLogin(msg) {
  $('#app').replaceChildren(h('div', { class: 'login' }, h('div', { style: 'display:grid;gap:18px;width:min(360px,100%)' },
    h('div', {}, h('h1', {}, store.get('sysname') || 'x1018'), h('p', { class: 'mu', style: 'margin:4px 0 0' }, 'Dell Networking X1018')),
    msg ? h('p', { style: 'margin:0;color:var(--amb)' }, msg) : null,
    loginForm(() => startWorkspace()))));
}

/* signed out while working: the workspace is hidden (nothing from the switch stays on screen) but kept in memory,
 * so pending changes and half-typed input are still there after signing in again. With "forget cached data" on, the cache is wiped too. */
const forgetOn = () => store.get('forgetOnSignout') === true;
function forgetCache() { data.forget(); store.del('prevStats'); store.del('lastStats'); store.del('traffic'); prevStats = null; traffic.clear(); }
let relogEl = null;
const lockApp = on => document.body.classList.toggle('locked', on); // hides the workspace and any open sheet (CSS), keeps them in the DOM
bus.on('session', () => {
  if (session.state === 'expired' && $('.work') && !relogEl) {
    if (forgetOn()) forgetCache();
    lockApp(true);
    relogEl = h('div', { class: 'login relog', role: 'dialog', 'aria-label': 'Sign in again' }, h('div', { style: 'display:grid;gap:18px;width:min(360px,100%)' },
      h('div', {}, h('h1', {}, store.get('sysname') || 'x1018'), h('p', { class: 'mu', style: 'margin:4px 0 0' }, 'Signed out: the switch ended the session.')),
      h('p', { class: 'mu', style: 'margin:0' }, pending.count() ? `Your ${pending.count()} pending change${pending.count() > 1 ? 's are' : ' is'} kept.` : 'Your view is kept.'),
      loginForm(() => { if (relogEl) { relogEl.remove(); relogEl = null; } lockApp(false); net.resume(); refresh(); }, true),
      h('button', { class: 'btn ghost sm', style: 'justify-self:start', onclick: () => location.reload() }, 'Sign in as someone else')));
    document.body.append(relogEl);
  }
  if (session.state === 'ok' && relogEl) { relogEl.remove(); relogEl = null; lockApp(false); if (net.paused) net.resume(); }
});

async function signOut() {
  await api.logout();
  if (forgetOn()) forgetCache();
  session.state = 'unknown'; clearInterval(session.timer); net.q.length = 0;
  showLogin('Signed out.');
}

/* the session sheet: opened from the session status in the top bar */
function openSession() {
  const tog = h('button', { class: ['tog', forgetOn() && 'on'], role: 'switch', 'aria-checked': String(forgetOn()), 'aria-label': 'Forget cached data when signed out',
    onclick: e => { const v = !forgetOn(); store.set('forgetOnSignout', v); e.currentTarget.classList.toggle('on', v); e.currentTarget.setAttribute('aria-checked', String(v)); } });
  const close = sheet('Session', h('div', { class: 'ff' },
    h('p', { style: 'margin:0' }, session.state === 'ok' ? ['Signed in as ', h('b', {}, store.get('user') || 'admin'), '.'] : 'Signed out.'),
    h('p', { class: 'note' }, 'The switch ends a session after about a minute without requests, so a tiny keepalive request goes out every 30 s when nothing else did.'),
    h('div', { class: 'fl line' }, h('label', { for: 'keepbg' }, 'When this tab is in the background', h('span', { class: 'hint' }, 'How long it keeps you signed in while you are in another tab or window.')),
      h('select', { id: 'keepbg', style: 'width:auto', onchange: e => store.set('keepBg', +e.target.value) },
        [[0, 'Sign out after a minute'], [900e3, 'Stay signed in 15 min'], [3600e3, 'Stay signed in 1 hour'], [8 * 3600e3, 'Stay signed in 8 hours'], [-1, 'Always stay signed in']]
          .map(([v, t]) => h('option', { value: v, selected: v === session.bg() }, t)))),
    h('div', { class: 'fl line' }, h('span', {}, 'Forget cached data when signed out',
      h('span', { class: 'hint' }, 'Views open instantly because the last data read is kept in this browser. With this on, it is wiped whenever the session ends.')), tog),
    h('div', { class: 'acts' },
      h('button', { class: 'btn', onclick: () => { forgetCache(); toast('Cached data cleared. Reading again…'); refresh(); } }, icon('refresh'), 'Clear cached data now'),
      h('button', { class: 'btn danger', onclick: () => { close(); signOut(); } }, 'Sign out'))));
}

/* "expires in N s": only when the keepalive could not reach the switch (network trouble) */
bus.on('session-tick', () => {
  const left = session.left(), show = session.state === 'ok' && session.pingFail && !document.hidden && left > 0 && left < 20000;
  let bar = $('.expiring');
  if (!show) { bar && bar.remove(); return; }
  if (!bar) document.body.append(bar = h('div', { class: 'expiring', role: 'alert' }));
  bar.replaceChildren(`The switch is not answering. Session ends in ${Math.ceil(left / 1000)} s`, h('button', { class: 'btn sm', style: 'border-color:#15171b', onclick: () => session.ping(PRIO.USER).catch(() => {}) }, 'Retry'));
});
