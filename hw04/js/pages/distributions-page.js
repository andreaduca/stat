/* distributions-page.js — the Distributions page (E2): histograms of Sₙ,
   Sₙ/n and Sₙ/√n across the m attackers at each checkpoint, each with its
   exact law and its limit (the three layers); one large panel per quantity
   with a slider over n; the Bernoulli drift of raw Sₙ/√n against the centred
   version; and the moments against theory. One simulation (in the worker)
   feeds every panel. */

import { el, field } from '../../../assets/js/ui/dom.js';
import { startPage } from '../../../assets/js/ui/page.js';
import { plot, short } from '../../../assets/js/ui/plot.js';
import { modelFrom } from '../core/models.js';
import { GRID, column } from '../core/simulate.js';
import { lawOfTotal } from '../core/exact.js';
import { normPdf } from '../core/numeric.js';
import { moments, scaleMoments, atoms, latticeHistogram, gofToExact, batchSE } from '../core/estimate.js';
import { readRun, runCard } from './run-input.js';
import { getRun, pending, updatingFlag } from './run.js';
import { labPanel, section, table, verdict } from './lab-panel.js';
import { SIM, EXACT, LIMIT, layersLegend, svgButton } from './widgets.js';
import { hw04Shell, STICKY, MEMORY } from './shell.js';

const DECADES = [10, 100, 1000, 10000];
const nice = (n) => n.toLocaleString('en-US').replace(/,/g, '\u202f');
let timer = null;   // the n-slider animation, stopped at every redraw

/* The three quantities as Sₙ/n^α. `center` subtracts nμ first (the centred
   Bernoulli version of the last panel). */
const QUANTITIES = [
  { id: 'S', label: 'Sₙ', alpha: 0 },
  { id: 'avg', label: 'Sₙ/n', alpha: 1 },
  { id: 'norm', label: 'Sₙ/√n', alpha: 0.5 },
];

/** Everything measured at one checkpoint, computed once per run. */
function checkpoint(res, model, c) {
  const n = res.grid[c], col = column(res, c);
  const at = atoms(col), law = lawOfTotal(model, n);
  return { n, col, at, law, mom: moments(col), gof: gofToExact(at, law),
    seSkew: batchSE(col, (v) => moments(v).skewness), seKurt: batchSE(col, (v) => moments(v).exKurtosis) };
}

/** The x range of a row, shared by its cells so the eye can compare widths. */
function rowRange(model, cps, q, center = false) {
  if (q.alpha === 1) return [model.values[0], model.values[1]];
  if (q.alpha === 0.5 && (model.kind === 'rademacher' || center)) {
    const s = center ? model.sd : 1;
    return [-4.2 * s, 4.2 * s];
  }
  let lo = Infinity, hi = -Infinity;
  for (const cp of cps) {
    const sc = cp.n ** q.alpha, sh = center ? cp.n * model.mean : 0;
    lo = Math.min(lo, (cp.at.values[0] - sh) / sc);
    hi = Math.max(hi, (cp.at.values.at(-1) - sh) / sc);
  }
  const pad = 0.04 * (hi - lo || 1);
  return [model.kind === 'bernoulli' && !center ? Math.max(model.values[0], lo - pad) : lo - pad, hi + pad];
}

/** One histogram with its three layers. */
function cell(model, cp, q, xr, { width = 300, height = 170, center = false, maxBins = 45, title = true } = {}) {
  const n = cp.n, sc = n ** q.alpha, sh = center ? n * model.mean : 0;
  const map = (s) => (s - sh) / sc;
  const h = latticeHistogram(cp.at, cp.law, model.lattice, { map, scale: sc, maxBins });
  const layers = [
    { type: 'bars', bars: h.bars, color: SIM, label: 'simulated density' },
    { type: 'points', points: h.exact.filter(([x]) => x >= xr[0] && x <= xr[1]), color: EXACT, r: 2.5, label: 'exact' },
  ];
  // the limit layer: a point mass for the average, a normal density when there is one
  if (q.alpha === 1) layers.push({ type: 'vline', at: model.mean, color: LIMIT, text: 'limit: μ' });
  if (q.alpha === 0.5 && (model.kind === 'rademacher' || center)) {
    const s = center ? model.sd : 1;
    const xs = Array.from({ length: 121 }, (_, i) => xr[0] + (i / 120) * (xr[1] - xr[0]));
    layers.push({ type: 'line', points: xs.map((x) => [x, normPdf(x / s) / s]), color: LIMIT, dash: true, label: center ? `N(0, ${+model.variance.toPrecision(3)})` : 'N(0, 1)' });
  }
  return el('div', { class: 'mcell' }, [
    title ? el('div', { class: 'mtitle', html: `n = ${nice(n)}${h.g > 1 ? ` <span class="muted">· ${h.g} atoms per bar</span>` : ''}` }) : null,
    plot({ x: { min: xr[0], max: xr[1] }, y: { min: 0 }, width, height, layers,
      label: `histogram of ${q.label} at n = ${n}: simulation, exact law${layers.length > 2 ? ' and limit' : ''}` }),
  ]);
}

/* ---------- E2a: small multiples ---------- */

function multiples(model, run, cps, which) {
  const pick = cps.filter((cp) => which.includes(cp.n));
  const v = (q, cp) => scaleMoments(cp.mom, cp.n ** q.alpha).variance;
  const first = pick[0], last = pick.at(-1);
  const ber = model.kind === 'bernoulli';
  return {
    answer: { text: `From n = ${nice(first.n)} to n = ${nice(last.n)}, the measured variance of <strong>Sₙ</strong> goes from ${short(v(QUANTITIES[0], first))} to ${short(v(QUANTITIES[0], last))} (it spreads), that of <strong>Sₙ/n</strong> from ${short(v(QUANTITIES[1], first))} to ${short(v(QUANTITIES[1], last))} (it collapses onto μ = ${model.mean}), and that of <strong>Sₙ/√n</strong> from ${short(v(QUANTITIES[2], first))} to ${short(v(QUANTITIES[2], last))} (it stays near σ² = ${+model.variance.toPrecision(3)}${ber ? ', while its centre drifts' : ''}).` },
    body: [
      ...QUANTITIES.flatMap((q, i) => {
        const xr = rowRange(model, pick, q);
        const caps = [
          'One axis for the whole row: the histogram widens like √n. Its height falls to match.',
          `Same axis in every cell: the histogram closes in on μ = ${model.mean}. The vertical line is the limit, a point mass at μ.`,
          ber ? 'Same width in every cell, but the centre moves right like p√n: raw Sₙ/√n has no limit for Bernoulli. The centred version is in the last panel.'
            : 'Same shape and width in every cell: this is the quantity with a limit, N(0, 1) (dashed).',
        ];
        const cells = el('div', { class: 'multiples' }, pick.map((cp) => cell(model, cp, q, xr, { width: 300, height: 165 })));
        return [...section(i + 1, q.label, caps[i]), cells, el('div', { class: 'row end' }, [svgButton(cells, `dist-${q.id}-${run.model}-${run.seed}`)])];
      }),
      layersLegend({ limit: ber ? 'limit: point mass at μ (no limit for raw Sₙ/√n)' : 'limit: point mass at μ, or N(0, 1)' }),
    ],
    rows: pick.flatMap((cp) => QUANTITIES.map((q) => { const s = scaleMoments(cp.mom, cp.n ** q.alpha); return { n: cp.n, quantity: q.label, mean: s.mean, variance: s.variance }; })),
    summary: { model: model.label(), m: run.m, seed: run.seed, checkpoints: pick.map((cp) => cp.n) },
  };
}

/* ---------- E2b: one quantity, n on a slider ---------- */

function slider(model, run, cps, state, patch, flag) {
  const holder = el('div');
  const ranges = QUANTITIES.map((q) => rowRange(model, cps, q));
  let i = Math.min(cps.length - 1, Math.max(0, Number(state.ni ?? cps.length - 1)));
  const out = el('span', { class: 'eq' });
  const draw = () => {
    out.textContent = `n = ${nice(cps[i].n)}`;
    holder.replaceChildren(el('div', { class: 'cols three' }, QUANTITIES.map((q, k) => el('div', {}, [
      el('h3', { class: 'panel-title', text: q.label }),
      cell(model, cps[i], q, ranges[k], { width: 360, height: 220, maxBins: 70, title: false }),
    ]))));
  };
  const input = el('input', { type: 'range', min: 0, max: cps.length - 1, step: 1, value: String(i), 'aria-label': 'checkpoint n',
    oninput: (e) => { stop(); i = Number(e.target.value); patch({ ni: i }); draw(); } });
  const stop = () => { if (timer) { clearInterval(timer); timer = null; play.textContent = '▶ play'; } };
  const play = el('button', { type: 'button', text: '▶ play', onclick: () => {
    if (timer) { stop(); return; }
    play.textContent = '❚❚ pause';
    if (i === cps.length - 1) i = -1;
    timer = setInterval(() => { if (i >= cps.length - 1) { stop(); return; } i++; input.value = String(i); patch({ ni: i }); draw(); }, 900);
  } });
  if (timer) { clearInterval(timer); timer = null; }
  draw();
  return el('div', { class: `card lab${flag ? ' is-stale' : ''}` }, [
    flag,
    el('h2', { text: 'Move n and watch the three histograms' }),
    el('p', { html: `The same ${nice(run.m)} attackers at each checkpoint n = ${cps.map((c) => nice(c.n)).join(', ')}. The x axes stay fixed while n moves.` }),
    el('div', { class: 'row' }, [field('checkpoint', input), out, play]),
    holder,
    layersLegend(),
  ]);
}

/* ---------- E2c: Bernoulli, raw against centred ---------- */

function drift(bmodel, bres, run, own) {
  const cps = DECADES.map((n) => checkpoint(bres, bmodel, bres.grid.indexOf(n)));
  const q = QUANTITIES[2];
  const rawRange = rowRange(bmodel, cps, q), cRange = rowRange(bmodel, cps, q, true);
  const p = bmodel.p, sd = bmodel.sd;
  const means = cps.map((cp) => scaleMoments(cp.mom, Math.sqrt(cp.n)).mean);
  const rawCells = el('div', { class: 'multiples' }, cps.map((cp) => cell(bmodel, cp, q, rawRange, { width: 300, height: 160 })));
  const cenCells = el('div', { class: 'multiples' }, cps.map((cp) => cell(bmodel, cp, q, cRange, { width: 300, height: 160, center: true })));
  return {
    answer: { text: `The mean of raw Sₙ/√n is ${means.map((m) => m.toFixed(2)).join(' → ')} (theory p√n = ${cps.map((cp) => (p * Math.sqrt(cp.n)).toFixed(2)).join(' → ')}): it never settles. After subtracting np, (Sₙ − np)/√n stays centred at 0 with spread σ = ${sd.toFixed(3)} and approaches N(0, p(1 − p)).` },
    body: [
      own ? null : el('p', { class: 'small muted', html: `The step model above is Rademacher, which has no drift, so this panel runs its own Bernoulli(${p}) simulation with the same m = ${nice(run.m)} and seed ${run.seed}.` }),
      ...section(1, 'Raw Sₙ/√n', `Each histogram has the same width (σ = ${sd.toFixed(3)}), but the centre p√n runs to the right: no limiting distribution.`),
      rawCells,
      ...section(2, 'Centred (Sₙ − np)/√n', `Subtract the mean first and the histograms stop moving: they settle on N(0, p(1 − p)) (dashed). ${p < 0.2 ? 'For small p the left side is cut off at −p√n at small n (no fewer than 0 penetrations): the skewness the CLT page measures.' : ''}`),
      cenCells,
      layersLegend({ limit: `N(0, ${+bmodel.variance.toPrecision(3)}) for the centred version` }),
    ],
    rows: cps.map((cp, k) => ({ n: cp.n, mean_raw: means[k], theory_raw: p * Math.sqrt(cp.n) })),
  };
}

/* ---------- E2d: moments against theory ---------- */

function momentRows(model, cps, q, m) {
  const zAbs = [];
  const rows = cps.map((cp) => {
    const n = cp.n, sc = n ** q.alpha, s = scaleMoments(cp.mom, sc);
    const kn = model.excessKurtosis / n;
    const th = { mean: (n * model.mean) / sc, variance: (n * model.variance) / (sc * sc), skew: model.skewness / Math.sqrt(n), kurt: kn };
    const seVarTh = th.variance * Math.sqrt(2 / (m - 1) + kn / m);
    const z = {
      mean: s.seMean > 0 ? (s.mean - th.mean) / s.seMean : 0,
      variance: (s.variance - th.variance) / seVarTh,
      skew: (cp.mom.skewness - th.skew) / cp.seSkew,
      kurt: (cp.mom.exKurtosis - th.kurt) / cp.seKurt,
    };
    zAbs.push(...Object.values(z).filter(Number.isFinite).map(Math.abs));
    return { n, s, th, z, gof: cp.gof, mom: cp.mom, seSkew: cp.seSkew, seKurt: cp.seKurt };
  });
  return { rows, zAbs };
}

function momentsPanel(model, run, cps, qid, update) {
  const q = QUANTITIES.find((x) => x.id === qid) ?? QUANTITIES[0];
  const { rows, zAbs } = momentRows(model, cps, q, run.m);
  const bad = zAbs.filter((z) => z > 3).length, gofBad = rows.filter((r) => r.gof.p <= 0.001).length, tested = rows.filter((r) => r.gof.df > 0).length;
  const f = (x) => short(x), zf = (z) => (Number.isFinite(z) ? (z >= 0 ? '+' : '') + z.toFixed(2) : '—');
  return {
    answer: {
      ok: bad <= 1 && gofBad === 0,
      text: `${zAbs.length - bad} of ${zAbs.length} z-scores lie within ±3 (about 1 in 370 would fall outside by chance), and the χ² test against the exact law of Sₙ gives p > 0.001 at ${tested - gofBad} of ${tested} checkpoints${tested < rows.length ? ` (${rows.length - tested} have too few attackers for the test)` : ''}. ${bad <= 1 && gofBad === 0 ? 'The simulation reproduces the theory within its own noise.' : 'Some values are outside their range: try another seed before suspecting the code; with many checks, a few misses are expected.'}`,
    },
    body: [
      ...section(1, `Mean and variance of ${q.label}`, `Theory: mean nμ/n<sup>α</sup>, variance nσ²/n<sup>2α</sup> with α = ${q.alpha}. z = (measured − theory)/SE: within ±3 means "agrees".`),
      table(['n', 'mean', 'theory', 'z', 'variance', 'theory', 'z'], rows.map((r) => [nice(r.n), `${f(r.s.mean)} ± ${f(r.s.seMean)}`, f(r.th.mean), zf(r.z.mean), `${f(r.s.variance)} ± ${f(r.s.seVar)}`, f(r.th.variance), zf(r.z.variance)])),
      ...section(2, 'Shape: skewness and excess kurtosis', 'These do not depend on the scaling, so they are the same for all three quantities. Theory: γ/√n and κ/n, both → 0, the values of a normal law.'),
      table(['n', 'skewness', 'theory', 'z', 'excess kurtosis', 'theory', 'z', 'χ² vs exact: p', ''], rows.map((r) => [nice(r.n), `${r.mom.skewness.toFixed(4)}${Number.isFinite(r.seSkew) ? ` ± ${short(r.seSkew)}` : ''}`, r.th.skew.toFixed(4), zf(r.z.skew), `${r.mom.exKurtosis.toFixed(4)}${Number.isFinite(r.seKurt) ? ` ± ${short(r.seKurt)}` : ''}`, r.th.kurt.toFixed(4), zf(r.z.kurt),
        r.gof.df ? `${r.gof.p < 0.001 ? '< 0.001' : r.gof.p.toFixed(3)} (${r.gof.df} df)` : '— (too few attackers)', r.gof.df ? verdict(r.gof.p > 0.001, 'fits', 'check') : ''])),
    ],
    rows: rows.map((r) => ({ n: r.n, quantity: q.label, mean: r.s.mean, se_mean: r.s.seMean, mean_theory: r.th.mean, z_mean: r.z.mean, variance: r.s.variance, se_variance: r.s.seVar, variance_theory: r.th.variance, z_variance: r.z.variance,
      skewness: r.mom.skewness, skewness_theory: r.th.skew, excess_kurtosis: r.mom.exKurtosis, kurtosis_theory: r.th.kurt, chi2_p: r.gof.p })),
    summary: { model: model.label(), m: run.m, seed: run.seed, quantity: q.label },
    control: field('quantity', el('select', { onchange: (e) => update({ q: e.target.value === 'S' ? null : e.target.value }) },
      QUANTITIES.map((x) => el('option', { value: x.id, text: x.label, selected: x.id === q.id })))),
  };
}

startPage({
  shell: hw04Shell('distributions.html'),
  sticky: STICKY,
  memory: MEMORY,
  preserve: true,
  render: (api) => {
    const { state, update, patch } = api;
    const run = readRun(state);
    const model = modelFrom(run);
    const redraw = () => api.draw();
    const spec = { model: { model: run.model, p: run.p }, run: { m: run.m, grid: GRID, seed: run.seed, keepPaths: 0 } };
    const got = getRun(spec, redraw, 'main');
    const ready = got.result ? got.result : null;
    const cps = ready ? ready.grid.map((_, c) => checkpoint(ready, model, c)) : null;
    const waiting = ready ? null : pending(got, spec, redraw);
    const tail = ready ? `<span class="muted">Run: ${model.label()}, m = ${nice(run.m)}, seed ${run.seed}, ${got.seconds.toFixed(2)} s in a Web Worker.</span>` : '';

    // the Bernoulli comparison: the current run if it is Bernoulli, else its own Bernoulli(0.1) run
    const own = run.model === 'ber';
    const bSpec = own ? spec : { model: { model: 'ber', p: 0.1 }, run: { ...spec.run } };
    const bGot = own ? got : getRun(bSpec, redraw, 'drift');
    const bModel = modelFrom(bSpec.model);

    const mom = ready ? momentsPanel(model, run, cps, state.q, update) : null;
    return [
      runCard(run, update),
      labPanel({
        id: 'E2', title: 'The three quantities at increasing n', name: `E2-${run.model}-${run.seed}`,
        question: 'How do the distributions of Sₙ, Sₙ/n and Sₙ/√n across the attackers change as the number of systems n grows?',
        steps: [
          `Simulate m = ${nice(run.m)} attackers (${model.label()}), each probing up to 10 000 systems; record Sₙ at n = ${GRID.map(nice).join(', ')}.`,
          'At each n, divide every attacker’s Sₙ by 1, n or √n.',
          'Draw the histogram of the m values with one bar per lattice point (or a fixed number of lattice points per bar), the exact law over it, and the limit where there is one.',
        ],
        flag: updatingFlag(got), waiting, view: () => { const r = multiples(model, run, cps, DECADES); r.answer.text += ` ${tail}`; return r; },
        why: 'This is the whole homework in three rows: one scaling makes the spread grow, one makes it vanish, one keeps it fixed. The LLN and the CLT are statements about the second and the third row.',
        notes: [
          'Bars are densities: the fraction of attackers in a bar divided by its width. That is what makes them comparable with a density such as φ. Every bar covers a whole number of lattice points (Sₙ moves in steps of 1 for Bernoulli and 2 for Rademacher), so no bar is artificially empty or doubled.',
          'The dots are the exact probabilities over the same lattice points, from the binomial law. Bars and dots differ only by Monte Carlo noise, which shrinks like 1/√m. Dots and the dashed limit differ by the error of the theorem at this n.',
          'In the Sₙ row the tall narrow spike at n = 10 and the low wide hump at n = 10 000 hold the same total area: one. The Sₙ/n row is the LLN: the mass piles up on μ. The Sₙ/√n row is the CLT: the shape stops changing.',
        ],
      }),
      ready ? slider(model, run, cps, state, patch, updatingFlag(got)) : null,
      labPanel({
        id: 'E2-drift', title: 'Bernoulli: raw Sₙ/√n drifts, the centred version converges', name: `E2-drift-${bSpec.model.p}-${run.seed}`,
        question: 'Why does the CLT need the mean subtracted, and what happens to Sₙ/√n for Bernoulli steps if it is not?',
        steps: ['Take the Bernoulli attackers at n = 10, 100, 1 000 and 10 000.', 'Draw Sₙ/√n as it is, then (Sₙ − np)/√n.'],
        flag: updatingFlag(bGot), waiting: bGot.result ? null : pending(bGot, bSpec, redraw),
        view: () => drift(bModel, bGot.result, run, own),
        why: 'The CLT is a statement about fluctuations around the mean. When the mean grows like n, dividing by √n is not enough: the drift p√n dominates. Rademacher has no drift, which is why the assignment states the CLT for it directly.',
        notes: ['Var(Sₙ/√n) = p(1 − p) for every n, so the raw histograms all have the same width. But E[Sₙ/√n] = p√n → ∞, so they march off to the right. Subtracting np removes the march, and the de Moivre–Laplace theorem gives the limit N(0, p(1 − p)).'],
      }),
      labPanel({
        id: 'E2-moments', title: 'Moments against theory', name: `E2-moments-${run.model}-${run.seed}`,
        question: 'Do the simulated attackers have the mean, variance, skewness and kurtosis the theory predicts, at every n?',
        steps: ['For each checkpoint, compute the sample mean, variance, skewness and excess kurtosis of the m values.', 'Compare each with its exact value through a z-score.', 'Test the whole histogram of Sₙ against the exact binomial law with a χ² test (cells merged until each expects at least 5).'],
        controls: mom ? [mom.control] : [],
        hints: ['<strong>quantity</strong>: the table in the units of Sₙ, Sₙ/n or Sₙ/√n. Skewness, kurtosis and χ² are the same for all three.'],
        flag: updatingFlag(got), waiting, view: () => mom,
        why: 'Before trusting a picture the simulation must be checked against what is known exactly. This table is that check (note 03 §4).',
        notes: [
          'The standard errors: mean s/√m; variance σ²·√(2/(m − 1) + κ/m) at its theoretical value, with κ the excess kurtosis (Monte Carlo note, lemma 3). For skewness and kurtosis the textbook √(6/m) and √(24/m) assume normal data and are far too small for a skewed Bernoulli at small n, so their SE is measured instead, by batch means: the m attackers are split into 20 groups, the statistic is computed in each, and SE = sd/√20. Below 400 attackers the groups are too small and no z is given.',
          'Skewness of Sₙ is γ/√n with γ = (1 − 2p)/√(p(1 − p)) (0 for Rademacher and Bernoulli ½); excess kurtosis is κ/n with κ = (1 − 6p(1 − p))/(p(1 − p)) (−2 for Rademacher). Both vanish as n grows: the shape becomes normal.',
        ],
      }),
    ];
  },
});
