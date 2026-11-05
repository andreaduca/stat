/* welford-page.js — Ex. 1: Welford's recurrences derived the way Knuth derives
   the running mean; the mechanism step by step (number line, rectangle,
   stacked sum of squares, trace table); the running statistics of a long
   stream; why the textbook formula fails in floating point and Welford does
   not; the 3-line code, a box to run it on your own numbers, and its cost.
   Everything here is computed in the page (small and fast). */

import { el, field, explain } from '../../../assets/js/ui/dom.js';
import { startPage } from '../../../assets/js/ui/page.js';
import { labPanel, section, table } from '../../../assets/js/ui/lab.js';
import { plot } from '../../../assets/js/ui/plot.js';
import { nice } from '../../../assets/js/ui/format.js';
import { m, M, svgTex } from '../../../assets/js/ui/math.js';
import { show, setValue } from '../../../assets/js/ui/dock.js';
import { load, save } from '../../../assets/js/ui/store.js';
import { RunningStats, TracedRunningStats, pushChecked } from '../core/running.js';
import { PRECISION, storeAs, naiveVariance, twoPassVariance, welfordVariance, exactVariance, conditionNumber, relativeError } from '../core/variance-algos.js';
import { runningStream, stabilitySweep, stream, ID } from '../core/experiments.js';
import { varS2 } from '../core/theory.js';
import { readInputs, scoreOf, dock, rejected } from './inputs.js';
import { SIM, THEORY, MUTED, legend, evidenceHtml, figure, svgButton, sig } from './widgets.js';
import { hw05Shell, STICKY, MEMORY } from './shell.js';

const PRESET = [2, 4, 4, 4, 5, 5, 7, 9];
const K_CHOICES = [100, 1000, 10000, 100000];
const FOUR = [4, 7, 13, 16];
const SVG = 'http://www.w3.org/2000/svg';
const s = (tag, attrs = {}, text = null) => {
  const n = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) if (v !== null && v !== undefined) n.setAttribute(k, v);
  if (text !== null) n.textContent = text;
  return n;
};

/* an SVG label written in the formula subset (real sub/superscripts) */
const lbl = (attrs, src) => svgTex(s('text', attrs), src);

/* ---------- page state read from the URL ---------- */

function readPage(state) {
  const vals = String(state.e1 ?? PRESET.join(',')).split(',').map(Number).filter(Number.isFinite).slice(0, 40);
  const k = Math.min(vals.length, Math.max(1, Math.round(Number(state.e1k) || vals.length)));
  const K = K_CHOICES.includes(Number(state.K)) ? Number(state.K) : 10000;
  const c = Math.min(12, Math.max(0, Number.isFinite(Number(state.c)) ? Number(state.c) : 9));
  return { vals, k, K, c };
}

/* ---------- this page's row in the dock: stream length (E2) and offset c (E3) ---------- */

let onOffset = () => {};    // a drag of the c slider redraws only the E3(a) table, through this hook
const PAGE = {
  id: 'welford', label: 'this page',
  build(apply) {
    const K = el('select', { 'aria-label': 'stream length K', onchange: (e) => apply({ K: e.target.value }) },
      K_CHOICES.map((v) => el('option', { value: v, text: nice(v) })));
    const out = el('span', { class: 'eq' });
    const c = el('input', { type: 'range', min: 0, max: 12, step: 0.5, 'aria-label': 'offset exponent: c = 10 to this power',
      oninput: (e) => { const v = Number(e.target.value); out.textContent = `c = 10${sup(v)}`; onOffset(v); } });
    return {
      nodes: [el('div', { class: 'row' }, [field('E2 stream length K', K), el('div', { class: 'vrule' }), field('E3 offset c', c), out])],
      refresh(v) { show(K, v.K); show(c, v.c); out.textContent = `c = 10${sup(v.c)}`; },
    };
  },
  summary: (v) => `K = ${nice(v.K)} · c = 10${sup(v.c)}`,
  notes: [
    '<strong>K</strong>: how many scores the stream of E2 has. The running mean and variance are drawn after every one of them (thinned on a log axis).',
    '<strong>c</strong>: the common offset added to the four numbers {4, 7, 13, 16} of E3. Their variance is 30 whatever c is; drag c and watch which algorithm keeps knowing it.',
  ],
};
const sup = (v) => String(v).replace(/[-\d.]/g, (d) => (d === '.' ? '·' : d === '-' ? '⁻' : '⁰¹²³⁴⁵⁶⁷⁸⁹'[d]));

/* ---------- 1. the derivation ---------- */

function derivation() {
  const rows = [
    ['relation between step k and k − 1', m`k M_k = (k-1) M_{k-1} + x_k`,
      `${m`S_k = \sum_{i<k} (x_i - M_k)^2 + (x_k - M_k)^2`}<br><span class="small muted">the old points, measured from the new centre; plus the new point</span>`],
    ['the tool', `add and subtract ${m`M_{k-1}`}`,
      `the shift decomposition: measuring the old points from ${m`M_k`} instead of ${m`M_{k-1}`} costs ${m`(k-1)(M_k - M_{k-1})^2`} extra`],
    ['result', m`M_k = M_{k-1} + \frac{d_k}{k}`, m`S_k = S_{k-1} + d_k (x_k - M_k) = S_{k-1} + \frac{k-1}{k} d_k^2`],
    ['for the variance', '—', `${m`s_k^2 = \frac{k-2}{k-1} s_{k-1}^2 + \frac{d_k^2}{k}`} <span class="small muted">(k ≥ 2)</span>`],
  ];
  return el('div', { class: 'card' }, [
    el('h2', { text: 'The derivation, Knuth-style' }),
    el('p', { html: `Knuth's idea for the mean: <strong>do not recompute; express the new quantity through the old one plus a correction driven by the new value.</strong> Welford applies the same idea to the sum of squares ${m`S_k = \sum_{i \le k} (x_i - M_k)^2`}. Write ${m`d_k = x_k - M_{k-1}`}, the <em>innovation</em>: how far the new value lands from the old mean.` }),
    el('div', { class: 'scroll-x' }, [el('table', { class: 'data prose derive' }, [
      el('thead', {}, [el('tr', {}, ['', 'mean (Knuth)', 'sum of squares (Welford)'].map((h, i) => el('th', { class: i ? null : 'left', text: h })))]),
      el('tbody', {}, rows.map((r) => el('tr', {}, r.map((t, i) => el('td', { class: i ? 'eqcell' : 'left', html: t }))))),
    ])]),
    el('p', { html: `${evidenceHtml('T')} The whole derivation is one identity, the <strong>shift decomposition</strong>, applied once:` }),
    el('div', { html: M`\sum_{i=1}^{n} (x_i - c)^2 = \mathrm{SS} + n(\bar x - c)^2 \quad \text{for every } c.` }),
    el('p', { html: `The same identity gives Bessel's correction (${m`c = \mu`}), the merge of two summaries (Merge &amp; privacy page), and the sensitivity of ${m`s^2`} for differential privacy: one lemma, four results.` }),
    el('details', { class: 'explain' }, [
      el('summary', { text: 'The proof, step by step' }),
      el('div', {}, [
        el('p', { html: `<strong>Lemma 1 (Knuth).</strong> Add and subtract ${m`M_{k-1}`}, then divide by ${m`k`}:` }),
        el('div', { html: M`k M_k &= (k-1) M_{k-1} + x_k \\ &= k M_{k-1} + (x_k - M_{k-1}) \\ \Longrightarrow \quad M_k &= M_{k-1} + \frac{d_k}{k}.` }),
        el('p', { html: `<strong>Lemma 2.</strong> Subtract Lemma 1 from ${m`x_k`}: the new deviation is the innovation, shrunk.` }),
        el('div', { html: M`x_k - M_k &= d_k - \frac{d_k}{k} = \frac{k-1}{k} d_k, \\ M_k - M_{k-1} &= \frac{d_k}{k}.` }),
        el('p', { html: '<strong>Shift decomposition.</strong> For any c, expand the square; the cross term vanishes because deviations from the mean sum to zero:' }),
        el('div', { html: M`\sum (x_i - c)^2 &= \sum \big((x_i - \bar x) + (\bar x - c)\big)^2 \\ &= \mathrm{SS} + 2(\bar x - c) \sum (x_i - \bar x) + n(\bar x - c)^2 \\ &= \mathrm{SS} + n(\bar x - c)^2.` }),
        el('p', { html: `<strong>Theorem (Welford).</strong> Split ${m`S_k`} into the ${m`k-1`} old points and the new one, and apply the shift decomposition to the old points with ${m`c = M_k`}:` }),
        el('div', { html: M`\sum_{i<k} (x_i - M_k)^2 = S_{k-1} + (k-1)(M_{k-1} - M_k)^2.` }),
        el('p', { html: 'So, by Lemma 2,' }),
        el('div', { html: M`S_k - S_{k-1} &= (k-1)\frac{d_k^2}{k^2} + \frac{(k-1)^2}{k^2} d_k^2 \\ &= \frac{k-1}{k} d_k^2 \left(\frac{1}{k} + \frac{k-1}{k}\right) \\ &= \frac{k-1}{k} d_k^2 = d_k (x_k - M_k). \quad \blacksquare` }),
        el('p', { html: `<strong>Variance form.</strong> Divide by ${m`k-1`} and write ${m`S_{k-1} = (k-2) s_{k-1}^2`}:` }),
        el('div', { html: M`s_k^2 = \frac{k-2}{k-1} s_{k-1}^2 + \frac{d_k^2}{k} \qquad (k \ge 2).` }),
        el('p', { html: `The program keeps ${m`S`} rather than ${m`s^2`}: no division by ${m`k-1`} at each step, and no special case at ${m`k = 1`}, since from ${m`(0, 0, 0)`} the first value gives ${m`M_1 = x_1`} and ${m`S_1 = d_1 \cdot 0 = 0`}.` }),
        el('p', { html: `<strong>Physics reading</strong> (rigorous, same formula). With a unit mass at each ${m`x_i`}, ${m`S`} is the moment of inertia about the centre of mass, and the shift decomposition is Steiner's parallel-axis theorem. The merge of two summaries is two bodies joined, with reduced mass ${m`n_A n_B / n`}.` }),
      ]),
    ]),
  ]);
}

/* ---------- 2. E1: the mechanism, step by step ---------- */

/* the drawings keep a readable size on a phone: they scroll sideways in their own box */
const wide = (svg) => el('div', { class: 'scroll-x' }, [svg]);

const ticks = (lo, hi) => {
  const raw = (hi - lo) / 6, p = 10 ** Math.floor(Math.log10(raw)), step = [1, 2, 5, 10].map((m) => m * p).find((v) => v >= raw);
  const out = [];
  for (let t = Math.ceil(lo / step) * step; t <= hi + 1e-9; t += step) out.push(+t.toFixed(10));
  return out;
};

/** (a) The number line: old points, the new point, both means, and the three arrows. */
function numberLine(trace, k) {
  const r = trace[k - 1], W = 600, H = 162, padX = 30;
  const xs = trace.slice(0, k).map((t) => t.x).concat(r.prevMean, r.mean);
  let lo = Math.min(...xs), hi = Math.max(...xs);
  if (hi - lo < 1e-9) { lo -= 1; hi += 1; }
  const span = hi - lo; lo -= span * 0.08; hi += span * 0.08;
  const X = (v) => padX + ((v - lo) / (hi - lo)) * (W - 2 * padX);
  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', class: 'mech', 'aria-label': `number line at step ${k}: old mean ${sig(r.prevMean)}, new value ${sig(r.x)}, new mean ${sig(r.mean)}` });
  const axisY = 70;
  svg.append(s('line', { class: 'axis', x1: padX - 10, x2: W - padX + 10, y1: axisY, y2: axisY }));
  for (const t of ticks(lo, hi)) {
    svg.append(s('line', { class: 'axis', x1: X(t), x2: X(t), y1: axisY, y2: axisY + 4 }));
    svg.append(s('text', { class: 'tick', x: X(t), y: axisY + 16, 'text-anchor': 'middle' }, sig(t, 3)));
  }
  for (const t of trace.slice(0, k - 1)) svg.append(s('circle', { class: 'old', cx: X(t.x), cy: axisY, r: 4 }));
  svg.append(s('circle', { class: 'new', cx: X(r.x), cy: axisY, r: 6 }));
  const mark = (v, cls, label, y) => {
    svg.append(s('path', { class: cls, d: `M${X(v)} ${axisY + 2}l-5 9h10z` }));
    svg.append(lbl({ class: `lbl ${cls}`, x: X(v), y, 'text-anchor': 'middle' }, label));
  };
  const close = k > 1 && Math.abs(X(r.mean) - X(r.prevMean)) < 44;
  if (k > 1) mark(r.prevMean, 'oldmean', 'M_{k-1}', axisY + 30);
  mark(r.mean, 'newmean', 'M_k', axisY + (close ? 44 : 30));
  const arrow = (a, b, y, cls, label, below = false) => {
    if (Math.abs(X(b) - X(a)) < 2) return;
    const dir = Math.sign(X(b) - X(a));
    svg.append(s('path', { class: `arrow ${cls}`, d: `M${X(a)} ${y}H${X(b)}m${-6 * dir} -4l${6 * dir} 4l${-6 * dir} 4` }));
    svg.append(lbl({ class: `lbl ${cls}`, x: (X(a) + X(b)) / 2, y: below ? y + 16 : y - 6, 'text-anchor': 'middle' }, label));
  };
  arrow(r.prevMean, r.x, 22, 'd', `d = x_k - M_{k-1} = ${sig(r.d, 3)}`);
  arrow(r.mean, r.x, 50, 'nd', `x_k - M_k = \\frac{k-1}{k} d = ${sig(r.newDev, 3)}`);
  if (k > 1) arrow(r.prevMean, r.mean, 132, 'step', `\\text{the mean moves } \\frac{d}{k} = ${sig(r.d / k, 3)}`, true);
  return svg;
}

/** (b) The rectangle: the increment of S is old deviation × new deviation, inside the square d². */
function rectangle(r, k) {
  const W = 640, H = 250, side = 200, x0 = 80, y0 = 20;
  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', class: 'mech',
    'aria-label': `rectangle view at step ${k}: square d squared ${sig(r.d * r.d)}, increment ${sig(r.inc)}` });
  if (k === 1 || r.d === 0) {
    svg.append(lbl({ class: 'lbl', x: W / 2, y: H / 2, 'text-anchor': 'middle' },
      k === 1 ? '\\text{First value: } M_1 = x_1, \\; S_1 = d (x_1 - M_1) = 0. \\text{ Nothing to add yet.}' : 'd = 0\\text{: the value equals the old mean, so } S \\text{ does not change.}'));
    return svg;
  }
  const a = Math.abs(r.d), f = (k - 1) / k, own = f * side, strip = side / k;
  // the square d², dashed; inside it, along the bottom, the rectangle |d| × |x − M_k|
  svg.append(s('rect', { class: 'sq', x: x0, y: y0, width: side, height: side }));
  svg.append(s('rect', { class: 'own', x: x0, y: y0 + side - own, width: own, height: own }));
  svg.append(s('rect', { class: 'strip', x: x0 + own, y: y0 + side - own, width: strip, height: own }));
  svg.append(lbl({ class: 'lbl', x: x0 + side / 2, y: y0 + side + 16, 'text-anchor': 'middle' }, `|d| = ${sig(a, 3)}`));
  svg.append(lbl({ class: 'lbl', x: x0 - 6, y: y0 + side - own / 2, 'text-anchor': 'end' }, '|x_k - M_k|'));
  const L = x0 + side + 30;
  const line = (y, cls, text) => {
    if (cls) svg.append(s('rect', { class: cls, x: L, y: y - 10, width: 12, height: 12 }));
    svg.append(lbl({ class: 'lbl', x: L + (cls ? 18 : 0), y }, text));
  };
  line(y0 + 10, 'sq', `\\text{square } d^2 = ${sig(r.d * r.d, 4)}`);
  line(y0 + 40, 'own', `\\text{own square } (x_k - M_k)^2 = ${sig(r.newDev ** 2, 4)}`);
  line(y0 + 70, 'strip', `\\text{strip } (k-1)(M_k - M_{k-1})^2 = ${sig((k - 1) * (r.d / k) ** 2, 4)}`);
  line(y0 + 106, null, `\\text{increment of } S = d (x_k - M_k) = ${sig(r.inc, 4)}`);
  line(y0 + 126, null, `= \\frac{k-1}{k} d^2 = ${sig(f, 3)} \\cdot d^2`);
  line(y0 + 156, null, `\\text{not added: } \\frac{d^2}{k} = ${sig((r.d * r.d) / k, 4)} \\text{ (the top band)}`);
  return svg;
}

/** (c) S_k as a stack of the increments so far, against the final S. */
function stackBar(trace, k) {
  const W = 600, H = 56, x0 = 10, w = W - 20, total = Math.max(trace.at(-1).ss, 1e-12);
  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', class: 'mech', 'aria-label': `sum of squares after ${k} values: ${sig(trace[k - 1].ss)} of ${sig(total)}` });
  svg.append(s('rect', { class: 'track', x: x0, y: 8, width: w, height: 20 }));
  let at = 0;
  trace.slice(0, k).forEach((t, i) => {
    if (t.inc <= 0) return;
    const width = (t.inc / total) * w;
    svg.append(s('rect', { class: i === k - 1 ? 'seg cur' : `seg s${i % 2}`, x: x0 + at, y: 8, width, height: 20 }));
    if (width > 26 && i !== k - 1) svg.append(s('text', { class: 'tick', x: x0 + at + width / 2, y: 22, 'text-anchor': 'middle' }, `+${sig(t.inc, 2)}`));
    at += width;
  });
  svg.append(lbl({ class: 'lbl', x: x0, y: 46 }, `S_{${k}} = ${sig(trace[k - 1].ss, 5)} \\text{ after ${k} values (this step adds ${sig(trace[k - 1].inc, 4)}, in orange); full bar: the final } S = ${sig(total, 5)}`));
  return svg;
}

function e1(page, run, update) {
  const t = new TracedRunningStats();
  for (const v of page.vals) t.push(v);
  const trace = t.trace, k = page.k, r = trace[k - 1];
  const setVals = (vals) => update({ e1: vals.join(','), e1k: vals.length });
  const input = el('input', { type: 'number', class: 'num', step: 'any', 'aria-label': 'a value to add', placeholder: 'value' });
  const add = () => { const v = Number(input.value); if (input.value !== '' && Number.isFinite(v) && page.vals.length < 40) setVals([...page.vals, v]); };
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') add(); });
  const nextRandom = () => {
    if (page.vals.length >= 40) return;
    const v = +scoreOf(run).sample(stream(run.seed, ID.step, page.vals.length)).toFixed(2);
    setVals([...page.vals, v]);
  };
  const stepper = el('input', { type: 'range', min: 1, max: trace.length, step: 1, value: k, 'aria-label': 'step shown',
    oninput: (e) => update({ e1k: e.target.value }) });
  const cell = (v) => sig(v, 5);
  const rows = trace.map((q) => [String(q.k), cell(q.x), cell(q.d), cell(q.prevMean), cell(q.mean), cell(q.newDev), cell(q.inc), cell(q.ss), q.k > 1 ? cell(q.ss / (q.k - 1)) : '—']);
  const tbl = table([m`k`, m`x_k`, m`d_k = x_k - M_{k-1}`, m`M_{k-1}`, m`M_k`, m`x_k - M_k`, m`d_k (x_k - M_k)`, m`S_k`, m`s_k^2`], rows, 'trace');
  tbl.querySelectorAll?.('tbody tr')?.[k - 1]?.classList.add('sel');

  return el('div', { class: 'card lab' }, [
    el('h2', { text: 'E1 · The mechanism, one value at a time' }),
    el('p', { class: 'question', html: `What does one update of ${m`(k, M, S)`} do? Add values, then move the step slider to see any step: the mean moves ${m`1/k`} of the way towards the new value, and ${m`S`} grows by the product of the old deviation and the new one.` }),
    el('div', { class: 'row' }, [
      field('add a value', input), el('button', { type: 'button', text: 'Add', onclick: add }),
      el('button', { type: 'button', text: 'Next random score', onclick: nextRandom, title: 'a score from the dock\'s distribution, reproducible from the seed' }),
      el('div', { class: 'vrule' }),
      el('button', { type: 'button', text: 'Undo', disabled: page.vals.length <= 1, onclick: () => setVals(page.vals.slice(0, -1)) }),
      el('button', { type: 'button', text: 'Preset 2, 4, 4, 4, 5, 5, 7, 9', onclick: () => setVals(PRESET) }),
    ]),
    el('div', { class: 'row' }, [field(`step shown: k = ${k} of ${trace.length}`, stepper),
      el('span', { class: 'small muted', html: m`x_{${k}} = ${sig(r.x, 5)}, \quad M_{${k}} = ${sig(r.mean, 5)}, \quad S_{${k}} = ${sig(r.ss, 5)}${k > 1 ? `, \\quad s_{${k}}^2 = ${sig(r.ss / (k - 1), 5)}` : ''}` })]),
    ...section(1, 'The number line', `Grey: the values before step ${m`k`}; the large dot is ${m`x_k`}. The top arrow is the innovation ${m`d`}, measured from the OLD mean; the middle one is the new deviation ${m`x_k - M_k`}, measured from the NEW mean; the bottom one is how far the mean moved.`),
    wide(numberLine(trace, k)),
    ...section(2, 'The rectangle: old deviation × new deviation', `The increment of ${m`S`} is a rectangle with sides ${m`|d|`} and ${m`|x_k - M_k| = \frac{k-1}{k}|d|`}, inside the square ${m`d^2`}. It splits into the new point's own square and a strip: the extra spread of the ${m`k-1`} old points around the moved centre.`),
    wide(rectangle(r, k)),
    ...section(3, 'S as a stack of increments', `Each segment is one step's increment ${m`d_k (x_k - M_k) \ge 0`}; the current one is highlighted. ${m`S`} only ever grows.`),
    wide(stackBar(trace, k)),
    ...section(4, 'The trace', `Every step of the recurrence. With the preset the last row is ${m`M_8 = 5`}, ${m`S_8 = 32`}, ${m`s^2 = 32/7 = 4.5714`}, ${m`\mathrm{SS}/n = 4`}.`),
    tbl,
    explain([
      `The rectangle is the whole theorem in one picture. Its area is ${m`d_k (x_k - M_k) = \frac{k-1}{k} d_k^2`}, slightly less than the square ${m`d_k^2`}; the missing top band, ${m`d_k^2/k`}, is what the moving mean "absorbs". As ${m`k`} grows the rectangle fills the square (${m`\frac{k-1}{k} \to 1`}): one new point barely moves the centre, so almost all of its squared innovation is new spread.`,
      `The two pieces have a meaning. The own square ${m`(x_k - M_k)^2`} is the new point's contribution measured from the new centre. The strip ${m`(k-1)(M_k - M_{k-1})^2`} is the price paid by the ${m`k-1`} old points, which are now measured from a centre that moved by ${m`d_k/k`}. Their sum is the increment; nothing else changes, so nothing else needs recomputing.`,
      `Since every increment is ${m`\ge 0`}, ${m`S`} can never become negative in this recurrence, even with rounding. The textbook formula ${m`\sum x_i^2 - n\bar x^2`} has no such guarantee (E3).`,
    ]),
  ]);
}

/* ---------- 3. E2: running statistics of a long stream ---------- */

const cache = new Map();
const memo = (key, f) => { if (!cache.has(key)) cache.set(key, f()); return cache.get(key); };

function e2(page, run) {
  const d = scoreOf(run), K = page.K;
  const res = memo(`run|${JSON.stringify(run.spec)}|${K}|${run.seed}`, () => runningStream({ dist: run.spec, K, seed: run.seed }));
  const rows = res.rows, last = rows.at(-1);
  const zM = (last[1] - d.mean) / Math.sqrt(d.variance / K), zV = (last[3] - d.variance) / Math.sqrt(varS2(d, K));
  const x = { log: true, min: 1, max: K, title: 'k (values so far)' };
  const meanPlot = plot({
    x, y: { min: Math.max(d.support[0], d.mean - 3 * d.sd), max: Math.min(d.support[1], d.mean + 3 * d.sd), title: 'Mₖ and Mₖ ± sₖ' },
    layers: [
      { type: 'band', band: rows.filter((q) => q[0] > 1).map((q) => [q[0], q[1] - q[2], q[1] + q[2]]), color: SIM, label: 'Mₖ ± sₖ' },
      { type: 'hline', at: d.mean, color: THEORY, dash: false, text: 'μ', anchor: 'start' },
      { type: 'hline', at: d.mean + d.sd, color: THEORY, dash: '4 3', text: 'μ + σ', anchor: 'start' },
      { type: 'hline', at: d.mean - d.sd, color: THEORY, dash: '4 3', text: 'μ − σ', anchor: 'start' },
      { type: 'line', points: rows.map((q) => [q[0], q[1]]), color: SIM, label: 'running mean Mₖ' },
    ],
    label: `running mean and running mean plus or minus one running standard deviation, for ${K} scores, against mu and mu plus or minus sigma`,
  });
  const varPlot = plot({
    x, y: { min: 0, max: d.variance * 3, title: 'sₖ²' },
    layers: [
      { type: 'hline', at: d.variance, color: THEORY, dash: false, text: 'σ²', anchor: 'start' },
      { type: 'line', points: rows.filter((q) => q[0] > 1).map((q) => [q[0], q[3]]), color: SIM, label: 'running variance sₖ²' },
    ],
    label: `running sample variance for ${K} scores against sigma squared`,
  });
  return labPanel({
    hw: 'hw05', id: 'E2', title: 'E2 · Running statistics of one long stream',
    question: `Do the running mean and variance of one stream of ${d.label()} scores settle on μ and σ²?`,
    steps: [`draw K = ${nice(K)} scores one at a time (seed ${run.seed});`, `after each, update ${m`(k, M, S)`} with the three statements of the code panel;`, `plot ${m`M_k \pm s_k`} and ${m`s_k^2 = S_k/(k-1)`} against ${m`k`}, on a logarithmic axis.`],
    view: () => ({
      answer: { text: `After ${nice(K)} values ${m`M = ${sig(last[1])}`} (${m`\mu = ${sig(d.mean)}`}, ${m`z = ${zM.toFixed(2)}`} in units of ${m`\sigma/\sqrt{K}`}) and ${m`s^2 = ${sig(last[3])}`} (${m`\sigma^2 = ${sig(d.variance)}`}, ${m`z = ${zV.toFixed(2)}`} in units of ${m`\operatorname{SD}(s^2)`}): ${Math.abs(zM) <= 3 && Math.abs(zV) <= 3 ? 'both are where theory says they should be' : 'one of them is further than 3 standard errors from the truth: try another seed'}. Relative noise at this K: ${sig(100 * Math.sqrt(d.variance / K) / Math.abs(d.mean), 2)} % for the mean, ${sig(100 * Math.sqrt(varS2(d, K)) / d.variance, 2)} % for the variance.`, ok: Math.abs(zM) <= 3 && Math.abs(zV) <= 3 },
      body: [
        ...section(1, 'The running mean and its band', `Early values jump; later ones settle (the law of large numbers). The band ${m`M_k \pm s_k`} settles on ${m`\mu \pm \sigma`}.`),
        figure(meanPlot), el('div', { class: 'row end' }, [svgButton(meanPlot, 'hw05-E2-mean')]),
        ...section(2, 'The running variance', `Each point is ${m`S_k/(k-1)`} at that moment. Its noise shrinks like ${m`1/\sqrt{k}`} too, but from a larger start, set by the tails of the distribution (${m`\operatorname{Var}(s^2)`}, Effect of n page).`),
        figure(varPlot), el('div', { class: 'row end' }, [svgButton(varPlot, 'hw05-E2-var')]),
        legend([['line', SIM, 'running statistic'], ['band', SIM, 'Mₖ ± sₖ'], ['line', THEORY, 'μ, σ²'], ['dash', THEORY, 'μ ± σ']]),
      ],
      rows: rows.map(([k, m, sd, v]) => ({ k, mean: m, sd, variance: v })),
      summary: { K, seed: run.seed, distribution: d.label(), mean: last[1], variance: last[3], mu: d.mean, sigma2: d.variance },
    }),
    why: 'this is the bridge to Ex. 2: one stream converges to the truth, but slowly and noisily. How noisy one estimate at a fixed k is, and why averaging many of them works, is what the next pages measure.',
    notes: [
      'This is one stream, so the picture is one realisation: change the seed and the early wiggles change, the destination does not. The z-scores in the Result compare the final values with the truth in units of their own standard error, σ/√K for the mean and √Var(s²) for the variance.',
      'The memory used is three numbers whatever K is: the scores themselves are never stored. Only the points drawn here are kept, about 400 of them, log-spaced.',
    ],
  });
}

/* ---------- 4. E3: stability ---------- */

function fourTable(c) {
  const collapsed = [];
  const rowsFor = (name, round) => {
    const xs = storeAs(FOUR.map((v) => 10 ** c + v), round);
    const exact = exactVariance(xs);
    if (exact === 0) { collapsed.push(`${name}: all four values round to the same number, ${sig(xs[0], 10)}, so the stored data have no spread left to measure.`); return [name, '—', '—', '—', '0', '∞']; }
    const v = { naive: naiveVariance(xs, round), twoPass: twoPassVariance(xs, round), welford: welfordVariance(xs, round) };
    const cellFor = (x) => el('span', { class: x <= 0 && exact > 0 ? 'err' : Math.abs(x - exact) <= 1e-9 * Math.abs(exact) ? 'ok' : null, text: sig(x, 10) });
    return [name, cellFor(v.naive), cellFor(v.twoPass), cellFor(v.welford), sig(exact, 10), sig(conditionNumber(xs), 3)];
  };
  const rows = [rowsFor('binary64 (double)', PRECISION.binary64), rowsFor('binary32 (float)', PRECISION.binary32)];
  return el('div', {}, [
    table(['precision', `naive ${m`\frac{\sum x_i^2 - (\sum x_i)^2/n}{n-1}`}`, 'two-pass', 'Welford', 'exact (of the stored values)', m`K`], rows, 'stab'),
    ...collapsed.map((t) => el('p', { class: 'small muted', text: t })),
  ]);
}

function e3(page, run) {
  const sweep = memo(`sweep|${run.seed}`, () => stabilitySweep({ seed: run.seed }));
  const FLOOR = 1e-17, CAP = 1e4;
  const y = (v) => (v === 0 ? FLOOR : Math.min(CAP, v));
  const algos = [['naive', 'naive', 'var(--m2)'], ['twoPass', 'two-pass', 'var(--m1)'], ['welford', 'Welford', 'var(--m3)']];
  const layers = [];
  for (const [prec, dash] of [['binary64', false], ['binary32', '5 4']]) {
    for (const [key, name, color] of algos) {
      const pts = sweep.rows.filter((r) => r[prec].exact > 0).map((r) => [r.c, y(r[prec][key])]);
      layers.push({ type: 'line', points: pts, color, dash, label: `${name}, ${prec}`, end: `${name} ${prec === 'binary64' ? '64' : '32'}` });
    }
  }
  layers.push({ type: 'hline', at: 2 ** -53, color: MUTED, text: 'u = 2⁻⁵³ (double)' }, { type: 'hline', at: 2 ** -24, color: MUTED, text: 'u = 2⁻²⁴ (float)' });
  const errPlot = plot({
    x: { log: true, min: 1, max: 1e12, title: 'offset c (data = c + U(0, 1), n = 1 000)' },
    y: { log: true, min: FLOOR, max: CAP, title: 'relative error of s²' },
    width: 600, height: 300, layers,
    label: 'relative error of the sample variance against the offset c for the naive, two-pass and Welford algorithms in double and single precision',
  });
  const kPlot = plot({
    x: { log: true, min: 1, max: 1e12, title: 'offset c' },
    y: { log: true, title: 'K' }, width: 600, height: 150,
    layers: [{ type: 'line', points: sweep.rows.map((r) => [r.c, r.binary64.K]), color: 'var(--ink)', label: 'condition number K' }],
    label: 'condition number K of the data against the offset c',
  });
  const collapsed = sweep.rows.filter((r) => !(r.binary32.exact > 0)).map((r) => r.c);
  const at = (e) => sweep.rows.find((r) => r.e === e);
  const r8 = at(8), r4 = at(4);
  const tableHost = el('div', {}, [fourTable(page.c)]);
  onOffset = (v) => { tableHost.replaceChildren(fourTable(v)); setValue('welford', { ...page, c: v }); patchRef({ c: v }); };
  const naive9 = naiveVariance(FOUR.map((v) => 1e9 + v));
  return labPanel({
    hw: 'hw05', id: 'E3', title: 'E3 · Why bother: stability',
    question: 'Three formulas for the same sample variance: which ones still give the right answer when the data have a large common offset?',
    steps: ['the same data are processed by the naive one-pass formula, the two-pass formula and Welford\'s recurrence, every operation rounded to double (binary64) or float (binary32) precision;',
      'the exact variance of the stored values is computed with integer arithmetic (BigInt), so the error of each algorithm is known exactly;',
      '(a) the four numbers c + {4, 7, 13, 16}, whose variance is 30 for every c (move c in the dock); (b) 1 000 values c + U(0, 1) for c from 1 to 10¹².'],
    view: () => ({
      answer: { text: `At c = 10⁹ the naive formula returns ${sig(naive9, 8)} — a <strong>negative</strong> variance — where two-pass and Welford return 30. On 1 000 values at c = 10⁸ the naive relative error is ${sig(r8.binary64.naive, 2)}, Welford's ${sig(r8.binary64.welford, 2)}, two-pass ${sig(r8.binary64.twoPass, 2)}.`, ok: false },
      body: [
        ...section(1, 'Four numbers, one offset', 'Green: right to the digits shown; red: zero or negative, impossible for a variance. Drag c in the dock; the condition number K measures how much the offset dwarfs the spread.'),
        tableHost,
        ...section(2, 'The error grows with the offset', 'Each line is one algorithm in one precision (solid binary64, dashed binary32); an exact result (error 0) is drawn at 10⁻¹⁷, an error above 10⁴ at 10⁴. Below: the condition number K of the same data.'),
        figure(errPlot), figure(kPlot, `Seed ${run.seed}. ${collapsed.length ? `From c = 10${sup(Math.log10(collapsed[0]))} on, binary32 cannot tell the values apart at all (every c + U(0, 1) rounds to the same float), so there is no variance left to compute and those points are omitted.` : ''}`),
        el('div', { class: 'row end' }, [svgButton(errPlot, 'hw05-E3-error'), svgButton(kPlot, 'hw05-E3-K')]),
      ],
      rows: sweep.rows.flatMap((r) => ['binary64', 'binary32'].map((p) => ({ c: r.c, precision: p, K: r[p].K, exact: r[p].exact, naive: r[p].naive, twoPass: r[p].twoPass, welford: r[p].welford }))),
      summary: { n: sweep.n, seed: run.seed, at_c_1e4: r4.binary64, at_c_1e8: r8.binary64 },
    }),
    why: 'variances of large-offset data are everywhere in security: timestamps (seconds since 1970 ≈ 1.7·10⁹), byte counters, power traces with a DC offset. The textbook formula silently returns garbage there, even negative values that crash a square root.',
    notes: [
      `${evidenceHtml('T')} Why the naive formula fails: ${m`\sum x_i^2`} and ${m`(\sum x_i)^2/n`} are both about ${m`n(\bar x^2 + \sigma^2)`}, while their difference is about ${m`n\sigma^2`}. When ${m`\bar x \gg \sigma`} they agree in almost every digit, and the subtraction keeps only their rounding errors. At ${m`c = 10^9`} the two terms are about ${m`4 \cdot 10^{18}`}, each with a rounding error of a few hundred: the result is noise of that size, here −170.67.`,
      `${evidenceHtml('S')} The error grows roughly like ${m`n u K^2`} for the naive formula, ${m`n u K`} for Welford and ${m`n u`} for two-pass (Chan, Golub and LeVeque, 1983; Higham, ch. 1) — to be checked in the sources. The plot shows the slopes: naive climbs twice as steeply as Welford. Two-pass is the most accurate, as the notes say: Welford is stable, not optimal (trap T7).`,
      'Welford subtracts the running mean before multiplying, so it never forms the large squares. Two-pass subtracts the final mean, which is even better, but it needs the data twice, impossible on a stream that never ends.',
    ],
  });
}

/* ---------- 5. the code, on your data ---------- */

const JS = `class RunningStats {
  n = 0; mean = 0; ss = 0;

  push(x) {
    const d = x - this.mean;          // innovation: deviation from the OLD mean
    this.mean += d / ++this.n;        // Knuth: move 1/n of the way towards x
    this.ss += d * (x - this.mean);   // Welford: old deviation × new deviation
  }

  variance(ddof = 1) { return this.n - ddof > 0 ? this.ss / (this.n - ddof) : NaN; }
}`;
const C = `typedef struct { long n; double mean, ss; } stats;

static inline void push(stats *s, double x) {
    double d = x - s->mean;           /* innovation */
    s->mean += d / ++s->n;            /* Knuth */
    s->ss   += d * (x - s->mean);     /* Welford */
}
/* variance = s->ss / (s->n - 1) */`;

const USER_KEY = 'hw05.welford.data';
const f = (html) => el('span', { html });   // a table label holding a formula
function yourData() {
  const initial = load(USER_KEY, '1700000000.1 1700000000.4 1700000001.9 1700000000.7');
  const box = el('textarea', { rows: 3, 'aria-label': 'your numbers', placeholder: 'numbers separated by spaces, commas or new lines' }, [initial]);
  const out = el('div');
  const compute = (text) => {
    save(USER_KEY, text);
    const tokens = String(text).split(/[\s,;]+/).filter(Boolean);
    const st = new RunningStats(), xs = [];
    let bad = 0;
    for (const t of tokens) { const v = Number(t); if (pushChecked(st, v)) xs.push(v); else bad++; }
    if (st.n < 2) { out.replaceChildren(el('p', { class: 'small muted', text: 'Type at least two numbers.' })); return; }
    const exact = exactVariance(xs), naive = naiveVariance(xs), two = twoPassVariance(xs);
    out.replaceChildren(table(['', 'value'], [
      [f(m`n`), nice(st.n)], [f(`mean ${m`M`}`), String(st.mean)], [f(`${m`S`} (sum of squares)`), sig(st.ss, 10)],
      [f(`${m`s^2 = S/(n-1)`}, Welford`), sig(st.variance(1), 10)], [f(m`\mathrm{SS}/n`), sig(st.variance(0), 10)],
      [f(`${m`s^2`} by the naive formula`), el('span', { class: naive <= 0 ? 'err' : null, text: sig(naive, 10) })],
      [f(`${m`s^2`} by two-pass`), sig(two, 10)], [f(`${m`s^2`} exact (BigInt)`), sig(exact, 10)],
      ['relative error: naive · Welford · two-pass', `${sig(relativeError(naive, exact), 2)} · ${sig(relativeError(st.variance(1), exact), 2)} · ${sig(relativeError(two, exact), 2)}`],
    ]), ...(bad ? [el('p', { class: 'small err', text: `${bad} entr${bad === 1 ? 'y was' : 'ies were'} not a finite number and ${bad === 1 ? 'was' : 'were'} skipped (the check sits outside the 3-line core).` })] : []));
  };
  box.addEventListener('input', (e) => compute(e.target.value));
  compute(initial);
  return [box, out];
}

function code() {
  return el('div', { class: 'card' }, [
    el('h2', { text: 'The code: three statements' }),
    el('h3', { class: 'panel-title', text: 'JavaScript (hw05/js/core/running.js)' }), el('pre', { class: 'code', text: JS }),
    el('h3', { class: 'panel-title', text: 'C (shown, not compiled here)' }), el('pre', { class: 'code', text: C }),
    el('ol', { class: 'small' }, [
      el('li', { html: '<code>d = x − mean</code>: the innovation, measured from the <em>old</em> mean, before anything changes.' }),
      el('li', { html: '<code>mean += d / ++n</code>: count the value, then move the mean 1/n of the way towards it (Knuth).' }),
      el('li', { html: '<code>ss += d * (x − mean)</code>: <code>mean</code> is now the <em>new</em> mean, so this is old deviation × new deviation (Welford). Never negative.' }),
    ]),
    el('p', { class: 'small muted', html: 'No branch for the first value: from (0, 0, 0) it gives mean = x, ss = d·0 = 0. Validation (is x a finite number?) is a wrapper, <code>pushChecked</code>, so the core stays the three lines of the derivation.' }),
    el('h3', { class: 'panel-title', text: 'Run it on your data' }),
    el('p', { class: 'small muted', html: 'The default is four Unix timestamps around 1.7·10⁹ seconds: a realistic large offset. Kept in this browser only.' }),
    ...yourData(),
  ]);
}

/* ---------- 6. efficiency ---------- */

let bench = null;   // the last benchmark, kept across redraws

/* plain loops for the timing (no rounding hook, no checks), so the three are compared fairly;
   Welford is the real RunningStats.push of the core */
function naivePlain(xs) {
  let s = 0, q = 0;
  for (let i = 0; i < xs.length; i++) { s += xs[i]; q += xs[i] * xs[i]; }
  return (q - (s * s) / xs.length) / (xs.length - 1);
}
function twoPassPlain(xs) {
  let s = 0;
  for (let i = 0; i < xs.length; i++) s += xs[i];
  const m = s / xs.length;
  let ss = 0;
  for (let i = 0; i < xs.length; i++) ss += (xs[i] - m) ** 2;
  return ss / (xs.length - 1);
}
function runBench(run, host) {
  host.replaceChildren(el('p', { class: 'small muted', text: 'Running: 5 × 3 passes over 10⁶ values…' }));
  setTimeout(() => {
    const rng = stream(run.seed, ID.bench), d = scoreOf(run), N = 1e6;
    const xs = Float64Array.from({ length: N }, () => d.sample(rng));
    const time = (f) => { const t = []; for (let i = 0; i < 5; i++) { const t0 = performance.now(); f(); t.push(performance.now() - t0); } return t.sort((a, b) => a - b)[2]; };
    bench = {
      N, welford: time(() => RunningStats.fromArray(xs).variance()), naive: time(() => naivePlain(xs)), twoPass: time(() => twoPassPlain(xs)),
    };
    host.replaceChildren(benchTable());
  }, 30);
}
const benchTable = () => table(['algorithm', 'median time for 10⁶ values', 'values per second'],
  [['Welford', 'welford'], ['naive one-pass', 'naive'], ['two-pass', 'twoPass']].map(([name, k]) => [name, `${bench[k].toFixed(1)} ms`, nice(Math.round(bench.N / (bench[k] / 1000)))]));

function efficiency(run) {
  const rows = [
    ['passes over the data', '1', '2', '<strong>1</strong>'],
    ['memory', 'O(1)', 'O(n), or re-read the data', '<strong>O(1)</strong>: three numbers'],
    ['work per value', '2 adds, 1 mul', '2 subs/adds, 1 mul (over 2 passes)', '3 add/sub, 1 div, 1 mul'],
    ['numerically stable', `<strong>no</strong> (error ${m`\sim n u K^2`})`, `yes, the best (${m`\sim n u`})`, `yes (${m`\sim n u K`})`],
    ['streaming / unending data', 'yes', 'no', '<strong>yes</strong>'],
    ['variance available at any time', 'yes (unstable)', 'no', '<strong>yes</strong>'],
    ['mergeable across machines', 'yes (unstable)', 'no', '<strong>yes</strong> (Chan)'],
  ];
  const host = el('div', {}, [bench ? benchTable() : el('p', { class: 'small muted', text: 'Not run yet.' })]);
  return el('div', { class: 'card' }, [
    el('h2', { text: 'Computational efficiency' }),
    el('div', { class: 'scroll-x' }, [el('table', { class: 'data prose' }, [
      el('thead', {}, [el('tr', {}, ['', 'naive one-pass', 'two-pass', 'Welford'].map((h, i) => el('th', { class: i ? null : 'left', text: h })))]),
      el('tbody', {}, rows.map((r) => el('tr', {}, r.map((t, i) => el('td', { class: i ? null : 'left', html: t }))))),
    ])]),
    el('ol', {}, [
      el('li', { html: '<strong>One pass, O(1) memory.</strong> It works on streams that never end (logs, network traffic, sensor data) and on data too large to store. The raw data never need to be kept, which is also good for privacy.' }),
      el('li', { html: '<strong>O(n) time with a constant of a few flops</strong>, the same asymptotic cost as summing. The one division per value can become a multiplication by a tabulated 1/k.' }),
      el('li', { html: `<strong>Stable:</strong> subtracting the running mean before squaring avoids the cancellation of ${m`\sum x_i^2 - n\bar x^2`} (E3).` }),
      el('li', { html: `<strong>Honest caveat</strong> ${evidenceHtml('T')}: when the data can be read twice, two-pass is more accurate. Welford's advantage is the combination: one pass, constant memory, stability and mergeability.` }),
    ]),
    el('h3', { class: 'panel-title', text: 'Micro-benchmark' }),
    el('p', { class: 'small muted', text: 'Median of 5 runs over the same 10⁶ scores, in this browser\'s main thread (naive and two-pass as plain loops, Welford as the real RunningStats.push). Timings depend on the machine and the JavaScript engine. Expect Welford to be the slowest per value, by a few times: it does one division per value, and each step must wait for the previous mean. That is a constant factor on an O(n) job, still tens of millions of values per second; what it buys is stability, a single pass and three numbers of memory.' }),
    el('div', { class: 'row' }, [el('button', { type: 'button', text: bench ? 'Run again' : 'Run the benchmark', onclick: () => runBench(run, host) })]),
    host,
  ]);
}

let patchRef = () => {};

startPage({
  shell: hw05Shell('welford.html'),
  sticky: STICKY,
  memory: MEMORY,
  preserve: true,
  render: ({ state, update, patch }) => {
    patchRef = patch;
    const run = readInputs(state), page = readPage(state);
    dock(run, update, PAGE, page);
    if (run.error) return [rejected(run.error)];
    return [derivation(), e1(page, run, update), e2(page, run), e3(page, run), code(), efficiency(run)];
  },
});
