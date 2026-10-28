/* clt-page.js — the CLT page (E5): the standardised sum Zₙ = (Sₙ − nμ)/(σ√n)
   (for Rademacher simply Sₙ/√n) against N(0, 1) — a lattice-aligned histogram
   with a "naive bins" toggle, the empirical CDF against Φ and the exact CDF,
   a Q-Q plot, the Kolmogorov–Smirnov distance against n for two values of m
   (where the simulation meets its own noise floor), and Bernoulli at small p.
   The maths is in ../core/exact.js (ksToNormal) and ../core/estimate.js. */

import { el, field } from '../../../assets/js/ui/dom.js';
import { startPage } from '../../../assets/js/ui/page.js';
import { plot, short } from '../../../assets/js/ui/plot.js';
import { modelFrom } from '../core/models.js';
import { GRID, column } from '../core/simulate.js';
import { lawOfTotal, ksToNormal } from '../core/exact.js';
import { normPdf, normCdf } from '../core/numeric.js';
import { atoms, latticeHistogram, binned, ksToContinuous, ksToExact, qqPoints, moments } from '../core/estimate.js';
import { readRun, runCard } from './run-input.js';
import { getRun, pending, updatingFlag } from './run.js';
import { labPanel, section, table } from './lab-panel.js';
import { SIM, EXACT, LIMIT, legend, layersLegend, figure, svgButton } from './widgets.js';
import { hw04Shell, STICKY, MEMORY } from './shell.js';

const nice = (n) => n.toLocaleString('en-US').replace(/,/g, '\u202f');
const BOUND = 'var(--m1)', MUTED = 'var(--muted)';
const BE = 0.4748;                  // Berry–Esseen constant, best known (Shevtsova 2011)
const KS_MEAN = 0.8687, KS_95 = 1.358;   // mean and 95 % quantile of the Kolmogorov law (√m·D under H₀)
const KNEE_M = [10000, 100000];
const P_LIST = [0.5, 0.1, 0.01];
const SHADE = (i) => `color-mix(in srgb, var(--m1) ${[100, 62, 30][i]}%, var(--muted))`;
const N_CURVE = [...new Set(Array.from({ length: 49 }, (_, i) => Math.round(10 ** (1 + (3 * i) / 48))))];
const sci = (x) => (x < 1e-3 ? x.toExponential(2) : x.toPrecision(3));
const num = (x, d = 3) => `${x < 0 ? '−' : ''}${Math.abs(x).toFixed(d)}`;   // with a real minus sign

/** The standardisation of a step model: s ↦ (s − nμ)/(σ√n), and its lattice. */
const zmap = (model, n) => {
  const mu = n * model.mean, sd = model.sd * Math.sqrt(n);
  return { map: (s) => (s - mu) / sd, scale: sd, spacing: model.lattice / sd };
};

/** Everything measured at one checkpoint. */
function measure(model, res, c) {
  const n = res.grid[c], col = column(res, c), at = atoms(col), law = lawOfTotal(model, n), z = zmap(model, n);
  return { n, col, at, law, z, Dphi: ksToContinuous(at, normCdf, z.map), Dexact: ksToExact(at, law), exact: ksToNormal(model, n).D };
}

/* ---------- 1. histogram ---------- */

function histogramPanel(model, run, cp, naive) {
  const { n, z } = cp;
  const xr = [-4.2, 4.2];
  const xs = Array.from({ length: 141 }, (_, i) => xr[0] + (i / 140) * (xr[1] - xr[0]));
  const h = naive ? binned(cp.col, -4, 4, 32, z.map, cp.law) : latticeHistogram(cp.at, cp.law, model.lattice, { map: z.map, scale: z.scale, maxBins: 90 });
  const chart = plot({
    x: { min: xr[0], max: xr[1], title: model.kind === 'rademacher' ? 'Sₙ/√n' : 'Zₙ = (Sₙ − np)/√(np(1 − p))' }, y: { min: 0, title: 'density' }, height: 270,
    layers: [
      { type: 'bars', bars: h.bars, color: SIM, label: 'simulated density' },
      { type: 'points', points: h.exact.filter(([x]) => x > xr[0] && x < xr[1]), color: EXACT, r: 2.5, label: 'exact' },
      { type: 'line', points: xs.map((x) => [x, normPdf(x)]), color: LIMIT, dash: true, label: 'φ (limit)' },
    ],
  });
  const ratio = (0.25 / z.spacing);
  return {
    answer: { text: naive
      ? `With fixed bins of width 0.25 the histogram becomes a comb: at n = ${nice(n)} the atoms are ${z.spacing.toFixed(3)} apart, so a bin holds ${Math.floor(ratio)} or ${Math.ceil(ratio)} of them. The exact law binned the same way shows the same comb: it is the binning, not noise and not a failure of the CLT.`
      : `At n = ${nice(n)} the ${nice(run.m)} values of ${model.kind === 'rademacher' ? 'Sₙ/√n' : 'Zₙ'} sit on a lattice of spacing ${z.spacing.toFixed(3)}. With one bar per ${h.g > 1 ? `${h.g} atoms` : 'atom'}, ${cp.exact > 0.05 ? 'the histogram is still far from φ' : 'the histogram follows φ'}: measured KS distance to Φ ${cp.Dphi.toFixed(4)}, exact ${cp.exact.toFixed(4)}${run.m < 1000 ? ` (with only ${run.m} attackers the measured value is mostly noise)` : ''}.` },
    body: [
      ...section(1, naive ? 'Naive bins (the wrong way)' : 'Lattice-aligned histogram', naive
        ? 'Bins of a fixed width that ignores the lattice. Switch back to "aligned" to see the artefact disappear.'
        : 'Every bar covers a whole number of lattice points, with edges halfway between them, and its height is a density, so it sits on the same scale as φ.'),
      figure(chart, `${model.label()}, n = ${nice(n)}, m = ${nice(run.m)}, seed ${run.seed}.`),
      el('div', { class: 'row end' }, [svgButton(chart, `clt-hist-${n}-${run.seed}`)]),
      layersLegend({ limit: 'φ, the N(0, 1) density' }),
    ],
  };
}

/* ---------- 2. ECDF ---------- */

function ecdfPanel(model, run, cp) {
  const { at, law, z, n } = cp;
  // ECDF and exact CDF as staircases on |z| ≤ 4.5; the largest gap to Φ, where it happens
  const ecdf = [[-4.5, 0]], exactCdf = [[-4.5, 0]];
  let F = 0, Dx = 0, D = 0;
  for (let i = 0; i < at.values.length; i++) {
    const x = z.map(at.values[i]), before = F;
    F += at.counts[i] / at.m;
    const g = Math.max(Math.abs(F - normCdf(x)), Math.abs(before - normCdf(x)));
    if (g > D) { D = g; Dx = x; }
    if (x >= -4.5 && x <= 4.5) ecdf.push([x, F]);
  }
  let G = 0;
  for (let k = 0; k < law.s.length; k++) { G += law.prob[k]; const x = z.map(law.s[k]); if (x >= -4.5 && x <= 4.5) exactCdf.push([x, G]); }
  ecdf.push([4.5, 1]); exactCdf.push([4.5, 1]);
  const xs = (a, b) => Array.from({ length: 121 }, (_, i) => a + (i / 120) * (b - a));
  const phi = (a, b) => xs(a, b).map((x) => [x, normCdf(x)]);
  const w = Math.max(4 * z.spacing, 0.15);
  const layers = (a, b, h) => [
    { type: 'step', points: exactCdf.filter(([x]) => x >= a - z.spacing && x <= b + z.spacing), color: EXACT, label: 'exact Fₙ' },
    { type: 'step', points: ecdf.filter(([x]) => x >= a - z.spacing && x <= b + z.spacing), color: SIM, label: 'ECDF' },
    { type: 'line', points: phi(a, b), color: LIMIT, dash: true, label: 'Φ' },
    Dx >= a && Dx <= b ? { type: 'vline', at: Dx, color: MUTED, text: h ? `largest gap ${D.toFixed(4)}` : null } : null,
  ].filter(Boolean);
  const full = plot({ x: { min: -4, max: 4, title: 'z' }, y: { min: 0, max: 1, title: 'P(Zₙ ≤ z)' }, height: 260, layers: layers(-4, 4, true) });
  const zoom = plot({ x: { min: -w, max: w, title: 'z (zoom around 0)' }, y: { min: normCdf(-w) - 0.05, max: normCdf(w) + 0.05, title: 'P(Zₙ ≤ z)' }, height: 260, layers: layers(-w, w, false) });
  return {
    answer: { text: `${cp.Dexact > 0.05 ? `With m = ${nice(run.m)} the ECDF is a coarse staircase, far even from the exact Fₙ.` : cp.exact > 0.05 ? `At n = ${nice(n)} the ECDF and the exact Fₙ coincide, but both are visibly away from Φ.` : `The three CDFs coincide to the eye at n = ${nice(n)}.`} The largest gap between the ECDF and Φ is <strong>${D.toFixed(4)}</strong> at z ≈ ${num(Dx, 2)}. Between the exact Fₙ and Φ it is ${cp.exact.toFixed(4)}: the error of the CLT at this n. Between the ECDF and Fₙ it is ${cp.Dexact.toFixed(4)}: sampling noise, about ${KS_MEAN}/√m = ${(KS_MEAN / Math.sqrt(run.m)).toFixed(4)}.` },
    body: [
      ...section(1, 'Empirical CDF, exact CDF, Φ', 'The ECDF climbs by 1/m at each attacker\'s value; the exact Fₙ jumps at each lattice point; Φ is smooth. The Kolmogorov–Smirnov distance is the largest vertical gap.'),
      el('div', { class: 'cols' }, [full, zoom]),
      el('p', { class: 'caption', html: `Right: the zoom near 0, where the jumps are largest (each atom near 0 has mass ≈ ${(z.spacing * normPdf(0)).toFixed(4)}). A step function cannot follow a smooth curve closer than half a jump: this is why the distance cannot fall faster than 1/√n.` }),
      legend([['line', SIM, 'ECDF (simulation)'], ['line', EXACT, 'exact Fₙ'], ['dash', LIMIT, 'Φ (limit)']]),
    ],
  };
}

/* ---------- 3. Q-Q plot ---------- */

function qqPanel(model, run, cp) {
  const pts = qqPoints(cp.col, cp.z.map, 2000);
  const mom = moments(cp.col);
  const chart = plot({
    x: { min: -4.2, max: 4.2, title: 'N(0, 1) quantile' }, y: { min: -4.5, max: 4.5, title: 'sample quantile of Zₙ' }, height: 300,
    layers: [
      { type: 'line', points: [[-4.2, -4.2], [4.2, 4.2]], color: LIMIT, dash: true, label: 'y = x', hover: false },
      { type: 'points', points: pts, color: SIM, r: 2, label: 'sample quantile' },
    ],
  });
  return {
    answer: { text: `${Math.abs(model.skewness / Math.sqrt(cp.n)) > 0.2 || cp.exact > 0.05 ? `At n = ${nice(cp.n)} the points follow the diagonal in the middle but leave it in the tails: the sample is not yet normal.` : `The points lie on the diagonal: the sample of ${nice(run.m)} looks normal at n = ${nice(cp.n)}.`} Skewness ${num(mom.skewness)} (theory ${num(model.skewness / Math.sqrt(cp.n))}), excess kurtosis ${num(mom.exKurtosis)} (theory ${num(model.excessKurtosis / cp.n)}).${model.skewness ? ' A skewed law bends the plot upward at the right end at small n.' : ''}` },
    body: [
      ...section(1, 'Quantile against quantile', 'The j-th smallest value against Φ⁻¹((j − ½)/m). On the diagonal = normal. Flat runs are the lattice (many attackers share one value); a bend at the ends is skewness or heavy tails.'),
      chart,
    ],
  };
}

/* ---------- 4. KS distance against n: the knee ---------- */

function kneePanel(model, runs) {
  const per = runs.map((r) => ({ m: r.m, rows: r.grid.map((n, c) => { const cp = measure(model, r, c); return { n, D: cp.Dphi, De: cp.Dexact }; }) }));
  const exactCurve = N_CURVE.map((n) => [n, ksToNormal(model, n).D]);
  const beCurve = N_CURVE.map((n) => [n, (BE * model.berryEsseenRatio) / Math.sqrt(n)]);
  const shapes = [{ hollow: false }, { hollow: true }];
  const chart = plot({
    x: { log: true, min: 8, max: 12500, ticks: [10, 100, 1000, 10000], title: 'n (systems)' }, y: { log: true, min: 1e-3, max: 0.3, title: 'KS distance to Φ' }, height: 320,
    layers: [
      { type: 'line', points: beCurve, color: BOUND, dash: '9 4', label: 'Berry–Esseen bound', end: 'Berry–Esseen' },
      { type: 'line', points: exactCurve, color: EXACT, label: 'exact sup|Fₙ − Φ|', end: 'exact' },
      ...per.map((p) => ({ type: 'hline', at: KS_MEAN / Math.sqrt(p.m), color: MUTED, anchor: 'start', text: `noise floor 0.87/√m, m = ${nice(p.m)}` })),
      // the larger m (hollow, bigger) first, so the smaller m's filled dots stay visible on top
      ...per.map((p, i) => ({ type: 'points', points: p.rows.map((r) => [r.n, r.D]), color: SIM, r: shapes[i].hollow ? 6.5 : 4, hollow: shapes[i].hollow, label: `measured, m = ${nice(p.m)}` })).reverse(),
    ],
  });
  // where each m stops seeing the theorem: the first n with exact < 95 % noise level
  const knee = per.map((p) => p.rows.find((r) => ksToNormal(model, r.n).D < KS_95 / Math.sqrt(p.m))?.n ?? null);
  const rows = per[0].rows.map((r, c) => {
    const ex = ksToNormal(model, r.n).D;
    return [nice(r.n), r.D.toFixed(4), per[1].rows[c].D.toFixed(4), ex.toFixed(4), ((BE * model.berryEsseenRatio) / Math.sqrt(r.n)).toFixed(4),
      ...per.map((p) => (ex > KS_95 / Math.sqrt(p.m) ? el('span', { class: 'ok', text: '✓ visible' }) : el('span', { class: 'muted', text: 'below noise' })))];
  });
  return {
    answer: { text: `The measured distance follows the exact one (≈ ${(100 * ksToNormal(model, 10000).D).toFixed(3)}/√n) down to the noise floor 0.87/√m, then flattens: with m = ${nice(per[0].m)} the CLT error drops below the simulation's resolution ${knee[0] ? `from n = ${nice(knee[0])}` : 'only beyond n = 10 000'}, with m = ${nice(per[1].m)} ${knee[1] ? `from n = ${nice(knee[1])}` : 'only beyond n = 10 000 (it stays visible on the whole grid)'}. ${knee[0] && knee[1] ? 'Ten times more attackers move the knee about ten times further' : 'The more attackers, the further to the right the knee'}: to see the theorem at size n, m must be well above 5n${model.kind === 'bernoulli' && model.p !== 0.5 ? ' (more for a skewed coin, whose CLT error is larger)' : ''}.` },
    body: [
      ...section(1, 'The distance to the normal law against n', `Filled points: m = ${nice(per[0].m)}; hollow: m = ${nice(per[1].m)} (the first ${nice(per[0].m)} attackers are the same). Orange: the exact distance, falling like 1/√n (slope −½). Blue: the Berry–Esseen guarantee. Grey: the typical size of pure sampling noise for each m.`),
      figure(chart, `${model.label()}, seed ${runs[0].seed}.`),
      el('div', { class: 'row end' }, [svgButton(chart, `clt-knee-${runs[0].seed}`)]),
      legend([['dot', SIM, 'measured (filled m = 10⁴, hollow m = 10⁵)'], ['line', EXACT, 'exact'], ['dash', BOUND, 'Berry–Esseen'], ['dash', MUTED, 'noise floors']]),
      ...section(2, 'Per checkpoint', `"visible" when the exact CLT error exceeds the 95 % noise level ${KS_95}/√m, so a simulation of that size can detect it.`),
      table(['n', `measured, m = ${nice(per[0].m)}`, `measured, m = ${nice(per[1].m)}`, 'exact', 'Berry–Esseen', `error visible at m = ${nice(per[0].m)}?`, `at m = ${nice(per[1].m)}?`], rows),
    ],
    rows: per[0].rows.map((r, c) => ({ n: r.n, D_m1e4: r.D, D_m1e5: per[1].rows[c].D, exact: ksToNormal(model, r.n).D, berry_esseen: (BE * model.berryEsseenRatio) / Math.sqrt(r.n), noise_to_exact_m1e4: r.De, noise_to_exact_m1e5: per[1].rows[c].De })),
  };
}

/* ---------- 5. Bernoulli at small p (exact only) ---------- */

function bernoulliPanel() {
  const models = P_LIST.map((p) => modelFrom({ model: 'ber', p }));
  const curves = models.map((md) => N_CURVE.map((n) => [n, ksToNormal(md, n).D]));
  const chart = plot({
    x: { log: true, min: 8, max: 12500, ticks: [10, 100, 1000, 10000], title: 'n (systems)' }, y: { log: true, min: 2e-3, max: 0.7, title: 'exact KS distance to Φ' }, height: 280,
    layers: [
      ...curves.map((c, i) => ({ type: 'line', points: c, color: SHADE(i), label: `p = ${P_LIST[i]}`, end: `p = ${P_LIST[i]}` })),
      { type: 'line', points: N_CURVE.map((n) => [n, 0.399 / Math.sqrt(n)]), color: MUTED, dash: true, thin: true, label: '0.399/√n', hover: false },
    ],
  });
  const at = [10, 100, 1000, 10000];
  return el('div', { class: 'card' }, [
    el('h2', { text: 'Bernoulli: the smaller p, the slower the CLT' }),
    el('p', { html: 'The exact distance between the standardised Bernoulli sum and N(0, 1), computed from the binomial law: no simulation, so no noise floor. All three fall like 1/√n, but a rare-breach coin starts much further away.' }),
    chart,
    legend(P_LIST.map((p, i) => ['line', SHADE(i), `Bernoulli(${p})`]).concat([['dash', MUTED, '0.399/√n (Rademacher; under the p = 0.5 line)']])),
    table(['p', ...at.map((n) => `KS at n = ${nice(n)}`), 'skewness at n = 100', 'Berry–Esseen ρ/σ³'], models.map((md, i) => [String(P_LIST[i]), ...at.map((n) => ksToNormal(md, n).D.toFixed(4)), (md.skewness / 10).toFixed(3), md.berryEsseenRatio.toFixed(2)])),
    el('details', { class: 'explain' }, [el('summary', { text: 'What am I looking at?' }), el('div', {}, [
      el('p', { html: 'The skewness of the standardised sum is (1 − 2p)/√(np(1 − p)): for p = 0.01 at n = 100 it is about 1, a visibly lopsided law, and it only fades like 1/√n. The Berry–Esseen factor ρ/σ³ = (p² + (1 − p)²)/√(p(1 − p)) is 1 at p = ½ and about 9.85 at p = 0.01: the rarer the event, the more systems it takes before the normal approximation can be trusted.' }),
      el('p', { class: 'practice', html: 'Rare breaches (p = 0.01) are better described by the Poisson limit when np stays moderate: at n = 100 the count of breaches is close to Poisson(1), not to a normal law. Using a normal approximation there underestimates the chance of several breaches at once.' }),
    ])]),
  ]);
}

startPage({
  shell: hw04Shell('clt.html'),
  sticky: STICKY,
  memory: MEMORY,
  preserve: true,
  render: (api) => {
    const { state, update } = api;
    const run = readRun(state);
    const model = modelFrom(run);
    const redraw = () => api.draw();
    const ci = Math.min(GRID.length - 1, Math.max(0, Number(state.ni ?? 2)));
    const naive = state.bins === 'naive';
    const spec = { model: { model: run.model, p: run.p }, run: { m: run.m, grid: GRID, seed: run.seed, keepPaths: 0 } };
    const got = getRun(spec, redraw, 'main');
    const kneeSpecs = KNEE_M.map((m) => ({ model: spec.model, run: { ...spec.run, m } }));
    const knees = kneeSpecs.map((s, i) => getRun(s, redraw, `knee${i}`));
    const kneeWait = knees.find((k) => !k.result);
    const cp = got.result ? measure(model, got.result, ci) : null;
    const flag = updatingFlag(got);
    const waiting = got.result ? null : pending(got, spec, redraw);

    const shown = el('span', { class: 'eq', text: `n = ${nice(GRID[ci])}` });
    const nControl = field('checkpoint n', el('input', { type: 'range', min: 0, max: GRID.length - 1, step: 1, value: String(ci), 'aria-label': 'checkpoint n',
      oninput: (e) => { shown.textContent = `n = ${nice(GRID[Number(e.target.value)])}`; }, onchange: (e) => update({ ni: Number(e.target.value) === 2 ? null : e.target.value }) }));
    const binsControl = field('bins', el('select', { onchange: (e) => update({ bins: e.target.value === 'naive' ? 'naive' : null }) }, [
      el('option', { value: 'lattice', text: 'aligned with the lattice', selected: !naive }), el('option', { value: 'naive', text: 'naive: fixed width 0.25', selected: naive })]));
    const zname = run.model === 'rad' ? 'Sₙ/√n' : '(Sₙ − np)/√(np(1 − p))';
    return [
      runCard(run, update),
      labPanel({
        id: 'E5', title: `The histogram of ${zname} against φ`, name: `E5-hist-${run.model}-${run.seed}`,
        question: `Does the distribution of ${zname} across the attackers take the shape of the standard normal density?`,
        steps: [`Simulate m = ${nice(run.m)} attackers (${model.label()}).`, `At the chosen n, standardise every total: ${zname}.`, 'Draw their histogram as a density, with the exact law and φ over it.'],
        controls: [nControl, shown, el('div', { class: 'vrule' }), binsControl],
        hints: ['<strong>checkpoint n</strong>: from 10 to 10 000 systems (release the slider to redraw). At n = 10 the lattice is coarse and the fit rough; by 1 000 the bars hug φ.',
          '<strong>bins</strong>: "naive" shows what happens when bins ignore the lattice (a comb), and that the exact law binned the same way shows it too.'],
        flag, waiting, view: () => histogramPanel(model, run, cp, naive),
        why: 'The CLT is a statement about shape: whatever a single step looks like, the standardised sum looks normal. The histogram is the most direct picture of it; the next panels measure it.',
        notes: [
          'For Rademacher Sₙ takes the values −n, −n + 2, …, n, so Sₙ/√n lives on a lattice of spacing 2/√n. A histogram must respect it: bins of exactly one (or g) lattice points, edges halfway between them. Any other width makes some bins catch one more atom than their neighbours.',
          'Heights are densities (fraction ÷ width), so the area of the bars is 1 and they are directly comparable with φ. The exact dots are the binomial probabilities over the same atoms, divided by the same width (note 02 §3).',
        ],
      }),
      labPanel({
        id: 'E5-ecdf', title: 'Empirical CDF against Φ', name: `E5-ecdf-${run.model}-${run.seed}`,
        question: 'How far, at most, is the distribution of the attackers\' standardised scores from the normal one?',
        steps: ['Sort the m standardised values: the ECDF rises by 1/m at each.', 'Draw it with the exact CDF Fₙ and with Φ.', 'Measure the largest vertical gap: the Kolmogorov–Smirnov distance.'],
        flag, waiting, view: () => ecdfPanel(model, run, cp),
        notes: [
          'The KS distance D = sup |F̂ − Φ| splits in two by the triangle inequality: the error of the theorem, sup |Fₙ − Φ|, and the sampling noise, sup |F̂ − Fₙ|. The second is about 0.87/√m (Kolmogorov). The next-but-one panel shows what happens when the first becomes smaller than the second.',
          'With ties (many attackers on the same lattice point) the ECDF jumps once per distinct value; the distance is checked just before and just after each jump (KS note, lemma 2).',
        ],
      }),
      labPanel({
        id: 'E5-qq', title: 'Q-Q plot against N(0, 1)', name: `E5-qq-${run.model}-${run.seed}`,
        question: 'Do the quantiles of the attackers\' standardised scores match those of a normal law, in the centre and in the tails?',
        steps: ['Sort the m values.', 'Plot the j-th against the normal quantile Φ⁻¹((j − ½)/m), thinned to 2 000 points.'],
        flag, waiting, view: () => qqPanel(model, run, cp),
        notes: ['The Q-Q plot magnifies the tails, where histograms and CDFs are flat and hide differences. A lattice shows as a staircase along the diagonal (most visible at small n); skewness bends one end away from it.'],
      }),
      labPanel({
        id: 'E5-knee', title: 'Where simulation stops seeing the theorem', name: `E5-knee-${run.model}-${run.seed}`,
        question: 'How fast does the distance to the normal law shrink with n, and from which n can a simulation of m attackers no longer tell the difference?',
        steps: [`Simulate m = 10⁴ and m = 10⁵ attackers (${model.label()}, seed ${run.seed}).`, 'At each checkpoint measure the KS distance of the standardised totals to Φ.', 'Draw it with the exact distance sup|Fₙ − Φ|, the Berry–Esseen bound and the noise floor 0.87/√m.'],
        flag: updatingFlag(knees.find((k) => k.stale)),
        waiting: kneeWait ? pending(kneeWait, kneeSpecs[knees.indexOf(kneeWait)], redraw) : null,
        view: () => kneePanel(model, knees.map((k) => k.result)),
        why: 'This is the reason for the choice of m (note 03 §2): the CLT error ≈ 0.4/√n is visible only while it exceeds the noise ≈ 0.87/√m, i.e. while m ≫ 5n. Past the knee every n looks equally "normal" to the simulation, and only the exact computation can still see the theorem at work.',
        notes: [
          'Exact distance: for even n, the atom at 0 has mass P(Sₙ = 0) ≈ √(2/(πn)), and a step function cannot be closer than half a jump to a continuous curve, so sup|Fₙ − Φ| ≥ ≈ 0.399/√n (CLT note, lemma B). The exact values show that this floor is essentially reached.',
          'Berry–Esseen: sup|Fₙ − Φ| ≤ C·ρ/(σ³√n) with C = 0.4748 (best known constant, Shevtsova 2011; 📌 to verify in the source). It is a guarantee for every step law with a third moment; for Rademacher it is within 20 % of the truth.',
          'The noise floor 0.8687/√m is the mean of √m·D for a sample from the true law (Kolmogorov distribution); 1.358/√m is its 95 % quantile, used for the "visible" verdict.',
        ],
      }),
      bernoulliPanel(),
    ];
  },
});
