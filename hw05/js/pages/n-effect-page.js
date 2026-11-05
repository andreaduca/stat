/* n-effect-page.js — E7: the hacker experiment repeated for n from 2 to 1000.
   The spreads of the sample means and variances fall like 1/n (log-log, with
   fitted slopes); the constant is σ² for the mean whatever the shape, and set
   by the tails for the variance; the clouds narrow around fixed centres; the
   biased SS/n and s converge anyway; and how many systems a defender needs.
   The sweeps run in the Web Worker (nSweep); this file only draws. */

import { el, field, explain } from '../../../assets/js/ui/dom.js';
import { startPage } from '../../../assets/js/ui/page.js';
import { labPanel, section, table } from '../../../assets/js/ui/lab.js';
import { plot } from '../../../assets/js/ui/plot.js';
import { nice } from '../../../assets/js/ui/format.js';
import { show } from '../../../assets/js/ui/dock.js';
import { m, M } from '../../../assets/js/ui/math.js';
import { linFit } from '../../../assets/js/core/numeric.js';
import { ex2Dist, EX2 } from '../core/dists.js';
import { varMean, varS2, meanPlugIn, c4, sampleSizeMean, sampleSizeVar } from '../core/theory.js';
import { readInputs, scoreOf, dock, rejected } from './inputs.js';
import { SIM, THEORY, MUTED, legend, evidenceHtml, figure, svgButton, sig, getRun, pending, updatingFlag } from './widgets.js';
import { hw05Shell, STICKY, MEMORY } from './shell.js';

const DEFAULT_GRID = [2, 3, 5, 10, 20, 50, 100, 200, 500, 1000];
const NAMES = { normal: 'N(0, 1)', exp: 'Exp(1)', unif01: 'U(0, 1)', score: 'score' };
const COLORS = { normal: 'var(--m1)', exp: 'var(--m2)', unif01: 'var(--m3)', score: 'var(--m4)' };

/* ---------- page state: the grid of n ---------- */

function readPage(state) {
  const raw = String(state.grid ?? DEFAULT_GRID.join(','));
  const grid = [...new Set(raw.split(/[\s,;]+/).map(Number).filter((v) => Number.isInteger(v) && v >= 2 && v <= 1000))].sort((a, b) => a - b).slice(0, 14);
  return { grid: grid.length >= 3 ? grid : DEFAULT_GRID };
}

const PAGE = {
  id: 'neffect', label: 'this page',
  build(apply, later) {
    const g = el('input', { type: 'text', class: 'num', style: 'width: 30ch', 'aria-label': 'grid of n' });
    const go = () => apply({ grid: g.value });
    g.addEventListener('change', () => later(go));
    g.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
    return {
      nodes: [el('div', { class: 'row' }, [field('grid of n (2…1000)', g), el('button', { type: 'button', text: 'Default grid', onclick: () => apply({ grid: DEFAULT_GRID.join(',') }) })])],
      refresh(v) { show(g, v.grid.join(', ')); },
    };
  },
  summary: (v) => `n ∈ {${v.grid.join(', ')}}`,
  notes: ['<strong>grid of n</strong>: the numbers of systems per hacker at which the experiment is repeated, each with the dock\'s m hackers and its own random stream. Between 3 and 14 values from 2 to 1 000.'],
};

const sweepOf = (id, run, page) => ({ kind: 'sweep', args: { dist: id === 'score' ? run.spec : { id }, m: run.m, grid: page.grid, seed: run.seed } });
const distOf = (id, run) => ex2Dist(id, { dist: run.dist, p: run.p, a: run.a, b: run.b });

/** Least-squares slope of log₁₀ y on log₁₀ n over the rows with n ≥ 10. */
const slope = (rows, f) => {
  const r = rows.filter((x) => x.n >= 10);
  return r.length >= 2 ? linFit(r.map((x) => Math.log10(x.n)), r.map((x) => Math.log10(f(x)))) : { slope: NaN, slopeSE: NaN };
};

/* ---------- 1. the two laws ---------- */

function laws(run, page, sweep) {
  const d = scoreOf(run), rows = sweep.rows, ns = rows.map((r) => r.n);
  const nLo = ns[0], nHi = ns.at(-1);
  const th = (f) => { const out = []; for (let k = 0; k <= 200; k++) { const n = nLo * (nHi / nLo) ** (k / 200); out.push([n, f(Math.max(2, n))]); } return out; };
  const sM = slope(rows, (r) => r.means.variance), sV = slope(rows, (r) => r.vars.variance);
  const mk = (key, f, title, lab) => plot({
    x: { log: true, min: nLo, max: nHi, title: 'n (systems per hacker)' }, y: { log: true, title }, width: 500, height: 260,
    layers: [
      { type: 'line', points: th(f), color: THEORY, label: `theory ${lab}` },
      { type: 'points', points: rows.map((r) => [r.n, r[key].variance]), err: rows.map((r) => [r.n, r[key].variance - 2 * r[key].seVar, r[key].variance + 2 * r[key].seVar]), color: SIM, r: 3.5, label: `measured, ±2 SE` },
    ],
    label: `log-log plot of the variance of the hackers' ${key === 'means' ? 'sample means' : 'sample variances'} against n, with theory`,
  });
  const pM = mk('means', (n) => varMean(d, n), 'Var(x̄ⱼ)', 'σ²/n'), pV = mk('vars', (n) => varS2(d, n), 'Var(sⱼ²)', 'σ⁴(2/(n−1) + κ/n)');
  const inside = (key, f) => rows.filter((r) => Math.abs(r[key].variance - f(r.n)) <= 3 * r[key].seVar).length;
  return {
    sM, sV,
    nodes: [
      ...section(1, 'Both spreads fall like 1/n', `Each point is the variance, across ${nice(run.m)} hackers, of their ${m`\bar x_j`} (left) or ${m`s_j^2`} (right) at that n, with ±2 standard errors; the solid line is the exact formula. Fitted on ${m`n \ge 10`}: slope ${sig(sM.slope, 3)} ± ${sig(sM.slopeSE, 1)} for the means, ${sig(sV.slope, 3)} ± ${sig(sV.slopeSE, 1)} for the variances (theory −1). The variance curve bends at small n, where ${m`2/(n-1)`} explodes.`),
      el('div', { class: 'cols' }, [
        figure(pM, `${inside('means', (n) => varMean(d, n))} of ${rows.length} points within 3 SE of ${m`\sigma^2/n`}.`),
        figure(pV, `${inside('vars', (n) => varS2(d, n))} of ${rows.length} points within 3 SE of ${m`\sigma^4\left(\frac{2}{n-1} + \frac{\kappa}{n}\right)`}.`),
      ]),
      el('div', { class: 'row end' }, [svgButton(pM, 'hw05-E7-var-means'), svgButton(pV, 'hw05-E7-var-vars')]),
      legend([['dot', SIM, 'measured (± 2 SE)'], ['line', THEORY, 'exact formula']]),
    ],
  };
}

/* ---------- 2. same law, different constants ---------- */

function shapes(run, page, sweeps) {
  const ns = page.grid, nLo = ns[0], nHi = ns.at(-1);
  const layersFor = (key) => EX2.flatMap((id, i) => {
    const d = distOf(id, run), rows = sweeps[i].result.rows;
    const scale = key === 'means' ? (r) => (r.n * r.means.variance) / d.variance : (r) => (r.n * r.vars.variance) / d.variance ** 2;
    const theory = key === 'means' ? () => 1 : (n) => n * (2 / (n - 1) + d.exKurtosis / n);
    const pts = []; for (let k = 0; k <= 120; k++) { const n = nLo * (nHi / nLo) ** (k / 120); pts.push([n, theory(Math.max(2, n))]); }
    return [
      { type: 'line', points: pts, color: COLORS[id], dash: '5 4', thin: true, hover: false },
      { type: 'points', points: rows.map((r) => [r.n, scale(r)]), color: COLORS[id], r: 3, label: id === 'score' ? d.label() : NAMES[id] },
      { type: 'line', points: rows.map((r) => [r.n, scale(r)]), color: COLORS[id], thin: true, label: id === 'score' ? d.label() : NAMES[id], end: id === 'score' ? 'score' : NAMES[id] },
    ];
  });
  const pM = plot({ x: { log: true, min: nLo, max: nHi, title: 'n' }, y: { min: 0, max: 2, title: 'n·Var(x̄ⱼ)/σ²' }, width: 500, height: 260,
    layers: [...layersFor('means')], label: 'n times the variance of the sample means over sigma squared, for four distributions' });
  const pV = plot({ x: { log: true, min: nLo, max: nHi, title: 'n' }, y: { min: 0, title: 'n·Var(sⱼ²)/σ⁴' }, width: 500, height: 260,
    layers: [...layersFor('vars')], label: 'n times the variance of the sample variances over sigma to the fourth, for four distributions' });
  return [
    ...section(2, 'Same 1/n, different constants', `Multiply each spread by n and divide by the scale (${m`\sigma^2`} or ${m`\sigma^4`}): what is left is the constant in front of 1/n. For the mean it is 1 for every shape: the four curves coincide. For the variance it tends to ${m`2 + \kappa`}: the curves separate by their tails (dashed: exact). Here ${EX2.map((id) => `${id === 'score' ? distOf(id, run).label() : NAMES[id]} ${sig(2 + distOf(id, run).exKurtosis, 3)}`).join(', ')}.`),
    el('div', { class: 'cols' }, [figure(pM), figure(pV)]),
    el('div', { class: 'row end' }, [svgButton(pM, 'hw05-E7-shapes-means'), svgButton(pV, 'hw05-E7-shapes-vars')]),
  ];
}

/* ---------- 3. the clouds narrow ---------- */

/** A box strip per n: whiskers 5–95 %, box 25–75 %, a tick at the median, on a log n axis. */
function boxStrip(rows, key, centre, yTitle, label) {
  const W = 500, H = 240, pad = { l: 52, r: 12, t: 12, b: 36 };
  const NS = 'http://www.w3.org/2000/svg';
  const node = (tag, a, text) => { const n = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(a)) n.setAttribute(k, v); if (text !== undefined) n.textContent = text; return n; };
  const qs = rows.map((r) => r[key]);
  const lo = Math.min(...qs.map((q) => q[0]), centre), hi = Math.max(...qs.map((q) => q[4]), centre);
  const n0 = rows[0].n, n1 = rows.at(-1).n;
  const X = (n) => pad.l + ((Math.log(n) - Math.log(n0)) / (Math.log(n1) - Math.log(n0) || 1)) * (W - pad.l - pad.r - 20) + 10;
  const Y = (v) => pad.t + (1 - (v - lo) / (hi - lo || 1)) * (H - pad.t - pad.b);
  const svg = node('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', class: 'boxes', 'aria-label': label });
  // round tick values: a step of 1, 2 or 5 × 10ᵏ giving about four ticks
  const raw = (hi - lo) / 4, p10 = 10 ** Math.floor(Math.log10(raw)), step = [1, 2, 5, 10].map((f) => f * p10).find((v) => v >= raw * 0.7);
  for (let v = Math.ceil(lo / step) * step; v <= hi + step * 1e-9; v += step) {
    svg.append(node('line', { class: 'grid', x1: pad.l, x2: W - pad.r, y1: Y(v), y2: Y(v) }));
    svg.append(node('text', { class: 'tick', x: pad.l - 6, y: Y(v) + 4, 'text-anchor': 'end' }, String(+v.toFixed(10))));
  }
  svg.append(node('line', { class: 'centre', x1: pad.l, x2: W - pad.r, y1: Y(centre), y2: Y(centre) }));
  rows.forEach((r) => {
    const [q05, q25, q50, q75, q95] = r[key], x = X(r.n), w = 14;
    svg.append(node('line', { class: 'whisker', x1: x, x2: x, y1: Y(q05), y2: Y(q95) }));
    svg.append(node('rect', { class: 'box', x: x - w / 2, y: Y(q75), width: w, height: Math.max(1, Y(q25) - Y(q75)) }));
    svg.append(node('line', { class: 'median', x1: x - w / 2, x2: x + w / 2, y1: Y(q50), y2: Y(q50) }));
    svg.append(node('text', { class: 'tick', x, y: H - pad.b + 16, 'text-anchor': 'middle' }, String(r.n)));
  });
  svg.append(node('text', { class: 'axis-ttl', x: (pad.l + W) / 2, y: H - 4, 'text-anchor': 'middle' }, 'n (systems per hacker)'));
  svg.append(node('text', { class: 'axis-ttl', x: 4, y: 10 }, yTitle));
  const wrap = el('div', { class: 'chart' }, [svg]);
  return wrap;
}

function clouds(run, sweep) {
  const d = scoreOf(run), rows = sweep.rows;
  const a = boxStrip(rows, 'qMeans', d.mean, 'x̄ⱼ', 'box plots of the hackers\' sample means at each n');
  const b = boxStrip(rows, 'qVars', d.variance, 'sⱼ²', 'box plots of the hackers\' sample variances at each n');
  return [
    ...section(3, 'The clouds narrow around fixed centres', `For each n: the middle half of the ${nice(run.m)} hackers (box), the median (bar) and 90 % of them (whisker 5–95 %); the line is ${m`\mu`} (left) or ${m`\sigma^2`} (right). The centres do not move with n; only the spread does.`),
    el('div', { class: 'cols' }, [figure(a), figure(b)]),
    el('div', { class: 'row end' }, [svgButton(a, 'hw05-E7-box-means'), svgButton(b, 'hw05-E7-box-vars')]),
  ];
}

/* ---------- 4. the bias that vanishes ---------- */

function bias(run, sweep) {
  const d = scoreOf(run), rows = sweep.rows, nLo = rows[0].n, nHi = rows.at(-1).n;
  const pts = []; for (let k = 0; k <= 160; k++) { const n = nLo * (nHi / nLo) ** (k / 160); pts.push([n, (n - 1) / n]); }
  const c4pts = pts.map(([n]) => [n, c4(Math.max(2, n))]);
  const node = plot({
    x: { log: true, min: nLo, max: nHi, title: 'n' }, y: { min: Math.min(0.45, ...rows.map((r) => r.plugIn.mean / d.variance)) - 0.02, max: 1.06, title: 'average / truth' }, width: 620, height: 260,
    layers: [
      { type: 'hline', at: 1, color: 'var(--ink)', dash: false, text: 'unbiased', anchor: 'start' },
      { type: 'line', points: pts, color: THEORY, dash: '5 4', label: '(n − 1)/n', end: '(n−1)/n' },
      { type: 'line', points: c4pts, color: MUTED, dash: '2 3', label: 'c₄(n), normal data only', end: 'c₄(n), normal' },
      { type: 'points', points: rows.map((r) => [r.n, r.plugIn.mean / d.variance]), err: rows.map((r) => [r.n, (r.plugIn.mean - 2 * r.plugIn.seMean) / d.variance, (r.plugIn.mean + 2 * r.plugIn.seMean) / d.variance]), color: 'var(--m2)', r: 3.5, label: 'average SS/n ÷ σ²' },
      { type: 'points', points: rows.map((r) => [r.n, r.sds.mean / d.sd]), err: rows.map((r) => [r.n, (r.sds.mean - 2 * r.sds.seMean) / d.sd, (r.sds.mean + 2 * r.sds.seMean) / d.sd]), color: 'var(--m1)', r: 3.5, hollow: true, label: 'average s ÷ σ' },
    ],
    label: 'averages of SS over n and of s relative to sigma squared and sigma, against n',
  });
  const r2 = rows[0];
  return [
    ...section(4, 'Biased, but consistent', `The divisor-n variance averages ${m`\frac{n-1}{n}\sigma^2`}: at n = ${r2.n} it reports ${sig(r2.plugIn.mean / d.variance, 3)}·σ². The sample SD ${m`s`} is biased low too (Jensen), by ${sig(100 * (1 - r2.sds.mean / d.sd), 2)} % at n = ${r2.n}. Both biases vanish as n grows: biased but consistent estimators.`),
    figure(node, `Filled: ${m`\overline{\mathrm{SS}/n}/\sigma^2`}; hollow: ${m`\bar s/\sigma`}; dashed: ${m`(n-1)/n`}; dotted: ${m`c_4(n)`}, the exact factor for normal data (the score is not normal, so it is a guide only).`),
    legend([['dot', 'var(--m2)', 'average SS/n ÷ σ²'], ['dot', 'var(--m1)', 'average s ÷ σ'], ['dash', THEORY, '(n − 1)/n'], ['dash', MUTED, 'c₄(n), normal']]),
  ];
}

/* ---------- 5. how many systems ---------- */

let calc = { h: 0.1, r: 0.1, level: 0.95 };   // the calculator's own inputs, kept across redraws
function calculator(run) {
  const d = scoreOf(run);
  const out = el('div');
  const draw = () => {
    const nM = sampleSizeMean(d.sd, calc.h, calc.level), nV = sampleSizeVar(d.exKurtosis, calc.r, calc.level);
    out.replaceChildren(table(['to estimate one hacker\'s …', 'within', 'systems needed', 'from'], [
      ['mean score', `± ${calc.h}`, nice(nM), el('span', { html: m`n = \left(z\,\sigma/h\right)^2` })],
      ['variance (consistency)', `± ${Math.round(calc.r * 100)} %`, nice(nV), el('span', { html: m`n \approx z^2 (2+\kappa)/r^2` })],
    ], 'cmp'));
  };
  const num = (key, attrs) => el('input', { type: 'number', class: 'num', value: calc[key], ...attrs, oninput: (e) => { const v = Number(e.target.value); if (v > 0 && v < (key === 'level' ? 1 : Infinity)) { calc = { ...calc, [key]: v }; draw(); } } });
  draw();
  return el('div', { class: 'card' }, [
    el('h2', { text: 'How many systems must a defender watch?' }),
    el('p', { html: `For ${d.label()} (${m`\sigma = ${sig(d.sd, 4)}`}, ${m`\kappa = ${sig(d.exKurtosis, 3)}`}): the number of systems one hacker must be observed on to pin down their mean to ±h, or their variance to ±r (relative), with the chosen confidence.` }),
    el('div', { class: 'row' }, [
      field('h (score points)', num('h', { min: 0.001, step: 0.05, 'aria-label': 'half-width h for the mean' })),
      field('r (relative, 0.1 = 10 %)', num('r', { min: 0.001, step: 0.05, 'aria-label': 'relative half-width r for the variance' })),
      field('confidence', num('level', { min: 0.5, max: 0.999, step: 0.01, 'aria-label': 'confidence level' })),
    ]),
    out,
    explain([
      `${evidenceHtml('T')} From ${m`\mathrm{SE}(\bar x) = \sigma/\sqrt{n}`}: a half-width ${m`h = z\sigma/\sqrt{n}`} needs ${m`n = (z\sigma/h)^2`}. For the variance, the relative SD of ${m`s^2`} is ${m`\sqrt{2/(n-1) + \kappa/n} \approx \sqrt{(2+\kappa)/n}`}, so ${m`n \approx z^2(2+\kappa)/r^2`}: an asymptotic formula that ignores the small-n term (note 04 §3, which rounds z to 2).`,
      `${evidenceHtml('T')} More hackers ${m`m`} does not help in judging <em>one</em> hacker: it sharpens only the population averages (SE ${m`\propto 1/\sqrt{m}`}). Two questions, two sample sizes.`,
      `${evidenceHtml('O')} Defender takeaway: ranking or profiling attackers from a handful of observed attempts is statistically fragile, especially on <em>variability</em> ("erratic" against "consistent"), which needs several times more observations than the mean. Calibrate claims to n.`,
    ]),
  ]);
}

startPage({
  shell: hw05Shell('n-effect.html'),
  sticky: STICKY,
  memory: MEMORY,
  preserve: true,
  render: (api) => {
    const { state, update } = api;
    const run = readInputs(state), page = readPage(state);
    dock(run, update, PAGE, page);
    if (run.error) return [rejected(run.error)];
    const redraw = () => api.draw();
    const mainSpec = sweepOf('score', run, page);
    const main = getRun(mainSpec, redraw, 'main');
    const specs = EX2.map((id) => sweepOf(id, run, page));
    const sweeps = specs.map((sp, i) => getRun(sp, redraw, `shape-${EX2[i]}`));
    const all = [main, ...sweeps], allSpecs = [mainSpec, ...specs], wi = all.findIndex((g) => !g.result);
    const d = scoreOf(run);
    return [
      labPanel({
        hw: 'hw05', id: 'E7', title: 'E7 · The effect of n on the variability', name: `E7-${run.dist}-m${run.m}-seed${run.seed}`,
        question: `As each of ${nice(run.m)} hackers attacks more systems, how fast do the sample means and variances stop scattering, and what sets the speed?`,
        steps: [
          `for each n in {${page.grid.join(', ')}}, run the experiment of the Hackers page: ${nice(run.m)} hackers × n systems, scores from ${d.label()}, Welford per hacker (an independent stream per n);`,
          `at each n measure the variance of the ${m`\bar x_j`} and of the ${m`s_j^2`} across hackers, with their standard errors, and the averages of ${m`\mathrm{SS}_j/n`} and ${m`s_j`};`,
          `plot against n on log-log axes and fit a line on ${m`n \ge 10`}; repeat for the four shapes of Ex. 2.`,
        ],
        flag: updatingFlag(all.find((g) => g.stale)),
        waiting: wi >= 0 ? pending(all[wi], allSpecs[wi], redraw) : null,
        view: () => {
          const L = laws(run, page, main.result);
          const ok = Math.abs(L.sM.slope + 1) <= 0.05 && Math.abs(L.sV.slope + 1) <= 0.05;
          return {
            answer: {
              text: `Both spreads fall like 1/n: fitted slopes ${sig(L.sM.slope, 3)} for the variance of the ${m`\bar x_j`} and ${sig(L.sV.slope, 3)} for that of the ${m`s_j^2`} (theory −1). The constants differ: ${m`\sigma^2 = ${sig(d.variance, 4)}`} for the mean, whatever the shape; about ${m`(2+\kappa)\sigma^4 = ${sig((2 + d.exKurtosis) * d.variance ** 2, 4)}`} for the variance, set by the tails. At n = ${page.grid[0]} one hacker's ${m`s^2`} has a relative SD of ${sig(Math.sqrt(varS2(d, page.grid[0])) / d.variance, 3)}.`,
              ok,
            },
            body: [...L.nodes, ...shapes(run, page, sweeps), ...clouds(run, main.result), ...bias(run, main.result)],
            rows: main.result.rows.map((r) => ({ n: r.n, var_means: r.means.variance, se_var_means: r.means.seVar, var_vars: r.vars.variance, se_var_vars: r.vars.seVar, mean_plugIn: r.plugIn.mean, mean_s: r.sds.mean })),
            summary: { distribution: d.label(), m: run.m, grid: page.grid, seed: run.seed, slopeMeans: L.sM, slopeVars: L.sV },
          };
        },
        why: 'n is the defender\'s sample size for one attacker. These laws say how much each extra observed system is worth, and that the answer is different for "how good is this attacker" (the mean) and "how erratic" (the variance).',
        notes: [
          `${evidenceHtml('T')} ${m`\operatorname{Var}(\bar x_j) = \sigma^2/n`} and ${m`\operatorname{Var}(s_j^2) = \sigma^4\left(\frac{2}{n-1} + \frac{\kappa}{n}\right)`}: centres do not move with n, spreads shrink like 1/n (SD like ${m`1/\sqrt{n}`}). On log-log axes both are lines of slope −1; the variance bends upward at small n.`,
          `The error bars are ${m`\mathrm{SE}(\hat V) = \hat V\sqrt{2/(m-1) + g_2/m}`} with ${m`g_2`} the measured excess kurtosis of the ${nice(run.m)} values: for ${m`s_j^2`} at small n that kurtosis is large, so the bars are wide there.`,
          'Each n has its own random stream, so the points are independent (unlike HW4, where one set of attackers was followed to larger n) and the fitted slope\'s standard error is meaningful.',
        ],
      }),
      calculator(run),
    ];
  },
});
