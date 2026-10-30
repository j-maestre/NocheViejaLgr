// ============================================================
//  MÓDULO: APP INSTALABLE Y NOTIFICACIONES
//  - Registra el service worker (sw.js).
//  - Android: botón "Instalar app" (evento beforeinstallprompt).
//  - iPhone: instrucciones para "Añadir a pantalla de inicio" (Apple
//    solo permite notificaciones a webs instaladas así).
//  - Notificaciones: cuando la web está en segundo plano, los avisos
//    salen como notificación del sistema.
//  - Push (app cerrada o móvil bloqueado): con Firebase y `vapidKey` en
//    config.js, cada móvil guarda su token y las Cloud Functions
//    (carpeta functions/) le envían los avisos.
// ============================================================
(window.MNModules = window.MNModules || []).push((function () {
  'use strict';
  let MN;
  let swReg = null;
  let installPrompt = null;

  const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  const canNotify = () => 'Notification' in window && 'serviceWorker' in navigator;
  const permission = () => (canNotify() ? Notification.permission : 'unsupported');

  // Misma etiqueta que la push del servidor: si llegan las dos, se ve una sola
  const tagFor = (body) => 'mn-' + MN.hash(body);

  async function showSystemNotification(body) {
    if (permission() !== 'granted') return;
    const opts = { body, icon: 'icons/icon-192.png', badge: 'icons/badge-96.png', vibrate: [120, 60, 120], tag: tagFor(body) };
    try {
      const reg = swReg || (await navigator.serviceWorker.ready);
      await reg.showNotification('Mercado Negro', opts);
    } catch (e) {
      try { new Notification('Mercado Negro', opts); } catch (err) { /* nada */ }
    }
  }

  // ---------------------------------------------------------- push
  // Guarda el token de este móvil asociado al jugador para recibir push
  let pushFor = null; let pushBusy = false;
  async function registerPush() {
    const cfg = window.MN_CONFIG || {};
    const mine = MN.me();
    if (!cfg.firebase || !cfg.vapidKey || !window.firebase || !mine || permission() !== 'granted' || pushBusy || pushFor === mine.id) return;
    pushBusy = true;
    try {
      if (!firebase.messaging) await new Promise((ok, ko) => { const sc = document.createElement('script'); sc.src = 'https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js'; sc.onload = ok; sc.onerror = ko; document.head.appendChild(sc); });
      if (!(await firebase.messaging.isSupported())) return;
      const reg = swReg || (await navigator.serviceWorker.ready);
      const token = await firebase.messaging().getToken({ vapidKey: cfg.vapidKey, serviceWorkerRegistration: reg });
      if (!token) return;
      await firebase.firestore().collection('games').doc(cfg.gameId).collection('push').doc(token)
        .set({ pid: mine.id, ua: navigator.userAgent.slice(0, 120), at: Date.now() });
      pushFor = mine.id;
    } catch (e) { console.warn('push', e); } finally { pushBusy = false; }
  }

  function render() {
    const el = MN.$('#app-card'); if (!el) return;
    const perm = permission();
    let notifyHtml;
    if (perm === 'granted') {
      notifyHtml = `<p>🔔 <b>Notificaciones activadas.</b> Te avisaremos de retos, resultados y eventos${(window.MN_CONFIG || {}).vapidKey ? ', aunque tengas la app cerrada' : ''}.</p>
        <details class="notif-help"><summary>¿Solo te salen en la barra de arriba y no como WhatsApp?</summary>
        ${isIOS() ? `<ol><li>Abre <b>Ajustes → Notificaciones → Mercado Negro</b>.</li>
          <li>Activa <b>Pantalla bloqueada</b>, <b>Centro de notificaciones</b> y <b>Banners</b> (mejor en estilo <b>Persistente</b>).</li></ol>`
        : `<ol><li>Mantén pulsada una notificación de Mercado Negro y toca <b>⚙️ Ajustes</b> (o ve a <b>Ajustes → Aplicaciones → ${isStandalone() ? 'Mercado Negro' : 'Chrome'} → Notificaciones</b>).</li>
          <li>En la categoría de esta web elige <b>Alertas</b> (no "Silencio").</li>
          <li>Activa <b>Mostrar como ventana emergente</b> (o "Aparecer en pantalla" / "Notificación flotante"): así salen arriba como WhatsApp.</li>
          <li>Activa <b>Pantalla de bloqueo</b> y, si tu móvil lo tiene, <b>Luz parpadeante</b>.</li></ol>`}
        <p class="hint">Es un ajuste del móvil: ninguna web puede activarlo por ti.</p></details>`;
    }
    else if (perm === 'denied') notifyHtml = '<p>🔕 Has bloqueado las notificaciones. Actívalas en los ajustes del navegador para esta web.</p>';
    else if (perm === 'unsupported' || (isIOS() && !isStandalone())) notifyHtml = '';
    else notifyHtml = '<button type="button" class="btn primary" id="notify-btn">🔔 Activar notificaciones</button>';

    let installHtml = '';
    if (!isStandalone()) {
      if (isIOS()) {
        installHtml = `<div class="ios-steps">
          <p><b>📲 Instálala en tu iPhone</b> para recibir notificaciones (Apple solo las permite así):</p>
          <ol><li>Abre esta web en <b>Safari</b>.</li>
          <li>Toca el botón <b>Compartir</b> <span class="ios-share">⬆︎</span>.</li>
          <li>Elige <b>"Añadir a pantalla de inicio"</b>.</li>
          <li>Abre la app desde el icono y vuelve aquí para activar las notificaciones.</li></ol></div>`;
      } else if (installPrompt) {
        installHtml = '<button type="button" class="btn ghost wide" id="install-btn">📲 Instalar como app</button>';
      } else {
        installHtml = '<p class="hint">📲 Puedes instalarla desde el menú del navegador: <b>"Añadir a pantalla de inicio"</b> o <b>"Instalar app"</b>.</p>';
      }
    } else {
      installHtml = '<p>📲 <b>Estás usando la app instalada.</b></p>';
    }
    // Qué avisos quiere recibir cada uno (vale para los de dentro de la app y los de con la app cerrada)
    const mine = MN.me(); const off = (mine && mine.notif) || {};
    const prefs = mine ? `<details class="notif-prefs"><summary>⚙️ Elegir qué avisos quiero recibir</summary>
      <p class="hint">Lo que solo te afecta a ti (que la Banca te preste, etc.) llega siempre.</p>
      ${MN.NOTIF_TYPES.map(([k, icon, label, desc]) => `<label class="check-row notif-row"><input type="checkbox" data-notif="${k}" ${off[k] === false ? '' : 'checked'}>
        <span><b>${icon} ${label}</b><small>${desc}</small></span></label>`).join('')}</details>` : '';
    const wasOpen = el.querySelector('.notif-prefs') && el.querySelector('.notif-prefs').open;
    el.innerHTML = `<h3>📱 App y notificaciones</h3>${installHtml}${notifyHtml}${prefs}`;
    if (wasOpen) el.querySelector('.notif-prefs').open = true;
  }

  return {
    init(api) {
      MN = api;
      if ('serviceWorker' in navigator && location.protocol !== 'file:') {
        navigator.serviceWorker.register('sw.js').then((r) => { swReg = r; }).catch((e) => console.warn('SW', e));
      }
      window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installPrompt = e; render(); });
      window.addEventListener('appinstalled', () => { installPrompt = null; MN.toast('📲 App instalada', 'ok'); render(); });
      document.addEventListener('change', (e) => {
        const c = e.target.closest('[data-notif]'); const mine = MN.me(); if (!c || !mine) return;
        const notif = Object.assign({}, mine.notif || {}, { [c.dataset.notif]: c.checked });
        MN.act(() => Store.updatePlayer(mine.id, { notif }), c.checked ? '🔔 Activado' : '🔕 Silenciado');
      });
      document.addEventListener('click', async (e) => {
        if (e.target.closest('#notify-btn')) {
          const res = await Notification.requestPermission();
          if (res === 'granted') { MN.toast('🔔 Notificaciones activadas', 'ok'); showSystemNotification('¡Así te avisaremos cuando alguien te rete! ⚔️'); registerPush(); }
          render();
        }
        if (e.target.closest('#install-btn') && installPrompt) {
          installPrompt.prompt();
          await installPrompt.userChoice;
          installPrompt = null; render();
        }
      });
    },
    render,
    onState() { registerPush(); },
    // Los avisos salen como notificación del sistema si la web no está a la vista
    onNotify(list) {
      if (document.visibilityState === 'hidden') list.forEach((m) => showSystemNotification(m.replace(/<[^>]+>/g, '')));
    },
  };
})());
