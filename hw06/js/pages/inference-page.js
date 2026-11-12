/* inference-page.js — Φ at work in hypothesis testing (note 06 §1): p-values are tail
   areas, computed by every method of Ex. 2 side by side; under H₀ they are uniform
   (simulated, worker); 5σ and Bonferroni push the thresholds into the far tail.
   [[z-test and p-values]], [[Probability integral transform]]. */

import { el, field } from '../../../assets/js/ui/dom.js';
import { startPage } from '../../../assets/js/ui/page.js';
import { labPanel, section, table } from '../../../assets/js/ui/lab.js';
import { plot } from '../../../assets/js/ui/plot.js';
import { nice, sig, sup } from '../../../assets/js/ui/format.js';
import { m, M } from '../../../assets/js/ui/math.js';
import { show, onCommit, numberOr } from '../../../assets/js/ui/dock.js';
import { METHODS, logPhi } from '../core/normal.js';
import { pOneSided, pTwoSided, zFromData, bonferroniZ, THRESHOLDS } from '../core/inference.js';
import { readInputs, dock, rejected } from './inputs.js';
import { RIEMANN, LEBESGUE, REF, MUTED, legend, figure, svgButton, evidenceHtml, getRun, pending, updatingFlag, abstract, anchor } from './widgets.js';
import { hw06Shell, STICKY, MEMORY } from './shell.js';

const html = (s) => el('span', { html: s });
const e2s = (x, d = 2) => (x === 0 ? '0' : !Number.isFinite(x) ? String(x) : x.toExponential(d));
const LOG10E = Math.LOG10E;

/* ---------- this page's row in the dock ---------- */

function readPage(state) {
  const mode = state.mode === 'data' ? 'data' : 'z';
  const z0 = numberOr(state.z, 5), xbar = numberOr(state.xbar, 10.6), mu0 = numberOr(state.mu0, 10), sigma = numberOr(state.sigma, 2), n = Math.round(numberOr(state.n, 100));
  const R = Math.round(numberOr(state.R, 100000)), delta = numberOr(state.delta, 2.5);
  let error = null;
  if (!(sigma > 0)) error = `σ must be positive (got ${sigma}).`;
  else if (!(n >= 1 && n <= 1e9)) error = `n must be between 1 and 10⁹ (got ${n}).`;
  else if (!(R >= 1000 && R <= 1000000)) error = `R must be between 1 000 and 1 000 000 (got ${R}).`;
  else if (!(delta >= 0 && delta <= 10)) error = `the effect δ must be between 0 and 10 (got ${delta}).`;
  const z = mode === 'data' ? zFromData(xbar, mu0, sigma, n) : z0;
  if (!error && !(Math.abs(z) <= 1000)) error = `|z| must be at most 1000 (got ${z}).`;
  return { mode, z0, xbar, mu0, sigma, n, z, R, delta, error };
}

const OWN = {
  id: 'inference', label: 'this page',
  build(apply, later) {
    const mode = el('select', { 'aria-label': 'compute the p-value from', onchange: (e) => apply({ mode: e.target.value }) },
      [el('option', { value: 'z', text: 'a z value' }), el('option', { value: 'data', text: 'sample data' })]);
    const num = (label, key) => { const i = el('input', { type: 'number', class: 'num', step: 'any', 'aria-label': label }); onCommit(i, () => apply({ [key]: i.value }), later); return i; };
    const z = num('z statistic', 'z'), xbar = num('sample mean', 'xbar'), mu0 = num('mean under the null', 'mu0'), sigma = num('known standard deviation', 'sigma'), n = num('sample size', 'n');
    const R = num('simulated tests', 'R'), delta = num('effect under H1, in standard errors', 'delta');
    return {
      nodes: [el('div', { class: 'row' }, [field('E12 from', mode), field('z', z), field('x̄', xbar), field('μ₀', mu0), field('σ', sigma), field('n', n), el('span', { class: 'vrule' }), field('simulated tests R', R), field('effect δ', delta)])],
      refresh(v) { show(mode, v.mode); show(z, v.z0); show(xbar, v.xbar); show(mu0, v.mu0); show(sigma, v.sigma); show(n, v.n); show(R, v.R); show(delta, v.delta); },
    };
  },
  summary: (v) => `z = ${sig(v.z, 4)} · R = ${nice(v.R)}, δ = ${v.delta}`,
  notes: [
    '<strong>from</strong>: type z directly, or a sample (mean x̄ of n values, known σ) tested against μ₀: z = (x̄ − μ₀)/(σ/√n).',
    '<strong>R, δ</strong>: how many z-tests the simulation runs, and how far the true mean is from μ₀ under H₁, in standard errors.',
  ],
};

/* ---------- theory ---------- */

function theory() {
  const rows = THRESHOLDS.map((t) => [String(t.z), t.what, e2s(pOneSided(t.z), 4), e2s(pTwoSided(t.z), 4)]);
  return el('div', { class: 'card' }, [
    el('h2', { text: 'A p-value is a tail area' }),
    el('div', { class: 'cols' }, [
      el('div', {}, [
        el('div', { html: M`z = \frac{\bar x - \mu_0}{\sigma/\sqrt{n}}, \qquad p_{\text{one}} = Q(z) = 1 - \Phi(z), \qquad p_{\text{two}} = 2\,Q(|z|)` }),
        el('p', { class: 'small muted', html: `Under ${m`H_0`} the statistic is ${m`N(0, 1)`}; the p-value is the probability of a value at least as extreme: an integral of the bell curve, read in its tail.` }),
        el('div', { html: M`p = 1 - F(Z) \sim U(0, 1) \quad \text{under } H_0` }),
        el('p', { class: 'small muted', html: `${evidenceHtml('T')} The probability integral transform: if ${m`Z`} has a continuous CDF ${m`F`}, then ${m`F(Z)`} is uniform. A correct test rejects at level α exactly α of the time.` }),
      ]),
      el('div', {}, [
        el('h3', { class: 'panel-title', text: 'Thresholds people use' }),
        table(['z', '', 'one-sided p', 'two-sided p'], rows, 'prose words'),
        el('p', { class: 'small muted', html: `Bonferroni: to keep the chance of any false rejection among ${m`m`} tests below α, test each at ${m`\alpha/m`}: ${m`z^* = \Phi^{-1}(1 - \alpha/(2m))`}.` }),
      ]),
    ]),
  ]);
}

/* ---------- E12a · p-values by every method ---------- */

function calculator(page) {
  const z = page.z;
  const lpOne = logPhi(-z), rows = METHODS.map((x) => {
    const one = x.run(-z).value, two = 2 * x.run(-Math.abs(z)).value;
    const refOne = Math.exp(lpOne);
    const rel = refOne > 0 ? Math.abs(one - refOne) / refOne : NaN;
    return [`${x.id} · ${x.short}`, e2s(one, 6), e2s(two, 6), Number.isNaN(rel) ? '—' : rel === 0 ? '0' : e2s(rel, 1)];
  });
  const exp10 = (lpOne * LOG10E);
  const tiny = !(Math.exp(lpOne) > 0);
  return labPanel({
    hw: 'hw06', id: 'E12a', title: 'E12a · p-values by every method', name: `E12a-z${sig(z, 6)}`,
    question: `What p-value does each method of Ex. 2 give for ${m`z = ${sig(z, 6)}`}?`,
    steps: [page.mode === 'data' ? `from the data: ${m`z = (${page.xbar} - ${page.mu0}) / (${page.sigma}/\sqrt{${page.n}})`};` : 'take z from the dock;', `compute ${m`Q(z)`} and ${m`2Q(|z|)`} with every method;`, `compare with M7, and with ${m`\ln Q`} where ${m`Q`} underflows.`],
    view: () => ({
      answer: { text: tiny
        ? `At z = ${sig(z, 4)} the p-value is <strong>about 10${sup(Math.round(exp10))}</strong>: below the smallest double, so every method returns 0. Only the log form survives: ln p = ${sig(lpOne, 8)}.`
        : `One-sided <strong>p = ${e2s(Math.exp(lpOne), 4)}</strong>. ${z > 8.3 ? 'The methods that compute 1 − Φ(z) return 0 here: a “significance” of infinitely many σ.' : z > 5 ? 'The methods that subtract from 1 keep only a few digits here.' : 'Near the bulk every method agrees to several digits.'}` },
      body: [
        table(['method', 'one-sided p', 'two-sided p', 'rel. error (one-sided)'], rows),
        el('p', { class: 'small muted', html: `log form (M7): ${m`\ln Q(z) = ${sig(lpOne, 10)}`}, i.e. ${m`p \approx 10^{${exp10.toFixed(2)}}`}. Try z = 9 and z = 38.` }),
      ],
      rows: rows.map(([method, one, two, rel]) => ({ z, method, one, two, rel })),
      summary: { z, logQ: lpOne },
    }),
    why: 'a p-value of 10⁻²⁰ is a perfectly ordinary output of a large study; a method that returns 0 there turns “very unlikely” into “impossible”.',
    notes: ['Particle physics quotes significances in σ: z = 5 is one-sided p = 2.87·10⁻⁷. Genome-wide studies use p < 5·10⁻⁸. Both need the tail to several significant digits.'],
  });
}

/* ---------- E12b · p-values under H0 and H1 ---------- */

function simulation(page, inputs, redraw) {
  const spec = { kind: 'inference', args: { R: page.R, delta: page.delta, seed: inputs.seed } };
  const got = getRun(spec, redraw, 'E12b');
  return labPanel({
    hw: 'hw06', id: 'E12b', title: 'E12b · What p-values look like', name: `E12b-R${page.R}-d${page.delta}-seed${inputs.seed}`,
    question: `If ${m`H_0`} is true, are p-values really uniform? And what changes when it is false?`,
    steps: [`simulate ${nice(page.R)} z-tests with ${m`z \sim N(0, 1)`} (H₀) and ${nice(page.R)} with ${m`z \sim N(${page.delta}, 1)`} (H₁), seed ${inputs.seed};`, 'compute each two-sided p-value with M7;', 'histogram them in 20 bins, and test the H₀ histogram for flatness (χ²).'],
    flag: updatingFlag(got), waiting: got.result ? null : pending(got, spec, redraw),
    view: () => {
      const r = got.result, w = 1 / 20;
      const hist = (counts, color, label) => plot({
        x: { min: 0, max: 1, title: 'p-value' }, y: { min: 0, title: 'density' }, width: 420, height: 250,
        layers: [{ type: 'bars', bars: counts.map((c, i) => [i * w, (i + 1) * w, c / (r.R * w)]), color, label }, { type: 'hline', at: 1, color: REF, dash: false }],
        label: `histogram of ${label}`,
      });
      return {
        answer: { text: `Under H₀ the histogram is flat (χ² test of uniformity: <strong>p = ${r.h0.p.toFixed(3)}</strong>). Under H₁ the p-values pile up near 0: <strong>${(100 * r.power).toFixed(1)} %</strong> fall below 0.05 — the power of the test at δ = ${page.delta}.`, ok: r.h0.p > 0.001 },
        body: [
          el('div', { class: 'cols' }, [
            el('div', {}, [el('h3', { class: 'panel-title', text: 'H₀ true' }), hist(r.h0.counts, RIEMANN, 'p-values under the null')]),
            el('div', {}, [el('h3', { class: 'panel-title', text: `H₁ true (δ = ${page.delta})` }), hist(r.h1.counts, LEBESGUE, 'p-values under the alternative')]),
          ]),
          el('p', { class: 'small muted', text: 'The line at 1 is the uniform density.' }),
        ],
        rows: r.h0.counts.map((c, i) => ({ bin: i, h0: c, h1: r.h1.counts[i] })),
        summary: { R: r.R, delta: r.delta, seed: inputs.seed, chi2: r.h0.stat, chi2p: r.h0.p, power: r.power },
      };
    },
    why: 'uniformity under H₀ is what makes “reject when p < 0.05” a 5 % error rate; it holds only if Φ is computed right. A Φ that is off in the tail makes the small p-values wrong exactly where decisions are taken.',
    notes: ['The χ² test here is itself a p-value, computed from the incomplete gamma function: a p-value about p-values.'],
  });
}

/* ---------- E12c · Bonferroni and 5σ ---------- */

function bonferroni() {
  const ms = Array.from({ length: 91 }, (_, i) => 10 ** (i / 10));
  const zs = ms.map((mm) => [mm, bonferroniZ(0.05, mm)]);
  const chart = plot({
    x: { log: true, min: 1, max: 1e9, title: 'number of tests m' }, y: { min: 1.5, max: 7, title: 'z threshold' }, width: 640, height: 260,
    layers: [
      { type: 'hline', at: 5, color: MUTED, text: '5σ', anchor: 'start' },
      { type: 'line', points: zs, color: REF, label: 'z* for α = 5 %' },
      { type: 'points', points: [1, 1e3, 1e6].map((mm) => [mm, bonferroniZ(0.05, mm)]), color: LEBESGUE, r: 4, hover: false },
    ],
    label: 'Bonferroni z threshold against the number of tests, crossing 5 sigma near a million tests',
  });
  const rows = [1, 10, 1e3, 1e6, 1e9].map((mm) => [nice(mm), sig(bonferroniZ(0.05, mm), 8), e2s(0.05 / mm, 1)]);
  return labPanel({
    hw: 'hw06', id: 'E12c', title: 'E12c · Many tests push the threshold into the tail', name: 'E12c-bonferroni',
    question: 'With m tests and a 5 % chance of any false alarm, how extreme must z be?',
    steps: [`Bonferroni: each test at level ${m`0.05/m`};`, `the threshold ${m`z^* = -\Phi^{-1}(0.05/(2m))`}, computed with ${m`\Phi^{-1}`} in log form.`],
    view: () => ({
      answer: { text: `<strong>1.96</strong> for one test, <strong>4.06</strong> for a thousand, <strong>5.45</strong> for a million: a genome-wide scan lands on the physicists’ 5σ. Those thresholds need p-values near 10⁻⁸, accurate.` },
      body: [figure(chart), table(['m', 'z*', 'per-test p'], rows)],
      rows: rows.map(([m_, z, p]) => ({ m: m_, z, p })),
      summary: { thresholds: rows },
    }),
    why: 'the number of hypotheses a study tests moves the decision into the far tail of Φ, where only a carefully computed tail is reliable.',
    notes: ['Bonferroni is conservative (it ignores correlation between tests); it is the simplest correction and the one behind the genome-wide 5·10⁻⁸.'],
  });
}

startPage({
  shell: hw06Shell('inference.html'),
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
        question: 'Every z-test turns a statistic into a p-value, an area in the tail of the bell curve. How accurate must Φ be for that, and what do p-values look like?',
        findings: [
          '<strong>p-values are Φ in the tail.</strong> At 5σ the methods that subtract from 1 keep only a few digits; at 9σ they return p = 0; beyond 38σ only a log-space p survives (E12a).',
          '<strong>Uniform under the null.</strong> 10⁵ simulated tests give a flat histogram of p-values; under an alternative they pile up near 0, and the pile is the power (E12b).',
          '<strong>Many tests, far tail.</strong> Bonferroni at 5 % needs z = 1.96 for one test, 4.06 for a thousand and 5.45 for a million: the physicists’ 5σ (E12c).',
        ],
        sections: [['theory', 'A p-value is a tail area'], ['E12a', 'E12a · p-values by every method'], ['E12b', 'E12b · what p-values look like'], ['E12c', 'E12c · Bonferroni and 5σ']],
      }),
      anchor('theory', theory()), anchor('E12a', calculator(page)), anchor('E12b', simulation(page, inputs, redraw)), anchor('E12c', bonferroni()),
    ];
  },
});
