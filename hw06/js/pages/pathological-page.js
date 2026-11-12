/* pathological-page.js — where Riemann and Lebesgue part ways (note 02): Dirichlet
   with symbolic tags (and why every float is rational), Thomae in exact integer
   arithmetic, the fat Cantor set, sin x/x on [0, ∞), and the Cantor function.
   A theory card first, one panel per function, the three conclusions last.
   The sums for large N come from the worker; this file only draws. */

import { el, field } from '../../../assets/js/ui/dom.js';
import { startPage } from '../../../assets/js/ui/page.js';
import { labPanel, section, table } from '../../../assets/js/ui/lab.js';
import { plot, curve } from '../../../assets/js/ui/plot.js';
import { nice, sig, sup } from '../../../assets/js/ui/format.js';
import { m, M } from '../../../assets/js/ui/math.js';
import { show, onCommit } from '../../../assets/js/ui/dock.js';
import { dirichletSum, thomaePoints, fatCantorSteps, cantorFunction, cantorInverse } from '../core/pathological.js';
import { toFraction } from '../core/fparith.js';
import { FUNCTIONS } from '../core/functions.js';
import { RULES } from '../core/riemann.js';
import { AnalyticMeasure, layerCakeMidpoint } from '../core/lebesgue.js';
import { readInputs, dock, rejected } from './inputs.js';
import { RIEMANN, LEBESGUE, REF, MUTED, legend, figure, svgButton, evidenceHtml, getRun, pending, updatingFlag, abstract, anchor } from './widgets.js';
import { hw06Shell, STICKY, MEMORY } from './shell.js';

const html = (s) => el('span', { html: s });
const e2s = (x, d = 2) => (x === 0 ? '0' : x.toExponential(d));

/* ---------- this page's row in the dock: the number to take apart (P1) ---------- */

function readPage(state) {
  const raw = state.x ?? '0.1';
  const x = Number(raw);
  return { raw, x, error: Number.isFinite(x) ? null : `"${raw}" is not a finite number.` };
}

const OWN = {
  id: 'pathological', label: 'this page',
  build(apply, later) {
    const x = el('input', { type: 'text', class: 'num', 'aria-label': 'a number to write as an exact fraction', inputmode: 'decimal' });
    onCommit(x, () => apply({ x: x.value.trim() }), later);
    return { nodes: [el('div', { class: 'row' }, [field('P1: a number x', x)])], refresh(v) { show(x, v.raw); } };
  },
  summary: (v) => `x = ${v.raw}`,
  notes: ['<strong>x</strong>: any decimal number (or 1e-5 style). P1 shows the exact value of the double that stores it: always an integer over a power of two.'],
};

/* ---------- the theory card ---------- */

function theory() {
  const rows = [
    ['P1 Dirichlet', html(m`1_{\mathbb{Q}}`), '✗ (upper 1, lower 0)', '0', 'float tags give 1; irrational tags give 0'],
    ['P2 Thomae', html(m`1/q \text{ at } p/q`), '✓ = 0', '0', 'sums → 0, erratically, by the divisors of N'],
    ['P3 fat Cantor', html(m`1_S,\ \lambda(S) = \tfrac{1}{2}`), '✗ (upper → ½, lower 0)', '½', 'every tag sum → ½; only Darboux sums see the problem'],
    ['P4 sinc on [0, ∞)', html(m`\sin x / x`), '✓ improper = π/2', '✗ (∫|f| = ∞)', '∫₀ᵀ settles at π/2; ∫₀ᵀ|f| grows like (2/π) ln T'],
    ['P5 Cantor function', html(m`C(x)`), '✓ = ½', '½', 'continuous, increasing, yet flat on a set of measure 1'],
  ];
  return el('div', { class: 'card' }, [
    el('h2', { text: 'When do the two integrals disagree?' }),
    el('p', { html: `Lebesgue's criterion ${evidenceHtml('T')} decides it for a bounded function:` }),
    el('div', { html: M`f \text{ is Riemann integrable on } [a, b] \iff \lambda\{x : f \text{ is discontinuous at } x\} = 0` }),
    el('p', { class: 'small muted', html: `and then the Riemann and Lebesgue integrals are equal. So they can only disagree when f is discontinuous on a set of positive measure (Dirichlet: everywhere; P3: on ${m`S`}), or when the domain is unbounded and Riemann's integral is only an improper limit (P4).` }),
    table(['', 'f', 'Riemann', 'Lebesgue', 'what the numerics show'], rows, 'prose words'),
  ]);
}

/* ---------- P1 · Dirichlet ---------- */

function fractionRow(label, x) {
  const { num, exp2 } = toFraction(x);
  return [label, String(x), exp2 ? `${num} / 2${sup(exp2)}` : String(num)];
}

function p1(page) {
  const Ns = [10, 100, 1000, 10000];
  const sums = Ns.map((N) => [nice(N), String(dirichletSum(N, 'float')), String(dirichletSum(N, 'rational')), String(dirichletSum(N, 'irrational'))]);
  const fracs = [
    fractionRow('your x', page.x), fractionRow('0.1', 0.1), fractionRow('1/3', 1 / 3), fractionRow('√2', Math.SQRT2), fractionRow('π', Math.PI),
  ];
  return labPanel({
    hw: 'hw06', id: 'P1', title: 'P1 · Dirichlet: the computer cannot see irrationals', name: 'P1-dirichlet',
    question: `${m`1_{\mathbb{Q}}(x)`} is 1 on rationals and 0 on irrationals. What do its Riemann sums give, and what does a computer give?`,
    steps: [
      `sum ${m`1_{\mathbb{Q}}(\xi_i)/N`} with rational tags ${m`\xi_i = i/N`}, then with irrational tags ${m`\xi_i = (i - 1 + \sqrt{2})/N`}, kept symbolic;`,
      'then with ordinary floating-point tags i/N;',
      'and write some doubles as exact fractions.',
    ],
    view: () => ({
      answer: { text: `Rational tags give <strong>1</strong>, irrational tags <strong>0</strong>, at every N: the limit depends on the tags, so there is no Riemann integral. Floating-point tags always give <strong>1</strong>, because every double is a fraction.` },
      body: [
        el('div', { class: 'cols' }, [
          el('div', {}, [...section(1, 'Riemann sums', 'Symbolic tags carry their own rationality; float tags are numbers.'),
            table(['N', 'float tags', 'rational tags', 'irrational tags'], sums)]),
          el('div', {}, [...section(2, 'What a double really is', `${m`m \cdot 2^{e}`}: an integer over a power of two. Change x in the dock.`),
            table(['', 'typed', 'exact value stored'], fracs)]),
        ]),
        ...section(3, 'The Lebesgue integral is 0', `${evidenceHtml('T')} The range is ${m`\{0, 1\}`}, so ${m`\int 1_{\mathbb{Q}} = 1 \cdot \lambda(\mathbb{Q} \cap [0,1]) + 0 \cdot \lambda(\text{irrationals})`}. The rationals are countable, ${m`q_1, q_2, \ldots`}: cover ${m`q_k`} by an interval of length ${m`\varepsilon/2^{k}`}, and the whole of them has measure at most ${m`\varepsilon`}, for every ${m`\varepsilon > 0`}. So the integral is ${m`0`}.`),
      ],
      rows: Ns.map((N, i) => ({ N, float: sums[i][1], rational: sums[i][2], irrational: sums[i][3] })),
      summary: { x: page.x, fraction: String(toFraction(page.x).num) + '/2^' + toFraction(page.x).exp2 },
    }),
    why: 'no measurement of finite precision can tell a rational from an irrational. Floats, like physical measurements, see functions only up to sets of measure zero, which is exactly Lebesgue’s point of view.',
    notes: ['The irrational tag (i − 1 + √2)/N is inside the cell [i/N, (i+1)/N] because 1 < √2 < 2. It is never turned into a double: the code only asks “is the √2 coefficient zero?”.'],
  });
}

/* ---------- P2 · Thomae ---------- */

const THOMAE_NS = [10, 20, 50, 97, 100, 128, 200, 500, 1000, 1009, 1024, 2000, 4096, 5000, 8192, 9973, 10000];
const THOMAE_TABLE = [10, 97, 100, 128, 1000, 1009, 1024];

function p2(redraw) {
  const spec = { kind: 'thomae', args: { Ns: THOMAE_NS } };
  const got = getRun(spec, redraw, 'P2');
  const graph = plot({
    x: { min: 0, max: 1, title: 'x' }, y: { min: 0, max: 1.05, title: 'f(x)' }, width: 420, height: 280,
    layers: [{ type: 'points', points: thomaePoints(30), color: RIEMANN, r: 2.4, label: 'f(p/q) = 1/q' }],
    label: 'Thomae function: a dot of height one over q above every fraction p over q with q up to 30',
  });
  return labPanel({
    hw: 'hw06', id: 'P2', title: 'P2 · Thomae: integrable despite a dense set of jumps', name: 'P2-thomae',
    question: `${m`f(p/q) = 1/q`} in lowest terms, 0 at irrationals: discontinuous at every rational. Do its Riemann sums still converge?`,
    steps: [
      `left-tag sum with ${m`i/N`}: in lowest terms ${m`i/N = (i/g)/(N/g)`}, ${m`g = \operatorname{gcd}(i, N)`}, so ${m`S_N = \frac{1}{N^2}\sum_{i=1}^{N} \operatorname{gcd}(i, N)`}: integers only;`,
      `upper Darboux sum: each cell's sup is ${m`1/q`} for the smallest ${m`q`} with a fraction ${m`p/q`} in the cell;`,
      'both for N up to 10⁴, primes and powers of two included.',
    ],
    flag: updatingFlag(got), waiting: got.result ? null : pending(got, spec, redraw),
    view: () => {
      const res = got.result, at = (N) => res.find((r) => r.N === N);
      const ser = (k) => res.map((r) => [r.N, r[k]]);
      const sums = plot({
        x: { log: true, min: 10, max: 1e4, title: 'N' }, y: { log: true, title: 'sum' }, width: 420, height: 280,
        layers: [
          { type: 'line', points: ser('upper'), color: RIEMANN, label: 'upper Darboux', end: 'upper' },
          { type: 'points', points: ser('left'), color: LEBESGUE, r: 3, label: 'left tags' },
          { type: 'points', points: ser('mid'), color: LEBESGUE, r: 3, hollow: true, label: 'mid tags' },
        ],
        label: 'Thomae sums against N: upper Darboux sums and left and mid tag sums, all falling towards zero',
      });
      const rows = THOMAE_TABLE.map((N) => { const r = at(N); return [`${nice(N)}${[97, 1009].includes(N) ? ' (prime)' : [128, 1024].includes(N) ? ' (2ᵏ)' : ''}`, r.left.toFixed(5), r.mid.toFixed(5), r.upper.toFixed(5)]; });
      return {
        answer: { text: `Every sum goes to <strong>0</strong> (upper Darboux ${at(10000).upper.toFixed(4)} at N = 10⁴): Thomae is Riemann integrable with integral 0, like its Lebesgue integral. The left sums jump with the divisors of N: ${at(1000).left.toFixed(4)} at N = 1000, ${at(1009).left.toFixed(4)} at the prime 1009.` },
        body: [
          ...section(1, 'The function, and its sums', 'Left: the dots above fractions with q ≤ 30. Right: the sums against N; the scattered dots are the tag sums, steered by the arithmetic of N.'),
          el('div', { class: 'cols' }, [graph, sums]),
          legend([['dot', RIEMANN, 'f(p/q) = 1/q'], ['line', RIEMANN, 'upper Darboux sum'], ['dot', LEBESGUE, 'left-tag sum (hollow: mid tags)']]),
          ...section(2, 'Exact values', 'Integer arithmetic, so these digits are exact.'),
          table(['N', 'left tags', 'mid tags', 'upper Darboux'], rows),
        ],
        rows: res,
        summary: { rows: res },
      };
    },
    why: `"discontinuous at a dense set" does not stop Riemann: the jumps that matter are few (only finitely many fractions have ${m`1/q > \varepsilon`}), and the discontinuities, the rationals, are a null set. Lebesgue's criterion again.`,
    notes: [`${m`\sum_{i \le N} \operatorname{gcd}(i, N)`} is Pillai's arithmetical function: number theory inside a Riemann sum. For a prime it is ${m`2N - 1`}, the minimum, so the sum is smallest at primes.`],
  });
}

/* ---------- P3 · fat Cantor ---------- */

function p3(inputs, redraw) {
  const Ns = [10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000, 100000];
  const spec = { kind: 'fatCantor', args: { Ns, seed: inputs.seed } };
  const got = getRun(spec, redraw, 'P3');
  const steps = fatCantorSteps(6), layers = [];
  steps.forEach((pieces, n) => {
    const y0 = 6 - n + 0.15, y1 = 6 - n + 0.85;   // step 0 at the top
    for (const [a, b] of pieces) layers.push({ type: 'band', band: [[a, y0, y1], [b, y0, y1]], color: RIEMANN },
      { type: 'line', points: [[a, y0], [a, y1], [b, y1], [b, y0], [a, y0]], color: RIEMANN, thin: true, hover: false });
  });
  const construction = plot({
    x: { min: 0, max: 1, title: 'x' }, y: { min: 0, max: 7, title: 'step', ticks: [0.5, 2.5, 4.5, 6.5], format: (v) => String(6 - Math.floor(v)) },
    width: 420, height: 260, layers, label: 'the first six steps of the fat Cantor construction, each removing a middle interval of length four to the minus n from every piece',
  });
  return labPanel({
    hw: 'hw06', id: 'P3', title: 'P3 · A fat Cantor set: nowhere dense, yet half of everything', name: `P3-fatcantor-seed${inputs.seed}`,
    question: `${m`S`} contains no interval, yet ${m`\lambda(S) = \tfrac{1}{2}`}. What do Riemann sums of ${m`1_S`} give?`,
    steps: [
      `build ${m`S`}: at step n remove the middle ${m`4^{-n}`} of each piece (in all, ${m`\sum 2^{n-1} 4^{-n} = \tfrac{1}{2}`} is removed);`,
      `sum ${m`1_S(\xi_i)/N`} with left, mid and random tags (seed ${inputs.seed});`,
      'and the Darboux sums: lower (inf in each cell) and upper (sup in each cell).',
    ],
    flag: updatingFlag(got), waiting: got.result ? null : pending(got, spec, redraw),
    view: () => {
      const res = got.result, last = res.at(-1);
      const ser = (k) => res.map((r) => [r.N, r[k]]);
      const sums = plot({
        x: { log: true, min: 10, max: 1e5, title: 'N' }, y: { min: -0.05, max: 1.05, title: 'sum' }, width: 420, height: 260,
        layers: [
          { type: 'hline', at: 0.5, color: REF, dash: false },
          { type: 'line', points: ser('upper'), color: RIEMANN, label: 'upper Darboux', end: 'upper' },
          { type: 'line', points: ser('lower'), color: RIEMANN, dash: '4 3', label: 'lower Darboux', end: 'lower' },
          { type: 'points', points: ser('left'), color: LEBESGUE, r: 3, label: 'left tags' },
          { type: 'points', points: ser('random'), color: LEBESGUE, r: 3, hollow: true, label: 'random tags' },
        ],
        label: 'fat Cantor sums against N: tag sums near one half, upper Darboux sums falling to one half, lower sums at zero',
      });
      return {
        answer: { text: `Left, mid and random tags all give about <strong>½</strong> (${last.left.toFixed(4)}, ${last.mid.toFixed(4)}, ${last.random.toFixed(4)} at N = 10⁵): the Lebesgue value. But the lower sums stay at <strong>0</strong> while the upper ones fall to ½: not Riemann integrable.`, ok: false },
        body: [
          ...section(1, 'The set, and the sums', 'Left: the construction, step 0 at the top; the bars are what is kept. Right: the sums against N; the plain line at ½ is λ(S).'),
          el('div', { class: 'cols' }, [construction, sums]),
          legend([['line', RIEMANN, 'Darboux sums (dashed: lower)'], ['dot', LEBESGUE, 'tag sums (hollow: random)'], ['line', REF, 'λ(S) = ½']]),
          ...section(2, 'Values', 'Upper sums are exact: a cell counts when it meets S.'),
          table(['N', 'left', 'mid', 'random', 'lower', 'upper'], res.filter((r) => [100, 1000, 10000, 100000].includes(r.N)).map((r) => [nice(r.N), r.left.toFixed(4), r.mid.toFixed(4), r.random.toFixed(4), '0', r.upper.toFixed(4)])),
        ],
        rows: res,
        summary: { seed: inputs.seed, rows: res },
      };
    },
    why: 'Riemann integrability is a worst case over all tags; numerics only ever try typical tags, and typical tags see the measure. The lower sum, with every tag picked in a removed gap, is the adversary that reveals the difference.',
    notes: ['Every cell of positive length contains a removed gap (S has empty interior), so its infimum is 0: every lower sum is exactly 0. A cell counts in the upper sum when it meets S; their total length tends to λ(S) = ½.'],
  });
}

/* ---------- P4 · sin x / x on [0, ∞) ---------- */

function p4(redraw) {
  const Ts = Array.from({ length: 81 }, (_, i) => 10 ** (0.5 + i * 0.045));   // 3 … 10⁴
  const spec = { kind: 'p4', args: { Ts } };
  const got = getRun(spec, redraw, 'P4');
  return labPanel({
    hw: 'hw06', id: 'P4', title: 'P4 · sin x / x on [0, ∞): Riemann wins, Lebesgue loses', name: 'P4-sinc',
    question: `Does ${m`\int_0^\infty \frac{\sin x}{x}\,dx`} exist?`,
    steps: [
      `compute ${m`I(T) = \int_0^T \frac{\sin x}{x}\,dx`} and ${m`A(T) = \int_0^T \frac{|\sin x|}{x}\,dx`} for ${m`T`} up to ${m`10^4`} (Simpson on each period);`,
      `compare ${m`I(T)`} with ${m`\pi/2`} and ${m`A(T)`} with ${m`\tfrac{2}{\pi} \ln T`}.`,
    ],
    flag: updatingFlag(got), waiting: got.result ? null : pending(got, spec, redraw),
    view: () => {
      const res = got.result, last = res.at(-1), c = last[2] - (2 / Math.PI) * Math.log(last[0]);
      const left = plot({
        x: { log: true, min: 3, max: 1e4, title: 'T' }, y: { min: 1.3, max: 1.9, title: 'I(T)' }, width: 420, height: 260,
        layers: [{ type: 'hline', at: Math.PI / 2, color: REF, dash: false, text: 'π/2', anchor: 'start' }, { type: 'line', points: res.map((r) => [r[0], r[1]]), color: RIEMANN, label: 'I(T)' }],
        label: 'the integral of sin x over x from 0 to T, settling at pi over 2',
      });
      const right = plot({
        x: { log: true, min: 3, max: 1e4, title: 'T' }, y: { min: 0, title: 'A(T)' }, width: 420, height: 260,
        layers: [
          { type: 'line', points: res.map((r) => [r[0], (2 / Math.PI) * Math.log(r[0]) + c]), color: REF, dash: '4 3', label: '(2/π) ln T + c' },
          { type: 'line', points: res.map((r) => [r[0], r[2]]), color: LEBESGUE, label: 'A(T)' },
        ],
        label: 'the integral of the absolute value of sin x over x from 0 to T, growing like a straight line on a log axis',
      });
      return {
        answer: { text: `<strong>I(T) → π/2</strong> (${sig(last[1], 7)} at T = 10⁴): the improper Riemann integral exists. <strong>A(T) grows without bound</strong> (${sig(last[2], 4)} and rising like (2/π) ln T): the Lebesgue integral does not exist.`, ok: false },
        body: [
          ...section(1, 'The two partial integrals', `Left: settles. Right: a straight line on a log axis, i.e. logarithmic growth (dashed: ${m`\tfrac{2}{\pi}\ln T + c`}, ${m`c`} fitted at ${m`T = 10^4`}).`),
          el('div', { class: 'cols' }, [left, right]),
        ],
        rows: res.map(([T, I, A]) => ({ T, I, A })),
        summary: { T: last[0], I: last[1], A: last[2] },
      };
    },
    why: 'Lebesgue integrability is absolute: ∫|f| < ∞. A conditionally convergent integral is like a conditionally convergent series: its value depends on the order of summation, and Lebesgue’s definition does not fix an order.',
    notes: ['Each period [kπ, (k+1)π] contributes about 2/(kπ) to A(T); the sum of 2/(kπ) is a harmonic series, (2/π) ln T plus a constant. To I(T) the same pieces contribute with alternating signs, and an alternating series with shrinking terms converges.'],
  });
}

/* ---------- P5 · the Cantor function ---------- */

function p5() {
  const fn = FUNCTIONS.P5;
  const graph = plot({
    x: { min: 0, max: 1, title: 'x' }, y: { min: 0, max: 1, title: 'C(x)' }, width: 420, height: 260,
    layers: [{ type: 'line', points: curve(cantorFunction, 0, 1, 1200), color: RIEMANN, label: 'C(x)' }],
    label: 'the Cantor function, a staircase rising from 0 to 1 that is flat on every removed middle third',
  });
  const dist = plot({
    x: { min: 0, max: 1, title: 't' }, y: { min: 0, max: 1, title: 'λ{C > t}' }, width: 420, height: 260,
    layers: [{ type: 'line', points: curve((t) => 1 - cantorInverse(t), 0, 0.9999, 1200), color: LEBESGUE, label: 'λ{C > t}' }],
    label: 'the distribution function of the Cantor function: the measure of the set where it exceeds each level',
  });
  const mid = RULES.midpoint.run(fn, 1000).value, cake = layerCakeMidpoint(fn, new AnalyticMeasure(fn), 1000).value;
  return labPanel({
    hw: 'hw06', id: 'P5', title: 'P5 · The Cantor function: continuous, increasing, flat almost everywhere', name: 'P5-cantor',
    question: `${m`C`} rises from 0 to 1 but is constant on every removed third (a set of measure 1). What is ${m`\int_0^1 C`}?`,
    steps: [
      `${m`C(x)`}: read the ternary digits of x, turn 0/2 into binary 0/1, stop at the first 1;`,
      `integrate it by the midpoint rule (N = 1000) and by the layer cake (K = 1000, exact measure ${m`\lambda\{C > t\} = 1 - C^{-1}(t)`}).`,
    ],
    view: () => ({
      answer: { text: `Both give <strong>½</strong> (midpoint ${sig(mid, 12)}, layer cake ${sig(cake, 6)}), as the symmetry ${m`C(1 - x) = 1 - C(x)`} demands. Here the two integrals agree; the strangeness is elsewhere: ${m`C' = 0`} almost everywhere, yet ${m`C`} climbs from 0 to 1.` },
      body: [
        ...section(1, 'C and its distribution function', 'Left: the staircase. Right: the same curve mirrored, how much of [0, 1] lies above each level.'),
        el('div', { class: 'cols' }, [graph, dist]),
      ],
      summary: { midpoint: mid, layercake: cake },
    }),
    why: `the fundamental theorem of calculus fails for ${m`C`}: ${m`\int_0^1 C'(x)\,dx = 0 \ne C(1) - C(0) = 1`}. In probability, ${m`C`} is the CDF of a distribution with no density and no atoms: a singular distribution.`,
    notes: ['The layer cake is slow here (E2 on the first page): λ{C > t} has a jump at every dyadic level t, because C is flat at that height over a whole removed third.'],
  });
}

/* ---------- the conclusion ---------- */

function conclusion() {
  return el('div', { class: 'card' }, [
    el('h2', { text: 'What “the two approaches behave differently” means' }),
    el('ol', {}, [
      el('li', { html: `<strong>Different answers</strong> only when Riemann's integral does not exist (Dirichlet, the fat Cantor set) or is only an improper limit (sin x/x on [0, ∞)). ${evidenceHtml('T')}` }),
      el('li', { html: `<strong>Same answers, different difficulty</strong> for every Riemann-integrable function: the rates and costs of the first page. ${evidenceHtml('M')}` }),
      el('li', { html: `<strong>Floating point blurs the line</strong>: a computer samples a null set, the floats. Numerical Riemann sums behave like “Lebesgue on typical points” (P3), and break only for functions defined by exact arithmetic properties (P1). ${evidenceHtml('O')}` }),
    ]),
  ]);
}

startPage({
  shell: hw06Shell('pathological.html'),
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
        question: 'When do the Riemann and Lebesgue integrals give different answers, and what do numerical sums actually see?',
        findings: [
          '<strong>Only in two cases</strong>: when Riemann’s integral does not exist (Dirichlet, a fat Cantor set) or is only an improper limit (sin x/x on [0, ∞)). Otherwise they are equal (Lebesgue’s criterion).',
          '<strong>Dirichlet</strong>: rational tags give 1, irrational tags 0, so there is no Riemann integral; a computer always gives 1, because every double is a fraction (0.1 is 3602879701896397/2⁵⁵).',
          '<strong>Fat Cantor set</strong>: every numerical sum lands on ½, the Lebesgue value; only the Darboux sums (lower 0, upper → ½) show that Riemann fails.',
          '<strong>Thomae</strong> is integrable although it jumps at every rational (all sums → 0); <strong>sin x/x</strong> converges to π/2 while ∫|f| grows like (2/π) ln T; the <strong>Cantor function</strong> integrates to ½ although its derivative is 0 almost everywhere.',
        ],
        sections: [['theory', 'When do the two integrals disagree?'], ['P1', 'P1 · Dirichlet'], ['P2', 'P2 · Thomae'], ['P3', 'P3 · fat Cantor set'], ['P4', 'P4 · sin x / x on [0, ∞)'], ['P5', 'P5 · Cantor function'], ['conclusion', 'What it means']],
      }),
      anchor('theory', theory()), anchor('P1', p1(page)), anchor('P2', p2(redraw)), anchor('P3', p3(inputs, redraw)), anchor('P4', p4(redraw)), anchor('P5', p5()), anchor('conclusion', conclusion()),
    ];
  },
});
