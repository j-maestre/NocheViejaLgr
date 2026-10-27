// ============================================================
//  GRÁFICA DE EVOLUCIÓN (SVG sin dependencias)
//  Líneas escalonadas: las fichas cambian a saltos, no de forma continua.
//  Las series sin color son "contexto" (gris fino); las que tienen color
//  van destacadas, con etiqueta al final de la línea y en el tooltip.
// ============================================================
(function () {
  'use strict';

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmtDay = (ts) => new Date(ts).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
  const fmtFull = (ts) => new Date(ts).toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

  // Máximo "redondo" para 4 líneas de rejilla (p. ej. 142 → 160, con pasos de 40)
  function niceMax(v) {
    if (v <= 0) return 10;
    const raw = v / 4;
    const p = Math.pow(10, Math.floor(Math.log10(raw)));
    const step = [1, 2, 2.5, 3, 4, 5, 6, 8, 10].find((n) => n * p >= raw) * p;
    return step * 4;
  }

  // Valor de una serie escalonada en el instante ts
  function valueAt(points, ts) {
    let v = null;
    for (const [t, y] of points) { if (t <= ts) v = y; else break; }
    return v;
  }

  /**
   * series: [{ id, label, points: [[ts, value], ...], color: '#hex' | null }]
   * opts:   { xMin, xMax, height }
   */
  function render(el, series, opts = {}) {
    const W = Math.max(280, el.clientWidth || 320);
    const H = opts.height || 220;
    const m = { top: 12, right: 92, bottom: 26, left: 36 };
    const iw = W - m.left - m.right;
    const ih = H - m.top - m.bottom;

    const all = series.flatMap((s) => s.points);
    if (!all.length) { el.innerHTML = '<p class="hint center">Todavía no hay datos.</p>'; return; }
    const xMin = opts.xMin != null ? opts.xMin : Math.min(...all.map((p) => p[0]));
    const xMax = Math.max(opts.xMax != null ? opts.xMax : Math.max(...all.map((p) => p[0])), xMin + 3600000);
    const yMax = niceMax(Math.max(...all.map((p) => p[1])) * 1.05);

    const x = (t) => m.left + ((t - xMin) / (xMax - xMin)) * iw;
    const y = (v) => m.top + ih - (v / yMax) * ih;

    const path = (pts) => {
      if (!pts.length) return '';
      let d = `M${x(pts[0][0]).toFixed(1)},${y(pts[0][1]).toFixed(1)}`;
      for (let i = 1; i < pts.length; i++) d += `H${x(pts[i][0]).toFixed(1)}V${y(pts[i][1]).toFixed(1)}`;
      return d + `H${x(xMax).toFixed(1)}`;
    };

    // Rejilla y ejes (recesivos)
    let grid = '';
    for (let i = 0; i <= 4; i++) {
      const v = (yMax / 4) * i;
      grid += `<line x1="${m.left}" x2="${m.left + iw}" y1="${y(v)}" y2="${y(v)}" class="c-grid${i === 0 ? ' c-base' : ''}"/>
        <text x="${m.left - 6}" y="${y(v) + 4}" class="c-axis" text-anchor="end">${Math.round(v)}</text>`;
    }
    // Marcas del eje X a medianoche, cada N días según el ancho disponible
    const DAY = 86400000;
    const maxTicks = Math.max(2, Math.floor(iw / 60));
    const days = Math.ceil((xMax - xMin) / DAY);
    const every = Math.max(1, Math.ceil(days / maxTicks));
    const first = new Date(xMin); first.setHours(24, 0, 0, 0);
    for (let t = first.getTime(), i = 0; t < xMax; t += DAY, i++) {
      if (i % every) continue;
      const tx = x(t);
      if (tx > m.left + iw - 18) break;
      grid += `<line x1="${tx}" x2="${tx}" y1="${m.top + ih}" y2="${m.top + ih + 4}" class="c-base"/>
        <text x="${tx}" y="${H - 6}" class="c-axis" text-anchor="middle">${fmtDay(t)}</text>`;
    }

    const ctx = series.filter((s) => !s.color);
    const hi = series.filter((s) => s.color);

    // Etiquetas al final de las líneas destacadas, separadas para que no se pisen
    const labels = hi.map((s) => ({ s, y: y(s.points[s.points.length - 1][1]) })).sort((a, b) => a.y - b.y);
    for (let i = 1; i < labels.length; i++) if (labels[i].y - labels[i - 1].y < 15) labels[i].y = labels[i - 1].y + 15;

    el.innerHTML = `
      <svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Evolución de fichas por jugador">
        ${grid}
        ${ctx.map((s) => `<path d="${path(s.points)}" class="c-ctx"/>`).join('')}
        ${hi.map((s) => `<path d="${path(s.points)}" class="c-hi" stroke="${s.color}"/>`).join('')}
        ${hi.map((s) => { const last = s.points[s.points.length - 1]; return `<circle cx="${x(xMax)}" cy="${y(last[1])}" r="4" fill="${s.color}" class="c-dot"/>`; }).join('')}
        ${labels.map(({ s, y: ly }) => `<text x="${x(xMax) + 9}" y="${ly + 4}" class="c-label">${esc(s.label)}</text>`).join('')}
        <line class="c-cross" x1="0" x2="0" y1="${m.top}" y2="${m.top + ih}" visibility="hidden"/>
        <g class="c-hover-dots"></g>
        <rect class="c-hit" x="${m.left}" y="0" width="${iw}" height="${H}" fill="transparent"/>
      </svg>
      <div class="c-tip" hidden></div>`;

    // Hover / toque: línea vertical + tooltip con los valores destacados
    const svg = el.querySelector('svg');
    const cross = el.querySelector('.c-cross');
    const dots = el.querySelector('.c-hover-dots');
    const tip = el.querySelector('.c-tip');
    const tipSeries = hi.length ? hi : series;
    const move = (ev) => {
      const r = svg.getBoundingClientRect();
      const px = ((ev.clientX - r.left) / r.width) * W;
      const t = xMin + ((Math.min(Math.max(px, m.left), m.left + iw) - m.left) / iw) * (xMax - xMin);
      const cx = x(t);
      cross.setAttribute('x1', cx); cross.setAttribute('x2', cx); cross.setAttribute('visibility', 'visible');
      const rows = tipSeries.map((s) => ({ s, v: valueAt(s.points, t) })).filter((r2) => r2.v != null).sort((a, b) => b.v - a.v);
      dots.innerHTML = rows.filter((r2) => r2.s.color).map((r2) => `<circle cx="${cx}" cy="${y(r2.v)}" r="4.5" fill="${r2.s.color}" class="c-dot"/>`).join('');
      tip.innerHTML = `<div class="c-tip-date">${fmtFull(t)}</div>` + rows.slice(0, 6).map((r2) =>
        `<div class="c-tip-row"><span class="c-sw" style="background:${r2.s.color || 'var(--muted)'}"></span>${esc(r2.s.label)}<b>${r2.v}</b></div>`).join('');
      tip.hidden = false;
      const left = (cx / W) * r.width;
      tip.style.left = Math.min(Math.max(left - tip.offsetWidth / 2, 0), r.width - tip.offsetWidth) + 'px';
    };
    const leave = () => { cross.setAttribute('visibility', 'hidden'); dots.innerHTML = ''; tip.hidden = true; };
    const hit = el.querySelector('.c-hit');
    hit.addEventListener('pointermove', move);
    hit.addEventListener('pointerdown', move);
    hit.addEventListener('pointerleave', leave);
  }

  window.MNChart = { render, valueAt };
})();
