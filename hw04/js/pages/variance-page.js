/* variance-page.js — the Variance page (E3): the sample variance of Sₙ, Sₙ/n
   and Sₙ/√n across the m attackers against n on log-log axes, with error bars,
   theory lines and fitted slopes; a slider for the exponent α in Sₙ/n^α; and,
   for Bernoulli, the variance and the mean of Sₙ/√n at several p.
   All of it comes from the moments of Sₙ at each checkpoint: Var(Sₙ/c) = Var(Sₙ)/c². */

import { el, field } from '../../../assets/js/ui/dom.js';
import { startPage } from '../../../assets/js/ui/page.js';
import { plot, short } from '../../../assets/js/ui/plot.js';
import { modelFrom } from '../core/models.js';
import { GRID, column } from '../core/simulate.js';
import { linFit } from '../core/numeric.js';
import { moments, scaleMoments } from '../core/estimate.js';
import { readRun, runCard } from './run-input.js';
import { getRun, pending, updatingFlag } from './run.js';
import { labPanel, section, table, verdict } from './lab-panel.js';
import { SIM, LIMIT, legend, figure, svgButton } from './widgets.js';
import { hw04Shell, STICKY, MEMORY } from './shell.js';

const nice = (n) => n.toLocaleString('en-US').replace(/,/g, '\u202f');
/** A signed number with a real minus sign: +0.999, −1.001. */
const signed = (x, d) => `${x >= 0 ? '+' : '−'}${Math.abs(x).toFixed(d)}`;
const SERIES = [
  { alpha: 0, label: 'Var Sₙ', color: 'var(--m1)', slope: 1 },
  { alpha: 1, label: 'Var(Sₙ/n)', color: 'var(--m2)', slope: -1 },
  { alpha: 0.5, label: 'Var(Sₙ/√n)', color: 'var(--m3)', slope: 0 },
];
const P_LIST = [0.5, 0.1, 0.01];
const SHADE = (i) => `color-mix(in srgb, var(--m1) ${[100, 62, 30][i]}%, var(--muted))`;   // one hue fading to grey as p shrinks; mid-grey keeps it visible in both themes
const X_AXIS = { log: true, min: 8, max: 12500, ticks: [10, 100, 1000, 10000], title: 'n (systems)' };

/** Moments of Sₙ at every checkpoint of a run. */
const momentsOf = (res) => res.grid.map((n, c) => ({ n, mom: moments(column(res, c)) }));

/** The measured variance of Sₙ/n^α with its standard error, and the theory nσ²/n^{2α}. */
function varianceSeries(model, cps, alpha) {
  return cps.map(({ n, mom }) => {
    const s = scaleMoments(mom, n ** alpha);
    return { n, v: s.variance, se: s.seVar, th: (n * model.variance) / n ** (2 * alpha) };
  });
}

/** Least-squares slope of log₁₀ Var against log₁₀ n. */
const fit = (rows) => {
  const ok = rows.filter((r) => r.v > 0);   // a run of a few attackers can have zero spread at small n
  return ok.length > 2 ? linFit(ok.map((r) => Math.log10(r.n)), ok.map((r) => Math.log10(r.v))) : { slope: NaN, slopeSE: NaN, r2: NaN, intercept: NaN };
};

/* ---------- E3: the three variances ---------- */

function threeVariances(model, run, cps) {
  const data = SERIES.map((q) => ({ q, rows: varianceSeries(model, cps, q.alpha) }));
  const fits = data.map(({ rows }) => fit(rows));
  const ns = Array.from({ length: 41 }, (_, i) => 10 ** (1 + (3 * i) / 40));
  const chart = plot({
    x: X_AXIS, y: { log: true, title: 'variance across attackers' }, height: 300,
    layers: data.flatMap(({ q, rows }) => [
      { type: 'line', points: ns.map((n) => [n, (n * model.variance) / n ** (2 * q.alpha)]), color: q.color, dash: true, thin: true, hover: false, end: `slope ${q.slope ? signed(q.slope, 0) : '0'}` },
      { type: 'points', points: rows.map((r) => [r.n, r.v]), err: rows.map((r) => [r.n, r.v - 2 * r.se, r.v + 2 * r.se]), color: q.color, label: q.label },
    ]),
    label: 'log-log plot of the variance of the three quantities against n, with theory lines of slope +1, −1 and 0',
  });
  const ok = fits.map((f, i) => Math.abs(f.slope - SERIES[i].slope) <= Math.max(0.05, 3 * f.slopeSE));
  return {
    answer: {
      ok: ok.every(Boolean),
      text: `Fitted log-log slopes: <strong>${fits.map((f, i) => `${SERIES[i].label} ${signed(f.slope, 3)}`).join(', ')}</strong> (theory +1, −1, 0). Dividing by n kills the spread, dividing by √n freezes it at σ² = ${+model.variance.toPrecision(3)}, not dividing at all lets it grow in proportion to n.` +
        (run.m < 1000 ? ` With only m = ${run.m} attackers each variance is uncertain by about √(2/m) = ${Math.round(100 * Math.sqrt(2 / run.m))} %, so these slopes are rough.` : ''),
    },
    body: [
      ...section(1, 'Variance against n, log-log', 'Points are the measured variances across the m attackers, with bars at ±2 standard errors (about the size of the dots at m = 10⁴); dashed lines are nσ²/n<sup>2α</sup>. On log-log axes a power of n is a straight line, and its exponent is the slope.'),
      figure(chart, `${model.label()}, m = ${nice(run.m)}, seed ${run.seed}.`),
      el('div', { class: 'row end' }, [svgButton(chart, `variance-${run.model}-${run.seed}`)]),
      legend([...SERIES.map((q) => ['dot', q.color, `${q.label} (measured ± 2 SE)`]), ['dash', 'var(--muted)', 'theory nσ²/n^(2α)']]),
      ...section(2, 'Fitted slopes', 'A least-squares line through the seven points (log₁₀ Var against log₁₀ n). The intercept 10^a estimates σ², the same for all three.'),
      table(['quantity', 'α', 'slope fitted', 'theory', 'R²', 'σ² from intercept', ''], data.map(({ q }, i) => [q.label, String(q.alpha),
        `${signed(fits[i].slope, 4)} ± ${fits[i].slopeSE.toFixed(4)}`, q.slope ? signed(q.slope, 0) : '0', fits[i].r2.toFixed(5),
        `${short(10 ** fits[i].intercept)} (σ² = ${short(model.variance)})`, verdict(ok[i], 'agrees', 'off')])),
      ...section(3, 'The numbers behind the points', ''),
      table(['n', ...SERIES.map((q) => `${q.label} measured`), 'theory Var Sₙ', 'theory Var(Sₙ/n)', 'theory Var(Sₙ/√n)'],
        cps.map((cp, c) => [nice(cp.n), ...data.map(({ rows }) => `${short(rows[c].v)} ± ${short(rows[c].se)}`), ...data.map(({ rows }) => short(rows[c].th))])),
    ],
    rows: cps.flatMap((cp, c) => data.map(({ q, rows }) => ({ n: cp.n, quantity: q.label, alpha: q.alpha, variance: rows[c].v, se: rows[c].se, theory: rows[c].th }))),
    summary: { model: model.label(), m: run.m, seed: run.seed, slopes: fits.map((f, i) => ({ quantity: SERIES[i].label, slope: f.slope, se: f.slopeSE, r2: f.r2 })) },
  };
}

/* ---------- the α slider ---------- */

function alphaPanel(model, run, cps, state, patch, flag) {
  let alpha = Math.min(1.5, Math.max(0, Number(state.alpha ?? 0.5)));
  const holder = el('div');
  const readout = el('span', { class: 'eq' });
  const draw = () => {
    const rows = varianceSeries(model, cps, alpha), f = fit(rows), pred = 1 - 2 * alpha;
    const ns = Array.from({ length: 41 }, (_, i) => 10 ** (1 + (3 * i) / 40));
    readout.textContent = `α = ${alpha.toFixed(2)}`;
    const regime = alpha < 0.5 - 1e-9
      ? `<strong>α < ½: the variance grows like n<sup>${pred.toFixed(2)}</sup>.</strong> The spread explodes; there is no limit law.`
      : alpha > 0.5 + 1e-9
        ? `<strong>α > ½: the variance shrinks like n^${pred.toFixed(2)}.</strong> Everything collapses onto ${alpha === 1 ? 'μ' : 'one value'}: a limit exists but it is a point, carrying no information about the fluctuations.`
        : '<strong>α = ½: the variance stays at σ² for every n.</strong> This is the only exponent with a limit that is neither infinite nor a single point: the normal law of the CLT.';
    holder.replaceChildren(
      el('div', { class: 'row' }, [
        el('span', { html: `predicted slope 1 − 2α = <strong>${signed(pred, 2)}</strong> · fitted <strong>${signed(f.slope, 3)} ± ${f.slopeSE.toFixed(3)}</strong>` }),
        Math.abs(alpha - 0.5) < 1e-9 ? el('span', { class: 'badge stable', text: '★ the only stable scaling' }) : null,
      ]),
      plot({
        x: X_AXIS, y: { log: true, title: `Var(Sₙ/n^${alpha.toFixed(2)})`, min: Math.min(...rows.map((r) => r.th)) / 3, max: Math.max(...rows.map((r) => r.th)) * 3 }, height: 260,
        layers: [
          { type: 'line', points: ns.map((n) => [n, (n * model.variance) / n ** (2 * alpha)]), color: LIMIT, dash: true, label: 'theory nσ²/n^(2α)' },
          { type: 'points', points: rows.map((r) => [r.n, r.v]), err: rows.map((r) => [r.n, r.v - 2 * r.se, r.v + 2 * r.se]), color: SIM, label: 'measured' },
        ],
      }),
      el('p', { class: 'small', html: regime }),
    );
  };
  const input = el('input', { type: 'range', min: 0, max: 1.5, step: 0.05, value: String(alpha), 'aria-label': 'exponent α',
    oninput: (e) => { alpha = Number(e.target.value); patch({ alpha: alpha === 0.5 ? null : alpha }); draw(); } });
  draw();
  return el('div', { class: `card lab${flag ? ' is-stale' : ''}` }, [
    flag,
    el('h2', { text: 'Why √n? Slide the exponent' }),
    el('p', { html: 'Sₙ/n<sup>α</sup> for any α between 0 and 1.5, from the same simulation. Var(Sₙ/n<sup>α</sup>) = n<sup>1 − 2α</sup>σ²: the slope of the line is 1 − 2α, positive below ½, negative above.' }),
    el('div', { class: 'row' }, [field('exponent α', input), readout,
      ...[0, 0.5, 1].map((a) => el('button', { type: 'button', class: 'mini', text: `α = ${a}`, onclick: () => { alpha = a; input.value = String(a); patch({ alpha: a === 0.5 ? null : a }); draw(); } }))]),
    holder,
    legend([['dot', SIM, 'measured ± 2 SE'], ['dash', LIMIT, 'theory']]),
  ]);
}

/* ---------- Bernoulli at several p ---------- */

function bernoulliPanel(run, gots) {
  const models = P_LIST.map((p) => modelFrom({ model: 'ber', p }));
  const data = gots.map((g, i) => momentsOf(g.result).map(({ n, mom }) => {
    const s = scaleMoments(mom, Math.sqrt(n));
    return { n, v: s.variance, seV: s.seVar, mean: s.mean, seM: s.seMean, p: P_LIST[i], vth: models[i].variance, mth: P_LIST[i] * Math.sqrt(n) };
  }));
  const ns = Array.from({ length: 41 }, (_, i) => 10 ** (1 + (3 * i) / 40));
  const varChart = plot({
    x: X_AXIS, y: { log: true, min: 0.005, max: 0.5, title: 'Var(Sₙ/√n)' }, height: 250,
    layers: data.flatMap((rows, i) => [
      { type: 'line', points: ns.map((n) => [n, models[i].variance]), color: SHADE(i), dash: true, thin: true, hover: false, end: `p = ${P_LIST[i]}` },
      { type: 'points', points: rows.map((r) => [r.n, r.v]), err: rows.map((r) => [r.n, r.v - 2 * r.seV, r.v + 2 * r.seV]), color: SHADE(i), label: `p = ${P_LIST[i]}` },
    ]),
  });
  const meanChart = plot({
    x: X_AXIS, y: { log: true, title: 'mean of Sₙ/√n' }, height: 250,
    layers: data.flatMap((rows, i) => [
      { type: 'line', points: ns.map((n) => [n, P_LIST[i] * Math.sqrt(n)]), color: SHADE(i), dash: true, thin: true, hover: false, end: `p√n, p = ${P_LIST[i]}` },
      { type: 'points', points: rows.map((r) => [r.n, r.mean]), color: SHADE(i), label: `p = ${P_LIST[i]}` },
    ]),
  });
  const slopes = data.map((rows) => fit(rows.map((r) => ({ n: r.n, v: r.mean }))).slope);
  return {
    answer: { text: `For every p the variance of Sₙ/√n stays at p(1 − p) (${P_LIST.map((p) => short(p * (1 - p))).join(', ')}), while its mean grows like p√n: fitted log-log slopes of the mean ${slopes.map((s) => s.toFixed(3)).join(', ')} (theory ½). Constant spread, escaping centre: no limit law without centring.` },
    body: [
      ...section(1, 'The variance is flat for every p', 'Same scaling, three coins: each sits at its own p(1 − p).'),
      varChart,
      ...section(2, 'The mean is not', 'E[Sₙ/√n] = p√n: slope ½ on log-log axes. The distribution keeps its width but moves off to infinity, the drift seen on the Distributions page.'),
      meanChart,
      legend(P_LIST.map((p, i) => ['dot', SHADE(i), `Bernoulli(${p})`])),
    ],
    rows: data.flat().map((r) => ({ p: r.p, n: r.n, var_norm: r.v, var_theory: r.vth, mean_norm: r.mean, mean_theory: r.mth })),
  };
}

startPage({
  shell: hw04Shell('variance.html'),
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
    const cps = got.result ? momentsOf(got.result) : null;
    const pSpecs = P_LIST.map((p) => ({ model: { model: 'ber', p }, run: { ...spec.run } }));
    const pGots = pSpecs.map((s, i) => getRun(s, redraw, `p${i}`));
    const pWaiting = pGots.find((g) => !g.result);
    return [
      runCard(run, update),
      labPanel({
        id: 'E3', title: 'The variance under the three normalisations', name: `E3-${run.model}-${run.seed}`,
        question: 'How does the variance of Sₙ, Sₙ/n and Sₙ/√n across the attackers change as n grows, and why do the three behave so differently?',
        steps: [
          `Simulate m = ${nice(run.m)} attackers (${model.label()}) and record Sₙ at n = ${GRID.map(nice).join(', ')}.`,
          'At each n compute the sample variance of Sₙ across the attackers, and its standard error.',
          'Divide by n² and by n to get the variances of Sₙ/n and Sₙ/√n; plot all three against n on log-log axes and fit a line to each.',
        ],
        flag: updatingFlag(got), waiting: got.result ? null : pending(got, spec, redraw),
        view: () => threeVariances(model, run, cps),
        why: 'This one plot answers "the behaviour of the variance under the different normalisations": the three slopes are +1, −1 and 0 because Var(Sₙ/n<sup>α</sup>) = n<sup>1 − 2α</sup>σ², for any step with finite variance.',
        notes: [
          'Var(Sₙ) = nσ² because the steps are independent: variances of independent terms add (Expectation and variance of sums, lemma 3). Dividing by c divides the variance by c², so Var(Sₙ/n<sup>α</sup>) = n<sup>1 − 2α</sup>σ². Taking logs: log Var = (1 − 2α) log n + log σ², a line with slope 1 − 2α and intercept log σ².',
          'The standard error of a variance is σ²·√(2/(m − 1) + κ/m), with κ the excess kurtosis: relatively ≈ √(2/m), 1.4 % at m = 10⁴. On a log axis that is the same height at every n, which is why the error bars look alike.',
          'The seven points come from the same attackers followed to larger n, so they are correlated (a nested design). The marginal law at each n is exact, but the slope\'s standard error from the fit assumes independent points and is only a rough guide.',
        ],
      }),
      cps ? alphaPanel(model, run, cps, state, patch, updatingFlag(got)) : null,
      labPanel({
        id: 'E3-bernoulli', title: 'Bernoulli at several p: constant spread, escaping mean', name: `E3-bernoulli-${run.seed}`,
        question: 'For Bernoulli steps, does Sₙ/√n settle down as n grows?',
        steps: [`Simulate m = ${nice(run.m)} attackers for each p in {${P_LIST.join(', ')}} (seed ${run.seed}).`, 'At each n compute the variance and the mean of Sₙ/√n across the attackers.'],
        flag: updatingFlag(pGots.find((g) => g.stale)), waiting: pWaiting ? pending(pWaiting, pSpecs[pGots.indexOf(pWaiting)], redraw) : null,
        view: () => bernoulliPanel(run, pGots),
        why: 'Variance alone does not decide convergence: Sₙ/√n has a perfectly stable variance for Bernoulli and still has no limit, because its mean runs away. Rademacher has mean 0, which is why the symmetric case converges as it is.',
        notes: ['The shades of one hue order p from large (dark) to small (light). For small p the variance p(1 − p) ≈ p and the mean p√n are both small, but the ratio of mean to standard deviation, √(np/(1 − p)), still grows without bound.'],
      }),
    ];
  },
});
