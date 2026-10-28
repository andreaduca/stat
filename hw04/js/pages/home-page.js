/* home-page.js — the hw04 home page: the exercise, the modelling decisions,
   the whole homework in one picture (the same 20 attackers drawn as Sₖ, Sₖ/k
   and Sₖ/√k), the three quantities, the three layers of every plot, and the
   pages in reading order. The 20 paths are simulated here, synchronously:
   2·10⁵ steps take a few milliseconds. */

import { el, explain } from '../../../assets/js/ui/dom.js';
import { startPage } from '../../../assets/js/ui/page.js';
import { plot } from '../../../assets/js/ui/plot.js';
import { StepModel } from '../core/models.js';
import { Simulation } from '../core/simulate.js';
import { readRun } from './run-input.js';
import { SIM, LIMIT, legend } from './widgets.js';
import { hw04Shell, PAGES, STICKY, MEMORY } from './shell.js';

const N_MAX = 10000, PATHS = 20;
const link = (href, text) => (PAGES.find((p) => p.href === href)?.built ? `<a href="${href}">${text}</a>` : text);

function exercise() {
  return el('div', { class: 'card' }, [
    el('h2', { text: 'The exercise' }),
    el('p', { text: 'Consider n systems and m attackers. Model the penetration process as a stochastic process with independent and identically distributed increments X₁, X₂, …, the penetration score at each step, under two models: Bernoulli, Xᵢ ∈ {0, 1} with P(Xᵢ = 1) = p; and Rademacher, Xᵢ ∈ {−1, +1} with probability ½ each (the symmetric, zero-mean case).' }),
    el('p', { text: 'For increasing n and suitable m, simulate many trajectories and study the distributions of the total score Sₙ = ΣXᵢ, the average score Sₙ/n and the normalised total Sₙ/√n. Compare them as n grows: the convergence in probability of Sₙ/n (law of large numbers), the variance under the three normalisations, and the convergence in distribution of Sₙ/√n to N(0, 1) in the Rademacher case (central limit theorem). Interpret the trajectories for n systems and m attackers: how system size and the number of attackers affect the aggregate score.' }),
  ]);
}

function decisions() {
  const cell = (t, cls = '') => el('td', { class: cls, text: t });
  const rows = [['attacker 1', 'X₁⁽¹⁾', 'X₂⁽¹⁾', '…', 'Xₙ⁽¹⁾', 'Sₙ⁽¹⁾'], ['attacker 2', 'X₁⁽²⁾', 'X₂⁽²⁾', '…', 'Xₙ⁽²⁾', 'Sₙ⁽²⁾'],
    ['⋮', '', '', '', '', '⋮'], ['attacker m', 'X₁⁽ᵐ⁾', 'X₂⁽ᵐ⁾', '…', 'Xₙ⁽ᵐ⁾', 'Sₙ⁽ᵐ⁾']];
  return el('div', { class: 'card' }, [
    el('h2', { text: 'How the model reads the exercise' }),
    el('ul', {}, [
      el('li', { html: '<strong>n systems = n steps.</strong> Each attacker probes the systems one after the other; Xᵢ is the score it obtains on system i, and Sₖ its running total after k systems.' }),
      el('li', { html: '<strong>m attackers = m independent trajectories.</strong> The distribution of Sₙ, Sₙ/n or Sₙ/√n at a given n is seen across the m attackers.' }),
      el('li', { html: '<strong>Everything is i.i.d.</strong>, across systems and across attackers. The whole homework rests on this assumption; where it breaks is discussed on the Systems & attackers page.' }),
    ]),
    el('div', { class: 'scroll-x' }, [el('table', { class: 'data prose grid-model', 'aria-label': 'm attackers by n systems' }, [
      el('thead', {}, [el('tr', {}, ['', 'system 1', 'system 2', '…', 'system n', 'total'].map((h, i) => el('th', { class: i ? null : 'left', text: h })))]),
      el('tbody', {}, rows.map((r) => el('tr', {}, r.map((t, i) => cell(t, i === 0 ? 'left' : i === 5 ? 'total' : ''))))),
    ])]),
    el('h3', { text: 'The two step models' }),
    el('div', { class: 'scroll-x' }, [el('table', { class: 'data compare prose' }, [
      el('thead', {}, [el('tr', {}, ['', 'Bernoulli(p)', 'Rademacher'].map((h, i) => el('th', { class: i ? null : 'left', text: h })))]),
      el('tbody', {}, [
        ['values', '{0, 1}', '{−1, +1}'],
        ['one step means', '1 = system penetrated, 0 = attempt failed', '+1 = attacker gains ground, −1 = defender pushes back'],
        ['mean μ', 'p', '0'],
        ['variance σ²', 'p(1 − p)', '1'],
        ['a path is', 'a staircase that never goes down', 'a zig-zag around 0'],
        ['Sₙ', 'systems penetrated, Binomial(n, p)', 'net advantage, 2B − n with B ~ Binomial(n, ½)'],
      ].map((r) => el('tr', {}, r.map((t, i) => el('td', { class: i ? null : 'left', text: t }))))),
    ])]),
    explain([
      'The two models are one coin seen two ways. For p = ½, a Rademacher step is R = 2B − 1 for a fair Bernoulli B, so S<sub>n</sub><sup>R</sup> = 2S<sub>n</sub><sup>B</sup> − n: Rademacher is the fair Bernoulli <em>centred</em> (mean 0) and <em>rescaled</em> (variance 1). The "symmetric, zero-mean case" of the assignment is exactly the case without drift.',
      'The probability is rigorous; the security reading of a step is a modelling choice. Reading −1 as "the defender wins a round" turns the attack into a race between attacker and defender, which is where gambler\'s ruin comes from (Thresholds page).',
    ]),
  ]);
}

/** The overview figure: one simulation, three normalisations of the same paths. */
function overview(run) {
  const res = new Simulation({ model: new StepModel({ kind: 'rademacher' }), m: PATHS, grid: [N_MAX], seed: run.seed, keepPaths: PATHS }).run();
  const ks = Array.from({ length: 81 }, (_, i) => Math.round(10 ** (i / 20)));   // 1 … 10⁴, log-spaced
  const map = (f) => res.paths.map((p) => Array.from(p.k, (k, i) => [k, k ? f(p.S[i], k) : NaN]));
  const env = (f, c, dash = true) => [+1, -1].map((s) => ({ type: 'line', points: ks.map((k) => [k, s * c * f(k)]), color: 'var(--muted)', dash, thin: true, hover: false }));
  const maxAbs = Math.max(...res.paths.flatMap((p) => Array.from(p.S, Math.abs)), 2 * Math.sqrt(N_MAX));
  const x = { log: true, min: 1, max: N_MAX, title: 'k (systems probed)', ticks: [1, 10, 100, 1000, 10000] };
  const panel = (title, href, page, f, y, envF, caption) => el('div', {}, [
    el('h3', { class: 'panel-title', html: `${title} <span class="muted small">→ ${link(href, page)}</span>` }),
    plot({
      x, y, width: 360, height: 230,
      layers: [
        { type: 'paths', paths: map(f), color: SIM, label: 'attacker', names: res.paths.map((p) => `attacker ${p.attacker + 1}`) },
        { type: 'hline', at: 0, color: LIMIT, dash: false },
        ...env(envF, 1), ...env(envF, 2),
      ],
      label: `${PATHS} Rademacher paths drawn as ${title}, with envelopes at one and two standard deviations`,
    }),
    el('p', { class: 'small muted', html: caption }),
  ]);
  return el('div', { class: 'card' }, [
    el('h2', { text: 'The whole homework in one picture' }),
    el('p', { html: `The same ${PATHS} Rademacher attackers (seed ${run.seed}), probing up to ${N_MAX.toLocaleString('en-US').replace(/,/g, '\u202f')} systems each, drawn three ways. Only the scale changes from one panel to the next. Hover to follow one attacker across the three panels.` }),
    el('div', { class: 'cols three' }, [
      panel('Sₖ', 'model.html', 'Model & paths', (s) => s, { min: -maxAbs, max: maxAbs, title: 'Sₖ' }, (k) => Math.sqrt(k),
        '<strong>Fans out.</strong> The total wanders further and further from 0, like ±√k: more systems, larger swings both ways.'),
      panel('Sₖ/k', 'lln.html', 'LLN', (s, k) => s / k, { min: -1, max: 1, title: 'Sₖ/k' }, (k) => 1 / Math.sqrt(k),
        '<strong>Collapses.</strong> The average closes in on μ = 0 like ±1/√k: the law of large numbers.'),
      panel('Sₖ/√k', 'clt.html', 'CLT', (s, k) => s / Math.sqrt(k), { min: -3.5, max: 3.5, title: 'Sₖ/√k' }, () => 1,
        '<strong>Stays put.</strong> Its spread neither grows nor shrinks: at any k it is roughly N(0, 1), the central limit theorem.'),
    ]),
    legend([['path', SIM, `${PATHS} attackers (one line each)`], ['dash', 'var(--muted)', '±1 and ±2 standard deviations of the plotted quantity']]),
    explain([
      'All three panels show Sₖ/k<sup>α</sup> for the same paths, with α = 0, 1 and ½. Since Var(Sₖ) = kσ², the standard deviation of Sₖ/k<sup>α</sup> is σ·k<sup>½ − α</sup>. The dashed envelopes are ±1 and ±2 times it: √k, 1/√k and 1. The paths respect the envelopes in all three panels, because they are the same scaling law seen three ways.',
      'About 68 % of the attackers sit inside the inner envelope at any fixed k, and 95 % inside the outer one. A single path still escapes now and then; the CLT describes a cross-section at fixed k, not the whole path. The x axis is logarithmic so that the first ten systems get as much room as the last nine thousand.',
    ]),
  ]);
}

function quantities() {
  const rows = [
    ['Sₙ', 'total score: damage done, systems compromised', 'nμ', 'nσ²', 'grows like nμ, spreads like σ√n'],
    ['Sₙ/n', 'average score: the attacker\'s success rate', 'μ', 'σ²/n', '→ μ in probability (LLN)'],
    ['Sₙ/√n', 'fluctuation scale: luck against skill', 'μ√n', 'σ²', 'Rademacher: → N(0, 1) in distribution (CLT); Bernoulli: drifts to +∞'],
  ];
  return el('div', { class: 'card' }, [
    el('h2', { text: 'Three quantities, one family' }),
    el('div', { class: 'scroll-x' }, [el('table', { class: 'data compare prose' }, [
      el('thead', {}, [el('tr', {}, ['', 'what it measures', 'mean', 'variance', 'as n → ∞'].map((h, i) => el('th', { class: i ? null : 'left', text: h })))]),
      el('tbody', {}, rows.map((r) => el('tr', {}, r.map((t, i) => el('td', { class: i === 0 ? 'left eq' : i === 1 || i === 4 ? 'left' : null, text: t }))))),
    ])]),
    el('p', { class: 'small', html: 'All three are Sₙ/n<sup>α</sup> with α = 0, 1, ½, and Var(Sₙ/n<sup>α</sup>) = n<sup>1 − 2α</sup>σ². On log-log axes the three variances are lines of slope +1, −1 and 0. One plot answers "the behaviour of the variance under the different normalisations".' }),
  ]);
}

function layers() {
  return el('div', { class: 'card' }, [
    el('h2', { text: 'Three layers on every plot' }),
    el('ol', {}, [
      el('li', { html: '<strong>Simulation</strong>: what the m attackers produced (bars and points).' }),
      el('li', { html: '<strong>Exact</strong>: the true distribution at this finite n. Every quantity is a transformed binomial, so it can be computed exactly (dots).' }),
      el('li', { html: '<strong>Limit</strong>: what the theorem says happens as n → ∞: a point mass at μ, or the normal density (dashed).' }),
    ]),
    legend([['bar', SIM, 'simulation'], ['dot', 'var(--s2)', 'exact'], ['dash', LIMIT, 'limit']]),
    el('p', { html: 'The gap between simulation and exact is <strong>Monte Carlo noise</strong>; it shrinks like 1/√m. The gap between exact and limit is the <strong>error of the theorem</strong> at this n; it shrinks as n grows. Keeping them apart is the main methodological point of the homework. Without the middle layer, a mismatch could be blamed on either.' }),
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
  shell: hw04Shell('index.html'),
  sticky: STICKY,
  memory: MEMORY,
  preserve: true,
  render: ({ state }) => {
    const run = readRun(state);
    return [exercise(), decisions(), overview(run), quantities(), layers(), pageList()];
  },
});
