/* hackers-page.js — the experiment: HW4's penetration model with 0–10
   scores. m hackers attack n systems each; Welford per hacker gives x̄ⱼ and
   sⱼ²; their averages across hackers are compared with μ and σ² (E5). Then
   hackers who differ (novices and experts): the average sⱼ² finds only the
   within-group variance, and the spread of the x̄ⱼ reveals the skill gap (E6).
   The runs are in the Web Worker (hackerExperiment); this file only draws. */

import { el, field, explain } from '../../../assets/js/ui/dom.js';
import { startPage } from '../../../assets/js/ui/page.js';
import { labPanel, section, table } from '../../../assets/js/ui/lab.js';
import { plot } from '../../../assets/js/ui/plot.js';
import { nice } from '../../../assets/js/ui/format.js';
import { show, setValue } from '../../../assets/js/ui/dock.js';
import { m, M } from '../../../assets/js/ui/math.js';
import { normPdf } from '../../../assets/js/core/numeric.js';
import { moments } from '../../../assets/js/core/stats.js';
import { RunningStats, TracedRunningStats } from '../core/running.js';
import { Mixture } from '../core/dists.js';
import { varMean, varS2, meanPlugIn, seAvgMean, seAvgS2, seAvgPlugIn, compare, seOfVariance } from '../core/theory.js';
import { readInputs, scoreOf, dock, rejected } from './inputs.js';
import {
  SIM, THEORY, MUTED, legend, evidenceHtml, figure, svgButton, sig, compareRow, COMPARE_HEAD,
  getRun, pending, updatingFlag, histogram, curve, quantile,
} from './widgets.js';
import { hw05Shell, STICKY, MEMORY } from './shell.js';

/* ---------- page state: the mixture's share of novices, the hacker whose trace is shown ---------- */

function readPage(state) {
  const pi = Math.min(1, Math.max(0, Number.isFinite(Number(state.pi)) && state.pi !== undefined && state.pi !== '' ? Number(state.pi) : 0.7));
  const h = Math.max(0, Math.min(49, Math.round(Number(state.h) || 0)));
  return { pi: Math.round(pi * 100) / 100, h };
}

const PAGE = {
  id: 'hackers', label: 'this page',
  build(apply) {
    const out = el('span', { class: 'eq' });
    const pi = el('input', { type: 'range', min: 0, max: 1, step: 0.05, 'aria-label': 'share of novices pi in E6',
      oninput: (e) => { out.textContent = `π = ${Number(e.target.value).toFixed(2)}`; setValue('hackers', { pi: Number(e.target.value) }); },
      onchange: (e) => apply({ pi: e.target.value }) });
    return {
      nodes: [el('div', { class: 'row' }, [field('E6 share of novices π', pi), out])],
      refresh(v) { show(pi, v.pi); out.textContent = `π = ${v.pi.toFixed(2)}`; },
    };
  },
  summary: (v) => `E6: π = ${Number(v.pi).toFixed(2)} novices`,
  notes: ['<strong>π</strong>: in E6, the share of hackers who are novices (scores 10·Beta(2, 5)); the rest are experts (10·Beta(5, 2)). Every one of a hacker\'s n scores comes from their own group. π = 0 or 1 gives identical hackers again. The run starts when the slider is released.'],
};

/* ---------- E5: the main experiment ---------- */

/** The first 50 hackers × 50 systems as a heat strip; a click on a row shows that hacker's trace. */
function heatStrip(res, h, update) {
  const [kh, kn] = res.heatShape, cell = 11, pad = 34;
  const W = pad + kn * cell + 4, H = 14 + kh * cell + 22;
  const NS = 'http://www.w3.org/2000/svg';
  const node = (tag, a, text) => { const n = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(a)) n.setAttribute(k, v); if (text) n.textContent = text; return n; };
  const svg = node('svg', { viewBox: `0 0 ${W} ${H}`, width: Math.round(W * 1.25), height: Math.round(H * 1.25), role: 'img', class: 'heat', 'aria-label': `scores of the first ${kh} hackers on the first ${kn} systems, coloured from 0 (light) to 10 (dark); click a row to see that hacker's trace` });
  svg.append(node('text', { class: 'tick', x: pad, y: 10 }, `system 1 … ${kn} →`));
  for (let j = 0; j < kh; j++) {
    const row = node('g', { class: `row${j === h ? ' sel' : ''}`, tabindex: '0', role: 'button', 'aria-label': `hacker ${j + 1}` });
    for (let i = 0; i < kn; i++) {
      const v = res.heat[j * kn + i];
      row.append(node('rect', { x: pad + i * cell, y: 14 + j * cell, width: cell - 1, height: cell - 1, style: `fill: color-mix(in srgb, var(--s1) ${Math.round(v * 10)}%, var(--panel))` }));
    }
    if (j % 5 === 0 || j === h) row.append(node('text', { class: 'tick', x: pad - 4, y: 14 + j * cell + 9, 'text-anchor': 'end' }, String(j + 1)));
    row.addEventListener('click', () => update({ h: j }));
    row.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); update({ h: j }); } });
    svg.append(row);
  }
  svg.append(node('text', { class: 'tick', x: pad, y: H - 4 }, '0 ▢ light … dark ■ 10'));
  return svg;
}

/** One hacker's stream through Welford: running mean and band, and the first and last trace rows. */
function hackerTrace(res, d, h, n) {
  const sn = res.streamShape[1], xs = res.streams.subarray(h * sn, (h + 1) * sn);
  const t = new TracedRunningStats();
  for (const x of xs) t.push(x);
  const tr = t.trace;
  const pts = tr.map((r) => [r.k, r.mean]);
  const band = tr.filter((r) => r.k > 1).map((r) => { const s = Math.sqrt(r.ss / (r.k - 1)); return [r.k, r.mean - s, r.mean + s]; });
  const chart = plot({
    x: { log: n > 60, min: 1, max: n, title: `system k (hacker ${h + 1})` }, y: { min: 0, max: 10, title: 'score' }, width: 520, height: 230,
    layers: [
      { type: 'points', points: tr.map((r) => [r.k, r.x]), color: MUTED, r: 2, label: 'score' },
      { type: 'band', band, color: SIM, label: 'Mₖ ± sₖ' },
      { type: 'hline', at: d.mean, color: THEORY, dash: false, text: 'μ', anchor: 'start' },
      { type: 'line', points: pts, color: SIM, label: 'running mean' },
    ],
    label: `hacker ${h + 1}: scores and running mean with one running standard deviation`,
  });
  const show = tr.length <= 12 ? tr : [...tr.slice(0, 8), null, ...tr.slice(-2)];
  const rows = show.map((r) => (r ? [String(r.k), sig(r.x, 4), sig(r.d, 4), sig(r.mean, 4), sig(r.ss, 5), r.k > 1 ? sig(r.ss / (r.k - 1), 4) : '—'] : ['…', '', '', '', '', '']));
  const last = tr.at(-1), s2 = last.ss / (last.k - 1);
  return [
    figure(chart, `Hacker ${h + 1}: ${m`\bar x_{${h + 1}} = ${sig(last.mean)}`}, ${m`s_{${h + 1}}^2 = ${sig(s2)}`}, standard error of the mean ${m`s/\sqrt{n} = ${sig(Math.sqrt(s2 / n), 3)}`}${n < res.n ? '' : ''}.`),
    table([m`k`, m`x_k`, m`d_k`, m`M_k`, m`S_k`, m`s_k^2`], rows),
  ];
}

function e5View(run, page, got, update) {
  const d = scoreOf(run), n = run.n, mm = run.m, res = got.result, mom = res.mom;
  const cM = compare(mom.means.mean, d.mean, seAvgMean(d, n, mm));
  const cV = compare(mom.vars.mean, d.variance, seAvgS2(d, n, mm));
  const cP = compare(mom.plugIn.mean, meanPlugIn(d, n), seAvgPlugIn(d, n, mm));
  const VxT = varMean(d, n), VsT = varS2(d, n);
  const cVx = compare(mom.means.variance, VxT, seOfVariance(VxT, mm, d.exKurtosis / n));
  const cVs = compare(mom.vars.variance, VsT, seOfVariance(VsT, mm, mom.vars.exKurtosis));
  const rows = [
    compareRow(`${m`\overline{\bar x}`} vs ${m`\mu`}`, cM),
    compareRow(`${m`\overline{s^2}`} vs ${m`\sigma^2`}`, cV),
    compareRow(`${m`\overline{\mathrm{SS}/n}`} vs ${m`\frac{n-1}{n}\sigma^2`}`, cP),
    compareRow(`variance of the ${m`\bar x_j`} vs ${m`\sigma^2/n`}`, cVx),
    compareRow(`variance of the ${m`s_j^2`} vs ${m`\operatorname{Var}(s^2)`}`, cVs),
  ];
  // histograms
  const sdx = Math.sqrt(VxT);
  const xLo = Math.max(0, d.mean - 4.5 * sdx), xHi = Math.min(10, d.mean + 4.5 * sdx);
  const meansHist = histogram({ values: res.means, lo: xLo, hi: xHi, bins: 40, width: 480, height: 230, xTitle: `x̄ⱼ (mean of a hacker's ${n} scores)`,
    curves: [{ f: (x) => normPdf((x - d.mean) / sdx) / sdx, label: 'N(μ, σ²/n)' }], refs: [{ at: d.mean }],
    label: `histogram of the ${mm} hackers' sample means against the normal density` });
  const vHi = Math.max(quantile(res.vars, 0.995), d.variance * 2);
  const varsHist = histogram({ values: res.vars, lo: 0, hi: vHi, bins: 40, width: 480, height: 230, xTitle: `sⱼ² (variance of a hacker's ${n} scores)`,
    refs: [{ at: d.variance }, { at: mom.vars.mean, color: 'var(--ink)', dash: '4 3' }],
    label: `histogram of the ${mm} hackers' sample variances, with sigma squared and their average` });
  const relOne = Math.sqrt(VsT) / d.variance, relAvg = Math.sqrt(VsT / mm) / d.variance;
  const ok = cM.ok && cV.ok && cP.ok;
  return {
    answer: {
      text: `Across m = ${nice(mm)} hackers with n = ${n} systems each, ${m`\overline{\bar x} = ${sig(mom.means.mean)}`} against ${m`\mu = ${sig(d.mean)}`} (z = ${cM.z.toFixed(2)}) and ${m`\overline{s^2} = ${sig(mom.vars.mean)}`} against ${m`\sigma^2 = ${sig(d.variance)}`} (z = ${cV.z.toFixed(2)}): ${ok ? 'no systematic error' : 'a difference beyond 3 SE: try another seed'}. One hacker's ${m`s_j^2`} is off by about ${sig(100 * relOne, 2)} % (relative SD); the average over the ${nice(mm)} by about ${sig(100 * relAvg, 2)} %.`,
      ok,
    },
    body: [
      ...section(1, 'The scores', `The first ${res.heatShape[0]} hackers × ${res.heatShape[1]} systems, one cell per attempt, darker = higher score. Click a row (or focus it and press Enter) to follow that hacker through Welford below.`),
      el('div', { class: 'cols wide-first' }, [
        el('div', { class: 'scroll-x' }, [heatStrip(res, page.h, update)]),
        el('div', {}, hackerTrace(res, d, page.h, Math.min(n, res.streamShape[1]))),
      ]),
      ...section(2, el('span', { html: `Where the ${m`\bar x_j`} and the ${m`s_j^2`} land` }), `Left: the hackers' sample means against ${m`N(\mu, \sigma^2/n)`}. Right: their sample variances, with ${m`\sigma^2`} (solid) and their average (dashed); the two lines nearly coincide, although single values scatter widely${d.skewness > 0 ? ', with a right tail' : ''}.`),
      el('div', { class: 'cols' }, [figure(meansHist), figure(varsHist)]),
      legend([['bar', SIM, `${nice(mm)} hackers`], ['line', THEORY, 'theory: N(μ, σ²/n); μ and σ²'], ['dash', 'var(--ink)', 'average of the sⱼ²']]),
      el('div', { class: 'row end' }, [svgButton(meansHist, 'hw05-E5-means'), svgButton(varsHist, 'hw05-E5-vars')]),
      ...section(3, 'Measured against theory', `Averages compared in units of their standard error; spreads compared with ${m`\operatorname{SE}(\hat V) \approx V\sqrt{2/(m-1) + \kappa_T/m}`}, where ${m`\kappa_T`} is the excess kurtosis of the statistic itself (${m`\kappa/n`} for ${m`\bar x_j`}, measured for ${m`s_j^2`}).`),
      table(COMPARE_HEAD, rows, 'cmp'),
      conclusions(d, run, mom, cM, cV, cP, relOne, relAvg),
    ],
    rows: [['mean', cM], ['s2', cV], ['plugIn', cP], ['var_of_means', cVx], ['var_of_s2', cVs]].map(([k, c]) => ({ statistic: k, ...c })),
    summary: { distribution: d.label(), m: mm, n, seed: run.seed, mean: cM, s2: cV, plugIn: cP, varOfMeans: cVx, varOfS2: cVs },
  };
}

function conclusions(d, run, mom, cM, cV, cP, relOne, relAvg) {
  const n = run.n;
  return el('div', { class: 'conclusions' }, [
    el('h3', { class: 'section', text: 'Conclusions' }),
    el('ol', {}, [
      el('li', { html: `${evidenceHtml('T')} ${evidenceHtml('M')} <strong>No systematic error, at every n.</strong> Measured here at n = ${n}: ${m`\overline{\bar x}`} and ${m`\overline{s^2}`} are within ${Math.max(Math.abs(cM.z), Math.abs(cV.z)).toFixed(1)} standard errors of ${m`\mu`} and ${m`\sigma^2`}. Try n = 2 in the dock: still unbiased. The divisor-n version misses by ${m`\sigma^2/n = ${sig(d.variance / n, 3)}`} (measured ${sig(d.variance - mom.plugIn.mean, 3)}).` }),
      el('li', { html: `${evidenceHtml('T')} <strong>One hacker tells you little; many hackers tell you a lot.</strong> One ${m`s_j^2`} from ${n} systems has a relative SD of ${sig(100 * relOne, 2)} %; the average over ${nice(run.m)} hackers, ${sig(100 * relAvg, 2)} %. Pooling unbiased estimates is what makes small samples useful.` }),
      el('li', { html: `${evidenceHtml('T')} <strong>The two averages answer different questions.</strong> ${m`\overline{\bar x}`} is the typical success level of the population; ${m`\overline{s^2}`} is the typical <em>inconsistency</em> of one hacker across systems.` }),
      el('li', { html: `${evidenceHtml('M')} <strong>The comparison is also a test of the i.i.d. assumption.</strong> If hackers were identical, the variance of the ${m`\bar x_j`} across hackers should be ${m`\approx \overline{s^2}/n`}: here ${sig(mom.means.variance, 3)} against ${sig(mom.vars.mean / n, 3)}, a ratio of ${sig(mom.means.variance / (mom.vars.mean / n), 3)}. E6 shows what a ratio far from 1 means.` }),
    ]),
    explain([
      `<strong>Why it is useful in inference</strong> (note 03 §5). A defender can estimate a hacker's skill ${m`\bar x_j`} and consistency ${m`s_j`}, with a standard error ${m`s_j/\sqrt{n}`} that says how many systems must be observed before ranking attackers (Effect of n page). Pooling across hackers estimates population parameters, as threat-intelligence aggregates do. Comparing spreads detects structure: different groups (E6), a hacker who changes (Anomalies page). And Welford lets all of this run online, three numbers per attacker, without storing the attack logs.`,
      `${evidenceHtml('O')} The score distribution is a modelling assumption, not data. Change it in the dock: the averages stay unbiased for every shape, while the spread of ${m`s_j^2`} changes with the kurtosis (${m`\kappa = ${sig(d.exKurtosis, 3)}`} now).`,
    ], 'Why this matters for inference, and what is assumed'),
  ]);
}

/* ---------- E6: novices and experts ---------- */

function e6View(run, page, got, iid) {
  const n = run.n, mm = run.m, res = got.result, mom = res.mom, d = new Mixture(page.pi);
  const [nov, exp] = d.components;
  const piHat = 1 - res.groups.reduce((s, g) => s + g, 0) / mm;
  const dHat = new Mixture(piHat);
  const Vx = d.varOfMeans(n);
  const cW = compare(mom.vars.mean, d.within, mom.vars.sd / Math.sqrt(mm));
  const cT = compare(mom.vars.mean, d.variance, mom.vars.sd / Math.sqrt(mm));
  const cVx = compare(mom.means.variance, Vx, seOfVariance(Vx, mm, mom.means.exKurtosis));
  const cVxHat = compare(mom.means.variance, dHat.varOfMeans(n), seOfVariance(dHat.varOfMeans(n), mm, mom.means.exKurtosis));
  const F = mom.means.variance / (mom.vars.mean / n), Fiid = iid ? iid.mom.means.variance / (iid.mom.vars.mean / n) : NaN;
  const rows = [
    compareRow(`${m`\overline{s^2}`} vs the <em>within</em> variance ${m`\mathbb{E}[v(G)]`}`, cW),
    compareRow(`${m`\overline{s^2}`} vs the <em>total</em> variance ${m`\sigma^2`}`, cT),
    compareRow(`variance of the ${m`\bar x_j`} vs ${m`\text{between} + \text{within}/n`}`, cVx),
    compareRow(`same, with the drawn share ${m`\hat\pi = ${sig(piHat, 4)}`}`, cVxHat),
  ];
  const sdN = Math.sqrt(nov.variance / n), sdE = Math.sqrt(exp.variance / n);
  const mix = (x) => page.pi * normPdf((x - nov.mean) / sdN) / sdN + (1 - page.pi) * normPdf((x - exp.mean) / sdE) / sdE;
  const hist = histogram({ values: res.means, lo: 0, hi: 10, bins: 60, width: 520, height: 240, xTitle: `x̄ⱼ (mean of a hacker's ${n} scores)`,
    curves: [{ f: mix, label: 'π·N(μ_N, σ_N²/n) + (1−π)·N(μ_E, σ_E²/n)' }], refs: [{ at: nov.mean, text: 'novices' }, { at: exp.mean, text: 'experts' }],
    label: 'histogram of the sample means under the novice and expert mixture, against the two-normal approximation' });
  const parts = table(['', 'theory', 'what it is'], [
    [el('span', { html: m`\text{within} = \pi\sigma_N^2 + (1-\pi)\sigma_E^2` }), sig(d.within), 'the average spread inside a group'],
    [el('span', { html: m`\text{between} = \pi(1-\pi)(\mu_E - \mu_N)^2` }), sig(d.between), 'the spread of the group means'],
    [el('span', { html: m`\sigma^2 = \text{within} + \text{between}` }), sig(d.variance), 'the variance of one random score'],
    [el('span', { html: m`\operatorname{Var}(\bar x_j) = \text{between} + \text{within}/n` }), sig(Vx), `at n = ${n}`],
  ], 'cmp roles');
  const heterogeneous = page.pi > 0 && page.pi < 1;
  return {
    answer: {
      text: heterogeneous
        ? `With ${Math.round(page.pi * 100)} % novices, the average sample variance is ${sig(mom.vars.mean)}: the within variance ${sig(d.within)}, not the total ${sig(d.variance)}. The sample means spread with variance ${sig(mom.means.variance)}, ${sig(F, 3)} times the ${m`\overline{s^2}/n = ${sig(mom.vars.mean / n, 3)}`} expected if the hackers were identical (identical hackers above: ${sig(Fiid, 3)}). The excess is the skill gap.`
        : `π = ${page.pi}: everybody is in one group, the hackers are identical again, and the ratio is ${sig(F, 3)} ≈ 1.`,
      ok: true,
    },
    body: [
      ...section(1, 'The two kinds of variance', `By the law of total variance a score's variance splits into the spread within each group and the spread between the group means. Novices ${m`10\cdot\mathrm{Beta}(2,5)`}: ${m`\mu_N = ${sig(nov.mean, 4)}`}, ${m`\sigma_N^2 = ${sig(nov.variance, 4)}`}; experts ${m`10\cdot\mathrm{Beta}(5,2)`}: ${m`\mu_E = ${sig(exp.mean, 4)}`}, ${m`\sigma_E^2 = ${sig(exp.variance, 4)}`}.`),
      parts,
      ...section(2, 'What the hackers\' statistics find', `This run drew ${sig(100 * (1 - piHat), 3)} % experts (expected ${Math.round(100 * (1 - page.pi))} %); the between part moves with that share, so the table also compares with the drawn share ${m`\hat\pi`}.`),
      table(COMPARE_HEAD, rows, 'cmp'),
      ...section(3, el('span', { html: `Two humps in the ${m`\bar x_j`}` }), 'Each group\'s hackers cluster around their own mean; the curve is a normal approximation per group.'),
      figure(hist), el('div', { class: 'row end' }, [svgButton(hist, 'hw05-E6-means')]),
      el('p', { html: `${evidenceHtml('M')} The diagnostic ratio ${m`F = \widehat{\operatorname{Var}}(\bar x_j)\,/\,(\overline{s^2}/n)`} is ${sig(F, 3)} here and ${sig(Fiid, 3)} for the identical hackers of E5. It is ≈ 1 when the hackers are identical and ≫ 1 when they differ. This is the idea behind one-way ANOVA; turning it into a formal F-test (with its distribution and p-value) is a next step, not done here.` }),
    ],
    rows: [['s2_vs_within', cW], ['s2_vs_total', cT], ['var_of_means', cVx], ['var_of_means_pihat', cVxHat]].map(([k, c]) => ({ statistic: k, ...c })),
    summary: { pi: page.pi, piHat, m: mm, n, seed: run.seed, within: d.within, between: d.between, total: d.variance, F, Fiid },
  };
}

startPage({
  shell: hw05Shell('hackers.html'),
  sticky: STICKY,
  memory: MEMORY,
  preserve: true,
  render: (api) => {
    const { state, update } = api;
    const run = readInputs(state), page = readPage(state);
    dock(run, update, PAGE, page);
    if (run.error) return [rejected(run.error)];
    const redraw = () => api.draw();
    const s5 = { kind: 'hackers', args: { dist: run.spec, m: run.m, n: run.n, seed: run.seed } };
    const s6 = { kind: 'hackers', args: { dist: { id: 'mixture', pi: page.pi }, m: run.m, n: run.n, seed: run.seed, keep: 0 } };
    const g5 = getRun(s5, redraw, 'e5'), g6 = getRun(s6, redraw, 'e6');
    const d = scoreOf(run);
    return [
      labPanel({
        hw: 'hw05', id: 'E5', title: 'E5 · m hackers × n systems', name: `E5-${run.dist}-m${run.m}-n${run.n}-seed${run.seed}`,
        question: `${nice(run.m)} hackers each attack ${run.n} systems, every attempt scoring from ${d.label()}. Do the averages of their sample means and variances land on μ and σ²?`,
        steps: [
          `for each hacker j = 1…${nice(run.m)}, draw ${run.n} scores (seed ${run.seed}) and stream them through Welford: ${m`\bar x_j`}, ${m`s_j^2`}, ${m`\mathrm{SS}_j/n`};`,
          `average across hackers: ${m`\overline{\bar x} = \frac{1}{m}\sum_j \bar x_j`}, ${m`\overline{s^2} = \frac{1}{m}\sum_j s_j^2`};`,
          `compare with ${m`\mu`}, ${m`\sigma^2`} using ${m`\mathrm{SE} = \sigma/\sqrt{nm}`} and ${m`\mathrm{SD}(s^2)/\sqrt{m}`}; compare the spreads of the ${m`\bar x_j`} and ${m`s_j^2`} with ${m`\sigma^2/n`} and ${m`\operatorname{Var}(s^2)`}.`,
        ],
        flag: updatingFlag(g5), waiting: g5.result ? null : pending(g5, s5, redraw),
        view: () => e5View(run, page, g5, update),
        why: 'this is Ex. 2 with samples called hackers. The same unbiasedness that makes the averages hit the truth is what lets a defender pool what many small observations say.',
        notes: [
          `${m`S_n/n`} of HW4 is exactly ${m`\bar x_j`} here, so HW4's law of large numbers is the consistency of ${m`\bar x_j`}. This homework adds its rate, ${m`\sigma/\sqrt{n}`}, and the second estimator ${m`s_j^2`}, whose own spread depends on the tails.`,
          'm is the number of replications (it sharpens the averages across hackers like 1/√m); n is each hacker\'s sample size (it sharpens one hacker\'s estimates like 1/√n). The Effect of n page varies n.',
        ],
      }),
      labPanel({
        hw: 'hw05', id: 'E6', title: 'E6 · When hackers differ: novices and experts', name: `E6-pi${page.pi}-m${run.m}-n${run.n}-seed${run.seed}`,
        question: `If ${Math.round(page.pi * 100)} % of the hackers are novices and the rest experts, what do the averages of their sample means and variances estimate?`,
        steps: [
          `each of ${nice(run.m)} hackers is a novice with probability π = ${page.pi} (scores ${m`10\cdot\mathrm{Beta}(2,5)`}), else an expert (${m`10\cdot\mathrm{Beta}(5,2)`}), for all ${run.n} of their systems;`,
          `Welford per hacker as in E5, then the same averages across hackers;`,
          `compare ${m`\overline{s^2}`} with the within and the total variance, and the spread of the ${m`\bar x_j`} with between + within/n.`,
        ],
        flag: updatingFlag(g6), waiting: g6.result ? null : pending(g6, s6, redraw),
        view: () => e6View(run, page, g6, g5.result),
        why: 'an average of sample variances measures how erratic each hacker is, never how different hackers are from each other. Comparing it with the spread of the sample means is what turns "the averages match the truth" into a check of the assumption that the hackers are alike.',
        notes: [
          `${evidenceHtml('T')} Law of total variance: ${m`\operatorname{Var}X = \mathbb{E}[\operatorname{Var}(X\mid G)] + \operatorname{Var}(\mathbb{E}[X\mid G])`}. For a hacker whose n scores come from one group, ${m`\mathbb{E}\,s_j^2 = \mathbb{E}[v(G)]`} (within only) and ${m`\operatorname{Var}(\bar x_j) = \operatorname{Var}(m(G)) + \mathbb{E}[v(G)]/n`}, which does not vanish as n grows: the between part stays.`,
          `${evidenceHtml('M')} The share of experts drawn is itself random (binomial): with m = ${nice(run.m)} it varies by about ${sig(100 * Math.sqrt(page.pi * (1 - page.pi) / run.m), 2)} percentage points, and the between variance with it. That is why the run is also compared with the drawn share.`,
        ],
      }),
    ];
  },
});
