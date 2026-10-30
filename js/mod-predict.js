// ============================================================
//  MÓDULO: 🔮 ¿QUÉ PASARÁ? (apuestas sobre lo que pase en la fiesta)
//  Cualquiera propone algo que puede pasar («¿Se dormirá Hugo antes de las
//  2?»). Los demás apuestan SÍ o NO (una vez por pregunta). Cuando se sabe,
//  la Banca lo resuelve: los que acertaron recuperan lo suyo y se reparten
//  lo de los que fallaron, en proporción a lo apostado. Si nadie acertó, se
//  lo queda la Banca. «Anular» devuelve todo.
//  Datos: entries `pred` (pregunta) y `pbet` (apuesta) + tx `pbettx_…`
//  (fichas retenidas) y `pred_<id>` (reparto).
//  También lleva los apartados de la pestaña Eventos (eventos / ¿qué pasará? / fotos).
// ============================================================
(window.MNModules = window.MNModules || []).push((function () {
  'use strict';
  let MN;
  const MIN = 60000;
  const preds = () => (MN.S.entries || []).filter((x) => x.kind === 'pred');
  const betsOf = (pid) => (MN.S.entries || []).filter((x) => x.kind === 'pbet' && x.predId === pid && MN.S.txs.some((t) => t.id === 'pbettx_' + x.id && !t.voided));
  const isOpen = (p) => p.status === 'open' && (!p.closeAt || Date.now() < p.closeAt) && !MN.ended();
  const maxBet = (id) => Math.max(1, Math.floor(((MN.balances()[id] || 0) * (Number(MN.S.settings.predMaxPct) || 20)) / 100));
  const pools = (p) => { const o = { yes: 0, no: 0, ny: 0, nn: 0 }; betsOf(p.id).forEach((b) => { o[b.side] += b.amount; o[b.side === 'yes' ? 'ny' : 'nn']++; }); return o; };

  // Reparto según el resultado (null si aún no está resuelta)
  function settlement(p) {
    if (!['yes', 'no', 'void'].includes(p.status)) return null;
    const list = betsOf(p.id); const out = {};
    if (p.status === 'void') { list.forEach((b) => { out[b.player] = (out[b.player] || 0) + b.amount; }); return out; }
    const win = list.filter((b) => b.side === p.status); const lose = list.filter((b) => b.side !== p.status);
    const winPool = win.reduce((a, b) => a + b.amount, 0); const losePool = lose.reduce((a, b) => a + b.amount, 0);
    win.forEach((b) => { out[b.player] = (out[b.player] || 0) + b.amount + Math.floor((losePool * b.amount) / winPool); });
    return out;
  }
  async function sweep() {
    if (!MN.S) return;
    const writes = [];
    preds().forEach((p) => {
      const out = settlement(p); const id = 'pred_' + p.id;
      if (!out || MN.S.txs.some((t) => t.id === id)) return;
      writes.push({ id, type: 'payout', kind: 'pred', ts: p.resolvedAt || Date.now(), predId: p.id, q: p.q, result: p.status, payouts: out });
    });
    if (writes.length) await Store.putMany({ txs: writes });
  }

  // ---------------------------------------------------------- pintar
  function card(p, mine) {
    const esc = MN.esc; const po = pools(p); const my = mine && betsOf(p.id).find((b) => b.player === mine.id);
    const total = po.yes + po.no; const mult = (side) => (po[side] ? (total / po[side]).toFixed(2).replace('.', ',') : '—');
    const open = isOpen(p); const admin = MN.isAdmin();
    const left = p.closeAt ? p.closeAt - Date.now() : null;
    let status = '';
    if (p.status === 'open') status = open ? (left ? `⏳ Apuestas abiertas · cierran en <b class="ev-cd" data-to="${p.closeAt}">${Math.ceil(left / MIN)} min</b>` : '⏳ Apuestas abiertas hasta que la Banca lo resuelva') : '🔒 Apuestas cerradas · esperando a que la Banca lo resuelva';
    else status = p.status === 'void' ? '🚫 Anulada: se devolvió todo' : `${p.status === 'yes' ? '✅ ¡SÍ pasó!' : '❌ NO pasó'}`;
    const btn = (side, label) => `<button type="button" class="btn ${side === 'yes' ? 'primary' : 'ghost'}" data-pbet="${esc(p.id)}" data-side="${side}">${label}</button>`;
    return `<li class="challenge pred-card ${p.status !== 'open' ? 'done ' + p.status : ''}">
      <div class="pred-q">🔮 ${esc(p.q)}</div>
      <div class="ch-sub">Propuesta por ${MN.who(p.by)} · ${MN.ago(p.ts)}</div>
      <div class="pred-pools"><div class="pred-side yes"><b>SÍ</b><span>${po.yes} fichas · ${po.ny} ${po.ny === 1 ? 'apuesta' : 'apuestas'}</span><small>paga x${mult('yes')}</small></div>
        <div class="pred-side no"><b>NO</b><span>${po.no} fichas · ${po.nn} ${po.nn === 1 ? 'apuesta' : 'apuestas'}</span><small>paga x${mult('no')}</small></div></div>
      <div class="ch-status small">${status}${my ? ` · Tu apuesta: <b>${my.amount}</b> al <b>${my.side === 'yes' ? 'SÍ' : 'NO'}</b>` : ''}</div>
      ${open && mine && !my ? `<div class="ch-actions">${btn('yes', '✅ Apostar SÍ')}${btn('no', '❌ Apostar NO')}</div>` : ''}
      ${admin && p.status === 'open' ? `<div class="admin-actions">🏦 <button type="button" class="mini" data-pres="yes" data-id="${esc(p.id)}">Ha pasado</button><button type="button" class="mini" data-pres="no" data-id="${esc(p.id)}">No ha pasado</button><button type="button" class="mini danger" data-pres="void" data-id="${esc(p.id)}">Anular</button></div>` : ''}
    </li>`;
  }
  function render() {
    const el = MN.$('#pred-list'); if (!el || !MN.S) return;
    const mine = MN.me();
    const list = preds().sort((a, b) => b.ts - a.ts);
    const open = list.filter((p) => p.status === 'open'); const done = list.filter((p) => p.status !== 'open');
    el.innerHTML = open.map((p) => card(p, mine)).join('') || '<li class="empty">Nadie ha propuesto nada todavía. ¡Sé el primero!</li>';
    MN.$('#pred-done-wrap').hidden = !done.length;
    MN.$('#pred-done').innerHTML = done.map((p) => card(p, mine)).join('');
    MN.$('#pred-new').hidden = !mine || MN.ended();
    const n = mine ? open.filter((p) => isOpen(p) && !betsOf(p.id).some((b) => b.player === mine.id)).length : 0;
    const badge = MN.$('#pred-badge'); badge.hidden = !n; badge.textContent = n;
  }

  // ---------------------------------------------------------- acciones
  async function onClick(e) {
    const tab = e.target.closest('[data-evpane]');
    if (tab) { showPane(tab.dataset.evpane); return; }
    const b = e.target.closest('[data-pbet]');
    if (b) {
      const mine = MN.me(); const p = preds().find((x) => x.id === b.dataset.pbet); if (!mine || !p) return;
      if (!isOpen(p)) return MN.toast('Las apuestas de esta pregunta están cerradas', 'bad');
      if (betsOf(p.id).some((x) => x.player === mine.id)) return MN.toast('Ya has apostado en esta pregunta', 'bad');
      const side = b.dataset.side; const max = maxBet(mine.id);
      const res = await MN.modal(`<div class="modal-icon">🔮</div><p class="modal-text">«${MN.esc(p.q)}»</p>
        <p class="center">Apuestas a que <b>${side === 'yes' ? 'SÍ' : 'NO'}</b> pasa</p>
        <input type="number" name="amount" min="1" max="${max}" value="${Math.min(5, max)}" inputmode="numeric">
        <p class="hint center">Máximo ${max} fichas (el ${MN.S.settings.predMaxPct || 20}% de lo que tienes). Se retienen hasta que se resuelva.</p>`, 'Apostar');
      if (!res) return;
      const amount = parseInt(res.amount, 10);
      if (!amount || amount < 1 || amount > max) return MN.toast(`La apuesta debe estar entre 1 y ${max}`, 'bad');
      const id = Store.uid(); const now = Date.now();
      return MN.act(() => Store.putMany({
        entries: [{ id, kind: 'pbet', eventId: null, predId: p.id, player: mine.id, side, amount, ts: now }],
        txs: [{ id: 'pbettx_' + id, type: 'charge', kind: 'pbet', ts: now, player: mine.id, amount, predId: p.id, side }],
      }), `🔮 Apostado: ${amount} al ${side === 'yes' ? 'SÍ' : 'NO'}`);
    }
    const r = e.target.closest('[data-pres]');
    if (r && MN.isAdmin()) {
      const p = preds().find((x) => x.id === r.dataset.id); if (!p) return;
      const what = { yes: '✅ Ha pasado (gana el SÍ)', no: '❌ No ha pasado (gana el NO)', void: '🚫 Anular y devolver todo' }[r.dataset.pres];
      if (!await MN.modal(`<div class="modal-icon">🏦</div><p class="modal-text">«${MN.esc(p.q)}»</p><p class="center"><b>${what}</b></p>`, 'Resolver')) return;
      await MN.act(() => Store.update('entries', p.id, { status: r.dataset.pres, resolvedAt: Date.now() }), 'Resuelta');
      MN.sweepAll();
    }
  }
  async function create(e) {
    e.preventDefault();
    const mine = MN.me(); if (!mine) return;
    const q = MN.$('#pred-q').value.trim().slice(0, 120);
    if (q.length < 5) return MN.toast('Escribe qué puede pasar', 'bad');
    const mins = Number(MN.$('#pred-close').value) || 0; const now = Date.now();
    const ok = await MN.act(() => Store.put('entries', { id: 'pr_' + Store.uid(), kind: 'pred', eventId: null, by: mine.id, q, closeAt: mins ? now + mins * MIN : null, status: 'open', ts: now }), '🔮 ¡Propuesta! A ver quién se moja');
    if (ok) { MN.$('#pred-q').value = ''; MN.$('#pred-new').open = false; }
  }

  // Apartados de la pestaña Eventos
  let pane = 'cal';
  function showPane(p) {
    pane = p;
    MN.$$('#ev-panes [data-evpane]').forEach((b) => b.classList.toggle('on', b.dataset.evpane === p));
    MN.$$('#view-eventos [data-pane]').forEach((el) => { el.hidden = el.dataset.pane !== p; });
    if (MN.photoWall) MN.photoWall.visible(p === 'photos');
  }

  // ---------------------------------------------------------- avisos
  let prev = null;
  function onState() {
    const mine = MN.me(); const now = {};
    preds().forEach((p) => { now[p.id] = p.status; });
    if (prev && mine) {
      const msgs = [];
      preds().forEach((p) => {
        if (!(p.id in prev) && p.by !== mine.id) msgs.push(`🔮 ${MN.esc(MN.player(p.by).name)} pregunta: «${MN.esc(p.q)}» ¡Apuesta SÍ o NO!`);
        if (prev[p.id] === 'open' && p.status !== 'open') {
          const my = betsOf(p.id).find((b) => b.player === mine.id); if (!my) return;
          const got = (settlement(p) || {})[mine.id] || 0;
          msgs.push(p.status === 'void' ? `🔮 «${MN.esc(p.q)}» se ha anulado: recuperas ${my.amount}` : `🔮 «${MN.esc(p.q)}»: ${p.status === 'yes' ? '¡SÍ pasó!' : 'NO pasó'} ${got ? `Cobras ${got} fichas 🤑` : `Pierdes ${my.amount} 😵`}`);
        }
      });
      if (msgs.length) MN.notify(msgs, 'pred');
    }
    prev = now;
  }

  return {
    init(api) {
      MN = api;
      MN.registerTx('pbet', { line: (t) => ({ icon: '🔮', text: `${MN.who(t.player)} apuesta <b>${t.amount}</b> al ${t.side === 'yes' ? 'SÍ' : 'NO'}`, sub: 'Fichas retenidas hasta que se resuelva' }) });
      MN.registerTx('pred', {
        line: (t) => {
          const win = Object.entries(t.payouts).filter(([, v]) => v > 0);
          return { icon: '🔮', text: `«${MN.esc(t.q)}»: ${t.result === 'void' ? 'anulada, se devuelve todo' : `${t.result === 'yes' ? 'SÍ' : 'NO'} pasó${win.length ? ` · cobran ${win.map(([id, v]) => `${MN.who(id)} (<b>${v}</b>)`).join(', ')}` : ' · nadie acertó: para la Banca'}`}`, sub: '¿Qué pasará?' };
        },
      });
      document.addEventListener('click', onClick);
      MN.$('#pred-form').addEventListener('submit', create);
    },
    render,
    sweep,
    onState,
    rules(section) {
      return section('🔮', '¿Qué pasará?', `<ul>
        <li>En <b>📅 Eventos → 🔮 ¿Qué pasará?</b> cualquiera propone algo que puede pasar en la fiesta, y los demás apuestan <b>SÍ</b> o <b>NO</b> (una vez, hasta el ${MN.S.settings.predMaxPct || 20}% de sus fichas).</li>
        <li>Cuando se sabe, la Banca lo resuelve: los que acertaron recuperan lo suyo y se reparten lo de los que fallaron. Si nadie acertó, se lo queda la Banca.</li></ul>`);
    },
  };
})());
