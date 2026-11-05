/* sampling-page.js — Ex. 2: for a fixed distribution, R samples of size n;
   the averages of their sample means and variances against μ and σ² (with the
   biased SS/n alongside), the sampling distributions of x̄ and s², the tilt
   between them, and why all this is what inference rests on. The samples are
   drawn in the Web Worker (samplingExperiment); this file only draws. */

import { el, field, explain } from '../../../assets/js/ui/dom.js';
import { startPage } from '../../../assets/js/ui/page.js';
import { labPanel, section, table } from '../../../assets/js/ui/lab.js';
import { plot } from '../../../assets/js/ui/plot.js';
import { nice } from '../../../assets/js/ui/format.js';
import { show } from '../../../assets/js/ui/dock.js';
import { m, M } from '../../../assets/js/ui/math.js';
import { normPdf, chi2Pdf } from '../../../assets/js/core/numeric.js';
import { moments } from '../../../assets/js/core/stats.js';
import { ex2Dist, EX2 } from '../core/dists.js';
import { varMean, varS2, meanPlugIn, seAvgMean, seAvgS2, seAvgPlugIn, corrMeanS2, c4, compare, seOfVariance } from '../core/theory.js';
import { readInputs, dock, rejected } from './inputs.js';
import {
  SIM, THEORY, MUTED, legend, evidenceHtml, figure, svgButton, sig, compareRow, COMPARE_HEAD,
  getRun, pending, updatingFlag, histogram, curve, logIndices, runningAverages, correlation, quantile,
} from './widgets.js';
import { hw05Shell, STICKY, MEMORY } from './shell.js';

const R_CHOICES = [100, 1000, 10000, 100000];
const NAMES = { normal: 'N(0, 1)', exp: 'Exp(1)', unif01: 'U(0, 1)', score: 'the hacker score' };
const ROLES = {
  normal: 'reference case: everything exact', exp: 'skewed, heavy-ish tail: s² very noisy',
  unif01: 'light tails: s² calm', score: 'the hacker score (bridge to the experiment)',
};

/* ---------- page state ---------- */

function readPage(state) {
  const dist = EX2.includes(state.ex2) ? state.ex2 : 'normal';
  const R = R_CHOICES.includes(Number(state.R)) ? Number(state.R) : 10000;
  return { dist, R };
}

const PAGE = {
  id: 'sampling', label: 'this page',
  build(apply) {
    const dist = el('select', { 'aria-label': 'distribution of Ex. 2', onchange: (e) => apply({ ex2: e.target.value }) },
      EX2.map((id) => el('option', { value: id, text: NAMES[id] })));
    const R = el('select', { 'aria-label': 'samples R', onchange: (e) => apply({ R: e.target.value }) },
      R_CHOICES.map((v) => el('option', { value: v, text: nice(v) })));
    return {
      nodes: [el('div', { class: 'row' }, [field('distribution', dist), el('div', { class: 'vrule' }), field('samples R', R)])],
      refresh(v) { show(dist, v.dist); show(R, v.R); },
    };
  },
  summary: (v) => `${NAMES[v.dist]} · R = ${nice(v.R)} samples`,
  notes: [
    '<strong>distribution</strong>: the four shapes of Ex. 2. The theory of the averages is the same for all four; what differs is how noisy one sample variance is (the tails, through the kurtosis κ). "The hacker score" is the score distribution chosen above.',
    '<strong>R</strong>: how many independent samples of size n are drawn. The averages over R samples close in on μ and σ² like 1/√R; the size of each sample is the dock\'s <strong>n</strong>.',
  ],
};

const specOf = (id, run) => (id === 'score' ? run.spec : { id });
const distOf = (id, run) => ex2Dist(id, { dist: run.dist, p: run.p, a: run.a, b: run.b });

/* ---------- 1. theory card ---------- */

function theoryCard(page, run) {
  const rows = EX2.map((id) => {
    const d = distOf(id, run);
    return [`${id === page.dist ? '▶ ' : ''}${id === 'score' ? d.label() : NAMES[id]}`, sig(d.mean), sig(d.variance), sig(d.skewness, 3), sig(d.exKurtosis, 3), ROLES[id]];
  });
  const d = distOf(page.dist, run);
  const lo = d.support[0], hi = d.support[1];
  const shape = d.discrete
    ? plot({ x: { min: lo - 0.5, max: hi + 0.5, title: 'x' }, y: { min: 0, title: 'P(X = x)' }, width: 420, height: 200,
      layers: [{ type: 'bars', bars: Array.from({ length: d.N + 1 }, (_, k) => [k - 0.35, k + 0.35, d.pmf(k)]), color: THEORY, label: 'mass function' },
        { type: 'vline', at: d.mean, color: 'var(--ink)', dash: false, text: 'μ' }], label: `mass function of ${d.label()}` })
    : plot({ x: { min: lo, max: hi, title: 'x' }, y: { min: 0, title: 'density' }, width: 420, height: 200,
      layers: [{ type: 'line', points: curve((x) => d.density(x), lo + 1e-9, hi - 1e-9, 300), color: THEORY, label: 'density' },
        { type: 'vline', at: d.mean, color: 'var(--ink)', dash: false, text: 'μ' }], label: `density of ${d.label()}` });
  return el('div', { class: 'card' }, [
    el('h2', { text: 'Four distributions, one theory' }),
    el('p', { html: `The shape changes from one to the next; the theory of the averages does not. Shown: <strong>${d.label()}</strong>, with ${m`\mu = ${sig(d.mean)}`}, ${m`\sigma^2 = ${sig(d.variance)}`}, skewness ${m`\gamma_1 = ${sig(d.skewness, 3)}`}, excess kurtosis ${m`\kappa = ${sig(d.exKurtosis, 3)}`}.` }),
    table(['distribution', m`\mu`, m`\sigma^2`, m`\gamma_1`, m`\kappa`, 'role'], rows, 'cmp roles'),
    el('div', { class: 'cols wide-first' }, [
      el('div', {}, [el('p', { html: 'What the theory predicts, for samples of size n from any of them:' }), el('div', { html: M`\mathbb{E}\,\bar x = \mu, \quad \operatorname{Var}(\bar x) = \frac{\sigma^2}{n} \\ \mathbb{E}\,s^2 = \sigma^2, \quad \operatorname{Var}(s^2) = \sigma^4\left(\frac{2}{n-1} + \frac{\kappa}{n}\right) \\ \mathbb{E}\,\frac{\mathrm{SS}}{n} = \frac{n-1}{n}\sigma^2 \quad \text{(biased by } -\sigma^2/n\text{)}` })]),
      shape,
    ]),
    explain([
      `${evidenceHtml('T')} The first two are the sample mean's lemma (linearity, and variances of independent terms add). ${m`\mathbb{E}\,s^2 = \sigma^2`} is Bessel's correction: the shift decomposition with ${m`c = \mu`} gives ${m`\mathbb{E}\,\mathrm{SS} = n\sigma^2 - \sigma^2`}. The variance of ${m`s^2`} needs the fourth moment, which is why the kurtosis ${m`\kappa = \mu_4/\sigma^4 - 3`} appears: the pairwise-form proof is in the note on the variance of the sample variance.`,
      `Scaling by 10 changes ${m`\mu`} and ${m`\sigma^2`} but not ${m`\gamma_1`} or ${m`\kappa`}: 10·Beta(2, 5) has the shape of Beta(2, 5).`,
    ]),
  ]);
}

/* ---------- 2. E4: the averages ---------- */

function averages(page, run, got) {
  const d = distOf(page.dist, run), n = run.n, R = page.R, res = got.result;
  const at = logIndices(R);
  const avgM = runningAverages(res.means, at), avgV = runningAverages(res.vars, at), avgP = runningAverages(res.plugIn, at);
  const sdM = Math.sqrt(varMean(d, n)), sdV = Math.sqrt(varS2(d, n));
  const meanPlot = plot({
    x: { log: true, min: 1, max: R, title: 'r (samples averaged)' }, y: { title: 'average of x̄' }, width: 520, height: 250,
    layers: [
      { type: 'band', band: at.map((r) => [r, d.mean - 2 * sdM / Math.sqrt(r), d.mean + 2 * sdM / Math.sqrt(r)]), color: SIM, label: '±2 SE' },
      { type: 'hline', at: d.mean, color: THEORY, dash: false, text: 'μ', anchor: 'start' },
      { type: 'line', points: avgM, color: SIM, label: 'running average of x̄' },
    ],
    label: `running average of the sample means over r samples, against mu with a plus or minus 2 standard error funnel`,
  });
  const target = meanPlugIn(d, n), sdP = ((n - 1) / n) * sdV;
  const varPlot = plot({
    x: { log: true, min: 1, max: R, title: 'r (samples averaged)' }, y: { title: 'average of s² and of SS/n' }, width: 520, height: 250,
    layers: [
      { type: 'band', band: at.map((r) => [r, d.variance - 2 * sdV / Math.sqrt(r), d.variance + 2 * sdV / Math.sqrt(r)]), color: SIM, label: '±2 SE for s²' },
      { type: 'hline', at: d.variance, color: THEORY, dash: false, text: 'σ²', anchor: 'start' },
      { type: 'hline', at: target, color: THEORY, dash: '5 4' },
      { type: 'line', points: avgP, color: SIM, dash: '5 4', label: 'running average of SS/n (biased)', end: 'SS/n' },
      { type: 'line', points: avgV, color: SIM, label: 'running average of s²', end: 's²' },
    ],
    label: 'running averages of the sample variance and of SS over n, against sigma squared and n minus 1 over n sigma squared',
  });
  const mom = res.mom, sds = Float64Array.from(res.vars, Math.sqrt), sMom = moments(sds);
  const cM = compare(mom.means.mean, d.mean, seAvgMean(d, n, R));
  const cV = compare(mom.vars.mean, d.variance, seAvgS2(d, n, R));
  const cP = compare(mom.plugIn.mean, target, seAvgPlugIn(d, n, R));
  const cPvs = compare(mom.plugIn.mean, d.variance, seAvgPlugIn(d, n, R));
  const isNormal = page.dist === 'normal';
  const cS = isNormal ? compare(sMom.mean, c4(n) * d.sd, sMom.sd / Math.sqrt(R)) : null;
  const rows = [
    compareRow(`average of ${m`\bar x`} vs ${m`\mu`}`, cM),
    compareRow(`average of ${m`s^2`} vs ${m`\sigma^2`}`, cV),
    compareRow(`average of ${m`\mathrm{SS}/n`} vs ${m`\frac{n-1}{n}\sigma^2`}`, cP),
    compareRow(`average of ${m`\mathrm{SS}/n`} vs ${m`\sigma^2`} <span class="small muted">(the bias)</span>`, cPvs),
    cS ? compareRow(`average of ${m`s`} vs ${m`c_4(n)\,\sigma`}`, cS)
      : [el('span', { html: `average of ${m`s`} vs ${m`\sigma`}` }), sig(sMom.mean), sig(d.sd), sig(sMom.mean - d.sd, 3), sig(sMom.sd / Math.sqrt(R), 3), '—', el('span', { class: 'small muted', text: 'below σ (Jensen); no closed form here' })],
  ];
  const ok = cM.ok && cV.ok && cP.ok;
  return {
    answer: {
      text: `Averaged over R = ${nice(R)} samples of size n = ${n}: ${m`\overline{\bar x} = ${sig(mom.means.mean)}`} against ${m`\mu = ${sig(d.mean)}`} (z = ${cM.z.toFixed(2)}), ${m`\overline{s^2} = ${sig(mom.vars.mean)}`} against ${m`\sigma^2 = ${sig(d.variance)}`} (z = ${cV.z.toFixed(2)}): ${ok ? 'no systematic error' : 'one of them is more than 3 SE away: try another seed'}. The divisor-n variance averages ${sig(mom.plugIn.mean)}, on ${m`\frac{n-1}{n}\sigma^2 = ${sig(target)}`}, so it misses ${m`\sigma^2`} by ${m`\sigma^2/n = ${sig(d.variance / n, 3)}`} however many samples are averaged.`,
      ok,
    },
    body: [
      ...section(1, 'The averages close in on the truth', `Each line is the average of the first r samples' statistic. The shaded funnel is the truth ±2 standard errors, ${m`2\sigma/\sqrt{nr}`} for the mean and ${m`2\,\mathrm{SD}(s^2)/\sqrt{r}`} for the variance: an unbiased average stays inside it about 95 % of the time. The dashed line, ${m`\mathrm{SS}/n`}, converges too, but to the wrong value.`),
      el('div', { class: 'cols' }, [figure(meanPlot), figure(varPlot)]),
      el('div', { class: 'row end' }, [svgButton(meanPlot, 'hw05-E4-mean'), svgButton(varPlot, 'hw05-E4-var')]),
      legend([['line', SIM, 'running average'], ['dash', SIM, 'running average of SS/n (biased)'], ['band', SIM, 'truth ± 2 SE'], ['line', THEORY, 'μ, σ²'], ['dash', THEORY, '(n−1)/n · σ²']]),
      ...section(2, 'Measured against theory', `Difference in units of its standard error: ${m`z = (\text{measured} - \text{theory})/\mathrm{SE}`}; "consistent" when ${m`|z| \le 3`}. The ${m`\mathrm{SS}/n`} row against ${m`\sigma^2`} is meant to fail: that is the bias.`),
      table(COMPARE_HEAD, rows, 'cmp'),
    ],
    rows: [['mean', cM], ['s2', cV], ['plugIn', cP], ['plugIn_vs_sigma2', cPvs]].map(([k, c]) => ({ statistic: k, ...c })),
    summary: { distribution: d.label(), n, R, seed: run.seed, mean: cM, s2: cV, plugIn: cP },
  };
}

/* ---------- 3. sampling distributions ---------- */

function meanDistributions(page, run, g5, g50) {
  const d = distOf(page.dist, run);
  const sd5 = Math.sqrt(d.variance / 5), lo = d.mean - 4.2 * sd5, hi = d.mean + 4.2 * sd5;
  const hist = (g, n) => {
    const sd = Math.sqrt(d.variance / n);
    return histogram({
      values: g.result.means, lo, hi, bins: 60, width: 460, height: 220, xTitle: `x̄ (n = ${n})`,
      curves: [{ f: (x) => normPdf((x - d.mean) / sd) / sd, label: 'N(μ, σ²/n)' }], refs: [{ at: d.mean }],
      label: `histogram of ${nice(g.result.R)} sample means at n = ${n}, against the normal density`,
    });
  };
  const a = hist(g5, 5), b = hist(g50, 50);
  return [
    ...section(3, el('span', { html: `The sampling distribution of ${m`\bar x`}` }), `The same ${nice(page.R)} samples drawn at ${m`n = 5`} and at ${m`n = 50`}, on one axis. The centre stays at ${m`\mu`}; the width shrinks like ${m`\sigma/\sqrt{n}`} (here from ${sig(sd5, 3)} to ${sig(Math.sqrt(d.variance / 50), 3)}); the shape becomes normal (CLT) even when the data are not.`),
    el('div', { class: 'cols' }, [figure(a, `n = 5: measured SD ${sig(g5.result.mom.means.sd, 3)}, theory ${sig(sd5, 3)}.`), figure(b, `n = 50: measured SD ${sig(g50.result.mom.means.sd, 3)}, theory ${sig(Math.sqrt(d.variance / 50), 3)}.`)]),
  ];
}

function varianceDistributions(page, run, gots) {
  const n = run.n;
  const ratios = EX2.map((id, i) => Float64Array.from(gots[i].result.vars, (v) => v / distOf(id, run).variance));
  const hi = Math.max(...ratios.map((r) => quantile(r, 0.995)));
  const panels = EX2.map((id, i) => {
    const d = distOf(id, run), k = n - 1;
    const curves = id === 'normal' ? [{ f: (y) => k * chi2Pdf(k * y, k), label: 'scaled χ²ₙ₋₁' }] : [];
    return el('div', {}, [
      el('h3', { class: 'panel-title', text: id === 'score' ? d.label() : NAMES[id] }),
      histogram({ values: ratios[i], lo: 0, hi, bins: 50, width: 480, height: 220, xTitle: 's²/σ²', curves, refs: [{ at: 1, color: 'var(--ink)' }],
        label: `histogram of s squared over sigma squared for ${d.label()} at n = ${n}` }),
    ]);
  });
  const rows = EX2.map((id, i) => {
    const d = distOf(id, run), emp = gots[i].result.mom.vars, th = Math.sqrt(varS2(d, n));
    return [id === 'score' ? d.label() : NAMES[id], sig(emp.mean / d.variance, 4), sig(emp.sd / d.variance, 3), sig(th / d.variance, 3), sig(d.exKurtosis, 3)];
  });
  return [
    ...section(4, el('span', { html: `The sampling distribution of ${m`s^2`}, four shapes` }), `${m`s^2/\sigma^2`} at ${m`n = ${n}`} for the four distributions, on one axis. All are centred at 1 (unbiased); their widths differ by the tails, ${m`\mathrm{SD}(s^2)/\sigma^2 = \sqrt{2/(n-1) + \kappa/n}`}. For normal data ${m`(n-1)s^2/\sigma^2 \sim \chi^2_{n-1}`} exactly (Cochran), drawn over the first panel.`),
    el('div', { class: 'cols four' }, panels),
    table(['distribution', `mean of ${m`s^2/\sigma^2`}`, `SD measured`, 'SD theory', m`\kappa`], rows),
  ];
}

function scatter(page, run, got) {
  const d = distOf(page.dist, run), n = run.n, res = got.result;
  const N = Math.min(2000, res.R), pts = Array.from({ length: N }, (_, i) => [res.means[i], res.vars[i]]);
  const r = correlation(res.means, res.vars), th = corrMeanS2(d, n);
  const node = plot({
    x: { title: 'x̄' }, y: { min: 0, title: 's²' }, width: 520, height: 260,
    layers: [{ type: 'points', points: pts, color: SIM, r: 1.6, label: 'one sample' },
      { type: 'vline', at: d.mean, color: THEORY, dash: '4 3' }, { type: 'hline', at: d.variance, color: THEORY, dash: '4 3' }],
    label: `scatter of sample mean against sample variance for ${N} samples`,
  });
  return [
    ...section(5, `Mean and variance move together when the data are skewed`, `Each point is one sample (${N} of ${nice(res.R)} shown). Theory: ${m`\operatorname{Cov}(\bar x, s^2) = \mu_3/n`}, a correlation of ${sig(th, 3)} here; measured on all ${nice(res.R)} samples: ${sig(r, 3)}.`),
    figure(node, Math.abs(d.skewness) < 1e-9 ? 'Symmetric data (μ₃ = 0): no tilt. For normal data x̄ and s² are even independent.' : `Right-skewed data (μ₃ > 0): a sample that happened to catch a large value has both a larger mean and a larger variance, so the cloud tilts upward.`),
  ];
}

/* ---------- 4. why it matters ---------- */

function inference() {
  return el('div', { class: 'card' }, [
    el('h2', { text: 'Why this matters for inferential statistics' }),
    el('ol', {}, [
      el('li', { html: `<strong>We never know ${m`\mu`} and ${m`\sigma^2`}; we have one sample.</strong> Unbiasedness says the estimator is right <em>on average over repetitions</em>: it has no systematic error. That is exactly what the averages above show. ${evidenceHtml('T')} ${evidenceHtml('M')}` }),
      el('li', { html: `<strong>The spread of the sampling distribution is the uncertainty of one estimate.</strong> ${m`\mathrm{SE}(\bar x) = \sigma/\sqrt{n}`} is estimated by ${m`s/\sqrt{n}`}, so ${m`s^2`} is needed to say how wrong ${m`\bar x`} might be: the two estimators work together. ${evidenceHtml('T')}` }),
      el('li', { html: `<strong>Known sampling distributions give intervals and tests.</strong> For normal data the ${m`t`} and ${m`\chi^2`} laws are exact. Otherwise the CLT rescues the mean (the ${m`\bar x`} histograms turn normal) but not the variance (the ${m`s^2`} widths stay set by ${m`\kappa`}): see the Intervals page. ${evidenceHtml('T')}` }),
      el('li', { html: `<strong>Unbiasedness is what makes pooling work.</strong> Averaging unbiased estimates from many independent sources (hackers, labs, sensors, studies) converges to the truth; averaging biased ones converges to the wrong value however many are collected — the dashed ${m`\mathrm{SS}/n`} line. This is the basis of meta-analysis and of distributed estimation. ${evidenceHtml('T')}` }),
      el('li', { html: `<strong>The ${m`n-1`} is not a convention</strong>: it is the correction that makes pooling work. For one-shot accuracy a different divisor can be better: for normal data the mean squared error of ${m`\mathrm{SS}/c`} is smallest at ${m`c = n+1`} (trap T3). Choose the divisor by the goal. ${evidenceHtml('T')}` }),
    ]),
  ]);
}

startPage({
  shell: hw05Shell('sampling.html'),
  sticky: STICKY,
  memory: MEMORY,
  preserve: true,
  render: (api) => {
    const { state, update } = api;
    const run = readInputs(state), page = readPage(state);
    dock(run, update, PAGE, page);
    if (run.error) return [rejected(run.error)];
    const redraw = () => api.draw();
    const spec = (id, n) => ({ kind: 'sampling', args: { dist: specOf(id, run), n, R: page.R, seed: run.seed } });
    const specs = [spec(page.dist, run.n), spec(page.dist, 5), spec(page.dist, 50), ...EX2.map((id) => spec(id, run.n))];
    const slots = ['main', 'n5', 'n50', ...EX2.map((id) => `four-${id}`)];
    const all = specs.map((sp, i) => getRun(sp, redraw, slots[i]));
    const [got, g5, g50, ...four] = all;
    const wi = all.findIndex((g) => !g.result);
    const d = distOf(page.dist, run);
    return [
      theoryCard(page, run),
      labPanel({
        hw: 'hw05', id: 'E4', title: 'E4 · Many samples: do the averages hit μ and σ²?', name: `E4-${page.dist}-n${run.n}-R${page.R}-seed${run.seed}`,
        question: `Draw R samples of size n from ${page.dist === 'score' ? d.label() : NAMES[page.dist]}; does the average of their sample means land on μ, and the average of their sample variances on σ²?`,
        steps: [
          `draw R = ${nice(page.R)} independent samples of n = ${run.n} values (seed ${run.seed});`,
          `for each sample run Welford: ${m`\bar x_r`}, ${m`s_r^2 = S/(n-1)`} and ${m`\mathrm{SS}_r/n`};`,
          `average each over the R samples and compare with ${m`\mu`}, ${m`\sigma^2`} and ${m`\frac{n-1}{n}\sigma^2`}, in units of standard error;`,
          `look at the whole sampling distributions: ${m`\bar x`} at n = 5 and 50, ${m`s^2/\sigma^2`} for all four shapes, and the pairs ${m`(\bar x, s^2)`}.`,
        ],
        flag: updatingFlag(all.find((g) => g.stale)),
        waiting: wi >= 0 ? pending(all[wi], specs[wi], redraw) : null,
        view: () => {
          const out = averages(page, run, got);
          out.body.push(...meanDistributions(page, run, g5, g50), ...varianceDistributions(page, run, four), ...scatter(page, run, got));
          return out;
        },
        why: `unbiasedness is a statement about averages over repetitions, and this is what repetitions look like. It is also what licenses pooling: the experiment on the Hackers page is this same picture with samples called hackers.`,
        notes: [
          `The standard errors used: ${m`\mathrm{SE}(\overline{\bar x}) = \sigma/\sqrt{nR}`}, ${m`\mathrm{SE}(\overline{s^2}) = \sqrt{\operatorname{Var}(s^2)/R}`}, both from the exact formulas. With many comparisons on a page, an occasional ${m`|z|`} between 2 and 3 is expected; above 3, rerun with another seed before suspecting the code.`,
          `${m`s = \sqrt{s^2}`} is biased low even though ${m`s^2`} is unbiased (Jensen's inequality: the square root is concave). For normal data ${m`\mathbb{E}\,s = c_4(n)\,\sigma`}, with ${m`c_4(10) = 0.9727`}; for other shapes there is no simple closed form, so the table only shows that the average falls below ${m`\sigma`}.`,
          `The samples are the same for every statistic: the (x̄, s²) pairs, the running averages and the tables all come from one set of R samples per distribution and n.`,
        ],
      }),
      inference(),
    ];
  },
});
