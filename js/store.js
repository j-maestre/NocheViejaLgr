// ============================================================
//  ALMACENAMIENTO
//  Dos "backends" con la misma interfaz:
//   - local:    localStorage (solo este navegador, para pruebas)
//   - firebase: Firestore en tiempo real (todos ven lo mismo)
//
//  Los saldos NO se guardan: se calculan a partir del historial de
//  movimientos (txs). Así anular un movimiento es trivial y el
//  historial siempre cuadra con el ranking.
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
  };

  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

  function normalize(raw) {
    return {
      players: (raw.players || []).slice().sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0)),
      txs: (raw.txs || []).slice().sort((a, b) => (a.ts || 0) - (b.ts || 0)),
      challenges: (raw.challenges || []).slice().sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0)),
      settings: Object.assign({}, DEFAULTS, raw.settings || {}),
    };
  }

  // ---------------------------------------------------------- local
  function localBackend(gameId) {
    const KEY = 'mn_data_' + gameId;
    const empty = () => ({ players: [], txs: [], challenges: [], settings: {} });
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
    // Sincroniza entre pestañas del mismo navegador
    window.addEventListener('storage', (e) => {
      if (e.key === KEY) { data = read(); listener(normalize(data)); }
    });

    return {
      mode: 'local',
      start(cb) { listener = cb; cb(normalize(data)); },
      addPlayer(p) { data.players.push(p); return write(); },
      updatePlayer(id, patch) { Object.assign(data.players.find((p) => p.id === id) || {}, patch); return write(); },
      addTx(t) { data.txs.push(t); return write(); },
      addMany({ players = [], txs = [] }) { data.players.push(...players); data.txs.push(...txs); return write(); },
      updateTx(id, patch) { Object.assign(data.txs.find((t) => t.id === id) || {}, patch); return write(); },
      addChallenge(c) { data.challenges.push(c); return write(); },
      updateChallenge(id, patch) { Object.assign(data.challenges.find((c) => c.id === id) || {}, patch); return write(); },
      saveSettings(s) { data.settings = s; return write(); },
      replaceAll(d) {
        data = { players: d.players || [], txs: d.txs || [], challenges: d.challenges || [], settings: d.settings || {} };
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
    const players = root.collection('players');
    const txs = root.collection('txs');
    const challenges = root.collection('challenges');
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
        const raw = { players: null, txs: null, challenges: null, settings: null };
        const emit = () => { if (raw.players && raw.txs && raw.challenges && raw.settings) cb(normalize(raw)); };
        const docs = (snap) => snap.docs.map((d) => Object.assign({}, d.data(), { id: d.id }));
        players.onSnapshot((s) => { raw.players = docs(s); emit(); }, onError);
        txs.onSnapshot((s) => { raw.txs = docs(s); emit(); }, onError);
        challenges.onSnapshot((s) => { raw.challenges = docs(s); emit(); }, onError);
        settingsRef.onSnapshot((d) => { raw.settings = d.exists ? d.data() : {}; emit(); }, onError);
      },
      addPlayer: (p) => players.doc(p.id).set(p),
      updatePlayer: (id, patch) => players.doc(id).update(patch),
      addTx: (t) => txs.doc(t.id).set(t),
      addMany: (d) => commitInChunks([
        ...(d.players || []).map((p) => (b) => b.set(players.doc(p.id), p)),
        ...(d.txs || []).map((t) => (b) => b.set(txs.doc(t.id), t)),
      ]),
      updateTx: (id, patch) => txs.doc(id).update(patch),
      addChallenge: (c) => challenges.doc(c.id).set(c),
      updateChallenge: (id, patch) => challenges.doc(id).update(patch),
      saveSettings: (s) => settingsRef.set(s),
      async replaceAll(d) {
        const snaps = await Promise.all([players.get(), txs.get(), challenges.get()]);
        const ops = [];
        snaps.forEach((snap) => snap.docs.forEach((doc) => ops.push((b) => b.delete(doc.ref))));
        await commitInChunks(ops);
        const writes = [];
        (d.players || []).forEach((p) => writes.push((b) => b.set(players.doc(p.id), p)));
        (d.txs || []).forEach((t) => writes.push((b) => b.set(txs.doc(t.id), t)));
        (d.challenges || []).forEach((c) => writes.push((b) => b.set(challenges.doc(c.id), c)));
        writes.push((b) => b.set(settingsRef, d.settings || {}));
        await commitInChunks(writes);
      },
    };
  }

  // ------------------------------------------------------- fachada
  let backend = null;
  const call = (name) => (...args) => backend[name](...args);

  window.Store = {
    DEFAULTS,
    uid,
    get mode() { return backend ? backend.mode : null; },
    async init(onChange, onError) {
      const cfg = window.MN_CONFIG || {};
      const gameId = cfg.gameId || 'default';
      backend = cfg.firebase ? await firebaseBackend(cfg.firebase, gameId) : localBackend(gameId);
      backend.start(onChange, onError);
      return backend.mode;
    },
    addPlayer: call('addPlayer'),
    updatePlayer: call('updatePlayer'),
    addTx: call('addTx'),
    addMany: call('addMany'),
    updateTx: call('updateTx'),
    addChallenge: call('addChallenge'),
    updateChallenge: call('updateChallenge'),
    saveSettings: call('saveSettings'),
    replaceAll: call('replaceAll'),
  };
})();
