(function () {
  'use strict';

  // ============================================================
  //  UTILIDADES
  // ============================================================
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pad = (n) => String(n).padStart(2, '0');
  const hash = (s) => [...String(s)].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 0);
  const lines = (txt) => txt.split('\n').map((l) => l.trim()).filter(Boolean);

  const EMOJIS = ['🦊', '🐺', '🦁', '🐯', '🐸', '🐙', '🦈', '🐍', '🦉', '🐗', '🦝', '🐻', '🐼', '🐲', '🤠', '🧛', '🥷', '🎩', '🦄', '🐓'];
  const MEDALS = ['🥇', '🥈', '🥉'];
  const randomEmoji = () => EMOJIS[Math.floor(Math.random() * EMOJIS.length)];
  const shuffle = (arr) => { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; };
  const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sin 0/O ni 1/I para no confundir
  const newCode = () => Array.from({ length: 4 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');

  let S = null;            // estado: { players, txs, settings }
  let view = 'ranking';
  let winner = null;       // ganador elegido en el formulario de duelo
  let prevBal = {};        // para animar cambios de saldo
  let wasEnded = null;
  let adminMem = false;
  let spectatorMem = false;
  let deviceMem = null;
  let regEmoji = null;     // avatar elegido en el registro
  let profileEmoji = null; // avatar elegido al editar el perfil

  // ------------------------------------------------------------
  //  Identidad del dispositivo
  //  Los navegadores no permiten leer la MAC, así que la primera vez
  //  generamos un identificador aleatorio y lo guardamos en el navegador.
  //  Cada jugador guarda la lista de dispositivos vinculados (deviceIds).
  // ------------------------------------------------------------
  function deviceId() {
    try {
      let id = localStorage.getItem('mn_device');
      if (!id) { id = 'dev_' + Store.uid() + Store.uid(); localStorage.setItem('mn_device', id); }
      return id;
    } catch (e) {
      return deviceMem || (deviceMem = 'dev_' + Store.uid() + Store.uid());
    }
  }
  const me = () => S && S.players.find((p) => (p.deviceIds || []).includes(deviceId()));

  function isSpectator() {
    try { return sessionStorage.getItem('mn_spectator') === '1' || spectatorMem; } catch (e) { return spectatorMem; }
  }
  function setSpectator(v) {
    spectatorMem = v;
    try { v ? sessionStorage.setItem('mn_spectator', '1') : sessionStorage.removeItem('mn_spectator'); } catch (e) { /* nada */ }
  }

  const nameTaken = (name, exceptId) => S.players.some((p) => p.id !== exceptId && p.name.toLowerCase() === name.toLowerCase());

  function renderEmojiGrid(el, selected) {
    const list = EMOJIS.includes(selected) || !selected ? EMOJIS : [selected, ...EMOJIS];
    el.innerHTML = list.map((e) => `<button type="button" data-emoji="${esc(e)}" class="${e === selected ? 'selected' : ''}">${esc(e)}</button>`).join('');
  }

  function isAdmin() {
    try { return sessionStorage.getItem('mn_admin') === '1' || adminMem; } catch (e) { return adminMem; }
  }
  function setAdmin(v) {
    adminMem = v;
    try { v ? sessionStorage.setItem('mn_admin', '1') : sessionStorage.removeItem('mn_admin'); } catch (e) { /* nada */ }
  }

  const fmtDate = (ts) => new Date(ts).toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  function ago(ts) {
    const s = (Date.now() - ts) / 1000;
    if (s < 60) return 'ahora mismo';
    if (s < 3600) return `hace ${Math.floor(s / 60)} min`;
    if (s < 86400) return `hace ${Math.floor(s / 3600)} h`;
    return fmtDate(ts);
  }

  // ============================================================
  //  LÓGICA DEL JUEGO
  // ============================================================
  const player = (id) => S.players.find((p) => p.id === id) || { name: '¿?', emoji: '❓' };
  const who = (id) => { const p = player(id); return `<b class="who">${esc(p.emoji)} ${esc(p.name)}</b>`; };

  function effects(t) {
    switch (t.type) {
      case 'init': case 'loan': case 'adjust': return [[t.player, t.amount]];
      case 'duel': return [[t.winner, t.amount], [t.loser, -t.amount]];
      default: return [];
    }
  }

  function balances() {
    const b = {};
    S.players.forEach((p) => { b[p.id] = 0; });
    S.txs.forEach((t) => { if (!t.voided) effects(t).forEach(([id, d]) => { b[id] = (b[id] || 0) + d; }); });
    return b;
  }

  function todayDeltas() {
    const start = new Date(); start.setHours(0, 0, 0, 0);
    const d = {};
    S.txs.forEach((t) => {
      if (t.voided || t.type === 'init' || t.ts < start.getTime()) return;
      effects(t).forEach(([id, x]) => { d[id] = (d[id] || 0) + x; });
    });
    return d;
  }

  const dayStart = (str) => new Date(str + 'T00:00').getTime();
  const schedule = () => (S.settings.limitSchedule || []).slice().sort((a, b) => (a.from < b.from ? -1 : 1));
  function currentPct() {
    const sc = schedule(); const now = Date.now();
    let pct = sc.length ? sc[0].pct : 10;
    sc.forEach((s) => { if (dayStart(s.from) <= now) pct = s.pct; });
    return pct;
  }
  const nextChange = () => schedule().find((s) => dayStart(s.from) > Date.now());

  function maxBetFor(capital) {
    if (capital <= 0) return 0;
    const byPct = Math.floor((capital * currentPct()) / 100);
    return Math.min(capital, Math.max(Number(S.settings.minBet) || 1, byPct));
  }

  const endTs = () => new Date(S.settings.endDate).getTime();
  const ended = () => Date.now() >= endTs();
  const pendingPunishments = () => S.txs.filter((t) => t.type === 'loan' && !t.voided && !t.done);

  const pairMax = (a, b, bal = balances()) => Math.min(maxBetFor(bal[a] || 0), maxBetFor(bal[b] || 0));

  // ------------------------------------------------------------
  //  Retos: pending → accepted → reported → done
  //         (o rejected / cancelled). "reported" vuelve a "accepted"
  //         si el rival no está de acuerdo con el resultado.
  // ------------------------------------------------------------
  const ACTIVE = ['pending', 'accepted', 'reported'];
  const activeChallenges = () => S.challenges.filter((c) => ACTIVE.includes(c.status));
  const activeBetween = (a, b) => activeChallenges().find((c) => (c.from === a && c.to === b) || (c.from === b && c.to === a));
  const rivalOf = (c, id) => (c.from === id ? c.to : c.from);
  // ¿Este reto espera una acción mía?
  const needsMe = (c, myId) => (c.status === 'pending' && c.to === myId) || (c.status === 'reported' && c.reportedBy !== myId && (c.from === myId || c.to === myId));

  function sortedPlayers(bal) {
    return [...S.players].sort((a, b) => bal[b.id] - bal[a.id] || a.name.localeCompare(b.name));
  }

  function playerStats(id) {
    const duels = S.txs.filter((t) => t.type === 'duel' && !t.voided && (t.winner === id || t.loser === id));
    const won = duels.filter((t) => t.winner === id);
    // Racha: victorias o derrotas seguidas contando desde el último duelo
    let streak = 0; let streakWin = null;
    for (let i = duels.length - 1; i >= 0; i--) {
      const w = duels[i].winner === id;
      if (streakWin === null) streakWin = w;
      if (w !== streakWin) break;
      streak++;
    }
    // Balance neto contra cada rival
    const vs = {};
    duels.forEach((t) => {
      const opp = t.winner === id ? t.loser : t.winner;
      vs[opp] = (vs[opp] || 0) + (t.winner === id ? t.amount : -t.amount);
    });
    const entries = Object.entries(vs);
    const nemesis = entries.filter(([, v]) => v < 0).sort((a, b) => a[1] - b[1])[0];
    const victim = entries.filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1])[0];
    const best = won.reduce((m, t) => (t.amount > (m ? m.amount : 0) ? t : m), null);
    return { total: duels.length, won: won.length, lost: duels.length - won.length, streak, streakWin, nemesis, victim, best };
  }

  const DUEL_LINES = [
    (w, l, n) => `${w} le gana <b>${n}</b> fichas a ${l}`,
    (w, l, n) => `${w} despluma a ${l}: <b>${n}</b> fichas`,
    (w, l, n) => `${w} le limpia <b>${n}</b> fichas a ${l}`,
    (w, l, n) => `${l} pierde <b>${n}</b> fichas contra ${w}`,
    (w, l, n) => `${w} humilla a ${l} y se lleva <b>${n}</b> fichas`,
  ];

  function txLine(t) {
    switch (t.type) {
      case 'duel':
        return { icon: '⚔️', text: DUEL_LINES[Math.abs(hash(t.id)) % DUEL_LINES.length](who(t.winner), who(t.loser), t.amount), sub: esc(t.game) };
      case 'loan':
        return { icon: '🏦', text: `La Banca presta <b>${t.amount}</b> fichas a ${who(t.player)}`, sub: `Castigo: ${esc(t.punishment)} · ${t.done ? '✅ cumplido' : '⏳ pendiente'}` };
      case 'adjust':
        return { icon: '✏️', text: `Ajuste de la Banca: <b>${t.amount > 0 ? '+' : ''}${t.amount}</b> a ${who(t.player)}`, sub: esc(t.reason || '') };
      case 'init':
        return { icon: '🪑', text: `${who(t.player)} se sienta a la mesa con <b>${t.amount}</b> fichas`, sub: '' };
      default:
        return { icon: '❔', text: 'Movimiento desconocido', sub: '' };
    }
  }

  // ============================================================
  //  UI GENÉRICA: modal, toast, navegación
  // ============================================================
  function modal(html, okLabel = 'Confirmar') {
    const m = $('#modal');
    $('#modal-body').innerHTML = html;
    $('#modal-ok').textContent = okLabel;
    m.hidden = false;
    const first = $('input, select, textarea', m);
    if (first) setTimeout(() => first.focus(), 30);
    return new Promise((resolve) => {
      const close = (val) => {
        m.hidden = true;
        $('#modal-form').onsubmit = null; $('#modal-cancel').onclick = null; m.onclick = null;
        resolve(val);
      };
      $('#modal-form').onsubmit = (e) => {
        e.preventDefault();
        const out = {};
        $$('[name]', m).forEach((el) => { out[el.name] = el.value; });
        close(out);
      };
      $('#modal-cancel').onclick = () => close(null);
      m.onclick = (e) => { if (e.target === m) close(null); };
    });
  }

  let toastTimer;
  function toast(msg, kind = '') {
    const t = $('#toast');
    t.innerHTML = msg; t.className = 'toast show ' + kind;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.className = 'toast'; }, 3200);
  }

  async function act(fn, okMsg) {
    try { await fn(); if (okMsg) toast(okMsg, 'ok'); return true; } catch (e) {
      console.error(e); toast('❌ Error al guardar: ' + esc(e.message || e), 'bad'); return false;
    }
  }

  function go(v) {
    view = v;
    $$('.view').forEach((el) => { el.hidden = el.id !== 'view-' + v; });
    $$('.tabs button').forEach((b) => b.classList.toggle('active', b.dataset.view === v));
    if (v === 'banca' && isAdmin()) fillSettingsForm();
    if (v === 'perfil') fillProfileForm();
    try { localStorage.setItem('mn_view', v); } catch (e) { /* nada */ }
    window.scrollTo(0, 0);
  }

  // ============================================================
  //  RENDER: RANKING
  // ============================================================
  function renderRanking() {
    const bal = balances();
    const today = todayDeltas();
    const morosos = new Set(pendingPunishments().map((t) => t.player));
    const sorted = sortedPlayers(bal);
    const isEnd = ended();
    const mine = me();

    const next = nextChange();
    $('#limit-info').innerHTML = isEnd ? '' :
      `🎯 Apuesta máxima: <b>${currentPct()}%</b> del capital <span class="muted">(mín. ${esc(S.settings.minBet)})</span>` +
      (next ? ` · <span class="muted">sube al ${esc(next.pct)}% el ${new Date(next.from + 'T00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}</span>` : '');

    $('#final-banner').innerHTML = isEnd && sorted.length ?
      `<div class="final"><div class="final-crown">👑</div><div>La mesa está cerrada.<br>Gana <b>${esc(sorted[0].emoji)} ${esc(sorted[0].name)}</b> con <b>${bal[sorted[0].id]}</b> fichas</div></div>` : '';

    if (!sorted.length) {
      $('#ranking-list').innerHTML = `<li class="empty">La Banca aún no ha sentado a nadie en la mesa.<br>Añade jugadores desde <b>🏦 Banca</b>.</li>`;
      $('#ranking-stats').innerHTML = '';
      return;
    }

    let pos = 0; let lastBal = null;
    $('#ranking-list').innerHTML = sorted.map((p, i) => {
      if (bal[p.id] !== lastBal) { pos = i; lastBal = bal[p.id]; } // empates comparten puesto
      const d = today[p.id] || 0;
      const prev = prevBal[p.id];
      const flash = prev === undefined || prev === bal[p.id] ? '' : (bal[p.id] > prev ? 'flash-up' : 'flash-down');
      return `
        <li class="rank-row pos-${pos + 1} ${bal[p.id] <= 0 ? 'broke' : ''} ${mine && mine.id === p.id ? 'is-me' : ''}">
          <div class="pos">${pos < 3 ? MEDALS[pos] : '#' + (pos + 1)}</div>
          <div class="avatar">${esc(p.emoji)}</div>
          <div class="info">
            <div class="name">${esc(p.name)} ${mine && mine.id === p.id ? '<span class="tag me-tag">TÚ</span>' : ''}${morosos.has(p.id) ? '<span class="tag moroso">MOROSO</span>' : ''}${bal[p.id] <= 0 ? '<span class="tag broke-tag">EN BANCARROTA</span>' : ''}</div>
            <div class="sub">${isEnd ? '' : `Apuesta máx.: ${maxBetFor(bal[p.id])}`}</div>
          </div>
          <div class="chips ${flash}">
            <div class="amount">${bal[p.id]}</div>
            <div class="delta ${d > 0 ? 'up' : d < 0 ? 'down' : ''}">${d > 0 ? '▲ ' + d : d < 0 ? '▼ ' + -d : '—'} <span>hoy</span></div>
          </div>
        </li>`;
    }).join('');
    prevBal = bal;

    const duels = S.txs.filter((t) => t.type === 'duel' && !t.voided);
    const total = Object.values(bal).reduce((a, b) => a + b, 0);
    const biggest = duels.reduce((m, t) => (t.amount > (m ? m.amount : 0) ? t : m), null);
    $('#ranking-stats').innerHTML = `
      <div class="stat"><b>${total}</b><span>fichas en juego</span></div>
      <div class="stat"><b>${duels.length}</b><span>duelos</span></div>
      <div class="stat"><b>${biggest ? biggest.amount : 0}</b><span>mayor golpe${biggest ? ' · ' + esc(player(biggest.winner).name) : ''}</span></div>`;
  }

  // ============================================================
  //  RENDER: DUELO
  // ============================================================
  function fillPlayerSelect(sel, placeholder, bal) {
    const v = sel.value;
    sel.innerHTML = `<option value="">${placeholder}</option>` +
      S.players.map((p) => `<option value="${esc(p.id)}">${esc(p.emoji)} ${esc(p.name)}${bal ? ' · ' + bal[p.id] : ''}</option>`).join('');
    if (S.players.some((p) => p.id === v)) sel.value = v;
  }

  function renderDuelForm() {
    fillPlayerSelect($('#d-a'), 'Elegir…');
    fillPlayerSelect($('#d-b'), 'Elegir…');
    const mine = me();
    if (mine && !$('#d-a').value && $('#d-b').value !== mine.id) $('#d-a').value = mine.id;
    const g = $('#d-game'); const gv = g.value;
    g.innerHTML = (S.settings.games || []).map((x) => `<option>${esc(x)}</option>`).join('') + '<option value="__other">Otro…</option>';
    if (gv && [...g.options].some((o) => o.value === gv)) g.value = gv;
    $('#d-game-other').hidden = g.value !== '__other';
    updateDuel();
  }

  function updateDuel() {
    const a = $('#d-a').value; const b = $('#d-b').value;
    const bal = balances();
    const bet = $('#d-bet'); const range = $('#d-bet-range');
    let max = 0; let msg;

    if (ended()) msg = '🏁 La partida ha terminado. No se aceptan más apuestas.';
    else if (!a || !b) msg = 'Elige a los dos jugadores para ver la apuesta máxima.';
    else if (a === b) msg = 'Uno no puede retarse a sí mismo… 🤨';
    else {
      const ma = maxBetFor(bal[a]); const mb = maxBetFor(bal[b]);
      max = Math.min(ma, mb);
      if (max <= 0) msg = `<b>${esc(player(ma <= 0 ? a : b).name)}</b> está en bancarrota: que pase por la Banca 🏦`;
      else msg = `Máximo <b>${max}</b> fichas <span class="muted">(${currentPct()}% del capital del más pobre, mín. ${esc(S.settings.minBet)})</span>`;
      msg += `<br><span class="muted">${esc(player(a).name)}: ${bal[a]} · ${esc(player(b).name)}: ${bal[b]}</span>`;
    }
    $('#d-max').innerHTML = msg;

    range.max = Math.max(1, max);
    bet.max = Math.max(1, max);
    const cur = parseInt(bet.value, 10);
    if (max > 0 && (!cur || cur > max)) bet.value = Math.min(max, Number(S.settings.minBet) || 1);
    range.value = bet.value || 1;
    range.disabled = bet.disabled = max <= 0;

    if (winner && winner !== a && winner !== b) winner = null;
    const pick = $('#d-winner');
    if (a && b && a !== b) {
      pick.innerHTML = [a, b].map((id) => {
        const p = player(id);
        return `<button type="button" data-win="${esc(id)}" class="${winner === id ? 'selected' : ''}">
          <span class="crown">👑</span><span class="emoji">${esc(p.emoji)}</span>${esc(p.name)}</button>`;
      }).join('');
    } else {
      pick.innerHTML = '<p class="hint">Primero elige a los jugadores.</p>';
    }
    $('#d-submit').disabled = max <= 0 || !winner;
  }

  async function submitDuel(e) {
    e.preventDefault();
    const a = $('#d-a').value; const b = $('#d-b').value;
    const amount = parseInt($('#d-bet').value, 10);
    const bal = balances();
    const max = Math.min(maxBetFor(bal[a]), maxBetFor(bal[b]));
    if (ended()) return toast('🏁 La partida ha terminado', 'bad');
    if (!a || !b || a === b) return toast('Elige a dos jugadores distintos', 'bad');
    if (!amount || amount < 1 || amount > max) return toast(`La apuesta debe estar entre 1 y ${max}`, 'bad');
    if (!winner) return toast('¿Quién ha ganado?', 'bad');

    let game = $('#d-game').value;
    if (game === '__other') game = $('#d-game-other').value.trim() || 'Minijuego misterioso';
    const loser = winner === a ? b : a;

    const ok = await modal(`
      <div class="modal-icon">⚔️</div>
      <p class="modal-text">${who(winner)} le gana <b>${amount}</b> fichas a ${who(loser)}</p>
      <p class="hint center">${esc(game)}</p>`, 'Confirmar');
    if (!ok) return;

    const done = await act(() => Store.addTx({
      id: Store.uid(), type: 'duel', ts: Date.now(), challenger: a, winner, loser, amount, game,
    }), `💰 ${esc(player(winner).name)} se lleva ${amount} fichas`);
    if (done) {
      winner = null;
      $('#d-bet').value = '';
      go('ranking');
    }
  }

  // ============================================================
  //  RENDER: RETOS
  // ============================================================
  function renderChallengeForm() {
    const mine = me();
    $('#challenge-noreg').hidden = !!mine;
    $('#challenge-form').hidden = !mine;
    $('#direct-duel').hidden = !isAdmin();
    if (!mine) return;

    const sel = $('#c-rival'); const v = sel.value;
    sel.innerHTML = '<option value="">Elegir rival…</option>' + S.players.filter((p) => p.id !== mine.id)
      .map((p) => `<option value="${esc(p.id)}">${esc(p.emoji)} ${esc(p.name)}</option>`).join('');
    if ([...sel.options].some((o) => o.value === v)) sel.value = v;

    const g = $('#c-game'); const gv = g.value;
    g.innerHTML = (S.settings.games || []).map((x) => `<option>${esc(x)}</option>`).join('') + '<option value="__other">Otro…</option>';
    if (gv && [...g.options].some((o) => o.value === gv)) g.value = gv;
    $('#c-game-other').hidden = g.value !== '__other';
    updateChallengeForm();
  }

  function updateChallengeForm() {
    const mine = me(); if (!mine) return;
    const rival = $('#c-rival').value;
    const bal = balances();
    const bet = $('#c-bet'); const range = $('#c-bet-range');
    let max = 0; let msg;
    if (ended()) msg = '🏁 La partida ha terminado. No se aceptan más retos.';
    else if (!rival) msg = 'Elige a tu víctima para ver la apuesta máxima.';
    else if (activeBetween(mine.id, rival)) msg = `Ya tienes un reto abierto con <b>${esc(player(rival).name)}</b>. Terminadlo primero.`;
    else {
      max = pairMax(mine.id, rival, bal);
      if (max <= 0) msg = bal[mine.id] <= 0 ? 'Estás en bancarrota: pásate por la Banca 🏦' : `<b>${esc(player(rival).name)}</b> está en bancarrota.`;
      else msg = `Máximo <b>${max}</b> fichas <span class="muted">(${currentPct()}% del capital del más pobre)</span><br><span class="muted">Tú: ${bal[mine.id]} · ${esc(player(rival).name)}: ${bal[rival]}</span>`;
    }
    $('#c-max').innerHTML = msg;
    range.max = Math.max(1, max); bet.max = Math.max(1, max);
    const cur = parseInt(bet.value, 10);
    if (max > 0 && (!cur || cur > max)) bet.value = Math.min(max, Number(S.settings.minBet) || 1);
    range.value = bet.value || 1;
    range.disabled = bet.disabled = max <= 0;
    $('#c-submit').disabled = max <= 0;
  }

  function challengeCard(c, myId, admin) {
    const from = who(c.from); const to = who(c.to);
    const mineC = myId && (c.from === myId || c.to === myId);
    const rival = mineC ? player(rivalOf(c, myId)) : null;
    const btn = (act, label, cls = '', extra = '') => `<button class="btn ${cls}" data-act="${act}" data-id="${esc(c.id)}" ${extra}>${label}</button>`;
    let status = ''; let actions = '';

    if (c.status === 'pending') {
      if (mineC && c.to === myId) {
        status = `🔔 <b class="who">${esc(rival.name)}</b> te reta. ¿Aceptas?`;
        actions = btn('accept', '✅ Aceptar', 'primary') + btn('reject', '🐔 Rechazar', 'ghost');
      } else if (mineC) {
        status = `⏳ Esperando respuesta de <b class="who">${esc(rival.name)}</b>…`;
        actions = btn('cancel', 'Cancelar reto', 'ghost');
      } else {
        status = '⏳ Pendiente de respuesta… ¿se acobardará?';
      }
    } else if (c.status === 'accepted') {
      status = mineC ? '🎲 ¡A jugar! Cuando terminéis, ¿quién ha ganado?' : '🎲 Jugando ahora mismo';
      if (c.disputes) status += ` <span class="tag moroso">${c.disputes} DESACUERDO${c.disputes > 1 ? 'S' : ''}</span>`;
      if (mineC) {
        actions = [c.from, c.to].map((id) => btn('report', `👑 ${id === myId ? 'Yo' : esc(player(id).name)}`, 'ghost win-btn', `data-winner="${esc(id)}"`)).join('');
      }
    } else if (c.status === 'reported') {
      const w = `<b class="who">${esc(player(c.winner).name)}</b>`;
      if (mineC && c.reportedBy === myId) {
        status = `⏳ Has dicho que ${c.winner === myId ? 'has ganado <b class="who">tú</b>' : `ha ganado ${w}`}. Esperando a que ${esc(rival.name)} lo confirme.`;
        actions = btn('unreport', 'Me he equivocado', 'ghost');
      } else if (mineC) {
        status = `⚖️ <b class="who">${esc(rival.name)}</b> dice que ${c.winner === myId ? 'has ganado <b class="who">tú</b>' : 'te ha ganado'}. ¿Es así?`;
        actions = btn('confirm', '✅ Confirmar', 'primary') + btn('dispute', '❌ No es así', 'ghost');
      } else {
        status = `⚖️ ${esc(player(c.reportedBy).name)} dice que ha ganado ${w}. Falta confirmación.`;
      }
    }

    // La Banca puede resolver o cancelar cualquier reto activo
    if (admin && ACTIVE.includes(c.status)) {
      actions += `<div class="admin-actions">🏦 ${[c.from, c.to].map((id) => btn('force', `Gana ${esc(player(id).name)}`, 'mini-btn', `data-winner="${esc(id)}"`)).join('')}${btn('cancel', 'Cancelar', 'mini-btn danger-btn')}</div>`;
    }

    return `<li class="challenge status-${c.status} ${mineC && needsMe(c, myId) ? 'needs-me' : ''}">
      <div class="ch-head">${from}<span class="ch-vs">VS</span>${to}<span class="ch-amount">${c.amount}</span></div>
      <div class="ch-sub">${esc(c.game)} · <time title="${fmtDate(c.createdAt)}">${ago(c.createdAt)}</time></div>
      <div class="ch-status">${status}</div>
      ${actions ? `<div class="ch-actions">${actions}</div>` : ''}
    </li>`;
  }

  function renderChallenges() {
    const mine = me(); const myId = mine && mine.id; const admin = isAdmin();
    const list = activeChallenges().slice().reverse();
    const mineList = myId ? list.filter((c) => c.from === myId || c.to === myId)
      .sort((a, b) => needsMe(b, myId) - needsMe(a, myId)) : [];
    const others = list.filter((c) => !mineList.includes(c));

    $('#my-challenges-wrap').hidden = !mineList.length;
    $('#my-challenges').innerHTML = mineList.map((c) => challengeCard(c, myId, admin)).join('');
    $('#live-challenges').innerHTML = others.length ? others.map((c) => challengeCard(c, myId, admin)).join('')
      : '<li class="empty">Nadie se está jugando nada ahora mismo. Qué aburrimiento…</li>';

    const n = myId ? list.filter((c) => needsMe(c, myId)).length : 0;
    $('#duel-badge').hidden = !n;
    $('#duel-badge').textContent = n;
  }

  // Avisos cuando otro jugador cambia un reto en el que participo
  let prevCh = null;
  function notifyChallenges() {
    const mine = me();
    const now = {};
    S.challenges.forEach((c) => { now[c.id] = c.status; });
    if (prevCh && mine) {
      const id = mine.id; const msgs = [];
      S.challenges.forEach((c) => {
        const before = prevCh[c.id];
        if (before === c.status || (c.from !== id && c.to !== id)) return;
        const r = esc(player(rivalOf(c, id)).name);
        if (!before && c.status === 'pending' && c.to === id) msgs.push(`⚔️ ${r} te reta a ${esc(c.game)} por ${c.amount} fichas`);
        else if (before === 'pending' && c.status === 'accepted' && c.from === id) msgs.push(`✅ ${r} ha aceptado tu reto. ¡A jugar!`);
        else if (c.status === 'rejected' && c.from === id) msgs.push(`🐔 ${r} ha rechazado tu reto`);
        else if (c.status === 'cancelled' && c.cancelledBy !== id) msgs.push(`🚫 Se ha cancelado el reto con ${r}`);
        else if (c.status === 'reported' && c.reportedBy !== id) msgs.push(`⚖️ ${r} ha registrado el resultado. Confírmalo.`);
        else if (c.status === 'done' && c.reportedBy === id) msgs.push(`💰 ${r} ha confirmado el resultado`);
        else if (before === 'reported' && c.status === 'accepted' && c.disputedBy && c.disputedBy !== id) msgs.push(`❌ ${r} no está de acuerdo con el resultado`);
      });
      if (msgs.length) {
        toast(msgs.join('<br>'), 'ok');
        try { if (navigator.vibrate) navigator.vibrate([120, 60, 120]); } catch (e) { /* nada */ }
      }
    }
    prevCh = now;
  }

  let busy = false;
  async function challengeAction(e) {
    const b = e.target.closest('[data-act]'); if (!b || busy) return;
    const c = S.challenges.find((x) => x.id === b.dataset.id); if (!c) return;
    const mine = me(); const myId = mine && mine.id;
    const winnerId = b.dataset.winner;
    const now = Date.now();
    busy = true;
    try {
      switch (b.dataset.act) {
        case 'accept': {
          if (ended()) return toast('🏁 La partida ha terminado', 'bad');
          const max = pairMax(c.from, c.to);
          if (max <= 0) return toast('Alguno de los dos está en bancarrota', 'bad');
          const amount = Math.min(c.amount, max);
          await act(() => Store.updateChallenge(c.id, { status: 'accepted', amount, acceptedAt: now }),
            amount < c.amount ? `Aceptado, pero la apuesta baja a ${amount} (el máximo actual)` : '✅ Reto aceptado. ¡A jugar!');
          break;
        }
        case 'reject':
          await act(() => Store.updateChallenge(c.id, { status: 'rejected', closedAt: now }), '🐔 Reto rechazado');
          break;
        case 'cancel':
          if (!await modal('<div class="modal-icon">🚫</div><p class="modal-text">¿Cancelar este reto?</p>', 'Cancelar reto')) return;
          await act(() => Store.updateChallenge(c.id, { status: 'cancelled', cancelledBy: myId || 'banca', closedAt: now }), 'Reto cancelado');
          break;
        case 'report': {
          const ok = await modal(`<div class="modal-icon">👑</div><p class="modal-text">¿Ha ganado ${who(winnerId)}?</p>
            <p class="hint center">${esc(player(rivalOf(c, myId)).name)} tendrá que confirmarlo.</p>`, 'Sí');
          if (!ok) return;
          await act(() => Store.updateChallenge(c.id, { status: 'reported', winner: winnerId, reportedBy: myId, reportedAt: now }), 'Resultado enviado. Falta que lo confirme tu rival.');
          break;
        }
        case 'unreport':
          await act(() => Store.updateChallenge(c.id, { status: 'accepted', winner: null, reportedBy: null, disputedBy: null }));
          break;
        case 'dispute':
          await act(() => Store.updateChallenge(c.id, { status: 'accepted', winner: null, reportedBy: null, disputes: (c.disputes || 0) + 1, disputedBy: myId }),
            (c.disputes || 0) >= 1 ? '⚠️ Otro desacuerdo… que decida la Banca' : 'Resultado rechazado. Volved a registrarlo.');
          break;
        case 'confirm':
          await finishChallenge(c, c.winner, '💰 Resultado confirmado');
          break;
        case 'force': {
          const ok = await modal(`<div class="modal-icon">🏦</div><p class="modal-text">La Banca decide: gana ${who(winnerId)}</p>`, 'Resolver');
          if (ok) await finishChallenge(c, winnerId, '🏦 La Banca ha resuelto el duelo');
          break;
        }
      }
    } finally {
      busy = false;
    }
  }

  async function finishChallenge(c, winnerId, msg) {
    const loser = rivalOf(c, winnerId);
    const amount = Math.max(0, Math.min(c.amount, balances()[loser])); // nunca deja a nadie en negativo
    const txId = Store.uid(); const now = Date.now();
    await act(async () => {
      await Store.addTx({ id: txId, type: 'duel', ts: now, challengeId: c.id, challenger: c.from, winner: winnerId, loser, amount, game: c.game });
      await Store.updateChallenge(c.id, { status: 'done', winner: winnerId, txId, closedAt: now });
    }, msg);
  }

  // ============================================================
  //  RENDER: HISTORIAL
  // ============================================================
  function renderHistory() {
    const f = $('#h-filter'); const fv = f.value;
    f.innerHTML = '<option value="">Todos</option>' + S.players.map((p) => `<option value="${esc(p.id)}">${esc(p.emoji)} ${esc(p.name)}</option>`).join('');
    if (S.players.some((p) => p.id === fv)) f.value = fv;

    const admin = isAdmin();
    const items = S.txs.filter((t) => !f.value || effects(t).some(([id]) => id === f.value)).reverse();
    $('#history-list').innerHTML = items.length ? items.map((t) => txItem(t, admin)).join('')
      : '<li class="empty">Aún no ha pasado nada. Silencio sospechoso…</li>';
  }

  function txItem(t, admin) {
    const l = txLine(t);
    const btn = admin && t.type !== 'init'
      ? (t.voided ? `<button class="mini" data-restore="${esc(t.id)}">Restaurar</button>` : `<button class="mini danger" data-void="${esc(t.id)}">Anular</button>`)
      : '';
    return `<li class="feed-item ${t.voided ? 'voided' : ''}">
      <div class="feed-icon">${l.icon}</div>
      <div class="feed-body">
        <div>${l.text}${t.voided ? ' <span class="tag">ANULADO</span>' : ''}</div>
        <div class="feed-sub">${l.sub ? l.sub + ' · ' : ''}<time title="${fmtDate(t.ts)}">${ago(t.ts)}</time></div>
      </div>${btn}</li>`;
  }

  // ============================================================
  //  RENDER: PERFIL
  // ============================================================
  function renderProfile() {
    const mine = me();
    $('#profile-none').hidden = !!mine;
    $('#profile').hidden = !mine;
    $('#tab-me').textContent = mine ? mine.emoji : '👤';
    if (!mine) return;

    const bal = balances();
    const sorted = sortedPlayers(bal);
    const pos = sorted.findIndex((p) => bal[p.id] === bal[mine.id]) + 1;
    const moroso = pendingPunishments().some((t) => t.player === mine.id);

    $('#pf-avatar').textContent = mine.emoji;
    $('#pf-name').innerHTML = esc(mine.name) + (moroso ? ' <span class="tag moroso">MOROSO</span>' : '');
    $('#pf-pos').textContent = `${pos <= 3 ? MEDALS[pos - 1] + ' ' : ''}Puesto ${pos} de ${sorted.length} · Apuesta máx.: ${maxBetFor(bal[mine.id])}`;
    $('#pf-chips').textContent = bal[mine.id];

    const st = playerStats(mine.id);
    const rival = (entry) => (entry ? `${esc(player(entry[0]).emoji)} ${esc(player(entry[0]).name)}` : '—');
    $('#pf-stats').innerHTML = `
      <div class="stat"><b>${st.won}-${st.lost}</b><span>victorias-derrotas</span></div>
      <div class="stat"><b>${st.total ? Math.round((st.won / st.total) * 100) + '%' : '—'}</b><span>de victorias</span></div>
      <div class="stat"><b>${st.streak ? (st.streakWin ? '🔥 ' : '🧊 ') + st.streak : '—'}</b><span>${st.streak ? (st.streakWin ? 'racha ganando' : 'racha perdiendo') : 'racha'}</span></div>
      <div class="stat"><b>${st.best ? st.best.amount : '—'}</b><span>mayor golpe</span></div>
      <div class="stat stat-text"><b>${rival(st.nemesis)}</b><span>némesis${st.nemesis ? ` (${st.nemesis[1]})` : ''}</span></div>
      <div class="stat stat-text"><b>${rival(st.victim)}</b><span>víctima favorita${st.victim ? ` (+${st.victim[1]})` : ''}</span></div>`;

    const mineTx = S.txs.filter((t) => effects(t).some(([id]) => id === mine.id)).reverse();
    $('#pf-history').innerHTML = mineTx.map((t) => txItem(t, false)).join('');
  }

  function fillProfileForm() {
    const mine = me();
    if (!mine) return;
    $('#pf-name-input').value = mine.name;
    profileEmoji = mine.emoji;
    renderEmojiGrid($('#pf-emojis'), profileEmoji);
    $('#pf-code').textContent = '••••';
    $('#pf-code-btn').textContent = 'Mostrar';
  }

  // ============================================================
  //  RENDER: BIENVENIDA
  // ============================================================
  function renderWelcome() {
    const show = !me() && !isSpectator();
    const w = $('#welcome');
    if (show && w.hidden) {
      // Se abre: estado inicial limpio
      $('#w-register').hidden = false; $('#w-recover').hidden = true;
      regEmoji = regEmoji || randomEmoji();
      renderEmojiGrid($('#r-emojis'), regEmoji);
    }
    w.hidden = !show;
    document.body.classList.toggle('no-scroll', show);
    const sel = $('#rc-player'); const v = sel.value;
    sel.innerHTML = '<option value="">Elegir…</option>' + S.players.map((p) => `<option value="${esc(p.id)}">${esc(p.emoji)} ${esc(p.name)}</option>`).join('');
    if (S.players.some((p) => p.id === v)) sel.value = v;
  }

  // ============================================================
  //  RENDER: BANCA
  // ============================================================
  function renderBanca() {
    const admin = isAdmin();
    const pend = pendingPunishments().slice().reverse();
    $('#shame-list').innerHTML = pend.length ? pend.map((t) => `
      <li class="feed-item">
        <div class="feed-icon">🍺</div>
        <div class="feed-body">
          <div>${who(t.player)} debe: <b>${esc(t.punishment)}</b></div>
          <div class="feed-sub">Préstamo de ${t.amount} fichas · <time title="${fmtDate(t.ts)}">${ago(t.ts)}</time></div>
        </div>
        ${admin ? `<button class="mini ok" data-done="${esc(t.id)}">Cumplido ✓</button>` : ''}
      </li>`).join('') : '<li class="empty">Nadie debe nada… de momento 😇</li>';

    $('#admin-locked').hidden = admin;
    $('#admin-panel').hidden = !admin;
    if (!admin) return;

    const bal = balances();
    fillPlayerSelect($('#l-player'), 'Elegir jugador…', bal);
    fillPlayerSelect($('#a-player'), 'Elegir jugador…', bal);
    $('#punish-list').innerHTML = (S.settings.punishments || []).map((x) => `<option value="${esc(x)}">`).join('');
    if (!$('#l-amount').value) $('#l-amount').value = S.settings.loanAmount;
    if (!$('#p-emoji').value) $('#p-emoji').value = randomEmoji();
    $('#p-hint').textContent = `Empezará con ${S.settings.startChips} fichas.`;

    $('#admin-players').innerHTML = S.players.map((p) => `
      <li>
        <span>${esc(p.emoji)} ${esc(p.name)} ${p.demo ? '<span class="tag">PRUEBA</span>' : ''}</span>
        <span class="row">
          <code title="Código de recuperación">${esc(p.code || '—')}</code>
          <span class="muted small">📱 ${(p.deviceIds || []).length}</span>
          <button class="mini" data-edit="${esc(p.id)}">Editar</button>
        </span>
      </li>`).join('');
  }

  function fillSettingsForm() {
    const s = S.settings;
    $('#s-start').value = s.startChips;
    $('#s-min').value = s.minBet;
    $('#s-loan').value = s.loanAmount;
    $('#s-pin').value = s.adminPin;
    $('#s-end').value = s.endDate;
    $('#s-schedule').value = schedule().map((x) => `${x.from} = ${x.pct}`).join('\n');
    $('#s-games').value = (s.games || []).join('\n');
    $('#s-punish').value = (s.punishments || []).join('\n');
  }

  function renderAll() {
    if (!S) return;
    renderRanking();
    renderChallengeForm();
    renderChallenges();
    renderDuelForm();
    renderHistory();
    renderProfile();
    renderBanca();
    renderWelcome();
  }

  // ============================================================
  //  ALTAS DE JUGADORES Y DATOS DE PRUEBA
  // ============================================================
  function newPlayerRecords(name, emoji, extra = {}, ts = Date.now()) {
    const p = Object.assign({ id: Store.uid(), name, emoji, createdAt: ts, deviceIds: [], code: newCode() }, extra);
    const init = { id: Store.uid(), type: 'init', ts, player: p.id, amount: Number(S.settings.startChips) || 100 };
    return { p, init };
  }

  const DEMO_NAMES = ['Paco', 'Lucía', 'Marta', 'Dani', 'Nerea', 'Javi', 'Irene', 'Sergio', 'Carla', 'Álvaro', 'Rocío', 'Hugo', 'Bea', 'Iker'];

  // Crea 6 jugadores de prueba y simula ~18 duelos durante los últimos 5 días
  async function seedDemo() {
    const names = shuffle(DEMO_NAMES.filter((n) => !nameTaken(n))).slice(0, 6);
    const emojis = shuffle(EMOJIS.slice());
    const t0 = Date.now() - 5 * 86400000;
    const players = []; const txs = []; const bal = {};
    names.forEach((name, i) => {
      const { p, init } = newPlayerRecords(name, emojis[i], { demo: true }, t0 + i);
      players.push(p); txs.push(init); bal[p.id] = init.amount;
    });
    const games = (S.settings.games || []).length ? S.settings.games : ['Duelo'];
    let ts = t0 + 3600000;
    for (let k = 0; k < 18; k++) {
      ts += Math.floor(Math.random() * ((5 * 86400000 - 3600000) / 18));
      const [a, b] = shuffle(players.slice());
      const max = Math.min(maxBetFor(bal[a.id]), maxBetFor(bal[b.id]));
      if (max <= 0) continue;
      const amount = Math.max(1, Math.round(max * (0.4 + Math.random() * 0.6)));
      const [w, l] = Math.random() < 0.5 ? [a, b] : [b, a];
      bal[w.id] += amount; bal[l.id] -= amount;
      txs.push({ id: Store.uid(), type: 'duel', ts, challenger: a.id, winner: w.id, loser: l.id, amount, game: games[Math.floor(Math.random() * games.length)] });
    }
    // Un par de retos en marcha para que la mesa no esté muerta
    const [p1, p2, p3, p4] = shuffle(players.slice());
    const challenges = [
      { id: Store.uid(), from: p1.id, to: p2.id, game: games[0], amount: Math.min(pairMax(p1.id, p2.id, bal), 8), status: 'accepted', createdAt: Date.now() - 1800000, acceptedAt: Date.now() - 1500000 },
      { id: Store.uid(), from: p3.id, to: p4.id, game: games[1 % games.length], amount: Math.min(pairMax(p3.id, p4.id, bal), 6), status: 'pending', createdAt: Date.now() - 600000 },
    ];
    await Store.addMany({ players, txs });
    for (const c of challenges) await Store.addChallenge(c);
  }

  // ============================================================
  //  CUENTA ATRÁS
  // ============================================================
  function tick() {
    if (!S) return;
    const ms = endTs() - Date.now();
    const el = $('#countdown');
    if (ms <= 0) {
      el.innerHTML = '<div class="cd-label">La mesa está</div><div class="cd-time">CERRADA</div>';
    } else {
      const d = Math.floor(ms / 86400000);
      const h = Math.floor(ms / 3600000) % 24;
      const m = Math.floor(ms / 60000) % 60;
      const s = Math.floor(ms / 1000) % 60;
      el.innerHTML = `<div class="cd-label">Cierre de la mesa</div><div class="cd-time">${d > 0 ? d + '<small>d</small> ' : ''}${pad(h)}:${pad(m)}:${pad(s)}</div>`;
      el.classList.toggle('urgent', ms < 3600000);
    }
    const e = ms <= 0;
    if (wasEnded !== null && e !== wasEnded) renderAll();
    wasEnded = e;
  }

  // ============================================================
  //  EVENTOS
  // ============================================================
  function bindEvents() {
    $$('.tabs button').forEach((b) => b.addEventListener('click', () => go(b.dataset.view)));

    // --- Duelo
    $('#d-a').addEventListener('change', updateDuel);
    $('#d-b').addEventListener('change', updateDuel);
    $('#d-game').addEventListener('change', () => { $('#d-game-other').hidden = $('#d-game').value !== '__other'; });
    $('#d-bet-range').addEventListener('input', (e) => { $('#d-bet').value = e.target.value; });
    $('#d-bet').addEventListener('input', (e) => { $('#d-bet-range').value = e.target.value; });
    $('#d-winner').addEventListener('click', (e) => {
      const b = e.target.closest('[data-win]'); if (!b) return;
      winner = b.dataset.win; updateDuel();
    });
    $('#duel-form').addEventListener('submit', submitDuel);

    // --- Retos
    $('#c-rival').addEventListener('change', updateChallengeForm);
    $('#c-game').addEventListener('change', () => { $('#c-game-other').hidden = $('#c-game').value !== '__other'; });
    $('#c-bet-range').addEventListener('input', (e) => { $('#c-bet').value = e.target.value; });
    $('#c-bet').addEventListener('input', (e) => { $('#c-bet-range').value = e.target.value; });
    $('#c-register').addEventListener('click', () => { setSpectator(false); renderAll(); });
    $('#my-challenges').addEventListener('click', challengeAction);
    $('#live-challenges').addEventListener('click', challengeAction);
    $('#challenge-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const mine = me(); if (!mine) return;
      const rival = $('#c-rival').value;
      const amount = parseInt($('#c-bet').value, 10);
      if (ended()) return toast('🏁 La partida ha terminado', 'bad');
      if (!rival) return toast('Elige a tu rival', 'bad');
      if (activeBetween(mine.id, rival)) return toast('Ya tenéis un reto abierto', 'bad');
      const max = pairMax(mine.id, rival);
      if (!amount || amount < 1 || amount > max) return toast(`La apuesta debe estar entre 1 y ${max}`, 'bad');
      let game = $('#c-game').value;
      if (game === '__other') game = $('#c-game-other').value.trim() || 'Minijuego misterioso';
      const now = Date.now();
      const done = await act(() => Store.addChallenge({ id: Store.uid(), from: mine.id, to: rival, game, amount, status: 'pending', createdAt: now }),
        `⚔️ Reto enviado a ${esc(player(rival).name)}`);
      if (done) { $('#c-rival').value = ''; $('#c-bet').value = ''; $('#c-game-other').value = ''; updateChallengeForm(); window.scrollTo(0, 0); }
    });

    // --- Historial
    $('#h-filter').addEventListener('change', renderHistory);
    $('#history-list').addEventListener('click', async (e) => {
      const v = e.target.closest('[data-void]'); const r = e.target.closest('[data-restore]');
      if (v && await modal('<div class="modal-icon">🗑️</div><p class="modal-text">¿Anular este movimiento? Las fichas volverán a su sitio.</p>', 'Anular')) {
        act(() => Store.updateTx(v.dataset.void, { voided: true }), 'Movimiento anulado');
      }
      if (r) act(() => Store.updateTx(r.dataset.restore, { voided: false }), 'Movimiento restaurado');
    });

    // --- Banca: acceso
    $('#unlock-form').addEventListener('submit', (e) => {
      e.preventDefault();
      if ($('#pin').value === String(S.settings.adminPin)) {
        setAdmin(true); $('#pin').value = '';
        fillSettingsForm(); renderAll(); toast('🏦 Bienvenido, señor Banquero', 'ok');
      } else {
        toast('🚫 PIN incorrecto', 'bad');
      }
    });
    $('#lock-btn').addEventListener('click', () => { setAdmin(false); renderAll(); toast('🔒 Banca cerrada'); });

    $('#shame-list').addEventListener('click', (e) => {
      const b = e.target.closest('[data-done]'); if (!b) return;
      act(() => Store.updateTx(b.dataset.done, { done: true, doneAt: Date.now() }), '✅ Castigo cumplido. Deuda saldada.');
    });

    // --- Préstamo
    $('#l-roulette').addEventListener('click', () => {
      const opts = S.settings.punishments || [];
      if (!opts.length) return;
      const input = $('#l-punish');
      let i = 0; const total = 14 + Math.floor(Math.random() * opts.length);
      const spin = () => {
        input.value = opts[i % opts.length];
        input.classList.add('spinning');
        if (++i < total) setTimeout(spin, 40 + i * i * 1.5);
        else input.classList.remove('spinning');
      };
      spin();
    });
    $('#loan-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const pid = $('#l-player').value;
      const amount = parseInt($('#l-amount').value, 10);
      const punishment = $('#l-punish').value.trim();
      if (!pid) return toast('Elige un jugador', 'bad');
      if (!amount || amount < 1) return toast('Cantidad no válida', 'bad');
      if (!punishment) return toast('Todo préstamo tiene su castigo 😈', 'bad');
      const minBet = Number(S.settings.minBet) || 1;
      if (balances()[pid] >= minBet) return toast(`La Banca solo presta a quien tiene menos de ${minBet} fichas`, 'bad');
      const ok = await modal(`<div class="modal-icon">💸</div>
        <p class="modal-text">La Banca presta <b>${amount}</b> fichas a ${who(pid)}</p>
        <p class="hint center">A cambio de: <b>${esc(punishment)}</b></p>`, 'Prestar');
      if (!ok) return;
      const done = await act(() => Store.addTx({ id: Store.uid(), type: 'loan', ts: Date.now(), player: pid, amount, punishment, done: false }), '🏦 Préstamo concedido');
      if (done) { $('#l-punish').value = ''; $('#l-player').value = ''; }
    });

    // --- Jugadores
    $('#player-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = $('#p-name').value.trim();
      const emoji = $('#p-emoji').value.trim() || randomEmoji();
      if (!name) return toast('Ponle un nombre', 'bad');
      if (nameTaken(name)) return toast('Ya hay alguien con ese nombre', 'bad');
      const { p, init } = newPlayerRecords(name, emoji);
      const done = await act(() => Store.addMany({ players: [p], txs: [init] }), `🪑 ${esc(name)} se sienta a la mesa`);
      if (done) { $('#p-name').value = ''; $('#p-emoji').value = randomEmoji(); }
    });
    $('#admin-players').addEventListener('click', async (e) => {
      const b = e.target.closest('[data-edit]'); if (!b) return;
      const p = player(b.dataset.edit);
      const res = await modal(`<h3>Editar jugador</h3>
        <div class="row"><input name="emoji" class="emoji-input" maxlength="4" value="${esc(p.emoji)}">
        <input name="name" maxlength="24" value="${esc(p.name)}"></div>`, 'Guardar');
      if (!res || !res.name.trim()) return;
      if (nameTaken(res.name.trim(), p.id)) return toast('Ya hay alguien con ese nombre', 'bad');
      act(() => Store.updatePlayer(p.id, { name: res.name.trim(), emoji: res.emoji.trim() || p.emoji }), 'Jugador actualizado');
    });

    // --- Ajuste manual
    $('#adjust-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const pid = $('#a-player').value;
      const amount = parseInt($('#a-amount').value, 10);
      const reason = $('#a-reason').value.trim();
      if (!pid) return toast('Elige un jugador', 'bad');
      if (!amount) return toast('Pon una cantidad distinta de 0', 'bad');
      if (balances()[pid] + amount < 0) return toast('No puede quedarse en negativo', 'bad');
      const done = await act(() => Store.addTx({ id: Store.uid(), type: 'adjust', ts: Date.now(), player: pid, amount, reason }), 'Ajuste aplicado');
      if (done) { $('#a-amount').value = ''; $('#a-reason').value = ''; }
    });

    // --- Reglas
    $('#settings-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const sched = lines($('#s-schedule').value).map((l) => {
        const m = l.match(/^(\d{4}-\d{2}-\d{2})\D+(\d+(?:\.\d+)?)/);
        return m ? { from: m[1], pct: Number(m[2]) } : null;
      });
      if (sched.some((x) => !x)) return toast('Revisa el formato del límite: AAAA-MM-DD = 10', 'bad');
      const pin = $('#s-pin').value.trim();
      if (!pin) return toast('El PIN no puede estar vacío', 'bad');
      const s = {
        startChips: parseInt($('#s-start').value, 10) || Store.DEFAULTS.startChips,
        minBet: parseInt($('#s-min').value, 10) || Store.DEFAULTS.minBet,
        loanAmount: parseInt($('#s-loan').value, 10) || Store.DEFAULTS.loanAmount,
        adminPin: pin,
        endDate: $('#s-end').value || Store.DEFAULTS.endDate,
        limitSchedule: sched.length ? sched : Store.DEFAULTS.limitSchedule,
        games: lines($('#s-games').value),
        punishments: lines($('#s-punish').value),
      };
      act(() => Store.saveSettings(s), '⚙️ Reglas guardadas');
    });

    // --- Copia de seguridad
    $('#export-btn').addEventListener('click', () => {
      const blob = new Blob([JSON.stringify(S, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      const d = new Date();
      a.href = URL.createObjectURL(blob);
      a.download = `mercado-negro-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    });
    $('#import-file').addEventListener('change', async (e) => {
      const file = e.target.files[0]; e.target.value = '';
      if (!file) return;
      let data;
      try { data = JSON.parse(await file.text()); } catch (err) { return toast('Ese archivo no es un JSON válido', 'bad'); }
      if (!Array.isArray(data.players) || !Array.isArray(data.txs)) return toast('El archivo no parece una copia de Mercado Negro', 'bad');
      const ok = await modal(`<div class="modal-icon">⚠️</div><p class="modal-text">Esto <b>reemplaza TODOS los datos</b> actuales por los de la copia (${data.players.length} jugadores, ${data.txs.length} movimientos).</p>`, 'Reemplazar');
      if (ok) act(() => Store.replaceAll(data), 'Copia restaurada');
    });

    // --- Bienvenida: registro
    $('#r-emojis').addEventListener('click', (e) => {
      const b = e.target.closest('[data-emoji]'); if (!b) return;
      regEmoji = b.dataset.emoji; renderEmojiGrid($('#r-emojis'), regEmoji);
    });
    $('#register-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = $('#r-name').value.trim();
      if (!name) return toast('Ponte un nombre', 'bad');
      if (nameTaken(name)) return toast('Ese nombre ya está pillado. Si eres tú, usa "Ya tengo jugador".', 'bad');
      const { p, init } = newPlayerRecords(name, regEmoji || randomEmoji(), { deviceIds: [deviceId()] });
      const done = await act(() => Store.addMany({ players: [p], txs: [init] }), `🪑 Bienvenido a la mesa, ${esc(name)}. Tienes ${init.amount} fichas.`);
      if (done) { $('#r-name').value = ''; regEmoji = null; go('perfil'); }
    });

    // --- Bienvenida: recuperar jugador
    $('#w-to-recover').addEventListener('click', () => { $('#w-register').hidden = true; $('#w-recover').hidden = false; });
    $('#w-to-register').addEventListener('click', () => { $('#w-register').hidden = false; $('#w-recover').hidden = true; });
    $('#recover-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const pid = $('#rc-player').value;
      const code = $('#rc-code').value.trim().toUpperCase();
      if (!pid) return toast('Elige tu jugador', 'bad');
      const p = S.players.find((x) => x.id === pid);
      if (!p || !p.code || p.code !== code) return toast('🚫 Código incorrecto', 'bad');
      const ids = [...new Set([...(p.deviceIds || []), deviceId()])];
      const done = await act(() => Store.updatePlayer(pid, { deviceIds: ids }), `👋 Hola de nuevo, ${esc(p.name)}`);
      if (done) { $('#rc-code').value = ''; go('perfil'); }
    });
    $('#w-spectate').addEventListener('click', () => { setSpectator(true); renderAll(); });
    $('#pf-register').addEventListener('click', () => { setSpectator(false); renderAll(); });

    // --- Perfil
    $('#pf-emojis').addEventListener('click', (e) => {
      const b = e.target.closest('[data-emoji]'); if (!b) return;
      profileEmoji = b.dataset.emoji; renderEmojiGrid($('#pf-emojis'), profileEmoji);
    });
    $('#profile-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const mine = me(); if (!mine) return;
      const name = $('#pf-name-input').value.trim();
      if (!name) return toast('El nombre no puede estar vacío', 'bad');
      if (nameTaken(name, mine.id)) return toast('Ese nombre ya está pillado', 'bad');
      act(() => Store.updatePlayer(mine.id, { name, emoji: profileEmoji || mine.emoji }), '✅ Perfil actualizado');
    });
    $('#pf-code-btn').addEventListener('click', () => {
      const mine = me(); if (!mine) return;
      const hidden = $('#pf-code').textContent === '••••';
      $('#pf-code').textContent = hidden ? (mine.code || '—') : '••••';
      $('#pf-code-btn').textContent = hidden ? 'Ocultar' : 'Mostrar';
    });
    $('#unlink-btn').addEventListener('click', async () => {
      const mine = me(); if (!mine) return;
      const ok = await modal(`<div class="modal-icon">🚪</div>
        <p class="modal-text">¿Desvincular este dispositivo de <b>${esc(mine.name)}</b>?</p>
        <p class="hint center">No pierdes tus fichas. Para volver a entrar necesitarás tu código: <b>${esc(mine.code || '—')}</b></p>`, 'Desvincular');
      if (!ok) return;
      act(() => Store.updatePlayer(mine.id, { deviceIds: (mine.deviceIds || []).filter((d) => d !== deviceId()) }), 'Dispositivo desvinculado');
    });

    // --- Banca: pruebas
    $('#seed-btn').addEventListener('click', () => act(seedDemo, '🧪 6 jugadores de prueba sentados a la mesa'));
    $('#fake-challenge-btn').addEventListener('click', () => {
      const mine = me(); if (!mine) return toast('Primero regístrate', 'bad');
      const candidates = S.players.filter((p) => p.id !== mine.id && !activeBetween(p.id, mine.id) && pairMax(p.id, mine.id) > 0);
      if (!candidates.length) return toast('No queda nadie libre para retarte', 'bad');
      const from = candidates[Math.floor(Math.random() * candidates.length)];
      const games = S.settings.games.length ? S.settings.games : ['Duelo'];
      const amount = Math.max(1, Math.round(pairMax(from.id, mine.id) * (0.5 + Math.random() * 0.5)));
      act(() => Store.addChallenge({ id: Store.uid(), from: from.id, to: mine.id, game: games[Math.floor(Math.random() * games.length)], amount, status: 'pending', createdAt: Date.now() }));
    });
    $('#impersonate-btn').addEventListener('click', async () => {
      const mine = me();
      const res = await modal(`<h3>🎭 Ser otro jugador</h3>
        <p class="hint">Solo para pruebas: este dispositivo pasa a ser el jugador que elijas.</p>
        <select name="pid">${S.players.filter((p) => !mine || p.id !== mine.id).map((p) => `<option value="${esc(p.id)}">${esc(p.emoji)} ${esc(p.name)}</option>`).join('')}</select>`, 'Cambiar');
      if (!res || !res.pid) return;
      const target = player(res.pid); const dev = deviceId();
      act(async () => {
        if (mine) await Store.updatePlayer(mine.id, { deviceIds: (mine.deviceIds || []).filter((d) => d !== dev) });
        await Store.updatePlayer(target.id, { deviceIds: [...new Set([...(target.deviceIds || []), dev])] });
      }, `🎭 Ahora eres ${esc(target.name)}`);
    });
    $('#wipe-btn').addEventListener('click', async () => {
      const ok = await modal(`<div class="modal-icon">🧨</div>
        <p class="modal-text">¿Borrar <b>todos</b> los jugadores y movimientos?</p>
        <p class="hint center">Las reglas se mantienen. Exporta una copia antes si la quieres.</p>`, 'Borrar todo');
      if (ok) act(() => Store.replaceAll({ players: [], txs: [], challenges: [], settings: S.settings }), '🧨 Mesa limpia');
    });

    // Refresca textos relativos ("hace 5 min") y límites por fecha
    setInterval(() => { if (S) { renderRanking(); renderChallenges(); renderHistory(); renderProfile(); renderBanca(); } }, 60000);
    setInterval(tick, 1000);
  }

  // ============================================================
  //  ARRANQUE
  // ============================================================
  async function boot() {
    bindEvents();
    let initial = 'ranking';
    try { initial = localStorage.getItem('mn_view') || 'ranking'; } catch (e) { /* nada */ }

    const onError = (err) => {
      console.error(err);
      const b = $('#mode-banner');
      b.hidden = false; b.className = 'banner bad';
      b.innerHTML = '❌ No se puede conectar con la base de datos: ' + esc(err.message || err);
    };

    try {
      const mode = await Store.init((state) => {
        const first = !S;
        S = state;
        if (first) { $('#loading').hidden = true; go(initial); if (isAdmin()) fillSettingsForm(); }
        renderAll();
        notifyChallenges();
        tick();
        // Modo local y mesa vacía: sienta jugadores de prueba (solo una vez por navegador)
        if (first && Store.mode === 'local' && !S.players.length) {
          let seeded = false;
          try { seeded = localStorage.getItem('mn_seeded') === '1'; localStorage.setItem('mn_seeded', '1'); } catch (e) { /* nada */ }
          if (!seeded) seedDemo();
        }
      }, onError);
      if (mode === 'local') {
        const b = $('#mode-banner');
        b.hidden = false;
        b.innerHTML = '⚠️ <b>Modo local</b>: los datos solo se guardan en este navegador. Configura Firebase en <code>js/config.js</code> para jugar todos juntos.';
      }
    } catch (err) {
      onError(err);
      $('#loading').textContent = '💥 No se pudo arrancar la mesa.';
    }
  }

  boot();
})();
