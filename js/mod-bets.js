// ============================================================
//  MÓDULO: APUESTAS DE ESPECTADORES
//  Cuando un duelo se acepta, los demás pueden apostar por uno de los
//  dos durante unos minutos. Las fichas quedan retenidas (tx `bet_…`).
//  Al acabar: los que acertaron recuperan lo suyo y se reparten lo de
//  los que fallaron en proporción a lo apostado. Si nadie acertó, se lo
//  queda la Banca. Si el duelo se cancela o se anula, se devuelve todo.
//  El reparto se recalcula siempre a partir del estado (tx `betpay_…`).
// ============================================================
(window.MNModules = window.MNModules || []).push((function () {
  'use strict';
  let MN;
  const MIN = 60000;
  const bets = () => MN.S.bets || [];
  const betsOf = (cid) => bets().filter((b) => b.challengeId === cid && !b.cancelled);
  const windowEnd = (c) => (c.acceptedAt || c.createdAt) + (Number(MN.S.settings.betWindowMinutes) || 10) * MIN;
  const isOpen = (c) => c.status === 'accepted' && Date.now() < windowEnd(c) && !MN.ended();
  const maxBet = (id) => Math.max(0, Math.floor(((MN.balances()[id] || 0) * (Number(MN.S.settings.betMaxPct) || 10)) / 100));

  // ¿Puede apostar este jugador en este duelo ahora mismo?
  const canBet = (c, myId) => isOpen(c) && myId && myId !== c.from && myId !== c.to && !betsOf(c.id).some((b) => b.player === myId) && maxBet(myId) > 0;
  const betLine = (c) => `${c.allIn ? '💣 ALL IN: ' : '🎰 '}${MN.esc(MN.player(c.from).name)} vs ${MN.esc(MN.player(c.to).name)} a ${MN.esc(c.game)} por ${c.amount} fichas. ¡Tienes ${Number(MN.S.settings.betWindowMinutes) || 10} min para apostar!`;

  // Distintivo flotante en la pestaña Duelo mientras haya un duelo en el que puedo apostar
  function renderTab() {
    const el = MN.$('#bet-tab-live'); if (!el || !MN.S) return;
    const mine = MN.me();
    el.hidden = !(mine && MN.activeChallenges().some((c) => canBet(c, mine.id)));
  }

  function pools(cid) {
    const p = {};
    betsOf(cid).forEach((b) => { p[b.on] = p[b.on] || { total: 0, n: 0 }; p[b.on].total += b.amount; p[b.on].n++; });
    return p;
  }

  // Lo que le corresponde a cada apostante según el estado actual del duelo (null = aún no se sabe)
  function settlement(c) {
    const list = betsOf(c.id); if (!list.length) return null;
    const duel = c.txId && MN.S.txs.find((t) => t.id === c.txId);
    const refund = ['rejected', 'cancelled', 'expired'].includes(c.status) || (c.status === 'done' && (!duel || duel.voided));
    const out = {};
    if (refund) { list.forEach((b) => { out[b.player] = (out[b.player] || 0) + b.amount; }); return { out, refund: true }; }
    if (c.status !== 'done') return null;
    const win = list.filter((b) => b.on === c.winner); const lose = list.filter((b) => b.on !== c.winner);
    const winPool = win.reduce((a, b) => a + b.amount, 0); const losePool = lose.reduce((a, b) => a + b.amount, 0);
    win.forEach((b) => { out[b.player] = (out[b.player] || 0) + b.amount + Math.floor((losePool * b.amount) / winPool); });
    return { out, refund: false, winPool, losePool };
  }

  async function sweep() {
    const byId = {}; MN.S.txs.forEach((t) => { byId[t.id] = t; });
    const ids = [...new Set(bets().map((b) => b.challengeId))];
    for (const cid of ids) {
      const c = MN.S.challenges.find((x) => x.id === cid); if (!c) continue;
      const st = settlement(c); if (!st) continue;
      const id = 'betpay_' + cid; const cur = byId[id];
      const payouts = st.out;
      if (!cur) await Store.put('txs', { id, type: 'payout', kind: 'bets', ts: (c.closedAt || Date.now()) + 3, challengeId: cid, refund: st.refund, payouts });
      else if (JSON.stringify(cur.payouts) !== JSON.stringify(payouts) || !!cur.refund !== st.refund) await Store.updateTx(id, { payouts, refund: st.refund });
    }
  }

  function card(c, myId) {
    const esc = MN.esc; const p = pools(c.id); const mineBet = myId && betsOf(c.id).find((b) => b.player === myId);
    const side = (id) => {
      const pool = p[id] || { total: 0, n: 0 };
      const other = p[c.from === id ? c.to : c.from] || { total: 0 };
      const mult = pool.total ? (1 + other.total / pool.total).toFixed(2).replace('.', ',') : '—';
      return `<div class="bet-side"><div>${MN.who(id)}</div><div class="bet-pool"><b>${pool.total}</b> fichas · ${pool.n} ${pool.n === 1 ? 'apuesta' : 'apuestas'}</div><div class="muted small">paga x${mult}</div>
        ${isOpen(c) && myId && !mineBet && myId !== c.from && myId !== c.to && maxBet(myId) > 0 ? `<button class="btn ghost" data-bet="${esc(c.id)}" data-on="${esc(id)}">Apostar por ${esc(MN.player(id).name)}</button>` : ''}</div>`;
    };
    let foot = '';
    if (mineBet) foot = `Tu apuesta: <b>${mineBet.amount}</b> por ${MN.who(mineBet.on)}`;
    if (c.status === 'accepted') foot += `${foot ? ' · ' : ''}${isOpen(c) ? `Apuestas abiertas <b class="bet-cd" data-to="${windowEnd(c)}"></b>` : 'Apuestas cerradas: se está jugando'}`;
    if (c.status === 'reported') foot += `${foot ? ' · ' : ''}⚖️ Esperando confirmación del resultado`;
    return `<li class="challenge bet-card ${isOpen(c) ? 'status-accepted' : 'status-reported'}">
      <div class="ch-head">🎰 <b>${esc(c.game)}</b><span class="ch-amount">${c.amount}</span></div>
      <div class="bet-sides">${side(c.from)}<div class="ch-vs">VS</div>${side(c.to)}</div>
      ${foot ? `<div class="ch-status small">${foot}</div>` : ''}</li>`;
  }

  function render() {
    const el = MN.$('#bets-list'); if (!el) return;
    const mine = MN.me(); const myId = mine && mine.id;
    const list = MN.activeChallenges().filter((c) => (c.status === 'accepted' || c.status === 'reported') && (isOpen(c) || betsOf(c.id).length));
    MN.$('#bets-wrap').hidden = !list.length;
    el.innerHTML = list.map((c) => card(c, myId)).join('');
    renderTab();
  }

  // Aviso al apostante cuando se resuelve su apuesta
  let prev = null; let prevCh = null;
  function onState() {
    const mine = MN.me(); const now = {};
    // A todos (menos a los dos que juegan): se ha aceptado un duelo y se puede apostar
    const st = {}; MN.S.challenges.forEach((c) => { st[c.id] = c.status; });
    if (prevCh && mine) {
      const open = MN.S.challenges.filter((c) => prevCh[c.id] === 'pending' && c.status === 'accepted' && canBet(c, mine.id));
      if (open.length) MN.notify(open.map(betLine));
    }
    prevCh = st;
    MN.S.txs.filter((t) => t.kind === 'bets').forEach((t) => { now[t.id] = JSON.stringify(t.payouts); });
    if (prev && mine) {
      const msgs = [];
      MN.S.txs.filter((t) => t.kind === 'bets' && !prev[t.id]).forEach((t) => {
        const myBet = betsOf(t.challengeId).find((b) => b.player === mine.id); if (!myBet) return;
        const got = t.payouts[mine.id] || 0;
        msgs.push(t.refund ? `🎰 Te devolvemos tu apuesta de ${myBet.amount} fichas` : got ? `🎰 ¡Acertaste! Cobras ${got} fichas de tu apuesta` : `🎰 Fallaste la apuesta: pierdes ${myBet.amount} fichas`);
      });
      if (msgs.length && !(MN.shows && document.visibilityState === 'visible')) MN.notify(msgs);
    }
    prev = now;
  }

  return {
    init(api) {
      MN = api;
      MN.registerTx('bet', { line: (t) => ({ icon: '🎰', text: `${MN.who(t.player)} apuesta <b>${t.amount}</b> fichas por ${MN.who(t.on)}`, sub: 'Fichas retenidas hasta que acabe el duelo' }) });
      MN.registerTx('bets', {
        line: (t) => {
          const c = MN.S.challenges.find((x) => x.id === t.challengeId);
          const winners = Object.entries(t.payouts).filter(([, v]) => v > 0);
          const vs = c ? `${MN.esc(MN.player(c.from).name)} vs ${MN.esc(MN.player(c.to).name)}` : 'un duelo';
          if (t.refund) return { icon: '🎰', text: `Se devuelven las apuestas de ${vs}`, sub: 'Duelo cancelado o anulado' };
          return { icon: '🎰', text: winners.length ? `Apuestas de ${vs}: cobran ${winners.map(([id, v]) => `${MN.who(id)} (<b>${v}</b>)`).join(', ')}` : `Apuestas de ${vs}: nadie acertó, la Banca se lo queda`, sub: '' };
        },
      });
      document.addEventListener('click', async (e) => {
        const b = e.target.closest('[data-bet]'); if (!b) return;
        const mine = MN.me(); const c = MN.S.challenges.find((x) => x.id === b.dataset.bet);
        if (!mine || !c || !isOpen(c)) return MN.toast('Las apuestas de este duelo están cerradas', 'bad');
        if (betsOf(c.id).some((x) => x.player === mine.id)) return MN.toast('Ya has apostado en este duelo', 'bad');
        const max = maxBet(mine.id);
        const res = await MN.modal(`<div class="modal-icon">🎰</div>
          <p class="modal-text">¿Cuánto apuestas por ${MN.who(b.dataset.on)}?</p>
          <input type="number" name="amount" min="1" max="${max}" value="${Math.min(5, max)}" inputmode="numeric">
          <p class="hint center">Máximo ${max} fichas (el ${MN.S.settings.betMaxPct}% de tu capital). Se retienen hasta que acabe el duelo.</p>`, 'Apostar');
        if (!res) return;
        const amount = parseInt(res.amount, 10);
        if (!amount || amount < 1 || amount > max) return MN.toast(`La apuesta debe estar entre 1 y ${max}`, 'bad');
        const id = Store.uid(); const now = Date.now();
        MN.act(() => Store.putMany({
          bets: [{ id, challengeId: c.id, player: mine.id, on: b.dataset.on, amount, ts: now }],
          txs: [{ id: 'bet_' + id, type: 'charge', kind: 'bet', ts: now, player: mine.id, on: b.dataset.on, amount, challengeId: c.id }],
        }), `🎰 Apuesta hecha: ${amount} fichas por ${MN.esc(MN.player(b.dataset.on).name)}`);
      });
    },
    render,
    sweep,
    onState,
    tick() {
      // Cierra visualmente la ventana de apuestas cuando se acaba
      const open = MN.activeChallenges().filter(isOpen).length;
      if (open !== this._open) { this._open = open; if (MN.S) render(); }
      renderTab();
      const now = Date.now();
      MN.$$('#bets-list .bet-cd').forEach((el) => { const ms = Number(el.dataset.to) - now; el.textContent = ms > 0 ? `${Math.floor(ms / 60000)}:${MN.pad(Math.floor(ms / 1000) % 60)}` : ''; });
    },
    rules(section) {
      const s = MN.S.settings;
      return section('🎰', 'Apuestas de espectadores', `
        <ul>
          <li>Cuando se acepta un duelo, los demás tenéis <b>${s.betWindowMinutes} minutos</b> para apostar por uno de los dos (en <b>⚔️ Duelo → 🎰 Apuestas</b>).</li>
          <li>Puedes apostar hasta el <b>${s.betMaxPct}%</b> de tu capital, una vez por duelo. Los que juegan no pueden apostar.</li>
          <li>Las fichas quedan retenidas. Los que aciertan recuperan lo suyo y se reparten lo de los que fallan, en proporción a lo que apostó cada uno.</li>
          <li>Si nadie acierta, <b>la Banca se lo queda</b>. Si el duelo se cancela o se anula, se devuelve todo.</li>
        </ul>`);
    },
  };
})());
