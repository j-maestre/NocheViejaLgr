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
        <span class="tv-emoji">${esc(p.emoji)}</span><span class="tv-name">${esc(p.name)} ${fire}</span><span class="tv-chips">${bal[p.id]}</span></li>`;
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
        <div class="podium-player"><div class="podium-emoji">${esc(p.emoji)}</div><div class="podium-name">${esc(p.name)}</div><div class="podium-chips">${bal[p.id]} fichas</div></div>
        <div class="podium-block">${place}</div></div>` : '<div class="podium-step"></div>');
    box.innerHTML = `<div class="cer-inner">
      <div class="cer-title">🏆 La mesa está cerrada</div>
      <div class="cer-sub">Y el ganador del Mercado Negro es…</div>
      <div class="podium">${step(top[1], 2)}${step(top[0], 1)}${step(top[2], 3)}</div>
      <div class="cer-actions"><button type="button" class="btn primary" id="cer-wrapped">🎁 Ver el resumen de la partida</button>
      <button type="button" class="link" id="cer-close">Cerrar</button></div></div>`;
    const reveal = (place, delay, big) => setTimeout(() => {
      const s = box.querySelector('.place-' + place); if (s) s.classList.add('shown');
      if (MN.fx) { MN.fx.play(big ? 'win' : 'event'); if (big) { MN.fx.confetti({ count: 260, duration: 4000 }); setTimeout(() => MN.fx.confetti({ count: 200 }), 1200); } }
      if (big) box.querySelector('.cer-actions').classList.add('shown');
    }, delay);
    reveal(3, 1500); reveal(2, 3500); reveal(1, 6000, true);
  }

  // ---------------------------------------------------------- wrapped
  function wrappedData() {
    const S = MN.S; const bal = MN.balances(); const P = MN.player; const esc = MN.esc;
    const duels = S.txs.filter((t) => t.type === 'duel' && !t.voided);
    const tables = S.txs.filter((t) => t.kind === 'table' && !t.voided);
    const moved = duels.reduce((a, t) => a + t.amount, 0) + tables.reduce((a, t) => a + t.pot, 0);
    const sorted = MN.sortedPlayers(bal);
    const name = (id) => `${esc(P(id).emoji)} ${esc(P(id).name)}`;
    const slides = [];

    slides.push({ icon: '🎰', title: 'La partida en números', body: `<div class="wr-big">${duels.length}</div><div>duelos</div>
      <div class="wr-row"><span><b>${tables.length}</b> mesas</span><span><b>${moved}</b> fichas en juego</span><span><b>${(S.events || []).filter((e) => e.status === 'done').length}</b> eventos</span></div>` });
    if (sorted[0]) slides.push({ icon: '👑', title: 'Campeón del Mercado Negro', body: `<div class="wr-emoji">${esc(sorted[0].emoji)}</div><div class="wr-name">${esc(sorted[0].name)}</div><div>${bal[sorted[0].id]} fichas</div>` });

    const big = duels.reduce((m, t) => (t.amount > (m ? m.amount : 0) ? t : m), null);
    if (big) slides.push({ icon: '💥', title: 'El mayor golpe', body: `<div class="wr-name">${name(big.winner)}</div><div>le arrancó <b>${big.amount}</b> fichas a ${name(big.loser)}</div><div class="muted">${esc(big.game)}</div>${big.dedication ? `<div class="wr-quote">“${esc(big.dedication)}”</div>` : ''}` });

    // Racha más larga
    const streak = {}; let best = { id: null, n: 0 };
    duels.forEach((t) => { streak[t.winner] = (streak[t.winner] || 0) + 1; streak[t.loser] = 0; if (streak[t.winner] > best.n) best = { id: t.winner, n: streak[t.winner] }; });
    if (best.n >= 2) slides.push({ icon: '🔥', title: 'La racha más larga', body: `<div class="wr-name">${name(best.id)}</div><div><b>${best.n}</b> victorias seguidas</div>` });

    const rej = {}; S.challenges.forEach((c) => { if (c.status === 'rejected') rej[c.to] = (rej[c.to] || 0) + 1; });
    const chicken = Object.entries(rej).sort((a, b) => b[1] - a[1])[0];
    if (chicken) slides.push({ icon: '🐔', title: 'La mayor gallina', body: `<div class="wr-name">${name(chicken[0])}</div><div>rechazó <b>${chicken[1]}</b> ${chicken[1] === 1 ? 'reto' : 'retos'}</div>` });

    const loans = {}; S.txs.forEach((t) => { if (t.type === 'loan' && !t.voided) loans[t.player] = (loans[t.player] || 0) + 1; });
    const drunk = Object.entries(loans).sort((a, b) => b[1] - a[1])[0];
    if (drunk) slides.push({ icon: '🍺', title: 'El más moroso', body: `<div class="wr-name">${name(drunk[0])}</div><div>pidió <b>${drunk[1]}</b> ${drunk[1] === 1 ? 'préstamo' : 'préstamos'} a la Banca</div>` });

    // Némesis del grupo: la pareja que más se ha enfrentado
    const pairs = {};
    duels.forEach((t) => { const k = [t.winner, t.loser].sort().join('|'); pairs[k] = pairs[k] || { n: 0, w: {} }; pairs[k].n++; pairs[k].w[t.winner] = (pairs[k].w[t.winner] || 0) + 1; });
    const rivalry = Object.entries(pairs).sort((a, b) => b[1].n - a[1].n)[0];
    if (rivalry && rivalry[1].n >= 2) {
      const [a, b] = rivalry[0].split('|');
      slides.push({ icon: '😈', title: 'La gran rivalidad', body: `<div class="wr-name">${name(a)} <span class="muted">vs</span> ${name(b)}</div><div><b>${rivalry[1].n}</b> duelos · ${rivalry[1].w[a] || 0} – ${rivalry[1].w[b] || 0}</div>` });
    }

    // Mejor apostador
    const betNet = {};
    S.txs.forEach((t) => {
      if (t.voided) return;
      if (t.kind === 'bet') betNet[t.player] = (betNet[t.player] || 0) - t.amount;
      if (t.kind === 'bets') Object.entries(t.payouts).forEach(([id, v]) => { betNet[id] = (betNet[id] || 0) + v; });
    });
    const gambler = Object.entries(betNet).sort((a, b) => b[1] - a[1])[0];
    if (gambler && gambler[1] > 0) slides.push({ icon: '🎰', title: 'El mejor apostador', body: `<div class="wr-name">${name(gambler[0])}</div><div>ganó <b>${gambler[1]}</b> fichas apostando por los demás</div>` });

    // Suerte: lotería y cronómetro
    const luck = S.txs.filter((t) => !t.voided && (t.kind === 'lottery' || t.kind === 'stopwatch'))
      .map((t) => `<li>${t.kind === 'lottery' ? '🎟️ Lotería' : '⏱️ Cronómetro'}: ${name(t.winner)} (+${t.pot})</li>`);
    if (luck.length) slides.push({ icon: '🍀', title: 'Tocados por la suerte', body: `<ul class="wr-list">${luck.join('')}</ul>` });

    if (sorted.length > 1) {
      const last = sorted[sorted.length - 1];
      slides.push({ icon: '🏮', title: 'El farolillo rojo', body: `<div class="wr-emoji">${esc(last.emoji)}</div><div class="wr-name">${esc(last.name)}</div><div>${bal[last.id]} fichas. El año que viene será.</div>` });
    }
    slides.push({ icon: '🥂', title: '¡Feliz año nuevo!', body: '<div>Gracias por jugar al Mercado Negro.</div><div class="muted">La Banca siempre gana.</div>' });
    return slides;
  }

  function wrapped() {
    const slides = wrappedData(); let i = 0;
    const box = MN.$('#wrapped'); box.hidden = false; document.body.classList.add('no-scroll');
    MN.$('#ceremony').hidden = true;
    const show = () => {
      const s = slides[i];
      box.innerHTML = `<div class="wr-card" style="--hue:${(i * 47) % 360}">
        <div class="wr-progress">${slides.map((_, k) => `<span class="${k <= i ? 'on' : ''}"></span>`).join('')}</div>
        <div class="wr-icon">${s.icon}</div><div class="wr-title">${s.title}</div><div class="wr-body">${s.body}</div>
        <div class="wr-nav"><button type="button" class="link" data-wr="prev" ${i ? '' : 'hidden'}>← Atrás</button>
        <button type="button" class="btn primary" data-wr="${i < slides.length - 1 ? 'next' : 'close'}">${i < slides.length - 1 ? 'Siguiente →' : 'Cerrar'}</button></div>
        <button type="button" class="tv-exit" data-wr="close">✕</button></div>`;
      if (i === 1 && MN.fx) MN.fx.confetti({ count: 120 });
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

  return {
    init(api) {
      MN = api;
      window.addEventListener('hashchange', () => { if (MN.S) MN.renderAll(); });
      document.addEventListener('click', (e) => {
        if (e.target.closest('#tv-exit')) { history.replaceState(null, '', location.pathname); MN.renderAll(); }
        if (e.target.closest('[data-tv]')) { location.hash = 'tv'; }
        if (e.target.closest('[data-ceremony]')) ceremony();
        if (e.target.closest('[data-wrapped]') || e.target.closest('#cer-wrapped')) wrapped();
        if (e.target.closest('#cer-close')) { MN.$('#ceremony').hidden = true; document.body.classList.remove('no-scroll'); }
      });
    },
    render() {
      renderTV();
      // Botones de la ceremonia y el wrapped en el banner final
      const fb = MN.$('#final-banner .final');
      if (fb && !fb.querySelector('[data-ceremony]')) fb.insertAdjacentHTML('beforeend', '<div class="final-actions"><button type="button" class="btn ghost" data-ceremony>🏆 Ceremonia</button><button type="button" class="btn ghost" data-wrapped>🎁 Resumen</button></div>');
    },
    tick() {
      if (isTV()) tickTV();
      // En la TV, la ceremonia empieza sola al cerrar la mesa
      if (isTV() && MN.S && MN.ended() && !ceremonyShown) { ceremonyShown = true; ceremony(); }
    },
    hidesWelcome: () => isTV(),
  };
})());
