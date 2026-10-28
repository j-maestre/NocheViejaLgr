// ============================================================
//  ALMACENAMIENTO
//  Dos "backends" con la misma interfaz:
//   - local:    localStorage (solo este navegador, para pruebas)
//   - firebase: Firestore en tiempo real (todos ven lo mismo)
//
//  Los saldos NO se guardan: se calculan a partir del historial de
//  movimientos (txs). Así anular un movimiento es trivial y el
//  historial siempre cuadra con el ranking.
//
//  `put` sustituye el documento si ya existe ese id. Los movimientos
//  automáticos (eventos, recompensas…) usan ids deterministas, así que
//  aunque dos móviles los ejecuten a la vez solo queda uno.
// ============================================================
(function () {
  'use strict';

  const DEFAULTS = {
    startChips: 100,
    minBet: 5,
    loanAmount: 50,
    startDate: '2026-12-29T00:00', // empieza la partida (llegada a Nochevieja)
    endDate: '2026-12-31T23:00',
    // Límite de apuesta por tramos. `from` admite fecha (00:00) o fecha y hora.
    limitSchedule: [
      { from: '2026-12-29', pct: 10 },
      { from: '2026-12-30', pct: 20 },
      { from: '2026-12-31', pct: 30 },
      { from: '2026-12-31T20:00', pct: 50 },
    ],
    games: [
      'Lanzamiento de corcho logroñés',
      'Duelo de miradas',
      'Trivial',
      'Cronómetro (segundo exacto)',
      'Póker',
      'Dixit',
      'Fallera calavera',
    ],
    punishments: [
      'Chupito',
      'Fregar los platos',
      'Bajar la basura',
      'Cantar una canción entera',
      'Imitar a alguien del grupo',
      '20 flexiones',
      'Servir las copas durante una hora',
    ],
    adminPin: '1234',
    cowardFine: 2,           // multa por rechazar un reto (va a la Banca)
    rejectCooldownHours: 6,  // tras un rechazo, el retador no puede repetir con esa persona
    maxPendingOut: 2,        // retos enviados sin contestar a la vez
    challengeExpiryHours: 12, // los retos sin respuesta caducan (sin multa)

    // Eventos
    communistPct: 25,        // % que se expropia al primero
    communistLast: 3,        // entre cuántos de los últimos se reparte
    communistMaskMinutes: 30, // antes del comunista el ranking se oculta (☭ Camarada)
    happyMultiplier: 2,      // en happy hour el ganador cobra x2 (el extra lo pone la Banca)
    happyMinutes: 60,
    lotteryPrice: 5,
    lotteryBankBonus: 20,    // la Banca añade esto al bote
    stopwatchPct: 5,         // cada uno pone el 5% del capital del más pobre de los apuntados
    stopwatchTarget: 10,     // segundos objetivo
    stopwatchSignupMinutes: 15,
    stopwatchPlayMinutes: 10,
    plebisciteVoteMinutes: 10, // 🗳️ plebiscito: minutos de votación
    plebiscitePrice: 3,        // precio de cada voto extra (va a la Banca)
    plebisciteTribute: 5,      // lo que paga cada jugador al Dictador

    // Extras
    bountyPerWin: 6,         // 🎯 cazarrecompensas: fichas por cada victoria de la racha cortada (las pone la Banca)
    bountyMinStreak: 5,      // racha a partir de la cual la cabeza tiene precio
    lastRoundMinutes: 60,    // ⚡ última ronda antes del cierre: apuesta sin límite + ALL IN extra (0 = no hay)

    // 👑 Rey de la colina (evento): cada X min, el primero cobra Y fichas a cada jugador
    kingMinutes: 60, kingEveryMinutes: 10, kingTribute: 1,
    // 🤝 Dilema del prisionero (evento)
    dilemmaMinutes: 10, dilemmaCoop: 10, dilemmaTemptation: 20, dilemmaSucker: 10, dilemmaPunish: 5,
    // 🕵️ Misiones diarias
    missionsPerDay: 3, missionReward: 8,
    // 🎱 Bingo (evento)
    bingoPrice: 5, bingoMaxCards: 4, bingoBallSeconds: 6, bingoBankBonus: 20, bingoLinePct: 30,
    // 🔮 Porra del campeón y del farolillo rojo
    porraStake: 10, porraCloseDate: '2026-12-30T20:00',
    betWindowMinutes: 10,    // apuestas de espectadores abiertas X min desde que empieza el duelo
    betMaxPct: 10,           // apuesta máxima de un espectador: % de su capital
    marketPrices: { immunity: 15, forced: 20, insurance: 10 },
    immunityHours: 6,
  };

  // Colecciones de la partida y campo por el que se ordenan
  const COLLECTIONS = {
    players: 'createdAt',
    txs: 'ts',
    challenges: 'createdAt',
    tables: 'createdAt',   // mesas multijugador
    events: 'at',          // calendario de eventos
    entries: 'ts',         // boletos de lotería, inscripciones al cronómetro…
    bets: 'ts',            // apuestas de espectadores
  };
  const NAMES = Object.keys(COLLECTIONS);

  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

  function normalize(raw) {
    const out = { settings: Object.assign({}, DEFAULTS, raw.settings || {}) };
    // La censura antes del comunista pasó de 60 (o 3 en el ensayo) a 30 minutos
    if ([60, 3].includes(Number(out.settings.communistMaskMinutes))) out.settings.communistMaskMinutes = 30;
    // El tributo al Dictador pasó de 2 a 5 fichas por cabeza
    if (Number(out.settings.plebisciteTribute) === 2) out.settings.plebisciteTribute = 5;
    // La recompensa de la diana pasó de 3 a 6 fichas por victoria
    if (Number(out.settings.bountyPerWin) === 3) out.settings.bountyPerWin = 6;
    out.settings.marketPrices = Object.assign({}, DEFAULTS.marketPrices, (raw.settings || {}).marketPrices || {});
    NAMES.forEach((n) => {
      const k = COLLECTIONS[n];
      out[n] = (raw[n] || []).slice().sort((a, b) => (a[k] || 0) - (b[k] || 0));
    });
    return out;
  }

  // ---------------------------------------------------------- local
  function localBackend(gameId) {
    const KEY = 'mn_data_' + gameId;
    const empty = () => { const e = { settings: {} }; NAMES.forEach((n) => { e[n] = []; }); return e; };
    const read = () => {
      try { return Object.assign(empty(), JSON.parse(localStorage.getItem(KEY))); } catch (e) { return empty(); }
    };
    let data = read();
    let listener = () => {};
    const write = () => {
      try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) { /* sin almacenamiento */ }
      listener(normalize(data));
      return Promise.resolve();
    };
    const upsert = (col, doc) => {
      const list = data[col]; const i = list.findIndex((x) => x.id === doc.id);
      if (i >= 0) list[i] = doc; else list.push(doc);
    };
    // Sincroniza entre pestañas del mismo navegador
    window.addEventListener('storage', (e) => {
      if (e.key === KEY) { data = read(); listener(normalize(data)); }
    });

    return {
      mode: 'local',
      start(cb) { listener = cb; cb(normalize(data)); },
      put(col, doc) { upsert(col, doc); return write(); },
      update(col, id, patch) { Object.assign(data[col].find((x) => x.id === id) || {}, patch); return write(); },
      putMany(map) { Object.entries(map).forEach(([col, docs]) => docs.forEach((d) => upsert(col, d))); return write(); },
      saveSettings(s) { data.settings = s; return write(); },
      replaceAll(d) {
        data = empty();
        NAMES.forEach((n) => { data[n] = d[n] || []; });
        data.settings = d.settings || {};
        return write();
      },
    };
  }

  // ------------------------------------------------------- firebase
  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.onload = resolve;
      s.onerror = () => reject(new Error('No se pudo cargar ' + src));
      document.head.appendChild(s);
    });
  }

  async function firebaseBackend(cfg, gameId) {
    const v = '10.12.2';
    await loadScript(`https://www.gstatic.com/firebasejs/${v}/firebase-app-compat.js`);
    await loadScript(`https://www.gstatic.com/firebasejs/${v}/firebase-firestore-compat.js`);
    firebase.initializeApp(cfg);
    const db = firebase.firestore();
    const root = db.collection('games').doc(gameId);
    const col = (n) => root.collection(n);
    const settingsRef = root.collection('meta').doc('settings');

    async function commitInChunks(ops) {
      for (let i = 0; i < ops.length; i += 400) {
        const batch = db.batch();
        ops.slice(i, i + 400).forEach((op) => op(batch));
        await batch.commit();
      }
    }

    return {
      mode: 'firebase',
      start(cb, onError) {
        const raw = { settings: null };
        NAMES.forEach((n) => { raw[n] = null; });
        const emit = () => { if (raw.settings && NAMES.every((n) => raw[n])) cb(normalize(raw)); };
        const docs = (snap) => snap.docs.map((d) => Object.assign({}, d.data(), { id: d.id }));
        NAMES.forEach((n) => col(n).onSnapshot((s) => { raw[n] = docs(s); emit(); }, onError));
        settingsRef.onSnapshot((d) => { raw.settings = d.exists ? d.data() : {}; emit(); }, onError);
      },
      put: (c, doc) => col(c).doc(doc.id).set(doc),
      update: (c, id, patch) => col(c).doc(id).update(patch),
      putMany: (map) => commitInChunks(Object.entries(map).flatMap(([c, list]) => list.map((d) => (b) => b.set(col(c).doc(d.id), d)))),
      saveSettings: (s) => settingsRef.set(s),
      async replaceAll(d) {
        const snaps = await Promise.all(NAMES.map((n) => col(n).get()));
        const ops = [];
        snaps.forEach((snap) => snap.docs.forEach((doc) => ops.push((b) => b.delete(doc.ref))));
        await commitInChunks(ops);
        const writes = [];
        NAMES.forEach((n) => (d[n] || []).forEach((x) => writes.push((b) => b.set(col(n).doc(x.id), x))));
        writes.push((b) => b.set(settingsRef, d.settings || {}));
        await commitInChunks(writes);
      },
    };
  }

  // ------------------------------------------------------- fachada
  let backend = null;

  window.Store = {
    DEFAULTS,
    COLLECTIONS: NAMES,
    uid,
    get mode() { return backend ? backend.mode : null; },
    async init(onChange, onError) {
      const cfg = window.MN_CONFIG || {};
      const gameId = cfg.gameId || 'default';
      backend = cfg.firebase ? await firebaseBackend(cfg.firebase, gameId) : localBackend(gameId);
      backend.start(onChange, onError);
      return backend.mode;
    },
    put: (c, doc) => backend.put(c, doc),
    update: (c, id, patch) => backend.update(c, id, patch),
    putMany: (map) => backend.putMany(map),
    saveSettings: (s) => backend.saveSettings(s),
    replaceAll: (d) => backend.replaceAll(d),

    // Atajos (nombres antiguos)
    addPlayer: (p) => backend.put('players', p),
    updatePlayer: (id, patch) => backend.update('players', id, patch),
    addTx: (t) => backend.put('txs', t),
    addMany: (d) => backend.putMany(d),
    updateTx: (id, patch) => backend.update('txs', id, patch),
    addChallenge: (c) => backend.put('challenges', c),
    updateChallenge: (id, patch) => backend.update('challenges', id, patch),
  };
})();
