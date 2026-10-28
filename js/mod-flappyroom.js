// ============================================================
//  MÓDULO: 🐦 SALA DE FLAPPY (todos a la vez, en tiempo real)
//  Alguien abre una sala (con entrada opcional), los demás entran y quien
//  la abrió pulsa «¡Empezar!». Todos juegan la misma partida a la vez y
//  ven las caras del resto volando.
//
//  Cada móvil solo envía SUS TOQUES (unas pocas veces por segundo). Como la
//  física es determinista, cada móvil reconstruye a los demás a partir de sus
//  toques: se ven en tiempo real y sin mandar posiciones. Si alguien se
//  desconecta, su pájaro deja de aletear y se cae solo.
//
//  Datos (fuera de las colecciones normales, en tiempo real):
//    games/{partida}/flappy/{sala}            → la sala
//    games/{partida}/flappy/{sala}/live/{id}  → toques y resultado de cada uno
//  Premio: tx `flroom_<sala>` (todos ponen la entrada y el ganador se la lleva)
// ============================================================
(window.MNModules = window.MNModules || []).push((function () {
  'use strict';
  let MN; let api = null; let rooms = []; let unRooms = null;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const LAG = 30; // pasos (½ s) de retraso con que se ve a los rivales

  // ---------------------------------------------------------- tiempo real (Firebase o, en pruebas, entre pestañas)
  function makeApi() {
    const cfg = window.MN_CONFIG || {};
    if (Store.mode === 'firebase' && window.firebase) {
      const root = firebase.firestore().collection('games').doc(cfg.gameId).collection('flappy');
      const FV = firebase.firestore.FieldValue;
      return {
        watchRooms: (cb) => root.where('status', 'in', ['lobby', 'playing']).onSnapshot((s) => cb(s.docs.map((d) => Object.assign({}, d.data(), { id: d.id }))), () => {}),
        setRoom: (r) => root.doc(r.id).set(r),
        updateRoom: (id, p) => root.doc(id).update(p),
        join: (id, pid) => root.doc(id).update({ players: FV.arrayUnion(pid) }),
        leave: (id, pid) => root.doc(id).update({ players: FV.arrayRemove(pid) }),
        watchLive: (id, cb) => root.doc(id).collection('live').onSnapshot((s) => { const o = {}; s.docs.forEach((d) => { o[d.id] = d.data(); }); cb(o); }, () => {}),
        setLive: (id, pid, data) => root.doc(id).collection('live').doc(pid).set(data, { merge: true }),
      };
    }
    // Modo pruebas: localStorage + BroadcastChannel (varias pestañas con ?local&yo=Nombre)
    const KEY = `mn_flappy_${cfg.gameId}`;
    const bc = 'BroadcastChannel' in window ? new BroadcastChannel(KEY) : null;
    const subs = new Set();
    const read = () => { try { return JSON.parse(localStorage.getItem(KEY)) || { rooms: {}, live: {} }; } catch (e) { return { rooms: {}, live: {} }; } };
    const write = (fn) => { const d = read(); fn(d); localStorage.setItem(KEY, JSON.stringify(d)); subs.forEach((f) => f()); if (bc) bc.postMessage(1); };
    if (bc) bc.onmessage = () => subs.forEach((f) => f());
    const sub = (f) => { subs.add(f); f(); return () => subs.delete(f); };
    return {
      watchRooms: (cb) => sub(() => cb(Object.values(read().rooms).filter((r) => ['lobby', 'playing'].includes(r.status)))),
      setRoom: async (r) => write((d) => { d.rooms[r.id] = r; }),
      updateRoom: async (id, p) => write((d) => { Object.assign(d.rooms[id], p); }),
      join: async (id, pid) => write((d) => { const r = d.rooms[id]; if (!r.players.includes(pid)) r.players.push(pid); }),
      leave: async (id, pid) => write((d) => { const r = d.rooms[id]; r.players = r.players.filter((x) => x !== pid); }),
      watchLive: (id, cb) => sub(() => cb(read().live[id] || {})),
      setLive: async (id, pid, data) => write((d) => { d.live[id] = d.live[id] || {}; d.live[id][pid] = Object.assign({}, d.live[id][pid] || {}, data); }),
    };
  }

  // ---------------------------------------------------------- tarjeta en ⚔️ Duelo
  function render() {
    const el = MN.$('#flappy-rooms'); if (!el || !MN.S) return;
    const mine = MN.me(); const esc = MN.esc;
    const list = rooms.slice().sort((a, b) => a.createdAt - b.createdAt);
    const face = (id) => `<span class="fr-face" title="${esc(MN.player(id).name)}">${MN.face(MN.player(id), 'mini')}</span>`;
    const card = (r) => {
      const inside = mine && r.players.includes(mine.id); const host = mine && r.host === mine.id;
      let actions = '';
      if (r.status === 'lobby' && mine) {
        if (!inside) actions += `<button type="button" class="btn primary" data-fr="join" data-id="${esc(r.id)}">🐦 Entrar</button>`;
        if (inside && !host) actions += `<button type="button" class="btn ghost" data-fr="leave" data-id="${esc(r.id)}">Salir</button>`;
        if (host) actions += `<button type="button" class="btn primary" data-fr="start" data-id="${esc(r.id)}" ${r.players.length < 2 ? 'disabled' : ''}>🚀 ¡Empezar!</button><button type="button" class="btn ghost" data-fr="close" data-id="${esc(r.id)}">Cerrar sala</button>`;
      }
      if (r.status === 'playing' && inside) actions += `<button type="button" class="btn primary" data-fr="play" data-id="${esc(r.id)}">▶ Volver a la partida</button>`;
      return `<li class="challenge fr-room ${r.status}">
        <div class="ch-head">🐦 <b>Sala de ${esc(MN.player(r.host).name)}</b><span class="ch-amount">${r.buyIn ? r.buyIn * r.players.length : '🎉'}</span></div>
        <div class="ch-sub">${r.buyIn ? `Entrada ${r.buyIn} · el ganador se lleva el bote` : 'Por diversión (sin fichas en juego)'}${r.msg ? ` · “${esc(r.msg)}”` : ''}</div>
        <div class="fr-faces">${r.players.map(face).join('')}</div>
        <div class="ch-status">${r.status === 'playing' ? `🔴 Jugando ahora (${r.players.length})` : r.players.length < 2 ? '⏳ Esperando a más jugadores…' : `🪑 ${r.players.length} dentro. ${host ? 'Cuando estéis todos, ¡empieza!' : 'Esperando a que empiece…'}`}</div>
        ${actions ? `<div class="ch-actions">${actions}</div>` : ''}</li>`;
    };
    el.innerHTML = `<ul class="challenges">${list.map(card).join('') || '<li class="empty">No hay ninguna sala abierta. ¡Abre una y que entren todos!</li>'}</ul>`;
  }

  // ---------------------------------------------------------- acciones
  async function onClick(e) {
    const b = e.target.closest('[data-fr]'); if (!b) return;
    const mine = MN.me(); if (!mine || !api) return;
    const r = rooms.find((x) => x.id === b.dataset.id); const act = b.dataset.fr;
    if (act === 'join') {
      if ((r.buyIn || 0) > (MN.balances()[mine.id] || 0)) return MN.toast(`No tienes fichas para la entrada (${r.buyIn})`, 'bad');
      return api.join(r.id, mine.id).then(() => MN.toast('🐦 ¡Dentro! Espera a que empiece', 'ok'));
    }
    if (act === 'leave') return api.leave(r.id, mine.id);
    if (act === 'close' && r.host === mine.id) return api.updateRoom(r.id, { status: 'cancelled' });
    if (act === 'start' && r.host === mine.id && r.players.length >= 2) return api.updateRoom(r.id, { status: 'playing', startAt: Date.now() + 4000 });
    if (act === 'play') return playRoom(r);
  }

  async function createRoom(e) {
    e.preventDefault();
    const mine = MN.me(); if (!mine || !api) return;
    if (rooms.some((r) => r.players.includes(mine.id))) return MN.toast('Ya estás en una sala', 'bad');
    const buyIn = Math.max(0, parseInt(MN.$('#fr-buyin').value, 10) || 0);
    if (buyIn > (MN.balances()[mine.id] || 0)) return MN.toast('No tienes tantas fichas', 'bad');
    const msg = MN.$('#fr-msg').value.trim().slice(0, 80);
    const id = 'fr_' + Store.uid();
    await api.setRoom({ id, host: mine.id, buyIn, msg: msg || null, seed: id, status: 'lobby', players: [mine.id], createdAt: Date.now() });
    MN.$('#fr-msg').value = '';
    MN.toast('🐦 Sala abierta. Avisamos a todos', 'ok');
  }

  // ---------------------------------------------------------- la partida
  let playingRoom = null;
  async function playRoom(room) {
    if (playingRoom === room.id) return;
    const F = MN.flappy; const mine = MN.me(); if (!F || !mine) return;
    playingRoom = room.id;
    const { FL } = F; const world = F.flappyWorld(room.seed);
    const others = room.players.filter((id) => id !== mine.id);
    const me = F.bird(); const flaps = [];
    const drawMe = F.faceDrawer(mine);
    const opp = {}; others.forEach((id) => { opp[id] = { b: F.bird(), n: 0, simStep: 0, draw: F.faceDrawer(MN.player(id)), live: null }; });
    let live = {};
    const unLive = api.watchLive(room.id, (o) => {
      live = o;
      Object.entries(o).forEach(([id, d]) => {
        const s = opp[id]; if (!s || !d.flaps) return;
        if (d.flaps.length !== s.n) {
          // Llegan toques nuevos: si alguno es anterior a lo ya simulado, se vuelve a simular desde el principio
          const late = d.flaps.slice(s.n).some((st) => st < s.simStep);
          s.n = d.flaps.length; s.b.flaps = new Set(d.flaps);
          if (late) { const keep = s.b.flaps; s.b = F.bird(); s.b.flaps = keep; s.simStep = 0; s.resim = true; }
        }
        s.live = d;
      });
    });

    F.open();
    const body = F.frame('🐦 Sala de Flappy', `<div class="fl-wrap"><canvas id="fl" width="${FL.W}" height="${FL.H}"></canvas>
      <div class="fl-hud" id="fl-hud">0</div><div class="fl-tip" id="fl-tip"></div><div class="fr-alive" id="fr-alive"></div></div>`);
    const cv = body.querySelector('#fl'); const ctx = cv.getContext('2d');
    const tip = body.querySelector('#fl-tip');
    let step = 0; let offset = 0; let queued = false; let lastSend = 0;
    const flap = (ev) => { if (ev) ev.preventDefault(); if (me.alive && Date.now() >= room.startAt) queued = true; };
    cv.addEventListener('pointerdown', flap);
    const onKey = (ev) => { if (ev.code === 'Space') flap(ev); };
    document.addEventListener('keydown', onKey);
    const send = (extra = {}) => api.setLive(room.id, mine.id, Object.assign({ flaps: flaps.slice(), at: Date.now() }, extra)).catch(() => {});
    send({ dead: false });

    const simOther = (s, upTo) => {
      // Como mucho, simula hasta el paso actual (o hasta su muerte)
      let n = 0;
      while (s.simStep < upTo && s.b.alive && n < 5000) { stepBird(s.b, s.simStep); s.simStep++; n++; }
    };
    const offsets = [0]; // desplazamiento del mundo en cada paso (para resimular a los demás)
    function stepBird(b, st) { while (offsets.length <= st + 1) offsets.push(offsets[offsets.length - 1] + world.speed(offsets.length - 1)); F.stepBird(b, world, st, offsets[st], false); }

    const isOver = (id) => {
      const s = opp[id]; const d = s.live;
      if (d && d.dead) return true;
      if (!d && Date.now() > room.startAt + 10000) return true;          // ni llegó a entrar
      if (d && Date.now() - (d.at || 0) > 15000 && !s.b.alive) return true; // se desconectó y ya se cayó
      return false;
    };
    const draw = () => {
      const g = ctx.createLinearGradient(0, 0, 0, FL.H); g.addColorStop(0, '#0f3b2a'); g.addColorStop(1, '#06140e');
      ctx.fillStyle = g; ctx.fillRect(0, 0, FL.W, FL.H);
      const lead = Math.max(me.score, ...Object.values(opp).map((s) => s.b.score));
      for (let i = Math.max(0, Math.min(me.score, lead) - 2); i < lead + 4; i++) {
        const p = world.pipe(i); const x = p.x - offset; if (x > FL.W) break; if (x + FL.PW < -10) continue;
        ctx.fillStyle = '#c8961c'; ctx.fillRect(x, 0, FL.PW, p.top); ctx.fillRect(x, p.top + p.gap, FL.PW, FL.H - p.top - p.gap);
        ctx.fillStyle = '#f5c542'; ctx.fillRect(x - 3, p.top - 14, FL.PW + 6, 14); ctx.fillRect(x - 3, p.top + p.gap, FL.PW + 6, 14);
      }
      ctx.fillStyle = '#3a2a10'; ctx.fillRect(0, FL.H - 30, FL.W, 30);
      Object.entries(opp).forEach(([id, s]) => {
        s.draw(ctx, FL.BX, s.b.y, s.b.alive ? 0.6 : 0.18);
        ctx.save(); ctx.globalAlpha = s.b.alive ? 0.9 : 0.3; ctx.font = 'bold 11px Inter, sans-serif'; ctx.fillStyle = '#fff'; ctx.textAlign = 'left';
        ctx.fillText(`${MN.player(id).name}${s.b.alive ? '' : ' 💀'}`, FL.BX + FL.R + 6, s.b.y + 4); ctx.restore();
      });
      drawMe(ctx, FL.BX, me.y, me.alive ? 1 : 0.3);
    };

    // Cuenta atrás hasta la hora de salida (la misma para todos)
    await new Promise((res) => {
      const cd = () => { const ms = room.startAt - Date.now(); tip.textContent = ms > 0 ? `Empieza en ${Math.ceil(ms / 1000)}…` : '¡YA!'; draw(); if (ms > 0) requestAnimationFrame(cd); else res(); };
      cd();
    });
    if (MN.fx) MN.fx.play('event');
    setTimeout(() => { tip.hidden = true; }, 600);

    await new Promise((res) => {
      let last = performance.now(); let acc = 0;
      const loop = (t) => {
        acc += Math.min(100, t - last); last = t;
        const anyAlive = () => me.alive || others.some((id) => !isOver(id) && opp[id].b.alive);
        while (acc >= 1000 / 60) {
          acc -= 1000 / 60;
          if (!anyAlive()) break;
          while (offsets.length <= step + 1) offsets.push(offsets[offsets.length - 1] + world.speed(offsets.length - 1));
          if (me.alive) { if (queued) flaps.push(step); F.stepBird(me, world, step, offsets[step], queued); queued = false; if (!me.alive) { send({ dead: true, score: me.score, steps: step }); if (MN.fx) MN.fx.play('stop'); } }
          offset = offsets[step + 1]; step++;
          // Los rivales se dibujan medio segundo por detrás: así sus toques ya han llegado y no dan saltos
          others.forEach((id) => simOther(opp[id], Math.max(0, step - LAG)));
        }
        if (me.alive && Date.now() - lastSend > 250) { lastSend = Date.now(); send(); }
        body.querySelector('#fl-hud').textContent = me.score;
        const vivos = (me.alive ? 1 : 0) + others.filter((id) => !isOver(id) && opp[id].b.alive).length;
        body.querySelector('#fr-alive').textContent = `${vivos} en vuelo${me.alive ? '' : ' · estás mirando 👀'}`;
        draw();
        if (anyAlive()) requestAnimationFrame(loop); else res();
      };
      requestAnimationFrame(loop);
    });
    document.removeEventListener('keydown', onKey);
    if (me.alive) send({ dead: true, score: me.score, steps: step });

    // Clasificación (lo que cada uno informó de su propia partida manda sobre la simulación)
    await sleep(1200);
    const scoreOf = (id) => {
      if (id === mine.id) return { score: me.score, steps: me.deadAt || step };
      const d = live[id] || {}; const s = opp[id];
      return d.dead && d.score != null ? { score: d.score, steps: d.steps || 0 } : { score: s.b.score, steps: s.b.deadAt || 0 };
    };
    const ranking = room.players.map((id) => Object.assign({ id }, scoreOf(id))).sort((a, b) => b.score - a.score || b.steps - a.steps);
    unLive();
    await finish(room, ranking);
    const esc = MN.esc; const medal = (i) => (i < 3 ? MN.MEDALS[i] : `${i + 1}.`);
    const res = F.frame('🐦 Sala de Flappy', `<div class="ag-score">${ranking[0].id === mine.id ? '🏆 ¡Has ganado!' : `Gana ${esc(MN.player(ranking[0].id).name)}`}</div>
      <ol class="fr-rank">${ranking.map((x, i) => `<li class="${x.id === mine.id ? 'me' : ''}"><span>${medal(i)}</span><span>${MN.face(MN.player(x.id), 'mini')} ${esc(MN.player(x.id).name)}</span><b>${x.score}</b></li>`).join('')}</ol>
      ${room.buyIn ? `<p class="center">${ranking[0].id === mine.id ? `Te llevas el bote: <b>${room.buyIn * room.players.length}</b> fichas` : `Pierdes la entrada (${room.buyIn})`}</p>` : ''}
      <button type="button" class="btn primary" data-ag="ok">Cerrar</button>`);
    if (MN.fx && ranking[0].id === mine.id) { MN.fx.play('win'); MN.fx.confetti({ count: 200 }); }
    await F.waitClick(res, '[data-ag]');
    F.close(); playingRoom = null;
  }

  // Cierra la sala y reparte el bote (id fijo: si lo hacen varios móviles a la vez, no se duplica)
  async function finish(room, ranking) {
    if (room.buyIn) {
      const bal = MN.balances(); const payouts = {}; let pot = 0;
      room.players.forEach((id) => { const paid = Math.min(room.buyIn, Math.max(0, bal[id] || 0)); if (paid) { payouts[id] = -paid; pot += paid; } });
      payouts[ranking[0].id] = (payouts[ranking[0].id] || 0) + pot;
      if (!MN.S.txs.some((t) => t.id === 'flroom_' + room.id)) {
        await Store.put('txs', { id: 'flroom_' + room.id, type: 'payout', kind: 'flappyroom', ts: Date.now(), roomId: room.id, winner: ranking[0].id, pot, score: ranking[0].score, players: room.players.length, payouts }).catch(() => {});
      }
    }
    await api.updateRoom(room.id, { status: 'done', result: ranking.map((x) => ({ id: x.id, score: x.score })) }).catch(() => {});
  }

  // ---------------------------------------------------------- avisos y arranque automático
  let known = null;
  function onRooms(list) {
    const mine = MN.me();
    if (known && mine) {
      list.filter((r) => !known.has(r.id) && r.status === 'lobby' && r.host !== mine.id)
        .forEach((r) => MN.notify(`🐦 ${MN.esc(MN.player(r.host).name)} abre una sala de Flappy${r.buyIn ? ` (entrada ${r.buyIn})` : ''}. ¡Entra a jugar!`));
    }
    known = new Set(list.map((r) => r.id));
    rooms = list;
    // Si mi sala empieza, se abre la partida sola
    const go = mine && list.find((r) => r.status === 'playing' && r.players.includes(mine.id) && r.startAt && Date.now() - r.startAt < 60000);
    if (go && playingRoom !== go.id) playRoom(go);
    render();
  }

  return {
    init(a) {
      MN = a;
      MN.registerTx('flappyroom', { line: (t) => ({ icon: '🐦', text: `${MN.who(t.winner)} gana la sala de Flappy (${t.score} tubos) y se lleva <b>${t.pot}</b> fichas`, sub: `${t.players} jugadores` }) });
      document.addEventListener('click', onClick);
      const f = MN.$('#fr-form'); if (f) f.addEventListener('submit', createRoom);
    },
    onState() {
      if (!api && Store.mode) { api = makeApi(); unRooms = api.watchRooms(onRooms); }
    },
    render,
  };
})());
