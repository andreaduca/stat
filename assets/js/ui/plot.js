/* plot.js — a small SVG plot on continuous axes (linear or log), built from
   layers: lines (solid or dashed), steps, points with error bars, histogram
   bars on a real x axis, ribbons, reference lines, "upper bound only" arrows,
   and bundles of paths that light up under the pointer. A crosshair tooltip
   reads every hoverable layer at the pointer. Knows no statistics; first used
   by hw04, where linechart.js / barchart.js could not draw error bars, lattice
   histograms or Q-Q scatters. Reuses the .chart styles of base.css. */

const SVG = 'http://www.w3.org/2000/svg';
const node = (tag, attrs = {}, text = null) => {
  const n = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) if (v !== null && v !== undefined) n.setAttribute(k, v);
  if (text !== null) n.textContent = text;
  return n;
};

const SUP = (s) => String(s).replace(/[-\d]/g, (d) => (d === '-' ? '⁻' : '⁰¹²³⁴⁵⁶⁷⁸⁹'[d]));

/** A number short enough for a tick: 0.05, 1.2k, 3·10⁻⁴. */
export function short(v) {
  if (v === 0) return '0';
  const a = Math.abs(v);
  if (a >= 1e5 || a < 1e-3) {
    const e = Math.floor(Math.log10(a)), m = v / 10 ** e;
    return Math.abs(m - 1) < 1e-9 ? `10${SUP(e)}` : `${+m.toFixed(1)}·10${SUP(e)}`;
  }
  if (a >= 1e3) return `${+(v / 1e3).toPrecision(3)}k`;
  return String(+v.toPrecision(3));
}

const niceStep = (span, target) => {
  const raw = span / target;
  const mag = 10 ** Math.floor(Math.log10(Math.max(raw, 1e-300)));
  return [1, 2, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? mag * 10;
};

/** Ticks for an axis: decades (with 2 and 5 when the span is short) on a log
 *  scale, round steps on a linear one. */
function autoTicks(lo, hi, log, target) {
  if (log) {
    const a = Math.floor(Math.log10(lo)), b = Math.ceil(Math.log10(hi)), out = [];
    const every = Math.max(1, Math.ceil((b - a) / target));
    for (let e = a; e <= b; e += every) {
      out.push(10 ** e);
      if (b - a <= 2) out.push(2 * 10 ** e, 5 * 10 ** e);
    }
    return out.filter((t) => t >= lo * (1 - 1e-9) && t <= hi * (1 + 1e-9)).sort((x, y) => x - y);
  }
  const step = niceStep(hi - lo, target), out = [];
  for (let t = Math.ceil(lo / step - 1e-9) * step; t <= hi + step * 1e-9; t += step) out.push(Math.abs(t) < step * 1e-9 ? 0 : t);
  return out;
}

let clipId = 0;

/**
 * @param {object} o
 * @param {{min?, max?, log?, ticks?, format?, title?}} [o.x]  axis options; min/max default to the data
 * @param {{min?, max?, log?, ticks?, format?, title?}} [o.y]
 * @param {object[]} o.layers  each {type, label?, color?, ...}:
 *    line   {points: [x, y][], dash?, width?, hover = true}
 *    step   {points: [x, y][]}               a right-continuous staircase (an ECDF)
 *    points {points: [x, y][], err?: [x, lo, hi][], r?, hollow?}
 *    bars   {bars: [x0, x1, height][]}       histogram bars on the real x axis
 *    band   {band: [x, lo, hi][]}            a translucent ribbon
 *    hline / vline {at, dash?, text?}       reference lines with an optional label
 *    arrows {points: [x, y][]}              downward arrows: "the value is at most y"
 *    paths  {paths: [x, y][][], highlight?} many thin paths; the nearest lights up on hover
 *    shade  {x0, x1} or {y0, y1}            a light region (a band μ ± ε)
 * @param {(x: number, rows: string[]) => string} [o.tip]  custom tooltip text
 */
export function plot({ x: xo = {}, y: yo = {}, layers, width = 560, height = 240, tip = null, label = '' }) {
  const pad = { l: 56, r: 14, t: 16, b: xo.title ? 40 : 28 };
  const plotW = width - pad.l - pad.r, plotH = height - pad.t - pad.b;

  // data extents (non-finite and, on a log axis, non-positive values ignored)
  const xs = [], ys = [];
  const okX = (v) => Number.isFinite(v) && (!xo.log || v > 0), okY = (v) => Number.isFinite(v) && (!yo.log || v > 0);
  for (const L of layers) {
    for (const [px, py] of L.points ?? []) { if (okX(px)) xs.push(px); if (okY(py)) ys.push(py); }
    for (const [px, lo, hi] of [...(L.err ?? []), ...(L.band ?? [])]) { if (okX(px)) xs.push(px); for (const v of [lo, hi]) if (okY(v)) ys.push(v); }
    for (const [x0, x1, h] of L.bars ?? []) { xs.push(x0, x1); if (okY(h)) ys.push(h); }
    for (const p of L.paths ?? []) for (const [px, py] of p) { if (okX(px)) xs.push(px); if (okY(py)) ys.push(py); }
  }
  const ext = (vals, o, fallback) => {
    let lo = o.min ?? (vals.length ? Math.min(...vals) : fallback[0]);
    let hi = o.max ?? (vals.length ? Math.max(...vals) : fallback[1]);
    if (hi <= lo) { hi = o.log ? lo * 10 : lo + 1; if (o.min === undefined && !o.log) lo -= 1; }
    return [lo, hi];
  };
  const [x0, x1] = ext(xs, xo, [0, 1]), [y0, y1] = ext(ys, yo, [0, 1]);
  const sc = (v, lo, hi, log) => (log ? (Math.log(v) - Math.log(lo)) / (Math.log(hi) - Math.log(lo)) : (v - lo) / (hi - lo));
  const X = (v) => pad.l + sc(v, x0, x1, xo.log) * plotW;
  const Y = (v) => pad.t + plotH - sc(v, y0, y1, yo.log) * plotH;
  const Yc = (v) => Math.max(pad.t - 4, Math.min(pad.t + plotH + 4, Y(v)));   // clamp a point into view
  const fx = xo.format ?? short, fy = yo.format ?? short;

  const svg = node('svg', { viewBox: `0 0 ${width} ${height}`, role: 'img',
    'aria-label': label || `plot of ${yo.title || 'y'} against ${xo.title || 'x'}: ${layers.filter((L) => L.label).map((L) => L.label).join(', ')}` });
  const id = `plotclip${++clipId}`;
  const defs = node('defs');
  const clip = node('clipPath', { id });
  clip.append(node('rect', { x: pad.l, y: pad.t, width: plotW, height: plotH }));
  defs.append(clip);
  svg.append(defs);

  // recessive grid, ticks, frame
  for (const t of yo.ticks ?? autoTicks(y0, y1, yo.log, 4)) {
    svg.append(node('line', { class: 'grid', x1: pad.l, y1: Y(t), x2: pad.l + plotW, y2: Y(t) }));
    svg.append(node('text', { class: 'tick', x: pad.l - 7, y: Y(t) + 4, 'text-anchor': 'end' }, fy(t)));
  }
  for (const t of xo.ticks ?? autoTicks(x0, x1, xo.log, 6)) {
    svg.append(node('line', { class: 'grid', x1: X(t), y1: pad.t + plotH, x2: X(t), y2: pad.t + plotH + 4 }));
    svg.append(node('text', { class: 'tick', x: X(t), y: pad.t + plotH + 17, 'text-anchor': 'middle' }, fx(t)));
  }
  svg.append(node('line', { class: 'frame', x1: pad.l, y1: pad.t, x2: pad.l, y2: pad.t + plotH }));
  svg.append(node('line', { class: 'frame', x1: pad.l, y1: pad.t + plotH, x2: pad.l + plotW, y2: pad.t + plotH }));
  if (xo.title) svg.append(node('text', { class: 'axis-ttl', x: pad.l + plotW / 2, y: height - 4, 'text-anchor': 'middle' }, xo.title));
  if (yo.title) svg.append(node('text', { class: 'axis-ttl', x: 4, y: 11 }, yo.title));

  const g = node('g', { 'clip-path': `url(#${id})` });
  svg.append(g);
  const d = (pts) => {
    let s = '', pen = false;
    for (const [px, py] of pts) {
      if (!okX(px) || !okY(py)) { pen = false; continue; }
      s += `${pen ? 'L' : 'M'}${X(px).toFixed(1)} ${Y(py).toFixed(1)}`;
      pen = true;
    }
    return s;
  };
  const style = (c, extra = '') => `${c ? `--c:${c};` : ''}${extra}`;
  const hoverable = [];
  let pathLayer = null;

  for (const L of layers) {
    const c = L.color ?? 'var(--ink)';
    switch (L.type) {
      case 'shade': {
        const r = L.x0 !== undefined
          ? { x: X(L.x0), y: pad.t, width: X(L.x1) - X(L.x0), height: plotH }
          : { x: pad.l, y: Y(L.y1), width: plotW, height: Y(L.y0) - Y(L.y1) };
        g.append(node('rect', { class: 'p-shade', ...r, style: style(c) }));
        break;
      }
      case 'band': {
        const ok = L.band.filter(([px, lo, hi]) => okX(px) && okY(lo) && okY(hi));
        if (!ok.length) break;
        const top = ok.map(([px, , hi], i) => `${i ? 'L' : 'M'}${X(px).toFixed(1)} ${Y(hi).toFixed(1)}`).join('');
        const bot = [...ok].reverse().map(([px, lo]) => `L${X(px).toFixed(1)} ${Y(lo).toFixed(1)}`).join('');
        g.append(node('path', { class: 'p-band', d: `${top}${bot}Z`, style: style(c) }));
        break;
      }
      case 'bars':
        for (const [b0, b1, h] of L.bars) {
          if (!(h > 0) || (yo.log && h <= 0)) continue;
          const base = yo.log ? y0 : Math.max(0, y0);
          const top = Y(Math.min(h, y1)), bottom = Y(base);
          g.append(node('rect', { class: 'p-bar', x: X(b0) + 0.5, y: top, width: Math.max(0.8, X(b1) - X(b0) - 1), height: Math.max(0, bottom - top), style: style(c) }));
        }
        if (L.hover !== false) hoverable.push({ L, pts: L.bars.map(([b0, b1, h]) => [(b0 + b1) / 2, h]) });
        break;
      case 'paths': {
        pathLayer = { L, nodes: [] };
        for (const p of L.paths) {
          const n = node('path', { class: 'p-path', d: d(p), style: style(c) });
          g.append(n);
          pathLayer.nodes.push(n);
        }
        break;
      }
      case 'line':
        g.append(node('path', { class: `p-line${L.dash ? ' dash' : ''}${L.thin ? ' thin' : ''}`, d: d(L.points), style: style(c) }));
        if (L.hover !== false) hoverable.push({ L, pts: L.points });
        break;
      case 'step': {
        const pts = [];
        L.points.forEach(([px, py], i) => { if (i) pts.push([px, L.points[i - 1][1]]); pts.push([px, py]); });
        g.append(node('path', { class: 'p-line', d: d(pts), style: style(c) }));
        if (L.hover !== false) hoverable.push({ L, pts: L.points });
        break;
      }
      case 'points':
        for (const [px, lo, hi] of L.err ?? []) {
          if (okX(px) && okY(hi)) g.append(node('line', { class: 'p-err', x1: X(px), x2: X(px), y1: Yc(okY(lo) ? lo : y0), y2: Yc(hi), style: style(c) }));
        }
        for (const [px, py] of L.points) {
          if (okX(px) && okY(py)) g.append(node('circle', { class: `p-pt${L.hollow ? ' hollow' : ''}`, cx: X(px), cy: Y(py), r: L.r ?? 4, style: style(c) }));
        }
        if (L.hover !== false) hoverable.push({ L, pts: L.points });
        break;
      case 'arrows':
        for (const [px, py] of L.points) {
          if (!okX(px) || !okY(py)) continue;
          const ax = X(px), ay = Yc(py);
          g.append(node('path', { class: 'p-arrow', d: `M${ax} ${ay - 3}L${ax} ${ay + 16}M${ax - 4} ${ay + 10}L${ax} ${ay + 16}L${ax + 4} ${ay + 10}`, style: style(c) }));
        }
        if (L.hover !== false) hoverable.push({ L, pts: L.points, prefix: '≤ ' });
        break;
      case 'hline':
      case 'vline': {
        const h = L.type === 'hline';
        if (h ? !okY(L.at) : !okX(L.at)) break;
        const at = h ? Y(L.at) : X(L.at);
        g.append(node('line', { class: `p-ref${L.dash === false ? '' : ' dash'}`, ...(h ? { x1: pad.l, x2: pad.l + plotW, y1: at, y2: at } : { y1: pad.t, y2: pad.t + plotH, x1: at, x2: at }), style: style(c) }));
        if (L.text) svg.append(node('text', { class: 'tick', x: h ? pad.l + plotW - 4 : at + 4, y: h ? at - 4 : pad.t + 10, 'text-anchor': h ? 'end' : 'start' }, L.text));
        break;
      }
      default:
        throw new Error(`plot: unknown layer type ${L.type}`);
    }
  }

  const guide = node('line', { class: 'guide', y1: pad.t, y2: pad.t + plotH });
  svg.append(guide);
  const wrap = document.createElement('div');
  wrap.className = 'chart';
  const tipNode = document.createElement('div');
  tipNode.className = 'tip';
  wrap.append(svg, tipNode);
  if (!hoverable.length && !pathLayer) return wrap;

  /* hover: the nearest sampled x of each hoverable layer, and the nearest path */
  const invX = (sx) => {
    const f = (sx - pad.l) / plotW;
    return xo.log ? Math.exp(Math.log(x0) + f * (Math.log(x1) - Math.log(x0))) : x0 + f * (x1 - x0);
  };
  let lit = null;
  svg.addEventListener('pointermove', (e) => {
    const box = svg.getBoundingClientRect();
    const sx = ((e.clientX - box.left) / box.width) * width, sy = ((e.clientY - box.top) / box.height) * height;
    if (sx < pad.l || sx > pad.l + plotW) return;
    const rows = [];
    for (const { L, pts, prefix = '' } of hoverable) {
      if (!L.label || !pts.length) continue;
      let best = null;
      for (const p of pts) if (okX(p[0]) && (!best || Math.abs(X(p[0]) - sx) < Math.abs(X(best[0]) - sx))) best = p;
      if (best && Math.abs(X(best[0]) - sx) < 40) rows.push(`${L.label}: ${prefix}${short(best[1])}`);
    }
    if (pathLayer) {
      // the path closest to the pointer at this x lights up
      let bi = -1, bd = Infinity;
      pathLayer.L.paths.forEach((p, i) => {
        let q = null;
        for (const pt of p) if (okX(pt[0]) && (!q || Math.abs(X(pt[0]) - sx) < Math.abs(X(q[0]) - sx))) q = pt;
        if (q && okY(q[1]) && Math.abs(Y(q[1]) - sy) < bd) { bd = Math.abs(Y(q[1]) - sy); bi = i; }
      });
      if (lit !== null) pathLayer.nodes[lit].classList.remove('lit');
      lit = bi >= 0 && bd < 24 ? bi : null;
      if (lit !== null) {
        pathLayer.nodes[lit].classList.add('lit');
        const names = pathLayer.L.names;
        rows.push(names ? names[lit] : `${pathLayer.L.label ?? 'path'} ${lit + 1}`);
      }
    }
    const xv = invX(sx);
    guide.setAttribute('x1', sx); guide.setAttribute('x2', sx);
    guide.classList.add('on');
    tipNode.textContent = tip ? tip(xv, rows) : [`${xo.title || 'x'} ≈ ${short(xv)}`, ...rows].join('\n');
    tipNode.style.left = `${(sx / width) * 100}%`;
    tipNode.style.top = `${(pad.t / height) * 100}%`;
    tipNode.classList.add('on');
  });
  svg.addEventListener('pointerleave', () => {
    guide.classList.remove('on');
    tipNode.classList.remove('on');
    if (lit !== null) pathLayer.nodes[lit].classList.remove('lit');
    lit = null;
  });
  return wrap;
}
