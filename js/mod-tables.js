// ============================================================
//  MÓDULO: MESAS Y SALAS MULTIJUGADOR
//  En persona (póker, Dixit, equipos…) o en la app (📱): el Flappy se juega
//  en tiempo real; el resto de juegos de la app, cada uno su turno con la
//  misma prueba, y gana la puntuación más alta (sin registrar nada).
//  open → playing → reported → done   (o cancelled)
//  Cada jugador pone la entrada; el ganador (o el equipo ganador,
//  a partes iguales) se lleva el bote. Un jugador registra el
//  resultado y otro lo confirma; si no se ponen de acuerdo, la Banca.
// ============================================================
(window.MNModules = window.MNModules || []).push((function () {
  'use strict';
  let MN;
  const ACTIVE = ['open', 'playing', 'reported'];
  const TEAMS = ['A', 'B'];
  const tables = () => MN.S.tables || [];
  const activeTables = () => tables().filter((t) => ACTIVE.includes(t.status));
  const seated = (t, id) => (t.seats || []).some((s) => s.player === id);
  const seatOf = (t, id) => (t.seats || []).find((s) => s.player === id);
  const teamPlayers = (t, team) => (t.seats || []).filter((s) => s.team === team).map((s) => s.player);
  const needsMe = (t, id) => (t.status === 'reported' && seated(t, id) && t.reportedBy !== id)
    || (t.status === 'playing' && t.appGame && t.appGame !== 'flappy' && seated(t, id) && !agStarted(t, id));
  const winnersOf = (t, pick) => (t.mode === 'teams' ? teamPlayers(t, pick) : [pick]);
  // 📱 Mesas con juego de la app
  const appGame = (t) => t.appGame && MN.appGames && MN.appGames.GAMES[t.appGame];
  const agMine = (t, id) => t['ag_' + id] != null;
  const agStarted = (t, id) => !!t['ags_' + id];
  const agQuit = (t, id) => !agMine(t, id) && Date.now() - (t['ags_' + id] || t.startedAt || 0) > 15 * 60000;
  const agOver = (t, id) => agMine(t, id) || agQuit(t, id);
  const pickLabel = (t, pick) => (t.mode === 'teams' ? `equipo ${pick}` : MN.player(pick).name);

  // Reparto del bote: cada uno pone su entrada (o lo que le quede) y los ganadores se reparten todo
  function payouts(t, winners) {
    const bal = MN.balances();
    const paid = {}; let pot = 0;
    t.seats.forEach((s) => { paid[s.player] = Math.max(0, Math.min(t.buyIn, bal[s.player] || 0)); pot += paid[s.player]; });
    const share = Math.floor(pot / winners.length);
    const extra = pot - share * winners.length;
    const out = {};
    t.seats.forEach((s) => {
      const i = winners.indexOf(s.player);
      out[s.player] = (i >= 0 ? share + (i === 0 ? extra : 0) : 0) - paid[s.player];
    });
    return { out, pot };
  }

  function seatsHtml(t) {
    const p = (id) => `<span class="seat">${MN.face(MN.player(id), 'mini')} ${MN.esc(MN.player(id).name)}</span>`;
    if (t.mode === 'teams') {
      return TEAMS.map((tm) => `<div class="team-row"><b class="team-tag team-${tm}">Equipo ${tm}</b> ${teamPlayers(t, tm).map(p).join('') || '<span class="muted small">vacío</span>'}</div>`).join('');
    }
    return `<div class="team-row">${t.seats.map((s) => p(s.player)).join('')}</div>`;
  }

  function card(t, myId, admin) {
    const esc = MN.esc;
    const btn = (act, label, cls = '', extra = '') => `<button class="btn ${cls}" data-tact="${act}" data-id="${esc(t.id)}" ${extra}>${label}</button>`;
    const mine = myId && seated(t, myId);
    const pot = t.buyIn * t.seats.length;
    let status = ''; let actions = '';

    if (t.status === 'open') {
      status = `🪑 Buscando jugadores… (${t.seats.length} sentados)`;
      if (myId && !mine) {
        // Para sentarse basta con poder pagar la entrada
        const bal = MN.balances()[myId] || 0;
        if (t.buyIn > bal) status += ` <span class="muted small">· no te llega: la entrada es de ${t.buyIn} y tienes ${bal}</span>`;
        else actions += t.mode === 'teams' ? TEAMS.map((tm) => btn('join', `Sentarme en el ${tm}`, 'primary', `data-team="${tm}"`)).join('') : btn('join', '🪑 Sentarme', 'primary');
      }
      if (mine && t.createdBy !== myId) actions += btn('leave', 'Levantarme', 'ghost');
      if (t.createdBy === myId) {
        const ready = t.mode === 'teams' ? TEAMS.every((tm) => teamPlayers(t, tm).length) : t.seats.length >= 2;
        actions += btn('start', '🎲 ¡Empezar!', 'primary', ready ? '' : 'disabled') + btn('cancel', 'Cerrar mesa', 'ghost');
      }
    } else if (t.status === 'playing' && appGame(t)) {
      const G = appGame(t);
      if (t.appGame === 'flappy') {
        status = mine ? '🐦 ¡Partida en marcha!' : '🐦 Jugando ahora mismo';
        if (mine && !t['ag_' + myId]) actions = btn('flappy', '▶ Entrar a la partida', 'primary');
      } else {
        const done = t.seats.filter((x) => agOver(t, x.player)).length;
        if (mine && agMine(t, myId)) status = `${G.icon} Tu resultado: <b>${esc(t['agl_' + myId])}</b> · ${done}/${t.seats.length} han jugado`;
        else if (mine && agStarted(t, myId)) { status = `${G.icon} Tu turno se quedó a medias.`; actions = btn('agplay', '▶ Continuar mi turno', 'primary'); }
        else if (mine) { status = `${G.icon} ¡Te toca! Todos jugáis la misma prueba y gana quien más puntos saque · ${done}/${t.seats.length} han jugado`; actions = btn('agplay', `${G.icon} Jugar mi turno`, 'primary'); }
        else status = `${G.icon} Jugando · ${done}/${t.seats.length} han jugado`;
      }
    } else if (t.status === 'playing') {
      status = mine ? '🎲 ¡A jugar! Cuando terminéis, ¿quién ha ganado?' : '🎲 Jugando ahora mismo';
      if (t.disputes) status += ` <span class="tag moroso">${t.disputes} DESACUERDO${t.disputes > 1 ? 'S' : ''}</span>`;
      if (mine) {
        const picks = t.mode === 'teams' ? TEAMS : t.seats.map((s) => s.player);
        actions = picks.map((pk) => btn('report', `👑 ${t.mode === 'teams' ? 'Equipo ' + pk : (pk === myId ? 'Yo' : esc(MN.player(pk).name))}`, 'ghost win-btn', `data-pick="${esc(pk)}"`)).join('');
      }
    } else if (t.status === 'reported') {
      const lbl = `<b class="who">${esc(pickLabel(t, t.pick))}</b>`;
      if (mine && t.reportedBy === myId) {
        status = `⏳ Has dicho que ha ganado ${lbl}. Falta que otro jugador de la mesa lo confirme.`;
        actions = btn('unreport', 'Me he equivocado', 'ghost');
      } else if (mine) {
        status = `⚖️ <b class="who">${esc(MN.player(t.reportedBy).name)}</b> dice que ha ganado ${lbl}. ¿Es así?`;
        actions = btn('confirm', '✅ Confirmar', 'primary') + btn('dispute', '❌ No es así', 'ghost');
      } else {
        status = `⚖️ Dicen que ha ganado ${lbl}. Falta confirmación.`;
      }
    }

    if (admin && ACTIVE.includes(t.status) && !(appGame(t) && t.status === 'playing')) {
      const picks = t.mode === 'teams' ? TEAMS : t.seats.map((s) => s.player);
      actions += `<div class="admin-actions">🏦 ${t.status !== 'open' ? picks.map((pk) => btn('force', `Gana ${esc(t.mode === 'teams' ? 'equipo ' + pk : MN.player(pk).name)}`, 'mini-btn', `data-pick="${esc(pk)}"`)).join('') : ''}${btn('cancel', 'Cancelar', 'mini-btn danger-btn')}</div>`;
    }

    return `<li class="challenge table-card status-${t.status === 'open' ? 'pending' : t.status === 'playing' ? 'accepted' : 'reported'} ${mine && needsMe(t, myId) ? 'needs-me' : ''}">
      <div class="ch-head">${appGame(t) ? appGame(t).icon : '🃏'} <b>${esc(t.game)}</b>${appGame(t) ? '<span class="tag">EN LA APP</span>' : ''}${t.mode === 'teams' ? '<span class="tag">EQUIPOS</span>' : ''}<span class="ch-amount">${t.buyIn || '🎉'}</span></div>
      <div class="ch-sub">${t.buyIn ? `Entrada por cabeza · bote actual: <b>${pot}</b> fichas` : 'Por diversión (sin fichas)'} · abierta por ${esc(MN.player(t.createdBy).name)} ${MN.ago(t.createdAt)}</div>
      ${t.msg ? `<div class="table-msg">💬 “${esc(t.msg)}”</div>` : ''}
      <div class="seats">${seatsHtml(t)}</div>
      <div class="ch-status">${status}</div>
      ${actions ? `<div class="ch-actions">${actions}</div>` : ''}
    </li>`;
  }

  function renderForm() {
    const mine = MN.me();
    MN.$('#table-new').hidden = !mine || MN.ended();
    if (!mine) return;
    const g = MN.$('#t-game'); const gv = g.value;
    MN.$$('#t-kind [data-kind]').forEach((b) => b.classList.toggle('on', b.dataset.kind === kind));
    const app = MN.appGames ? MN.appGames.list().filter((x) => x.play) : [];
    g.innerHTML = kind === 'app' && app.length
      ? app.map((x) => `<option value="${MN.esc(x.id)}">${x.icon} ${MN.esc(x.name)}</option>`).join('')
      : (MN.S.settings.games || []).filter((x) => !/cron[oó]metro/i.test(x)).map((x) => `<option>${MN.esc(x)}</option>`).join('') + '<option value="__other">Otro…</option>';
    MN.$('#t-mode-wrap').hidden = kind === 'app';
    if (gv && [...g.options].some((o) => o.value === gv)) g.value = gv;
    MN.$('#t-game-other').hidden = g.value !== '__other';
    const max = MN.maxBetFor(MN.balances()[mine.id] || 0);
    MN.$('#t-max').innerHTML = `${max > 0 ? `Entrada máxima para ti: <b>${max}</b> fichas (tu límite de apuesta).` : 'Estás sin fichas: solo puedes abrir mesas por diversión.'} Con entrada 0 se juega por diversión.`;
    const b = MN.$('#t-buyin');
    if (b.value === '' || Number(b.value) > max) b.value = Math.min(max, Number(MN.S.settings.minBet) || 1);
    b.max = Math.max(1, max);
  }

  function render() {
    const mine = MN.me(); const myId = mine && mine.id; const admin = MN.isAdmin();
    const list = activeTables().slice().reverse().sort((a, b) => needsMe(b, myId) - needsMe(a, myId) || seated(b, myId) - seated(a, myId));
    MN.$('#tables-list').innerHTML = list.length ? list.map((t) => card(t, myId, admin)).join('')
      : '<li class="empty">No hay mesas abiertas. ¿Una partidita de póker?</li>';
    renderForm();
  }

  const openLine = (t) => `🃏 ${MN.esc(MN.player(t.createdBy).name)} abre una mesa de ${MN.esc(t.game)} (entrada ${t.buyIn})${t.msg ? `: «${MN.esc(t.msg)}»` : ''}. ¡Siéntate!`;

  // Avisos cuando otro jugador cambia una mesa en la que estoy sentado
  let prev = null;
  function onState() {
    const mine = MN.me(); const now = {};
    tables().forEach((t) => { now[t.id] = t.status; });
    autoResolve();
    // 🎨 Mesa de caza del color terminada: lista con las fotos de todos (una vez por móvil)
    if (mine && prev) tables().filter((t) => t.status === 'done' && prev[t.id] && prev[t.id] !== 'done' && t.appGame === 'color' && seated(t, mine.id)).forEach((t) => {
      const key = 'mn_cg_' + t.id;
      try { if (localStorage.getItem(key)) return; localStorage.setItem(key, '1'); } catch (e) { /* nada */ }
      const sc = (id) => (agMine(t, id) ? t['ag_' + id] : -Infinity);
      const items = t.seats.map((x) => x.player).sort((a, b) => sc(b) - sc(a)).map((pid) => Object.assign({ pid, label: agMine(t, pid) ? t['agl_' + pid] : 'No jugó' }, t['agx_' + pid] || {}));
      setTimeout(() => MN.appGames && MN.appGames.colorGallery(items, `Las fotos de la mesa (${t.seats.length})`), 1200);
    });
    // Mi mesa de Flappy acaba de empezar: la partida se abre sola
    if (mine) tables().filter((t) => t.status === 'playing' && t.appGame === 'flappy' && seated(t, mine.id) && (t.startAt || 0) > Date.now() - 60000)
      .forEach((t) => { if (document.visibilityState === 'visible') playFlappy(t); });
    if (prev && mine) {
      const msgs = [];
      // Mesa nueva: aviso a todos menos a quien la abre (mismo texto que la push del servidor)
      tables().filter((t) => !(t.id in prev) && t.status === 'open' && t.createdBy !== mine.id).forEach((t) => msgs.push(openLine(t)));
      tables().forEach((t) => {
        const before = prev[t.id];
        if (before === t.status || !seated(t, mine.id)) return;
        if (t.status === 'playing' && before === 'open' && t.createdBy !== mine.id) msgs.push(`🃏 La mesa de ${MN.esc(t.game)} ha empezado. ¡A jugar!`);
        else if (t.status === 'reported' && t.reportedBy !== mine.id) msgs.push(`⚖️ ${MN.esc(MN.player(t.reportedBy).name)} ha registrado quién ganó la mesa de ${MN.esc(t.game)}. Confírmalo.`);
        else if (t.status === 'done') msgs.push(`🃏 Mesa de ${MN.esc(t.game)} cerrada: gana ${MN.esc(pickLabel(t, t.pick))}`);
        else if (t.status === 'cancelled' && t.createdBy !== mine.id) msgs.push(`🚫 Se ha cerrado la mesa de ${MN.esc(t.game)}`);
      });
      if (msgs.length) MN.notify(msgs);
    }
    prev = now;
  }

  async function finish(t, pick, byBank, result) {
    const winners = winnersOf(t, pick);
    const { out, pot } = payouts(t, winners);
    const txId = 'table_' + t.id; const now = Date.now();
    return MN.act(async () => {
      await Store.put('txs', Object.assign({ id: txId, type: 'payout', kind: 'table', ts: now, tableId: t.id, game: t.game, mode: t.mode, pick, winners, pot, payouts: out },
        byBank ? { bank: 'resolved' } : {}, result != null ? { result: String(result) } : {}));
      await Store.update('tables', t.id, { status: 'done', pick, winners, txId, closedAt: now });
    }, `🃏 ${MN.esc(pickLabel(t, pick))} se lleva el bote de ${pot} fichas`);
  }

  let kind = 'app';

  // 📱 Jugar mi turno en una mesa de la app (no Flappy)
  async function playTurn(t, myId) {
    const res = await MN.appGames.play(t.appGame, t.id, {
      after: 'El ganador sale cuando hayan jugado todos.',
      onStart: () => Store.update('tables', t.id, { ['ags_' + myId]: Date.now() }).catch(() => {}),
      resume: agStarted(t, myId) ? (t['agp_' + myId] || { round: 0 }) : null,
      onProgress: (p) => Store.update('tables', t.id, { ['agp_' + myId]: p }).catch(() => {}),
    });
    if (!res) return;
    await MN.act(() => Store.update('tables', t.id, Object.assign({ ['ag_' + myId]: res.score, ['agl_' + myId]: res.label, ['agAt_' + myId]: Date.now() }, res.data ? { ['agx_' + myId]: res.data } : {})));
  }
  // 🐦 Flappy en tiempo real: al acabar, gana el último en caer
  function playFlappy(t) {
    if (!MN.flappyRoom || MN.flappyRoom.isPlaying(t.id)) return;
    const room = { id: t.id, seed: t.id, players: t.seats.map((x) => x.player), startAt: t.startAt || (t.startedAt + 4000), buyIn: t.buyIn };
    MN.flappyRoom.play(room, async (ranking) => {
      const cur = tables().find((x) => x.id === t.id) || t;
      if (cur.status !== 'playing') return;
      await Store.update('tables', t.id, { flappy: ranking.map((x) => ({ id: x.id, score: x.score })) }).catch(() => {});
      await finish(cur, ranking[0].id, false, ranking[0].score);
    });
  }
  // Cuando todos han jugado su turno, la mesa se resuelve sola (gana la puntuación más alta)
  const resolving = new Set();
  function autoResolve() {
    const mine = MN.me(); if (!mine && !MN.isAdmin()) return;
    tables().filter((t) => t.status === 'playing' && t.appGame && t.appGame !== 'flappy' && t.seats.every((x) => agOver(t, x.player)))
      .filter((t) => MN.isAdmin() || seated(t, mine.id))
      .forEach((t) => {
        if (resolving.has(t.id) || MN.S.txs.some((x) => x.id === 'table_' + t.id)) return;
        resolving.add(t.id);
        const sc = (id) => (agMine(t, id) ? t['ag_' + id] : -Infinity);
        const best = t.seats.map((x) => x.player).sort((a, b) => sc(b) - sc(a) || (t['agAt_' + a] || 0) - (t['agAt_' + b] || 0))[0];
        finish(t, best, false, t['agl_' + best]);
      });
  }

  let busy = false;
  async function action(e) {
    const b = e.target.closest('[data-tact]'); if (!b || busy) return;
    const t = tables().find((x) => x.id === b.dataset.id); if (!t) return;
    const mine = MN.me(); const myId = mine && mine.id; const now = Date.now();
    const pick = b.dataset.pick;
    busy = true;
    try {
      switch (b.dataset.tact) {
        case 'join': {
          if (!myId || seated(t, myId)) return;
          if (t.buyIn > (MN.balances()[myId] || 0)) return MN.toast('No tienes fichas suficientes para la entrada', 'bad');
          await MN.act(() => Store.update('tables', t.id, { seats: [...t.seats, { player: myId, team: b.dataset.team || null }] }), '🪑 Te has sentado a la mesa');
          break;
        }
        case 'leave':
          await MN.act(() => Store.update('tables', t.id, { seats: t.seats.filter((s) => s.player !== myId) }), 'Te has levantado de la mesa');
          break;
        case 'start':
          await MN.act(() => Store.update('tables', t.id, Object.assign({ status: 'playing', startedAt: now }, t.appGame === 'flappy' ? { startAt: now + 5000 } : {})), '🎲 ¡Que empiece la partida!');
          break;
        case 'agplay':
          if (t.status === 'playing' && seated(t, myId) && !agMine(t, myId)) await playTurn(t, myId);
          break;
        case 'flappy':
          playFlappy(t);
          break;
        case 'cancel':
          if (!await MN.modal('<div class="modal-icon">🚫</div><p class="modal-text">¿Cerrar esta mesa? Nadie pierde fichas.</p>', 'Cerrar mesa')) return;
          await MN.act(() => Store.update('tables', t.id, { status: 'cancelled', closedAt: now, cancelledBy: myId || 'banca' }), 'Mesa cerrada');
          break;
        case 'report': {
          const ok = await MN.modal(`<div class="modal-icon">👑</div><p class="modal-text">¿Ha ganado <b>${MN.esc(pickLabel(t, pick))}</b>?</p>
            <p class="hint center">Otro jugador de la mesa tendrá que confirmarlo.</p>`, 'Sí');
          if (!ok) return;
          await MN.act(() => Store.update('tables', t.id, { status: 'reported', pick, reportedBy: myId, reportedAt: now, disputedBy: null }), 'Resultado enviado. Falta una confirmación.');
          break;
        }
        case 'unreport':
          await MN.act(() => Store.update('tables', t.id, { status: 'playing', pick: null, reportedBy: null }));
          break;
        case 'dispute':
          await MN.act(() => Store.update('tables', t.id, { status: 'playing', pick: null, reportedBy: null, disputes: (t.disputes || 0) + 1, disputedBy: myId }),
            (t.disputes || 0) >= 1 ? '⚠️ Otro desacuerdo… que decida la Banca' : 'Resultado rechazado. Volved a registrarlo.');
          break;
        case 'confirm':
          await finish(t, t.pick, false);
          break;
        case 'force': {
          const ok = await MN.modal(`<div class="modal-icon">🏦</div><p class="modal-text">La Banca decide: gana <b>${MN.esc(pickLabel(t, pick))}</b></p>`, 'Resolver');
          if (ok) await finish(t, pick, true);
          break;
        }
      }
    } finally { busy = false; }
  }

  return {
    init(api) {
      MN = api;
      MN.registerTx('table', {
        line(t) {
          const label = t.mode === 'teams' ? `El <b>equipo ${MN.esc(t.pick)}</b> (${t.winners.map((id) => MN.who(id)).join(', ')})` : MN.who(t.winners[0]);
          return {
            icon: '🃏',
            text: `${label} gana la mesa de <b>${MN.esc(t.game)}</b> y se lleva <b>${t.pot}</b> fichas`,
            sub: `${Object.keys(t.payouts).length} jugadores` + (t.bank === 'resolved' ? ' · 🏦 decidido por la Banca' : ''),
          };
        },
      });
      MN.$('#tables-list').addEventListener('click', action);
      MN.$('#t-game').addEventListener('change', () => { MN.$('#t-game-other').hidden = MN.$('#t-game').value !== '__other'; });
      MN.$('#t-kind').addEventListener('click', (e) => { const b = e.target.closest('[data-kind]'); if (!b) return; kind = b.dataset.kind; MN.$('#t-game').value = ''; renderForm(); });
      MN.$('#table-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const mine = MN.me(); if (!mine) return;
        const buyIn = parseInt(MN.$('#t-buyin').value, 10);
        const max = MN.maxBetFor(MN.balances()[mine.id] || 0);
        if (MN.ended()) return MN.toast('🏁 La partida ha terminado', 'bad');
        if (Number.isNaN(buyIn) || buyIn < 0 || buyIn > Math.max(0, max)) return MN.toast(`La entrada debe estar entre 0 y ${Math.max(0, max)}`, 'bad');
        let game = MN.$('#t-game').value; let ag = null;
        if (kind === 'app') { ag = game; game = MN.appGames.GAMES[ag].name; } else if (game === '__other') game = MN.$('#t-game-other').value.trim() || 'Juego misterioso';
        const mode = kind === 'app' ? 'solo' : MN.$('#t-mode').value;
        const msg = MN.$('#t-msg').value.trim().slice(0, 100);
        const t = Object.assign({ id: Store.uid(), game, buyIn, mode, createdBy: mine.id, createdAt: Date.now(), status: 'open', seats: [{ player: mine.id, team: mode === 'teams' ? 'A' : null }] }, msg ? { msg } : {}, ag ? { appGame: ag } : {});
        const done = await MN.act(() => Store.put('tables', t), `🃏 Mesa de ${MN.esc(game)} abierta. ¡Que se sienten!`);
        if (done) { MN.$('#table-new').open = false; MN.$('#t-game-other').value = ''; MN.$('#t-msg').value = ''; }
      });
    },
    render,
    onState,
    duelBadge() { const m = MN.me(); return m ? activeTables().filter((t) => needsMe(t, m.id)).length : 0; },
  };
})());
