// ============================================================
//  MÓDULO: EVENTOS Y CALENDARIO
//  ☭ comunista · 🍻 happy hour · 🎟️ lotería · ⏱️ cronómetro global · 🦅 fascista (plebiscito)
//  👑 rey de la colina · 🤝 dilema del prisionero
//
//  Los eventos se guardan en la colección `events` y los ejecuta el
//  primer móvil que tenga la web abierta cuando toca. Todo se calcula
//  de forma determinista (saldos en el instante del evento, sorteo a
//  partir de los boletos) y con ids fijos: si lo ejecutan varios
//  móviles a la vez, el resultado es el mismo y no se duplica.
// ============================================================
(window.MNModules = window.MNModules || []).push((function () {
  'use strict';
  let MN;
  const MIN = 60000;

  // ---------------------------------------------------------- ilustraciones
  // Cada ilustración se pinta con ids de degradado únicos: si dos SVG comparten id y el
  // primero está en una pestaña oculta, el navegador no pinta el degradado en el segundo.
  let artSeq = 0;
  const uniq = (svg) => { const k = 'a' + (++artSeq); return svg.replace(/id="(\w+)"/g, `id="$1${k}"`).replace(/url\(#(\w+)\)/g, `url(#$1${k})`); };
  const ART_SRC = {
    communist: `<svg viewBox="0 0 160 100" aria-hidden="true"><defs><radialGradient id="ga" cx="50%" cy="40%" r="70%"><stop offset="0" stop-color="#ff4d4d"/><stop offset="1" stop-color="#7a0010"/></radialGradient></defs>
      <rect width="160" height="100" fill="url(#ga)"/>
      <g fill="#ffd400" opacity=".9"><circle cx="22" cy="78" r="6"/><circle cx="138" cy="74" r="5"/><circle cx="128" cy="22" r="4"/><circle cx="30" cy="26" r="4"/></g>
      <polygon points="80,14 89,40 117,40 94,56 103,83 80,66 57,83 66,56 43,40 71,40" fill="#ffd400" stroke="#ffef8a" stroke-width="2"/>
      <text x="80" y="57" text-anchor="middle" font-size="18" fill="#a00018">☭</text></svg>`,
    happyhour: `<svg viewBox="0 0 160 100" aria-hidden="true"><defs><linearGradient id="gb" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffb347"/><stop offset="1" stop-color="#8a3a00"/></linearGradient><linearGradient id="beer" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffd54a"/><stop offset="1" stop-color="#e08a00"/></linearGradient></defs>
      <rect width="160" height="100" fill="url(#gb)"/>
      <g transform="rotate(-14 58 60)"><rect x="38" y="36" width="36" height="50" rx="5" fill="url(#beer)" stroke="#fff6" stroke-width="2"/><path d="M74 46h8a8 8 0 0 1 0 22h-8" fill="none" stroke="#fff8" stroke-width="5"/><ellipse cx="56" cy="36" rx="22" ry="9" fill="#fffbe8"/><circle cx="44" cy="31" r="7" fill="#fffbe8"/><circle cx="66" cy="30" r="8" fill="#fffbe8"/></g>
      <g transform="rotate(14 104 60)"><rect x="86" y="36" width="36" height="50" rx="5" fill="url(#beer)" stroke="#fff6" stroke-width="2"/><path d="M86 46h-8a8 8 0 0 0 0 22h8" fill="none" stroke="#fff8" stroke-width="5"/><ellipse cx="104" cy="36" rx="22" ry="9" fill="#fffbe8"/><circle cx="94" cy="30" r="8" fill="#fffbe8"/><circle cx="116" cy="31" r="7" fill="#fffbe8"/></g>
      <g fill="#fff" opacity=".85"><circle cx="80" cy="18" r="3"/><circle cx="72" cy="12" r="2"/><circle cx="90" cy="10" r="2"/></g>
      <text x="80" y="96" text-anchor="middle" font-family="Bebas Neue, Impact" font-size="16" fill="#fff">x2</text></svg>`,
    lottery: `<svg viewBox="0 0 160 100" aria-hidden="true"><defs><linearGradient id="gc" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#7b2ff7"/><stop offset="1" stop-color="#2a0a5e"/></linearGradient></defs>
      <rect width="160" height="100" fill="url(#gc)"/>
      <g transform="rotate(-8 64 54)"><path d="M24 32h80v12a8 8 0 0 0 0 16v12H24V60a8 8 0 0 0 0-16z" fill="#f5c542"/><path d="M84 34v36" stroke="#7a4a00" stroke-dasharray="3 3"/><text x="52" y="58" text-anchor="middle" font-family="Bebas Neue, Impact" font-size="16" fill="#5a2a00">LOTO</text></g>
      <circle cx="118" cy="34" r="14" fill="#ff4d6d"/><text x="118" y="39" text-anchor="middle" font-size="13" font-weight="bold" fill="#fff">7</text>
      <circle cx="134" cy="62" r="12" fill="#39ff88"/><text x="134" y="66" text-anchor="middle" font-size="11" font-weight="bold" fill="#063">23</text>
      <circle cx="110" cy="76" r="11" fill="#5cc8ff"/><text x="110" y="80" text-anchor="middle" font-size="10" font-weight="bold" fill="#034">4</text>
      <g fill="#fff" opacity=".7"><circle cx="20" cy="14" r="1.5"/><circle cx="146" cy="12" r="1.5"/><circle cx="60" cy="90" r="1.5"/></g></svg>`,
    stopwatch: `<svg viewBox="0 0 160 100" aria-hidden="true"><defs><linearGradient id="gd" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0f6b5a"/><stop offset="1" stop-color="#04201b"/></linearGradient></defs>
      <rect width="160" height="100" fill="url(#gd)"/>
      <rect x="73" y="8" width="14" height="8" rx="2" fill="#cfe"/><rect x="77" y="14" width="6" height="6" fill="#cfe"/>
      <circle cx="80" cy="56" r="36" fill="#eaffff" stroke="#39ff88" stroke-width="4"/>
      <g stroke="#0a3" stroke-width="2">${Array.from({ length: 12 }, (_, i) => { const a = (i * Math.PI) / 6; return `<line x1="${80 + 30 * Math.sin(a)}" y1="${56 - 30 * Math.cos(a)}" x2="${80 + 34 * Math.sin(a)}" y2="${56 - 34 * Math.cos(a)}"/>`; }).join('')}</g>
      <line x1="80" y1="56" x2="96" y2="36" stroke="#ff4d6d" stroke-width="3" stroke-linecap="round"/>
      <text x="80" y="76" text-anchor="middle" font-family="Bebas Neue, Impact" font-size="15" fill="#063">10,00</text></svg>`,
    plebiscite: `<svg viewBox="0 0 160 100" aria-hidden="true"><defs><linearGradient id="ge" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4a4f5c"/><stop offset="1" stop-color="#15171c"/></linearGradient></defs>
      <rect width="160" height="100" fill="url(#ge)"/>
      <g fill="#c9a227" opacity=".35"><rect x="8" y="10" width="6" height="80"/><rect x="146" y="10" width="6" height="80"/></g>
      <rect x="50" y="52" width="60" height="38" rx="4" fill="#e8e2d0" stroke="#8a7a50" stroke-width="2"/><rect x="66" y="50" width="28" height="5" rx="2" fill="#333"/>
      <g transform="rotate(-10 80 40)"><rect x="70" y="22" width="22" height="30" fill="#fff" stroke="#bbb"/><path d="M74 36l5 6 9-12" stroke="#d4183c" stroke-width="3" fill="none"/></g>
      <ellipse cx="38" cy="30" rx="20" ry="7" fill="#2d3a2a"/><rect x="26" y="20" width="24" height="10" rx="3" fill="#3b4d36"/><rect x="30" y="24" width="16" height="3" fill="#c9a227"/>
      <path d="M28 46q10-6 20 0q-10 4-20 0z" fill="#222"/>
      <g fill="#c9a227"><circle cx="122" cy="26" r="6"/><circle cx="134" cy="34" r="5"/><circle cx="122" cy="40" r="4"/></g>
      <text x="80" y="80" text-anchor="middle" font-family="Bebas Neue, Impact" font-size="12" fill="#5a4a20">VOTO</text></svg>`,
    king: `<svg viewBox="0 0 160 100" aria-hidden="true"><defs><linearGradient id="gf" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5cc8ff"/><stop offset="1" stop-color="#1b3a5c"/></linearGradient></defs>
      <rect width="160" height="100" fill="url(#gf)"/>
      <path d="M0 100 L60 40 L80 55 L110 25 L160 100 Z" fill="#2f6b3a"/><path d="M60 40 L80 55 L70 62 Z" fill="#245a2e"/>
      <path d="M97 22 l6 -10 l6 8 l6 -8 l6 10 l-2 8 h-20 z" fill="#f5c542" stroke="#a87b12" stroke-width="1.5"/>
      <g fill="#fff" opacity=".8"><circle cx="24" cy="18" r="6"/><circle cx="32" cy="16" r="7"/><circle cx="40" cy="19" r="5"/></g>
      <g fill="#f5c542"><circle cx="40" cy="80" r="5"/><circle cx="130" cy="84" r="5"/><circle cx="52" cy="88" r="4"/></g></svg>`,
    dilemma: `<svg viewBox="0 0 160 100" aria-hidden="true"><defs><linearGradient id="gg" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#1f6f4a"/><stop offset=".5" stop-color="#222"/><stop offset="1" stop-color="#8a1530"/></linearGradient></defs>
      <rect width="160" height="100" fill="url(#gg)"/>
      <g stroke="#ddd" stroke-width="3" opacity=".35">${Array.from({ length: 8 }, (_, i) => `<line x1="${12 + i * 20}" y1="0" x2="${12 + i * 20}" y2="100"/>`).join('')}</g>
      <text x="44" y="64" text-anchor="middle" font-size="34">🤝</text><text x="116" y="64" text-anchor="middle" font-size="34">🔪</text>
      <text x="80" y="58" text-anchor="middle" font-family="Bebas Neue, Impact" font-size="18" fill="#fff">VS</text></svg>`,
  };

  const ART = new Proxy(ART_SRC, { get: (o, k) => (o[k] ? uniq(o[k]) : undefined) });

  // ---------------------------------------------------------- tipos
  const TYPES = {
    communist: {
      name: 'Evento comunista', icon: '☭',
      desc: (s) => `La Banca expropia el ${s.communistPct}% de las fichas al que va primero y lo reparte a partes iguales entre los ${s.communistLast} últimos.${Number(s.communistMaskMinutes) ? ` Durante los ${s.communistMaskMinutes} minutos previos, el ranking se oculta: nadie sabe quién va primero.` : ''}`,
    },
    happyhour: {
      name: 'Happy hour', icon: '🍻',
      desc: (s) => `Durante ${s.happyMinutes} minutos, quien gane un duelo o una mesa cobra x${s.happyMultiplier}. El extra lo pone la Banca.`,
    },
    lottery: {
      name: 'Lotería', icon: '🎟️',
      desc: (s) => `Boletos a ${s.lotteryPrice} fichas (sin límite: cuantos más compres, más papeletas). La Banca añade ${s.lotteryBankBonus} fichas al bote y un boleto al azar se lo lleva todo.`,
    },
    stopwatch: {
      name: 'Cronómetro global', icon: '⏱️',
      desc: (s) => `Apúntate en los ${s.stopwatchSignupMinutes} minutos previos. Cada uno pone el ${s.stopwatchPct}% del capital del más pobre de los apuntados. Para el reloj en ${s.stopwatchTarget},00 s (el número se oculta a los 3 s): el que más se acerque se lleva el bote.`,
    },
    plebiscite: {
      name: 'Evento fascista', icon: '🦅',
      desc: (s) => `Plebiscito amañado: durante ${s.plebisciteVoteMinutes} minutos se vota en secreto a un Dictador (nadie ve el recuento hasta el final). Cada uno tiene un voto gratis, y los votos extra se compran a ${s.plebiscitePrice} fichas (sin límite: democracia de mercado). El más votado cobra ${s.plebisciteTribute} fichas a cada jugador y lleva el título de 🎖️ Dictador hasta el siguiente plebiscito.`,
    },
    king: {
      name: 'Rey de la colina', icon: '👑',
      desc: (s) => `Durante ${s.kingMinutes} minutos, cada ${s.kingEveryMinutes} minutos el primero del ranking cobra ${s.kingTribute} ficha${Number(s.kingTribute) === 1 ? '' : 's'} a cada jugador. Si no tienes, te quedas en negativo y tendrás que pedir un préstamo a la Banca.`,
    },
    dilemma: {
      name: 'Dilema del prisionero', icon: '🤝',
      desc: (s) => `Se hacen parejas al azar y cada uno elige en secreto (${s.dilemmaMinutes} min): 🤝 Cooperar o 🔪 Traicionar. Si cooperáis los dos, +${s.dilemmaCoop} cada uno (de la Banca). Si uno traiciona, el traidor gana ${s.dilemmaTemptation} y el otro pierde ${s.dilemmaSucker}. Si traicionáis los dos, perdéis ${s.dilemmaPunish} cada uno. Quien no elige, coopera.`,
    },
  };

  // Calendario por defecto (ids fijos)
  const DEFAULT_CALENDAR = [
    ['ev-d1', 'happyhour', '2026-12-29T22:00'],
    ['ev-d2', 'stopwatch', '2026-12-30T13:00'],
    ['ev-d3', 'communist', '2026-12-30T19:00'],
    ['ev-d4', 'happyhour', '2026-12-30T23:00'],
    ['ev-d5', 'lottery', '2026-12-31T20:00'],
    ['ev-d6', 'stopwatch', '2026-12-31T21:30'],
    ['ev-d7', 'plebiscite', '2026-12-31T13:00'],
    ['ev-d8', 'king', '2026-12-29T18:00'],
    ['ev-d9', 'king', '2026-12-30T17:00'],
    ['ev-d10', 'king', '2026-12-31T17:00'],
    ['ev-d11', 'dilemma', '2026-12-30T21:00'],
  ];

  // ---------------------------------------------------------- utilidades
  const set = () => MN.S.settings;
  const events = () => (MN.S.events || []).filter((e) => e.status !== 'cancelled');
  const entriesOf = (ev, kind) => (MN.S.entries || []).filter((x) => x.eventId === ev.id && x.kind === kind && !x.withdrawn);
  const happyEnd = (ev) => ev.at + (Number(set().happyMinutes) || 60) * MIN;
  const signupStart = (ev) => ev.at - (Number(set().stopwatchSignupMinutes) || 15) * MIN;
  const playEnd = (ev) => ev.at + (Number(set().stopwatchPlayMinutes) || 10) * MIN;
  const kingEnd = (ev) => ev.at + (Number(set().kingMinutes) || 60) * MIN;
  const kingEvery = () => Math.max(1, Number(set().kingEveryMinutes) || 10) * MIN;
  const dilemmaEnd = (ev) => ev.at + (Number(set().dilemmaMinutes) || 10) * MIN;
  const voteEnd = (ev) => ev.at + (Number(set().plebisciteVoteMinutes) || 10) * MIN;
  const fmtWhen = (ts) => new Date(ts).toLocaleString('es-ES', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const fmtHour = (ts) => new Date(ts).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  const secs = (ms) => (ms / 1000).toFixed(2).replace('.', ',');

  // Fase actual de un evento
  function phase(ev, now = Date.now()) {
    if (ev.status === 'done') return 'done';
    switch (ev.type) {
      case 'happyhour': return now < ev.at ? 'upcoming' : now < happyEnd(ev) ? 'live' : 'over';
      case 'stopwatch': return now < signupStart(ev) ? 'upcoming' : now < ev.at ? 'signup' : now < playEnd(ev) ? 'playing' : 'over';
      case 'lottery': return now < ev.at ? (MN.started() ? 'selling' : 'upcoming') : 'over';
      case 'plebiscite': return now < ev.at ? 'upcoming' : now < voteEnd(ev) ? 'voting' : 'over';
      case 'king': return now < ev.at ? 'upcoming' : now < kingEnd(ev) ? 'reign' : 'over';
      case 'dilemma': return now < ev.at ? 'upcoming' : now < dilemmaEnd(ev) ? 'choosing' : 'over';
      default: return now < ev.at ? 'upcoming' : 'over';
    }
  }
  const isLive = (ev) => ['live', 'signup', 'playing', 'voting', 'reign', 'choosing'].includes(phase(ev));
  const happyActiveAt = (ts) => events().some((e) => e.type === 'happyhour' && ts >= e.at && ts < happyEnd(e));

  function countdown(ms) {
    if (ms <= 0) return '00:00';
    const d = Math.floor(ms / 86400000); const h = Math.floor(ms / 3600000) % 24;
    const m = Math.floor(ms / 60000) % 60; const s = Math.floor(ms / 1000) % 60;
    return `${d ? d + 'd ' : ''}${MN.pad(h)}:${MN.pad(m)}:${MN.pad(s)}`;
  }

  // Texto de estado + cuenta atrás de un evento
  function statusLine(ev) {
    const now = Date.now(); const ph = phase(ev);
    const cd = (ts, label) => `${label} <b class="ev-cd" data-to="${ts}">${countdown(ts - now)}</b>`;
    switch (ph) {
      case 'upcoming': return ev.type === 'stopwatch' ? cd(signupStart(ev), 'Inscripción en') : cd(ev.at, 'Empieza en');
      case 'live': return `🔴 EN CURSO · ${cd(happyEnd(ev), 'termina en')}`;
      case 'signup': return `📝 INSCRIPCIÓN ABIERTA · ${cd(ev.at, 'empieza en')}`;
      case 'playing': return `🔴 EN JUEGO · ${cd(playEnd(ev), 'cierra en')}`;
      case 'selling': return `🎟️ Boletos a la venta · ${cd(ev.at, 'sorteo en')}`;
      case 'voting': return `🦅 VOTACIÓN SECRETA · ${cd(voteEnd(ev), 'cierra en')}`;
      case 'reign': { const k = currentKing(); return `👑 EN JUEGO · ${k ? `reina ${MN.who(k)} · ` : ''}${cd(nextKingTick(ev, now), 'cobra en')} · ${cd(kingEnd(ev), 'acaba en')}`; }
      case 'choosing': return `🤝 ELIGE EN SECRETO · ${cd(dilemmaEnd(ev), 'se revela en')}`;
      case 'over': return '⏳ Calculando resultado…';
      default: return resultLine(ev);
    }
  }

  function resultLine(ev) {
    const r = ev.result || {};
    const who = MN.who;
    switch (ev.type) {
      case 'communist': return r.from ? `☭ Se expropiaron <b>${r.amount}</b> fichas a ${who(r.from)} para ${r.to.map(who).join(', ')}` : 'No hubo nada que repartir';
      case 'happyhour': return `🍻 Terminó. ${r.bonuses ? `La Banca pagó <b>${r.bonuses}</b> fichas extra` : 'Nadie aprovechó la happy hour'}`;
      case 'lottery': return r.winner ? `🎟️ Ganó ${who(r.winner)}: <b>${r.pot}</b> fichas (${r.tickets} boletos)` : 'No se vendió ningún boleto';
      case 'king': return r.top ? `👑 ${who(r.top)} reinó ${r.reigns[r.top]} ${r.reigns[r.top] === 1 ? 'ronda' : 'rondas'} y cobró <b>${r.earned[r.top]}</b> fichas` : 'Nadie consiguió reinar en solitario';
      case 'dilemma': return r.pairs && r.pairs.length ? `🤝 ${r.pairs.length} parejas · ${r.pairs.filter((p) => p.a.c === 'coop' && p.b.c === 'coop').length} cooperaron · ${r.pairs.filter((p) => p.a.c === 'betray' && p.b.c === 'betray').length} se traicionaron mutuamente` : 'No hubo parejas';
      case 'plebiscite': return r.winner ? `🦅 ${who(r.winner)} es el nuevo Dictador con <b>${r.votes[r.winner]}</b> votos y cobró <b>${r.pot}</b> fichas de tributo` : 'Nadie votó: la democracia sobrevive (de momento)';
      case 'stopwatch': return r.winner ? `⏱️ Ganó ${who(r.winner)} con <b>${secs(r.ms)} s</b> y se llevó <b>${r.pot}</b> fichas` : (r.note || 'No hubo partida');
      default: return '';
    }
  }

  // ---------------------------------------------------------- acciones de los jugadores
  function myTickets(ev, id) { return entriesOf(ev, 'ticket').filter((x) => x.player === id).length; }
  function mySignup(ev, id) { return entriesOf(ev, 'signup').find((x) => x.player === id); }

  function actionsHtml(ev) {
    const mine = MN.me(); if (!mine) return '';
    const ph = phase(ev); const s = set(); const bal = MN.balances()[mine.id] || 0;
    const b = (act, label, cls = 'primary') => `<button type="button" class="btn ${cls}" data-evact="${act}" data-id="${MN.esc(ev.id)}">${label}</button>`;
    if (ev.type === 'lottery' && ph === 'selling') {
      const n = myTickets(ev, mine.id);
      return `<div class="ev-actions">${bal >= s.lotteryPrice ? b('ticket', `🎟️ Comprar boleto (${s.lotteryPrice})`) : ''}<span class="muted small">Tienes ${n} ${n === 1 ? 'boleto' : 'boletos'} · bote: <b>${lotteryPot(ev)}</b></span></div>`;
    }
    if (ev.type === 'dilemma' && ph === 'choosing') {
      const pair = dilemmaPairs(ev).find((p) => p.includes(mine.id));
      if (!pair) return '<div class="ev-actions"><span class="muted small">Llegaste tarde: no tienes pareja en este dilema.</span></div>';
      const partner = pair[0] === mine.id ? pair[1] : pair[0];
      const ch = myChoice(ev, mine.id);
      return `<div class="ev-actions dilemma-actions"><div class="small">Tu pareja: <b>${partner === BANK ? '🎩 la Banca' : MN.who(partner)}</b></div>
        ${b('coop', '🤝 Cooperar', ch === 'coop' ? 'primary' : 'ghost')}${b('betray', '🔪 Traicionar', ch === 'betray' ? 'danger-btn' : 'ghost')}
        <span class="muted small">${ch ? `Has elegido <b>${ch === 'coop' ? '🤝 cooperar' : '🔪 traicionar'}</b> (puedes cambiar hasta el final)` : 'Nadie sabrá qué has elegido hasta el final'}</span></div>`;
    }
    if (ev.type === 'plebiscite' && ph === 'voting') {
      const free = myFreeVote(ev, mine.id);
      const opts = MN.sortedPlayers(MN.balances()).map((p) => `<option value="${MN.esc(p.id)}" ${(pvChoice[ev.id] || (free && free.for)) === p.id ? 'selected' : ''}>${MN.esc(p.emoji)} ${MN.esc(p.name)}${p.id === mine.id ? ' (tú)' : ''}</option>`).join('');
      const bought = entriesOf(ev, 'vote').filter((x) => x.player === mine.id && x.extra).length;
      return `<div class="ev-actions plebiscite-actions"><select class="pv-sel" data-ev="${MN.esc(ev.id)}">${opts}</select>
        ${b('vote', free ? '🔁 Cambiar mi voto' : '🗳️ Votar gratis')}${bal >= s.plebiscitePrice ? b('buyvote', `💰 Comprar voto (${s.plebiscitePrice})`, 'ghost') : ''}
        <span class="muted small">🤫 Voto secreto: el recuento se sabrá al final.${free ? ` · Tu voto: ${MN.esc(MN.player(free.for).name)}` : ''}${bought ? ` · Votos comprados: ${bought}` : ''}</span></div>`;
    }
    if (ev.type === 'stopwatch') {
      const me = mySignup(ev, mine.id);
      const n = entriesOf(ev, 'signup').length;
      if (ph === 'signup') return `<div class="ev-actions">${me ? b('unsign', 'Borrarme', 'ghost') + '<span class="muted small">✅ Estás apuntado</span>' : (bal > 0 ? b('sign', '📝 Apuntarme') : '')}<span class="muted small">${n} apuntados</span></div>`;
      if (ph === 'playing' && me) return `<div class="ev-actions">${me.attemptMs == null ? b('play', '⏱️ ¡JUGAR!') : `<span>Tu marca: <b>${secs(me.attemptMs)} s</b> · esperando al resto…</span>`}</div>`;
      if (ph === 'playing') return `<div class="ev-actions"><span class="muted small">${n} jugadores en liza. Te lo perdiste…</span></div>`;
    }
    return '';
  }

  // Plebiscito: recuento de votos (gratis + comprados)
  function tally(ev) {
    const v = {};
    entriesOf(ev, 'vote').forEach((x) => {
      if (x.extra) { const tx = MN.S.txs.find((t) => t.id === 'vote_' + x.id); if (!tx || tx.voided) return; }
      v[x.for] = (v[x.for] || 0) + 1;
    });
    return v;
  }
  const pvChoice = {}; // candidato elegido en el desplegable (sobrevive a los repintados)
  const myFreeVote = (ev, id) => entriesOf(ev, 'vote').find((x) => x.player === id && !x.extra);

  function lotteryPot(ev) { return entriesOf(ev, 'ticket').length * (Number(set().lotteryPrice) || 5) + (Number(set().lotteryBankBonus) || 0); }

  // ---------------------------------------------------------- render
  function heroEvent() {
    const list = events().filter((e) => e.status !== 'done');
    return list.find((e) => isLive(e)) || list.filter((e) => phase(e) !== 'over').sort((a, b) => a.at - b.at)[0];
  }

  function renderHero() {
    const el = MN.$('#next-event'); if (!el) return;
    const ev = heroEvent();
    if (!ev) { el.innerHTML = ''; return; }
    const T = TYPES[ev.type];
    el.innerHTML = `<div class="ev-hero ev-${ev.type} ${isLive(ev) ? 'live' : ''}">
      <div class="ev-art">${ART[ev.type]}</div>
      <div class="ev-body">
        <div class="ev-kicker">${isLive(ev) ? '🔴 Ahora' : 'Próximo evento'} · ${MN.esc(fmtWhen(ev.at))}</div>
        <div class="ev-name">${T.icon} ${T.name}</div>
        <div class="ev-desc">${MN.esc(T.desc(set()))}</div>
        <div class="ev-status">${statusLine(ev)}</div>
        ${actionsHtml(ev)}
        <button type="button" class="link small" data-goto="eventos">📅 Ver calendario completo</button>
      </div></div>`;
  }

  function renderCalendar() {
    const el = MN.$('#calendar'); if (!el) return;
    const admin = MN.isAdmin();
    const all = (MN.S.events || []).slice().sort((a, b) => a.at - b.at);
    const item = (ev) => {
      const T = TYPES[ev.type]; const ph = ev.status === 'cancelled' ? 'cancelled' : phase(ev);
      return `<li class="cal-item ph-${ph}">
          <div class="cal-art">${ART[ev.type]}</div>
          <div class="cal-body">
            <div class="cal-top"><b>${fmtHour(ev.at)}</b> · ${T.icon} ${T.name}${ev.surprise ? ' <span class="tag">SORPRESA</span>' : ''}</div>
            <div class="small">${ph === 'cancelled' ? '<span class="muted">Cancelado</span>' : statusLine(ev)}</div>
            ${ph !== 'cancelled' && ph !== 'done' ? actionsHtml(ev) : ''}
            ${ph === 'done' && MN.shows && ev.type !== 'happyhour' && ev.result && (ev.result.winner || ev.result.from) ? `<button type="button" class="mini" data-replay="${MN.esc(ev.id)}">▶ Ver ${ev.type === 'lottery' ? 'el sorteo' : 'la animación'}</button>` : ''}
            ${admin && ev.status === 'scheduled' ? `<div class="admin-actions">🏦
              <button type="button" class="mini" data-evadmin="move" data-id="${MN.esc(ev.id)}">Cambiar hora</button>
              <button type="button" class="mini danger" data-evadmin="cancel" data-id="${MN.esc(ev.id)}">Cancelar</button></div>` : ''}
          </div></li>`;
    };
    // Los eventos en marcha van arriba del todo
    const live = all.filter((ev) => ev.status === 'scheduled' && isLive(ev));
    const rest = all.filter((ev) => !live.includes(ev));
    const byDay = {};
    rest.forEach((e) => { const k = new Date(e.at).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' }); (byDay[k] = byDay[k] || []).push(e); });
    el.innerHTML = (live.length ? `<div class="cal-live"><h3 class="cal-day cal-live-title">🔴 En marcha ahora</h3><ul class="cal-list">${live.map(item).join('')}</ul></div>` : '')
      + (rest.length ? Object.entries(byDay).map(([day, list]) => `
      <h3 class="cal-day">${MN.esc(day)}</h3>
      <ul class="cal-list">${list.map(item).join('')}</ul>`).join('') : (live.length ? '' : '<p class="empty">No hay eventos programados.</p>'));

    MN.$('#cal-admin').hidden = !admin;
    MN.$('#cal-legend').innerHTML = Object.entries(TYPES).map(([k, T]) => `
      <div class="legend-item"><div class="cal-art">${ART[k]}</div><div><b>${T.icon} ${T.name}</b><p class="small muted">${MN.esc(T.desc(set()))}</p></div></div>`).join('');
  }

  // Pestaña de eventos: punto rojo si hay alguno en marcha
  function renderTab() {
    const tab = MN.$('#ev-tab-live'); if (!tab) return;
    tab.hidden = !events().some((ev) => ev.status === 'scheduled' && isLive(ev));
  }

  function render() {
    renderHero(); renderCalendar(); renderTab();
    const r = set().eventRehearsal;
    const info = MN.$('#ev-rehearsal-info');
    if (info) {
      info.innerHTML = r
        ? `🧪 <b>Ensayo en marcha</b> desde las ${fmtHour(r.at)}. Cuando acabes, pulsa <b>Restaurar</b> para volver a las fechas reales y anular lo que hayan hecho los eventos.`
        : 'Pone todos los eventos pendientes cada 4 minutos (con happy hour y cronómetro más cortos) para probarlos desde el móvil. Luego se restauran las fechas reales.';
      MN.$('#ev-rehearse').hidden = !!r; MN.$('#ev-restore').hidden = !r;
    }
  }

  // ---------------------------------------------------------- ensayo
  const REHEARSAL_GAP = 4 * MIN;
  async function rehearse() {
    const s = set(); if (s.eventRehearsal) return;
    const pending = (MN.S.events || []).filter((e) => e.status === 'scheduled').sort((a, b) => a.at - b.at);
    if (!pending.length) return MN.toast('No hay eventos pendientes que ensayar', 'bad');
    const ok = await MN.modal(`<div class="modal-icon">🧪</div><p class="modal-text">¿Ensayar los <b>${pending.length}</b> eventos pendientes?</p>
      <p class="hint center">Empiezan dentro de 4 minutos, uno cada 4 minutos. La partida se abre ya para que funcionen la lotería y el mercado.</p>`, 'Ensayar');
    if (!ok) return;
    const now = Date.now();
    const saved = {
      at: now, startDate: s.startDate,
      happyMinutes: s.happyMinutes, stopwatchSignupMinutes: s.stopwatchSignupMinutes, stopwatchPlayMinutes: s.stopwatchPlayMinutes,
      communistMaskMinutes: s.communistMaskMinutes, plebisciteVoteMinutes: s.plebisciteVoteMinutes, kingMinutes: s.kingMinutes, kingEveryMinutes: s.kingEveryMinutes, dilemmaMinutes: s.dilemmaMinutes,
      events: Object.fromEntries(pending.map((e) => [e.id, e.at])),
    };
    const local = (ts) => new Date(ts - new Date().getTimezoneOffset() * MIN).toISOString().slice(0, 16);
    await MN.act(async () => {
      await Store.saveSettings(Object.assign({}, s, {
        eventRehearsal: saved, startDate: local(now - MIN),
        happyMinutes: 5, stopwatchSignupMinutes: 3, stopwatchPlayMinutes: 3, communistMaskMinutes: 30, plebisciteVoteMinutes: 3, kingMinutes: 3, kingEveryMinutes: 1, dilemmaMinutes: 3,
      }));
      await Store.putMany({ events: pending.map((e, i) => Object.assign({}, e, { at: now + (i + 1) * REHEARSAL_GAP })) });
    }, '🧪 Ensayo en marcha: el primer evento empieza en 4 minutos');
  }

  async function restore() {
    const s = set(); const r = s.eventRehearsal; if (!r) return;
    const ok = await MN.modal(`<div class="modal-icon">↺</div><p class="modal-text">¿Terminar el ensayo y volver a las fechas reales?</p>
      <p class="hint center">Se anulan los repartos, boletos y bonus de los eventos ensayados y vuelven a quedar pendientes. Los duelos que hayáis jugado se quedan (bórralos con "Borrar todo" antes de la partida de verdad).</p>`, 'Restaurar');
    if (!ok) return;
    const ids = new Set(Object.keys(r.events));
    await MN.act(async () => {
      const txs = MN.S.txs.filter((t) => !t.voided && t.eventId && ids.has(t.eventId)).map((t) => Object.assign({}, t, { voided: true }));
      const entries = (MN.S.entries || []).filter((x) => ids.has(x.eventId) && !x.withdrawn).map((x) => Object.assign({}, x, { withdrawn: true }));
      const evs = (MN.S.events || []).filter((e) => ids.has(e.id)).map((e) => Object.assign({}, e, { at: r.events[e.id], status: 'scheduled', result: null }));
      await Store.putMany({ txs, entries, events: evs });
      const next = Object.assign({}, s, {
        startDate: r.startDate, happyMinutes: r.happyMinutes, stopwatchSignupMinutes: r.stopwatchSignupMinutes, stopwatchPlayMinutes: r.stopwatchPlayMinutes,
        communistMaskMinutes: r.communistMaskMinutes == null || r.communistMaskMinutes === 60 ? 30 : r.communistMaskMinutes,
        plebisciteVoteMinutes: r.plebisciteVoteMinutes || 10, kingMinutes: r.kingMinutes || 60, kingEveryMinutes: r.kingEveryMinutes || 10, dilemmaMinutes: r.dilemmaMinutes || 10,
      });
      delete next.eventRehearsal;
      await Store.saveSettings(next);
    }, '↺ Fechas reales restauradas');
  }

  // Solo actualiza los números de las cuentas atrás (cada segundo)
  function tick() {
    const now = Date.now();
    MN.$$('.ev-cd').forEach((el) => { el.textContent = countdown(Number(el.dataset.to) - now); });
    // Si un evento cambia de fase, se vuelve a pintar todo
    const key = events().map((e) => e.id + phase(e, now)).join('|');
    if (key !== lastPhases) { lastPhases = key; if (MN.S) { render(); remind(); sweepSoon(); } }
    // Al empezar o acabar la censura del ranking hay que repintarlo todo
    const masked = !!(MN.S && MN.rankMask());
    if (masked !== lastMasked) { const first = lastMasked === null; lastMasked = masked; if (!first) MN.renderAll(); }
  }
  let lastPhases = ''; let lastMasked = null;

  // ---------------------------------------------------------- avisos
  function wasSeen(key) { try { return !!JSON.parse(localStorage.getItem('mn_ev_seen') || '{}')[key]; } catch (e) { return false; } }
  function seen(key) {
    try {
      const s = JSON.parse(localStorage.getItem('mn_ev_seen') || '{}');
      if (s[key]) return true;
      s[key] = Date.now(); localStorage.setItem('mn_ev_seen', JSON.stringify(s));
    } catch (e) { /* nada */ }
    return false;
  }

  function remind() {
    if (!MN.S || MN.ended()) return;
    const now = Date.now(); const msgs = []; const mine = MN.me();
    events().forEach((ev) => {
      const T = TYPES[ev.type]; const ph = phase(ev, now);
      const startTs = ev.type === 'stopwatch' ? signupStart(ev) : ev.at;
      if (ph === 'upcoming' && startTs - now <= 15 * MIN && startTs - now > 0 && !seen(ev.id + ':15')) msgs.push(`⏰ En 15 minutos: ${T.icon} ${T.name}`);
      if (ph === 'live' && !seen(ev.id + ':start')) msgs.push(`🍻 ¡Empieza la happy hour! Los duelos pagan x${set().happyMultiplier} durante ${set().happyMinutes} min`);
      if (ph === 'reign' && !seen(ev.id + ':reign')) msgs.push(`👑 ¡Rey de la colina! Durante ${set().kingMinutes} min, el primero cobra ${set().kingTribute} a cada uno cada ${set().kingEveryMinutes} min. ¡A por él!`);
      if (ph === 'choosing' && !seen(ev.id + ':choosing')) msgs.push(`🤝 ¡Dilema del prisionero! Tienes ${set().dilemmaMinutes} min para elegir en secreto: cooperar o traicionar`);
      if (ph === 'voting' && !seen(ev.id + ':voting')) msgs.push(`🦅 ¡Evento fascista! Vota en secreto a tu Dictador en los próximos ${set().plebisciteVoteMinutes} min. Los votos extra se compran 😏`);
      if (ph === 'signup' && !seen(ev.id + ':signup')) msgs.push('⏱️ ¡Inscripción abierta para el cronómetro global! Apúntate ya');
      if (ph === 'playing' && mine && mySignup(ev, mine.id) && !seen(ev.id + ':play')) msgs.push('⏱️ ¡Te toca! Juega al cronómetro global antes de que cierre');
      // Los eventos con animación no destripan el resultado en el aviso: se ve al entrar
      const animated = MN.shows && ev.type !== 'happyhour';
      if (ev.status === 'done' && ev.result && now - (ev.result.at || ev.at) < 30 * MIN) {
        if (!animated) { if (!seen(ev.id + ':done')) msgs.push(`${T.icon} ${resultLine(ev).replace(/<[^>]+>/g, '')}`); }
        else if (document.visibilityState !== 'visible' && !wasSeen(`${ev.id}:done:${ev.result.at}`) && !seen(`${ev.id}:done:${ev.at}`)) msgs.push(`${T.icon} ${T.name}: ¡ya ha terminado! Entra para ver qué ha pasado 👀`);
      }
    });
    if (msgs.length) MN.notify(msgs);
  }

  // ---------------------------------------------------------- ejecución (barrido)
  let sweepTimer = null;
  function sweepSoon() { if (!sweepTimer) sweepTimer = setTimeout(() => { sweepTimer = null; MN.sweepAll(); }, 600); }

  async function sweep() {
    const S = MN.S; if (!S) return;
    const now = Date.now();
    await seedCalendar();
    for (const ev of events()) {
      if (ev.status !== 'scheduled') continue;
      const ph = phase(ev, now);
      if (ph !== 'over') continue;
      if (ev.type === 'communist') await runCommunist(ev);
      if (ev.type === 'lottery') await runLottery(ev);
      if (ev.type === 'stopwatch') await runStopwatch(ev);
      if (ev.type === 'plebiscite') await runPlebiscite(ev);
      if (ev.type === 'king') await runKing(ev);
      if (ev.type === 'dilemma') await runDilemma(ev);
      if (ev.type === 'happyhour') await Store.update('events', ev.id, { status: 'done', result: { at: happyEnd(ev), bonuses: happyBonuses(ev).reduce((a, x) => a + x.amount, 0) } });
    }
    // Rey de la colina en marcha: se cobra en cada marca
    for (const ev of events()) if (ev.type === 'king' && ev.status === 'scheduled' && phase(ev, now) === 'reign') await syncKing(ev, now);
    // El cronómetro también se resuelve antes si ya han jugado todos los apuntados
    for (const ev of events()) {
      if (ev.type === 'stopwatch' && ev.status === 'scheduled' && phase(ev, now) === 'playing') {
        const signed = entriesOf(ev, 'signup');
        if (signed.length && signed.every((x) => x.attemptMs != null)) await runStopwatch(ev);
      }
    }
    await syncHappyBonuses();
  }

  const NEW_DEFAULTS = ['ev-d8', 'ev-d9', 'ev-d10', 'ev-d11'];
  async function seedCalendar() {
    const S = MN.S;
    // Partidas ya empezadas: se añaden los eventos nuevos del calendario por defecto (una sola vez)
    if (S.settings.eventsSeeded && MN.isAdmin() && !S.settings.eventsSeeded2) {
      const have = new Set((S.events || []).map((e) => e.id));
      const add = DEFAULT_CALENDAR.filter(([id]) => NEW_DEFAULTS.includes(id) && !have.has(id))
        .map(([id, type, at]) => ({ id, type, at: new Date(at).getTime(), status: 'scheduled', createdAt: Date.now() }));
      if (add.length) await Store.putMany({ events: add });
      await Store.saveSettings(Object.assign({}, S.settings, { eventsSeeded2: true }));
      return;
    }
    if (S.settings.eventsSeeded || !MN.isAdmin() || (S.events || []).length) return;
    const list = DEFAULT_CALENDAR.map(([id, type, at]) => ({ id, type, at: new Date(at).getTime(), status: 'scheduled', createdAt: Date.now() }));
    await Store.putMany({ events: list });
    await Store.saveSettings(Object.assign({}, S.settings, { eventsSeeded: true, eventsSeeded2: true }));
  }

  async function runCommunist(ev) {
    const s = set(); const bal = MN.balancesAt(ev.at);
    const sorted = MN.S.players.filter((p) => p.createdAt <= ev.at).map((p) => p.id).sort((a, b) => bal[b] - bal[a]);
    const result = { at: ev.at };
    if (sorted.length >= 2) {
      const from = sorted[0];
      const to = sorted.slice(1).reverse().slice(0, Number(s.communistLast) || 3);
      const take = Math.floor((bal[from] * (Number(s.communistPct) || 25)) / 100);
      const share = Math.floor(take / to.length);
      if (share > 0) {
        const payouts = { [from]: -share * to.length };
        to.forEach((id) => { payouts[id] = (payouts[id] || 0) + share; });
        await Store.put('txs', { id: 'ev_' + ev.id, type: 'payout', kind: 'communist', ts: ev.at, eventId: ev.id, from, to, share, payouts });
        Object.assign(result, { from, to, amount: share * to.length, share });
      }
    }
    await Store.update('events', ev.id, { status: 'done', result });
  }

  // Plebiscito: el más votado es Dictador y cobra el tributo a cada uno (sin dejar a nadie en negativo).
  // Empate: decide el azar, pero un azar fijo (el mismo en todos los móviles).
  async function runPlebiscite(ev) {
    const s = set(); const v = tally(ev); const end = voteEnd(ev);
    const result = { at: end, votes: v };
    const ranked = Object.entries(v).sort((a, b) => b[1] - a[1] || MN.hash(ev.id + a[0]) - MN.hash(ev.id + b[0]));
    if (ranked.length) {
      const winner = ranked[0][0]; const bal = MN.balancesAt(end);
      const tribute = Number(s.plebisciteTribute) || 5;
      const payouts = {}; let pot = 0;
      MN.S.players.filter((p) => p.id !== winner && p.createdAt <= end).forEach((p) => {
        const paid = Math.min(tribute, Math.max(0, bal[p.id] || 0));
        if (paid) { payouts[p.id] = -paid; pot += paid; }
      });
      if (pot) {
        payouts[winner] = pot;
        await Store.put('txs', { id: 'ev_' + ev.id, type: 'payout', kind: 'plebiscite', ts: end, eventId: ev.id, winner, votes: v[winner], pot, payouts });
      }
      Object.assign(result, { winner, pot, tribute });
    }
    await Store.update('events', ev.id, { status: 'done', result });
  }

  // ---------------------------------------------------------- 👑 rey de la colina
  // En cada marca (cada X min desde el inicio) el primero del ranking cobra a todos. Empate en cabeza: nadie cobra.
  const nextKingTick = (ev, now = Date.now()) => ev.at + (Math.floor((now - ev.at) / kingEvery()) + 1) * kingEvery();
  function leaderAt(ts) {
    const bal = MN.balancesAt(ts);
    const list = MN.S.players.filter((p) => p.createdAt <= ts).map((p) => p.id).sort((a, b) => bal[b] - bal[a]);
    return list.length >= 2 && bal[list[0]] > bal[list[1]] ? list[0] : null;
  }
  function currentKing() {
    const live = events().find((e) => e.type === 'king' && e.status === 'scheduled' && phase(e) === 'reign');
    return live ? leaderAt(Date.now()) : null;
  }
  async function syncKing(ev, now) {
    const s = set(); const end = Math.min(kingEnd(ev), now); const tribute = Number(s.kingTribute) || 1;
    const writes = [];
    for (let k = 1; ev.at + k * kingEvery() <= end; k++) {
      const ts = ev.at + k * kingEvery(); const id = `king_${ev.id}_${k}`;
      if (MN.S.txs.some((t) => t.id === id)) continue;
      const king = leaderAt(ts - 1); if (!king) continue;
      const payouts = {}; let pot = 0;
      MN.S.players.filter((p) => p.id !== king && p.createdAt <= ts).forEach((p) => { payouts[p.id] = -tribute; pot += tribute; });
      if (!pot) continue;
      payouts[king] = pot;
      writes.push({ id, type: 'payout', kind: 'king', ts, eventId: ev.id, king, round: k, pot, payouts });
    }
    if (writes.length) await Store.putMany({ txs: writes });
  }
  async function runKing(ev) {
    await syncKing(ev, kingEnd(ev));
    const reigns = {}; const earned = {};
    MN.S.txs.filter((t) => t.kind === 'king' && t.eventId === ev.id && !t.voided).forEach((t) => { reigns[t.king] = (reigns[t.king] || 0) + 1; earned[t.king] = (earned[t.king] || 0) + t.pot; });
    const top = Object.keys(reigns).sort((a, b) => reigns[b] - reigns[a] || earned[b] - earned[a])[0] || null;
    await Store.update('events', ev.id, { status: 'done', result: { at: kingEnd(ev), reigns, earned, top } });
  }

  // ---------------------------------------------------------- 🤝 dilema del prisionero
  const BANK = '__banca';
  // Parejas al azar (pero el mismo azar en todos los móviles). Si sobra uno, le toca la Banca.
  function dilemmaPairs(ev) {
    const ids = MN.S.players.filter((p) => p.createdAt <= ev.at).map((p) => p.id).sort((a, b) => MN.hash(ev.id + a) - MN.hash(ev.id + b));
    const pairs = [];
    for (let i = 0; i < ids.length; i += 2) pairs.push([ids[i], ids[i + 1] || BANK]);
    return pairs;
  }
  const myChoice = (ev, id) => { const e = entriesOf(ev, 'choice').find((x) => x.player === id); return e ? e.choice : null; };
  const bankChoice = (ev) => (Math.abs(MN.hash(ev.id + 'banca')) % 2 ? 'betray' : 'coop');
  async function runDilemma(ev) {
    const s = set(); const C = Number(s.dilemmaCoop) || 10; const T = Number(s.dilemmaTemptation) || 20;
    const L = Number(s.dilemmaSucker) || 10; const P = Number(s.dilemmaPunish) || 5;
    const choice = (id) => (id === BANK ? bankChoice(ev) : myChoice(ev, id) || 'coop');
    const gain = (me, other) => (me === 'coop' ? (other === 'coop' ? C : -L) : (other === 'coop' ? T : -P));
    const payouts = {}; const pairs = [];
    dilemmaPairs(ev).forEach(([a, b]) => {
      const ca = choice(a); const cb = choice(b);
      const ga = gain(ca, cb); const gb = gain(cb, ca);
      if (a !== BANK) payouts[a] = (payouts[a] || 0) + ga;
      if (b !== BANK) payouts[b] = (payouts[b] || 0) + gb;
      pairs.push({ a: { id: a, c: ca, g: ga }, b: { id: b, c: cb, g: gb } });
    });
    if (Object.values(payouts).some((v) => v)) await Store.put('txs', { id: 'ev_' + ev.id, type: 'payout', kind: 'dilemma', ts: dilemmaEnd(ev), eventId: ev.id, payouts });
    await Store.update('events', ev.id, { status: 'done', result: { at: dilemmaEnd(ev), pairs } });
  }

  // El último Dictador elegido lleva el título hasta el siguiente plebiscito
  function dictator() {
    const done = events().filter((e) => e.type === 'plebiscite' && e.status === 'done' && e.result && e.result.winner).sort((a, b) => b.at - a.at)[0];
    return done ? done.result.winner : null;
  }

  async function runLottery(ev) {
    const s = set();
    const tickets = entriesOf(ev, 'ticket').filter((t) => { const tx = MN.S.txs.find((x) => x.id === 'tkt_' + t.id); return tx && !tx.voided; })
      .sort((a, b) => (a.id < b.id ? -1 : 1));
    const result = { at: ev.at, tickets: tickets.length };
    if (tickets.length) {
      const idx = Math.abs(MN.hash(ev.id + tickets.map((t) => t.id).join(''))) % tickets.length;
      const winner = tickets[idx].player;
      const pot = tickets.length * (Number(s.lotteryPrice) || 5) + (Number(s.lotteryBankBonus) || 0);
      await Store.put('txs', { id: 'ev_' + ev.id, type: 'payout', kind: 'lottery', ts: ev.at, eventId: ev.id, winner, pot, tickets: tickets.length, payouts: { [winner]: pot } });
      Object.assign(result, { winner, pot, ticket: tickets[idx].id });
    }
    await Store.update('events', ev.id, { status: 'done', result });
  }

  async function runStopwatch(ev) {
    const s = set(); const target = (Number(s.stopwatchTarget) || 10) * 1000;
    const signed = entriesOf(ev, 'signup');
    const result = { at: (ev.result && ev.result.at) || Math.min(Date.now(), playEnd(ev)) };
    if (signed.length < 2) {
      result.note = signed.length ? 'Solo se apuntó una persona: no hubo partida' : 'No se apuntó nadie';
      return Store.update('events', ev.id, { status: 'done', result });
    }
    const bal = MN.balancesAt(ev.at);
    const poorest = Math.min(...signed.map((x) => bal[x.player] || 0));
    const buyIn = Math.max(1, Math.floor((poorest * (Number(s.stopwatchPct) || 5)) / 100));
    const played = signed.filter((x) => x.attemptMs != null)
      .map((x) => ({ player: x.player, ms: x.attemptMs, diff: Math.abs(x.attemptMs - target), at: x.playedAt }))
      .sort((a, b) => a.diff - b.diff || a.at - b.at);
    if (!played.length) {
      result.note = 'Nadie llegó a jugar: no se cobra nada';
      return Store.update('events', ev.id, { status: 'done', result });
    }
    const payouts = {}; let pot = 0;
    signed.forEach((x) => { const paid = Math.min(buyIn, Math.max(0, bal[x.player] || 0)); payouts[x.player] = -paid; pot += paid; });
    payouts[played[0].player] += pot;
    await Store.put('txs', { id: 'ev_' + ev.id, type: 'payout', kind: 'stopwatch', ts: Math.min(Date.now(), playEnd(ev)), eventId: ev.id, winner: played[0].player, ms: played[0].ms, buyIn, pot, payouts });
    Object.assign(result, { winner: played[0].player, ms: played[0].ms, buyIn, pot, ranking: played });
    await Store.update('events', ev.id, { status: 'done', result });
  }

  // Happy hour: por cada duelo o mesa ganado durante la happy hour, la Banca paga el extra
  function happyBonuses(ev) {
    const mult = Number(set().happyMultiplier) || 2;
    const end = happyEnd(ev); const out = [];
    MN.S.txs.forEach((t) => {
      if (t.ts < ev.at || t.ts >= end) return;
      if (t.type === 'duel') out.push({ src: t, player: t.winner, amount: t.amount * (mult - 1) });
      if (t.type === 'payout' && t.kind === 'table') Object.entries(t.payouts).forEach(([pid, d]) => { if (d > 0) out.push({ src: t, player: pid, amount: d * (mult - 1) }); });
    });
    return out.filter((x) => x.amount > 0);
  }

  async function syncHappyBonuses() {
    const txs = MN.S.txs; const byId = {};
    txs.forEach((t) => { byId[t.id] = t; });
    const writes = []; const updates = [];
    events().filter((e) => e.type === 'happyhour' && Date.now() >= e.at).forEach((ev) => {
      happyBonuses(ev).forEach((b) => {
        const id = `hh_${b.src.id}_${b.player}`;
        const cur = byId[id];
        if (!cur && !b.src.voided) writes.push({ id, type: 'bonus', kind: 'happy', ts: b.src.ts + 1, player: b.player, amount: b.amount, srcId: b.src.id, eventId: ev.id });
        else if (cur && !!cur.voided !== !!b.src.voided) updates.push([id, { voided: !!b.src.voided }]);
      });
    });
    if (writes.length) await Store.putMany({ txs: writes });
    for (const [id, patch] of updates) await Store.updateTx(id, patch);
  }

  // ---------------------------------------------------------- juego del cronómetro
  function openStopwatch(ev) {
    const mine = MN.me(); const entry = mySignup(ev, mine.id);
    if (!entry || entry.attemptMs != null) return;
    stopwatchGame({
      title: '⏱️ Cronómetro global', after: 'Los resultados salen cuando acabe el evento.',
      save: (ms) => MN.act(() => Store.update('entries', entry.id, { attemptMs: ms, playedAt: Date.now() })),
    });
  }

  // Juego del cronómetro (un intento). Lo usan el evento y los retos de cronómetro.
  function stopwatchGame({ title, sub = '', after, save }) {
    const target = Number(set().stopwatchTarget) || 10;
    const box = MN.$('#sw-game');
    box.hidden = false; document.body.classList.add('no-scroll');
    box.innerHTML = `<div class="sw-inner">
      <div class="sw-title">${title}</div>${sub ? `<div class="sw-sub">${sub}</div>` : ''}
      <p class="sw-help">Pulsa <b>EMPEZAR</b> y para el reloj cuando creas que han pasado <b>${target},00 segundos</b>.<br>A los 3 segundos el número se oculta. <b>Solo tienes un intento.</b></p>
      <div class="sw-display" id="sw-display">0,00</div>
      <button type="button" class="sw-btn" id="sw-btn">EMPEZAR</button>
      <button type="button" class="link" id="sw-close">Ahora no</button></div>`;
    let t0 = null; let timer = null;
    const disp = MN.$('#sw-display'); const btn = MN.$('#sw-btn');
    const loop = () => {
      const ms = performance.now() - t0;
      // Entre 1,5 y 3 s el número se va desvaneciendo; luego aparece "??,??" poco a poco
      if (ms < 3000) {
        const k = Math.max(0, Math.min(1, (ms - 1500) / 1500));
        disp.textContent = secs(ms);
        disp.style.opacity = String(1 - k * k * 0.95); disp.style.filter = `blur(${(k * 6).toFixed(1)}px)`;
      } else {
        const k = Math.min(1, (ms - 3000) / 700);
        disp.textContent = '??,??'; disp.classList.add('hidden-time');
        disp.style.opacity = String(0.05 + k * 0.95); disp.style.filter = `blur(${(6 - k * 3).toFixed(1)}px)`;
      }
    };
    btn.onclick = async () => {
      if (t0 === null) {
        t0 = performance.now(); btn.textContent = 'PARAR'; btn.classList.add('stop');
        MN.$('#sw-close').hidden = true; timer = setInterval(loop, 30);
        return;
      }
      const ms = Math.round(performance.now() - t0);
      clearInterval(timer);
      btn.disabled = true;
      disp.classList.remove('hidden-time'); disp.style.opacity = ''; disp.style.filter = ''; disp.textContent = secs(ms);
      const diff = Math.abs(ms - target * 1000);
      MN.$('.sw-help').innerHTML = `Has parado en <b>${secs(ms)} s</b> (a ${secs(diff)} s del objetivo).<br>${diff < 100 ? '🎯 ¡Brutal!' : diff < 300 ? '👏 Muy bien' : diff < 1000 ? '😬 Regular…' : '🙈 Uf…'} ${after}`;
      await save(ms);
      btn.hidden = true; MN.$('#sw-close').hidden = false; MN.$('#sw-close').textContent = 'Cerrar';
    };
    MN.$('#sw-close').onclick = () => { clearInterval(timer); box.hidden = true; document.body.classList.remove('no-scroll'); };
  }

  // ---------------------------------------------------------- clicks
  async function onClick(e) {
    const go = e.target.closest('[data-goto]');
    if (go) return MN.go(go.dataset.goto);
    const b = e.target.closest('[data-evact]');
    if (b) {
      const ev = events().find((x) => x.id === b.dataset.id); const mine = MN.me();
      if (!ev || !mine) return;
      const s = set(); const now = Date.now();
      if (b.dataset.evact === 'ticket') {
        if (phase(ev) !== 'selling') return;
        if ((MN.balances()[mine.id] || 0) < s.lotteryPrice) return MN.toast('No te llega para un boleto', 'bad');
        const id = Store.uid();
        await MN.act(() => Store.putMany({
          entries: [{ id, eventId: ev.id, kind: 'ticket', player: mine.id, ts: now }],
          txs: [{ id: 'tkt_' + id, type: 'charge', kind: 'ticket', ts: now, player: mine.id, amount: s.lotteryPrice, eventId: ev.id }],
        }), '🎟️ Boleto comprado. ¡Suerte!');
      }
      if (b.dataset.evact === 'sign') {
        if (phase(ev) !== 'signup') return;
        await MN.act(() => Store.put('entries', { id: `sw_${ev.id}_${mine.id}`, eventId: ev.id, kind: 'signup', player: mine.id, ts: now }), '📝 Apuntado. Cuando empiece, te tocará jugar.');
      }
      if (b.dataset.evact === 'unsign') {
        const en = mySignup(ev, mine.id);
        if (en && phase(ev) === 'signup') await MN.act(() => Store.update('entries', en.id, { withdrawn: true }), 'Te has borrado');
      }
      if (b.dataset.evact === 'play') openStopwatch(ev);
      if (b.dataset.evact === 'coop' || b.dataset.evact === 'betray') {
        if (phase(ev) !== 'choosing') return;
        await MN.act(() => Store.put('entries', { id: `dc_${ev.id}_${mine.id}`, eventId: ev.id, kind: 'choice', player: mine.id, choice: b.dataset.evact, ts: now }),
          b.dataset.evact === 'coop' ? '🤝 Has elegido cooperar. Ojalá tu pareja también…' : '🔪 Has elegido traicionar. Muajaja.');
      }
      if (b.dataset.evact === 'vote' || b.dataset.evact === 'buyvote') {
        if (phase(ev) !== 'voting') return;
        const sel = b.closest('.ev-actions').querySelector('.pv-sel'); const cand = sel && sel.value; if (!cand) return;
        const name = MN.esc(MN.player(cand).name);
        if (b.dataset.evact === 'vote') {
          await MN.act(() => Store.put('entries', { id: `pv_${ev.id}_${mine.id}`, eventId: ev.id, kind: 'vote', player: mine.id, for: cand, ts: now }), `🗳️ Has votado a ${name}`);
        } else {
          if ((MN.balances()[mine.id] || 0) < s.plebiscitePrice) return MN.toast('No te llega para comprar un voto', 'bad');
          const id = Store.uid();
          await MN.act(() => Store.putMany({
            entries: [{ id, eventId: ev.id, kind: 'vote', extra: true, player: mine.id, for: cand, ts: now }],
            txs: [{ id: 'vote_' + id, type: 'charge', kind: 'vote', ts: now, player: mine.id, amount: s.plebiscitePrice, eventId: ev.id, for: cand }],
          }), `💰 Voto comprado para ${name}. La democracia agradece tu aportación`);
        }
      }
      return;
    }
    const a = e.target.closest('[data-evadmin]');
    if (a && MN.isAdmin()) {
      const ev = (MN.S.events || []).find((x) => x.id === a.dataset.id); if (!ev) return;
      if (a.dataset.evadmin === 'cancel') {
        if (await MN.modal(`<div class="modal-icon">🗑️</div><p class="modal-text">¿Cancelar ${TYPES[ev.type].icon} ${TYPES[ev.type].name} de las ${fmtHour(ev.at)}?</p>`, 'Cancelar evento')) {
          MN.act(() => Store.update('events', ev.id, { status: 'cancelled' }), 'Evento cancelado');
        }
      }
      if (a.dataset.evadmin === 'move') {
        const local = new Date(ev.at - new Date().getTimezoneOffset() * MIN).toISOString().slice(0, 16);
        const res = await MN.modal(`<h3>Cambiar hora</h3><label>${TYPES[ev.type].icon} ${TYPES[ev.type].name}<input type="datetime-local" name="at" value="${local}"></label>`, 'Guardar');
        if (res && res.at) MN.act(() => Store.update('events', ev.id, { at: new Date(res.at).getTime() }), 'Hora cambiada');
      }
    }
  }

  return {
    init(api) {
      MN = api;
      MN.stopwatchGame = stopwatchGame;
      MN.registerTx('communist', { line: (t) => ({ icon: '☭', text: `Evento comunista: la Banca expropia <b>${t.share * t.to.length}</b> fichas a ${MN.who(t.from)} y las reparte entre ${t.to.map(MN.who).join(', ')}`, sub: `${t.share} para cada uno` }) });
      MN.registerTx('happy', { line: (t) => ({ icon: '🍻', text: `Happy hour: la Banca paga <b>${t.amount}</b> fichas extra a ${MN.who(t.player)}`, sub: 'Premio doble' }) });
      MN.registerTx('ticket', { line: (t) => ({ icon: '🎟️', text: `${MN.who(t.player)} compra un boleto de lotería`, sub: `${t.amount} fichas` }) });
      MN.registerTx('lottery', { line: (t) => ({ icon: '🎟️', text: `${MN.who(t.winner)} gana la lotería y se lleva <b>${t.pot}</b> fichas`, sub: `${t.tickets} boletos vendidos` }) });
      MN.registerTx('king', { line: (t) => ({ icon: '👑', text: `${MN.who(t.king)} sigue en la cima y cobra <b>${t.pot}</b> fichas de tributo`, sub: `Rey de la colina · ronda ${t.round}` }) });
      MN.registerTx('dilemma', { line: (t) => ({ icon: '🤝', text: `Dilema del prisionero: ${Object.entries(t.payouts).map(([id, v]) => `${MN.who(id)} ${v > 0 ? '+' : ''}${v}`).join(', ')}`, sub: 'Cooperar o traicionar' }) });
      MN.registerTx('vote', { line: (t) => ({ icon: '🕶️', text: 'Alguien compra un voto secreto en el evento fascista', sub: `${t.amount} fichas a la Banca` }) });
      MN.registerTx('plebiscite', { line: (t) => ({ icon: '🎖️', text: `${MN.who(t.winner)} gana el evento fascista y cobra <b>${t.pot}</b> fichas de tributo`, sub: `${t.votes} votos` }) });
      MN.registerTx('stopwatch', { line: (t) => ({ icon: '⏱️', text: `${MN.who(t.winner)} gana el cronómetro global con ${secs(t.ms)} s y se lleva <b>${t.pot}</b> fichas`, sub: `Entrada: ${t.buyIn} fichas por cabeza` }) });

      document.addEventListener('click', onClick);
      document.addEventListener('change', (e) => { const sl = e.target.closest('.pv-sel'); if (sl) pvChoice[sl.dataset.ev] = sl.value; });

      // Banca: programar y lanzar eventos
      MN.$('#ev-type').innerHTML = Object.entries(TYPES).map(([k, T]) => `<option value="${k}">${T.icon} ${T.name}</option>`).join('');
      MN.$('#ev-form').addEventListener('submit', (e) => {
        e.preventDefault();
        const type = MN.$('#ev-type').value; const at = MN.$('#ev-at').value;
        if (!at) return MN.toast('Pon fecha y hora', 'bad');
        MN.act(() => Store.put('events', { id: Store.uid(), type, at: new Date(at).getTime(), status: 'scheduled', createdAt: Date.now() }), '📅 Evento programado');
      });
      MN.$('#ev-surprise').addEventListener('click', async () => {
        const type = MN.$('#ev-type').value; const s = set();
        // Lotería: 30 min de venta. Cronómetro: la inscripción abre ya.
        const lead = type === 'lottery' ? 30 * MIN : type === 'stopwatch' ? (Number(s.stopwatchSignupMinutes) || 15) * MIN : 0;
        const ok = await MN.modal(`<div class="modal-icon">⚡</div><p class="modal-text">¿Lanzar ${TYPES[type].icon} <b>${TYPES[type].name}</b> por sorpresa ahora mismo?</p>`, 'Lanzar');
        if (ok) MN.act(() => Store.put('events', { id: Store.uid(), type, at: Date.now() + lead, status: 'scheduled', surprise: true, createdAt: Date.now() }), '⚡ ¡Evento sorpresa lanzado!');
      });
      MN.$('#ev-rehearse').addEventListener('click', rehearse);
      MN.$('#ev-restore').addEventListener('click', restore);
      MN.$('#ev-reset').addEventListener('click', async () => {
        if (!await MN.modal('<div class="modal-icon">📅</div><p class="modal-text">¿Volver a cargar el calendario por defecto?</p><p class="hint center">Se reprograman los 6 eventos originales (los ya celebrados no se repiten).</p>', 'Cargar')) return;
        const list = DEFAULT_CALENDAR.filter(([id]) => { const ex = (MN.S.events || []).find((e) => e.id === id); return !ex || ex.status !== 'done'; })
          .map(([id, type, at]) => ({ id, type, at: new Date(at).getTime(), status: 'scheduled', createdAt: Date.now() }));
        MN.act(() => Store.putMany({ events: list }), 'Calendario cargado');
      });
    },
    render,
    tick,
    sweep,
    onState() {
      remind();
      // Si ya ha jugado el último apuntado al cronómetro, se resuelve al momento
      if (events().some((ev) => ev.type === 'stopwatch' && ev.status === 'scheduled' && phase(ev) === 'playing'
        && entriesOf(ev, 'signup').length && entriesOf(ev, 'signup').every((x) => x.attemptMs != null))) sweepSoon();
    },
    // Antes del comunista se censura el ranking: nadie sabe quién va primero
    rankMask() {
      if (!MN.S || !MN.started()) return null;
      const win = (Number(set().communistMaskMinutes) || 0) * MIN; if (!win) return null;
      const now = Date.now();
      const ev = events().filter((e) => e.type === 'communist' && e.status === 'scheduled' && e.at > now && e.at - now <= win).sort((a, b) => a.at - b.at)[0];
      if (!ev) return null;
      return {
        icon: '☭', name: 'Camarada',
        banner: `☭ <b>El Partido ha ocultado el ranking.</b> Expropiación al primero en <b class="ev-cd" data-to="${ev.at}">${countdown(ev.at - now)}</b>`,
        chart: '☭<br><b>Censurado por el Partido</b><br><span class="muted small">La gráfica vuelve tras la expropiación</span>',
      };
    },
    rankExtra(id) { return (id === currentKing() ? '<span class="bounty-tag king-tag" title="Cobra a todos en cada ronda">👑 REY</span>' : '') + (id === dictator() ? '<span class="bounty-tag dictator-tag" title="Elegido en el evento fascista">🎖️ DICTADOR</span>' : ''); },
    // Para otros módulos y las normas
    api: () => ({ events, phase, happyActiveAt, TYPES, ART, dictator, dilemmaPairs, BANK }),
    rules(section) {
      const s = set();
      return section('🎉', 'Eventos', `
        <p>Durante la partida hay eventos programados (los ves en <b>📅 Eventos</b> y en la portada). La Banca puede añadir alguno <b>sorpresa</b>.</p>
        <ul>${Object.values(TYPES).map((T) => `<li><b>${T.icon} ${T.name}</b>: ${MN.esc(T.desc(s))}</li>`).join('')}</ul>
        <p class="hint">Recibirás un aviso 15 minutos antes de cada evento.</p>`);
    },
  };
})());
