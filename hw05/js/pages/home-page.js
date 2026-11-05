/* home-page.js — the hw05 home page: the honesty note, the exercise, how the
   model reads it, the whole homework in one picture (one hacker's running
   mean settling, many hackers' means centred on μ), the visual language of
   every plot, and the pages in reading order. The picture is simulated here,
   synchronously: 2 000 hackers × n systems take a few milliseconds at n = 10. */

import { el, explain } from '../../../assets/js/ui/dom.js';
import { startPage } from '../../../assets/js/ui/page.js';
import { plot } from '../../../assets/js/ui/plot.js';
import { nice } from '../../../assets/js/ui/format.js';
import { m } from '../../../assets/js/ui/math.js';
import { RunningStats } from '../core/running.js';
import { hackerExperiment, stream, ID } from '../core/experiments.js';
import { normPdf } from '../../../assets/js/core/numeric.js';
import { readInputs, scoreOf, DEFAULTS } from './inputs.js';
import { SIM, THEORY, MUTED, legend, densityBars, curve, sig } from './widgets.js';
import { hw05Shell, PAGES, STICKY, MEMORY, NOTICE } from './shell.js';

const STREAM = 1000, HACKERS = 2000;
const link = (href, text) => (PAGES.find((p) => p.href === href)?.built ? `<a href="${href}">${text}</a>` : text);

function exercise() {
  return el('div', { class: 'card' }, [
    el('h2', { text: 'The exercise' }),
    el('p', { html: '<strong>Ex. 1.</strong> Derive Welford\'s recurrences for the sum of squares and for the variance, following the approach Knuth uses for the running mean. Show graphically what happens and motivate the explanation. Write the code (its core is about three lines) and motivate its computational efficiency.' }),
    el('p', { html: `<strong>Ex. 2.</strong> Fix a distribution with known mean ${m`\mu`} and variance ${m`\sigma^2`}. Draw many samples; for each, compute the sample mean and the sample variance; average them and compare the averages with ${m`\mu`} and ${m`\sigma^2`}. Explain why this is useful in inferential statistics.` }),
    el('p', { html: `<strong>The experiment.</strong> Extend HW4: each penetration attempt now gets a score from 0 to 10, drawn from a fixed distribution with mean ${m`\mu`} and variance ${m`\sigma^2`}. ${m`m`} hackers each attack ${m`n`} systems; compute each hacker's sample mean and variance with Welford's algorithm; compare the averages across hackers with ${m`\mu`} and ${m`\sigma^2`} and draw conclusions; repeat for different ${m`n`} and study the variability of the sample means and variances; find manifestations of these facts in nature.` }),
  ]);
}

function decisions(run) {
  const d = scoreOf(run);
  return el('div', { class: 'card' }, [
    el('h2', { text: 'How the model reads the exercise' }),
    el('ul', {}, [
      el('li', { html: `<strong>Same roles as HW4.</strong> ${m`n`} systems = the observations of one hacker (the sample size of their ${m`\bar x_j`} and ${m`s_j^2`}); ${m`m`} hackers = independent replications. HW4's average score ${m`S_n/n`} <em>is</em> the sample mean ${m`\bar x`} here, so HW4's law of large numbers is the consistency of ${m`\bar x`}; this homework adds the rate (${m`\sigma/\sqrt{n}`}) and the second estimator, ${m`s^2`}.` }),
      el('li', { html: `<strong>The score of one attempt</strong> is a number in [0, 10] from a fixed distribution. Default 10·Beta(2, 5): most attempts achieve little, a few a lot (right skew), ${m`\mu = 20/7 \approx 2.857`}, ${m`\sigma^2 \approx 2.551`}. The dock offers ${m`U[0, 10]`}, ${m`\operatorname{Binomial}(10, p)`} (ten sub-goals, HW4's Bernoulli step summed) and any ${m`10 \cdot \operatorname{Beta}(\alpha, \beta)`}. Now: <strong>${d.label()}</strong>, ${m`\mu = ${sig(d.mean)}`}, ${m`\sigma^2 = ${sig(d.variance)}`}, skewness ${m`\gamma_1 = ${sig(d.skewness, 3)}`}, excess kurtosis ${m`\kappa = ${sig(d.exKurtosis, 3)}`}.` }),
      el('li', { html: '<strong>Ex. 2</strong> uses four shapes with the same theory: N(0, 1) (everything exact), Exp(1) (skewed, heavy-ish tail), U(0, 1) (light tails) and the hacker score (the bridge to the experiment).' }),
      el('li', { html: '<strong>Four extensions</strong> towards real uses of a running mean and variance: confidence intervals and their coverage, online anomaly detection (and how a patient attacker poisons it), merging summaries computed apart (Chan), and publishing them with differential privacy.' }),
    ]),
    explain([
      `The distribution of a penetration score is a modelling assumption, not data: real penetration-test outcomes are not documented well enough to fit one (note 03, "modelling honesty"). So the pages show what does <em>not</em> depend on the choice (the averages are unbiased for every shape) and what does (the spread of ${m`s^2`}, through the kurtosis ${m`\kappa`}).`,
      `Every estimate is shown with its standard error, so "close to the theoretical value" is always a number: the difference in units of SE (a z-score), with a verdict "consistent" when ${m`|z| \le 3`} and "check" otherwise, never hidden.`,
    ]),
  ]);
}

/** The overview figure: one hacker against many hackers. */
function overview(run) {
  const d = scoreOf(run), n = run.n;
  // left: one hacker attacking STREAM systems, Welford after every score
  const rng = stream(run.seed, ID.overview);
  const s = new RunningStats(), pts = [], meanLine = [], band = [];
  for (let k = 1; k <= STREAM; k++) {
    const x = d.sample(rng);
    s.push(x);
    pts.push([k, x]);
    meanLine.push([k, s.mean]);
    if (k >= 2) band.push([k, s.mean - s.std(), s.mean + s.std()]);
  }
  const left = plot({
    x: { log: true, min: 1, max: STREAM, title: 'k (systems attacked so far)', ticks: [1, 10, 100, 1000] },
    y: { min: 0, max: 10, title: 'score' },
    width: 420, height: 260,
    layers: [
      { type: 'points', points: pts, color: MUTED, r: 1.1, label: 'scores' },
      { type: 'band', band, color: SIM, label: 'running M ± s' },
      { type: 'hline', at: d.mean, color: THEORY, dash: false },
      { type: 'hline', at: d.mean + d.sd, color: THEORY, dash: '4 3' },
      { type: 'hline', at: Math.max(0, d.mean - d.sd), color: THEORY, dash: '4 3' },
      { type: 'line', points: meanLine, color: SIM, label: 'running mean Mₖ' },
    ],
    label: `one hacker's ${STREAM} scores with the running mean and the band of one running standard deviation, against the true mean and standard deviation`,
  });
  // right: HACKERS hackers, n systems each: the spread of their sample means
  const r = hackerExperiment({ dist: run.spec, m: HACKERS, n, seed: run.seed, keep: 0 });
  const sd = Math.sqrt(d.variance / n), lo = Math.max(d.support[0], d.mean - 4.5 * sd), hi = Math.min(d.support[1], d.mean + 4.5 * sd);
  const { bars } = densityBars(r.means, lo, hi, 36);
  const right = plot({
    x: { min: lo, max: hi, title: `x̄ⱼ (mean of a hacker's ${n} scores)` },
    y: { min: 0, title: 'density' },
    width: 420, height: 260,
    layers: [
      { type: 'bars', bars, color: SIM, label: `${nice(HACKERS)} hackers` },
      { type: 'line', points: curve((x) => normPdf((x - d.mean) / sd) / sd, lo, hi), color: THEORY, label: 'N(μ, σ²/n)' },
      { type: 'vline', at: d.mean, color: THEORY, dash: false },
    ],
    label: `histogram of the sample means of ${HACKERS} hackers with ${n} systems each, against the normal density with mean mu and variance sigma squared over n`,
  });
  return el('div', { class: 'card' }, [
    el('h2', { text: 'The whole homework in one picture' }),
    el('p', { html: `Scores from ${d.label()}, seed ${run.seed}. Left: <strong>one hacker</strong> attacking ${nice(STREAM)} systems, with Welford\'s running mean and standard deviation updated after every score. Right: <strong>${nice(HACKERS)} hackers</strong> attacking n = ${n} systems each, and where their ${nice(HACKERS)} sample means land.` }),
    el('div', { class: 'cols' }, [
      el('div', {}, [el('h3', { class: 'panel-title', html: `One hacker, many systems <span class="muted small">→ ${link('welford.html', 'Welford')}</span>` }), left,
        el('p', { class: 'small muted', html: `<strong>Settles.</strong> The running mean jumps early and settles near ${m`\mu`}; the band ${m`M \pm s`} settles near ${m`\mu \pm \sigma`}. After ${nice(STREAM)} systems: ${m`M = ${sig(s.mean)}`}, ${m`s^2 = ${sig(s.variance())}`} (${m`\mu = ${sig(d.mean)}`}, ${m`\sigma^2 = ${sig(d.variance)}`}). Three numbers kept, none of the ${nice(STREAM)} scores stored.` })]),
      el('div', {}, [el('h3', { class: 'panel-title', html: `Many hackers, n systems <span class="muted small">→ ${link('hackers.html', 'Hackers')}</span>` }), right,
        el('p', { class: 'small muted', html: `<strong>Centred on ${m`\mu`}.</strong> One hacker's ${m`\bar x_j`} is off by about ${m`\sigma/\sqrt{n} = ${sig(sd, 3)}`}; the average of the ${nice(HACKERS)} is ${sig(r.mom.means.mean)} (${m`\mu = ${sig(d.mean)}`}), off by about ${m`\sigma/\sqrt{nm} = ${sig(sd / Math.sqrt(HACKERS), 2)}`}. The average of their ${m`s_j^2`} is ${sig(r.mom.vars.mean)} (${m`\sigma^2 = ${sig(d.variance)}`}).` })]),
    ]),
    legend([['dot', MUTED, 'one hacker\'s scores'], ['line', SIM, 'running mean Mₖ'], ['band', SIM, 'running M ± s'], ['bar', SIM, 'sample means of the hackers'], ['line', THEORY, 'theory: μ, the normal density'], ['dash', THEORY, 'theory: μ ± σ']]),
    explain([
      `The two panels are the two questions of the homework. Left: what one stream of observations tells you, and how a running mean and variance can be kept in three numbers without storing the stream (Ex. 1). Right: what happens across many independent samples: their means scatter around ${m`\mu`} with spread ${m`\sigma/\sqrt{n}`}, and the average of their sample variances lands on ${m`\sigma^2`} (Ex. 2 and the experiment).`,
      `Change ${m`n`} in the dock of any experiment page and come back: the histogram on the right narrows like ${m`1/\sqrt{n}`} around the same centre. The left panel is always 1 000 systems, on a logarithmic axis so that the first ten get as much room as the last nine hundred.`,
    ]),
  ]);
}

function language() {
  return el('div', { class: 'card' }, [
    el('h2', { text: 'How to read every plot' }),
    el('ul', {}, [
      el('li', { html: '<strong>Simulation</strong>: bars and points (green-teal). What the seeded experiment produced.' }),
      el('li', { html: '<strong>Theory</strong>: a solid line (orange). What the exact formula predicts for this distribution and these sizes.' }),
      el('li', { html: '<strong>±2 standard errors</strong>: a shaded band. Where the simulation should fall about 95 % of the time if theory and code are right.' }),
      el('li', { html: '<strong>A biased estimator</strong> (SS/n, the sample SD s): dashed. It converges, but not to the true value.' }),
    ]),
    legend([['bar', SIM, 'simulation'], ['line', THEORY, 'theory'], ['band', SIM, '±2 SE'], ['dash', SIM, 'biased estimator']]),
    el('p', { class: 'small muted', text: 'Every series also has a text label, so nothing depends on colour alone. Every experiment shows its sizes and seed, and exports its numbers as CSV or JSON.' }),
  ]);
}

/** The results in a few lines (default run: 10·Beta(2, 5), m = 2 000, n = 10, seed 20261105; the pages recompute them). */
function results() {
  return el('div', { class: 'card' }, [
    el('h2', { text: 'The results in six lines' }),
    el('ul', {}, [
      el('li', { html: `<strong>Welford.</strong> ${m`S_k = S_{k-1} + d_k(x_k - M_k)`}, one application of the shift decomposition: three statements, one pass, three numbers of memory. On ${m`10^9 + \{4, 7, 13, 16\}`} the textbook formula returns −170.67 for a variance of 30; Welford returns 30.` }),
      el('li', { html: `<strong>Unbiased at every n.</strong> Across 2 000 hackers × 10 systems, ${m`\overline{\bar x} = 2.852`} (μ = 2.857, z = −0.42) and ${m`\overline{s^2} = 2.540`} (σ² = 2.551, z = −0.41); the divisor-n variance misses by ${m`\sigma^2/n`}.` }),
      el('li', { html: `<strong>One hacker vs many.</strong> One hacker's ${m`s_j^2`} from 10 systems is off by about 46 %; the average over 2 000 hackers by about 1 %. When hackers differ, ${m`\overline{s^2}`} finds only the within-group variance and the spread of the ${m`\bar x_j`} is 15 times ${m`\overline{s^2}/n`}.` }),
      el('li', { html: `<strong>1/n, with a tail constant.</strong> Both spreads fall like 1/n (fitted slopes −0.995, −1.02), but the variance's constant is ${m`(2+\kappa)\sigma^4`}: about 980 systems pin a hacker's mean to ±0.1, about 720 their variance to ±10 %.` }),
      el('li', { html: '<strong>Inference.</strong> t-intervals for μ recover their 95 % for every shape; χ² intervals for σ² do not (Exp(1): 0.69 at n = 100, limit 0.67).' }),
      el('li', { html: '<strong>Uses.</strong> A frozen baseline flags 43 % of an improved attacker’s scores, adaptive ones nearly none after a slow ramp (poisoning); shard summaries merge to 2·10⁻¹⁵, and two of them reveal a record; DP noise beats sampling noise on the mean from about 320 records.' }),
    ]),
  ]);
}

function pageList() {
  return el('div', { class: 'card' }, [
    el('h2', { text: 'The pages, in reading order' }),
    el('ul', { class: 'pagelist' }, PAGES.filter((p) => p.blurb).map((p) => el('li', {}, [
      p.built ? el('a', { href: p.href }, [el('strong', { text: p.label })]) : el('strong', { class: 'muted', text: `${p.label} (to be built)` }),
      ' ', p.blurb,
    ]))),
  ]);
}

startPage({
  shell: hw05Shell('index.html'),
  sticky: STICKY,
  memory: MEMORY,
  render: ({ state }) => {
    let run = readInputs(state);
    if (run.error) run = readInputs(DEFAULTS);   // the home page has no dock: fall back to the defaults
    return [el('p', { class: 'notice', text: NOTICE }), exercise(), decisions(run), overview(run), language(), results(), pageList()];
  },
});
