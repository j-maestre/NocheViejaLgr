// ============================================================
//  MÓDULO: 🔮 LA PORRA
//  Hasta la fecha de cierre de la porra, cada uno apuesta (una vez) quién
//  acabará 👑 primero y quién 🏮 último. Al cerrar la mesa, con la
//  clasificación de ese momento, los que acertaron se reparten el bote de
//  cada porra (si nadie acierta, se lo queda la Banca). El premio se suma
//  después: la clasificación final puede cambiar (se ve en la ceremonia).
//  Apuestas: entries `porra_<lado>_<jugador>` + tx `porratx_<lado>_<jugador>`
//  Premios: tx `porra_win` y `porra_lose` (en el instante del cierre)
// ============================================================
(window.MNModules = window.MNModules || []).push((function () {
  'use strict';
  let MN;
  const SIDES = { win: { icon: '👑', label: 'Campeón', q: '¿Quién acabará primero?' }, lose: { icon: '🏮', label: 'Farolillo rojo', q: '¿Quién acabará último?' } };
  const stake = () => Math.max(1, Number(MN.S.settings.porraStake) || 10);
  const closeTs = () => { const c = MN.S.settings.porraCloseDate; const t = c ? new Date(c).getTime() : NaN; return Math.min(Number.isFinite(t) ? t : Infinity, MN.endTs()); };
  const open = () => MN.started() && Date.now() < closeTs();
  const bets = () => (MN.S.entries || []).filter((x) => x.kind === 'porra' && MN.S.txs.some((t) => t.id === 'porratx_' + x.id.slice(6) && !t.voided));
  const myBet = (pid, side) => bets().find((x) => x.player === pid && x.side === side);

  // Resultado de la porra: clasificación justo antes del cierre + premios
  function result() {
    if (!MN.S || !MN.ended()) return null;
    const end = MN.endTs(); const before = MN.balancesAt(end - 1);
    const ids = MN.S.players.map((p) => p.id).sort((a, b) => before[b] - before[a]);
    if (ids.length < 2) return null;
    const out = { before, champ: ids[0], last: ids[ids.length - 1], sides: {} };
    ['win', 'lose'].forEach((side) => {
      const list = bets().filter((x) => x.side === side);
      const pot = list.reduce((a, x) => a + (x.amount || 0), 0);
      const target = side === 'win' ? out.champ : out.last;
      const hit = list.filter((x) => x.on === target).map((x) => x.player);
      const share = hit.length ? Math.floor(pot / hit.length) : 0;
      const payouts = {}; hit.forEach((id) => { payouts[id] = share; });
      out.sides[side] = { pot, target, hit, share, payouts, n: list.length };
    });
    const after = Object.assign({}, before);
    Object.values(out.sides).forEach((s) => Object.entries(s.payouts).forEach(([id, v]) => { after[id] = (after[id] || 0) + v; }));
    out.after = after;
    return out;
  }

  async function sweep() {
    if (!MN.S || !MN.ended()) return;
    const r = result(); if (!r) return;
    const writes = [];
    ['win', 'lose'].forEach((side) => {
      const s = r.sides[side]; const id = 'porra_' + side;
      if (!s.hit.length || MN.S.txs.some((t) => t.id === id)) return;
      writes.push({ id, type: 'payout', kind: 'porra', side, ts: MN.endTs(), target: s.target, pot: s.pot, payouts: s.payouts });
    });
    if (writes.length) await Store.putMany({ txs: writes });
  }

  function render() {
    const el = MN.$('#porra-card'); if (!el) return;
    const mine = MN.me();
    if (!mine || !MN.S || !MN.started() || MN.ended()) { el.innerHTML = ''; return; }
    const all = bets(); const isOpen = open();
    const opts = (sel) => MN.sortedPlayers(MN.balances()).map((p) => `<option value="${MN.esc(p.id)}" ${sel === p.id ? 'selected' : ''}>${MN.esc(p.emoji)} ${MN.esc(p.name)}</option>`).join('');
    const side = (k) => {
      const S = SIDES[k]; const b = myBet(mine.id, k);
      const pot = all.filter((x) => x.side === k).reduce((a, x) => a + (x.amount || 0), 0);
      return `<div class="porra-side"><div class="porra-q">${S.icon} <b>${S.label}</b> <span class="muted small">· bote ${pot}</span></div>
        ${b ? `<div>Tu apuesta: <b>${MN.who(b.on)}</b></div>`
    : isOpen ? `<div class="row"><select class="porra-sel" data-side="${k}">${opts()}</select><button type="button" class="btn primary" data-porra="${k}">Apostar ${stake()}</button></div>`
      : '<div class="muted small">No apostaste.</div>'}</div>`;
    };
    el.innerHTML = `<div class="card porra">
      <h3>🔮 La porra</h3>
      <p class="hint">${isOpen ? `Apuesta <b>${stake()} fichas</b> a quién acabará primero y quién último. Cierra el <b>${MN.esc(MN.fmtDate(closeTs()))}</b>. Los que acierten se reparten el bote al cerrar la mesa… ¡y el premio puede cambiar la clasificación!` : 'Las apuestas están cerradas. Los premios se reparten al cerrar la mesa.'}</p>
      ${side('win')}${side('lose')}</div>`;
  }

  async function onClick(e) {
    const b = e.target.closest('[data-porra]'); if (!b) return;
    const mine = MN.me(); const side = b.dataset.porra;
    if (!mine || !open()) return MN.toast('La porra está cerrada', 'bad');
    if (myBet(mine.id, side)) return MN.toast('Ya has apostado en esta porra', 'bad');
    const sel = b.closest('.porra-side').querySelector('.porra-sel'); const on = sel && sel.value; if (!on) return;
    if ((MN.balances()[mine.id] || 0) < stake()) return MN.toast('No te llega para apostar', 'bad');
    if (!await MN.modal(`<div class="modal-icon">${SIDES[side].icon}</div><p class="modal-text">¿${side === 'win' ? 'Campeón' : 'Farolillo rojo'}: ${MN.who(on)}?</p>
      <p class="hint center">Apuestas <b>${stake()}</b> fichas. No se puede cambiar.</p>`, 'Apostar')) return;
    const key = `${side}_${mine.id}`; const now = Date.now();
    MN.act(() => Store.putMany({
      entries: [{ id: 'porra_' + key, kind: 'porra', eventId: null, side, player: mine.id, on, amount: stake(), ts: now }],
      txs: [{ id: 'porratx_' + key, type: 'charge', kind: 'porrabet', side, ts: now, player: mine.id, amount: stake() }],
    }), `🔮 Apuesta hecha: ${MN.esc(MN.player(on).name)} ${side === 'win' ? 'campeón' : 'farolillo rojo'}`);
  }

  return {
    init(api) {
      MN = api;
      MN.porra = { result };
      MN.registerTx('porrabet', { line: (t) => ({ icon: '🔮', text: `${MN.who(t.player)} apuesta en la porra del ${t.side === 'win' ? 'campeón' : 'farolillo rojo'}`, sub: `${t.amount} fichas` }) });
      MN.registerTx('porra', { line: (t) => ({ icon: '🔮', text: `Porra del ${t.side === 'win' ? 'campeón' : 'farolillo rojo'} (${MN.who(t.target)}): cobran ${Object.entries(t.payouts).map(([id, v]) => `${MN.who(id)} (<b>${v}</b>)`).join(', ')}`, sub: `Bote: ${t.pot} fichas` }) });
      document.addEventListener('click', onClick);
    },
    render,
    sweep,
    rules(section) {
      const s = MN.S.settings;
      return section('🔮', 'La porra', `<ul>
        <li>Hasta el <b>${MN.esc(MN.fmtDate(closeTs()))}</b> puedes apostar <b>${s.porraStake} fichas</b> a quién acabará <b>👑 primero</b> y otras tantas a quién acabará <b>🏮 último</b>. Una vez cada una, sin cambios.</li>
        <li>Al cerrar la mesa, los que acertaron se reparten el bote de esa porra. Si nadie acierta, se lo queda la Banca.</li>
        <li>El premio se suma después de la clasificación: en la ceremonia verás la clasificación normal y luego la final con la porra… ¡que puede cambiar el campeón!</li></ul>`);
    },
  };
})());
