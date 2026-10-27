// ============================================================
//  MÓDULO: FOTO DE PERFIL
//  "📸 Hacerme una foto" abre la cámara frontal del móvil (o la galería).
//  La foto se recorta en cuadrado y se reduce a 160 px en JPEG (~10 KB),
//  y se guarda en el propio jugador (campo `photo`, data URL).
//  🗿 Modo Gigachad: antes de guardar se ofrece una versión con mandíbula
//  ensanchada, blanco y negro dramático, viñeta y grano. Todo se hace en
//  el móvil; la cara se localiza con MediaPipe (si no carga, se supone
//  centrada).
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

  // ---------------------------------------------------------- 🗿 gigachad
  const MP = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14';
  const MODEL = 'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite';
  let detectorP = null;
  function detector() {
    if (!detectorP) {
      detectorP = (async () => {
        const v = await import(`${MP}/vision_bundle.mjs`);
        const files = await v.FilesetResolver.forVisionTasks(`${MP}/wasm`);
        return v.FaceDetector.createFromOptions(files, { baseOptions: { modelAssetPath: MODEL }, runningMode: 'IMAGE' });
      })().catch((e) => { console.warn('FaceDetector', e); detectorP = null; return null; });
    }
    return detectorP;
  }

  // Cara en coordenadas del lienzo: { cx, eyeY, mouthY, w, h }. Sin detector, centrada.
  async function findFace(canvas) {
    const N = canvas.width;
    const guess = { cx: N / 2, eyeY: N * 0.42, mouthY: N * 0.66, w: N * 0.5 };
    try {
      const det = await Promise.race([detector(), new Promise((r) => setTimeout(() => r(null), 8000))]);
      if (!det) return guess;
      const res = det.detect(canvas);
      const f = res.detections && res.detections.sort((a, b) => b.boundingBox.width - a.boundingBox.width)[0];
      if (!f) return guess;
      const bb = f.boundingBox; const k = f.keypoints || [];
      // Puntos: 0 ojo dcho, 1 ojo izq, 2 nariz, 3 boca (normalizados)
      const eyeY = k[0] && k[1] ? ((k[0].y + k[1].y) / 2) * N : bb.originY + bb.height * 0.38;
      const mouthY = k[3] ? k[3].y * N : bb.originY + bb.height * 0.78;
      return { cx: bb.originX + bb.width / 2, eyeY, mouthY, w: bb.width };
    } catch (e) { return guess; }
  }

  async function gigachad(img) {
    const N = 360;
    const src = square(img, N); const face = await findFace(src);
    const ctx = src.getContext('2d');
    const inp = ctx.getImageData(0, 0, N, N).data;
    const out = ctx.createImageData(N, N); const o = out.data;
    const fh = Math.max(20, face.mouthY - face.eyeY);           // ojos → boca
    const jawTop = face.eyeY + fh * 0.35; const chinY = face.mouthY + fh * 0.85;
    const half = face.w * 0.62;                                   // anchura de influencia
    const smooth = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
    const sample = (x, y, ch) => {
      x = Math.max(0, Math.min(N - 1.001, x)); y = Math.max(0, Math.min(N - 1.001, y));
      const x0 = x | 0; const y0 = y | 0; const fx = x - x0; const fy = y - y0;
      const i = (y0 * N + x0) * 4 + ch;
      return inp[i] * (1 - fx) * (1 - fy) + inp[i + 4] * fx * (1 - fy) + inp[i + N * 4] * (1 - fx) * fy + inp[i + N * 4 + 4] * fx * fy;
    };
    for (let y = 0; y < N; y++) {
      // Cuánto se ensancha esta fila: nada en los ojos, máximo en la mandíbula, se apaga bajo la barbilla
      const down = smooth((y - jawTop) / (chinY - jawTop)) * (1 - smooth((y - chinY) / (fh * 0.7)));
      // La barbilla baja un poco (mentón cuadrado y largo)
      const sy = y - fh * 0.24 * smooth((y - face.mouthY) / (chinY - face.mouthY)) * (1 - smooth((y - chinY - fh * 0.4) / fh));
      for (let x = 0; x < N; x++) {
        const dx = x - face.cx;
        const fall = 1 - smooth((Math.abs(dx) - half) / (half * 0.6));
        const k = 1 + 0.45 * down * fall;
        const sx = face.cx + dx / k;
        const r = sample(sx, sy, 0); const g = sample(sx, sy, 1); const b = sample(sx, sy, 2);
        let l = (0.3 * r + 0.59 * g + 0.11 * b) / 255;
        l = Math.pow(l, 1.15);                                      // sombras más hondas
        l = 0.5 + (l - 0.5) * 1.8;                                 // contraste fuerte
        l = l < 0 ? 0 : l > 1 ? 1 : l;
        l = l * l * (3 - 2 * l);                                    // curva en S
        const vx = (x / N - 0.5) * 2; const vy = (y / N - 0.45) * 2;
        l *= 1 - 0.68 * Math.min(1, Math.pow(Math.sqrt(vx * vx + vy * vy) / 1.35, 2.2)); // viñeta
        l *= 0.9 + 0.2 * (1 - x / N);                               // luz lateral de estudio
        const v = Math.max(0, Math.min(255, l * 255 + (Math.random() - 0.5) * 12)); // grano
        const i = (y * N + x) * 4;
        o[i] = o[i + 1] = o[i + 2] = v; o[i + 3] = 255;
      }
    }
    // Enfoque (realza mandíbula, pómulos y cejas)
    const sh = new Uint8ClampedArray(o);
    for (let y = 1; y < N - 1; y++) {
      for (let x = 1; x < N - 1; x++) {
        const i = (y * N + x) * 4;
        const v = 5 * o[i] - o[i - 4] - o[i + 4] - o[i - N * 4] - o[i + N * 4];
        sh[i] = sh[i + 1] = sh[i + 2] = 0.65 * o[i] + 0.35 * v;
      }
    }
    out.data.set(sh);
    ctx.putImageData(out, 0, 0);
    return shrink(src);
  }

  // Normal o Gigachad: se elige con vista previa antes de guardar
  async function toAvatar(file) {
    const img = await loadImage(file);
    const normal = shrink(square(img, SIZE * 2));
    const giga = gigachad(img).catch((e) => { console.warn(e); return null; });
    const box = `<div class="modal-icon">📸</div><p class="modal-text">¿Cómo quieres salir?</p>
      <div class="photo-choice">
        <button type="button" class="photo-opt" data-pstyle="normal"><img src="${normal}" alt="Normal"><span>Normal</span></button>
        <button type="button" class="photo-opt sel" data-pstyle="giga"><span class="photo-load" id="giga-load">🗿<br>Esculpiendo<br>mandíbula…</span><span>🗿 Gigachad</span></button>
      </div><input type="hidden" name="style" value="giga">`;
    const pick = MN.modal(box, 'Usar esta foto');
    giga.then((g) => {
      const el = MN.$('[data-pstyle="giga"]'); if (!el) return;
      if (g) el.querySelector('.photo-load').outerHTML = `<img src="${g}" alt="Gigachad">`;
      else { el.querySelector('.photo-load').innerHTML = '😢<br>No se pudo'; el.disabled = true; choose('normal'); }
    });
    const res = await pick;
    if (!res) return null;
    if (res.style === 'giga') { const g = await giga; if (g) return g; }
    return normal;
  }
  function choose(style) {
    MN.$$('.photo-opt').forEach((b) => b.classList.toggle('sel', b.dataset.pstyle === style));
    const h = MN.$('#modal [name="style"]'); if (h) h.value = style;
  }

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
        if (!photo) return;
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
        const opt = e.target.closest('[data-pstyle]'); if (opt && !opt.disabled) { choose(opt.dataset.pstyle); return; }
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
