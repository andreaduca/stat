/* barchart.js — bars for measured values, with an optional line for the
   theoretical values on top: the shape every statistics-lab result takes
   (a histogram against its Binomial or Geometric law, counts against their
   expectation). Grouped bars when there are several series, signed values
   allowed (z-scores), horizontal reference lines (critical values).
   Plain SVG; reuses the .chart styles of linechart.js. Knows no cryptography. */

const SVG = 'http://www.w3.org/2000/svg';
const node = (tag, attrs = {}, text = null) => {
  const n = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  if (text !== null) n.textContent = text;
  return n;
};

const niceStep = (span, target) => {
  const raw = span / target;
  const mag = 10 ** Math.floor(Math.log10(Math.max(raw, 1e-12)));
  return [1, 2, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? mag * 10;
};
const short = (v) => (Math.abs(v) >= 1e6 ? v.toExponential(1) : String(+v.toPrecision(4)));

/**
 * @param {object} o
 * @param {(string|number)[]} o.categories   one label per bar group
 * @param {{label:string, color:string, values:number[]}[]} o.series   measured values
 * @param {{label:string, color:string, values:number[], dots?:boolean}|null} [o.overlay]
 *        theory, drawn as a line (or as dots, for a discrete law with few values)
 * @param {{y:number, label:string}[]} [o.refLines]   dashed horizontal lines
 */
export function barChart({ categories, series, overlay = null, refLines = [], xTitle = '', yTitle = '', width = 560, height = 240 }) {
  const pad = { l: 52, r: 16, t: 20, b: 36 };
  const plotW = width - pad.l - pad.r, plotH = height - pad.t - pad.b;
  const all = [...series.flatMap((s) => s.values), ...(overlay ? overlay.values : []), ...refLines.map((r) => r.y)].filter(Number.isFinite);
  let yMin = Math.min(0, ...all), yMax = Math.max(...all, 1e-12);
  const step = niceStep(yMax - yMin, 4);
  yMin = Math.floor(yMin / step) * step; yMax = Math.ceil(yMax / step) * step;
  const Y = (v) => pad.t + plotH - ((v - yMin) / (yMax - yMin)) * plotH;
  const band = plotW / categories.length;
  const Xc = (i) => pad.l + band * (i + 0.5);

  // an accessible name, so a screen reader announces what the chart is
  const svg = node('svg', { viewBox: `0 0 ${width} ${height}`, role: 'img', 'aria-label': `bar chart of ${yTitle || 'values'} by ${xTitle || 'category'}: ${series.map((s) => s.label).join(', ')}${overlay ? `, with ${overlay.label}` : ''}` });
  for (let v = yMin; v <= yMax + step / 2; v += step) {
    svg.append(node('line', { class: 'grid', x1: pad.l, y1: Y(v), x2: pad.l + plotW, y2: Y(v) }));
    svg.append(node('text', { class: 'tick', x: pad.l - 8, y: Y(v) + 4, 'text-anchor': 'end' }, short(v)));
  }
  const every = Math.max(1, Math.ceil(categories.length / 12));
  categories.forEach((c, i) => {
    if (i % every === 0) svg.append(node('text', { class: 'tick', x: Xc(i), y: pad.t + plotH + 16, 'text-anchor': 'middle' }, String(c)));
  });

  // bars, grouped side by side within each category's band
  const inner = Math.max(1, band * 0.8), w = inner / series.length;
  series.forEach((s, k) => s.values.forEach((v, i) => {
    const x = Xc(i) - inner / 2 + k * w, y0 = Y(Math.max(0, Math.min(v, yMax))), y1 = Y(Math.min(0, Math.max(v, yMin)));
    svg.append(node('rect', { class: 'bar', x, y: Math.min(y0, y1), width: Math.max(0.6, w - (series.length > 1 ? 1 : 0.4)), height: Math.max(0, Math.abs(y1 - y0)), fill: s.color }));
  }));
  svg.append(node('line', { class: 'frame', x1: pad.l, y1: Y(0), x2: pad.l + plotW, y2: Y(0) }));
  svg.append(node('line', { class: 'frame', x1: pad.l, y1: pad.t, x2: pad.l, y2: pad.t + plotH }));

  for (const r of refLines) {
    svg.append(node('line', { class: 'ref', x1: pad.l, y1: Y(r.y), x2: pad.l + plotW, y2: Y(r.y) }));
    svg.append(node('text', { class: 'tick', x: pad.l + plotW - 4, y: Y(r.y) - 4, 'text-anchor': 'end' }, r.label));
  }
  if (overlay) {
    if (overlay.dots) {
      // a discrete law with few values: one dot per category, no line between them
      overlay.values.forEach((v, i) => svg.append(node('circle', { class: 'pt', cx: Xc(i), cy: Y(v), r: 5, fill: overlay.color })));
    } else {
      const d = overlay.values.map((v, i) => `${i ? 'L' : 'M'}${Xc(i).toFixed(1)} ${Y(v).toFixed(1)}`).join(' ');
      svg.append(node('path', { class: 'line', d, stroke: overlay.color }));
    }
  }
  if (xTitle) svg.append(node('text', { class: 'axis-ttl', x: pad.l + plotW / 2, y: height - 2, 'text-anchor': 'middle' }, xTitle));
  if (yTitle) svg.append(node('text', { class: 'axis-ttl', x: 4, y: 12 }, yTitle));

  const wrap = document.createElement('div');
  wrap.className = 'chart';
  const tip = document.createElement('div');
  tip.className = 'tip';
  wrap.append(svg, tip);

  /* hover: the category under the pointer, every series and the theory there */
  svg.addEventListener('pointermove', (e) => {
    const box = svg.getBoundingClientRect();
    const i = Math.floor(((((e.clientX - box.left) / box.width) * width) - pad.l) / band);
    if (i < 0 || i >= categories.length) { tip.classList.remove('on'); return; }
    const lines = [String(categories[i]), ...series.map((s) => `${s.label}: ${short(s.values[i])}`)];
    if (overlay) lines.push(`${overlay.label}: ${short(overlay.values[i])}`);
    tip.textContent = lines.join('\n');
    tip.style.left = `${(Xc(i) / width) * 100}%`;
    tip.style.top = `${(pad.t / height) * 100}%`;
    tip.classList.add('on');
  });
  svg.addEventListener('pointerleave', () => tip.classList.remove('on'));
  return wrap;
}
