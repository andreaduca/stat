/* normal-page.js — Ex. 2: Φ computed eight ways against an 80-digit reference.
   A theory card (definitions, why the tail needs relative accuracy, the methods),
   then E6 a calculator, E7 the accuracy map, E8 the cost, E9 the reference checks,
   E10 conditioning and avoidable error, E16 GELU. Heavy maps come from the worker;
   this file only draws. Note 03. */

import { el, field } from '../../../assets/js/ui/dom.js';
import { startPage } from '../../../assets/js/ui/page.js';
import { labPanel, section, table } from '../../../assets/js/ui/lab.js';
import { plot, curve } from '../../../assets/js/ui/plot.js';
import { nice, sig } from '../../../assets/js/ui/format.js';
import { m, M } from '../../../assets/js/ui/math.js';
import { show, onCommit, numberOr } from '../../../assets/js/ui/dock.js';
import { METHODS, hybrid, Phi, Q, logPhi, PhiInv, kappa, naiveLower, M8_INFO } from '../core/normal.js';
import { gelu, geluTanh, geluMaxError } from '../core/gelu.js';
import REF from '../../data/phi-reference.js';
import NIST from '../../data/nist-table.js';
import { readInputs, dock, rejected } from './inputs.js';
import { REF as INK, MUTED, legend, figure, svgButton, evidenceHtml, getRun, pending, updatingFlag, abstract, anchor } from './widgets.js';
import { hw06Shell, STICKY, MEMORY } from './shell.js';

const html = (s) => el('span', { html: s });
const e2s = (x, d = 2) => (x === 0 ? '0' : !Number.isFinite(x) ? String(x) : x.toExponential(d));
const U = 2 ** -53;   // unit roundoff of binary64
const p16 = (v) => (Number.isFinite(v) ? v.toPrecision(16) : String(v));

/** The worst value in each of `bins` equal slices of x: rounding errors jump from point to
 *  point, so the envelope is what a reader can see (and what an error bound promises). */
function envelope(xs, ys, idx = null, bins = 150) {
  const ids = idx ?? Array.from(xs.keys()), lo = xs[ids[0]], hi = xs[ids.at(-1)], w = (hi - lo) / bins, out = [];
  let cur = -1, best = 0, at = 0;
  for (const i of ids) {
    const b = Math.min(bins - 1, Math.floor((xs[i] - lo) / w));
    if (b !== cur && cur >= 0) { out.push([at, best]); best = 0; }
    if (b !== cur) { cur = b; at = lo + (b + 0.5) * w; }
    if (ys[i] > best || Number.isNaN(ys[i])) best = Number.isNaN(ys[i]) ? Infinity : ys[i];
  }
  out.push([at, best]);
  return out;
}

/** Every reference point (test points and grid), by x. */
const REFS = new Map([...REF.test, ...REF.grid].map((r) => [r[0], { phi: Number(r[1]), q: Number(r[2]), ln: r[3] === '' ? null : Number(r[3]) }]));

/** Colour and dash of each method in the charts; text labels everywhere. */
const STYLE = {
  M1: { color: 'var(--m1)', dash: false }, M2: { color: 'var(--m2)', dash: false }, "M2'": { color: 'var(--m2)', dash: '6 3' },
  M3: { color: 'var(--m3)', dash: false }, M4: { color: 'var(--m4)', dash: false }, M5: { color: 'var(--m6)', dash: false },
  M6a: { color: 'var(--m5)', dash: false }, M6b: { color: 'var(--m5)', dash: '6 3' }, M7: { color: INK, dash: false }, M8: { color: 'var(--m1)', dash: '2 3' },
};
const BY_ID = Object.fromEntries(METHODS.map((x) => [x.id, x]));

/* ---------- this page's row in the dock ---------- */

function readPage(state) {
  const x = numberOr(state.x, -5), p = numberOr(state.p, 0.975), s = numberOr(state.s, 2);
  const err = state.err === 'abs' ? 'abs' : 'rel';
  let error = null;
  if (!(x >= -1000 && x <= 1000)) error = `x must be between −1000 and 1000 (got ${x}).`;
  else if (!(p > 0 && p < 1)) error = `p must be strictly between 0 and 1 (got ${p}).`;
  else if (!(s >= 1 && s <= 4)) error = `the switch-over s must be between 1 and 4 (got ${s}).`;
  return { x, p, s, err, error };
}

const OWN = {
  id: 'normal', label: 'this page',
  build(apply, later) {
    const x = el('input', { type: 'number', class: 'num', step: 'any', 'aria-label': 'x for the calculator' });
    const p = el('input', { type: 'number', class: 'num', step: 'any', 'aria-label': 'p for the quantile' });
    const s = el('input', { type: 'number', class: 'num', min: 1, max: 4, step: 0.25, 'aria-label': 'switch-over of the hybrid' });
    const err = el('select', { 'aria-label': 'error shown in the accuracy map', onchange: (e) => apply({ err: e.target.value }) },
      [el('option', { value: 'rel', text: 'relative' }), el('option', { value: 'abs', text: 'absolute' })]);
    for (const [node, key] of [[x, 'x'], [p, 'p'], [s, 's']]) onCommit(node, () => apply({ [key]: node.value }), later);
    return {
      nodes: [el('div', { class: 'row' }, [field('E6: x', x), field('quantile p', p), el('span', { class: 'vrule' }), field('M7 switch-over s', s), field('E7: error', err)])],
      refresh(v) { show(x, v.x); show(p, v.p); show(s, v.s); show(err, v.err); },
    };
  },
  summary: (v) => `x = ${v.x} · p = ${v.p} · s = ${v.s} · ${v.err === 'abs' ? 'absolute' : 'relative'} error`,
  notes: [
    '<strong>x, p</strong>: the point of the calculator (E6), and the probability whose quantile Φ⁻¹(p) it shows.',
    '<strong>s</strong>: where the hybrid M7 switches from the series to the continued fraction (E6, E7). Lower s: fewer series terms but more fraction steps, and better accuracy near the switch.',
    '<strong>error</strong>: E7 shows the relative error (what a tail probability needs) or the absolute error.',
  ],
};

/* ---------- the theory card ---------- */

function theory() {
  const naive = [-5, -8, -9, -10].map((x) => {
    const ref = REFS.get(x).phi, v = naiveLower(x);
    return [String(x), e2s(ref, 4), v === 0 ? '0' : e2s(v, 4), v === 0 ? '1 (all digits lost)' : e2s(Math.abs(v - ref) / ref, 1)];
  });
  const rows = [
    ['M1, M2', 'trapezoid, Simpson on [0, |x|]', m`\tfrac{1}{2} \pm \int_0^{|x|} \varphi`, 'near 0', 'lower tail (subtraction)'],
    ["M2′", 'Simpson on the tail', m`\int_0^{L} \varphi(a + s)\,ds`, 'moderate tails', 'far tails (fixed N)'],
    ['M3', 'Taylor series of erf', m`\tfrac{2}{\sqrt{\pi}}\sum \tfrac{(-1)^n z^{2n+1}}{n!(2n+1)}`, '|x| ≲ 3', 'terms up to 10¹² at x = 8'],
    ['M4', 'positive series', m`\varphi(a)\sum \tfrac{a^{2n+1}}{(2n+1)!!}`, '|x| < 3', 'lower tail (subtraction)'],
    ['M5', 'Laplace continued fraction', m`\tfrac{\varphi(a)}{a + \tfrac{1}{a + \tfrac{2}{a + \cdots}}}`, 'tails', 'near 0 (slow)'],
    ['M6', 'A&S 7.1.26, 26.2.17', 'fixed rational × exp', 'quick 7 digits', 'relative accuracy in the tail'],
    ['M7', 'hybrid: M4 | M5', 'series below s, fraction above', 'everywhere', '—'],
    ['M8', 'Chebyshev fit', `${M8_INFO.tailTerms} + ${M8_INFO.bodyTerms} coefficients`, 'everywhere, fixed cost', '—'],
  ];
  return el('div', { class: 'card' }, [
    el('h2', { text: 'The integral with no formula' }),
    el('div', { class: 'cols' }, [
      el('div', {}, [
        el('div', { html: M`\Phi(x) = \int_{-\infty}^{x} \varphi(t)\,dt, \qquad \varphi(t) = \frac{e^{-t^2/2}}{\sqrt{2\pi}}` }),
        el('div', { html: M`\Phi(x) = \tfrac{1}{2}\big(1 + \operatorname{erf}(x/\sqrt{2})\big), \qquad Q(x) = 1 - \Phi(x) = \Phi(-x)` }),
        el('p', { class: 'small muted', html: `No elementary formula exists (Liouville page); ${m`\operatorname{erf}`} is a name, not an algorithm. JavaScript has no ${m`\operatorname{erf}`}: every method below is built from ${m`\exp`} and arithmetic.` }),
      ]),
      el('div', {}, [
        el('h3', { class: 'panel-title', text: 'Why the tail needs relative accuracy' }),
        el('p', { class: 'small', html: `A p-value of ${m`10^{-20}`} with an absolute error of ${m`10^{-16}`} is no answer. Computing the lower tail as ${m`1 - \Phi(-x)`} in doubles:` }),
        table(['x', 'Φ(x)', '1 − Φ(−x)', 'rel. error'], naive),
      ]),
    ]),
    el('h3', { class: 'panel-title', text: 'The methods' }),
    table(['', 'method', 'formula', 'good for', 'breaks at'], rows.map(([a, b, c, d, e]) => [a, b, html(c), d, e]), 'prose words'),
  ]);
}

/* ---------- E6 · calculator ---------- */

function e6(page) {
  const ref = REFS.get(page.x);
  const truth = ref ? ref.phi : hybrid(page.x).value;
  const rows = METHODS.map((meth) => {
    const r = meth.id === 'M7' ? hybrid(page.x, page.s) : meth.run(page.x);
    const rel = truth === 0 ? NaN : Math.abs(r.value - truth) / truth;
    return [`${meth.id} · ${meth.short}`, p16(r.value), Number.isNaN(rel) ? '—' : rel === 0 ? '0' : e2s(rel), meth.unit === 'fixed' ? 'fixed' : `${nice(r.cost)} ${meth.unit === 'terms or iterations' ? (r.branch === 'series' ? 'terms' : 'iterations') : meth.unit}`];
  });
  const q = Q(page.x), lp = logPhi(page.x), inv = PhiInv(page.p);
  return labPanel({
    hw: 'hw06', id: 'E6', title: 'E6 · Calculator', name: `E6-x${page.x}`,
    question: `What does each method give for ${m`\Phi(${page.x})`}, and how far is it from the truth?`,
    steps: [
      'evaluate every method at x (change it in the dock);',
      ref ? 'compare with the 80-digit reference (x is one of its points);' : 'x is not a reference point: compare with M7, the best method here (marked ≈);',
      'add Q(x), ln Φ(x), Φ⁻¹(p) and the condition number from M7.',
    ],
    view: () => {
      const m7 = hybrid(page.x, page.s).value, err7 = Math.abs(m7 - truth) / truth;
      return {
        answer: { text: truth === 0 ? `Φ(${page.x}) <strong>underflows</strong>: it is below the smallest double (4.9·10⁻³²⁴), so every method returns 0. Its logarithm is still there: ${m`\ln \Phi(${page.x}) = ${p16(lp)}`}.` : `Φ(${page.x}) = <strong>${p16(truth)}</strong>${ref ? ' (80-digit reference)' : ' (≈, M7)'}. ${ref ? `M7 is off by <strong>${err7 === 0 ? '0' : e2s(err7)}</strong> relative.` : ''} ${page.x < -8 ? 'Every method that subtracts from 1 has lost all its digits here.' : ''}` },
        body: [
          ...section(1, 'Every method', `Relative error against ${ref ? 'the reference' : 'M7 (≈)'}; cost in the method's own unit.`),
          table(['method', 'Φ(x)', 'rel. error', 'cost'], rows),
          ...section(2, 'More from M7', `${m`\ln \Phi`} works past the underflow of Φ (x < −38.5); ${m`\kappa`} is the condition number (E10).`),
          table(['', 'value'], [
            [html(m`Q(x) = 1 - \Phi(x)`), p16(q)],
            [html(m`\ln \Phi(x)`), p16(lp)],
            [html(m`\Phi^{-1}(${page.p})`), p16(inv)],
            [html(m`\kappa_\Phi(x)`), sig(kappa(page.x), 6)],
          ], 'prose'),
        ],
        rows: rows.map(([method, value, rel, cost]) => ({ x: page.x, method, value, rel, cost })),
        summary: { x: page.x, reference: ref ? truth : null, Q: q, logPhi: lp, p: page.p, PhiInv: inv },
      };
    },
    why: 'the same formula Φ gives a different number under each method, and the differences are invisible near 0 and enormous in the tail.',
    notes: ['Try x = −10, −20, −37.5 (reference points), then x = 3: the methods that look fine near 0 differ by orders of magnitude in the lower tail, and agree again in the upper tail, where Φ ≈ 1 only needs absolute accuracy.'],
  });
}

/* ---------- E7 · accuracy map ---------- */

const LEFT = ['M1', 'M2', 'M3', 'M4', 'M6a'], RIGHT = ["M2'", 'M5', 'M6b', 'M8', 'M7'];

function accuracyChart(res, ids, kind, title) {
  const floor = kind === 'rel' ? 1e-17 : 1e-30, ceil = kind === 'rel' ? 10 : 1;
  const layers = [
    { type: 'hline', at: 2.2e-16, color: MUTED },
    { type: 'hline', at: 1e-14, color: MUTED, dash: false },
  ];
  for (const id of ids) {
    const pts = envelope(res.xs, res.series[id][kind]).map(([x, e]) => [x, Math.min(ceil, Math.max(floor, e))]);
    layers.push({ type: 'line', points: pts, color: STYLE[id].color, dash: STYLE[id].dash, thin: id !== 'M7', label: `${id} ${BY_ID[id].short}`, end: id });
  }
  return plot({ x: { min: -37.5, max: 8.25, title: 'x' }, y: { log: true, min: floor, max: ceil, title: kind === 'rel' ? 'relative error' : 'absolute error' },
    width: 420, height: 300, layers, label: `${kind === 'rel' ? 'relative' : 'absolute'} error of ${title} against x on a log scale` });
}

function e7(page, redraw) {
  const spec = { kind: 'accuracy', args: { s: page.s } };
  const got = getRun(spec, redraw, 'E7');
  return labPanel({
    hw: 'hw06', id: 'E7', title: 'E7 · Accuracy map', name: `E7-s${page.s}`,
    question: 'Over the whole range −37.5 ≤ x ≤ 8.25, how accurate is each method?',
    steps: [
      'evaluate every method at the 2001 reference points;',
      `plot the worst ${page.err === 'rel' ? 'relative' : 'absolute'} error in each slice of x (width 0.3), log scale;`,
      'left: methods that get the lower tail by subtraction; right: methods that compute it directly.',
    ],
    flag: updatingFlag(got), waiting: got.result ? null : pending(got, spec, redraw),
    view: () => {
      const res = got.result, max = (id) => Math.max(...res.series[id].rel), at = (id) => res.xs[res.series[id].rel.indexOf(max(id))];
      const left = accuracyChart(res, LEFT, page.err, 'the methods by subtraction');
      const right = accuracyChart(res, RIGHT, page.err, 'the direct methods');
      const sRows = [1.5, 2, 3].map((s) => {
        let worst = 0, cost = 0;
        for (const [x, p] of REF.grid) { const r = hybrid(x, s); worst = Math.max(worst, Math.abs(r.value - Number(p)) / Number(p)); cost = Math.max(cost, r.cost); }
        return [String(s), e2s(worst), nice(cost)];
      });
      return {
        answer: { text: `<strong>M7 stays below ${e2s(max('M7'), 1)}</strong> everywhere (worst at x = ${sig(at('M7'), 4)}), and M8 below ${e2s(max('M8'), 1)}. The methods on the left lose every digit in the lower tail: their relative error reaches 1 (100 %) before x = −9.` },
        body: [
          ...section(1, 'Error against x', 'Grey lines: the target 10⁻¹⁴ (solid) and machine precision 2.2·10⁻¹⁶ (dashed). M7 is the thick line in the text colour.'),
          el('div', { class: 'cols' }, [
            el('div', {}, [el('h3', { class: 'panel-title', text: 'Lower tail by subtraction' }), left]),
            el('div', {}, [el('h3', { class: 'panel-title', text: 'Lower tail computed directly' }), right]),
          ]),
          el('div', { class: 'row' }, [svgButton(left, 'hw06-E7-subtraction'), svgButton(right, 'hw06-E7-direct')]),
          legend([...LEFT, ...RIGHT].map((id) => [STYLE[id].dash ? 'dash' : 'line', STYLE[id].color, `${id} ${BY_ID[id].short}`])),
          ...section(2, 'The switch-over of M7', `Below ${m`s`} the series, above it the continued fraction. A lower ${m`s`} is more accurate but costs more fraction steps near the switch (the dock sets the s of the charts; now ${page.s}).`),
          table(['s', 'max relative error', 'max terms or iterations'], sRows),
        ],
        rows: [...LEFT, ...RIGHT].map((id) => ({ method: id, maxRel: max(id), at: at(id) })),
        summary: { s: page.s, maxRel: Object.fromEntries([...LEFT, ...RIGHT].map((id) => [id, max(id)])) },
      };
    },
    why: 'near 0 every method looks good; the lower tail separates them. A p-value, a 5σ threshold or a DP calibration lives exactly there.',
    notes: [
      `Subtraction loses digits: for ${m`x \ll 0`}, ${m`\tfrac{1}{2} - h`} with ${m`h \approx \tfrac{1}{2}`} keeps only the digits where the two differ. Below ${m`x \approx -8.3`} the result is exactly 0 or one ulp of ½: relative error 1.`,
      `Upper tail (x > 0): every method returns ${m`1 - Q`}; ${m`\Phi`} itself rounds to 1 from ${m`x \approx 8.3`}. There the absolute error is what counts; for small upper-tail probabilities use ${m`Q(x)`} directly.`,
    ],
  });
}

/* ---------- E8 · cost ---------- */

function e8(page, redraw) {
  const specA = { kind: 'accuracy', args: { s: page.s } }, specT = { kind: 'timing', args: { calls: 100000, reps: 5 } };
  const acc = getRun(specA, redraw, 'E7'), tim = getRun(specT, redraw, 'E8');
  return labPanel({
    hw: 'hw06', id: 'E8', title: 'E8 · Cost', name: 'E8-cost',
    question: 'What does each method cost, and what does the accuracy cost?',
    steps: [
      'count the terms or iterations of the iterative methods at every x;',
      'time every method (median of 5 runs of up to 10⁵ calls, in this browser);',
      'plot each method as one point: time per call against its worst relative error.',
    ],
    flag: updatingFlag(tim), waiting: acc.result && tim.result ? null : pending(tim.result ? acc : tim, tim.result ? specA : specT, redraw),
    view: () => {
      const res = acc.result, t = tim.result;
      const series = [['M4', 'M4 positive series', 'var(--m4)'], ['M5', 'M5 cont. fraction', 'var(--m6)'], ['M7', 'M7 hybrid', INK]].map(([id, label, color]) => ({
        type: 'line', points: Array.from(res.xs, (x, i) => [x, Math.max(1, res.series[id].cost[i])]), color, label, end: id, thin: id !== 'M7',
      }));
      const costs = plot({ x: { min: -37.5, max: 8.25, title: 'x' }, y: { log: true, min: 1, max: 1e4, title: 'terms / iterations' }, width: 420, height: 280, layers: series,
        label: 'terms or iterations against x for the positive series, the continued fraction and the hybrid' });
      const maxRel = (id) => Math.max(...res.series[id].rel);
      const pts = METHODS.map((x) => ({ id: x.id, short: x.short, ns: t[x.id].nsPerCall, err: Math.max(1e-17, Math.min(10, maxRel(x.id))) }));
      const scatter = plot({
        x: { log: true, min: 10, max: 3e4, title: 'ns per call' }, y: { log: true, min: 1e-17, max: 10, title: 'worst relative error' }, width: 420, height: 280,
        layers: pts.flatMap((p) => [
          { type: 'points', points: [[p.ns, p.err]], color: STYLE[p.id].color, r: 4, label: p.id },
          { type: 'line', points: [[p.ns, p.err]], color: STYLE[p.id].color, end: p.id, hover: false },
        ]),
        label: 'each method as a point: time per call against worst relative error on the grid',
      });
      const rows = pts.sort((a, b) => a.ns - b.ns).map((p) => [`${p.id} · ${p.short}`, p.ns.toFixed(0), e2s(maxRel(p.id))]);
      const best = pts.filter((p) => p.err < 1e-13).sort((a, b) => a.ns - b.ns)[0];
      return {
        answer: { text: `The fastest method with full accuracy is <strong>${best.id} (${best.short})</strong>, about ${best.ns.toFixed(0)} ns per call. M7 costs ${t.M7.nsPerCall.toFixed(0)} ns and up to ${nice(Math.max(...res.series.M7.cost))} iterations, depending on x; M8 does the same work at every x.` },
        body: [
          el('div', { class: 'cols' }, [
            el('div', {}, [...section(1, 'Work per evaluation', 'The series is cheap near 0, the fraction far out; the hybrid takes the cheaper one.'), costs]),
            el('div', {}, [...section(2, 'Accuracy against time', 'Lower-left is better.'), scatter]),
          ]),
          ...section(3, 'The numbers', 'Times depend on the machine and the JavaScript engine; the ranking is what transfers.'),
          table(['method', 'ns per call', 'worst relative error'], rows),
        ],
        rows: pts,
        summary: { timing: t },
      };
    },
    why: 'an iterative method is easy to make accurate; a fixed polynomial is faster and takes the same time at every x. Constant time also matters for side channels (Lattice page).',
    notes: ['M1 and M2 pay N + 1 evaluations of φ per call; the A&S formulas a dozen operations and one exp; M8 about 2 multiply-adds per coefficient plus two exp.'],
  });
}

/* ---------- E9 · reference checks ---------- */

function e9() {
  const pts = [-37.5, -30, -20, -10, -8, -5, -3, -2, -1, -0.5, 0, 1, 2, 3, 5, 8];
  const rows = pts.map((x) => { const ref = REFS.get(x).phi, v = Phi(x); return [String(x), ref.toPrecision(17), v.toPrecision(17), e2s(Math.abs(v - ref) / ref)]; });
  const nist = NIST.rows.map(([z, s]) => { const v = (Phi(z) - 0.5).toFixed(5); return [z.toFixed(2), s, v, v === s ? '✓' : '✗']; });
  const rule = [1, 2, 3].map((k) => [`± ${k}σ`, (2 * Phi(k) - 1).toFixed(6)]);
  const worstCross = Math.max(...REF.crossCheck.map((r) => Number(r[1])));
  const allOk = nist.every((r) => r[3] === '✓');
  return labPanel({
    hw: 'hw06', id: 'E9', title: 'E9 · Against trusted references', name: 'E9-reference',
    question: 'Does M7 agree with an 80-digit reference, and with the published table on the web?',
    steps: [
      'reference: 80 digits in Python’s decimal, by two independent methods (positive series, continued fraction);',
      `web: the NIST/SEMATECH table, which gives ${m`\Phi(z) - \tfrac{1}{2}`} to 5 decimals;`,
      'compare M7 with both.',
    ],
    view: () => ({
      answer: { text: `M7 matches the 80-digit values to ${e2s(Math.max(...rows.map((r) => Number(r[3]))), 1)} relative at every test point, and ${allOk ? '<strong>all 9 NIST rows</strong>' : 'not all NIST rows'} to their 5 decimals. The reference's two methods agree to ${e2s(worstCross, 0)}.`, ok: allOk },
      body: [
        ...section(1, 'The 80-digit reference', 'Reference and M7 to 17 significant digits (a double holds about 16).'),
        table(['x', 'reference', 'M7', 'rel. error'], rows),
        el('div', { class: 'cols' }, [
          el('div', {}, [...section(2, 'NIST/SEMATECH', `<a href="${NIST.url}">e-Handbook table</a>, retrieved ${NIST.retrieved}: area from 0 to z.`),
            table(['z', 'NIST', 'M7: Φ(z) − ½', ''], nist)]),
          el('div', {}, [...section(3, 'The 68–95–99.7 rule', `${m`2\Phi(k) - 1`}: the mass within ${m`k`} standard deviations.`),
            table(['', 'mass'], rule),
            el('p', { class: 'small muted', html: `How the reference was made: hw06/tools/reference.py, standard library only. Method A for |x| &lt; 6, method B (depth doubled until stable) beyond; both at 2 ≤ x &lt; 6 agree to ${e2s(worstCross, 0)}. ${evidenceHtml('M')}` })]),
        ]),
      ],
      rows: rows.map(([x, ref, m7, rel]) => ({ x, ref, m7, rel })),
      summary: { nist: NIST.rows, crossCheck: REF.crossCheck },
    }),
    why: 'a reference computed one way can share the bug of the code it judges; two independent expansions that agree to 68 digits cannot both be wrong in the same way.',
    notes: ['The NIST table only has 5 decimals, so it checks the bulk of the distribution, not the tails. The tails are checked against the 80-digit values.'],
  });
}

/* ---------- E10 · conditioning ---------- */

function e10(page, redraw) {
  const spec = { kind: 'accuracy', args: { s: page.s } };
  const got = getRun(spec, redraw, 'E7');
  return labPanel({
    hw: 'hw06', id: 'E10', title: 'E10 · Conditioning: which errors are unavoidable?', name: 'E10-conditioning',
    question: 'In the lower tail, how much error is the problem’s own fault, and how much the method’s?',
    steps: [
      `the condition number ${m`\kappa_\Phi(x) = |x\,\varphi(x)/\Phi(x)|`}: a relative change ${m`u`} of ${m`x`} becomes ${m`\kappa u`} in ${m`\Phi`};`,
      `compare three ways to get the tail: M7 (exact-square split for ${m`e^{-x^2/2}`}), M7 without the split, and the erfc route ${m`\tfrac{1}{2}\operatorname{erfc}(-x/\sqrt{2})`}.`,
    ],
    flag: updatingFlag(got), waiting: got.result ? null : pending(got, spec, redraw),
    view: () => {
      const res = got.result, idx = Array.from(res.xs.keys()).filter((i) => res.xs[i] <= -1);
      const kap = plot({
        x: { min: -37.5, max: -1, title: 'x' }, y: { log: true, title: 'κ' }, width: 420, height: 280,
        layers: [
          { type: 'line', points: idx.map((i) => [res.xs[i], 1 + res.xs[i] ** 2]), color: MUTED, dash: '4 3', label: '1 + x²', end: '1 + x²' },
          { type: 'line', points: idx.map((i) => [res.xs[i], res.kappa[i]]), color: INK, label: 'κ(x)', end: 'κ' },
          { type: 'line', points: idx.map((i) => [res.xs[i], res.xs[i] ** 2]), color: MUTED, dash: '1 3', label: 'x²', end: 'x²' },
        ],
        label: 'condition number of Phi against x, between x squared and one plus x squared',
      });
      const floor = 1e-17, rel = (id) => envelope(res.xs, res.series[id].rel, idx, 120).map(([x, e]) => [x, Math.max(floor, e)]);
      const errs = plot({
        x: { min: -37.5, max: -1, title: 'x' }, y: { log: true, min: floor, max: 1e-11, title: 'relative error' }, width: 420, height: 280,
        layers: [
          { type: 'line', points: idx.map((i) => [res.xs[i], res.xs[i] ** 2 * U]), color: MUTED, dash: '4 3', label: 'x²u', end: 'x²u' },
          { type: 'line', points: rel('erfc'), color: 'var(--m5)', thin: true, label: 'erfc route', end: 'erfc' },
          { type: 'line', points: rel('M7-nosplit'), color: 'var(--m3)', thin: true, label: 'M7 without split', end: 'no split' },
          { type: 'line', points: rel('M7'), color: INK, label: 'M7', end: 'M7' },
        ],
        label: 'relative error of the erfc route, of M7 without the exact-square split, and of M7, against x',
      });
      const max = (id) => Math.max(...idx.map((i) => res.series[id].rel[i]));
      return {
        answer: { text: `The erfc route reaches <strong>${e2s(max('erfc'), 1)}</strong> and M7 without the split ${e2s(max('M7-nosplit'), 1)}, both growing like ${m`x^2 u`}; M7 stays at <strong>${e2s(max('M7'), 1)}</strong>. That growth is avoidable: it comes from rounding inside the method, not from the input.` },
        body: [
          el('div', { class: 'cols' }, [
            el('div', {}, [...section(1, 'The condition number', `${evidenceHtml('T')} For ${m`x < 0`}: ${m`x^2 < \kappa_\Phi(x) < 1 + x^2`}. At ${m`x = -30`}, ${m`\kappa \approx 900`}.`), kap]),
            el('div', {}, [...section(2, 'Avoidable error', `Worst error per slice of x. Dashed: ${m`x^2 u`}, what one rounding of ${m`x`} or ${m`x^2`} costs once amplified.`), errs]),
          ]),
          el('p', { class: 'small muted', html: `The fourth way, ${m`1 - \Phi(-x)`}, is off the scale: relative error 1 below x ≈ −8.3 (theory card).` }),
        ],
        rows: idx.map((i) => ({ x: res.xs[i], kappa: res.kappa[i], erfc: res.series.erfc.rel[i], nosplit: res.series['M7-nosplit'].rel[i], M7: res.series.M7.rel[i] })),
        summary: { maxErfc: max('erfc'), maxNoSplit: max('M7-nosplit'), maxM7: max('M7') },
      };
    },
    why: `the input ${m`x`} itself is exact, so an error that grows like ${m`x^2 u`} is the method's doing. The erfc route rounds ${m`x/\sqrt{2}`}; the naive ${m`e^{-x^2/2}`} rounds ${m`x^2`}. Splitting ${m`x^2 = a_h^2 + a_l(a_h + x)`} with an exact ${m`a_h^2`} removes it.`,
    notes: [`Unavoidable error is what a perturbation of the input by one rounding causes: ${m`\kappa u`}. A good method stays within a small multiple of it; M7 stays far below it here, because the inputs are exact doubles.`],
  });
}

/* ---------- E16 · GELU ---------- */

let geluCache = null;   // measured once per page load: it does not depend on any input

function e16() {
  const time = (f) => { const t0 = performance.now(); let s = 0; for (let i = 0; i < 100000; i++) s += f(-10 + (i % 2001) * 0.01); return { ns: ((performance.now() - t0) * 1e6) / 100000, s }; };
  geluCache ??= { ...geluMaxError(), te: time(gelu), tt: time(geluTanh) };
  const { maxError, at, te, tt } = geluCache;
  const diff = plot({
    x: { min: -10, max: 10, title: 'x' }, y: { title: 'difference' }, width: 640, height: 220,
    layers: [{ type: 'hline', at: 0, color: MUTED, dash: false }, { type: 'line', points: curve((x) => gelu(x) - geluTanh(x), -10, 10, 800), color: INK, label: 'x Φ(x) − tanh approximation' }],
    label: 'difference between the exact GELU and its tanh approximation over minus ten to ten',
  });
  return labPanel({
    hw: 'hw06', id: 'E16', title: 'E16 · Φ inside a neural network: GELU', name: 'E16-gelu',
    question: `${m`\operatorname{GELU}(x) = x\,\Phi(x)`} is the activation of BERT and GPT-2. How good is the tanh approximation they were trained with?`,
    steps: [
      `exact: ${m`x\,\Phi(x)`} with M7;`,
      `approximation: ${m`\tfrac{1}{2}x\big(1 + \operatorname{tanh}(\sqrt{2/\pi}\,(x + 0.044715\,x^3))\big)`};`,
      'their difference on [−10, 10], and the time per call.',
    ],
    view: () => ({
      answer: { text: `The approximation is off by at most <strong>${e2s(maxError, 2)}</strong> (at x = ${at.toFixed(2)}): far below what matters for a network, far above double precision. Time per call: exact ${te.ns.toFixed(0)} ns, tanh ${tt.ns.toFixed(0)} ns (this browser).` },
      body: [...section(1, 'Exact minus approximation', 'Largest near x ≈ ±2.7, where the cubic correction stops matching the curvature of Φ.'), figure(diff)],
      summary: { maxError, at, nsExact: te.ns, nsTanh: tt.ns },
    }),
    why: 'the tanh form exists because erf was missing or slow on the hardware of 2016 [S: Hendrycks & Gimpel 2016]. With a fast Φ the exact form is available; frameworks now offer both.',
    notes: ['GELU weighs each input by the probability that a standard normal falls below it: a soft version of ReLU’s “keep if positive”.'],
  });
}

startPage({
  shell: hw06Shell('normal.html'),
  sticky: STICKY,
  memory: MEMORY,
  preserve: true,
  render: (api) => {
    const inputs = readInputs(api.state), page = readPage(api.state);
    const error = inputs.error ?? page.error;
    dock({ ...inputs, error }, api.update, OWN, page);
    if (error) return [rejected(error)];
    const redraw = () => api.draw();
    return [
      abstract({
        question: 'Φ(x), the area under the bell curve up to x, has no formula. How do you compute it to full double precision, including the far lower tail where p-values live?',
        findings: [
          '<strong>Compute the tail directly.</strong> Written as 1 − Φ(−x), the lower tail is 7 % wrong at x = −8 and exactly 0 from x = −9.',
          '<strong>Series near 0, continued fraction in the tails.</strong> This hybrid (M7) stays below 7.6·10⁻¹⁵ relative error on all of [−37.5, 8.25]. A fixed Chebyshev fit (M8) reaches 5·10⁻¹⁵ with the same work at every x, and is the fastest accurate method.',
          '<strong>Checked</strong> against 80-digit values from two independent methods (which agree to 10⁻⁶⁸) and against every row of the NIST table.',
          '<strong>Avoidable error.</strong> The textbook erfc route and a plain e^(−x²/2) lose up to 10⁻¹³ in the tail (it grows like x²·u); writing x² exactly in two pieces removes it.',
        ],
        sections: [['theory', 'The integral with no formula'], ['E6', 'E6 · calculator'], ['E7', 'E7 · accuracy map'], ['E8', 'E8 · cost'], ['E9', 'E9 · reference checks'], ['E10', 'E10 · conditioning'], ['E16', 'E16 · GELU']],
      }),
      anchor('theory', theory()), anchor('E6', e6(page)), anchor('E7', e7(page, redraw)), anchor('E8', e8(page, redraw)), anchor('E9', e9()), anchor('E10', e10(page, redraw)), anchor('E16', e16()),
    ];
  },
});
