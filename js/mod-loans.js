// ============================================================
//  MÓDULO: PETICIONES DE PRÉSTAMO
//  Quien está en bancarrota (menos fichas que la apuesta mínima) puede
//  pedirle un préstamo a la Banca. La Banca lo concede (con castigo) o lo
//  deniega desde 🏦 Banca. Se guardan como `entries` de tipo `loanreq`.
// ============================================================
(window.MNModules = window.MNModules || []).push((function () {
  'use strict';
  let MN;
  const reqs = () => (MN.S.entries || []).filter((x) => x.kind === 'loanreq');
  const pendingOf = (id) => reqs().find((x) => x.player === id && x.status === 'pending');
  const broke = (id) => (MN.balances()[id] || 0) < (Number(MN.S.settings.minBet) || 1);

  function renderPlayer() {
    const el = MN.$('#loanreq-card'); if (!el) return;
    const mine = MN.me();
    if (!mine || MN.ended() || mine.id === MN.bankId() || !broke(mine.id)) { el.innerHTML = ''; return; }
    const bal = MN.balances()[mine.id] || 0; const p = pendingOf(mine.id);
    el.innerHTML = `<div class="card loanreq ${p ? 'waiting' : ''}">
      <div class="loanreq-head">💸 <b>${bal < 0 ? `Debes ${-bal} fichas` : 'Estás en bancarrota'}</b></div>
      ${p ? `<p>⏳ Has pedido un préstamo a la Banca. Te avisaremos cuando conteste.</p><button type="button" class="link" data-loanreq="cancel" data-id="${MN.esc(p.id)}">Retirar la petición</button>`
    : `<p>Pídele un préstamo a la Banca para seguir jugando. Todo préstamo tiene su castigo 😈</p><button type="button" class="btn primary" data-loanreq="ask">🙏 Pedir préstamo a la Banca</button>`}</div>`;
  }

  function renderAdmin() {
    const el = MN.$('#loanreq-admin'); if (!el) return;
    const list = MN.isAdmin() ? reqs().filter((x) => x.status === 'pending').sort((a, b) => a.ts - b.ts) : [];
    el.hidden = !list.length;
    el.innerHTML = list.length ? `<h3>🙏 Peticiones de préstamo</h3><ul class="loanreq-list">${list.map((x) => `<li>
      <div>${MN.who(x.player)} <span class="muted small">· tiene ${MN.balances()[x.player] || 0} fichas · ${MN.ago(x.ts)}</span></div>
      ${x.msg ? `<div class="table-msg">💬 “${MN.esc(x.msg)}”</div>` : ''}
      <div class="row wrap"><button type="button" class="btn primary" data-loanreq="grant" data-id="${MN.esc(x.id)}">✅ Conceder</button>
      <button type="button" class="btn ghost" data-loanreq="deny" data-id="${MN.esc(x.id)}">❌ Denegar</button></div></li>`).join('')}</ul>` : '';
  }

  async function onClick(e) {
    const b = e.target.closest('[data-loanreq]'); if (!b) return;
    const act = b.dataset.loanreq; const mine = MN.me(); const now = Date.now();
    if (act === 'ask') {
      if (!mine || pendingOf(mine.id)) return;
      const res = await MN.modal(`<div class="modal-icon">🙏</div><p class="modal-text">¿Pedir un préstamo a la Banca?</p>
        <input name="msg" maxlength="100" placeholder="💬 Convence a la Banca (opcional)">`, 'Pedir');
      if (!res) return;
      return MN.act(() => Store.put('entries', { id: 'lr_' + Store.uid(), kind: 'loanreq', eventId: null, player: mine.id, msg: (res.msg || '').trim() || null, status: 'pending', ts: now }), '🙏 Petición enviada a la Banca');
    }
    const x = reqs().find((r) => r.id === b.dataset.id); if (!x) return;
    if (act === 'cancel') return MN.act(() => Store.update('entries', x.id, { status: 'cancelled', closedAt: now }), 'Petición retirada');
    if (!MN.isAdmin()) return;
    if (act === 'deny') return MN.act(() => Store.update('entries', x.id, { status: 'denied', closedAt: now }), 'Préstamo denegado');
    if (act === 'grant') {
      const opts = (MN.S.settings.punishments || []).map((p) => `<option value="${MN.esc(p)}">`).join('');
      const pick = (MN.S.settings.punishments || [])[Math.floor(Math.random() * (MN.S.settings.punishments || ['']).length)] || '';
      const res = await MN.modal(`<div class="modal-icon">💸</div><p class="modal-text">Préstamo para ${MN.who(x.player)}</p>
        <label>Fichas<input type="number" name="amount" min="1" value="${MN.esc(MN.S.settings.loanAmount)}" inputmode="numeric"></label>
        <label>Castigo<input name="punishment" list="lr-punish" value="${MN.esc(pick)}" maxlength="80"></label><datalist id="lr-punish">${opts}</datalist>`, 'Prestar');
      if (!res) return;
      const amount = parseInt(res.amount, 10); const punishment = (res.punishment || '').trim();
      if (!amount || amount < 1) return MN.toast('Indica cuántas fichas', 'bad');
      if (!punishment) return MN.toast('Todo préstamo tiene su castigo 😈', 'bad');
      const loanId = Store.uid();
      return MN.act(async () => {
        await Store.addTx({ id: loanId, type: 'loan', ts: now, player: x.player, amount, punishment, done: false });
        await Store.update('entries', x.id, { status: 'granted', loanId, closedAt: now });
      }, '🏦 Préstamo concedido');
    }
  }

  // Avisos: a la Banca cuando llega una petición; al jugador si se la deniegan
  let prev = null;
  function onState() {
    const mine = MN.me(); const now = {};
    reqs().forEach((x) => { now[x.id] = x.status; });
    if (prev && mine) {
      const msgs = [];
      reqs().forEach((x) => {
        if (!(x.id in prev) && x.status === 'pending' && MN.isAdmin() && x.player !== mine.id) msgs.push(`🙏 ${MN.esc(MN.player(x.player).name)} pide un préstamo a la Banca${x.msg ? `: «${MN.esc(x.msg)}»` : ''}`);
        if (prev[x.id] === 'pending' && x.status === 'denied' && x.player === mine.id) msgs.push('🏦 La Banca ha denegado tu préstamo. Suplica mejor.');
      });
      if (msgs.length) MN.notify(msgs);
    }
    prev = now;
  }

  return {
    init(api) { MN = api; document.addEventListener('click', onClick); },
    render() { renderPlayer(); renderAdmin(); },
    onState,
  };
})());
