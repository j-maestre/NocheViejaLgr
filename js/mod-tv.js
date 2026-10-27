// ============================================================
//  MÓDULO: MODO TV, CEREMONIA FINAL Y WRAPPED
//  📺 #tv en la dirección → pantalla para proyectar (sin registrarse)
//  🏆 Ceremonia: podio que se revela 3.º → 2.º → 1.º
//  🎁 Wrapped: resumen de la partida en diapositivas
// ============================================================
(window.MNModules = window.MNModules || []).push((function () {
  'use strict';
  let MN;
  const isTV = () => location.hash === '#tv';
  const eventsApi = () => { const m = (window.MNModules || []).find((x) => x.api); return m ? m.api() : null; };
  let ceremonyShown = false;

  // ---------------------------------------------------------- modo TV
  function renderTV() {
    const el = MN.$('#tv'); if (!el) return;
    document.body.classList.toggle('tv-mode', isTV());
    if (!isTV()) { el.hidden = true; return; }
    el.hidden = false;
    const S = MN.S; const bal = MN.balances(); const esc = MN.esc;
    const sorted = MN.sortedPlayers(bal);
    const mask = MN.rankMask();
    const rows = sorted.slice(0, 10).map((p, i) => {
      if (mask) return `<li class="tv-row masked ${i === 0 ? 'first' : ''}"><span class="tv-pos">${i < 3 ? MN.MEDALS[i] : i + 1}</span><span class="tv-emoji">${mask.icon}</span><span class="tv-name">${mask.name}</span><span class="tv-chips">${bal[p.id]}</span></li>`;
      const st = MN.playerStats(p.id);
      const fire = st.streakWin && st.streak >= 3 ? `<span class="fire lvl-${st.streak >= 7 ? 3 : st.streak >= 5 ? 2 : 1}"><span class="flame">🔥</span>${st.streak}</span>` : '';
      return `<li class="tv-row ${i === 0 ? 'first' : ''}"><span class="tv-pos">${i < 3 ? MN.MEDALS[i] : i + 1}</span>
        <span class="tv-emoji">${MN.face(p)}</span><span class="tv-name">${esc(p.name)} ${fire}</span><span class="tv-chips">${bal[p.id]}</span></li>`;
    }).join('');

    // Evento actual o próximo
    let evHtml = '';
    const api = eventsApi();
    if (api) {
      const list = api.events().filter((e) => e.status !== 'done');
      const live = list.find((e) => ['live', 'signup', 'playing'].includes(api.phase(e)));
      const ev = live || list.filter((e) => api.phase(e) !== 'over').sort((a, b) => a.at - b.at)[0];
      if (ev) {
        const T = api.TYPES[ev.type];
        evHtml = `<div class="tv-event ${live ? 'live' : ''}"><div class="tv-event-art">${api.ART[ev.type]}</div>
          <div><div class="tv-kicker">${live ? '🔴 AHORA' : 'PRÓXIMO EVENTO'}</div><div class="tv-event-name">${T.icon} ${T.name}</div>
          <div class="tv-event-when">${new Date(ev.at).toLocaleString('es-ES', { weekday: 'short', hour: '2-digit', minute: '2-digit' })}</div></div></div>`;
      }
    }

    // En juego: retos aceptados y mesas en marcha
    const live = [
      ...MN.activeChallenges().filter((c) => c.status !== 'pending').map((c) => `<li>⚔️ ${esc(MN.player(c.from).emoji)} ${esc(MN.player(c.from).name)} <b>vs</b> ${esc(MN.player(c.to).emoji)} ${esc(MN.player(c.to).name)} · ${esc(c.game)} · <b>${c.amount}</b></li>`),
      ...(S.tables || []).filter((t) => t.status === 'playing' || t.status === 'reported').map((t) => `<li>🃏 ${esc(t.game)} · ${t.seats.length} jugadores · bote <b>${t.buyIn * t.seats.length}</b></li>`),
    ];

    const feed = S.txs.filter((t) => !t.voided && t.type !== 'init').slice(-10).reverse().map((t) => `<span class="tv-tick">${MN.txLine(t).icon} ${MN.txLine(t).text.replace(/<(?!\/?b>)[^>]+>/g, '')}</span>`).join('');

    el.innerHTML = `
      <button type="button" class="tv-exit" id="tv-exit" title="Salir del modo TV">✕</button>
      <div class="tv-grid">
        <section class="tv-rank"><h2>${mask ? '☭ Ranking censurado' : '🏆 Ranking'}</h2><ol>${rows || '<li class="muted">Sin jugadores</li>'}</ol></section>
        <section class="tv-side">
          <div class="tv-countdown" id="tv-countdown"></div>
          <div class="tv-limit">🎯 Apuesta máxima: <b>${MN.currentPct()}%</b></div>
          ${evHtml}
          <div class="tv-live"><h3>🔥 Jugándose ahora</h3><ul>${live.join('') || '<li class="muted">Nada… ¡a retarse!</li>'}</ul></div>
        </section>
      </div>
      <div class="tv-ticker"><div class="tv-ticker-inner">${feed}${feed}</div></div>`;
    tickTV();
  }

  function tickTV() {
    const el = MN.$('#tv-countdown'); if (!el || !MN.S) return;
    const pre = !MN.started(); const ms = (pre ? MN.startTs() : MN.endTs()) - Date.now();
    if (!pre && ms <= 0) { el.innerHTML = '<div class="tv-cd-label">La mesa está</div><div class="tv-cd">CERRADA</div>'; return; }
    const d = Math.floor(ms / 86400000); const h = Math.floor(ms / 3600000) % 24; const m = Math.floor(ms / 60000) % 60; const s = Math.floor(ms / 1000) % 60;
    el.innerHTML = `<div class="tv-cd-label">${pre ? 'La mesa abre en' : 'Cierre de la mesa'}</div><div class="tv-cd ${!pre && ms < 3600000 ? 'urgent' : ''}">${d ? d + 'd ' : ''}${MN.pad(h)}:${MN.pad(m)}:${MN.pad(s)}</div>`;
  }

  // ---------------------------------------------------------- ceremonia
  function ceremony() {
    const bal = MN.balances(); const top = MN.sortedPlayers(bal).slice(0, 3);
    if (!top.length) return;
    const box = MN.$('#ceremony'); box.hidden = false; document.body.classList.add('no-scroll');
    const esc = MN.esc;
    const step = (p, place) => (p ? `<div class="podium-step place-${place}">
        <div class="podium-player"><div class="podium-emoji">${MN.face(p)}</div><div class="podium-name">${esc(p.name)}</div><div class="podium-chips">${bal[p.id]} fichas</div></div>
        <div class="podium-block">${place}</div></div>` : '<div class="podium-step"></div>');
    box.innerHTML = `<div class="cer-inner">
      <div class="cer-title">🏆 La mesa está cerrada</div>
      <div class="cer-sub">Y el ganador del Mercado Negro es…</div>
      <div class="podium">${step(top[1], 2)}${step(top[0], 1)}${step(top[2], 3)}</div>
      <div class="cer-actions"><button type="button" class="btn primary" id="cer-wrapped">🎁 Ver tu resumen</button>
      <button type="button" class="link" id="cer-close">Cerrar</button></div></div>`;
    const reveal = (place, delay, big) => setTimeout(() => {
      const s = box.querySelector('.place-' + place); if (s) s.classList.add('shown');
      if (MN.fx) { MN.fx.play(big ? 'win' : 'event'); if (big) { MN.fx.confetti({ count: 260, duration: 4000 }); setTimeout(() => MN.fx.confetti({ count: 200 }), 1200); } }
      if (big) box.querySelector('.cer-actions').classList.add('shown');
    }, delay);
    reveal(3, 1500); reveal(2, 3500); reveal(1, 6000, true);
  }

  // ---------------------------------------------------------- wrapped
  // Estadísticas de toda la partida, calculadas a partir del historial
  const GAME_TX = (t) => !t.voided && !['init', 'loan', 'adjust'].includes(t.type);
  const WHERE = {
    table: (t) => `en la mesa de ${MN.esc(t.game || '')}`, slot: () => 'en la tragaperras', lottery: () => 'en la lotería',
    stopwatch: () => 'en el cronómetro', communist: () => 'en la expropiación comunista', bets: () => 'apostando',
    happy: () => 'en la happy hour', bounty: () => 'cobrando una recompensa', insurance: () => 'gracias al seguro',
  };

  function gameStats() {
    const S = MN.S; const players = S.players;
    const st = {}; players.forEach((p) => { st[p.id] = { moved: 0, wins: 0, played: 0, best: null, worst: null, peak: { v: 0, ts: 0 }, low: { v: Infinity, ts: 0 }, games: {}, gameWins: {}, streak: 0, cur: 0, bets: 0, rejected: 0, loans: 0, start: 0 }; });
    const S0 = (id) => st[id] || (st[id] = { moved: 0, wins: 0, played: 0, best: null, worst: null, peak: { v: 0, ts: 0 }, low: { v: Infinity, ts: 0 }, games: {}, gameWins: {}, streak: 0, cur: 0, bets: 0, rejected: 0, loans: 0, start: 0 });
    const bal = {};
    const txs = S.txs.filter((t) => !t.voided).slice().sort((a, b) => a.ts - b.ts);
    txs.forEach((t) => {
      const fx = MN.effects(t);
      fx.forEach(([id, d]) => {
        const s = S0(id);
        bal[id] = (bal[id] || 0) + d;
        if (t.type === 'init') s.start += d;
        if (GAME_TX(t)) {
          s.moved += Math.abs(d);
          if (d > 0 && (!s.best || d > s.best.d)) s.best = { d, t };
          if (d < 0 && (!s.worst || d < s.worst.d)) s.worst = { d, t };
        }
        // Máximo y mínimo solo desde que se sentó a la mesa
        if (s.start && bal[id] > s.peak.v) s.peak = { v: bal[id], ts: t.ts };
        if (s.start && t.type !== 'init' && bal[id] < s.low.v) s.low = { v: bal[id], ts: t.ts };
        if (t.kind === 'bet') s.bets -= t.amount;
        if (t.kind === 'bets') s.bets += d;
        if (t.type === 'loan') s.loans++;
      });
      if (t.type === 'duel') {
        [t.winner, t.loser].forEach((id) => { const s = S0(id); s.played++; s.games[t.game] = (s.games[t.game] || 0) + 1; });
        const w = S0(t.winner); w.wins++; w.gameWins[t.game] = (w.gameWins[t.game] || 0) + 1; w.cur++; if (w.cur > w.streak) w.streak = w.cur;
        S0(t.loser).cur = 0;
      }
      if (t.kind === 'table') {
        Object.keys(t.payouts || {}).forEach((id) => { const s = S0(id); s.played++; s.games[t.game] = (s.games[t.game] || 0) + 1; });
        (t.winners || []).forEach((id) => { const s = S0(id); s.wins++; s.gameWins[t.game] = (s.gameWins[t.game] || 0) + 1; });
      }
    });
    S.challenges.forEach((c) => { if (c.status === 'rejected') S0(c.to).rejected++; });
    Object.entries(st).forEach(([id, s]) => { s.final = bal[id] || 0; if (s.low.v === Infinity) s.low = { v: s.final, ts: 0 }; });
    return st;
  }

  const top = (st, key, min = 1) => {
    const e = Object.entries(st).filter(([id]) => MN.S.players.some((p) => p.id === id)).map(([id, s]) => [id, typeof key === 'function' ? key(s) : s[key]]).filter(([, v]) => v >= min).sort((a, b) => b[1] - a[1]);
    return e[0] || null;
  };
  const favGame = (o) => Object.entries(o).sort((a, b) => b[1] - a[1])[0];
  const hitText = (h, id) => {
    const t = h.t; const name = (x) => `${MN.esc(MN.player(x).emoji)} ${MN.esc(MN.player(x).name)}`;
    if (t.type === 'duel') return t.winner === id ? `contra ${name(t.loser)} en ${MN.esc(t.game)}` : `contra ${name(t.winner)} en ${MN.esc(t.game)}`;
    return (WHERE[t.kind] || (() => ''))(t);
  };

  function groupSlides(st) {
    const S = MN.S; const bal = MN.balances(); const esc = MN.esc;
    const duels = S.txs.filter((t) => t.type === 'duel' && !t.voided);
    const tables = S.txs.filter((t) => t.kind === 'table' && !t.voided);
    const moved = duels.reduce((a, t) => a + t.amount, 0) + tables.reduce((a, t) => a + (t.pot || 0), 0);
    const sorted = MN.sortedPlayers(bal);
    const name = (id) => `${esc(MN.player(id).emoji)} ${esc(MN.player(id).name)}`;
    const big = (id) => `<div class="wr-emoji">${MN.face(MN.player(id))}</div><div class="wr-name">${esc(MN.player(id).name)}</div>`;
    const slides = [{ icon: '🌍', title: 'El resumen del grupo', body: '<div>Lo mejor (y lo peor) de la partida de todos.</div>', intro: true }];

    slides.push({ icon: '🎰', title: 'La partida en números', body: `<div class="wr-big">${duels.length}</div><div>duelos</div>
      <div class="wr-row"><span><b>${tables.length}</b> mesas</span><span><b>${moved}</b> fichas en juego</span><span><b>${(S.events || []).filter((e) => e.status === 'done').length}</b> eventos</span></div>` });
    if (sorted[0]) slides.push({ icon: '👑', title: 'Campeón del Mercado Negro', body: `${big(sorted[0].id)}<div>${bal[sorted[0].id]} fichas</div>`, party: true });

    const mv = top(st, 'moved'); if (mv) slides.push({ icon: '💸', title: 'El que más fichas ha movido', body: `${big(mv[0])}<div>Pasaron por sus manos <b>${mv[1]}</b> fichas</div>` });
    const wn = top(st, 'wins'); if (wn) slides.push({ icon: '🏅', title: 'El que más partidas ha ganado', body: `${big(wn[0])}<div><b>${wn[1]}</b> victorias en ${st[wn[0]].played} partidas</div>` });
    const pl = top(st, 'played', 2); if (pl && (!wn || pl[0] !== wn[0])) slides.push({ icon: '🎮', title: 'El incansable', body: `${big(pl[0])}<div>Jugó <b>${pl[1]}</b> partidas. No para.</div>` });
    const sk = top(st, 'streak', 2); if (sk) slides.push({ icon: '🔥', title: 'La racha más larga', body: `${big(sk[0])}<div><b>${sk[1]}</b> victorias seguidas</div>` });
    const hit = top(st, (s) => (s.best ? s.best.d : 0)); if (hit) slides.push({ icon: '💥', title: 'El golpe más tocho', body: `${big(hit[0])}<div>se llevó <b>${hit[1]}</b> fichas de una tacada</div><div class="muted">${hitText(st[hit[0]].best, hit[0])}</div>${st[hit[0]].best.t.dedication ? `<div class="wr-quote">“${esc(st[hit[0]].best.t.dedication)}”</div>` : ''}` });
    const pk = top(st, (s) => s.peak.v); if (pk) slides.push({ icon: '🚀', title: 'El techo de la partida', body: `${big(pk[0])}<div>llegó a tener <b>${pk[1]}</b> fichas</div><div class="muted">${MN.fmtDate(st[pk[0]].peak.ts)}</div>` });
    const up = top(st, (s) => (s.low.v < s.start ? s.final - s.low.v : 0)); if (up) slides.push({ icon: '🔄', title: 'La gran remontada', body: `${big(up[0])}<div>de <b>${st[up[0]].low.v}</b> a <b>${st[up[0]].final}</b> fichas</div><div class="muted">El ave fénix del Mercado Negro</div>` });
    const dn = top(st, (s) => s.peak.v - s.final); if (dn && dn[1] > 0) slides.push({ icon: '📉', title: 'El mayor desplome', body: `${big(dn[0])}<div>de <b>${st[dn[0]].peak.v}</b> a <b>${st[dn[0]].final}</b> fichas</div><div class="muted">Subió como la espuma, bajó como el Ibex</div>` });

    const rej = top(st, 'rejected'); if (rej) slides.push({ icon: '🐔', title: 'La mayor gallina', body: `${big(rej[0])}<div>rechazó <b>${rej[1]}</b> ${rej[1] === 1 ? 'reto' : 'retos'}</div>` });
    const ln = top(st, 'loans'); if (ln) slides.push({ icon: '🍺', title: 'El más moroso', body: `${big(ln[0])}<div>pidió <b>${ln[1]}</b> ${ln[1] === 1 ? 'préstamo' : 'préstamos'} a la Banca</div>` });

    // La pareja que más se ha enfrentado
    const pairs = {};
    duels.forEach((t) => { const k = [t.winner, t.loser].sort().join('|'); pairs[k] = pairs[k] || { n: 0, w: {} }; pairs[k].n++; pairs[k].w[t.winner] = (pairs[k].w[t.winner] || 0) + 1; });
    const rivalry = Object.entries(pairs).sort((a, b) => b[1].n - a[1].n)[0];
    if (rivalry && rivalry[1].n >= 2) {
      const [a, b] = rivalry[0].split('|');
      slides.push({ icon: '😈', title: 'La gran rivalidad', body: `<div class="wr-name">${name(a)} <span class="muted">vs</span> ${name(b)}</div><div><b>${rivalry[1].n}</b> duelos · ${rivalry[1].w[a] || 0} – ${rivalry[1].w[b] || 0}</div>` });
    }
    const gb = top(st, 'bets'); if (gb) slides.push({ icon: '🎲', title: 'El mejor apostador', body: `${big(gb[0])}<div>ganó <b>${gb[1]}</b> fichas apostando por los demás</div>` });

    const allGames = {}; [...duels, ...tables].forEach((t) => { if (t.game) allGames[t.game] = (allGames[t.game] || 0) + 1; });
    const fg = favGame(allGames); if (fg) slides.push({ icon: '🃏', title: 'El juego de la partida', body: `<div class="wr-name">${esc(fg[0])}</div><div>se jugó <b>${fg[1]}</b> ${fg[1] === 1 ? 'vez' : 'veces'}</div>` });

    const dict = S.txs.filter((t) => !t.voided && t.kind === 'plebiscite');
    if (dict.length) { const d = dict[dict.length - 1]; slides.push({ icon: '🎖️', title: 'El Dictador', body: `${big(d.winner)}<div>ganó el plebiscito con <b>${d.votes}</b> votos y cobró <b>${d.pot}</b> fichas de tributo</div><div class="muted">Elecciones limpísimas</div>` }); }

    const luck = S.txs.filter((t) => !t.voided && (t.kind === 'lottery' || t.kind === 'stopwatch'))
      .map((t) => `<li>${t.kind === 'lottery' ? '🎟️ Lotería' : '⏱️ Cronómetro'}: ${name(t.winner)} (+${t.pot})</li>`);
    if (luck.length) slides.push({ icon: '🍀', title: 'Tocados por la suerte', body: `<ul class="wr-list">${luck.join('')}</ul>` });

    if (sorted.length > 1) {
      const last = sorted[sorted.length - 1];
      slides.push({ icon: '🏮', title: 'El farolillo rojo', body: `${big(last.id)}<div>${bal[last.id]} fichas. El año que viene será.</div>` });
    }
    slides.push({ icon: '🥂', title: '¡Feliz año nuevo!', body: '<div>Gracias por jugar al Mercado Negro.</div><div class="muted">La Banca siempre gana.</div>', party: true });
    return slides;
  }

  // Título del jugador según cómo ha jugado
  function persona(id, s, st, pos) {
    const maxPlayed = Math.max(...Object.values(st).map((x) => x.played));
    const rate = s.played ? s.wins / s.played : 0;
    if (pos === 0) return ['👑', 'El Rey del Mercado', 'Nadie ha acumulado más que tú. Disfruta tu reinado (dura un año).'];
    if (rate >= 0.65 && s.played >= 5) return ['🦈', 'El Tiburón', 'Ganaste casi todo lo que tocaste. Te temen.'];
    if (s.low.v < s.start && s.final - s.low.v >= s.start / 2) return ['🔄', 'El Ave Fénix', 'Te dieron por muerto y resucitaste.'];
    if (s.played === maxPlayed && s.played >= 4) return ['🎮', 'El Incansable', 'Nadie jugó más que tú. ¿Dormiste?'];
    if (s.rejected >= 2) return ['🐔', 'La Gallina', 'Muchos retos rechazados… cocorocó.'];
    if (s.loans >= 2) return ['🍺', 'El Moroso', 'La Banca te conoce por tu nombre.'];
    if (rate < 0.35 && s.played >= 4) return ['🥊', 'El Saco de Boxeo', 'Te llevaste golpes, pero nunca dejaste de pelear.'];
    if (s.played <= 2) return ['👀', 'El Mirón', 'Viniste a mirar… y lo bien que lo pasaste.'];
    return ['🎲', 'El Jugador', 'Ni contigo ni sin ti: un clásico de la mesa.'];
  }

  function personalSlides(id, st) {
    const s = st[id]; if (!s) return [];
    const esc = MN.esc; const bal = MN.balances(); const me = MN.player(id);
    const sorted = MN.sortedPlayers(bal); const pos = sorted.findIndex((p) => p.id === id);
    const name = (x) => `${esc(MN.player(x).emoji)} ${esc(MN.player(x).name)}`;
    const stats = MN.playerStats(id);
    const net = s.final - s.start;
    const slides = [{ icon: '🎁', title: `Tu partida, ${esc(me.name)}`, body: `<div class="wr-emoji">${MN.face(me)}</div><div>Esto es lo que has hecho en el Mercado Negro.</div>`, intro: true }];

    slides.push({ icon: pos < 3 ? MN.MEDALS[pos] : '🎯', title: 'Tu puesto final', body: `<div class="wr-big">${pos + 1}.º</div><div>de ${sorted.length} con <b>${s.final}</b> fichas</div>
      <div class="${net >= 0 ? 'wr-up' : 'wr-down'}">${net >= 0 ? '+' : ''}${net} fichas respecto al inicio</div>`, party: pos === 0 });
    if (s.played) slides.push({ icon: '⚔️', title: 'Tu récord', body: `<div class="wr-big">${s.wins}–${s.played - s.wins}</div><div>victorias y derrotas · <b>${Math.round((s.wins / s.played) * 100)}%</b> de acierto</div><div class="muted">Moviste <b>${s.moved}</b> fichas en total</div>` });
    if (s.best) slides.push({ icon: '💥', title: 'Tu mejor golpe', body: `<div class="wr-big">+${s.best.d}</div><div>${hitText(s.best, id)}</div>` });
    if (s.worst) slides.push({ icon: '🩹', title: 'Tu peor momento', body: `<div class="wr-big wr-down">${s.worst.d}</div><div>${hitText(s.worst, id)}</div><div class="muted">Duele, pero ya pasó</div>` });
    if (s.streak >= 2) slides.push({ icon: '🔥', title: 'Tu mejor racha', body: `<div class="wr-big">${s.streak}</div><div>victorias seguidas</div>` });
    slides.push({ icon: '🚀', title: 'Tu momento cumbre', body: `<div class="wr-big">${s.peak.v}</div><div>fichas, lo máximo que llegaste a tener</div>${s.peak.ts ? `<div class="muted">${MN.fmtDate(s.peak.ts)}</div>` : ''}` });
    const fg = favGame(s.games); const bw = favGame(s.gameWins);
    if (fg) slides.push({ icon: '🃏', title: 'Tu juego', body: `<div class="wr-name">${esc(fg[0])}</div><div>lo jugaste <b>${fg[1]}</b> ${fg[1] === 1 ? 'vez' : 'veces'}</div>${bw && bw[0] !== fg[0] ? `<div class="muted">pero donde más ganaste fue en <b>${esc(bw[0])}</b></div>` : ''}` });
    if (stats.victim || stats.nemesis) slides.push({ icon: '😈', title: 'Tus rivales', body: `${stats.victim ? `<div>🍖 Tu víctima: <b>${name(stats.victim[0])}</b> (+${stats.victim[1]})</div>` : ''}${stats.nemesis ? `<div>👹 Tu némesis: <b>${name(stats.nemesis[0])}</b> (${stats.nemesis[1]})</div>` : ''}` });
    if (s.bets) slides.push({ icon: '🎲', title: 'Tus apuestas', body: `<div class="wr-big ${s.bets < 0 ? 'wr-down' : ''}">${s.bets > 0 ? '+' : ''}${s.bets}</div><div>fichas apostando por los demás</div>` });
    const [pi, pt, pd] = persona(id, s, st, pos);
    slides.push({ icon: pi, title: 'Tu título', body: `<div class="wr-name">${pt}</div><div>${pd}</div>`, party: true });
    return slides;
  }

  // what: 'all' (personal + grupo), 'me' o 'group'
  function wrapped(what = 'all') {
    const st = gameStats(); const mine = MN.me();
    const slides = [...(what !== 'group' && mine ? personalSlides(mine.id, st) : []), ...(what !== 'me' ? groupSlides(st) : [])];
    if (!slides.length) return;
    let i = 0;
    const box = MN.$('#wrapped'); box.hidden = false; document.body.classList.add('no-scroll');
    MN.$('#ceremony').hidden = true;
    const show = () => {
      const s = slides[i];
      box.innerHTML = `<div class="wr-card ${s.intro ? 'wr-intro' : ''}" style="--hue:${(i * 47) % 360}">
        <div class="wr-progress">${slides.map((_, k) => `<span class="${k <= i ? 'on' : ''}"></span>`).join('')}</div>
        <div class="wr-icon">${s.icon}</div><div class="wr-title">${s.title}</div><div class="wr-body">${s.body}</div>
        <div class="wr-nav"><button type="button" class="link" data-wr="prev" ${i ? '' : 'hidden'}>← Atrás</button>
        <button type="button" class="btn primary" data-wr="${i < slides.length - 1 ? 'next' : 'close'}">${i < slides.length - 1 ? 'Siguiente →' : 'Cerrar'}</button></div>
        <button type="button" class="tv-exit" data-wr="close">✕</button></div>`;
      if (s.party && MN.fx) MN.fx.confetti({ count: 120 });
    };
    box.onclick = (e) => {
      const b = e.target.closest('[data-wr]'); if (!b) return;
      if (b.dataset.wr === 'next') i++;
      if (b.dataset.wr === 'prev') i--;
      if (b.dataset.wr === 'close') { box.hidden = true; document.body.classList.remove('no-scroll'); return; }
      show();
    };
    show();
  }

  // Al cerrar la mesa: ceremonia y, después, el resumen (una vez por móvil)
  const seenKey = () => `mn_wrapped_${(window.MN_CONFIG || {}).gameId}_${MN.endTs()}`;
  let autoTimer = null;
  function autoFinale() {
    try { if (localStorage.getItem(seenKey())) return; localStorage.setItem(seenKey(), '1'); } catch (e) { /* sin almacenamiento: se muestra igual */ }
    ceremony();
    autoTimer = setTimeout(() => { if (!MN.$('#ceremony').hidden) wrapped(); }, 11000);
  }

  return {
    init(api) {
      MN = api;
      window.addEventListener('hashchange', () => { if (MN.S) MN.renderAll(); });
      document.addEventListener('click', (e) => {
        if (e.target.closest('#tv-exit')) { history.replaceState(null, '', location.pathname); MN.renderAll(); }
        if (e.target.closest('[data-tv]')) { location.hash = 'tv'; }
        if (e.target.closest('[data-ceremony]')) ceremony();
        if (e.target.closest('#cer-wrapped')) { clearTimeout(autoTimer); wrapped(); }
        const w = e.target.closest('[data-wrapped]'); if (w) wrapped(w.dataset.wrapped);
        if (e.target.closest('#cer-close')) { clearTimeout(autoTimer); MN.$('#ceremony').hidden = true; document.body.classList.remove('no-scroll'); }
      });
    },
    render() {
      renderTV();
      // Botones de la ceremonia y el wrapped en el banner final
      const fb = MN.$('#final-banner .final');
      if (fb && !fb.querySelector('[data-ceremony]')) fb.insertAdjacentHTML('beforeend', `<div class="final-actions"><button type="button" class="btn ghost" data-ceremony>🏆 Ceremonia</button>${MN.me() ? '<button type="button" class="btn ghost" data-wrapped="me">🎁 Tu resumen</button>' : ''}<button type="button" class="btn ghost" data-wrapped="group">🌍 Resumen del grupo</button></div>`);
    },
    tick() {
      if (isTV()) tickTV();
      // En la TV, la ceremonia empieza sola al cerrar la mesa
      if (isTV() && MN.S && MN.ended() && !ceremonyShown) { ceremonyShown = true; ceremony(); }
      // En los móviles, la ceremonia y el resumen salen solos al cerrar la mesa
      if (!isTV() && !ceremonyShown && MN.S && MN.ended() && MN.me() && MN.S.players.length && MN.$('#ceremony').hidden) { ceremonyShown = true; autoFinale(); }
    },
    hidesWelcome: () => isTV(),
  };
})());
