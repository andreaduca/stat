/* anomalies-page.js — E9: online anomaly detection with running statistics.
   A defender keeps a baseline (mean and SD) of one attacker's scores and
   alarms when a new score is more than z* SDs above it. Frozen, Welford and
   exponentially weighted baselines, against a sudden change and against a
   slow ramp that an adaptive baseline learns (poisoning). The study runs in
   the Web Worker (anomalyStudy); this file only draws. */

import { el, field, explain } from '../../../assets/js/ui/dom.js';
import { startPage } from '../../../assets/js/ui/page.js';
import { labPanel, section, table } from '../../../assets/js/ui/lab.js';
import { plot } from '../../../assets/js/ui/plot.js';
import { nice } from '../../../assets/js/ui/format.js';
import { show } from '../../../assets/js/ui/dock.js';
import { m, M } from '../../../assets/js/ui/math.js';
import { ScaledBeta, Normal, Exponential, Uniform, Binomial } from '../core/dists.js';
import { PHASE1, FINAL } from '../core/experiments.js';
import { readInputs, dock, rejected } from './inputs.js';
import { THEORY, MUTED, legend, evidenceHtml, figure, svgButton, sig, getRun, pending, updatingFlag } from './widgets.js';
import { hw05Shell, STICKY, MEMORY } from './shell.js';

const SCEN = { change: 'sudden change', ramp: 'slow ramp (poisoning)' };
const T_CHOICES = [50, 500, 3000];
const R_CHOICES = [100, 300, 1000];
const ALPHAS = [0.01, 0.05, 0.2];
const BASE = ['frozen', 'welford', ...ALPHAS.map((a) => `ew${a}`)];
const COLORS = { frozen: 'var(--m1)', welford: 'var(--m2)', 'ew0.01': 'var(--m3)', 'ew0.05': 'var(--m4)', 'ew0.2': 'var(--m5)' };
const SHORT = { frozen: 'frozen', welford: 'Welford', 'ew0.01': 'EW 0.01', 'ew0.05': 'EW 0.05', 'ew0.2': 'EW 0.2' };
const NOVICE = new ScaledBeta(10, 2, 5), EXPERT = new ScaledBeta(10, 5, 2);

/* ---------- page state ---------- */

function readPage(state) {
  const scenario = SCEN[state.scen] ? state.scen : 'change';
  const T = T_CHOICES.includes(Number(state.T)) ? Number(state.T) : 500;
  const z = Math.min(5, Math.max(1, Number(state.z) || 3));
  const two = state.two === '1' || state.two === 1 || state.two === true;
  const R = R_CHOICES.includes(Number(state.R)) ? Number(state.R) : 300;
  return { scenario, T, z: Math.round(z * 2) / 2, two, R };
}

const PAGE = {
  id: 'anomalies', label: 'this page',
  build(apply) {
    const scen = el('select', { 'aria-label': 'scenario', onchange: (e) => apply({ scen: e.target.value }) }, Object.entries(SCEN).map(([v, t]) => el('option', { value: v, text: t })));
    const T = el('select', { 'aria-label': 'ramp length T', onchange: (e) => apply({ T: e.target.value }) }, T_CHOICES.map((v) => el('option', { value: v, text: nice(v) })));
    const z = el('select', { 'aria-label': 'threshold z*', onchange: (e) => apply({ z: e.target.value }) }, [1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5].map((v) => el('option', { value: v, text: String(v) })));
    const two = el('input', { type: 'checkbox', 'aria-label': 'two-sided alarms', onchange: (e) => apply({ two: e.target.checked ? '1' : null }) });
    const R = el('select', { 'aria-label': 'runs R', onchange: (e) => apply({ R: e.target.value }) }, R_CHOICES.map((v) => el('option', { value: v, text: nice(v) })));
    return {
      nodes: [el('div', { class: 'row' }, [field('scenario', scen), field('ramp T', T), el('div', { class: 'vrule' }), field('z*', z), el('label', { class: 'field inline' }, [two, el('span', { text: 'two-sided' })]), el('div', { class: 'vrule' }), field('runs R', R)])],
      refresh(v) { show(scen, v.scenario); show(T, v.T); T.disabled = v.scenario !== 'ramp'; show(z, v.z); two.checked = v.two; show(R, v.R); },
    };
  },
  summary: (v) => `${SCEN[v.scenario]}${v.scenario === 'ramp' ? `, T = ${nice(v.T)}` : ''} · z* = ${v.z}${v.two ? ' two-sided' : ''} · R = ${nice(v.R)} runs`,
  notes: [
    `<strong>scenario</strong>: <em>sudden change</em> — ${PHASE1} novice scores (10·Beta(2, 5)), then ${FINAL} expert scores (10·Beta(5, 2)): the attacker has learned. <em>Slow ramp</em> — the same, with T steps in between where the shape moves linearly from Beta(2, 5) to Beta(5, 2): the attacker changes slowly enough for an adaptive baseline to follow.`,
    '<strong>z*</strong>: a score is flagged when it is more than z* baseline SDs above the baseline mean (or away from it, two-sided). <strong>R</strong>: how many independent attackers the rates in the table are averaged over.',
  ],
};

/* ---------- 1. one attacker's stream ---------- */

function streamPlot(page, first) {
  const xs = first.xs, len = xs.length, rampEnd = PHASE1 + (page.scenario === 'ramp' ? page.T : 0);
  const thin = (arr) => { const out = []; const step = Math.max(1, Math.floor(len / 900)); for (let t = 0; t < len; t += step) out.push([t, arr[t]]); return out; };
  const layers = [
    { type: 'shade', x0: PHASE1, x1: rampEnd, color: 'var(--m4)' },
    { type: 'shade', x0: len - FINAL, x1: len, color: 'var(--m2)' },
    { type: 'points', points: Array.from(xs, (x, t) => [t, x]), color: MUTED, r: 1.8, label: 'score', hover: false },
    ...first.baselines.map((b) => ({ type: 'line', points: thin(b.thr), color: COLORS[b.id], thin: true, label: `${SHORT[b.id]} threshold`, end: SHORT[b.id] })),
  ];
  const width = 960;
  const chart = plot({ x: { min: 0, max: len, title: 'attempt t' }, y: { min: 0, max: 10, title: 'score' }, width, height: 280, layers,
    label: 'one attacker\'s score stream with the alarm threshold of each baseline' });
  // the alarms of each baseline, one row each, on the same x scale as the plot above (plot.js pads 56 left, 92 right with end labels)
  const padL = 56, padR = 92, rowH = 16, H = 8 + BASE.length * rowH + 6;
  const NS = 'http://www.w3.org/2000/svg';
  const node = (tag, a, text) => { const n = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(a)) n.setAttribute(k, v); if (text !== undefined) n.textContent = text; return n; };
  const svg = node('svg', { viewBox: `0 0 ${width} ${H}`, role: 'img', class: 'raster', 'aria-label': 'alarm times of each baseline' });
  const X = (t) => padL + (t / len) * (width - padL - padR);
  first.baselines.forEach((b, i) => {
    const y = 8 + i * rowH;
    svg.append(node('text', { class: 'tick', x: padL - 6, y: y + 9, 'text-anchor': 'end' }, SHORT[b.id]));
    svg.append(node('line', { class: 'track', x1: padL, x2: width - padR, y1: y + 6, y2: y + 6 }));
    let count = 0;
    for (let t = 0; t < len; t++) if (b.alarms[t]) { count++; svg.append(node('line', { class: 'alarm', x1: X(t), x2: X(t), y1: y, y2: y + 12, style: `stroke: ${COLORS[b.id]}` })); }
    svg.append(node('text', { class: 'tick', x: width - padR + 6, y: y + 9 }, `${count} alarms`));
  });
  return { chart, raster: el('div', { class: 'chart' }, [svg]) };
}

/* ---------- 2. the table over R attackers ---------- */

function exact(page) {
  const zs = page.z;
  const fa = NOVICE.sf(NOVICE.mean + zs * NOVICE.sd) + (page.two ? NOVICE.cdf(NOVICE.mean - zs * NOVICE.sd) : 0);
  const fin = EXPERT.sf(NOVICE.mean + zs * NOVICE.sd) + (page.two ? EXPERT.cdf(NOVICE.mean - zs * NOVICE.sd) : 0);
  return { fa, fin };
}

/** Reference values of the draft (§8.2, 300 runs, z* = 3, warm-up 30, one-sided). */
function reference(page, id) {
  if (page.z !== 3 || page.two) return null;
  const fa = { frozen: 0.004, welford: 0.004, 'ew0.01': 0.004, 'ew0.05': 0.007 }[id];
  let fin = null;
  if (page.scenario === 'ramp') fin = id === 'frozen' ? (page.T === 50 ? 0.435 : 0.43) : id === 'welford' ? (page.T === 50 ? 0.02 : 0) : id === 'ew0.2' ? null : 0;
  return { fa, fin };
}

function studyTable(page, res) {
  const ex = exact(page);
  const rows = res.table.map((r) => {
    const ref = reference(page, r.id);
    return [SHORT[r.id], sig(r.fa, 3), ref?.fa !== undefined && ref?.fa !== null ? String(ref.fa) : '—', sig(r.fin, 3), ref?.fin !== undefined && ref?.fin !== null ? String(ref.fin) : '—',
      r.delay === null ? 'never' : nice(Math.round(r.delay)), `${Math.round(r.detected * 100)} %`];
  });
  return [
    table(['baseline', 'false alarms, phase 1', 'draft ref.', `alarm rate, last ${FINAL}`, 'draft ref.', 'median delay', 'attackers detected'], rows, 'cmp'),
    el('p', { class: 'small muted', html: `With μ and σ of the novices known exactly, the false-alarm rate would be ${m`P(X > \mu + z^*\sigma) = ${sig(ex.fa, 3)}`} and a frozen baseline would flag ${m`P(X_{\text{expert}} > \mu_N + z^*\sigma_N) = ${sig(ex.fin, 4)}`} of the expert scores. The draft's references (300 runs, z* = 3, one-sided) are shown where they exist. "Delay": attempts from the change (or the start of the ramp) to the first alarm, median over the attackers detected.` }),
  ];
}

/* ---------- 3. the shape decides the 3σ rule ---------- */

function shapePanel(page) {
  const dists = [['N(0, 1)', new Normal()], ['10·Beta(2, 5)', NOVICE], ['U(0, 1)', new Uniform()], ['Binomial(10, 0.3)', new Binomial(10, 0.3)], ['Exp(1)', new Exponential(1)]];
  const zs = Array.from({ length: 81 }, (_, i) => 1 + i * 0.05);
  const layers = [
    { type: 'line', points: zs.map((z) => [z, 1 / (1 + z * z)]), color: 'var(--ink)', dash: '5 4', label: 'Cantelli bound 1/(1 + z²)', end: 'Cantelli' },
    ...dists.map(([name, d], i) => ({ type: 'line', points: zs.map((z) => [z, Math.max(1e-7, d.sf(d.mean + z * d.sd))]), color: `var(--m${i + 1})`, label: name, end: name.split('(')[0] })),
    { type: 'vline', at: page.z, color: MUTED, dash: false, text: `z* = ${page.z}` },
  ];
  const node = plot({ x: { min: 1, max: 5, title: 'z (SDs above the mean)' }, y: { log: true, min: 1e-6, max: 1, title: 'P(X > μ + zσ)' }, width: 620, height: 260, layers,
    label: 'upper tail probability beyond z standard deviations for five distributions and the Cantelli bound' });
  const rows = dists.map(([name, d]) => [name, sig(d.sf(d.mean + page.z * d.sd), 4), sig(d.sf(d.mean + page.z * d.sd) + d.cdf(d.mean - page.z * d.sd), 4)]);
  rows.push(['any distribution (bound)', `≤ ${sig(1 / (1 + page.z ** 2), 3)} (Cantelli)`, `≤ ${sig(1 / page.z ** 2, 3)} (Chebyshev)`]);
  return el('div', { class: 'card' }, [
    el('h2', { text: `The ${page.z}σ rule depends on the shape` }),
    el('p', { html: `How often an ordinary score is beyond the threshold, if the baseline knew ${m`\mu`} and ${m`\sigma`} exactly. A z-score alarm calibrated for one shape is mis-calibrated for another; the only shape-free guarantee is a loose bound.` }),
    el('div', { class: 'cols wide-first' }, [figure(node), table(['distribution', `one-sided ${m`P(X > \mu + z^*\sigma)`}`, 'two-sided'], rows, 'cmp')]),
    explain([
      `${evidenceHtml('T')} Normal: 0.135 % beyond +3σ. The default score 10·Beta(2, 5): 0.347 %, all of it in the upper tail (its lower tail ends before μ − 1.8σ). Exp(1): 1.83 %. U(0, 1): none at all. So "3σ" means a different false-alarm rate for every shape: calibrate z* on observed data, or use a quantile of the scores.`,
      `${evidenceHtml('T')} Without knowing the shape, Chebyshev only guarantees ${m`P(|X - \mu| \ge z\sigma) \le 1/z^2`} (11.1 % at 3σ) and its one-sided form, Cantelli, ${m`P(X - \mu \ge z\sigma) \le 1/(1+z^2)`} (10 % at 3σ): far above any real tail.`,
    ]),
  ]);
}

startPage({
  shell: hw05Shell('anomalies.html'),
  sticky: STICKY,
  memory: MEMORY,
  preserve: true,
  render: (api) => {
    const { state, update } = api;
    const run = readInputs(state), page = readPage(state);
    dock(run, update, PAGE, page);
    if (run.error) return [rejected(run.error)];
    const redraw = () => api.draw();
    const spec = { kind: 'anomaly', args: { scenario: page.scenario, T: page.T, R: page.R, zStar: page.z, warmup: 30, twoSided: page.two, alphas: ALPHAS, seed: run.seed } };
    const got = getRun(spec, redraw, 'study');
    return [
      labPanel({
        hw: 'hw05', id: 'E9', title: 'E9 · Online anomaly detection, and how to poison it', name: `E9-${page.scenario}-T${page.T}-z${page.z}-seed${run.seed}`,
        question: `A defender keeps a running baseline of one attacker's scores and raises an alarm on unusually high ones. Which baseline catches ${page.scenario === 'ramp' ? 'an attacker who improves slowly' : 'an attacker who suddenly improves'}, and at what cost in false alarms?`,
        steps: [
          `each attacker scores ${PHASE1} times from ${m`10\cdot\mathrm{Beta}(2,5)`} (a novice), ${page.scenario === 'ramp' ? `then ${nice(page.T)} times while the shape moves to ${m`10\cdot\mathrm{Beta}(5,2)`}, ` : ''}then ${FINAL} times as an expert, ${m`10\cdot\mathrm{Beta}(5,2)`};`,
          `before learning each score ${m`x_t`}, every baseline computes ${m`z_t = (x_t - m)/\mathrm{sd}`} and alarms if ${page.two ? m`|z_t| > z^*` : m`z_t > z^*`}, with ${m`z^* = ${page.z}`}; the first 30 scores are a Welford warm-up, without alarms;`,
          `baselines: <strong>frozen</strong> (Welford, stopped after the ${PHASE1} novice scores), <strong>Welford</strong> (all history), <strong>EW</strong> with ${m`\alpha \in \{${ALPHAS.join(', ')}\}`} (memory about ${m`1/\alpha`} scores);`,
          `repeat for R = ${nice(page.R)} attackers (seed ${run.seed}); the plot shows the first.`,
        ],
        flag: updatingFlag(got), waiting: got.result ? null : pending(got, spec, redraw),
        view: () => {
          const res = got.result, byId = Object.fromEntries(res.table.map((r) => [r.id, r]));
          const { chart, raster } = streamPlot(page, res.first);
          const fr = byId.frozen, wf = byId.welford, ew = byId['ew0.05'];
          return {
            answer: {
              text: `Over ${nice(res.R)} attackers, the frozen baseline flags ${sig(100 * fr.fin, 3)} % of the final expert scores; Welford ${sig(100 * wf.fin, 2)} %, EW 0.05 ${sig(100 * ew.fin, 2)} %. ${page.scenario === 'ramp' ? 'Every adaptive baseline has learned the attacker\'s new behaviour as normal: the ramp poisoned it.' : 'Adaptive baselines react fast to the jump but then absorb it.'} The price of freezing: false alarms in phase 1 at ${sig(100 * fr.fa, 2)} % per score, the same as Welford's (${sig(100 * wf.fa, 2)} %); faster EW baselines are noisier (EW 0.05: ${sig(100 * ew.fa, 2)} %).`,
              ok: false,
            },
            body: [
              ...section(1, 'One attacker, five baselines', `Grey: the scores; shaded: the ${page.scenario === 'ramp' ? 'ramp (yellow) and the ' : ''}final expert phase (orange). Each coloured line is a baseline's threshold ${m`m + z^*\mathrm{sd}`}; below, the moments each baseline raised an alarm.`),
              el('div', { class: 'full-width' }, [figure(chart), raster]),
              el('div', { class: 'row end' }, [svgButton(chart, 'hw05-E9-stream')]),
              ...section(2, `Rates over ${nice(res.R)} attackers`, 'Per-score false-alarm rate in the novice phase (after the warm-up), alarm rate over the final expert scores, and how long it took to notice.'),
              ...studyTable(page, res),
            ],
            rows: res.table.map((r) => ({ ...r })),
            summary: { scenario: page.scenario, T: page.T, zStar: page.z, twoSided: page.two, R: res.R, seed: run.seed, table: res.table },
          };
        },
        why: 'every adaptive baseline eventually treats the attacker\'s new behaviour as normal. An attacker who knows the defender adapts can change slowly enough to be learned rather than detected ("boiling frog"). Welford does it too, not by forgetting but by inflating its variance: the mixed history looks merely "erratic".',
        notes: [
          `${evidenceHtml('T')} Exponentially weighted updates: ${m`d = x - m`}, ${m`m \leftarrow m + \alpha d`}, ${m`v \leftarrow (1-\alpha)(v + \alpha d^2)`}. Welford is the case ${m`\alpha_t = 1/t`}. On stationary data ${m`\operatorname{Var}(m) = \frac{\alpha}{2-\alpha}\sigma^2`}: a fast baseline never settles, so its threshold wobbles and its false alarms rise (EW 0.2 most of all).`,
          `${evidenceHtml('O')} Defences: a frozen or periodically re-validated reference window; two baselines with different memories, alarming when they disagree; limits on how fast the baseline may move; and alarms on the baseline itself drifting. Each trades detection of slow attacks against false alarms from honest drift.`,
          `${evidenceHtml('S')} The same arithmetic runs in real systems: per-host traffic baselines in intrusion detection, login-rate monitors, and side-channel leakage assessment (TVLA), which computes Welch t-statistics from one-pass running means and variances of millions of power traces (Schneider & Moradi, CHES 2015). Poisoning of anomaly detectors: Rubinstein et al., ANTIDOTE, IMC 2009. To be checked in the sources.`,
        ],
      }),
      shapePanel(page),
    ];
  },
});
