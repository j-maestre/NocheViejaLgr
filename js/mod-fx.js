// ============================================================
//  MÓDULO: CONFETI Y SONIDO
//  Confeti + "caja registradora" cuando ganas algo; "wah-wah" cuando
//  pierdes un duelo. Los sonidos se sintetizan con Web Audio (sin
//  archivos). Se pueden silenciar desde el perfil.
//  Otros módulos pueden usar MN.fx.confetti() y MN.fx.play('win').
// ============================================================
(window.MNModules = window.MNModules || []).push((function () {
  'use strict';
  let MN;
  let ctx = null;
  const WIN_KINDS = ['table', 'lottery', 'stopwatch', 'bets', 'bounty', 'communist'];

  const soundOn = () => { try { return localStorage.getItem('mn_sound') !== '0'; } catch (e) { return true; } };
  const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---------------------------------------------------------- sonido
  function audio() {
    if (!ctx) { const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null; ctx = new AC(); }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }
  function tone(freq, start, dur, type = 'triangle', vol = 0.18, slideTo = null) {
    const a = audio(); if (!a) return;
    const o = a.createOscillator(); const g = a.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, a.currentTime + start);
    if (slideTo) o.frequency.linearRampToValueAtTime(slideTo, a.currentTime + start + dur);
    g.gain.setValueAtTime(0.0001, a.currentTime + start);
    g.gain.exponentialRampToValueAtTime(vol, a.currentTime + start + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + start + dur);
    o.connect(g).connect(a.destination);
    o.start(a.currentTime + start); o.stop(a.currentTime + start + dur + 0.05);
  }
  function play(kind) {
    if (!soundOn()) return;
    try {
      if (kind === 'win') { [988, 1319, 1568, 2093].forEach((f, i) => tone(f, i * 0.07, 0.25, 'square', 0.08)); tone(2637, 0.3, 0.5, 'triangle', 0.12); }
      if (kind === 'lose') { [392, 370, 349].forEach((f, i) => tone(f, i * 0.32, 0.3, 'sawtooth', 0.07)); tone(330, 0.96, 0.9, 'sawtooth', 0.07, 300); }
      if (kind === 'tick') tone(1400, 0, 0.04, 'square', 0.05);
      if (kind === 'stop') tone(220, 0, 0.12, 'square', 0.1, 140);
      if (kind === 'drum') { for (let i = 0; i < 14; i++) tone(90 + (i % 2) * 20, i * 0.06, 0.06, 'triangle', 0.12); }
      if (kind === 'event') { [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.12, 0.3, 'triangle', 0.12)); }
    } catch (e) { /* sin audio */ }
  }

  // ---------------------------------------------------------- confeti
  function confetti(opts = {}) {
    if (reduced()) return;
    const cv = document.createElement('canvas');
    cv.className = 'confetti';
    document.body.appendChild(cv);
    const dpr = window.devicePixelRatio || 1;
    const W = window.innerWidth; const H = window.innerHeight;
    cv.width = W * dpr; cv.height = H * dpr;
    const c = cv.getContext('2d'); c.scale(dpr, dpr);
    const colors = opts.colors || ['#f5c542', '#39ff88', '#ff4d6d', '#5cc8ff', '#ffffff', '#ffb347'];
    const n = opts.count || 160;
    const parts = Array.from({ length: n }, () => ({
      x: W / 2 + (Math.random() - 0.5) * W * 0.3, y: H * 0.35,
      vx: (Math.random() - 0.5) * 14, vy: -Math.random() * 14 - 4,
      w: 6 + Math.random() * 6, h: 8 + Math.random() * 8,
      r: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.3,
      color: colors[Math.floor(Math.random() * colors.length)],
    }));
    const t0 = performance.now(); const dur = opts.duration || 2600;
    const frame = (t) => {
      const k = (t - t0) / dur;
      c.clearRect(0, 0, W, H);
      parts.forEach((p) => {
        p.vy += 0.35; p.vx *= 0.99; p.x += p.vx; p.y += p.vy; p.r += p.vr;
        c.save(); c.globalAlpha = Math.max(0, 1 - k); c.translate(p.x, p.y); c.rotate(p.r);
        c.fillStyle = p.color; c.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * Math.abs(Math.cos(p.r * 2)));
        c.restore();
      });
      if (k < 1) requestAnimationFrame(frame); else cv.remove();
    };
    requestAnimationFrame(frame);
    setTimeout(() => cv.remove(), dur + 500);
  }

  // ---------------------------------------------------------- detectar mis premios
  let seen = null;
  function onState() {
    const mine = MN.me();
    const ids = new Set(MN.S.txs.map((t) => t.id));
    if (seen && mine) {
      let win = false; let lose = false;
      MN.S.txs.forEach((t) => {
        if (seen.has(t.id) || t.voided) return;
        const d = MN.effects(t).filter(([id]) => id === mine.id).reduce((a, [, v]) => a + v, 0);
        if (t.type === 'duel') { if (t.winner === mine.id) win = true; if (t.loser === mine.id) lose = true; }
        else if (WIN_KINDS.includes(t.kind) && d > 0) win = true;
      });
      if (win) { confetti(); play('win'); } else if (lose) play('lose');
    }
    seen = ids;
  }

  function render() {
    const el = MN.$('#sound-toggle'); if (!el) return;
    el.checked = soundOn();
  }

  return {
    init(api) {
      MN = api;
      MN.fx = { confetti, play };
      document.addEventListener('change', (e) => {
        if (e.target.id !== 'sound-toggle') return;
        try { localStorage.setItem('mn_sound', e.target.checked ? '1' : '0'); } catch (err) { /* nada */ }
        if (e.target.checked) play('win');
      });
    },
    onState,
    render,
  };
})());
