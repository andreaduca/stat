/* linechart.js — a small two-or-more series line chart in plain SVG.
   One shared y axis (series must measure the same quantity), a legend,
   direct labels at the line ends, and a crosshair tooltip on hover.
   Reusable by any page; it knows nothing about elliptic curves. */

const SVG = 'http://www.w3.org/2000/svg';
const node = (tag, attrs = {}, text = null) => {
  const n = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  if (text !== null) n.textContent = text;
  return n;
};

const niceStep = (span, target) => {
  const raw = span / target;
  const mag = 10 ** Math.floor(Math.log10(Math.max(raw, 1e-9)));
  return [1, 2, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? mag * 10;
};

/**
 * @param {{label:string, color:string, points:[number,number][]}[]} series
 *        `color` is a CSS colour or var(), e.g. 'var(--s1)'.
 */
export function lineChart({ series, xTitle = '', yTitle = '', width = 560, height = 230, tip = null }) {
  const pad = { l: 52, r: 96, t: 24, b: 34 };  // right margin holds the direct labels
  const plotW = width - pad.l - pad.r;
  const plotH = height - pad.t - pad.b;

  const xs = series.flatMap((s) => s.points.map((p) => p[0]));
  const ys = series.flatMap((s) => s.points.map((p) => p[1]));
  const xMax = Math.max(...xs, 1), yMax = Math.max(...ys, 1);
  const X = (x) => pad.l + (x / xMax) * plotW;
  const Y = (y) => pad.t + plotH - (y / yMax) * plotH;

  const svg = node('svg', { viewBox: `0 0 ${width} ${height}` });

  // recessive grid and axis labels
  const yStep = niceStep(yMax, 4), xStep = niceStep(xMax, 5);
  for (let y = 0; y <= yMax; y += yStep) {
    svg.append(node('line', { class: 'grid', x1: pad.l, y1: Y(y), x2: pad.l + plotW, y2: Y(y) }));
    svg.append(node('text', { class: 'tick', x: pad.l - 8, y: Y(y) + 4, 'text-anchor': 'end' }, String(y)));
  }
  for (let x = 0; x <= xMax; x += xStep) {
    svg.append(node('text', { class: 'tick', x: X(x), y: pad.t + plotH + 18, 'text-anchor': 'middle' }, String(x)));
  }
  svg.append(node('line', { class: 'frame', x1: pad.l, y1: pad.t, x2: pad.l, y2: pad.t + plotH }));
  svg.append(node('line', { class: 'frame', x1: pad.l, y1: pad.t + plotH, x2: pad.l + plotW, y2: pad.t + plotH }));
  if (xTitle) svg.append(node('text', { class: 'axis-ttl', x: pad.l + plotW / 2, y: height - 2, 'text-anchor': 'middle' }, xTitle));
  if (yTitle) svg.append(node('text', { class: 'axis-ttl', x: 4, y: 12 }, yTitle));

  const guide = node('line', { class: 'guide', y1: pad.t, y2: pad.t + plotH });
  svg.append(guide);

  // one path per series, plus a direct label at its right end
  const dots = [];
  for (const s of series) {
    const d = s.points.map((p, i) => `${i ? 'L' : 'M'}${X(p[0]).toFixed(1)} ${Y(p[1]).toFixed(1)}`).join(' ');
    svg.append(node('path', { class: 'line', d, stroke: s.color }));
    const last = s.points.at(-1);
    svg.append(node('text', { class: 'endlbl', x: X(last[0]) + 6, y: Y(last[1]) + 4, fill: s.color }, s.label));
    const dot = node('circle', { class: 'dot', r: 4.5, fill: s.color });
    svg.append(dot);
    dots.push(dot);
  }

  const wrap = document.createElement('div');
  wrap.className = 'chart';
  const tipNode = document.createElement('div');
  tipNode.className = 'tip';
  wrap.append(svg, tipNode);

  /* hover: snap to the nearest sampled x and read every series there */
  svg.addEventListener('pointermove', (e) => {
    const box = svg.getBoundingClientRect();
    const ux = ((e.clientX - box.left) / box.width) * width;
    const xv = ((ux - pad.l) / plotW) * xMax;
    const idx = series[0].points.reduce((best, p, i) =>
      Math.abs(p[0] - xv) < Math.abs(series[0].points[best][0] - xv) ? i : best, 0);
    const x = series[0].points[idx][0];
    guide.setAttribute('x1', X(x));
    guide.setAttribute('x2', X(x));
    guide.classList.add('on');
    series.forEach((s, i) => {
      const p = s.points[idx] ?? s.points.at(-1);
      dots[i].setAttribute('cx', X(p[0]));
      dots[i].setAttribute('cy', Y(p[1]));
      dots[i].classList.add('on');
    });
    tipNode.textContent = tip ? tip(x, series.map((s) => (s.points[idx] ?? s.points.at(-1))[1]))
                              : `${x}\n${series.map((s, i) => `${s.label}: ${s.points[idx][1]}`).join('\n')}`;
    tipNode.style.left = `${(X(x) / width) * 100}%`;
    tipNode.style.top = `${(pad.t / height) * 100}%`;
    tipNode.classList.add('on');
  });
  svg.addEventListener('pointerleave', () => {
    guide.classList.remove('on');
    dots.forEach((d) => d.classList.remove('on'));
    tipNode.classList.remove('on');
  });

  return wrap;
}

/** Legend: colour chip plus label, so identity never rests on colour alone. */
export function chartLegend(series) {
  const wrap = document.createElement('div');
  wrap.className = 'legend';
  for (const s of series) {
    const span = document.createElement('span');
    span.innerHTML = `<i style="background:${s.color}"></i>${s.label}`;
    wrap.append(span);
  }
  return wrap;
}
