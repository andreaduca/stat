/* attackers-page.js — the Systems & attackers page (E8, E9, interpretation):
   what the system size n and the number of attackers m do to the aggregate
   score (a heat map of four aggregates over (n, m), checked by splitting the
   simulated attackers into groups), the luckiest of m attackers, attackers who
   differ in skill (Beta) — the same formula as correlated systems — and the
   interpretation of it all, with an evidence label on every claim. */

import { el, field, explain } from '../../../assets/js/ui/dom.js';
import { startPage } from '../../../assets/js/ui/page.js';
import { plot, short } from '../../../assets/js/ui/plot.js';
import { wilson } from '../../../assets/js/core/stats.js';
import { modelFrom, HeterogeneousBernoulli } from '../core/models.js';
import { GRID, column } from '../core/simulate.js';
import { probMaxAtLeast, atLeastOne, expectedMaxNormal, betaPdf, betaBinomialPmf, lawOfTotal, llnTail, race } from '../core/exact.js';
import { linFit } from '../core/numeric.js';
import { moments, scaleMoments, atoms, latticeHistogram } from '../core/estimate.js';
import { readRun, runCard } from './run-input.js';
import { getRun, pending, updatingFlag } from './run.js';
import { labPanel, section, table } from './lab-panel.js';
import { SIM, EXACT, LIMIT, legend, figure, evidence } from './widgets.js';
import { hw04Shell, STICKY, MEMORY } from './shell.js';

const nice = (n) => n.toLocaleString('en-US').replace(/,/g, ' ');
const MUTED = 'var(--muted)', IID = 'var(--m1)', HET = 'var(--m3)';   // blue / green: validated pair, apart from the orange exact dots
const M_COLS = [1, 5, 20, 100, 1000, 10000];
const GROUPS = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000];
const sci = (x) => (x === 0 ? '0' : Math.abs(x) < 1e-3 || Math.abs(x) >= 1e6 ? x.toExponential(2) : x.toPrecision(3));
const num = (v, lo, hi, fallback) => (v !== undefined && v !== '' && Number.isFinite(Number(v)) ? Math.min(hi, Math.max(lo, Number(v))) : fallback);

/* ---------- E8: aggregates over (n, m) ---------- */

/** The four aggregates of the n systems × m attackers, exactly. [T] note 04 §1, §3. */
function aggregates(model, a) {
  const mu = model.mean, sd = model.sd;
  return {
    total: { label: 'expected total score nmμ', f: (n, m) => n * m * mu, fmt: sci, note: 'Grows with the product nm: m attackers probing n systems score, on average, like one attacker probing nm systems.' },
    spread: { label: 'standard deviation of the total σ√(nm)', f: (n, m) => sd * Math.sqrt(n * m), fmt: sci, note: 'The total of all attackers is one walk of nm steps, so its spread is σ√(nm): it also depends only on the product.' },
    breach: { label: `P(at least one attacker reaches ${a})`, f: (n, m) => atLeastOne(probMaxAtLeast(model, n, a), m), fmt: (x) => (x > 0.9995 && x < 1 ? '> 0.999' : sci(x)), note: 'Rare per attacker is not rare per population: 1 − (1 − q)ᵐ climbs to 1 with m long before q does with n.' },
    rel: { label: 'relative uncertainty of the population rate σ/(μ√(nm))', f: (n, m) => (mu > 0 ? sd / (mu * Math.sqrt(n * m)) : NaN), fmt: (x) => (Number.isFinite(x) ? sci(x) : '—'), note: mu > 0 ? 'How precisely the defender knows the attackers\' common success rate after watching all nm probes: it shrinks like 1/√(nm).' : 'Undefined for Rademacher: with μ = 0 there is no rate to be relative to.' },
  };
}

function heatPanel(model, run, res, a, agg, cell, update) {
  const A = aggregates(model, a), pick = A[agg] ?? A.breach;
  const vals = GRID.map((n) => M_COLS.map((m) => pick.f(n, m)));
  const pos = vals.flat().filter((v) => Number.isFinite(v) && v > 0);
  const lo = Math.log10(Math.min(...pos)), hi = Math.log10(Math.max(...pos));
  const shade = (v) => (Number.isFinite(v) && v > 0 ? 6 + 49 * (hi > lo ? (Math.log10(v) - lo) / (hi - lo) : 1) : 0);   // ≤ 55 % keeps the ink legible
  const [cn, cm] = cell;
  const heat = el('div', { class: 'scroll-x' }, [el('table', { class: 'data heat' }, [
    el('thead', {}, [el('tr', {}, [el('th', { class: 'left', text: 'n \\ m' }), ...M_COLS.map((m) => el('th', { text: nice(m) }))])]),
    el('tbody', {}, GRID.map((n, i) => el('tr', {}, [el('th', { class: 'left', text: nice(n) }), ...M_COLS.map((m, k) => el('td', {
      style: `--w:${shade(vals[i][k])}%`, class: n === cn && m === cm ? 'picked' : null, tabindex: 0, role: 'button',
      title: `n = ${nice(n)}, m = ${nice(m)}: ${pick.label} = ${pick.fmt(vals[i][k])}. Click for the spot check.`,
      text: pick.fmt(vals[i][k]), onclick: () => update({ cell: `${n},${m}` }), onkeydown: (e) => { if (e.key === 'Enter') update({ cell: `${n},${m}` }); },
    }))]))),
  ])]);

  // spot check: split the simulated attackers into groups of cm, one total (and one "anyone breached?") per group
  const G = res.grid.length, c = res.grid.indexOf(cn), groups = Math.floor(res.m / cm);
  let spot = null;
  if (groups >= 10) {
    const totals = new Float64Array(groups);
    let any = 0;
    for (let g = 0; g < groups; g++) {
      let t = 0, hit = false;
      for (let j = g * cm; j < (g + 1) * cm; j++) { t += res.S[j * G + c]; if (res.maxS[j * G + c] >= a) hit = true; }
      totals[g] = t; if (hit) any++;
    }
    const mom = moments(totals), [blo, bhi] = wilson(any, groups);
    spot = { groups, mom, any, blo, bhi };
  }
  const ex = { total: A.total.f(cn, cm), spread: A.spread.f(cn, cm), breach: A.breach.f(cn, cm) };
  return {
    answer: { text: `${pick.note} Spot check at n = ${nice(cn)}, m = ${nice(cm)}: ` + (spot
      ? `${nice(spot.groups)} groups of ${nice(cm)} simulated attackers give a mean total ${sci(spot.mom.mean)} ± ${sci(spot.mom.seMean)} (exact ${sci(ex.total)}), spread ${sci(spot.mom.sd)} (exact ${sci(ex.spread)}), and at least one breach in ${(100 * spot.any / spot.groups).toFixed(1)} % of groups [${(100 * spot.blo).toFixed(1)}, ${(100 * spot.bhi).toFixed(1)}] (exact ${(100 * ex.breach).toFixed(1)} %).`
      : `the run has only ${nice(res.m)} attackers, too few for 10 groups of ${nice(cm)}; raise m in the dock or pick a smaller m.`) },
    body: [
      ...section(1, pick.label, 'Rows: systems n. Columns: attackers m. Darker = larger (log scale). Click a cell to check it against the simulation.'),
      heat,
      ...section(2, `Spot check: n = ${nice(cn)}, m = ${nice(cm)}`, `The ${nice(res.m)} simulated attackers (seed ${run.seed}) are split into groups of ${nice(cm)}; each group is one "population" of attackers.`),
      spot ? table(['aggregate', 'simulated over the groups', 'exact'], [
        ['mean total score', `${sci(spot.mom.mean)} ± ${sci(spot.mom.seMean)}`, sci(ex.total)],
        ['standard deviation of the total', sci(spot.mom.sd), sci(ex.spread)],
        [`P(someone reaches ${a})`, `${sci(spot.any / spot.groups)} [${sci(spot.blo)}, ${sci(spot.bhi)}]`, sci(ex.breach)],
      ]) : el('p', { class: 'small muted', text: 'Not enough simulated attackers for this cell.' }),
    ],
    rows: GRID.flatMap((n, i) => M_COLS.map((m, k) => ({ n, m, aggregate: agg, value: vals[i][k] }))),
  };
}

/* ---------- the luckiest attacker ---------- */

function luckiest(model, run, res, nPick) {
  const c = res.grid.indexOf(nPick), col = column(res, c);
  const mu = nPick * model.mean, sd = Math.sqrt(nPick * model.variance);
  const z = Float64Array.from(col, (s) => (s - mu) / sd);
  const rows = GROUPS.filter((g) => res.m / g >= 10).map((g) => {
    const groups = Math.floor(res.m / g), maxima = new Float64Array(groups);
    for (let i = 0; i < groups; i++) { let best = -Infinity; for (let j = i * g; j < (i + 1) * g; j++) if (z[j] > best) best = z[j]; maxima[i] = best; }
    const mom = moments(maxima);
    return { g, groups, mean: mom.mean, se: mom.seMean, exact: expectedMaxNormal(g), asym: g > 1 ? Math.sqrt(2 * Math.log(g)) : 0 };
  });
  const gs = Array.from({ length: 41 }, (_, i) => 10 ** ((Math.log10(5000) * i) / 40));
  const chart = plot({
    x: { log: true, min: 0.8, max: 6000, ticks: [1, 10, 100, 1000], title: 'number of attackers m' }, y: { min: 0, title: 'best standardised score' }, height: 260,
    layers: [
      { type: 'line', points: gs.filter((g) => g > 1.5).map((g) => [g, Math.sqrt(2 * Math.log(g))]), color: LIMIT, dash: true, thin: true, label: '√(2 ln m), asymptotic only', end: '√(2 ln m)' },
      { type: 'line', points: gs.map((g) => [g, expectedMaxNormal(Math.round(g))]), color: EXACT, label: 'E[max of m normals]', end: 'exact' },
      { type: 'points', points: rows.map((r) => [r.g, r.mean]), err: rows.map((r) => [r.g, r.mean - 2 * r.se, r.mean + 2 * r.se]), color: SIM, label: 'simulated' },
    ],
  });
  const r100 = rows.find((r) => r.g === 100), r1000 = rows.find((r) => r.g === 1000);
  return {
    answer: { text: rows.length < 3
      ? `With ${nice(res.m)} simulated attackers there are too few to form at least 10 groups of each size; the exact curve still shows the law: E[max] = ${expectedMaxNormal(100).toFixed(2)} for 100 normals, ${expectedMaxNormal(10000).toFixed(2)} for 10 000. Raise m in the dock to see the simulation.`
      : `The luckiest of m attackers sits ${r100 ? `${r100.mean.toFixed(2)} standard deviations above the mean for m = 100 (exact ${r100.exact.toFixed(2)} for normals)` : `${rows.at(-1).mean.toFixed(2)} standard deviations above the mean for m = ${nice(rows.at(-1).g)} (exact ${rows.at(-1).exact.toFixed(2)})`}${r1000 ? `, ${r1000.mean.toFixed(2)} for m = 1 000 (${r1000.exact.toFixed(2)})` : ''}. Ten times more attackers add only about half a standard deviation: the best score grows like √(ln m), the total like m. The asymptote √(2 ln m) overshoots at every m shown.` },
    body: [
      ...section(1, `The best of m attackers at n = ${nice(nPick)}`, `The simulated attackers in groups of m; in each group the highest standardised score (Sₙ − nμ)/(σ√n); its average over the groups, against the exact expected maximum of m standard normals, ∫x·mφ(x)Φ(x)^(m−1)dx.`),
      chart,
      legend([['dot', SIM, 'simulated (± 2 SE)'], ['line', EXACT, 'exact, for normals'], ['dash', LIMIT, '√(2 ln m), asymptotic only']]),
      table(['m', 'groups', 'average best', 'exact E[max]', '√(2 ln m)'], rows.map((r) => [nice(r.g), nice(r.groups), `${r.mean.toFixed(3)} ± ${r.se.toFixed(3)}`, r.exact.toFixed(3), r.g > 1 ? r.asym.toFixed(3) : '—'])),
    ],
    rows: rows.map((r) => ({ n: nPick, m: r.g, groups: r.groups, mean_best: r.mean, se: r.se, exact: r.exact, asymptotic: r.asym })),
  };
}

/* ---------- E9: attackers who differ ---------- */

function heterogeneous(het, iidRes, hetRes, run) {
  const iid = modelFrom({ model: 'ber', p: het.p });
  const G = GRID.length;
  const series = (res, model) => GRID.map((n, c) => { const s = scaleMoments(moments(column(res, c)), n); return { n, v: s.variance, se: s.seVar }; });
  const a = series(iidRes, iid), b = series(hetRes, het);
  const ns = Array.from({ length: 41 }, (_, i) => 10 ** (1 + (3 * i) / 40));
  const varChart = plot({
    x: { log: true, min: 8, max: 12500, ticks: [10, 100, 1000, 10000], title: 'n (systems)' }, y: { log: true, title: 'Var(Sₙ/n) across attackers' }, height: 280,
    layers: [
      { type: 'line', points: ns.map((n) => [n, het.p * (1 - het.p) / n]), color: IID, dash: true, thin: true, hover: false, end: 'i.i.d.: p̄(1−p̄)/n' },
      { type: 'line', points: ns.map((n) => [n, het.varianceOfMean(n)]), color: HET, dash: true, thin: true, hover: false, end: 'Beta: → Var(pⱼ)' },
      { type: 'hline', at: het.varP, color: MUTED, anchor: 'start', text: `Var(pⱼ) = ${sci(het.varP)}` },
      { type: 'points', points: a.map((r) => [r.n, r.v]), err: a.map((r) => [r.n, r.v - 2 * r.se, r.v + 2 * r.se]), color: IID, label: `identical attackers, p = ${+het.p.toFixed(4)}` },
      { type: 'points', points: b.map((r) => [r.n, r.v]), err: b.map((r) => [r.n, r.v - 2 * r.se, r.v + 2 * r.se]), color: HET, label: `Beta(${het.alpha}, ${het.beta}) attackers` },
    ],
  });
  // the average score at n = 10 000: a spike for identical attackers, the Beta law for different ones
  const n = GRID.at(-1), c = G - 1;
  const iidAt = atoms(column(iidRes, c)), hetAt = atoms(column(hetRes, c));
  const iidLaw = lawOfTotal(iid, n);
  const hetLaw = { s: Int32Array.from({ length: n + 1 }, (_, k) => k), prob: Float64Array.from({ length: n + 1 }, (_, k) => betaBinomialPmf(k, n, het.alpha, het.beta)) };
  const xmax = Math.min(1, Math.max(het.p + 5 * Math.sqrt(het.varP), het.p * 2));
  const hi = latticeHistogram(iidAt, iidLaw, 1, { map: (s) => s / n, scale: n, maxBins: 30 });   // a few wide bars, so the spike is visible
  const hh = latticeHistogram(hetAt, hetLaw, 1, { map: (s) => s / n, scale: n, maxBins: 70 });
  const xs = Array.from({ length: 121 }, (_, i) => (i / 120) * xmax);
  const hist = (h, color, label, limit) => plot({
    x: { min: 0, max: xmax, title: 'Sₙ/n at n = 10 000' }, y: { min: 0, title: 'density' }, height: 220, width: 360,
    layers: [
      { type: 'bars', bars: h.bars, color, label },
      { type: 'points', points: h.exact.filter(([x]) => x <= xmax), color: EXACT, r: 2, label: 'exact' },
      limit,
    ].filter(Boolean),
  });
  const last = b.at(-1), ratio = last.v / (het.p * (1 - het.p) / n);
  return {
    answer: { text: `With identical attackers the spread of the average score keeps falling like 1/n, down to ${sci(a.at(-1).v)} at n = ${nice(n)}. With attackers of different skill it stalls at ${sci(last.v)} (theory ${sci(het.varianceOfMean(n))}, floor Var(pⱼ) = ${sci(het.varP)}): <strong>${ratio.toFixed(0)} times</strong> the i.i.d. value. More systems no longer average the differences away; Sₙ/n converges to each attacker's own pⱼ, not to a common μ.${run.m < 1000 ? ` (With only ${nice(run.m)} attackers these variances are themselves uncertain by about √(2/m) = ${Math.round(100 * Math.sqrt(2 / run.m))} %.)` : ''}` },
    body: [
      ...section(1, 'Var(Sₙ/n): falling, then stuck', `Same mean rate p̄ = ${+het.p.toFixed(4)} in both runs (m = ${nice(run.m)}, seed ${run.seed}). Identical attackers: slope −1 for ever. Different attackers: the variance flattens at Var(pⱼ) once n passes about 1/ρ = ${(1 / het.rho).toFixed(0)}.`),
      figure(varChart, `Var(Sₙ/n) = p̄(1 − p̄)(1/n + (n − 1)ρ/n), ρ = 1/(α + β + 1) = ${het.rho.toFixed(4)}.`),
      legend([['dot', IID, 'identical attackers'], ['dot', HET, 'Beta attackers'], ['dash', MUTED, 'theory']]),
      ...section(2, 'The average score at n = 10 000', 'Left: identical attackers, a spike at p̄ (the LLN). Right: different attackers, the spread of their own skills, the Beta density (dashed).'),
      el('div', { class: 'cols' }, [
        hist(hi, IID, 'identical attackers', null),
        hist(hh, HET, 'Beta attackers', { type: 'line', points: xs.map((x) => [x, betaPdf(x, het.alpha, het.beta)]), color: LIMIT, dash: true, label: `Beta(${het.alpha}, ${het.beta}) density` }),
      ]),
      legend([['bar', IID, 'identical attackers (simulated)'], ['bar', HET, 'Beta attackers (simulated)'], ['dot', EXACT, 'exact (binomial / Beta-binomial)'], ['dash', LIMIT, 'limit: the Beta law of pⱼ']]),
    ],
    rows: GRID.map((nn, k) => ({ n: nn, var_iid: a[k].v, var_iid_theory: het.p * (1 - het.p) / nn, var_beta: b[k].v, var_beta_theory: het.varianceOfMean(nn) })),
  };
}

/* ---------- interpretation ---------- */

function interpretation(model, run, res, a) {
  const G = res.grid.length;
  const fits = [0, 1, 0.5].map((alpha) => {
    const v = res.grid.map((n, c) => scaleMoments(moments(column(res, c)), n ** alpha).variance);
    return linFit(res.grid.map(Math.log10), v.map(Math.log10)).slope;
  });
  const rad = model.kind === 'rademacher';
  const q100 = probMaxAtLeast(model, 100, a), qEnd = probMaxAtLeast(model, GRID.at(-1), a);
  let reached = 0;
  for (let j = 0; j < res.m; j++) if (res.maxS[j * G + G - 1] >= a) reached++;
  const eps = rad ? 0.1 : 0.05;
  const q1000 = llnTail(model, 1000, eps).q;
  const absS = rad ? Math.sqrt((2 * GRID.at(-1)) / Math.PI) : null;
  const claim = (kind, html) => el('li', {}, [evidence(kind), ' ', el('span', { html })]);
  const runTag = `(${model.label()}, m = ${nice(run.m)}, seed ${run.seed})`;
  return el('div', { class: 'card interpretation' }, [
    el('h2', { text: 'What it means for systems and attackers' }),
    el('p', { class: 'small muted', html: 'Each claim carries its kind of evidence: <span class="evidence theorem">theorem</span> proved in the notes; <span class="evidence measurement">measured</span> on these pages, with the run; <span class="evidence record">source</span> to be checked in the literature; <span class="evidence opinion">opinion</span>, a modelling judgement.' }),
    el('h3', { text: 'The size of the estate: n systems' }),
    el('ul', { class: 'claims' }, [
      claim('T', rad
        ? `<strong>Total.</strong> With zero drift the total does not grow on average, but its typical size does: E|Sₙ| ≈ √(2n/π), ${absS.toFixed(0)} at n = 10 000. More systems, larger swings in both directions.`
        : `<strong>Total.</strong> Sₙ grows like np with spread √(np(1 − p)); the relative uncertainty √((1 − p)/(np)) → 0. A large estate is compromised <em>predictably</em>, in proportion p.`),
      claim('M', `The three variances scale with slopes ${fits.map((f) => (f >= 0 ? '+' : '−') + Math.abs(f).toFixed(3)).join(', ')} against n (theory +1, −1, 0) ${runTag}.`),
      claim('T', `<strong>Rate.</strong> Sₙ/n concentrates at μ: the chance of being more than ε = ${eps} off after 1 000 systems is ${sci(q1000)} exactly, and it falls exponentially (Chernoff). Each extra system adds information, not risk: an attacker's rate reveals its true skill.`),
      claim('T', '<strong>Luck.</strong> Sₙ/√n has a distribution that stops depending on n, close to normal. Luck has a universal size and shape, so it can be budgeted.'),
      claim('O', 'Alarm thresholds must scale with the right power of n: like nμ to catch a drift, like c√n for zero-mean noise. A fixed threshold is eventually crossed even with no drift at all.'),
    ]),
    el('h3', { text: 'Thresholds: a breach as a first passage' }),
    el('ul', { class: 'claims' }, [
      rad
        ? claim('T', `Zero drift does not protect: the level a = ${a} is reached with probability 1, but the expected time is infinite (P(Tₐ > n) ≈ a√(2/(πn))). Within 100 systems the chance is ${sci(q100)}; within 10 000 it is ${sci(qEnd)} (reflection principle).`)
        : claim('T', `With drift a breach is certain and quick: E[Tₐ] = a/p = ${nice(Math.round(a / model.p))} systems for a = ${a} (negative binomial).`),
      claim('M', `${nice(reached)} of the ${nice(run.m)} simulated attackers reached ${a} within 10 000 systems: ${(100 * reached / run.m).toFixed(1)} % against ${(100 * qEnd).toFixed(1)} % exactly ${runTag}.`),
      claim('T', `A race against the defender amplifies a small edge: between barriers at ±10, winning 55 % of the rounds wins ${(100 * race(0.55, 10, 10).breach).toFixed(0)} % of the races (gambler's ruin).`),
    ]),
    el('h3', { text: 'The number of attackers: m' }),
    el('ul', { class: 'claims' }, [
      claim('T', 'The total over all attackers is a single walk of nm steps: doubling the attackers is statistically the same as doubling the systems (the heat map depends only on nm).'),
      claim('T', `Rare per attacker is not rare per population: with q = ${sci(q100)} per attacker within 100 systems, ${nice(Math.ceil(Math.log(0.5) / Math.log1p(-q100)))} attackers make a breach more likely than not, and P(at least one of 100) = ${sci(atLeastOne(q100, 100))}.`),
      claim('T', `The luckiest attacker grows only like √(2 ln m) standard deviations: about ${expectedMaxNormal(100).toFixed(2)} for 100 attackers, ${expectedMaxNormal(10000).toFixed(2)} for 10 000. The total grows like m, the extreme like √(ln m).`),
      claim('O', 'For a defender, the number of independent attackers matters more than their individual skill when the question is "will anyone get in?", and less when it is "how much is lost in total?", which scales with nm.'),
    ]),
    el('h3', { text: 'Where the i.i.d. model breaks' }),
    el('ul', { class: 'claims' }, [
      claim('T', 'If attackers differ (pⱼ random) or systems share a weakness (a common hidden factor), Var(Sₙ/n) → ρσ² instead of 0: one formula, two readings. Averaging over more systems stops helping (Beta panel above).'),
      claim('S', 'Monoculture: diversity of software is a statistical defence, because correlated systems turn many small risks into one large one (📌 Geer et al., "CyberInsecurity: The Cost of Monopoly", 2003; check before citing).'),
      claim('O', 'Stationarity is the next assumption to go: attackers learn and defenders patch, so p drifts with time. Heavy-tailed steps (one zero-day can be worth everything) would break the LLN and the CLT themselves.'),
    ]),
    el('h3', { text: 'In one paragraph' }),
    el('p', {}, [el('span', { html: 'System size makes <strong>rates</strong> predictable (LLN) and <strong>fluctuations</strong> universal (CLT). Neither makes a positive-drift attacker less dangerous: the total grows linearly. The number of attackers turns per-attacker rarities into near-certainties, 1 − (1 − q)ᵐ. The zero-mean model is the most deceptive: no attacker is "winning" on average, yet every fixed threshold is eventually crossed, at a time with infinite mean. All of this assumes independence; correlation between systems is what turns many small risks into one large one. ' }), evidence('O')]),
  ]);
}

startPage({
  shell: hw04Shell('attackers.html'),
  sticky: STICKY,
  memory: MEMORY,
  preserve: true,
  render: (api) => {
    const { state, update } = api;
    const run = readRun(state);
    const model = modelFrom(run);
    const redraw = () => api.draw();
    const a = Math.round(num(state.a, 1, 200, 20));
    const agg = ['total', 'spread', 'breach', 'rel'].includes(state.agg) ? state.agg : 'breach';
    const [cn0, cm0] = String(state.cell ?? '1000,100').split(',').map(Number);
    const cell = [GRID.includes(cn0) ? cn0 : 1000, M_COLS.includes(cm0) ? cm0 : 100];
    const nLuck = GRID.includes(Number(state.nl)) ? Number(state.nl) : GRID.at(-1);
    const alpha = num(state.ba, 0.2, 100, 2), beta = num(state.bb, 0.2, 100, 18);
    const het = new HeterogeneousBernoulli({ alpha, beta });

    const spec = { model: { model: run.model, p: run.p }, run: { m: run.m, grid: GRID, seed: run.seed, keepPaths: 0, trackMax: true, threshold: a } };
    const got = getRun(spec, redraw, 'main');
    const hetSpec = { model: { model: 'beta', a: alpha, b: beta }, run: { m: run.m, grid: GRID, seed: run.seed, keepPaths: 0 } };
    const iidSpec = { model: { model: 'ber', p: het.p }, run: { m: run.m, grid: GRID, seed: run.seed, keepPaths: 0 } };
    const hetGot = getRun(hetSpec, redraw, 'beta'), iidGot = getRun(iidSpec, redraw, 'iid');
    const hetWait = !hetGot.result ? [hetGot, hetSpec] : !iidGot.result ? [iidGot, iidSpec] : null;
    const numIn = (label, value, opts, key) => field(label, el('input', { type: 'number', class: 'num', ...opts, value: String(value),
      onchange: (e) => update({ [key]: e.target.value }), onkeydown: (e) => { if (e.key === 'Enter') update({ [key]: e.target.value }); } }));
    const A = aggregates(model, a);

    return [
      runCard(run, update),
      labPanel({
        id: 'E8', title: 'n systems × m attackers: the aggregate score', name: `E8-${agg}-${run.model}-${run.seed}`,
        question: 'How do the size of the estate and the number of attackers change what the defender faces in total?',
        steps: ['Compute each aggregate exactly on a grid of n (systems) and m (attackers).', `Check a cell against the simulation: split the ${nice(run.m)} simulated attackers into groups of m and treat each group as one population.`],
        controls: [
          field('aggregate', el('select', { onchange: (e) => update({ agg: e.target.value === 'breach' ? null : e.target.value }) },
            Object.entries(A).map(([k, v]) => el('option', { value: k, text: v.label, selected: k === agg })))),
          numIn('breach level a', a, { min: 1, max: 200, step: 1 }, 'a'),
        ],
        hints: ['<strong>aggregate</strong>: what to colour the table by. <strong>breach level a</strong>: the score that counts as getting in (for the third aggregate and the spot check).'],
        flag: updatingFlag(got), waiting: got.result ? null : pending(got, spec, redraw),
        view: () => heatPanel(model, run, got.result, a, agg, cell, update),
        why: 'The two dimensions of the problem are not symmetric: the total depends only on nm, but "at least one breach" saturates in m much faster than in n, and the precision of the population rate grows like √(nm).',
        notes: [
          'All four aggregates are exact: the total of m independent walks of n steps is one walk of nm steps (mean nmμ, variance nmσ²); "at least one" uses the per-attacker breach probability from the reflection principle (or the binomial tail) and independence across attackers.',
          'The relative uncertainty σ/(μ√(nm)) is what a defender pooling all observations has left after nm probes: 10 % needs nm ≈ 100(1 − p)/p.',
        ],
      }),
      labPanel({
        id: 'E8-max', title: 'The luckiest attacker', name: `E8-max-${run.model}-${run.seed}`,
        question: 'How far above the crowd is the best of m attackers, and how does that grow with m?',
        steps: [`At n = ${nice(nLuck)}, standardise every simulated attacker's score.`, 'In groups of m attackers, keep the best; average over the groups.', 'Compare with the exact expected maximum of m standard normals and with √(2 ln m).'],
        controls: [field('at n =', el('select', { onchange: (e) => update({ nl: Number(e.target.value) === GRID.at(-1) ? null : e.target.value }) },
          GRID.map((n) => el('option', { value: n, text: nice(n), selected: n === nLuck }))))],
        hints: ['<strong>n</strong>: at small n the scores are far from normal (a lattice, and skewed for Bernoulli), so the best of m departs from the normal formula.'],
        flag: updatingFlag(got), waiting: got.result ? null : pending(got, spec, redraw),
        view: () => luckiest(model, run, got.result, nLuck),
        why: 'Extreme values grow very slowly. Ten times more attackers buy only about half a standard deviation more for the best of them: the danger of many attackers is in their number (at least one succeeds), not in the luck of the best one.',
        notes: ['The maximum of m independent N(0, 1) has density mφ(x)Φ(x)^(m−1); its mean is computed here by numerical integration. √(2 ln m) is its leading asymptotic term, and it overestimates at every realistic m (extreme-value theory: the Gumbel limit, 🔭 deep-dive later).'],
      }),
      labPanel({
        id: 'E9', title: 'Beyond i.i.d.: attackers who differ, systems that share a weakness', name: `E9-${alpha}-${beta}-${run.seed}`,
        question: 'What if the attackers are not equally skilled, or the systems not independent? Does averaging over many systems still make the rate predictable?',
        steps: [`Each attacker draws its own skill pⱼ ~ Beta(${alpha}, ${beta}) (mean ${+het.p.toFixed(4)}), then probes the systems with that p.`, `Run the same number of identical attackers with p = ${+het.p.toFixed(4)} for comparison.`, 'Compare Var(Sₙ/n) and the histogram of Sₙ/n.'],
        controls: [numIn('α', alpha, { min: 0.2, max: 100, step: 0.1 }, 'ba'), numIn('β', beta, { min: 0.2, max: 100, step: 0.1 }, 'bb')],
        hints: [`<strong>α, β</strong>: the Beta law of skills; mean α/(α + β) = ${+het.p.toFixed(4)}, spread Var(pⱼ) = ${sci(het.varP)}, correlation of two steps of the same attacker ρ = 1/(α + β + 1) = ${het.rho.toFixed(4)}. Larger α + β = more alike.`],
        flag: updatingFlag(hetGot.stale ? hetGot : iidGot.stale ? iidGot : null),
        waiting: hetWait ? pending(hetWait[0], hetWait[1], redraw) : null,
        view: () => heterogeneous(het, iidGot.result, hetGot.result, run),
        why: 'Independence is what makes the averages converge. Once the steps share something — the attacker\'s skill, or the systems\' common software — the variance of the average has a floor, and no amount of observation removes it.',
        notes: [
          'Two readings of one formula. Different attackers: within one attacker, any two steps share pⱼ, so they are correlated with ρ = Var(pⱼ)/(p̄(1 − p̄)) = 1/(α + β + 1). Correlated systems: a hidden common factor (one library, one configuration) plays the role of pⱼ. Either way Var(Sₙ/n) = p̄(1 − p̄)(1/n + (n − 1)ρ/n) → ρ·p̄(1 − p̄) = Var(pⱼ) (Expectation and variance of sums, corollary "equicorrelated terms").',
          'The exact layer is the Beta-binomial law, P(Sₙ = k) = C(n, k)B(k + α, n − k + β)/B(α, β); as n grows, Sₙ/n tends to the Beta law of the skills themselves (🔭 de Finetti).',
          'PRACTICE: with a monoculture (every system running the same vulnerable component) one discovery opens all systems at once. The average no longer protects: the outcome is all-or-nothing, which is the statistical form of the monoculture argument.',
        ],
      }),
      got.result ? interpretation(model, run, got.result, a) : null,
    ];
  },
});
