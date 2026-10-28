/* model-page.js — the Model & paths page (E1): the step model in use, the
   trajectory explorer (up to 50 attackers drawn as Sₖ, Sₖ/k and Sₖ/√k with
   their envelopes and the LLN band), the first 50 systems revealed one step at
   a time, and the same random bits read under both models. The paths are the
   first attackers of the run every other page uses (same seed, same stream),
   simulated here directly: 50 × 10⁴ steps take milliseconds. */

import { el, explain, field } from '../../../assets/js/ui/dom.js';
import { startPage } from '../../../assets/js/ui/page.js';
import { plot, short } from '../../../assets/js/ui/plot.js';
import { modelFrom, StepModel } from '../core/models.js';
import { Simulation } from '../core/simulate.js';
import { llnTail } from '../core/exact.js';
import { readRun, runCard } from './run-input.js';
import { labPanel, section, table } from './lab-panel.js';
import { SIM, LIMIT, facts, legend, figure, svgButton } from './widgets.js';
import { hw04Shell, STICKY, MEMORY } from './shell.js';

const N_MAX = 10000, REVEAL = 50, MUTED = 'var(--muted)', BAND = 'var(--s2)';
const PATH_CHOICES = [1, 5, 10, 20, 50], KMAX_CHOICES = [50, 100, 1000, 10000];
let timer = null;   // the step-by-step animation, stopped at every redraw
const stepAt = { j: 0, k: 0 };   // which attacker and step the stepper shows, kept across redraws

const pick = (v, list, fallback) => (list.includes(Number(v)) ? Number(v) : fallback);
const fmtNum = (x) => (Number.isInteger(x) ? String(x) : x.toFixed(3));

/** The first `count` attackers of the run with this model and seed. */
function simulatePaths(model, seed, count) {
  // checkpoints at every k the explorer can stop at; n_max = 10⁴ as in every run
  return new Simulation({ model, m: count, grid: KMAX_CHOICES, seed, keepPaths: count }).run();
}

/* ---------- the model in use ---------- */

function modelCard(model) {
  const ber = model.kind === 'bernoulli';
  return el('div', { class: 'card' }, [
    el('h2', { text: `The step model: ${model.label()}` }),
    el('div', { class: 'cols prose-facts' }, [
      facts([
        ['one step Xᵢ', ber ? '0 or 1' : '−1 or +1'],
        ['meaning', model.reading()],
        ['P(Xᵢ = 1)', ber ? String(model.p) : '½'],
        ['mean μ', ber ? `p = ${model.p}` : '0'],
        ['variance σ²', ber ? `p(1 − p) = ${+model.variance.toPrecision(4)}` : '1'],
      ]),
      facts([
        ['Sₙ = X₁ + … + Xₙ', ber ? 'Binomial(n, p): systems penetrated' : '2B − n, B ~ Binomial(n, ½): net advantage'],
        ['E[Sₙ], Var Sₙ', ber ? `${model.p}·n, ${+model.variance.toPrecision(4)}·n` : '0, n'],
        ['a path looks like', ber ? 'a staircase: it never goes down' : 'a zig-zag around 0'],
        ['Sₙ lives on', ber ? '{0, 1, …, n}' : '{−n, −n + 2, …, n}: the parity of n'],
      ]),
    ]),
    explain([
      ber
        ? 'Bernoulli: every probe either penetrates the system (1) or fails (0), independently, with the same probability p. The total Sₙ counts the systems penetrated. Its mean grows like np, while its spread grows only like √(np(1 − p)), so at large n the total is almost a straight line of slope p.'
        : 'Rademacher: every step is a fair ±1, the attacker gaining or losing a round. There is no drift (μ = 0), so the total does not grow on average; it wanders, and how far it wanders (about √n) is the whole story.',
      'Rademacher is the fair Bernoulli centred and rescaled: R = 2B − 1, hence Sₙᴿ = 2Sₙᴮ − n. The last panel of this page shows it on the very same random bits.',
    ]),
  ]);
}

/* ---------- E1: the trajectory explorer ---------- */

function explorer(model, run, view, update) {
  const K = view.paths, kmax = view.kmax, log = view.xs !== 'lin', eps = view.eps;
  const res = simulatePaths(model, run.seed, K);
  const mu = model.mean, sd = model.sd;
  const within = (k) => (p) => Array.from(p.k).map((kk, i) => [kk, p.S[i]]).filter(([kk]) => kk <= kmax && (!log || kk >= 1) && kk <= k);
  const ks = log ? Array.from({ length: 81 }, (_, i) => 10 ** (i / 20)).filter((k) => k <= kmax) : Array.from({ length: 101 }, (_, i) => (i / 100) * kmax);

  /* one panel: the paths mapped by f, the mean line and envelopes for f */
  const panel = (title, f, meanF, sdF, extra = [], y = {}) => {
    const paths = res.paths.map((p) => within(kmax)(p).map(([k, s]) => [k, k ? f(s, k) : (f === ident ? 0 : NaN)]));
    const env = (c) => [+1, -1].map((sg) => ({ type: 'line', points: ks.filter((k) => k > 0).map((k) => [k, meanF(k) + sg * c * sdF(k)]), color: MUTED, dash: true, thin: true, hover: false }));
    return plot({
      x: { log, min: log ? 1 : 0, max: kmax, title: 'k (systems probed)' },
      y: { title, ...y },
      height: 210,
      layers: [
        ...extra,
        { type: 'paths', paths, color: SIM, label: 'attacker', names: res.paths.map((p) => `attacker ${p.attacker + 1}`) },
        { type: 'line', points: ks.filter((k) => k > 0).map((k) => [k, meanF(k)]), color: LIMIT, label: 'mean' },
        ...env(1), ...env(2),
      ],
      label: `${K} paths of ${title} against k, with the mean and envelopes at one and two standard deviations`,
    });
  };
  const ident = (s) => s;

  const view1 = () => {
    // the result: how many attackers sit inside the envelopes at k = kmax, against the normal 68 % / 95 %
    const G = KMAX_CHOICES.length, c = KMAX_CHOICES.indexOf(kmax);
    const end = res.paths.map((p) => res.S[p.attacker * G + c]);
    const z = end.map((s) => Math.abs(s - kmax * mu) / (sd * Math.sqrt(kmax)));
    const in1 = z.filter((v) => v <= 1).length, in2 = z.filter((v) => v <= 2).length;
    const inBand = end.filter((s) => Math.abs(s / kmax - mu) <= eps).length;
    const pBand = 1 - llnTail(model, kmax, eps).q;
    const charts = [
      panel('Sₖ', ident, (k) => k * mu, (k) => sd * Math.sqrt(k)),
      panel('Sₖ/k', (s, k) => s / k, () => mu, (k) => sd / Math.sqrt(k), [{ type: 'shade', y0: mu - eps, y1: mu + eps, color: BAND }],
        { min: model.values[0], max: model.values[1] }),   // an average of steps stays between the two step values
      panel('Sₖ/√k', (s, k) => s / Math.sqrt(k), (k) => mu * Math.sqrt(k), () => sd),
    ];
    const stem = `paths-${run.model}-${run.seed}`;
    return {
      answer: { text: `At k = ${kmax.toLocaleString('en-US').replace(/,/g, '\u202f')}, <strong>${in1} of ${K}</strong> attackers lie within one standard deviation of the mean and <strong>${in2} of ${K}</strong> within two (the normal law predicts 68 % and 95 %: ${(0.6827 * K).toFixed(1)} and ${(0.9545 * K).toFixed(1)}). <strong>${inBand} of ${K}</strong> have an average Sₖ/k within ε = ${eps} of μ (exact probability ${(100 * pBand).toPrecision(3)} %).` },
      body: [
        ...section(1, 'The total Sₖ', 'Each line is one attacker. The dashed curves are kμ ± σ√k and kμ ± 2σ√k: the spread grows like √k.'),
        figure(charts[0], null), el('div', { class: 'row end' }, [svgButton(charts[0], `${stem}-S`)]),
        ...section(2, 'The average Sₖ/k', `The same paths divided by k. The shaded band is μ ± ε (ε = ${eps}); the envelopes μ ± σ/√k shrink into it. That shrinking is the law of large numbers.`),
        figure(charts[1], null), el('div', { class: 'row end' }, [svgButton(charts[1], `${stem}-avg`)]),
        ...section(3, 'The normalised total Sₖ/√k', model.kind === 'bernoulli'
          ? `Divided by √k the spread is constant (σ = ${+sd.toPrecision(3)}), but for Bernoulli the mean μ√k keeps rising: there is no limit until the mean is subtracted.`
          : 'Divided by √k the spread is constant: the envelopes ±1 and ±2 are flat. At every k the cross-section is close to N(0, 1), the central limit theorem.'),
        figure(charts[2], null), el('div', { class: 'row end' }, [svgButton(charts[2], `${stem}-norm`)]),
        legend([['path', SIM, 'one attacker'], ['line', LIMIT, 'mean'], ['dash', MUTED, '±1 and ±2 standard deviations'], ['band', BAND, `LLN band μ ± ε`]]),
      ],
      rows: res.paths.map((p, i) => ({ attacker: p.attacker + 1, k: kmax, S: end[i], S_over_k: end[i] / kmax, S_over_sqrt_k: end[i] / Math.sqrt(kmax) })),
      summary: { model: model.label(), seed: run.seed, paths: K, k: kmax, final: end },
    };
  };

  const sel = (key, list, value, label) => field(label, el('select', { onchange: (e) => update({ [key]: e.target.value }) },
    list.map((v) => el('option', { value: v, text: String(v), selected: Number(v) === value }))));
  return labPanel({
    id: 'E1', title: 'Trajectory explorer', name: `E1-${run.model}-${run.seed}`,
    question: 'What does one attacker’s score look like as it probes more and more systems, and how do the three normalisations change the picture?',
    steps: [
      `Take the first ${K} attackers of the run (seed ${run.seed}); each probes ${N_MAX.toLocaleString('en-US').replace(/,/g, '\u202f')} systems.`,
      'Record the running total Sₖ after every system.',
      'Draw the same paths three times: as Sₖ, as Sₖ/k and as Sₖ/√k, with the mean and the ±1σ, ±2σ envelopes of each.',
    ],
    controls: [
      sel('paths', PATH_CHOICES, K, 'attackers drawn'),
      sel('kmax', KMAX_CHOICES, kmax, 'up to k ='),
      field('k axis', el('select', { onchange: (e) => update({ xs: e.target.value === 'log' ? null : 'lin' }) }, [
        el('option', { value: 'log', text: 'logarithmic', selected: log }), el('option', { value: 'lin', text: 'linear', selected: !log })])),
      field('ε (LLN band)', el('input', { type: 'number', class: 'num', min: 0.005, max: 0.5, step: 0.005, value: String(eps), onchange: (e) => update({ eps: e.target.value }) })),
    ],
    hints: [
      '<strong>attackers drawn</strong>: how many paths. Hover over a plot to pick one out.',
      '<strong>up to k</strong> and <strong>k axis</strong>: a linear axis up to 100 shows the individual steps; a logarithmic axis up to 10 000 shows the long run.',
      '<strong>ε</strong>: the half-width of the band around μ in the middle plot. The LLN says the fraction of attackers outside it goes to 0.',
    ],
    view: view1,
    why: 'The same randomness, scaled three ways, gives three different stories: the total escapes, the average settles, the normalised total keeps a fixed shape. Each of the next pages studies one of them.',
    notes: [
      'All three panels use the same simulated steps, so any difference between them comes from the normalisation alone. The envelopes come from Var(Sₖ/k^α) = k^(1 − 2α)σ².',
      'A single path can leave an envelope and come back. The ±σ envelopes describe the spread across attackers at a fixed k, not a corridor a path must stay in. That every path eventually enters and stays inside the LLN band is the strong law; the weak law, studied on the LLN page, only says the fraction outside at each k goes to 0.',
      'The paths are the first attackers of the same run every page uses: changing m does not change them, changing the seed does.',
    ],
  });
}

/* ---------- the first 50 systems, one at a time ---------- */

function stepper(model, run, K) {
  const res = simulatePaths(model, run.seed, K);
  const holder = el('div');
  const st = stepAt;
  st.j = Math.min(st.j, K - 1);
  const steps = (j) => { const p = res.paths[j]; return Array.from({ length: REVEAL }, (_, i) => p.S[i + 1] - p.S[i]); };
  const stop = () => { if (timer) { clearInterval(timer); timer = null; } };
  const ber = model.kind === 'bernoulli';

  const draw = () => {
    const xs = steps(st.j), S = res.paths[st.j].S;
    const s = S[st.k];
    const strip = el('div', { class: 'strip', role: 'list', 'aria-label': 'the first 50 steps' }, xs.map((x, i) => el('span', {
      role: 'listitem',
      class: `cell ${i < st.k ? (x > 0 ? 'up' : 'down') : 'hidden'}${i === st.k - 1 ? ' now' : ''}`,
      title: `system ${i + 1}`,
      text: i < st.k ? (ber ? String(x) : x > 0 ? '+1' : '−1') : '·',
    })));
    const lo = Math.min(...Array.from(S.slice(0, REVEAL + 1))), hi = Math.max(...Array.from(S.slice(0, REVEAL + 1)));
    const chart = plot({
      x: { min: 0, max: REVEAL, title: 'k' }, y: { min: Math.min(lo, -1) - 1, max: hi + 1, title: 'Sₖ' }, height: 170,
      layers: [
        { type: 'hline', at: 0, color: MUTED, dash: false },
        { type: 'line', points: Array.from({ length: st.k + 1 }, (_, k) => [k, S[k]]), color: SIM, label: 'Sₖ' },
        { type: 'points', points: [[st.k, s]], color: SIM, hover: false },
      ],
    });
    holder.replaceChildren(
      strip,
      el('div', { class: 'cols wide-first' }, [chart, facts([
        ['systems probed k', String(st.k)],
        ['last step Xₖ', st.k ? (ber ? String(xs[st.k - 1]) : xs[st.k - 1] > 0 ? '+1' : '−1') : '—'],
        ['Sₖ', String(s)],
        ['Sₖ/k', st.k ? fmtNum(s / st.k) : '—'],
        ['Sₖ/√k', st.k ? fmtNum(s / Math.sqrt(st.k)) : '—'],
      ])]),
    );
  };
  const go = (k) => { st.k = Math.max(0, Math.min(REVEAL, k)); slider.value = String(st.k); draw(); };
  const slider = el('input', { type: 'range', min: 0, max: REVEAL, step: 1, value: String(st.k), 'aria-label': 'systems revealed', oninput: (e) => { stop(); go(Number(e.target.value)); } });
  const play = el('button', { type: 'button', text: '▶ play', onclick: () => {
    if (timer) { stop(); play.textContent = '▶ play'; return; }
    if (st.k >= REVEAL) go(0);
    play.textContent = '❚❚ pause';
    timer = setInterval(() => { if (st.k >= REVEAL) { stop(); play.textContent = '▶ play'; } else go(st.k + 1); }, 300);
  } });
  stop();
  draw();
  return el('div', { class: 'card' }, [
    el('h2', { text: 'The first 50 systems, one at a time' }),
    el('p', { html: `Follow one attacker system by system: each probe adds ${ber ? '0 or 1' : '−1 or +1'} to its score. Watch Sₖ/k swing wildly at first and calm down, while Sₖ/√k keeps moving.` }),
    el('div', { class: 'row' }, [
      field('attacker', el('select', { onchange: (e) => { stop(); play.textContent = '▶ play'; st.j = Number(e.target.value); go(st.k); } },
        res.paths.map((p, j) => el('option', { value: j, text: `attacker ${p.attacker + 1}`, selected: j === st.j })))),
      el('button', { type: 'button', text: '⏮', 'aria-label': 'back to the start', onclick: () => { stop(); play.textContent = '▶ play'; go(0); } }),
      el('button', { type: 'button', text: '◀', 'aria-label': 'one step back', onclick: () => { stop(); go(st.k - 1); } }),
      el('button', { type: 'button', text: '▶', 'aria-label': 'one step forward', onclick: () => { stop(); go(st.k + 1); } }),
      play,
      field('systems revealed', slider),
    ]),
    holder,
    explain([
      'The strip shows each step as it is revealed. The plot draws the running total. These are the first 50 steps of the same attacker as in the explorer above.',
      'In the first few steps Sₖ/k jumps by about 1/k at each step: one lucky probe out of three is a 33 % success rate. By k = 50 a single step moves it by 0.02. This is the LLN in the small: each new system weighs 1/k, so the average becomes harder and harder to move.',
    ]),
  ]);
}

/* ---------- the same bits under both models ---------- */

function sameBits(run, view, patch) {
  const COUNT = 5, KSHOW = 200;
  const rad = simulatePaths(new StepModel({ kind: 'rademacher' }), run.seed, COUNT);
  const ber = simulatePaths(new StepModel({ kind: 'bernoulli', p: 0.5 }), run.seed, COUNT);
  const holder = el('div');
  let as = view.bits === 'ber' ? 'ber' : 'rad';
  const draw = () => {
    const src = as === 'ber' ? ber : rad;
    const paths = src.paths.map((p) => Array.from(p.k).map((k, i) => [k, p.S[i]]).filter(([k]) => k <= KSHOW));
    const ys = as === 'ber' ? { min: 0, max: KSHOW * 0.65 } : { min: -40, max: 40 };
    const firstBits = Array.from({ length: 24 }, (_, i) => rad.paths[0].S[i + 1] - rad.paths[0].S[i] > 0 ? 1 : 0);
    const checks = rad.paths.map((p, j) => {
      const r = p.S[p.k.indexOf(KSHOW)], b = ber.paths[j].S[ber.paths[j].k.indexOf(KSHOW)];
      return [`attacker ${j + 1}`, String(b), String(r), `2·${b} − ${KSHOW} = ${2 * b - KSHOW}`, 2 * b - KSHOW === r ? '✓' : '✗'];
    });
    holder.replaceChildren(
      el('div', { class: 'bits' }, [
        el('div', { class: 'small muted', text: 'attacker 1, first 24 random bits' }),
        el('div', { class: 'strip' }, firstBits.map((b) => el('span', { class: `cell ${b ? 'up' : 'down'}`, text: as === 'ber' ? String(b) : b ? '+1' : '−1' }))),
      ]),
      plot({
        x: { min: 0, max: KSHOW, title: 'k' }, y: { ...ys, title: as === 'ber' ? 'Sₖ (Bernoulli ½)' : 'Sₖ (Rademacher)' }, height: 200,
        layers: [
          ...(as === 'ber' ? [{ type: 'line', points: [[0, 0], [KSHOW, KSHOW / 2]], color: LIMIT, label: 'mean k/2' }] : [{ type: 'hline', at: 0, color: LIMIT, dash: false }]),
          { type: 'paths', paths, color: SIM, label: 'attacker', names: src.paths.map((p) => `attacker ${p.attacker + 1}`) },
        ],
      }),
      table(['', `Sᴮ at k = ${KSHOW}`, `Sᴿ at k = ${KSHOW}`, '2Sᴮ − k', 'equal?'], checks),
    );
  };
  draw();
  return el('div', { class: 'card' }, [
    el('h2', { text: 'Rademacher = 2 × Bernoulli(½) − 1, on the same bits' }),
    el('p', { html: 'The simulation turns 32-bit random words into steps, one bit per step. Here the <em>same</em> bits are read twice: bit 1 as a success (Bernoulli ½: score 1) or as a gain (Rademacher: +1), bit 0 as a failure (0) or a loss (−1).' }),
    el('div', { class: 'radio-row', role: 'radiogroup', 'aria-label': 'read the bits as' }, [['ber', 'read as Bernoulli(½)'], ['rad', 'read as Rademacher']].map(([v, t]) =>
      el('label', {}, [el('input', { type: 'radio', name: 'bits', checked: as === v, onchange: () => { as = v; patch({ bits: v === 'rad' ? null : v }); draw(); } }), t]))),
    holder,
    explain([
      'Switch between the two readings: the paths keep their shape, but the Bernoulli staircase climbs along k/2, while the Rademacher zig-zag stays around 0 at twice the height. Subtracting the drift and doubling turns one into the other exactly: Sₖᴿ = 2Sₖᴮ − k. The table checks it at k = 200.',
      'This panel always uses p = ½, whatever model is chosen above: the identity only holds for a fair coin. It is why the "symmetric, zero-mean case" of the assignment is the Bernoulli case with its drift removed. Every result for one model translates into the other by this affine map.',
    ]),
  ]);
}

startPage({
  shell: hw04Shell('model.html'),
  sticky: STICKY,
  memory: MEMORY,
  preserve: true,
  render: ({ state, update, patch }) => {
    const run = readRun(state);
    const model = modelFrom(run);
    const view = {
      paths: pick(state.paths, PATH_CHOICES, 20),
      kmax: pick(state.kmax, KMAX_CHOICES, N_MAX),
      xs: state.xs,
      eps: Math.min(0.5, Math.max(0.005, Number(state.eps) || (run.model === 'ber' ? 0.05 : 0.1))),
      bits: state.bits,
    };
    return [
      runCard(run, update),
      modelCard(model),
      explorer(model, run, view, update),
      stepper(model, run, view.paths),
      sameBits(run, view, patch),
    ];
  },
});
