/* Dev-only helpers for driving the UI from browser automation (chrome-devtools evaluate_script with sourcePath).
 * Defines window.T: T.section(id), T.fill(root, {label: value}), T.addRow(id, buttonText, values), T.confirm(), T.stage port controls, T.apply(). */
(() => {
  const w = ms => new Promise(r => setTimeout(r, ms));
  const T = window.T = { w };
  T.ready = async () => { const t0 = Date.now(); while (!(features.loaded && session.state === 'ok' && document.querySelector('.mx .r, .tbl')) && Date.now() - t0 < 30000) await w(250); };
  T.fill = (root, vals) => {
    for (const [label, v] of Object.entries(vals)) {
      const fl = [...root.querySelectorAll('.fl')].find(f => (f.querySelector('label, b')?.textContent || '').trim().startsWith(label));
      if (!fl) throw new Error('no field ' + label);
      const seg = fl.querySelector('.seg');
      if (seg) { [...seg.querySelectorAll('button')].find(b => b.textContent === v).click(); continue; }
      const tog = fl.querySelector('button.tog');
      if (tog) { if ((tog.getAttribute('aria-checked') === 'true') !== !!v) tog.click(); continue; }
      const el = fl.querySelector('select, input, textarea');
      el.value = v; el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
    }
  };
  T.section = async id => {
    document.querySelector('.sheet header .btn.ghost')?.click(); await w(200);
    openSettings(id);
    const t0 = Date.now();
    while (Date.now() - t0 < 30000) { const m = document.querySelector('.smain'); if (m && m.dataset.sec === id && !/Reading from the switch/.test(m.innerText)) break; await w(250); }
    return document.querySelector('.smain');
  };
  /* click the confirmation button of a confirm sheet stacked on top, if one appears */
  T.confirm = async () => {
    for (let i = 0; i < 15; i++) {
      await w(300);
      const sheets = [...document.querySelectorAll('.sheet')].filter(x => !x.querySelector('.sset')); // confirm sheets, not the Settings sheet
      if (!sheets.length) continue;
      const b = [...sheets[sheets.length - 1].querySelectorAll('.acts .btn')].find(x => x.textContent !== 'Cancel' && !x.closest('.sform'));
      if (b) { b.click(); return true; }
    }
    return false;
  };
  T.idle = async () => { const t0 = Date.now(); await w(300); while (Date.now() - t0 < 60000 && (net.busy || net.q.length)) await w(250); await w(1600); };
  /* add a row to a table in a settings section */
  T.addRow = async (id, button, vals, tableIndex = 0) => {
    let m = await T.section(id);
    const btn = [...m.querySelectorAll('.btn')].find(b => b.textContent.includes(button) && !b.closest('form'));
    btn.click(); await w(300);
    const ed = m.querySelector('.tedit');
    T.fill(ed, vals);
    ed.querySelector('form').requestSubmit();
    const confirmed = await T.confirm();
    await T.idle();
    m = document.querySelector('.smain');
    return { confirmed, err: m.querySelector('.ferr:not(:empty)')?.textContent || '', toasts: [...document.querySelectorAll('.toast')].map(t => t.textContent) };
  };
  /* remove the table row whose text includes `match` */
  T.removeRow = async (id, match) => {
    let m = await T.section(id);
    const tr = [...m.querySelectorAll('.tbl tbody tr')].find(r => r.innerText.includes(match));
    if (!tr) return { err: 'row not found: ' + match };
    tr.querySelector('.btn.danger').click();
    const confirmed = await T.confirm();
    await T.idle();
    return { confirmed, toasts: [...document.querySelectorAll('.toast')].map(t => t.textContent) };
  };
  T.rows = async id => { const m = await T.section(id); return [...m.querySelectorAll('.tbl')].map(t => t.innerText); };
  /* apply a settings form inside a section: fill fields of the n-th form and submit */
  T.form = async (id, vals, formIndex = 0) => {
    let m = await T.section(id);
    const f = [...m.querySelectorAll('form.sform')].filter(x => !x.closest('.tedit'))[formIndex];
    T.fill(f, vals); await w(200);
    f.requestSubmit();
    const confirmed = await T.confirm();
    await T.idle();
    m = document.querySelector('.smain');
    return { confirmed, err: m.querySelector('.ferr:not(:empty)')?.textContent || '', toasts: [...document.querySelectorAll('.toast')].map(t => t.textContent) };
  };
  /* inspector port groups: select a port, open a group, read or set its controls by label */
  T.port = async no => { const pl = [...document.querySelectorAll('.pl')].find(b => new RegExp('^Port ' + no + '\\b').test(b.getAttribute('aria-label') || '')); S.sel = [S.m.ports.find(p => p.no === no).name]; S.vlan = null; redraw(); await w(400); return pl; };
  T.group = async title => {
    let d = [...document.querySelectorAll('.insp details.grp')].find(x => x.querySelector('summary b').textContent === title);
    if (!d) throw new Error('no group ' + title);
    if (!d.open) d.querySelector('summary').click();
    const t0 = Date.now();
    while (Date.now() - t0 < 25000) { d = [...document.querySelectorAll('.insp details.grp')].find(x => x.querySelector('summary b').textContent === title); if (d && !/Reading from the switch/.test(d.innerText) && d.querySelector('.gb').children.length) break; await w(300); }
    return d;
  };
  T.values = async title => {
    const d = await T.group(title);
    return Object.fromEntries([...d.querySelectorAll('.fl')].map(fl => { const c = fl.querySelector('select, input, button.tog'); const l = (fl.querySelector('b, label')?.textContent || '').trim();
      return [l, !c ? null : c.tagName === 'BUTTON' ? c.getAttribute('aria-checked') === 'true' : c.value]; }));
  };
  T.set = async (title, vals) => {
    for (const [label, v] of Object.entries(vals)) {
      const d = await T.group(title);
      const fl = [...d.querySelectorAll('.fl')].find(f => (f.querySelector('b, label')?.textContent || '').trim().startsWith(label));
      if (!fl) throw new Error(`no control ${title} / ${label}`);
      const c = fl.querySelector('select, input, button.tog');
      if (c.tagName === 'BUTTON') { if ((c.getAttribute('aria-checked') === 'true') !== !!v) c.click(); }
      else { c.value = v; c.dispatchEvent(new Event('change', { bubbles: true })); }
      await w(300);
    }
  };
  T.apply = async () => {
    const tray = document.querySelector('.tray')?.innerText || '';
    const b = document.querySelector('.tray .btn.pri'); if (!b) return { tray, err: 'nothing pending' };
    b.click(); const confirmed = await T.confirm();
    const t0 = Date.now(); while (document.querySelector('.tray .btn.pri') && Date.now() - t0 < 90000) await w(300);
    await T.idle();
    return { tray, confirmed, toasts: [...document.querySelectorAll('.toast')].map(t => t.textContent), left: pending.count() };
  };
  T.reread = async keys => { await data.need(keys || [...data.defs.keys()].filter(k => !data.stale(k) || true).filter(k => PORT_GROUPS.some(g => g.keys.includes(k))), { prio: PRIO.USER, force: true }); redraw(); await w(600); };
  return 'T ready';
})();
