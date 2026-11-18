/* widgets.js — the visual language of the hw07 plots, the runner around this
   homework's worker, and the shared figure helpers re-exported, so a page imports
   its drawing kit from one place.
   Categories of F get one colour each (--s1, --s2 for two; the --m1…--m6 palette
   for more), always with their label or number written next to them: nothing on
   these pages is told by colour alone. hw07's own drawing: the mosaic plot. */

import { runner } from '../../../assets/js/ui/run.js';

export { legend, evidence, evidenceHtml, figure, svgButton } from '../../../assets/js/ui/figure.js';
export { densityBars, curve, histogram } from '../../../assets/js/ui/plot.js';
export { sig } from '../../../assets/js/ui/format.js';
export { abstract, anchor } from '../../../assets/js/ui/dom.js';

export const INK = 'var(--ink)', MUTED = 'var(--muted)';

/** One colour per category of F: the validated pair for two, the six-colour palette beyond. */
export const categoryColors = (n) => (n <= 2 ? ['var(--s1)', 'var(--s2)'] : Array.from({ length: n }, (_, j) => `var(--m${(j % 6) + 1})`)).slice(0, n);

/** hw07's experiments, run in its worker with a per-page cache (shared runner). */
export const { getRun, forget, pending, updatingFlag } = runner(new URL('../workers/sim.js', import.meta.url));

const SVG = 'http://www.w3.org/2000/svg';
const node = (tag, attrs = {}, text = null) => {
  const n = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  if (text !== null) n.textContent = text;
  return n;
};
const pc = (x) => `${(100 * x).toFixed(x < 0.1 ? 1 : 0)} %`;

/**
 * A mosaic plot of a contingency table: one column per category of X, as wide as its
 * share R_i/N; inside it, one tile per category of F, as tall as the row profile O_ij/R_i.
 * Independence ⇔ every column is split at the same heights (the row profiles equal the
 * column margin, Lemma 2), so dependence shows as splits that do not line up.
 * @param {object} o
 * @param {import('../core/table.js').ContingencyTable} o.table   gives the widths (row margins)
 * @param {number[][]} [o.profiles]  the heights; default the table's row profiles (pass the
 *        column margin in every row to draw the independent table with the same margins)
 * @param {boolean} [o.marginLine]  dashed lines at the column margin C_j/N: where the splits
 *        would be under independence
 * @param {string} o.label  accessible name
 */
export function mosaic({ table, profiles = null, marginLine = false, label, width = 340, height = 250, xTitle = '' }) {
  const pad = { l: 8, r: 8, t: 8, b: xTitle ? 46 : 32 }, gap = 3;
  const W = width - pad.l - pad.r - gap * (table.r - 1), H = height - pad.t - pad.b;
  const R = table.R, N = table.N, C = table.C;
  const prof = profiles ?? table.rowProfiles();
  const colors = categoryColors(table.c);
  const svg = node('svg', { viewBox: `0 0 ${width} ${height}`, role: 'img', 'aria-label': label });
  const tip = document.createElement('div');
  tip.className = 'tip';
  let x = pad.l;
  table.rows.forEach((rowLabel, i) => {
    const w = (W * R[i]) / N;
    let y = pad.t + H;   // stack from the bottom: F's first category at the bottom
    table.cols.forEach((colLabel, j) => {
      const h = H * (prof[i][j] || 0);   // a row with no records yet (a stream's start) has no profile
      y -= h;
      const tile = node('rect', { class: 'tile', x, y, width: Math.max(0, w), height: Math.max(0, h), fill: colors[j] });
      tile.addEventListener('pointerenter', () => {
        tip.textContent = `${rowLabel} · ${colLabel}\n${pc(prof[i][j] || 0)} of the ${rowLabel} column`;
        tip.style.left = `${((x + w / 2) / width) * 100}%`;
        tip.style.top = `${(y / height) * 100}%`;
        tip.classList.add('on');
      });
      svg.append(tile);
      if (h > 15 && w > 34) svg.append(node('text', { class: 'tile-lbl', x: x + w / 2, y: y + h / 2 + 4, 'text-anchor': 'middle' }, pc(prof[i][j])));
    });
    if (w > 24) {
      svg.append(node('text', { class: 'tick', x: x + w / 2, y: pad.t + H + 15, 'text-anchor': 'middle' }, rowLabel));
      if (w > 74) svg.append(node('text', { class: 'tick muted-tick', x: x + w / 2, y: pad.t + H + 28, 'text-anchor': 'middle' }, `${pc(R[i] / N)} of N`));
    }
    x += w + gap;
  });
  if (marginLine) {
    let acc = 0;
    for (let j = 0; j < table.c - 1; j++) {
      acc += C[j] / N;
      const y = pad.t + H * (1 - acc);
      svg.append(node('line', { class: 'ref', x1: pad.l, y1: y, x2: width - pad.r, y2: y }));
    }
  }
  if (xTitle) svg.append(node('text', { class: 'axis-ttl', x: width / 2, y: height - 2, 'text-anchor': 'middle' }, xTitle));
  svg.addEventListener('pointerleave', () => tip.classList.remove('on'));
  const wrap = document.createElement('div');
  wrap.className = 'chart mosaic';
  wrap.append(svg, tip);
  return wrap;
}

/** The column margin repeated in every row: the heights of the independent table with the
 *  same margins (E_ij / R_i = C_j / N). */
export const marginProfiles = (table) => { const C = table.C, N = table.N; return table.rows.map(() => C.map((c) => c / N)); };

/* ---------- tables with margins ---------- */

/** A row of buttons, one of them pressed: switches what a panel shows, in place.
 *  @param {[string, string][]} options  [key, text]  @param {(key: string) => void} onPick */
export function viewSwitch(options, current, onPick, label) {
  const group = document.createElement('div');
  group.className = 'switch';
  group.setAttribute('role', 'group');
  group.setAttribute('aria-label', label);
  for (const [key, text] of options) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = text;
    b.setAttribute('aria-pressed', String(key === current));
    if (key === current) b.classList.add('on');
    b.addEventListener('click', () => {
      for (const o of group.children) { o.classList.remove('on'); o.setAttribute('aria-pressed', 'false'); }
      b.classList.add('on'); b.setAttribute('aria-pressed', 'true');
      onPick(key);
    });
    group.append(b);
  }
  return group;
}

const td = (spec, tag = 'td') => {
  const n = document.createElement(tag);
  const s = typeof spec === 'object' && spec !== null ? spec : { text: spec };
  n.textContent = s.text ?? '';
  if (s.title) n.title = s.title;
  if (s.cls) n.className = s.cls;
  if (s.style) n.setAttribute('style', s.style);
  return n;
};

/**
 * A contingency table drawn as an HTML table: X down the rows, F across the columns,
 * with an optional margin column and margin row (never colour alone: every cell is written).
 * @param {object} o
 * @param {import('../core/table.js').ContingencyTable} o.table  gives the labels
 * @param {(i: number, j: number) => string|{text, title?, cls?, style?}} o.cell
 * @param {(i: number) => *} [o.rowMargin]  the last column
 * @param {(j: number) => *} [o.colMargin]  the last row
 * @param {*} [o.corner]  bottom-right
 * @param {string[]} [o.marginHeads]  [last column's head, last row's head]
 */
export function cellTable({ table, cell, rowMargin = null, colMargin = null, corner = '', marginHeads = ['total', 'total'], label }) {
  const t = document.createElement('table');
  t.className = 'data ct';
  if (label) t.setAttribute('aria-label', label);
  const head = document.createElement('tr');
  head.append(td({ text: '', cls: 'left' }, 'th'), ...table.cols.map((c) => td(c, 'th')));
  if (rowMargin) head.append(td({ text: marginHeads[0], cls: 'margin' }, 'th'));
  const thead = document.createElement('thead');
  thead.append(head);
  const tbody = document.createElement('tbody');
  table.rows.forEach((r, i) => {
    const tr = document.createElement('tr');
    tr.append(td({ text: r, cls: 'left' }, 'th'));
    table.cols.forEach((_, j) => tr.append(td(cell(i, j))));
    if (rowMargin) tr.append(td(withCls(rowMargin(i), 'margin')));
    tbody.append(tr);
  });
  if (colMargin) {
    const tr = document.createElement('tr');
    tr.className = 'margin-row';
    tr.append(td({ text: marginHeads[1], cls: 'left margin' }, 'th'));
    table.cols.forEach((_, j) => tr.append(td(withCls(colMargin(j), 'margin'))));
    if (rowMargin) tr.append(td(withCls(corner, 'margin')));
    tbody.append(tr);
  }
  t.append(thead, tbody);
  const wrap = document.createElement('div');
  wrap.className = 'scroll-x';
  wrap.append(t);
  return wrap;
}
const withCls = (spec, cls) => (typeof spec === 'object' && spec !== null ? { ...spec, cls: `${spec.cls ?? ''} ${cls}`.trim() } : { text: spec, cls });

/** A Pearson residual as a cell: its value written with its sign, on a diverging tint
 *  (orange above the expected count, blue below), as strong as |r| relative to `scale`. */
export function residualCell(r, scale) {
  const w = Math.round(Math.min(1, Math.abs(r) / scale) * 70);
  return { text: `${r > 0 ? '+' : r < 0 ? '−' : ''}${Math.abs(r).toFixed(2)}`, cls: `resid ${r >= 0 ? 'pos' : 'neg'}`, style: `--w:${w}%` };
}

/** The validity of the χ² approximation as a written badge (tests.validity). */
export function validityBadge(v) {
  const text = { ok: 'χ² approximation: valid', acceptable: 'χ² approximation: acceptable', doubtful: 'χ² approximation: doubtful', invalid: 'χ² approximation: not valid' }[v.level];
  const b = document.createElement('span');
  b.className = `badge validity ${v.level}`;
  b.textContent = `${v.level === 'ok' || v.level === 'acceptable' ? '✓' : '⚠'} ${text}`;
  b.title = `${v.below5} of ${v.cells} cells have E < 5, ${v.below1} have E < 1; smallest E = ${v.minE.toFixed(2)}`;
  return b;
}

/**
 * A k × k table of Pearson residuals as a grid of tinted squares: orange where there are more
 * pairs than independence predicts, blue where fewer, saturating at |r| = `cap`. Too many
 * cells to write numbers in, so every cell has a tooltip with O, E and r, and the verdict is
 * written under the grid by the page.
 * @param {object} o
 * @param {import('../core/table.js').ContingencyTable} o.table  the full k × k table (empty rows kept)
 */
export function residualGrid({ table, cap = 4, size = 230, label, rowName = 'current output', colName = 'next output' }) {
  const k = table.r, pad = 18, cell = (size - pad) / k;
  const R = table.R, C = table.C, N = table.N;
  const svg = node('svg', { viewBox: `0 0 ${size} ${size}`, role: 'img', 'aria-label': label, class: 'rgrid' });
  const tip = document.createElement('div');
  tip.className = 'tip';
  for (let i = 0; i < k; i++) for (let j = 0; j < k; j++) {
    const o = table.at(i, j), e = (R[i] * C[j]) / N, r = e > 0 ? (o - e) / Math.sqrt(e) : 0;
    const w = Math.round(Math.min(1, Math.abs(r) / cap) * 90);
    const sq = node('rect', { x: pad + j * cell, y: pad + i * cell, width: cell, height: cell, class: 'rcell',
      style: `fill: color-mix(in srgb, ${r >= 0 ? 'var(--m2)' : 'var(--m1)'} ${w}%, var(--panel))` });
    sq.addEventListener('pointerenter', () => {
      tip.textContent = `${rowName} ${table.rows[i]}, ${colName} ${table.cols[j]}\nO = ${o}, E = ${e.toFixed(1)}, r = ${r.toFixed(1)}`;
      tip.style.left = `${((pad + (j + 0.5) * cell) / size) * 100}%`;
      tip.style.top = `${((pad + i * cell) / size) * 100}%`;
      tip.classList.add('on');
    });
    svg.append(sq);
  }
  svg.append(node('text', { class: 'tick', x: pad + (k * cell) / 2, y: 12, 'text-anchor': 'middle' }, `${colName} →`));
  svg.append(node('text', { class: 'tick', x: 12, y: pad + (k * cell) / 2, 'text-anchor': 'middle', transform: `rotate(-90 12 ${pad + (k * cell) / 2})` }, `${rowName} →`));
  svg.addEventListener('pointerleave', () => tip.classList.remove('on'));
  const wrap = document.createElement('div');
  wrap.className = 'chart rgrid-wrap';
  wrap.append(svg, tip);
  return wrap;
}

let dagId = 0;
/**
 * A small causal diagram (DAG): rounded nodes and arrows. Edges of class 'direct' are dashed;
 * a node listed in `boxed` is drawn as the variable conditioned on (or selected on).
 * @param {object} o
 * @param {Object<string, [number, number, string]>} o.nodes  id → [x, y, label] in a 420 × h box
 * @param {[string, string, string?][]} o.edges  [from, to, class]
 */
export function dagFigure({ nodes, edges, height = 150, label, note = '', boxed = [] }) {
  const id = `dagarr${++dagId}`;
  const s = node('svg', { viewBox: `0 0 420 ${height}`, role: 'img', class: 'dag', 'aria-label': label });
  const defs = node('defs'), mk = node('marker', { id, viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: 'auto-start-reverse' });
  mk.append(node('path', { d: 'M0 0L10 5L0 10z', class: 'arrowhead' }));
  defs.append(mk); s.append(defs);
  const half = (t) => Math.max(40, 4 + t.length * 3.6);
  for (const [a, b, cls = ''] of edges) {
    const [x1, y1, t1] = nodes[a], [x2, y2, t2] = nodes[b];
    const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy);
    // leave each box: scale back to its border (ellipse-ish: half width horizontally, 16 px vertically)
    const cut = (h) => Math.min(h / Math.max(Math.abs(dx) / len, 1e-9), 17 / Math.max(Math.abs(dy) / len, 1e-9)) / len;
    const k1 = cut(half(t1)), k2 = cut(half(t2)) + 4 / len;
    s.append(node('line', { x1: x1 + dx * k1, y1: y1 + dy * k1, x2: x2 - dx * k2, y2: y2 - dy * k2, class: `edge ${cls}`, 'marker-end': `url(#${id})` }));
  }
  for (const [key, [x, y, t]] of Object.entries(nodes)) {
    const w = 2 * half(t);
    s.append(node('rect', { x: x - w / 2, y: y - 15, width: w, height: 30, rx: 15, class: `dnode${boxed.includes(key) ? ' boxed' : ''}` }));
    s.append(node('text', { x, y: y + 5, 'text-anchor': 'middle', class: 'dlabel' }, t));
  }
  if (note) s.append(node('text', { x: 210, y: height - 6, 'text-anchor': 'middle', class: 'tick' }, note));
  const wrap = document.createElement('div');
  wrap.className = 'chart';
  wrap.append(s);
  return wrap;
}
