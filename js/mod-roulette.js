// ============================================================
//  MÓDULO: 🎰 RULETA DE LA BANCA
//  Ruleta europea (37 casillas, en su orden real) contra la Banca.
//  Tablero real: números sueltos (35 a 1), docenas y columnas (2 a 1),
//  rojo/negro, par/impar y 1-18/19-36 (1 a 1). Sin límite de apuesta:
//  puedes jugarte todo lo que tengas.
//  Cada tirada es una tx `payout` de tipo `roulette` con el neto del jugador.
// ============================================================
(window.MNModules = window.MNModules || []).push((function () {
  'use strict';
  let MN;
  const WHEEL = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];
  const RED = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
  const color = (n) => (n === 0 ? 'green' : RED.has(n) ? 'red' : 'black');
  const CHIPS = [1, 5, 10, 25, 100, 500];

  // Apuestas: clave → { label, pays (x a 1), wins(n) }
  const BETS = {};
  for (let n = 0; n <= 36; n++) BETS['n' + n] = { label: String(n), pays: 35, wins: (x) => x === n };
  [1, 2, 3].forEach((d) => { BETS['d' + d] = { label: `${d}.ª docena`, pays: 2, wins: (x) => x >= (d - 1) * 12 + 1 && x <= d * 12 }; });
  [1, 2, 3].forEach((c) => { BETS['c' + c] = { label: `${c}.ª columna`, pays: 2, wins: (x) => x > 0 && (x - c) % 3 === 0 }; });
  Object.assign(BETS, {
    low: { label: '1-18', pays: 1, wins: (x) => x >= 1 && x <= 18 }, high: { label: '19-36', pays: 1, wins: (x) => x >= 19 },
    even: { label: 'Par', pays: 1, wins: (x) => x > 0 && x % 2 === 0 }, odd: { label: 'Impar', pays: 1, wins: (x) => x % 2 === 1 },
    red: { label: 'Rojo', pays: 1, wins: (x) => RED.has(x) }, black: { label: 'Negro', pays: 1, wins: (x) => x > 0 && !RED.has(x) },
  });

  let bets = {}; let history = []; let lastBets = null; let chip = 5; let spinning = false;
  const total = () => Object.values(bets).reduce((a, v) => a + v, 0);
  const balance = () => { const m = MN.me(); return m ? MN.balances()[m.id] || 0 : 0; };

  // ---------------------------------------------------------- cilindro (SVG)
  function wheelSvg() {
    const R = 140; const step = 360 / 37; const rad = (a) => (a - 90) * Math.PI / 180;
    const pt = (a, r) => `${(150 + r * Math.cos(rad(a))).toFixed(2)},${(150 + r * Math.sin(rad(a))).toFixed(2)}`;
    const slices = WHEEL.map((n, i) => {
      const a0 = i * step - step / 2; const a1 = a0 + step;
      const fill = n === 0 ? '#1f8a4c' : RED.has(n) ? '#c0182f' : '#151515';
      return `<path d="M150,150 L${pt(a0, R)} A${R},${R} 0 0,1 ${pt(a1, R)} Z" fill="${fill}" stroke="#c8961c" stroke-width=".8"/>
        <text x="${pt(i * step, R - 14).split(',')[0]}" y="${pt(i * step, R - 14).split(',')[1]}" fill="#fff" font-size="11" font-weight="700" text-anchor="middle" dominant-baseline="middle" transform="rotate(${i * step} ${pt(i * step, R - 14).replace(',', ' ')})">${n}</text>`;
    }).join('');
    const spokes = Array.from({ length: 8 }, (_, k) => `<line x1="150" y1="150" x2="${pt(k * 45, 70).split(',')[0]}" y2="${pt(k * 45, 70).split(',')[1]}" stroke="#e8c65a" stroke-width="5" stroke-linecap="round"/>`).join('');
    return `<svg viewBox="0 0 300 300" class="rl-svg">
      <circle cx="150" cy="150" r="149" fill="#4a2a10" stroke="#c8961c" stroke-width="2"/>
      <g id="rl-wheel">${slices}<circle cx="150" cy="150" r="104" fill="#3a2410" stroke="#c8961c" stroke-width="2"/>
        <circle cx="150" cy="150" r="78" fill="#2a180a"/>${spokes}<circle cx="150" cy="150" r="18" fill="#e8c65a" stroke="#8a6a10" stroke-width="2"/></g>
      <circle id="rl-ball" cx="150" cy="18" r="6.5" fill="#fff" stroke="#999" stroke-width=".8"/>
      <polygon points="150,2 144,-8 156,-8" fill="#f5c542"/></svg>`;
  }

  // Animación: el cilindro gira en un sentido y la bola en el contrario, cae y se queda en la casilla
  function animate(result) {
    return new Promise((res) => {
      const wheel = MN.$('#rl-wheel'); const ball = MN.$('#rl-ball'); if (!wheel || !ball) return res();
      const step = 360 / 37; const idx = WHEEL.indexOf(result);
      const w0 = Number(wheel.dataset.a || 0); const w1 = w0 + 720 + Math.random() * 360;   // vueltas del cilindro
      const pocket = w1 + idx * step;                                                      // dónde queda la casilla
      const b1 = pocket - 360 * 4;                                                         // la bola da 4 vueltas al revés
      const b0 = b1 + 360 * 4 + 200;
      const D = 6500; const t0 = performance.now(); let lastTick = 0;
      const ease = (k) => 1 - Math.pow(1 - k, 3);
      const frame = (t) => {
        const k = Math.min(1, (t - t0) / D); const e = ease(k);
        const wa = w0 + (w1 - w0) * e; const ba = b0 + (b1 - b0) * e;
        const r = k < 0.65 ? 133 : 133 - (133 - 116) * Math.min(1, (k - 0.65) / 0.25); // cae hacia las casillas
        const bounce = k > 0.65 && k < 0.92 ? Math.sin(k * 90) * 3 * (1 - k) : 0;
        wheel.setAttribute('transform', `rotate(${wa} 150 150)`);
        const rr = (ba - 90) * Math.PI / 180;
        ball.setAttribute('cx', 150 + (r + bounce) * Math.cos(rr)); ball.setAttribute('cy', 150 + (r + bounce) * Math.sin(rr));
        if (k > 0.6 && t - lastTick > 70 + k * 220 && k < 0.95) { lastTick = t; if (MN.fx) MN.fx.play('tick'); }
        if (k < 1) requestAnimationFrame(frame); else { wheel.dataset.a = w1 % 360; res(); }
      };
      requestAnimationFrame(frame);
    });
  }

  // ---------------------------------------------------------- tablero (vertical, para el móvil)
  function boardHtml() {
    const cell = (key, html, cls = '', style = '') => `<button type="button" class="rl-cell ${cls}" data-rbet="${key}" style="${style}">${html}<span class="rl-chip" data-for="${key}"></span></button>`;
    let h = cell('n0', '0', 'green', 'grid-column:2/5;grid-row:1');
    for (let n = 1; n <= 36; n++) { const row = Math.ceil(n / 3) + 1; const col = ((n - 1) % 3) + 2; h += cell('n' + n, n, color(n), `grid-column:${col};grid-row:${row}`); }
    [1, 2, 3].forEach((d) => { h += cell('d' + d, `${d}.ª<br>12`, 'out', `grid-column:1;grid-row:${(d - 1) * 4 + 2}/span 4`); });
    const sides = [['low', '1-18'], ['even', 'PAR'], ['red', '<i class="rl-dot red"></i>'], ['black', '<i class="rl-dot black"></i>'], ['odd', 'IMPAR'], ['high', '19-36']];
    sides.forEach(([k, l], i) => { h += cell(k, l, 'out', `grid-column:5;grid-row:${i * 2 + 2}/span 2`); });
    [1, 2, 3].forEach((c) => { h += cell('c' + c, '2:1', 'out', `grid-column:${c + 1};grid-row:14`); });
    return `<div class="rl-board">${h}</div>`;
  }
  function paintBets() {
    MN.$$('.rl-chip').forEach((el) => { const v = bets[el.dataset.for] || 0; el.textContent = v || ''; el.classList.toggle('on', !!v); });
    const t = total(); const bal = balance();
    MN.$('#rl-total').innerHTML = `Apuesta: <b>${t}</b> · Tienes <b>${bal}</b>`;
    MN.$('#rl-spin').disabled = spinning || !t || t > bal;
  }

  // ---------------------------------------------------------- abrir la mesa
  function open() {
    const mine = MN.me(); if (!mine) return MN.toast('Siéntate primero a la mesa', 'bad');
    if (!MN.started() || MN.ended()) return MN.toast('La ruleta solo gira durante la partida', 'bad');
    const box = MN.$('#roulette'); box.hidden = false; document.body.classList.add('no-scroll');
    bets = {};
    box.innerHTML = `<div class="rl-inner">
      <div class="rl-top"><div class="ag-title">🎰 Ruleta de la Banca</div><button type="button" class="tv-exit" data-rl="close">✕</button></div>
      <div class="rl-wheel-wrap">${wheelSvg()}<div class="rl-result" id="rl-result"></div></div>
      <div class="rl-hist" id="rl-hist">${history.map((n) => `<span class="${color(n)}">${n}</span>`).join('')}</div>
      <div class="rl-chips">${CHIPS.map((c) => `<button type="button" class="rl-chipsel ${c === chip ? 'on' : ''}" data-chip="${c}">${c}</button>`).join('')}<button type="button" class="rl-chipsel all" data-chip="all">TODO</button></div>
      ${boardHtml()}
      <div class="rl-total" id="rl-total"></div>
      <div class="rl-actions"><button type="button" class="btn ghost" data-rl="undo">↶ Deshacer</button><button type="button" class="btn ghost" data-rl="clear">Borrar</button>
        <button type="button" class="btn ghost" data-rl="repeat" ${lastBets ? '' : 'disabled'}>🔁 Repetir</button></div>
      <button type="button" class="btn primary rl-go" id="rl-spin" data-rl="spin">🎰 ¡Girar!</button></div>`;
    paintBets();
  }
  function closeTable() { if (spinning) return; const box = MN.$('#roulette'); box.hidden = true; box.innerHTML = ''; document.body.classList.remove('no-scroll'); }

  const stack = [];
  async function spin() {
    const mine = MN.me(); const t = total();
    if (!mine || spinning || !t) return;
    if (t > balance()) return MN.toast('No tienes tantas fichas', 'bad');
    spinning = true; paintBets(); MN.$('#rl-result').innerHTML = '';
    const result = crypto.getRandomValues(new Uint32Array(1))[0] % 37;
    lastBets = Object.assign({}, bets);
    await animate(result);
    let won = 0; const winners = [];
    Object.entries(bets).forEach(([k, v]) => { if (BETS[k].wins(result)) { won += v * (BETS[k].pays + 1); winners.push(k); } });
    const net = won - t;
    MN.$('#rl-result').innerHTML = `<div class="rl-num ${color(result)}">${result}</div><div class="rl-net ${net >= 0 ? 'up' : 'down'}">${net > 0 ? `+${net}` : net === 0 ? '±0' : net}</div>`;
    MN.$$('.rl-cell').forEach((c) => c.classList.toggle('win', winners.includes(c.dataset.rbet) || c.dataset.rbet === 'n' + result));
    history = [result, ...history].slice(0, 12);
    MN.$('#rl-hist').innerHTML = history.map((n) => `<span class="${color(n)}">${n}</span>`).join('');
    if (MN.fx) { MN.fx.play(net > 0 ? 'win' : net < 0 ? 'lose' : 'tick'); if (net >= t * 5) MN.fx.confetti({ count: 220 }); }
    await MN.act(() => Store.put('txs', { id: 'rl_' + Store.uid(), type: 'payout', kind: 'roulette', ts: Date.now(), player: mine.id, result, bet: t, won, payouts: net ? { [mine.id]: net } : {} }));
    bets = {}; stack.length = 0; spinning = false;
    MN.$('[data-rl="repeat"]').disabled = false;
    paintBets();
  }

  function onClick(e) {
    if (e.target.closest('[data-roulette-open]')) return open();
    const box = MN.$('#roulette'); if (!box || box.hidden || !box.contains(e.target)) return;
    const c = e.target.closest('[data-chip]');
    if (c) { chip = c.dataset.chip === 'all' ? 'all' : Number(c.dataset.chip); MN.$$('[data-chip]').forEach((b) => b.classList.toggle('on', b === c)); return; }
    const cell = e.target.closest('[data-rbet]');
    if (cell && !spinning) {
      const free = balance() - total(); if (free <= 0) return MN.toast('No te quedan fichas para apostar', 'bad');
      const v = chip === 'all' ? free : Math.min(chip, free);
      bets[cell.dataset.rbet] = (bets[cell.dataset.rbet] || 0) + v; stack.push([cell.dataset.rbet, v]);
      MN.$$('.rl-cell.win').forEach((x) => x.classList.remove('win'));
      if (MN.fx) MN.fx.play('tick');
      return paintBets();
    }
    const a = e.target.closest('[data-rl]'); if (!a) return;
    const act = a.dataset.rl;
    if (act === 'close') return closeTable();
    if (spinning) return;
    if (act === 'undo') { const last = stack.pop(); if (last) { bets[last[0]] -= last[1]; if (bets[last[0]] <= 0) delete bets[last[0]]; } }
    if (act === 'clear') { bets = {}; stack.length = 0; }
    if (act === 'repeat' && lastBets) { if (Object.values(lastBets).reduce((x, y) => x + y, 0) > balance()) return MN.toast('No te llega para repetir la apuesta', 'bad'); bets = Object.assign({}, lastBets); }
    if (act === 'spin') return spin();
    paintBets();
  }

  return {
    init(api) {
      MN = api;
      MN.registerTx('roulette', {
        line: (t) => ({ icon: '🎰', text: `${MN.who(t.player)} ${t.won > t.bet ? `gana <b>${t.won - t.bet}</b>` : t.won === t.bet ? 'recupera lo apostado' : `pierde <b>${t.bet - t.won}</b>`} en la ruleta`, sub: `Sale el ${t.result} ${t.result === 0 ? '(verde)' : RED.has(t.result) ? '(rojo)' : '(negro)'} · apostó ${t.bet}` }),
      });
      document.addEventListener('click', onClick);
    },
    render() {
      const el = MN.$('#roulette-card'); if (!el) return;
      el.hidden = !MN.me() || !MN.started() || MN.ended();
    },
    rules(section) {
      return section('🎰', 'Ruleta de la Banca', `<ul>
        <li>Ruleta europea (0 al 36) contra la Banca, en <b>⚔️ Duelo → 🎰 Ruleta</b>. Sin límite de apuesta: hasta todo lo que tengas.</li>
        <li>Número suelto paga <b>35 a 1</b>; docena y columna, <b>2 a 1</b>; rojo/negro, par/impar, 1-18/19-36, <b>1 a 1</b>. Con el 0 pierden las apuestas sencillas.</li></ul>`);
    },
  };
})());
