// ============================================================
//  MÓDULO: FOTO DE PERFIL
//  "📸 Hacerme una foto" abre la cámara frontal y "🖼️ Elegir de la galería"
//  deja escoger una foto que ya tengas.
//  La foto se recorta en cuadrado y se reduce a 160 px en JPEG (~10 KB),
//  y se guarda en el propio jugador (campo `photo`, data URL).
// ============================================================
(window.MNModules = window.MNModules || []).push((function () {
  'use strict';
  let MN;
  const SIZE = 160;
  let pending = null; // foto elegida en el registro, antes de que exista el jugador

  function loadImage(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('No se pudo leer la imagen')); };
      img.src = url;
    });
  }

  // Recorte cuadrado centrado a `size` px
  function square(img, size) {
    const side = Math.min(img.naturalWidth, img.naturalHeight);
    const sx = (img.naturalWidth - side) / 2; const sy = (img.naturalHeight - side) / 2;
    const c = document.createElement('canvas'); c.width = size; c.height = size;
    const ctx = c.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size);
    return c;
  }
  const shrink = (canvas) => {
    const c = document.createElement('canvas'); c.width = SIZE; c.height = SIZE;
    const ctx = c.getContext('2d'); ctx.imageSmoothingQuality = 'high'; ctx.drawImage(canvas, 0, 0, SIZE, SIZE);
    return c.toDataURL('image/jpeg', 0.8);
  };

  async function toAvatar(file) { return shrink(square(await loadImage(file), SIZE * 2)); }

  function preview(target, photo) {
    const el = MN.$(`[data-photo-preview="${target}"]`); if (!el) return;
    el.innerHTML = photo ? `<img src="${photo}" alt="Tu foto">` : '';
    el.hidden = !photo;
    const clear = MN.$(`[data-photo-clear="${target}"]`); if (clear) clear.hidden = !photo;
  }

  function render() {
    const mine = MN.me();
    if (mine) preview('profile', mine.photo || null);
    preview('register', pending);
  }

  return {
    init(api) {
      MN = api;
      try { pending = sessionStorage.getItem('mn_pending_photo'); } catch (e) { /* nada */ }
      document.addEventListener('change', async (e) => {
        const input = e.target.closest('[data-photo]'); if (!input || !input.files || !input.files[0]) return;
        const target = input.dataset.photo; const file = input.files[0]; input.value = '';
        let photo;
        try { photo = await toAvatar(file); } catch (err) { return MN.toast('❌ ' + MN.esc(err.message), 'bad'); }
        if (target === 'register') {
          pending = photo;
          try { sessionStorage.setItem('mn_pending_photo', photo); } catch (err) { /* nada */ }
          preview('register', photo);
          MN.toast('📸 ¡Foto lista! Se guardará al sentarte a la mesa', 'ok');
        } else {
          const mine = MN.me(); if (!mine) return;
          MN.act(() => Store.updatePlayer(mine.id, { photo }), '📸 Foto de perfil actualizada');
        }
      });
      document.addEventListener('click', (e) => {
        const b = e.target.closest('[data-photo-clear]'); if (!b) return;
        if (b.dataset.photoClear === 'register') {
          pending = null; try { sessionStorage.removeItem('mn_pending_photo'); } catch (err) { /* nada */ }
          preview('register', null);
        } else {
          const mine = MN.me(); if (mine) MN.act(() => Store.updatePlayer(mine.id, { photo: null }), 'Foto quitada: vuelves al emoji');
        }
      });
    },
    render,
    // Cuando el jugador recién registrado ya existe, se le pone la foto elegida
    onState() {
      const mine = MN.me();
      if (mine && pending && !mine.photo) {
        const photo = pending; pending = null;
        try { sessionStorage.removeItem('mn_pending_photo'); } catch (e) { /* nada */ }
        Store.updatePlayer(mine.id, { photo }).catch((e) => console.error(e));
      } else if (mine && pending && mine.photo) {
        pending = null; try { sessionStorage.removeItem('mn_pending_photo'); } catch (e) { /* nada */ }
      }
    },
  };
})());
