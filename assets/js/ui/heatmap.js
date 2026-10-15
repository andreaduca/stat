/* heatmap.js — an n × n grid of non-negative values drawn on a canvas, one
   cell per pair (u, v), brighter for larger values; a hover tooltip and a click
   callback report the cell. Used for 2-D Fourier spectra; knows no maths.
   Colours come from the page's CSS tokens, so both themes work. */

/** '#rrggbb' or 'rgb(r, g, b)' -> [r, g, b] */
function rgb(color) {
  const c = color.trim();
  if (c.startsWith('#')) return [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
  return (c.match(/\d+/g) ?? [0, 0, 0]).slice(0, 3).map(Number);
}

/**
 * @param {object} o
 * @param {Float64Array|number[]} o.values  row-major, values[u * n + v]
 * @param {number} o.n
 * @param {(u:number, v:number, value:number) => string} [o.tip]
 * @param {(u:number, v:number) => void} [o.onPick]
 * @param {{u:number, v:number}|null} [o.mark]  a cell to outline
 */
export function heatmap({ values, n, tip = null, onPick = null, mark = null, size = 420 }) {
  const wrap = document.createElement('div');
  wrap.className = 'heatmap';
  const canvas = document.createElement('canvas');
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', `${n} by ${n} heatmap; hover or click a cell for its value`);
  const tipNode = document.createElement('div');
  tipNode.className = 'tip';
  wrap.append(canvas, tipNode);
  if (!canvas.getContext) return wrap;                       // no canvas (e.g. a test DOM)

  const scale = Math.max(1, Math.floor(size / n));
  canvas.width = canvas.height = n * scale;
  const ctx = canvas.getContext('2d');
  const style = getComputedStyle(document.documentElement);
  const lo = rgb(style.getPropertyValue('--panel-alt') || '#ffffff');
  const hi = rgb(style.getPropertyValue('--accent') || '#000000');
  const max = Math.max(...values) || 1;

  // a square-root ramp, so that small but non-zero values remain visible
  for (let u = 0; u < n; u++) for (let v = 0; v < n; v++) {
    const t = Math.sqrt(values[u * n + v] / max);
    ctx.fillStyle = `rgb(${lo.map((c, i) => Math.round(c + (hi[i] - c) * t)).join(',')})`;
    ctx.fillRect(v * scale, u * scale, scale, scale);       // row u, column v
  }
  if (mark) {
    ctx.strokeStyle = style.getPropertyValue('--c-third').trim() || '#a62f9e';
    ctx.lineWidth = Math.max(2, scale / 2);
    ctx.strokeRect(mark.v * scale - 1, mark.u * scale - 1, scale + 2, scale + 2);
  }

  const cell = (e) => {
    const box = canvas.getBoundingClientRect();
    const v = Math.floor(((e.clientX - box.left) / box.width) * n);
    const u = Math.floor(((e.clientY - box.top) / box.height) * n);
    return u >= 0 && v >= 0 && u < n && v < n ? { u, v } : null;
  };
  canvas.addEventListener('pointermove', (e) => {
    const c = cell(e);
    if (!c || !tip) { tipNode.classList.remove('on'); return; }
    tipNode.textContent = tip(c.u, c.v, values[c.u * n + c.v]);
    const box = canvas.getBoundingClientRect();
    tipNode.style.left = `${e.clientX - box.left}px`;
    tipNode.style.top = `${e.clientY - box.top}px`;
    tipNode.classList.add('on');
  });
  canvas.addEventListener('pointerleave', () => tipNode.classList.remove('on'));
  canvas.addEventListener('click', (e) => { const c = cell(e); if (c && onPick) onPick(c.u, c.v); });
  return wrap;
}
