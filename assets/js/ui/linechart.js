/* linechart.js — a small two-or-more series line chart in plain SVG.
   One shared y axis (series must measure the same quantity), a legend,
   direct labels at the line ends, and a crosshair tooltip on hover.
   Optionally log axes and confidence ribbons (hw03's experiments).
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
 * @param {{label:string, color:string, points:[number,number][], band?:[number,number,number][]}[]} series
 *        `color` is a CSS colour or var(), e.g. 'var(--s1)'. `band` (optional) is
 *        [x, lo, hi] per point — a confidence interval drawn as a faint ribbon.
 * Optional, for charts whose data span decades (hw03): `logX`/`logY` use a
 * log scale (all values must then be > 0); `xTicks`/`yTicks` place the ticks;
 * `xFormat`/`yFormat` print them; `yMin`/`yMax` fix the range; `endLabels: false`
 * drops the direct labels (when many lines end at the same height).
 * Without these the chart is exactly the original linear one from 0.
 */
export function lineChart({
  series, xTitle = '', yTitle = '', width = 560, height = 230, tip = null,
  logX = false, logY = false, xTicks = null, yTicks = null, xFormat = String, yFormat = String,
  yMin = null, yMax: yTop = null, endLabels = true,
}) {
  const pad = { l: 52, r: endLabels ? 96 : 16, t: 24, b: 34 };  // right margin holds the direct labels
  const plotW = width - pad.l - pad.r;
  const plotH = height - pad.t - pad.b;

  const xs = series.flatMap((s) => s.points.map((p) => p[0]));
  const ys = series.flatMap((s) => [...s.points.map((p) => p[1]), ...(s.band ?? []).flatMap((b) => [b[1], b[2]])]);
  const xMax = Math.max(...xs, 1), yMax = yTop ?? Math.max(...ys, 1);
  const xMin = logX ? Math.min(...xs) : 0, y0 = yMin ?? (logY ? Math.min(...ys) : 0);
  const scale = (v, lo, hi, log) => (log ? (Math.log(v) - Math.log(lo)) / (Math.log(hi) - Math.log(lo)) : (v - lo) / (hi - lo));
  const X = (x) => pad.l + scale(x, xMin, xMax, logX) * plotW;
  const Y = (y) => pad.t + plotH - scale(Math.min(Math.max(y, y0), yMax), y0, yMax, logY) * plotH;

  const svg = node('svg', { viewBox: `0 0 ${width} ${height}`, role: 'img', 'aria-label': `line chart of ${yTitle || 'values'} by ${xTitle || 'x'}: ${series.map((s) => s.label).join(', ')}` });

  // recessive grid and axis labels
  const yStep = niceStep(yMax - y0, 4), xStep = niceStep(xMax, 5);
  const yList = yTicks ?? (logY ? [] : Array.from({ length: Math.floor((yMax - y0) / yStep + 1e-9) + 1 }, (_, i) => y0 + i * yStep));
  const xList = xTicks ?? (logX ? [] : Array.from({ length: Math.floor(xMax / xStep + 1e-9) + 1 }, (_, i) => i * xStep));
  for (const y of yList) {
    svg.append(node('line', { class: 'grid', x1: pad.l, y1: Y(y), x2: pad.l + plotW, y2: Y(y) }));
    svg.append(node('text', { class: 'tick', x: pad.l - 8, y: Y(y) + 4, 'text-anchor': 'end' }, yFormat(y)));
  }
  for (const x of xList) {
    svg.append(node('text', { class: 'tick', x: X(x), y: pad.t + plotH + 18, 'text-anchor': 'middle' }, xFormat(x)));
  }
  svg.append(node('line', { class: 'frame', x1: pad.l, y1: pad.t, x2: pad.l, y2: pad.t + plotH }));
  svg.append(node('line', { class: 'frame', x1: pad.l, y1: pad.t + plotH, x2: pad.l + plotW, y2: pad.t + plotH }));
  if (xTitle) svg.append(node('text', { class: 'axis-ttl', x: pad.l + plotW / 2, y: height - 2, 'text-anchor': 'middle' }, xTitle));
  if (yTitle) svg.append(node('text', { class: 'axis-ttl', x: 4, y: 12 }, yTitle));

  const guide = node('line', { class: 'guide', y1: pad.t, y2: pad.t + plotH });
  svg.append(guide);

  // confidence ribbons first, so every line is drawn over them
  for (const s of series) {
    if (!s.band?.length) continue;
    const top = s.band.map((b, i) => `${i ? 'L' : 'M'}${X(b[0]).toFixed(1)} ${Y(b[2]).toFixed(1)}`).join(' ');
    const bottom = [...s.band].reverse().map((b) => `L${X(b[0]).toFixed(1)} ${Y(b[1]).toFixed(1)}`).join(' ');
    svg.append(node('path', { class: 'band', d: `${top} ${bottom} Z`, fill: s.color }));
  }

  // one path per series, plus a direct label at its right end
  const dots = [];
  for (const s of series) {
    const d = s.points.map((p, i) => `${i ? 'L' : 'M'}${X(p[0]).toFixed(1)} ${Y(p[1]).toFixed(1)}`).join(' ');
    svg.append(node('path', { class: 'line', d, stroke: s.color }));
    const last = s.points.at(-1);
    if (endLabels) svg.append(node('text', { class: 'endlbl', x: X(last[0]) + 6, y: Y(last[1]) + 4, fill: s.color }, s.label));
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
    // nearest sampled x on screen (the same as in data units on a linear axis)
    const idx = series[0].points.reduce((best, p, i) =>
      Math.abs(X(p[0]) - ux) < Math.abs(X(series[0].points[best][0]) - ux) ? i : best, 0);
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
