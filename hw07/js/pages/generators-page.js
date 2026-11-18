/* generators-page.js — dataset D1: randomness as independence of consecutive outputs.
   The method step by step (input → categories → pairs → table → χ² → verdict) with a
   worked example on real outputs; the four generators; the test on each (E5); why the
   linear congruential generator's low bits fail, seen bit by bit, and why its high bits
   are still unsafe; a real case (Coldcard, HW2); how much data a small defect needs (E5b).
   [[Randomness testing by independence]], [[Power of the chi-square test]], note 02 D1. */

import { el, field, pageLink } from '../../../assets/js/ui/dom.js';
import { startPage } from '../../../assets/js/ui/page.js';
import { labPanel, section, table as dataTable } from '../../../assets/js/ui/lab.js';
import { plot } from '../../../assets/js/ui/plot.js';
import { m, M } from '../../../assets/js/ui/math.js';
import { nice, sup } from '../../../assets/js/ui/format.js';
import { show, onCommit, numberOr } from '../../../assets/js/ui/dock.js';
import { SeededRng } from '../../../assets/js/core/rng.js';
import { chiSquare, effectSizes, sampleSize } from '../core/tests.js';
import { lcg, stickyW } from '../core/generators.js';
import { generatorTables, detectionPath, stream, ID } from '../core/experiments.js';
import { pText } from '../core/interpret.js';
import { readInputs, readAlpha, dock, rejected } from './inputs.js';
import { residualGrid, legend, evidenceHtml, abstract, anchor, getRun, pending, updatingFlag, MUTED } from './widgets.js';
import { hw07Shell, PAGES, STICKY, MEMORY } from './shell.js';

const HW = 'hw07', K = 16, DF = (K - 1) ** 2;
const thin = (n) => nice(n);
const link = (href, text) => pageLink(PAGES, href, text);
const T = evidenceHtml('T'), S = evidenceHtml('S');
const hex = (w) => w.toString(16).toUpperCase().padStart(8, '0');

/** The key under a formula (as on the procedure page). */
const symbols = (items) => el('div', { class: 'symbols' }, [
  el('span', { class: 'label', text: 'Symbols' }),
  el('ul', {}, items.map(([tex, text]) => el('li', {}, [el('span', { class: 'sym', html: m`${tex}` }), el('span', { html: text })]))),
]);

/* ---------- this page's row in the dock ---------- */

function readPage(state) {
  const N = Math.round(numberOr(state.N, 10000)), eps = numberOr(state.eps, 0.05);
  const { alpha, error: aErr } = readAlpha(state, 0.01);
  let error = aErr;
  if (!error && !(N >= 100 && N <= 1e6)) error = `the number of pairs must be between 100 and 1 000 000 (got ${N}).`;
  if (!error && !(eps > 0 && eps <= 0.5)) error = `ε must be in (0, 0.5] (got ${eps}).`;
  return { N, eps, alpha, error };
}

const OWN = {
  id: 'generators', label: 'this page',
  build(apply, later) {
    const num = (label, key, step) => { const i = el('input', { type: 'number', class: 'num', step, 'aria-label': label }); onCommit(i, () => apply({ [key]: i.value }), later); return i; };
    const N = num('number of pairs', 'N', 1000), eps = num('stickiness epsilon', 'eps', 0.01), alpha = num('significance level alpha', 'alpha', 0.001);
    return {
      nodes: [el('div', { class: 'row' }, [field('pairs N', N), field('sticky ε', eps), field('α', alpha)])],
      refresh(v) { show(N, v.N); show(eps, v.eps); show(alpha, v.alpha); },
    };
  },
  summary: (v) => `N = ${thin(v.N)} pairs · ε = ${v.eps} · α = ${v.alpha}`,
  notes: [
    '<strong>pairs N</strong>: how many (current, next) pairs each generator is tested on (100 – 1 000 000).',
    '<strong>sticky ε</strong>: the defect of the sticky generator: with probability ε it repeats its previous output.',
    '<strong>α</strong>: the false-alarm rate (default 0.01: generator batteries run many tests, so each one is strict).',
  ],
};

/* ---------- the method ---------- */

function method(inputs) {
  // the first 8 raw outputs of the xoshiro stream used in E5, so the example is the real thing
  const rng = new SeededRng(stream(inputs.seed, ID.fourTables, 0).u32());
  const words = Array.from({ length: 8 }, () => rng.u32());
  const rows = [0, 1, 2, 3].map((k) => {
    const a = words[2 * k], b = words[2 * k + 1], sa = a >>> 28, sb = b >>> 28;
    const w = (x) => el('span', { class: 'mono' }, [el('strong', { class: 'hexkeep', text: hex(x)[0] }), hex(x).slice(1)]);
    return [`pair ${k + 1}`, el('span', {}, [w(a), ' , ', w(b)]), `${sa} , ${sb}`, `+1 in row ${sa}, column ${sb}`];
  });
  return el('div', { class: 'card' }, [
    el('h2', { text: 'The method: is each output independent of the one before?' }),
    el('p', { html: 'A random generator promises that its next output cannot be guessed from the current one. On data that becomes a question this homework can answer with a contingency table: <strong>does the next value depend on the current one?</strong> The method works for any sequence — a generator, dice rolls, the bytes of a key file.' }),
    el('div', { class: 'eq', html: M`\text{random} \iff P(\text{next} = j \mid \text{current} = i) = \tfrac{1}{16} \quad \text{for every } i, j` }),
    el('ol', { class: 'steps method' }, [
      '<strong>Input</strong>: a stream of outputs of the generator, here 32-bit numbers.',
      '<strong>Make categories</strong>: keep the first 4 bits of each number, a value 0 … 15 (the first hexadecimal digit). Any fixed rule works; it must be chosen before looking at the result.',
      '<strong>Make pairs</strong>: (output 1, output 2), (output 3, output 4), …: each pair is (current, next), and each output is used once.',
      '<strong>Count</strong> the pairs in a 16 × 16 table: row = current value, column = next value. N pairs, so about N/256 per square if the generator is good.',
      `<strong>Test</strong>: the χ² test of the ${link('procedure.html', 'procedure')} page, with ${m`\text{df} = (16 - 1)^2 = 225`}.`,
      '<strong>Read the result</strong>: p ≤ α → some pairs come up too often: the next output depends on the current one, the generator <strong>fails</strong>. p > α → no dependence visible with N pairs: it <strong>passes this test</strong> — which is not a proof that it is random (E5b, and the cards below).',
    ].map((h) => el('li', { html: h }))),
    el('h3', { class: 'panel-title', text: 'Steps 1–4 on the first outputs of a real generator (xoshiro, used in E5)' }),
    dataTable(['', 'two outputs (hexadecimal)', 'first 4 bits', 'counted as'], rows, 'words'),
    el('p', { class: 'small muted', text: 'The kept digit is in bold: the first hexadecimal digit is exactly the first 4 bits. E5 does this for 10 000 pairs (2 × 10 000 outputs) per generator.' }),
  ]);
}

/* ---------- the four generators ---------- */

const NAMES = {
  good: ['xoshiro128**', 'a modern generator'],
  lcgLow: ['LCG, low 4 bits', 'the LCG, last 4 bits of each number'],
  lcgHigh: ['LCG, high 4 bits', 'the same LCG, first 4 bits'],
  sticky: ['sticky', 'repeats its last output with probability ε'],
};

function generators(page) {
  return el('div', { class: 'card' }, [
    el('h2', { text: 'The four generators under test' }),
    dataTable(['generator', 'how it makes the next number', 'why it is here'], [
      ['xoshiro128**', 'a modern non-cryptographic generator (xor, shift, rotate on a 128-bit state)', 'the good reference: it should pass'],
      ['linear congruential generator (LCG), low 4 bits', el('span', { html: `${m`x_{n+1} = (a\,x_n + c) \ \text{mod}\ 2^{32}`} with ${m`a = 1664525`}, ${m`c = 1013904223`}; we keep the <em>last</em> 4 bits` }), 'the textbook generator of old libraries; it should fail'],
      ['the same LCG, high 4 bits', 'the same numbers; we keep the <em>first</em> 4 bits', 'passes the test, yet is predictable'],
      [`sticky (ε = ${page.eps})`, 'like xoshiro, but with probability ε it repeats its last output', 'a small, controllable defect: how much data to catch it?'],
    ].map((r) => r.map((c) => (typeof c === 'string' ? el('span', { html: c }) : c))), 'words prose wrap'),
    symbols([
      ['x_n', 'the n-th number of the LCG, a 32-bit integer'],
      ['\\text{mod}\\ 2^{32}', 'keep the remainder after dividing by 2³²: the last 32 bits (what a 32-bit processor does anyway)'],
      ['a,\\ c', 'two fixed constants (these are the “Numerical Recipes” ones)'],
    ]),
  ]);
}

/* ---------- E5 · four generators ---------- */

function e5(page, inputs) {
  const runs = generatorTables({ seed: inputs.seed, N: page.N, eps: page.eps }).map(({ kind, table }) => {
    const x = chiSquare(table);
    return { kind, table, x, V: effectSizes(x).cramerV, pass: x.p > page.alpha };
  });
  const by = Object.fromEntries(runs.map((r) => [r.kind, r]));
  const blocks = runs.map(({ kind, table, x, V, pass }) => el('div', {}, [
    el('h3', { class: 'panel-title', text: NAMES[kind][0] + (kind === 'sticky' ? ` (ε = ${page.eps})` : '') }),
    el('p', { class: 'small muted', text: NAMES[kind][1] }),
    residualGrid({ table, label: `residuals of the pair table of ${NAMES[kind][0]}` }),
    el('ul', { class: 'facts' }, [
      ['χ²', `${x.chi2 >= 1e4 ? thin(Math.round(x.chi2)) : x.chi2.toFixed(1)} (df ${x.df})`], ['p', pText(x)], ['V', V.toFixed(3)],
    ].map(([k, v]) => el('li', {}, [el('span', { class: 'k', text: k }), el('span', { text: v })]))),
    el('p', { class: pass ? 'ok' : 'err', text: pass ? '✓ passes' : '✗ fails' }),
  ]));
  const low = by.lcgLow, used = low.table.O.reduce((s, o) => s + (o > 0 ? 1 : 0), 0);
  const per = page.N / 256;
  return labPanel({
    hw: HW, id: 'E5', title: 'E5 · Four generators, one test', name: `E5-N${page.N}-seed${inputs.seed}`,
    question: `Does each generator’s next output depend on the current one? ${thin(page.N)} pairs each.`,
    steps: [
      `each grid is the 16 × 16 table of step 4: row = current value (top to bottom 0 … 15), column = next value (left to right); every square is one (current, next) combination;`,
      `a good generator puts about ${per >= 10 ? Math.round(per) : per.toFixed(1)} pairs in every square; <strong>orange</strong> = more pairs than that, <strong>blue</strong> = fewer, pale = about right (hover a square for its count);`,
      `a scattered, pale pattern is chance; a <em>structure</em> (a line, a few bright squares) is dependence. Under each grid: χ², p, V and the verdict at α = ${page.alpha}.`,
    ],
    view: () => ({
      answer: { text: `${runs.filter((r) => !r.pass).length} of 4 fail. The LCG’s low bits use only <strong>${used} of 256</strong> squares (χ² = ${thin(Math.round(low.x.chi2))}, V = 1: the next output is fixed by the current one); the sticky generator shows a diagonal, its repeats (p = ${pText(by.sticky.x)}). xoshiro and the LCG’s high bits pass (p = ${pText(by.good.x)} and ${pText(by.lcgHigh.x)}).` },
      body: [el('div', { class: 'gen-grid' }, blocks), legend([['bar', 'var(--m2)', 'more pairs than expected'], ['bar', 'var(--m1)', 'fewer pairs than expected']]),
        el('p', { class: 'small muted', text: 'Colour saturates at a residual of ±4. For the LCG’s low bits, the rows and columns that never occur are left out of the test (8 × 8 table, df 49).' })],
      rows: runs.map(({ kind, x, V, pass }) => ({ generator: kind, chi2: x.chi2, df: x.df, p: x.p, log10p: x.log10p, V, pass })),
      summary: { N: page.N, eps: page.eps, alpha: page.alpha, seed: inputs.seed },
    }),
    why: 'independence of consecutive outputs is what a random generator promises; the test finds the generators that break that promise in a visible way.',
  });
}

/* ---------- the LCG, bit by bit ---------- */

/** The first 4 and the last 4 bits of each output: one column per output (left to right), one
 *  row per bit, a dark square is a 1. With `periods`, the repeat length of each of the last 4
 *  bits is written at the right of its row. */
function bitPlane(words, label, periods = false) {
  const rows = [31, 30, 29, 28, null, 3, 2, 1, 0];
  const n = words.length, c = 12, padL = 112, padR = 132, gapH = 22, padT = 22, sep = periods ? 6 : 0;   // sep: room for the boxes
  const yOf = (r) => padT + (r < 4 ? r * c : 4 * c + gapH + (r - 5) * (c + sep));
  const W = padL + n * c + padR, H = padT + 8 * c + 3 * sep + gapH + 26 + (periods ? 18 : 0);
  const NS = 'http://www.w3.org/2000/svg';
  const nd = (tag, attrs = {}, text = null) => { const e = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); if (text !== null) e.textContent = text; return e; };
  const svg = nd('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', class: 'bitplane', 'aria-label': label });
  rows.forEach((b, r) => {
    if (b === null) return;
    const y = yOf(r);
    words.forEach((w, j) => {
      const one = (w >>> b) & 1;
      svg.append(nd('rect', { x: padL + j * c, y, width: c - 1, height: c - 1, class: one ? 'one' : 'zero' }));
      if (j === 0) svg.append(nd('text', { x: padL + c / 2 - 0.5, y: y + c - 3, 'text-anchor': 'middle', class: `digit ${one ? 'on' : 'off'}` }, String(one)));
    });
    if (periods && b < 4) {
      // the first block of the repeating pattern (solid) and its first repetition (dashed)
      const P = 2 ** (b + 1);
      svg.append(nd('rect', { x: padL - 1.5, y: y - 2, width: P * c + 1, height: c + 3, class: 'blk first' }));
      if (2 * P <= n) svg.append(nd('rect', { x: padL + P * c - 0.5, y: y - 2, width: P * c, height: c + 3, class: 'blk again' }));
      svg.append(nd('text', { x: padL + n * c + 6, y: y + c - 2, class: 'tick' }, `repeats every ${P}`));
    }
  });
  // the two groups of rows, named on the left
  const group = (r0, r1, l1, l2) => {
    const y0 = yOf(r0), y1 = yOf(r1) + c;
    svg.append(nd('line', { x1: padL - 6, x2: padL - 6, y1: y0, y2: y1, class: 'grp' }));
    svg.append(nd('text', { x: padL - 10, y: (y0 + y1) / 2 - 2, 'text-anchor': 'end', class: 'tick grp-t' }, l1));
    svg.append(nd('text', { x: padL - 10, y: (y0 + y1) / 2 + 10, 'text-anchor': 'end', class: 'tick' }, l2));
  };
  group(0, 3, 'first 4 bits', 'of each output');
  group(5, 8, 'last 4 bits', 'of each output');
  svg.append(nd('text', { x: padL + n * c, y: yOf(4) + 14, 'text-anchor': 'end', class: 'tick muted-tick' }, '(the 24 bits in between are not drawn)'));
  if (periods) {
    // all four last bits together: one block of 16 outputs, then the same block again
    const y0 = yOf(5) - 5, h = yOf(8) + c + 5 - y0;
    svg.append(nd('rect', { x: padL - 3, y: y0, width: 16 * c + 4, height: h, class: 'grp16' }));
    svg.append(nd('rect', { x: padL + 16 * c + 1, y: y0, width: 16 * c - 2, height: h, class: 'grp16 again' }));
    svg.append(nd('text', { x: padL, y: y0 + h + 14, class: 'tick grp16-t' }, 'together, the last 4 bits repeat every 16 outputs: the dashed block is the solid one again'));
  }
  svg.append(nd('rect', { x: padL - 2.5, y: yOf(0) - 3, width: c + 3, height: 4 * c + 5, class: 'col1' }));
  svg.append(nd('rect', { x: padL - 2.5, y: yOf(5) - 3, width: c + 3, height: yOf(8) + c - yOf(5) + 5, class: 'col1' }));
  svg.append(nd('text', { x: padL - 2, y: 12, class: 'tick col1-t' }, '↓ output 1 = one column'));
  svg.append(nd('text', { x: padL + n * c, y: 12, 'text-anchor': 'end', class: 'tick' }, 'each square = 1 bit · filled = 1, faint = 0'));
  svg.append(nd('text', { x: padL + (n * c) / 2, y: H - 6, 'text-anchor': 'middle', class: 'tick' }, `outputs 1 … ${n} →`));
  const wrap = document.createElement('div');
  wrap.className = 'chart';
  wrap.append(svg);
  return wrap;
}

function lcgCard(inputs) {
  const g = lcg(inputs.seed), lw = Array.from({ length: 48 }, () => g());
  const rng = new SeededRng(stream(inputs.seed, ID.fourTables, 0).u32()), xw = Array.from({ length: 48 }, () => rng.u32());
  const a = 1664525 & 15, c = 1013904223 & 15;
  return el('div', { class: 'card' }, [
    el('h2', { text: 'The linear congruential generator: why the last bits fail, and why the first bits are not safe either' }),
    el('p', { class: 'small', html: '<strong>LCG</strong>, 48 outputs' }),
    bitPlane(lw, 'the first and last 4 bits of 48 outputs of the linear congruential generator: the last 4 bits repeat every 16 outputs', true),
    el('p', { class: 'small', html: '<strong>xoshiro</strong>, 48 outputs, for comparison' }),
    bitPlane(xw, 'the first and last 4 bits of 48 outputs of xoshiro: no pattern'),
    el('div', { class: 'cols' }, [
      el('div', {}, [
        el('h3', { class: 'panel-title', text: 'Why the last 4 bits fail' }),
        el('p', { html: `${T} The last 4 bits of ${m`a x + c`} depend only on the last 4 bits of ${m`a`}, ${m`x`} and ${m`c`} (as the last digit of a product depends only on the last digits). So they follow their own tiny generator, with only 16 states:` }),
        el('div', { class: 'eq', html: M`y_{n+1} = (${a}\, y_n + ${c}) \ \text{mod}\ 16` }),
        el('p', { class: 'small', text: 'Each value fixes the next, and after 16 outputs everything repeats: in the pair table only 8 different pairs ever occur — the 8 orange squares of E5.' }),
      ]),
      el('div', {}, [
        el('h3', { class: 'panel-title', text: 'Why the first 4 bits pass, and are still predictable' }),
        el('p', { html: `They collect carries from all the lower bits, so their pairs look independent and pass the test. Yet the whole generator is one 32-bit number ${m`x_n`}, and each output shows 4 of its bits: <strong>8 outputs carry the 32 bits of the state</strong> ${T}. Trying the ${m`2^{28}`} possible hidden bits behind the first output (about 270 million, a short job for a computer) and keeping the one that reproduces the next outputs reveals ${m`x_n`} — and every future output.` }),
        el('p', { class: 'small', text: 'A test asks “does it look random?”; cryptography asks “can anyone predict it?”.' }),
      ]),
    ]),
  ]);
}

/* ---------- a real case ---------- */

function coldcard() {
  return el('div', { class: 'card' }, [
    el('h2', { text: 'A real case: Coldcard (2021–2026)' }),
    el('p', { html: `${S} For five years, Coldcard hardware wallets generated their seeds not from the chip’s hardware random generator but from a small deterministic generator, started from a chip-ID word and a timer value. Its output passed the statistical tests — and was hashed, which makes even weak output look perfect — yet once the chip-ID word was known only the timer value remained unknown — about 80 000 possibilities, some 16 bits — so the seeds could be enumerated. Thefts began in July 2026 (about 1 400–2 000 BTC reported).` }),
    el('p', { html: 'The lesson of this page in one incident: a test of independence catches generators with a <em>visible</em> pattern (the LCG’s last bits); it cannot certify that a generator is <em>unpredictable</em>. For keys, what matters is where the randomness comes from.' }),
    el('p', { html: '<a href="../hw02/incidents.html">HW2 · Incidents: the Coldcard case study →</a> the bug in four code excerpts, and why nobody noticed for five years.' }),
  ]);
}

/* ---------- E5b · how much data ---------- */

function detection(page, inputs, redraw) {
  const N80 = sampleSize({ df: DF, w: stickyW(page.eps, K), alpha: page.alpha }).n;
  const Nmax = Math.max(1000, Math.min(1e6, 10 * N80));
  const sticky = detectionPath({ kind: 'sticky', seed: inputs.seed, eps: page.eps, Nmax });
  const good = detectionPath({ kind: 'good', seed: inputs.seed, Nmax });
  const la = Math.log10(page.alpha);
  let last = 0;
  for (const [n, l] of sticky) if (l > la) last = n;
  const caught = sticky.at(-1)[1] <= la ? (sticky.find(([n]) => n > last)?.[0] ?? null) : null;
  const ymin = -15;
  const chart = plot({
    x: { min: 100, max: Nmax, log: true, title: 'pairs counted so far' },
    y: { min: ymin, max: 0, ticks: [0, -5, -10, -15], format: (v) => (v === 0 ? '1' : `10${sup(v)}`), title: 'p-value (log scale)' }, width: 520, height: 250,
    layers: [
      { type: 'shade', y0: ymin, y1: la, color: 'var(--m2)' },
      { type: 'hline', at: la, dash: true, color: MUTED, text: `α = ${page.alpha}` },
      { type: 'vline', at: N80, dash: true, color: 'var(--s2)' },
      { type: 'line', points: good, color: 'var(--s1)' },
      { type: 'line', points: sticky, color: 'var(--s2)' },
    ],
    label: `the p-value of the test against the number of pairs, for the sticky generator (epsilon ${page.eps}) and xoshiro`,
  });

  const spec = { kind: 'stickyPowerTable', args: { alpha: page.alpha, seed: inputs.seed } };
  const got = getRun(spec, redraw, 'power');
  const table = got.result
    ? dataTable(['ε', 'pairs needed', 'found (simulated)'], got.result.rows.map((r) => [String(r.eps), thin(r.N), `${(100 * r.power).toFixed(0)} %`]))
    : pending(got, spec, redraw);

  return labPanel({
    hw: HW, id: 'E5b', title: 'E5b · How much data does a small defect need?', name: `E5b-eps${page.eps}-seed${inputs.seed}`,
    question: `The sticky generator repeats its output only ${(100 * page.eps).toFixed(0)} % of the time. How many pairs must the test count before it notices?`,
    steps: [
      'we run the method on one long stream, and after every few pairs recompute p: x-axis = pairs counted so far, y-axis = p (both on a log scale);',
      'inside the tinted band, below the α line, the test rejects: the defect is <strong>detected</strong>;',
      'orange line: the sticky generator; teal: xoshiro. The dashed orange line is where the power formula promises detection 80 % of the time.',
    ],
    flag: updatingFlag(got),
    view: () => ({
      answer: { text: caught
        ? `The sticky generator stays detected from about <strong>${thin(caught)} pairs</strong> on (the formula promises 80 % detection at ${thin(N80)}); xoshiro never enters the band. Half the defect needs four times the pairs.`
        : `Up to ${thin(Nmax)} pairs the sticky generator is not detected for good on this seed (the formula promises 80 % detection at ${thin(N80)}).` },
      body: [el('div', { class: 'cols wide-first' }, [
        el('div', {}, [chart, legend([['line', 'var(--s2)', `sticky, ε = ${page.eps}`], ['line', 'var(--s1)', 'xoshiro (good)'], ['dash', MUTED, `α = ${page.alpha}`], ['dash', 'var(--s2)', `80 % detection by formula: ${thin(N80)} pairs`]]),
          el('p', { class: 'small muted', text: 'Below 10⁻¹⁵ the curve leaves the chart.' })]),
        el('div', {}, [...section(1, 'Pairs needed, formula and simulation', `For 80 % detection at α = ${page.alpha}; the simulation runs each case 500 times.`), table,
          el('p', { class: 'small muted', text: 'The simulation lands close to 80 % (75–81 %); for the larger ε, with few pairs per square, the formula is slightly optimistic.' })]),
      ])],
      rows: sticky.map(([n, l], i) => ({ N: n, log10pSticky: l, log10pGood: good[i][1] })),
      summary: { eps: page.eps, alpha: page.alpha, N80, caughtFrom: caught, power: got.result?.rows ?? null },
    }),
    why: 'a generator that passes may only pass because the test saw too little data. The data needed grows like 1/ε²: a defect ten times smaller needs a hundred times more pairs.',
  });
}

startPage({
  shell: hw07Shell('generators.html'),
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
        question: 'A random generator promises that each output is independent of the one before. Can a χ² test on consecutive pairs tell good generators from bad ones — and what can it not tell?',
        findings: [
          '<strong>A method for any sequence</strong>: cut each output to a category, pair each output with the next, count the pairs in a table, run the χ² test; p ≤ α means the next output depends on the current one.',
          '<strong>Two generators fail at once.</strong> The last 4 bits of a textbook linear congruential generator (LCG) fill only 8 of 256 squares (χ² = 70 000, V = 1); a generator that repeats itself 5 % of the time shows a diagonal (p ≈ 10⁻³⁸ with 10 000 pairs).',
          '<strong>Passing is not safety.</strong> The LCG’s first 4 bits pass, yet 8 outputs reveal its whole 32-bit state; the Coldcard wallets (2021–2026) passed the tests and were still guessable.',
          '<strong>Small defects need lots of data</strong>: about 2 000 pairs to catch ε = 0.05 with 80 % chance, 50 000 for ε = 0.01.',
        ],
        sections: [['method', 'The method'], ['four', 'The four generators'], ['E5', 'E5 · the test'], ['lcg', 'The LCG, bit by bit'], ['coldcard', 'A real case'], ['E5b', 'E5b · how much data']],
      }),
      anchor('method', method(inputs)), anchor('four', generators(page)), anchor('E5', e5(page, inputs)),
      anchor('lcg', lcgCard(inputs)), anchor('coldcard', coldcard()), anchor('E5b', detection(page, inputs, redraw)),
    ];
  },
});
