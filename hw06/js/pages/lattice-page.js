/* lattice-page.js — Gaussian sampling for lattice cryptography, simulated (note 06 §2):
   a cumulative distribution table (CDT) is a table of Φ-like values; its precision
   in bits is a statistical distance; a sampler that stops early leaks its output
   through its running time. A SIMULATION of a crypto component, not one to deploy.
   [[Discrete Gaussian and CDT sampling]], [[Statistical distance]]. */

import { el, field } from '../../../assets/js/ui/dom.js';
import { startPage } from '../../../assets/js/ui/page.js';
import { labPanel, section, table } from '../../../assets/js/ui/lab.js';
import { plot } from '../../../assets/js/ui/plot.js';
import { nice, sig } from '../../../assets/js/ui/format.js';
import { m, M } from '../../../assets/js/ui/math.js';
import { show, onCommit, numberOr } from '../../../assets/js/ui/dock.js';
import { buildCDT, referenceTable } from '../core/cdt.js';
import { readInputs, dock, rejected } from './inputs.js';
import { RIEMANN, LEBESGUE, REF, MUTED, legend, figure, evidenceHtml, getRun, pending, updatingFlag, abstract, anchor } from './widgets.js';
import { hw06Shell, STICKY, MEMORY } from './shell.js';

const e2s = (x, d = 2) => (x === 0 ? '0' : x.toExponential(d));
const BITS = [8, 16, 32, 48, 64];
const SAMPLES = 100000;

/* ---------- this page's row in the dock ---------- */

function readPage(state) {
  const sigma = numberOr(state.sigma, 2);
  const T = Math.round(numberOr(state.T, Math.ceil(13 * sigma)));
  const b = BITS.includes(Number(state.b)) ? Number(state.b) : 16;
  let error = null;
  if (!(sigma >= 1 && sigma <= 20)) error = `σ must be between 1 and 20 (got ${sigma}).`;
  else if (!(T >= 1 && T <= 300)) error = `the tail cut T must be between 1 and 300 (got ${T}).`;
  return { sigma, T, b, error };
}

const OWN = {
  id: 'lattice', label: 'this page',
  build(apply, later) {
    const sigma = el('input', { type: 'number', class: 'num', min: 1, max: 20, step: 'any', 'aria-label': 'Gaussian parameter sigma' });
    const T = el('input', { type: 'number', class: 'num', min: 1, max: 300, 'aria-label': 'tail cut T' });
    const b = el('select', { 'aria-label': 'bits per table entry', onchange: (e) => apply({ b: e.target.value }) }, BITS.map((v) => el('option', { value: v, text: `${v} bits` })));
    onCommit(sigma, () => apply({ sigma: sigma.value, T: null }), later);
    onCommit(T, () => apply({ T: T.value }), later);
    return {
      nodes: [el('div', { class: 'row' }, [field('σ', sigma), field('tail cut T', T), field('precision b', b)])],
      refresh(v) { show(sigma, v.sigma); show(T, v.T); show(b, v.b); },
    };
  },
  summary: (v) => `σ = ${v.sigma} · T = ${v.T} · ${v.b} bits`,
  notes: [
    '<strong>σ, T</strong>: the discrete Gaussian on {−T, …, T} with weights e^(−x²/2σ²). Changing σ resets T to ⌈13σ⌉; an 80-digit reference table exists for σ = 1, 1.5, 2, 3, 4, 5, 8, 10, 16, 20 with that T.',
    '<strong>b</strong>: the bits of each table entry, i.e. the bits of randomness per sample.',
  ],
};

/* ---------- theory ---------- */

function theory() {
  return el('div', { class: 'card' }, [
    el('h2', { text: 'A table of Φ-like values' }),
    el('div', { class: 'cols' }, [
      el('div', {}, [
        el('div', { html: M`P(x) = \frac{e^{-x^2/(2\sigma^2)}}{\sum_{|y| \le T} e^{-y^2/(2\sigma^2)}}, \qquad x \in \{-T, \ldots, T\}` }),
        el('p', { class: 'small muted', html: `The discrete Gaussian: lattice schemes (Falcon, FrodoKEM, BLISS ${evidenceHtml('S')}) add its noise to hide secrets. Its CDF ${m`F_i = \sum_{j \le i} P(j)`} is a discrete ${m`\Phi`}.` }),
      ]),
      el('div', {}, [
        el('div', { html: M`C_i = \lfloor 2^{b} F_i \rfloor, \qquad r \sim U\{0, \ldots, 2^{b} - 1\}, \qquad x = \min\{i : r < C_i\}` }),
        el('p', { class: 'small muted', html: `The sampler: draw ${m`b`} random bits and look ${m`r`} up in the table. Rounding to ${m`b`} bits moves each probability by less than ${m`2^{-b}`}, so the statistical distance is at most ${m`(2T+1)\,2^{-b}`}.` }),
      ]),
    ]),
    el('p', { class: 'small', html: '<strong>A simulation.</strong> Real implementations are in C, built and checked for constant time with dedicated tools; here JavaScript shows the arithmetic and the leak, not a deployable sampler.' }),
  ]);
}

/* ---------- E13a · precision ---------- */

function precision(page) {
  const tables = BITS.map((b) => buildCDT({ sigma: page.sigma, T: page.T, bits: b }));
  const ref = referenceTable(page.sigma, page.T);
  const t64d = buildCDT({ sigma: page.sigma, T: page.T, bits: 64, source: 'double' });
  const n = 2 * page.T + 1;
  const chart = plot({
    x: { min: 6, max: 66, title: 'bits b', ticks: BITS }, y: { log: true, min: 1e-21, max: 1, title: 'statistical distance' }, width: 640, height: 260,
    layers: [
      { type: 'line', points: BITS.map((b) => [b, n * 2 ** -b]), color: MUTED, dash: '4 3', label: 'bound (2T+1)·2⁻ᵇ', end: 'bound' },
      { type: 'line', points: tables.map((t) => [t.bits, Math.max(1e-21, t.sd)]), color: REF, label: 'table', end: 'table' },
      { type: 'points', points: [[64, Math.max(1e-21, t64d.sd)]], color: LEBESGUE, r: 5, label: '64 bits built from doubles' },
    ],
    label: 'statistical distance of the quantised table against the number of bits, with the bound and the 64-bit table built from doubles',
  });
  const rows = tables.map((t) => [`${t.bits}`, e2s(t.sd), e2s(n * 2 ** -t.bits), String(t.zeros), t.from === 'reference' ? '80-digit reference' : 'doubles']);
  rows.push(['64 (from doubles)', e2s(t64d.sd), e2s(n * 2 ** -64), String(t64d.zeros), 'doubles']);
  const sel = tables.find((t) => t.bits === page.b);
  return labPanel({
    hw: 'hw06', id: 'E13a', title: 'E13a · How many bits per entry?', name: `E13a-s${page.sigma}-T${page.T}`,
    question: `How far is the ${m`b`}-bit table from the ideal discrete Gaussian, and what goes wrong when it is built from doubles?`,
    steps: [`build the table for ${m`b = 8, 16, 32, 48, 64`};`, `measure ${m`\Delta = \tfrac{1}{2}\sum_i |P(i) - q_i|`} exactly (BigInt), ${m`q_i`} the probability the table gives;`, 'count the entries that can never be sampled (q = 0).'],
    view: () => ({
      answer: { text: `Each bit halves the distance: <strong>${e2s(tables[1].sd)}</strong> at 16 bits, <strong>${e2s(tables[2].sd)}</strong> at 32${ref ? `, ${e2s(tables[4].sd)} at 64 with the 80-digit table` : ''}. A 64-bit table built from doubles only reaches <strong>${e2s(t64d.sd)}</strong>: a double holds 53 bits, so the last 11 are noise.`, ok: !ref || t64d.sd < 1e-15 },
      body: [
        ...section(1, 'Distance against bits', 'Each bit halves the distance, until the table is built from doubles.'),
        figure(chart),
        legend([['line', REF, 'table'], ['dash', MUTED, 'bound (2T+1)·2⁻ᵇ'], ['dot', LEBESGUE, '64-bit table built from doubles']]),
        ...section(2, 'The numbers', `Zero entries: support points the table can never output (their true probability is below ${m`2^{-b}`}).`),
        table(['bits b', 'distance Δ', 'bound', 'entries with q = 0', 'built from'], rows),
        el('details', { class: 'explain' }, [el('summary', { text: `The ${page.b}-bit table itself (${n} entries)` }),
          table(['x', 'P(x)', `C (${page.b} bits)`, 'q'], sel.support.map((x, i) => [String(x), e2s(sel.p[i], 4), String(sel.C[i]), String(sel.q[i])]))]),
        ref ? null : el('p', { class: 'small muted', text: `No 80-digit reference for σ = ${page.sigma}, T = ${page.T}: the 48- and 64-bit tables here are built from doubles too.` }),
      ],
      rows: rows.map(([b, sd, bound, zeros, from]) => ({ b, sd, bound, zeros, from })),
      summary: { sigma: page.sigma, T: page.T, rows },
    }),
    why: 'a lattice scheme’s security proof assumes samples from the ideal distribution; the distance of the real table is a direct loss of security, and building it in floating point quietly caps it at what doubles can hold — the accuracy lesson of Ex. 2, now with an attacker.',
    notes: ['The distance is computed from the 25-digit reference probabilities in exact integer arithmetic: in doubles, a difference of 2⁻⁶⁴ would vanish under the rounding of P(x) itself.'],
  });
}

/* ---------- E13b · the timing leak ---------- */

function samplers(page, inputs, redraw) {
  const spec = { kind: 'cdtSamples', args: { sigma: page.sigma, T: page.T, bits: Math.min(page.b, 32), n: SAMPLES, seed: inputs.seed } };
  const got = getRun(spec, redraw, 'E13b');
  return labPanel({
    hw: 'hw06', id: 'E13b', title: 'E13b · A sampler that tells on itself', name: `E13b-s${page.sigma}-seed${inputs.seed}`,
    question: 'Does the running time of the sampler reveal the sample?',
    steps: [
      `draw ${nice(SAMPLES)} samples with each sampler (${Math.min(page.b, 32)}-bit table, seed ${inputs.seed});`,
      '<strong>early exit</strong>: scan the table and stop at the first entry above r; <strong>constant time</strong>: compare r with every entry, without a branch, and count;',
      'record the number of comparisons for each output.',
    ],
    flag: updatingFlag(got), waiting: got.result ? null : pending(got, spec, redraw),
    view: () => {
      const r = got.result, T = page.T, xs = r.early.counts.map((_, i) => i - T);
      const leak = plot({
        x: { min: -T - 0.5, max: T + 0.5, title: 'output x' }, y: { min: 0, title: 'comparisons' }, width: 420, height: 260,
        layers: [
          { type: 'line', points: xs.map((x, i) => [x, r.constant.byOutput[i] || 2 * T + 1]), color: RIEMANN, label: 'constant time', end: 'constant' },
          { type: 'step', points: xs.map((x, i) => [x - 0.5, r.early.byOutput[i] || T + x + 1]), color: LEBESGUE, label: 'early exit' },
        ],
        label: 'comparisons against the output: a staircase for the early-exit sampler, flat for the constant-time one',
      });
      const total = r.early.counts.reduce((s, c) => s + c, 0);
      const keep = xs.map((x, i) => [x, i]).filter(([x]) => Math.abs(x) <= Math.ceil(5 * page.sigma));
      const hist = plot({
        x: { min: -Math.ceil(5 * page.sigma) - 0.5, max: Math.ceil(5 * page.sigma) + 0.5, title: 'output x' }, y: { min: 0, title: 'probability' }, width: 420, height: 260,
        layers: [
          { type: 'bars', bars: keep.map(([x, i]) => [x - 0.4, x + 0.4, r.early.counts[i] / total]), color: RIEMANN, label: 'samples' },
          { type: 'points', points: keep.map(([x, i]) => [x, r.q[i] / 2 ** Math.min(page.b, 32)]), color: REF, r: 3, label: 'table probability' },
        ],
        label: 'histogram of the samples against the table probabilities',
      });
      return {
        answer: { text: `The early-exit sampler makes <strong>T + x + 1</strong> comparisons for output x (mean ${r.early.meanComparisons.toFixed(2)}, SD ${r.early.sdComparisons.toFixed(2)} = σ): its running time is a function of the secret sample. The constant-time one always makes <strong>${r.constant.meanComparisons}</strong>. Both draw the same distribution.`, ok: false },
        body: [
          el('div', { class: 'cols' }, [
            el('div', {}, [...section(1, 'Comparisons per output', 'Orange: a staircase — timing reveals x. Green: flat — timing reveals nothing.'), leak]),
            el('div', {}, [...section(2, 'The samples', `Both samplers have the same output distribution; the early-exit histogram (bars) against the table (dots), within ±5σ.`), hist]),
          ]),
          legend([['line', LEBESGUE, 'early exit'], ['line', RIEMANN, 'constant time'], ['bar', RIEMANN, 'samples'], ['dot', REF, 'table probability']]),
        ],
        rows: xs.map((x, i) => ({ x, early: r.early.counts[i], constant: r.constant.counts[i], comparisonsEarly: r.early.byOutput[i], q: r.q[i] })),
        summary: { sigma: page.sigma, T, bits: Math.min(page.b, 32), seed: inputs.seed, meanEarly: r.early.meanComparisons, sdEarly: r.early.sdComparisons, constant: r.constant.meanComparisons },
      };
    },
    why: `the BLISS signature scheme was broken this way ${evidenceHtml('S')}: a cache-timing attack on its Gaussian sampler recovered the secret key (Groot Bruinderink et al., CHES 2016). Constant-time samplers (Micciancio–Walter 2017 ${evidenceHtml('S')}) scan the whole table every time.`,
    notes: [`Browsers reduced the precision of their timers after Spectre (2018) ${evidenceHtml('S')}, so this page counts comparisons, the operation an attacker times, instead of measuring nanoseconds. Above 32 bits the samplers use BigInt; this demo stays at 32.`],
  });
}

startPage({
  shell: hw06Shell('lattice.html'),
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
        question: 'Lattice cryptography needs samples from a discrete Gaussian, drawn from a precomputed table of Φ-like values. How precise must the table be, and can the sampler leak its output?',
        findings: [
          '<strong>Precision is security.</strong> For σ = 2 the 16-bit table is 5.7·10⁻⁵ away from the ideal distribution, the 32-bit one 1.1·10⁻⁹, the 64-bit one 4·10⁻¹⁹ — each bit halves the distance (E13a).',
          '<strong>Doubles are not enough.</strong> A 64-bit table built from double-precision values only reaches 3·10⁻¹⁶: the table must be computed in high precision, offline (E13a).',
          '<strong>Time leaks.</strong> A sampler that stops at the right entry makes T + x + 1 comparisons for output x, so its timing reveals the sample; the constant-time sampler always makes 2T + 1 (E13b).',
        ],
        sections: [['theory', 'A table of Φ-like values'], ['E13a', 'E13a · bits per entry'], ['E13b', 'E13b · the timing leak']],
      }),
      anchor('theory', theory()), anchor('E13a', precision(page)), anchor('E13b', samplers(page, inputs, redraw)),
    ];
  },
});
