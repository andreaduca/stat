/* home-page.js — the hw06 home page: the honesty note, the exercise, how the
   homework reads it, the whole homework in one picture (sin x cut vertically and
   horizontally; the bell curve with the tail Φ(x) shaded), the visual language
   of every plot, and the pages in reading order. No dock: nothing here is random. */

import { el, explain, pageLink, pageList } from '../../../assets/js/ui/dom.js';
import { startPage } from '../../../assets/js/ui/page.js';
import { plot, curve } from '../../../assets/js/ui/plot.js';
import { m } from '../../../assets/js/ui/math.js';
import { FUNCTIONS } from '../core/functions.js';
import { midpoint } from '../core/riemann.js';
import { AnalyticMeasure, layerCakeMidpoint } from '../core/lebesgue.js';
import { Phi, pdf } from '../core/normal.js';
import { RIEMANN, LEBESGUE, REF, MUTED, legend, sig, abstract, anchor } from './widgets.js';
import { hw06Shell, PAGES, STICKY, MEMORY, NOTICE } from './shell.js';

const link = (href, text) => pageLink(PAGES, href, text);

function exercise() {
  return el('div', { class: 'card' }, [
    el('h2', { text: 'The exercise' }),
    el('p', { html: '<strong>Ex. 1.</strong> Take a collection of interesting functions and integrate them numerically in two ways: inspired by Riemann (partition the domain) and inspired by Lebesgue (partition the range and measure the preimages). Compare accuracy, speed of convergence and computational efficiency. For Riemann-integrable functions, do both approaches reach the same limit? Show examples where they behave differently.' }),
    el('p', { html: `<strong>Ex. 2.</strong> Find an efficient numerical method for the standard normal CDF ${m`\Phi(x) = \int_{-\infty}^{x} \tfrac{1}{\sqrt{2\pi}} e^{-t^2/2}\,dt`}, implement it, evaluate it at several points, and compare with a trusted reference from the web; investigate efficiency and accuracy. Explain, through Liouville's theorem, why ${m`\Phi`} has no elementary closed form, in what sense ${m`\operatorname{erf}`} is an "exact" representation, and why numerical methods are still needed. Explore numerical integration, series and erf-based approximations, and look for references to natural phenomena.` }),
  ]);
}

function decisions() {
  return el('div', { class: 'card' }, [
    el('h2', { text: 'How these pages read the exercise' }),
    el('ul', {}, [
      el('li', { html: `<strong>The bridge between the two integrals</strong> is the layer-cake formula ${m`\int_\Omega f = m\,\lambda(\Omega) + \int_m^M \lambda\{f > t\}\,dt`}: Lebesgue's integral is an ordinary one-dimensional integral over heights, of the measure of each preimage. So "Lebesgue numerics" means: pick levels ${m`t_k`}, compute ${m`\lambda\{f > t_k\}`}, add up. The whole difficulty moves into computing those measures.` }),
      el('li', { html: '<strong>Three ways to measure a preimage</strong>, each with its cost counted: an analytic inverse (free, but someone did the work by hand), root finding on each monotone piece (pays in evaluations of f), Monte Carlo (pays in samples). Counting grid points is shown once, as the proof that it gives back a Riemann sum.' }),
      el('li', { html: `<strong>Eleven integrands</strong>: smooth ones (${m`\sin x`}, ${m`x^2`}, ${m`\sin x/x`}), steps on and off the grid, a kink, a singularity (${m`x^{-1/2}`}), infinitely many oscillations (${m`\sin(1/x)`}), and the pathological ones: Dirichlet, Thomae, a fat Cantor set, ${m`\sin x/x`} on ${m`[0, \infty)`}, the Cantor function.` }),
      el('li', { html: `<strong>Target for ${m`\Phi`}</strong>: full double-precision <em>relative</em> accuracy, tails included, for every ${m`x \ge -37.5`} (where ${m`\Phi(x)`} is still a normal double), and ${m`\ln \Phi`} beyond. A tail probability of ${m`10^{-20}`} with an absolute error of ${m`10^{-16}`} is not an answer.` }),
      el('li', { html: '<strong>The reference</strong>: 80-digit values computed by two independent methods (a positive series and Laplace\'s continued fraction, in Python\'s <code>decimal</code>), which agree to 68 digits or more; and the NIST/SEMATECH normal table as the web reference.' }),
      el('li', { html: '<strong>Four extensions</strong> towards inference and security: p-values and 5σ, Gaussian sampling for lattice cryptography, statistical distance and differential privacy, Monte Carlo as Lebesgue.' }),
    ]),
    explain([
      'Every numerical result is shown with its error against a known reference, and every comparison between methods shows both accuracy and cost: a method that is accurate but takes a million evaluations is not better than one that is slightly less accurate in a hundred.',
      'Claims carry their evidence: <span class="evidence theorem">theorem</span> proved in the notes, <span class="evidence measurement">measured</span> on these pages, <span class="evidence record">source</span> from the literature (to be checked), <span class="evidence opinion">opinion</span>.',
    ]),
  ]);
}

/** The overview figure: one function cut two ways, and the integral of Ex. 2. */
function overview() {
  const f1 = FUNCTIONS.f1, N = 8, K = 6, PI = Math.PI;
  const fx = curve(Math.sin, 0, PI);
  const h = PI / N;
  const rects = Array.from({ length: N }, (_, i) => [i * h, (i + 1) * h, Math.sin((i + 0.5) * h)]);
  const riemann = plot({
    x: { min: 0, max: PI, title: 'x', ticks: [0, PI / 2, PI], format: (v) => (v === 0 ? '0' : v < 2 ? 'π/2' : 'π') },
    y: { min: -0.08, max: 1.05, title: 'f(x)', ticks: [0, 0.5, 1] },
    width: 340, height: 240,
    layers: [
      { type: 'bars', bars: rects, color: RIEMANN, label: 'rectangle height' },
      { type: 'line', points: fx, color: REF, label: 'sin x' },
    ],
    label: `sine on zero to pi with ${N} midpoint rectangles: the domain is cut into equal cells`,
  });
  const d = 1 / K, slabs = [];
  for (let k = 0; k < K; k++) {
    const t = (k + 0.5) * d, a = Math.asin(t);
    const lo = k * d, hi = (k + 1) * d, b = PI - a;
    slabs.push({ type: 'band', band: [[a, lo, hi], [b, lo, hi]], color: LEBESGUE },
      { type: 'line', points: [[a, lo], [a, hi], [b, hi], [b, lo], [a, lo]], color: LEBESGUE, thin: true, hover: false });
  }
  const tTop = (K - 0.5) * d, aTop = Math.asin(tTop);
  const lebesgue = plot({
    x: { min: 0, max: PI, title: 'x', ticks: [0, PI / 2, PI], format: (v) => (v === 0 ? '0' : v < 2 ? 'π/2' : 'π') },
    y: { min: -0.08, max: 1.05, title: 'f(x)', ticks: [0, 0.5, 1] },
    width: 340, height: 240,
    layers: [
      ...slabs,
      { type: 'line', points: [[aTop, -0.04], [PI - aTop, -0.04]], color: LEBESGUE, label: 'preimage of the top level', hover: false },
      { type: 'hline', at: tTop, color: LEBESGUE, text: `t = ${sig(tTop, 2)}` },
      { type: 'line', points: fx, color: REF, label: 'sin x' },
    ],
    label: `sine on zero to pi with ${K} horizontal slabs: the range is cut into levels, each slab as wide as the set where sine exceeds its level`,
  });
  const x0 = -1.5;
  const bell = plot({
    x: { min: -4, max: 4, title: 't' },
    y: { min: 0, max: 0.43, title: 'φ(t)', ticks: [0, 0.2, 0.4] },
    width: 340, height: 240,
    layers: [
      ...[0, 1].map(() => ({ type: 'band', band: curve(pdf, -4, x0, 80).map(([t, y]) => [t, 0, y]), color: LEBESGUE })),   // twice: a stronger shade
      { type: 'line', points: curve(pdf, -4, 4), color: REF, label: 'φ(t)' },
      { type: 'vline', at: x0, color: MUTED, text: 'x = −1.5' },
    ],
    label: 'the standard normal density with the area to the left of minus 1.5 shaded: Phi of x, which has no elementary formula',
  });
  const r = midpoint(f1, N).value, c = layerCakeMidpoint(f1, new AnalyticMeasure(f1), K).value;
  return el('div', { class: 'card' }, [
    el('h2', { text: 'The whole homework in one picture' }),
    el('div', { class: 'cols three' }, [
      el('div', {}, [el('h3', { class: 'panel-title', html: `Riemann: cut the domain <span class="muted small">→ ${link('integration.html', 'Ex. 1')}</span>` }), riemann,
        el('p', { class: 'small muted', html: `${N} cells of equal width, one height each (the value at the midpoint): ${m`\sum f(x_i)\,\Delta x = ${sig(r, 6)}`}; exact ${m`\int_0^\pi \sin x\,dx = 2`}.` })]),
      el('div', {}, [el('h3', { class: 'panel-title', html: `Lebesgue: cut the range <span class="muted small">→ ${link('integration.html', 'Ex. 1')}</span>` }), lebesgue,
        el('p', { class: 'small muted', html: `${K} levels of equal thickness, each slab as wide as its preimage ${m`\{x : \sin x > t\}`} (the bar under the axis, for the top level): ${m`\sum \lambda\{f > t_k\}\,\Delta t = ${sig(c, 6)}`}.` })]),
      el('div', {}, [el('h3', { class: 'panel-title', html: `Ex. 2: an area with no formula <span class="muted small">→ ${link('normal.html', 'Normal CDF')}</span>` }), bell,
        el('p', { class: 'small muted', html: `The shaded area is ${m`\Phi(-1.5) = ${sig(Phi(x0), 8)}`}. Every z-test, p-value and confidence interval reads such an area, and no finite combination of elementary functions gives it (${link('liouville.html', 'Liouville')}).` })]),
    ]),
    legend([['bar', RIEMANN, 'Riemann: rectangles over the domain'], ['band', LEBESGUE, 'Lebesgue: slabs over the range, and their preimages'], ['line', REF, 'the function / the exact value']]),
    explain([
      `The two pictures compute the same number, 2, by adding the same area in a different order. Riemann asks, for each piece of the ${m`x`}-axis, how high the function is; Lebesgue asks, for each height, how much of the ${m`x`}-axis lies above it. Lebesgue's own image: counting coins by grouping them by value, rather than in the order they come out of the purse.`,
      `The right panel is the second exercise: the same kind of area, under ${m`\varphi(t) = e^{-t^2/2}/\sqrt{2\pi}`}, but now the exact value has no formula at all, so it can only be computed, and in the left tail it must be computed to full relative precision.`,
    ]),
  ]);
}

function language() {
  return el('div', { class: 'card' }, [
    el('h2', { text: 'How to read every plot' }),
    el('ul', {}, [
      el('li', { html: '<strong>Riemann</strong>: vertical rectangles and their curves, in one colour (teal-green).' }),
      el('li', { html: '<strong>Lebesgue</strong>: horizontal slabs, with their preimages marked on the x-axis, in another (orange).' }),
      el('li', { html: '<strong>Reference values</strong>: a solid line in the text colour. Errors are always against a reference, on logarithmic axes.' }),
      el('li', { html: `<strong>The methods for ${m`\Phi`}</strong> get six further colours, each with a text label and, where curves cross, a dash pattern.` }),
    ]),
    legend([['bar', RIEMANN, 'Riemann'], ['band', LEBESGUE, 'Lebesgue'], ['line', REF, 'reference']]),
    el('p', { class: 'small muted', text: 'Nothing depends on colour alone: every series has a text label. Every experiment shows its sizes and seed, and exports its numbers as CSV or JSON and its figures as SVG.' }),
  ]);
}

startPage({
  shell: hw06Shell('index.html'),
  sticky: STICKY,
  memory: MEMORY,
  render: () => [
    abstract({
      question: 'Two ways to measure an area — cut the domain (Riemann) or cut the range and measure the preimages (Lebesgue) — compared on functions from smooth to pathological; then the area every z-test needs, Φ(x), which has no formula and must be computed to full precision in its tails.',
      findings: [
        '<strong>Riemann vs Lebesgue</strong>: the same limit for every Riemann-integrable function, at different speeds — Riemann suffers where f is steep or jumps, Lebesgue where f is flat — and the real cost of Lebesgue is computing each preimage.',
        '<strong>Where they differ</strong>: only when Riemann’s integral does not exist (Dirichlet, a fat Cantor set) or is improper (sin x/x on [0, ∞)); and a computer cannot even see irrational numbers.',
        '<strong>Computing Φ</strong>: a series near 0 and a continued fraction in the tails give 7.6·10⁻¹⁵ relative accuracy everywhere, checked against 80-digit values and the NIST table; subtracting from 1 loses every digit below x = −8.3.',
        '<strong>Why no formula</strong>: Liouville’s theorem proves that no combination of elementary functions gives Φ; naming it erf adds knowledge, not digits.',
        '<strong>Where it matters</strong>: p-values at 5σ, the tables of lattice-crypto samplers (whose precision is a statistical distance and whose timing can leak), the noise of differential privacy, and Monte Carlo in ten dimensions all rest on the same tail of Φ.',
      ],
      scope: 'homework',
      sections: [['exercise', 'The exercise'], ['decisions', 'How these pages read it'], ['overview', 'The whole homework in one picture'], ['language', 'How to read every plot'], ['pages', 'The pages']],
    }),
    el('p', { class: 'notice', text: NOTICE }), anchor('exercise', exercise()), anchor('decisions', decisions()), anchor('overview', overview()), anchor('language', language()), anchor('pages', pageList(PAGES)),
  ],
});
