// ============================================================
//  MÓDULO: TUTORIAL DE BIENVENIDA
//  Portada → registro (nombre, foto o emoji) → diapositivas que
//  explican el juego con las cifras reales de las reglas.
//  Sale una vez por móvil y se puede repetir desde el perfil.
// ============================================================
(window.MNModules = window.MNModules || []).push((function () {
  'use strict';
  let MN;
  let i = 0;
  const done = () => { try { return localStorage.getItem('mn_tutorial') === '1'; } catch (e) { return true; } };
  const markDone = () => { try { localStorage.setItem('mn_tutorial', '1'); } catch (e) { /* nada */ } };

  function slides() {
    const s = MN.S.settings; const me = MN.me();
    const sched = (s.limitSchedule || []).map((x) => `${x.pct}%`).join(' → ');
    const date = (v) => new Date(v).toLocaleString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
    return [
      { art: me ? MN.face(me, 'tut-face') : '🎰', title: `¡Hola${me ? ', ' + MN.esc(me.name) : ''}!`,
        body: `Te has sentado en el <b>Mercado Negro</b>, el casino clandestino de Nochevieja. Te explicamos cómo va en un minuto.` },
      { art: '🪙', title: 'Las fichas',
        body: `Todos empezáis con <b>${s.startChips} fichas</b>. La mesa abre el <b>${MN.esc(date(s.startDate))}</b> y cierra el <b>${MN.esc(date(s.endDate))}</b>.<br><br>Quien tenga <b>más fichas al cierre gana el premio</b>.` },
      { art: '⚔️', title: 'Los retos',
        body: `Desde <b>⚔️ Duelo</b> retas a alguien a un minijuego y os jugáis fichas.<ol class="tut-steps"><li>Le envías el reto.</li><li>Lo acepta (si lo rechaza, paga <b>${s.cowardFine} fichas</b> de multa 🐔).</li><li>Jugáis en la vida real.</li><li>Uno registra quién ganó y el otro lo confirma.</li></ol>Al acabar gira la <b>🎰 tragaperras</b>: puede tocar premio… o comisión.` },
      { art: '💰', title: 'El límite de apuesta',
        body: `Lo máximo que se puede apostar es un <b>% del capital del más pobre</b> de los dos, y va subiendo: <b>${MN.esc(sched)}</b>.<br><br>Así nadie se arruina de un golpe… hasta el final. Si te quedas sin fichas, la <b>🏦 Banca</b> te presta a cambio de un castigo.` },
      { art: '🃏', title: 'Mesas y apuestas',
        body: `<b>🃏 Mesas</b>: para póker, Dixit o partidas por equipos. Cada uno pone la entrada y el ganador se lleva el bote.<br><br><b>🎰 Apuestas</b>: cuando empieza un duelo ajeno tienes ${s.betWindowMinutes} minutos para apostar por quién gana.` },
      { art: '📅', title: 'Los eventos',
        body: `Durante la partida hay eventos (en <b>📅 Eventos</b> y en la portada):<ul class="tut-list"><li>☭ <b>Comunista</b>: se expropia al primero.</li><li>🍻 <b>Happy hour</b>: los duelos pagan doble.</li><li>🎟️ <b>Lotería</b>: compra boletos.</li><li>⏱️ <b>Cronómetro</b>: para el reloj en ${s.stopwatchTarget},00 s.</li><li>🦅 <b>Fascista</b>: votación secreta (y comprable) para elegir al Dictador.</li></ul>Te avisamos 15 minutos antes.` },
      { art: '🛒', title: 'Ventajas y piques',
        body: `En tu <b>perfil</b> (tu foto, arriba a la derecha) está el <b>🛒 mercado negro</b>: inmunidad, retos obligatorios y seguros.<br><br>Gana 3 seguidos y te sale el <b>🔥</b>. Con ${s.bountyMinStreak}, tu cabeza tiene precio (<b>🎯 cazarrecompensas</b>: quien te gane cobra ${s.bountyPerWin} fichas por victoria de tu racha, de la Banca). Y si pierdes, tienes <b>🔁 revancha</b>.` },
      { art: '📲', title: 'Último paso',
        body: `<b>Instala la app</b> y <b>activa las notificaciones</b> desde tu perfil para enterarte cuando te reten.<br><br>Las normas completas están siempre en <b>📖 Normas</b>. Y recuerda: <b>la Banca siempre gana</b>.`, last: true },
    ];
  }

  function show(from = 0) {
    i = from;
    const box = MN.$('#tutorial'); box.hidden = false; document.body.classList.add('no-scroll');
    paint();
  }
  function close() {
    MN.$('#tutorial').hidden = true; document.body.classList.remove('no-scroll'); markDone();
  }
  function paint() {
    const list = slides(); const sl = list[i];
    MN.$('#tutorial').innerHTML = `<div class="tut-card">
      <div class="tut-dots">${list.map((_, k) => `<span class="${k === i ? 'on' : k < i ? 'past' : ''}"></span>`).join('')}</div>
      <button type="button" class="link tut-skip" data-tut="skip">Saltar</button>
      <div class="tut-art">${sl.art}</div>
      <div class="tut-title">${sl.title}</div>
      <div class="tut-body">${sl.body}</div>
      <div class="tut-nav">
        <button type="button" class="btn ghost" data-tut="prev" ${i ? '' : 'hidden'}>←</button>
        ${sl.last ? '<button type="button" class="btn ghost" data-tut="profile">📲 Ir a mi perfil</button><button type="button" class="btn primary" data-tut="skip">¡A jugar!</button>'
          : '<button type="button" class="btn primary" data-tut="next">Siguiente →</button>'}
      </div></div>`;
  }

  return {
    init(api) {
      MN = api;
      document.addEventListener('click', (e) => {
        if (e.target.closest('#w-start')) { MN.$('#w-intro').hidden = true; MN.$('#w-register').hidden = false; MN.$('#r-name').focus(); return; }
        if (e.target.closest('[data-tutorial-open]')) { show(0); return; }
        const b = e.target.closest('[data-tut]'); if (!b) return;
        const a = b.dataset.tut;
        if (a === 'next') { i++; paint(); }
        if (a === 'prev') { i = Math.max(0, i - 1); paint(); }
        if (a === 'skip') close();
        if (a === 'profile') { close(); MN.go('perfil'); }
      });
      // Deslizar con el dedo también pasa de diapositiva
      let x0 = null;
      MN.$('#tutorial').addEventListener('touchstart', (e) => { x0 = e.touches[0].clientX; }, { passive: true });
      MN.$('#tutorial').addEventListener('touchend', (e) => {
        if (x0 === null) return;
        const dx = e.changedTouches[0].clientX - x0; x0 = null;
        if (Math.abs(dx) < 50) return;
        const n = slides().length;
        if (dx < 0 && i < n - 1) { i++; paint(); } else if (dx > 0 && i > 0) { i--; paint(); }
      });
    },
    // La primera vez que este móvil tiene jugador, sale el tutorial
    onState() {
      if (MN.me() && !done() && MN.$('#tutorial').hidden && location.hash !== '#tv') show(0);
    },
  };
})());
