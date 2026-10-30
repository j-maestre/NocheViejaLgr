// ============================================================
//  MÓDULO: MISIONES SECRETAS Y CARTAS DEL CAOS
//  🕵️ Cada día de partida, cada jugador recibe 3 misiones secretas (solo
//  las ve él) y una ☠️ Misión del caos, más difícil. Se reparten con un azar
//  fijo (mismo resultado en todos los móviles) y se comprueban solas a partir
//  del historial. Cada misión cumplida paga fichas de la Banca; la del caos
//  da una 🃏 carta del caos con un poder especial de un solo uso.
//  Pagos: tx `mis_<día>_<jugador>_<n>` · Cartas: entries `card_<día>_<jugador>`
// ============================================================
(window.MNModules = window.MNModules || []).push((function () {
  'use strict';
  let MN;
  const DAY = 86400000; const HOUR = 3600000;

  // ---------------------------------------------------------- días de partida
  const pad = (n) => String(n).padStart(2, '0');
  const dayKey = (ts) => { const d = new Date(ts); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
  const dayStart = (key) => new Date(key + 'T00:00').getTime();
  function gameDays(now = Date.now()) {
    if (!MN.S || !MN.started()) return [];
    const out = []; const last = Math.min(now, MN.endTs() - 1);
    for (let t = dayStart(dayKey(MN.startTs())); t <= last; t += DAY) out.push(dayKey(t + HOUR * 3)); // +3 h: a prueba de cambios de hora
    return [...new Set(out)];
  }
  const range = (key) => [Math.max(dayStart(key), MN.startTs()), Math.min(dayStart(key) + DAY, MN.endTs())];

  // Azar con semilla: misma semilla, mismas misiones en todos los móviles
  function rng(seed) {
    let a = MN.hash(seed) >>> 0;
    return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }

  // ---------------------------------------------------------- datos del día
  function dayData(pid, key) {
    const [from, to] = range(key); const S = MN.S;
    const inDay = (ts) => ts >= from && ts < to;
    const duels = S.txs.filter((t) => t.type === 'duel' && !t.voided && inDay(t.ts) && (t.winner === pid || t.loser === pid)).sort((a, b) => a.ts - b.ts);
    const wins = duels.filter((t) => t.winner === pid);
    let run = 0; let best = 0; duels.forEach((t) => { run = t.winner === pid ? run + 1 : 0; best = Math.max(best, run); });
    const betTxs = S.txs.filter((t) => t.kind === 'bets' && !t.voided && !t.refund && inDay(t.ts));
    const betWins = betTxs.filter((t) => (t.payouts[pid] || 0) > 0).length;
    const tables = S.txs.filter((t) => t.kind === 'table' && !t.voided && inDay(t.ts) && t.payouts && pid in t.payouts);
    const ch = S.challenges;
    const leaderAt = (ts) => { const bal = MN.balancesAt(ts); return S.players.map((p) => p.id).sort((a, b) => bal[b] - bal[a])[0]; };
    const net = S.txs.filter((t) => !t.voided && inDay(t.ts) && !['init', 'loan', 'adjust'].includes(t.type) && !['mission', 'card'].includes(t.kind))
      .reduce((a, t) => a + MN.effects(t).filter(([id]) => id === pid).reduce((x, [, d]) => x + d, 0), 0);
    return {
      duels, wins, best, betWins, tables, net, inDay, leaderAt,
      bets: (S.bets || []).filter((b) => b.player === pid && inDay(b.ts) && !b.cancelled).length,
      sent: ch.filter((c) => c.from === pid && inDay(c.createdAt || 0)).length,
      accepted: ch.filter((c) => c.to === pid && c.acceptedAt && inDay(c.acceptedAt)).length,
      chicken: ch.some((c) => c.from === pid && c.status === 'rejected' && inDay(c.closedAt || 0)),
      events: (S.entries || []).some((x) => x.player === pid && ['ticket', 'signup', 'vote', 'choice'].includes(x.kind) && inDay(x.ts || 0)),
      market: S.txs.some((t) => t.kind === 'market' && !t.voided && t.player === pid && inDay(t.ts)),
      bounty: S.txs.some((t) => t.kind === 'bounty' && !t.voided && t.player === pid && inDay(t.ts)),
    };
  }

  // ---------------------------------------------------------- misiones
  // text(m) → texto · goal → objetivo · prog(d, m) → progreso actual
  const G = (m) => `<b>${MN.esc(m.g)}</b>`; const X = (m) => `<b>${MN.esc(MN.player(m.x).name)}</b>`;
  const MISSIONS = [
    { id: 'win2', text: () => 'Gana 2 duelos', goal: 2, prog: (d) => d.wins.length },
    { id: 'play4', text: () => 'Juega 4 duelos (ganes o pierdas)', goal: 4, prog: (d) => d.duels.length },
    { id: 'beatX', text: (m) => `Gánale un duelo a ${X(m)}`, goal: 1, needX: true, prog: (d, m) => d.wins.filter((t) => t.loser === m.x).length },
    { id: 'playG', text: (m) => `Juega un duelo de ${G(m)}`, goal: 1, needG: true, prog: (d, m) => d.duels.filter((t) => t.game === m.g).length },
    { id: 'winG', text: (m) => `Gana un duelo de ${G(m)}`, goal: 1, needG: true, prog: (d, m) => d.wins.filter((t) => t.game === m.g).length },
    { id: 'big10', text: () => 'Gana un duelo de 10 fichas o más', goal: 1, prog: (d) => d.wins.filter((t) => t.amount >= 10).length },
    { id: 'underdog', text: () => 'Gánale a alguien que tenga más fichas que tú', goal: 1, prog: (d, m) => d.wins.filter((t) => { const b = MN.balancesAt(t.ts - 1); return (b[t.loser] || 0) > (b[m.pid] || 0); }).length },
    { id: 'streak3', text: () => 'Gana 3 duelos seguidos', goal: 3, prog: (d) => d.best },
    { id: 'dedic', text: () => 'Gana un duelo y déjale una dedicatoria al perdedor', goal: 1, prog: (d) => d.wins.filter((t) => t.dedication).length },
    { id: 'revenge', text: () => 'Gana una revancha', goal: 1, prog: (d) => d.wins.filter((t) => { const c = MN.S.challenges.find((x) => x.id === t.challengeId); return c && c.rematchOf; }).length },
    { id: 'beatLeader', text: () => 'Gánale un duelo al primero del ranking', goal: 1, prog: (d) => d.wins.filter((t) => d.leaderAt(t.ts - 1) === t.loser).length },
    { id: 'send3', text: () => 'Envía 3 retos', goal: 3, prog: (d) => d.sent },
    { id: 'accept2', text: () => 'Acepta 2 retos', goal: 2, prog: (d) => d.accepted },
    { id: 'chicken', text: () => 'Consigue que alguien rechace un reto tuyo 🐔', goal: 1, prog: (d) => (d.chicken ? 1 : 0) },
    { id: 'betWin', text: () => 'Acierta una apuesta de espectador', goal: 1, prog: (d) => d.betWins },
    { id: 'bet2', text: () => 'Apuesta en 2 duelos ajenos', goal: 2, prog: (d) => d.bets },
    { id: 'table', text: () => 'Juega una mesa', goal: 1, prog: (d) => d.tables.length },
    { id: 'tableWin', text: () => 'Gana una mesa', goal: 1, prog: (d, m) => d.tables.filter((t) => (t.winners || []).includes(m.pid)).length },
    { id: 'event', text: () => 'Participa en un evento (boleto, inscripción, voto…)', goal: 1, prog: (d) => (d.events ? 1 : 0) },
    { id: 'market', text: () => 'Compra algo en el mercado negro', goal: 1, prog: (d) => (d.market ? 1 : 0) },
  ];
  const CHAOS = [
    { id: 'c_streak4', text: () => 'Gana 4 duelos seguidos', goal: 4, prog: (d) => d.best },
    { id: 'c_allin', text: () => 'Gana un 💣 ALL IN', goal: 1, prog: (d) => d.wins.filter((t) => t.allIn).length },
    { id: 'c_three', text: () => 'Gánale a 3 personas distintas', goal: 3, prog: (d) => new Set(d.wins.map((t) => t.loser)).size },
    { id: 'c_big20', text: () => 'Gana un duelo de 20 fichas o más', goal: 1, prog: (d) => d.wins.filter((t) => t.amount >= 20).length },
    { id: 'c_bets2', text: () => 'Acierta 2 apuestas de espectador', goal: 2, prog: (d) => d.betWins },
    { id: 'c_tables2', text: () => 'Gana 2 mesas', goal: 2, prog: (d, m) => d.tables.filter((t) => (t.winners || []).includes(m.pid)).length },
    { id: 'c_bounty', text: () => 'Cobra una 🎯 diana (córtale la racha a alguien)', goal: 1, prog: (d) => (d.bounty ? 1 : 0) },
    { id: 'c_sw', text: () => 'Gana un duelo de cronómetro a menos de 0,15 s del objetivo', goal: 1, prog: (d, m) => d.wins.filter((t) => t.sw && Math.abs(t.sw[m.pid] - (Number(MN.S.settings.stopwatchTarget) || 10) * 1000) < 150).length },
    { id: 'c_plus30', text: () => 'Gana 30 fichas netas en el día', goal: 30, prog: (d) => Math.max(0, d.net) },
    { id: 'c_x2', text: (m) => `Gánale 2 veces a ${X(m)}`, goal: 2, needX: true, prog: (d, m) => d.wins.filter((t) => t.loser === m.x).length },
  ];

  // Misiones de un jugador para un día: [3 normales..., 1 del caos]
  function missionsFor(pid, key) {
    const r = rng(`${(window.MN_CONFIG || {}).gameId}|${pid}|${key}`);
    const others = MN.S.players.filter((p) => p.id !== pid).map((p) => p.id);
    const games = (MN.S.settings.games || []).filter(Boolean);
    const ok = (def) => (!def.needX || others.length) && (!def.needG || games.length);
    const pick = (list) => list[Math.floor(r() * list.length)];
    const pool = MISSIONS.filter(ok).slice();
    const n = Math.max(1, Number(MN.S.settings.missionsPerDay) || 3);
    const out = [];
    for (let i = 0; i < n && pool.length; i++) {
      const def = pool.splice(Math.floor(r() * pool.length), 1)[0];
      out.push({ def, pid, key, i, x: pick(others), g: pick(games) });
    }
    const chaos = CHAOS.filter(ok);
    out.push({ def: pick(chaos), pid, key, i: 'c', chaos: true, x: pick(others), g: pick(games) });
    return out;
  }
  function status(m, data) {
    const p = Math.min(m.def.goal, m.def.prog(data, m) || 0);
    return { p, done: p >= m.def.goal };
  }

  // ---------------------------------------------------------- cartas del caos
  const POWERS = {
    heist: { icon: '🦹', name: 'Atraco', desc: 'Róbale 5 fichas a quien elijas.', target: true },
    rain: { icon: '🌧️', name: 'Lluvia de fichas', desc: 'La Banca te regala 15 fichas.' },
    tax: { icon: '💸', name: 'Impuesto revolucionario', desc: 'Todos los demás te pagan 2 fichas.' },
    double: { icon: '✖️', name: 'Doble o nada', desc: 'Si ganas tu próximo duelo, la Banca te paga otra vez lo apostado.' },
    shield: { icon: '🛡️', name: 'Escudo', desc: 'Si pierdes tu próximo duelo, la Banca te devuelve lo perdido.' },
    gag: { icon: '🤐', name: 'Mordaza', desc: 'Elige a alguien: no podrá retar a nadie durante 1 hora.', target: true },
    ghost: { icon: '👻', name: 'Fantasma', desc: 'Durante 1 hora nadie puede retarte.' },
    magnet: { icon: '🧲', name: 'Imán', desc: 'Durante 1 hora cobras 1 ficha de la Banca por cada duelo que se juegue (de quien sea).' },
  };
  const cards = () => (MN.S.entries || []).filter((x) => x.kind === 'card');
  const myCards = (pid) => cards().filter((c) => c.player === pid);
  const activeCard = (power, pred) => cards().find((c) => c.power === power && c.usedAt && Date.now() < c.usedAt + HOUR && pred(c));

  // ---------------------------------------------------------- pagos (barrido)
  async function sweep() {
    if (!MN.S || !MN.started()) return;
    const S = MN.S; const have = new Set(S.txs.map((t) => t.id)); const haveE = new Set((S.entries || []).map((x) => x.id));
    const reward = Number(S.settings.missionReward) || 0;
    const txs = []; const entries = [];
    gameDays().forEach((key) => {
      const [from] = range(key);
      S.players.filter((p) => p.createdAt < from + DAY).forEach((p) => {
        const data = dayData(p.id, key);
        missionsFor(p.id, key).forEach((m) => {
          if (!status(m, data).done) return;
          if (m.chaos) {
            const id = `card_${key}_${p.id}`;
            if (!haveE.has(id)) {
              const powers = Object.keys(POWERS);
              entries.push({ id, kind: 'card', eventId: null, player: p.id, power: powers[Math.floor(rng(id)() * powers.length)], day: key, ts: Date.now() });
            }
          } else if (reward) {
            const id = `mis_${key}_${p.id}_${m.i}`;
            if (!have.has(id)) txs.push({ id, type: 'bonus', kind: 'mission', ts: Date.now(), player: p.id, amount: reward, mission: m.def.id, day: key });
          }
        });
      });
    });
    if (txs.length || entries.length) await Store.putMany({ txs, entries });
    await syncCardEffects();
  }

  // Efectos de las cartas que dependen de lo que pase después (doble, escudo, imán)
  async function syncCardEffects() {
    const S = MN.S; const writes = []; const now = Date.now();
    cards().filter((c) => c.usedAt).forEach((c) => {
      const id = 'cardfx_' + c.id; const cur = S.txs.find((t) => t.id === id);
      if (c.power === 'double' || c.power === 'shield') {
        if (cur) return;
        const next = S.txs.filter((t) => t.type === 'duel' && !t.voided && t.ts > c.usedAt && (t.winner === c.player || t.loser === c.player)).sort((a, b) => a.ts - b.ts)[0];
        if (!next || !next.amount) return;
        if ((c.power === 'double' && next.winner === c.player) || (c.power === 'shield' && next.loser === c.player)) {
          writes.push({ id, type: 'bonus', kind: 'card', ts: next.ts + 6, player: c.player, amount: next.amount, power: c.power, srcId: next.id });
        }
      }
      if (c.power === 'magnet') {
        const n = S.txs.filter((t) => t.type === 'duel' && !t.voided && t.ts >= c.usedAt && t.ts < c.usedAt + HOUR).length;
        if (n && (!cur || cur.amount !== n)) writes.push({ id, type: 'bonus', kind: 'card', ts: Math.min(now, c.usedAt + HOUR), player: c.player, amount: n, power: 'magnet' });
      }
    });
    if (writes.length) await Store.putMany({ txs: writes });
  }

  // Usar una carta
  async function useCard(card) {
    const P = POWERS[card.power]; const mine = MN.me(); if (!P || !mine || card.usedAt) return;
    let target = null;
    if (P.target) {
      const opts = MN.S.players.filter((p) => p.id !== mine.id).map((p) => `<option value="${MN.esc(p.id)}">${MN.esc(p.emoji)} ${MN.esc(p.name)}</option>`).join('');
      const res = await MN.modal(`<div class="modal-icon">${P.icon}</div><p class="modal-text">${P.name}</p><p class="hint center">${P.desc}</p><label>¿A quién?<select name="target">${opts}</select></label>`, `${P.icon} ¡Usar!`);
      if (!res || !res.target) return; target = res.target;
    } else if (!await MN.modal(`<div class="modal-icon">${P.icon}</div><p class="modal-text">¿Usar ${P.name}?</p><p class="hint center">${P.desc}</p>`, `${P.icon} ¡Usar!`)) return;
    const now = Date.now(); const bal = MN.balances(); const txs = [];
    if (card.power === 'heist') { const v = Math.min(5, Math.max(0, bal[target] || 0)); if (v) txs.push({ id: 'card_' + card.id, type: 'payout', kind: 'card', power: 'heist', ts: now, payouts: { [target]: -v, [mine.id]: v } }); }
    if (card.power === 'rain') txs.push({ id: 'card_' + card.id, type: 'bonus', kind: 'card', power: 'rain', ts: now, player: mine.id, amount: 15 });
    if (card.power === 'tax') {
      const payouts = {}; let pot = 0;
      MN.S.players.filter((p) => p.id !== mine.id).forEach((p) => { const v = Math.min(2, Math.max(0, bal[p.id] || 0)); if (v) { payouts[p.id] = -v; pot += v; } });
      if (pot) { payouts[mine.id] = pot; txs.push({ id: 'card_' + card.id, type: 'payout', kind: 'card', power: 'tax', ts: now, payouts }); }
    }
    await MN.act(async () => {
      await Store.update('entries', card.id, Object.assign({ usedAt: now }, target ? { target } : {}));
      if (txs.length) await Store.putMany({ txs });
    }, `${P.icon} ¡${P.name}!`);
    if (MN.fx) MN.fx.confetti({ colors: ['#ffffff', '#888888', '#ff4d6d'], count: 120 });
  }

  // ---------------------------------------------------------- pintar
  function render() {
    const el = MN.$('#missions-card'); if (!el) return;
    const mine = MN.me();
    if (!mine || !MN.S || !MN.started() || MN.ended()) { el.innerHTML = ''; return; }
    const key = dayKey(Date.now()); const data = dayData(mine.id, key);
    const list = missionsFor(mine.id, key);
    const normal = list.filter((m) => !m.chaos); const chaos = list.find((m) => m.chaos);
    const reward = Number(MN.S.settings.missionReward) || 0;
    const row = (m) => { const st = status(m, data); return `<li class="${st.done ? 'done' : ''}"><span class="ms-check">${st.done ? '✅' : '⬜'}</span>
      <span class="ms-text">${m.def.text(m)}</span>${m.def.goal > 1 ? `<span class="ms-prog">${st.p}/${m.def.goal}</span>` : ''}</li>`; };
    const cst = status(chaos, data);
    const unused = myCards(mine.id).filter((c) => !c.usedAt);
    el.innerHTML = `<div class="card missions">
      <h3>🕵️ Tus misiones secretas de hoy</h3>
      <p class="hint">Solo las ves tú. Cada una cumplida: <b>+${reward}</b> fichas de la Banca. Mañana, misiones nuevas.</p>
      <ul class="ms-list">${normal.map(row).join('')}</ul>
      <div class="chaos ${cst.done ? 'done' : ''}">
        <div class="chaos-title">☠️ Misión del caos</div>
        <div class="ms-text">${chaos.def.text(chaos)}${chaos.def.goal > 1 ? ` <span class="ms-prog">${cst.p}/${chaos.def.goal}</span>` : ''}</div>
        <div class="chaos-reward">${cst.done ? '✅ ¡Cumplida! Ya tienes tu carta del caos' : 'Premio: 🃏 una carta del caos con un poder especial'}</div>
      </div>
      ${unused.length ? `<div class="cards-hand"><div class="cards-title">🃏 Tus cartas del caos</div>${unused.map((c) => { const P = POWERS[c.power]; return `<div class="chaos-card">
        <div class="cc-icon">${P.icon}</div><div class="cc-body"><b>${P.name}</b><div class="small">${P.desc}</div></div>
        <button type="button" class="btn primary" data-card="${MN.esc(c.id)}">Usar</button></div>`; }).join('')}</div>` : ''}
    </div>`;
  }

  // ---------------------------------------------------------- avisos
  let prevTx = null; let prevCards = null;
  function onState() {
    const mine = MN.me(); const S = MN.S;
    const txIds = new Set(S.txs.map((t) => t.id)); const cardState = {};
    cards().forEach((c) => { cardState[c.id] = c.usedAt || 0; });
    if (prevTx && mine) {
      const msgs = [];
      S.txs.filter((t) => !prevTx.has(t.id) && t.kind === 'mission' && t.player === mine.id).forEach((t) => {
        const m = missionsFor(mine.id, t.day).find((x) => x.def.id === t.mission);
        msgs.push(`🕵️ ¡Misión cumplida!${m ? ` «${m.def.text(m).replace(/<[^>]+>/g, '')}»` : ''} +${t.amount} fichas`);
      });
      cards().forEach((c) => {
        const P = POWERS[c.power]; if (!P) return;
        if (!(c.id in prevCards) && c.player === mine.id) msgs.push(`☠️ ¡Misión del caos cumplida! Te llevas una carta: ${P.icon} ${P.name}`);
        if (!prevCards[c.id] && c.usedAt && c.player !== mine.id) {
          const who = MN.esc(MN.player(c.player).name);
          if (c.power === 'heist' && c.target === mine.id) msgs.push(`🦹 ${who} te ha atracado con una carta del caos: −5 fichas`);
          if (c.power === 'tax') msgs.push(`💸 ${who} usa el Impuesto revolucionario: le pagas 2 fichas`);
          if (c.power === 'gag' && c.target === mine.id) msgs.push(`🤐 ${who} te ha puesto una mordaza: no puedes retar a nadie durante 1 hora`);
          if (c.power === 'ghost') msgs.push(`👻 ${who} se vuelve fantasma: nadie puede retarle durante 1 hora`);
        }
      });
      if (msgs.length) MN.notify(msgs, 'misiones');
    }
    prevTx = txIds; prevCards = cardState;
  }

  return {
    init(api) {
      MN = api;
      MN.registerTx('mission', { line: (t) => ({ icon: '🕵️', text: `${MN.who(t.player)} cumple una misión secreta y cobra <b>${t.amount}</b> fichas`, sub: 'Paga la Banca' }) });
      MN.registerTx('card', {
        line: (t) => {
          const P = POWERS[t.power] || { icon: '🃏', name: 'Carta del caos' };
          const parts = t.payouts ? Object.entries(t.payouts).map(([id, v]) => `${MN.who(id)} ${v > 0 ? '+' : ''}${v}`).join(', ') : `${MN.who(t.player)} +${t.amount}`;
          return { icon: P.icon, text: `Carta del caos · <b>${P.name}</b>: ${parts}`, sub: 'Poder especial' };
        },
      });
      document.addEventListener('click', (e) => {
        const b = e.target.closest('[data-card]'); if (!b) return;
        const c = cards().find((x) => x.id === b.dataset.card); if (c) useCard(c);
      });
    },
    render,
    sweep,
    onState,
    // 🤐 Mordaza y 👻 Fantasma
    challengeBlock(from, to) {
      if (activeCard('gag', (c) => c.target === from)) return '🤐 Llevas una mordaza: no puedes retar a nadie durante un rato.';
      if (activeCard('ghost', (c) => c.player === to)) return `👻 ${MN.esc(MN.player(to).name)} es un fantasma: nadie puede retarle durante un rato.`;
      return null;
    },
    rankExtra(id) { return activeCard('ghost', (c) => c.player === id) ? '<span class="bounty-tag" title="Nadie puede retarle durante 1 hora">👻</span>' : ''; },
    // Para el resumen final
    missionsDone: (pid) => MN.S.txs.filter((t) => t.kind === 'mission' && !t.voided && t.player === pid).length,
    cardsWon: (pid) => myCards(pid).length,
    rules(section) {
      const s = MN.S.settings;
      return section('🕵️', 'Misiones secretas y cartas del caos', `
        <ul>
          <li>Cada día tienes <b>${s.missionsPerDay} misiones secretas</b> (en la portada, solo las ves tú). Cada una cumplida paga <b>${s.missionReward} fichas</b> de la Banca.</li>
          <li>Además hay una <b>☠️ Misión del caos</b>, más difícil. Si la cumples, ganas una <b>🃏 carta del caos</b> con un poder de un solo uso:</li>
        </ul>
        <ul class="small">${Object.values(POWERS).map((P) => `<li>${P.icon} <b>${P.name}</b>: ${P.desc}</li>`).join('')}</ul>`);
    },
  };
})());
