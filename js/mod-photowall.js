// ============================================================
//  MÓDULO: 📸 FOTOS DE LA FIESTA (foto del día)
//  Cualquiera sube fotos con un comentario y los demás le dan ❤️ (una por
//  foto, no a las tuyas). Al acabar cada día, la foto con más ❤️ gana un
//  premio de la Banca (si hay empate, se reparte).
//  Las fotos pesan, así que van en una colección aparte que solo se descarga
//  al abrir el apartado de fotos: games/{partida}/photos/{id}
//  Premio: tx `photoday_<día>` (id fijo, no se duplica).
// ============================================================
(window.MNModules = window.MNModules || []).push((function () {
  'use strict';
  let MN; let api = null; let photos = []; let unsub = null; let visible = false; let day = null;
  const pad = (n) => String(n).padStart(2, '0');
  const dayKey = (ts) => { const d = new Date(ts); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
  const fmtDay = (k) => new Date(k + 'T12:00').toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
  const prize = () => Number(MN.S.settings.photoPrize) || 0;
  const maxPerDay = () => Number(MN.S.settings.photoMaxPerDay) || 5;

  // ---------------------------------------------------------- almacén (Firebase o, en pruebas, este navegador)
  function makeApi() {
    const cfg = window.MN_CONFIG || {};
    if (Store.mode === 'firebase' && window.firebase) {
      const col = firebase.firestore().collection('games').doc(cfg.gameId).collection('photos');
      const FV = firebase.firestore.FieldValue;
      return {
        watch: (cb) => col.onSnapshot((s) => cb(s.docs.map((d) => Object.assign({}, d.data(), { id: d.id }))), () => {}),
        all: () => col.get().then((s) => s.docs.map((d) => Object.assign({}, d.data(), { id: d.id }))),
        add: (p) => col.doc(p.id).set(p),
        like: (id, pid, on) => col.doc(id).update({ likes: on ? FV.arrayUnion(pid) : FV.arrayRemove(pid) }),
        remove: (id) => col.doc(id).delete(),
      };
    }
    const KEY = `mn_photos_${cfg.gameId}`; const subs = new Set();
    const read = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; } };
    const write = (fn) => { const d = read(); fn(d); try { localStorage.setItem(KEY, JSON.stringify(d)); } catch (e) { MN.toast('No cabe más en este navegador (modo pruebas)', 'bad'); } subs.forEach((f) => f()); };
    return {
      watch: (cb) => { const f = () => cb(Object.values(read())); subs.add(f); f(); return () => subs.delete(f); },
      all: async () => Object.values(read()),
      add: async (p) => write((d) => { d[p.id] = p; }),
      like: async (id, pid, on) => write((d) => { const p = d[id]; if (!p) return; p.likes = (p.likes || []).filter((x) => x !== pid); if (on) p.likes.push(pid); }),
      remove: async (id) => write((d) => { delete d[id]; }),
    };
  }
  function ensureApi() { if (!api && Store.mode) api = makeApi(); return api; }

  // ---------------------------------------------------------- foto: reducir antes de subir (~60 KB)
  function shrink(file) {
    return new Promise((res, rej) => {
      const url = URL.createObjectURL(file); const img = new Image();
      img.onload = () => {
        const k = Math.min(1, 720 / Math.max(img.naturalWidth, img.naturalHeight));
        const c = document.createElement('canvas'); c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url); res(c.toDataURL('image/jpeg', 0.62));
      };
      img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('No se pudo leer la foto')); };
      img.src = url;
    });
  }

  // ---------------------------------------------------------- pintar
  const likes = (p) => (p.likes || []).length;
  const days = () => [...new Set(photos.map((p) => p.day))].sort().reverse();
  function winnersOf(list) { const top = Math.max(0, ...list.map(likes)); return top ? list.filter((p) => likes(p) === top) : []; }
  function render() {
    const el = MN.$('#photo-wall'); if (!el || !MN.S) return;
    if (!visible) return;
    const mine = MN.me(); const esc = MN.esc; const today = dayKey(Date.now());
    const ds = days(); if (!day || (!ds.includes(day) && day !== today)) day = today;
    const list = photos.filter((p) => p.day === day).sort((a, b) => likes(b) - likes(a) || b.ts - a.ts);
    const mineToday = mine ? photos.filter((p) => p.by === mine.id && p.day === today).length : 0;
    const win = day !== today ? winnersOf(list).map((p) => p.id) : [];
    const canUpload = mine && MN.started() && !MN.ended() && mineToday < maxPerDay();
    el.innerHTML = `
      ${mine ? `<div class="card pw-up">${canUpload ? `<label class="btn primary">📸 Subir una foto<input type="file" accept="image/*" id="pw-file" hidden></label>
        <p class="hint center">Te quedan ${maxPerDay() - mineToday} hoy · premio a la foto del día: <b>${prize()} fichas</b></p>` : `<p class="hint center">${!MN.started() ? 'Las fotos se abren cuando empiece la partida.' : MN.ended() ? 'La partida ha terminado.' : `Ya has subido ${maxPerDay()} fotos hoy.`}</p>`}</div>` : ''}
      <div class="pw-days">${[today, ...ds.filter((d) => d !== today)].map((d) => `<button type="button" class="${d === day ? 'on' : ''}" data-pwday="${d}">${d === today ? 'Hoy' : esc(fmtDay(d))}</button>`).join('')}</div>
      <div class="pw-list">${list.map((p, i) => `<div class="pw-item ${win.includes(p.id) ? 'win' : ''}">
        ${win.includes(p.id) ? '<div class="pw-crown">🏆 Foto del día</div>' : i === 0 && likes(p) && day === today ? '<div class="pw-crown lead">👑 Va ganando</div>' : ''}
        <img src="${p.ph}" alt="" loading="lazy">
        <div class="pw-meta"><span class="pw-who">${MN.who(p.by)}</span>
          <button type="button" class="pw-like ${mine && (p.likes || []).includes(mine.id) ? 'on' : ''}" data-pwlike="${esc(p.id)}" ${!mine || p.by === (mine || {}).id || day !== today ? 'disabled' : ''}>❤️ ${likes(p)}</button></div>
        ${p.caption ? `<div class="pw-cap">“${esc(p.caption)}”</div>` : ''}
        ${MN.isAdmin() || (mine && p.by === mine.id) ? `<button type="button" class="link small pw-del" data-pwdel="${esc(p.id)}">🗑️ Borrar</button>` : ''}
      </div>`).join('') || `<p class="empty">${day === today ? 'Todavía no hay fotos hoy. ¡Sube la primera!' : 'Ese día no hubo fotos.'}</p>`}</div>`;
  }

  // ---------------------------------------------------------- acciones
  async function onChange(e) {
    if (e.target.id !== 'pw-file' || !e.target.files[0]) return;
    const mine = MN.me(); const file = e.target.files[0]; e.target.value = '';
    let ph; try { ph = await shrink(file); } catch (err) { return MN.toast('❌ ' + MN.esc(err.message), 'bad'); }
    const res = await MN.modal(`<div class="modal-icon">📸</div><img src="${ph}" class="pw-preview" alt="">
      <input name="caption" maxlength="100" placeholder="💬 Ponle un comentario (opcional)">`, 'Subir');
    if (!res) return;
    const now = Date.now();
    await MN.act(() => ensureApi().add({ id: 'ph_' + Store.uid(), by: mine.id, ph, caption: (res.caption || '').trim() || null, ts: now, day: dayKey(now), likes: [] }), '📸 ¡Foto subida!');
  }
  async function onClick(e) {
    const d = e.target.closest('[data-pwday]'); if (d) { day = d.dataset.pwday; return render(); }
    const l = e.target.closest('[data-pwlike]');
    if (l && !l.disabled) { const mine = MN.me(); const p = photos.find((x) => x.id === l.dataset.pwlike); if (!mine || !p) return; const on = !(p.likes || []).includes(mine.id); if (MN.fx && on) MN.fx.play('tick'); return ensureApi().like(p.id, mine.id, on).catch(() => {}); }
    const x = e.target.closest('[data-pwdel]');
    if (x && await MN.modal('<div class="modal-icon">🗑️</div><p class="modal-text">¿Borrar esta foto?</p>', 'Borrar')) ensureApi().remove(x.dataset.pwdel).catch(() => {});
  }

  // Avisos de fotos nuevas (solo con el apartado abierto, para no descargar fotos de más)
  let known = null;
  function onPhotos(list) {
    const mine = MN.me();
    if (known && mine && MN.notifyOn('fotos')) list.filter((p) => !known.has(p.id) && p.by !== mine.id).forEach((p) => MN.toast(`📸 ${MN.esc(MN.player(p.by).name)} ha subido una foto${p.caption ? `: «${MN.esc(p.caption)}»` : ''}`, 'ok'));
    known = new Set(list.map((p) => p.id)); photos = list; render();
  }

  // ---------------------------------------------------------- premio de cada día (cuando ya ha terminado)
  let checked = new Set(); let checking = false;
  async function sweep() {
    if (!MN.S || !MN.started() || !prize() || checking) return;
    const today = dayKey(Date.now()); const first = dayKey(MN.startTs()); const last = dayKey(Math.min(Date.now(), MN.endTs() + 3600000));
    const pending = [];
    for (let t = new Date(first + 'T12:00').getTime(); dayKey(t) <= last; t += 86400000) {
      const k = dayKey(t);
      const done = k < today || (MN.ended() && k === dayKey(MN.endTs()));
      if (done && !checked.has(k) && !MN.S.txs.some((x) => x.id === 'photoday_' + k)) pending.push(k);
    }
    if (!pending.length || !ensureApi()) return;
    checking = true;
    try {
      const all = photos.length && visible ? photos : await api.all();
      const writes = [];
      pending.forEach((k) => {
        checked.add(k);
        const w = winnersOf(all.filter((p) => p.day === k)); if (!w.length) return;
        const each = Math.floor(prize() / w.length); const payouts = {}; w.forEach((p) => { payouts[p.by] = (payouts[p.by] || 0) + each; });
        writes.push({ id: 'photoday_' + k, type: 'payout', kind: 'photoday', ts: new Date(k + 'T23:59:59').getTime(), day: k, likes: likes(w[0]), caption: w[0].caption || null, photoId: w[0].id, payouts });
      });
      if (writes.length) await Store.putMany({ txs: writes });
    } catch (e) { console.warn('fotos', e); } finally { checking = false; }
  }

  return {
    init(a) {
      MN = a;
      MN.photoWall = {
        visible(v) {
          visible = v;
          if (v && !unsub && ensureApi()) unsub = api.watch(onPhotos);
          if (v) render();
        },
      };
      MN.registerTx('photoday', { line: (t) => ({ icon: '📸', text: `Foto del día (${new Date(t.day + 'T12:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}): ${Object.keys(t.payouts).map(MN.who).join(', ')} gana con <b>${t.likes}</b> ❤️ y cobra <b>${Object.values(t.payouts)[0]}</b> fichas`, sub: t.caption ? `“${MN.esc(t.caption)}”` : 'Paga la Banca' }) });
      document.addEventListener('change', onChange);
      document.addEventListener('click', onClick);
    },
    render,
    sweep,
    rules(section) {
      const s = MN.S.settings;
      return section('📸', 'Foto del día', `<ul>
        <li>En <b>📅 Eventos → 📸 Fotos</b> sube fotos de la fiesta (hasta ${s.photoMaxPerDay || 5} al día) con un comentario, y dale ❤️ a las que más te gusten (no a las tuyas).</li>
        <li>Al acabar cada día, la foto con más ❤️ gana <b>${s.photoPrize || 0} fichas</b> de la Banca. Si hay empate, se reparte.</li></ul>`);
    },
  };
})());
