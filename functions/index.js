// ============================================================
//  NOTIFICACIONES PUSH (Firebase Cloud Functions)
//  Avisan aunque la app esté cerrada o el móvil bloqueado:
//  - Retos: te retan, aceptan/rechazan/caducan, resultado a confirmar…
//  - Mesas: alguien abre una mesa, empieza, resultado a confirmar, cierre.
//  - Eventos: 15 minutos antes y al empezar.
//  Cada móvil guarda su token en games/{gameId}/push/{token} = { pid }.
//  Los textos son los mismos que en la web: así la notificación local y la
//  push llevan la misma etiqueta y el móvil no la muestra dos veces.
// ============================================================
const admin = require('firebase-admin');
const { setGlobalOptions } = require('firebase-functions/v2');
const { onDocumentWritten } = require('firebase-functions/v2/firestore');
const { onSchedule } = require('firebase-functions/v2/scheduler');

admin.initializeApp();
setGlobalOptions({ region: 'europe-west1', maxInstances: 3 });
const db = admin.firestore();

const MIN = 60000;
const hash = (s) => [...String(s)].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 0);
const game = (g) => db.collection('games').doc(g);

async function names(gameId) {
  const snap = await game(gameId).collection('players').get();
  const out = {}; snap.forEach((d) => { out[d.id] = d.data().name || '¿?'; });
  return out;
}

// Envía `body` a los jugadores `pids` (o a todos si es null), menos `except` (uno o varios).
// `cat`: tipo de aviso; no llega a quien lo haya apagado en su perfil (sin tipo, llega siempre).
async function send(gameId, pids, body, except, cat) {
  const skip = [].concat(except || []);
  if (cat) {
    const ps = await game(gameId).collection('players').get();
    ps.forEach((d) => { const n = d.data().notif; if (n && n[cat] === false) skip.push(d.id); });
  }
  const snap = await game(gameId).collection('push').get();
  const docs = snap.docs.filter((d) => {
    const pid = d.data().pid;
    return pid && !skip.includes(pid) && (!pids || pids.includes(pid));
  });
  if (!docs.length) return;
  const tokens = docs.map((d) => d.id);
  const res = await admin.messaging().sendEachForMulticast({
    tokens,
    data: { title: 'Mercado Negro', body, tag: 'mn-' + hash(body), url: './' },
    webpush: { headers: { Urgency: 'high', TTL: '3600' } },
  });
  // Borra los tokens de móviles que ya no existen
  const dead = [];
  res.responses.forEach((r, i) => {
    const code = r.error && r.error.code;
    if (code === 'messaging/registration-token-not-registered' || code === 'messaging/invalid-argument') dead.push(docs[i].ref.delete());
  });
  await Promise.all(dead);
}

// ---------------------------------------------------------- retos
exports.retos = onDocumentWritten('games/{gameId}/challenges/{id}', async (e) => {
  const before = e.data.before.exists ? e.data.before.data() : null;
  const c = e.data.after.exists ? e.data.after.data() : null;
  if (!c || (before && before.status === c.status)) return;
  const n = await names(e.params.gameId);
  const b = before && before.status;
  const jobs = [];
  const to = (pid, msg) => jobs.push(send(e.params.gameId, [pid], msg, null, 'retos'));
  const rival = (pid) => n[pid === c.from ? c.to : c.from] || '¿?';

  if (!b && c.status === 'pending') to(c.to, c.allIn ? `💣 ${rival(c.to)} te reta a un ALL IN a ${c.game}: ¡os jugáis todas las fichas!` : `⚔️ ${rival(c.to)} te reta a ${c.game} por ${c.amount} fichas`);
  else if (b === 'pending' && c.status === 'accepted') {
    to(c.from, `✅ ${rival(c.from)} ha aceptado tu reto. ¡A jugar!`);
    // Al resto: a apostar (mismo texto que en la web)
    const set = await game(e.params.gameId).collection('meta').doc('settings').get();
    const mins = Number((set.exists && set.data().betWindowMinutes) || 10);
    jobs.push(send(e.params.gameId, null, `${c.allIn ? '💣 ALL IN: ' : '🎰 '}${n[c.from] || '¿?'} vs ${n[c.to] || '¿?'} a ${c.game} por ${c.amount} fichas. ¡Tienes ${mins} min para apostar!`, [c.from, c.to], 'apuestas'));
  }
  else if (c.status === 'rejected') to(c.from, `🐔 ${rival(c.from)} ha rechazado tu reto`);
  else if (c.status === 'expired') to(c.from, `⌛ ${rival(c.from)} no contestó a tu reto y ha caducado`);
  else if (c.status === 'cancelled') [c.from, c.to].filter((p) => p !== c.cancelledBy).forEach((p) => to(p, `🚫 Se ha cancelado el reto con ${rival(p)}`));
  else if (c.status === 'reported') [c.from, c.to].filter((p) => p !== c.reportedBy).forEach((p) => to(p, `⚖️ ${rival(p)} ha registrado el resultado. Confírmalo.`));
  else if (c.status === 'done' && c.agAuto) {
    const lab = (p) => (c['ag_' + p] != null ? c['agl_' + p] : 'Abandonó a medias');
    [c.from, c.to].filter((p) => p !== c.finishedBy).forEach((p) => {
      const o = p === c.from ? c.to : c.from;
      to(p, c.winner === p ? `🏆 ¡Le ganas a ${rival(p)} en ${c.game}! ${lab(p)}` : `😵 ${rival(p)} te gana en ${c.game}: ${lab(o)}`);
    });
  }
  else if (c.status === 'done' && c.swAuto) {
    const secs = (ms) => (ms / 1000).toFixed(2).replace('.', ',');
    [c.from, c.to].filter((p) => p !== c.finishedBy).forEach((p) => {
      const o = p === c.from ? c.to : c.from;
      to(p, c.winner === p ? `⏱️ ¡Ganas el cronómetro contra ${rival(p)}! ${secs(c['sw_' + p])} s contra ${secs(c['sw_' + o])} s` : `⏱️ ${rival(p)} te gana al cronómetro: ${secs(c['sw_' + o])} s contra tus ${secs(c['sw_' + p])} s`);
    });
  }
  else if (c.status === 'done' && c.reportedBy) to(c.reportedBy, `💰 ${rival(c.reportedBy)} ha confirmado el resultado`);
  else if (b === 'reported' && c.status === 'accepted' && c.disputedBy) [c.from, c.to].filter((p) => p !== c.disputedBy).forEach((p) => to(p, `❌ ${rival(p)} no está de acuerdo con el resultado`));
  await Promise.all(jobs);
});

// ---------------------------------------------------------- mesas
exports.mesas = onDocumentWritten('games/{gameId}/tables/{id}', async (e) => {
  const before = e.data.before.exists ? e.data.before.data() : null;
  const t = e.data.after.exists ? e.data.after.data() : null;
  if (!t || (before && before.status === t.status)) return;
  const g = e.params.gameId;
  const seats = (t.seats || []).map((s) => s.player);
  if (!before && t.status === 'open') {
    const n = await names(g);
    return send(g, null, `🃏 ${n[t.createdBy] || 'Alguien'} abre una mesa de ${t.game} (entrada ${t.buyIn})${t.msg ? `: «${t.msg}»` : ''}. ¡Siéntate!`, t.createdBy, 'mesas');
  }
  if (t.status === 'playing' && before && before.status === 'open') return send(g, seats, `🃏 La mesa de ${t.game} ha empezado. ¡A jugar!`, t.createdBy, 'mesas');
  if (t.status === 'reported') {
    const n = await names(g);
    return send(g, seats, `⚖️ ${n[t.reportedBy] || 'Alguien'} ha registrado quién ganó la mesa de ${t.game}. Confírmalo.`, t.reportedBy, 'mesas');
  }
  if (t.status === 'cancelled') return send(g, seats, `🚫 Se ha cerrado la mesa de ${t.game}`, t.createdBy, 'mesas');
  return null;
});

// ---------------------------------------------------------- préstamos
// A todos: cuando la Banca presta fichas y cuando el moroso cumple su castigo
exports.prestamos = onDocumentWritten('games/{gameId}/txs/{id}', async (e) => {
  const before = e.data.before.exists ? e.data.before.data() : null;
  const t = e.data.after.exists ? e.data.after.data() : null;
  if (!t || t.type !== 'loan' || t.voided) return null;
  const created = !before;
  const paid = before && !before.done && t.done;
  if (!created && !paid) return null;
  const g = e.params.gameId;
  const [n, set] = await Promise.all([names(g), game(g).collection('meta').doc('settings').get()]);
  const bank = set.exists ? set.data().bankPlayerId : null;
  const name = n[t.player] || 'Alguien';
  if (created) {
    return Promise.all([
      send(g, [t.player], `🏦 La Banca te ha prestado ${t.amount} fichas. Tu castigo: ${t.punishment}`, bank),
      send(g, null, `🍺 ${name} ha pedido un préstamo de ${t.amount} fichas a la Banca. Castigo: ${t.punishment}`, [t.player, bank], 'prestamos'),
    ]);
  }
  return Promise.all([
    send(g, [t.player], '✅ Has saldado tu deuda con la Banca. Ya no eres moroso', bank),
    send(g, null, `✅ ${name} ha cumplido su castigo (${t.punishment}) y ya no es moroso`, [t.player, bank], 'prestamos'),
  ]);
});

// ---------------------------------------------------------- 🐦 salas de Flappy
exports.salas = onDocumentWritten('games/{gameId}/flappy/{id}', async (e) => {
  if (e.data.before.exists || !e.data.after.exists) return null;
  const r = e.data.after.data(); const n = await names(e.params.gameId);
  return send(e.params.gameId, null, `🐦 ${n[r.host] || 'Alguien'} abre una sala de Flappy${r.buyIn ? ` (entrada ${r.buyIn})` : ''}. ¡Entra a jugar!`, r.host, 'mesas');
});

// ---------------------------------------------------------- 📸 fotos de la fiesta
exports.fotos = onDocumentWritten('games/{gameId}/photos/{id}', async (e) => {
  if (e.data.before.exists || !e.data.after.exists) return null;
  const p = e.data.after.data(); const n = await names(e.params.gameId);
  return send(e.params.gameId, null, `📸 ${n[p.by] || 'Alguien'} ha subido una foto${p.caption ? `: «${p.caption}»` : ''}. ¡Dale ❤️ si te gusta!`, p.by, 'fotos');
});

// ---------------------------------------------------------- jugadores nuevos
exports.registros = onDocumentWritten('games/{gameId}/players/{id}', async (e) => {
  if (e.data.before.exists || !e.data.after.exists) return null;
  const p = e.data.after.data(); if (p.demo) return null;
  const all = await game(e.params.gameId).collection('players').get();
  return send(e.params.gameId, null, `🎰 ${p.name || 'Alguien'} se ha sentado a la mesa. ¡Ya sois ${all.size}!`, e.params.id, 'jugadores');
});

// ---------------------------------------------------------- peticiones y cartas
// 🙏 Préstamos pedidos (a la Banca), denegados (al jugador) y 🃏 cartas del caos usadas
exports.peticiones = onDocumentWritten('games/{gameId}/entries/{id}', async (e) => {
  const before = e.data.before.exists ? e.data.before.data() : null;
  const x = e.data.after.exists ? e.data.after.data() : null;
  if (!x) return null;
  const g = e.params.gameId;
  if (x.kind === 'loanreq') {
    if (!before && x.status === 'pending') {
      const [n, set] = await Promise.all([names(g), game(g).collection('meta').doc('settings').get()]);
      const bank = set.exists ? set.data().bankPlayerId : null;
      if (bank && bank !== x.player) return send(g, [bank], `🙏 ${n[x.player] || 'Alguien'} pide un préstamo a la Banca${x.msg ? `: «${x.msg}»` : ''}`);
    }
    if (before && before.status === 'pending' && x.status === 'denied') return send(g, [x.player], '🏦 La Banca ha denegado tu préstamo. Suplica mejor.');
    return null;
  }
  // 🔮 ¿Qué pasará?: pregunta nueva (a todos) y resuelta (a quien apostó)
  if (x.kind === 'pred') {
    const n = await names(g);
    if (!before) return send(g, null, `🔮 ${n[x.by] || 'Alguien'} pregunta: «${x.q}» ¡Apuesta SÍ o NO!`, x.by, 'pred');
    if (before.status === 'open' && x.status !== 'open') {
      const bets = await game(g).collection('entries').where('predId', '==', e.params.id).get();
      const pids = [...new Set(bets.docs.map((d) => d.data()).filter((b) => b.kind === 'pbet').map((b) => b.player))];
      const msg = x.status === 'void' ? `🔮 «${x.q}» se ha anulado: recuperas tu apuesta` : `🔮 «${x.q}»: ${x.status === 'yes' ? '¡SÍ pasó!' : 'NO pasó'} Entra a ver si has ganado`;
      if (pids.length) return send(g, pids, msg, null, 'pred');
    }
    return null;
  }
  if (x.kind === 'card' && x.usedAt && !(before && before.usedAt)) {
    const n = await names(g); const who = n[x.player] || 'Alguien';
    if (x.power === 'heist' && x.target) return send(g, [x.target], `🦹 ${who} te ha atracado con una carta del caos: −5 fichas`, null, 'misiones');
    if (x.power === 'gag' && x.target) return send(g, [x.target], `🤐 ${who} te ha puesto una mordaza: no puedes retar a nadie durante 1 hora`, null, 'misiones');
    if (x.power === 'tax') return send(g, null, `💸 ${who} usa el Impuesto revolucionario: le pagas 2 fichas`, x.player, 'misiones');
    if (x.power === 'ghost') return send(g, null, `👻 ${who} se vuelve fantasma: nadie puede retarle durante 1 hora`, x.player, 'misiones');
  }
  return null;
});

// ---------------------------------------------------------- eventos
const EVENTS = {
  communist: ['☭', 'Evento comunista', '☭ ¡Empieza el evento comunista! Entra a ver a quién expropia el Partido 👀'],
  happyhour: ['🍻', 'Happy hour', '🍻 ¡Empieza la happy hour! Los duelos pagan el doble'],
  lottery: ['🎟️', 'Lotería', '🎟️ ¡Se sortea la lotería! Entra a ver quién se lleva el bote 👀'],
  plebiscite: ['🦅', 'Evento fascista', '🦅 ¡Evento fascista! Vota en secreto a tu Dictador. Los votos extra se compran 😏'],
  king: ['👑', 'Rey de la colina', '👑 ¡Rey de la colina! El primero del ranking cobra a todos cada pocos minutos. ¡A por él!'],
  bingo: ['🎱', 'Bingo', '🎱 ¡Empieza el bingo! Entra a ver si cantas línea'],
  dilemma: ['🤝', 'Dilema del prisionero', '🤝 ¡Dilema del prisionero! Elige en secreto: cooperar o traicionar'],
  stopwatch: ['⏱️', 'Cronómetro global', '⏱️ ¡Inscripción abierta para el cronómetro global! Apúntate ya'],
};

// Cada minuto: avisos de 15 minutos antes, de inicio y de final (una sola vez cada uno).
// El final se avisa por la hora, aunque nadie tenga la web abierta para resolver el evento:
// al entrar, el móvil lo resuelve y enseña la animación.
exports.eventos = onSchedule({ schedule: 'every 1 minutes', timeZone: 'Europe/Madrid' }, async () => {
  const now = Date.now();
  const games = await db.collection('games').listDocuments();
  for (const g of games) {
    const [evs, set] = await Promise.all([g.collection('events').get(), g.collection('meta').doc('settings').get()]);
    const s = set.exists ? set.data() : {};
    if (s.endDate && now >= new Date(s.endDate).getTime() + 30 * MIN) continue;
    // ⚡ Última ronda y 🕵️ misiones nuevas cada mañana (una vez)
    const once = async (key, msg, cat) => {
      try { await g.collection('pushlog').doc(key).create({ at: now }); } catch (err) { return; }
      await send(g.id, null, msg, null, cat);
    };
    const endTs = s.endDate ? new Date(s.endDate).getTime() : 0;
    const last = Number(s.lastRoundMinutes) || 0;
    if (endTs && last && now >= endTs - last * MIN && now < endTs) await once(`lastround_${endTs}`, `⚡ ¡ÚLTIMA RONDA! Queda ${last >= 60 ? `${last / 60} hora` : `${last} min`}: apuesta sin límite y un 💣 ALL IN extra para todos`, 'eventos');
    const startTs = s.startDate ? new Date(s.startDate).getTime() : 0;
    const madrid = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hour12: false }).formatToParts(new Date(now));
    const part = (t) => (madrid.find((x) => x.type === t) || {}).value;
    if (startTs && now >= startTs && now < endTs && Number(part('hour')) >= 10) await once(`missions_${part('year')}-${part('month')}-${part('day')}_${startTs}`, '🕵️ Tienes misiones secretas nuevas para hoy. ¡Y una ☠️ Misión del caos!', 'misiones');

    for (const d of evs.docs) {
      const ev = d.data(); const T = EVENTS[ev.type]; if (!T || ev.status === 'cancelled') continue;
      const start = ev.type === 'stopwatch' ? ev.at - (Number(s.stopwatchSignupMinutes) || 15) * MIN : ev.at;
      const fire = async (key, msg, pids = null) => {
        try { await g.collection('pushlog').doc(`${d.id}_${key}_${ev.at}`).create({ at: now }); } catch (err) { return; } // ya enviado
        await send(g.id, pids, msg, null, 'eventos');
      };
      if (ev.status === 'scheduled') {
        if (start - now <= 15 * MIN && start - now > 2 * MIN) await fire('15', `⏰ En 15 minutos: ${T[0]} ${T[1]}`);
        const msg = ev.type === 'king' ? `👑 ¡Rey de la colina! Durante ${s.kingMinutes || 60} min, el primero cobra ${s.kingTribute || 1} a cada uno cada ${s.kingEveryMinutes || 10} min. ¡A por él!`
          : ev.type === 'dilemma' ? `🤝 ¡Dilema del prisionero! Tienes ${s.dilemmaMinutes || 10} min para elegir en secreto: cooperar o traicionar` : ev.type === 'plebiscite' ? `🦅 ¡Evento fascista! Vota en secreto a tu Dictador en los próximos ${s.plebisciteVoteMinutes || 10} min. Los votos extra se compran 😏` : ev.type === 'happyhour' ? `🍻 ¡Empieza la happy hour! Los duelos pagan x${s.happyMultiplier || 2} durante ${s.happyMinutes || 60} min` : T[2];
        if (now >= start && now - start < 5 * MIN) await fire('start', msg);
        // Cronómetro: a los apuntados, cuando les toca jugar
        if (ev.type === 'stopwatch' && now >= ev.at && now - ev.at < 5 * MIN) {
          const ents = await g.collection('entries').where('eventId', '==', d.id).get();
          const pids = ents.docs.map((x) => x.data()).filter((x) => x.kind === 'signup' && !x.withdrawn).map((x) => x.player);
          if (pids.length) await fire('play', '⏱️ ¡Te toca! Juega al cronómetro global antes de que cierre', pids);
        }
      }
      // Final (la lotería y el comunista se resuelven al empezar: ya avisa el de inicio)
      let end = null;
      if (ev.type === 'plebiscite') end = ev.at + (Number(s.plebisciteVoteMinutes) || 10) * MIN;
      if (ev.type === 'stopwatch') end = ev.at + (Number(s.stopwatchPlayMinutes) || 10) * MIN;
      if (ev.type === 'happyhour') end = ev.at + (Number(s.happyMinutes) || 60) * MIN;
      if (ev.type === 'king') end = ev.at + (Number(s.kingMinutes) || 60) * MIN;
      if (ev.type === 'dilemma') end = ev.at + (Number(s.dilemmaMinutes) || 10) * MIN;
      if (ev.status === 'done' && ev.result && ev.result.at && end) end = Math.min(end, ev.result.at);
      if (end && now >= end && now - end < 10 * MIN) {
        await fire('end', ev.type === 'happyhour' ? '🍻 Se acabó la happy hour. Los duelos vuelven a pagar lo normal' : `${T[0]} ${T[1]}: ¡ya ha terminado! Entra para ver qué ha pasado 👀`);
      }
    }
  }
});
