// ============================================================
//  MÓDULO: MERCADO NEGRO DE VENTAJAS
//  🛡️ Inmunidad   — X horas sin que nadie te rete (ni tú retas a nadie)
//  🎯 Reto obligatorio — tu próximo reto no se puede rechazar
//  🪂 Seguro       — si pierdes tu siguiente duelo, recuperas la mitad
//  Cada compra es un movimiento `charge` (kind `market`).
// ============================================================
(window.MNModules = window.MNModules || []).push((function () {
  'use strict';
  let MN;
  const ITEMS = {
    immunity: { icon: '🛡️', name: 'Inmunidad', desc: (s) => `Durante ${s.immunityHours} horas nadie te puede retar… pero tú tampoco puedes retar a nadie.` },
    forced: { icon: '🎯', name: 'Reto obligatorio', desc: () => 'Tu próximo reto no se puede rechazar: empieza directamente aceptado.' },
    insurance: { icon: '🪂', name: 'Seguro', desc: () => 'Si pierdes tu siguiente duelo, la Banca te devuelve la mitad de lo perdido.' },
  };
  const price = (k) => Number((MN.S.settings.marketPrices || {})[k]) || 0;
  const purchases = (id, item) => MN.S.txs.filter((t) => t.kind === 'market' && !t.voided && t.player === id && (!item || t.item === item));

  // ---------------------------------------------------------- estado de cada artículo
  function immuneUntil(id) {
    const h = (Number(MN.S.settings.immunityHours) || 6) * MN.HOUR;
    return purchases(id, 'immunity').reduce((m, t) => Math.max(m, t.ts + h), 0);
  }
  const isImmune = (id) => immuneUntil(id) > Date.now();
  const forcedLeft = (id) => purchases(id, 'forced').filter((t) => !t.usedAt);
  // Seguro: se activa con la primera derrota posterior a la compra
  function insuranceClaims() {
    const out = [];
    MN.S.txs.filter((t) => t.kind === 'market' && t.item === 'insurance' && !t.voided).forEach((p) => {
      const loss = MN.S.txs.find((d) => d.type === 'duel' && !d.voided && d.loser === p.player && d.ts > p.ts);
      if (loss) out.push({ purchase: p, loss, amount: Math.floor(loss.amount / 2) });
    });
    return out;
  }
  const activeInsurance = (id) => purchases(id, 'insurance').filter((p) => !insuranceClaims().some((c) => c.purchase.id === p.id));

  async function sweep() {
    const byId = {}; MN.S.txs.forEach((t) => { byId[t.id] = t; });
    const due = insuranceClaims(); const dueIds = new Set();
    const writes = [];
    due.forEach((c) => {
      const id = 'ins_' + c.purchase.id; dueIds.add(id);
      const cur = byId[id];
      if (!cur && c.amount > 0) writes.push({ id, type: 'bonus', kind: 'insurance', ts: c.loss.ts + 4, player: c.purchase.player, amount: c.amount, srcId: c.loss.id });
      else if (cur && (cur.srcId !== c.loss.id || cur.amount !== c.amount || cur.voided)) writes.push(Object.assign({}, cur, { srcId: c.loss.id, amount: c.amount, ts: c.loss.ts + 4, voided: false }));
    });
    MN.S.txs.filter((t) => t.kind === 'insurance' && !t.voided && !dueIds.has(t.id)).forEach((t) => writes.push(Object.assign({}, t, { voided: true })));
    if (writes.length) await Store.putMany({ txs: writes });
  }

  // ---------------------------------------------------------- render
  function render() {
    const el = MN.$('#market'); if (!el) return;
    const mine = MN.me(); if (!mine) { el.innerHTML = ''; return; }
    const s = MN.S.settings; const bal = MN.balances()[mine.id] || 0;
    const status = {
      immunity: isImmune(mine.id) ? `🟢 Activa hasta las ${new Date(immuneUntil(mine.id)).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}` : '',
      forced: forcedLeft(mine.id).length ? `🟢 Tienes ${forcedLeft(mine.id).length}` : '',
      insurance: activeInsurance(mine.id).length ? `🟢 Asegurado (${activeInsurance(mine.id).length})` : '',
    };
    el.innerHTML = Object.entries(ITEMS).map(([k, it]) => {
      const p = price(k);
      const can = !MN.ended() && MN.started() && bal >= p && !(k === 'immunity' && isImmune(mine.id));
      return `<li class="market-item">
        <div class="market-icon">${it.icon}</div>
        <div class="market-body"><b>${it.name}</b> <span class="market-price">${p} fichas</span>
          <div class="muted small">${MN.esc(it.desc(s))}</div>
          ${status[k] ? `<div class="small market-status">${status[k]}</div>` : ''}</div>
        <button type="button" class="btn ${can ? 'primary' : 'ghost'}" data-buy="${k}" ${can ? '' : 'disabled'}>Comprar</button>
      </li>`;
    }).join('') + (!MN.started() ? '<p class="hint">El mercado abre cuando empiece la partida.</p>' : '');

    // Opción en el formulario de retos
    const opt = MN.$('#c-forced-wrap');
    if (opt) {
      const n = forcedLeft(mine.id).length;
      opt.hidden = !n;
      MN.$('#c-forced-label').textContent = `Usar 🎯 Reto obligatorio (te quedan ${n}): no podrá rechazarlo`;
      if (!n) MN.$('#c-forced').checked = false;
    }
  }

  return {
    init(api) {
      MN = api;
      MN.registerTx('market', { line: (t) => ({ icon: ITEMS[t.item].icon, text: `${MN.who(t.player)} compra <b>${ITEMS[t.item].name}</b> en el mercado negro`, sub: `${t.amount} fichas` + (t.usedAt ? ' · usado' : '') }) });
      MN.registerTx('insurance', { line: (t) => ({ icon: '🪂', text: `El seguro le devuelve <b>${t.amount}</b> fichas a ${MN.who(t.player)}`, sub: 'Paga la Banca' }) });
      document.addEventListener('click', async (e) => {
        const b = e.target.closest('[data-buy]'); if (!b) return;
        const mine = MN.me(); if (!mine) return;
        const k = b.dataset.buy; const it = ITEMS[k]; const p = price(k);
        if ((MN.balances()[mine.id] || 0) < p) return MN.toast('No te llega', 'bad');
        if (k === 'insurance' && activeInsurance(mine.id).length) return MN.toast('Ya tienes un seguro activo', 'bad');
        if (k === 'immunity' && MN.activeChallenges().some((c) => (c.from === mine.id || c.to === mine.id) && c.status !== 'pending')) {
          return MN.toast('Termina antes los duelos que tienes en juego', 'bad');
        }
        const ok = await MN.modal(`<div class="modal-icon">${it.icon}</div><p class="modal-text">¿Comprar <b>${it.name}</b> por <b>${p}</b> fichas?</p>
          <p class="hint center">${MN.esc(it.desc(MN.S.settings))}</p>`, 'Comprar');
        if (!ok) return;
        MN.act(() => Store.addTx({ id: 'mk_' + Store.uid(), type: 'charge', kind: 'market', item: k, ts: Date.now(), player: mine.id, amount: p }), `${it.icon} ${it.name} comprado`);
      });
    },
    render,
    sweep,
    // Inmunidad: nadie te reta y tú no retas
    challengeBlock(from, to) {
      if (isImmune(to)) return `🛡️ ${MN.esc(MN.player(to).name)} tiene inmunidad hasta las ${new Date(immuneUntil(to)).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}.`;
      if (isImmune(from)) return '🛡️ Tienes inmunidad: mientras dure, tampoco puedes retar.';
      return null;
    },
    // Reto obligatorio: se acepta solo y se gasta el artículo
    async beforeChallenge(doc) {
      if (!MN.$('#c-forced') || !MN.$('#c-forced').checked) return;
      const item = forcedLeft(doc.from)[0]; if (!item) return;
      Object.assign(doc, { status: 'accepted', acceptedAt: doc.createdAt, forced: true, tag: 'OBLIGATORIO' });
      await Store.updateTx(item.id, { usedAt: Date.now(), challengeId: doc.id });
      MN.$('#c-forced').checked = false;
    },
    rankExtra(id) { return isImmune(id) ? '<span class="bounty-tag immune-tag" title="Inmune: no se le puede retar">🛡️</span>' : ''; },
    rules(section) {
      const s = MN.S.settings;
      return section('🛒', 'Mercado negro', `
        <p>En tu <b>perfil</b> puedes comprar ventajas con fichas:</p>
        <ul>${Object.entries(ITEMS).map(([k, it]) => `<li><b>${it.icon} ${it.name}</b> (${price(k)} fichas): ${MN.esc(it.desc(s))}</li>`).join('')}</ul>`);
    },
  };
})());
