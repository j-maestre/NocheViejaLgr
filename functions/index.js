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

// Envía `body` a los jugadores `pids` (o a todos si es null), menos `except` (uno o varios)
async function send(gameId, pids, body, except) {
  const skip = [].concat(except || []);
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
  const to = (pid, msg) => jobs.push(send(e.params.gameId, [pid], msg));
  const rival = (pid) => n[pid === c.from ? c.to : c.from] || '¿?';

  if (!b && c.status === 'pending') to(c.to, c.allIn ? `💣 ${rival(c.to)} te reta a un ALL IN a ${c.game}: ¡os jugáis todas las fichas!` : `⚔️ ${rival(c.to)} te reta a ${c.game} por ${c.amount} fichas`);
  else if (b === 'pending' && c.status === 'accepted') to(c.from, `✅ ${rival(c.from)} ha aceptado tu reto. ¡A jugar!`);
  else if (c.status === 'rejected') to(c.from, `🐔 ${rival(c.from)} ha rechazado tu reto`);
  else if (c.status === 'expired') to(c.from, `⌛ ${rival(c.from)} no contestó a tu reto y ha caducado`);
  else if (c.status === 'cancelled') [c.from, c.to].filter((p) => p !== c.cancelledBy).forEach((p) => to(p, `🚫 Se ha cancelado el reto con ${rival(p)}`));
  else if (c.status === 'reported') [c.from, c.to].filter((p) => p !== c.reportedBy).forEach((p) => to(p, `⚖️ ${rival(p)} ha registrado el resultado. Confírmalo.`));
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
    return send(g, null, `🃏 ${n[t.createdBy] || 'Alguien'} abre una mesa de ${t.game} (entrada ${t.buyIn}). ¡Siéntate!`, t.createdBy);
  }
  if (t.status === 'playing' && before && before.status === 'open') return send(g, seats, `🃏 La mesa de ${t.game} ha empezado. ¡A jugar!`, t.createdBy);
  if (t.status === 'reported') {
    const n = await names(g);
    return send(g, seats, `⚖️ ${n[t.reportedBy] || 'Alguien'} ha registrado quién ganó la mesa de ${t.game}. Confírmalo.`, t.reportedBy);
  }
  if (t.status === 'cancelled') return send(g, seats, `🚫 Se ha cerrado la mesa de ${t.game}`, t.createdBy);
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
      send(g, null, `🍺 ${name} ha pedido un préstamo de ${t.amount} fichas a la Banca. Castigo: ${t.punishment}`, [t.player, bank]),
    ]);
  }
  return Promise.all([
    send(g, [t.player], '✅ Has saldado tu deuda con la Banca. Ya no eres moroso', bank),
    send(g, null, `✅ ${name} ha cumplido su castigo (${t.punishment}) y ya no es moroso`, [t.player, bank]),
  ]);
});

// ---------------------------------------------------------- eventos
const EVENTS = {
  communist: ['☭', 'Evento comunista', '☭ ¡Empieza el evento comunista! Entra a ver a quién expropia el Partido 👀'],
  happyhour: ['🍻', 'Happy hour', '🍻 ¡Empieza la happy hour! Los duelos pagan el doble'],
  lottery: ['🎟️', 'Lotería', '🎟️ ¡Se sortea la lotería! Entra a ver quién se lleva el bote 👀'],
  plebiscite: ['🗳️', 'Plebiscito amañado', '🗳️ ¡Plebiscito! Vota a tu Dictador. Los votos extra se compran 😏'],
  stopwatch: ['⏱️', 'Cronómetro global', '⏱️ ¡Inscripción abierta para el cronómetro global! Apúntate ya'],
};

// Cada minuto: avisos de 15 minutos antes y de inicio (una sola vez cada uno)
exports.eventos = onSchedule({ schedule: 'every 1 minutes', timeZone: 'Europe/Madrid' }, async () => {
  const now = Date.now();
  const games = await db.collection('games').listDocuments();
  for (const g of games) {
    const [evs, set] = await Promise.all([g.collection('events').where('status', '==', 'scheduled').get(), g.collection('meta').doc('settings').get()]);
    if (evs.empty) continue;
    const s = set.exists ? set.data() : {};
    if (s.endDate && now >= new Date(s.endDate).getTime()) continue;
    for (const d of evs.docs) {
      const ev = d.data(); const T = EVENTS[ev.type]; if (!T) continue;
      const start = ev.type === 'stopwatch' ? ev.at - (Number(s.stopwatchSignupMinutes) || 15) * MIN : ev.at;
      const fire = async (key, msg) => {
        try { await g.collection('pushlog').doc(`${d.id}_${key}_${ev.at}`).create({ at: now }); } catch (err) { return; } // ya enviado
        await send(g.id, null, msg);
      };
      if (start - now <= 15 * MIN && start - now > 2 * MIN) await fire('15', `⏰ En 15 minutos: ${T[0]} ${T[1]}`);
      const msg = ev.type === 'plebiscite' ? `🗳️ ¡Plebiscito! Vota a tu Dictador en los próximos ${s.plebisciteVoteMinutes || 10} min. Los votos extra se compran 😏` : ev.type === 'happyhour' ? `🍻 ¡Empieza la happy hour! Los duelos pagan x${s.happyMultiplier || 2} durante ${s.happyMinutes || 60} min` : T[2];
      if (now >= start && now - start < 5 * MIN) await fire('start', msg);
    }
  }
});
