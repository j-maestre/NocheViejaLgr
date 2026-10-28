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
  // En el modo de pruebas local, «?local&yo=Nombre» hace de ese jugador (para probar varios a la vez en pestañas)
  const testAs = (window.MN_CONFIG || {}).localTest ? new URLSearchParams(location.search).get('yo') : null;
  const me = () => S && (testAs ? S.players.find((p) => p.name === testAs) : S.players.find((p) => (p.deviceIds || []).includes(deviceId())));

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

  // ------------------------------------------------------------
  //  La Banca
  //  Es un jugador (settings.bankPlayerId): tiene los poderes en
  //  cualquier dispositivo vinculado a él. El PIN solo sirve mientras
  //  no haya Banca asignada (arranque).
  // ------------------------------------------------------------
  const bankId = () => {
    const id = S && S.settings.bankPlayerId;
    return id && S.players.some((p) => p.id === id) ? id : null;
  };
  // Pruebas en modo local: la Banca puede "ser otro jugador" sin perder los poderes
  function impersonating() {
    if (Store.mode !== 'local' || !bankId()) return false;
    try { return localStorage.getItem('mn_impersonator') === bankId(); } catch (e) { return false; }
  }
  function isAdmin() {
    if (!S) return false;
    const b = bankId();
    if (b) { const m = me(); return (!!m && m.id === b) || impersonating(); }
    try { return sessionStorage.getItem('mn_admin') === '1' || adminMem; } catch (e) { return adminMem; }
  }

  // El primer jugador que se registre con el nombre de config.js se convierte en la Banca
  let claimingBank = false;
  function ensureBank() {
    if (bankId() || claimingBank) return;
    const name = String((window.MN_CONFIG || {}).bankName || '').trim().toLowerCase();
    const m = me();
    if (!name || !m || m.name.toLowerCase() !== name) return;
    claimingBank = true;
    Store.saveSettings(Object.assign({}, S.settings, { bankPlayerId: m.id }))
      .then(() => toast('🎩 Eres la Banca. La Banca siempre gana.', 'ok'))
      .catch((e) => console.error(e))
      .finally(() => { claimingBank = false; });
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
  // Cara del jugador: su foto si tiene, si no su emoji
  const face = (p, cls = '') => (p && typeof p.photo === 'string' && /^data:image\/(jpeg|png|webp);base64,/.test(p.photo)
    ? `<img class="face ${cls}" src="${p.photo}" alt="">` : esc((p && p.emoji) || '❓'));
  const who = (id) => { const p = player(id); return `<b class="who">${face(p, 'mini')} ${esc(p.name)}</b>`; };

  // Tipos de movimiento que añaden los módulos: { tipo: { line(t) } }
  // `payout` es genérico: t.payouts = { jugador: +/- fichas } (repartos, eventos…)
  // `bonus` es un pago de la Banca a un jugador; `charge`, un cobro.
  const TX = {};
  function effects(t) {
    switch (t.type) {
      case 'init': case 'loan': case 'adjust': case 'bonus': return [[t.player, t.amount]];
      case 'charge': case 'fine': return [[t.player, -t.amount]];
      case 'duel': return [[t.winner, t.amount], [t.loser, -t.amount]];
      case 'payout': return Object.entries(t.payouts || {}).filter(([, d]) => d);
      default: return [];
    }
  }

  function balances() {
    const b = {};
    S.players.forEach((p) => { b[p.id] = 0; });
    S.txs.forEach((t) => { if (!t.voided) effects(t).forEach(([id, d]) => { b[id] = (b[id] || 0) + d; }); });
    return b;
  }

  // Saldos tal y como estaban en el instante `ts` (cálculo determinista para los eventos)
  function balancesAt(ts) {
    const b = {};
    S.players.forEach((p) => { b[p.id] = 0; });
    S.txs.forEach((t) => { if (!t.voided && t.ts <= ts) effects(t).forEach(([id, d]) => { b[id] = (b[id] || 0) + d; }); });
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

  // Inicio de un tramo del límite: 'AAAA-MM-DD' (00:00) o 'AAAA-MM-DDTHH:MM'
  const dayStart = (str) => new Date(str.includes('T') ? str : str + 'T00:00').getTime();
  const fmtFrom = (str) => new Date(dayStart(str)).toLocaleString('es-ES', str.includes('T')
    ? { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' } : { day: 'numeric', month: 'short' });
  const schedule = () => (S.settings.limitSchedule || []).slice().sort((a, b) => (a.from < b.from ? -1 : 1));
  // ⚡ Última ronda: la última hora antes del cierre se apuesta sin límite y hay un ALL IN extra
  const lastRoundTs = () => endTs() - (Number(S.settings.lastRoundMinutes) || 0) * 60000;
  const lastRound = () => !!Number(S.settings.lastRoundMinutes) && Date.now() >= lastRoundTs() && !ended();

  function currentPct() {
    if (lastRound()) return 100;
    const sc = schedule(); const now = Date.now();
    let pct = sc.length ? sc[0].pct : 10;
    sc.forEach((s) => { if (dayStart(s.from) <= now) pct = s.pct; });
    return pct;
  }
  // Próximo tramo que de verdad cambia el porcentaje
  const nextChange = () => { const cur = currentPct(); return schedule().find((s) => dayStart(s.from) > Date.now() && s.pct !== cur); };

  function maxBetFor(capital) {
    if (capital <= 0) return 0;
    const byPct = Math.floor((capital * currentPct()) / 100);
    return Math.min(capital, Math.max(Number(S.settings.minBet) || 1, byPct));
  }

  const endTs = () => new Date(S.settings.endDate).getTime();
  const startTs = () => new Date(S.settings.startDate).getTime();
  const started = () => Date.now() >= startTs();
  const ended = () => Date.now() >= endTs();
  const pendingPunishments = () => S.txs.filter((t) => t.type === 'loan' && !t.voided && !t.done);

  const pairMax = (a, b, bal = balances()) => Math.min(maxBetFor(bal[a] || 0), maxBetFor(bal[b] || 0));

  // ------------------------------------------------------------
  //  Retos: pending → accepted → reported → done
  //         (o rejected / cancelled). "reported" vuelve a "accepted"
  //         si el rival no está de acuerdo con el resultado.
  // ------------------------------------------------------------
  const ACTIVE = ['pending', 'accepted', 'reported'];
  const HOUR = 3600000;
  const isExpired = (c) => c.status === 'pending' && Date.now() - c.createdAt > (Number(S.settings.challengeExpiryHours) || 12) * HOUR;
  const activeChallenges = () => S.challenges.filter((c) => ACTIVE.includes(c.status) && !isExpired(c));

  // Anti-spam: ¿puede `from` retar ahora a `to`? Devuelve el motivo si no.
  // Reto en juego (aceptado o esperando confirmar el resultado) de un jugador, si lo tiene
  const playingNow = (id, except) => activeChallenges().find((c) => c.id !== except && ['accepted', 'reported'].includes(c.status) && (c.from === id || c.to === id));

  function challengeBlock(from, to) {
    for (const m of MODULES) { const r = m.challengeBlock && m.challengeBlock(from, to); if (r) return r; }
    const busyMe = playingNow(from);
    if (busyMe) return `⚔️ Ya tienes un reto en juego con <b>${esc(player(busyMe.from === from ? busyMe.to : busyMe.from).name)}</b>. Terminadlo antes de retar a otro.`;
    if (activeBetween(from, to)) return `Ya tienes un reto abierto con <b>${esc(player(to).name)}</b>. Terminadlo primero.`;
    const maxOut = Number(S.settings.maxPendingOut) || 2;
    const out = activeChallenges().filter((c) => c.from === from && c.status === 'pending').length;
    if (out >= maxOut) return `Ya tienes ${out} reto${out > 1 ? 's' : ''} sin contestar. Espera a que respondan.`;
    const cd = (Number(S.settings.rejectCooldownHours) || 0) * HOUR;
    const last = S.challenges.filter((c) => c.from === from && c.to === to && c.status === 'rejected')
      .reduce((m, c) => Math.max(m, c.closedAt || 0), 0);
    const left = last + cd - Date.now();
    if (cd && left > 0) {
      const mins = Math.ceil(left / 60000); const h = Math.floor(mins / 60); const min = mins % 60;
      return `🐔 ${esc(player(to).name)} te rechazó hace poco. Podrás volver a retarle en ${h ? h + ' h' : ''}${h && min ? ' ' : ''}${min ? min + ' min' : ''}.`;
    }
    return null;
  }
  const activeBetween = (a, b) => activeChallenges().find((c) => (c.from === a && c.to === b) || (c.from === b && c.to === a));
  const rivalOf = (c, id) => (c.from === id ? c.to : c.from);
  // ¿Este reto espera una acción mía?
  const needsMe = (c, myId) => (c.status === 'pending' && c.to === myId) || (c.status === 'reported' && c.reportedBy !== myId && (c.from === myId || c.to === myId))
    || (c.status === 'accepted' && isSwGame(c) && (c.from === myId || c.to === myId) && c['sw_' + myId] == null)
    || (c.status === 'accepted' && isAgGame(c) && (c.from === myId || c.to === myId) && !agStarted(c, myId));

  // 💣 ALL IN: una vez por jugador en toda la partida, os jugáis todo lo que tiene el más pobre.
  // Solo se gasta si el reto sigue vivo o se juega (rechazado, cancelado o caducado no cuenta).
  // En la última ronda cada uno recupera un ALL IN (solo cuentan los lanzados desde entonces)
  const allInUsed = (pid) => S.challenges.some((c) => c.allIn && c.from === pid && !['rejected', 'cancelled', 'expired'].includes(c.status)
    && (!lastRound() || (c.createdAt || 0) >= lastRoundTs()));
  const allInAmount = (a, b, bal = balances()) => Math.max(0, Math.min(bal[a] || 0, bal[b] || 0));

  // 📱 Juegos dentro de la app (módulo de juegos). El reto guarda el nombre; el id se deduce de él.
  const appGameOf = (name) => { const g = MN.appGames && MN.appGames.list().find((x) => x.name === name); return g ? g.id : (/cron[oó]metro/i.test(name || '') ? 'stopwatch' : null); };
  const agId = (c) => c.appGame || appGameOf(c.game);
  const isAgGame = (c) => { const id = agId(c); return !!id && id !== 'stopwatch'; };
  const agMine = (c, id) => c['ag_' + id] != null;
  // Un solo intento: quien empezó y no terminó en 15 min se da por abandonado
  const agStarted = (c, id) => !!c['ags_' + id];
  const agQuit = (c, id) => !agMine(c, id) && agStarted(c, id) && Date.now() - c['ags_' + id] > 15 * 60000;
  const agOver = (c, id) => agMine(c, id) || agQuit(c, id);
  const agScore = (c, id) => (agMine(c, id) ? c['ag_' + id] : -Infinity);
  const agLabel = (c, id) => (agMine(c, id) ? c['agl_' + id] : 'Abandonó a medias');
  const agDone = (c) => c.status === 'accepted' && isAgGame(c) && agOver(c, c.from) && agOver(c, c.to);

  // Retos de cronómetro: se juegan dentro de la app y gana quien se acerque más al objetivo
  const isSwGame = (c) => /cron[oó]metro/i.test(c.game || '');
  const swSecs = (ms) => (ms / 1000).toFixed(2).replace('.', ',');
  function swWinner(c) {
    const target = (Number(S.settings.stopwatchTarget) || 10) * 1000;
    const [a, b] = [c.from, c.to];
    const da = Math.abs(c['sw_' + a] - target); const db = Math.abs(c['sw_' + b] - target);
    if (da !== db) return da < db ? a : b;
    return (c['swAt_' + a] || 0) <= (c['swAt_' + b] || 0) ? a : b; // empate: gana quien jugó antes
  }
  const swDone = (c) => c.status === 'accepted' && isSwGame(c) && c['sw_' + c.from] != null && c['sw_' + c.to] != null;

  // Fuego animado para rachas de 3+ victorias (crece con la racha)
  function fireHtml(st, big) {
    if (!st.streakWin || st.streak < 3) return '';
    const lvl = st.streak >= 7 ? 3 : st.streak >= 5 ? 2 : 1;
    return `<span class="fire lvl-${lvl}${big ? ' big' : ''}" title="Racha de ${st.streak} victorias"><span class="flame">🔥</span>${st.streak}</span>`;
  }

  const BADGES = [
    { id: 'shark', icon: '🦈', name: 'Tiburón', desc: 'Ganar 5 duelos seguidos' },
    { id: 'chicken', icon: '🐔', name: 'Gallina', desc: 'Rechazar 3 retos' },
    { id: 'broke', icon: '💀', name: 'Quebrado', desc: 'Quedarse a 0 fichas' },
    { id: 'drunk', icon: '🍺', name: 'Moroso habitual', desc: 'Pedir 2 préstamos a la Banca' },
  ];

  // Insignias ganadas por cada jugador (son permanentes una vez conseguidas)
  function achievements() {
    const res = {}; const run = {}; const streak = {}; const best = {}; const loans = {};
    S.players.forEach((p) => { res[p.id] = new Set(); run[p.id] = 0; streak[p.id] = 0; best[p.id] = 0; loans[p.id] = 0; });
    S.txs.forEach((t) => {
      if (t.voided) return;
      effects(t).forEach(([id, d]) => { if (id in run) run[id] += d; });
      if (t.type === 'duel') {
        if (t.winner in streak) { streak[t.winner]++; best[t.winner] = Math.max(best[t.winner], streak[t.winner]); }
        if (t.loser in streak) streak[t.loser] = 0;
      }
      if (t.type === 'loan' && t.player in loans) loans[t.player]++;
      effects(t).forEach(([id]) => { if (id in run && run[id] <= 0) res[id].add('broke'); });
    });
    const rejected = {};
    S.challenges.forEach((c) => { if (c.status === 'rejected') rejected[c.to] = (rejected[c.to] || 0) + 1; });
    S.players.forEach((p) => {
      if (best[p.id] >= 5) res[p.id].add('shark');
      if ((rejected[p.id] || 0) >= 3) res[p.id].add('chicken');
      if (loans[p.id] >= 2) res[p.id].add('drunk');
    });
    return res;
  }

  // Serie temporal de fichas de cada jugador: { id: [[ts, fichas], ...] }
  function balanceSeries() {
    const run = {}; const series = {};
    S.players.forEach((p) => { run[p.id] = 0; series[p.id] = []; });
    S.txs.forEach((t) => {
      if (t.voided) return;
      effects(t).forEach(([id, d]) => {
        if (!(id in run)) return;
        run[id] += d;
        const s = series[id];
        if (s.length && s[s.length - 1][0] === t.ts) s[s.length - 1][1] = run[id];
        else s.push([t.ts, run[id]]);
      });
    });
    return series;
  }

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
        return { icon: t.allIn ? '💣' : '⚔️', text: (t.allIn ? '<b>ALL IN</b> · ' : '') + DUEL_LINES[Math.abs(hash(t.id)) % DUEL_LINES.length](who(t.winner), who(t.loser), t.amount),
          sub: esc(t.game) + (t.tag ? ` · ${esc(t.tag)}` : '') + (t.bank === 'resolved' ? ' · 🏦 decidido por la Banca' : t.bank === 'direct' ? ' · 🏦 registrado por la Banca' : '')
            + (t.dedication ? `<div class="dedication">💬 “${esc(t.dedication)}”</div>` : '') };
      case 'loan':
        return { icon: '🏦', text: `La Banca presta <b>${t.amount}</b> fichas a ${who(t.player)}`, sub: `Castigo: ${esc(t.punishment)} · ${t.done ? '✅ cumplido' : '⏳ pendiente'}` };
      case 'adjust':
        return { icon: '✏️', text: `Ajuste de la Banca: <b>${t.amount > 0 ? '+' : ''}${t.amount}</b> a ${who(t.player)}`, sub: esc(t.reason || '') };
      case 'fine':
        return { icon: '🐔', text: `${who(t.player)} paga <b>${t.amount}</b> fichas de multa por cobarde`, sub: esc(t.reason || '') };
      case 'init':
        return { icon: '🪑', text: `${who(t.player)} se sienta a la mesa con <b>${t.amount}</b> fichas`, sub: '' };
      default: {
        const def = TX[t.kind] || TX[t.type];
        if (def) return def.line(t);
        if (t.type === 'bonus') return { icon: '🎁', text: `La Banca le da <b>${t.amount}</b> fichas a ${who(t.player)}`, sub: esc(t.reason || '') };
        if (t.type === 'charge') return { icon: '💸', text: `${who(t.player)} paga <b>${t.amount}</b> fichas`, sub: esc(t.reason || '') };
        return { icon: '❔', text: 'Movimiento desconocido', sub: '' };
      }
    }
  }

  // ============================================================
  //  UI GENÉRICA: modal, toast, navegación
  // ============================================================
  function modal(html, okLabel = 'Confirmar', cancelLabel = 'Cancelar') {
    const m = $('#modal');
    $('#modal-body').innerHTML = html;
    $('#modal-ok').textContent = okLabel;
    $('#modal-cancel').textContent = cancelLabel;
    m.hidden = false;
    const first = $('input, select, textarea', m);
    if (first) setTimeout(() => first.focus(), 30);
    return new Promise((resolve) => {
      const close = (val) => {
        m.hidden = true;
        // Nunca dejar el formulario sin manejador: se enviaría y recargaría la página
        $('#modal-form').onsubmit = (ev) => ev.preventDefault(); $('#modal-cancel').onclick = null; m.onclick = null;
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

  // Toaster: avisos apilados arriba; se cierran solos o al tocarlos
  const TOAST_MAX = 4;
  function toast(msg, kind = '') {
    const box = $('#toaster');
    const el = document.createElement('div');
    el.className = 'toast-item ' + (kind || 'info');
    el.setAttribute('role', kind === 'bad' ? 'alert' : 'status');
    el.innerHTML = `<div class="toast-msg">${msg}</div>`;
    box.appendChild(el);
    while (box.children.length > TOAST_MAX) box.firstElementChild.remove();
    requestAnimationFrame(() => el.classList.add('in'));
    const text = el.textContent || '';
    const close = () => { if (el.classList.contains('out')) return; el.classList.add('out'); setTimeout(() => el.remove(), 300); };
    el.addEventListener('click', close);
    setTimeout(close, Math.min(8000, 3200 + text.length * 35));
  }

  // Aviso al jugador: mensaje emergente + vibración, y notificación del sistema
  // si la web está en segundo plano (los módulos pueden engancharse a `onNotify`)
  function notify(msgs) {
    const list = [].concat(msgs);
    if (!list.length) return;
    list.forEach((m) => toast(m, 'ok'));
    try {
      const touched = !navigator.userActivation || navigator.userActivation.hasBeenActive;
      if (navigator.vibrate && touched) navigator.vibrate([120, 60, 120]);
    } catch (e) { /* nada */ }
    MODULES.forEach((m) => m.onNotify && m.onNotify(list));
  }

  async function act(fn, okMsg) {
    try { await fn(); if (okMsg) toast(okMsg, 'ok'); return true; } catch (e) {
      console.error(e); toast('❌ Error al guardar: ' + esc(e.message || e), 'bad'); return false;
    }
  }

  function go(v) {
    view = v;
    MODULES.forEach((m) => m.onView && m.onView(v));
    if (v !== 'normas' && peekRules) { peekRules = false; if (S) renderWelcome(); }
    $('#rules-btn').classList.toggle('active', v === 'normas');
    $$('.view').forEach((el) => { el.hidden = el.id !== 'view-' + v; });
    $$('.tabs button, #me-btn').forEach((b) => b.classList.toggle('active', b.dataset.view === v));
    if (v === 'banca' && isAdmin()) fillSettingsForm();
    if (v === 'perfil') { fillProfileForm(); if (S) renderProfile(); }
    if (v === 'ranking' && S && S.players.length) renderRankChart(balances());
    try { localStorage.setItem('mn_view', v); } catch (e) { /* nada */ }
    window.scrollTo(0, 0);
  }

  // ============================================================
  //  RENDER: RANKING
  // ============================================================
  // Ranking censurado (p. ej. antes del evento comunista): { icon, name, banner, chart }
  const rankMask = () => { for (const m of MODULES) { const r = m.rankMask && m.rankMask(); if (r) return r; } return null; };

  function renderRanking() {
    const bal = balances();
    const mask = rankMask();
    const today = todayDeltas();
    const morosos = new Set(pendingPunishments().map((t) => t.player));
    const sorted = sortedPlayers(bal);
    const isEnd = ended();
    const mine = me();

    const next = nextChange();
    $('#limit-info').innerHTML = (mask ? `<div class="mask-banner">${mask.banner}</div>` : '')
      + (lastRound() ? '<div class="last-round-banner">⚡ <b>ÚLTIMA RONDA</b> · apuesta sin límite y un 💣 ALL IN extra para cada uno</div>' : '') + (isEnd ? '' : !started()
      ? `🗓️ La partida empieza el <b>${esc(new Date(startTs()).toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }))}</b> · apuesta máxima al empezar: <b>${currentPct()}%</b>`
      : `🎯 Apuesta máxima: <b>${currentPct()}%</b> del capital <span class="muted">(mín. ${esc(S.settings.minBet)})</span>` +
      (next ? ` · <span class="muted">sube al ${esc(next.pct)}% el ${esc(fmtFrom(next.from))}</span>` : ''));

    $('#final-banner').innerHTML = isEnd && sorted.length ?
      `<div class="final"><div class="final-crown">👑</div><div>La mesa está cerrada.<br>Gana <b>${esc(sorted[0].emoji)} ${esc(sorted[0].name)}</b> con <b>${bal[sorted[0].id]}</b> fichas</div></div>` : '';

    if (!sorted.length) {
      $('#ranking-list').innerHTML = `<li class="empty">La Banca aún no ha sentado a nadie en la mesa.<br>Añade jugadores desde <b>🏦 Banca</b>.</li>`;
      $('#ranking-stats').innerHTML = '';
      return;
    }

    const ach = achievements();
    let pos = 0; let lastBal = null;
    $('#ranking-list').innerHTML = sorted.map((p, i) => {
      const st = playerStats(p.id);
      const onFire = st.streakWin && st.streak >= 5;
      const badges = BADGES.filter((b) => ach[p.id].has(b.id)).map((b) => `<span class="mini-badge" title="${esc(b.name)}">${b.icon}</span>`).join('');
      if (bal[p.id] !== lastBal) { pos = i; lastBal = bal[p.id]; } // empates comparten puesto
      const d = today[p.id] || 0;
      const prev = prevBal[p.id];
      const flash = prev === undefined || prev === bal[p.id] ? '' : (bal[p.id] > prev ? 'flash-up' : 'flash-down');
      return `
        <li class="rank-row pos-${pos + 1} ${bal[p.id] <= 0 ? 'broke' : ''} ${mine && mine.id === p.id ? 'is-me' : ''} ${onFire && !mask ? 'on-fire' : ''} ${mask ? 'masked' : ''}">
          <div class="pos">${pos < 3 ? MEDALS[pos] : '#' + (pos + 1)}</div>
          <div class="avatar">${mask ? mask.icon : face(p)}</div>
          ${mask ? `<div class="info"><div class="name">${mask.name} ${mine && mine.id === p.id ? '<span class="tag me-tag">TÚ</span>' : ''}</div><div class="sub">Identidad protegida por el Partido</div></div>` : `
          <div class="info">
            <div class="name">${esc(p.name)} ${fireHtml(st)}${p.id === bankId() ? '<span class="tag bank-tag">🎩 BANCA</span>' : ''}${mine && mine.id === p.id ? '<span class="tag me-tag">TÚ</span>' : ''}${morosos.has(p.id) ? '<span class="tag moroso">MOROSO</span>' : ''}${bal[p.id] <= 0 ? '<span class="tag broke-tag">EN BANCARROTA</span>' : ''}</div>
            <div class="sub">${isEnd ? '' : `Apuesta máx.: ${maxBetFor(bal[p.id])}`}${badges ? ` <span class="badges-inline">${badges}</span>` : ''}${MODULES.map((m) => (m.rankExtra ? m.rankExtra(p.id, st) : '')).join('')}</div>
          </div>`}
          <div class="chips ${flash}">
            <div class="amount">${bal[p.id]}</div>
            ${mask ? '<div class="delta">☭</div>' : `<div class="delta ${d > 0 ? 'up' : d < 0 ? 'down' : ''}">${d > 0 ? '▲ ' + d : d < 0 ? '▼ ' + -d : '—'} <span>hoy</span></div>`}
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

    renderRankChart(bal);
  }

  // ------------------------------------------------------------
  //  Gráficas
  //  Máximo 3 jugadores destacados con color; el resto en gris.
  //  El color sigue al jugador mientras esté destacado (no al puesto).
  // ------------------------------------------------------------
  const CHART_COLORS = ['#3987e5', '#d95926', '#199e70']; // validados para daltonismo sobre el fondo oscuro
  let chartSel = null; // { playerId: índice de color }

  function chartSelection(bal) {
    if (!chartSel) {
      chartSel = {};
      try { chartSel = JSON.parse(localStorage.getItem('mn_chart_sel')) || null; } catch (e) { chartSel = null; }
      if (!chartSel) {
        chartSel = {};
        const mine = me();
        const ids = [...(mine ? [mine.id] : []), ...sortedPlayers(bal).map((p) => p.id)];
        [...new Set(ids)].slice(0, 3).forEach((id, i) => { chartSel[id] = i; });
      }
    }
    Object.keys(chartSel).forEach((id) => { if (!S.players.some((p) => p.id === id)) delete chartSel[id]; });
    return chartSel;
  }

  function toggleChartPlayer(id) {
    if (id in chartSel) delete chartSel[id];
    else {
      const used = new Set(Object.values(chartSel));
      const free = [0, 1, 2].find((i) => !used.has(i));
      if (free === undefined) return toast('Máximo 3 jugadores destacados. Quita uno primero.', 'bad');
      chartSel[id] = free;
    }
    try { localStorage.setItem('mn_chart_sel', JSON.stringify(chartSel)); } catch (e) { /* nada */ }
    renderRankChart(balances());
  }

  const chartRange = () => {
    const first = S.txs.length ? S.txs[0].ts : Date.now();
    return { xMin: first, xMax: Math.min(Date.now(), endTs()) };
  };

  function renderRankChart(bal) {
    if (!S.players.length) { $('#rank-chart').innerHTML = ''; $('#rank-chart-legend').innerHTML = ''; return; }
    const mask = rankMask();
    if (mask) { $('#rank-chart').innerHTML = `<div class="censored">${mask.chart}</div>`; $('#rank-chart-legend').innerHTML = ''; return; }
    const sel = chartSelection(bal);
    const series = balanceSeries();
    const list = sortedPlayers(bal).map((p) => ({
      id: p.id, label: `${p.emoji} ${p.name}`, points: series[p.id],
      color: p.id in sel ? CHART_COLORS[sel[p.id]] : null,
    })).filter((s) => s.points.length);
    MNChart.render($('#rank-chart'), list, chartRange());
    $('#rank-chart-legend').innerHTML = sortedPlayers(bal).map((p) => {
      const on = p.id in sel;
      return `<button type="button" class="legend-chip ${on ? 'on' : ''}" data-chart="${esc(p.id)}" aria-pressed="${on}">
        <span class="c-sw" style="background:${on ? CHART_COLORS[sel[p.id]] : 'transparent'}"></span>${esc(p.emoji)} ${esc(p.name)}</button>`;
    }).join('');
  }

  function renderProfileChart(mine) {
    const series = balanceSeries();
    const list = S.players.map((p) => ({
      id: p.id, label: p.id === mine.id ? 'Tú' : `${p.emoji} ${p.name}`, points: series[p.id],
      color: p.id === mine.id ? CHART_COLORS[0] : null,
    })).filter((s) => s.points.length);
    MNChart.render($('#pf-chart'), list, Object.assign(chartRange(), { height: 180 }));
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
    g.innerHTML = (S.settings.games || []).filter((x) => !appGameOf(x)).map((x) => `<option>${esc(x)}</option>`).join('') + '<option value="__other">Otro…</option>';
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
    range.disabled = bet.disabled = max <= 0 || allBox.checked;

    if (winner && winner !== a && winner !== b) winner = null;
    const pick = $('#d-winner');
    if (a && b && a !== b) {
      pick.innerHTML = [a, b].map((id) => {
        const p = player(id);
        return `<button type="button" data-win="${esc(id)}" class="${winner === id ? 'selected' : ''}">
          <span class="crown">👑</span><span class="emoji">${face(p)}</span>${esc(p.name)}</button>`;
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
      id: Store.uid(), type: 'duel', ts: Date.now(), challenger: a, winner, loser, amount, game, bank: 'direct',
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
  let gameKind = 'app';
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
    // Dos tipos de juego, cada uno con su botón: dentro de la app o en persona
    const app = MN.appGames ? MN.appGames.list() : [];
    const irl = (S.settings.games || []).filter((x) => !appGameOf(x));
    $$('#c-kind [data-kind]').forEach((b) => b.classList.toggle('on', b.dataset.kind === gameKind));
    g.innerHTML = gameKind === 'app' && app.length
      ? app.map((x) => `<option value="${esc(x.name)}">${x.icon} ${esc(x.name)}</option>`).join('')
      : irl.map((x) => `<option value="${esc(x)}">${esc(x)}</option>`).join('') + '<option value="__other">Otro…</option>';
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
    else if (challengeBlock(mine.id, rival)) msg = challengeBlock(mine.id, rival);
    else {
      max = pairMax(mine.id, rival, bal);
      if (max <= 0) msg = bal[mine.id] <= 0 ? 'Estás en bancarrota: pásate por la Banca 🏦' : `<b>${esc(player(rival).name)}</b> está en bancarrota.`;
      else msg = `Máximo <b>${max}</b> fichas <span class="muted">(${currentPct()}% del capital del más pobre)</span><br><span class="muted">Tú: ${bal[mine.id]} · ${esc(player(rival).name)}: ${bal[rival]}</span>`;
    }
    // ALL IN: disponible si aún no lo has gastado
    const allWrap = $('#c-allin-wrap'); const allBox = $('#c-allin');
    const canAll = !ended() && rival && !challengeBlock(mine.id, rival) && !allInUsed(mine.id) && allInAmount(mine.id, rival, bal) > 0;
    allWrap.hidden = !canAll; if (!canAll) allBox.checked = false;
    $('#c-allin-label').innerHTML = allInUsed(mine.id) ? '' : '💣 <b>ALL IN</b>: os jugáis todas las fichas. <span class="muted">Solo puedes hacerlo una vez en toda la partida.</span>';
    if (allBox.checked) {
      max = allInAmount(mine.id, rival, bal);
      msg = `💣 <b>ALL IN</b> por <b>${max}</b> fichas <span class="muted">(todo lo que tiene el más pobre de los dos; se recalcula al aceptar)</span>`;
      bet.value = max;
    }
    $('#challenge-form').classList.toggle('allin-on', allBox.checked);
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
        status = c.allIn ? `💣 <b class="who">${esc(rival.name)}</b> te reta a un <b>ALL IN</b>: os jugáis todas las fichas. ¿Aceptas?` : `🔔 <b class="who">${esc(rival.name)}</b> te reta. ¿Aceptas?`;
        actions = btn('accept', '✅ Aceptar', 'primary') + btn('reject', '🐔 Rechazar', 'ghost');
      } else if (mineC) {
        status = `⏳ Esperando respuesta de <b class="who">${esc(rival.name)}</b>…`;
        actions = btn('cancel', 'Cancelar reto', 'ghost');
      } else {
        status = '⏳ Pendiente de respuesta… ¿se acobardará?';
      }
    } else if (c.status === 'accepted' && isAgGame(c)) {
      const G = MN.appGames.GAMES[agId(c)];
      const played = [c.from, c.to].filter((id) => agOver(c, id)).length;
      if (mineC && !agMine(c, myId) && agStarted(c, myId)) {
        if (agQuit(c, myId)) status = `${G.icon} Empezaste tu turno y no lo terminaste: cuenta como abandonado.`;
        else { status = `${G.icon} Tu turno se quedó a medias. Puedes seguir por donde ibas (la ronda que estabas jugando cuenta como fallada).`; actions = btn('agplay', '▶ Continuar mi turno', 'primary'); }
      } else if (mineC && !agMine(c, myId)) {
        status = `${G.icon} ¡A jugar! Cada uno juega su turno en la app y gana quien saque más puntos.${agOver(c, rivalOf(c, myId)) ? ` <b class="who">${esc(rival.name)}</b> ya ha jugado.` : ''}`;
        actions = btn('agplay', `${G.icon} Jugar mi turno`, 'primary');
      } else if (mineC) {
        status = `${G.icon} Tu resultado: <b>${esc(c['agl_' + myId] || '…')}</b>. Esperando a que juegue <b class="who">${esc(rival.name)}</b>…`;
      } else {
        status = `${G.icon} Duelo en la app · ${played}/2 han jugado`;
      }
    } else if (c.status === 'accepted' && isSwGame(c)) {
      const played = [c.from, c.to].filter((id) => c['sw_' + id] != null).length;
      if (mineC && c['sw_' + myId] == null) {
        status = `⏱️ ¡A jugar! Para el reloj lo más cerca posible de <b>${esc(S.settings.stopwatchTarget || 10)},00 s</b>. Gana quien más se acerque.`;
        actions = btn('swplay', '⏱️ Jugar mi turno', 'primary');
      } else if (mineC) {
        status = `⏱️ Tu marca: <b>${swSecs(c['sw_' + myId])} s</b>. Esperando a que juegue <b class="who">${esc(rival.name)}</b>…`;
      } else {
        status = `⏱️ Duelo de cronómetro · ${played}/2 han jugado`;
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

    return `<li class="challenge status-${c.status} ${mineC && needsMe(c, myId) ? 'needs-me' : ''} ${c.allIn ? 'allin' : ''}">
      ${c.allIn ? '<div class="allin-ribbon">💣 ALL IN</div>' : ''}
      <div class="ch-head">${from}<span class="ch-vs">VS</span>${to}${c.tag ? `<span class="tag">${esc(c.tag)}</span>` : ''}<span class="ch-amount">${c.allIn && c.status === 'pending' ? allInAmount(c.from, c.to) : c.amount}</span></div>
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

    const n = (myId ? list.filter((c) => needsMe(c, myId)).length : 0)
      + MODULES.reduce((a, m) => a + (m.duelBadge ? m.duelBadge() : 0), 0);
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
        if (!before && c.status === 'pending' && c.to === id) msgs.push(c.allIn ? `💣 ${r} te reta a un ALL IN a ${esc(c.game)}: ¡os jugáis todas las fichas!` : `⚔️ ${r} te reta a ${esc(c.game)} por ${c.amount} fichas`);
        else if (before === 'pending' && c.status === 'accepted' && c.from === id) msgs.push(`✅ ${r} ha aceptado tu reto. ¡A jugar!`);
        else if (c.status === 'rejected' && c.from === id) msgs.push(`🐔 ${r} ha rechazado tu reto`);
        else if (c.status === 'expired' && c.from === id) msgs.push(`⌛ ${r} no contestó a tu reto y ha caducado`);
        else if (c.status === 'cancelled' && c.cancelledBy !== id) msgs.push(`🚫 Se ha cancelado el reto con ${r}`);
        else if (c.status === 'reported' && c.reportedBy !== id) msgs.push(`⚖️ ${r} ha registrado el resultado. Confírmalo.`);
        else if (c.status === 'done' && c.swAuto && c.finishedBy !== id) msgs.push(c.winner === id ? `⏱️ ¡Ganas el cronómetro contra ${r}! ${swSecs(c['sw_' + id])} s contra ${swSecs(c['sw_' + rivalOf(c, id)])} s` : `⏱️ ${r} te gana al cronómetro: ${swSecs(c['sw_' + rivalOf(c, id)])} s contra tus ${swSecs(c['sw_' + id])} s`);
        else if (c.status === 'done' && c.agAuto && c.finishedBy !== id) msgs.push(c.winner === id ? `🏆 ¡Le ganas a ${r} en ${esc(c.game)}! ${esc(agLabel(c, id))}` : `😵 ${r} te gana en ${esc(c.game)}: ${esc(agLabel(c, rivalOf(c, id)))}`);
        else if (c.status === 'done' && c.reportedBy === id) msgs.push(`💰 ${r} ha confirmado el resultado`);
        else if (before === 'reported' && c.status === 'accepted' && c.disputedBy && c.disputedBy !== id) msgs.push(`❌ ${r} no está de acuerdo con el resultado`);
      });
      if (msgs.length) notify(msgs);
      // Te acaban de retar: ventana con la cara de quien te reta
      const fresh = S.challenges.filter((c) => !prevCh[c.id] && c.status === 'pending' && c.to === id);
      if (fresh.length) challengePopup(fresh[fresh.length - 1]);
    }
    prevCh = now;
  }

  let rejectNow = false;
  document.addEventListener('click', (e) => { if (e.target.closest('#cp-reject')) { rejectNow = true; $('#modal-cancel').click(); } });
  async function challengePopup(c) {
    if (!$('#modal').hidden || document.visibilityState !== 'visible' || !$('#app-game').hidden || !$('#sw-game').hidden) return;
    const p = player(c.from);
    const ok = await modal(`<div class="challenge-pop ${c.allIn ? 'allin' : ''}">
      <div class="cp-face">${face(p)}</div>
      <div class="cp-who">${esc(p.name)}</div>
      <div class="cp-what">${c.allIn ? '💣 te reta a un <b>ALL IN</b>' : '⚔️ te reta'} a <b>${esc(c.game)}</b></div>
      <div class="cp-amount">${c.allIn ? allInAmount(c.from, c.to) : c.amount} <span>fichas</span></div>
      <button type="button" class="link cp-reject" id="cp-reject">🐔 Rechazar el reto</button>
      <p class="hint center">Si ahora no puedes, contéstalo luego desde ⚔️ Duelo.</p></div>`, '✅ Aceptar', '⏰ Más tarde');
    if (rejectNow) { rejectNow = false; go('duelo'); const r = $(`[data-act="reject"][data-id="${c.id}"]`); if (r) r.click(); return; }
    if (!ok) return; // más tarde: se queda pendiente en ⚔️ Duelo
    go('duelo');
    const b = $(`[data-act="accept"][data-id="${c.id}"]`);
    if (b) b.click();
  }

  // Aviso a todos cuando alguien nuevo se sienta a la mesa (mismo texto que la push del servidor)
  let prevPlayers = null;
  function notifyPlayers() {
    const mine = me(); const ids = new Set(S.players.map((p) => p.id));
    if (prevPlayers && mine) {
      const msgs = S.players.filter((p) => !prevPlayers.has(p.id) && p.id !== mine.id && !p.demo)
        .map((p) => `🎰 ${esc(p.name)} se ha sentado a la mesa. ¡Ya sois ${S.players.length}!`);
      if (msgs.length) notify(msgs);
    }
    prevPlayers = ids;
  }

  // Avisos a todos cuando la Banca presta fichas y cuando un moroso salda su deuda
  // (los mismos textos que manda el servidor, para que no salgan repetidos)
  let prevLoans = null;
  function notifyLoans() {
    const mine = me(); const now = {};
    S.txs.forEach((t) => { if (t.type === 'loan' && !t.voided) now[t.id] = !!t.done; });
    if (prevLoans && mine && mine.id !== bankId()) {
      const msgs = [];
      S.txs.forEach((t) => {
        if (!(t.id in now)) return;
        const name = esc(player(t.player).name); const its = t.player === mine.id;
        if (!(t.id in prevLoans)) msgs.push(its ? `🏦 La Banca te ha prestado ${t.amount} fichas. Tu castigo: ${esc(t.punishment)}` : `🍺 ${name} ha pedido un préstamo de ${t.amount} fichas a la Banca. Castigo: ${esc(t.punishment)}`);
        else if (!prevLoans[t.id] && now[t.id]) msgs.push(its ? '✅ Has saldado tu deuda con la Banca. Ya no eres moroso' : `✅ ${name} ha cumplido su castigo (${esc(t.punishment)}) y ya no es moroso`);
      });
      if (msgs.length) notify(msgs);
    }
    prevLoans = now;
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
          const busyMe = playingNow(myId, c.id);
          if (busyMe) return toast(`⚔️ Ya tienes un reto en juego con ${esc(player(busyMe.from === myId ? busyMe.to : busyMe.from).name)}. Terminadlo antes de aceptar otro.`, 'bad');
          const max = c.allIn ? allInAmount(c.from, c.to) : pairMax(c.from, c.to);
          if (max <= 0) return toast('Alguno de los dos está en bancarrota', 'bad');
          const amount = c.allIn ? max : Math.min(c.amount, max);
          await act(() => Store.updateChallenge(c.id, { status: 'accepted', amount, acceptedAt: now }),
            c.allIn ? `💣 ALL IN aceptado: ¡os jugáis ${amount} fichas!` : amount < c.amount ? `Aceptado, pero la apuesta baja a ${amount} (el máximo actual)` : '✅ Reto aceptado. ¡A jugar!');
          break;
        }
        case 'reject': {
          const fine = Math.min(Number(S.settings.cowardFine) || 0, Math.max(0, balances()[myId]));
          const ok = await modal(`<div class="modal-icon">🐔</div>
            <p class="modal-text">¿Rechazar el reto de ${who(c.from)}?</p>
            <p class="hint center">${fine ? `La multa de cobardía es de <b>${fine}</b> fichas (se las queda la Banca).` : 'Sin multa… esta vez.'}</p>`, 'Rechazar');
          if (!ok) return;
          await act(async () => {
            let fineTxId = null;
            if (fine) {
              fineTxId = Store.uid();
              await Store.addTx({ id: fineTxId, type: 'fine', ts: now, player: myId, amount: fine, reason: `Rechazó el reto de ${player(c.from).name}`, challengeId: c.id });
            }
            await Store.updateChallenge(c.id, { status: 'rejected', closedAt: now, fineTxId });
          }, fine ? `🐔 Reto rechazado. Pagas ${fine} fichas de multa.` : '🐔 Reto rechazado');
          break;
        }
        case 'cancel':
          if (!await modal('<div class="modal-icon">🚫</div><p class="modal-text">¿Cancelar este reto?</p>', 'Cancelar reto')) return;
          await act(() => Store.updateChallenge(c.id, { status: 'cancelled', cancelledBy: myId || 'banca', closedAt: now }), 'Reto cancelado');
          break;
        case 'report': {
          const ok = await modal(`<div class="modal-icon">👑</div><p class="modal-text">¿Ha ganado ${who(winnerId)}?</p>
            <p class="hint center">${esc(player(rivalOf(c, myId)).name)} tendrá que confirmarlo.</p>
            ${winnerId === myId ? '<input name="dedication" maxlength="80" placeholder="💬 Dedicatoria para tu rival (opcional)">' : ''}`, 'Sí');
          if (!ok) return;
          await act(() => Store.updateChallenge(c.id, { status: 'reported', winner: winnerId, reportedBy: myId, reportedAt: now, dedication: (ok.dedication || '').trim() || null }), 'Resultado enviado. Falta que lo confirme tu rival.');
          break;
        }
        case 'unreport':
          await act(() => Store.updateChallenge(c.id, { status: 'accepted', winner: null, reportedBy: null, disputedBy: null }));
          break;
        case 'dispute':
          await act(() => Store.updateChallenge(c.id, { status: 'accepted', winner: null, reportedBy: null, disputes: (c.disputes || 0) + 1, disputedBy: myId }),
            (c.disputes || 0) >= 1 ? '⚠️ Otro desacuerdo… que decida la Banca' : 'Resultado rechazado. Volved a registrarlo.');
          break;
        case 'confirm': {
          let dedication = c.dedication || null;
          if (c.winner === myId) {
            const res = await modal(`<div class="modal-icon">🏆</div><p class="modal-text">¡Has ganado <b>${c.amount}</b> fichas!</p>
              <input name="dedication" maxlength="80" placeholder="💬 Dedicatoria para ${esc(player(rivalOf(c, myId)).name)} (opcional)">`, 'Cobrar');
            if (!res) return;
            dedication = (res.dedication || '').trim() || null;
          }
          await finishChallenge(Object.assign({}, c, { dedication }), c.winner, '💰 Resultado confirmado');
          break;
        }
        case 'agplay': {
          if (!isAgGame(c) || c.status !== 'accepted' || agMine(c, myId) || agQuit(c, myId) || !MN.appGames) return;
          const resuming = agStarted(c, myId);
          if (ended()) return toast('🏁 La partida ha terminado', 'bad');
          const rid = rivalOf(c, myId);
          const ghostData = c['agx_' + rid];
          const res = await MN.appGames.play(agId(c), c.id, {
            ghost: ghostData && ghostData.f ? { flaps: ghostData.f, player: player(rid) } : null,
            after: agOver(c, rid) ? `${esc(player(rid).name)} ya ha jugado: ¡ahora sale el resultado!` : `El resultado sale cuando juegue ${esc(player(rid).name)}.`,
            // Al pulsar «Empezar» ya cuenta como jugado (con 0 puntos hasta que acabe)
            onStart: () => Store.updateChallenge(c.id, { ['ags_' + myId]: Date.now() }).catch(() => {}),
            resume: resuming ? (c['agp_' + myId] || { round: 0 }) : null,
            onProgress: (p) => Store.updateChallenge(c.id, { ['agp_' + myId]: p }).catch(() => {}),
          });
          if (!res) return;
          const at = Date.now();
          const patch = { ['ag_' + myId]: res.score, ['agl_' + myId]: res.label, ['agAt_' + myId]: at };
          if (res.data) patch['agx_' + myId] = res.data;
          await act(() => Store.updateChallenge(c.id, patch));
          const cur = S.challenges.find((x) => x.id === c.id);
          const next = Object.assign({}, cur, patch);
          if (agDone(next)) await finishAg(next);
          break;
        }
        case 'swplay': {
          if (!isSwGame(c) || c.status !== 'accepted' || c['sw_' + myId] != null || !MN.stopwatchGame) return;
          if (ended()) return toast('🏁 La partida ha terminado', 'bad');
          MN.stopwatchGame({
            title: '⏱️ Duelo de cronómetro',
            sub: `contra ${who(rivalOf(c, myId))} · ${c.amount} fichas`,
            after: c['sw_' + rivalOf(c, myId)] != null ? `${esc(player(rivalOf(c, myId)).name)} ya ha jugado: ¡ahora sale el resultado!` : `El resultado sale cuando juegue ${esc(player(rivalOf(c, myId)).name)}.`,
            save: async (ms) => {
              const at = Date.now();
              await act(() => Store.updateChallenge(c.id, { ['sw_' + myId]: ms, ['swAt_' + myId]: at }));
              const cur = S.challenges.find((x) => x.id === c.id);
              const next = Object.assign({}, cur, { ['sw_' + myId]: ms, ['swAt_' + myId]: at });
              if (swDone(next)) await finishSw(next);
            },
          });
          break;
        }
        case 'force': {
          const ok = await modal(`<div class="modal-icon">🏦</div><p class="modal-text">La Banca decide: gana ${who(winnerId)}</p>`, 'Resolver');
          if (ok) await finishChallenge(c, winnerId, '🏦 La Banca ha resuelto el duelo', true);
          break;
        }
      }
    } finally {
      busy = false;
    }
  }

  async function finishChallenge(c, winnerId, msg, byBank = false, extra = {}) {
    const loser = rivalOf(c, winnerId);
    const amount = Math.max(0, Math.min(c.amount, balances()[loser])); // nunca deja a nadie en negativo
    const txId = extra.txId || Store.uid(); const now = Date.now();
    await act(async () => {
      await Store.addTx(Object.assign({ id: txId, type: 'duel', ts: now, challengeId: c.id, challenger: c.from, winner: winnerId, loser, amount, game: c.game },
        byBank ? { bank: 'resolved' } : {}, c.dedication && !byBank ? { dedication: c.dedication } : {}, c.tag ? { tag: c.tag } : {}, c.allIn ? { allIn: true } : {}, extra.tx || {}));
      await Store.updateChallenge(c.id, Object.assign({ status: 'done', winner: winnerId, txId, closedAt: now }, extra.challenge || {}));
    }, msg);
  }

  // Duelo de un juego de la app con los dos resultados: gana la puntuación más alta (empate: quien jugó antes)
  const finishingAg = new Set();
  async function finishAg(c) {
    if (finishingAg.has(c.id) || S.txs.some((t) => t.id === 'agduel_' + c.id)) return;
    finishingAg.add(c.id);
    const a = c.from; const b = c.to;
    const sa = agScore(c, a); const sb = agScore(c, b);
    const w = sa !== sb ? (sa > sb ? a : b) : ((c['agAt_' + a] || c['ags_' + a] || 0) <= (c['agAt_' + b] || c['ags_' + b] || 0) ? a : b);
    const l = rivalOf(c, w);
    const labels = { [a]: agLabel(c, a), [b]: agLabel(c, b) };
    await finishChallenge(c, w, null, false, { txId: 'agduel_' + c.id, tx: { ag: labels }, challenge: { agAuto: true, finishedBy: (me() || {}).id || null } });
    const mine = me();
    if (mine && (mine.id === w || mine.id === l)) toast(mine.id === w ? `🏆 ¡Ganas el duelo! ${esc(labels[w])} contra ${esc(labels[l])}` : `😵 Pierdes: ${esc(labels[l])} contra ${esc(labels[w])} de ${esc(player(w).name)}`, mine.id === w ? 'ok' : 'bad');
  }

  // Duelo de cronómetro con las dos marcas: se resuelve solo. El id del
  // movimiento es fijo, así que si dos móviles lo cierran a la vez no se duplica.
  const finishingSw = new Set();
  async function finishSw(c) {
    if (finishingSw.has(c.id) || S.txs.some((t) => t.id === 'swduel_' + c.id)) return;
    finishingSw.add(c.id);
    const w = swWinner(c); const l = rivalOf(c, w);
    const marks = { [c.from]: c['sw_' + c.from], [c.to]: c['sw_' + c.to] };
    await finishChallenge(c, w, null, false, { txId: 'swduel_' + c.id, tx: { sw: marks }, challenge: { swAuto: true, finishedBy: (me() || {}).id || null } });
    const mine = me();
    if (mine && (mine.id === w || mine.id === l)) {
      toast(mine.id === w ? `⏱️ ¡Ganas el duelo! ${swSecs(marks[w])} s contra ${swSecs(marks[l])} s` : `⏱️ Pierdes: ${swSecs(marks[l])} s contra ${swSecs(marks[w])} s de ${esc(player(w).name)}`, mine.id === w ? 'ok' : 'bad');
    }
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
    $('#tab-me').innerHTML = mine ? face(mine, 'tab') : '👤';
    if (!mine) return;

    const bal = balances();
    const sorted = sortedPlayers(bal);
    const pos = sorted.findIndex((p) => bal[p.id] === bal[mine.id]) + 1;
    const moroso = pendingPunishments().some((t) => t.player === mine.id);

    $('#pf-avatar').innerHTML = face(mine);
    $('#pf-name').innerHTML = esc(mine.name) + (moroso ? ' <span class="tag moroso">MOROSO</span>' : '');
    $('#pf-pos').textContent = `${pos <= 3 ? MEDALS[pos - 1] + ' ' : ''}Puesto ${pos} de ${sorted.length} · Apuesta máx.: ${maxBetFor(bal[mine.id])}`;
    $('#pf-chips').textContent = bal[mine.id];

    const st = playerStats(mine.id);
    const rival = (entry) => (entry ? `${esc(player(entry[0]).emoji)} ${esc(player(entry[0]).name)}` : '—');
    $('#pf-stats').innerHTML = `
      <div class="stat"><b>${st.won}-${st.lost}</b><span>victorias-derrotas</span></div>
      <div class="stat"><b>${st.total ? Math.round((st.won / st.total) * 100) + '%' : '—'}</b><span>de victorias</span></div>
      <div class="stat"><b>${fireHtml(st, true) || (st.streak ? (st.streakWin ? '' : '🧊 ') + st.streak : '—')}</b><span>${st.streak ? (st.streakWin ? 'racha ganando' : 'racha perdiendo') : 'racha'}</span></div>
      <div class="stat"><b>${st.best ? st.best.amount : '—'}</b><span>mayor golpe</span></div>
      <div class="stat stat-text"><b>${rival(st.nemesis)}</b><span>némesis${st.nemesis ? ` (${st.nemesis[1]})` : ''}</span></div>
      <div class="stat stat-text"><b>${rival(st.victim)}</b><span>víctima favorita${st.victim ? ` (+${st.victim[1]})` : ''}</span></div>`;

    const ach = achievements()[mine.id];
    $('#pf-badges').innerHTML = BADGES.map((b) => `
      <li class="badge-item ${ach.has(b.id) ? 'earned' : ''}">
        <span class="badge-icon">${b.icon}</span>
        <span><b>${esc(b.name)}</b><br><span class="muted small">${esc(b.desc)}</span></span>
      </li>`).join('');
    renderProfileChart(mine);

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
  //  RENDER: NORMAS (las cifras salen de las reglas de la Banca)
  // ============================================================
  let peekRules = false; // leyendo las normas desde la pantalla de bienvenida

  function renderRules() {
    const s = S.settings;
    const n = (v) => `<b>${esc(v)}</b>`;
    const hours = (h) => `${n(h)} ${Number(h) === 1 ? 'hora' : 'horas'}`;
    const longDate = (v) => new Date(v).toLocaleString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
    const endTxt = longDate(s.endDate);
    const startTxt = longDate(s.startDate);
    const sched = schedule();
    const cur = currentPct();
    const fine = Number(s.cowardFine) || 0;
    const cooldown = Number(s.rejectCooldownHours) || 0;
    const section = (icon, title, body) => `<div class="card rule"><h3>${icon} ${title}</h3>${body}</div>`;

    $('#rules').innerHTML = [
      section('🎯', 'El objetivo', `
        <ul>
          <li>Cada jugador empieza con ${n(s.startChips)} fichas.</li>
          <li>Las fichas se ganan y se pierden retando a otros jugadores a minijuegos.</li>
          <li>La mesa abre el ${n(startTxt)} y cierra el ${n(endTxt)}.</li>
          <li>Quien tenga más fichas al cierre <b>gana el premio</b>.</li>
        </ul>`),
      section('⚔️', 'Cómo funciona un reto', `
        <ol>
          <li>Eliges rival, minijuego y cuántas fichas os jugáis.</li>
          <li>El rival lo <b>acepta</b> o lo <b>rechaza</b> (ver cobardía 🐔).</li>
          <li>Jugáis en la vida real.</li>
          <li>Uno de los dos registra quién ha ganado y <b>el otro lo confirma</b>. Hasta entonces no se mueve ninguna ficha.</li>
          <li>💣 <b>ALL IN</b>: una vez en toda la partida, cada uno puede retar a alguien a jugarse <b>todas las fichas</b> (las del más pobre de los dos), sin límite de apuesta. Si te lo rechazan, lo recuperas.</li>
          <li>⏱️ Los retos de <b>cronómetro</b> se juegan dentro de la app: cada uno para el reloj en su móvil (un intento) y gana automáticamente quien más se acerque a ${n(s.stopwatchTarget || 10)},00 s.</li>
        </ol>
        <ul>
          <li>Si no estáis de acuerdo con el resultado, se vuelve a registrar. Si seguís sin poneros de acuerdo, <b>decide la Banca</b>.</li>
          <li>Solo puede haber <b>un reto abierto</b> entre las mismas dos personas.</li>
          <li>Los <b>empates</b> no se registran: cada uno se queda con sus fichas.</li>
        </ul>`),
      section('💰', 'Límite de apuesta', `
        <p>Para que nadie se arruine de un golpe, lo máximo que se puede apostar es un <b>porcentaje del capital del más pobre</b> de los dos (nunca menos de ${n(s.minBet)} fichas ni más de lo que tiene).</p>
        <p>El porcentaje sube según se acerca el final:</p>
        <table class="rule-table">
          ${sched.map((x, i) => `<tr class="${x.pct === cur && dayStart(x.from) <= Date.now() && (!sched[i + 1] || dayStart(sched[i + 1].from) > Date.now()) ? 'current' : ''}">
            <td>${i === 0 ? 'Al empezar' : `Desde el ${esc(fmtFrom(x.from))}`}</td><td><b>${esc(x.pct)}%</b></td></tr>`).join('')}
        </table>
        <p class="hint">Ahora mismo: ${n(cur + '%')}. Al aceptar un reto se vuelve a comprobar el límite: si alguien ha perdido fichas mientras tanto, la apuesta baja sola.</p>`),
      section('🐔', 'Multa de cobardía', fine ? `
        <p>Rechazar un reto cuesta ${n(fine)} ${fine === 1 ? 'ficha' : 'fichas'}. La multa <b>se la queda la Banca</b>, no el que te reta.</p>
        <p>Quien rechace 3 retos se gana la insignia de <b>🐔 Gallina</b> para siempre.</p>` : `
        <p>Ahora mismo rechazar un reto <b>no tiene multa</b>. Pero quien rechace 3 retos se gana la insignia de <b>🐔 Gallina</b> para siempre.</p>`),
      section('🛡️', 'Anti-spam (para los pillos)', `
        <ul>
          <li>Nadie puede tener más de ${n(s.maxPendingOut)} retos enviados sin contestar a la vez.</li>
          ${cooldown ? `<li>Si alguien te rechaza un reto, no puedes volver a retarle hasta que pasen ${hours(cooldown)}.</li>` : ''}
          <li>Los retos sin respuesta <b>caducan</b> a las ${hours(s.challengeExpiryHours)}, sin multa para nadie.</li>
          <li>Como las multas van a la Banca, spamear retos no te da ni una ficha.</li>
        </ul>`),
      section('🏦', 'Préstamos y morosidad', `
        <ul>
          <li>Si te quedas con menos de ${n(s.minBet)} fichas, puedes pedirle un préstamo a la Banca (normalmente ${n(s.loanAmount)} fichas).</li>
          <li>El préstamo <b>no se devuelve en fichas</b>: se paga con un <b>castigo</b> (chupito, fregar los platos…).</li>
          <li>Hasta que cumplas el castigo apareces como <span class="tag moroso">MOROSO</span> en el ranking y en el <b>Muro de la vergüenza</b>.</li>
          <li>La Banca decide cuándo un castigo está cumplido.</li>
        </ul>`),
      section('🔥', 'Rachas e insignias', `
        <p>Con 3 victorias seguidas te sale el fuego 🔥 en el ranking. Cuanto más larga la racha, más arde.</p>
        <ul class="rule-badges">
          ${BADGES.map((b) => `<li><span>${b.icon}</span><b>${esc(b.name)}</b>: ${esc(b.desc.charAt(0).toLowerCase() + b.desc.slice(1))}.</li>`).join('')}
        </ul>
        <p class="hint">Las insignias son para siempre: no se pierden aunque luego remontes.</p>`),
      section('👤', 'Tu jugador', `
        <ul>
          <li>Tu móvil queda vinculado a tu jugador la primera vez que entras.</li>
          <li>Si cambias de móvil o borras los datos del navegador, usa tu <b>código de recuperación</b> (está en tu perfil). Si lo pierdes, pídeselo a la Banca.</li>
        </ul>`),
      section('🎩', 'La Banca', `
        <ul>
          ${bankId() ? `<li>La Banca es ${who(bankId())}.</li>` : ''}
          <li>La Banca puede corregir errores, anular movimientos, resolver disputas y cambiar estas reglas.</li>
          <li>Todo lo que hace queda en el historial: los duelos que decide o registra salen marcados con 🏦.</li>
          <li>Sus decisiones son <b>inapelables</b>. La Banca siempre gana.</li>
        </ul>`),
      ...MODULES.filter((m) => m.rules).map((m) => m.rules(section)),
    ].join('') + (!me() ? '<button type="button" id="rules-back" class="btn primary wide">🪑 Sentarme a la mesa</button>' : '');
  }

  // ============================================================
  //  RENDER: BIENVENIDA
  // ============================================================
  function renderWelcome() {
    const show = !me() && !isSpectator() && !peekRules && !MODULES.some((m) => m.hidesWelcome && m.hidesWelcome());
    const w = $('#welcome');
    if (show && w.hidden) {
      // Se abre: estado inicial limpio
      $('#w-intro').hidden = false; $('#w-register').hidden = true; $('#w-recover').hidden = true;
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

    const bank = bankId();
    $('#admin-locked').hidden = admin;
    $('#admin-panel').hidden = !admin;
    $('#unlock-form').hidden = !!bank;
    $('#bank-who').innerHTML = bank ? `🎩 La Banca es ${who(bank)}.` : 'Todavía no hay Banca asignada. Entra con el PIN de arranque.';
    $('#lock-btn').hidden = !!bank;
    $$('.local-only').forEach((el) => { el.hidden = Store.mode !== 'local'; });
    if (!admin) return;

    const mine = me();
    $('#bank-info').innerHTML = bank ? `
      <p>La Banca es ${who(bank)}. Tiene los poderes en cualquier móvil vinculado a ese jugador, sin PIN.</p>
      <div class="row">
        <select id="bank-transfer"><option value="">Traspasar la Banca a…</option>${S.players.filter((p) => p.id !== bank)
          .map((p) => `<option value="${esc(p.id)}">${esc(p.emoji)} ${esc(p.name)}</option>`).join('')}</select>
        <button type="button" class="btn ghost" id="bank-transfer-btn">Traspasar</button>
      </div>` : `
      <p>No hay Banca asignada: ahora mismo cualquiera con el PIN tiene los poderes.</p>
      ${mine ? `<button type="button" class="btn primary" id="bank-claim-btn">🎩 Hacerme la Banca (${esc(mine.name)})</button>`
        : '<p class="hint">Regístrate como jugador para poder ser la Banca.</p>'}`;

    const bal = balances();
    fillPlayerSelect($('#l-player'), 'Elegir jugador…', bal);
    fillPlayerSelect($('#a-player'), 'Elegir jugador…', bal);
    $('#punish-list').innerHTML = (S.settings.punishments || []).map((x) => `<option value="${esc(x)}">`).join('');
    if (!$('#l-amount').value) $('#l-amount').value = S.settings.loanAmount;
    if (!$('#p-emoji').value) $('#p-emoji').value = randomEmoji();
    $('#p-hint').textContent = `Empezará con ${S.settings.startChips} fichas.`;

    $('#admin-players').innerHTML = S.players.map((p) => `
      <li>
        <span>${face(p, 'mini')} ${esc(p.name)} ${p.demo ? '<span class="tag">PRUEBA</span>' : ''}</span>
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
    $('#s-fine').value = s.cowardFine;
    $('#s-cooldown').value = s.rejectCooldownHours;
    $('#s-maxpend').value = s.maxPendingOut;
    $('#s-expiry').value = s.challengeExpiryHours;
    $('#s-bounty').value = s.bountyPerWin;
    $('#s-bountymin').value = s.bountyMinStreak;
    $('#s-mission').value = s.missionReward; $('#s-porra').value = s.porraStake; $('#s-lastround').value = s.lastRoundMinutes;
    $('#s-kingmin').value = s.kingMinutes; $('#s-kingevery').value = s.kingEveryMinutes; $('#s-kingtrib').value = s.kingTribute;
    $('#s-porraclose').value = s.porraCloseDate || '';
    $('#s-startdate').value = s.startDate;
    $('#s-end').value = s.endDate;
    $('#s-schedule').value = schedule().map((x) => `${x.from.replace('T', ' ')} = ${x.pct}`).join('\n');
    $('#s-games').value = (s.games || []).join('\n');
    $('#s-punish').value = (s.punishments || []).join('\n');
  }

  // Marca como caducados los retos sin respuesta (lo hace el primer dispositivo que lo vea)
  const expiring = new Set();
  function sweepExpired() {
    S.challenges.filter((c) => isExpired(c) && !expiring.has(c.id)).forEach((c) => {
      expiring.add(c.id);
      Store.updateChallenge(c.id, { status: 'expired', closedAt: Date.now() }).catch(() => expiring.delete(c.id));
    });
  }

  function renderImpBanner() {
    const imp = impersonating() && me() && me().id !== bankId();
    $('#imp-banner').hidden = !imp;
    if (imp) $('#imp-banner').innerHTML = `🎭 Estás haciendo de <b>${esc(me().name)}</b> (pruebas) <button type="button" class="mini" id="imp-back">Volver a ser ${esc(player(bankId()).name)}</button>`;
  }

  function renderAll() {
    if (!S) return;
    sweepExpired();
    S.challenges.filter(agDone).forEach((c) => { if (c.from === (me() || {}).id || c.to === (me() || {}).id || isAdmin()) finishAg(c); });
    S.challenges.filter(swDone).forEach((c) => { if (c.from === (me() || {}).id || c.to === (me() || {}).id || isAdmin()) finishSw(c); });
    renderImpBanner();
    renderRanking();
    renderChallengeForm();
    renderChallenges();
    renderDuelForm();
    renderHistory();
    renderProfile();
    renderBanca();
    renderRules();
    MODULES.forEach((m) => { try { if (m.render) m.render(); } catch (e) { console.error(e); } });
    renderWelcome();
  }

  // Barrido: cada módulo genera los movimientos automáticos que falten (premios,
  // eventos vencidos…). Los ids son deterministas, así que repetirlo no duplica nada.
  let sweeping = false;
  async function sweepAll() {
    if (sweeping || !S) return;
    sweeping = true;
    try {
      for (const m of MODULES) if (m.sweep) await m.sweep();
    } catch (e) { console.error(e); } finally { sweeping = false; }
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
      // Los últimos 5 duelos los gana el mismo jugador, para que haya alguien "en racha"
      const hot = players[0]; const streaky = k >= 13;
      const [a, b] = streaky ? [hot, shuffle(players.slice(1))[0]] : shuffle(players.slice());
      const max = Math.min(maxBetFor(bal[a.id]), maxBetFor(bal[b.id]));
      if (max <= 0) continue;
      const amount = Math.max(1, Math.round(max * (0.4 + Math.random() * 0.6)));
      const [w, l] = streaky || Math.random() < 0.5 ? [a, b] : [b, a];
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
    const pre = !started();
    const ms = (pre ? startTs() : endTs()) - Date.now();
    const el = $('#countdown');
    el.classList.toggle('pre', pre);
    if (!pre && ms <= 0) {
      el.innerHTML = '<div class="cd-label">La mesa está</div><div class="cd-time">CERRADA</div>';
    } else {
      const d = Math.floor(ms / 86400000);
      const h = Math.floor(ms / 3600000) % 24;
      const m = Math.floor(ms / 60000) % 60;
      const s = Math.floor(ms / 1000) % 60;
      el.innerHTML = `<div class="cd-label">${pre ? 'La mesa abre en' : 'Cierre de la mesa'}</div><div class="cd-time">${d > 0 ? d + '<small>d</small> ' : ''}${pad(h)}:${pad(m)}:${pad(s)}</div>`;
      el.classList.toggle('urgent', !pre && ms < 3600000);
    }
    MODULES.forEach((mod) => { try { if (mod.tick) mod.tick(); } catch (err) { console.error(err); } });
    const e = (pre ? 'pre' : ms <= 0 ? 'end' : 'live');
    if (wasEnded !== null && e !== wasEnded) renderAll();
    wasEnded = e;
  }

  // ============================================================
  //  EVENTOS
  // ============================================================
  function bindEvents() {
    $$('.tabs button, #me-btn').forEach((b) => b.addEventListener('click', () => go(b.dataset.view)));
    $('#rules-btn').addEventListener('click', () => go('normas'));
    $('#w-rules').addEventListener('click', () => { peekRules = true; renderWelcome(); go('normas'); });
    $('#rules').addEventListener('click', (e) => {
      if (e.target.closest('#rules-back')) { setSpectator(false); peekRules = false; renderWelcome(); }
    });

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
    $('#c-allin').addEventListener('change', updateChallengeForm);
    $('#c-kind').addEventListener('click', (e) => { const b = e.target.closest('[data-kind]'); if (!b) return; gameKind = b.dataset.kind; $('#c-game').value = ''; renderChallengeForm(); });
    $('#c-game').addEventListener('change', () => { $('#c-game-other').hidden = $('#c-game').value !== '__other'; });
    $('#c-bet-range').addEventListener('input', (e) => { $('#c-bet').value = e.target.value; });
    $('#c-bet').addEventListener('input', (e) => { $('#c-bet-range').value = e.target.value; });
    $('#c-register').addEventListener('click', () => { setSpectator(false); renderAll(); });
    $('#my-challenges').addEventListener('click', challengeAction);
    $('#rank-chart-legend').addEventListener('click', (e) => {
      const b = e.target.closest('[data-chart]'); if (b) toggleChartPlayer(b.dataset.chart);
    });
    let resizeTimer;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => { if (S) { renderRankChart(balances()); renderProfile(); } }, 150);
    });
    $('#live-challenges').addEventListener('click', challengeAction);
    $('#challenge-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const mine = me(); if (!mine) return;
      const rival = $('#c-rival').value;
      const amount = parseInt($('#c-bet').value, 10);
      if (ended()) return toast('🏁 La partida ha terminado', 'bad');
      if (!rival) return toast('Elige a tu rival', 'bad');
      const block = challengeBlock(mine.id, rival);
      if (block) return toast(block, 'bad');
      const allIn = $('#c-allin').checked;
      if (allIn && allInUsed(mine.id)) return toast('Ya has usado tu ALL IN', 'bad');
      const max = allIn ? allInAmount(mine.id, rival) : pairMax(mine.id, rival);
      if (allIn && !max) return toast('Alguno de los dos está en bancarrota', 'bad');
      if (!allIn && (!amount || amount < 1 || amount > max)) return toast(`La apuesta debe estar entre 1 y ${max}`, 'bad');
      let game = $('#c-game').value;
      if (game === '__other') game = $('#c-game-other').value.trim() || 'Minijuego misterioso';
      if (allIn && !await modal(`<div class="modal-icon">💣</div><p class="modal-text">¿ALL IN contra ${who(rival)}?</p>
        <p class="hint center">Os jugáis <b>${max}</b> fichas a ${esc(game)}. Solo puedes lanzar <b>un ALL IN en toda la partida</b> (si lo rechaza, lo recuperas).</p>`, '💣 ¡Vamos!')) return;
      const doc = Object.assign({ id: Store.uid(), from: mine.id, to: rival, game, amount: allIn ? max : amount, status: 'pending', createdAt: Date.now() }, allIn ? { allIn: true } : {});
      const done = await act(async () => {
        for (const m of MODULES) if (m.beforeChallenge) await m.beforeChallenge(doc);
        await Store.addChallenge(doc);
      }, doc.forced ? `🎯 Reto obligatorio enviado: ${esc(player(rival).name)} no puede negarse` : allIn ? `💣 ALL IN enviado a ${esc(player(rival).name)}` : `⚔️ Reto enviado a ${esc(player(rival).name)}`);
      if (done) { $('#c-allin').checked = false; $('#c-rival').value = ''; $('#c-bet').value = ''; $('#c-game-other').value = ''; updateChallengeForm(); window.scrollTo(0, 0); }
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
      if (bankId()) return toast('Ya hay Banca: el PIN ya no sirve', 'bad');
      if ($('#pin').value === String(S.settings.adminPin)) {
        setAdmin(true); $('#pin').value = '';
        fillSettingsForm(); renderAll(); toast('🏦 La Banca abre sus puertas', 'ok');
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
        const m = l.match(/^(\d{4}-\d{2}-\d{2})(?:[ T](\d{1,2}:\d{2}))?\s*[=:\-]?\s*(\d+(?:\.\d+)?)\s*%?$/);
        return m ? { from: m[2] ? `${m[1]}T${m[2].padStart(5, '0')}` : m[1], pct: Number(m[3]) } : null;
      });
      if (sched.some((x) => !x)) return toast('Revisa el formato del límite: AAAA-MM-DD = 10 o AAAA-MM-DD HH:MM = 50', 'bad');
      const pin = $('#s-pin').value.trim();
      if (!pin) return toast('El PIN no puede estar vacío', 'bad');
      const s = {
        startChips: parseInt($('#s-start').value, 10) || Store.DEFAULTS.startChips,
        minBet: parseInt($('#s-min').value, 10) || Store.DEFAULTS.minBet,
        loanAmount: parseInt($('#s-loan').value, 10) || Store.DEFAULTS.loanAmount,
        adminPin: pin,
        cowardFine: Math.max(0, parseInt($('#s-fine').value, 10) || 0),
        rejectCooldownHours: Math.max(0, parseFloat($('#s-cooldown').value) || 0),
        maxPendingOut: Math.max(1, parseInt($('#s-maxpend').value, 10) || Store.DEFAULTS.maxPendingOut),
        challengeExpiryHours: Math.max(1, parseFloat($('#s-expiry').value) || Store.DEFAULTS.challengeExpiryHours),
        bountyPerWin: Math.max(0, parseInt($('#s-bounty').value, 10) || 0),
        bountyMinStreak: Math.max(1, parseInt($('#s-bountymin').value, 10) || Store.DEFAULTS.bountyMinStreak),
        missionReward: Math.max(0, parseInt($('#s-mission').value, 10) || 0),
        porraStake: Math.max(1, parseInt($('#s-porra').value, 10) || Store.DEFAULTS.porraStake),
        porraCloseDate: $('#s-porraclose').value || Store.DEFAULTS.porraCloseDate,
        lastRoundMinutes: Math.max(0, parseInt($('#s-lastround').value, 10) || 0),
        kingMinutes: Math.max(1, parseInt($('#s-kingmin').value, 10) || Store.DEFAULTS.kingMinutes),
        kingEveryMinutes: Math.max(1, parseInt($('#s-kingevery').value, 10) || Store.DEFAULTS.kingEveryMinutes),
        kingTribute: Math.max(1, parseInt($('#s-kingtrib').value, 10) || Store.DEFAULTS.kingTribute),
        startDate: $('#s-startdate').value || Store.DEFAULTS.startDate,
        endDate: $('#s-end').value || Store.DEFAULTS.endDate,
        limitSchedule: sched.length ? sched : Store.DEFAULTS.limitSchedule,
        games: lines($('#s-games').value),
        punishments: lines($('#s-punish').value),
      };
      act(() => Store.saveSettings(Object.assign({}, S.settings, s)), '⚙️ Reglas guardadas');
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
      const done = await act(() => Store.addMany({ players: [p], txs: [init] }), `🪑 ${esc(name)} se sienta a la mesa con ${init.amount} fichas`);
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
      try {
        if (target.id === bankId()) localStorage.removeItem('mn_impersonator');
        else if (mine && mine.id === bankId()) localStorage.setItem('mn_impersonator', mine.id);
      } catch (e) { /* nada */ }
      act(async () => {
        if (mine) await Store.updatePlayer(mine.id, { deviceIds: (mine.deviceIds || []).filter((d) => d !== dev) });
        await Store.updatePlayer(target.id, { deviceIds: [...new Set([...(target.deviceIds || []), dev])] });
      }, `🎭 Ahora eres ${esc(target.name)}`);
    });
    $('#imp-banner').addEventListener('click', async (e) => {
      if (!e.target.closest('#imp-back')) return;
      const mine = me(); const bank = player(bankId()); const dev = deviceId();
      try { localStorage.removeItem('mn_impersonator'); } catch (err) { /* nada */ }
      act(async () => {
        if (mine) await Store.updatePlayer(mine.id, { deviceIds: (mine.deviceIds || []).filter((d) => d !== dev) });
        await Store.updatePlayer(bank.id, { deviceIds: [...new Set([...(bank.deviceIds || []), dev])] });
      }, `🎩 Vuelves a ser ${esc(bank.name)}`);
    });
    $('#bank-info').addEventListener('click', async (e) => {
      if (e.target.closest('#bank-claim-btn')) {
        const mine = me(); if (!mine) return;
        act(() => Store.saveSettings(Object.assign({}, S.settings, { bankPlayerId: mine.id })), `🎩 ${esc(mine.name)} es ahora la Banca`);
      }
      if (e.target.closest('#bank-transfer-btn')) {
        const pid = $('#bank-transfer').value; if (!pid) return toast('Elige a quién', 'bad');
        const ok = await modal(`<div class="modal-icon">🎩</div><p class="modal-text">¿Traspasar la Banca a ${who(pid)}?</p>
          <p class="hint center">Perderás todos los poderes de la Banca.</p>`, 'Traspasar');
        if (ok) act(() => Store.saveSettings(Object.assign({}, S.settings, { bankPlayerId: pid })), 'Banca traspasada');
      }
    });
    $('#wipe-btn').addEventListener('click', async () => {
      const ok = await modal(`<div class="modal-icon">🧨</div>
        <p class="modal-text">¿Borrar <b>todos</b> los jugadores y movimientos?</p>
        <p class="hint center">Las reglas se mantienen. Exporta una copia antes si la quieres.</p>`, 'Borrar todo');
      if (!ok) return;
      // Partida como nueva: se mantienen las reglas, pero se deshace un ensayo a medias
      // y se olvida que el calendario y la Banca ya estaban creados
      const s = Object.assign({}, S.settings);
      const r = s.eventRehearsal;
      if (r) ['startDate', 'happyMinutes', 'stopwatchSignupMinutes', 'stopwatchPlayMinutes', 'communistMaskMinutes', 'plebisciteVoteMinutes', 'kingMinutes', 'kingEveryMinutes', 'dilemmaMinutes'].forEach((k) => { if (r[k] != null) s[k] = r[k]; });
      ['eventRehearsal', 'eventsSeeded', 'eventsSeeded2', 'bankPlayerId'].forEach((k) => delete s[k]);
      act(() => Store.replaceAll({ settings: s }), '🧨 Mesa limpia');
    });

    // Refresca textos relativos ("hace 5 min") y límites por fecha
    setInterval(() => { if (S) { sweepExpired(); renderRanking(); renderChallenges(); renderHistory(); renderProfile(); renderBanca(); } }, 60000);
    setInterval(tick, 1000);
    setInterval(sweepAll, 15000);
  }

  // ============================================================
  //  ARRANQUE
  // ============================================================
  async function boot() {
    $('#modal-form').onsubmit = (ev) => ev.preventDefault();
    bindEvents();
    MODULES.forEach((m) => { try { if (m.init) m.init(MN); } catch (e) { console.error(e); } });
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
        ensureBank();
        renderAll();
        notifyChallenges();
        notifyLoans();
        notifyPlayers();
        MODULES.forEach((m) => { try { if (m.onState) m.onState(first); } catch (e) { console.error(e); } });
        tick();
        setTimeout(sweepAll, 0);
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
        b.innerHTML = (window.MN_CONFIG || {}).localTest
          ? '🧪 <b>Modo pruebas</b>: estás en una partida local de este navegador, separada de la real. Quita <code>?local</code> de la dirección para volver.'
          : '⚠️ <b>Modo local</b>: los datos solo se guardan en este navegador. Configura Firebase en <code>js/config.js</code> para jugar todos juntos.';
      }
    } catch (err) {
      onError(err);
      $('#loading').textContent = '💥 No se pudo arrancar la mesa.';
    }
  }

  // ============================================================
  //  API PARA LOS MÓDULOS (js/mod-*.js)
  // ============================================================
  const MODULES = window.MNModules || [];
  const MN = {
    get S() { return S; }, get view() { return view; },
    $, $$, esc, pad, hash, shuffle, lines, HOUR, MEDALS,
    toast, modal, act, notify, go, renderAll, sweepAll,
    me, player, who, face, deviceId, isAdmin, bankId, isSpectator, setSpectator,
    balances, balancesAt, effects, sortedPlayers, playerStats, achievements, txItem, txLine,
    maxBetFor, pairMax, currentPct, started, ended, startTs, endTs, fmtDate, ago, lastRound, lastRoundTs,
    activeChallenges, challengeBlock, fillPlayerSelect, rankMask,
    registerTx: (type, def) => { TX[type] = def; },
  };
  window.MN = MN;

  boot();
})();
