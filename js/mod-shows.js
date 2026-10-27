// ============================================================
//  MÓDULO: ESPECTÁCULOS
//  🎰 Tragaperras al terminar cada duelo: un modificador aleatorio
//     (el mismo en todos los móviles: sale del id del duelo).
//  🎬 Animaciones de los eventos: sorteo de la lotería, expropiación
//     comunista y revelación del cronómetro global.
// ============================================================
(window.MNModules = window.MNModules || []).push((function () {
  'use strict';
  let MN;
  // Solo los duelos a partir de que existe la tragaperras (no cambia los antiguos)
  const SLOTS_SINCE = new Date('2026-10-27T09:00').getTime();
  const FILLER = ['🍒', '🍋', '🔔', '⭐', '🍀', '💎', '🍇', '🎲'];

  // ---------------------------------------------------------- modificadores
  const OUTCOMES = [
    { id: 'nothing', w: 40, sym: null, title: 'Nada…', text: () => 'La casa no paga. Otra vez será.' },
    { id: 'double', w: 15, sym: '💰', title: '¡DOBLE!', text: (d) => `${name(d.winner)} cobra el doble: +${d.amount} extra de la Banca` },
    { id: 'consolation', w: 15, sym: '🩹', title: 'Consuelo', text: (d) => `${name(d.loser)} recupera la mitad: +${Math.floor(d.amount / 2)}` },
    { id: 'spectators', w: 12, sym: '👀', title: 'Ronda para el público', text: () => 'Todos los demás jugadores reciben +1 ficha' },
    { id: 'tax', w: 12, sym: '🦹', title: 'Comisión de la Banca', text: (d) => `${name(d.winner)} paga ${tax(d)} fichas de comisión` },
    { id: 'jackpot', w: 6, sym: '7️⃣', title: '¡¡JACKPOT!!', text: (d) => `${name(d.winner)} cobra el TRIPLE: +${d.amount * 2} extra` },
  ];
  const name = (id) => `${MN.player(id).emoji} ${MN.player(id).name}`;
  const tax = (d) => Math.max(1, Math.floor(d.amount * 0.25));

  function outcomeOf(duel) {
    let r = Math.abs(MN.hash('slot' + duel.id)) % 100;
    for (const o of OUTCOMES) { if (r < o.w) return o; r -= o.w; }
    return OUTCOMES[0];
  }
  const eligible = (t) => t.type === 'duel' && t.ts >= SLOTS_SINCE && MN.S.settings.slotsEnabled !== false;

  function payoutsFor(duel, o) {
    switch (o.id) {
      case 'double': return { [duel.winner]: duel.amount };
      case 'jackpot': return { [duel.winner]: duel.amount * 2 };
      case 'consolation': return Math.floor(duel.amount / 2) ? { [duel.loser]: Math.floor(duel.amount / 2) } : null;
      case 'tax': return { [duel.winner]: -Math.min(tax(duel), duel.amount) };
      case 'spectators': {
        const out = {};
        MN.S.players.filter((p) => p.id !== duel.winner && p.id !== duel.loser && p.createdAt <= duel.ts).forEach((p) => { out[p.id] = 1; });
        return Object.keys(out).length ? out : null;
      }
      default: return null;
    }
  }

  async function sweep() {
    const byId = {}; MN.S.txs.forEach((t) => { byId[t.id] = t; });
    const writes = [];
    MN.S.txs.filter(eligible).forEach((d) => {
      const o = outcomeOf(d); const payouts = payoutsFor(d, o);
      const id = 'slot_' + d.id; const cur = byId[id];
      if (!payouts) return;
      if (!cur && !d.voided) writes.push({ id, type: 'payout', kind: 'slot', ts: d.ts + 5, srcId: d.id, outcome: o.id, payouts });
      else if (cur && !!cur.voided !== !!d.voided) writes.push(Object.assign({}, cur, { voided: !!d.voided }));
    });
    if (writes.length) await Store.putMany({ txs: writes });
  }

  // ---------------------------------------------------------- escenario (cola de animaciones)
  const queue = []; let playing = false;
  function enqueue(fn) { queue.push(fn); if (!playing) next(); }
  async function next() {
    const fn = queue.shift();
    if (!fn) { playing = false; return; }
    playing = true;
    const box = MN.$('#show');
    box.hidden = false; document.body.classList.add('no-scroll');
    try { await fn(box); } catch (e) { console.error(e); }
    await waitClose(box);
    box.hidden = true; box.innerHTML = ''; document.body.classList.remove('no-scroll');
    next();
  }
  function waitClose(box) {
    return new Promise((resolve) => {
      const btn = box.querySelector('[data-show-close]');
      if (!btn) return resolve();
      btn.hidden = false;
      const done = () => { clearTimeout(t); resolve(); };
      btn.onclick = done;
      const t = setTimeout(done, 12000); // se cierra sola
    });
  }
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const sfx = (k) => MN.fx && MN.fx.play(k);
  const boom = (opts) => MN.fx && MN.fx.confetti(opts);
  const closeBtn = '<button type="button" class="btn primary show-close" data-show-close hidden>¡Vamos!</button>';

  // ---------------------------------------------------------- 🎰 tragaperras
  async function slotShow(box, duel) {
    const o = outcomeOf(duel);
    const syms = o.sym ? [o.sym, o.sym, o.sym] : (() => { const s = MN.shuffle(FILLER.slice()); return [s[0], s[1], s[2]]; })();
    const strip = (target) => Array.from({ length: 24 }, () => FILLER[Math.floor(Math.random() * FILLER.length)]).concat([target]);
    box.innerHTML = `<div class="show-inner slot-show">
      <div class="show-kicker">${MN.esc(duel.game)} · ${MN.esc(name(duel.winner))} gana ${duel.amount}</div>
      <div class="slot-title">🎰 ¿Modificador?</div>
      <div class="slot-machine"><div class="slot-lights"></div>
        ${syms.map((s, i) => `<div class="reel"><div class="reel-strip" id="reel${i}">${strip(s).map((x) => `<div class="sym">${x}</div>`).join('')}</div></div>`).join('')}
      </div>
      <div class="slot-result" id="slot-result"></div>
      ${closeBtn}</div>`;
    await sleep(50);
    const tickTimer = setInterval(() => sfx('tick'), 90);
    syms.forEach((_, i) => {
      const el = MN.$('#reel' + i);
      el.style.transition = `transform ${1.6 + i * 0.7}s cubic-bezier(.15,.85,.25,1)`;
      el.style.transform = `translateY(calc(-${24} * var(--sym-h)))`;
      setTimeout(() => sfx('stop'), (1.6 + i * 0.7) * 1000);
    });
    await sleep(1600 + 2 * 700 + 150);
    clearInterval(tickTimer);
    // Por si la animación va con retraso (móvil lento), los rodillos quedan siempre en su símbolo final
    syms.forEach((_, i) => { const el = MN.$('#reel' + i); el.style.transition = 'none'; el.style.transform = 'translateY(calc(-24 * var(--sym-h)))'; });
    const res = MN.$('#slot-result');
    res.innerHTML = `<div class="slot-out ${o.id}">${o.title}</div><div class="slot-text">${MN.esc(o.text(duel))}</div>`;
    res.classList.add('shown');
    if (o.id === 'jackpot' || o.id === 'double') { boom({ count: o.id === 'jackpot' ? 300 : 160 }); sfx('win'); }
    else if (o.id === 'tax') sfx('lose');
    else if (o.id !== 'nothing') sfx('event');
  }

  // ---------------------------------------------------------- 🎟️ lotería
  async function lotteryShow(box, ev) {
    const r = ev.result || {};
    const tickets = (MN.S.entries || []).filter((x) => x.eventId === ev.id && x.kind === 'ticket').map((x) => x.player);
    if (!r.winner || !tickets.length) return;
    box.innerHTML = `<div class="show-inner lottery-show">
      <div class="show-kicker">🎟️ Sorteo de la lotería</div>
      <div class="lot-pot">Bote: <b>${r.pot}</b> fichas · ${r.tickets} boletos</div>
      <div class="lot-drum"><div class="lot-balls">${Array.from({ length: 10 }, (_, i) => `<span style="--i:${i}"></span>`).join('')}</div>
        <div class="lot-name" id="lot-name">…</div></div>
      <div class="show-result" id="lot-result"></div>${closeBtn}</div>`;
    sfx('drum');
    // Va pasando nombres (según los boletos de cada uno), cada vez más despacio
    let delay = 60; let i = 0;
    while (delay < 520) {
      const id = tickets[i++ % tickets.length];
      MN.$('#lot-name').textContent = name(id);
      sfx('tick');
      await sleep(delay);
      delay *= 1.12;
    }
    MN.$('#lot-name').textContent = name(r.winner);
    MN.$('#lot-name').classList.add('winner');
    MN.$('.lot-drum').classList.add('stopped');
    MN.$('#lot-result').innerHTML = `<div class="show-big">🎉 ¡${MN.esc(MN.player(r.winner).name)} se lleva ${r.pot} fichas!</div>`;
    MN.$('#lot-result').classList.add('shown');
    boom({ count: 240 }); sfx('win');
  }

  // ---------------------------------------------------------- ☭ comunista
  async function communistShow(box, ev) {
    const r = ev.result || {};
    if (!r.from) return;
    const bal = MN.balancesAt(ev.at);
    const top = MN.sortedPlayers(bal).slice(0, 3).map((p) => p.id);
    box.innerHTML = `<div class="show-inner communist-show">
      <div class="com-star">★</div>
      <div class="show-title">☭ EVENTO COMUNISTA</div>
      <div class="show-kicker">La Banca va a expropiar al más rico…</div>
      <div class="com-spot" id="com-spot">?</div>
      <div class="com-take" id="com-take"></div>
      <div class="com-to" id="com-to"></div>${closeBtn}</div>`;
    sfx('drum');
    await sleep(1200);
    // El foco duda entre los de arriba antes de señalar
    for (let k = 0; k < 9; k++) { MN.$('#com-spot').textContent = name(top[k % top.length]); sfx('tick'); await sleep(140 + k * 40); }
    MN.$('#com-spot').textContent = name(r.from); MN.$('#com-spot').classList.add('hit'); sfx('stop');
    await sleep(700);
    MN.$('#com-take').innerHTML = `−${r.amount} fichas`; MN.$('#com-take').classList.add('shown');
    await sleep(900);
    for (const id of r.to) {
      MN.$('#com-to').insertAdjacentHTML('beforeend', `<div class="com-get"><span class="coin">🪙</span> ${MN.esc(name(id))} <b>+${r.share}</b></div>`);
      sfx('event'); await sleep(600);
    }
    boom({ colors: ['#ff4d4d', '#ffd400', '#ffffff'], count: 150 });
  }

  // ---------------------------------------------------------- ⏱️ cronómetro
  async function stopwatchShow(box, ev) {
    const r = ev.result || {};
    if (!r.ranking || !r.ranking.length) return;
    const list = r.ranking.slice().reverse(); // del peor al mejor
    box.innerHTML = `<div class="show-inner stopwatch-show">
      <div class="show-title">⏱️ CRONÓMETRO GLOBAL</div>
      <div class="show-kicker">Objetivo: ${MN.S.settings.stopwatchTarget},00 s · bote ${r.pot} fichas</div>
      <ol class="sw-reveal" id="sw-reveal"></ol>${closeBtn}</div>`;
    sfx('drum'); await sleep(900);
    for (let k = 0; k < list.length; k++) {
      const x = list[k]; const last = k === list.length - 1;
      if (last) { await sleep(900); sfx('drum'); await sleep(900); }
      MN.$('#sw-reveal').insertAdjacentHTML('afterbegin', `<li class="${last ? 'winner' : ''}"><span>${last ? '🏆' : list.length - k}</span>
        <span>${MN.esc(name(x.player))}</span><b>${(x.ms / 1000).toFixed(2).replace('.', ',')} s</b><span class="muted small">±${(x.diff / 1000).toFixed(2).replace('.', ',')}</span></li>`);
      sfx(last ? 'win' : 'tick'); await sleep(650);
    }
    boom({ count: 220 });
  }

  // ---------------------------------------------------------- 🎰 resultado de mi apuesta
  async function betShow(box, pay, bet) {
    const c = MN.S.challenges.find((x) => x.id === pay.challengeId);
    const got = (pay.payouts || {})[bet.player] || 0;
    box.innerHTML = `<div class="show-inner bet-show">
      <div class="show-title">🎰 TU APUESTA</div>
      <div class="show-kicker">${c ? `${MN.esc(name(c.from))} vs ${MN.esc(name(c.to))} · ${MN.esc(c.game)}` : ''}</div>
      <div class="bet-ticket">Apostaste <b>${bet.amount}</b> fichas por<div class="bet-pick">${MN.esc(name(bet.on))}</div></div>
      <div class="com-spot" id="bet-spot">¿Quién ganó?</div>
      <div class="show-result" id="bet-result"></div>${closeBtn}</div>`;
    sfx('drum'); await sleep(1300);
    if (pay.refund) {
      MN.$('#bet-spot').textContent = 'Duelo anulado';
      MN.$('#bet-result').innerHTML = `<div class="show-big">↩️ Te devolvemos tus ${bet.amount} fichas</div>`;
      MN.$('#bet-result').classList.add('shown'); sfx('event'); return;
    }
    const winner = c && c.winner;
    for (let k = 0; k < 7 && c; k++) { MN.$('#bet-spot').textContent = name(k % 2 ? c.from : c.to); sfx('tick'); await sleep(150 + k * 45); }
    MN.$('#bet-spot').textContent = winner ? `🏆 ${name(winner)}` : '¿?';
    MN.$('#bet-spot').classList.add('hit'); sfx('stop');
    await sleep(600);
    const res = MN.$('#bet-result');
    if (got > bet.amount) {
      res.innerHTML = `<div class="show-big win">¡ACERTASTE! +${got - bet.amount} fichas</div><div class="muted">Cobras ${got} (tu apuesta + tu parte del bote)</div>`;
      boom({ count: 200 }); sfx('win');
    } else if (got > 0) {
      res.innerHTML = `<div class="show-big win">¡Acertaste!</div><div class="muted">Pero nadie apostó en contra: recuperas tus ${got} fichas</div>`;
      sfx('event');
    } else {
      res.innerHTML = `<div class="show-big lose">Fallaste… −${bet.amount} fichas</div><div class="muted">Otra vez será</div>`;
      sfx('lose');
    }
    res.classList.add('shown');
  }

  const EVENT_SHOWS = { lottery: lotteryShow, communist: communistShow, stopwatch: stopwatchShow };

  // ---------------------------------------------------------- qué enseñar a quién
  // "Ya visto" se guarda por jugador (no por móvil): si en un mismo móvil se
  // juega con varios jugadores, cada uno tiene sus propias animaciones pendientes
  const seenKey = 'mn_shows_seen';
  const seenMap = () => { try { return JSON.parse(localStorage.getItem(seenKey) || '{}'); } catch (e) { return {}; } };
  const hasSeen = (k) => !!seenMap()[k];
  function markSeen(k) { try { const s = seenMap(); s[k] = 1; localStorage.setItem(seenKey, JSON.stringify(s)); } catch (e) { /* nada */ } }
  function seen(k) { if (hasSeen(k)) return true; markSeen(k); return false; }
  const isTV = () => location.hash === '#tv';
  const slotKey = (d, pid) => `slot:${d.id}:${pid}`;
  const slotSeen = (d, pid) => hasSeen(slotKey(d, pid)) || hasSeen('slot:' + d.id); // la clave antigua era por móvil

  // Duelos míos cuya tragaperras aún no he visto: quedan pendientes hasta que toque "Girar"
  function pendingSlots() {
    const mine = MN.me(); if (!mine || isTV()) return [];
    return MN.S.txs.filter((t) => eligible(t) && !t.voided && (t.winner === mine.id || t.loser === mine.id) && !slotSeen(t, mine.id)).reverse();
  }

  function pendingBets() {
    const mine = MN.me(); if (!mine || isTV()) return [];
    return MN.S.txs.filter((t) => t.kind === 'bets' && !t.voided).map((t) => {
      const bet = (MN.S.bets || []).find((b) => b.challengeId === t.challengeId && b.player === mine.id && !b.cancelled);
      return bet && !hasSeen(`bet:${t.id}:${mine.id}`) ? { pay: t, bet } : null;
    }).filter(Boolean).reverse();
  }
  function playBet(x) {
    const mine = MN.me();
    if (mine) markSeen(`bet:${x.pay.id}:${mine.id}`);
    enqueue((box) => betShow(box, x.pay, x.bet));
    MN.renderAll();
  }

  function playSlot(d) {
    const mine = MN.me();
    if (mine) markSeen(slotKey(d, mine.id));
    enqueue((box) => slotShow(box, d));
    MN.renderAll();
  }

  function renderPending() {
    const list = pendingSlots(); const betsList = pendingBets();
    const total = list.length + betsList.length;
    const wrap = MN.$('#slot-pending-wrap'); const el = MN.$('#slot-pending');
    if (wrap) {
      wrap.hidden = !total;
      const MAXV = 5; let shown = 0;
      el.innerHTML = betsList.filter(() => shown++ < MAXV).map((x) => {
        const c = MN.S.challenges.find((y) => y.id === x.pay.challengeId);
        return `<li class="challenge status-reported needs-me slot-pending">
          <div class="ch-head">🎰 Tu apuesta<span class="ch-amount">${x.bet.amount}</span></div>
          <div class="ch-sub">${c ? `${MN.esc(name(c.from))} vs ${MN.esc(name(c.to))} · ${MN.esc(c.game)}` : ''}</div>
          <div class="ch-status">Apostaste por ${MN.who(x.bet.on)}. ¿Acertaste?</div>
          <div class="ch-actions"><button type="button" class="btn primary" data-bet-play="${MN.esc(x.pay.id)}">🎰 Ver resultado</button></div></li>`;
      }).join('') + list.filter(() => shown++ < MAXV).map((d) => {
        const mine = MN.me(); const won = d.winner === mine.id;
        return `<li class="challenge status-reported needs-me slot-pending">
          <div class="ch-head">${MN.who(d.winner)}<span class="ch-vs">VS</span>${MN.who(d.loser)}<span class="ch-amount">${d.amount}</span></div>
          <div class="ch-sub">${MN.esc(d.game)} · ${MN.ago(d.ts)}</div>
          <div class="ch-status">${won ? '🏆 ¡Ganaste!' : '😵 Perdiste…'} Falta ver qué dice la tragaperras.</div>
          <div class="ch-actions"><button type="button" class="btn primary" data-slot-play="${MN.esc(d.id)}">🎰 Girar</button></div></li>`;
      }).join('') + (total > 3 ? `<li class="pending-more">${total > MAXV ? `…y ${total - MAXV} más · ` : ''}<button type="button" class="link" data-seen-all>Marcar todas como vistas</button></li>` : '');
    }
    const banner = MN.$('#slot-pending-banner');
    if (banner) {
      banner.hidden = !total;
      const first = betsList[0] ? `data-bet-play="${MN.esc(betsList[0].pay.id)}"` : list[0] ? `data-slot-play="${MN.esc(list[0].id)}"` : '';
      banner.innerHTML = total ? `<button type="button" class="slot-banner" ${first}>🎰 Tienes ${total === 1 ? 'un resultado' : total + ' resultados'} por revelar · <b>Ver</b></button>` : '';
    }
  }

  let known = null;
  function onState() {
    const mine = MN.me(); const now = Date.now();
    const ids = new Set(MN.S.txs.map((t) => t.id));
    if (known) {
      // En directo: si estoy conectado cuando se resuelve mi duelo (o he apostado, o es la TV), sale sola
      MN.S.txs.filter((t) => eligible(t) && !t.voided && !known.has(t.id) && now - t.ts < 5 * 60000).forEach((d) => {
        const bet = mine && (MN.S.bets || []).some((b) => b.challengeId === d.challengeId && b.player === mine.id);
        const mineDuel = mine && (d.winner === mine.id || d.loser === mine.id);
        if (isTV()) { if (!seen('slot:' + d.id + ':tv')) enqueue((box) => slotShow(box, d)); }
        else if (mineDuel) { if (!slotSeen(d, mine.id)) playSlot(d); }
        else if (bet && !seen(slotKey(d, mine.id))) enqueue((box) => slotShow(box, d));
      });
    }
    if (known) pendingBets().filter((x) => !known.has(x.pay.id)).forEach(playBet);
    known = ids;
    // Eventos recién resueltos (todos los ven, una vez por móvil)
    (MN.S.events || []).filter((e) => e.status === 'done' && EVENT_SHOWS[e.type] && e.result && now - (e.result.at || e.at) < 10 * 60000).forEach((e) => {
      if (!seen('ev:' + e.id)) enqueue((box) => EVENT_SHOWS[e.type](box, e));
    });
  }

  return {
    init(api) {
      MN = api;
      MN.shows = { replay: (ev) => EVENT_SHOWS[ev.type] && enqueue((box) => EVENT_SHOWS[ev.type](box, ev)) };
      MN.registerTx('slot', {
        line: (t) => {
          const o = OUTCOMES.find((x) => x.id === t.outcome) || OUTCOMES[0];
          const who = Object.keys(t.payouts);
          return { icon: '🎰', text: `Tragaperras: <b>${o.title}</b> ${o.id === 'spectators' ? `(${who.length} jugadores +1)` : Object.entries(t.payouts).map(([id, v]) => `${MN.who(id)} ${v > 0 ? '+' : ''}${v}`).join(', ')}`, sub: 'Modificador del duelo' };
        },
      });
      document.addEventListener('click', (e) => {
        const sp = e.target.closest('[data-slot-play]');
        if (sp) { const d = MN.S.txs.find((t) => t.id === sp.dataset.slotPlay); if (d) playSlot(d); return; }
        if (e.target.closest('[data-seen-all]')) {
          const mine = MN.me(); if (!mine) return;
          pendingSlots().forEach((d) => markSeen(slotKey(d, mine.id)));
          pendingBets().forEach((x) => markSeen(`bet:${x.pay.id}:${mine.id}`));
          MN.renderAll(); return;
        }
        const bp = e.target.closest('[data-bet-play]');
        if (bp) { const x = pendingBets().find((y) => y.pay.id === bp.dataset.betPlay); if (x) playBet(x); return; }
        const b = e.target.closest('[data-replay]'); if (!b) return;
        const ev = (MN.S.events || []).find((x) => x.id === b.dataset.replay); if (ev) MN.shows.replay(ev);
      });
    },
    onState,
    sweep,
    render: renderPending,
    duelBadge: () => pendingSlots().length + pendingBets().length,
    rules(section) {
      return section('🎰', 'Tragaperras', `
        <p>Al terminar cada duelo gira una tragaperras con un modificador aleatorio:</p>
        <ul>${OUTCOMES.map((o) => `<li><b>${o.sym ? o.sym.repeat(3) : '🍒🍋🔔'} ${o.title}</b> (${o.w}%): ${
          { nothing: 'no pasa nada', double: 'el ganador cobra el doble', consolation: 'el perdedor recupera la mitad de lo perdido', spectators: 'todos los demás jugadores reciben 1 ficha', tax: 'el ganador paga a la Banca el 25% de lo ganado', jackpot: 'el ganador cobra el triple' }[o.id]}.</li>`).join('')}</ul>
        <p class="hint">Los premios los pone la Banca. Si se anula el duelo, también se anula el modificador.</p>`);
    },
  };
})());
