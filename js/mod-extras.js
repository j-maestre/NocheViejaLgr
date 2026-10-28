// ============================================================
//  MÓDULO: EXTRAS DE LOS DUELOS
//  🔁 Revancha / 💥 doble o nada · 🎯 cazarrecompensas
//  🎲 ruleta de minijuegos · 🎮 estadísticas por minijuego
// ============================================================
(window.MNModules = window.MNModules || []).push((function () {
  'use strict';
  let MN;
  const REMATCH_HOURS = 12;

  // ---------------------------------------------------------- cazarrecompensas
  // Recorre los duelos en orden: si el perdedor llevaba una racha de N+, el ganador cobra la recompensa
  const minStreak = () => Math.max(1, Number(MN.S.settings.bountyMinStreak) || 5);
  function bounties() {
    const streak = {}; const out = [];
    const per = Number(MN.S.settings.bountyPerWin) || 0; const min = minStreak();
    MN.S.txs.forEach((t) => {
      if (t.type !== 'duel' || t.voided) return;
      const prior = streak[t.loser] || 0;
      if (per && prior >= min) out.push({ src: t, player: t.winner, victim: t.loser, streak: prior, amount: prior * per });
      streak[t.winner] = (streak[t.winner] || 0) + 1;
      streak[t.loser] = 0;
    });
    return out;
  }

  async function syncBounties() {
    const byId = {}; MN.S.txs.forEach((t) => { byId[t.id] = t; });
    const due = bounties(); const dueIds = new Set();
    const writes = [];
    due.forEach((b) => {
      const id = 'bounty_' + b.src.id; dueIds.add(id);
      if (!byId[id]) writes.push({ id, type: 'bonus', kind: 'bounty', ts: b.src.ts + 2, player: b.player, victim: b.victim, streak: b.streak, amount: b.amount, srcId: b.src.id });
      else if (byId[id].voided) await_(Store.updateTx(id, { voided: false }));
    });
    // Recompensas que ya no tocan (p. ej. se anuló un duelo anterior): se anulan
    MN.S.txs.filter((t) => t.kind === 'bounty' && !t.voided && !dueIds.has(t.id)).forEach((t) => await_(Store.updateTx(t.id, { voided: true })));
    if (writes.length) await Store.putMany({ txs: writes });
  }
  const pending = [];
  const await_ = (p) => pending.push(p);

  const bountyOn = (id, st) => (st.streakWin && st.streak >= minStreak() ? st.streak * (Number(MN.S.settings.bountyPerWin) || 0) : 0);

  // ---------------------------------------------------------- revanchas
  function rematchable(myId) {
    const since = Date.now() - REMATCH_HOURS * MN.HOUR;
    return MN.S.txs.filter((t) => t.type === 'duel' && !t.voided && t.loser === myId && t.ts >= since
      && !MN.S.challenges.some((c) => c.rematchOf === t.id)).reverse().slice(0, 3);
  }

  function renderRematches() {
    const el = MN.$('#rematches'); if (!el) return;
    const mine = MN.me();
    const list = mine && !MN.ended() ? rematchable(mine.id) : [];
    el.hidden = !list.length;
    if (!list.length) return;
    const cnt = MN.$('#rematch-count'); if (cnt) cnt.textContent = list.length;
    MN.$('#rematch-list').innerHTML = list.map((t) => {
      const block = MN.challengeBlock(mine.id, t.winner);
      const max = MN.pairMax(mine.id, t.winner);
      const same = Math.min(t.amount, max);
      const dbl = t.amount * 2;
      return `<li class="challenge status-pending">
        <div class="ch-head">${MN.who(t.winner)} te ganó <span class="ch-amount">${t.amount}</span></div>
        <div class="ch-sub">${MN.esc(t.game)} · ${MN.ago(t.ts)}</div>
        ${block ? `<div class="ch-status small">${block}</div>` : `<div class="ch-actions">
          ${same > 0 ? `<button class="btn ghost" data-rematch="${MN.esc(t.id)}" data-amount="${same}">🔁 Revancha (${same})</button>` : ''}
          ${dbl <= max ? `<button class="btn primary" data-rematch="${MN.esc(t.id)}" data-amount="${dbl}" data-double="1">💥 Doble o nada (${dbl})</button>`
            : `<span class="muted small">💥 Doble o nada (${dbl}) supera el límite actual (${max})</span>`}
        </div>`}
      </li>`;
    }).join('');
  }

  // ---------------------------------------------------------- estadísticas por minijuego
  function gameStats() {
    const g = {};
    const add = (game, winners, players) => {
      const k = game || 'Minijuego misterioso';
      g[k] = g[k] || { plays: 0, wins: {}, players: new Set() };
      g[k].plays++;
      winners.forEach((w) => { g[k].wins[w] = (g[k].wins[w] || 0) + 1; });
      players.forEach((p) => g[k].players.add(p));
    };
    MN.S.txs.forEach((t) => {
      if (t.voided) return;
      if (t.type === 'duel') add(t.game, [t.winner], [t.winner, t.loser]);
      if (t.type === 'payout' && t.kind === 'table') add(t.game, t.winners, Object.keys(t.payouts));
    });
    return Object.entries(g).map(([game, d]) => {
      const best = Object.entries(d.wins).sort((a, b) => b[1] - a[1]);
      const specialist = best.length && best[0][1] >= 2 && (!best[1] || best[1][1] < best[0][1]) ? best[0] : null;
      return { game, plays: d.plays, specialist, players: d.players.size };
    }).sort((a, b) => b.plays - a.plays);
  }
  const specialties = (id) => gameStats().filter((s) => s.specialist && s.specialist[0] === id).map((s) => s.game);

  function renderGameStats() {
    const el = MN.$('#games-stats'); if (!el) return;
    const stats = gameStats();
    el.innerHTML = stats.length ? `<table class="games-table">
      <thead><tr><th>Minijuego</th><th>Partidas</th><th>Especialista</th></tr></thead>
      <tbody>${stats.map((s) => `<tr><td>${MN.esc(s.game)}</td><td>${s.plays}</td>
        <td>${s.specialist ? `${MN.who(s.specialist[0])} <span class="muted small">(${s.specialist[1]} victorias)</span>` : '<span class="muted">—</span>'}</td></tr>`).join('')}</tbody></table>
      <p class="hint">Especialista: quien más ha ganado en ese juego (mínimo 2 victorias y sin empate).</p>`
      : '<p class="hint">Aún no se ha jugado nada.</p>';
    const mine = MN.me(); const pf = MN.$('#pf-games');
    if (pf && mine) {
      const sp = specialties(mine.id);
      pf.innerHTML = sp.length ? `🎮 Especialista en <b>${sp.map(MN.esc).join('</b>, <b>')}</b>` : '';
    }
  }

  // ---------------------------------------------------------- ruleta
  function spin(select) {
    const opts = [...select.options].filter((o) => o.value !== '__other');
    if (!opts.length) return;
    let i = Math.floor(Math.random() * opts.length); let n = 0;
    const total = 12 + Math.floor(Math.random() * opts.length);
    select.classList.add('spinning');
    const step = () => {
      select.value = opts[i % opts.length].value; i++;
      if (++n < total) setTimeout(step, 40 + n * n * 2);
      else { select.classList.remove('spinning'); select.dispatchEvent(new Event('change')); MN.toast(`🎲 Toca: <b>${MN.esc(select.value)}</b>`, 'ok'); }
    };
    step();
  }

  return {
    init(api) {
      MN = api;
      MN.registerTx('bounty', {
        line: (t) => ({ icon: '🎯', text: `¡Cazarrecompensas! ${MN.who(t.player)} corta la racha de ${t.streak} de ${MN.who(t.victim)} y cobra <b>${t.amount}</b> fichas`, sub: 'Paga la Banca' }),
      });
      document.addEventListener('click', async (e) => {
        const r = e.target.closest('[data-roulette]');
        if (r) { spin(MN.$('#' + r.dataset.roulette)); return; }
        const b = e.target.closest('[data-rematch]'); if (!b) return;
        const mine = MN.me(); const t = MN.S.txs.find((x) => x.id === b.dataset.rematch);
        if (!mine || !t) return;
        const amount = Number(b.dataset.amount); const dbl = !!b.dataset.double;
        const block = MN.challengeBlock(mine.id, t.winner);
        if (block) return MN.toast(block, 'bad');
        if (amount > MN.pairMax(mine.id, t.winner)) return MN.toast('Supera el límite actual', 'bad');
        const ok = await MN.modal(`<div class="modal-icon">${dbl ? '💥' : '🔁'}</div>
          <p class="modal-text">${dbl ? '¿Doble o nada' : '¿Revancha'} contra ${MN.who(t.winner)} por <b>${amount}</b> fichas?</p>
          <p class="hint center">${MN.esc(t.game)}</p>`, 'Retar');
        if (!ok) return;
        MN.act(() => Store.addChallenge({ id: Store.uid(), from: mine.id, to: t.winner, game: t.game, amount, status: 'pending', createdAt: Date.now(),
          rematchOf: t.id, tag: dbl ? 'DOBLE O NADA' : 'REVANCHA' }), `${dbl ? '💥' : '🔁'} Reto enviado a ${MN.esc(MN.player(t.winner).name)}`);
      });
    },
    render() { renderRematches(); renderGameStats(); },
    async sweep() { await syncBounties(); while (pending.length) await pending.shift(); },
    // Recompensa sobre la cabeza del que va en racha (sale en el ranking)
    rankExtra(id, st) { const v = bountyOn(id, st); return v ? `<span class="bounty-tag" title="Quien le gane cobra ${v} fichas">🎯 ${v}</span>` : ''; },
    rules(section) {
      const per = Number(MN.S.settings.bountyPerWin) || 0;
      return section('🎯', 'Revanchas y recompensas', `
        <ul>
          <li><b>🔁 Revancha</b>: durante ${REMATCH_HOURS} horas después de perder un duelo puedes retar al ganador al mismo juego.</li>
          <li><b>💥 Doble o nada</b>: lo mismo, pero por el doble (si cabe en el límite de apuesta).</li>
          ${per ? `<li><b>🎯 Cazarrecompensas</b>: quien corte una racha de ${minStreak()} o más victorias cobra ${per} fichas por cada victoria de la racha. Las paga la Banca.</li>` : ''}
          <li><b>💬 Dedicatoria</b>: el ganador de un duelo puede dejarle una frase al perdedor. Queda en el historial para siempre.</li>
          <li><b>🎮 Especialista</b>: quien más gana en cada minijuego (mínimo 2 victorias) se lleva el título.</li>
        </ul>`);
    },
  };
})());
