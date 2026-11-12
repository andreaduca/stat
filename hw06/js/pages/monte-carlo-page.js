/* monte-carlo-page.js — integration by sampling (note 06 §4): Monte Carlo and
   quasi-Monte Carlo against the grids of Ex. 1, the d-ball where grids die and Monte
   Carlo does not, and a rare event, Q(5), by plain and by importance sampling.
   [[Monte Carlo integration and quasi-Monte Carlo]]. */

import { el, field } from '../../../assets/js/ui/dom.js';
import { startPage } from '../../../assets/js/ui/page.js';
import { labPanel, section, table } from '../../../assets/js/ui/lab.js';
import { plot } from '../../../assets/js/ui/plot.js';
import { nice, sig } from '../../../assets/js/ui/format.js';
import { m, M } from '../../../assets/js/ui/math.js';
import { show, onCommit, numberOr } from '../../../assets/js/ui/dock.js';
import { Q } from '../core/normal.js';
import { isRelVarExact } from '../core/montecarlo.js';
import { readInputs, dock, rejected } from './inputs.js';
import { RIEMANN, LEBESGUE, REF, MUTED, legend, figure, evidenceHtml, getRun, pending, updatingFlag, abstract, anchor } from './widgets.js';
import { hw06Shell, STICKY, MEMORY } from './shell.js';

const e2s = (x, d = 2) => (x === 0 ? '0' : !Number.isFinite(x) ? String(x) : x.toExponential(d));
const CHOICES = { f1: 'f1 · sin x on [0, π]', f7: 'f7 · sin x / x on [0, π]', P3: 'P3 · fat Cantor indicator' };
const NS = [10, 30, 100, 300, 1000, 3000, 10000, 30000, 100000, 300000, 1000000];

/* ---------- this page's row in the dock ---------- */

function readPage(state) {
  const g = CHOICES[state.g] ? state.g : 'f1';
  const Nball = Math.round(numberOr(state.Nball, 100000)), Nrare = Math.round(numberOr(state.Nrare, 1000000));
  let error = null;
  if (!(Nball >= 1000 && Nball <= 2000000)) error = `the d-ball sample must be between 1 000 and 2 000 000 points (got ${Nball}).`;
  else if (!(Nrare >= 1000 && Nrare <= 5000000)) error = `the rare-event sample must be between 1 000 and 5 000 000 (got ${Nrare}).`;
  return { g, Nball, Nrare, error };
}

const OWN = {
  id: 'mc', label: 'this page',
  build(apply, later) {
    const g = el('select', { 'aria-label': 'function for E15a', onchange: (e) => apply({ g: e.target.value }) }, Object.entries(CHOICES).map(([v, t]) => el('option', { value: v, text: t })));
    const num = (label, key) => { const i = el('input', { type: 'number', class: 'num', 'aria-label': label }); onCommit(i, () => apply({ [key]: i.value }), later); return i; };
    const Nb = num('points for the d-ball', 'Nball'), Nr = num('samples for the rare event', 'Nrare');
    return {
      nodes: [el('div', { class: 'row' }, [field('E15a: function', g), el('span', { class: 'vrule' }), field('E15b: points N', Nb), field('E15c: samples N', Nr)])],
      refresh(v) { show(g, v.g); show(Nb, v.Nball); show(Nr, v.Nrare); },
    };
  },
  summary: (v) => `${v.g} · ball N = ${nice(v.Nball)} · rare N = ${nice(v.Nrare)}`,
  notes: ['<strong>function</strong>: the integrand of E15a. <strong>N</strong>: the sample sizes of E15b and E15c; all draws come from the seed.'],
};

/* ---------- theory ---------- */

function theory() {
  return el('div', { class: 'card' }, [
    el('h2', { text: 'Integration by sampling' }),
    el('div', { class: 'cols' }, [
      el('div', {}, [
        el('div', { html: M`\int_a^b f \approx (b-a)\,\frac{1}{N}\sum_{i=1}^{N} f(U_i), \qquad \mathrm{SE} = \frac{(b-a)\,s}{\sqrt{N}}` }),
        el('p', { class: 'small muted', html: `${evidenceHtml('T')} Unbiased, with an error ${m`\propto 1/\sqrt{N}`} whatever the smoothness of ${m`f`} and whatever the dimension. It is Lebesgue's idea with random coins: the sorted values ${m`f(U_i)`} are a sample of the distribution of ${m`f`}, and their layer cake is the same average (first page, E4).` }),
      ]),
      el('div', {}, [
        el('div', { html: M`\text{QMC: } U_i \to v_i, \quad v_1, v_2, v_3, \ldots = \tfrac{1}{2}, \tfrac{1}{4}, \tfrac{3}{4}, \tfrac{1}{8}, \ldots` }),
        el('p', { class: 'small muted', html: `Quasi-Monte Carlo replaces random points by evenly spread ones (van der Corput: binary digits mirrored). For ${m`f`} of bounded variation the error is about ${m`\log N / N`} (Koksma–Hlawka ${evidenceHtml('S')}), with no error estimate attached.` }),
      ]),
    ]),
  ]);
}

/* ---------- E15a · MC and QMC against the grids ---------- */

function compare(page, inputs, redraw) {
  const spec = { kind: 'mcCompare', args: { fid: page.g, Ns: NS, seed: inputs.seed } };
  const got = getRun(spec, redraw, 'E15a');
  return labPanel({
    hw: 'hw06', id: 'E15a', title: 'E15a · Sampling against grids, in one dimension', name: `E15a-${page.g}-seed${inputs.seed}`,
    question: `On ${CHOICES[page.g]}, how do Monte Carlo and quasi-Monte Carlo compare with the midpoint rule and Simpson?`,
    steps: [`for N from 10 to 10⁶: plain Monte Carlo (seed ${inputs.seed}), van der Corput points, midpoint, Simpson;`, 'plot each error against N, with the Monte Carlo standard error.'],
    flag: updatingFlag(got), waiting: got.result ? null : pending(got, spec, redraw),
    view: () => {
      const res = got.result, ex = res[0].exact, err = (k) => res.filter((r) => r[k] !== null).map((r) => [r.N, Math.max(1e-17, Math.abs(r[k] - ex))]);
      const chart = plot({
        x: { log: true, min: 10, max: 1e6, title: 'N (evaluations)' }, y: { log: true, min: 1e-17, max: 10, title: '|error|' }, width: 640, height: 300,
        layers: [
          { type: 'line', points: res.map((r) => [r.N, r.mcSE]), color: LEBESGUE, dash: '2 3', label: 'MC standard error', end: 'SE' },
          { type: 'points', points: err('mc'), color: LEBESGUE, r: 3.5, label: 'Monte Carlo' },
          { type: 'line', points: err('qmc'), color: LEBESGUE, label: 'quasi-MC', end: 'QMC' },
          { type: 'line', points: err('mid'), color: RIEMANN, label: 'midpoint', end: 'midpoint' },
          ...(err('simpson').length ? [{ type: 'line', points: err('simpson'), color: RIEMANN, dash: '6 3', label: 'Simpson', end: 'Simpson' }] : []),
        ],
        label: 'error against N for Monte Carlo, quasi-Monte Carlo, midpoint and Simpson',
      });
      const last = res.at(-1), z = (last.mc - ex) / last.mcSE;
      const text = page.g === 'P3'
        ? `On the fat Cantor indicator no grid rule is reliable (not Riemann integrable), and Monte Carlo is honest: at N = 10⁶ it gives <strong>${sig(last.mc, 6)}</strong> ± ${e2s(last.mcSE, 1)} (z = ${z.toFixed(2)}), with an error bar that means what it says.`
        : `In one dimension the grids win easily: at N = 10⁶ Simpson is off by ${e2s(Math.abs(last.simpson - ex), 1)}, the midpoint rule by ${e2s(Math.abs(last.mid - ex), 1)}, quasi-MC by ${e2s(Math.abs(last.qmc - ex), 1)}, plain Monte Carlo by <strong>${e2s(Math.abs(last.mc - ex), 1)}</strong> (z = ${z.toFixed(2)} against its SE).`;
      return {
        answer: { text, ok: Math.abs(z) <= 3 },
        body: [figure(chart), legend([['dot', LEBESGUE, 'Monte Carlo (dashed: its SE)'], ['line', LEBESGUE, 'quasi-MC'], ['line', RIEMANN, 'midpoint (dashed: Simpson)']])],
        rows: res,
        summary: { g: page.g, seed: inputs.seed, rows: res },
      };
    },
    why: 'Monte Carlo’s 1/√N looks hopeless next to Simpson’s N⁻⁴ — in one dimension. It never depends on smoothness, and never on dimension (E15b).',
    notes: ['Errors below 10⁻¹⁷ (exact to the last bit) are drawn at 10⁻¹⁷.'],
  });
}

/* ---------- E15b · the d-ball ---------- */

function ball(page, inputs, redraw) {
  const spec = { kind: 'ball', args: { N: page.Nball, seed: inputs.seed } };
  const got = getRun(spec, redraw, 'E15b');
  const k = 10;
  return labPanel({
    hw: 'hw06', id: 'E15b', title: 'E15b · Ten dimensions: where grids die', name: `E15b-N${page.Nball}-seed${inputs.seed}`,
    question: 'What is the volume of the unit ball in d dimensions, and what does it cost to find out?',
    steps: [`throw ${nice(page.Nball)} random points into the cube ${m`[-1, 1]^d`} (seed ${inputs.seed}); volume ≈ ${m`2^d`} × the fraction inside;`, `compare with ${m`\pi^{d/2}/\Gamma(d/2 + 1)`};`, `a grid with ${k} points per axis would need ${m`${k}^d`} evaluations.`],
    flag: updatingFlag(got), waiting: got.result ? null : pending(got, spec, redraw),
    view: () => {
      const res = got.result;
      const rel = plot({
        x: { min: 1.5, max: 10.5, title: 'dimension d', ticks: [2, 4, 6, 8, 10] }, y: { log: true, min: 1e-5, max: 1, title: 'relative error' }, width: 420, height: 260,
        layers: [
          { type: 'line', points: res.map((r) => [r.d, r.se / r.exact]), color: LEBESGUE, dash: '2 3', label: 'relative SE', end: 'SE' },
          { type: 'points', points: res.map((r) => [r.d, Math.max(1e-5, Math.abs(r.value - r.exact) / r.exact)]), color: LEBESGUE, r: 3.5, label: 'Monte Carlo' },
        ],
        label: 'relative error of the Monte Carlo ball volume against dimension',
      });
      const cost = plot({
        x: { min: 1.5, max: 10.5, title: 'dimension d', ticks: [2, 4, 6, 8, 10] }, y: { log: true, min: 10, max: 1e11, title: 'evaluations' }, width: 420, height: 260,
        layers: [
          { type: 'line', points: res.map((r) => [r.d, k ** r.d]), color: RIEMANN, label: `grid, ${k} per axis`, end: 'grid' },
          { type: 'line', points: res.map((r) => [r.d, page.Nball]), color: LEBESGUE, label: 'Monte Carlo', end: 'MC' },
        ],
        label: 'cost against dimension: a grid grows exponentially, Monte Carlo stays fixed',
      });
      const r10 = res.find((r) => r.d === 10), r5 = res.find((r) => r.d === 5);
      return {
        answer: { text: `With the same ${nice(page.Nball)} points, the 5-ball comes out <strong>${sig(r5.value, 4)} ± ${sig(r5.se, 2)}</strong> (exact ${sig(r5.exact, 6)}) and the 10-ball ${sig(r10.value, 4)} ± ${sig(r10.se, 2)} (exact ${sig(r10.exact, 5)}). A grid as coarse as 10 points per axis would need <strong>10¹⁰</strong> evaluations in 10 dimensions.` },
        body: [
          el('div', { class: 'cols' }, [
            el('div', {}, [...section(1, 'Accuracy', 'Grows slowly with d: the ball fills less and less of the cube (0.25 % at d = 10).'), rel]),
            el('div', {}, [...section(2, 'Cost', 'Exponential for a grid, fixed for Monte Carlo.'), cost]),
          ]),
          table(['d', 'Monte Carlo', '± SE', 'exact', 'z'], res.map((r) => [String(r.d), sig(r.value, 6), sig(r.se, 2), sig(r.exact, 7), ((r.value - r.exact) / r.se).toFixed(2)])),
        ],
        rows: res,
        summary: { N: page.Nball, seed: inputs.seed, rows: res },
      };
    },
    why: 'every risk model, option price and Bayesian posterior is an integral in many dimensions; there, sampling the distribution of values — Lebesgue’s view — is the only method that scales.',
    notes: ['Grid rules of order p have error N^(−p/d) in d dimensions: the curse of dimensionality. Monte Carlo keeps 1/√N.'],
  });
}

/* ---------- E15c · a rare event ---------- */

function rare(page, inputs, redraw) {
  const spec = { kind: 'rare', args: { N: page.Nrare, seed: inputs.seed } };
  const got = getRun(spec, redraw, 'E15c');
  const q5 = Q(5), rv = isRelVarExact(5, Q);
  return labPanel({
    hw: 'hw06', id: 'E15c', title: 'E15c · A one-in-three-million event', name: `E15c-N${page.Nrare}-seed${inputs.seed}`,
    question: `Can sampling estimate ${m`Q(5) = P(Z > 5) = ${e2s(q5, 4)}`}, the 5σ tail?`,
    steps: [
      `plain: draw ${nice(page.Nrare)} standard normals and count those above 5;`,
      `importance sampling: draw from ${m`N(5, 1)`}, where the event is common, and weight each hit by ${m`\varphi(x)/\varphi(x-5) = e^{-5x + 12.5}`};`,
      'compare the two estimates and their standard errors.',
    ],
    flag: updatingFlag(got), waiting: got.result ? null : pending(got, spec, redraw),
    view: () => {
      const r = got.result;
      const Ns = Array.from({ length: 60 }, (_, i) => 10 ** (1 + i * 0.15));
      const chart = plot({
        x: { log: true, min: 10, max: 1e10, title: 'samples N' }, y: { log: true, min: 1e-4, max: 1e4, title: 'relative SE' }, width: 640, height: 260,
        layers: [
          { type: 'hline', at: 0.1, color: MUTED, text: '10 %', anchor: 'start' },
          { type: 'line', points: Ns.map((n) => [n, Math.sqrt((1 - q5) / (n * q5))]), color: RIEMANN, label: 'plain sampling', end: 'plain' },
          { type: 'line', points: Ns.map((n) => [n, Math.sqrt(rv / n)]), color: LEBESGUE, label: 'importance sampling', end: 'importance' },
        ],
        label: 'relative standard error against sample size for plain and importance sampling of the five sigma tail',
      });
      return {
        answer: { text: `Plain sampling saw <strong>${r.plain.hits}</strong> event${r.plain.hits === 1 ? '' : 's'} in ${nice(r.N)} draws (estimate ${e2s(r.plain.value, 2)}); importance sampling gives <strong>${e2s(r.is.value, 4)}</strong> ± ${e2s(r.is.se, 1)} (true ${e2s(q5, 4)}). For 10 % accuracy plain sampling needs about ${e2s(100 / q5, 1)} draws, importance sampling about ${Math.ceil(100 * rv)}.` },
        body: [
          figure(chart),
          table(['', 'estimate', 'SE', 'relative variance per sample'], [
            ['plain', e2s(r.plain.value, 3), e2s(r.plain.se, 1), e2s((1 - q5) / q5, 2)],
            ['importance', e2s(r.is.value, 4), e2s(r.is.se, 1), `${sig(r.is.relVar, 4)} (exact ${sig(rv, 4)})`],
            ['true (M7)', e2s(q5, 6), '', ''],
          ]),
        ],
        rows: [{ method: 'plain', ...r.plain }, { method: 'importance', ...r.is }],
        summary: { N: r.N, seed: inputs.seed, plain: r.plain, is: r.is, exactRelVar: rv },
      };
    },
    why: 'tail probabilities — p-values, failure rates, how many side-channel traces an attack needs — are rare events; sampling them blindly is hopeless, sampling where they happen and reweighting is exact in expectation and cheap.',
    notes: [`The exact relative variance comes from completing the square: ${m`E[w^2 1\{X > 5\}] = e^{25} Q(10)`}, so it is ${m`e^{25}Q(10)/Q(5)^2 - 1 \approx 5.68`} — itself a far-tail Φ computation.`],
  });
}

startPage({
  shell: hw06Shell('monte-carlo.html'),
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
        question: 'Monte Carlo integrates by sampling the values of f — Lebesgue’s idea with random coins. When does it beat a grid, and how does it handle an event of probability 3·10⁻⁷?',
        findings: [
          '<strong>In one dimension grids win</strong>: at 10⁶ points Simpson is exact to rounding, Monte Carlo off by about 10⁻³ (E15a). But on the fat Cantor set, where no grid is reliable, Monte Carlo still gives ½ with an honest error bar.',
          '<strong>In ten dimensions grids die</strong>: 10 points per axis already cost 10¹⁰ evaluations; 10⁵ random points give the volume of the 10-ball to a few per cent (E15b).',
          '<strong>Rare events need importance sampling</strong>: Q(5) = 2.9·10⁻⁷ to 10 % takes about 3·10⁸ plain draws but only about 570 drawn from N(5, 1) and reweighted (E15c).',
        ],
        sections: [['theory', 'Integration by sampling'], ['E15a', 'E15a · against grids'], ['E15b', 'E15b · the d-ball'], ['E15c', 'E15c · a rare event']],
      }),
      anchor('theory', theory()), anchor('E15a', compare(page, inputs, redraw)), anchor('E15b', ball(page, inputs, redraw)), anchor('E15c', rare(page, inputs, redraw)),
    ];
  },
});
