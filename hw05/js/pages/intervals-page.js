/* intervals-page.js — E8: do 95 % intervals contain the truth 95 % of the
   time? For four distributions and n from 5 to 300, the coverage of the
   t-interval for μ and of the χ² interval for σ², with Wilson intervals; the
   χ² interval's limit set by the kurtosis; and the first 50 intervals drawn.
   The coverage grid runs in the Web Worker (coverageGrid); this file draws. */

import { el, field, explain } from '../../../assets/js/ui/dom.js';
import { startPage } from '../../../assets/js/ui/page.js';
import { labPanel, section, table } from '../../../assets/js/ui/lab.js';
import { plot } from '../../../assets/js/ui/plot.js';
import { nice } from '../../../assets/js/ui/format.js';
import { show } from '../../../assets/js/ui/dock.js';
import { m, M } from '../../../assets/js/ui/math.js';
import { wilson } from '../../../assets/js/core/stats.js';
import { ex2Dist, EX2 } from '../core/dists.js';
import { chi2CoverageLimit } from '../core/theory.js';
import { readInputs, dock, rejected } from './inputs.js';
import { THEORY, MUTED, legend, evidenceHtml, figure, svgButton, sig, getRun, pending, updatingFlag } from './widgets.js';
import { hw05Shell, STICKY, MEMORY } from './shell.js';

const NS = [5, 10, 30, 100, 300];
const LEVELS = [0.8, 0.9, 0.95, 0.99];
const R_CHOICES = [2000, 20000, 100000];
const NAMES = { normal: 'N(0, 1)', exp: 'Exp(1)', unif01: 'U(0, 1)', score: 'score' };
const COLORS = { normal: 'var(--m1)', exp: 'var(--m2)', unif01: 'var(--m3)', score: 'var(--m4)' };

/* ---------- page state ---------- */

function readPage(state) {
  const level = LEVELS.includes(Number(state.level)) ? Number(state.level) : 0.95;
  const R = R_CHOICES.includes(Number(state.R)) ? Number(state.R) : 20000;
  const show = EX2.includes(state.show) ? state.show : 'exp';
  const sn = NS.includes(Number(state.sn)) ? Number(state.sn) : 10;
  return { level, R, show, sn };
}

const PAGE = {
  id: 'intervals', label: 'this page',
  build(apply) {
    const level = el('select', { 'aria-label': 'confidence level', onchange: (e) => apply({ level: e.target.value }) }, LEVELS.map((v) => el('option', { value: v, text: `${Math.round(v * 100)} %` })));
    const R = el('select', { 'aria-label': 'samples R per cell', onchange: (e) => apply({ R: e.target.value }) }, R_CHOICES.map((v) => el('option', { value: v, text: nice(v) })));
    const showD = el('select', { 'aria-label': 'distribution of the intervals drawn', onchange: (e) => apply({ show: e.target.value }) }, EX2.map((id) => el('option', { value: id, text: NAMES[id] })));
    const sn = el('select', { 'aria-label': 'n of the intervals drawn', onchange: (e) => apply({ sn: e.target.value }) }, NS.map((v) => el('option', { value: v, text: String(v) })));
    return {
      nodes: [el('div', { class: 'row' }, [field('level', level), field('samples R', R), el('div', { class: 'vrule' }), field('drawn: distribution', showD), field('drawn: n', sn)])],
      refresh(v) { show(level, v.level); show(R, v.R); show(showD, v.show); show(sn, v.sn); },
    };
  },
  summary: (v) => `level ${Math.round(v.level * 100)} % · R = ${nice(v.R)} per cell · drawn: ${NAMES[v.show]}, n = ${v.sn}`,
  notes: [
    '<strong>level</strong>: the promised coverage 1 − α of every interval. <strong>R</strong>: how many samples are drawn for each distribution and n (the coverage is the fraction of their intervals that contain the truth; its Wilson interval shrinks like 1/√R). 4 × 5 cells of R samples each.',
    '<strong>drawn</strong>: which distribution and n the "intervals at work" panel shows, 50 intervals of each kind.',
  ],
};

const distOf = (id, run) => ex2Dist(id, { dist: run.dist, p: run.p, a: run.a, b: run.b });
const nameOf = (id, run) => (id === 'score' ? distOf(id, run).label() : NAMES[id]);

/* ---------- 1. coverage against n ---------- */

function coveragePlots(run, page, res) {
  const z = 1.96;
  const layers = (kind) => EX2.flatMap((id) => {
    const cells = NS.map((n) => res.cells[id][n]), hits = cells.map((c) => (kind === 't' ? c.tHits : c.chiHits));
    const pts = NS.map((n, i) => [n, hits[i] / res.R]);
    const err = NS.map((n, i) => { const [lo, hi] = wilson(hits[i], res.R, z); return [n, lo, hi]; });
    const out = [
      { type: 'line', points: pts, color: COLORS[id], thin: true, label: nameOf(id, run), end: id === 'score' ? 'score' : NAMES[id], hover: false },
      { type: 'points', points: pts, err, color: COLORS[id], r: 3.2, label: nameOf(id, run) },
    ];
    if (kind === 'chi') out.unshift({ type: 'hline', at: chi2CoverageLimit(distOf(id, run).exKurtosis, page.level), color: COLORS[id], dash: '4 4' });
    return out;
  });
  const yMin = (kind) => Math.min(page.level - 0.05, ...EX2.flatMap((id) => NS.map((n) => (kind === 't' ? res.cells[id][n].tHits : res.cells[id][n].chiHits) / res.R))) - 0.01;
  const mk = (kind, title) => plot({
    x: { log: true, min: 4, max: 360, title: 'n (sample size)', ticks: NS }, y: { min: yMin(kind), max: 1, title }, width: 500, height: 270,
    layers: [{ type: 'hline', at: page.level, color: 'var(--ink)', dash: false, text: `nominal ${Math.round(page.level * 100)} %`, anchor: 'start' }, ...layers(kind)],
    label: `coverage of the ${kind === 't' ? 't-interval for the mean' : 'chi-squared interval for the variance'} against n for four distributions`,
  });
  return [mk('t', 'coverage of the t-interval for μ'), mk('chi', 'coverage of the χ² interval for σ²')];
}

function coverageTables(run, page, res) {
  const cell = (hits) => {
    const [lo, hi] = wilson(hits, res.R, 1.96), p = hits / res.R;
    return el('span', { class: hi < page.level - 1e-12 || lo > page.level + 1e-12 ? 'off' : null, html: `${p.toFixed(3)}<br><span class="ci">${lo.toFixed(3)}–${hi.toFixed(3)}</span>` });
  };
  const rowsT = EX2.map((id) => [nameOf(id, run), ...NS.map((n) => cell(res.cells[id][n].tHits))]);
  const rowsC = EX2.map((id) => [nameOf(id, run), ...NS.map((n) => cell(res.cells[id][n].chiHits)), sig(chi2CoverageLimit(distOf(id, run).exKurtosis, page.level), 4)]);
  return [
    el('h4', { html: `t-interval for ${m`\mu`} (95 % Wilson interval of each coverage)` }),
    table(['distribution', ...NS.map((n) => `n = ${n}`)], rowsT, 'cov'),
    el('h4', { html: `χ² interval for ${m`\sigma^2`}, and its limit as ${m`n \to \infty`}` }),
    table(['distribution', ...NS.map((n) => `n = ${n}`), 'limit'], rowsC, 'cov'),
    el('p', { class: 'small muted', html: 'Under each coverage, its 95 % Wilson interval. In italics: a coverage whose interval does not contain the nominal level. With 20 cells, about one such cell is expected by chance even where the promise holds; a whole row in italics is the real signal.' }),
  ];
}

/* ---------- 2. intervals at work ---------- */

function atWork(run, page, res) {
  const id = page.show, n = page.sn, c = res.cells[id][n], d = distOf(id, run);
  const mk = (kept, truth, title, sym) => {
    const hit = kept.map((k, i) => [i + 1, (k[0] + k[1]) / 2, k[0], k[1], k[2]]);
    const lo = Math.min(...kept.map((k) => k[0])), hi = Math.max(...kept.map((k) => k[1]));
    const pad = (hi - lo) * 0.05;
    return plot({
      x: { min: 0, max: kept.length + 1, title: 'sample' }, y: { min: Math.max(sym === 'σ²' ? 0 : -Infinity, lo - pad), max: hi + pad, title }, width: 500, height: 250,
      layers: [
        { type: 'hline', at: truth, color: THEORY, dash: false, text: `true ${sym}`, anchor: 'start' },
        { type: 'points', points: hit.filter((h) => h[4]).map((h) => [h[0], h[1]]), err: hit.filter((h) => h[4]).map((h) => [h[0], h[2], h[3]]), color: MUTED, r: 1.6, label: 'contains the truth' },
        { type: 'points', points: hit.filter((h) => !h[4]).map((h) => [h[0], h[1]]), err: hit.filter((h) => !h[4]).map((h) => [h[0], h[2], h[3]]), color: 'var(--m2)', r: 3, label: 'misses' },
      ],
      label: `the first ${kept.length} ${title} drawn as vertical segments around the true ${sym}, misses highlighted`,
    });
  };
  const missT = c.tKept.filter((k) => !k[2]).length, missC = c.chiKept.filter((k) => !k[2]).length;
  const a = mk(c.tKept, d.mean, 't-intervals for μ', 'μ'), b = mk(c.chiKept, d.variance, 'χ² intervals for σ²', 'σ²');
  return [
    ...section(3, 'Intervals at work', `The first ${c.tKept.length} samples of ${nameOf(id, run)} at ${m`n = ${n}`}: each segment is one computed interval. Grey ones contain the truth, orange ones miss: here ${missT} of ${c.tKept.length} t-intervals and ${missC} of ${c.chiKept.length} χ² intervals miss (expected about ${sig((1 - page.level) * c.tKept.length, 2)} each if the promise held). Choose another distribution or n in the dock.`),
    el('div', { class: 'cols' }, [figure(a), figure(b)]),
    el('div', { class: 'row end' }, [svgButton(a, 'hw05-E8-t'), svgButton(b, 'hw05-E8-chi')]),
    legend([['dot', MUTED, 'contains the truth'], ['dot', 'var(--m2)', 'misses'], ['line', THEORY, 'true value']]),
  ];
}

startPage({
  shell: hw05Shell('intervals.html'),
  sticky: STICKY,
  memory: MEMORY,
  preserve: true,
  render: (api) => {
    const { state, update } = api;
    const run = readInputs(state), page = readPage(state);
    dock(run, update, PAGE, page);
    if (run.error) return [rejected(run.error)];
    const redraw = () => api.draw();
    const spec = { kind: 'coverageGrid', args: { dists: EX2.map((id) => ({ key: id, spec: id === 'score' ? run.spec : { id } })), ns: NS, R: page.R, level: page.level, seed: run.seed } };
    const got = getRun(spec, redraw, 'grid');
    const pct = `${Math.round(page.level * 100)} %`;
    return [
      labPanel({
        hw: 'hw05', id: 'E8', title: `E8 · Do ${pct} intervals contain the truth ${pct} of the time?`, name: `E8-level${page.level}-R${page.R}-seed${run.seed}`,
        question: `For each of four distributions and n from 5 to 300, build the ${pct} t-interval for μ and χ² interval for σ² from many samples: what fraction of them contain the true value?`,
        steps: [
          `for each distribution and each ${m`n \in \{${NS.join(', ')}\}`}, draw R = ${nice(page.R)} samples (seed ${run.seed}) and run Welford on each;`,
          `build the ${pct} intervals of the normal theory, shown below: ${m`\bar x \pm t\,s/\sqrt{n}`} for ${m`\mu`} and the χ² interval for ${m`\sigma^2`};`,
          `count the samples whose interval contains the true ${m`\mu`} (or ${m`\sigma^2`}); that fraction is the coverage, with a 95 % Wilson interval.`,
        ],
        flag: updatingFlag(got), waiting: got.result ? null : pending(got, spec, redraw),
        view: () => {
          const res = got.result;
          const [pt, pc] = coveragePlots(run, page, res);
          const cov = (id, n, k) => res.cells[id][n][k] / res.R;
          const big = NS.at(-1);
          const tRange = EX2.map((id) => cov(id, big, 'tHits'));
          const exp = EX2.map((id) => [id, cov(id, big, 'chiHits'), chi2CoverageLimit(distOf(id, run).exKurtosis, page.level)]);
          return {
            answer: {
              text: `At n = ${big} the t-interval covers ${sig(Math.min(...tRange), 3)}–${sig(Math.max(...tRange), 3)} for all four shapes (nominal ${page.level}): it recovers as n grows. The χ² interval does not: at n = ${big} it covers ${exp.map(([id, c, l]) => `${sig(c, 3)} for ${id === 'score' ? 'the score' : NAMES[id]} (limit ${sig(l, 3)})`).join(', ')}. Heavy tails make it overconfident, light tails over-cautious, and more data does not fix either.`,
              ok: false,
            },
            body: [
              el('div', { html: M`\bar x \pm t_{n-1,\,1-\alpha/2}\,\frac{s}{\sqrt{n}} \qquad\qquad \left[\frac{(n-1)s^2}{\chi^2_{n-1,\,1-\alpha/2}},\ \frac{(n-1)s^2}{\chi^2_{n-1,\,\alpha/2}}\right]` }),
              ...section(1, 'Coverage against n', `Each point is a coverage with its 95 % Wilson interval; the black line is the promise. Left: the t-interval, which approaches the promise for every shape (CLT). Right: the χ² interval, which approaches the dashed line of its own distribution, ${m`2\Phi\!\left(z_{1-\alpha/2}\sqrt{2/(2+\kappa)}\right) - 1`}, not the promise.`),
              el('div', { class: 'cols' }, [figure(pt), figure(pc)]),
              el('div', { class: 'row end' }, [svgButton(pt, 'hw05-E8-coverage-t'), svgButton(pc, 'hw05-E8-coverage-chi')]),
              legend(EX2.map((id) => ['line', COLORS[id], nameOf(id, run)]).concat([['dash', MUTED, 'χ² limit (in each colour)']])),
              ...section(2, 'The numbers', 'Coverage and its Wilson interval for every cell.'),
              ...coverageTables(run, page, res),
              ...atWork(run, page, res),
            ],
            rows: EX2.flatMap((id) => NS.map((n) => ({ distribution: nameOf(id, run), n, R: res.R, level: page.level, t: cov(id, n, 'tHits'), chi2: cov(id, n, 'chiHits'), chi2Limit: chi2CoverageLimit(distOf(id, run).exKurtosis, page.level) }))),
            summary: { level: page.level, R: res.R, seed: run.seed },
          };
        },
        why: `"95 % confident" is a promise about a procedure, and it can be checked: here it is kept for the mean and broken for the variance. A security report saying "the variance of response times is in [a, b] with 95 % confidence", from heavy-tailed timings, may be badly overconfident — at any sample size.`,
        notes: [
          `${evidenceHtml('T')} For normal data both intervals are exact: ${m`(\bar x - \mu)/(s/\sqrt{n}) \sim t_{n-1}`} and ${m`(n-1)s^2/\sigma^2 \sim \chi^2_{n-1}`} (Student, Cochran). For other data the t-interval is still right in the limit (CLT plus Slutsky), because only the mean's distribution matters and it becomes normal.`,
          `${evidenceHtml('T')} The χ² interval is built for a normal spread of ${m`s^2`}, ${m`2\sigma^4/n`}, while the true spread is ${m`(2+\kappa)\sigma^4/n`}. So its coverage tends to ${m`P(|N(0, 2+\kappa)| \le z\sqrt{2})`}: below the promise when ${m`\kappa > 0`} (Exp(1): 0.673 at 95 %), above it when ${m`\kappa < 0`} (U(0, 1): 0.998). Robust alternatives (bootstrap, or an asymptotic interval with the estimated kurtosis) are a next step.`,
          `"95 %" describes the procedure, not one computed interval: once computed, an interval contains the truth or it does not. That is why the coverage is measured by counting over many samples, and why the drawn intervals show hits and misses rather than probabilities.`,
        ],
      }),
    ];
  },
});
