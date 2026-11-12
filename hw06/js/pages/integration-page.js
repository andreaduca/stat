/* integration-page.js — Ex. 1: the same integrals cut two ways. E1 draws Riemann's
   rectangles and Lebesgue's slabs side by side (hover a slab, or move the level
   slider, to see its preimage) with the distribution function under them; E2 the
   convergence of every rule with fitted slopes and the limit-agreement table; E3
   error against cost; E4 the coins: a grid-count layer cake is the midpoint sum
   sorted. The numbers come from the worker; this file only draws. */

import { el, field } from '../../../assets/js/ui/dom.js';
import { startPage } from '../../../assets/js/ui/page.js';
import { labPanel, section, table } from '../../../assets/js/ui/lab.js';
import { plot, curve } from '../../../assets/js/ui/plot.js';
import { nice, sig } from '../../../assets/js/ui/format.js';
import { m, M } from '../../../assets/js/ui/math.js';
import { show, onCommit } from '../../../assets/js/ui/dock.js';
import { FUNCTIONS, FUNCTION_IDS } from '../core/functions.js';
import { RULES } from '../core/riemann.js';
import { AnalyticMeasure, RootFindingMeasure, MonteCarloMeasure, GridCountMeasure, layerCakeExact } from '../core/lebesgue.js';
import { muSinInv } from '../core/functions.js';
import { PROVIDERS, stream, ID } from '../core/experiments.js';
import { readInputs, readIntegration, dock, rejected } from './inputs.js';
import { RIEMANN, LEBESGUE, REF, MUTED, legend, figure, svgButton, evidenceHtml, getRun, pending, updatingFlag, abstract, anchor } from './widgets.js';
import { hw06Shell, STICKY, MEMORY } from './shell.js';

/* ---------- names, choices, and this page's row in the dock ---------- */

/** Plain names for the picker (option text cannot hold MathML). */
const PLAIN = {
  f1: 'f1 · sin x on [0, π]', f2: 'f2 · x² on [0, 1]', f3: 'f3 · step 1 → 3 at ½', f3p: 'f3′ · step 1 → 3 at 1/√2',
  f4: 'f4 · |x − ½|', f5: 'f5 · 1/√x on (0, 1]', f6: 'f6 · indicator of [0, ½)', f7: 'f7 · sin x / x on [0, π]',
  f8: 'f8 · sin(1/x) on (0, 1]', P3: 'P3 · fat Cantor indicator', P5: 'P5 · Cantor function',
};
const RULE_IDS = Object.keys(RULES), PROVIDER_IDS = Object.keys(PROVIDERS);
/** Where λ{f > t} has a square-root cusp: the critical values of f (f′ = 0 at an interior max/min or at a flat end). */
const CUSPS = { f1: [1], f2: [0], f7: [1], f8: [-1, 1] };

function readPage(state) {
  const rule = RULE_IDS.includes(state.rule) ? state.rule : 'midpoint';
  const mp = PROVIDER_IDS.includes(state.mp) ? state.mp : 'analytic';
  return { rule, mp };
}

const OWN = {
  id: 'integration', label: 'this page',
  build(apply, later) {
    const f = el('select', { 'aria-label': 'function', onchange: (e) => apply({ f: e.target.value }) },
      FUNCTION_IDS.map((id) => el('option', { value: id, text: PLAIN[id] })));
    const N = el('input', { type: 'number', class: 'num', min: 2, max: 100000, 'aria-label': 'Riemann cells N' });
    const K = el('input', { type: 'number', class: 'num', min: 2, max: 100000, 'aria-label': 'Lebesgue levels K' });
    onCommit(N, () => apply({ N: N.value }), later);
    onCommit(K, () => apply({ K: K.value }), later);
    const rule = el('select', { 'aria-label': 'Riemann rule', onchange: (e) => apply({ rule: e.target.value }) },
      RULE_IDS.map((id) => el('option', { value: id, text: RULES[id].label })));
    const mp = el('select', { 'aria-label': 'measure provider', onchange: (e) => apply({ mp: e.target.value }) },
      PROVIDER_IDS.map((id) => el('option', { value: id, text: PROVIDERS[id].label })));
    return {
      nodes: [el('div', { class: 'row' }, [
        field('function', f), el('span', { class: 'vrule' }),
        field('Riemann: rule', rule), field('cells N', N), el('span', { class: 'vrule' }),
        field('Lebesgue: measure', mp), field('levels K', K),
      ])],
      refresh(v) { show(f, v.f); show(N, v.N); show(K, v.K); show(rule, v.rule); show(mp, v.mp); },
    };
  },
  summary: (v) => `${v.f === 'f3p' ? 'f3′' : v.f} · ${RULES[v.rule].label} N = ${nice(v.N)} · ${PROVIDERS[v.mp].label.split(' (')[0]} K = ${nice(v.K)}`,
  notes: [
    '<strong>function</strong>: the integrand of E1–E4. Each one is in the collection for a reason, given under E1.',
    '<strong>rule, N</strong>: how Riemann cuts the domain: N equal cells, one height per cell (left end, right end, midpoint), or a straight line (trapezoid) or parabola (Simpson) through the cell ends.',
    '<strong>measure, K</strong>: how Lebesgue cuts the range: K equal levels between the minimum and the maximum of f, and how the measure of each preimage λ{f > t} is obtained — from a formula (analytic), by solving f(x) = t on each monotone piece (root finding, paid in evaluations of f), from N random points (Monte Carlo), or by counting the N grid midpoints (grid count: the one that turns out to be a Riemann sum in disguise, E4).',
  ],
};

/* ---------- formats ---------- */

const e2s = (x, d = 2) => (x === 0 ? '0' : x.toExponential(d));
const tag = (id) => (id === 'f3p' ? 'f3′' : id);
const ms = (t) => (t < 0.1 ? `${Math.round(t * 1000)} µs` : `${t.toFixed(2)} ms`);

/* ---------- drawing helpers ---------- */

/** The view of f: the y-range drawn (f5 is clipped at 6) and the plain-text title. */
function view(fn) {
  const [lo, hi] = fn.range, top = Number.isFinite(hi) ? hi : 6, span = top - Math.min(lo, 0);
  return { y0: Math.min(lo, 0) - 0.14 * span, y1: top + 0.05 * span, bar: Math.min(lo, 0) - 0.07 * span, top, clipped: !Number.isFinite(hi) };
}

/** Points of f for drawing (uncounted), with the singular end left out. */
const fPoints = (fn, n = 600) => curve(fn.f, fn.open.a ? fn.a + (fn.b - fn.a) / (4 * n) : fn.a, fn.b, n)
  .map(([x, y]) => [x, Math.max(-1e3, Math.min(1e3, y))]);

/** The intervals of {f > t}, located on a grid of n cells (for drawing only: the
 *  measures in the numbers come from the chosen provider, not from this). */
function preimage(fn, t, n = 1500) {
  const h = (fn.b - fn.a) / n, out = [];
  let start = null;
  for (let i = 0; i < n; i++) {
    const above = fn.f(fn.a + (i + 0.5) * h) > t;
    if (above && start === null) start = fn.a + i * h;
    if (!above && start !== null) { out.push([start, fn.a + i * h]); start = null; }
  }
  if (start !== null) out.push([start, fn.b]);
  return out;
}

/** Screen scales of a plot() chart, read from its frame lines (so that an overlay
 *  can be drawn and the pointer mapped back to data coordinates). */
function frameScale(chart, x0, x1, y0, y1) {
  const lines = typeof chart.querySelectorAll === 'function' ? [...chart.querySelectorAll('line.frame')] : [];
  if (lines.length < 2) return null;                   // no layout to read (a DOM without SVG, as in tools/check.mjs)
  const [vert, horiz] = lines;
  const L = +vert.getAttribute('x1'), T = +vert.getAttribute('y1'), B = +vert.getAttribute('y2'), R = +horiz.getAttribute('x2');
  return {
    X: (v) => L + ((v - x0) / (x1 - x0)) * (R - L),
    Y: (v) => B - ((v - y0) / (y1 - y0)) * (B - T),
    invY: (py) => y0 + ((B - py) / (B - T)) * (y1 - y0),
    L, R, T, B,
  };
}

const SVGNS = 'http://www.w3.org/2000/svg';
const svgEl = (tag, attrs) => { const n = document.createElementNS(SVGNS, tag); for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v); return n; };

/** A measure provider for the page's own drawing and readouts (main thread). */
function provider(fn, mp, N, seed) {
  if (!PROVIDERS[mp].needs(fn)) return null;
  if (mp === 'analytic') return fn.id === 'f8' ? { mu: (t) => muSinInv(t, 3000), name: 'analytic' } : new AnalyticMeasure(fn);
  if (mp === 'root') return new RootFindingMeasure(fn);
  if (mp === 'mc') return new MonteCarloMeasure(fn, stream(seed, ID.measureMC), Math.min(N, 100000));
  return new GridCountMeasure(fn, Math.min(N, 100000));
}

/* ---------- the theory card: two cuts, their errors, the collection ---------- */

/** One phrase per integrand: what it tests (the theory card's last column). */
const ROLE = {
  f1: 'smooth, flat top', f2: 'flat at 0; Simpson exact', f3: 'jump on the grid', f3p: 'jump off the grid',
  f4: 'kink; linear λ{f > t}', f5: 'unbounded at 0', f6: 'indicator (simple function)', f7: 'preimage needs root finding',
  f8: 'infinitely many oscillations', P3: 'not Riemann integrable', P5: 'flat almost everywhere',
};
const DOMAIN = { f5: '(0, 1]', f8: '(0, 1]' };
const html = (s) => el('span', { html: s });

function theory(sel) {
  const rules = [
    ['left, right', m`O(1/N)`, 'slopes, jumps'],
    ['midpoint, trapezoid', m`O(1/N^2)`, 'jumps, singularities'],
    ['Simpson', m`O(1/N^4)`, 'jumps, singularities'],
    ['lower sum', m`O(1/K)`, '—'],
    ['layer cake', m`O(1/K^2)`, `flat parts of f: ${m`K^{-3/2}`}`],
  ];
  const fns = FUNCTION_IDS.map((id) => {
    const g = FUNCTIONS[id];
    return [`${id === sel.f ? '▶ ' : ''}${tag(id)}`, html(`${m`${g.label}`} <span class="muted">on ${DOMAIN[id] ?? (g.b === Math.PI ? '[0, π]' : '[0, 1]')}</span>`), sig(g.exact, 10), ROLE[id]];
  });
  return el('div', { class: 'card' }, [
    el('h2', { text: 'Two cuts, one integral' }),
    el('div', { class: 'cols' }, [
      el('div', {}, [
        el('h3', { class: 'panel-title', text: 'Riemann: cut the domain into N cells' }),
        el('div', { html: M`\int_a^b f \approx \sum_{i=1}^{N} f(\xi_i)\,h, \qquad h = \frac{b-a}{N}` }),
        el('p', { class: 'small muted', text: 'One height per cell, times its width. Needs: values of f.' }),
      ]),
      el('div', {}, [
        el('h3', { class: 'panel-title', text: 'Lebesgue: cut the range into K levels' }),
        el('div', { html: M`\int_\Omega f = m\,\lambda(\Omega) + \int_m^M \lambda\{f > t\}\,dt` }),
        el('p', { class: 'small muted', html: `The layer cake: one measure per level, times its thickness. Needs: the measure of each preimage ${m`\lambda\{f > t\}`}, from a formula, by root finding, or by sampling.` }),
      ]),
    ]),
    el('div', { class: 'cols' }, [
      el('div', {}, [el('h3', { class: 'panel-title', text: 'Error for a smooth f' }),
        table(['rule', 'error', 'suffers at'], rules.map(([a, b, c]) => [a, html(b), html(c)]), 'prose words')]),
      el('div', {}, [el('h3', { class: 'panel-title', text: 'Three ways to measure a preimage' }),
        el('ul', {}, [
          el('li', { html: '<strong>analytic</strong>: invert f by hand (free, but needs a formula);' }),
          el('li', { html: `<strong>root finding</strong>: solve ${m`f(x) = t`} on each monotone piece (costs evaluations of f);` }),
          el('li', { html: '<strong>Monte Carlo</strong>: the fraction of random points above t (costs noise).' }),
        ]),
        el('p', { class: 'small muted', text: 'Counting grid points looks like a fourth way, but gives back a Riemann sum (E4).' })]),
    ]),
    el('h3', { class: 'panel-title', text: 'The functions (▶ = chosen in the dock)' }),
    table(['', 'f', 'exact integral', 'what it tests'], fns, 'prose words'),
  ]);
}

/* ---------- E1 · two cuts ---------- */

let e1Level = null;   // the highlighted level (index into the drawn slabs), kept across redraws

function riemannChart(fn, rule, N, v) {
  const n = Math.min(N, 100), h = (fn.b - fn.a) / n, layers = [];
  if (rule === 'trapezoid' || rule === 'simpson') {
    // the interpolant the rule integrates: straight lines, or parabolas through each pair of cells
    const pts = [];
    if (rule === 'trapezoid') for (let i = 0; i <= n; i++) pts.push([fn.a + i * h, fn.f(fn.a + i * h)]);
    else {
      const nn = n % 2 ? n + 1 : n, hh = (fn.b - fn.a) / nn;
      for (let i = 0; i < nn; i += 2) {
        const xa = fn.a + i * hh, ya = fn.f(xa), yb = fn.f(xa + hh), yc = fn.f(xa + 2 * hh);
        for (let s = 0; s <= 8; s++) { const u = s / 4; pts.push([xa + u * hh, ya * (u - 1) * (u - 2) / 2 - yb * u * (u - 2) + yc * u * (u - 1) / 2]); }
      }
    }
    const clip = (y) => Math.max(v.y0, Math.min(v.y1, y));
    layers.push({ type: 'band', band: pts.filter(([, y]) => Number.isFinite(y)).map(([x, y]) => [x, 0, clip(y)]), color: RIEMANN },
      { type: 'line', points: pts, color: RIEMANN, thin: true, hover: false });
  } else {
    const tag = rule === 'left' ? 0 : rule === 'right' ? 1 : 0.5, band = [];
    for (let i = 0; i < n; i++) {
      const x0 = fn.a + i * h, y = Math.max(v.y0, Math.min(v.y1, fn.f(x0 + tag * h)));
      band.push([x0, 0, Number.isFinite(y) ? y : v.y1], [x0 + h, 0, Number.isFinite(y) ? y : v.y1]);
    }
    layers.push({ type: 'band', band, color: RIEMANN });
    // the edges of every rectangle, as one path, so that N cells read as N cells
    const edges = [];
    for (let i = 0; i < n; i++) {
      const x0 = fn.a + i * h, raw = fn.f(x0 + tag * h), y = Number.isFinite(raw) ? Math.max(v.y0, Math.min(v.y1, raw)) : v.y1;
      edges.push([x0, 0], [x0, y], [x0 + h, y], [x0 + h, 0]);
    }
    layers.push({ type: 'line', points: edges, color: RIEMANN, thin: true, hover: false });
  }
  layers.push({ type: 'line', points: fPoints(fn), color: REF, hover: false });
  return plot({
    x: { min: fn.a, max: fn.b, title: 'x' }, y: { min: v.y0, max: v.y1, title: 'f(x)' }, width: 420, height: 270, layers,
    label: `the function with the ${RULES[rule].label} rule on ${n} cells: the domain is cut into equal pieces`,
  });
}

/** The Lebesgue panel: slabs (midpoint levels of the layer cake), with an overlay that
 *  highlights one slab and its preimage, driven by the pointer or by the level slider. */
function lebesgueChart(fn, K, v, P, readout) {
  const [m0] = fn.range, k = Math.min(K, 40), d = (v.top - m0) / k, layers = [];
  if (m0 > 0) layers.push({ type: 'band', band: [[fn.a, 0, m0], [fn.b, 0, m0]], color: LEBESGUE });   // the base m·λ(Ω)
  const slabs = [];
  for (let j = 0; j < k; j++) {
    const t = m0 + (j + 0.5) * d, lo = m0 + j * d, hi = lo + d, iv = preimage(fn, t);
    slabs.push({ t, lo, hi, iv });
    for (const [a, b] of iv) layers.push({ type: 'band', band: [[a, lo, hi], [b, lo, hi]], color: LEBESGUE },
      { type: 'line', points: [[a, lo], [a, hi], [b, hi], [b, lo], [a, lo]], color: LEBESGUE, thin: true, hover: false });
  }
  layers.push({ type: 'line', points: fPoints(fn), color: REF, hover: false });
  const chart = plot({
    x: { min: fn.a, max: fn.b, title: 'x' }, y: { min: v.y0, max: v.y1, title: 'f(x)' }, width: 420, height: 270, layers,
    label: `the function with ${k} horizontal slabs: the range is cut into levels; each slab is as wide as the set where f exceeds its level`,
  });
  const svg = chart.querySelector?.('svg'), sc = frameScale(chart, fn.a, fn.b, v.y0, v.y1);
  const g = sc ? svgEl('g', { class: 'overlay', 'pointer-events': 'none' }) : null;
  if (g) svg.append(g);
  const slider = el('input', { type: 'range', min: 0, max: k - 1, step: 1, 'aria-label': 'level shown',
    oninput: (e) => highlight(Number(e.target.value)) });
  function highlight(j) {
    j = Math.max(0, Math.min(k - 1, j));
    e1Level = j; slider.value = String(j);
    const s = slabs[j];
    if (g) g.replaceChildren();
    if (g) for (const [a, b] of s.iv) {
      g.append(svgEl('rect', { x: sc.X(a), y: sc.Y(s.hi), width: Math.max(1, sc.X(b) - sc.X(a)), height: sc.Y(s.lo) - sc.Y(s.hi), fill: 'none', stroke: 'var(--ink)', 'stroke-width': 1.5 }));
      g.append(svgEl('rect', { x: sc.X(a), y: sc.Y(v.bar) - 3, width: Math.max(1.5, sc.X(b) - sc.X(a)), height: 6, fill: LEBESGUE }));
    }
    if (g) g.append(svgEl('line', { x1: sc.L, x2: sc.R, y1: sc.Y(s.t), y2: sc.Y(s.t), stroke: 'var(--ink)', 'stroke-dasharray': '3 3', 'stroke-width': 1 }));
    const mu = P ? P.mu(s.t) : null;
    readout.innerHTML = `level ${m`t = ${sig(s.t, 4)}`}: preimage ${m`\{x : f(x) > t\}`} = ${s.iv.length > 6 ? `${s.iv.length} intervals` : s.iv.map(([a, b]) => `(${sig(a, 3)}, ${sig(b, 3)})`).join(' ∪ ')}, `
      + `${m`\lambda = ${mu === null ? '—' : sig(mu, 6)}`} <span class="muted">(${P ? P.name : 'no provider'}; the intervals drawn are located on a 1 500-point grid)</span>`;
  }
  if (sc) svg.addEventListener('pointermove', (e) => {
    const box = svg.getBoundingClientRect(), vb = svg.viewBox.baseVal;
    const py = ((e.clientY - box.top) / box.height) * vb.height, t = sc.invY(py);
    if (t >= m0 && t <= v.top) highlight(Math.floor((t - m0) / d));
  });
  highlight(e1Level ?? Math.floor(k / 2));
  return { chart, slider, k };
}

/** The distribution function t ↦ λ{f > t}; the shaded area under it is ∫f (minus the base m·λ(Ω)). */
function distributionChart(fn, P) {
  const [m0] = fn.range, top = Number.isFinite(fn.range[1]) ? fn.range[1] : 6;
  const mu = (t) => (fn.id === 'f8' ? muSinInv(t, 3000) : fn.muGt(t));
  const pts = curve(mu, m0, top, 300);
  const cusps = (CUSPS[fn.id] ?? []).map((c) => ({ type: 'vline', at: c, color: MUTED }));
  return plot({
    x: { min: m0, max: top, title: 't (level)' }, y: { min: 0, max: fn.length * 1.08, title: 'λ{f > t}' }, width: 640, height: 220,
    layers: [
      { type: 'band', band: pts.map(([t, y]) => [t, 0, y]), color: LEBESGUE },
      { type: 'line', points: pts, color: LEBESGUE, label: 'λ{f > t}' },
      ...cusps,
    ],
    label: 'the distribution function of f: the measure of the set where f exceeds each level; the shaded area is the integral',
  });
}

function e1(sel, page, inputs, redraw) {
  const fn = FUNCTIONS[sel.f], v = view(fn);
  const spec = { kind: 'e1', args: { fid: sel.f, rule: page.rule, N: sel.N, K: sel.K, provider: page.mp, seed: inputs.seed } };
  const got = getRun(spec, redraw, 'E1');
  const P = provider(fn, page.mp, sel.N, inputs.seed);
  const readout = el('p', { class: 'small' });
  const left = riemannChart(fn, page.rule, sel.N, v);
  const right = lebesgueChart(fn, sel.K, v, P, readout);
  const coarse = sel.N > 100 || sel.K > 40;
  return labPanel({
    hw: 'hw06', id: 'E1', title: 'E1 · Two cuts of the same area', name: `E1-${sel.f}-${page.rule}${sel.N}-${page.mp}${sel.K}`,
    question: `Riemann and Lebesgue both compute ${m`\int f`} for ${m`f(x) = ${fn.label}`}. How close does each get, and at what cost?`,
    steps: [
      `Riemann: ${m`N = ${nice(sel.N)}`} cells, ${RULES[page.rule].label} rule;`,
      `Lebesgue: ${m`K = ${nice(sel.K)}`} levels, preimages measured by ${PROVIDERS[page.mp].label};`,
      'compare both with the exact value, counting the evaluations of f.',
    ],
    flag: updatingFlag(got), waiting: got.result ? null : pending(got, spec, redraw),
    view: () => {
      const r = got.result, ex = fn.exact;
      const row = (name, x, note) => (x && x.value !== undefined
        ? [name, sig(x.value, 12), e2s(Math.abs(x.value - ex)), nice(x.evals), ms(x.ms)]
        : [name, '—', '—', '—', note ?? r.note ?? '']);
      const rows = [
        row(`Riemann, ${RULES[page.rule].label}`, r.riemann, r.riemann?.note),
        Number.isFinite(fn.range[1]) ? row('Lebesgue, lower sum', r.lower) : null,
        row('Lebesgue, layer cake', r.cake),
      ].filter(Boolean);
      const er = r.riemann?.value !== undefined ? Math.abs(r.riemann.value - ex) : null, ec = r.cake ? Math.abs(r.cake.value - ex) : null;
      const answer = er !== null && ec !== null
        ? `<strong>Riemann</strong> is off by <strong>${e2s(er)}</strong> after ${nice(r.riemann.evals)} evaluations of f; <strong>Lebesgue</strong> (layer cake) by <strong>${e2s(ec)}</strong> after ${nice(r.cake.evals)}.`
        : [r.riemann?.note ? `The ${RULES[page.rule].label} rule cannot run here: ${r.riemann.note}.` : '', r.note ? `This measure is not available here: ${r.note}.` : ''].join(' ');
      return {
        answer: { text: answer },
        body: [
          ...section(1, 'The two pictures', `Hover a slab (or use the slider) to see its preimage under the axis.${coarse ? ' Drawn with at most 100 cells and 40 levels; the numbers use the real N and K.' : ''}${v.clipped ? ' f5 is cut at height 6 in the picture.' : ''}`),
          el('div', { class: 'cols' }, [
            el('div', {}, [el('h3', { class: 'panel-title', text: 'Riemann: cut the domain' }), left, el('div', { class: 'row' }, [svgButton(left, `hw06-E1-riemann-${sel.f}`)])]),
            el('div', {}, [el('h3', { class: 'panel-title', text: 'Lebesgue: cut the range' }), right.chart,
              el('div', { class: 'row' }, [field('level shown', right.slider), svgButton(right.chart, `hw06-E1-lebesgue-${sel.f}`)]), readout]),
          ]),
          legend([['band', RIEMANN, 'Riemann cells'], ['band', LEBESGUE, 'Lebesgue slabs and preimage'], ['line', REF, 'f']]),
          ...section(2, 'The distribution function', `How much of the domain lies above each level. The shaded area plus ${m`m\,\lambda(\Omega)`} is the integral.${CUSPS[fn.id] ? ' The dashed line marks a critical value of f: the curve is vertical there (a square-root cusp), which slows the layer cake (E2).' : ''}`),
          figure(distributionChart(fn, P)),
          ...section(3, 'The numbers', `Exact value ${m`${sig(ex, 15)}`}.${r.cakeNote ? ` Layer cake: ${r.cakeNote}.` : ''}`),
          table(['', 'value', '|error|', 'evaluations of f', 'time'], rows),
        ],
        rows: rows.map(([method, value, abs, evals, time]) => ({ method, value, abs, evals, time })),
        summary: { f: sel.f, rule: page.rule, N: sel.N, provider: page.mp, K: sel.K, exact: ex, result: r },
      };
    },
    why: `the layer cake turns Lebesgue into an ordinary integral over heights; what it cannot get for free is ${m`\lambda\{f > t\}`}. A formula costs nothing, root finding costs evaluations of f, sampling brings noise.`,
    notes: [
      'Same area, two orders of summation: Riemann adds columns left to right, Lebesgue adds layers bottom to top. Riemann suffers where f is steep or jumps between grid points; Lebesgue where f is flat (a flat stretch puts a lot of domain at nearly one level).',
      'The slabs are the layer-cake midpoint rule: level k spans [m + kΔ, m + (k+1)Δ], as wide as the preimage of its middle. The lower sum uses the preimage of its top instead (Lebesgue’s own definition, from below).',
    ],
  });
}

/* ---------- E2 · convergence ---------- */

const SERIES = {
  left: { color: RIEMANN, dash: '2 3', label: 'left' },
  right: { color: RIEMANN, dash: '7 3', label: 'right' },
  midpoint: { color: RIEMANN, dash: false, label: 'midpoint', dots: true },
  trapezoid: { color: RIEMANN, dash: '9 3 2 3', label: 'trapezoid' },
  simpson: { color: RIEMANN, dash: false, label: 'Simpson', dots: true, hollow: true },
  lower: { color: LEBESGUE, dash: '4 3', label: 'lower sum' },
  layercake: { color: LEBESGUE, dash: false, label: 'layer cake', dots: true },
  geometric: { color: LEBESGUE, dash: false, label: 'layer cake (geometric t)', short: 'geometric', dots: true },
};
const EXPECTED = { left: -1, right: -1, midpoint: -2, trapezoid: -2, simpson: -4, lower: -1, layercake: -2, geometric: null };

/** One or two sentences per function: what E2 shows. */
function highlight(fid, res) {
  const s = (k) => (res.slopes[k] === null || res.slopes[k] === undefined ? '—' : res.slopes[k].toFixed(2));
  switch (fid) {
    case 'f1': case 'f7':
      return `The layer cake converges with slope <strong>${s('layercake')}</strong>, not −2: at the flat top, λ{f > t} has a square-root cusp. Riemann rules keep their textbook orders (midpoint ${s('midpoint')}, Simpson ${s('simpson')}).`;
    case 'f2': return `The layer cake converges with slope <strong>${s('layercake')}</strong>, not −2: x² is flat at 0, where λ{f > t} has a square-root cusp. Simpson is exact (a parabola); midpoint ${s('midpoint')}.`;
    case 'f3': return 'The jump falls on a cell boundary: the <strong>midpoint rule and the layer cake are exact</strong> (error 0, not drawn). Trapezoid and Simpson put half a cell across the jump and pay O(1/N).';
    case 'f3p': return `Off the grid, the jump costs every Riemann rule <strong>O(1/N)</strong> (midpoint ${s('midpoint')}). The layer cake does not care where the jump is: it stays at rounding level.`;
    case 'f4': return 'λ{f > t} = 1 − 2t is a straight line, so the <strong>layer cake is exact</strong> at every K. So are midpoint and trapezoid: f is linear on every cell.';
    case 'f5': return `The singularity caps every Riemann rule at <strong>N⁻¹ᐟ²</strong> (midpoint ${s('midpoint')}). The layer cake on a geometric t-grid with the exact tail is <strong>exact from K = 10</strong>.`;
    case 'f6': return 'An indicator is a simple function: <strong>the layer cake and the lower sum are exact</strong> (height × measure). Trapezoid and Simpson pay for the jump.';
    case 'f8': return `Near 0 the oscillations make the Riemann errors jump around (midpoint fit ${s('midpoint')}); the layer cake with the series measure falls steadily (<strong>${s('layercake')}</strong>). K stops at 2000: the series costs 10⁵ terms per level.`;
    case 'P3': return 'Not Riemann integrable, yet every point-tag sum lands near ½ (Pathological page). The layer cake with the exact measure is exact.';
    case 'P5': return `The Cantor function has a jump in λ{C > t} at every dyadic level: the layer cake is slow (<strong>${s('layercake')}</strong>) while the midpoint rule is fine (${s('midpoint')}).`;
    default: return '';
  }
}

/** A log-log error plot for some of the series, with slope guides; y-range shared through yMin/yMax. */
function convergenceChart(res, keys, guides, yMin, yMax, title) {
  const layers = [];
  for (const p of guides) {
    const xEnd = Math.min(1e5, 10 * (yMax / yMin) ** (1 / p));   // stop where the guide meets the bottom of the plot
    layers.push({ type: 'line', points: [[10, yMax], [xEnd, yMax * (xEnd / 10) ** -p]], color: MUTED, thin: true, dash: '1 3', hover: false, end: `−${p}` });
  }
  for (const key of keys) {
    const rows = res.series[key];
    if (!rows) continue;
    const st = SERIES[key], pts = rows.filter(([, e]) => e > 0).map(([n, e]) => [n, e]);
    if (!pts.length) continue;
    layers.push({ type: 'line', points: pts, color: st.color, dash: st.dash, label: st.label, end: st.short ?? st.label });
    if (st.dots) layers.push({ type: 'points', points: pts, color: st.color, r: 2.5, hollow: st.hollow, hover: false });
  }
  return plot({ x: { log: true, min: 10, max: 1e5, title }, y: { log: true, min: yMin, max: yMax, title: '|error|' }, width: 420, height: 300, layers,
    label: `error against ${title} on log-log axes` });
}

function e2(sel, redraw) {
  const spec = { kind: 'convergence', args: { fid: sel.f } };
  const got = getRun(spec, redraw, 'E2');
  const spec2 = { kind: 'agreement', args: {} };
  const agree = getRun(spec2, redraw, 'agree');
  return labPanel({
    hw: 'hw06', id: 'E2', title: 'E2 · Convergence', name: `E2-${sel.f}`,
    question: `How fast does the error fall as ${m`N`} or ${m`K`} grows, and do both approaches reach the same value?`,
    steps: [
      `run every rule at ${m`N, K = 10, 20, 50, \ldots, 10^5`} (Lebesgue with the exact measure);`,
      `on log-log axes an error ${m`C N^{-p}`} is a straight line of slope ${m`-p`}: fit it over 10 … 1000;`,
      'compare both methods at the largest sizes, for every Riemann-integrable function.',
    ],
    flag: updatingFlag(got), waiting: got.result ? null : pending(got, spec, redraw),
    view: () => {
      const res = got.result;
      const all = Object.values(res.series).flat().map((r) => r[1]).filter((e) => e > 0);
      const yMax = 10 ** Math.ceil(Math.log10(Math.max(...all))), yMin = Math.max(1e-17, 10 ** Math.floor(Math.log10(Math.min(...all))));
      const rKeys = ['left', 'right', 'midpoint', 'trapezoid', 'simpson'], lKeys = ['lower', 'layercake', 'geometric'];
      const riem = convergenceChart(res, rKeys, [1, 2, 4], yMin, yMax, 'N (cells)');
      const leb = convergenceChart(res, lKeys, [1, 1.5, 2], yMin, yMax, 'K (levels)');
      const slopeRows = [...rKeys, ...lKeys].filter((k) => res.series[k]).map((k) => {
        const s = res.slopes[k], exp = EXPECTED[k], zero = res.series[k].every(([, e]) => e < 1e-13);
        return [SERIES[k].label, zero ? 'exact' : s === null ? '—' : s.toFixed(2), exp === null ? '—' : String(exp), e2s(res.series[k].at(-1)[1])];
      });
      const ag = agree.result;
      const agreeTable = ag ? table(['', 'exact', 'Riemann (midpoint, N = 10⁵)', 'Lebesgue (layer cake)', 'apart'], ag.map((r) => [
        tag(r.fid) + (r.improper ? ' *' : ''), sig(r.exact, 10), sig(r.riemann, 10), sig(r.lebesgue, 10), e2s(Math.abs(r.riemann - r.lebesgue), 1),
      ])) : pending(agree, spec2, redraw);
      return {
        answer: { text: highlight(sel.f, res) },
        body: [
          ...section(1, 'Error against size', 'Same axes on both sides. Grey dotted lines: reference slopes. An error of exactly 0 cannot be drawn on a log axis.'),
          el('div', { class: 'cols' }, [
            el('div', {}, [el('h3', { class: 'panel-title', text: 'Riemann rules' }), riem]),
            el('div', {}, [el('h3', { class: 'panel-title', text: 'Lebesgue rules' }), leb]),
          ]),
          el('div', { class: 'row' }, [svgButton(riem, `hw06-E2-riemann-${sel.f}`), svgButton(leb, `hw06-E2-lebesgue-${sel.f}`)]),
          ...section(2, 'Fitted slopes', '“Expected” holds for a smooth f; the gap is the lesson.'),
          table(['rule', 'slope', 'expected', 'error at 10⁵'], slopeRows),
          ...section(3, 'Same limit?', `${evidenceHtml('T')} For a Riemann-integrable f the two integrals are equal. ${evidenceHtml('M')} Numerically, at the largest sizes:`),
          agreeTable,
          el('p', { class: 'small muted', html: '* f5 is unbounded: an improper Riemann integral, whose limit equals the Lebesgue integral. P3 is not Riemann integrable (Pathological page).' }),
        ],
        rows: Object.entries(res.series).flatMap(([k, rows]) => rows.map(([n, e, evals]) => ({ f: sel.f, rule: k, size: n, error: e, evals }))),
        summary: { f: sel.f, exact: res.exact, slopes: res.slopes },
      };
    },
    why: `the speed depends on where f is hard, not on the method's name. Cutting the domain suffers where f is steep, jumps or blows up; cutting the range suffers where f is flat. The two are dual.`,
    notes: [
      `Why ${m`K^{-3/2}`}: near a maximum ${m`M`}, ${m`\lambda\{f > t\} \approx c\sqrt{M - t}`}. The midpoint rule in ${m`t`} is second order only where its integrand is smooth; the square root on the last level, of thickness ${m`1/K`}, costs an error of order ${m`K^{-3/2}`}.`,
      'Left and right on sin x converge at −2, not −1: f is 0 at both ends, so both equal the trapezoid rule.',
    ],
  });
}

/* ---------- E3 · error against cost ---------- */

const COSTLY = {
  midpoint: { color: RIEMANN, dash: false, label: 'midpoint', short: 'midpoint' },
  simpson: { color: RIEMANN, dash: '6 3', label: 'Simpson', short: 'Simpson' },
  root: { color: LEBESGUE, dash: false, label: 'layer cake, root finding', short: 'root finding' },
  mc: { color: LEBESGUE, dash: '2 3', label: 'Monte Carlo', short: 'Monte Carlo' },
  analytic: { color: LEBESGUE, dash: '8 3', label: 'layer cake, exact measure', short: 'analytic' },
};

function e3(sel, inputs, redraw) {
  const spec = { kind: 'efficiency', args: { fid: sel.f, seed: inputs.seed } };
  const got = getRun(spec, redraw, 'E3');
  return labPanel({
    hw: 'hw06', id: 'E3', title: 'E3 · Efficiency', name: `E3-${sel.f}-seed${inputs.seed}`,
    question: 'For the same number of evaluations of f, which method gets closest?',
    steps: [
      'run each method at growing sizes, counting every evaluation of f (also those inside the root finder);',
      'plot the error against the evaluations: lower-left is better;',
      'read off what each method needs for an error of 10⁻⁶.',
    ],
    flag: updatingFlag(got), waiting: got.result ? null : pending(got, spec, redraw),
    view: () => {
      const res = got.result, target = 1e-6, layers = [];
      for (const k of ['midpoint', 'simpson', 'root', 'mc']) {
        const pts = (res.series[k] ?? []).filter((p) => p.error > 0 && p.evals > 0).map((p) => [p.evals, p.error]);
        if (pts.length) layers.push({ type: 'line', points: pts, color: COSTLY[k].color, dash: COSTLY[k].dash, label: COSTLY[k].label, end: COSTLY[k].short },
          { type: 'points', points: pts, color: COSTLY[k].color, r: 2.5, hover: false });
      }
      layers.push({ type: 'hline', at: target, color: MUTED, text: '10⁻⁶', anchor: 'start' });
      const chart = plot({ x: { log: true, title: 'evaluations of f' }, y: { log: true, title: '|error|' }, width: 640, height: 300, layers, label: 'error against evaluations of f for each method' });
      const reach = (k) => (res.series[k] ?? []).filter((p) => p.error <= target).sort((a, b) => a.evals - b.evals || a.ms - b.ms)[0];
      const rows = Object.keys(COSTLY).filter((k) => res.series[k]).map((k) => {
        const best = Math.min(...res.series[k].map((p) => p.error)), r = reach(k);
        return [COSTLY[k].label, r ? (k === 'analytic' ? '0 (a formula)' : nice(r.evals)) : '—', r ? ms(r.ms) : '—', e2s(best)];
      });
      const n = (k) => reach(k)?.evals;
      const base = n('simpson') ? ['Simpson', n('simpson')] : n('midpoint') ? ['midpoint', n('midpoint')] : null;
      const ans = base
        ? `For 10⁻⁶ on ${tag(sel.f)}, <strong>${base[0]} needs ${nice(base[1])}</strong> evaluations${n('root') ? `; the root-finding layer cake <strong>${nice(n('root'))}</strong>, ${Math.round(n('root') / base[1])} times more` : ''}${n('mc') ? `; Monte Carlo ${nice(n('mc'))}` : '; Monte Carlo does not get there'}.`
        : `On ${tag(sel.f)} no Riemann rule reaches 10⁻⁶ within 10⁵ evaluations; the table shows the best each method gets.`;
      return {
        answer: { text: ans },
        body: [
          ...section(1, 'Error against evaluations of f', 'The layer cake with an exact measure makes no evaluations at all, so it is only in the table.'),
          figure(chart), el('div', { class: 'row' }, [svgButton(chart, `hw06-E3-${sel.f}`)]),
          ...section(2, 'What 10⁻⁶ costs', 'Smallest run reaching 10⁻⁶ (— if none did), its time in this browser, and the best error seen.'),
          table(['method', 'evaluations', 'time', 'best error'], rows),
          el('div', { class: 'inset' }, [
            el('h3', { class: 'panel-title', text: 'Conclusion' }),
            el('ul', {}, [
              el('li', { html: `${evidenceHtml('M')} On smooth 1-D functions Riemann rules win on cost, Simpson by orders of magnitude.` }),
              el('li', { html: `${evidenceHtml('M')} Root finding costs about ten evaluations per level and monotone piece (f8 has 2000 pieces per level).` }),
              el('li', { html: `${evidenceHtml('O')} Lebesgue wins where the distribution of values is known (f5, steps), and in high dimension as Monte Carlo (Monte Carlo page).` }),
            ]),
          ]),
        ],
        rows: Object.entries(res.series).flatMap(([k, pts]) => pts.map((p) => ({ f: sel.f, method: k, size: p.size, error: p.error, evals: p.evals, ms: p.ms }))),
        summary: { f: sel.f, seed: inputs.seed, series: res.series },
      };
    },
    why: 'accuracy alone does not rank methods: an exact answer after 10⁹ evaluations is worse than 10⁻¹² after 100.',
    notes: ['Times are measured in this browser’s worker (each run repeated until 5 ms have passed) and change from machine to machine; evaluation counts do not. Monte Carlo uses the seed; everything else is deterministic.'],
  });
}

/* ---------- E4 · Lebesgue's coins ---------- */

let coinsSorted = false;

function coins(fn) {
  const n = 24, h = (fn.b - fn.a) / n;
  const vals = Array.from({ length: n }, (_, i) => fn.f(fn.a + (i + 0.5) * h));
  const order = vals.map((_, i) => i).sort((a, b) => vals[b] - vals[a]);
  const rank = new Array(n); order.forEach((i, r) => { rank[i] = r; });
  const W = 860, H = 220, pad = 30, bw = (W - 2 * pad) / n;
  const lo = Math.min(0, ...vals), hi = Math.max(...vals.map((v) => Math.min(v, 1e3)));
  const Y = (v) => H - pad - ((Math.min(v, hi) - lo) / (hi - lo)) * (H - 2 * pad);
  const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': `the ${n} midpoint values of f as bars, which can be sorted by height` });
  svg.append(svgEl('line', { x1: pad, x2: W - pad, y1: Y(0), y2: Y(0), stroke: 'var(--muted)' }));
  const bars = vals.map((v, i) => {
    const r = svgEl('rect', { x: pad + i * bw + 1, y: Math.min(Y(v), Y(0)), width: bw - 2, height: Math.abs(Y(0) - Y(v)), fill: v >= 0 ? LEBESGUE : RIEMANN, class: 'coin' });
    svg.append(r);
    return r;
  });
  const place = (sorted) => bars.forEach((r, i) => { r.style.transform = `translateX(${((sorted ? rank[i] : i) - i) * bw}px)`; });
  const wrap = el('div', { class: 'chart coins' }, [svg]);
  const button = el('button', { type: 'button', text: coinsSorted ? 'Put them back in order of x' : 'Sort the coins by value',
    onclick: () => { coinsSorted = !coinsSorted; place(coinsSorted); button.textContent = coinsSorted ? 'Put them back in order of x' : 'Sort the coins by value'; } });
  requestAnimationFrame(() => place(coinsSorted));
  const total = vals.reduce((s, v) => s + v, 0) * h;
  return { wrap, button, total, n };
}

function e4(sel) {
  const fn = FUNCTIONS[sel.f];
  const c = coins(fn);
  const N = Math.min(sel.N, 100000);
  const rowsFor = (id, n) => {
    const g = FUNCTIONS[id], mid = RULES.midpoint.run(g, n).value, cake = layerCakeExact(new GridCountMeasure(g, n)).value;
    return { f: id, N: n, midpoint: mid, gridLayerCake: cake, rel: Math.abs(mid - cake) / Math.abs(mid) };
  };
  const rows = [...new Set([sel.f, 'f1', 'f2', 'f7'])].map((id) => rowsFor(id, id === sel.f ? N : 1000));
  const worst = Math.max(...rows.map((r) => r.rel));
  return labPanel({
    hw: 'hw06', id: 'E4', title: 'E4 · Lebesgue’s coins', name: `E4-${sel.f}-N${N}`,
    question: `If the measures ${m`\lambda\{f > t\}`} come from counting grid points, is the layer cake a new method, or the midpoint sum in another order?`,
    steps: [
      `the midpoint values ${m`f(x_i)`} are coins, one per cell;`,
      'sort them by value: the total cannot change;',
      'cut the sorted pile by levels: that is the layer cake on grid-count measures. Compare it with the midpoint sum.',
    ],
    view: () => ({
      answer: { text: `<strong>The same number</strong>: at most ${e2s(worst, 1)} apart (relative), the rounding of adding the same terms in another order.`, ok: worst <= 1e-12 },
      body: [
        ...section(1, `${c.n} coins of ${PLAIN[sel.f]}`, `Sorting changes the order, not the total ${m`\sum f(x_i)\,h = ${sig(c.total, 10)}`}. Sorted, the pile read sideways is the grid-count ${m`\lambda\{f > t\}`}.`),
        c.wrap, el('div', { class: 'row' }, [c.button]),
        ...section(2, 'The numbers', `The chosen function at ${m`N = ${nice(N)}`}, and f1, f2, f7 at ${m`N = 1000`}.`),
        table(['function', 'N', 'midpoint sum', 'grid-count layer cake', 'relative difference'], rows.map((r) => [PLAIN[r.f], nice(r.N), sig(r.midpoint, 15), sig(r.gridLayerCake, 15), e2s(r.rel, 1)])),
        el('blockquote', { class: 'small', html: `“I have to pay a certain sum, which I have collected in my pocket. I take the bills and coins out of my pocket and give them to the creditor in the order I find them until I have reached the total sum. This is the Riemann integral. But I can proceed differently. After I have taken all the money out of my pocket I order the bills and coins according to identical values and then I pay the several heaps one after the other to the creditor. This is my integral.” — Henri Lebesgue, as quoted in English translation in the literature ${evidenceHtml('S')} <span class="muted">(wording and source to be checked)</span>` }),
      ],
      rows,
      summary: { f: sel.f, rows },
    }),
    why: `counting grid points gives back Riemann: a real Lebesgue method needs measures that do not come from a grid — a formula, root finding, or random points (notes: Layer-cake formula, Cor. 3).`,
    notes: ['The same identity is why Monte Carlo is "Lebesgue": the layer cake built on a random sample equals the sample mean times λ(Ω), i.e. plain Monte Carlo (Monte Carlo page).'],
  });
}

/* ---------- the page ---------- */

startPage({
  shell: hw06Shell('integration.html'),
  sticky: STICKY,
  memory: MEMORY,
  preserve: true,
  render: (api) => {
    const inputs = readInputs(api.state), sel = readIntegration(api.state), page = readPage(api.state);
    const error = inputs.error ?? sel.error;
    dock({ ...inputs, error }, api.update, OWN, { ...sel, ...page });
    if (error) return [rejected(error)];
    const redraw = () => api.draw();
    return [
      abstract({
        question: 'Riemann cuts the <em>domain</em> into cells; Lebesgue cuts the <em>range</em> into levels and measures the preimages. Do the two reach the same integral, how fast, and at what cost?',
        findings: [
          '<strong>Same limit.</strong> For every Riemann-integrable function of the collection the two agree: on sin x they are 5·10⁻⁹ apart at 10⁵ cells and levels (E2).',
          '<strong>Different speed.</strong> Riemann suffers where f is steep, jumps or blows up (1/√x converges like N⁻¹ᐟ²); Lebesgue where f is flat (sin x: error ∝ K⁻¹·⁵ instead of K⁻²).',
          '<strong>The real cost is the preimage.</strong> With root finding, an error of 10⁻⁶ on sin x takes 94 372 evaluations of f, against 51 for Simpson (E3); with a formula for the measure it takes none.',
          '<strong>Counting grid points is not Lebesgue</strong>: it gives back the midpoint sum, to 2·10⁻¹⁵ (E4).',
        ],
        sections: [['theory', 'Two cuts, one integral'], ['E1', 'E1 · the two pictures'], ['E2', 'E2 · convergence'], ['E3', 'E3 · efficiency'], ['E4', 'E4 · Lebesgue’s coins']],
      }),
      anchor('theory', theory(sel)), anchor('E1', e1(sel, page, inputs, redraw)), anchor('E2', e2(sel, redraw)), anchor('E3', e3(sel, inputs, redraw)), anchor('E4', e4(sel)),
    ];
  },
});
