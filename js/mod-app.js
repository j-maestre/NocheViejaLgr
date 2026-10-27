// ============================================================
//  MÓDULO: APP INSTALABLE Y NOTIFICACIONES
//  - Registra el service worker (sw.js).
//  - Android: botón "Instalar app" (evento beforeinstallprompt).
//  - iPhone: instrucciones para "Añadir a pantalla de inicio" (Apple
//    solo permite notificaciones a webs instaladas así).
//  - Notificaciones: cuando la web está en segundo plano, los avisos
//    salen como notificación del sistema. Las push con el móvil
//    bloqueado llegarán cuando se configure Firebase (ver README).
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

  async function showSystemNotification(body) {
    if (permission() !== 'granted') return;
    const opts = { body, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', vibrate: [120, 60, 120], tag: 'mn-' + Date.now() };
    try {
      const reg = swReg || (await navigator.serviceWorker.ready);
      await reg.showNotification('Mercado Negro', opts);
    } catch (e) {
      try { new Notification('Mercado Negro', opts); } catch (err) { /* nada */ }
    }
  }

  function render() {
    const el = MN.$('#app-card'); if (!el) return;
    const perm = permission();
    let notifyHtml;
    if (perm === 'granted') notifyHtml = '<p>🔔 <b>Notificaciones activadas.</b> Te avisaremos de retos, resultados y eventos.</p>';
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
    el.innerHTML = `<h3>📱 App y notificaciones</h3>${installHtml}${notifyHtml}`;
  }

  return {
    init(api) {
      MN = api;
      if ('serviceWorker' in navigator && location.protocol !== 'file:') {
        navigator.serviceWorker.register('sw.js').then((r) => { swReg = r; }).catch((e) => console.warn('SW', e));
      }
      window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installPrompt = e; render(); });
      window.addEventListener('appinstalled', () => { installPrompt = null; MN.toast('📲 App instalada', 'ok'); render(); });
      document.addEventListener('click', async (e) => {
        if (e.target.closest('#notify-btn')) {
          const res = await Notification.requestPermission();
          if (res === 'granted') { MN.toast('🔔 Notificaciones activadas', 'ok'); showSystemNotification('¡Así te avisaremos cuando alguien te rete! ⚔️'); }
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
    // Los avisos salen como notificación del sistema si la web no está a la vista
    onNotify(list) {
      if (document.visibilityState === 'hidden') list.forEach((m) => showSystemNotification(m.replace(/<[^>]+>/g, '')));
    },
  };
})());
